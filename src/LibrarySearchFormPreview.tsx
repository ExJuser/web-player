import { Search } from "lucide-react";
import type { FocusEvent, ReactNode } from "react";

type LibrarySearchFormPreviewProps = {
  ariaLabel: string;
  disabled: boolean;
  formClassName?: string;
  inputValue: string;
  placeholder: string;
  previewClassName?: string;
  previewHint: string;
  previewResultsClassName?: string;
  previewResults: ReactNode;
  showPreview: boolean;
  onBlur: (event: FocusEvent<HTMLDivElement>) => void;
  onFocus: (event: FocusEvent<HTMLDivElement>) => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
};

export function LibrarySearchFormPreview({
  ariaLabel,
  disabled,
  formClassName = "",
  inputValue,
  placeholder,
  previewClassName = "",
  previewHint,
  previewResultsClassName = "",
  previewResults,
  showPreview,
  onBlur,
  onFocus,
  onInputChange,
  onSubmit,
}: LibrarySearchFormPreviewProps) {
  return (
    <div className="library-search-popover-root" onFocus={onFocus} onBlur={onBlur}>
      <form
        className={`library-search-form ${formClassName}`.trim()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          type="search"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
        />
        <Search className="library-search-input-icon" size={17} aria-hidden="true" />
      </form>
      {showPreview ? (
        <div className={`library-search-preview ${previewClassName}`.trim()}>
          <div className="library-search-preview-header">
            <span>搜索预览</span>
            <small>{previewHint}</small>
          </div>
          {previewResults ? (
            <div className={`home-compact-list library-search-preview-results ${previewResultsClassName}`.trim()}>
              {previewResults}
            </div>
          ) : (
            <div className="empty-list compact">本地预览暂无命中</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
