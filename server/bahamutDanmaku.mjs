const bahamutGeoSources = [
  { geo: "TW", label: "台湾站" },
  { geo: "HK", label: "香港站" },
];

const bahamutRequestHeaders = {
  Origin: "https://ani.gamer.com.tw",
  "X-Requested-With": "XMLHttpRequest",
};

function getBahamutRequestConfig(env = process.env) {
  return {
    cookie: typeof env.BAHAMUT_COOKIE === "string" ? env.BAHAMUT_COOKIE.trim() : "",
    userAgent:
      (typeof env.BAHAMUT_USER_AGENT === "string" ? env.BAHAMUT_USER_AGENT.trim() : "") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  };
}

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
  requestExternalText,
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

  async function fetchBahamutAjaxDanmaku(parsed) {
    if (!requestExternalText) throw new Error("巴哈姆特 AJAX 弹幕接口不可用。");
    const requestConfig = getBahamutRequestConfig();
    const text = await requestExternalText("https://ani.gamer.com.tw/ajax/danmuGet.php", {
      method: "POST",
      accept: "application/json,text/plain,*/*",
      referer: parsed.url,
      userAgent: requestConfig.userAgent,
      headers: {
        ...bahamutRequestHeaders,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...(requestConfig.cookie ? { Cookie: requestConfig.cookie } : {}),
      },
      body: new URLSearchParams({ sn: parsed.value }).toString(),
    });
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw new Error("巴哈姆特 AJAX 弹幕接口返回了无效 JSON。");
    }
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
    if (mergedComments.length) {
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

    try {
      const ajaxPayload = await fetchBahamutAjaxDanmaku(parsed);
      const ajaxParsedPayload = parseBahamutDanmakuPayload(ajaxPayload, "ajax");
      const ajaxComments = dedupeDanmakuComments(ajaxParsedPayload.comments);
      if (ajaxComments.length) {
        return {
          provider: "bahamut",
          title: `巴哈姆特动画疯 SN ${parsed.value}`,
          sourceUrl: parsed.url,
          comments: ajaxComments,
          sourceBreakdown: [
            {
              provider: "bahamut",
              label: "巴哈姆特动画疯 AJAX",
              sourceUrl: parsed.url,
              commentCount: ajaxParsedPayload.totalCount || ajaxComments.length,
            },
          ],
        };
      }
      errors.push("AJAX 接口: 没有解析到可用弹幕");
    } catch (error) {
      errors.push(`AJAX 接口: ${formatRemoteFetchError(error)}`);
    }

    const cookieHint = getBahamutRequestConfig().cookie ? "" : "；如仍失败，请从浏览器复制动画疯的 cf_clearance cookie 到 BAHAMUT_COOKIE";
    throw new Error(`巴哈姆特动画疯弹幕接口未返回可用内容。${errors.join("；")}${cookieHint}`);
  }

  return {
    parseBahamutDanmakuPayload,
    fetchBahamutAjaxDanmaku,
    fetchBahamutDanmaku,
  };
}
