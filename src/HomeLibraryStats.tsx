type HomeLibraryStatsProps = {
  stats: {
    completed: number;
    favorites: number;
    total: number;
    unfinished: number;
  };
};

export function HomeLibraryStats({ stats }: HomeLibraryStatsProps) {
  return (
    <section className="home-stats">
      <div>
        <strong>{stats.total}</strong>
        <span>视频</span>
      </div>
      <div>
        <strong>{stats.unfinished}</strong>
        <span>未看完</span>
      </div>
      <div>
        <strong>{stats.completed}</strong>
        <span>已看完</span>
      </div>
      <div>
        <strong>{stats.favorites}</strong>
        <span>收藏</span>
      </div>
    </section>
  );
}
