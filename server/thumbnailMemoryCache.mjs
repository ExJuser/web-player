import { readFile } from "node:fs/promises";

import { BoundedLruCache } from "./boundedLruCache.mjs";

export const defaultThumbnailMemoryCacheMaxEntries = 1024;
export const defaultThumbnailMemoryCacheMaxBytes = 128 * 1024 * 1024;

export function createThumbnailMemoryCache({
  maxEntries = defaultThumbnailMemoryCacheMaxEntries,
  maxBytes = defaultThumbnailMemoryCacheMaxBytes,
  readFileImpl = readFile,
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

  return {
    clear,
    getOrLoad,
    invalidate,
    set,
    stats: () => cache.stats(),
  };
}
