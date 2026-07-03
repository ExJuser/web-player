import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const constants = await importTsModule(new URL("../src/playerConstants.ts", import.meta.url));

test("creates playback rate options with custom effective rates", () => {
  assert.deepEqual(constants.createPlaybackRateOptions(1.5), constants.rates);
  assert.deepEqual(constants.createPlaybackRateOptions(1.1), [0.5, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
});

test("formats player select options", () => {
  assert.deepEqual(constants.createRateSelectOptions([1, 1.5]), [
    { value: 1, label: "1x" },
    { value: 1.5, label: "1.5x" },
  ]);
  assert.deepEqual(constants.createSeekStepSelectOptions([5, 15]), [
    { value: 5, label: "5s" },
    { value: 15, label: "15s" },
  ]);
});
