import type { ReactNode, Ref } from "react";

type LibrarySearchResultsListProps = {
  className?: string;
  emptyTarget: string;
  hasMoreResults: boolean;
  isEmpty: boolean;
  loadMoreRef: Ref<HTMLDivElement>;
  results: ReactNode;
  resultsRef: Ref<HTMLDivElement>;
  totalCount: number;
  visibleCount: number;
  onLoadMore: () => void;
};

export function LibrarySearchResultsList({
  className = "",
  emptyTarget,
  hasMoreResults,
  isEmpty,
  loadMoreRef,
  results,
  resultsRef,
  totalCount,
  visibleCount,
  onLoadMore,
}: LibrarySearchResultsListProps) {
  if (totalCount > 0) {
    return (
      <div className={`home-compact-list library-search-results ${className}`.trim()} ref={resultsRef}>
        {results}
        {hasMoreResults ? (
          <div className="library-search-load-more" ref={loadMoreRef}>
            <span>
              已显示 {visibleCount} / {totalCount}
            </span>
            <button type="button" onClick={onLoadMore}>
              加载更多
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return isEmpty ? <div className="empty-list compact">没有找到匹配{emptyTarget}</div> : null;
}
