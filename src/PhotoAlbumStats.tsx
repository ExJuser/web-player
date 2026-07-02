type PhotoAlbumStatsProps = {
  stats: {
    completed: number;
    favorites: number;
    images: number;
    total: number;
  };
};

export function PhotoAlbumStats({ stats }: PhotoAlbumStatsProps) {
  return (
    <section className="home-stats photo-stats">
      <div>
        <strong>{stats.total}</strong>
        <span>相册</span>
      </div>
      <div>
        <strong>{stats.images}</strong>
        <span>图片</span>
      </div>
      <div>
        <strong>{stats.completed}</strong>
        <span>已读完</span>
      </div>
      <div>
        <strong>{stats.favorites}</strong>
        <span>收藏</span>
      </div>
    </section>
  );
}
