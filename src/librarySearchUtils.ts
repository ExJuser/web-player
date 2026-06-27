export const librarySearchResultPageSize = 24;

export function applyLibrarySearchResultLimit<T>(results: T[], limit?: number) {
  return typeof limit === "number" ? results.slice(0, limit) : results;
}

export function getVisibleLibrarySearchResults<T>(results: T[], visibleCount: number) {
  const safeVisibleCount = Math.max(0, Math.floor(visibleCount));
  const visibleResults = results.slice(0, safeVisibleCount);
  return {
    visibleResults,
    hasMoreResults: visibleResults.length < results.length,
  };
}
