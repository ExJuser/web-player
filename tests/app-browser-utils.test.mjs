import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const appBrowserUtils = await importTsModule(new URL("../src/appBrowserUtils.ts", import.meta.url));

function withWindow(localStorage, run) {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage };
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}

test("reads default volume without browser storage", () => {
  const originalWindow = globalThis.window;
  delete globalThis.window;

  try {
    assert.equal(appBrowserUtils.readStoredVolume(), 0.85);
  } finally {
    if (originalWindow !== undefined) globalThis.window = originalWindow;
  }
});

test("reads stored volume with bounds and fallback", () => {
  withWindow(
    {
      getItem(key) {
        assert.equal(key, "local-web-player-volume");
        return "1.7";
      },
    },
    () => {
      assert.equal(appBrowserUtils.readStoredVolume(), 1);
    },
  );

  withWindow(
    {
      getItem() {
        return "not-a-number";
      },
    },
    () => {
      assert.equal(appBrowserUtils.readStoredVolume(), 0.85);
    },
  );
});

test("reads stored app theme", () => {
  withWindow(
    {
      getItem(key) {
        assert.equal(key, "local-web-player-theme");
        return "light";
      },
    },
    () => {
      assert.equal(appBrowserUtils.readStoredTheme(), "light");
    },
  );

  withWindow(
    {
      getItem() {
        return "sepia";
      },
    },
    () => {
      assert.equal(appBrowserUtils.readStoredTheme(), "dark");
    },
  );
});
