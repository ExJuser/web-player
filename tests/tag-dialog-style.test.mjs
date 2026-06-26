import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("tag editor input and add button use the same control height", () => {
  const inputRule = styles.match(/\.tag-editor-form input\s*\{(?<body>[^}]+)\}/);
  const buttonRule = styles.match(/\.tag-editor-form \.primary-button\s*\{(?<body>[^}]+)\}/);

  assert.match(inputRule?.groups?.body ?? "", /height:\s*38px;/);
  assert.match(buttonRule?.groups?.body ?? "", /height:\s*38px;/);
});
