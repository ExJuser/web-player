import assert from "node:assert/strict";
import test from "node:test";

import { parseSubtitleCues } from "../server/recommendationFeed.mjs";

test("parses SRT and hour-less VTT cues for local recommendation analysis", () => {
  const cues = parseSubtitleCues(`WEBVTT

00:02.500 --> 00:04.000
为什么会这样？

2
01:02:03,100 --> 01:02:05,400
原来这就是真相！`);

  assert.deepEqual(cues, [
    { startTime: 2.5, endTime: 4, text: "为什么会这样？" },
    { startTime: 3723.1, endTime: 3725.4, text: "原来这就是真相！" },
  ]);
});
