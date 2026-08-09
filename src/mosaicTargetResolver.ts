import { generateServerMosaicTarget } from "./playerStorage";
import type { VideoItem } from "./playerTypes";
import { createHighQualityVideoTarget } from "./videoThumbnail";

export type MosaicTargetOrigin = "server" | "browser" | "fallback";

type ResolveMosaicVideoTargetParams = {
  createBrowserTarget?: typeof createHighQualityVideoTarget;
  fetchTarget?: typeof fetch;
  generateServerTarget?: typeof generateServerMosaicTarget;
  signal: AbortSignal;
  sourceUrl: string;
  video: VideoItem;
};

export async function resolveMosaicVideoTarget({
  createBrowserTarget = createHighQualityVideoTarget,
  fetchTarget = fetch,
  generateServerTarget = generateServerMosaicTarget,
  signal,
  sourceUrl,
  video,
}: ResolveMosaicVideoTargetParams): Promise<{ blob: Blob; origin: MosaicTargetOrigin }> {
  if (video.mediaRootId) {
    try {
      const serverUrl = await generateServerTarget(
        video.id,
        video.mediaRootId,
        video.relativePath,
        video.size,
        video.lastModified,
        signal,
      );
      if (serverUrl) {
        const response = await fetchTarget(serverUrl, { signal });
        if (response.ok) return { blob: await response.blob(), origin: "server" };
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }

  const browserBlob = await createBrowserTarget(video, signal).catch(() => null);
  if (browserBlob) return { blob: browserBlob, origin: "browser" };

  if (sourceUrl) {
    const response = await fetchTarget(sourceUrl, { signal });
    if (response.ok) return { blob: await response.blob(), origin: "fallback" };
  }

  throw new Error("无法读取该影片的高清目标图。");
}
