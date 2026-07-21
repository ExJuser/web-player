import { LoaderCircle, Search, X } from "lucide-react";
import { useRef } from "react";

type PlayerSearchInputProps = {
  isPending: boolean;
  query: string;
  resultCount: number;
  scopeCount: number;
  onChange: (query: string) => void;
  onClear: () => void;
  onSubmit: () => void;
};

export function PlayerSearchInput({
  isPending,
  query,
  resultCount,
  scopeCount,
  onChange,
  onClear,
  onSubmit,
}: PlayerSearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);
  const hasQuery = Boolean(query.trim());

  const clearSearch = () => {
    onClear();
    inputRef.current?.focus();
  };

  return (
    <section className="player-search" aria-label="播放器搜索">
      <form
        className={`player-search-form ${hasQuery ? "has-query" : ""}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasQuery && resultCount && !isPending && !isComposingRef.current) onSubmit();
        }}
      >
        <Search className="player-search-icon" size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.key !== "Escape") return;
            event.preventDefault();
            if (query) clearSearch();
            else event.currentTarget.blur();
          }}
          placeholder="搜索片名、演员、标签或路径"
          aria-label="播放器搜索"
          aria-controls="player-playlist-results"
          aria-busy={isPending}
        />
        {hasQuery ? (
          <span className="player-search-actions">
            {isPending ? (
              <LoaderCircle className="player-search-loading" size={15} aria-hidden="true" />
            ) : (
              <span
                className="player-search-count"
                role="status"
                aria-live="polite"
                aria-label={`找到 ${resultCount} 个结果，当前范围共 ${scopeCount} 个视频`}
                title={`找到 ${resultCount} 个结果，当前范围共 ${scopeCount} 个视频`}
              >
                {resultCount}
              </span>
            )}
            <button type="button" onClick={clearSearch} title="清空搜索" aria-label="清空搜索">
              <X size={15} />
            </button>
          </span>
        ) : null}
      </form>
    </section>
  );
}
