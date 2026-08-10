import { Scissors, Sparkles, Star, Subtitles, Tags, Wrench } from "lucide-react";
import { useRef } from "react";

import { ControlSelect } from "./ControlSelect";
import type { HomeMediaMode } from "./playerUiState";

type PlayerMediaActionControlsProps = {
  canUseEmbeddedSubtitles: boolean;
  canRestoreWithLada: boolean;
  currentVideoRating: number | null | undefined;
  hasCurrentVideo: boolean;
  hasSelectedSubtitle: boolean;
  homeMediaMode: HomeMediaMode;
  isAiPanelOpen: boolean;
  isDanmakuActive: boolean;
  isEmbeddedSubtitleLoading: boolean;
  isEditSegmentMarkDisabled: boolean;
  isEditSegmentMarkPending: boolean;
  isSeriesMode: boolean;
  ladaDisabledReason: string;
  selectedSubtitleId: string;
  subtitleControlOptions: Array<{ value: string; label: string }>;
  videoTagCount: number;
  onChangeSubtitle: (subtitleId: string) => void;
  onMarkEditSegment: () => void;
  onOpenAiPanel: () => void;
  onOpenDanmakuDialog: () => void;
  onOpenRatingDialog: () => void;
  onOpenLadaRestoration: () => void;
  onOpenTagDialog: () => void;
  onProbeEmbeddedSubtitles: () => void;
};

export function PlayerMediaActionControls({
  canUseEmbeddedSubtitles,
  canRestoreWithLada,
  currentVideoRating,
  hasCurrentVideo,
  hasSelectedSubtitle,
  homeMediaMode,
  isAiPanelOpen,
  isDanmakuActive,
  isEmbeddedSubtitleLoading,
  isEditSegmentMarkDisabled,
  isEditSegmentMarkPending,
  isSeriesMode,
  ladaDisabledReason,
  selectedSubtitleId,
  subtitleControlOptions,
  videoTagCount,
  onChangeSubtitle,
  onMarkEditSegment,
  onOpenAiPanel,
  onOpenDanmakuDialog,
  onOpenRatingDialog,
  onOpenLadaRestoration,
  onOpenTagDialog,
  onProbeEmbeddedSubtitles,
}: PlayerMediaActionControlsProps) {
  const toolMenuRef = useRef<HTMLDetailsElement>(null);
  const hasRating = typeof currentVideoRating === "number";
  const runToolAction = (action: () => void) => {
    toolMenuRef.current?.removeAttribute("open");
    action();
  };

  return (
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

      {homeMediaMode !== "special" ? (
        <>
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
      {homeMediaMode === "special" ? (
        <>
          <button
            className={`player-rating-action ${hasRating ? "active" : ""}`}
            type="button"
            onClick={onOpenRatingDialog}
            disabled={!hasCurrentVideo}
          >
            <Star size={16} fill={hasRating ? "currentColor" : "none"} aria-hidden="true" />
            <span>{hasRating ? `评分 ${currentVideoRating} / 10` : "给影片评分"}</span>
          </button>
          <details className="player-tool-menu" ref={toolMenuRef}>
            <summary aria-label="打开影片工具">
              <Wrench size={16} aria-hidden="true" />
              <span>影片工具</span>
            </summary>
            <div className="player-tool-menu-popover" role="group" aria-label="影片工具">
              <button
                className={videoTagCount ? "active" : ""}
                type="button"
                onClick={() => runToolAction(onOpenTagDialog)}
                disabled={!hasCurrentVideo}
              >
                <Tags size={17} aria-hidden="true" />
                <span><strong>管理标签</strong><small>{videoTagCount ? `${videoTagCount} 个标签` : "整理影片信息"}</small></span>
              </button>
            <button
              className="lada-restoration-button"
              type="button"
              onClick={() => runToolAction(onOpenLadaRestoration)}
              disabled={!canRestoreWithLada}
              title={canRestoreWithLada ? undefined : ladaDisabledReason}
            >
              <Sparkles size={17} aria-hidden="true" />
              <span><strong>创建修复版</strong><small>{canRestoreWithLada ? "使用 LADA 去除马赛克" : ladaDisabledReason}</small></span>
            </button>
            <button
              className={isEditSegmentMarkPending ? "active" : ""}
              type="button"
              onClick={() => runToolAction(onMarkEditSegment)}
              disabled={isEditSegmentMarkDisabled}
              aria-pressed={isEditSegmentMarkPending}
            >
              <Scissors size={17} aria-hidden="true" />
              <span><strong>{isEditSegmentMarkPending ? "设置剪辑终点" : "标记剪辑片段"}</strong><small>创建剪辑版的保留范围</small></span>
            </button>
            </div>
          </details>
        </>
      ) : null}
    </>
  );
}
