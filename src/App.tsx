import {
  ArrowDownUp,
  ArrowUp,
  CheckCircle2,
  FolderOpen,
  EyeOff,
  Keyboard,
  LocateFixed,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Star,
  Subtitles,
  Trash2,
  X,
  VolumeX,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type FileSystemDirectoryHandle = {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  kind: "directory";
  name: string;
};

type FileSystemFileHandle = {
  getFile(): Promise<File>;
  createWritable?(): Promise<LocalWritableFileStream>;
  kind: "file";
  name: string;
};

type DataTransferItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null>;
};

type LocalWritableFileStream = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

type VideoItem = {
  id: string;
  name: string;
  relativePath: string;
  file?: File;
  url: string;
  size: number;
  lastModified: number;
  source?: "local";
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  thumbnailStatus?: "idle" | "loading" | "ready" | "failed";
  parentDirectory?: FileSystemDirectoryHandle;
};

type VideoMetadata = Pick<VideoItem, "duration" | "width" | "height">;

type SubtitleItem = {
  id: string;
  name: string;
  relativePath: string;
  file: File;
  url: string;
  isManual?: boolean;
};

type PlaybackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
  completed: boolean;
};

type ProgressStore = Record<string, PlaybackProgress>;

type PlayerDataStore = {
  progress: ProgressStore;
  favorites: string[];
  preferences: PlayerPreferences;
};

type PlaylistFilter = "all" | "favorites";
type PlaylistSortMode = "name" | "path" | "modified" | "size";
type PlaybackMode = "sequential" | "single-loop" | "list-loop" | "shuffle" | "favorites-only";
type AutoNextPrompt = {
  nextVideoId: string;
  nextVideoName: string;
  remainingSeconds: number;
};
type ShortcutAction =
  | "togglePlay"
  | "seekBackward"
  | "seekForward"
  | "holdSpeed"
  | "volumeUp"
  | "volumeDown"
  | "toggleMute"
  | "toggleFullscreen"
  | "toggleFavorite"
  | "markCompleted"
  | "playNext"
  | "togglePrivacy"
  | "toggleCinema"
  | "toggleShortcuts";
type ShortcutMap = Record<ShortcutAction, string>;

type PlayerPreferences = {
  playlistSortMode: PlaylistSortMode;
  isPlaylistSortReversed: boolean;
  shortcuts: ShortcutMap;
  isSeriesMode: boolean;
  selectedSeriesKey: string;
  isCinemaMode: boolean;
};

type MediaCollection = {
  videos: VideoItem[];
  subtitles: SubtitleItem[];
  scannedFiles: number;
  filteredSmallVideos: number;
};

type MediaScanBatch = {
  videos: VideoItem[];
  subtitles: SubtitleItem[];
  scannedFiles: number;
  filteredSmallVideos: number;
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);
const MIN_LOCAL_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const IGNORED_VIDEO_BASENAMES = new Set(["theme_video", "trailer"]);
const PROGRESS_FILE_NAME = ".local-web-player-progress.json";
const FOLDER_ACCESS_PROMPT_KEY = "local-web-player:skip-folder-access-prompt";
const VOLUME_STORAGE_KEY = "local-web-player:volume";
const RECENT_FOLDER_DB_NAME = "local-web-player";
const RECENT_FOLDER_STORE_NAME = "handles";
const THUMBNAIL_STORE_NAME = "thumbnails";
const RECENT_FOLDER_KEY = "recent-folder";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const seekSteps = [5, 10, 15];
const holdRates = [1.5, 2, 2.5, 3, 4];
const playbackModeOptions: Array<{ value: PlaybackMode; label: string }> = [
  { value: "sequential", label: "顺序播放" },
  { value: "single-loop", label: "单集循环" },
  { value: "list-loop", label: "列表循环" },
  { value: "shuffle", label: "随机播放" },
  { value: "favorites-only", label: "只播收藏" },
];
const playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }> = [
  { value: "size", label: "大小" },
  { value: "name", label: "文件名" },
  { value: "path", label: "路径" },
  { value: "modified", label: "修改时间" },
];
const volumeStep = 0.05;
const controlsAutoHideDelay = 2500;
const autoNextPromptSeconds = 5;
const rightKeyHoldDelay = 350;
const doubleClickFeedbackDelay = 650;
const mediaScanBatchSize = 150;
const mediaScanBatchDelay = 500;
const playlistItemHeight = 86;
const playlistVirtualOverscan = 10;
const thumbnailCacheTimeout = 3000;
const thumbnailGenerationTimeout = 12000;
const thumbnailEncodeTimeout = 3000;
const playlistScrollFrameDelay = 16;
const defaultShortcuts: ShortcutMap = {
  togglePlay: "Space",
  seekBackward: "ArrowLeft",
  seekForward: "ArrowRight",
  holdSpeed: "ArrowRight",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  toggleMute: "KeyM",
  toggleFullscreen: "KeyF",
  toggleFavorite: "KeyS",
  markCompleted: "KeyC",
  playNext: "KeyN",
  togglePrivacy: "KeyP",
  toggleCinema: "KeyT",
  toggleShortcuts: "Slash",
};
const defaultPlayerPreferences: PlayerPreferences = {
  playlistSortMode: "name",
  isPlaylistSortReversed: false,
  shortcuts: defaultShortcuts,
  isSeriesMode: false,
  selectedSeriesKey: "all",
  isCinemaMode: false,
};

const shortcutGroups: Array<{ title: string; items: Array<{ action: ShortcutAction; label: string }> }> = [
  {
    title: "播放",
    items: [
      { action: "togglePlay", label: "播放 / 暂停" },
      { action: "seekBackward", label: "快退" },
      { action: "seekForward", label: "快进" },
      { action: "holdSpeed", label: "按住临时倍速" },
      { action: "playNext", label: "下一集" },
    ],
  },
  {
    title: "播放状态",
    items: [
      { action: "toggleFullscreen", label: "进入 / 退出全屏" },
      { action: "toggleFavorite", label: "收藏 / 取消收藏" },
      { action: "markCompleted", label: "标记看完" },
      { action: "toggleMute", label: "静音 / 取消静音" },
    ],
  },
  {
    title: "音量与界面",
    items: [
      { action: "volumeUp", label: "调高音量" },
      { action: "volumeDown", label: "调低音量" },
      { action: "togglePrivacy", label: "隐私模式 / 快速清屏" },
      { action: "toggleCinema", label: "影院模式" },
      { action: "toggleShortcuts", label: "打开快捷键设置" },
    ],
  },
];

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

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

