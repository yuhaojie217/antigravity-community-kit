# 架构原理与踩坑实录（社区参考文档）

本文汇总了在改造 Antigravity 桌面端 UI、实现工作微进度胶囊、增量汉化与 `gemini-pulse` 插件过程中实测验证过的关键架构与避坑方案，供社区优化 Antigravity 或开发同类插件时直接复用。

---

## 1. Electron 注入为什么以前总掉？—— 正确的挂载时机

- **核心挂载点**：`app.asar` 内的 `dist/utils.js` 中 `createWindow()` 函数内的 `registerWindowWebContents(win, hubContents);` 之后、**`win.loadURL(url)` 之前**。
- **坑点**：如果在窗口已打开后的其他回调中才 `attach(hubContents)`，`dom-ready` 事件早已触发完毕，导致冷启动或切页后皮肤随机失效。
- **防串页机制**：`custom-theme-main.js` 每次 `dom-ready` 递增 `generation` 计数器；若异步读取资产或探测端口期间发生新一轮导航，旧任务直接丢弃，不会把样式错注入到新页面。

---

## 2. 为什么绝不能用 `@electron/asar pack` 整包重打？

官方 Antigravity 的 `app.asar` 内部带有约 **377 个 `unpacked` 外置文件标记**（如 `app.asar.unpacked/node_modules/chrome-devtools-mcp/**`）。

- 使用常规 `asar pack` 会丢失这些 `unpacked` 标记，并重写全部偏移量，导致打包后客户端静默崩溃或 MCP 子进程报错。
- **正确做法（见 `injector/patch_asar_stable.py`）**：
  1. 只替换目标文件 blob（`dist/utils.js` 与 `dist/custom-theme-main.js`），其余所有文件字节原样保留。
  2. 保留所有 `unpacked: true` 条目不动，仅重算打包文件的 `offset` 与 `integrity.hash`（SHA-256）。
  3. 严格按照 **V8 Pickle 4 字节对齐格式** 重写头部：
     ```text
     [0:4]   = 4                     (固定)
     [4:8]   = align4(4 + inner)     (外层 header 长度)
     [8:12]  = align4(4 + json_len)  (内层 JSON 块长度)
     [12:16] = json_len              (JSON 原始字节长度)
     [16:..] = JSON bytes + 0x00 对齐填充
     ```
  4. 写入前对临时文件执行完整反解析 + SHA-256 自检，确认通过且 `Antigravity.exe` 未运行后再同卷原子 `os.replace`。

---

## 3. CSS 主题切换串味根因：User Origin `!important` 优先级陷阱

- Electron 的 `wc.insertCSS(theme.css, { cssOrigin: 'user' })` 属于 **User Origin**。
- 根据 CSS Cascade 规范：**User Origin 中的 `!important` 优先级高于页面 `<style>`（Author Origin）中的 `!important`**。
- 如果 `theme.css` 里存在未加作用域的 `!important` 规则（例如 `.surface-composer::after` 四色彩框），切换成 Claude 或 Default 皮肤时，页面内动态写入的 `<style id="agy-theme-style">` 永远无法覆盖它。
- **彻底解法**：
  - 切换主题时在根节点写 `document.documentElement.setAttribute('data-agy-theme', 'google' | 'claude' | 'off')`。
  - `google.css` 所有皮肤规则全部限定在 `html[data-agy-theme="google"]`（外加首次启动防闪白 `html:not([data-agy-theme])`）；`claude.css` 全部限定在 `html[data-agy-theme="claude"]`。
  - 暗色模式使用 `html[data-agy-theme="..."]:has(body.theme-dark)` 让根元素与 `body` 同步切换深色令牌，消除滚动条边缘露白。

---

## 4. 界面改造高频 UI 踩坑对照（ADR 总结）

