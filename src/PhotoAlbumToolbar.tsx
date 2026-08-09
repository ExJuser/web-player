import { RefreshCw, Shuffle } from "lucide-react";

import { ControlSelect } from "./ControlSelect";
import type { PhotoAlbumSortDirection, PhotoAlbumSortMode } from "./playerTypes";

export type PhotoAlbumViewFilter = "all" | "favorites";

type PhotoAlbumToolbarProps = {
  filter: PhotoAlbumViewFilter;
  isLoading: boolean;
  message: string;
  sortDirection: PhotoAlbumSortDirection;
  sortDirectionOptions: Array<{ value: PhotoAlbumSortDirection; label: string }>;
  sortMode: PhotoAlbumSortMode;
  sortOptions: Array<{ value: PhotoAlbumSortMode; label: string }>;
  onFilterChange: (filter: PhotoAlbumViewFilter) => void;
  onRandomAlbum: () => void;
  onRefresh: () => void;
  onSortDirectionChange: (sortDirection: PhotoAlbumSortDirection) => void;
  onSortModeChange: (sortMode: PhotoAlbumSortMode) => void;
  randomDisabled: boolean;
};

export function PhotoAlbumToolbar({
  filter,
  isLoading,
  message,
  sortDirection,
  sortDirectionOptions,
  sortMode,
  sortOptions,
  onFilterChange,
  onRandomAlbum,
  onRefresh,
  onSortDirectionChange,
  onSortModeChange,
  randomDisabled,
}: PhotoAlbumToolbarProps) {
  return (
    <section className="photo-toolbar home-section">
      <div>
        <h2>本地相册</h2>
        <p>{message}</p>
      </div>
      <div className="photo-toolbar-actions">
        <div className="playlist-filter" role="group" aria-label="看图筛选">
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => onFilterChange("all")}
          >
            全部
          </button>
          <button
            type="button"
            className={filter === "favorites" ? "active" : ""}
            onClick={() => onFilterChange("favorites")}
          >
            收藏
          </button>
        </div>
        <ControlSelect
          label="排序"
          ariaLabel="看图排序"
          value={sortMode}
          options={sortOptions}
          onChange={onSortModeChange}
          className="photo-sort-control"
        />
        <ControlSelect
          label="顺序"
          ariaLabel="看图排序顺序"
          value={sortDirection}
          options={sortDirectionOptions}
          onChange={onSortDirectionChange}
          className="photo-sort-direction-control"
        />
        <button className="secondary-button" type="button" onClick={onRandomAlbum} disabled={randomDisabled}>
          <Shuffle size={16} />
          随机一本
        </button>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? "spin-icon" : undefined} />
          {isLoading ? "扫描中" : "刷新"}
        </button>
      </div>
    </section>
  );
}
