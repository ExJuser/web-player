import { Activity, Play, Sparkles } from "lucide-react";

type DuplicateVideoSummaryCardProps = {
  detectionMessage: string;
  detectionPercent: number;
  duplicatePlaylistCount: number;
  groupCount: number;
  isRunning: boolean;
  progress: { percent: number } | null;
  totalVideoCount: number;
  onOpenPlaylist: () => void;
  onRunDetection: () => void;
};

export function DuplicateVideoSummaryCard({
  detectionMessage,
  detectionPercent,
  duplicatePlaylistCount,
  groupCount,
  isRunning,
  progress,
  totalVideoCount,
  onOpenPlaylist,
  onRunDetection,
}: DuplicateVideoSummaryCardProps) {
  return (
    <section className="home-section duplicate-video-card">
      <div className="home-section-header">
        <h2>重复视频</h2>
        <span>{isRunning ? `${detectionPercent}%` : `${groupCount} 组`}</span>
      </div>
      <div className="duplicate-video-summary" role="status" aria-live="polite">
        <Sparkles size={24} />
        <span>{detectionMessage}</span>
      </div>
      {progress ? (
        <div
          className="duplicate-detection-progress"
          role="progressbar"
          aria-label="重复视频检测进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={detectionPercent}
        >
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
    </section>
  );
}
