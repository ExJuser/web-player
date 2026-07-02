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

type PlaylistVideoListProps = {
  currentVideoId: string | null;
  duplicatePlaylistMetaByVideoId: Map<string, DuplicatePlaylistVideoMeta>;
  favoriteVideoIds: Set<string>;
  homeMediaModeLabel: string;
  isDuplicatePlaylistActive: boolean;
  isRatingPlaylistActive: boolean;
  isPlaylistSeriesMode: boolean;
  isVideoDeletePending: boolean;
  message: string;
  modeFilteredVideoCount: number;
  pagedPlaylistVideos: VideoItem[];
  playlistIndexById: Map<string, number>;
  playlistRef: Ref<HTMLDivElement>;
  progressStore: ProgressStore;
  seriesTitleByVideoId: Map<string, string>;
  totalVideoCount: number;
  videoComments: VideoCommentStore;
  videoRatings: VideoRatingStore;
  videoTags: VideoTagStore;
  visibleVideoCount: number;
  createVideoTitle: (video: VideoItem) => string;
  onDelete: (video: VideoItem) => void;
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
  favoriteVideoIds,
  homeMediaModeLabel,
  isDuplicatePlaylistActive,
  isRatingPlaylistActive,
  isPlaylistSeriesMode,
  isVideoDeletePending,
  message,
  modeFilteredVideoCount,
  pagedPlaylistVideos,
  playlistIndexById,
  playlistRef,
  progressStore,
  seriesTitleByVideoId,
  totalVideoCount,
  videoComments,
  videoRatings,
  videoTags,
  visibleVideoCount,
  createVideoTitle,
  onDelete,
  onFavoriteToggle,
  onOpenRating,
  onResetProgress,
  onScroll,
  onSelect,
  onThumbnailError,
}: PlaylistVideoListProps) {
  return (
    <div className="playlist" ref={playlistRef} onScroll={onScroll}>
      {pagedPlaylistVideos.map((video) => {
        const isActive = video.id === currentVideoId;
        const progress = progressStore[video.id];
        const isCompleted = Boolean(progress?.completed);
        const playlistIndex = playlistIndexById.get(video.id) ?? 0;
        const isFavorite = favoriteVideoIds.has(video.id);
        const seriesTitle = isPlaylistSeriesMode ? seriesTitleByVideoId.get(video.id) : "";
        const duplicateMeta = isDuplicatePlaylistActive ? duplicatePlaylistMetaByVideoId.get(video.id) : null;
        const tags = videoTags[video.id] ?? [];
        const rating = videoRatings[video.id];
        const ratingComment = videoComments[video.id];

        return (
          <PlaylistItemCard
            key={video.id}
            duplicateMeta={duplicateMeta}
            hasProgress={Boolean(progress)}
            isActive={isActive}
            isCompleted={isCompleted}
            isDeletePending={isVideoDeletePending}
            isFavorite={isFavorite}
            playlistIndex={playlistIndex}
            rating={rating}
            ratingComment={ratingComment}
            seriesTitle={seriesTitle}
            tags={tags}
            title={createVideoTitle(video)}
            video={video}
            onDelete={onDelete}
            onFavoriteToggle={onFavoriteToggle}
            onOpenRating={onOpenRating}
            onResetProgress={onResetProgress}
            onSelect={(selectedVideo) => onSelect(selectedVideo, isActive)}
            onThumbnailError={onThumbnailError}
          />
        );
      })}
      <PlaylistEmptyState
        homeMediaModeLabel={homeMediaModeLabel}
        isDuplicatePlaylistActive={isDuplicatePlaylistActive}
        isRatingPlaylistActive={isRatingPlaylistActive}
        message={message}
        modeFilteredVideoCount={modeFilteredVideoCount}
        totalVideoCount={totalVideoCount}
        visibleVideoCount={visibleVideoCount}
      />
    </div>
  );
}
