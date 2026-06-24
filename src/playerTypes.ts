export type FileSystemDirectoryHandle = {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  kind: "directory";
  name: string;
};

export type FileSystemFileHandle = {
  getFile(): Promise<File>;
  createWritable?(): Promise<LocalWritableFileStream>;
  kind: "file";
  name: string;
};

export type DataTransferItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null>;
};

export type LocalWritableFileStream = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

export type VideoItem = {
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

export type VideoMetadata = Pick<VideoItem, "duration" | "width" | "height">;

export type SubtitleItem = {
  id: string;
  name: string;
  relativePath: string;
  file: File;
  url: string;
  isManual?: boolean;
};

export type PlaybackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
  completed: boolean;
};

export type ProgressStore = Record<string, PlaybackProgress>;

export type PlayerPersistentSettings = {
  volume: number;
  skipFolderAccessPrompt: boolean;
};

export type PlayerLibraryMetadata = {
  id: string;
  name: string;
  videoCount: number;
  scannedFiles: number;
  updatedAt: number;
};

export type PlayerDataStore = {
  version?: number;
  progress: ProgressStore;
  favorites: string[];
  preferences: PlayerPreferences;
  settings: PlayerPersistentSettings;
  metadata?: PlayerLibraryMetadata;
};

export type PlaylistFilter = "all" | "favorites";
export type PlaylistSortMode = "name" | "path" | "modified" | "size";
export type PlaybackMode = "sequential" | "single-loop" | "list-loop" | "shuffle" | "favorites-only";
export type ActiveView = "home" | "player";
export type AutoNextPrompt = {
  nextVideoId: string;
  nextVideoName: string;
  remainingSeconds: number;
};
export type ShortcutAction =
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
export type ShortcutMap = Record<ShortcutAction, string>;

export type PlayerPreferences = {
  playlistSortMode: PlaylistSortMode;
  isPlaylistSortReversed: boolean;
  shortcuts: ShortcutMap;
  isSeriesMode: boolean;
  selectedSeriesKey: string;
  isCinemaMode: boolean;
};

export type HomeVideoCard = {
  video: VideoItem;
  progress?: PlaybackProgress;
  progressPercent: number;
  seriesTitle?: string;
};

export type MediaCollection = {
  videos: VideoItem[];
  subtitles: SubtitleItem[];
  scannedFiles: number;
  filteredSmallVideos: number;
};

export type MediaScanBatch = {
  videos: VideoItem[];
  subtitles: SubtitleItem[];
  scannedFiles: number;
  filteredSmallVideos: number;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}
