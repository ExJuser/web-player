import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("video metadata expansion does not animate layout dimensions", () => {
  const cardRule = styles.match(/\.video-metadata-card\s*\{(?<body>[^}]+)\}/);

  assert.doesNotMatch(cardRule?.groups?.body ?? "", /transition:[^}]*\b(?:width|max-height)\b/);
});
