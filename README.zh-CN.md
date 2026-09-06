# VS Code Markdown Preview (Chrome)

<p align="center">
  <img src="public/icons/logo-512.png" width="128" height="128" alt="VS Code Markdown Preview logo" />
</p>

<p align="center">
  <b>把 VS Code 的 Open as Preview 体验完整带入 Chrome 浏览器</b>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

<p align="center">
  支持本地文件夹工作区、SSH 远程服务器、WSL 发行版与单文件预览，提供代码块一键复制、浮动大纲、多媒体/PDF 智能预览、SVG 火焰图对比与无缝 <b>Preview ↔ Source</b> 模式切换。
</p>

---

## 亮点特性

- **高度对齐 VS Code 内置渲染栈**
  - 解析引擎：`markdown-it` + `highlight.js`（对标 VS Code `markdown-language-features`）。
  - 官方样式：采用 VS Code 原生 `markdown.css`、`highlight.css` 与自适应变量主题（深色 / 浅色跟随系统或手动指定）。
  - 数学公式：`KaTeX` 支持行内 `$...$` 与多行块级 `$$...$$` 公式（对标 `@vscode/markdown-it-katex`）。
  - 图表渲染：`Mermaid` 流程图与架构图渲染，支持 VS Code 派生主题变量配色及 PNG/JPEG 导出。

- **三位一体的多源工作区（Workspace）**
  - **本地工作区**：基于浏览器的 File System Access API 打开目录，左侧树状展示所有 Markdown 与 SVG 文件，支持持久化 Handle 自动恢复历史会话。
  - **SSH 远程工作区**：通过本机轻量 Bridge（监听 `127.0.0.1`）连接 Linux 服务器，远程执行 GNU `find` 极速批量扫描，支持读取 `~/.ssh/config` 配置、记住密码与静默免密重连。
  - **WSL 工作区**：自动识别 `file://wsl.localhost/` 路径，或经本机 Bridge 调用 `wsl.exe` 读取 Windows WSL 发行版文件。

- **智能相对资源解析与多媒体 / PDF 预览**
  - 文档内相对 `.md` 链接点击后平滑在工作台中切换；
  - 相对路径的本地 `.pdf` 文档以 Blob URL 在新标签页原生预览；
  - 图片（`.png`, `.jpg`, `.svg` 等）与音视频（`.mp4`, `.mp3` 等）自动匹配正确 MIME 类型在新标签页展示；
  - 压缩包（`.zip`, `.tar.gz` 等）二进制资产自动触发下载；
  - 外部 `http(s)://` 超链接自动在新标签页打开，保护当前工作台会话不被冲掉。

- **现代化效率工作台（Workbench）**
  - **快捷操作仪表盘**：提供直观的快速启动卡片，最近工作区与文件历史面板支持关键词即时过滤（快捷键 `/`）、类型标签筛选、分页以及一键清空全部。
  - **阅读进度记忆**：自动按文件独立记录滚动阅读进度，切换文件或刷新时平滑还原。
  - **代码块一键复制**：GitHub 风格的代码块复制按钮，具备操作状态反馈与选区溢出优化。
  - **路径一键复制**：工作台顶部提供相对路径与绝对路径快捷复制按钮。
  - **目录树操作优化**：文件树工具栏支持一键「收起全部」与展开；侧边栏支持折叠/展开与拖拽调节宽度（双击复位）。
  - **大纲悬浮窗（TOC）**：紧凑的大纲视图，支持自由拖动标题栏，支持 **Pin 钉住固定**，方便长文档跳转。
  - **源码与缩放控制**：一键切换预览与源码视图（源码视图带行号）；支持 50% ~ 250% 页面内容缩放。

- **交互式 SVG 火焰图与双栏并排比对**
  - SVG 文件安全沙箱渲染，完整保留脚本交互、悬浮与点击缩放（特别适用于性能火焰图）；
  - 类 Beyond Compare 的 **SVG 左右比对**模式：文件树右键「选为左侧/右侧」或「与左侧比较」，在同屏左右并排显示，支持各自独立交互。

- **页面内自动唤起（Content Script）**
  - 打开本地 `file://` 的 Markdown 文件或 GitHub / Gist raw 页面时，防闪烁自动唤起预览；
  - 严格作用域控制，不劫持普通网页浏览。

