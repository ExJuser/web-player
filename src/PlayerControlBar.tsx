import type { FocusEventHandler, MouseEventHandler, Ref } from "react";

import { PlayerHighlightControls } from "./PlayerHighlightControls";
import { PlayerMediaActionControls } from "./PlayerMediaActionControls";
import { PlayerOptionControls } from "./PlayerOptionControls";
import { PlayerPlaybackControls } from "./PlayerPlaybackControls";
import { PlayerTimelineControls } from "./PlayerTimelineControls";
import { PlayerViewControls } from "./PlayerViewControls";
import { SpecialStatsControl } from "./SpecialStatsControl";
import type { HomeMediaMode } from "./playerUiState";
import type { PlaybackMode, VideoHighlightSegment } from "./playerTypes";

type PlaybackSourceChoice = "compatible" | "original";

type TimelinePreviewState = {
  time: number;
  left: number;
  isVisible: boolean;
  isDragging: boolean;
  imageUrl: string;
  isLoadingFrame: boolean;
};

type SpecialVideoStats = {
  emissionCount: number;
  lastEmissionLabel: string;
  playCount: number;
  playIntensity: number | null;
};

type PlayerControlBarProps = {
  canPlayNext: boolean;
  canRecordEmission: boolean;
  canUseEmbeddedSubtitles: boolean;
  controlBarRef: Ref<HTMLDivElement>;
  currentTime: number;
  currentVideoHasCompatibleMedia: boolean;
  currentVideoHighlights: VideoHighlightSegment[];
  currentVideoRating: number | null | undefined;
  currentVideoSpecialStats: SpecialVideoStats;
  currentVideoSourceChoice: PlaybackSourceChoice;
  currentVideoTagsCount: number;
  danmakuEnabled: boolean;
  duration: number;
  effectivePlaybackRate: number;
  hasCurrentVideo: boolean;
  hasSelectedSubtitle: boolean;
  holdPlaybackRate: number;
  holdRateOptions: Array<{ value: number; label: string }>;
  homeMediaMode: HomeMediaMode;
  isAiPanelOpen: boolean;
  isCinemaMode: boolean;
  isDeletingCompatibleMedia: boolean;
  isEmbeddedSubtitleLoading: boolean;
  isHighEnergyMarkDisabled: boolean;
  isHighEnergyMarkPending: boolean;
  isMuted: boolean;
  isPlaying: boolean;
  isPrivacyMode: boolean;
  isSeriesMode: boolean;
  normalizedVideoRotation: number;
  pendingHighlightStartTime: number | null;
  playbackMode: PlaybackMode;
  playbackModeOptions: Array<{ value: PlaybackMode; label: string }>;
  playbackRateOptions: Array<{ value: number; label: string }>;
  progressPercent: number;
  seekStep: number;
  seekStepOptions: Array<{ value: number; label: string }>;
  selectedSubtitleId: string;
  showPlaybackMode: boolean;
  startFromHighEnergy: boolean;
  subtitleControlOptions: Array<{ value: string; label: string }>;
  timelinePreview: TimelinePreviewState;
  timelineRef: Ref<HTMLInputElement>;
  volume: number;
  formatTime: (time: number) => string;
  onChangeHoldPlaybackRate: (rate: number) => void;
  onChangePlaybackMode: (mode: PlaybackMode) => void;
  onChangePlaybackRate: (rate: number) => void;
  onChangeSeekStep: (step: number) => void;
  onChangeSourceChoice: (choice: PlaybackSourceChoice) => void;
  onChangeSubtitle: (subtitleId: string) => void;
  onChangeVolume: (volume: number) => void;
  onDeleteCompatibleMedia: () => void;
  onEditHighlight: (highlight: VideoHighlightSegment) => void;
  onHideTimelinePreview: () => void;
  onKeepControlsVisible: () => void;
  onMarkHighEnergySegment: () => void;
  onOpenAiPanel: () => void;
  onOpenDanmakuDialog: () => void;
  onOpenRatingDialog: () => void;
  onOpenTagDialog: () => void;
  onPlayNext: () => void;
  onProbeEmbeddedSubtitles: () => void;
  onRecordEmission: () => void;
  onRemoveHighlight: (highlightId: string) => void;
  onReturnFocusToPlayer: () => void;
  onRotateVideo: () => void;
  onScheduleControlsHide: () => void;
  onSeek: (time: number) => void;
  onStopTimelineDragPreview: () => void;
  onToggleCinemaMode: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onTogglePictureInPicture: () => void;
  onTogglePlay: () => void;
  onTogglePrivacyMode: () => void;
  onToggleShortcutDialog: () => void;
  onToggleStartFromHighEnergy: () => void;
  onUpdateTimelinePreview: (clientX: number, isDragging: boolean) => void;
  onUpdateTimelinePreviewFromTime: (time: number, isDragging: boolean) => void;
};

