import {
  ArrowDownUp,
  CheckCircle2,
  FolderOpen,
  Keyboard,
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
  file: File;
  url: string;
  size: number;
  lastModified: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  thumbnailStatus?: "idle" | "loading" | "ready" | "failed";
};

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
type PlaylistSortMode = "name" | "path" | "modified";
type PlaybackMode = "sequential" | "single-loop" | "list-loop" | "shuffle" | "favorites-only";

type PlayerPreferences = {
  playlistSortMode: PlaylistSortMode;
  isPlaylistSortReversed: boolean;
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);
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
  { value: "name", label: "文件名" },
  { value: "path", label: "路径" },
  { value: "modified", label: "修改时间" },
];
const volumeStep = 0.05;
const controlsAutoHideDelay = 2500;
const rightKeyHoldDelay = 350;
const doubleClickFeedbackDelay = 650;
const defaultPlayerPreferences: PlayerPreferences = {
  playlistSortMode: "name",
  isPlaylistSortReversed: false,
};

const shortcutGroups = [
  {
    title: "播放",
    items: [
      ["空格", "播放 / 暂停"],
      ["← / →", "快退 / 快进"],
      ["长按 →", "临时倍速播放"],
      ["F", "进入 / 退出全屏"],
      ["M", "静音 / 取消静音"],
    ],
  },
  {
    title: "音量",
    items: [
      ["↑ / ↓", "调高 / 调低音量"],
      ["滚轮", "在播放器上滚动调音量"],
    ],
  },
  {
    title: "界面",
    items: [
      ["?", "打开 / 关闭快捷键帮助"],
      ["Esc", "关闭弹窗或退出全屏"],
    ],
  },
] as const;

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

