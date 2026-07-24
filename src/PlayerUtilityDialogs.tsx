import type { ComponentProps } from "react";

import { CacheStatusDialog } from "./CacheStatusDialog";
import { CompatibleMediaDialogs } from "./CompatibleMediaDialogs";
import { EmbeddedSubtitleDialog } from "./EmbeddedSubtitleDialog";
import { HighlightMontageDialogs } from "./HighlightMontageDialogs";
import { LadaRestorationDialogs } from "./LadaRestorationDialogs";
import { MediaProcessingTaskDialog } from "./MediaProcessingTaskDialog";

type PlayerUtilityDialogsProps = {
  cacheStatus: ComponentProps<typeof CacheStatusDialog>;
  compatibleMedia: ComponentProps<typeof CompatibleMediaDialogs>;
  embeddedSubtitle: ComponentProps<typeof EmbeddedSubtitleDialog>;
  highlightMontage: ComponentProps<typeof HighlightMontageDialogs>;
  ladaRestoration: ComponentProps<typeof LadaRestorationDialogs>;
  mediaProcessingTask: ComponentProps<typeof MediaProcessingTaskDialog>;
};

export function PlayerUtilityDialogs({
  cacheStatus,
  compatibleMedia,
  embeddedSubtitle,
  highlightMontage,
  ladaRestoration,
  mediaProcessingTask,
}: PlayerUtilityDialogsProps) {
  return (
    <>
      <CompatibleMediaDialogs {...compatibleMedia} />
      <HighlightMontageDialogs {...highlightMontage} />
      <LadaRestorationDialogs {...ladaRestoration} />
      <MediaProcessingTaskDialog {...mediaProcessingTask} />
      <EmbeddedSubtitleDialog {...embeddedSubtitle} />
      <CacheStatusDialog {...cacheStatus} />
    </>
  );
}