---

## 安装（开发者模式）

1. **克隆仓库并编译构建**：
   ```bash
   npm install
   npm run build
   ```

2. **在 Chrome 中加载扩展**：
   1. 浏览器打开 `chrome://extensions`；
   2. 右上角开启 **开发者模式 (Developer mode)**；
   3. 点击 **加载已解压的扩展程序 (Load unpacked)**，选择本项目的 `dist/` 目录；
   4. **关键步骤（本地文件预览必备）**：进入该扩展的「详情」页面，开启 **“允许访问文件网址 (Allow access to file URLs)”**。

---

## 快速使用

| 入口 / 场景 | 操作与行为 |
|-------------|------------|
| **扩展弹窗 → Markdown 工作台** | 打开工作台仪表盘，查看最近工作区/最近文件、搜索历史记录或发起新建连接 |
| **扩展弹窗 → 打开工作区文件夹…** | 选择本地目录，左侧展示树状文件列表，右侧沉浸式预览，支持刷新与换夹 |
| **扩展弹窗 → 打开 SSH 工作区…** | 连接远程 Linux 服务器目录，浏览并预览远程 Markdown 文档 |
| **扩展弹窗 → 打开 WSL 工作区…** | 通过 WSL 发行版与路径选择或直接粘贴 WSL 路径打开工作区 |
| **扩展弹窗 → 打开本地 Markdown…** | 选择本地单文件预览（支持通过顶部工具栏换夹或打开其他文件） |
| **直接访问 `file://wsl.localhost/…`** | Chrome 打开 WSL 路径下的 `.md` 文件时自动识别并预览 |
| **直接打开本地 `file://` 或 GitHub Raw** | 页面内直接渲染为 VS Code 预览样式，左上角悬浮工具栏可随时切换源码 |
| **扩展弹窗 → 切换当前页预览** | 对当前标签页强制开启/关闭 Markdown 预览 |
| **选项与偏好设置** | 点击工作台齿轮图标或扩展弹窗「选项」，配置主题、布局宽度、GFM 选项与扩展组件 |

---

## 本机 Bridge（SSH / WSL 远程工作区）

由于 Chrome 扩展运行在浏览器沙箱中，**无法直接建立原生 SSH TCP 连接，也无法在扩展内部执行 `wsl.exe`**。本项目提供了安全的轻量级本机桥接服务（默认仅监听 `127.0.0.1:17823`）：

### 1. 启动桥接服务

```bash
# 首次使用时安装桥接依赖
npm run ssh-bridge:install

# 启动桥接服务（终端将输出生成的 Bridge Token）
npm run ssh-bridge
```

### 2. 配置与连接

1. 打开扩展 **选项 → 本机 Bridge**（或在工作台右上角点击 Bridge 状态按钮）；
2. 填入 Bridge 地址（默认 `http://127.0.0.1:17823`）与终端输出的鉴权 Token；
3. 打开弹窗即可畅享 SSH / WSL 工作区。

### 3. SSH 工作区特性

- **认证方式**：
  - **密码认证**：支持勾选「记住密码（保存在本地）」，保存在 `chrome.storage.local` 中；
  - **私钥文件**：支持选取本机私钥文件及口令连接；
  - **本机 OpenSSH 配置**：直接从本机 `~/.ssh/config`（支持 `Include` 指令）解析 `Host` 别名列表，用户名、端口和 `IdentityFile` 由 Bridge 在本机执行 `ssh -G` 解析，私钥内容绝不发送给浏览器，支持 SSH Agent。
- **连接优化**：
  - **历史静默重连**：从历史记录打开 SSH 工作区时自动在后台静默重连，遇到密码变更等异常优雅弹出连接面板；
  - **Bridge 会话复用**：同一服务器不同子目录切换复用已建立的 SSH 会话，无需二次握手。
- **远程环境要求**：
  - 目录索引基于高效的 GNU `find … -print0 | head -z` 批量流式传输。**目标机须为 Linux 或兼容 POSIX 环境**；**不支持以 Windows 作为 SSH 远程目标**。
  - 本机 Bridge 服务本身可运行在 macOS、Linux 或 Windows 环境上。

### 4. SSH 诊断工具

如果连接远程 SSH 工作区遇到配置或检索问题，可使用内置的诊断脚本排查：

