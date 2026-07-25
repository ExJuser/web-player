import { ArrowDownUp, ArrowUp, LocateFixed } from "lucide-react";

import { BangumiLinkButton } from "./BangumiLinkButton";
import { ControlSelect } from "./ControlSelect";
import { PlaylistFilterControl } from "./PlaylistFilterControl";
import { SeriesMenu } from "./SeriesMenu";
import type { PlaylistFilter, PlaylistSortMode } from "./playerTypes";
import type { SeriesOption } from "./playerUiState";

type PlaylistToolsProps = {
  bangumiButtonTitle: string;
  canOpenBangumiSubject: boolean;
  hasModeFilteredVideos: boolean;
  hasVisibleVideos: boolean;
  isBangumiLoading: boolean;
  isCurrentVideoVisible: boolean;
  isDuplicatePlaylistActive: boolean;
  isVersionPlaylistActive: boolean;
  isTagPlaylistActive: boolean;
  isPlaylistSeriesMode: boolean;
  isPlaylistSortReversed: boolean;
  isRatingPlaylistActive: boolean;
  isSeriesMenuOpen: boolean;
  playlistFilter: PlaylistFilter;
  playlistSortMode: PlaylistSortMode;
  playlistSortOptions: Array<{ value: PlaylistSortMode; label: string }>;
  playlistScrollTop: number;
  selectedSeriesKey: string;
  seriesOptions: SeriesOption[];
  onChangePlaylistFilter: (filter: PlaylistFilter) => void;
  onChangePlaylistSortMode: (sortMode: PlaylistSortMode) => void;
  onClearDuplicatePlaylist: () => void;
  onClearTagPlaylist: () => void;
  onClearVersionPlaylist: () => void;
  onClearRatingPlaylist: () => void;
  onOpenBangumiSubject: () => void;
  onScrollPlaylistToCurrent: () => void;
  onScrollPlaylistToTop: () => void;
  onSelectSeries: (seriesKey: string) => void;
  onTogglePlaylistSortDirection: () => void;
  onToggleSeriesMenu: () => void;
};

export function PlaylistTools({
  bangumiButtonTitle,
  canOpenBangumiSubject,
  hasModeFilteredVideos,
  hasVisibleVideos,
  isBangumiLoading,
  isCurrentVideoVisible,
  isDuplicatePlaylistActive,
  isVersionPlaylistActive,
  isTagPlaylistActive,
  isPlaylistSeriesMode,
  isPlaylistSortReversed,
  isRatingPlaylistActive,
  isSeriesMenuOpen,
  playlistFilter,
  playlistScrollTop,
  playlistSortMode,
  playlistSortOptions,
  selectedSeriesKey,
  seriesOptions,
  onChangePlaylistFilter,
  onChangePlaylistSortMode,
  onClearDuplicatePlaylist,
  onClearTagPlaylist,
  onClearVersionPlaylist,
  onClearRatingPlaylist,
  onOpenBangumiSubject,
  onScrollPlaylistToCurrent,
  onScrollPlaylistToTop,
  onSelectSeries,
  onTogglePlaylistSortDirection,
  onToggleSeriesMenu,
}: PlaylistToolsProps) {
  const isPlaylistListLocked = isDuplicatePlaylistActive || isVersionPlaylistActive || isRatingPlaylistActive;

  return (
    <div className={`playlist-tools ${isPlaylistSeriesMode ? "series-mode" : ""}`}>
      {isPlaylistSeriesMode ? (
        <SeriesMenu
          isOpen={isSeriesMenuOpen}
          options={seriesOptions}
          selectedSeriesKey={selectedSeriesKey}
          onSelectSeries={onSelectSeries}
          onToggleOpen={onToggleSeriesMenu}
        />
      ) : null}
      {isPlaylistSeriesMode ? (
        <BangumiLinkButton
          canOpen={canOpenBangumiSubject}
          isLoading={isBangumiLoading}
          title={bangumiButtonTitle}
          onOpen={onOpenBangumiSubject}
        />
      ) : null}
      <ControlSelect
        label="排序"
        ariaLabel="播放列表排序方式"
        value={playlistSortMode}
        options={playlistSortOptions}
        onChange={onChangePlaylistSortMode}
        className="playlist-sort-control"
        disabled={isPlaylistListLocked || !hasModeFilteredVideos}
      />
      <button
        className={`playlist-order-button ${isPlaylistSortReversed ? "active" : ""}`}
        type="button"
        onClick={onTogglePlaylistSortDirection}
        disabled={isPlaylistListLocked || !hasModeFilteredVideos}
        title={isPlaylistSortReversed ? "切换为正序" : "切换为倒序"}
        aria-label={isPlaylistSortReversed ? "切换为正序" : "切换为倒序"}
      >
        <ArrowDownUp size={16} />
      </button>
      <button
        className="playlist-top-button"
        type="button"
        onClick={onScrollPlaylistToTop}
        disabled={!hasVisibleVideos || playlistScrollTop <= 0}
        title="回到顶部"
        aria-label="回到顶部"
      >
        <ArrowUp size={16} />
      </button>
      <button
        className="playlist-locate-button"
        type="button"
        onClick={onScrollPlaylistToCurrent}
        disabled={!isCurrentVideoVisible}
        title={isCurrentVideoVisible ? "回到当前播放" : "当前播放不在列表筛选结果中"}
        aria-label={isCurrentVideoVisible ? "回到当前播放" : "当前播放不在列表筛选结果中"}
      >
        <LocateFixed size={16} />
      </button>
      {isDuplicatePlaylistActive ? (
        <button className="playlist-clear-button" type="button" onClick={onClearDuplicatePlaylist} title="退出重复列表">
          退出
        </button>
      ) : isVersionPlaylistActive ? (
        <button className="playlist-clear-button" type="button" onClick={onClearVersionPlaylist} title="退出版本列表">
          退出
        </button>
      ) : isRatingPlaylistActive ? (
        <button className="playlist-clear-button" type="button" onClick={onClearRatingPlaylist} title="退出评分列表">
          退出
        </button>
      ) : isTagPlaylistActive ? (
        <button className="playlist-clear-button" type="button" onClick={onClearTagPlaylist} title="退出标签片单">
          退出
        </button>
      ) : !isPlaylistSeriesMode ? (
        <PlaylistFilterControl disabled={!hasModeFilteredVideos} filter={playlistFilter} onChange={onChangePlaylistFilter} />
      ) : null}
    </div>
  );
}
