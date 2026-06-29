# Watch Calendar Month Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the watch activity linear heatmap with a responsive month-grouped calendar grid.

**Architecture:** Add a pure helper in `src/watchActivityInsights.ts` that groups day insights into calendar months and provides leading weekday placeholders. `src/App.tsx` renders those groups while reusing the existing day button behavior. `src/styles.css` handles desktop and mobile grid sizing in both dark and light themes.

**Tech Stack:** React, TypeScript, CSS, Node test runner with esbuild-based TypeScript imports.

---

### Task 1: Calendar Month Group Helper

**Files:**
- Modify: `src/watchActivityInsights.ts`
- Modify: `tests/watch-activity-insights.test.mjs`

- [x] **Step 1: Write the failing test**

Add a test that calls `groupWatchActivityDaysByMonth` with dates spanning May and June 2026. Assert that the result contains two month groups, that May has four leading placeholders because 2026-05-01 is a Friday in a Monday-first calendar, and that each group reports active day counts.

- [x] **Step 2: Run the focused test**

Run: `node --test tests/watch-activity-insights.test.mjs`

Expected: failure because `groupWatchActivityDaysByMonth` is not exported yet.

- [x] **Step 3: Implement the helper**

Export `WatchActivityMonthGroup` and `groupWatchActivityDaysByMonth` from `src/watchActivityInsights.ts`. The helper groups by `YYYY-MM`, labels months as `M月`, computes `leadingEmptyDays`, and counts active days using any positive metric.

- [x] **Step 4: Re-run the focused test**

Run: `node --test tests/watch-activity-insights.test.mjs`

Expected: pass.

### Task 2: React Rendering

**Files:**
- Modify: `src/App.tsx`

- [x] **Step 1: Import and compute month groups**

Import `groupWatchActivityDaysByMonth` and compute `watchActivityMonthGroups` from `watchActivityInsights.days`.

- [x] **Step 2: Render month groups**

Replace the single `.watch-activity-heatmap` list with `.watch-activity-calendar`, month sections, weekday labels, leading placeholders, and reused `renderWatchActivityDay` buttons.

### Task 3: Styling and Verification

**Files:**
- Modify: `src/styles.css`

- [x] **Step 1: Update calendar CSS**

Replace linear heatmap styles with responsive month-card styles. Ensure day buttons are at least 28px on desktop, expand on mobile, and preserve hover, focus, selected, dark, and light theme states.

- [x] **Step 2: Run checks**

Run: `npm test`

Run: `npm run build`

- [x] **Step 3: Browser verification**

Start the local dev server, open the app in the in-app browser, and inspect desktop and mobile widths for the watch calendar. Verify 30/90/365 range controls, metric controls, and day selection remain usable.
