import { AudioLines } from "lucide-react";

type GeneratedSubtitleDialogProps = {
  isOpen: boolean;
  modelLabel: string;
  vadAvailable: boolean;
  videoName: string;
  onClose: () => void;
  onGenerate: () => void;
};

export function GeneratedSubtitleDialog({
  isOpen,
  modelLabel,
  vadAvailable,
  videoName,
  onClose,
  onGenerate,
}: GeneratedSubtitleDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="compatible-media-dialog" role="dialog" aria-modal="true" aria-labelledby="generated-subtitle-title">
        <div className="dialog-icon"><AudioLines size={28} /></div>
        <div className="dialog-copy">
          <h2 id="generated-subtitle-title">生成日语字幕</h2>
          <p>将在本机提取音频并生成 WebVTT 字幕，原影片不会被修改。</p>
        </div>
        <div className="compatible-media-dialog-file">
          <strong>{videoName}</strong>
          <span>{modelLabel}{vadAvailable ? " · 已启用语音活动检测" : ""}</span>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" onClick={onGenerate}>开始生成</button>
        </div>
      </section>
    </div>
  );
}
