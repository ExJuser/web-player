import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanMediaRoot } from "../server/mediaRoots.mjs";
import { LocalDataSqliteStore } from "../server/sqliteStorage.mjs";

function createStore(root) {
  const dataRoot = path.join(root, "data");
  return new LocalDataSqliteStore({
    dataRoot,
    librariesRoot: path.join(dataRoot, "libraries"),
    photoAlbumsRoot: path.join(dataRoot, "photo-albums"),
    indexPath: path.join(dataRoot, "index.json"),
    globalDataPath: path.join(dataRoot, "global.json"),
  });
}

test("media scan reuses unchanged directory records and invalidates changed files", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "web-player-media-scan-"));
  const root = { id: "root", label: "Root", path: rootPath, source: "local" };
  try {
    await writeFile(path.join(rootPath, "episode.srt"), "first", "utf8");
    let firstDirectories = [];
    const first = await scanMediaRoot(root, {
      onRootComplete(_result, directories) {
        firstDirectories = directories;
      },
    });
    assert.equal(first.status.changedDirectories, 1);
    assert.equal(first.status.reusedDirectories, 0);

    const cache = new Map(firstDirectories.map((directory) => [directory.relativeDirectory, directory]));
    const second = await scanMediaRoot(root, {
      getDirectoryRecord(_rootId, relativeDirectory) {
        return cache.get(relativeDirectory);
      },
    });
    assert.equal(second.status.changedDirectories, 0);
    assert.equal(second.status.reusedDirectories, 1);
    assert.equal(second.subtitles.length, 1);

    await writeFile(path.join(rootPath, "episode.srt"), "changed subtitle", "utf8");
    const third = await scanMediaRoot(root, {
      getDirectoryRecord(_rootId, relativeDirectory) {
        return cache.get(relativeDirectory);
      },
    });
    assert.equal(third.status.changedDirectories, 1);
    assert.equal(third.status.reusedDirectories, 0);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("media scan directory cache does not duplicate nested entries", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "web-player-media-scan-nested-"));
  const root = { id: "root", label: "Root", path: rootPath, source: "local" };
  try {
    await mkdir(path.join(rootPath, "season"), { recursive: true });
    await writeFile(path.join(rootPath, "season", "episode.srt"), "subtitle", "utf8");

    let firstDirectories = [];
    const first = await scanMediaRoot(root, {
      onRootComplete(_result, directories) {
        firstDirectories = directories;
      },
    });
    assert.equal(first.subtitles.length, 1);

    const cache = new Map(firstDirectories.map((directory) => [directory.relativeDirectory, directory]));
    const second = await scanMediaRoot(root, {
      getDirectoryRecord(_rootId, relativeDirectory) {
        return cache.get(relativeDirectory);
      },
    });
    assert.equal(second.status.reusedDirectories, 2);
    assert.equal(second.subtitles.length, 1);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("sqlite media scan index commits successful roots and keeps task snapshots", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "web-player-media-index-"));
  const store = createStore(rootPath);
  try {
    await mkdir(path.join(rootPath, "data"), { recursive: true });
    await store.initialize();
    const snapshot = {
      runId: "run-1",
      status: "running",
      rootsTotal: 1,
      rootsCompleted: 0,
      visitedFiles: 0,
      reusedFiles: 0,
      changedFiles: 0,
      startedAt: 1,
      roots: [],
    };
    store.startMediaScanRun(snapshot);
    store.commitMediaScanRoot({
      runId: "run-1",
      rootId: "root",
      directories: [{
        rootId: "root",
        relativeDirectory: "",
        fingerprint: "fingerprint",
        scannedFiles: 1,
        filteredSmallVideos: 0,
        videos: [],
        subtitles: [{
          id: "subtitle",
          name: "episode.srt",
          relativePath: "episode.srt",
          url: "/api/media/root/episode.srt",
          size: 10,
          lastModified: 20,
          mediaRootId: "root",
        }],
      }],
    });
    store.updateMediaScanRun({ ...snapshot, status: "completed", rootsCompleted: 1, completedAt: 2 });

    assert.equal(store.loadMediaScanDirectoryCache("root").get("").fingerprint, "fingerprint");
    assert.equal(store.loadMediaScanTaskSnapshot().status, "completed");
  } finally {
    store.close();
    await rm(rootPath, { recursive: true, force: true });
  }
});
