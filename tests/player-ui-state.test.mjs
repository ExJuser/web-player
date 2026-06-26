import assert from "node:assert/strict";
import test from "node:test";

import { importTsModule } from "./importTsModule.mjs";

const uiState = await importTsModule(new URL("../src/playerUiState.ts", import.meta.url));

test("browser media root with localPath renders a disabled configured action", () => {
  assert.deepEqual(
    uiState.getMediaRootLocalPathAction({
      id: "anime",
      label: "Anime",
      basename: "Anime",
      path: "Anime",
      source: "browser",
      localPath: "G:\\番剧",
    }),
    { visible: true, disabled: true, label: "本机路径已配置" },
  );
});

test("compatible media action is enabled only for server remux candidates", () => {
  assert.deepEqual(
    uiState.getCompatibleMediaAction(
      {
        playbackSource: "server",
        playability: { status: "remuxRecommended", reason: "建议转封装" },
      },
      { canUseServerTools: true },
    ),
    {
      visible: true,
      disabled: false,
      canCreate: true,
      label: "生成兼容 MP4",
    },
  );

  assert.equal(
    uiState.getCompatibleMediaAction(
      {
        playbackSource: "server",
        playability: { status: "remuxRecommended", reason: "建议转封装", compatibleUrl: "/api/media-compatible/a.mp4" },
      },
      { canUseServerTools: true },
    ).canCreate,
    false,
  );

  assert.equal(
    uiState.getCompatibleMediaAction(
      {
        playbackSource: "server",
        playability: { status: "direct" },
      },
      { canUseServerTools: true },
    ).visible,
    false,
  );

  assert.equal(
    uiState.getCompatibleMediaAction(
      {
        playbackSource: "server",
        playability: { status: "remuxRecommended", reason: "建议转封装", compatibleUrl: "/api/media-compatible/a.mp4" },
      },
      { canUseServerTools: true },
    ).visible,
    false,
  );

  assert.equal(
    uiState.getCompatibleMediaAction(
      {
        playbackSource: "browser",
        playability: { status: "needsLocalPath", reason: "需本机路径" },
      },
      { canUseServerTools: true },
    ).canCreate,
    false,
  );
});

test("home anime mode includes duplicate Anime media roots by label", () => {
  assert.equal(uiState.isMediaRootInHomeMode({ id: "anime-a", label: "Anime" }, "anime"), true);
  assert.equal(uiState.isMediaRootInHomeMode({ id: "anime-b", label: " anime " }, "anime"), true);
});

test("home special mode includes media roots with AV suffix", () => {
  ["3DAV", "国产AV", "欧美AV", "JAV"].forEach((label) => {
    assert.equal(uiState.isMediaRootInHomeMode({ label }, "special"), true);
  });
});

test("home special mode excludes media roots without AV suffix", () => {
  assert.equal(uiState.isMediaRootInHomeMode({ label: "Anime" }, "special"), false);
  assert.equal(uiState.isMediaRootInHomeMode({ label: "AV资料备份" }, "special"), false);
});

test("video stats key is stable across media roots", () => {
  const first = uiState.createVideoStatsKey({
    id: "root-a|folder-a/movie.mp4|1024|1700000000000",
    mediaRootId: "root-a",
    name: "Movie.mp4",
    size: 1024,
    lastModified: 1700000000000,
  });
  const second = uiState.createVideoStatsKey({
    id: "root-b|folder-b/movie.mp4|1024|1700000000000",
    mediaRootId: "root-b",
    name: "Movie.mp4",
    size: 1024,
    lastModified: 1700000000000,
  });

  assert.equal(first, second);
});

test("video stats key changes when file fingerprint changes", () => {
  const base = uiState.createVideoStatsKey({
    name: "Movie.mp4",
    size: 1024,
    lastModified: 1700000000000,
  });

  assert.notEqual(base, uiState.createVideoStatsKey({ name: "Other.mp4", size: 1024, lastModified: 1700000000000 }));
  assert.notEqual(base, uiState.createVideoStatsKey({ name: "Movie.mp4", size: 2048, lastModified: 1700000000000 }));
  assert.notEqual(base, uiState.createVideoStatsKey({ name: "Movie.mp4", size: 1024, lastModified: 1700000001000 }));
});

test("home all mode includes unlabeled and temporary media roots", () => {
  assert.equal(uiState.isMediaRootInHomeMode({}, "all"), true);
});

