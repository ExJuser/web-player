import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const engine = await importTsModule(new URL("../src/mosaicEngine.ts", import.meta.url));

test("mosaic descriptor values are quantized to the shared byte format", () => {
  const descriptor = engine.quantizeMosaicDescriptor(0, 128.4, 255, 12.8);
  assert.equal(descriptor.length, 32);
  assert.equal(descriptor[3], 13);
  assert.ok(descriptor.every((value) => Number.isInteger(value) && value >= 0 && value <= 255));
});

test("CPU candidates are sorted by the same weighted distance used by GPU matching", () => {
  const candidates = engine.findCpuCandidates(
    [[100, 100, 100, 10]],
    [
      { version: 1, sourceId: "far", signature: "1", values: [230, 230, 230, 10] },
      { version: 1, sourceId: "near", signature: "1", values: [104, 98, 101, 9] },
      { version: 1, sourceId: "middle", signature: "1", values: [130, 125, 110, 20] },
    ],
  );
  assert.deepEqual(candidates[0], [1, 2, 0]);
});

test("CPU candidate selection keeps a stable bounded top set", () => {
  const sources = Array.from({ length: 20 }, (_, index) => ({
    version: 1,
    sourceId: `source-${index}`,
    signature: "1",
    values: [100 + Math.abs(10 - index), 100, 100, 0],
  }));
  const candidates = engine.findCpuCandidates([[100, 100, 100, 0]], sources, 4);
  assert.deepEqual(candidates[0], [10, 9, 11, 8]);
});

test("assignment finalization is deterministic, avoids neighbors, and respects reuse limits", () => {
  const input = {
    candidates: Array.from({ length: 6 }, () => [0, 1, 2]),
    sourceIds: ["a", "b", "c"],
    columns: 3,
    maxReuse: 2,
    seed: 42,
  };
  const first = engine.finalizeMosaicAssignments(input);
  const second = engine.finalizeMosaicAssignments(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  for (let index = 0; index < first.length; index++) {
    if (index % 3) assert.notEqual(first[index], first[index - 1]);
    if (index >= 3) assert.notEqual(first[index], first[index - 3]);
  }
  for (const id of ["a", "b", "c"]) assert.ok(first.filter((value) => value === id).length <= 2);
});

test("project target is guaranteed to appear once when it belongs to the source pool", () => {
  const assignments = engine.finalizeMosaicAssignments({
    candidates: [[0]],
    sourceIds: ["regular", "recursive-target"],
    columns: 1,
    maxReuse: 99,
    seed: 7,
    guaranteedSourceId: "recursive-target",
  });
  assert.deepEqual(assignments, ["recursive-target"]);
});

test("assignment finalization broadens exhausted candidates without breaking the reuse cap", () => {
  const assignments = engine.finalizeMosaicAssignments({
    candidates: [[0], [0], [0], [0]],
    sourceIds: ["a", "b"],
    columns: 2,
    maxReuse: 2,
    seed: 3,
  });
  assert.equal(assignments.filter((value) => value === "a").length, 2);
  assert.equal(assignments.filter((value) => value === "b").length, 2);
});

test("assignment finalization uses the global source pool when local candidates are empty", () => {
  const assignments = engine.finalizeMosaicAssignments({
    candidates: [[], [], [], []],
    sourceIds: ["a", "b", "c", "d"],
    columns: 2,
    maxReuse: 1,
    seed: 11,
  });

  assert.equal(assignments.includes(""), false);
  assert.equal(new Set(assignments).size, 4);
  assert.notEqual(assignments[0], assignments[1]);
  assert.notEqual(assignments[0], assignments[2]);
  assert.notEqual(assignments[1], assignments[3]);
  assert.notEqual(assignments[2], assignments[3]);
});

test("GPU candidate matching selects the Worker fallback when WebGPU is unavailable", async () => {
  const result = await engine.findGpuCandidates(
    [[100, 100, 100, 0]],
    [{ version: 1, sourceId: "a", signature: "1", values: [100, 100, 100, 0] }],
  );
  assert.equal(result.backend, "worker");
  assert.equal(result.candidates, undefined);
});
