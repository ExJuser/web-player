import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const storage = await importTsModule(new URL("../src/photoAlbumStorage.ts", import.meta.url));

function createAlbum(overrides = {}) {
  return {
    id: overrides.id ?? "photos|Set",
    title: overrides.title ?? "Set",
    relativePath: overrides.relativePath ?? "Set",
    mediaRootId: "photos",
    mediaRootLabel: overrides.mediaRootLabel ?? "Photos",
    coverImageUrl: "",
    imageCount: overrides.imageCount ?? 5,
    totalSize: overrides.totalSize ?? 100,
    updatedAt: overrides.updatedAt ?? 1,
    folderModifiedAt: overrides.folderModifiedAt ?? overrides.updatedAt ?? 1,
    images: overrides.images ?? [{ id: `${overrides.id ?? "photos|Set"}|001`, name: "001.jpg" }],
  };
}

test("missing photo album store fields fall back to defaults", () => {
  const parsed = storage.parsePhotoAlbumStore(JSON.stringify({ version: 1 }));

  assert.deepEqual(parsed.favorites, []);
  assert.deepEqual(parsed.progress, {});
  assert.deepEqual(parsed.preferences, {
    sortMode: "updated",
    sortDirection: "desc",
    favoritesOnly: false,
    recentTags: [],
    tagMergeDecisions: {},
  });
  assert.deepEqual(parsed.coverImageByAlbumId, {});
  assert.deepEqual(parsed.albumTags, {});
});

test("photo album store keeps valid favorites, progress, preferences, and tags", () => {
  const parsed = storage.parsePhotoAlbumStore(JSON.stringify({
    version: 1,
    favorites: ["root|A", "root|A", "", 42, "root|B"],
    progress: {
      "root|A": { imageIndex: 3, updatedAt: 10, completed: false },
      "root|B": { imageIndex: -1, updatedAt: 11, completed: true },
      "root|C": { imageIndex: 0, updatedAt: 12, completed: true },
      "root|D": { imageIndex: 1, updatedAt: "bad", completed: true },
    },
    coverImageByAlbumId: {
      "root|A": "img-1",
      "root|B": "",
      "root|C": 42,
    },
    albumTags: {
      "root|A": ["剧情", "剧情 ", "AI-字幕", "ＡＩ字幕", "", 42],
      "root|B": "bad",
    },
    preferences: {
      sortMode: "count",
      sortDirection: "asc",
      favoritesOnly: true,
    },
  }));

  assert.deepEqual(parsed.favorites, ["root|A", "root|B"]);
  assert.deepEqual(parsed.progress, {
    "root|A": { imageIndex: 3, updatedAt: 10, completed: false },
    "root|C": { imageIndex: 0, updatedAt: 12, completed: true },
  });
  assert.deepEqual(parsed.preferences, {
    sortMode: "count",
    sortDirection: "asc",
    favoritesOnly: true,
    recentTags: [],
    tagMergeDecisions: {},
  });
  assert.deepEqual(parsed.coverImageByAlbumId, {
    "root|A": "img-1",
  });
  assert.deepEqual(parsed.albumTags, {
    "root|A": ["剧情", "AI-字幕"],
  });
});

test("photo album display helpers keep sort labels and progress text", () => {
  const album = createAlbum();

  assert.deepEqual(storage.photoAlbumSortOptions.map((option) => [option.value, option.label]), [
    ["updated", "最近更新"],
    ["folderModified", "文件夹修改时间"],
    ["name", "名称"],
    ["count", "图片数"],
  ]);
  assert.deepEqual(storage.photoAlbumSortDirectionOptions.map((option) => [option.value, option.label]), [
    ["asc", "正序"],
    ["desc", "倒序"],
  ]);
  assert.equal(storage.formatPhotoAlbumProgress(album, {}), "未开始");
  assert.equal(storage.formatPhotoAlbumProgress(album, { [album.id]: { imageIndex: 2, updatedAt: 10, completed: false } }), "看到 3 / 5");
  assert.equal(storage.formatPhotoAlbumProgress(album, { [album.id]: { imageIndex: 9, updatedAt: 10, completed: false } }), "看到 5 / 5");
  assert.equal(storage.formatPhotoAlbumProgress(album, { [album.id]: { imageIndex: 4, updatedAt: 10, completed: true } }), "已读完");
  assert.equal(storage.shouldUseContinuousPhotoReader(["旅行", "漫画"]), true);
  assert.equal(storage.shouldUseContinuousPhotoReader([" 本 子 "]), true);
  assert.equal(storage.shouldUseContinuousPhotoReader(["旅行", "人像"]), false);
});

