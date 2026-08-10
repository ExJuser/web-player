import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const resolver = await importTsModule(new URL("../src/mosaicTargetResolver.ts", import.meta.url));

const video = {
  id: "video",
  mediaRootId: "root",
  relativePath: "movie.mp4",
  size: 100,
  lastModified: 200,
};

test("prefers a generated server target over browser and fallback sources", async () => {
  const serverBlob = new Blob(["server"]);
  let browserCalls = 0;
  const result = await resolver.resolveMosaicVideoTarget({
    createBrowserTarget: async () => {
      browserCalls += 1;
      return new Blob(["browser"]);
    },
    fetchTarget: async (url) => {
      assert.equal(url, "/generated-target");
      return new Response(serverBlob, { status: 200 });
    },
    generateServerTarget: async () => "/generated-target",
    signal: new AbortController().signal,
    sourceUrl: "/fallback",
    video,
  });

  assert.equal(result.blob.size, serverBlob.size);
  assert.equal(result.origin, "server");
  assert.equal(browserCalls, 0);
});

test("falls back to browser generation when the server target fails", async () => {
  const browserBlob = new Blob(["browser"]);
  const result = await resolver.resolveMosaicVideoTarget({
    createBrowserTarget: async () => browserBlob,
    fetchTarget: async () => {
      throw new Error("fallback should not be fetched");
    },
    generateServerTarget: async () => {
      throw new Error("server unavailable");
    },
    signal: new AbortController().signal,
    sourceUrl: "/fallback",
    video,
  });

  assert.equal(result.blob, browserBlob);
  assert.equal(result.origin, "browser");
});

test("uses the existing source image when higher-quality targets are unavailable", async () => {
  const fallbackBlob = new Blob(["fallback"]);
  const result = await resolver.resolveMosaicVideoTarget({
    createBrowserTarget: async () => null,
    fetchTarget: async (url) => {
      assert.equal(url, "/fallback");
      return new Response(fallbackBlob, { status: 200 });
    },
    generateServerTarget: async () => "",
    signal: new AbortController().signal,
    sourceUrl: "/fallback",
    video,
  });

  assert.equal(result.origin, "fallback");
  assert.equal(result.blob.size, fallbackBlob.size);
});

test("continues to the source image after a rejected server response and browser error", async () => {
  const fallbackBlob = new Blob(["fallback"]);
  const requestedUrls = [];
  const result = await resolver.resolveMosaicVideoTarget({
    createBrowserTarget: async () => {
      throw new Error("browser decode failed");
    },
    fetchTarget: async (url) => {
      requestedUrls.push(url);
      return url === "/generated-target"
        ? new Response(null, { status: 503 })
        : new Response(fallbackBlob, { status: 200 });
    },
    generateServerTarget: async () => "/generated-target",
    signal: new AbortController().signal,
    sourceUrl: "/fallback",
    video,
  });

  assert.deepEqual(requestedUrls, ["/generated-target", "/fallback"]);
  assert.equal(result.origin, "fallback");
  assert.equal(result.blob.size, fallbackBlob.size);
});

test("preserves abort failures instead of continuing to lower-quality fallbacks", async () => {
  const controller = new AbortController();
  controller.abort();
  let browserCalls = 0;

  await assert.rejects(
    resolver.resolveMosaicVideoTarget({
      createBrowserTarget: async () => {
        browserCalls += 1;
        return null;
      },
      fetchTarget: async () => new Response(null, { status: 404 }),
      generateServerTarget: async () => {
        throw new DOMException("Aborted", "AbortError");
      },
      signal: controller.signal,
      sourceUrl: "/fallback",
      video,
    }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(browserCalls, 0);
});
