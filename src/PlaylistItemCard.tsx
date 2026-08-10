import { CheckCircle2, Heart, MoreHorizontal, Play, RotateCcw, Star, Trash2 } from "lucide-react";
import { memo, useCallback, useSyncExternalStore } from "react";

import { RatingChip, TagChips } from "./MetadataChips";
import { formatTime } from "./playerFormatUtils";
import type { PlaybackProgress, VideoItem } from "./playerTypes";
import type { PlaylistSearchMatch } from "./playerPlaylistSearch";
import type { DuplicatePlaylistVideoMeta } from "./playerUiState";
import type { VideoVersionPlaylistMeta } from "./videoVersionUtils";
import type { PlaylistThumbnailStore } from "./playlistThumbnailStore";

type PlaylistItemCardProps = {
  duplicateMeta?: DuplicatePlaylistVideoMeta | null;
  versionMeta?: VideoVersionPlaylistMeta | null;
  progress?: PlaybackProgress;
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
  progress,
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
  const effectiveDuration = video.duration || progress?.duration || 0;
  const progressPercent = progress?.completed
    ? 100
    : effectiveDuration && progress
      ? Math.min(100, Math.max(0, (progress.currentTime / effectiveDuration) * 100))
      : 0;
  const parentPath = video.relativePath.replace(/\\/gu, "/").split("/").slice(0, -1).pop() || "媒体库";
  const versionLabel = versionMeta
    ? versionMeta.role === "original" ? "原版" : versionMeta.role === "edit" ? "剪辑版" : "修复版"
    : null;

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
          {effectiveDuration ? <span className="episode-duration">{formatTime(effectiveDuration)}</span> : null}
          {progressPercent ? <span className="episode-watch-progress" style={{ width: `${progressPercent}%` }} /> : null}
          {isActive ? <span className="episode-playing-indicator"><Play size={12} fill="currentColor" /></span> : null}
        </span>
        <span className="episode-main">
          <strong>{highlightSearchTerms(video.name, searchTerms)}</strong>
          <small className="episode-parent-path">{parentPath}</small>
          <TagChips tags={tags} actorTags={actorTags} systemTags={systemTags} compact userTagsFirst adaptive />
          {searchMatch?.reasons.length ? <SearchMatchReasons match={searchMatch} /> : null}
          {duplicateMeta ? (
            <small className={`episode-duplicate-meta severity-${duplicateMeta.severity}`}>
              第 {duplicateMeta.groupIndex} 组 · {duplicateMeta.severity === "duplicate" ? "高度重复" : "疑似重复"} · {duplicateMeta.groupSize} 个 · {duplicateMeta.reasons.join("、")}
            </small>
          ) : null}
          {versionMeta ? (
            <span className={`episode-version-badge version-${versionMeta.role}`}>{versionLabel}</span>
          ) : null}
          {seriesTitle ? <small className="episode-series">{seriesTitle}</small> : null}
          {showVideoMetadata && typeof rating === "number" ? <RatingChip rating={rating} comment={ratingComment} /> : null}
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
      <details className="episode-action-menu" data-dismiss-on-outside>
        <summary aria-label="影片操作" title="影片操作"><MoreHorizontal size={17} /></summary>
        <div className="episode-action-menu-popover">
          <button type="button" onClick={() => onFavoriteToggle(video)}>
            <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
            {isFavorite ? "取消收藏" : "收藏影片"}
          </button>
          {showVideoMetadata ? (
            <button type="button" onClick={() => onOpenRating(video)}>
              <Star size={15} fill={typeof rating === "number" ? "currentColor" : "none"} />
              {typeof rating === "number" ? `修改评分 · ${rating}` : "给影片评分"}
            </button>
          ) : null}
          <button type="button" onClick={() => onResetProgress(video)} disabled={!progress}>
            <RotateCcw size={15} />清除进度
          </button>
          <button className="danger" type="button" onClick={() => onDelete(video)} disabled={isDeletePending}>
            <Trash2 size={15} />删除磁盘文件
          </button>
        </div>
      </details>
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
