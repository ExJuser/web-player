const bahamutGeoSources = [
  { geo: "TW", label: "台湾站" },
  { geo: "HK", label: "香港站" },
];

const bahamutRequestHeaders = {
  Origin: "https://ani.gamer.com.tw",
  "X-Requested-With": "XMLHttpRequest",
};

function normalizeBahamutMode(value) {
  if (value === 1 || value === "1") return 5;
  if (value === 2 || value === "2") return 4;
  return 0;
}

function normalizeBahamutColor(value) {
  if (typeof value !== "string") return undefined;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return match ? Number.parseInt(match[1], 16) : undefined;
}

export function createBahamutDanmakuService({
  createDanmakuComment,
  dedupeDanmakuComments,
  formatRemoteFetchError,
  requestExternalJson,
}) {
  function parseBahamutDanmakuPayload(payload, geo) {
    const rows = Array.isArray(payload?.data?.danmu) ? payload.data.danmu : [];
    const comments = rows
      .map((row) =>
        createDanmakuComment({
          id: row?.sn ? `bahamut:${geo}:${row.sn}` : undefined,
          time: Number(row?.time),
          mode: normalizeBahamutMode(row?.position),
          color: normalizeBahamutColor(row?.color),
          text: row?.text,
        }),
      )
      .filter(Boolean);
    const totalCount = Number.isFinite(Number(payload?.data?.totalCount)) ? Number(payload.data.totalCount) : comments.length;
    return { comments, totalCount };
  }

  async function fetchBahamutDanmaku(parsed) {
    const comments = [];
    const sourceChildren = [];
    const errors = [];
    for (const source of bahamutGeoSources) {
      const endpoint = `https://api.gamer.com.tw/anime/v1/danmu.php?videoSn=${encodeURIComponent(parsed.value)}&geo=${source.geo}`;
      try {
        const payload = await requestExternalJson(endpoint, {
          accept: "application/json,text/plain,*/*",
          referer: parsed.url,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          headers: bahamutRequestHeaders,
        });
        const parsedPayload = parseBahamutDanmakuPayload(payload, source.geo);
        comments.push(...parsedPayload.comments);
        sourceChildren.push({
          provider: "bahamut",
          label: source.label,
          sourceUrl: parsed.url,
          commentCount: parsedPayload.totalCount,
        });
      } catch (error) {
        errors.push(`${source.label}: ${formatRemoteFetchError(error)}`);
      }
    }
    const mergedComments = dedupeDanmakuComments(comments);
    if (!mergedComments.length) {
      throw new Error(`巴哈姆特动画疯弹幕接口未返回可用内容。${errors.join("；")}`);
    }
    const totalCount = sourceChildren.reduce((sum, source) => sum + source.commentCount, 0);
    return {
      provider: "bahamut",
      title: `巴哈姆特动画疯 SN ${parsed.value}`,
      sourceUrl: parsed.url,
      comments: mergedComments,
      sourceBreakdown: [
        {
          provider: "bahamut",
          label: "巴哈姆特动画疯",
          sourceUrl: parsed.url,
          commentCount: totalCount || mergedComments.length,
          children: sourceChildren,
        },
      ],
    };
  }

  return {
    parseBahamutDanmakuPayload,
    fetchBahamutDanmaku,
  };
}
