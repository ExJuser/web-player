import type { PhotoAlbumImage } from "./playerTypes";

const photoPreviewCandidateSize = 6 * 1024 * 1024;
const photoPreviewForcedSize = 20 * 1024 * 1024;
const photoPreviewPixelCount = 16_000_000;
const photoPreviewMaxDimension = 1600;
const photoPreviewCacheLimit = 24;
const photoPreviewDefaultByteLimit = 32 * 1024 * 1024;
const photoPreviewLowMemoryByteLimit = 16 * 1024 * 1024;
const supportedPreviewExtensions = new Set([".bmp", ".jpeg", ".jpg", ".png"]);

type PhotoPreviewCacheEntry = {
  blobBytes: number;
  createdAt: number;
  lastAccessedAt: number;
  promise: Promise<Blob | null>;
};

const photoPreviewCacheByteLimit = (() => {
  const deviceMemory = typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return deviceMemory && deviceMemory <= 4
    ? photoPreviewLowMemoryByteLimit
    : photoPreviewDefaultByteLimit;
})();
const previewCache = new Map<string, PhotoPreviewCacheEntry>();

function prunePhotoPreviewCache() {
  let cachedBytes = Array.from(previewCache.values()).reduce((sum, entry) => sum + entry.blobBytes, 0);
  while ((previewCache.size > photoPreviewCacheLimit || cachedBytes > photoPreviewCacheByteLimit) && previewCache.size) {
    const oldestKey = previewCache.keys().next().value;
    if (!oldestKey) break;
    cachedBytes -= previewCache.get(oldestKey)?.blobBytes ?? 0;
    previewCache.delete(oldestKey);
  }
}

export function getPhotoPreviewCacheStatus() {
  const entries = Array.from(previewCache.values());
  return {
    bytes: entries.reduce((sum, entry) => sum + entry.blobBytes, 0),
    entries: entries.length,
    updatedAt: entries.reduce((latest, entry) => Math.max(latest, entry.lastAccessedAt), 0) || null,
  };
}

export function clearPhotoPreviewCache() {
  previewCache.clear();
}

function getExtension(name: string) {
  const extensionIndex = name.lastIndexOf(".");
  return extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : "";
}

export function shouldCreatePhotoPreview(image: PhotoAlbumImage) {
  return image.size >= photoPreviewCandidateSize && supportedPreviewExtensions.has(getExtension(image.name));
}

function readImageDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: view.getUint32(18, true), height: Math.abs(view.getInt32(22, true)) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength < 2 || offset + segmentLength + 2 > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += segmentLength + 2;
    }
  }
  return null;
}

async function createPreviewBlob(sourceUrl: string, image: PhotoAlbumImage) {
  const sourceBlob = image.file ?? await fetch(sourceUrl).then((response) => response.ok ? response.blob() : null);
  if (!sourceBlob) return null;
  const headerBytes = new Uint8Array(await sourceBlob.slice(0, 256 * 1024).arrayBuffer());
  const dimensions = readImageDimensions(headerBytes);
  if (!dimensions?.width || !dimensions.height) return null;
  if (image.size < photoPreviewForcedSize && dimensions.width * dimensions.height < photoPreviewPixelCount) return null;

  const scale = Math.min(1, photoPreviewMaxDimension / Math.max(dimensions.width, dimensions.height));
  if (scale >= 1) return null;
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const bitmap = await createImageBitmap(sourceBlob, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  } finally {
    bitmap.close();
  }
}

export function loadPhotoPreview(image: PhotoAlbumImage, sourceUrl: string) {
  const cacheKey = `${image.id}:${image.lastModified}`;
  const cached = previewCache.get(cacheKey);
  if (cached) {
    cached.lastAccessedAt = Date.now();
    previewCache.delete(cacheKey);
    previewCache.set(cacheKey, cached);
    return cached.promise;
  }

  const createdAt = Date.now();
  const entry: PhotoPreviewCacheEntry = {
    blobBytes: 0,
    createdAt,
    lastAccessedAt: createdAt,
    promise: Promise.resolve(null),
  };
  entry.promise = createPreviewBlob(sourceUrl, image)
    .catch(() => null)
    .then((blob) => {
      if (previewCache.get(cacheKey) === entry) {
        entry.blobBytes = blob?.size ?? 0;
        prunePhotoPreviewCache();
      }
      return blob;
    });
  previewCache.set(cacheKey, entry);
  prunePhotoPreviewCache();
  return entry.promise;
}
