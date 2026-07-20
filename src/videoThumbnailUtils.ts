export const widescreenAspectRatio = 16 / 9;

export function getVideoDisplaySize(width?: number, height?: number) {
  if (!width || !height) return null;
  return { width, height };
}

export function getPlayerFrameAspectRatio(width?: number, height?: number) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return widescreenAspectRatio;
  return width / height;
}

export function createThumbnailTargetTimes(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  return [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75, 2]
    .map((time) => Math.min(Math.max(time, 0.1), Math.max(0.1, duration - 0.1)))
    .filter((time, index, times) => times.findIndex((other) => Math.abs(other - time) < 0.05) === index);
}

export function isCanvasNearlyBlack(
  context: Pick<CanvasRenderingContext2D, "getImageData">,
  width: number,
  height: number,
) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let brightPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 36) {
      brightPixels += 1;
    }
  }

  return brightPixels / (width * height) < 0.01;
}
