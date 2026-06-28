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
  processedFingerprints?: number;
  totalFingerprints?: number;
  processedNamePairs?: number;
  totalNamePairs?: number;
  phase?: "metadata" | "aiName" | "fingerprint";
};

export type DuplicateNameSimilarityPair = {
  id: string;
  a: {
    id: string;
    name: string;
    relativePath: string;
    size: number;
    duration?: number;
  };
  b: {
    id: string;
    name: string;
    relativePath: string;
    size: number;
    duration?: number;
  };
  localScore: number;
};

export type DuplicateDetectionOptions = {
  yieldEveryPairs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: DuplicateDetectionProgress) => void;
  getContentFingerprint?: (video: VideoItem, signal?: AbortSignal) => Promise<string | null>;
  getNameSimilarityScores?: (pairs: DuplicateNameSimilarityPair[], signal?: AbortSignal) => Promise<Map<string, number>>;
  maxAiNamePairs?: number;
};

const duplicateMetadataThreshold = 100;
const duplicateHighConfidenceThreshold = 120;
const duplicateAiNameCandidateThreshold = 30;
const defaultMaxAiNamePairs = 80;

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

function getRelativeDelta(a: number | undefined, b: number | undefined) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) return null;
  return Math.abs(a - b) / Math.max(a, b);
}

function scoreDuplicatePair(a: VideoItem, b: VideoItem) {
  const reasons: string[] = [];
  let score = 0;

  const sizeDelta = getRelativeDelta(a.size, b.size);
  const durationDelta = getRelativeDelta(a.duration, b.duration);
  const isSizeClose = sizeDelta !== null && sizeDelta <= 0.02;
  const isDurationClose = durationDelta !== null && durationDelta <= 0.01;
  if (isSizeClose && isDurationClose) {
    score += 50;
    reasons.push("大小和时长接近");
  } else if (isSizeClose) {
    score += 10;
    reasons.push("大小接近");
  } else if (isDurationClose) {
    score += 10;
    reasons.push("时长接近");
  }

  if (a.width && a.height && b.width && b.height && a.width === b.width && a.height === b.height) {
    score += 20;
    reasons.push("分辨率一致");
  }

  return { score, reasons };
}

function createDuplicateNameSimilarityPair(
  id: string,
  a: VideoItem,
  b: VideoItem,
  localScore: number,
): DuplicateNameSimilarityPair {
  return {
    id,
    a: {
      id: a.id,
      name: a.name,
      relativePath: a.relativePath,
      size: a.size,
      duration: a.duration,
    },
    b: {
      id: b.id,
      name: b.name,
      relativePath: b.relativePath,
      size: b.size,
      duration: b.duration,
    },
    localScore,
  };
}

function createDuplicatePairKey(aId: string, bId: string) {
  return [aId, bId].sort().join("\u0000");
}

function mergeDuplicatePairScore(
  context: ReturnType<typeof createDuplicateDetectionContext>,
  a: VideoItem,
  b: VideoItem,
  pair: { score: number; reasons: string[] },
) {
  const key = createDuplicatePairKey(a.id, b.id);
  const existing = context.pairScores.get(key);
  const mergedReasons = new Set([...(existing?.reasons ?? []), ...pair.reasons]);
  context.pairScores.set(key, {
    score: Math.max(existing?.score ?? 0, pair.score),
    reasons: Array.from(mergedReasons),
  });
  context.matchedIds.add(a.id);
  context.matchedIds.add(b.id);
  context.union(a.id, b.id);
}

