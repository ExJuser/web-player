import { ChevronDown, RefreshCw, RotateCcw, Tags, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type Ref } from "react";

import type { ActorProfileStore, ActorSource } from "./playerTypes";
import { normalizeTagKey, type TagInputSuggestion, type TagMergeSuggestion } from "./tagUtils";

type DialogOffset = {
  x: number;
  y: number;
};

export type TagDialogMergePrompt = {
  pendingTags: string[];
  suggestion: TagMergeSuggestion;
};

const COMMON_TAG_LIMIT = 20;
type TagView = "recent" | "common" | "all";

type TagDialogProps = {
  isOpen: boolean;
  dialogRef: Ref<HTMLElement>;
  isDragging: boolean;
  offset: DialogOffset;
  currentVideoId: string;
  currentVideoName: string;
  currentVideoTags: string[];
  systemTags: string[];
  commonTags: Array<{ label: string; count: number }>;
  allTags: Array<{ label: string; count: number }>;
  recentTags: Array<{ label: string; count: number }>;
  actorProfiles: ActorProfileStore;
  currentActorIds: string[];
  currentActorSource: ActorSource | null;
  isCurrentActorListManual: boolean;
  isTagInputActor: boolean;
  tagInput: string;
  tagInputSuggestions: TagInputSuggestion[];
  tagQuery: string;
  resolvedActiveTagSuggestionIndex: number;
  activeTagSuggestionId?: string;
  isTagSuggestionLoading: boolean;
  tagMergePrompt: TagDialogMergePrompt | null;
  tagMessage: string;
  hasCurrentVideo: boolean;
  onClose: () => void;
  onRemoveTag: (tag: string) => void;
  onQuickAddTag: (tag: string) => void;
  onSaveActors: (actorIds: string[], newActorName?: string) => void;
  onRestoreAutomaticActors: () => void;
  onSubmitTagInput: () => void;
  onTagInputChange: (value: string) => void;
  onTagInputActorChange: (value: boolean) => void;
  onActiveTagSuggestionIndexChange: (updater: (index: number) => number) => void;
  onSelectTagSuggestion: (tag: string) => void;
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
  systemTags,
  commonTags,
  allTags,
  recentTags,
  actorProfiles,
  currentActorIds,
  currentActorSource,
  isCurrentActorListManual,
  isTagInputActor,
  tagInput,
  tagInputSuggestions,
  tagQuery,
  resolvedActiveTagSuggestionIndex,
  activeTagSuggestionId,
  isTagSuggestionLoading,
  tagMergePrompt,
  tagMessage,
  hasCurrentVideo,
  onClose,
  onRemoveTag,
  onQuickAddTag,
  onSaveActors,
  onRestoreAutomaticActors,
  onSubmitTagInput,
  onTagInputChange,
  onTagInputActorChange,
  onActiveTagSuggestionIndexChange,
  onSelectTagSuggestion,
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
  const [tagView, setTagView] = useState<TagView>("common");
  const currentActorIdsKey = currentActorIds.join("\u0000");
  useEffect(() => {
    setSelectedActorIds(new Set(currentActorIdsKey ? currentActorIdsKey.split("\u0000") : []));
    setActorQuery("");
  }, [currentActorIdsKey, currentVideoId]);
  useEffect(() => {
    if (isOpen) setTagView(recentTags.length ? "recent" : "common");
  }, [currentVideoId, isOpen]);
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
  const matchingSelectedActorCount = matchingActors.length - filteredOtherActors.length;
  const newActorNameToSave = normalizedActorQuery && !matchingActors.length ? actorQuery.trim() : undefined;
  const visibleTagOptions = tagView === "recent"
    ? recentTags
    : tagView === "all"
      ? allTags
      : commonTags.slice(0, COMMON_TAG_LIMIT);
  const normalizedTagQuery = normalizeTagKey(tagQuery);
  const hasExactTagSuggestion = currentVideoTags.some((tag) => normalizeTagKey(tag) === normalizedTagQuery)
    || tagInputSuggestions.some((tag) => tag.key === normalizedTagQuery);
  const systemTagKeys = new Set(systemTags.map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()));
  const visibleCurrentVideoTags = currentVideoTags.filter(
    (tag) => !systemTagKeys.has(tag.normalize("NFKC").trim().toLocaleLowerCase()),
  );
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
          {systemTags.map((tag) => (
            <div className="tag-editor-chip current-tag-chip system" key={`system:${tag}`}>
              <span>{tag}</span>
              <small>系统</small>
            </div>
          ))}
          {visibleCurrentVideoTags.map((tag) => (
              <div className="tag-editor-chip current-tag-chip" key={tag}>
                <span>{tag}</span>
                <button className="tag-chip-remove" type="button" title="移除标签" aria-label={`移除标签${tag}`} onClick={() => onRemoveTag(tag)}><X size={13} /></button>
              </div>
            ))}
          {!systemTags.length && !visibleCurrentVideoTags.length ? (
            <div className="ai-empty-state">当前视频还没有标签。</div>
          ) : null}
        </div>

        <details className="tag-actor-editor">
          <summary className="tag-actor-editor-heading">
            <strong id="tag-actor-editor-title">影片演员（{selectedActors.length}）</strong>
            <span>当前来源：{actorSourceLabel}<ChevronDown className="tag-actor-editor-chevron" size={16} /></span>
          </summary>
          <div className="actor-selected-list custom-scrollbar">
            {selectedActors.length ? selectedActors.map((actor) => (
              <label key={actor.id}>
                <input type="checkbox" checked onChange={() => toggleActor(actor.id)} />
                <span>{actor.name}</span>
              </label>
            )) : <div className="actor-selected-empty">暂未选择演员</div>}
          </div>
          <label className="actor-new-field tag-actor-search">
            <input value={actorQuery} maxLength={120} placeholder="筛选现有演员，或输入新姓名" onChange={(event) => setActorQuery(event.target.value)} disabled={!hasCurrentVideo} />
          </label>
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
        </details>

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
                  onSelectTagSuggestion(
                    (tagInputSuggestions[resolvedActiveTagSuggestionIndex] ?? tagInputSuggestions[0]).label,
                  );
                  return;
                }
                if (event.key === "Escape") {
                  if (tagInput) {
                    event.preventDefault();
                    onTagInputChange("");
                  } else {
                    onClose();
                  }
                }
              }}
              disabled={!hasCurrentVideo}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(tagQuery)}
              aria-controls={tagQuery ? "tag-input-suggestions" : undefined}
              aria-activedescendant={activeTagSuggestionId}
            />
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
        {tagQuery ? (
          <section className="tag-search-results" aria-labelledby="tag-search-results-title">
            <strong id="tag-search-results-title">搜索结果</strong>
            <div className="tag-input-suggestions custom-scrollbar" id="tag-input-suggestions" role="listbox" aria-label="已有标签候选">
              {tagInputSuggestions.map((tag, index) => (
                <button
                  className={index === resolvedActiveTagSuggestionIndex ? "active" : ""}
                  id={`tag-input-suggestion-${index}`}
                  key={tag.key}
                  type="button"
                  role="option"
                  aria-selected={index === resolvedActiveTagSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => onActiveTagSuggestionIndexChange(() => index)}
                  onClick={() => onSelectTagSuggestion(tag.label)}
                >
                  <span>{tag.label}</span>
                  <small>{tag.count} 部</small>
                </button>
              ))}
              {!hasExactTagSuggestion ? (
                <button
                  className="tag-create-option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onSubmitTagInput}
                >
                  <span>新建标签“{tagQuery}”</span>
                </button>
              ) : null}
            </div>
          </section>
        ) : recentTags.length || commonTags.length ? (
          <section
            aria-label={tagView === "recent" ? "最近使用标签" : tagView === "all" ? "全部标签" : "常用标签"}
            className="common-tag-picker"
          >
            <div className="tag-view-tabs" role="tablist" aria-label="标签列表">
              {([
                ["recent", "最近"],
                ["common", "常用"],
                ["all", "全部"],
              ] as const).map(([view, label]) => (
                <button
                  aria-selected={tagView === view}
                  className={tagView === view ? "active" : ""}
                  key={view}
                  role="tab"
                  type="button"
                  onClick={() => setTagView(view)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={`common-tag-list custom-scrollbar${tagView === "all" ? " expanded" : ""}`}>
              {visibleTagOptions.map((tag) => (
                <button
                  className="tag-editor-chip"
                  key={normalizeTagKey(tag.label)}
                  type="button"
                  disabled={!hasCurrentVideo || isTagSuggestionLoading}
                  title={`${tag.label}：关联 ${tag.count} 部影片`}
                  onClick={() => onQuickAddTag(tag.label)}
                >
                  <span>{tag.label}</span>
                  <small>{tag.count ? `${tag.count} 部` : "最近使用"}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <label className="tag-actor-toggle">
          <input type="checkbox" checked={isTagInputActor} onChange={(event) => onTagInputActorChange(event.target.checked)} />
          <span aria-hidden="true" className="tag-actor-toggle-box" />
          <span>本次添加的标签是演员人名</span>
        </label>
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
