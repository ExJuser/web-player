import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const localConfigClient = await importTsModule(new URL("../src/localConfigClient.ts", import.meta.url));

test("normalizeClientLocalConfig adds a default bangumi config", () => {
  const result = localConfigClient.normalizeClientLocalConfig({
    mediaRoots: [],
    ffmpeg: { ffmpeg: false, ffprobe: false },
    ai: { configured: false, model: "deepseek-chat" },
  });

  assert.deepEqual(result.bangumi, { configured: false, proxyConfigured: false });
});

test("normalizeClientLocalConfig preserves existing bangumi config", () => {
  const result = localConfigClient.normalizeClientLocalConfig({
    mediaRoots: [],
    ffmpeg: { ffmpeg: true, ffprobe: true },
    ai: { configured: true, model: "deepseek-chat" },
    bangumi: { configured: true, proxyConfigured: true },
  });

  assert.deepEqual(result.bangumi, { configured: true, proxyConfigured: true });
});
