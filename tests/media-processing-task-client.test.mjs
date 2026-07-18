import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const client = await importTsModule(new URL("../src/mediaProcessingTaskClient.ts", import.meta.url));

test("maps active snapshots and preserves the collapsed state", () => {
  const snapshot = {
    id: "task-1",
    kind: "lada",
    videoName: "Movie.mp4",
    progress: 42,
    status: "处理中",
    state: "running",
    result: null,
    error: null,
  };

  assert.deepEqual(client.toMediaProcessingTaskState(snapshot, null), { ...snapshot, isDialogOpen: true });
  assert.equal(
    client.toMediaProcessingTaskState(snapshot, { ...snapshot, isDialogOpen: false }).isDialogOpen,
    false,
  );
});

test("recognizes running and cancelling tasks as active", () => {
  assert.equal(client.isActiveMediaProcessingTask({ state: "running" }), true);
  assert.equal(client.isActiveMediaProcessingTask({ state: "cancelling" }), true);
  assert.equal(client.isActiveMediaProcessingTask({ state: "completed" }), false);
  assert.equal(client.isActiveMediaProcessingTask({ state: "failed" }), false);
  assert.equal(client.isActiveMediaProcessingTask({ state: "cancelled" }), false);
});
