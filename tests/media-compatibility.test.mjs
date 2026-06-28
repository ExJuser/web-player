import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMediaProbe,
  createCompatibleMediaCacheId,
  createCompatibleRemuxArgs,
  createNeedsLocalPathPlayability,
  mediaContentTypeForPath,
} from "../server/mediaCompatibility.mjs";
import { scanMediaRoot } from "../server/mediaRoots.mjs";
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function probe({
  format = "matroska,webm",
  video = "h264",
  audio = "aac",
  pixFmt = "yuv420p",
  profile = "High",
  level,
  width = 1920,
  height = 1080,
  avgFrameRate,
  bitRate,
  subtitles = [],
} = {}) {
  return {
    format: { format_name: format, bit_rate: bitRate },
    streams: [
      {
        index: 0,
        codec_type: "video",
        codec_name: video,
        pix_fmt: pixFmt,
        profile,
        level,
        width,
        height,
        avg_frame_rate: avgFrameRate,
        bit_rate: bitRate,
      },
      ...(audio ? [{ index: 1, codec_type: "audio", codec_name: audio }] : []),
      ...subtitles.map((codec, index) => ({ index: index + 2, codec_type: "subtitle", codec_name: codec })),
    ],
  };
}

test("classifies browser direct MP4 media", () => {
  const result = classifyMediaProbe(probe({ format: "mov,mp4,m4a,3gp,3g2,mj2" }), "Episode.mp4");

  assert.equal(result.playability.status, "direct");
  assert.equal(result.canRemux, true);
  assert.equal(result.playability.videoCodec, "h264");
  assert.equal(result.playability.audioCodec, "aac");
});

test("direct MP4 media reports image subtitle limitations", () => {
  const result = classifyMediaProbe(
    probe({ format: "mov,mp4,m4a,3gp,3g2,mj2", subtitles: ["hdmv_pgs_subtitle"] }),
    "Episode.mp4",
  );

  assert.equal(result.playability.status, "direct");
  assert.match(result.playability.reason, /图形字幕/);
});

test("direct H.264 media reports high decode load risk", () => {
  const result = classifyMediaProbe(
    probe({
      format: "mov,mp4,m4a,3gp,3g2,mj2",
      width: 3840,
      height: 2160,
      avgFrameRate: "60000/1001",
      bitRate: "55000000",
      level: 51,
    }),
    "Episode.mp4",
  );

  assert.equal(result.playability.status, "direct");
  assert.equal(result.playability.videoLevel, 51);
  assert.equal(Math.round(result.playability.frameRate), 60);
  assert.equal(result.playability.bitRate, 55000000);
  assert.match(result.playability.performanceWarning, /4K|60fps|高码率|Level 5\.1/);
});

test("classifies MKV with MP4-compatible streams as remux recommended", () => {
  const result = classifyMediaProbe(probe(), "Episode.mkv");

  assert.equal(result.playability.status, "remuxRecommended");
  assert.equal(result.canRemux, true);
});

test("classifies unsupported codecs that require transcoding", () => {
  const hevc = classifyMediaProbe(probe({ video: "hevc", pixFmt: "yuv420p10le" }), "Episode.mkv");
  const dts = classifyMediaProbe(probe({ audio: "dts" }), "Episode.mkv");

  assert.equal(hevc.playability.status, "unsupported");
  assert.match(hevc.playability.reason, /HEVC|高位深/);
  assert.equal(dts.playability.status, "unsupported");
  assert.match(dts.playability.reason, /dts/);
});

test("browser roots without localPath are marked as needing a local path", () => {
  assert.deepEqual(createNeedsLocalPathPlayability(), {
    status: "needsLocalPath",
    reason: "浏览器添加的媒体库需要先配置本机路径，才能使用 ffprobe/ffmpeg。",
  });
});

test("compatible cache id changes when file identity changes", () => {
  const first = createCompatibleMediaCacheId("anime", "Show/E01.mkv", 100, 123);
  const second = createCompatibleMediaCacheId("anime", "Show/E01.mkv", 100, 124);

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test("compatible remux regenerates a clean MP4 timeline without transcoding", () => {
  const args = createCompatibleRemuxArgs("input.mkv", "output.tmp.mp4");

  assert.deepEqual(args.slice(0, 7), ["-v", "error", "-y", "-fflags", "+genpts", "-i", "input.mkv"]);
  assert.equal(args.at(-1), "output.tmp.mp4");
  assert.equal(args.includes("copy"), true);
  assert.equal(args.includes("-avoid_negative_ts"), true);
  assert.equal(args.includes("make_zero"), true);
  assert.equal(args.includes("-video_track_timescale"), true);
  assert.equal(args.includes("90000"), true);
  assert.equal(args.includes("-map_metadata"), true);
  assert.equal(args.includes("-map_chapters"), true);
});

test("maps media content types by extension", () => {
  assert.equal(mediaContentTypeForPath("E01.mp4"), "video/mp4");
  assert.equal(mediaContentTypeForPath("E01.m4v"), "video/mp4");
  assert.equal(mediaContentTypeForPath("E01.webm"), "video/webm");
  assert.equal(mediaContentTypeForPath("E01.ogg"), "video/ogg");
  assert.equal(mediaContentTypeForPath("E01.ogv"), "video/ogg");
  assert.equal(mediaContentTypeForPath("E01.mov"), "video/quicktime");
  assert.equal(mediaContentTypeForPath("E01.mkv"), "video/x-matroska");
  assert.equal(mediaContentTypeForPath("E01.VTT"), "text/vtt; charset=utf-8");
  assert.equal(mediaContentTypeForPath("cover.jpeg"), "image/jpeg");
  assert.equal(mediaContentTypeForPath("cover.webp"), "image/webp");
  assert.equal(mediaContentTypeForPath("notes.txt"), "application/octet-stream");
});

test("scanMediaRoot attaches playability from the provided inspector", async () => {
  const directory = path.join(tmpdir(), `web-player-media-compat-${Date.now()}`);
  await mkdir(directory, { recursive: true });
  const videoPath = path.join(directory, "E01.mkv");
  await writeFile(videoPath, "");
  await truncate(videoPath, 51 * 1024 * 1024);

  const result = await scanMediaRoot(
    { id: "anime", label: "Anime", path: directory, source: "local" },
    {
      createVideoPlayability: async () => ({
        status: "remuxRecommended",
        reason: "测试",
      }),
    },
  );

  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].playability.status, "remuxRecommended");
});
