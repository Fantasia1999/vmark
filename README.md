# VS Code Markdown Preview (Chrome)

<p align="center">
  <img src="public/icons/logo-512.png" width="128" height="128" alt="VS Code Markdown Preview logo" />
</p>

Chrome 扩展：把 VS Code 的 **Open as Preview** 渲染逻辑提取为浏览器预览——本地 `file://` 与远程 `.md` 源文件均可一键切换 **Preview / Source**。

图标资源：`public/icons/`（`logo.svg` 源文件，`icon16/48/128.png` 用于扩展；`npm run icons` 可重生）。

渲染栈对齐 VS Code 内置扩展：

- `markdown-it` + highlight.js（`markdown-language-features`）
- `markdown.css` / `highlight.css`（VS Code 预览样式）
- KaTeX（`markdown-math` / `@vscode/markdown-it-katex`）
- Mermaid fence + **VS Code 派生主题**（`mermaid-markdown-features`：`theme: base` + CSS `themeVariables`）

## 安装（开发版）

```bash
npm install
npm run build
```

1. 打开 `chrome://extensions`
2. 开启 **Developer mode**
3. **Load unpacked** → 选择本仓库的 `dist/` 目录
4. 预览本地文件时：进入扩展详情，打开 **Allow access to file URLs**

## 使用

| 场景 | 行为 |
|------|------|
| 扩展图标 → **打开工作区文件夹…** | 选择目录，左侧文件树 + 预览（类似 VS Code 工作区） |
| 扩展图标 → **打开 SSH 工作区…** | 经本机 Bridge 连接远程 SSH 目录并预览 |
| 扩展图标 → **打开 WSL 工作区…** | 经本机 Bridge + `wsl.exe` 预览发行版内 Markdown |
| 直接打开 `file://wsl.localhost/…` | 自动识别 WSL 路径并预览（需允许访问文件网址） |
| 扩展图标 → **打开本地 Markdown…** | 选择单个 `.md` 文件预览 |
| 预览工作台 | 换夹 / 刷新 / 拖放文件、Preview ↔ Source |
| 工作区内相对图片与 `.md` 链接 | 通过 File System Access API 解析 |
| **大纲**（目录） | 紧凑悬浮窗（工具栏「大纲」）；可 **Pin 固定**、拖动标题栏；不占版面 |
| 打开本地 `file://` 的 Markdown / GitHub·Gist **raw** | 页面内自动预览（普通网页、GitHub blob 等**不**劫持） |
| 工作区 / 单文件 **SVG**（火焰图等） | sandbox 渲染，保留脚本点击缩放；`file://` 的 `.svg` 不劫持 |
| SVG **左右比较** | 文件树右键「选为左侧/右侧」或「与左侧比较」（类 Beyond Compare），同页并排显示，不做内容 diff |
| 扩展图标 → 切换当前页预览 | 对当前标签页强制切换 |
| 选项页 | breaks / linkify / 数学 / Mermaid / 主题 |

工作区句柄会保存在浏览器 IndexedDB 中，重新打开工作台时可恢复（可能需要再次授权读取）。

## SSH / WSL 工作区

浏览器扩展**不能直接建立 SSH，也不能在扩展进程里调用 `wsl.exe`**。本项目提供本机桥接（仅监听 `127.0.0.1`）：

```bash
npm run ssh-bridge:install   # 首次
npm run ssh-bridge           # 启动，终端会打印 Token
```

1. 把 Token 填到扩展 **选项 → Local Bridge**
2. 弹窗选择 **打开 SSH 工作区…** 或 **打开 WSL 工作区…**

| 能力 | 说明 |
|------|------|
| SSH | 桥接用 [ssh2](https://github.com/mscdex/ssh2) SFTP |
| OpenSSH 配置认证 | 从 `~/.ssh/config` 的 `Host` 列表选择别名（支持常见 `Include dir/*`），Bridge 通过 `ssh -G` 解析主机、用户、端口和 `IdentityFile`；私钥内容不发送到浏览器 |
| WSL | 桥接在 **Windows** 上调用 `wsl.exe` 列目录/读文件 |
| `file://wsl.localhost/Distro/...` | Chrome 直接打开 WSL 文件时自动预览 |

### 支持的 WSL 路径形式

- `\\wsl$\Ubuntu\home\user\a.md`
- `\\wsl.localhost\Ubuntu\home\user\a.md`
- `file://wsl.localhost/Ubuntu/home/user/a.md`
- `wsl://Ubuntu/home/user/a.md`
- `vscode-remote://wsl+Ubuntu/home/user/a.md`（粘贴到 WSL 对话框可解析）

凭证与 WSL 访问只经过本机 Bridge，不会上传到第三方。

## 开发

```bash
npm run dev      # esbuild watch → dist/
npm run typecheck
```

## 源码映射（VS Code）

| 本仓库 | VS Code 上游 |
|--------|----------------|
| `src/preview/engine.ts` | `extensions/markdown-language-features/src/markdownEngine.ts` |
| `src/preview/slugify.ts` | `.../src/slugify.ts` |
| `src/preview/plugins/sourceMap.ts` | `pluginSourceMap` in markdownEngine |
| `src/preview/plugins/mermaidFence.ts` | `extensions/mermaid-markdown-features/src/markdownMermaid/markdownIt.ts` |
| `src/preview/plugins/katex.ts` | `extensions/markdown-math/src/extension.ts` |
| `src/preview/styles/markdown.css` | `.../media/markdown.css` |
| `src/preview/styles/highlight.css` | `.../media/highlight.css` |

上游路径（本机）：`/home/wcl/workspace/sourceCode/vscode`。

## 许可

MIT。样式与逻辑派生自 [VS Code](https://github.com/microsoft/vscode)（MIT）。见 `THIRD_PARTY_NOTICES.md`。
