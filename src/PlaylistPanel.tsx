import type { RefObject } from "react";

import { PlayerSearchInput } from "./PlayerSearchInput";
import { PlaylistArchiveTabs, type PlaylistArchiveTab } from "./PlaylistArchiveTabs";
import { PlaylistPagination } from "./PlaylistPagination";
import { PlaylistTools } from "./PlaylistTools";
import { PlaylistVideoList } from "./PlaylistVideoList";
import type { HomeMediaMode, SeriesOption, DuplicatePlaylistVideoMeta } from "./playerUiState";
import type { VideoVersionPlaylistMeta } from "./videoVersionUtils";
import type { PlaylistSearchMatch } from "./playerPlaylistSearch";
import type { PlaylistThumbnailStore } from "./playlistThumbnailStore";
import type {
  PlaylistFilter,
  PlaylistSortMode,
  ProgressStore,
  VideoCommentStore,
  VideoItem,
  VideoRatingStore,
} from "./playerTypes";

type PlaylistPanelProps = {
  ariaLabel: string;
  activeArchiveTabId: string;
  archiveTabs: PlaylistArchiveTab[];
  bangumiButtonTitle: string;
  canOpenBangumiSubject: boolean;
  currentVideoId: string | null;
  duplicatePlaylistMetaByVideoId: Map<string, DuplicatePlaylistVideoMeta>;
  versionPlaylistMetaByVideoId: Map<string, VideoVersionPlaylistMeta>;
  favoriteVideoIds: Set<string>;
  hasModeFilteredVideos: boolean;
  hasVisibleVideos: boolean;
  homeMediaMode: HomeMediaMode;
  homeMediaModeLabel: string;
  isBangumiLoading: boolean;
  isCurrentVideoVisible: boolean;
  isDuplicatePlaylistActive: boolean;
  isVersionPlaylistActive: boolean;
  isTagPlaylistActive: boolean;
  isPlaylistSeriesMode: boolean;
  isPlaylistSortReversed: boolean;
  isRatingPlaylistActive: boolean;
  isSearchPending: boolean;
  isSeriesMenuOpen: boolean;
  isVideoDeletePending: boolean;
  message: string;
  modeFilteredVideoCount: number;
  pagedPlaylistVideos: VideoItem[];
  playerMediaModeLabel: string;
  playlistFilter: PlaylistFilter;
  playlistIndexById: Map<string, number>;
  playlistPageCount: number;
  playlistPageEndLabel: number;
  playlistPageInput: string;
  playlistPageSize: number;
  playlistPageSizeOptions: Array<{ value: number; label: string }>;
  playlistPageStartLabel: number;
  playlistRef: RefObject<HTMLDivElement | null>;
  playlistThumbnailStore: PlaylistThumbnailStore;
  playlistScopeVideoCount: number;
  playlistSearchMatchesByVideoId: ReadonlyMap<string, PlaylistSearchMatch>;
  playlistSearchQuery: string;
  playlistSearchTerms: string[];
  playlistScrollTop: number;
  playlistSortMode: PlaylistSortMode;
  playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }>;
  playlistTitle: string;
  progressStore: ProgressStore;
  selectedSeriesKey: string;
  seriesOptions: SeriesOption[];
  seriesTitleByVideoId: Map<string, string>;
  totalVideoCount: number;
  visiblePlaylistPage: number;
  visibleVideoCount: number;
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  createVideoTitle: (video: VideoItem) => string;
  onActivateArchiveTab: (tabId: string) => void;
  onChangePlaylistFilter: (filter: PlaylistFilter) => void;
  onChangePlaylistSortMode: (sortMode: PlaylistSortMode) => void;
  onChangePlaylistSearch: (query: string) => void;
  onClearPlaylistSearch: () => void;
  onClearDuplicatePlaylist: () => void;
  onClearTagPlaylist: () => void;
  onClearVersionPlaylist: () => void;
  onClearRatingPlaylist: () => void;
  onCommitPlaylistPageInput: () => void;
  onDeleteVideo: (video: VideoItem) => void;
  onFavoriteToggle: (video: VideoItem) => void;
  onOpenBangumiSubject: () => void;
  onOpenRating: (video: VideoItem) => void;
  onPageInputChange: (value: string) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRequestPage: (page: number) => void;
  onResetProgress: (video: VideoItem) => void;
  onScrollPlaylist: () => void;
  onScrollPlaylistToCurrent: () => void;
  onScrollPlaylistToTop: () => void;
  onSelectSeries: (seriesKey: string) => void;
  onSelectVideo: (video: VideoItem, isActive: boolean) => void;
  onThumbnailError: (videoId: string) => void;
  onTogglePlaylistSortDirection: () => void;
  onToggleSeriesMenu: () => void;
  onCloseArchiveTab: (tabId: string) => void;
  onCollapse: () => void;
};

