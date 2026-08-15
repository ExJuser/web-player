import { HomeCardThumbnail } from "./HomeVideoCards";
import type { HomeVideoCard, VideoItem } from "./playerTypes";

type HomeRecentAddsCardProps = {
  cards: HomeVideoCard[];
  formatRelativeTime: (value: number) => string;
  onOpenVideo: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
};

// 首页侧边条“最近添加”迷你卡：按文件时间展示最新进入当前媒体模式的影片，
// 单行紧凑布局（缩略图 + 标题 + 相对时间），点击直达播放。无卡片时不渲染整块。
export function HomeRecentAddsCard({
  cards,
  formatRelativeTime,
  onOpenVideo,
  onThumbnailError,
}: HomeRecentAddsCardProps) {
  if (!cards.length) return null;

  return (
    <section className="home-section home-recent-adds-card">
      <div className="home-section-header">
        <h2>最近添加</h2>
        <span>{cards.length} 部</span>
      </div>
      <div className="home-recent-adds-list" role="list" aria-label="最近添加影片">
        {cards.map((card, index) => (
          <button
            className="home-recent-adds-row"
            key={card.video.id}
            role="listitem"
            type="button"
            onClick={() => onOpenVideo(card.video)}
            title={card.video.relativePath || card.video.name}
          >
            <HomeCardThumbnail card={card} fallbackIndex={index} onThumbnailError={onThumbnailError} />
            <span className="home-recent-adds-copy">
              <strong>{card.video.name}</strong>
              <small>{formatRelativeTime(card.video.lastModified)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
