import {
  ArrowDownUp,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  EyeOff,
  HardDrive,
  Images,
  Keyboard,
  LocateFixed,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Rocket,
  Search,
  ShieldCheck,
  SkipForward,
  Star,
  Subtitles,
  Tags,
  Trash2,
  RefreshCw,
  Moon,
  Sun,
  X,
  VolumeX,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  applyLibrarySearchResultLimit,
  getVisibleLibrarySearchResults,
  librarySearchResultPageSize,
} from "./librarySearchUtils";
import type {
  ActiveView,
  AutoNextPrompt,
  DataTransferItemWithHandle,
  EmbeddedSubtitleTrack,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  HomeVideoCard,
  MediaCollection,
  MediaScanBatch,
  PlaybackMode,
  PlaybackProgress,
  PlayerDataStore,
  PlayerGlobalMetadata,
  PlayerLibraryMetadata,
  PlayerMediaRootStatus,
  PlayerPreferences,
  CachedPhotoAlbumScan,
  PhotoAlbum,
  PhotoAlbumImage,
  PhotoAlbumProgress,
  PhotoAlbumSortMode,
  PhotoAlbumStore,
  PlaylistFilter,
  PlaylistSortMode,
  ProgressStore,
  ShortcutAction,
  ShortcutMap,
  SubtitleItem,
  TagMergeDecisionStore,
  VideoItem,
  VideoPlayability,
  VideoMetadata,
  VideoStatsStore,
  VideoTagStore
} from "./playerTypes";
import {
  clearCachedPhotoAlbumScan,
  defaultPhotoAlbumPreferences,
  loadCachedPhotoAlbumScan,
  loadPhotoAlbumStore,
  photoAlbumScanCacheVersion,
  saveCachedPhotoAlbumScan,
  savePhotoAlbumStore
} from "./photoAlbumStorage";
import {
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  MIN_LOCAL_VIDEO_SIZE_BYTES,
  IGNORED_VIDEO_BASENAMES,
  PROGRESS_FILE_NAME,
  collator,
  rates,
  seekSteps,
  holdRates,
  playbackModeOptions,
  playlistSortOptions,
  volumeStep,
  controlsAutoHideDelay,
  autoNextPromptSeconds,
  rightKeyHoldDelay,
  doubleClickFeedbackDelay,
  mediaScanBatchSize,
  mediaScanBatchDelay,
  playlistItemHeight,
  playlistVirtualOverscan,
  thumbnailWidth,
  thumbnailHeight,
  thumbnailCacheTimeout,
  thumbnailGenerationTimeout,
  thumbnailEncodeTimeout,
  playlistScrollFrameDelay,
  defaultShortcuts,
  defaultPlayerSettings,
  defaultPlayerPreferences,
  shortcutGroups
} from "./playerConstants";


function isVideoFile(name: string) {
  return hasExtension(name, VIDEO_EXTENSIONS);
}

function isIgnoredVideoFile(name: string) {
  const fileName = name.split(/[\\/]/).pop() || name;
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return IGNORED_VIDEO_BASENAMES.has(baseName.toLowerCase());
}

function shouldFilterLocalVideoFile(name: string, size: number) {
  return size < MIN_LOCAL_VIDEO_SIZE_BYTES || isIgnoredVideoFile(name);
}

function isObjectUrl(value: string) {
  return value.startsWith("blob:");
}

function isSubtitleFile(name: string) {
  return hasExtension(name, SUBTITLE_EXTENSIONS);
}

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);
const photoAlbumPageSize = 24;
const cacheStatusPageSize = 10;
const photoThumbnailWindowSize = 24;
const photoAlbumScanCacheStaleMs = 24 * 60 * 60 * 1000;
const photoAlbumSortOptions: Array<{ value: PhotoAlbumSortMode; label: string }> = [
  { value: "updated", label: "最近更新" },
  { value: "name", label: "名称" },
  { value: "count", label: "图片数" },
];

function isPhotoFile(name: string) {
  return hasExtension(name, PHOTO_EXTENSIONS);
}

function hasExtension(name: string, extensions: Set<string>) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return extensions.has(name.slice(dotIndex).toLowerCase());
}

function extensionOf(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function basePathOf(path: string) {
  const dotIndex = path.lastIndexOf(".");
  return dotIndex >= 0 ? path.slice(0, dotIndex).toLowerCase() : path.toLowerCase();
}

function baseNameWithoutExtension(name: string) {
  const fileName = name.split(/[\\/]/).pop() || name;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

function directoryPartsOf(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).slice(0, -1);
}

function libraryFolderTitleForVideo(video: VideoItem) {
  return directoryPartsOf(video.relativePath)[0] ?? inferSeriesTitle(video);
}

function libraryFolderKeyForVideo(video: VideoItem) {
  return scopedSeriesKeyForVideo(video, libraryFolderTitleForVideo(video));
}

function libraryFolderPathForVideo(video: VideoItem) {
  return directoryPartsOf(video.relativePath)[0] ?? "";
}

function fallbackMediaRootLabelForVideo(video: VideoItem) {
  return video.mediaRootId ?? directoryPartsOf(video.relativePath)[0] ?? "临时媒体";
}

function supportsServerFileAccess(root: LocalMediaRoot | null | undefined) {
  return Boolean(root && (root.source !== "browser" || root.localPath));
}

function inferSeriesTitle(video: VideoItem) {
  const normalizedPath = video.relativePath.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  if (pathParts.length > 1) return pathParts[0];

  return (
    baseNameWithoutExtension(video.name)
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/【[^】]+】/g, " ")
      .replace(/\b(?:S\d{1,2}E\d{1,3}|EP?\s*\d{1,4}|第\s*\d{1,4}\s*[集话話]|[._ -]\d{1,4})\b/gi, " ")
      .replace(/\b(?:1080p|2160p|720p|4k|8k|x264|x265|h264|h265|hevc|avc|aac|web-dl|bdrip|bluray)\b/gi, " ")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || baseNameWithoutExtension(video.name)
  );
}

function seriesKeyFromTitle(title: string) {
  return title.trim().toLowerCase();
}

function scopedSeriesKeyForVideo(video: VideoItem, title: string) {
  const titleKey = seriesKeyFromTitle(title);
  return video.mediaRootId ? `${video.mediaRootId}:${titleKey}` : titleKey;
}

function createLegacyVideoId(relativePath: string, file: Pick<File, "size" | "lastModified">) {
  return `${relativePath}|${file.size}|${file.lastModified}`;
}

function createGlobalVideoId(rootId: string, relativePath: string, file: Pick<File, "size" | "lastModified">) {
  return `${rootId}|${relativePath}|${file.size}|${file.lastModified}`;
}

