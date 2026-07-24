import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyMediaProbe,
  createCompatibleMediaUrl,
  getCachedCompatibleMedia,
  probeMediaFile,
  remuxCompatibleMedia,
  resolveCompatibleMediaPath,
} from "./mediaCompatibility.mjs";
import { assertMontageMediaRoot, createHighlightMontage } from "./highlightMontage.mjs";
import {
  assertLadaMediaRoot,
  createLadaCapabilitiesLoader,
  detectLadaExecutable,
  restoreVideoWithLada,
} from "./ladaRestoration.mjs";
import {
  ensureFileExists,
  normalizeMediaRoots as normalizeMediaRootsFromConfig,
  resolveMediaPath as resolveMediaPathFromConfig,
  resolvePhotoPath as resolvePhotoPathFromConfig,
  resolveVideoPath as resolveVideoPathFromConfig,
  scanConfiguredPhotoAlbums,
  scanConfiguredMediaRoots,
  updateMediaRootLocalPath as updateMediaRootLocalPathInConfig,
  upsertMediaRoot as upsertMediaRootInConfig,
} from "./mediaRoots.mjs";
import {
  createDanmakuComment,
  createDanmakuSourceId,
  dedupeDanmakuComments,
  parseDanmakuUrl,
} from "../src/danmakuUtils";
import { parseAiJsonObject } from "./aiResponseUtils.mjs";
import {
  createProgressRecapCache,
  createSubtitleAnswerCache,
  createSubtitleSummaryCache,
  writeCachedAiStreamResult,
} from "./aiStreamCache.mjs";
import { scoreDuplicateNameSimilarityWithAi, suggestTagMergeWithAi } from "./aiLibraryService.mjs";
import {
  createBangumiMatchResult,
  normalizeBangumiMatchPayload,
  normalizeBangumiSearchPayload,
  normalizeBangumiTitle,
  publicBangumiCandidate,
} from "./bangumiMatchUtils.mjs";
import { requestBangumiJson } from "./bangumiClient.mjs";
import { createBilibiliDanmakuService } from "./bilibiliDanmaku.mjs";
import { createBahamutDanmakuService } from "./bahamutDanmaku.mjs";
import { clearLocalCacheItems, createCacheStatus as createLocalCacheStatus, createDanmakuSourcesStats } from "./cacheStatus.mjs";
import { callDeepSeek, chunkText, streamDeepSeek } from "./deepSeekClient.mjs";
import { createEmbeddedSubtitleService } from "./embeddedSubtitles.mjs";
import { hashValue } from "./hashUtils.mjs";
import { sendBlob, sendJson, sendMediaFile, sendNdjson, sendSerializedJson, writeStreamEvent } from "./httpResponses.mjs";
import { readJsonFile, writeJsonFile } from "./jsonFiles.mjs";
import { createPublicLocalConfig, defaultAppConfig } from "./localConfig.mjs";
import { createMediaProcessingTaskApi, createMediaProcessingTaskManager } from "./mediaProcessingTask.mjs";
import { detectTools, runProcess } from "./processRunner.mjs";
import { formatRemoteFetchError, requestExternalJson, requestExternalText } from "./remoteFetch.mjs";
import { parseJsonBody, readBody, sanitizeStorageId } from "./requestUtils.mjs";
import { LocalDataSqliteStore } from "./sqliteStorage.mjs";
import { BoundedLruCache } from "./boundedLruCache.mjs";
import { createPlayerDeferredData, createPlayerStartupData } from "./playerDataViews.mjs";
import { createVideoThumbnailService } from "./videoThumbnailService.mjs";
import { createThumbnailMemoryCache } from "./thumbnailMemoryCache.mjs";
import { createMosaicStore } from "./mosaicStore.mjs";

let dataRoot;
let librariesRoot;
let thumbnailsRoot;
let actorCoversRoot;
let mosaicsRoot;
let photoAlbumsRoot;
let embeddedSubtitlesRoot;
let compatibleMediaRoot;
let danmakuSourcesRoot;
let aiRoot;
let bangumiMatchesRoot;
let indexPath;
let globalDataPath;
let appConfigPath;
let localDataStore;
let bilibiliDanmaku;
let bahamutDanmaku;
let embeddedSubtitles;
let mosaicStore;

const serverPhotoAlbumCacheRootId = "server-photo-albums";
const serverPhotoAlbumCacheRootName = "媒体库看图";

function initializeApiServices(projectRoot) {
  dataRoot = path.resolve(projectRoot, ".local-web-player-data");
  librariesRoot = path.join(dataRoot, "libraries");
  thumbnailsRoot = path.join(dataRoot, "thumbnails");
  actorCoversRoot = path.join(dataRoot, "actor-covers");
  mosaicsRoot = path.join(dataRoot, "mosaics");
  photoAlbumsRoot = path.join(dataRoot, "photo-albums");
  embeddedSubtitlesRoot = path.join(dataRoot, "subtitles");
  compatibleMediaRoot = path.join(dataRoot, "compatible-media");
  const danmakuRoot = path.join(dataRoot, "danmaku");
  danmakuSourcesRoot = path.join(danmakuRoot, "sources");
  aiRoot = path.join(dataRoot, "ai");
  const bangumiRoot = path.join(dataRoot, "bangumi");
  bangumiMatchesRoot = path.join(bangumiRoot, "matches");
  indexPath = path.join(dataRoot, "index.json");
  globalDataPath = path.join(dataRoot, "global.json");
  appConfigPath = path.resolve(projectRoot, "config", "app.json");
  localDataStore = new LocalDataSqliteStore({ dataRoot, librariesRoot, photoAlbumsRoot, indexPath, globalDataPath });
  mosaicStore = createMosaicStore(mosaicsRoot);
  bilibiliDanmaku = createBilibiliDanmakuService({
    createDanmakuComment,
    dedupeDanmakuComments,
    formatRemoteFetchError,
    requestExternalJson,
    requestExternalText,
  });
  bahamutDanmaku = createBahamutDanmakuService({
    createDanmakuComment,
    dedupeDanmakuComments,
    formatRemoteFetchError,
    requestExternalJson,
    requestExternalText,
  });
  embeddedSubtitles = createEmbeddedSubtitleService({
    cacheRoot: embeddedSubtitlesRoot,
    resolveVideoPath: resolveVideoPathFromConfig,
    ensureFileExists,
    runProcess,
    hashValue,
    readTextFile,
  });
}

