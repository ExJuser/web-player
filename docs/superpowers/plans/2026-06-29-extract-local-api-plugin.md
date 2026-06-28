# Extract Local API Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the local `/api/` Vite middleware out of `vite.config.ts` into a focused server module without changing API behavior.

**Architecture:** `vite.config.ts` should only load env, configure Vite, and mount plugins. `server/playerDataApiPlugin.mjs` owns local data paths, API helpers, service instances, request coalescing, and the Vite dev/preview middleware plugin.

**Tech Stack:** Vite 7, React plugin, Node ESM, Node built-ins, existing `server/*.mjs` helpers, existing `node --test` suite.

---

## File Structure

- Create: `server/playerDataApiPlugin.mjs`
  - Owns all imports currently needed by API routes and exports `playerDataApiPlugin`.
  - Defines data roots relative to the project root passed from `vite.config.ts`.
  - Keeps all route paths, methods, responses, and error messages unchanged.
- Modify: `vite.config.ts`
  - Remove `@ts-nocheck`.
  - Remove API helper imports and route/helper definitions.
  - Import `playerDataApiPlugin` from `./server/playerDataApiPlugin.mjs`.
  - Pass `{ projectRoot: __dirname, env }` to the plugin.
- No test file changes are expected for this mechanical extraction.

## Task 1: Create the Server Plugin Module

**Files:**
- Create: `server/playerDataApiPlugin.mjs`
- Modify: `vite.config.ts`

- [ ] **Step 1: Copy API imports and helper code into the new module**

Create `server/playerDataApiPlugin.mjs` with the code moved from `vite.config.ts` lines 2 through 1110. Adjust relative imports because the new file lives in `server/`:

```js
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyMediaProbe,
  createCompatibleMediaUrl,
  getCachedCompatibleMedia,
  probeMediaFile,
  remuxCompatibleMedia,
  resolveCompatibleMediaPath,
} from "./mediaCompatibility.mjs";
import {
  ensureFileExists,
  normalizeMediaRoots as normalizeMediaRootsFromConfig,
  resolveMediaPath as resolveMediaPathFromConfig,
  resolveVideoPath as resolveVideoPathFromConfig,
  scanConfiguredPhotoAlbums,
  scanConfiguredMediaRoots,
  updateMediaRootLocalPath as updateMediaRootLocalPathInConfig,
  upsertMediaRoot as upsertMediaRootInConfig,
} from "./mediaRoots.mjs";
import {
  createDanmakuComment,
  createDanmakuSourceId,
  dedupeDanmakuComments,
  parseDanmakuUrl,
} from "../src/danmakuUtils";
```

Continue moving the rest of the existing API imports and functions unchanged. The plugin export must take a single options object:

```js
export function playerDataApiPlugin({ projectRoot, env }) {
  let toolsPromise = null;
  let mediaRootsScanPromise = null;
  let photoAlbumsScanPromise = null;
  let localDataStoreReadyPromise = null;
  // Existing middleware body remains unchanged.
}
```

Move path constants into a small factory so the old `__dirname` behavior is explicit:

```js
function createApiPaths(projectRoot) {
  const dataRoot = path.resolve(projectRoot, ".local-web-player-data");
  const librariesRoot = path.join(dataRoot, "libraries");
  const thumbnailsRoot = path.join(dataRoot, "thumbnails");
  const photoAlbumsRoot = path.join(dataRoot, "photo-albums");
  const embeddedSubtitlesRoot = path.join(dataRoot, "subtitles");
  const compatibleMediaRoot = path.join(dataRoot, "compatible-media");
  const danmakuRoot = path.join(dataRoot, "danmaku");
  const danmakuSourcesRoot = path.join(danmakuRoot, "sources");
  const aiRoot = path.join(dataRoot, "ai");
  const bangumiRoot = path.join(dataRoot, "bangumi");
  const bangumiMatchesRoot = path.join(bangumiRoot, "matches");
  const indexPath = path.join(dataRoot, "index.json");
  const globalDataPath = path.join(dataRoot, "global.json");
  const appConfigPath = path.resolve(projectRoot, "config", "app.json");
  return {
    dataRoot,
    librariesRoot,
    thumbnailsRoot,
    photoAlbumsRoot,
    embeddedSubtitlesRoot,
    compatibleMediaRoot,
    danmakuSourcesRoot,
    aiRoot,
    bangumiMatchesRoot,
    indexPath,
    globalDataPath,
    appConfigPath,
  };
}
```

- [ ] **Step 2: Wire module-scoped services to the path factory**

