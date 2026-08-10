import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const scan = await importTsModule(new URL("../src/photoAlbumScan.ts", import.meta.url));

const parentDirectory = { kind: "directory", name: "Album" };

function createImage(name, lastModified, size = 10) {
  return new File(["x".repeat(size)], name, { lastModified });
}

test("collects browser photo files into sorted albums", () => {
  const result = scan.collectPhotoAlbumsFromBrowserFiles("Pictures", "root-1", [
    { file: createImage("02.jpg", 20), relativePath: "Pictures/Trip/02.jpg", parentDirectory },
    { file: createImage("01.jpg", 10), relativePath: "Pictures/Trip/01.jpg", parentDirectory },
    { file: createImage("cover.png", 30), relativePath: "Pictures/Covers/cover.png", parentDirectory },
    { file: createImage("note.txt", 40), relativePath: "Pictures/Covers/note.txt", parentDirectory },
  ]);

  assert.equal(result.rootId, "root-1");
  assert.equal(result.rootLabel, "Pictures");
  assert.equal(result.scannedFiles, 4);
  assert.deepEqual(result.albums.map((album) => album.relativePath), ["Covers", "Trip"]);
  assert.deepEqual(result.albums[1].images.map((image) => `${image.index}:${image.name}`), ["0:01.jpg", "1:02.jpg"]);
  assert.equal(result.albums[0].imageCount, 1);
});

test("creates cached scan and root status shells", () => {
  const collected = scan.collectPhotoAlbumsFromBrowserFiles("Pictures", "root-1", [
    { file: createImage("01.jpg", 10), relativePath: "Trip/01.jpg", parentDirectory },
  ]);
  const cached = scan.createCachedPhotoAlbumScan(collected);
  const status = scan.createPhotoAlbumRootStatusFromCache(cached, "needsAccess", "missing permission");

  assert.equal(cached.version, 1);
  assert.equal(cached.rootName, "Pictures");
  assert.equal(cached.albums.length, 1);
  assert.equal(status.id, "root-1");
  assert.equal(status.status, "needsAccess");
  assert.equal(status.videoCount, 1);
  assert.equal(status.error, "missing permission");
});

test("creates one aggregate cache while keeping per-library status", () => {
  const first = scan.collectPhotoAlbumsFromBrowserFiles("旅行", "photo-root-1", [
    { file: createImage("01.jpg", 10), relativePath: "Trip/01.jpg", parentDirectory },
  ]);
  const second = scan.collectPhotoAlbumsFromBrowserFiles("画集", "photo-root-2", [
    { file: createImage("cover.png", 20), relativePath: "Art/cover.png", parentDirectory },
  ]);
  const albums = [...first.albums, ...second.albums];
  const cached = scan.createCachedPhotoAlbumLibraryScan(albums);
  const status = scan.createPhotoAlbumLibraryRootStatus({
    id: "photo-root-2",
    label: "画集",
    basename: "Pictures",
    createdAt: 1,
  }, albums, "ready");

  assert.equal(cached.rootId, "browser-photo-libraries");
  assert.equal(cached.albums.length, 2);
  assert.equal(cached.scannedFiles, 2);
  assert.equal(status.id, "photo-root-2");
  assert.equal(status.videoCount, 1);
  assert.equal(status.scannedFiles, 1);
});