function addDuplicateContentCandidates(buckets: Map<number, VideoItem[]>, video: VideoItem) {
  if (!Number.isFinite(video.size) || video.size <= 0) return;
  const key = Math.floor(video.size);
  const bucket = buckets.get(key) ?? [];
  bucket.push(video);
  buckets.set(key, bucket);
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
        severity: (score >= duplicateHighConfidenceThreshold ? "duplicate" : "suspicious") as DuplicateVideoSeverity,
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
      if (pair.score < duplicateMetadataThreshold) continue;
      mergeDuplicatePairScore(context, a, b, pair);
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
  const contentCandidateBuckets = new Map<number, VideoItem[]>();
  const nameSimilarityCandidates: Array<{
    a: VideoItem;
    b: VideoItem;
    pair: { score: number; reasons: string[] };
  }> = [];
  let processedPairs = 0;
  let processedFingerprints = 0;
  let totalFingerprints = 0;
  let processedNamePairs = 0;
  let totalNamePairs = 0;
  let phase: DuplicateDetectionProgress["phase"] = "metadata";

  const reportProgress = () => {
    options.onProgress?.({
      processedPairs,
      totalPairs,
      processedFingerprints,
      totalFingerprints,
      processedNamePairs,
      totalNamePairs,
      phase,
      percent:
        phase === "fingerprint" && totalFingerprints
          ? Math.min(100, Math.round((processedFingerprints / totalFingerprints) * 100))
          : phase === "aiName" && totalNamePairs
            ? Math.min(100, Math.round((processedNamePairs / totalNamePairs) * 100))
          : totalPairs
            ? Math.min(100, Math.round((processedPairs / totalPairs) * 100))
            : 100,
    });
  };

  videos.forEach((video) => addDuplicateContentCandidates(contentCandidateBuckets, video));
  reportProgress();
  for (let aIndex = 0; aIndex < videos.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < videos.length; bIndex += 1) {
      if (options.signal?.aborted) throw new DOMException("Duplicate detection aborted.", "AbortError");
      const a = videos[aIndex];
      const b = videos[bIndex];
      const pair = scoreDuplicatePair(a, b);
      processedPairs += 1;
      if (pair.score >= duplicateMetadataThreshold) {
        mergeDuplicatePairScore(context, a, b, pair);
      } else if (pair.score >= duplicateAiNameCandidateThreshold) {
        nameSimilarityCandidates.push({ a, b, pair });
      }
      if (processedPairs % yieldEveryPairs === 0) {
        reportProgress();
        await yieldToBrowser();
      }
    }
  }
  reportProgress();

  if (options.getNameSimilarityScores && nameSimilarityCandidates.length) {
    const selectedCandidates = nameSimilarityCandidates
      .sort((a, b) => b.pair.score - a.pair.score || compareNaturalRelativePath(a.a.relativePath, b.a.relativePath))
      .slice(0, Math.max(0, options.maxAiNamePairs ?? defaultMaxAiNamePairs));
    if (selectedCandidates.length) {
      phase = "aiName";
      totalNamePairs = selectedCandidates.length;
      processedNamePairs = 0;
      reportProgress();
      const pairs = selectedCandidates.map((candidate, index) =>
        createDuplicateNameSimilarityPair(`pair-${index + 1}`, candidate.a, candidate.b, candidate.pair.score),
      );
      const similarityScores = await options.getNameSimilarityScores(pairs, options.signal);
      processedNamePairs = selectedCandidates.length;
      reportProgress();
      for (let index = 0; index < selectedCandidates.length; index += 1) {
        const candidate = selectedCandidates[index];
        const similarity = similarityScores.get(pairs[index].id);
        if (!Number.isFinite(similarity)) continue;
        const similarityScore = Math.max(0, Math.min(100, Math.round(similarity ?? 0)));
        const score = candidate.pair.score + similarityScore;
        if (score < duplicateMetadataThreshold) continue;
        mergeDuplicatePairScore(context, candidate.a, candidate.b, {
          score,
          reasons: [...candidate.pair.reasons, `AI 名称相似度 ${similarityScore}%`],
        });
      }
    }
  }

  if (options.getContentFingerprint) {
    const fingerprintCandidateBuckets = Array.from(contentCandidateBuckets.values()).filter((bucket) => bucket.length > 1);
    const fingerprintCandidates = Array.from(new Map(fingerprintCandidateBuckets.flat().map((video) => [video.id, video])).values());
    if (fingerprintCandidates.length > 1) {
      const fingerprintByVideoId = new Map<string, string>();
      phase = "fingerprint";
      totalFingerprints = fingerprintCandidates.length;
      processedFingerprints = 0;
      reportProgress();

      for (const video of fingerprintCandidates) {
        if (options.signal?.aborted) throw new DOMException("Duplicate detection aborted.", "AbortError");
        const fingerprint = await options.getContentFingerprint(video, options.signal);
        processedFingerprints += 1;
        if (fingerprint) fingerprintByVideoId.set(video.id, fingerprint);
        reportProgress();
        if (processedFingerprints % Math.max(1, Math.floor(yieldEveryPairs / 20)) === 0) {
          await yieldToBrowser();
        }
      }

      for (const bucket of fingerprintCandidateBuckets) {
        const videosByFingerprint = new Map<string, VideoItem[]>();
        for (const video of bucket) {
          const fingerprint = fingerprintByVideoId.get(video.id);
          if (!fingerprint) continue;
          const fingerprintVideos = videosByFingerprint.get(fingerprint) ?? [];
          fingerprintVideos.push(video);
          videosByFingerprint.set(fingerprint, fingerprintVideos);
        }
        for (const fingerprintVideos of videosByFingerprint.values()) {
          if (fingerprintVideos.length <= 1) continue;
          for (let aIndex = 0; aIndex < fingerprintVideos.length; aIndex += 1) {
            for (let bIndex = aIndex + 1; bIndex < fingerprintVideos.length; bIndex += 1) {
              const a = fingerprintVideos[aIndex];
              const b = fingerprintVideos[bIndex];
              const metadataPair = scoreDuplicatePair(a, b);
              mergeDuplicatePairScore(context, a, b, {
                score: Math.max(metadataPair.score, duplicateHighConfidenceThreshold),
                reasons: ["内容指纹一致", ...metadataPair.reasons],
              });
            }
          }
        }
      }
    }
  }

  return buildDuplicateVideoGroups(videos, context);
}
