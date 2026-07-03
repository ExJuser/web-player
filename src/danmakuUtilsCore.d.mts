import type { DanmakuComment, DanmakuCommentMode, DanmakuProvider } from "./playerTypes";

export const danmakuLaneLineHeight: 1.12;

export type ParsedDanmakuUrl =
  | { provider: "bilibili"; kind: "bvid"; value: string; url: string }
  | { provider: "bilibili"; kind: "aid"; value: string; url: string }
  | { provider: "bilibili"; kind: "cid"; value: string; url: string }
  | { provider: "bilibili"; kind: "ep"; value: string; url: string };

export function stableHash(value: string): string;
export function normalizeDanmakuText(value: string): string;
export function createDanmakuTextHash(value: string): string;
export function simplifyTraditionalDanmakuText(value: string): string;
export function inferDanmakuLanguage(value: string): DanmakuComment["sourceLanguage"];
export function normalizeDanmakuMode(value: unknown): DanmakuCommentMode;
export function normalizeDanmakuColor(value: unknown): string | undefined;
export function createDanmakuComment(input: {
  id?: string;
  time: number;
  text: string;
  mode?: unknown;
  color?: unknown;
  simplifiedText?: string;
}): DanmakuComment | null;
export function dedupeDanmakuComments(comments: DanmakuComment[]): DanmakuComment[];
export function parseDanmakuUrl(rawUrl: string): ParsedDanmakuUrl | null;
export function inferEpisodeNumber(value: string): number | null;
export function createDanmakuSourceId(provider: DanmakuProvider, key: string): string;
export function getDanmakuLane(comment: Pick<DanmakuComment, "id" | "hash" | "time">, laneCount: number): number;
export function getActiveDanmakuComments(input: {
  comments: DanmakuComment[];
  currentTime: number;
  durationSeconds: number;
  displayLimit: number;
}): DanmakuComment[];
export function formatDanmakuSpeedLevel(speed: number): string;
export function getDanmakuLaneCount(displayArea: number, fontSize: number, layerHeight: number): number;
export function formatDanmakuLaneTop(lane: number, laneCount: number, displayArea: number): string;