async function readTextFile(filePath, fallback = null) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function createDanmakuSourcePath(sourceId, options = {}) {
  const encodedName = `${encodeURIComponent(sourceId)}.json`;
  return path.join(danmakuSourcesRoot, options.legacy ? `${sourceId}.json` : encodedName);
}

function createCacheStatusDefinitions(thumbnailMemoryStats = { entries: 0, bytes: 0 }) {
  return [
    { id: "bangumi-matches", label: "Bangumi 匹配", path: bangumiMatchesRoot },
    { id: "global", label: "全局播放数据", path: globalDataPath },
    { id: "libraries", label: "播放数据", path: librariesRoot },
    {
      id: "thumbnails",
      label: "视频缩略图",
      path: thumbnailsRoot,
      memoryBytes: thumbnailMemoryStats.bytes,
      memoryEntries: thumbnailMemoryStats.entries,
      memoryHits: thumbnailMemoryStats.hits ?? 0,
      memoryMisses: thumbnailMemoryStats.misses ?? 0,
      memoryCoalesced: thumbnailMemoryStats.coalesced ?? 0,
      memoryDiskReads: thumbnailMemoryStats.diskReads ?? 0,
    },
    { id: "actor-covers", label: "演员封面", path: actorCoversRoot },
    { id: "mosaics", label: "千图作品", path: mosaicsRoot },
    { id: "photo-albums", label: "看图数据", path: photoAlbumsRoot },
    { id: "subtitles", label: "内封字幕", path: embeddedSubtitlesRoot },
    { id: "compatible-media", label: "兼容播放缓存", path: compatibleMediaRoot },
    { id: "danmaku-sources", label: "弹幕源", path: danmakuSourcesRoot, getStats: () => createDanmakuSourcesStats(danmakuSourcesRoot) },
    { id: "ai-summaries", label: "AI 字幕总结", path: path.join(aiRoot, "summaries") },
    { id: "ai-qa", label: "AI 字幕问答", path: path.join(aiRoot, "qa") },
    { id: "ai-recaps", label: "AI 进度回顾", path: path.join(aiRoot, "recaps") },
    { id: "index", label: "索引数据", path: indexPath },
  ];
}

async function createCacheStatus(thumbnailMemoryStats) {
  return createLocalCacheStatus({
    dataRoot,
    definitions: createCacheStatusDefinitions(thumbnailMemoryStats),
    createDatabaseStatusItem: () => localDataStore.createDatabaseStatusItem(),
  });
}

async function clearCacheItems(payload, thumbnailMemoryStats) {
  return clearLocalCacheItems(payload, {
    dataRoot,
    createStatus: () => createCacheStatus(thumbnailMemoryStats),
    clearCacheEntriesByKinds: (kinds) => localDataStore.clearCacheEntriesByKinds(kinds),
  });
}

async function upsertMediaRoot(payload) {
  return upsertMediaRootInConfig(appConfigPath, payload);
}

async function updateMediaRootLocalPath(payload) {
  return updateMediaRootLocalPathInConfig(appConfigPath, payload);
}

async function loadAppConfig() {
  return readJsonFile(appConfigPath, defaultAppConfig);
}

function findMediaRoot(config, rootId) {
  const id = typeof rootId === "string" ? rootId.trim() : "";
  return normalizeMediaRootsFromConfig(config).find((root) => root.id === id) ?? null;
}

function createMediaProbeResponse(result) {
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
      canRemux: result.canRemux,
    },
  };
}

function withCompatibleMediaUrl(response, cached) {
  return {
    ...response,
    playability: {
      ...response.playability,
      ...(cached.compatibleUrl ? { compatibleUrl: cached.compatibleUrl } : {}),
    },
  };
}

function isUsableMediaProbeCache(value) {
  return Boolean(value?.playability && typeof value.playability.canRemux === "boolean");
}

