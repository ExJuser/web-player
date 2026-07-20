import { useRef, type CSSProperties, type ChangeEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import { clamp } from "./playerInteractionUtils";
import { PlayerEditSegmentMenu } from "./PlayerEditSegmentMenu";
import type { VideoEditSegment, VideoHighlightSegment } from "./playerTypes";

type TimelinePreviewState = {
  time: number;
  left: number;
  isVisible: boolean;
  isDragging: boolean;
  imageUrl: string;
  isLoadingFrame: boolean;
};

type PlayerTimelineControlsProps = {
  currentTime: number;
  duration: number;
  formatTime: (time: number) => string;
  hasCurrentVideo: boolean;
  highlights: VideoHighlightSegment[];
  editSegments: VideoEditSegment[];
  canGenerateMontage: boolean;
  montageDisabledReason: string;
  isPrivacyMode: boolean;
  showEditSegmentControls: boolean;
  progressPercent: number;
  timelinePreview: TimelinePreviewState;
  timelineRef: Ref<HTMLInputElement>;
  onHideTimelinePreview: () => void;
  onGenerateMontage: () => void;
  onRemoveEditSegment: (segmentId: string) => void;
  onReturnFocusToPlayer: () => void;
  onSeek: (time: number) => void;
  onStopTimelineDragPreview: () => void;
  onUpdateTimelinePreview: (clientX: number, isDragging: boolean) => void;
  onUpdateTimelinePreviewFromTime: (time: number, isDragging: boolean) => void;
};

export function PlayerTimelineControls({
  currentTime,
  duration,
  formatTime,
  hasCurrentVideo,
  highlights,
  editSegments,
  canGenerateMontage,
  montageDisabledReason,
  isPrivacyMode,
  showEditSegmentControls,
  progressPercent,
  timelinePreview,
  timelineRef,
  onHideTimelinePreview,
  onGenerateMontage,
  onRemoveEditSegment,
  onReturnFocusToPlayer,
  onSeek,
  onStopTimelineDragPreview,
  onUpdateTimelinePreview,
  onUpdateTimelinePreviewFromTime,
}: PlayerTimelineControlsProps) {
  const isPointerDraggingRef = useRef(false);
  const displayTime = timelinePreview.isDragging ? timelinePreview.time : currentTime;
  const displayProgressPercent = duration ? clamp((displayTime / duration) * 100, 0, 100) : progressPercent;

  const handleTimelineChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isPrivacyMode) return;
    const nextTime = Number(event.target.value);
    if (!isPointerDraggingRef.current) {
      onSeek(nextTime);
    }
    onUpdateTimelinePreviewFromTime(nextTime, isPointerDraggingRef.current);
  };

  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (isPrivacyMode) return;
    isPointerDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onUpdateTimelinePreview(event.clientX, true);
  };

  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (isPrivacyMode) return;
    onUpdateTimelinePreview(event.clientX, timelinePreview.isDragging);
  };

  const handleTimelinePointerUp = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (isPrivacyMode) return;
    isPointerDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onSeek(Number(event.currentTarget.value));
    onStopTimelineDragPreview();
    onReturnFocusToPlayer();
  };

  const handleTimelinePointerCancel = (event: ReactPointerEvent<HTMLInputElement>) => {
    isPointerDraggingRef.current = false;
    onSeek(Number(event.currentTarget.value));
    onStopTimelineDragPreview();
    onReturnFocusToPlayer();
  };

  return (
    <div className="timeline-row">
      <span>{formatTime(displayTime)}</span>
      <div
        className={`timeline-track ${timelinePreview.isVisible ? "preview-visible" : ""}`}
        style={
          {
            "--preview-left": `${timelinePreview.left}%`,
          } as CSSProperties
        }
      >
        <output className="timeline-preview">
          <span className="timeline-preview-frame">
            {timelinePreview.imageUrl ? (
              <img src={timelinePreview.imageUrl} alt="" draggable={false} />
            ) : (
              <span className="timeline-preview-placeholder">
                {timelinePreview.isLoadingFrame ? "" : formatTime(timelinePreview.time)}
              </span>
            )}
          </span>
          <span className="timeline-preview-time">{formatTime(timelinePreview.time)}</span>
        </output>
        {duration && highlights.length ? (
          <div className="timeline-highlights" aria-hidden="true">
            {highlights.map((highlight) => (
              <span
                key={highlight.id}
                style={{
                  left: `${clamp((highlight.startTime / duration) * 100, 0, 100)}%`,
                  width: `${clamp(((highlight.endTime - highlight.startTime) / duration) * 100, 0.5, 100)}%`,
                }}
              />
            ))}
          </div>
        ) : null}
        {showEditSegmentControls && duration && editSegments.length ? (
          <div className="timeline-edit-segments" aria-hidden="true">
            {editSegments.map((segment) => (
              <span key={segment.id} style={{
                left: `${clamp((segment.startTime / duration) * 100, 0, 100)}%`,
                width: `${clamp(((segment.endTime - segment.startTime) / duration) * 100, 0.5, 100)}%`,
              }} />
            ))}
          </div>
        ) : null}
        <input
          ref={timelineRef}
          aria-label="播放进度"
          className="timeline"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={duration ? displayTime : 0}
          onChange={handleTimelineChange}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerCancel={handleTimelinePointerCancel}
          onPointerLeave={() => {
            if (!isPrivacyMode) onHideTimelinePreview();
          }}
          style={{ "--progress": `${displayProgressPercent}%` } as CSSProperties}
          disabled={!hasCurrentVideo || isPrivacyMode}
        />
      </div>
      <span>{formatTime(duration)}</span>
      {showEditSegmentControls ? (
        <PlayerEditSegmentMenu
          segments={editSegments}
          canGenerate={canGenerateMontage}
          disabledReason={montageDisabledReason}
          formatTime={formatTime}
          onGenerate={onGenerateMontage}
          onRemove={onRemoveEditSegment}
          onSeek={onSeek}
        />
      ) : null}
    </div>
  );
}
