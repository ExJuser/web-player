import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
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
type PhotoPan = { x: number; y: number };

export function PhotoViewerStage({
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  imageCount,
  onMove,
}: PhotoViewerStageProps) {
  const [zoom, setZoom] = useState(minPhotoZoom);
  const [pan, setPan] = useState<PhotoPan>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number; pan: PhotoPan } | null>(null);

  useEffect(() => {
    setZoom(minPhotoZoom);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragStartRef.current = null;
  }, [currentPhoto?.id]);

  const clampPan = (nextPan: PhotoPan, nextZoom: number, stage: HTMLDivElement): PhotoPan => {
    const image = imageRef.current;
    const stageBounds = stage.getBoundingClientRect();
    if (!image?.naturalWidth || !image.naturalHeight || !stageBounds.width || !stageBounds.height) {
      return nextZoom === minPhotoZoom ? { x: 0, y: 0 } : nextPan;
    }
    const containedScale = Math.min(stageBounds.width / image.naturalWidth, stageBounds.height / image.naturalHeight);
    const maxX = Math.max(0, (image.naturalWidth * containedScale * nextZoom - stageBounds.width) / 2);
    const maxY = Math.max(0, (image.naturalHeight * containedScale * nextZoom - stageBounds.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    };
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!currentPhotoUrl || event.deltaY === 0) return;
    event.preventDefault();
    const nextZoom = Math.min(
      maxPhotoZoom,
      Math.max(minPhotoZoom, zoom + (event.deltaY < 0 ? photoZoomStep : -photoZoomStep)),
    );
    if (nextZoom === zoom) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left - bounds.width / 2;
    const pointerY = event.clientY - bounds.top - bounds.height / 2;
    const zoomRatio = nextZoom / zoom;
    const nextPan = nextZoom === minPhotoZoom
      ? { x: 0, y: 0 }
      : {
          x: pointerX - (pointerX - pan.x) * zoomRatio,
          y: pointerY - (pointerY - pan.y) * zoomRatio,
        };
    setPan(clampPan(nextPan, nextZoom, event.currentTarget));
    setZoom(nextZoom);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= minPhotoZoom || event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setPan(clampPan({
      x: dragStart.pan.x + event.clientX - dragStart.x,
      y: dragStart.pan.y + event.clientY - dragStart.y,
    }, zoom, event.currentTarget));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartRef.current = null;
    setIsDragging(false);
  };

  return (
    <div
      className={`photo-stage ${zoom > minPhotoZoom ? "can-pan" : ""} ${isDragging ? "dragging" : ""}`}
      onPointerCancel={stopDragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onWheel={handleWheel}
      title="滚动鼠标滚轮缩放图片，放大后按住鼠标拖动"
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
          ref={imageRef}
          key={currentPhoto.id}
          src={currentPhotoUrl}
          alt={currentPhoto.name}
          decoding="async"
          loading="eager"
          draggable={false}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
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
