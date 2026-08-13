# Local Web Player（本地 Web 播放器）

一个运行在浏览器里的本地视频播放器与个人媒体管理应用，基于 React 19 + TypeScript + Vite。选择本地文件夹或拖入文件即可扫描并播放视频，播放进度、收藏、标签、评分等数据保存在项目目录下，**视频文件不会上传到任何远程服务器**。

除了视频播放，项目还扩展了看图（图片媒体库）、千图成像（马赛克拼图）、演员视图、观看统计、AI 字幕问答、弹幕、精彩混剪、追番匹配等能力，适合个人本地媒体库的整理与观看。

## 功能特性

### 视频播放

- 支持格式：`.mp4` `.webm` `.ogg` `.mov` `.m4v` `.mkv`；字幕 `.srt` / `.vtt`
- 字幕自动匹配：按影片文件名匹配同目录字幕；同目录 `-translated` 中文字幕自动关联为只读的"中文字幕"系统标签
- 内嵌字幕提取（需 ffmpeg）：提取容器内文本字幕；PGS / VobSub 等图片字幕仅检测、不做 OCR
- 播放模式：顺序播放、单集循环、列表循环、随机播放、只看收藏
- 倍速、音量、静音、画中画、全屏、影院模式、画面旋转、快捷键自定义
- 播放进度保存与断点续看；隐私模式一键快速隐藏播放内容；浅色 / 深色主题

### 媒体库与首页

- 通过 File System Access API 选择本地文件夹（浏览器媒体库），或为媒体库配置服务端可读的本机路径（`localPath`）由本地服务扫描
- 全局媒体库：多个媒体根合并为一个播放列表、搜索索引、进度、收藏与标签
- 首页：继续观看（按已保存进度精确取断点帧）、最近观看、收藏 / 稍后看、全局搜索实时浮层、媒体库卡片
- 媒体模式：追番 / 特殊 / 全部，片库搜索范围为当前模式内的全局搜索
- 系列模式：按推断剧名分组；追番模式接入 Bangumi 剧集匹配
- 排序（名称 / 路径 / 修改时间 / 大小）、收藏筛选、播放列表分页
- 标签系统：手动标签、标签合并与统计、标签探索；评分
- 重复视频检测（名称相似度 + AI 辅助）
- 兼容性处理：ffprobe 探测编码 / 容器兼容性；对可安全 remux 的文件（如 H.264 + AAC/MP3 的非友好容器）生成兼容 MP4；HEVC、10-bit、DTS/TrueHD 等需转码的格式只提示、不处理

### AI 与在线能力（本地服务代理）

- AI 字幕摘要与字幕问答、无剧透回顾（DeepSeek，流式输出）
- AI 标签合并建议、重复检测名称相似度辅助
- 弹幕：Bilibili、巴哈姆特动画疯（通过本机代理抓取并缓存）
- Bangumi 系列匹配

### 创作与处理

- 精彩混剪：播放时标记片段，用 ffmpeg 硬件编码（NVENC / QSV / AMF）或 libx264 生成剪辑视频
- 持久化媒体处理任务：remux、混剪等后台任务带进度，重启后可继续
- LADA 马赛克修复：调用本机 lada-cli 修复指定区域（安装路径见 `server/ladaRestoration.mjs`）
- 缩略图：浏览器端生成 + 服务端 ffmpeg 生成，磁盘缓存 + 内存 LRU

### 看图模式

- 独立于影片媒体库的图片媒体库：可手动添加多个本地文件夹并合并展示，新增目录为追加模式
- 分页 / 窗口化渲染，避免一次性渲染全部图片；按需创建并回收 blob URL（封面、当前页、可见缩略图）
- 连续阅读（竖向）：方向键单次滚动当前视口高度的 5%，按住方向键逐帧连续滚动
- 图片删除：应用内确认弹窗，只用 `queryPermission` 检查权限；无权限时保留媒体库身份并支持逐库重新授权
- 图片标签、收藏、标记已读 / 重读、搜索、统计

### 千图成像

- 马赛克拼图创作：目标图 + 素材图库生成"千图"作品
- 局部素材详情：点击小图在旁展开大图，回源原始文件、按原比例完整显示、自动避让视口边缘
- 旋转 / 缩放 / 高清细节保持一致；已保存作品可重新选择目标图并覆盖保存（不转为新建）
- 作品持久化；从千图跳转图集阅读页可返回原视图并保留状态

### 演员视图与统计

