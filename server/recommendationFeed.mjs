import { readFile } from "node:fs/promises";
import path from "node:path";

import { probeMediaFile } from "./mediaCompatibility.mjs";

const CACHE_VERSION = 1;
const ANALYZER_VERSION = 1;
const ANALYSIS_CONCURRENCY = 3;
const ANALYSIS_RETRY_BACKOFF_MS = 60 * 60 * 1000;
const STORE_SNAPSHOT_TTL_MS = 30_000;
const DEFAULT_SEGMENT_SECONDS = 52;
const MIN_SEGMENT_SECONDS = 30;
const MAX_SEGMENT_SECONDS = 90;
const MAX_BEHAVIOR_WINDOWS = 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function modeMatchesRoot(root, mode) {
  const label = String(root?.label ?? "").trim();
  return mode === "anime" ? label.toLowerCase() === "anime" : label.toUpperCase().endsWith("AV");
}

function videoFingerprint(video) {
  return `${video.id}|${video.size}|${video.lastModified}|${ANALYZER_VERSION}`;
}

function videoSeriesKey(video) {
  const normalized = String(video.relativePath ?? "").replace(/\\/g, "/");
  return normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : video.name;
}

/** 同系列影片入口：与当前影片同目录的相邻影片（最近修改优先），供"看下一部/同系列"跳转。 */
function buildSeriesEntries(video, modeVideos, limit = 4) {
  const key = videoSeriesKey(video);
  if (!key) return undefined;
  const siblings = modeVideos
    .filter((candidate) => candidate.id !== video.id && videoSeriesKey(candidate) === key)
    .sort((left, right) => Number(right.lastModified || 0) - Number(left.lastModified || 0))
    .slice(0, limit);
  if (!siblings.length) return undefined;
  return siblings.map((candidate) => ({
    videoId: candidate.id,
    title: path.basename(candidate.name, path.extname(candidate.name)),
    relativePath: candidate.relativePath,
    mediaRootId: candidate.mediaRootId,
    playbackUrl: candidate.playability?.compatibleUrl || candidate.url,
    thumbnailUrl: candidate.thumbnailUrl || candidate.thumbUrl || candidate.posterUrl,
    duration: Number(candidate.duration) || 0,
  }));
}

function parseTimestamp(value) {
  const match = String(value).trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/u);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function parseSubtitleCues(source) {
  const cues = [];
  for (const block of String(source ?? "").replace(/\r/g, "").split(/\n{2,}/u)) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [rawStart, rawEnd] = lines[timingIndex].split("-->").map((value) => value.trim().split(/\s+/u)[0]);
    const startTime = parseTimestamp(rawStart);
    const endTime = parseTimestamp(rawEnd);
    if (startTime === null || endTime === null || endTime <= startTime) continue;
    cues.push({ startTime, endTime, text: lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/gu, "") });
  }
  return cues;
}

function subtitleScore(cues, startTime, endTime) {
  const visible = cues.filter((cue) => cue.endTime > startTime && cue.startTime < endTime);
  if (!visible.length) return { score: 0, cueCount: 0 };
  const text = visible.map((cue) => cue.text).join("");
  const density = clamp(visible.length / 15, 0, 1);
  const expressive = clamp((text.match(/[!?！？…]/gu)?.length ?? 0) / 6, 0, 1);
  const hookWords = text.match(/但是|原来|终于|竟然|为什么|不要|快走|危险|真相|秘密|喜欢|爱|死|杀|赢|输/gu)?.length ?? 0;
  return { score: density * 0.55 + expressive * 0.25 + clamp(hookWords / 4, 0, 1) * 0.2, cueCount: visible.length };
}

function parseSignalLog(log, durationSeconds) {
  const sceneScores = Array.from(String(log).matchAll(/lavfi\.scene_score=([\d.]+)/gu), (match) => Number(match[1])).filter(Number.isFinite);
  const meanVolume = Number(String(log).match(/mean_volume:\s*(-?[\d.]+) dB/u)?.[1]);
  const silenceStarts = Array.from(String(log).matchAll(/silence_start:\s*([\d.]+)/gu), (match) => Number(match[1]));
  const silenceEnds = Array.from(String(log).matchAll(/silence_end:\s*([\d.]+)/gu), (match) => Number(match[1]));
  let silenceSeconds = 0;
  for (let index = 0; index < Math.min(silenceStarts.length, silenceEnds.length); index += 1) {
    silenceSeconds += Math.max(0, silenceEnds[index] - silenceStarts[index]);
  }
  const sceneScore = sceneScores.length
    ? clamp(sceneScores.reduce((total, value) => total + value, 0) / sceneScores.length * 8, 0, 1)
    : 0;
  const audioScore = Number.isFinite(meanVolume) ? clamp((meanVolume + 42) / 28, 0, 1) : 0;
  const speechRatio = clamp(1 - silenceSeconds / Math.max(1, durationSeconds), 0, 1);
  return { sceneScore, audioScore, speechRatio };
}

