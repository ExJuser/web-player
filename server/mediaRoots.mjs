import { access, readFile, readdir, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { createMatchingNfoNameLookup, maxActorNfoBytes, parseActorNfoBytes } from "../src/actorNfoCore.mjs";
import { hashValue } from "./hashUtils.mjs";
import { readJsonFile, writeJsonFile } from "./jsonFiles.mjs";

const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const subtitleExtensions = new Set([".srt", ".vtt"]);
const photoExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);
const mediaExtensions = new Set([...videoExtensions, ...subtitleExtensions, ...photoExtensions]);
const smallVideoFileThresholdBytes = 50 * 1024 * 1024;
const fileOperationConcurrency = Math.min(8, Math.max(2, availableParallelism()));
let activeFileOperations = 0;
const pendingFileOperations = [];
const ignoredVideoBasenames = new Set(["theme_video", "trailer"]);
const mediaScanDirectoryCacheVersion = 2;
const fixedPhotoAlbumsRoot = {
  id: "photo-albums-local",
  label: "写真集",
  path: "I:\\写真集",
  basename: "写真集",
  source: "local",
};

function runWithFileOperationSlot(operation) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeFileOperations += 1;
      Promise.resolve()
        .then(operation)
        .then(resolve, reject)
        .finally(() => {
          activeFileOperations -= 1;
          pendingFileOperations.shift()?.();
        });
    };
    if (activeFileOperations < fileOperationConcurrency) run();
    else pendingFileOperations.push(run);
  });
}

function compareRelativePath(a, b) {
  return a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" });
}

function isIgnoredVideoFile(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
  return ignoredVideoBasenames.has(baseName);
}

function shouldFilterVideoFile(fileName, size) {
  return size < smallVideoFileThresholdBytes || isIgnoredVideoFile(fileName);
}

