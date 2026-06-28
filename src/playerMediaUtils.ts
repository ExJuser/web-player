import { collator, mediaScanBatchDelay, mediaScanBatchSize } from "./playerConstants";
import type { MediaCollection, MediaScanBatch, PlaybackProgress, PlaylistSortMode, ProgressStore, SubtitleItem, VideoItem, VideoPlayability, VideoStatsStore } from "./playerTypes";
import { createVideoStatsKey } from "./playerUiState";

const cjkNumberValues: Record<string, number> = {
  "\u96f6": 0,
  "\u3007": 0,
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e24": 2,
  "\u5169": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9,
};

const cjkNumberUnits: Record<string, number> = {
  "\u5341": 10,
  "\u767e": 100,
  "\u5343": 1000,
};

function parseNumberishText(value: string) {
  const normalized = value.trim();
  const digitMatch = normalized.match(/\d+/);
  if (digitMatch) return Number(digitMatch[0]);

  let total = 0;
  let current = 0;
  let hasNumber = false;

  for (const char of normalized) {
    const digitValue = cjkNumberValues[char];
    if (digitValue !== undefined) {
      current = digitValue;
      hasNumber = true;
      continue;
    }

    const unitValue = cjkNumberUnits[char];
    if (unitValue !== undefined) {
      total += (current || 1) * unitValue;
      current = 0;
      hasNumber = true;
    }
  }

  return hasNumber ? total + current : null;
}

function parseSeasonNumber(segment: string) {
  const normalized = segment
    .normalize("NFKC")
    .replace(/[\u3010\u3011\[\]\(\)\uff08\uff09]/g, " ")
    .trim();
  const cjkMatch = normalized.match(
    /\u7b2c\s*([\d\u96f6\u3007\u4e00\u4e8c\u4e24\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343]+)\s*[\u5b63\u671f\u90e8]/,
  );
  if (cjkMatch) return parseNumberishText(cjkMatch[1]);

  const latinMatch = normalized.match(/(?:^|[\s._-])(?:s|season)\s*0*(\d{1,3})(?:$|[\s._-])/i);
  if (latinMatch) return Number(latinMatch[1]);

  return null;
}

