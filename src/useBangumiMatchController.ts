import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { BangumiSeriesMatch } from "./appTypes";
import type { VideoItem } from "./playerTypes";
import { inferSeriesTitle, scopedSeriesKeyForVideo } from "./playerSeriesUtils";

type SeriesOption = {
  key: string;
  title: string;
};

type UseBangumiMatchControllerOptions = {
  activeSeries: SeriesOption | null;
  bangumiConfigured: boolean;
  isSeriesMode: boolean;
  libraryId: string | null;
  playlistVideos: VideoItem[];
  seriesOptions: SeriesOption[];
  seriesOptionsKey: string;
  seriesTitleByVideoId: Map<string, string>;
};

export function useBangumiMatchController({
  activeSeries,
  bangumiConfigured,
  isSeriesMode,
  libraryId,
  playlistVideos,
  seriesOptions,
  seriesOptionsKey,
  seriesTitleByVideoId,
}: UseBangumiMatchControllerOptions) {
  const [matchesBySeriesKey, setMatchesBySeriesKey] = useState<Record<string, BangumiSeriesMatch>>({});
  const matchesBySeriesKeyRef = useRef<Record<string, BangumiSeriesMatch>>({});
  const matchRunIdRef = useRef(0);

  const activeMatch = activeSeries ? matchesBySeriesKey[activeSeries.key] : null;

  useEffect(() => {
    matchesBySeriesKeyRef.current = matchesBySeriesKey;
  }, [matchesBySeriesKey]);

  useEffect(() => {
    matchRunIdRef.current += 1;
    setMatchesBySeriesKey({});
  }, [libraryId]);

  const createMatchPayload = useCallback(
    (series: SeriesOption) => {
      const seriesVideos = playlistVideos
        .filter((video) => scopedSeriesKeyForVideo(video, seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video)) === series.key)
        .slice(0, 8);
      return {
        libraryId,
        seriesKey: series.key,
        title: series.title,
        sampleVideoNames: seriesVideos.map((video) => video.name),
        sampleRelativePaths: seriesVideos.map((video) => video.relativePath),
      };
    },
    [libraryId, playlistVideos, seriesTitleByVideoId],
  );

  useEffect(() => {
    if (!isSeriesMode || !bangumiConfigured || !libraryId || !seriesOptions.length) return;

    const runId = matchRunIdRef.current + 1;
    matchRunIdRef.current = runId;
    let isCancelled = false;
    const orderedSeries = [
      ...(activeSeries ? [activeSeries] : []),
      ...seriesOptions.filter((series) => series.key !== activeSeries?.key),
    ];

    const loadSeriesMatch = async (series: SeriesOption) => {
      const existing = matchesBySeriesKeyRef.current[series.key];
      if (existing?.title === series.title && ["matched", "none", "error"].includes(existing.status)) return;

      setMatchesBySeriesKey((previous) => ({
        ...previous,
        [series.key]: {
          status: "loading",
          seriesKey: series.key,
          title: series.title,
          subject: null,
          confidence: "none",
          source: "none",
          candidates: [],
        },
      }));

      try {
        const match = await fetchJson<BangumiSeriesMatch>("/api/bangumi/series/match", {
          method: "POST",
          body: JSON.stringify(createMatchPayload(series)),
        });
        if (isCancelled || matchRunIdRef.current !== runId) return;
        setMatchesBySeriesKey((previous) => ({
          ...previous,
          [series.key]: match,
        }));
      } catch (error) {
        if (isCancelled || matchRunIdRef.current !== runId) return;
        setMatchesBySeriesKey((previous) => ({
          ...previous,
          [series.key]: {
            status: "error",
            seriesKey: series.key,
            title: series.title,
            subject: null,
            confidence: "none",
            source: "error",
            candidates: [],
            error: error instanceof Error ? error.message : "Bangumi 匹配失败",
          },
        }));
      }
    };

    void (async () => {
      for (const series of orderedSeries) {
        if (isCancelled || matchRunIdRef.current !== runId) return;
        await loadSeriesMatch(series);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    activeSeries,
    bangumiConfigured,
    createMatchPayload,
    isSeriesMode,
    libraryId,
    seriesOptions,
    seriesOptionsKey,
  ]);

  const canOpenSubject = Boolean(activeMatch?.status === "matched" && activeMatch.subject?.url);
  const buttonTitle = useMemo(() => {
    if (!isSeriesMode) return "Bangumi";
    if (!bangumiConfigured) return "未配置 Bangumi";
    if (!activeSeries) return "没有可匹配的追番系列";
    if (!activeMatch || activeMatch.status === "loading") return `正在匹配 ${activeSeries.title}`;
    if (activeMatch.status === "matched" && activeMatch.subject) {
      return `打开 Bangumi：${activeMatch.subject.nameCn || activeMatch.subject.name || activeSeries.title}`;
    }
    if (activeMatch.status === "none") return `未匹配到 Bangumi 条目：${activeSeries.title}`;
    return activeMatch.error || `Bangumi 匹配失败：${activeSeries.title}`;
  }, [activeMatch, activeSeries, bangumiConfigured, isSeriesMode]);

  const openSubject = useCallback(() => {
    const url = activeMatch?.subject?.url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [activeMatch]);

  return {
    activeMatch,
    buttonTitle,
    canOpenSubject,
    openSubject,
  };
}
