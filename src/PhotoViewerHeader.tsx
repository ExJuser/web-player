import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Images, Maximize2, RotateCcw, Star, Tags, Trash2 } from "lucide-react";

import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoViewerHeaderProps = {
  album: PhotoAlbum;
  currentPhoto: PhotoAlbumImage | null;
  isCoverCurrent: boolean;
  isFavorite: boolean;
  onBack: () => void;
  onDeleteAlbum: (album: PhotoAlbum) => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onEnterImmersive: () => void;
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
  onDeleteAlbum,
  onDeleteCurrentPhoto,
  onEditTags,
  onEnterImmersive,
  onMarkCompleted,
  onResetProgress,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerHeaderProps) {
  const [isDeleteMenuOpen, setIsDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDeleteMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!deleteMenuRef.current?.contains(event.target as Node)) setIsDeleteMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDeleteMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDeleteMenuOpen]);

  return (
    <header className="photo-viewer-header">
      <button className="secondary-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} />
        返回
      </button>
      <div className="photo-viewer-actions">
        <button className="secondary-button" type="button" onClick={onEnterImmersive}>
          <Maximize2 size={16} />
          沉浸阅读
        </button>
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
        <div className="photo-delete-menu" ref={deleteMenuRef}>
          <button
            aria-expanded={isDeleteMenuOpen}
            aria-haspopup="menu"
            className="danger-button photo-delete-button"
            type="button"
            onClick={() => setIsDeleteMenuOpen((isOpen) => !isOpen)}
            title="删除当前图片或整个图集"
          >
            <Trash2 size={16} />
            删除
            <ChevronDown className="photo-delete-chevron" size={14} />
          </button>
          {isDeleteMenuOpen ? (
            <div className="photo-delete-options" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={!currentPhoto}
                onClick={() => {
                  setIsDeleteMenuOpen(false);
                  onDeleteCurrentPhoto();
                }}
              >
                <Trash2 size={15} />
                删除当前图片
              </button>
              <button
                className="delete-album-option"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsDeleteMenuOpen(false);
                  onDeleteAlbum(album);
                }}
              >
                <Images size={15} />
                删除整个图集
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
