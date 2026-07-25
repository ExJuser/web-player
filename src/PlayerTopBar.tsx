import { Compass, FolderOpen, HardDrive, Images, Info, LoaderCircle, Moon, Scissors, Search, Sparkles, Sun, X } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";

import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";

type VideoMetadataRow = readonly [string, string];

type PlayerTopBarProps = {
  currentVideoId: string | null;
  canShowExplore: boolean;
  homeSearchQuery: string;
  homeSearchResultCount: number;
  homeSearchResults: readonly { id: string; name: string; relativePath: string }[];
  isExploreViewVisible: boolean;
  isHomeSearchPending: boolean;
  mediaProcessingTask: MediaProcessingTaskState | null;
  isHomeViewVisible: boolean;
  isNonPlayerViewVisible: boolean;
  isPrivacyMode: boolean;
  isScanning: boolean;
  metadataRows: readonly VideoMetadataRow[];
  summaryFallbackText: string;
  theme: "dark" | "light";
  videoCount: number;
  playabilityMessage: string;
  onAddMediaLibrary: () => void;
  onOpenCacheStatus: () => void;
  onOpenMediaProcessingTask: () => void;
  onChangeHomeSearch: (query: string) => void;
  onClearHomeSearch: () => void;
  onFocusHomeSearch: () => void;
  onSelectHomeSearchResult: (videoId: string) => void;
  onShowExplore: () => void;
  onShowHome: () => void;
  onShowPhotoAlbums: () => void;
  onToggleTheme: () => void;
};

export const PlayerTopBar = forwardRef<HTMLElement, PlayerTopBarProps>(function PlayerTopBar(
  {
    currentVideoId,
    canShowExplore,
    homeSearchQuery,
    homeSearchResultCount,
    homeSearchResults,
    isExploreViewVisible,
    isHomeSearchPending,
    mediaProcessingTask,
    isHomeViewVisible,
    isNonPlayerViewVisible,
    isPrivacyMode,
    isScanning,
    metadataRows,
    summaryFallbackText,
    theme,
    videoCount,
    playabilityMessage,
    onAddMediaLibrary,
    onOpenCacheStatus,
    onOpenMediaProcessingTask,
    onChangeHomeSearch,
    onClearHomeSearch,
    onFocusHomeSearch,
    onSelectHomeSearchResult,
    onShowExplore,
    onShowHome,
    onShowPhotoAlbums,
    onToggleTheme,
  },
  ref
) {
  const [isMetadataPinnedOpen, setIsMetadataPinnedOpen] = useState(false);
  const [isHomeSearchFocused, setIsHomeSearchFocused] = useState(false);
  const metadataCardRef = useRef<HTMLButtonElement>(null);
  const shouldShowMetadata = Boolean(currentVideoId) && !isPrivacyMode && !isNonPlayerViewVisible;
  const hasHomeSearchQuery = Boolean(homeSearchQuery.trim());
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
        ) : isHomeViewVisible ? (
          <form
            className="home-top-search"
            role="search"
            onFocus={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setIsHomeSearchFocused(true);
              onFocusHomeSearch();
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setIsHomeSearchFocused(false);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              const firstResult = homeSearchResults[0];
              if (firstResult && !isHomeSearchPending) onSelectHomeSearchResult(firstResult.id);
            }}
          >
            <Search className="home-top-search-icon" size={17} aria-hidden="true" />
            <input
              type="search"
              value={homeSearchQuery}
              onChange={(event) => onChangeHomeSearch(event.target.value)}
              placeholder="搜索片名、演员、标签或路径"
              aria-label="搜索影片"
              aria-controls="home-search-results"
              aria-expanded={isHomeSearchFocused && hasHomeSearchQuery}
              aria-busy={isHomeSearchPending}
            />
            {hasHomeSearchQuery ? (
              <span className="home-top-search-actions">
                {isHomeSearchPending ? <LoaderCircle className="home-top-search-loading" size={15} aria-hidden="true" /> : <span>{homeSearchResultCount}</span>}
                <button type="button" onClick={onClearHomeSearch} title="清空搜索" aria-label="清空搜索">
                  <X size={15} />
                </button>
              </span>
            ) : null}
            {isHomeSearchFocused && hasHomeSearchQuery ? (
              <div className="home-top-search-results" id="home-search-results" role="listbox" aria-label="影片搜索结果">
                {isHomeSearchPending ? (
                  <div className="home-top-search-status">正在搜索...</div>
                ) : homeSearchResults.length ? (
                  homeSearchResults.map((video) => (
                    <button key={video.id} type="button" role="option" aria-selected="false" onClick={() => onSelectHomeSearchResult(video.id)}>
                      <strong>{video.name}</strong>
                      <small>{video.relativePath}</small>
                    </button>
                  ))
                ) : (
                  <div className="home-top-search-status">没有找到匹配影片</div>
                )}
              </div>
            ) : null}
          </form>
        ) : (
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