function createPhotoAlbumFolderId(rootId: string, relativePath: string) {
  return `${rootId}|${relativePath}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeLibraryName(name: string) {
  return (
    name
      .trim()
      .replace(/[^A-Za-z0-9._~-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "library"
  );
}

function createLibraryMetadata(directory: FileSystemDirectoryHandle, media: MediaCollection): PlayerLibraryMetadata {
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

function hasStoredData(store: PlayerDataStore) {
  return Boolean(
    Object.keys(store.progress).length ||
      store.favorites.length ||
      Object.keys(store.videoTags).length ||
      Object.keys(store.videoStats).length ||
      Object.keys(store.tagMergeDecisions).length ||
      store.embeddedSubtitles.length ||
      JSON.stringify(store.preferences) !== JSON.stringify(defaultPlayerPreferences)
  );
}

async function ensureDirectoryReadPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "read" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  if (currentPermission === "granted") return true;
  const nextPermission = await directory.requestPermission?.(descriptor);
  return nextPermission !== "denied";
}

async function hasDirectoryReadPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "read" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  return currentPermission === undefined || currentPermission === "granted";
}

import { ControlSelect } from "./ControlSelect";
import {
  createPersistedEmbeddedSubtitles,
  getCompatibleMediaAction,
  createSubtitleControlOptions,
  createVideoStatsKey,
  getMediaRootLocalPathAction,
  isMediaRootInHomeMode,
  resolvePlayerEntrySeriesMode,
  resolveRestoredEmbeddedSubtitleSelection,
  resolveSubtitleSelection,
  shouldShowHomeRecapCard,
  type HomeMediaMode,
} from "./playerUiState";
import {
  createTagPairKey,
  findTagMergeSuggestion,
  getTagSearchScore,
  mergeTags,
  normalizeTagKey,
  parseTagInput,
  splitTagsByExistingMatch,
  type TagMergeSuggestion
} from "./tagUtils";
import {
  clearPhotoAlbumFolderHandle,
  clearRecentFolderHandle,
  createDefaultPlayerDataStore,
  createProgress,
  deleteLegacyPlayerDataStore,
  hasDirectoryWritePermission,
  loadLegacyPlayerDataStore,
  loadGlobalPlayerDataStore,
  loadPlayerDataStore,
  readPhotoAlbumFolderHandle,
  readCachedThumbnail,
  saveGlobalPlayerDataStore,
  writeCachedThumbnail,
  writePhotoAlbumFolderHandle,
  writeRecentFolderHandle
} from "./playerStorage";


function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "未知大小";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

const modifiedTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatModifiedTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "未知时间";
  return modifiedTimeFormatter.format(value);
}

function formatRelativeTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "刚刚";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (diffSeconds < 60) return "刚刚";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  return formatModifiedTime(value);
}

function formatResolution(width?: number, height?: number) {
  if (!width || !height) return "读取中";
  return `${width} x ${height}`;
}

function formatMediaRootStatus(status?: PlayerMediaRootStatus) {
  if (!status) return "等待扫描";
  if (status.status === "ready") return `${status.videoCount} 个视频`;
  if (status.status === "needsAccess") return "需配置本机路径";
  return status.error ? `扫描失败：${status.error}` : "扫描失败";
}

function formatPhotoRootStatus(status?: PlayerMediaRootStatus) {
  if (!status) return "等待扫描";
  if (status.status === "ready") return `${status.videoCount} 本写真集`;
  if (status.status === "needsAccess") return "需配置本机路径";
  return status.error ? `扫描失败：${status.error}` : "扫描失败";
}

function videoMetadataRows(video: VideoItem) {
  return [
    ["文件名", video.name],
    ["大小", formatFileSize(video.size)],
    ["时长", video.duration ? formatTime(video.duration) : "读取中"],
    ["分辨率", formatResolution(video.width, video.height)],
    ["播放兼容", formatPlayabilityStatus(video.playability)],
    ["编码", formatCodecSummary(video.playability)],
    ["修改", formatModifiedTime(video.lastModified)],
  ] as const;
}

function videoMetadataTitle(video: VideoItem) {
  return videoMetadataRows(video)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredVolume() {
  return defaultPlayerSettings.volume;
}

type AppTheme = "dark" | "light";

const appThemeStorageKey = "local-web-player-theme";

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const storedTheme = window.localStorage.getItem(appThemeStorageKey);
  return storedTheme === "light" ? "light" : "dark";
}

function isFormControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName);
}

function formatShortcutKey(code: string) {
  if (code === "Space") return "空格";
  if (code === "Slash") return "?";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code.startsWith("Numpad")) return `小键盘 ${code.slice(6)}`;
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function shortcutCodeFromEvent(event: KeyboardEvent | React.KeyboardEvent) {
  if (event.code === "Slash" && event.shiftKey) return "Slash";
  return event.code || event.key;
}

function getShortcutConflict(shortcuts: ShortcutMap, action: ShortcutAction, nextCode: string) {
  return (Object.keys(shortcuts) as ShortcutAction[]).find(
    (candidate) =>
      candidate !== action &&
      shortcuts[candidate] === nextCode &&
      !(
        (action === "seekForward" && candidate === "holdSpeed") ||
        (action === "holdSpeed" && candidate === "seekForward")
      ),
  );
}

const cjkNumberValues: Record<string, number> = {
  "\u96f6": 0,
  "\u3007": 0,
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e24": 2,
  "\u5169": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9,
};

const cjkNumberUnits: Record<string, number> = {
  "\u5341": 10,
  "\u767e": 100,
  "\u5343": 1000,
};

function parseNumberishText(value: string) {
  const normalized = value.trim();
  const digitMatch = normalized.match(/\d+/);
  if (digitMatch) return Number(digitMatch[0]);

  let total = 0;
  let current = 0;
  let hasNumber = false;

  for (const char of normalized) {
    const digitValue = cjkNumberValues[char];
    if (digitValue !== undefined) {
      current = digitValue;
      hasNumber = true;
      continue;
    }

    const unitValue = cjkNumberUnits[char];
    if (unitValue !== undefined) {
      total += (current || 1) * unitValue;
      current = 0;
      hasNumber = true;
    }
  }

  return hasNumber ? total + current : null;
}

function parseSeasonNumber(segment: string) {
  const normalized = segment
    .normalize("NFKC")
    .replace(/[\u3010\u3011\[\]\(\)\uff08\uff09]/g, " ")
    .trim();
  const cjkMatch = normalized.match(
    /\u7b2c\s*([\d\u96f6\u3007\u4e00\u4e8c\u4e24\u5169\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343]+)\s*[\u5b63\u671f\u90e8]/,
  );
  if (cjkMatch) return parseNumberishText(cjkMatch[1]);

  const latinMatch = normalized.match(/(?:^|[\s._-])(?:s|season)\s*0*(\d{1,3})(?:$|[\s._-])/i);
  if (latinMatch) return Number(latinMatch[1]);

  return null;
}

function splitRelativePath(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

function hasSeasonDirectory(video: VideoItem) {
  return splitRelativePath(video.relativePath).slice(0, -1).some((segment) => parseSeasonNumber(segment) !== null);
}

function compareNaturalRelativePath(aPath: string, bPath: string) {
  const aSegments = splitRelativePath(aPath);
  const bSegments = splitRelativePath(bPath);
  const length = Math.max(aSegments.length, bSegments.length);

  for (let index = 0; index < length; index += 1) {
    const aSegment = aSegments[index];
    const bSegment = bSegments[index];
    if (aSegment === undefined) return -1;
    if (bSegment === undefined) return 1;

    const aSeasonNumber = parseSeasonNumber(aSegment);
    const bSeasonNumber = parseSeasonNumber(bSegment);
    if (aSeasonNumber !== null && bSeasonNumber !== null && aSeasonNumber !== bSeasonNumber) {
      return aSeasonNumber - bSeasonNumber;
    }

    const result = collator.compare(aSegment, bSegment);
    if (result !== 0) return result;
  }

  return 0;
}

function getStatsSortValue(video: VideoItem, statsStore: VideoStatsStore, mode: PlaylistSortMode) {
  const stats = statsStore[createVideoStatsKey(video)];
  if (!stats) return 0;

  if (mode === "playedDuration") return stats.totalPlayedSeconds;
  if (mode === "playCount") return stats.playCount;
  if (mode === "emissionCount") return stats.emissionCount;
  if (mode === "playIntensity") {
    const duration = stats.durationSeconds || video.duration || 0;
    return duration > 0 ? stats.totalPlayedSeconds / duration : 0;
  }

  return 0;
}

function isStatsPlaylistSortMode(mode: PlaylistSortMode) {
  return mode === "playedDuration" || mode === "playIntensity" || mode === "playCount" || mode === "emissionCount";
}

function compareVideos(a: VideoItem, b: VideoItem, mode: PlaylistSortMode, statsStore: VideoStatsStore) {
  if (mode === "modified") {
    return b.lastModified - a.lastModified || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (mode === "path") {
    return compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (mode === "size") {
    return b.size - a.size || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (isStatsPlaylistSortMode(mode)) {
    return getStatsSortValue(b, statsStore, mode) - getStatsSortValue(a, statsStore, mode) || compareNaturalRelativePath(a.relativePath, b.relativePath);
  }

  if (hasSeasonDirectory(a) || hasSeasonDirectory(b)) {
    return compareNaturalRelativePath(a.relativePath, b.relativePath) || collator.compare(a.name, b.name);
  }

  return collator.compare(a.name, b.name) || compareNaturalRelativePath(a.relativePath, b.relativePath);
}

function getSortedVideos(videos: VideoItem[], mode: PlaylistSortMode, isReversed: boolean, statsStore: VideoStatsStore = {}) {
  const sorted = [...videos].sort((a, b) => compareVideos(a, b, mode, statsStore));
  return isReversed ? sorted.reverse() : sorted;
}

function isResumableProgress(progress?: PlaybackProgress) {
  if (!progress || progress.completed || progress.currentTime < 1) return false;
  return progress.currentTime < Math.max(0, progress.duration - 8);
}

function getLatestResumableVideo(videos: VideoItem[], progressStore: ProgressStore) {
  return videos
    .map((video) => ({ video, progress: progressStore[video.id] }))
    .filter(({ progress }) => isResumableProgress(progress))
    .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)[0];
}

function createEmptyMediaCollection(): MediaCollection {
  return {
    videos: [],
    subtitles: [],
    scannedFiles: 0,
    filteredSmallVideos: 0,
  };
}

function mergeMediaBatch(collection: MediaCollection, batch: MediaScanBatch): MediaCollection {
  return {
    videos: [...collection.videos, ...batch.videos],
    subtitles: [...collection.subtitles, ...batch.subtitles],
    scannedFiles: batch.scannedFiles,
    filteredSmallVideos: batch.filteredSmallVideos,
  };
}

function sortMediaCollection(collection: MediaCollection): MediaCollection {
  return {
    ...collection,
    videos: [...collection.videos].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath)),
    subtitles: [...collection.subtitles].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath)),
  };
}

function mergeVideoRuntimeState(nextVideos: VideoItem[], previousVideos: VideoItem[]) {
  const previousById = new Map(previousVideos.map((video) => [video.id, video]));
  return nextVideos.map((video) => {
    const previous = previousById.get(video.id);
    if (!previous) return video;
    const basePlayability = video.playability ?? previous.playability;
    const playability: VideoPlayability | undefined = basePlayability
      ? {
          ...basePlayability,
          ...(previous.playability?.compatibleUrl && !video.playability?.compatibleUrl
            ? { compatibleUrl: previous.playability.compatibleUrl }
            : {}),
        }
      : undefined;
    return {
      ...video,
      duration: previous.duration ?? video.duration,
      width: previous.width ?? video.width,
      height: previous.height ?? video.height,
      thumbnailUrl: previous.thumbnailUrl ?? video.thumbnailUrl,
      thumbnailStatus: previous.thumbnailStatus ?? video.thumbnailStatus,
      ...(playability ? { playability } : {}),
    };
  });
}

function shouldFlushMediaScan(lastFlushAt: number, pendingVideos: VideoItem[], pendingSubtitles: SubtitleItem[]) {
  return pendingVideos.length + pendingSubtitles.length >= mediaScanBatchSize || Date.now() - lastFlushAt >= mediaScanBatchDelay;
}

async function* collectVideos(directory: FileSystemDirectoryHandle, rootId?: string | null): AsyncGenerator<MediaScanBatch> {
  let pendingVideos: VideoItem[] = [];
  let pendingSubtitles: SubtitleItem[] = [];
  let scannedFiles = 0;
  let filteredSmallVideos = 0;
  let lastFlushAt = Date.now();

  function createBatch() {
    const batch = {
      videos: pendingVideos,
      subtitles: pendingSubtitles,
      scannedFiles,
      filteredSmallVideos,
    };
    pendingVideos = [];
    pendingSubtitles = [];
    lastFlushAt = Date.now();
    return batch;
  }

  async function* walk(handle: FileSystemDirectoryHandle, segments: string[]): AsyncGenerator<MediaScanBatch> {
    for await (const entry of handle.values()) {
      if (entry.kind === "directory") {
        yield* walk(entry, [...segments, entry.name]);
      } else if (isVideoFile(entry.name)) {
        scannedFiles += 1;
        const file = await entry.getFile();
        if (shouldFilterLocalVideoFile(entry.name, file.size)) {
          filteredSmallVideos += 1;
        } else {
          const relativePath = [...segments, entry.name].join("/");
          pendingVideos.push({
            id: rootId ? createGlobalVideoId(rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
            name: entry.name,
            relativePath,
            file,
            url: URL.createObjectURL(file),
            size: file.size,
            lastModified: file.lastModified,
            parentDirectory: handle,
            playbackSource: "browser",
          });
        }
      } else if (isSubtitleFile(entry.name)) {
        scannedFiles += 1;
        const file = await entry.getFile();
        const relativePath = [...segments, entry.name].join("/");
        pendingSubtitles.push({
          id: rootId ? createGlobalVideoId(rootId, relativePath, file) : createLegacyVideoId(relativePath, file),
          name: entry.name,
          relativePath,
          file,
          url: "",
          mediaRootId: rootId ?? undefined,
        });
      }

      if (shouldFlushMediaScan(lastFlushAt, pendingVideos, pendingSubtitles)) {
        yield createBatch();
      }
    }
  }

  yield* walk(directory, []);
  if (pendingVideos.length || pendingSubtitles.length || scannedFiles || filteredSmallVideos) {
    yield createBatch();
  }
}

function collectVideosFromFiles(files: FileList | File[]): MediaCollection {
  const collection = createEmptyMediaCollection();

  for (const file of Array.from(files)) {
    const browserRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relativePath = (browserRelativePath || file.name).replace(/\\/g, "/");
    const name = relativePath.split("/").pop() || file.name;

    if (isVideoFile(name)) {
      collection.scannedFiles += 1;
      if (shouldFilterLocalVideoFile(name, file.size)) {
        collection.filteredSmallVideos += 1;
        continue;
      }
      collection.videos.push({
        id: createLegacyVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: URL.createObjectURL(file),
        size: file.size,
        lastModified: file.lastModified,
        playbackSource: "browser",
      });
    } else if (isSubtitleFile(name)) {
      collection.scannedFiles += 1;
      collection.subtitles.push({
        id: createLegacyVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: "",
      });
    }
  }

  return sortMediaCollection(collection);
}

type BrowserPhotoFile = {
  file: File;
  relativePath: string;
  parentDirectory: FileSystemDirectoryHandle;
};

function collectPhotoAlbumsFromBrowserFiles(rootLabel: string, rootId: string, photoFiles: BrowserPhotoFile[]) {
  const albumImages = new Map<string, PhotoAlbum["images"]>();

  for (const photoFile of photoFiles) {
    const { file } = photoFile;
    const relativePath = photoFile.relativePath.replace(/\\/g, "/");
    const pathParts = relativePath.split("/").filter(Boolean);
    const scopedParts = pathParts[0] === rootLabel ? pathParts.slice(1) : pathParts;
    const name = scopedParts.at(-1) || file.name;
    if (!isPhotoFile(name)) continue;

    const albumPath = scopedParts.slice(0, -1).join("/");
    const imageRelativePath = scopedParts.join("/");
    const images = albumImages.get(albumPath) ?? [];
    images.push({
      id: createGlobalVideoId(rootId, imageRelativePath, file),
      name,
      relativePath: imageRelativePath,
      url: "",
      file,
      size: file.size,
      lastModified: file.lastModified,
      mediaRootId: rootId,
      index: 0,
      parentDirectory: photoFile.parentDirectory,
    });
    albumImages.set(albumPath, images);
  }

  const albums = Array.from(albumImages.entries()).map(([relativePath, images]) => {
    images.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }));
    const indexedImages = images.map((image, index) => ({ ...image, index }));
    const totalSize = indexedImages.reduce((sum, image) => sum + image.size, 0);
    const updatedAt = indexedImages.reduce((latest, image) => Math.max(latest, image.lastModified), 0);
    return {
      id: createPhotoAlbumFolderId(rootId, relativePath),
      title: relativePath.split("/").filter(Boolean).at(-1) || rootLabel,
      relativePath,
      mediaRootId: rootId,
      mediaRootLabel: rootLabel,
      coverImageUrl: "",
      imageCount: indexedImages.length,
      totalSize,
      updatedAt,
      images: indexedImages,
    };
  });

  albums.sort((a, b) => b.updatedAt - a.updatedAt || a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return {
    rootId,
    rootLabel,
    albums,
    scannedFiles: photoFiles.length,
  };
}

async function collectPhotoAlbumsFromDirectory(directory: FileSystemDirectoryHandle) {
  const photoFiles: BrowserPhotoFile[] = [];

  async function walk(handle: FileSystemDirectoryHandle, segments: string[]) {
    for await (const entry of handle.values()) {
      if (entry.kind === "directory") {
        await walk(entry, [...segments, entry.name]);
      } else if (isPhotoFile(entry.name)) {
        const file = await entry.getFile();
        photoFiles.push({
          file,
          relativePath: [...segments, entry.name].join("/"),
          parentDirectory: handle,
        });
      }
    }
  }

  await walk(directory, []);

  const rootLabel = directory.name || "写真集";
  const rootId = `browser-photo:${sanitizeLibraryName(rootLabel)}-${hashString(rootLabel)}`;

  return collectPhotoAlbumsFromBrowserFiles(rootLabel, rootId, photoFiles);
}

async function resolvePhotoParentDirectory(rootDirectory: FileSystemDirectoryHandle, relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const directoryParts = parts.slice(0, -1);
  let directory = rootDirectory;

  for (const part of directoryParts) {
    directory = await directory.getDirectoryHandle(part);
  }

  return directory;
}

async function photoFileExists(parentDirectory: FileSystemDirectoryHandle, name: string) {
  try {
    await parentDirectory.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

function createCachedPhotoAlbumScan(scan: Awaited<ReturnType<typeof collectPhotoAlbumsFromDirectory>>): CachedPhotoAlbumScan {
  return {
    version: photoAlbumScanCacheVersion,
    rootId: scan.rootId,
    rootName: scan.rootLabel,
    albums: scan.albums,
    scannedFiles: scan.scannedFiles,
    updatedAt: Date.now(),
  };
}

function createPhotoAlbumRootStatusFromCache(cache: CachedPhotoAlbumScan, status: PlayerMediaRootStatus["status"] = "ready", error?: string): PlayerMediaRootStatus {
  return {
    id: cache.rootId,
    label: cache.rootName,
    source: "browser",
    status,
    videoCount: cache.albums.length,
    scannedFiles: cache.scannedFiles,
    updatedAt: cache.updatedAt,
    error,
  };
}

async function getPhotoImageFileFromDirectory(directory: FileSystemDirectoryHandle, relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName || !isPhotoFile(fileName)) return null;

  let currentDirectory = directory;
  for (const part of parts) {
    currentDirectory = await currentDirectory.getDirectoryHandle(part);
  }

  const fileHandle = await currentDirectory.getFileHandle(fileName);
  return fileHandle.getFile();
}

function escapeVttText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function srtTimestampToVtt(value: string) {
  return value.replace(",", ".");
}

function srtToVtt(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  const cues = blocks
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (!lines.length) return "";
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex < 0) return "";
      const timeLine = lines[timeLineIndex].replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        (_, time: string, millis: string) => srtTimestampToVtt(`${time},${millis}`),
      );
      const textLines = lines.slice(timeLineIndex + 1).map(escapeVttText);
      return [timeLine, ...textLines].join("\n");
    })
    .filter(Boolean);

  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

type LocalMediaRoot = {
  id: string;
  label: string;
  basename: string;
  path: string;
  source?: "browser" | "local";
  localPath?: string;
};

type LocalConfig = {
  mediaRoots: LocalMediaRoot[];
  ffmpeg: { ffmpeg: boolean; ffprobe: boolean };
  ai: { configured: boolean; model: string };
  bangumi: { configured: boolean; proxyConfigured: boolean };
};

type ScannedServerVideo = VideoItem & {
  legacyId?: string;
};

type ScannedServerSubtitle = SubtitleItem & {
  legacyId?: string;
  size?: number;
  lastModified?: number;
};

type MediaRootScanResult = {
  root: LocalMediaRoot;
  status: PlayerMediaRootStatus;
  videos: ScannedServerVideo[];
  subtitles: ScannedServerSubtitle[];
  filteredSmallVideos: number;
};

type MediaRootsScanResponse = {
  roots: MediaRootScanResult[];
  videos: ScannedServerVideo[];
  subtitles: ScannedServerSubtitle[];
  scannedFiles: number;
  filteredSmallVideos: number;
  metadata: PlayerGlobalMetadata;
};

type UpsertMediaRootResponse = LocalConfig & {
  mediaRoot: LocalMediaRoot;
};

type UpdateMediaRootLocalPathResponse = LocalConfig & {
  mediaRoot: LocalMediaRoot;
};

type PhotoAlbumViewFilter = "all" | "favorites";

type CacheStatusItem = {
  id: string;
  label: string;
  path: string;
  bytes: number;
  files: number;
  updatedAt: number | null;
  error?: string;
};

type CacheStatus = {
  rootPath: string;
  totalBytes: number;
  totalFiles: number;
  updatedAt: number | null;
  items: CacheStatusItem[];
};

type ClearCacheResponse = {
  cleared: string[];
  status: CacheStatus;
};

type LibrarySearchMode = "idle" | "local" | "ai" | "empty";

type LibraryFolderResultVideo = {
  video: VideoItem;
  progress?: PlaybackProgress;
};

type LibrarySearchResult = {
  key: string;
  title: string;
  path: string;
  mediaRootLabel?: string;
  videos: LibraryFolderResultVideo[];
  representativeVideo: VideoItem;
  score: number;
  reason: string;
};

type LibrarySearchCandidate = {
  id: string;
  name: string;
  relativePath: string;
  mediaRootLabel: string;
  seriesTitle: string;
  tags: string[];
  progressLabel: string;
  isFavorite: boolean;
  isCompleted: boolean;
};

type LibraryAiSearchResponse = {
  answer: string;
  matchIds: string[];
};

const japaneseSimplifiedCharacterPairs: Array<[string, string]> = [
  ["亜", "亚"],
  ["悪", "恶"],
  ["圧", "压"],
  ["囲", "围"],
  ["為", "为"],
  ["隠", "隐"],
  ["栄", "荣"],
  ["駅", "驿"],
  ["円", "圆"],
  ["応", "应"],
  ["桜", "樱"],
  ["穏", "稳"],
  ["仮", "假"],
  ["価", "价"],
  ["画", "画"],
  ["会", "会"],
  ["絵", "绘"],
  ["開", "开"],
  ["階", "阶"],
  ["楽", "乐"],
  ["覚", "觉"],
  ["学", "学"],
  ["関", "关"],
  ["観", "观"],
  ["気", "气"],
  ["帰", "归"],
  ["亀", "龟"],
  ["旧", "旧"],
  ["拠", "据"],
  ["挙", "举"],
  ["峡", "峡"],
  ["狭", "狭"],
  ["郷", "乡"],
  ["暁", "晓"],
  ["区", "区"],
  ["経", "经"],
  ["恵", "惠"],
  ["軽", "轻"],
  ["継", "继"],
  ["撃", "击"],
  ["県", "县"],
  ["倹", "俭"],
  ["険", "险"],
  ["広", "广"],
  ["鉱", "矿"],
  ["号", "号"],
  ["黒", "黑"],
  ["済", "济"],
  ["斎", "斋"],
  ["剤", "剂"],
  ["雑", "杂"],
  ["参", "参"],
  ["桟", "栈"],
  ["蚕", "蚕"],
  ["姉", "姊"],
  ["糸", "丝"],
  ["児", "儿"],
  ["実", "实"],
  ["写", "写"],
  ["社", "社"],
  ["者", "者"],
  ["寿", "寿"],
  ["収", "收"],
  ["従", "从"],
  ["渋", "涩"],
  ["獣", "兽"],
  ["縦", "纵"],
  ["粛", "肃"],
  ["処", "处"],
  ["緒", "绪"],
  ["勝", "胜"],
  ["将", "将"],
  ["小", "小"],
  ["焼", "烧"],
  ["祥", "祥"],
  ["称", "称"],
  ["乗", "乘"],
  ["嬢", "娘"],
  ["条", "条"],
  ["浄", "净"],
  ["剰", "剩"],
  ["畳", "叠"],
  ["穣", "穰"],
  ["譲", "让"],
  ["醸", "酿"],
  ["触", "触"],
  ["嘱", "嘱"],
  ["真", "真"],
  ["寝", "寝"],
  ["慎", "慎"],
  ["図", "图"],
  ["粋", "粹"],
  ["酔", "醉"],
  ["随", "随"],
  ["髄", "髓"],
  ["瀬", "濑"],
  ["声", "声"],
  ["斉", "齐"],
  ["静", "静"],
  ["摂", "摄"],
  ["専", "专"],
  ["戦", "战"],
  ["浅", "浅"],
  ["潜", "潜"],
  ["繊", "纤"],
  ["践", "践"],
  ["銭", "钱"],
  ["禅", "禅"],
  ["双", "双"],
  ["壮", "壮"],
  ["争", "争"],
  ["荘", "庄"],
  ["捜", "搜"],
  ["挿", "插"],
  ["巣", "巢"],
  ["総", "总"],
  ["聡", "聪"],
  ["蔵", "藏"],
  ["属", "属"],
  ["続", "续"],
  ["堕", "堕"],
  ["体", "体"],
  ["対", "对"],
  ["帯", "带"],
  ["滝", "泷"],
  ["択", "择"],
  ["沢", "泽"],
  ["単", "单"],
  ["団", "团"],
  ["弾", "弹"],
  ["遅", "迟"],
  ["昼", "昼"],
  ["鋳", "铸"],
  ["著", "著"],
  ["庁", "厅"],
  ["徴", "征"],
  ["聴", "听"],
  ["懲", "惩"],
  ["鎮", "镇"],
  ["塚", "冢"],
  ["逓", "递"],
  ["鉄", "铁"],
  ["転", "转"],
  ["伝", "传"],
  ["都", "都"],
  ["灯", "灯"],
  ["当", "当"],
  ["党", "党"],
  ["島", "岛"],
  ["働", "动"],
  ["徳", "德"],
  ["独", "独"],
  ["読", "读"],
  ["届", "届"],
  ["縄", "绳"],
  ["難", "难"],
  ["弐", "贰"],
  ["悩", "恼"],
  ["脳", "脑"],
  ["覇", "霸"],
  ["拝", "拜"],
  ["売", "卖"],
  ["麦", "麦"],
  ["発", "发"],
  ["髪", "发"],
  ["抜", "拔"],
  ["浜", "滨"],
  ["払", "拂"],
  ["仏", "佛"],
  ["辺", "边"],
  ["変", "变"],
  ["歩", "步"],
  ["宝", "宝"],
  ["豊", "丰"],
  ["没", "没"],
  ["翻", "翻"],
  ["満", "满"],
  ["黙", "默"],
  ["薬", "药"],
  ["訳", "译"],
  ["予", "予"],
  ["余", "余"],
  ["誉", "誉"],
  ["揺", "摇"],
  ["様", "样"],
  ["謡", "谣"],
  ["来", "来"],
  ["乱", "乱"],
  ["覧", "览"],
  ["竜", "龙"],
  ["隆", "隆"],
  ["両", "两"],
  ["猟", "猎"],
  ["緑", "绿"],
  ["涙", "泪"],
  ["塁", "垒"],
  ["礼", "礼"],
  ["戻", "戻"],
  ["鈴", "铃"],
  ["霊", "灵"],
  ["齢", "龄"],
  ["暦", "历"],
  ["歴", "历"],
  ["恋", "恋"],
  ["練", "练"],
  ["錬", "炼"],
  ["炉", "炉"],
  ["労", "劳"],
  ["郎", "郎"],
  ["楼", "楼"],
  ["湾", "湾"],
];

const librarySearchCharacterAlternatives = japaneseSimplifiedCharacterPairs.reduce((map, [japanese, simplified]) => {
  const japaneseAlternatives = map.get(japanese) ?? new Set<string>();
  japaneseAlternatives.add(simplified);
  map.set(japanese, japaneseAlternatives);
  const simplifiedAlternatives = map.get(simplified) ?? new Set<string>();
  simplifiedAlternatives.add(japanese);
  map.set(simplified, simplifiedAlternatives);
  return map;
}, new Map<string, Set<string>>());

type AiTagMergeSuggestionResponse = {
  existingTag?: string;
  newTag?: string;
  reason?: string;
};

type TagMergePrompt = {
  pendingTags: string[];
  suggestion: TagMergeSuggestion;
};

type ExistingMediaRootPrompt = {
  directoryName: string;
  mediaRootLabel: string;
  resolve: (shouldRescan: boolean) => void;
};

type BangumiSubject = {
  id: number;
  name: string;
  nameCn: string;
  url: string;
  score?: number;
  rank?: number;
  date?: string;
  matchScore?: number;
};

type BangumiSeriesMatch = {
  status: "loading" | "matched" | "none" | "error";
  seriesKey: string;
  title: string;
  subject: BangumiSubject | null;
  confidence: "high" | "medium" | "low" | "none";
  source: "bangumi" | "ai" | "cache" | "none" | "error";
  candidates: BangumiSubject[];
  error?: string;
  updatedAt?: number;
};

type MediaRootLabelPrompt = {
  directoryName: string;
  value: string;
  resolve: (value: string | null) => void;
};

type MediaRootLocalPathDialog = {
  root: LocalMediaRoot;
  value: string;
  error: string;
  isSaving: boolean;
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

type SubtitleContextChunk = {
  start: string;
  end: string;
  text: string;
};

type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "result"; text: string }
  | { type: "message"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };

type ExtractedEmbeddedSubtitle = {
  id: string;
  format: "vtt";
  text: string;
};

type CompatibleRemuxResponse = {
  cacheId: string;
  compatibleUrl: string;
  playability: NonNullable<VideoItem["playability"]>;
};

type MediaProbeResponse = {
  playability: NonNullable<VideoItem["playability"]>;
};

function playableUrlForVideo(video: VideoItem) {
  return video.playability?.compatibleUrl || video.url;
}

function formatPlayabilityStatus(playability?: VideoItem["playability"]) {
  if (!playability) return "未探测";
  if (playability.compatibleUrl) return "兼容 MP4";
  if (playability.status === "direct") return "可直接播放";
  if (playability.status === "remuxRecommended") return "建议转封装";
  if (playability.status === "unsupported") return "需转码";
  if (playability.status === "needsLocalPath") return "需本机路径";
  return "兼容性未知";
}

function formatCodecSummary(playability?: VideoItem["playability"]) {
  if (!playability) return "未探测";
  return [playability.videoCodec, playability.audioCodec, playability.pixelFormat].filter(Boolean).join(" / ") || "未探测";
}

function normalizeLocalConfig(config: LocalConfig): LocalConfig {
  return {
    ...config,
    bangumi: config.bangumi ?? { configured: false, proxyConfigured: false },
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error || message;
    } catch {
      // Keep status text when the local API does not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function readAiStream(url: string, init: RequestInit, onEvent: (event: AiStreamEvent) => void) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/x-ndjson",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error || message;
    } catch {
      // Keep status text when the local API does not return JSON.
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("浏览器不支持流式响应。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const readLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as AiStreamEvent;
    if (event.type === "error") throw new Error(event.error);
    onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(readLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) readLine(buffer);
}

function normalizeSubtitleText(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function stripVttStyleBlocks(raw: string) {
  return raw.replace(/(?:^|\n)STYLE(?:[^\n]*)\n[\s\S]*?(?=\n{2,}(?:NOTE|STYLE|REGION|\d{0,6}\n?[^\n]*-->|$))/gi, "\n").trim();
}

async function createSubtitleUrl(subtitle: SubtitleItem) {
  if (subtitle.url && !isObjectUrl(subtitle.url)) {
    if (subtitle.format === "vtt" || subtitle.relativePath.toLowerCase().endsWith(".vtt")) return subtitle.url;
    const response = await fetch(subtitle.url, { headers: { Accept: "text/plain,text/vtt,*/*" } });
    if (!response.ok) throw new Error("Subtitle file is unavailable.");
    const normalizedText = normalizeSubtitleText(await response.text());
    const vtt = normalizedText.startsWith("WEBVTT") ? stripVttStyleBlocks(normalizedText) : srtToVtt(normalizedText);
    return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  }
  const rawText = subtitle.rawText ?? (subtitle.file ? await subtitle.file.text() : "");
  if (rawText) {
    const normalizedText = normalizeSubtitleText(rawText);
    const vtt =
      subtitle.format === "vtt" || normalizedText.startsWith("WEBVTT")
        ? stripVttStyleBlocks(normalizedText)
        : srtToVtt(normalizedText);
    return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  }
  if (!subtitle.file) throw new Error("Subtitle file is unavailable.");
  return URL.createObjectURL(subtitle.file);
}

async function readSubtitleText(subtitle: SubtitleItem) {
  if (subtitle.rawText) return normalizeSubtitleText(subtitle.rawText);
  if (subtitle.url && !isObjectUrl(subtitle.url)) {
    const response = await fetch(subtitle.url, { headers: { Accept: "text/plain,text/vtt,*/*" } });
    if (!response.ok) return "";
    return normalizeSubtitleText(await response.text());
  }
  if (!subtitle.file) return "";
  return normalizeSubtitleText(await subtitle.file.text());
}

async function restoreCachedEmbeddedSubtitles(
  persistedSubtitles: PlayerDataStore["embeddedSubtitles"],
  videos: VideoItem[],
  fallbackRootId: string | null,
) {
  const videosById = new Map(videos.map((video) => [video.id, video]));
  const restored = await Promise.all(
    persistedSubtitles.map(async (persisted) => {
      const video = videosById.get(persisted.videoId);
      const relativePath = video?.relativePath ?? persisted.relativePath.split("#subtitle-")[0];
      const rootId = video?.mediaRootId ?? fallbackRootId;
      if (!rootId || !relativePath || !persisted.embeddedTrack) return null;

      try {
        const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/cached", {
          method: "POST",
          body: JSON.stringify({
            rootId,
            relativePath,
            streamIndex: persisted.embeddedTrack.streamIndex,
          }),
        });
        if (!payload.text.trim()) return null;
        const subtitle: SubtitleItem = {
          ...persisted,
          source: "embedded",
          rawText: payload.text,
          format: payload.format,
          url: "",
          videoId: video?.id ?? persisted.videoId,
        };
        return {
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        };
      } catch {
        return null;
      }
    }),
  );

  return restored.filter((subtitle): subtitle is SubtitleItem => Boolean(subtitle));
}

function parseSubtitleTimestamp(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2) return 0;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  return (Number.isFinite(hours) ? hours : 0) * 3600 + (Number.isFinite(minutes) ? minutes : 0) * 60 + (Number.isFinite(seconds) ? seconds : 0);
}

function stripSubtitleMarkup(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubtitleCues(rawText: string): SubtitleCue[] {
  const normalized = normalizeSubtitleText(rawText).replace(/^WEBVTT[^\n]*\n+/i, "");
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex < 0) return null;
      const [startValue, endValue] = lines[timeLineIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
      const text = stripSubtitleMarkup(lines.slice(timeLineIndex + 1).join(" "));
      if (!text) return null;
      return {
        start: parseSubtitleTimestamp(startValue),
        end: parseSubtitleTimestamp(endValue),
        text,
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function createSubtitleContextChunks(cues: SubtitleCue[]) {
  const chunks: SubtitleContextChunk[] = [];
  let pending: SubtitleCue[] = [];
  let pendingStart = 0;

  cues.forEach((cue) => {
    if (!pending.length) {
      pending = [cue];
      pendingStart = cue.start;
      return;
    }
    const nextText = [...pending.map((item) => item.text), cue.text].join(" ");
    if (cue.end - pendingStart > 90 || nextText.length > 1200) {
      const last = pending[pending.length - 1];
      chunks.push({
        start: formatTime(pending[0].start),
        end: formatTime(last.end),
        text: pending.map((item) => item.text).join(" "),
      });
      pending = [cue];
      pendingStart = cue.start;
      return;
    }
    pending.push(cue);
  });

  if (pending.length) {
    const last = pending[pending.length - 1];
    chunks.push({
      start: formatTime(pending[0].start),
      end: formatTime(last.end),
      text: pending.map((item) => item.text).join(" "),
    });
  }
  return chunks;
}

function createViewedSubtitleText(cues: SubtitleCue[], currentTime: number) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) return "";
  return cues
    .filter((cue) => cue.start <= currentTime)
    .map((cue) => `[${formatTime(cue.start)} - ${formatTime(cue.end)}] ${cue.text}`)
    .join("\n");
}

function tokenizeQuestion(question: string) {
  const words = question.toLowerCase().match(/[a-z0-9_\u4e00-\u9fa5]{2,}/g) ?? [];
  return words.length ? words : [question.toLowerCase()].filter(Boolean);
}

function normalizeLibrarySearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function createLibrarySearchTextVariants(value: string, limit = 24) {
  const normalized = normalizeLibrarySearchText(value);
  if (!normalized) return [];

  const variants = [""];
  for (const character of normalized) {
    const alternatives = [character, ...(librarySearchCharacterAlternatives.get(character) ?? [])];
    const uniqueAlternatives = Array.from(new Set(alternatives));
    const nextVariants: string[] = [];
    for (const variant of variants) {
      for (const alternative of uniqueAlternatives) {
        nextVariants.push(`${variant}${alternative}`);
        if (nextVariants.length >= limit) break;
      }
      if (nextVariants.length >= limit) break;
    }
    variants.splice(0, variants.length, ...nextVariants);
  }

  return Array.from(new Set(variants.map(normalizeLibrarySearchText))).filter(Boolean);
}

function tokenizeLibrarySearchQuery(query: string) {
  return normalizeLibrarySearchText(query).split(/\s+/).filter((token) => token.length >= 2);
}

function createLibrarySearchTokenVariants(query: string) {
  return tokenizeLibrarySearchQuery(query).flatMap((token) => createLibrarySearchTextVariants(token, 8));
}

function includesAnyLibrarySearchVariant(searchable: string[], variants: string[]) {
  return variants.some((variant) => searchable.some((value) => value.includes(variant)));
}

function hasAiLibrarySearchIntent(query: string) {
  return /推荐|想看|适合|类似|风格|氛围|剧情|讲什么|没看完|未看完|收藏|最近|下一集|轻松|治愈|热血|悬疑|搞笑|短一点|长一点|随机|帮我|找.*(?:片段|台词|场景|类型|感觉)/i.test(
    query,
  );
}

function shouldUseAiLibrarySearch(query: string, localResults: LibrarySearchResult[]) {
  if (hasAiLibrarySearchIntent(query)) return true;
  const normalizedQuery = normalizeLibrarySearchText(query);
  const tokens = tokenizeLibrarySearchQuery(query);
  const strongestLocalScore = localResults[0]?.score ?? 0;
  if (strongestLocalScore >= 18) return false;
  if (localResults.length > 0 && tokens.length <= 3 && normalizedQuery.length >= 2) return false;
  return normalizedQuery.length >= 4;
}

function formatLibrarySearchProgressLabel(card: HomeVideoCard) {
  if (card.progress?.completed) return "已看完";
  if (card.progress) {
    const total = card.progress.duration || card.video.duration || 0;
    return `${formatTime(card.progress.currentTime)} / ${formatTime(total)}`;
  }
  return card.video.duration ? `未开始 / ${formatTime(card.video.duration)}` : "未开始";
}

function selectRelevantSubtitleChunks(question: string, cues: SubtitleCue[], currentTime: number) {
  const chunks = createSubtitleContextChunks(cues);
  const tokens = tokenizeQuestion(question);
  const scored = chunks.map((chunk, index) => {
    const haystack = chunk.text.toLowerCase();
    const keywordScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
    const start = parseSubtitleTimestamp(chunk.start);
    const currentTimeScore = currentTime > 0 ? Math.max(0, 1 - Math.abs(start - currentTime) / 1800) : 0;
    return { chunk, index, score: keywordScore + currentTimeScore };
  });
  const matches = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.chunk);
  return matches.length ? matches : chunks.slice(0, 8);
}

function waitForMediaEvent(element: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap, timeout = 7000) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener(eventName, handleEvent);
      element.removeEventListener("error", handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load video."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeout);

    element.addEventListener(eventName, handleEvent, { once: true });
    element.addEventListener("error", handleError, { once: true });
  });
}

function withTimeout<T>(promise: Promise<T>, timeout: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForDrawableVideoFrame(element: HTMLVideoElement) {
  if ("requestVideoFrameCallback" in element) {
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 160);
      element.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  return new Promise<void>((resolve) => window.setTimeout(resolve, 80));
}

function getVideoElementMetadata(element: HTMLVideoElement): VideoMetadata {
  return {
    duration: Number.isFinite(element.duration) ? element.duration : undefined,
    width: element.videoWidth || undefined,
    height: element.videoHeight || undefined,
  };
}

const widescreenAspectRatio = 16 / 9;

function getVideoDisplaySize(width?: number, height?: number) {
  if (!width || !height) return null;
  return { width, height };
}

function getPlayerFrameAspectRatio() {
  return widescreenAspectRatio;
}

async function loadVideoMetadata(video: VideoItem) {
  const element = document.createElement("video");
  const cleanup = () => {
    element.removeAttribute("src");
    element.load();
  };

  try {
    element.preload = "metadata";
    element.src = playableUrlForVideo(video);

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, "loadedmetadata");
    }

    const metadata = getVideoElementMetadata(element);
    cleanup();
    return metadata;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function isCanvasNearlyBlack(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let brightPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) {
      brightPixels += 1;
    }
  }

  return brightPixels / (width * height) < 0.01;
}

function encodeCanvasAsJpeg(canvas: HTMLCanvasElement) {
  return withTimeout(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Unable to encode thumbnail."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.82,
      );
    }),
    thumbnailEncodeTimeout,
    "Timed out encoding thumbnail.",
  );
}

async function createVideoThumbnailBlob(video: VideoItem) {
  const element = document.createElement("video");
  const canvas = document.createElement("canvas");
  const cleanup = () => {
    element.removeAttribute("src");
    element.load();
  };

  try {
    element.muted = true;
    element.preload = "auto";
    element.playsInline = true;
    element.src = playableUrlForVideo(video);

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, "loadedmetadata");
    }

    const metadata = getVideoElementMetadata(element);
    const displaySize = getVideoDisplaySize(metadata.width, metadata.height);
    const width = displaySize?.width;
    const height = displaySize?.height;
    if (!width || !height) {
      throw new Error("Unable to create thumbnail.");
    }

    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create thumbnail.");
    }

    const scale = Math.min(canvas.width / width, canvas.height / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const drawLeft = (canvas.width - drawWidth) / 2;
    const drawTop = (canvas.height - drawHeight) / 2;
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const targetTimes =
      duration > 0
        ? [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75, 2]
            .map((time) => Math.min(Math.max(time, 0.1), Math.max(0.1, duration - 0.1)))
            .filter((time, index, times) => times.findIndex((other) => Math.abs(other - time) < 0.05) === index)
        : [0];
    let fallbackBlob: Blob | null = null;

    for (const targetTime of targetTimes) {
      if (Math.abs(element.currentTime - targetTime) > 0.05) {
        const seeked = waitForMediaEvent(element, "seeked");
        element.currentTime = targetTime;
        await seeked;
      } else if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMediaEvent(element, "loadeddata");
      }

      await waitForDrawableVideoFrame(element);

      context.fillStyle = "#050607";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(element, drawLeft, drawTop, drawWidth, drawHeight);

      const blob = await encodeCanvasAsJpeg(canvas);
      if (!fallbackBlob) fallbackBlob = blob;
      if (!isCanvasNearlyBlack(context, canvas.width, canvas.height)) {
        cleanup();
        return { thumbnailBlob: blob, metadata };
      }
    }

    cleanup();
    return { thumbnailBlob: fallbackBlob ?? (await encodeCanvasAsJpeg(canvas)), metadata };
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function loadVideoThumbnail(libraryId: string | null, video: VideoItem) {
  const cachedThumbnail = await withTimeout(
    readCachedThumbnail(libraryId, video.id),
    thumbnailCacheTimeout,
    "Timed out reading cached thumbnail.",
  ).catch(() => null);
  if (cachedThumbnail) {
    return { thumbnailUrl: URL.createObjectURL(cachedThumbnail), metadata: undefined };
  }

  const { thumbnailBlob, metadata } = await withTimeout(
    createVideoThumbnailBlob(video),
    thumbnailGenerationTimeout,
    "Timed out creating thumbnail.",
  );
  void writeCachedThumbnail(libraryId, video.id, thumbnailBlob).catch(() => undefined);
  return { thumbnailUrl: URL.createObjectURL(thumbnailBlob), metadata };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRef = useRef<HTMLInputElement | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const playerColumnRef = useRef<HTMLElement | null>(null);
  const topBarRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const controlBarRef = useRef<HTMLDivElement | null>(null);
  const playlistRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const playlistAutoScrollTimerRef = useRef<number | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const autoNextTimerRef = useRef<number | null>(null);
  const doubleClickFeedbackTimerRef = useRef<number | null>(null);
  const playerOverlayFeedbackTimerRef = useRef<number | null>(null);
  const launchEffectTimerRef = useRef<number | null>(null);
  const timelineFrameTimerRef = useRef<number | null>(null);
  const timelineFrameRequestRef = useRef(0);
  const rightKeyHoldTimerRef = useRef<number | null>(null);
  const rightMouseHoldTimerRef = useRef<number | null>(null);
  const rightMousePointerIdRef = useRef<number | null>(null);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const libraryIdRef = useRef<string | null>(null);
  const libraryMetadataRef = useRef<PlayerDataStore["metadata"] | undefined>(undefined);
  const progressStoreRef = useRef<ProgressStore>({});
  const playerPreferencesRef = useRef<PlayerPreferences>(defaultPlayerPreferences);
  const playerSettingsRef = useRef(defaultPlayerSettings);
  const favoriteVideoIdsRef = useRef(new Set<string>());
  const videoTagsRef = useRef<VideoTagStore>({});
  const videoStatsRef = useRef<VideoStatsStore>({});
  const tagMergeDecisionsRef = useRef<TagMergeDecisionStore>({});
  const videosRef = useRef<VideoItem[]>([]);
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const localConfigRef = useRef<LocalConfig | null>(null);
  const cachedEmbeddedSubtitleLookupKeysRef = useRef(new Set<string>());
  const bangumiMatchesBySeriesKeyRef = useRef<Record<string, BangumiSeriesMatch>>({});
  const photoAlbumProgressRef = useRef<Record<string, PhotoAlbumProgress>>({});
  const favoritePhotoAlbumIdsRef = useRef(new Set<string>());
  const photoAlbumPreferencesRef = useRef(defaultPhotoAlbumPreferences);
  const photoAlbumAutoLoadAttemptedRef = useRef(false);
  const photoAlbumDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const bangumiMatchRunIdRef = useRef(0);
  const thumbnailLoadRunIdRef = useRef(0);
  const isScanningRef = useRef(false);
  const isMainVideoLoadingRef = useRef(false);
  const pendingAutoPlayVideoIdRef = useRef<string | null>(null);
  const privacyResumePlaybackRef = useRef<{ videoId: string; shouldResume: boolean } | null>(null);
  const playlistScrollFrameRef = useRef<number | null>(null);
  const lastPlaylistUserScrollAtRef = useRef(0);
  const lastPlaylistAutoScrollKeyRef = useRef("");
  const isPlaylistAutoScrollingRef = useRef(false);
  const clearedProgressVideoIdsRef = useRef(new Set<string>());
  const isRightKeyDownRef = useRef(false);
  const didRightKeyHoldRef = useRef(false);
  const isRightMouseDownRef = useRef(false);
  const didRightMouseHoldRef = useRef(false);
  const didHoldSpeedStartPlaybackRef = useRef(false);
  const wasHoldSpeedPlaybackPausedRef = useRef(false);
  const startFromBeginningVideoIdRef = useRef<string | null>(null);
  const autoSubtitleSelectionVideoIdRef = useRef<string | null>(null);
  const lastSubtitleSelectionVideoIdRef = useRef<string | null>(null);
  const selectedSubtitleIdRef = useRef("off");
  const playbackStatsSessionRef = useRef<{ key: string; lastTime: number | null; hasCountedPlay: boolean } | null>(null);
  const photoAlbumsRef = useRef<PhotoAlbum[]>([]);
  const photoObjectUrlsRef = useRef<Record<string, string>>({});
  const photoImageFilePromisesRef = useRef<Record<string, Promise<File | null>>>({});
  const librarySearchResultsRef = useRef<HTMLDivElement | null>(null);
  const librarySearchLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [localConfig, setLocalConfig] = useState<LocalConfig | null>(null);
  const [mediaRootStatuses, setMediaRootStatuses] = useState<PlayerMediaRootStatus[]>([]);
  const [mediaRootId, setMediaRootId] = useState<string | null>(null);
  const [embeddedSubtitleTracks, setEmbeddedSubtitleTracks] = useState<EmbeddedSubtitleTrack[]>([]);
  const [isEmbeddedSubtitleDialogOpen, setIsEmbeddedSubtitleDialogOpen] = useState(false);
  const [embeddedSubtitleMessage, setEmbeddedSubtitleMessage] = useState("");
  const [isEmbeddedSubtitleLoading, setIsEmbeddedSubtitleLoading] = useState(false);
  const [mediaProbeVideoId, setMediaProbeVideoId] = useState<string | null>(null);
  const mediaProbeVideoIdRef = useRef<string | null>(null);
  const [compatibleMediaVideoId, setCompatibleMediaVideoId] = useState<string | null>(null);
  const [compatibleMediaMessage, setCompatibleMediaMessage] = useState("");
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiTab, setAiTab] = useState<"summary" | "qa" | "recap">("summary");
  const [subtitleSummary, setSubtitleSummary] = useState("");
  const [subtitleQuestion, setSubtitleQuestion] = useState("");
  const [subtitleAnswer, setSubtitleAnswer] = useState("");
  const [subtitleRecap, setSubtitleRecap] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [homeProgressRecap, setHomeProgressRecap] = useState("");
  const [homeProgressRecapMessage, setHomeProgressRecapMessage] = useState("");
  const [homeProgressRecapVideoId, setHomeProgressRecapVideoId] = useState("");
  const [isHomeProgressRecapLoading, setIsHomeProgressRecapLoading] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [librarySearchResults, setLibrarySearchResults] = useState<LibrarySearchResult[]>([]);
  const [librarySearchVisibleCount, setLibrarySearchVisibleCount] = useState(librarySearchResultPageSize);
  const [librarySearchAnswer, setLibrarySearchAnswer] = useState("");
  const [librarySearchMessage, setLibrarySearchMessage] = useState("");
  const [librarySearchMode, setLibrarySearchMode] = useState<LibrarySearchMode>("idle");
  const [isLibrarySearchLoading, setIsLibrarySearchLoading] = useState(false);
  const [librarySearchSubmittedQuery, setLibrarySearchSubmittedQuery] = useState("");
  const [bangumiMatchesBySeriesKey, setBangumiMatchesBySeriesKey] = useState<Record<string, BangumiSeriesMatch>>({});
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [cacheStatusMessage, setCacheStatusMessage] = useState("");
  const [isCacheStatusLoading, setIsCacheStatusLoading] = useState(false);
  const [hasLoadedCacheStatus, setHasLoadedCacheStatus] = useState(false);
  const [isCacheStatusDialogOpen, setIsCacheStatusDialogOpen] = useState(false);
  const [selectedCacheItemIds, setSelectedCacheItemIds] = useState<Set<string>>(() => new Set());
  const [cacheStatusPage, setCacheStatusPage] = useState(1);
  const [isClearCacheConfirmOpen, setIsClearCacheConfirmOpen] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [photoAlbums, setPhotoAlbums] = useState<PhotoAlbum[]>([]);
  const [photoRootStatuses, setPhotoRootStatuses] = useState<PlayerMediaRootStatus[]>([]);
  const [selectedPhotoAlbumId, setSelectedPhotoAlbumId] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoObjectUrls, setPhotoObjectUrls] = useState<Record<string, string>>({});
  const [photoAlbumProgress, setPhotoAlbumProgress] = useState<Record<string, PhotoAlbumProgress>>({});
  const [favoritePhotoAlbumIds, setFavoritePhotoAlbumIds] = useState<Set<string>>(() => new Set());
  const [photoAlbumSortMode, setPhotoAlbumSortMode] = useState<PhotoAlbumSortMode>(defaultPhotoAlbumPreferences.sortMode);
  const [photoAlbumFilter, setPhotoAlbumFilter] = useState<PhotoAlbumViewFilter>(
    defaultPhotoAlbumPreferences.favoritesOnly ? "favorites" : "all",
  );
  const [photoAlbumPage, setPhotoAlbumPage] = useState(1);
  const [photoAlbumMessage, setPhotoAlbumMessage] = useState("选择一个写真集文件夹后开始扫描图片。");
  const [isPhotoAlbumsLoading, setIsPhotoAlbumsLoading] = useState(false);
  const [hasLoadedPhotoAlbums, setHasLoadedPhotoAlbums] = useState(false);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
  const [progressStore, setProgressStore] = useState<ProgressStore>({});
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<string>>(() => new Set());
  const [videoTags, setVideoTags] = useState<VideoTagStore>({});
  const [tagMergeDecisions, setTagMergeDecisions] = useState<TagMergeDecisionStore>({});
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [isTagSuggestionLoading, setIsTagSuggestionLoading] = useState(false);
  const [tagMergePrompt, setTagMergePrompt] = useState<TagMergePrompt | null>(null);
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>("all");
  const [playlistSortMode, setPlaylistSortMode] = useState<PlaylistSortMode>(
    defaultPlayerPreferences.playlistSortMode,
  );
  const [videoStatsRevision, setVideoStatsRevision] = useState(0);
  const [launchEffectKey, setLaunchEffectKey] = useState(0);
  const [isPlaylistSortReversed, setIsPlaylistSortReversed] = useState(
    defaultPlayerPreferences.isPlaylistSortReversed,
  );
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(defaultPlayerPreferences.shortcuts);
  const [homeMediaMode, setHomeMediaMode] = useState<HomeMediaMode>(defaultPlayerPreferences.homeMediaMode);
  const [isSeriesMode, setIsSeriesMode] = useState(defaultPlayerPreferences.isSeriesMode);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState(defaultPlayerPreferences.selectedSeriesKey);
  const [isCinemaMode, setIsCinemaMode] = useState(defaultPlayerPreferences.isCinemaMode);
  const [recordingShortcutAction, setRecordingShortcutAction] = useState<ShortcutAction | null>(null);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isMainVideoLoading, setIsMainVideoLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const [isSeriesMenuOpen, setIsSeriesMenuOpen] = useState(false);
  const [isMediaLibraryPanelOpen, setIsMediaLibraryPanelOpen] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);
  const [deleteCandidate, setDeleteCandidate] = useState<VideoItem | null>(null);
  const [photoDeleteCandidate, setPhotoDeleteCandidate] = useState<{
    albumId: string;
    albumTitle: string;
    imageId: string;
    imageIndex: number;
    name: string;
    relativePath: string;
    parentDirectory?: FileSystemDirectoryHandle;
  } | null>(null);
  const [photoDeleteError, setPhotoDeleteError] = useState("");
  const [isPhotoDeletePending, setIsPhotoDeletePending] = useState(false);
  const [mediaRootLabelPrompt, setMediaRootLabelPrompt] = useState<MediaRootLabelPrompt | null>(null);
  const [existingMediaRootPrompt, setExistingMediaRootPrompt] = useState<ExistingMediaRootPrompt | null>(null);
  const [mediaRootLocalPathDialog, setMediaRootLocalPathDialog] = useState<MediaRootLocalPathDialog | null>(null);
  const [skipFolderAccessPrompt, setSkipFolderAccessPrompt] = useState(defaultPlayerSettings.skipFolderAccessPrompt);
  const [message, setMessage] = useState("新增一个媒体库开始播放");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timelinePreview, setTimelinePreview] = useState({
    time: 0,
    left: 0,
    isVisible: false,
    isDragging: false,
    imageUrl: "",
    isLoadingFrame: false,
  });
  const [doubleClickFeedback, setDoubleClickFeedback] = useState<{
    side: "left" | "center" | "right";
    text: string;
  } | null>(null);
  const [playerOverlayFeedback, setPlayerOverlayFeedback] = useState("");
  const [autoNextPrompt, setAutoNextPrompt] = useState<AutoNextPrompt | null>(null);
  const [volume, setVolume] = useState(readStoredVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekStep, setSeekStep] = useState(15);
  const [holdPlaybackRate, setHoldPlaybackRate] = useState(4);
  const [isHoldSpeedActive, setIsHoldSpeedActive] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("sequential");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [videoRotation, setVideoRotation] = useState(0);
  const [adaptiveColumns, setAdaptiveColumns] = useState<{
    playerWidth: number;
    playerHeight: number;
    playlistWidth: number;
  } | null>(null);
  const [playlistViewport, setPlaylistViewport] = useState({ scrollTop: 0, height: 0 });
  const playbackRateRef = useRef(playbackRate);
  const holdPlaybackRateRef = useRef(holdPlaybackRate);
  const isHoldSpeedActiveRef = useRef(isHoldSpeedActive);

  playbackRateRef.current = playbackRate;
  holdPlaybackRateRef.current = holdPlaybackRate;
  isHoldSpeedActiveRef.current = isHoldSpeedActive;
  isScanningRef.current = isScanning;
  isMainVideoLoadingRef.current = isMainVideoLoading;
  videosRef.current = videos;
  subtitlesRef.current = subtitles;
  photoAlbumsRef.current = photoAlbums;
  selectedSubtitleIdRef.current = selectedSubtitleId;
  localConfigRef.current = localConfig;
  bangumiMatchesBySeriesKeyRef.current = bangumiMatchesBySeriesKey;
  photoAlbumProgressRef.current = photoAlbumProgress;
  favoritePhotoAlbumIdsRef.current = favoritePhotoAlbumIds;
  photoAlbumPreferencesRef.current = {
    sortMode: photoAlbumSortMode,
    favoritesOnly: photoAlbumFilter === "favorites",
  };

  const updateSelectedSubtitleId = useCallback((nextSubtitleId: string) => {
    selectedSubtitleIdRef.current = nextSubtitleId;
    setSelectedSubtitleId(nextSubtitleId);
  }, []);

  const buildPlayerDataStore = useCallback(
    (overrides?: Partial<PlayerDataStore>): PlayerDataStore => ({
      version: 5,
      progress: progressStoreRef.current,
      favorites: Array.from(favoriteVideoIdsRef.current),
      videoTags: videoTagsRef.current,
      videoStats: videoStatsRef.current,
      tagMergeDecisions: tagMergeDecisionsRef.current,
      embeddedSubtitles: createPersistedEmbeddedSubtitles(subtitlesRef.current),
      preferences: playerPreferencesRef.current,
      settings: playerSettingsRef.current,
      metadata: libraryMetadataRef.current,
      ...overrides,
    }),
    [],
  );

  const saveCurrentPlayerDataStore = useCallback(
    async (overrides?: Partial<PlayerDataStore>) => {
      await saveGlobalPlayerDataStore(buildPlayerDataStore(overrides));
    },
    [buildPlayerDataStore],
  );

  const buildPhotoAlbumStore = useCallback(
    (overrides?: Partial<PhotoAlbumStore>): PhotoAlbumStore => ({
      version: 1,
      favorites: Array.from(favoritePhotoAlbumIdsRef.current),
      progress: photoAlbumProgressRef.current,
      preferences: photoAlbumPreferencesRef.current,
      ...overrides,
    }),
    [],
  );

  const saveCurrentPhotoAlbumStore = useCallback(
    async (overrides?: Partial<PhotoAlbumStore>) => {
      await savePhotoAlbumStore(buildPhotoAlbumStore(overrides));
    },
    [buildPhotoAlbumStore],
  );

  const applyPhotoAlbumStore = useCallback((store: PhotoAlbumStore) => {
    const favoriteIds = new Set(store.favorites);
    favoritePhotoAlbumIdsRef.current = favoriteIds;
    photoAlbumProgressRef.current = store.progress;
    photoAlbumPreferencesRef.current = store.preferences;
    setFavoritePhotoAlbumIds(favoriteIds);
    setPhotoAlbumProgress(store.progress);
    setPhotoAlbumSortMode(store.preferences.sortMode);
    setPhotoAlbumFilter(store.preferences.favoritesOnly ? "favorites" : "all");
  }, []);

  const applyCachedPhotoAlbumScan = useCallback((cache: CachedPhotoAlbumScan, options?: { status?: PlayerMediaRootStatus["status"]; message?: string; error?: string }) => {
    photoAlbumsRef.current = cache.albums;
    setPhotoAlbums(cache.albums);
    setPhotoAlbumPage(1);
    setPhotoRootStatuses([createPhotoAlbumRootStatusFromCache(cache, options?.status, options?.error)]);
    setHasLoadedPhotoAlbums(true);
    setPhotoAlbumMessage(options?.message ?? `已加载“${cache.rootName}”上次扫描结果，包含 ${cache.albums.length} 本写真集`);
  }, []);

  const applyPlayerDataStore = useCallback((nextDataStore: PlayerDataStore) => {
    progressStoreRef.current = nextDataStore.progress;
    playerPreferencesRef.current = nextDataStore.preferences;
    playerSettingsRef.current = nextDataStore.settings;
    favoriteVideoIdsRef.current = new Set(nextDataStore.favorites);
    videoTagsRef.current = nextDataStore.videoTags;
    videoStatsRef.current = nextDataStore.videoStats;
    tagMergeDecisionsRef.current = nextDataStore.tagMergeDecisions;
    libraryMetadataRef.current = nextDataStore.metadata;
    setProgressStore(nextDataStore.progress);
    setPlaylistSortMode(nextDataStore.preferences.playlistSortMode);
    setIsPlaylistSortReversed(nextDataStore.preferences.isPlaylistSortReversed);
    setShortcuts(nextDataStore.preferences.shortcuts);
    setHomeMediaMode(nextDataStore.preferences.homeMediaMode);
    setIsSeriesMode(nextDataStore.preferences.isSeriesMode);
    setSelectedSeriesKey(nextDataStore.preferences.selectedSeriesKey);
    setIsCinemaMode(nextDataStore.preferences.isCinemaMode);
    setVolume(nextDataStore.settings.volume);
    setSkipFolderAccessPrompt(nextDataStore.settings.skipFolderAccessPrompt);
    setFavoriteVideoIds(new Set(nextDataStore.favorites));
    setVideoTags(nextDataStore.videoTags);
    setTagMergeDecisions(nextDataStore.tagMergeDecisions);
  }, []);

  const loadPhotoAlbumDirectory = useCallback(
    async (directory: FileSystemDirectoryHandle, options?: { remember?: boolean }) => {
      photoAlbumDirectoryRef.current = directory;
      setIsPhotoAlbumsLoading(true);
      setPhotoAlbumMessage("正在扫描写真集...");
      try {
        const [scan, store] = await Promise.all([
          collectPhotoAlbumsFromDirectory(directory),
          loadPhotoAlbumStore().catch(() => ({
            version: 1,
            favorites: [],
            progress: {},
            preferences: defaultPhotoAlbumPreferences,
          })),
        ]);
        applyPhotoAlbumStore(store);
        photoAlbumsRef.current.forEach((album) => {
          album.images.forEach((image) => {
            if (isObjectUrl(image.url)) URL.revokeObjectURL(image.url);
          });
        });
        Object.values(photoObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
        photoObjectUrlsRef.current = {};
        setPhotoObjectUrls({});
        const cachedScan = createCachedPhotoAlbumScan(scan);
        setPhotoAlbums(scan.albums);
        photoAlbumsRef.current = scan.albums;
        setPhotoAlbumPage(1);
        setPhotoRootStatuses([
          {
            id: scan.rootId,
            label: scan.rootLabel,
            source: "browser",
            status: "ready",
            videoCount: scan.albums.length,
            scannedFiles: scan.scannedFiles,
            updatedAt: Date.now(),
          },
        ]);
        setHasLoadedPhotoAlbums(true);
        if (options?.remember !== false) {
          await writePhotoAlbumFolderHandle(directory).catch(() => undefined);
        }
        await saveCachedPhotoAlbumScan(cachedScan).catch(() => undefined);
        setPhotoAlbumMessage(
          scan.albums.length
            ? `已从“${scan.rootLabel}”加载 ${scan.albums.length} 本写真集，扫描 ${scan.scannedFiles} 张图片`
            : `“${scan.rootLabel}”里没有找到包含图片的文件夹`,
        );
      } catch (error) {
        setPhotoAlbumMessage(error instanceof Error ? error.message : "扫描写真集失败。");
      } finally {
        setIsPhotoAlbumsLoading(false);
      }
    },
    [applyPhotoAlbumStore],
  );

  const choosePhotoAlbumDirectory = useCallback(async () => {
    if (isPhotoAlbumsLoading) return;
    if (!window.showDirectoryPicker) {
      setPhotoAlbumMessage("当前浏览器不支持无上传确认的文件夹选择，请使用支持 File System Access API 的浏览器。");
      return;
    }

    try {
      const directory = await window.showDirectoryPicker({ mode: "readwrite" });
      await loadPhotoAlbumDirectory(directory);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhotoAlbumMessage("已取消选择写真集文件夹。");
      } else {
        setPhotoAlbumMessage("选择写真集文件夹失败，请确认浏览器权限后重试。");
      }
    }
  }, [isPhotoAlbumsLoading, loadPhotoAlbumDirectory]);

  const refreshPhotoAlbumDirectory = useCallback(async () => {
    if (isPhotoAlbumsLoading) return;
    const directory = photoAlbumDirectoryRef.current ?? (await readPhotoAlbumFolderHandle().catch(() => null));
    if (!directory) {
      setPhotoAlbumMessage("请先选择写真集文件夹。");
      return;
    }

    const canReadDirectory = await ensureDirectoryReadPermission(directory);
    if (!canReadDirectory) {
      setPhotoAlbumMessage(`浏览器需要重新授权“${directory.name}”，请重新选择写真集文件夹。`);
      return;
    }

    await loadPhotoAlbumDirectory(directory, { remember: true });
  }, [isPhotoAlbumsLoading, loadPhotoAlbumDirectory]);

  useEffect(() => {
    if (activeView !== "photos" || hasLoadedPhotoAlbums || isPhotoAlbumsLoading || photoAlbumAutoLoadAttemptedRef.current) return;
    photoAlbumAutoLoadAttemptedRef.current = true;
    void (async () => {
      try {
        const [directory, cachedScan, store] = await Promise.all([
          readPhotoAlbumFolderHandle(),
          loadCachedPhotoAlbumScan(),
          loadPhotoAlbumStore().catch(() => ({
            version: 1,
            favorites: [],
            progress: {},
            preferences: defaultPhotoAlbumPreferences,
          })),
        ]);
        applyPhotoAlbumStore(store);
        if (cachedScan) {
          let canReadDirectory = false;
          if (directory) {
            canReadDirectory = await hasDirectoryReadPermission(directory);
            photoAlbumDirectoryRef.current = canReadDirectory ? directory : null;
          }
          const isStale = Date.now() - cachedScan.updatedAt > photoAlbumScanCacheStaleMs;
          applyCachedPhotoAlbumScan(cachedScan, {
            status: canReadDirectory ? "ready" : "needsAccess",
            message: canReadDirectory
              ? isStale
                ? `已加载“${cachedScan.rootName}”上次扫描结果，超过 24 小时未刷新，可手动刷新`
                : `已加载“${cachedScan.rootName}”上次扫描结果，未重新扫描磁盘`
              : `已加载“${cachedScan.rootName}”上次扫描结果；如需查看图片或刷新，请重新授权文件夹`,
            error: canReadDirectory ? undefined : "需要重新授权浏览器目录。",
          });
          return;
        }
        if (!directory) {
          setPhotoAlbumMessage("首次选择写真集文件夹后，下次进入会自动复用。");
          return;
        }
        const canReadDirectory = await ensureDirectoryReadPermission(directory);
        if (!canReadDirectory) {
          setPhotoAlbumMessage(`浏览器需要重新授权“${directory.name}”，请重新选择写真集文件夹。`);
          return;
        }
        await loadPhotoAlbumDirectory(directory, { remember: true });
      } catch (error) {
        await clearPhotoAlbumFolderHandle().catch(() => undefined);
        setPhotoAlbumMessage(error instanceof Error ? error.message : "读取已保存的写真集文件夹失败，请重新选择。");
      }
    })();
  }, [activeView, hasLoadedPhotoAlbums, isPhotoAlbumsLoading, loadPhotoAlbumDirectory]);

  const homeModeMediaRoots = useMemo(
    () => (localConfig?.mediaRoots ?? []).filter((root) => isMediaRootInHomeMode(root, homeMediaMode)),
    [homeMediaMode, localConfig],
  );
  const homeModeMediaRootIds = useMemo(
    () => new Set(homeModeMediaRoots.map((root) => root.id)),
    [homeModeMediaRoots],
  );
  const modeFilteredVideos = useMemo(
    () =>
      homeMediaMode === "all"
        ? videos
        : videos.filter((video) => Boolean(video.mediaRootId && homeModeMediaRootIds.has(video.mediaRootId))),
    [homeMediaMode, homeModeMediaRootIds, videos],
  );
  const modeFilteredMediaRootStatuses = useMemo(
    () =>
      homeMediaMode === "all"
        ? mediaRootStatuses
        : mediaRootStatuses.filter((status) => homeModeMediaRootIds.has(status.id)),
    [homeMediaMode, homeModeMediaRootIds, mediaRootStatuses],
  );
  const homeMediaModeLabel = homeMediaMode === "anime" ? "追番模式" : homeMediaMode === "special" ? "特殊模式" : "全部";
  const playerMediaModeLabel = homeMediaMode === "anime" ? "追番" : homeMediaMode === "special" ? "特殊" : "全部";
  const playlistVideos = useMemo(
    () =>
      getSortedVideos(
        modeFilteredVideos,
        isSeriesMode ? "name" : playlistSortMode,
        isSeriesMode ? false : isPlaylistSortReversed,
        videoStatsRef.current,
      ),
    [isPlaylistSortReversed, isSeriesMode, modeFilteredVideos, playlistSortMode, videoStatsRevision],
  );
  const seriesOptions = useMemo(() => {
    const seriesByKey = new Map<string, { key: string; title: string; count: number; mediaRootLabel?: string }>();
    playlistVideos.forEach((video) => {
      const title = inferSeriesTitle(video);
      const key = scopedSeriesKeyForVideo(video, title);
      const mediaRoot = video.mediaRootId ? localConfig?.mediaRoots.find((root) => root.id === video.mediaRootId) : null;
      const existing = seriesByKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        seriesByKey.set(key, {
          key,
          title,
          count: 1,
          mediaRootLabel: mediaRoot?.label ?? (video.mediaRootId ? fallbackMediaRootLabelForVideo(video) : undefined),
        });
      }
    });
    return Array.from(seriesByKey.values()).sort((a, b) => collator.compare(a.title, b.title));
  }, [localConfig, playlistVideos]);
  const seriesTitleByVideoId = useMemo(() => {
    const titles = new Map<string, string>();
    playlistVideos.forEach((video) => titles.set(video.id, inferSeriesTitle(video)));
    return titles;
  }, [playlistVideos]);
  const seriesFilteredVideos = useMemo(() => {
    if (!isSeriesMode || selectedSeriesKey === "all") return playlistVideos;
    if (!seriesOptions.some((series) => series.key === selectedSeriesKey)) return playlistVideos;
    return playlistVideos.filter((video) => scopedSeriesKeyForVideo(video, seriesTitleByVideoId.get(video.id) ?? "") === selectedSeriesKey);
  }, [isSeriesMode, playlistVideos, selectedSeriesKey, seriesOptions, seriesTitleByVideoId]);
  const currentVideo = useMemo(
    () => videos.find((item) => item.id === currentVideoId) ?? null,
    [currentVideoId, videos],
  );
  const currentVideoPlaybackUrl = currentVideo ? playableUrlForVideo(currentVideo) : "";
  const currentVideoTags = currentVideo ? videoTags[currentVideo.id] ?? [] : [];
  const seriesOptionsKey = useMemo(
    () => seriesOptions.map((series) => `${series.key}\t${series.title}\t${series.count}`).join("\n"),
    [seriesOptions],
  );
  const currentSeriesKey = useMemo(
    () => (currentVideo ? scopedSeriesKeyForVideo(currentVideo, seriesTitleByVideoId.get(currentVideo.id) ?? inferSeriesTitle(currentVideo)) : ""),
    [currentVideo, seriesTitleByVideoId],
  );
  const activeBangumiSeries = useMemo(() => {
    if (!isSeriesMode) return null;
    if (selectedSeriesKey !== "all") {
      return seriesOptions.find((series) => series.key === selectedSeriesKey) ?? null;
    }
    if (currentSeriesKey) {
      return seriesOptions.find((series) => series.key === currentSeriesKey) ?? null;
    }
    return seriesOptions[0] ?? null;
  }, [currentSeriesKey, isSeriesMode, selectedSeriesKey, seriesOptions]);
  const activeBangumiMatch = activeBangumiSeries ? bangumiMatchesBySeriesKey[activeBangumiSeries.key] : null;
  const activeSeriesProgressVideoIds = useMemo(() => {
    if (!isSeriesMode || !activeBangumiSeries) return [];
    return playlistVideos
      .filter((video) => scopedSeriesKeyForVideo(video, seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video)) === activeBangumiSeries.key)
      .map((video) => video.id);
  }, [activeBangumiSeries, isSeriesMode, playlistVideos, seriesTitleByVideoId]);
  const canClearPlaylistProgress = useMemo(() => {
    if (isSeriesMode) return activeSeriesProgressVideoIds.some((videoId) => Boolean(progressStore[videoId]));
    return modeFilteredVideos.some((video) => Boolean(progressStore[video.id]));
  }, [activeSeriesProgressVideoIds, isSeriesMode, modeFilteredVideos, progressStore]);
  const clearPlaylistProgressTitle =
    isSeriesMode && activeBangumiSeries ? `清除《${activeBangumiSeries.title}》观看记录` : "清空当前模式观看记录";
  const currentVideoSourceAspectRatio = currentVideo?.width && currentVideo.height ? currentVideo.width / currentVideo.height : 9 / 16;
  const normalizedVideoRotation = ((videoRotation % 360) + 360) % 360;
  const isVideoSideways = normalizedVideoRotation === 90 || normalizedVideoRotation === 270;
  const favoritePlaylistVideos = useMemo(
    () => seriesFilteredVideos.filter((video) => favoriteVideoIds.has(video.id)),
    [favoriteVideoIds, seriesFilteredVideos],
  );
  const visibleVideos = useMemo(
    () => (playlistFilter === "favorites" ? favoritePlaylistVideos : seriesFilteredVideos),
    [favoritePlaylistVideos, playlistFilter, seriesFilteredVideos],
  );
  const visibleVideoIdsKey = useMemo(() => visibleVideos.map((video) => video.id).join("\n"), [visibleVideos]);
  const playlistIndexById = useMemo(() => {
    const indexes = new Map<string, number>();
    playlistVideos.forEach((video, index) => indexes.set(video.id, index));
    return indexes;
  }, [playlistVideos]);
  const visibleVideoIndexById = useMemo(() => {
    const indexes = new Map<string, number>();
    visibleVideos.forEach((video, index) => indexes.set(video.id, index));
    return indexes;
  }, [visibleVideos]);
  const virtualPlaylist = useMemo(() => {
    const viewportHeight = playlistViewport.height || 0;
    const startIndex = Math.max(0, Math.floor(playlistViewport.scrollTop / playlistItemHeight) - playlistVirtualOverscan);
    const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / playlistItemHeight) : 12;
    const endIndex = Math.min(visibleVideos.length, startIndex + visibleCount + playlistVirtualOverscan * 2);
    return {
      items: visibleVideos.slice(startIndex, endIndex),
      startIndex,
      topSpacerHeight: startIndex * playlistItemHeight,
      bottomSpacerHeight: Math.max(0, (visibleVideos.length - endIndex) * playlistItemHeight),
    };
  }, [playlistViewport.height, playlistViewport.scrollTop, visibleVideos]);
  const isCurrentVideoVisible = useMemo(
    () => !!currentVideoId && visibleVideos.some((video) => video.id === currentVideoId),
    [currentVideoId, visibleVideos],
  );
  const createHomeVideoCard = useCallback(
    (video: VideoItem): HomeVideoCard => {
      const progress = progressStore[video.id];
      const progressDuration = progress?.duration && progress.duration > 0 ? progress.duration : video.duration || 0;
      const progressPercent = progressDuration
        ? clamp(((progress?.currentTime ?? 0) / progressDuration) * 100, 0, 100)
        : 0;
      const mediaRoot = video.mediaRootId ? localConfig?.mediaRoots.find((root) => root.id === video.mediaRootId) : null;
      return {
        video,
        progress,
        progressPercent,
        seriesTitle: seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video),
        mediaRootLabel: mediaRoot?.label ?? fallbackMediaRootLabelForVideo(video),
        tags: videoTags[video.id] ?? [],
      };
    },
    [localConfig, progressStore, seriesTitleByVideoId, videoTags],
  );
  const videosByLibraryFolderKey = useMemo(() => {
    const grouped = new Map<string, VideoItem[]>();
    modeFilteredVideos.forEach((video) => {
      const key = libraryFolderKeyForVideo(video);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(video);
      } else {
        grouped.set(key, [video]);
      }
    });
    return grouped;
  }, [modeFilteredVideos]);
  const createLibraryFolderResult = useCallback(
    (folderVideos: VideoItem[], representativeVideo: VideoItem, score: number, reason: string): LibrarySearchResult => {
      const sortedVideos = [...folderVideos].sort((a, b) => compareNaturalRelativePath(a.relativePath, b.relativePath));
      const mediaRoot = representativeVideo.mediaRootId
        ? localConfig?.mediaRoots.find((root) => root.id === representativeVideo.mediaRootId)
        : null;
      return {
        key: libraryFolderKeyForVideo(representativeVideo),
        title: libraryFolderTitleForVideo(representativeVideo),
        path: libraryFolderPathForVideo(representativeVideo),
        mediaRootLabel: mediaRoot?.label ?? (representativeVideo.mediaRootId ? fallbackMediaRootLabelForVideo(representativeVideo) : undefined),
        videos: sortedVideos.map((video) => ({ video, progress: progressStore[video.id] })),
        representativeVideo,
        score,
        reason,
      };
    },
    [localConfig, progressStore],
  );
  const resumableHomeCards = useMemo(
    () =>
      modeFilteredVideos
        .map(createHomeVideoCard)
        .filter((card) => isResumableProgress(card.progress))
        .sort((a, b) => (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0)),
    [createHomeVideoCard, modeFilteredVideos],
  );
  const primaryResumeCard = resumableHomeCards[0] ?? null;
  const recentHomeCards = useMemo(
    () =>
      modeFilteredVideos
        .map(createHomeVideoCard)
        .filter((card) => Boolean(card.progress))
        .sort((a, b) => {
          const aCompleted = a.progress?.completed ? 1 : 0;
          const bCompleted = b.progress?.completed ? 1 : 0;
          return aCompleted - bCompleted || (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0);
        })
        .slice(0, 6),
    [createHomeVideoCard, modeFilteredVideos],
  );
  const favoriteHomeCards = useMemo(
    () =>
      modeFilteredVideos
        .filter((video) => favoriteVideoIds.has(video.id))
        .map(createHomeVideoCard)
        .sort((a, b) => {
          const statusRank = (card: HomeVideoCard) =>
            card.progress?.completed ? 2 : card.progress ? 0 : 1;
          return (
            statusRank(a) - statusRank(b) ||
            (b.progress?.updatedAt ?? b.video.lastModified) - (a.progress?.updatedAt ?? a.video.lastModified) ||
            compareNaturalRelativePath(a.video.relativePath, b.video.relativePath)
          );
        })
        .slice(0, 6),
    [createHomeVideoCard, favoriteVideoIds, modeFilteredVideos],
  );
  const nextEpisodeCard = useMemo(() => {
    const sourceVideo = primaryResumeCard?.video ?? recentHomeCards[0]?.video ?? currentVideo;
    if (!sourceVideo) return null;
    const sourceSeriesKey = scopedSeriesKeyForVideo(sourceVideo, seriesTitleByVideoId.get(sourceVideo.id) ?? inferSeriesTitle(sourceVideo));
    const seriesVideos = playlistVideos.filter(
      (video) => scopedSeriesKeyForVideo(video, seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video)) === sourceSeriesKey,
    );
    if (seriesVideos.length < 2) return null;
    const sourceIndex = seriesVideos.findIndex((video) => video.id === sourceVideo.id);
    if (sourceIndex < 0 || sourceIndex >= seriesVideos.length - 1) return null;
    return createHomeVideoCard(seriesVideos[sourceIndex + 1]);
  }, [createHomeVideoCard, currentVideo, playlistVideos, primaryResumeCard, recentHomeCards, seriesTitleByVideoId]);
  const isHomeViewVisible = activeView === "home" && !isPrivacyMode && !isCinemaMode && !isFullscreen;
  const isPhotoAlbumViewVisible =
    (activeView === "photos" || activeView === "photoViewer") && !isPrivacyMode && !isCinemaMode && !isFullscreen;
  const isNonPlayerViewVisible = isHomeViewVisible || isPhotoAlbumViewVisible;
  const firstPlayableHomeCard = playlistVideos[0] ? createHomeVideoCard(playlistVideos[0]) : null;
  const primaryHomeCard = primaryResumeCard ?? firstPlayableHomeCard;
  const thumbnailQueueVideoIds = useMemo(() => {
    const queuedVideos = isHomeViewVisible
      ? [
          primaryHomeCard?.video,
          nextEpisodeCard?.video,
          ...recentHomeCards.map((card) => card.video),
          ...favoriteHomeCards.map((card) => card.video),
          ...visibleVideos,
        ]
      : visibleVideos;
    const seenIds = new Set<string>();
    const ids: string[] = [];
    queuedVideos.forEach((video) => {
      if (!video || seenIds.has(video.id)) return;
      seenIds.add(video.id);
      ids.push(video.id);
    });
    return ids;
  }, [favoriteHomeCards, isHomeViewVisible, nextEpisodeCard, primaryHomeCard, recentHomeCards, visibleVideos]);
  const thumbnailQueueVideoIdsKey = useMemo(() => thumbnailQueueVideoIds.join("\n"), [thumbnailQueueVideoIds]);
  const libraryStats = useMemo(() => {
    const completed = modeFilteredVideos.filter((video) => progressStore[video.id]?.completed).length;
    const unfinished = modeFilteredVideos.filter((video) => isResumableProgress(progressStore[video.id])).length;
    const favorites = modeFilteredVideos.filter((video) => favoriteVideoIds.has(video.id)).length;
    return {
      total: modeFilteredVideos.length,
      unfinished,
      completed,
      favorites,
    };
  }, [favoriteVideoIds, modeFilteredVideos, progressStore]);
  const selectedPhotoAlbum = useMemo(
    () => photoAlbums.find((album) => album.id === selectedPhotoAlbumId) ?? null,
    [photoAlbums, selectedPhotoAlbumId],
  );
  const visiblePhotoAlbums = useMemo(() => {
    const source =
      photoAlbumFilter === "favorites"
        ? photoAlbums.filter((album) => favoritePhotoAlbumIds.has(album.id))
        : photoAlbums;
    return [...source].sort((a, b) => {
      if (photoAlbumSortMode === "name") {
        return collator.compare(a.title || a.relativePath, b.title || b.relativePath);
      }
      if (photoAlbumSortMode === "count") {
        return b.imageCount - a.imageCount || collator.compare(a.title, b.title);
      }
      return b.updatedAt - a.updatedAt || collator.compare(a.title, b.title);
    });
  }, [favoritePhotoAlbumIds, photoAlbumFilter, photoAlbumSortMode, photoAlbums]);
  const photoAlbumPageCount = Math.max(1, Math.ceil(visiblePhotoAlbums.length / photoAlbumPageSize));
  const pagedPhotoAlbums = useMemo(() => {
    const start = (photoAlbumPage - 1) * photoAlbumPageSize;
    return visiblePhotoAlbums.slice(start, start + photoAlbumPageSize);
  }, [photoAlbumPage, visiblePhotoAlbums]);
  const photoAlbumPageStart = visiblePhotoAlbums.length ? (photoAlbumPage - 1) * photoAlbumPageSize + 1 : 0;
  const photoAlbumPageEnd = Math.min(photoAlbumPage * photoAlbumPageSize, visiblePhotoAlbums.length);
  const photoAlbumStats = useMemo(() => {
    const completed = photoAlbums.filter((album) => photoAlbumProgress[album.id]?.completed).length;
    return {
      total: photoAlbums.length,
      images: photoAlbums.reduce((sum, album) => sum + album.imageCount, 0),
      favorites: favoritePhotoAlbumIds.size,
      completed,
    };
  }, [favoritePhotoAlbumIds.size, photoAlbumProgress, photoAlbums]);
  const visiblePhotoThumbnails = useMemo(() => {
    if (!selectedPhotoAlbum) return [];
    const halfWindow = Math.floor(photoThumbnailWindowSize / 2);
    const maxStart = Math.max(selectedPhotoAlbum.images.length - photoThumbnailWindowSize, 0);
    const start = Math.min(Math.max(currentPhotoIndex - halfWindow, 0), maxStart);
    return selectedPhotoAlbum.images.slice(start, start + photoThumbnailWindowSize);
  }, [currentPhotoIndex, selectedPhotoAlbum]);
  useEffect(() => {
    const neededImages = new Map<string, PhotoAlbumImage>();
    const directory = photoAlbumDirectoryRef.current;
    if (activeView === "photos") {
      pagedPhotoAlbums.forEach((album) => {
        const coverImage = album.images[0];
        if (coverImage && !coverImage.url && (coverImage.file || directory)) neededImages.set(coverImage.id, coverImage);
      });
    } else if (activeView === "photoViewer" && selectedPhotoAlbum) {
      const currentImage = selectedPhotoAlbum.images[currentPhotoIndex];
      if (currentImage && !currentImage.url && (currentImage.file || directory)) neededImages.set(currentImage.id, currentImage);
      visiblePhotoThumbnails.forEach((image) => {
        if (!image.url && (image.file || directory)) neededImages.set(image.id, image);
      });
    }

    const nextUrls = { ...photoObjectUrlsRef.current };
    let didChange = false;
    const missingImages: PhotoAlbumImage[] = [];

    Object.entries(photoObjectUrlsRef.current).forEach(([id, url]) => {
      if (!neededImages.has(id)) {
        URL.revokeObjectURL(url);
        delete nextUrls[id];
        didChange = true;
      }
    });

    neededImages.forEach((image, id) => {
      if (!nextUrls[id] && image.file) {
        nextUrls[id] = URL.createObjectURL(image.file);
        didChange = true;
      } else if (!nextUrls[id] && directory) {
        missingImages.push(image);
      }
    });

    if (didChange) {
      photoObjectUrlsRef.current = nextUrls;
      setPhotoObjectUrls(nextUrls);
    }

    if (!directory || !missingImages.length) return;

    let isCancelled = false;
    missingImages.forEach((image) => {
      if (!photoImageFilePromisesRef.current[image.id]) {
        photoImageFilePromisesRef.current[image.id] = getPhotoImageFileFromDirectory(directory, image.relativePath).catch(() => null);
      }
      void photoImageFilePromisesRef.current[image.id].then((file) => {
        delete photoImageFilePromisesRef.current[image.id];
        if (isCancelled || !file || photoObjectUrlsRef.current[image.id]) return;
        const url = URL.createObjectURL(file);
        if (isCancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        photoObjectUrlsRef.current = {
          ...photoObjectUrlsRef.current,
          [image.id]: url,
        };
        setPhotoObjectUrls(photoObjectUrlsRef.current);
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [activeView, currentPhotoIndex, pagedPhotoAlbums, selectedPhotoAlbum, visiblePhotoThumbnails]);
  useEffect(() => {
    return () => {
      Object.values(photoObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      photoObjectUrlsRef.current = {};
    };
  }, []);
  useEffect(() => {
    setPhotoAlbumPage((page) => Math.min(Math.max(page, 1), photoAlbumPageCount));
  }, [photoAlbumPageCount]);
  const findMatchedSubtitleForVideo = useCallback(
    (video: VideoItem) => {
      const videoBasePath = basePathOf(video.relativePath);
      return (
        subtitles.find(
          (subtitle) =>
            !subtitle.isManual &&
            (subtitle.videoId === video.id ||
              ((subtitle.mediaRootId === undefined || subtitle.mediaRootId === video.mediaRootId) &&
                basePathOf(subtitle.relativePath) === videoBasePath)),
        ) ?? null
      );
    },
    [subtitles],
  );
  const homeRecapCard = primaryResumeCard;
  const shouldShowHomeRecap = shouldShowHomeRecapCard(homeMediaMode);
  const homeRecapVideoId = homeRecapCard?.video.id ?? "";
  const homeRecapSubtitle = useMemo(
    () => (shouldShowHomeRecap && homeRecapCard ? findMatchedSubtitleForVideo(homeRecapCard.video) : null),
    [findMatchedSubtitleForVideo, homeRecapCard, shouldShowHomeRecap],
  );
  const homeRecapMediaRootId = homeRecapCard?.video.mediaRootId ?? mediaRootId;
  const homeRecapMediaRoot = useMemo(() => {
    const roots = localConfig?.mediaRoots ?? [];
    return homeRecapMediaRootId ? roots.find((root) => root.id === homeRecapMediaRootId) ?? null : null;
  }, [homeRecapMediaRootId, localConfig]);
  const canUseHomeEmbeddedSubtitles = Boolean(
    shouldShowHomeRecap &&
      homeRecapCard &&
      homeRecapMediaRootId &&
      supportsServerFileAccess(homeRecapMediaRoot) &&
      localConfig?.ffmpeg.ffmpeg &&
      localConfig.ffmpeg.ffprobe,
  );
  const canUseHomeRecapSubtitle = Boolean(homeRecapSubtitle || canUseHomeEmbeddedSubtitles);
  const searchLibraryLocally = useCallback(
    (query: string, limit?: number): LibrarySearchResult[] => {
      const normalizedQuery = normalizeLibrarySearchText(query);
      const tokens = tokenizeLibrarySearchQuery(query);
      const queryVariants = createLibrarySearchTextVariants(query);
      const alternateQueryVariants = queryVariants.filter((variant) => variant !== normalizedQuery);
      const tokenVariants = createLibrarySearchTokenVariants(query);
      if (!normalizedQuery) return [];

      const folderResults = new Map<string, LibrarySearchResult>();
      modeFilteredVideos.forEach((video) => {
        const folderTitle = libraryFolderTitleForVideo(video);
        const folderPath = libraryFolderPathForVideo(video);
        const mediaRoot = video.mediaRootId ? localConfig?.mediaRoots.find((root) => root.id === video.mediaRootId) : null;
        const mediaRootLabel = mediaRoot?.label ?? (video.mediaRootId ? fallbackMediaRootLabelForVideo(video) : "");
        const directoryParts = directoryPartsOf(video.relativePath);
        const parentDirectory = directoryParts.at(-1) ?? "";
        const directoryPath = directoryParts.join(" ");
        const searchable = [
          folderTitle,
          folderPath,
          parentDirectory,
          directoryPath,
          video.name,
          video.relativePath,
          baseNameWithoutExtension(video.name),
          mediaRootLabel,
        ].map(normalizeLibrarySearchText);
        const tags = videoTags[video.id] ?? [];
        let score = 0;
        const reasons: string[] = [];

        if (includesAnyLibrarySearchVariant([searchable[0]], queryVariants)) {
          score += 40;
          reasons.push("文件夹匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[1]], queryVariants)) {
          score += 32;
          reasons.push("目录匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[2]], queryVariants)) {
          score += 24;
          reasons.push("文件夹匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[3]], queryVariants)) {
          score += 18;
          reasons.push("目录匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[4]], queryVariants)) {
          score += 10;
          reasons.push("文件名匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[5]], queryVariants)) {
          score += 6;
          reasons.push("路径匹配");
        }
        if (includesAnyLibrarySearchVariant([searchable[7]], queryVariants)) {
          score += 12;
          reasons.push("媒体库匹配");
        }
        if (alternateQueryVariants.length && includesAnyLibrarySearchVariant(searchable, alternateQueryVariants)) {
          score += 8;
          reasons.push("中日字形匹配");
        }
        const tagScore = getTagSearchScore(query, tags);
        if (tagScore > 0) {
          score += tagScore;
          reasons.push("标签匹配");
        }

        tokens.forEach((token) => {
          if (searchable[0].includes(token)) score += 10;
          if (searchable[1].includes(token)) score += 8;
          if (searchable[2].includes(token)) score += 6;
          if (searchable[3].includes(token)) score += 5;
          if (searchable[4].includes(token)) score += 2;
          if (searchable[5].includes(token)) score += 1;
          if (searchable[7].includes(token)) score += 4;
          score += Math.floor(getTagSearchScore(token, tags) / 4);
        });
        tokenVariants
          .filter((token) => !tokens.includes(token))
          .forEach((token) => {
            if (searchable[0].includes(token)) score += 8;
            if (searchable[1].includes(token)) score += 6;
            if (searchable[2].includes(token)) score += 5;
            if (searchable[3].includes(token)) score += 4;
            if (searchable[4].includes(token)) score += 2;
            if (searchable[5].includes(token)) score += 1;
            if (searchable[7].includes(token)) score += 3;
          });

        const progress = progressStore[video.id];
        if (score <= 0) return;
        if (favoriteVideoIds.has(video.id)) score += 1;
        if (isResumableProgress(progress)) score += 1;

        const key = libraryFolderKeyForVideo(video);
        const existing = folderResults.get(key);
        if (existing) {
          if (
            score > existing.score ||
            (score === existing.score &&
              compareNaturalRelativePath(video.relativePath, existing.representativeVideo.relativePath) < 0)
          ) {
            existing.score = score;
            existing.reason = reasons[0] ?? "关键词匹配";
            existing.representativeVideo = video;
          }
          return;
        }

        folderResults.set(
          key,
          createLibraryFolderResult(
            videosByLibraryFolderKey.get(key) ?? [video],
            video,
            score,
            reasons[0] ?? "关键词匹配",
          ),
        );
      });
      const sortedResults = Array.from(folderResults.values()).sort(
        (a, b) => b.score - a.score || collator.compare(a.title, b.title),
      );
      return applyLibrarySearchResultLimit(sortedResults, limit);
    },
    [createLibraryFolderResult, favoriteVideoIds, localConfig, modeFilteredVideos, progressStore, videoTags, videosByLibraryFolderKey],
  );
  const createLibrarySearchCandidates = useCallback(
    (localResults: LibrarySearchResult[]): LibrarySearchCandidate[] => {
      const candidates: LibrarySearchCandidate[] = [];
      const seenIds = new Set<string>();
      const addVideo = (video: VideoItem) => {
        if (seenIds.has(video.id) || candidates.length >= 80) return;
        seenIds.add(video.id);
        const card = createHomeVideoCard(video);
        candidates.push({
          id: video.id,
          name: video.name,
          relativePath: video.relativePath,
          mediaRootLabel: card.mediaRootLabel ?? "",
          seriesTitle: card.seriesTitle ?? "",
          tags: videoTags[video.id] ?? [],
          progressLabel: formatLibrarySearchProgressLabel(card),
          isFavorite: favoriteVideoIds.has(video.id),
          isCompleted: Boolean(card.progress?.completed),
        });
      };

      localResults.forEach((result) => {
        addVideo(result.representativeVideo);
        result.videos.forEach(({ video }) => addVideo(video));
      });
      resumableHomeCards.forEach((card) => addVideo(card.video));
      favoriteHomeCards.forEach((card) => addVideo(card.video));
      recentHomeCards.forEach((card) => addVideo(card.video));
      modeFilteredVideos.forEach(addVideo);
      return candidates;
    },
    [createHomeVideoCard, favoriteHomeCards, favoriteVideoIds, modeFilteredVideos, recentHomeCards, resumableHomeCards, videoTags],
  );
  const currentVideoSubtitles = useMemo(() => {
    if (!currentVideo) return [];
    const currentBasePath = basePathOf(currentVideo.relativePath);
    return subtitles.filter(
      (subtitle) =>
        subtitle.isManual ||
        subtitle.videoId === currentVideo.id ||
        ((subtitle.mediaRootId === undefined || subtitle.mediaRootId === currentVideo.mediaRootId) &&
          basePathOf(subtitle.relativePath) === currentBasePath),
    );
  }, [currentVideo, subtitles]);
  const subtitleControlOptions = useMemo(
    () => createSubtitleControlOptions(currentVideoSubtitles),
    [currentVideoSubtitles],
  );
  const selectedSubtitle = currentVideoSubtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? null;
  const effectivePlaybackRate = isHoldSpeedActive ? holdPlaybackRate : playbackRate;
  const playbackRateOptions = useMemo(() => {
    if (rates.includes(effectivePlaybackRate)) return rates;
    return [...rates, effectivePlaybackRate].sort((a, b) => a - b);
  }, [effectivePlaybackRate]);
  const shellStyle = useMemo(
    () =>
      ({
        "--player-column-width": adaptiveColumns ? `${adaptiveColumns.playerWidth}px` : "1fr",
        "--player-frame-height": adaptiveColumns ? `${adaptiveColumns.playerHeight}px` : "100%",
        "--playlist-width": adaptiveColumns ? `${adaptiveColumns.playlistWidth}px` : "360px",
      }) as React.CSSProperties,
    [adaptiveColumns],
  );
  const currentMediaRootId = currentVideo?.mediaRootId ?? mediaRootId;
  const currentMediaLibraryRoot = useMemo(() => {
    const roots = localConfig?.mediaRoots ?? [];
    if (currentMediaRootId) {
      return roots.find((root) => root.id === currentMediaRootId) ?? null;
    }

    const currentDirectoryName = directoryRef.current?.name;
    if (!currentDirectoryName) return null;
    const matches = roots.filter((root) => root.basename === currentDirectoryName);
    return matches.length === 1 ? matches[0] : null;
  }, [currentMediaRootId, localConfig]);
  const canUseEmbeddedSubtitles = Boolean(
    currentVideo &&
      currentMediaRootId &&
      supportsServerFileAccess(currentMediaLibraryRoot) &&
      localConfig?.ffmpeg.ffmpeg &&
      localConfig.ffmpeg.ffprobe,
  );
  const canUseServerMediaTools = Boolean(
    currentVideo &&
      currentMediaRootId &&
      currentVideo.playbackSource === "server" &&
      supportsServerFileAccess(currentMediaLibraryRoot) &&
      localConfig?.ffmpeg.ffmpeg &&
      localConfig.ffmpeg.ffprobe,
  );
  const compatibleMediaAction = getCompatibleMediaAction(currentVideo, {
    canUseServerTools: canUseServerMediaTools,
  });
  const canCreateCompatibleMedia = compatibleMediaAction.canCreate;
  const isCurrentVideoSpecialMedia = Boolean(
    currentVideo && currentMediaLibraryRoot && isMediaRootInHomeMode(currentMediaLibraryRoot, "special"),
  );
  const canRecordEmission = Boolean(currentVideo && homeMediaMode === "special" && isCurrentVideoSpecialMedia);
  const currentVideoEmissionCount = useMemo(() => {
    if (!currentVideo) return 0;
    return videoStatsRef.current[createVideoStatsKey(currentVideo)]?.emissionCount ?? 0;
  }, [currentVideo, videoStatsRevision]);

  const updateSpecialVideoStats = useCallback(
    (
      video: VideoItem,
      updater: (current: VideoStatsStore[string]) => VideoStatsStore[string],
      options?: { saveMessage?: string },
    ) => {
      const root = video.mediaRootId
        ? localConfigRef.current?.mediaRoots.find((item) => item.id === video.mediaRootId) ?? null
        : null;
      if (!root || !isMediaRootInHomeMode(root, "special")) return;

      const statsKey = createVideoStatsKey(video);
      const currentStats = videoStatsRef.current[statsKey] ?? {
        totalPlayedSeconds: 0,
        playCount: 0,
        durationSeconds: 0,
        emissionCount: 0,
        updatedAt: Date.now(),
      };
      const nextStats = updater(currentStats);
      const nextStore = {
        ...videoStatsRef.current,
        [statsKey]: nextStats,
      };
      videoStatsRef.current = nextStore;
      setVideoStatsRevision((revision) => revision + 1);

      saveCurrentPlayerDataStore({
        videoStats: nextStore,
      })
        .then(() => {
          if (options?.saveMessage) setMessage(options.saveMessage);
        })
        .catch(() => {
          setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
        });
    },
    [saveCurrentPlayerDataStore],
  );

  const recordPlaybackStartForStats = useCallback(
    (video: VideoItem) => {
      const statsKey = createVideoStatsKey(video);
      const session = playbackStatsSessionRef.current;
      if (session?.key === statsKey && session.hasCountedPlay) return;

      playbackStatsSessionRef.current = {
        key: statsKey,
        lastTime: videoRef.current?.currentTime ?? null,
        hasCountedPlay: true,
      };
      updateSpecialVideoStats(video, (stats) => ({
        ...stats,
        playCount: stats.playCount + 1,
        durationSeconds: videoRef.current?.duration && Number.isFinite(videoRef.current.duration)
          ? videoRef.current.duration
          : stats.durationSeconds,
        updatedAt: Date.now(),
      }));
    },
    [updateSpecialVideoStats],
  );

  const recordPlaybackProgressForStats = useCallback(
    (video: VideoItem, nextTime: number, nextDuration: number) => {
      const statsKey = createVideoStatsKey(video);
      const session = playbackStatsSessionRef.current;
      const nextSession =
        session?.key === statsKey
          ? session
          : { key: statsKey, lastTime: null, hasCountedPlay: false };
      const previousTime = nextSession.lastTime;
      nextSession.lastTime = nextTime;
      playbackStatsSessionRef.current = nextSession;
      if (previousTime === null || !Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return;

      const delta = nextTime - previousTime;
      if (delta <= 0 || delta > 10) return;

      updateSpecialVideoStats(video, (stats) => ({
        ...stats,
        totalPlayedSeconds: stats.totalPlayedSeconds + delta,
        durationSeconds: Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : stats.durationSeconds,
        updatedAt: Date.now(),
      }));
    },
    [updateSpecialVideoStats],
  );

  const recordPlaybackEndedForStats = useCallback(() => {
    playbackStatsSessionRef.current = null;
  }, []);

  const recordEmissionForCurrentVideo = useCallback(() => {
    if (!currentVideo || !canRecordEmission) return;
    setLaunchEffectKey((key) => key + 1);
    if (launchEffectTimerRef.current !== null) {
      window.clearTimeout(launchEffectTimerRef.current);
    }
    launchEffectTimerRef.current = window.setTimeout(() => {
      setLaunchEffectKey(0);
      launchEffectTimerRef.current = null;
    }, 1800);
    updateSpecialVideoStats(
      currentVideo,
      (stats) => ({
        ...stats,
        emissionCount: stats.emissionCount + 1,
        lastEmissionAt: Date.now(),
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : stats.durationSeconds,
        updatedAt: Date.now(),
      }),
      { saveMessage: "已记录一次发射。" },
    );
  }, [canRecordEmission, currentVideo, duration, updateSpecialVideoStats]);

  useEffect(() => {
    playbackStatsSessionRef.current = null;
  }, [currentVideoId]);

  useEffect(() => {
    return () => {
      if (launchEffectTimerRef.current !== null) {
        window.clearTimeout(launchEffectTimerRef.current);
      }
    };
  }, []);

  const resolveMediaRootId = useCallback((directoryName: string) => {
    const roots = localConfigRef.current?.mediaRoots ?? [];
    const matches = roots.filter((root) => root.basename === directoryName);
    return matches.length === 1 ? matches[0].id : null;
  }, []);

  const requestMediaRootLabel = useCallback((directoryName: string) => {
    return new Promise<string | null>((resolve) => {
      setMediaRootLabelPrompt({ directoryName, value: directoryName, resolve });
    });
  }, []);

  const requestExistingMediaRootRescan = useCallback((directoryName: string, mediaRootLabel: string) => {
    return new Promise<boolean>((resolve) => {
      setExistingMediaRootPrompt({ directoryName, mediaRootLabel, resolve });
    });
  }, []);

  const closeExistingMediaRootPrompt = useCallback(
    (shouldRescan: boolean) => {
      if (!existingMediaRootPrompt) return;
      existingMediaRootPrompt.resolve(shouldRescan);
      setExistingMediaRootPrompt(null);
    },
    [existingMediaRootPrompt],
  );

  const closeMediaRootLabelPrompt = useCallback(
    (value: string | null) => {
      if (!mediaRootLabelPrompt) return;
      mediaRootLabelPrompt.resolve(value);
      setMediaRootLabelPrompt(null);
    },
    [mediaRootLabelPrompt],
  );

  const submitMediaRootLabelPrompt = useCallback(() => {
    const label = mediaRootLabelPrompt?.value.trim();
    if (!label) return;
    closeMediaRootLabelPrompt(label);
  }, [closeMediaRootLabelPrompt, mediaRootLabelPrompt]);

  const openMediaRootLocalPathDialog = useCallback((root: LocalMediaRoot) => {
    setMediaRootLocalPathDialog({
      root,
      value: root.localPath ?? "",
      error: "",
      isSaving: false,
    });
  }, []);

  const closeMediaRootLocalPathDialog = useCallback(() => {
    setMediaRootLocalPathDialog((previous) => (previous?.isSaving ? previous : null));
  }, []);

  const updateMediaRootLocalPathValue = useCallback((value: string) => {
    setMediaRootLocalPathDialog((previous) => (previous ? { ...previous, value, error: "" } : previous));
  }, []);

  const submitMediaRootLocalPath = useCallback(async () => {
    if (!mediaRootLocalPathDialog || mediaRootLocalPathDialog.isSaving) return;
    const localPath = mediaRootLocalPathDialog.value.trim();
    if (!localPath) {
      setMediaRootLocalPathDialog((previous) =>
        previous ? { ...previous, error: "请输入本机绝对路径。" } : previous,
      );
      return;
    }

    setMediaRootLocalPathDialog((previous) => (previous ? { ...previous, isSaving: true, error: "" } : previous));
    try {
      const response = await fetchJson<UpdateMediaRootLocalPathResponse>("/api/local-config/media-root/local-path", {
        method: "PUT",
        body: JSON.stringify({
          id: mediaRootLocalPathDialog.root.id,
          localPath,
        }),
      });
      const nextConfig = normalizeLocalConfig(response);
      setLocalConfig(nextConfig);
      localConfigRef.current = nextConfig;
      setMediaRootLocalPathDialog(null);
      setMessage("已保存媒体库本机路径。");
    } catch (error) {
      setMediaRootLocalPathDialog((previous) =>
        previous
          ? {
              ...previous,
              isSaving: false,
              error: error instanceof Error ? error.message : "保存本机路径失败。",
            }
          : previous,
      );
    }
  }, [mediaRootLocalPathDialog]);

  const ensureMediaRootForDirectory = useCallback(
    async (directory: FileSystemDirectoryHandle) => {
      const existingRootId = resolveMediaRootId(directory.name);
      if (existingRootId) {
        const existingRoot = localConfigRef.current?.mediaRoots.find((root) => root.id === existingRootId);
        const shouldRescan = await requestExistingMediaRootRescan(
          directory.name,
          existingRoot?.label ?? directory.name,
        );
        return shouldRescan ? existingRootId : null;
      }

      const label = (await requestMediaRootLabel(directory.name))?.trim();
      if (!label) return null;

      const response = await fetchJson<UpsertMediaRootResponse>("/api/local-config/media-root", {
        method: "POST",
        body: JSON.stringify({ label, path: directory.name, source: "browser" }),
      });
      const nextConfig = normalizeLocalConfig(response);
      setLocalConfig(nextConfig);
      localConfigRef.current = nextConfig;
      return response.mediaRoot.id;
    },
    [requestExistingMediaRootRescan, requestMediaRootLabel, resolveMediaRootId],
  );

  const clearControlsHideTimer = useCallback(() => {
    if (!controlsHideTimerRef.current) return;
    window.clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
  }, []);

  const shouldAutoHideControls = (isFullscreen || isCinemaMode) && isPlaying && Boolean(currentVideo);

  const cancelAutoNextPrompt = useCallback(() => {
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setAutoNextPrompt(null);
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (!shouldAutoHideControls) return;
    controlsHideTimerRef.current = window.setTimeout(() => {
      setAreControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, controlsAutoHideDelay);
  }, [clearControlsHideTimer, shouldAutoHideControls]);

  const revealControls = useCallback(() => {
    setAreControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    let isCancelled = false;
    fetchJson<LocalConfig>("/api/local-config")
      .then((config) => {
        if (isCancelled) return;
        const normalizedConfig = normalizeLocalConfig(config);
        setLocalConfig(normalizedConfig);
        localConfigRef.current = normalizedConfig;
      })
      .catch(() => {
        if (isCancelled) return;
        setLocalConfig({
          mediaRoots: [],
          ffmpeg: { ffmpeg: false, ffprobe: false },
          ai: { configured: false, model: "deepseek-chat" },
          bangumi: { configured: false, proxyConfigured: false },
        });
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!localConfig || mediaRootId || !directoryRef.current) return;
    const nextMediaRootId = resolveMediaRootId(directoryRef.current.name);
    if (!nextMediaRootId) return;
    setMediaRootId(nextMediaRootId);
    setVideos((previous) => {
      const nextVideos = previous.map((video) => ({ ...video, mediaRootId: nextMediaRootId }));
      videosRef.current = nextVideos;
      return nextVideos;
    });
  }, [localConfig, mediaRootId, resolveMediaRootId]);

  const keepControlsVisible = useCallback(() => {
    setAreControlsVisible(true);
    clearControlsHideTimer();
  }, [clearControlsHideTimer]);

  const focusPlayer = useCallback(() => {
    playerRef.current?.focus({ preventScroll: true });
  }, []);

  const revokeVideoUrls = useCallback((items: VideoItem[]) => {
    items.forEach((video) => {
      if (isObjectUrl(video.url)) URL.revokeObjectURL(video.url);
      if (video.thumbnailUrl && isObjectUrl(video.thumbnailUrl)) URL.revokeObjectURL(video.thumbnailUrl);
    });
  }, []);

  const clearLoadedMedia = useCallback(() => {
    cancelAutoNextPrompt();
    videoRef.current?.pause();
    revokeVideoUrls(videosRef.current);
    subtitlesRef.current.forEach((subtitle) => {
      if (subtitle.url && isObjectUrl(subtitle.url)) URL.revokeObjectURL(subtitle.url);
    });
    videosRef.current = [];
    subtitlesRef.current = [];
    setVideos([]);
    setSubtitles([]);
    setCurrentVideoId(null);
    updateSelectedSubtitleId("off");
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [cancelAutoNextPrompt, revokeVideoUrls, updateSelectedSubtitleId]);

  const importLegacyStoreForScannedRoot = useCallback(
    async (root: LocalMediaRoot, rootVideos: ScannedServerVideo[], baseStore: PlayerDataStore) => {
      if (!rootVideos.length) return baseStore;
      const legacyMedia: MediaCollection = {
        videos: rootVideos,
        subtitles: [],
        scannedFiles: rootVideos.length,
        filteredSmallVideos: 0,
      };
      const legacyMetadata = createLibraryMetadata({ name: root.basename } as FileSystemDirectoryHandle, legacyMedia);
      const legacyStore = await loadPlayerDataStore(legacyMetadata.id, legacyMetadata).catch(() => null);
      if (!legacyStore || !hasStoredData(legacyStore)) return baseStore;

      const legacyToGlobalId = new Map(rootVideos.map((video) => [video.legacyId ?? createLegacyVideoId(video.relativePath, video), video.id]));
      let didImport = false;
      const nextProgress = { ...baseStore.progress };
      Object.entries(legacyStore.progress).forEach(([legacyId, progress]) => {
        const globalId = legacyToGlobalId.get(legacyId);
        if (globalId && !nextProgress[globalId]) {
          nextProgress[globalId] = progress;
          didImport = true;
        }
      });

      const favoriteIds = new Set(baseStore.favorites);
      legacyStore.favorites.forEach((legacyId) => {
        const globalId = legacyToGlobalId.get(legacyId);
        if (globalId && !favoriteIds.has(globalId)) {
          favoriteIds.add(globalId);
          didImport = true;
        }
      });

      const nextVideoTags = { ...baseStore.videoTags };
      Object.entries(legacyStore.videoTags).forEach(([legacyId, tags]) => {
        const globalId = legacyToGlobalId.get(legacyId);
        if (globalId && !nextVideoTags[globalId]) {
          nextVideoTags[globalId] = tags;
          didImport = true;
        }
      });

      const nextVideoStats = { ...baseStore.videoStats };
      Object.entries(legacyStore.videoStats).forEach(([statsKey, stats]) => {
        if (!nextVideoStats[statsKey]) {
          nextVideoStats[statsKey] = stats;
          didImport = true;
        }
      });

      const nextEmbeddedSubtitles = [...baseStore.embeddedSubtitles];
      const existingSubtitleKeys = new Set(nextEmbeddedSubtitles.map((subtitle) => `${subtitle.videoId}:${subtitle.embeddedTrack.streamIndex}`));
      legacyStore.embeddedSubtitles.forEach((subtitle) => {
        const globalId = legacyToGlobalId.get(subtitle.videoId);
        if (!globalId) return;
        const key = `${globalId}:${subtitle.embeddedTrack.streamIndex}`;
        if (existingSubtitleKeys.has(key)) return;
        existingSubtitleKeys.add(key);
        nextEmbeddedSubtitles.push({ ...subtitle, videoId: globalId });
        didImport = true;
      });

      const nextTagMergeDecisions = { ...baseStore.tagMergeDecisions, ...legacyStore.tagMergeDecisions };
      if (Object.keys(nextTagMergeDecisions).length !== Object.keys(baseStore.tagMergeDecisions).length) didImport = true;

      return didImport
        ? {
            ...baseStore,
            progress: nextProgress,
            favorites: Array.from(favoriteIds),
            videoTags: nextVideoTags,
            videoStats: nextVideoStats,
            tagMergeDecisions: nextTagMergeDecisions,
            embeddedSubtitles: nextEmbeddedSubtitles,
          }
        : baseStore;
    },
    [],
  );

  const loadGlobalMediaLibrary = useCallback(async () => {
    if (!localConfigRef.current) return;
    setIsScanning(true);
    setMessage("正在扫描全局媒体库...");
    try {
      const scan = await fetchJson<MediaRootsScanResponse>("/api/media-roots/scan");
      let nextDataStore = await loadGlobalPlayerDataStore(scan.metadata).catch(() => createDefaultPlayerDataStore(scan.metadata));
      nextDataStore = {
        ...nextDataStore,
        metadata: scan.metadata,
      };

      for (const rootResult of scan.roots) {
        if (rootResult.status.status !== "ready") continue;
        nextDataStore = await importLegacyStoreForScannedRoot(rootResult.root, rootResult.videos, nextDataStore);
      }

      const nextVideos = mergeVideoRuntimeState(scan.videos, videosRef.current);
      const nextSubtitles = await Promise.all(
        scan.subtitles.map(async (subtitle) => ({
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        })),
      );
      videosRef.current = nextVideos;
      subtitlesRef.current = nextSubtitles;
      libraryIdRef.current = "global";
      libraryMetadataRef.current = scan.metadata;
      setLibraryId("global");
      setMediaRootId(null);
      setMediaRootStatuses(scan.metadata.mediaRoots);
      setVideos(nextVideos);
      setSubtitles(nextSubtitles);
      applyPlayerDataStore(nextDataStore);

      const restoredEmbeddedSubtitles = await restoreCachedEmbeddedSubtitles(nextDataStore.embeddedSubtitles, nextVideos, null);
      if (restoredEmbeddedSubtitles.length) {
        const restoredIds = new Set(restoredEmbeddedSubtitles.map((subtitle) => subtitle.id));
        const mergedSubtitles = [
          ...nextSubtitles.filter((subtitle) => !restoredIds.has(subtitle.id)),
          ...restoredEmbeddedSubtitles,
        ];
        subtitlesRef.current = mergedSubtitles;
        setSubtitles(mergedSubtitles);
      }

      await saveGlobalPlayerDataStore({
        ...nextDataStore,
        metadata: scan.metadata,
        embeddedSubtitles: createPersistedEmbeddedSubtitles(subtitlesRef.current),
      }).catch(() => undefined);

      const sortedVideos = getSortedVideos(
        nextVideos,
        nextDataStore.preferences.playlistSortMode,
        nextDataStore.preferences.isPlaylistSortReversed,
      );
      const resumeTarget = getLatestResumableVideo(nextVideos, nextDataStore.progress);
      setCurrentVideoId((currentId) => currentId ?? resumeTarget?.video.id ?? sortedVideos[0]?.id ?? null);
      setActiveView("home");
      setMessage(
        nextVideos.length
          ? `已加载全局媒体库 ${nextVideos.length} 个视频，已过滤 ${scan.filteredSmallVideos} 个小文件或特殊命名视频`
          : "没有可自动扫描的媒体文件；浏览器媒体库可能需要配置本机路径或重新授权。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "扫描全局媒体库失败。");
    } finally {
      setIsScanning(false);
    }
  }, [applyPlayerDataStore, importLegacyStoreForScannedRoot]);

  useEffect(() => {
    if (!localConfig) return;
    void loadGlobalMediaLibrary();
  }, [loadGlobalMediaLibrary, localConfig]);

  const setVideoThumbnailState = useCallback((videoId: string, status: VideoItem["thumbnailStatus"], url?: string) => {
    setVideos((previous) => {
      let didChange = false;
      const nextVideos = previous.map((video) => {
        if (video.id !== videoId) return video;
        didChange = true;
        const nextThumbnailUrl = url ?? video.thumbnailUrl;
        if (url && video.thumbnailUrl && video.thumbnailUrl !== url) {
          URL.revokeObjectURL(video.thumbnailUrl);
        }
        return { ...video, thumbnailStatus: status, thumbnailUrl: nextThumbnailUrl };
      });
      if (didChange) videosRef.current = nextVideos;
      return didChange ? nextVideos : previous;
    });
  }, []);

  const updateVideoMetadata = useCallback(
    (videoId: string, metadata: VideoMetadata) => {
      setVideos((previous) => {
        let didChange = false;
        const nextVideos = previous.map((video) => {
          if (video.id !== videoId) return video;
          const nextDuration = metadata.duration && Number.isFinite(metadata.duration) ? metadata.duration : undefined;
          const nextWidth = metadata.width && metadata.width > 0 ? metadata.width : undefined;
          const nextHeight = metadata.height && metadata.height > 0 ? metadata.height : undefined;
          if (video.duration === nextDuration && video.width === nextWidth && video.height === nextHeight) {
            return video;
          }
          didChange = true;
          return {
            ...video,
            duration: nextDuration,
            width: nextWidth,
            height: nextHeight,
          };
        });
        if (didChange) videosRef.current = nextVideos;
        return didChange ? nextVideos : previous;
      });
    },
    [],
  );

  const updateVideoPlayability = useCallback((videoId: string, playability: NonNullable<VideoItem["playability"]>) => {
    setVideos((previous) => {
      let didChange = false;
      const nextVideos = previous.map((video) => {
        if (video.id !== videoId) return video;
        didChange = true;
        return { ...video, playability };
      });
      if (didChange) videosRef.current = nextVideos;
      return didChange ? nextVideos : previous;
    });
  }, []);

  useEffect(() => {
    if (!currentVideo || !currentMediaRootId || !canUseServerMediaTools) return;
    if (currentVideo.playability || mediaProbeVideoIdRef.current === currentVideo.id) return;

    let isCancelled = false;
    const videoId = currentVideo.id;
    mediaProbeVideoIdRef.current = videoId;
    setMediaProbeVideoId(videoId);
    fetchJson<MediaProbeResponse>("/api/media/probe", {
      method: "POST",
      body: JSON.stringify({
        rootId: currentMediaRootId,
        relativePath: currentVideo.relativePath,
      }),
    })
      .then((payload) => {
        if (isCancelled) return;
        updateVideoPlayability(videoId, payload.playability);
      })
      .catch((error) => {
        if (isCancelled) return;
        updateVideoPlayability(videoId, {
          status: "unknown",
          reason: error instanceof Error ? `媒体探测失败：${error.message}` : "媒体探测失败。",
        });
      })
      .finally(() => {
        if (mediaProbeVideoIdRef.current === videoId) {
          mediaProbeVideoIdRef.current = null;
          setMediaProbeVideoId((currentId) => (currentId === videoId ? null : currentId));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [canUseServerMediaTools, currentMediaRootId, currentVideo, updateVideoPlayability]);

  const updateProgress = useCallback(
    (video: VideoItem, currentTime: number, duration: number, completed?: boolean) => {
      if (!completed && clearedProgressVideoIdsRef.current.has(video.id)) {
        if (currentTime < 0.5) return;
        clearedProgressVideoIdsRef.current.delete(video.id);
      }

      const previous = progressStoreRef.current[video.id];
      const progress = createProgress(currentTime, duration, completed ?? previous?.completed ?? false);
      if (!progress) return;

      const nextStore = {
        ...progressStoreRef.current,
        [video.id]: progress,
      };
      progressStoreRef.current = nextStore;
      setProgressStore(nextStore);

      saveCurrentPlayerDataStore({
        progress: nextStore,
      }).catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [saveCurrentPlayerDataStore],
  );

  const replaceProgressStore = useCallback((nextStore: ProgressStore, successMessage?: string) => {
    progressStoreRef.current = nextStore;
    setProgressStore(nextStore);

    saveCurrentPlayerDataStore({
      progress: nextStore,
    })
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [saveCurrentPlayerDataStore]);

  const replaceFavorites = useCallback((nextFavorites: Set<string>, successMessage?: string) => {
    favoriteVideoIdsRef.current = nextFavorites;
    setFavoriteVideoIds(new Set(nextFavorites));

    saveCurrentPlayerDataStore({
      favorites: Array.from(nextFavorites),
    })
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [saveCurrentPlayerDataStore]);

  const replaceVideoTags = useCallback((nextVideoTags: VideoTagStore, successMessage?: string) => {
    videoTagsRef.current = nextVideoTags;
    setVideoTags(nextVideoTags);

    saveCurrentPlayerDataStore({
      videoTags: nextVideoTags,
      tagMergeDecisions: tagMergeDecisionsRef.current,
    })
      .then(() => {
        if (successMessage) setTagMessage(successMessage);
      })
      .catch(() => {
        setTagMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, [saveCurrentPlayerDataStore]);

  const replaceTagMergeDecisions = useCallback((nextDecisions: TagMergeDecisionStore) => {
    tagMergeDecisionsRef.current = nextDecisions;
    setTagMergeDecisions(nextDecisions);
    saveCurrentPlayerDataStore({
      videoTags: videoTagsRef.current,
      tagMergeDecisions: nextDecisions,
    }).catch(() => {
      setTagMessage("无法保存标签合并选择。");
    });
  }, [saveCurrentPlayerDataStore]);

  const getAllLibraryTags = useCallback(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    Object.values(videoTagsRef.current).flat().forEach((tag) => {
      const key = normalizeTagKey(tag);
      if (!key || seen.has(key)) return;
      seen.add(key);
      tags.push(tag);
    });
    return tags;
  }, []);

  const addTagsToCurrentVideo = useCallback(async (tags: string[], options?: { skipPrompt?: boolean }) => {
    if (!currentVideo) return;
    const existingVideoTags = videoTagsRef.current[currentVideo.id] ?? [];
    const allTags = getAllLibraryTags();
    const incomingTags = parseTagInput(tags.join(" "));
    if (!incomingTags.length) {
      setTagMessage("请输入至少一个标签。");
      return;
    }

    const { resolvedTags, unmatchedTags } = splitTagsByExistingMatch(incomingTags, allTags);

    if (!options?.skipPrompt && unmatchedTags.length) {
      const suggestion = unmatchedTags
        .map((tag) => findTagMergeSuggestion(tag, allTags, tagMergeDecisionsRef.current))
        .find((item): item is TagMergeSuggestion => Boolean(item));
      if (suggestion) {
        setTagMergePrompt({ pendingTags: resolvedTags, suggestion });
        setTagMessage("");
        return;
      }

      if (localConfig?.ai.configured && allTags.length) {
        setIsTagSuggestionLoading(true);
        try {
          const aiSuggestion = await fetchJson<AiTagMergeSuggestionResponse>("/api/ai/tags/merge-suggestion", {
            method: "POST",
            body: JSON.stringify({ newTags: unmatchedTags, existingTags: allTags }),
          });
          if (aiSuggestion.newTag && aiSuggestion.existingTag) {
            setTagMergePrompt({
              pendingTags: resolvedTags,
              suggestion: {
                newTag: aiSuggestion.newTag,
                existingTag: aiSuggestion.existingTag,
                reason: "相似标签",
                score: 0.86,
              },
            });
            setTagMessage(aiSuggestion.reason || "");
            return;
          }
        } catch {
          setTagMessage("AI 标签合并建议不可用，已使用离线规则。");
        } finally {
          setIsTagSuggestionLoading(false);
        }
      }
    }

    const nextTags = mergeTags(existingVideoTags, resolvedTags);
    const nextVideoTags = {
      ...videoTagsRef.current,
      [currentVideo.id]: nextTags,
    };
    replaceVideoTags(nextVideoTags, `已保存 ${nextTags.length} 个标签。`);
    setTagInput("");
    setTagMergePrompt(null);
  }, [currentVideo, getAllLibraryTags, localConfig, replaceVideoTags]);

  const submitTagInput = useCallback(() => {
    if (isTagSuggestionLoading) return;
    void addTagsToCurrentVideo(parseTagInput(tagInput));
  }, [addTagsToCurrentVideo, isTagSuggestionLoading, tagInput]);

  const removeTagFromCurrentVideo = useCallback((tag: string) => {
    if (!currentVideo) return;
    const tagKey = normalizeTagKey(tag);
    const nextTags = (videoTagsRef.current[currentVideo.id] ?? []).filter((item) => normalizeTagKey(item) !== tagKey);
    const nextVideoTags = { ...videoTagsRef.current };
    if (nextTags.length) {
      nextVideoTags[currentVideo.id] = nextTags;
    } else {
      delete nextVideoTags[currentVideo.id];
    }
    replaceVideoTags(nextVideoTags, "标签已移除。");
  }, [currentVideo, replaceVideoTags]);

  const applyTagMergeSuggestion = useCallback(() => {
    if (!tagMergePrompt || !currentVideo) return;
    const { suggestion, pendingTags } = tagMergePrompt;
    const pairKey = createTagPairKey(suggestion.newTag, suggestion.existingTag);
    const nextDecisions = {
      ...tagMergeDecisionsRef.current,
      [pairKey]: {
        from: suggestion.newTag,
        to: suggestion.existingTag,
        decision: "merge" as const,
        updatedAt: Date.now(),
      },
    };
    tagMergeDecisionsRef.current = nextDecisions;
    setTagMergeDecisions(nextDecisions);
    const mergedTags = pendingTags.map((tag) =>
      normalizeTagKey(tag) === normalizeTagKey(suggestion.newTag) ? suggestion.existingTag : tag,
    );
    void addTagsToCurrentVideo(mergedTags, { skipPrompt: true });
    saveCurrentPlayerDataStore({
      videoTags: videoTagsRef.current,
      tagMergeDecisions: nextDecisions,
    }).catch(() => setTagMessage("无法保存标签合并选择。"));
  }, [addTagsToCurrentVideo, currentVideo, saveCurrentPlayerDataStore, tagMergePrompt]);

  const keepTagMergeSuggestion = useCallback(() => {
    if (!tagMergePrompt) return;
    const { suggestion, pendingTags } = tagMergePrompt;
    const pairKey = createTagPairKey(suggestion.newTag, suggestion.existingTag);
    replaceTagMergeDecisions({
      ...tagMergeDecisionsRef.current,
      [pairKey]: {
        from: suggestion.newTag,
        to: suggestion.existingTag,
        decision: "keep",
        updatedAt: Date.now(),
      },
    });
    void addTagsToCurrentVideo(pendingTags, { skipPrompt: true });
  }, [addTagsToCurrentVideo, replaceTagMergeDecisions, tagMergePrompt]);

  const clearCurrentLibraryRuntimeData = useCallback(() => {
    progressStoreRef.current = {};
    favoriteVideoIdsRef.current = new Set();
    videoTagsRef.current = {};
    videoStatsRef.current = {};
    tagMergeDecisionsRef.current = {};
    clearedProgressVideoIdsRef.current = new Set(videosRef.current.map((video) => video.id));
    playbackStatsSessionRef.current = null;
    setProgressStore({});
    setFavoriteVideoIds(new Set());
    setVideoTags({});
    setTagMergeDecisions({});
    setHomeProgressRecap("");
    setHomeProgressRecapMessage("");
    setHomeProgressRecapVideoId("");

    const element = videoRef.current;
    if (element && Number.isFinite(element.duration)) {
      element.currentTime = 0;
    }
    setCurrentTime(0);
  }, []);

  const replacePlayerPreferences = useCallback((nextPreferences: PlayerPreferences) => {
    playerPreferencesRef.current = nextPreferences;
    setPlaylistSortMode(nextPreferences.playlistSortMode);
    setIsPlaylistSortReversed(nextPreferences.isPlaylistSortReversed);
    setShortcuts(nextPreferences.shortcuts);
    setHomeMediaMode(nextPreferences.homeMediaMode);
    setIsSeriesMode(nextPreferences.isSeriesMode);
    setSelectedSeriesKey(nextPreferences.selectedSeriesKey);
    setIsCinemaMode(nextPreferences.isCinemaMode);

    saveCurrentPlayerDataStore({
      preferences: nextPreferences,
    }).catch(() => {
      setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
    });
  }, [saveCurrentPlayerDataStore]);

  const updatePlaylistSortMode = useCallback(
    (nextMode: PlaylistSortMode) => {
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        playlistSortMode: nextMode,
      });
    },
    [replacePlayerPreferences],
  );

  const togglePlaylistSortDirection = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isPlaylistSortReversed: !playerPreferencesRef.current.isPlaylistSortReversed,
    });
  }, [replacePlayerPreferences]);

  const updateHomeMediaMode = useCallback(
    (nextMode: HomeMediaMode) => {
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        homeMediaMode: nextMode,
      });
    },
    [replacePlayerPreferences],
  );

  const updateShortcut = useCallback(
    (action: ShortcutAction, nextCode: string) => {
      const conflictAction = getShortcutConflict(playerPreferencesRef.current.shortcuts, action, nextCode);
      if (conflictAction) {
        const conflictItem = shortcutGroups
          .flatMap((group) => group.items)
          .find((item) => item.action === conflictAction);
        setShortcutMessage(`“${formatShortcutKey(nextCode)}” 已用于 ${conflictItem?.label ?? "其他动作"}`);
        return;
      }

      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        shortcuts: {
          ...playerPreferencesRef.current.shortcuts,
          [action]: nextCode,
        },
      });
      setShortcutMessage(`已设置为 ${formatShortcutKey(nextCode)}`);
    },
    [replacePlayerPreferences],
  );

  const resetShortcuts = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      shortcuts: defaultShortcuts,
    });
    setRecordingShortcutAction(null);
    setShortcutMessage("已恢复默认快捷键");
  }, [replacePlayerPreferences]);

  const updateSelectedSeries = useCallback(
    (nextSeriesKey: string) => {
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        selectedSeriesKey: nextSeriesKey,
      });
      setIsSeriesMenuOpen(false);
    },
    [replacePlayerPreferences],
  );

  useEffect(() => {
    bangumiMatchRunIdRef.current += 1;
    setBangumiMatchesBySeriesKey({});
  }, [libraryId]);

  const createBangumiMatchPayload = useCallback(
    (series: { key: string; title: string }) => {
      const seriesVideos = playlistVideos
        .filter((video) => scopedSeriesKeyForVideo(video, seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video)) === series.key)
        .slice(0, 8);
      return {
        libraryId,
        seriesKey: series.key,
        title: series.title,
        sampleVideoNames: seriesVideos.map((video) => video.name),
        sampleRelativePaths: seriesVideos.map((video) => video.relativePath),
      };
    },
    [libraryId, playlistVideos, seriesTitleByVideoId],
  );

  useEffect(() => {
    if (!isSeriesMode || !localConfig?.bangumi.configured || !libraryId || !seriesOptions.length) return;

    const runId = bangumiMatchRunIdRef.current + 1;
    bangumiMatchRunIdRef.current = runId;
    let isCancelled = false;
    const orderedSeries = [
      ...(activeBangumiSeries ? [activeBangumiSeries] : []),
      ...seriesOptions.filter((series) => series.key !== activeBangumiSeries?.key),
    ];

    const loadSeriesMatch = async (series: { key: string; title: string }) => {
      const existing = bangumiMatchesBySeriesKeyRef.current[series.key];
      if (existing?.title === series.title && ["matched", "none", "error"].includes(existing.status)) return;

      setBangumiMatchesBySeriesKey((previous) => ({
        ...previous,
        [series.key]: {
          status: "loading",
          seriesKey: series.key,
          title: series.title,
          subject: null,
          confidence: "none",
          source: "none",
          candidates: [],
        },
      }));

      try {
        const match = await fetchJson<BangumiSeriesMatch>("/api/bangumi/series/match", {
          method: "POST",
          body: JSON.stringify(createBangumiMatchPayload(series)),
        });
        if (isCancelled || bangumiMatchRunIdRef.current !== runId) return;
        setBangumiMatchesBySeriesKey((previous) => ({
          ...previous,
          [series.key]: match,
        }));
      } catch (error) {
        if (isCancelled || bangumiMatchRunIdRef.current !== runId) return;
        setBangumiMatchesBySeriesKey((previous) => ({
          ...previous,
          [series.key]: {
            status: "error",
            seriesKey: series.key,
            title: series.title,
            subject: null,
            confidence: "none",
            source: "error",
            candidates: [],
            error: error instanceof Error ? error.message : "Bangumi 匹配失败",
          },
        }));
      }
    };

    void (async () => {
      for (const series of orderedSeries) {
        if (isCancelled || bangumiMatchRunIdRef.current !== runId) return;
        await loadSeriesMatch(series);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    activeBangumiSeries,
    createBangumiMatchPayload,
    isSeriesMode,
    libraryId,
    localConfig?.bangumi.configured,
    seriesOptions,
    seriesOptionsKey,
  ]);

  const canOpenBangumiSubject = Boolean(activeBangumiMatch?.status === "matched" && activeBangumiMatch.subject?.url);
  const bangumiButtonTitle = useMemo(() => {
    if (!isSeriesMode) return "Bangumi";
    if (!localConfig?.bangumi.configured) return "未配置 Bangumi";
    if (!activeBangumiSeries) return "没有可匹配的追番系列";
    if (!activeBangumiMatch || activeBangumiMatch.status === "loading") return `正在匹配 ${activeBangumiSeries.title}`;
    if (activeBangumiMatch.status === "matched" && activeBangumiMatch.subject) {
      return `打开 Bangumi：${activeBangumiMatch.subject.nameCn || activeBangumiMatch.subject.name || activeBangumiSeries.title}`;
    }
    if (activeBangumiMatch.status === "none") return `未匹配到 Bangumi 条目：${activeBangumiSeries.title}`;
    return activeBangumiMatch.error || `Bangumi 匹配失败：${activeBangumiSeries.title}`;
  }, [activeBangumiMatch, activeBangumiSeries, isSeriesMode, localConfig?.bangumi.configured]);

  const openBangumiSubject = useCallback(() => {
    const url = activeBangumiMatch?.subject?.url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [activeBangumiMatch]);

  useEffect(() => {
    if (!isSeriesMenuOpen) return;

    const closeSeriesMenu = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".series-menu")) {
        setIsSeriesMenuOpen(false);
      }
    };
    const closeSeriesMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSeriesMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeSeriesMenu);
    document.addEventListener("keydown", closeSeriesMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeSeriesMenu);
      document.removeEventListener("keydown", closeSeriesMenuOnEscape);
    };
  }, [isSeriesMenuOpen]);

  const toggleCinemaMode = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isCinemaMode: !playerPreferencesRef.current.isCinemaMode,
    });
    focusPlayer();
  }, [focusPlayer, replacePlayerPreferences]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(appThemeStorageKey, theme);
  }, [theme]);

  const handleShortcutCapture = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, action: ShortcutAction) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingShortcutAction(null);
        setShortcutMessage("");
        return;
      }

      const nextCode = shortcutCodeFromEvent(event);
      updateShortcut(action, nextCode);
      setRecordingShortcutAction(null);
    },
    [updateShortcut],
  );

  const toggleFavorite = useCallback(
    (video: VideoItem) => {
      const nextFavorites = new Set(favoriteVideoIdsRef.current);
      if (nextFavorites.has(video.id)) {
        nextFavorites.delete(video.id);
        replaceFavorites(nextFavorites, `已取消收藏《${video.name}》`);
      } else {
        nextFavorites.add(video.id);
        replaceFavorites(nextFavorites, `已收藏《${video.name}》`);
      }
    },
    [replaceFavorites],
  );

  const toggleCurrentFavorite = useCallback(() => {
    if (!currentVideo) return;
    toggleFavorite(currentVideo);
  }, [currentVideo, toggleFavorite]);

  const markVideoCompleted = useCallback(
    (video: VideoItem) => {
      clearedProgressVideoIdsRef.current.delete(video.id);
      const element = videoRef.current;
      const previous = progressStoreRef.current[video.id];
      const nextDuration =
        video.id === currentVideoId && element && Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : previous?.duration && previous.duration > 0
            ? previous.duration
            : 1;
      const progress = createProgress(nextDuration, nextDuration, true);
      if (!progress) return;

      replaceProgressStore(
        {
          ...progressStoreRef.current,
          [video.id]: progress,
        },
        `已标记《${video.name}》为已看完`,
      );
    },
    [currentVideoId, replaceProgressStore],
  );

  const markCurrentVideoCompleted = useCallback(() => {
    if (!currentVideo) return;
    markVideoCompleted(currentVideo);
  }, [currentVideo, markVideoCompleted]);

  const resetVideoProgress = useCallback(
    (video: VideoItem) => {
      clearedProgressVideoIdsRef.current.add(video.id);
      const nextStore = { ...progressStoreRef.current };
      delete nextStore[video.id];

      if (video.id === currentVideoId) {
        const element = videoRef.current;
        if (element && Number.isFinite(element.duration)) {
          element.currentTime = 0;
        }
        setCurrentTime(0);
      }

      replaceProgressStore(nextStore, `已清除《${video.name}》的播放进度`);
    },
    [currentVideoId, replaceProgressStore],
  );

  const requestDeleteLocalVideo = useCallback((video: VideoItem) => {
    if (!video.parentDirectory?.removeEntry) {
      setMessage("当前加载方式不支持删除本地文件，请通过“新增媒体库”重新加载后再试。");
      return;
    }

    setDeleteCandidate(video);
  }, []);

  const deleteLocalVideo = useCallback(
    async (video: VideoItem) => {
      const parentDirectory = video.parentDirectory;
      if (!parentDirectory?.removeEntry) {
        setMessage("当前加载方式不支持删除本地文件，请通过“新增媒体库”重新加载后再试。");
        return;
      }

      try {
        const rootDirectory = directoryRef.current;
        if (!rootDirectory || !(await hasDirectoryWritePermission(rootDirectory))) {
          setMessage("为避免浏览器原生确认框，当前未启用应用内删除本地文件。请在文件管理器中删除。");
          return;
        }

        const sortedBeforeDelete = getSortedVideos(
          videosRef.current,
          playerPreferencesRef.current.playlistSortMode,
          playerPreferencesRef.current.isPlaylistSortReversed,
        );
        const previousIndex = sortedBeforeDelete.findIndex((item) => item.id === video.id);

        await parentDirectory.removeEntry(video.name);

        const nextVideos = videosRef.current.filter((item) => item.id !== video.id);
        const nextProgressStore = { ...progressStoreRef.current };
        const nextFavoriteVideoIds = new Set(favoriteVideoIdsRef.current);
        const nextVideoTags = { ...videoTagsRef.current };
        delete nextProgressStore[video.id];
        delete nextVideoTags[video.id];
        nextFavoriteVideoIds.delete(video.id);
        clearedProgressVideoIdsRef.current.delete(video.id);
        if (video.thumbnailUrl && isObjectUrl(video.thumbnailUrl)) URL.revokeObjectURL(video.thumbnailUrl);
        if (isObjectUrl(video.url)) URL.revokeObjectURL(video.url);

        videosRef.current = nextVideos;
        progressStoreRef.current = nextProgressStore;
        favoriteVideoIdsRef.current = nextFavoriteVideoIds;
        videoTagsRef.current = nextVideoTags;
        setVideos(nextVideos);
        setProgressStore(nextProgressStore);
        setFavoriteVideoIds(nextFavoriteVideoIds);
        setVideoTags(nextVideoTags);

        if (video.id === currentVideoId) {
          videoRef.current?.pause();
          const sortedAfterDelete = getSortedVideos(
            nextVideos,
            playerPreferencesRef.current.playlistSortMode,
            playerPreferencesRef.current.isPlaylistSortReversed,
          );
          const fallbackIndex = previousIndex < 0 ? 0 : Math.min(previousIndex, sortedAfterDelete.length - 1);
          setCurrentVideoId(sortedAfterDelete[fallbackIndex]?.id ?? null);
          setCurrentTime(0);
          setDuration(0);
          updateSelectedSubtitleId("off");
          setIsPlaying(false);
        }

        await saveCurrentPlayerDataStore({
          progress: nextProgressStore,
          favorites: Array.from(nextFavoriteVideoIds),
          videoTags: nextVideoTags,
        });

        setMessage(`已删除本地文件《${video.name}》`);
      } catch {
        setMessage("删除本地文件失败，请确认浏览器仍有文件夹写入权限。");
      }
    },
    [currentVideoId, saveCurrentPlayerDataStore, updateSelectedSubtitleId],
  );

  const confirmDeleteLocalVideo = useCallback(async () => {
    if (!deleteCandidate) return;
    const target = deleteCandidate;
    setDeleteCandidate(null);
    await deleteLocalVideo(target);
  }, [deleteCandidate, deleteLocalVideo]);

  const clearFolderProgress = useCallback(() => {
    if (!modeFilteredVideos.length) return;
    if (isSeriesMode && activeBangumiSeries) {
      const targetVideoIds = new Set(activeSeriesProgressVideoIds);
      if (!targetVideoIds.size) return;

      const nextStore = { ...progressStoreRef.current };
      let didClear = false;
      targetVideoIds.forEach((videoId) => {
        clearedProgressVideoIdsRef.current.add(videoId);
        if (nextStore[videoId]) {
          delete nextStore[videoId];
          didClear = true;
        }
      });
      if (!didClear) return;

      if (currentVideoId && targetVideoIds.has(currentVideoId)) {
        const element = videoRef.current;
        if (element && Number.isFinite(element.duration)) {
          element.currentTime = 0;
        }
        setCurrentTime(0);
      }

      replaceProgressStore(nextStore, `已清除《${activeBangumiSeries.title}》的观看记录`);
      return;
    }

    const element = videoRef.current;
    if (element && Number.isFinite(element.duration)) {
      element.currentTime = 0;
    }
    setCurrentTime(0);
    const targetVideoIds = new Set(modeFilteredVideos.map((video) => video.id));
    const nextStore = { ...progressStoreRef.current };
    let didClear = false;
    targetVideoIds.forEach((videoId) => {
      clearedProgressVideoIdsRef.current.add(videoId);
      if (nextStore[videoId]) {
        delete nextStore[videoId];
        didClear = true;
      }
    });
    if (!didClear) return;
    replaceProgressStore(nextStore, "已清空当前模式的观看记录");
  }, [activeBangumiSeries, activeSeriesProgressVideoIds, currentVideoId, isSeriesMode, modeFilteredVideos, replaceProgressStore]);

  const persistCurrentProgress = useCallback(
    (completed = false) => {
      const element = videoRef.current;
      if (!element || !currentVideo) return;
      updateProgress(currentVideo, element.currentTime, element.duration || duration, completed);
    },
    [currentVideo, duration, updateProgress],
  );

  const resetHoldSpeedState = useCallback(() => {
    if (rightKeyHoldTimerRef.current) {
      window.clearTimeout(rightKeyHoldTimerRef.current);
      rightKeyHoldTimerRef.current = null;
    }
    if (rightMouseHoldTimerRef.current) {
      window.clearTimeout(rightMouseHoldTimerRef.current);
      rightMouseHoldTimerRef.current = null;
    }
    isRightKeyDownRef.current = false;
    didRightKeyHoldRef.current = false;
    isRightMouseDownRef.current = false;
    didRightMouseHoldRef.current = false;
    didHoldSpeedStartPlaybackRef.current = false;
    wasHoldSpeedPlaybackPausedRef.current = false;
    rightMousePointerIdRef.current = null;
    isHoldSpeedActiveRef.current = false;
    setIsHoldSpeedActive(false);
  }, []);

  const syncSeriesModeForPlayerEntry = useCallback(
    (videoId: string) => {
      const targetVideo = videosRef.current.find((video) => video.id === videoId) ?? null;
      const targetSeriesKey = targetVideo
        ? scopedSeriesKeyForVideo(targetVideo, seriesTitleByVideoId.get(targetVideo.id) ?? inferSeriesTitle(targetVideo))
        : null;
      const nextSeriesMode = resolvePlayerEntrySeriesMode(homeMediaMode, targetSeriesKey);
      const currentPreferences = playerPreferencesRef.current;

      setIsSeriesMenuOpen(false);
      if (nextSeriesMode.resetPlaylistFilter) setPlaylistFilter("all");

      if (
        currentPreferences.isSeriesMode === nextSeriesMode.isSeriesMode &&
        currentPreferences.selectedSeriesKey === nextSeriesMode.selectedSeriesKey
      ) {
        return;
      }

      replacePlayerPreferences({
        ...currentPreferences,
        isSeriesMode: nextSeriesMode.isSeriesMode,
        selectedSeriesKey: nextSeriesMode.selectedSeriesKey,
      });
    },
    [homeMediaMode, replacePlayerPreferences, seriesTitleByVideoId],
  );

  const selectVideo = useCallback(
    (videoId: string, options?: { syncSeriesMode?: boolean }) => {
      cancelAutoNextPrompt();
      persistCurrentProgress();
      resetHoldSpeedState();
      if (options?.syncSeriesMode !== false) syncSeriesModeForPlayerEntry(videoId);
      setActiveView("player");
      pendingAutoPlayVideoIdRef.current = videoId;
      autoSubtitleSelectionVideoIdRef.current = videoId;
      isMainVideoLoadingRef.current = true;
      setIsMainVideoLoading(true);
      setCurrentVideoId(videoId);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setTimelinePreview({
        time: 0,
        left: 0,
        isVisible: false,
        isDragging: false,
        imageUrl: "",
        isLoadingFrame: false,
      });
      updateSelectedSubtitleId("off");
      setVideoAspectRatio(16 / 9);
      focusPlayer();
    },
    [cancelAutoNextPrompt, focusPlayer, persistCurrentProgress, resetHoldSpeedState, syncSeriesModeForPlayerEntry],
  );

  const openVideoFromHome = useCallback(
    (video: VideoItem, options?: { fromBeginning?: boolean }) => {
      startFromBeginningVideoIdRef.current = options?.fromBeginning ? video.id : null;
      selectVideo(video.id);
    },
    [selectVideo],
  );

  const openLibraryFolderFromSearch = useCallback(
    (result: LibrarySearchResult) => {
      const targetVideo = result.videos[0]?.video ?? result.representativeVideo;
      setIsSeriesMenuOpen(false);
      setPlaylistFilter("all");
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        isSeriesMode: true,
        selectedSeriesKey: result.key,
      });
      selectVideo(targetVideo.id, { syncSeriesMode: false });
    },
    [replacePlayerPreferences, selectVideo],
  );

  const showHomeView = useCallback(() => {
    persistCurrentProgress();
    videoRef.current?.pause();
    cancelAutoNextPrompt();
    resetHoldSpeedState();
    setAreControlsVisible(true);
    setActiveView("home");
  }, [cancelAutoNextPrompt, persistCurrentProgress, resetHoldSpeedState]);

  const showPhotoAlbumsView = useCallback(() => {
    persistCurrentProgress();
    videoRef.current?.pause();
    cancelAutoNextPrompt();
    resetHoldSpeedState();
    setAreControlsVisible(true);
    setActiveView("photos");
  }, [cancelAutoNextPrompt, persistCurrentProgress, resetHoldSpeedState]);

  const persistPhotoAlbumProgress = useCallback(
    (album: PhotoAlbum, imageIndex: number, completed = false) => {
      const safeIndex = Math.min(Math.max(imageIndex, 0), Math.max(album.images.length - 1, 0));
      const nextProgress = {
        ...photoAlbumProgressRef.current,
        [album.id]: {
          imageIndex: safeIndex,
          updatedAt: Date.now(),
          completed,
        },
      };
      photoAlbumProgressRef.current = nextProgress;
      setPhotoAlbumProgress(nextProgress);
      void saveCurrentPhotoAlbumStore({ progress: nextProgress }).catch(() => {
        setPhotoAlbumMessage("写真集进度保存失败。");
      });
    },
    [saveCurrentPhotoAlbumStore],
  );

  const openPhotoAlbum = useCallback(
    (album: PhotoAlbum, options?: { fromBeginning?: boolean }) => {
      const storedIndex = photoAlbumProgressRef.current[album.id]?.imageIndex ?? 0;
      const nextIndex = options?.fromBeginning ? 0 : Math.min(storedIndex, Math.max(album.images.length - 1, 0));
      setSelectedPhotoAlbumId(album.id);
      setCurrentPhotoIndex(nextIndex);
      setActiveView("photoViewer");
      persistPhotoAlbumProgress(album, nextIndex, false);
    },
    [persistPhotoAlbumProgress],
  );

  const showPhotoAlbumList = useCallback(() => {
    setActiveView("photos");
  }, []);

  const movePhoto = useCallback(
    (delta: number) => {
      if (!selectedPhotoAlbum) return;
      const maxIndex = Math.max(selectedPhotoAlbum.images.length - 1, 0);
      const nextIndex = Math.min(Math.max(currentPhotoIndex + delta, 0), maxIndex);
      if (nextIndex === currentPhotoIndex) return;
      setCurrentPhotoIndex(nextIndex);
      persistPhotoAlbumProgress(selectedPhotoAlbum, nextIndex, nextIndex === maxIndex);
    },
    [currentPhotoIndex, persistPhotoAlbumProgress, selectedPhotoAlbum],
  );

  const togglePhotoAlbumFavorite = useCallback(
    (album: PhotoAlbum) => {
      const nextFavorites = new Set(favoritePhotoAlbumIdsRef.current);
      if (nextFavorites.has(album.id)) {
        nextFavorites.delete(album.id);
        setPhotoAlbumMessage(`已取消收藏《${album.title}》`);
      } else {
        nextFavorites.add(album.id);
        setPhotoAlbumMessage(`已收藏《${album.title}》`);
      }
      favoritePhotoAlbumIdsRef.current = nextFavorites;
      setFavoritePhotoAlbumIds(nextFavorites);
      void saveCurrentPhotoAlbumStore({ favorites: Array.from(nextFavorites) }).catch(() => {
        setPhotoAlbumMessage("写真集收藏保存失败。");
      });
    },
    [saveCurrentPhotoAlbumStore],
  );

  const markSelectedPhotoAlbumCompleted = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const lastIndex = Math.max(selectedPhotoAlbum.images.length - 1, 0);
    setCurrentPhotoIndex(lastIndex);
    persistPhotoAlbumProgress(selectedPhotoAlbum, lastIndex, true);
    setPhotoAlbumMessage(`已标记《${selectedPhotoAlbum.title}》为已读完`);
  }, [persistPhotoAlbumProgress, selectedPhotoAlbum]);

  const resetSelectedPhotoAlbumProgress = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const nextProgress = { ...photoAlbumProgressRef.current };
    delete nextProgress[selectedPhotoAlbum.id];
    photoAlbumProgressRef.current = nextProgress;
    setPhotoAlbumProgress(nextProgress);
    setCurrentPhotoIndex(0);
    void saveCurrentPhotoAlbumStore({ progress: nextProgress }).catch(() => {
      setPhotoAlbumMessage("写真集进度保存失败。");
    });
    setPhotoAlbumMessage(`已清除《${selectedPhotoAlbum.title}》的阅读进度`);
  }, [saveCurrentPhotoAlbumStore, selectedPhotoAlbum]);

  const requestDeleteCurrentPhoto = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const photo = selectedPhotoAlbum.images[currentPhotoIndex];
    if (!photo) {
      setPhotoAlbumMessage("当前没有可删除的写真图片。");
      return;
    }

    setPhotoDeleteError("");
    setPhotoDeleteCandidate({
      albumId: selectedPhotoAlbum.id,
      albumTitle: selectedPhotoAlbum.title,
      imageId: photo.id,
      imageIndex: currentPhotoIndex,
      name: photo.name,
      relativePath: photo.relativePath,
      parentDirectory: photo.parentDirectory,
    });
  }, [currentPhotoIndex, selectedPhotoAlbum]);

  const confirmDeleteCurrentPhoto = useCallback(async () => {
    if (!photoDeleteCandidate || isPhotoDeletePending) return;
    setPhotoDeleteError("");
    setIsPhotoDeletePending(true);
    const album = photoAlbumsRef.current.find((item) => item.id === photoDeleteCandidate.albumId);
    const photo = album?.images.find((image) => image.id === photoDeleteCandidate.imageId);
    if (!album || !photo) {
      setIsPhotoDeletePending(false);
      setPhotoDeleteCandidate(null);
      setPhotoAlbumMessage("这张图片已经不在当前写真集中。");
      return;
    }

    try {
      const rootDirectory = photoAlbumDirectoryRef.current ?? (await readPhotoAlbumFolderHandle().catch(() => null));
      const parentDirectory = photo.parentDirectory ?? photoDeleteCandidate.parentDirectory ?? (rootDirectory ? await resolvePhotoParentDirectory(rootDirectory, photo.relativePath) : null);
      if (!parentDirectory?.removeEntry) {
        setPhotoDeleteError("当前图片来源不支持直接删除，请刷新写真集或在文件管理器中删除。");
        setIsPhotoDeletePending(false);
        return;
      }

      if (!(await hasDirectoryWritePermission(parentDirectory))) {
        await clearPhotoAlbumFolderHandle().catch(() => undefined);
        await clearCachedPhotoAlbumScan().catch(() => undefined);
        Object.values(photoObjectUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
        photoAlbumDirectoryRef.current = null;
        photoAlbumsRef.current = [];
        photoObjectUrlsRef.current = {};
        setPhotoAlbums([]);
        setPhotoRootStatuses([]);
        setPhotoObjectUrls({});
        setPhotoAlbumPage(1);
        setCurrentPhotoIndex(0);
        setSelectedPhotoAlbumId(null);
        setPhotoDeleteCandidate(null);
        setPhotoDeleteError("");
        setHasLoadedPhotoAlbums(true);
        setActiveView("photos");
        setPhotoAlbumMessage("旧写真集目录记录没有写入权限，已自动清除。请重新选择写真集文件夹以授予删除权限。");
        setIsPhotoDeletePending(false);
        return;
      }

      await parentDirectory.removeEntry(photo.name);
      if (await photoFileExists(parentDirectory, photo.name)) {
        setPhotoDeleteError("浏览器没有删除这个本地文件，请确认文件未被占用，并重新选择写真集文件夹授予写入权限。");
        setIsPhotoDeletePending(false);
        return;
      }

      setPhotoDeleteCandidate(null);

      const previousProgress = photoAlbumProgressRef.current[album.id];
      const remainingImages = album.images
        .filter((image) => image.id !== photo.id)
        .map((image, index) => ({ ...image, index }));
      const nextPhotoIndex = Math.min(Math.max(photoDeleteCandidate.imageIndex - 1, 0), Math.max(remainingImages.length - 1, 0));
      const nextProgress = { ...photoAlbumProgressRef.current };
      let nextFavorites = favoritePhotoAlbumIdsRef.current;
      let nextSelectedAlbumId: string | null = album.id;

      let nextAlbums: PhotoAlbum[];
      if (remainingImages.length) {
        const nextAlbum: PhotoAlbum = {
          ...album,
          coverImageUrl: album.coverImageUrl === photo.url ? remainingImages[0]?.url || "" : album.coverImageUrl,
          imageCount: remainingImages.length,
          totalSize: remainingImages.reduce((sum, image) => sum + image.size, 0),
          updatedAt: remainingImages.reduce((latest, image) => Math.max(latest, image.lastModified), 0),
          images: remainingImages,
        };
        nextAlbums = photoAlbumsRef.current.map((item) => (item.id === album.id ? nextAlbum : item));
        nextProgress[album.id] = {
          imageIndex: nextPhotoIndex,
          updatedAt: Date.now(),
          completed: Boolean(previousProgress?.completed && nextPhotoIndex === remainingImages.length - 1),
        };
      } else {
        nextAlbums = photoAlbumsRef.current.filter((item) => item.id !== album.id);
        delete nextProgress[album.id];
        if (favoritePhotoAlbumIdsRef.current.has(album.id)) {
          nextFavorites = new Set(favoritePhotoAlbumIdsRef.current);
          nextFavorites.delete(album.id);
        }
        nextSelectedAlbumId = null;
      }

      const objectUrl = photoObjectUrlsRef.current[photo.id];
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (isObjectUrl(photo.url)) URL.revokeObjectURL(photo.url);
      const nextPhotoObjectUrls = { ...photoObjectUrlsRef.current };
      delete nextPhotoObjectUrls[photo.id];
      photoObjectUrlsRef.current = nextPhotoObjectUrls;

      photoAlbumsRef.current = nextAlbums;
      photoAlbumProgressRef.current = nextProgress;
      favoritePhotoAlbumIdsRef.current = nextFavorites;
      setPhotoAlbums(nextAlbums);
      setPhotoRootStatuses((statuses) =>
        statuses.map((status) =>
          status.id === album.mediaRootId
            ? {
                ...status,
                videoCount: nextAlbums.filter((item) => item.mediaRootId === album.mediaRootId).length,
                scannedFiles: Math.max(status.scannedFiles - 1, 0),
                updatedAt: Date.now(),
              }
            : status,
        ),
      );
      setPhotoObjectUrls(nextPhotoObjectUrls);
      setPhotoAlbumProgress(nextProgress);
      setFavoritePhotoAlbumIds(nextFavorites);
      setCurrentPhotoIndex(nextPhotoIndex);
      setSelectedPhotoAlbumId(nextSelectedAlbumId);
      if (!remainingImages.length) setActiveView("photos");

      await saveCurrentPhotoAlbumStore({
        progress: nextProgress,
        favorites: Array.from(nextFavorites),
      });

      void loadCachedPhotoAlbumScan()
        .then((cache) => {
          if (!cache || cache.rootId !== album.mediaRootId) return;
          let didUpdateAlbum = false;
          const cachedAlbums = cache.albums.flatMap((cachedAlbum) => {
            if (cachedAlbum.id !== album.id) return [cachedAlbum];
            didUpdateAlbum = true;
            if (!remainingImages.length) return [];
            return [
              {
                ...cachedAlbum,
                coverImageUrl: cachedAlbum.coverImageUrl === photo.url ? "" : cachedAlbum.coverImageUrl,
                imageCount: remainingImages.length,
                totalSize: remainingImages.reduce((sum, image) => sum + image.size, 0),
                updatedAt: remainingImages.reduce((latest, image) => Math.max(latest, image.lastModified), 0),
                images: remainingImages,
              },
            ];
          });
          if (!didUpdateAlbum) return;
          return saveCachedPhotoAlbumScan({
            ...cache,
            albums: cachedAlbums,
            scannedFiles: Math.max(cache.scannedFiles - 1, 0),
            updatedAt: Date.now(),
          });
        })
        .catch(() => {
          setPhotoAlbumMessage("图片已删除，但写真集扫描缓存更新失败，下次刷新会修正。");
        });

      setPhotoAlbumMessage(
        remainingImages.length
          ? `已删除《${photo.name}》`
          : `已删除《${photo.name}》，《${album.title}》已无图片`,
      );
    } catch {
      setPhotoDeleteError("删除写真图片失败，请确认浏览器仍有文件夹写入权限，或重新选择写真集文件夹。");
    } finally {
      setIsPhotoDeletePending(false);
    }
  }, [isPhotoDeletePending, photoDeleteCandidate, saveCurrentPhotoAlbumStore]);

  const updatePhotoAlbumSortMode = useCallback(
    (nextSortMode: PhotoAlbumSortMode) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        sortMode: nextSortMode,
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumSortMode(nextSortMode);
      setPhotoAlbumPage(1);
      void saveCurrentPhotoAlbumStore({ preferences: nextPreferences }).catch(() => {
        setPhotoAlbumMessage("写真集偏好保存失败。");
      });
    },
    [saveCurrentPhotoAlbumStore],
  );

  const updatePhotoAlbumFilter = useCallback(
    (nextFilter: PhotoAlbumViewFilter) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        favoritesOnly: nextFilter === "favorites",
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumFilter(nextFilter);
      setPhotoAlbumPage(1);
      void saveCurrentPhotoAlbumStore({ preferences: nextPreferences }).catch(() => {
        setPhotoAlbumMessage("写真集偏好保存失败。");
      });
    },
    [saveCurrentPhotoAlbumStore],
  );

  const togglePhotoFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await appShellRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    if (isFullscreen || activeView !== "player") {
      setAdaptiveColumns(null);
      return;
    }

    const updateAdaptiveColumns = () => {
      const shell = appShellRef.current;
      const playerColumn = playerColumnRef.current;
      const frame = playerRef.current;
      if (!shell || !playerColumn || !frame || window.innerWidth <= 980) {
        setAdaptiveColumns(null);
        return;
      }

      const shellStyles = window.getComputedStyle(shell);
      const gap = Number.parseFloat(shellStyles.columnGap) || 16;
      const availableWidth = shell.clientWidth;
      const playerColumnStyles = window.getComputedStyle(playerColumn);
      const playerColumnGap = Number.parseFloat(playerColumnStyles.rowGap) || 14;
      const topBarHeight = topBarRef.current?.getBoundingClientRect().height ?? 0;
      const controlsHeight = controlBarRef.current?.getBoundingClientRect().height ?? 0;
      const frameStyles = window.getComputedStyle(frame);
      const frameBorderX =
        (Number.parseFloat(frameStyles.borderLeftWidth) || 0) + (Number.parseFloat(frameStyles.borderRightWidth) || 0);
      const frameBorderY =
        (Number.parseFloat(frameStyles.borderTopWidth) || 0) + (Number.parseFloat(frameStyles.borderBottomWidth) || 0);
      const maxFrameHeight = Math.max(240, Math.floor(playerColumn.clientHeight - topBarHeight - playerColumnGap));
      const maxVideoHeight = Math.max(180, Math.floor(maxFrameHeight - controlsHeight - frameBorderY));
      const minPlayerWidth = 420;
      const minPlaylistWidth = 280;
      const activeVideoAspectRatio = Number.isFinite(videoAspectRatio) && videoAspectRatio > 0 ? videoAspectRatio : 16 / 9;
      const minVideoWidth = Math.max(1, Math.round(minPlayerWidth - frameBorderX));
      const maxVideoWidth = Math.max(minVideoWidth, Math.floor(availableWidth - gap - minPlaylistWidth - frameBorderX));
      let videoHeight = maxVideoHeight;
      let videoWidth = Math.round(videoHeight * activeVideoAspectRatio);
      if (videoWidth > maxVideoWidth) {
        videoWidth = maxVideoWidth;
        videoHeight = Math.round(videoWidth / activeVideoAspectRatio);
      }
      if (videoWidth < minVideoWidth) {
        videoWidth = minVideoWidth;
        videoHeight = Math.round(videoWidth / activeVideoAspectRatio);
      }
      const playerWidth = videoWidth + frameBorderX;
      const playerHeight = videoHeight + controlsHeight + frameBorderY;
      const playlistWidth = Math.max(minPlaylistWidth, Math.round(availableWidth - gap - playerWidth));

      setAdaptiveColumns((previous) => {
        if (
          previous &&
          Math.abs(previous.playerWidth - playerWidth) < 2 &&
          Math.abs(previous.playerHeight - playerHeight) < 2 &&
          Math.abs(previous.playlistWidth - playlistWidth) < 2
        ) {
          return previous;
        }
        return { playerWidth, playerHeight, playlistWidth };
      });
    };

    updateAdaptiveColumns();

    const resizeObserver = new ResizeObserver(updateAdaptiveColumns);
    if (appShellRef.current) resizeObserver.observe(appShellRef.current);
    if (playerColumnRef.current) resizeObserver.observe(playerColumnRef.current);
    if (topBarRef.current) resizeObserver.observe(topBarRef.current);
    if (playerRef.current) resizeObserver.observe(playerRef.current);
    if (controlBarRef.current) resizeObserver.observe(controlBarRef.current);
    window.addEventListener("resize", updateAdaptiveColumns);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAdaptiveColumns);
    };
  }, [activeView, isFullscreen, videoAspectRatio]);

  const getNextVideoId = useCallback(
    (mode: PlaybackMode) => {
      if (mode === "single-loop") {
        return currentVideoId;
      }

      const queueVideos =
        mode === "favorites-only" || playlistFilter === "favorites" ? favoritePlaylistVideos : seriesFilteredVideos;
      if (!queueVideos.length) return null;

      const queueCurrentIndex = queueVideos.findIndex((video) => video.id === currentVideoId);

      if (mode === "shuffle") {
        if (queueVideos.length === 1) return queueVideos[0].id;
        const candidates = queueVideos.filter((video) => video.id !== currentVideoId);
        return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
      }

      if (queueCurrentIndex < 0) {
        return queueVideos[0].id;
      }

      if (queueCurrentIndex < queueVideos.length - 1) {
        return queueVideos[queueCurrentIndex + 1].id;
      }

      return mode === "list-loop" ? queueVideos[0].id : null;
    },
    [currentVideoId, favoritePlaylistVideos, playlistFilter, seriesFilteredVideos],
  );

  const playNext = useCallback(() => {
    const nextVideoId = getNextVideoId(playbackMode);
    if (!nextVideoId) {
      if ((playbackMode === "favorites-only" || playlistFilter === "favorites") && !favoritePlaylistVideos.length) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    selectVideo(nextVideoId);
  }, [favoritePlaylistVideos.length, getNextVideoId, playbackMode, playlistFilter, selectVideo]);

  const canPlayNext = useMemo(() => Boolean(getNextVideoId(playbackMode)), [getNextVideoId, playbackMode]);

  const confirmAutoNext = useCallback(
    (nextVideoId: string) => {
      cancelAutoNextPrompt();
      selectVideo(nextVideoId);
    },
    [cancelAutoNextPrompt, selectVideo],
  );

  const startAutoNextPrompt = useCallback(
    (nextVideoId: string) => {
      const nextVideo = videosRef.current.find((video) => video.id === nextVideoId);
      cancelAutoNextPrompt();
      setAutoNextPrompt({
        nextVideoId,
        nextVideoName: nextVideo?.name ?? "下一集",
        remainingSeconds: autoNextPromptSeconds,
      });

      const tick = (remainingSeconds: number) => {
        autoNextTimerRef.current = window.setTimeout(() => {
          const nextRemainingSeconds = remainingSeconds - 1;
          if (nextRemainingSeconds <= 0) {
            confirmAutoNext(nextVideoId);
            return;
          }
          setAutoNextPrompt((previous) =>
            previous?.nextVideoId === nextVideoId
              ? { ...previous, remainingSeconds: nextRemainingSeconds }
              : previous,
          );
          tick(nextRemainingSeconds);
        }, 1000);
      };

      tick(autoNextPromptSeconds);
    },
    [cancelAutoNextPrompt, confirmAutoNext],
  );

  const loadDirectoryMedia = useCallback(
    async (
      directory: FileSystemDirectoryHandle,
      options?: { remember?: boolean; restored?: boolean; promptForLabel?: boolean },
    ) => {
      setIsFolderDialogOpen(false);
      setIsScanning(true);
      setMessage(options?.restored ? "正在恢复授权媒体库..." : "正在扫描媒体库...");

      try {
        const canReadDirectory = await ensureDirectoryReadPermission(directory);
        if (!canReadDirectory) {
          if (options?.remember) {
            await clearRecentFolderHandle().catch(() => undefined);
          }
          setMessage("需要允许写入文件夹，才能在本地保存播放进度。");
          return;
        }

        const nextMediaRootId = options?.promptForLabel
          ? await ensureMediaRootForDirectory(directory)
          : resolveMediaRootId(directory.name);
        if (options?.promptForLabel && !nextMediaRootId) {
          if (options?.remember) {
            await clearRecentFolderHandle().catch(() => undefined);
          }
          setMessage("已取消添加媒体库");
          return;
        }
        if (!nextMediaRootId) {
          setMessage("无法匹配媒体根，请重新添加媒体库。");
          return;
        }

        let media = createEmptyMediaCollection();
        directoryRef.current = directory;
        libraryIdRef.current = "global";
        setLibraryId("global");
        setMediaRootId(nextMediaRootId);
        setEmbeddedSubtitleTracks([]);
        setEmbeddedSubtitleMessage("");
        setSubtitleSummary("");
        setSubtitleAnswer("");
        setAiMessage("");
        updateSelectedSubtitleId("off");
        setPlaylistFilter("all");
        setActiveView("home");

        for await (const batch of collectVideos(directory, nextMediaRootId)) {
          media = mergeMediaBatch(media, {
            ...batch,
            videos: batch.videos.map((video) => ({ ...video, mediaRootId: nextMediaRootId ?? undefined })),
          });
          setMessage(
            `正在扫描，已找到 ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个小文件或特殊命名视频，已检查 ${media.scannedFiles} 个媒体文件`,
          );
        }

        media = sortMediaCollection(media);
        media = {
          ...media,
          videos: mergeVideoRuntimeState(
            media.videos.map((video) => ({ ...video, mediaRootId: nextMediaRootId ?? undefined })),
            videosRef.current,
          ),
        };
        const nextSubtitles = await Promise.all(
          media.subtitles.map(async (subtitle) => ({
            ...subtitle,
            url: subtitle.url || (await createSubtitleUrl(subtitle)),
          })),
        );
        media = { ...media, subtitles: nextSubtitles };

        let nextDataStore = buildPlayerDataStore();
        const root = (localConfigRef.current?.mediaRoots ?? []).find((item) => item.id === nextMediaRootId);
        if (root) {
          nextDataStore = await importLegacyStoreForScannedRoot(root, media.videos, nextDataStore);
        }

        const metadata = createLibraryMetadata(directory, media);
        const legacyDataStore = await loadLegacyPlayerDataStore(directory);
        if (legacyDataStore) {
          const legacyToGlobalId = new Map(media.videos.map((video) => [createLegacyVideoId(video.relativePath, video), video.id]));
          const nextProgress = { ...nextDataStore.progress };
          Object.entries(legacyDataStore.progress).forEach(([legacyId, progress]) => {
            const globalId = legacyToGlobalId.get(legacyId);
            if (globalId && !nextProgress[globalId]) nextProgress[globalId] = progress;
          });
          nextDataStore = { ...nextDataStore, progress: nextProgress };
          try {
            await deleteLegacyPlayerDataStore(directory);
          } catch {
            setMessage(`已导入旧进度，但无法删除资源库里的 ${PROGRESS_FILE_NAME}。`);
          }
        }

        const existingVideosOutsideRoot = videosRef.current.filter((video) => video.mediaRootId !== nextMediaRootId);
        const replacedVideos = videosRef.current.filter((video) => video.mediaRootId === nextMediaRootId);
        revokeVideoUrls(replacedVideos);
        const mergedVideos = getSortedVideos(
          [...existingVideosOutsideRoot, ...mergeVideoRuntimeState(media.videos, replacedVideos)],
          playerPreferencesRef.current.playlistSortMode,
          playerPreferencesRef.current.isPlaylistSortReversed,
        );

        const existingSubtitlesOutsideRoot = subtitlesRef.current.filter((subtitle) => {
          if (subtitle.mediaRootId) return subtitle.mediaRootId !== nextMediaRootId;
          const matchedVideo = subtitle.videoId ? videosRef.current.find((video) => video.id === subtitle.videoId) : null;
          return matchedVideo?.mediaRootId !== nextMediaRootId;
        });
        subtitlesRef.current
          .filter((subtitle) => !existingSubtitlesOutsideRoot.includes(subtitle) && subtitle.url && isObjectUrl(subtitle.url))
          .forEach((subtitle) => URL.revokeObjectURL(subtitle.url));
        let mergedSubtitles = [...existingSubtitlesOutsideRoot, ...media.subtitles];

        const rootStatuses = mediaRootStatuses.filter((status) => status.id !== nextMediaRootId);
        const rootStatus: PlayerMediaRootStatus = {
          id: nextMediaRootId ?? directory.name,
          label: root?.label ?? directory.name,
          source: root?.source ?? "browser",
          status: "ready",
          videoCount: media.videos.length,
          scannedFiles: media.scannedFiles,
          updatedAt: Date.now(),
        };
        const nextRootStatuses = [...rootStatuses, rootStatus];
        const globalMetadata: PlayerGlobalMetadata = {
          id: "global",
          name: "全局媒体库",
          videoCount: mergedVideos.length,
          scannedFiles: nextRootStatuses.reduce((sum, status) => sum + status.scannedFiles, 0),
          updatedAt: Date.now(),
          mediaRoots: nextRootStatuses,
        };
        nextDataStore = { ...nextDataStore, metadata: globalMetadata };

        const restoredEmbeddedSubtitles = await restoreCachedEmbeddedSubtitles(
          nextDataStore.embeddedSubtitles,
          mergedVideos,
          nextMediaRootId,
        );
        if (restoredEmbeddedSubtitles.length) {
          const restoredIds = new Set(restoredEmbeddedSubtitles.map((subtitle) => subtitle.id));
          mergedSubtitles = [...mergedSubtitles.filter((subtitle) => !restoredIds.has(subtitle.id)), ...restoredEmbeddedSubtitles];
        }

        videosRef.current = mergedVideos;
        subtitlesRef.current = mergedSubtitles;
        libraryMetadataRef.current = globalMetadata;
        setMediaRootStatuses(nextRootStatuses);
        setVideos(mergedVideos);
        setSubtitles(mergedSubtitles);
        applyPlayerDataStore(nextDataStore);
        await saveGlobalPlayerDataStore({
          ...nextDataStore,
          embeddedSubtitles: createPersistedEmbeddedSubtitles(mergedSubtitles),
        }).catch(() => undefined);

        if (mergedVideos.length) {
          const resumeTarget = getLatestResumableVideo(media.videos, nextDataStore.progress);
          const sortedVideos = getSortedVideos(
            mergedVideos,
            nextDataStore.preferences.playlistSortMode,
            nextDataStore.preferences.isPlaylistSortReversed,
          );
          setCurrentVideoId((currentId) => currentId ?? resumeTarget?.video.id ?? sortedVideos[0]?.id ?? null);
        }
        setMessage(
          media.videos.length
            ? `${options?.restored ? "已恢复" : "已加载"} ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个小文件或特殊命名视频`
            : "这个文件夹里没有可播放的视频文件",
        );

        if (options?.remember) {
          await writeRecentFolderHandle(directory).catch(() => undefined);
        }
      } finally {
        setIsScanning(false);
      }
    },
    [
      applyPlayerDataStore,
      buildPlayerDataStore,
      ensureMediaRootForDirectory,
      importLegacyStoreForScannedRoot,
      mediaRootStatuses,
      resolveMediaRootId,
      revokeVideoUrls,
    ],
  );

  const loadFileMedia = useCallback(
    async (files: FileList | File[], messageSuffix = "播放进度仅在本次会话保留") => {
      setIsFolderDialogOpen(false);
      setIsScanning(true);
      setMessage("正在扫描媒体文件...");
      const media = collectVideosFromFiles(files);
      const nextSubtitles = await Promise.all(
        media.subtitles.map(async (subtitle) => ({
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        })),
      );
      directoryRef.current = null;
      libraryIdRef.current = null;
      libraryMetadataRef.current = undefined;
      setLibraryId(null);
      setMediaRootId(null);
      setEmbeddedSubtitleTracks([]);
      setEmbeddedSubtitleMessage("");
      setSubtitleSummary("");
      setSubtitleAnswer("");
      setAiMessage("");
      progressStoreRef.current = {};
      videoTagsRef.current = {};
      tagMergeDecisionsRef.current = {};
      playerPreferencesRef.current = {
        playlistSortMode,
        isPlaylistSortReversed,
        shortcuts,
        homeMediaMode,
        isSeriesMode,
        selectedSeriesKey,
        isCinemaMode,
      };
      favoriteVideoIdsRef.current = new Set();
      setProgressStore({});
      setFavoriteVideoIds(new Set());
      setVideoTags({});
      setTagMergeDecisions({});
      setIsSeriesMode(playerPreferencesRef.current.isSeriesMode);
      setSelectedSeriesKey(playerPreferencesRef.current.selectedSeriesKey);
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
      videosRef.current = media.videos;
      subtitlesRef.current = nextSubtitles;
      setVideos(media.videos);
      setSubtitles(nextSubtitles);
      updateSelectedSubtitleId("off");
      setPlaylistFilter("all");
      setActiveView("home");
      setCurrentVideoId(getSortedVideos(media.videos, playlistSortMode, isPlaylistSortReversed)[0]?.id ?? null);
      setMessage(
        media.videos.length
          ? `已加载 ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个小文件或特殊命名视频，${messageSuffix}`
          : "没有找到可播放的视频文件",
      );
    },
    [
      isCinemaMode,
      isPlaylistSortReversed,
      isSeriesMode,
      homeMediaMode,
      playlistSortMode,
      revokeVideoUrls,
      selectedSeriesKey,
      shortcuts,
    ],
  );

  const showDirectoryPickerUnsupportedMessage = () => {
    setIsScanning(false);
    setIsFolderDialogOpen(false);
    setMessage("当前浏览器不支持无上传确认的文件夹选择，请使用支持 File System Access API 的浏览器。");
  };

  const chooseMediaLibraryDirectory = async () => {
    if (!window.showDirectoryPicker) {
      showDirectoryPickerUnsupportedMessage();
      return;
    }

    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      await loadDirectoryMedia(directory, { remember: true, promptForLabel: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("已取消新增媒体库");
      } else {
        setMessage("新增媒体库失败，请确认浏览器权限后重试。");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const requestAddMediaLibrary = () => {
    if (!window.showDirectoryPicker) {
      showDirectoryPickerUnsupportedMessage();
      return;
    }

    if (skipFolderAccessPrompt) {
      void chooseMediaLibraryDirectory();
      return;
    }

    setIsFolderDialogOpen(true);
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragActive(false);

      try {
        const items = Array.from(event.dataTransfer.items) as DataTransferItemWithHandle[];
        const handles = (
          await Promise.all(items.map((item) => item.getAsFileSystemHandle?.() ?? Promise.resolve(null)))
        ).filter((handle): handle is FileSystemDirectoryHandle | FileSystemFileHandle => Boolean(handle));
        const directory = handles.find((handle): handle is FileSystemDirectoryHandle => handle.kind === "directory");
        if (directory) {
          await loadDirectoryMedia(directory, { remember: true, promptForLabel: true });
          return;
        }

        const handleFiles = await Promise.all(
          handles
            .filter((handle): handle is FileSystemFileHandle => handle.kind === "file")
            .map((handle) => handle.getFile()),
        );
        const droppedFiles = handleFiles.length ? handleFiles : Array.from(event.dataTransfer.files);
        if (!droppedFiles.length) {
          setMessage("当前浏览器不支持拖入文件夹，请使用“新增媒体库”。");
          return;
        }

        await loadFileMedia(droppedFiles, "拖拽文件的播放进度仅在本次会话保留");
      } catch {
        setMessage("无法读取拖入的媒体，请确认浏览器权限后重试。");
      } finally {
        setIsScanning(false);
      }
    },
    [loadDirectoryMedia, loadFileMedia],
  );

  const updateSkipFolderAccessPrompt = (checked: boolean) => {
    setSkipFolderAccessPrompt(checked);
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      skipFolderAccessPrompt: checked,
    };
    saveCurrentPlayerDataStore({ settings: playerSettingsRef.current }).catch(() => {
      setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
    });
  };

  useEffect(() => {
    const runId = thumbnailLoadRunIdRef.current + 1;
    thumbnailLoadRunIdRef.current = runId;
    let isCancelled = false;
    const orderedVideoIds = thumbnailQueueVideoIdsKey ? thumbnailQueueVideoIdsKey.split("\n") : [];
    const videoById = new Map(videosRef.current.map((video) => [video.id, video]));

    if (isScanning || isMainVideoLoading || !orderedVideoIds.length) {
      return () => {
        isCancelled = true;
      };
    }

    const loadThumbnailsInOrder = async () => {
      for (const videoId of orderedVideoIds) {
        if (isCancelled || thumbnailLoadRunIdRef.current !== runId) return;

        const video = videoById.get(videoId);
        if (!video || video.thumbnailStatus === "ready" || video.thumbnailStatus === "loading") {
          continue;
        }

        setVideoThumbnailState(video.id, "loading");

        try {
          const { thumbnailUrl, metadata } = await loadVideoThumbnail(libraryIdRef.current, video);
          if (isCancelled || thumbnailLoadRunIdRef.current !== runId) {
            URL.revokeObjectURL(thumbnailUrl);
            const currentVideo = videosRef.current.find((item) => item.id === video.id);
            if (currentVideo?.thumbnailStatus === "loading") {
              setVideoThumbnailState(video.id, "idle");
            }
            return;
          }
          if (metadata) {
            updateVideoMetadata(video.id, metadata);
          }
          setVideoThumbnailState(video.id, "ready", thumbnailUrl);
        } catch {
          if (!isCancelled && thumbnailLoadRunIdRef.current === runId) {
            setVideoThumbnailState(video.id, "failed");
          }
        }
      }
    };

    void loadThumbnailsInOrder();

    return () => {
      isCancelled = true;
    };
  }, [isMainVideoLoading, isScanning, setVideoThumbnailState, thumbnailQueueVideoIdsKey, updateVideoMetadata]);

  const scrollToCurrentPlaylistItem = useCallback((behavior: ScrollBehavior = "smooth") => {
    const playlist = playlistRef.current;
    if (!playlist || !currentVideoId) return;
    const index = visibleVideoIndexById.get(currentVideoId);
    if (index === undefined) return;
    isPlaylistAutoScrollingRef.current = true;
    const top = Math.max(0, index * playlistItemHeight - playlist.clientHeight / 2 + playlistItemHeight / 2);
    playlist.scrollTo({ top, behavior });
    setPlaylistViewport((previous) => ({ ...previous, scrollTop: top }));

    if (playlistAutoScrollTimerRef.current) {
      window.clearTimeout(playlistAutoScrollTimerRef.current);
    }
    playlistAutoScrollTimerRef.current = window.setTimeout(() => {
      isPlaylistAutoScrollingRef.current = false;
      playlistAutoScrollTimerRef.current = null;
    }, 700);
  }, [currentVideoId, visibleVideoIndexById]);

  const scrollPlaylistToTop = useCallback((behavior: ScrollBehavior = "smooth") => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    isPlaylistAutoScrollingRef.current = true;
    playlist.scrollTo({ top: 0, behavior });
    setPlaylistViewport((previous) => ({ ...previous, scrollTop: 0 }));

    if (playlistAutoScrollTimerRef.current) {
      window.clearTimeout(playlistAutoScrollTimerRef.current);
    }
    playlistAutoScrollTimerRef.current = window.setTimeout(() => {
      isPlaylistAutoScrollingRef.current = false;
      playlistAutoScrollTimerRef.current = null;
    }, 700);
  }, []);

  useEffect(() => {
    if (!currentVideoId || !playlistRef.current) return;
    if (isScanning) return;
    const autoScrollKey = `${currentVideoId}\n${visibleVideoIdsKey}`;
    if (lastPlaylistAutoScrollKeyRef.current === autoScrollKey) return;
    lastPlaylistAutoScrollKeyRef.current = autoScrollKey;
    if (Date.now() - lastPlaylistUserScrollAtRef.current < 800) return;

    scrollToCurrentPlaylistItem();
  }, [currentVideoId, isScanning, scrollToCurrentPlaylistItem, visibleVideoIdsKey]);

  const markPlaylistUserScroll = useCallback((event?: React.UIEvent<HTMLDivElement>) => {
    const element = event?.currentTarget ?? playlistRef.current;
    if (element && playlistScrollFrameRef.current === null) {
      playlistScrollFrameRef.current = window.setTimeout(() => {
        playlistScrollFrameRef.current = null;
        const playlist = playlistRef.current;
        if (playlist) {
          setPlaylistViewport({ scrollTop: playlist.scrollTop, height: playlist.clientHeight });
        }
      }, playlistScrollFrameDelay);
    }
    if (isPlaylistAutoScrollingRef.current) return;
    lastPlaylistUserScrollAtRef.current = Date.now();
  }, []);

  useLayoutEffect(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    const updatePlaylistViewport = () => {
      setPlaylistViewport({ scrollTop: playlist.scrollTop, height: playlist.clientHeight });
    };

    updatePlaylistViewport();
    const observer = new ResizeObserver(updatePlaylistViewport);
    observer.observe(playlist);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!localConfig?.mediaRoots.length) {
      clearRecentFolderHandle().catch(() => undefined);
    }
  }, [localConfig]);

  useEffect(() => {
    return () => {
      if (playlistAutoScrollTimerRef.current) {
        window.clearTimeout(playlistAutoScrollTimerRef.current);
      }
      if (playlistScrollFrameRef.current) {
        window.clearTimeout(playlistScrollFrameRef.current);
      }
      thumbnailLoadRunIdRef.current += 1;
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url && isObjectUrl(subtitle.url)) URL.revokeObjectURL(subtitle.url);
      });
    };
  }, [revokeVideoUrls]);

  useLayoutEffect(() => {
    const mediaElements = [videoRef.current, previewVideoRef.current].filter(
      (element): element is HTMLVideoElement => Boolean(element),
    );

    mediaElements.forEach((element) => {
      if (!currentVideo) {
        element.removeAttribute("src");
        element.load();
        return;
      }

      if (currentVideoPlaybackUrl && element.src !== currentVideoPlaybackUrl) {
        element.src = currentVideoPlaybackUrl;
      }
    });
  }, [currentVideo?.id, currentVideoPlaybackUrl]);

  useEffect(() => {
    setVideoRotation(0);
    setCompatibleMediaMessage("");
  }, [currentVideo?.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
      setAreControlsVisible(true);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!shouldAutoHideControls) {
      setAreControlsVisible(true);
      clearControlsHideTimer();
      return;
    }

    scheduleControlsHide();
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, scheduleControlsHide, shouldAutoHideControls]);

  useLayoutEffect(() => {
    const element = videoRef.current;
    if (!element || !currentVideo) return;
    isMainVideoLoadingRef.current = true;
    setIsMainVideoLoading(true);

    const progress = progressStoreRef.current[currentVideo.id];
    const shouldStartFromBeginning = startFromBeginningVideoIdRef.current === currentVideo.id;
    if (shouldStartFromBeginning) {
      startFromBeginningVideoIdRef.current = null;
    }
    const resumeAt =
      !shouldStartFromBeginning && progress && !progress.completed && progress.currentTime < Math.max(0, progress.duration - 8)
        ? progress.currentTime
        : 0;

    const handleLoadedMetadata = () => {
      setDuration(element.duration || 0);
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setVideoAspectRatio(getPlayerFrameAspectRatio());
      }
      updateVideoMetadata(currentVideo.id, {
        duration: element.duration || undefined,
        width: element.videoWidth || undefined,
        height: element.videoHeight || undefined,
      });
      if (resumeAt > 0) {
        element.currentTime = resumeAt;
        setCurrentTime(resumeAt);
      }
    };
    const handleCanPlay = () => {
      isMainVideoLoadingRef.current = false;
      setIsMainVideoLoading(false);
    };
    const handleError = () => {
      isMainVideoLoadingRef.current = false;
      setIsMainVideoLoading(false);
      pendingAutoPlayVideoIdRef.current = null;
      setMessage("视频加载失败，请确认文件仍可访问。");
    };

    element.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    element.addEventListener("canplay", handleCanPlay, { once: true });
    element.addEventListener("error", handleError, { once: true });
    element.playbackRate = isHoldSpeedActiveRef.current ? holdPlaybackRateRef.current : playbackRateRef.current;
    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      element.load();
    } else {
      handleLoadedMetadata();
      if (element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        handleCanPlay();
      }
    }
    if (pendingAutoPlayVideoIdRef.current === currentVideo.id) {
      pendingAutoPlayVideoIdRef.current = null;
      element.play().catch(() => {
        setMessage("浏览器没有开始播放当前视频，请再点一次播放按钮。");
      });
    }

    return () => {
      element.removeEventListener("loadedmetadata", handleLoadedMetadata);
      element.removeEventListener("canplay", handleCanPlay);
      element.removeEventListener("error", handleError);
    };
  }, [activeView, currentVideo?.id, currentVideoPlaybackUrl, updateVideoMetadata]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.volume = volume;
    element.muted = isMuted;
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      volume,
    };
    saveCurrentPlayerDataStore({ settings: playerSettingsRef.current }).catch(() => undefined);
  }, [currentVideo, isMuted, saveCurrentPlayerDataStore, volume]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.playbackRate = isHoldSpeedActive ? holdPlaybackRate : playbackRate;
  }, [holdPlaybackRate, isHoldSpeedActive, playbackRate]);

  useEffect(() => {
    const handleBeforeUnload = () => persistCurrentProgress();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [persistCurrentProgress]);

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element || !currentVideo) return;
    if (element.paused) {
      element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [currentVideo]);

  useEffect(() => {
    if (!currentVideo) {
      autoSubtitleSelectionVideoIdRef.current = null;
      lastSubtitleSelectionVideoIdRef.current = null;
      updateSelectedSubtitleId("off");
      return;
    }

    if (lastSubtitleSelectionVideoIdRef.current !== currentVideo.id) {
      lastSubtitleSelectionVideoIdRef.current = currentVideo.id;
      autoSubtitleSelectionVideoIdRef.current = currentVideo.id;
    }

    const shouldAutoSelectFromOff = autoSubtitleSelectionVideoIdRef.current === currentVideo.id;
    const nextSelection = resolveSubtitleSelection(selectedSubtitleId, currentVideoSubtitles, {
      autoSelectFromOff: shouldAutoSelectFromOff,
    });
    if (nextSelection !== selectedSubtitleId) {
      updateSelectedSubtitleId(nextSelection);
    }
    if (nextSelection !== "off" || (selectedSubtitleId !== "off" && nextSelection === selectedSubtitleId)) {
      autoSubtitleSelectionVideoIdRef.current = null;
    }
  }, [currentVideo, currentVideoSubtitles, selectedSubtitleId, updateSelectedSubtitleId]);

  const seekTo = useCallback(
    (value: number) => {
      const element = videoRef.current;
      if (!element || !Number.isFinite(element.duration)) return;
      const nextTime = clamp(value, 0, element.duration);
      element.currentTime = nextTime;
      setCurrentTime(nextTime);
      persistCurrentProgress();
    },
    [persistCurrentProgress],
  );

  const updateTimelinePreview = useCallback(
    (clientX: number, isDragging = false) => {
      const timeline = timelineRef.current;
      if (isPrivacyMode || !timeline || !currentVideo || duration <= 0) {
        setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
        return;
      }

      const rect = timeline.getBoundingClientRect();
      const ratio = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
      setTimelinePreview((previous) => ({
        ...previous,
        time: ratio * duration,
        left: ratio * 100,
        isVisible: true,
        isDragging,
      }));
    },
    [currentVideo, duration, isPrivacyMode],
  );

  const updateTimelinePreviewFromTime = useCallback(
    (time: number, isDragging = false) => {
      if (isPrivacyMode || !currentVideo || duration <= 0) {
        setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
        return;
      }

      const nextTime = clamp(time, 0, duration);
      setTimelinePreview((previous) => ({
        ...previous,
        time: nextTime,
        left: (nextTime / duration) * 100,
        isVisible: true,
        isDragging,
      }));
    },
    [currentVideo, duration, isPrivacyMode],
  );

  const hideTimelinePreview = useCallback(() => {
    setTimelinePreview((previous) =>
      previous.isDragging ? previous : { ...previous, isVisible: false, isDragging: false },
    );
  }, []);

  const stopTimelineDragPreview = useCallback(() => {
    setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
  }, []);

  const returnFocusToPlayer = useCallback(() => {
    playerRef.current?.focus({ preventScroll: true });
  }, []);

  const captureTimelineFrame = useCallback((time: number) => {
    const previewVideo = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (
      isPrivacyMode ||
      !previewVideo ||
      !canvas ||
      !currentVideo ||
      duration <= 0 ||
      previewVideo.readyState < HTMLMediaElement.HAVE_METADATA
    ) {
      return;
    }

    const requestId = timelineFrameRequestRef.current + 1;
    timelineFrameRequestRef.current = requestId;
    const targetTime = clamp(time, 0, Math.max(0, previewVideo.duration || duration));
    setTimelinePreview((previous) => (previous.isVisible ? { ...previous, isLoadingFrame: true } : previous));

    const drawFrame = () => {
      if (timelineFrameRequestRef.current !== requestId) return;
      const context = canvas.getContext("2d");
      const displaySize = getVideoDisplaySize(previewVideo.videoWidth, previewVideo.videoHeight);
      const sourceWidth = displaySize?.width;
      const sourceHeight = displaySize?.height;
      if (!context || !sourceWidth || !sourceHeight) return;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const drawLeft = (canvasWidth - drawWidth) / 2;
      const drawTop = (canvasHeight - drawHeight) / 2;

      context.fillStyle = "#050607";
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      context.drawImage(previewVideo, drawLeft, drawTop, drawWidth, drawHeight);
      const imageUrl = canvas.toDataURL("image/jpeg", 0.78);
      setTimelinePreview((previous) =>
        previous.isVisible ? { ...previous, imageUrl, isLoadingFrame: false } : previous,
      );
    };

    if (Math.abs(previewVideo.currentTime - targetTime) < 0.08 && previewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      drawFrame();
      return;
    }

    previewVideo.addEventListener("seeked", drawFrame, { once: true });
    previewVideo.currentTime = targetTime;
  }, [currentVideo, duration, isPrivacyMode]);

  useEffect(() => {
    if (timelineFrameTimerRef.current) {
      window.clearTimeout(timelineFrameTimerRef.current);
      timelineFrameTimerRef.current = null;
    }

    if (isPrivacyMode || !timelinePreview.isVisible || !currentVideo || duration <= 0) {
      timelineFrameRequestRef.current += 1;
      setTimelinePreview((previous) =>
        previous.imageUrl || previous.isLoadingFrame ? { ...previous, imageUrl: "", isLoadingFrame: false } : previous,
      );
      return;
    }

    timelineFrameTimerRef.current = window.setTimeout(() => {
      timelineFrameTimerRef.current = null;
      captureTimelineFrame(timelinePreview.time);
    }, 80);

    return () => {
      if (timelineFrameTimerRef.current) {
        window.clearTimeout(timelineFrameTimerRef.current);
        timelineFrameTimerRef.current = null;
      }
    };
  }, [captureTimelineFrame, currentVideo, duration, isPrivacyMode, timelinePreview.isVisible, timelinePreview.time]);

  const showDoubleClickFeedback = useCallback((side: "left" | "center" | "right", text: string) => {
    if (doubleClickFeedbackTimerRef.current) {
      window.clearTimeout(doubleClickFeedbackTimerRef.current);
    }
    setDoubleClickFeedback({ side, text });
    doubleClickFeedbackTimerRef.current = window.setTimeout(() => {
      setDoubleClickFeedback(null);
      doubleClickFeedbackTimerRef.current = null;
    }, doubleClickFeedbackDelay);
  }, []);

  const showPlayerOverlayFeedback = useCallback((text: string) => {
    if (playerOverlayFeedbackTimerRef.current) {
      window.clearTimeout(playerOverlayFeedbackTimerRef.current);
    }
    setPlayerOverlayFeedback(text);
    playerOverlayFeedbackTimerRef.current = window.setTimeout(() => {
      setPlayerOverlayFeedback("");
      playerOverlayFeedbackTimerRef.current = null;
    }, 900);
  }, []);

  const seekBy = useCallback(
    (seconds: number) => {
      const element = videoRef.current;
      if (!element || !Number.isFinite(element.duration)) return;
      seekTo(element.currentTime + seconds);
      if (isCinemaMode) {
        showPlayerOverlayFeedback(`${seconds > 0 ? "+" : ""}${seconds}s`);
      }
    },
    [isCinemaMode, seekTo, showPlayerOverlayFeedback],
  );

  const changeVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = clamp(nextVolume, 0, 1);
    setVolume(normalizedVolume);
    if (normalizedVolume > 0) {
      setIsMuted(false);
    }
    if (isCinemaMode) {
      showPlayerOverlayFeedback(`音量 ${Math.round(normalizedVolume * 100)}%`);
    }
  }, [isCinemaMode, showPlayerOverlayFeedback]);

  const adjustVolume = useCallback((delta: number) => {
    changeVolume(volume + delta);
  }, [changeVolume, volume]);

  const toggleMute = useCallback(() => {
    if (!currentVideo) return;
    setIsMuted((muted) => !muted);
  }, [currentVideo]);

  const chooseSubtitleFile = useCallback(async () => {
    if (!currentVideo) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.vtt,text/vtt,application/x-subrip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !isSubtitleFile(file.name)) return;
      try {
        const subtitle: SubtitleItem = {
          id: `manual:${currentVideo.id}:${file.name}|${file.size}|${file.lastModified}`,
          name: file.name,
          relativePath: file.name,
          file,
          url: "",
          isManual: true,
          source: "manual",
          videoId: currentVideo.id,
        };
        const subtitleWithUrl = {
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        };
        setSubtitles((previous) => {
          previous
            .filter((item) => item.isManual && item.id.startsWith(`manual:${currentVideo.id}:`))
            .forEach((item) => URL.revokeObjectURL(item.url));
          return [
            ...previous.filter((item) => !(item.isManual && item.id.startsWith(`manual:${currentVideo.id}:`))),
            subtitleWithUrl,
          ];
        });
        updateSelectedSubtitleId(subtitleWithUrl.id);
      } catch {
        setMessage("无法读取字幕文件，请确认字幕格式后重试。");
      }
    };
    input.click();
  }, [currentVideo]);

  const probeEmbeddedSubtitleTracksForVideo = useCallback(async (video: VideoItem, rootId: string) => {
    const payload = await fetchJson<{ tracks: EmbeddedSubtitleTrack[] }>("/api/subtitles/embedded/probe", {
      method: "POST",
      body: JSON.stringify({
        rootId,
        relativePath: video.relativePath,
      }),
    });
    return payload.tracks;
  }, []);

  const loadCachedEmbeddedSubtitlesForVideo = useCallback(
    async (video: VideoItem, rootId: string) => {
      const tracks = await probeEmbeddedSubtitleTracksForVideo(video, rootId);
      const restoredSubtitles = (
        await Promise.all(
          tracks
            .filter((track) => track.extractable)
            .map(async (track) => {
              try {
                const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/cached", {
                  method: "POST",
                  body: JSON.stringify({
                    rootId,
                    relativePath: video.relativePath,
                    streamIndex: track.streamIndex,
                  }),
                });
                if (!payload.text.trim()) return null;

                const language = track.language ? ` ${track.language}` : "";
                const title = track.title ? ` ${track.title}` : "";
                const subtitle: SubtitleItem = {
                  id: `embedded:${video.id}:${payload.id}`,
                  name: `内封字幕${language}${title}`.trim(),
                  relativePath: `${video.relativePath}#subtitle-${track.streamIndex}`,
                  url: "",
                  source: "embedded",
                  rawText: payload.text,
                  format: payload.format,
                  videoId: video.id,
                  embeddedTrack: track,
                };
                return {
                  ...subtitle,
                  url: await createSubtitleUrl(subtitle),
                };
              } catch {
                return null;
              }
            }),
        )
      ).filter((subtitle): subtitle is SubtitleItem => Boolean(subtitle));

      if (!restoredSubtitles.length) return;
      const restoredIds = new Set(restoredSubtitles.map((subtitle) => subtitle.id));
      subtitlesRef.current
        .filter((subtitle) => restoredIds.has(subtitle.id) && subtitle.url && isObjectUrl(subtitle.url))
        .forEach((subtitle) => URL.revokeObjectURL(subtitle.url));
      const nextSubtitles = [
        ...subtitlesRef.current.filter((subtitle) => !restoredIds.has(subtitle.id)),
        ...restoredSubtitles,
      ];
      subtitlesRef.current = nextSubtitles;
      setSubtitles(nextSubtitles);
      const nextSelection = resolveRestoredEmbeddedSubtitleSelection(
        selectedSubtitleIdRef.current,
        restoredSubtitles,
        video.id,
        autoSubtitleSelectionVideoIdRef.current,
      );
      if (nextSelection !== selectedSubtitleIdRef.current) {
        autoSubtitleSelectionVideoIdRef.current = null;
        updateSelectedSubtitleId(nextSelection);
      }
      void saveCurrentPlayerDataStore({
        embeddedSubtitles: createPersistedEmbeddedSubtitles(nextSubtitles),
      });
    },
    [probeEmbeddedSubtitleTracksForVideo, saveCurrentPlayerDataStore],
  );

  const loadEmbeddedSubtitleForVideo = useCallback(
    async (video: VideoItem, rootId: string, track: EmbeddedSubtitleTrack, options?: { select?: boolean }) => {
      if (!track.extractable) return null;
      const existing = subtitlesRef.current.find(
        (subtitle) =>
          subtitle.source === "embedded" &&
          subtitle.videoId === video.id &&
          subtitle.embeddedTrack?.streamIndex === track.streamIndex,
      );
      if (existing) {
        if (options?.select) updateSelectedSubtitleId(existing.id);
        return existing;
      }

      const payload = await fetchJson<ExtractedEmbeddedSubtitle>("/api/subtitles/embedded/extract", {
        method: "POST",
        body: JSON.stringify({
          rootId,
          relativePath: video.relativePath,
          streamIndex: track.streamIndex,
        }),
      });
      const language = track.language ? ` ${track.language}` : "";
      const title = track.title ? ` ${track.title}` : "";
      const subtitle: SubtitleItem = {
        id: `embedded:${video.id}:${payload.id}`,
        name: `内封字幕${language}${title}`.trim(),
        relativePath: `${video.relativePath}#subtitle-${track.streamIndex}`,
        url: "",
        source: "embedded",
        rawText: payload.text,
        format: payload.format,
        videoId: video.id,
        embeddedTrack: track,
      };
      const subtitleWithUrl = {
        ...subtitle,
        url: await createSubtitleUrl(subtitle),
      };
      const nextPersistedEmbeddedSubtitles = createPersistedEmbeddedSubtitles([
        ...subtitlesRef.current.filter((item) => item.id !== subtitleWithUrl.id),
        subtitleWithUrl,
      ]);
      setSubtitles((previous) => {
        previous
          .filter((item) => item.id === subtitleWithUrl.id)
          .forEach((item) => {
            if (item.url) URL.revokeObjectURL(item.url);
          });
        const nextSubtitles = [...previous.filter((item) => item.id !== subtitleWithUrl.id), subtitleWithUrl];
        subtitlesRef.current = nextSubtitles;
        return nextSubtitles;
      });
      void saveCurrentPlayerDataStore({
        embeddedSubtitles: nextPersistedEmbeddedSubtitles,
      });
      if (options?.select) updateSelectedSubtitleId(subtitleWithUrl.id);
      return subtitleWithUrl;
    },
    [saveCurrentPlayerDataStore],
  );

  useEffect(() => {
    if (!currentVideo || !currentMediaRootId || !canUseEmbeddedSubtitles) return;
    if (currentVideoSubtitles.some((subtitle) => subtitle.source === "embedded")) return;

    const lookupKey = `${currentMediaRootId}:${currentVideo.id}`;
    if (cachedEmbeddedSubtitleLookupKeysRef.current.has(lookupKey)) return;
    cachedEmbeddedSubtitleLookupKeysRef.current.add(lookupKey);
    void loadCachedEmbeddedSubtitlesForVideo(currentVideo, currentMediaRootId);
  }, [
    canUseEmbeddedSubtitles,
    currentMediaRootId,
    currentVideo,
    currentVideoSubtitles,
    loadCachedEmbeddedSubtitlesForVideo,
  ]);

  const probeEmbeddedSubtitles = useCallback(async () => {
    if (!currentVideo || !currentMediaRootId) {
      setEmbeddedSubtitleMessage("当前视频没有匹配到 config/app.json 中的媒体根路径。");
      return;
    }
    if (!localConfig?.ffmpeg.ffmpeg || !localConfig.ffmpeg.ffprobe) {
      setEmbeddedSubtitleMessage("未检测到系统 ffmpeg/ffprobe，请安装后重启开发服务。");
      return;
    }
    setIsEmbeddedSubtitleLoading(true);
    setEmbeddedSubtitleMessage("正在检测内封字幕...");
    try {
      const tracks = await probeEmbeddedSubtitleTracksForVideo(currentVideo, currentMediaRootId);
      setEmbeddedSubtitleTracks(tracks);
      setIsEmbeddedSubtitleDialogOpen(true);
      setEmbeddedSubtitleMessage(tracks.length ? "" : "没有检测到内封字幕轨。");
    } catch (error) {
      setEmbeddedSubtitleMessage(error instanceof Error ? error.message : "检测内封字幕失败。");
    } finally {
      setIsEmbeddedSubtitleLoading(false);
    }
  }, [currentMediaRootId, currentVideo, localConfig, probeEmbeddedSubtitleTracksForVideo]);

  const createCompatibleMedia = useCallback(async () => {
    if (!currentVideo || !currentMediaRootId) return;
    if (!canCreateCompatibleMedia || compatibleMediaVideoId) return;

    setCompatibleMediaVideoId(currentVideo.id);
    setCompatibleMediaMessage("正在生成兼容 MP4...");
    try {
      const payload = await fetchJson<CompatibleRemuxResponse>("/api/media/compatible/remux", {
        method: "POST",
        body: JSON.stringify({
          rootId: currentMediaRootId,
          relativePath: currentVideo.relativePath,
        }),
      });
      updateVideoPlayability(currentVideo.id, payload.playability);
      setCompatibleMediaMessage("已生成兼容 MP4，播放器将优先使用兼容版本。");
      setMessage("已生成兼容 MP4。");
    } catch (error) {
      setCompatibleMediaMessage(error instanceof Error ? error.message : "生成兼容 MP4 失败。");
    } finally {
      setCompatibleMediaVideoId(null);
    }
  }, [canCreateCompatibleMedia, compatibleMediaVideoId, currentMediaRootId, currentVideo, updateVideoPlayability]);

  const extractEmbeddedSubtitle = useCallback(
    async (track: EmbeddedSubtitleTrack) => {
      if (!currentVideo || !currentMediaRootId || !track.extractable) return;
      setIsEmbeddedSubtitleLoading(true);
      setEmbeddedSubtitleMessage("正在提取内封字幕...");
      try {
        await loadEmbeddedSubtitleForVideo(currentVideo, currentMediaRootId, track, { select: true });
        setIsEmbeddedSubtitleDialogOpen(false);
        setEmbeddedSubtitleMessage("已加载内封字幕。");
      } catch (error) {
        setEmbeddedSubtitleMessage(error instanceof Error ? error.message : "提取内封字幕失败。");
      } finally {
        setIsEmbeddedSubtitleLoading(false);
      }
    },
    [currentMediaRootId, currentVideo, loadEmbeddedSubtitleForVideo],
  );

  const loadSubtitleSummary = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    setAiTab("summary");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在生成字幕总结...");
    setSubtitleSummary("");
    try {
      const subtitleText = await readSubtitleText(selectedSubtitle);
      if (!subtitleText) throw new Error("当前字幕没有可分析的文本。");
      await readAiStream(
        "/api/ai/subtitles/summarize",
        {
          method: "POST",
          body: JSON.stringify({
            videoName: currentVideo.name,
            subtitleId: selectedSubtitle.id,
            subtitleText,
          }),
        },
        (event) => {
          if (event.type === "message") {
            setAiMessage(event.text);
            return;
          }
          if (event.type === "result") {
            setSubtitleSummary(event.text);
            return;
          }
          if (event.type === "delta") {
            setAiMessage("");
            setSubtitleSummary((previous) => previous + event.text);
          }
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "生成字幕总结失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [currentVideo, localConfig, selectedSubtitle]);

  const askSubtitleQuestion = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    const question = subtitleQuestion.trim();
    if (!question) {
      setAiMessage("请输入问题。");
      return;
    }
    setAiTab("qa");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在根据字幕片段回答...");
    setSubtitleAnswer("");
    try {
      const subtitleText = await readSubtitleText(selectedSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可检索的文本片段。");
      await readAiStream(
        "/api/ai/subtitles/ask",
        {
          method: "POST",
          body: JSON.stringify({
            videoName: currentVideo.name,
            question,
            chunks: selectRelevantSubtitleChunks(question, cues, currentTime),
          }),
        },
        (event) => {
          if (event.type === "message") {
            setAiMessage(event.text);
            return;
          }
          if (event.type === "result") {
            setSubtitleAnswer(event.text);
            return;
          }
          if (event.type === "delta") {
            setAiMessage("");
            setSubtitleAnswer((previous) => previous + event.text);
          }
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "字幕问答失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [currentTime, currentVideo, localConfig, selectedSubtitle, subtitleQuestion]);

  const loadProgressRecap = useCallback(async () => {
    if (!selectedSubtitle || !currentVideo) return;
    if (!localConfig?.ai.configured) {
      setAiMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    setAiTab("recap");
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiMessage("正在生成进度回顾...");
    setSubtitleRecap("");
    try {
      const subtitleText = await readSubtitleText(selectedSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可回顾的文本片段。");
      const viewedText = createViewedSubtitleText(cues, currentTime);
      if (!viewedText) throw new Error("当前时间前还没有可回顾的字幕内容。");
      await readAiStream(
        "/api/ai/subtitles/recap",
        {
          method: "POST",
          body: JSON.stringify({
            videoName: currentVideo.name,
            subtitleId: selectedSubtitle.id,
            currentTime,
            viewedText,
          }),
        },
        (event) => {
          if (event.type === "message") {
            setAiMessage(event.text);
            return;
          }
          if (event.type === "result") {
            setSubtitleRecap(event.text);
            return;
          }
          if (event.type === "delta") {
            setAiMessage("");
            setSubtitleRecap((previous) => previous + event.text);
          }
        },
      );
      setAiMessage("");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "生成进度回顾失败。");
    } finally {
      setIsAiLoading(false);
    }
  }, [currentTime, currentVideo, localConfig, selectedSubtitle]);

  useEffect(() => {
    setHomeProgressRecap("");
    setHomeProgressRecapMessage("");
    setHomeProgressRecapVideoId(homeRecapVideoId);
  }, [homeRecapVideoId]);

  const loadHomeProgressRecap = useCallback(async () => {
    if (!shouldShowHomeRecap || !homeRecapCard) return;
    if (!localConfig?.ai.configured) {
      setHomeProgressRecapMessage("未配置 DEEPSEEK_API_KEY。");
      return;
    }
    const progress = homeRecapCard.progress;
    if (!progress || !isResumableProgress(progress)) {
      setHomeProgressRecapMessage("当前没有可回顾的观看进度。");
      return;
    }

    setIsHomeProgressRecapLoading(true);
    setHomeProgressRecap("");
    setHomeProgressRecapMessage("正在生成无剧透回顾...");
    setHomeProgressRecapVideoId(homeRecapCard.video.id);
    try {
      let recapSubtitle = homeRecapSubtitle;
      if (!recapSubtitle) {
        if (!homeRecapMediaRootId || !localConfig?.ffmpeg.ffmpeg || !localConfig.ffmpeg.ffprobe) {
          throw new Error("当前视频没有可用于回顾的字幕。");
        }
        setHomeProgressRecapMessage("正在提取内封字幕...");
        const tracks = await probeEmbeddedSubtitleTracksForVideo(homeRecapCard.video, homeRecapMediaRootId);
        const textTrack = tracks.find((track) => track.extractable);
        if (!textTrack) throw new Error("当前视频没有可提取的文本内封字幕。");
        recapSubtitle = await loadEmbeddedSubtitleForVideo(homeRecapCard.video, homeRecapMediaRootId, textTrack);
        if (!recapSubtitle) throw new Error("当前视频没有可用于回顾的字幕。");
        setHomeProgressRecapMessage("正在生成无剧透回顾...");
      }
      const subtitleText = await readSubtitleText(recapSubtitle);
      const cues = parseSubtitleCues(subtitleText);
      if (!cues.length) throw new Error("当前字幕没有可回顾的文本片段。");
      const viewedText = createViewedSubtitleText(cues, progress.currentTime);
      if (!viewedText) throw new Error("当前进度前还没有可回顾的字幕内容。");
      await readAiStream(
        "/api/ai/subtitles/recap",
        {
          method: "POST",
          body: JSON.stringify({
            videoName: homeRecapCard.video.name,
            subtitleId: recapSubtitle.id,
            currentTime: progress.currentTime,
            viewedText,
          }),
        },
        (event) => {
          if (event.type === "message") {
            setHomeProgressRecapMessage(event.text);
            return;
          }
          if (event.type === "result") {
            setHomeProgressRecap(event.text);
            return;
          }
          if (event.type === "delta") {
            setHomeProgressRecapMessage("");
            setHomeProgressRecap((previous) => previous + event.text);
          }
        },
      );
      setHomeProgressRecapMessage("");
    } catch (error) {
      setHomeProgressRecapMessage(error instanceof Error ? error.message : "生成无剧透回顾失败。");
    } finally {
      setIsHomeProgressRecapLoading(false);
    }
  }, [
    homeRecapCard,
    homeRecapMediaRootId,
    homeRecapSubtitle,
    loadEmbeddedSubtitleForVideo,
    localConfig,
    probeEmbeddedSubtitleTracksForVideo,
    shouldShowHomeRecap,
  ]);

  const runLibrarySearch = useCallback(async () => {
    const query = librarySearchQuery.trim();
    setLibrarySearchAnswer("");
    if (!query) {
      setLibrarySearchMode("idle");
      setLibrarySearchMessage("输入片名、关键词或想看的内容。");
      setLibrarySearchResults([]);
      setLibrarySearchVisibleCount(librarySearchResultPageSize);
      setLibrarySearchSubmittedQuery("");
      return;
    }

    setLibrarySearchSubmittedQuery(query);
    setLibrarySearchVisibleCount(librarySearchResultPageSize);
    const localResults = searchLibraryLocally(query);
    setLibrarySearchResults(localResults);
    const needsAi = Boolean(localConfig?.ai.configured) && shouldUseAiLibrarySearch(query, localResults);
    if (!needsAi) {
      setLibrarySearchMode(localResults.length ? "local" : "empty");
      setLibrarySearchMessage(
        localResults.length
          ? "本地检索已命中，未调用大模型。"
          : localConfig?.ai.configured
            ? "本地没有找到匹配结果。"
            : "本地没有找到匹配结果，且未配置 DEEPSEEK_API_KEY。",
      );
      return;
    }

    setIsLibrarySearchLoading(true);
    setLibrarySearchMode("ai");
    setLibrarySearchMessage("本地匹配不足，正在调用 AI 分析候选片库...");
    try {
      const candidates = createLibrarySearchCandidates(localResults);
      if (!candidates.length) throw new Error("当前片库没有可搜索的视频。");
      const response = await fetchJson<LibraryAiSearchResponse>("/api/ai/library/search", {
        method: "POST",
        body: JSON.stringify({ query, candidates }),
      });
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const aiResultsByKey = new Map<string, LibrarySearchResult>();
      response.matchIds
        .map((id) => candidateById.get(id))
        .filter((candidate): candidate is LibrarySearchCandidate => Boolean(candidate))
        .forEach((candidate, index) => {
          const video = modeFilteredVideos.find((item) => item.id === candidate.id);
          if (!video) return;
          const key = libraryFolderKeyForVideo(video);
          if (aiResultsByKey.has(key)) return;
          aiResultsByKey.set(
            key,
            createLibraryFolderResult(videosByLibraryFolderKey.get(key) ?? [video], video, 100 - index, "AI 推荐"),
          );
        });
      const aiResults = Array.from(aiResultsByKey.values());
      setLibrarySearchResults(aiResults.length ? aiResults : localResults);
      setLibrarySearchVisibleCount(librarySearchResultPageSize);
      setLibrarySearchAnswer(response.answer);
      setLibrarySearchMessage(aiResults.length ? "AI 已从本地候选中挑选结果。" : "AI 未返回明确条目，保留本地结果。");
    } catch (error) {
      setLibrarySearchMode(localResults.length ? "local" : "empty");
      setLibrarySearchResults(localResults);
      setLibrarySearchVisibleCount(librarySearchResultPageSize);
      setLibrarySearchMessage(error instanceof Error ? error.message : "AI 搜索失败，已保留本地结果。");
    } finally {
      setIsLibrarySearchLoading(false);
    }
  }, [
    createLibraryFolderResult,
    createLibrarySearchCandidates,
    librarySearchQuery,
    localConfig,
    modeFilteredVideos,
    searchLibraryLocally,
    videosByLibraryFolderKey,
  ]);

  const librarySearchPreviewResults = useMemo(() => {
    const query = librarySearchQuery.trim();
    if (!query || query === librarySearchSubmittedQuery) return [];
    return searchLibraryLocally(query, 3);
  }, [librarySearchQuery, librarySearchSubmittedQuery, searchLibraryLocally]);
  const shouldShowLibrarySearchPreview = Boolean(librarySearchQuery.trim() && librarySearchQuery.trim() !== librarySearchSubmittedQuery);
  const { visibleResults: visibleLibrarySearchResults, hasMoreResults: hasMoreLibrarySearchResults } = useMemo(
    () => getVisibleLibrarySearchResults(librarySearchResults, librarySearchVisibleCount),
    [librarySearchResults, librarySearchVisibleCount],
  );
  const loadMoreLibrarySearchResults = useCallback(() => {
    setLibrarySearchVisibleCount((count) => Math.min(count + librarySearchResultPageSize, librarySearchResults.length));
  }, [librarySearchResults.length]);

  useEffect(() => {
    if (!hasMoreLibrarySearchResults || !librarySearchResultsRef.current || !librarySearchLoadMoreRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;
    const root = librarySearchResultsRef.current;
    const target = librarySearchLoadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreLibrarySearchResults();
      },
      { root, rootMargin: "40px 0px 80px", threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreLibrarySearchResults, loadMoreLibrarySearchResults, visibleLibrarySearchResults.length]);

  const loadCacheStatus = useCallback(async () => {
    setIsCacheStatusLoading(true);
    setCacheStatusMessage("");
    try {
      const status = await fetchJson<CacheStatus>("/api/cache-status");
      setCacheStatus(status);
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "读取缓存状态失败。");
    } finally {
      setHasLoadedCacheStatus(true);
      setIsCacheStatusLoading(false);
    }
  }, []);

  const cacheStatusItems = cacheStatus?.items ?? [];
  const selectedCacheItems = useMemo(
    () => cacheStatusItems.filter((item) => selectedCacheItemIds.has(item.id)),
    [cacheStatusItems, selectedCacheItemIds],
  );
  const selectedCacheBytes = selectedCacheItems.reduce((sum, item) => sum + item.bytes, 0);
  const selectedCacheFiles = selectedCacheItems.reduce((sum, item) => sum + item.files, 0);
  const isAllCacheSelected = cacheStatusItems.length > 0 && cacheStatusItems.every((item) => selectedCacheItemIds.has(item.id));
  const cacheStatusPageCount = Math.max(1, Math.ceil(cacheStatusItems.length / cacheStatusPageSize));
  const visibleCacheStatusPage = Math.min(Math.max(cacheStatusPage, 1), cacheStatusPageCount);
  const pagedCacheStatusItems = useMemo(() => {
    const start = (visibleCacheStatusPage - 1) * cacheStatusPageSize;
    return cacheStatusItems.slice(start, start + cacheStatusPageSize);
  }, [cacheStatusItems, visibleCacheStatusPage]);
  const cacheStatusPageStart = cacheStatusItems.length ? (visibleCacheStatusPage - 1) * cacheStatusPageSize + 1 : 0;
  const cacheStatusPageEnd = Math.min(visibleCacheStatusPage * cacheStatusPageSize, cacheStatusItems.length);

  useEffect(() => {
    if (!cacheStatus) return;
    const availableIds = new Set(cacheStatus.items.map((item) => item.id));
    setSelectedCacheItemIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [cacheStatus]);

  useEffect(() => {
    setCacheStatusPage((page) => Math.min(Math.max(page, 1), cacheStatusPageCount));
  }, [cacheStatusPageCount]);

  const toggleCacheItemSelection = useCallback((id: string, checked: boolean) => {
    setSelectedCacheItemIds((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleAllCacheItems = useCallback(() => {
    setSelectedCacheItemIds((previous) => {
      if (!cacheStatusItems.length) return previous;
      const shouldSelectAll = !cacheStatusItems.every((item) => previous.has(item.id));
      return shouldSelectAll ? new Set(cacheStatusItems.map((item) => item.id)) : new Set();
    });
  }, [cacheStatusItems]);

  const requestClearSelectedCache = useCallback(() => {
    if (!selectedCacheItems.length) return;
    setIsClearCacheConfirmOpen(true);
  }, [selectedCacheItems.length]);

  const confirmClearSelectedCache = useCallback(async () => {
    if (!selectedCacheItems.length) return;
    const shouldClearRecentFolder = isAllCacheSelected;
    setIsClearingCache(true);
    setCacheStatusMessage("");
    try {
      const response = await fetchJson<ClearCacheResponse>("/api/cache-status/clear", {
        method: "POST",
        body: JSON.stringify({ ids: selectedCacheItems.map((item) => item.id) }),
      });
      setCacheStatus(response.status);
      setSelectedCacheItemIds(new Set());
      setIsClearCacheConfirmOpen(false);
      if (response.cleared.some((id) => id === "global" || id === "libraries" || id === "index")) {
        clearCurrentLibraryRuntimeData();
      }
      if (shouldClearRecentFolder) {
        await clearRecentFolderHandle().catch(() => undefined);
        await clearPhotoAlbumFolderHandle().catch(() => undefined);
        clearLoadedMedia();
        directoryRef.current = null;
        libraryIdRef.current = null;
        libraryMetadataRef.current = undefined;
        setLibraryId(null);
        setMediaRootId(null);
        setActiveView("home");
      }
      setCacheStatusMessage(`已清除 ${response.cleared.length} 项缓存。`);
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "清除缓存失败。");
    } finally {
      setIsClearingCache(false);
    }
  }, [clearCurrentLibraryRuntimeData, clearLoadedMedia, isAllCacheSelected, selectedCacheItems]);

  const openCacheStatusDialog = useCallback(() => {
    setCacheStatusPage(1);
    setIsCacheStatusDialogOpen(true);
    void loadCacheStatus();
  }, [loadCacheStatus]);

  useEffect(() => {
    if (!isHomeViewVisible || hasLoadedCacheStatus || isCacheStatusLoading) return;
    void loadCacheStatus();
  }, [hasLoadedCacheStatus, isCacheStatusLoading, isHomeViewVisible, loadCacheStatus]);

  const toggleShortcutDialog = useCallback(() => {
    setIsShortcutDialogOpen((open) => !open);
  }, []);

  const enterPrivacyMode = useCallback(() => {
    const element = videoRef.current;
    privacyResumePlaybackRef.current = currentVideo
      ? {
          videoId: currentVideo.id,
          shouldResume: Boolean(element && !element.paused && !element.ended),
        }
      : null;
    persistCurrentProgress();
    resetHoldSpeedState();
    setIsShortcutDialogOpen(false);
    setDeleteCandidate(null);
    setPhotoDeleteCandidate(null);
    setPhotoDeleteError("");
    setIsPhotoDeletePending(false);
    setIsFolderDialogOpen(false);
    setTimelinePreview({
      time: 0,
      left: 0,
      isVisible: false,
      isDragging: false,
      imageUrl: "",
      isLoadingFrame: false,
    });
    element?.pause();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setIsPrivacyMode(true);
    setMessage("隐私模式已开启");
  }, [currentVideo, persistCurrentProgress, resetHoldSpeedState]);

  const exitPrivacyMode = useCallback(() => {
    const resumePlayback = privacyResumePlaybackRef.current;
    privacyResumePlaybackRef.current = null;
    setIsPrivacyMode(false);
    setMessage(currentVideo ? "已恢复播放界面" : "选择一个本地文件夹开始播放");
    focusPlayer();
    if (currentVideo && resumePlayback?.videoId === currentVideo.id && resumePlayback.shouldResume) {
      window.setTimeout(() => {
        videoRef.current?.play().catch(() => {
          setMessage("浏览器没有恢复播放，请再点一次播放按钮。");
        });
      }, 0);
    }
  }, [currentVideo, focusPlayer]);

  const togglePrivacyMode = useCallback(() => {
    if (isPrivacyMode) {
      exitPrivacyMode();
    } else {
      enterPrivacyMode();
    }
  }, [enterPrivacyMode, exitPrivacyMode, isPrivacyMode]);

  const toggleFullscreen = useCallback(async () => {
    if (!playerRef.current || !currentVideo) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current.requestFullscreen();
      }
    } catch {
      setMessage("无法进入全屏模式");
    }
  }, [currentVideo]);

  const handlePlayerDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!currentVideo || event.button !== 0 || event.target !== videoRef.current) return;
      event.preventDefault();
      event.stopPropagation();

      const frame = playerRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;

      if (ratio < 0.35) {
        seekBy(-seekStep);
        showDoubleClickFeedback("left", `-${seekStep}s`);
      } else if (ratio > 0.65) {
        seekBy(seekStep);
        showDoubleClickFeedback("right", `+${seekStep}s`);
      } else {
        void toggleFullscreen();
        showDoubleClickFeedback("center", document.fullscreenElement ? "退出全屏" : "全屏");
      }
    },
    [currentVideo, seekBy, seekStep, showDoubleClickFeedback, toggleFullscreen],
  );

  const handlePlayerWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!currentVideo || event.deltaY === 0) return;
      event.preventDefault();
      revealControls();
      adjustVolume(event.deltaY < 0 ? volumeStep : -volumeStep);
    },
    [adjustVolume, currentVideo, revealControls],
  );

  const startHoldSpeed = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;

    didHoldSpeedStartPlaybackRef.current = false;
    wasHoldSpeedPlaybackPausedRef.current = element.paused;
    element.playbackRate = holdPlaybackRateRef.current;
    isHoldSpeedActiveRef.current = true;
    setIsHoldSpeedActive(true);

    if (element.paused) {
      didHoldSpeedStartPlaybackRef.current = true;
      element.play().catch(() => {
        didHoldSpeedStartPlaybackRef.current = false;
        wasHoldSpeedPlaybackPausedRef.current = false;
      });
    }
  }, []);

  const stopHoldSpeed = useCallback(() => {
    const element = videoRef.current;
    const shouldRestorePaused = didHoldSpeedStartPlaybackRef.current && wasHoldSpeedPlaybackPausedRef.current;
    isHoldSpeedActiveRef.current = false;
    if (element) {
      element.playbackRate = playbackRateRef.current;
    }
    didHoldSpeedStartPlaybackRef.current = false;
    wasHoldSpeedPlaybackPausedRef.current = false;
    setIsHoldSpeedActive(false);
    if (shouldRestorePaused) {
      element?.pause();
    }
  }, []);

  const clearRightKeyHoldTimer = useCallback(() => {
    if (!rightKeyHoldTimerRef.current) return;
    window.clearTimeout(rightKeyHoldTimerRef.current);
    rightKeyHoldTimerRef.current = null;
  }, []);

  const clearRightMouseHoldTimer = useCallback(() => {
    if (!rightMouseHoldTimerRef.current) return;
    window.clearTimeout(rightMouseHoldTimerRef.current);
    rightMouseHoldTimerRef.current = null;
  }, []);

  const stopRightMouseHoldSpeed = useCallback(() => {
    clearRightMouseHoldTimer();
    if (!isRightMouseDownRef.current && !didRightMouseHoldRef.current) return;
    isRightMouseDownRef.current = false;
    didRightMouseHoldRef.current = false;
    rightMousePointerIdRef.current = null;
    stopHoldSpeed();
  }, [clearRightMouseHoldTimer, stopHoldSpeed]);

  const handlePlayerContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== videoRef.current) return;
    event.preventDefault();
  }, []);

  const handlePlayerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!currentVideo || event.button !== 2 || event.target !== videoRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      revealControls();
      if (isRightMouseDownRef.current) return;

      isRightMouseDownRef.current = true;
      didRightMouseHoldRef.current = false;
      rightMousePointerIdRef.current = event.pointerId;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      clearRightMouseHoldTimer();
      rightMouseHoldTimerRef.current = window.setTimeout(() => {
        const element = videoRef.current;
        if (!element || !isRightMouseDownRef.current) return;
        didRightMouseHoldRef.current = true;
        startHoldSpeed();
        rightMouseHoldTimerRef.current = null;
      }, rightKeyHoldDelay);
    },
    [clearRightMouseHoldTimer, currentVideo, revealControls, startHoldSpeed],
  );

  const handlePlayerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 2 || !isRightMouseDownRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      clearRightMouseHoldTimer();
      if (rightMousePointerIdRef.current === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      stopRightMouseHoldSpeed();
    },
    [clearRightMouseHoldTimer, stopRightMouseHoldSpeed],
  );

  const handlePlayerPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (rightMousePointerIdRef.current === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        stopRightMouseHoldSpeed();
      }
    },
    [stopRightMouseHoldSpeed],
  );

  useEffect(() => {
    const handleWindowMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        stopRightMouseHoldSpeed();
      }
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [stopRightMouseHoldSpeed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeShortcuts = playerPreferencesRef.current.shortcuts;
      const eventCode = shortcutCodeFromEvent(event);
      if (event.key === "Escape" && autoNextPrompt) {
        event.preventDefault();
        cancelAutoNextPrompt();
        return;
      }

      if (event.key === "Escape" && deleteCandidate) {
        event.preventDefault();
        setDeleteCandidate(null);
        return;
      }

      if (event.key === "Escape" && photoDeleteCandidate && !isPhotoDeletePending) {
        event.preventDefault();
        setPhotoDeleteCandidate(null);
        setPhotoDeleteError("");
        return;
      }

      if (event.key === "Escape" && isClearCacheConfirmOpen) {
        event.preventDefault();
        setIsClearCacheConfirmOpen(false);
        return;
      }

      if (event.key === "Escape" && isShortcutDialogOpen) {
        event.preventDefault();
        setIsShortcutDialogOpen(false);
        return;
      }

      if (event.key === "Escape" && isPrivacyMode) {
        event.preventDefault();
        exitPrivacyMode();
        return;
      }

      if (event.key === "Escape" && isCinemaMode) {
        event.preventDefault();
        toggleCinemaMode();
        return;
      }

      if (activeView === "photoViewer" && selectedPhotoAlbum && !isFormControl(event.target)) {
        if (event.key === "Escape") {
          event.preventDefault();
          showPhotoAlbumList();
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          movePhoto(-1);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          movePhoto(1);
          return;
        }
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          if (!event.repeat) void togglePhotoFullscreen();
          return;
        }
        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (!event.repeat) togglePhotoAlbumFavorite(selectedPhotoAlbum);
          return;
        }
      }

      if (eventCode === activeShortcuts.toggleShortcuts && !isFormControl(event.target)) {
        event.preventDefault();
        toggleShortcutDialog();
        return;
      }

      if (eventCode === activeShortcuts.togglePrivacy && !isFormControl(event.target)) {
        event.preventDefault();
        if (!event.repeat) {
          togglePrivacyMode();
        }
        return;
      }

      if (eventCode === activeShortcuts.toggleCinema && !isFormControl(event.target)) {
        event.preventDefault();
        if (!event.repeat) {
          toggleCinemaMode();
        }
        return;
      }

      if (!currentVideo || isShortcutDialogOpen || deleteCandidate || photoDeleteCandidate || isFormControl(event.target)) return;

      if (isPrivacyMode) {
        if (eventCode === activeShortcuts.seekBackward) {
          event.preventDefault();
          seekBy(-seekStep);
        } else if (eventCode === activeShortcuts.seekForward) {
          event.preventDefault();
          seekBy(seekStep);
        }
        return;
      }

      if (eventCode === activeShortcuts.togglePlay) {
        event.preventDefault();
        if (!event.repeat) {
          togglePlay();
        }
        return;
      }

      if (eventCode === activeShortcuts.toggleMute) {
        event.preventDefault();
        if (!event.repeat) {
          toggleMute();
        }
        return;
      }

      if (eventCode === activeShortcuts.toggleFullscreen) {
        event.preventDefault();
        if (!event.repeat) {
          void toggleFullscreen();
        }
        return;
      }

      if (eventCode === activeShortcuts.toggleFavorite) {
        event.preventDefault();
        if (!event.repeat) {
          toggleCurrentFavorite();
        }
        return;
      }

      if (eventCode === activeShortcuts.markCompleted) {
        event.preventDefault();
        if (!event.repeat) {
          markCurrentVideoCompleted();
        }
        return;
      }

      if (eventCode === activeShortcuts.playNext) {
        event.preventDefault();
        if (!event.repeat) {
          playNext();
        }
        return;
      }

      if (eventCode === activeShortcuts.seekBackward) {
        event.preventDefault();
        seekBy(-seekStep);
      } else if (eventCode === activeShortcuts.holdSpeed) {
        event.preventDefault();
        if (event.repeat || isRightKeyDownRef.current) return;
        isRightKeyDownRef.current = true;
        didRightKeyHoldRef.current = false;
        clearRightKeyHoldTimer();
        rightKeyHoldTimerRef.current = window.setTimeout(() => {
          didRightKeyHoldRef.current = true;
          startHoldSpeed();
          rightKeyHoldTimerRef.current = null;
        }, rightKeyHoldDelay);
      } else if (eventCode === activeShortcuts.seekForward) {
        event.preventDefault();
        seekBy(seekStep);
      } else if (eventCode === activeShortcuts.volumeUp) {
        event.preventDefault();
        adjustVolume(volumeStep);
      } else if (eventCode === activeShortcuts.volumeDown) {
        event.preventDefault();
        adjustVolume(-volumeStep);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const activeShortcuts = playerPreferencesRef.current.shortcuts;
      if (shortcutCodeFromEvent(event) !== activeShortcuts.holdSpeed || !isRightKeyDownRef.current) return;
      event.preventDefault();
      clearRightKeyHoldTimer();
      isRightKeyDownRef.current = false;
      if (didRightKeyHoldRef.current) {
        didRightKeyHoldRef.current = false;
        stopHoldSpeed();
      } else if (
        currentVideo &&
        activeShortcuts.holdSpeed === activeShortcuts.seekForward &&
        !isFormControl(event.target)
      ) {
        seekBy(seekStep);
      }
    };

    const handleBlur = () => {
      clearRightKeyHoldTimer();
      isRightKeyDownRef.current = false;
      didRightKeyHoldRef.current = false;
      stopRightMouseHoldSpeed();
      stopHoldSpeed();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    adjustVolume,
    activeView,
    autoNextPrompt,
    cancelAutoNextPrompt,
    clearRightKeyHoldTimer,
    currentVideo,
    seekBy,
    seekStep,
    stopHoldSpeed,
    startHoldSpeed,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    toggleCurrentFavorite,
    toggleShortcutDialog,
    stopRightMouseHoldSpeed,
    deleteCandidate,
    exitPrivacyMode,
    photoDeleteCandidate,
    isPhotoDeletePending,
    isCinemaMode,
    isClearCacheConfirmOpen,
    isPrivacyMode,
    isShortcutDialogOpen,
    markCurrentVideoCompleted,
    movePhoto,
    playNext,
    selectedPhotoAlbum,
    showPhotoAlbumList,
    toggleCinemaMode,
    togglePhotoAlbumFavorite,
    togglePhotoFullscreen,
    togglePrivacyMode,
  ]);

  useEffect(() => {
    if (!isHoldSpeedActive) return;
    window.addEventListener("blur", stopHoldSpeed);
    return () => {
      window.removeEventListener("blur", stopHoldSpeed);
    };
  }, [isHoldSpeedActive, stopHoldSpeed]);

  useEffect(() => {
    return () => {
      if (doubleClickFeedbackTimerRef.current) {
        window.clearTimeout(doubleClickFeedbackTimerRef.current);
      }
      if (playerOverlayFeedbackTimerRef.current) {
        window.clearTimeout(playerOverlayFeedbackTimerRef.current);
      }
      if (rightMouseHoldTimerRef.current) {
        window.clearTimeout(rightMouseHoldTimerRef.current);
      }
      if (autoNextTimerRef.current) {
        window.clearTimeout(autoNextTimerRef.current);
      }
    };
  }, []);

  const togglePictureInPicture = async () => {
    const element = videoRef.current;
    if (!element || !document.pictureInPictureEnabled) {
      setMessage("当前浏览器不支持画中画");
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await element.requestPictureInPicture();
      }
    } catch {
      setMessage("无法进入画中画模式");
    }
  };

  const rotateVideoClockwise = () => {
    if (!currentVideo) return;
    setVideoRotation((rotation) => (rotation + 90) % 360);
  };

  const handleDurationChange = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const nextDuration = event.currentTarget.duration || 0;
    setDuration(nextDuration);
    if (!currentVideo || !Number.isFinite(nextDuration) || nextDuration <= 0) return;
    updateSpecialVideoStats(currentVideo, (stats) => ({
      ...stats,
      durationSeconds: nextDuration,
      updatedAt: Date.now(),
    }));
  };

  const handleTimeUpdate = () => {
    const element = videoRef.current;
    if (!element || !currentVideo) return;
    setCurrentTime(element.currentTime);
    setDuration(element.duration || 0);

    if (saveTimerRef.current) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      updateProgress(currentVideo, element.currentTime, element.duration || 0);
      recordPlaybackProgressForStats(currentVideo, element.currentTime, element.duration || 0);
    }, 1500);
  };

  const handleEnded = () => {
    persistCurrentProgress(true);
    recordPlaybackEndedForStats();
    setIsPlaying(false);

    if (playbackMode === "single-loop") {
      const element = videoRef.current;
      if (!element) return;
      element.currentTime = 0;
      setCurrentTime(0);
      element.play().catch(() => undefined);
      return;
    }

    const nextVideoId = getNextVideoId(playbackMode);
    if (!nextVideoId) {
      if ((playbackMode === "favorites-only" || playlistFilter === "favorites") && !favoritePlaylistVideos.length) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    startAutoNextPrompt(nextVideoId);
  };

  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const primaryHomeTitle = primaryResumeCard ? "继续观看" : modeFilteredVideos.length ? "开始观看" : "准备播放";
  const primaryHomeAction = primaryResumeCard ? "继续播放" : "播放第一个视频";
  const formatHomeProgressLabel = (card: HomeVideoCard) => {
    if (card.progress?.completed) return "已看完";
    if (!card.progress) return "未开始";
    const total = card.progress.duration || card.video.duration || 0;
    return `${formatTime(card.progress.currentTime)} / ${formatTime(total)}`;
  };
  const formatHomeMeta = (card: HomeVideoCard) => {
    const prefix = card.mediaRootLabel ? `${card.mediaRootLabel} · ` : "";
    if (card.progress?.updatedAt) return `${prefix}${formatHomeProgressLabel(card)} · ${formatRelativeTime(card.progress.updatedAt)}`;
    if (card.video.duration) return `${prefix}未开始 · ${formatTime(card.video.duration)}`;
    return `${prefix}未开始`;
  };
  const homeCardThumbnail = (card: HomeVideoCard, fallbackIndex?: number) => (
    <span className={`home-card-thumbnail ${card.video.thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
      {card.video.thumbnailUrl ? (
        <img src={card.video.thumbnailUrl} alt="" draggable={false} />
      ) : (
        <span>{typeof fallbackIndex === "number" ? String(fallbackIndex + 1).padStart(2, "0") : <Play size={24} />}</span>
      )}
    </span>
  );
  const renderTagChips = (tags: string[], options?: { limit?: number; compact?: boolean }) => {
    const visibleTags = tags.slice(0, options?.limit ?? 3);
    if (!visibleTags.length) return null;
    return (
      <span className={`tag-chip-row ${options?.compact ? "compact" : ""}`}>
        {visibleTags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
          </span>
        ))}
        {tags.length > visibleTags.length ? <span className="tag-chip more">+{tags.length - visibleTags.length}</span> : null}
      </span>
    );
  };
  const renderHomeListCard = (card: HomeVideoCard, index: number) => (
    <button
      key={card.video.id}
      className="home-list-card"
      type="button"
      onClick={() => openVideoFromHome(card.video)}
      title={videoMetadataTitle(card.video)}
    >
      {homeCardThumbnail(card, index)}
      <span className="home-list-copy">
        <strong>{card.video.name}</strong>
        <small>{formatHomeMeta(card)}</small>
        {renderTagChips(card.tags ?? [], { limit: 3, compact: true })}
      </span>
    </button>
  );
  const renderLibraryFolderResult = (result: LibrarySearchResult) => {
    const unfinishedCount = result.videos.filter(({ progress }) => !progress?.completed).length;
    const resumableCount = result.videos.filter(({ progress }) => isResumableProgress(progress)).length;
    const statusLabel = resumableCount
      ? `${resumableCount} 个可继续`
      : unfinishedCount
        ? `${unfinishedCount} 个未看完`
        : "已看完";
    return (
      <button
        key={result.key}
        className="library-folder-result"
        type="button"
        onClick={() => openLibraryFolderFromSearch(result)}
        title={result.path || result.title}
      >
        <span className="library-folder-icon" aria-hidden="true">
          <Folder size={20} />
        </span>
        <span className="library-folder-copy">
          <strong>{result.title}</strong>
          <small>{result.videos.length} 集 · {statusLabel} · {result.reason}</small>
          {result.path || result.mediaRootLabel ? (
            <small>{[result.mediaRootLabel, result.path].filter(Boolean).join(" · ")}</small>
          ) : null}
        </span>
      </button>
    );
  };
  const formatPhotoAlbumProgress = (album: PhotoAlbum) => {
    const progress = photoAlbumProgress[album.id];
    if (progress?.completed) return "已读完";
    if (!progress) return "未开始";
    return `看到 ${Math.min(progress.imageIndex + 1, album.imageCount)} / ${album.imageCount}`;
  };
  const getPhotoImageUrl = (image?: PhotoAlbumImage | null) => (image ? image.url || photoObjectUrls[image.id] || "" : "");
  const renderPhotoAlbumCard = (album: PhotoAlbum) => {
    const progress = photoAlbumProgress[album.id];
    const progressPercent = progress ? Math.min(100, ((progress.imageIndex + 1) / Math.max(album.imageCount, 1)) * 100) : 0;
    const isFavorite = favoritePhotoAlbumIds.has(album.id);
    const coverImageUrl = album.coverImageUrl || getPhotoImageUrl(album.images[0]);
    return (
      <article className="photo-album-card" key={album.id}>
        <button className="photo-album-cover" type="button" onClick={() => openPhotoAlbum(album)} title={album.relativePath || album.title}>
          {coverImageUrl ? <img src={coverImageUrl} alt="" loading="lazy" draggable={false} /> : null}
          <span className="photo-album-count">{album.imageCount} 张</span>
        </button>
        <div className="photo-album-copy">
          <div className="photo-album-title-row">
            <button type="button" onClick={() => openPhotoAlbum(album)} title={album.title}>
              {album.title}
            </button>
            <button
              className={`icon-button photo-favorite-button ${isFavorite ? "active" : ""}`}
              type="button"
              onClick={() => togglePhotoAlbumFavorite(album)}
              title={isFavorite ? "取消收藏" : "收藏写真集"}
              aria-label={isFavorite ? "取消收藏" : "收藏写真集"}
            >
              <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
          <span>{album.mediaRootLabel} · {album.relativePath || "根目录"}</span>
          <span>{formatPhotoAlbumProgress(album)} · {formatFileSize(album.totalSize)} · {formatRelativeTime(album.updatedAt)}</span>
          <div className="home-progress" aria-label={formatPhotoAlbumProgress(album)}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="photo-album-actions">
            <button className="secondary-button" type="button" onClick={() => openPhotoAlbum(album)}>
              打开
            </button>
            {progress ? (
              <button className="secondary-button" type="button" onClick={() => openPhotoAlbum(album, { fromBeginning: true })}>
                从头
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
  };
  const currentPhoto = selectedPhotoAlbum?.images[currentPhotoIndex] ?? null;
  const currentPhotoUrl = getPhotoImageUrl(currentPhoto);

  return (
    <>
    <main
      className={`app-shell theme-${theme} ${isDragActive ? "drag-active" : ""} ${isPrivacyMode ? "privacy-mode" : ""} ${isCinemaMode ? "cinema-mode" : ""} ${isNonPlayerViewVisible ? "home-view" : ""}`}
      ref={appShellRef}
      style={shellStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <FolderOpen size={42} />
          <span>松开以打开视频或文件夹</span>
        </div>
      ) : null}
      <section className="player-column" ref={playerColumnRef}>
        <header className="top-bar" ref={topBarRef}>
          <div className="video-summary">
            {currentVideo && !isPrivacyMode && !isNonPlayerViewVisible ? (
              <>
                <dl className="current-video-meta">
                  {videoMetadataRows(currentVideo).map(([label, value]) => (
                    <div key={label} className={label === "文件名" ? "current-video-file-chip" : undefined}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {compatibleMediaAction.visible || mediaProbeVideoId === currentVideo.id ? (
                  <div className="compatible-media-status">
                    <span>
                      {mediaProbeVideoId === currentVideo.id
                        ? "正在探测媒体兼容性..."
                        : currentVideo.playability?.reason ?? "当前视频尚未探测播放兼容性。"}
                    </span>
                    {canCreateCompatibleMedia ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void createCompatibleMedia()}
                        disabled={compatibleMediaVideoId === currentVideo.id}
                      >
                        <RefreshCw size={15} className={compatibleMediaVideoId === currentVideo.id ? "spin-icon" : undefined} />
                        {compatibleMediaVideoId === currentVideo.id ? "生成中" : "生成兼容 MP4"}
                      </button>
                    ) : null}
                    {compatibleMediaMessage ? <small>{compatibleMediaMessage}</small> : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="current-video-title">
                {isPrivacyMode
                  ? "正在播放：推荐视频"
                  : isPhotoAlbumViewVisible
                    ? activeView === "photoViewer" && selectedPhotoAlbum
                      ? selectedPhotoAlbum.title
                      : "写真集"
                    : currentVideo
                      ? currentVideo.relativePath
                      : message}
              </p>
            )}
          </div>
          <div className="top-actions">
            {!isPrivacyMode && videos.length && !isHomeViewVisible ? (
              <button className="secondary-button top-home-button" type="button" onClick={showHomeView}>
                首页
              </button>
            ) : null}
            {!isPrivacyMode && activeView !== "photos" && activeView !== "photoViewer" ? (
              <button className="secondary-button top-home-button" type="button" onClick={showPhotoAlbumsView}>
                <Images size={17} />
                写真集
              </button>
            ) : null}
            <button
              className="icon-button theme-toggle"
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
              aria-label={theme === "dark" ? "切换到白天模式" : "切换到黑夜模式"}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        {isHomeViewVisible ? (
          <section className="home-dashboard" aria-label="继续观看首页">
            <div className="home-primary-column">
              <section className={`home-resume-card ${primaryHomeCard ? "" : "empty"}`}>
                {primaryHomeCard ? (
                  <>
                    {homeCardThumbnail(primaryHomeCard)}
                    <div className="home-resume-copy">
                      <span className="home-section-eyebrow">{primaryHomeTitle}</span>
                      <h2>{primaryHomeCard.video.name}</h2>
                      <p>{primaryHomeCard.seriesTitle}</p>
                      <span>{primaryHomeCard.mediaRootLabel}</span>
                      <span>{primaryHomeCard.video.relativePath}</span>
                      <div className="home-progress" aria-label={formatHomeProgressLabel(primaryHomeCard)}>
                        <span style={{ width: `${primaryHomeCard.progressPercent}%` }} />
                      </div>
                      <small>{formatHomeMeta(primaryHomeCard)}</small>
                      <div className="home-resume-actions">
                        <button className="primary-button" type="button" onClick={() => openVideoFromHome(primaryHomeCard.video)}>
                          <Play size={18} />
                          {primaryHomeAction}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openVideoFromHome(primaryHomeCard.video, { fromBeginning: true })}
                        >
                          <RotateCcw size={17} />
                          从头播放
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="home-empty-state">
                    <FolderOpen size={42} />
                    <h2>{videos.length ? `当前${homeMediaModeLabel}没有可播放视频` : "新增一个媒体库开始播放"}</h2>
                    <p>
                      {videos.length
                        ? "切换到全部模式，或确认对应媒体库已完成扫描。"
                        : "播放器会把你选择的目录加入全局媒体库，扫描视频、匹配字幕并保存观看进度。"}
                    </p>
                    {!videos.length ? (
                      <button className="primary-button" type="button" onClick={requestAddMediaLibrary} disabled={isScanning}>
                        <FolderOpen size={18} />
                        {isScanning ? "扫描中" : "新增媒体库"}
                      </button>
                    ) : null}
                  </div>
                )}
              </section>

              {nextEpisodeCard ? (
                <section className="home-section">
                  <div className="home-section-header">
                    <h2>下一集</h2>
                    <span>{nextEpisodeCard.seriesTitle}</span>
                  </div>
                  <div className="home-next-card">
                    {homeCardThumbnail(nextEpisodeCard)}
                    <div>
                      <strong>{nextEpisodeCard.video.name}</strong>
                      <small>{nextEpisodeCard.mediaRootLabel} · {nextEpisodeCard.video.relativePath}</small>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => openVideoFromHome(nextEpisodeCard.video)}>
                      播放
                    </button>
                  </div>
                </section>
              ) : null}

              {recentHomeCards.length ? (
                <section className="home-section">
                  <div className="home-section-header">
                    <h2>最近观看</h2>
                    <span>{recentHomeCards.length} 个记录</span>
                  </div>
                  <div className="home-list-grid">{recentHomeCards.map(renderHomeListCard)}</div>
                </section>
              ) : null}
            </div>

            <aside className="home-side-column">
              <section className="home-mode-card">
                <div className="home-section-header">
                  <h2>媒体模式</h2>
                  <span>{homeMediaModeLabel}</span>
                </div>
                <div className="home-mode-switch" role="group" aria-label="首页媒体库模式">
                  <button
                    className={homeMediaMode === "all" ? "active" : ""}
                    type="button"
                    onClick={() => updateHomeMediaMode("all")}
                    aria-pressed={homeMediaMode === "all"}
                  >
                    <Play size={15} />
                    全部
                  </button>
                  <button
                    className={homeMediaMode === "anime" ? "active" : ""}
                    type="button"
                    onClick={() => updateHomeMediaMode("anime")}
                    aria-pressed={homeMediaMode === "anime"}
                  >
                    <Subtitles size={15} />
                    追番模式
                  </button>
                  <button
                    className={homeMediaMode === "special" ? "active" : ""}
                    type="button"
                    onClick={() => updateHomeMediaMode("special")}
                    aria-pressed={homeMediaMode === "special"}
                  >
                    <ShieldCheck size={15} />
                    特殊模式
                  </button>
                </div>
              </section>

              <section className="home-stats">
                <div>
                  <strong>{libraryStats.total}</strong>
                  <span>视频</span>
                </div>
                <div>
                  <strong>{libraryStats.unfinished}</strong>
                  <span>未看完</span>
                </div>
                <div>
                  <strong>{libraryStats.completed}</strong>
                  <span>已看完</span>
                </div>
                <div>
                  <strong>{libraryStats.favorites}</strong>
                  <span>收藏</span>
                </div>
              </section>

              <section className="home-section media-library-card">
                <button
                  className="media-library-toggle"
                  type="button"
                  aria-expanded={isMediaLibraryPanelOpen}
                  aria-controls="home-media-library-panel"
                  onClick={() => setIsMediaLibraryPanelOpen((isOpen) => !isOpen)}
                >
                  <span>{homeMediaMode === "all" ? "全局媒体库" : `${homeMediaModeLabel}媒体库`}</span>
                  <span>{`${modeFilteredMediaRootStatuses.filter((status) => status.status === "ready").length} / ${homeModeMediaRoots.length} 可用`}</span>
                  <ChevronDown className="media-library-toggle-chevron" size={16} aria-hidden="true" />
                </button>
                {isMediaLibraryPanelOpen ? (
                  <div id="home-media-library-panel" className="media-library-panel">
                    {homeModeMediaRoots.length ? (
                      <div className={`media-library-list${homeModeMediaRoots.length > 2 ? " media-library-list-scrollable" : ""}`}>
                        {homeModeMediaRoots.map((root) => {
                          const action = getMediaRootLocalPathAction(root);
                          const status = modeFilteredMediaRootStatuses.find((item) => item.id === root.id);
                          return (
                            <div className="media-library-row" key={root.id}>
                              <strong>{root.label}</strong>
                              <code>{formatMediaRootStatus(status)}</code>
                              <code>{root.source === "browser" ? `浏览器：${root.path}` : root.path}</code>
                              {root.source === "browser" ? (
                                <code>{root.localPath ? `本机：${root.localPath}` : "本机：未配置"}</code>
                              ) : null}
                              {action.visible ? (
                                <button
                                  className="secondary-button media-library-path-button"
                                  type="button"
                                  disabled={action.disabled}
                                  onClick={() => openMediaRootLocalPathDialog(root)}
                                >
                                  <HardDrive size={16} />
                                  {action.label}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-list compact">当前模式没有匹配的媒体库。</div>
                    )}
                  </div>
                ) : null}
              </section>

              {shouldShowHomeRecap ? (
                <section className="home-section home-recap-card">
                  <div className="home-section-header">
                    <h2>无剧透回顾</h2>
                    <span>{homeRecapCard ? formatHomeProgressLabel(homeRecapCard) : "等待观看进度"}</span>
                  </div>
                  {homeRecapCard ? (
                    <div className="home-recap-target">
                      <Subtitles size={22} />
                      <div>
                        <strong>{homeRecapCard.video.name}</strong>
                        <span>{homeRecapCard.seriesTitle}</span>
                      </div>
                    </div>
                  ) : null}
                  <div className="home-recap-output">
                    {homeRecapCard
                      ? homeProgressRecapVideoId === homeRecapVideoId && homeProgressRecap
                        ? homeProgressRecap
                        : homeProgressRecapMessage ||
                          (homeRecapSubtitle
                            ? "根据当前进度前的字幕生成回顾，不包含后续剧情。"
                            : canUseHomeEmbeddedSubtitles
                              ? "可自动提取内封文本字幕，并根据当前进度生成回顾。"
                              : homeRecapMediaRoot?.source === "browser"
                                ? "浏览器添加的媒体库只能播放和匹配外置字幕；自动提取内封字幕需要在服务端配置该媒体库的本机绝对路径。"
                                : "没有匹配字幕，暂时无法生成回顾。")
                      : "当前没有可回顾的观看进度。播放一集并保留进度后，就能在这里生成无剧透回顾。"}
                  </div>
                  {homeRecapCard && homeRecapMediaRoot?.source === "browser" && !homeRecapMediaRoot.localPath ? (
                    <button
                      className="secondary-button home-recap-button"
                      type="button"
                      onClick={() => openMediaRootLocalPathDialog(homeRecapMediaRoot)}
                    >
                      <HardDrive size={16} />
                      配置本机路径
                    </button>
                  ) : null}
                  <button
                    className="secondary-button home-recap-button"
                    type="button"
                    onClick={() => void loadHomeProgressRecap()}
                    disabled={isHomeProgressRecapLoading || !homeRecapCard || !localConfig?.ai.configured || !canUseHomeRecapSubtitle}
                    title={!homeRecapCard ? "当前没有可回顾的观看进度" : !localConfig?.ai.configured ? "未配置 DEEPSEEK_API_KEY" : undefined}
                  >
                    {homeProgressRecap ? "重新生成" : isHomeProgressRecapLoading ? "生成中..." : "生成回顾"}
                  </button>
                </section>
              ) : null}

              <section className="home-section library-search-card">
                <div className="home-section-header">
                  <h2>片库搜索</h2>
                  <span>{librarySearchMode === "ai" ? "AI 辅助" : "本地优先"}</span>
                </div>
                <form
                  className="library-search-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runLibrarySearch();
                  }}
                >
                  <input
                    type="search"
                    value={librarySearchQuery}
                    onChange={(event) => setLibrarySearchQuery(event.target.value)}
                    placeholder="搜索片名，或描述想看的内容"
                    aria-label="片库搜索"
                  />
                  <button type="submit" disabled={isLibrarySearchLoading || !modeFilteredVideos.length} title="搜索片库">
                    <Search size={17} />
                  </button>
                </form>
                {shouldShowLibrarySearchPreview ? (
                  <div className="library-search-preview">
                    <div className="library-search-preview-header">
                      <span>搜索预览</span>
                      <small>仅本地匹配，不调用 AI</small>
                    </div>
                    {librarySearchPreviewResults.length ? (
                      <div className="home-compact-list library-search-preview-results">
                        {librarySearchPreviewResults.map(renderLibraryFolderResult)}
                      </div>
                    ) : (
                      <div className="empty-list compact">本地预览暂无命中</div>
                    )}
                  </div>
                ) : null}
                <div className={`library-search-status ${librarySearchMode}`}>
                  {isLibrarySearchLoading ? "搜索中..." : librarySearchMessage || "明确片名会直接本地检索，复杂描述才调用 AI。"}
                </div>
                {librarySearchAnswer ? <div className="library-search-answer">{librarySearchAnswer}</div> : null}
                {librarySearchResults.length ? (
                  <div className="home-compact-list library-search-results" ref={librarySearchResultsRef}>
                    {visibleLibrarySearchResults.map(renderLibraryFolderResult)}
                    {hasMoreLibrarySearchResults ? (
                      <div className="library-search-load-more" ref={librarySearchLoadMoreRef}>
                        <span>
                          已显示 {visibleLibrarySearchResults.length} / {librarySearchResults.length}
                        </span>
                        <button type="button" onClick={loadMoreLibrarySearchResults}>
                          加载更多
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : librarySearchMode === "empty" ? (
                  <div className="empty-list compact">没有找到匹配文件夹</div>
                ) : null}
              </section>

              <section className="home-section cache-status-card">
                <div className="home-section-header">
                  <h2>本地缓存</h2>
                  <span>{cacheStatus ? `${cacheStatus.totalFiles} 个文件` : "未检查"}</span>
                </div>
                <div className="cache-status-summary">
                  <HardDrive size={28} />
                  <div>
                    <strong>{cacheStatus ? formatFileSize(cacheStatus.totalBytes) : "待检查"}</strong>
                    <span>{cacheStatus?.updatedAt ? `更新于 ${formatModifiedTime(cacheStatus.updatedAt)}` : "暂无缓存状态"}</span>
                  </div>
                </div>
                <button className="secondary-button cache-status-button" type="button" onClick={openCacheStatusDialog}>
                  查看详情
                </button>
              </section>

              {favoriteHomeCards.length ? (
                <section className="home-section">
                  <div className="home-section-header">
                    <h2>收藏 / 稍后看</h2>
                    <span>{favoriteHomeCards.length} 个</span>
                  </div>
                  <div className="home-compact-list">{favoriteHomeCards.map(renderHomeListCard)}</div>
                </section>
              ) : null}
            </aside>
          </section>
        ) : null}

        {isPhotoAlbumViewVisible && activeView === "photos" ? (
          <section className="photo-dashboard" aria-label="写真集">
            <section className="photo-toolbar home-section">
              <div>
                <span className="home-section-eyebrow">写真集</span>
                <h2>本地写真集</h2>
                <p>{photoAlbumMessage}</p>
              </div>
              <div className="photo-toolbar-actions">
                <div className="playlist-filter" role="group" aria-label="写真集筛选">
                  <button
                    type="button"
                    className={photoAlbumFilter === "all" ? "active" : ""}
                    onClick={() => updatePhotoAlbumFilter("all")}
                  >
                    全部
                  </button>
                  <button
                    type="button"
                    className={photoAlbumFilter === "favorites" ? "active" : ""}
                    onClick={() => updatePhotoAlbumFilter("favorites")}
                  >
                    收藏
                  </button>
                </div>
                <ControlSelect
                  label="排序"
                  ariaLabel="写真集排序"
                  value={photoAlbumSortMode}
                  options={photoAlbumSortOptions}
                  onChange={updatePhotoAlbumSortMode}
                  className="photo-sort-control"
                />
                <button className="secondary-button" type="button" onClick={() => void refreshPhotoAlbumDirectory()} disabled={isPhotoAlbumsLoading}>
                  <RefreshCw size={16} className={isPhotoAlbumsLoading ? "spin-icon" : undefined} />
                  {isPhotoAlbumsLoading ? "扫描中" : "刷新"}
                </button>
              </div>
            </section>

            <section className="home-stats photo-stats">
              <div>
                <strong>{photoAlbumStats.total}</strong>
                <span>相册</span>
              </div>
              <div>
                <strong>{photoAlbumStats.images}</strong>
                <span>图片</span>
              </div>
              <div>
                <strong>{photoAlbumStats.completed}</strong>
                <span>已读完</span>
              </div>
              <div>
                <strong>{photoAlbumStats.favorites}</strong>
                <span>收藏</span>
              </div>
            </section>

            {photoRootStatuses.some((status) => status.status !== "ready") ? (
              <section className="home-section photo-root-status">
                <div className="home-section-header">
                  <h2>媒体库状态</h2>
                  <span>{photoRootStatuses.filter((status) => status.status === "ready").length} / {photoRootStatuses.length} 可用</span>
                </div>
                <div className="media-library-list">
                  {photoRootStatuses.map((status) => (
                    <div className="media-library-row" key={status.id}>
                      <strong>{status.label}</strong>
                      <code>{formatPhotoRootStatus(status)}</code>
                      {status.error ? <code>{status.error}</code> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {visiblePhotoAlbums.length ? (
              <>
                <section className="photo-album-grid">{pagedPhotoAlbums.map(renderPhotoAlbumCard)}</section>
                {photoAlbumPageCount > 1 ? (
                  <nav className="photo-pagination" aria-label="写真集分页">
                    <span>
                      {photoAlbumPageStart}-{photoAlbumPageEnd} / {visiblePhotoAlbums.length}
                    </span>
                    <div>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPhotoAlbumPage((page) => Math.max(page - 1, 1))}
                        disabled={photoAlbumPage <= 1}
                      >
                        <ChevronLeft size={16} />
                        上一页
                      </button>
                      <strong>{photoAlbumPage} / {photoAlbumPageCount}</strong>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPhotoAlbumPage((page) => Math.min(page + 1, photoAlbumPageCount))}
                        disabled={photoAlbumPage >= photoAlbumPageCount}
                      >
                        下一页
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </nav>
                ) : null}
              </>
            ) : (
              <section className="home-section photo-empty-state">
                <Images size={42} />
                <h2>{isPhotoAlbumsLoading ? "正在扫描写真集" : "还没有可显示的写真集"}</h2>
                <p>{photoAlbumFilter === "favorites" ? "收藏写真集后会出现在这里。" : "手动选择文件夹后，会把其中包含图片的文件夹识别为写真集。"}</p>
                <button className="primary-button" type="button" onClick={() => void choosePhotoAlbumDirectory()} disabled={isPhotoAlbumsLoading}>
                  <FolderOpen size={18} />
                  {isPhotoAlbumsLoading ? "扫描中" : "选择写真集文件夹"}
                </button>
              </section>
            )}
          </section>
        ) : null}

        {isPhotoAlbumViewVisible && activeView === "photoViewer" && selectedPhotoAlbum ? (
          <section className="photo-viewer" aria-label={`阅读 ${selectedPhotoAlbum.title}`}>
            <header className="photo-viewer-header">
              <button className="secondary-button" type="button" onClick={showPhotoAlbumList}>
                <ArrowLeft size={17} />
                返回
              </button>
              <div className="photo-viewer-actions">
                <button
                  className={`secondary-button ${favoritePhotoAlbumIds.has(selectedPhotoAlbum.id) ? "active" : ""}`}
                  type="button"
                  onClick={() => togglePhotoAlbumFavorite(selectedPhotoAlbum)}
                >
                  <Star size={16} fill={favoritePhotoAlbumIds.has(selectedPhotoAlbum.id) ? "currentColor" : "none"} />
                  {favoritePhotoAlbumIds.has(selectedPhotoAlbum.id) ? "已收藏" : "收藏"}
                </button>
                <button className="secondary-button" type="button" onClick={markSelectedPhotoAlbumCompleted}>
                  <CheckCircle2 size={16} />
                  标记已读
                </button>
                <button className="secondary-button" type="button" onClick={resetSelectedPhotoAlbumProgress}>
                  <RotateCcw size={16} />
                  重读
                </button>
                <button
                  className="danger-button photo-delete-button"
                  type="button"
                  onClick={requestDeleteCurrentPhoto}
                  disabled={!currentPhoto}
                  title={currentPhoto ? "删除当前写真" : "当前没有可删除的写真图片"}
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            </header>
            <div className="photo-stage">
              <button className="photo-nav-button previous" type="button" onClick={() => movePhoto(-1)} disabled={currentPhotoIndex <= 0} aria-label="上一张">
                <ChevronLeft size={34} />
              </button>
              {currentPhoto && currentPhotoUrl ? (
                <img key={currentPhoto.id} src={currentPhotoUrl} alt={currentPhoto.name} draggable={false} />
              ) : (
                <div className="photo-empty-state">没有可显示的图片</div>
              )}
              <button
                className="photo-nav-button next"
                type="button"
                onClick={() => movePhoto(1)}
                disabled={currentPhotoIndex >= selectedPhotoAlbum.images.length - 1}
                aria-label="下一张"
              >
                <ChevronRight size={34} />
              </button>
            </div>
            <footer className="photo-filmstrip">
              <div className="photo-page-indicator">
                <strong>{Math.min(currentPhotoIndex + 1, selectedPhotoAlbum.imageCount)} / {selectedPhotoAlbum.imageCount}</strong>
                <span>{currentPhoto?.name ?? selectedPhotoAlbum.title}</span>
              </div>
              <div className="photo-thumbnails" aria-label="图片缩略图">
                {visiblePhotoThumbnails.map((image) => {
                  const thumbnailUrl = getPhotoImageUrl(image);
                  return (
                    <button
                      className={image.index === currentPhotoIndex ? "active" : ""}
                      key={image.id}
                      type="button"
                      onClick={() => {
                        setCurrentPhotoIndex(image.index);
                        persistPhotoAlbumProgress(selectedPhotoAlbum, image.index, image.index === selectedPhotoAlbum.images.length - 1);
                      }}
                      title={image.name}
                    >
                      {thumbnailUrl ? <img src={thumbnailUrl} alt="" loading="lazy" draggable={false} /> : null}
                    </button>
                  );
                })}
              </div>
            </footer>
          </section>
        ) : null}

        <div
          className={`player-frame ${isNonPlayerViewVisible ? "home-hidden" : ""} ${isFullscreen ? "fullscreen" : ""} ${areControlsVisible ? "" : "controls-hidden"}`}
          ref={playerRef}
          onMouseMove={revealControls}
          onContextMenu={handlePlayerContextMenu}
          onPointerDownCapture={handlePlayerPointerDown}
          onPointerUpCapture={handlePlayerPointerUp}
          onPointerCancel={handlePlayerPointerCancel}
          onDoubleClick={handlePlayerDoubleClick}
          onWheel={handlePlayerWheel}
          onMouseLeave={() => {
            if (isFullscreen || isCinemaMode) scheduleControlsHide();
            stopRightMouseHoldSpeed();
          }}
          tabIndex={-1}
        >
          <div className="player-viewport">
            {currentVideo ? (
              <video
                ref={videoRef}
                className={`video-element ${normalizedVideoRotation ? "manual-rotated" : ""} ${isVideoSideways ? "sideways" : ""}`}
                style={
                  normalizedVideoRotation
                    ? ({
                        "--landscape-source-aspect-ratio": currentVideoSourceAspectRatio,
                        "--video-rotation": `${normalizedVideoRotation}deg`,
                      } as React.CSSProperties)
                    : undefined
                }
                onClick={togglePlay}
                onPlay={() => {
                  setIsPlaying(true);
                  if (currentVideo) recordPlaybackStartForStats(currentVideo);
                }}
                onPause={() => {
                  setIsPlaying(false);
                  persistCurrentProgress();
                }}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={handleDurationChange}
                onEnded={handleEnded}
                playsInline
              >
                {selectedSubtitle ? (
                  <track key={selectedSubtitle.id} src={selectedSubtitle.url} kind="subtitles" label={selectedSubtitle.name} default />
                ) : null}
              </video>
            ) : !isPrivacyMode ? (
              <div className="empty-player">
                <FolderOpen size={40} />
                <span>{message}</span>
              </div>
            ) : null}

            {isPrivacyMode ? (
              <div className="privacy-cover" role="status" aria-live="polite">
                <Play size={58} />
              </div>
            ) : null}

            {launchEffectKey ? (
              <div key={launchEffectKey} className="rocket-launch-effect" aria-hidden="true">
                <div className="rocket-launch-effect__sky">
                  <span className="rocket-launch-effect__star star-one" />
                  <span className="rocket-launch-effect__star star-two" />
                  <span className="rocket-launch-effect__star star-three" />
                </div>
                <div className="rocket-launch-effect__rocket">
                  <Rocket size={58} strokeWidth={2.2} />
                </div>
                <div className="rocket-launch-effect__flame" />
                <div className="rocket-launch-effect__smoke smoke-one" />
                <div className="rocket-launch-effect__smoke smoke-two" />
                <div className="rocket-launch-effect__smoke smoke-three" />
              </div>
            ) : null}

            {currentVideo ? (
              <>
              <video
                ref={previewVideoRef}
                className="timeline-preview-video"
                muted
                preload="metadata"
                playsInline
                tabIndex={-1}
              />
              <canvas ref={previewCanvasRef} className="timeline-preview-canvas" width={192} height={108} />
              </>
            ) : null}
          </div>

          {doubleClickFeedback ? (
            <div className={`double-click-feedback ${doubleClickFeedback.side}`} aria-live="polite">
              {doubleClickFeedback.text}
            </div>
          ) : null}

          {playerOverlayFeedback ? (
            <div className="player-overlay-feedback" aria-live="polite">
              {playerOverlayFeedback}
            </div>
          ) : null}

          {autoNextPrompt ? (
            <div className="auto-next-prompt" role="status" aria-live="polite">
              <div className="auto-next-countdown">{autoNextPrompt.remainingSeconds}</div>
              <div className="auto-next-copy">
                <span>即将播放下一集</span>
                <strong>{autoNextPrompt.nextVideoName}</strong>
              </div>
              <div className="auto-next-actions">
                <button type="button" onClick={() => confirmAutoNext(autoNextPrompt.nextVideoId)}>
                  立即播放
                </button>
                <button type="button" onClick={cancelAutoNextPrompt}>
                  取消
                </button>
              </div>
            </div>
          ) : null}

          <div
            ref={controlBarRef}
            className="control-bar"
            onFocus={keepControlsVisible}
            onMouseEnter={keepControlsVisible}
            onMouseLeave={scheduleControlsHide}
            onMouseMove={(event) => {
              event.stopPropagation();
              keepControlsVisible();
            }}
          >
            <div className="timeline-row">
              <span>{formatTime(currentTime)}</span>
              <div
                className={`timeline-track ${timelinePreview.isVisible ? "preview-visible" : ""}`}
                style={
                  {
                    "--preview-left": `${timelinePreview.left}%`,
                  } as React.CSSProperties
                }
              >
                <output className="timeline-preview">
                  <span className="timeline-preview-frame">
                    {timelinePreview.imageUrl ? (
                      <img src={timelinePreview.imageUrl} alt="" draggable={false} />
                    ) : (
                      <span className="timeline-preview-placeholder">
                        {timelinePreview.isLoadingFrame ? "" : formatTime(timelinePreview.time)}
                      </span>
                    )}
                  </span>
                  <span className="timeline-preview-time">{formatTime(timelinePreview.time)}</span>
                </output>
                <input
                  ref={timelineRef}
                aria-label="播放进度"
                className="timeline"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                  value={duration ? currentTime : 0}
                  onChange={(event) => {
                    if (isPrivacyMode) return;
                    const nextTime = Number(event.target.value);
                    seekTo(nextTime);
                    updateTimelinePreviewFromTime(nextTime, timelinePreview.isDragging);
                  }}
                  onPointerDown={(event) => {
                    if (isPrivacyMode) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    updateTimelinePreview(event.clientX, true);
                  }}
                  onPointerMove={(event) => {
                    if (isPrivacyMode) return;
                    updateTimelinePreview(event.clientX, timelinePreview.isDragging);
                  }}
                  onPointerUp={(event) => {
                    if (isPrivacyMode) return;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    stopTimelineDragPreview();
                    returnFocusToPlayer();
                  }}
                  onPointerCancel={() => {
                    stopTimelineDragPreview();
                    returnFocusToPlayer();
                  }}
                  onPointerLeave={() => {
                    if (!isPrivacyMode) hideTimelinePreview();
                  }}
                style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
                  disabled={!currentVideo || isPrivacyMode}
                />
              </div>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="control-row">
              <button className="icon-button" type="button" onClick={togglePlay} disabled={!currentVideo} title="播放/暂停">
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button className="icon-button" type="button" onClick={playNext} disabled={!canPlayNext} title="下一集">
                <SkipForward size={20} />
              </button>

              <label className="volume-control">
                <button
                  aria-label={isMuted ? "取消静音" : "静音"}
                  className="volume-toggle"
                  type="button"
                  onClick={toggleMute}
                  disabled={!currentVideo}
                  title={isMuted ? "取消静音" : "静音"}
                >
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  aria-label="音量"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                />
              </label>

              <ControlSelect
                label="播放速度"
                ariaLabel="播放速度"
                value={effectivePlaybackRate}
                options={playbackRateOptions.map((rate) => ({ value: rate, label: `${rate}x` }))}
                onChange={setPlaybackRate}
                className="rate-control"
              />

              {!isSeriesMode ? (
                <ControlSelect
                  label="播放模式"
                  ariaLabel="播放模式"
                  value={playbackMode}
                  options={playbackModeOptions}
                  onChange={setPlaybackMode}
                />
              ) : null}

              <ControlSelect
                label="快进/快退"
                ariaLabel="快进/快退时间"
                value={seekStep}
                options={seekSteps.map((step) => ({ value: step, label: `${step}s` }))}
                onChange={setSeekStep}
              />

              <ControlSelect
                label="长按右方向"
                ariaLabel="长按右方向键倍速"
                value={holdPlaybackRate}
                options={holdRates.map((rate) => ({ value: rate, label: `${rate}x` }))}
                onChange={setHoldPlaybackRate}
              />

              <ControlSelect
                label={<Subtitles size={18} aria-hidden="true" />}
                ariaLabel="字幕"
                value={selectedSubtitleId}
                options={subtitleControlOptions}
                onChange={(value) => {
                  autoSubtitleSelectionVideoIdRef.current = null;
                  if (value === "manual") {
                    void chooseSubtitleFile();
                    return;
                  }
                  updateSelectedSubtitleId(value);
                }}
                className="subtitle-control"
                disabled={!currentVideo}
              />

              <button
                className="icon-button"
                type="button"
                onClick={probeEmbeddedSubtitles}
                disabled={!canUseEmbeddedSubtitles || isEmbeddedSubtitleLoading}
                title={
                  canUseEmbeddedSubtitles
                    ? "检测内封字幕"
                    : "需要在 config/app.json 配置媒体根路径，并安装 ffmpeg/ffprobe"
                }
              >
                CC
              </button>
              <button
                className={`icon-button ${isAiPanelOpen ? "active" : ""}`}
                type="button"
                onClick={() => setIsAiPanelOpen(true)}
                disabled={!selectedSubtitle}
                title={selectedSubtitle ? "字幕总结和问答" : "请先选择字幕"}
              >
                AI
              </button>
              <button
                className={`icon-button ${currentVideoTags.length ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setIsTagDialogOpen(true);
                  setTagMessage("");
                  setTagMergePrompt(null);
                }}
                disabled={!currentVideo}
                title="管理视频标签"
                aria-label="管理视频标签"
              >
                <Tags size={18} />
              </button>
              {canRecordEmission ? (
                <div className="emission-control" aria-label={`发射次数 ${currentVideoEmissionCount}`}>
                  <button
                    className="icon-button emission-launch-button"
                    type="button"
                    onClick={recordEmissionForCurrentVideo}
                    disabled={!currentVideo}
                    title="发射"
                    aria-label="发射"
                  >
                    <Rocket size={18} />
                  </button>
                  <span className="emission-count-label">
                    <Rocket size={15} />
                    发射次数 {currentVideoEmissionCount}
                  </span>
                </div>
              ) : null}

              <span className="control-spacer" />

              <button className="icon-button" type="button" onClick={togglePictureInPicture} disabled={!currentVideo} title="画中画">
                <PictureInPicture2 size={20} />
              </button>
              <button
                className={`icon-button ${normalizedVideoRotation ? "active" : ""}`}
                type="button"
                onClick={rotateVideoClockwise}
                disabled={!currentVideo}
                title={`旋转视频${normalizedVideoRotation ? ` (${normalizedVideoRotation}deg)` : ""}`}
                aria-label={`旋转视频${normalizedVideoRotation ? `, 当前 ${normalizedVideoRotation} 度` : ""}`}
                aria-pressed={normalizedVideoRotation !== 0}
              >
                <RotateCw size={20} />
              </button>
              <button className="icon-button" type="button" onClick={toggleShortcutDialog} title="快捷键帮助">
                <Keyboard size={20} />
              </button>
              <button
                className={`icon-button privacy-toggle ${isPrivacyMode ? "active" : ""}`}
                type="button"
                onClick={togglePrivacyMode}
                title="隐私模式 / 快速清屏 (P)"
                aria-pressed={isPrivacyMode}
              >
                <EyeOff size={20} />
              </button>
              <button
                className={`icon-button cinema-toggle ${isCinemaMode ? "active" : ""}`}
                type="button"
                onClick={toggleCinemaMode}
                disabled={!currentVideo}
                title="影院模式"
                aria-pressed={isCinemaMode}
              >
                T
              </button>
              <button className="icon-button" type="button" onClick={toggleFullscreen} disabled={!currentVideo} title="全屏">
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {!isNonPlayerViewVisible && !isPrivacyMode && !isCinemaMode ? (
      <aside className="playlist-panel" aria-label={isSeriesMode ? "追番列表" : "播放列表"}>
        <div className="playlist-header">
          <div className="playlist-title-row">
            <span>
              {modeFilteredVideos.length
                ? playlistFilter === "favorites"
                  ? `${visibleVideos.length} / ${modeFilteredVideos.length} 个收藏`
                  : isSeriesMode
                    ? `${visibleVideos.length} / ${modeFilteredVideos.length} 个视频`
                    : homeMediaMode === "all"
                      ? `${modeFilteredVideos.length} 个视频`
                      : `${homeMediaModeLabel} · ${modeFilteredVideos.length} 个视频`
                : videos.length
                  ? `当前${homeMediaModeLabel}没有视频`
                  : "等待新增媒体库"}
            </span>
          </div>
          <div className={`playlist-tools ${isSeriesMode ? "series-mode" : ""}`}>
            <span className={`player-mode-indicator mode-${homeMediaMode}`} title={`当前播放模式：${playerMediaModeLabel}`}>
              {playerMediaModeLabel}
            </span>
            {isSeriesMode ? (
              <div className="series-menu">
                <button
                  className="series-menu-trigger"
                  type="button"
                  onClick={() => setIsSeriesMenuOpen((isOpen) => !isOpen)}
                  disabled={!seriesOptions.length}
                  aria-haspopup="listbox"
                  aria-expanded={isSeriesMenuOpen}
                  aria-label="选择系列"
                  title="选择系列"
                >
                  <span>
                    {selectedSeriesKey === "all"
                      ? "全部系列"
                      : (() => {
                          const selectedSeries = seriesOptions.find((series) => series.key === selectedSeriesKey);
                          return selectedSeries
                            ? [selectedSeries.title, selectedSeries.mediaRootLabel].filter(Boolean).join(" · ")
                            : "全部系列";
                        })()}
                  </span>
                  <ChevronDown className="series-menu-chevron" size={15} aria-hidden="true" />
                </button>
                {isSeriesMenuOpen ? (
                  <div className="series-menu-list" role="listbox" aria-label="选择系列">
                    <button
                      className={selectedSeriesKey === "all" ? "active" : ""}
                      type="button"
                      role="option"
                      aria-selected={selectedSeriesKey === "all"}
                      onClick={() => updateSelectedSeries("all")}
                    >
                      全部系列
                    </button>
                    {seriesOptions.map((series) => (
                      <button
                        key={series.key}
                        className={selectedSeriesKey === series.key ? "active" : ""}
                        type="button"
                        role="option"
                        aria-selected={selectedSeriesKey === series.key}
                        onClick={() => updateSelectedSeries(series.key)}
                      >
                        {[series.title, series.mediaRootLabel].filter(Boolean).join(" · ")} ({series.count})
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {isSeriesMode ? (
              <button
                className={`bangumi-link-button ${canOpenBangumiSubject ? "active" : ""} ${activeBangumiMatch?.status === "loading" ? "loading" : ""}`}
                type="button"
                onClick={openBangumiSubject}
                disabled={!canOpenBangumiSubject}
                title={bangumiButtonTitle}
                aria-label={bangumiButtonTitle}
              >
                {activeBangumiMatch?.status === "loading" ? <RefreshCw size={16} /> : <ExternalLink size={16} />}
              </button>
            ) : null}
            <ControlSelect
              label="排序"
              ariaLabel="播放列表排序方式"
              value={playlistSortMode}
              options={playlistSortOptions}
              onChange={updatePlaylistSortMode}
              className="playlist-sort-control"
              disabled={!modeFilteredVideos.length}
            />
            <button
              className={`playlist-order-button ${isPlaylistSortReversed ? "active" : ""}`}
              type="button"
              onClick={togglePlaylistSortDirection}
              disabled={!modeFilteredVideos.length}
              title={isPlaylistSortReversed ? "切换为正序" : "切换为倒序"}
              aria-label={isPlaylistSortReversed ? "切换为正序" : "切换为倒序"}
            >
              <ArrowDownUp size={16} />
            </button>
            <button
              className="playlist-top-button"
              type="button"
              onClick={() => scrollPlaylistToTop()}
              disabled={!visibleVideos.length || playlistViewport.scrollTop <= 0}
              title="回到顶部"
              aria-label="回到顶部"
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="playlist-locate-button"
              type="button"
              onClick={() => scrollToCurrentPlaylistItem()}
              disabled={!isCurrentVideoVisible}
              title={isCurrentVideoVisible ? "回到当前播放" : "当前播放不在列表筛选结果中"}
              aria-label={isCurrentVideoVisible ? "回到当前播放" : "当前播放不在列表筛选结果中"}
            >
              <LocateFixed size={16} />
            </button>
            {!isSeriesMode ? (
              <div className="playlist-filter" aria-label="播放列表筛选">
                <button
                  className={playlistFilter === "all" ? "active" : ""}
                  type="button"
                  onClick={() => setPlaylistFilter("all")}
                  disabled={!modeFilteredVideos.length}
                >
                  全部
                </button>
                <button
                  className={playlistFilter === "favorites" ? "active" : ""}
                  type="button"
                  onClick={() => setPlaylistFilter("favorites")}
                  disabled={!modeFilteredVideos.length}
                >
                  <Star size={14} />
                </button>
              </div>
            ) : null}
            <button
              className="playlist-clear-button icon-only"
              type="button"
              onClick={clearFolderProgress}
              disabled={!canClearPlaylistProgress}
              title={clearPlaylistProgressTitle}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div
          className="playlist"
          ref={playlistRef}
          onScroll={markPlaylistUserScroll}
        >
          {virtualPlaylist.topSpacerHeight ? (
            <div className="playlist-virtual-spacer" style={{ height: virtualPlaylist.topSpacerHeight }} />
          ) : null}
          {virtualPlaylist.items.map((video) => {
            const isActive = video.id === currentVideoId;
            const progress = progressStore[video.id];
            const isCompleted = Boolean(progress?.completed);
            const playlistIndex = playlistIndexById.get(video.id) ?? 0;
            const isFavorite = favoriteVideoIds.has(video.id);
            const seriesTitle = isSeriesMode ? seriesTitleByVideoId.get(video.id) : "";
            const tags = videoTags[video.id] ?? [];
            return (
              <div
                key={video.id}
                className={`playlist-item ${isActive ? "active" : ""}`}
                title={videoMetadataTitle(video)}
              >
                <button
                  className="playlist-select"
                  type="button"
                  onClick={() => selectVideo(video.id)}
                >
                  <span className={`episode-thumbnail ${video.thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" draggable={false} />
                    ) : (
                      <span>{String(playlistIndex + 1).padStart(2, "0")}</span>
                    )}
                  </span>
                  <span className="episode-main">
                    <strong>{video.name}</strong>
                    <small>{video.relativePath}</small>
                    {seriesTitle ? <small className="episode-series">{seriesTitle}</small> : null}
                    {renderTagChips(tags, { limit: 3, compact: true })}
                    {isCompleted ? (
                      <span className="episode-progress compact">
                        <CheckCircle2 size={15} />
                        已看完
                      </span>
                    ) : null}
                  </span>
                </button>
                {isCompleted ? (
                  <span className="episode-progress">
                    <CheckCircle2 size={15} />
                    已看完
                  </span>
                ) : null}
                <span className="episode-actions">
                  <button
                    className={`episode-action-button favorite ${isFavorite ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(video)}
                    title={isFavorite ? "取消收藏" : "收藏/稍后看"}
                    aria-label={isFavorite ? "取消收藏" : "收藏/稍后看"}
                  >
                    <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    className="episode-action-button"
                    type="button"
                    onClick={() => markVideoCompleted(video)}
                    disabled={isCompleted}
                    title="标记已看"
                  >
                    <CheckCircle2 size={15} />
                  </button>
                  <button
                    className="episode-action-button"
                    type="button"
                    onClick={() => resetVideoProgress(video)}
                    disabled={!progressStore[video.id]}
                    title="清除进度"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className="episode-action-button danger"
                    type="button"
                    onClick={() => requestDeleteLocalVideo(video)}
                    disabled={!video.parentDirectory?.removeEntry}
                    title={video.parentDirectory?.removeEntry ? "删除本地文件" : "当前加载方式不支持删除本地文件"}
                    aria-label={video.parentDirectory?.removeEntry ? "删除本地文件" : "当前加载方式不支持删除本地文件"}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            );
          })}
          {virtualPlaylist.bottomSpacerHeight ? (
            <div className="playlist-virtual-spacer" style={{ height: virtualPlaylist.bottomSpacerHeight }} />
          ) : null}

          {!videos.length ? <div className="empty-list">{message}</div> : null}
          {videos.length && !modeFilteredVideos.length ? <div className="empty-list">当前{homeMediaModeLabel}没有视频</div> : null}
          {modeFilteredVideos.length && !visibleVideos.length ? <div className="empty-list">还没有收藏的视频</div> : null}
        </div>
      </aside>
      ) : null}
    </main>
    {deleteCandidate ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteCandidate(null)}>
        <section
          aria-labelledby="delete-file-title"
          aria-modal="true"
          className="delete-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setDeleteCandidate(null)}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon danger">
            <Trash2 size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="delete-file-title">删除本地文件？</h2>
            <p>这个操作会直接从本地磁盘删除视频文件，删除后无法在播放器内恢复。</p>
          </div>
          <div className="delete-file-preview">
            <strong>{deleteCandidate.name}</strong>
            <span>{deleteCandidate.relativePath}</span>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setDeleteCandidate(null)}>
              取消
            </button>
            <button className="danger-button" type="button" onClick={() => void confirmDeleteLocalVideo()}>
              <Trash2 size={18} />
              删除文件
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {photoDeleteCandidate ? (
      <div
        className="modal-backdrop"
        role="presentation"
        onMouseDown={() => {
          if (isPhotoDeletePending) return;
          setPhotoDeleteCandidate(null);
        }}
      >
        <section
          aria-labelledby="delete-photo-title"
          aria-modal="true"
          className="delete-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setPhotoDeleteCandidate(null)}
            disabled={isPhotoDeletePending}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon danger">
            <Trash2 size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="delete-photo-title">删除写真图片？</h2>
            <p>这个操作会直接从本地磁盘删除图片文件，删除后无法在播放器内恢复。</p>
          </div>
          <div className="delete-file-preview">
            <strong>{photoDeleteCandidate.name}</strong>
            <span>{photoDeleteCandidate.relativePath || photoDeleteCandidate.albumTitle}</span>
          </div>
          {photoDeleteError ? <div className="dialog-inline-error">{photoDeleteError}</div> : null}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setPhotoDeleteCandidate(null)} disabled={isPhotoDeletePending}>
              取消
            </button>
            <button className="danger-button" type="button" onClick={() => void confirmDeleteCurrentPhoto()} disabled={isPhotoDeletePending}>
              <Trash2 size={18} />
              {isPhotoDeletePending ? "删除中" : "删除图片"}
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {mediaRootLabelPrompt ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => closeMediaRootLabelPrompt(null)}>
        <section
          aria-labelledby="media-root-label-title"
          aria-modal="true"
          className="media-root-label-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => closeMediaRootLabelPrompt(null)}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon">
            <FolderOpen size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="media-root-label-title">命名媒体库</h2>
            <p>为“{mediaRootLabelPrompt.directoryName}”设置一个媒体库名称。</p>
          </div>
          <label className="media-root-label-field">
            <span>媒体库名称</span>
            <input
              autoFocus
              type="text"
              value={mediaRootLabelPrompt.value}
              onChange={(event) =>
                setMediaRootLabelPrompt((previous) =>
                  previous ? { ...previous, value: event.target.value } : previous,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") submitMediaRootLabelPrompt();
                if (event.key === "Escape") closeMediaRootLabelPrompt(null);
              }}
            />
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => closeMediaRootLabelPrompt(null)}>
              取消
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={submitMediaRootLabelPrompt}
              disabled={!mediaRootLabelPrompt.value.trim()}
            >
              确定
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {existingMediaRootPrompt ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => closeExistingMediaRootPrompt(false)}>
        <section
          aria-labelledby="existing-media-root-title"
          aria-modal="true"
          className="media-root-label-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => closeExistingMediaRootPrompt(false)}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon">
            <FolderOpen size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="existing-media-root-title">该媒体库已添加</h2>
            <p>
              “{existingMediaRootPrompt.mediaRootLabel}”已在全局媒体库中。重新扫描会刷新“{existingMediaRootPrompt.directoryName}”下的视频和字幕。
            </p>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => closeExistingMediaRootPrompt(false)}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={() => closeExistingMediaRootPrompt(true)}>
              <RefreshCw size={18} />
              重新扫描
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {mediaRootLocalPathDialog ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={closeMediaRootLocalPathDialog}>
        <section
          aria-labelledby="media-root-local-path-title"
          aria-modal="true"
          className="media-root-local-path-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={closeMediaRootLocalPathDialog}
            disabled={mediaRootLocalPathDialog.isSaving}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon">
            <HardDrive size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="media-root-local-path-title">配置本机路径</h2>
            <p>为“{mediaRootLocalPathDialog.root.label}”填写服务端可访问的本机绝对路径。</p>
          </div>
          <div className="media-root-path-preview">
            <span>浏览器目录</span>
            <code>{mediaRootLocalPathDialog.root.path}</code>
          </div>
          <label className="media-root-label-field">
            <span>本机绝对路径</span>
            <input
              autoFocus
              type="text"
              value={mediaRootLocalPathDialog.value}
              placeholder="D:\\Media\\Anime"
              onChange={(event) => updateMediaRootLocalPathValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitMediaRootLocalPath();
                if (event.key === "Escape") closeMediaRootLocalPathDialog();
              }}
              disabled={mediaRootLocalPathDialog.isSaving}
            />
          </label>
          {mediaRootLocalPathDialog.error ? (
            <div className="dialog-inline-error">{mediaRootLocalPathDialog.error}</div>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={closeMediaRootLocalPathDialog}
              disabled={mediaRootLocalPathDialog.isSaving}
            >
              取消
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void submitMediaRootLocalPath()}
              disabled={mediaRootLocalPathDialog.isSaving || !mediaRootLocalPathDialog.value.trim()}
            >
              <HardDrive size={18} />
              {mediaRootLocalPathDialog.isSaving ? "保存中..." : "保存路径"}
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {isFolderDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsFolderDialogOpen(false)}>
        <section
          aria-labelledby="folder-access-title"
          aria-modal="true"
          className="folder-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsFolderDialogOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon">
            <ShieldCheck size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="folder-access-title">添加媒体库</h2>
            <p>播放器只会读取你选择的目录，用来加入全局媒体库、扫描可播放的视频并保存本地播放进度。</p>
          </div>
          <div className="permission-notes">
            <span>不会上传文件</span>
            <span>仅本次选择生效</span>
            <span>可随时取消</span>
          </div>
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={skipFolderAccessPrompt}
              onChange={(event) => updateSkipFolderAccessPrompt(event.target.checked)}
            />
            不再提示，直接新增媒体库
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setIsFolderDialogOpen(false)}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={chooseMediaLibraryDirectory}>
              <FolderOpen size={18} />
              继续添加
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {isEmbeddedSubtitleDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsEmbeddedSubtitleDialogOpen(false)}>
        <section
          aria-labelledby="embedded-subtitle-title"
          aria-modal="true"
          className="embedded-subtitle-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsEmbeddedSubtitleDialogOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="dialog-copy">
            <h2 id="embedded-subtitle-title">内封字幕</h2>
            <p>{embeddedSubtitleMessage || "选择一条文本字幕轨，播放器会提取为 WebVTT 并缓存到本地项目数据目录。"}</p>
          </div>
          <div className="embedded-subtitle-list">
            {embeddedSubtitleTracks.map((track) => (
              <button
                key={track.streamIndex}
                className="embedded-subtitle-track"
                type="button"
                onClick={() => void extractEmbeddedSubtitle(track)}
                disabled={!track.extractable || isEmbeddedSubtitleLoading}
              >
                <strong>
                  #{track.streamIndex} {track.language || "und"} {track.title || ""}
                </strong>
                <span>{track.codec}{track.extractable ? "" : ` · ${track.reason || "暂不支持"}`}</span>
              </button>
            ))}
            {!embeddedSubtitleTracks.length ? <div className="ai-empty-state">没有可用的内封字幕轨。</div> : null}
          </div>
        </section>
      </div>
    ) : null}
    {isCacheStatusDialogOpen ? (
      <div
        className="modal-backdrop"
        role="presentation"
        onMouseDown={() => {
          setIsCacheStatusDialogOpen(false);
          setIsClearCacheConfirmOpen(false);
        }}
      >
        <div
          aria-labelledby="cache-status-title"
          aria-modal="true"
          className="cache-status-modal-shell"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <section className="cache-status-dialog">
            <div className="cache-status-dialog-header">
              <div className="dialog-icon">
                <HardDrive size={28} />
              </div>
              <div>
                <h2 id="cache-status-title">本地缓存状态</h2>
                <span>{cacheStatus?.rootPath || ".local-web-player-data"}</span>
              </div>
            </div>

            <div className="cache-status-overview">
              <div>
                <strong>{cacheStatus ? formatFileSize(cacheStatus.totalBytes) : "0 B"}</strong>
                <span>总大小</span>
              </div>
              <div>
                <strong>{cacheStatus?.totalFiles ?? 0}</strong>
                <span>文件数</span>
              </div>
              <div>
                <strong>{cacheStatus?.items.length ?? 0}</strong>
                <span>缓存种类</span>
              </div>
              <div>
                <strong>{cacheStatus?.updatedAt ? formatModifiedTime(cacheStatus.updatedAt) : "暂无缓存"}</strong>
                <span>最近更新</span>
              </div>
            </div>

            {cacheStatusMessage ? <div className="ai-empty-state">{cacheStatusMessage}</div> : null}
            {isCacheStatusLoading && !cacheStatus ? <div className="ai-loading">正在读取缓存状态...</div> : null}

            <div className="cache-status-toolbar">
              <button
                className={`cache-select-all-button ${isAllCacheSelected ? "active" : ""}`}
                type="button"
                onClick={toggleAllCacheItems}
                disabled={!cacheStatusItems.length || isCacheStatusLoading || isClearingCache}
              >
                {isAllCacheSelected ? "取消全选" : "全选"}
              </button>
              <span>
                已选择 {selectedCacheItems.length} 项 · {formatFileSize(selectedCacheBytes)} · {selectedCacheFiles} 个文件
              </span>
            </div>

            <div className="cache-status-list">
              {pagedCacheStatusItems.map((item) => (
                <label className={`cache-status-row ${selectedCacheItemIds.has(item.id) ? "selected" : ""}`} key={item.id}>
                  <span className="cache-status-check">
                    <input
                      type="checkbox"
                      checked={selectedCacheItemIds.has(item.id)}
                      onChange={(event) => toggleCacheItemSelection(item.id, event.target.checked)}
                      disabled={isClearingCache}
                    />
                  </span>
                  <span className="cache-status-row-main">
                    <strong>{item.label}</strong>
                    <span>{item.path}</span>
                    {item.error ? <small>{item.error}</small> : null}
                  </span>
                  <dl>
                    <div>
                      <dt>大小</dt>
                      <dd>{formatFileSize(item.bytes)}</dd>
                    </div>
                    <div>
                      <dt>数量</dt>
                      <dd>{item.files}</dd>
                    </div>
                    <div>
                      <dt>更新</dt>
                      <dd>{item.updatedAt ? formatModifiedTime(item.updatedAt) : "暂无缓存"}</dd>
                    </div>
                  </dl>
                </label>
              ))}
              {!cacheStatus?.items.length && !isCacheStatusLoading ? (
                <div className="ai-empty-state">暂无缓存状态。</div>
              ) : null}
            </div>

            {cacheStatusItems.length > cacheStatusPageSize ? (
              <nav className="cache-status-pagination" aria-label="缓存状态分页">
                <span>
                  {cacheStatusPageStart}-{cacheStatusPageEnd} / {cacheStatusItems.length}
                </span>
                <div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setCacheStatusPage((page) => Math.max(page - 1, 1))}
                    disabled={visibleCacheStatusPage <= 1}
                  >
                    <ChevronLeft size={16} />
                    上一页
                  </button>
                  <strong>{visibleCacheStatusPage} / {cacheStatusPageCount}</strong>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setCacheStatusPage((page) => Math.min(page + 1, cacheStatusPageCount))}
                    disabled={visibleCacheStatusPage >= cacheStatusPageCount}
                  >
                    下一页
                    <ChevronRight size={16} />
                  </button>
                </div>
              </nav>
            ) : null}
          </section>

          <div className="cache-status-dialog-actions">
            <button className="secondary-button" type="button" onClick={() => void loadCacheStatus()} disabled={isCacheStatusLoading}>
              <RefreshCw size={17} />
              重新检查
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={requestClearSelectedCache}
              disabled={!selectedCacheItems.length || isClearingCache}
            >
              <Trash2 size={17} />
              清除选中缓存
            </button>
            <button className="primary-button" type="button" onClick={() => setIsCacheStatusDialogOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {isClearCacheConfirmOpen ? (
      <div className="modal-backdrop nested" role="presentation" onMouseDown={() => setIsClearCacheConfirmOpen(false)}>
        <section
          aria-labelledby="clear-cache-title"
          aria-modal="true"
          className="delete-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsClearCacheConfirmOpen(false)}
            disabled={isClearingCache}
          >
            <X size={18} />
          </button>
          <div className="dialog-icon danger">
            <Trash2 size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="clear-cache-title">确认清除缓存？</h2>
            <p>将删除选中的本地缓存文件。播放数据、缩略图、字幕和 AI 结果被清除后会在需要时重新生成。</p>
          </div>
          <div className="delete-file-preview">
            <strong>{selectedCacheItems.length} 项缓存 · {formatFileSize(selectedCacheBytes)}</strong>
            <span>{selectedCacheFiles} 个文件</span>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setIsClearCacheConfirmOpen(false)} disabled={isClearingCache}>
              取消
            </button>
            <button className="danger-button" type="button" onClick={() => void confirmClearSelectedCache()} disabled={isClearingCache}>
              <Trash2 size={18} />
              {isClearingCache ? "正在清除..." : "确认清除"}
            </button>
          </div>
        </section>
      </div>
    ) : null}
    {isTagDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsTagDialogOpen(false)}>
        <section
          aria-labelledby="tag-dialog-title"
          aria-modal="true"
          className="tag-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsTagDialogOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="tag-dialog-header">
            <div className="dialog-icon">
              <Tags size={28} />
            </div>
            <div className="dialog-copy">
              <h2 id="tag-dialog-title">视频标签</h2>
              <p>{currentVideo?.name ?? "未选择视频"}</p>
            </div>
          </div>

          <div className="tag-editor-current">
            {currentVideoTags.length ? (
              currentVideoTags.map((tag) => (
                <button className="tag-editor-chip" key={tag} type="button" onClick={() => removeTagFromCurrentVideo(tag)}>
                  <span>{tag}</span>
                  <X size={14} />
                </button>
              ))
            ) : (
              <div className="ai-empty-state">当前视频还没有标签。</div>
            )}
          </div>

          <form
            className="tag-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitTagInput();
            }}
          >
            <input
              autoFocus
              value={tagInput}
              placeholder="输入标签，可用空格、逗号、顿号分隔"
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsTagDialogOpen(false);
              }}
              disabled={!currentVideo}
            />
            <button
              className={`primary-button tag-query-button${isTagSuggestionLoading ? " loading" : ""}`}
              type="submit"
              disabled={!currentVideo || !tagInput.trim() || isTagSuggestionLoading}
            >
              {isTagSuggestionLoading ? <RefreshCw aria-hidden="true" size={16} /> : null}
              {isTagSuggestionLoading ? "查询中" : "添加"}
            </button>
          </form>

          {tagMergePrompt ? (
            <div className="tag-merge-prompt">
              <strong>发现相近标签</strong>
              <p>
                “{tagMergePrompt.suggestion.newTag}” 和已有标签 “{tagMergePrompt.suggestion.existingTag}” 可能是{tagMergePrompt.suggestion.reason}。
              </p>
              <div className="dialog-actions compact">
                <button className="primary-button" type="button" onClick={applyTagMergeSuggestion}>
                  采用已有标签
                </button>
                <button className="secondary-button" type="button" onClick={keepTagMergeSuggestion}>
                  保留新标签
                </button>
                <button className="secondary-button" type="button" onClick={() => setTagMergePrompt(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {tagMessage ? <div className="ai-empty-state">{tagMessage}</div> : null}
        </section>
      </div>
    ) : null}
    {isAiPanelOpen ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsAiPanelOpen(false)}>
        <section
          aria-labelledby="ai-subtitle-title"
          aria-modal="true"
          className="ai-subtitle-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsAiPanelOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="ai-dialog-header">
            <div>
              <h2 id="ai-subtitle-title">AI 字幕助手</h2>
              <span>{selectedSubtitle ? selectedSubtitle.name : "未选择字幕"}</span>
            </div>
            <div className="ai-tabs" role="tablist" aria-label="AI 字幕工具">
              <button className={aiTab === "summary" ? "active" : ""} type="button" onClick={() => setAiTab("summary")}>
                总结
              </button>
              <button className={aiTab === "qa" ? "active" : ""} type="button" onClick={() => setAiTab("qa")}>
                问答
              </button>
              <button className={aiTab === "recap" ? "active" : ""} type="button" onClick={() => setAiTab("recap")}>
                回顾
              </button>
            </div>
          </div>
          {!selectedSubtitle ? (
            <div className="ai-empty-state">请先在播放器控制栏选择字幕。</div>
          ) : !localConfig?.ai.configured ? (
            <div className="ai-empty-state">未配置 DEEPSEEK_API_KEY。配置后重启开发服务即可使用。</div>
          ) : aiTab === "summary" ? (
            <div className="ai-panel-body">
              <div className="dialog-actions compact">
                <button className="primary-button" type="button" onClick={() => void loadSubtitleSummary()} disabled={isAiLoading}>
                  {subtitleSummary ? "重新总结" : "生成总结"}
                </button>
              </div>
              <div className="ai-output">{subtitleSummary || aiMessage || "还没有生成总结。"}</div>
            </div>
          ) : aiTab === "recap" ? (
            <div className="ai-panel-body">
              <div className="ai-recap-meta">截至当前时间 {formatTime(currentTime)}</div>
              <div className="dialog-actions compact">
                <button className="primary-button" type="button" onClick={() => void loadProgressRecap()} disabled={isAiLoading}>
                  {subtitleRecap ? "重新回顾" : "生成回顾"}
                </button>
              </div>
              <div className="ai-output">{subtitleRecap || aiMessage || "还没有生成进度回顾。"}</div>
            </div>
          ) : (
            <form
              className="ai-panel-body"
              onSubmit={(event) => {
                event.preventDefault();
                void askSubtitleQuestion();
              }}
            >
              <textarea
                className="ai-question-input"
                value={subtitleQuestion}
                onChange={(event) => setSubtitleQuestion(event.target.value)}
                placeholder="基于当前字幕提问..."
                rows={4}
              />
              <div className="dialog-actions compact">
                <button className="primary-button" type="submit" disabled={isAiLoading || !subtitleQuestion.trim()}>
                  提问
                </button>
              </div>
              <div className="ai-output">{subtitleAnswer || aiMessage || "回答会显示在这里。"}</div>
            </form>
          )}
          {isAiLoading ? <div className="ai-loading">处理中...</div> : null}
        </section>
      </div>
    ) : null}
    {isShortcutDialogOpen ? (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsShortcutDialogOpen(false)}>
        <section
          aria-labelledby="shortcut-help-title"
          aria-modal="true"
          className="shortcut-dialog"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            aria-label="关闭"
            className="dialog-close"
            type="button"
            onClick={() => setIsShortcutDialogOpen(false)}
          >
            <X size={18} />
          </button>
          <div className="shortcut-dialog-title">
            <Keyboard size={24} />
            <h2 id="shortcut-help-title">快捷键设置</h2>
          </div>
          <p className="shortcut-dialog-note">
            点击按键后按下新的快捷键。Esc 关闭录制，右方向默认同时用于短按快进和长按倍速。
          </p>
          <div className="shortcut-grid">
            {shortcutGroups.map((group) => (
              <section key={group.title} className="shortcut-group">
                <h3>{group.title}</h3>
                <dl>
                  {group.items.map((item) => (
                    <div key={item.action}>
                      <dt>
                        <button
                          className={`shortcut-key-button ${recordingShortcutAction === item.action ? "recording" : ""}`}
                          type="button"
                          onClick={() => {
                            setRecordingShortcutAction(item.action);
                            setShortcutMessage(`按下新的“${item.label}”快捷键`);
                          }}
                          onKeyDown={(event) => handleShortcutCapture(event, item.action)}
                        >
                          {recordingShortcutAction === item.action
                            ? "录制中"
                            : formatShortcutKey(shortcuts[item.action])}
                        </button>
                      </dt>
                      <dd>{item.label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <div className="shortcut-dialog-footer">
            <span>{shortcutMessage || "滚轮仍可在播放器区域调节音量。"}</span>
            <button className="secondary-button" type="button" onClick={resetShortcuts}>
              恢复默认
            </button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
