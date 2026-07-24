import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { autoNextPromptSeconds } from "./playerConstants";
import { getNextVideoIdForQueue, getPreviousVideoIdForQueue, pickShuffleVideoId } from "./playerPlaybackQueue";
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

type ShuffleHistory = { ids: string[]; index: number };
type PendingNextNavigation = {
  currentVideoId: string | null;
  historyIndex: number | null;
  playbackMode: PlaybackMode;
  queueKey: string;
  videoId: string;
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
  const pendingNextNavigationRef = useRef<PendingNextNavigation | null>(null);
  const shuffleHistoryRef = useRef<ShuffleHistory>({ ids: [], index: -1 });
  const shuffleRemainingIdsRef = useRef<string[]>([]);
  const [autoNextPrompt, setAutoNextPrompt] = useState<AutoNextPrompt | null>(null);
  const [shuffleHistoryRevision, setShuffleHistoryRevision] = useState(0);
  const queueKey = useMemo(() => playbackQueueVideos.map((video) => video.id).join("\n"), [playbackQueueVideos]);
  const queueVideoIds = useMemo(() => new Set(playbackQueueVideos.map((video) => video.id)), [playbackQueueVideos]);
  const latestQueueContextRef = useRef({ currentVideoId, playbackMode, queueKey });
  latestQueueContextRef.current = { currentVideoId, playbackMode, queueKey };

  const updateShuffleHistory = useCallback((nextHistory: ShuffleHistory) => {
    const previous = shuffleHistoryRef.current;
    if (previous.index === nextHistory.index && previous.ids.join("\n") === nextHistory.ids.join("\n")) return;
    shuffleHistoryRef.current = nextHistory;
    setShuffleHistoryRevision((revision) => revision + 1);
  }, []);

  const cancelAutoNextPrompt = useCallback(() => {
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    autoNextSnapshotRef.current = null;
    setAutoNextPrompt(null);
  }, []);

  const getNextVideoId = useCallback((mode: PlaybackMode) => {
    const pending = pendingNextNavigationRef.current;
    if (
      pending &&
      pending.currentVideoId === currentVideoId &&
      pending.playbackMode === mode &&
      pending.queueKey === queueKey &&
      queueVideoIds.has(pending.videoId)
    ) {
      return pending.videoId;
    }

    if (mode !== "shuffle") {
      const videoId = getNextVideoIdForQueue(playbackQueueVideos, currentVideoId, mode);
      pendingNextNavigationRef.current = videoId
        ? { currentVideoId, historyIndex: null, playbackMode: mode, queueKey, videoId }
        : null;
      return videoId;
    }

    const history = shuffleHistoryRef.current;
    const forwardIndex = history.index + 1;
    const forwardVideoId = history.ids[forwardIndex];
    if (forwardVideoId && queueVideoIds.has(forwardVideoId)) {
      pendingNextNavigationRef.current = {
        currentVideoId,
        historyIndex: forwardIndex,
        playbackMode: mode,
        queueKey,
        videoId: forwardVideoId,
      };
      return forwardVideoId;
    }

    const selection = pickShuffleVideoId(
      playbackQueueVideos,
      currentVideoId,
      shuffleRemainingIdsRef.current,
    );
    shuffleRemainingIdsRef.current = selection.remainingIds;
    pendingNextNavigationRef.current = selection.videoId
      ? { currentVideoId, historyIndex: null, playbackMode: mode, queueKey, videoId: selection.videoId }
      : null;
    return selection.videoId;
  }, [currentVideoId, playbackQueueVideos, queueKey, queueVideoIds]);

  const selectNextVideo = useCallback((nextVideoId: string) => {
    const pending = pendingNextNavigationRef.current;
    if (pending?.videoId === nextVideoId && pending.historyIndex !== null) {
      updateShuffleHistory({ ...shuffleHistoryRef.current, index: pending.historyIndex });
    }
    shuffleRemainingIdsRef.current = shuffleRemainingIdsRef.current.filter((videoId) => videoId !== nextVideoId);
    pendingNextNavigationRef.current = null;
    selectVideoRef.current(nextVideoId);
  }, [selectVideoRef, updateShuffleHistory]);

  const playNext = useCallback(() => {
    const nextVideoId = getNextVideoId(playbackMode);
    if (!nextVideoId) {
      if (isFavoriteQueue && !playbackQueueVideos.length) {
        setMessage("还没有收藏的视频，无法只播放收藏。");
      }
      return;
    }
    selectNextVideo(nextVideoId);
  }, [getNextVideoId, isFavoriteQueue, playbackMode, playbackQueueVideos.length, selectNextVideo, setMessage]);

  const playPrevious = useCallback(() => {
    cancelAutoNextPrompt();
    pendingNextNavigationRef.current = null;
    if (playbackMode === "shuffle") {
      const history = shuffleHistoryRef.current;
      const previousIndex = history.index - 1;
      const previousVideoId = history.ids[previousIndex];
      if (!previousVideoId || !queueVideoIds.has(previousVideoId)) return;
      updateShuffleHistory({ ...history, index: previousIndex });
      selectVideoRef.current(previousVideoId);
      return;
    }

    const previousVideoId = getPreviousVideoIdForQueue(playbackQueueVideos, currentVideoId, playbackMode);
    if (previousVideoId) selectVideoRef.current(previousVideoId);
  }, [cancelAutoNextPrompt, currentVideoId, playbackMode, playbackQueueVideos, queueVideoIds, selectVideoRef, updateShuffleHistory]);

  const canPlayNext = useMemo(() => {
    if (playbackMode === "shuffle") return Boolean(playbackQueueVideos.length);
    return Boolean(getNextVideoIdForQueue(playbackQueueVideos, currentVideoId, playbackMode));
  }, [currentVideoId, playbackMode, playbackQueueVideos, shuffleHistoryRevision]);
  const canPlayPrevious = useMemo(() => {
    if (playbackMode === "shuffle") {
      const history = shuffleHistoryRef.current;
      return history.index > 0 && queueVideoIds.has(history.ids[history.index - 1]);
    }
    return Boolean(getPreviousVideoIdForQueue(playbackQueueVideos, currentVideoId, playbackMode));
  }, [currentVideoId, playbackMode, playbackQueueVideos, queueVideoIds, shuffleHistoryRevision]);

  const confirmAutoNext = useCallback((nextVideoId: string) => {
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
    selectNextVideo(nextVideoId);
  }, [cancelAutoNextPrompt, selectNextVideo, setMessage, videosRef]);

  const startAutoNextPrompt = useCallback((nextVideoId: string) => {
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
  }, [cancelAutoNextPrompt, confirmAutoNext, currentVideoId, playbackMode, queueKey, videosRef]);

  useEffect(() => {
    pendingNextNavigationRef.current = null;
    shuffleRemainingIdsRef.current = playbackQueueVideos
      .map((video) => video.id)
      .filter((videoId) => videoId !== currentVideoId);
    updateShuffleHistory(
      playbackMode === "shuffle" && currentVideoId && queueVideoIds.has(currentVideoId)
        ? { ids: [currentVideoId], index: 0 }
        : { ids: [], index: -1 },
    );
  }, [playbackMode, queueKey]);

  useEffect(() => {
    cancelAutoNextPrompt();
    pendingNextNavigationRef.current = null;
  }, [cancelAutoNextPrompt, currentVideoId, playbackMode, queueKey]);

  useEffect(() => {
    if (playbackMode !== "shuffle" || !currentVideoId || !queueVideoIds.has(currentVideoId)) return;
    shuffleRemainingIdsRef.current = shuffleRemainingIdsRef.current.filter((videoId) => videoId !== currentVideoId);
    const history = shuffleHistoryRef.current;
    if (history.ids[history.index] === currentVideoId) return;
    const nextIds = history.ids.slice(0, history.index + 1);
    if (nextIds[nextIds.length - 1] !== currentVideoId) nextIds.push(currentVideoId);
    updateShuffleHistory({ ids: nextIds, index: nextIds.length - 1 });
  }, [currentVideoId, playbackMode, queueVideoIds, updateShuffleHistory]);

  useEffect(() => () => {
    if (autoNextTimerRef.current) window.clearTimeout(autoNextTimerRef.current);
  }, []);

  return {
    autoNextPrompt,
    canPlayNext,
    canPlayPrevious,
    cancelAutoNextPrompt,
    confirmAutoNext,
    getNextVideoId,
    playNext,
    playPrevious,
    startAutoNextPrompt,
  };
}
