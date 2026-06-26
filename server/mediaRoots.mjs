import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeAbsolutePath(value) {
  const rawPath = typeof value === "string" ? value.trim() : "";
  return rawPath && path.isAbsolute(rawPath) ? path.resolve(rawPath) : "";
}

export function normalizeMediaRoots(config) {
  const roots = Array.isArray(config?.media?.roots) ? config.media.roots : [];
  return roots
    .map((root) => {
      const id = typeof root?.id === "string" ? root.id.trim() : "";
      const rawPath = typeof root?.path === "string" ? root.path.trim() : "";
      const rootPath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : rawPath;
      if (!id || !rootPath || !/^[A-Za-z0-9._~-]{1,80}$/.test(id)) return null;
      const basename = path.isAbsolute(rootPath) ? path.basename(rootPath) : rootPath;
      const localPath = normalizeAbsolutePath(root?.localPath);
      return {
        id,
        label: typeof root?.label === "string" && root.label.trim() ? root.label.trim() : basename,
        path: rootPath,
        basename,
        source: root?.source === "browser" ? "browser" : "local",
        ...(localPath ? { localPath } : {}),
      };
    })
    .filter(Boolean);
}

function createMediaRootId(rootPath, existingRoots) {
  const slug =
    String((path.isAbsolute(rootPath) ? path.basename(rootPath) : rootPath) || "media")
      .trim()
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42)
      .toLowerCase() || "media";
  const suffix = hashValue(rootPath).slice(0, 10);
  let id = `${slug}-${suffix}`;
  let index = 2;
  const existingIds = new Set(existingRoots.map((root) => root.id));
  while (existingIds.has(id)) {
    id = `${slug}-${suffix}-${index}`;
    index += 1;
  }
  return id;
}

export async function upsertMediaRoot(configPath, payload) {
  const label = typeof payload?.label === "string" ? payload.label.trim() : "";
  const rawPath = typeof payload?.path === "string" ? payload.path.trim() : "";
  const source = payload?.source === "browser" ? "browser" : "local";
  if (!label) throw new Error("Media library name is required.");
  if (!rawPath) throw new Error("Media library path is required.");

  const rootPath = source === "browser" ? rawPath : path.resolve(rawPath);
  const config = await readJsonFile(configPath, { server: { port: 3001 }, media: { roots: [] } });
  const media = config.media && typeof config.media === "object" ? config.media : {};
  const roots = Array.isArray(media.roots) ? media.roots : [];
  const normalizedRoots = normalizeMediaRoots(config);
  const existing = normalizedRoots.find((root) => root.path === rootPath);
  const nextRoot = {
    id: existing?.id ?? createMediaRootId(rootPath, normalizedRoots),
    label,
    path: rootPath,
    source,
    ...(existing?.localPath ? { localPath: existing.localPath } : {}),
  };
  const nextRoots = existing
    ? roots.map((root) => {
        if (typeof root?.path !== "string") return root;
        const candidatePath = root?.source === "browser" ? root.path.trim() : path.resolve(root.path);
        return candidatePath === rootPath ? nextRoot : root;
      })
    : [...roots, nextRoot];
  const nextConfig = {
    ...config,
    media: {
      ...media,
      roots: nextRoots,
    },
  };
  await writeJsonFile(configPath, nextConfig);
  return nextRoot;
}

export async function updateMediaRootLocalPath(configPath, payload) {
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  const rawLocalPath = typeof payload?.localPath === "string" ? payload.localPath.trim() : "";
  if (!id) throw new Error("Media library id is required.");
  if (!rawLocalPath || !path.isAbsolute(rawLocalPath)) {
    throw new Error("Local media path must be an absolute path.");
  }

  const localPath = path.resolve(rawLocalPath);
  let entryStat;
  try {
    entryStat = await stat(localPath);
  } catch {
    throw new Error("Local media path must be an existing directory.");
  }
  if (!entryStat.isDirectory()) {
    throw new Error("Local media path must be an existing directory.");
  }

  const config = await readJsonFile(configPath, { server: { port: 3001 }, media: { roots: [] } });
  const media = config.media && typeof config.media === "object" ? config.media : {};
  const roots = Array.isArray(media.roots) ? media.roots : [];
  const normalizedRoots = normalizeMediaRoots(config);
  const existing = normalizedRoots.find((root) => root.id === id);
  if (!existing) throw new Error("Unknown media root.");

  const nextRoot = {
    id: existing.id,
    label: existing.label,
    path: existing.path,
    source: existing.source,
    localPath,
  };
  const nextConfig = {
    ...config,
    media: {
      ...media,
      roots: roots.map((root) => (root?.id === id ? nextRoot : root)),
    },
  };
  await writeJsonFile(configPath, nextConfig);
  return {
    config: nextConfig,
    mediaRoot: nextRoot,
  };
}

function serverPathForRoot(root) {
  if (root.source === "browser") return root.localPath || "";
  return root.path;
}

export function resolveVideoPath(config, rootId, relativePath) {
  const root = normalizeMediaRoots(config).find((item) => item.id === rootId);
  if (!root) throw new Error("Unknown media root.");
  const rootPath = serverPathForRoot(root);
  if (!rootPath || !path.isAbsolute(rootPath)) {
    throw new Error("Browser media libraries need a configured local absolute path before server subtitle extraction.");
  }
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("Invalid relative path.");
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.split("/").includes("..")) {
    throw new Error("Invalid relative path.");
  }
  if (!videoExtensions.has(path.extname(normalizedRelativePath).toLowerCase())) {
    throw new Error("Unsupported video file.");
  }
  const resolvedRoot = path.resolve(rootPath);
  const resolved = path.resolve(resolvedRoot, normalizedRelativePath);
  const rootWithSeparator = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(rootWithSeparator)) {
    throw new Error("Resolved video path is outside the configured media root.");
  }
  return resolved;
}

export async function ensureFileExists(filePath) {
  await access(filePath);
}
