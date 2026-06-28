const imageSubtitleCodecs = new Set(["hdmv_pgs_subtitle", "pgs", "dvd_subtitle", "dvb_subtitle", "xsub"]);

export function isImageSubtitleCodec(codec) {
  return imageSubtitleCodecs.has(String(codec || "").toLowerCase());
}
