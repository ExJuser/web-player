import assert from "node:assert/strict";
import test from "node:test";

import { formatRemoteFetchError, requestExternalJson, requestExternalText } from "../server/remoteFetch.mjs";

test("requestExternalText sends default headers and returns response text", async () => {
  const calls = [];
  const text = await requestExternalText("https://example.test/data", {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response("hello", { status: 200 });
    },
  });

  assert.equal(text, "hello");
  assert.equal(calls[0].url, "https://example.test/data");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Accept, "text/plain,*/*");
  assert.equal(calls[0].init.headers["User-Agent"], "local-web-player/0.1");
});

test("requestExternalText preserves custom request options", async () => {
  let requestInit = null;
  await requestExternalText("https://example.test/data", {
    method: "POST",
    accept: "application/xml",
    userAgent: "custom-agent",
    referer: "https://example.test/page",
    headers: { Authorization: "Bearer token" },
    fetchImpl: async (_url, init) => {
      requestInit = init;
      return new Response("<ok />", { status: 200 });
    },
  });

  assert.equal(requestInit.method, "POST");
  assert.equal(requestInit.headers.Accept, "application/xml");
  assert.equal(requestInit.headers["User-Agent"], "custom-agent");
  assert.equal(requestInit.headers.Referer, "https://example.test/page");
  assert.equal(requestInit.headers.Authorization, "Bearer token");
});

test("requestExternalText includes status and body excerpt for failed responses", async () => {
  await assert.rejects(
    () =>
      requestExternalText("https://example.test/fail", {
        fetchImpl: async () => new Response("not found body", { status: 404, statusText: "Not Found" }),
      }),
    /404: not found body/,
  );
});

test("requestExternalJson parses valid JSON and rejects invalid JSON", async () => {
  const payload = await requestExternalJson("https://example.test/json", {
    fetchImpl: async () => new Response('{"ok":true}', { status: 200 }),
  });
  assert.deepEqual(payload, { ok: true });

  await assert.rejects(
    () =>
      requestExternalJson("https://example.test/bad-json", {
        fetchImpl: async () => new Response("{", { status: 200 }),
      }),
    /Remote API returned invalid JSON/,
  );
});

test("formatRemoteFetchError returns stable messages for unknown errors", () => {
  assert.equal(formatRemoteFetchError(new Error("network down")), "network down");
  assert.equal(formatRemoteFetchError("plain"), "plain");
  assert.equal(formatRemoteFetchError(null), "远端请求失败。");
});
