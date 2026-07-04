import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import { playlistScrollFrameDelay } from "./playerConstants";

type PlaylistViewport = { scrollTop: number; height: number };

type UsePlaylistScrollControllerOptions = {
  currentVideoId: string | null;
  isScanning: boolean;
  playlistPageSize: number;
  playlistRef: RefObject<HTMLDivElement | null>;
  setPlaylistPage: Dispatch<SetStateAction<number>>;
  visibleVideoIndexById: Map<string, number>;
};

const playlistAutoScrollDurationMs = 700;
const playlistRecentUserScrollThresholdMs = 800;

export function usePlaylistScrollController({
  currentVideoId,
  isScanning,
  playlistPageSize,
  playlistRef,
  setPlaylistPage,
  visibleVideoIndexById,
}: UsePlaylistScrollControllerOptions) {
  const playlistAutoScrollTimerRef = useRef<number | null>(null);
  const playlistScrollFrameRef = useRef<number | null>(null);
  const isPlaylistAutoScrollingRef = useRef(false);
  const lastPlaylistAutoScrollKeyRef = useRef<string | null>(null);
  const lastPlaylistUserScrollAtRef = useRef(0);
  const [playlistViewport, setPlaylistViewport] = useState<PlaylistViewport>({ scrollTop: 0, height: 0 });

  const clearPlaylistAutoScrollTimer = useCallback(() => {
    if (!playlistAutoScrollTimerRef.current) return;
    window.clearTimeout(playlistAutoScrollTimerRef.current);
    playlistAutoScrollTimerRef.current = null;
  }, []);

  const markPlaylistAutoScrolling = useCallback(() => {
    isPlaylistAutoScrollingRef.current = true;
    clearPlaylistAutoScrollTimer();
    playlistAutoScrollTimerRef.current = window.setTimeout(() => {
      isPlaylistAutoScrollingRef.current = false;
      playlistAutoScrollTimerRef.current = null;
    }, playlistAutoScrollDurationMs);
  }, [clearPlaylistAutoScrollTimer]);

  const scrollPlaylistItemIntoView = useCallback((videoId: string, behavior: ScrollBehavior) => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    const target = Array.from(playlist.querySelectorAll<HTMLElement>(".playlist-item")).find(
      (item) => item.dataset.videoId === videoId,
    );
    if (!target) return;
    const playlistRect = playlist.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = Math.max(
      0,
      playlist.scrollTop + targetRect.top - playlistRect.top - playlist.clientHeight / 2 + targetRect.height / 2,
    );
    playlist.scrollTo({ top, behavior });
    setPlaylistViewport({ scrollTop: top, height: playlist.clientHeight });
  }, [playlistRef]);

  const scrollToCurrentPlaylistItem = useCallback((behavior: ScrollBehavior = "smooth") => {
    const playlist = playlistRef.current;
    if (!playlist || !currentVideoId) return;
    const index = visibleVideoIndexById.get(currentVideoId);
    if (index === undefined) return;
    markPlaylistAutoScrolling();
    const targetPage = Math.floor(index / playlistPageSize) + 1;
    setPlaylistPage(targetPage);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollPlaylistItemIntoView(currentVideoId, behavior));
    });
  }, [
    currentVideoId,
    markPlaylistAutoScrolling,
    playlistPageSize,
    playlistRef,
    scrollPlaylistItemIntoView,
    setPlaylistPage,
    visibleVideoIndexById,
  ]);

  const scrollPlaylistToTop = useCallback((behavior: ScrollBehavior = "smooth") => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    markPlaylistAutoScrolling();
    playlist.scrollTo({ top: 0, behavior });
    setPlaylistViewport((previous) => ({ ...previous, scrollTop: 0 }));
  }, [markPlaylistAutoScrolling, playlistRef]);

  useEffect(() => {
    if (!currentVideoId || !playlistRef.current) return;
    if (isScanning) return;
    const autoScrollKey = currentVideoId;
    if (lastPlaylistAutoScrollKeyRef.current === autoScrollKey) return;
    lastPlaylistAutoScrollKeyRef.current = autoScrollKey;
    if (Date.now() - lastPlaylistUserScrollAtRef.current < playlistRecentUserScrollThresholdMs) return;

    scrollToCurrentPlaylistItem();
  }, [currentVideoId, isScanning, playlistRef, scrollToCurrentPlaylistItem]);

  const markPlaylistUserScroll = useCallback((event?: React.UIEvent<HTMLDivElement>) => {
    const element = event?.currentTarget ?? playlistRef.current;
    if (element && playlistScrollFrameRef.current === null) {
      playlistScrollFrameRef.current = window.setTimeout(() => {
        playlistScrollFrameRef.current = null;
        const playlist = playlistRef.current;
        if (playlist) {
          setPlaylistViewport({ scrollTop: playlist.scrollTop, height: playlist.clientHeight });
        }
      }, playlistScrollFrameDelay);
    }
    if (isPlaylistAutoScrollingRef.current) return;
    lastPlaylistUserScrollAtRef.current = Date.now();
  }, [playlistRef]);

  useLayoutEffect(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    const updatePlaylistViewport = () => {
      setPlaylistViewport({ scrollTop: playlist.scrollTop, height: playlist.clientHeight });
    };

    updatePlaylistViewport();
    const observer = new ResizeObserver(updatePlaylistViewport);
    observer.observe(playlist);
    return () => observer.disconnect();
  }, [playlistRef]);

  useEffect(() => {
    return () => {
      clearPlaylistAutoScrollTimer();
      if (playlistScrollFrameRef.current) {
        window.clearTimeout(playlistScrollFrameRef.current);
      }
    };
  }, [clearPlaylistAutoScrollTimer]);

  return {
    markPlaylistUserScroll,
    playlistViewport,
    scrollPlaylistToTop,
    scrollToCurrentPlaylistItem,
  };
}