export function PlayerControlBar({
  canPlayNext,
  canRecordEmission,
  canUseEmbeddedSubtitles,
  controlBarRef,
  currentTime,
  currentVideoHasCompatibleMedia,
  currentVideoHighlights,
  currentVideoRating,
  currentVideoSpecialStats,
  currentVideoSourceChoice,
  currentVideoTagsCount,
  danmakuEnabled,
  duration,
  effectivePlaybackRate,
  hasCurrentVideo,
  hasSelectedSubtitle,
  holdPlaybackRate,
  holdRateOptions,
  homeMediaMode,
  isAiPanelOpen,
  isCinemaMode,
  isDeletingCompatibleMedia,
  isEmbeddedSubtitleLoading,
  isHighEnergyMarkDisabled,
  isHighEnergyMarkPending,
  isMuted,
  isPlaying,
  isPrivacyMode,
  isSeriesMode,
  normalizedVideoRotation,
  pendingHighlightStartTime,
  playbackMode,
  playbackModeOptions,
  playbackRateOptions,
  progressPercent,
  seekStep,
  seekStepOptions,
  selectedSubtitleId,
  showPlaybackMode,
  startFromHighEnergy,
  subtitleControlOptions,
  timelinePreview,
  timelineRef,
  volume,
  formatTime,
  onChangeHoldPlaybackRate,
  onChangePlaybackMode,
  onChangePlaybackRate,
  onChangeSeekStep,
  onChangeSourceChoice,
  onChangeSubtitle,
  onChangeVolume,
  onDeleteCompatibleMedia,
  onEditHighlight,
  onHideTimelinePreview,
  onKeepControlsVisible,
  onMarkHighEnergySegment,
  onOpenAiPanel,
  onOpenDanmakuDialog,
  onOpenRatingDialog,
  onOpenTagDialog,
  onPlayNext,
  onProbeEmbeddedSubtitles,
  onRecordEmission,
  onRemoveHighlight,
  onReturnFocusToPlayer,
  onRotateVideo,
  onScheduleControlsHide,
  onSeek,
  onStopTimelineDragPreview,
  onToggleCinemaMode,
  onToggleFullscreen,
  onToggleMute,
  onTogglePictureInPicture,
  onTogglePlay,
  onTogglePrivacyMode,
  onToggleShortcutDialog,
  onToggleStartFromHighEnergy,
  onUpdateTimelinePreview,
  onUpdateTimelinePreviewFromTime,
}: PlayerControlBarProps) {
  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    onKeepControlsVisible();
  };
  const handleFocus: FocusEventHandler<HTMLDivElement> = () => onKeepControlsVisible();

  return (
    <div
      ref={controlBarRef}
      className="control-bar"
      onFocus={handleFocus}
      onMouseEnter={onKeepControlsVisible}
      onMouseLeave={onScheduleControlsHide}
      onMouseMove={handleMouseMove}
    >
      <PlayerTimelineControls
        currentTime={currentTime}
        duration={duration}
        formatTime={formatTime}
        hasCurrentVideo={hasCurrentVideo}
        highlights={currentVideoHighlights}
        isPrivacyMode={isPrivacyMode}
        progressPercent={progressPercent}
        timelinePreview={timelinePreview}
        timelineRef={timelineRef}
        onHideTimelinePreview={onHideTimelinePreview}
        onReturnFocusToPlayer={onReturnFocusToPlayer}
        onSeek={onSeek}
        onStopTimelineDragPreview={onStopTimelineDragPreview}
        onUpdateTimelinePreview={onUpdateTimelinePreview}
        onUpdateTimelinePreviewFromTime={onUpdateTimelinePreviewFromTime}
      />

      {hasCurrentVideo ? (
        <PlayerHighlightControls
          highlights={currentVideoHighlights}
          pendingStartTime={pendingHighlightStartTime}
          formatTime={formatTime}
          onEditHighlight={onEditHighlight}
          onRemoveHighlight={onRemoveHighlight}
          onSeekToHighlight={onSeek}
        />
      ) : null}

      <div className="control-row">
        <PlayerPlaybackControls
          canPlayNext={canPlayNext}
          hasCurrentVideo={hasCurrentVideo}
          isMuted={isMuted}
          isPlaying={isPlaying}
          playbackRate={effectivePlaybackRate}
          playbackRateOptions={playbackRateOptions}
          volume={volume}
          onChangePlaybackRate={onChangePlaybackRate}
          onChangeVolume={onChangeVolume}
          onPlayNext={onPlayNext}
          onToggleMute={onToggleMute}
          onTogglePlay={onTogglePlay}
        />

        <PlayerOptionControls
          hasCompatibleMedia={currentVideoHasCompatibleMedia}
          hasCurrentVideo={hasCurrentVideo}
          holdPlaybackRate={holdPlaybackRate}
          holdRateOptions={holdRateOptions}
          isDeletingCompatibleMedia={isDeletingCompatibleMedia}
          playbackMode={playbackMode}
          playbackModeOptions={playbackModeOptions}
          seekStep={seekStep}
          seekStepOptions={seekStepOptions}
          showPlaybackMode={showPlaybackMode}
          sourceChoice={currentVideoSourceChoice}
          onChangeHoldPlaybackRate={onChangeHoldPlaybackRate}
          onChangePlaybackMode={onChangePlaybackMode}
          onChangeSeekStep={onChangeSeekStep}
          onChangeSourceChoice={onChangeSourceChoice}
          onDeleteCompatibleMedia={onDeleteCompatibleMedia}
        />

        <PlayerMediaActionControls
          canUseEmbeddedSubtitles={canUseEmbeddedSubtitles}
          currentVideoRating={currentVideoRating}
          hasCurrentVideo={hasCurrentVideo}
          hasSelectedSubtitle={hasSelectedSubtitle}
          homeMediaMode={homeMediaMode}
          isAiPanelOpen={isAiPanelOpen}
          isDanmakuActive={danmakuEnabled}
          isEmbeddedSubtitleLoading={isEmbeddedSubtitleLoading}
          isHighEnergyMarkDisabled={isHighEnergyMarkDisabled}
          isHighEnergyMarkPending={isHighEnergyMarkPending}
          isSeriesMode={isSeriesMode}
          selectedSubtitleId={selectedSubtitleId}
          subtitleControlOptions={subtitleControlOptions}
          videoTagCount={currentVideoTagsCount}
          onChangeSubtitle={onChangeSubtitle}
          onMarkHighEnergySegment={onMarkHighEnergySegment}
          onOpenAiPanel={onOpenAiPanel}
          onOpenDanmakuDialog={onOpenDanmakuDialog}
          onOpenRatingDialog={onOpenRatingDialog}
          onOpenTagDialog={onOpenTagDialog}
          onProbeEmbeddedSubtitles={onProbeEmbeddedSubtitles}
        />
        {canRecordEmission ? (
          <SpecialStatsControl disabled={!hasCurrentVideo} stats={currentVideoSpecialStats} onRecordEmission={onRecordEmission} />
        ) : null}

        <span className="control-spacer" />

        <PlayerViewControls
          hasCurrentVideo={hasCurrentVideo}
          isCinemaMode={isCinemaMode}
          isPrivacyMode={isPrivacyMode}
          normalizedVideoRotation={normalizedVideoRotation}
          startFromHighEnergy={startFromHighEnergy}
          onRotateVideo={onRotateVideo}
          onToggleCinemaMode={onToggleCinemaMode}
          onToggleFullscreen={onToggleFullscreen}
          onTogglePictureInPicture={onTogglePictureInPicture}
          onTogglePrivacyMode={onTogglePrivacyMode}
          onToggleShortcutDialog={onToggleShortcutDialog}
          onToggleStartFromHighEnergy={onToggleStartFromHighEnergy}
        />
      </div>
    </div>
  );
}
