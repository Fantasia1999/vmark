# VS Code Markdown Preview (Chrome)

Chrome 扩展：把 VS Code 的 **Open as Preview** 渲染逻辑提取为浏览器预览——本地 `file://` 与远程 `.md` 源文件均可一键切换 **Preview / Source**。

渲染栈对齐 VS Code 内置扩展：

- `markdown-it` + highlight.js（`markdown-language-features`）
- `markdown.css` / `highlight.css`（VS Code 预览样式）
- KaTeX（`markdown-math` / `@vscode/markdown-it-katex`）
- Mermaid fence（`mermaid-markdown-features`）

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
| 打开 `*.md` / `*.markdown` / `*.mdx` | 自动进入 VS Code 风格预览 |
| GitHub raw / gist raw | 自动预览 |
| 工具栏 **Preview / Source** | 切换渲染与原文 |
| 扩展图标 / 右键菜单 | 强制切换预览 |
| 选项页 | breaks / linkify / 数学 / Mermaid / 主题 |

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
