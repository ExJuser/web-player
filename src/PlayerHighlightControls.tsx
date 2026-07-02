import { Pencil, X } from "lucide-react";

import type { VideoHighlightSegment } from "./playerTypes";

type PlayerHighlightControlsProps = {
  highlights: VideoHighlightSegment[];
  pendingStartTime: number | null;
  formatTime: (time: number) => string;
  onEditHighlight: (highlight: VideoHighlightSegment) => void;
  onRemoveHighlight: (highlightId: string) => void;
  onSeekToHighlight: (time: number) => void;
};

export function PlayerHighlightControls({
  highlights,
  pendingStartTime,
  formatTime,
  onEditHighlight,
  onRemoveHighlight,
  onSeekToHighlight,
}: PlayerHighlightControlsProps) {
  if (!highlights.length && pendingStartTime === null) return null;

  return (
    <div className="highlight-control-row">
      {pendingStartTime !== null ? <span className="highlight-pending-chip">起点 {formatTime(pendingStartTime)}</span> : null}
      {highlights.length ? (
        <div className="highlight-chip-list" aria-label="高能片段">
          {highlights.map((highlight) => (
            <span className="highlight-chip" key={highlight.id}>
              <button type="button" onClick={() => onSeekToHighlight(highlight.startTime)}>
                {highlight.tag ? <strong>{highlight.tag}</strong> : null}
                <span>
                  {formatTime(highlight.startTime)} - {formatTime(highlight.endTime)}
                </span>
              </button>
              <button type="button" onClick={() => onEditHighlight(highlight)} aria-label="修改高能片段标签">
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => onRemoveHighlight(highlight.id)} aria-label="删除高能标记">
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
