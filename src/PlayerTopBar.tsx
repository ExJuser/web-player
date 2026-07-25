import { Compass, Film, FolderOpen, HardDrive, Images, Info, Moon, Scissors, Sparkles, Sun } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";

import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

type VideoMetadataRow = readonly [string, string];

type PlayerTopBarProps = {
  currentVideoId: string | null;
  canShowExplore: boolean;
  isExploreViewVisible: boolean;
  mediaProcessingTask: MediaProcessingTaskState | null;
  isHomeViewVisible: boolean;
  isNonPlayerViewVisible: boolean;
  isPrivacyMode: boolean;
  isScanning: boolean;
  metadataRows: readonly VideoMetadataRow[];
  summaryFallbackText: string;
  theme: "dark" | "light";
  videoCount: number;
  playlistCountLabel: string;
  playabilityMessage: string;
  onAddMediaLibrary: () => void;
  onOpenCacheStatus: () => void;
  onOpenMediaProcessingTask: () => void;
  onShowExplore: () => void;
  onShowHome: () => void;
  onShowPhotoAlbums: () => void;
  onToggleTheme: () => void;
};

export const PlayerTopBar = forwardRef<HTMLElement, PlayerTopBarProps>(function PlayerTopBar(
  {
    currentVideoId,
    canShowExplore,
    isExploreViewVisible,
    mediaProcessingTask,
    isHomeViewVisible,
    isNonPlayerViewVisible,
    isPrivacyMode,
    isScanning,
    metadataRows,
    summaryFallbackText,
    theme,
    videoCount,
    playlistCountLabel,
    playabilityMessage,
    onAddMediaLibrary,
    onOpenCacheStatus,
    onOpenMediaProcessingTask,
    onShowExplore,
    onShowHome,
    onShowPhotoAlbums,
    onToggleTheme,
  },
  ref
) {
  const [isMetadataPinnedOpen, setIsMetadataPinnedOpen] = useState(false);
  const metadataCardRef = useRef<HTMLButtonElement>(null);
  const shouldShowMetadata = Boolean(currentVideoId) && !isPrivacyMode && !isNonPlayerViewVisible;
  const themeToggleLabel = theme === "dark" ? "切换到白天模式" : "切换到黑夜模式";

  useEffect(() => {
    if (!isMetadataPinnedOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (metadataCardRef.current?.contains(event.target as Node)) return;
      setIsMetadataPinnedOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMetadataPinnedOpen]);

  return (
    <header className="top-bar" ref={ref}>
      <div className={`video-summary${shouldShowMetadata ? " has-metadata" : ""}`}>
        {!isHomeViewVisible && playlistCountLabel ? (
          <span className="playlist-count-summary"><Film size={15} />{playlistCountLabel}</span>
        ) : null}
        {shouldShowMetadata ? (
          <button
            ref={metadataCardRef}
            className={`video-metadata-card${isMetadataPinnedOpen ? " is-expanded" : ""}`}
            type="button"
            aria-expanded={isMetadataPinnedOpen}
            aria-label={isMetadataPinnedOpen ? "收起影片信息详情" : "展开影片信息详情"}
            onClick={() => {
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed && metadataCardRef.current?.contains(selection.anchorNode)) return;
              setIsMetadataPinnedOpen((isOpen) => !isOpen);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setIsMetadataPinnedOpen(false);
            }}
          >
            <span className="video-metadata-summary">
              <Info size={14} />
              <span>影片信息</span>
            </span>
            <span className="video-metadata-details">
              <span className="current-video-meta">
                {metadataRows.map(([label, value]) => (
                  <span key={label} className={label === "文件名" ? "current-video-file-chip" : undefined}>
                    <span className="current-video-meta-label">{label}</span>
                    <strong className="current-video-meta-value">{value}</strong>
                  </span>
                ))}
              </span>
              {playabilityMessage ? <span className="compatible-media-status">{playabilityMessage}</span> : null}
            </span>
          </button>
        ) : isHomeViewVisible ? null : (
          <p className="current-video-title">{summaryFallbackText}</p>
        )}
      </div>
      <div className="top-actions">
        {mediaProcessingTask ? (
          <button className="secondary-button highlight-montage-top-status" type="button" onClick={onOpenMediaProcessingTask} title={mediaProcessingTask.status}>
            {mediaProcessingTask.kind === "lada" ? <Sparkles size={16} className="spin-icon" /> : <Scissors size={16} className="spin-icon" />}
            <span>{Math.round(mediaProcessingTask.progress)}%</span>
            <small>{mediaProcessingTask.videoName}</small>
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible ? (
          <button
            className="secondary-button top-cache-status-button"
            type="button"
            onClick={onOpenCacheStatus}
            title="查看本地缓存"
          >
            <HardDrive size={17} />
            本地缓存
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible ? (
          <button
            className="primary-button top-add-library-button"
            type="button"
            onClick={onAddMediaLibrary}
            disabled={isScanning}
          >
            <FolderOpen size={18} />
            {isScanning ? "扫描中" : "新增媒体库"}
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible && canShowExplore ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowExplore}>
            <Compass size={17} />
            探索
          </button>
        ) : null}
        {!isPrivacyMode && (videoCount || isExploreViewVisible) && !isHomeViewVisible ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowHome}>
            首页
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowPhotoAlbums}>
            <Images size={17} />
            看图
          </button>
        ) : null}
        <button
          className="icon-button theme-toggle"
          type="button"
          onClick={onToggleTheme}
          title={themeToggleLabel}
          aria-label={themeToggleLabel}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
});