async function probeMedia(config, payload, store) {
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

  const videoPath = resolveVideoPathFromConfig(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const fileStat = await stat(videoPath);
  const video = {
    name: path.basename(videoPath),
    relativePath: payload.relativePath,
    size: fileStat.size,
    lastModified: Math.round(fileStat.mtimeMs),
  };
  const fileIdentity = { size: video.size, lastModified: video.lastModified };
  const cachedProbe = store.getMediaProbeCache(root.id, video.relativePath, fileIdentity);
  const cachedCompatibleMedia = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
  if (isUsableMediaProbeCache(cachedProbe)) {
    return withCompatibleMediaUrl(cachedProbe, cachedCompatibleMedia);
  }

  const rawProbe = await probeMediaFile(runProcess, videoPath);
  const result = classifyMediaProbe(rawProbe, video.name);
  const response = createMediaProbeResponse(result);
  store.saveMediaProbeCache(root.id, video.relativePath, fileIdentity, response);
  return withCompatibleMediaUrl(response, cachedCompatibleMedia);
}

async function remuxMediaToCompatibleMp4(config, payload, options = {}) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能生成兼容 MP4。");
  }

  const videoPath = resolveVideoPathFromConfig(config, payload?.rootId, payload?.relativePath);
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
  if (!result.canRemux || (result.playability.status !== "remuxRecommended" && result.playability.status !== "direct")) {
    throw new Error(result.playability.reason || "当前视频不能无损生成兼容 MP4。");
  }

  const cached = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
  if (!cached.compatibleUrl) {
    await remuxCompatibleMedia({
      runProcess,
      sourcePath: videoPath,
      outputPath: cached.cachePath,
      durationSeconds: Number(result.probe?.format?.duration) || 0,
      signal: options.signal,
      onProgress: options.onProgress,
    });
  } else {
    options.onProgress?.({ percent: 100, message: "已存在兼容缓存，直接使用缓存文件。" });
  }

  return {
    cacheId: cached.cacheId,
    compatibleUrl: createCompatibleMediaUrl(cached.cacheId),
    playability: {
      ...result.playability,
      canRemux: result.canRemux,
      compatibleUrl: createCompatibleMediaUrl(cached.cacheId),
    },
  };
}

async function deleteCompatibleMedia(config, payload) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要先配置本机路径，才能删除兼容 MP4。");
  }

  const videoPath = resolveVideoPathFromConfig(config, payload?.rootId, payload?.relativePath);
  await ensureFileExists(videoPath);
  const fileStat = await stat(videoPath);
  const video = {
    name: path.basename(videoPath),
    relativePath: payload.relativePath,
    size: fileStat.size,
    lastModified: Math.round(fileStat.mtimeMs),
  };
  const cached = await getCachedCompatibleMedia(compatibleMediaRoot, root.id, video);
  await rm(cached.cachePath, { force: true });
  return { deleted: Boolean(cached.compatibleUrl), cacheId: cached.cacheId };
}

async function deleteMediaVideo(config, payload) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要重新授权目录后才能删除磁盘文件。");
  }

  const videoPath = resolveVideoPathFromConfig(config, payload?.rootId, payload?.relativePath);
  try {
    await ensureFileExists(videoPath);
  } catch (error) {
    if (error?.code === "ENOENT") return { deleted: false, missing: true };
    throw error;
  }
  await rm(videoPath, { force: false });
  return { deleted: true };
}

async function deletePhotoImage(config, payload) {
  const root = findMediaRoot(config, payload?.rootId);
  if (!root) throw new Error("Unknown media root.");
  if (root.source === "browser" && !root.localPath) {
    throw new Error("浏览器添加的媒体库需要重新授权目录后才能删除磁盘图片。");
  }

  const photoPath = resolvePhotoPathFromConfig(config, payload?.rootId, payload?.relativePath);
  try {
    await ensureFileExists(photoPath);
  } catch (error) {
    if (error?.code === "ENOENT") return { deleted: false, missing: true };
    throw error;
  }
  await rm(photoPath, { force: false });
  return { deleted: true };
}

async function streamRemuxMediaToCompatibleMp4(config, payload, request, response) {
  sendNdjson(response, 200);
  const controller = new AbortController();
  let finished = false;
  response.on("close", () => {
    if (!finished) controller.abort();
  });
  try {
    writeStreamEvent(response, { type: "progress", percent: 0, message: "正在准备生成任务..." });
    const result = await remuxMediaToCompatibleMp4(config, payload, {
      signal: controller.signal,
      onProgress: (progress) => writeStreamEvent(response, { type: "progress", ...progress }),
    });
    writeStreamEvent(response, { type: "done", result });
  } catch (error) {
    writeStreamEvent(response, { type: "error", error: error instanceof Error ? error.message : "生成兼容 MP4 失败。" });
  } finally {
    finished = true;
    response.end();
  }
}

async function writeDanmakuSource(record) {
  await mkdir(danmakuSourcesRoot, { recursive: true });
  const language = record.comments.reduce((selected, comment) => {
    if (selected === "mixed") return selected;
    if (comment.sourceLanguage && comment.sourceLanguage !== selected) return selected === "unknown" ? comment.sourceLanguage : "mixed";
    return selected;
  }, "unknown");
  const translatedCount = record.comments.filter((comment) => comment.simplifiedText && comment.simplifiedText !== comment.text).length;
  const sourceBreakdown =
    record.sourceBreakdown ||
    [
      {
        provider: record.provider,
        label: record.provider === "bilibili" ? "Bilibili" : record.title,
        sourceUrl: record.sourceUrl,
        commentCount: record.comments.length,
        translatedCount,
      },
    ];
  const source = {
    id: createDanmakuSourceId(record.provider, `${record.sourceUrl}|${record.title}|${record.comments.length}`),
    provider: record.provider,
    title: record.title,
    sourceUrl: record.sourceUrl,
    language,
    commentCount: record.comments.length,
    translatedCount,
    updatedAt: Date.now(),
    sourceBreakdown,
  };
  const payload = { source, comments: record.comments };
  await writeJsonFile(createDanmakuSourcePath(source.id), payload);
  return payload;
}

