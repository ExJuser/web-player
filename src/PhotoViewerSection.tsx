import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Images, Minimize2, RotateCcw, Settings2, Star } from "lucide-react";

import { PhotoContinuousReader } from "./PhotoContinuousReader";
import { PhotoViewerFilmstrip } from "./PhotoViewerFilmstrip";
import { PhotoViewerHeader } from "./PhotoViewerHeader";
import { PhotoViewerStage } from "./PhotoViewerStage";
import type { PhotoAlbum, PhotoAlbumImage, PhotoContinuousPageGap, PhotoReaderBackground, PhotoSingleFitMode } from "./playerTypes";

type PhotoViewerSectionProps = {
  album: PhotoAlbum;
  currentIndex: number;
  currentPhoto: PhotoAlbumImage | null;
  currentPhotoUrl: string;
  isCoverCurrent: boolean;
  isFavorite: boolean;
  isContinuousReading: boolean;
  isImmersive: boolean;
  pageGap: PhotoContinuousPageGap;
  readerBackground: PhotoReaderBackground;
  zoom: number;
  singleFitMode: PhotoSingleFitMode;
  hasNextAlbum: boolean;
  hasPreviousAlbum: boolean;
  thumbnails: PhotoAlbumImage[];
  getImageUrl: (image: PhotoAlbumImage) => string;
  onBack: () => void;
  onDeleteAlbum: (album: PhotoAlbum) => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onImmersiveChange: (isImmersive: boolean) => void;
  onMarkCompleted: () => void;
  onMoveAlbum: (delta: number) => void;
  onMove: (delta: number) => void;
  onReadingModeChange: (isContinuous: boolean) => void;
  onPageGapChange: (pageGap: PhotoContinuousPageGap) => void;
  onReaderBackgroundChange: (background: PhotoReaderBackground) => void;
  onZoomChange: (zoom: number) => void;
  onResetDisplaySettings: () => void;
  onSingleFitModeChange: (fitMode: PhotoSingleFitMode) => void;
  onResetProgress: () => void;
  onSelectImage: (image: PhotoAlbumImage) => void;
  onSetCover: (album: PhotoAlbum, image: PhotoAlbumImage) => void;
  onToggleFavorite: (album: PhotoAlbum) => void;
};

const immersiveControlHideDelay = 1800;
const readerBackgroundOptions: Array<{ value: PhotoReaderBackground; label: string }> = [
  { value: "black", label: "纯黑" },
  { value: "dark", label: "深灰" },
  { value: "light", label: "浅灰" },
  { value: "white", label: "白色" },
  { value: "sepia", label: "护眼" },
];
const continuousPageGapOptions: Array<{ value: PhotoContinuousPageGap; label: string }> = [
  { value: "none", label: "无缝" },
  { value: "narrow", label: "窄缝" },
  { value: "normal", label: "普通" },
  { value: "wide", label: "宽松" },
];

