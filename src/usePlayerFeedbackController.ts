import { useCallback, useEffect, useRef, useState } from "react";

import { doubleClickFeedbackDelay } from "./playerConstants";

type DoubleClickFeedback = {
  side: "left" | "center" | "right";
  text: string;
};

export function usePlayerFeedbackController() {
  const doubleClickFeedbackTimerRef = useRef<number | null>(null);
  const playerOverlayFeedbackTimerRef = useRef<number | null>(null);
  const [doubleClickFeedback, setDoubleClickFeedback] = useState<DoubleClickFeedback | null>(null);
  const [playerOverlayFeedback, setPlayerOverlayFeedback] = useState("");

  const showDoubleClickFeedback = useCallback((side: DoubleClickFeedback["side"], text: string) => {
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

  useEffect(() => {
    return () => {
      if (doubleClickFeedbackTimerRef.current) {
        window.clearTimeout(doubleClickFeedbackTimerRef.current);
      }
      if (playerOverlayFeedbackTimerRef.current) {
        window.clearTimeout(playerOverlayFeedbackTimerRef.current);
      }
    };
  }, []);

  return {
    doubleClickFeedback,
    playerOverlayFeedback,
    showDoubleClickFeedback,
    showPlayerOverlayFeedback,
  };
}