export function splitRelativePath(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function hasSeasonDirectory(video: VideoItem) {
  return splitRelativePath(video.relativePath).slice(0, -1).some((segment) => parseSeasonNumber(segment) !== null);
}

export function compareNaturalRelativePath(aPath: string, bPath: string) {
  const aSegments = splitRelativePath(aPath);
  const bSegments = splitRelativePath(bPath);
  const length = Math.max(aSegments.length, bSegments.length);

  for (let index = 0; index < length; index += 1) {
    const aSegment = aSegments[index];
    const bSegment = bSegments[index];
    if (aSegment === undefined) return -1;
    if (bSegment === undefined) return 1;

    const aSeasonNumber = parseSeasonNumber(aSegment);
    const bSeasonNumber = parseSeasonNumber(bSegment);
    if (aSeasonNumber !== null && bSeasonNumber !== null && aSeasonNumber !== bSeasonNumber) {
      return aSeasonNumber - bSeasonNumber;
    }

    const result = collator.compare(aSegment, bSegment);
    if (result !== 0) return result;
  }

  return 0;
}

function getStatsSortValue(video: VideoItem, statsStore: VideoStatsStore, mode: PlaylistSortMode) {
  const stats = statsStore[createVideoStatsKey(video)];
  if (!stats) return 0;

  if (mode === "playedDuration") return stats.totalPlayedSeconds;
  if (mode === "playCount") return stats.playCount;
  if (mode === "emissionCount") return stats.emissionCount;
  if (mode === "playIntensity") {
    const duration = stats.durationSeconds || video.duration || 0;
    return duration > 0 ? stats.totalPlayedSeconds / duration : 0;
  }

  return 0;
}

function isStatsPlaylistSortMode(mode: PlaylistSortMode) {
  return mode === "playedDuration" || mode === "playIntensity" || mode === "playCount" || mode === "emissionCount";
}

function compareVideos(a: VideoItem, b: VideoItem, mode: PlaylistSortMode, statsStore: VideoStatsStore) {
  if (mode === "modified") {
    return b.lastModified - a.lastModified || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (mode === "path") {
    return compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (mode === "size") {
    return b.size - a.size || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (isStatsPlaylistSortMode(mode)) {
    return getStatsSortValue(b, statsStore, mode) - getStatsSortValue(a, statsStore, mode) || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (hasSeasonDirectory(a) || hasSeasonDirectory(b)) {
    return compareNaturalRelativePath(a.relativePath, b.relativePath) || collator.compare(a.name, b.name);
  }

  return collator.compare(a.name, b.name) || compareNaturalRelativePath(a.relativePath, b.relativePath);
}

export function getSortedVideos(videos: VideoItem[], mode: PlaylistSortMode, isReversed: boolean, statsStore: VideoStatsStore = {}) {
  const sorted = [...videos].sort((a, b) => compareVideos(a, b, mode, statsStore));
  return isReversed ? sorted.reverse() : sorted;
}

export function isResumableProgress(progress?: PlaybackProgress) {
  if (!progress || progress.completed || progress.currentTime < 1) return false;
  return progress.currentTime < Math.max(0, progress.duration - 8);
}

export function getLatestResumableVideo(videos: VideoItem[], progressStore: ProgressStore) {
  let latest: { video: VideoItem; progress: PlaybackProgress } | undefined;
  for (const video of videos) {
    const progress = progressStore[video.id];
    if (!isResumableProgress(progress)) continue;
    if (!latest || progress.updatedAt > latest.progress.updatedAt) {
      latest = { video, progress };
    }
  }
  return latest;
}

export function createEmptyMediaCollection(): MediaCollection {
  return {
    videos: [],
    subtitles: [],
    scannedFiles: 0,
    filteredSmallVideos: 0,
  };
}

export function mergeMediaBatch(collection: MediaCollection, batch: MediaScanBatch): MediaCollection {
  return {
    videos: [...collection.videos, ...batch.videos],
    subtitles: [...collection.subtitles, ...batch.subtitles],
    scannedFiles: batch.scannedFiles,
    filteredSmallVideos: batch.filteredSmallVideos,
  };
}

export function sortMediaCollection(collection: MediaCollection): MediaCollection {
  return {
    ...collection,
    videos: [...collection.videos].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath)),
    subtitles: [...collection.subtitles].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath)),
  };
}

export function mergeVideoRuntimeState(nextVideos: VideoItem[], previousVideos: VideoItem[]) {
  const previousById = new Map(previousVideos.map((video) => [video.id, video]));
  return nextVideos.map((video) => {
    const previous = previousById.get(video.id);
    if (!previous) return video;
    const basePlayability = video.playability ?? previous.playability;
    const playability: VideoPlayability | undefined = basePlayability
      ? {
          ...basePlayability,
          ...(previous.playability?.compatibleUrl && !video.playability?.compatibleUrl
            ? { compatibleUrl: previous.playability.compatibleUrl }
            : {}),
        }
      : undefined;
    return {
      ...video,
      duration: previous.duration ?? video.duration,
      width: previous.width ?? video.width,
      height: previous.height ?? video.height,
      thumbnailUrl: previous.thumbnailUrl ?? video.thumbnailUrl,
      thumbnailStatus: previous.thumbnailStatus ?? video.thumbnailStatus,
      ...(playability ? { playability } : {}),
    };
  });
}

export function shouldFlushMediaScan(lastFlushAt: number, pendingVideos: VideoItem[], pendingSubtitles: SubtitleItem[]) {
  return pendingVideos.length + pendingSubtitles.length >= mediaScanBatchSize || Date.now() - lastFlushAt >= mediaScanBatchDelay;
}

export type DuplicateVideoSeverity = "duplicate" | "suspicious";

export type DuplicateVideoGroup = {
  id: string;
  severity: DuplicateVideoSeverity;
  score: number;
  reasons: string[];
  videos: VideoItem[];
};

export type DuplicateDetectionProgress = {
  processedPairs: number;
  totalPairs: number;
  percent: number;
};

export type DuplicateDetectionOptions = {
  yieldEveryPairs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: DuplicateDetectionProgress) => void;
};

const duplicateNoisePattern =
  /\b(?:copy|copied|backup|web|web-dl|webrip|bluray|bdrip|hdrip|x264|x265|h264|h265|hevc|avc|aac|flac|opus|1080p|720p|2160p|4k|8k)\b/gi;

function normalizeDuplicateName(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .normalize("NFKC")
    .replace(/[\[\u3010][^\]\u3011]*[\]\u3011]/g, " ")
    .replace(/[\[\]\(\)\u3010\u3011\uff08\uff09]/g, " ")
    .replace(duplicateNoisePattern, " ")
    .replace(/\b(?:ep|episode|e)\s*0*(\d{1,4})\b/gi, " $1 ")
    .replace(/\b0+(\d+)/g, "$1")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function getDuplicateDirectoryKey(video: VideoItem) {
  const parts = splitRelativePath(video.relativePath);
  if (parts.length <= 1) return "";
  return normalizeDuplicateName(parts.at(-2) ?? "");
}

function getRelativeDelta(a: number | undefined, b: number | undefined) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) return null;
  return Math.abs(a - b) / Math.max(a, b);
}

function scoreDuplicatePair(a: VideoItem, b: VideoItem) {
  const reasons: string[] = [];
  let score = 0;

  if (normalizeDuplicateName(a.name) === normalizeDuplicateName(b.name)) {
    score += 45;
    reasons.push("名称相近");
  }

  const aDirectory = getDuplicateDirectoryKey(a);
  const bDirectory = getDuplicateDirectoryKey(b);
  if (aDirectory && bDirectory && aDirectory === bDirectory) {
    score += 15;
    reasons.push("路径相近");
  }

  const sizeDelta = getRelativeDelta(a.size, b.size);
  if (sizeDelta !== null && sizeDelta <= 0.02) {
    score += 20;
    reasons.push("大小接近");
  } else if (sizeDelta !== null && sizeDelta <= 0.12) {
    score += 10;
    reasons.push("大小疑似");
  }

  const durationDelta = getRelativeDelta(a.duration, b.duration);
  if (durationDelta !== null && durationDelta <= 0.01) {
    score += 20;
    reasons.push("时长接近");
  } else if (durationDelta !== null && durationDelta <= 0.04) {
    score += 10;
    reasons.push("时长疑似");
  }

  if (a.width && a.height && b.width && b.height && a.width === b.width && a.height === b.height) {
    score += 10;
    reasons.push("分辨率一致");
  }

  return { score, reasons };
}

