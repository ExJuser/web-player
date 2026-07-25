import type { ReactNode } from "react";

import type { HomeVideoCard } from "./playerTypes";

type FavoriteHomeSectionProps = {
  cards: HomeVideoCard[];
  totalCount: number;
  onOpenAll: () => void;
  renderCard: (card: HomeVideoCard, index: number) => ReactNode;
};

export function FavoriteHomeSection({ cards, totalCount, onOpenAll, renderCard }: FavoriteHomeSectionProps) {
  return (
    <section className="home-section favorite-home-section">
      <div className="home-section-header">
        <h2>收藏 / 稍后看</h2>
        <span>{totalCount} 个</span>
      </div>
      {cards.length ? (
        <div className="home-compact-list">{cards.map(renderCard)}</div>
      ) : (
        <div className="empty-list compact">还没有影片</div>
      )}
      {totalCount > cards.length ? (
        <button className="secondary-button favorite-home-more" type="button" onClick={onOpenAll}>
          查看全部 {totalCount} 个收藏
        </button>
      ) : null}
    </section>
  );
}
