import path from "node:path";

import { hashValue } from "./hashUtils.mjs";
import { writeStreamEvent } from "./httpResponses.mjs";

const AI_STREAM_CACHE_DIRS = {
  summary: "summaries",
  qa: "qa",
  recap: "recaps",
};

export function createAiStreamCachePath(aiRoot, cacheType, cacheId) {
  return path.join(aiRoot, AI_STREAM_CACHE_DIRS[cacheType], `${cacheId}.json`);
}

export function createSubtitleSummaryCache(aiRoot, videoName, subtitleText) {
  const cacheId = hashValue(`summary|${videoName || ""}|${subtitleText}`);
  return { cacheId, cachePath: createAiStreamCachePath(aiRoot, "summary", cacheId) };
}

export function createSubtitleAnswerCache(aiRoot, videoName, question, context) {
  const cacheId = hashValue(`qa|${videoName || ""}|${question}|${context}`);
  return { cacheId, cachePath: createAiStreamCachePath(aiRoot, "qa", cacheId) };
}

export function createProgressRecapCache(aiRoot, videoName, subtitleId, recapEndSeconds, viewedText) {
  const cacheId = hashValue(`recap|${videoName || ""}|${subtitleId}|${recapEndSeconds}|${viewedText}`);
  return { cacheId, cachePath: createAiStreamCachePath(aiRoot, "recap", cacheId) };
}

export function writeCachedAiStreamResult(response, cached, field) {
  const text = cached?.[field];
  if (!text) return false;
  writeStreamEvent(response, { type: "result", text });
  writeStreamEvent(response, { type: "done" });
  return true;
}
