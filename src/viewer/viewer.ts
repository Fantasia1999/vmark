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
import {
  buildFileTree,
  clearWorkspace,
  createWorkspaceObjectUrl,
  ensureReadPermission,
  isDirectoryPickerSupported,
  listMarkdownFiles,
  loadWorkspaceHandle,
  loadWorkspaceMeta,
  pickWorkspaceDirectory,
  readWorkspaceTextFile,
  resolveRelativePath,
  saveWorkspaceHandle,
  type WorkspaceFileEntry,
} from '../shared/workspaceFs';
import {
  loadSshFormDefaults,
  saveSshFormDefaults,
  sshConnect,
  sshCreateObjectUrl,
  sshDisconnect,
  sshHealth,
  sshListMarkdown,
  sshReadText,
  type SshSessionMeta,
} from '../shared/sshClient';
import { renderFileTree, setWorkspaceChrome } from './workspaceUi';
import { OutlineFloatingPanel, outlinePanelCss } from '../preview/outlinePanel';

import markdownCss from '../preview/styles/markdown.css';
import highlightCss from '../preview/styles/highlight.css';
import themeVarsCss from '../preview/styles/theme-vars.css';
import toolbarCss from '../preview/styles/toolbar.css';
import iconsCss from '../preview/styles/icons.css';

const STYLE_ID = 'vscode-md-preview-styles';
const ROOT_ID = 'vscode-md-preview-root';
const SOURCE_ID = 'vscode-md-preview-source';

let doc: LocalMarkdownDoc | null = null;
/** Relative path inside workspace when in workspace mode */
let currentPath: string | undefined;
let mode: PreviewMode = 'preview';
let settings: PreviewSettings;
let engine: MarkdownPreviewEngine;

let workspaceRoot: FileSystemDirectoryHandle | null = null;
/** 'local' = File System Access, 'ssh' = remote via bridge */
let workspaceKind: 'local' | 'ssh' | null = null;
let sshMeta: SshSessionMeta | null = null;
let workspaceFiles: WorkspaceFileEntry[] = [];
let objectUrls: string[] = [];
let sshPrivateKeyText = '';

const outlinePanel = new OutlineFloatingPanel({
  getScrollRoot: () => document.getElementById('ws-content') ?? document.documentElement,
  onStateChange: () => {
    if (doc) {
      mountToolbarExtras();
    }
  },
});

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

function applyThemeClass(): void {
  const theme = resolveTheme(settings.theme);
  document.documentElement.dataset.theme = theme;
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');
  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');
}

function workspaceLabel(): string | undefined {
  if (workspaceKind === 'ssh' && sshMeta) {
    return `ssh://${sshMeta.username}@${sshMeta.host}:${sshMeta.port}${sshMeta.root === '.' ? '' : sshMeta.root}`;
  }
  if (workspaceRoot) {
    return workspaceRoot.name;
  }
  return undefined;
}

function setDocumentTitle(name?: string): void {
  const ws = workspaceLabel();
  if (name && ws) {
    document.title = `${name} — ${ws}`;
  } else if (name) {
    document.title = `${name} — Markdown Preview`;
  } else if (ws) {
    document.title = `${ws} — Workspace`;
  } else {
    document.title = 'Markdown Preview';
  }
}

function revokeObjectUrls(): void {
  for (const u of objectUrls) {
    URL.revokeObjectURL(u);
  }
  objectUrls = [];
}

function showEmpty(): void {
  revokeObjectUrls();
  workspaceRoot = null;
  workspaceKind = null;
  sshMeta = null;
  workspaceFiles = [];
  currentPath = undefined;
  doc = null;
  outlinePanel.close();
  setWorkspaceChrome(false);
  $('empty-state').hidden = false;
  document.getElementById('vscode-md-preview-toolbar')?.remove();
  document.documentElement.classList.remove('vscode-md-preview-active');
  document.body.classList.remove('vscode-md-preview-active');
  setDocumentTitle();
}

