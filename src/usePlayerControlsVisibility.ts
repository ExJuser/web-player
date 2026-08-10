import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { controlsAutoHideDelay } from "./playerConstants";
import type { VideoItem } from "./playerTypes";

type UsePlayerControlsVisibilityOptions = {
  currentVideo: VideoItem | null;
  isCinemaMode: boolean;
  isFullscreen: boolean;
  isPlaying: boolean;
};

export function usePlayerControlsVisibility({
  currentVideo,
  isCinemaMode,
  isFullscreen,
  isPlaying,
}: UsePlayerControlsVisibilityOptions) {
  const controlsHideTimerRef = useRef<number | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const shouldAutoHideControls = useMemo(
    () => isPlaying && Boolean(currentVideo),
    [currentVideo, isCinemaMode, isFullscreen, isPlaying],
  );

  const clearControlsHideTimer = useCallback(() => {
    if (!controlsHideTimerRef.current) return;
    window.clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
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

  const keepControlsVisible = useCallback(() => {
    setAreControlsVisible(true);
    clearControlsHideTimer();
  }, [clearControlsHideTimer]);

  const showControls = useCallback(() => {
    setAreControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (!shouldAutoHideControls) {
      setAreControlsVisible(true);
      clearControlsHideTimer();
      return;
    }

    scheduleControlsHide();
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, scheduleControlsHide, shouldAutoHideControls]);

  return {
    areControlsVisible,
    keepControlsVisible,
    revealControls,
    scheduleControlsHide,
    showControls,
  };
}
