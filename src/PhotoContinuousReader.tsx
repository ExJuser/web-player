import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoContinuousReaderProps = {
  album: PhotoAlbum;
  currentIndex: number;
  getImageUrl: (image: PhotoAlbumImage) => string;
  onCurrentImageChange: (image: PhotoAlbumImage) => void;
};

const minContinuousZoom = 0.5;
const maxContinuousZoom = 2;
const continuousZoomStep = 0.1;

export function PhotoContinuousReader({
  album,
  currentIndex,
  getImageUrl,
  onCurrentImageChange,
}: PhotoContinuousReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const visibleRatiosRef = useRef(new Map<number, number>());
  const currentIndexRef = useRef(currentIndex);
  const onCurrentImageChangeRef = useRef(onCurrentImageChange);
  const viewportAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);

  currentIndexRef.current = currentIndex;
  onCurrentImageChangeRef.current = onCurrentImageChange;

  useLayoutEffect(() => {
    visibleRatiosRef.current.clear();
    const container = containerRef.current;
    const page = pageRefs.current.get(currentIndexRef.current);
    if (container && page) container.scrollTop = page.offsetTop;
  }, [album.id]);

  useEffect(() => setLoadedImageIds(new Set()), [album.id]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const anchor = viewportAnchorRef.current;
    if (!container || !anchor) return;
    container.scrollLeft = anchor.x * container.scrollWidth - container.clientWidth / 2;
    container.scrollTop = anchor.y * container.scrollHeight - container.clientHeight / 2;
    viewportAnchorRef.current = null;
  }, [zoom]);

  const changeZoom = (nextZoom: number) => {
    const normalizedZoom = Math.min(maxContinuousZoom, Math.max(minContinuousZoom, Number(nextZoom.toFixed(1))));
    if (normalizedZoom === zoom) return;
    const container = containerRef.current;
    if (container) {
      viewportAnchorRef.current = {
        x: (container.scrollLeft + container.clientWidth / 2) / Math.max(container.scrollWidth, 1),
        y: (container.scrollTop + container.clientHeight / 2) / Math.max(container.scrollHeight, 1),
      };
    }
    setZoom(normalizedZoom);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      changeZoom(zoom + (event.deltaY < 0 ? continuousZoomStep : -continuousZoomStep));
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const index = Number((entry.target as HTMLElement).dataset.index);
        if (!Number.isInteger(index)) return;
        if (entry.isIntersecting) visibleRatiosRef.current.set(index, entry.intersectionRatio);
        else visibleRatiosRef.current.delete(index);
      });
      const nextIndex = Array.from(visibleRatiosRef.current.entries())
        .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0];
      const image = nextIndex === undefined ? null : album.images[nextIndex];
      if (!image || nextIndex === currentIndexRef.current) return;
      currentIndexRef.current = nextIndex;
      onCurrentImageChangeRef.current(image);
    }, { root: container, threshold: [0.15, 0.35, 0.6, 0.85] });
    pageRefs.current.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [album]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      container.scrollBy({
        top: container.clientHeight * (event.key === "ArrowDown" ? 0.05 : -0.05),
        behavior: event.repeat ? "auto" : "smooth",
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="photo-continuous-shell">
      <div className="photo-continuous-zoom-controls" aria-label="连续阅读缩放">
        <button type="button" onClick={() => changeZoom(zoom - continuousZoomStep)} disabled={zoom <= minContinuousZoom} aria-label="缩小全部图片">
          <ZoomOut size={17} />
        </button>
        <button type="button" onClick={() => changeZoom(1)} disabled={zoom === 1} aria-label="恢复全部图片原始倍率">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => changeZoom(zoom + continuousZoomStep)} disabled={zoom >= maxContinuousZoom} aria-label="放大全部图片">
          <ZoomIn size={17} />
        </button>
      </div>
      <div className="photo-continuous-reader" ref={containerRef} aria-label="连续竖向阅读">
        <div className="photo-continuous-pages" style={{ width: `${zoom * 100}%`, maxWidth: `${1200 * zoom}px` }}>
          {album.images.map((image) => {
            const imageUrl = getImageUrl(image);
            const isLoaded = loadedImageIds.has(image.id);
            return (
              <div
                className={`photo-continuous-page ${isLoaded ? "loaded" : "loading"}`}
                data-index={image.index}
                key={image.id}
                ref={(node) => {
                  if (node) pageRefs.current.set(image.index, node);
                  else pageRefs.current.delete(image.index);
                }}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={image.name}
                    decoding="async"
                    loading={Math.abs(image.index - currentIndex) <= 2 ? "eager" : "lazy"}
                    draggable={false}
                    onLoad={() => setLoadedImageIds((ids) => ids.has(image.id) ? ids : new Set(ids).add(image.id))}
                  />
                ) : <span>加载中…</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
