import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AppTheme } from "./appBrowserUtils";
import { defaultDanmakuPreferences, defaultPlayerPreferences, defaultPlayerSettings } from "./playerConstants";
import { patchGlobalPlayerDataStore } from "./playerStorage";
import type {
  ActorProfileStore,
  ActorTagDefinitionStore,
  DanmakuPreferences,
  DanmakuSelectionStore,
  FileSystemDirectoryHandle,
  PlayerDataStore,
  PlaybackMode,
  PlayerPersistentSettings,
  PlayerPreferences,
  PlaylistSortMode,
  ProgressStore,
  ShortcutMap,
  SubtitleItem,
  TagMergeDecisionStore,
  VideoCommentStore,
  VideoEditSegmentStore,
  VideoHighlightStore,
  VideoItem,
  VideoActorOverrideStore,
  VideoRatingStore,
  VideoStatsStore,
  VideoTagStore,
  WatchActivityStore,
} from "./playerTypes";
import { createPersistedEmbeddedSubtitles, type HomeMediaMode } from "./playerUiState";

export function usePlayerDataRuntime(initialVolume: number) {
  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const libraryIdRef = useRef<string | null>(null);
  const libraryMetadataRef = useRef<PlayerDataStore["metadata"] | undefined>(undefined);
  const progressStoreRef = useRef<ProgressStore>({});
  const playerDataSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const playerPreferencesRef = useRef<PlayerPreferences>(defaultPlayerPreferences);
  const playerSettingsRef = useRef<PlayerPersistentSettings>({
    ...defaultPlayerSettings,
    volume: initialVolume,
  });
  const hasLoadedPlayerDataStoreRef = useRef(false);
  const favoriteVideoIdsRef = useRef(new Set<string>());
  const videoRatingsRef = useRef<VideoRatingStore>({});
  const videoCommentsRef = useRef<VideoCommentStore>({});
  const videoTagsRef = useRef<VideoTagStore>({});
  const actorProfilesRef = useRef<ActorProfileStore>({});
  const actorTagDefinitionsRef = useRef<ActorTagDefinitionStore>({});
  const videoActorOverridesRef = useRef<VideoActorOverrideStore>({});
  const videoStatsRef = useRef<VideoStatsStore>({});
  const watchActivityRef = useRef<WatchActivityStore>({});
  const videoHighlightsRef = useRef<VideoHighlightStore>({});
  const videoEditSegmentsRef = useRef<VideoEditSegmentStore>({});
  const tagMergeDecisionsRef = useRef<TagMergeDecisionStore>({});
  const videosRef = useRef<VideoItem[]>([]);
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const danmakuSelectionsRef = useRef<DanmakuSelectionStore>({});
  const danmakuPreferencesRef = useRef<DanmakuPreferences>(defaultDanmakuPreferences);
  const duplicateDetectionResultsByModeRef = useRef<PlayerDataStore["duplicateDetections"]>({});

  const buildPlayerDataStore = useCallback(
    (overrides?: Partial<PlayerDataStore>): PlayerDataStore => ({
      version: 6,
      progress: progressStoreRef.current,
      favorites: Array.from(favoriteVideoIdsRef.current),
      videoRatings: videoRatingsRef.current,
      videoComments: videoCommentsRef.current,
      videoTags: videoTagsRef.current,
      actorProfiles: actorProfilesRef.current,
      actorTagDefinitions: actorTagDefinitionsRef.current,
      videoActorOverrides: videoActorOverridesRef.current,
      videoStats: videoStatsRef.current,
      watchActivity: watchActivityRef.current,
      videoHighlights: videoHighlightsRef.current,
      videoEditSegments: videoEditSegmentsRef.current,
      tagMergeDecisions: tagMergeDecisionsRef.current,
      embeddedSubtitles: createPersistedEmbeddedSubtitles(subtitlesRef.current),
      danmakuSelections: danmakuSelectionsRef.current,
      danmakuPreferences: danmakuPreferencesRef.current,
      preferences: playerPreferencesRef.current,
      settings: playerSettingsRef.current,
      duplicateDetection: null,
      duplicateDetections: duplicateDetectionResultsByModeRef.current,
      metadata: libraryMetadataRef.current,
      ...overrides,
    }),
    [],
  );

  const saveCurrentPlayerDataStore = useCallback(
    async (overrides?: Partial<PlayerDataStore>) => {
      const saveOperation = playerDataSaveQueueRef.current
        .catch(() => undefined)
        .then(() => patchGlobalPlayerDataStore(overrides ?? buildPlayerDataStore()));
      playerDataSaveQueueRef.current = saveOperation.catch(() => undefined);
      await saveOperation;
    },
    [buildPlayerDataStore],
  );

  return {
    actorProfilesRef,
    actorTagDefinitionsRef,
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
    videoEditSegmentsRef,
    videoRatingsRef,
    videosRef,
    videoStatsRef,
    videoTagsRef,
    videoActorOverridesRef,
    watchActivityRef,
  };
}