function createDanmakuRecordFromPayload(payload) {
  return {
    provider: payload.source.provider,
    title: payload.source.title,
    sourceUrl: payload.source.sourceUrl,
    comments: payload.comments,
    sourceBreakdown:
      payload.source.sourceBreakdown ||
      [
        {
          provider: payload.source.provider,
          label: payload.source.provider === "bilibili" ? "Bilibili" : payload.source.title,
          sourceUrl: payload.source.sourceUrl,
          commentCount: payload.source.commentCount,
          translatedCount: payload.source.translatedCount,
        },
      ],
  };
}

function mergeDanmakuRecords(currentRecord, nextRecord) {
  const nextSourceUrls = new Set((nextRecord.sourceBreakdown || []).map((source) => source.sourceUrl).filter(Boolean));
  const currentBreakdown = (currentRecord.sourceBreakdown || []).filter((source) => !source.sourceUrl || !nextSourceUrls.has(source.sourceUrl));
  const sourceBreakdown = [...currentBreakdown, ...(nextRecord.sourceBreakdown || [])];
  const comments = dedupeDanmakuComments([...currentRecord.comments, ...nextRecord.comments]);
  return {
    provider: sourceBreakdown.length > 1 ? "combined" : nextRecord.provider,
    title: sourceBreakdown.length > 1 ? "多来源弹幕" : nextRecord.title,
    sourceUrl: sourceBreakdown.map((source) => source.sourceUrl).filter(Boolean).join(" | ") || nextRecord.sourceUrl,
    comments,
    sourceBreakdown,
  };
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
  if (!parsed) throw new Error("请输入支持的 Bilibili 或巴哈姆特动画疯弹幕链接。");

  const record =
    parsed.provider === "bilibili"
      ? await bilibiliDanmaku.fetchBilibiliDanmaku(parsed)
      : parsed.provider === "bahamut"
        ? await bahamutDanmaku.fetchBahamutDanmaku(parsed)
      : null;
  if (!record) throw new Error("Unsupported danmaku provider.");
  if (!record.comments.length) throw new Error("没有解析到弹幕。");
  const mergeSourceId = typeof payload?.mergeSourceId === "string" ? payload.mergeSourceId : "";
  if (!mergeSourceId) return writeDanmakuSource(record);
  try {
    const currentPayload = await readDanmakuSource(mergeSourceId);
    return writeDanmakuSource(mergeDanmakuRecords(createDanmakuRecordFromPayload(currentPayload), record));
  } catch {
    return writeDanmakuSource(record);
  }
}

