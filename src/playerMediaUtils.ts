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

export type DuplicateVideoPair = {
  key: string;
  aId: string;
  bId: string;
  severity: DuplicateVideoSeverity;
  score: number;
  reasons: string[];
};

export type DuplicateVideoGroup = {
  id: string;
  severity: DuplicateVideoSeverity;
  score: number;
  reasons: string[];
  videos: VideoItem[];
  pairs: DuplicateVideoPair[];
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

export type DuplicateDetectionMode = "all" | "anime" | "special";

export type DuplicateDetectionContext = {
  mode?: DuplicateDetectionMode;
};

export type DuplicateDetectionOptions = DuplicateDetectionContext & {
  yieldEveryPairs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: DuplicateDetectionProgress) => void;
  getContentFingerprint?: (video: VideoItem, signal?: AbortSignal) => Promise<string | null>;
  getNameSimilarityScores?: (pairs: DuplicateNameSimilarityPair[], signal?: AbortSignal) => Promise<Map<string, number>>;
  onNameSimilarityError?: (error: unknown) => void;
  maxAiNamePairs?: number;
  aiNameBatchSize?: number;
  maxFingerprintVideos?: number;
};

const duplicateSuspiciousThreshold = 80;
const duplicateHighConfidenceThreshold = 120;
const duplicateAiNameCandidateThreshold = 60;
const duplicateFingerprintCandidateThreshold = 45;
const defaultMaxAiNamePairs = 240;
const defaultAiNameBatchSize = 80;
const defaultMaxFingerprintVideos = 200;
const duplicateCandidateNeighborLimit = 36;

const duplicateNoisePattern =
  /\b(?:copy|copied|backup|web|web-dl|webrip|bluray|bdrip|hdrip|x264|x265|h264|h265|hevc|avc|aac|flac|opus|1080p|720p|2160p|4k|8k)\b/gi;
const animeEpisodePattern =
  /\b(?:s\d{1,2}\s*e|ep(?:isode)?|e)\s*0*(\d{1,4})(?:\b|v\d\b)|第\s*0*(\d{1,4})\s*[集话話]|(?:^|[\s._-])0*(\d{1,4})(?:\s*(?:v\d|end|fin))?(?=\s*(?:\[[^\]]+\]|【[^】]+】)?(?:\.[^.]+)?$)/i;

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

function getDuplicateNameTokens(value: string) {
  return normalizeDuplicateName(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isWeakDuplicateName(tokens: string[]) {
  return tokens.length === 1 && /^\d{1,3}$/.test(tokens[0]);
}

function getAnimeDuplicateInfo(video: VideoItem) {
  const fileName = (video.name || video.relativePath || "").split(/[\\/]/).at(-1) ?? "";
  const source = `${video.relativePath || ""}/${fileName}`.normalize("NFKC");
  const episodeMatch = fileName.match(animeEpisodePattern) ?? source.match(animeEpisodePattern);
  const episode = episodeMatch ? Number.parseInt(episodeMatch[1] ?? episodeMatch[2] ?? episodeMatch[3] ?? "", 10) : null;
  const seriesName = normalizeDuplicateName(fileName || video.relativePath)
    .replace(/\b(?:s\d{1,2}\s*e|ep(?:isode)?|e)\s*\d{1,4}\b/gi, " ")
    .replace(/第\s*\d{1,4}\s*[集话話]/g, " ")
    .replace(/(?:^| )\d{1,4}(?: |$)/g, " ")
    .replace(/\b(?:copy|copied)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    episode: Number.isFinite(episode) ? episode : null,
    seriesName,
  };
}

function isAnimeDifferentEpisodePair(a: VideoItem, b: VideoItem, context?: DuplicateDetectionContext) {
  if (context?.mode !== "anime") return false;
  const aInfo = getAnimeDuplicateInfo(a);
  const bInfo = getAnimeDuplicateInfo(b);
  return Boolean(
    aInfo.seriesName &&
      bInfo.seriesName &&
      aInfo.seriesName === bInfo.seriesName &&
      aInfo.episode !== null &&
      bInfo.episode !== null &&
      aInfo.episode !== bInfo.episode,
  );
}

function getDuplicateNameScore(a: VideoItem, b: VideoItem) {
  const reasons: string[] = [];
  const aTokens = getDuplicateNameTokens(a.name || a.relativePath);
  const bTokens = getDuplicateNameTokens(b.name || b.relativePath);
  const aName = aTokens.join(" ");
  const bName = bTokens.join(" ");
  if (!aName || !bName) return { score: 0, reasons };

  if (aName === bName) {
    if (isWeakDuplicateName(aTokens) || isWeakDuplicateName(bTokens)) {
      return { score: 20, reasons: ["短编号名称一致"] };
    }
    return { score: 60, reasons: ["名称规范化一致"] };
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const union = new Set([...aSet, ...bSet]);
  if (!union.size) return { score: 0, reasons };
  let overlap = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) overlap += 1;
  });
  const similarity = overlap / union.size;
  const aNumbers = aTokens.filter((token) => /^\d+$/.test(token));
  const bNumbers = new Set(bTokens.filter((token) => /^\d+$/.test(token)));
  const hasSharedNumber = aNumbers.some((token) => bNumbers.has(token));

  if (similarity >= 0.85) {
    reasons.push("名称高度相似");
    return { score: 45, reasons };
  }
  if (similarity >= 0.65 || (hasSharedNumber && overlap >= 2)) {
    reasons.push("名称相似");
    return { score: 30, reasons };
  }
  return { score: 0, reasons };
}

