import {
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

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);
const PROGRESS_FILE_NAME = ".local-web-player-progress.json";
const FOLDER_ACCESS_PROMPT_KEY = "local-web-player:skip-folder-access-prompt";
const VOLUME_STORAGE_KEY = "local-web-player:volume";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const seekSteps = [5, 10, 15];
const holdRates = [1.5, 2, 2.5, 3, 4];
const volumeStep = 0.05;
const controlsAutoHideDelay = 2500;
const rightKeyHoldDelay = 350;
const doubleClickFeedbackDelay = 650;

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

function parseProgressStore(raw: string): ProgressStore {
  const parsed = JSON.parse(raw) as { items?: unknown };
  const source = parsed && typeof parsed === "object" && parsed.items ? parsed.items : parsed;
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

async function loadProgressStore(directory: FileSystemDirectoryHandle): Promise<ProgressStore> {
  try {
    const handle = await directory.getFileHandle(PROGRESS_FILE_NAME);
    const file = await handle.getFile();
    return parseProgressStore(await file.text());
  } catch {
    return {};
  }
}

async function saveProgressStore(directory: FileSystemDirectoryHandle, store: ProgressStore) {
  const handle = await directory.getFileHandle(PROGRESS_FILE_NAME, { create: true });
  if (!handle.createWritable) throw new Error("The selected folder does not allow file writes.");
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify({ version: 1, items: store }, null, 2));
  await writable.close();
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

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLInputElement | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const playerColumnRef = useRef<HTMLElement | null>(null);
  const topBarRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const controlBarRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const doubleClickFeedbackTimerRef = useRef<number | null>(null);
  const rightKeyHoldTimerRef = useRef<number | null>(null);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const progressStoreRef = useRef<ProgressStore>({});
  const videosRef = useRef<VideoItem[]>([]);
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const clearedProgressVideoIdsRef = useRef(new Set<string>());
  const isRightKeyDownRef = useRef(false);
  const didRightKeyHoldRef = useRef(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
  const [progressStore, setProgressStore] = useState<ProgressStore>({});
  const [isScanning, setIsScanning] = useState(false);
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
  const [isAutoNextEnabled, setIsAutoNextEnabled] = useState(true);
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

  const currentIndex = useMemo(
    () => videos.findIndex((item) => item.id === currentVideoId),
    [currentVideoId, videos],
  );
  const currentVideo = currentIndex >= 0 ? videos[currentIndex] : null;
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

      saveProgressStore(directory, nextStore).catch(() => {
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

    saveProgressStore(directory, nextStore)
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage(`无法写入 ${PROGRESS_FILE_NAME}，请重新选择文件夹并允许保存进度。`);
      });
  }, []);

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
    isRightKeyDownRef.current = false;
    didRightKeyHoldRef.current = false;
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

  const playNext = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= videos.length - 1) return;
    selectVideo(videos[currentIndex + 1].id);
  }, [currentIndex, selectVideo, videos]);

  const chooseFolder = async () => {
    if (!window.showDirectoryPicker) {
      setMessage("当前浏览器不支持 File System Access API，请使用最新版 Chrome 或 Edge。");
      return;
    }

    try {
      setIsFolderDialogOpen(false);
      setIsScanning(true);
      setMessage("正在扫描视频文件...");
      const directory = await window.showDirectoryPicker({ mode: "readwrite" });
      const permission = await directory.requestPermission?.({ mode: "readwrite" });
      if (permission === "denied") {
        setMessage("需要允许写入文件夹，才能在本地保存播放进度。");
        return;
      }
      const [media, nextProgressStore] = await Promise.all([collectVideos(directory), loadProgressStore(directory)]);
      const nextSubtitles = await Promise.all(
        media.subtitles.map(async (subtitle) => ({
          ...subtitle,
          url: await createSubtitleUrl(subtitle),
        })),
      );
      directoryRef.current = directory;
      progressStoreRef.current = nextProgressStore;
      setProgressStore(nextProgressStore);
      videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
      videosRef.current = media.videos;
      subtitlesRef.current = nextSubtitles;
      setVideos(media.videos);
      setSubtitles(nextSubtitles);
      setSelectedSubtitleId("off");
      setCurrentVideoId(media.videos[0]?.id ?? null);
      setMessage(media.videos.length ? `已加载 ${media.videos.length} 个视频` : "这个文件夹里没有可播放的视频文件");
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
      setMessage("当前浏览器不支持 File System Access API，请使用最新版 Chrome 或 Edge。");
      return;
    }

    if (skipFolderAccessPrompt) {
      void chooseFolder();
      return;
    }

    setIsFolderDialogOpen(true);
  };

  const updateSkipFolderAccessPrompt = (checked: boolean) => {
    setSkipFolderAccessPrompt(checked);
    if (checked) {
      localStorage.setItem(FOLDER_ACCESS_PROMPT_KEY, "true");
    } else {
      localStorage.removeItem(FOLDER_ACCESS_PROMPT_KEY);
    }
  };

  useEffect(() => {
    return () => {
      videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
      subtitlesRef.current.forEach((subtitle) => {
        if (subtitle.url) URL.revokeObjectURL(subtitle.url);
      });
    };
  }, []);

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
      setTimelinePreview({
        time: ratio * duration,
        left: ratio * 100,
        isVisible: true,
        isDragging,
      });
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
      setTimelinePreview({
        time: nextTime,
        left: (nextTime / duration) * 100,
        isVisible: true,
        isDragging,
      });
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
    if (isAutoNextEnabled) {
      playNext();
    }
  };

  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <>
    <main className="app-shell" ref={appShellRef} style={shellStyle}>
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
          onDoubleClick={handlePlayerDoubleClick}
          onWheel={handlePlayerWheel}
          onMouseLeave={() => {
            if (isFullscreen) scheduleControlsHide();
          }}
          tabIndex={-1}
        >
          {currentVideo ? (
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
                <output className="timeline-preview">{formatTime(timelinePreview.time)}</output>
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
              <button className="icon-button" type="button" onClick={playNext} disabled={currentIndex >= videos.length - 1} title="下一集">
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

              <label className="auto-next">
                <input
                  type="checkbox"
                  checked={isAutoNextEnabled}
                  onChange={(event) => setIsAutoNextEnabled(event.target.checked)}
                />
                自动连播
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
            <span>{videos.length ? `${videos.length} 个视频` : "等待选择文件夹"}</span>
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

        <div className="playlist">
          {videos.map((video, index) => {
            const isActive = video.id === currentVideoId;
            const label = progressLabel(progressStore[video.id]);
            return (
              <div
                key={video.id}
                className={`playlist-item ${isActive ? "active" : ""}`}
                title={videoMetadataTitle(video)}
              >
                <button className="playlist-select" type="button" onClick={() => selectVideo(video.id)}>
                  <span className="episode-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="episode-main">
                    <strong>{video.name}</strong>
                    <small>{video.relativePath}</small>
                  </span>
                </button>
                <span className="episode-progress">
                  {label === "已看完" ? <CheckCircle2 size={15} /> : null}
                  {label}
                </span>
                <span className="episode-actions">
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
