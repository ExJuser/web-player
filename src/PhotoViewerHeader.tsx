import { ArrowLeft, CheckCircle2, Images, RotateCcw, Star, Tags, Trash2 } from "lucide-react";

import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoViewerHeaderProps = {
  album: PhotoAlbum;
  currentPhoto: PhotoAlbumImage | null;
  isCoverCurrent: boolean;
  isFavorite: boolean;
  onBack: () => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onMarkCompleted: () => void;
  onResetProgress: () => void;
  onSetCover: (album: PhotoAlbum, image: PhotoAlbumImage) => void;
  onToggleFavorite: (album: PhotoAlbum) => void;
};

export function PhotoViewerHeader({
  album,
  currentPhoto,
  isCoverCurrent,
  isFavorite,
  onBack,
  onDeleteCurrentPhoto,
  onEditTags,
  onMarkCompleted,
  onResetProgress,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerHeaderProps) {
  return (
    <header className="photo-viewer-header">
      <button className="secondary-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        返回
      </button>
      <div className="photo-viewer-actions">
        <button
          className={`secondary-button ${isFavorite ? "active" : ""}`}
          type="button"
          onClick={() => onToggleFavorite(album)}
        >
          <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
          {isFavorite ? "已收藏" : "收藏"}
        </button>
        <button className="secondary-button" type="button" onClick={onMarkCompleted}>
          <CheckCircle2 size={16} />
          标记已读
        </button>
        <button className="secondary-button" type="button" onClick={onResetProgress}>
          <RotateCcw size={16} />
          重读
        </button>
        <button className="secondary-button" type="button" onClick={() => onEditTags(album)}>
          <Tags size={16} />
          标签
        </button>
        {currentPhoto ? (
          <button
            className={`secondary-button ${isCoverCurrent ? "active" : ""}`}
            type="button"
            onClick={() => onSetCover(album, currentPhoto)}
          >
            <Images size={16} />
            {isCoverCurrent ? "当前封面" : "设为封面"}
          </button>
        ) : null}
        <button
          className="danger-button photo-delete-button"
          type="button"
          onClick={onDeleteCurrentPhoto}
          disabled={!currentPhoto}
          title={currentPhoto ? "删除当前图片" : "当前没有可删除的图片"}
        >
          <Trash2 size={16} />
          删除
        </button>
      </div>
    </header>
  );
}
