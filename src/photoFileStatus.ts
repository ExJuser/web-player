import type { PhotoAlbumImage } from "./playerTypes";

const photoLargeFileBytes = 20 * 1024 * 1024;
const broadlySupportedPhotoExtensions = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png"]);
const failedPhotoKeys = new Set<string>();

function getExtension(name: string) {
  const extensionIndex = name.lastIndexOf(".");
  return extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : "";
}

function getPhotoFailureKey(image: PhotoAlbumImage) {
  return `${image.id}:${image.lastModified}`;
}

export function isLargePhotoFile(image: PhotoAlbumImage) {
  return image.size >= photoLargeFileBytes;
}

export function formatPhotoFileSize(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getPhotoDecodeFailureMessage(image: PhotoAlbumImage) {
  return broadlySupportedPhotoExtensions.has(getExtension(image.name))
    ? "图片文件可能已损坏，无法解码"
    : "当前浏览器可能不支持此图片格式，或文件已损坏";
}

export function hasCachedPhotoDecodeFailure(image: PhotoAlbumImage) {
  return failedPhotoKeys.has(getPhotoFailureKey(image));
}

export function cachePhotoDecodeFailure(image: PhotoAlbumImage) {
  failedPhotoKeys.add(getPhotoFailureKey(image));
}
