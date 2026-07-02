type PlaylistEmptyStateProps = {
  homeMediaModeLabel: string;
  isDuplicatePlaylistActive: boolean;
  isRatingPlaylistActive: boolean;
  message: string;
  modeFilteredVideoCount: number;
  totalVideoCount: number;
  visibleVideoCount: number;
};

export function PlaylistEmptyState({
  homeMediaModeLabel,
  isDuplicatePlaylistActive,
  isRatingPlaylistActive,
  message,
  modeFilteredVideoCount,
  totalVideoCount,
  visibleVideoCount,
}: PlaylistEmptyStateProps) {
  if (!totalVideoCount) {
    return <div className="empty-list">{message}</div>;
  }
  if (isDuplicatePlaylistActive && !visibleVideoCount) {
    return <div className="empty-list">重复列表已清空</div>;
  }
  if (isRatingPlaylistActive && !visibleVideoCount) {
    return <div className="empty-list">评分列表已清空</div>;
  }
  if (!isDuplicatePlaylistActive && !isRatingPlaylistActive && !modeFilteredVideoCount) {
    return <div className="empty-list">当前{homeMediaModeLabel}没有视频</div>;
  }
  if (modeFilteredVideoCount && !isDuplicatePlaylistActive && !isRatingPlaylistActive && !visibleVideoCount) {
    return <div className="empty-list">还没有收藏的视频</div>;
  }
  return null;
}
