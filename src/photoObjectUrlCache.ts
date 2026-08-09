import { revokeObjectUrl } from "./appResourceCleanup";
import type { PhotoAlbumImage } from "./playerTypes";

export const photoObjectUrlCacheLimit = 48;
const photoObjectUrlDefaultByteLimit = 256 * 1024 * 1024;
const photoObjectUrlLowMemoryByteLimit = 96 * 1024 * 1024;

export const photoObjectUrlCacheByteLimit = (() => {
  const deviceMemory = typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return deviceMemory && deviceMemory <= 4
    ? photoObjectUrlLowMemoryByteLimit
    : photoObjectUrlDefaultByteLimit;
})();

export type PhotoObjectUrlCacheMetadata = Record<string, {
  bytes: number;
  createdAt: number;
  decoded: boolean;
  lastAccessedAt: number;
}>;

export function removePhotoObjectUrlCacheEntries({
  accessTimes,
  decodedImageIds,
  filePromises,
  images,
  metadata,
  urls,
}: {
  accessTimes: Record<string, number>;
  decodedImageIds: Set<string>;
  filePromises: Record<string, unknown>;
  images: readonly Pick<PhotoAlbumImage, "id" | "url">[];
  metadata: PhotoObjectUrlCacheMetadata;
  urls: Record<string, string>;
}) {
  const nextUrls = { ...urls };
  images.forEach((image) => {
    revokeObjectUrl(urls[image.id]);
    revokeObjectUrl(image.url);
    delete nextUrls[image.id];
    delete accessTimes[image.id];
    delete metadata[image.id];
    delete filePromises[image.id];
    decodedImageIds.delete(image.id);
  });
  return nextUrls;
}

export function prunePhotoObjectUrlCache(
  urls: Record<string, string>,
  accessTimes: Record<string, number>,
  metadata: PhotoObjectUrlCacheMetadata,
  protectedIds: Set<string>,
  decodedImageIds?: Set<string>,
) {
  let cachedUrlCount = Object.keys(urls).length;
  let cachedBytes = Object.keys(urls).reduce((sum, id) => sum + (metadata[id]?.bytes ?? 0), 0);
  if (cachedUrlCount <= photoObjectUrlCacheLimit && cachedBytes <= photoObjectUrlCacheByteLimit) return urls;

  const nextUrls = { ...urls };
  const evictableEntries = Object.keys(nextUrls)
    .filter((id) => !protectedIds.has(id))
    .sort((a, b) => (accessTimes[a] ?? 0) - (accessTimes[b] ?? 0));

  while ((cachedUrlCount > photoObjectUrlCacheLimit || cachedBytes > photoObjectUrlCacheByteLimit) && evictableEntries.length) {
    const id = evictableEntries.shift();
    if (!id) break;
    URL.revokeObjectURL(nextUrls[id]);
    delete nextUrls[id];
    delete accessTimes[id];
    cachedBytes -= metadata[id]?.bytes ?? 0;
    delete metadata[id];
    decodedImageIds?.delete(id);
    cachedUrlCount -= 1;
  }

  return nextUrls;
}