function createDuplicateDetectionContext(videos: VideoItem[]) {
  const parent = new Map<string, string>();
  const pairScores = new Map<string, { score: number; reasons: string[] }>();
  const matchedIds = new Set<string>();
  const videoById = new Map(videos.map((video) => [video.id, video]));

  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const aRoot = find(a);
    const bRoot = find(b);
    if (aRoot !== bRoot) parent.set(bRoot, aRoot);
  };

  return { parent, pairScores, matchedIds, videoById, find, union };
}

function buildDuplicateVideoGroups(
  videos: VideoItem[],
  context: ReturnType<typeof createDuplicateDetectionContext>,
): DuplicateVideoGroup[] {
  const { pairScores, matchedIds, videoById, find } = context;
  const groupedIds = new Map<string, string[]>();
  for (let aIndex = 0; aIndex < videos.length; aIndex += 1) {
    const video = videos[aIndex];
    const root = find(video.id);
    if (root === video.id && !matchedIds.has(video.id)) continue;
    const ids = groupedIds.get(root) ?? [];
    ids.push(video.id);
    groupedIds.set(root, ids);
  }

  return Array.from(groupedIds.values())
    .filter((ids) => ids.length > 1)
    .map((ids) => {
      let score = 0;
      const reasons = new Set<string>();
      for (let aIndex = 0; aIndex < ids.length; aIndex += 1) {
        for (let bIndex = aIndex + 1; bIndex < ids.length; bIndex += 1) {
          const pair = pairScores.get([ids[aIndex], ids[bIndex]].sort().join("\u0000"));
          if (!pair) continue;
          score = Math.max(score, pair.score);
          pair.reasons.forEach((reason) => reasons.add(reason));
        }
      }
      const sortedVideos = ids
        .map((id) => videoById.get(id))
        .filter((video): video is VideoItem => Boolean(video))
        .sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath));
      return {
        id: sortedVideos.map((video) => video.id).join("|"),
        severity: (score >= 90 ? "duplicate" : "suspicious") as DuplicateVideoSeverity,
        score,
        reasons: Array.from(reasons),
        videos: sortedVideos,
      };
    })
    .sort((a, b) => b.score - a.score || compareNaturalRelativePath(a.videos[0]?.relativePath ?? "", b.videos[0]?.relativePath ?? ""));
}

export function detectDuplicateVideos(videos: VideoItem[]): DuplicateVideoGroup[] {
  const context = createDuplicateDetectionContext(videos);
  for (let aIndex = 0; aIndex < videos.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < videos.length; bIndex += 1) {
      const a = videos[aIndex];
      const b = videos[bIndex];
      const pair = scoreDuplicatePair(a, b);
      if (pair.score < 70) continue;
      context.pairScores.set([a.id, b.id].sort().join("\u0000"), pair);
      context.matchedIds.add(a.id);
      context.matchedIds.add(b.id);
      context.union(a.id, b.id);
    }
  }

  return buildDuplicateVideoGroups(videos, context);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function detectDuplicateVideosWithProgress(
  videos: VideoItem[],
  options: DuplicateDetectionOptions = {},
): Promise<DuplicateVideoGroup[]> {
  const context = createDuplicateDetectionContext(videos);
  const totalPairs = (videos.length * Math.max(videos.length - 1, 0)) / 2;
  const yieldEveryPairs = Math.max(1, options.yieldEveryPairs ?? 5000);
  let processedPairs = 0;

  const reportProgress = () => {
    options.onProgress?.({
      processedPairs,
      totalPairs,
      percent: totalPairs ? Math.min(100, Math.round((processedPairs / totalPairs) * 100)) : 100,
    });
  };

  reportProgress();
  for (let aIndex = 0; aIndex < videos.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < videos.length; bIndex += 1) {
      if (options.signal?.aborted) throw new DOMException("Duplicate detection aborted.", "AbortError");
      const a = videos[aIndex];
      const b = videos[bIndex];
      const pair = scoreDuplicatePair(a, b);
      processedPairs += 1;
      if (pair.score >= 70) {
        context.pairScores.set([a.id, b.id].sort().join("\u0000"), pair);
        context.matchedIds.add(a.id);
        context.matchedIds.add(b.id);
        context.union(a.id, b.id);
      }
      if (processedPairs % yieldEveryPairs === 0) {
        reportProgress();
        await yieldToBrowser();
      }
    }
  }
  reportProgress();

  return buildDuplicateVideoGroups(videos, context);
}
