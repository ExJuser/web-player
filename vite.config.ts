// @ts-nocheck
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  classifyMediaProbe,
  createCompatibleMediaUrl,
  getCachedCompatibleMedia,
  mediaContentTypeForPath,
  probeMediaFile,
  remuxCompatibleMedia,
  resolveCompatibleMediaPath,
} from "./server/mediaCompatibility.mjs";
import {
  ensureFileExists,
  normalizeMediaRoots as normalizeMediaRootsFromConfig,
  resolveMediaPath as resolveMediaPathFromConfig,
  resolveVideoPath as resolveVideoPathFromConfig,
  scanConfiguredPhotoAlbums,
  scanConfiguredMediaRoots,
  updateMediaRootLocalPath as updateMediaRootLocalPathInConfig,
  upsertMediaRoot as upsertMediaRootInConfig,
} from "./server/mediaRoots.mjs";
import {
  createDanmakuComment,
  createDanmakuSourceId,
  dedupeDanmakuComments,
  parseDanmakuUrl,
} from "./src/danmakuUtils";
import { normalizeAiLibrarySearchAnswer, normalizeLibrarySearchCandidates, parseAiJsonObject } from "./server/aiResponseUtils.mjs";
import { createBilibiliDanmakuService } from "./server/bilibiliDanmaku.mjs";
import { clearLocalCacheItems, createCacheStatus as createLocalCacheStatus, createDanmakuSourcesStats } from "./server/cacheStatus.mjs";
import { callDeepSeek, chunkText, streamDeepSeek } from "./server/deepSeekClient.mjs";
import { readJsonFile, writeJsonFile } from "./server/jsonFiles.mjs";
import { formatRemoteFetchError, requestExternalJson, requestExternalText } from "./server/remoteFetch.mjs";
import { LocalDataSqliteStore } from "./server/sqliteStorage.mjs";

const dataRoot = path.resolve(__dirname, ".local-web-player-data");
const librariesRoot = path.join(dataRoot, "libraries");
const thumbnailsRoot = path.join(dataRoot, "thumbnails");
const photoAlbumsRoot = path.join(dataRoot, "photo-albums");
const embeddedSubtitlesRoot = path.join(dataRoot, "subtitles");
const compatibleMediaRoot = path.join(dataRoot, "compatible-media");
const danmakuRoot = path.join(dataRoot, "danmaku");
const danmakuSourcesRoot = path.join(danmakuRoot, "sources");
const aiRoot = path.join(dataRoot, "ai");
const bangumiRoot = path.join(dataRoot, "bangumi");
const bangumiMatchesRoot = path.join(bangumiRoot, "matches");
const indexPath = path.join(dataRoot, "index.json");
const globalDataPath = path.join(dataRoot, "global.json");
const appConfigPath = path.resolve(__dirname, "config", "app.json");
const localDataStore = new LocalDataSqliteStore({ dataRoot, librariesRoot, photoAlbumsRoot, indexPath, globalDataPath });
const videoExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const imageSubtitleCodecs = new Set(["hdmv_pgs_subtitle", "pgs", "dvd_subtitle", "dvb_subtitle", "xsub"]);
const bilibiliDanmaku = createBilibiliDanmakuService({
  createDanmakuComment,
  dedupeDanmakuComments,
  formatRemoteFetchError,
  requestExternalJson,
  requestExternalText,
});

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendNdjson(response, status) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("X-Accel-Buffering", "no");
}