function scoreDuplicatePair(a: VideoItem, b: VideoItem, context?: DuplicateDetectionContext) {
  if (isAnimeDifferentEpisodePair(a, b, context)) {
    return { score: 0, reasons: ["追番不同集"] };
  }

  const reasons: string[] = [];
  let score = 0;

  const namePair = getDuplicateNameScore(a, b);
  score += namePair.score;
  reasons.push(...namePair.reasons);

  const sizeDelta = getRelativeDelta(a.size, b.size);
  const durationDelta = getRelativeDelta(a.duration, b.duration);
  if (sizeDelta !== null && sizeDelta <= 0.005) {
    score += 35;
    reasons.push("大小几乎一致");
  } else if (sizeDelta !== null && sizeDelta <= 0.02) {
    score += 25;
    reasons.push("大小接近");
  }

  if (durationDelta !== null && durationDelta <= 0.003) {
    score += 35;
    reasons.push("时长几乎一致");
  } else if (durationDelta !== null && durationDelta <= 0.01) {
    score += 25;
    reasons.push("时长接近");
  }

  if (a.width && a.height && b.width && b.height && a.width === b.width && a.height === b.height) {
    score += 15;
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

function createDuplicateVideoPair(a: VideoItem, b: VideoItem, pair: { score: number; reasons: string[] }): DuplicateVideoPair {
  const key = createDuplicatePairKey(a.id, b.id);
  return {
    key,
    aId: a.id,
    bId: b.id,
    score: pair.score,
    severity: pair.score >= duplicateHighConfidenceThreshold ? "duplicate" : "suspicious",
    reasons: Array.from(new Set(pair.reasons)),
  };
}

function mergeDuplicatePairScore(pairScores: Map<string, DuplicateVideoPair>, a: VideoItem, b: VideoItem, pair: { score: number; reasons: string[] }) {
  if (pair.score < duplicateSuspiciousThreshold) return;
  const key = createDuplicatePairKey(a.id, b.id);
  const existing = pairScores.get(key);
  if (!existing || pair.score > existing.score) {
    pairScores.set(key, createDuplicateVideoPair(a, b, pair));
    return;
  }
  if (pair.score === existing.score) {
    pairScores.set(key, {
      ...existing,
      reasons: Array.from(new Set([...existing.reasons, ...pair.reasons])),
    });
  }
}

function createDuplicatePairCandidate(a: VideoItem, b: VideoItem) {
  return {
    key: createDuplicatePairKey(a.id, b.id),
    a,
    b,
  };
}

function addDuplicateCandidate(candidates: Map<string, ReturnType<typeof createDuplicatePairCandidate>>, a: VideoItem, b: VideoItem) {
  if (a.id === b.id) return;
  const candidate = createDuplicatePairCandidate(a, b);
  if (!candidates.has(candidate.key)) candidates.set(candidate.key, candidate);
}

function addDuplicateBucketCandidates(candidates: Map<string, ReturnType<typeof createDuplicatePairCandidate>>, bucket: VideoItem[]) {
  const sorted = [...bucket].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath));
  for (let aIndex = 0; aIndex < sorted.length; aIndex += 1) {
    const maxIndex = Math.min(sorted.length, aIndex + 1 + duplicateCandidateNeighborLimit);
    for (let bIndex = aIndex + 1; bIndex < maxIndex; bIndex += 1) {
      addDuplicateCandidate(candidates, sorted[aIndex], sorted[bIndex]);
    }
  }
}

