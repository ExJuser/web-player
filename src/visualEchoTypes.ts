import type { VideoItem } from "./playerTypes";

export type VisualEchoDescriptor = {
  version: 1;
  color: number[];
  hash: string;
  luma: number[];
};

export type VisualEchoSample = {
  id: string;
  frameId: string;
  videoId: string;
  timestamp: number;
  videoSignature: string;
  descriptor: VisualEchoDescriptor;
};

export type VisualEchoIndex = {
  version: 1;
  updatedAt: number;
  samples: VisualEchoSample[];
};

export type VisualEchoMatch = {
  sample: VisualEchoSample;
  score: number;
  hashScore: number;
  compositionScore: number;
  colorScore: number;
  reason: "构图回声" | "色彩回声" | "光影回声";
};

export type VisualEchoSource = {
  video: VideoItem;
  timestamp: number;
  duration: number;
  descriptor: VisualEchoDescriptor;
  previewUrl: string;
};

export type VisualEchoIndexedFrame = {
  sample: VisualEchoSample;
  preview: Blob;
};

export type VisualEchoBuildProgress = {
  completedVideos: number;
  totalVideos: number;
  completedFrames: number;
  currentVideoName: string;
};
