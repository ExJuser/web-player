import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const cleanup = await importTsModule(new URL("../src/appResourceCleanup.ts", import.meta.url));

test("revokeObjectUrl only revokes object URLs", () => {
  const revoked = [];
  const revoke = (url) => revoked.push(url);

  cleanup.revokeObjectUrl("blob:http://localhost/video", revoke);
  cleanup.revokeObjectUrl("https://example.com/video.mp4", revoke);
  cleanup.revokeObjectUrl("", revoke);
  cleanup.revokeObjectUrl(null, revoke);

  assert.deepEqual(revoked, ["blob:http://localhost/video"]);
});

test("revokeObjectUrls revokes every object URL in an iterable", () => {
  const revoked = [];
  cleanup.revokeObjectUrls(
    ["blob:http://localhost/a", undefined, "file:///D:/video.mp4", "blob:http://localhost/b"],
    (url) => revoked.push(url),
  );

  assert.deepEqual(revoked, ["blob:http://localhost/a", "blob:http://localhost/b"]);
});
