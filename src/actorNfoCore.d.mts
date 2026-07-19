import type { VideoActorHints } from "./playerTypes";

export const maxActorNfoBytes: number;
export const maxActorsPerVideo: number;
export const maxActorNameLength: number;
export function normalizeActorKey(value: unknown): string;
export function parseActorNfoBytes(input: Uint8Array | ArrayBuffer, fileName?: string): VideoActorHints;
export function findMatchingNfoName(videoName: string, entryNames: string[]): string | null;
