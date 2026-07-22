/// <reference lib="webworker" />

import { finalizeMosaicAssignments, findCpuCandidates, quantizeMosaicDescriptor } from "./mosaicEngine";
import type { MosaicFeatureDescriptor } from "./mosaicTypes";

type AnalyzeMessage = { id: number; type: "analyze"; items: Array<{ sourceId: string; signature: string; bitmap: ImageBitmap }> };
type MatchMessage = {
  id: number;
  type: "match";
  targets: number[][];
  sources: MosaicFeatureDescriptor[];
  candidates?: number[][];
  columns: number;
  maxReuse: number;
  seed: number;
  guaranteedSourceId?: string;
};

function analyzeBitmap(sourceId: string, signature: string, bitmap: ImageBitmap): MosaicFeatureDescriptor {
  const canvas = new OffscreenCanvas(24, 24);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法分析素材图片。");
  const scale = Math.max(24 / bitmap.width, 24 / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (24 - width) / 2, (24 - height) / 2, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, 24, 24).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let lumaSquared = 0;
  const regionSums = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  const pixelCount = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    const luma = pixels[index] * 0.3 + pixels[index + 1] * 0.59 + pixels[index + 2] * 0.11;
    lumaSquared += luma * luma;
    const pixelIndex = index / 4;
    const regionIndex = Math.floor((pixelIndex % 24) / 8) + Math.floor(Math.floor(pixelIndex / 24) / 8) * 3;
    regionSums[regionIndex][0] += pixels[index];
    regionSums[regionIndex][1] += pixels[index + 1];
    regionSums[regionIndex][2] += pixels[index + 2];
    regionSums[regionIndex][3] += 1;
  }
  const averageLuma = (red * 0.3 + green * 0.59 + blue * 0.11) / pixelCount;
  const variance = Math.max(0, lumaSquared / pixelCount - averageLuma * averageLuma);
  return {
    version: 1,
    sourceId,
    signature,
    values: quantizeMosaicDescriptor(
      red / pixelCount,
      green / pixelCount,
      blue / pixelCount,
      Math.sqrt(variance),
      regionSums.map((region) => [region[0] / region[3], region[1] / region[3], region[2] / region[3]]),
    ),
  };
}

self.onmessage = (event: MessageEvent<AnalyzeMessage | MatchMessage>) => {
  const message = event.data;
  try {
    if (message.type === "analyze") {
      self.postMessage({ id: message.id, result: message.items.map((item) => analyzeBitmap(item.sourceId, item.signature, item.bitmap)) });
      return;
    }
    const candidates = message.candidates ?? findCpuCandidates(message.targets, message.sources);
    self.postMessage({
      id: message.id,
      result: finalizeMosaicAssignments({
        candidates,
        sourceIds: message.sources.map((source) => source.sourceId),
        columns: message.columns,
        maxReuse: message.maxReuse,
        seed: message.seed,
        guaranteedSourceId: message.guaranteedSourceId,
      }),
    });
  } catch (error) {
    self.postMessage({ id: message.id, error: error instanceof Error ? error.message : "千图计算失败。" });
  }
};
