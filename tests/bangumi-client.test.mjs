import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  createBodyBuffer,
  createProxyAuthorization,
  requestBangumiJson,
  requestJsonDirect,
  requestJsonViaHttpProxy,
} from "../server/bangumiClient.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

test("createBodyBuffer normalizes absent, buffer, and string bodies", () => {
  assert.equal(createBodyBuffer(null), null);
  assert.equal(createBodyBuffer(undefined), null);
  const buffer = Buffer.from("abc");
  assert.equal(createBodyBuffer(buffer), buffer);
  assert.deepEqual(createBodyBuffer("abc"), Buffer.from("abc"));
});

test("createProxyAuthorization builds decoded basic credentials only when username exists", () => {
  assert.deepEqual(createProxyAuthorization(new URL("http://proxy.test")), {});
  assert.deepEqual(createProxyAuthorization(new URL("http://user%40name:p%40ss@proxy.test")), {
    "Proxy-Authorization": `Basic ${Buffer.from("user@name:p@ss").toString("base64")}`,
  });
});

test("requestJsonDirect sends JSON requests and parses JSON responses", async () => {
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          method: request.method,
          body: Buffer.concat(chunks).toString("utf8"),
          contentLength: request.headers["content-length"],
          customHeader: request.headers["x-custom"],
        }),
      );
    });
  });
  const address = await listen(server);
  try {
    const payload = await requestJsonDirect(`http://127.0.0.1:${address.port}/api`, {
      method: "POST",
      headers: { "X-Custom": "yes" },
      body: "hello",
    });

    assert.deepEqual(payload, {
      method: "POST",
      body: "hello",
      contentLength: "5",
      customHeader: "yes",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("requestJsonDirect rejects failed and invalid JSON responses", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/bad-json") {
      response.end("{");
      return;
    }
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("server failed");
  });
  const address = await listen(server);
  try {
    await assert.rejects(
      () => requestJsonDirect(`http://127.0.0.1:${address.port}/fail`, { headers: {} }),
      /Bangumi API 500: server failed/,
    );
    await assert.rejects(
      () => requestJsonDirect(`http://127.0.0.1:${address.port}/bad-json`, { headers: {} }),
      /Bangumi returned invalid JSON/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("requestJsonViaHttpProxy rejects unsupported target or proxy schemes before opening sockets", async () => {
  assert.throws(
    () => requestJsonViaHttpProxy("http://api.example.test/path", { proxyUrl: "http://proxy.test", headers: {} }),
    /only support HTTPS targets/,
  );
  assert.throws(
    () => requestJsonViaHttpProxy("https://api.example.test/path", { proxyUrl: "https://proxy.test", headers: {} }),
    /must use the http:\/\/ scheme/,
  );
});

test("requestBangumiJson validates env and delegates stable API request options", async () => {
  await assert.rejects(() => requestBangumiJson({}, "/v0/search/subjects", {}), /Bangumi is not configured/);

  const calls = [];
  const result = await requestBangumiJson(
    {
      BANGUMI_USER_AGENT: " local-web-player ",
      BANGUMI_ACCESS_TOKEN: " token ",
      BANGUMI_LENS_PROXY: " http://127.0.0.1:8080 ",
    },
    "/v0/search/subjects?limit=5",
    { keyword: "title" },
    {
      requestJsonImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true };
      },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, "https://api.bgm.tv/v0/search/subjects?limit=5");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.proxyUrl, "http://127.0.0.1:8080");
  assert.equal(calls[0].options.timeoutMs, 12000);
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["User-Agent"], "local-web-player");
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  assert.equal(calls[0].options.body, JSON.stringify({ keyword: "title" }));
});
