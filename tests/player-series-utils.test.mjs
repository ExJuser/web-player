import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const seriesUtils = await importTsModule(new URL("../src/playerSeriesUtils.ts", import.meta.url));

test("infers series title from the first relative path folder", () => {
  assert.equal(
    seriesUtils.inferSeriesTitle({
      name: "Episode 01.mkv",
      relativePath: "My Show/Season 1/Episode 01.mkv",
    }),
    "My Show",
  );
});

test("infers series title from a single file name by removing episode and codec noise", () => {
  assert.equal(
    seriesUtils.inferSeriesTitle({
      name: "[Fansub] Cool.Show.S01E02.1080p.x265.AAC.mkv",
      relativePath: "[Fansub] Cool.Show.S01E02.1080p.x265.AAC.mkv",
    }),
    "Cool Show",
  );
  assert.equal(
    seriesUtils.inferSeriesTitle({
      name: "Anime EP12 2160p WEB-DL.mp4",
      relativePath: "Anime EP12 2160p WEB-DL.mp4",
    }),
    "Anime",
  );
});

test("falls back to base file name when cleaning removes all content", () => {
  assert.equal(
    seriesUtils.inferSeriesTitle({
      name: "S01E02.1080p.x264.mkv",
      relativePath: "S01E02.1080p.x264.mkv",
    }),
    "S01E02.1080p.x264",
  );
});

test("creates stable series keys with optional media-root scope", () => {
  assert.equal(seriesUtils.seriesKeyFromTitle("  My Show  "), "my show");
  assert.equal(seriesUtils.scopedSeriesKeyForVideo({ relativePath: "My Show/E01.mkv" }, "My Show"), "my show");
  assert.equal(
    seriesUtils.scopedSeriesKeyForVideo({ mediaRootId: "root-anime", relativePath: "My Show/E01.mkv" }, "My Show"),
    "root-anime:my show",
  );
});
