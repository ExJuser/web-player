import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Images, Maximize2, MoreHorizontal, RotateCcw, Settings2, SkipBack, SkipForward, Star, Tags, Trash2 } from "lucide-react";

import type { PhotoAlbum, PhotoAlbumImage, PhotoContinuousPageGap, PhotoReaderBackground, PhotoSingleFitMode } from "./playerTypes";

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

type PhotoViewerHeaderProps = {
  album: PhotoAlbum;
  currentPhoto: PhotoAlbumImage | null;
  isCoverCurrent: boolean;
  isContinuousReading: boolean;
  isFavorite: boolean;
  pageGap: PhotoContinuousPageGap;
  readerBackground: PhotoReaderBackground;
  singleFitMode: PhotoSingleFitMode;
  hasNextAlbum: boolean;
  hasPreviousAlbum: boolean;
  onBack: () => void;
  onDeleteAlbum: (album: PhotoAlbum) => void;
  onDeleteCurrentPhoto: () => void;
  onEditTags: (album: PhotoAlbum) => void;
  onEnterImmersive: () => void;
  onMarkCompleted: () => void;
  onMoveAlbum: (delta: number) => void;
  onReadingModeChange: (isContinuous: boolean) => void;
  onPageGapChange: (pageGap: PhotoContinuousPageGap) => void;
  onReaderBackgroundChange: (background: PhotoReaderBackground) => void;
  onResetProgress: () => void;
  onResetDisplaySettings: () => void;
  onSingleFitModeChange: (fitMode: PhotoSingleFitMode) => void;
  onSetCover: (album: PhotoAlbum, image: PhotoAlbumImage) => void;
  onToggleFavorite: (album: PhotoAlbum) => void;
};

export function PhotoViewerHeader({
  album,
  currentPhoto,
  isCoverCurrent,
  isContinuousReading,
  isFavorite,
  pageGap,
  readerBackground,
  singleFitMode,
  hasNextAlbum,
  hasPreviousAlbum,
  onBack,
  onDeleteAlbum,
  onDeleteCurrentPhoto,
  onEditTags,
  onEnterImmersive,
  onMarkCompleted,
  onMoveAlbum,
  onReadingModeChange,
  onPageGapChange,
  onReaderBackgroundChange,
  onResetProgress,
  onResetDisplaySettings,
  onSingleFitModeChange,
  onSetCover,
  onToggleFavorite,
}: PhotoViewerHeaderProps) {
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isReaderSettingsOpen, setIsReaderSettingsOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const readerSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActionMenuOpen && !isReaderSettingsOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setIsActionMenuOpen(false);
      if (!readerSettingsRef.current?.contains(event.target as Node)) setIsReaderSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActionMenuOpen(false);
        setIsReaderSettingsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isActionMenuOpen, isReaderSettingsOpen]);

  return (
    <header className="photo-viewer-header">
      <div className="photo-viewer-navigation">
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回
        </button>
        <button
          aria-label="上一个图集"
          className="secondary-button"
          type="button"
          disabled={!hasPreviousAlbum}
          onClick={(event) => {
            event.currentTarget.blur();
            onMoveAlbum(-1);
          }}
          title="上一个图集"
        >
          <SkipBack size={16} />
        </button>
        <button
          aria-label="下一个图集"
          className="secondary-button"
          type="button"
          disabled={!hasNextAlbum}
          onClick={(event) => {
            event.currentTarget.blur();
            onMoveAlbum(1);
          }}
          title="下一个图集"
        >
          <SkipForward size={16} />
        </button>
        <button className="secondary-button" type="button" onClick={onEnterImmersive}>
          <Maximize2 size={16} />
          沉浸阅读
        </button>
        <button className="secondary-button" type="button" onClick={() => onReadingModeChange(!isContinuousReading)}>
          <Images size={16} />
          {isContinuousReading ? "单页阅读" : "竖向阅读"}
        </button>
      </div>
      <div className="photo-viewer-actions">
        <div className="photo-action-menu" ref={readerSettingsRef}>
          <button
            aria-expanded={isReaderSettingsOpen}
            aria-haspopup="menu"
            className="secondary-button"
            type="button"
            onClick={() => {
              setIsActionMenuOpen(false);
              setIsReaderSettingsOpen((isOpen) => !isOpen);
            }}
          >
            <Settings2 size={16} />
            阅读设置
          </button>
          {isReaderSettingsOpen ? (
            <div className="photo-action-options photo-reader-settings" role="menu">
              <span>阅读背景</span>
              <div className="photo-reader-setting-options">
                {readerBackgroundOptions.map((option) => (
                  <button
                    className={readerBackground === option.value ? "active" : ""}
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={readerBackground === option.value}
                    onClick={() => onReaderBackgroundChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {isContinuousReading ? (
                <>
                  <span>图片间距</span>
                  <div className="photo-reader-setting-options">
                    {continuousPageGapOptions.map((option) => (
                      <button
                        className={pageGap === option.value ? "active" : ""}
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={pageGap === option.value}
                        onClick={() => onPageGapChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <span>单页显示</span>
                  <div className="photo-reader-setting-options photo-reader-single-fit-options">
                    {([ ["fit", "适应窗口"], ["width", "适应宽度"], ["original", "原始大小"] ] as Array<[PhotoSingleFitMode, string]>).map(([value, label]) => (
                      <button className={singleFitMode === value ? "active" : ""} key={value} type="button" onClick={() => onSingleFitModeChange(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="photo-reader-reset" type="button" role="menuitem" onClick={onResetDisplaySettings}>
                <RotateCcw size={14} />
                恢复显示默认值
              </button>
            </div>
          ) : null}
        </div>
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
        <div className="photo-action-menu" ref={actionMenuRef}>
          <button
            aria-expanded={isActionMenuOpen}
            aria-haspopup="menu"
            className="secondary-button photo-more-button"
            type="button"
            onClick={() => {
              setIsReaderSettingsOpen(false);
              setIsActionMenuOpen((isOpen) => !isOpen);
            }}
            title="更多图集操作"
          >
            <MoreHorizontal size={17} />
            更多
          </button>
          {isActionMenuOpen ? (
            <div className="photo-action-options" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsActionMenuOpen(false);
                  onEditTags(album);
                }}
              >
                <Tags size={15} />
                编辑标签
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!currentPhoto || isCoverCurrent}
                onClick={() => {
                  setIsActionMenuOpen(false);
                  if (currentPhoto) onSetCover(album, currentPhoto);
                }}
              >
                <Images size={15} />
                {isCoverCurrent ? "已是当前封面" : "设为封面"}
              </button>
              <button
                className="danger-option"
                type="button"
                role="menuitem"
                disabled={!currentPhoto}
                onClick={() => {
                  setIsActionMenuOpen(false);
                  onDeleteCurrentPhoto();
                }}
              >
                <Trash2 size={15} />
                删除当前图片
              </button>
              <button
                className="danger-option"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsActionMenuOpen(false);
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