const seasonEpisodePatterns = [
  /\bS\d{1,2}\s*E\d{1,3}\b/i,
  /\b\d{1,2}\s*x\s*\d{1,3}\b/i,
  /第\s*\d{1,2}\s*[季部]\s*(?:第\s*)?\d{1,3}\s*[集话話]\b/i,
];

function findSeasonEpisodeMarker(name: string) {
  for (const pattern of seasonEpisodePatterns) {
    const match = pattern.exec(name);
    if (match?.[0] && typeof match.index === "number") {
      return {
        start: match.index,
        end: match.index + match[0].length,
      };
    }
  }
  return null;
}

function seriesKeyFromTitle(title: string) {
  return title.trim().toLowerCase();
}

function createVideoId(relativePath: string, file: File) {
  return `${relativePath}|${file.size}|${file.lastModified}`;
}

function createProgress(currentTime: number, duration: number, completed = false): PlaybackProgress | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return null;
  return {
    currentTime,
    duration,
    updatedAt: Date.now(),
    completed,
  };
}

function parseProgressItems(source: unknown): ProgressStore {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const store: ProgressStore = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== "object") continue;
    const progress = value as PlaybackProgress;
    if (
      Number.isFinite(progress.currentTime) &&
      Number.isFinite(progress.duration) &&
      Number.isFinite(progress.updatedAt) &&
      typeof progress.completed === "boolean"
    ) {
      store[key] = progress;
    }
  }
  return store;
}

function parseShortcuts(source: unknown): ShortcutMap {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultShortcuts;
  const shortcuts = source as Partial<ShortcutMap>;
  return Object.fromEntries(
    (Object.keys(defaultShortcuts) as ShortcutAction[]).map((action) => [
      action,
      typeof shortcuts[action] === "string" && shortcuts[action] ? shortcuts[action] : defaultShortcuts[action],
    ]),
  ) as ShortcutMap;
}

function parsePlayerPreferences(source: unknown): PlayerPreferences {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultPlayerPreferences;
  const preferences = source as Partial<PlayerPreferences>;
  return {
    playlistSortMode:
      preferences.playlistSortMode === "path" ||
      preferences.playlistSortMode === "modified" ||
      preferences.playlistSortMode === "size"
        ? preferences.playlistSortMode
        : defaultPlayerPreferences.playlistSortMode,
    isPlaylistSortReversed:
      typeof preferences.isPlaylistSortReversed === "boolean"
        ? preferences.isPlaylistSortReversed
        : defaultPlayerPreferences.isPlaylistSortReversed,
    shortcuts: parseShortcuts(preferences.shortcuts),
    isSeriesMode:
      typeof preferences.isSeriesMode === "boolean"
        ? preferences.isSeriesMode
        : defaultPlayerPreferences.isSeriesMode,
    selectedSeriesKey:
      typeof preferences.selectedSeriesKey === "string" && preferences.selectedSeriesKey
        ? preferences.selectedSeriesKey
        : defaultPlayerPreferences.selectedSeriesKey,
    isCinemaMode:
      typeof preferences.isCinemaMode === "boolean"
        ? preferences.isCinemaMode
        : defaultPlayerPreferences.isCinemaMode,
  };
}

function parsePlayerDataStore(raw: string): PlayerDataStore {
  const parsed = JSON.parse(raw) as { items?: unknown; favorites?: unknown; preferences?: unknown };
  const progressSource = parsed && typeof parsed === "object" && parsed.items ? parsed.items : parsed;
  const favorites =
    parsed && typeof parsed === "object" && Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id): id is string => typeof id === "string")
      : [];

  return {
    progress: parseProgressItems(progressSource),
    favorites,
    preferences: parsePlayerPreferences(parsed?.preferences),
  };
}

async function loadPlayerDataStore(directory: FileSystemDirectoryHandle): Promise<PlayerDataStore> {
  try {
    const handle = await directory.getFileHandle(PROGRESS_FILE_NAME);
    const file = await handle.getFile();
    return parsePlayerDataStore(await file.text());
  } catch {
    return { progress: {}, favorites: [], preferences: defaultPlayerPreferences };
  }
}

async function savePlayerDataStore(directory: FileSystemDirectoryHandle, store: PlayerDataStore) {
  const handle = await directory.getFileHandle(PROGRESS_FILE_NAME, { create: true });
  if (!handle.createWritable) throw new Error("The selected folder does not allow file writes.");
  const writable = await handle.createWritable();
  await writable.write(
    JSON.stringify(
      { version: 3, items: store.progress, favorites: store.favorites, preferences: store.preferences },
      null,
      2,
    ),
  );
  await writable.close();
}

function openRecentFolderDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(RECENT_FOLDER_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_FOLDER_STORE_NAME)) {
        request.result.createObjectStore(RECENT_FOLDER_STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        request.result.createObjectStore(THUMBNAIL_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedThumbnail(videoId: string) {
  if (!("indexedDB" in window)) return null;
  const database = await openRecentFolderDatabase();
  return new Promise<Blob | null>((resolve, reject) => {
    const transaction = database.transaction(THUMBNAIL_STORE_NAME, "readonly");
    const request = transaction.objectStore(THUMBNAIL_STORE_NAME).get(videoId);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function writeCachedThumbnail(videoId: string, thumbnail: Blob) {
  if (!("indexedDB" in window)) return;
  const database = await openRecentFolderDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(THUMBNAIL_STORE_NAME, "readwrite");
    transaction.objectStore(THUMBNAIL_STORE_NAME).put(thumbnail, videoId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function readRecentFolderHandle() {
  if (!("indexedDB" in window)) return null;
  const database = await openRecentFolderDatabase();
  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(RECENT_FOLDER_STORE_NAME, "readonly");
    const request = transaction.objectStore(RECENT_FOLDER_STORE_NAME).get(RECENT_FOLDER_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function writeRecentFolderHandle(directory: FileSystemDirectoryHandle) {
  if (!("indexedDB" in window)) return;
  const database = await openRecentFolderDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECENT_FOLDER_STORE_NAME, "readwrite");
    transaction.objectStore(RECENT_FOLDER_STORE_NAME).put(directory, RECENT_FOLDER_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function clearRecentFolderHandle() {
  if (!("indexedDB" in window)) return;
  const database = await openRecentFolderDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECENT_FOLDER_STORE_NAME, "readwrite");
    transaction.objectStore(RECENT_FOLDER_STORE_NAME).delete(RECENT_FOLDER_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function ensureDirectoryPermission(directory: FileSystemDirectoryHandle) {
  const descriptor = { mode: "readwrite" as const };
  const currentPermission = await directory.queryPermission?.(descriptor);
  if (currentPermission === "granted") return true;
  const nextPermission = await directory.requestPermission?.(descriptor);
  return nextPermission !== "denied";
}

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

function formatModifiedTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "未知时间";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatResolution(width?: number, height?: number) {
  if (!width || !height) return "读取中";
  return `${width} x ${height}`;
}

function videoMetadataRows(video: VideoItem) {
  return [
    ["大小", formatFileSize(video.size)],
    ["时长", video.duration ? formatTime(video.duration) : "读取中"],
    ["分辨率", formatResolution(video.width, video.height)],
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
  const storedVolume = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(storedVolume) ? clamp(storedVolume, 0, 1) : 0.85;
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

function compareVideos(a: VideoItem, b: VideoItem, mode: PlaylistSortMode) {
  if (mode === "modified") {
    return b.lastModified - a.lastModified || collator.compare(a.relativePath, b.relativePath);
  }

  if (mode === "path") {
    return collator.compare(a.relativePath, b.relativePath);
  }

  if (mode === "size") {
    return b.size - a.size || collator.compare(a.relativePath, b.relativePath);
  }

  return collator.compare(a.name, b.name) || collator.compare(a.relativePath, b.relativePath);
}

function getSortedVideos(videos: VideoItem[], mode: PlaylistSortMode, isReversed: boolean) {
  const sorted = [...videos].sort((a, b) => compareVideos(a, b, mode));
  return isReversed ? sorted.reverse() : sorted;
}

function getLatestResumableVideo(videos: VideoItem[], progressStore: ProgressStore) {
  return videos
    .map((video) => ({ video, progress: progressStore[video.id] }))
    .filter(({ progress }) => {
      if (!progress || progress.completed || progress.currentTime < 1) return false;
      return progress.currentTime < Math.max(0, progress.duration - 8);
    })
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
    videos: [...collection.videos].sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
    subtitles: [...collection.subtitles].sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
  };
}

function mergeVideoRuntimeState(nextVideos: VideoItem[], previousVideos: VideoItem[]) {
  const previousById = new Map(previousVideos.map((video) => [video.id, video]));
  return nextVideos.map((video) => {
    const previous = previousById.get(video.id);
    if (!previous) return video;
    return {
      ...video,
      duration: previous.duration ?? video.duration,
      width: previous.width ?? video.width,
      height: previous.height ?? video.height,
      thumbnailUrl: previous.thumbnailUrl ?? video.thumbnailUrl,
      thumbnailStatus: previous.thumbnailStatus ?? video.thumbnailStatus,
    };
  });
}

function shouldFlushMediaScan(lastFlushAt: number, pendingVideos: VideoItem[], pendingSubtitles: SubtitleItem[]) {
  return pendingVideos.length + pendingSubtitles.length >= mediaScanBatchSize || Date.now() - lastFlushAt >= mediaScanBatchDelay;
}

async function* collectVideos(directory: FileSystemDirectoryHandle): AsyncGenerator<MediaScanBatch> {
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
            id: createVideoId(relativePath, file),
            name: entry.name,
            relativePath,
            file,
            url: URL.createObjectURL(file),
            size: file.size,
            lastModified: file.lastModified,
            parentDirectory: handle,
          });
        }
      } else if (isSubtitleFile(entry.name)) {
        scannedFiles += 1;
        const file = await entry.getFile();
        const relativePath = [...segments, entry.name].join("/");
        pendingSubtitles.push({
          id: `${relativePath}|${file.size}|${file.lastModified}`,
          name: entry.name,
          relativePath,
          file,
          url: "",
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
        id: createVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: URL.createObjectURL(file),
        size: file.size,
        lastModified: file.lastModified,
      });
    } else if (isSubtitleFile(name)) {
      collection.scannedFiles += 1;
      collection.subtitles.push({
        id: `${relativePath}|${file.size}|${file.lastModified}`,
        name,
        relativePath,
        file,
        url: "",
      });
    }
  }

  return sortMediaCollection(collection);
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

async function createSubtitleUrl(subtitle: SubtitleItem) {
  if (extensionOf(subtitle.name) === ".srt") {
    const vtt = srtToVtt(await subtitle.file.text());
    return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  }
  return URL.createObjectURL(subtitle.file);
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

function getLandscapeDisplaySize(width?: number, height?: number) {
  if (!width || !height) return null;
  return width >= height ? { width, height } : { width: height, height: width };
}

function getLandscapeDisplayAspectRatio(width?: number, height?: number) {
  const displaySize = getLandscapeDisplaySize(width, height);
  return displaySize ? displaySize.width / displaySize.height : 16 / 9;
}

async function loadVideoMetadata(video: VideoItem) {
  const element = document.createElement("video");
  const cleanup = () => {
    element.removeAttribute("src");
    element.load();
  };

  try {
    element.preload = "metadata";
    element.src = video.url;

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
        0.76,
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
    element.src = video.url;

    if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForMediaEvent(element, "loadedmetadata");
    }

    const metadata = getVideoElementMetadata(element);
    const displaySize = getLandscapeDisplaySize(metadata.width, metadata.height);
    const width = displaySize?.width;
    const height = displaySize?.height;
    if (!width || !height) {
      throw new Error("Unable to create thumbnail.");
    }

    canvas.width = 192;
    canvas.height = 108;
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
      context.save();
      if (metadata.width && metadata.height && metadata.width < metadata.height) {
        context.translate(drawLeft + drawWidth / 2, drawTop + drawHeight / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(element, -drawHeight / 2, -drawWidth / 2, drawHeight, drawWidth);
      } else {
        context.drawImage(element, drawLeft, drawTop, drawWidth, drawHeight);
      }
      context.restore();

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

async function loadVideoThumbnail(video: VideoItem) {
  const cachedThumbnail = await withTimeout(
    readCachedThumbnail(video.id),
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
  void writeCachedThumbnail(video.id, thumbnailBlob).catch(() => undefined);
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
  const timelineFrameTimerRef = useRef<number | null>(null);
  const timelineFrameRequestRef = useRef(0);
  const rightKeyHoldTimerRef = useRef<number | null>(null);
  const rightMouseHoldTimerRef = useRef<number | null>(null);
  const rightMousePointerIdRef = useRef<number | null>(null);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const progressStoreRef = useRef<ProgressStore>({});
  const playerPreferencesRef = useRef<PlayerPreferences>(defaultPlayerPreferences);
  const favoriteVideoIdsRef = useRef(new Set<string>());
  const videosRef = useRef<VideoItem[]>([]);
  const subtitlesRef = useRef<SubtitleItem[]>([]);
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
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
  const [progressStore, setProgressStore] = useState<ProgressStore>({});
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<string>>(() => new Set());
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>("all");
  const [playlistSortMode, setPlaylistSortMode] = useState<PlaylistSortMode>(
    defaultPlayerPreferences.playlistSortMode,
  );
  const [isPlaylistSortReversed, setIsPlaylistSortReversed] = useState(
    defaultPlayerPreferences.isPlaylistSortReversed,
  );
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(defaultPlayerPreferences.shortcuts);
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
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<VideoItem | null>(null);
  const [skipFolderAccessPrompt, setSkipFolderAccessPrompt] = useState(
    () => localStorage.getItem(FOLDER_ACCESS_PROMPT_KEY) === "true",
  );
  const [message, setMessage] = useState("选择一个本地文件夹开始播放");
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

  const playlistVideos = useMemo(
    () => getSortedVideos(videos, isSeriesMode ? "name" : playlistSortMode, isSeriesMode ? false : isPlaylistSortReversed),
    [isPlaylistSortReversed, isSeriesMode, playlistSortMode, videos],
  );
  const seriesOptions = useMemo(() => {
    const seriesByKey = new Map<string, { key: string; title: string; count: number }>();
    playlistVideos.forEach((video) => {
      const title = inferSeriesTitle(video);
      const key = seriesKeyFromTitle(title);
      const existing = seriesByKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        seriesByKey.set(key, { key, title, count: 1 });
      }
    });
    return Array.from(seriesByKey.values()).sort((a, b) => collator.compare(a.title, b.title));
  }, [playlistVideos]);
  const seriesTitleByVideoId = useMemo(() => {
    const titles = new Map<string, string>();
    playlistVideos.forEach((video) => titles.set(video.id, inferSeriesTitle(video)));
    return titles;
  }, [playlistVideos]);
  const seriesFilteredVideos = useMemo(() => {
    if (!isSeriesMode || selectedSeriesKey === "all") return playlistVideos;
    return playlistVideos.filter((video) => seriesKeyFromTitle(seriesTitleByVideoId.get(video.id) ?? "") === selectedSeriesKey);
  }, [isSeriesMode, playlistVideos, selectedSeriesKey, seriesTitleByVideoId]);
  const currentVideo = useMemo(
    () => videos.find((item) => item.id === currentVideoId) ?? null,
    [currentVideoId, videos],
  );
  const shouldRotateCurrentVideo = Boolean(
    currentVideo?.width && currentVideo.height && currentVideo.width < currentVideo.height,
  );
  const currentVideoDisplayAspectRatio = currentVideo
    ? getLandscapeDisplayAspectRatio(currentVideo.width, currentVideo.height)
    : 16 / 9;
  const currentVideoSourceAspectRatio = currentVideo?.width && currentVideo.height ? currentVideo.width / currentVideo.height : 9 / 16;
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
  const currentVideoSubtitles = useMemo(() => {
    if (!currentVideo) return [];
    const currentBasePath = basePathOf(currentVideo.relativePath);
    return subtitles.filter((subtitle) => subtitle.isManual || basePathOf(subtitle.relativePath) === currentBasePath);
  }, [currentVideo, subtitles]);
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
    setSelectedSubtitleId("off");
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [cancelAutoNextPrompt, revokeVideoUrls]);

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

  const updateProgress = useCallback(
    (video: VideoItem, currentTime: number, duration: number, completed?: boolean) => {
      if (!completed && clearedProgressVideoIdsRef.current.has(video.id)) {
        if (currentTime < 0.5) return;
        clearedProgressVideoIdsRef.current.delete(video.id);
      }

      const previous = progressStoreRef.current[video.id];
      const progress = createProgress(currentTime, duration, completed ?? previous?.completed ?? false);
      const directory = directoryRef.current;
      if (!progress || !directory) return;

      const nextStore = {
        ...progressStoreRef.current,
        [video.id]: progress,
      };
      progressStoreRef.current = nextStore;
      setProgressStore(nextStore);

      savePlayerDataStore(directory, {
        progress: nextStore,
        favorites: Array.from(favoriteVideoIdsRef.current),
        preferences: playerPreferencesRef.current,
      }).catch(() => {
        setMessage(`无法写入 ${PROGRESS_FILE_NAME}，请重新选择文件夹并允许保存进度。`);
      });
    },
    [],
  );

  const replaceProgressStore = useCallback((nextStore: ProgressStore, successMessage?: string) => {
    const directory = directoryRef.current;
    if (!directory) return;

    progressStoreRef.current = nextStore;
    setProgressStore(nextStore);

    savePlayerDataStore(directory, {
      progress: nextStore,
      favorites: Array.from(favoriteVideoIdsRef.current),
      preferences: playerPreferencesRef.current,
    })
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage(`无法写入 ${PROGRESS_FILE_NAME}，请重新选择文件夹并允许保存进度。`);
      });
  }, []);

  const replaceFavorites = useCallback((nextFavorites: Set<string>, successMessage?: string) => {
    const directory = directoryRef.current;
    if (!directory) return;

    favoriteVideoIdsRef.current = nextFavorites;
    setFavoriteVideoIds(new Set(nextFavorites));

    savePlayerDataStore(directory, {
      progress: progressStoreRef.current,
      favorites: Array.from(nextFavorites),
      preferences: playerPreferencesRef.current,
    })
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage(`无法写入 ${PROGRESS_FILE_NAME}，请重新选择文件夹并允许保存收藏。`);
      });
  }, []);

  const replacePlayerPreferences = useCallback((nextPreferences: PlayerPreferences) => {
    playerPreferencesRef.current = nextPreferences;
    setPlaylistSortMode(nextPreferences.playlistSortMode);
    setIsPlaylistSortReversed(nextPreferences.isPlaylistSortReversed);
    setShortcuts(nextPreferences.shortcuts);
    setIsSeriesMode(nextPreferences.isSeriesMode);
    setSelectedSeriesKey(nextPreferences.selectedSeriesKey);
    setIsCinemaMode(nextPreferences.isCinemaMode);

    const directory = directoryRef.current;
    if (!directory) return;

    savePlayerDataStore(directory, {
      progress: progressStoreRef.current,
      favorites: Array.from(favoriteVideoIdsRef.current),
      preferences: nextPreferences,
    }).catch(() => {
      setMessage(`无法写入 ${PROGRESS_FILE_NAME}，请重新选择文件夹并允许保存排序设置。`);
    });
  }, []);

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

  const toggleSeriesMode = useCallback(() => {
    const nextSeriesMode = !playerPreferencesRef.current.isSeriesMode;
    const currentSeriesKey =
      currentVideo && nextSeriesMode
        ? seriesKeyFromTitle(seriesTitleByVideoId.get(currentVideo.id) ?? inferSeriesTitle(currentVideo))
        : playerPreferencesRef.current.selectedSeriesKey;
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isSeriesMode: nextSeriesMode,
      selectedSeriesKey: nextSeriesMode ? currentSeriesKey : "all",
    });
  }, [currentVideo, replacePlayerPreferences, seriesTitleByVideoId]);

  const updateSelectedSeries = useCallback(
    (nextSeriesKey: string) => {
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        selectedSeriesKey: nextSeriesKey,
      });
    },
    [replacePlayerPreferences],
  );

  const toggleCinemaMode = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isCinemaMode: !playerPreferencesRef.current.isCinemaMode,
    });
    focusPlayer();
  }, [focusPlayer, replacePlayerPreferences]);

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
      setMessage("当前加载方式不支持删除本地文件，请通过“选择文件夹”重新加载后再试。");
      return;
    }

    setDeleteCandidate(video);
  }, []);

  const deleteLocalVideo = useCallback(
    async (video: VideoItem) => {
      const parentDirectory = video.parentDirectory;
      if (!parentDirectory?.removeEntry) {
        setMessage("当前加载方式不支持删除本地文件，请通过“选择文件夹”重新加载后再试。");
        return;
      }

      try {
        const rootDirectory = directoryRef.current;
        if (!rootDirectory || !(await ensureDirectoryPermission(rootDirectory))) {
          setMessage("需要允许文件夹写入权限，才能删除本地文件。");
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
        delete nextProgressStore[video.id];
        nextFavoriteVideoIds.delete(video.id);
        clearedProgressVideoIdsRef.current.delete(video.id);
        if (video.thumbnailUrl) URL.revokeObjectURL(video.thumbnailUrl);
        URL.revokeObjectURL(video.url);

        videosRef.current = nextVideos;
        progressStoreRef.current = nextProgressStore;
        favoriteVideoIdsRef.current = nextFavoriteVideoIds;
        setVideos(nextVideos);
        setProgressStore(nextProgressStore);
        setFavoriteVideoIds(nextFavoriteVideoIds);

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
          setSelectedSubtitleId("off");
          setIsPlaying(false);
        }

        if (rootDirectory) {
          await savePlayerDataStore(rootDirectory, {
            progress: nextProgressStore,
            favorites: Array.from(nextFavoriteVideoIds),
            preferences: playerPreferencesRef.current,
          });
        }

        setMessage(`已删除本地文件《${video.name}》`);
      } catch {
        setMessage("删除本地文件失败，请确认浏览器仍有文件夹写入权限。");
      }
    },
    [currentVideoId],
  );

  const confirmDeleteLocalVideo = useCallback(async () => {
    if (!deleteCandidate) return;
    const target = deleteCandidate;
    setDeleteCandidate(null);
    await deleteLocalVideo(target);
  }, [deleteCandidate, deleteLocalVideo]);

  const clearFolderProgress = useCallback(() => {
    if (!videos.length) return;
    const element = videoRef.current;
    if (element && Number.isFinite(element.duration)) {
      element.currentTime = 0;
    }
    setCurrentTime(0);
    replaceProgressStore({}, "已清空当前文件夹的观看记录");
  }, [replaceProgressStore, videos.length]);

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

  const selectVideo = useCallback(
    (videoId: string) => {
      cancelAutoNextPrompt();
      persistCurrentProgress();
      resetHoldSpeedState();
      pendingAutoPlayVideoIdRef.current = videoId;
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
      setSelectedSubtitleId("off");
      setVideoAspectRatio(16 / 9);
      focusPlayer();
    },
    [cancelAutoNextPrompt, focusPlayer, persistCurrentProgress, resetHoldSpeedState],
  );

  useEffect(() => {
    if (isFullscreen) {
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
      const maxFrameHeight = Math.max(240, playerColumn.clientHeight - topBarHeight - playerColumnGap);
      const maxVideoHeight = Math.max(180, maxFrameHeight - controlsHeight - frameBorderY);
      const minPlayerWidth = 420;
      const minPlaylistWidth = 280;
      const desiredPlayerWidth = maxVideoHeight * videoAspectRatio + frameBorderX;
      const maxPlayerWidth = Math.max(minPlayerWidth, availableWidth - gap - minPlaylistWidth);
      const playerWidth = clamp(desiredPlayerWidth, minPlayerWidth, maxPlayerWidth);
      const videoWidth = Math.max(0, playerWidth - frameBorderX);
      const videoHeight = Math.min(maxVideoHeight, videoWidth / videoAspectRatio);
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
  }, [isFullscreen, videoAspectRatio]);

  useEffect(() => {
    if (!isSeriesMode || !currentVideo) return;
    const currentSeriesKey = seriesKeyFromTitle(seriesTitleByVideoId.get(currentVideo.id) ?? inferSeriesTitle(currentVideo));
    if (currentSeriesKey === selectedSeriesKey) return;
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      selectedSeriesKey: currentSeriesKey,
    });
  }, [currentVideo, isSeriesMode, replacePlayerPreferences, selectedSeriesKey, seriesTitleByVideoId]);

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
    async (directory: FileSystemDirectoryHandle, options?: { remember?: boolean; restored?: boolean }) => {
      setIsFolderDialogOpen(false);
      setIsScanning(true);
      setMessage(options?.restored ? "正在恢复上次文件夹..." : "正在扫描视频文件...");

      const canUseDirectory = await ensureDirectoryPermission(directory);
      if (!canUseDirectory) {
        if (options?.remember) {
          await clearRecentFolderHandle().catch(() => undefined);
        }
        setMessage("需要允许写入文件夹，才能在本地保存播放进度。");
        return;
      }

      const dataStorePromise = loadPlayerDataStore(directory);
      let media = createEmptyMediaCollection();
      let hasSelectedInitialVideo = false;
      directoryRef.current = directory;
      const nextDataStore = await dataStorePromise;
      progressStoreRef.current = nextDataStore.progress;
      playerPreferencesRef.current = nextDataStore.preferences;
      favoriteVideoIdsRef.current = new Set(nextDataStore.favorites);
      setProgressStore(nextDataStore.progress);
      setPlaylistSortMode(nextDataStore.preferences.playlistSortMode);
      setIsPlaylistSortReversed(nextDataStore.preferences.isPlaylistSortReversed);
      setFavoriteVideoIds(new Set(nextDataStore.favorites));
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
      videosRef.current = [];
      subtitlesRef.current = [];
      setVideos([]);
      setSubtitles([]);
      setSelectedSubtitleId("off");
      setPlaylistFilter("all");
      setCurrentVideoId(null);

      for await (const batch of collectVideos(directory)) {
        media = mergeMediaBatch(media, batch);
        media = {
          ...media,
          videos: mergeVideoRuntimeState(media.videos, videosRef.current),
        };
        videosRef.current = media.videos;
        setVideos(media.videos);
        setMessage(
          `正在扫描，已找到 ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个小视频，已检查 ${media.scannedFiles} 个媒体文件`,
        );

        if (!hasSelectedInitialVideo && media.videos.length) {
          const resumeTarget = getLatestResumableVideo(media.videos, nextDataStore.progress);
          setCurrentVideoId(resumeTarget?.video.id ?? media.videos[0]?.id ?? null);
          hasSelectedInitialVideo = true;
        }
      }

      media = sortMediaCollection(media);
      media = {
        ...media,
        videos: mergeVideoRuntimeState(media.videos, videosRef.current),
      };
      const nextSubtitles = await Promise.all(
        media.subtitles.map(async (subtitle) => ({
          ...subtitle,
          url: subtitle.url || (await createSubtitleUrl(subtitle)),
        })),
      );
      media = { ...media, subtitles: nextSubtitles };
      videosRef.current = media.videos;
      subtitlesRef.current = media.subtitles;
      setVideos(media.videos);
      setSubtitles(media.subtitles);
      if (media.videos.length) {
        const resumeTarget = getLatestResumableVideo(media.videos, nextDataStore.progress);
        const sortedVideos = getSortedVideos(
          media.videos,
          nextDataStore.preferences.playlistSortMode,
          nextDataStore.preferences.isPlaylistSortReversed,
        );
        setCurrentVideoId((currentId) => currentId ?? resumeTarget?.video.id ?? sortedVideos[0]?.id ?? null);
      }
      setMessage(
        media.videos.length
          ? `${options?.restored ? "已恢复" : "已加载"} ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个 50 MB 以下小视频`
          : "这个文件夹里没有可播放的视频文件",
      );

      if (options?.remember) {
        await writeRecentFolderHandle(directory).catch(() => undefined);
      }
    },
    [revokeVideoUrls],
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
      progressStoreRef.current = {};
      playerPreferencesRef.current = {
        playlistSortMode,
        isPlaylistSortReversed,
        shortcuts,
        isSeriesMode,
        selectedSeriesKey,
        isCinemaMode,
      };
      favoriteVideoIdsRef.current = new Set();
      setProgressStore({});
      setFavoriteVideoIds(new Set());
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
      videosRef.current = media.videos;
      subtitlesRef.current = nextSubtitles;
      setVideos(media.videos);
      setSubtitles(nextSubtitles);
      setSelectedSubtitleId("off");
      setPlaylistFilter("all");
      setCurrentVideoId(getSortedVideos(media.videos, playlistSortMode, isPlaylistSortReversed)[0]?.id ?? null);
      setMessage(
        media.videos.length
          ? `已加载 ${media.videos.length} 个视频，已过滤 ${media.filteredSmallVideos} 个 50 MB 以下小视频，${messageSuffix}`
          : "没有找到可播放的视频文件",
      );
    },
    [isPlaylistSortReversed, playlistSortMode, revokeVideoUrls],
  );

  const chooseFolderWithFileInput = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = Array.from(new Set([...VIDEO_EXTENSIONS, ...SUBTITLE_EXTENSIONS])).join(",");
    input.style.display = "none";
    input.setAttribute("webkitdirectory", "");

    input.onchange = async () => {
      const files = input.files;
      if (!files?.length) {
        input.remove();
        return;
      }

      try {
        await loadFileMedia(files);
      } catch {
        setMessage("无法读取选择的媒体文件");
      } finally {
        setIsScanning(false);
        input.remove();
      }
    };

    document.body.append(input);
    input.click();
  };

  const chooseFolder = async () => {
    if (!window.showDirectoryPicker) {
      chooseFolderWithFileInput();
      return;
    }

    try {
      const directory = await window.showDirectoryPicker({ mode: "readwrite" });
      await loadDirectoryMedia(directory, { remember: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("已取消选择文件夹");
      } else {
        setMessage("扫描文件夹失败，请确认浏览器权限后重试。");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const requestFolderAccess = () => {
    if (!window.showDirectoryPicker) {
      chooseFolderWithFileInput();
      return;
    }

    if (skipFolderAccessPrompt) {
      void chooseFolder();
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
          await loadDirectoryMedia(directory, { remember: true });
          return;
        }

        const handleFiles = await Promise.all(
          handles
            .filter((handle): handle is FileSystemFileHandle => handle.kind === "file")
            .map((handle) => handle.getFile()),
        );
        const droppedFiles = handleFiles.length ? handleFiles : Array.from(event.dataTransfer.files);
        if (!droppedFiles.length) {
          setMessage("当前浏览器不支持拖入文件夹，请使用“选择文件夹”。");
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
    if (checked) {
      localStorage.setItem(FOLDER_ACCESS_PROMPT_KEY, "true");
    } else {
      localStorage.removeItem(FOLDER_ACCESS_PROMPT_KEY);
    }
  };

  useEffect(() => {
    const runId = thumbnailLoadRunIdRef.current + 1;
    thumbnailLoadRunIdRef.current = runId;
    let isCancelled = false;
    const orderedVideoIds = visibleVideos.map((video) => video.id);

    if (isScanning || isMainVideoLoading || !orderedVideoIds.length) {
      return () => {
        isCancelled = true;
      };
    }

    const loadThumbnailsInOrder = async () => {
      for (const videoId of orderedVideoIds) {
        if (isCancelled || thumbnailLoadRunIdRef.current !== runId) return;

        const video = videosRef.current.find((item) => item.id === videoId);
        if (!video || video.thumbnailStatus === "ready" || video.thumbnailStatus === "loading") {
          continue;
        }

        setVideoThumbnailState(video.id, "loading");

        try {
          const { thumbnailUrl, metadata } = await loadVideoThumbnail(video);
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
  }, [isMainVideoLoading, isScanning, setVideoThumbnailState, updateVideoMetadata, visibleVideoIdsKey]);

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
    if (!window.showDirectoryPicker) return;

    let isCancelled = false;
    const restoreRecentFolder = async () => {
      try {
        const directory = await readRecentFolderHandle();
        if (!directory || isCancelled) return;
        await loadDirectoryMedia(directory, { remember: true, restored: true });
      } catch {
        await clearRecentFolderHandle().catch(() => undefined);
        if (!isCancelled) {
          setMessage("无法恢复上次文件夹，请重新选择。");
        }
      } finally {
        if (!isCancelled) {
          setIsScanning(false);
        }
      }
    };

    void restoreRecentFolder();
    return () => {
      isCancelled = true;
    };
  }, [loadDirectoryMedia]);

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

      if (currentVideo.url && element.src !== currentVideo.url) {
        element.src = currentVideo.url;
      }
    });
  }, [currentVideo?.id, currentVideo?.url]);

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
    const resumeAt =
      progress && !progress.completed && progress.currentTime < Math.max(0, progress.duration - 8)
        ? progress.currentTime
        : 0;

    const handleLoadedMetadata = () => {
      setDuration(element.duration || 0);
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setVideoAspectRatio(getLandscapeDisplayAspectRatio(element.videoWidth, element.videoHeight));
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
  }, [currentVideo?.id, currentVideo?.url, updateVideoMetadata]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.volume = volume;
    element.muted = isMuted;
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [currentVideo, isMuted, volume]);

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
      setSelectedSubtitleId("off");
      return;
    }

    const matchedSubtitle = currentVideoSubtitles.find((subtitle) => !subtitle.isManual);
    setSelectedSubtitleId(matchedSubtitle?.id ?? "off");
  }, [currentVideo, currentVideoSubtitles]);

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
      const displaySize = getLandscapeDisplaySize(previewVideo.videoWidth, previewVideo.videoHeight);
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
      context.save();
      if (previewVideo.videoWidth > 0 && previewVideo.videoHeight > 0 && previewVideo.videoWidth < previewVideo.videoHeight) {
        context.translate(drawLeft + drawWidth / 2, drawTop + drawHeight / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(previewVideo, -drawHeight / 2, -drawWidth / 2, drawHeight, drawWidth);
      } else {
        context.drawImage(previewVideo, drawLeft, drawTop, drawWidth, drawHeight);
      }
      context.restore();
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
        setSelectedSubtitleId(subtitleWithUrl.id);
      } catch {
        setMessage("无法读取字幕文件，请确认字幕格式后重试。");
      }
    };
    input.click();
  }, [currentVideo]);

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

      if (!currentVideo || isShortcutDialogOpen || deleteCandidate || isFormControl(event.target)) return;

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
    isCinemaMode,
    isPrivacyMode,
    isShortcutDialogOpen,
    markCurrentVideoCompleted,
    playNext,
    toggleCinemaMode,
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

  const handleTimeUpdate = () => {
    const element = videoRef.current;
    if (!element || !currentVideo) return;
    setCurrentTime(element.currentTime);
    setDuration(element.duration || 0);

    if (saveTimerRef.current) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      updateProgress(currentVideo, element.currentTime, element.duration || 0);
    }, 1500);
  };

  const handleEnded = () => {
    persistCurrentProgress(true);
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

  return (
    <>
    <main
      className={`app-shell ${isDragActive ? "drag-active" : ""} ${isPrivacyMode ? "privacy-mode" : ""} ${isCinemaMode ? "cinema-mode" : ""}`}
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
            {currentVideo && !isPrivacyMode ? null : <h1>{isPrivacyMode ? "在线视频播放器" : "本地视频播放器"}</h1>}
            <p className="current-video-title">
              {isPrivacyMode ? "正在播放：推荐视频" : currentVideo ? currentVideo.relativePath : message}
            </p>
            {currentVideo && !isPrivacyMode ? (
              <dl className="current-video-meta">
                {videoMetadataRows(currentVideo).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div className="top-actions">
            {!isPrivacyMode ? (
              <button className="primary-button" type="button" onClick={requestFolderAccess} disabled={isScanning}>
                <FolderOpen size={18} />
                {isScanning ? "扫描中" : "选择文件夹"}
              </button>
            ) : null}
          </div>
        </header>

        <div
          className={`player-frame ${isFullscreen ? "fullscreen" : ""} ${areControlsVisible ? "" : "controls-hidden"}`}
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
                className={`video-element ${shouldRotateCurrentVideo ? "landscape-rotated" : ""}`}
                style={
                  shouldRotateCurrentVideo
                    ? ({
                        "--landscape-display-aspect-ratio": currentVideoDisplayAspectRatio,
                        "--landscape-source-aspect-ratio": currentVideoSourceAspectRatio,
                      } as React.CSSProperties)
                    : undefined
                }
                onClick={togglePlay}
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  setIsPlaying(false);
                  persistCurrentProgress();
                }}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
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

              <select
                aria-label="播放速度"
                className="rate-select"
                value={effectivePlaybackRate}
                onChange={(event) => setPlaybackRate(Number(event.target.value))}
              >
                {playbackRateOptions.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>

              <label className="settings-control">
                队列
                <select
                  aria-label="播放队列模式"
                  className="compact-select"
                  value={playbackMode}
                  onChange={(event) => setPlaybackMode(event.target.value as PlaybackMode)}
                >
                  {playbackModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-control">
                快进
                <select
                  aria-label="快进快退时间"
                  className="compact-select"
                  value={seekStep}
                  onChange={(event) => setSeekStep(Number(event.target.value))}
                >
                  {seekSteps.map((step) => (
                    <option key={step} value={step}>
                      {step}s
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-control">
                长按右方向
                <select
                  aria-label="长按右方向键倍速"
                  className="compact-select"
                  value={holdPlaybackRate}
                  onChange={(event) => setHoldPlaybackRate(Number(event.target.value))}
                >
                  {holdRates.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}x
                    </option>
                  ))}
                </select>
              </label>

              <label className="subtitle-control">
                <Subtitles size={18} />
                <select
                  aria-label="字幕"
                  className="subtitle-select"
                  value={selectedSubtitleId}
                  onChange={(event) => {
                    if (event.target.value === "manual") {
                      void chooseSubtitleFile();
                      return;
                    }
                    setSelectedSubtitleId(event.target.value);
                  }}
                  disabled={!currentVideo}
                >
                  <option value="off">字幕关闭</option>
                  {currentVideoSubtitles.map((subtitle) => (
                    <option key={subtitle.id} value={subtitle.id}>
                      {subtitle.isManual ? `手动: ${subtitle.name}` : subtitle.name}
                    </option>
                  ))}
                  <option value="manual">选择字幕...</option>
                </select>
              </label>

              <span className="control-spacer" />

              <button className="icon-button" type="button" onClick={togglePictureInPicture} disabled={!currentVideo} title="画中画">
                <PictureInPicture2 size={20} />
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

      {!isPrivacyMode && !isCinemaMode ? (
      <aside className="playlist-panel" aria-label={isSeriesMode ? "追番列表" : "播放列表"}>
        <div className="playlist-header">
          <div className="playlist-title-row">
            <span>
              {videos.length
                ? playlistFilter === "favorites"
                  ? `${visibleVideos.length} / ${videos.length} 个收藏`
                  : isSeriesMode
                    ? `${visibleVideos.length} / ${videos.length} 个视频`
                    : `${videos.length} 个视频`
                : "等待选择文件夹"}
            </span>
          </div>
          <div className={`playlist-tools ${isSeriesMode ? "series-mode" : ""}`}>
            <button
              className={`series-mode-button ${isSeriesMode ? "active" : ""}`}
              type="button"
              onClick={toggleSeriesMode}
              disabled={!videos.length}
              title={isSeriesMode ? "关闭追番模式" : "打开追番模式"}
              aria-pressed={isSeriesMode}
            >
              追番
            </button>
            {isSeriesMode ? (
              <select
                className="series-select"
                aria-label="选择系列"
                value={selectedSeriesKey}
                onChange={(event) => updateSelectedSeries(event.target.value)}
                disabled={!seriesOptions.length}
              >
                <option value="all">全部系列</option>
                {seriesOptions.map((series) => (
                  <option key={series.key} value={series.key}>
                    {series.title} ({series.count})
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className="playlist-sort-select"
              aria-label="播放列表排序方式"
              title="排序方式"
              value={playlistSortMode}
              onChange={(event) => updatePlaylistSortMode(event.target.value as PlaylistSortMode)}
              disabled={!videos.length}
            >
              {playlistSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className={`playlist-order-button ${isPlaylistSortReversed ? "active" : ""}`}
              type="button"
              onClick={togglePlaylistSortDirection}
              disabled={!videos.length}
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
            <div className="playlist-filter" aria-label="播放列表筛选">
              <button
                className={playlistFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => setPlaylistFilter("all")}
                disabled={!videos.length}
              >
                全部
              </button>
              <button
                className={playlistFilter === "favorites" ? "active" : ""}
                type="button"
                onClick={() => setPlaylistFilter("favorites")}
                disabled={!videos.length}
              >
                <Star size={14} />
              </button>
            </div>
            <button
              className="playlist-clear-button icon-only"
              type="button"
              onClick={clearFolderProgress}
              disabled={!videos.length || !Object.keys(progressStore).length}
              title="清空当前文件夹观看记录"
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
            const seasonEpisodeMarker = isSeriesMode ? findSeasonEpisodeMarker(video.name) : null;
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
                    <strong>
                      {seasonEpisodeMarker ? (
                        <>
                          {video.name.slice(0, seasonEpisodeMarker.start)}
                          <mark className="episode-marker">
                            {video.name.slice(seasonEpisodeMarker.start, seasonEpisodeMarker.end)}
                          </mark>
                          {video.name.slice(seasonEpisodeMarker.end)}
                        </>
                      ) : (
                        video.name
                      )}
                    </strong>
                    <small>{video.relativePath}</small>
                    {seriesTitle ? <small className="episode-series">{seriesTitle}</small> : null}
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
          {videos.length && !visibleVideos.length ? <div className="empty-list">还没有收藏的视频</div> : null}
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
            <h2 id="folder-access-title">允许访问本地视频文件夹</h2>
            <p>播放器只会读取你选择的文件夹，用来扫描可播放的视频和保存本地播放进度。</p>
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
            不再提示，直接选择文件夹
          </label>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => setIsFolderDialogOpen(false)}>
              取消
            </button>
            <button className="primary-button" type="button" onClick={chooseFolder}>
              <FolderOpen size={18} />
              继续选择
            </button>
          </div>
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