| 问题现象 | 根因 | 实测解法 |
| --- | --- | --- |
| **弹窗/下拉菜单双重曝光、半透明穿帮** | 宿主浮层继承了透明背景变量或 `backdrop-filter` | 对 `[role="dialog"]`、`[role="menu"]`、`[data-radix-menu-content]` 等在亮色下强制重置 `--background`/`--popover` 为实底并关闭 `backdrop-filter`，设置 `z-index: 999999`。 |
| **侧边栏下拉菜单被边缘裁切** | 给侧边栏容器加了 `transform` / `will-change` / `backdrop-filter` 触发 GPU 合成层隔离 | **严禁**对 `div[role="navigation"].bg-sidebar` 创建新 stacking context 或 GPU 合成层。 |
| **辅助栏 Tab 关闭按钮不可点** | 覆盖全局悬停样式时误伤 `.agy-hover-actions` 或被输入区渐隐遮罩挡住 | 显式保留 `.agy-aux-tab .agy-hover-actions` 的 `display: flex; pointer-events: auto; z-index: 20`，并精确排除 `:not(.agy-hover-actions)` 再隐藏底部渐隐遮罩。 |
| **自定义控件触发启动卡顿与无限重绘** | `MutationObserver` 监听整个 `document.body`，自定义挂件/圆环更新文本又再次触发 Observer | 在 Observer 回调中跳过 `#hakimi-muse-stage, #agy-codex-ctx-btn, #agy-pulse-drawer` 等自有控件节点，并用 `requestAnimationFrame` 合帧节流，仅在文本确实变化时才写 `textContent`。 |
| **输入框四色边框变粗成色带** | 用外层 `padding` 撑出的渐变背景在深色顶部栏会被拉宽 | 改用 `.surface-composer::after` 配合 `-webkit-mask-composite: xor` / `mask-composite: exclude` 绘制恒定 `1.5px` 内描边，无论内容高度如何变化都不变形。 |

---

## 5. 「边工作边说小进度」微状态胶囊机制

- **忙碌状态判断**：检测停止按钮 `button[data-testid="input-stop-button"]` 或运行卡片 `[data-testid="running-items-card"]`。
- **实时状态文本抓取**：扫描当前聊天区的状态与聚焦元素（`[data-testid*="status"], [data-testid*="focus"], [class*="animate-pulse"]`），排除自身组件后取最新一条有效短文本。
- **动作自动分类**：命中终端/命令/编辑/写入/测试/MCP 等关键词切换为「敲电脑双帧」，其余切换为「伏案写字双帧」；若当前轮已有流式速率数据，在胶囊尾部附加 `· XX t/s` 实时速率。

---

## 6. `gemini-pulse` 插件性能优化与上下文窗口实测

### 6.1 为什么默认压缩线设为 `512K`（保留一键切 `1M`）？
- 宿主 `GetAvailableModels` 返回的物理上限（`maxTokens`）：Gemini 4 全系为 `1,048,576`（1M），Claude 5.5 为 `1,000,000`（1M），GPT-OSS 120B 为 `131,072`（128K）。
- 但在 Antigravity 实际多轮 Agent 对话中，运行时会在约 **512K tokens** 处主动触发自动压缩（`CHECKPOINT`，将历史摘要回 ~30K 以防止上下文腐烂与缓存失效；早期版本曾采用 `256K`）。
- 因此将 **512K** 设为默认百分比参考线最贴近实际剩余空间，同时保留按钮一键切换查看 **1M 物理窗口**。

### 6.2 宿主 LS RPC 流量削减（404 KB/12s → 1.9 KB/12s）
- 实测本机 Antigravity Language Server 三个接口的单次响应体积：
  - `RetrieveUserQuotaSummary`：**~1.9 KB**（已完整包含全部配额池的 5h / 每周剩余比例、重置时间与 `disabled` 标志）
  - `GetUserStatus`：**~72 KB**（套餐名实际在 `userStatus.planStatus.planInfo.planName`，而非顶层 `tierName`）
  - `GetAvailableModels`：**~330 KB**（41 个模型的静态 `maxTokens`）
- **优化策略**：每 12 秒配额轮询只打 `RetrieveUserQuotaSummary`（1.9 KB）；`GetUserStatus` 与 `GetAvailableModels` 独立为 **1 小时静态缓存**（带并发去重锁），流量下降 99.5%。

### 6.3 单端口与 SSE 连接瘦身
- 放弃原生 Aux Pane 重复注册（`has_web_ui: false`），统一为输入框圆环 + 自绘右侧抽屉单入口。
- 主窗口圆环只连轻量流 `/api/events?conv=auto&view=compact`（单帧 `~1.5 KB`，不扫 7 日历史目录、不传 20 步明细与会话列表）。
- 右侧抽屉展开时 iframe 才连全量 SSE；抽屉关闭时父窗口通过 `postMessage({ type: 'gemini-pulse:active', active: false })` 通知 iframe 立刻 `es.close()`，空闲时全客户端仅维持 1 条轻量流。
