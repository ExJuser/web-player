import type { Ref } from "react";

import { PlaylistEmptyState } from "./PlaylistEmptyState";
import { PlaylistItemCard } from "./PlaylistItemCard";
import type {
  ProgressStore,
  VideoCommentStore,
  VideoItem,
  VideoRatingStore,
  VideoTagStore,
} from "./playerTypes";
import type { DuplicatePlaylistVideoMeta } from "./playerUiState";
import type { PlaylistSearchMatch } from "./playerPlaylistSearch";
import type { VideoVersionPlaylistMeta } from "./videoVersionUtils";
import type { PlaylistThumbnailStore } from "./playlistThumbnailStore";

type PlaylistVideoListProps = {
  currentVideoId: string | null;
  duplicatePlaylistMetaByVideoId: Map<string, DuplicatePlaylistVideoMeta>;
  versionPlaylistMetaByVideoId: Map<string, VideoVersionPlaylistMeta>;
  favoriteVideoIds: Set<string>;
  homeMediaModeLabel: string;
  isDuplicatePlaylistActive: boolean;
  isRatingPlaylistActive: boolean;
  isSearchPending: boolean;
  isPlaylistSeriesMode: boolean;
  isVideoDeletePending: boolean;
  message: string;
  modeFilteredVideoCount: number;
  pagedPlaylistVideos: VideoItem[];
  playlistIndexById: Map<string, number>;
  playlistThumbnailStore: PlaylistThumbnailStore;
  playlistRef: Ref<HTMLDivElement>;
  playlistScopeVideoCount: number;
  progressStore: ProgressStore;
  seriesTitleByVideoId: Map<string, string>;
  showVideoMetadata: boolean;
  searchMatchesByVideoId: ReadonlyMap<string, PlaylistSearchMatch>;
  searchQuery: string;
  searchTerms: string[];
  totalVideoCount: number;
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  videoTags: VideoTagStore;
  systemVideoTags: VideoTagStore;
  videoActorTags: Record<string, string[]>;
  visibleVideoCount: number;
  createVideoTitle: (video: VideoItem) => string;
  onDelete: (video: VideoItem) => void;
  onClearSearch: () => void;
  onFavoriteToggle: (video: VideoItem) => void;
  onOpenRating: (video: VideoItem) => void;
  onResetProgress: (video: VideoItem) => void;
  onScroll: () => void;
  onSelect: (video: VideoItem, isActive: boolean) => void;
  onThumbnailError: (videoId: string) => void;
};

export function PlaylistVideoList({
  currentVideoId,
  duplicatePlaylistMetaByVideoId,
  versionPlaylistMetaByVideoId,
  favoriteVideoIds,
  homeMediaModeLabel,
  isDuplicatePlaylistActive,
  isRatingPlaylistActive,
  isSearchPending,
  isPlaylistSeriesMode,
  isVideoDeletePending,
  message,
  modeFilteredVideoCount,
  pagedPlaylistVideos,
  playlistIndexById,
  playlistThumbnailStore,
  playlistRef,
  playlistScopeVideoCount,
  progressStore,
  seriesTitleByVideoId,
  showVideoMetadata,
  searchMatchesByVideoId,
  searchQuery,
  searchTerms,
  totalVideoCount,
  videoComments,
  videoRatings,
  videoTags,
  systemVideoTags,
  videoActorTags,
  visibleVideoCount,
  createVideoTitle,
  onDelete,
  onClearSearch,
  onFavoriteToggle,
  onOpenRating,
  onResetProgress,
  onScroll,
  onSelect,
  onThumbnailError,
}: PlaylistVideoListProps) {
  return (
    <div
      className="playlist"
      id="player-playlist-results"
      ref={playlistRef}
      role={pagedPlaylistVideos.length ? "list" : undefined}
      aria-busy={isSearchPending}
      aria-label="播放列表"
      onScroll={onScroll}
    >
      {pagedPlaylistVideos.map((video) => {
        const isActive = video.id === currentVideoId;
        const progress = progressStore[video.id];
        const isCompleted = Boolean(progress?.completed);
        const playlistIndex = playlistIndexById.get(video.id) ?? 0;
        const isFavorite = favoriteVideoIds.has(video.id);
        const seriesTitle = isPlaylistSeriesMode ? seriesTitleByVideoId.get(video.id) : "";
        const duplicateMeta = isDuplicatePlaylistActive ? duplicatePlaylistMetaByVideoId.get(video.id) : null;
        const versionMeta = versionPlaylistMetaByVideoId.get(video.id) ?? null;
        const rating = videoRatings[video.id];
        const ratingComment = videoComments[video.id];
        const tags = videoTags[video.id] ?? [];

        return (
          <PlaylistItemCard
            key={video.id}
            duplicateMeta={duplicateMeta}
            versionMeta={versionMeta}
            progress={progress}
            isActive={isActive}
            isCompleted={isCompleted}
            isDeletePending={isVideoDeletePending}
            isFavorite={isFavorite}
            playlistIndex={playlistIndex}
            playlistThumbnailStore={playlistThumbnailStore}
            rating={rating}
            ratingComment={ratingComment}
            searchMatch={searchMatchesByVideoId.get(video.id)}
            searchTerms={searchTerms}
            seriesTitle={seriesTitle}
            showVideoMetadata={showVideoMetadata}
            tags={tags}
            systemTags={systemVideoTags[video.id]}
            actorTags={videoActorTags[video.id]}
            title={createVideoTitle(video)}
            video={video}
            onDelete={onDelete}
            onFavoriteToggle={onFavoriteToggle}
            onOpenRating={onOpenRating}
            onResetProgress={onResetProgress}
            onSelect={onSelect}
            onThumbnailError={onThumbnailError}
          />
        );
      })}
      <PlaylistEmptyState
        homeMediaModeLabel={homeMediaModeLabel}
        isDuplicatePlaylistActive={isDuplicatePlaylistActive}
        isSearchPending={isSearchPending}
        isRatingPlaylistActive={isRatingPlaylistActive}
        message={message}
        modeFilteredVideoCount={modeFilteredVideoCount}
        playlistScopeVideoCount={playlistScopeVideoCount}
        searchQuery={searchQuery}
        totalVideoCount={totalVideoCount}
        visibleVideoCount={visibleVideoCount}
        onClearSearch={onClearSearch}
      />
    </div>
  );
}
