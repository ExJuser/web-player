import type { AutoNextPrompt } from "./playerTypes";

type AutoNextPromptCardProps = {
  prompt: AutoNextPrompt;
  onCancel: () => void;
  onConfirm: (videoId: string) => void;
};

export function AutoNextPromptCard({ prompt, onCancel, onConfirm }: AutoNextPromptCardProps) {
  return (
    <div className="auto-next-prompt" role="status" aria-live="polite">
      <div className="auto-next-countdown">{prompt.remainingSeconds}</div>
      <div className="auto-next-copy">
        <span>即将播放下一集</span>
        <strong>{prompt.nextVideoName}</strong>
      </div>
      <div className="auto-next-actions">
        <button type="button" onClick={() => onConfirm(prompt.nextVideoId)}>
          立即播放
        </button>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
