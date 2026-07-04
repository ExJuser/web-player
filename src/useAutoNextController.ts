import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { autoNextPromptSeconds } from "./playerConstants";
import type { AutoNextPrompt, PlaybackMode, PlaylistFilter, VideoItem } from "./playerTypes";

type UseAutoNextControllerOptions = {
  currentVideoId: string | null;
  favoritePlaylistVideos: VideoItem[];
  playbackMode: PlaybackMode;
  playlistFilter: PlaylistFilter;
  selectVideoRef: MutableRefObject<(videoId: string) => void>;
  seriesFilteredVideos: VideoItem[];
  setMessage: (message: string) => void;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useAutoNextController({
  currentVideoId,
  favoritePlaylistVideos,
  playbackMode,
  playlistFilter,
  selectVideoRef,
  seriesFilteredVideos,
  setMessage,
  videosRef,
}: UseAutoNextControllerOptions) {
  const autoNextTimerRef = useRef<number | null>(null);
  const [autoNextPrompt, setAutoNextPrompt] = useState<AutoNextPrompt | null>(null);

  const cancelAutoNextPrompt = useCallback(() => {
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setAutoNextPrompt(null);
  }, []);

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
    selectVideoRef.current(nextVideoId);
  }, [favoritePlaylistVideos.length, getNextVideoId, playbackMode, playlistFilter, selectVideoRef, setMessage]);

  const canPlayNext = useMemo(() => Boolean(getNextVideoId(playbackMode)), [getNextVideoId, playbackMode]);

  const confirmAutoNext = useCallback(
    (nextVideoId: string) => {
      cancelAutoNextPrompt();
      selectVideoRef.current(nextVideoId);
    },
    [cancelAutoNextPrompt, selectVideoRef],
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
    [cancelAutoNextPrompt, confirmAutoNext, videosRef],
  );

  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) {
        window.clearTimeout(autoNextTimerRef.current);
      }
    };
  }, []);

  return {
    autoNextPrompt,
    canPlayNext,
    cancelAutoNextPrompt,
    confirmAutoNext,
    getNextVideoId,
    playNext,
    startAutoNextPrompt,
  };
}