Inside `playerDataApiPlugin`, create `paths`, `localDataStore`, `bilibiliDanmaku`, and `embeddedSubtitles` before defining route helpers:

```js
export function playerDataApiPlugin({ projectRoot, env }) {
  const paths = createApiPaths(projectRoot);
  const localDataStore = new LocalDataSqliteStore({
    dataRoot: paths.dataRoot,
    librariesRoot: paths.librariesRoot,
    photoAlbumsRoot: paths.photoAlbumsRoot,
    indexPath: paths.indexPath,
    globalDataPath: paths.globalDataPath,
  });
  const bilibiliDanmaku = createBilibiliDanmakuService({
    createDanmakuComment,
    dedupeDanmakuComments,
    formatRemoteFetchError,
    requestExternalJson,
    requestExternalText,
  });
  const embeddedSubtitles = createEmbeddedSubtitleService({
    cacheRoot: paths.embeddedSubtitlesRoot,
    resolveVideoPath: resolveVideoPathFromConfig,
    ensureFileExists,
    runProcess,
    hashValue,
    readTextFile,
  });
  // Move existing helper functions below so they close over paths and services.
}
```

When moving helpers, replace old top-level path variables with `paths.*`. Examples:

```js
const cacheStatusDefinitions = [
  { id: "bangumi-matches", label: "Bangumi 匹配", path: paths.bangumiMatchesRoot },
  { id: "global", label: "全局播放数据", path: paths.globalDataPath },
];
```

```js
async function loadAppConfig() {
  return readJsonFile(paths.appConfigPath, defaultAppConfig);
}
```

```js
const filePath = path.join(paths.thumbnailsRoot, `${thumbnailId}.blob`);
```

- [ ] **Step 3: Simplify `vite.config.ts`**

Replace the top of `vite.config.ts` with:

```ts
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { playerDataApiPlugin } from "./server/playerDataApiPlugin.mjs";
```

Keep only the existing `export default defineConfig` block and change plugin construction to:

```ts
plugins: [react(), playerDataApiPlugin({ projectRoot: __dirname, env })],
```

- [ ] **Step 4: Run build to catch import and type errors**

Run:

```powershell
npm run build
```

Expected: build passes. If TypeScript reports no declaration for `server/playerDataApiPlugin.mjs`, add a local declaration file in Task 2.

## Task 2: Add TypeScript Declaration If Needed

**Files:**
- Create if needed: `src/server-modules.d.ts`

- [ ] **Step 1: Add a declaration for the ESM server plugin only if build fails on the import**

If `npm run build` reports a missing declaration for `./server/playerDataApiPlugin.mjs`, create `src/server-modules.d.ts`:

```ts
declare module "../server/playerDataApiPlugin.mjs" {
  import type { Plugin } from "vite";

  export function playerDataApiPlugin(options: {
    projectRoot: string;
    env: Record<string, string>;
  }): Plugin;
}
```

- [ ] **Step 2: Re-run build**

Run:

```powershell
npm run build
```

Expected: build passes with no `@ts-nocheck` in `vite.config.ts`.

## Task 3: Full Verification and Commit

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all existing tests pass.

- [ ] **Step 2: Verify build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass. The existing large chunk warning may remain.

- [ ] **Step 3: Verify `@ts-nocheck` removal**

Run:

```powershell
rg -n --fixed-strings "@ts-nocheck" .
```

Expected: no matches.

- [ ] **Step 4: Review diff for behavior drift**

Run:

```powershell
git diff --stat
git diff -- vite.config.ts server/playerDataApiPlugin.mjs
```

Expected: `vite.config.ts` shrinks substantially; route strings, response payloads, and helper bodies in `server/playerDataApiPlugin.mjs` match the old behavior except for path injection and relative imports.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- vite.config.ts server/playerDataApiPlugin.mjs src/server-modules.d.ts
git commit -m "refactor: extract local api plugin"
```

If `src/server-modules.d.ts` was not created, omit it from `git add`.

## Self-Review

Spec coverage:

- First-stage extraction is covered by Task 1.
- TypeScript declaration fallback is covered by Task 2.
- Required verification commands are covered by Task 3.
- No UI files are modified, so browser verification is intentionally out of scope for this stage.

Placeholder scan:

- The plan contains no unfinished placeholder markers.
- The only conditional step is the explicit declaration fallback tied to a concrete build failure.

Type consistency:

- The exported function name is `playerDataApiPlugin`.
- The options object is consistently `{ projectRoot, env }`.
- Vite imports the server module from `./server/playerDataApiPlugin.mjs`.
