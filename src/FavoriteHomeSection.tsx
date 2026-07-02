import type { ReactNode } from "react";

import type { HomeVideoCard } from "./playerTypes";

type FavoriteHomeSectionProps = {
  cards: HomeVideoCard[];
  renderCard: (card: HomeVideoCard, index: number) => ReactNode;
};

export function FavoriteHomeSection({ cards, renderCard }: FavoriteHomeSectionProps) {
  if (!cards.length) {
    return null;
  }

  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2>收藏 / 稍后看</h2>
        <span>{cards.length} 个</span>
      </div>
      <div className="home-compact-list">{cards.map(renderCard)}</div>
    </section>
  );
}
