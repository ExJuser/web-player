# Staged App Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the staged refactor of the local web player by shrinking `src/App.tsx`, reducing duplicated runtime state, and cleaning resource-heavy paths without changing user-visible behavior.

**Architecture:** Keep `App.tsx` as the temporary composition root while extracting one responsibility at a time into typed hooks, pure utility modules, and existing focused components. Preserve route paths, IndexedDB/local data shape, File System Access behavior, UI text, and current layout during each stage.

**Tech Stack:** React 19, TypeScript, Vite 7, Node ESM, Node test runner, existing browser storage and local API modules.

---

## Current Audit

- `src/App.tsx`: 7,342 lines. It still owns app composition, 90+ refs/state slots, media root loading, photo album loading/deletion, duplicate detection orchestration, playback controls, AI actions, danmaku, subtitle extraction, compatible media generation, and final JSX composition.
- `src/styles.css`: 7,072 lines. It is the next largest frontend maintenance risk, but style extraction should wait until component boundaries stabilize because UI changes require browser checks.
- `server/playerDataApiPlugin.mjs`: 1,135 lines. The earlier Vite extraction has already landed, so `vite.config.ts` is now small and no full-file `@ts-nocheck` remains.
- `src/playerStorage.ts`: 1,146 lines. It is large but mostly persistence API surface; do not split before `App.tsx` callers are reduced.
- `src/playerUiState.ts`, `src/playerMediaUtils.ts`, `src/photoAlbumStorage.ts`, `src/browserMediaScan.ts`, `src/photoAlbumScan.ts`, and `src/subtitleMedia.ts` already contain many pure helpers with tests. Continue moving logic toward these seams.
- `npm ls --depth=0` reports many extraneous packages because the current `node_modules` layout is pnpm-style while this repo uses `package-lock.json`. Treat this as local install hygiene unless a source dependency is truly unused.

## Stage Order

1. Extract low-risk pure App helpers.
2. Extract photo album controller state and file deletion orchestration.
3. Extract media library loading orchestration.
4. Extract playback interaction controller.
5. Extract AI, danmaku, embedded subtitle, and compatible-media side-effect controllers.
6. Split CSS only after corresponding components/hooks are stable.
7. Revisit build chunking and memory/resource ceilings after module boundaries are clear.

## Task 1: Extract App Composition Helpers

**Files:**
- Create: `src/appViewModel.ts`
- Modify: `src/App.tsx`
- Test: `tests/app-view-model.test.mjs`

- [ ] **Step 1: Create a focused helper module**

Move only behavior-free view model helpers from `App.tsx` into `src/appViewModel.ts`:

```ts
import type { HomeVideoCard } from "./playerTypes";
import type { SpecialModeVideoInsight } from "./specialInsights";

export function formatSpecialInsightVideoMetric(insight: SpecialModeVideoInsight) {
  if (insight.metric === "rating") {
    return `${insight.value.toFixed(1)} 分`;
  }
  if (insight.metric === "playCount") {
    return `${insight.value} 次`;
  }
  return insight.label;
}

export function createPrimaryHomeLabels(input: {
  primaryResumeCard: HomeVideoCard | null;
  modeFilteredVideoCount: number;
}) {
  return {
    title: input.primaryResumeCard ? "继续观看" : input.modeFilteredVideoCount ? "开始观看" : "准备播放",
    action: input.primaryResumeCard ? "继续播放" : "播放第一个视频",
  };
}
```

- [ ] **Step 2: Add direct tests**

Create `tests/app-view-model.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./importTsModule.mjs";

const module = await importTsModule("src/appViewModel.ts");

test("createPrimaryHomeLabels keeps existing home labels", () => {
  assert.deepEqual(module.createPrimaryHomeLabels({ primaryResumeCard: { video: { id: "v1" } }, modeFilteredVideoCount: 1 }), {
    title: "继续观看",
    action: "继续播放",
  });
  assert.deepEqual(module.createPrimaryHomeLabels({ primaryResumeCard: null, modeFilteredVideoCount: 2 }), {
    title: "开始观看",
    action: "播放第一个视频",
  });
  assert.deepEqual(module.createPrimaryHomeLabels({ primaryResumeCard: null, modeFilteredVideoCount: 0 }), {
    title: "准备播放",
    action: "播放第一个视频",
  });
});
```

