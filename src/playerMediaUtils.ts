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
