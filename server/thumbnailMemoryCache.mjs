import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { BoundedLruCache } from "./boundedLruCache.mjs";

export const defaultThumbnailMemoryCacheMaxEntries = 4096;
export const defaultThumbnailMemoryCacheMaxBytes = 64 * 1024 * 1024;
export const defaultThumbnailMemoryCacheWarmupConcurrency = 16;
// 启动预热默认只读取缓存能容纳的文件数：超出容量的文件读入后也会被 LRU 立即淘汰，
// 属于纯浪费的磁盘 I/O。按容量封顶后，预热 I/O 有界且不会把缓存目录全盘读一遍。
export const defaultThumbnailMemoryCacheWarmupFileLimit = defaultThumbnailMemoryCacheMaxEntries;

export function createThumbnailMemoryCache({
  maxEntries = defaultThumbnailMemoryCacheMaxEntries,
  maxBytes = defaultThumbnailMemoryCacheMaxBytes,
  readFileImpl = readFile,
  readDirectoryImpl = readdir,
} = {}) {
  const cache = new BoundedLruCache({ maxEntries, maxBytes });
  const inFlightLoads = new Map();
  const revisions = new Map();
  const counters = { hits: 0, misses: 0, coalesced: 0, diskReads: 0 };
  let epoch = 0;

  const getRevision = (thumbnailId) => revisions.get(thumbnailId) ?? 0;

  const set = (thumbnailId, buffer, contentType = "image/jpeg") => {
    revisions.set(thumbnailId, getRevision(thumbnailId) + 1);
    const entry = { buffer, contentType };
    cache.set(thumbnailId, entry, buffer.length);
    return entry;
  };

  const invalidate = (thumbnailId) => {
    revisions.set(thumbnailId, getRevision(thumbnailId) + 1);
    inFlightLoads.delete(thumbnailId);
    return cache.invalidate(thumbnailId);
  };

  const clear = () => {
    epoch += 1;
    revisions.clear();
    inFlightLoads.clear();
    cache.clear();
    Object.keys(counters).forEach((key) => {
      counters[key] = 0;
    });
  };

  const getOrLoad = async ({ thumbnailId, filePath, contentType = "image/jpeg", recordStats = true }) => {
    const cached = cache.get(thumbnailId);
    if (cached) {
      if (recordStats) counters.hits += 1;
      return { ...cached, cacheStatus: "HIT" };
    }

    const existingLoad = inFlightLoads.get(thumbnailId);
    if (existingLoad) {
      if (recordStats) counters.coalesced += 1;
      return { ...await existingLoad, cacheStatus: "HIT" };
    }

    if (recordStats) counters.misses += 1;
    const loadEpoch = epoch;
    const loadRevision = getRevision(thumbnailId);
    const loadPromise = (async () => {
      if (recordStats) counters.diskReads += 1;
      const buffer = await readFileImpl(filePath);
      if (!buffer.length) throw new Error("Thumbnail cache file is empty.");
      const entry = { buffer, contentType };
      if (epoch === loadEpoch && getRevision(thumbnailId) === loadRevision) {
        cache.set(thumbnailId, entry, buffer.length);
      }
      return entry;
    })();
    inFlightLoads.set(thumbnailId, loadPromise);
    try {
      return { ...await loadPromise, cacheStatus: "MISS" };
    } finally {
      if (inFlightLoads.get(thumbnailId) === loadPromise) inFlightLoads.delete(thumbnailId);
    }
  };

  const warmDirectory = async ({
    cacheRoot,
    contentType = "image/jpeg",
    concurrency = defaultThumbnailMemoryCacheWarmupConcurrency,
    maxFiles = defaultThumbnailMemoryCacheWarmupFileLimit,
  }) => {
    let directoryEntries;
    try {
      directoryEntries = await readDirectoryImpl(cacheRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return { loaded: 0, failed: 0, ...cache.stats() };
      throw error;
    }
    const fileLimit = Math.max(0, Math.floor(maxFiles));
    const files = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".blob"))
      .slice(0, fileLimit);
    const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), files.length);
    let nextIndex = 0;
    let loaded = 0;
    let failed = 0;
    const worker = async () => {
      while (nextIndex < files.length) {
        const file = files[nextIndex];
        nextIndex += 1;
        const thumbnailId = file.name.slice(0, -".blob".length);
        try {
          await getOrLoad({ thumbnailId, filePath: path.join(cacheRoot, file.name), contentType, recordStats: false });
          loaded += 1;
        } catch {
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return { loaded, failed, ...cache.stats() };
  };

  return {
    clear,
    getOrLoad,
    invalidate,
    set,
    stats: () => ({ ...cache.stats(), ...counters }),
    warmDirectory,
  };
}
