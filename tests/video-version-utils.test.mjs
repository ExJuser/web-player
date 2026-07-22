import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const versions = await importTsModule(new URL("../src/videoVersionUtils.ts", import.meta.url));

function video(id, name, relativePath = name, mediaRootId = "movies") {
  return { id, name, relativePath, mediaRootId };
}

test("parses generated edit and restored video names", () => {
  assert.deepEqual(versions.parseVideoVersion("Movie-edit.mkv"), { baseName: "Movie", kind: "edit" });
  assert.deepEqual(versions.parseVideoVersion("Movie-edit-2.mp4"), { baseName: "Movie", kind: "edit" });
  assert.deepEqual(versions.parseVideoVersion("Movie.restored.mp4"), { baseName: "Movie", kind: "restored" });
  assert.deepEqual(versions.parseVideoVersion("Movie.restored-2.mp4"), { baseName: "Movie", kind: "restored" });
  assert.deepEqual(versions.parseVideoVersion("Movie-edit.highlights.restored.mp4"), { baseName: "Movie", kind: "restored" });
  assert.equal(versions.parseVideoVersion("Movie.mkv"), null);
});

test("groups originals with edit and restored versions in the same media folder", () => {
  const original = video("original", "Movie.mkv", "Classics/Movie.mkv");
  const edit = video("edit", "Movie-edit.mkv", "Classics/Movie-edit.mkv");
  const restored = video("restored", "Movie.restored.mp4", "Classics/Movie.restored.mp4");
  const otherFolder = video("other", "Movie-edit.mkv", "Other/Movie-edit.mkv");

  const groups = versions.createVideoVersionGroups([restored, otherFolder, original, edit]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].videos, [original, edit, restored]);
  assert.deepEqual(groups[1].videos, [otherFolder]);
  assert.deepEqual(Array.from(versions.createVideoVersionPlaylistMetaByVideoId(groups).entries()), [
    ["original", { groupIndex: 1, groupSize: 3, role: "original" }],
    ["edit", { groupIndex: 1, groupSize: 3, role: "edit" }],
    ["restored", { groupIndex: 1, groupSize: 3, role: "restored" }],
    ["other", { groupIndex: 2, groupSize: 1, role: "edit" }],
  ]);
});
