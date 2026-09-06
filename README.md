# VS Code Markdown Preview (Chrome)

<p align="center">
  <img src="public/icons/logo-512.png" width="128" height="128" alt="VS Code Markdown Preview logo" />
</p>

<p align="center">
  <b>Brings the complete VS Code "Open as Preview" experience into Google Chrome</b>
</p>

<p align="center">
  English | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  Full-featured Markdown workbench supporting local folder workspaces, remote SSH servers, WSL distributions, and standalone files. Features one-click code block copying, floating outline (TOC), smart multimedia and PDF preview, interactive SVG flame graphs with side-by-side comparison, and seamless <b>Preview ↔ Source</b> mode switching.
</p>

---

## Key Features

- **Pixel-Perfect Alignment with VS Code's Rendering Stack**
  - **Core Engine**: `markdown-it` + `highlight.js` (matching VS Code's `markdown-language-features`).
  - **Official Styles**: Built-in VS Code `markdown.css`, `highlight.css`, and adaptive CSS variable themes (automatic light/dark system matching or manual selection).
  - **Math Expressions**: Full `KaTeX` support for inline `$...$` and multiline block `$$...$$` syntax (matching `@vscode/markdown-it-katex`).
  - **Diagrams**: `Mermaid` architecture diagrams and flowcharts, styled with VS Code-derived theme variables, with one-click export to PNG/JPEG or clipboard.

- **Multi-Source Workspaces**
  - **Local Workspaces**: Open any local directory via the browser's File System Access API. Displays a recursive file tree of all Markdown and SVG files with persistent handle storage for instant session recovery.
  - **Remote SSH Workspaces**: Connect to Linux servers via a lightweight local bridge (listening on `127.0.0.1`). Utilizes high-performance remote GNU `find` bulk scanning, native `~/.ssh/config` Host alias parsing, password remembering, and silent reconnects.
  - **WSL Workspaces**: Automatically detects `file://wsl.localhost/` paths or connects via local bridge using `wsl.exe` to browse any WSL distribution.

- **Smart Relative Resource Resolution & Media / PDF Preview**
  - Relative `.md` links switch smoothly within the workbench.
  - Relative `.pdf` documents open in a new tab with Chrome's native PDF viewer via Blob URLs (`application/pdf`).
  - Images (`.png`, `.jpg`, `.svg`, etc.) and media files (`.mp4`, `.mp3`, etc.) open in new tabs with exact MIME types.
  - Binary archives (`.zip`, `.tar.gz`, etc.) automatically trigger browser downloads.
  - External `http(s)://` links safely open in new tabs (`target="_blank"`, `rel="noopener noreferrer"`) to prevent overriding your active workbench session.

- **Modern Productivity Workbench**
  - **Quick Action Dashboard**: Clean start cards for rapid navigation. The unified history panel supports instant fuzzy search (press `/` shortcut), category filters (All / Local / WSL / SSH), pagination, and clear-all actions.
  - **Reading Position Memory**: Remembers scroll positions per file and restores them smoothly upon reopening or refreshing.
  - **Fenced Code Block Copying**: GitHub-style copy buttons on code blocks with visual feedback and selection bounds handling.
  - **One-Click Path Copy**: Workbench header provides dedicated buttons to copy relative and absolute paths to clipboard.
  - **File Tree Controls**: Tree toolbar includes a quick "Collapse All" toggle; the workbench sidebar supports collapsible rail mode and drag-to-resize width (double-click to reset).
  - **Floating Document Outline (TOC)**: Compact heading tree that can be freely dragged and **Pinned** in place for easy long-document navigation.
  - **Source View & Zoom Controls**: Instant toggle between rendered preview and source view (with line numbers); zoom content from 50% to 250%.

- **Interactive SVG Flame Graphs & Dual-Pane Comparison**
  - Secure sandboxed rendering for SVG files, retaining embedded scripts, hover tooltips, and click-to-zoom (ideal for performance profiling and flame graphs).
  - **Side-by-Side SVG Comparison** (Beyond Compare style): Right-click tree items to "Select as Left / Right" or "Compare with Left" to inspect two SVGs concurrently.

- **In-Page Auto-Preview (Content Script)**
  - Automatically activates preview on local `file://` Markdown files and GitHub/Gist raw pages with anti-FOUC prehide guards.
  - Strictly scoped to prevent hijacking normal web browsing or general SVG files.

---

## Installation (Developer Mode)

1. **Clone and build**:
   ```bash
   npm install
   npm run build
   ```

2. **Load into Google Chrome**:
   1. Open `chrome://extensions` in your browser;
   2. Toggle on **Developer mode** in the top-right corner;
   3. Click **Load unpacked** and select the `dist/` directory of this repository;
   4. **Crucial Step (Required for local files)**: Click **Details** on the extension card and enable **"Allow access to file URLs"**.

---

## Quick Usage

| Entry / Scenario | Behavior |
|------------------|----------|
| **Extension Popup → Markdown Workbench** | Opens the workbench dashboard to view recent workspaces/files, search history, or start a new connection |
| **Extension Popup → Open Workspace Folder…** | Select a local folder; displays the tree on the left and preview on the right |
| **Extension Popup → Open SSH Workspace…** | Connect to a remote Linux directory via local bridge and preview Markdown files |
| **Extension Popup → Open WSL Workspace…** | Select a WSL distro and path, or paste a WSL path directly |
| **Extension Popup → Open Local Markdown…** | Select an individual `.md` file to preview (with options to switch folders or open external files) |
| **Direct URL `file://wsl.localhost/…`** | Automatically detects and renders Markdown files located on WSL shares |
| **Direct local `file://` or GitHub Raw** | Renders in-page with VS Code styling; floating toolbar in top-left allows toggling source |
| **Extension Popup → Toggle Preview** | Forces preview mode on/off for the active browser tab |
| **Options & Settings** | Click the gear icon in the workbench or "Options" in the popup to configure themes, layout width, and rendering options |

---

## Local Bridge (SSH & WSL Remote Workspaces)

Because Chrome extensions run inside a secure browser sandbox, **they cannot open raw TCP SSH sockets directly, nor can they invoke `wsl.exe` from extension processes**. This repository provides a secure, lightweight local bridge server (listening strictly on `127.0.0.1:17823`):

### 1. Start the Bridge Service

```bash
# Install bridge dependencies (first-time setup)
npm run ssh-bridge:install

# Start the bridge server (prints the authentication Token in your terminal)
npm run ssh-bridge
```

### 2. Configure Extension Settings

1. In the extension **Options → Local Bridge** (or click the Bridge status indicator in the workbench header);
2. Enter the Bridge address (default `http://127.0.0.1:17823`) and the generated Token;
3. Open SSH or WSL workspaces directly from the popup or workbench dashboard.

### 3. SSH Workspace Capabilities

- **Authentication Options**:
  - **Password**: Supports optional "Remember password (saved locally)" stored securely in `chrome.storage.local`.
  - **Private Key**: Select a local private key file and enter an optional passphrase.
  - **Native OpenSSH Config**: Automatically reads Host aliases from `~/.ssh/config` (including `Include` directives). The Bridge parses hostname, user, port, and `IdentityFile` via `ssh -G` on the host machine. Private keys are never transmitted to the browser, and SSH Agent is fully supported.
- **Connection Optimizations**:
  - **Silent Reconnect**: Reopening an SSH workspace from history connects silently in the background, gracefully prompting only if credentials expire.
  - **Session Reuse**: Switching between directories on the same server reuses the active SSH session without secondary handshakes.
- **Remote Target Requirements**:
  - Workspace directory listing uses streaming GNU `find … -print0 | head -z`. **Target machines must be Linux or a POSIX-compliant environment with GNU find**; **Windows SSH servers are not supported**.
  - The local Bridge server itself can run on macOS, Linux, or Windows.

### 4. SSH Diagnostics Tool

If you run into connection or listing issues on a remote host, run the built-in diagnostic script:

```bash
# Diagnose OpenSSH alias resolution and remote GNU find listing
npm run diagnose:ssh -- <ssh-alias-or-host> <remote-root-path>

# Example: Diagnose Host alias 'my-server' at /var/docs
npm run diagnose:ssh -- my-server /var/docs

# Include live Bridge HTTP API tests (/connect + /list + /read)
DIAG_BRIDGE_API=1 npm run diagnose:ssh -- my-server /var/docs
```

### 5. Supported WSL Path Formats

When running the Bridge on Windows, `wsl.exe` handles the following path formats automatically:
- `\\wsl$\Ubuntu\home\user\repo`
- `\\wsl.localhost\Ubuntu\home\user\repo`
- `file://wsl.localhost/Ubuntu/home/user/repo/a.md`
- `wsl://Ubuntu/home/user/repo`
- `vscode-remote://wsl+Ubuntu/home/user/repo`

> **Security Note**: All credentials and file content remain strictly on the `127.0.0.1` local loopback and are never sent to external servers.

---

## Preferences & Settings

Customizable via the Options page or the in-workbench settings modal:

- **General Settings**:
  - **Auto-preview**: Automatically renders local `file://` and GitHub/Gist raw markdown;
  - **Color Theme**: Follow system (Auto) / Light / Dark;
  - **Preview Width**: Comfortable (`~980px`) / Wide (`~1280px`, recommended default) / Fluid (`~1600px` / `96vw`) / Full width (`Full`).
- **Markdown Rendering**:
  - **GFM Line Breaks**: Converts soft line breaks into hard `<br>` breaks;
  - **Linkify**: Automatically converts plain text URLs into clickable links;
  - **Typographer**: Enables smart quotes, dashes, and typography enhancements;
  - **HTML Sanitization**: Disables raw HTML in markdown by default for sandbox security.
- **Extensions**:
  - **KaTeX**: Toggle LaTeX math formula rendering;
  - **Mermaid**: Toggle diagram and flowchart rendering;
  - **Mermaid Theme**: VS Code adaptive theme (recommended), Default, Dark, Forest, Neutral, Base.
- **Local Bridge**:
  - Service URL, Token configuration, and real-time connectivity status.

---

## Development & Testing

```bash
# Incremental build with watch mode
npm run dev

# Production build output to dist/
npm run build

# TypeScript static type check
npm run typecheck

# Run complete unit test suite (105+ automated tests)
npm test

# Run Playwright end-to-end integration tests (links, media, downloads)
npm run test:e2e

# Run smoke rendering test
npm run smoke

# Regenerate extension PNG icons from SVG source
npm run icons
```

---

## VS Code Upstream Alignment

The rendering engine, styling, and plugins in this project are derived directly from the official [VS Code](https://github.com/microsoft/vscode) repository:

| This Repository | VS Code Upstream Path |
|-----------------|-----------------------|
| `src/preview/engine.ts` | `extensions/markdown-language-features/src/markdownEngine.ts` |
| `src/preview/slugify.ts` | `extensions/markdown-language-features/src/slugify.ts` |
| `src/preview/plugins/sourceMap.ts` | `extensions/markdown-language-features/src/markdownEngine.ts` (`pluginSourceMap`) |
| `src/preview/plugins/mermaidFence.ts` | `extensions/mermaid-markdown-features/src/markdownMermaid/markdownIt.ts` |
| `src/preview/plugins/katex.ts` | `extensions/markdown-math/src/extension.ts` |
| `src/preview/styles/markdown.css` | `extensions/markdown-language-features/media/markdown.css` |
| `src/preview/styles/highlight.css` | `extensions/markdown-language-features/media/highlight.css` |

---

## License

MIT License. Styles and portions of the preview logic are derived from [VS Code](https://github.com/microsoft/vscode) (Copyright © Microsoft Corporation, MIT License). See `THIRD_PARTY_NOTICES.md` for full third-party notices.
