import { Clapperboard, Play } from "lucide-react";

type VideoVersionSummaryCardProps = {
  editCount: number;
  groupCount: number;
  restoredCount: number;
  videoCount: number;
  onOpenPlaylist: () => void;
};

export function VideoVersionSummaryCard({ editCount, groupCount, restoredCount, videoCount, onOpenPlaylist }: VideoVersionSummaryCardProps) {
  return (
    <section className="home-section duplicate-video-card">
      <div className="home-section-header">
        <h2>剪辑 / 修复版本</h2>
        <span>{groupCount} 组</span>
      </div>
      <div className="duplicate-video-summary">
        <Clapperboard size={24} />
        <span>剪辑版 {editCount} 个 · 修复版 {restoredCount} 个</span>
      </div>
      <div className="duplicate-video-actions">
        <button
          className="primary-button duplicate-detection-button"
          type="button"
          onClick={onOpenPlaylist}
          disabled={!videoCount}
          title={videoCount ? "分组比较原版与剪辑版、修复版" : "当前模式暂无剪辑版或修复版"}
        >
          <Play size={16} />
          进入版本列表
        </button>
      </div>
    </section>
  );
}