```bash
# 测试 OpenSSH 别名解析与远程 GNU find 遍历
npm run diagnose:ssh -- <ssh-alias-or-host> <remote-root-path>

# 示例：诊断 my-server 别名下的 /var/docs 目录
npm run diagnose:ssh -- my-server /var/docs

# 连带测试 Bridge HTTP API (/connect + /list + /read)
DIAG_BRIDGE_API=1 npm run diagnose:ssh -- my-server /var/docs
```

### 5. WSL 路径支持形式

在 Windows 下通过 Bridge 调用 `wsl.exe`，支持以下格式的 WSL 路径自动识别与转换：
- `\\wsl$\Ubuntu\home\user\repo`
- `\\wsl.localhost\Ubuntu\home\user\repo`
- `file://wsl.localhost/Ubuntu/home/user/repo/a.md`
- `wsl://Ubuntu/home/user/repo`
- `vscode-remote://wsl+Ubuntu/home/user/repo`

> **安全承诺**：所有凭证与文件数据流仅在 `127.0.0.1` 本机回环地址通信，绝不经过第三方服务器。

---

## 偏好设置

在选项页或工作台内嵌设置中，可自由调整以下偏好：

- **常规设置**：
  - 自动预览：本地 `file://` 与 GitHub/Gist raw 页面自动唤起；
  - 界面主题：跟随系统 (Auto) / 浅色 (Light) / 深色 (Dark)；
  - 预览区域宽度：舒适 (`~980px`) / 宽屏 (`~1280px`，推荐) / 超宽 (`~1600px` / `96vw`) / 铺满内容区 (`Full`)。
- **Markdown 渲染**：
  - GFM 换行：将软换行转为硬换行（`Breaks → <br>`）；
  - 自动超链接：纯文本 URL 自动识别为可点击链接；
  - 排版增强：开启引号与破折号等智能转换；
  - HTML 标签渲染：支持 Markdown 中的原始 HTML 标签（如 `<details>`、`<kbd>`、HTML 表格、内联样式等），内置 DOMPurify 净化保护过滤脚本与注入风险；
- **扩展组件**：
  - KaTeX：数学公式渲染开关；
  - Mermaid：图表渲染开关；
  - Mermaid 配色主题：VS Code 变量自适应（推荐）、Default、Dark、Forest、Neutral、Base。
- **本机 Bridge**：
  - 服务地址、Token 配置与实时连通性探测。

---

## 开发与测试

```bash
# 实时增量构建（watch 模式）
npm run dev

# 生产环境打包构建输出到 dist/
npm run build

# TypeScript 类型检查
npm run typecheck

# 运行完整单元测试套件（105+ 自动化测试）
npm test

# 运行 Playwright 端到端集成测试（验证链接、媒体预览与下载）
npm run test:e2e

# 运行渲染冒烟测试
npm run smoke

# 重新生成扩展各尺寸 PNG 图标
npm run icons
```

---

## VS Code 源码对齐映射

本项目核心排版逻辑与样式规则严谨派生自 [VS Code](https://github.com/microsoft/vscode) 官方仓库：

| 本仓库对应模块 | VS Code 上游相对路径 |
|----------------|----------------------|
| `src/preview/engine.ts` | `extensions/markdown-language-features/src/markdownEngine.ts` |
| `src/preview/slugify.ts` | `extensions/markdown-language-features/src/slugify.ts` |
| `src/preview/plugins/sourceMap.ts` | `extensions/markdown-language-features/src/markdownEngine.ts` (`pluginSourceMap`) |
| `src/preview/plugins/mermaidFence.ts` | `extensions/mermaid-markdown-features/src/markdownMermaid/markdownIt.ts` |
| `src/preview/plugins/katex.ts` | `extensions/markdown-math/src/extension.ts` |
| `src/preview/styles/markdown.css` | `extensions/markdown-language-features/media/markdown.css` |
| `src/preview/styles/highlight.css` | `extensions/markdown-language-features/media/highlight.css` |

---

## 许可说明

本项目采用 [MIT 许可证](LICENSE)。部分渲染样式与扩展逻辑派生自 [VS Code](https://github.com/microsoft/vscode)（Copyright © Microsoft Corporation，MIT 许可）。第三方组件声明详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
