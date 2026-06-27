export function normalizeBangumiTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[[^\]]*]/g, " ")
    .replace(/【[^】]*】/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\b(?:s|season)\s*\d{1,2}\b/gi, " ")
    .replace(/\b(?:ep?|episode)\s*\d{1,4}\b/gi, " ")
    .replace(/\b(?:1080p|2160p|720p|4k|8k|x264|x265|h264|h265|hevc|avc|aac|web-dl|bdrip|bluray)\b/gi, " ")
    .replace(/[._\-:：/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactBangumiTitle(value) {
  return normalizeBangumiTitle(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  if (value.length <= 1) return value ? [value] : [];
  const parts = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    parts.push(value.slice(index, index + 2));
  }
  return parts;
}

export function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aParts = bigrams(a);
  const bParts = bigrams(b);
  const bCounts = new Map();
  bParts.forEach((part) => bCounts.set(part, (bCounts.get(part) ?? 0) + 1));
  let overlap = 0;
  aParts.forEach((part) => {
    const count = bCounts.get(part) ?? 0;
    if (count > 0) {
      overlap += 1;
      bCounts.set(part, count - 1);
    }
  });
  return (2 * overlap) / (aParts.length + bParts.length);
}

export function scoreBangumiSubject(title, subject) {
  const target = normalizeBangumiTitle(title);
  const targetCompact = compactBangumiTitle(title);
  const names = [subject.name, subject.nameCn].filter(Boolean);
  let best = 0;
  names.forEach((name) => {
    const normalized = normalizeBangumiTitle(name);
    const compact = compactBangumiTitle(name);
    if (!normalized || !compact) return;
    if (normalized === target) best = Math.max(best, 100);
    if (compact === targetCompact) best = Math.max(best, 96);
    if (normalized.startsWith(target) || target.startsWith(normalized)) best = Math.max(best, 88);
    if (normalized.includes(target) || target.includes(normalized)) best = Math.max(best, 82);
    best = Math.max(best, Math.round(diceCoefficient(targetCompact, compact) * 75));
  });
  return best;
}

function normalizeBangumiSubject(raw, title) {
  const id = Number(raw?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const subject = {
    id,
    name: typeof raw?.name === "string" ? raw.name : "",
    nameCn: typeof raw?.name_cn === "string" ? raw.name_cn : "",
    url: `https://bgm.tv/subject/${id}`,
    score: Number.isFinite(Number(raw?.rating?.score)) ? Number(raw.rating.score) : undefined,
    rank: Number.isFinite(Number(raw?.rank)) ? Number(raw.rank) : undefined,
    date: typeof raw?.date === "string" ? raw.date : undefined,
    summary: typeof raw?.summary === "string" ? raw.summary.slice(0, 240) : undefined,
  };
  return {
    ...subject,
    matchScore: scoreBangumiSubject(title, subject),
  };
}

export function normalizeBangumiSearchPayload(payload, title) {
  const subjects = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return subjects.map((subject) => normalizeBangumiSubject(subject, title)).filter(Boolean);
}

export function publicBangumiCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    nameCn: candidate.nameCn,
    url: candidate.url,
    score: candidate.score,
    rank: candidate.rank,
    date: candidate.date,
    matchScore: candidate.matchScore,
  };
}

export function createBangumiMatchResult(payload, status, overrides = {}) {
  return {
    status,
    seriesKey: payload.seriesKey,
    title: payload.title,
    subject: null,
    confidence: "none",
    source: status === "error" ? "error" : "none",
    candidates: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

export function normalizeBangumiMatchPayload(payload) {
  const libraryId = typeof payload?.libraryId === "string" ? payload.libraryId.trim().slice(0, 160) : "";
  const seriesKey = typeof payload?.seriesKey === "string" ? payload.seriesKey.trim().slice(0, 240) : "";
  const title = typeof payload?.title === "string" ? payload.title.trim().slice(0, 240) : "";
  const sampleVideoNames = Array.isArray(payload?.sampleVideoNames)
    ? payload.sampleVideoNames.filter((item) => typeof item === "string").map((item) => item.slice(0, 240)).slice(0, 8)
    : [];
  const sampleRelativePaths = Array.isArray(payload?.sampleRelativePaths)
    ? payload.sampleRelativePaths.filter((item) => typeof item === "string").map((item) => item.slice(0, 360)).slice(0, 8)
    : [];
  return {
    libraryId,
    seriesKey,
    title,
    sampleVideoNames,
    sampleRelativePaths,
    force: Boolean(payload?.force),
  };
}