function updatePathBar(): void {
  const pathEl = document.getElementById('ws-current-path');
  const countEl = document.getElementById('ws-file-count');
  if (pathEl) {
    pathEl.textContent = currentPath ?? (doc ? doc.name : '选择左侧 Markdown 文件开始预览');
  }
  if (countEl) {
    countEl.textContent = workspaceFiles.length
      ? `${workspaceFiles.length} 个 Markdown`
      : '';
  }
}

function refreshTree(): void {
  const treeEl = document.getElementById('ws-file-tree');
  if (!treeEl) {
    return;
  }
  const tree = buildFileTree(workspaceFiles);
  renderFileTree(treeEl, tree, currentPath, {
    onOpenFile: (path) => void openWorkspaceFile(path),
  });
  updatePathBar();
}

async function showWorkspaceShell(
  title: string,
  preferredPath?: string,
): Promise<void> {
  injectStyles();
  applyThemeClass();
  setWorkspaceChrome(true, title);
  $('empty-state').hidden = true;
  setDocumentTitle();
  refreshTree();

  const emptyPrev = document.getElementById('ws-empty-preview');
  if (emptyPrev) {
    emptyPrev.hidden = false;
  }
  $(ROOT_ID).hidden = true;
  $(SOURCE_ID).hidden = true;

  let target = preferredPath;
  if (target && !workspaceFiles.some((f) => f.path === target)) {
    target = undefined;
  }
  if (!target) {
    const readme = workspaceFiles.find((f) => /^readme\.(md|markdown|mdx)$/i.test(f.name));
    target = readme?.path ?? workspaceFiles[0]?.path;
  }
  if (target) {
    await openWorkspaceFile(target);
  } else {
    doc = null;
    currentPath = undefined;
    updatePathBar();
    document.getElementById('vscode-md-preview-toolbar')?.remove();
  }
}

async function enterWorkspace(
  root: FileSystemDirectoryHandle,
  preferredPath?: string,
): Promise<void> {
  const ok = await ensureReadPermission(root, true);
  if (!ok) {
    alert('需要读取文件夹权限才能使用工作区。');
    return;
  }

  // Leaving SSH if any
  if (workspaceKind === 'ssh') {
    void sshDisconnect();
    sshMeta = null;
  }

  workspaceRoot = root;
  workspaceKind = 'local';
  workspaceFiles = await listMarkdownFiles(root);
  await saveWorkspaceHandle(root, preferredPath);
  await showWorkspaceShell(root.name, preferredPath);
}

async function enterSshWorkspace(meta: SshSessionMeta, preferredPath?: string): Promise<void> {
  workspaceRoot = null;
  workspaceKind = 'ssh';
  sshMeta = meta;
  // Drop local FS handle association while on SSH
  try {
    await clearWorkspace();
  } catch {
    // ignore
  }
  workspaceFiles = await sshListMarkdown();
  const title = `${meta.username}@${meta.host}:${meta.root}`;
  await showWorkspaceShell(title, preferredPath);
}

async function openWorkspaceFolder(): Promise<void> {
  try {
    const root = await pickWorkspaceDirectory();
    await enterWorkspace(root);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return;
    }
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }
}

