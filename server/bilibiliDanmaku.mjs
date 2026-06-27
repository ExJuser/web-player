export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function createBilibiliDanmakuService({
  createDanmakuComment,
  dedupeDanmakuComments,
  formatRemoteFetchError,
  requestExternalJson,
  requestExternalText,
}) {
  function parseBilibiliXmlDanmaku(xmlText) {
    const comments = [];
    const pattern = /<d\s+[^>]*p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
    let match;
    while ((match = pattern.exec(xmlText))) {
      const parts = match[1].split(",");
      const comment = createDanmakuComment({
        id: parts[7] ? `bilibili:${parts[7]}` : undefined,
        time: Number(parts[0]),
        mode: parts[1],
        color: parts[3],
        text: decodeHtmlEntities(match[2]),
      });
      if (comment) comments.push(comment);
    }
    return dedupeDanmakuComments(comments);
  }

  async function resolveBilibiliCid(parsed) {
    if (parsed.kind === "cid") return { cid: parsed.value, title: `Bilibili CID ${parsed.value}` };
    if (parsed.kind === "ep") {
      const payload = await requestExternalJson(`https://api.bilibili.com/pgc/view/web/season?ep_id=${encodeURIComponent(parsed.value)}`, {
        referer: parsed.url,
      });
      const episode = (payload?.result?.episodes || []).find((item) => String(item?.id) === parsed.value) || payload?.result?.episodes?.[0];
      if (!episode?.cid) throw new Error("Bilibili 番剧条目没有可用弹幕 cid。");
      return { cid: String(episode.cid), title: episode.long_title || episode.title || payload?.result?.title || `Bilibili EP ${parsed.value}` };
    }

    const queryKey = parsed.kind === "aid" ? "aid" : "bvid";
    const payload = await requestExternalJson(`https://api.bilibili.com/x/player/pagelist?${queryKey}=${encodeURIComponent(parsed.value)}`, {
      referer: parsed.url,
    });
    const page = Array.isArray(payload?.data) ? payload.data[0] : null;
    if (!page?.cid) throw new Error("Bilibili 视频没有可用弹幕 cid。");
    return { cid: String(page.cid), title: page.part || `Bilibili ${parsed.value}` };
  }

  async function fetchBilibiliDanmaku(parsed) {
    const { cid, title } = await resolveBilibiliCid(parsed);
    const requestOptions = {
      accept: "application/xml,text/xml,text/plain,*/*",
      referer: parsed.url,
      userAgent: "Mozilla/5.0 local-web-player/0.1",
    };
    const endpoints = [
      `https://comment.bilibili.com/${encodeURIComponent(cid)}.xml`,
      `https://api.bilibili.com/x/v1/dm/list.so?oid=${encodeURIComponent(cid)}`,
    ];
    const errors = [];
    let xml = "";
    for (const endpoint of endpoints) {
      try {
        xml = await requestExternalText(endpoint, requestOptions);
        if (xml.trim()) break;
        errors.push(`${endpoint}: 空响应`);
      } catch (error) {
        errors.push(`${endpoint}: ${formatRemoteFetchError(error)}`);
      }
    }
    if (!xml.trim()) {
      throw new Error(`Bilibili 弹幕接口未返回内容，可能是该集弹幕暂不可公开访问或网络被拦截。${errors.join("；")}`);
    }
    const comments = parseBilibiliXmlDanmaku(xml);
    if (!comments.length) {
      throw new Error("Bilibili 弹幕接口已响应，但没有解析到可用弹幕。");
    }
    return {
      provider: "bilibili",
      title,
      sourceUrl: parsed.url,
      comments,
    };
  }

  return {
    parseBilibiliXmlDanmaku,
    resolveBilibiliCid,
    fetchBilibiliDanmaku,
  };
}
