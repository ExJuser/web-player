type PlaylistEmptyStateProps = {
  homeMediaModeLabel: string;
  isDuplicatePlaylistActive: boolean;
  isSearchPending: boolean;
  isRatingPlaylistActive: boolean;
  message: string;
  modeFilteredVideoCount: number;
  playlistScopeVideoCount: number;
  searchQuery: string;
  totalVideoCount: number;
  visibleVideoCount: number;
  onClearSearch: () => void;
};

export function PlaylistEmptyState({
  homeMediaModeLabel,
  isDuplicatePlaylistActive,
  isSearchPending,
  isRatingPlaylistActive,
  message,
  modeFilteredVideoCount,
  playlistScopeVideoCount,
  searchQuery,
  totalVideoCount,
  visibleVideoCount,
  onClearSearch,
}: PlaylistEmptyStateProps) {
  if (!totalVideoCount) {
    return <div className="empty-list">{message}</div>;
  }
  if (searchQuery.trim() && playlistScopeVideoCount && !visibleVideoCount) {
    if (isSearchPending) return null;
    return (
      <div className="empty-list playlist-search-empty">
        <span>没有找到与“<strong>{searchQuery.trim()}</strong>”匹配的影片</span>
        <button type="button" onClick={onClearSearch}>清空搜索</button>
      </div>
    );
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