- 演员视图：解析同目录 NFO（演员名、别名）、演员封面与发现；缩略图统一 800:538 容器
- 观看活动：观看日历（月度网格）、最近观看统计、观看时长趋势
- 成长环：把观看记录可视化为"树木年轮"（活跃天数、观看时长、播放次数等）
- 特殊洞察：特殊媒体模式的播放统计（播放过 / 数量 / 发射 / 活跃度）

## 技术栈

- 前端：React 19、TypeScript、Vite 7、lucide-react、opencc-js（简繁转换）、pinyin-pro（拼音排序 / 搜索）
- 后端：Node.js 原生 http/https、`node:sqlite`（本地存储）、ffmpeg / ffprobe（可选，子进程调用）
- 测试：`node --test`

## 环境要求

- Node.js ≥ 22.12（推荐 24；本地存储使用 `node:sqlite`，Node 22.5+ 可用，23.4+ 起无需实验标志）
- npm（或 pnpm）
- 现代浏览器：推荐 Chromium 系（Chrome / Edge）。目录选择与持久化目录访问依赖 File System Access API（`showDirectoryPicker`），并非所有浏览器都支持
- 可选外部依赖：
  - ffmpeg / ffprobe：内嵌字幕提取、兼容性探测、混剪、服务端缩略图（媒体库需有服务端可读路径）
  - lada-cli：马赛克修复（本机安装，路径见 `server/ladaRestoration.mjs`）

## 快速开始

```bash
npm install
npm run dev
```

默认地址 `http://127.0.0.1:3001`（端口在 `config/app.json` 的 `server.port` 配置）。

使用步骤：

1. 打开应用，在首页添加媒体库：选择浏览器文件夹，或为已有媒体库配置本机路径（`localPath`）
2. 等待扫描完成，从播放列表选择视频播放
3. 可按需加载字幕、启用弹幕、标记混剪片段、查看 AI 摘要等
4. 看图模式从首页"看图"入口进入，可单独添加图片媒体库

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（绑定 127.0.0.1，端口见配置） |
| `npm run build` | `tsc --noEmit` 类型检查 + Vite 生产构建到 `dist/` |
| `npm run preview` | 本地预览生产构建（本地 API 同样可用） |
| `npm test` | 运行 `node --test` 单元测试 |
| `npm run benchmark:large-library` | 大媒体库性能基准 |

## 配置

### config/app.json

本地服务端口与媒体根配置（`config/app.json` 已被 git 忽略，属于个人数据）。示例：

```json
{
  "server": { "port": 3001 },
  "media": {
    "roots": [
      { "id": "anime", "label": "Anime", "path": "D:\\Media\\Anime" }
    ]
  }
}
```

浏览器添加的媒体库保留浏览器文件夹名在 `path` 中；如需让本地服务使用 ffmpeg / ffprobe，请为其配置服务端可读的 `localPath`（可在应用内"配置本机路径"对话框设置）：

```json
{
  "id": "anime",
  "label": "Anime",
  "path": "Anime",
  "source": "browser",
  "localPath": "D:\\Media\\Anime"
}
```

### 环境变量（.env.local）

AI 与联网功能通过本地服务代理调用，密钥只保存在本机环境文件，不会暴露给浏览器。在项目根目录创建 `.env.local`：

```text
# AI（字幕摘要 / 问答 / 回顾 / 标签建议 / 重复检测辅助）
DEEPSEEK_API_KEY=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Bangumi 追番匹配
BANGUMI_USER_AGENT=local/bangumi-lens/0.1.0 (https://github.com/local/web-player)
BANGUMI_ACCESS_TOKEN=your_bangumi_access_token
BANGUMI_LENS_PROXY=http://127.0.0.1:7897

# 远程抓取通用代理（弹幕等）
LOCAL_WEB_PLAYER_PROXY=http://127.0.0.1:7897

# 巴哈姆特动画疯弹幕（可能需要通过 Cloudflare 的浏览器身份）
BAHAMUT_USER_AGENT=your_browser_user_agent
BAHAMUT_COOKIE=cf_clearance=...
```

> 应用只把"是否已配置"这类状态暴露给浏览器，不会下发 token 或请求头。

## 数据存储与隐私

- 视频文件只从你选择的文件夹 / 文件播放，**本应用不会上传视频**
- 播放进度、收藏、标签、评分、偏好、观看活动、缩略图、AI 缓存、千图作品、兼容 MP4 等保存在项目目录 `.local-web-player-data/`：
  - `web-player.sqlite`：进度、收藏、标签、评分、偏好、观看记录、重复检测、弹幕偏好等（`node:sqlite`）
  - `thumbnails/`：视频缩略图缓存；`actor-covers/`：演员封面
  - `ai/`、`bangumi/`、`danmaku/`：AI / Bangumi / 弹幕缓存
  - `mosaics/`：千图作品；`compatible-media/`：兼容 MP4 产物
