import assert from "node:assert/strict";
import test from "node:test";

import { createPublicLocalConfig, defaultAppConfig } from "../server/localConfig.mjs";

test("default app config keeps the local server fallback", () => {
  assert.deepEqual(defaultAppConfig, { server: { port: 3001 }, media: { roots: [] } });
});

test("public local config exposes safe media roots and service status", () => {
  const result = createPublicLocalConfig(
    {
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "D:\\Media\\Anime" },
          { id: "browser", label: "Browser", path: "Browser", source: "browser", localPath: "D:\\Media\\Browser" },
        ],
      },
    },
    { ffmpeg: true, ffprobe: false },
    {
      DEEPSEEK_API_KEY: "secret",
      DEEPSEEK_MODEL: "deepseek-reasoner",
      BANGUMI_USER_AGENT: "local/test",
      BANGUMI_ACCESS_TOKEN: "token",
      BANGUMI_LENS_PROXY: "http://127.0.0.1:7897",
    },
  );

  assert.deepEqual(result, {
    mediaRoots: [
      {
        id: "anime",
        label: "Anime",
        basename: "Anime",
        path: "D:\\Media\\Anime",
        source: "local",
        localPath: undefined,
      },
      {
        id: "browser",
        label: "Browser",
        basename: "Browser",
        path: "Browser",
        source: "browser",
        localPath: "D:\\Media\\Browser",
      },
    ],
    ffmpeg: { ffmpeg: true, ffprobe: false },
    ai: { configured: true, model: "deepseek-reasoner" },
    bangumi: { configured: true, proxyConfigured: true },
  });
});

test("public local config reports unconfigured optional services", () => {
  const result = createPublicLocalConfig(defaultAppConfig, {}, {});

  assert.deepEqual(result.ai, { configured: false, model: "deepseek-chat" });
  assert.deepEqual(result.bangumi, { configured: false, proxyConfigured: false });
});
