import { DEFAULT_SETTINGS, loadSettings, type PreviewSettings, type ThemeMode } from '../preview/config';
import { MarkdownPreviewEngine } from '../preview/engine';
import { extractMarkdownSource, isMarkdownSourcePage } from './detect';
import { runMermaid } from './mermaidRunner';
import { mountToolbar, type PreviewMode } from './toolbar';

import markdownCss from '../preview/styles/markdown.css';
import highlightCss from '../preview/styles/highlight.css';
import themeVarsCss from '../preview/styles/theme-vars.css';
import toolbarCss from '../preview/styles/toolbar.css';

const STYLE_ID = 'vscode-md-preview-styles';
const ROOT_ID = 'vscode-md-preview-root';
const SOURCE_ID = 'vscode-md-preview-source';

let sourceText = '';
let mode: PreviewMode = 'preview';
let settings: PreviewSettings = { ...DEFAULT_SETTINGS };
let engine = new MarkdownPreviewEngine(settings);
let bootstrapped = false;

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [themeVarsCss, markdownCss, highlightCss, toolbarCss].join('\n');
  document.documentElement.appendChild(style);

  // KaTeX CSS as <link> so font urls resolve against chrome-extension://…/styles/
  if (!document.getElementById('vscode-md-preview-katex')) {
    const link = document.createElement('link');
    link.id = 'vscode-md-preview-katex';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles/katex.min.css');
    document.documentElement.appendChild(link);
  }
}

function ensureShell(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'vscode-md-preview-root';
  }
  return root;
}

function showSource(): void {
  mode = 'source';
  const root = document.getElementById(ROOT_ID);
  root?.remove();

  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');

  let pre = document.getElementById(SOURCE_ID) as HTMLPreElement | null;
  if (!pre) {
    document.body.innerHTML = '';
    pre = document.createElement('pre');
    pre.id = SOURCE_ID;
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.style.margin = '0';
    pre.style.padding = '16px';
    pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    pre.style.fontSize = '13px';
    pre.textContent = sourceText;
    document.body.appendChild(pre);
  } else {
    pre.hidden = false;
    pre.textContent = sourceText;
  }

  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: openOptions,
  });
}

async function showPreview(): Promise<void> {
  mode = 'preview';
  injectStyles();

  const theme = resolveTheme(settings.theme);
  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');
  // Body classes used by VS Code mermaid theme detection helpers
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');

  const sourceEl = document.getElementById(SOURCE_ID);
  if (sourceEl) {
    sourceEl.hidden = true;
  }

  // Clear body chrome (default plain-text pre, etc.) once
  const existingRoot = document.getElementById(ROOT_ID);
  if (!existingRoot) {
    document.body.innerHTML = '';
  }

  const root = ensureShell();
  root.dataset.theme = theme;
  // Put tokens on both root + html so mermaid can resolve CSS variables reliably
  document.documentElement.dataset.theme = theme;

  const rendered = engine.render(sourceText, location.href);
  root.innerHTML = rendered.html;
  if (!root.isConnected) {
    document.body.appendChild(root);
  }

  // Ensure styles are applied before reading CSS vars for Mermaid themeVariables
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  if (rendered.hasMermaid) {
    await runMermaid(root, {
      isDark: theme === 'dark',
      mermaidTheme: settings.mermaidTheme,
    });
  }

  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: openOptions,
  });

  // Honor hash fragments after render
  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView();
  }
}

async function setMode(next: PreviewMode): Promise<void> {
  if (next === 'source') {
    showSource();
  } else {
    await showPreview();
  }
}

function openOptions(): void {
  chrome.runtime.sendMessage({ type: 'openOptions' });
}

async function bootstrap(force = false): Promise<void> {
  if (bootstrapped && !force) {
    return;
  }

  if (!force && !isMarkdownSourcePage()) {
    return;
  }

  settings = await loadSettings();
  if (!force && !settings.autoPreview) {
    // Still allow toolbar via extension action
    return;
  }

  sourceText = extractMarkdownSource();
  if (!sourceText.trim() && !force) {
    return;
  }

  engine = new MarkdownPreviewEngine(settings);
  bootstrapped = true;
  await showPreview();
}

// Extension icon / context menu
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'togglePreview') {
    void (async () => {
      if (!bootstrapped) {
        sourceText = extractMarkdownSource();
        settings = await loadSettings();
        engine = new MarkdownPreviewEngine(settings);
        bootstrapped = true;
        await showPreview();
      } else {
        await setMode(mode === 'preview' ? 'source' : 'preview');
      }
      sendResponse({ ok: true, mode });
    })();
    return true;
  }
  if (message?.type === 'forcePreview') {
    void bootstrap(true).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// Auto-run on matching pages
void bootstrap(false);

// React to settings changes
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !bootstrapped) {
      return;
    }
    let dirty = false;
    for (const key of Object.keys(changes) as (keyof PreviewSettings)[]) {
      if (key in settings) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (settings as any)[key] = changes[key].newValue;
        dirty = true;
      }
    }
    if (dirty) {
      engine.updateSettings(settings);
      if (mode === 'preview') {
        void showPreview();
      }
    }
  });
} catch {
  // storage may be unavailable in some contexts
}
