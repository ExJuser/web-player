import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const playback = await importTsModule(new URL("../src/playbackRuntime.ts", import.meta.url));

test("playback runtime applies value and updater changes without duplicate notifications", () => {
  const runtime = playback.createPlaybackRuntime();
  let allNotifications = 0;
  let durationNotifications = 0;
  let playingNotifications = 0;
  runtime.subscribe(() => { allNotifications += 1; });
  runtime.subscribeDuration(() => { durationNotifications += 1; });
  runtime.subscribePlaying(() => { playingNotifications += 1; });

  runtime.setCurrentTime(12);
  runtime.setCurrentTime((time) => time + 3);
  runtime.setCurrentTime(15);
  runtime.setDuration(100);
  runtime.setIsPlaying(true);

  assert.deepEqual(runtime.getSnapshot(), { currentTime: 15, duration: 100, isPlaying: true });
  assert.equal(allNotifications, 4);
  assert.equal(durationNotifications, 1);
  assert.equal(playingNotifications, 1);
});

test("playback runtime reset returns a stable initial snapshot", () => {
  const runtime = playback.createPlaybackRuntime({ currentTime: 4, duration: 90, isPlaying: true });
  runtime.reset();
  assert.deepEqual(runtime.getSnapshot(), { currentTime: 0, duration: 0, isPlaying: false });
  const first = runtime.getSnapshot();
  runtime.reset();
  assert.equal(runtime.getSnapshot(), first);
});