- [ ] **Step 3: Replace inline App logic**

In `src/App.tsx`, import the helpers:

```ts
import { createPrimaryHomeLabels, formatSpecialInsightVideoMetric } from "./appViewModel";
```

Replace the inline `primaryHomeTitle`, `primaryHomeAction`, and local `formatSpecialInsightVideoMetric` logic with:

```ts
const primaryHomeLabels = createPrimaryHomeLabels({
  primaryResumeCard,
  modeFilteredVideoCount: modeFilteredVideos.length,
});
const primaryHomeTitle = primaryHomeLabels.title;
const primaryHomeAction = primaryHomeLabels.action;
```

- [ ] **Step 4: Verify the narrow change**

Run:

```powershell
npm test -- tests/app-view-model.test.mjs
npm run build
```

Expected: new helper test passes, build passes, no UI file layout changes.

- [ ] **Step 5: Commit**

```powershell
git add -- src/App.tsx src/appViewModel.ts tests/app-view-model.test.mjs
git commit -m "refactor: extract app view model helpers"
```

## Task 2: Extract Photo Album Runtime Controller

**Files:**
- Create: `src/usePhotoAlbumRuntime.ts`
- Modify: `src/App.tsx`
- Test: existing `tests/photo-album-*.test.mjs`

- [ ] **Step 1: Move only photo-album refs and pure persistence wrappers**

Create `usePhotoAlbumRuntime` with the current `photoAlbumsRef`, `photoAlbumProgressRef`, `photoAlbumCoverPreferencesRef`, `photoAlbumTagsRef`, `favoritePhotoAlbumIdsRef`, `photoAlbumPreferencesRef`, `photoAlbumAutoLoadAttemptedRef`, and `photoAlbumDirectoryRef` ownership. Keep the public return shape explicit:

```ts
export interface PhotoAlbumRuntimeApi {
  refs: {
    photoAlbumsRef: React.MutableRefObject<PhotoAlbum[]>;
    photoAlbumProgressRef: React.MutableRefObject<Record<string, PhotoAlbumProgress>>;
    photoAlbumCoverPreferencesRef: React.MutableRefObject<Record<string, string>>;
    photoAlbumTagsRef: React.MutableRefObject<Record<string, string[]>>;
    favoritePhotoAlbumIdsRef: React.MutableRefObject<Set<string>>;
    photoAlbumDirectoryRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
  };
  buildPhotoAlbumStore(overrides?: Partial<PhotoAlbumStore>): PhotoAlbumStore;
  saveCurrentPhotoAlbumStore(overrides?: Partial<PhotoAlbumStore>): Promise<void>;
}
```

- [ ] **Step 2: Keep App-owned UI state in App**

Do not move `selectedPhotoAlbumId`, `currentPhotoIndex`, dialogs, delete candidates, or rendered JSX in this task. The task is successful if persistence refs and store builders leave `App.tsx`.

- [ ] **Step 3: Verify**

Run:

```powershell
npm test -- tests/photo-album-storage.test.mjs tests/photo-album-scan.test.mjs tests/browser-photo-albums.test.mjs
npm run build
```

Expected: tests and build pass. No browser check is required because rendered UI is unchanged.

- [ ] **Step 4: Commit**

```powershell
git add -- src/App.tsx src/usePhotoAlbumRuntime.ts
git commit -m "refactor: extract photo album runtime state"
```

## Task 3: Extract Media Library Runtime Controller

**Files:**
- Create: `src/useMediaLibraryRuntime.ts`
- Modify: `src/App.tsx`
- Test: existing media-root and player-storage tests

- [ ] **Step 1: Move media-library refs and store builders**

Move `directoryRef`, `libraryIdRef`, `libraryMetadataRef`, `progressStoreRef`, `playerDataSaveQueueRef`, `playerPreferencesRef`, `playerSettingsRef`, `hasLoadedPlayerDataStoreRef`, runtime store refs, `buildPlayerDataStore`, `saveCurrentPlayerDataStore`, and `applyPlayerDataStore` into the hook.

- [ ] **Step 2: Keep scanning and UI in App**

Do not move `loadGlobalMediaLibrary`, `loadDirectoryMedia`, drag/drop handlers, dialogs, or player JSX in this task. This keeps the first media-library extraction focused on persistence state only.

- [ ] **Step 3: Verify**

Run:

