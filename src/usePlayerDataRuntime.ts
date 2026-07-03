import { useCallback, useRef } from "react";

import { defaultDanmakuPreferences, defaultPlayerPreferences, defaultPlayerSettings } from "./playerConstants";
import { saveGlobalPlayerDataStore } from "./playerStorage";
import type {
  DanmakuPreferences,
  DanmakuSelectionStore,
  FileSystemDirectoryHandle,
  PlayerDataStore,
  PlayerPersistentSettings,
  PlayerPreferences,
  ProgressStore,
  SubtitleItem,
  TagMergeDecisionStore,
  VideoCommentStore,
  VideoHighlightStore,
  VideoItem,
  VideoRatingStore,
  VideoStatsStore,
  VideoTagStore,
  WatchActivityStore,
} from "./playerTypes";
import { createPersistedEmbeddedSubtitles } from "./playerUiState";

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
  const videoStatsRef = useRef<VideoStatsStore>({});
  const watchActivityRef = useRef<WatchActivityStore>({});
  const videoHighlightsRef = useRef<VideoHighlightStore>({});
  const tagMergeDecisionsRef = useRef<TagMergeDecisionStore>({});
  const videosRef = useRef<VideoItem[]>([]);
  const subtitlesRef = useRef<SubtitleItem[]>([]);
  const danmakuSelectionsRef = useRef<DanmakuSelectionStore>({});
  const danmakuPreferencesRef = useRef<DanmakuPreferences>(defaultDanmakuPreferences);
  const duplicateDetectionResultsByModeRef = useRef<PlayerDataStore["duplicateDetections"]>({});

  const buildPlayerDataStore = useCallback(
    (overrides?: Partial<PlayerDataStore>): PlayerDataStore => ({
      version: 5,
      progress: progressStoreRef.current,
      favorites: Array.from(favoriteVideoIdsRef.current),
      videoRatings: videoRatingsRef.current,
      videoComments: videoCommentsRef.current,
      videoTags: videoTagsRef.current,
      videoStats: videoStatsRef.current,
      watchActivity: watchActivityRef.current,
      videoHighlights: videoHighlightsRef.current,
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
        .then(() => saveGlobalPlayerDataStore(buildPlayerDataStore(overrides)));
      playerDataSaveQueueRef.current = saveOperation.catch(() => undefined);
      await saveOperation;
    },
    [buildPlayerDataStore],
  );

  return {
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
  };
}