function isVideoFile(name: string) {
  return hasExtension(name, VIDEO_EXTENSIONS);
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

function parsePlayerPreferences(source: unknown): PlayerPreferences {
  if (!source || typeof source !== "object" || Array.isArray(source)) return defaultPlayerPreferences;
  const preferences = source as Partial<PlayerPreferences>;
  return {
    playlistSortMode:
      preferences.playlistSortMode === "path" || preferences.playlistSortMode === "modified"
        ? preferences.playlistSortMode
        : defaultPlayerPreferences.playlistSortMode,
    isPlaylistSortReversed:
      typeof preferences.isPlaylistSortReversed === "boolean"
        ? preferences.isPlaylistSortReversed
        : defaultPlayerPreferences.isPlaylistSortReversed,
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

function progressLabel(progress: PlaybackProgress | null | undefined) {
  if (!progress || !progress.duration) return "未播放";
  if (progress.completed) return "已看完";
  const percent = Math.min(99, Math.round((progress.currentTime / progress.duration) * 100));
  return `${percent}%`;
}

function compareVideos(a: VideoItem, b: VideoItem, mode: PlaylistSortMode) {
  if (mode === "modified") {
    return b.lastModified - a.lastModified || collator.compare(a.relativePath, b.relativePath);
  }

  if (mode === "path") {
    return collator.compare(a.relativePath, b.relativePath);
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

async function collectVideos(directory: FileSystemDirectoryHandle) {
  const videos: VideoItem[] = [];
  const subtitles: SubtitleItem[] = [];

  async function walk(handle: FileSystemDirectoryHandle, segments: string[]) {
    for await (const entry of handle.values()) {
      if (entry.kind === "directory") {
        await walk(entry, [...segments, entry.name]);
      } else if (isVideoFile(entry.name)) {
        const file = await entry.getFile();
        const relativePath = [...segments, entry.name].join("/");
        videos.push({
          id: createVideoId(relativePath, file),
          name: entry.name,
          relativePath,
          file,
          url: URL.createObjectURL(file),
          size: file.size,
          lastModified: file.lastModified,
        });
      } else if (isSubtitleFile(entry.name)) {
        const file = await entry.getFile();
        const relativePath = [...segments, entry.name].join("/");
        subtitles.push({
          id: `${relativePath}|${file.size}|${file.lastModified}`,
          name: entry.name,
          relativePath,
          file,
          url: "",
        });
      }
    }
  }

  await walk(directory, []);
  return {
    videos: videos.sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
    subtitles: subtitles.sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
  };
}

function collectVideosFromFiles(files: FileList | File[]) {
  const videos: VideoItem[] = [];
  const subtitles: SubtitleItem[] = [];

  for (const file of Array.from(files)) {
    const browserRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relativePath = (browserRelativePath || file.name).replace(/\\/g, "/");
    const name = relativePath.split("/").pop() || file.name;

    if (isVideoFile(name)) {
      videos.push({
        id: createVideoId(relativePath, file),
        name,
        relativePath,
        file,
        url: URL.createObjectURL(file),
        size: file.size,
        lastModified: file.lastModified,
      });
    } else if (isSubtitleFile(name)) {
      subtitles.push({
        id: `${relativePath}|${file.size}|${file.lastModified}`,
        name,
        relativePath,
        file,
        url: "",
      });
    }
  }

  return {
    videos: videos.sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
    subtitles: subtitles.sort((a, b) => collator.compare(a.relativePath, b.relativePath)),
  };
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
  return new Promise<Blob>((resolve, reject) => {
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
  });
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

    const width = element.videoWidth;
    const height = element.videoHeight;
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
      context.drawImage(element, drawLeft, drawTop, drawWidth, drawHeight);

      const blob = await encodeCanvasAsJpeg(canvas);
      if (!fallbackBlob) fallbackBlob = blob;
      if (!isCanvasNearlyBlack(context, canvas.width, canvas.height)) {
        cleanup();
        return blob;
      }
    }

    cleanup();
    return fallbackBlob ?? (await encodeCanvasAsJpeg(canvas));
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function loadVideoThumbnail(video: VideoItem) {
  const cachedThumbnail = await readCachedThumbnail(video.id).catch(() => null);
  if (cachedThumbnail) return URL.createObjectURL(cachedThumbnail);

  const thumbnailBlob = await createVideoThumbnailBlob(video);
  void writeCachedThumbnail(video.id, thumbnailBlob).catch(() => undefined);
  return URL.createObjectURL(thumbnailBlob);
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
  const controlsHideTimerRef = useRef<number | null>(null);
  const doubleClickFeedbackTimerRef = useRef<number | null>(null);
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
  const thumbnailObserverRef = useRef<IntersectionObserver | null>(null);
  const clearedProgressVideoIdsRef = useRef(new Set<string>());
  const isRightKeyDownRef = useRef(false);
  const didRightKeyHoldRef = useRef(false);
  const isRightMouseDownRef = useRef(false);
  const didRightMouseHoldRef = useRef(false);
  const didRightMouseStartPlaybackRef = useRef(false);
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
  const [isScanning, setIsScanning] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
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
  const [volume, setVolume] = useState(readStoredVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekStep, setSeekStep] = useState(10);
  const [holdPlaybackRate, setHoldPlaybackRate] = useState(3);
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
  const playbackRateRef = useRef(playbackRate);
  const holdPlaybackRateRef = useRef(holdPlaybackRate);
  const isHoldSpeedActiveRef = useRef(isHoldSpeedActive);

  playbackRateRef.current = playbackRate;
  holdPlaybackRateRef.current = holdPlaybackRate;
  isHoldSpeedActiveRef.current = isHoldSpeedActive;
  videosRef.current = videos;
  subtitlesRef.current = subtitles;

  const playlistVideos = useMemo(
    () => getSortedVideos(videos, playlistSortMode, isPlaylistSortReversed),
    [isPlaylistSortReversed, playlistSortMode, videos],
  );
  const currentIndex = useMemo(
    () => playlistVideos.findIndex((item) => item.id === currentVideoId),
    [currentVideoId, playlistVideos],
  );
  const currentVideo = useMemo(
    () => videos.find((item) => item.id === currentVideoId) ?? null,
    [currentVideoId, videos],
  );
  const visibleVideos = useMemo(
    () =>
      playlistFilter === "favorites"
        ? playlistVideos.filter((video) => favoriteVideoIds.has(video.id))
        : playlistVideos,
    [favoriteVideoIds, playlistFilter, playlistVideos],
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

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (!isFullscreen || !isPlaying || !currentVideo) return;
    controlsHideTimerRef.current = window.setTimeout(() => {
      setAreControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, controlsAutoHideDelay);
  }, [clearControlsHideTimer, currentVideo, isFullscreen, isPlaying]);

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
      URL.revokeObjectURL(video.url);
      if (video.thumbnailUrl) URL.revokeObjectURL(video.thumbnailUrl);
    });
  }, []);

  const setVideoThumbnailState = useCallback((videoId: string, status: VideoItem["thumbnailStatus"], url?: string) => {
    setVideos((previous) => {
      let didChange = false;
      const nextVideos = previous.map((video) => {
        if (video.id !== videoId) return video;
        didChange = true;
        if (video.thumbnailUrl && video.thumbnailUrl !== url) {
          URL.revokeObjectURL(video.thumbnailUrl);
        }
        return { ...video, thumbnailStatus: status, thumbnailUrl: url };
      });
      if (didChange) videosRef.current = nextVideos;
      return didChange ? nextVideos : previous;
    });
  }, []);

  const requestVideoThumbnail = useCallback(
    (videoId: string) => {
      const video = videosRef.current.find((item) => item.id === videoId);
      if (!video || video.thumbnailStatus === "loading" || video.thumbnailStatus === "ready") return;
      setVideoThumbnailState(videoId, "loading");
      loadVideoThumbnail(video)
        .then((thumbnailUrl) => setVideoThumbnailState(videoId, "ready", thumbnailUrl))
        .catch(() => setVideoThumbnailState(videoId, "failed"));
    },
    [setVideoThumbnailState],
  );

  const registerThumbnailTarget = useCallback(
    (videoId: string, element: HTMLElement | null) => {
      if (!element) return;
      element.dataset.videoId = videoId;
      const observer = thumbnailObserverRef.current;
      if (observer) {
        observer.observe(element);
        return;
      }

      requestVideoThumbnail(videoId);
    },
    [requestVideoThumbnail],
  );

  const updateVideoMetadata = useCallback(
    (videoId: string, metadata: Pick<VideoItem, "duration" | "width" | "height">) => {
      setVideos((previous) =>
        previous.map((video) => {
          if (video.id !== videoId) return video;
          const nextDuration = metadata.duration && Number.isFinite(metadata.duration) ? metadata.duration : undefined;
          const nextWidth = metadata.width && metadata.width > 0 ? metadata.width : undefined;
          const nextHeight = metadata.height && metadata.height > 0 ? metadata.height : undefined;
          if (video.duration === nextDuration && video.width === nextWidth && video.height === nextHeight) {
            return video;
          }
          return {
            ...video,
            duration: nextDuration,
            width: nextWidth,
            height: nextHeight,
          };
        }),
      );
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
    didRightMouseStartPlaybackRef.current = false;
    rightMousePointerIdRef.current = null;
    isHoldSpeedActiveRef.current = false;
    setIsHoldSpeedActive(false);
  }, []);

  const selectVideo = useCallback(
    (videoId: string) => {
      persistCurrentProgress();
      resetHoldSpeedState();
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
    [focusPlayer, persistCurrentProgress, resetHoldSpeedState],
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
      const maxFrameHeight = Math.max(240, playerColumn.clientHeight - topBarHeight - playerColumnGap);
      const maxVideoHeight = Math.max(180, maxFrameHeight - controlsHeight);
      const minPlayerWidth = 420;
      const minPlaylistWidth = 280;
      const desiredPlayerWidth = Math.round(maxVideoHeight * videoAspectRatio);
      const maxPlayerWidth = Math.max(minPlayerWidth, availableWidth - gap - minPlaylistWidth);
      const playerWidth = clamp(desiredPlayerWidth, minPlayerWidth, maxPlayerWidth);
      const videoHeight = Math.min(maxVideoHeight, playerWidth / videoAspectRatio);
      const playerHeight = Math.round(videoHeight + controlsHeight);
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

  const getNextVideoId = useCallback(
    (mode: PlaybackMode) => {
      if (!playlistVideos.length || currentIndex < 0) return null;

      if (mode === "single-loop") {
        return currentVideoId;
      }

      if (mode === "shuffle") {
        if (playlistVideos.length === 1) return currentVideoId;
        const candidates = playlistVideos.filter((video) => video.id !== currentVideoId);
        return candidates[Math.floor(Math.random() * candidates.length)]?.id ?? null;
      }

      if (mode === "favorites-only") {
        const favoriteVideos = playlistVideos.filter((video) => favoriteVideoIds.has(video.id));
        if (!favoriteVideos.length) return null;
        const favoriteIndex = favoriteVideos.findIndex((video) => video.id === currentVideoId);
        if (favoriteIndex < 0) return favoriteVideos[0].id;
        return favoriteIndex < favoriteVideos.length - 1 ? favoriteVideos[favoriteIndex + 1].id : null;
      }

      if (currentIndex < playlistVideos.length - 1) {
        return playlistVideos[currentIndex + 1].id;
      }

      return mode === "list-loop" ? playlistVideos[0].id : null;
    },
    [currentIndex, currentVideoId, favoriteVideoIds, playlistVideos],
  );

  const playNext = useCallback(() => {
    const nextVideoId = getNextVideoId(playbackMode);
    if (!nextVideoId) {
      if (playbackMode === "favorites-only" && !favoriteVideoIds.size) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    selectVideo(nextVideoId);
  }, [favoriteVideoIds.size, getNextVideoId, playbackMode, selectVideo]);

  const canPlayNext = useMemo(() => Boolean(getNextVideoId(playbackMode)), [getNextVideoId, playbackMode]);

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

      const [media, nextDataStore] = await Promise.all([collectVideos(directory), loadPlayerDataStore(directory)]);
      const nextSubtitles = await Promise.all(
        media.subtitles.map(async (subtitle) => ({
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        })),
      );

      directoryRef.current = directory;
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
      videosRef.current = media.videos;
      subtitlesRef.current = nextSubtitles;
      setVideos(media.videos);
      setSubtitles(nextSubtitles);
      setSelectedSubtitleId("off");
      setPlaylistFilter("all");
      const resumeTarget = getLatestResumableVideo(media.videos, nextDataStore.progress);
      const sortedVideos = getSortedVideos(
        media.videos,
        nextDataStore.preferences.playlistSortMode,
        nextDataStore.preferences.isPlaylistSortReversed,
      );
      setCurrentVideoId(resumeTarget?.video.id ?? sortedVideos[0]?.id ?? null);
      setMessage(
        resumeTarget
          ? `继续从 ${formatTime(resumeTarget.progress.currentTime)} 播放：${resumeTarget.video.name}`
          : media.videos.length
            ? `${options?.restored ? "已恢复" : "已加载"} ${media.videos.length} 个视频`
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
        media.videos.length ? `已加载 ${media.videos.length} 个视频，${messageSuffix}` : "没有找到可播放的视频文件",
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
    thumbnailObserverRef.current?.disconnect();
    if (!playlistRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const videoId = (entry.target as HTMLElement).dataset.videoId;
          if (videoId) {
            requestVideoThumbnail(videoId);
            observer.unobserve(entry.target);
          }
        });
      },
      { root: playlistRef.current, rootMargin: "160px 0px", threshold: 0.01 },
    );

    thumbnailObserverRef.current = observer;
    playlistRef.current
      .querySelectorAll<HTMLElement>("[data-video-id]")
      .forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      if (thumbnailObserverRef.current === observer) {
        thumbnailObserverRef.current = null;
      }
    };
  }, [requestVideoThumbnail, visibleVideos]);

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
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
    };
  }, [revokeVideoUrls]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
      setAreControlsVisible(true);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen || !isPlaying) {
      setAreControlsVisible(true);
      clearControlsHideTimer();
      return;
    }

    scheduleControlsHide();
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, isFullscreen, isPlaying, scheduleControlsHide]);

  useLayoutEffect(() => {
    const element = videoRef.current;
    if (!element || !currentVideo) return;

    const progress = progressStoreRef.current[currentVideo.id];
    const resumeAt =
      progress && !progress.completed && progress.currentTime < Math.max(0, progress.duration - 8)
        ? progress.currentTime
        : 0;

    const handleLoadedMetadata = () => {
      setDuration(element.duration || 0);
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setVideoAspectRatio(element.videoWidth / element.videoHeight);
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

    element.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    element.playbackRate = isHoldSpeedActiveRef.current ? holdPlaybackRateRef.current : playbackRateRef.current;
    element.load();
    element.play().catch(() => undefined);

    return () => {
      element.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [currentVideo, updateVideoMetadata]);

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
      if (!timeline || !currentVideo || duration <= 0) {
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
    [currentVideo, duration],
  );

  const updateTimelinePreviewFromTime = useCallback(
    (time: number, isDragging = false) => {
      if (!currentVideo || duration <= 0) {
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
    [currentVideo, duration],
  );

  const hideTimelinePreview = useCallback(() => {
    setTimelinePreview((previous) =>
      previous.isDragging ? previous : { ...previous, isVisible: false, isDragging: false },
    );
  }, []);

  const stopTimelineDragPreview = useCallback(() => {
    setTimelinePreview((previous) => ({ ...previous, isVisible: false, isDragging: false }));
  }, []);

  const captureTimelineFrame = useCallback((time: number) => {
    const previewVideo = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!previewVideo || !canvas || !currentVideo || duration <= 0 || previewVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
      return;
    }

    const requestId = timelineFrameRequestRef.current + 1;
    timelineFrameRequestRef.current = requestId;
    const targetTime = clamp(time, 0, Math.max(0, previewVideo.duration || duration));
    setTimelinePreview((previous) => (previous.isVisible ? { ...previous, isLoadingFrame: true } : previous));

    const drawFrame = () => {
      if (timelineFrameRequestRef.current !== requestId) return;
      const context = canvas.getContext("2d");
      const sourceWidth = previewVideo.videoWidth;
      const sourceHeight = previewVideo.videoHeight;
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
  }, [currentVideo, duration]);

  useEffect(() => {
    if (timelineFrameTimerRef.current) {
      window.clearTimeout(timelineFrameTimerRef.current);
      timelineFrameTimerRef.current = null;
    }

    if (!timelinePreview.isVisible || !currentVideo || duration <= 0) {
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
  }, [captureTimelineFrame, currentVideo, duration, timelinePreview.isVisible, timelinePreview.time]);

  const seekBy = useCallback(
    (seconds: number) => {
      const element = videoRef.current;
      if (!element || !Number.isFinite(element.duration)) return;
      seekTo(element.currentTime + seconds);
    },
    [seekTo],
  );

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

  const changeVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = clamp(nextVolume, 0, 1);
    setVolume(normalizedVolume);
    if (normalizedVolume > 0) {
      setIsMuted(false);
    }
  }, []);

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

  const stopHoldSpeed = useCallback(() => {
    setIsHoldSpeedActive(false);
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
    didRightMouseStartPlaybackRef.current = false;
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
      const element = videoRef.current;
      didRightMouseStartPlaybackRef.current = Boolean(element?.paused);
      if (element?.paused) {
        element.play().catch(() => {
          didRightMouseStartPlaybackRef.current = false;
        });
      }
      clearRightMouseHoldTimer();
      rightMouseHoldTimerRef.current = window.setTimeout(() => {
        const element = videoRef.current;
        if (!element || !isRightMouseDownRef.current) return;
        didRightMouseHoldRef.current = true;
        element.playbackRate = holdPlaybackRateRef.current;
        isHoldSpeedActiveRef.current = true;
        setIsHoldSpeedActive(true);
        rightMouseHoldTimerRef.current = null;
      }, rightKeyHoldDelay);
    },
    [clearRightMouseHoldTimer, currentVideo, revealControls],
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
      rightMousePointerIdRef.current = null;
      isRightMouseDownRef.current = false;
      if (didRightMouseHoldRef.current) {
        didRightMouseHoldRef.current = false;
        stopHoldSpeed();
      } else if (didRightMouseStartPlaybackRef.current) {
        videoRef.current?.pause();
      }
      didRightMouseStartPlaybackRef.current = false;
    },
    [clearRightMouseHoldTimer, stopHoldSpeed],
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
      if (event.key === "Escape" && isShortcutDialogOpen) {
        event.preventDefault();
        setIsShortcutDialogOpen(false);
        return;
      }

      if (event.key === "?" && !isFormControl(event.target)) {
        event.preventDefault();
        toggleShortcutDialog();
        return;
      }

      if (!currentVideo || isShortcutDialogOpen || isFormControl(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          togglePlay();
        }
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (!event.repeat) {
          toggleMute();
        }
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!event.repeat) {
          void toggleFullscreen();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-seekStep);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.repeat || isRightKeyDownRef.current) return;
        isRightKeyDownRef.current = true;
        didRightKeyHoldRef.current = false;
        clearRightKeyHoldTimer();
        rightKeyHoldTimerRef.current = window.setTimeout(() => {
          didRightKeyHoldRef.current = true;
          setIsHoldSpeedActive(true);
          rightKeyHoldTimerRef.current = null;
        }, rightKeyHoldDelay);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        adjustVolume(volumeStep);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        adjustVolume(-volumeStep);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" || !isRightKeyDownRef.current) return;
      event.preventDefault();
      clearRightKeyHoldTimer();
      isRightKeyDownRef.current = false;
      if (didRightKeyHoldRef.current) {
        didRightKeyHoldRef.current = false;
        stopHoldSpeed();
      } else if (currentVideo && !isFormControl(event.target)) {
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
    clearRightKeyHoldTimer,
    currentVideo,
    seekBy,
    seekStep,
    stopHoldSpeed,
    toggleFullscreen,
    toggleMute,
    togglePlay,
    toggleShortcutDialog,
    stopRightMouseHoldSpeed,
    isShortcutDialogOpen,
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
      if (rightMouseHoldTimerRef.current) {
        window.clearTimeout(rightMouseHoldTimerRef.current);
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
      if (playbackMode === "favorites-only" && !favoriteVideoIds.size) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    selectVideo(nextVideoId);
  };

  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
    <main
      className={`app-shell ${isDragActive ? "drag-active" : ""}`}
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
          <div>
            <h1>本地视频播放器</h1>
            <p>{currentVideo ? currentVideo.relativePath : message}</p>
            {currentVideo ? (
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
          <button className="primary-button" type="button" onClick={requestFolderAccess} disabled={isScanning}>
            <FolderOpen size={18} />
            {isScanning ? "扫描中" : "选择文件夹"}
          </button>
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
            if (isFullscreen) scheduleControlsHide();
            stopRightMouseHoldSpeed();
          }}
          tabIndex={-1}
        >
          {currentVideo ? (
            <>
              <video
                ref={videoRef}
                className="video-element"
                src={currentVideo.url}
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
              <video
                ref={previewVideoRef}
                className="timeline-preview-video"
                src={currentVideo.url}
                muted
                preload="metadata"
                playsInline
                tabIndex={-1}
              />
              <canvas ref={previewCanvasRef} className="timeline-preview-canvas" width={192} height={108} />
            </>
          ) : (
            <div className="empty-player">
              <FolderOpen size={40} />
              <span>{message}</span>
            </div>
          )}

          {doubleClickFeedback ? (
            <div className={`double-click-feedback ${doubleClickFeedback.side}`} aria-live="polite">
              {doubleClickFeedback.text}
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
                    const nextTime = Number(event.target.value);
                    seekTo(nextTime);
                    updateTimelinePreviewFromTime(nextTime, timelinePreview.isDragging);
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    updateTimelinePreview(event.clientX, true);
                  }}
                  onPointerMove={(event) => updateTimelinePreview(event.clientX, timelinePreview.isDragging)}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    stopTimelineDragPreview();
                  }}
                  onPointerCancel={stopTimelineDragPreview}
                  onPointerLeave={hideTimelinePreview}
                style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
                  disabled={!currentVideo}
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
              <button className="icon-button" type="button" onClick={toggleFullscreen} disabled={!currentVideo} title="全屏">
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="playlist-panel">
        <div className="playlist-header">
          <div>
            <h2>播放列表</h2>
            <span>
              {videos.length
                ? playlistFilter === "favorites"
                  ? `${visibleVideos.length} / ${videos.length} 个收藏`
                  : `${videos.length} 个视频`
                : "等待选择文件夹"}
            </span>
          </div>
          <div className="playlist-tools">
            <label className="playlist-sort">
              排序
              <select
                aria-label="播放列表排序方式"
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
            </label>
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
                收藏
              </button>
            </div>
            <button
              className="playlist-clear-button"
              type="button"
              onClick={clearFolderProgress}
              disabled={!videos.length || !Object.keys(progressStore).length}
              title="清空当前文件夹观看记录"
            >
              <Trash2 size={16} />
              清空记录
            </button>
          </div>
        </div>

        <div className="playlist" ref={playlistRef}>
          {visibleVideos.map((video) => {
            const isActive = video.id === currentVideoId;
            const label = progressLabel(progressStore[video.id]);
            const playlistIndex = playlistVideos.findIndex((item) => item.id === video.id);
            const isFavorite = favoriteVideoIds.has(video.id);
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
                  ref={(element) => registerThumbnailTarget(video.id, element)}
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
                    <span className="episode-progress compact">
                      {label === "已看完" ? <CheckCircle2 size={15} /> : null}
                      {label}
                    </span>
                  </span>
                </button>
                <span className="episode-progress">
                  {label === "已看完" ? <CheckCircle2 size={15} /> : null}
                  {label}
                </span>
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
                    disabled={label === "已看完"}
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
                </span>
              </div>
            );
          })}

          {!videos.length ? <div className="empty-list">{message}</div> : null}
          {videos.length && !visibleVideos.length ? <div className="empty-list">还没有收藏的视频</div> : null}
        </div>
      </aside>
    </main>
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
            <h2 id="shortcut-help-title">快捷键帮助</h2>
          </div>
          <div className="shortcut-grid">
            {shortcutGroups.map((group) => (
              <section key={group.title} className="shortcut-group">
                <h3>{group.title}</h3>
                <dl>
                  {group.items.map(([key, description]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
