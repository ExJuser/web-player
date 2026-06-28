import {
  collator,
  defaultDanmakuPreferences,
  defaultPlayerPreferences,
  IGNORED_VIDEO_BASENAMES,
  MIN_LOCAL_VIDEO_SIZE_BYTES,
  PHOTO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "./playerConstants";
import type { MediaCollection, PlayerDataStore, PlayerLibraryMetadata } from "./playerTypes";

type FileFingerprint = Pick<File, "size" | "lastModified">;
type LibraryDirectory = { name: string };
const defaultDanmakuPreferencesJson = JSON.stringify(defaultDanmakuPreferences);
const defaultPlayerPreferencesJson = JSON.stringify(defaultPlayerPreferences);

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

export function createLibraryMetadata(directory: LibraryDirectory, media: MediaCollection): PlayerLibraryMetadata {
  const fingerprint = [
    directory.name,
    media.videos.length,
    ...media.videos
      .map((video) => `${video.relativePath}|${video.size}|${video.lastModified}`)
      .sort((a, b) => collator.compare(a, b)),
  ].join("\n");
  const id = `${sanitizeLibraryName(directory.name)}-${hashString(fingerprint)}`;
  return {
    id,
    name: directory.name,
    videoCount: media.videos.length,
    scannedFiles: media.scannedFiles,
    updatedAt: Date.now(),
  };
}

export function hasStoredData(store: PlayerDataStore) {
  return Boolean(
    Object.keys(store.progress).length ||
      store.favorites.length ||
      Object.keys(store.videoTags).length ||
      Object.keys(store.videoStats).length ||
      Object.keys(store.tagMergeDecisions).length ||
      store.embeddedSubtitles.length ||
      Object.keys(store.danmakuSelections).length ||
      JSON.stringify(store.danmakuPreferences) !== defaultDanmakuPreferencesJson ||
      JSON.stringify(store.preferences) !== defaultPlayerPreferencesJson
  );
}
