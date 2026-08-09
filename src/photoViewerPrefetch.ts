import { photoViewerDecodeRadius, photoViewerWarmRadius } from "./appConfig";

const photoViewerIdleWarmRadius = 2;
const photoViewerDirectionalWarmBehind = 1;
const photoViewerFastNavigationThresholdMs = 300;
const photoViewerFastWarmExtra = 2;

export type PhotoViewerDirection = -1 | 0 | 1;

export type PhotoViewerPosition = {
  albumId: string;
  averageStepMs: number;
  direction: PhotoViewerDirection;
  index: number;
  timestamp: number;
};

export function isPhotoViewerFastNavigation(averageStepMs: number) {
  return averageStepMs > 0 && averageStepMs < photoViewerFastNavigationThresholdMs;
}

export function getPhotoViewerWarmIndexes(
  currentIndex: number,
  imageCount: number,
  direction: PhotoViewerDirection,
  isFastNavigation: boolean,
) {
  const directionalWarmRadius = photoViewerWarmRadius + (isFastNavigation ? photoViewerFastWarmExtra : 0);
  const offsets = direction === 0
    ? Array.from({ length: photoViewerIdleWarmRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
    : [
        ...Array.from({ length: directionalWarmRadius }, (_, index) => (index + 1) * direction),
        ...Array.from({ length: photoViewerDirectionalWarmBehind }, (_, index) => -(index + 1) * direction),
      ];
  return [0, ...offsets]
    .map((offset) => currentIndex + offset)
    .filter((index) => index >= 0 && index < imageCount);
}

export function getPhotoViewerDecodeIndexes(
  currentIndex: number,
  imageCount: number,
  direction: PhotoViewerDirection,
  isFastNavigation: boolean,
) {
  const offsets = direction === 0
    ? Array.from({ length: photoViewerDecodeRadius }, (_, index) => index + 1).flatMap((offset) => [-offset, offset])
    : isFastNavigation
      ? [direction]
      : [direction, direction * 2, -direction];
  return [0, ...offsets]
    .map((offset) => currentIndex + offset)
    .filter((index) => index >= 0 && index < imageCount);
}

export function buildPhotoViewerLoadPlan({
  albumId,
  currentIndex,
  imageCount,
  isPageVisible,
  now,
  previousPosition,
  scrollDirection,
}: {
  albumId: string;
  currentIndex: number;
  imageCount: number;
  isPageVisible: boolean;
  now: number;
  previousPosition: PhotoViewerPosition | null;
  scrollDirection: PhotoViewerDirection;
}) {
  const sameAlbumPosition = previousPosition?.albumId === albumId ? previousPosition : null;
  const indexDelta = sameAlbumPosition ? currentIndex - sameAlbumPosition.index : 0;
  const stepMs = sameAlbumPosition && indexDelta
    ? (now - sameAlbumPosition.timestamp) / Math.abs(indexDelta)
    : 0;
  const averageStepMs = stepMs
    ? previousPosition?.averageStepMs
      ? previousPosition.averageStepMs * 0.65 + stepMs * 0.35
      : stepMs
    : previousPosition?.averageStepMs ?? 0;
  const indexDirection: PhotoViewerDirection = indexDelta > 0 ? 1 : indexDelta < 0 ? -1 : 0;
  const direction: PhotoViewerDirection = scrollDirection
    || indexDirection
    || sameAlbumPosition?.direction
    || 0;
  const isFastNavigation = isPhotoViewerFastNavigation(averageStepMs);
  const position: PhotoViewerPosition = {
    albumId,
    averageStepMs,
    direction,
    index: currentIndex,
    timestamp: indexDelta ? now : sameAlbumPosition?.timestamp ?? now,
  };
  return {
    position,
    warmIndexes: isPageVisible
      ? getPhotoViewerWarmIndexes(currentIndex, imageCount, direction, isFastNavigation)
      : [currentIndex],
  };
}
