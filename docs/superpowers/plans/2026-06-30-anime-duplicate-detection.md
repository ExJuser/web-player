# Anime Duplicate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make duplicate detection in anime mode conservative enough to avoid flagging different episodes from the same series.

**Architecture:** Extend duplicate detection options with an optional media mode, then add anime-only episode parsing and pair suppression in `playerMediaUtils.ts`. `App.tsx` passes the current home media mode into detection; persisted result shape and UI stay unchanged.

**Tech Stack:** React, TypeScript, Vite, Node test runner, existing `importTsModule` test helper.

---

## File Structure

- Modify `src/playerMediaUtils.ts`: add duplicate detection context, anime episode parsing helpers, conservative scoring and fingerprint suppression.
- Modify `src/App.tsx`: pass `homeMediaMode` into `detectDuplicateVideosWithProgress`.
- Modify `tests/player-media-utils.test.mjs`: add anime-mode tests and a non-anime compatibility assertion.

### Task 1: Add Failing Anime-Mode Tests

**Files:**
- Modify: `tests/player-media-utils.test.mjs`

- [ ] **Step 1: Add tests for different episodes and same-episode copies**

Insert these tests after `keeps short numeric filename matches suspicious even with AI name boost`:

```js
test("anime mode ignores same-series different episodes with similar metadata", async () => {
  const episodeOne = createVideo({
    id: "anime|Show/Show - 01.mkv|1000000|1",
    name: "Show - 01.mkv",
    relativePath: "Show/Show - 01.mkv",
    size: 1000000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const episodeTwo = createVideo({
    id: "anime|Show/Show - 02.mkv|1001000|2",
    name: "Show - 02.mkv",
    relativePath: "Show/Show - 02.mkv",
    size: 1001000,
    duration: 1441,
    width: 1920,
    height: 1080,
  });

  const syncGroups = mediaUtils.detectDuplicateVideos([episodeOne, episodeTwo], { mode: "anime" });
  const asyncGroups = await mediaUtils.detectDuplicateVideosWithProgress([episodeOne, episodeTwo], {
    mode: "anime",
    getContentFingerprint: async () => "same-op-ed-sample",
    getNameSimilarityScores: async (pairs) => {
      assert.equal(pairs.length, 0);
      return new Map();
    },
  });

  assert.equal(syncGroups.length, 0);
  assert.equal(asyncGroups.length, 0);
});

test("anime mode still detects same-episode copies", async () => {
  const original = createVideo({
    id: "anime-a|Show/Show - 01.mkv|1000000|1",
    name: "Show - 01.mkv",
    relativePath: "Show/Show - 01.mkv",
    size: 1000000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const copy = createVideo({
    id: "anime-b|Backup/Show 01 copy.mkv|1000500|2",
    name: "Show 01 copy.mkv",
    relativePath: "Backup/Show 01 copy.mkv",
    size: 1000500,
    duration: 1440,
    width: 1920,
    height: 1080,
  });

  const groups = await mediaUtils.detectDuplicateVideosWithProgress([original, copy], {
    mode: "anime",
    getContentFingerprint: async () => "same-episode",
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "duplicate");
});

test("non-anime duplicate detection keeps existing similar-metadata behavior", () => {
  const first = createVideo({
    id: "special-a",
    name: "Show - 01.mkv",
    relativePath: "Special/Show - 01.mkv",
    size: 1000000,
    duration: 1440,
    width: 1920,
    height: 1080,
  });
  const second = createVideo({
    id: "special-b",
    name: "Show - 02.mkv",
    relativePath: "Special/Show - 02.mkv",
    size: 1001000,
    duration: 1441,
    width: 1920,
    height: 1080,
  });

  const groups = mediaUtils.detectDuplicateVideos([first, second], { mode: "special" });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "suspicious");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/player-media-utils.test.mjs`

Expected: FAIL because `detectDuplicateVideos` does not accept the new options object behavior and anime different episodes are still scored as duplicates or suspicious.

### Task 2: Add Detection Context and Anime Pair Classification

