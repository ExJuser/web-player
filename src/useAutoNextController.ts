import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { autoNextPromptSeconds } from "./playerConstants";
import { getNextVideoIdForQueue } from "./playerPlaybackQueue";
import type { AutoNextPrompt, PlaybackMode, VideoItem } from "./playerTypes";

type UseAutoNextControllerOptions = {
  currentVideoId: string | null;
  isFavoriteQueue: boolean;
  playbackMode: PlaybackMode;
  playbackQueueVideos: VideoItem[];
  selectVideoRef: MutableRefObject<(videoId: string) => void>;
  setMessage: (message: string) => void;
  videosRef: MutableRefObject<VideoItem[]>;
};

export function useAutoNextController({
  currentVideoId,
  isFavoriteQueue,
  playbackMode,
  playbackQueueVideos,
  selectVideoRef,
  setMessage,
  videosRef,
}: UseAutoNextControllerOptions) {
  const autoNextTimerRef = useRef<number | null>(null);
  const autoNextSnapshotRef = useRef<{
    currentVideoId: string | null;
    nextVideoId: string;
    playbackMode: PlaybackMode;
    queueKey: string;
  } | null>(null);
  const [autoNextPrompt, setAutoNextPrompt] = useState<AutoNextPrompt | null>(null);
  const queueKey = useMemo(() => playbackQueueVideos.map((video) => video.id).join("\n"), [playbackQueueVideos]);
  const latestQueueContextRef = useRef({ currentVideoId, playbackMode, queueKey });
  latestQueueContextRef.current = { currentVideoId, playbackMode, queueKey };

  const cancelAutoNextPrompt = useCallback(() => {
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    autoNextSnapshotRef.current = null;
    setAutoNextPrompt(null);
  }, []);

  const getNextVideoId = useCallback(
    (mode: PlaybackMode) => getNextVideoIdForQueue(playbackQueueVideos, currentVideoId, mode),
    [currentVideoId, playbackQueueVideos],
  );

  const playNext = useCallback(() => {
    const nextVideoId = getNextVideoId(playbackMode);
    if (!nextVideoId) {
      if (isFavoriteQueue && !playbackQueueVideos.length) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    selectVideoRef.current(nextVideoId);
  }, [getNextVideoId, isFavoriteQueue, playbackMode, playbackQueueVideos.length, selectVideoRef, setMessage]);

  const canPlayNext = useMemo(() => Boolean(getNextVideoId(playbackMode)), [getNextVideoId, playbackMode]);

  const confirmAutoNext = useCallback(
    (nextVideoId: string) => {
      const snapshot = autoNextSnapshotRef.current;
      const latestContext = latestQueueContextRef.current;
      const isTargetCurrent = Boolean(
        snapshot &&
        snapshot.nextVideoId === nextVideoId &&
        snapshot.currentVideoId === latestContext.currentVideoId &&
        snapshot.playbackMode === latestContext.playbackMode &&
        snapshot.queueKey === latestContext.queueKey &&
        videosRef.current.some((video) => video.id === nextVideoId),
      );
      cancelAutoNextPrompt();
      if (!isTargetCurrent) {
        setMessage("播放队列已变化，已取消自动播放下一集。");
        return;
      }
      selectVideoRef.current(nextVideoId);
    },
    [cancelAutoNextPrompt, selectVideoRef, setMessage, videosRef],
  );

  const startAutoNextPrompt = useCallback(
    (nextVideoId: string) => {
      const nextVideo = videosRef.current.find((video) => video.id === nextVideoId);
      cancelAutoNextPrompt();
      autoNextSnapshotRef.current = { currentVideoId, nextVideoId, playbackMode, queueKey };
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
    [cancelAutoNextPrompt, confirmAutoNext, currentVideoId, playbackMode, queueKey, videosRef],
  );

  useEffect(() => {
    cancelAutoNextPrompt();
  }, [cancelAutoNextPrompt, currentVideoId, playbackMode, queueKey]);

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
