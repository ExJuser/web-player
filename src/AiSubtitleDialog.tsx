import { X } from "lucide-react";

export type AiSubtitleTab = "summary" | "qa" | "recap";

type AiSubtitleDialogProps = {
  isOpen: boolean;
  selectedSubtitleName: string;
  isAiConfigured: boolean;
  aiTab: AiSubtitleTab;
  subtitleSummary: string;
  subtitleQuestion: string;
  subtitleAnswer: string;
  subtitleRecap: string;
  aiMessage: string;
  isAiLoading: boolean;
  currentTime: number;
  onClose: () => void;
  onTabChange: (tab: AiSubtitleTab) => void;
  onQuestionChange: (value: string) => void;
  onLoadSummary: () => void;
  onAskQuestion: () => void;
  onLoadRecap: () => void;
  formatTime: (seconds: number) => string;
};

export function AiSubtitleDialog({
  isOpen,
  selectedSubtitleName,
  isAiConfigured,
  aiTab,
  subtitleSummary,
  subtitleQuestion,
  subtitleAnswer,
  subtitleRecap,
  aiMessage,
  isAiLoading,
  currentTime,
  onClose,
  onTabChange,
  onQuestionChange,
  onLoadSummary,
  onAskQuestion,
  onLoadRecap,
  formatTime,
}: AiSubtitleDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="ai-subtitle-title"
        aria-modal="true"
        className="ai-subtitle-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="ai-dialog-header">
          <div>
            <h2 id="ai-subtitle-title">AI 字幕助手</h2>
            <span>{selectedSubtitleName || "未选择字幕"}</span>
          </div>
          <div className="ai-tabs" role="tablist" aria-label="AI 字幕工具">
            <button className={aiTab === "summary" ? "active" : ""} type="button" onClick={() => onTabChange("summary")}>
              总结
            </button>
            <button className={aiTab === "qa" ? "active" : ""} type="button" onClick={() => onTabChange("qa")}>
              问答
            </button>
            <button className={aiTab === "recap" ? "active" : ""} type="button" onClick={() => onTabChange("recap")}>
              回顾
            </button>
          </div>
        </div>
        {!selectedSubtitleName ? (
          <div className="ai-empty-state">请先在播放器控制栏选择字幕。</div>
        ) : !isAiConfigured ? (
          <div className="ai-empty-state">未配置 DEEPSEEK_API_KEY。配置后重启开发服务即可使用。</div>
        ) : aiTab === "summary" ? (
          <div className="ai-panel-body">
            <div className="dialog-actions compact">
              <button className="primary-button" type="button" onClick={onLoadSummary} disabled={isAiLoading}>
                {subtitleSummary ? "重新总结" : "生成总结"}
              </button>
            </div>
            <div className="ai-output">{subtitleSummary || aiMessage || "还没有生成总结。"}</div>
          </div>
        ) : aiTab === "recap" ? (
          <div className="ai-panel-body">
            <div className="ai-recap-meta">截至当前时间 {formatTime(currentTime)}</div>
            <div className="dialog-actions compact">
              <button className="primary-button" type="button" onClick={onLoadRecap} disabled={isAiLoading}>
                {subtitleRecap ? "重新回顾" : "生成回顾"}
              </button>
            </div>
            <div className="ai-output">{subtitleRecap || aiMessage || "还没有生成进度回顾。"}</div>
          </div>
        ) : (
          <form
            className="ai-panel-body"
            onSubmit={(event) => {
              event.preventDefault();
              onAskQuestion();
            }}
          >
            <textarea
              className="ai-question-input"
              value={subtitleQuestion}
              onChange={(event) => onQuestionChange(event.target.value)}
              placeholder="基于当前字幕提问..."
              rows={4}
            />
            <div className="dialog-actions compact">
              <button className="primary-button" type="submit" disabled={isAiLoading || !subtitleQuestion.trim()}>
                提问
              </button>
            </div>
            <div className="ai-output">{subtitleAnswer || aiMessage || "回答会显示在这里。"}</div>
          </form>
        )}
        {isAiLoading ? <div className="ai-loading">处理中...</div> : null}
      </section>
    </div>
  );
}
