import { useEffect, useRef, type ReactNode } from "react";

import { PhotoAlbumEmptyState } from "./PhotoAlbumEmptyState";
import { PhotoAlbumPagination } from "./PhotoAlbumPagination";
import { PhotoAlbumSearchRow, type PhotoAlbumSearchResult } from "./PhotoAlbumSearchRow";
import { PhotoAlbumStats } from "./PhotoAlbumStats";
import { PhotoTagStats } from "./PhotoTagStats";
import { PhotoAlbumToolbar, type PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import { PhotoRootStatusCard } from "./PhotoRootStatusCard";
import type { PhotoAlbum, PhotoAlbumSortDirection, PhotoAlbumSortMode, PlayerMediaRootStatus } from "./playerTypes";

type PhotoDashboardSectionProps = {
  appliedSearchQuery: string;
  currentPage: number;
  end: number;
  filter: PhotoAlbumViewFilter;
  isGridCompact: boolean;
  isLoading: boolean;
  message: string;
  pageCount: number;
  pagedPhotoAlbums: PhotoAlbum[];
  photoRootStatuses: PlayerMediaRootStatus[];
  searchQuery: string;
  searchResultCount: number;
  searchResults: PhotoAlbumSearchResult[];
  sortDirection: PhotoAlbumSortDirection;
  sortDirectionOptions: Array<{ value: PhotoAlbumSortDirection; label: string }>;
  sortMode: PhotoAlbumSortMode;
  sortOptions: Array<{ value: PhotoAlbumSortMode; label: string }>;
  start: number;
  stats: {
    completed: number;
    favorites: number;
    images: number;
    total: number;
  };
  tagStats: {
    coverage: number;
    taggedAlbums: number;
    tags: Array<{ key: string; label: string; albumCount: number }>;
    totalTags: number;
  };
  tagFilterKey: string | null;
  totalVisibleAlbums: number;
  onChooseDirectory: () => void;
  onFilterChange: (filter: PhotoAlbumViewFilter) => void;
  onGridColumnCountChange: (columnCount: number) => void;
  onPageChange: (page: number) => void;
  onRandomAlbum: () => void;
  onRefresh: () => void;
  onRenderAlbum: (album: PhotoAlbum) => ReactNode;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
  onSearchSubmit: () => void;
  onSelectSearchResult: (album: PhotoAlbum) => void;
  onSelectTag: (key: string | null) => void;
  onSortDirectionChange: (sortDirection: PhotoAlbumSortDirection) => void;
  onSortModeChange: (sortMode: PhotoAlbumSortMode) => void;
};

export function PhotoDashboardSection({
  appliedSearchQuery,
  currentPage,
  end,
  filter,
  isGridCompact,
  isLoading,
  message,
  pageCount,
  pagedPhotoAlbums,
  photoRootStatuses,
  searchQuery,
  searchResultCount,
  searchResults,
  sortDirection,
  sortDirectionOptions,
  sortMode,
  sortOptions,
  start,
  stats,
  tagStats,
  tagFilterKey,
  totalVisibleAlbums,
  onChooseDirectory,
  onFilterChange,
  onGridColumnCountChange,
  onPageChange,
  onRandomAlbum,
  onRefresh,
  onRenderAlbum,
  onSearchChange,
  onSearchClear,
  onSearchSubmit,
  onSelectSearchResult,
  onSelectTag,
  onSortDirectionChange,
  onSortModeChange,
}: PhotoDashboardSectionProps) {
  const albumGridRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const grid = albumGridRef.current;
    if (!grid) return;

    const updateGridLayout = () => {
      const styles = window.getComputedStyle(grid);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const width = grid.getBoundingClientRect().width;
      const columnCount = Math.max(1, Math.floor((width + gap) / (390 + gap)));
      const cardWidthPercent = 100 / columnCount;
      const cardGapOffset = gap * (columnCount - 1) / columnCount;
      grid.style.setProperty("--photo-album-card-width", `calc(${cardWidthPercent}% - ${cardGapOffset}px)`);
      onGridColumnCountChange(columnCount);
    };

    updateGridLayout();
    const observer = new ResizeObserver(updateGridLayout);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [onGridColumnCountChange]);

  return (
    <section className="photo-dashboard" aria-label="看图">
      <PhotoAlbumToolbar
        filter={filter}
        isLoading={isLoading}
        message={message}
        sortDirection={sortDirection}
        sortDirectionOptions={sortDirectionOptions}
        sortMode={sortMode}
        sortOptions={sortOptions}
        onFilterChange={onFilterChange}
        onRandomAlbum={onRandomAlbum}
        onRefresh={onRefresh}
        onSortDirectionChange={onSortDirectionChange}
        onSortModeChange={onSortModeChange}
        randomDisabled={isLoading || !totalVisibleAlbums}
      />

      <PhotoAlbumSearchRow query={searchQuery} resultCount={searchResultCount} results={searchResults} onChange={onSearchChange} onClear={onSearchClear} onSubmit={onSearchSubmit} onSelect={onSelectSearchResult} />

      <PhotoAlbumStats stats={stats} />

      <PhotoTagStats {...tagStats} selectedTagKey={tagFilterKey} onSelectTag={onSelectTag} />

      <PhotoRootStatusCard statuses={photoRootStatuses} />

      {totalVisibleAlbums ? (
        <>
          <section ref={albumGridRef} className={`photo-album-grid ${isGridCompact ? "photo-album-grid-compact" : ""}`.trim()}>
            {pagedPhotoAlbums.map(onRenderAlbum)}
          </section>
          <PhotoAlbumPagination
            currentPage={currentPage}
            end={end}
            pageCount={pageCount}
            start={start}
            total={totalVisibleAlbums}
            onPageChange={onPageChange}
          />
        </>
      ) : (
        <PhotoAlbumEmptyState
          filter={filter}
          isLoading={isLoading}
          searchQuery={appliedSearchQuery}
          onChooseDirectory={onChooseDirectory}
        />
      )}
    </section>
  );
}
