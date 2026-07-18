import { useEffect, useRef, useState } from "react";
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
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);
  const statsCardRef = useRef<HTMLButtonElement>(null);
  const playIntensityLabel = stats.playIntensity === null ? "暂无" : `${stats.playIntensity.toFixed(1)}x`;
  const playIntensityTitle = stats.playIntensity === null ? "暂无" : `${stats.playIntensity.toFixed(1)} 遍`;

  useEffect(() => {
    if (!isPinnedOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (statsCardRef.current?.contains(event.target as Node)) return;
      setIsPinnedOpen(false);
      statsCardRef.current?.blur();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isPinnedOpen]);

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
      <button
        ref={statsCardRef}
        className={`special-stats-card${isPinnedOpen ? " is-expanded" : ""}`}
        type="button"
        aria-expanded={isPinnedOpen}
        aria-label={isPinnedOpen ? "收起播放数据详情" : "展开播放数据详情"}
        onClick={() => setIsPinnedOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setIsPinnedOpen(false);
          event.currentTarget.blur();
        }}
      >
        <span className="special-stats-summary">
          <Activity size={14} />
          <span>播放数据</span>
        </span>
        <span className="special-stats-details">
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
        </span>
      </button>
    </div>
  );
}
