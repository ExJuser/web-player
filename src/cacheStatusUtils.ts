export const cacheStatusPageSize = 10;

export type CacheStatusItem = {
  id: string;
  label: string;
  path: string;
  bytes: number;
  files: number;
  updatedAt: number | null;
  memoryBytes?: number;
  memoryEntries?: number;
  error?: string;
  clearable?: boolean;
};

export type CacheStatus = {
  rootPath: string;
  diskBytes: number;
  memoryBytes: number;
  totalBytes: number;
  totalFiles: number;
  updatedAt: number | null;
  items: CacheStatusItem[];
};

export type ClearCacheResponse = {
  cleared: string[];
  status: CacheStatus;
};

export function getClearableCacheStatusItems(items: CacheStatusItem[]) {
  return items.filter((item) => item.clearable !== false);
}

export function getSelectedCacheStatusItems(items: CacheStatusItem[], selectedIds: ReadonlySet<string>) {
  return items.filter((item) => selectedIds.has(item.id));
}

export function getCacheStatusPageState(items: CacheStatusItem[], page: number, pageSize = cacheStatusPageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visiblePage = Math.min(Math.max(page, 1), pageCount);
  const startIndex = (visiblePage - 1) * pageSize;
  return {
    pageCount,
    visiblePage,
    items: items.slice(startIndex, startIndex + pageSize),
    start: items.length ? startIndex + 1 : 0,
    end: Math.min(visiblePage * pageSize, items.length),
  };
}

export function getAvailableCacheItemIds(items: CacheStatusItem[]) {
  return new Set(getClearableCacheStatusItems(items).map((item) => item.id));
}

export function toggleCacheItemSelection(previous: ReadonlySet<string>, id: string, checked: boolean) {
  const next = new Set(previous);
  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

export function toggleAllCacheItemSelection(previous: Set<string>, clearableItems: CacheStatusItem[]) {
  if (!clearableItems.length) return previous;
  const shouldSelectAll = !clearableItems.every((item) => previous.has(item.id));
  return shouldSelectAll ? new Set(clearableItems.map((item) => item.id)) : new Set<string>();
}
