import type { FocusEvent as ReactFocusEvent, ReactNode, Ref } from "react";

import { PlayerLibrarySearchSection } from "./PlayerLibrarySearchSection";
import { PlaylistPagination } from "./PlaylistPagination";
import { PlaylistTools } from "./PlaylistTools";
import { PlaylistVideoList } from "./PlaylistVideoList";
import type { HomeMediaMode, SeriesOption, DuplicatePlaylistVideoMeta } from "./playerUiState";
import type { VideoVersionPlaylistMeta } from "./videoVersionUtils";
import type {
  PlaylistFilter,
  PlaylistSortMode,
  ProgressStore,
  VideoCommentStore,
  VideoItem,
  VideoRatingStore,
  VideoTagStore,
} from "./playerTypes";

type PlaylistPanelProps = {
  ariaLabel: string;
  bangumiButtonTitle: string;
  canOpenBangumiSubject: boolean;
  currentVideoId: string | null;
  defaultLibrarySearchStatus: string;
  duplicatePlaylistMetaByVideoId: Map<string, DuplicatePlaylistVideoMeta>;
  versionPlaylistMetaByVideoId: Map<string, VideoVersionPlaylistMeta>;
  favoriteVideoIds: Set<string>;
  hasModeFilteredVideos: boolean;
  hasMorePlayerLibrarySearchResults: boolean;
  hasVisibleVideos: boolean;
  homeMediaMode: HomeMediaMode;
  homeMediaModeLabel: string;
  isBangumiLoading: boolean;
  isCurrentVideoVisible: boolean;
  isDuplicatePlaylistActive: boolean;
  isVersionPlaylistActive: boolean;
  isPlayerLibrarySearchEmpty: boolean;
  isPlayerLibrarySearchLoading: boolean;
  isPlaylistSeriesMode: boolean;
  isPlaylistSortReversed: boolean;
  isRatingPlaylistActive: boolean;
  isSeriesMenuOpen: boolean;
  isVideoDeletePending: boolean;
  message: string;
  modeFilteredVideoCount: number;
  pagedPlaylistVideos: VideoItem[];
  playerLibrarySearchAnswer: string;
  playerLibrarySearchDisabled: boolean;
  playerLibrarySearchEmptyTarget: string;
  playerLibrarySearchInput: string;
  playerLibrarySearchLoadMoreRef: Ref<HTMLDivElement>;
  playerLibrarySearchPlaceholder: string;
  playerLibrarySearchPreviewItems: ReactNode;
  playerLibrarySearchResultsRef: Ref<HTMLDivElement>;
  playerLibrarySearchSearchMode: string;
  playerLibrarySearchStatusMessage: string;
  playerLibrarySearchTotalCount: number;
  playerMediaModeLabel: string;
  playlistFilter: PlaylistFilter;
  playlistIndexById: Map<string, number>;
  playlistPageCount: number;
  playlistPageEndLabel: number;
  playlistPageInput: string;
  playlistPageSize: number;
  playlistPageSizeOptions: Array<{ value: number; label: string }>;
  playlistPageStartLabel: number;
  playlistRef: Ref<HTMLDivElement>;
  playlistScrollTop: number;
  playlistSortMode: PlaylistSortMode;
  playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }>;
  playlistTitle: string;
  progressStore: ProgressStore;
  selectedSeriesKey: string;
  seriesOptions: SeriesOption[];
  seriesTitleByVideoId: Map<string, string>;
  shouldShowPlayerLibrarySearchPreview: boolean;
  shouldShowPlayerLibrarySearchStatus: boolean;
  totalVideoCount: number;
  visiblePlayerLibrarySearchItems: ReactNode;
  visiblePlayerLibrarySearchResultCount: number;
  visiblePlaylistPage: number;
  visibleVideoCount: number;
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  videoTags: VideoTagStore;
  createVideoTitle: (video: VideoItem) => string;
  onChangePlaylistFilter: (filter: PlaylistFilter) => void;
  onChangePlaylistSortMode: (sortMode: PlaylistSortMode) => void;
  onClearDuplicatePlaylist: () => void;
  onClearVersionPlaylist: () => void;
  onClearRatingPlaylist: () => void;
  onCommitPlaylistPageInput: () => void;
  onDeleteVideo: (video: VideoItem) => void;
  onFavoriteToggle: (video: VideoItem) => void;
  onLibrarySearchBlur: (event: ReactFocusEvent<HTMLElement>) => void;
  onLibrarySearchFocus: () => void;
  onLibrarySearchInputChange: (value: string) => void;
  onLibrarySearchLoadMore: () => void;
  onLibrarySearchSubmit: () => void;
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
};

