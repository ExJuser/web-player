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

test("tag chips have explicit light theme colors in app and root theme scopes", () => {
  const appShellRule = styles.match(
    /\.app-shell\.theme-light \.tag-chip,\s*\.app-shell\.theme-light \.tag-editor-chip\s*\{(?<body>[^}]+)\}/,
  );
  const rootRule = styles.match(
    /:root\[data-theme="light"\] \.tag-chip,\s*:root\[data-theme="light"\] \.tag-editor-chip\s*\{(?<body>[^}]+)\}/,
  );

  for (const body of [appShellRule?.groups?.body ?? "", rootRule?.groups?.body ?? ""]) {
    assert.match(body, /background:\s*#e1f5fd;/);
    assert.match(body, /color:\s*#0077a8;/);
  }
});

test("special insight controls have light theme coverage in app and root theme scopes", () => {
  assert.match(styles, /\.app-shell\.theme-light \.special-tag-insight,/);
  assert.match(styles, /:root\[data-theme="light"\] \.special-tag-insight\s*\{/);
  assert.match(styles, /\.app-shell\.theme-light \.special-insight-tabs button:hover,/);
  assert.match(styles, /:root\[data-theme="light"\] \.special-insight-video-row:focus-visible\s*\{/);
});
