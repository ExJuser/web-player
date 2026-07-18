import assert from "node:assert/strict";
import test from "node:test";

import * as mediaTasks from "../server/mediaProcessingTask.mjs";

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

test("runs independently and keeps the completed snapshot", async () => {
  const manager = mediaTasks.createMediaProcessingTaskManager({ createId: () => "task-1" });
  let finish;
  const resultPromise = new Promise((resolve) => {
    finish = resolve;
  });
  const created = manager.start({
    kind: "lada",
    videoName: "Movie.mp4",
    initialStatus: "正在准备马赛克修复...",
    run: async ({ onProgress }) => {
      onProgress({ percent: 42, message: "正在修复影片 42%" });
      return resultPromise;
    },
  });

  assert.equal(created.id, "task-1");
  assert.equal(created.state, "running");
  await flushPromises();
  assert.equal(manager.get().progress, 42);
  assert.throws(
    () => manager.start({ kind: "montage", videoName: "Other.mp4", initialStatus: "准备", run: async () => ({}) }),
    /已有影片处理任务/,
  );

  finish({ fileName: "Movie.restored.mp4" });
  await flushPromises();
  assert.equal(manager.get().state, "completed");
  assert.deepEqual(manager.get().result, { fileName: "Movie.restored.mp4" });
});

test("only explicit cancellation aborts the active runner", async () => {
  const manager = mediaTasks.createMediaProcessingTaskManager({ createId: () => "task-2" });
  let receivedSignal;
  manager.start({
    kind: "montage",
    videoName: "Movie.mp4",
    initialStatus: "正在准备剪辑任务...",
    run: ({ signal }) => new Promise((resolve, reject) => {
      receivedSignal = signal;
      signal.addEventListener("abort", () => reject(new Error("已取消生成剪辑版。")), { once: true });
    }),
  });
  await flushPromises();

  assert.equal(receivedSignal.aborted, false);
  assert.throws(() => manager.cancel("wrong-id"), /任务不存在/);
  manager.cancel("task-2");
  assert.equal(receivedSignal.aborted, true);
  await flushPromises();
  assert.equal(manager.get().state, "cancelled");
});
