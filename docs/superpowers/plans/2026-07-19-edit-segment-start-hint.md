# 剪辑起点提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次点击剪辑按钮后，在播放器控制栏显示当前视频的剪辑起点时间。

**Architecture:** 复用 `useVideoEditSegmentController` 已维护的 `pendingStart` 状态，由 `App` 筛选出当前视频对应的时间并经 `PlayerControlBar` 传给 `PlayerHighlightControls`。提示复用现有 `highlight-pending-chip`，不增加状态、样式或持久化逻辑。

**Tech Stack:** React、TypeScript、现有播放器控制栏组件与 CSS。

## Global Constraints

- 文案固定为“剪辑起点 {时间}”。
- 提示位置、视觉样式和时间格式复用现有高能片段起点提示。
- 高能起点与剪辑起点可同时显示。
- 不新增样式，不修改剪辑标记、保存或生成流程。
- 按项目最小修改规则仅做静态自检，不运行浏览器检查或全量测试。

---

### Task 1: 传递并渲染剪辑待选起点

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/PlayerControlBar.tsx`
- Modify: `src/PlayerHighlightControls.tsx`

**Interfaces:**
- Consumes: `pendingEditSegmentStart: { videoId: string; time: number } | null`。
- Produces: `pendingEditSegmentStartTime: number | null` 属性链，最终由 `PlayerHighlightControls` 渲染。

- [ ] **Step 1: 在 `App` 计算并传递当前视频的剪辑起点**

在 `isCurrentEditSegmentMarkPending` 后增加：

```tsx
const pendingEditSegmentStartTime = isCurrentEditSegmentMarkPending ? pendingEditSegmentStart?.time ?? null : null;
```

调用 `PlayerControlBar` 时增加：

```tsx
pendingEditSegmentStartTime={pendingEditSegmentStartTime}
```

- [ ] **Step 2: 扩展 `PlayerControlBar` 属性并向提示组件透传**

在 `PlayerControlBarProps`、参数解构和 `PlayerHighlightControls` 调用中加入：

```tsx
pendingEditSegmentStartTime: number | null;
```

```tsx
pendingEditSegmentStartTime={pendingEditSegmentStartTime}
```

- [ ] **Step 3: 在 `PlayerHighlightControls` 渲染剪辑起点**

新增属性：

```tsx
pendingEditSegmentStartTime: number | null;
```

空状态判断同时包含该状态：

```tsx
if (!highlights.length && pendingStartTime === null && pendingEditSegmentStartTime === null) return null;
```

在现有高能起点提示旁渲染：

```tsx
{pendingEditSegmentStartTime !== null ? (
  <span className="highlight-pending-chip">剪辑起点 {formatTime(pendingEditSegmentStartTime)}</span>
) : null}
```

- [ ] **Step 4: 静态自检**

运行：

```powershell
git diff --check
git diff -- src/App.tsx src/PlayerControlBar.tsx src/PlayerHighlightControls.tsx
```

预期：补丁格式无错误；属性名称与类型在三层组件中一致；没有额外 CSS 或业务逻辑改动。

- [ ] **Step 5: 提交实现**

```powershell
git add -- src/App.tsx src/PlayerControlBar.tsx src/PlayerHighlightControls.tsx
git commit -m "feat: show edit segment start hint"
```
