import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { fetchLocalJson as fetchJson } from "./localApiClient";
import type { LocalConfig } from "./mediaRootScanCache";
import {
  detectDuplicateVideosWithProgress,
  type DuplicateDetectionProgress,
  type DuplicateNameSimilarityPair,
  type DuplicateVideoGroup,
} from "./playerMediaUtils";
import {
  createDuplicateContentFingerprint,
  createDuplicateFingerprintCacheKey,
  createDuplicateNameSimilarityCacheKey,
  createPersistedDuplicateDetectionResult,
  type DuplicateFingerprintCacheEntry,
  type DuplicateNameSimilarityCacheEntry,
  type DuplicateNameSimilarityResponse,
} from "./playerDuplicateRuntime";
import type { PlayerDataStore, VideoItem } from "./playerTypes";
import type { HomeMediaMode, RatingPlaylistMode } from "./playerUiState";

type UseDuplicateDetectionControllerOptions = {
  duplicateDetectionAbortRef: MutableRefObject<AbortController | null>;
  duplicateDetectionMessageRef: MutableRefObject<string>;
  duplicateDetectionResultsByModeRef: MutableRefObject<PlayerDataStore["duplicateDetections"]>;
  duplicateDetectionResultScopeKeyRef: MutableRefObject<string>;
  duplicateDetectionRunIdRef: MutableRefObject<number>;
  duplicateFingerprintCacheRef: MutableRefObject<Map<string, DuplicateFingerprintCacheEntry>>;
  duplicateNameSimilarityCacheRef: MutableRefObject<Map<string, DuplicateNameSimilarityCacheEntry>>;
  duplicateVideoGroupsRef: MutableRefObject<DuplicateVideoGroup[]>;
  homeMediaMode: HomeMediaMode;
  localConfigRef: MutableRefObject<LocalConfig | null>;
  modeFilteredVideos: VideoItem[];
  saveCurrentPlayerDataStore: (overrides?: Partial<PlayerDataStore>) => Promise<void>;
  setDuplicateDetectionMessage: Dispatch<SetStateAction<string>>;
  setDuplicateDetectionProgress: Dispatch<SetStateAction<DuplicateDetectionProgress | null>>;
  setDuplicateDetectionResultScopeKey: Dispatch<SetStateAction<string>>;
  setDuplicateVideoGroups: Dispatch<SetStateAction<DuplicateVideoGroup[]>>;
  setIsDuplicateDetectionRunning: Dispatch<SetStateAction<boolean>>;
  setIsDuplicatePlaylistActive: Dispatch<SetStateAction<boolean>>;
  setPlaylistPage: Dispatch<SetStateAction<number>>;
  setRatingPlaylistMode: Dispatch<SetStateAction<RatingPlaylistMode | null>>;
};

