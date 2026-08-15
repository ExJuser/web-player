import { readFile } from "node:fs/promises";

import { probeMediaFile } from "./mediaCompatibility.mjs";

const CACHE_VERSION = 1;
const ANALYZER_VERSION = 1;
const DEFAULT_SEGMENT_SECONDS = 52;
const MIN_SEGMENT_SECONDS = 30;
const MAX_SEGMENT_SECONDS = 90;

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

function rankVideos(videos, store, feedbackByVideoId) {
  const favorites = new Set(store?.favorites ?? []);
  return videos
    .filter((video) => !feedbackByVideoId[video.id]?.dismissed)
    .map((video) => {
      const progress = store?.items?.[video.id];
      const rating = Number(store?.videoRatings?.[video.id]) || 0;
      const score = (favorites.has(video.id) ? 1.4 : 0)
        + rating * 0.12
        + (progress?.completed ? -0.65 : 0.2)
        + feedbackScore(feedbackByVideoId[video.id])
        + (stableNumber(`${video.id}:${new Date().toISOString().slice(0, 10)}`) % 1000) / 1000;
      return { video, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.video);
}

function diversify(videos) {
  const result = [];
  const pending = [...videos];
  while (pending.length) {
    const previousSeries = result.length ? videoSeriesKey(result[result.length - 1]) : "";
    const index = pending.findIndex((video) => videoSeriesKey(video) !== previousSeries);
    result.push(pending.splice(index < 0 ? 0 : index, 1)[0]);
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

  const analyzeVideo = async ({ config, scan, store, video }) => {
    const filePath = resolveVideoPath(config, video.mediaRootId, video.relativePath);
    const probe = await probeMediaFile(runProcess, filePath);
    const duration = Number(probe?.format?.duration);
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
    const hasAudio = probe?.streams?.some((stream) => stream.codec_type === "audio");
    const candidates = createCandidateWindows(duration, video.id);
    const scored = [];
    for (const candidate of candidates) {
      const subtitles = subtitleScore(cues, candidate.startTime, candidate.endTime);
      const signals = await analyzeSignals(filePath, candidate, hasAudio);
      const score = signals.sceneScore * 0.34 + signals.audioScore * 0.24 + signals.speechRatio * 0.16 + subtitles.score * 0.26;
      scored.push({ ...candidate, score, subtitles, ...signals });
    }
    const best = scored.sort((left, right) => right.score - left.score)[0] ?? createFallbackSegment(video, duration);
    const reasons = [];
    if (best.sceneScore > 0.42) reasons.push("镜头变化活跃");
    if (best.audioScore > 0.45) reasons.push("声音张力较强");
    if (best.subtitles?.score > 0.4) reasons.push("对白密集且语义完整");
    if (!reasons.length) reasons.push("综合画面、声音与片段位置选出");
    return { startTime: best.startTime, endTime: best.endTime, duration, score: best.score, source: "signals", reasons };
  };

  const drainQueue = async () => {
    if (isAnalyzing) return;
    isAnalyzing = true;
    try {
      while (analysisQueue.length) {
        const task = analysisQueue.shift();
        try {
          const segment = await analyzeVideo(task);
          const cache = await loadCache();
          cache.segments[task.video.id] = { ...segment, fingerprint: videoFingerprint(task.video), analyzedAt: Date.now() };
          const store = await loadRecommendationStore();
          store.saveRecommendationSegment(task.video.id, cache.segments[task.video.id]);
        } catch {
          // Fast candidates remain usable when local tools or a media path are unavailable.
        } finally {
          queuedVideoIds.delete(task.video.id);
        }
      }
    } finally {
      isAnalyzing = false;
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

  const getDuration = async (config, video) => {
    try {
      const filePath = resolveVideoPath(config, video.mediaRootId, video.relativePath);
      const probe = await probeMediaFile(runProcess, filePath);
      return Number(probe?.format?.duration) || 0;
    } catch {
      return 0;
    }
  };

  return {
    async getFeed({ mode, cursor = 0, limit = 8, seed = "" }) {
      const normalizedMode = mode === "special" ? "special" : "anime";
      const [config, scan, cache, startupStore, deferredStore] = await Promise.all([
        loadConfig(), scanMediaRoots(), loadCache(), loadPlayerStore("startup"), loadPlayerStore("deferred"),
      ]);
      const store = { ...(startupStore ?? {}), ...(deferredStore ?? {}) };
      const rootIds = new Set(scan.roots.filter((item) => modeMatchesRoot(item.root, normalizedMode)).map((item) => item.root.id));
      const ranked = varyRecommendationOrder(diversify(rankVideos(
        scan.videos.filter((video) => rootIds.has(video.mediaRootId)),
        store,
        cache.feedback,
      )), seed);
      const start = Math.max(0, Math.floor(Number(cursor) || 0));
      const pageSize = Math.min(ranked.length, clamp(Math.floor(Number(limit) || 8), 1, 20));
      const page = Array.from({ length: pageSize }, (_, index) => ({
        video: ranked[(start + index) % ranked.length],
        sequence: start + index,
      }));
      const items = await Promise.all(page.map(async ({ video, sequence }) => {
        const cached = cache.segments[video.id];
        let segment = cached?.fingerprint === videoFingerprint(video) ? cached : null;
        if (!segment) {
          const duration = await getDuration(config, video);
          const manual = store.videoHighlights?.[video.id]?.[0];
          segment = duration > 0
            ? manual
              ? { ...normalizeManualSegment(manual, duration), duration, score: 1, source: "manual", reasons: [manual.tag ? `人工标记：${manual.tag}` : "人工标记的高能片段"] }
              : { ...createFallbackSegment(video, duration), duration }
            : { startTime: 0, endTime: DEFAULT_SEGMENT_SECONDS, duration: 0, score: 0, source: "fallback", reasons: ["从影片开头开始预览"] };
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
        };
      }));
      queueAnalysis(page
        .map((item) => item.video)
        .filter((video) => cache.segments[video.id]?.fingerprint !== videoFingerprint(video))
        .map((video) => ({ config, scan, store, video })));
      return {
        version: 1,
        mode: normalizedMode,
        items,
        nextCursor: ranked.length ? String(start + page.length) : null,
        analysis: { queued: queuedVideoIds.size, analyzing: isAnalyzing },
      };
    },

    async recordFeedback(payload) {
      const videoId = typeof payload?.videoId === "string" ? payload.videoId.trim() : "";
      const action = typeof payload?.action === "string" ? payload.action : "";
      if (!videoId || !["skip", "complete", "replay", "dismiss"].includes(action)) {
        throw new Error("Invalid recommendation feedback.");
      }
      const cache = await loadCache();
      const feedback = cache.feedback[videoId] ?? {};
      if (action === "dismiss") feedback.dismissed = true;
      else if (action === "skip") feedback.skipped = (feedback.skipped ?? 0) + 1;
      else if (action === "complete") feedback.completed = (feedback.completed ?? 0) + 1;
      else if (action === "replay") feedback.replayed = (feedback.replayed ?? 0) + 1;
      feedback.updatedAt = Date.now();
      cache.feedback[videoId] = feedback;
      const store = await loadRecommendationStore();
      store.saveRecommendationFeedback(videoId, feedback);
      return { ok: true, feedback };
    },

    async getStatus() {
      const cache = await loadCache();
      return { analyzed: Object.keys(cache.segments).length, queued: queuedVideoIds.size, analyzing: isAnalyzing };
    },
  };
}
