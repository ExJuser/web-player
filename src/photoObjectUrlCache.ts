export const photoObjectUrlCacheLimit = 48;

export function prunePhotoObjectUrlCache(
  urls: Record<string, string>,
  accessTimes: Record<string, number>,
  protectedIds: Set<string>,
  decodedImageIds?: Set<string>,
) {
  let cachedUrlCount = Object.keys(urls).length;
  if (cachedUrlCount <= photoObjectUrlCacheLimit) return urls;

  const nextUrls = { ...urls };
  const evictableEntries = Object.keys(nextUrls)
    .filter((id) => !protectedIds.has(id))
    .sort((a, b) => (accessTimes[a] ?? 0) - (accessTimes[b] ?? 0));

  while (cachedUrlCount > photoObjectUrlCacheLimit && evictableEntries.length) {
    const id = evictableEntries.shift();
    if (!id) break;
    URL.revokeObjectURL(nextUrls[id]);
    delete nextUrls[id];
    delete accessTimes[id];
    decodedImageIds?.delete(id);
    cachedUrlCount -= 1;
  }

  return nextUrls;
}
