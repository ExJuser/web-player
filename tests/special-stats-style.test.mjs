import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("expanded special stats can shrink all detail pills into the card", () => {
  const detailsRule = styles.match(/\}\s*\.special-stats-details\s*\{(?<body>[^}]+)\}/);

  assert.match(detailsRule?.groups?.body ?? "", /min-width:\s*0;/);
});
