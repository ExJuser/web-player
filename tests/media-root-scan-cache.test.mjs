import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const cacheUtils = await importTsModule(new URL("../src/mediaRootScanCache.ts", import.meta.url));
const storage = await importTsModule(new URL("../src/playerStorage.ts", import.meta.url));

const createVideo = (id, mediaRootId) => ({
  id,
  mediaRootId,
  name: `${id}.mp4`,
  relativePath: `${id}.mp4`,
  url: `/media/${id}`,
  size: 1,
  lastModified: 1,
});

const createSubtitle = (id, mediaRootId, source) => ({
  id,
  mediaRootId,
  name: `${id}.srt`,
  relativePath: `${id}.srt`,
  url: `/subtitle/${id}`,
  ...(source ? { source } : {}),
});

test("creates cached media root scan with external subtitles only", () => {
  const scan = {
    scannedFiles: 4,
    filteredSmallVideos: 1,
    metadata: {
      id: "global",
      name: "全局媒体库",
      videoCount: 2,
      scannedFiles: 4,
      updatedAt: 1,
      mediaRoots: [],
    },
  };
  const cached = cacheUtils.createCachedMediaRootScan(
    scan,
    [createVideo("a", "root-a")],
    [createSubtitle("external", "root-a"), createSubtitle("embedded", "root-a", "embedded")],
  );

  assert.equal(cached.version, storage.mediaRootScanCacheVersion);
  assert.equal(cached.scannedFiles, 4);
  assert.deepEqual(cached.subtitles.map((subtitle) => subtitle.id), ["external"]);
  assert.equal(cached.metadata.updatedAt, cached.updatedAt);
});

test("aligns cached media root scan with current config", () => {
  const cached = {
    version: 1,
    videos: [createVideo("keep", "root-a"), createVideo("drop", "root-b")],
    subtitles: [createSubtitle("keep-sub", "root-a"), createSubtitle("drop-sub", "root-b")],
    scannedFiles: 3,
    filteredSmallVideos: 0,
    updatedAt: 10,
    metadata: {
      id: "global",
      name: "全局媒体库",
      videoCount: 2,
      scannedFiles: 3,
      updatedAt: 10,
      mediaRoots: [
        { id: "root-a", label: "Old A", source: "browser", status: "ready", videoCount: 1, scannedFiles: 2, updatedAt: 10 },
        { id: "root-b", label: "Old B", source: "browser", status: "ready", videoCount: 1, scannedFiles: 1, updatedAt: 10 },
      ],
    },
  };
  const aligned = cacheUtils.alignCachedMediaRootScanWithConfig(cached, {
    mediaRoots: [
      { id: "root-a", label: "New A", basename: "A", path: "A", source: "local" },
      { id: "root-c", label: "New C", basename: "C", path: "C", source: "browser" },
    ],
    ffmpeg: { ffmpeg: false, ffprobe: false },
    ai: { configured: false, model: "" },
    bangumi: { configured: false, proxyConfigured: false },
  });

  assert.deepEqual(aligned.videos.map((video) => video.id), ["keep"]);
  assert.deepEqual(aligned.subtitles.map((subtitle) => subtitle.id), ["keep-sub"]);
  assert.deepEqual(aligned.metadata.mediaRoots.map((root) => `${root.id}:${root.label}:${root.status}`), [
    "root-a:New A:ready",
    "root-c:New C:needsAccess",
  ]);
  assert.equal(aligned.scannedFiles, 2);
  assert.equal(aligned.metadata.videoCount, 1);
});