type UseApplyPlayerDataStoreOptions = {
  actorProfilesRef: MutableRefObject<ActorProfileStore>;
  actorTagDefinitionsRef: MutableRefObject<ActorTagDefinitionStore>;
  activateDuplicateDetectionForMode: (
    mode: HomeMediaMode,
    videos: VideoItem[],
    resultsByMode: PlayerDataStore["duplicateDetections"],
  ) => void;
  danmakuPreferencesRef: MutableRefObject<DanmakuPreferences>;
  danmakuSelectionsRef: MutableRefObject<DanmakuSelectionStore>;
  duplicateDetectionResultsByModeRef: MutableRefObject<PlayerDataStore["duplicateDetections"]>;
  favoriteVideoIdsRef: MutableRefObject<Set<string>>;
  hasLoadedPlayerDataStoreRef: MutableRefObject<boolean>;
  libraryMetadataRef: MutableRefObject<PlayerDataStore["metadata"] | undefined>;
  playerPreferencesRef: MutableRefObject<PlayerPreferences>;
  playerSettingsRef: MutableRefObject<PlayerPersistentSettings>;
  progressStoreRef: MutableRefObject<ProgressStore>;
  setDanmakuPreferences: Dispatch<SetStateAction<DanmakuPreferences>>;
  setActorProfiles: Dispatch<SetStateAction<ActorProfileStore>>;
  setActorTagDefinitions: Dispatch<SetStateAction<ActorTagDefinitionStore>>;
  setDanmakuSelections: Dispatch<SetStateAction<DanmakuSelectionStore>>;
  setFavoriteVideoIds: Dispatch<SetStateAction<Set<string>>>;
  setHomeMediaMode: Dispatch<SetStateAction<HomeMediaMode>>;
  setHoldPlaybackRate: Dispatch<SetStateAction<number>>;
  setIsCinemaMode: Dispatch<SetStateAction<boolean>>;
  setIsPlaylistSortReversed: Dispatch<SetStateAction<boolean>>;
  setIsSeriesMode: Dispatch<SetStateAction<boolean>>;
  setPlaylistPage: Dispatch<SetStateAction<number>>;
  setPlaylistPageSize: Dispatch<SetStateAction<number>>;
  setPlaylistSortMode: Dispatch<SetStateAction<PlaylistSortMode>>;
  setPlaybackMode: Dispatch<SetStateAction<PlaybackMode>>;
  setProgressStore: Dispatch<SetStateAction<ProgressStore>>;
  setSelectedSeriesKey: Dispatch<SetStateAction<string>>;
  setSeekStep: Dispatch<SetStateAction<number>>;
  setShortcuts: Dispatch<SetStateAction<ShortcutMap>>;
  setSkipFolderAccessPrompt: Dispatch<SetStateAction<boolean>>;
  setStartFromHighEnergy: Dispatch<SetStateAction<boolean>>;
  setSubtitleStyle: Dispatch<SetStateAction<PlayerPreferences["subtitleStyle"]>>;
  setTagMergeDecisions: Dispatch<SetStateAction<TagMergeDecisionStore>>;
  setTheme: Dispatch<SetStateAction<AppTheme>>;
  setVideoComments: Dispatch<SetStateAction<VideoCommentStore>>;
  setVideoEditSegments: Dispatch<SetStateAction<VideoEditSegmentStore>>;
  setVideoHighlights: Dispatch<SetStateAction<VideoHighlightStore>>;
  setVideoRatings: Dispatch<SetStateAction<VideoRatingStore>>;
  setVideoTags: Dispatch<SetStateAction<VideoTagStore>>;
  setVideoActorOverrides: Dispatch<SetStateAction<VideoActorOverrideStore>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setWatchActivityRevision: Dispatch<SetStateAction<number>>;
  tagMergeDecisionsRef: MutableRefObject<TagMergeDecisionStore>;
  videoCommentsRef: MutableRefObject<VideoCommentStore>;
  videoEditSegmentsRef: MutableRefObject<VideoEditSegmentStore>;
  videoHighlightsRef: MutableRefObject<VideoHighlightStore>;
  videoRatingsRef: MutableRefObject<VideoRatingStore>;
  videosRef: MutableRefObject<VideoItem[]>;
  videoStatsRef: MutableRefObject<VideoStatsStore>;
  videoTagsRef: MutableRefObject<VideoTagStore>;
  videoActorOverridesRef: MutableRefObject<VideoActorOverrideStore>;
  watchActivityRef: MutableRefObject<WatchActivityStore>;
};

