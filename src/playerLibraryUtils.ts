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
import type { MediaCollection, PersistedEmbeddedSubtitle, PlayerDataStore, PlayerLibraryMetadata, VideoItem } from "./playerTypes";
import { createWatchActivityKey } from "./watchActivityInsights";

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
      Object.keys(store.watchActivity).length ||
      Object.keys(store.tagMergeDecisions).length ||
      store.embeddedSubtitles.length ||
      Object.keys(store.danmakuSelections).length ||
      Object.keys(store.duplicateDetections ?? {}).length ||
      Boolean(store.duplicateDetection) ||
      JSON.stringify(store.danmakuPreferences) !== defaultDanmakuPreferencesJson ||
      JSON.stringify(store.preferences) !== defaultPlayerPreferencesJson
  );
}

type VideoIdentity = Pick<VideoItem, "id" | "name" | "relativePath" | "size" | "lastModified">;

function normalizeFingerprintPath(path: string) {
  return path.replace(/\\/g, "/").trim().normalize("NFKC").toLowerCase();
}

function basenameOf(path: string) {
  return normalizeFingerprintPath(path).split("/").filter(Boolean).pop() ?? "";
}

function fingerprintKey(relativePath: string, size: number, lastModified: number) {
  return `${normalizeFingerprintPath(relativePath)}|${Math.max(0, Math.floor(size))}|${Math.max(0, Math.round(lastModified))}`;
}

function basenameFingerprintKey(relativePath: string, size: number, lastModified: number) {
  return `${basenameOf(relativePath)}|${Math.max(0, Math.floor(size))}|${Math.max(0, Math.round(lastModified))}`;
}

function parseGlobalVideoId(id: string) {
  const firstSeparator = id.indexOf("|");
  const lastSeparator = id.lastIndexOf("|");
  const sizeSeparator = lastSeparator > firstSeparator ? id.lastIndexOf("|", lastSeparator - 1) : -1;
  if (firstSeparator <= 0 || sizeSeparator <= firstSeparator || lastSeparator <= sizeSeparator) return null;

  const relativePath = id.slice(firstSeparator + 1, sizeSeparator);
  const size = Number(id.slice(sizeSeparator + 1, lastSeparator));
  const lastModified = Number(id.slice(lastSeparator + 1));
  if (!relativePath || !Number.isFinite(size) || !Number.isFinite(lastModified)) return null;
  return { relativePath, size, lastModified };
}

function addUniqueMapping(map: Map<string, string | null>, key: string, id: string) {
  if (!key) return;
  map.set(key, map.has(key) ? null : id);
}

function buildUniqueVideoMapping(videos: VideoIdentity[]) {
  const exact = new Map<string, string | null>();
  const basename = new Map<string, string | null>();
  videos.forEach((video) => {
    addUniqueMapping(exact, fingerprintKey(video.relativePath, video.size, video.lastModified), video.id);
    addUniqueMapping(basename, basenameFingerprintKey(video.relativePath || video.name, video.size, video.lastModified), video.id);
  });
  return { exact, basename };
}

function resolveMovedVideoId(id: string, mapping: ReturnType<typeof buildUniqueVideoMapping>) {
  const parsed = parseGlobalVideoId(id);
  if (!parsed) return null;
  const exactMatch = mapping.exact.get(fingerprintKey(parsed.relativePath, parsed.size, parsed.lastModified));
  if (exactMatch) return exactMatch === id ? null : exactMatch;
  const basenameMatch = mapping.basename.get(basenameFingerprintKey(parsed.relativePath, parsed.size, parsed.lastModified));
  return basenameMatch && basenameMatch !== id ? basenameMatch : null;
}

function migrateEmbeddedSubtitles(
  subtitles: PersistedEmbeddedSubtitle[],
  mapping: ReturnType<typeof buildUniqueVideoMapping>,
) {
  let didMigrate = false;
  const existingKeys = new Set(subtitles.map((subtitle) => `${subtitle.videoId}:${subtitle.embeddedTrack.streamIndex}`));
  const nextSubtitles = [...subtitles];

  subtitles.forEach((subtitle) => {
    const nextVideoId = resolveMovedVideoId(subtitle.videoId, mapping);
    if (!nextVideoId) return;
    const key = `${nextVideoId}:${subtitle.embeddedTrack.streamIndex}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    nextSubtitles.push({ ...subtitle, videoId: nextVideoId });
    didMigrate = true;
  });

  return { subtitles: nextSubtitles, didMigrate };
}

export function migrateMovedVideoData(store: PlayerDataStore, targetVideos: VideoIdentity[]) {
  if (!targetVideos.length || !hasStoredData(store)) return store;

  const mapping = buildUniqueVideoMapping(targetVideos);
  let didMigrate = false;

  const nextProgress = { ...store.progress };
  Object.entries(store.progress).forEach(([videoId, progress]) => {
    const nextVideoId = resolveMovedVideoId(videoId, mapping);
    if (nextVideoId && !nextProgress[nextVideoId]) {
      nextProgress[nextVideoId] = progress;
      didMigrate = true;
    }
  });

  const favoriteIds = new Set(store.favorites);
  store.favorites.forEach((videoId) => {
    const nextVideoId = resolveMovedVideoId(videoId, mapping);
    if (nextVideoId && !favoriteIds.has(nextVideoId)) {
      favoriteIds.add(nextVideoId);
      didMigrate = true;
    }
  });

  const nextVideoTags = { ...store.videoTags };
  Object.entries(store.videoTags).forEach(([videoId, tags]) => {
    const nextVideoId = resolveMovedVideoId(videoId, mapping);
    if (nextVideoId && !nextVideoTags[nextVideoId]) {
      nextVideoTags[nextVideoId] = tags;
      didMigrate = true;
    }
  });

  const nextWatchActivity = { ...store.watchActivity };
  Object.values(store.watchActivity).forEach((activity) => {
    const nextVideoId = resolveMovedVideoId(activity.videoId, mapping);
    if (!nextVideoId) return;
    const nextKey = createWatchActivityKey(activity.date, nextVideoId);
    if (nextWatchActivity[nextKey]) return;
    nextWatchActivity[nextKey] = { ...activity, videoId: nextVideoId };
    didMigrate = true;
  });

  const nextDanmakuSelections = { ...store.danmakuSelections };
  Object.entries(store.danmakuSelections).forEach(([videoId, selection]) => {
    const nextVideoId = resolveMovedVideoId(videoId, mapping);
    if (nextVideoId && !nextDanmakuSelections[nextVideoId]) {
      nextDanmakuSelections[nextVideoId] = selection;
      didMigrate = true;
    }
  });

  const { subtitles: nextEmbeddedSubtitles, didMigrate: didMigrateSubtitles } = migrateEmbeddedSubtitles(
    store.embeddedSubtitles,
    mapping,
  );
  didMigrate ||= didMigrateSubtitles;

  return didMigrate
    ? {
        ...store,
        progress: nextProgress,
        favorites: Array.from(favoriteIds),
        videoTags: nextVideoTags,
        watchActivity: nextWatchActivity,
        embeddedSubtitles: nextEmbeddedSubtitles,
        danmakuSelections: nextDanmakuSelections,
      }
    : store;
}
