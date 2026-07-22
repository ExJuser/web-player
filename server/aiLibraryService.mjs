import { parseAiJsonObject } from "./aiResponseUtils.mjs";
import { callDeepSeek } from "./deepSeekClient.mjs";

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
