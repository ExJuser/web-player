import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createAiStreamCachePath,
  createProgressRecapCache,
  createSubtitleAnswerCache,
  createSubtitleSummaryCache,
} from "../server/aiStreamCache.mjs";
import { hashValue } from "../server/hashUtils.mjs";

test("createAiStreamCachePath maps stream cache types to stable directories", () => {
  assert.equal(createAiStreamCachePath("D:\\data\\ai", "summary", "abc"), path.join("D:\\data\\ai", "summaries", "abc.json"));
  assert.equal(createAiStreamCachePath("D:\\data\\ai", "qa", "abc"), path.join("D:\\data\\ai", "qa", "abc.json"));
  assert.equal(createAiStreamCachePath("D:\\data\\ai", "recap", "abc"), path.join("D:\\data\\ai", "recaps", "abc.json"));
});

test("createSubtitleSummaryCache preserves the existing cache key format", () => {
  const result = createSubtitleSummaryCache("D:\\data\\ai", "Episode 1", "字幕文本");
  const expectedId = hashValue("summary|Episode 1|字幕文本");

  assert.deepEqual(result, {
    cacheId: expectedId,
    cachePath: path.join("D:\\data\\ai", "summaries", `${expectedId}.json`),
  });
});

test("createSubtitleAnswerCache preserves the existing cache key format", () => {
  const result = createSubtitleAnswerCache("D:\\data\\ai", "Episode 1", "发生了什么？", "[00:01 - 00:02]\n内容");
  const expectedId = hashValue("qa|Episode 1|发生了什么？|[00:01 - 00:02]\n内容");

  assert.deepEqual(result, {
    cacheId: expectedId,
    cachePath: path.join("D:\\data\\ai", "qa", `${expectedId}.json`),
  });
});

test("createProgressRecapCache preserves the existing cache key format", () => {
  const result = createProgressRecapCache("D:\\data\\ai", "Episode 1", "subtitle-a", 121, "已观看字幕");
  const expectedId = hashValue("recap|Episode 1|subtitle-a|121|已观看字幕");

  assert.deepEqual(result, {
    cacheId: expectedId,
    cachePath: path.join("D:\\data\\ai", "recaps", `${expectedId}.json`),
  });
});
