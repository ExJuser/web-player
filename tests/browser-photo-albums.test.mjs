import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const browserPhotoAlbums = await importTsModule(new URL("../src/browserPhotoAlbums.ts", import.meta.url));

function createPhotoFile(name, options = {}) {
  return {
    name,
    size: options.size ?? 1024,
    lastModified: options.lastModified ?? 100,
  };
}

test("collectPhotoAlbumsFromBrowserFiles groups images by album and trims root label prefix", () => {
  const tripDirectory = { name: "Trip" };
  const otherDirectory = { name: "Other" };

  const scan = browserPhotoAlbums.collectPhotoAlbumsFromBrowserFiles("Photos", "root-1", [
    {
      file: createPhotoFile("B 10.png", { size: 300, lastModified: 30 }),
      relativePath: "Photos\\Trip\\B 10.png",
      parentDirectory: tripDirectory,
    },
    {
      file: createPhotoFile("B 2.jpg", { size: 200, lastModified: 20 }),
      relativePath: "Photos/Trip/B 2.jpg",
      parentDirectory: tripDirectory,
    },
    {
      file: createPhotoFile("A.webp", { size: 400, lastModified: 40 }),
      relativePath: "Other/A.webp",
      parentDirectory: otherDirectory,
    },
    {
      file: createPhotoFile("notes.txt", { size: 10, lastModified: 50 }),
      relativePath: "Photos/Trip/notes.txt",
      parentDirectory: tripDirectory,
    },
  ]);

  assert.equal(scan.rootId, "root-1");
  assert.equal(scan.rootLabel, "Photos");
  assert.equal(scan.scannedFiles, 4);
  assert.deepEqual(scan.albums.map((album) => ({
    id: album.id,
    title: album.title,
    relativePath: album.relativePath,
    imageCount: album.imageCount,
    totalSize: album.totalSize,
    updatedAt: album.updatedAt,
  })), [
    {
      id: "root-1|Other",
      title: "Other",
      relativePath: "Other",
      imageCount: 1,
      totalSize: 400,
      updatedAt: 40,
    },
    {
      id: "root-1|Trip",
      title: "Trip",
      relativePath: "Trip",
      imageCount: 2,
      totalSize: 500,
      updatedAt: 30,
    },
  ]);

  const tripAlbum = scan.albums[1];
  assert.deepEqual(tripAlbum.images.map((image) => ({
    id: image.id,
    name: image.name,
    relativePath: image.relativePath,
    index: image.index,
    mediaRootId: image.mediaRootId,
    url: image.url,
    parentDirectory: image.parentDirectory,
  })), [
    {
      id: "root-1|Trip/B 2.jpg|200|20",
      name: "B 2.jpg",
      relativePath: "Trip/B 2.jpg",
      index: 0,
      mediaRootId: "root-1",
      url: "",
      parentDirectory: tripDirectory,
    },
    {
      id: "root-1|Trip/B 10.png|300|30",
      name: "B 10.png",
      relativePath: "Trip/B 10.png",
      index: 1,
      mediaRootId: "root-1",
      url: "",
      parentDirectory: tripDirectory,
    },
  ]);
});
