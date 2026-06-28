import assert from "node:assert/strict";
import test from "node:test";

import { hashValue } from "../server/hashUtils.mjs";

test("hashValue returns stable sha256 hex values", () => {
  assert.equal(hashValue("web-player"), hashValue("web-player"));
  assert.notEqual(hashValue("web-player"), hashValue("Web-Player"));
  assert.match(hashValue("web-player"), /^[a-f0-9]{64}$/);
});
