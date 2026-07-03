import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchLocalJson as fetchJson,
} from "./localApiClient";
import {
  getAvailableCacheItemIds,
  getCacheStatusPageState,
  getClearableCacheStatusItems,
  getSelectedCacheStatusItems,
  toggleAllCacheItemSelection,
  toggleCacheItemSelection as toggleCacheStatusItemSelection,
  type CacheStatus,
  type ClearCacheResponse,
} from "./cacheStatusUtils";

type UseCacheStatusDialogParams = {
  isHomeViewVisible: boolean;
  onClearAllCache: () => Promise<void>;
  onClearRuntimeCache: () => void;
};

export function useCacheStatusDialog({
  isHomeViewVisible,
  onClearAllCache,
  onClearRuntimeCache,
}: UseCacheStatusDialogParams) {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [cacheStatusMessage, setCacheStatusMessage] = useState("");
  const [isCacheStatusLoading, setIsCacheStatusLoading] = useState(false);
  const [hasLoadedCacheStatus, setHasLoadedCacheStatus] = useState(false);
  const [isCacheStatusDialogOpen, setIsCacheStatusDialogOpen] = useState(false);
  const [selectedCacheItemIds, setSelectedCacheItemIds] = useState<Set<string>>(() => new Set());
  const [cacheStatusPage, setCacheStatusPage] = useState(1);
  const [isClearCacheConfirmOpen, setIsClearCacheConfirmOpen] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const loadCacheStatus = useCallback(async () => {
    setIsCacheStatusLoading(true);
    setCacheStatusMessage("");
    try {
      const status = await fetchJson<CacheStatus>("/api/cache-status");
      setCacheStatus(status);
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "读取缓存状态失败。");
    } finally {
      setHasLoadedCacheStatus(true);
      setIsCacheStatusLoading(false);
    }
  }, []);

  const cacheStatusItems = cacheStatus?.items ?? [];
  const clearableCacheStatusItems = useMemo(() => getClearableCacheStatusItems(cacheStatusItems), [cacheStatusItems]);
  const selectedCacheItems = useMemo(
    () => getSelectedCacheStatusItems(clearableCacheStatusItems, selectedCacheItemIds),
    [clearableCacheStatusItems, selectedCacheItemIds],
  );
  const selectedCacheItemIdsList = useMemo(() => selectedCacheItems.map((item) => item.id), [selectedCacheItems]);
  const selectedCacheBytes = selectedCacheItems.reduce((sum, item) => sum + item.bytes, 0);
  const selectedCacheFiles = selectedCacheItems.reduce((sum, item) => sum + item.files, 0);
  const isAllCacheSelected =
    clearableCacheStatusItems.length > 0 && clearableCacheStatusItems.every((item) => selectedCacheItemIds.has(item.id));
  const cacheStatusPageState = useMemo(
    () => getCacheStatusPageState(cacheStatusItems, cacheStatusPage),
    [cacheStatusItems, cacheStatusPage],
  );

  useEffect(() => {
    if (!cacheStatus) return;
    const availableIds = getAvailableCacheItemIds(cacheStatus.items);
    setSelectedCacheItemIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [cacheStatus]);

  useEffect(() => {
    setCacheStatusPage((page) => Math.min(Math.max(page, 1), cacheStatusPageState.pageCount));
  }, [cacheStatusPageState.pageCount]);

  const toggleCacheItemSelection = useCallback((id: string, checked: boolean) => {
    setSelectedCacheItemIds((previous) => toggleCacheStatusItemSelection(previous, id, checked));
  }, []);

  const toggleAllCacheItems = useCallback(() => {
    setSelectedCacheItemIds((previous) => toggleAllCacheItemSelection(previous, clearableCacheStatusItems));
  }, [clearableCacheStatusItems]);

  const requestClearSelectedCache = useCallback(() => {
    if (!selectedCacheItems.length) return;
    setIsClearCacheConfirmOpen(true);
  }, [selectedCacheItems.length]);

  const closeClearCacheConfirm = useCallback(() => {
    setIsClearCacheConfirmOpen(false);
  }, []);

  const closeCacheStatusDialog = useCallback(() => {
    setIsCacheStatusDialogOpen(false);
    setIsClearCacheConfirmOpen(false);
  }, []);

  const confirmClearSelectedCache = useCallback(async () => {
    if (!selectedCacheItems.length) return;
    const shouldClearAllCache = isAllCacheSelected;
    setIsClearingCache(true);
    setCacheStatusMessage("");
    try {
      const response = await fetchJson<ClearCacheResponse>("/api/cache-status/clear", {
        method: "POST",
        body: JSON.stringify({ ids: selectedCacheItemIdsList }),
      });
      setCacheStatus(response.status);
      setSelectedCacheItemIds(new Set());
      setIsClearCacheConfirmOpen(false);
      if (response.cleared.some((id) => id === "global" || id === "libraries" || id === "index")) {
        onClearRuntimeCache();
      }
      if (shouldClearAllCache) {
        await onClearAllCache();
      }
      setCacheStatusMessage(`已清除 ${response.cleared.length} 项缓存。`);
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "清除缓存失败。");
    } finally {
      setIsClearingCache(false);
    }
  }, [
    isAllCacheSelected,
    onClearAllCache,
    onClearRuntimeCache,
    selectedCacheItemIdsList,
    selectedCacheItems.length,
  ]);

  const openCacheStatusDialog = useCallback(() => {
    setCacheStatusPage(1);
    setIsCacheStatusDialogOpen(true);
    void loadCacheStatus();
  }, [loadCacheStatus]);

  useEffect(() => {
    if (!isHomeViewVisible || hasLoadedCacheStatus || isCacheStatusLoading) return;
    void loadCacheStatus();
  }, [hasLoadedCacheStatus, isCacheStatusLoading, isHomeViewVisible, loadCacheStatus]);

  return {
    cacheStatus,
    cacheStatusItems,
    cacheStatusMessage,
    cacheStatusPageCount: cacheStatusPageState.pageCount,
    cacheStatusPageEnd: cacheStatusPageState.end,
    cacheStatusPageStart: cacheStatusPageState.start,
    closeCacheStatusDialog,
    closeClearCacheConfirm,
    confirmClearSelectedCache,
    isAllCacheSelected,
    isCacheStatusDialogOpen,
    isCacheStatusLoading,
    isClearCacheConfirmOpen,
    isClearingCache,
    loadCacheStatus,
    openCacheStatusDialog,
    pagedCacheStatusItems: cacheStatusPageState.items,
    requestClearSelectedCache,
    selectedCacheBytes,
    selectedCacheFiles,
    selectedCacheItemIds,
    selectedCacheItems,
    setCacheStatusPage,
    toggleAllCacheItems,
    toggleCacheItemSelection,
    visibleCacheStatusPage: cacheStatusPageState.visiblePage,
  };
}
