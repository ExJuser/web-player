import { clamp } from "./playerInteractionUtils";
import { inferSeriesTitle } from "./playerSeriesUtils";
import { fallbackMediaRootLabelForVideo } from "./mediaPathUtils";
import type { HomeVideoCard, PlaybackProgress, VideoItem } from "./playerTypes";

// createHomeVideoCard 的只读上下文：把 App 内的 8 个数据源一次性传入，
// 使卡片构建成为无副作用纯函数（可从 App.tsx 抽离并单独测试）。
export type HomeVideoCardContext = {
  progressStore: Readonly<Record<string, PlaybackProgress | undefined>>;
  seriesTitleByVideoId: ReadonlyMap<string, string>;
  mediaRootLabelsById: Readonly<Record<string, string>>;
  effectiveVideoTags: Readonly<Record<string, string[]>>;
  videoActorTags: Readonly<Record<string, string[]>>;
  systemVideoTags: Readonly<Record<string, string[]>>;
  videoRatings: Readonly<Record<string, number | undefined>>;
  videoComments: Readonly<Record<string, string | undefined>>;
};

export function createHomeVideoCard(video: VideoItem, context: HomeVideoCardContext): HomeVideoCard {
  const progress = context.progressStore[video.id];
  const progressDuration = progress?.duration && progress.duration > 0 ? progress.duration : video.duration || 0;
  const progressPercent = progressDuration
    ? clamp(((progress?.currentTime ?? 0) / progressDuration) * 100, 0, 100)
    : 0;
  return {
    video,
    progress,
    progressPercent,
    seriesTitle: context.seriesTitleByVideoId.get(video.id) ?? inferSeriesTitle(video),
    mediaRootLabel: (video.mediaRootId ? context.mediaRootLabelsById[video.mediaRootId] : "") || fallbackMediaRootLabelForVideo(video),
    tags: context.effectiveVideoTags[video.id] ?? [],
    actorTags: context.videoActorTags[video.id] ?? [],
    systemTags: context.systemVideoTags[video.id] ?? [],
    rating: context.videoRatings[video.id],
    ratingComment: context.videoComments[video.id],
  };
}
