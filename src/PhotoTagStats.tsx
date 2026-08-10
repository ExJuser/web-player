import { ChevronDown, Tags, X } from "lucide-react";

type PhotoTagStat = { key: string; label: string; albumCount: number };

type PhotoTagStatsProps = {
  coverage: number;
  taggedAlbums: number;
  tags: PhotoTagStat[];
  totalTags: number;
  selectedTagKey: string | null;
  isOpen: boolean;
  onSelectTag: (key: string | null) => void;
  onToggle: () => void;
};

export function PhotoTagStats({ coverage, taggedAlbums, tags, totalTags, selectedTagKey, isOpen, onSelectTag, onToggle }: PhotoTagStatsProps) {
  const selectedTag = tags.find((tag) => tag.key === selectedTagKey);

  return (
    <section className={`photo-tag-stats photo-utility-panel${isOpen ? " is-open" : ""}`}>
      <button className="photo-utility-toggle" type="button" aria-expanded={isOpen} aria-controls="photo-tag-panel" onClick={onToggle}>
        <span className="photo-utility-toggle-icon"><Tags size={16} /></span>
        <span className="photo-utility-toggle-copy"><strong>标签索引</strong><small>{totalTags} 个标签 · {Math.round(coverage * 100)}% 覆盖</small></span>
        {selectedTagKey ? <span className="photo-utility-active-filter">{selectedTag?.label ?? "已筛选"}</span> : null}
        <ChevronDown className="photo-utility-chevron" size={16} />
      </button>
      {isOpen ? (
        <div className="photo-utility-popover" id="photo-tag-panel">
          <div className="photo-utility-popover-header">
            <div><strong>按标签筛选</strong><span>{taggedAlbums} 本已标注，共 {totalTags} 个标签</span></div>
            {selectedTagKey ? <button className="secondary-button" type="button" onClick={() => onSelectTag(null)}><X size={15} /> 清除筛选</button> : null}
          </div>
          {tags.length ? (
            <div className="photo-tag-ranking custom-scrollbar" aria-label="常用图集标签">
              {tags.map((tag) => {
                const isActive = selectedTagKey === tag.key;
                return <button className={isActive ? "active" : ""} key={tag.key} type="button" aria-pressed={isActive} title={isActive ? `取消筛选“${tag.label}”` : `筛选标签“${tag.label}”`} onClick={() => onSelectTag(isActive ? null : tag.key)}><span>{tag.label}</span><small>{tag.albumCount} 本</small></button>;
              })}
            </div>
          ) : <div className="home-tag-stats-empty">当前看图目录暂无标签；为图集添加标签后可在这里快速筛选。</div>}
        </div>
      ) : null}
    </section>
  );
}
