import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const tagUtils = await importTsModule(new URL("../src/tagUtils.ts", import.meta.url));

test("splits multiple tags from common separators and removes normalized duplicates", () => {
  assert.deepEqual(
    tagUtils.parseTagInput("美腿 腿玩年,剧情，氛围、AI;  AI|长镜头"),
    ["美腿", "腿玩年", "剧情", "氛围", "AI", "长镜头"],
  );
});

test("extracts the active tag input segment", () => {
  assert.equal(tagUtils.getActiveTagInputSegment("剧情, 美"), "美");
  assert.equal(tagUtils.getActiveTagInputSegment("剧情 美腿 "), "");
});

test("normalizes tags for stable matching without replacing display text", () => {
  assert.equal(tagUtils.normalizeTagKey("  ＡＩ-字幕  "), "ai字幕");
  assert.equal(tagUtils.normalizeTagKey("美 腿"), "美腿");
});

test("suggests merging known semantic synonyms", () => {
  const suggestion = tagUtils.findTagMergeSuggestion("腿玩年", ["美腿"], {});
  assert.equal(suggestion?.existingTag, "美腿");
  assert.equal(suggestion?.newTag, "腿玩年");
  assert.equal(suggestion?.reason, "同义标签");
});

test("respects remembered keep decision for similar tags", () => {
  const decisions = {
    [tagUtils.createTagPairKey("腿玩年", "美腿")]: {
      from: "腿玩年",
      to: "美腿",
      decision: "keep",
      updatedAt: 1,
    },
  };
  assert.equal(tagUtils.findTagMergeSuggestion("腿玩年", ["美腿"], decisions), null);
});

test("detects near duplicate tags with fuzzy similarity", () => {
  const suggestion = tagUtils.findTagMergeSuggestion("长镜头感", ["长镜头"], {});
  assert.equal(suggestion?.existingTag, "长镜头");
  assert.equal(suggestion?.reason, "相似标签");
});

test("splits incoming tags by exact existing normalized matches", () => {
  assert.deepEqual(
    tagUtils.splitTagsByExistingMatch(["无码"], ["丝妹", "无码"]),
    { resolvedTags: ["无码"], unmatchedTags: [] },
  );
  assert.deepEqual(
    tagUtils.splitTagsByExistingMatch(["无码", "剧情"], ["无码"]),
    { resolvedTags: ["无码", "剧情"], unmatchedTags: ["剧情"] },
  );
  assert.deepEqual(
    tagUtils.splitTagsByExistingMatch(["ＡＩ-字幕"], ["AI字幕"]),
    { resolvedTags: ["AI字幕"], unmatchedTags: [] },
  );
});

test("scores tag search matches higher than loose text matches", () => {
  assert.equal(tagUtils.getTagSearchScore("美腿", ["美腿", "剧情"]), 32);
  assert.equal(tagUtils.getTagSearchScore("腿玩年", ["美腿"]), 28);
  assert.equal(tagUtils.getTagSearchScore("长镜", ["长镜头"]), 20);
  assert.equal(tagUtils.getTagSearchScore("悬疑", ["美腿"]), 0);
});

test("creates tag input suggestions from existing video tags", () => {
  assert.deepEqual(
    tagUtils.createTagInputSuggestions({
      query: "腿玩年",
      tagIndex: tagUtils.createTagSearchIndex({
        a: ["美腿", "剧情"],
        b: ["美女", "美腿", "腿玩年"],
        c: ["AI-字幕"],
      }),
      currentTags: ["美女"],
    }),
    [
      { key: "腿玩年", label: "腿玩年", count: 1 },
      { key: "美腿", label: "美腿", count: 2 },
    ],
  );
});

test("sorts tag input suggestions by match quality, usage, and label", () => {
  assert.deepEqual(
    tagUtils.createTagInputSuggestions({
      query: "黑",
      tagIndex: tagUtils.createTagSearchIndex({
        a: ["黑", "黑丝", "黑裙"],
        b: ["黑丝", "黑裙"],
        c: ["黑丝", "黑色"],
      }),
      currentTags: ["黑色"],
      limit: 3,
    }),
    [
      { key: "黑", label: "黑", count: 1 },
      { key: "黑丝", label: "黑丝", count: 3 },
      { key: "黑裙", label: "黑裙", count: 2 },
    ],
  );
});

test("finds Chinese tags by full pinyin, spaced pinyin, and initials", () => {
  const tagIndex = tagUtils.createTagSearchIndex({
    a: ["黑丝", "黑色", "护士", "AI-字幕"],
    b: ["黑丝"],
    c: ["黑丝"],
  });

  assert.equal(tagUtils.createTagInputSuggestions({
    query: "heisi",
    tagIndex,
    currentTags: [],
  })[0]?.label, "黑丝");
  assert.equal(tagUtils.createTagInputSuggestions({
    query: "hei si",
    tagIndex,
    currentTags: [],
  })[0]?.label, "黑丝");
  assert.equal(tagUtils.createTagInputSuggestions({
    query: "hs",
    tagIndex,
    currentTags: [],
  })[0]?.label, "黑丝");
  assert.equal(tagUtils.createTagInputSuggestions({
    query: "AI",
    tagIndex,
    currentTags: [],
  })[0]?.label, "AI-字幕");
});

test("requires every selected tag filter to match by normalized key", () => {
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕"], []), true);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕", "长镜头"], ["剧情", "ＡＩ字幕"]), true);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕"], ["剧情", "长镜头"]), false);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情"], ["  ", "剧情"]), true);
});

test("derives a Chinese subtitle system tag only from same-directory translated subtitles", () => {
  const videos = [
    { id: "video-1", relativePath: "Show/E01.mkv", mediaRootId: "root-1" },
    { id: "video-2", relativePath: "Show/E02.mkv", mediaRootId: "root-1" },
  ];
  const subtitles = [
    { id: "subtitle-1", relativePath: "Show/E01-translated.srt", mediaRootId: "root-1", url: "" },
    { id: "subtitle-2", relativePath: "Show/E02.srt", mediaRootId: "root-1", url: "" },
    { id: "subtitle-3", relativePath: "Other/E02-translated.srt", mediaRootId: "root-1", url: "" },
  ];

  assert.deepEqual(tagUtils.buildSubtitleSystemVideoTags(videos, subtitles), {
    "video-1": ["中文字幕"],
  });
});

test("merges same-name user and system tags as one searchable tag", () => {
  assert.deepEqual(
    tagUtils.mergeVideoTagStores(
      { "video-1": ["中文字幕", "剧情"], "video-2": ["中文字幕"] },
      { "video-1": ["中文字幕"] },
    ),
    { "video-1": ["中文字幕", "剧情"], "video-2": ["中文字幕"] },
  );
});

test("builds global tag usage stats by tagged video count", () => {
  assert.deepEqual(
    tagUtils.buildGlobalTagUsageStats({
      "root-a:video-1": ["好看", "美女", "好 看"],
      "root-a:video-2": ["美女", "剧情"],
      "root-b:video-3": ["好看", "AI-字幕"],
      "root-b:video-4": ["  ", "ＡＩ字幕"],
    }),
    [
      { key: "好看", tag: "好看", videoCount: 2, videoIds: ["root-a:video-1", "root-b:video-3"] },
      { key: "美女", tag: "美女", videoCount: 2, videoIds: ["root-a:video-1", "root-a:video-2"] },
      { key: "ai字幕", tag: "AI-字幕", videoCount: 2, videoIds: ["root-b:video-3", "root-b:video-4"] },
      { key: "剧情", tag: "剧情", videoCount: 1, videoIds: ["root-a:video-2"] },
    ],
  );
});
