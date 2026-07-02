import type { FocusEvent as ReactFocusEvent, ReactNode, Ref } from "react";

import { LibrarySearchFormPreview } from "./LibrarySearchFormPreview";
import { LibrarySearchResultsList } from "./LibrarySearchResultsList";

type PlayerLibrarySearchSectionProps = {
  answer: string;
  defaultStatus: string;
  disabled: boolean;
  emptyTarget: string;
  hasMoreResults: boolean;
  inputValue: string;
  isEmpty: boolean;
  isLoading: boolean;
  loadMoreRef: Ref<HTMLDivElement>;
  placeholder: string;
  previewResults: ReactNode;
  results: ReactNode;
  resultsRef: Ref<HTMLDivElement>;
  searchMode: string;
  shouldShowPreview: boolean;
  shouldShowStatus: boolean;
  statusMessage: string;
  totalCount: number;
  visibleCount: number;
  onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  onFocus: () => void;
  onInputChange: (value: string) => void;
  onLoadMore: () => void;
  onSubmit: () => void;
};

export function PlayerLibrarySearchSection({
  answer,
  defaultStatus,
  disabled,
  emptyTarget,
  hasMoreResults,
  inputValue,
  isEmpty,
  isLoading,
  loadMoreRef,
  placeholder,
  previewResults,
  results,
  resultsRef,
  searchMode,
  shouldShowPreview,
  shouldShowStatus,
  statusMessage,
  totalCount,
  visibleCount,
  onBlur,
  onFocus,
  onInputChange,
  onLoadMore,
  onSubmit,
}: PlayerLibrarySearchSectionProps) {
  return (
    <section className="player-library-search library-search-card" aria-label="播放器片库搜索">
      <LibrarySearchFormPreview
        ariaLabel="播放器片库搜索"
        disabled={disabled}
        formClassName="player-library-search-form"
        inputValue={inputValue}
        placeholder={placeholder}
        previewClassName="player-library-search-preview"
        previewHint="仅本地匹配"
        previewResults={previewResults}
        previewResultsClassName="player-library-search-preview-results"
        showPreview={shouldShowPreview}
        onBlur={onBlur}
        onFocus={onFocus}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
      />
      {shouldShowStatus ? (
        <div className={`library-search-status player-library-search-status ${searchMode}`}>
          {isLoading ? "搜索中..." : statusMessage || defaultStatus}
        </div>
      ) : null}
      {answer ? <div className="library-search-answer player-library-search-answer">{answer}</div> : null}
      <LibrarySearchResultsList
        className="player-library-search-results"
        emptyTarget={emptyTarget}
        hasMoreResults={hasMoreResults}
        isEmpty={isEmpty}
        loadMoreRef={loadMoreRef}
        results={results}
        resultsRef={resultsRef}
        totalCount={totalCount}
        visibleCount={visibleCount}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}
