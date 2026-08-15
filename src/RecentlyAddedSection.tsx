import { HomeCardThumbnail } from "./HomeVideoCards";
import { RatingChip, TagChips } from "./MetadataChips";
import type { HomeVideoCard, VideoItem } from "./playerTypes";

type RecentlyAddedSectionProps = {
  cards: HomeVideoCard[];
  formatFileSize: (bytes: number) => string;
  formatRelativeTime: (value: number) => string;
  onOpenVideo: (video: VideoItem) => void;
  onThumbnailError: (videoId: string) => void;
};

// 探索概览的"最近入库"：按文件时间倒序展示最新进入片库的影片，
// 让用户一进入概览就能发现新内容。无卡片时不渲染整块。
export function RecentlyAddedSection({
  cards,
  formatFileSize,
  formatRelativeTime,
  onOpenVideo,
  onThumbnailError,
}: RecentlyAddedSectionProps) {
  if (!cards.length) return null;

  const unwatchedCount = cards.filter((card) => !card.progress).length;
  const latestLabel = formatRelativeTime(cards[0].video.lastModified);

  return (
    <section className="recently-added-section explore-ledger-section" aria-labelledby="recently-added-title">
      <header className="explore-section-heading">
        <div>
          <span className="explore-section-eyebrow">New arrivals</span>
          <h2 id="recently-added-title">最近入库</h2>
          <p>按文件时间排列最新进入片库的影片，第一时间发现新增内容。</p>
        </div>
        <span className="special-insight-subtle">展示最近 {cards.length} 部</span>
      </header>

      <dl className="recently-added-summary" aria-label="最近入库统计">
        <div><dt>本期新增</dt><dd>{cards.length} 部</dd></div>
        <div><dt>尚未观看</dt><dd>{unwatchedCount} 部</dd></div>
        <div><dt>最新入库</dt><dd>{latestLabel}</dd></div>
      </dl>

      <div className="recently-added-list">
        {cards.map((card, index) => {
          const metaParts = [
            formatRelativeTime(card.video.lastModified),
            formatFileSize(card.video.size),
          ];
          if (card.progress?.completed) metaParts.push("已看完");
          return (
            <button
              className="recently-added-row"
              key={card.video.id}
              type="button"
              onClick={() => onOpenVideo(card.video)}
              title={card.video.relativePath || card.video.name}
            >
              <HomeCardThumbnail card={card} fallbackIndex={index} onThumbnailError={onThumbnailError} />
              <span className="recently-added-copy">
                <strong>{card.video.name}</strong>
                <small>{metaParts.join(" · ")}</small>
                <TagChips tags={card.tags ?? []} actorTags={card.actorTags} systemTags={card.systemTags} limit={8} compact />
                <RatingChip rating={card.rating} comment={card.ratingComment} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
