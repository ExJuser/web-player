import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const tagExplorer = await importTsModule(new URL("../src/tagExplorer.ts", import.meta.url));

test("matches every included tag by normalized key", () => {
  const selection = {
    included: [
      { key: "剧情", label: "剧情" },
      { key: "ai字幕", label: "AI字幕" },
    ],
    excluded: [],
  };

  assert.equal(tagExplorer.matchesTagExplorerSelection(["剧情", "ＡＩ-字幕"], selection), true);
  assert.equal(tagExplorer.matchesTagExplorerSelection(["剧情"], selection), false);
});

test("rejects videos containing any excluded tag", () => {
  const selection = {
    included: [{ key: "剧情", label: "剧情" }],
    excluded: [{ key: "无码", label: "无码" }],
  };

  assert.equal(tagExplorer.matchesTagExplorerSelection(["剧情", "长镜头"], selection), true);
  assert.equal(tagExplorer.matchesTagExplorerSelection(["剧情", "无码"], selection), false);
});

test("formats the temporary playlist query for display", () => {
  assert.equal(
    tagExplorer.formatTagExplorerSearchQuery({
      included: [{ key: "剧情", label: "剧情" }, { key: "长镜头", label: "长镜头" }],
      excluded: [{ key: "无码", label: "无码" }],
    }),
    "剧情 长镜头 -无码",
  );
});
