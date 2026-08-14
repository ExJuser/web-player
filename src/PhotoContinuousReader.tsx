import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

import {
  cachePhotoDecodeFailure,
  formatPhotoFileSize,
  getPhotoDecodeFailureMessage,
  hasCachedPhotoDecodeFailure,
  isLargePhotoFile,
} from "./photoFileStatus";
import type { PhotoAlbum, PhotoAlbumImage } from "./playerTypes";

type PhotoContinuousReaderProps = {
  album: PhotoAlbum;
  currentIndex: number;
  getImageUrl: (image: PhotoAlbumImage) => string;
  onCurrentImageChange: (image: PhotoAlbumImage) => void;
  onScrollDirectionChange: (direction: -1 | 0 | 1) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

const minContinuousZoom = 0.5;
const maxContinuousZoom = 2;
const continuousZoomStep = 0.1;
const continuousKeyboardStep = 0.05;
const continuousKeyboardHoldDelayMs = 180;
const continuousKeyboardScrollSpeed = 0.75;
type ContinuousViewportAnchor = {
  viewportX: number;
  viewportY: number;
} & (
  | { pageIndex: number; pageX: number; pageY: number }
  | { contentX: number; contentY: number }
);

type PhotoContinuousPageProps = {
  image: PhotoAlbumImage;
  imageUrl: string;
  isNearActive: boolean;
  pageRefCallback: (node: HTMLDivElement | null, index: number) => void;
  onContentChange: () => void;
};

// 单页组件：加载/失败状态页内自持，避免大图集每次图片加载都整树重渲染
// （页级 setState + memo 只重渲染当前页；zoom 变化不改变页 props，直接跳过）。
const PhotoContinuousPage = memo(function PhotoContinuousPage({
  image,
  imageUrl,
  isNearActive,
  pageRefCallback,
  onContentChange,
}: PhotoContinuousPageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasFailed, setHasFailed] = useState(() => hasCachedPhotoDecodeFailure(image));
  const isLargeFile = isLargePhotoFile(image);
  return (
    <div
      className={`photo-continuous-page ${isLoaded ? "loaded" : "loading"} ${hasFailed ? "failed" : ""}`}
      data-index={image.index}
      ref={(node) => pageRefCallback(node, image.index)}
    >
      {imageUrl && !hasFailed ? (
        <img
          src={imageUrl}
          alt={image.name}
          decoding="async"
          loading={isNearActive ? "eager" : "lazy"}
          draggable={false}
          onLoad={() => {
            setIsLoaded(true);
            onContentChange();
          }}
          onError={() => {
            cachePhotoDecodeFailure(image);
            setHasFailed(true);
            onContentChange();
          }}
        />
      ) : null}
      {hasFailed ? (
        <div className="photo-file-error" role="alert">
          <strong>无法显示图片</strong>
          <span>{getPhotoDecodeFailureMessage(image)}</span>
          <small>{image.name}</small>
        </div>
      ) : !imageUrl ? (
        <span>加载中…</span>
      ) : !isLoaded && isLargeFile ? (
        <span className="photo-continuous-file-warning">超大文件（{formatPhotoFileSize(image.size)}），加载可能需要较长时间</span>
      ) : null}
    </div>
  );
});