function createCandidateWindows(duration, seed) {
  const segmentDuration = clamp(duration * 0.09, MIN_SEGMENT_SECONDS, Math.min(MAX_SEGMENT_SECONDS, duration));
  const usableDuration = Math.max(0, duration - segmentDuration);
  const jitter = ((stableNumber(seed) % 1000) / 1000 - 0.5) * Math.min(18, usableDuration * 0.04);
  return [0.18, 0.38, 0.58, 0.78].map((position) => {
    const startTime = clamp(usableDuration * position + jitter, 0, usableDuration);
    return { startTime, endTime: Math.min(duration, startTime + segmentDuration) };
  });
}

function createFallbackSegment(video, duration) {
  const segmentDuration = clamp(duration * 0.08, MIN_SEGMENT_SECONDS, Math.min(MAX_SEGMENT_SECONDS, duration));
  const usableDuration = Math.max(0, duration - segmentDuration);
  const position = 0.2 + (stableNumber(video.id) % 5700) / 10000;
  const startTime = clamp(usableDuration * position, 0, usableDuration);
  return {
    startTime,
    endTime: Math.min(duration, startTime + segmentDuration),
    score: 0.25,
    source: "fallback",
    reasons: ["正在分析这部影片，先播放一个代表性片段"],
  };
}

function normalizeManualSegment(highlight, duration) {
  const rawStart = clamp(Number(highlight.startTime) || 0, 0, duration);
  const rawEnd = clamp(Number(highlight.endTime) || rawStart, rawStart, duration);
  const rawDuration = rawEnd - rawStart;
  if (rawDuration >= MIN_SEGMENT_SECONDS && rawDuration <= MAX_SEGMENT_SECONDS) {
    return { startTime: rawStart, endTime: rawEnd };
  }
  const center = (rawStart + rawEnd) / 2;
  const targetDuration = clamp(rawDuration || DEFAULT_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, Math.min(MAX_SEGMENT_SECONDS, duration));
  const startTime = clamp(center - targetDuration / 2, 0, Math.max(0, duration - targetDuration));
  return { startTime, endTime: Math.min(duration, startTime + targetDuration) };
}

function feedbackScore(feedback) {
  return Math.min(1.2, (feedback?.completed ?? 0) * 0.25)
    + Math.min(0.8, (feedback?.replayed ?? 0) * 0.2)
    - Math.min(1.5, (feedback?.skipped ?? 0) * 0.18);
}

function hasValidSegment(segmentsByVideoId, video) {
  const cached = segmentsByVideoId?.[video.id];
  if (!cached) return false;
  return cached.fingerprint === videoFingerprint(video) && !cached.analysisPending && !cached.analysisFailedAt;
}

