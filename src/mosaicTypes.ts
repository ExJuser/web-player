export type MosaicSourceKind = "video" | "photo";

export type MosaicSourceRef = {
  id: string;
  kind: MosaicSourceKind;
  label: string;
  videoId?: string;
  albumId?: string;
  imageId?: string;
  imageIndex?: number;
  mediaRootId?: string;
  size: number;
  lastModified: number;
};

export type MosaicTargetRef =
  | { kind: "upload"; label: string; assetUrl: string }
  | { kind: "source"; label: string; sourceId: string };

export type MosaicSourceFilter = "mixed" | "videos" | "photos";
export type MosaicTileFit = "cover" | "contain";

export type MosaicRecipe = {
  version: 1;
  algorithmVersion: 1;
  target: MosaicTargetRef;
  sourceFilter: MosaicSourceFilter;
  sourceLimit: number;
  columns: number;
  rows: number;
  targetClarity: number;
  colorPreservation: number;
  tileFit?: MosaicTileFit;
  previewLongestEdge?: number;
  maxReuse: number;
  seed: number;
  sourceIds: string[];
  assignments: string[];
};

export type MosaicProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  previewUrl: string;
  targetUrl?: string;
  recipe: MosaicRecipe;
};

export type MosaicFeatureDescriptor = {
  version: 1;
  sourceId: string;
  signature: string;
  values: number[];
};

export type MosaicRuntimeSource = MosaicSourceRef & {
  url: string;
  file?: File;
};

export type MosaicComputeBackend = "webgpu" | "worker";
