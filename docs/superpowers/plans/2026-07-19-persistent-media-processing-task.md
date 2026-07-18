# Persistent Media Processing Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 LADA 修复和精彩片段剪辑在页面刷新或关闭后继续由后端运行，并在页面重新打开时恢复进度或显示结果。

**Architecture:** 用单例进程内任务管理器接管 `AbortController`、进度和终态；创建接口立即返回任务快照，查询与取消接口负责重连和显式终止。前端把任务快照映射为现有弹窗状态，并在活动任务期间每秒轮询。

**Tech Stack:** Node.js ESM、Vite 服务端插件、React 19、TypeScript 5.8、Node `node:test`

## Global Constraints

- 只要项目后端进程仍在运行，任务就持续运行；任务不跨后端进程重启恢复。
- 同一时间只能运行一个 LADA 或剪辑媒体处理任务。
- 刷新或关闭页面不得取消任务，只有显式取消接口可以调用任务的 `AbortController`。
- 最近一个终态任务只保存在内存中，直到新任务启动或后端重启。
- 不引入磁盘队列、系统服务或浏览器检查。
- 只运行任务管理器、LADA、剪辑和前端任务映射的最小范围测试，以及 TypeScript `--noEmit` 静态检查。

---

### Task 1: 进程内媒体处理任务管理器

**Files:**
- Modify: `server/mediaProcessingTask.mjs`
- Create: `tests/media-processing-task.test.mjs`
- Modify: `tests/lada-restoration.test.mjs`

**Interfaces:**
- Produces: `createMediaProcessingTaskManager()`。
- Produces: `manager.start({ kind, videoName, initialStatus, run })`，其中 `run({ signal, onProgress })` 返回任务结果。
- Produces: `manager.get()` 返回不含 `AbortController` 的任务快照或 `null`。
- Produces: `manager.cancel(taskId)` 只取消匹配的活动任务。

- [ ] **Step 1: 写任务生命周期失败测试**

在 `tests/media-processing-task.test.mjs` 写入真实异步 runner，覆盖立即返回、进度更新、显式取消、终态保留和并发拒绝：

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createMediaProcessingTaskManager } from "../server/mediaProcessingTask.mjs";

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

test("runs independently and keeps the completed snapshot", async () => {
  const manager = createMediaProcessingTaskManager({ createId: () => "task-1" });
  let finish;
  const resultPromise = new Promise((resolve) => { finish = resolve; });
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
  assert.throws(() => manager.start({ kind: "montage", videoName: "Other.mp4", initialStatus: "准备", run: async () => ({}) }), /已有影片处理任务/);

  finish({ fileName: "Movie.restored.mp4" });
  await flushPromises();
  assert.equal(manager.get().state, "completed");
  assert.deepEqual(manager.get().result, { fileName: "Movie.restored.mp4" });
});

