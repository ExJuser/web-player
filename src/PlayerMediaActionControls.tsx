import { Scissors, Star, Subtitles, Tags, Zap } from "lucide-react";

import { ControlSelect } from "./ControlSelect";
import type { HomeMediaMode } from "./playerUiState";

type PlayerMediaActionControlsProps = {
  canUseEmbeddedSubtitles: boolean;
  currentVideoRating: number | null | undefined;
  hasCurrentVideo: boolean;
  hasSelectedSubtitle: boolean;
  homeMediaMode: HomeMediaMode;
  isAiPanelOpen: boolean;
  isDanmakuActive: boolean;
  isEmbeddedSubtitleLoading: boolean;
  isHighEnergyMarkDisabled: boolean;
  isHighEnergyMarkPending: boolean;
  isEditSegmentMarkDisabled: boolean;
  isEditSegmentMarkPending: boolean;
  isSeriesMode: boolean;
  selectedSubtitleId: string;
  subtitleControlOptions: Array<{ value: string; label: string }>;
  videoTagCount: number;
  onChangeSubtitle: (subtitleId: string) => void;
  onMarkHighEnergySegment: () => void;
  onMarkEditSegment: () => void;
  onOpenAiPanel: () => void;
  onOpenDanmakuDialog: () => void;
  onOpenRatingDialog: () => void;
  onOpenTagDialog: () => void;
  onProbeEmbeddedSubtitles: () => void;
};

export function PlayerMediaActionControls({
  canUseEmbeddedSubtitles,
  currentVideoRating,
  hasCurrentVideo,
  hasSelectedSubtitle,
  homeMediaMode,
  isAiPanelOpen,
  isDanmakuActive,
  isEmbeddedSubtitleLoading,
  isHighEnergyMarkDisabled,
  isHighEnergyMarkPending,
  isEditSegmentMarkDisabled,
  isEditSegmentMarkPending,
  isSeriesMode,
  selectedSubtitleId,
  subtitleControlOptions,
  videoTagCount,
  onChangeSubtitle,
  onMarkHighEnergySegment,
  onMarkEditSegment,
  onOpenAiPanel,
  onOpenDanmakuDialog,
  onOpenRatingDialog,
  onOpenTagDialog,
  onProbeEmbeddedSubtitles,
}: PlayerMediaActionControlsProps) {
  const hasRating = typeof currentVideoRating === "number";
  const highEnergyMarkLabel = isHighEnergyMarkPending ? "标记高能结束点" : "标记高能起点";

  return (
    <>
      {homeMediaMode !== "special" ? (
        <>
          <ControlSelect
            label={<Subtitles size={18} aria-hidden="true" />}
            ariaLabel="字幕"
            value={selectedSubtitleId}
            options={subtitleControlOptions}
            onChange={onChangeSubtitle}
            className="subtitle-control"
            disabled={!hasCurrentVideo}
          />

          <button
            className="icon-button"
            type="button"
            onClick={onProbeEmbeddedSubtitles}
            disabled={!canUseEmbeddedSubtitles || isEmbeddedSubtitleLoading}
            title={canUseEmbeddedSubtitles ? "检测内封字幕" : "需要在 config/app.json 配置媒体根路径，并安装 ffmpeg/ffprobe"}
          >
            CC
          </button>
          <button
            className={`icon-button ${isAiPanelOpen ? "active" : ""}`}
            type="button"
            onClick={onOpenAiPanel}
            disabled={!hasSelectedSubtitle}
            title={hasSelectedSubtitle ? "字幕总结和问答" : "请先选择字幕"}
          >
            AI
          </button>
        </>
      ) : null}
      {homeMediaMode === "anime" ? (
        <button
          className={`icon-button ${isDanmakuActive ? "active" : ""}`}
          type="button"
          onClick={onOpenDanmakuDialog}
          disabled={!hasCurrentVideo || !isSeriesMode}
          title={isSeriesMode ? "弹幕源和弹幕设置" : "弹幕只在追番模式的剧集播放中可用"}
        >
          弹
        </button>
      ) : null}
      <button
        className={`icon-button ${videoTagCount ? "active" : ""}`}
        type="button"
        onClick={onOpenTagDialog}
        disabled={!hasCurrentVideo}
        title="管理视频标签"
        aria-label="管理视频标签"
      >
        <Tags size={18} />
      </button>
      <button
        className={`icon-button ${hasRating ? "active" : ""}`}
        type="button"
        onClick={onOpenRatingDialog}
        disabled={!hasCurrentVideo}
        title={hasRating ? `当前评分 ${currentVideoRating}/10` : "给视频评分"}
        aria-label="给视频评分"
      >
        <Star size={18} fill={hasRating ? "currentColor" : "none"} />
      </button>
      <button
        className={`icon-button highlight-mark-button ${isHighEnergyMarkPending ? "active" : ""}`}
        type="button"
        onClick={onMarkHighEnergySegment}
        disabled={isHighEnergyMarkDisabled}
        title={highEnergyMarkLabel}
        aria-label={highEnergyMarkLabel}
        aria-pressed={isHighEnergyMarkPending}
      >
        <Zap size={18} />
      </button>
      <button
        className={`icon-button edit-segment-mark-button ${isEditSegmentMarkPending ? "active" : ""}`}
        type="button"
        onClick={onMarkEditSegment}
        disabled={isEditSegmentMarkDisabled}
        title={isEditSegmentMarkPending ? "标记剪辑保留终点" : "标记剪辑保留起点"}
        aria-label={isEditSegmentMarkPending ? "标记剪辑保留终点" : "标记剪辑保留起点"}
        aria-pressed={isEditSegmentMarkPending}
      >
        <Scissors size={18} />
      </button>
    </>
  );
}
