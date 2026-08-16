import { Clapperboard, Compass, Film, FolderOpen, Images, Info, LoaderCircle, Moon, Scissors, Search, Sparkles, Sun, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { MediaProcessingTaskState } from "./MediaProcessingTaskDialog";
import { RatingChip, TagChips } from "./MetadataChips";
import type { PlaylistSearchMatch } from "./playerPlaylistSearch";
import type { PlaylistThumbnailStore } from "./playlistThumbnailStore";
import type { VideoItem } from "./playerTypes";

type VideoMetadataRow = readonly [string, string];
type HomeSearchResult = {
  video: VideoItem;
  tags: string[];
  actorTags: string[];
  systemTags: string[];
  rating?: number;
  comment?: string;
  searchMatch?: PlaylistSearchMatch;
};

type PlayerTopBarProps = {
  currentVideoId: string | null;
  canShowExplore: boolean;
  homeSearchQuery: string;
  homeSearchResultCount: number;
  homeSearchResults: readonly HomeSearchResult[];
  isExploreViewVisible: boolean;
  isHomeSearchPending: boolean;
  mediaProcessingTask: MediaProcessingTaskState | null;
  isHomeViewVisible: boolean;
  isNonPlayerViewVisible: boolean;
  isPrivacyMode: boolean;
  isScanning: boolean;
  metadataRows: readonly VideoMetadataRow[];
  playlistThumbnailStore: PlaylistThumbnailStore;
  summaryFallbackText: string;
  theme: "dark" | "light";
  videoCount: number;
  playabilityMessage: string;
  recommendationFeedTitle: string;
  onAddMediaLibrary: () => void;
  onOpenMediaProcessingTask: () => void;
  onThumbnailError: (videoId: string) => void;
  onChangeHomeSearch: (query: string) => void;
  onClearHomeSearch: () => void;
  onFocusHomeSearch: () => void;
  onSelectHomeSearchResult: (videoId: string) => void;
  onShowExplore: () => void;
  onShowFeed: () => void;
  onShowHome: () => void;
  onShowPhotoAlbums: () => void;
  onPreloadExplore?: () => void;
  onPreloadPhotoAlbums?: () => void;
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
    playlistThumbnailStore,
    summaryFallbackText,
    theme,
    videoCount,
    playabilityMessage,
    recommendationFeedTitle,
    onAddMediaLibrary,
    onOpenMediaProcessingTask,
    onThumbnailError,
    onChangeHomeSearch,
    onClearHomeSearch,
    onFocusHomeSearch,
    onSelectHomeSearchResult,
    onShowExplore,
    onShowFeed,
    onShowHome,
    onShowPhotoAlbums,
    onPreloadExplore,
    onPreloadPhotoAlbums,
    onToggleTheme,
  },
  ref
) {
  const [isMetadataPinnedOpen, setIsMetadataPinnedOpen] = useState(false);
  const [isHomeSearchFocused, setIsHomeSearchFocused] = useState(false);
  const metadataCardRef = useRef<HTMLButtonElement>(null);
  const shouldShowMetadata = Boolean(currentVideoId) && !isPrivacyMode && !isNonPlayerViewVisible;
  const isPlayerTopRail = !isNonPlayerViewVisible;
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
    <header className={`top-bar${isPlayerTopRail ? " player-top-rail" : ""}`} ref={ref}>
      <div className={`video-summary${shouldShowMetadata ? " has-metadata" : ""}`}>
        {shouldShowMetadata ? (
          <>
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
            <p className="player-top-current-title" title={summaryFallbackText}>{summaryFallbackText}</p>
          </>
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
              if (firstResult && !isHomeSearchPending) onSelectHomeSearchResult(firstResult.video.id);
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
                  homeSearchResults.map((result) => (
                    <HomeSearchResultItem
                      key={result.video.id}
                      result={result}
                      playlistThumbnailStore={playlistThumbnailStore}
                      onSelect={onSelectHomeSearchResult}
                      onThumbnailError={onThumbnailError}
                    />
                  ))
                ) : (
                  <div className="home-top-search-status">没有找到匹配影片</div>
                )}
              </div>
            ) : null}
          </form>
        ) : recommendationFeedTitle ? (
          <p className="current-video-title" title={recommendationFeedTitle}>{recommendationFeedTitle}</p>
        ) : summaryFallbackText ? (
          <p className="current-video-title">{summaryFallbackText}</p>
        ) : null}
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
          <button
            className="secondary-button top-home-button"
            type="button"
            onClick={onShowExplore}
            onFocus={onPreloadExplore}
            onMouseEnter={onPreloadExplore}
          >
            <Compass size={17} />
            探索
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible && videoCount ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowFeed}>
            <Clapperboard size={17} />
            刷片
          </button>
        ) : null}
        {!isPrivacyMode && (videoCount || isExploreViewVisible) && !isHomeViewVisible ? (
          <button className="secondary-button top-home-button" type="button" onClick={onShowHome}>
            首页
          </button>
        ) : null}
        {!isPrivacyMode && isHomeViewVisible ? (
          <button
            className="secondary-button top-home-button"
            type="button"
            onClick={onShowPhotoAlbums}
            onFocus={onPreloadPhotoAlbums}
            onMouseEnter={onPreloadPhotoAlbums}
          >
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

function HomeSearchResultItem({
  result,
  playlistThumbnailStore,
  onSelect,
  onThumbnailError,
}: {
  result: HomeSearchResult;
  playlistThumbnailStore: PlaylistThumbnailStore;
  onSelect: (videoId: string) => void;
  onThumbnailError: (videoId: string) => void;
}) {
  const { video } = result;
  const subscribeToThumbnail = useCallback(
    (listener: () => void) => playlistThumbnailStore.subscribe(video.id, listener),
    [playlistThumbnailStore, video.id],
  );
  const getThumbnailSnapshot = useCallback(
    () => playlistThumbnailStore.get(video.id),
    [playlistThumbnailStore, video.id],
  );
  const playlistThumbnail = useSyncExternalStore(subscribeToThumbnail, getThumbnailSnapshot, getThumbnailSnapshot);
  const thumbnailUrl = playlistThumbnail?.url ?? video.thumbnailUrl;

  return (
    <button className="home-top-search-result" type="button" role="option" aria-selected="false" onClick={() => onSelect(video.id)}>
      <span className={`home-top-search-thumbnail ${thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" decoding="async" loading="lazy" draggable={false} onError={() => onThumbnailError(video.id)} />
        ) : (
          <Film size={22} />
        )}
      </span>
      <span className="home-top-search-result-body">
        <strong>{video.name}</strong>
        <small>{video.relativePath}</small>
        {result.searchMatch?.reasons.length ? <HomeSearchMatchReasons match={result.searchMatch} /> : null}
        <TagChips tags={result.tags} actorTags={result.actorTags} systemTags={result.systemTags} limit={4} compact />
        <RatingChip rating={result.rating} comment={result.comment} />
      </span>
    </button>
  );
}

function HomeSearchMatchReasons({ match }: { match: PlaylistSearchMatch }) {
  const visibleReasons = match.reasons.slice(0, 2);
  const hiddenCount = match.reasons.length - visibleReasons.length;
  const title = match.reasons.map((reason) => `${reason.label}：${reason.value}`).join("\n");

  return (
    <small className="home-top-search-reasons" title={title}>
      {visibleReasons.map((reason) => (
        <span key={`${reason.field}:${reason.value}`}><b>{reason.label}</b> · {reason.value}</span>
      ))}
      {hiddenCount ? <span>+{hiddenCount}</span> : null}
    </small>
  );
}
