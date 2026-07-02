import { X } from "lucide-react";

import type { EmbeddedSubtitleTrack } from "./playerTypes";

type EmbeddedSubtitleDialogProps = {
  isOpen: boolean;
  tracks: EmbeddedSubtitleTrack[];
  message: string;
  isLoading: boolean;
  onClose: () => void;
  onExtract: (track: EmbeddedSubtitleTrack) => void;
};

export function EmbeddedSubtitleDialog({
  isOpen,
  tracks,
  message,
  isLoading,
  onClose,
  onExtract,
}: EmbeddedSubtitleDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="embedded-subtitle-title"
        aria-modal="true"
        className="embedded-subtitle-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="dialog-copy">
          <h2 id="embedded-subtitle-title">内封字幕</h2>
          <p>{message || "选择一条文本字幕轨，播放器会提取为 WebVTT 并缓存到本地项目数据目录。"}</p>
        </div>
        <div className="embedded-subtitle-list">
          {tracks.map((track) => (
            <button
              key={track.streamIndex}
              className="embedded-subtitle-track"
              type="button"
              onClick={() => onExtract(track)}
              disabled={!track.extractable || isLoading}
            >
              <strong>
                #{track.streamIndex} {track.language || "und"} {track.title || ""}
              </strong>
              <span>
                {track.codec}
                {track.extractable ? "" : ` · ${track.reason || "暂不支持"}`}
              </span>
            </button>
          ))}
          {!tracks.length ? <div className="ai-empty-state">没有可用的内封字幕轨。</div> : null}
        </div>
      </section>
    </div>
  );
}
