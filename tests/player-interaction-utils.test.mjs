import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const interactionUtils = await importTsModule(new URL("../src/playerInteractionUtils.ts", import.meta.url));

test("clamps numeric values to the provided range", () => {
  assert.equal(interactionUtils.clamp(-1, 0, 1), 0);
  assert.equal(interactionUtils.clamp(0.4, 0, 1), 0.4);
  assert.equal(interactionUtils.clamp(2, 0, 1), 1);
});

test("formats shortcut key codes for display", () => {
  assert.equal(interactionUtils.formatShortcutKey("Space"), "空格");
  assert.equal(interactionUtils.formatShortcutKey("Slash"), "?");
  assert.equal(interactionUtils.formatShortcutKey("KeyS"), "S");
  assert.equal(interactionUtils.formatShortcutKey("Digit7"), "7");
  assert.equal(interactionUtils.formatShortcutKey("ArrowLeft"), "←");
  assert.equal(interactionUtils.formatShortcutKey("NumpadAdd"), "小键盘 Add");
  assert.equal(interactionUtils.formatShortcutKey("PageDown"), "Page Down");
});

test("normalizes keyboard events to shortcut codes", () => {
  assert.equal(interactionUtils.shortcutCodeFromEvent({ code: "Slash", key: "?", shiftKey: true }), "Slash");
  assert.equal(interactionUtils.shortcutCodeFromEvent({ code: "KeyA", key: "a", shiftKey: false }), "KeyA");
  assert.equal(interactionUtils.shortcutCodeFromEvent({ code: "", key: "Enter", shiftKey: false }), "Enter");
});

test("detects shortcut conflicts while allowing seek and hold speed to share a key", () => {
  const shortcuts = {
    togglePlay: "Space",
    seekBackward: "ArrowLeft",
    seekForward: "ArrowRight",
    holdSpeed: "ArrowRight",
    volumeUp: "ArrowUp",
    volumeDown: "ArrowDown",
    toggleMute: "KeyM",
    toggleFullscreen: "KeyF",
    toggleFavorite: "KeyS",
    playNext: "KeyN",
    togglePrivacy: "KeyP",
    toggleCinema: "KeyT",
    toggleShortcuts: "Slash",
  };

  assert.equal(interactionUtils.getShortcutConflict(shortcuts, "toggleMute", "Space"), "togglePlay");
  assert.equal(interactionUtils.getShortcutConflict(shortcuts, "holdSpeed", "ArrowRight"), undefined);
  assert.equal(interactionUtils.getShortcutConflict(shortcuts, "seekForward", "ArrowRight"), undefined);
});

test("uses the first high energy segment as initial playback time when enabled", () => {
  const startTime = interactionUtils.resolveInitialPlaybackTime({
    progressTime: 120,
    highlights: [
      { id: "late", startTime: 80, endTime: 90, updatedAt: 100 },
      { id: "early", startTime: 35, endTime: 45, updatedAt: 101 },
    ],
    startFromHighEnergy: true,
  });

  assert.equal(startTime, 35);
});

test("keeps explicit beginning and disabled preference ahead of high energy starts", () => {
  assert.equal(
    interactionUtils.resolveInitialPlaybackTime({
      progressTime: 120,
      highlights: [{ id: "h1", startTime: 35, endTime: 45, updatedAt: 100 }],
      startFromHighEnergy: true,
      forceBeginning: true,
    }),
    0,
  );
  assert.equal(
    interactionUtils.resolveInitialPlaybackTime({
      progressTime: 120,
      progressDuration: 600,
      highlights: [{ id: "h1", startTime: 35, endTime: 45, updatedAt: 100 }],
      startFromHighEnergy: false,
    }),
    120,
  );
});
