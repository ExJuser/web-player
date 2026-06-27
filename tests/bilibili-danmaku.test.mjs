import assert from "node:assert/strict";
import test from "node:test";

import { createBilibiliDanmakuService, decodeHtmlEntities } from "../server/bilibiliDanmaku.mjs";

function createTestService(overrides = {}) {
  return createBilibiliDanmakuService({
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
    requestExternalText: async () => {
      throw new Error("unexpected text request");
    },
    ...overrides,
  });
}

test("decodeHtmlEntities handles Bilibili XML text entities", () => {
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry &lt;3 &quot;OK&quot; &#39;yes&#39;"), "Tom & Jerry <3 \"OK\" 'yes'");
});

test("parseBilibiliXmlDanmaku creates normalized comments with stable bilibili ids", () => {
  const service = createTestService({
    dedupeDanmakuComments: (comments) => comments.slice(0, 1),
  });

  const comments = service.parseBilibiliXmlDanmaku(`
    <i>
      <d p="12.5,1,25,16777215,0,0,hash-a,abc123">第一条 &amp; 弹幕</d>
      <d p="12.5,1,25,16777215,0,0,hash-a,abc123">重复弹幕</d>
    </i>
  `);

  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0], {
    id: "bilibili:abc123",
    time: 12.5,
    mode: "1",
    color: "16777215",
    text: "第一条 & 弹幕",
  });
});

test("resolveBilibiliCid returns cid links without remote lookup", async () => {
  const service = createTestService();

  const result = await service.resolveBilibiliCid({
    kind: "cid",
    value: "456",
    url: "https://www.bilibili.com/video/BV1",
  });

  assert.deepEqual(result, { cid: "456", title: "Bilibili CID 456" });
});

test("resolveBilibiliCid uses the matching ep entry and sends the referer", async () => {
  const calls = [];
  const service = createTestService({
    requestExternalJson: async (url, options) => {
      calls.push({ url, options });
      return {
        result: {
          title: "番剧标题",
          episodes: [
            { id: 1, cid: 100, title: "错集" },
            { id: 2, cid: 200, long_title: "目标集" },
          ],
        },
      };
    },
  });

  const result = await service.resolveBilibiliCid({
    kind: "ep",
    value: "2",
    url: "https://www.bilibili.com/bangumi/play/ep2",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.bilibili.com/pgc/view/web/season?ep_id=2");
  assert.equal(calls[0].options.referer, "https://www.bilibili.com/bangumi/play/ep2");
  assert.deepEqual(result, { cid: "200", title: "目标集" });
});

test("fetchBilibiliDanmaku falls back to the second XML endpoint after an empty response", async () => {
  const calls = [];
  const service = createTestService({
    requestExternalText: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return "";
      return '<i><d p="1,1,25,16777215,0,0,hash,danmaku-id">hello</d></i>';
    },
  });

  const record = await service.fetchBilibiliDanmaku({
    kind: "cid",
    value: "9988",
    url: "https://comment.bilibili.com/9988.xml",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://comment.bilibili.com/9988.xml");
  assert.equal(calls[1].url, "https://api.bilibili.com/x/v1/dm/list.so?oid=9988");
  assert.equal(calls[0].options.accept, "application/xml,text/xml,text/plain,*/*");
  assert.equal(calls[0].options.referer, "https://comment.bilibili.com/9988.xml");
  assert.equal(record.provider, "bilibili");
  assert.equal(record.title, "Bilibili CID 9988");
  assert.equal(record.sourceUrl, "https://comment.bilibili.com/9988.xml");
  assert.deepEqual(record.comments, [
    {
      id: "bilibili:danmaku-id",
      time: 1,
      mode: "1",
      color: "16777215",
      text: "hello",
    },
  ]);
});

test("fetchBilibiliDanmaku includes endpoint errors when both XML requests fail", async () => {
  const service = createTestService({
    requestExternalText: async (url) => {
      if (url.includes("comment.bilibili.com")) return "";
      throw new Error("network down");
    },
  });

  await assert.rejects(
    () =>
      service.fetchBilibiliDanmaku({
        kind: "cid",
        value: "9988",
        url: "https://comment.bilibili.com/9988.xml",
      }),
    /空响应.*network down/,
  );
});
