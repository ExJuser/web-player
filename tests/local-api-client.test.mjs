import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const localApiClient = await importTsModule(new URL("../src/localApiClient.ts", import.meta.url));

function streamFromTextChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

test("createLocalApiHeaders sets accept and json content type for request bodies", () => {
  assert.deepEqual(localApiClient.createLocalApiHeaders("application/json"), { Accept: "application/json" });
  assert.deepEqual(localApiClient.createLocalApiHeaders("application/x-ndjson", { body: "{}" }), {
    Accept: "application/x-ndjson",
    "Content-Type": "application/json",
  });
});

test("createLocalApiHeaders lets explicit headers override defaults", () => {
  assert.deepEqual(
    localApiClient.createLocalApiHeaders("application/json", {
      body: "{}",
      headers: { Accept: "text/plain", "Content-Type": "text/plain", "X-Test": "1" },
    }),
    { Accept: "text/plain", "Content-Type": "text/plain", "X-Test": "1" },
  );
});

test("handleLocalApiStreamLine parses events and ignores blank lines", () => {
  const events = [];

  localApiClient.handleLocalApiStreamLine("  ", (event) => events.push(event));
  localApiClient.handleLocalApiStreamLine('{"type":"delta","text":"hi"}', (event) => events.push(event));

  assert.deepEqual(events, [{ type: "delta", text: "hi" }]);
});

test("handleLocalApiStreamLine converts error events to exceptions", () => {
  assert.throws(
    () => localApiClient.handleLocalApiStreamLine('{"type":"error","error":"failed"}', () => {}),
    /failed/,
  );
});

test("readLocalApiStream reads ndjson events split across chunks", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "/api/stream");
      assert.equal(init.headers.Accept, "application/x-ndjson");
      assert.equal(init.headers["Content-Type"], "application/json");
      return {
        ok: true,
        body: streamFromTextChunks(['{"type":"delta","text":"a"}\n{"type":"delta"', ',"text":"b"}\n']),
      };
    };

    await localApiClient.readLocalApiStream("/api/stream", { method: "POST", body: "{}" }, (event) => events.push(event));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(events, [
    { type: "delta", text: "a" },
    { type: "delta", text: "b" },
  ]);
});

test("readLocalApiErrorMessage uses local api error payloads", async () => {
  const message = await localApiClient.readLocalApiErrorMessage({
    statusText: "Internal Server Error",
    async json() {
      return { error: "具体错误" };
    },
  });

  assert.equal(message, "具体错误");
});

test("readLocalApiErrorMessage falls back to status text", async () => {
  const invalidJsonMessage = await localApiClient.readLocalApiErrorMessage({
    statusText: "Bad Gateway",
    async json() {
      throw new Error("not json");
    },
  });
  const emptyPayloadMessage = await localApiClient.readLocalApiErrorMessage({
    statusText: "Bad Request",
    async json() {
      return {};
    },
  });

  assert.equal(invalidJsonMessage, "Bad Gateway");
  assert.equal(emptyPayloadMessage, "Bad Request");
});
