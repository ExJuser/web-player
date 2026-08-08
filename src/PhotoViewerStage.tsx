import { useEffect, useState, type WheelEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { PhotoAlbumImage } from "./playerTypes";

type PhotoViewerStageProps = {
  currentIndex: number;
  currentPhoto: PhotoAlbumImage | null;
  currentPhotoUrl: string;
  imageCount: number;
  onMove: (delta: number) => void;
};

const minPhotoZoom = 1;
const maxPhotoZoom = 5;
const photoZoomStep = 0.25;

export function PhotoViewerStage({
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  imageCount,
  onMove,
}: PhotoViewerStageProps) {
  const [zoom, setZoom] = useState(minPhotoZoom);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");

  useEffect(() => {
    setZoom(minPhotoZoom);
    setZoomOrigin("50% 50%");
  }, [currentPhoto?.id]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!currentPhotoUrl || event.deltaY === 0) return;
    event.preventDefault();
    const nextZoom = Math.min(
      maxPhotoZoom,
      Math.max(minPhotoZoom, zoom + (event.deltaY < 0 ? photoZoomStep : -photoZoomStep)),
    );
    if (nextZoom === zoom) return;
    if (nextZoom > zoom) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      setZoomOrigin(`${x}% ${y}%`);
    } else if (nextZoom === minPhotoZoom) {
      setZoomOrigin("50% 50%");
    }
    setZoom(nextZoom);
  };

  return (
    <div
      className="photo-stage"
      onWheel={handleWheel}
      title="滚动鼠标滚轮放大或缩小图片"
    >
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
          style={{ transform: `scale(${zoom})`, transformOrigin: zoomOrigin }}
        />
      ) : (
        <div className="photo-empty-state">没有可显示的图片</div>
      )}
      {zoom > minPhotoZoom ? <span className="photo-zoom-indicator">{Math.round(zoom * 100)}%</span> : null}
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
