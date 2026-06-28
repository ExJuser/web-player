import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const {
  createSubtitleContextChunks,
  createViewedSubtitleText,
  normalizeSubtitleText,
  parseSubtitleCues,
  parseSubtitleTimestamp,
  selectRelevantSubtitleChunks,
  srtToVtt,
  stripSubtitleMarkup,
  stripVttStyleBlocks,
} = await importTsModule(new URL("../src/subtitleUtils.ts", import.meta.url));

test("normalizes subtitle text and strips VTT style blocks", () => {
  assert.equal(normalizeSubtitleText(" a\r\nb\rc "), "a\nb\nc");

  const vtt = `WEBVTT

STYLE
::cue { color: red; }

00:00:01.000 --> 00:00:02.000
Hello`;

  assert.equal(
    stripVttStyleBlocks(vtt),
    `WEBVTT



00:00:01.000 --> 00:00:02.000
Hello`,
  );
});

test("converts SRT cues to escaped VTT cues", () => {
  assert.equal(
    srtToVtt(`1
00:00:01,000 --> 00:00:02,500
A & <B>

2
00:00:03,000 --> 00:00:04,000
Next`),
    `WEBVTT

00:00:01.000 --> 00:00:02.500
A &amp; &lt;B&gt;

00:00:03.000 --> 00:00:04.000
Next`,
  );
});

test("parses subtitle timestamps and cues", () => {
  assert.equal(parseSubtitleTimestamp("01:02:03.500"), 3723.5);
  assert.equal(parseSubtitleTimestamp("02:03,250"), 123.25);
  assert.equal(parseSubtitleTimestamp("bad"), 0);

  assert.deepEqual(
    parseSubtitleCues(`WEBVTT

intro
00:00:01.000 --> 00:00:03.000 align:start
<v Speaker>Hello&nbsp;{\\an8}world</v>

00:00:05,000 --> 00:00:06,000
Tom &amp; Jerry`),
    [
      { start: 1, end: 3, text: "Hello world" },
      { start: 5, end: 6, text: "Tom & Jerry" },
    ],
  );
});

test("creates subtitle context chunks and viewed text", () => {
  const cues = [
    { start: 1, end: 3, text: "first" },
    { start: 20, end: 25, text: "second" },
    { start: 95, end: 100, text: "third" },
  ];

  assert.deepEqual(createSubtitleContextChunks(cues), [
    { start: "00:01", end: "00:25", text: "first second" },
    { start: "01:35", end: "01:40", text: "third" },
  ]);

  assert.equal(createViewedSubtitleText(cues, 20), "[00:01 - 00:03] first\n[00:20 - 00:25] second");
  assert.equal(createViewedSubtitleText(cues, 0), "");
});

test("selects subtitle chunks by keyword before falling back to initial context", () => {
  const cues = [
    { start: 1, end: 2, text: "opening quiet scene" },
    { start: 100, end: 101, text: "important mystery clue" },
    { start: 220, end: 221, text: "ending credits" },
  ];

  assert.deepEqual(selectRelevantSubtitleChunks("mystery clue", cues, 0), [
    { start: "01:40", end: "01:41", text: "important mystery clue" },
  ]);

  assert.deepEqual(selectRelevantSubtitleChunks("unmatched", cues, 0), createSubtitleContextChunks(cues).slice(0, 8));
});
