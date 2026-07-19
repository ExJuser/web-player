import type { ComponentProps } from "react";

import { DuplicateVideoSummaryCard } from "./DuplicateVideoSummaryCard";
import { FavoriteHomeSection } from "./FavoriteHomeSection";
import { HomeLibrarySearchSection } from "./HomeLibrarySearchSection";
import { HomeLibraryStats } from "./HomeLibraryStats";
import { HomeMediaLibraryCard } from "./HomeMediaLibraryCard";
import { HomeModeCard } from "./HomeModeCard";
import { HomeRecapCard } from "./HomeRecapCard";
import { RatingFilterCard } from "./RatingFilterCard";
import { VideoVersionSummaryCard } from "./VideoVersionSummaryCard";

type HomeSideColumnProps = {
  duplicateSummary: ComponentProps<typeof DuplicateVideoSummaryCard>;
  favorites: ComponentProps<typeof FavoriteHomeSection>;
  librarySearch: ComponentProps<typeof HomeLibrarySearchSection>;
  libraryStats: ComponentProps<typeof HomeLibraryStats>;
  mediaLibrary: ComponentProps<typeof HomeMediaLibraryCard>;
  mode: ComponentProps<typeof HomeModeCard>;
  ratingFilter: ComponentProps<typeof RatingFilterCard> | null;
  recap: ComponentProps<typeof HomeRecapCard> | null;
  videoVersions: ComponentProps<typeof VideoVersionSummaryCard> | null;
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
  videoVersions,
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

      {videoVersions ? <VideoVersionSummaryCard {...videoVersions} /> : null}

      <FavoriteHomeSection {...favorites} />
    </aside>
  );
}