```powershell
npm test -- tests/player-storage-tags.test.mjs tests/media-root-scan-cache.test.mjs tests/media-root-config.test.mjs
npm run build
```

Expected: tests and build pass.

- [ ] **Step 4: Commit**

```powershell
git add -- src/App.tsx src/useMediaLibraryRuntime.ts
git commit -m "refactor: extract media library runtime state"
```

## Task 4: Extract Resource Cleanup Helpers

**Files:**
- Create: `src/appResourceCleanup.ts`
- Modify: `src/App.tsx`
- Test: `tests/app-resource-cleanup.test.mjs`

- [ ] **Step 1: Move object URL cleanup helpers**

Move App-local cleanup logic that calls `URL.revokeObjectURL` into pure functions with injected revoke implementation:

```ts
export function revokeObjectUrls(urls: Iterable<string>, revoke = URL.revokeObjectURL) {
  for (const url of urls) {
    if (url.startsWith("blob:")) {
      revoke(url);
    }
  }
}
```

- [ ] **Step 2: Use helpers from App**

Replace repeated `URL.revokeObjectURL` loops in video, photo, subtitle, and thumbnail cleanup paths with the helper. Preserve existing object URL ownership rules and do not broaden cleanup timing.

- [ ] **Step 3: Verify**

Run:

```powershell
npm test -- tests/photo-object-url-cache.test.mjs tests/video-thumbnail.test.mjs tests/app-resource-cleanup.test.mjs
npm run build
```

Expected: cleanup tests pass and build passes.

- [ ] **Step 4: Commit**

```powershell
git add -- src/App.tsx src/appResourceCleanup.ts tests/app-resource-cleanup.test.mjs
git commit -m "refactor: centralize app resource cleanup"
```

## Task 5: Extract Side-Effect Controllers One at a Time

**Files:**
- Create as needed: `src/useDuplicateDetectionController.ts`, `src/useEmbeddedSubtitleController.ts`, `src/useCompatibleMediaController.ts`, `src/useDanmakuController.ts`, `src/useAiSubtitleController.ts`
- Modify: `src/App.tsx`
- Test: matching existing test files plus new helper tests where pure logic is introduced

- [ ] **Step 1: Duplicate detection**

Move `duplicateDetectionRunIdRef`, `duplicateDetectionAbortRef`, caches, `getDuplicateFingerprint`, `getDuplicateNameSimilarityScores`, and `runDuplicateVideoDetection` into `useDuplicateDetectionController`. Keep playlist opening and card rendering in `App.tsx`.

- [ ] **Step 2: Embedded subtitles**

Move cached subtitle probing/loading/extraction callbacks into `useEmbeddedSubtitleController`. Keep selected subtitle state and dialog JSX in `App.tsx`.

- [ ] **Step 3: Compatible media**

Move probe/create/delete/cancel callbacks into `useCompatibleMediaController`. Preserve project rule that ffmpeg/ffprobe paths require non-browser source or verified `localPath`.

- [ ] **Step 4: Danmaku**

Move danmaku source loading, URL fetch, selection persistence, and preferences persistence into `useDanmakuController`. Keep lane rendering in the existing `PlayerDanmakuLayer` path.

- [ ] **Step 5: AI subtitle and recap**

Move summary, question, progress recap, and home recap stream orchestration into `useAiSubtitleController`. Preserve button-local loading state and streaming behavior.

- [ ] **Step 6: Verify after each controller**

Run only the relevant tests and `npm run build` after each controller extraction. If rendered UI changes, start the dev server and check the local page in the in-app browser before committing.

## Guardrails

- Do not rewrite UI text, layout, local API paths, persisted data keys, or browser permission behavior.
- Keep React state updater functions pure; do not mutate refs inside updaters.
- Use fixed-string `rg` for searches containing regex characters.
- Avoid full CSS restructuring until the owning JSX or hook has already been extracted.
- Do not clean `node_modules` as a source-code commit. If dependency hygiene is needed, document the reinstall command separately.

## Completion Criteria

- `src/App.tsx` drops below 3,500 lines through behavior-preserving extractions.
- No new full-file TypeScript suppression is introduced.
- Resource cleanup paths for blob/object URLs are centralized and covered by tests.
- Each stage has its own git commit.
- Final verification runs `npm test`, `npm run build`, and browser checks for any UI stage.
