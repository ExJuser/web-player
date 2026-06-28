import {
  IGNORED_VIDEO_BASENAMES,
  MIN_LOCAL_VIDEO_SIZE_BYTES,
  SUBTITLE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./playerConstants";

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);

type FileFingerprint = Pick<File, "size" | "lastModified">;

export function hasExtension(name: string, extensions: Set<string>) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return extensions.has(name.slice(dotIndex).toLowerCase());
}

export function isVideoFile(name: string) {
  return hasExtension(name, VIDEO_EXTENSIONS);
}

export function isIgnoredVideoFile(name: string) {
  const fileName = name.split(/[\\/]/).pop() || name;
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return IGNORED_VIDEO_BASENAMES.has(baseName.toLowerCase());
}

export function shouldFilterLocalVideoFile(name: string, size: number) {
  return size < MIN_LOCAL_VIDEO_SIZE_BYTES || isIgnoredVideoFile(name);
}

export function isObjectUrl(value: string) {
  return value.startsWith("blob:");
}

export function isSubtitleFile(name: string) {
  return hasExtension(name, SUBTITLE_EXTENSIONS);
}

export function isPhotoFile(name: string) {
  return hasExtension(name, PHOTO_EXTENSIONS);
}

export function basePathOf(path: string) {
  const dotIndex = path.lastIndexOf(".");
  return dotIndex >= 0 ? path.slice(0, dotIndex).toLowerCase() : path.toLowerCase();
}

export function createLegacyVideoId(relativePath: string, file: FileFingerprint) {
  return `${relativePath}|${file.size}|${file.lastModified}`;
}

export function createGlobalVideoId(rootId: string, relativePath: string, file: FileFingerprint) {
  return `${rootId}|${relativePath}|${file.size}|${file.lastModified}`;
}

export function createPhotoAlbumFolderId(rootId: string, relativePath: string) {
  return `${rootId}|${relativePath}`;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function sanitizeLibraryName(name: string) {
  return (
    name
      .trim()
      .replace(/[^A-Za-z0-9._~-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "library"
  );
}
