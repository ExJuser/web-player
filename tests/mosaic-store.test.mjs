import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createMosaicStore } from "../server/mosaicStore.mjs";

function createProject(id, updatedAt = 1) {
  return {
    id,
    name: id,
    createdAt: 1,
    updatedAt,
    previewUrl: `/api/mosaics/${id}/preview`,
    recipe: {
      version: 1,
      algorithmVersion: 1,
      target: { kind: "source", label: "target", sourceId: "source-a" },
      sourceFilter: "mixed",
      sourceLimit: 4000,
      columns: 2,
      rows: 2,
      targetClarity: 0.5,
      colorPreservation: 0.5,
      maxReuse: 2,
      seed: 1,
      sourceIds: ["source-a"],
      assignments: ["source-a", "source-a", "source-a", "source-a"],
    },
  };
}

test("mosaic store atomically saves, lists, and deletes projects and binary assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-mosaics-"));
  try {
    const store = createMosaicStore(root);
    await store.writeProject("older", createProject("older", 2));
    await store.writeProject("newer", createProject("newer", 5));
    await store.writeProject("newer", createProject("newer", 6));
    await store.writeAsset("newer", "preview", Buffer.from("image"), "image/webp");
    assert.deepEqual((await store.listProjects()).map((project) => project.id), ["newer", "older"]);
    assert.equal((await store.readProject("newer")).updatedAt, 6);
    assert.equal((await store.readProject("newer")).recipe.assignments.length, 4);
    assert.equal((await store.readAsset("newer", "preview")).contentType, "image/webp");
    assert.equal((await store.readAsset("newer", "preview")).buffer.toString(), "image");
    const directoryFiles = await readFile(path.join(root, "newer", "project.json"), "utf8");
    assert.match(directoryFiles, /"algorithmVersion": 1/);
    await store.deleteProject("newer");
    assert.equal(await store.readProject("newer"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mosaic feature cache updates requested descriptors without dropping existing entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-mosaic-features-"));
  try {
    const store = createMosaicStore(root);
    await store.writeFeatures([{ version: 1, sourceId: "a", signature: "old", values: [1, 2, 3, 4] }]);
    await store.writeFeatures([
      { version: 1, sourceId: "a", signature: "new", values: [4, 3, 2, 1] },
      { version: 1, sourceId: "b", signature: "new", values: [8, 8, 8, 8] },
    ]);
    const features = await store.readFeatures(["missing", "a", "b"]);
    assert.deepEqual(features.map((feature) => [feature.sourceId, feature.signature]), [["a", "new"], ["b", "new"]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
