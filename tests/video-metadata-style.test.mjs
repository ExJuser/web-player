import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("video metadata expansion does not animate layout dimensions", () => {
  const cardRule = styles.match(/\.video-metadata-card\s*\{(?<body>[^}]+)\}/);

  assert.doesNotMatch(cardRule?.groups?.body ?? "", /transition:[^}]*\b(?:width|max-height)\b/);
});

test("video metadata details use a calmer transition duration", () => {
  const contentRule = styles.match(
    /\.video-metadata-summary,\s*\.video-metadata-details\s*\{(?<body>[^}]+)\}/,
  );

  assert.match(contentRule?.groups?.body ?? "", /opacity\s+280ms ease,/);
  assert.match(contentRule?.groups?.body ?? "", /transform\s+280ms ease;/);
});
