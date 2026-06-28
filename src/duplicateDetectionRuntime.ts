import type { HomeMediaMode, PlayerDataStore, VideoItem } from "./playerTypes";
import type { DuplicateNameSimilarityPair, DuplicateVideoGroup } from "./playerMediaUtils";

export type DuplicateFingerprintCacheEntry = {
  fingerprint: string | null;
};

export type DuplicateNameSimilarityCacheEntry = {
  similarity: number;
};

export type DuplicateNameSimilarityResponse = {
  scores?: Array<{
    id?: string;
    similarity?: number;
  }>;
};

export type DuplicatePlaylistVideoMeta = {
  groupIndex: number;
  groupSize: number;
  severity: DuplicateVideoGroup["severity"];
  reasons: string[];
};

const duplicateFingerprintSampleSize = 1024 * 1024;

export function createPersistedDuplicateDetectionResult(
  mode: HomeMediaMode,
  groups: DuplicateVideoGroup[],
  message?: string,
): PlayerDataStore["duplicateDetection"] {
  const pairsByKey = new Map<string, DuplicateVideoGroup["pairs"][number]>();
  groups.forEach((group) => {
    group.pairs.forEach((pair) => {
      const existing = pairsByKey.get(pair.key);
      if (!existing || pair.score > existing.score) {
        pairsByKey.set(pair.key, pair);
      }
    });
  });
  const pairs = Array.from(pairsByKey.values());
  if (!pairs.length) return null;
  return {
    mode,
    scopeKey: mode,
    pairs,
    updatedAt: Date.now(),
    message: message?.trim() || undefined,
  };
}

export function createDuplicateFingerprintCacheKey(video: VideoItem) {
  return `${video.id}|${Math.floor(video.size || 0)}|${Math.round(video.lastModified || 0)}`;
}

export function createDuplicateNameSimilarityCacheKey(pair: DuplicateNameSimilarityPair) {
  const aKey = `${pair.a.id}|${pair.a.name}|${pair.a.relativePath}|${Math.floor(pair.a.size || 0)}|${Math.round(pair.a.duration ?? 0)}`;
  const bKey = `${pair.b.id}|${pair.b.name}|${pair.b.relativePath}|${Math.floor(pair.b.size || 0)}|${Math.round(pair.b.duration ?? 0)}`;
  return [aKey, bKey].sort().join("\u0000");
}

export function createDuplicateSampleRanges(size: number) {
  if (!Number.isFinite(size) || size <= 0) return [];
  const sampleSize = Math.min(duplicateFingerprintSampleSize, Math.floor(size));
  if (size <= sampleSize * 3) return [{ start: 0, end: Math.floor(size) - 1 }];

  const middleStart = Math.max(0, Math.floor(size / 2 - sampleSize / 2));
  return [
    { start: 0, end: sampleSize - 1 },
    { start: middleStart, end: middleStart + sampleSize - 1 },
    { start: Math.floor(size) - sampleSize, end: Math.floor(size) - 1 },
  ];
}

export async function readDuplicateSampleRange(video: VideoItem, range: { start: number; end: number }, signal?: AbortSignal) {
  if (video.file) {
    return new Uint8Array(await video.file.slice(range.start, range.end + 1).arrayBuffer());
  }
  if (!video.url) return null;

  const isWholeFile = range.start === 0 && range.end + 1 >= video.size;
  const response = await fetch(video.url, {
    headers: isWholeFile ? undefined : { Range: `bytes=${range.start}-${range.end}` },
    signal,
  });
  if (!response.ok) return null;
  if (!isWholeFile && response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function createDuplicateContentFingerprint(video: VideoItem, signal?: AbortSignal) {
  if (!globalThis.crypto?.subtle) return null;
  const ranges = createDuplicateSampleRanges(video.size);
  if (!ranges.length) return null;

  const chunks: Uint8Array[] = [];
  for (const range of ranges) {
    const chunk = await readDuplicateSampleRange(video, range, signal);
    if (!chunk) return null;
    chunks.push(chunk);
  }

  const header = new TextEncoder().encode(`duplicate-sample-v1|${Math.floor(video.size)}|${ranges.map((range) => `${range.start}-${range.end}`).join(",")}|`);
  const totalLength = header.byteLength + chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const payload = new Uint8Array(totalLength);
  payload.set(header, 0);
  let offset = header.byteLength;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const digest = await crypto.subtle.digest("SHA-256", payload);
  return `${Math.floor(video.size)}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
