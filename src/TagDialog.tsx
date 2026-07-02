import { CheckCircle2, ExternalLink, RefreshCw, Sparkles, Tags, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, Ref } from "react";

import type { TagMergeSuggestion } from "./tagUtils";

type DialogOffset = {
  x: number;
  y: number;
};

export type TagDialogMergePrompt = {
  pendingTags: string[];
  suggestion: TagMergeSuggestion;
};

type AutoTagSource = {
  title: string;
  url: string;
};

type TagDialogProps = {
  isOpen: boolean;
  dialogRef: Ref<HTMLElement>;
  isDragging: boolean;
  offset: DialogOffset;
  currentVideoName: string;
  currentVideoTags: string[];
  tagInput: string;
  tagInputSuggestions: string[];
  resolvedActiveTagSuggestionIndex: number;
  activeTagSuggestionId?: string;
  isTagSuggestionLoading: boolean;
  isAutoTagLoading: boolean;
  autoTagSuggestions: string[];
  selectedAutoTags: Set<string>;
  autoTagSummary: string;
  autoTagSources: AutoTagSource[];
  autoTagMessage: string;
  tagMergePrompt: TagDialogMergePrompt | null;
  tagMessage: string;
  isAiConfigured: boolean;
  hasCurrentVideo: boolean;
  onClose: () => void;
  onRemoveTag: (tag: string) => void;
  onSubmitTagInput: () => void;
  onTagInputChange: (value: string) => void;
  onActiveTagSuggestionIndexChange: (updater: (index: number) => number) => void;
  onSelectTagSuggestion: (tag: string) => void;
  onGenerateAutoTags: () => void;
  onToggleAutoTag: (tag: string) => void;
  onConfirmAutoTags: () => void;
  onApplyTagMergeSuggestion: () => void;
  onKeepTagMergeSuggestion: () => void;
  onCancelTagMergeSuggestion: () => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function TagDialog({
  isOpen,
  dialogRef,
  isDragging,
  offset,
  currentVideoName,
  currentVideoTags,
  tagInput,
  tagInputSuggestions,
  resolvedActiveTagSuggestionIndex,
  activeTagSuggestionId,
  isTagSuggestionLoading,
  isAutoTagLoading,
  autoTagSuggestions,
  selectedAutoTags,
  autoTagSummary,
  autoTagSources,
  autoTagMessage,
  tagMergePrompt,
  tagMessage,
  isAiConfigured,
  hasCurrentVideo,
  onClose,
  onRemoveTag,
  onSubmitTagInput,
  onTagInputChange,
  onActiveTagSuggestionIndexChange,
  onSelectTagSuggestion,
  onGenerateAutoTags,
  onToggleAutoTag,
  onConfirmAutoTags,
  onApplyTagMergeSuggestion,
  onKeepTagMergeSuggestion,
  onCancelTagMergeSuggestion,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: TagDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop tag-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        aria-labelledby="tag-dialog-title"
        aria-modal="true"
        className={`tag-dialog${isDragging ? " dragging" : ""}`}
        role="dialog"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div
          className="tag-dialog-header"
          onPointerCancel={onPointerCancel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="dialog-icon">
            <Tags size={28} />
          </div>
          <div className="dialog-copy">
            <h2 id="tag-dialog-title">视频标签</h2>
            <p>{currentVideoName || "未选择视频"}</p>
          </div>
        </div>

        <div className="tag-editor-current">
          {currentVideoTags.length ? (
            currentVideoTags.map((tag) => (
              <button className="tag-editor-chip" key={tag} type="button" onClick={() => onRemoveTag(tag)}>
                <span>{tag}</span>
                <X size={14} />
              </button>
            ))
          ) : (
            <div className="ai-empty-state">当前视频还没有标签。</div>
          )}
        </div>

        <form
          className="tag-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitTagInput();
          }}
        >
          <div className="tag-editor-field">
            <input
              autoFocus
              value={tagInput}
              placeholder="输入标签，可用空格、逗号、顿号分隔"
              onChange={(event) => onTagInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (tagInputSuggestions.length && event.key === "ArrowDown") {
                  event.preventDefault();
                  onActiveTagSuggestionIndexChange((index) => (index + 1) % tagInputSuggestions.length);
                  return;
                }
                if (tagInputSuggestions.length && event.key === "ArrowUp") {
                  event.preventDefault();
                  onActiveTagSuggestionIndexChange((index) => (index - 1 + tagInputSuggestions.length) % tagInputSuggestions.length);
                  return;
                }
                if (tagInputSuggestions.length && event.key === "Enter") {
                  event.preventDefault();
                  onSelectTagSuggestion(tagInputSuggestions[resolvedActiveTagSuggestionIndex] ?? tagInputSuggestions[0]);
                  return;
                }
                if (event.key === "Escape") onClose();
              }}
              disabled={!hasCurrentVideo}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(tagInputSuggestions.length)}
              aria-controls={tagInputSuggestions.length ? "tag-input-suggestions" : undefined}
              aria-activedescendant={activeTagSuggestionId}
            />
            {tagInputSuggestions.length ? (
              <div className="tag-input-suggestions" id="tag-input-suggestions" role="listbox" aria-label="已有标签候选">
                {tagInputSuggestions.map((tag, index) => (
                  <button
                    className={index === resolvedActiveTagSuggestionIndex ? "active" : ""}
                    id={`tag-input-suggestion-${index}`}
                    key={tag}
                    type="button"
                    role="option"
                    aria-selected={index === resolvedActiveTagSuggestionIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => onActiveTagSuggestionIndexChange(() => index)}
                    onClick={() => onSelectTagSuggestion(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className={`primary-button tag-query-button${isTagSuggestionLoading ? " loading" : ""}`}
            type="submit"
            disabled={!hasCurrentVideo || !tagInput.trim() || isTagSuggestionLoading}
          >
            {isTagSuggestionLoading ? <RefreshCw aria-hidden="true" size={16} /> : null}
            {isTagSuggestionLoading ? "查询中" : "添加"}
          </button>
        </form>
        <button
          className={`secondary-button auto-tag-button${isAutoTagLoading ? " loading" : ""}`}
          type="button"
          onClick={onGenerateAutoTags}
          disabled={!hasCurrentVideo || isAutoTagLoading}
          title={isAiConfigured ? "AI 自动标签" : "需要先配置大模型 API"}
        >
          {isAutoTagLoading ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          {isAutoTagLoading ? "生成中" : "AI 自动标签"}
        </button>

        {isAutoTagLoading ? <div className="ai-empty-state">正在基于视频元信息和 DuckDuckGo 搜索结果生成建议标签。</div> : null}

        {autoTagSuggestions.length ? (
          <div className="auto-tag-suggestion-list" aria-label="建议标签">
            {autoTagSuggestions.map((tag) => {
              const isSelected = selectedAutoTags.has(tag);
              return (
                <button
                  className={`tag-editor-chip auto-tag-chip${isSelected ? " selected" : ""}`}
                  key={tag}
                  type="button"
                  onClick={() => onToggleAutoTag(tag)}
                  aria-pressed={isSelected}
                >
                  <span>{tag}</span>
                  {isSelected ? <CheckCircle2 size={14} /> : null}
                </button>
              );
            })}
            <button className="primary-button" type="button" onClick={onConfirmAutoTags}>
              确认写入
            </button>
          </div>
        ) : null}

        {autoTagSummary ? (
          <div className="tag-merge-prompt auto-tag-summary">
            <strong>生成依据</strong>
            <p>{autoTagSummary}</p>
          </div>
        ) : null}

        {autoTagSources.length ? (
          <div className="auto-tag-sources">
            <strong>搜索来源</strong>
            {autoTagSources.map((source) => (
              <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                <span>{source.title}</span>
              </a>
            ))}
          </div>
        ) : null}

        {autoTagMessage ? <div className="ai-empty-state">{autoTagMessage}</div> : null}

        {tagMergePrompt ? (
          <div className="tag-merge-prompt">
            <strong>发现相近标签</strong>
            <p>
              “{tagMergePrompt.suggestion.newTag}” 和已有标签 “{tagMergePrompt.suggestion.existingTag}” 可能是
              {tagMergePrompt.suggestion.reason}。
            </p>
            <div className="dialog-actions compact">
              <button className="primary-button" type="button" onClick={onApplyTagMergeSuggestion}>
                采用已有标签
              </button>
              <button className="secondary-button" type="button" onClick={onKeepTagMergeSuggestion}>
                保留新标签
              </button>
              <button className="secondary-button" type="button" onClick={onCancelTagMergeSuggestion}>
                取消
              </button>
            </div>
          </div>
        ) : null}

        {tagMessage ? <div className="ai-empty-state">{tagMessage}</div> : null}
      </section>
    </div>
  );
}
