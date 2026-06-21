import {
  CheckCircle2,
  FolderOpen,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Trash2,
  X,
  VolumeX,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type PlaybackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
  completed: boolean;
};

type ProgressStore = Record<string, PlaybackProgress>;

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
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

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

function isVideoFile(name: string) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return VIDEO_EXTENSIONS.has(name.slice(dotIndex).toLowerCase());
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
      }
    }
  }

  await walk(directory, []);
  return videos.sort((a, b) => collator.compare(a.relativePath, b.relativePath));
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
  const rightKeyHoldTimerRef = useRef<number | null>(null);
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const progressStoreRef = useRef<ProgressStore>({});
  const clearedProgressVideoIdsRef = useRef(new Set<string>());
  const isRightKeyDownRef = useRef(false);
  const didRightKeyHoldRef = useRef(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [progressStore, setProgressStore] = useState<ProgressStore>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [skipFolderAccessPrompt, setSkipFolderAccessPrompt] = useState(
    () => localStorage.getItem(FOLDER_ACCESS_PROMPT_KEY) === "true",
  );
  const [message, setMessage] = useState("选择一个本地文件夹开始播放");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekStep, setSeekStep] = useState(10);
  const [holdPlaybackRate, setHoldPlaybackRate] = useState(3);
  const [isHoldSpeedActive, setIsHoldSpeedActive] = useState(false);
  const [isAutoNextEnabled, setIsAutoNextEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [adaptiveColumns, setAdaptiveColumns] = useState<{ playerWidth: number; playlistWidth: number } | null>(null);
  const playbackRateRef = useRef(playbackRate);
  const holdPlaybackRateRef = useRef(holdPlaybackRate);
  const isHoldSpeedActiveRef = useRef(isHoldSpeedActive);

  playbackRateRef.current = playbackRate;
  holdPlaybackRateRef.current = holdPlaybackRate;
  isHoldSpeedActiveRef.current = isHoldSpeedActive;

  const currentIndex = useMemo(
    () => videos.findIndex((item) => item.id === currentVideoId),
    [currentVideoId, videos],
  );
  const currentVideo = currentIndex >= 0 ? videos[currentIndex] : null;
  const effectivePlaybackRate = isHoldSpeedActive ? holdPlaybackRate : playbackRate;
  const playbackRateOptions = useMemo(() => {
    if (rates.includes(effectivePlaybackRate)) return rates;
    return [...rates, effectivePlaybackRate].sort((a, b) => a - b);
  }, [effectivePlaybackRate]);
  const shellStyle = useMemo(
    () =>
      ({
        "--player-column-width": adaptiveColumns ? `${adaptiveColumns.playerWidth}px` : "1fr",
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
      const frame = playerRef.current;
      if (!shell || !frame || window.innerWidth <= 980) {
        setAdaptiveColumns(null);
        return;
      }

      const shellStyles = window.getComputedStyle(shell);
      const gap = Number.parseFloat(shellStyles.columnGap) || 16;
      const availableWidth = shell.clientWidth;
      const controlsHeight = controlBarRef.current?.getBoundingClientRect().height ?? 0;
      const frameHeight = frame.getBoundingClientRect().height;
      const videoHeight = Math.max(240, frameHeight - controlsHeight);
      const minPlayerWidth = 420;
      const minPlaylistWidth = 280;
      const desiredPlayerWidth = Math.round(videoHeight * videoAspectRatio);
      const maxPlayerWidth = Math.max(minPlayerWidth, availableWidth - gap - minPlaylistWidth);
      const playerWidth = clamp(desiredPlayerWidth, minPlayerWidth, maxPlayerWidth);
      const playlistWidth = Math.max(minPlaylistWidth, Math.round(availableWidth - gap - playerWidth));

      setAdaptiveColumns((previous) => {
        if (
          previous &&
          Math.abs(previous.playerWidth - playerWidth) < 2 &&
          Math.abs(previous.playlistWidth - playlistWidth) < 2
        ) {
          return previous;
        }
        return { playerWidth, playlistWidth };
      });
    };

    updateAdaptiveColumns();

    const resizeObserver = new ResizeObserver(updateAdaptiveColumns);
    if (appShellRef.current) resizeObserver.observe(appShellRef.current);
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
      const [nextVideos, nextProgressStore] = await Promise.all([collectVideos(directory), loadProgressStore(directory)]);
      directoryRef.current = directory;
      progressStoreRef.current = nextProgressStore;
      setProgressStore(nextProgressStore);
      setVideos((previous) => {
        previous.forEach((video) => URL.revokeObjectURL(video.url));
        return nextVideos;
      });
      setCurrentVideoId(nextVideos[0]?.id ?? null);
      setMessage(nextVideos.length ? `已加载 ${nextVideos.length} 个视频` : "这个文件夹里没有可播放的视频文件");
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
      videos.forEach((video) => URL.revokeObjectURL(video.url));
    };
  }, [videos]);

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

  useEffect(() => {
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
      element.playbackRate = isHoldSpeedActiveRef.current ? holdPlaybackRateRef.current : playbackRateRef.current;
      element.play().catch(() => undefined);
    };

    element.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    element.load();

    return () => {
      element.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [currentVideo]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.volume = volume;
  }, [volume]);

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

  const seekBy = useCallback(
    (seconds: number) => {
      const element = videoRef.current;
      if (!element || !Number.isFinite(element.duration)) return;
      seekTo(element.currentTime + seconds);
    },
    [seekTo],
  );

  const adjustVolume = useCallback((delta: number) => {
    const element = videoRef.current;
    const nextVolume = clamp((element?.volume ?? volume) + delta, 0, 1);
    setVolume(nextVolume);
    if (element) {
      element.volume = nextVolume;
    }
  }, [volume]);

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
      if (!currentVideo || isFormControl(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          togglePlay();
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
  }, [adjustVolume, clearRightKeyHoldTimer, currentVideo, seekBy, seekStep, stopHoldSpeed, togglePlay]);

  useEffect(() => {
    if (!isHoldSpeedActive) return;
    window.addEventListener("blur", stopHoldSpeed);
    return () => {
      window.removeEventListener("blur", stopHoldSpeed);
    };
  }, [isHoldSpeedActive, stopHoldSpeed]);

  const toggleFullscreen = async () => {
    if (!playerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current.requestFullscreen();
      }
    } catch {
      setMessage("无法进入全屏模式");
    }
  };

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
            />
          ) : (
            <div className="empty-player">
              <FolderOpen size={40} />
              <span>{message}</span>
            </div>
          )}

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
              <input
                aria-label="播放进度"
                className="timeline"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={duration ? currentTime : 0}
                onChange={(event) => seekTo(Number(event.target.value))}
                style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
                disabled={!currentVideo}
              />
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
                <Volume2 size={18} />
                <input
                  aria-label="音量"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
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

              <span className="control-spacer" />

              <button className="icon-button" type="button" onClick={togglePictureInPicture} disabled={!currentVideo} title="画中画">
                <PictureInPicture2 size={20} />
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
            const metadataRows = videoMetadataRows(video);
            return (
              <div
                key={video.id}
                className={`playlist-item ${isActive ? "active" : ""}`}
              >
                <button className="playlist-select" type="button" onClick={() => selectVideo(video.id)}>
                  <span className="episode-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="episode-main">
                    <strong>{video.name}</strong>
                    <small>{video.relativePath}</small>
                    <span className="episode-meta">
                      {metadataRows.map(([metaLabel, value]) => (
                        <span key={metaLabel}>
                          <b>{metaLabel}</b>
                          {value}
                        </span>
                      ))}
                    </span>
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
    </>
  );
}