export function PhotoContinuousReader({
  album,
  currentIndex,
  getImageUrl,
  onCurrentImageChange,
  onScrollDirectionChange,
  zoom,
  onZoomChange,
}: PhotoContinuousReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const visibleRatiosRef = useRef(new Map<number, number>());
  const currentIndexRef = useRef(currentIndex);
  const onCurrentImageChangeRef = useRef(onCurrentImageChange);
  const onScrollDirectionChangeRef = useRef(onScrollDirectionChange);
  const viewportAnchorRef = useRef<ContinuousViewportAnchor | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const [readingProgress, setReadingProgress] = useState(0);

  currentIndexRef.current = currentIndex;
  onCurrentImageChangeRef.current = onCurrentImageChange;
  onScrollDirectionChangeRef.current = onScrollDirectionChange;

  const updateReadingProgress = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextDirection = container.scrollTop > lastScrollTopRef.current
      ? 1
      : container.scrollTop < lastScrollTopRef.current
        ? -1
        : scrollDirectionRef.current;
    lastScrollTopRef.current = container.scrollTop;
    if (nextDirection !== scrollDirectionRef.current) {
      scrollDirectionRef.current = nextDirection;
      onScrollDirectionChangeRef.current(nextDirection);
    }
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    const nextProgress = maxScrollTop <= 0 ? 100 : Math.round((container.scrollTop / maxScrollTop) * 100);
    setReadingProgress((progress) => progress === nextProgress ? progress : nextProgress);
  }, []);

  const registerPageRef = useCallback((node: HTMLDivElement | null, index: number) => {
    if (node) pageRefs.current.set(index, node);
    else pageRefs.current.delete(index);
  }, []);

  useLayoutEffect(() => {
    visibleRatiosRef.current.clear();
    const container = containerRef.current;
    const page = pageRefs.current.get(currentIndexRef.current);
    if (container && page) container.scrollTop = page.offsetTop;
    updateReadingProgress();
  }, [album.id, updateReadingProgress]);

  useEffect(() => () => onScrollDirectionChangeRef.current(0), []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const anchor = viewportAnchorRef.current;
    if (!container || !anchor) return;
    if ("pageIndex" in anchor) {
      const page = pageRefs.current.get(anchor.pageIndex);
      if (page) {
        const containerBounds = container.getBoundingClientRect();
        const pageBounds = page.getBoundingClientRect();
        container.scrollLeft += pageBounds.left - containerBounds.left + anchor.pageX * pageBounds.width - anchor.viewportX;
        container.scrollTop += pageBounds.top - containerBounds.top + anchor.pageY * pageBounds.height - anchor.viewportY;
      }
    } else {
      container.scrollLeft = anchor.contentX * container.scrollWidth - anchor.viewportX;
      container.scrollTop = anchor.contentY * container.scrollHeight - anchor.viewportY;
    }
    viewportAnchorRef.current = null;
  }, [zoom]);

  const changeZoom = (nextZoom: number, clientPoint?: { x: number; y: number }) => {
    const normalizedZoom = Math.min(maxContinuousZoom, Math.max(minContinuousZoom, Number(nextZoom.toFixed(1))));
    if (normalizedZoom === zoom) return;
    const container = containerRef.current;
    if (container) {
      const bounds = container.getBoundingClientRect();
      const viewportX = clientPoint ? clientPoint.x - bounds.left : container.clientWidth / 2;
      const viewportY = clientPoint ? clientPoint.y - bounds.top : container.clientHeight / 2;
      const page = clientPoint
        ? document.elementFromPoint(clientPoint.x, clientPoint.y)?.closest<HTMLElement>(".photo-continuous-page")
        : null;
      const pageIndex = Number(page?.dataset.index);
      if (page && container.contains(page) && Number.isInteger(pageIndex)) {
        const pageBounds = page.getBoundingClientRect();
        viewportAnchorRef.current = {
          pageIndex,
          pageX: pageBounds.width ? (clientPoint!.x - pageBounds.left) / pageBounds.width : 0.5,
          pageY: pageBounds.height ? (clientPoint!.y - pageBounds.top) / pageBounds.height : 0.5,
          viewportX,
          viewportY,
        };
      } else {
        viewportAnchorRef.current = {
          contentX: (container.scrollLeft + viewportX) / Math.max(container.scrollWidth, 1),
          contentY: (container.scrollTop + viewportY) / Math.max(container.scrollHeight, 1),
          viewportX,
          viewportY,
        };
      }
    }
    onZoomChange(normalizedZoom);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      changeZoom(
        zoom + (event.deltaY < 0 ? continuousZoomStep : -continuousZoomStep),
        { x: event.clientX, y: event.clientY },
      );
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
    let heldKey: "ArrowUp" | "ArrowDown" | null = null;
    let holdTimer: number | null = null;
    let animationFrame: number | null = null;
    let lastFrameTime = 0;

    const stopKeyboardScroll = () => {
      heldKey = null;
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      holdTimer = null;
      animationFrame = null;
      lastFrameTime = 0;
    };

    const animateKeyboardScroll = (timestamp: number) => {
      const container = containerRef.current;
      if (!heldKey || !container) return;
      const elapsedSeconds = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0;
      lastFrameTime = timestamp;
      container.scrollTop += container.clientHeight
        * continuousKeyboardScrollSpeed
        * elapsedSeconds
        * (heldKey === "ArrowDown" ? 1 : -1);
      animationFrame = requestAnimationFrame(animateKeyboardScroll);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      if (event.repeat || heldKey === event.key) return;
      stopKeyboardScroll();
      heldKey = event.key;
      container.scrollBy({
        top: container.clientHeight * continuousKeyboardStep * (event.key === "ArrowDown" ? 1 : -1),
        behavior: "smooth",
      });
      holdTimer = window.setTimeout(() => {
        lastFrameTime = performance.now();
        animationFrame = requestAnimationFrame(animateKeyboardScroll);
      }, continuousKeyboardHoldDelayMs);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === heldKey) stopKeyboardScroll();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopKeyboardScroll);
    return () => {
      stopKeyboardScroll();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopKeyboardScroll);
    };
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
      <div className="photo-continuous-reader" ref={containerRef} aria-label="连续竖向阅读" onScroll={updateReadingProgress}>
        <div className="photo-continuous-pages" style={{ width: `${zoom * 100}%`, maxWidth: `${1200 * zoom}px` }}>
          {album.images.map((image) => (
            <PhotoContinuousPage
              key={image.id}
              image={image}
              imageUrl={getImageUrl(image)}
              isNearActive={Math.abs(image.index - currentIndex) <= 2}
              pageRefCallback={registerPageRef}
              onContentChange={updateReadingProgress}
            />
          ))}
        </div>
      </div>
      <div className="photo-continuous-progress" aria-label={`阅读进度 ${readingProgress}%`}>
        {Math.min(currentIndex + 1, album.images.length)} / {album.images.length}
        <span aria-hidden="true">·</span>
        {readingProgress}%
      </div>
    </div>
  );
}
