import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { BoundedLruCache } from "./boundedLruCache.mjs";

export const defaultThumbnailMemoryCacheMaxEntries = Number.POSITIVE_INFINITY;
export const defaultThumbnailMemoryCacheMaxBytes = Number.POSITIVE_INFINITY;
export const defaultThumbnailMemoryCacheWarmupConcurrency = 16;

export function createThumbnailMemoryCache({
  maxEntries = defaultThumbnailMemoryCacheMaxEntries,
  maxBytes = defaultThumbnailMemoryCacheMaxBytes,
  readFileImpl = readFile,
  readDirectoryImpl = readdir,
} = {}) {
  const cache = new BoundedLruCache({ maxEntries, maxBytes });
  const inFlightLoads = new Map();
  const revisions = new Map();
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
  };

  const getOrLoad = async ({ thumbnailId, filePath, contentType = "image/jpeg" }) => {
    const cached = cache.get(thumbnailId);
    if (cached) return { ...cached, cacheStatus: "HIT" };

    const existingLoad = inFlightLoads.get(thumbnailId);
    if (existingLoad) return { ...await existingLoad, cacheStatus: "HIT" };

    const loadEpoch = epoch;
    const loadRevision = getRevision(thumbnailId);
    const loadPromise = (async () => {
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
  }) => {
    let directoryEntries;
    try {
      directoryEntries = await readDirectoryImpl(cacheRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return { loaded: 0, failed: 0, ...cache.stats() };
      throw error;
    }
    const files = directoryEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".blob"));
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
          await getOrLoad({ thumbnailId, filePath: path.join(cacheRoot, file.name), contentType });
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
    stats: () => cache.stats(),
    warmDirectory,
  };
}
