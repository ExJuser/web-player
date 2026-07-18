import type { ComponentProps } from "react";

import { CacheStatusDialog } from "./CacheStatusDialog";
import { CompatibleMediaDialogs } from "./CompatibleMediaDialogs";
import { EmbeddedSubtitleDialog } from "./EmbeddedSubtitleDialog";
import { HighlightMontageDialogs } from "./HighlightMontageDialogs";

type PlayerUtilityDialogsProps = {
  cacheStatus: ComponentProps<typeof CacheStatusDialog>;
  compatibleMedia: ComponentProps<typeof CompatibleMediaDialogs>;
  embeddedSubtitle: ComponentProps<typeof EmbeddedSubtitleDialog>;
  highlightMontage: ComponentProps<typeof HighlightMontageDialogs>;
};

export function PlayerUtilityDialogs({
  cacheStatus,
  compatibleMedia,
  embeddedSubtitle,
  highlightMontage,
}: PlayerUtilityDialogsProps) {
  return (
    <>
      <CompatibleMediaDialogs {...compatibleMedia} />
      <HighlightMontageDialogs {...highlightMontage} />
      <EmbeddedSubtitleDialog {...embeddedSubtitle} />
      <CacheStatusDialog {...cacheStatus} />
    </>
  );
}
