# Project Rules

- Do not use native browser dialogs such as `alert`, `confirm`, or `prompt`; use app-styled modal UI instead.
- Do not expose native browser scrollbars; style scrollable areas with the app's custom scrollbar treatment.
- Media library names (`label`) are display names and may be duplicated; never use `label` as a uniqueness constraint.
- 将你犯过的错、我提过的提醒记录下来，写进 `AGENTS.md`。
- 后续输出计划需要用中文展示。
- 浏览器添加的媒体根目录只有目录句柄和相对路径，不等于服务端可访问的本机绝对路径；依赖 ffmpeg/ffprobe 的功能必须先确认 `source !== "browser"` 或存在已验证的 `localPath`，否则不要把入口做成可点击后才报错。
- 给浏览器添加的媒体库补本机绝对路径时，保存在 `localPath`；不要覆盖 `path`，因为 `path` 是浏览器目录标识。
- Tag 是用户输入的显示元数据，不得作为唯一标识；涉及合并、相似关系或持久化关联时使用归一化 key 或 `videoId`。
- 读取包含中文的项目文件时显式使用 UTF-8，避免把 PowerShell 默认编码导致的乱码误判为源码损坏。
- React state updater 必须保持纯函数；不要在 updater 内修改 ref 或其他外部状态，否则 StrictMode/并发渲染可能让自动选择等逻辑计算两次后回退。
- 全局媒体库下 `video.id` 必须包含 `mediaRootId`；跨媒体根迁移旧数据时用旧相对路径 id 映射到全局 id，不能再假设单库内唯一。
- 修复 UI 溢出问题时不能只调整高度/间距或只按横向溢出推断；必须检查文本横向约束、换行策略、行高和实际裁切方向，避免“总大小/文件数/缓存种类/最近更新”等标签继续溢出或被底部裁切。
- 每完成一个需求开发或 bug 修复后，都要将此次相关修改提交到 git。
