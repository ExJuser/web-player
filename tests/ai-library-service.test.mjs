import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreDuplicateNameSimilarityWithAi,
  suggestTagMergeWithAi,
} from "../server/aiLibraryService.mjs";

test("suggestTagMergeWithAi returns an empty object without usable tag inputs", async () => {
  assert.deepEqual(await suggestTagMergeWithAi({}, { newTags: [], existingTags: ["旧"] }), {});
  assert.deepEqual(await suggestTagMergeWithAi({}, { newTags: ["新"], existingTags: [] }), {});
});

test("suggestTagMergeWithAi trims allowed tags and bounds the returned reason", async () => {
  const calls = [];
  const result = await suggestTagMergeWithAi(
    { DEEPSEEK_API_KEY: "secret" },
    {
      newTags: ["  新标签  ", "", "x".repeat(80)],
      existingTags: ["  旧标签  ", "y".repeat(80)],
    },
    {
      callDeepSeekImpl: async (_env, messages, options) => {
        calls.push({ messages, options });
        return JSON.stringify({
          newTag: "新标签",
          existingTag: "旧标签",
          reason: "r".repeat(200),
        });
      },
    },
  );

  assert.deepEqual(result, {
    newTag: "新标签",
    existingTag: "旧标签",
    reason: "r".repeat(120),
  });
  assert.deepEqual(calls[0].options, { responseFormat: { type: "json_object" } });
  assert.match(calls[0].messages[1].content, /新标签：新标签、xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/);
  assert.match(calls[0].messages[1].content, /已有标签：旧标签、yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy/);
});

test("suggestTagMergeWithAi discards model suggestions outside the provided tag sets", async () => {
  const result = await suggestTagMergeWithAi(
    {},
    { newTags: ["新标签"], existingTags: ["旧标签"] },
    {
      callDeepSeekImpl: async () =>
        JSON.stringify({
          newTag: "别的新标签",
          existingTag: "旧标签",
          reason: "接近",
        }),
    },
  );

  assert.deepEqual(result, {});
});

test("scoreDuplicateNameSimilarityWithAi sends bounded pairs and keeps valid scores", async () => {
  const calls = [];
  const result = await scoreDuplicateNameSimilarityWithAi(
    { DEEPSEEK_API_KEY: "secret" },
    {
      pairs: [
        {
          id: "pair-1",
          a: { name: "Show 01.mkv", relativePath: "A/Show 01.mkv" },
          b: { name: "Show Episode 1 copy.mp4", relativePath: "B/Show Episode 1 copy.mp4" },
          localScore: 70,
        },
        {
          id: "pair-2",
          a: { name: "Other.mkv", relativePath: "A/Other.mkv" },
          b: { name: "Different.mp4", relativePath: "B/Different.mp4" },
          localScore: 30,
        },
      ],
    },
    {
      callDeepSeekImpl: async (_env, messages, options) => {
        calls.push({ messages, options });
        return JSON.stringify({
          scores: [
            { id: "pair-1", similarity: 82.4 },
            { id: "pair-2", similarity: 101 },
            { id: "missing", similarity: 50 },
          ],
        });
      },
    },
  );

  assert.deepEqual(result, { scores: [{ id: "pair-1", similarity: 82 }] });
  assert.deepEqual(calls[0].options, { responseFormat: { type: "json_object" } });
  assert.match(calls[0].messages[1].content, /id="pair-1"/);
  assert.match(calls[0].messages[1].content, /localScore=70/);
});

test("scoreDuplicateNameSimilarityWithAi returns no scores without candidates or AI config", async () => {
  assert.deepEqual(await scoreDuplicateNameSimilarityWithAi({ DEEPSEEK_API_KEY: "secret" }, { pairs: [] }), { scores: [] });
  assert.deepEqual(
    await scoreDuplicateNameSimilarityWithAi(
      {},
      {
        pairs: [
          {
            id: "pair-1",
            a: { name: "A.mkv", relativePath: "A.mkv" },
            b: { name: "B.mkv", relativePath: "B.mkv" },
          },
        ],
      },
    ),
    { scores: [] },
  );
});
