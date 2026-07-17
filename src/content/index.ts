import { DEFAULT_SETTINGS, loadSettings, type PreviewSettings, type ThemeMode } from '../preview/config';
import { MarkdownPreviewEngine } from '../preview/engine';
import { OutlineFloatingPanel, outlinePanelCss } from '../preview/outlinePanel';
import { extractMarkdownSource, isMarkdownSourcePage } from './detect';
import { runMermaid } from './mermaidRunner';
import { mountToolbar, type PreviewMode } from './toolbar';

import markdownCss from '../preview/styles/markdown.css';
import highlightCss from '../preview/styles/highlight.css';
import themeVarsCss from '../preview/styles/theme-vars.css';
import toolbarCss from '../preview/styles/toolbar.css';
import iconsCss from '../preview/styles/icons.css';

const STYLE_ID = 'vscode-md-preview-styles';
const ROOT_ID = 'vscode-md-preview-root';
const SOURCE_ID = 'vscode-md-preview-source';

let sourceText = '';
let mode: PreviewMode = 'preview';
let settings: PreviewSettings = { ...DEFAULT_SETTINGS };
let engine = new MarkdownPreviewEngine(settings);
let bootstrapped = false;

const outlinePanel = new OutlineFloatingPanel({
  getScrollRoot: () => document.documentElement,
  onStateChange: () => remountToolbar(),
});

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
  style.textContent = [
    themeVarsCss,
    markdownCss,
    highlightCss,
    toolbarCss,
    iconsCss,
    outlinePanelCss,
  ].join('\n');
  document.documentElement.appendChild(style);

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

function remountToolbar(): void {
  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: openOptions,
    onToggleOutline:
      mode === 'preview'
        ? () => outlinePanel.toggle(document.getElementById(ROOT_ID))
        : undefined,
    outlineOpen: outlinePanel.isOpen,
  });
}

function showSource(): void {
  mode = 'source';
  if (outlinePanel.isOpen && !outlinePanel.isPinned) {
    outlinePanel.close();
  }
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

  remountToolbar();
}

async function showPreview(): Promise<void> {
  mode = 'preview';
  injectStyles();

  const theme = resolveTheme(settings.theme);
  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');

  const sourceEl = document.getElementById(SOURCE_ID);
  if (sourceEl) {
    sourceEl.hidden = true;
  }

  const existingRoot = document.getElementById(ROOT_ID);
  if (!existingRoot) {
    document.body.innerHTML = '';
  }

  const root = ensureShell();
  root.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;

  const rendered = engine.render(sourceText, location.href);
  root.innerHTML = rendered.html;
  if (!root.isConnected) {
    document.body.appendChild(root);
  }

  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  if (rendered.hasMermaid) {
    await runMermaid(root, {
      isDark: theme === 'dark',
      mermaidTheme: settings.mermaidTheme,
    });
  }

  if (outlinePanel.isOpen) {
    outlinePanel.updateFromDom(root);
  }

  remountToolbar();

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
    return;
  }

  sourceText = extractMarkdownSource();
  if (!sourceText.trim() && !force) {
    return;
  }

  engine = new MarkdownPreviewEngine(settings);
  await outlinePanel.loadPinPreference();
  bootstrapped = true;
  await showPreview();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'togglePreview') {
    void (async () => {
      if (!bootstrapped) {
        sourceText = extractMarkdownSource();
        settings = await loadSettings();
        engine = new MarkdownPreviewEngine(settings);
        await outlinePanel.loadPinPreference();
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
  if (message?.type === 'toggleOutline') {
    if (bootstrapped && mode === 'preview') {
      outlinePanel.toggle(document.getElementById(ROOT_ID));
    }
    sendResponse({ ok: true, outlineOpen: outlinePanel.isOpen });
    return true;
  }
  return false;
});

void bootstrap(false);

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
  // storage may be unavailable
}
