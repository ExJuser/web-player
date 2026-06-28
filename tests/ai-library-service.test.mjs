import assert from "node:assert/strict";
import test from "node:test";

import {
  createDuckDuckGoAutoTagQuery,
  parseDuckDuckGoHtmlResults,
  scoreDuplicateNameSimilarityWithAi,
  searchLibraryWithAi,
  suggestAutoTagsWithAi,
  suggestTagMergeWithAi,
} from "../server/aiLibraryService.mjs";

test("searchLibraryWithAi rejects missing query or candidates", async () => {
  await assert.rejects(
    () => searchLibraryWithAi({}, { query: "", candidates: [{ id: "a", name: "A" }] }),
    /Search query is required/,
  );
  await assert.rejects(
    () => searchLibraryWithAi({}, { query: "find", candidates: [] }),
    /Library candidates are required/,
  );
});

test("searchLibraryWithAi sends normalized candidates and keeps only valid match ids", async () => {
  const calls = [];
  const result = await searchLibraryWithAi(
    { DEEPSEEK_API_KEY: "secret" },
    {
      query: `  ${"找片".repeat(200)}  `,
      candidates: [
        {
          id: "video-1",
          name: "Episode 1",
          relativePath: "Series/Episode 1.mkv",
          seriesTitle: "Series",
          tags: ["  tag-a  "],
          progressLabel: "看过一半",
          isFavorite: true,
          isCompleted: false,
        },
        { id: "missing-name" },
      ],
    },
    {
      callDeepSeekImpl: async (env, messages, options) => {
        calls.push({ env, messages, options });
        return JSON.stringify({
          answer: "命中第一集",
          matchIds: ["video-1", "missing-name", "video-1", "other"],
        });
      },
    },
  );

  assert.deepEqual(result, { answer: "命中第一集", matchIds: ["video-1", "video-1"] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].env.DEEPSEEK_API_KEY, "secret");
  assert.deepEqual(calls[0].options, { responseFormat: { type: "json_object" } });
  assert.match(calls[0].messages[1].content, /搜索需求：找片/);
  assert.match(calls[0].messages[1].content, /id="video-1"/);
  assert.doesNotMatch(calls[0].messages[1].content, /missing-name/);
});

test("searchLibraryWithAi uses the no-match fallback when the model returns no valid ids", async () => {
  const result = await searchLibraryWithAi(
    {},
    { query: "find", candidates: [{ id: "video-1", name: "Episode 1" }] },
    {
      callDeepSeekImpl: async () => JSON.stringify({ answer: "自由解释", matchIds: ["not-a-candidate"] }),
    },
  );

  assert.deepEqual(result, {
    answer: "AI 未找到明确匹配，已保留本地结果。",
    matchIds: [],
  });
});

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

test("parseDuckDuckGoHtmlResults extracts bounded titles urls and snippets", () => {
  const html = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fshow&amp;rut=abc">Example &amp; Show</a>
      <a class="result__snippet">A <b>useful</b> result &amp; summary.</a>
    </div>
    <div class="result">
      <a class="result__a" href="https://example.org/other">Other</a>
      <div class="result__snippet">Second summary.</div>
    </div>
  `;

  assert.deepEqual(parseDuckDuckGoHtmlResults(html, 1), [
    {
      title: "Example & Show",
      url: "https://example.com/show",
      snippet: "A useful result & summary.",
    },
  ]);
});

test("createDuckDuckGoAutoTagQuery removes noisy filename metadata", () => {
  assert.equal(
    createDuckDuckGoAutoTagQuery({
      name: "[Group] My.Show.S01E02.1080p.x265.mkv",
      relativePath: "Anime/My Show/[Group] My.Show.S01E02.1080p.x265.mkv",
      mediaRootLabel: "Anime",
    }),
    "My Show Anime",
  );
});

test("suggestAutoTagsWithAi returns an empty response without AI config and skips search", async () => {
  let didSearch = false;
  const result = await suggestAutoTagsWithAi(
    {},
    { name: "Show.mkv", relativePath: "Anime/Show.mkv" },
    {
      searchDuckDuckGoImpl: async () => {
        didSearch = true;
        return [];
      },
    },
  );

  assert.equal(didSearch, false);
  assert.deepEqual(result, { tags: [], summary: "AI 未配置，无法生成自动标签。", sources: [] });
});

test("suggestAutoTagsWithAi sends metadata and search results then filters returned tags", async () => {
  const calls = [];
  const result = await suggestAutoTagsWithAi(
    { DEEPSEEK_API_KEY: "secret" },
    {
      id: "video-1",
      name: "Mystery Show 01.mkv",
      relativePath: "Anime/Mystery Show/Mystery Show 01.mkv",
      mediaRootLabel: "Anime",
      size: 12345,
      duration: 1440.4,
      width: 1920,
      height: 1080,
      existingTags: ["悬疑"],
      libraryTags: ["剧情", "动画"],
    },
    {
      searchDuckDuckGoImpl: async (query) => {
        calls.push({ query });
        return [
          {
            title: "Mystery Show - Wiki",
            url: "https://example.com/wiki",
            snippet: "A suspense animation series.",
          },
        ];
      },
      callDeepSeekImpl: async (_env, messages, options) => {
        calls.push({ messages, options });
        return JSON.stringify({
          tags: ["悬疑", "动画", "剧情", "1080p", "动画", "长篇系列", "x".repeat(30)],
          summary: "基于搜索结果。",
        });
      },
    },
  );

  assert.equal(calls[0].query, "Mystery Show 01 Anime Mystery Show");
  assert.deepEqual(calls[1].options, { responseFormat: { type: "json_object" } });
  assert.match(calls[1].messages[1].content, /文件名: Mystery Show 01\.mkv/);
  assert.match(calls[1].messages[1].content, /Mystery Show - Wiki/);
  assert.deepEqual(result, {
    tags: ["动画", "剧情", "长篇系列", "xxxxxxxxxxxxxxxxxxxx"],
    summary: "基于搜索结果。",
    sources: [{ title: "Mystery Show - Wiki", url: "https://example.com/wiki" }],
  });
});

test("suggestAutoTagsWithAi continues with metadata when web search fails", async () => {
  const result = await suggestAutoTagsWithAi(
    { DEEPSEEK_API_KEY: "secret" },
    { name: "Mystery Show.mkv", relativePath: "Anime/Mystery Show.mkv" },
    {
      searchDuckDuckGoImpl: async () => {
        throw new Error("远端请求超时（10 秒）。");
      },
      callDeepSeekImpl: async (_env, messages) => {
        assert.match(messages[1].content, /DuckDuckGo 没有返回可用结果。/);
        return JSON.stringify({ tags: ["动画", "剧情", "长篇系列"], summary: "基于文件名。" });
      },
    },
  );

  assert.deepEqual(result, {
    tags: ["动画", "剧情", "长篇系列"],
    summary: "基于文件名。",
    sources: [],
  });
});
