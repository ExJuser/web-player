type PhotoTagStat = { key: string; label: string; albumCount: number };

type PhotoTagStatsProps = {
  coverage: number;
  taggedAlbums: number;
  tags: PhotoTagStat[];
  totalTags: number;
  selectedTagKey: string | null;
  onSelectTag: (key: string | null) => void;
};

export function PhotoTagStats({ coverage, taggedAlbums, tags, totalTags, selectedTagKey, onSelectTag }: PhotoTagStatsProps) {
  return (
    <section className="photo-tag-stats home-section">
      <div className="home-section-header"><h2>标签统计</h2><span>{totalTags} 个标签 · {taggedAlbums} 本已标注 · {Math.round(coverage * 100)}% 覆盖率</span></div>
      {tags.length ? (
        <div className="photo-tag-ranking custom-scrollbar" aria-label="常用图集标签">
          {tags.map((tag) => {
            const isActive = selectedTagKey === tag.key;
            return <button className={isActive ? "active" : ""} key={tag.key} type="button" aria-pressed={isActive} title={isActive ? `取消筛选“${tag.label}”` : `筛选标签“${tag.label}”`} onClick={() => onSelectTag(isActive ? null : tag.key)}><span>{tag.label}</span><small>{tag.albumCount} 本</small></button>;
          })}
        </div>
      ) : <div className="home-tag-stats-empty">当前看图目录暂无标签</div>}
    </section>
  );
}
