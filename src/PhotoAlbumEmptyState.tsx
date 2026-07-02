import { FolderOpen, Images } from "lucide-react";

import type { PhotoAlbumViewFilter } from "./PhotoAlbumToolbar";

type PhotoAlbumEmptyStateProps = {
  filter: PhotoAlbumViewFilter;
  isLoading: boolean;
  searchQuery: string;
  onChooseDirectory: () => void;
};

export function PhotoAlbumEmptyState({
  filter,
  isLoading,
  searchQuery,
  onChooseDirectory,
}: PhotoAlbumEmptyStateProps) {
  return (
    <section className="home-section photo-empty-state">
      <Images size={42} />
      <h2>{isLoading ? "正在扫描看图文件夹" : "还没有可显示的图集"}</h2>
      <p>
        {searchQuery.trim()
          ? "没有匹配当前搜索的图集。"
          : filter === "favorites"
            ? "收藏图集后会出现在这里。"
            : "手动选择文件夹后，会把其中包含图片的文件夹识别为图集。"}
      </p>
      <button className="primary-button" type="button" onClick={onChooseDirectory} disabled={isLoading}>
        <FolderOpen size={18} />
        {isLoading ? "扫描中" : "选择看图文件夹"}
      </button>
    </section>
  );
}
