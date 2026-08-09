import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import {
  cachePhotoDecodeFailure,
  formatPhotoFileSize,
  getPhotoDecodeFailureMessage,
  hasCachedPhotoDecodeFailure,
  isLargePhotoFile,
} from "./photoFileStatus";
import { loadPhotoPreview, shouldCreatePhotoPreview } from "./photoPreviewCache";
import type { PhotoAlbumImage, PhotoSingleFitMode } from "./playerTypes";

type PhotoViewerStageProps = {
  currentIndex: number;
  currentPhoto: PhotoAlbumImage | null;
  currentPhotoUrl: string;
  imageCount: number;
  zoom: number;
  fitMode: PhotoSingleFitMode;
  onZoomChange: (zoom: number) => void;
  onFitModeChange: (fitMode: PhotoSingleFitMode) => void;
  onMove: (delta: number) => void;
};

const minPhotoZoom = 1;
const maxPhotoZoom = 5;
const photoZoomStep = 0.25;
const photoDoubleClickZoom = 2;
const photoOriginalLoadDelay = 450;
const photoDoubleTapDelay = 300;
const photoTapMoveTolerance = 12;
type PhotoPan = { x: number; y: number };

export function PhotoViewerStage({
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  imageCount,
  zoom,
  fitMode,
  onZoomChange,
  onFitModeChange,
  onMove,
}: PhotoViewerStageProps) {
  const [pan, setPan] = useState<PhotoPan>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isPreviewPending, setIsPreviewPending] = useState(false);
  const [shouldLoadOriginal, setShouldLoadOriginal] = useState(true);
  const [isOriginalReady, setIsOriginalReady] = useState(false);
  const [originalLoadFailed, setOriginalLoadFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number; pan: PhotoPan } | null>(null);
  const touchTapRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastTouchZoomTimeRef = useRef(0);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragStartRef.current = null;
  }, [currentPhoto?.id]);

  useEffect(() => {
    let isCancelled = false;
    let nextPreviewUrl = "";
    setPreviewUrl("");
    setIsOriginalReady(false);
    setOriginalLoadFailed(currentPhoto ? hasCachedPhotoDecodeFailure(currentPhoto) : false);

    if (!currentPhoto || !currentPhotoUrl || !shouldCreatePhotoPreview(currentPhoto)) {
      setIsPreviewPending(false);
      setShouldLoadOriginal(true);
      return;
    }

    setIsPreviewPending(true);
    setShouldLoadOriginal(false);
    void loadPhotoPreview(currentPhoto, currentPhotoUrl).then((preview) => {
      if (isCancelled) return;
      setIsPreviewPending(false);
      if (!preview) {
        setShouldLoadOriginal(true);
        return;
      }
      nextPreviewUrl = URL.createObjectURL(preview);
      setPreviewUrl(nextPreviewUrl);
    });

    return () => {
      isCancelled = true;
      if (nextPreviewUrl) URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [currentPhoto, currentPhotoUrl]);

  const isLargeFile = Boolean(currentPhoto && isLargePhotoFile(currentPhoto));
  const decodeFailureMessage = currentPhoto ? getPhotoDecodeFailureMessage(currentPhoto) : "";

  useEffect(() => {
    if (!previewUrl || shouldLoadOriginal) return;
    const timeout = window.setTimeout(() => setShouldLoadOriginal(true), photoOriginalLoadDelay);
    return () => window.clearTimeout(timeout);
  }, [previewUrl, shouldLoadOriginal]);

  useEffect(() => {
    if (zoom > minPhotoZoom && previewUrl) setShouldLoadOriginal(true);
  }, [previewUrl, zoom]);

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

  const applyFitMode = (image: HTMLImageElement) => {
    if (fitMode === "custom") return;
    const stage = stageRef.current;
    if (!stage || !image.naturalWidth || !image.naturalHeight) return;
    const bounds = stage.getBoundingClientRect();
    const containedScale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
    const nextZoom = fitMode === "width"
      ? bounds.width / (image.naturalWidth * containedScale)
      : fitMode === "original"
        ? 1 / containedScale
        : minPhotoZoom;
    const normalizedZoom = Math.min(maxPhotoZoom, Math.max(minPhotoZoom, Number(nextZoom.toFixed(2))));
    setPan({ x: 0, y: 0 });
    onZoomChange(normalizedZoom);
  };

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete) applyFitMode(image);
  }, [fitMode, currentPhoto?.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const nextPan = clampPan(pan, zoom, stage);
      if (nextPan.x !== pan.x || nextPan.y !== pan.y) setPan(nextPan);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [pan, zoom]);

  const zoomAtPoint = (nextZoom: number, clientX: number, clientY: number, stage: HTMLDivElement) => {
    if (nextZoom === zoom) return;
    const bounds = stage.getBoundingClientRect();
    const pointerX = clientX - bounds.left - bounds.width / 2;
    const pointerY = clientY - bounds.top - bounds.height / 2;
    const zoomRatio = nextZoom / zoom;
    const nextPan = nextZoom === minPhotoZoom
      ? { x: 0, y: 0 }
      : {
          x: pointerX - (pointerX - pan.x) * zoomRatio,
          y: pointerY - (pointerY - pan.y) * zoomRatio,
        };
    setPan(clampPan(nextPan, nextZoom, stage));
    onFitModeChange("custom");
    onZoomChange(nextZoom);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!currentPhotoUrl || event.deltaY === 0) return;
    event.preventDefault();
    const nextZoom = Math.min(
      maxPhotoZoom,
      Math.max(minPhotoZoom, zoom + (event.deltaY < 0 ? photoZoomStep : -photoZoomStep)),
    );
    zoomAtPoint(nextZoom, event.clientX, event.clientY, event.currentTarget);
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!currentPhotoUrl || (event.target as Element).closest("button")) return;
    if (Date.now() - lastTouchZoomTimeRef.current < photoDoubleTapDelay) return;
    zoomAtPoint(zoom > minPhotoZoom ? minPhotoZoom : photoDoubleClickZoom, event.clientX, event.clientY, event.currentTarget);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    if (event.pointerType === "touch") {
      touchTapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
    if (zoom <= minPhotoZoom) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const touchTap = touchTapRef.current;
    if (touchTap?.pointerId === event.pointerId && (
      Math.abs(event.clientX - touchTap.x) > photoTapMoveTolerance
      || Math.abs(event.clientY - touchTap.y) > photoTapMoveTolerance
    )) {
      touchTapRef.current = null;
    }
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setPan(clampPan({
      x: dragStart.pan.x + event.clientX - dragStart.x,
      y: dragStart.pan.y + event.clientY - dragStart.y,
    }, zoom, event.currentTarget));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragStartRef.current = null;
      setIsDragging(false);
    }
    const touchTap = touchTapRef.current;
    touchTapRef.current = null;
    if (event.type === "pointercancel" || touchTap?.pointerId !== event.pointerId) return;
    const now = Date.now();
    const lastTap = lastTouchTapRef.current;
    if (lastTap && now - lastTap.time <= photoDoubleTapDelay
      && Math.abs(event.clientX - lastTap.x) <= photoTapMoveTolerance
      && Math.abs(event.clientY - lastTap.y) <= photoTapMoveTolerance) {
      lastTouchTapRef.current = null;
      lastTouchZoomTimeRef.current = now;
      zoomAtPoint(zoom > minPhotoZoom ? minPhotoZoom : photoDoubleClickZoom, event.clientX, event.clientY, event.currentTarget);
      return;
    }
    lastTouchTapRef.current = { time: now, x: event.clientX, y: event.clientY };
  };

  return (
    <div
      ref={stageRef}
      className={`photo-stage ${zoom > minPhotoZoom ? "can-pan" : ""} ${isDragging ? "dragging" : ""}`}
      onDoubleClick={handleDoubleClick}
      onPointerCancel={stopDragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onWheel={handleWheel}
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
        <div className="photo-stage-image">
          {previewUrl ? (
            <img
              ref={isOriginalReady ? undefined : imageRef}
              className="photo-stage-preview"
              src={previewUrl}
              alt={currentPhoto.name}
              decoding="async"
              draggable={false}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            />
          ) : null}
          {shouldLoadOriginal && !originalLoadFailed ? (
            <img
              ref={imageRef}
              className={`photo-stage-original ${isOriginalReady ? "ready" : ""}`}
              key={currentPhoto.id}
              src={currentPhotoUrl}
              alt={currentPhoto.name}
              decoding="async"
              loading="eager"
              draggable={false}
              onLoad={(event) => {
                setIsOriginalReady(true);
                applyFitMode(event.currentTarget);
              }}
              onError={() => {
                cachePhotoDecodeFailure(currentPhoto);
                setOriginalLoadFailed(true);
              }}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            />
          ) : null}
          {isPreviewPending ? (
            <span className="photo-load-status"><LoaderCircle size={15} className="spin-icon" />{isLargeFile ? `超大文件（${formatPhotoFileSize(currentPhoto.size)}），正在生成预览` : "正在生成预览"}</span>
          ) : previewUrl && shouldLoadOriginal && !isOriginalReady && !originalLoadFailed ? (
            <span className="photo-load-status"><LoaderCircle size={15} className="spin-icon" />{isLargeFile ? `超大文件（${formatPhotoFileSize(currentPhoto.size)}），高清图可能需要较长时间` : "正在加载高清图"}</span>
          ) : originalLoadFailed && previewUrl ? (
            <span className="photo-load-status error">{decodeFailureMessage}，已保留预览</span>
          ) : originalLoadFailed ? (
            <div className="photo-file-error" role="alert">
              <strong>无法显示图片</strong>
              <span>{decodeFailureMessage}</span>
              <small>{currentPhoto.name}</small>
            </div>
          ) : isLargeFile && !isOriginalReady ? (
            <span className="photo-load-status warning"><LoaderCircle size={15} className="spin-icon" />超大文件（{formatPhotoFileSize(currentPhoto.size)}），加载可能需要较长时间</span>
          ) : null}
        </div>
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
