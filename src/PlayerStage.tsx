import { useMemo, type Ref, type SyntheticEvent } from "react";

import { AutoNextPromptCard } from "./AutoNextPromptCard";
import { PlayerDanmakuLayer } from "./PlayerDanmakuLayer";
import { PlayerFeedbackOverlays } from "./PlayerFeedbackOverlays";
import { PlayerStagePlaceholders } from "./PlayerStagePlaceholders";
import { PlayerVideoElement } from "./PlayerVideoElement";
import { RocketLaunchEffect } from "./RocketLaunchEffect";
import { TimelinePreviewTargets } from "./TimelinePreviewTargets";
import { getActiveDanmakuComments } from "./danmakuPresentationUtils";
import { usePlaybackSnapshot, type PlaybackRuntimeApi } from "./playbackRuntime";
import type { AutoNextPrompt, DanmakuComment, DanmakuPreferences, SubtitleItem, SubtitleStylePreferences } from "./playerTypes";

type DoubleClickFeedback = {
  side: "left" | "center" | "right";
  text: string;
};

type PlayerStageProps = {
  autoNextPrompt: AutoNextPrompt | null;
  currentVideoSourceAspectRatio: number;
  danmakuComments: DanmakuComment[];
  danmakuLaneCount: number;
  danmakuLaneLineHeight: number;
  danmakuLayerRef: Ref<HTMLDivElement>;
  danmakuPreferences: DanmakuPreferences;
  doubleClickFeedback: DoubleClickFeedback | null;
  hasCurrentVideo: boolean;
  isDanmakuAvailable: boolean;
  isPrivacyMode: boolean;
  isVideoSideways: boolean;
  launchEffectKey: number;
  message: string;
  normalizedVideoRotation: number;
  playerOverlayFeedback: string;
  previewCanvasRef: Ref<HTMLCanvasElement>;
  previewVideoRef: Ref<HTMLVideoElement>;
  playbackRuntime: PlaybackRuntimeApi;
  selectedSubtitle: SubtitleItem | null;
  subtitleStyle: SubtitleStylePreferences;
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
  autoNextPrompt,
  currentVideoSourceAspectRatio,
  danmakuComments,
  danmakuLaneCount,
  danmakuLaneLineHeight,
  danmakuLayerRef,
  danmakuPreferences,
  doubleClickFeedback,
  hasCurrentVideo,
  isDanmakuAvailable,
  isPrivacyMode,
  isVideoSideways,
  launchEffectKey,
  message,
  normalizedVideoRotation,
  playerOverlayFeedback,
  previewCanvasRef,
  previewVideoRef,
  playbackRuntime,
  selectedSubtitle,
  subtitleStyle,
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
  const { currentTime, isPlaying } = usePlaybackSnapshot(playbackRuntime);
  const activeDanmakuComments = useMemo(() => {
    if (!danmakuPreferences.enabled || !hasCurrentVideo || !danmakuComments.length || isPrivacyMode) return [];
    return getActiveDanmakuComments({
      comments: danmakuComments,
      currentTime,
      durationSeconds: danmakuPreferences.speed,
      displayLimit: Math.max(12, Math.round(90 * danmakuPreferences.density)),
    });
  }, [
    currentTime,
    danmakuComments,
    danmakuPreferences.density,
    danmakuPreferences.enabled,
    danmakuPreferences.speed,
    hasCurrentVideo,
    isPrivacyMode,
  ]);

  return (
    <>
      <div className="player-viewport">
        {hasCurrentVideo ? (
          <PlayerVideoElement
            currentVideoSourceAspectRatio={currentVideoSourceAspectRatio}
            isVideoSideways={isVideoSideways}
            normalizedVideoRotation={normalizedVideoRotation}
            selectedSubtitle={selectedSubtitle}
            subtitleStyle={subtitleStyle}
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
