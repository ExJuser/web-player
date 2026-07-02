import type { ReactNode } from "react";

import type { HomeVideoCard } from "./playerTypes";

type HomeRecentSectionProps = {
  cards: HomeVideoCard[];
  renderCard: (card: HomeVideoCard, index: number) => ReactNode;
};

export function HomeRecentSection({ cards, renderCard }: HomeRecentSectionProps) {
  if (!cards.length) return null;

  return (
    <section className="home-section">
      <div className="home-section-header">
        <h2>最近观看</h2>
        <span>{cards.length} 个记录</span>
      </div>
      <div className="home-list-grid">{cards.map(renderCard)}</div>
    </section>
  );
}
