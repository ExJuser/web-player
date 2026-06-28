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

test("auto tag controls have stable loading and light theme styles", () => {
  assert.match(styles, /\.auto-tag-button:disabled \.lucide-refresh-cw\s*\{(?<body>[^}]+animation:\s*tag-query-spin 0\.9s linear infinite;[^}]+)\}/);
  assert.match(styles, /\.auto-tag-dialog \.dialog-icon\.loading\s*\{(?<body>[^}]+animation:\s*auto-tag-icon-pulse 1\.2s ease-in-out infinite;[^}]+)\}/);
  assert.match(styles, /\.auto-tag-dialog \.dialog-icon\.loading \.lucide-refresh-cw\s*\{(?<body>[^}]+animation:\s*tag-query-spin 0\.9s linear infinite;[^}]+)\}/);
  assert.match(styles, /\.auto-tag-sources a span\s*\{(?<body>[^}]+text-overflow:\s*ellipsis;[^}]+)\}/);
  assert.match(styles, /\.app-shell\.theme-light \.auto-tag-chip\.selected\s*\{/);
  assert.match(styles, /:root\[data-theme="light"\] \.auto-tag-chip\.selected\s*\{/);
  assert.match(styles, /\.app-shell\.theme-light \.auto-tag-sources\s*\{/);
  assert.match(styles, /:root\[data-theme="light"\] \.auto-tag-sources\s*\{/);
});

test("special insight controls have light theme coverage in app and root theme scopes", () => {
  assert.match(styles, /\.app-shell\.theme-light \.special-tag-insight,/);
  assert.match(styles, /\.app-shell\.theme-light \.special-tag-insight-meter,/);
  assert.match(styles, /\.special-tag-insight-meter span\s*\{(?<body>[^}]+height:\s*var\(--tag-share\);[^}]+)\}/);
  assert.match(styles, /:root\[data-theme="light"\] \.special-tag-insight\s*\{/);
  assert.match(styles, /:root\[data-theme="light"\] \.special-tag-insight-copy small\s*\{/);
  assert.match(styles, /\.app-shell\.theme-light \.special-insight-tabs button:hover,/);
  assert.match(styles, /:root\[data-theme="light"\] \.special-insight-video-row:focus-visible\s*\{/);
});

test("media library refresh button keeps the sidebar control compact", () => {
  const rule = styles.match(/\.media-library-refresh-button\s*\{(?<body>[^}]+)\}/);

  assert.match(rule?.groups?.body ?? "", /min-height:\s*36px;/);
  assert.match(rule?.groups?.body ?? "", /width:\s*100%;/);
  assert.match(rule?.groups?.body ?? "", /white-space:\s*nowrap;/);
});

test("duplicate detection progress has light theme coverage", () => {
  assert.match(styles, /\.app-shell\.theme-light \.duplicate-detection-progress,/);
  assert.match(styles, /:root\[data-theme="light"\] \.duplicate-detection-progress\s*\{(?<body>[^}]+background:\s*#d7e0ea;[^}]+)\}/);
});
