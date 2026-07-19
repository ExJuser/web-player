import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanMediaRoot } from "../server/mediaRoots.mjs";

test("server media scan attaches actors from only the same-basename nfo", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-player-actor-scan-"));
  try {
    const videoPath = path.join(root, "Movie.mkv");
    await writeFile(videoPath, "");
    await truncate(videoPath, 51 * 1024 * 1024);
    await writeFile(path.join(root, "movie-POSTER.jpg"), "poster");
    await writeFile(path.join(root, "movie.NFO"), "<movie><actor><name>Actor A</name><type>Actor</type></actor></movie>", "utf8");
    await writeFile(path.join(root, "other.nfo"), "<movie><actor><name>Wrong Actor</name></actor></movie>", "utf8");

    const result = await scanMediaRoot({ id: "special", label: "Test AV", path: root, source: "local" });
    assert.equal(result.videos.length, 1);
    assert.deepEqual(result.videos[0].actorHints, { fileName: "movie.NFO", names: ["Actor A"], status: "parsed" });
    assert.equal(result.videos[0].posterUrl, "/api/media/special/movie-POSTER.jpg");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
