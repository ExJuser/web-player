import type { ReactNode } from "react";

import { PhotoAlbumEmptyState } from "./PhotoAlbumEmptyState";
import { PhotoAlbumPagination } from "./PhotoAlbumPagination";
import { PhotoAlbumSearchRow } from "./PhotoAlbumSearchRow";
import { PhotoAlbumStats } from "./PhotoAlbumStats";
import { PhotoAlbumToolbar, type PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";
import { PhotoRootStatusCard } from "./PhotoRootStatusCard";
import type { PhotoAlbum, PhotoAlbumSortMode, PlayerMediaRootStatus } from "./playerTypes";

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
  sortMode: PhotoAlbumSortMode;
  sortOptions: Array<{ value: PhotoAlbumSortMode; label: string }>;
  start: number;
  stats: {
    completed: number;
    favorites: number;
    images: number;
    total: number;
  };
  totalVisibleAlbums: number;
  onChooseDirectory: () => void;
  onFilterChange: (filter: PhotoAlbumViewFilter) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onRefresh: () => void;
  onRenderAlbum: (album: PhotoAlbum) => ReactNode;
  onSearchChange: (query: string) => void;
  onSearchClear: () => void;
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
  sortMode,
  sortOptions,
  start,
  stats,
  totalVisibleAlbums,
  onChooseDirectory,
  onFilterChange,
  onNextPage,
  onPreviousPage,
  onRefresh,
  onRenderAlbum,
  onSearchChange,
  onSearchClear,
  onSortModeChange,
}: PhotoDashboardSectionProps) {
  return (
    <section className="photo-dashboard" aria-label="看图">
      <PhotoAlbumToolbar
        filter={filter}
        isLoading={isLoading}
        message={message}
        sortMode={sortMode}
        sortOptions={sortOptions}
        onFilterChange={onFilterChange}
        onRefresh={onRefresh}
        onSortModeChange={onSortModeChange}
      />

      <PhotoAlbumSearchRow query={searchQuery} onChange={onSearchChange} onClear={onSearchClear} />

      <PhotoAlbumStats stats={stats} />

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
            onNext={onNextPage}
            onPrevious={onPreviousPage}
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