**Files:**
- Modify: `src/playerMediaUtils.ts`
- Test: `tests/player-media-utils.test.mjs`

- [ ] **Step 1: Add option types and parsing helpers**

In `src/playerMediaUtils.ts`, update the options and add helpers near existing duplicate constants:

```ts
export type DuplicateDetectionMode = "all" | "anime" | "special";

export type DuplicateDetectionContext = {
  mode?: DuplicateDetectionMode;
};

export type DuplicateDetectionOptions = DuplicateDetectionContext & {
  yieldEveryPairs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: DuplicateDetectionProgress) => void;
  getContentFingerprint?: (video: VideoItem, signal?: AbortSignal) => Promise<string | null>;
  getNameSimilarityScores?: (pairs: DuplicateNameSimilarityPair[], signal?: AbortSignal) => Promise<Map<string, number>>;
  onNameSimilarityError?: (error: unknown) => void;
  maxAiNamePairs?: number;
  aiNameBatchSize?: number;
  maxFingerprintVideos?: number;
};

const animeEpisodePattern =
  /\b(?:s\d{1,2}\s*e|ep(?:isode)?|e)\s*0*(\d{1,4})(?:\b|v\d\b)|第\s*0*(\d{1,4})\s*[集话話]|(?:^|[\s._-])0*(\d{1,4})(?:\s*(?:v\d|END|Fin))?(?=\s*(?:\[[^\]]+\]|【[^】]+】)?(?:\.[^.]+)?$)/i;

function getAnimeDuplicateInfo(video: VideoItem) {
  const source = `${video.relativePath || ""}/${video.name || ""}`.normalize("NFKC");
  const fileName = (video.name || video.relativePath || "").split(/[\\/]/).at(-1) ?? "";
  const episodeMatch = fileName.match(animeEpisodePattern) ?? source.match(animeEpisodePattern);
  const episode = episodeMatch ? Number.parseInt(episodeMatch[1] ?? episodeMatch[2] ?? episodeMatch[3] ?? "", 10) : null;
  const seriesName = normalizeDuplicateName(fileName || video.relativePath)
    .replace(/\b(?:s\d{1,2}\s*e|ep(?:isode)?|e)\s*\d{1,4}\b/gi, " ")
    .replace(/第\s*\d{1,4}\s*[集话話]/g, " ")
    .replace(/(?:^| )\d{1,4}(?: |$)/g, " ")
    .replace(/\b(?:copy|copied)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    episode: Number.isFinite(episode) ? episode : null,
    seriesName,
  };
}

function isAnimeDifferentEpisodePair(a: VideoItem, b: VideoItem, context?: DuplicateDetectionContext) {
  if (context?.mode !== "anime") return false;
  const aInfo = getAnimeDuplicateInfo(a);
  const bInfo = getAnimeDuplicateInfo(b);
  return Boolean(
    aInfo.seriesName &&
      bInfo.seriesName &&
      aInfo.seriesName === bInfo.seriesName &&
      aInfo.episode !== null &&
      bInfo.episode !== null &&
      aInfo.episode !== bInfo.episode,
  );
}
```

- [ ] **Step 2: Thread context into scoring**

Change signatures and call sites:

```ts
function scoreDuplicatePair(a: VideoItem, b: VideoItem, context?: DuplicateDetectionContext) {
  if (isAnimeDifferentEpisodePair(a, b, context)) {
    return { score: 0, reasons: ["追番不同集"] };
  }
  // existing body follows
}

export function detectDuplicateVideos(videos: VideoItem[], context: DuplicateDetectionContext = {}): DuplicateVideoGroup[] {
  const pairScores = new Map<string, DuplicateVideoPair>();
  createDuplicatePairCandidates(videos).forEach((candidate) => {
    const pair = scoreDuplicatePair(candidate.a, candidate.b, context);
    mergeDuplicatePairScore(pairScores, candidate.a, candidate.b, pair);
  });
  return buildDuplicateVideoGroups(videos, pairScores);
}
```

