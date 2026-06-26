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
  mediaRootId?: string;
  playbackSource?: "browser" | "server";
  playability?: VideoPlayability;
};

export type VideoMetadata = Pick<VideoItem, "duration" | "width" | "height">;

export type VideoPlayabilityStatus = "direct" | "remuxRecommended" | "unsupported" | "unknown" | "needsLocalPath";

export type VideoPlayability = {
  status: VideoPlayabilityStatus;
  reason: string;
  compatibleUrl?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  pixelFormat?: string;
};

export type SubtitleItem = {
  id: string;
  name: string;
  relativePath: string;
  file?: File;
  url: string;
  isManual?: boolean;
  source?: "external" | "manual" | "embedded";
  rawText?: string;
  format?: "srt" | "vtt";
  videoId?: string;
  mediaRootId?: string;
  embeddedTrack?: EmbeddedSubtitleTrack;
};

export type EmbeddedSubtitleTrack = {
  streamIndex: number;
  codec: string;
  language?: string;
  title?: string;
  extractable: boolean;
  reason?: string;
};

export type PersistedEmbeddedSubtitle = {
  id: string;
  name: string;
  relativePath: string;
  format: "srt" | "vtt";
  videoId: string;
  embeddedTrack: EmbeddedSubtitleTrack;
};

export type PlaybackProgress = {
  currentTime: number;
  duration: number;
  updatedAt: number;
  completed: boolean;
};

export type ProgressStore = Record<string, PlaybackProgress>;
export type VideoTagStore = Record<string, string[]>;
export type VideoStats = {
  totalPlayedSeconds: number;
  playCount: number;
  durationSeconds: number;
  emissionCount: number;
  lastEmissionAt?: number;
  updatedAt: number;
};
export type VideoStatsStore = Record<string, VideoStats>;
export type TagMergeDecision = {
  from: string;
  to: string;
  decision: "merge" | "keep";
  updatedAt: number;
};
export type TagMergeDecisionStore = Record<string, TagMergeDecision>;

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

export type PlayerMediaRootStatus = {
  id: string;
  label: string;
  source?: "browser" | "local";
  status: "ready" | "needsAccess" | "error";
  videoCount: number;
  scannedFiles: number;
  updatedAt: number;
  error?: string;
};

export type PlayerGlobalMetadata = {
  id: "global";
  name: string;
  videoCount: number;
  scannedFiles: number;
  updatedAt: number;
  mediaRoots: PlayerMediaRootStatus[];
};

export type PlayerDataStore = {
  version?: number;
  progress: ProgressStore;
  favorites: string[];
  videoTags: VideoTagStore;
  videoStats: VideoStatsStore;
  tagMergeDecisions: TagMergeDecisionStore;
  embeddedSubtitles: PersistedEmbeddedSubtitle[];
  preferences: PlayerPreferences;
  settings: PlayerPersistentSettings;
  metadata?: PlayerLibraryMetadata | PlayerGlobalMetadata;
};

export type PlaylistFilter = "all" | "favorites";
export type PlaylistSortMode = "name" | "path" | "modified" | "size";
export type PlaybackMode = "sequential" | "single-loop" | "list-loop" | "shuffle" | "favorites-only";
export type HomeMediaMode = "all" | "anime" | "special";
export type ActiveView = "home" | "player" | "photos" | "photoViewer";
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
  homeMediaMode: HomeMediaMode;
  isSeriesMode: boolean;
  selectedSeriesKey: string;
  isCinemaMode: boolean;
};

export type HomeVideoCard = {
  video: VideoItem;
  progress?: PlaybackProgress;
  progressPercent: number;
  seriesTitle?: string;
  mediaRootLabel?: string;
  tags?: string[];
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

export type PhotoAlbumImage = {
  id: string;
  name: string;
  relativePath: string;
  url: string;
  file?: File;
  size: number;
  lastModified: number;
  mediaRootId: string;
  index: number;
};

export type PhotoAlbum = {
  id: string;
  title: string;
  relativePath: string;
  mediaRootId: string;
  mediaRootLabel: string;
  coverImageUrl: string;
  imageCount: number;
  totalSize: number;
  updatedAt: number;
  images: PhotoAlbumImage[];
};

export type PhotoAlbumProgress = {
  imageIndex: number;
  updatedAt: number;
  completed: boolean;
};

export type PhotoAlbumSortMode = "updated" | "name" | "count";

export type PhotoAlbumPreferences = {
  sortMode: PhotoAlbumSortMode;
  favoritesOnly: boolean;
};

export type PhotoAlbumStore = {
  version?: number;
  favorites: string[];
  progress: Record<string, PhotoAlbumProgress>;
  preferences: PhotoAlbumPreferences;
};

export type PhotoAlbumRootStatus = PlayerMediaRootStatus;

export type PhotoAlbumScanResponse = {
  roots: Array<{
    root: {
      id: string;
      label: string;
      basename: string;
      path: string;
      source?: "browser" | "local";
      localPath?: string;
    };
    status: PhotoAlbumRootStatus;
    albums: PhotoAlbum[];
  }>;
  albums: PhotoAlbum[];
  scannedFiles: number;
  metadata: {
    id: "photo-albums";
    name: string;
    albumCount: number;
    scannedFiles: number;
    updatedAt: number;
    mediaRoots: PhotoAlbumRootStatus[];
  };
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}
