import { CheckCircle2, ExternalLink, RefreshCw, RotateCcw, Sparkles, Tags, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import type { ActorProfileStore, ActorSource } from "./playerTypes";
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
  currentVideoId: string;
  currentVideoName: string;
  currentVideoTags: string[];
  actorProfiles: ActorProfileStore;
  currentActorIds: string[];
  currentActorSource: ActorSource | null;
  isCurrentActorListManual: boolean;
  isTagInputActor: boolean;
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
  onSaveActors: (actorIds: string[], newActorName?: string) => void;
  onRestoreAutomaticActors: () => void;
  onSubmitTagInput: () => void;
  onTagInputChange: (value: string) => void;
  onTagInputActorChange: (value: boolean) => void;
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
  currentVideoId,
  currentVideoName,
  currentVideoTags,
  actorProfiles,
  currentActorIds,
  currentActorSource,
  isCurrentActorListManual,
  isTagInputActor,
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
  onSaveActors,
  onRestoreAutomaticActors,
  onSubmitTagInput,
  onTagInputChange,
  onTagInputActorChange,
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
  const [selectedActorIds, setSelectedActorIds] = useState<Set<string>>(() => new Set(currentActorIds));
  const [actorQuery, setActorQuery] = useState("");
  const currentActorIdsKey = currentActorIds.join("\u0000");
  useEffect(() => {
    setSelectedActorIds(new Set(currentActorIdsKey ? currentActorIdsKey.split("\u0000") : []));
    setActorQuery("");
  }, [currentActorIdsKey, currentVideoId]);
  const actors = useMemo(
    () => Object.values(actorProfiles).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
    [actorProfiles],
  );
  const selectedActors = actors.filter((actor) => selectedActorIds.has(actor.id));
  const normalizedActorQuery = actorQuery.normalize("NFKC").trim().toLocaleLowerCase();
  const matchingActors = normalizedActorQuery
    ? actors.filter((actor) => [actor.name, ...actor.aliases.map((alias) => alias.label)].some((name) => name.normalize("NFKC").toLocaleLowerCase().includes(normalizedActorQuery)))
    : actors;
  const filteredOtherActors = matchingActors.filter((actor) => !selectedActorIds.has(actor.id));
  const otherActorCount = actors.length - selectedActors.length;
  const matchingSelectedActorCount = matchingActors.length - filteredOtherActors.length;
  const newActorNameToSave = normalizedActorQuery && !matchingActors.length ? actorQuery.trim() : undefined;
  const toggleActor = (actorId: string) => setSelectedActorIds((current) => {
    const next = new Set(current);
    if (next.has(actorId)) next.delete(actorId); else next.add(actorId);
    return next;
  });
  const actorSourceLabel = currentActorSource === "manual" ? "人工" : currentActorSource === "nfo" ? "NFO" : currentActorSource === "tag" ? "演员标签" : "未识别";
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
              <div className="tag-editor-chip current-tag-chip" key={tag}>
                <span>{tag}</span>
                <button className="tag-chip-remove" type="button" title="移除标签" aria-label={`移除标签${tag}`} onClick={() => onRemoveTag(tag)}><X size={13} /></button>
              </div>
            ))
          ) : (
            <div className="ai-empty-state">当前视频还没有标签。</div>
          )}
        </div>

        <section className="tag-actor-editor" aria-labelledby="tag-actor-editor-title">
          <div className="tag-actor-editor-heading">
            <strong id="tag-actor-editor-title">影片演员（{selectedActors.length}）</strong>
            <span>当前来源：{actorSourceLabel}</span>
          </div>
          <div className="actor-selected-list custom-scrollbar">
            {selectedActors.length ? selectedActors.map((actor) => (
              <label key={actor.id}>
                <input type="checkbox" checked onChange={() => toggleActor(actor.id)} />
                <span>{actor.name}</span>
              </label>
            )) : <div className="actor-selected-empty">暂未选择演员</div>}
          </div>
          <label className="actor-new-field tag-actor-search">
            <span>搜索或新增演员</span>
            <input value={actorQuery} maxLength={120} placeholder="筛选现有演员，或输入新姓名" onChange={(event) => setActorQuery(event.target.value)} disabled={!hasCurrentVideo} />
          </label>
          <strong className="actor-edit-section-title">{normalizedActorQuery ? `筛选结果（${filteredOtherActors.length} / ${otherActorCount}）` : `其他演员（${otherActorCount}）`}</strong>
          <div className="actor-checkbox-list tag-actor-checkbox-list custom-scrollbar">
            {filteredOtherActors.map((actor) => (
              <label key={actor.id}>
                <input type="checkbox" checked={selectedActorIds.has(actor.id)} onChange={() => toggleActor(actor.id)} />
                <span>{actor.name}</span>
              </label>
            ))}
            {!filteredOtherActors.length ? <div className="ai-empty-state">{normalizedActorQuery ? matchingSelectedActorCount ? "匹配演员已在“已选演员”中。" : "没有匹配演员，保存时将新增该演员。" : actors.length ? "没有其他演员。" : "尚无演员，可在上方新增。"}</div> : null}
          </div>
          <div className="dialog-actions compact tag-actor-actions">
            <button className="primary-button" type="button" disabled={!hasCurrentVideo} onClick={() => onSaveActors(Array.from(selectedActorIds), newActorNameToSave)}>
              <UserPlus size={16} /> 保存人工名单
            </button>
            {isCurrentActorListManual ? (
              <button className="secondary-button" type="button" onClick={onRestoreAutomaticActors}>
                <RotateCcw size={16} /> 恢复自动识别
              </button>
            ) : null}
          </div>
        </section>

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
        <label className="tag-actor-toggle">
          <input type="checkbox" checked={isTagInputActor} onChange={(event) => onTagInputActorChange(event.target.checked)} />
          <span>本次添加的标签是演员人名</span>
        </label>
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
