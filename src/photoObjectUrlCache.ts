export type PhotoObjectUrlCache = Record<string, string>;
export type PhotoObjectUrlAccessTimes = Record<string, number>;

export type PrunePhotoObjectUrlCacheInput = {
  urls: PhotoObjectUrlCache;
  accessTimes: PhotoObjectUrlAccessTimes;
  protectedIds: ReadonlySet<string>;
  decodedImageIds?: Set<string>;
  limit: number;
  revokeObjectUrl?: (url: string) => void;
};

export function prunePhotoObjectUrlCache({
  urls,
  accessTimes,
  protectedIds,
  decodedImageIds,
  limit,
  revokeObjectUrl = URL.revokeObjectURL,
}: PrunePhotoObjectUrlCacheInput) {
  let cachedUrlCount = Object.keys(urls).length;
  if (cachedUrlCount <= limit) return urls;

  const nextUrls = { ...urls };
  const evictableEntries = Object.keys(nextUrls)
    .filter((id) => !protectedIds.has(id))
    .sort((a, b) => (accessTimes[a] ?? 0) - (accessTimes[b] ?? 0));

  while (cachedUrlCount > limit && evictableEntries.length) {
    const id = evictableEntries.shift();
    if (!id) break;
    revokeObjectUrl(nextUrls[id]);
    delete nextUrls[id];
    delete accessTimes[id];
    decodedImageIds?.delete(id);
    cachedUrlCount -= 1;
  }

  return nextUrls;
}