function writeStreamEvent(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function sendBlob(response, status, buffer) {
  response.statusCode = status;
  response.setHeader("Content-Type", "image/jpeg");
  response.end(buffer);
}

async function sendMediaFile(request, response, filePath) {
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;
  const range = request.headers.range;
  const contentType = mediaContentTypeForPath(filePath);

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.statusCode = 416;
      response.setHeader("Content-Range", `bytes */${fileSize}`);
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileSize - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0 || end >= fileSize) {
      response.statusCode = 416;
      response.setHeader("Content-Range", `bytes */${fileSize}`);
      response.end();
      return;
    }
    response.statusCode = 206;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    response.setHeader("Content-Length", String(end - start + 1));
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Length", String(fileSize));
  createReadStream(filePath).pipe(response);
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

async function readTextFile(filePath, fallback = null) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createDanmakuSourcePath(sourceId, options = {}) {
  const encodedName = `${encodeURIComponent(sourceId)}.json`;
  return path.join(danmakuSourcesRoot, options.legacy ? `${sourceId}.json` : encodedName);
}

const cacheStatusDefinitions = [
  { id: "bangumi-matches", label: "Bangumi 匹配", path: bangumiMatchesRoot },
  { id: "global", label: "全局播放数据", path: globalDataPath },
  { id: "libraries", label: "播放数据", path: librariesRoot },
  { id: "thumbnails", label: "视频缩略图", path: thumbnailsRoot },
  { id: "photo-albums", label: "写真集数据", path: photoAlbumsRoot },
  { id: "subtitles", label: "内封字幕", path: embeddedSubtitlesRoot },
  { id: "compatible-media", label: "兼容播放缓存", path: compatibleMediaRoot },
  { id: "danmaku-sources", label: "弹幕源", path: danmakuSourcesRoot, getStats: () => createDanmakuSourcesStats(danmakuSourcesRoot) },
  { id: "ai-summaries", label: "AI 字幕总结", path: path.join(aiRoot, "summaries") },
  { id: "ai-qa", label: "AI 字幕问答", path: path.join(aiRoot, "qa") },
  { id: "ai-recaps", label: "AI 进度回顾", path: path.join(aiRoot, "recaps") },
  { id: "index", label: "索引数据", path: indexPath },
];

async function createCacheStatus() {
  return createLocalCacheStatus({
    dataRoot,
    definitions: cacheStatusDefinitions,
    createDatabaseStatusItem: () => localDataStore.createDatabaseStatusItem(),
  });
}

async function clearCacheItems(payload) {
  return clearLocalCacheItems(payload, {
    dataRoot,
    createStatus: createCacheStatus,
    clearCacheEntriesByKinds: (kinds) => localDataStore.clearCacheEntriesByKinds(kinds),
  });
}

function normalizeMediaRoots(config) {
  return normalizeMediaRootsFromConfig(config);
}

async function upsertMediaRoot(payload) {
  return upsertMediaRootInConfig(appConfigPath, payload);
}

async function updateMediaRootLocalPath(payload) {
  return updateMediaRootLocalPathInConfig(appConfigPath, payload);
}

async function loadAppConfig() {
  return readJsonFile(appConfigPath, { server: { port: 3001 }, media: { roots: [] } });
}

function publicLocalConfig(config, tools, env) {
  const roots = normalizeMediaRoots(config).map((root) => ({
    id: root.id,
    label: root.label,
    basename: root.basename,
    path: root.path,
    source: root.source,
    localPath: root.localPath,
  }));
  return {
    mediaRoots: roots,
    ffmpeg: tools,
    ai: {
      configured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
    },
    bangumi: {
      configured: Boolean(env.BANGUMI_USER_AGENT && env.BANGUMI_ACCESS_TOKEN),
      proxyConfigured: Boolean(env.BANGUMI_LENS_PROXY),
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
  return resolveVideoPathFromConfig(config, rootId, relativePath);
}

function resolveMediaPath(config, rootId, relativePath) {
  return resolveMediaPathFromConfig(config, rootId, relativePath);
}

function findMediaRoot(config, rootId) {
  const id = typeof rootId === "string" ? rootId.trim() : "";
  return normalizeMediaRoots(config).find((root) => root.id === id) ?? null;
}

async function probeMedia(config, payload) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    return {
      playability: {
        status: "needsLocalPath",
        reason: "浏览器添加的媒体库需要先配置本机路径，才能使用 ffprobe/ffmpeg。",
      },
      probe: null,
    };
  }

  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const fileStat = await stat(videoPath);
  const video = {
    name: path.basename(videoPath),
    relativePath: payload.relativePath,
    size: fileStat.size,
    lastModified: Math.round(fileStat.mtimeMs),
  };
  const rawProbe = await probeMediaFile(runProcess, videoPath);
  const result = classifyMediaProbe(rawProbe, video.name);
  const cached = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
  return {
    probe: result.probe,
    canRemux: result.canRemux,
    metadata: {
      duration: result.probe?.format?.duration,
      width: result.probe?.video?.width,
      height: result.probe?.video?.height,
    },
    playability: {
      ...result.playability,
      ...(cached.compatibleUrl ? { compatibleUrl: cached.compatibleUrl } : {}),
    },
  };
}

async function remuxMediaToCompatibleMp4(config, payload) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能生成兼容 MP4。");
  }

  const videoPath = resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const fileStat = await stat(videoPath);
  const video = {
    name: path.basename(videoPath),
    relativePath: payload.relativePath,
    size: fileStat.size,
    lastModified: Math.round(fileStat.mtimeMs),
  };
  const rawProbe = await probeMediaFile(runProcess, videoPath);
  const result = classifyMediaProbe(rawProbe, video.name);
  if (!result.canRemux || result.playability.status !== "remuxRecommended") {
    throw new Error(result.playability.reason || "当前视频不能无损生成兼容 MP4。");
  }

  const cached = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
  if (!cached.compatibleUrl) {
    await remuxCompatibleMedia({
      runProcess,
      sourcePath: videoPath,
      outputPath: cached.cachePath,
    });
  }

  return {
    cacheId: cached.cacheId,
    compatibleUrl: createCompatibleMediaUrl(cached.cacheId),
    playability: {
      ...result.playability,
      compatibleUrl: createCompatibleMediaUrl(cached.cacheId),
    },
  };
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

async function readCachedEmbeddedSubtitle(config, payload) {
  resolveVideoPath(config, payload?.rootId, payload?.relativePath);
  const streamIndex = Number(payload?.streamIndex);
  if (!Number.isInteger(streamIndex) || streamIndex < 0) throw new Error("Invalid subtitle stream.");
  const cacheId = hashValue(`${payload.rootId}|${payload.relativePath}|${streamIndex}|vtt`);
  const cachePath = path.join(embeddedSubtitlesRoot, `${cacheId}.vtt`);
  const text = await readTextFile(cachePath);
  return text ? { id: cacheId, format: "vtt", text } : { id: cacheId, format: "vtt", text: "" };
}

