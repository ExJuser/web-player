import assert from "node:assert/strict";
import test from "node:test";

import { parseHttpRange, sendJson, sendNdjson, writeStreamEvent } from "../server/httpResponses.mjs";

function createMockResponse() {
  const headers = {};
  return {
    headers,
    chunks: [],
    statusCode: 0,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(value) {
      this.ended = true;
      if (value !== undefined) this.body = value;
    },
    write(value) {
      this.chunks.push(value);
    },
  };
}

test("parseHttpRange accepts bounded byte ranges", () => {
  assert.deepEqual(parseHttpRange("bytes=0-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseHttpRange("bytes=10-", 100), { start: 10, end: 99 });
  assert.deepEqual(parseHttpRange("bytes=-9", 100), { start: 0, end: 9 });
  assert.deepEqual(parseHttpRange("bytes=-", 100), { start: 0, end: 99 });
});

test("parseHttpRange rejects invalid or out of bounds ranges", () => {
  assert.equal(parseHttpRange("items=0-9", 100), null);
  assert.equal(parseHttpRange("bytes=9-0", 100), null);
  assert.equal(parseHttpRange("bytes=0-100", 100), null);
});

test("sendJson writes json response headers and body", () => {
  const response = createMockResponse();

  sendJson(response, 201, { ok: true });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(response.body, "{\"ok\":true}");
});

test("ndjson helpers set streaming headers and append newline events", () => {
  const response = createMockResponse();

  sendNdjson(response, 200);
  writeStreamEvent(response, { type: "done" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/x-ndjson; charset=utf-8");
  assert.equal(response.headers["Cache-Control"], "no-cache, no-transform");
  assert.equal(response.headers["X-Accel-Buffering"], "no");
  assert.deepEqual(response.chunks, ["{\"type\":\"done\"}\n"]);
});
