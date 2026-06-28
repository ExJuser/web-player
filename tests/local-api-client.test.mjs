import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const localApiClient = await importTsModule(new URL("../src/localApiClient.ts", import.meta.url));

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