export function useDuplicateDetectionController({
  duplicateDetectionAbortRef,
  duplicateDetectionMessageRef,
  duplicateDetectionResultsByModeRef,
  duplicateDetectionResultScopeKeyRef,
  duplicateDetectionRunIdRef,
  duplicateFingerprintCacheRef,
  duplicateNameSimilarityCacheRef,
  duplicateVideoGroupsRef,
  homeMediaMode,
  localConfigRef,
  modeFilteredVideos,
  saveCurrentPlayerDataStore,
  setDuplicateDetectionMessage,
  setDuplicateDetectionProgress,
  setDuplicateDetectionResultScopeKey,
  setDuplicateVideoGroups,
  setIsDuplicateDetectionRunning,
  setIsDuplicatePlaylistActive,
  setPlaylistPage,
  setRatingPlaylistMode,
}: UseDuplicateDetectionControllerOptions) {
  const getDuplicateFingerprint = useCallback(async (video: VideoItem, signal?: AbortSignal) => {
    const cacheKey = createDuplicateFingerprintCacheKey(video);
    const cached = duplicateFingerprintCacheRef.current.get(cacheKey);
    if (cached) return cached.fingerprint;

    const fingerprint = await createDuplicateContentFingerprint(video, signal).catch(() => null);
    duplicateFingerprintCacheRef.current.set(cacheKey, { fingerprint });
    return fingerprint;
  }, [duplicateFingerprintCacheRef]);

  const getDuplicateNameSimilarityScores = useCallback(async (pairs: DuplicateNameSimilarityPair[], signal?: AbortSignal) => {
    const scores = new Map<string, number>();
    if (!localConfigRef.current?.ai.configured || !pairs.length) return scores;

    const missingPairs: DuplicateNameSimilarityPair[] = [];
    for (const pair of pairs) {
      const cacheKey = createDuplicateNameSimilarityCacheKey(pair);
      const cached = duplicateNameSimilarityCacheRef.current.get(cacheKey);
      if (cached) {
        scores.set(pair.id, cached.similarity);
        continue;
      }
      missingPairs.push(pair);
    }
    if (!missingPairs.length) return scores;

    const response = await fetchJson<DuplicateNameSimilarityResponse>("/api/ai/duplicate/name-similarity", {
      method: "POST",
      body: JSON.stringify({ pairs: missingPairs }),
      signal,
    });
    const missingById = new Map(missingPairs.map((pair) => [pair.id, pair]));
    for (const item of response.scores ?? []) {
      const id = typeof item.id === "string" ? item.id : "";
      const pair = missingById.get(id);
      const similarity = Number(item.similarity);
      if (!pair || !Number.isFinite(similarity) || similarity < 0 || similarity > 100) continue;
      const roundedSimilarity = Math.round(similarity);
      scores.set(id, roundedSimilarity);
      duplicateNameSimilarityCacheRef.current.set(createDuplicateNameSimilarityCacheKey(pair), {
        similarity: roundedSimilarity,
      });
    }

    return scores;
  }, [duplicateNameSimilarityCacheRef, localConfigRef]);

  const runDuplicateVideoDetection = useCallback(async () => {
    duplicateDetectionAbortRef.current?.abort();
    const abortController = new AbortController();
    duplicateDetectionAbortRef.current = abortController;
    const runId = duplicateDetectionRunIdRef.current + 1;
    duplicateDetectionRunIdRef.current = runId;
    const targetVideos = modeFilteredVideos;
    const targetMode = homeMediaMode;
    const isAiConfigured = Boolean(localConfigRef.current?.ai.configured);
    let didAiEnhancementFail = false;
    const nextResultsByMode = { ...(duplicateDetectionResultsByModeRef.current ?? {}) };
    delete nextResultsByMode[targetMode];
    duplicateDetectionResultsByModeRef.current = nextResultsByMode;
    void saveCurrentPlayerDataStore({
      duplicateDetection: null,
      duplicateDetections: nextResultsByMode,
    }).catch(() => undefined);

    setIsDuplicateDetectionRunning(true);
    duplicateVideoGroupsRef.current = [];
    duplicateDetectionResultScopeKeyRef.current = targetMode;
    setDuplicateVideoGroups([]);
    setDuplicateDetectionResultScopeKey(targetMode);
    setDuplicateDetectionProgress({
      processedPairs: 0,
      totalPairs: 0,
      percent: targetVideos.length > 1 ? 0 : 100,
    });
    setDuplicateDetectionMessage(
      targetVideos.length > 1
        ? `正在检测 ${targetVideos.length} 个视频的重复线索...`
        : "当前模式视频不足 2 个，无需检测重复。",
    );

    try {
      const groups = await detectDuplicateVideosWithProgress(targetVideos, {
        mode: targetMode,
        signal: abortController.signal,
        getContentFingerprint: getDuplicateFingerprint,
        getNameSimilarityScores: getDuplicateNameSimilarityScores,
        onNameSimilarityError: () => {
          didAiEnhancementFail = true;
        },
        onProgress: (progress) => {
          if (duplicateDetectionRunIdRef.current !== runId) return;
          setDuplicateDetectionProgress(progress);
          setDuplicateDetectionMessage(
            progress.phase === "fingerprint"
              ? `正在比对内容指纹 ${progress.processedFingerprints ?? 0} / ${progress.totalFingerprints ?? 0} 个候选视频`
              : progress.phase === "aiName"
                ? `正在调用 AI 比对名称 ${progress.processedNamePairs ?? 0} / ${progress.totalNamePairs ?? 0} 组候选`
                : `已检查 ${progress.processedPairs} / ${progress.totalPairs} 组候选组合`,
          );
        },
      });
      if (duplicateDetectionRunIdRef.current !== runId) return;
      const aiStatus = didAiEnhancementFail
        ? "；AI 名称增强失败，已使用本地结果"
        : isAiConfigured
          ? ""
          : "；未配置 AI，已使用本地规则";
      const nextMessage = groups.length
        ? `检测完成，发现 ${groups.length} 组重复或疑似重复视频，可进入重复列表筛选删除${aiStatus}。`
        : `本地检测完成，未发现重复或疑似重复视频${aiStatus}。`;
      const nextPersistedResult = createPersistedDuplicateDetectionResult(targetMode, groups, nextMessage);
      duplicateDetectionResultsByModeRef.current = nextPersistedResult
        ? { ...(duplicateDetectionResultsByModeRef.current ?? {}), [targetMode]: nextPersistedResult }
        : { ...(duplicateDetectionResultsByModeRef.current ?? {}) };
      duplicateVideoGroupsRef.current = groups;
      duplicateDetectionResultScopeKeyRef.current = targetMode;
      duplicateDetectionMessageRef.current = nextMessage;
      setDuplicateVideoGroups(groups);
      setDuplicateDetectionResultScopeKey(targetMode);
      setPlaylistPage(1);
      setIsDuplicatePlaylistActive(false);
      setRatingPlaylistMode(null);
      setDuplicateDetectionMessage(nextMessage);
      void saveCurrentPlayerDataStore({
        duplicateDetection: null,
        duplicateDetections: duplicateDetectionResultsByModeRef.current,
      }).catch(() => undefined);
    } catch (error) {
      if (abortController.signal.aborted) return;
      setDuplicateDetectionMessage(error instanceof Error ? error.message : "重复视频检测失败。");
    } finally {
      if (duplicateDetectionRunIdRef.current === runId) {
        setIsDuplicateDetectionRunning(false);
        duplicateDetectionAbortRef.current = null;
      }
    }
  }, [
    duplicateDetectionAbortRef,
    duplicateDetectionMessageRef,
    duplicateDetectionResultsByModeRef,
    duplicateDetectionResultScopeKeyRef,
    duplicateDetectionRunIdRef,
    duplicateVideoGroupsRef,
    getDuplicateFingerprint,
    getDuplicateNameSimilarityScores,
    homeMediaMode,
    localConfigRef,
    modeFilteredVideos,
    saveCurrentPlayerDataStore,
    setDuplicateDetectionMessage,
    setDuplicateDetectionProgress,
    setDuplicateDetectionResultScopeKey,
    setDuplicateVideoGroups,
    setIsDuplicateDetectionRunning,
    setIsDuplicatePlaylistActive,
    setPlaylistPage,
    setRatingPlaylistMode,
  ]);

  return { runDuplicateVideoDetection };
}
