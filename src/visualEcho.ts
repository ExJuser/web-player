import { quantizeMosaicDescriptor } from "./mosaicEngine";
import type { VideoItem } from "./playerTypes";
import type {
  VisualEchoDescriptor,
  VisualEchoIndex,
  VisualEchoMatch,
  VisualEchoSample,
} from "./visualEchoTypes";

export const visualEchoAlgorithmVersion = 1 as const;
export const visualEchoResultLimit = 18;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createVisualEchoVideoSignature(video: Pick<VideoItem, "id" | "size" | "lastModified">) {
  return `${visualEchoAlgorithmVersion}|${video.id}|${Math.floor(video.size || 0)}|${Math.round(video.lastModified || 0)}`;
}

export function createVisualEchoFrameId(videoSignature: string, timestamp: number) {
  const normalizedTime = Math.max(0, Number(timestamp.toFixed(3)));
  return `echo-${visualEchoAlgorithmVersion}-${stableHash(`${videoSignature}|${normalizedTime}`)}-${stableHash(`${normalizedTime}|${videoSignature}`)}`;
}

export function createVisualEchoSampleTimes(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const count = Math.max(6, Math.min(24, Math.ceil(duration / 300)));
  const start = duration * 0.05;
  const span = duration * 0.9;
  return Array.from({ length: count }, (_, index) =>
    Number((start + span * ((index + 0.5) / count)).toFixed(3)));
}

function readPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const normalizedX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const normalizedY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const offset = (normalizedY * width + normalizedX) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]] as const;
}

function pixelLuma(pixel: readonly number[]) {
  return ((pixel[0] ?? 0) * 0.299 + (pixel[1] ?? 0) * 0.587 + (pixel[2] ?? 0) * 0.114) / 255;
}

function createDifferenceHash(data: Uint8ClampedArray, width: number, height: number) {
  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const y = ((row + 0.5) / 8) * height;
      const left = pixelLuma(readPixel(data, width, height, ((column + 0.5) / 9) * width, y));
      const right = pixelLuma(readPixel(data, width, height, ((column + 1.5) / 9) * width, y));
      bits += left < right ? "1" : "0";
    }
  }
  return Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(bits.slice(index * 4, index * 4 + 4), 2).toString(16)).join("");
}

function createLumaGrid(data: Uint8ClampedArray, width: number, height: number) {
  return Array.from({ length: 24 }, (_, index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    let total = 0;
    let count = 0;
    const xStart = Math.floor((column / 6) * width);
    const xEnd = Math.max(xStart + 1, Math.floor(((column + 1) / 6) * width));
    const yStart = Math.floor((row / 4) * height);
    const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) / 4) * height));
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        total += pixelLuma(readPixel(data, width, height, x, y));
        count += 1;
      }
    }
    return Number((total / Math.max(1, count)).toFixed(4));
  });
}

function createColorDescriptor(data: Uint8ClampedArray, width: number, height: number) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let lumaSquared = 0;
  let pixelCount = 0;
  const regions = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = readPixel(data, width, height, x, y);
      red += r;
      green += g;
      blue += b;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      lumaSquared += luma * luma;
      pixelCount += 1;
      const region = Math.min(2, Math.floor((x / width) * 3)) + Math.min(2, Math.floor((y / height) * 3)) * 3;
      regions[region][0] += r;
      regions[region][1] += g;
      regions[region][2] += b;
      regions[region][3] += 1;
    }
  }
  const averageLuma = (red * 0.299 + green * 0.587 + blue * 0.114) / Math.max(1, pixelCount);
  const variance = Math.max(0, lumaSquared / Math.max(1, pixelCount) - averageLuma * averageLuma);
  return quantizeMosaicDescriptor(
    red / Math.max(1, pixelCount),
    green / Math.max(1, pixelCount),
    blue / Math.max(1, pixelCount),
    Math.sqrt(variance),
    regions.map((region) => [
      region[0] / Math.max(1, region[3]),
      region[1] / Math.max(1, region[3]),
      region[2] / Math.max(1, region[3]),
    ]),
  );
}

export function createVisualEchoDescriptor(imageData: ImageData): VisualEchoDescriptor {
  return {
    version: 1,
    color: createColorDescriptor(imageData.data, imageData.width, imageData.height),
    hash: createDifferenceHash(imageData.data, imageData.width, imageData.height),
    luma: createLumaGrid(imageData.data, imageData.width, imageData.height),
  };
}

function popcount(value: number) {
  let current = value >>> 0;
  let count = 0;
  while (current) {
    current &= current - 1;
    count += 1;
  }
  return count;
}

export function visualEchoHashSimilarity(left: string, right: string) {
  if (left.length !== 16 || right.length !== 16) return 0;
  let distance = 0;
  for (let index = 0; index < 16; index += 1) {
    distance += popcount(Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16));
  }
  return clamp01(1 - distance / 64);
}

export function visualEchoCompositionSimilarity(left: readonly number[], right: readonly number[]) {
  const count = Math.max(left.length, right.length, 1);
  const meanSquaredError = Array.from({ length: count }, (_, index) => {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    return delta * delta;
  }).reduce((sum, value) => sum + value, 0) / count;
  return clamp01(1 - Math.sqrt(meanSquaredError));
}

export function visualEchoColorSimilarity(left: readonly number[], right: readonly number[]) {
  const count = Math.max(left.length, right.length, 1);
  const meanSquaredError = Array.from({ length: count }, (_, index) => {
    const delta = ((left[index] ?? 0) - (right[index] ?? 0)) / 255;
    return delta * delta;
  }).reduce((sum, value) => sum + value, 0) / count;
  return clamp01(1 - Math.sqrt(meanSquaredError));
}

export function scoreVisualEchoDescriptors(left: VisualEchoDescriptor, right: VisualEchoDescriptor) {
  const hashScore = visualEchoHashSimilarity(left.hash, right.hash);
  const compositionScore = visualEchoCompositionSimilarity(left.luma, right.luma);
  const colorScore = visualEchoColorSimilarity(left.color, right.color);
  const score = Number(((hashScore * 0.45 + compositionScore * 0.35 + colorScore * 0.2) * 100).toFixed(1));
  const reason = colorScore >= hashScore && colorScore >= compositionScore
    ? "色彩回声"
    : compositionScore >= hashScore
      ? "光影回声"
      : "构图回声";
  return { score, hashScore, compositionScore, colorScore, reason } as const;
}

export function findVisualEchoMatches(
  source: Pick<VisualEchoSample, "id" | "videoId" | "descriptor">,
  index: VisualEchoIndex,
  options: { includeSameVideo?: boolean; limit?: number } = {},
): VisualEchoMatch[] {
  const limit = Math.max(1, Math.floor(options.limit ?? visualEchoResultLimit));
  return index.samples
    .filter((sample) => sample.id !== source.id && (options.includeSameVideo || sample.videoId !== source.videoId))
    .map((sample) => ({ sample, ...scoreVisualEchoDescriptors(source.descriptor, sample.descriptor) }))
    .sort((left, right) => right.score - left.score
      || left.sample.videoId.localeCompare(right.sample.videoId)
      || left.sample.timestamp - right.sample.timestamp)
    .slice(0, limit);
}

export function filterVisualEchoIndex(index: VisualEchoIndex, videos: VideoItem[]): VisualEchoIndex {
  const signaturesByVideoId = new Map(videos.map((video) => [video.id, createVisualEchoVideoSignature(video)]));
  return {
    version: 1,
    updatedAt: index.updatedAt,
    samples: index.samples.filter((sample) => signaturesByVideoId.get(sample.videoId) === sample.videoSignature),
  };
}
