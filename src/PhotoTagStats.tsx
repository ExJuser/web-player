type PhotoTagStat = { key: string; label: string; albumCount: number };

type PhotoTagStatsProps = {
  coverage: number;
  taggedAlbums: number;
  tags: PhotoTagStat[];
  totalTags: number;
  onSelectTag: (label: string) => void;
};

export function PhotoTagStats({ coverage, taggedAlbums, tags, totalTags, onSelectTag }: PhotoTagStatsProps) {
  return (
    <section className="photo-tag-stats home-section">
      <div className="home-section-header"><h2>标签统计</h2><span>{totalTags} 个标签 · {taggedAlbums} 本已标注 · {Math.round(coverage * 100)}% 覆盖率</span></div>
      {tags.length ? (
        <div className="photo-tag-ranking custom-scrollbar" aria-label="常用图集标签">
          {tags.map((tag) => <button key={tag.key} type="button" title={`筛选标签“${tag.label}”`} onClick={() => onSelectTag(tag.label)}><span>{tag.label}</span><small>{tag.albumCount} 本</small></button>)}
        </div>
      ) : <div className="home-tag-stats-empty">当前看图目录暂无标签</div>}
    </section>
  );
}