- 不会向所选媒体文件夹写入进度 / 收藏 / 偏好 / 缩略图
- 最近使用的文件夹句柄存于浏览器 IndexedDB（浏览器不提供可序列化的文件系统句柄格式）
- 应用必须通过 `npm run dev` / `npm run preview` 启动，本地项目数据 API 才能写入 `.local-web-player-data/`；直接打开构建后的 HTML 无法持久化数据

## 本地 API（server/）

本地服务以 Vite 插件形式实现（`vite.config.ts` 注册 `playerDataApiPlugin`），在 dev / preview 时挂载 `/api/*` 接口，覆盖：媒体库与看图扫描、播放数据读写、媒体探测与兼容 remux、媒体处理任务、精彩混剪、LADA 修复、内嵌字幕、弹幕抓取、AI 摘要 / 问答 / 回顾、Bangumi 匹配、千图作品、缓存状态与清理、缩略图服务等。

## 目录结构

```text
.
+-- config/
|   +-- app.json              # 端口与媒体根配置（git 忽略，个人数据）
|   +-- app.example.json      # 配置示例
+-- scripts/
|   +-- dev-server.mjs        # Vite 包装：按配置绑定 127.0.0.1:port
|   +-- performance-baseline.mjs / large-library-fixtures.mjs   # 大媒体库基准
+-- server/                   # 本地 Node 服务端（.mjs，Vite 插件形式）
|   +-- playerDataApiPlugin.mjs   # /api/* 本地 API 插件
|   +-- sqliteStorage.mjs         # SQLite 存储（node:sqlite）
|   +-- mediaRoots.mjs            # 媒体库 / 看图扫描、NFO 解析
|   +-- mediaCompatibility.mjs    # ffprobe 探测、兼容 MP4 remux
|   +-- highlightMontage.mjs      # 精彩混剪（ffmpeg 硬件编码）
|   +-- ladaRestoration.mjs       # LADA 马赛克修复
|   +-- videoThumbnailService.mjs # 服务端视频缩略图
|   +-- embeddedSubtitles.mjs     # 内嵌字幕提取
|   +-- deepSeekClient.mjs / aiLibraryService.mjs / aiStreamCache.mjs
|   +-- bangumiClient.mjs / bangumiMatchUtils.mjs
|   +-- bilibiliDanmaku.mjs / bahamutDanmaku.mjs / remoteFetch.mjs
|   +-- mosaicStore.mjs / mediaProcessingTask.mjs / cacheStatus.mjs ...
+-- src/                      # 前端（React 19 + TS）
|   +-- App.tsx               # 主应用：路由、状态编排、控制器挂载
|   +-- main.tsx / styles.css / responsive.css
|   +-- playerTypes.ts / playerStorage.ts / playerUiState.ts / playerConstants.ts
|   +-- useXxxController.ts   # 各功能控制器 hook（弹幕、AI、混剪、看图等）
|   +-- *Section.tsx / *Dialog.tsx / *Card.tsx   # 各视图与组件
+-- tests/                    # node --test 单元测试（server 模块 + 前端逻辑）
+-- docs/                     # 设计文档与基准报告（含 superpowers specs / plans）
+-- public/                   # 静态资源（favicon 等）
+-- index.html / vite.config.ts / package.json
```

## 测试

```bash
npm test
```

测试位于 `tests/`，覆盖服务端模块（媒体库扫描、sqlite 存储、AI / 弹幕 / 混剪 / LADA、兼容性等）与前端逻辑（播放器状态、标签、缩略图、看图 / 千图运行时等）。

## 注意事项与已知限制

- 目录选择依赖浏览器对 `showDirectoryPicker` 的支持；浏览器媒体库授权失效时需要重新授权（看图模式支持逐库重新授权）
- 某些媒体格式可能取决于浏览器内置编解码器；无法直接播放时可用兼容 MP4 生成（仅限可安全 remux 的文件）
- 大文件夹扫描与缩略图生成可能较慢；扫描结果与缩略图均有缓存
- 弹幕抓取可能受目标站点风控影响；失败时按提示配置代理或浏览器身份（cf_clearance）
- `node:sqlite` 需要较新 Node 版本；AI / Bangumi 功能需要配置对应密钥

## License

暂未包含 License 文件。发布前请补充许可证。
