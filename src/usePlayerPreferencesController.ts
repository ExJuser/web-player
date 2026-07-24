import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AppTheme } from "./appBrowserUtils";
import type { HomeMediaMode, PlaybackMode, PlayerPersistentSettings, PlayerPreferences, PlaylistSortMode, ShortcutMap, VideoItem } from "./playerTypes";
import { savePlayerPreference, savePlayerSetting } from "./playerStorage";

type UsePlayerPreferencesControllerOptions = {
  activateDuplicateDetectionForMode: (mode: HomeMediaMode, videos: VideoItem[]) => void;
  duplicateDetectionAbortRef: MutableRefObject<AbortController | null>;
  duplicateDetectionRunIdRef: MutableRefObject<number>;
  focusPlayer: () => void;
  playerPreferencesRef: MutableRefObject<PlayerPreferences>;
  playerSettingsRef: MutableRefObject<PlayerPersistentSettings>;
  setHomeMediaMode: Dispatch<SetStateAction<HomeMediaMode>>;
  setHoldPlaybackRate: Dispatch<SetStateAction<number>>;
  setIsCinemaMode: Dispatch<SetStateAction<boolean>>;
  setIsDuplicateDetectionRunning: Dispatch<SetStateAction<boolean>>;
  setIsPlaylistSortReversed: Dispatch<SetStateAction<boolean>>;
  setIsSeriesMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsSeriesMode: Dispatch<SetStateAction<boolean>>;
  setMessage: (message: string) => void;
  setPlaylistPage: Dispatch<SetStateAction<number>>;
  setPlaylistPageSize: Dispatch<SetStateAction<number>>;
  setPlaylistSortMode: Dispatch<SetStateAction<PlaylistSortMode>>;
  setPlaybackMode: Dispatch<SetStateAction<PlaybackMode>>;
  setSeekStep: Dispatch<SetStateAction<number>>;
  setSelectedSeriesKey: Dispatch<SetStateAction<string>>;
  setShortcuts: Dispatch<SetStateAction<ShortcutMap>>;
  setStartFromHighEnergy: Dispatch<SetStateAction<boolean>>;
  setSubtitleStyle: Dispatch<SetStateAction<PlayerPreferences["subtitleStyle"]>>;
  setTheme: Dispatch<SetStateAction<AppTheme>>;
  theme: AppTheme;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function usePlayerPreferencesController({
  activateDuplicateDetectionForMode,
  duplicateDetectionAbortRef,
  duplicateDetectionRunIdRef,
  focusPlayer,
  playerPreferencesRef,
  playerSettingsRef,
  setHomeMediaMode,
  setHoldPlaybackRate,
  setIsCinemaMode,
  setIsDuplicateDetectionRunning,
  setIsPlaylistSortReversed,
  setIsSeriesMenuOpen,
  setIsSeriesMode,
  setMessage,
  setPlaylistPage,
  setPlaylistPageSize,
  setPlaylistSortMode,
  setPlaybackMode,
  setSeekStep,
  setSelectedSeriesKey,
  setShortcuts,
  setStartFromHighEnergy,
  setSubtitleStyle,
  setTheme,
  theme,
  videosRef,
}: UsePlayerPreferencesControllerOptions) {
  const replacePlayerPreferences = useCallback((nextPreferences: PlayerPreferences) => {
    playerPreferencesRef.current = nextPreferences;
    setPlaylistSortMode(nextPreferences.playlistSortMode);
    setIsPlaylistSortReversed(nextPreferences.isPlaylistSortReversed);
    setPlaylistPageSize(nextPreferences.playlistPageSize);
    setPlaybackMode(nextPreferences.playbackMode);
    setSeekStep(nextPreferences.seekStep);
    setHoldPlaybackRate(nextPreferences.holdPlaybackRate);
    setShortcuts(nextPreferences.shortcuts);
    setHomeMediaMode(nextPreferences.homeMediaMode);
    setIsSeriesMode(nextPreferences.isSeriesMode);
    setSelectedSeriesKey(nextPreferences.selectedSeriesKey);
    setIsCinemaMode(nextPreferences.isCinemaMode);
    setStartFromHighEnergy(nextPreferences.startFromHighEnergy);
    setSubtitleStyle(nextPreferences.subtitleStyle);

    Promise.all(
      (Object.keys(nextPreferences) as Array<keyof PlayerPreferences>).map((key) =>
        savePlayerPreference(key, nextPreferences[key]),
      ),
    ).catch(() => {
      setMessage("无法写入项目数据目录，请确认通过 npm run dev 或 npm run preview 启动。");
    });
  }, [
    playerPreferencesRef,
    setHomeMediaMode,
    setHoldPlaybackRate,
    setIsCinemaMode,
    setIsPlaylistSortReversed,
    setIsSeriesMode,
    setMessage,
    setPlaylistPageSize,
    setPlaylistSortMode,
    setPlaybackMode,
    setSeekStep,
    setSelectedSeriesKey,
    setShortcuts,
    setStartFromHighEnergy,
    setSubtitleStyle,
  ]);

  const updatePlaylistSortMode = useCallback((nextMode: PlaylistSortMode) => {
    setPlaylistPage(1);
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      playlistSortMode: nextMode,
    });
  }, [playerPreferencesRef, replacePlayerPreferences, setPlaylistPage]);

  const togglePlaylistSortDirection = useCallback(() => {
    setPlaylistPage(1);
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isPlaylistSortReversed: !playerPreferencesRef.current.isPlaylistSortReversed,
    });
  }, [playerPreferencesRef, replacePlayerPreferences, setPlaylistPage]);

  const updatePlaylistPageSize = useCallback((nextPageSize: number) => {
    setPlaylistPage(1);
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      playlistPageSize: nextPageSize,
    });
  }, [playerPreferencesRef, replacePlayerPreferences, setPlaylistPage]);

  const updatePlaybackMode = useCallback((nextMode: PlaybackMode) => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      playbackMode: nextMode,
    });
  }, [playerPreferencesRef, replacePlayerPreferences]);

  const updateSeekStep = useCallback((nextStep: number) => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      seekStep: nextStep,
    });
  }, [playerPreferencesRef, replacePlayerPreferences]);

  const updateHoldPlaybackRate = useCallback((nextRate: number) => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      holdPlaybackRate: nextRate,
    });
  }, [playerPreferencesRef, replacePlayerPreferences]);

  const updateHomeMediaMode = useCallback((nextMode: HomeMediaMode) => {
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
  }, [
    activateDuplicateDetectionForMode,
    duplicateDetectionAbortRef,
    duplicateDetectionRunIdRef,
    playerPreferencesRef,
    replacePlayerPreferences,
    setIsDuplicateDetectionRunning,
    setPlaylistPage,
    videosRef,
  ]);

  const toggleStartFromHighEnergy = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      startFromHighEnergy: !playerPreferencesRef.current.startFromHighEnergy,
    });
  }, [playerPreferencesRef, replacePlayerPreferences]);

  const updateSelectedSeries = useCallback((nextSeriesKey: string) => {
    setPlaylistPage(1);
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      selectedSeriesKey: nextSeriesKey,
    });
    setIsSeriesMenuOpen(false);
  }, [playerPreferencesRef, replacePlayerPreferences, setIsSeriesMenuOpen, setPlaylistPage]);

  const toggleCinemaMode = useCallback(() => {
    replacePlayerPreferences({
      ...playerPreferencesRef.current,
      isCinemaMode: !playerPreferencesRef.current.isCinemaMode,
    });
    focusPlayer();
  }, [focusPlayer, playerPreferencesRef, replacePlayerPreferences]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      theme,
    };
    savePlayerSetting("theme", theme).catch(() => undefined);
  }, [playerSettingsRef, theme]);

  return {
    replacePlayerPreferences,
    toggleCinemaMode,
    togglePlaylistSortDirection,
    toggleStartFromHighEnergy,
    toggleTheme,
    updateHomeMediaMode,
    updateHoldPlaybackRate,
    updatePlaybackMode,
    updatePlaylistPageSize,
    updatePlaylistSortMode,
    updateSeekStep,
    updateSelectedSeries,
  };
}
