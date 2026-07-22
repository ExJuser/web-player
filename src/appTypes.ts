import type { TagMergeSuggestion } from "./tagUtils";
import type { LocalMediaRoot } from "./mediaRootScanCache";
import type {
  DanmakuComment,
  DanmakuSource,
  PlaybackProgress,
  VideoItem,
  VideoMetadata,
  VideoPlayability,
} from "./playerTypes";
export type DanmakuSourcePayload = {
  source: DanmakuSource;
  comments: DanmakuComment[];
  reused?: number;
  requested?: number;
};

export type AiTagMergeSuggestionResponse = {
  existingTag?: string;
  newTag?: string;
  reason?: string;
};

export type TagMergePrompt = {
  pendingTags: string[];
  suggestion: TagMergeSuggestion;
  markAsActor?: boolean;
};

export type ExistingMediaRootPrompt = {
  directoryName: string;
  mediaRootLabel: string;
  resolve: (shouldRescan: boolean) => void;
};

export type BangumiSubject = {
  id: number;
  name: string;
  nameCn: string;
  url: string;
  score?: number;
  rank?: number;
  date?: string;
  matchScore?: number;
};

export type BangumiSeriesMatch = {
  status: "loading" | "matched" | "none" | "error";
  seriesKey: string;
  title: string;
  subject: BangumiSubject | null;
  confidence: "high" | "medium" | "low" | "none";
  source: "bangumi" | "ai" | "cache" | "none" | "error";
  candidates: BangumiSubject[];
  error?: string;
  updatedAt?: number;
};

export type MediaRootLabelPrompt = {
  directoryName: string;
  value: string;
  resolve: (value: string | null) => void;
};

export type MediaRootLocalPathDialog = {
  root: LocalMediaRoot;
  value: string;
  error: string;
  isSaving: boolean;
};

export type AiStreamEvent =
  | { type: "delta"; text: string }
  | { type: "result"; text: string }
  | { type: "message"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };

export type CompatibleRemuxResponse = {
  cacheId: string;
  compatibleUrl: string;
  playability: VideoPlayability;
};

export type CompatibleMediaDeleteResponse = {
  deleted: boolean;
  cacheId: string;
};

export type CompatibleRemuxStreamEvent =
  | { type: "progress"; percent?: number; message?: string }
  | { type: "done"; result: CompatibleRemuxResponse }
  | { type: "error"; error: string };

export type HighlightMontageResult = {
  fileName: string;
  mode: "lossless" | "precise";
  relativePath: string;
  segmentCount: number;
  durationSeconds: number;
  videoId: string;
  size: number;
  lastModified: number;
};

export type LadaRestorationResult = {
  fileName: string;
  relativePath: string;
  size: number;
  lastModified: number;
};

export type MediaProcessingTaskRunState = "running" | "cancelling" | "completed" | "failed" | "cancelled";

type MediaProcessingTaskSnapshotBase = {
  id: string;
  videoName: string;
  progress: number;
  status: string;
  state: MediaProcessingTaskRunState;
  error: string | null;
};

export type MediaProcessingTaskSnapshot = MediaProcessingTaskSnapshotBase & (
  | { kind: "montage"; result: HighlightMontageResult | null }
  | { kind: "lada"; result: LadaRestorationResult | null }
);

export type MediaProbeResponse = {
  playability: VideoPlayability;
  metadata?: VideoMetadata;
};

export type PlaybackSourceChoice = "original" | "compatible";