export function PlaylistPanel({
  ariaLabel,
  activeArchiveTabId,
  archiveTabs,
  bangumiButtonTitle,
  canOpenBangumiSubject,
  currentVideoId,
  duplicatePlaylistMetaByVideoId,
  versionPlaylistMetaByVideoId,
  favoriteVideoIds,
  hasModeFilteredVideos,
  hasVisibleVideos,
  homeMediaMode,
  homeMediaModeLabel,
  isBangumiLoading,
  isCurrentVideoVisible,
  isDuplicatePlaylistActive,
  isVersionPlaylistActive,
  isTagPlaylistActive,
  isPlaylistSeriesMode,
  isPlaylistSortReversed,
  isRatingPlaylistActive,
  isSearchPending,
  isSeriesMenuOpen,
  isVideoDeletePending,
  message,
  modeFilteredVideoCount,
  pagedPlaylistVideos,
  playerMediaModeLabel,
  playlistFilter,
  playlistIndexById,
  playlistPageCount,
  playlistPageEndLabel,
  playlistPageInput,
  playlistPageSize,
  playlistPageSizeOptions,
  playlistPageStartLabel,
  playlistRef,
  playlistThumbnailStore,
  playlistScopeVideoCount,
  playlistSearchMatchesByVideoId,
  playlistSearchQuery,
  playlistSearchTerms,
  playlistScrollTop,
  playlistSortMode,
  playlistSortOptions,
  playlistTitle,
  progressStore,
  selectedSeriesKey,
  seriesOptions,
  seriesTitleByVideoId,
  totalVideoCount,
  visiblePlaylistPage,
  visibleVideoCount,
  videoComments,
  videoRatings,
  createVideoTitle,
  onActivateArchiveTab,
  onChangePlaylistFilter,
  onChangePlaylistSortMode,
  onChangePlaylistSearch,
  onClearPlaylistSearch,
  onClearDuplicatePlaylist,
  onClearTagPlaylist,
  onClearVersionPlaylist,
  onClearRatingPlaylist,
  onCommitPlaylistPageInput,
  onDeleteVideo,
  onFavoriteToggle,
  onOpenBangumiSubject,
  onOpenRating,
  onPageInputChange,
  onPageSizeChange,
  onRequestPage,
  onResetProgress,
  onScrollPlaylist,
  onScrollPlaylistToCurrent,
  onScrollPlaylistToTop,
  onSelectSeries,
  onSelectVideo,
  onThumbnailError,
  onTogglePlaylistSortDirection,
  onToggleSeriesMenu,
  onCloseArchiveTab,
  onCollapse,
}: PlaylistPanelProps) {
  return (
    <aside className="playlist-panel" aria-label={ariaLabel}>
      <div className="playlist-archive-heading">
        <div>
          <span className="playlist-archive-eyebrow">私人影片档案</span>
          <strong>影片档案</strong>
        </div>
        <button className="playlist-collapse-button" type="button" onClick={onCollapse} aria-label="折叠影片档案" title="折叠影片档案">
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <PlaylistArchiveTabs
        activeTabId={activeArchiveTabId}
        tabs={archiveTabs}
        onActivate={onActivateArchiveTab}
        onClose={onCloseArchiveTab}
      />
      <div className="playlist-header">
        <div className="playlist-title-row">
          <span className={`player-mode-indicator mode-${homeMediaMode}`} title={`当前播放模式：${playerMediaModeLabel}`}>
            {isDuplicatePlaylistActive ? "重复" : isVersionPlaylistActive ? "版本" : isRatingPlaylistActive ? "评分" : isTagPlaylistActive ? "标签" : playerMediaModeLabel}
          </span>
          <span className="playlist-title-text">{playlistTitle}</span>
        </div>
        <PlaylistTools
          bangumiButtonTitle={bangumiButtonTitle}
          canOpenBangumiSubject={canOpenBangumiSubject}
          hasModeFilteredVideos={hasModeFilteredVideos}
          hasVisibleVideos={hasVisibleVideos}
          isBangumiLoading={isBangumiLoading}
          isCurrentVideoVisible={isCurrentVideoVisible}
          isDuplicatePlaylistActive={isDuplicatePlaylistActive}
          isVersionPlaylistActive={isVersionPlaylistActive}
          isTagPlaylistActive={isTagPlaylistActive}
          isPlaylistSeriesMode={isPlaylistSeriesMode}
          isPlaylistSortReversed={isPlaylistSortReversed}
          isRatingPlaylistActive={isRatingPlaylistActive}
          isSeriesMenuOpen={isSeriesMenuOpen}
          playlistFilter={playlistFilter}
          playlistScrollTop={playlistScrollTop}
          playlistSortMode={playlistSortMode}
          playlistSortOptions={playlistSortOptions}
          selectedSeriesKey={selectedSeriesKey}
          seriesOptions={seriesOptions}
          onChangePlaylistFilter={onChangePlaylistFilter}
          onChangePlaylistSortMode={onChangePlaylistSortMode}
          onClearDuplicatePlaylist={onClearDuplicatePlaylist}
          onClearTagPlaylist={onClearTagPlaylist}
          onClearVersionPlaylist={onClearVersionPlaylist}
          onClearRatingPlaylist={onClearRatingPlaylist}
          onOpenBangumiSubject={onOpenBangumiSubject}
          onScrollPlaylistToCurrent={onScrollPlaylistToCurrent}
          onScrollPlaylistToTop={onScrollPlaylistToTop}
          onSelectSeries={onSelectSeries}
          onTogglePlaylistSortDirection={onTogglePlaylistSortDirection}
          onToggleSeriesMenu={onToggleSeriesMenu}
        />
      </div>

      <PlayerSearchInput
        isPending={isSearchPending}
        query={playlistSearchQuery}
        resultCount={visibleVideoCount}
        scopeCount={playlistScopeVideoCount}
        onChange={onChangePlaylistSearch}
        onClear={onClearPlaylistSearch}
        onSubmit={() => {
          const firstVideo = pagedPlaylistVideos[0];
          if (!firstVideo) return;
          if (visibleVideoCount === 1) {
            onSelectVideo(firstVideo, firstVideo.id === currentVideoId);
            return;
          }
          onRequestPage(1);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              const firstResult = playlistRef.current?.querySelector<HTMLButtonElement>(".playlist-select");
              firstResult?.focus();
              firstResult?.scrollIntoView({ block: "nearest" });
            });
          });
        }}
      />

      <PlaylistVideoList
        currentVideoId={currentVideoId}
        duplicatePlaylistMetaByVideoId={duplicatePlaylistMetaByVideoId}
        versionPlaylistMetaByVideoId={versionPlaylistMetaByVideoId}
        favoriteVideoIds={favoriteVideoIds}
        homeMediaModeLabel={homeMediaModeLabel}
        isDuplicatePlaylistActive={isDuplicatePlaylistActive}
        isRatingPlaylistActive={isRatingPlaylistActive}
        isSearchPending={isSearchPending}
        isPlaylistSeriesMode={isPlaylistSeriesMode}
        isVideoDeletePending={isVideoDeletePending}
        message={message}
        modeFilteredVideoCount={modeFilteredVideoCount}
        pagedPlaylistVideos={pagedPlaylistVideos}
        playlistIndexById={playlistIndexById}
        playlistRef={playlistRef}
        playlistThumbnailStore={playlistThumbnailStore}
        playlistScopeVideoCount={playlistScopeVideoCount}
        progressStore={progressStore}
        seriesTitleByVideoId={seriesTitleByVideoId}
        showVideoMetadata={homeMediaMode === "special"}
        searchMatchesByVideoId={playlistSearchMatchesByVideoId}
        searchQuery={playlistSearchQuery}
        searchTerms={playlistSearchTerms}
        totalVideoCount={totalVideoCount}
        videoComments={videoComments}
        videoRatings={videoRatings}
        visibleVideoCount={visibleVideoCount}
        createVideoTitle={createVideoTitle}
        onClearSearch={onClearPlaylistSearch}
        onDelete={onDeleteVideo}
        onFavoriteToggle={onFavoriteToggle}
        onOpenRating={onOpenRating}
        onResetProgress={onResetProgress}
        onScroll={onScrollPlaylist}
        onSelect={onSelectVideo}
        onThumbnailError={onThumbnailError}
      />
      <PlaylistPagination
        endLabel={playlistPageEndLabel}
        page={visiblePlaylistPage}
        pageCount={playlistPageCount}
        pageInput={playlistPageInput}
        pageSize={playlistPageSize}
        pageSizeOptions={playlistPageSizeOptions}
        startLabel={playlistPageStartLabel}
        total={visibleVideoCount}
        onCommitPageInput={onCommitPlaylistPageInput}
        onPageInputChange={onPageInputChange}
        onPageSizeChange={onPageSizeChange}
        onRequestPage={onRequestPage}
      />
    </aside>
  );
}
