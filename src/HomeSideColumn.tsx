import type { ComponentProps } from "react";

import { DuplicateVideoSummaryCard } from "./DuplicateVideoSummaryCard";
import { FavoriteHomeSection } from "./FavoriteHomeSection";
import { HomeLibrarySearchSection } from "./HomeLibrarySearchSection";
import { HomeLibraryStats } from "./HomeLibraryStats";
import { HomeMediaLibraryCard } from "./HomeMediaLibraryCard";
import { HomeModeCard } from "./HomeModeCard";
import { HomeRecapCard } from "./HomeRecapCard";
import { RatingFilterCard } from "./RatingFilterCard";

type HomeSideColumnProps = {
  duplicateSummary: ComponentProps<typeof DuplicateVideoSummaryCard>;
  favorites: ComponentProps<typeof FavoriteHomeSection>;
  librarySearch: ComponentProps<typeof HomeLibrarySearchSection>;
  libraryStats: ComponentProps<typeof HomeLibraryStats>;
  mediaLibrary: ComponentProps<typeof HomeMediaLibraryCard>;
  mode: ComponentProps<typeof HomeModeCard>;
  ratingFilter: ComponentProps<typeof RatingFilterCard> | null;
  recap: ComponentProps<typeof HomeRecapCard> | null;
};

export function HomeSideColumn({
  duplicateSummary,
  favorites,
  librarySearch,
  libraryStats,
  mediaLibrary,
  mode,
  ratingFilter,
  recap,
}: HomeSideColumnProps) {
  return (
    <aside className="home-side-column">
      <HomeModeCard {...mode} />

      <HomeLibraryStats {...libraryStats} />

      <HomeMediaLibraryCard {...mediaLibrary} />

      {ratingFilter ? <RatingFilterCard {...ratingFilter} /> : null}

      {recap ? <HomeRecapCard {...recap} /> : null}

      <HomeLibrarySearchSection {...librarySearch} />

      <DuplicateVideoSummaryCard {...duplicateSummary} />

      <FavoriteHomeSection {...favorites} />
    </aside>
  );
}
