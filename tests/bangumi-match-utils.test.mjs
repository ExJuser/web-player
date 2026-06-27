import assert from "node:assert/strict";
import test from "node:test";

import {
  compactBangumiTitle,
  createBangumiMatchResult,
  diceCoefficient,
  normalizeBangumiMatchPayload,
  normalizeBangumiSearchPayload,
  normalizeBangumiTitle,
  publicBangumiCandidate,
  scoreBangumiSubject,
} from "../server/bangumiMatchUtils.mjs";

test("normalizeBangumiTitle removes release markers, episode markers, and codec noise", () => {
  assert.equal(
    normalizeBangumiTitle("[Group] 葬送のフリーレン S01 EP12 1080p x265 Web-DL"),
    "葬送のフリーレン",
  );
  assert.equal(normalizeBangumiTitle("ぼっち・ざ・ろっく！ - 04"), "ぼっち・ざ・ろっく! 04");
});

test("compactBangumiTitle keeps only letters and numbers after normalization", () => {
  assert.equal(compactBangumiTitle("Bocchi The Rock! / ぼっち・ざ・ろっく！"), "bocchitherockぼっちざろっく");
});

test("diceCoefficient scores identical, partial, and empty values consistently", () => {
  assert.equal(diceCoefficient("", "abc"), 0);
  assert.equal(diceCoefficient("abc", "abc"), 1);
  assert.equal(Number(diceCoefficient("abcd", "abxy").toFixed(2)), 0.33);
});

test("scoreBangumiSubject prefers exact and compact title matches", () => {
  assert.equal(
    scoreBangumiSubject("葬送のフリーレン", {
      name: "Sousou no Frieren",
      nameCn: "葬送のフリーレン",
    }),
    100,
  );
  assert.equal(
    scoreBangumiSubject("Bocchi The Rock", {
      name: "Bocchi the Rock!",
      nameCn: "",
    }),
    96,
  );
});

test("normalizeBangumiSearchPayload accepts array and data payloads while dropping invalid subjects", () => {
  const subjects = normalizeBangumiSearchPayload(
    {
      data: [
        {
          id: "123",
          name: "Sousou no Frieren",
          name_cn: "葬送のフリーレン",
          rating: { score: "8.8" },
          rank: "12",
          date: "2023-09-29",
          summary: "x".repeat(300),
        },
        { id: 0, name: "invalid" },
      ],
    },
    "葬送のフリーレン",
  );

  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].id, 123);
  assert.equal(subjects[0].url, "https://bgm.tv/subject/123");
  assert.equal(subjects[0].score, 8.8);
  assert.equal(subjects[0].rank, 12);
  assert.equal(subjects[0].summary.length, 240);
  assert.equal(subjects[0].matchScore, 100);
});

test("publicBangumiCandidate exposes only stable client fields", () => {
  assert.deepEqual(
    publicBangumiCandidate({
      id: 1,
      name: "Name",
      nameCn: "中文",
      url: "https://bgm.tv/subject/1",
      score: 7.6,
      rank: 100,
      date: "2024-01-01",
      matchScore: 82,
      summary: "hidden",
    }),
    {
      id: 1,
      name: "Name",
      nameCn: "中文",
      url: "https://bgm.tv/subject/1",
      score: 7.6,
      rank: 100,
      date: "2024-01-01",
      matchScore: 82,
    },
  );
});

test("normalizeBangumiMatchPayload trims bounds and preserves force flag", () => {
  const payload = normalizeBangumiMatchPayload({
    libraryId: `  ${"l".repeat(200)}  `,
    seriesKey: `  ${"s".repeat(300)}  `,
    title: `  ${"t".repeat(300)}  `,
    sampleVideoNames: ["a".repeat(300), 123, "b"],
    sampleRelativePaths: ["p".repeat(500), false, "q"],
    force: 1,
  });

  assert.equal(payload.libraryId.length, 160);
  assert.equal(payload.seriesKey.length, 240);
  assert.equal(payload.title.length, 240);
  assert.deepEqual(payload.sampleVideoNames, ["a".repeat(240), "b"]);
  assert.deepEqual(payload.sampleRelativePaths, ["p".repeat(360), "q"]);
  assert.equal(payload.force, true);
});

test("createBangumiMatchResult builds the existing result shell with overrides", () => {
  const result = createBangumiMatchResult(
    { seriesKey: "series", title: "Title" },
    "error",
    { error: "failed" },
  );

  assert.equal(result.status, "error");
  assert.equal(result.seriesKey, "series");
  assert.equal(result.title, "Title");
  assert.equal(result.subject, null);
  assert.equal(result.confidence, "none");
  assert.equal(result.source, "error");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.error, "failed");
  assert.equal(typeof result.updatedAt, "number");
});
