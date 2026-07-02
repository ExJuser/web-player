import type { Ref, SyntheticEvent } from "react";

import { AutoNextPromptCard } from "./AutoNextPromptCard";
import { PlayerDanmakuLayer } from "./PlayerDanmakuLayer";
import { PlayerFeedbackOverlays } from "./PlayerFeedbackOverlays";
import { PlayerStagePlaceholders } from "./PlayerStagePlaceholders";
import { PlayerVideoElement } from "./PlayerVideoElement";
import { RocketLaunchEffect } from "./RocketLaunchEffect";
import { TimelinePreviewTargets } from "./TimelinePreviewTargets";
import type { AutoNextPrompt, DanmakuComment, DanmakuPreferences, SubtitleItem } from "./playerTypes";

type DoubleClickFeedback = {
  side: "left" | "center" | "right";
  text: string;
};

type PlayerStageProps = {
  activeDanmakuComments: DanmakuComment[];
  autoNextPrompt: AutoNextPrompt | null;
  currentTime: number;
  currentVideoSourceAspectRatio: number;
  danmakuLaneCount: number;
  danmakuLaneLineHeight: number;
  danmakuLayerRef: Ref<HTMLDivElement>;
  danmakuPreferences: DanmakuPreferences;
  doubleClickFeedback: DoubleClickFeedback | null;
  hasCurrentVideo: boolean;
  isDanmakuAvailable: boolean;
  isPlaying: boolean;
  isPrivacyMode: boolean;
  isVideoSideways: boolean;
  launchEffectKey: number;
  message: string;
  normalizedVideoRotation: number;
  playerOverlayFeedback: string;
  previewCanvasRef: Ref<HTMLCanvasElement>;
  previewVideoRef: Ref<HTMLVideoElement>;
  selectedSubtitle: SubtitleItem | null;
  videoRef: Ref<HTMLVideoElement>;
  formatDanmakuLaneTop: (lane: number, laneCount: number, displayArea: DanmakuPreferences["displayArea"]) => string;
  getDanmakuLane: (comment: DanmakuComment, laneCount: number) => number;
  onAutoNextCancel: () => void;
  onAutoNextConfirm: (videoId: string) => void;
  onDurationChange: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onEnded: () => void;
  onPause: () => void;
  onPlay: () => void;
  onTimeUpdate: () => void;
  onTogglePlay: () => void;
};

export function PlayerStage({
  activeDanmakuComments,
  autoNextPrompt,
  currentTime,
  currentVideoSourceAspectRatio,
  danmakuLaneCount,
  danmakuLaneLineHeight,
  danmakuLayerRef,
  danmakuPreferences,
  doubleClickFeedback,
  hasCurrentVideo,
  isDanmakuAvailable,
  isPlaying,
  isPrivacyMode,
  isVideoSideways,
  launchEffectKey,
  message,
  normalizedVideoRotation,
  playerOverlayFeedback,
  previewCanvasRef,
  previewVideoRef,
  selectedSubtitle,
  videoRef,
  formatDanmakuLaneTop,
  getDanmakuLane,
  onAutoNextCancel,
  onAutoNextConfirm,
  onDurationChange,
  onEnded,
  onPause,
  onPlay,
  onTimeUpdate,
  onTogglePlay,
}: PlayerStageProps) {
  return (
    <>
      <div className="player-viewport">
        {hasCurrentVideo ? (
          <PlayerVideoElement
            currentVideoSourceAspectRatio={currentVideoSourceAspectRatio}
            isVideoSideways={isVideoSideways}
            normalizedVideoRotation={normalizedVideoRotation}
            selectedSubtitle={selectedSubtitle}
            videoRef={videoRef}
            onClick={onTogglePlay}
            onPlay={onPlay}
            onPause={onPause}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={onDurationChange}
            onEnded={onEnded}
          />
        ) : null}

        <PlayerStagePlaceholders isPrivacyMode={isPrivacyMode} message={message} showEmptyState={!hasCurrentVideo} />

        {isDanmakuAvailable ? (
          <PlayerDanmakuLayer
            comments={activeDanmakuComments}
            currentTime={currentTime}
            danmakuLaneCount={danmakuLaneCount}
            danmakuLaneLineHeight={danmakuLaneLineHeight}
            danmakuLayerRef={danmakuLayerRef}
            isPlaying={isPlaying}
            preferences={danmakuPreferences}
            getDanmakuLane={getDanmakuLane}
            formatDanmakuLaneTop={formatDanmakuLaneTop}
          />
        ) : null}

        {launchEffectKey ? <RocketLaunchEffect effectKey={launchEffectKey} /> : null}

        {hasCurrentVideo ? <TimelinePreviewTargets previewCanvasRef={previewCanvasRef} previewVideoRef={previewVideoRef} /> : null}
      </div>

      <PlayerFeedbackOverlays doubleClickFeedback={doubleClickFeedback} playerOverlayFeedback={playerOverlayFeedback} />

      {autoNextPrompt ? (
        <AutoNextPromptCard prompt={autoNextPrompt} onCancel={onAutoNextCancel} onConfirm={onAutoNextConfirm} />
      ) : null}
    </>
  );
}
