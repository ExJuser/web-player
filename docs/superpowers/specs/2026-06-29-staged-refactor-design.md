# 分阶段重构设计

## 背景

本项目是一个 React 19、TypeScript、Vite 和本地 Node API 组成的本地媒体播放器。当前基线验证通过：

- `npm test`：266 个测试全部通过。
- `npm run build`：通过，但生产 JS chunk 约 1.59 MB，Vite 提示 chunk 过大。
- Git 工作树在审计开始时干净。

主要代码债务集中在职责过载和模块边界不清：

- `src/App.tsx` 约 490 KB，混合 UI、浏览器文件扫描、看图模式、缩略图、AI、弹幕、播放控制和资源释放。
- `src/styles.css` 约 155 KB，样式集中且后续 UI 调整需要浏览器检查。
- `vite.config.ts` 承载 Vite 配置和大量本地 API 路由，并使用唯一的 `@ts-nocheck`。
- `server/sqliteStorage.mjs` 约 48 KB，存储职责集中。
- `node_modules` 存在不在 `package.json` 中的 extraneous 包，属于本地依赖目录残留，不应进入代码提交。

## 目标

在不改变现有功能和用户体验的前提下，逐步提升可维护性、类型可信度和运行效率。每个阶段都必须保持可构建、可测试，并独立提交。

本设计不追求一次性重写。重构必须优先保持行为稳定，按明确边界拆分职责，避免在同一提交里混合功能变化、样式变化和结构变化。

## 非目标

- 不重写播放器核心交互。
- 不替换 React、Vite、Node test 或现有本地 API 形态。
- 不改变现有 API URL、响应结构、持久化数据格式或用户可见文案。
- 不为了消除 Vite chunk 警告而盲目拆包；性能优化应建立在模块边界稳定之后。

## 方案比较

### 方案 A：先拆前端主组件

直接拆 `src/App.tsx`，抽出 hook、组件和浏览器资源管理。

优点：收益最大，能直接降低主文件认知负担。

缺点：`App.tsx` 内 state/ref、effect 和回调交织严重，第一阶段直接拆 JSX 或 hook 回归面较宽。

### 方案 B：先拆服务端 API

将 `vite.config.ts` 中的本地 API plugin 和 helper 移入 `server/`，让 Vite 配置文件只负责配置和挂载。

优点：边界清晰，风险低，能移除唯一 `@ts-nocheck`，为后续服务端测试和路由整理打基础。

缺点：对用户体感性能提升不明显。

### 方案 C：先做性能优化

优先处理 bundle code splitting、资源缓存上限、对象 URL 生命周期和懒加载。

优点：可能更快带来运行效率收益。

缺点：如果先不整理模块边界，容易继续在巨型组件中叠加临时实现。

推荐顺序：B -> A -> C。

## 第一阶段：拆出本地 API plugin

目标是保持行为完全不变，只改变代码组织结构。

### 计划边界

- 新增 `server/playerDataApiPlugin.mjs`。
- 将 `vite.config.ts` 中的 API helper、扫描请求合并状态、middleware 和 `playerDataApiPlugin(env)` 移入新文件。
- `vite.config.ts` 只保留 Vite 配置、env 加载、插件引用和必要常量。
- 不改变任何 `/api/` 路径、HTTP method、响应结构、错误文案或缓存目录。
- 不引入新依赖。
- 尝试移除 `vite.config.ts` 的 `@ts-nocheck`；若 Vite/Node 类型阻塞，则用局部 JSDoc 或极小范围的类型收窄处理，不重新放大全文件类型跳过。

### 验证

- `npm test`
- `npm run build`
- `rg -n --fixed-strings "@ts-nocheck" .`
- `git diff --stat` 和重点 diff 复核，确认没有行为性改动。

因为第一阶段不改 UI，不需要浏览器检查。

### 风险控制

- 先整体搬迁，再做最小导入修正。
- 不在同一提交中重命名路由、改变存储类或调整扫描逻辑。
- 如果测试暴露行为变化，只修正搬迁导致的问题，不顺手重构其他模块。

## 第二阶段：前端纯逻辑外移

目标是降低 `App.tsx` 的体量和认知负担，优先抽离无 JSX、低耦合、已有测试或易补测试的纯逻辑。

候选模块：

- 浏览器媒体扫描：`collectVideos`、`collectVideosFromFiles`、目录权限和父目录解析。
- 看图扫描与缓存对齐：`collectPhotoAlbumsFromDirectory`、`collectPhotoAlbumsFromBrowserFiles`、缓存状态转换。
- 字幕 URL 与文本读取：`createSubtitleUrl`、`readSubtitleText`、缓存内封字幕恢复。
- 缩略图生成：视频 metadata、canvas 编码、缓存加载。
- 对象 URL 生命周期辅助：统一 revoke 和按需保留策略。

每次只抽一个主题，补或迁移对应测试，再运行 `npm test` 和 `npm run build`。

## 第三阶段：前端状态与组件边界

在纯逻辑外移后，再拆 hook 和组件，避免过早在纠缠状态上做大手术。

候选边界：

- 媒体库与搜索面板。
- 图集列表和阅读器。
- 弹幕设置与加载。
- AI 字幕总结、问答和回顾。
- 兼容 MP4 生成与删除弹窗。
- 缓存状态弹窗。

所有 UI 改动后必须启动本地页面并做浏览器检查，覆盖深色和浅色主题相关区域。

## 第四阶段：运行效率与资源占用

在模块边界清晰后处理性能：

- 对非首屏功能使用 `React.lazy` 或动态 import，优先拆 AI、看图模式、弹幕、缓存状态等重型区域。
- 复核对象 URL 的创建、复用和释放，给图片/缩略图缓存设置清晰上限。
- 对重复 `Set`/`Map` 构建和大列表派生数据做 memo 边界复核。
- 保持媒体扫描和 ffmpeg/ffprobe 按需触发，不扩大首页或全局扫描开销。

验证包括 `npm test`、`npm run build`、浏览器检查，以及必要时记录 build chunk 变化。

## 第五阶段：依赖和维护性清理

- 清理本地 extraneous 依赖的建议流程是删除 `node_modules` 后按 lockfile 重装；这不应作为源码提交。
- 持续检查未使用导出、重复常量和重复归一化逻辑。
- 对服务端存储模块按表或领域拆分，但不得改变 SQLite schema 行为和迁移语义。

## 完成标准

整体目标完成前，需要满足：

- 关键大文件职责已经按阶段拆分，`App.tsx` 和 `vite.config.ts` 不再承担跨层职责。
- 无全文件 `@ts-nocheck`。
- 冗余依赖、重复逻辑和临时实现有清单并已处理或明确保留理由。
- 对象 URL、图片缓存、扫描和 ffmpeg/ffprobe 路径符合项目规则。
- `npm test` 和 `npm run build` 通过。
- UI 改动阶段完成本地浏览器检查。
- 每个阶段都有独立 git commit。
