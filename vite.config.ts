// @ts-nocheck
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const dataRoot = path.resolve(__dirname, ".local-web-player-data");
const librariesRoot = path.join(dataRoot, "libraries");
const thumbnailsRoot = path.join(dataRoot, "thumbnails");
const embeddedSubtitlesRoot = path.join(dataRoot, "subtitles");
const aiRoot = path.join(dataRoot, "ai");
const indexPath = path.join(dataRoot, "index.json");
const appConfigPath = path.resolve(__dirname, "config", "app.json");
const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const imageSubtitleCodecs = new Set(["hdmv_pgs_subtitle", "pgs", "dvd_subtitle", "dvb_subtitle", "xsub"]);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendBlob(response, status, buffer) {
  response.statusCode = status;
  response.setHeader("Content-Type", "image/jpeg");
  response.end(buffer);
}

function sanitizeStorageId(value) {
  if (!/^[A-Za-z0-9._~-]{1,240}$/.test(value)) {
    return null;
  }
  return value;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readTextFile(filePath, fallback = null) {
  try {
    return await readFile(filePath, "utf8");
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

function normalizeMediaRoots(config) {
  const roots = Array.isArray(config?.media?.roots) ? config.media.roots : [];
  return roots
    .map((root) => {
      const id = typeof root?.id === "string" ? root.id.trim() : "";
      const rootPath = typeof root?.path === "string" ? path.resolve(root.path) : "";
      if (!id || !rootPath || !/^[A-Za-z0-9._~-]{1,80}$/.test(id)) return null;
      return {
        id,
        label: typeof root?.label === "string" && root.label.trim() ? root.label.trim() : path.basename(rootPath),
        path: rootPath,
        basename: path.basename(rootPath),
      };
    })
    .filter(Boolean);
}

async function loadAppConfig() {
  return readJsonFile(appConfigPath, { server: { port: 3001 }, media: { roots: [] } });
}

function publicLocalConfig(config, tools, env) {
  const roots = normalizeMediaRoots(config).map((root) => ({
    id: root.id,
    label: root.label,
    basename: root.basename,
  }));
  return {
    mediaRoots: roots,
    ffmpeg: tools,
    ai: {
      configured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
    },
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: __dirname,
      windowsHide: true,
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    const maxStdoutBytes = options.maxStdoutBytes ?? 10 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(options.timeoutMessage || `${command} timed out.`));
    }, options.timeoutMs ?? 15000);

    child.stdout.on("data", (chunk) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        child.kill("SIGKILL");
        reject(new Error(`${command} output is too large.`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}.`));
    });
  });
}

async function detectTools() {
  const [ffmpeg, ffprobe] = await Promise.all([
    runProcess("ffmpeg", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
    runProcess("ffprobe", ["-version"], { timeoutMs: 5000 }).then(() => true, () => false),
  ]);
  return { ffmpeg, ffprobe };
}

function resolveVideoPath(config, rootId, relativePath) {
  const root = normalizeMediaRoots(config).find((item) => item.id === rootId);
  if (!root) throw new Error("Unknown media root.");
  if (typeof relativePath !== "string" || !relativePath.trim()) throw new Error("Invalid relative path.");
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  if (path.isAbsolute(normalizedRelativePath) || normalizedRelativePath.split("/").includes("..")) {
    throw new Error("Invalid relative path.");
  }
  if (!videoExtensions.has(path.extname(normalizedRelativePath).toLowerCase())) {
    throw new Error("Unsupported video file.");
  }
  const resolved = path.resolve(root.path, normalizedRelativePath);
  const rootWithSeparator = root.path.endsWith(path.sep) ? root.path : `${root.path}${path.sep}`;
  if (resolved !== root.path && !resolved.startsWith(rootWithSeparator)) {
    throw new Error("Resolved video path is outside the configured media root.");
  }
  return resolved;
}

async function ensureFileExists(filePath) {
  await access(filePath);
}

function normalizeSubtitleTrack(stream) {
  const codec = String(stream.codec_name || "unknown");
  const tags = stream.tags && typeof stream.tags === "object" ? stream.tags : {};
  const extractable = !imageSubtitleCodecs.has(codec.toLowerCase());
  return {
    streamIndex: Number(stream.index),
    codec,
    language: typeof tags.language === "string" ? tags.language : undefined,
    title: typeof tags.title === "string" ? tags.title : undefined,
    extractable,
    reason: extractable ? undefined : "Image subtitles need OCR and are not supported yet.",
  };
}

async function probeEmbeddedSubtitles(config, payload) {
  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const raw = await runProcess("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    "-select_streams",
    "s",
    videoPath,
  ]);
  const parsed = JSON.parse(raw || "{}");
  const tracks = Array.isArray(parsed.streams) ? parsed.streams.map(normalizeSubtitleTrack) : [];
  return { tracks };
}

async function extractEmbeddedSubtitle(config, payload) {
  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const streamIndex = Number(payload?.streamIndex);
  if (!Number.isInteger(streamIndex) || streamIndex < 0) throw new Error("Invalid subtitle stream.");
  const cacheId = hashValue(`${payload.rootId}|${payload.relativePath}|${streamIndex}|vtt`);
  const cachePath = path.join(embeddedSubtitlesRoot, `${cacheId}.vtt`);
  const cached = await readTextFile(cachePath);
  if (cached) return { id: cacheId, format: "vtt", text: cached };
  const text = await runProcess(
    "ffmpeg",
    ["-v", "error", "-i", videoPath, "-map", `0:${streamIndex}`, "-f", "webvtt", "-"],
    { timeoutMs: 30000, timeoutMessage: "Timed out extracting embedded subtitles." },
  );
  if (!text.trim()) throw new Error("No subtitle text was extracted.");
  await mkdir(embeddedSubtitlesRoot, { recursive: true });
  await writeFile(cachePath, text, "utf8");
  return { id: cacheId, format: "vtt", text };
}

function chunkText(text, size = 12000) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

async function callDeepSeek(env, messages) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured.");
  const baseUrl = (env.DEEPSEEK_BASE_URL || env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.3,
      messages,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || response.statusText);
  }
  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content?.trim() || "";
}

async function summarizeSubtitle(env, payload) {
  const subtitleText = typeof payload?.subtitleText === "string" ? payload.subtitleText.trim() : "";
  if (!subtitleText) throw new Error("Subtitle text is required.");
  const cacheId = hashValue(`summary|${payload?.videoName || ""}|${subtitleText}`);
  const cachePath = path.join(aiRoot, "summaries", `${cacheId}.json`);
  const cached = await readJsonFile(cachePath, null);
  if (cached?.summary) return cached;

  const parts = [];
  for (const chunk of chunkText(subtitleText)) {
    parts.push(
      await callDeepSeek(env, [
        { role: "system", content: "你是一个视频字幕分析助手。请只根据用户提供的字幕内容总结，不要编造。" },
        { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请总结这段字幕的剧情要点、人物/关系、情绪基调和关键词：\n\n${chunk}` },
      ]),
    );
  }
  const summary =
    parts.length === 1
      ? parts[0]
      : await callDeepSeek(env, [
          { role: "system", content: "你是一个视频字幕分析助手。请合并分段摘要，避免重复，不要加入字幕外信息。" },
          { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请合并以下分段摘要，输出本集概要、关键事件、人物关系、情绪基调、关键词：\n\n${parts.join("\n\n---\n\n")}` },
        ]);
  const result = { summary, updatedAt: Date.now() };
  await writeJsonFile(cachePath, result);
  return result;
}

async function askSubtitleQuestion(env, payload) {
  const question = typeof payload?.question === "string" ? payload.question.trim() : "";
  const chunks = Array.isArray(payload?.chunks) ? payload.chunks : [];
  if (!question) throw new Error("Question is required.");
  if (!chunks.length) throw new Error("Relevant subtitle chunks are required.");
  const context = chunks
    .map((chunk) => `[${chunk.start || "?"} - ${chunk.end || "?"}]\n${chunk.text || ""}`)
    .join("\n\n");
  const cacheId = hashValue(`qa|${payload?.videoName || ""}|${question}|${context}`);
  const cachePath = path.join(aiRoot, "qa", `${cacheId}.json`);
  const cached = await readJsonFile(cachePath, null);
  if (cached?.answer) return cached;
  const answer = await callDeepSeek(env, [
    { role: "system", content: "你是一个视频字幕问答助手。只能根据给定字幕片段回答；如果片段不足以回答，请明确说明。回答中尽量引用时间范围。" },
    { role: "user", content: `视频：${payload?.videoName || "未命名"}\n问题：${question}\n\n相关字幕片段：\n${context}` },
  ]);
  const result = { answer, updatedAt: Date.now() };
  await writeJsonFile(cachePath, result);
  return result;
}

async function updateIndex(libraryId, metadata) {
  await mkdir(dataRoot, { recursive: true });
  const index = await readJsonFile(indexPath, { version: 1, libraries: {} });
  index.version = 1;
  index.libraries = index.libraries && typeof index.libraries === "object" ? index.libraries : {};
  index.libraries[libraryId] = {
    ...(index.libraries[libraryId] ?? {}),
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    updatedAt: Date.now(),
  };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function playerDataApiPlugin(env) {
  let toolsPromise = null;
  const getTools = () => {
    toolsPromise ??= detectTools();
    return toolsPromise;
  };

  const middleware = async (request, response, next) => {
    if (!request.url?.startsWith("/api/")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const libraryMatch = url.pathname.match(/^\/api\/player-data\/libraries\/([^/]+)$/);
    const thumbnailMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)$/);

    try {
      if (url.pathname === "/api/local-config" && request.method === "GET") {
        sendJson(response, 200, publicLocalConfig(await loadAppConfig(), await getTools(), env));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/probe" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await probeEmbeddedSubtitles(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/extract" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await extractEmbeddedSubtitle(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/ai/subtitles/summarize" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await summarizeSubtitle(env, payload));
        return;
      }

      if (url.pathname === "/api/ai/subtitles/ask" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await askSubtitleQuestion(env, payload));
        return;
      }

      if (libraryMatch) {
        const libraryId = sanitizeStorageId(decodeURIComponent(libraryMatch[1]));
        if (!libraryId) {
          sendJson(response, 400, { error: "Invalid library id." });
          return;
        }

        const filePath = path.join(librariesRoot, `${libraryId}.json`);
        if (request.method === "GET") {
          const payload = await readJsonFile(filePath, null);
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Library data not found." });
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          const payload = JSON.parse(rawBody.toString("utf8"));
          await mkdir(librariesRoot, { recursive: true });
          await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
          await updateIndex(libraryId, payload.metadata);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (thumbnailMatch) {
        const thumbnailId = sanitizeStorageId(decodeURIComponent(thumbnailMatch[1]));
        if (!thumbnailId) {
          sendJson(response, 400, { error: "Invalid thumbnail id." });
          return;
        }

        const filePath = path.join(thumbnailsRoot, `${thumbnailId}.blob`);
        if (request.method === "GET") {
          try {
            sendBlob(response, 200, await readFile(filePath));
          } catch {
            response.statusCode = 404;
            response.end();
          }
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          await mkdir(thumbnailsRoot, { recursive: true });
          await writeFile(filePath, rawBody);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal server error." });
    }
  };

  return {
    name: "local-web-player-data-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), playerDataApiPlugin(env)],
  };
});
