import { Converter } from "opencc-js";

import type { DanmakuComment, DanmakuCommentMode, DanmakuProvider } from "./playerTypes";

const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

export type ParsedDanmakuUrl =
  | { provider: "bilibili"; kind: "bvid"; value: string; url: string }
  | { provider: "bilibili"; kind: "aid"; value: string; url: string }
  | { provider: "bilibili"; kind: "cid"; value: string; url: string }
  | { provider: "bilibili"; kind: "ep"; value: string; url: string }
  | { provider: "aniGamer"; kind: "sn"; value: string; url: string };

export type TranslationBatchItem = {
  id: string;
  text: string;
  hash: string;
};

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeDanmakuText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function createDanmakuTextHash(value: string) {
  return stableHash(normalizeDanmakuText(value).toLowerCase());
}

export function simplifyTraditionalDanmakuText(value: string) {
  return traditionalToSimplified(value);
}

export function inferDanmakuLanguage(value: string): DanmakuComment["sourceLanguage"] {
  const text = normalizeDanmakuText(value);
  if (!text) return "unknown";
  if (/[\u3040-\u30ff]/u.test(text)) return /[\u4e00-\u9fffA-Za-z]/u.test(text) ? "mixed" : "ja";
  if (/[A-Za-z]{3,}/u.test(text) && !/[\u4e00-\u9fff]/u.test(text)) return "en";
  const simplified = simplifyTraditionalDanmakuText(text);
  if (simplified !== text) return "zh-Hant";
  if (/[\u4e00-\u9fff]/u.test(text)) return "zh-Hans";
  if (/[A-Za-z]/u.test(text)) return "mixed";
  return "unknown";
}

export function needsLlmDanmakuTranslation(value: string) {
  const language = inferDanmakuLanguage(value);
  return language === "ja" || language === "en" || language === "mixed";
}

export function normalizeDanmakuMode(value: unknown): DanmakuCommentMode {
  if (value === 5 || value === "5" || value === "top") return "top";
  if (value === 4 || value === "4" || value === "bottom") return "bottom";
  return "scroll";
}

export function normalizeDanmakuColor(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return `#${Math.floor(numeric).toString(16).padStart(6, "0").slice(-6)}`;
}

export function createDanmakuComment(input: {
  id?: string;
  time: number;
  text: string;
  mode?: unknown;
  color?: unknown;
  simplifiedText?: string;
}): DanmakuComment | null {
  if (!Number.isFinite(input.time) || input.time < 0) return null;
  const text = normalizeDanmakuText(input.text);
  if (!text) return null;
  const hash = createDanmakuTextHash(text);
  const language = inferDanmakuLanguage(text);
  const simplifiedText =
    typeof input.simplifiedText === "string" && input.simplifiedText.trim()
      ? normalizeDanmakuText(input.simplifiedText)
      : language === "zh-Hant"
        ? simplifyTraditionalDanmakuText(text)
        : undefined;
  return {
    id: input.id || `dm:${Math.round(input.time * 1000)}:${hash}`,
    time: input.time,
    text,
    simplifiedText,
    mode: normalizeDanmakuMode(input.mode),
    color: normalizeDanmakuColor(input.color),
    hash,
    sourceLanguage: language,
  };
}

export function dedupeDanmakuComments(comments: DanmakuComment[]) {
  const seen = new Set<string>();
  return comments
    .filter((comment) => {
      const key = `${Math.round(comment.time * 10)}:${comment.hash}:${comment.mode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function createDanmakuTranslationItems(comments: DanmakuComment[]): TranslationBatchItem[] {
  const byHash = new Map<string, TranslationBatchItem>();
  comments.forEach((comment) => {
    if (!needsLlmDanmakuTranslation(comment.text)) return;
    if (comment.simplifiedText) return;
    if (!byHash.has(comment.hash)) {
      byHash.set(comment.hash, {
        id: comment.hash,
        text: comment.text,
        hash: comment.hash,
      });
    }
  });
  return Array.from(byHash.values());
}

export function chunkDanmakuTranslationItems(items: TranslationBatchItem[], maxCharacters = 5000) {
  const chunks: TranslationBatchItem[][] = [];
  let pending: TranslationBatchItem[] = [];
  let pendingCharacters = 0;

  items.forEach((item) => {
    const nextCharacters = item.text.length + 24;
    if (pending.length && pendingCharacters + nextCharacters > maxCharacters) {
      chunks.push(pending);
      pending = [];
      pendingCharacters = 0;
    }
    pending.push(item);
    pendingCharacters += nextCharacters;
  });

  if (pending.length) chunks.push(pending);
  return chunks;
}

export function applyDanmakuTranslations(comments: DanmakuComment[], translations: Record<string, string>) {
  return comments.map((comment) => {
    const translated = translations[comment.hash];
    if (!translated) return comment;
    return {
      ...comment,
      simplifiedText: normalizeDanmakuText(translated),
    };
  });
}

export function parseDanmakuUrl(rawUrl: string): ParsedDanmakuUrl | null {
  const value = rawUrl.trim();
  if (!value) return null;
  const directCid = /^cid:(\d+)$/i.exec(value);
  if (directCid) return { provider: "bilibili", kind: "cid", value: directCid[1], url: value };
  const directBvid = /^(BV[0-9A-Za-z]{8,})$/.exec(value);
  if (directBvid) return { provider: "bilibili", kind: "bvid", value: directBvid[1], url: `https://www.bilibili.com/video/${directBvid[1]}` };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host.includes("bilibili.com") || host === "b23.tv") {
    const bvid = /\/video\/(BV[0-9A-Za-z]+)/.exec(url.pathname)?.[1];
    if (bvid) return { provider: "bilibili", kind: "bvid", value: bvid, url: value };
    const aid = /\/video\/av(\d+)/i.exec(url.pathname)?.[1];
    if (aid) return { provider: "bilibili", kind: "aid", value: aid, url: value };
    const ep = /\/bangumi\/play\/ep(\d+)/i.exec(url.pathname)?.[1] || url.searchParams.get("ep_id");
    if (ep) return { provider: "bilibili", kind: "ep", value: ep, url: value };
    const cid = url.searchParams.get("cid");
    if (cid && /^\d+$/.test(cid)) return { provider: "bilibili", kind: "cid", value: cid, url: value };
  }

  if (host.includes("ani.gamer.com.tw")) {
    const sn = url.searchParams.get("sn") || /\/animeVideo\.php\/?(\d+)?/i.exec(url.pathname)?.[1];
    if (sn && /^\d+$/.test(sn)) return { provider: "aniGamer", kind: "sn", value: sn, url: value };
  }

  return null;
}

export function inferEpisodeNumber(value: string) {
  const normalized = value.normalize("NFKC");
  const match =
    /(?:第\s*)?(\d{1,4})(?:\s*[话話集]|v\d\b)/i.exec(normalized) ||
    /(?:ep|episode|e)\s*0*(\d{1,4})\b/i.exec(normalized) ||
    /(?:^|[^\d])0*(\d{1,4})(?:[^\d]|$)/.exec(normalized);
  return match ? Number(match[1]) : null;
}

export function createDanmakuSourceId(provider: DanmakuProvider, key: string) {
  return `${provider}:${stableHash(key)}`;
}
