import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("expanded special stats open upward as a vertical overlay", () => {
  const cardRule = styles.match(/\.special-stats-card\s*\{(?<body>[^}]+)\}/);
  const detailsRule = styles.match(/\}\s*\.special-stats-details\s*\{(?<body>[^}]+)\}/);

  assert.match(cardRule?.groups?.body ?? "", /overflow:\s*visible;/);
  assert.match(detailsRule?.groups?.body ?? "", /position:\s*absolute;/);
  assert.match(detailsRule?.groups?.body ?? "", /right:\s*0;/);
  assert.match(detailsRule?.groups?.body ?? "", /bottom:\s*calc\(100% \+ 6px\);/);
  assert.match(detailsRule?.groups?.body ?? "", /flex-direction:\s*column;/);
  assert.match(detailsRule?.groups?.body ?? "", /width:\s*max-content;/);
});
