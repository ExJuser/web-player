import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { maxRequestBodyBytes, parseJsonBody, readBody, sanitizeStorageId } from "../server/requestUtils.mjs";

test("sanitizeStorageId accepts stable storage ids", () => {
  assert.equal(sanitizeStorageId("library-01_~.cache"), "library-01_~.cache");
  assert.equal(sanitizeStorageId("a".repeat(240)), "a".repeat(240));
});

test("sanitizeStorageId rejects unsafe or overlong ids", () => {
  assert.equal(sanitizeStorageId(""), null);
  assert.equal(sanitizeStorageId("../library"), null);
  assert.equal(sanitizeStorageId("library/id"), null);
  assert.equal(sanitizeStorageId("a".repeat(241)), null);
});

test("readBody resolves concatenated request chunks", async () => {
  const request = Readable.from([Buffer.from("hello "), Buffer.from("world")]);

  const body = await readBody(request);

  assert.equal(body.toString("utf8"), "hello world");
});

test("readBody rejects bodies above the configured size limit", async () => {
  const request = Readable.from([Buffer.alloc(maxRequestBodyBytes + 1)]);

  await assert.rejects(() => readBody(request), /too large/);
});

test("parseJsonBody reads utf8 JSON request bodies", async () => {
  const request = Readable.from([Buffer.from('{"title":"动画","count":2}')]);

  assert.deepEqual(await parseJsonBody(request), { title: "动画", count: 2 });
});
