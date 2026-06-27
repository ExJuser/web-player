export function parseAiJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function normalizeAiLibrarySearchAnswer(parsed, matchIds) {
  if (!matchIds.length) return "AI 未找到明确匹配，已保留本地结果。";
  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  const nested = parseAiJsonObject(answer);
  if (nested && typeof nested.answer === "string") {
    return normalizeAiLibrarySearchAnswer(nested, matchIds);
  }
  if (answer && !/^\s*\{[\s\S]*\}\s*$/.test(answer)) return answer.slice(0, 240);
  return matchIds.length ? "AI 已匹配到本地条目。" : "AI 未找到明确匹配，已保留本地结果。";
}

export function normalizeLibrarySearchCandidates(source) {
  const candidates = Array.isArray(source) ? source : [];
  return candidates
    .map((candidate) => ({
      id: typeof candidate?.id === "string" ? candidate.id.slice(0, 240) : "",
      name: typeof candidate?.name === "string" ? candidate.name.slice(0, 240) : "",
      relativePath: typeof candidate?.relativePath === "string" ? candidate.relativePath.slice(0, 360) : "",
      seriesTitle: typeof candidate?.seriesTitle === "string" ? candidate.seriesTitle.slice(0, 160) : "",
      tags: Array.isArray(candidate?.tags)
        ? candidate.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 40)).slice(0, 12)
        : [],
      progressLabel: typeof candidate?.progressLabel === "string" ? candidate.progressLabel.slice(0, 80) : "",
      isFavorite: Boolean(candidate?.isFavorite),
      isCompleted: Boolean(candidate?.isCompleted),
    }))
    .filter((candidate) => candidate.id && candidate.name)
    .slice(0, 80);
}