function addDuplicateWindowCandidates(
  candidates: Map<string, ReturnType<typeof createDuplicatePairCandidate>>,
  videos: VideoItem[],
  getValue: (video: VideoItem) => number | undefined,
  maxDelta: number,
) {
  const sorted = videos
    .map((video) => ({ video, value: getValue(video) }))
    .filter((item): item is { video: VideoItem; value: number } => typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => a.value - b.value || compareNaturalRelativePath(a.video.relativePath, b.video.relativePath));

  for (let aIndex = 0; aIndex < sorted.length; aIndex += 1) {
    let neighbors = 0;
    for (let bIndex = aIndex + 1; bIndex < sorted.length; bIndex += 1) {
      const delta = getRelativeDelta(sorted[aIndex].value, sorted[bIndex].value);
      if (delta === null || delta > maxDelta) break;
      addDuplicateCandidate(candidates, sorted[aIndex].video, sorted[bIndex].video);
      neighbors += 1;
      if (neighbors >= duplicateCandidateNeighborLimit) break;
    }
  }
}

function createDuplicatePairCandidates(videos: VideoItem[]) {
  const candidates = new Map<string, ReturnType<typeof createDuplicatePairCandidate>>();
  const normalizedNameBuckets = new Map<string, VideoItem[]>();

  videos.forEach((video) => {
    const normalizedName = normalizeDuplicateName(video.name || video.relativePath);
    if (!normalizedName) return;
    const bucket = normalizedNameBuckets.get(normalizedName) ?? [];
    bucket.push(video);
    normalizedNameBuckets.set(normalizedName, bucket);
  });

  normalizedNameBuckets.forEach((bucket) => {
    if (bucket.length > 1) addDuplicateBucketCandidates(candidates, bucket);
  });
  addDuplicateWindowCandidates(candidates, videos, (video) => video.size, 0.02);
  addDuplicateWindowCandidates(candidates, videos, (video) => video.duration, 0.01);

  return Array.from(candidates.values()).sort(
    (a, b) => compareNaturalRelativePath(a.a.relativePath, b.a.relativePath) || compareNaturalRelativePath(a.b.relativePath, b.b.relativePath),
  );
}

function createDuplicateDisjointSet(ids: string[]) {
  const parent = new Map<string, string>();
  ids.forEach((id) => parent.set(id, id));

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

  return { find, union };
}

function createDuplicateGroupFromPairs(
  videoById: Map<string, VideoItem>,
  pairs: DuplicateVideoPair[],
  idPrefix: string,
): DuplicateVideoGroup | null {
  const videoIds = new Set<string>();
  let score = 0;
  const reasons = new Set<string>();
  pairs.forEach((pair) => {
    videoIds.add(pair.aId);
    videoIds.add(pair.bId);
    score = Math.max(score, pair.score);
    pair.reasons.forEach((reason) => reasons.add(reason));
  });
  const videos = Array.from(videoIds)
    .map((id) => videoById.get(id))
    .filter((video): video is VideoItem => Boolean(video))
    .sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath));
  if (videos.length <= 1) return null;
  const sortedPairs = [...pairs].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return {
    id: `${idPrefix}:${videos.map((video) => video.id).join("|")}`,
    severity: score >= duplicateHighConfidenceThreshold ? "duplicate" : "suspicious",
    score,
    reasons: Array.from(reasons),
    videos,
    pairs: sortedPairs,
  };
}

