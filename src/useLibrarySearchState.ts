import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import {
  createAiLibrarySearchResults,
  createLibrarySearchSignature,
  getVisibleLibrarySearchResults,
  shouldUseAiLibrarySearch,
  librarySearchResultPageSize,
  searchLibraryEntries,
  type LibrarySearchCandidate,
  type LibrarySearchContext,
} from "./librarySearchUtils";
import type {
  HomeMediaMode,
} from "./playerUiState";
import type {
  LibraryAiSearchResponse,
  LibrarySearchMode,
  LibrarySearchResult,
  LibrarySearchSurface,
} from "./appTypes";
import type {
  PlaybackProgress,
  VideoItem,
} from "./playerTypes";
import type { LocalConfig } from "./mediaRootScanCache";

type LibrarySearchStateParams = {
  createCandidates: (localResults: LibrarySearchResult[], surface: LibrarySearchSurface) => LibrarySearchCandidate[];
  homeMediaMode: HomeMediaMode;
  homeVideos: VideoItem[];
  homeContext: LibrarySearchContext<PlaybackProgress>;
  isCinemaMode: boolean;
  isNonPlayerViewVisible: boolean;
  isPrivacyMode: boolean;
  localConfig: LocalConfig | null;
  playerVideos: VideoItem[];
  playerContext: LibrarySearchContext<PlaybackProgress>;
  scopeKey: string;
  homeResultsRef: RefObject<HTMLDivElement | null>;
  homeLoadMoreRef: RefObject<HTMLDivElement | null>;
  playerResultsRef: RefObject<HTMLDivElement | null>;
  playerLoadMoreRef: RefObject<HTMLDivElement | null>;
};

