import { Play, Star } from "lucide-react";

import type { RatingFilterOperator } from "./playerUiState";

type RatingStats = {
  rated: number;
  high: number;
  low: number;
  unrated: number;
};

type RatingFilterCardProps = {
  ratingStats: RatingStats;
  ratingFilterOperator: RatingFilterOperator;
  ratingFilterThreshold: number;
  ratingFilterLabel: string;
  numericRatingPlaylistCount: number;
  onOperatorChange: (operator: RatingFilterOperator) => void;
  onThresholdChange: (threshold: number) => void;
  onOpenHigh: () => void;
  onOpenLow: () => void;
  onOpenUnrated: () => void;
  onOpenNumeric: () => void;
};

export function RatingFilterCard({
  ratingStats,
  ratingFilterOperator,
  ratingFilterThreshold,
  ratingFilterLabel,
  numericRatingPlaylistCount,
  onOperatorChange,
  onThresholdChange,
  onOpenHigh,
  onOpenLow,
  onOpenUnrated,
  onOpenNumeric,
}: RatingFilterCardProps) {
  return (
    <section className="home-section rating-filter-card">
      <div className="home-section-header">
        <h2>评分筛选</h2>
        <span>{ratingStats.rated} 个已评分</span>
      </div>
      <div className="rating-filter-stats" aria-label="评分统计">
        <div>
          <strong>{ratingStats.high}</strong>
          <span>&gt; 8</span>
        </div>
        <div>
          <strong>{ratingStats.low}</strong>
          <span>&lt; 6</span>
        </div>
        <div>
          <strong>{ratingStats.unrated}</strong>
          <span>未评分</span>
        </div>
      </div>
      <div className="rating-filter-builder">
        <div className="playlist-filter rating-operator-filter" role="group" aria-label="评分筛选条件">
          <button
            className={ratingFilterOperator === "gt" ? "active" : ""}
            type="button"
            onClick={() => onOperatorChange("gt")}
            aria-pressed={ratingFilterOperator === "gt"}
          >
            大于
          </button>
          <button
            className={ratingFilterOperator === "lt" ? "active" : ""}
            type="button"
            onClick={() => onOperatorChange("lt")}
            aria-pressed={ratingFilterOperator === "lt"}
          >
            小于
          </button>
          <button
            className={ratingFilterOperator === "eq" ? "active" : ""}
            type="button"
            onClick={() => onOperatorChange("eq")}
            aria-pressed={ratingFilterOperator === "eq"}
          >
            等于
          </button>
        </div>
        <label className="rating-threshold-input">
          <span>分数</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={ratingFilterThreshold}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (!Number.isFinite(nextValue)) return;
              onThresholdChange(nextValue);
            }}
          />
        </label>
      </div>
      <div className="duplicate-video-actions rating-filter-actions">
        <button className="secondary-button duplicate-detection-button" type="button" onClick={onOpenHigh} disabled={!ratingStats.high}>
          <Star size={16} />
          高分 &gt; 8
        </button>
        <button className="secondary-button duplicate-detection-button" type="button" onClick={onOpenLow} disabled={!ratingStats.low}>
          <Star size={16} />
          低分 &lt; 6
        </button>
        <button className="secondary-button duplicate-detection-button" type="button" onClick={onOpenUnrated} disabled={!ratingStats.unrated}>
          <Star size={16} />
          未评分
        </button>
        <button
          className="primary-button duplicate-detection-button"
          type="button"
          onClick={onOpenNumeric}
          disabled={!numericRatingPlaylistCount}
          title={numericRatingPlaylistCount ? `进入${ratingFilterLabel}的临时列表` : "当前条件没有匹配视频"}
        >
          <Play size={16} />
          进入评分列表
        </button>
      </div>
    </section>
  );
}
