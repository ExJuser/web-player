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

test("danmaku lanes are stable and stay within visible bounds", () => {
  const comment = {
    id: "comment-1",
    hash: "text-hash",
    time: 12.3456,
  };

  const lane = danmaku.getDanmakuLane(comment, 8);
  assert.equal(lane, danmaku.getDanmakuLane(comment, 8));
  assert.equal(lane >= 0 && lane < 8, true);
  assert.equal(danmaku.getDanmakuLane(comment, 1), 0);
});

test("danmaku display helpers format lanes and speeds", () => {
  assert.equal(danmaku.getDanmakuLaneCount(1, 24, 360), 13);
  assert.equal(danmaku.getDanmakuLaneCount(0.1, 12, 0), 4);
  assert.equal(danmaku.formatDanmakuLaneTop(2, 8, 0.75), "18.750%");
  assert.equal(danmaku.formatDanmakuLaneTop(0, 1, 0.75), "0%");

  assert.equal(danmaku.formatDanmakuSpeedLevel(16), "较快");
  assert.equal(danmaku.formatDanmakuSpeedLevel(20), "稍快");
  assert.equal(danmaku.formatDanmakuSpeedLevel(24), "中等");
  assert.equal(danmaku.formatDanmakuSpeedLevel(28), "稍慢");
  assert.equal(danmaku.formatDanmakuSpeedLevel(32), "较慢");
});

const createComment = (time) => ({
  id: `comment-${time}`,
  time,
  text: `弹幕 ${time}`,
  mode: "scroll",
  hash: `hash-${time}`,
  sourceLanguage: "zh-Hans",
});

test("selects active danmaku comments without future or expired entries", () => {
  const comments = [1, 3, 5, 7, 9, 12].map(createComment);

  assert.deepEqual(
    danmaku
      .getActiveDanmakuComments({ comments, currentTime: 8, durationSeconds: 4, displayLimit: 10 })
      .map((comment) => comment.time),
    [5, 7],
  );
});

test("limits active danmaku comments to the latest visible entries", () => {
  const comments = [1, 2, 3, 4, 5].map(createComment);

  assert.deepEqual(
    danmaku
      .getActiveDanmakuComments({ comments, currentTime: 5, durationSeconds: 10, displayLimit: 3 })
      .map((comment) => comment.time),
    [3, 4, 5],
  );
});