export function useApplyPlayerDataStore({
  actorProfilesRef,
  actorTagDefinitionsRef,
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
  setActorProfiles,
  setActorTagDefinitions,
  setDanmakuSelections,
  setFavoriteVideoIds,
  setHomeMediaMode,
  setHoldPlaybackRate,
  setIsCinemaMode,
  setIsPlaylistSortReversed,
  setIsSeriesMode,
  setPlaylistPage,
  setPlaylistPageSize,
  setPlaylistSortMode,
  setPlaybackMode,
  setProgressStore,
  setSelectedSeriesKey,
  setSeekStep,
  setShortcuts,
  setSkipFolderAccessPrompt,
  setStartFromHighEnergy,
  setSubtitleStyle,
  setTagMergeDecisions,
  setTheme,
  setVideoComments,
  setVideoEditSegments,
  setVideoHighlights,
  setVideoRatings,
  setVideoTags,
  setVideoActorOverrides,
  setVolume,
  setWatchActivityRevision,
  tagMergeDecisionsRef,
  videoCommentsRef,
  videoEditSegmentsRef,
  videoHighlightsRef,
  videoRatingsRef,
  videosRef,
  videoStatsRef,
  videoTagsRef,
  videoActorOverridesRef,
  watchActivityRef,
}: UseApplyPlayerDataStoreOptions) {
  return useCallback((nextDataStore: PlayerDataStore) => {
    hasLoadedPlayerDataStoreRef.current = true;
    progressStoreRef.current = nextDataStore.progress;
    playerPreferencesRef.current = nextDataStore.preferences;
    playerSettingsRef.current = nextDataStore.settings;
    favoriteVideoIdsRef.current = new Set(nextDataStore.favorites);
    videoRatingsRef.current = nextDataStore.videoRatings;
    videoCommentsRef.current = nextDataStore.videoComments;
    videoTagsRef.current = nextDataStore.videoTags;
    actorProfilesRef.current = nextDataStore.actorProfiles;
    actorTagDefinitionsRef.current = nextDataStore.actorTagDefinitions;
    videoActorOverridesRef.current = nextDataStore.videoActorOverrides;
    videoStatsRef.current = nextDataStore.videoStats;
    watchActivityRef.current = nextDataStore.watchActivity;
    videoHighlightsRef.current = nextDataStore.videoHighlights;
    videoEditSegmentsRef.current = nextDataStore.videoEditSegments;
    tagMergeDecisionsRef.current = nextDataStore.tagMergeDecisions;
    danmakuSelectionsRef.current = nextDataStore.danmakuSelections;
    danmakuPreferencesRef.current = nextDataStore.danmakuPreferences;
    libraryMetadataRef.current = nextDataStore.metadata;
    duplicateDetectionResultsByModeRef.current = nextDataStore.duplicateDetections ?? {};
    setProgressStore(nextDataStore.progress);
    setPlaylistSortMode(nextDataStore.preferences.playlistSortMode);
    setIsPlaylistSortReversed(nextDataStore.preferences.isPlaylistSortReversed);
    setPlaylistPageSize(nextDataStore.preferences.playlistPageSize);
    setPlaybackMode(nextDataStore.preferences.playbackMode);
    setSeekStep(nextDataStore.preferences.seekStep);
    setHoldPlaybackRate(nextDataStore.preferences.holdPlaybackRate);
    setPlaylistPage(1);
    setShortcuts(nextDataStore.preferences.shortcuts);
    setHomeMediaMode(nextDataStore.preferences.homeMediaMode);
    setIsSeriesMode(nextDataStore.preferences.isSeriesMode);
    setSelectedSeriesKey(nextDataStore.preferences.selectedSeriesKey);
    setIsCinemaMode(nextDataStore.preferences.isCinemaMode);
    setStartFromHighEnergy(nextDataStore.preferences.startFromHighEnergy);
    setSubtitleStyle(nextDataStore.preferences.subtitleStyle);
    setVolume(nextDataStore.settings.volume);
    if (nextDataStore.settings.theme === "dark" || nextDataStore.settings.theme === "light") {
      setTheme(nextDataStore.settings.theme);
    }
    setSkipFolderAccessPrompt(nextDataStore.settings.skipFolderAccessPrompt);
    setFavoriteVideoIds(new Set(nextDataStore.favorites));
    setVideoRatings(nextDataStore.videoRatings);
    setVideoComments(nextDataStore.videoComments);
    setVideoTags(nextDataStore.videoTags);
    setActorProfiles(nextDataStore.actorProfiles);
    setActorTagDefinitions(nextDataStore.actorTagDefinitions);
    setVideoActorOverrides(nextDataStore.videoActorOverrides);
    setVideoHighlights(nextDataStore.videoHighlights);
    setVideoEditSegments(nextDataStore.videoEditSegments);
    setWatchActivityRevision((revision) => revision + 1);
    setTagMergeDecisions(nextDataStore.tagMergeDecisions);
    setDanmakuSelections(nextDataStore.danmakuSelections);
    setDanmakuPreferences(nextDataStore.danmakuPreferences);
    activateDuplicateDetectionForMode(nextDataStore.preferences.homeMediaMode, videosRef.current, nextDataStore.duplicateDetections);
  }, [
    actorProfilesRef,
    actorTagDefinitionsRef,
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
    setActorProfiles,
    setActorTagDefinitions,
    setDanmakuSelections,
    setFavoriteVideoIds,
    setHomeMediaMode,
    setHoldPlaybackRate,
    setIsCinemaMode,
    setIsPlaylistSortReversed,
    setIsSeriesMode,
    setPlaylistPage,
    setPlaylistPageSize,
    setPlaylistSortMode,
    setPlaybackMode,
    setProgressStore,
    setSelectedSeriesKey,
    setSeekStep,
    setShortcuts,
    setSkipFolderAccessPrompt,
    setStartFromHighEnergy,
    setSubtitleStyle,
    setTagMergeDecisions,
    setTheme,
    setVideoComments,
    setVideoEditSegments,
    setVideoHighlights,
    setVideoRatings,
    setVideoTags,
    setVideoActorOverrides,
    setVolume,
    setWatchActivityRevision,
    tagMergeDecisionsRef,
    videoCommentsRef,
    videoEditSegmentsRef,
    videoHighlightsRef,
    videoRatingsRef,
    videosRef,
    videoStatsRef,
    videoTagsRef,
    videoActorOverridesRef,
    watchActivityRef,
  ]);
}
