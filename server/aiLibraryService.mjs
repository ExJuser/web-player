import { normalizeAiLibrarySearchAnswer, normalizeLibrarySearchCandidates, parseAiJsonObject } from "./aiResponseUtils.mjs";
import { callDeepSeek } from "./deepSeekClient.mjs";
import { requestExternalText } from "./remoteFetch.mjs";

const autoTagSearchResultLimit = 5;

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeTagKey(tag) {
  return String(tag || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function parseTagList(tags, limit = 80) {
  const seenKeys = new Set();
  const output = [];
  const source = Array.isArray(tags) ? tags : [];
  for (const tag of source) {
    if (typeof tag !== "string") continue;
    const value = tag.trim().slice(0, 40);
    const key = normalizeTagKey(value);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function withoutExtension(name) {
  const fileName = String(name || "").split(/[\\/]/).pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function cleanSearchTerm(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\[[^\]]{1,80}\]|\([^)]{1,80}\)|【[^】]{1,80}】/g, " ")
    .replace(/\b(1080p|720p|2160p|4k|8k|x26[45]|h\.?26[45]|hevc|avc|aac|flac|web-?dl|blu-?ray|bdrip|webrip|hdr|sdr)\b/gi, " ")
    .replace(/\b(s\d{1,2}e\d{1,3}|ep?\s*\d{1,4}|第\s*\d{1,4}\s*[话集]|[0-9]{1,4}\s*[话集])\b/gi, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAutoTagVideo(payload) {
  const name = typeof payload?.name === "string" ? payload.name.trim().slice(0, 180) : "";
  const relativePath = typeof payload?.relativePath === "string" ? payload.relativePath.trim().slice(0, 320) : "";
  const mediaRootLabel = typeof payload?.mediaRootLabel === "string" ? payload.mediaRootLabel.trim().slice(0, 80) : "";
  if (!name && !relativePath) return null;
  const size = Number(payload?.size);
  const duration = Number(payload?.duration);
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  return {
    id: typeof payload?.id === "string" ? payload.id.trim().slice(0, 120) : "",
    name,
    relativePath,
    mediaRootLabel,
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : undefined,
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
  };
}

export function createDuckDuckGoAutoTagQuery(video) {
  const pathParts = video.relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const directories = pathParts.slice(0, -1).slice(-2).map(cleanSearchTerm).filter(Boolean);
  const title = cleanSearchTerm(withoutExtension(video.name || pathParts.at(-1) || ""));
  const pieces = [title, ...directories, cleanSearchTerm(video.mediaRootLabel)].filter(Boolean);
  const seen = new Set();
  return pieces
    .filter((piece) => {
      const key = piece.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ")
    .slice(0, 180);
}

function normalizeDuckDuckGoUrl(url) {
  const decoded = decodeHtmlEntities(url);
  try {
    const parsed = new URL(decoded, "https://duckduckgo.com");
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.href;
  } catch {
    return decoded;
  }
}

export function parseDuckDuckGoHtmlResults(html, limit = autoTagSearchResultLimit) {
  const results = [];
  const resultPattern = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>|<div[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
  let match;
  while ((match = resultPattern.exec(html)) && results.length < limit) {
    const title = stripHtml(match[2]).slice(0, 160);
    const url = normalizeDuckDuckGoUrl(match[1]).slice(0, 400);
    const snippet = stripHtml(match[3]).slice(0, 260);
    if (!title || !url || results.some((result) => result.url === url)) continue;
    results.push({ title, url, snippet });
  }
  return results;
}

export async function searchDuckDuckGoForAutoTags(query, options = {}) {
  const requestExternalTextImpl = options.requestExternalTextImpl || requestExternalText;
  const trimmedQuery = typeof query === "string" ? query.trim().slice(0, 180) : "";
  if (!trimmedQuery) return [];
  const html = await requestExternalTextImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmedQuery)}`, {
    accept: "text/html,*/*",
    userAgent: "local-web-player/0.1 (+https://duckduckgo.com)",
    timeoutMs: 10000,
  });
  return parseDuckDuckGoHtmlResults(html, autoTagSearchResultLimit);
}

function normalizeDuplicateNameSimilarityPairs(source) {
  const pairs = Array.isArray(source) ? source : [];
  return pairs
    .map((pair) => {
      const id = typeof pair?.id === "string" ? pair.id.trim().slice(0, 80) : "";
      const aName = typeof pair?.a?.name === "string" ? pair.a.name.trim().slice(0, 160) : "";
      const bName = typeof pair?.b?.name === "string" ? pair.b.name.trim().slice(0, 160) : "";
      const aPath = typeof pair?.a?.relativePath === "string" ? pair.a.relativePath.trim().slice(0, 260) : "";
      const bPath = typeof pair?.b?.relativePath === "string" ? pair.b.relativePath.trim().slice(0, 260) : "";
      const localScore = Number(pair?.localScore);
      if (!id || !aName || !bName) return null;
      return {
        id,
        aName,
        bName,
        aPath,
        bPath,
        localScore: Number.isFinite(localScore) ? Math.max(0, Math.min(100, Math.round(localScore))) : 0,
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

export async function scoreDuplicateNameSimilarityWithAi(env, payload, options = {}) {
  const callDeepSeekImpl = options.callDeepSeekImpl || callDeepSeek;
  const pairs = normalizeDuplicateNameSimilarityPairs(payload?.pairs);
  if (!pairs.length || !env.DEEPSEEK_API_KEY) return { scores: [] };

  const catalog = pairs
    .map(
      (pair, index) =>
        `${index + 1}. id=${JSON.stringify(pair.id)} | localScore=${pair.localScore} | A name=${pair.aName} | A path=${pair.aPath || "-"} | B name=${pair.bName} | B path=${pair.bPath || "-"}`,
    )
    .join("\n");

  const raw = await callDeepSeekImpl(
    env,
    [
      {
        role: "system",
        content:
          "你是本地视频文件名相似度评估器。只比较候选对中的 A/B 文件名和路径文本，判断是否像同一个视频的不同命名。返回严格 JSON：{\"scores\":[{\"id\":\"候选 id\",\"similarity\":0-100}]}。similarity 是百分比整数，0 表示完全不像，100 表示几乎确定同一视频。不要返回候选外 id，不要解释。",
      },
      {
        role: "user",
        content: `请评估这些候选视频对的名称相似度：\n${catalog}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const pairIds = new Set(pairs.map((pair) => pair.id));
  const seenIds = new Set();
  const scores = [];
  const rawScores = Array.isArray(parsed?.scores) ? parsed.scores : [];
  for (const item of rawScores) {
    const id = typeof item?.id === "string" ? item.id : "";
    const similarity = Number(item?.similarity);
    if (!pairIds.has(id) || seenIds.has(id) || !Number.isFinite(similarity) || similarity < 0 || similarity > 100) continue;
    seenIds.add(id);
    scores.push({ id, similarity: Math.round(similarity) });
  }
  return { scores };
}

export async function searchLibraryWithAi(env, payload, options = {}) {
  const callDeepSeekImpl = options.callDeepSeekImpl || callDeepSeek;
  const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 300) : "";
  const candidates = normalizeLibrarySearchCandidates(payload?.candidates);
  if (!query) throw new Error("Search query is required.");
  if (!candidates.length) throw new Error("Library candidates are required.");

  const catalog = candidates
    .map(
      (candidate, index) =>
        `${index + 1}. id=${JSON.stringify(candidate.id)} | series=${candidate.seriesTitle || "未分组"} | name=${candidate.name} | path=${candidate.relativePath} | tags=${candidate.tags.join(", ") || "无"} | progress=${candidate.progressLabel || "未知"} | favorite=${candidate.isFavorite ? "yes" : "no"} | completed=${candidate.isCompleted ? "yes" : "no"}`,
    )
    .join("\n");

  const raw = await callDeepSeekImpl(
    env,
    [
      {
        role: "system",
        content:
          "你是本地片库搜索助手。搜索范围是用户提供的当前媒体模式候选视频，不是当前继续观看条目。只能从候选视频中选择，不能编造片名或使用候选外内容。answer 只能解释 matchIds 中已选中的条目；如果没有明确匹配，answer 写“AI 未找到明确匹配”。请返回严格 JSON：{\"answer\":\"简短中文理由\",\"matchIds\":[\"候选 id\"]}。matchIds 最多 5 个。",
      },
      {
        role: "user",
        content: `搜索需求：${query}\n\n候选片库：\n${catalog}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const matchIds = Array.isArray(parsed?.matchIds)
    ? parsed.matchIds.filter((id) => typeof id === "string" && candidateIds.has(id)).slice(0, 5)
    : [];
  const answer = normalizeAiLibrarySearchAnswer(parsed, matchIds);
  return { answer, matchIds };
}

export async function suggestTagMergeWithAi(env, payload, options = {}) {
  const callDeepSeekImpl = options.callDeepSeekImpl || callDeepSeek;
  const newTags = Array.isArray(payload?.newTags)
    ? payload.newTags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 12)
    : [];
  const existingTags = Array.isArray(payload?.existingTags)
    ? payload.existingTags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 80)
    : [];
  if (!newTags.length || !existingTags.length) return {};

  const raw = await callDeepSeekImpl(
    env,
    [
      {
        role: "system",
        content:
          "你是视频标签整理助手。只能判断用户给出的新标签是否和已有标签语义相同或非常接近。返回严格 JSON：{\"newTag\":\"新标签\",\"existingTag\":\"已有标签\",\"reason\":\"简短中文原因\"}。如果没有明确合并建议，返回 {}。",
      },
      {
        role: "user",
        content: `新标签：${newTags.join("、")}\n已有标签：${existingTags.join("、")}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const newTag = typeof parsed?.newTag === "string" && newTags.includes(parsed.newTag) ? parsed.newTag : "";
  const existingTag =
    typeof parsed?.existingTag === "string" && existingTags.includes(parsed.existingTag) ? parsed.existingTag : "";
  if (!newTag || !existingTag) return {};
  return {
    newTag,
    existingTag,
    reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 120) : "",
  };
}

export async function suggestAutoTagsWithAi(env, payload, options = {}) {
  const callDeepSeekImpl = options.callDeepSeekImpl || callDeepSeek;
  const searchDuckDuckGoImpl = options.searchDuckDuckGoImpl || searchDuckDuckGoForAutoTags;
  const video = normalizeAutoTagVideo(payload);
  const existingTags = parseTagList(payload?.existingTags, 80);
  const libraryTags = parseTagList(payload?.libraryTags, 120);
  if (!video) throw new Error("Video metadata is required.");
  if (!env.DEEPSEEK_API_KEY) return { tags: [], summary: "AI 未配置，无法生成自动标签。", sources: [] };

  const query = createDuckDuckGoAutoTagQuery(video);
  let searchResults = [];
  if (query) {
    try {
      searchResults = await searchDuckDuckGoImpl(query);
    } catch {
      searchResults = [];
    }
  }
  const sources = searchResults.map((result) => ({ title: result.title, url: result.url }));
  const searchCatalog = searchResults.length
    ? searchResults
        .map((result, index) => `${index + 1}. ${result.title}\nURL: ${result.url}\n摘要: ${result.snippet || "无"}`)
        .join("\n\n")
    : "DuckDuckGo 没有返回可用结果。";

  const metadata = [
    `文件名: ${video.name || "-"}`,
    `相对路径: ${video.relativePath || "-"}`,
    `媒体根: ${video.mediaRootLabel || "-"}`,
    `大小: ${video.size ?? "未知"}`,
    `时长秒: ${video.duration ?? "未知"}`,
    `分辨率: ${video.width && video.height ? `${video.width}x${video.height}` : "未知"}`,
    `已有标签: ${existingTags.join("、") || "无"}`,
    `片库常见标签: ${libraryTags.slice(0, 80).join("、") || "无"}`,
    `DuckDuckGo 查询: ${query || "-"}`,
  ].join("\n");

  const raw = await callDeepSeekImpl(
    env,
    [
      {
        role: "system",
        content:
          "你是本地视频自动标签助手。只能基于用户提供的视频元信息和 DuckDuckGo 搜索结果生成标签，可以提出片库内不存在的新标签。返回严格 JSON：{\"tags\":[\"标签\"],\"summary\":\"简短中文依据\"}。tags 只能是适合片库筛选的中文或常用短标签，3 到 8 个，单个不超过 20 字。不要返回路径、文件扩展名、集数编号、清晰度、编码、无意义人名乱码或当前视频已有标签。没有把握时返回空数组。",
      },
      {
        role: "user",
        content: `视频元信息：\n${metadata}\n\nDuckDuckGo 搜索结果：\n${searchCatalog}`,
      },
    ],
    { responseFormat: { type: "json_object" } },
  );
  const parsed = parseAiJsonObject(raw) ?? {};
  const existingKeys = new Set(existingTags.map(normalizeTagKey).filter(Boolean));
  const blockedKeys = new Set(
    [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "wmv",
      "flv",
      "1080p",
      "720p",
      "2160p",
      "4k",
      "x264",
      "x265",
      "hevc",
      "avc",
    ].map(normalizeTagKey),
  );
  const seenKeys = new Set();
  const tags = [];
  const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
  for (const tag of rawTags) {
    if (typeof tag !== "string") continue;
    const normalizedTag = tag.trim().replace(/\s+/g, " ").slice(0, 20);
    const key = normalizeTagKey(normalizedTag);
    if (!key || existingKeys.has(key) || seenKeys.has(key) || blockedKeys.has(key)) continue;
    if (/^[\d._-]+$/.test(normalizedTag) || /\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(normalizedTag)) continue;
    seenKeys.add(key);
    tags.push(normalizedTag);
    if (tags.length >= 8) break;
  }

  return {
    tags,
    summary: typeof parsed?.summary === "string" ? parsed.summary.trim().slice(0, 180) : "",
    sources,
  };
}
