import { Activity, Clock3, Play, Rocket } from "lucide-react";

type SpecialVideoStats = {
  emissionCount: number;
  lastEmissionLabel: string;
  playCount: number;
  playIntensity: number | null;
};

type SpecialStatsControlProps = {
  disabled: boolean;
  stats: SpecialVideoStats;
  onRecordEmission: () => void;
};

export function SpecialStatsControl({ disabled, stats, onRecordEmission }: SpecialStatsControlProps) {
  const playIntensityLabel = stats.playIntensity === null ? "暂无" : `${stats.playIntensity.toFixed(1)}x`;
  const playIntensityTitle = stats.playIntensity === null ? "暂无" : `${stats.playIntensity.toFixed(1)} 遍`;

  return (
    <div className="special-stats-control" aria-label="特殊模式统计">
      <button
        className="icon-button emission-launch-button"
        type="button"
        onClick={onRecordEmission}
        disabled={disabled}
        title="发射"
        aria-label="发射"
      >
        <Rocket size={18} />
      </button>
      <span className="special-stat-pill" title={`上次发射距今：${stats.lastEmissionLabel}`}>
        <Clock3 size={14} />
        <span>上次发射</span>
        <strong>{stats.lastEmissionLabel}</strong>
      </span>
      <span className="special-stat-pill" title={`播放强度：${playIntensityTitle}`}>
        <Activity size={14} />
        <span>播放强度</span>
        <strong>{playIntensityLabel}</strong>
      </span>
      <span className="special-stat-pill" title={`播放次数：${stats.playCount}`}>
        <Play size={14} />
        <span>播放次数</span>
        <strong>{stats.playCount}</strong>
      </span>
      <span className="special-stat-pill emission-stat-pill" title={`发射次数：${stats.emissionCount}`}>
        <Rocket size={14} />
        <span>发射次数</span>
        <strong>{stats.emissionCount}</strong>
      </span>
    </div>
  );
}