async function writeDanmakuSource(record) {
  await mkdir(danmakuSourcesRoot, { recursive: true });
  const language = record.comments.reduce((selected, comment) => {
    if (selected === "mixed") return selected;
    if (comment.sourceLanguage && comment.sourceLanguage !== selected) return selected === "unknown" ? comment.sourceLanguage : "mixed";
    return selected;
  }, "unknown");
  const translatedCount = record.comments.filter((comment) => comment.simplifiedText && comment.simplifiedText !== comment.text).length;
  const source = {
    id: createDanmakuSourceId(record.provider, `${record.sourceUrl}|${record.title}|${record.comments.length}`),
    provider: record.provider,
    title: record.title,
    sourceUrl: record.sourceUrl,
    language,
    commentCount: record.comments.length,
    translatedCount,
    updatedAt: Date.now(),
  };
  const payload = { source, comments: record.comments };
  await writeJsonFile(createDanmakuSourcePath(source.id), payload);
  return payload;
}

async function readDanmakuSource(sourceId) {
  const id = typeof sourceId === "string" ? sourceId : "";
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(id)) throw new Error("Invalid danmaku source id.");
  const payload =
    (await readJsonFile(createDanmakuSourcePath(id), null)) ??
    (await readJsonFile(createDanmakuSourcePath(id, { legacy: true }), null));
  if (!payload?.source || !Array.isArray(payload?.comments)) throw new Error("弹幕源缓存不存在。");
  return payload;
}

async function fetchDanmakuSource(payload) {
  const manualUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
  const parsed = parseDanmakuUrl(manualUrl);
  if (!parsed) throw new Error("请输入支持的 Bilibili 弹幕链接。");

  const record =
    parsed.provider === "bilibili"
      ? await bilibiliDanmaku.fetchBilibiliDanmaku(parsed)
      : null;
  if (!record) throw new Error("Unsupported danmaku provider.");
  if (!record.comments.length) throw new Error("没有解析到弹幕。");
  return writeDanmakuSource(record);
}

