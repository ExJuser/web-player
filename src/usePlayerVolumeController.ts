import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { clamp } from "./playerInteractionUtils";
import { savePlayerSetting } from "./playerStorage";
import type { PlayerPersistentSettings } from "./playerTypes";

type UsePlayerVolumeControllerOptions = {
  currentVideoId: string | null;
  hasLoadedPlayerDataStoreRef: MutableRefObject<boolean>;
  initialVolume: number;
  isCinemaMode: boolean;
  playerSettingsRef: MutableRefObject<PlayerPersistentSettings>;
  showPlayerOverlayFeedback: (message: string) => void;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
};

export function usePlayerVolumeController({
  currentVideoId,
  hasLoadedPlayerDataStoreRef,
  initialVolume,
  isCinemaMode,
  playerSettingsRef,
  showPlayerOverlayFeedback,
  videoRef,
}: UsePlayerVolumeControllerOptions) {
  const initialVolumeRef = useRef(initialVolume);
  const [volume, setVolume] = useState(initialVolumeRef.current);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.volume = volume;
    element.muted = isMuted;
  }, [currentVideoId, isMuted, videoRef, volume]);

  useEffect(() => {
    playerSettingsRef.current = {
      ...playerSettingsRef.current,
      volume,
    };
    if (!hasLoadedPlayerDataStoreRef.current) return;
    savePlayerSetting("volume", volume).catch(() => undefined);
  }, [hasLoadedPlayerDataStoreRef, playerSettingsRef, volume]);

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
    if (!currentVideoId) return;
    setIsMuted((muted) => !muted);
  }, [currentVideoId]);

  return {
    adjustVolume,
    changeVolume,
    isMuted,
    setVolume,
    toggleMute,
    volume,
  };
}
