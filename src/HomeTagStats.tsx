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
  onExploreTag: (tagKey: string) => void;
};

export function HomeTagStats({ coverage, taggedVideos, tags, totalTags, onExploreTag }: HomeTagStatsProps) {
  const maxVideoCount = tags[0]?.videoCount ?? 0;
  const coveragePercent = Math.round(coverage * 100);

  return (
    <section className="home-section home-tag-stats-card">
      <div className="home-section-header">
        <h2>标签统计</h2>
        <span>{totalTags} 个标签</span>
      </div>
      <div className="home-tag-stats-summary" aria-label="标签使用概况">
        <div>
          <span>已标注视频</span>
          <strong>{taggedVideos}<small>部</small></strong>
        </div>
        <div>
          <span>标签覆盖率</span>
          <strong>{coveragePercent}<small>%</small></strong>
        </div>
      </div>
      {tags.length ? (
        <>
          <div className="home-tag-ranking-header" aria-hidden="true">
            <span>常用标签排行</span>
            <span>覆盖视频 / 占比</span>
          </div>
          <div className="home-tag-ranking" role="list" aria-label="常用标签排行">
            {tags.map((tag, index) => {
              const taggedVideoPercent = taggedVideos
                ? Math.round((tag.videoCount / taggedVideos) * 100)
                : 0;
              const relativeWidth = maxVideoCount
                ? (tag.videoCount / maxVideoCount) * 100
                : 0;

              return (
                <button
                  className="home-tag-ranking-row"
                  key={tag.key}
                  role="listitem"
                  type="button"
                  onClick={() => onExploreTag(tag.key)}
                  aria-label={`${tag.label}，覆盖 ${tag.videoCount} 部视频，占已标注视频 ${taggedVideoPercent}%`}
                  title={`探索标签“${tag.label}”`}
                >
                  <span className="home-tag-ranking-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="home-tag-ranking-detail">
                    <div className="home-tag-ranking-copy">
                      <span className="home-tag-ranking-label" title={tag.label}>{tag.label}</span>
                      <span className="home-tag-ranking-value">
                        <strong>{tag.videoCount}</strong>
                        <small>部 · {taggedVideoPercent}%</small>
                      </span>
                    </div>
                    <span className="home-tag-ranking-meter" aria-hidden="true">
                      <span style={{ width: `${relativeWidth}%` }} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="home-tag-stats-empty">当前模式暂无标签</div>
      )}
    </section>
  );
}