function buildDuplicateVideoGroups(videos: VideoItem[], pairScores: Map<string, DuplicateVideoPair>): DuplicateVideoGroup[] {
  const videoById = new Map(videos.map((video) => [video.id, video]));
  const duplicatePairs = Array.from(pairScores.values()).filter((pair) => pair.severity === "duplicate");
  const suspiciousPairs = Array.from(pairScores.values()).filter((pair) => pair.severity === "suspicious");
  const disjointSet = createDuplicateDisjointSet(videos.map((video) => video.id));

  duplicatePairs.forEach((pair) => disjointSet.union(pair.aId, pair.bId));

  const duplicatePairsByRoot = new Map<string, DuplicateVideoPair[]>();
  duplicatePairs.forEach((pair) => {
    const root = disjointSet.find(pair.aId);
    const pairs = duplicatePairsByRoot.get(root) ?? [];
    pairs.push(pair);
    duplicatePairsByRoot.set(root, pairs);
  });

  const groups: DuplicateVideoGroup[] = [];
  const duplicateRootsWithGroups = new Set<string>();
  duplicatePairsByRoot.forEach((pairs, root) => {
    const group = createDuplicateGroupFromPairs(videoById, pairs, "duplicate");
    if (!group) return;
    groups.push(group);
    duplicateRootsWithGroups.add(root);
  });

  suspiciousPairs.forEach((pair) => {
    if (duplicateRootsWithGroups.has(disjointSet.find(pair.aId)) && disjointSet.find(pair.aId) === disjointSet.find(pair.bId)) return;
    const group = createDuplicateGroupFromPairs(videoById, [pair], "suspicious");
    if (group) groups.push(group);
  });

  return groups.sort(
    (a, b) =>
      (b.severity === "duplicate" ? 1 : 0) - (a.severity === "duplicate" ? 1 : 0) ||
      b.score - a.score ||
      compareNaturalRelativePath(a.videos[0]?.relativePath ?? "", b.videos[0]?.relativePath ?? ""),
  );
}

export function detectDuplicateVideos(videos: VideoItem[], context: DuplicateDetectionContext = {}): DuplicateVideoGroup[] {
  const pairScores = new Map<string, DuplicateVideoPair>();
  createDuplicatePairCandidates(videos).forEach((candidate) => {
    const pair = scoreDuplicatePair(candidate.a, candidate.b, context);
    mergeDuplicatePairScore(pairScores, candidate.a, candidate.b, pair);
  });
  return buildDuplicateVideoGroups(videos, pairScores);
}

export function rebuildDuplicateVideoGroups(videos: VideoItem[], groups: DuplicateVideoGroup[]): DuplicateVideoGroup[] {
  const availableIds = new Set(videos.map((video) => video.id));
  const pairScores = new Map<string, DuplicateVideoPair>();
  groups.flatMap((group) => group.pairs).forEach((pair) => {
    if (!availableIds.has(pair.aId) || !availableIds.has(pair.bId)) return;
    pairScores.set(pair.key, pair);
  });
  return buildDuplicateVideoGroups(videos, pairScores);
}