async function openWorkspaceFile(path: string): Promise<void> {
  if (workspaceKind === 'ssh') {
    try {
      const text = await sshReadText(path);
      currentPath = path;
      doc = {
        name: path.split('/').pop() || path,
        content: text,
        openedAt: Date.now(),
        size: text.length,
      };
    } catch (e) {
      alert(`无法读取远程文件: ${path}\n${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  } else if (workspaceRoot) {
    const result = await readWorkspaceTextFile(workspaceRoot, path);
    if (!result) {
      alert(`无法读取文件: ${path}`);
      return;
    }
    currentPath = path;
    doc = {
      name: path.split('/').pop() || path,
      content: result.text,
      openedAt: Date.now(),
      lastModified: result.file.lastModified,
      size: result.file.size,
    };
    await saveWorkspaceHandle(workspaceRoot, path);
  } else {
    return;
  }

  await saveLocalDoc(doc);
  setDocumentTitle(doc.name);
  refreshTree();

  const emptyPrev = document.getElementById('ws-empty-preview');
  if (emptyPrev) {
    emptyPrev.hidden = true;
  }

  await showPreviewView();
}

/**
 * Resolve relative images against local FS or SSH bridge.
 */
async function resolveWorkspaceAssets(rootEl: HTMLElement): Promise<void> {
  if (!currentPath || (workspaceKind !== 'local' && workspaceKind !== 'ssh')) {
    return;
  }
  if (workspaceKind === 'local' && !workspaceRoot) {
    return;
  }
  revokeObjectUrls();

  const imgs = rootEl.querySelectorAll('img');
  for (const img of imgs) {
    const original =
      img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (
      !original ||
      /^(https?:|data:|blob:|chrome-extension:)/i.test(original) ||
      original.startsWith('#')
    ) {
      continue;
    }
    const resolved = resolveRelativePath(currentPath, original);
    let url: string | null = null;
    if (workspaceKind === 'ssh') {
      url = await sshCreateObjectUrl(resolved);
    } else if (workspaceRoot) {
      url = await createWorkspaceObjectUrl(workspaceRoot, resolved);
    }
    if (url) {
      objectUrls.push(url);
      img.setAttribute('src', url);
      img.setAttribute('data-workspace-src', resolved);
    }
  }
}

/**
 * Intercept clicks on relative .md links to open within the workspace.
 * Bound once on the content host (not per render).
 */
function onPreviewClick(e: MouseEvent): void {
  const a = (e.target as HTMLElement).closest('a');
  if (!a || !currentPath) {
    return;
  }
  if (workspaceKind !== 'local' && workspaceKind !== 'ssh') {
    return;
  }
  if (workspaceKind === 'local' && !workspaceRoot) {
    return;
  }
  const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
  if (!href || /^(https?:|mailto:|data:|blob:)/i.test(href)) {
    return;
  }
  if (href.startsWith('#')) {
    return;
  }
  const pathOnly = href.split('#')[0].split('?')[0];
  if (!isMarkdownFileName(pathOnly)) {
    return;
  }
  e.preventDefault();
  const targetPath = resolveRelativePath(currentPath, pathOnly);
  const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
  void openWorkspaceFile(targetPath).then(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      document.getElementById(id)?.scrollIntoView();
    }
  });
}

function showSourceView(): void {
  if (!doc) {
    return;
  }
  mode = 'source';
  // Unpinned outline closes in source mode; pinned stays (list still useful)
  if (outlinePanel.isOpen && !outlinePanel.isPinned) {
    outlinePanel.close();
  }
  const root = $(ROOT_ID);
  root.hidden = true;

  const pre = $(SOURCE_ID) as HTMLPreElement;
  pre.hidden = false;
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.style.margin = '0';
  pre.style.padding = '16px';
  pre.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  pre.style.fontSize = '13px';
  pre.textContent = doc.content;

  applyThemeClass();
  mountToolbarExtras();
}

async function showPreviewView(): Promise<void> {
  if (!doc) {
    return;
  }
  mode = 'preview';
  injectStyles();
  applyThemeClass();

  const pre = $(SOURCE_ID);
  pre.hidden = true;

  const root = $(ROOT_ID);
  root.hidden = false;
  root.className = 'vscode-md-preview-root';
  root.dataset.theme = resolveTheme(settings.theme);

  engine.updateSettings(settings);
  // documentBase unused for workspace assets (resolved after render)
  const rendered = engine.render(doc.content, undefined);
  root.innerHTML = rendered.html;

  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await resolveWorkspaceAssets(root);

  if (rendered.hasMermaid && settings.mermaidEnabled) {
    await runMermaid(root, {
      isDark: resolveTheme(settings.theme) === 'dark',
      mermaidTheme: settings.mermaidTheme,
    });
  }

  // Refresh floating outline if open (especially when pinned across files)
  if (outlinePanel.isOpen) {
    outlinePanel.updateFromDom(root);
  }

  mountToolbarExtras();

  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView();
  }
}

function mountToolbarExtras(): void {
  if (!doc) {
    return;
  }
  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: () => void chrome.runtime.openOptionsPage(),
    onToggleOutline:
      mode === 'preview'
        ? () => {
            const root = document.getElementById(ROOT_ID);
            outlinePanel.toggle(root);
          }
        : undefined,
    outlineOpen: outlinePanel.isOpen,
  });

  const bar = document.getElementById('vscode-md-preview-toolbar');
  if (!bar) {
    return;
  }

  if (!bar.querySelector('[data-action="open-file"]')) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.dataset.action = 'open-file';
    openBtn.textContent = 'File…';
    openBtn.title = '打开单个文件';
    openBtn.addEventListener('click', () => pickFile());
    bar.appendChild(openBtn);
  }
  if (!bar.querySelector('[data-action="open-folder"]')) {
    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.dataset.action = 'open-folder';
    folderBtn.textContent = 'Folder…';
    folderBtn.title = '打开工作区文件夹';
    folderBtn.addEventListener('click', () => void openWorkspaceFolder());
    bar.appendChild(folderBtn);
  }
}

async function setMode(next: PreviewMode): Promise<void> {
  if (next === 'source') {
    showSourceView();
  } else {
    await showPreviewView();
  }
}

async function openSingleDoc(next: LocalMarkdownDoc): Promise<void> {
  // Single-file mode: leave workspace if active? Keep workspace shell if open, just show doc without path
  doc = next;
  currentPath = undefined;
  await saveLocalDoc(next);
  setDocumentTitle(next.name);

  if (!workspaceRoot && workspaceKind !== 'ssh') {
    // Use shell layout with empty sidebar message for consistency
    setWorkspaceChrome(true, next.name);
    const treeEl = document.getElementById('ws-file-tree');
    if (treeEl) {
      treeEl.innerHTML =
        '<p style="padding:12px;opacity:0.6;font-size:12px;line-height:1.4">当前为单文件预览。<br/>可打开本地文件夹或 SSH 工作区。</p>';
    }
    $('empty-state').hidden = true;
    const emptyPrev = document.getElementById('ws-empty-preview');
    if (emptyPrev) {
      emptyPrev.hidden = true;
    }
  } else {
    refreshTree();
  }
  updatePathBar();
  await showPreviewView();
}

async function openFile(file: File): Promise<void> {
  if (
    !isMarkdownFileName(file.name) &&
    file.type &&
    !/markdown|text\/plain|text\//i.test(file.type)
  ) {
    alert(`不支持的文件类型: ${file.name}`);
    return;
  }
  const next = await readFileAsLocalDoc(file);
  await openSingleDoc(next);
}

function pickFile(): void {
  const input = $('file-input') as HTMLInputElement;
  input.accept = MD_ACCEPT;
  input.value = '';
  input.click();
}

function wireUi(): void {
  const dropzone = $('dropzone');
  const empty = $('empty-state');

  $('btn-open').addEventListener('click', () => pickFile());
  $('btn-open-folder')?.addEventListener('click', () => void openWorkspaceFolder());
  $('btn-open-ssh')?.addEventListener('click', () => showSshDialog(true));
  $('btn-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());

  $('ws-btn-refresh')?.addEventListener('click', () => void refreshWorkspace());
  $('ws-btn-open-file')?.addEventListener('click', () => pickFile());
  $('ws-btn-change-folder')?.addEventListener('click', () => {
    if (workspaceKind === 'ssh') {
      showSshDialog(true);
    } else {
      void openWorkspaceFolder();
    }
  });
  $('ws-btn-close')?.addEventListener('click', () => void closeWorkspace());

  // SSH dialog wiring
  document.getElementById('ssh-cancel')?.addEventListener('click', () => showSshDialog(false));
  document.querySelector('[data-ssh-dismiss]')?.addEventListener('click', () => showSshDialog(false));
  document.getElementById('ssh-connect')?.addEventListener('click', () => void connectSshFromDialog());
  document.getElementById('ssh-auth')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as 'password' | 'key';
    setSshAuthMode(v);
  });
  document.getElementById('ssh-key-file')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      sshPrivateKeyText = '';
      return;
    }
    sshPrivateKeyText = await file.text();
  });

  dropzone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // default: open folder if supported, else file
    if (isDirectoryPickerSupported()) {
      void openWorkspaceFolder();
    } else {
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
    dropzone.classList.remove('dragover');
  });
  empty.addEventListener('drop', (e) => {
    onDrag(e);
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void openFile(file);
    }
  });

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

  if (!isDirectoryPickerSupported()) {
    const meta = document.getElementById('empty-meta');
    if (meta) {
      meta.textContent =
        '当前环境不支持打开文件夹，请使用「打开文件」或直接在浏览器中打开 file:// 路径。';
    }
    const btn = document.getElementById('btn-open-folder') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.title = '不支持 Directory Picker';
    }
  }
}

async function refreshWorkspace(): Promise<void> {
  try {
    if (workspaceKind === 'ssh') {
      workspaceFiles = await sshListMarkdown();
    } else if (workspaceRoot) {
      const ok = await ensureReadPermission(workspaceRoot, true);
      if (!ok) {
        alert('权限已失效，请重新打开文件夹。');
        return;
      }
      workspaceFiles = await listMarkdownFiles(workspaceRoot);
    } else {
      return;
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
    return;
  }
  refreshTree();
  if (currentPath && !workspaceFiles.some((f) => f.path === currentPath)) {
    currentPath = undefined;
    doc = null;
    $(ROOT_ID).hidden = true;
    const emptyPrev = document.getElementById('ws-empty-preview');
    if (emptyPrev) {
      emptyPrev.hidden = false;
    }
  }
}

async function closeWorkspace(): Promise<void> {
  if (workspaceKind === 'ssh') {
    await sshDisconnect();
  }
  await clearWorkspace();
  revokeObjectUrls();
  outlinePanel.close();
  showEmpty();
}

/* —— SSH dialog —— */

function showSshDialog(show: boolean): void {
  const dlg = document.getElementById('ssh-dialog');
  if (dlg) {
    dlg.hidden = !show;
  }
  if (show) {
    void (async () => {
      const d = await loadSshFormDefaults();
      const host = document.getElementById('ssh-host') as HTMLInputElement | null;
      const port = document.getElementById('ssh-port') as HTMLInputElement | null;
      const user = document.getElementById('ssh-user') as HTMLInputElement | null;
      const root = document.getElementById('ssh-root') as HTMLInputElement | null;
      if (host) host.value = d.host;
      if (port) port.value = d.port;
      if (user) user.value = d.username;
      if (root) root.value = d.root;
      const err = document.getElementById('ssh-error');
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
    })();
  }
}

function setSshAuthMode(mode: 'password' | 'key'): void {
  const pw = document.getElementById('ssh-password-row');
  const key = document.getElementById('ssh-key-row');
  if (pw) pw.hidden = mode !== 'password';
  if (key) key.hidden = mode !== 'key';
}

async function connectSshFromDialog(): Promise<void> {
  const errEl = document.getElementById('ssh-error');
  const connectBtn = document.getElementById('ssh-connect') as HTMLButtonElement | null;
  const showErr = (msg: string) => {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  const host = (document.getElementById('ssh-host') as HTMLInputElement).value.trim();
  const port = Number((document.getElementById('ssh-port') as HTMLInputElement).value) || 22;
  const username = (document.getElementById('ssh-user') as HTMLInputElement).value.trim();
  const root = (document.getElementById('ssh-root') as HTMLInputElement).value.trim() || '.';
  const auth = (document.getElementById('ssh-auth') as HTMLSelectElement).value as
    | 'password'
    | 'key';
  const password = (document.getElementById('ssh-password') as HTMLInputElement).value;
  const passphrase = (document.getElementById('ssh-passphrase') as HTMLInputElement).value;

  if (!host || !username) {
    showErr('请填写主机和用户名');
    return;
  }

  const health = await sshHealth();
  if (!health.ok) {
    showErr('SSH Bridge 未运行。请执行: cd ssh-bridge && npm install && npm start');
    return;
  }

  if (connectBtn) connectBtn.disabled = true;
  try {
    const meta = await sshConnect({
      host,
      port,
      username,
      root,
      password: auth === 'password' ? password : undefined,
      privateKey: auth === 'key' ? sshPrivateKeyText || undefined : undefined,
      passphrase: auth === 'key' && passphrase ? passphrase : undefined,
    });
    await saveSshFormDefaults({
      host,
      port: String(port),
      username,
      root,
    });
    showSshDialog(false);
    // Clear secrets from DOM
    (document.getElementById('ssh-password') as HTMLInputElement).value = '';
    (document.getElementById('ssh-passphrase') as HTMLInputElement).value = '';
    sshPrivateKeyText = '';
    await enterSshWorkspace(meta);
  } catch (e) {
    showErr(e instanceof Error ? e.message : String(e));
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

async function tryRestoreWorkspace(): Promise<boolean> {
  const handle = await loadWorkspaceHandle();
  if (!handle) {
    return false;
  }
  const meta = await loadWorkspaceMeta();
  // Permission may require a user gesture on some builds; try query first
  const permitted = await ensureReadPermission(handle, true);
  if (!permitted) {
    // keep handle; user can click 刷新/打开 to re-authorize
    setWorkspaceChrome(true, handle.name || meta?.name || 'Workspace');
    $('empty-state').hidden = true;
    injectStyles();
    applyThemeClass();
    const treeEl = document.getElementById('ws-file-tree');
    if (treeEl) {
      treeEl.innerHTML =
        '<p style="padding:12px;opacity:0.7;font-size:12px;line-height:1.5">需要重新授权才能读取此文件夹。<br/><button type="button" id="ws-reauth" style="margin-top:8px">授权并打开</button></p>';
      treeEl.querySelector('#ws-reauth')?.addEventListener('click', () => {
        void enterWorkspace(handle, meta?.lastFilePath);
      });
    }
    workspaceRoot = handle;
    return true;
  }
  await enterWorkspace(handle, meta?.lastFilePath);
  return true;
}

async function init(): Promise<void> {
  settings = await loadSettings();
  engine = new MarkdownPreviewEngine(settings);
  injectStyles();
  applyThemeClass();
  await outlinePanel.loadPinPreference();
  wireUi();
  document.getElementById('ws-content')?.addEventListener('click', onPreviewClick);

  const params = new URLSearchParams(location.search);
  const shouldPickFile = params.get('pick') === '1';
  const shouldPickFolder = params.get('workspace') === '1' || params.get('folder') === '1';
  const shouldSsh = params.get('ssh') === '1';

  if (shouldPickFile || shouldPickFolder || shouldSsh) {
    history.replaceState(null, '', location.pathname);
  }

  // Don't restore local FS workspace when user explicitly wants SSH
  const restored = shouldSsh ? false : await tryRestoreWorkspace();
  if (!restored) {
    const existing = shouldSsh ? null : await loadLocalDoc();
    if (existing) {
      await openSingleDoc(existing);
    } else {
      showEmpty();
      applyThemeClass();
    }
  }

  if (shouldSsh) {
    setTimeout(() => showSshDialog(true), 50);
  } else if (shouldPickFolder) {
    setTimeout(() => void openWorkspaceFolder(), 50);
  } else if (shouldPickFile) {
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
