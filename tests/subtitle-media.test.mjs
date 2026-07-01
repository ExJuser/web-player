import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const subtitleMedia = await importTsModule(new URL("../src/subtitleMedia.ts", import.meta.url));

test("creates object urls for raw SRT subtitle text", async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const created = [];
  URL.createObjectURL = (blob) => {
    created.push(blob);
    return "blob:subtitle";
  };

  try {
    const url = await subtitleMedia.createSubtitleUrl({
      id: "s1",
      name: "episode.srt",
      relativePath: "episode.srt",
      url: "",
      rawText: "1\n00:00:01,000 --> 00:00:02,000\nHello",
      format: "srt",
    });

    assert.equal(url, "blob:subtitle");
    assert.equal(created[0].type, "text/vtt");
    assert.match(await created[0].text(), /^WEBVTT/);
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("reads normalized remote subtitle text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("  hello\r\nworld  ", { status: 200 });

  try {
    const text = await subtitleMedia.readSubtitleText({
      id: "s1",
      name: "episode.srt",
      relativePath: "episode.srt",
      url: "/subtitle.srt",
    });

    assert.equal(text, "hello\nworld");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("restores cached embedded subtitles with injected fetcher", async () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  URL.createObjectURL = () => "blob:embedded";
  const requests = [];

  try {
    const restored = await subtitleMedia.restoreCachedEmbeddedSubtitles(
      [
        {
          id: "embedded-1",
          name: "内封字幕 1",
          relativePath: "Show/E01.mkv#subtitle-0",
          url: "",
          videoId: "video-1",
          embeddedTrack: { streamIndex: 0, title: "简中", language: "chi", codec: "subrip", type: "text", extractable: true },
        },
      ],
      [{ id: "video-1", name: "E01.mkv", relativePath: "Show/E01.mkv", url: "/video", size: 1, lastModified: 1, mediaRootId: "root-1" }],
      null,
      async (path, init) => {
        requests.push({ path, body: JSON.parse(init.body) });
        return { text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello", format: "vtt" };
      },
    );

    assert.deepEqual(requests, [
      { path: "/api/subtitles/embedded/cached", body: { rootId: "root-1", relativePath: "Show/E01.mkv", streamIndex: 0 } },
    ]);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].url, "blob:embedded");
    assert.equal(restored[0].source, "embedded");
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
  }
});
