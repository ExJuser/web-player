import { Activity, Play, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import type { DuplicateVideoGroup } from "./playerMediaUtils";

type DuplicateVideoSummaryCardProps = {
  detectionMessage: string;
  detectionPercent: number;
  duplicatePlaylistCount: number;
  groups: DuplicateVideoGroup[];
  isRunning: boolean;
  progress: { percent: number } | null;
  totalVideoCount: number;
  onOpenPlaylist: () => void;
  onRunDetection: () => void;
  renderGroup: (group: DuplicateVideoGroup) => ReactNode;
};

export function DuplicateVideoSummaryCard({
  detectionMessage,
  detectionPercent,
  duplicatePlaylistCount,
  groups,
  isRunning,
  progress,
  totalVideoCount,
  onOpenPlaylist,
  onRunDetection,
  renderGroup,
}: DuplicateVideoSummaryCardProps) {
  return (
    <section className="home-section duplicate-video-card">
      <div className="home-section-header">
        <h2>重复视频</h2>
        <span>{isRunning ? `${detectionPercent}%` : `${groups.length} 组`}</span>
      </div>
      <div className="duplicate-video-summary">
        <Sparkles size={24} />
        <span>{detectionMessage}</span>
      </div>
      {progress ? (
        <div className="duplicate-detection-progress" aria-label={`重复视频检测进度 ${detectionPercent}%`}>
          <span style={{ width: `${detectionPercent}%` }} />
        </div>
      ) : null}
      <div className="duplicate-video-actions">
        <button
          className="secondary-button duplicate-detection-button"
          type="button"
          onClick={onRunDetection}
          disabled={isRunning || totalVideoCount < 2}
          title={totalVideoCount < 2 ? "当前模式视频不足 2 个" : "手动检测重复或疑似重复视频"}
        >
          <Activity size={16} className={isRunning ? "spin-icon" : undefined} />
          {isRunning ? "检测中" : "检测重复视频"}
        </button>
        <button
          className="primary-button duplicate-detection-button"
          type="button"
          onClick={onOpenPlaylist}
          disabled={isRunning || !duplicatePlaylistCount}
          title={duplicatePlaylistCount ? "进入重复视频播放列表" : "暂无可处理的重复视频"}
        >
          <Play size={16} />
          进入重复列表
        </button>
      </div>
      {groups.length ? (
        <div className="duplicate-video-groups">
          {groups.slice(0, 6).map(renderGroup)}
          {groups.length > 6 ? (
            <button
              className="secondary-button duplicate-video-more"
              type="button"
              onClick={onOpenPlaylist}
            >
              查看全部 {groups.length} 组
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
