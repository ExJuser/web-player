import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const history = await importTsModule(new URL("../src/playbackHistory.ts", import.meta.url));

test("playback history records only the continuously played interval", () => {
  const recorded = history.addPlaybackHistoryInterval(undefined, 0, 5, 100, 10);

  assert.equal(recorded.buckets.length, 200);
  assert.equal(recorded.buckets.reduce((total, value) => total + value, 0), 5);
  assert.equal(recorded.updatedAt, 10);
  assert.equal(history.addPlaybackHistoryInterval(recorded, 5, 25, 100, 20), recorded);
});

test("playback history accumulates repeated viewing in the same buckets", () => {
  const firstPass = history.addPlaybackHistoryInterval(undefined, 10, 15, 100, 10);
  const secondPass = history.addPlaybackHistoryInterval(firstPass, 10, 15, 100, 20);
  const summary = history.getPlaybackHistoryAtTime(secondPass, 12, 100);

  assert.equal(secondPass.buckets.reduce((total, value) => total + value, 0), 10);
  assert.equal(summary.passes, 2);
});
