import { useCallback, useEffect, useRef, useState } from "react";

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
}: UsePlayerControlsVisibilityOptions) {
  const controlsHideTimerRef = useRef<number | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const shouldAutoHideControls = Boolean(currentVideo);

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

  const hideControls = useCallback(() => {
    setAreControlsVisible(false);
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
    hideControls,
    keepControlsVisible,
    revealControls,
    scheduleControlsHide,
    showControls,
  };
}
