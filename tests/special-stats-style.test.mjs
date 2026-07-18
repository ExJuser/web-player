import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("expanded special stats use a full-width time row above three compact metrics", () => {
  const cardRule = styles.match(/\.special-stats-card\s*\{(?<body>[^}]+)\}/);
  const detailsRule = styles.match(/\}\s*\.special-stats-details\s*\{(?<body>[^}]+)\}/);
  const timeRule = styles.match(/\.special-stats-details > \.special-stat-pill:first-child\s*\{(?<body>[^}]+)\}/);
  const metricRule = styles.match(/\.special-stats-details > \.special-stat-pill:nth-child\(n \+ 2\)\s*\{(?<body>[^}]+)\}/);
  const timeValueRule = styles.match(/\.special-stats-details > \.special-stat-pill:first-child strong\s*\{(?<body>[^}]+)\}/);

  assert.match(cardRule?.groups?.body ?? "", /overflow:\s*visible;/);
  assert.match(detailsRule?.groups?.body ?? "", /position:\s*absolute;/);
  assert.match(detailsRule?.groups?.body ?? "", /right:\s*0;/);
  assert.match(detailsRule?.groups?.body ?? "", /bottom:\s*calc\(100% \+ 6px\);/);
  assert.match(detailsRule?.groups?.body ?? "", /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(detailsRule?.groups?.body ?? "", /width:\s*min\(240px,\s*calc\(100vw - 32px\)\);/);
  assert.match(timeRule?.groups?.body ?? "", /grid-column:\s*1 \/ -1;/);
  assert.match(metricRule?.groups?.body ?? "", /height:\s*54px;/);
  assert.match(timeValueRule?.groups?.body ?? "", /max-width:\s*none;/);
});
