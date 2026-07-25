import { useState, type ReactNode } from "react";

import type { HomeVideoCard } from "./playerTypes";

type HomeRecentSectionProps = {
  cards: HomeVideoCard[];
  previewCount: number;
  renderCard: (card: HomeVideoCard, index: number) => ReactNode;
};

export function HomeRecentSection({ cards, previewCount, renderCard }: HomeRecentSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!cards.length) return null;

  const visibleCards = isExpanded ? cards : cards.slice(0, previewCount);
  const hasMore = cards.length > previewCount;

  return (
    <section className="home-section home-recent-section">
      <div className="home-section-header">
        <h2>最近观看</h2>
        <span>{cards.length} 个记录</span>
      </div>
      <div className="home-list-grid">{visibleCards.map(renderCard)}</div>
      {hasMore ? (
        <button className="secondary-button favorite-home-more" type="button" onClick={() => setIsExpanded((expanded) => !expanded)}>
          {isExpanded ? "收起" : `查看全部 ${cards.length} 个记录`}
        </button>
      ) : null}
    </section>
  );
}
