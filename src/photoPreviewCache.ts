import type { PhotoAlbumImage } from "./playerTypes";

const photoPreviewCandidateSize = 6 * 1024 * 1024;
const photoPreviewForcedSize = 20 * 1024 * 1024;
const photoPreviewPixelCount = 16_000_000;
const photoPreviewMaxDimension = 1600;
const photoPreviewCacheLimit = 24;
const supportedPreviewExtensions = new Set([".bmp", ".jpeg", ".jpg", ".png"]);

const previewCache = new Map<string, Promise<Blob | null>>();

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
    previewCache.delete(cacheKey);
    previewCache.set(cacheKey, cached);
    return cached;
  }

  const preview = createPreviewBlob(sourceUrl, image).catch(() => null);
  previewCache.set(cacheKey, preview);
  while (previewCache.size > photoPreviewCacheLimit) {
    const oldestKey = previewCache.keys().next().value;
    if (!oldestKey) break;
    previewCache.delete(oldestKey);
  }
  return preview;
}
