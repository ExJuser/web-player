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
  type CacheStatusItem,
  type ClearCacheResponse,
} from "./cacheStatusUtils";

type UseCacheStatusDialogParams = {
  isHomeViewVisible: boolean;
  getClientCacheItems: () => CacheStatusItem[];
  onClearClientCache: (ids: string[]) => void;
  onClearRuntimeCache: () => void;
};

export function useCacheStatusDialog({
  isHomeViewVisible,
  getClientCacheItems,
  onClearClientCache,
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
      const clientItems = getClientCacheItems();
      const clientMemoryBytes = clientItems.reduce(
        (sum, item) => sum + item.bytes + (item.memoryBytes ?? 0),
        0,
      );
      setCacheStatus({
        ...status,
        diskBytes: status.diskBytes ?? status.totalBytes,
        memoryBytes: (status.memoryBytes ?? 0) + clientMemoryBytes,
        totalBytes: status.totalBytes + clientMemoryBytes,
        totalFiles: status.totalFiles + clientItems.reduce((sum, item) => sum + item.files, 0),
        updatedAt: Math.max(status.updatedAt ?? 0, ...clientItems.map((item) => item.updatedAt ?? 0)) || null,
        items: [...status.items, ...clientItems],
      });
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "读取缓存状态失败。");
    } finally {
      setHasLoadedCacheStatus(true);
      setIsCacheStatusLoading(false);
    }
  }, [getClientCacheItems]);

  const cacheStatusItems = cacheStatus?.items ?? [];
  const clearableCacheStatusItems = useMemo(() => getClearableCacheStatusItems(cacheStatusItems), [cacheStatusItems]);
  const selectedCacheItems = useMemo(
    () => getSelectedCacheStatusItems(clearableCacheStatusItems, selectedCacheItemIds),
    [clearableCacheStatusItems, selectedCacheItemIds],
  );
  const selectedCacheItemIdsList = useMemo(() => selectedCacheItems.map((item) => item.id), [selectedCacheItems]);
  const selectedCacheBytes = selectedCacheItems.reduce(
    (sum, item) => sum + item.bytes + (item.memoryBytes ?? 0),
    0,
  );
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
    setIsClearingCache(true);
    setCacheStatusMessage("");
    try {
      const clientIds = selectedCacheItemIdsList.filter((id) => id.startsWith("photo-runtime-"));
      const serverIds = selectedCacheItemIdsList.filter((id) => !id.startsWith("photo-runtime-"));
      let clearedServerIds: string[] = [];
      if (serverIds.length) {
        const response = await fetchJson<ClearCacheResponse>("/api/cache-status/clear", {
          method: "POST",
          body: JSON.stringify({ ids: serverIds }),
        });
        clearedServerIds = response.cleared;
      }
      onClearClientCache(clientIds);
      setSelectedCacheItemIds(new Set());
      setIsClearCacheConfirmOpen(false);
      if (clearedServerIds.some((id) => id === "global" || id === "libraries" || id === "index")) {
        onClearRuntimeCache();
      }
      await loadCacheStatus();
      setCacheStatusMessage(`已清除 ${clearedServerIds.length + clientIds.length} 项缓存。`);
    } catch (error) {
      setCacheStatusMessage(error instanceof Error ? error.message : "清除缓存失败。");
    } finally {
      setIsClearingCache(false);
    }
  }, [
    loadCacheStatus,
    onClearClientCache,
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
