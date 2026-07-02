import type { FocusEvent as ReactFocusEvent, ReactNode, Ref } from "react";

import { LibrarySearchFormPreview } from "./LibrarySearchFormPreview";
import { LibrarySearchResultsList } from "./LibrarySearchResultsList";

type HomeLibrarySearchSectionProps = {
  answer: string;
  defaultStatus: string;
  disabled: boolean;
  emptyTarget: string;
  hasMoreResults: boolean;
  headerModeLabel: string;
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

export function HomeLibrarySearchSection({
  answer,
  defaultStatus,
  disabled,
  emptyTarget,
  hasMoreResults,
  headerModeLabel,
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
}: HomeLibrarySearchSectionProps) {
  return (
    <section className="home-section library-search-card">
      <div className="home-section-header">
        <h2>片库搜索</h2>
        <span>{headerModeLabel}</span>
      </div>
      <LibrarySearchFormPreview
        ariaLabel="片库搜索"
        disabled={disabled}
        inputValue={inputValue}
        placeholder={placeholder}
        previewHint="仅本地匹配，不调用 AI"
        previewResults={previewResults}
        showPreview={shouldShowPreview}
        onBlur={onBlur}
        onFocus={onFocus}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
      />
      {shouldShowStatus ? (
        <div className={`library-search-status ${searchMode}`}>
          {isLoading ? "搜索中..." : statusMessage || defaultStatus}
        </div>
      ) : null}
      {answer ? <div className="library-search-answer">{answer}</div> : null}
      <LibrarySearchResultsList
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
