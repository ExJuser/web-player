import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

import { playlistScrollFrameDelay, playlistThumbnailScrollIdleDelay } from "./playerConstants";

type PlaylistViewport = { scrollTop: number; height: number };

type UsePlaylistScrollControllerOptions = {
  currentVideoId: string | null;
  isScanning: boolean;
  playlistItemIdsKey: string;
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
  playlistItemIdsKey,
  playlistPageSize,
  playlistRef,
  setPlaylistPage,
  visibleVideoIndexById,
}: UsePlaylistScrollControllerOptions) {
  const playlistAutoScrollTimerRef = useRef<number | null>(null);
  const playlistScrollFrameRef = useRef<number | null>(null);
  const playlistScrollIdleTimerRef = useRef<number | null>(null);
  const isPlaylistAutoScrollingRef = useRef(false);
  const lastPlaylistAutoScrollKeyRef = useRef<string | null>(null);
  const lastPlaylistUserScrollAtRef = useRef(0);
  const visibleThumbnailVideoIdsRef = useRef(new Set<string>());
  const [playlistViewport, setPlaylistViewport] = useState<PlaylistViewport>({ scrollTop: 0, height: 0 });
  const [playlistThumbnailVideoIdsKey, setPlaylistThumbnailVideoIdsKey] = useState("");
  const [isPlaylistScrolling, setIsPlaylistScrolling] = useState(false);

  const updatePlaylistViewport = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    setPlaylistViewport({ scrollTop: playlist.scrollTop, height: playlist.clientHeight });
  }, [playlistRef]);

  const updatePlaylistThumbnailVideoIds = useCallback(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;
    const visibleVideoIds = Array.from(playlist.querySelectorAll<HTMLElement>(".playlist-item"))
      .filter((item) => visibleThumbnailVideoIdsRef.current.has(item.dataset.videoId ?? ""))
      .map((item) => item.dataset.videoId)
      .filter((videoId): videoId is string => Boolean(videoId));
    const nextKey = visibleVideoIds.join("\n");
    setPlaylistThumbnailVideoIdsKey((previous) => previous === nextKey ? previous : nextKey);
  }, [playlistRef]);

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
        updatePlaylistViewport();
      }, playlistScrollFrameDelay);
    }
    if (isPlaylistAutoScrollingRef.current) return;
    lastPlaylistUserScrollAtRef.current = Date.now();
    setIsPlaylistScrolling(true);
    if (playlistScrollIdleTimerRef.current !== null) {
      window.clearTimeout(playlistScrollIdleTimerRef.current);
    }
    playlistScrollIdleTimerRef.current = window.setTimeout(() => {
      playlistScrollIdleTimerRef.current = null;
      setIsPlaylistScrolling(false);
    }, playlistThumbnailScrollIdleDelay);
  }, [playlistRef, updatePlaylistViewport]);

  useLayoutEffect(() => {
    const playlist = playlistRef.current;
    if (!playlist) return;

    updatePlaylistViewport();
    visibleThumbnailVideoIdsRef.current = new Set();
    setPlaylistThumbnailVideoIdsKey("");
    const intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const videoId = (entry.target as HTMLElement).dataset.videoId;
        if (!videoId) return;
        if (entry.isIntersecting) visibleThumbnailVideoIdsRef.current.add(videoId);
        else visibleThumbnailVideoIdsRef.current.delete(videoId);
      });
      updatePlaylistThumbnailVideoIds();
    }, { root: playlist, rootMargin: "50% 0px" });
    playlist.querySelectorAll<HTMLElement>(".playlist-item").forEach((item) => intersectionObserver.observe(item));
    const resizeObserver = new ResizeObserver(updatePlaylistViewport);
    resizeObserver.observe(playlist);
    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [playlistItemIdsKey, playlistRef, updatePlaylistThumbnailVideoIds, updatePlaylistViewport]);

  useEffect(() => {
    return () => {
      clearPlaylistAutoScrollTimer();
      if (playlistScrollFrameRef.current) {
        window.clearTimeout(playlistScrollFrameRef.current);
      }
      if (playlistScrollIdleTimerRef.current !== null) {
        window.clearTimeout(playlistScrollIdleTimerRef.current);
      }
    };
  }, [clearPlaylistAutoScrollTimer]);

  return {
    markPlaylistUserScroll,
    isPlaylistScrolling,
    playlistThumbnailVideoIdsKey,
    playlistViewport,
    scrollPlaylistToTop,
    scrollToCurrentPlaylistItem,
  };
}
