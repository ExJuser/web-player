import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const persistence = await importTsModule(new URL("../src/mosaicProjectPersistence.ts", import.meta.url));

const recipe = {
  sourceFilter: "mixed",
  sourceLimit: 100,
  columns: 20,
  rows: 10,
  targetClarity: 0.5,
  colorPreservation: 0.25,
  targetRotation: 90,
  tileFit: "cover",
  previewLongestEdge: 2200,
  maxReuse: 3,
  seed: 7,
  sourceIds: ["source-a"],
  assignments: ["source-a"],
};

function createDependencies(events, savedProjects) {
  return {
    createProjectId: () => "new-project",
    getNow: () => 1234,
    saveProject: async (project) => {
      events.push("project");
      savedProjects.push(project);
    },
    writePreview: async (projectId) => {
      events.push(`preview:${projectId}`);
      return `/mosaics/${projectId}/preview`;
    },
    writeTarget: async (projectId) => {
      events.push(`target:${projectId}`);
      return `/mosaics/${projectId}/target`;
    },
  };
}

test("persists a new uploaded target before preview and project metadata", async () => {
  const events = [];
  const savedProjects = [];
  const result = await persistence.saveGeneratedMosaicProject({
    activeProject: null,
    ...createDependencies(events, savedProjects),
    preview: new Blob(["preview"]),
    recipe,
    target: {
      file: new Blob(["target"]),
      persistFile: true,
      ref: { kind: "upload", label: "target.jpg", assetUrl: "" },
    },
  });

  assert.deepEqual(events, ["target:new-project", "preview:new-project", "project"]);
  assert.equal(result.project.id, "new-project");
  assert.equal(result.project.createdAt, 1234);
  assert.equal(result.project.updatedAt, 1234);
  assert.match(result.project.name, /^千图作品 /);
  assert.equal(result.project.targetUrl, "/mosaics/new-project/target");
  assert.deepEqual(result.project.recipe.target, {
    kind: "upload",
    label: "target.jpg",
    assetUrl: "/mosaics/new-project/target",
  });
  assert.equal(savedProjects[0], result.project);
});

test("preserves existing project identity when replacing its generated content", async () => {
  const events = [];
  const savedProjects = [];
  const activeProject = {
    id: "existing",
    name: "Saved Mosaic",
    createdAt: 100,
    updatedAt: 200,
    previewUrl: "/old-preview",
    recipe: { version: 1, algorithmVersion: 1, target: { kind: "source", label: "Old", sourceId: "old" }, ...recipe },
  };
  const result = await persistence.saveGeneratedMosaicProject({
    activeProject,
    ...createDependencies(events, savedProjects),
    preview: new Blob(["preview"]),
    recipe,
    target: { ref: { kind: "source", label: "New", sourceId: "new" } },
  });

  assert.deepEqual(events, ["preview:existing", "project"]);
  assert.equal(result.project.id, "existing");
  assert.equal(result.project.name, "Saved Mosaic");
  assert.equal(result.project.createdAt, 100);
  assert.equal(result.project.updatedAt, 1234);
  assert.equal(result.project.targetUrl, undefined);
  assert.deepEqual(result.project.recipe.target, { kind: "source", label: "New", sourceId: "new" });
});

test("reuses the saved target URL when reopening an uploaded project", async () => {
  const events = [];
  const savedProjects = [];
  const activeProject = {
    id: "uploaded",
    name: "Uploaded",
    createdAt: 100,
    updatedAt: 200,
    previewUrl: "/old-preview",
    targetUrl: "/saved-target",
    recipe: { version: 1, algorithmVersion: 1, target: { kind: "upload", label: "target.jpg", assetUrl: "/saved-target" }, ...recipe },
  };
  const result = await persistence.saveGeneratedMosaicProject({
    activeProject,
    ...createDependencies(events, savedProjects),
    preview: new Blob(["preview"]),
    recipe,
    target: { ref: activeProject.recipe.target },
  });

  assert.deepEqual(events, ["preview:uploaded", "project"]);
  assert.equal(result.targetUrl, "/saved-target");
  assert.equal(result.project.targetUrl, "/saved-target");
});

test("replaces an uploaded target without changing the saved project identity", async () => {
  const events = [];
  const savedProjects = [];
  const activeProject = {
    id: "uploaded",
    name: "Uploaded",
    createdAt: 100,
    updatedAt: 200,
    previewUrl: "/old-preview",
    targetUrl: "/old-target",
    recipe: { version: 1, algorithmVersion: 1, target: { kind: "upload", label: "old.jpg", assetUrl: "/old-target" }, ...recipe },
  };
  const result = await persistence.saveGeneratedMosaicProject({
    activeProject,
    ...createDependencies(events, savedProjects),
    preview: new Blob(["preview"]),
    recipe,
    target: {
      file: new Blob(["replacement"]),
      persistFile: true,
      ref: { kind: "upload", label: "new.jpg", assetUrl: "" },
    },
  });

  assert.deepEqual(events, ["target:uploaded", "preview:uploaded", "project"]);
  assert.equal(result.project.id, "uploaded");
  assert.equal(result.project.createdAt, 100);
  assert.equal(result.targetUrl, "/mosaics/uploaded/target");
  assert.deepEqual(result.targetRef, {
    kind: "upload",
    label: "new.jpg",
    assetUrl: "/mosaics/uploaded/target",
  });
});