function findVideoArtworkName(videoName, fileNames, suffix) {
  const videoExtension = path.extname(videoName);
  const baseName = path.basename(videoName, videoExtension);
  const namesByLowerCase = new Map(fileNames.map((fileName) => [fileName.toLowerCase(), fileName]));
  for (const extension of photoExtensions) {
    const match = namesByLowerCase.get(`${baseName}-${suffix}${extension}`.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

async function statSupportedFiles(entries, directory, isSupported) {
  const supportedEntries = entries.filter((entry) => entry.isFile() && isSupported(entry.name));
  const results = await Promise.all(supportedEntries.map(async (entry) => {
    try {
      return { value: await runWithFileOperationSlot(() => stat(path.join(directory, entry.name))) };
    } catch (error) {
      return { error };
    }
  }));
  return new Map(supportedEntries.map((entry, index) => [entry.name, results[index]]));
}

function isDirectoryFingerprintFile(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (videoExtensions.has(extension) || subtitleExtensions.has(extension) || extension === ".nfo") return true;
  if (!photoExtensions.has(extension)) return false;
  const baseName = path.basename(fileName, extension).toLowerCase();
  return /-(?:poster|fanart|thumb)$/u.test(baseName);
}

function createDirectoryFingerprint(fileStatsByName) {
  return hashValue(Array.from(fileStatsByName.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, result]) => {
      if (result?.error) return `${name}|error`;
      return `${name}|${result?.value?.size ?? 0}|${Math.round(result?.value?.mtimeMs ?? 0)}`;
    })
    .join("\n"));
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

function mediaRootsForPathResolution(config) {
  return [fixedPhotoAlbumsRoot, ...normalizeMediaRoots(config)];
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

function createGlobalMediaId(rootId, relativePath, size, lastModified) {
  return `${rootId}|${relativePath}|${size}|${lastModified}`;
}

function createStableFolderId(rootId, relativePath) {
  return `${rootId}|${relativePath || "."}`;
}

function encodeMediaUrl(rootId, relativePath) {
  return `/api/media/${encodeURIComponent(rootId)}/${relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function createRootStatus(root, status, overrides = {}) {
  return {
    id: root.id,
    label: root.label,
    source: root.source,
    status,
    videoCount: 0,
    scannedFiles: 0,
    updatedAt: Date.now(),
    ...overrides,
  };
}

export function createGlobalVideoId(rootId, relativePath, size, lastModified) {
  return createGlobalMediaId(rootId, relativePath, size, lastModified);
}

function createLegacyVideoId(relativePath, size, lastModified) {
  return `${relativePath}|${size}|${lastModified}`;
}

export async function scanMediaRoot(root, options = {}) {
  const rootPath = serverPathForRoot(root);
  if (!rootPath || !path.isAbsolute(rootPath)) {
    const result = {
      root,
      status: createRootStatus(root, "needsAccess", {
        error: "需要配置本机绝对路径或重新授权浏览器目录。",
      }),
      videos: [],
      subtitles: [],
      filteredSmallVideos: 0,
    };
    await options.onRootComplete?.(result, []);
    return result;
  }

  const resolvedRoot = path.resolve(rootPath);
  const videos = [];
  const subtitles = [];
  let scannedFiles = 0;
  let filteredSmallVideos = 0;
  let reusedDirectories = 0;
  let changedDirectories = 0;
  const directoryRecords = [];

  async function walk(directory, segments) {
    const entries = await readdir(directory, { withFileTypes: true });
    const relativeDirectory = segments.join("/");
    const fileEntryNames = [];
    for (const entry of entries) {
      if (entry.isFile()) fileEntryNames.push(entry.name);
    }
    const fingerprintStatsByName = await statSupportedFiles(entries, directory, isDirectoryFingerprintFile);
    const fingerprint = createDirectoryFingerprint(fingerprintStatsByName);
    const cachedDirectory = options.getDirectoryRecord?.(root.id, relativeDirectory);
    if (
      cachedDirectory?.cacheVersion === mediaScanDirectoryCacheVersion
      && cachedDirectory.fingerprint === fingerprint
    ) {
      const cachedVideos = Array.isArray(cachedDirectory.videos) ? cachedDirectory.videos : [];
      const cachedSubtitles = Array.isArray(cachedDirectory.subtitles) ? cachedDirectory.subtitles : [];
      videos.push(...cachedVideos);
      subtitles.push(...cachedSubtitles);
      scannedFiles += Number(cachedDirectory.scannedFiles) || cachedVideos.length + cachedSubtitles.length;
      filteredSmallVideos += Number(cachedDirectory.filteredSmallVideos) || 0;
      reusedDirectories += 1;
      const record = { ...cachedDirectory, rootId: root.id, relativeDirectory, fingerprint };
      directoryRecords.push(record);
      options.onDirectoryScanned?.({ rootId: root.id, relativeDirectory, reused: true, record });
      for (const entry of entries) {
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), [...segments, entry.name]);
      }
      return;
    }

    changedDirectories += 1;
    const directoryVideos = [];
    const directorySubtitles = [];
    const directoryScannedFilesStart = scannedFiles;
    const directoryFilteredStart = filteredSmallVideos;
    const findMatchingNfoName = createMatchingNfoNameLookup(fileEntryNames);
    const fileStatsByName = fingerprintStatsByName;
    for (const entry of entries) {
      const nextSegments = [...segments, entry.name];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, nextSegments);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!videoExtensions.has(extension) && !subtitleExtensions.has(extension)) continue;
      scannedFiles += 1;

      const fileStatResult = fileStatsByName.get(entry.name);
      if (fileStatResult?.error) throw fileStatResult.error;
      const fileStat = fileStatResult?.value;
      if (!fileStat) continue;
      const lastModified = Math.round(fileStat.mtimeMs);
      const relativePath = nextSegments.join("/");
      if (videoExtensions.has(extension)) {
        if (shouldFilterVideoFile(entry.name, fileStat.size)) {
          filteredSmallVideos += 1;
          continue;
        }
        const video = {
          id: createGlobalMediaId(root.id, relativePath, fileStat.size, lastModified),
          legacyId: createLegacyVideoId(relativePath, fileStat.size, lastModified),
          name: entry.name,
          relativePath,
          url: encodeMediaUrl(root.id, relativePath),
          size: fileStat.size,
          lastModified,
          mediaRootId: root.id,
          playbackSource: "server",
        };
        const posterName = findVideoArtworkName(entry.name, fileEntryNames, "poster");
        const fanartName = findVideoArtworkName(entry.name, fileEntryNames, "fanart");
        const thumbName = findVideoArtworkName(entry.name, fileEntryNames, "thumb");
        if (posterName) {
          video.posterUrl = encodeMediaUrl(root.id, [...segments, posterName].join("/"));
        }
        if (fanartName) {
          video.fanartUrl = encodeMediaUrl(root.id, [...segments, fanartName].join("/"));
        }
        if (thumbName) {
          video.thumbUrl = encodeMediaUrl(root.id, [...segments, thumbName].join("/"));
        }
        const nfoName = findMatchingNfoName(entry.name);
        if (nfoName) {
          try {
            const nfoPath = path.join(directory, nfoName);
            const nfoStat = fingerprintStatsByName.get(nfoName)?.value
              ?? await runWithFileOperationSlot(() => stat(nfoPath));
            video.actorHints = nfoStat.size > maxActorNfoBytes
              ? { fileName: nfoName, names: [], status: "tooLarge" }
              : parseActorNfoBytes(await runWithFileOperationSlot(() => readFile(nfoPath)), nfoName);
          } catch {
            video.actorHints = { fileName: nfoName, names: [], status: "invalid" };
          }
        }
        if (typeof options.createVideoPlayability === "function") {
          video.playability = await options.createVideoPlayability(root, video, entryPath);
        }
        videos.push(video);
        directoryVideos.push(video);
      } else if (subtitleExtensions.has(extension)) {
        const subtitle = {
          id: createGlobalMediaId(root.id, relativePath, fileStat.size, lastModified),
          legacyId: createLegacyVideoId(relativePath, fileStat.size, lastModified),
          name: entry.name,
          relativePath,
          url: encodeMediaUrl(root.id, relativePath),
          size: fileStat.size,
          lastModified,
          mediaRootId: root.id,
        };
        subtitles.push(subtitle);
        directorySubtitles.push(subtitle);
      }
    }
    const record = {
      cacheVersion: mediaScanDirectoryCacheVersion,
      rootId: root.id,
      relativeDirectory,
      fingerprint,
      videos: directoryVideos,
      subtitles: directorySubtitles,
      scannedFiles: scannedFiles - directoryScannedFilesStart,
      filteredSmallVideos: filteredSmallVideos - directoryFilteredStart,
    };
    directoryRecords.push(record);
    options.onDirectoryScanned?.({ rootId: root.id, relativeDirectory, reused: false, record });
  }

  try {
    await walk(resolvedRoot, []);
    videos.sort(compareRelativePath);
    subtitles.sort(compareRelativePath);
    const result = {
      root,
      status: createRootStatus(root, "ready", {
        videoCount: videos.length,
        scannedFiles,
        reusedDirectories,
        changedDirectories,
      }),
      videos,
      subtitles,
      filteredSmallVideos,
    };
    await options.onRootComplete?.(result, directoryRecords);
    return result;
  } catch (error) {
    const result = {
      root,
      status: createRootStatus(root, "error", {
        scannedFiles,
        reusedDirectories,
        changedDirectories,
        error: error instanceof Error ? error.message : "扫描媒体根失败。",
      }),
      videos,
      subtitles,
      filteredSmallVideos,
    };
    await options.onRootComplete?.(result, directoryRecords);
    return result;
  }
}

export async function scanConfiguredMediaRoots(config, options = {}) {
  const roots = normalizeMediaRoots(config);
  const rootsResult = await Promise.all(roots.map((root) => scanMediaRoot(root, options)));
  const videos = [];
  const subtitles = [];
  let scannedFiles = 0;
  let filteredSmallVideos = 0;
  for (const result of rootsResult) {
    videos.push(...result.videos);
    subtitles.push(...result.subtitles);
    scannedFiles += result.status.scannedFiles;
    filteredSmallVideos += result.filteredSmallVideos;
  }
  return {
    roots: rootsResult,
    videos,
    subtitles,
    scannedFiles,
    filteredSmallVideos,
    metadata: {
      id: "global",
      name: "全局媒体库",
      videoCount: videos.length,
      scannedFiles,
      updatedAt: Date.now(),
      mediaRoots: rootsResult.map((result) => result.status),
    },
  };
}

async function scanPhotoAlbumsRoot(root) {
  const rootPath = serverPathForRoot(root);
  if (!rootPath || !path.isAbsolute(rootPath)) {
    return {
      root,
      status: createRootStatus(root, "needsAccess", {
        error: "需要配置本机绝对路径或重新授权浏览器目录。",
      }),
      albums: [],
    };
  }

  const resolvedRoot = path.resolve(rootPath);
  const albums = [];
  let scannedFiles = 0;

  async function walk(directory, segments) {
    const entries = await readdir(directory, { withFileTypes: true });
    const images = [];
    let totalSize = 0;
    let updatedAt = 0;
    const fileStatsByName = await statSupportedFiles(entries, directory, (fileName) => photoExtensions.has(path.extname(fileName).toLowerCase()));

    for (const entry of entries) {
      const nextSegments = [...segments, entry.name];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, nextSegments);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!photoExtensions.has(extension)) continue;
      scannedFiles += 1;

      const fileStatResult = fileStatsByName.get(entry.name);
      if (fileStatResult?.error) throw fileStatResult.error;
      const fileStat = fileStatResult?.value;
      if (!fileStat) continue;
      const lastModified = Math.round(fileStat.mtimeMs);
      totalSize += fileStat.size;
      updatedAt = Math.max(updatedAt, lastModified);
      const relativePath = nextSegments.join("/");
      images.push({
        id: createGlobalMediaId(root.id, relativePath, fileStat.size, lastModified),
        name: entry.name,
        relativePath,
        url: encodeMediaUrl(root.id, relativePath),
        size: fileStat.size,
        lastModified,
        mediaRootId: root.id,
      });
    }

    if (!images.length) return;
    images.sort(compareRelativePath);
    const folderPath = segments.join("/");
    const title = segments.at(-1) || root.label;
    albums.push({
      id: createStableFolderId(root.id, folderPath),
      title,
      relativePath: folderPath,
      mediaRootId: root.id,
      mediaRootLabel: root.label,
      coverImageUrl: images[0].url,
      imageCount: images.length,
      totalSize,
      updatedAt,
      images: images.map((image, index) => ({ ...image, index })),
    });
  }

  try {
    await walk(resolvedRoot, []);
    albums.sort((a, b) => b.updatedAt - a.updatedAt || compareRelativePath(a, b));
    return {
      root,
      status: createRootStatus(root, "ready", {
        videoCount: albums.length,
        scannedFiles,
      }),
      albums,
    };
  } catch (error) {
    return {
      root,
      status: createRootStatus(root, "error", {
        scannedFiles,
        error: error instanceof Error ? error.message : "扫描看图文件夹失败。",
      }),
      albums,
    };
  }
}

export async function scanConfiguredPhotoAlbums(config) {
  const roots = [fixedPhotoAlbumsRoot];
  const rootsResult = await Promise.all(roots.map((root) => scanPhotoAlbumsRoot(root)));
  const albums = [];
  let scannedFiles = 0;
  for (const result of rootsResult) {
    albums.push(...result.albums);
    scannedFiles += result.status.scannedFiles;
  }
  return {
    roots: rootsResult,
    albums,
    scannedFiles,
    metadata: {
      id: "photo-albums",
      name: "看图",
      albumCount: albums.length,
      scannedFiles,
      updatedAt: Date.now(),
      mediaRoots: rootsResult.map((result) => result.status),
    },
  };
}

export function resolveMediaPath(config, rootId, relativePath, allowedExtensions = mediaExtensions) {
  const root = mediaRootsForPathResolution(config).find((item) => item.id === rootId);
  if (!root) throw new Error("Unknown media root.");
  const rootPath = serverPathForRoot(root);
  if (!rootPath || !path.isAbsolute(rootPath)) {
    throw new Error("Browser media libraries need a configured local absolute path before server file access.");
  }
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("Invalid relative path.");
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.split("/").includes("..")) {
    throw new Error("Invalid relative path.");
  }
  if (!allowedExtensions.has(path.extname(normalizedRelativePath).toLowerCase())) {
    throw new Error("Unsupported media file.");
  }
  const resolvedRoot = path.resolve(rootPath);
  const resolved = path.resolve(resolvedRoot, normalizedRelativePath);
  const rootWithSeparator = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(rootWithSeparator)) {
    throw new Error("Resolved video path is outside the configured media root.");
  }
  return resolved;
}

export function resolveVideoPath(config, rootId, relativePath) {
  try {
    return resolveMediaPath(config, rootId, relativePath, videoExtensions);
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported media file.") {
      throw new Error("Unsupported video file.");
    }
    throw error;
  }
}

export async function findTranslatedSubtitle(config, rootId, relativePath) {
  const videoPath = resolveVideoPath(config, rootId, relativePath);
  await ensureFileExists(videoPath);
  const directory = path.dirname(videoPath);
  const expectedBaseName = `${path.basename(videoPath, path.extname(videoPath))}-translated`.toLowerCase();
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries.filter((entry) => {
    if (!entry.isFile()) return false;
    const extension = path.extname(entry.name).toLowerCase();
    return subtitleExtensions.has(extension) && path.basename(entry.name, extension).toLowerCase() === expectedBaseName;
  });
  const entry = [".srt", ".vtt"]
    .map((extension) => candidates.find((candidate) => path.extname(candidate.name).toLowerCase() === extension))
    .find(Boolean);
  if (!entry) return null;

  const normalizedVideoPath = relativePath.replace(/\\/g, "/");
  const relativeDirectory = path.posix.dirname(normalizedVideoPath);
  const subtitleRelativePath = relativeDirectory === "." ? entry.name : `${relativeDirectory}/${entry.name}`;
  const fileStat = await stat(path.join(directory, entry.name));
  const lastModified = Math.round(fileStat.mtimeMs);
  return {
    id: createGlobalMediaId(rootId, subtitleRelativePath, fileStat.size, lastModified),
    name: entry.name,
    relativePath: subtitleRelativePath,
    url: encodeMediaUrl(rootId, subtitleRelativePath),
    size: fileStat.size,
    lastModified,
    mediaRootId: rootId,
    source: "external",
    format: path.extname(entry.name).toLowerCase() === ".vtt" ? "vtt" : "srt",
  };
}

export function resolvePhotoPath(config, rootId, relativePath) {
  try {
    return resolveMediaPath(config, rootId, relativePath, photoExtensions);
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported media file.") {
      throw new Error("Unsupported photo file.");
    }
    throw error;
  }
}

export async function ensureFileExists(filePath) {
  await access(filePath);
}