test("home recap card entry is shown only in anime mode", () => {
  assert.equal(uiState.shouldShowHomeRecapCard("anime"), true);
  assert.equal(uiState.shouldShowHomeRecapCard("all"), false);
  assert.equal(uiState.shouldShowHomeRecapCard("special"), false);
});

test("anime player entry enables series mode for the current folder series", () => {
  assert.deepEqual(uiState.resolvePlayerEntrySeriesMode("anime", "root-1::show-a"), {
    isSeriesMode: true,
    selectedSeriesKey: "root-1::show-a",
    resetPlaylistFilter: true,
  });
});

test("non-anime player entry uses regular playlist mode", () => {
  assert.deepEqual(uiState.resolvePlayerEntrySeriesMode("all", "root-1::show-a"), {
    isSeriesMode: false,
    selectedSeriesKey: "all",
    resetPlaylistFilter: false,
  });
  assert.equal(uiState.resolvePlayerEntrySeriesMode("special", null).isSeriesMode, false);
});

test("subtitle options include loaded subtitles before manual selection", () => {
  const options = uiState.createSubtitleControlOptions([
    { id: "subtitle:1", name: "Episode 01.ass", isManual: false },
    { id: "manual:1", name: "Manual.srt", isManual: true },
  ]);

  assert.deepEqual(options, [
    { value: "off", label: "字幕关闭" },
    { value: "subtitle:1", label: "Episode 01.ass" },
    { value: "manual:1", label: "手动: Manual.srt" },
    { value: "manual", label: "选择字幕..." },
  ]);
});

test("loaded matching subtitles are applied when current selection is unavailable", () => {
  assert.equal(
    uiState.resolveSubtitleSelection("stale", [
      { id: "subtitle:1", isManual: false },
      { id: "manual:1", isManual: true },
    ]),
    "subtitle:1",
  );
});

test("matching subtitles are auto-selected from off when entering a video", () => {
  assert.equal(
    uiState.resolveSubtitleSelection(
      "off",
      [
        { id: "subtitle:1", isManual: false },
        { id: "manual:1", isManual: true },
      ],
      { autoSelectFromOff: true },
    ),
    "subtitle:1",
  );
});

test("off subtitle selection is preserved outside auto-select window", () => {
  assert.equal(
    uiState.resolveSubtitleSelection("off", [
      { id: "subtitle:1", isManual: false },
      { id: "manual:1", isManual: true },
    ]),
    "off",
  );
});

test("restored embedded subtitles are auto-selected while entering the video", () => {
  assert.equal(
    uiState.resolveRestoredEmbeddedSubtitleSelection(
      "off",
      [
        { id: "embedded:video-1:cache-1", source: "embedded", videoId: "video-1" },
        { id: "embedded:video-2:cache-1", source: "embedded", videoId: "video-2" },
      ],
      "video-1",
      "video-1",
    ),
    "embedded:video-1:cache-1",
  );
});

test("restored embedded subtitles do not override a preserved off selection", () => {
  assert.equal(
    uiState.resolveRestoredEmbeddedSubtitleSelection(
      "off",
      [{ id: "embedded:video-1:cache-1", source: "embedded", videoId: "video-1" }],
      "video-1",
      null,
    ),
    "off",
  );
});

test("existing available subtitle selection is preserved", () => {
  assert.equal(
    uiState.resolveSubtitleSelection("manual:1", [
      { id: "subtitle:1", isManual: false },
      { id: "manual:1", isManual: true },
    ]),
    "manual:1",
  );
});

test("embedded subtitles are converted to persisted restore records", () => {
  assert.deepEqual(
    uiState.createPersistedEmbeddedSubtitles([
      {
        id: "embedded:video-1:cache-1",
        name: "内封字幕 chi CHS",
        relativePath: "Show/E01.mkv#subtitle-2",
        source: "embedded",
        format: "vtt",
        videoId: "video-1",
        embeddedTrack: { streamIndex: 2, codec: "ass", language: "chi", title: "CHS", extractable: true },
      },
      {
        id: "external:1",
        name: "E01.srt",
        relativePath: "Show/E01.srt",
        source: "external",
      },
    ]),
    [
      {
        id: "embedded:video-1:cache-1",
        name: "内封字幕 chi CHS",
        relativePath: "Show/E01.mkv#subtitle-2",
        format: "vtt",
        videoId: "video-1",
        embeddedTrack: { streamIndex: 2, codec: "ass", language: "chi", title: "CHS", extractable: true },
      },
    ],
  );
});
