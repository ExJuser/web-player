import { CheckCircle2, Heart, RotateCcw, Star, Trash2 } from "lucide-react";
import { memo, useCallback, useSyncExternalStore } from "react";

import { RatingChip, TagChips } from "./MetadataChips";
import type { VideoItem } from "./playerTypes";
import type { PlaylistSearchMatch } from "./playerPlaylistSearch";
import type { DuplicatePlaylistVideoMeta } from "./playerUiState";
import type { VideoVersionPlaylistMeta } from "./videoVersionUtils";
import type { PlaylistThumbnailStore } from "./playlistThumbnailStore";

type PlaylistItemCardProps = {
  duplicateMeta?: DuplicatePlaylistVideoMeta | null;
  versionMeta?: VideoVersionPlaylistMeta | null;
  hasProgress: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isDeletePending: boolean;
  isFavorite: boolean;
  playlistIndex: number;
  playlistThumbnailStore: PlaylistThumbnailStore;
  rating?: number;
  ratingComment?: string;
  searchMatch?: PlaylistSearchMatch;
  searchTerms: string[];
  seriesTitle?: string;
  showVideoMetadata: boolean;
  tags: string[];
  actorTags?: string[];
  systemTags?: string[];
  title: string;
  video: VideoItem;
  onDelete: (video: VideoItem) => void;
  onFavoriteToggle: (video: VideoItem) => void;
  onOpenRating: (video: VideoItem) => void;
  onResetProgress: (video: VideoItem) => void;
  onSelect: (video: VideoItem, isActive: boolean) => void;
  onThumbnailError: (videoId: string) => void;
};

export const PlaylistItemCard = memo(function PlaylistItemCard({
  duplicateMeta,
  versionMeta,
  hasProgress,
  isActive,
  isCompleted,
  isDeletePending,
  isFavorite,
  playlistIndex,
  playlistThumbnailStore,
  rating,
  ratingComment,
  searchMatch,
  searchTerms,
  seriesTitle,
  showVideoMetadata,
  tags,
  actorTags,
  systemTags,
  title,
  video,
  onDelete,
  onFavoriteToggle,
  onOpenRating,
  onResetProgress,
  onSelect,
  onThumbnailError,
}: PlaylistItemCardProps) {
  const subscribeToThumbnail = useCallback(
    (listener: () => void) => playlistThumbnailStore.subscribe(video.id, listener),
    [playlistThumbnailStore, video.id],
  );
  const getThumbnailSnapshot = useCallback(
    () => playlistThumbnailStore.get(video.id),
    [playlistThumbnailStore, video.id],
  );
  const playlistThumbnail = useSyncExternalStore(subscribeToThumbnail, getThumbnailSnapshot, getThumbnailSnapshot);
  const thumbnailUrl = playlistThumbnail ? playlistThumbnail.url : video.thumbnailUrl;

  return (
    <div
      className={`playlist-item ${isActive ? "active" : ""}`}
      data-video-id={video.id}
      role="listitem"
      title={title}
    >
      <button
        className="playlist-select"
        type="button"
        aria-current={isActive ? "true" : undefined}
        onClick={() => onSelect(video, isActive)}
      >
        <span className={`episode-thumbnail ${thumbnailUrl ? "has-image" : ""}`} aria-hidden="true">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              decoding="async"
              loading="lazy"
              draggable={false}
              onError={() => onThumbnailError(video.id)}
            />
          ) : (
            <span>{String(playlistIndex + 1).padStart(2, "0")}</span>
          )}
        </span>
        <span className="episode-main">
          <strong>{highlightSearchTerms(video.name, searchTerms)}</strong>
          <small>{video.relativePath}</small>
          {searchMatch?.reasons.length ? <SearchMatchReasons match={searchMatch} /> : null}
          {duplicateMeta ? (
            <small className={`episode-duplicate-meta severity-${duplicateMeta.severity}`}>
              第 {duplicateMeta.groupIndex} 组 · {duplicateMeta.severity === "duplicate" ? "高度重复" : "疑似重复"} · {duplicateMeta.groupSize} 个 · {duplicateMeta.reasons.join("、")}
            </small>
          ) : null}
          {versionMeta ? (
            <small className={`episode-duplicate-meta severity-${versionMeta.role}`}>
              第 {versionMeta.groupIndex} 组 · {versionMeta.role === "original" ? "原版" : versionMeta.role === "edit" ? "剪辑版" : "修复版"} · 本组 {versionMeta.groupSize} 个
            </small>
          ) : null}
          {seriesTitle ? <small className="episode-series">{seriesTitle}</small> : null}
          {showVideoMetadata ? <TagChips tags={tags} actorTags={actorTags} systemTags={systemTags} compact /> : null}
          {showVideoMetadata ? <RatingChip rating={rating} comment={ratingComment} /> : null}
          {isCompleted ? (
            <span className="episode-progress compact">
              <CheckCircle2 size={15} />
              已看完
            </span>
          ) : null}
        </span>
      </button>
      {isCompleted ? (
        <span className="episode-progress">
          <CheckCircle2 size={15} />
          已看完
        </span>
      ) : null}
      <span className="episode-actions">
        <button
          className={`episode-action-button favorite ${isFavorite ? "active" : ""}`}
          type="button"
          onClick={() => onFavoriteToggle(video)}
          title={isFavorite ? "取消收藏" : "收藏/稍后看"}
          aria-label={isFavorite ? "取消收藏" : "收藏/稍后看"}
        >
          <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        {showVideoMetadata ? (
          <button
            className={`episode-action-button rating ${typeof rating === "number" ? "active" : ""}`}
            type="button"
            onClick={() => onOpenRating(video)}
            title={typeof rating === "number" ? `当前评分 ${rating}/10` : "给视频评分"}
            aria-label="给视频评分"
          >
            <Star size={15} fill={typeof rating === "number" ? "currentColor" : "none"} />
          </button>
        ) : null}
        <button
          className="episode-action-button"
          type="button"
          onClick={() => onResetProgress(video)}
          disabled={!hasProgress}
          title="清除进度"
          aria-label="清除进度"
        >
          <RotateCcw size={15} />
        </button>
        <button
          className="episode-action-button danger"
          type="button"
          onClick={() => onDelete(video)}
          disabled={isDeletePending}
          title="删除磁盘文件"
          aria-label="删除磁盘文件"
        >
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );
});

function highlightSearchTerms(text: string, terms: string[]) {
  const escapedTerms = terms
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  if (!escapedTerms.length) return text;

  const parts = text.split(new RegExp(`(${escapedTerms.join("|")})`, "giu"));
  return parts.map((part, index) => index % 2 ? <mark key={`${part}:${index}`}>{part}</mark> : part);
}

function SearchMatchReasons({ match }: { match: PlaylistSearchMatch }) {
  const visibleReasons = match.reasons.slice(0, 2);
  const hiddenCount = match.reasons.length - visibleReasons.length;
  const title = match.reasons.map((reason) => `${reason.label}：${reason.value}`).join("\n");

  return (
    <small className="playlist-search-reasons" title={title}>
      {visibleReasons.map((reason) => (
        <span key={`${reason.field}:${reason.value}`}><b>{reason.label}</b> · {reason.value}</span>
      ))}
      {hiddenCount ? <span>+{hiddenCount}</span> : null}
    </small>
  );
}
