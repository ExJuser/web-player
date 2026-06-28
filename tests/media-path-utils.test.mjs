import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const mediaPathUtils = await importTsModule(new URL("../src/mediaPathUtils.ts", import.meta.url));

test("extracts file base names without extensions from local and relative paths", () => {
  assert.equal(mediaPathUtils.baseNameWithoutExtension("Show/E01.mkv"), "E01");
  assert.equal(mediaPathUtils.baseNameWithoutExtension("Show\\E02.ass"), "E02");
  assert.equal(mediaPathUtils.baseNameWithoutExtension("README"), "README");
  assert.equal(mediaPathUtils.baseNameWithoutExtension(".hidden"), "");
});

test("extracts directory parts from relative paths", () => {
  assert.deepEqual(mediaPathUtils.directoryPartsOf("Root/Season 1/E01.mkv"), ["Root", "Season 1"]);
  assert.deepEqual(mediaPathUtils.directoryPartsOf("Root\\Season 2\\E02.mkv"), ["Root", "Season 2"]);
  assert.deepEqual(mediaPathUtils.directoryPartsOf("E01.mkv"), []);
});

test("falls back to media root id, folder name, or temporary media label", () => {
  assert.equal(mediaPathUtils.fallbackMediaRootLabelForVideo({ mediaRootId: "root-anime", relativePath: "Show/E01.mkv" }), "root-anime");
  assert.equal(mediaPathUtils.fallbackMediaRootLabelForVideo({ relativePath: "Show/E01.mkv" }), "Show");
  assert.equal(mediaPathUtils.fallbackMediaRootLabelForVideo({ relativePath: "E01.mkv" }), "临时媒体");
});
