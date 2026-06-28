// @ts-nocheck
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  classifyMediaProbe,
  createCompatibleMediaUrl,
  getCachedCompatibleMedia,
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
import { parseAiJsonObject } from "./server/aiResponseUtils.mjs";
import {
  createProgressRecapCache,
  createSubtitleAnswerCache,
  createSubtitleSummaryCache,
  writeCachedAiStreamResult,
} from "./server/aiStreamCache.mjs";
import { searchLibraryWithAi, suggestTagMergeWithAi } from "./server/aiLibraryService.mjs";
import {
  createBangumiMatchResult,
  normalizeBangumiMatchPayload,
  normalizeBangumiSearchPayload,
  normalizeBangumiTitle,
  publicBangumiCandidate,
} from "./server/bangumiMatchUtils.mjs";
import { requestBangumiJson } from "./server/bangumiClient.mjs";
import { createBilibiliDanmakuService } from "./server/bilibiliDanmaku.mjs";
import { clearLocalCacheItems, createCacheStatus as createLocalCacheStatus, createDanmakuSourcesStats } from "./server/cacheStatus.mjs";
import { callDeepSeek, chunkText, streamDeepSeek } from "./server/deepSeekClient.mjs";
import { createEmbeddedSubtitleService } from "./server/embeddedSubtitles.mjs";
import { hashValue } from "./server/hashUtils.mjs";
import { sendBlob, sendJson, sendMediaFile, sendNdjson, writeStreamEvent } from "./server/httpResponses.mjs";
import { readJsonFile, writeJsonFile } from "./server/jsonFiles.mjs";
import { createPublicLocalConfig, defaultAppConfig } from "./server/localConfig.mjs";
import { detectTools, runProcess } from "./server/processRunner.mjs";
import { formatRemoteFetchError, requestExternalJson, requestExternalText } from "./server/remoteFetch.mjs";
import { parseJsonBody, readBody, sanitizeStorageId } from "./server/requestUtils.mjs";
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
const bilibiliDanmaku = createBilibiliDanmakuService({
  createDanmakuComment,
  dedupeDanmakuComments,
  formatRemoteFetchError,
  requestExternalJson,
  requestExternalText,
});
const embeddedSubtitles = createEmbeddedSubtitleService({
  cacheRoot: embeddedSubtitlesRoot,
  resolveVideoPath: resolveVideoPathFromConfig,
  ensureFileExists,
  runProcess,
  hashValue,
  readTextFile,
});

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
        sendJson(response, 200, createPublicLocalConfig(await loadAppConfig(), await getTools(), env));
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
        const payload = await parseJsonBody(request);
        const mediaRoot = await upsertMediaRoot(payload);
        sendJson(response, 200, {
          ...createPublicLocalConfig(await loadAppConfig(), await getTools(), env),
          mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/local-config/media-root/local-path" && request.method === "PUT") {
        const payload = await parseJsonBody(request);
        const result = await updateMediaRootLocalPath(payload);
        sendJson(response, 200, {
          ...createPublicLocalConfig(result.config, await getTools(), env),
          mediaRoot: result.mediaRoot,
        });
        return;
      }

      if (url.pathname === "/api/cache-status" && request.method === "GET") {
        sendJson(response, 200, await createCacheStatus());
        return;
      }

      if (url.pathname === "/api/cache-status/clear" && request.method === "POST") {
        const payload = await parseJsonBody(request);
        sendJson(response, 200, await clearCacheItems(payload));
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

      if (url.pathname === "/api/ai/library/search" && request.method === "POST") {
        const payload = await parseJsonBody(request);
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
          const payload = await parseJsonBody(request);
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
