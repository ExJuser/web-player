import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const localConfigClient = await importTsModule(new URL("../src/localConfigClient.ts", import.meta.url));

test("normalizeClientLocalConfig adds default optional service configs", () => {
  const result = localConfigClient.normalizeClientLocalConfig({
    mediaRoots: [],
    ffmpeg: { ffmpeg: false, ffprobe: false },
    ai: { configured: false, model: "deepseek-chat" },
  });

  assert.deepEqual(result.bangumi, { configured: false, proxyConfigured: false });
  assert.deepEqual(result.lada, { available: false });
});

test("normalizeClientLocalConfig preserves existing bangumi config", () => {
  const result = localConfigClient.normalizeClientLocalConfig({
    mediaRoots: [],
    ffmpeg: { ffmpeg: true, ffprobe: true },
    ai: { configured: true, model: "deepseek-chat" },
    bangumi: { configured: true, proxyConfigured: true },
    lada: { available: true },
  });

  assert.deepEqual(result.bangumi, { configured: true, proxyConfigured: true });
  assert.deepEqual(result.lada, { available: true });
});

test("global media library does not auto-scan configured roots on page load", () => {
  assert.equal(
    localConfigClient.shouldAutoScanGlobalMediaLibrary({
      mediaRoots: [{ id: "anime", path: "D:/Anime", source: "local" }],
    }),
    false,
  );
});

test("server file access is available for local roots and browser roots with localPath", () => {
  assert.equal(localConfigClient.supportsServerFileAccess({ source: "local" }), true);
  assert.equal(localConfigClient.supportsServerFileAccess({ source: "browser", localPath: "D:/Anime" }), true);
  assert.equal(localConfigClient.supportsServerFileAccess({ source: "browser" }), false);
  assert.equal(localConfigClient.supportsServerFileAccess(null), false);
});
