# VS Code Markdown Preview (Chrome)

Chrome 扩展：把 VS Code 的 **Open as Preview** 渲染逻辑提取为浏览器预览——本地 `file://` 与远程 `.md` 源文件均可一键切换 **Preview / Source**。

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
| 扩展图标 → **打开本地 Markdown…** | 选择本地 `.md` 文件，在预览工作台中渲染 |
| 预览工作台 | 拖放文件、切换 Preview/Source、再打开其他文件 |
| 打开 `*.md` / `*.markdown` / `*.mdx`（含 `file://`） | 自动进入 VS Code 风格预览 |
| GitHub raw / gist raw | 自动预览 |
| 工具栏 **Preview / Source** | 切换渲染与原文 |
| 扩展图标 → 切换当前页预览 | 对当前标签页强制切换预览 |
| 选项页 | breaks / linkify / 数学 / Mermaid / 主题 |

> **相对路径图片**：用「打开本地文件」时浏览器无法解析磁盘相对路径，图片可能失效。需要完整资源路径时，请直接用 Chrome 打开 `file://…/xxx.md`（并开启 **允许访问文件网址**）。

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
