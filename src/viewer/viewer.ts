import { loadSettings, type PreviewSettings, type ThemeMode } from '../preview/config';
import { MarkdownPreviewEngine } from '../preview/engine';
import { runMermaid } from '../content/mermaidRunner';
import { mountToolbar, type PreviewMode } from '../content/toolbar';
import {
  isMarkdownFileName,
  loadLocalDoc,
  MD_ACCEPT,
  readFileAsLocalDoc,
  saveLocalDoc,
  type LocalMarkdownDoc,
} from '../shared/localDoc';

import markdownCss from '../preview/styles/markdown.css';
import highlightCss from '../preview/styles/highlight.css';
import themeVarsCss from '../preview/styles/theme-vars.css';
import toolbarCss from '../preview/styles/toolbar.css';

const STYLE_ID = 'vscode-md-preview-styles';
const ROOT_ID = 'vscode-md-preview-root';
const SOURCE_ID = 'vscode-md-preview-source';
const EMPTY_ID = 'empty-state';

let doc: LocalMarkdownDoc | null = null;
let mode: PreviewMode = 'preview';
let settings: PreviewSettings;
let engine: MarkdownPreviewEngine;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`#${id} missing`);
  }
  return el;
}

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

  if (!document.getElementById('vscode-md-preview-katex')) {
    const link = document.createElement('link');
    link.id = 'vscode-md-preview-katex';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles/katex.min.css');
    document.documentElement.appendChild(link);
  }
}

function setDocumentTitle(name?: string): void {
  document.title = name ? `${name} — Markdown Preview` : 'Markdown Preview';
}

function showEmpty(): void {
  $('empty-state').hidden = false;
  const root = document.getElementById(ROOT_ID);
  const source = document.getElementById(SOURCE_ID);
  if (root) {
    root.hidden = true;
    root.innerHTML = '';
  }
  if (source) {
    source.hidden = true;
    source.textContent = '';
  }
  document.getElementById('vscode-md-preview-toolbar')?.remove();
  document.documentElement.classList.remove('vscode-md-preview-active');
  document.body.classList.remove('vscode-md-preview-active', 'vscode-dark', 'vscode-light');
  setDocumentTitle();
}

function showSourceView(): void {
  if (!doc) {
    return;
  }
  mode = 'source';
  const root = $(ROOT_ID);
  root.hidden = true;

  const pre = $(SOURCE_ID) as HTMLPreElement;
  pre.hidden = false;
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.style.margin = '0';
  pre.style.padding = '16px';
  pre.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  pre.style.fontSize = '13px';
  pre.textContent = doc.content;

  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');

  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: () => void chrome.runtime.openOptionsPage(),
  });
  // Extra: open file via toolbar isn't there — keep empty-state button path
}

async function showPreviewView(): Promise<void> {
  if (!doc) {
    return;
  }
  mode = 'preview';
  injectStyles();

  const theme = resolveTheme(settings.theme);
  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');
  document.documentElement.dataset.theme = theme;

  const pre = $(SOURCE_ID);
  pre.hidden = true;

  const root = $(ROOT_ID);
  root.hidden = false;
  root.className = 'vscode-md-preview-root';
  root.dataset.theme = theme;

  engine.updateSettings(settings);
  const rendered = engine.render(doc.content, undefined);
  root.innerHTML = rendered.html;

  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  if (rendered.hasMermaid && settings.mermaidEnabled) {
    await runMermaid(root, {
      isDark: theme === 'dark',
      mermaidTheme: settings.mermaidTheme,
    });
  }

  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: () => void chrome.runtime.openOptionsPage(),
  });

  // Append "Open…" control to toolbar
  const bar = document.getElementById('vscode-md-preview-toolbar');
  if (bar && !bar.querySelector('[data-action="open-file"]')) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.dataset.action = 'open-file';
    openBtn.textContent = 'Open…';
    openBtn.title = '打开其他本地文件';
    openBtn.addEventListener('click', () => pickFile());
    bar.appendChild(openBtn);
  }

  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView();
  }
}

async function setMode(next: PreviewMode): Promise<void> {
  if (next === 'source') {
    showSourceView();
  } else {
    await showPreviewView();
  }
}

async function openDoc(next: LocalMarkdownDoc): Promise<void> {
  doc = next;
  await saveLocalDoc(next);
  $('empty-state').hidden = true;
  setDocumentTitle(next.name);
  await showPreviewView();
}

async function openFile(file: File): Promise<void> {
  if (!isMarkdownFileName(file.name) && file.type && !/markdown|text\/plain|text\//i.test(file.type)) {
    alert(`不支持的文件类型: ${file.name}`);
    return;
  }
  const next = await readFileAsLocalDoc(file);
  await openDoc(next);
}

function pickFile(): void {
  const input = $('file-input') as HTMLInputElement;
  input.accept = MD_ACCEPT;
  input.value = '';
  input.click();
}

function wireEmptyState(): void {
  const dropzone = $('dropzone');
  const empty = $(EMPTY_ID);

  $('btn-open').addEventListener('click', () => pickFile());
  $('btn-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());

  dropzone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    pickFile();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickFile();
    }
  });

  const onDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  empty.addEventListener('dragenter', (e) => {
    onDrag(e);
    dropzone.classList.add('dragover');
  });
  empty.addEventListener('dragover', (e) => {
    onDrag(e);
    dropzone.classList.add('dragover');
  });
  empty.addEventListener('dragleave', (e) => {
    onDrag(e);
    if (e.target === empty || e.target === dropzone) {
      dropzone.classList.remove('dragover');
    }
  });
  empty.addEventListener('drop', (e) => {
    onDrag(e);
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void openFile(file);
    }
  });

  // Also allow drop while preview is showing
  document.body.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
    }
  });
  document.body.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      e.preventDefault();
      void openFile(file);
    }
  });

  ($('file-input') as HTMLInputElement).addEventListener('change', () => {
    const input = $('file-input') as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void openFile(file);
    }
  });
}

async function init(): Promise<void> {
  settings = await loadSettings();
  engine = new MarkdownPreviewEngine(settings);
  injectStyles();
  // Apply theme tokens on empty state too
  const theme = resolveTheme(settings.theme);
  document.documentElement.dataset.theme = theme;
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');

  wireEmptyState();

  const params = new URLSearchParams(location.search);
  const shouldPick = params.get('pick') === '1';

  const existing = await loadLocalDoc();
  if (existing) {
    doc = existing;
    $('empty-state').hidden = true;
    setDocumentTitle(existing.name);
    await showPreviewView();
  } else {
    showEmpty();
  }

  if (shouldPick) {
    // Strip pick query so refresh doesn't re-open dialog forever
    history.replaceState(null, '', location.pathname);
    // Defer so the page paints first
    setTimeout(() => pickFile(), 50);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !doc) {
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
    if (dirty && mode === 'preview') {
      engine.updateSettings(settings);
      void showPreviewView();
    }
  });
}

void init();
