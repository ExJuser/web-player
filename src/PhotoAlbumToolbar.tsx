import { RefreshCw } from "lucide-react";

import { ControlSelect } from "./ControlSelect";
import type { PhotoAlbumSortMode } from "./playerTypes";

export type PhotoAlbumViewFilter = "all" | "favorites";

type PhotoAlbumToolbarProps = {
  filter: PhotoAlbumViewFilter;
  isLoading: boolean;
  message: string;
  sortMode: PhotoAlbumSortMode;
  sortOptions: Array<{ value: PhotoAlbumSortMode; label: string }>;
  onFilterChange: (filter: PhotoAlbumViewFilter) => void;
  onRefresh: () => void;
  onSortModeChange: (sortMode: PhotoAlbumSortMode) => void;
};

export function PhotoAlbumToolbar({
  filter,
  isLoading,
  message,
  sortMode,
  sortOptions,
  onFilterChange,
  onRefresh,
  onSortModeChange,
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
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} className={isLoading ? "spin-icon" : undefined} />
          {isLoading ? "扫描中" : "刷新"}
        </button>
      </div>
    </section>
  );
}
