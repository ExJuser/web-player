import type { CSSProperties, Ref } from "react";

import type { DanmakuComment, DanmakuPreferences } from "./playerTypes";

type PlayerDanmakuLayerProps = {
  comments: DanmakuComment[];
  currentTime: number;
  danmakuLaneCount: number;
  danmakuLaneLineHeight: number;
  danmakuLayerRef: Ref<HTMLDivElement>;
  isPlaying: boolean;
  preferences: DanmakuPreferences;
  getDanmakuLane: (comment: DanmakuComment, laneCount: number) => number;
  formatDanmakuLaneTop: (lane: number, laneCount: number, displayArea: DanmakuPreferences["displayArea"]) => string;
};

export function PlayerDanmakuLayer({
  comments,
  currentTime,
  danmakuLaneCount,
  danmakuLaneLineHeight,
  danmakuLayerRef,
  isPlaying,
  preferences,
  getDanmakuLane,
  formatDanmakuLaneTop,
}: PlayerDanmakuLayerProps) {
  if (!comments.length) return null;

  return (
    <div
      ref={danmakuLayerRef}
      className="danmaku-layer"
      aria-hidden="true"
      style={
        {
          "--danmaku-opacity": preferences.opacity,
          "--danmaku-speed": `${preferences.speed}s`,
          "--danmaku-font-size": `${preferences.fontSize}px`,
          "--danmaku-play-state": isPlaying ? "running" : "paused",
        } as CSSProperties
      }
    >
      {comments.map((comment) => {
        const elapsed = Math.max(0, currentTime - comment.time);
        const lane = getDanmakuLane(comment, danmakuLaneCount);
        const text = preferences.showSimplified ? comment.simplifiedText || comment.text : comment.text;
        return (
          <span
            key={`${comment.id}:${Math.floor(comment.time * 10)}`}
            className={`danmaku-item mode-${comment.mode}`}
            style={
              {
                "--danmaku-lane": lane,
                "--danmaku-lanes": danmakuLaneCount,
                "--danmaku-lane-top": formatDanmakuLaneTop(lane, danmakuLaneCount, preferences.displayArea),
                "--danmaku-lane-offset": `${Math.round(lane * preferences.fontSize * danmakuLaneLineHeight)}px`,
                "--danmaku-delay": `-${elapsed}s`,
                color: comment.color,
              } as CSSProperties
            }
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
