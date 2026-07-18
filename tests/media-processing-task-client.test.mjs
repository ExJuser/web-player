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

test("resolves active and completed snapshots into ui actions", () => {
  const active = {
    id: "task-active",
    kind: "montage",
    videoName: "Movie.mp4",
    progress: 60,
    status: "正在生成剪辑版",
    state: "running",
    result: null,
    error: null,
  };
  assert.deepEqual(client.resolveMediaProcessingTaskAction(null, null), { type: "idle" });
  assert.deepEqual(client.resolveMediaProcessingTaskAction(active, null), {
    type: "active",
    task: { ...active, isDialogOpen: true },
  });

  const completed = {
    ...active,
    id: "task-completed",
    kind: "lada",
    progress: 100,
    state: "completed",
    result: { fileName: "Movie.restored.mp4", relativePath: "Movie.restored.mp4", size: 1024, lastModified: 1 },
  };
  assert.deepEqual(client.resolveMediaProcessingTaskAction(completed, null), {
    type: "lada-completed",
    result: { fileName: "Movie.restored.mp4", relativePath: "Movie.restored.mp4", size: 1024 },
  });
});

test("resolves failed and cancelled snapshots into messages", () => {
  const base = {
    id: "task-terminal",
    kind: "lada",
    videoName: "Movie.mp4",
    progress: 10,
    status: "处理中",
    result: null,
  };
  assert.deepEqual(client.resolveMediaProcessingTaskAction({ ...base, state: "failed", error: "LADA failed" }, null), {
    type: "message",
    message: "LADA failed",
  });
  assert.deepEqual(client.resolveMediaProcessingTaskAction({ ...base, state: "cancelled", error: null }, null), {
    type: "message",
    message: "已取消媒体处理任务。",
  });
});
