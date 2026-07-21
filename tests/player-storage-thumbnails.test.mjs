import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const storage = await importTsModule(new URL("../src/playerStorage.ts", import.meta.url));

test("cached thumbnails are resolved through HEAD without creating blobs", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: requests.length === 1 ? 404 : 200 });
    };

    const thumbnailUrl = await storage.findCachedThumbnailUrl("global", "root|video.mp4|100|200");

    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ init }) => init.method === "HEAD"));
    assert.equal(thumbnailUrl, requests[1].url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server thumbnail generation posts media identity and returns the stable cache url", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const thumbnailUrl = await storage.generateServerThumbnail(
      "global",
      "root|video.mp4|100|200",
      "root",
      "folder/video.mp4",
    );

    assert.equal(request.init.method, "POST");
    assert.deepEqual(JSON.parse(request.init.body), { rootId: "root", relativePath: "folder/video.mp4" });
    assert.equal(request.url, `${thumbnailUrl}/generate`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
