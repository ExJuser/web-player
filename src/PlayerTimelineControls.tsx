import { Pencil, X, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import { clamp } from "./playerInteractionUtils";
import { createPlaybackHistoryGradient, getPlaybackHistoryAtTime } from "./playbackHistory";
import { PlayerEditSegmentMenu } from "./PlayerEditSegmentMenu";
import type { PlaybackHistory, VideoEditSegment, VideoHighlightSegment } from "./playerTypes";

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
  history?: PlaybackHistory;
  editSegments: VideoEditSegment[];
  canGenerateMontage: boolean;
  montageDisabledReason: string;
  isPrivacyMode: boolean;
  isHighEnergyMarkDisabled: boolean;
  isHighEnergyMarkPending: boolean;
  highEnergyPendingStartTime: number | null;
  showEditSegmentControls: boolean;
  progressPercent: number;
  timelinePreview: TimelinePreviewState;
  timelineRef: Ref<HTMLInputElement>;
  onHideTimelinePreview: () => void;
  onGenerateMontage: () => void;
  onMarkHighEnergySegment: () => void;
  onEditHighlight: (highlight: VideoHighlightSegment) => void;
  onRemoveHighlight: (highlightId: string) => void;
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
  history,
  editSegments,
  canGenerateMontage,
  montageDisabledReason,
  isPrivacyMode,
  isHighEnergyMarkDisabled,
  isHighEnergyMarkPending,
  highEnergyPendingStartTime,
  showEditSegmentControls,
  progressPercent,
  timelinePreview,
  timelineRef,
  onHideTimelinePreview,
  onGenerateMontage,
  onMarkHighEnergySegment,
  onEditHighlight,
  onRemoveHighlight,
  onRemoveEditSegment,
  onReturnFocusToPlayer,
  onSeek,
  onStopTimelineDragPreview,
  onUpdateTimelinePreview,
  onUpdateTimelinePreviewFromTime,
}: PlayerTimelineControlsProps) {
  const isPointerDraggingRef = useRef(false);
  const segmentPopoverRef = useRef<HTMLDivElement | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<{ type: "highlight" | "edit"; id: string } | null>(null);
  const displayTime = timelinePreview.isDragging ? timelinePreview.time : currentTime;
  const displayProgressPercent = duration ? clamp((displayTime / duration) * 100, 0, 100) : progressPercent;
  const historyGradient = createPlaybackHistoryGradient(history, duration);
  const previewHistory = getPlaybackHistoryAtTime(history, timelinePreview.time, duration);
  const previewHistoryLabel = previewHistory
    ? `${previewHistory.passes >= 1.5 ? `重复观看约 ${previewHistory.passes.toFixed(1)} 遍` : "已看过"} · 累计 ${formatTime(previewHistory.watchedSeconds)}`
    : "这一段还没看过";
  const selectedHighlight = selectedMarker?.type === "highlight"
    ? highlights.find((highlight) => highlight.id === selectedMarker.id) ?? null
    : null;
  const selectedEditSegment = selectedMarker?.type === "edit"
    ? editSegments.find((segment) => segment.id === selectedMarker.id) ?? null
    : null;
  const selectedSegment = selectedHighlight ?? selectedEditSegment;
  const selectedSegmentLeft = selectedSegment && duration
    ? clamp((((selectedSegment.startTime + selectedSegment.endTime) / 2) / duration) * 100, 0, 100)
    : 0;

  useEffect(() => {
    if (!selectedMarker) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !segmentPopoverRef.current?.contains(target)) setSelectedMarker(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMarker(null);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedMarker]);

  useEffect(() => {
    if (selectedMarker && !selectedSegment) setSelectedMarker(null);
  }, [selectedMarker, selectedSegment]);

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
      <span className="timeline-time timeline-time-current">{formatTime(displayTime)}</span>
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
            <span className="timeline-preview-time">{formatTime(timelinePreview.time)}</span>
          </span>
          {history ? <span className="timeline-preview-history">{previewHistoryLabel}</span> : null}
        </output>
        {duration && highlights.length ? (
          <div className="timeline-highlights" aria-label="高能片段">
            {highlights.map((highlight) => (
              <button
                key={highlight.id}
                className={selectedHighlight?.id === highlight.id ? "active" : ""}
                type="button"
                aria-label={`高能片段 ${highlight.tag || "未命名"}，${formatTime(highlight.startTime)} 至 ${formatTime(highlight.endTime)}`}
                onClick={() => setSelectedMarker((current) => current?.type === "highlight" && current.id === highlight.id ? null : { type: "highlight", id: highlight.id })}
                style={{
                  left: `${clamp((highlight.startTime / duration) * 100, 0, 100)}%`,
                  width: `${clamp(((highlight.endTime - highlight.startTime) / duration) * 100, 0.5, 100)}%`,
                }}
              />
            ))}
          </div>
        ) : null}
        {showEditSegmentControls && duration && editSegments.length ? (
          <div className="timeline-edit-segments" aria-label="剪辑保留片段">
            {editSegments.map((segment) => (
              <button
                key={segment.id}
                className={selectedEditSegment?.id === segment.id ? "active" : ""}
                type="button"
                aria-label={`剪辑保留片段，${formatTime(segment.startTime)} 至 ${formatTime(segment.endTime)}`}
                onClick={() => setSelectedMarker((current) => current?.type === "edit" && current.id === segment.id ? null : { type: "edit", id: segment.id })}
                style={{
                  left: `${clamp((segment.startTime / duration) * 100, 0, 100)}%`,
                  width: `${clamp(((segment.endTime - segment.startTime) / duration) * 100, 0.5, 100)}%`,
                }}
              />
            ))}
          </div>
        ) : null}
        {selectedSegment ? (
          <div
            className="timeline-segment-popover"
            ref={segmentPopoverRef}
            style={{ "--segment-left": `${selectedSegmentLeft}%` } as CSSProperties}
          >
            <strong>{selectedHighlight ? selectedHighlight.tag || "高能片段" : "剪辑保留片段"}</strong>
            <span>{formatTime(selectedSegment.startTime)} - {formatTime(selectedSegment.endTime)}</span>
            <div>
              <button type="button" onClick={() => {
                onSeek(selectedSegment.startTime);
                setSelectedMarker(null);
              }}>跳转</button>
              {selectedHighlight ? (
                <button type="button" onClick={() => {
                  onEditHighlight(selectedHighlight);
                  setSelectedMarker(null);
                }}>
                  <Pencil size={13} />修改标签
                </button>
              ) : null}
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (selectedHighlight) onRemoveHighlight(selectedHighlight.id);
                  if (selectedEditSegment) onRemoveEditSegment(selectedEditSegment.id);
                  setSelectedMarker(null);
                }}
              >
                <X size={13} />删除
              </button>
            </div>
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
          style={{
            "--history-gradient": historyGradient,
            "--progress": `${displayProgressPercent}%`,
          } as CSSProperties}
          disabled={!hasCurrentVideo || isPrivacyMode}
        />
      </div>
      <span className="timeline-time timeline-time-duration">{formatTime(duration)}</span>
      {showEditSegmentControls ? (
        <button
          className={`timeline-highlight-action ${isHighEnergyMarkPending ? "active" : ""}`}
          type="button"
          onClick={onMarkHighEnergySegment}
          disabled={isHighEnergyMarkDisabled}
          aria-pressed={isHighEnergyMarkPending}
        >
          <Zap size={15} aria-hidden="true" />
          <span>{isHighEnergyMarkPending && highEnergyPendingStartTime !== null ? `设为终点 · ${formatTime(highEnergyPendingStartTime)}` : "标记高能"}</span>
        </button>
      ) : null}
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
