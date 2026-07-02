import type { ComponentProps } from "react";

import { CacheStatusDialog } from "./CacheStatusDialog";
import { CompatibleMediaDialogs } from "./CompatibleMediaDialogs";
import { EmbeddedSubtitleDialog } from "./EmbeddedSubtitleDialog";

type PlayerUtilityDialogsProps = {
  cacheStatus: ComponentProps<typeof CacheStatusDialog>;
  compatibleMedia: ComponentProps<typeof CompatibleMediaDialogs>;
  embeddedSubtitle: ComponentProps<typeof EmbeddedSubtitleDialog>;
};

export function PlayerUtilityDialogs({
  cacheStatus,
  compatibleMedia,
  embeddedSubtitle,
}: PlayerUtilityDialogsProps) {
  return (
    <>
      <CompatibleMediaDialogs {...compatibleMedia} />
      <EmbeddedSubtitleDialog {...embeddedSubtitle} />
      <CacheStatusDialog {...cacheStatus} />
    </>
  );
}
