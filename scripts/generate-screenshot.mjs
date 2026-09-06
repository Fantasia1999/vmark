/**
 * Automated Screenshot Generator for VMark (Playwright).
 * Generates:
 * --- Workbench Dashboard ---
 * 1. assets/screenshot-dashboard.png (Clean dashboard UI)
 * 2. assets/screenshot-dashboard-annotated.png & assets/screenshot-dashboard-annotated.en.png (English)
 * 3. assets/screenshot-dashboard-annotated.zh-CN.png (Simplified Chinese)
 * --- Document Preview Workbench ---
 * 4. assets/screenshot.png (Clean preview workbench)
 * 5. assets/screenshot-annotated.png & assets/screenshot-annotated.en.png (English)
 * 6. assets/screenshot-annotated.zh-CN.png (Simplified Chinese)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extensionPath = join(root, 'dist');
const showcaseEnPath = join(root, 'fixtures/showcase.md');
const showcaseCnPath = join(root, 'fixtures/showcase.zh-CN.md');
const assetsDir = join(root, 'assets');

mkdirSync(assetsDir, { recursive: true });

const tempUserData = mkdtempSync(join(tmpdir(), 'vmark-screenshot-'));

const WORKBENCH_CALLOUTS = {
  en: [
    {
      badge: '1',
      title: 'Multi-Source Workspace',
      desc: 'Browse local folders, SSH remote hosts & WSL distro trees with collapsible rail and quick actions',
      target: { x: 10, y: 10, w: 260, h: 355 },
      card: { x: 14, y: 375, w: 252 },
      anchor: { x: 140, y: 365 },
      cardAnchor: { x: 140, y: 375 },
    },
    {
      badge: '2',
      title: 'One-Click Path Copy',
      desc: 'Real-time breadcrumb bar with instant relative & absolute path copy to clipboard',
      target: { x: 292, y: 5, w: 216, h: 28 },
      card: { x: 294, y: 44, w: 280 },
      anchor: { x: 400, y: 33 },
      cardAnchor: { x: 400, y: 44 },
    },
    {
      badge: '3',
      title: 'Workbench View Controls',
      desc: 'Preview ↔ Source toggle, 50%–250% zoom, TOC outline, settings & bridge status',
      target: { x: 1085, y: 5, w: 335, h: 28 },
      card: { x: 790, y: 44, w: 280 },
      anchor: { x: 1100, y: 19 },
      cardAnchor: { x: 1070, y: 58 },
    },
    {
      badge: '4',
      title: 'Floating Outline (TOC)',
      desc: 'Draggable & pinnable table of contents with live heading scroll spy tracking',
      target: { x: 1186, y: 50, w: 232, h: 130 },
      card: { x: 1170, y: 195, w: 248 },
      anchor: { x: 1294, y: 180 },
      cardAnchor: { x: 1294, y: 195 },
    },
    {
      badge: '5',
      title: 'Syntax Highlighting & Copy',
      desc: 'Official VS Code styling & highlight.js syntax highlighting with one-click copy button',
      target: { x: 350, y: 325, w: 700, h: 160 },
      card: { x: 1070, y: 345, w: 280 },
      anchor: { x: 1050, y: 380 },
      cardAnchor: { x: 1070, y: 380 },
    },
    {
      badge: '6',
      title: 'KaTeX Math & Mermaid.js',
      desc: 'Native LaTeX typesetting ($/$$) and theme-adaptive interactive architecture flowcharts',
      target: { x: 350, y: 575, w: 700, h: 260 },
      card: { x: 1070, y: 640, w: 280 },
      anchor: { x: 1050, y: 680 },
      cardAnchor: { x: 1070, y: 680 },
    },
  ],
  cn: [
    {
      badge: '1',
      title: '多源工作区文件树',
      desc: '支持本地目录、SSH 远程主机及 WSL 分发，支持侧边栏折叠与快捷操作',
      target: { x: 10, y: 10, w: 260, h: 355 },
      card: { x: 14, y: 375, w: 252 },
      anchor: { x: 140, y: 365 },
      cardAnchor: { x: 140, y: 375 },
    },
    {
      badge: '2',
      title: '一键路径复制',
      desc: '实时显示当前文件面包屑，支持一键快速复制相对路径与绝对路径',
      target: { x: 292, y: 5, w: 216, h: 28 },
      card: { x: 294, y: 44, w: 280 },
      anchor: { x: 400, y: 33 },
      cardAnchor: { x: 400, y: 44 },
    },
    {
      badge: '3',
      title: '工作台视图与缩放控制',
      desc: '预览与源码视图无缝切换，支持 50%–250% 自由缩放及大纲/设置',
      target: { x: 1085, y: 5, w: 335, h: 28 },
      card: { x: 790, y: 44, w: 280 },
      anchor: { x: 1100, y: 19 },
      cardAnchor: { x: 1070, y: 58 },
    },
    {
      badge: '4',
      title: '可固定大纲浮窗 (TOC)',
      desc: '支持任意拖拽与一键 Pin 固定，具备实时标题滚动监听与高亮同步',
      target: { x: 1186, y: 50, w: 232, h: 130 },
      card: { x: 1170, y: 195, w: 248 },
      anchor: { x: 1294, y: 180 },
      cardAnchor: { x: 1294, y: 195 },
    },
    {
      badge: '5',
      title: '代码语法高亮与快捷复制',
      desc: '官方 VS Code 代码样式与语法高亮，配备一键快速复制代码按钮',
      target: { x: 350, y: 325, w: 700, h: 160 },
      card: { x: 1070, y: 345, w: 280 },
      anchor: { x: 1050, y: 380 },
      cardAnchor: { x: 1070, y: 380 },
    },
    {
      badge: '6',
      title: 'KaTeX 数学公式与 Mermaid 图表',
      desc: '原生支持 LaTeX 数学排版及与主题色彩深度贴合的交互式架构流程图',
      target: { x: 350, y: 575, w: 700, h: 260 },
      card: { x: 1070, y: 640, w: 280 },
      anchor: { x: 1050, y: 680 },
      cardAnchor: { x: 1070, y: 680 },
    },
  ],
};

const DASHBOARD_CALLOUTS = {
  en: [
    {
      badge: '1',
      title: 'Quick Action Launch Cards',
      desc: 'Fast entries to open local directories, WSL distros, remote SSH servers, or standalone files',
      target: { x: 118, y: 154, w: 1204, h: 96 },
      card: { x: 120, y: 74, w: 300 },
      anchor: { x: 270, y: 154 },
      cardAnchor: { x: 270, y: 130 },
    },
    {
      badge: '2',
      title: 'Instant Fuzzy Search (/)',
      desc: 'Press / shortcut to filter workspaces and historical files across all categories',
      target: { x: 918, y: 18, w: 244, h: 38 },
      card: { x: 595, y: 74, w: 280 },
      anchor: { x: 920, y: 37 },
      cardAnchor: { x: 875, y: 74 },
    },
    {
      badge: '3',
      title: 'Local Bridge Status & Popover',
      desc: 'Real-time loopback connectivity indicator for remote Linux SSH & WSL distro access',
      target: { x: 1166, y: 18, w: 120, h: 38 },
      card: { x: 1020, y: 74, w: 280 },
      anchor: { x: 1226, y: 56 },
      cardAnchor: { x: 1226, y: 74 },
    },
    {
      badge: '4',
      title: 'Multi-Source Workspace History',
      desc: 'Categorized tabs (All / WSL / SSH / Local) with status tags and 1-click session restore',
      target: { x: 128, y: 262, w: 576, h: 220 },
      card: { x: 140, y: 540, w: 320 },
      anchor: { x: 300, y: 482 },
      cardAnchor: { x: 300, y: 540 },
    },
    {
      badge: '5',
      title: 'Recent Files & Quick Clear',
      desc: 'Direct access to recently opened Markdown documents and interactive SVG flame graphs',
      target: { x: 736, y: 262, w: 576, h: 260 },
      card: { x: 748, y: 570, w: 320 },
      anchor: { x: 900, y: 522 },
      cardAnchor: { x: 900, y: 570 },
    },
    {
      badge: '6',
      title: 'Full-Window Drag & Drop',
      desc: 'Drop any directory folder or .md / .svg file anywhere onto the workbench to open immediately',
      target: { x: 118, y: 846, w: 1204, h: 42 },
      card: { x: 960, y: 755, w: 340 },
      anchor: { x: 1130, y: 846 },
      cardAnchor: { x: 1130, y: 815 },
    },
  ],
  cn: [
    {
      badge: '1',
      title: '快捷启动卡片网格',
      desc: '快速入口，一键打开本地文件夹工作区、WSL 发行版、远程 Linux SSH 主机或单文件',
      target: { x: 118, y: 154, w: 1204, h: 96 },
      card: { x: 120, y: 74, w: 300 },
      anchor: { x: 270, y: 154 },
      cardAnchor: { x: 270, y: 130 },
    },
    {
      badge: '2',
      title: '即时模糊搜索 (/)',
      desc: '按 / 快捷键快速过滤历史工作区与文件，支持全键盘极速导航与检索',
      target: { x: 918, y: 18, w: 244, h: 38 },
      card: { x: 595, y: 74, w: 280 },
      anchor: { x: 920, y: 37 },
      cardAnchor: { x: 875, y: 74 },
    },
    {
      badge: '3',
      title: '本地 Bridge 状态探测',
      desc: '实时检测 127.0.0.1 桥接服务连接状态，点击查看端口与鉴权详情',
      target: { x: 1166, y: 18, w: 120, h: 38 },
      card: { x: 1020, y: 74, w: 280 },
      anchor: { x: 1226, y: 56 },
      cardAnchor: { x: 1226, y: 74 },
    },
    {
      badge: '4',
      title: '多源工作区历史面板',
      desc: '支持分类 Tab 筛选（全部/WSL/SSH/本地）、状态标识与一键会话自动恢复',
      target: { x: 128, y: 262, w: 576, h: 220 },
      card: { x: 140, y: 540, w: 320 },
      anchor: { x: 300, y: 482 },
      cardAnchor: { x: 300, y: 540 },
    },
    {
      badge: '5',
      title: '最近文件列表与清理',
      desc: '直达近期浏览的 Markdown 文档与 SVG 性能火焰图，支持快捷批量清空',
      target: { x: 736, y: 262, w: 576, h: 260 },
      card: { x: 748, y: 570, w: 320 },
      anchor: { x: 900, y: 522 },
      cardAnchor: { x: 900, y: 570 },
    },
    {
      badge: '6',
      title: '全窗口拖拽即开',
      desc: '可将任意文件夹或 .md / .svg 文件直接拖入窗口任意位置打开',
      target: { x: 118, y: 846, w: 1204, h: 42 },
      card: { x: 960, y: 755, w: 340 },
      anchor: { x: 1130, y: 846 },
      cardAnchor: { x: 1130, y: 815 },
    },
  ],
};

try {
  console.log('1. Launching Chrome for Testing with VMark extension...');
  const context = await chromium.launchPersistentContext(tempUserData, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--force-device-scale-factor=2',
      '--window-size=1440,900',
    ],
  });

  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 10000 });
  }
  const extensionId = background.url().split('/')[2];
  console.log(`✓ Extension loaded, ID: ${extensionId}`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const viewerUrl = `chrome-extension://${extensionId}/viewer/viewer.html`;
  await page.goto(viewerUrl);

  await page.waitForFunction(() => window.__testHooks?.ready === true, { timeout: 10000 });
  console.log('✓ Viewer workbench initialized');

  // Generic overlay injection function
  async function applyAnnotations(calloutList) {
    await page.evaluate((callouts) => {
      let overlay = document.getElementById('vmark-annotation-overlay');
      if (overlay) overlay.remove();

      overlay = document.createElement('div');
      overlay.id = 'vmark-annotation-overlay';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;

      let svgHtml = `
        <svg style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
          <defs>
            <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(15,23,42,0.3)" />
            </filter>
          </defs>
      `;

      let cardsHtml = '';

      for (const item of callouts) {
        if (item.target) {
          const t = item.target;
          cardsHtml += `
            <div style="
              position: absolute;
              left: ${t.x}px;
              top: ${t.y}px;
              width: ${t.w}px;
              height: ${t.h}px;
              border: 1.5px solid #2563eb;
              border-radius: 8px;
              background: rgba(37, 99, 235, 0.04);
              box-shadow: 0 0 14px rgba(37, 99, 235, 0.16), inset 0 0 6px rgba(37, 99, 235, 0.03);
              pointer-events: none;
            "></div>
          `;
        }

        if (item.anchor && item.cardAnchor) {
          const a = item.anchor;
          const c = item.cardAnchor;
          svgHtml += `
            <line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"
                  stroke="#2563eb" stroke-width="1.8" stroke-dasharray="3 3" />
            <circle cx="${a.x}" cy="${a.y}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" filter="url(#pinShadow)" />
          `;
        }

        const card = item.card;
        cardsHtml += `
          <div style="
            position: absolute;
            left: ${card.x}px;
            top: ${card.y}px;
            width: ${card.w}px;
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(59, 130, 246, 0.35);
            border-radius: 10px;
            padding: 9px 12px;
            box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(37, 99, 235, 0.12);
            display: flex;
            align-items: flex-start;
            gap: 10px;
            box-sizing: border-box;
          ">
            <div style="
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
              color: #ffffff;
              font-size: 11.5px;
              font-weight: 700;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
            ">${item.badge}</div>
            <div style="display: flex; flex-direction: column; gap: 2.5px;">
              <div style="color: #0f172a; font-size: 11.5px; font-weight: 700; letter-spacing: -0.01em;">
                ${item.title}
              </div>
              <div style="color: #475569; font-size: 10.5px; line-height: 1.35;">
                ${item.desc}
              </div>
            </div>
          </div>
        `;
      }

      svgHtml += '</svg>';
      overlay.innerHTML = svgHtml + cardsHtml;
      document.body.appendChild(overlay);
    }, calloutList);
  }

  // ==========================================
  // SECTION A: WORKBENCH DASHBOARD SCREENSHOTS
  // ==========================================
  console.log('\n--- Generating Workbench Dashboard Screenshots ---');

  const now = Date.now();
  await page.evaluate(async (now) => {
    const workspaces = [
      {
        id: 'ws_local_1',
        kind: 'workspace',
        source: 'local',
        title: 'vmark-docs',
        localName: 'vmark-docs',
        openedAt: now - 1000 * 60 * 12,
        lastFilePath: 'docs/architecture.md',
      },
      {
        id: 'ws_ssh_1',
        kind: 'workspace',
        source: 'ssh',
        title: 'prod-server:/var/www/docs',
        ssh: { host: 'prod-server', username: 'deploy', port: 22, root: '/var/www/docs' },
        openedAt: now - 1000 * 60 * 60 * 3,
        lastFilePath: 'DEPLOY.md',
      },
      {
        id: 'ws_wsl_1',
        kind: 'workspace',
        source: 'wsl',
        title: 'Ubuntu:~/projects/kernel-docs',
        wsl: { distro: 'Ubuntu', root: '~/projects/kernel-docs' },
        openedAt: now - 1000 * 60 * 60 * 24,
        lastFilePath: 'README.md',
      },
    ];

    const files = [
      {
        id: 'file_1',
        kind: 'file',
        source: 'local',
        title: 'architecture.md',
        path: 'docs/architecture.md',
        workspaceTitle: 'vmark-docs',
        openedAt: now - 1000 * 60 * 5,
      },
      {
        id: 'file_2',
        kind: 'file',
        source: 'local',
        title: 'flamegraph.svg',
        path: 'benchmarks/flamegraph.svg',
        workspaceTitle: 'vmark-docs',
        openedAt: now - 1000 * 60 * 45,
      },
      {
        id: 'file_3',
        kind: 'file',
        source: 'ssh',
        title: 'DEPLOY.md',
        path: '/var/www/docs/DEPLOY.md',
        workspaceTitle: 'prod-server:/var/www/docs',
        openedAt: now - 1000 * 60 * 60 * 3,
      },
      {
        id: 'file_4',
        kind: 'file',
        source: 'standalone',
        title: 'release-notes-v0.5.0.md',
        path: '/Users/dev/Downloads/release-notes-v0.5.0.md',
        openedAt: now - 1000 * 60 * 60 * 8,
      },
    ];

    await chrome.storage.local.set({
      historyWorkspaces: workspaces,
      historyFiles: files,
    });
    location.reload();
  }, now);

  await page.waitForFunction(() => window.__testHooks?.ready === true, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Helper to setup and localize dashboard
  async function setupDashboard(lang) {
    await page.evaluate((lang) => {
      document.documentElement.dataset.theme = 'light';
      document.body.classList.remove('vscode-dark');
      document.body.classList.add('vscode-light');
      document.body.style.boxSizing = 'border-box';
      document.body.style.border = '1px solid rgba(0, 0, 0, 0.12)';

      const statusEl = document.getElementById('wb-bridge-status');
      if (statusEl) {
        statusEl.className = 'wb-bridge-status online';
        const text = document.getElementById('wb-bridge-text');
        if (text) text.textContent = lang === 'en' ? 'Bridge Online' : 'Bridge 在线';
      }

      if (lang === 'en') {
        const title = document.querySelector('.wb-title');
        if (title) title.textContent = 'Markdown Workbench';
        const desc = document.querySelector('.wb-desc');
        if (desc) desc.textContent = 'VS Code-style Markdown & SVG workbench supporting local, WSL, and SSH workspaces';
        const searchInput = document.getElementById('wb-search-input');
        if (searchInput) searchInput.placeholder = 'Search workspaces or files (/) ...';
        const secTitle = document.querySelector('.wb-section-title');
        if (secTitle) secTitle.textContent = 'QUICK ACTIONS';

        const setCard = (id, t, d) => {
          const el = document.getElementById(id);
          if (!el) return;
          const titleEl = el.querySelector('.wb-card-title');
          const descEl = el.querySelector('.wb-card-desc');
          if (titleEl) titleEl.textContent = t;
          if (descEl) descEl.textContent = d;
        };
        setCard('btn-open-folder', 'Open Local Folder', 'Open a local directory workspace or drag in');
        setCard('btn-open-wsl', 'WSL Workspace', 'Connect to WSL Linux distros (openEuler/Debian/Ubuntu)');
        setCard('btn-open-ssh', 'SSH Remote Workspace', 'Connect to remote Linux servers or devboxes');
        setCard('btn-open', 'Open Single File', 'Preview standalone Markdown or SVG flame graph');

        const wsH3 = document.querySelector('.wb-col-workspaces h3');
        if (wsH3) wsH3.textContent = 'Recent Workspaces';
        const filesH3 = document.querySelector('.wb-col-files h3');
        if (filesH3) filesH3.textContent = 'Recent Files';
        const clearBtn = document.getElementById('history-clear-all');
        if (clearBtn) clearBtn.textContent = 'Clear All';

        const tabs = document.querySelectorAll('.wb-filter-tabs .wb-tab');
        if (tabs[0]) tabs[0].textContent = 'All';
        if (tabs[1]) tabs[1].textContent = 'WSL';
        if (tabs[2]) tabs[2].textContent = 'SSH';
        if (tabs[3]) tabs[3].textContent = 'Local';

        const footerTip = document.querySelector('.wb-footer-tip span:last-child');
        if (footerTip) footerTip.innerHTML = 'Drag and drop any folder or <code>.md</code> / <code>.svg</code> file anywhere to open';
        const footerMeta = document.querySelector('.wb-footer-meta');
        if (footerMeta) footerMeta.innerHTML = '<span>WSL/SSH Bridge Command: <code>npm run ssh-bridge</code></span>';
      }

      const grid = document.querySelector('.wb-cards-grid');
      if (grid) grid.style.marginTop = '48px';
    }, lang);
  }

  // 1. English Clean & Annotated Dashboard
  await setupDashboard('en');
  await page.waitForTimeout(300);

  console.log('Capturing assets/screenshot-dashboard.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot-dashboard.png'),
    fullPage: false,
  });
  console.log('✓ Saved assets/screenshot-dashboard.png');

  await applyAnnotations(DASHBOARD_CALLOUTS.en);
  await page.waitForTimeout(300);

  console.log('Capturing assets/screenshot-dashboard-annotated.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot-dashboard-annotated.png'),
    fullPage: false,
  });
  copyFileSync(
    join(assetsDir, 'screenshot-dashboard-annotated.png'),
    join(assetsDir, 'screenshot-dashboard-annotated.en.png'),
  );
  console.log('✓ Saved assets/screenshot-dashboard-annotated.png & .en.png');

  // 2. Chinese Annotated Dashboard
  await page.evaluate(() => location.reload());
  await page.waitForFunction(() => window.__testHooks?.ready === true);
  await setupDashboard('cn');
  await applyAnnotations(DASHBOARD_CALLOUTS.cn);
  await page.waitForTimeout(300);

  console.log('Capturing assets/screenshot-dashboard-annotated.zh-CN.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot-dashboard-annotated.zh-CN.png'),
    fullPage: false,
  });
  console.log('✓ Saved assets/screenshot-dashboard-annotated.zh-CN.png');

  // =======================================================
  // SECTION B: DOCUMENT PREVIEW WORKBENCH SCREENSHOTS
  // =======================================================
  console.log('\n--- Generating Document Preview Workbench Screenshots ---');

  const files = [
    { name: 'architecture.md', path: 'docs/architecture.md', dir: 'docs' },
    { name: 'katex-math.md', path: 'docs/katex-math.md', dir: 'docs' },
    { name: 'api-contract.md', path: 'specs/api-contract.md', dir: 'specs' },
    { name: 'flamegraph.svg', path: 'benchmarks/flamegraph.svg', dir: 'benchmarks' },
    { name: 'README.md', path: 'README.md' },
  ];

  async function setupWorkbench(content, lang) {
    await page.evaluate(async ({ content, files, lang }) => {
      await window.__testHooks.loadShowcase({
        workspaceName: 'vmark-showcase',
        currentPath: 'docs/architecture.md',
        files,
        doc: {
          name: 'architecture.md',
          content,
          openedAt: Date.now(),
          size: content.length,
        },
        showOutline: true,
        theme: 'light',
      });

      document.body.style.boxSizing = 'border-box';
      document.body.style.border = '1px solid rgba(0, 0, 0, 0.12)';

      const root = document.getElementById('vscode-md-preview-root');
      if (root) {
        root.dataset.previewWidth = 'comfortable';
        root.style.maxWidth = '750px';
        root.style.margin = '0 0 0 36px';
        root.style.paddingTop = '40px';
      }

      const caption = document.querySelector('.ws-caption');
      const refresh = document.getElementById('ws-btn-refresh');
      const openFile = document.getElementById('ws-btn-open-file');
      const changeFolder = document.getElementById('ws-btn-change-folder');
      const closeBtn = document.getElementById('ws-btn-close');
      const foldBtn = document.getElementById('ws-btn-tree-fold');
      const fileCount = document.getElementById('ws-file-count');
      const copyBtns = document.querySelectorAll('.md-code-copy-btn');

      if (lang === 'en') {
        if (caption) caption.textContent = 'WORKSPACE';
        if (refresh) refresh.textContent = 'Refresh';
        if (openFile) openFile.textContent = 'File…';
        if (changeFolder) changeFolder.textContent = 'Folder…';
        if (closeBtn) closeBtn.textContent = 'Close';
        if (foldBtn) foldBtn.textContent = 'Collapse All';
        if (fileCount) fileCount.textContent = '5 files';
        copyBtns.forEach((b) => (b.textContent = 'Copy'));
      } else {
        if (caption) caption.textContent = '工作区';
        if (refresh) refresh.textContent = '刷新';
        if (openFile) openFile.textContent = '文件…';
        if (changeFolder) changeFolder.textContent = '换夹…';
        if (closeBtn) closeBtn.textContent = '关闭';
        if (foldBtn) foldBtn.textContent = '收起全部';
        if (fileCount) fileCount.textContent = '5 个文件';
        copyBtns.forEach((b) => (b.textContent = '复制'));
      }
    }, { content, files, lang });

    await page.waitForSelector('.mermaid svg', { timeout: 8000 });
    await page.waitForSelector('.katex-display', { timeout: 8000 });
    await page.waitForSelector('#vscode-md-outline-panel', { timeout: 8000 });
    await page.waitForTimeout(600);

    await page.evaluate((lang) => {
      const outline = document.getElementById('vscode-md-outline-panel');
      if (outline) {
        outline.style.top = '52px';
        outline.style.right = '24px';
        outline.style.width = '232px';
        const title = outline.querySelector('.md-outline-title');
        if (title) {
          title.textContent = lang === 'en' ? 'Outline · 4' : '大纲 · 4';
        }
      }
      const fileCount = document.getElementById('ws-file-count');
      if (fileCount) {
        fileCount.textContent = lang === 'en' ? '5 files' : '5 个文件';
      }
    }, lang);
  }

  // 3. English Clean & Annotated Workbench Preview
  const showcaseEn = readFileSync(showcaseEnPath, 'utf8');
  await setupWorkbench(showcaseEn, 'en');

  console.log('Capturing assets/screenshot.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot.png'),
    fullPage: false,
  });
  console.log('✓ Saved assets/screenshot.png');

  await applyAnnotations(WORKBENCH_CALLOUTS.en);
  await page.waitForTimeout(300);

  console.log('Capturing assets/screenshot-annotated.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot-annotated.png'),
    fullPage: false,
  });
  copyFileSync(
    join(assetsDir, 'screenshot-annotated.png'),
    join(assetsDir, 'screenshot-annotated.en.png'),
  );
  console.log('✓ Saved assets/screenshot-annotated.png & .en.png');

  // 4. Chinese Annotated Workbench Preview
  const showcaseCn = readFileSync(showcaseCnPath, 'utf8');
  await setupWorkbench(showcaseCn, 'cn');
  await applyAnnotations(WORKBENCH_CALLOUTS.cn);
  await page.waitForTimeout(300);

  console.log('Capturing assets/screenshot-annotated.zh-CN.png...');
  await page.screenshot({
    path: join(assetsDir, 'screenshot-annotated.zh-CN.png'),
    fullPage: false,
  });
  console.log('✓ Saved assets/screenshot-annotated.zh-CN.png');

  await context.close();
  console.log('\n🎉 ALL 6 SCREENSHOT ASSETS GENERATED SUCCESSFULLY!');
} finally {
  rmSync(tempUserData, { recursive: true, force: true });
}
