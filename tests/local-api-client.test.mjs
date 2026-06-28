import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const localApiClient = await importTsModule(new URL("../src/localApiClient.ts", import.meta.url));

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