async function streamSubtitleSummary(env, payload, response) {
  sendNdjson(response, 200);
  try {
    const subtitleText = typeof payload?.subtitleText === "string" ? payload.subtitleText.trim() : "";
    if (!subtitleText) throw new Error("Subtitle text is required.");
    const { cachePath } = createSubtitleSummaryCache(aiRoot, payload?.videoName, subtitleText);
    const cached = await readJsonFile(cachePath, null);
    if (writeCachedAiStreamResult(response, cached, "summary")) return;

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
    const { cachePath } = createSubtitleAnswerCache(aiRoot, payload?.videoName, question, context);
    const cached = await readJsonFile(cachePath, null);
    if (writeCachedAiStreamResult(response, cached, "answer")) return;

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
    const { cachePath } = createProgressRecapCache(aiRoot, payload?.videoName, subtitleId, recapEndSeconds, viewedText);
    const cached = await readJsonFile(cachePath, null);
    if (writeCachedAiStreamResult(response, cached, "recap")) return;

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

export function playerDataApiPlugin({ projectRoot, env }) {
  initializeApiServices(projectRoot);
  const videoThumbnailService = createVideoThumbnailService({ cacheRoot: thumbnailsRoot, runProcess, maxConcurrency: 1 });
  const thumbnailMemoryCache = createThumbnailMemoryCache();
  const mediaRootScanCache = new BoundedLruCache({ maxEntries: 2, maxBytes: 8 * 1024 * 1024 });
  let toolsPromise = null;
  let ladaAvailablePromise = null;
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
  const getLadaAvailable = () => {
    ladaAvailablePromise ??= detectLadaExecutable();
    return ladaAvailablePromise;
  };
  const loadLadaCapabilities = createLadaCapabilitiesLoader(runProcess);
  const mediaProcessingTaskApi = createMediaProcessingTaskApi(createMediaProcessingTaskManager());
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
      photoAlbumsScanPromise = (async () => {
        const scan = await scanConfiguredPhotoAlbums(await loadAppConfig());
        const store = await getLocalDataStore();
        store.savePhotoAlbumScanCache({
          rootId: serverPhotoAlbumCacheRootId,
          rootName: serverPhotoAlbumCacheRootName,
          albums: scan.albums,
          scannedFiles: scan.scannedFiles,
          updatedAt: scan.metadata?.updatedAt ?? Date.now(),
        });
        return scan;
      })().finally(() => {
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
    const thumbnailGenerateMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)\/generate$/);
    const thumbnailMatch = url.pathname.match(/^\/api\/player-data\/thumbnails\/([^/]+)$/);
    const actorCoverMatch = url.pathname.match(/^\/api\/player-data\/actor-covers\/([^/]+)$/);
    const mosaicAssetMatch = url.pathname.match(/^\/api\/mosaics\/([^/]+)\/(target|preview)$/);
    const mosaicProjectMatch = url.pathname.match(/^\/api\/mosaics\/([^/]+)$/);
    const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)\/(.+)$/);
    const compatibleMediaMatch = url.pathname.match(/^\/api\/media-compatible\/([a-f0-9]{64})\.mp4$/);
    const progressMatch = url.pathname.match(/^\/api\/player-data\/progress\/(.+)$/);
    const favoriteMatch = url.pathname.match(/^\/api\/player-data\/favorites\/(.+)$/);
    const tagsMatch = url.pathname.match(/^\/api\/player-data\/tags\/(.+)$/);
    const ratingMatch = url.pathname.match(/^\/api\/player-data\/ratings\/(.+)$/);
    const commentMatch = url.pathname.match(/^\/api\/player-data\/comments\/(.+)$/);
    const statsMatch = url.pathname.match(/^\/api\/player-data\/stats\/(.+)$/);
    const highlightsMatch = url.pathname.match(/^\/api\/player-data\/highlights\/(.+)$/);
    const editSegmentsMatch = url.pathname.match(/^\/api\/player-data\/edit-segments\/(.+)$/);
    const preferenceMatch = url.pathname.match(/^\/api\/player-data\/preferences\/([^/]+)$/);
    const settingMatch = url.pathname.match(/^\/api\/player-data\/settings\/([^/]+)$/);
    const danmakuSelectionMatch = url.pathname.match(/^\/api\/player-data\/danmaku-selection\/(.+)$/);
    const photoAlbumProgressMatch = url.pathname.match(/^\/api\/photo-albums\/progress\/(.+)$/);
    const photoAlbumFavoriteMatch = url.pathname.match(/^\/api\/photo-albums\/favorites\/(.+)$/);
    const photoAlbumCoverMatch = url.pathname.match(/^\/api\/photo-albums\/cover\/(.+)$/);
    const photoAlbumTagsMatch = url.pathname.match(/^\/api\/photo-albums\/tags\/(.+)$/);

    try {
      const store = await getLocalDataStore();

      if (url.pathname === "/api/mosaics") {
        if (request.method === "GET") {
          sendJson(response, 200, await mosaicStore.listProjects());
          return;
        }
      }

      if (url.pathname === "/api/mosaics/features") {
        if (request.method === "POST") {
          const payload = await parseJsonBody(request);
          const sourceIds = Array.isArray(payload?.sourceIds) ? payload.sourceIds.filter((value) => typeof value === "string") : [];
          sendJson(response, 200, await mosaicStore.readFeatures(sourceIds));
          return;
        }
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          await mosaicStore.writeFeatures(Array.isArray(payload?.features) ? payload.features : []);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (mosaicAssetMatch) {
        const projectId = sanitizeStorageId(decodeURIComponent(mosaicAssetMatch[1]));
        const kind = mosaicAssetMatch[2];
        if (!projectId) {
          sendJson(response, 400, { error: "Invalid mosaic project id." });
          return;
        }
        if (request.method === "GET") {
          try {
            const asset = await mosaicStore.readAsset(projectId, kind);
            sendBlob(response, 200, asset.buffer, { contentType: asset.contentType, cacheControl: "no-cache" });
          } catch {
            response.statusCode = 404;
            response.end();
          }
          return;
        }
        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          await mosaicStore.writeAsset(projectId, kind, rawBody, request.headers["content-type"]);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (mosaicProjectMatch) {
        const projectId = sanitizeStorageId(decodeURIComponent(mosaicProjectMatch[1]));
        if (!projectId) {
          sendJson(response, 400, { error: "Invalid mosaic project id." });
          return;
        }
        if (request.method === "GET") {
          const project = await mosaicStore.readProject(projectId);
          sendJson(response, project ? 200 : 404, project ?? { error: "Mosaic project not found." });
          return;
        }
        if (request.method === "PUT") {
          await mosaicStore.writeProject(projectId, await parseJsonBody(request));
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          await mosaicStore.deleteProject(projectId);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/local-config" && request.method === "GET") {
        sendJson(response, 200, createPublicLocalConfig(await loadAppConfig(), await getTools(), env, await getLadaAvailable()));
        return;
      }

      if (url.pathname === "/api/media/lada/options" && request.method === "GET") {
        if (!await getLadaAvailable()) {
          sendJson(response, 404, { error: "未找到 D:\\lada\\lada-cli.exe。" });
          return;
        }
        sendJson(response, 200, await loadLadaCapabilities());
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

      if (url.pathname === "/api/media-roots/scan-cache") {
        if (request.method === "GET") {
          const cached = mediaRootScanCache.get("global");
          if (cached) {
            sendSerializedJson(response, 200, cached.serialized, { cacheStatus: "HIT", timings: { cache: 0 } });
            return;
          }
          const startedAt = performance.now();
          const payload = store.loadMediaRootScanCache();
          if (!payload) {
            sendJson(response, 404, { error: "Media root scan cache not found." }, { cacheStatus: "MISS" });
            return;
          }
          const serialized = JSON.stringify(payload);
          mediaRootScanCache.set("global", { serialized }, Buffer.byteLength(serialized));
          sendSerializedJson(response, 200, serialized, {
            cacheStatus: "MISS",
            timings: { sqlite: performance.now() - startedAt },
          });
          return;
        }
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.saveMediaRootScanCache(payload);
          const serialized = JSON.stringify(payload);
          mediaRootScanCache.set("global", { serialized }, Buffer.byteLength(serialized));
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/photo-albums/scan" && request.method === "GET") {
        sendJson(response, 200, await scanPhotoAlbumsOnce());
        return;
      }

      if (url.pathname === "/api/local-config/media-root" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        const mediaRoot = await upsertMediaRoot(payload);
        sendJson(response, 200, {
          ...createPublicLocalConfig(await loadAppConfig(), await getTools(), env, await getLadaAvailable()),
          mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/local-config/media-root/local-path" && request.method === "PUT") {
        const payload = await parseJsonBody(request);
        const result = await updateMediaRootLocalPath(payload);
        sendJson(response, 200, {
          ...createPublicLocalConfig(result.config, await getTools(), env, await getLadaAvailable()),
          mediaRoot: result.mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/cache-status" && request.method === "GET") {
        sendJson(response, 200, await createCacheStatus(thumbnailMemoryCache.stats()));
        return;
      }

      if (url.pathname === "/api/cache-status/clear" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        const result = await clearCacheItems(payload, thumbnailMemoryCache.stats());
        if (result.cleared.includes("thumbnails")) {
          thumbnailMemoryCache.clear();
          result.status = await createCacheStatus(thumbnailMemoryCache.stats());
        }
        sendJson(response, 200, result);
        return;
      }

      if (mediaMatch && request.method === "GET") {
        const rootId = decodeURIComponent(mediaMatch[1]);
        const relativePath = mediaMatch[2].split("/").map((segment) => decodeURIComponent(segment)).join("/");
        const filePath = resolveMediaPathFromConfig(await loadAppConfig(), rootId, relativePath);
        await sendMediaFile(request, response, filePath);
        return;
      }

      if (compatibleMediaMatch && request.method === "GET") {
        const filePath = resolveCompatibleMediaPath(compatibleMediaRoot, compatibleMediaMatch[1]);
        await sendMediaFile(request, response, filePath);
        return;
      }

      if (url.pathname === "/api/media/probe" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await probeMedia(await loadAppConfig(), payload, store));
        return;
      }

      if (url.pathname === "/api/media/compatible/remux" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        await streamRemuxMediaToCompatibleMp4(await loadAppConfig(), payload, request, response);
        return;
      }

      if (url.pathname === "/api/media/processing-task" && request.method === "GET") {
        sendJson(response, 200, mediaProcessingTaskApi.get());
        return;
      }

      if (url.pathname === "/api/media/processing-task" && request.method === "DELETE") {
        const payload = await parseJsonBody(request);
        try {
          sendJson(response, 200, mediaProcessingTaskApi.cancel(payload));
        } catch (error) {
          sendJson(response, 404, { error: error instanceof Error ? error.message : "媒体处理任务不存在或已结束。" });
        }
        return;
      }

      if (url.pathname === "/api/media/highlight-montage" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        const config = await loadAppConfig();
        const root = findMediaRoot(config, payload?.rootId);
        assertMontageMediaRoot(root);
        const sourcePath = resolveVideoPathFromConfig(config, root.id, payload?.relativePath);
        await ensureFileExists(sourcePath);
        const sourceVideoId = typeof payload?.sourceVideoId === "string" ? payload.sourceVideoId : "";
        const sourceHighlights = Array.isArray(payload?.highlights)
          ? payload.highlights
          : store.loadPlayerDataStore("global").videoHighlights[sourceVideoId] ?? [];
        try {
          sendJson(response, 202, mediaProcessingTaskApi.start({
            kind: "montage",
            videoName: path.basename(sourcePath),
            initialStatus: "正在准备剪辑任务...",
            run: ({ signal, onProgress }) => createHighlightMontage({
              runProcess,
              sourcePath,
              rootId: root.id,
              relativePath: payload?.relativePath,
              mode: payload?.mode === "lossless" ? "lossless" : "precise",
              segments: payload?.segments,
              sourceHighlights,
              signal,
              onProgress,
              persistMetadata: (videoId, highlights) => store.copyVideoMetadata("global", sourceVideoId, videoId, {
                actorIds: payload?.actorIds,
                highlights,
              }),
            }),
          }));
        } catch (error) {
          sendJson(response, 409, { error: error instanceof Error ? error.message : "已有影片处理任务正在运行。" });
        }
        return;
      }

      if (url.pathname === "/api/media/lada/restore" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        const config = await loadAppConfig();
        const root = findMediaRoot(config, payload?.rootId);
        if (!await getLadaAvailable()) throw new Error("未找到 D:\\lada\\lada-cli.exe。");
        assertLadaMediaRoot(root);
        const sourcePath = resolveVideoPathFromConfig(config, root.id, payload?.relativePath);
        await ensureFileExists(sourcePath);
        const capabilities = await loadLadaCapabilities();
        const sourceVideoId = typeof payload?.sourceVideoId === "string" ? payload.sourceVideoId : "";
        const sourceHighlights = Array.isArray(payload?.highlights)
          ? payload.highlights
          : store.loadPlayerDataStore("global").videoHighlights[sourceVideoId] ?? [];
        try {
          sendJson(response, 202, mediaProcessingTaskApi.start({
            kind: "lada",
            videoName: path.basename(sourcePath),
            initialStatus: "正在准备马赛克修复...",
            run: ({ signal, onProgress }) => restoreVideoWithLada({
              runProcess,
              sourcePath,
              rootId: root.id,
              relativePath: payload?.relativePath,
              sourceHighlights,
              highlightsOnly: payload?.highlightsOnly === true,
              highlightMontageMode: payload?.highlightMontageMode === "precise" ? "precise" : "lossless",
              options: payload?.options,
              capabilities,
              signal,
              onProgress,
              persistHighlights: (videoId, highlights) => payload?.highlightsOnly === true
                ? store.copyVideoMetadata("global", sourceVideoId, videoId, { highlights: [] })
                : store.replaceVideoHighlights("global", videoId, highlights),
            }),
          }));
        } catch (error) {
          sendJson(response, 409, { error: error instanceof Error ? error.message : "已有影片处理任务正在运行。" });
        }
        return;
      }

      if (url.pathname === "/api/media/compatible" && request.method === "DELETE") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await deleteCompatibleMedia(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/media/video" && request.method === "DELETE") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await deleteMediaVideo(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/photo-albums/photo" && request.method === "DELETE") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await deletePhotoImage(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/probe" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await embeddedSubtitles.probeEmbeddedSubtitles(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/extract" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await embeddedSubtitles.extractEmbeddedSubtitle(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/subtitles/embedded/cached" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await embeddedSubtitles.readCachedEmbeddedSubtitle(await loadAppConfig(), payload));
        return;
      }

      if (url.pathname === "/api/danmaku/fetch" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await fetchDanmakuSource(payload));
        return;
      }

      if (url.pathname === "/api/danmaku/source" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await readDanmakuSource(payload?.sourceId));
        return;
      }

      if (url.pathname === "/api/ai/subtitles/summarize" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        await streamSubtitleSummary(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/ask" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        await streamSubtitleAnswer(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/subtitles/recap" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        await streamProgressRecap(env, payload, response);
        return;
      }

      if (url.pathname === "/api/ai/duplicate/name-similarity" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await scoreDuplicateNameSimilarityWithAi(env, payload));
        return;
      }

      if (url.pathname === "/api/player-data/global") {
        if (request.method === "GET") {
          const startedAt = performance.now();
          const payload = store.loadPlayerDataStore("global");
          const view = url.searchParams.get("view");
          const responsePayload = view === "startup"
            ? createPlayerStartupData(payload)
            : view === "deferred"
              ? createPlayerDeferredData(payload)
              : payload;
          sendJson(response, responsePayload ? 200 : 404, responsePayload ?? { error: "Global data not found." }, {
            timings: { sqlite: performance.now() - startedAt },
          });
          return;
        }

        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.savePlayerDataStore("global", payload);
          sendJson(response, 200, { ok: true });
          return;
        }

        if (request.method === "PATCH") {
          const payload = await parseJsonBody(request);
          store.patchPlayerDataStore("global", payload);
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
          const payload = await parseJsonBody(request);
          store.savePhotoAlbumStore(payload);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (progressMatch) {
        const videoId = decodeURIComponent(progressMatch[1]);
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
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
        const payload = await parseJsonBody(request);
        store.replaceVideoTags("global", videoId, payload?.tags ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (ratingMatch) {
        const videoId = decodeURIComponent(ratingMatch[1]);
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.setVideoRating("global", videoId, payload?.rating ?? payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.setVideoRating("global", videoId, null);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (commentMatch) {
        const videoId = decodeURIComponent(commentMatch[1]);
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.setVideoComment("global", videoId, payload?.comment ?? payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.setVideoComment("global", videoId, "");
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/player-data/tag-merge-decisions" && request.method === "PUT") {
        const payload = await parseJsonBody(request);
        store.replaceTagMergeDecisions("global", payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (statsMatch && request.method === "PUT") {
        const videoId = decodeURIComponent(statsMatch[1]);
        const payload = await parseJsonBody(request);
        store.upsertVideoStats("global", videoId, payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/player-data/watch-activity" && request.method === "PUT") {
        const payload = await parseJsonBody(request);
        store.upsertWatchActivity("global", payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (highlightsMatch && request.method === "PUT") {
        const videoId = decodeURIComponent(highlightsMatch[1]);
        const payload = await parseJsonBody(request);
        store.replaceVideoHighlights("global", videoId, payload?.highlights ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (editSegmentsMatch && request.method === "PUT") {
        const videoId = decodeURIComponent(editSegmentsMatch[1]);
        const payload = await parseJsonBody(request);
        store.replaceVideoEditSegments("global", videoId, payload?.segments ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (preferenceMatch && request.method === "PUT") {
        const key = decodeURIComponent(preferenceMatch[1]);
        const payload = await parseJsonBody(request);
        store.setPreferenceValue("global", key, payload?.value ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (settingMatch && request.method === "PUT") {
        const key = decodeURIComponent(settingMatch[1]);
        const payload = await parseJsonBody(request);
        store.setSettingValue("global", key, payload?.value ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (danmakuSelectionMatch) {
        const videoId = decodeURIComponent(danmakuSelectionMatch[1]);
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
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
        const payload = await parseJsonBody(request);
        store.replaceDanmakuPreferences("global", payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (photoAlbumProgressMatch && request.method === "PUT") {
        const albumId = decodeURIComponent(photoAlbumProgressMatch[1]);
        const payload = await parseJsonBody(request);
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

      if (photoAlbumCoverMatch) {
        const albumId = decodeURIComponent(photoAlbumCoverMatch[1]);
        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.setPhotoAlbumCoverPreference(albumId, payload?.imageId ?? payload);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "DELETE") {
          store.setPhotoAlbumCoverPreference(albumId, "");
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (photoAlbumTagsMatch && request.method === "PUT") {
        const albumId = decodeURIComponent(photoAlbumTagsMatch[1]);
        const payload = await parseJsonBody(request);
        store.replacePhotoAlbumTags(albumId, payload?.tags ?? payload);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/photo-albums/preferences" && request.method === "PUT") {
        const payload = await parseJsonBody(request);
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
          const payload = await parseJsonBody(request);
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
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await suggestTagMergeWithAi(env, payload));
        return;
      }

      if (url.pathname === "/api/bangumi/series/match" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await matchBangumiSeries(env, payload));
        return;
      }

      if (libraryMatch) {
        const libraryId = sanitizeStorageId(decodeURIComponent(libraryMatch[1]));
        if (!libraryId) {
          sendJson(response, 400, { error: "Invalid library id." });
          return;
        }

        if (request.method === "GET") {
          const payload = store.loadPlayerDataStore(libraryId);
          sendJson(response, payload ? 200 : 404, payload ?? { error: "Library data not found." });
          return;
        }

        if (request.method === "PUT") {
          const payload = await parseJsonBody(request);
          store.savePlayerDataStore(libraryId, payload);
          store.updateIndex(libraryId, payload.metadata);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (thumbnailGenerateMatch && request.method === "POST") {
        const thumbnailId = sanitizeStorageId(decodeURIComponent(thumbnailGenerateMatch[1]));
        if (!thumbnailId) {
          sendJson(response, 400, { error: "Invalid thumbnail id." });
          return;
        }
        const payload = await parseJsonBody(request);
        const config = await loadAppConfig();
        const root = findMediaRoot(config, payload?.rootId);
        if (!root) {
          sendJson(response, 400, { error: "Unknown media root." });
          return;
        }
        if (root.source === "browser" && !root.localPath) {
          sendJson(response, 409, { error: "浏览器媒体库需要先配置本机路径，才能由服务端生成缩略图。" });
          return;
        }
        if (!(await getTools()).ffmpeg) {
          sendJson(response, 409, { error: "未检测到 ffmpeg，无法由服务端生成缩略图。" });
          return;
        }
        const sourcePath = resolveVideoPathFromConfig(config, root.id, payload?.relativePath);
        await ensureFileExists(sourcePath);
        const variant = payload?.variant === "mosaic-target" || payload?.variant === "playlist" ? payload.variant : "standard";
        const generated = await videoThumbnailService.generate({ thumbnailId, sourcePath, variant });
        store.recordCacheEntry("thumbnail", thumbnailId, generated.filePath, "image/jpeg", generated.size);
        await thumbnailMemoryCache.getOrLoad({ thumbnailId, filePath: generated.filePath, contentType: "image/jpeg" });
        sendJson(response, 200, {
          thumbnailUrl: `/api/player-data/thumbnails/${encodeURIComponent(thumbnailId)}`,
          cached: generated.cached,
        });
        return;
      }

      if (thumbnailMatch) {
        const thumbnailId = sanitizeStorageId(decodeURIComponent(thumbnailMatch[1]));
        if (!thumbnailId) {
          sendJson(response, 400, { error: "Invalid thumbnail id." });
          return;
        }

        const filePath = path.join(thumbnailsRoot, `${thumbnailId}.blob`);
        if (request.method === "GET" || request.method === "HEAD") {
          try {
            const etag = `"${thumbnailId}"`;
            const thumbnail = await thumbnailMemoryCache.getOrLoad({
              thumbnailId,
              filePath,
              contentType: "image/jpeg",
            });
            const headers = {
              contentType: thumbnail.contentType,
              cacheControl: "public, max-age=31536000, immutable",
              etag,
            };
            response.setHeader("X-Thumbnail-Memory-Cache", thumbnail.cacheStatus);
            if (request.headers["if-none-match"] === etag) {
              response.statusCode = 304;
              response.setHeader("Cache-Control", headers.cacheControl);
              response.setHeader("ETag", etag);
              response.end();
              return;
            }
            if (request.method === "HEAD") {
              response.statusCode = 200;
              response.setHeader("Content-Type", headers.contentType);
              response.setHeader("Content-Length", thumbnail.buffer.length);
              response.setHeader("Cache-Control", headers.cacheControl);
              response.setHeader("ETag", etag);
              response.end();
              return;
            }
            sendBlob(response, 200, thumbnail.buffer, headers);
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
          thumbnailMemoryCache.set(thumbnailId, rawBody, request.headers["content-type"] ?? "image/jpeg");
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (actorCoverMatch) {
        const coverId = sanitizeStorageId(decodeURIComponent(actorCoverMatch[1]));
        if (!coverId) {
          sendJson(response, 400, { error: "Invalid actor cover id." });
          return;
        }

        const filePath = path.join(actorCoversRoot, `${coverId}.blob`);
        if (request.method === "GET") {
          try {
            const cacheEntry = store.getCacheEntry("actor-cover", coverId);
            const etag = `"${coverId}-${cacheEntry?.updated_at ?? 0}"`;
            await stat(filePath);
            if (request.headers["if-none-match"] === etag) {
              response.statusCode = 304;
              response.setHeader("Cache-Control", "no-cache");
              response.setHeader("ETag", etag);
              response.end();
              return;
            }
            sendBlob(response, 200, await readFile(filePath), {
              contentType: cacheEntry?.content_type || "image/jpeg",
              cacheControl: "no-cache",
              etag,
            });
          } catch {
            response.statusCode = 404;
            response.end();
          }
          return;
        }

        if (request.method === "PUT") {
          const rawBody = await readBody(request);
          await mkdir(actorCoversRoot, { recursive: true });
          await writeFile(filePath, rawBody);
          store.recordCacheEntry("actor-cover", coverId, filePath, request.headers["content-type"] ?? null, rawBody.length);
          sendJson(response, 200, { ok: true });
          return;
        }

        if (request.method === "DELETE") {
          await rm(filePath, { force: true });
          store.deleteCacheEntry("actor-cover", coverId);
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
    async configureServer(server) {
      await thumbnailMemoryCache.warmDirectory({ cacheRoot: thumbnailsRoot });
      server.middlewares.use(middleware);
    },
    async configurePreviewServer(server) {
      await thumbnailMemoryCache.warmDirectory({ cacheRoot: thumbnailsRoot });
      server.middlewares.use(middleware);
    },
  };
}




