import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  clearLocalCacheItems,
  createCacheStatus,
  createDanmakuSourcesStats,
  getPathStats,
} from "../server/cacheStatus.mjs";

test("getPathStats recursively totals files and ignores missing paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-cache-"));
  try {
    await mkdir(path.join(tempDir, "nested"), { recursive: true });
    await writeFile(path.join(tempDir, "root.bin"), Buffer.alloc(3));
    await writeFile(path.join(tempDir, "nested", "child.bin"), Buffer.alloc(5));

    const stats = await getPathStats(tempDir);
    assert.equal(stats.bytes, 8);
    assert.equal(stats.files, 2);
    assert.equal(typeof stats.updatedAt, "number");

    assert.deepEqual(await getPathStats(path.join(tempDir, "missing")), {
      bytes: 0,
      files: 0,
      updatedAt: null,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createDanmakuSourcesStats counts only json files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-cache-"));
  try {
    await writeFile(path.join(tempDir, "a.json"), "{}");
    await writeFile(path.join(tempDir, "b.JSON"), "{}");
    await writeFile(path.join(tempDir, "note.txt"), "ignored");

    const stats = await createDanmakuSourcesStats(tempDir);
    assert.equal(stats.bytes, 4);
    assert.equal(stats.files, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createCacheStatus adds database and unclassified local data items", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-cache-"));
  try {
    const knownPath = path.join(tempDir, "known");
    const otherPath = path.join(tempDir, "other.bin");
    const databasePath = path.join(tempDir, "database.sqlite");
    await mkdir(knownPath, { recursive: true });
    await writeFile(path.join(knownPath, "cache.bin"), Buffer.alloc(4));
    await writeFile(otherPath, Buffer.alloc(6));
    await writeFile(databasePath, Buffer.alloc(2));

    const status = await createCacheStatus({
      dataRoot: tempDir,
      definitions: [{ id: "known", label: "Known cache", path: knownPath }],
      createDatabaseStatusItem: async () => ({
        id: "sqlite-database",
        label: "SQLite 数据库",
        path: databasePath,
        bytes: 2,
        files: 1,
        updatedAt: 1,
      }),
    });

    assert.equal(status.rootPath, tempDir);
    assert.equal(status.totalBytes, 12);
    assert.equal(status.totalFiles, 3);
    assert.deepEqual(
      status.items.map((item) => item.id),
      ["known", "sqlite-database", "other-local-data"],
    );
    assert.equal(status.items.find((item) => item.id === "other-local-data").clearable, false);
    assert.equal(status.items.find((item) => item.id === "other-local-data").bytes, 6);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("clearLocalCacheItems clears selected paths and cache entry kinds", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-cache-"));
  try {
    const thumbnailsPath = path.join(tempDir, "thumbnails");
    await mkdir(thumbnailsPath, { recursive: true });
    await writeFile(path.join(thumbnailsPath, "thumb.blob"), "cached");

    const clearedKinds = [];
    const result = await clearLocalCacheItems(
      { ids: ["thumbnails", "thumbnails"] },
      {
        dataRoot: tempDir,
        createStatus: () =>
          createCacheStatus({
            dataRoot: tempDir,
            definitions: [{ id: "thumbnails", label: "Thumbnails", path: thumbnailsPath }],
          }),
        clearCacheEntriesByKinds: (kinds) => clearedKinds.push(...kinds),
      },
    );

    assert.deepEqual(result.cleared, ["thumbnails"]);
    assert.deepEqual(clearedKinds, ["thumbnail"]);
    assert.equal(await readFile(path.join(thumbnailsPath, "thumb.blob"), "utf8").catch(() => null), null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("clearLocalCacheItems refuses unknown, read-only, and outside paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-player-cache-"));
  try {
    const outsidePath = path.join(os.tmpdir(), `web-player-outside-${Date.now()}`);
    await mkdir(outsidePath, { recursive: true });

    await assert.rejects(
      () =>
        clearLocalCacheItems(
          { ids: ["missing"] },
          {
            dataRoot: tempDir,
            createStatus: () => ({ items: [] }),
            clearCacheEntriesByKinds: () => undefined,
          },
        ),
      /Unknown cache item/,
    );

    await assert.rejects(
      () =>
        clearLocalCacheItems(
          { ids: ["other-local-data"] },
          {
            dataRoot: tempDir,
            createStatus: () => ({ items: [{ id: "other-local-data", path: tempDir, clearable: false }] }),
            clearCacheEntriesByKinds: () => undefined,
          },
        ),
      /read-only/,
    );

    await assert.rejects(
      () =>
        clearLocalCacheItems(
          { ids: ["outside"] },
          {
            dataRoot: tempDir,
            createStatus: () => ({ items: [{ id: "outside", path: outsidePath }] }),
            clearCacheEntriesByKinds: () => undefined,
          },
        ),
      /outside the local data directory/,
    );

    await rm(outsidePath, { recursive: true, force: true });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
