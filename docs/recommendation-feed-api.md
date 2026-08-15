# 推荐流 API

推荐流复用现有局域网服务与媒体 URL。客户端播放 `playbackUrl`，并在 `startTime` 定位；到达 `endTime` 后自动切换下一条。

## 获取推荐

`GET /api/recommendations/feed?mode=anime&limit=8&cursor=0`

- `mode`: `anime` 或 `special`，与 Web 端当前媒体模式一致。
- `limit`: 1–20，默认 8。
- `cursor`: 上一响应的 `nextCursor`；为 `null` 时没有更多内容。

响应中的 `items` 包含：

- `id`、`videoId`、`title`、`relativePath`
- `playbackUrl`、`thumbnailUrl`
- `startTime`、`endTime`、`duration`
- `source`: `manual`、`signals` 或 `fallback`
- `reasons`、`tags`、`rating`、`liked`

`analysis.queued` 表示后台仍在升级分析的影片数。`fallback` 条目可以立即播放，后续请求可能获得基于画面、声音和字幕信号生成的 `signals` 片段。

## 记录反馈

`POST /api/recommendations/feedback`

```json
{
  "videoId": "媒体全局 ID",
  "action": "complete"
}
```

`action` 支持 `like`、`unlike`、`skip`、`complete`、`replay`、`dismiss`。其中 `dismiss` 会从后续推荐中排除整部影片。

## 查询分析状态

`GET /api/recommendations/status`

返回已缓存分析数、排队数和当前是否正在分析。客户端不需要轮询该接口才能播放推荐流。