Inside `detectDuplicateVideosWithProgress`, call `scoreDuplicatePair(candidate.a, candidate.b, options)` for metadata scoring and `scoreDuplicatePair(a, b, options)` for fingerprint group scoring.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/player-media-utils.test.mjs`

Expected: anime different episode test still may fail if fingerprint code promotes suppressed pairs. Other existing tests should remain close to passing.

### Task 3: Suppress Anime Different-Episode Fingerprint and AI Boosts

**Files:**
- Modify: `src/playerMediaUtils.ts`
- Test: `tests/player-media-utils.test.mjs`

- [ ] **Step 1: Skip suppressed pairs for fingerprint and AI candidates**

In the metadata loop inside `detectDuplicateVideosWithProgress`, compute the anime suppression once:

```ts
const isSuppressedAnimePair = isAnimeDifferentEpisodePair(candidate.a, candidate.b, options);
const pair = scoreDuplicatePair(candidate.a, candidate.b, options);
processedPairs += 1;
mergeDuplicatePairScore(pairScores, candidate.a, candidate.b, pair);
if (!isSuppressedAnimePair && pair.score >= duplicateFingerprintCandidateThreshold) {
  fingerprintCandidatePairs.push({ a: candidate.a, b: candidate.b, pair });
}
if (!isSuppressedAnimePair && pair.score >= duplicateAiNameCandidateThreshold) {
  nameSimilarityCandidates.push({ a: candidate.a, b: candidate.b, pair, pairKey: candidate.key });
}
```

- [ ] **Step 2: Guard fingerprint bucket promotion**

In the `videosByFingerprint` nested loop, before merging the fingerprint score:

```ts
if (isAnimeDifferentEpisodePair(a, b, options)) continue;
```

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/player-media-utils.test.mjs`

Expected: PASS for the player media utility test file.

### Task 4: Pass Current Mode From App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Pass `homeMediaMode` to duplicate detection**

In `runDuplicateVideoDetection`, update the call:

```ts
const groups = await detectDuplicateVideosWithProgress(targetVideos, {
  mode: targetMode,
  signal: abortController.signal,
  getContentFingerprint: getDuplicateFingerprint,
  getNameSimilarityScores: getDuplicateNameSimilarityScores,
  onNameSimilarityError: () => {
    didAiEnhancementFail = true;
  },
  onProgress: (progress) => {
    if (duplicateDetectionRunIdRef.current !== runId) return;
    setDuplicateDetectionProgress(progress);
    setDuplicateDetectionMessage(
      progress.phase === "fingerprint"
        ? `正在比对内容指纹 ${progress.processedFingerprints ?? 0} / ${progress.totalFingerprints ?? 0} 个候选视频`
        : progress.phase === "aiName"
          ? `正在调用 AI 比对名称 ${progress.processedNamePairs ?? 0} / ${progress.totalNamePairs ?? 0} 组候选`
          : `已检查 ${progress.processedPairs} / ${progress.totalPairs} 组候选组合`,
    );
  },
});
```

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build`

Expected: PASS with TypeScript checking and Vite build complete.

### Task 5: Final Verification and Commit

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run focused tests**

Run: `npm test -- tests/player-media-utils.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Inspect git diff**

Run: `git diff -- src/playerMediaUtils.ts src/App.tsx tests/player-media-utils.test.mjs`

Expected: Diff only covers anime duplicate detection options, suppression logic, app mode pass-through, and tests.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git add src/playerMediaUtils.ts src/App.tsx tests/player-media-utils.test.mjs docs/superpowers/plans/2026-06-30-anime-duplicate-detection.md
git commit -m "fix: reduce anime duplicate false positives"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: Tasks cover anime-only mode context, different-episode suppression, fingerprint and AI boost suppression, same-episode duplicate preservation, non-anime compatibility, app mode pass-through, and verification.
- Placeholder scan: No `TBD`, `TODO`, or deferred implementation steps.
- Type consistency: `DuplicateDetectionMode`, `DuplicateDetectionContext`, and `DuplicateDetectionOptions` are introduced before use; `mode: targetMode` matches `HomeMediaMode` values.
