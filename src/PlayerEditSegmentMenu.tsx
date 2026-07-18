import { Scissors, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { VideoEditSegment } from "./playerTypes";

type PlayerEditSegmentMenuProps = {
  segments: VideoEditSegment[];
  canGenerate: boolean;
  disabledReason: string;
  formatTime: (time: number) => string;
  onGenerate: () => void;
  onRemove: (segmentId: string) => void;
  onSeek: (time: number) => void;
};

export function PlayerEditSegmentMenu({ segments, canGenerate, disabledReason, formatTime, onGenerate, onRemove, onSeek }: PlayerEditSegmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="timeline-edit-menu" ref={menuRef}>
      <button
        className={`timeline-edit-menu-button ${segments.length ? "active" : ""}`}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label={`管理剪辑保留片段，当前 ${segments.length} 个`}
        title={segments.length ? `管理 ${segments.length} 个剪辑保留片段` : "尚未标记剪辑保留片段"}
      >
        <Scissors size={14} />
        <span>{segments.length}</span>
      </button>
      {isOpen ? (
        <div className="timeline-edit-popover">
          <strong>剪辑保留片段</strong>
          {segments.length ? (
            <div className="timeline-edit-list custom-scrollbar">
              {segments.map((segment, index) => (
                <div className="timeline-edit-item" key={segment.id}>
                  <button type="button" onClick={() => onSeek(segment.startTime)}>
                    <span>片段 {index + 1}</span>
                    <small>{formatTime(segment.startTime)} - {formatTime(segment.endTime)}</small>
                  </button>
                  <button type="button" onClick={() => onRemove(segment.id)} aria-label={`删除剪辑片段 ${index + 1}`}><X size={14} /></button>
                </div>
              ))}
            </div>
          ) : <p>点击控制栏中的剪刀，依次标记保留起点和终点。</p>}
          <button className="primary-button timeline-edit-generate" type="button" onClick={onGenerate} disabled={!canGenerate} title={canGenerate ? "生成剪辑版" : disabledReason}>
            <Scissors size={15} />生成剪辑版
          </button>
          {!canGenerate && disabledReason ? <small className="timeline-edit-disabled-reason">{disabledReason}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
