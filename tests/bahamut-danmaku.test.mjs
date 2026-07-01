import assert from "node:assert/strict";
import test from "node:test";

import { createBahamutDanmakuService } from "../server/bahamutDanmaku.mjs";

function createTestService(overrides = {}) {
  return createBahamutDanmakuService({
    createDanmakuComment: (input) => ({
      ...input,
      time: Number(input.time),
      text: String(input.text || "").trim(),
    }),
    dedupeDanmakuComments: (comments) => comments,
    formatRemoteFetchError: (error) => (error instanceof Error ? error.message : String(error)),
    requestExternalJson: async () => {
      throw new Error("unexpected json request");
    },
    ...overrides,
  });
}

test("parseBahamutDanmakuPayload normalizes comments and source counts", () => {
  const service = createTestService();

  const result = service.parseBahamutDanmakuPayload(
    {
      data: {
        danmu: [
          { sn: 1, time: 12, position: 0, color: "#FFFFFF", text: "繁體彈幕" },
          { sn: 2, time: 15, position: 1, color: "#FF0026", text: "上方彈幕" },
          { sn: 3, time: 18, position: 2, color: "#00C3FC", text: "下方彈幕" },
        ],
        totalCount: 8,
      },
    },
    "TW",
  );

  assert.equal(result.totalCount, 8);
  assert.deepEqual(result.comments, [
    { id: "bahamut:TW:1", time: 12, mode: 0, color: 16777215, text: "繁體彈幕" },
    { id: "bahamut:TW:2", time: 15, mode: 5, color: 16711718, text: "上方彈幕" },
    { id: "bahamut:TW:3", time: 18, mode: 4, color: 50172, text: "下方彈幕" },
  ]);
});

test("fetchBahamutDanmaku merges TW and HK source details", async () => {
  const calls = [];
  const service = createTestService({
    requestExternalJson: async (url, options) => {
      calls.push({ url, options });
      const geo = new URL(url).searchParams.get("geo");
      return {
        data: {
          totalCount: geo === "TW" ? 2 : 1,
          danmu: [{ sn: geo === "TW" ? 11 : 21, time: geo === "TW" ? 1 : 2, position: 0, color: "#FFFFFF", text: geo }],
        },
      };
    },
  });

  const record = await service.fetchBahamutDanmaku({
    provider: "bahamut",
    kind: "sn",
    value: "44108",
    url: "https://ani.gamer.com.tw/animeVideo.php?sn=44108",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.gamer.com.tw/anime/v1/danmu.php?videoSn=44108&geo=TW");
  assert.equal(calls[0].options.referer, "https://ani.gamer.com.tw/animeVideo.php?sn=44108");
  assert.equal(calls[0].options.headers.Origin, "https://ani.gamer.com.tw");
  assert.equal(calls[0].options.headers["X-Requested-With"], "XMLHttpRequest");
  assert.equal(record.provider, "bahamut");
  assert.equal(record.title, "巴哈姆特动画疯 SN 44108");
  assert.equal(record.comments.length, 2);
  assert.deepEqual(record.sourceBreakdown, [
    { provider: "bahamut", label: "巴哈姆特动画疯", sourceUrl: "https://ani.gamer.com.tw/animeVideo.php?sn=44108", commentCount: 3, children: [
      { provider: "bahamut", label: "台湾站", sourceUrl: "https://ani.gamer.com.tw/animeVideo.php?sn=44108", commentCount: 2 },
      { provider: "bahamut", label: "香港站", sourceUrl: "https://ani.gamer.com.tw/animeVideo.php?sn=44108", commentCount: 1 },
    ] },
  ]);
});
