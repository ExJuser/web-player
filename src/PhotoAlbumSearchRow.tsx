import { Images, Search, X } from "lucide-react";
import { useState } from "react";

import type { PhotoAlbum } from "./playerTypes";

export type PhotoAlbumSearchResult = {
  album: PhotoAlbum;
  coverImageUrl: string;
  tags: string[];
};

type PhotoAlbumSearchRowProps = {
  query: string;
  resultCount: number;
  results: PhotoAlbumSearchResult[];
  onChange: (query: string) => void;
  onClear: () => void;
  onSelect: (album: PhotoAlbum) => void;
};

export function PhotoAlbumSearchRow({ query, resultCount, results, onChange, onClear, onSelect }: PhotoAlbumSearchRowProps) {
  const [isFocused, setIsFocused] = useState(false);
  const hasQuery = Boolean(query.trim());
  return (
    <form
      className="photo-search-row"
      role="search"
      aria-label="搜索图集"
      onFocus={() => setIsFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false); }}
      onSubmit={(event) => { event.preventDefault(); }}
    >
      <Search size={17} />
      <input type="search" value={query} placeholder="搜索图集、路径或标签" onChange={(event) => onChange(event.target.value)} aria-controls="photo-search-results" aria-expanded={isFocused && hasQuery} />
      {hasQuery ? <div className="photo-search-actions"><span>{resultCount}</span><button className="icon-button" type="button" onClick={onClear} aria-label="清空看图搜索" title="清空搜索"><X size={16} /></button></div> : null}
      {isFocused && hasQuery ? (
        <div className="photo-search-results custom-scrollbar" id="photo-search-results" role="listbox" aria-label="图集搜索结果">
          {results.length ? results.map(({ album, coverImageUrl, tags }) => (
            <button className="photo-search-result" key={album.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(album)}>
              <span className={`photo-search-thumbnail${coverImageUrl ? " has-image" : ""}`} aria-hidden="true">{coverImageUrl ? <img src={coverImageUrl} alt="" decoding="async" loading="lazy" draggable={false} /> : <Images size={24} />}</span>
              <span className="photo-search-result-body">
                <strong>{album.title}</strong>
                <small>{album.mediaRootLabel} · {album.relativePath || "根目录"}</small>
                <span className="photo-search-result-tags">{tags.slice(0, 5).map((tag) => <i key={normalizeKey(tag)}>{tag}</i>)}</span>
                <small>{album.imageCount} 张图片</small>
              </span>
            </button>
          )) : <div className="home-top-search-status">没有找到匹配图集</div>}
        </div>
      ) : null}
    </form>
  );
}

function normalizeKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
