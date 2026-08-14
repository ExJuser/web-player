# 大型片库性能基线

## 目标规模

- 影片：20,000
- 图片：500,000
- 千图单次生成素材上限：10,000

大型测试数据由 `scripts/large-library-fixtures.mjs` 在运行时确定性生成，仓库不保存大型静态夹具。

## 采集方式

```powershell
npm run benchmark:large-library
```

脚本记录：

- 当前 `dist/assets` 中 JS/CSS 的原始与 gzip 体积；
- 现有搜索文档构建耗时以及暖查询 P50/P95；
- 现有千图全量素材对象展开耗时和堆内存增量。

浏览器启动继续使用现有 `startup:*` Performance Timeline 标记。后续阶段增加搜索 Worker、扫描和千图目录标记，并将结果与本基线对比。

## 阶段预算

- 首页初始业务 JS 原始体积不超过 300 KiB。
- 首页初始 CSS 原始体积不超过 120 KiB。
- 20,000 影片暖搜索 P95 不超过 100 ms，主线程单次阻塞不超过 16 ms。
- 未变化媒体库增量扫描耗时不超过首次完整扫描的 30%。
- 千图常驻素材不超过当前页 48 项与单次生成样本上限 10,000 项。
- 播放时钟更新不提交首页、探索或看图屏幕。

不同硬件的绝对耗时只作为参考，阶段验收同时记录相对基线变化。

## 2026-07-29 初始结果

- 搜索文档构建：187.8 ms。
- 暖搜索 P50/P95：7.0 / 12.0 ms。
- 千图相册构造/素材展开：214.0 / 84.4 ms。
- 千图合成夹具堆内存增量：276.75 MiB。
- 主业务 JS：482.4 KiB raw / 146.3 KiB gzip。
- 全局 CSS：201.8 KiB raw / 33.2 KiB gzip。
- OpenCC：98.8 KiB raw / 50.0 KiB gzip。

## 优化记录（逐轮量化，脚本在 `scripts/benchmark-*.mjs`）

| 轮次 | 修复项 | 修复前 → 修复后 | 验证/基准脚本 |
| --- | --- | --- | --- |
| R1 | SQLite 播放数据全量重写 → 按字段增量 PATCH | 17.4× 写入提速 | `benchmark-patch-write.mjs` |
| R1 | 持久化按 key 粒度（进度/收藏/偏好只写变更键） | 写入体量与次数下降 | 单元测试 |
| R2 | StrictMode 扫描并发请求合并守卫 | 重复扫描消除 | 单元测试 |
| R2 | 视频缩略图状态解耦到外部 store | 缩略图更新不再整树重渲染 | 单元测试 |
| R3 | pinyin-pro 改动态加载 | 主包 804 → 311.6 KiB raw | `vite build` 产物 |
| R4 | 浏览器目录扫描 8 路并发 | 6.5× 扫描提速 | `benchmark-browser-scan.mjs` |
| R5 | 连续阅读器页级渲染（memo 化单页） | 大图集翻页不再整树重渲染 | 单元测试 |
| R6 | 启动/延迟数据视图化加载 | deferred 查询 -73% | `benchmark-load-views.mjs` |
| R8 | 演员元数据解析缓存 | 945 → 12 ms（暖） | `benchmark-search-chain.mjs` |
| R9 | 硬编码看图根目录 → config 驱动 | 相关测试 15 s → 1.8 s | 单元测试 |
| R10 | MosaicViewport 每帧重建消除 | 拖动/缩放不再每帧重建源表 | 单元测试 |
| R11 | IndexedDB 共享连接 + hasData 合并查询 | 打开/查询次数 -26% | 单元测试 |
| R12 | API 错误码统一（400/404/500） | 客户端可预期错误不再收敛为 500 | 单元测试 |
| R14 | 海报尺寸 WeakMap 缓存 | 同文件重复探测消除 | 单元测试 |
| R15 | 千图目标网格读取缓存 | 重复解码/读取消除 | 单元测试 |
| R16 | 扫描批次进度消息节流（500ms 闸） | 大目录扫描 setMessage 次数大幅下降 | 单元测试 |
| R16 | 看图目录删除 8 路并发 | 大图集删除理论 ~8× | 单元测试 |
| R17 | 缩略图预热后台非阻塞 + 容量封顶 | 启动阻塞 99 → 0 ms；读入 5000→4096 份 | `benchmark-thumbnail-warmup.mjs` |
| R18 | 播放列表首元素 O(n) 单遍求值 | 243 → 51 ms（4.8×，4 个调用点） | `benchmark-sort.mjs` |
| R19 | config/app.json mtime 缓存 | 106 → 41 µs/请求（-61%） | `benchmark-config-read.mjs` |
| R19 | 插件 HTTP 冒烟测试（12 个） | 从 0 覆盖到 12 条路由 | `tests/player-data-api-plugin.test.mjs` |
| R20 | API 路由正则集中 + 惰性匹配 | 静态路由匹配 25 → 0 次；参数路由 25 → 9 次 | `benchmark-route-dispatch.mjs` |
| R21 | 标签覆盖率统计共享函数 | App 内重复实现消除 | `tests/tag-utils.test.mjs` |
| R22 | 缩略图/封面字节往返 + ETag 304 测试 | 成功路径回归保护 | `tests/player-data-api-plugin.test.mjs` |

当前验证基线：`node --test` 564 用例全绿、`tsc --noEmit` 0 错误、`vite build` 通过（首页入口 JS 504 KiB raw / 154.6 KiB gzip，CSS 338.8 KiB raw / 54.1 KiB gzip）。

### 仍搁置的高价值项

- **App.tsx（~7.6k 行）结构拆分**：需先合并约 20 组 ref/state 双镜像为外部 store，且为跨视图状态迁移；当前无浏览器验证手段，判定风险过高，以"纯逻辑外移 + 测试锁定"方式渐进推进（R21 标签统计、R23 首页卡片构建已先行抽离）。
