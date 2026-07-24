import type { ComponentProps } from "react";

import { DuplicateVideoSummaryCard } from "./DuplicateVideoSummaryCard";
import { FavoriteHomeSection } from "./FavoriteHomeSection";
import { HomeLibraryStats } from "./HomeLibraryStats";
import { HomeMediaLibraryCard } from "./HomeMediaLibraryCard";
import { HomeRecapCard } from "./HomeRecapCard";
import { RatingFilterCard } from "./RatingFilterCard";
import { VideoVersionSummaryCard } from "./VideoVersionSummaryCard";

type HomeSideColumnProps = {
  duplicateSummary: ComponentProps<typeof DuplicateVideoSummaryCard> | null;
  favorites: ComponentProps<typeof FavoriteHomeSection>;
  libraryStats: ComponentProps<typeof HomeLibraryStats>;
  mediaLibrary: ComponentProps<typeof HomeMediaLibraryCard>;
  ratingFilter: ComponentProps<typeof RatingFilterCard> | null;
  recap: ComponentProps<typeof HomeRecapCard> | null;
  videoVersions: ComponentProps<typeof VideoVersionSummaryCard> | null;
};

export function HomeSideColumn({
  duplicateSummary,
  favorites,
  libraryStats,
  mediaLibrary,
  ratingFilter,
  recap,
  videoVersions,
}: HomeSideColumnProps) {
  return (
    <aside className="home-side-column" aria-label="首页辅助信息">
      <HomeLibraryStats {...libraryStats} />

      <FavoriteHomeSection {...favorites} />

      {recap ? <HomeRecapCard {...recap} /> : null}

      {ratingFilter ? <RatingFilterCard {...ratingFilter} /> : null}

      <HomeMediaLibraryCard {...mediaLibrary} />

      {duplicateSummary ? <DuplicateVideoSummaryCard {...duplicateSummary} /> : null}

      {videoVersions ? <VideoVersionSummaryCard {...videoVersions} /> : null}

    </aside>
  );
}
