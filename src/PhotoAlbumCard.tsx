import { Star, Tags, Trash2 } from "lucide-react";

import type { PhotoAlbum } from "./playerTypes";

type PhotoAlbumCardProps = {
  album: PhotoAlbum;
  coverImageUrl: string;
  progressLabel: string;
  progressPercent: number;
  isFavorite: boolean;
  tags: string[];
  metaLabel: string;
  hasProgress: boolean;
  onOpen: (album: PhotoAlbum, options?: { fromBeginning?: boolean }) => void;
  onToggleFavorite: (album: PhotoAlbum) => void;
  onEditTags: (album: PhotoAlbum) => void;
  onDelete: (album: PhotoAlbum) => void;
};

export function PhotoAlbumCard({
  album,
  coverImageUrl,
  progressLabel,
  progressPercent,
  isFavorite,
  tags,
  metaLabel,
  hasProgress,
  onOpen,
  onToggleFavorite,
  onEditTags,
  onDelete,
}: PhotoAlbumCardProps) {
  return (
    <article className="photo-album-card">
      <button className="photo-album-cover" type="button" onClick={() => onOpen(album)} title={album.relativePath || album.title}>
        {coverImageUrl ? <img src={coverImageUrl} alt="" loading="lazy" draggable={false} /> : null}
        <span className="photo-album-count">{album.imageCount} 张</span>
      </button>
      <div className="photo-album-copy">
        <div className="photo-album-title-row">
          <button type="button" onClick={() => onOpen(album)} title={album.title}>
            {album.title}
          </button>
          <button
            className={`icon-button photo-favorite-button ${isFavorite ? "active" : ""}`}
            type="button"
            onClick={() => onToggleFavorite(album)}
            title={isFavorite ? "取消收藏" : "收藏图集"}
            aria-label={isFavorite ? "取消收藏" : "收藏图集"}
          >
            <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>
        <span>
          {album.mediaRootLabel} · {album.relativePath || "根目录"}
        </span>
        {tags.length ? (
          <div className="photo-album-tags" aria-label="图集标签">
            {tags.map((tag) => (
              <span className="tag-chip" key={`${album.id}-${tag}`}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <span>{metaLabel}</span>
        <div className="photo-album-footer">
          <div className="home-progress" aria-label={progressLabel}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="photo-album-actions">
            <button className="secondary-button" type="button" onClick={() => onOpen(album)}>
              打开
            </button>
            {hasProgress ? (
              <button className="secondary-button" type="button" onClick={() => onOpen(album, { fromBeginning: true })}>
                从头
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => onEditTags(album)}>
              <Tags size={16} />
              标签
            </button>
            <button className="danger-button photo-album-delete-button" type="button" onClick={() => onDelete(album)} title="删除整个图集">
              <Trash2 size={16} />
              删除
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
