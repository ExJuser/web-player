import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PlaylistSearchDocument,
  PlaylistSearchMatch,
  PlaylistSearchRecord,
  PlaylistSearchToken,
} from "./playerPlaylistSearch";
import type { LibraryWorkerRequest, LibraryWorkerResponse } from "./libraryWorkerTypes";

type SearchResult = {
  matchesByVideoId: Map<string, PlaylistSearchMatch>;
  query: string;
  tokens: PlaylistSearchToken[];
  videoIds: string[];
};

const emptyResult: SearchResult = {
  matchesByVideoId: new Map(),
  query: "",
  tokens: [],
  videoIds: [],
};

export function useLibrarySearch<Video extends { id: string }>(
  videos: Video[],
  records: PlaylistSearchRecord[],
  query: string,
) {
  const workerRef = useRef<Worker | null>(null);
  const revisionRef = useRef(0);
  const requestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const workerFailedRef = useRef(false);
  const recordsRef = useRef(records);
  const videosRef = useRef(videos);
  // Worker 不可用时的主线程降级路径：文档构建（20k 记录约 200ms）按 records 身份缓存，
  // 避免每次输入都重新构建（records 只在激活搜索/依赖变化时更换身份）。
  const fallbackDocumentsRef = useRef<{ records: PlaylistSearchRecord[]; documents: Map<string, PlaylistSearchDocument> } | null>(null);
  const [backendRevision, setBackendRevision] = useState(0);
  const [result, setResult] = useState<SearchResult>(emptyResult);
  const [isPending, setIsPending] = useState(false);

  recordsRef.current = records;
  videosRef.current = videos;

  useEffect(() => {
    if (!query.trim() || typeof Worker === "undefined" || workerRef.current || workerFailedRef.current) return;
    const worker = new Worker(new URL("./libraryWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<LibraryWorkerResponse>) => {
      const response = event.data;
      if (response.type === "ready") {
        performance.measure("library-search:index", {
          start: performance.now() - response.buildMs,
          end: performance.now(),
        });
        return;
      }
      if (response.type === "error") {
        if (response.requestId && response.requestId !== latestRequestIdRef.current) return;
        setIsPending(false);
        return;
      }
      if (response.requestId !== latestRequestIdRef.current) return;
      performance.measure("library-search:query", {
        start: performance.now() - response.elapsedMs,
        end: performance.now(),
      });
      setResult({
        matchesByVideoId: new Map(response.matches),
        query: response.query,
        tokens: response.tokens,
        videoIds: response.videoIds,
      });
      setIsPending(false);
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      workerFailedRef.current = true;
      setBackendRevision((revision) => revision + 1);
    };
    setBackendRevision((revision) => revision + 1);
  }, [query]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    workerRef.current?.postMessage({
      type: "initialize",
      revision,
      records,
    } satisfies LibraryWorkerRequest);
  }, [backendRevision, records]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      latestRequestIdRef.current = requestIdRef.current + 1;
      requestIdRef.current = latestRequestIdRef.current;
      setIsPending(false);
      setResult(emptyResult);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    latestRequestIdRef.current = requestId;
    setIsPending(true);
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({
        type: "search",
        requestId,
        revision: revisionRef.current,
        query: normalizedQuery,
      } satisfies LibraryWorkerRequest);
      return;
    }

    let cancelled = false;
    void import("./playerPlaylistSearch").then((search) => {
      if (cancelled || latestRequestIdRef.current !== requestId) return;
      let documents = fallbackDocumentsRef.current?.documents;
      if (!documents || fallbackDocumentsRef.current?.records !== recordsRef.current) {
        documents = search.createPlaylistSearchDocuments(recordsRef.current);
        fallbackDocumentsRef.current = { records: recordsRef.current, documents };
      }
      const fallbackResult = search.searchPlaylistVideos(videosRef.current, documents, normalizedQuery);
      setResult({
        matchesByVideoId: fallbackResult.matchesByVideoId,
        query: normalizedQuery,
        tokens: fallbackResult.tokens,
        videoIds: fallbackResult.videos.map((video) => video.id),
      });
      setIsPending(false);
    }).catch(() => {
      if (!cancelled && latestRequestIdRef.current === requestId) setIsPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [backendRevision, query, records]);

  const videosById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
  const visibleVideos = useMemo(() => {
    if (!query.trim()) return videos;
    return result.videoIds.flatMap((videoId) => {
      const video = videosById.get(videoId);
      return video ? [video] : [];
    });
  }, [query, result.videoIds, videos, videosById]);

  return {
    isPending: isPending || Boolean(query.trim() && result.query !== query.trim()),
    matchesByVideoId: result.matchesByVideoId,
    tokens: result.tokens,
    videos: visibleVideos,
  };
}
