import type { ReactNode } from "react";

import { PhotoAlbumEmptyState } from "./PhotoAlbumEmptyState";
import { PhotoAlbumPagination } from "./PhotoAlbumPagination";
import { PhotoAlbumSearchRow, type PhotoAlbumSearchResult } from "./PhotoAlbumSearchRow";
import { PhotoAlbumStats } from "./PhotoAlbumStats";
import { PhotoTagStats } from "./PhotoTagStats";
import { PhotoAlbumToolbar, type PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import { PhotoRootStatusCard } from "./PhotoRootStatusCard";
import type { PhotoAlbum, PhotoAlbumSortDirection, PhotoAlbumSortMode, PlayerMediaRootStatus } from "./playerTypes";

type PhotoDashboardSectionProps = {
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
  onPageChange: (page: number) => void;
  onRandomAlbum: () => void;
  onRefresh: () => void;
  onRenderAlbum: (album: PhotoAlbum) => ReactNode;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
  onSelectSearchResult: (album: PhotoAlbum) => void;
  onSelectTag: (key: string | null) => void;
  onSortDirectionChange: (sortDirection: PhotoAlbumSortDirection) => void;
  onSortModeChange: (sortMode: PhotoAlbumSortMode) => void;
};

export function PhotoDashboardSection({
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
  onPageChange,
  onRandomAlbum,
  onRefresh,
  onRenderAlbum,
  onSearchChange,
  onSearchClear,
  onSelectSearchResult,
  onSelectTag,
  onSortDirectionChange,
  onSortModeChange,
}: PhotoDashboardSectionProps) {
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

      <PhotoAlbumSearchRow query={searchQuery} resultCount={searchResultCount} results={searchResults} onChange={onSearchChange} onClear={onSearchClear} onSelect={onSelectSearchResult} />

      <PhotoAlbumStats stats={stats} />

      <PhotoTagStats {...tagStats} selectedTagKey={tagFilterKey} onSelectTag={onSelectTag} />

      <PhotoRootStatusCard statuses={photoRootStatuses} />

      {totalVisibleAlbums ? (
        <>
          <section className={`photo-album-grid ${isGridCompact ? "photo-album-grid-compact" : ""}`.trim()}>
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
          searchQuery={searchQuery}
          onChooseDirectory={onChooseDirectory}
        />
      )}
    </section>
  );
}