export function PhotoViewerSection({
  album,
  currentIndex,
  currentPhoto,
  currentPhotoUrl,
  isCoverCurrent,
  isFavorite,
  isContinuousReading,
  isImmersive,
  pageGap,
  readerBackground,
  zoom,
  singleFitMode,
  hasNextAlbum,
  hasPreviousAlbum,
  thumbnails,
  getImageUrl,
  onBack,
  onDeleteAlbum,
  onDeleteCurrentPhoto,
  onEditTags,
  onImmersiveChange,
  onMarkCompleted,
  onMoveAlbum,
  onMove,
  onReadingModeChange,
  onPageGapChange,
  onReaderBackgroundChange,
  onZoomChange,
  onResetDisplaySettings,
  onSingleFitModeChange,
  onResetProgress,
  onSelectImage,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerSectionProps) {
  const [areImmersiveControlsVisible, setAreImmersiveControlsVisible] = useState(true);
  const [isImmersiveSettingsOpen, setIsImmersiveSettingsOpen] = useState(false);
  const immersiveHideTimerRef = useRef<number | null>(null);
  const revealImmersiveControls = useCallback(() => {
    setAreImmersiveControlsVisible(true);
    if (immersiveHideTimerRef.current !== null) window.clearTimeout(immersiveHideTimerRef.current);
    immersiveHideTimerRef.current = null;
    if (!isImmersive || isImmersiveSettingsOpen) return;
    immersiveHideTimerRef.current = window.setTimeout(() => {
      immersiveHideTimerRef.current = null;
      setAreImmersiveControlsVisible(false);
    }, immersiveControlHideDelay);
  }, [isImmersive, isImmersiveSettingsOpen]);

  useEffect(() => {
    if (isImmersive) revealImmersiveControls();
    else setIsImmersiveSettingsOpen(false);
    return () => {
      if (immersiveHideTimerRef.current !== null) window.clearTimeout(immersiveHideTimerRef.current);
    };
  }, [isImmersive, revealImmersiveControls]);

  const handleImmersivePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isImmersive || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    if (y <= 72 || y >= bounds.height - 96) revealImmersiveControls();
  };

  const handleImmersiveTouch = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isImmersive || event.pointerType !== "touch" || (event.target as Element).closest("button, .photo-action-options")) return;
    if (areImmersiveControlsVisible) {
      if (immersiveHideTimerRef.current !== null) window.clearTimeout(immersiveHideTimerRef.current);
      immersiveHideTimerRef.current = null;
      setAreImmersiveControlsVisible(false);
    } else revealImmersiveControls();
    setIsImmersiveSettingsOpen(false);
  };

  return (
    <section
      className={`photo-viewer reader-background-${readerBackground} page-gap-${pageGap} ${isImmersive ? "immersive" : ""} ${areImmersiveControlsVisible ? "immersive-controls-visible" : ""}`}
      aria-label={`阅读 ${album.title}`}
      onFocusCapture={revealImmersiveControls}
      onPointerMove={handleImmersivePointerMove}
      onPointerUp={handleImmersiveTouch}
    >
      {!isImmersive ? (
        <PhotoViewerHeader
          album={album}
          currentPhoto={currentPhoto}
          isCoverCurrent={isCoverCurrent}
          isContinuousReading={isContinuousReading}
          isFavorite={isFavorite}
          hasNextAlbum={hasNextAlbum}
          hasPreviousAlbum={hasPreviousAlbum}
          onBack={onBack}
          onDeleteAlbum={onDeleteAlbum}
          onDeleteCurrentPhoto={onDeleteCurrentPhoto}
          onEditTags={onEditTags}
          onEnterImmersive={() => onImmersiveChange(true)}
          onMarkCompleted={onMarkCompleted}
          onMoveAlbum={onMoveAlbum}
          onReadingModeChange={onReadingModeChange}
          onPageGapChange={onPageGapChange}
          onReaderBackgroundChange={onReaderBackgroundChange}
          onResetDisplaySettings={onResetDisplaySettings}
          onSingleFitModeChange={onSingleFitModeChange}
          singleFitMode={singleFitMode}
          pageGap={pageGap}
          readerBackground={readerBackground}
          onResetProgress={onResetProgress}
          onSetCover={onSetCover}
          onToggleFavorite={onToggleFavorite}
        />
      ) : null}
      {isContinuousReading ? (
        <PhotoContinuousReader
          album={album}
          currentIndex={currentIndex}
          getImageUrl={getImageUrl}
          key={album.id}
          onCurrentImageChange={onSelectImage}
          zoom={zoom}
          onZoomChange={onZoomChange}
        />
      ) : (
        <PhotoViewerStage
          currentIndex={currentIndex}
          currentPhoto={currentPhoto}
          currentPhotoUrl={currentPhotoUrl}
          imageCount={album.images.length}
          zoom={zoom}
          fitMode={singleFitMode}
          onZoomChange={onZoomChange}
          onFitModeChange={onSingleFitModeChange}
          onMove={onMove}
        />
      )}
      {isImmersive ? (
        <>
          <div className="photo-immersive-edge top" onPointerEnter={revealImmersiveControls} />
          <div className="photo-immersive-edge bottom" onPointerEnter={revealImmersiveControls} />
          <div className="photo-immersive-toolbar" onPointerMove={revealImmersiveControls}>
            <button type="button" onClick={() => onReadingModeChange(!isContinuousReading)}>
              <Images size={16} />
              {isContinuousReading ? "单页" : "竖向"}
            </button>
            <button className={isFavorite ? "active" : ""} type="button" onClick={() => onToggleFavorite(album)}>
              <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "已收藏" : "收藏"}
            </button>
            <div className="photo-action-menu">
              <button type="button" aria-expanded={isImmersiveSettingsOpen} onClick={() => setIsImmersiveSettingsOpen((isOpen) => !isOpen)}>
                <Settings2 size={16} />
                设置
              </button>
              {isImmersiveSettingsOpen ? (
                <div className="photo-action-options photo-reader-settings" role="menu">
                  <span>阅读背景</span>
                  <div className="photo-reader-setting-options">
                    {readerBackgroundOptions.map((option) => (
                      <button className={readerBackground === option.value ? "active" : ""} key={option.value} type="button" onClick={() => onReaderBackgroundChange(option.value)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {isContinuousReading ? (
                    <>
                      <span>图片间距</span>
                      <div className="photo-reader-setting-options">
                        {continuousPageGapOptions.map((option) => (
                          <button className={pageGap === option.value ? "active" : ""} key={option.value} type="button" onClick={() => onPageGapChange(option.value)}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <span>单页显示</span>
                      <div className="photo-reader-setting-options">
                        {([ ["fit", "适应窗口"], ["width", "适应宽度"], ["original", "原始大小"] ] as Array<[PhotoSingleFitMode, string]>).map(([value, label]) => (
                          <button className={singleFitMode === value ? "active" : ""} key={value} type="button" onClick={() => onSingleFitModeChange(value)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <button className="photo-reader-reset" type="button" onClick={onResetDisplaySettings}>
                    <RotateCcw size={14} />恢复显示默认值
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => onImmersiveChange(false)} title="退出沉浸阅读（Esc）">
              <Minimize2 size={16} />退出
            </button>
          </div>
          <div className="photo-immersive-filmstrip" onPointerMove={revealImmersiveControls}>
            <PhotoViewerFilmstrip
              currentIndex={currentIndex}
              currentPhotoName={currentPhoto?.name ?? album.title}
              getImageUrl={getImageUrl}
              imageCount={album.imageCount}
              thumbnails={thumbnails}
              onSelectImage={onSelectImage}
            />
          </div>
        </>
      ) : !isContinuousReading ? (
        <PhotoViewerFilmstrip
          currentIndex={currentIndex}
          currentPhotoName={currentPhoto?.name ?? album.title}
          getImageUrl={getImageUrl}
          imageCount={album.imageCount}
          thumbnails={thumbnails}
          onSelectImage={onSelectImage}
        />
      ) : null}
    </section>
  );
}