test("photo album display helpers filter sort paginate and summarize albums", () => {
  const first = createAlbum({ id: "photos|A", title: "Alpha", relativePath: "旅行/Alpha", imageCount: 2, updatedAt: 20, images: [{ id: "a1", name: "cover-a.jpg" }] });
  const second = createAlbum({ id: "photos|B", title: "Beta", relativePath: "人像/Beta", imageCount: 5, updatedAt: 30, folderModifiedAt: 5, images: [{ id: "b1", name: "cover-b.jpg" }] });
  const third = createAlbum({ id: "photos|C", title: "Gamma", relativePath: "风景/Gamma", imageCount: 1, updatedAt: 10, folderModifiedAt: 40, images: [{ id: "c1", name: "cover-c.jpg" }] });
  const albums = [first, second, third];
  const favorites = new Set([second.id]);
  const albumTags = {
    [first.id]: ["旅行"],
    [second.id]: ["人像"],
    [third.id]: ["风景"],
  };

  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: favorites, filter: "favorites", searchQuery: "", sortDirection: "desc", sortMode: "updated", albumTags }).map((album) => album.id),
    [second.id],
  );
  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: new Set(), filter: "all", searchQuery: "人像", sortDirection: "desc", sortMode: "updated", albumTags }).map((album) => album.id),
    [second.id],
  );
  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: new Set(), filter: "all", searchQuery: "", sortDirection: "desc", sortMode: "count", albumTags }).map((album) => album.id),
    [second.id, first.id, third.id],
  );
  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: new Set(), filter: "all", searchQuery: "", sortDirection: "desc", sortMode: "folderModified", albumTags }).map((album) => album.id),
    [third.id, first.id, second.id],
  );
  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: new Set(), filter: "all", searchQuery: "", sortDirection: "asc", sortMode: "updated", albumTags }).map((album) => album.id),
    [third.id, first.id, second.id],
  );
  assert.deepEqual(
    storage.getVisiblePhotoAlbums({ albums, favoriteAlbumIds: new Set(), filter: "all", searchQuery: "", tagFilterKey: "人像", sortDirection: "desc", sortMode: "updated", albumTags }).map((album) => album.id),
    [second.id],
  );
  assert.deepEqual(storage.getPagedPhotoAlbums(albums, 2, 2).map((album) => album.id), [third.id]);
  assert.deepEqual(storage.getPhotoAlbumPageBounds(3, 2, 2), { pageCount: 2, start: 3, end: 3 });
  assert.deepEqual(storage.getPhotoAlbumPageBounds(0, 1, 2), { pageCount: 1, start: 0, end: 0 });
  assert.deepEqual(storage.createPhotoAlbumStats(albums, favorites, { [second.id]: { imageIndex: 4, updatedAt: 1, completed: true } }), {
    total: 3,
    images: 8,
    favorites: 1,
    completed: 1,
  });
});

test("photo album thumbnail helper keeps a bounded visible window", () => {
  const album = createAlbum({
    images: Array.from({ length: 10 }, (_, index) => ({
      id: `img-${index}`,
      name: `${index}.jpg`,
      relativePath: `${index}.jpg`,
      url: "",
      size: 1,
      lastModified: 1,
      mediaRootId: "photos",
      index,
    })),
  });

  assert.deepEqual(storage.getVisiblePhotoThumbnails(null, 3, 4), []);
  assert.deepEqual(storage.getVisiblePhotoThumbnails(album, 0, 4).map((image) => image.id), ["img-0", "img-1", "img-2", "img-3"]);
  assert.deepEqual(storage.getVisiblePhotoThumbnails(album, 5, 4).map((image) => image.id), ["img-3", "img-4", "img-5", "img-6"]);
  assert.deepEqual(storage.getVisiblePhotoThumbnails(album, 9, 4).map((image) => image.id), ["img-6", "img-7", "img-8", "img-9"]);
});

test("invalid photo album scan cache is ignored", () => {
  assert.equal(storage.parseCachedPhotoAlbumScan(JSON.stringify({ version: 0 })), null);
  assert.equal(storage.parseCachedPhotoAlbumScan(JSON.stringify({
    version: storage.photoAlbumScanCacheVersion,
    rootId: "photos",
    rootName: "Photos",
    albums: "bad",
  })), null);
});

test("photo album scan cache keeps valid albums and drops invalid images", () => {
  const parsed = storage.parseCachedPhotoAlbumScan(JSON.stringify({
    version: storage.photoAlbumScanCacheVersion,
    rootId: "photos",
    rootName: "Photos",
    scannedFiles: 3,
    updatedAt: 100,
    albums: [
      {
        id: "photos|Set",
        title: "Set",
        relativePath: "Set",
        mediaRootId: "photos",
        mediaRootLabel: "Photos",
        coverImageUrl: "blob:old",
        imageCount: 10,
        totalSize: 300,
        updatedAt: 90,
        images: [
          {
            id: "img-1",
            name: "001.jpg",
            relativePath: "Set\\001.jpg",
            url: "blob:old",
            size: 100,
            lastModified: 80,
            mediaRootId: "photos",
            index: 9,
          },
          {
            id: "",
            name: "bad.jpg",
            relativePath: "Set/bad.jpg",
            mediaRootId: "photos",
          },
        ],
      },
      {
        id: "photos|Empty",
        title: "Empty",
        relativePath: "Empty",
        mediaRootId: "photos",
        mediaRootLabel: "Photos",
        images: [],
      },
    ],
  }));

  assert.equal(parsed.rootId, "photos");
  assert.equal(parsed.rootName, "Photos");
  assert.equal(parsed.scannedFiles, 3);
  assert.equal(parsed.albums.length, 1);
  assert.equal(parsed.albums[0].imageCount, 10);
  assert.equal(parsed.albums[0].images[0].relativePath, "Set/001.jpg");
});
