import { Search, X } from "lucide-react";

type PhotoAlbumSearchRowProps = {
  query: string;
  onChange: (query: string) => void;
  onClear: () => void;
};

export function PhotoAlbumSearchRow({ query, onChange, onClear }: PhotoAlbumSearchRowProps) {
  return (
    <section className="photo-search-row" aria-label="搜索图集">
      <Search size={17} />
      <input
        type="search"
        value={query}
        placeholder="搜索图集、路径或标签"
        onChange={(event) => onChange(event.target.value)}
      />
      {query ? (
        <button
          className="icon-button"
          type="button"
          onClick={onClear}
          aria-label="清空看图搜索"
          title="清空搜索"
        >
          <X size={16} />
        </button>
      ) : null}
    </section>
  );
}
