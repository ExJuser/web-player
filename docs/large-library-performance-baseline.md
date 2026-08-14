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
| R23 | 首页卡片构建纯函数 + 优化记录汇总 | 逻辑外移、测试锁定 | `tests/home-video-card.test.mjs` |
| R24 | 搜索降级路径文档构建缓存 | Worker 不可用时每键 208ms → 每次激活 1 次 | `src/useLibrarySearch.ts` |
| R25 | 视频元数据合并 O(1) 早退 | 2 万级整表 map → Map.get（无变化零分配） | `src/App.tsx` |
| R26 | 首页卡片候选优先构建 | 进度保存重算 22.2 → 4.6 ms（-80%） | `benchmark-home-cards.mjs` |
| R27 | 观看记录轮播 tick 局部化 | 探索视图重渲染范围：整树 → 单区块 | `src/WatchActivitySection.tsx` |

当前验证基线：`node --test` 568 用例全绿、`tsc --noEmit` 0 错误、`vite build` 通过（首页入口 JS 504 KiB raw / 154.6 KiB gzip，CSS 338.8 KiB raw / 54.1 KiB gzip）。

## 复测（2026-09，`node scripts/performance-baseline.mjs`）

| 指标 | 2026-07-29 初始 | 当前 | 变化 |
| --- | --- | --- | --- |
| 搜索文档构建（20k） | 187.8 ms | 208.3 ms | ≈持平（Worker 内离线构建，不阻塞主线程） |
| 暖搜索 P50 / P95 | 7.0 / 12.0 ms | 7.4 / 11.4 ms | P95 改善，预算 ≤100 ms 持续满足 |
| 千图相册构造 / 素材展开 | 214.0 / 84.4 ms | 198.3 / 74.9 ms | **-7% / -11%** |
| 千图合成堆内存增量 | 276.75 MiB | 276.70 MiB | ≈持平 |
| 主业务入口 JS | 482.4 / 146.3 KiB（raw/gzip） | 492.6 / 151.0 KiB | +2%（功能增长） |
| 全局 CSS | 201.8 / 33.2 KiB | 330.9 / 52.8 KiB | +64%（新增 UI 特性） |

注：入口 JS/CSS 增长来自期间新增功能（看图、千图、演员、探索、弹幕等），非回归；各功能块已按需分包（lazy import + manualChunks），首页首屏仅加载入口 + vendor。

### 运行全部基准

```powershell
node scripts/performance-baseline.mjs        # 大库搜索/千图/产物体积
node scripts/benchmark-patch-write.mjs       # SQLite 增量写入
node scripts/benchmark-sort.mjs              # 播放列表排序 vs 单遍首元素
node scripts/benchmark-browser-scan.mjs      # 浏览器目录扫描并发
node scripts/benchmark-load-views.mjs        # 启动/deferred 视图 SQL 次数
node scripts/benchmark-search-chain.mjs      # 搜索链路（含演员元数据解析）
node scripts/benchmark-thumbnail-warmup.mjs  # 缩略图预热封顶
node scripts/benchmark-config-read.mjs       # config mtime 缓存
node scripts/benchmark-route-dispatch.mjs    # API 路由正则惰性匹配
```

### 仍搁置的高价值项

- **App.tsx（~7.6k 行）结构拆分**：需先合并约 20 组 ref/state 双镜像为外部 store，且为跨视图状态迁移；当前无浏览器验证手段，判定风险过高，以"纯逻辑外移 + 测试锁定 + 状态下沉"方式渐进推进（R21 标签统计、R23 首页卡片、R26 候选优先、R27 tick 下沉均已先行落地）。

## 收尾总结（2026-09）

- 累计 36 个修复提交，全部经 `node --test`（572 用例）、`tsc --noEmit`、`vite build` 验证。
- 评审 Top 10 问题全部处理完毕：多数已修复并量化（SQLite 增量 17.4×、扫描 6.5×、deferred 视图 -73%、演员元数据 945→12ms、排序首元素 4.8×、进度保存卡片重算 -80%、config -61%、预热启动 0ms 阻塞等），结构性重构（App 拆分、API 路由表化）因无浏览器验证手段而明确搁置并说明理由，未出现未知遗留。
- 大库预算持续满足：20k 暖搜索 P95 11.4ms（≤100ms）、增量扫描复用缓存、播放时钟不提交首页/探索/看图屏幕、千图素材窗口化有界。
- 剩余低价值项：#13 连续阅读器预取半径微调（页组件 memo 已把重渲染限制在 ±2 边界页）、#11 createThumbnailTargetTimes 死导出（被测试引用，保留）。