test("only explicit cancellation aborts the active runner", async () => {
  const manager = createMediaProcessingTaskManager({ createId: () => "task-2" });
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/media-processing-task.test.mjs`

Expected: FAIL，提示 `createMediaProcessingTaskManager` 未导出。

- [ ] **Step 3: 实现最小任务管理器**

在 `server/mediaProcessingTask.mjs` 用一个闭包保存当前任务，快照只暴露可序列化字段：

```js
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
    if (current?.state === "running" || current?.state === "cancelling") throw new Error("已有影片处理任务正在运行。");
    const controller = new AbortController();
    current = { id: createId(), kind, videoName, progress: 0, status: initialStatus, state: "running", result: null, error: null, controller };
    const task = current;
    Promise.resolve().then(() => run({
      signal: controller.signal,
      onProgress: ({ percent, message }) => {
        if (current !== task || task.state !== "running") return;
        task.progress = Math.max(0, Math.min(100, Number(percent) || 0));
        if (message) task.status = message;
      },
    })).then((result) => {
      if (current !== task) return;
      task.progress = 100;
      task.state = "completed";
      task.result = result;
    }).catch((error) => {
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
      if (!current || current.id !== taskId || (current.state !== "running" && current.state !== "cancelling")) throw new Error("媒体处理任务不存在或已结束。");
      current.state = "cancelling";
      current.status = "正在取消任务...";
      current.controller.abort();
      return snapshot();
    },
  };
}
```

保留现有 `createMediaProcessingTaskGate` 导出到 Task 2 完成前，随后在确认无调用后删除，并从 `tests/lada-restoration.test.mjs` 移除旧 gate 测试和导入。

- [ ] **Step 4: 运行任务管理器测试并确认通过**

Run: `node --test tests/media-processing-task.test.mjs`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交任务管理器**

```powershell
git add -- server/mediaProcessingTask.mjs tests/media-processing-task.test.mjs tests/lada-restoration.test.mjs
git commit -m "feat: add persistent media task manager"
```

### Task 2: 创建、查询和取消任务接口

**Files:**
- Modify: `server/playerDataApiPlugin.mjs`
- Modify: `tests/media-processing-task.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `manager.start()`、`manager.get()`、`manager.cancel(taskId)`。
- Produces: `POST /api/media/highlight-montage` 和 `POST /api/media/lada/restore` 返回 HTTP 202 任务快照。
- Produces: `GET /api/media/processing-task` 返回 `{ task }`。
- Produces: `DELETE /api/media/processing-task` 接受 `{ id }` 并返回 `{ task }`。

- [ ] **Step 1: 扩展失败测试验证 runner 失败与新任务接管**

在 `tests/media-processing-task.test.mjs` 添加：

```js
test("records failures and lets a new task replace a terminal snapshot", async () => {
  let sequence = 0;
  const manager = createMediaProcessingTaskManager({ createId: () => `task-${++sequence}` });
  manager.start({ kind: "lada", videoName: "Bad.mp4", initialStatus: "准备", run: async () => { throw new Error("LADA failed"); } });
  await flushPromises();
  assert.equal(manager.get().state, "failed");
  assert.equal(manager.get().error, "LADA failed");

  const replacement = manager.start({ kind: "montage", videoName: "Good.mp4", initialStatus: "准备", run: async () => ({ fileName: "Good.montage.mp4" }) });
  assert.equal(replacement.id, "task-2");
  await flushPromises();
  assert.equal(manager.get().state, "completed");
});
```

- [ ] **Step 2: 运行扩展测试并确认失败或暴露不一致**

Run: `node --test tests/media-processing-task.test.mjs`

Expected: 新测试在终态替换或错误记录不完整时 FAIL。

- [ ] **Step 3: 把服务端处理生命周期移入 manager runner**

在 `playerDataApiPlugin()` 初始化：

```js
const mediaProcessingTaskManager = createMediaProcessingTaskManager();
```

在两个创建接口之前添加查询与取消：

```js
if (url.pathname === "/api/media/processing-task" && request.method === "GET") {
  sendJson(response, 200, { task: mediaProcessingTaskManager.get() });
  return;
}
if (url.pathname === "/api/media/processing-task" && request.method === "DELETE") {
  const payload = await parseJsonBody(request);
  sendJson(response, 200, { task: mediaProcessingTaskManager.cancel(payload?.id) });
  return;
}
```

两个 POST 都先完成路径和参数校验，再调用 `manager.start()`；runner 继续复用现有处理函数：

```js
const task = mediaProcessingTaskManager.start({
  kind: "lada",
  videoName: path.basename(sourcePath),
  initialStatus: "正在准备马赛克修复...",
  run: ({ signal, onProgress }) => restoreVideoWithLada({
    runProcess,
    sourcePath,
    relativePath: payload?.relativePath,
    options: payload?.options,
    capabilities,
    signal,
    onProgress,
  }),
});
sendJson(response, 202, { task });
```

剪辑 runner 同样传入 `signal`、`onProgress` 和原有 `persistHighlights`。删除 `response.on("close")`、NDJSON 写入、局部 controller、gate acquire/release；保留其他仍使用 NDJSON 的媒体接口。

- [ ] **Step 4: 运行服务端最小测试**

Run: `node --test tests/media-processing-task.test.mjs tests/lada-restoration.test.mjs tests/highlight-montage.test.mjs`

Expected: 全部 PASS，且 Node 测试进程正常退出。

- [ ] **Step 5: 提交服务端接口**

```powershell
git add -- server/playerDataApiPlugin.mjs server/mediaProcessingTask.mjs tests/media-processing-task.test.mjs
git commit -m "feat: keep media tasks running after disconnect"
```

### Task 3: 前端任务快照类型与映射

**Files:**
- Modify: `src/appTypes.ts`
- Modify: `src/MediaProcessingTaskDialog.tsx`
- Create: `src/mediaProcessingTaskClient.ts`
- Create: `tests/media-processing-task-client.test.mjs`

**Interfaces:**
- Produces: `MediaProcessingTaskSnapshot`，包含 `id`、`kind`、`videoName`、`progress`、`status`、`state`、`result`、`error`。
- Produces: `isActiveMediaProcessingTask(task)`。
- Produces: `toMediaProcessingTaskState(task, current)`，同任务保留弹窗开关，新任务默认打开弹窗。

- [ ] **Step 1: 写快照映射失败测试**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./importTsModule.mjs";

const client = await importTsModule(new URL("../src/mediaProcessingTaskClient.ts", import.meta.url));

test("maps active snapshots and preserves the collapsed state", () => {
  const snapshot = { id: "task-1", kind: "lada", videoName: "Movie.mp4", progress: 42, status: "处理中", state: "running", result: null, error: null };
  assert.deepEqual(client.toMediaProcessingTaskState(snapshot, null), { ...snapshot, isDialogOpen: true });
  assert.equal(client.toMediaProcessingTaskState(snapshot, { ...snapshot, isDialogOpen: false }).isDialogOpen, false);
});

test("recognizes running and cancelling tasks as active", () => {
  assert.equal(client.isActiveMediaProcessingTask({ state: "running" }), true);
  assert.equal(client.isActiveMediaProcessingTask({ state: "cancelling" }), true);
  assert.equal(client.isActiveMediaProcessingTask({ state: "completed" }), false);
});
```

- [ ] **Step 2: 运行映射测试并确认失败**

Run: `node --test tests/media-processing-task-client.test.mjs`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 添加共享类型和纯映射函数**

在 `src/appTypes.ts` 添加状态与快照类型；在 `MediaProcessingTaskState` 增加 `id` 和 `state`。实现：

```ts
export function isActiveMediaProcessingTask(task: Pick<MediaProcessingTaskSnapshot, "state">) {
  return task.state === "running" || task.state === "cancelling";
}

export function toMediaProcessingTaskState(task: MediaProcessingTaskSnapshot, current: MediaProcessingTaskState | null): MediaProcessingTaskState {
  return {
    id: task.id,
    kind: task.kind,
    videoName: task.videoName,
    progress: task.progress,
    status: task.status,
    state: task.state,
    result: task.result,
    error: task.error,
    isDialogOpen: current?.id === task.id ? current.isDialogOpen : true,
  };
}
```

- [ ] **Step 4: 运行前端映射测试并确认通过**

Run: `node --test tests/media-processing-task-client.test.mjs`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交前端任务模型**

```powershell
git add -- src/appTypes.ts src/MediaProcessingTaskDialog.tsx src/mediaProcessingTaskClient.ts tests/media-processing-task-client.test.mjs
git commit -m "feat: add media task snapshots"
```

### Task 4: 前端创建、轮询、恢复结果与显式取消

**Files:**
- Modify: `src/useHighlightMontageController.ts`
- Modify: `src/useLadaRestorationController.ts`
- Create: `src/useMediaProcessingTaskSync.ts`
- Modify: `src/App.tsx`
- Modify: `src/MediaProcessingTaskDialog.tsx`

**Interfaces:**
- Consumes: Task 2 的三个 JSON 接口。
- Consumes: Task 3 的 `MediaProcessingTaskSnapshot`、`isActiveMediaProcessingTask()`、`toMediaProcessingTaskState()`。
- Produces: `useMediaProcessingTaskSync()`，负责首次查询、活动期轮询、终态结果分发和取消。

- [ ] **Step 1: 将两个创建控制器改为接收任务快照**

用 `fetchLocalJson` 替换两个 controller 中的 `readLocalApiStream`。POST 返回后只设置活动任务：

```ts
const response = await fetchJson<{ task: MediaProcessingTaskSnapshot }>("/api/media/lada/restore", {
  method: "POST",
  body: JSON.stringify({ rootId: request.rootId, relativePath: request.relativePath, options: requestOptions }),
});
setTask((current) => toMediaProcessingTaskState(response.task, current));
```

剪辑控制器使用相同返回结构并保留原请求字段。删除两个 controller 的 `AbortController` 参数、流事件处理、完成结果分发和取消函数；完成结果统一由同步 hook 处理。

- [ ] **Step 2: 实现同步 hook**

`useMediaProcessingTaskSync.ts` 首次挂载立即 GET；活动任务期间用 `setTimeout(..., 1000)` 继续查询。处理规则：

```ts
if (!remoteTask) {
  setTask(null);
} else if (isActiveMediaProcessingTask(remoteTask)) {
  setTask((current) => toMediaProcessingTaskState(remoteTask, current));
  scheduleNextPoll();
} else if (handledTaskIdRef.current !== remoteTask.id) {
  handledTaskIdRef.current = remoteTask.id;
  setTask(null);
  if (remoteTask.state === "completed" && remoteTask.kind === "lada" && remoteTask.result) {
    setLadaResult({
      fileName: remoteTask.result.fileName,
      relativePath: remoteTask.result.relativePath,
      size: remoteTask.result.size,
    });
  } else if (remoteTask.state === "completed" && remoteTask.kind === "montage" && remoteTask.result) {
    setMontageResult({
      fileName: remoteTask.result.fileName,
      relativePath: remoteTask.result.relativePath,
      durationSeconds: remoteTask.result.durationSeconds,
    });
  } else {
    setMessage(remoteTask.error || (remoteTask.state === "cancelled" ? "已取消媒体处理任务。" : "媒体处理任务失败。"));
  }
}
```

取消函数 POST 之外独立使用 `DELETE /api/media/processing-task`，请求体为当前任务 ID；先把就近状态更新为“正在取消任务...”，等待轮询读到 `cancelled`。

- [ ] **Step 3: 在 App 接入同步 hook 并删除页面级 AbortController**

移除 `highlightMontageAbortControllerRef`、`ladaRestorationAbortControllerRef` 以及旧的按 kind 取消分派。向同步 hook 传入 `setMediaProcessingTask`、两个结果 setter 和 `setMessage`，将其 `cancelTask` 传给弹窗。

保持 state updater 纯函数：ref 赋值、消息提示和结果弹窗更新都在 updater 外执行。

- [ ] **Step 4: 更新任务提示文案并静态自检**

把 `MediaProcessingTaskDialog.tsx` 的提示改为：

```tsx
<p>可以收起到后台继续使用播放器；刷新或关闭页面不会取消任务。</p>
```

检查顶部入口仅在活动任务存在时显示，取消按钮在 `cancelling` 状态禁用，避免重复取消请求。

- [ ] **Step 5: 运行前端最小测试与 TypeScript 静态检查**

Run: `node --test tests/media-processing-task-client.test.mjs tests/local-api-client.test.mjs`

Expected: 全部 PASS。

Run: `& '.\node_modules\.bin\tsc.cmd' --noEmit`

Expected: exit code 0，无 TypeScript 错误。此命令只做类型检查，不运行 Vite build。

- [ ] **Step 6: 提交前端接入**

```powershell
git add -- src/App.tsx src/MediaProcessingTaskDialog.tsx src/useHighlightMontageController.ts src/useLadaRestorationController.ts src/useMediaProcessingTaskSync.ts
git commit -m "feat: reconnect persistent media tasks"
```

### Task 5: 最小范围回归验证

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Verifies: 服务端生命周期、LADA/剪辑 runner、前端快照映射和 TypeScript 类型一致性。

- [ ] **Step 1: 运行合并后的相关测试**

Run: `node --test tests/media-processing-task.test.mjs tests/media-processing-task-client.test.mjs tests/lada-restoration.test.mjs tests/highlight-montage.test.mjs tests/local-api-client.test.mjs`

Expected: 全部 PASS，测试进程正常退出。

- [ ] **Step 2: 再次运行 TypeScript 静态检查**

Run: `& '.\node_modules\.bin\tsc.cmd' --noEmit`

Expected: exit code 0。

- [ ] **Step 3: 检查最终提交与工作区**

Run: `git status --short`

Expected: 无输出；所有实现和测试均已提交。
