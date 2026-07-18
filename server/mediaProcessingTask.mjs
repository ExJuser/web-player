import { randomUUID } from "node:crypto";

export function createMediaProcessingTaskManager({ createId = randomUUID } = {}) {
  let current = null;

  const snapshot = () => current ? {
    id: current.id,
    kind: current.kind,
    videoName: current.videoName,
    progress: current.progress,
    status: current.status,
    state: current.state,
    result: current.result,
    error: current.error,
  } : null;

  const start = ({ kind, videoName, initialStatus, run }) => {
    if (current?.state === "running" || current?.state === "cancelling") {
      throw new Error("已有影片处理任务正在运行。");
    }

    const controller = new AbortController();
    const task = {
      id: createId(),
      kind,
      videoName,
      progress: 0,
      status: initialStatus,
      state: "running",
      result: null,
      error: null,
      controller,
    };
    current = task;

    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new Error("媒体处理任务已取消。");
        return run({
          signal: controller.signal,
          onProgress: ({ percent, message }) => {
            if (current !== task || task.state !== "running") return;
            task.progress = Math.max(0, Math.min(100, Number(percent) || 0));
            if (message) task.status = message;
          },
        });
      })
      .then((result) => {
        if (current !== task) return;
        task.progress = 100;
        task.state = "completed";
        task.result = result;
      })
      .catch((error) => {
        if (current !== task) return;
        task.state = controller.signal.aborted ? "cancelled" : "failed";
        task.error = error instanceof Error ? error.message : "媒体处理任务失败。";
      });

    return snapshot();
  };

  return {
    start,
    get: snapshot,
    cancel(taskId) {
      if (!current || current.id !== taskId || (current.state !== "running" && current.state !== "cancelling")) {
        throw new Error("媒体处理任务不存在或已结束。");
      }
      current.state = "cancelling";
      current.status = "正在取消任务...";
      current.controller.abort();
      return snapshot();
    },
  };
}

export function createMediaProcessingTaskApi(manager) {
  return {
    start(input) {
      return { task: manager.start(input) };
    },
    get() {
      return { task: manager.get() };
    },
    cancel(payload) {
      return { task: manager.cancel(payload?.id) };
    },
  };
}
