import type { ComponentProps } from "react";

import { DuplicateVideoSummaryCard } from "./DuplicateVideoSummaryCard";
import { HomeLibraryStats } from "./HomeLibraryStats";
import { HomeMediaLibraryCard } from "./HomeMediaLibraryCard";
import { HomeRecapCard } from "./HomeRecapCard";
import { RatingFilterCard } from "./RatingFilterCard";
import { VideoVersionSummaryCard } from "./VideoVersionSummaryCard";

type HomeSideColumnProps = {
  duplicateSummary: ComponentProps<typeof DuplicateVideoSummaryCard> | null;
  libraryStats: ComponentProps<typeof HomeLibraryStats>;
  mediaLibrary: ComponentProps<typeof HomeMediaLibraryCard>;
  ratingFilter: ComponentProps<typeof RatingFilterCard> | null;
  recap: ComponentProps<typeof HomeRecapCard> | null;
  videoVersions: ComponentProps<typeof VideoVersionSummaryCard> | null;
};

export function HomeSideColumn({
  duplicateSummary,
  libraryStats,
  mediaLibrary,
  ratingFilter,
  recap,
  videoVersions,
}: HomeSideColumnProps) {
  return (
    <aside className="home-side-column" aria-label="首页辅助信息">
      <HomeLibraryStats {...libraryStats} />

      <HomeMediaLibraryCard {...mediaLibrary} />

      {recap ? <HomeRecapCard {...recap} /> : null}

      {ratingFilter ? <RatingFilterCard {...ratingFilter} /> : null}

      {duplicateSummary ? <DuplicateVideoSummaryCard {...duplicateSummary} /> : null}

      {videoVersions ? <VideoVersionSummaryCard {...videoVersions} /> : null}

    </aside>
  );
}