export function useLibrarySearchState({
  createCandidates,
  homeMediaMode,
  homeVideos,
  homeContext,
  isCinemaMode,
  isNonPlayerViewVisible,
  isPrivacyMode,
  localConfig,
  playerVideos,
  playerContext,
  scopeKey,
  homeResultsRef,
  homeLoadMoreRef,
  playerResultsRef,
  playerLoadMoreRef,
}: LibrarySearchStateParams) {
  const runIdRef = useRef(0);
  const [homeQuery, setHomeQuery] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(librarySearchResultPageSize);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<LibrarySearchMode>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [submittedSignature, setSubmittedSignature] = useState("");
  const [surface, setSurface] = useState<LibrarySearchSurface | null>(null);
  const [focusedSurface, setFocusedSurface] = useState<LibrarySearchSurface | null>(null);

  const homeDraftSignature = useMemo(() => createLibrarySearchSignature(homeQuery), [homeQuery]);
  const playerDraftSignature = useMemo(() => createLibrarySearchSignature(playerQuery), [playerQuery]);
  const effectiveMode = homeMediaMode === "special" && mode === "ai" ? "local" : mode;
  const visibleMessage = homeMediaMode === "special" && mode === "ai" ? "" : message;
  const visibleAnswer = homeMediaMode === "special" ? "" : answer;
  const isHomeSurface = surface === "home";
  const isPlayerSurface = surface === "player";
  const isHomeLoading = isLoading && isHomeSurface;
  const isPlayerLoading = isLoading && isPlayerSurface;
  const homeMode = isHomeSurface ? effectiveMode : "idle";
  const playerMode = isPlayerSurface ? effectiveMode : "idle";
  const homeMessage = isHomeSurface ? visibleMessage : "";
  const playerMessage = isPlayerSurface ? visibleMessage : "";
  const homeAnswer = isHomeSurface ? visibleAnswer : "";
  const playerAnswer = isPlayerSurface ? visibleAnswer : "";
  const defaultStatus = homeMediaMode === "special" ? "特殊模式仅使用本地片名、路径或标签搜索。" : "";
  const homePlaceholder =
    homeMediaMode === "special" ? "搜索片名、路径或标签" : "搜索片名，或描述想看的内容";

  const searchLocally = useCallback(
    (query: string, limit?: number, targetSurface: LibrarySearchSurface = "home"): LibrarySearchResult[] => {
      const videos = targetSurface === "player" ? playerVideos : homeVideos;
      const context = targetSurface === "player" ? playerContext : homeContext;
      return searchLibraryEntries<VideoItem, PlaybackProgress>(query, videos, context, limit);
    },
    [homeContext, homeVideos, playerContext, playerVideos],
  );

  useEffect(() => {
    runIdRef.current += 1;
    setHomeQuery("");
    setPlayerQuery("");
    setIsLoading(false);
    setMode("idle");
    setMessage("");
    setResults([]);
    setVisibleCount(librarySearchResultPageSize);
    setAnswer("");
    setSubmittedSignature("");
    setSurface(null);
  }, [homeMediaMode, scopeKey]);

  const runSearch = useCallback(async (targetSurface: LibrarySearchSurface) => {
    const searchRunId = (runIdRef.current += 1);
    const query = (targetSurface === "home" ? homeQuery : playerQuery).trim();
    const draftSignature = targetSurface === "home" ? homeDraftSignature : playerDraftSignature;
    const isSpecialSearch = homeMediaMode === "special";
    setSurface(targetSurface);
    setAnswer("");
    if (!query) {
      setMode("idle");
      setMessage(isSpecialSearch ? "输入片名、路径或标签关键词。" : "输入片名、关键词或想看的内容。");
      setResults([]);
      setVisibleCount(librarySearchResultPageSize);
      setSubmittedSignature("");
      setSurface(null);
      return;
    }

    setSubmittedSignature(draftSignature);
    setVisibleCount(librarySearchResultPageSize);
    const searchVideos = targetSurface === "player" ? playerVideos : homeVideos;
    const searchContext = targetSurface === "player" ? playerContext : homeContext;
    const localResults = searchLocally(query, undefined, targetSurface);
    setResults(localResults);
    const needsAi =
      !isSpecialSearch &&
      Boolean(localConfig?.ai.configured) &&
      shouldUseAiLibrarySearch(query, localResults);
    if (!needsAi) {
      setMode(localResults.length ? "local" : "empty");
      setMessage(
        isSpecialSearch
          ? localResults.length
            ? "特殊模式仅使用本地片名/路径/标签搜索。"
            : "特殊模式本地没有找到匹配结果。"
          : localResults.length
            ? "本地检索已命中，未调用大模型。"
            : localConfig?.ai.configured
              ? "本地没有找到匹配结果。"
              : "本地没有找到匹配结果，且未配置 DEEPSEEK_API_KEY。",
      );
      return;
    }

    setIsLoading(true);
    setMode("ai");
    setMessage("本地匹配不足，正在调用 AI 分析候选片库...");
    try {
      const candidates = createCandidates(localResults, targetSurface);
      if (!candidates.length) throw new Error("当前片库没有可搜索的视频。");
      const response = await fetchJson<LibraryAiSearchResponse>("/api/ai/library/search", {
        method: "POST",
        body: JSON.stringify({ query, candidates }),
      });
      if (runIdRef.current !== searchRunId) return;
      const aiResults = createAiLibrarySearchResults(response.matchIds, searchVideos, searchContext);
      setResults(aiResults.length ? aiResults : localResults);
      setVisibleCount(librarySearchResultPageSize);
      setAnswer(response.answer);
      setMessage(aiResults.length ? "AI 已从本地候选中挑选结果。" : "AI 未返回明确条目，保留本地结果。");
    } catch (error) {
      if (runIdRef.current !== searchRunId) return;
      setMode(localResults.length ? "local" : "empty");
      setResults(localResults);
      setVisibleCount(librarySearchResultPageSize);
      setMessage(error instanceof Error ? error.message : "AI 搜索失败，已保留本地结果。");
    } finally {
      if (runIdRef.current === searchRunId) {
        setIsLoading(false);
      }
    }
  }, [
    createCandidates,
    homeContext,
    homeDraftSignature,
    homeMediaMode,
    homeQuery,
    homeVideos,
    localConfig,
    playerContext,
    playerDraftSignature,
    playerQuery,
    playerVideos,
    searchLocally,
  ]);

  const runTagSearch = useCallback(
    (tag: string) => {
      const query = tag.trim();
      if (!query) return;
      runIdRef.current += 1;
      setHomeQuery(query);
      setAnswer("");
      setIsLoading(false);
      setSurface("home");
      setSubmittedSignature(createLibrarySearchSignature(query));
      setVisibleCount(librarySearchResultPageSize);
      const localResults = searchLocally(query, undefined, "home");
      setResults(localResults);
      setMode(localResults.length ? "local" : "empty");
      setMessage(localResults.length ? "已按标签筛选特殊模式视频。" : "特殊模式本地没有找到匹配结果。");
    },
    [searchLocally],
  );

  const homePreviewResults = useMemo(() => {
    const query = homeQuery.trim();
    if (!query) return [];
    return searchLocally(query, 3, "home");
  }, [homeQuery, searchLocally]);

  const playerPreviewResults = useMemo(() => {
    const query = playerQuery.trim();
    if (!query) return [];
    return searchLocally(query, 3, "player");
  }, [playerQuery, searchLocally]);

  const hasHomeQuery = Boolean(homeQuery.trim());
  const hasPlayerQuery = Boolean(playerQuery.trim());
  const shouldShowHomePreview = Boolean(
    focusedSurface === "home" &&
    hasHomeQuery &&
      (homeDraftSignature !== submittedSignature || !isHomeSurface),
  );
  const shouldShowPlayerPreview = Boolean(
    focusedSurface === "player" &&
    hasPlayerQuery &&
      (playerDraftSignature !== submittedSignature || !isPlayerSurface),
  );

  const handleBlur = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocusedSurface(null);
  }, []);

  const { visibleResults, hasMoreResults } = useMemo(
    () => getVisibleLibrarySearchResults(results, visibleCount),
    [results, visibleCount],
  );
  const homeResults = isHomeSurface ? results : [];
  const playerResults = isPlayerSurface ? results : [];
  const visibleHomeResults = isHomeSurface ? visibleResults : [];
  const visiblePlayerResults = isPlayerSurface ? visibleResults : [];
  const hasMoreHomeResults = isHomeSurface && hasMoreResults;
  const hasMorePlayerResults = isPlayerSurface && hasMoreResults;

  const loadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + librarySearchResultPageSize, results.length));
  }, [results.length]);

  useEffect(() => {
    const shouldUsePlayerSearchContainer = !isNonPlayerViewVisible && !isPrivacyMode && !isCinemaMode;
    const hasMoreVisibleResults = shouldUsePlayerSearchContainer ? hasMorePlayerResults : hasMoreHomeResults;
    const root = shouldUsePlayerSearchContainer ? playerResultsRef.current : homeResultsRef.current;
    const target = shouldUsePlayerSearchContainer ? playerLoadMoreRef.current : homeLoadMoreRef.current;
    if (!hasMoreVisibleResults || !root || !target) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root, rootMargin: "40px 0px 80px", threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    hasMoreHomeResults,
    hasMorePlayerResults,
    homeLoadMoreRef,
    homeResultsRef,
    isCinemaMode,
    isNonPlayerViewVisible,
    isPrivacyMode,
    loadMore,
    playerLoadMoreRef,
    playerResultsRef,
    visibleHomeResults.length,
    visiblePlayerResults.length,
  ]);

  const filterResults = useCallback((filter: (results: LibrarySearchResult[]) => LibrarySearchResult[]) => {
    setResults((previous) => filter(previous));
  }, []);

  return {
    defaultStatus,
    filterResults,
    focusedSurface,
    handleBlur,
    hasMoreHomeResults,
    hasMorePlayerResults,
    homeAnswer,
    homeDraftSignature,
    homeMessage,
    homeMode,
    homePlaceholder,
    homePreviewResults,
    homeQuery,
    homeResults,
    isHomeLoading,
    isHomeSurface,
    isLoading,
    isPlayerLoading,
    isPlayerSurface,
    loadMore,
    mode,
    playerAnswer,
    playerDraftSignature,
    playerMessage,
    playerMode,
    playerPreviewResults,
    playerQuery,
    playerResults,
    runSearch,
    runTagSearch,
    setFocusedSurface,
    setHomeQuery,
    setPlayerQuery,
    shouldShowHomePreview,
    shouldShowHomeStatus: Boolean(isHomeLoading || homeMessage || defaultStatus),
    shouldShowPlayerPreview,
    shouldShowPlayerStatus: Boolean(isPlayerLoading || playerMessage || defaultStatus),
    visibleHomeResults,
    visiblePlayerResults,
  };
}