function rankVideos(videos, store, feedbackByVideoId, segmentsByVideoId) {
  const favorites = new Set(store?.favorites ?? []);
  return videos
    .filter((video) => !feedbackByVideoId[video.id]?.dismissed)
    .map((video) => {
      const progress = store?.items?.[video.id];
      const rating = Number(store?.videoRatings?.[video.id]) || 0;
      // 进度感知：完全没看过的新鲜内容提权，看一半的不打断追剧节奏，看完的短期降权。
      let progressScore = 0;
      if (progress?.completed) progressScore = -0.4;
      else if (!progress || !Number.isFinite(progress.currentTime) || (progress.currentTime ?? 0) <= 0) progressScore = 0.35;
      // 片段分析感知：已产出推荐片段的影片优先展示，未分析的兜底靠后，避免刷片流长时间停留在"从片头播放"。
      const analyzedScore = hasValidSegment(segmentsByVideoId, video) ? 0.3 : -0.35;
      const score = (favorites.has(video.id) ? 1.4 : 0)
        + rating * 0.12
        + progressScore
        + feedbackScore(feedbackByVideoId[video.id])
        + analyzedScore;
      return { video, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.video);
}

/**
 * 多路召回：从不同信号通道分别召回候选，再按权重交错融合（抖音式"多队列调度"）。
 * 各通道内部排序、互相允许重叠（融合时按 videoId 去重，先取到的通道生效）。
 */
const CHANNEL_WEIGHTS = { relevant: 4, hot: 2.5, fresh: 1.5, rewatch: 1 };

/** 高热度路：全库观看统计（累计播放秒数 / 播放次数 / 曝光次数）归一化排序。 */
function recallHot(videos, store) {
  const stats = store?.videoStats ?? {};
  return videos
    .map((video) => {
      const stat = stats[video.id];
      const playedSeconds = Number(stat?.totalPlayedSeconds) || 0;
      const playCount = Number(stat?.playCount) || 0;
      const emissionCount = Number(stat?.emissionCount) || 0;
      const score = clamp(playedSeconds / 7200, 0, 1) * 0.5
        + clamp(playCount / 10, 0, 1) * 0.3
        + clamp(emissionCount / 20, 0, 1) * 0.2;
      return { video, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.video);
}

/** 新片路：最近入库且完全没看过的影片，越新权重越高。 */
function recallFresh(videos, store, now) {
  const FRESH_DAYS = 30;
  return videos
    .map((video) => {
      const progress = store?.items?.[video.id];
      const untouched = !progress || !Number.isFinite(progress.currentTime) || (progress.currentTime ?? 0) <= 0;
      if (!untouched) return null;
      const ageDays = Math.max(0, (now - (Number(video.lastModified) || 0)) / 86400000);
      const score = ageDays < FRESH_DAYS ? 1 - ageDays / FRESH_DAYS : 0;
      return score > 0 ? { video, score } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.video);
}

/** 重温路：已看完且收藏或高评分的影片，冷却 7 天后重新进入候选。 */
function recallRewatch(videos, store, now) {
  const favorites = new Set(store?.favorites ?? []);
  const REWATCH_GAP_DAYS = 7;
  const REWATCH_WINDOW_DAYS = 90;
  return videos
    .map((video) => {
      const progress = store?.items?.[video.id];
      if (!progress?.completed) return null;
      const finishedAt = Number(progress.updatedAt) || 0;
      const gapDays = (now - finishedAt) / 86400000;
      if (gapDays < REWATCH_GAP_DAYS || gapDays > REWATCH_WINDOW_DAYS) return null;
      const rating = Number(store?.videoRatings?.[video.id]) || 0;
      // 重温路只收用户明确喜欢过（收藏或高评分）的影片。
      if (!favorites.has(video.id) && rating < 4) return null;
      const score = (favorites.has(video.id) ? 0.8 : 0)
        + Math.min(1, rating / 5) * 0.4
        + clamp(gapDays / REWATCH_WINDOW_DAYS, 0, 1) * 0.2;
      return { video, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.video);
}

/** 随机探索路：以会话 seed 做 Fisher-Yates 洗牌，保证"刷到什么都有可能"。 */
function recallExplore(videos, seed) {
  const result = [...videos];
  if (!seed || result.length < 2) return result;
  let state = stableNumber(seed) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** 加权公平轮询：按通道权重比例交错各通道（每路内部保持排序），并去重。 */
function interleaveChannels(channels) {
  const active = Object.entries(channels)
    .map(([name, items]) => ({ name, weight: CHANNEL_WEIGHTS[name] ?? 1, items, index: 0 }))
    .filter((entry) => entry.items.length > 0);
  if (!active.length) return [];
  const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0);
  const result = [];
  const seen = new Set();
  const taken = new Map(active.map((entry) => [entry.name, 0]));
  let remaining = active.reduce((sum, entry) => sum + entry.items.length, 0);
  let guard = 0;
  while (remaining > 0 && guard < 500000) {
    guard += 1;
    let chosen = null;
    let bestDeficit = -Infinity;
    for (const entry of active) {
      if (entry.index >= entry.items.length) continue;
      const expected = (entry.weight / totalWeight) * (result.length + 1);
      const deficit = expected - taken.get(entry.name);
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        chosen = entry;
      }
    }
    if (!chosen) break;
    const item = chosen.items[chosen.index];
    chosen.index += 1;
    taken.set(chosen.name, taken.get(chosen.name) + 1);
    remaining -= 1;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

/** 把探索路（seed 相关、不进快照）按固定间隔插入确定性通道的融合结果中。 */
function mergeExplore(base, explore, every = 10) {
  if (!explore.length) return [...base];
  const seen = new Set(base.map((video) => video.id));
  const uniqueExplore = explore.filter((video) => !seen.has(video.id));
  if (!uniqueExplore.length) return [...base];
  const result = [];
  let exploreIndex = 0;
  for (let index = 0; index < base.length; index += 1) {
    result.push(base[index]);
    if ((index + 1) % every === 0 && exploreIndex < uniqueExplore.length) {
      result.push(uniqueExplore[exploreIndex]);
      exploreIndex += 1;
    }
  }
  while (exploreIndex < uniqueExplore.length) {
    result.push(uniqueExplore[exploreIndex]);
    exploreIndex += 1;
  }
  return result;
}

/**
 * 片段级反馈热力：用户曾在某时间窗口内看完（complete）/重看（replay）/跳过（skip）过，
 * 对该窗口产生正/负向评分，按 30 天半衰期衰减。窗口内无事件时返回 null（不参与加权）。
 */
function segmentFeedbackScore(events, startTime, endTime, now = Date.now()) {
  if (!events?.length) return null;
  let total = 0;
  let hit = 0;
  for (const event of events) {
    const time = Number(event?.t);
    if (!Number.isFinite(time) || time < startTime || time >= endTime) continue;
    const eventAt = Number(event?.at);
    const ageDays = Number.isFinite(eventAt) ? Math.max(0, (now - eventAt) / 86400000) : 30;
    const decay = Math.pow(0.5, ageDays / 30);
    if (event.a === "complete") total += 0.6 * decay;
    else if (event.a === "replay") total += 0.5 * decay;
    else if (event.a === "skip") total -= 0.7 * decay;
    else continue;
    hit += 1;
  }
  if (!hit) return null;
  return clamp(total * 0.5 + 0.5, 0, 1);
}

/**
 * 从个人观看热力图（history.buckets，200 个时间桶）中提取"反复回看"的高光窗口。
 * 每个桶的强度 = 桶内累计观看秒数 / 桶时长（>1 表示完整看过不止一遍）。
 * 对每个强度 >= 1 的连续热区，用前缀和滑窗找其中最热的目标时长子窗口。
 */
function createBehaviorWindows(duration, history) {
  if (!history?.buckets?.length || !Number.isFinite(duration) || duration <= 0) return [];
  const bucketCount = history.buckets.length;
  const bucketDuration = duration / bucketCount;
  if (bucketDuration <= 0) return [];
  const strength = history.buckets.map((watchedSeconds) => clamp(Number(watchedSeconds) / bucketDuration, 0, 4));
  const windows = [];
  let runStart = -1;
  const flushRun = (runEnd) => {
    if (runStart < 0) return;
    const runBucketCount = runEnd - runStart + 1;
    const targetBuckets = Math.max(1, Math.round(DEFAULT_SEGMENT_SECONDS / bucketDuration));
    const usable = Math.min(targetBuckets, runBucketCount);
    const prefixSums = new Array(runBucketCount);
    let prefix = 0;
    for (let index = 0; index < runBucketCount; index += 1) {
      prefix += strength[runStart + index];
      prefixSums[index] = prefix;
    }
    let bestStart = runStart;
    let bestSum = -1;
    for (let index = 0; index + usable <= runBucketCount; index += 1) {
      const sum = prefixSums[index + usable - 1] - (index > 0 ? prefixSums[index - 1] : 0);
      if (sum > bestSum) {
        bestSum = sum;
        bestStart = runStart + index;
      }
    }
    windows.push({
      startTime: (bestStart / bucketCount) * duration,
      endTime: Math.min(duration, ((bestStart + usable) / bucketCount) * duration),
      score: clamp(bestSum / usable / 2, 0, 1),
    });
    runStart = -1;
  };
  strength.forEach((value, index) => {
    if (value >= 1) {
      if (runStart < 0) runStart = index;
    } else if (runStart >= 0) {
      flushRun(index - 1);
    }
  });
  if (runStart >= 0) flushRun(strength.length - 1);
  return windows;
}

function diversify(videos) {
  const result = [];
  const pending = [...videos];
  let cursor = 0;
  while (pending.length) {
    const previousSeries = result.length ? videoSeriesKey(result[result.length - 1]) : "";
    let index = -1;
    for (let offset = 0; offset < pending.length; offset += 1) {
      if (videoSeriesKey(pending[(cursor + offset) % pending.length]) !== previousSeries) {
        index = (cursor + offset) % pending.length;
        break;
      }
    }
    if (index < 0) index = 0;
    result.push(pending.splice(index, 1)[0]);
    cursor = index;
  }
  return result;
}

function varyRecommendationOrder(videos, seed) {
  if (!seed) return videos;
  let state = stableNumber(seed) || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const result = [];
  for (let offset = 0; offset < videos.length; offset += 4) {
    const group = videos.slice(offset, offset + 4);
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [group[index], group[swapIndex]] = [group[swapIndex], group[index]];
    }
    result.push(...group);
  }
  return result;
}

export function createRecommendationFeedService({
  loadConfig,
  loadPlayerStore,
  loadRecommendationStore,
  resolveMediaPath,
  resolveVideoPath,
  runProcess,
  scanMediaRoots,
}) {
  let cachePromise;
  const queuedVideoIds = new Set();
  const analysisQueue = [];
  let isAnalyzing = false;
  let sortedSnapshot = null;
  let storeSnapshot = null;
  let storeSnapshotAt = 0;

  const loadStoreSnapshot = async () => {
    if (storeSnapshot && Date.now() - storeSnapshotAt < STORE_SNAPSHOT_TTL_MS) return storeSnapshot;
    const [startupStore, deferredStore] = await Promise.all([
      loadPlayerStore("startup"),
      loadPlayerStore("deferred"),
    ]);
    storeSnapshot = { ...(startupStore ?? {}), ...(deferredStore ?? {}) };
    storeSnapshotAt = Date.now();
    return storeSnapshot;
  };

  const loadCache = async () => {
    cachePromise ??= loadRecommendationStore().then((store) => {
      const value = store.loadRecommendationCache();
      return {
        version: CACHE_VERSION,
        segments: value?.segments && typeof value.segments === "object" ? value.segments : {},
        feedback: value?.feedback && typeof value.feedback === "object" ? value.feedback : {},
      };
    });
    return cachePromise;
  };

  const findSubtitleCues = async (config, scan, video) => {
    const videoBase = String(video.relativePath).replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();
    const candidates = scan.subtitles.filter((subtitle) => {
      if (subtitle.mediaRootId !== video.mediaRootId) return false;
      const base = String(subtitle.relativePath).replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();
      return base === videoBase || base === `${videoBase}-translated`;
    }).sort((left) => String(left.relativePath).toLowerCase().includes("-translated.") ? -1 : 1);
    const subtitle = candidates[0];
    if (!subtitle) return [];
    try {
      const subtitlePath = resolveMediaPath(config, subtitle.mediaRootId, subtitle.relativePath);
      return parseSubtitleCues(await readFile(subtitlePath, "utf8"));
    } catch {
      return [];
    }
  };

  const analyzeSignals = async (filePath, candidate, hasAudio) => {
    let log = "";
    const duration = candidate.endTime - candidate.startTime;
    const args = [
      "-hide_banner", "-nostats", "-ss", String(candidate.startTime), "-t", String(duration), "-i", filePath,
      "-map", "0:v:0", "-vf", "fps=2,scale=320:-2,select='gte(scene,0)',metadata=print",
    ];
    if (hasAudio) args.push("-map", "0:a:0?", "-af", "silencedetect=noise=-35dB:d=0.45,volumedetect");
    args.push("-f", "null", "-");
    try {
      await runProcess("ffmpeg", args, {
        timeoutMs: 30000,
        stderrTailBytes: 2 * 1024 * 1024,
        onStderr(chunk) { log += chunk.toString("utf8"); },
      });
      return parseSignalLog(log, duration);
    } catch {
      return { sceneScore: 0, audioScore: 0, speechRatio: 0 };
    }
  };

  const analyzeVideo = async ({ config, scan, store, video, mediaInfo, feedback }) => {
    const filePath = resolveVideoPath(config, video.mediaRootId, video.relativePath);
    const duration = Number(mediaInfo?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取影片时长。");
    const highlights = store?.videoHighlights?.[video.id] ?? [];
    if (highlights.length) {
      const chosen = highlights[stableNumber(video.id) % highlights.length];
      return {
        ...normalizeManualSegment(chosen, duration),
        duration,
        score: 1,
        source: "manual",
        reasons: [chosen.tag ? `人工标记：${chosen.tag}` : "人工标记的高能片段"],
      };
    }

    const cues = await findSubtitleCues(config, scan, video);
    const hasAudio = mediaInfo?.hasAudio;
    const history = store?.items?.[video.id]?.history;
    const behaviorWindows = createBehaviorWindows(duration, history)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_BEHAVIOR_WINDOWS);
    const candidates = [
      ...behaviorWindows.map((window) => ({ ...window, behavior: true })),
      ...createCandidateWindows(duration, video.id).map((window) => ({ ...window, behavior: false })),
    ];
    const scored = [];
    for (const candidate of candidates) {
      const subtitles = subtitleScore(cues, candidate.startTime, candidate.endTime);
      const signals = await analyzeSignals(filePath, candidate, hasAudio);
      let score = signals.sceneScore * 0.34 + signals.audioScore * 0.24 + signals.speechRatio * 0.16 + subtitles.score * 0.26;
      // 用户反复回看的窗口获得行为信号加成。
      if (candidate.behavior) score = score * 0.6 + candidate.score * 0.4;
      // 片段级反馈热力：曾看完/重看的窗口提权，曾跳过的窗口降权。
      const segmentHeat = segmentFeedbackScore(feedback?.segmentEvents, candidate.startTime, candidate.endTime);
      if (segmentHeat !== null) score = score * 0.75 + segmentHeat * 0.25;
      scored.push({ ...candidate, score, subtitles, ...signals, segmentHeat });
    }
    const best = scored.sort((left, right) => right.score - left.score)[0] ?? createFallbackSegment(video, duration);
    const reasons = [];
    if (best.behavior) reasons.push("你反复回看的段落");
    if (best.segmentHeat !== null && best.segmentHeat > 0.6) reasons.push("你标记过的精彩段落");
    if (best.sceneScore > 0.42) reasons.push("镜头变化活跃");
    if (best.audioScore > 0.45) reasons.push("声音张力较强");
    if (best.subtitles?.score > 0.4) reasons.push("对白密集且语义完整");
    if (!reasons.length) reasons.push("综合画面、声音与片段位置选出");
    return { startTime: best.startTime, endTime: best.endTime, duration, score: best.score, source: best.behavior ? "behavior" : "signals", reasons };
  };

  const drainQueue = async () => {
    if (isAnalyzing) return;
    isAnalyzing = true;
    try {
      await Promise.all(Array.from({ length: ANALYSIS_CONCURRENCY }, async () => {
        while (analysisQueue.length) {
          const task = analysisQueue.shift();
          try {
            const cache = await loadCache();
            const fingerprint = videoFingerprint(task.video);
            const recommendationStore = await loadRecommendationStore();
            const cached = cache.segments[task.video.id];
            let mediaInfo = cached?.fingerprint === fingerprint && cached.analysisPending && cached.duration > 0
              ? { duration: cached.duration, hasAudio: cached.hasAudio }
              : null;
            if (!mediaInfo) {
              const filePath = resolveVideoPath(task.config, task.video.mediaRootId, task.video.relativePath);
              const probe = await probeMediaFile(runProcess, filePath);
              mediaInfo = {
                duration: Number(probe?.format?.duration),
                hasAudio: probe?.streams?.some((stream) => stream.codec_type === "audio") ?? false,
              };
              if (!Number.isFinite(mediaInfo.duration) || mediaInfo.duration <= 0) throw new Error("无法读取影片时长。");

              const manual = task.store.videoHighlights?.[task.video.id]?.[0];
              const fallback = manual
                ? { ...normalizeManualSegment(manual, mediaInfo.duration), duration: mediaInfo.duration, score: 1, source: "manual", reasons: [manual.tag ? `人工标记：${manual.tag}` : "人工标记的高能片段"] }
                : { ...createFallbackSegment(task.video, mediaInfo.duration), duration: mediaInfo.duration };
              cache.segments[task.video.id] = { ...fallback, hasAudio: mediaInfo.hasAudio, fingerprint, analysisPending: true, probedAt: Date.now() };
              recommendationStore.saveRecommendationSegment(task.video.id, cache.segments[task.video.id]);
            }

            const segment = await analyzeVideo({ ...task, mediaInfo });
            cache.segments[task.video.id] = { ...segment, fingerprint, analyzedAt: Date.now() };
            recommendationStore.saveRecommendationSegment(task.video.id, cache.segments[task.video.id]);
          } catch (error) {
            // Fast candidates remain usable when local tools or a media path are unavailable.
            // 记录失败标记并带退避重试，避免每次刷页都重新入队空转。
            try {
              const cache = await loadCache();
              const existing = cache.segments[task.video.id] ?? {};
              cache.segments[task.video.id] = {
                ...existing,
                fingerprint: videoFingerprint(task.video),
                analysisFailedAt: Date.now(),
                analysisError: String(error instanceof Error ? error.message : error).slice(0, 160),
              };
              const recommendationStore = await loadRecommendationStore();
              recommendationStore.saveRecommendationSegment(task.video.id, cache.segments[task.video.id]);
            } catch {
              // 失败标记写入失败不影响当前循环。
            }
          } finally {
            queuedVideoIds.delete(task.video.id);
          }
        }
      }));
    } finally {
      isAnalyzing = false;
      if (analysisQueue.length) void drainQueue();
    }
  };

  const queueAnalysis = (tasks) => {
    for (const task of tasks) {
      if (queuedVideoIds.has(task.video.id)) continue;
      queuedVideoIds.add(task.video.id);
      analysisQueue.push(task);
    }
    void drainQueue();
  };

  return {
    async getFeed({ mode, cursor = 0, limit = 8, seed = "" }) {
      const normalizedMode = mode === "special" ? "special" : "anime";
      const [config, scan, cache, store] = await Promise.all([
        loadConfig(), scanMediaRoots(), loadCache(), loadStoreSnapshot(),
      ]);
      const rootIds = new Set(scan.roots.filter((item) => modeMatchesRoot(item.root, normalizedMode)).map((item) => item.root.id));
      const modeVideos = scan.videos.filter((video) => rootIds.has(video.mediaRootId));
      // 负反馈过滤：单片屏蔽（dismissed）与标签级屏蔽（recommendationDismissedTags，来自"不感兴趣：这类标签"）。
      const dismissedTags = new Set(
        Array.isArray(store?.settings?.recommendationDismissedTags) ? store.settings.recommendationDismissedTags : [],
      );
      const eligibleVideos = modeVideos.filter((video) => {
        if (cache.feedback[video.id]?.dismissed) return false;
        const tags = store?.videoTags?.[video.id];
        return !(Array.isArray(tags) && tags.some((tag) => dismissedTags.has(tag)));
      });
      const dateKey = new Date().toISOString().slice(0, 10);
      const now = Date.now();
      if (!sortedSnapshot || sortedSnapshot.mode !== normalizedMode || sortedSnapshot.dateKey !== dateKey) {
        // 多路召回：相关/热度/新片/重温四路确定性通道按权重交错，探索路（seed 相关）不进快照。
        sortedSnapshot = {
          mode: normalizedMode,
          dateKey,
          videos: interleaveChannels({
            relevant: rankVideos(eligibleVideos, store, cache.feedback, cache.segments),
            hot: recallHot(eligibleVideos, store),
            fresh: recallFresh(eligibleVideos, store, now),
            rewatch: recallRewatch(eligibleVideos, store, now),
          }),
        };
      }
      // 探索路按会话 seed 洗牌后插入，洗牌在去重之前执行：vary 提供会话内随机性，diversify 最后保证相邻不同系列。
      const explore = recallExplore(eligibleVideos, seed);
      const ranked = diversify(varyRecommendationOrder(mergeExplore(sortedSnapshot.videos, explore), seed));
      const start = Math.max(0, Math.floor(Number(cursor) || 0));
      const pageSize = Math.min(Math.max(0, ranked.length - start), clamp(Math.floor(Number(limit) || 8), 1, 20));
      const page = Array.from({ length: pageSize }, (_, index) => ({
        video: ranked[start + index],
        sequence: start + index,
      }));
      const favoriteIds = new Set(store?.favorites ?? []);
      const items = page.map(({ video, sequence }) => {
        const cached = cache.segments[video.id];
        const progress = store?.items?.[video.id];
        const progressTime = Number(progress?.currentTime);
        const hasProgress = Number.isFinite(progressTime) && progressTime > 0;
        const progressDuration = Number(progress?.duration);
        const stat = store?.videoStats?.[video.id];
        let segment = cached?.fingerprint === videoFingerprint(video) ? cached : null;
        if (!segment) {
          // 还没有分析结果时的兜底：优先用播放进度里已知的时长生成片中段位置，
          // 避免"从片头播放"（片头通常没有有效内容）；时长未知时交给前端加载后修正。
          const knownDuration = Number(store?.items?.[video.id]?.duration);
          if (Number.isFinite(knownDuration) && knownDuration > 0) {
            segment = { ...createFallbackSegment(video, knownDuration), duration: knownDuration };
          } else {
            segment = { startTime: 0, endTime: DEFAULT_SEGMENT_SECONDS, duration: 0, score: 0, source: "fallback", reasons: ["正在分析这部影片，先播放一个代表性片段"] };
          }
        }
        return {
          id: `${video.id}@${Math.round(segment.startTime * 10)}:${sequence}`,
          videoId: video.id,
          title: path.basename(video.name, path.extname(video.name)),
          relativePath: video.relativePath,
          mediaRootId: video.mediaRootId,
          playbackUrl: video.playability?.compatibleUrl || video.url,
          thumbnailUrl: video.thumbnailUrl || video.thumbUrl || video.posterUrl,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.duration,
          source: segment.source,
          reasons: segment.reasons,
          tags: store.videoTags?.[video.id] ?? [],
          rating: store.videoRatings?.[video.id],
          isFavorite: favoriteIds.has(video.id),
          viewState: progress?.completed ? "completed" : hasProgress ? "partial" : "untouched",
          progressCurrentTime: hasProgress ? progressTime : undefined,
          progressDuration: Number.isFinite(progressDuration) && progressDuration > 0 ? progressDuration : undefined,
          stats: (stat && (Number(stat.playCount) > 0 || Number(stat.totalPlayedSeconds) > 0))
            ? { playCount: Number(stat.playCount) || 0, totalPlayedSeconds: Number(stat.totalPlayedSeconds) || 0 }
            : undefined,
          series: buildSeriesEntries(video, modeVideos, 4),
        };
      });
      queueAnalysis(page
        .map((item) => item.video)
        .filter((video) => {
          const cached = cache.segments[video.id];
          if (cached?.analysisFailedAt && Date.now() - cached.analysisFailedAt < ANALYSIS_RETRY_BACKOFF_MS) return false;
          return cached?.fingerprint !== videoFingerprint(video) || cached.analysisPending;
        })
        .map((video) => ({ config, scan, store, video, feedback: cache.feedback[video.id] })));
      return {
        version: 1,
        mode: normalizedMode,
        items,
        nextCursor: start + page.length < ranked.length ? String(start + page.length) : null,
        analysis: { queued: queuedVideoIds.size, analyzing: isAnalyzing },
      };
    },

    async recordFeedback(payload) {
      const videoId = typeof payload?.videoId === "string" ? payload.videoId.trim() : "";
      const action = typeof payload?.action === "string" ? payload.action : "";
      if (!videoId || !["skip", "complete", "replay", "dismiss"].includes(action)) {
        throw new Error("Invalid recommendation feedback.");
      }
      const scope = payload?.scope === "tags" ? "tags" : "video";
      const tags = Array.isArray(payload?.tags)
        ? Array.from(new Set(payload.tags.filter((tag) => typeof tag === "string" && Boolean(tag.trim())))).slice(0, 20)
        : [];
      const cache = await loadCache();
      const feedback = cache.feedback[videoId] ?? {};
      if (action === "dismiss") {
        feedback.dismissed = true;
        // 标签级屏蔽是全局信号：把本次标签并入 settings 的屏蔽名单，后续所有带这些标签的影片都不再进入推荐流。
        if (scope === "tags" && tags.length) {
          const store = await loadRecommendationStore();
          const current = Array.isArray(store?.settings?.recommendationDismissedTags)
            ? store.settings.recommendationDismissedTags
            : [];
          const merged = Array.from(new Set([...current, ...tags]));
          store.setSettingValue("global", "recommendationDismissedTags", merged);
          // 强制下次 getFeed 重新加载 store 快照，避免 TTL 内读到旧 settings。
          storeSnapshot = null;
        }
      }
      else if (action === "skip") feedback.skipped = (feedback.skipped ?? 0) + 1;
      else if (action === "complete") feedback.completed = (feedback.completed ?? 0) + 1;
      else if (action === "replay") feedback.replayed = (feedback.replayed ?? 0) + 1;
      // 记录片段级信号（刷片反馈发生在具体时间窗口上），供后续片段热力分析使用。
      const startTime = Number(payload?.startTime);
      if (Number.isFinite(startTime) && startTime >= 0) {
        const segmentEvents = feedback.segmentEvents ?? [];
        segmentEvents.push({ t: Math.round(startTime), a: action, at: Date.now() });
        if (segmentEvents.length > 400) segmentEvents.splice(0, segmentEvents.length - 400);
        feedback.segmentEvents = segmentEvents;
      }
      feedback.updatedAt = Date.now();
      cache.feedback[videoId] = feedback;
      const store = await loadRecommendationStore();
      store.saveRecommendationFeedback(videoId, feedback);
      sortedSnapshot = null;
      return { ok: true, feedback };
    },

    async getStatus() {
      const cache = await loadCache();
      const analyzed = Object.values(cache.segments).filter((segment) => !segment.analysisPending && !segment.analysisFailedAt).length;
      return { analyzed, queued: queuedVideoIds.size, analyzing: isAnalyzing };
    },
  };
}

export {
  createBehaviorWindows,
  diversify,
  interleaveChannels,
  mergeExplore,
  rankVideos,
  recallExplore,
  recallFresh,
  recallHot,
  recallRewatch,
  segmentFeedbackScore,
};
