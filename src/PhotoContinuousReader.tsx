import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoContinuousReaderProps = {
  album: PhotoAlbum;
  currentIndex: number;
  getImageUrl: (image: PhotoAlbumImage) => string;
  onCurrentImageChange: (image: PhotoAlbumImage) => void;
};

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
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(() => new Set());

  currentIndexRef.current = currentIndex;
  onCurrentImageChangeRef.current = onCurrentImageChange;

  useLayoutEffect(() => {
    visibleRatiosRef.current.clear();
    const container = containerRef.current;
    const page = pageRefs.current.get(currentIndexRef.current);
    if (container && page) container.scrollTop = page.offsetTop;
  }, [album.id]);

  useEffect(() => setLoadedImageIds(new Set()), [album.id]);

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
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, [contenteditable='true']")) return;
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      container.scrollBy({
        top: container.clientHeight * (event.key === "ArrowDown" ? 0.85 : -0.85),
        behavior: event.repeat ? "auto" : "smooth",
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="photo-continuous-reader" ref={containerRef} aria-label="连续竖向阅读">
      <div className="photo-continuous-pages">
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
  );
}
