import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMediaRoots,
  resolveVideoPath,
  updateMediaRootLocalPath,
} from "../server/mediaRoots.mjs";

async function withTempConfig(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "web-player-media-root-"));
  const configPath = path.join(directory, "app.json");
  try {
    await fn({ directory, configPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("browser media root keeps browser path and exposes absolute localPath", async () => {
  await withTempConfig(async ({ directory, configPath }) => {
    const localPath = path.join(directory, "Anime");
    await writeFile(configPath, JSON.stringify({
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser" },
        ],
      },
    }));

    await import("node:fs/promises").then(({ mkdir }) => mkdir(localPath));
    const result = await updateMediaRootLocalPath(configPath, { id: "anime", localPath });
    const roots = normalizeMediaRoots(result.config);

    assert.equal(result.mediaRoot.id, "anime");
    assert.equal(result.mediaRoot.path, "Anime");
    assert.equal(result.mediaRoot.source, "browser");
    assert.equal(result.mediaRoot.localPath, path.resolve(localPath));
    assert.equal(roots[0].basename, "Anime");
  });
});

test("localPath must be an existing absolute directory", async () => {
  await withTempConfig(async ({ configPath }) => {
    await writeFile(configPath, JSON.stringify({
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser" },
        ],
      },
    }));

    await assert.rejects(
      updateMediaRootLocalPath(configPath, { id: "anime", localPath: "Anime" }),
      /absolute path/i,
    );

    await assert.rejects(
      updateMediaRootLocalPath(configPath, { id: "anime", localPath: path.join(tmpdir(), "missing-web-player-dir") }),
      /directory/i,
    );
  });
});

test("browser media root resolves videos through localPath without escaping root", async () => {
  await withTempConfig(async ({ directory }) => {
    const localPath = path.join(directory, "Anime");
    const config = {
      media: {
        roots: [
          { id: "anime", label: "Anime", path: "Anime", source: "browser", localPath },
        ],
      },
    };

    assert.equal(
      resolveVideoPath(config, "anime", "Show/E01.mkv"),
      path.resolve(localPath, "Show/E01.mkv"),
    );

    assert.throws(() => resolveVideoPath(config, "anime", "../E01.mkv"), /Invalid relative path/);
  });
});
