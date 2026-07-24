import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { ActiveView, HomeMediaMode, PlayerPreferences, PlaylistFilter, VideoItem } from "./playerTypes";
import { inferSeriesTitle, scopedSeriesKeyForVideo } from "./playerSeriesUtils";
import { resolvePlayerEntrySeriesMode, type RatingPlaylistMode } from "./playerUiState";

type SelectVideoOptions = {
  syncSeriesMode?: boolean;
  keepDuplicatePlaylist?: boolean;
  keepVersionPlaylist?: boolean;
  keepRatingPlaylist?: boolean;
};

type UseVideoSelectionControllerOptions = {
  autoSubtitleSelectionVideoIdRef: MutableRefObject<string | null>;
  cancelAutoNextPrompt: () => void;
  focusPlayer: () => void;
  homeMediaMode: HomeMediaMode;
  isMainVideoLoadingRef: MutableRefObject<boolean>;
  pendingAutoPlayVideoIdRef: MutableRefObject<string | null>;
  persistCurrentProgress: () => void;
  playerPreferencesRef: MutableRefObject<PlayerPreferences>;
  replacePlayerPreferences: (nextPreferences: PlayerPreferences) => void;
  resetTimelinePreview: () => void;
  resetHoldSpeedState: () => void;
  seriesTitleByVideoId: Map<string, string>;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setCurrentVideoId: Dispatch<SetStateAction<string | null>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setIsDuplicatePlaylistActive: Dispatch<SetStateAction<boolean>>;
  setIsVersionPlaylistActive: Dispatch<SetStateAction<boolean>>;
  setIsMainVideoLoading: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsSeriesMenuOpen: Dispatch<SetStateAction<boolean>>;
  setPlaylistFilter: Dispatch<SetStateAction<PlaylistFilter>>;
  setPlaylistPage: Dispatch<SetStateAction<number>>;
  setRatingPlaylistMode: Dispatch<SetStateAction<RatingPlaylistMode | null>>;
  setVideoAspectRatio: Dispatch<SetStateAction<number>>;
  updateSelectedSubtitleId: (nextSubtitleId: string) => void;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useVideoSelectionController({
  autoSubtitleSelectionVideoIdRef,
  cancelAutoNextPrompt,
  focusPlayer,
  homeMediaMode,
  isMainVideoLoadingRef,
  pendingAutoPlayVideoIdRef,
  persistCurrentProgress,
  playerPreferencesRef,
  replacePlayerPreferences,
  resetTimelinePreview,
  resetHoldSpeedState,
  seriesTitleByVideoId,
  setActiveView,
  setCurrentTime,
  setCurrentVideoId,
  setDuration,
  setIsDuplicatePlaylistActive,
  setIsVersionPlaylistActive,
  setIsMainVideoLoading,
  setIsPlaying,
  setIsSeriesMenuOpen,
  setPlaylistFilter,
  setPlaylistPage,
  setRatingPlaylistMode,
  setVideoAspectRatio,
  updateSelectedSubtitleId,
  videosRef,
}: UseVideoSelectionControllerOptions) {
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
    [
      homeMediaMode,
      playerPreferencesRef,
      replacePlayerPreferences,
      seriesTitleByVideoId,
      setIsSeriesMenuOpen,
      setPlaylistFilter,
      setPlaylistPage,
      videosRef,
    ],
  );

  const selectVideo = useCallback(
    (videoId: string, options?: SelectVideoOptions) => {
      if (!videosRef.current.some((video) => video.id === videoId)) return;
      cancelAutoNextPrompt();
      persistCurrentProgress();
      resetHoldSpeedState();
      if (options?.syncSeriesMode !== false) syncSeriesModeForPlayerEntry(videoId);
      if (!options?.keepDuplicatePlaylist) {
        setPlaylistPage(1);
        setIsDuplicatePlaylistActive(false);
      }
      if (!options?.keepVersionPlaylist) {
        setPlaylistPage(1);
        setIsVersionPlaylistActive(false);
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
      resetTimelinePreview();
      updateSelectedSubtitleId("off");
      setVideoAspectRatio(16 / 9);
      focusPlayer();
    },
    [
      autoSubtitleSelectionVideoIdRef,
      cancelAutoNextPrompt,
      focusPlayer,
      isMainVideoLoadingRef,
      pendingAutoPlayVideoIdRef,
      persistCurrentProgress,
      resetTimelinePreview,
      resetHoldSpeedState,
      setActiveView,
      setCurrentTime,
      setCurrentVideoId,
      setDuration,
      setIsDuplicatePlaylistActive,
      setIsVersionPlaylistActive,
      setIsMainVideoLoading,
      setIsPlaying,
      setPlaylistPage,
      setRatingPlaylistMode,
      setVideoAspectRatio,
      syncSeriesModeForPlayerEntry,
      updateSelectedSubtitleId,
    ],
  );

  return { selectVideo };
}
