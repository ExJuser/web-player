import assert from "node:assert/strict";
import test from "node:test";

import { parseAiJsonObject } from "../server/aiResponseUtils.mjs";

test("parseAiJsonObject parses direct JSON and JSON embedded in prose", () => {
  assert.deepEqual(parseAiJsonObject('{"ok":true}'), { ok: true });
  assert.deepEqual(parseAiJsonObject('模型回复：{"answer":"命中","matchIds":["a"]}。'), {
    answer: "命中",
    matchIds: ["a"],
  });
  assert.equal(parseAiJsonObject("not json"), null);
  assert.equal(parseAiJsonObject("{broken"), null);
});
