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

test("scores tag search matches higher than loose text matches", () => {
  assert.equal(tagUtils.getTagSearchScore("美腿", ["美腿", "剧情"]), 32);
  assert.equal(tagUtils.getTagSearchScore("腿玩年", ["美腿"]), 28);
  assert.equal(tagUtils.getTagSearchScore("长镜", ["长镜头"]), 20);
  assert.equal(tagUtils.getTagSearchScore("悬疑", ["美腿"]), 0);
});

test("requires every selected tag filter to match by normalized key", () => {
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕"], []), true);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕", "长镜头"], ["剧情", "ＡＩ字幕"]), true);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情", "AI-字幕"], ["剧情", "长镜头"]), false);
  assert.equal(tagUtils.doTagsSatisfyAllFilters(["剧情"], ["  ", "剧情"]), true);
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