async function streamSubtitleSummary(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const subtitleText = typeof payload?.subtitleText === "string" ? payload.subtitleText.trim() : "";
    if (!subtitleText) throw new Error("Subtitle text is required.");
    const cacheId = hashValue(`summary|${payload?.videoName || ""}|${subtitleText}`);
    const cachePath = path.join(aiRoot, "summaries", `${cacheId}.json`);
    const cached = await readJsonFile(cachePath, null);
    if (cached?.summary) {
      writeStreamEvent(response, { type: "result", text: cached.summary });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    const chunks = chunkText(subtitleText);
    const parts = [];
    for (let index = 0; index < chunks.length; index += 1) {
      if (chunks.length > 1) {
        writeStreamEvent(response, { type: "message", text: `正在分析第 ${index + 1}/${chunks.length} 段字幕...` });
      }
      parts.push(
        await callDeepSeek(env, [
          { role: "system", content: "你是一个视频字幕分析助手。只根据字幕内容总结，不要编造。输出简洁中文，控制在 80-120 字。" },
          { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请概括这段字幕的关键事件、人物关系和情绪变化：\n\n${chunks[index]}` },
        ]),
      );
    }

    if (chunks.length > 1) {
      writeStreamEvent(response, { type: "message", text: "正在合并字幕总结..." });
    }
    const messages =
      parts.length === 1
        ? [
            { role: "system", content: "你是一个视频字幕分析助手。只根据字幕内容总结，不要编造。输出简洁中文，控制在 180-260 字。" },
            { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请总结这段字幕的主要内容、人物关系、情绪基调和关键词：\n\n${subtitleText}` },
          ]
        : [
            { role: "system", content: "你是一个视频字幕分析助手。请合并分段摘要，避免重复，不要加入字幕外信息。输出简洁中文，控制在 180-260 字。" },
            { role: "user", content: `视频：${payload?.videoName || "未命名"}\n\n请合并以下分段摘要，输出本集概要、关键事件、人物关系、情绪基调和关键词：\n\n${parts.join("\n\n---\n\n")}` },
          ];
    let summary = "";
    summary = await streamDeepSeek(env, messages, (delta) => {
      writeStreamEvent(response, { type: "delta", text: delta });
    });
    const result = { summary, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to summarize subtitles." });
  } finally {
    response.end();
  }
}

async function streamSubtitleAnswer(env, payload, response) {
  sendNdjson(response, 200);
  try {
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
    if (cached?.answer) {
      writeStreamEvent(response, { type: "result", text: cached.answer });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    const answer = await streamDeepSeek(
      env,
      [
        {
          role: "system",
          content:
            "你是一个视频字幕问答助手。只能根据给定字幕片段回答；如果片段不足以回答，请明确说明。回答要直接、简洁，控制在 120-220 字，必要时引用时间范围。",
        },
        { role: "user", content: `视频：${payload?.videoName || "未命名"}\n问题：${question}\n\n相关字幕片段：\n${context}` },
      ],
      (delta) => {
        writeStreamEvent(response, { type: "delta", text: delta });
      },
    );
    const result = { answer, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to answer subtitle question." });
  } finally {
    response.end();
  }
}

async function streamProgressRecap(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const viewedText = typeof payload?.viewedText === "string" ? payload.viewedText.trim() : "";
    const currentTime = Number(payload?.currentTime);
    const subtitleId = typeof payload?.subtitleId === "string" ? payload.subtitleId : "";
    if (!viewedText) throw new Error("Viewed subtitle text is required.");
    if (!Number.isFinite(currentTime) || currentTime < 0) throw new Error("Current time is required.");

    const recapEndSeconds = Math.floor(currentTime);
    const cacheId = hashValue(`recap|${payload?.videoName || ""}|${subtitleId}|${recapEndSeconds}|${viewedText}`);
    const cachePath = path.join(aiRoot, "recaps", `${cacheId}.json`);
    const cached = await readJsonFile(cachePath, null);
    if (cached?.recap) {
      writeStreamEvent(response, { type: "result", text: cached.recap });
      writeStreamEvent(response, { type: "done" });
      return;
    }

    writeStreamEvent(response, { type: "message", text: "正在生成无剧透进度回顾..." });
    const recap = await streamDeepSeek(
      env,
      [
        {
          role: "system",
          content:
            "你是视频字幕进度回顾助手。只能基于用户提供的已观看字幕内容回答，不得推断、补充或暗示后续剧情，不得提及尚未在字幕中出现的事件。请用简洁中文输出 120-220 字。",
        },
        {
          role: "user",
          content: `视频：${payload?.videoName || "未命名"}\n看到这里为止：${recapEndSeconds} 秒\n\n请生成“看到这里为止”的无剧透回顾，概括已发生的关键事件、人物关系和当前悬念。只使用下面这些字幕：\n\n${viewedText}`,
        },
      ],
      (delta) => {
        writeStreamEvent(response, { type: "delta", text: delta });
      },
    );
    const result = { recap, updatedAt: Date.now() };
    await writeJsonFile(cachePath, result);
    writeStreamEvent(response, { type: "done" });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "Failed to generate progress recap." });
  } finally {
    response.end();
  }
}

async function searchLibraryWithAi(env, payload) {
  const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 300) : "";
  const candidates = normalizeLibrarySearchCandidates(payload?.candidates);
  if (!query) throw new Error("Search query is required.");
  if (!candidates.length) throw new Error("Library candidates are required.");

  const catalog = candidates
    .map(
      (candidate, index) =>
        `${index + 1}. id=${JSON.stringify(candidate.id)} | series=${candidate.seriesTitle || "未分组"} | name=${candidate.name} | path=${candidate.relativePath} | tags=${candidate.tags.join(", ") || "无"} | progress=${candidate.progressLabel || "未知"} | favorite=${candidate.isFavorite ? "yes" : "no"} | completed=${candidate.isCompleted ? "yes" : "no"}`,
    )
    .join("\n");

  const raw = await callDeepSeek(
    env,
    [
      {
        role: "system",
        content:
          "你是本地片库搜索助手。搜索范围是用户提供的当前媒体模式候选视频，不是当前继续观看条目。只能从候选视频中选择，不能编造片名或使用候选外内容。answer 只能解释 matchIds 中已选中的条目；如果没有明确匹配，answer 写“AI 未找到明确匹配”。请返回严格 JSON：{\"answer\":\"简短中文理由\",\"matchIds\":[\"候选 id\"]}。matchIds 最多 5 个。",
      },
      {
        role: "user",
        content: `搜索需求：${query}\n\n候选片库：\n${catalog}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const matchIds = Array.isArray(parsed?.matchIds)
    ? parsed.matchIds.filter((id) => typeof id === "string" && candidateIds.has(id)).slice(0, 5)
    : [];
  const answer = normalizeAiLibrarySearchAnswer(parsed, matchIds);
  return { answer, matchIds };
}

async function suggestTagMergeWithAi(env, payload) {
  const newTags = Array.isArray(payload?.newTags)
    ? payload.newTags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 12)
    : [];
  const existingTags = Array.isArray(payload?.existingTags)
    ? payload.existingTags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 80)
    : [];
  if (!newTags.length || !existingTags.length) return {};

  const raw = await callDeepSeek(
    env,
    [
      {
        role: "system",
        content:
          "你是视频标签整理助手。只能判断用户给出的新标签是否和已有标签语义相同或非常接近。返回严格 JSON：{\"newTag\":\"新标签\",\"existingTag\":\"已有标签\",\"reason\":\"简短中文原因\"}。如果没有明确合并建议，返回 {}。",
      },
      {
        role: "user",
        content: `新标签：${newTags.join("、")}\n已有标签：${existingTags.join("、")}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const newTag = typeof parsed?.newTag === "string" && newTags.includes(parsed.newTag) ? parsed.newTag : "";
  const existingTag =
    typeof parsed?.existingTag === "string" && existingTags.includes(parsed.existingTag) ? parsed.existingTag : "";
  if (!newTag || !existingTag) return {};
  return {
    newTag,
    existingTag,
    reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 120) : "",
  };
}

function createBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body));
}

function collectJsonResponse(response, requestLabel) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error("Bangumi response is too large."));
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Bangumi API ${response.statusCode}: ${text.slice(0, 300) || response.statusMessage || requestLabel}`));
        return;
      }
      try {
        resolve(JSON.parse(text || "{}"));
      } catch {
        reject(new Error("Bangumi returned invalid JSON."));
      }
    });
    response.on("error", reject);
  });
}

function requestJsonDirect(urlString, options) {
  const target = new URL(urlString);
  const bodyBuffer = createBodyBuffer(options.body);
  const headers = {
    ...options.headers,
    ...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
  };
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: options.method || "GET",
        headers,
      },
      (response) => {
        collectJsonResponse(response, urlString).then(resolve, reject);
      },
    );
    request.setTimeout(options.timeoutMs ?? 12000, () => request.destroy(new Error("Bangumi request timed out.")));
    request.on("error", reject);
    request.end(bodyBuffer ?? undefined);
  });
}

function createProxyAuthorization(proxy) {
  if (!proxy.username) return {};
  const credentials = Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64");
  return { "Proxy-Authorization": `Basic ${credentials}` };
}

function requestJsonViaHttpProxy(urlString, options) {
  const target = new URL(urlString);
  const proxy = new URL(options.proxyUrl);
  if (target.protocol !== "https:") throw new Error("Bangumi proxy requests only support HTTPS targets.");
  if (proxy.protocol !== "http:") throw new Error("BANGUMI_LENS_PROXY must use the http:// scheme.");

  const bodyBuffer = createBodyBuffer(options.body);
  const headers = {
    ...options.headers,
    ...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
  };
  const connectPath = `${target.hostname}:${target.port || 443}`;

  return new Promise((resolve, reject) => {
    let innerRequest = null;
    const fail = (error) => {
      if (innerRequest) innerRequest.destroy(error);
      reject(error);
    };
    const connectRequest = http.request({
      host: proxy.hostname,
      port: Number(proxy.port || 80),
      method: "CONNECT",
      path: connectPath,
      headers: {
        Host: connectPath,
        ...createProxyAuthorization(proxy),
      },
    });
    connectRequest.setTimeout(options.timeoutMs ?? 12000, () =>
      connectRequest.destroy(new Error("Bangumi proxy connection timed out.")),
    );
    connectRequest.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        fail(new Error(`Bangumi proxy CONNECT failed with ${response.statusCode}.`));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname });
      innerRequest = https.request(
        {
          host: target.hostname,
          port: Number(target.port || 443),
          method: options.method || "GET",
          path: `${target.pathname}${target.search}`,
          headers,
          createConnection: () => tlsSocket,
        },
        (response) => {
          collectJsonResponse(response, urlString).then(resolve, fail);
        },
      );
      innerRequest.setTimeout(options.timeoutMs ?? 12000, () =>
        innerRequest.destroy(new Error("Bangumi request timed out.")),
      );
      innerRequest.on("error", fail);
      innerRequest.end(bodyBuffer ?? undefined);
    });
    connectRequest.on("error", fail);
    connectRequest.end();
  });
}

function requestJsonWithOptionalProxy(urlString, options) {
  if (options.proxyUrl) return requestJsonViaHttpProxy(urlString, options);
  return requestJsonDirect(urlString, options);
}

async function requestBangumiJson(env, pathname, payload) {
  const userAgent = typeof env.BANGUMI_USER_AGENT === "string" ? env.BANGUMI_USER_AGENT.trim() : "";
  const token = typeof env.BANGUMI_ACCESS_TOKEN === "string" ? env.BANGUMI_ACCESS_TOKEN.trim() : "";
  if (!userAgent || !token) throw new Error("Bangumi is not configured.");

  return requestJsonWithOptionalProxy(`https://api.bgm.tv${pathname}`, {
    method: "POST",
    proxyUrl: typeof env.BANGUMI_LENS_PROXY === "string" && env.BANGUMI_LENS_PROXY.trim() ? env.BANGUMI_LENS_PROXY.trim() : "",
    timeoutMs: 12000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

function normalizeBangumiTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[[^\]]*]/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\b(?:s|season)\s*\d{1,2}\b/gi, " ")
    .replace(/\b(?:ep?|episode)\s*\d{1,4}\b/gi, " ")
    .replace(/\b(?:1080p|2160p|720p|4k|8k|x264|x265|h264|h265|hevc|avc|aac|web-dl|bdrip|bluray)\b/gi, " ")
    .replace(/[._\-:：/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactBangumiTitle(value) {
  return normalizeBangumiTitle(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  if (value.length <= 1) return value ? [value] : [];
  const parts = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    parts.push(value.slice(index, index + 2));
  }
  return parts;
}

function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aParts = bigrams(a);
  const bParts = bigrams(b);
  const bCounts = new Map();
  bParts.forEach((part) => bCounts.set(part, (bCounts.get(part) ?? 0) + 1));
  let overlap = 0;
  aParts.forEach((part) => {
    const count = bCounts.get(part) ?? 0;
    if (count > 0) {
      overlap += 1;
      bCounts.set(part, count - 1);
    }
  });
  return (2 * overlap) / (aParts.length + bParts.length);
}

function scoreBangumiSubject(title, subject) {
  const target = normalizeBangumiTitle(title);
  const targetCompact = compactBangumiTitle(title);
  const names = [subject.name, subject.nameCn].filter(Boolean);
  let best = 0;
  names.forEach((name) => {
    const normalized = normalizeBangumiTitle(name);
    const compact = compactBangumiTitle(name);
    if (!normalized || !compact) return;
    if (normalized === target) best = Math.max(best, 100);
    if (compact === targetCompact) best = Math.max(best, 96);
    if (normalized.startsWith(target) || target.startsWith(normalized)) best = Math.max(best, 88);
    if (normalized.includes(target) || target.includes(normalized)) best = Math.max(best, 82);
    best = Math.max(best, Math.round(diceCoefficient(targetCompact, compact) * 75));
  });
  return best;
}

function normalizeBangumiSubject(raw, title) {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const subject = {
    id,
    name: typeof raw?.name === "string" ? raw.name : "",
    nameCn: typeof raw?.name_cn === "string" ? raw.name_cn : "",
    url: `https://bgm.tv/subject/${id}`,
    score: Number.isFinite(Number(raw?.rating?.score)) ? Number(raw.rating.score) : undefined,
    rank: Number.isFinite(Number(raw?.rank)) ? Number(raw.rank) : undefined,
    date: typeof raw?.date === "string" ? raw.date : undefined,
    summary: typeof raw?.summary === "string" ? raw.summary.slice(0, 240) : undefined,
  };
  return {
    ...subject,
    matchScore: scoreBangumiSubject(title, subject),
  };
}

function normalizeBangumiSearchPayload(payload, title) {
  const subjects = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return subjects.map((subject) => normalizeBangumiSubject(subject, title)).filter(Boolean);
}

async function searchBangumiSubjects(env, title) {
  const queries = Array.from(new Set([title.trim(), normalizeBangumiTitle(title)].filter(Boolean))).slice(0, 2);
  const subjectsById = new Map();
  for (const query of queries) {
    const payload = await requestBangumiJson(env, "/v0/search/subjects?limit=5", {
      keyword: query,
      sort: "match",
      filter: { type: [2] },
    });
    normalizeBangumiSearchPayload(payload, title).forEach((subject) => {
      const existing = subjectsById.get(subject.id);
      if (!existing || subject.matchScore > existing.matchScore) {
        subjectsById.set(subject.id, subject);
      }
    });
  }
  return Array.from(subjectsById.values()).sort((a, b) => b.matchScore - a.matchScore || (b.score ?? 0) - (a.score ?? 0));
}

function publicBangumiCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    nameCn: candidate.nameCn,
    url: candidate.url,
    score: candidate.score,
    rank: candidate.rank,
    date: candidate.date,
    matchScore: candidate.matchScore,
  };
}

