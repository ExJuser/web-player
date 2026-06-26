import type { PlaybackMode, PlayerPreferences, PlaylistSortMode, ShortcutAction, ShortcutMap } from "./playerTypes";

export const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v", ".mkv"]);
export const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);
export const MIN_LOCAL_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
export const IGNORED_VIDEO_BASENAMES = new Set(["theme_video", "trailer"]);
export const PROGRESS_FILE_NAME = ".local-web-player-progress.json";
export const RECENT_FOLDER_DB_NAME = "local-web-player";
export const RECENT_FOLDER_STORE_NAME = "handles";
export const RECENT_FOLDER_KEY = "recent-folder";
export const PHOTO_ALBUM_FOLDER_KEY = "photo-album-folder";
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const rates = [0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const seekSteps = [5, 10, 15];
export const holdRates = [1.5, 2, 2.5, 3, 4];
export const playbackModeOptions: Array<{ value: PlaybackMode; label: string }> = [
  { value: "sequential", label: "顺序播放" },
  { value: "single-loop", label: "单集循环" },
  { value: "list-loop", label: "列表循环" },
  { value: "shuffle", label: "随机播放" },
  { value: "favorites-only", label: "只播收藏" },
];
export const playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }> = [
  { value: "size", label: "大小" },
  { value: "name", label: "文件名" },
  { value: "path", label: "路径" },
  { value: "modified", label: "修改时间" },
  { value: "playedDuration", label: "播放时长" },
  { value: "playIntensity", label: "播放强度" },
  { value: "playCount", label: "播放次数" },
  { value: "emissionCount", label: "发射次数" },
];
export const volumeStep = 0.05;
export const controlsAutoHideDelay = 2500;
export const autoNextPromptSeconds = 5;
export const rightKeyHoldDelay = 350;
export const doubleClickFeedbackDelay = 650;
export const mediaScanBatchSize = 150;
export const mediaScanBatchDelay = 500;
export const playlistItemHeight = 76;
export const playlistVirtualOverscan = 10;
export const thumbnailCacheVersion = "v2";
export const thumbnailWidth = 960;
export const thumbnailHeight = 540;
export const thumbnailCacheTimeout = 3000;
export const thumbnailGenerationTimeout = 12000;
export const thumbnailEncodeTimeout = 3000;
export const playlistScrollFrameDelay = 16;
export const defaultShortcuts: ShortcutMap = {
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
export const defaultPlayerPreferences: PlayerPreferences = {
  playlistSortMode: "name",
  isPlaylistSortReversed: false,
  shortcuts: defaultShortcuts,
  homeMediaMode: "all",
  isSeriesMode: false,
  selectedSeriesKey: "all",
  isCinemaMode: false,
};

export const defaultPlayerSettings = {
  volume: 0.85,
  skipFolderAccessPrompt: false,
};

export const shortcutGroups: Array<{ title: string; items: Array<{ action: ShortcutAction; label: string }> }> = [
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
