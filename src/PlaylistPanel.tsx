import type { Ref } from "react";

import { PlayerSearchInput } from "./PlayerSearchInput";
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
  isPlaylistSeriesMode: boolean;
  isPlaylistSortReversed: boolean;
  isRatingPlaylistActive: boolean;
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
  playlistRef: Ref<HTMLDivElement>;
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
  videoTags: VideoTagStore;
  videoActorTags: Record<string, string[]>;
  createVideoTitle: (video: VideoItem) => string;
  onChangePlaylistFilter: (filter: PlaylistFilter) => void;
  onChangePlaylistSortMode: (sortMode: PlaylistSortMode) => void;
  onClearDuplicatePlaylist: () => void;
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
};

export function PlaylistPanel({
  ariaLabel,
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
  isPlaylistSeriesMode,
  isPlaylistSortReversed,
  isRatingPlaylistActive,
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
  videoTags,
  videoActorTags,
  createVideoTitle,
  onChangePlaylistFilter,
  onChangePlaylistSortMode,
  onClearDuplicatePlaylist,
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

      <PlayerSearchInput />

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
        showVideoMetadata={homeMediaMode === "special"}
        totalVideoCount={totalVideoCount}
        videoComments={videoComments}
        videoRatings={videoRatings}
        videoTags={videoTags}
        videoActorTags={videoActorTags}
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
