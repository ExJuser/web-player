type HomeTagStat = {
  key: string;
  label: string;
  videoCount: number;
};

type HomeTagStatsProps = {
  coverage: number;
  taggedVideos: number;
  tags: HomeTagStat[];
  totalTags: number;
};

export function HomeTagStats({ coverage, taggedVideos, tags, totalTags }: HomeTagStatsProps) {
  const maxVideoCount = tags[0]?.videoCount ?? 0;

  return (
    <section className="home-section home-tag-stats-card">
      <div className="home-section-header">
        <h2>标签统计</h2>
        <span>{totalTags} 个标签</span>
      </div>
      <div className="home-tag-stats-summary" aria-label="标签使用概况">
        <div>
          <strong>{taggedVideos}</strong>
          <span>已标注视频</span>
        </div>
        <div>
          <strong>{Math.round(coverage * 100)}%</strong>
          <span>标签覆盖率</span>
        </div>
      </div>
      {tags.length ? (
        <div className="home-tag-ranking" role="list" aria-label="常用标签">
          {tags.map((tag) => (
            <div className="home-tag-ranking-row" key={tag.key} role="listitem">
              <span className="home-tag-ranking-label" title={tag.label}>{tag.label}</span>
              <span className="home-tag-ranking-meter" aria-hidden="true">
                <span style={{ width: `${(tag.videoCount / maxVideoCount) * 100}%` }} />
              </span>
              <strong>{tag.videoCount}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-tag-stats-empty">当前模式暂无标签</div>
      )}
    </section>
  );
}
