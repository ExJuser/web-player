import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const danmaku = await importTsModule(new URL("../src/danmakuUtils.ts", import.meta.url));

test("danmaku url parser recognizes supported providers", () => {
  assert.deepEqual(danmaku.parseDanmakuUrl("BV1xx411c7mD"), {
    provider: "bilibili",
    kind: "bvid",
    value: "BV1xx411c7mD",
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
  });
  assert.equal(danmaku.parseDanmakuUrl("https://www.bilibili.com/bangumi/play/ep12345").kind, "ep");
  assert.deepEqual(danmaku.parseDanmakuUrl("cid:98765"), {
    provider: "bilibili",
    kind: "cid",
    value: "98765",
    url: "cid:98765",
  });
  assert.equal(danmaku.parseDanmakuUrl("https://ani.gamer.com.tw/animeVideo.php?sn=24680"), null);
});

test("danmaku comments normalize text, language and duplicates", () => {
  const first = danmaku.createDanmakuComment({ time: 1.04, text: " 繁體彈幕 ", mode: 1 });
  const second = danmaku.createDanmakuComment({ time: 1.03, text: "繁體彈幕", mode: 1 });

  assert.equal(first.sourceLanguage, "zh-Hant");
  assert.notEqual(first.simplifiedText, first.text);
  assert.equal(danmaku.dedupeDanmakuComments([first, second]).length, 1);
});

test("episode inference handles common anime filename forms", () => {
  assert.equal(danmaku.inferEpisodeNumber("[Group] Show - 03 [1080p].mkv"), 3);
  assert.equal(danmaku.inferEpisodeNumber("Show EP12.mkv"), 12);
  assert.equal(danmaku.inferEpisodeNumber("第 7 話.mp4"), 7);
});
