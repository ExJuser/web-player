import type { CSSProperties, FocusEventHandler, MouseEventHandler, PointerEventHandler, Ref } from "react";

import { PlayerMediaActionControls } from "./PlayerMediaActionControls";
import { PlayerOptionControls } from "./PlayerOptionControls";
import { PlayerPlaybackControls } from "./PlayerPlaybackControls";
import { PlayerTimelineControls } from "./PlayerTimelineControls";
import { PlayerViewControls } from "./PlayerViewControls";
import { SpecialStatsControl } from "./SpecialStatsControl";
import { usePlaybackSnapshot, type PlaybackRuntimeApi } from "./playbackRuntime";
import { createPlaybackHistoryGradient } from "./playbackHistory";
import type { HomeMediaMode } from "./playerUiState";
import type { PlaybackHistory, PlaybackMode, SubtitleStylePreferences, VideoEditSegment, VideoHighlightSegment } from "./playerTypes";

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
  canPlayPrevious: boolean;
  canRecordEmission: boolean;
  canUseEmbeddedSubtitles: boolean;
  canRestoreWithLada: boolean;
  canGenerateMontage: boolean;
  controlBarRef: Ref<HTMLDivElement>;
  currentVideoHasCompatibleMedia: boolean;
  currentVideoHighlights: VideoHighlightSegment[];
  currentVideoHistory?: PlaybackHistory;
  currentVideoEditSegments: VideoEditSegment[];
  currentVideoRating: number | null | undefined;
  currentVideoSpecialStats: SpecialVideoStats;
  currentVideoSourceChoice: PlaybackSourceChoice;
  currentVideoTagsCount: number;
  danmakuEnabled: boolean;
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
  isEditSegmentMarkDisabled: boolean;
  isEditSegmentMarkPending: boolean;
  isHighEnergyMarkDisabled: boolean;
  isHighEnergyMarkPending: boolean;
  highEnergyPendingStartTime: number | null;
  isMuted: boolean;
  isPrivacyMode: boolean;
  isSeriesMode: boolean;
  ladaDisabledReason: string;
  normalizedVideoRotation: number;
  montageDisabledReason: string;
  playbackMode: PlaybackMode;
  playbackModeOptions: Array<{ value: PlaybackMode; label: string }>;
  playbackRateOptions: Array<{ value: number; label: string }>;
  playbackRuntime: PlaybackRuntimeApi;
  seekStep: number;
  seekStepOptions: Array<{ value: number; label: string }>;
  selectedSubtitleId: string;
  showPlaybackMode: boolean;
  startFromHighEnergy: boolean;
  subtitleControlOptions: Array<{ value: string; label: string }>;
  subtitleStyle: SubtitleStylePreferences;
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
  onChangeSubtitleStyle: (style: SubtitleStylePreferences) => void;
  onChangeVolume: (volume: number) => void;
  onDeleteCompatibleMedia: () => void;
  onEditHighlight: (highlight: VideoHighlightSegment) => void;
  onHideTimelinePreview: () => void;
  onGenerateMontage: () => void;
  onKeepControlsVisible: () => void;
  onMarkHighEnergySegment: () => void;
  onMarkEditSegment: () => void;
  onOpenAiPanel: () => void;
  onOpenDanmakuDialog: () => void;
  onOpenRatingDialog: () => void;
  onOpenLadaRestoration: () => void;
  onOpenTagDialog: () => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onProbeEmbeddedSubtitles: () => void;
  onRecordEmission: () => void;
  onRemoveHighlight: (highlightId: string) => void;
  onRemoveEditSegment: (segmentId: string) => void;
  onReturnFocusToPlayer: () => void;
  onRotateVideo: () => void;
  onScheduleControlsHide: () => void;
  onSeek: (time: number) => void;
  onStopTimelineDragPreview: () => void;
  onToggleCinemaMode: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onToggleMultiView: () => void;
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
  canPlayPrevious,
  canRecordEmission,
  canUseEmbeddedSubtitles,
  canRestoreWithLada,
  canGenerateMontage,
  controlBarRef,
  currentVideoHasCompatibleMedia,
  currentVideoHighlights,
  currentVideoHistory,
  currentVideoEditSegments,
  currentVideoRating,
  currentVideoSpecialStats,
  currentVideoSourceChoice,
  currentVideoTagsCount,
  danmakuEnabled,
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
  isEditSegmentMarkDisabled,
  isEditSegmentMarkPending,
  isHighEnergyMarkDisabled,
  isHighEnergyMarkPending,
  highEnergyPendingStartTime,
  isMuted,
  isPrivacyMode,
  isSeriesMode,
  ladaDisabledReason,
  normalizedVideoRotation,
  montageDisabledReason,
  playbackMode,
  playbackModeOptions,
  playbackRateOptions,
  playbackRuntime,
  seekStep,
  seekStepOptions,
  selectedSubtitleId,
  showPlaybackMode,
  startFromHighEnergy,
  subtitleControlOptions,
  subtitleStyle,
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
  onChangeSubtitleStyle,
  onChangeVolume,
  onDeleteCompatibleMedia,
  onEditHighlight,
  onHideTimelinePreview,
  onGenerateMontage,
  onKeepControlsVisible,
  onMarkHighEnergySegment,
  onMarkEditSegment,
  onOpenAiPanel,
  onOpenDanmakuDialog,
  onOpenRatingDialog,
  onOpenLadaRestoration,
  onOpenTagDialog,
  onPlayNext,
  onPlayPrevious,
  onProbeEmbeddedSubtitles,
  onRecordEmission,
  onRemoveHighlight,
  onRemoveEditSegment,
  onReturnFocusToPlayer,
  onRotateVideo,
  onScheduleControlsHide,
  onSeek,
  onStopTimelineDragPreview,
  onToggleCinemaMode,
  onToggleFullscreen,
  onToggleMute,
  onToggleMultiView,
  onTogglePictureInPicture,
  onTogglePlay,
  onTogglePrivacyMode,
  onToggleShortcutDialog,
  onToggleStartFromHighEnergy,
  onUpdateTimelinePreview,
  onUpdateTimelinePreviewFromTime,
}: PlayerControlBarProps) {
  const { currentTime, duration, isPlaying } = usePlaybackSnapshot(playbackRuntime);
  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const visibleHistory = isPrivacyMode ? undefined : currentVideoHistory;
  const historyGradient = createPlaybackHistoryGradient(visibleHistory, duration);
  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    onKeepControlsVisible();
  };
  const handleFocus: FocusEventHandler<HTMLDivElement> = () => onKeepControlsVisible();
  const handleMouseLeave: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.currentTarget.querySelector('details[open], [aria-expanded="true"]')) {
      onKeepControlsVisible();
      return;
    }
    onScheduleControlsHide();
  };
  const handlePointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType !== "mouse") onScheduleControlsHide();
  };

  return (
    <div
      ref={controlBarRef}
      className="control-bar"
      onFocus={handleFocus}
      onMouseEnter={onKeepControlsVisible}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onPointerDown={onKeepControlsVisible}
      onPointerUp={handlePointerUp}
    >
      <div
        className="control-progress-rail"
        aria-hidden="true"
        style={{ "--history-gradient": historyGradient } as CSSProperties}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <PlayerTimelineControls
        currentTime={currentTime}
        duration={duration}
        formatTime={formatTime}
        hasCurrentVideo={hasCurrentVideo}
        highlights={currentVideoHighlights}
        history={visibleHistory}
        editSegments={currentVideoEditSegments}
        canGenerateMontage={canGenerateMontage}
        montageDisabledReason={montageDisabledReason}
        isPrivacyMode={isPrivacyMode}
        isHighEnergyMarkDisabled={isHighEnergyMarkDisabled || !duration}
        isHighEnergyMarkPending={isHighEnergyMarkPending}
        highEnergyPendingStartTime={highEnergyPendingStartTime}
        showEditSegmentControls={homeMediaMode === "special"}
        progressPercent={progressPercent}
        timelinePreview={timelinePreview}
        timelineRef={timelineRef}
        onHideTimelinePreview={onHideTimelinePreview}
        onGenerateMontage={onGenerateMontage}
        onMarkHighEnergySegment={onMarkHighEnergySegment}
        onEditHighlight={onEditHighlight}
        onRemoveHighlight={onRemoveHighlight}
        onRemoveEditSegment={onRemoveEditSegment}
        onReturnFocusToPlayer={onReturnFocusToPlayer}
        onSeek={onSeek}
        onStopTimelineDragPreview={onStopTimelineDragPreview}
        onUpdateTimelinePreview={onUpdateTimelinePreview}
        onUpdateTimelinePreviewFromTime={onUpdateTimelinePreviewFromTime}
      />

      <div className="control-row">
        <div className="control-primary-playback">
          <PlayerPlaybackControls
            canPlayNext={canPlayNext}
            canPlayPrevious={canPlayPrevious}
            hasCurrentVideo={hasCurrentVideo}
            isMuted={isMuted}
            isPlaying={isPlaying}
            playbackRate={effectivePlaybackRate}
            playbackRateOptions={playbackRateOptions}
            volume={volume}
            onChangePlaybackRate={onChangePlaybackRate}
            onChangeVolume={onChangeVolume}
            onPlayNext={onPlayNext}
            onPlayPrevious={onPlayPrevious}
            onToggleMute={onToggleMute}
            onTogglePlay={onTogglePlay}
          />
        </div>

        <div className="control-secondary-strip">
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
            subtitleStyle={subtitleStyle}
            onChangeHoldPlaybackRate={onChangeHoldPlaybackRate}
            onChangePlaybackMode={onChangePlaybackMode}
            onChangeSeekStep={onChangeSeekStep}
            onChangeSourceChoice={onChangeSourceChoice}
            onChangeSubtitleStyle={onChangeSubtitleStyle}
            onDeleteCompatibleMedia={onDeleteCompatibleMedia}
          />

          <PlayerMediaActionControls
            canUseEmbeddedSubtitles={canUseEmbeddedSubtitles}
            canRestoreWithLada={canRestoreWithLada}
            currentVideoRating={currentVideoRating}
            hasCurrentVideo={hasCurrentVideo}
            hasSelectedSubtitle={hasSelectedSubtitle}
            homeMediaMode={homeMediaMode}
            isAiPanelOpen={isAiPanelOpen}
            isDanmakuActive={danmakuEnabled}
            isEmbeddedSubtitleLoading={isEmbeddedSubtitleLoading}
            isEditSegmentMarkDisabled={isEditSegmentMarkDisabled || !duration}
            isEditSegmentMarkPending={isEditSegmentMarkPending}
            isSeriesMode={isSeriesMode}
            ladaDisabledReason={ladaDisabledReason}
            selectedSubtitleId={selectedSubtitleId}
            subtitleControlOptions={subtitleControlOptions}
            videoTagCount={currentVideoTagsCount}
            onChangeSubtitle={onChangeSubtitle}
            onMarkEditSegment={onMarkEditSegment}
            onOpenAiPanel={onOpenAiPanel}
            onOpenDanmakuDialog={onOpenDanmakuDialog}
            onOpenRatingDialog={onOpenRatingDialog}
            onOpenLadaRestoration={onOpenLadaRestoration}
            onOpenTagDialog={onOpenTagDialog}
            onProbeEmbeddedSubtitles={onProbeEmbeddedSubtitles}
          />
        </div>
        <span className="control-spacer" />

        <div className="control-primary-view">
          <PlayerViewControls
            hasCurrentVideo={hasCurrentVideo}
            isCinemaMode={isCinemaMode}
            isPrivacyMode={isPrivacyMode}
            normalizedVideoRotation={normalizedVideoRotation}
            showStartFromHighEnergy={homeMediaMode === "special"}
            startFromHighEnergy={startFromHighEnergy}
            onRotateVideo={onRotateVideo}
            onToggleCinemaMode={onToggleCinemaMode}
            onToggleFullscreen={onToggleFullscreen}
            onToggleMultiView={onToggleMultiView}
            onTogglePictureInPicture={onTogglePictureInPicture}
            onTogglePrivacyMode={onTogglePrivacyMode}
            onToggleShortcutDialog={onToggleShortcutDialog}
            onToggleStartFromHighEnergy={onToggleStartFromHighEnergy}
          />
        </div>

        {canRecordEmission ? (
          <SpecialStatsControl disabled={!hasCurrentVideo} stats={currentVideoSpecialStats} onRecordEmission={onRecordEmission} />
        ) : null}
      </div>
    </div>
  );
}
