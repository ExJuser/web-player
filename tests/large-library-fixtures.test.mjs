import assert from "node:assert/strict";
import test from "node:test";

import {
  createLargeLibrarySearchRecords,
  createLargeMosaicAlbums,
  flattenMosaicPhotoSources,
} from "../scripts/large-library-fixtures.mjs";

test("large-library search fixtures are deterministic without stored bulk data", () => {
  assert.deepEqual(createLargeLibrarySearchRecords(3), createLargeLibrarySearchRecords(3));
  assert.equal(createLargeLibrarySearchRecords(24)[23].series, "系列 1");
  assert.equal(createLargeLibrarySearchRecords(25)[24].series, "系列 2");
});

test("large mosaic fixtures preserve the requested photo count and stable identities", () => {
  const albums = createLargeMosaicAlbums(1_001, 500);
  const sources = flattenMosaicPhotoSources(albums);
  assert.equal(albums.length, 3);
  assert.equal(sources.length, 1_001);
  assert.equal(sources[1_000].id, "photo:album-2:image-1000");
});
