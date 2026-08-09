import { RefreshCw, Tags, X } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { TagMergePrompt } from "./appTypes";
import type { PhotoAlbum } from "./playerTypes";
import { normalizeTagKey } from "./tagUtils";

type TagOption = { key?: string; label: string; count: number };

type PhotoAlbumTagDialogProps = {
  activeSuggestionIndex: number;
  album: PhotoAlbum | null;
  allTags: TagOption[];
  commonTags: TagOption[];
  isSuggestionLoading: boolean;
  mergePrompt: TagMergePrompt | null;
  tags: string[];
  tagInput: string;
  tagInputSuggestions: TagOption[];
  recentTags: TagOption[];
  message: string;
  onActiveSuggestionIndexChange: Dispatch<SetStateAction<number>>;
  onApplyMergeSuggestion: () => void;
  onCancelMergeSuggestion: () => void;
  onClose: () => void;
  onAddTags: () => void;
  onKeepMergeSuggestion: () => void;
  onRemoveTag: (tag: string) => void;
  onSelectSuggestion: (tag: string) => void;
  onTagInputChange: (value: string) => void;
};

export function PhotoAlbumTagDialog({
  activeSuggestionIndex,
  album,
  allTags,
  commonTags,
  isSuggestionLoading,
  mergePrompt,
  tags,
  tagInput,
  tagInputSuggestions,
  recentTags,
  message,
  onActiveSuggestionIndexChange,
  onApplyMergeSuggestion,
  onCancelMergeSuggestion,
  onClose,
  onAddTags,
  onKeepMergeSuggestion,
  onRemoveTag,
  onSelectSuggestion,
  onTagInputChange,
}: PhotoAlbumTagDialogProps) {
  const [tagView, setTagView] = useState<"recent" | "common" | "all">("common");
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const query = tagInput.trim().split(/[\s,，、;；|]+/u).at(-1) ?? "";
  const normalizedQuery = normalizeTagKey(query);
  const hasExactSuggestion = tags.some((tag) => normalizeTagKey(tag) === normalizedQuery)
    || tagInputSuggestions.some((tag) => tag.key === normalizedQuery);
  const shouldOfferCreate = Boolean(normalizedQuery && !hasExactSuggestion);
  const optionCount = tagInputSuggestions.length + (shouldOfferCreate ? 1 : 0);
  const visibleTags = tagView === "recent" ? recentTags : tagView === "all" ? allTags : commonTags.slice(0, 20);

  useEffect(() => {
    suggestionsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionIndex]);

  if (!album) return null;

  const submitActiveOption = () => {
    const suggestion = tagInputSuggestions[activeSuggestionIndex];
    if (suggestion) onSelectSuggestion(suggestion.label); else if (shouldOfferCreate) onAddTags();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-labelledby="photo-album-tag-dialog-title" aria-modal="true" className="tag-dialog photo-album-tag-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <button aria-label="关闭" className="dialog-close" type="button" onClick={onClose}><X size={18} /></button>
        <div className="tag-dialog-header auto-tag-dialog-header">
          <div className="dialog-icon"><Tags size={28} /></div>
          <div className="dialog-copy"><h2 id="photo-album-tag-dialog-title">图集标签</h2><p>{album.title}</p></div>
        </div>

        <div className="tag-editor-current">
          {tags.length ? tags.map((tag) => (
            <div className="tag-editor-chip current-tag-chip" key={tag}>
              <span>{tag}</span>
              <button className="tag-chip-remove" type="button" title="移除标签" aria-label={`移除标签${tag}`} onClick={() => onRemoveTag(tag)}><X size={13} /></button>
            </div>
          )) : <div className="ai-empty-state">当前图集还没有标签。</div>}
        </div>

        <form className="tag-editor-form" onSubmit={(event) => { event.preventDefault(); optionCount ? submitActiveOption() : onAddTags(); }}>
          <div className="tag-editor-field">
            <input
              autoFocus
              value={tagInput}
              placeholder="输入标签，可用空格、逗号、顿号分隔"
              onChange={(event) => onTagInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (optionCount && event.key === "ArrowDown") { event.preventDefault(); onActiveSuggestionIndexChange((index) => (index + 1) % optionCount); return; }
                if (optionCount && event.key === "ArrowUp") { event.preventDefault(); onActiveSuggestionIndexChange((index) => (index - 1 + optionCount) % optionCount); return; }
                if (optionCount && event.key === "Enter") { event.preventDefault(); submitActiveOption(); return; }
                if (event.key === "Escape") { if (tagInput) { event.preventDefault(); onTagInputChange(""); } else onClose(); }
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(query)}
              aria-controls={query ? "photo-tag-input-suggestions" : undefined}
              aria-activedescendant={optionCount ? `photo-tag-input-suggestion-${activeSuggestionIndex}` : undefined}
            />
          </div>
          <button className={`primary-button tag-query-button${isSuggestionLoading ? " loading" : ""}`} type="submit" disabled={!tagInput.trim() || isSuggestionLoading}>
            {isSuggestionLoading ? <RefreshCw aria-hidden="true" size={16} /> : null}
            {isSuggestionLoading ? "查询中" : "添加"}
          </button>
        </form>

        {query ? (
          <section className="tag-search-results" aria-labelledby="photo-tag-search-results-title">
            <strong id="photo-tag-search-results-title">搜索结果</strong>
            <div ref={suggestionsRef} className="tag-input-suggestions custom-scrollbar" id="photo-tag-input-suggestions" role="listbox" aria-label="图集标签候选">
              {tagInputSuggestions.map((suggestion, index) => (
                <button className={index === activeSuggestionIndex ? "active" : ""} id={`photo-tag-input-suggestion-${index}`} key={suggestion.key ?? suggestion.label} type="button" role="option" aria-selected={index === activeSuggestionIndex} onMouseEnter={() => onActiveSuggestionIndexChange(() => index)} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelectSuggestion(suggestion.label)}>
                  <span>{suggestion.label}</span><small>{suggestion.count} 本</small>
                </button>
              ))}
              {shouldOfferCreate ? (
                <button className={`tag-create-option${activeSuggestionIndex === tagInputSuggestions.length ? " active" : ""}`} id={`photo-tag-input-suggestion-${tagInputSuggestions.length}`} type="button" role="option" aria-selected={activeSuggestionIndex === tagInputSuggestions.length} onMouseEnter={() => onActiveSuggestionIndexChange(() => tagInputSuggestions.length)} onMouseDown={(event) => event.preventDefault()} onClick={onAddTags}>
                  <span>新建标签“{query}”</span>
                </button>
              ) : null}
            </div>
          </section>
        ) : visibleTags.length ? (
          <section className="common-tag-picker" aria-label={tagView === "recent" ? "最近使用标签" : tagView === "all" ? "全部标签" : "常用标签"}>
            <div className="tag-view-tabs" role="tablist" aria-label="标签列表">
              {([['recent', '最近'], ['common', '常用'], ['all', '全部']] as const).map(([view, label]) => (
                <button aria-selected={tagView === view} className={tagView === view ? "active" : ""} key={view} role="tab" type="button" onClick={() => setTagView(view)}>{label}</button>
              ))}
            </div>
            <div className={`common-tag-list custom-scrollbar${tagView === "all" ? " expanded" : ""}`}>
              {visibleTags.map((tag) => (
                <button className="tag-editor-chip" key={normalizeTagKey(tag.label)} type="button" disabled={isSuggestionLoading} title={`${tag.label}：关联 ${tag.count} 本图集`} onClick={() => onSelectSuggestion(tag.label)}>
                  <span>{tag.label}</span><small>{tag.count ? `${tag.count} 本` : "最近使用"}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mergePrompt ? (
          <div className="tag-merge-prompt">
            <strong>发现相近标签</strong>
            <p>“{mergePrompt.suggestion.newTag}” 和已有标签 “{mergePrompt.suggestion.existingTag}” 可能是{mergePrompt.suggestion.reason}。</p>
            <div className="dialog-actions compact">
              <button className="primary-button" type="button" onClick={onApplyMergeSuggestion}>采用已有标签</button>
              <button className="secondary-button" type="button" onClick={onKeepMergeSuggestion}>保留新标签</button>
              <button className="secondary-button" type="button" onClick={onCancelMergeSuggestion}>取消</button>
            </div>
          </div>
        ) : null}
        {message ? <div className="ai-empty-state">{message}</div> : null}
      </section>
    </div>
  );
}
