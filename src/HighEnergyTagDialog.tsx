import { Sparkles, X } from "lucide-react";

export type HighEnergyTagPrompt = {
  videoId: string;
  videoName: string;
  startTime: number;
  endTime: number;
  tagInput: string;
  highlightId?: string;
};

type HighEnergyTagDialogProps = {
  prompt: HighEnergyTagPrompt | null;
  onClose: () => void;
  onSave: () => void;
  onPromptChange: (updater: (prompt: HighEnergyTagPrompt | null) => HighEnergyTagPrompt | null) => void;
  formatTime: (seconds: number) => string;
};

export function HighEnergyTagDialog({
  prompt,
  onClose,
  onSave,
  onPromptChange,
  formatTime,
}: HighEnergyTagDialogProps) {
  if (!prompt) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        aria-labelledby="high-energy-tag-title"
        aria-modal="true"
        className="high-energy-tag-dialog"
        role="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="dialog-icon">
          <Sparkles size={28} />
        </div>
        <div className="dialog-copy">
          <h2 id="high-energy-tag-title">{prompt.highlightId ? "编辑高能片段" : "高能片段标签"}</h2>
          <p>
            {formatTime(prompt.startTime)} - {formatTime(prompt.endTime)} · {prompt.videoName}
          </p>
        </div>
        <label className="high-energy-tag-field">
          <span>标签</span>
          <input
            autoFocus
            maxLength={40}
            value={prompt.tagInput}
            onChange={(event) =>
              onPromptChange((previous) =>
                previous ? { ...previous, tagInput: event.target.value } : previous,
              )
            }
            placeholder="例如：名场面"
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit" disabled={!prompt.tagInput.trim()}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
