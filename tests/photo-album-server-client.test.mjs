import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const client = await importTsModule(new URL("../src/photoAlbumServerClient.ts", import.meta.url));

test("server photo album scan reports ready roots", () => {
  assert.equal(client.hasReadyPhotoAlbumRoot({
    roots: [],
    albums: [],
    scannedFiles: 0,
    metadata: {
      id: "photo-albums",
      name: "看图",
      albumCount: 0,
      scannedFiles: 0,
      updatedAt: 1,
      mediaRoots: [
        { id: "browser", label: "Browser", source: "browser", status: "needsAccess", videoCount: 0, scannedFiles: 0, updatedAt: 1 },
      ],
    },
  }), false);

  assert.equal(client.hasReadyPhotoAlbumRoot({
    roots: [],
    albums: [],
    scannedFiles: 0,
    metadata: {
      id: "photo-albums",
      name: "看图",
      albumCount: 0,
      scannedFiles: 0,
      updatedAt: 1,
      mediaRoots: [
        { id: "photos", label: "Photos", source: "local", status: "ready", videoCount: 0, scannedFiles: 0, updatedAt: 1 },
      ],
    },
  }), true);
});

test("deleteServerPhotoImage sends root and relative path", async () => {
  const calls = [];
  const result = await client.deleteServerPhotoImage(async (url, options) => {
    calls.push({ url, options });
    return { deleted: true };
  }, {
    mediaRootId: "photos",
    relativePath: "Set/001.jpg",
  });

  assert.deepEqual(result, { deleted: true });
  assert.equal(calls[0].url, "/api/photo-albums/photo");
  assert.equal(calls[0].options.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    rootId: "photos",
    relativePath: "Set/001.jpg",
  });
});