export function createDuplicateDetectionScopeKey(mode: string, videos: VideoItem[]) {
  return [
    mode,
    ...videos.map((video) =>
      [
        video.id,
        video.mediaRootId ?? "",
        video.relativePath,
        Math.floor(video.size || 0),
        Math.round(video.lastModified || 0),
      ].join("|"),
    ),
  ].join("\n");
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
  const pairScores = new Map<string, DuplicateVideoPair>();
  const candidates = createDuplicatePairCandidates(videos);
  const totalPairs = candidates.length;
  const yieldEveryPairs = Math.max(1, options.yieldEveryPairs ?? 5000);
  const nameSimilarityCandidates: Array<{
    a: VideoItem;
    b: VideoItem;
    pair: { score: number; reasons: string[] };
    pairKey: string;
  }> = [];
  const fingerprintCandidatePairs: Array<{
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

  const reportProgress = (explicitPercent?: number) => {
    const phasePercent =
      explicitPercent ??
      (phase === "fingerprint"
        ? 50 + (totalFingerprints ? Math.round((processedFingerprints / totalFingerprints) * 30) : 30)
        : phase === "aiName"
          ? 80 + (totalNamePairs ? Math.round((processedNamePairs / totalNamePairs) * 20) : 20)
          : totalPairs
            ? Math.round((processedPairs / totalPairs) * 50)
            : 50);
    options.onProgress?.({
      processedPairs,
      totalPairs,
      processedFingerprints,
      totalFingerprints,
      processedNamePairs,
      totalNamePairs,
      phase,
      percent: Math.min(100, Math.max(0, phasePercent)),
    });
  };

  reportProgress();
  for (const candidate of candidates) {
    if (options.signal?.aborted) throw new DOMException("Duplicate detection aborted.", "AbortError");
    const isSuppressedAnimePair = isAnimeDifferentEpisodePair(candidate.a, candidate.b, options);
    const pair = scoreDuplicatePair(candidate.a, candidate.b, options);
    processedPairs += 1;
    mergeDuplicatePairScore(pairScores, candidate.a, candidate.b, pair);
    if (!isSuppressedAnimePair && pair.score >= duplicateFingerprintCandidateThreshold) {
      fingerprintCandidatePairs.push({ a: candidate.a, b: candidate.b, pair });
    }
    if (!isSuppressedAnimePair && pair.score >= duplicateAiNameCandidateThreshold) {
      nameSimilarityCandidates.push({ a: candidate.a, b: candidate.b, pair, pairKey: candidate.key });
    }
    if (processedPairs % yieldEveryPairs === 0) {
      reportProgress();
      await yieldToBrowser();
    }
  }
  reportProgress(50);

  if (options.getContentFingerprint) {
    const maxFingerprintVideos = Math.max(0, options.maxFingerprintVideos ?? defaultMaxFingerprintVideos);
    const fingerprintCandidatesById = new Map<string, VideoItem>();
    [...fingerprintCandidatePairs]
      .sort((a, b) => b.pair.score - a.pair.score || compareNaturalRelativePath(a.a.relativePath, b.a.relativePath))
      .forEach((candidate) => {
        if (fingerprintCandidatesById.size >= maxFingerprintVideos) return;
        fingerprintCandidatesById.set(candidate.a.id, candidate.a);
        if (fingerprintCandidatesById.size >= maxFingerprintVideos) return;
        fingerprintCandidatesById.set(candidate.b.id, candidate.b);
      });
    const fingerprintCandidates = Array.from(fingerprintCandidatesById.values());
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

      const videosByFingerprint = new Map<string, VideoItem[]>();
      for (const video of fingerprintCandidates) {
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
            if (isAnimeDifferentEpisodePair(a, b, options)) continue;
            const metadataPair = scoreDuplicatePair(a, b, options);
            mergeDuplicatePairScore(pairScores, a, b, {
              score: Math.max(metadataPair.score, duplicateHighConfidenceThreshold),
              reasons: ["内容指纹一致", ...metadataPair.reasons],
            });
          }
        }
      }
    }
  }

  if (options.getNameSimilarityScores && nameSimilarityCandidates.length) {
    const maxAiNamePairs = Math.max(0, options.maxAiNamePairs ?? defaultMaxAiNamePairs);
    const aiNameBatchSize = Math.max(1, Math.min(defaultAiNameBatchSize, options.aiNameBatchSize ?? defaultAiNameBatchSize));
    const selectedCandidates = nameSimilarityCandidates
      .filter((candidate) => pairScores.get(candidate.pairKey)?.severity !== "duplicate")
      .sort((a, b) => b.pair.score - a.pair.score || compareNaturalRelativePath(a.a.relativePath, b.a.relativePath))
      .slice(0, maxAiNamePairs);
    if (selectedCandidates.length) {
      phase = "aiName";
      totalNamePairs = selectedCandidates.length;
      processedNamePairs = 0;
      reportProgress();
      for (let offset = 0; offset < selectedCandidates.length; offset += aiNameBatchSize) {
        if (options.signal?.aborted) throw new DOMException("Duplicate detection aborted.", "AbortError");
        const batchCandidates = selectedCandidates.slice(offset, offset + aiNameBatchSize);
        const pairs = batchCandidates.map((candidate, index) =>
          createDuplicateNameSimilarityPair(`pair-${offset + index + 1}`, candidate.a, candidate.b, candidate.pair.score),
        );
        let similarityScores: Map<string, number>;
        try {
          similarityScores = await options.getNameSimilarityScores(pairs, options.signal);
        } catch (error) {
          options.onNameSimilarityError?.(error);
          break;
        }
        processedNamePairs += batchCandidates.length;
        reportProgress();
        for (let index = 0; index < batchCandidates.length; index += 1) {
          const candidate = batchCandidates[index];
          const similarity = similarityScores.get(pairs[index].id);
          if (!Number.isFinite(similarity)) continue;
          const similarityScore = Math.max(0, Math.min(100, Math.round(similarity ?? 0)));
          const score = candidate.pair.reasons.includes("短编号名称一致")
            ? Math.min(candidate.pair.score + similarityScore, duplicateHighConfidenceThreshold - 1)
            : candidate.pair.score + similarityScore;
          if (score < duplicateSuspiciousThreshold) continue;
          mergeDuplicatePairScore(pairScores, candidate.a, candidate.b, {
            score,
            reasons: [...candidate.pair.reasons, `AI 名称相似度 ${similarityScore}%`],
          });
        }
      }
    }
  }

  reportProgress(100);
  return buildDuplicateVideoGroups(videos, pairScores);
}