export function PlaylistPanel({
  ariaLabel,
  bangumiButtonTitle,
  canOpenBangumiSubject,
  currentVideoId,
  defaultLibrarySearchStatus,
  duplicatePlaylistMetaByVideoId,
  versionPlaylistMetaByVideoId,
  favoriteVideoIds,
  hasModeFilteredVideos,
  hasMorePlayerLibrarySearchResults,
  hasVisibleVideos,
  homeMediaMode,
  homeMediaModeLabel,
  isBangumiLoading,
  isCurrentVideoVisible,
  isDuplicatePlaylistActive,
  isVersionPlaylistActive,
  isPlayerLibrarySearchEmpty,
  isPlayerLibrarySearchLoading,
  isPlaylistSeriesMode,
  isPlaylistSortReversed,
  isRatingPlaylistActive,
  isSeriesMenuOpen,
  isVideoDeletePending,
  message,
  modeFilteredVideoCount,
  pagedPlaylistVideos,
  playerLibrarySearchAnswer,
  playerLibrarySearchDisabled,
  playerLibrarySearchEmptyTarget,
  playerLibrarySearchInput,
  playerLibrarySearchLoadMoreRef,
  playerLibrarySearchPlaceholder,
  playerLibrarySearchPreviewItems,
  playerLibrarySearchResultsRef,
  playerLibrarySearchSearchMode,
  playerLibrarySearchStatusMessage,
  playerLibrarySearchTotalCount,
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
  playlistScrollTop,
  playlistSortMode,
  playlistSortOptions,
  playlistTitle,
  progressStore,
  selectedSeriesKey,
  seriesOptions,
  seriesTitleByVideoId,
  shouldShowPlayerLibrarySearchPreview,
  shouldShowPlayerLibrarySearchStatus,
  totalVideoCount,
  visiblePlayerLibrarySearchItems,
  visiblePlayerLibrarySearchResultCount,
  visiblePlaylistPage,
  visibleVideoCount,
  videoComments,
  videoRatings,
  videoTags,
  createVideoTitle,
  onChangePlaylistFilter,
  onChangePlaylistSortMode,
  onClearDuplicatePlaylist,
  onClearVersionPlaylist,
  onClearRatingPlaylist,
  onCommitPlaylistPageInput,
  onDeleteVideo,
  onFavoriteToggle,
  onLibrarySearchBlur,
  onLibrarySearchFocus,
  onLibrarySearchInputChange,
  onLibrarySearchLoadMore,
  onLibrarySearchSubmit,
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
}: PlaylistPanelProps) {
  return (
    <aside className="playlist-panel" aria-label={ariaLabel}>
      <div className="playlist-header">
        <div className="playlist-title-row">
          <span className={`player-mode-indicator mode-${homeMediaMode}`} title={`当前播放模式：${playerMediaModeLabel}`}>
            {isDuplicatePlaylistActive ? "重复" : isVersionPlaylistActive ? "版本" : isRatingPlaylistActive ? "评分" : playerMediaModeLabel}
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

      <PlayerLibrarySearchSection
        answer={playerLibrarySearchAnswer}
        defaultStatus={defaultLibrarySearchStatus}
        disabled={playerLibrarySearchDisabled}
        emptyTarget={playerLibrarySearchEmptyTarget}
        hasMoreResults={hasMorePlayerLibrarySearchResults}
        inputValue={playerLibrarySearchInput}
        isEmpty={isPlayerLibrarySearchEmpty}
        isLoading={isPlayerLibrarySearchLoading}
        loadMoreRef={playerLibrarySearchLoadMoreRef}
        placeholder={playerLibrarySearchPlaceholder}
        previewResults={playerLibrarySearchPreviewItems}
        results={visiblePlayerLibrarySearchItems}
        resultsRef={playerLibrarySearchResultsRef}
        searchMode={playerLibrarySearchSearchMode}
        shouldShowPreview={shouldShowPlayerLibrarySearchPreview}
        shouldShowStatus={shouldShowPlayerLibrarySearchStatus}
        statusMessage={playerLibrarySearchStatusMessage}
        totalCount={playerLibrarySearchTotalCount}
        visibleCount={visiblePlayerLibrarySearchResultCount}
        onBlur={onLibrarySearchBlur}
        onFocus={onLibrarySearchFocus}
        onInputChange={onLibrarySearchInputChange}
        onLoadMore={onLibrarySearchLoadMore}
        onSubmit={onLibrarySearchSubmit}
      />

      <PlaylistVideoList
        currentVideoId={currentVideoId}
        duplicatePlaylistMetaByVideoId={duplicatePlaylistMetaByVideoId}
        versionPlaylistMetaByVideoId={versionPlaylistMetaByVideoId}
        favoriteVideoIds={favoriteVideoIds}
        homeMediaModeLabel={homeMediaModeLabel}
        isDuplicatePlaylistActive={isDuplicatePlaylistActive}
        isVersionPlaylistActive={isVersionPlaylistActive}
        isRatingPlaylistActive={isRatingPlaylistActive}
        isPlaylistSeriesMode={isPlaylistSeriesMode}
        isVideoDeletePending={isVideoDeletePending}
        message={message}
        modeFilteredVideoCount={modeFilteredVideoCount}
        pagedPlaylistVideos={pagedPlaylistVideos}
        playlistIndexById={playlistIndexById}
        playlistRef={playlistRef}
        progressStore={progressStore}
        seriesTitleByVideoId={seriesTitleByVideoId}
        totalVideoCount={totalVideoCount}
        videoComments={videoComments}
        videoRatings={videoRatings}
        videoTags={videoTags}
        visibleVideoCount={visibleVideoCount}
        createVideoTitle={createVideoTitle}
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
