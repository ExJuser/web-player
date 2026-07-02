import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PhotoAlbumImage } from "./playerTypes";

type PhotoViewerStageProps = {
  currentIndex: number;
  currentPhoto: PhotoAlbumImage | null;
  currentPhotoUrl: string;
  imageCount: number;
  onMove: (delta: number) => void;
};

export function PhotoViewerStage({
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  imageCount,
  onMove,
}: PhotoViewerStageProps) {
  return (
    <div className="photo-stage">
      <button
        className="photo-nav-button previous"
        type="button"
        onClick={() => onMove(-1)}
        disabled={currentIndex <= 0}
        aria-label="上一张"
      >
        <ChevronLeft size={34} />
      </button>
      {currentPhoto && currentPhotoUrl ? (
        <img
          key={currentPhoto.id}
          src={currentPhotoUrl}
          alt={currentPhoto.name}
          decoding="async"
          loading="eager"
          draggable={false}
        />
      ) : (
        <div className="photo-empty-state">没有可显示的图片</div>
      )}
      <button
        className="photo-nav-button next"
        type="button"
        onClick={() => onMove(1)}
        disabled={currentIndex >= imageCount - 1}
        aria-label="下一张"
      >
        <ChevronRight size={34} />
      </button>
    </div>
  );
}
