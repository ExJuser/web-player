# Collapsible Player Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse player metadata behind a compact “影片信息” control, show only real performance warnings in its expanded content, and remove three unrelated navigation actions from the player top bar.

**Architecture:** Keep the behavior local to `PlayerTopBar`: a small state/ref/effect trio mirrors the established `SpecialStatsControl` interaction, while CSS controls the animated summary/detail transition. `App` passes only the current video's `performanceWarning`; existing media probing and processing logic remains unchanged.

**Tech Stack:** React 19, TypeScript, CSS, lucide-react.

## Global Constraints

- Only modify code directly related to the player top bar.
- Do not open a browser for this UI-only change.
- Use static verification only; do not run the full test, lint, or build suites.
- Preserve both `.app-shell.theme-light` and `:root[data-theme="light"]` theme behavior.
- Do not expose native browser scrollbars.

---

### Task 1: Collapse player metadata and remove top-bar shortcuts

**Files:**
- Modify: `src/PlayerTopBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `docs/superpowers/plans/2026-07-19-player-top-bar-collapse.md`

**Interfaces:**
- Consumes: `metadataRows: readonly (readonly [string, string])[]` and `playabilityMessage: string` from `App`.
- Produces: a `PlayerTopBar` whose metadata control exposes `aria-expanded`, supports click/Escape/outside-pointer interactions, and renders `playabilityMessage` only when non-empty.

- [x] **Step 1: Simplify the top-bar prop contract and warning source**

In `src/App.tsx`, replace the fallback chain with the warning-only source:

```tsx
const currentVideoPlayabilityMessage = currentVideo?.playability?.performanceWarning ?? "";
```

Remove the `PlayerTopBar` props for compatible-media actions, scanning state, cache opening, media-library addition, and photo-album navigation. Remove `openCompatibleMediaConfirm` after its only call site disappears; retain the underlying compatible-media and cache-dialog logic because this task only removes player-top-bar entry points.

- [x] **Step 2: Add the collapsible metadata interaction**

In `src/PlayerTopBar.tsx`, import `useEffect`, `useRef`, and `useState`; remove unused action icons and props. Track `isMetadataPinnedOpen`, attach `metadataCardRef`, and close a pinned card on an outside `pointerdown`.

Render metadata with this structure:

```tsx
<button
  ref={metadataCardRef}
  className={`video-metadata-card${isMetadataPinnedOpen ? " is-expanded" : ""}`}
  type="button"
  aria-expanded={isMetadataPinnedOpen}
  aria-label={isMetadataPinnedOpen ? "收起影片信息详情" : "展开影片信息详情"}
>
  <span className="video-metadata-summary">影片信息</span>
  <span className="video-metadata-details">
    <dl className="current-video-meta">...</dl>
    {playabilityMessage ? <span className="compatible-media-status">{playabilityMessage}</span> : null}
  </span>
</button>
```

Use the same click toggle, Escape handling, and outside-pointer cleanup pattern as `SpecialStatsControl`. Do not render the cache, add-library, or photo-album buttons. Keep the home button, processing-task status, and theme toggle unchanged.

- [x] **Step 3: Add compact, responsive animation styles**

In `src/styles.css`, make `.video-summary` a non-wrapping flex container around `.video-metadata-card`. Give the card a compact collapsed width, an expanded width constrained by the available viewport, hidden overflow, and 180 ms width/opacity/transform transitions. The summary fades/translates out while `.video-metadata-details` fades/translates in for hover, focus-visible, and `.is-expanded` states.

At `max-width: 640px`, let the expanded control use the available row width and allow metadata chips/warnings to wrap without horizontal overflow. Add light-theme selectors for both theme mechanisms and add the three new metadata classes to the existing `prefers-reduced-motion: reduce` transition reset.

- [x] **Step 4: Run static verification**

Before running commands, state that the checks are static and scoped to TypeScript/CSS consistency. Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\code\codex\web-player\node_modules\typescript\bin\tsc' --noEmit
git diff --check
git diff -- src/PlayerTopBar.tsx src/App.tsx src/styles.css docs/superpowers/plans/2026-07-19-player-top-bar-collapse.md
```

Expected: typecheck exits 0, `git diff --check` prints no errors, and the diff contains only the planned top-bar, style, and plan changes.

- [x] **Step 5: Commit the implementation**

```powershell
git add -- src/PlayerTopBar.tsx src/App.tsx src/styles.css docs/superpowers/plans/2026-07-19-player-top-bar-collapse.md
git commit -m "feat: collapse player metadata"
```
