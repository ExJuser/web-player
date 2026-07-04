import {
  FolderOpen,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import { useAiSubtitleController } from "./useAiSubtitleController";
import { useBangumiMatchController } from "./useBangumiMatchController";
import { useCacheStatusDialog } from "./useCacheStatusDialog";
import { useCompatibleMediaController } from "./useCompatibleMediaController";
import { useDanmakuController } from "./useDanmakuController";
import { useDraggableDialog } from "./useDraggableDialog";
import { useDuplicateDetectionController } from "./useDuplicateDetectionController";
import { useEmbeddedSubtitleController } from "./useEmbeddedSubtitleController";
import { useHomeProgressRecapController } from "./useHomeProgressRecapController";
import { useLibrarySearchState } from "./useLibrarySearchState";
import { useMediaRootLocalPathDialog } from "./useMediaRootLocalPathDialog";
import { useMediaRootPrompts } from "./useMediaRootPrompts";
import { useMediaProbeController } from "./useMediaProbeController";
import { useApplyPlayerDataStore, usePlayerDataRuntime } from "./usePlayerDataRuntime";
import { usePhotoAlbumRuntime } from "./usePhotoAlbumRuntime";
import { usePhotoAlbumTagEditor } from "./usePhotoAlbumTagEditor";
import { usePhotoObjectUrls } from "./usePhotoObjectUrls";
import { useRatingDialog } from "./useRatingDialog";
import { useShortcutSettings } from "./useShortcutSettings";
import { normalizeClientLocalConfig, shouldAutoScanGlobalMediaLibrary, supportsServerFileAccess } from "./localConfigClient";
import {
  buildLibrarySearchCandidates,
  type LibrarySearchCandidate,
} from "./librarySearchUtils";
import {
  buildSpecialModeInsights,
  type SpecialInsightTab,
  type SpecialModeVideoInsight,
} from "./specialInsights";
import {
  buildWatchActivityInsights,
  createLocalDateKey,
  createWatchActivityKey,
  formatWatchActivityDate,
  groupWatchActivityDaysByMonth,
  watchActivityMetricOptions,
  watchActivityRangeOptions,
  type WatchActivityMetric,
  type WatchActivityRange,
} from "./watchActivityInsights";
import type {
  ActiveView,
  AutoNextPrompt,
  DanmakuComment,
  DanmakuPreferences,
  DanmakuSelectionStore,
  DanmakuSource,
  DataTransferItemWithHandle,
  EmbeddedSubtitleTrack,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  HomeVideoCard,
  MediaCollection,
  PlaybackMode,
  PlaybackProgress,
  PlayerDataStore,
  PlayerGlobalMetadata,
  PlayerMediaRootStatus,
  PlayerPersistentSettings,
  PlayerPreferences,
  CachedMediaRootScan,
  CachedPhotoAlbumScan,
  PhotoAlbum,
  PhotoAlbumImage,
  PhotoAlbumProgress,
  PhotoAlbumSortMode,
  PlaylistFilter,
  PlaylistSortMode,
  ProgressStore,
  ShortcutMap,
  SubtitleItem,
  TagMergeDecisionStore,
  VideoHighlightSegment,
  VideoHighlightStore,
  VideoItem,
  VideoMetadata,
  VideoCommentStore,
  VideoRatingStore,
  VideoStatsStore,
  VideoTagStore,
  WatchActivityStore
} from "./playerTypes";
import {
  clearCachedPhotoAlbumScan,
  createPhotoAlbumStats,
  defaultPhotoAlbumPreferences,
  formatPhotoAlbumProgress,
  getPagedPhotoAlbums,
  getPhotoAlbumPageBounds,
  getVisiblePhotoAlbums,
  getVisiblePhotoThumbnails,
  loadCachedPhotoAlbumScan,
  loadPhotoAlbumStore,
  photoAlbumSortOptions,
  saveCachedPhotoAlbumScan,
  savePhotoAlbumFavorite,
  savePhotoAlbumCoverPreference,
  savePhotoAlbumPreferences,
  savePhotoAlbumProgress,
} from "./photoAlbumStorage";
import {
  PROGRESS_FILE_NAME,
  collator,
  createPlaybackRateOptions,
  createRateSelectOptions,
  createSeekStepSelectOptions,
  holdRates,
  playbackModeOptions,
  playlistSortOptions,
  volumeStep,
  controlsAutoHideDelay,
  autoNextPromptSeconds,
  rightKeyHoldDelay,
  doubleClickFeedbackDelay,
  playlistActiveThumbnailRadius,
  playlistScrollFrameDelay,
  defaultPlayerSettings,
  defaultPlayerPreferences,
  defaultDanmakuPreferences,
  shortcutGroups
} from "./playerConstants";
import {
  danmakuLaneLineHeight,
  formatDanmakuLaneTop,
  getActiveDanmakuComments,
  getDanmakuBreakdownTotal,
  getDanmakuLane,
  getDanmakuLaneCount,
  getDanmakuSourceBreakdown,
} from "./danmakuUtils";
import { fallbackMediaRootLabelForVideo } from "./mediaPathUtils";
import {
  basePathOf,
  createLibraryMetadata,
  createLegacyVideoId,
  hasStoredData,
  isObjectUrl,
  isSubtitleFile,
  migrateMovedVideoData,
} from "./playerLibraryUtils";
import {
  inferSeriesTitle,
  scopedSeriesKeyForVideo,
} from "./playerSeriesUtils";
import {
  clamp,
  formatShortcutKey,
  resolveInitialPlaybackTime,
  shortcutCodeFromEvent,
} from "./playerInteractionUtils";
import {
  formatCumulativeDuration,
  formatFileSize,
  formatHomeMeta,
  formatHomeProgressLabel,
  formatLibrarySearchProgressLabel,
  formatModifiedTime,
  formatRelativeTime,
  formatTime,
  formatWatchActivityMetric,
} from "./playerFormatUtils";
import {
  createEmptyMediaCollection,
  getLatestResumableVideo,
  getSortedVideos,
  isResumableProgress,
  mergeMediaBatch,
  mergeVideoRuntimeState,
  rebuildDuplicateVideoGroups,
  sortMediaCollection,
  type DuplicateDetectionProgress,
  type DuplicateVideoGroup,
} from "./playerMediaUtils";
import {
  createPersistedDuplicateDetectionResult,
  pruneDuplicateDetectionsForVideos,
  type DuplicateFingerprintCacheEntry,
  type DuplicateNameSimilarityCacheEntry,
} from "./playerDuplicateRuntime";
import {
  collectPhotoAlbumsFromDirectory,
  createCachedPhotoAlbumScan,
  createPhotoAlbumRootStatusFromCache,
  photoFileExists,
  resolvePhotoAlbumDirectory,
  resolvePhotoParentDirectory,
} from "./photoAlbumScan";
import {
  browserVideoFileExists,
  collectVideos,
  collectVideosFromFiles,
  ensureDirectoryReadPermission,
  hasDirectoryReadPermission,
  resolveBrowserVideoParentDirectory,
} from "./browserMediaScan";
import {
  createSubtitleUrl,
  restoreCachedEmbeddedSubtitles,
} from "./subtitleMedia";
import {
  alignCachedMediaRootScanWithConfig,
  createCachedMediaRootScan,
  type LocalConfig,
  type LocalMediaRoot,
  type MediaRootsScanResponse,
  type ScannedServerSubtitle,
  type ScannedServerVideo,
  type UpsertMediaRootResponse,
} from "./mediaRootScanCache";
import {
  photoAlbumPageSize,
  photoThumbnailWindowSize,
  photoAlbumScanCacheStaleMs,
  shouldStartLegacyThumbnailMigration,
} from "./appConfig";
import type {
  AiTagMergeSuggestionResponse,
  AutoTagSuggestionResponse,
  LibrarySearchResult,
  LibrarySearchSurface,
  PlaybackSourceChoice,
  TagMergePrompt,
} from "./appTypes";
import { ControlSelect } from "./ControlSelect";
import {
  createPersistedEmbeddedSubtitles,
  createDuplicatePlaylistMetaByVideoId,
  createLibraryStats,
  createLibrarySearchScopeKey,
  createMediaRootIdSet,
  createFavoriteHomeCards,
  createNextEpisodeCard,
  createPlaylistPanelLabels,
  createPlaylistPageLabels,
  createPlaylistPageSizeSelectOptions,
  createPlaylistThumbnailVideos,
  createPrimaryHomeCard,
  createRecentHomeCards,
  createThumbnailQueueVideoIds,
  createRatingStats,
  createResumableHomeCards,
  createSeriesOptions,
  createSeriesOptionsKey,
  createSeriesTitleByVideoId,
  createSelectedWatchActivityCards,
  createVideoMetadataRows,
  createVideoMetadataTitle,
  createVideoIndexById,
  createWatchActivityCarouselCardsByDate,
  createWatchActivityCarouselVideoIds,
  countRatingFilterMatches,
  filterVideosBySeries,
  filterRatingPlaylistVideos,
  formatPlaylistVisibleCountLabel,
  getActiveSeriesOption,
  getActiveRatingPlaylistLabel,
  getCompatibleMediaAction,
  getCurrentSeriesKey,
  getDuplicatePlaylistVideos,
  getRatingFilterLabel,
  getHomeMediaModeLabel,
  getPlayableVideoUrl,
  getPlayerMediaModeLabel,
  createSubtitleControlOptions,
  createVideoStatsKey,
  filterMediaRootStatusesByHomeMediaMode,
  filterVideosByHomeMediaMode,
  getHomeModeMediaRoots,
  getFavoritePlaylistVideos,
  isMediaRootInHomeMode,
  isVideoVisible,
  resolvePlaylistIndexVideos,
  resolveSelectedWatchActivityDay,
  resolveVisiblePlaylistVideos,
  resolvePlayerEntrySeriesMode,
  resolveRestoredEmbeddedSubtitleSelection,
  resolveSubtitleSelection,
  shouldShowHomeRecapCard,
  shouldShowNextEpisodeCard,
  type DuplicatePlaylistVideoMeta,
  type HomeMediaMode,
  type RatingFilterOperator,
  type RatingPlaylistMode,
} from "./playerUiState";
import {
  createTagPairKey,
  createTagInputSuggestions,
  findTagMergeSuggestion,
  getActiveTagInputSegment,
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
  deletePlayerProgress,
  hasDirectoryWritePermission,
  isPlayerGlobalMetadata,
  loadCachedMediaRootScan,
  loadLegacyPlayerDataStore,
  loadGlobalPlayerDataStore,
  loadPlayerDataStore,
  migrateLegacyCachedThumbnailsToLocalData,
  readPhotoAlbumFolderHandle,
  saveDanmakuSelection,
  saveCachedMediaRootScan,
  saveGlobalPlayerDataStore,
  savePlayerFavorite,
  savePlayerPreference,
  savePlayerProgress,
  savePlayerSetting,
  saveTagMergeDecisions,
  savePlayerWatchActivity,
  savePlayerVideoHighlights,
  savePlayerVideoStats,
  savePlayerVideoTags,
  writePhotoAlbumFolderHandle,
  writeRecentFolderHandle
} from "./playerStorage";
import {
  getPlayerFrameAspectRatio,
  getVideoDisplaySize,
  getVideoElementMetadata,
  loadVideoThumbnail,
  selectTrustedDuration,
} from "./videoThumbnail";
import {
  blurClickedButton,
  isFormControl,
  readStoredTheme,
  readStoredVolume,
  type AppTheme,
} from "./appBrowserUtils";
import { revokeObjectUrl, revokeObjectUrls } from "./appResourceCleanup";
import { createPrimaryHomeLabels, formatSpecialInsightVideoMetric } from "./appViewModel";
import { AiSubtitleDialog, type AiSubtitleTab } from "./AiSubtitleDialog";
import { DanmakuDialog } from "./DanmakuDialog";
import {
  type CompatibleMediaConfirmState,
  type CompatibleMediaDeleteConfirmState,
  type CompatibleMediaTaskState,
} from "./CompatibleMediaDialogs";
import { DeletionDialogs } from "./DeletionDialogs";
import { DuplicateVideoGroupCard } from "./DuplicateVideoGroupCard";
import { HighEnergyTagDialog, type HighEnergyTagPrompt } from "./HighEnergyTagDialog";
import { HomeNextEpisodeSection } from "./HomeNextEpisodeSection";
import { HomeRecentSection } from "./HomeRecentSection";
import { HomeResumeSection } from "./HomeResumeSection";
import { HomeSideColumn } from "./HomeSideColumn";
import { HomeSpecialInsightsSection } from "./HomeSpecialInsightsSection";
import { HomeCardThumbnail, HomeListCard } from "./HomeVideoCards";
import { MediaRootDialogsGroup } from "./MediaRootDialogsGroup";
import { LibrarySearchResultItem } from "./LibrarySearchResultItem";
import { PhotoAlbumCard } from "./PhotoAlbumCard";
import { PhotoAlbumTagDialog } from "./PhotoAlbumTagDialog";
import type { PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import { PhotoDashboardSection } from "./PhotoDashboardSection";
import { PhotoViewerSection } from "./PhotoViewerSection";
import { PlaylistPanel } from "./PlaylistPanel";
import { PlayerControlBar } from "./PlayerControlBar";
import { PlayerStage } from "./PlayerStage";
import { PlayerTopBar } from "./PlayerTopBar";
import { PlayerUtilityDialogs } from "./PlayerUtilityDialogs";
import { RatingDialog } from "./RatingDialog";
import { ShortcutDialog } from "./ShortcutDialog";
import { TagDialog } from "./TagDialog";
import { WatchActivitySection } from "./WatchActivitySection";

export default function App() {
  const initialVolumeRef = useRef(readStoredVolume());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRef = useRef<HTMLInputElement | null>(null);
  const appShellRef = useRef<HTMLElement | null>(null);
  const playerColumnRef = useRef<HTMLElement | null>(null);
  const topBarRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const danmakuLayerRef = useRef<HTMLDivElement | null>(null);
  const controlBarRef = useRef<HTMLDivElement | null>(null);
  const playlistRef = useRef<HTMLDivElement | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const playbackClockFrameRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveTimerVideoIdRef = useRef<string | null>(null);
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
  const {
    buildPlayerDataStore,
    danmakuPreferencesRef,
    danmakuSelectionsRef,
    directoryRef,
    duplicateDetectionResultsByModeRef,
    favoriteVideoIdsRef,
    hasLoadedPlayerDataStoreRef,
    libraryIdRef,
    libraryMetadataRef,
    playerPreferencesRef,
    playerSettingsRef,
    progressStoreRef,
    saveCurrentPlayerDataStore,
    subtitlesRef,
    tagMergeDecisionsRef,
    videoCommentsRef,
    videoHighlightsRef,
    videoRatingsRef,
    videosRef,
    videoStatsRef,
    videoTagsRef,
    watchActivityRef,
  } = usePlayerDataRuntime(initialVolumeRef.current);
  const localConfigRef = useRef<LocalConfig | null>(null);
  const mediaRootCacheLoadAttemptedRef = useRef(false);
  const cachedEmbeddedSubtitleLookupKeysRef = useRef(new Set<string>());
  const photoAlbumAutoLoadAttemptedRef = useRef(false);
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
  const playbackActivitySessionRef = useRef<{ videoId: string; lastTime: number | null; hasCountedPlay: boolean } | null>(null);
  const photoObjectUrlsRef = useRef<Record<string, string>>({});
  const photoObjectUrlAccessRef = useRef<Record<string, number>>({});
  const decodedPhotoImageIdsRef = useRef(new Set<string>());
  const photoImageFilePromisesRef = useRef<Record<string, Promise<File | null>>>({});
  const librarySearchResultsRef = useRef<HTMLDivElement | null>(null);
  const librarySearchLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const playerLibrarySearchResultsRef = useRef<HTMLDivElement | null>(null);
  const playerLibrarySearchLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const duplicateDetectionRunIdRef = useRef(0);
  const duplicateDetectionAbortRef = useRef<AbortController | null>(null);
  const duplicateFingerprintCacheRef = useRef(new Map<string, DuplicateFingerprintCacheEntry>());
  const duplicateNameSimilarityCacheRef = useRef(new Map<string, DuplicateNameSimilarityCacheEntry>());
  const duplicateVideoGroupsRef = useRef<DuplicateVideoGroup[]>([]);
  const duplicateDetectionResultScopeKeyRef = useRef("");
  const duplicateDetectionMessageRef = useRef("尚未检测重复视频。");

  useEffect(() => {
    if (!shouldStartLegacyThumbnailMigration()) return;
    void migrateLegacyCachedThumbnailsToLocalData().catch(() => undefined);
  }, []);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [danmakuSelections, setDanmakuSelections] = useState<DanmakuSelectionStore>({});
  const [danmakuPreferences, setDanmakuPreferences] = useState<DanmakuPreferences>(defaultDanmakuPreferences);
  const [danmakuComments, setDanmakuComments] = useState<DanmakuComment[]>([]);
  const [currentDanmakuSource, setCurrentDanmakuSource] = useState<DanmakuSource | null>(null);
  const [danmakuManualUrl, setDanmakuManualUrl] = useState("");
  const [danmakuMessage, setDanmakuMessage] = useState("");
  const [isDanmakuSourceDetailOpen, setIsDanmakuSourceDetailOpen] = useState(false);
  const [danmakuLayerHeight, setDanmakuLayerHeight] = useState(0);
  const [isDanmakuDialogOpen, setIsDanmakuDialogOpen] = useState(false);
  const [isDanmakuLoading, setIsDanmakuLoading] = useState(false);
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
  const [compatibleMediaConfirm, setCompatibleMediaConfirm] = useState<CompatibleMediaConfirmState | null>(null);
  const [compatibleMediaDeleteConfirm, setCompatibleMediaDeleteConfirm] = useState<CompatibleMediaDeleteConfirmState | null>(null);
  const [compatibleMediaTask, setCompatibleMediaTask] = useState<CompatibleMediaTaskState | null>(null);
  const compatibleMediaAbortControllerRef = useRef<AbortController | null>(null);
  const [compatibleMediaMessage, setCompatibleMediaMessage] = useState("");
  const [isDeletingCompatibleMedia, setIsDeletingCompatibleMedia] = useState(false);
  const [playbackSourceChoices, setPlaybackSourceChoices] = useState<Record<string, PlaybackSourceChoice>>({});
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiTab, setAiTab] = useState<AiSubtitleTab>("summary");
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
  const [specialInsightTab, setSpecialInsightTab] = useState<SpecialInsightTab>("played");
  const [duplicateVideoGroups, setDuplicateVideoGroups] = useState<DuplicateVideoGroup[]>([]);
  const [duplicateDetectionProgress, setDuplicateDetectionProgress] = useState<DuplicateDetectionProgress | null>(null);
  const [duplicateDetectionMessage, setDuplicateDetectionMessage] = useState("尚未检测重复视频。");
  const [duplicateDetectionResultScopeKey, setDuplicateDetectionResultScopeKey] = useState("");
  const [isDuplicateDetectionRunning, setIsDuplicateDetectionRunning] = useState(false);
  const [isDuplicatePlaylistActive, setIsDuplicatePlaylistActive] = useState(false);
  const [ratingFilterOperator, setRatingFilterOperator] = useState<RatingFilterOperator>("gt");
  const [ratingFilterThreshold, setRatingFilterThreshold] = useState(8);
  const [ratingPlaylistMode, setRatingPlaylistMode] = useState<RatingPlaylistMode | null>(null);
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  currentVideoIdRef.current = currentVideoId;
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [photoAlbums, setPhotoAlbums] = useState<PhotoAlbum[]>([]);
  const [photoRootStatuses, setPhotoRootStatuses] = useState<PlayerMediaRootStatus[]>([]);
  const [selectedPhotoAlbumId, setSelectedPhotoAlbumId] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photoObjectUrls, setPhotoObjectUrls] = useState<Record<string, string>>({});
  const [photoAlbumProgress, setPhotoAlbumProgress] = useState<Record<string, PhotoAlbumProgress>>({});
  const [photoAlbumCoverPreferences, setPhotoAlbumCoverPreferences] = useState<Record<string, string>>({});
  const [photoAlbumTags, setPhotoAlbumTags] = useState<Record<string, string[]>>({});
  const [favoritePhotoAlbumIds, setFavoritePhotoAlbumIds] = useState<Set<string>>(() => new Set());
  const [photoAlbumSortMode, setPhotoAlbumSortMode] = useState<PhotoAlbumSortMode>(defaultPhotoAlbumPreferences.sortMode);
  const [photoAlbumFilter, setPhotoAlbumFilter] = useState<PhotoAlbumViewFilter>(
    defaultPhotoAlbumPreferences.favoritesOnly ? "favorites" : "all",
  );
  const [photoAlbumPage, setPhotoAlbumPage] = useState(1);
  const [photoAlbumSearchQuery, setPhotoAlbumSearchQuery] = useState("");
  const [photoAlbumMessage, setPhotoAlbumMessage] = useState("选择一个看图文件夹后开始扫描图片。");
  const [isPhotoAlbumsLoading, setIsPhotoAlbumsLoading] = useState(false);
  const [hasLoadedPhotoAlbums, setHasLoadedPhotoAlbums] = useState(false);
  const {
    applyPhotoAlbumStore,
    favoritePhotoAlbumIdsRef,
    photoAlbumCoverPreferencesRef,
    photoAlbumDirectoryRef,
    photoAlbumPreferencesRef,
    photoAlbumProgressRef,
    photoAlbumTagsRef,
    photoAlbumsRef,
    saveCurrentPhotoAlbumStore,
  } = usePhotoAlbumRuntime({
    favoritePhotoAlbumIds,
    photoAlbumCoverPreferences,
    photoAlbumFilter,
    photoAlbumProgress,
    photoAlbums,
    photoAlbumSortMode,
    photoAlbumTags,
    setFavoritePhotoAlbumIds,
    setPhotoAlbumCoverPreferences,
    setPhotoAlbumFilter,
    setPhotoAlbumProgress,
    setPhotoAlbumSortMode,
    setPhotoAlbumTags,
  });
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>("off");
  const [progressStore, setProgressStore] = useState<ProgressStore>({});
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<string>>(() => new Set());
  const [videoRatings, setVideoRatings] = useState<VideoRatingStore>({});
  const [videoComments, setVideoComments] = useState<VideoCommentStore>({});
  const [videoTags, setVideoTags] = useState<VideoTagStore>({});
  const [videoHighlights, setVideoHighlights] = useState<VideoHighlightStore>({});
  const [pendingHighEnergyStart, setPendingHighEnergyStart] = useState<{ videoId: string; time: number } | null>(null);
  const [highEnergyTagPrompt, setHighEnergyTagPrompt] = useState<HighEnergyTagPrompt | null>(null);
  const [, setTagMergeDecisions] = useState<TagMergeDecisionStore>({});
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const {
    dialogRef: tagDialogRef,
    isDragging: isTagDialogDragging,
    moveDrag: moveTagDialogDrag,
    offset: tagDialogOffset,
    startDrag: startTagDialogDrag,
    stopDrag: stopTagDialogDrag,
  } = useDraggableDialog(isTagDialogOpen);
  const {
    clearRatingDialogValue,
    closeRatingDialog,
    isRatingDialogOpen,
    openVideoRatingDialog,
    ratingCommentInput,
    ratingDialogVideoName,
    ratingHoverValue,
    ratingInput,
    ratingMessage,
    saveRatingDialogValue,
    setRatingCommentInput,
    setRatingHoverValue,
    setRatingInput,
    setRatingMessage,
  } = useRatingDialog({
    videosRef,
    videoRatingsRef,
    videoCommentsRef,
    setVideoRatings,
    setVideoComments,
  });
  const [tagInput, setTagInput] = useState("");
  const [activeTagSuggestionIndex, setActiveTagSuggestionIndex] = useState(0);
  const [tagMessage, setTagMessage] = useState("");
  const [isTagSuggestionLoading, setIsTagSuggestionLoading] = useState(false);
  const [tagMergePrompt, setTagMergePrompt] = useState<TagMergePrompt | null>(null);
  const [isAutoTagLoading, setIsAutoTagLoading] = useState(false);
  const [autoTagSuggestions, setAutoTagSuggestions] = useState<string[]>([]);
  const [selectedAutoTags, setSelectedAutoTags] = useState<Set<string>>(() => new Set());
  const [autoTagSummary, setAutoTagSummary] = useState("");
  const [autoTagSources, setAutoTagSources] = useState<Array<{ title: string; url: string }>>([]);
  const [autoTagMessage, setAutoTagMessage] = useState("");
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>("all");
  const [playlistSortMode, setPlaylistSortMode] = useState<PlaylistSortMode>(
    defaultPlayerPreferences.playlistSortMode,
  );
  const [videoStatsRevision, setVideoStatsRevision] = useState(0);
  const [watchActivityRevision, setWatchActivityRevision] = useState(0);
  const [watchActivityRange, setWatchActivityRange] = useState<WatchActivityRange>(30);
  const [watchActivityMetric, setWatchActivityMetric] = useState<WatchActivityMetric>("watched");
  const [selectedWatchActivityDate, setSelectedWatchActivityDate] = useState<string | null>(null);
  const [watchActivityCarouselTick, setWatchActivityCarouselTick] = useState(0);
  const [launchEffectKey, setLaunchEffectKey] = useState(0);
  const [isPlaylistSortReversed, setIsPlaylistSortReversed] = useState(
    defaultPlayerPreferences.isPlaylistSortReversed,
  );
  const [playlistPageSize, setPlaylistPageSize] = useState(defaultPlayerPreferences.playlistPageSize);
  const [playlistPage, setPlaylistPage] = useState(1);
  const [playlistPageInput, setPlaylistPageInput] = useState("1");
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(defaultPlayerPreferences.shortcuts);
  const [homeMediaMode, setHomeMediaMode] = useState<HomeMediaMode>(defaultPlayerPreferences.homeMediaMode);
  const [isSeriesMode, setIsSeriesMode] = useState(defaultPlayerPreferences.isSeriesMode);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState(defaultPlayerPreferences.selectedSeriesKey);
  const [isCinemaMode, setIsCinemaMode] = useState(defaultPlayerPreferences.isCinemaMode);
  const [startFromHighEnergy, setStartFromHighEnergy] = useState(defaultPlayerPreferences.startFromHighEnergy);
  const [isScanning, setIsScanning] = useState(false);
  const [isMainVideoLoading, setIsMainVideoLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isSeriesMenuOpen, setIsSeriesMenuOpen] = useState(false);
  const [isMediaLibraryPanelOpen, setIsMediaLibraryPanelOpen] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);
  const [photoDeleteCandidate, setPhotoDeleteCandidate] = useState<{
    albumId: string;
    albumTitle: string;
    imageId: string;
    imageIndex: number;
    name: string;
    relativePath: string;
    parentDirectory?: FileSystemDirectoryHandle;
  } | null>(null);
  const [photoAlbumDeleteCandidate, setPhotoAlbumDeleteCandidate] = useState<{
    albumId: string;
    title: string;
    relativePath: string;
    imageCount: number;
    totalSize: number;
  } | null>(null);
  const [photoDeleteError, setPhotoDeleteError] = useState("");
  const [isPhotoDeletePending, setIsPhotoDeletePending] = useState(false);
  const [videoDeleteCandidate, setVideoDeleteCandidate] = useState<VideoItem | null>(null);
  const [videoDeleteError, setVideoDeleteError] = useState("");
  const [isVideoDeletePending, setIsVideoDeletePending] = useState(false);
  const {
    closeExistingMediaRootPrompt,
    closeMediaRootLabelPrompt,
    existingMediaRootPrompt,
    mediaRootLabelPrompt,
    requestExistingMediaRootRescan,
    requestMediaRootLabel,
    submitMediaRootLabelPrompt,
    updateMediaRootLabelPromptValue,
  } = useMediaRootPrompts();
  const [skipFolderAccessPrompt, setSkipFolderAccessPrompt] = useState(defaultPlayerSettings.skipFolderAccessPrompt);
  const [message, setMessage] = useState("新增一个媒体库开始播放");
  const {
    closeMediaRootLocalPathDialog,
    mediaRootLocalPathDialog,
    openMediaRootLocalPathDialog,
    submitMediaRootLocalPath,
    updateMediaRootLocalPathValue,
  } = useMediaRootLocalPathDialog({
    localConfigRef,
    setLocalConfig,
    setMessage,
  });
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
  const [volume, setVolume] = useState(initialVolumeRef.current);
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
  danmakuSelectionsRef.current = danmakuSelections;
  danmakuPreferencesRef.current = danmakuPreferences;
  selectedSubtitleIdRef.current = selectedSubtitleId;
  localConfigRef.current = localConfig;
  videoHighlightsRef.current = videoHighlights;

  const updateSelectedSubtitleId = useCallback((nextSubtitleId: string) => {
    selectedSubtitleIdRef.current = nextSubtitleId;
    setSelectedSubtitleId(nextSubtitleId);
  }, []);

  const getVideosForHomeMode = useCallback((items: VideoItem[], mode: HomeMediaMode) => {
    if (mode === "all") return items;
    const modeRootIds = new Set(
      (localConfigRef.current?.mediaRoots ?? [])
        .filter((root) => isMediaRootInHomeMode(root, mode))
        .map((root) => root.id),
    );
    return items.filter((item) => Boolean(item.mediaRootId && modeRootIds.has(item.mediaRootId)));
  }, []);

  const activateDuplicateDetectionForMode = useCallback((
    mode: HomeMediaMode,
    items: VideoItem[],
    resultsByMode: PlayerDataStore["duplicateDetections"] = duplicateDetectionResultsByModeRef.current,
  ) => {
    const persisted = resultsByMode?.[mode] ?? null;
    const modeVideos = getVideosForHomeMode(items, mode);
    if (!persisted) {
      duplicateVideoGroupsRef.current = [];
      duplicateDetectionResultScopeKeyRef.current = mode;
      duplicateDetectionMessageRef.current = "尚未检测重复视频。";
      setDuplicateVideoGroups([]);
      setDuplicateDetectionResultScopeKey(mode);
      setDuplicateDetectionProgress(null);
      setPlaylistPage(1);
      setIsDuplicatePlaylistActive(false);
      setRatingPlaylistMode(null);
      setDuplicateDetectionMessage("尚未检测重复视频。");
      return;
    }

    const restoredGroups = rebuildDuplicateVideoGroups(modeVideos, [{
      id: "persisted",
      severity: "suspicious",
      score: 0,
      reasons: [],
      videos: [],
      pairs: persisted.pairs,
    }]);
    if (!restoredGroups.length) {
      const nextResultsByMode = { ...(resultsByMode ?? {}) };
      delete nextResultsByMode[mode];
      duplicateDetectionResultsByModeRef.current = nextResultsByMode;
      duplicateVideoGroupsRef.current = [];
      duplicateDetectionResultScopeKeyRef.current = mode;
      duplicateDetectionMessageRef.current = "尚未检测重复视频。";
      setDuplicateVideoGroups([]);
      setDuplicateDetectionResultScopeKey(mode);
      setDuplicateDetectionProgress(null);
      setPlaylistPage(1);
      setIsDuplicatePlaylistActive(false);
      setRatingPlaylistMode(null);
      setDuplicateDetectionMessage("尚未检测重复视频。");
      return;
    }

    const message = persisted.message || `已恢复上次重复检测结果，发现 ${restoredGroups.length} 组重复或疑似重复视频。`;
    const nextResultsByMode = {
      ...(resultsByMode ?? {}),
      [mode]: createPersistedDuplicateDetectionResult(mode, restoredGroups, message),
    };
    duplicateDetectionResultsByModeRef.current = nextResultsByMode;
    duplicateVideoGroupsRef.current = restoredGroups;
    duplicateDetectionResultScopeKeyRef.current = mode;
    duplicateDetectionMessageRef.current = message;
    setDuplicateVideoGroups(restoredGroups);
    setDuplicateDetectionResultScopeKey(mode);
    setDuplicateDetectionProgress(null);
    setPlaylistPage(1);
    setIsDuplicatePlaylistActive(false);
    setRatingPlaylistMode(null);
    setDuplicateDetectionMessage(message);
  }, [getVideosForHomeMode]);

  const applyCachedPhotoAlbumScan = useCallback((cache: CachedPhotoAlbumScan, options?: { status?: PlayerMediaRootStatus["status"]; message?: string; error?: string }) => {
    photoAlbumsRef.current = cache.albums;
    setPhotoAlbums(cache.albums);
    setPhotoAlbumPage(1);
    setPhotoRootStatuses([createPhotoAlbumRootStatusFromCache(cache, options?.status, options?.error)]);
    setHasLoadedPhotoAlbums(true);
    setPhotoAlbumMessage(options?.message ?? `已加载“${cache.rootName}”上次扫描结果，包含 ${cache.albums.length} 本相册`);
  }, []);

  const applyPlayerDataStore = useApplyPlayerDataStore({
    activateDuplicateDetectionForMode,
    danmakuPreferencesRef,
    danmakuSelectionsRef,
    duplicateDetectionResultsByModeRef,
    favoriteVideoIdsRef,
    hasLoadedPlayerDataStoreRef,
    libraryMetadataRef,
    playerPreferencesRef,
    playerSettingsRef,
    progressStoreRef,
    setDanmakuPreferences,
    setDanmakuSelections,
    setFavoriteVideoIds,
    setHomeMediaMode,
    setIsCinemaMode,
    setIsPlaylistSortReversed,
    setIsSeriesMode,
    setPlaylistPage,
    setPlaylistPageSize,
    setPlaylistSortMode,
    setProgressStore,
    setSelectedSeriesKey,
    setShortcuts,
    setSkipFolderAccessPrompt,
    setStartFromHighEnergy,
    setTagMergeDecisions,
    setTheme,
    setVideoComments,
    setVideoHighlights,
    setVideoRatings,
    setVideoTags,
    setVolume,
    setWatchActivityRevision,
    tagMergeDecisionsRef,
    videoCommentsRef,
    videoHighlightsRef,
    videoRatingsRef,
    videosRef,
    videoStatsRef,
    videoTagsRef,
    watchActivityRef,
  });

  const loadPhotoAlbumDirectory = useCallback(
    async (directory: FileSystemDirectoryHandle, options?: { remember?: boolean }) => {
      photoAlbumDirectoryRef.current = directory;
      setIsPhotoAlbumsLoading(true);
      setPhotoAlbumMessage("正在扫描看图文件夹...");
      try {
        const [scan, store] = await Promise.all([
          collectPhotoAlbumsFromDirectory(directory),
          loadPhotoAlbumStore().catch(() => ({
            version: 1,
            favorites: [],
            progress: {},
            coverImageByAlbumId: {},
            albumTags: {},
            preferences: defaultPhotoAlbumPreferences,
          })),
        ]);
        applyPhotoAlbumStore(store);
        photoAlbumsRef.current.forEach((album) => {
          album.images.forEach((image) => {
            revokeObjectUrl(image.url);
          });
        });
        revokeObjectUrls(Object.values(photoObjectUrlsRef.current));
        photoObjectUrlsRef.current = {};
        photoObjectUrlAccessRef.current = {};
        decodedPhotoImageIdsRef.current.clear();
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
            ? `已从“${scan.rootLabel}”加载 ${scan.albums.length} 本相册，扫描 ${scan.scannedFiles} 张图片`
            : `“${scan.rootLabel}”里没有找到包含图片的文件夹`,
        );
      } catch (error) {
        setPhotoAlbumMessage(error instanceof Error ? error.message : "扫描看图文件夹失败。");
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
        setPhotoAlbumMessage("已取消选择看图文件夹。");
      } else {
        setPhotoAlbumMessage("选择看图文件夹失败，请确认浏览器权限后重试。");
      }
    }
  }, [isPhotoAlbumsLoading, loadPhotoAlbumDirectory]);

  const refreshPhotoAlbumDirectory = useCallback(async () => {
    if (isPhotoAlbumsLoading) return;
    const directory = photoAlbumDirectoryRef.current ?? (await readPhotoAlbumFolderHandle().catch(() => null));
    if (!directory) {
      setPhotoAlbumMessage("请先选择看图文件夹。");
      return;
    }

    const canReadDirectory = await ensureDirectoryReadPermission(directory);
    if (!canReadDirectory) {
      setPhotoAlbumMessage(`浏览器需要重新授权“${directory.name}”，请重新选择看图文件夹。`);
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
            coverImageByAlbumId: {},
            albumTags: {},
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
          setPhotoAlbumMessage("首次选择看图文件夹后，下次进入会自动复用。");
          return;
        }
        const canReadDirectory = await ensureDirectoryReadPermission(directory);
        if (!canReadDirectory) {
          setPhotoAlbumMessage(`浏览器需要重新授权“${directory.name}”，请重新选择看图文件夹。`);
          return;
        }
        await loadPhotoAlbumDirectory(directory, { remember: true });
      } catch (error) {
        await clearPhotoAlbumFolderHandle().catch(() => undefined);
        setPhotoAlbumMessage(error instanceof Error ? error.message : "读取已保存的看图文件夹失败，请重新选择。");
      }
    })();
  }, [activeView, hasLoadedPhotoAlbums, isPhotoAlbumsLoading, loadPhotoAlbumDirectory]);

  const homeModeMediaRoots = useMemo(
    () => getHomeModeMediaRoots(localConfig?.mediaRoots ?? [], homeMediaMode),
    [homeMediaMode, localConfig],
  );
  const homeModeMediaRootIds = useMemo(
    () => createMediaRootIdSet(homeModeMediaRoots),
    [homeModeMediaRoots],
  );
  const modeFilteredVideos = useMemo(
    () => filterVideosByHomeMediaMode(videos, homeMediaMode, homeModeMediaRootIds),
    [homeMediaMode, homeModeMediaRootIds, videos],
  );
  const currentDuplicateDetectionScopeKey = useMemo(
    () => homeMediaMode,
    [homeMediaMode],
  );
  const isDuplicateDetectionResultCurrent = Boolean(
    duplicateDetectionResultScopeKey && duplicateDetectionResultScopeKey === currentDuplicateDetectionScopeKey,
  );
  const activeDuplicateVideoGroups = useMemo(
    () => (isDuplicateDetectionResultCurrent ? duplicateVideoGroups : []),
    [duplicateVideoGroups, isDuplicateDetectionResultCurrent],
  );
  const modeFilteredMediaRootStatuses = useMemo(
    () => filterMediaRootStatusesByHomeMediaMode(mediaRootStatuses, homeMediaMode, homeModeMediaRootIds),
    [homeMediaMode, homeModeMediaRootIds, mediaRootStatuses],
  );
  const homeMediaModeLabel = getHomeMediaModeLabel(homeMediaMode);
  const playerMediaModeLabel = getPlayerMediaModeLabel(homeMediaMode);
  const isRatingFilterEnabled = homeMediaMode === "special";
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
  const ratingFilterLabel = getRatingFilterLabel(ratingFilterOperator, ratingFilterThreshold);
  const ratingStats = useMemo(() => createRatingStats(modeFilteredVideos, videoRatings), [modeFilteredVideos, videoRatings]);
  const ratingPlaylistVideos = useMemo(
    () =>
      filterRatingPlaylistVideos(
        playlistVideos,
        videoRatings,
        isRatingFilterEnabled ? ratingPlaylistMode : null,
        ratingFilterOperator,
        ratingFilterThreshold,
      ),
    [isRatingFilterEnabled, playlistVideos, ratingFilterOperator, ratingFilterThreshold, ratingPlaylistMode, videoRatings],
  );
  const numericRatingPlaylistCount = useMemo(
    () =>
      isRatingFilterEnabled
        ? countRatingFilterMatches(playlistVideos, videoRatings, ratingFilterOperator, ratingFilterThreshold)
        : 0,
    [isRatingFilterEnabled, playlistVideos, ratingFilterOperator, ratingFilterThreshold, videoRatings],
  );
  const seriesOptions = useMemo(
    () => createSeriesOptions(playlistVideos, localConfig?.mediaRoots ?? []),
    [localConfig, playlistVideos],
  );
  const seriesTitleByVideoId = useMemo(() => createSeriesTitleByVideoId(playlistVideos), [playlistVideos]);
  const seriesFilteredVideos = useMemo(
    () => filterVideosBySeries(playlistVideos, seriesOptions, seriesTitleByVideoId, isSeriesMode, selectedSeriesKey),
    [isSeriesMode, playlistVideos, selectedSeriesKey, seriesOptions, seriesTitleByVideoId],
  );
  const currentVideo = useMemo(
    () => videos.find((item) => item.id === currentVideoId) ?? null,
    [currentVideoId, videos],
  );
  const currentVideoSourceChoice = currentVideo ? playbackSourceChoices[currentVideo.id] ?? "compatible" : "compatible";
  const currentVideoPlaybackUrl = currentVideo ? getPlayableVideoUrl(currentVideo, currentVideoSourceChoice) : "";
  const currentVideoHasCompatibleMedia = Boolean(currentVideo?.playability?.compatibleUrl);
  const currentVideoTags = currentVideo ? videoTags[currentVideo.id] ?? [] : [];
  const currentVideoRating = currentVideo ? videoRatings[currentVideo.id] : undefined;
  const activeTagInputSegment = useMemo(() => getActiveTagInputSegment(tagInput), [tagInput]);
  const tagInputSuggestions = useMemo(() => {
    if (!isTagDialogOpen || !currentVideo || !activeTagInputSegment) return [];
    return createTagInputSuggestions({
      query: activeTagInputSegment,
      allVideoTags: videoTags,
      currentTags: currentVideoTags,
    });
  }, [activeTagInputSegment, currentVideo, currentVideoTags, isTagDialogOpen, videoTags]);
  const resolvedActiveTagSuggestionIndex = tagInputSuggestions.length
    ? Math.min(activeTagSuggestionIndex, tagInputSuggestions.length - 1)
    : 0;
  const activeTagSuggestionId = tagInputSuggestions.length ? `tag-input-suggestion-${resolvedActiveTagSuggestionIndex}` : undefined;
  const currentVideoMediaRootLabel = useMemo(() => {
    if (!currentVideo) return "";
    const mediaRoot = localConfig?.mediaRoots.find((root) => root.id === currentVideo.mediaRootId);
    return mediaRoot?.label ?? fallbackMediaRootLabelForVideo(currentVideo);
  }, [currentVideo, localConfig]);
  const seriesOptionsKey = useMemo(() => createSeriesOptionsKey(seriesOptions), [seriesOptions]);
  const currentSeriesKey = useMemo(
    () => getCurrentSeriesKey(currentVideo, seriesTitleByVideoId),
    [currentVideo, seriesTitleByVideoId],
  );
  const activeBangumiSeries = useMemo(
    () => getActiveSeriesOption(seriesOptions, { isSeriesMode, selectedSeriesKey, currentSeriesKey }),
    [currentSeriesKey, isSeriesMode, selectedSeriesKey, seriesOptions],
  );
  const {
    activeMatch: activeBangumiMatch,
    buttonTitle: bangumiButtonTitle,
    canOpenSubject: canOpenBangumiSubject,
    openSubject: openBangumiSubject,
  } = useBangumiMatchController({
    activeSeries: activeBangumiSeries,
    bangumiConfigured: Boolean(localConfig?.bangumi.configured),
    isSeriesMode,
    libraryId,
    playlistVideos,
    seriesOptions,
    seriesOptionsKey,
    seriesTitleByVideoId,
  });
  const currentVideoSourceAspectRatio = currentVideo?.width && currentVideo.height ? currentVideo.width / currentVideo.height : 9 / 16;
  const normalizedVideoRotation = ((videoRotation % 360) + 360) % 360;
  const isVideoSideways = normalizedVideoRotation === 90 || normalizedVideoRotation === 270;
  const favoritePlaylistVideos = useMemo(
    () => getFavoritePlaylistVideos(seriesFilteredVideos, favoriteVideoIds),
    [favoriteVideoIds, seriesFilteredVideos],
  );
  const duplicatePlaylistVideos = useMemo(
    () => getDuplicatePlaylistVideos(videos, activeDuplicateVideoGroups),
    [activeDuplicateVideoGroups, videos],
  );
  const duplicatePlaylistMetaByVideoId = useMemo(
    () => createDuplicatePlaylistMetaByVideoId(activeDuplicateVideoGroups),
    [activeDuplicateVideoGroups],
  );
  const visibleVideos = useMemo(
    () =>
      resolveVisiblePlaylistVideos({
        isDuplicatePlaylistActive, duplicatePlaylistVideos, ratingPlaylistMode, ratingPlaylistVideos, playlistFilter, favoritePlaylistVideos, seriesFilteredVideos,
      }),
    [duplicatePlaylistVideos, favoritePlaylistVideos, isDuplicatePlaylistActive, playlistFilter, ratingPlaylistMode, ratingPlaylistVideos, seriesFilteredVideos],
  );
  const isRatingPlaylistActive = Boolean(ratingPlaylistMode);
  const activeRatingPlaylistLabel = getActiveRatingPlaylistLabel(ratingPlaylistMode, ratingFilterLabel);
  const isPlaylistSeriesMode = isSeriesMode && !isDuplicatePlaylistActive && !isRatingPlaylistActive;
  const isAnimePlaylistSearchScope = homeMediaMode === "anime" && isPlaylistSeriesMode;
  const homeLibrarySearchVideos = modeFilteredVideos;
  const playerLibrarySearchVideos = isDuplicatePlaylistActive || isRatingPlaylistActive || isAnimePlaylistSearchScope ? visibleVideos : modeFilteredVideos;
  const librarySearchScopeKey = useMemo(
    () => createLibrarySearchScopeKey(homeLibrarySearchVideos, playerLibrarySearchVideos),
    [homeLibrarySearchVideos, playerLibrarySearchVideos],
  );
  const homeLibrarySearchEmptyTarget = homeMediaMode === "special" ? "视频" : "文件夹";
  const playerLibrarySearchEmptyTarget = isAnimePlaylistSearchScope ? "剧集" : homeLibrarySearchEmptyTarget;
  const playlistIndexById = useMemo(
    () =>
      createVideoIndexById(
        resolvePlaylistIndexVideos({
          isDuplicatePlaylistActive, isRatingPlaylistActive, duplicatePlaylistVideos, ratingPlaylistVideos, playlistVideos,
        }),
      ),
    [duplicatePlaylistVideos, isDuplicatePlaylistActive, isRatingPlaylistActive, playlistVideos, ratingPlaylistVideos],
  );
  const visibleVideoIndexById = useMemo(() => createVideoIndexById(visibleVideos), [visibleVideos]);
  const playlistPageCount = Math.max(1, Math.ceil(visibleVideos.length / playlistPageSize));
  const visiblePlaylistPage = Math.min(Math.max(playlistPage, 1), playlistPageCount);
  const pagedPlaylistStartIndex = visibleVideos.length ? (visiblePlaylistPage - 1) * playlistPageSize : 0;
  const pagedPlaylistVideos = useMemo(
    () => visibleVideos.slice(pagedPlaylistStartIndex, pagedPlaylistStartIndex + playlistPageSize),
    [pagedPlaylistStartIndex, playlistPageSize, visibleVideos],
  );
  const { startLabel: playlistPageStartLabel, endLabel: playlistPageEndLabel } = createPlaylistPageLabels({ totalCount: visibleVideos.length, startIndex: pagedPlaylistStartIndex, pageCount: pagedPlaylistVideos.length });
  const syncPlaylistPageInput = useCallback((page: number) => {
    const nextPage = Math.min(Math.max(page, 1), playlistPageCount);
    setPlaylistPage(nextPage);
    setPlaylistPageInput(String(nextPage));
  }, [playlistPageCount]);
  const commitPlaylistPageInput = useCallback(() => {
    const parsedPage = Number.parseInt(playlistPageInput, 10);
    if (!Number.isFinite(parsedPage)) {
      setPlaylistPageInput(String(visiblePlaylistPage));
      return;
    }
    syncPlaylistPageInput(parsedPage);
  }, [playlistPageInput, syncPlaylistPageInput, visiblePlaylistPage]);
  const playlistVisibleCountLabel = formatPlaylistVisibleCountLabel({ totalCount: visibleVideos.length, pageSize: playlistPageSize, startLabel: playlistPageStartLabel, endLabel: playlistPageEndLabel });
  const playlistPageSizeSelectOptions = useMemo(
    () => createPlaylistPageSizeSelectOptions(),
    [],
  );
  const playlistThumbnailVideos = useMemo(
    () => createPlaylistThumbnailVideos({ visibleVideos, pagedVideos: pagedPlaylistVideos, visibleVideoIndexById, currentVideoId, activeRadius: playlistActiveThumbnailRadius }),
    [currentVideoId, pagedPlaylistVideos, visibleVideoIndexById, visibleVideos],
  );
  const isCurrentVideoVisible = useMemo(
    () => isVideoVisible(currentVideoId, visibleVideos),
    [currentVideoId, visibleVideos],
  );
  useEffect(() => {
    setPlaylistPage((page) => Math.min(Math.max(page, 1), playlistPageCount));
  }, [playlistPageCount]);
  useEffect(() => {
    setPlaylistPageInput(String(visiblePlaylistPage));
  }, [visiblePlaylistPage]);
  useEffect(() => {
    if (isDuplicatePlaylistActive && !duplicatePlaylistVideos.length) {
      setIsDuplicatePlaylistActive(false);
    }
  }, [duplicatePlaylistVideos.length, isDuplicatePlaylistActive]);
  useEffect(() => {
    if (ratingPlaylistMode && !ratingPlaylistVideos.length) {
      setRatingPlaylistMode(null);
    }
  }, [ratingPlaylistMode, ratingPlaylistVideos.length]);
  useEffect(() => {
    if (!isRatingFilterEnabled && ratingPlaylistMode) {
      setRatingPlaylistMode(null);
    }
  }, [isRatingFilterEnabled, ratingPlaylistMode]);
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
        rating: videoRatings[video.id],
        ratingComment: videoComments[video.id],
      };
    },
    [localConfig, progressStore, seriesTitleByVideoId, videoComments, videoRatings, videoTags],
  );
  const homeLibrarySearchContext = useMemo(
    () => ({
      mode: homeMediaMode,
      mediaRootLabelsById: Object.fromEntries((localConfig?.mediaRoots ?? []).map((root) => [root.id, root.label])),
      progressByVideoId: progressStore,
      favoriteVideoIds,
      isResumableProgress,
      videoTags,
      videoRatings,
    }),
    [favoriteVideoIds, homeMediaMode, localConfig, progressStore, videoRatings, videoTags],
  );
  const playerLibrarySearchContext = useMemo(
    () => ({
      ...homeLibrarySearchContext,
      resultKind: isAnimePlaylistSearchScope ? ("video" as const) : undefined,
    }),
    [homeLibrarySearchContext, isAnimePlaylistSearchScope],
  );
  const resumableHomeCards = useMemo(
    () =>
      createResumableHomeCards({
        videos: modeFilteredVideos,
        createCard: createHomeVideoCard,
        isResumableProgress,
      }),
    [createHomeVideoCard, modeFilteredVideos],
  );
  const primaryResumeCard = resumableHomeCards[0] ?? null;
  const recentHomeCards = useMemo(
    () => createRecentHomeCards(modeFilteredVideos, createHomeVideoCard),
    [createHomeVideoCard, modeFilteredVideos],
  );
  const favoriteHomeCards = useMemo(
    () =>
      createFavoriteHomeCards({
        videos: modeFilteredVideos,
        favoriteVideoIds,
        createCard: createHomeVideoCard,
      }),
    [createHomeVideoCard, favoriteVideoIds, modeFilteredVideos],
  );
  const nextEpisodeCard = useMemo(
    () =>
      createNextEpisodeCard({
        enabled: shouldShowNextEpisodeCard(homeMediaMode),
        primaryResumeCard,
        recentHomeCards,
        currentVideo,
        playlistVideos,
        seriesTitleByVideoId,
        createCard: createHomeVideoCard,
      }),
    [createHomeVideoCard, currentVideo, homeMediaMode, playlistVideos, primaryResumeCard, recentHomeCards, seriesTitleByVideoId],
  );
  const isHomeViewVisible = activeView === "home" && !isPrivacyMode && !isCinemaMode && !isFullscreen;
  const isPhotoAlbumViewVisible =
    (activeView === "photos" || activeView === "photoViewer") && !isPrivacyMode && !isCinemaMode && !isFullscreen;
  const isNonPlayerViewVisible = isHomeViewVisible || isPhotoAlbumViewVisible;
  useEffect(() => {
    if (!isHomeViewVisible) return undefined;
    const timer = window.setInterval(() => {
      setWatchActivityCarouselTick((tick) => tick + 1);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [isHomeViewVisible]);
  const firstPlayableHomeCard = playlistVideos[0] ? createHomeVideoCard(playlistVideos[0]) : null;
  const primaryHomeCard = createPrimaryHomeCard(primaryResumeCard, firstPlayableHomeCard);
  const libraryStats = useMemo(
    () => createLibraryStats({ videos: modeFilteredVideos, progressStore, favoriteVideoIds, isResumableProgress }),
    [favoriteVideoIds, modeFilteredVideos, progressStore],
  );
  const specialModeInsights = useMemo(
    () =>
      homeMediaMode === "special"
        ? buildSpecialModeInsights(modeFilteredVideos, videoStatsRef.current, videoTags, progressStore)
        : null,
    [homeMediaMode, modeFilteredVideos, progressStore, videoStatsRevision, videoTags],
  );
  const watchActivityVideos = useMemo(
    () => (isRatingFilterEnabled ? modeFilteredVideos : []),
    [isRatingFilterEnabled, modeFilteredVideos],
  );
  const watchActivityInsights = useMemo(
    () =>
      buildWatchActivityInsights(watchActivityRef.current, watchActivityVideos, videoTags, {
        rangeDays: watchActivityRange,
        metric: watchActivityMetric,
      }),
    [videoTags, watchActivityMetric, watchActivityRange, watchActivityRevision, watchActivityVideos],
  );
  const watchActivityMonthGroups = useMemo(
    () => groupWatchActivityDaysByMonth(watchActivityInsights.days),
    [watchActivityInsights.days],
  );
  const modeFilteredVideoById = useMemo(() => new Map(modeFilteredVideos.map((video) => [video.id, video])), [modeFilteredVideos]);
  const watchActivityCarouselCardsByDate = useMemo(
    () =>
      createWatchActivityCarouselCardsByDate({
        days: watchActivityInsights.days,
        videoById: modeFilteredVideoById,
        createCard: createHomeVideoCard,
      }),
    [createHomeVideoCard, modeFilteredVideoById, watchActivityInsights.days],
  );
  const watchActivityCarouselVideoIds = useMemo(
    () => createWatchActivityCarouselVideoIds(watchActivityCarouselCardsByDate),
    [watchActivityCarouselCardsByDate],
  );
  const selectedWatchActivityDay = useMemo(
    () => resolveSelectedWatchActivityDay(watchActivityInsights.days, selectedWatchActivityDate),
    [selectedWatchActivityDate, watchActivityInsights.days],
  );
  const selectedWatchActivityCards = useMemo(
    () =>
      createSelectedWatchActivityCards({
        day: selectedWatchActivityDay,
        videos: modeFilteredVideos,
        activityStore: watchActivityRef.current,
        createCard: createHomeVideoCard,
      }),
    [createHomeVideoCard, modeFilteredVideos, selectedWatchActivityDay, watchActivityRevision],
  );
  const thumbnailQueueVideoIds = useMemo(
    () =>
      createThumbnailQueueVideoIds({
        isHomeViewVisible,
        primaryHomeVideo: primaryHomeCard?.video,
        nextEpisodeVideo: nextEpisodeCard?.video,
        recentHomeVideos: recentHomeCards.map((card) => card.video),
        favoriteHomeVideos: favoriteHomeCards.map((card) => card.video),
        watchActivityCarouselVideoIds,
        modeFilteredVideoById,
        playlistThumbnailVideos,
      }),
    [
      favoriteHomeCards,
      isHomeViewVisible,
      modeFilteredVideoById,
      nextEpisodeCard,
      playlistThumbnailVideos,
      primaryHomeCard,
      recentHomeCards,
      watchActivityCarouselVideoIds,
    ],
  );
  const thumbnailQueueVideoIdsKey = useMemo(() => thumbnailQueueVideoIds.join("\n"), [thumbnailQueueVideoIds]);
  const { runDuplicateVideoDetection } = useDuplicateDetectionController({
    duplicateDetectionAbortRef,
    duplicateDetectionMessageRef,
    duplicateDetectionResultsByModeRef,
    duplicateDetectionResultScopeKeyRef,
    duplicateDetectionRunIdRef,
    duplicateFingerprintCacheRef,
    duplicateNameSimilarityCacheRef,
    duplicateVideoGroupsRef,
    homeMediaMode,
    localConfigRef,
    modeFilteredVideos,
    saveCurrentPlayerDataStore,
    setDuplicateDetectionMessage,
    setDuplicateDetectionProgress,
    setDuplicateDetectionResultScopeKey,
    setDuplicateVideoGroups,
    setIsDuplicateDetectionRunning,
    setIsDuplicatePlaylistActive,
    setPlaylistPage,
    setRatingPlaylistMode,
  });
  const currentVideoHighlights = currentVideo ? videoHighlights[currentVideo.id] ?? [] : [];
  const selectedPhotoAlbum = useMemo(
    () => photoAlbums.find((album) => album.id === selectedPhotoAlbumId) ?? null,
    [photoAlbums, selectedPhotoAlbumId],
  );
  const {
    addTags: addTagsToPhotoAlbum,
    closeEditor: closePhotoAlbumTagEditor,
    editorAlbum: photoAlbumTagEditorAlbum,
    message: photoAlbumTagMessage,
    openEditor: openPhotoAlbumTagEditor,
    removeTag: removeTagFromPhotoAlbum,
    setTagInput: setPhotoAlbumTagInput,
    tagInput: photoAlbumTagInput,
  } = usePhotoAlbumTagEditor({
    photoAlbumTagsRef,
    photoAlbums,
    setPhotoAlbumTags,
  });
  const visiblePhotoAlbums = useMemo(
    () => getVisiblePhotoAlbums({ albums: photoAlbums, favoriteAlbumIds: favoritePhotoAlbumIds, filter: photoAlbumFilter, searchQuery: photoAlbumSearchQuery, sortMode: photoAlbumSortMode, albumTags: photoAlbumTags }),
    [favoritePhotoAlbumIds, photoAlbumFilter, photoAlbumSearchQuery, photoAlbumSortMode, photoAlbumTags, photoAlbums],
  );
  const { pageCount: photoAlbumPageCount, start: photoAlbumPageStart, end: photoAlbumPageEnd } = getPhotoAlbumPageBounds(visiblePhotoAlbums.length, photoAlbumPage, photoAlbumPageSize);
  const pagedPhotoAlbums = useMemo(
    () => getPagedPhotoAlbums(visiblePhotoAlbums, photoAlbumPage, photoAlbumPageSize),
    [photoAlbumPage, visiblePhotoAlbums],
  );
  const isPhotoAlbumGridCompact = pagedPhotoAlbums.length <= 5;
  const photoAlbumStats = useMemo(() => createPhotoAlbumStats(photoAlbums, favoritePhotoAlbumIds, photoAlbumProgress), [favoritePhotoAlbumIds, photoAlbumProgress, photoAlbums]);
  const visiblePhotoThumbnails = useMemo(
    () => getVisiblePhotoThumbnails(selectedPhotoAlbum, currentPhotoIndex, photoThumbnailWindowSize),
    [currentPhotoIndex, selectedPhotoAlbum],
  );
  usePhotoObjectUrls({
    activeView,
    currentPhotoIndex,
    decodedPhotoImageIdsRef,
    pagedPhotoAlbums,
    photoAlbumCoverPreferences,
    photoAlbumDirectoryRef,
    photoImageFilePromisesRef,
    photoObjectUrlAccessRef,
    photoObjectUrls,
    photoObjectUrlsRef,
    selectedPhotoAlbum,
    setPhotoObjectUrls,
  });
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
  const createLibrarySearchCandidates = useCallback(
    (localResults: LibrarySearchResult[], surface: LibrarySearchSurface): LibrarySearchCandidate[] => {
      const videos = surface === "player" ? playerLibrarySearchVideos : homeLibrarySearchVideos;
      const extraCards = surface === "home" ? [...resumableHomeCards, ...favoriteHomeCards, ...recentHomeCards] : [];
      return buildLibrarySearchCandidates({
        localResults,
        videos,
        extraCards,
        createCard: createHomeVideoCard,
        getTags: (videoId) => videoTags[videoId],
        isFavorite: (videoId) => favoriteVideoIds.has(videoId),
        formatProgressLabel: formatLibrarySearchProgressLabel,
      });
    },
    [
      createHomeVideoCard,
      favoriteHomeCards,
      favoriteVideoIds,
      homeLibrarySearchVideos,
      playerLibrarySearchVideos,
      recentHomeCards,
      resumableHomeCards,
      videoTags,
    ],
  );
  const {
    defaultStatus: defaultLibrarySearchStatus,
    filterResults: filterLibrarySearchResults,
    handleBlur: handleLibrarySearchBlur,
    hasMoreHomeResults: hasMoreHomeLibrarySearchResults,
    hasMorePlayerResults: hasMorePlayerLibrarySearchResults,
    homeAnswer: homeLibrarySearchAnswer,
    homeMessage: homeLibrarySearchMessage,
    homeMode: homeLibrarySearchMode,
    homePlaceholder: homeLibrarySearchPlaceholder,
    homePreviewResults: homeLibrarySearchPreviewResults,
    homeQuery: homeLibrarySearchQuery,
    homeResults: homeLibrarySearchResults,
    isHomeLoading: isHomeLibrarySearchLoading,
    isHomeSurface: isHomeLibrarySearchSurface,
    isLoading: isLibrarySearchLoading,
    isPlayerLoading: isPlayerLibrarySearchLoading,
    isPlayerSurface: isPlayerLibrarySearchSurface,
    loadMore: loadMoreLibrarySearchResults,
    mode: librarySearchMode,
    playerAnswer: playerLibrarySearchAnswer,
    playerMessage: playerLibrarySearchMessage,
    playerMode: playerLibrarySearchMode,
    playerPreviewResults: playerLibrarySearchPreviewResults,
    playerQuery: playerLibrarySearchQuery,
    playerResults: playerLibrarySearchResults,
    runSearch: runLibrarySearch,
    runTagSearch: runSpecialInsightTagSearch,
    setFocusedSurface: setFocusedLibrarySearchSurface,
    setHomeQuery: setHomeLibrarySearchQuery,
    setPlayerQuery: setPlayerLibrarySearchQuery,
    shouldShowHomePreview: shouldShowHomeLibrarySearchPreview,
    shouldShowHomeStatus: shouldShowHomeLibrarySearchStatus,
    shouldShowPlayerPreview: shouldShowPlayerLibrarySearchPreview,
    shouldShowPlayerStatus: shouldShowPlayerLibrarySearchStatus,
    visibleHomeResults: visibleHomeLibrarySearchResults,
    visiblePlayerResults: visiblePlayerLibrarySearchResults,
  } = useLibrarySearchState({
    createCandidates: createLibrarySearchCandidates,
    homeMediaMode,
    homeVideos: homeLibrarySearchVideos,
    homeContext: homeLibrarySearchContext,
    isCinemaMode,
    isNonPlayerViewVisible,
    isPrivacyMode,
    localConfig,
    playerVideos: playerLibrarySearchVideos,
    playerContext: playerLibrarySearchContext,
    scopeKey: librarySearchScopeKey,
    homeResultsRef: librarySearchResultsRef,
    homeLoadMoreRef: librarySearchLoadMoreRef,
    playerResultsRef: playerLibrarySearchResultsRef,
    playerLoadMoreRef: playerLibrarySearchLoadMoreRef,
  });
  const playerLibrarySearchPlaceholder = isAnimePlaylistSearchScope ? "搜索当前列表内的剧集" : homeLibrarySearchPlaceholder;
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
  useEffect(() => {
    if (
      !selectedSubtitle ||
      !selectedSubtitle.url ||
      isObjectUrl(selectedSubtitle.url) ||
      selectedSubtitle.format === "vtt" ||
      selectedSubtitle.relativePath.toLowerCase().endsWith(".vtt")
    ) {
      return;
    }

    let isCancelled = false;
    let createdUrl = "";
    let didApplyUrl = false;
    void createSubtitleUrl(selectedSubtitle)
      .then((url) => {
        createdUrl = url;
        if (isCancelled) {
          revokeObjectUrl(url);
          return;
        }
        setSubtitles((previous) => {
          let didChange = false;
          const nextSubtitles = previous.map((subtitle) => {
            if (subtitle.id !== selectedSubtitle.id) return subtitle;
            didChange = true;
            return { ...subtitle, url };
          });
          if (didChange) {
            didApplyUrl = true;
            subtitlesRef.current = nextSubtitles;
          }
          return didChange ? nextSubtitles : previous;
        });
      })
      .catch(() => {
        if (!isCancelled) setMessage("无法读取字幕文件，请确认字幕格式后重试。");
      });

    return () => {
      isCancelled = true;
      if (!didApplyUrl) revokeObjectUrl(createdUrl);
    };
  }, [selectedSubtitle]);
  const effectivePlaybackRate = isHoldSpeedActive ? holdPlaybackRate : playbackRate;
  const playbackRateOptions = useMemo(() => createPlaybackRateOptions(effectivePlaybackRate), [effectivePlaybackRate]);
  const playbackRateSelectOptions = useMemo(
    () => createRateSelectOptions(playbackRateOptions),
    [playbackRateOptions],
  );
  const holdRateSelectOptions = useMemo(
    () => createRateSelectOptions(holdRates),
    [],
  );
  const seekStepSelectOptions = useMemo(
    () => createSeekStepSelectOptions(),
    [],
  );
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
  const isDanmakuAvailable = Boolean(currentVideo && homeMediaMode === "anime" && isSeriesMode);
  const danmakuSourceBreakdown = useMemo(() => getDanmakuSourceBreakdown(currentDanmakuSource), [currentDanmakuSource]);
  const danmakuSourceTotalCount = useMemo(() => getDanmakuBreakdownTotal(danmakuSourceBreakdown) || danmakuComments.length, [danmakuComments.length, danmakuSourceBreakdown]);
  const shouldUseDanmakuPlaybackClock =
    danmakuPreferences.enabled && isDanmakuAvailable && danmakuComments.length > 0 && !isPrivacyMode;
  const activeDanmakuComments = useMemo(() => {
    if (!danmakuPreferences.enabled || !currentVideo || !danmakuComments.length || isPrivacyMode) return [];
    const durationSeconds = danmakuPreferences.speed;
    const displayLimit = Math.max(12, Math.round(90 * danmakuPreferences.density));
    return getActiveDanmakuComments({ comments: danmakuComments, currentTime, durationSeconds, displayLimit });
  }, [currentTime, currentVideo, danmakuComments, danmakuPreferences.density, danmakuPreferences.enabled, danmakuPreferences.speed, isPrivacyMode]);
  const danmakuLaneCount = getDanmakuLaneCount(danmakuPreferences.displayArea, danmakuPreferences.fontSize, danmakuLayerHeight);
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
  const currentVideoSpecialStats = useMemo(() => {
    if (!currentVideo) {
      return {
        emissionCount: 0,
        playCount: 0,
        playIntensity: null as number | null,
        lastEmissionLabel: "暂无",
      };
    }
    const stats = videoStatsRef.current[createVideoStatsKey(currentVideo)];
    const durationSeconds = stats?.durationSeconds || currentVideo.duration || 0;
    return {
      emissionCount: stats?.emissionCount ?? 0,
      playCount: stats?.playCount ?? 0,
      playIntensity: durationSeconds > 0 && stats?.totalPlayedSeconds
        ? stats.totalPlayedSeconds / durationSeconds
        : null,
      lastEmissionLabel: stats?.lastEmissionAt ? formatRelativeTime(stats.lastEmissionAt) : "暂无",
    };
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

      savePlayerVideoStats(statsKey, nextStats)
        .then(() => {
          if (options?.saveMessage) setMessage(options.saveMessage);
        })
        .catch(() => {
          setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
        });
    },
    [],
  );

  const updateWatchActivity = useCallback(
    (
      video: VideoItem,
      increments: { watchedSeconds?: number; playCount?: number; completedCount?: number; emissionCount?: number },
      timestamp = Date.now(),
    ) => {
      const date = createLocalDateKey(timestamp);
      const key = createWatchActivityKey(date, video.id);
      const currentActivity = watchActivityRef.current[key] ?? {
        date,
        videoId: video.id,
        watchedSeconds: 0,
        playCount: 0,
        completedCount: 0,
        emissionCount: 0,
        updatedAt: timestamp,
      };
      const nextActivity = {
        ...currentActivity,
        watchedSeconds: currentActivity.watchedSeconds + Math.max(0, increments.watchedSeconds ?? 0),
        playCount: currentActivity.playCount + Math.max(0, Math.floor(increments.playCount ?? 0)),
        completedCount: currentActivity.completedCount + Math.max(0, Math.floor(increments.completedCount ?? 0)),
        emissionCount: currentActivity.emissionCount + Math.max(0, Math.floor(increments.emissionCount ?? 0)),
        updatedAt: timestamp,
      };
      const nextStore = {
        ...watchActivityRef.current,
        [key]: nextActivity,
      };
      watchActivityRef.current = nextStore;
      setWatchActivityRevision((revision) => revision + 1);
      savePlayerWatchActivity(nextActivity).catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [],
  );

  const recordPlaybackStartForActivity = useCallback(
    (video: VideoItem) => {
      const session = playbackActivitySessionRef.current;
      if (session?.videoId === video.id && session.hasCountedPlay) return;

      playbackActivitySessionRef.current = {
        videoId: video.id,
        lastTime: videoRef.current?.currentTime ?? null,
        hasCountedPlay: true,
      };
      updateWatchActivity(video, { playCount: 1 });
    },
    [updateWatchActivity],
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

  const recordPlaybackProgressForActivity = useCallback(
    (video: VideoItem, nextTime: number) => {
      const session = playbackActivitySessionRef.current;
      const nextSession =
        session?.videoId === video.id
          ? session
          : { videoId: video.id, lastTime: null, hasCountedPlay: false };
      const previousTime = nextSession.lastTime;
      nextSession.lastTime = nextTime;
      playbackActivitySessionRef.current = nextSession;
      if (previousTime === null || !Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return;

      const delta = nextTime - previousTime;
      if (delta <= 0 || delta > 10) return;
      updateWatchActivity(video, { watchedSeconds: delta });
    },
    [updateWatchActivity],
  );

  const recordPlaybackEndedForStats = useCallback(() => {
    playbackStatsSessionRef.current = null;
  }, []);

  const recordPlaybackEndedForActivity = useCallback(() => {
    playbackActivitySessionRef.current = null;
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
    updateWatchActivity(currentVideo, { emissionCount: 1 });
  }, [canRecordEmission, currentVideo, duration, updateSpecialVideoStats, updateWatchActivity]);

  useEffect(() => {
    playbackStatsSessionRef.current = null;
    playbackActivitySessionRef.current = null;
    setPendingHighEnergyStart(null);
    setHighEnergyTagPrompt(null);
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
      const nextConfig = normalizeClientLocalConfig(response);
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
        const normalizedConfig = normalizeClientLocalConfig(config);
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
      revokeObjectUrl(video.url);
      revokeObjectUrl(video.thumbnailUrl);
    });
  }, []);

  const revokeReplacedMediaRootVideoUrls = useCallback((replacedVideos: VideoItem[], nextVideos: VideoItem[]) => {
    const retainedVideoIds = new Set(nextVideos.map((video) => video.id));
    replacedVideos.forEach((video) => {
      revokeObjectUrl(video.url);
      if (!retainedVideoIds.has(video.id) && video.thumbnailUrl && isObjectUrl(video.thumbnailUrl)) {
        revokeObjectUrl(video.thumbnailUrl);
      }
    });
  }, []);

  const clearLoadedMedia = useCallback(() => {
    cancelAutoNextPrompt();
    videoRef.current?.pause();
    revokeVideoUrls(videosRef.current);
    subtitlesRef.current.forEach((subtitle) => {
      revokeObjectUrl(subtitle.url);
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

      const nextVideoRatings = { ...baseStore.videoRatings };
      Object.entries(legacyStore.videoRatings).forEach(([legacyId, rating]) => {
        const globalId = legacyToGlobalId.get(legacyId);
        if (globalId && nextVideoRatings[globalId] === undefined) {
          nextVideoRatings[globalId] = rating;
          didImport = true;
        }
      });

      const nextVideoComments = { ...baseStore.videoComments };
      Object.entries(legacyStore.videoComments).forEach(([legacyId, comment]) => {
        const globalId = legacyToGlobalId.get(legacyId);
        if (globalId && !nextVideoComments[globalId]) {
          nextVideoComments[globalId] = comment;
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

      const nextWatchActivity = { ...baseStore.watchActivity };
      Object.values(legacyStore.watchActivity).forEach((activity) => {
        const globalId = legacyToGlobalId.get(activity.videoId);
        if (!globalId) return;
        const key = createWatchActivityKey(activity.date, globalId);
        if (nextWatchActivity[key]) return;
        nextWatchActivity[key] = { ...activity, videoId: globalId };
        didImport = true;
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
            videoRatings: nextVideoRatings,
            videoComments: nextVideoComments,
            videoTags: nextVideoTags,
            videoStats: nextVideoStats,
            watchActivity: nextWatchActivity,
            tagMergeDecisions: nextTagMergeDecisions,
            embeddedSubtitles: nextEmbeddedSubtitles,
          }
        : baseStore;
    },
    [],
  );

  const restoreCachedGlobalMediaLibrary = useCallback(async () => {
    const currentConfig = localConfigRef.current;
    if (!currentConfig || videosRef.current.length) return;
    const storedCache = await loadCachedMediaRootScan();
    if (!storedCache || !storedCache.videos.length) return;
    const cache = alignCachedMediaRootScanWithConfig(storedCache, currentConfig);
    if (!cache.videos.length) return;

    const nextDataStore = await loadGlobalPlayerDataStore(cache.metadata).catch(() => createDefaultPlayerDataStore(cache.metadata));
    const nextVideos = mergeVideoRuntimeState(cache.videos, videosRef.current);
    videosRef.current = nextVideos;
    subtitlesRef.current = cache.subtitles;
    libraryIdRef.current = "global";
    libraryMetadataRef.current = cache.metadata;
    setLibraryId("global");
    setMediaRootId(null);
    setMediaRootStatuses(cache.metadata.mediaRoots);
    setVideos(nextVideos);
    setSubtitles(cache.subtitles);
    applyPlayerDataStore({
      ...nextDataStore,
      metadata: cache.metadata,
    });

    const restoredEmbeddedSubtitles = await restoreCachedEmbeddedSubtitles(nextDataStore.embeddedSubtitles, nextVideos, null, fetchJson);
    if (restoredEmbeddedSubtitles.length) {
      const restoredIds = new Set(restoredEmbeddedSubtitles.map((subtitle) => subtitle.id));
      const mergedSubtitles = [
        ...cache.subtitles.filter((subtitle) => !restoredIds.has(subtitle.id)),
        ...restoredEmbeddedSubtitles,
      ];
      subtitlesRef.current = mergedSubtitles;
      setSubtitles(mergedSubtitles);
    }

    const sortedVideos = getSortedVideos(
      nextVideos,
      nextDataStore.preferences.playlistSortMode,
      nextDataStore.preferences.isPlaylistSortReversed,
    );
    const resumeTarget = getLatestResumableVideo(nextVideos, nextDataStore.progress);
    setCurrentVideoId((currentId) => currentId ?? resumeTarget?.video.id ?? sortedVideos[0]?.id ?? null);
    setActiveView("home");
    setMessage(`已加载上次媒体库结果：${nextVideos.length} 个视频，未重新扫描磁盘`);
  }, [applyPlayerDataStore]);

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
        nextDataStore = migrateMovedVideoData(nextDataStore, rootResult.videos);
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

      const restoredEmbeddedSubtitles = await restoreCachedEmbeddedSubtitles(nextDataStore.embeddedSubtitles, nextVideos, null, fetchJson);
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
      await saveCachedMediaRootScan(createCachedMediaRootScan(scan, nextVideos, scan.subtitles)).catch(() => undefined);

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
    if (shouldAutoScanGlobalMediaLibrary(localConfig)) {
      void loadGlobalMediaLibrary();
      return;
    }
    if (mediaRootCacheLoadAttemptedRef.current) return;
    mediaRootCacheLoadAttemptedRef.current = true;
    void restoreCachedGlobalMediaLibrary();
  }, [loadGlobalMediaLibrary, localConfig, restoreCachedGlobalMediaLibrary]);

  const setVideoThumbnailState = useCallback((videoId: string, status: VideoItem["thumbnailStatus"], url?: string) => {
    setVideos((previous) => {
      let didChange = false;
      const nextVideos = previous.map((video) => {
        if (video.id !== videoId) return video;
        didChange = true;
        const nextThumbnailUrl = url ?? (status === "failed" || status === "idle" ? undefined : video.thumbnailUrl);
        if (url && video.thumbnailUrl && video.thumbnailUrl !== url) {
          revokeObjectUrl(video.thumbnailUrl);
        } else if (!url && nextThumbnailUrl !== video.thumbnailUrl && video.thumbnailUrl) {
          revokeObjectUrl(video.thumbnailUrl);
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

  const removeVideoCompatibleMediaUrl = useCallback((videoId: string) => {
    setVideos((previous) => {
      let didChange = false;
      const nextVideos = previous.map((video) => {
        if (video.id !== videoId || !video.playability?.compatibleUrl) return video;
        const { compatibleUrl: _removedCompatibleUrl, ...nextPlayability } = video.playability;
        didChange = true;
        return { ...video, playability: nextPlayability };
      });
      if (didChange) videosRef.current = nextVideos;
      return didChange ? nextVideos : previous;
    });
  }, []);

  useMediaProbeController({
    canUseServerMediaTools,
    currentMediaRootId,
    currentVideo,
    mediaProbeVideoIdRef,
    setMediaProbeVideoId,
    updateVideoMetadata,
    updateVideoPlayability,
  });

  const updateProgress = useCallback(
    (video: VideoItem, currentTime: number, duration: number, completed?: boolean) => {
      if (!completed && clearedProgressVideoIdsRef.current.has(video.id)) {
        if (currentTime < 0.5) return;
        clearedProgressVideoIdsRef.current.delete(video.id);
      }

      const previous = progressStoreRef.current[video.id];
      const nextDuration =
        Number.isFinite(duration) && duration > 0
          ? duration
          : previous?.duration && previous.duration > 0
            ? previous.duration
            : video.duration && video.duration > 0
              ? video.duration
              : 0;
      const progress = createProgress(currentTime, nextDuration, completed ?? previous?.completed ?? false);
      if (!progress) return;

      const nextStore = {
        ...progressStoreRef.current,
        [video.id]: progress,
      };
      progressStoreRef.current = nextStore;
      setProgressStore(nextStore);

      if (progress.completed && !previous?.completed) {
        updateWatchActivity(video, { completedCount: 1 }, progress.updatedAt);
      }

      savePlayerProgress(video.id, progress).catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
    },
    [updateWatchActivity],
  );

  const replaceProgressStore = useCallback((nextStore: ProgressStore, successMessage?: string) => {
    const previousStore = progressStoreRef.current;
    progressStoreRef.current = nextStore;
    setProgressStore(nextStore);

    Promise.all(
      Array.from(new Set([...Object.keys(previousStore), ...Object.keys(nextStore)])).map((videoId) =>
        nextStore[videoId] ? savePlayerProgress(videoId, nextStore[videoId]) : deletePlayerProgress(videoId),
      ),
    )
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, []);

  const replaceFavorites = useCallback((nextFavorites: Set<string>, successMessage?: string) => {
    const previousFavorites = favoriteVideoIdsRef.current;
    favoriteVideoIdsRef.current = nextFavorites;
    setFavoriteVideoIds(new Set(nextFavorites));

    Promise.all(
      Array.from(new Set([...previousFavorites, ...nextFavorites])).map((videoId) =>
        savePlayerFavorite(videoId, nextFavorites.has(videoId)),
      ),
    )
      .then(() => {
        if (successMessage) setMessage(successMessage);
      })
      .catch(() => {
        setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, []);

  const replaceVideoTags = useCallback((nextVideoTags: VideoTagStore, successMessage?: string) => {
    const previousVideoTags = videoTagsRef.current;
    videoTagsRef.current = nextVideoTags;
    setVideoTags(nextVideoTags);

    Promise.all(
      Array.from(new Set([...Object.keys(previousVideoTags), ...Object.keys(nextVideoTags)])).map((videoId) =>
        savePlayerVideoTags(videoId, nextVideoTags[videoId] ?? []),
      ),
    )
      .then(() => {
        if (successMessage) setTagMessage(successMessage);
      })
      .catch(() => {
        setTagMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
      });
  }, []);

  const replaceTagMergeDecisions = useCallback((nextDecisions: TagMergeDecisionStore) => {
    tagMergeDecisionsRef.current = nextDecisions;
    setTagMergeDecisions(nextDecisions);
    saveTagMergeDecisions(nextDecisions).catch(() => {
      setTagMessage("无法保存标签合并选择。");
    });
  }, []);

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

  const submitTagInputSuggestion = useCallback((tag: string) => {
    if (isTagSuggestionLoading) return;
    const resolvedInput = tagInput.replace(/[^\s,，、;；|]*$/u, tag);
    void addTagsToCurrentVideo(parseTagInput(resolvedInput));
  }, [addTagsToCurrentVideo, isTagSuggestionLoading, tagInput]);

  useEffect(() => {
    setActiveTagSuggestionIndex(0);
  }, [activeTagInputSegment, tagInputSuggestions.length]);

  const generateAutoTagsForCurrentVideo = useCallback(async () => {
    setAutoTagSuggestions([]);
    setSelectedAutoTags(new Set());
    setAutoTagSummary("");
    setAutoTagSources([]);

    if (!currentVideo) {
      setAutoTagMessage("请先选择一个视频。");
      return;
    }
    if (!localConfig?.ai.configured) {
      setAutoTagMessage("需要先配置大模型 API，才能生成 AI 自动标签。");
      return;
    }

    setAutoTagMessage("");
    setTagMessage("");
    setIsTagDialogOpen(true);
    setIsAutoTagLoading(true);
    try {
      const response = await fetchJson<AutoTagSuggestionResponse>("/api/ai/tags/auto-suggest", {
        method: "POST",
        body: JSON.stringify({
          id: currentVideo.id,
          name: currentVideo.name,
          relativePath: currentVideo.relativePath,
          mediaRootLabel: currentVideoMediaRootLabel,
          size: currentVideo.size,
          duration: currentVideo.duration,
          width: currentVideo.width,
          height: currentVideo.height,
          existingTags: currentVideoTags,
          libraryTags: getAllLibraryTags(),
        }),
      });
      const seenAutoTagKeys = new Set<string>();
      const tags = (response.tags ?? [])
        .map((tag) => tag.trim())
        .filter((tag) => {
          const key = normalizeTagKey(tag);
          if (!key || seenAutoTagKeys.has(key)) return false;
          seenAutoTagKeys.add(key);
          return true;
        });
      const sources = (response.sources ?? [])
        .filter((source): source is { title: string; url: string } => Boolean(source?.title && source?.url))
        .slice(0, 5);
      setAutoTagSuggestions(tags);
      setSelectedAutoTags(new Set(tags));
      setAutoTagSummary(response.summary?.trim() ?? "");
      setAutoTagSources(sources);
      setAutoTagMessage(tags.length ? "" : response.summary?.trim() || "AI 没有生成可用标签。");
    } catch (error) {
      setAutoTagMessage(error instanceof Error ? `AI 自动标签生成失败：${error.message}` : "AI 自动标签生成失败。");
    } finally {
      setIsAutoTagLoading(false);
    }
  }, [currentVideo, currentVideoMediaRootLabel, currentVideoTags, getAllLibraryTags, localConfig]);

  const toggleSelectedAutoTag = useCallback((tag: string) => {
    setSelectedAutoTags((selectedTags) => {
      const nextTags = new Set(selectedTags);
      if (nextTags.has(tag)) {
        nextTags.delete(tag);
      } else {
        nextTags.add(tag);
      }
      return nextTags;
    });
  }, []);

  const confirmAutoTags = useCallback(() => {
    const tags = autoTagSuggestions.filter((tag) => selectedAutoTags.has(tag));
    if (!tags.length) {
      setAutoTagMessage("请选择至少一个建议标签。");
      return;
    }
    setTagMessage("");
    setTagMergePrompt(null);
    setAutoTagSuggestions([]);
    setSelectedAutoTags(new Set());
    setAutoTagSummary("");
    setAutoTagSources([]);
    setAutoTagMessage("");
    void addTagsToCurrentVideo(tags);
  }, [addTagsToCurrentVideo, autoTagSuggestions, selectedAutoTags]);

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
    saveTagMergeDecisions(nextDecisions).catch(() => setTagMessage("无法保存标签合并选择。"));
  }, [addTagsToCurrentVideo, currentVideo, tagMergePrompt]);

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
    videoRatingsRef.current = {};
    videoCommentsRef.current = {};
    videoTagsRef.current = {};
    videoStatsRef.current = {};
    watchActivityRef.current = {};
    tagMergeDecisionsRef.current = {};
    clearedProgressVideoIdsRef.current = new Set(videosRef.current.map((video) => video.id));
    playbackStatsSessionRef.current = null;
    playbackActivitySessionRef.current = null;
    setProgressStore({});
    setFavoriteVideoIds(new Set());
    setVideoRatings({});
    setVideoComments({});
    setVideoTags({});
    setWatchActivityRevision((revision) => revision + 1);
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
    setPlaylistPageSize(nextPreferences.playlistPageSize);
    setShortcuts(nextPreferences.shortcuts);
    setHomeMediaMode(nextPreferences.homeMediaMode);
    setIsSeriesMode(nextPreferences.isSeriesMode);
    setSelectedSeriesKey(nextPreferences.selectedSeriesKey);
    setIsCinemaMode(nextPreferences.isCinemaMode);
    setStartFromHighEnergy(nextPreferences.startFromHighEnergy);

    Promise.all(
      (Object.keys(nextPreferences) as Array<keyof PlayerPreferences>).map((key) =>
        savePlayerPreference(key, nextPreferences[key]),
      ),
    ).catch(() => {
      setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
    });
  }, []);

  const updatePlaylistSortMode = useCallback(
    (nextMode: PlaylistSortMode) => {
      setPlaylistPage(1);
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        playlistSortMode: nextMode,
      });
    },
    [replacePlayerPreferences],
  );

  const togglePlaylistSortDirection = useCallback(() => {
    setPlaylistPage(1);
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isPlaylistSortReversed: !playerPreferencesRef.current.isPlaylistSortReversed,
    });
  }, [replacePlayerPreferences]);

  const updatePlaylistPageSize = useCallback(
    (nextPageSize: number) => {
      setPlaylistPage(1);
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        playlistPageSize: nextPageSize,
      });
    },
    [replacePlayerPreferences],
  );

  const updateHomeMediaMode = useCallback(
    (nextMode: HomeMediaMode) => {
      setPlaylistPage(1);
      duplicateDetectionAbortRef.current?.abort();
      duplicateDetectionAbortRef.current = null;
      duplicateDetectionRunIdRef.current += 1;
      setIsDuplicateDetectionRunning(false);
      activateDuplicateDetectionForMode(nextMode, videosRef.current);
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        homeMediaMode: nextMode,
      });
    },
    [activateDuplicateDetectionForMode, replacePlayerPreferences],
  );

  const {
    closeShortcutDialog,
    handleShortcutCapture,
    isShortcutDialogOpen,
    recordingShortcutAction,
    resetShortcuts,
    shortcutMessage,
    startShortcutRecording,
    toggleShortcutDialog,
  } = useShortcutSettings({
    playerPreferencesRef,
    replacePlayerPreferences,
  });

  const toggleStartFromHighEnergy = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      startFromHighEnergy: !playerPreferencesRef.current.startFromHighEnergy,
    });
  }, [replacePlayerPreferences]);

  const updateSelectedSeries = useCallback(
    (nextSeriesKey: string) => {
      setPlaylistPage(1);
      replacePlayerPreferences({
        ...playerPreferencesRef.current,
        selectedSeriesKey: nextSeriesKey,
      });
      setIsSeriesMenuOpen(false);
    },
    [replacePlayerPreferences],
  );

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
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      theme,
    };
    savePlayerSetting("theme", theme).catch(() => undefined);
  }, [theme]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      blurClickedButton(event.target);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

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

  const requestDeleteVideo = useCallback((video: VideoItem) => {
    setVideoDeleteCandidate(video);
    setVideoDeleteError("");
  }, []);

  const clearPendingProgressSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveTimerVideoIdRef.current = null;
  }, []);

  const persistCurrentProgress = useCallback(
    (completed = false) => {
      const element = videoRef.current;
      if (!element || !currentVideo) return;
      clearPendingProgressSave();
      updateProgress(currentVideo, element.currentTime, selectTrustedDuration([currentVideo.duration, element.duration, duration]) || 0, completed);
    },
    [clearPendingProgressSave, currentVideo, duration, updateProgress],
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
      if (nextSeriesMode.resetPlaylistFilter) {
        setPlaylistPage(1);
        setPlaylistFilter("all");
      }

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
    (videoId: string, options?: { syncSeriesMode?: boolean; keepDuplicatePlaylist?: boolean; keepRatingPlaylist?: boolean }) => {
      cancelAutoNextPrompt();
      persistCurrentProgress();
      resetHoldSpeedState();
      if (options?.syncSeriesMode !== false) syncSeriesModeForPlayerEntry(videoId);
      if (!options?.keepDuplicatePlaylist) {
        setPlaylistPage(1);
        setIsDuplicatePlaylistActive(false);
      }
      if (!options?.keepRatingPlaylist) {
        setRatingPlaylistMode(null);
      }
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

  const removeDeletedVideoFromState = useCallback(
    async (video: VideoItem) => {
      const deletedAt = Date.now();
      const nextVideos = videosRef.current.filter((item) => item.id !== video.id);
      const nextProgress = { ...progressStoreRef.current };
      const nextVideoTags = { ...videoTagsRef.current };
      const nextVideoRatings = { ...videoRatingsRef.current };
      const nextVideoComments = { ...videoCommentsRef.current };
      const nextVideoStats = { ...videoStatsRef.current };
      const nextWatchActivity = Object.fromEntries(
        Object.entries(watchActivityRef.current).filter(([, activity]) => activity.videoId !== video.id),
      );
      const nextVideoHighlights = { ...videoHighlightsRef.current };
      const nextDanmakuSelections = { ...danmakuSelectionsRef.current };
      const nextFavorites = new Set(favoriteVideoIdsRef.current);
      const nextSubtitles = subtitlesRef.current.filter((subtitle) => subtitle.videoId !== video.id);

      delete nextProgress[video.id];
      delete nextVideoTags[video.id];
      delete nextVideoRatings[video.id];
      delete nextVideoComments[video.id];
      delete nextVideoStats[createVideoStatsKey(video)];
      delete nextVideoHighlights[video.id];
      delete nextDanmakuSelections[video.id];
      nextFavorites.delete(video.id);

      revokeObjectUrl(video.thumbnailUrl);
      revokeObjectUrl(video.url);

      videosRef.current = nextVideos;
      progressStoreRef.current = nextProgress;
      videoTagsRef.current = nextVideoTags;
      videoRatingsRef.current = nextVideoRatings;
      videoCommentsRef.current = nextVideoComments;
      videoStatsRef.current = nextVideoStats;
      watchActivityRef.current = nextWatchActivity;
      videoHighlightsRef.current = nextVideoHighlights;
      danmakuSelectionsRef.current = nextDanmakuSelections;
      favoriteVideoIdsRef.current = nextFavorites;
      subtitlesRef.current = nextSubtitles;

      setVideos(nextVideos);
      setProgressStore(nextProgress);
      setVideoTags(nextVideoTags);
      setVideoRatings(nextVideoRatings);
      setVideoComments(nextVideoComments);
      setVideoHighlights(nextVideoHighlights);
      setVideoStatsRevision((revision) => revision + 1);
      setWatchActivityRevision((revision) => revision + 1);
      setDanmakuSelections(nextDanmakuSelections);
      setFavoriteVideoIds(nextFavorites);
      filterLibrarySearchResults((results) =>
        results.flatMap((result) => {
          if (result.kind === "video") return result.representativeVideo.id === video.id ? [] : [result];
          const nextResultVideos = result.videos.filter((entry) => entry.video.id !== video.id);
          if (!nextResultVideos.length) return [];
          return [
            {
              ...result,
              videos: nextResultVideos,
              representativeVideo:
                result.representativeVideo.id === video.id ? nextResultVideos[0].video : result.representativeVideo,
            },
          ];
        }),
      );
      setPlaybackSourceChoices((previous) => {
        if (!(video.id in previous)) return previous;
        const nextChoices = { ...previous };
        delete nextChoices[video.id];
        return nextChoices;
      });
      const modeRootIds = new Set(
        (localConfigRef.current?.mediaRoots ?? [])
          .filter((root) => isMediaRootInHomeMode(root, homeMediaMode))
          .map((root) => root.id),
      );
      const nextDuplicateVideos =
        homeMediaMode === "all"
          ? nextVideos
          : nextVideos.filter((item) => Boolean(item.mediaRootId && modeRootIds.has(item.mediaRootId)));
      let nextResultsByMode = pruneDuplicateDetectionsForVideos(duplicateDetectionResultsByModeRef.current ?? {}, nextVideos);
      if (duplicateDetectionResultScopeKeyRef.current) {
        const nextDuplicateGroups = rebuildDuplicateVideoGroups(nextDuplicateVideos, duplicateVideoGroupsRef.current);
        const nextMessage = nextDuplicateGroups.length ? "重复检测结果已根据删除操作更新。" : "重复列表已清空。";
        const nextPersistedResult = createPersistedDuplicateDetectionResult(homeMediaMode, nextDuplicateGroups, nextMessage);
        if (nextPersistedResult) {
          nextResultsByMode[homeMediaMode] = nextPersistedResult;
        } else {
          delete nextResultsByMode[homeMediaMode];
        }
        duplicateDetectionResultsByModeRef.current = nextResultsByMode;
        duplicateVideoGroupsRef.current = nextDuplicateGroups;
        duplicateDetectionResultScopeKeyRef.current = homeMediaMode;
        duplicateDetectionMessageRef.current = nextMessage;
        setDuplicateVideoGroups(nextDuplicateGroups);
        setDuplicateDetectionResultScopeKey(homeMediaMode);
        setDuplicateDetectionMessage(nextMessage);
      }
      duplicateDetectionResultsByModeRef.current = nextResultsByMode;
      setSubtitles(nextSubtitles);
      const currentGlobalMetadata = isPlayerGlobalMetadata(libraryMetadataRef.current) ? libraryMetadataRef.current : null;
      const nextMediaRootStatuses = (currentGlobalMetadata?.mediaRoots ?? mediaRootStatuses).map((status) =>
        status.id === video.mediaRootId
          ? {
              ...status,
              videoCount: Math.max(status.videoCount - 1, 0),
              scannedFiles: Math.max(status.scannedFiles - 1, 0),
              updatedAt: deletedAt,
            }
          : status,
      );
      const nextScannedFiles = nextMediaRootStatuses.reduce((sum, status) => sum + status.scannedFiles, 0);
      if (currentGlobalMetadata) {
        libraryMetadataRef.current = {
          ...currentGlobalMetadata,
          videoCount: nextVideos.length,
          scannedFiles: nextScannedFiles,
          mediaRoots: nextMediaRootStatuses,
          updatedAt: deletedAt,
        };
      }
      setMediaRootStatuses(nextMediaRootStatuses);

      await Promise.all([
        saveCurrentPlayerDataStore({
          ...(libraryMetadataRef.current ? { metadata: libraryMetadataRef.current } : {}),
          progress: nextProgress,
          favorites: Array.from(nextFavorites),
          videoTags: nextVideoTags,
          videoRatings: nextVideoRatings,
          videoComments: nextVideoComments,
          videoStats: nextVideoStats,
          watchActivity: nextWatchActivity,
          videoHighlights: nextVideoHighlights,
          danmakuSelections: nextDanmakuSelections,
          embeddedSubtitles: createPersistedEmbeddedSubtitles(subtitlesRef.current),
          duplicateDetection: null,
          duplicateDetections: duplicateDetectionResultsByModeRef.current,
        }),
        loadCachedMediaRootScan()
          .then((cache) => {
            if (!cache?.videos.some((item) => item.id === video.id)) return undefined;
            const cachedMediaRoots = cache.metadata.mediaRoots.map((status) =>
              status.id === video.mediaRootId
                ? {
                    ...status,
                    videoCount: Math.max(status.videoCount - 1, 0),
                    scannedFiles: Math.max(status.scannedFiles - 1, 0),
                    updatedAt: deletedAt,
                  }
                : status,
            );
            const cachedVideos = cache.videos.filter((item) => item.id !== video.id);
            const cachedSubtitles = cache.subtitles.filter((subtitle) => subtitle.videoId !== video.id);
            const cachedScannedFiles = cachedMediaRoots.reduce((sum, status) => sum + status.scannedFiles, 0);
            return saveCachedMediaRootScan({
              ...cache,
              videos: cachedVideos,
              subtitles: cachedSubtitles,
              scannedFiles: cachedScannedFiles,
              metadata: {
                ...cache.metadata,
                videoCount: cachedVideos.length,
                scannedFiles: cachedScannedFiles,
                mediaRoots: cachedMediaRoots,
                updatedAt: deletedAt,
              },
              updatedAt: deletedAt,
            });
          })
          .catch(() => undefined),
        saveDanmakuSelection(video.id, null).catch(() => undefined),
      ]);
    },
    [filterLibrarySearchResults, homeMediaMode, mediaRootStatuses, saveCurrentPlayerDataStore],
  );

  const deleteBrowserVideoFile = useCallback(async (video: VideoItem) => {
    const fileName = video.relativePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || video.name;
    const parentDirectory =
      video.parentDirectory ??
      (directoryRef.current ? await resolveBrowserVideoParentDirectory(directoryRef.current, video.relativePath) : null);

    if (!parentDirectory?.removeEntry) {
      throw new Error("当前视频来源不支持直接删除，请重新选择媒体库文件夹或在文件管理器中删除。");
    }
    if (!(await hasDirectoryWritePermission(parentDirectory))) {
      throw new Error("浏览器没有这个目录的写入权限，请重新选择媒体库文件夹后再删除。");
    }

    await parentDirectory.removeEntry(fileName);
    if (await browserVideoFileExists(parentDirectory, fileName)) {
      throw new Error("浏览器没有删除这个本地文件，请确认文件未被占用，并重新选择媒体库文件夹授予写入权限。");
    }
  }, []);

  const confirmDeleteVideo = useCallback(async () => {
    if (!videoDeleteCandidate || isVideoDeletePending) return;
    const video = videoDeleteCandidate;
    if (!videosRef.current.some((item) => item.id === video.id)) {
      setVideoDeleteCandidate(null);
      setVideoDeleteError("");
      setMessage(`《${video.name}》已从播放列表移除`);
      return;
    }
    const root = video.mediaRootId ? localConfigRef.current?.mediaRoots.find((item) => item.id === video.mediaRootId) : null;
    const shouldUseBrowserDelete = video.playbackSource === "browser" || (root?.source === "browser" && !root.localPath);
    const currentVisibleIndex = visibleVideos.findIndex((item) => item.id === video.id);
    const nextVideo =
      currentVisibleIndex >= 0
        ? visibleVideos[currentVisibleIndex + 1] ?? visibleVideos[currentVisibleIndex - 1] ?? null
        : visibleVideos.find((item) => item.id !== video.id) ?? null;
    const isDeletingCurrentVideo = video.id === currentVideoIdRef.current;

    setVideoDeleteError("");
    setIsVideoDeletePending(true);

    try {
      if (isDeletingCurrentVideo) {
        clearPendingProgressSave();
        videoRef.current?.pause();
        if (videoRef.current) {
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        }
      }

      if (shouldUseBrowserDelete) {
        await deleteBrowserVideoFile(video);
      } else {
        if (!video.mediaRootId) throw new Error("当前视频缺少媒体库信息，无法定位磁盘文件。");
        await fetchJson<{ deleted: boolean }>("/api/media/video", {
          method: "DELETE",
          body: JSON.stringify({
            rootId: video.mediaRootId,
            relativePath: video.relativePath,
          }),
        });
      }

      await removeDeletedVideoFromState(video);
      setVideoDeleteCandidate(null);
      setVideoDeleteError("");
      setMessage(`已删除《${video.name}》`);

      if (isDeletingCurrentVideo) {
        if (nextVideo) {
          setActiveView("player");
          pendingAutoPlayVideoIdRef.current = nextVideo.id;
          autoSubtitleSelectionVideoIdRef.current = nextVideo.id;
          isMainVideoLoadingRef.current = true;
          setIsMainVideoLoading(true);
          setCurrentVideoId(nextVideo.id);
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
        } else {
          setCurrentVideoId(null);
          setCurrentTime(0);
          setDuration(0);
          setIsPlaying(false);
          setActiveView("home");
        }
      }
    } catch (error) {
      setVideoDeleteError(error instanceof Error ? error.message : "删除视频失败，请确认文件未被占用且仍在媒体库中。");
    } finally {
      setIsVideoDeletePending(false);
    }
  }, [
    clearPendingProgressSave,
    deleteBrowserVideoFile,
    focusPlayer,
    isVideoDeletePending,
    removeDeletedVideoFromState,
    videoDeleteCandidate,
    visibleVideos,
    updateSelectedSubtitleId,
  ]);

  const openVideoFromHome = useCallback(
    (video: VideoItem, options?: { fromBeginning?: boolean }) => {
      startFromBeginningVideoIdRef.current = options?.fromBeginning ? video.id : null;
      selectVideo(video.id);
    },
    [selectVideo],
  );

  const openDuplicateVideo = useCallback(
    (video: VideoItem, options?: { keepDuplicatePlaylist?: boolean }) => {
      selectVideo(video.id, {
        keepDuplicatePlaylist: options?.keepDuplicatePlaylist,
        keepRatingPlaylist: false,
        syncSeriesMode: false,
      });
    },
    [selectVideo],
  );

  const openDuplicatePlaylist = useCallback(() => {
    const firstVideo = duplicatePlaylistVideos[0];
    if (!firstVideo) return;
    setPlaylistPage(1);
    setIsDuplicatePlaylistActive(true);
    setRatingPlaylistMode(null);
    setPlaylistFilter("all");
    setIsSeriesMenuOpen(false);
    selectVideo(firstVideo.id, { keepDuplicatePlaylist: true, syncSeriesMode: false });
  }, [duplicatePlaylistVideos, selectVideo]);

  const openRatingPlaylist = useCallback((
    mode: RatingPlaylistMode = "numeric",
    filterOperator = ratingFilterOperator,
    filterThreshold = ratingFilterThreshold,
  ) => {
    if (!isRatingFilterEnabled) return;
    const nextVideos =
      mode === "unrated"
        ? playlistVideos.filter((video) => typeof videoRatings[video.id] !== "number")
        : playlistVideos.filter((video) => {
            const rating = videoRatings[video.id];
            if (typeof rating !== "number") return false;
            if (filterOperator === "gt") return rating > filterThreshold;
            if (filterOperator === "lt") return rating < filterThreshold;
            return rating === filterThreshold;
          });
    const firstVideo = nextVideos[0];
    if (!firstVideo) return;
    setPlaylistPage(1);
    setRatingPlaylistMode(mode);
    setIsDuplicatePlaylistActive(false);
    setPlaylistFilter("all");
    setIsSeriesMenuOpen(false);
    selectVideo(firstVideo.id, { keepRatingPlaylist: true, syncSeriesMode: false });
  }, [isRatingFilterEnabled, playlistVideos, ratingFilterOperator, ratingFilterThreshold, selectVideo, videoRatings]);

  const openLibraryFolderFromSearch = useCallback(
    (result: LibrarySearchResult) => {
      const targetVideo = result.videos[0]?.video ?? result.representativeVideo;
      if (result.kind === "video") {
        selectVideo(targetVideo.id);
        return;
      }
      setIsSeriesMenuOpen(false);
      setPlaylistPage(1);
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
      void savePhotoAlbumProgress(album.id, nextProgress[album.id]).catch(() => {
        setPhotoAlbumMessage("看图进度保存失败。");
      });
    },
    [],
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

  const openRandomPhotoAlbum = useCallback(() => {
    if (!visiblePhotoAlbums.length) return;
    const randomAlbum = visiblePhotoAlbums[Math.floor(Math.random() * visiblePhotoAlbums.length)];
    openPhotoAlbum(randomAlbum);
  }, [openPhotoAlbum, visiblePhotoAlbums]);

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
      void savePhotoAlbumFavorite(album.id, nextFavorites.has(album.id)).catch(() => {
        setPhotoAlbumMessage("看图收藏保存失败。");
      });
    },
    [],
  );

  const setPhotoAlbumCover = useCallback((album: PhotoAlbum, image: PhotoAlbumImage) => {
    const nextPreferences = {
      ...photoAlbumCoverPreferencesRef.current,
      [album.id]: image.id,
    };
    photoAlbumCoverPreferencesRef.current = nextPreferences;
    setPhotoAlbumCoverPreferences(nextPreferences);
    setPhotoAlbumMessage(`已将《${image.name}》设为《${album.title}》封面`);
    void savePhotoAlbumCoverPreference(album.id, image.id).catch(() => {
      setPhotoAlbumMessage("看图封面偏好保存失败。");
    });
  }, []);

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
      setPhotoAlbumMessage("看图进度保存失败。");
    });
    setPhotoAlbumMessage(`已清除《${selectedPhotoAlbum.title}》的阅读进度`);
  }, [saveCurrentPhotoAlbumStore, selectedPhotoAlbum]);

  const markCurrentHighEnergySegment = useCallback(() => {
    if (!currentVideo || !duration) return;
    const markTime = clamp(currentTime, 0, duration);
    if (!pendingHighEnergyStart || pendingHighEnergyStart.videoId !== currentVideo.id) {
      setPendingHighEnergyStart({ videoId: currentVideo.id, time: markTime });
      setMessage(`已选择高能起点 ${formatTime(markTime)}，再次点击标记终点。`);
      return;
    }

    const startTime = Math.min(pendingHighEnergyStart.time, markTime);
    const endTime = Math.max(pendingHighEnergyStart.time, markTime);
    setPendingHighEnergyStart(null);
    if (endTime - startTime < 0.2) {
      setMessage("高能片段太短，请重新选择起点和终点。");
      return;
    }
    setHighEnergyTagPrompt({
      videoId: currentVideo.id,
      videoName: currentVideo.name,
      startTime,
      endTime,
      tagInput: "",
    });
    setMessage(`已选择高能片段 ${formatTime(startTime)} - ${formatTime(endTime)}，请填写标签。`);
  }, [currentTime, currentVideo, duration, pendingHighEnergyStart]);

  const saveHighEnergyTagPrompt = useCallback(() => {
    if (!highEnergyTagPrompt) return;
    const tag = highEnergyTagPrompt.tagInput.trim().slice(0, 40);
    if (!tag) {
      setMessage("请输入高能片段标签。");
      return;
    }
    const updatedAt = Date.now();
    const nextHighlight: VideoHighlightSegment = {
      id: highEnergyTagPrompt.highlightId ?? `${Math.round(highEnergyTagPrompt.startTime * 10)}-${Math.round(highEnergyTagPrompt.endTime * 10)}-${updatedAt.toString(36)}`,
      startTime: highEnergyTagPrompt.startTime,
      endTime: highEnergyTagPrompt.endTime,
      tag,
      updatedAt,
    };
    const currentHighlights = videoHighlightsRef.current[highEnergyTagPrompt.videoId] ?? [];
    const nextVideoHighlights = highEnergyTagPrompt.highlightId
      ? currentHighlights.map((highlight) => highlight.id === highEnergyTagPrompt.highlightId ? nextHighlight : highlight)
      : [...currentHighlights, nextHighlight];
    const nextHighlights = {
      ...videoHighlightsRef.current,
      [highEnergyTagPrompt.videoId]: nextVideoHighlights.sort((a, b) => a.startTime - b.startTime),
    };
    videoHighlightsRef.current = nextHighlights;
    setVideoHighlights(nextHighlights);
    setHighEnergyTagPrompt(null);
    setMessage(highEnergyTagPrompt.highlightId ? "已更新高能片段描述。" : `已标记高能片段 ${formatTime(highEnergyTagPrompt.startTime)} - ${formatTime(highEnergyTagPrompt.endTime)}：${tag}`);
    void savePlayerVideoHighlights(highEnergyTagPrompt.videoId, nextHighlights[highEnergyTagPrompt.videoId]).catch(() => {
      setMessage("高能标记保存失败。");
    });
  }, [highEnergyTagPrompt]);

  const editCurrentHighEnergySegment = useCallback((highlight: VideoHighlightSegment) => {
    if (!currentVideo) return;
    setHighEnergyTagPrompt({
      videoId: currentVideo.id,
      videoName: currentVideo.name,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      highlightId: highlight.id,
      tagInput: highlight.tag ?? "",
    });
  }, [currentVideo]);

  const removeCurrentHighEnergySegment = useCallback((highlightId: string) => {
    if (!currentVideo) return;
    const nextVideoHighlights = (videoHighlightsRef.current[currentVideo.id] ?? []).filter((highlight) => highlight.id !== highlightId);
    const nextHighlights = {
      ...videoHighlightsRef.current,
      [currentVideo.id]: nextVideoHighlights,
    };
    if (!nextVideoHighlights.length) delete nextHighlights[currentVideo.id];
    videoHighlightsRef.current = nextHighlights;
    setVideoHighlights(nextHighlights);
    void savePlayerVideoHighlights(currentVideo.id, nextVideoHighlights).catch(() => {
      setMessage("高能标记保存失败。");
    });
  }, [currentVideo]);

  const clearPhotoAlbumAccessAfterWritePermissionDenied = useCallback(async () => {
    await clearPhotoAlbumFolderHandle().catch(() => undefined);
    await clearCachedPhotoAlbumScan().catch(() => undefined);
    revokeObjectUrls(Object.values(photoObjectUrlsRef.current));
    photoAlbumDirectoryRef.current = null;
    photoAlbumsRef.current = [];
    photoObjectUrlsRef.current = {};
    photoObjectUrlAccessRef.current = {};
    decodedPhotoImageIdsRef.current.clear();
    setPhotoAlbums([]);
    setPhotoRootStatuses([]);
    setPhotoObjectUrls({});
    setPhotoAlbumPage(1);
    setCurrentPhotoIndex(0);
    setSelectedPhotoAlbumId(null);
    setPhotoDeleteCandidate(null);
    setPhotoAlbumDeleteCandidate(null);
    setPhotoDeleteError("");
    setHasLoadedPhotoAlbums(true);
    setActiveView("photos");
    setPhotoAlbumMessage("旧看图目录记录没有写入权限，已自动清除。请重新选择看图文件夹以授予删除权限。");
  }, []);

  const requestDeleteCurrentPhoto = useCallback(() => {
    if (!selectedPhotoAlbum) return;
    const photo = selectedPhotoAlbum.images[currentPhotoIndex];
    if (!photo) {
      setPhotoAlbumMessage("当前没有可删除的图片。");
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

  const requestDeletePhotoAlbum = useCallback((album: PhotoAlbum) => {
    setPhotoDeleteError("");
    setPhotoAlbumDeleteCandidate({
      albumId: album.id,
      title: album.title,
      relativePath: album.relativePath,
      imageCount: album.imageCount,
      totalSize: album.totalSize,
    });
  }, []);

  const confirmDeleteCurrentPhoto = useCallback(async () => {
    if (!photoDeleteCandidate || isPhotoDeletePending) return;
    setPhotoDeleteError("");
    setIsPhotoDeletePending(true);
    const album = photoAlbumsRef.current.find((item) => item.id === photoDeleteCandidate.albumId);
    const photo = album?.images.find((image) => image.id === photoDeleteCandidate.imageId);
    if (!album || !photo) {
      setIsPhotoDeletePending(false);
      setPhotoDeleteCandidate(null);
      setPhotoAlbumMessage("这张图片已经不在当前图集中。");
      return;
    }

    try {
      const rootDirectory = photoAlbumDirectoryRef.current ?? (await readPhotoAlbumFolderHandle().catch(() => null));
      const parentDirectory = photo.parentDirectory ?? photoDeleteCandidate.parentDirectory ?? (rootDirectory ? await resolvePhotoParentDirectory(rootDirectory, photo.relativePath) : null);
      if (!parentDirectory?.removeEntry) {
        setPhotoDeleteError("当前图片来源不支持直接删除，请刷新看图文件夹或在文件管理器中删除。");
        setIsPhotoDeletePending(false);
        return;
      }

      if (!(await hasDirectoryWritePermission(parentDirectory))) {
        await clearPhotoAlbumAccessAfterWritePermissionDenied();
        setIsPhotoDeletePending(false);
        return;
      }

      await parentDirectory.removeEntry(photo.name);
      if (await photoFileExists(parentDirectory, photo.name)) {
        setPhotoDeleteError("浏览器没有删除这个本地文件，请确认文件未被占用，并重新选择看图文件夹授予写入权限。");
        setIsPhotoDeletePending(false);
        return;
      }

      setPhotoDeleteCandidate(null);

      const previousProgress = photoAlbumProgressRef.current[album.id];
      const remainingImages = album.images
        .filter((image) => image.id !== photo.id)
        .map((image, index) => ({ ...image, index }));
      const nextPhotoIndex = Math.min(Math.max(photoDeleteCandidate.imageIndex, 0), Math.max(remainingImages.length - 1, 0));
      const nextProgress = { ...photoAlbumProgressRef.current };
      const nextCoverPreferences = { ...photoAlbumCoverPreferencesRef.current };
      const nextAlbumTags = { ...photoAlbumTagsRef.current };
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
        if (nextCoverPreferences[album.id] === photo.id) {
          const nextCoverImage = remainingImages[nextPhotoIndex] ?? remainingImages[0];
          if (nextCoverImage) nextCoverPreferences[album.id] = nextCoverImage.id;
        }
      } else {
        nextAlbums = photoAlbumsRef.current.filter((item) => item.id !== album.id);
        delete nextProgress[album.id];
        delete nextCoverPreferences[album.id];
        delete nextAlbumTags[album.id];
        if (favoritePhotoAlbumIdsRef.current.has(album.id)) {
          nextFavorites = new Set(favoritePhotoAlbumIdsRef.current);
          nextFavorites.delete(album.id);
        }
        nextSelectedAlbumId = null;
      }

      const objectUrl = photoObjectUrlsRef.current[photo.id];
      revokeObjectUrl(objectUrl);
      revokeObjectUrl(photo.url);
      const nextPhotoObjectUrls = { ...photoObjectUrlsRef.current };
      delete nextPhotoObjectUrls[photo.id];
      delete photoObjectUrlAccessRef.current[photo.id];
      delete photoImageFilePromisesRef.current[photo.id];
      decodedPhotoImageIdsRef.current.delete(photo.id);
      photoObjectUrlsRef.current = nextPhotoObjectUrls;

      photoAlbumsRef.current = nextAlbums;
      photoAlbumProgressRef.current = nextProgress;
      photoAlbumCoverPreferencesRef.current = nextCoverPreferences;
      photoAlbumTagsRef.current = nextAlbumTags;
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
      setPhotoAlbumCoverPreferences(nextCoverPreferences);
      setPhotoAlbumTags(nextAlbumTags);
      setFavoritePhotoAlbumIds(nextFavorites);
      setCurrentPhotoIndex(nextPhotoIndex);
      setSelectedPhotoAlbumId(nextSelectedAlbumId);
      if (!remainingImages.length) setActiveView("photos");

      await saveCurrentPhotoAlbumStore({
        progress: nextProgress,
        favorites: Array.from(nextFavorites),
        coverImageByAlbumId: nextCoverPreferences,
        albumTags: nextAlbumTags,
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
          setPhotoAlbumMessage("图片已删除，但看图扫描缓存更新失败，下次刷新会修正。");
        });

      setPhotoAlbumMessage(
        remainingImages.length
          ? `已删除《${photo.name}》`
          : `已删除《${photo.name}》，《${album.title}》已无图片`,
      );
    } catch {
      setPhotoDeleteError("删除图片失败，请确认浏览器仍有文件夹写入权限，或重新选择看图文件夹。");
    } finally {
      setIsPhotoDeletePending(false);
    }
  }, [clearPhotoAlbumAccessAfterWritePermissionDenied, isPhotoDeletePending, photoDeleteCandidate, saveCurrentPhotoAlbumStore]);

  const confirmDeletePhotoAlbum = useCallback(async () => {
    if (!photoAlbumDeleteCandidate || isPhotoDeletePending) return;
    setPhotoDeleteError("");
    setIsPhotoDeletePending(true);

    const album = photoAlbumsRef.current.find((item) => item.id === photoAlbumDeleteCandidate.albumId);
    if (!album) {
      setIsPhotoDeletePending(false);
      setPhotoAlbumDeleteCandidate(null);
      setPhotoAlbumMessage("这个图集已经不在当前列表中。");
      return;
    }

    try {
      const rootDirectory = photoAlbumDirectoryRef.current ?? (await readPhotoAlbumFolderHandle().catch(() => null));
      if (!rootDirectory?.removeEntry) {
        setPhotoDeleteError("当前图集来源不支持直接删除，请刷新看图文件夹或在文件管理器中删除。");
        setIsPhotoDeletePending(false);
        return;
      }

      const albumDirectory = await resolvePhotoAlbumDirectory(rootDirectory, album.relativePath);
      if (!albumDirectory.removeEntry) {
        setPhotoDeleteError("当前图集来源不支持直接删除，请刷新看图文件夹或在文件管理器中删除。");
        setIsPhotoDeletePending(false);
        return;
      }

      if (!(await hasDirectoryWritePermission(albumDirectory))) {
        await clearPhotoAlbumAccessAfterWritePermissionDenied();
        setIsPhotoDeletePending(false);
        return;
      }

      for (const image of album.images) {
        await albumDirectory.removeEntry(image.name);
        if (await photoFileExists(albumDirectory, image.name)) {
          setPhotoDeleteError("浏览器没有删除这个图集中的部分图片，请确认文件未被占用，并重新选择看图文件夹授予写入权限。");
          setIsPhotoDeletePending(false);
          return;
        }
      }

      const albumPathParts = album.relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
      if (albumPathParts.length) {
        try {
          const parentDirectory = await resolvePhotoAlbumDirectory(rootDirectory, albumPathParts.slice(0, -1).join("/"));
          await parentDirectory.removeEntry?.(albumPathParts[albumPathParts.length - 1]);
        } catch {
          // The album folder may contain non-photo files; removing the images is the required destructive action.
        }
      }

      const nextAlbums = photoAlbumsRef.current.filter((item) => item.id !== album.id);
      const nextProgress = { ...photoAlbumProgressRef.current };
      delete nextProgress[album.id];
      const nextCoverPreferences = { ...photoAlbumCoverPreferencesRef.current };
      delete nextCoverPreferences[album.id];
      const nextAlbumTags = { ...photoAlbumTagsRef.current };
      delete nextAlbumTags[album.id];
      let nextFavorites = favoritePhotoAlbumIdsRef.current;
      if (favoritePhotoAlbumIdsRef.current.has(album.id)) {
        nextFavorites = new Set(favoritePhotoAlbumIdsRef.current);
        nextFavorites.delete(album.id);
      }

      const nextPhotoObjectUrls = { ...photoObjectUrlsRef.current };
      album.images.forEach((image) => {
        const objectUrl = photoObjectUrlsRef.current[image.id];
        revokeObjectUrl(objectUrl);
        revokeObjectUrl(image.url);
        delete nextPhotoObjectUrls[image.id];
        delete photoObjectUrlAccessRef.current[image.id];
        delete photoImageFilePromisesRef.current[image.id];
        decodedPhotoImageIdsRef.current.delete(image.id);
      });

      photoAlbumsRef.current = nextAlbums;
      photoAlbumProgressRef.current = nextProgress;
      photoAlbumCoverPreferencesRef.current = nextCoverPreferences;
      photoAlbumTagsRef.current = nextAlbumTags;
      favoritePhotoAlbumIdsRef.current = nextFavorites;
      photoObjectUrlsRef.current = nextPhotoObjectUrls;
      setPhotoAlbums(nextAlbums);
      setPhotoRootStatuses((statuses) =>
        statuses.map((status) =>
          status.id === album.mediaRootId
            ? {
                ...status,
                videoCount: nextAlbums.filter((item) => item.mediaRootId === album.mediaRootId).length,
                scannedFiles: Math.max(status.scannedFiles - album.imageCount, 0),
                updatedAt: Date.now(),
              }
            : status,
        ),
      );
      setPhotoObjectUrls(nextPhotoObjectUrls);
      setPhotoAlbumProgress(nextProgress);
      setPhotoAlbumCoverPreferences(nextCoverPreferences);
      setPhotoAlbumTags(nextAlbumTags);
      setFavoritePhotoAlbumIds(nextFavorites);
      if (selectedPhotoAlbumId === album.id) {
        setSelectedPhotoAlbumId(null);
        setCurrentPhotoIndex(0);
        setActiveView("photos");
      }
      setPhotoAlbumPage(1);
      setPhotoAlbumDeleteCandidate(null);

      await saveCurrentPhotoAlbumStore({
        progress: nextProgress,
        favorites: Array.from(nextFavorites),
        coverImageByAlbumId: nextCoverPreferences,
        albumTags: nextAlbumTags,
      });

      void loadCachedPhotoAlbumScan()
        .then((cache) => {
          if (!cache || cache.rootId !== album.mediaRootId) return;
          if (!cache.albums.some((cachedAlbum) => cachedAlbum.id === album.id)) return;
          return saveCachedPhotoAlbumScan({
            ...cache,
            albums: cache.albums.filter((cachedAlbum) => cachedAlbum.id !== album.id),
            scannedFiles: Math.max(cache.scannedFiles - album.imageCount, 0),
            updatedAt: Date.now(),
          });
        })
        .catch(() => {
          setPhotoAlbumMessage("图集已删除，但扫描缓存更新失败，下次刷新会修正。");
        });

      setPhotoAlbumMessage(`已删除《${album.title}》及其中 ${album.imageCount} 张图片`);
    } catch {
      setPhotoDeleteError("删除整个图集失败，请确认浏览器仍有文件夹写入权限，或重新选择看图文件夹。");
    } finally {
      setIsPhotoDeletePending(false);
    }
  }, [
    clearPhotoAlbumAccessAfterWritePermissionDenied,
    isPhotoDeletePending,
    photoAlbumDeleteCandidate,
    saveCurrentPhotoAlbumStore,
    selectedPhotoAlbumId,
  ]);

  const updatePhotoAlbumSortMode = useCallback(
    (nextSortMode: PhotoAlbumSortMode) => {
      const nextPreferences = {
        ...photoAlbumPreferencesRef.current,
        sortMode: nextSortMode,
      };
      photoAlbumPreferencesRef.current = nextPreferences;
      setPhotoAlbumSortMode(nextSortMode);
      setPhotoAlbumPage(1);
      void savePhotoAlbumPreferences(nextPreferences).catch(() => {
        setPhotoAlbumMessage("看图偏好保存失败。");
      });
    },
    [],
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
      void savePhotoAlbumPreferences(nextPreferences).catch(() => {
        setPhotoAlbumMessage("看图偏好保存失败。");
      });
    },
    [],
  );

  useEffect(() => {
    setPhotoAlbumPage(1);
  }, [photoAlbumSearchQuery]);

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

  useLayoutEffect(() => {
    const layer = danmakuLayerRef.current;
    if (!layer) {
      setDanmakuLayerHeight(0);
      return undefined;
    }

    const updateDanmakuLayerHeight = () => {
      const nextHeight = Math.round(layer.getBoundingClientRect().height);
      setDanmakuLayerHeight((previousHeight) => (Math.abs(previousHeight - nextHeight) < 2 ? previousHeight : nextHeight));
    };

    updateDanmakuLayerHeight();
    const resizeObserver = new ResizeObserver(updateDanmakuLayerHeight);
    resizeObserver.observe(layer);
    window.addEventListener("resize", updateDanmakuLayerHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDanmakuLayerHeight);
    };
  }, [activeDanmakuComments.length, isDanmakuAvailable]);

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
        setPlaylistPage(1);
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
        nextDataStore = migrateMovedVideoData(nextDataStore, media.videos);

        const legacyDataStore = await loadLegacyPlayerDataStore(directory);
        if (legacyDataStore) {
          const legacyToGlobalId = new Map(media.videos.map((video) => [createLegacyVideoId(video.relativePath, video), video.id]));
          const nextProgress = { ...nextDataStore.progress };
          Object.entries(legacyDataStore.progress).forEach(([legacyId, progress]) => {
            const globalId = legacyToGlobalId.get(legacyId);
            if (globalId && !nextProgress[globalId]) nextProgress[globalId] = progress;
          });
          const nextVideoRatings = { ...nextDataStore.videoRatings };
          Object.entries(legacyDataStore.videoRatings).forEach(([legacyId, rating]) => {
            const globalId = legacyToGlobalId.get(legacyId);
            if (globalId && nextVideoRatings[globalId] === undefined) nextVideoRatings[globalId] = rating;
          });
          const nextVideoComments = { ...nextDataStore.videoComments };
          Object.entries(legacyDataStore.videoComments).forEach(([legacyId, comment]) => {
            const globalId = legacyToGlobalId.get(legacyId);
            if (globalId && !nextVideoComments[globalId]) nextVideoComments[globalId] = comment;
          });
          nextDataStore = { ...nextDataStore, progress: nextProgress, videoRatings: nextVideoRatings, videoComments: nextVideoComments };
          try {
            await deleteLegacyPlayerDataStore(directory);
          } catch {
            setMessage(`已导入旧进度，但无法删除资源库里的 ${PROGRESS_FILE_NAME}。`);
          }
        }

        const existingVideosOutsideRoot = videosRef.current.filter((video) => video.mediaRootId !== nextMediaRootId);
        const replacedVideos = videosRef.current.filter((video) => video.mediaRootId === nextMediaRootId);
        revokeReplacedMediaRootVideoUrls(replacedVideos, media.videos);
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
          .forEach((subtitle) => revokeObjectUrl(subtitle.url));
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
          fetchJson,
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
      revokeReplacedMediaRootVideoUrls,
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
        playlistPageSize,
        shortcuts,
        homeMediaMode,
        isSeriesMode,
        selectedSeriesKey,
        isCinemaMode,
        startFromHighEnergy,
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
        revokeObjectUrl(subtitle.url);
      });
      videosRef.current = media.videos;
      subtitlesRef.current = nextSubtitles;
      setVideos(media.videos);
      setSubtitles(nextSubtitles);
      activateDuplicateDetectionForMode(homeMediaMode, media.videos);
      updateSelectedSubtitleId("off");
      setPlaylistPage(1);
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
      activateDuplicateDetectionForMode,
      isCinemaMode,
      isPlaylistSortReversed,
      isSeriesMode,
      homeMediaMode,
      playlistPageSize,
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
    savePlayerSetting("skipFolderAccessPrompt", checked).catch(() => {
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
            revokeObjectUrl(thumbnailUrl);
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

  const scrollPlaylistItemIntoView = useCallback((videoId: string, behavior: ScrollBehavior) => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    const target = Array.from(playlist.querySelectorAll<HTMLElement>(".playlist-item")).find(
      (item) => item.dataset.videoId === videoId,
    );
    if (!target) return;
    const playlistRect = playlist.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = Math.max(
      0,
      playlist.scrollTop + targetRect.top - playlistRect.top - playlist.clientHeight / 2 + targetRect.height / 2,
    );
    playlist.scrollTo({ top, behavior });
    setPlaylistViewport({ scrollTop: top, height: playlist.clientHeight });
  }, []);

  const scrollToCurrentPlaylistItem = useCallback((behavior: ScrollBehavior = "smooth") => {
    const playlist = playlistRef.current;
    if (!playlist || !currentVideoId) return;
    const index = visibleVideoIndexById.get(currentVideoId);
    if (index === undefined) return;
    isPlaylistAutoScrollingRef.current = true;
    const targetPage = Math.floor(index / playlistPageSize) + 1;
    setPlaylistPage(targetPage);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollPlaylistItemIntoView(currentVideoId, behavior));
    });

    if (playlistAutoScrollTimerRef.current) {
      window.clearTimeout(playlistAutoScrollTimerRef.current);
    }
    playlistAutoScrollTimerRef.current = window.setTimeout(() => {
      isPlaylistAutoScrollingRef.current = false;
      playlistAutoScrollTimerRef.current = null;
    }, 700);
  }, [currentVideoId, playlistPageSize, scrollPlaylistItemIntoView, visibleVideoIndexById]);

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
    const autoScrollKey = currentVideoId;
    if (lastPlaylistAutoScrollKeyRef.current === autoScrollKey) return;
    lastPlaylistAutoScrollKeyRef.current = autoScrollKey;
    if (Date.now() - lastPlaylistUserScrollAtRef.current < 800) return;

    scrollToCurrentPlaylistItem();
  }, [currentVideoId, isScanning, scrollToCurrentPlaylistItem]);

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
      duplicateDetectionAbortRef.current?.abort();
      thumbnailLoadRunIdRef.current += 1;
      revokeVideoUrls(videosRef.current);
      subtitlesRef.current.forEach((subtitle) => {
        revokeObjectUrl(subtitle.url);
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
    if (playbackClockFrameRef.current) {
      window.cancelAnimationFrame(playbackClockFrameRef.current);
      playbackClockFrameRef.current = null;
    }
    if (!isPlaying || !currentVideo || !shouldUseDanmakuPlaybackClock) return;

    const syncPlaybackClock = () => {
      const element = videoRef.current;
      if (!element || element.paused || element.ended) {
        playbackClockFrameRef.current = null;
        return;
      }

      setCurrentTime(element.currentTime);
      const nextDuration = selectTrustedDuration([currentVideo.duration, element.duration]) || 0;
      setDuration((previousDuration) =>
        Math.abs(previousDuration - nextDuration) > 0.05 ? nextDuration : previousDuration,
      );
      playbackClockFrameRef.current = window.requestAnimationFrame(syncPlaybackClock);
    };

    playbackClockFrameRef.current = window.requestAnimationFrame(syncPlaybackClock);
    return () => {
      if (playbackClockFrameRef.current) {
        window.cancelAnimationFrame(playbackClockFrameRef.current);
        playbackClockFrameRef.current = null;
      }
    };
  }, [currentVideo?.duration, currentVideo?.id, isPlaying, shouldUseDanmakuPlaybackClock]);

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

    const shouldStartFromBeginning = startFromBeginningVideoIdRef.current === currentVideo.id;
    if (shouldStartFromBeginning) {
      startFromBeginningVideoIdRef.current = null;
    }
    const progress = progressStoreRef.current[currentVideo.id];
    const resumeAt = resolveInitialPlaybackTime({
      progressTime: progress?.currentTime,
      progressCompleted: progress?.completed,
      progressDuration: progress?.duration,
      highlights: videoHighlightsRef.current[currentVideo.id],
      startFromHighEnergy: playerPreferencesRef.current.startFromHighEnergy,
      forceBeginning: shouldStartFromBeginning,
    });

    const handleLoadedMetadata = () => {
      const currentVideoId = currentVideo.id;
      void getVideoElementMetadata(element, currentVideo).then((metadata) => {
        if (videoRef.current !== element || currentVideoIdRef.current !== currentVideoId) return;
        setDuration(metadata.duration || element.duration || 0);
        updateVideoMetadata(currentVideoId, metadata);
      });
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setVideoAspectRatio(getPlayerFrameAspectRatio());
      }
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
  }, [currentVideo, isMuted, volume]);

  useEffect(() => {
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      volume,
    };
    if (!hasLoadedPlayerDataStoreRef.current) return;
    savePlayerSetting("volume", volume).catch(() => undefined);
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

  useEffect(() => clearPendingProgressSave, [clearPendingProgressSave]);

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
            .forEach((item) => revokeObjectUrl(item.url));
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

  const {
    loadEmbeddedSubtitleForVideo,
    probeEmbeddedSubtitleTracksForVideo,
  } = useEmbeddedSubtitleController({
    autoSubtitleSelectionVideoIdRef,
    cachedEmbeddedSubtitleLookupKeysRef,
    canUseEmbeddedSubtitles,
    currentMediaRootId,
    currentVideo,
    currentVideoSubtitles,
    saveCurrentPlayerDataStore,
    selectedSubtitleIdRef,
    setSubtitles,
    subtitlesRef,
    updateSelectedSubtitleId,
  });

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

  const openCompatibleMediaConfirm = useCallback(() => {
    if (!currentVideo || !currentMediaRootId) return;
    if (!canCreateCompatibleMedia || compatibleMediaVideoId) return;
    setCompatibleMediaConfirm({
      label: compatibleMediaAction.label || "生成兼容 MP4",
      rootId: currentMediaRootId,
      relativePath: currentVideo.relativePath,
      videoId: currentVideo.id,
      videoName: currentVideo.name,
    });
  }, [canCreateCompatibleMedia, compatibleMediaAction.label, compatibleMediaVideoId, currentMediaRootId, currentVideo]);

  const openCompatibleMediaDeleteConfirm = useCallback(() => {
    if (!currentVideo || !currentMediaRootId || !currentVideo.playability?.compatibleUrl || isDeletingCompatibleMedia) return;
    setCompatibleMediaDeleteConfirm({
      rootId: currentMediaRootId,
      relativePath: currentVideo.relativePath,
      videoId: currentVideo.id,
      videoName: currentVideo.name,
    });
  }, [currentMediaRootId, currentVideo, isDeletingCompatibleMedia]);

  const {
    cancelCompatibleMediaGeneration,
    createCompatibleMedia,
    deleteCompatibleMedia,
  } = useCompatibleMediaController({
    compatibleMediaAbortControllerRef,
    compatibleMediaConfirm,
    compatibleMediaDeleteConfirm,
    compatibleMediaVideoId,
    isDeletingCompatibleMedia,
    removeVideoCompatibleMediaUrl,
    setCompatibleMediaConfirm,
    setCompatibleMediaDeleteConfirm,
    setCompatibleMediaMessage,
    setCompatibleMediaTask,
    setCompatibleMediaVideoId,
    setIsDeletingCompatibleMedia,
    setMessage,
    setPlaybackSourceChoices,
    updateVideoPlayability,
  });

  const {
    fetchDanmakuFromUrl,
    removeDanmakuMatch,
    replaceDanmakuPreferences,
  } = useDanmakuController({
    currentDanmakuSource,
    currentVideo,
    danmakuPreferencesRef,
    danmakuSelectionsRef,
    setCurrentDanmakuSource,
    setDanmakuComments,
    setDanmakuMessage,
    setDanmakuPreferences,
    setDanmakuSelections,
    setIsDanmakuLoading,
    setIsDanmakuSourceDetailOpen,
  });

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

  const {
    askSubtitleQuestion,
    loadProgressRecap,
    loadSubtitleSummary,
  } = useAiSubtitleController({
    currentTime,
    currentVideo,
    localConfig,
    selectedSubtitle,
    setAiMessage,
    setAiTab,
    setIsAiLoading,
    setIsAiPanelOpen,
    setSubtitleAnswer,
    setSubtitleRecap,
    setSubtitleSummary,
    subtitleQuestion,
  });

  const { loadHomeProgressRecap } = useHomeProgressRecapController({
    homeRecapCard,
    homeRecapMediaRootId,
    homeRecapSubtitle,
    homeRecapVideoId,
    loadEmbeddedSubtitleForVideo,
    localConfig,
    probeEmbeddedSubtitleTracksForVideo,
    setHomeProgressRecap,
    setHomeProgressRecapMessage,
    setHomeProgressRecapVideoId,
    setIsHomeProgressRecapLoading,
    shouldShowHomeRecap,
  });

  const clearAllCacheRuntimeData = useCallback(async () => {
    await clearRecentFolderHandle().catch(() => undefined);
    await clearPhotoAlbumFolderHandle().catch(() => undefined);
    clearLoadedMedia();
    directoryRef.current = null;
    libraryIdRef.current = null;
    libraryMetadataRef.current = undefined;
    setLibraryId(null);
    setMediaRootId(null);
    setActiveView("home");
  }, [clearLoadedMedia]);

  const {
    cacheStatus,
    cacheStatusItems,
    cacheStatusMessage,
    cacheStatusPageCount,
    cacheStatusPageEnd,
    cacheStatusPageStart,
    closeCacheStatusDialog,
    closeClearCacheConfirm,
    confirmClearSelectedCache,
    isAllCacheSelected,
    isCacheStatusDialogOpen,
    isCacheStatusLoading,
    isClearCacheConfirmOpen,
    isClearingCache,
    loadCacheStatus,
    openCacheStatusDialog,
    pagedCacheStatusItems,
    requestClearSelectedCache,
    selectedCacheBytes,
    selectedCacheFiles,
    selectedCacheItemIds,
    selectedCacheItems,
    setCacheStatusPage,
    toggleAllCacheItems,
    toggleCacheItemSelection,
    visibleCacheStatusPage,
  } = useCacheStatusDialog({
    isHomeViewVisible,
    onClearAllCache: clearAllCacheRuntimeData,
    onClearRuntimeCache: clearCurrentLibraryRuntimeData,
  });

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
    closeShortcutDialog();
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
  }, [closeShortcutDialog, currentVideo, persistCurrentProgress, resetHoldSpeedState]);

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

      if (event.key === "Escape" && photoDeleteCandidate && !isPhotoDeletePending) {
        event.preventDefault();
        setPhotoDeleteCandidate(null);
        setPhotoDeleteError("");
        return;
      }

      if (event.key === "Escape" && photoAlbumDeleteCandidate && !isPhotoDeletePending) {
        event.preventDefault();
        setPhotoAlbumDeleteCandidate(null);
        setPhotoDeleteError("");
        return;
      }

      if (event.key === "Escape" && videoDeleteCandidate && !isVideoDeletePending) {
        event.preventDefault();
        setVideoDeleteCandidate(null);
        setVideoDeleteError("");
        return;
      }

      if (event.key === "Escape" && isClearCacheConfirmOpen) {
        event.preventDefault();
        closeClearCacheConfirm();
        return;
      }

      if (event.key === "Escape" && compatibleMediaConfirm) {
        event.preventDefault();
        setCompatibleMediaConfirm(null);
        return;
      }

      if (event.key === "Escape" && isShortcutDialogOpen) {
        event.preventDefault();
        closeShortcutDialog();
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

      if (!currentVideo || isShortcutDialogOpen || photoDeleteCandidate || photoAlbumDeleteCandidate || isFormControl(event.target)) return;

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
    closeShortcutDialog,
    clearRightKeyHoldTimer,
    compatibleMediaConfirm,
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
    exitPrivacyMode,
    photoAlbumDeleteCandidate,
    photoDeleteCandidate,
    isPhotoDeletePending,
    videoDeleteCandidate,
    isVideoDeletePending,
    isCinemaMode,
    isClearCacheConfirmOpen,
    isPrivacyMode,
    isShortcutDialogOpen,
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
    const nextDuration = selectTrustedDuration([currentVideo?.duration, event.currentTarget.duration]) || 0;
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
    const nextDuration = selectTrustedDuration([currentVideo.duration, element.duration]) || 0;
    setCurrentTime(element.currentTime);
    setDuration(nextDuration);

    if (saveTimerRef.current && saveTimerVideoIdRef.current !== currentVideo.id) {
      clearPendingProgressSave();
    }
    if (saveTimerRef.current) return;
    const scheduledVideo = currentVideo;
    const scheduledElement = element;
    saveTimerVideoIdRef.current = scheduledVideo.id;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveTimerVideoIdRef.current = null;
      if (videoRef.current !== scheduledElement || currentVideoIdRef.current !== scheduledVideo.id) return;
      const scheduledDuration = selectTrustedDuration([scheduledVideo.duration, scheduledElement.duration, nextDuration]) || 0;
      updateProgress(scheduledVideo, scheduledElement.currentTime, scheduledDuration);
      recordPlaybackProgressForActivity(scheduledVideo, scheduledElement.currentTime);
      recordPlaybackProgressForStats(scheduledVideo, scheduledElement.currentTime, scheduledDuration);
    }, 1500);
  };

  const handleEnded = () => {
    persistCurrentProgress(true);
    recordPlaybackEndedForActivity();
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
  const primaryHomeLabels = createPrimaryHomeLabels({
    primaryResumeCard,
    modeFilteredVideoCount: modeFilteredVideos.length,
  });
  const primaryHomeTitle = primaryHomeLabels.title;
  const primaryHomeAction = primaryHomeLabels.action;
  const markVideoThumbnailFailed = useCallback((videoId: string) => setVideoThumbnailState(videoId, "failed"), []);
  const specialInsightRankingVideos = specialModeInsights
    ? {
        played: specialModeInsights.videosByPlayedDuration,
        count: specialModeInsights.videosByPlayCount,
        emission: specialModeInsights.videosByEmissionCount,
        active: specialModeInsights.videosByRecentActivity,
      }[specialInsightTab]
    : [];
  const formatSpecialInsightMetric = useCallback(
    (insight: SpecialModeVideoInsight) => formatSpecialInsightVideoMetric(insight, specialInsightTab),
    [specialInsightTab],
  );
  const renderHomeListCard = useCallback((card: HomeVideoCard, index: number) => (
    <HomeListCard
      card={card}
      index={index}
      key={card.video.id}
      title={createVideoMetadataTitle(card.video)}
      meta={formatHomeMeta(card)}
      onOpen={openVideoFromHome}
      onThumbnailError={markVideoThumbnailFailed}
    />
  ), [markVideoThumbnailFailed, openVideoFromHome]);
  const renderLibrarySearchResult = useCallback((result: LibrarySearchResult) => {
    return (
      <LibrarySearchResultItem
        createCard={createHomeVideoCard}
        formatProgressLabel={formatLibrarySearchProgressLabel}
        isResumableProgress={isResumableProgress}
        key={result.key}
        onOpen={openLibraryFolderFromSearch}
        result={result}
        videoRatings={videoRatings}
        videoTags={videoTags}
      />
    );
  }, [createHomeVideoCard, formatLibrarySearchProgressLabel, isResumableProgress, openLibraryFolderFromSearch, videoRatings, videoTags]);
  const homeLibrarySearchPreviewItems = useMemo(
    () => (homeLibrarySearchPreviewResults.length ? homeLibrarySearchPreviewResults.map(renderLibrarySearchResult) : null),
    [homeLibrarySearchPreviewResults, renderLibrarySearchResult],
  );
  const visibleHomeLibrarySearchItems = useMemo(
    () => visibleHomeLibrarySearchResults.map(renderLibrarySearchResult),
    [renderLibrarySearchResult, visibleHomeLibrarySearchResults],
  );
  const playerLibrarySearchPreviewItems = useMemo(
    () => (playerLibrarySearchPreviewResults.length ? playerLibrarySearchPreviewResults.map(renderLibrarySearchResult) : null),
    [playerLibrarySearchPreviewResults, renderLibrarySearchResult],
  );
  const visiblePlayerLibrarySearchItems = useMemo(
    () => visiblePlayerLibrarySearchResults.map(renderLibrarySearchResult),
    [renderLibrarySearchResult, visiblePlayerLibrarySearchResults],
  );
  const getPhotoImageUrl = useCallback(
    (image?: PhotoAlbumImage | null) => (image ? image.url || photoObjectUrls[image.id] || "" : ""),
    [photoObjectUrls],
  );
  const renderPhotoAlbumCard = useCallback((album: PhotoAlbum) => {
    const progress = photoAlbumProgress[album.id];
    const progressPercent = progress ? Math.min(100, ((progress.imageIndex + 1) / Math.max(album.imageCount, 1)) * 100) : 0;
    const isFavorite = favoritePhotoAlbumIds.has(album.id);
    const tags = photoAlbumTags[album.id] ?? [];
    const preferredCover = album.images.find((image) => image.id === photoAlbumCoverPreferences[album.id]) ?? null;
    const coverImageUrl = getPhotoImageUrl(preferredCover) || album.coverImageUrl || getPhotoImageUrl(album.images[0]);
    const progressLabel = formatPhotoAlbumProgress(album, photoAlbumProgress);
    return (
      <PhotoAlbumCard
        album={album}
        coverImageUrl={coverImageUrl}
        hasProgress={Boolean(progress)}
        isFavorite={isFavorite}
        key={album.id}
        metaLabel={`${progressLabel} · ${formatFileSize(album.totalSize)} · ${formatRelativeTime(album.updatedAt)}`}
        onDelete={requestDeletePhotoAlbum}
        onEditTags={openPhotoAlbumTagEditor}
        onOpen={openPhotoAlbum}
        onToggleFavorite={togglePhotoAlbumFavorite}
        progressLabel={progressLabel}
        progressPercent={progressPercent}
        tags={tags}
      />
    );
  }, [
    favoritePhotoAlbumIds,
    getPhotoImageUrl,
    openPhotoAlbum,
    openPhotoAlbumTagEditor,
    photoAlbumCoverPreferences,
    photoAlbumProgress,
    photoAlbumTags,
    requestDeletePhotoAlbum,
    togglePhotoAlbumFavorite,
  ]);
  const renderDuplicateVideoGroup = useCallback((group: DuplicateVideoGroup) => (
    <DuplicateVideoGroupCard
      formatFileSize={formatFileSize}
      formatTime={formatTime}
      group={group}
      key={group.id}
      onOpenVideo={openDuplicateVideo}
    />
  ), [openDuplicateVideo]);
  const duplicateDetectionPercent = duplicateDetectionProgress?.percent ?? 0;
  const duplicateDetectionDisplayMessage =
    duplicateVideoGroups.length && !isDuplicateDetectionResultCurrent && !isDuplicateDetectionRunning
      ? "媒体库或媒体模式已变化，请重新检测重复视频。"
      : duplicateDetectionMessage;
  const currentPhoto = selectedPhotoAlbum?.images[currentPhotoIndex] ?? null;
  const currentPhotoUrl = getPhotoImageUrl(currentPhoto);
  const currentVideoMetadataRows = currentVideo ? createVideoMetadataRows(currentVideo) : [];
  const currentVideoSummaryFallbackText = isPrivacyMode
    ? "正在播放：推荐视频"
    : isPhotoAlbumViewVisible
      ? activeView === "photoViewer" && selectedPhotoAlbum
        ? selectedPhotoAlbum.title
        : "看图"
      : currentVideo
        ? currentVideo.relativePath
        : message;
  const currentVideoPlayabilityMessage =
    currentVideo?.playability?.performanceWarning ??
    currentVideo?.playability?.reason ??
    "当前视频尚未探测播放兼容性。";
  const isCurrentHighEnergyMarkPending = pendingHighEnergyStart?.videoId === currentVideo?.id;
  const pendingHighEnergyStartTime = isCurrentHighEnergyMarkPending ? pendingHighEnergyStart?.time ?? null : null;
  const { ariaLabel: playlistPanelAriaLabel, title: playlistPanelTitle } = createPlaylistPanelLabels({ isDuplicatePlaylistActive, isRatingPlaylistActive, isPlaylistSeriesMode, playlistVisibleCountLabel, duplicateGroupCount: activeDuplicateVideoGroups.length, activeRatingPlaylistLabel, modeFilteredVideoCount: modeFilteredVideos.length, playlistFilter, homeMediaMode, homeMediaModeLabel, totalVideoCount: videos.length });

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
        <PlayerTopBar
          ref={topBarRef}
          activeView={activeView}
          canCreateCompatibleMedia={canCreateCompatibleMedia}
          compatibleMediaActionLabel={compatibleMediaAction.label}
          compatibleMediaActionVisible={compatibleMediaAction.visible}
          compatibleMediaMessage={compatibleMediaMessage}
          compatibleMediaVideoId={compatibleMediaVideoId}
          currentVideoId={currentVideo?.id ?? null}
          isHomeViewVisible={isHomeViewVisible}
          isNonPlayerViewVisible={isNonPlayerViewVisible}
          isPhotoAlbumViewVisible={isPhotoAlbumViewVisible}
          isPrivacyMode={isPrivacyMode}
          isScanning={isScanning}
          mediaProbeVideoId={mediaProbeVideoId}
          metadataRows={currentVideoMetadataRows}
          playabilityMessage={currentVideoPlayabilityMessage}
          summaryFallbackText={currentVideoSummaryFallbackText}
          theme={theme}
          videoCount={videos.length}
          onAddMediaLibrary={requestAddMediaLibrary}
          onOpenCacheStatus={openCacheStatusDialog}
          onOpenCompatibleMediaConfirm={openCompatibleMediaConfirm}
          onShowHome={showHomeView}
          onShowPhotoAlbums={showPhotoAlbumsView}
          onToggleTheme={toggleTheme}
        />

        {isHomeViewVisible ? (
          <section className="home-dashboard" aria-label="继续观看首页">
            <div className="home-primary-column">
              <HomeResumeSection
                actionLabel={primaryHomeAction}
                card={primaryHomeCard}
                homeMediaModeLabel={homeMediaModeLabel}
                isScanning={isScanning}
                title={primaryHomeTitle}
                videoCount={videos.length}
                formatHomeMeta={formatHomeMeta}
                formatProgressLabel={formatHomeProgressLabel}
                onAddMediaLibrary={requestAddMediaLibrary}
                onOpenVideo={openVideoFromHome}
                onThumbnailError={markVideoThumbnailFailed}
              />

              {nextEpisodeCard ? (
                <HomeNextEpisodeSection
                  card={nextEpisodeCard}
                  onOpenVideo={openVideoFromHome}
                  onThumbnailError={markVideoThumbnailFailed}
                />
              ) : null}

              <HomeRecentSection cards={recentHomeCards} renderCard={renderHomeListCard} />

              {isRatingFilterEnabled ? (
                <WatchActivitySection
                  carouselCardsByDate={watchActivityCarouselCardsByDate}
                  carouselTick={watchActivityCarouselTick}
                  cards={selectedWatchActivityCards}
                  insights={watchActivityInsights}
                  metric={watchActivityMetric}
                  metricOptions={watchActivityMetricOptions}
                  monthGroups={watchActivityMonthGroups}
                  range={watchActivityRange}
                  rangeOptions={watchActivityRangeOptions}
                  selectedDay={selectedWatchActivityDay}
                  watchActivityStore={watchActivityRef.current}
                  formatCumulativeDuration={formatCumulativeDuration}
                  formatDate={formatWatchActivityDate}
                  formatHomeMeta={formatHomeMeta}
                  formatMetric={formatWatchActivityMetric}
                  onMetricChange={setWatchActivityMetric}
                  onOpenVideo={openVideoFromHome}
                  onRangeChange={setWatchActivityRange}
                  onSelectDate={setSelectedWatchActivityDate}
                  onSelectTag={runSpecialInsightTagSearch}
                  onThumbnailError={markVideoThumbnailFailed}
                />
              ) : null}

              <HomeSpecialInsightsSection
                activeTab={specialInsightTab}
                formatDuration={formatCumulativeDuration}
                formatRelativeTime={formatRelativeTime}
                formatVideoMetric={formatSpecialInsightMetric}
                insights={specialModeInsights}
                onOpenVideo={openVideoFromHome}
                onSelectTag={runSpecialInsightTagSearch}
                onTabChange={setSpecialInsightTab}
                rankingVideos={specialInsightRankingVideos}
                videoComments={videoComments}
                videoRatings={videoRatings}
              />
            </div>

            <HomeSideColumn
              mode={{
                homeMediaMode,
                homeMediaModeLabel,
                onModeChange: updateHomeMediaMode,
              }}
              libraryStats={{ stats: libraryStats }}
              mediaLibrary={{
                homeMediaMode,
                homeMediaModeLabel,
                isOpen: isMediaLibraryPanelOpen,
                isScanning,
                mediaRootCount: localConfig?.mediaRoots.length ?? 0,
                mediaRoots: homeModeMediaRoots,
                mediaRootStatuses: modeFilteredMediaRootStatuses,
                onConfigureLocalPath: openMediaRootLocalPathDialog,
                onRefresh: () => void loadGlobalMediaLibrary(),
                onToggle: () => setIsMediaLibraryPanelOpen((isOpen) => !isOpen),
              }}
              ratingFilter={isRatingFilterEnabled ? {
                numericRatingPlaylistCount,
                onOpenHigh: () => {
                  setRatingFilterOperator("gt");
                  setRatingFilterThreshold(8);
                  openRatingPlaylist("numeric", "gt", 8);
                },
                onOpenLow: () => {
                  setRatingFilterOperator("lt");
                  setRatingFilterThreshold(6);
                  openRatingPlaylist("numeric", "lt", 6);
                },
                onOpenNumeric: () => openRatingPlaylist("numeric"),
                onOpenUnrated: () => openRatingPlaylist("unrated"),
                onOperatorChange: setRatingFilterOperator,
                onThresholdChange: (threshold) => setRatingFilterThreshold(clamp(threshold, 0, 10)),
                ratingFilterLabel,
                ratingFilterOperator,
                ratingFilterThreshold,
                ratingStats,
              } : null}
              recap={shouldShowHomeRecap ? {
                canUseEmbeddedSubtitles: canUseHomeEmbeddedSubtitles,
                canUseRecapSubtitle: canUseHomeRecapSubtitle,
                formatProgressLabel: formatHomeProgressLabel,
                homeRecapCard,
                homeRecapMediaRoot,
                homeRecapSubtitle,
                homeRecapVideoId,
                homeProgressRecap,
                homeProgressRecapMessage,
                homeProgressRecapVideoId,
                isAiConfigured: Boolean(localConfig?.ai.configured),
                isLoading: isHomeProgressRecapLoading,
                onConfigureLocalPath: openMediaRootLocalPathDialog,
                onLoadRecap: () => void loadHomeProgressRecap(),
              } : null}
              librarySearch={{
                answer: homeLibrarySearchAnswer,
                defaultStatus: defaultLibrarySearchStatus,
                disabled: isLibrarySearchLoading || !homeLibrarySearchVideos.length,
                emptyTarget: homeLibrarySearchEmptyTarget,
                hasMoreResults: hasMoreHomeLibrarySearchResults,
                headerModeLabel: homeMediaMode === "special" ? "本地筛选" : homeLibrarySearchMode === "ai" ? "AI 辅助" : "本地优先",
                inputValue: homeLibrarySearchQuery,
                isEmpty: isHomeLibrarySearchSurface && librarySearchMode === "empty",
                isLoading: isHomeLibrarySearchLoading,
                loadMoreRef: librarySearchLoadMoreRef,
                placeholder: homeLibrarySearchPlaceholder,
                previewResults: homeLibrarySearchPreviewItems,
                results: visibleHomeLibrarySearchItems,
                resultsRef: librarySearchResultsRef,
                searchMode: homeLibrarySearchMode,
                shouldShowPreview: shouldShowHomeLibrarySearchPreview,
                shouldShowStatus: shouldShowHomeLibrarySearchStatus,
                statusMessage: homeLibrarySearchMessage,
                totalCount: homeLibrarySearchResults.length,
                visibleCount: visibleHomeLibrarySearchResults.length,
                onBlur: handleLibrarySearchBlur,
                onFocus: () => setFocusedLibrarySearchSurface("home"),
                onInputChange: setHomeLibrarySearchQuery,
                onLoadMore: loadMoreLibrarySearchResults,
                onSubmit: () => void runLibrarySearch("home"),
              }}
              duplicateSummary={{
                detectionMessage: duplicateDetectionDisplayMessage,
                detectionPercent: duplicateDetectionPercent,
                duplicatePlaylistCount: duplicatePlaylistVideos.length,
                groups: activeDuplicateVideoGroups,
                isRunning: isDuplicateDetectionRunning,
                onOpenPlaylist: openDuplicatePlaylist,
                onRunDetection: () => void runDuplicateVideoDetection(),
                progress: duplicateDetectionProgress,
                renderGroup: renderDuplicateVideoGroup,
                totalVideoCount: modeFilteredVideos.length,
              }}
              favorites={{
                cards: favoriteHomeCards,
                renderCard: renderHomeListCard,
              }}
            />
          </section>
        ) : null}

        {isPhotoAlbumViewVisible && activeView === "photos" ? (
          <PhotoDashboardSection
            currentPage={photoAlbumPage}
            end={photoAlbumPageEnd}
            filter={photoAlbumFilter}
            isGridCompact={isPhotoAlbumGridCompact}
            isLoading={isPhotoAlbumsLoading}
            message={photoAlbumMessage}
            pageCount={photoAlbumPageCount}
            pagedPhotoAlbums={pagedPhotoAlbums}
            photoRootStatuses={photoRootStatuses}
            searchQuery={photoAlbumSearchQuery}
            sortMode={photoAlbumSortMode}
            sortOptions={photoAlbumSortOptions}
            start={photoAlbumPageStart}
            stats={photoAlbumStats}
            totalVisibleAlbums={visiblePhotoAlbums.length}
            onChooseDirectory={() => void choosePhotoAlbumDirectory()}
            onFilterChange={updatePhotoAlbumFilter}
            onNextPage={() => setPhotoAlbumPage((page) => Math.min(page + 1, photoAlbumPageCount))}
            onPreviousPage={() => setPhotoAlbumPage((page) => Math.max(page - 1, 1))}
            onRandomAlbum={openRandomPhotoAlbum}
            onRefresh={() => void refreshPhotoAlbumDirectory()}
            onRenderAlbum={renderPhotoAlbumCard}
            onSearchChange={setPhotoAlbumSearchQuery}
            onSearchClear={() => setPhotoAlbumSearchQuery("")}
            onSortModeChange={updatePhotoAlbumSortMode}
          />
        ) : null}

        {isPhotoAlbumViewVisible && activeView === "photoViewer" && selectedPhotoAlbum ? (
          <PhotoViewerSection
            album={selectedPhotoAlbum}
            currentIndex={currentPhotoIndex}
            currentPhoto={currentPhoto}
            currentPhotoUrl={currentPhotoUrl}
            isCoverCurrent={Boolean(currentPhoto && photoAlbumCoverPreferences[selectedPhotoAlbum.id] === currentPhoto.id)}
            isFavorite={favoritePhotoAlbumIds.has(selectedPhotoAlbum.id)}
            thumbnails={visiblePhotoThumbnails}
            getImageUrl={getPhotoImageUrl}
            onBack={showPhotoAlbumList}
            onDeleteCurrentPhoto={requestDeleteCurrentPhoto}
            onEditTags={openPhotoAlbumTagEditor}
            onMarkCompleted={markSelectedPhotoAlbumCompleted}
            onMove={movePhoto}
            onResetProgress={resetSelectedPhotoAlbumProgress}
            onSelectImage={(image) => {
              setCurrentPhotoIndex(image.index);
              persistPhotoAlbumProgress(selectedPhotoAlbum, image.index, image.index === selectedPhotoAlbum.images.length - 1);
            }}
            onSetCover={setPhotoAlbumCover}
            onToggleFavorite={togglePhotoAlbumFavorite}
          />
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
          <PlayerStage
            activeDanmakuComments={activeDanmakuComments}
            autoNextPrompt={autoNextPrompt}
            currentTime={currentTime}
            currentVideoSourceAspectRatio={currentVideoSourceAspectRatio}
            danmakuLaneCount={danmakuLaneCount}
            danmakuLaneLineHeight={danmakuLaneLineHeight}
            danmakuLayerRef={danmakuLayerRef}
            danmakuPreferences={danmakuPreferences}
            doubleClickFeedback={doubleClickFeedback}
            hasCurrentVideo={Boolean(currentVideo)}
            isDanmakuAvailable={isDanmakuAvailable}
            isPlaying={isPlaying}
            isPrivacyMode={isPrivacyMode}
            isVideoSideways={isVideoSideways}
            launchEffectKey={launchEffectKey}
            message={message}
            normalizedVideoRotation={normalizedVideoRotation}
            playerOverlayFeedback={playerOverlayFeedback}
            previewCanvasRef={previewCanvasRef}
            previewVideoRef={previewVideoRef}
            selectedSubtitle={selectedSubtitle}
            videoRef={videoRef}
            formatDanmakuLaneTop={formatDanmakuLaneTop}
            getDanmakuLane={getDanmakuLane}
            onAutoNextCancel={cancelAutoNextPrompt}
            onAutoNextConfirm={confirmAutoNext}
            onDurationChange={handleDurationChange}
            onEnded={handleEnded}
            onPause={() => {
              setIsPlaying(false);
              persistCurrentProgress();
            }}
            onPlay={() => {
              setIsPlaying(true);
              if (currentVideo) {
                recordPlaybackStartForActivity(currentVideo);
                recordPlaybackStartForStats(currentVideo);
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onTogglePlay={togglePlay}
          />

          <PlayerControlBar
            canPlayNext={canPlayNext}
            canRecordEmission={canRecordEmission}
            canUseEmbeddedSubtitles={canUseEmbeddedSubtitles}
            controlBarRef={controlBarRef}
            currentTime={currentTime}
            currentVideoHasCompatibleMedia={currentVideoHasCompatibleMedia}
            currentVideoHighlights={currentVideoHighlights}
            currentVideoRating={currentVideoRating}
            currentVideoSpecialStats={currentVideoSpecialStats}
            currentVideoSourceChoice={currentVideoSourceChoice}
            currentVideoTagsCount={currentVideoTags.length}
            danmakuEnabled={Boolean(danmakuPreferences.enabled && currentDanmakuSource)}
            duration={duration}
            effectivePlaybackRate={effectivePlaybackRate}
            hasCurrentVideo={Boolean(currentVideo)}
            hasSelectedSubtitle={Boolean(selectedSubtitle)}
            holdPlaybackRate={holdPlaybackRate}
            holdRateOptions={holdRateSelectOptions}
            homeMediaMode={homeMediaMode}
            isAiPanelOpen={isAiPanelOpen}
            isCinemaMode={isCinemaMode}
            isDeletingCompatibleMedia={isDeletingCompatibleMedia}
            isEmbeddedSubtitleLoading={isEmbeddedSubtitleLoading}
            isHighEnergyMarkDisabled={!currentVideo || !duration || isPrivacyMode}
            isHighEnergyMarkPending={isCurrentHighEnergyMarkPending}
            isMuted={isMuted}
            isPlaying={isPlaying}
            isPrivacyMode={isPrivacyMode}
            isSeriesMode={isSeriesMode}
            normalizedVideoRotation={normalizedVideoRotation}
            pendingHighlightStartTime={pendingHighEnergyStartTime}
            playbackMode={playbackMode}
            playbackModeOptions={playbackModeOptions}
            playbackRateOptions={playbackRateSelectOptions}
            progressPercent={progressPercent}
            seekStep={seekStep}
            seekStepOptions={seekStepSelectOptions}
            selectedSubtitleId={selectedSubtitleId}
            showPlaybackMode={!isSeriesMode}
            startFromHighEnergy={startFromHighEnergy}
            subtitleControlOptions={subtitleControlOptions}
            timelinePreview={timelinePreview}
            timelineRef={timelineRef}
            volume={volume}
            formatTime={formatTime}
            onChangeHoldPlaybackRate={setHoldPlaybackRate}
            onChangePlaybackMode={setPlaybackMode}
            onChangePlaybackRate={setPlaybackRate}
            onChangeSeekStep={setSeekStep}
            onChangeSourceChoice={(value) => {
              if (!currentVideo) return;
              setPlaybackSourceChoices((previous) => ({ ...previous, [currentVideo.id]: value }));
            }}
            onChangeSubtitle={(value) => {
              autoSubtitleSelectionVideoIdRef.current = null;
              if (value === "manual") {
                void chooseSubtitleFile();
                return;
              }
              updateSelectedSubtitleId(value);
            }}
            onChangeVolume={changeVolume}
            onDeleteCompatibleMedia={openCompatibleMediaDeleteConfirm}
            onEditHighlight={editCurrentHighEnergySegment}
            onHideTimelinePreview={hideTimelinePreview}
            onKeepControlsVisible={keepControlsVisible}
            onMarkHighEnergySegment={markCurrentHighEnergySegment}
            onOpenAiPanel={() => setIsAiPanelOpen(true)}
            onOpenDanmakuDialog={() => {
              setIsDanmakuDialogOpen(true);
              setDanmakuMessage((message) => message || "匹配或拉取弹幕后显示在视频上方。");
            }}
            onOpenRatingDialog={() => currentVideo && openVideoRatingDialog(currentVideo)}
            onOpenTagDialog={() => {
              setIsTagDialogOpen(true);
              setTagMessage("");
              setTagMergePrompt(null);
            }}
            onPlayNext={playNext}
            onProbeEmbeddedSubtitles={probeEmbeddedSubtitles}
            onRecordEmission={recordEmissionForCurrentVideo}
            onRemoveHighlight={removeCurrentHighEnergySegment}
            onReturnFocusToPlayer={returnFocusToPlayer}
            onRotateVideo={rotateVideoClockwise}
            onScheduleControlsHide={scheduleControlsHide}
            onSeek={seekTo}
            onStopTimelineDragPreview={stopTimelineDragPreview}
            onToggleCinemaMode={toggleCinemaMode}
            onToggleFullscreen={toggleFullscreen}
            onToggleMute={toggleMute}
            onTogglePictureInPicture={togglePictureInPicture}
            onTogglePlay={togglePlay}
            onTogglePrivacyMode={togglePrivacyMode}
            onToggleShortcutDialog={toggleShortcutDialog}
            onToggleStartFromHighEnergy={toggleStartFromHighEnergy}
            onUpdateTimelinePreview={updateTimelinePreview}
            onUpdateTimelinePreviewFromTime={updateTimelinePreviewFromTime}
          />
        </div>
      </section>

      {!isNonPlayerViewVisible && !isPrivacyMode && !isCinemaMode ? (
        <PlaylistPanel
          ariaLabel={playlistPanelAriaLabel}
          bangumiButtonTitle={bangumiButtonTitle}
          canOpenBangumiSubject={canOpenBangumiSubject}
          currentVideoId={currentVideoId}
          defaultLibrarySearchStatus={defaultLibrarySearchStatus}
          duplicatePlaylistMetaByVideoId={duplicatePlaylistMetaByVideoId}
          favoriteVideoIds={favoriteVideoIds}
          hasModeFilteredVideos={Boolean(modeFilteredVideos.length)}
          hasMorePlayerLibrarySearchResults={hasMorePlayerLibrarySearchResults}
          hasVisibleVideos={Boolean(visibleVideos.length)}
          homeMediaMode={homeMediaMode}
          homeMediaModeLabel={homeMediaModeLabel}
          isBangumiLoading={activeBangumiMatch?.status === "loading"}
          isCurrentVideoVisible={isCurrentVideoVisible}
          isDuplicatePlaylistActive={isDuplicatePlaylistActive}
          isPlayerLibrarySearchEmpty={isPlayerLibrarySearchSurface && librarySearchMode === "empty"}
          isPlayerLibrarySearchLoading={isPlayerLibrarySearchLoading}
          isPlaylistSeriesMode={isPlaylistSeriesMode}
          isPlaylistSortReversed={isPlaylistSortReversed}
          isRatingPlaylistActive={isRatingPlaylistActive}
          isSeriesMenuOpen={isSeriesMenuOpen}
          isVideoDeletePending={isVideoDeletePending}
          message={message}
          modeFilteredVideoCount={modeFilteredVideos.length}
          pagedPlaylistVideos={pagedPlaylistVideos}
          playerLibrarySearchAnswer={playerLibrarySearchAnswer}
          playerLibrarySearchDisabled={isLibrarySearchLoading || !playerLibrarySearchVideos.length}
          playerLibrarySearchEmptyTarget={playerLibrarySearchEmptyTarget}
          playerLibrarySearchInput={playerLibrarySearchQuery}
          playerLibrarySearchLoadMoreRef={playerLibrarySearchLoadMoreRef}
          playerLibrarySearchPlaceholder={playerLibrarySearchPlaceholder}
          playerLibrarySearchPreviewItems={playerLibrarySearchPreviewItems}
          playerLibrarySearchResultsRef={playerLibrarySearchResultsRef}
          playerLibrarySearchSearchMode={playerLibrarySearchMode}
          playerLibrarySearchStatusMessage={playerLibrarySearchMessage}
          playerLibrarySearchTotalCount={playerLibrarySearchResults.length}
          playerMediaModeLabel={playerMediaModeLabel}
          playlistFilter={playlistFilter}
          playlistIndexById={playlistIndexById}
          playlistPageCount={playlistPageCount}
          playlistPageEndLabel={playlistPageEndLabel}
          playlistPageInput={playlistPageInput}
          playlistPageSize={playlistPageSize}
          playlistPageSizeOptions={playlistPageSizeSelectOptions}
          playlistPageStartLabel={playlistPageStartLabel}
          playlistRef={playlistRef}
          playlistScrollTop={playlistViewport.scrollTop}
          playlistSortMode={playlistSortMode}
          playlistSortOptions={playlistSortOptions}
          playlistTitle={playlistPanelTitle}
          progressStore={progressStore}
          selectedSeriesKey={selectedSeriesKey}
          seriesOptions={seriesOptions}
          seriesTitleByVideoId={seriesTitleByVideoId}
          shouldShowPlayerLibrarySearchPreview={shouldShowPlayerLibrarySearchPreview}
          shouldShowPlayerLibrarySearchStatus={shouldShowPlayerLibrarySearchStatus}
          totalVideoCount={videos.length}
          visiblePlayerLibrarySearchItems={visiblePlayerLibrarySearchItems}
          visiblePlayerLibrarySearchResultCount={visiblePlayerLibrarySearchResults.length}
          visiblePlaylistPage={visiblePlaylistPage}
          visibleVideoCount={visibleVideos.length}
          videoComments={videoComments}
          videoRatings={videoRatings}
          videoTags={videoTags}
          createVideoTitle={createVideoMetadataTitle}
          onChangePlaylistFilter={(nextFilter) => {
            setPlaylistPage(1);
            setPlaylistFilter(nextFilter);
          }}
          onChangePlaylistSortMode={updatePlaylistSortMode}
          onClearDuplicatePlaylist={() => {
            setPlaylistPage(1);
            setIsDuplicatePlaylistActive(false);
          }}
          onClearRatingPlaylist={() => {
            setPlaylistPage(1);
            setRatingPlaylistMode(null);
          }}
          onCommitPlaylistPageInput={() => {
            commitPlaylistPageInput();
            scrollPlaylistToTop("auto");
          }}
          onDeleteVideo={requestDeleteVideo}
          onFavoriteToggle={toggleFavorite}
          onLibrarySearchBlur={handleLibrarySearchBlur}
          onLibrarySearchFocus={() => setFocusedLibrarySearchSurface("player")}
          onLibrarySearchInputChange={setPlayerLibrarySearchQuery}
          onLibrarySearchLoadMore={loadMoreLibrarySearchResults}
          onLibrarySearchSubmit={() => void runLibrarySearch("player")}
          onOpenBangumiSubject={openBangumiSubject}
          onOpenRating={openVideoRatingDialog}
          onPageInputChange={setPlaylistPageInput}
          onPageSizeChange={updatePlaylistPageSize}
          onRequestPage={(page) => {
            syncPlaylistPageInput(page);
            scrollPlaylistToTop("auto");
          }}
          onResetProgress={resetVideoProgress}
          onScrollPlaylist={markPlaylistUserScroll}
          onScrollPlaylistToCurrent={() => scrollToCurrentPlaylistItem()}
          onScrollPlaylistToTop={() => scrollPlaylistToTop()}
          onSelectSeries={updateSelectedSeries}
          onSelectVideo={(selectedVideo, isActive) => {
            if (isActive) return;
            if (isDuplicatePlaylistActive) {
              openDuplicateVideo(selectedVideo, { keepDuplicatePlaylist: true });
              return;
            }
            if (isRatingPlaylistActive) {
              selectVideo(selectedVideo.id, { keepRatingPlaylist: true, syncSeriesMode: false });
              return;
            }
            selectVideo(selectedVideo.id);
          }}
          onThumbnailError={(videoId) => setVideoThumbnailState(videoId, "failed")}
          onTogglePlaylistSortDirection={togglePlaylistSortDirection}
          onToggleSeriesMenu={() => setIsSeriesMenuOpen((isOpen) => !isOpen)}
        />
      ) : null}
    </main>
    <HighEnergyTagDialog
      prompt={highEnergyTagPrompt}
      onClose={() => setHighEnergyTagPrompt(null)}
      onSave={saveHighEnergyTagPrompt}
      onPromptChange={setHighEnergyTagPrompt}
      formatTime={formatTime}
    />
    <DeletionDialogs
      video={{
        isOpen: Boolean(videoDeleteCandidate),
        titleId: "delete-video-title",
        title: "删除视频文件？",
        description: "这个操作会直接从磁盘删除视频文件，删除后无法在播放器内恢复。",
        primaryText: "删除文件",
        pendingText: "删除中...",
        isPending: isVideoDeletePending,
        previewTitle: videoDeleteCandidate?.name ?? "",
        previewMeta: videoDeleteError || videoDeleteCandidate?.relativePath || "",
        onClose: () => {
          setVideoDeleteCandidate(null);
          setVideoDeleteError("");
        },
        onConfirm: () => void confirmDeleteVideo(),
      }}
      photo={{
        isOpen: Boolean(photoDeleteCandidate),
        titleId: "delete-photo-title",
        title: "删除图片？",
        description: "这个操作会直接从本地磁盘删除图片文件，删除后无法在播放器内恢复。",
        primaryText: "删除图片",
        pendingText: "删除中",
        isPending: isPhotoDeletePending,
        previewTitle: photoDeleteCandidate?.name ?? "",
        previewMeta: photoDeleteCandidate?.relativePath || photoDeleteCandidate?.albumTitle || "",
        error: photoDeleteError,
        onClose: () => setPhotoDeleteCandidate(null),
        onConfirm: () => void confirmDeleteCurrentPhoto(),
      }}
      photoAlbum={{
        isOpen: Boolean(photoAlbumDeleteCandidate),
        titleId: "delete-photo-album-title",
        title: "删除整个图集？",
        description: "这个操作会直接从本地磁盘删除这个图集中的图片文件，删除后无法在播放器内恢复。",
        primaryText: "删除整本",
        pendingText: "删除中",
        isPending: isPhotoDeletePending,
        previewTitle: photoAlbumDeleteCandidate?.title ?? "",
        previewMeta: photoAlbumDeleteCandidate
          ? `${photoAlbumDeleteCandidate.relativePath || "根目录"} · ${photoAlbumDeleteCandidate.imageCount} 张 · ${formatFileSize(photoAlbumDeleteCandidate.totalSize)}`
          : "",
        error: photoDeleteError,
        onClose: () => {
          setPhotoAlbumDeleteCandidate(null);
          setPhotoDeleteError("");
        },
        onConfirm: () => void confirmDeletePhotoAlbum(),
      }}
    />
    <PhotoAlbumTagDialog
      album={photoAlbumTagEditorAlbum}
      tags={photoAlbumTagEditorAlbum ? photoAlbumTags[photoAlbumTagEditorAlbum.id] ?? [] : []}
      tagInput={photoAlbumTagInput}
      message={photoAlbumTagMessage}
      onClose={closePhotoAlbumTagEditor}
      onAddTags={addTagsToPhotoAlbum}
      onRemoveTag={removeTagFromPhotoAlbum}
      onTagInputChange={setPhotoAlbumTagInput}
    />
    <MediaRootDialogsGroup
      label={mediaRootLabelPrompt ? {
        directoryName: mediaRootLabelPrompt.directoryName,
        value: mediaRootLabelPrompt.value,
        onClose: () => closeMediaRootLabelPrompt(null),
        onSubmit: submitMediaRootLabelPrompt,
        onValueChange: updateMediaRootLabelPromptValue,
      } : null}
      existingRoot={existingMediaRootPrompt ? {
        directoryName: existingMediaRootPrompt.directoryName,
        mediaRootLabel: existingMediaRootPrompt.mediaRootLabel,
        onCancel: () => closeExistingMediaRootPrompt(false),
        onRescan: () => closeExistingMediaRootPrompt(true),
      } : null}
      localPath={mediaRootLocalPathDialog ? {
        root: mediaRootLocalPathDialog.root,
        value: mediaRootLocalPathDialog.value,
        error: mediaRootLocalPathDialog.error,
        isSaving: mediaRootLocalPathDialog.isSaving,
        onClose: closeMediaRootLocalPathDialog,
        onSubmit: () => void submitMediaRootLocalPath(),
        onValueChange: updateMediaRootLocalPathValue,
      } : null}
      folderAccess={{
        isOpen: isFolderDialogOpen,
        skipPrompt: skipFolderAccessPrompt,
        onClose: () => setIsFolderDialogOpen(false),
        onSkipPromptChange: updateSkipFolderAccessPrompt,
        onContinue: chooseMediaLibraryDirectory,
      }}
    />
    <PlayerUtilityDialogs
      compatibleMedia={{
        confirm: compatibleMediaConfirm,
        task: compatibleMediaTask,
        deleteConfirm: compatibleMediaDeleteConfirm,
        message: compatibleMediaMessage,
        isDeleting: isDeletingCompatibleMedia,
        onCloseConfirm: () => setCompatibleMediaConfirm(null),
        onCreate: () => void createCompatibleMedia(),
        onCancelTask: cancelCompatibleMediaGeneration,
        onCloseDeleteConfirm: () => setCompatibleMediaDeleteConfirm(null),
        onDelete: () => void deleteCompatibleMedia(),
      }}
      embeddedSubtitle={{
        isOpen: isEmbeddedSubtitleDialogOpen,
        tracks: embeddedSubtitleTracks,
        message: embeddedSubtitleMessage,
        isLoading: isEmbeddedSubtitleLoading,
        onClose: () => setIsEmbeddedSubtitleDialogOpen(false),
        onExtract: (track) => void extractEmbeddedSubtitle(track),
      }}
      cacheStatus={{
        isOpen: isCacheStatusDialogOpen,
        isClearConfirmOpen: isClearCacheConfirmOpen,
        cacheStatus,
        cacheStatusItems,
        cacheStatusMessage,
        isCacheStatusLoading,
        isClearingCache,
        isAllCacheSelected,
        selectedCacheItemIds,
        selectedCacheItems,
        selectedCacheBytes,
        selectedCacheFiles,
        pagedCacheStatusItems,
        cacheStatusPageStart,
        cacheStatusPageEnd,
        visibleCacheStatusPage,
        cacheStatusPageCount,
        onClose: closeCacheStatusDialog,
        onCloseClearConfirm: closeClearCacheConfirm,
        onToggleAllCacheItems: toggleAllCacheItems,
        onToggleCacheItemSelection: toggleCacheItemSelection,
        onCacheStatusPageChange: setCacheStatusPage,
        onLoadCacheStatus: () => void loadCacheStatus(),
        onRequestClearSelectedCache: requestClearSelectedCache,
        onConfirmClearSelectedCache: () => void confirmClearSelectedCache(),
        formatFileSize,
        formatModifiedTime,
      }}
    />
    <RatingDialog
      isOpen={isRatingDialogOpen}
      videoName={ratingDialogVideoName}
      ratingInput={ratingInput}
      ratingCommentInput={ratingCommentInput}
      ratingHoverValue={ratingHoverValue}
      ratingMessage={ratingMessage}
      onClose={closeRatingDialog}
      onSave={saveRatingDialogValue}
      onClear={clearRatingDialogValue}
      onRatingInputChange={setRatingInput}
      onRatingCommentInputChange={setRatingCommentInput}
      onRatingHoverValueChange={setRatingHoverValue}
      onRatingMessageChange={setRatingMessage}
    />
    <TagDialog
      isOpen={isTagDialogOpen}
      dialogRef={tagDialogRef}
      isDragging={isTagDialogDragging}
      offset={tagDialogOffset}
      currentVideoName={currentVideo?.name ?? ""}
      currentVideoTags={currentVideoTags}
      tagInput={tagInput}
      tagInputSuggestions={tagInputSuggestions}
      resolvedActiveTagSuggestionIndex={resolvedActiveTagSuggestionIndex}
      activeTagSuggestionId={activeTagSuggestionId}
      isTagSuggestionLoading={isTagSuggestionLoading}
      isAutoTagLoading={isAutoTagLoading}
      autoTagSuggestions={autoTagSuggestions}
      selectedAutoTags={selectedAutoTags}
      autoTagSummary={autoTagSummary}
      autoTagSources={autoTagSources}
      autoTagMessage={autoTagMessage}
      tagMergePrompt={tagMergePrompt}
      tagMessage={tagMessage}
      isAiConfigured={Boolean(localConfig?.ai.configured)}
      hasCurrentVideo={Boolean(currentVideo)}
      onClose={() => setIsTagDialogOpen(false)}
      onRemoveTag={removeTagFromCurrentVideo}
      onSubmitTagInput={submitTagInput}
      onTagInputChange={setTagInput}
      onActiveTagSuggestionIndexChange={setActiveTagSuggestionIndex}
      onSelectTagSuggestion={submitTagInputSuggestion}
      onGenerateAutoTags={() => void generateAutoTagsForCurrentVideo()}
      onToggleAutoTag={toggleSelectedAutoTag}
      onConfirmAutoTags={confirmAutoTags}
      onApplyTagMergeSuggestion={applyTagMergeSuggestion}
      onKeepTagMergeSuggestion={keepTagMergeSuggestion}
      onCancelTagMergeSuggestion={() => setTagMergePrompt(null)}
      onPointerCancel={stopTagDialogDrag}
      onPointerDown={startTagDialogDrag}
      onPointerMove={moveTagDialogDrag}
      onPointerUp={stopTagDialogDrag}
    />
    <DanmakuDialog
      isOpen={isDanmakuDialogOpen}
      currentVideoName={currentVideo?.name ?? ""}
      currentDanmakuSource={currentDanmakuSource}
      danmakuSourceBreakdown={danmakuSourceBreakdown}
      danmakuSourceTotalCount={danmakuSourceTotalCount}
      isDanmakuSourceDetailOpen={isDanmakuSourceDetailOpen}
      danmakuManualUrl={danmakuManualUrl}
      danmakuPreferences={danmakuPreferences}
      isDanmakuLoading={isDanmakuLoading}
      danmakuMessage={danmakuMessage}
      onClose={() => setIsDanmakuDialogOpen(false)}
      onToggleSourceDetail={() => setIsDanmakuSourceDetailOpen((open) => !open)}
      onManualUrlChange={setDanmakuManualUrl}
      onFetchManualUrl={fetchDanmakuFromUrl}
      onRemoveMatch={removeDanmakuMatch}
      onReplacePreferences={replaceDanmakuPreferences}
    />

    <AiSubtitleDialog
      isOpen={isAiPanelOpen}
      selectedSubtitleName={selectedSubtitle?.name ?? ""}
      isAiConfigured={Boolean(localConfig?.ai.configured)}
      aiTab={aiTab}
      subtitleSummary={subtitleSummary}
      subtitleQuestion={subtitleQuestion}
      subtitleAnswer={subtitleAnswer}
      subtitleRecap={subtitleRecap}
      aiMessage={aiMessage}
      isAiLoading={isAiLoading}
      currentTime={currentTime}
      onClose={() => setIsAiPanelOpen(false)}
      onTabChange={setAiTab}
      onQuestionChange={setSubtitleQuestion}
      onLoadSummary={() => void loadSubtitleSummary()}
      onAskQuestion={() => void askSubtitleQuestion()}
      onLoadRecap={() => void loadProgressRecap()}
      formatTime={formatTime}
    />
    <ShortcutDialog
      isOpen={isShortcutDialogOpen}
      shortcutGroups={shortcutGroups}
      shortcuts={shortcuts}
      recordingShortcutAction={recordingShortcutAction}
      shortcutMessage={shortcutMessage}
      onClose={closeShortcutDialog}
      onStartRecording={startShortcutRecording}
      onCapture={handleShortcutCapture}
      onReset={resetShortcuts}
      formatShortcutKey={formatShortcutKey}
    />
    </>
  );
}