function createBangumiMatchResult(payload, status, overrides = {}) {
  return {
    status,
    seriesKey: payload.seriesKey,
    title: payload.title,
    subject: null,
    confidence: "none",
    source: status === "error" ? "error" : "none",
    candidates: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

async function selectBangumiCandidateWithAi(env, title, samples, candidates) {
  if (!env.DEEPSEEK_API_KEY || !candidates.length) return null;
  const catalog = candidates
    .slice(0, 5)
    .map(
      (candidate, index) =>
        `${index + 1}. id=${candidate.id} | name=${candidate.name || "-"} | name_cn=${candidate.nameCn || "-"} | date=${candidate.date || "-"} | rank=${candidate.rank ?? "-"} | matchScore=${candidate.matchScore}`,
    )
    .join("\n");
  const raw = await callDeepSeek(env, [
    {
      role: "system",
      content:
        "You match a local anime series title to one Bangumi candidate. Return strict JSON only: {\"subjectId\":123,\"confidence\":\"medium\",\"reason\":\"short Chinese reason\"}. Use null subjectId if no candidate is reliable. Never invent ids.",
    },
    {
      role: "user",
      content: `Local series title: ${title}\nSample files:\n${samples.slice(0, 8).join("\n") || "-"}\n\nBangumi candidates:\n${catalog}`,
    },
  ]);
  const parsed = parseAiJsonObject(raw);
  const selectedId = Number(parsed?.subjectId ?? parsed?.id);
  return candidates.find((candidate) => candidate.id === selectedId) ?? null;
}

function normalizeBangumiMatchPayload(payload) {
  const libraryId = typeof payload?.libraryId === "string" ? payload.libraryId.trim().slice(0, 160) : "";
  const seriesKey = typeof payload?.seriesKey === "string" ? payload.seriesKey.trim().slice(0, 240) : "";
  const title = typeof payload?.title === "string" ? payload.title.trim().slice(0, 240) : "";
  const sampleVideoNames = Array.isArray(payload?.sampleVideoNames)
    ? payload.sampleVideoNames.filter((item) => typeof item === "string").map((item) => item.slice(0, 240)).slice(0, 8)
    : [];
  const sampleRelativePaths = Array.isArray(payload?.sampleRelativePaths)
    ? payload.sampleRelativePaths.filter((item) => typeof item === "string").map((item) => item.slice(0, 360)).slice(0, 8)
    : [];
  return {
    libraryId,
    seriesKey,
    title,
    sampleVideoNames,
    sampleRelativePaths,
    force: Boolean(payload?.force),
  };
}

async function matchBangumiSeries(env, rawPayload) {
  const payload = normalizeBangumiMatchPayload(rawPayload);
  if (!payload.libraryId || !payload.seriesKey || !payload.title) {
    return createBangumiMatchResult(payload, "error", { error: "Bangumi match payload is incomplete." });
  }

  const cacheId = hashValue(`bangumi|${payload.libraryId}|${payload.seriesKey}|${payload.title}`);
  const cachePath = path.join(bangumiMatchesRoot, `${cacheId}.json`);
  if (!payload.force) {
    const cached = await readJsonFile(cachePath, null);
    if (cached?.status) return { ...cached, source: "cache" };
  }

  if (!env.BANGUMI_USER_AGENT || !env.BANGUMI_ACCESS_TOKEN) {
    return createBangumiMatchResult(payload, "error", { error: "Bangumi is not configured." });
  }

  try {
    const candidates = await searchBangumiSubjects(env, payload.title);
    if (!candidates.length) {
      const result = createBangumiMatchResult(payload, "none");
      await writeJsonFile(cachePath, result);
      return result;
    }

    const top = candidates[0];
    const next = candidates[1];
    const gap = top.matchScore - (next?.matchScore ?? 0);
    if (top.matchScore >= 92 || (top.matchScore >= 82 && gap >= 18)) {
      const result = createBangumiMatchResult(payload, "matched", {
        subject: publicBangumiCandidate(top),
        confidence: "high",
        source: "bangumi",
        candidates: candidates.slice(0, 5).map(publicBangumiCandidate),
      });
      await writeJsonFile(cachePath, result);
      return result;
    }

    const aiSelected = await selectBangumiCandidateWithAi(
      env,
      payload.title,
      [...payload.sampleVideoNames, ...payload.sampleRelativePaths],
      candidates,
    );
    if (aiSelected) {
      const result = createBangumiMatchResult(payload, "matched", {
        subject: publicBangumiCandidate(aiSelected),
        confidence: "medium",
        source: "ai",
        candidates: candidates.slice(0, 5).map(publicBangumiCandidate),
      });
      await writeJsonFile(cachePath, result);
      return result;
    }

    const result = createBangumiMatchResult(payload, "none", {
      confidence: top.matchScore >= 60 ? "low" : "none",
      candidates: candidates.slice(0, 5).map(publicBangumiCandidate),
    });
    await writeJsonFile(cachePath, result);
    return result;
  } catch (error) {
    return createBangumiMatchResult(payload, "error", {
      error: error instanceof Error ? error.message : "Failed to match Bangumi subject.",
    });
  }
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
  let mediaRootsScanPromise = null;
  let photoAlbumsScanPromise = null;
  let localDataStoreReadyPromise = null;
  const getLocalDataStore = async () => {
    localDataStoreReadyPromise ??= localDataStore.initialize();
    await localDataStoreReadyPromise;
    return localDataStore;
  };
  const getTools = () => {
    toolsPromise ??= detectTools();
    return toolsPromise;
  };
  const scanMediaRootsOnce = async () => {
    if (!mediaRootsScanPromise) {
      mediaRootsScanPromise = (async () => scanConfiguredMediaRoots(await loadAppConfig()))().finally(() => {
        mediaRootsScanPromise = null;
      });
    }
    return mediaRootsScanPromise;
  };
  const scanPhotoAlbumsOnce = async () => {
    if (!photoAlbumsScanPromise) {
      photoAlbumsScanPromise = (async () => scanConfiguredPhotoAlbums(await loadAppConfig()))().finally(() => {
        photoAlbumsScanPromise = null;
      });
    }
    return photoAlbumsScanPromise;
  };

  const middleware = async (request, response, next) => {
    if (!request.url?.startsWith("/api/")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://127.0.0.1");
    const libraryMatch = url.pathname.match(/^\/api\/player-data\/libraries\/([^/]+)$/);
    const thumbnailMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)$/);
    const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/(.+)$/);
    const compatibleMediaMatch = url.pathname.match(/^\/api\/media-compatible\/([a-f0-9]{64})\.mp4$/);
    const progressMatch = url.pathname.match(/^\/api\/player-data\/progress\/(.+)$/);
    const favoriteMatch = url.pathname.match(/^\/api\/player-data\/favorites\/(.+)$/);
    const tagsMatch = url.pathname.match(/^\/api\/player-data\/tags\/(.+)$/);
    const statsMatch = url.pathname.match(/^\/api\/player-data\/stats\/(.+)$/);
    const preferenceMatch = url.pathname.match(/^\/api\/player-data\/preferences\/([^/]+)$/);
    const settingMatch = url.pathname.match(/^\/api\/player-data\/settings\/([^/]+)$/);
    const danmakuSelectionMatch = url.pathname.match(/^\/api\/player-data\/danmaku-selection\/(.+)$/);
    const photoAlbumProgressMatch = url.pathname.match(/^\/api\/photo-albums\/progress\/(.+)$/);
    const photoAlbumFavoriteMatch = url.pathname.match(/^\/api\/photo-albums\/favorites\/(.+)$/);

    try {
      const store = await getLocalDataStore();

      if (url.pathname === "/api/local-config" && request.method === "GET") {
        sendJson(response, 200, publicLocalConfig(await loadAppConfig(), await getTools(), env));
        return;
      }

      if (url.pathname === "/api/bootstrap" && request.method === "GET") {
        const playerData = store.loadPlayerDataStore("global");
        sendJson(response, 200, {
          theme: playerData?.settings?.theme === "light" ? "light" : "dark",
          settings: playerData?.settings ?? {},
          preferences: playerData?.preferences ?? {},
          metadata: playerData?.metadata ?? null,
        });
        return;
      }

      if (url.pathname === "/api/media-roots/scan" && request.method === "GET") {
        sendJson(response, 200, await scanMediaRootsOnce());
        return;
      }

      if (url.pathname === "/api/photo-albums/scan" && request.method === "GET") {
        sendJson(response, 200, await scanPhotoAlbumsOnce());
        return;
      }

      if (url.pathname === "/api/local-config/media-root" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        const mediaRoot = await upsertMediaRoot(payload);
        sendJson(response, 200, {
          ...publicLocalConfig(await loadAppConfig(), await getTools(), env),
          mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/local-config/media-root/local-path" && request.method === "PUT") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        const result = await updateMediaRootLocalPath(payload);
        sendJson(response, 200, {
          ...publicLocalConfig(result.config, await getTools(), env),
          mediaRoot: result.mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/cache-status" && request.method === "GET") {
        sendJson(response, 200, await createCacheStatus());
        return;
      }

      if (url.pathname === "/api/cache-status/clear" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await clearCacheItems(payload));
        return;
      }

      if (mediaMatch && request.method === "GET") {
        const rootId = decodeURIComponent(mediaMatch[1]);
        const relativePath = mediaMatch[2].split("/").map((segment) => decodeURIComponent(segment)).join("/");
        const filePath = resolveMediaPath(await loadAppConfig(), rootId, relativePath);
        await sendMediaFile(request, response, filePath);
        return;
      }

      if (compatibleMediaMatch && request.method === "GET") {
        const filePath = resolveCompatibleMediaPath(compatibleMediaRoot, compatibleMediaMatch[1]);
        await sendMediaFile(request, response, filePath);
        return;
      }

      if (url.pathname === "/api/media/probe" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await probeMedia(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/media/compatible/remux" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await remuxMediaToCompatibleMp4(await loadAppConfig(), payload));
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

      if (url.pathname === "/api/subtitles/embedded/cached" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await readCachedEmbeddedSubtitle(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/danmaku/fetch" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await fetchDanmakuSource(payload));
        return;
      }

      if (url.pathname === "/api/danmaku/source" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await readDanmakuSource(payload?.sourceId));
        return;
      }

      if (url.pathname === "/api/ai/subtitles/summarize" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamSubtitleSummary(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/ask" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamSubtitleAnswer(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/recap" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        await streamProgressRecap(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/library/search" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await searchLibraryWithAi(env, payload));
        return;
      }

      if (url.pathname === "/api/player-data/global") {
        if (request.method === "GET") {
          const payload = store.loadPlayerDataStore("global");
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Global data not found." });
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          const payload = JSON.parse(rawBody.toString("utf8"));
          store.savePlayerDataStore("global", payload);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/photo-albums/global") {
        if (request.method === "GET") {
          const payload = store.loadPhotoAlbumStore();
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Photo album data not found." });
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          const payload = JSON.parse(rawBody.toString("utf8"));
          store.savePhotoAlbumStore(payload);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (progressMatch) {
        const videoId = decodeURIComponent(progressMatch[1]);
        if (request.method === "PUT") {
          const payload = JSON.parse((await readBody(request)).toString("utf8"));
          store.upsertProgress("global", videoId, payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.upsertProgress("global", videoId, null);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (favoriteMatch) {
        const videoId = decodeURIComponent(favoriteMatch[1]);
        if (request.method === "PUT" || request.method === "DELETE") {
          store.setFavorite("global", videoId, request.method === "PUT");
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (tagsMatch && request.method === "PUT") {
        const videoId = decodeURIComponent(tagsMatch[1]);
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.replaceVideoTags("global", videoId, payload?.tags ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/player-data/tag-merge-decisions" && request.method === "PUT") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.replaceTagMergeDecisions("global", payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (statsMatch && request.method === "PUT") {
        const videoId = decodeURIComponent(statsMatch[1]);
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.upsertVideoStats("global", videoId, payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (preferenceMatch && request.method === "PUT") {
        const key = decodeURIComponent(preferenceMatch[1]);
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.setPreferenceValue("global", key, payload?.value ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (settingMatch && request.method === "PUT") {
        const key = decodeURIComponent(settingMatch[1]);
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.setSettingValue("global", key, payload?.value ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (danmakuSelectionMatch) {
        const videoId = decodeURIComponent(danmakuSelectionMatch[1]);
        if (request.method === "PUT") {
          const payload = JSON.parse((await readBody(request)).toString("utf8"));
          store.upsertDanmakuSelection("global", videoId, payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.upsertDanmakuSelection("global", videoId, null);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/player-data/danmaku-preferences" && request.method === "PUT") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.replaceDanmakuPreferences("global", payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (photoAlbumProgressMatch && request.method === "PUT") {
        const albumId = decodeURIComponent(photoAlbumProgressMatch[1]);
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.replacePhotoAlbumProgress(albumId, payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (photoAlbumFavoriteMatch) {
        const albumId = decodeURIComponent(photoAlbumFavoriteMatch[1]);
        if (request.method === "PUT" || request.method === "DELETE") {
          store.setPhotoAlbumFavorite(albumId, request.method === "PUT");
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/photo-albums/preferences" && request.method === "PUT") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        store.replacePhotoAlbumPreferences(payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/photo-albums/scan-cache") {
        if (request.method === "GET") {
          const payload = store.loadLatestPhotoAlbumScanCache();
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Photo album scan cache not found." });
          return;
        }
        if (request.method === "PUT") {
          const payload = JSON.parse((await readBody(request)).toString("utf8"));
          store.savePhotoAlbumScanCache(payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.clearPhotoAlbumScanCache();
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/ai/tags/merge-suggestion" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await suggestTagMergeWithAi(env, payload));
        return;
      }

      if (url.pathname === "/api/bangumi/series/match" && request.method === "POST") {
        const payload = JSON.parse((await readBody(request)).toString("utf8"));
        sendJson(response, 200, await matchBangumiSeries(env, payload));
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
          const payload = store.loadPlayerDataStore(libraryId);
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Library data not found." });
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          const payload = JSON.parse(rawBody.toString("utf8"));
          store.savePlayerDataStore(libraryId, payload);
          store.updateIndex(libraryId, payload.metadata);
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
          store.recordCacheEntry("thumbnail", thumbnailId, filePath, request.headers["content-type"] ?? null, rawBody.length);
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
    server: {
      watch: {
        ignored: [
          "**/.git/**",
          "**/.local-web-player-data/**",
          "**/.npm-cache/**",
          "**/dist/**",
        ],
      },
    },
    plugins: [react(), playerDataApiPlugin(env)],
  };
});
