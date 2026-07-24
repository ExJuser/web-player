import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const { getNextVideoIdForQueue, getPreviousVideoIdForQueue, pickShuffleVideoId } = await importTsModule(
  new URL("../src/playerPlaybackQueue.ts", import.meta.url),
);
const queue = [{ id: "one" }, { id: "two" }, { id: "three" }];

test("selects the next item from the supplied playback queue", () => {
  assert.equal(getNextVideoIdForQueue(queue, "one", "sequential"), "two");
  assert.equal(getNextVideoIdForQueue(queue, "three", "sequential"), null);
  assert.equal(getNextVideoIdForQueue(queue, "three", "list-loop"), "one");
});

test("starts from the first queue item when the current video is outside the queue", () => {
  assert.equal(getNextVideoIdForQueue(queue, "outside", "sequential"), "one");
});

test("shuffle excludes the current item while keeping the supplied queue scope", () => {
  assert.equal(getNextVideoIdForQueue(queue, "two", "shuffle", () => 0), "one");
  assert.equal(getNextVideoIdForQueue(queue, "two", "shuffle", () => 0.99), "three");
});

test("single loop keeps the current video and empty queues have no next item", () => {
  assert.equal(getNextVideoIdForQueue(queue, "two", "single-loop"), "two");
  assert.equal(getNextVideoIdForQueue([], "two", "sequential"), null);
});

test("selects the previous item and wraps only in list-loop mode", () => {
  assert.equal(getPreviousVideoIdForQueue(queue, "three", "sequential"), "two");
  assert.equal(getPreviousVideoIdForQueue(queue, "one", "sequential"), null);
  assert.equal(getPreviousVideoIdForQueue(queue, "one", "list-loop"), "three");
  assert.equal(getPreviousVideoIdForQueue(queue, "outside", "sequential"), "three");
});

test("shuffle consumes every remaining item before starting a new round", () => {
  const first = pickShuffleVideoId(queue, "one", ["two", "three"], () => 0);
  assert.equal(first.videoId, "two");

  const second = pickShuffleVideoId(
    queue,
    first.videoId,
    first.remainingIds.filter((videoId) => videoId !== first.videoId),
    () => 0,
  );
  assert.equal(second.videoId, "three");

  const nextRound = pickShuffleVideoId(queue, second.videoId, [], () => 0);
  assert.equal(nextRound.videoId, "one");
});
