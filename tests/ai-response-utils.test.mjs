import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAiLibrarySearchAnswer,
  normalizeLibrarySearchCandidates,
  parseAiJsonObject,
} from "../server/aiResponseUtils.mjs";

test("parseAiJsonObject parses direct JSON and JSON embedded in prose", () => {
  assert.deepEqual(parseAiJsonObject('{"ok":true}'), { ok: true });
  assert.deepEqual(parseAiJsonObject('模型回复：{"answer":"命中","matchIds":["a"]}。'), {
    answer: "命中",
    matchIds: ["a"],
  });
  assert.equal(parseAiJsonObject("not json"), null);
  assert.equal(parseAiJsonObject("{broken"), null);
});

test("normalizeAiLibrarySearchAnswer unwraps nested JSON answers and keeps plain text", () => {
  assert.equal(
    normalizeAiLibrarySearchAnswer({ answer: '{"answer":"最终理由"}' }, ["video-1"]),
    "最终理由",
  );
  assert.equal(normalizeAiLibrarySearchAnswer({ answer: "  直接理由  " }, ["video-1"]), "直接理由");
});

test("normalizeAiLibrarySearchAnswer uses stable fallback text for empty matches and JSON-only answers", () => {
  assert.equal(normalizeAiLibrarySearchAnswer({ answer: "自由解释" }, []), "AI 未找到明确匹配，已保留本地结果。");
  assert.equal(normalizeAiLibrarySearchAnswer({ answer: "{}" }, ["video-1"]), "AI 已匹配到本地条目。");
});

test("normalizeLibrarySearchCandidates filters invalid rows and bounds large text fields", () => {
  const longText = "x".repeat(500);
  const candidates = normalizeLibrarySearchCandidates([
    {
      id: longText,
      name: longText,
      relativePath: longText,
      seriesTitle: longText,
      tags: ["  tag-a  ", "", longText, 123],
      progressLabel: longText,
      isFavorite: 1,
      isCompleted: "",
    },
    { id: "missing-name" },
    { name: "missing-id" },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id.length, 240);
  assert.equal(candidates[0].name.length, 240);
  assert.equal(candidates[0].relativePath.length, 360);
  assert.equal(candidates[0].seriesTitle.length, 160);
  assert.deepEqual(candidates[0].tags, ["tag-a", "x".repeat(40)]);
  assert.equal(candidates[0].progressLabel.length, 80);
  assert.equal(candidates[0].isFavorite, true);
  assert.equal(candidates[0].isCompleted, false);
});

test("normalizeLibrarySearchCandidates limits the catalog sent to the model", () => {
  const source = Array.from({ length: 100 }, (_, index) => ({
    id: `video-${index}`,
    name: `Video ${index}`,
  }));

  const candidates = normalizeLibrarySearchCandidates(source);

  assert.equal(candidates.length, 80);
  assert.equal(candidates.at(0).id, "video-0");
  assert.equal(candidates.at(-1).id, "video-79");
});
