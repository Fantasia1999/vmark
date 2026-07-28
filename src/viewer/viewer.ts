import {
  loadSettings,
  type PreviewSettings,
  type PreviewWidthSetting,
  type ThemeMode,
} from '../preview/config';
import { MarkdownPreviewEngine } from '../preview/engine';
import { runMermaid } from '../content/mermaidRunner';
import { mountToolbar, type PreviewMode } from '../content/toolbar';
import {
  isPreviewableFileName,
  isSvgFileName,
  loadLocalDoc,
  PREVIEW_ACCEPT,
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
  loadRecentWorkspaceHandle,
  loadWorkspaceHandle,
  pickWorkspaceDirectory,
  readWorkspaceTextFile,
  removeRecentWorkspaceHandle,
  resolveRelativePath,
  saveWorkspaceHandle,
  type WorkspaceFileEntry,
} from '../shared/workspaceFs';
import { takePendingEnter } from '../shared/pendingEnter';
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
import {
  loadWslFormDefaults,
  parseWslLocation,
  saveWslFormDefaults,
  toWslFileUrl,
  wslConnect,
  wslCreateObjectUrl,
  wslDisconnect,
  wslListDistros,
  wslListMarkdown,
  wslReadText,
  type WslSessionMeta,
} from '../shared/wslClient';
import { isPreviewablePath } from '../shared/wslPaths';
import { attachCodeBlockCopyButtons } from '../shared/codeBlockCopy';
import {
  clearFileTreeExpandState,
  exitCollapsedAllMode,
  prepareFileTreeForWorkspace,
  renderFileTree,
  setWorkspaceChrome,
  wireTreeFoldButton,
} from './workspaceUi';
import { closeContextMenu, showContextMenu, type ContextMenuItem } from './contextMenu';
import { initSidebarUi } from './sidebar';
import { OutlineFloatingPanel, outlinePanelCss } from '../preview/outlinePanel';
import {
  clearAllHistory,
  loadWorkspaceHistory,
  recordFileOpen,
  recordWorkspaceOpen,
  removeFileHistory,
  removeWorkspaceHistory,
  touchWorkspaceLastFile,
  type FileHistoryEntry,
  type WorkspaceHistoryEntry,
} from '../shared/history';
import {
  applyPreviewZoom,
  loadPreviewZoom,
  PREVIEW_ZOOM_DEFAULT,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  savePreviewZoom,
  stepPreviewZoom,
} from '../shared/previewZoom';
import { renderSourceWithLineNumbers } from '../shared/sourceView';
import { refreshHistoryPanel, wireHistoryClearButton } from './historyUi';
import { isOptionsDialogOpen, showOptionsDialog } from './optionsDialog';

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
/** Preview content zoom only (not chrome UI) */
let previewZoom = PREVIEW_ZOOM_DEFAULT;

let workspaceRoot: FileSystemDirectoryHandle | null = null;
/** 'local' = File System Access, 'ssh' | 'wsl' = via local bridge */
let workspaceKind: 'local' | 'ssh' | 'wsl' | null = null;
let sshMeta: SshSessionMeta | null = null;
let wslMeta: WslSessionMeta | null = null;
let workspaceFiles: WorkspaceFileEntry[] = [];
let objectUrls: string[] = [];
let sshPrivateKeyText = '';

/** Beyond Compare-style SVG left/right slots (workspace paths). */
interface SvgCompareSlot {
  path: string;
  name: string;
  content: string;
}
let compareLeft: SvgCompareSlot | null = null;
let compareRight: SvgCompareSlot | null = null;
/** True while the dual-pane SVG compare view is showing. */
let inSvgCompareMode = false;

/**
 * Navigation/render generation. Bumped on every file open and every preview
 * render; async continuations compare against it so a slow read or render
 * that lost the race cannot overwrite the newer document or revoke its
 * freshly-created object URLs.
 */
let navGen = 0;

/** Scroll position of the last rendered preview, keyed by document identity. */
let previewScrollMemo: { key: string; top: number } | null = null;
/** Document identity of the currently rendered preview (for scroll restore). */
let renderedDocKey: string | null = null;

function docKey(): string {
  return currentPath ?? doc?.name ?? '';
}

function previewScroller(): HTMLElement {
  return document.getElementById('ws-content') ?? document.documentElement;
}

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

function applyPreviewWidth(width?: PreviewWidthSetting): void {
  const w = width || settings?.previewWidth || 'wide';
  document.documentElement.dataset.previewWidth = w;
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.dataset.previewWidth = w;
  }
}

async function setPreviewZoom(next: number, persist = true): Promise<void> {
  previewZoom = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, next));
  applyPreviewZoom(previewZoom);
  if (persist) {
    void savePreviewZoom(previewZoom);
  }
  if (doc) {
    mountToolbarExtras();
  }
}

function zoomIn(): void {
  void setPreviewZoom(stepPreviewZoom(previewZoom, 1));
}

function zoomOut(): void {
  void setPreviewZoom(stepPreviewZoom(previewZoom, -1));
}

function zoomReset(): void {
  void setPreviewZoom(PREVIEW_ZOOM_DEFAULT);
}

function wirePreviewZoomShortcuts(): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) {
        return;
      }
      // Only when a document is open (preview or source); compare view pins
      // both panes at 100%, so zoom must not apply there.
      if (!doc || inSvgCompareMode) {
        return;
      }
      const key = e.key;
      if (key === '=' || key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (key === '-' || key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (key === '0') {
        e.preventDefault();
        zoomReset();
      }
    },
    true,
  );

  // Ctrl/Cmd + wheel over preview content only (not sidebar / toolbar)
  document.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || !doc || inSvgCompareMode) {
        return;
      }
      const t = e.target as Node | null;
      if (!t) {
        return;
      }
      const root = document.getElementById(ROOT_ID);
      const source = document.getElementById(SOURCE_ID);
      const content = document.getElementById('ws-content');
      const overContent =
        (root && root.contains(t)) ||
        (source && source.contains(t)) ||
        (content && content.contains(t));
      if (!overContent) {
        return;
      }
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    },
    { passive: false, capture: true },
  );
}

function applyThemeClass(): void {
  const theme = resolveTheme(settings.theme);
  document.documentElement.dataset.theme = theme;
  document.body.classList.toggle('vscode-dark', theme === 'dark');
  document.body.classList.toggle('vscode-light', theme === 'light');
  document.documentElement.classList.add('vscode-md-preview-active');
  document.body.classList.add('vscode-md-preview-active');
  applyPreviewWidth(settings.previewWidth);
}

function workspaceLabel(): string | undefined {
  if (workspaceKind === 'ssh' && sshMeta) {
    return `ssh://${sshMeta.username}@${sshMeta.host}:${sshMeta.port}${sshMeta.root === '.' ? '' : sshMeta.root}`;
  }
  if (workspaceKind === 'wsl' && wslMeta) {
    return `wsl://${wslMeta.distro}${wslMeta.root}`;
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
  wslMeta = null;
  workspaceFiles = [];
  currentPath = undefined;
  doc = null;
  renderedDocKey = null;
  previewScrollMemo = null;
  outlinePanel.close();
  setWorkspaceChrome(false);
  $('empty-state').hidden = false;
  document.getElementById('vscode-md-preview-toolbar')?.remove();
  document.documentElement.classList.remove('vscode-md-preview-active');
  document.body.classList.remove('vscode-md-preview-active');
  setDocumentTitle();
  void refreshHistoryPanel(historyHandlersRef);
}

let pendingHistoryFilePath: string | undefined;

const historyHandlersRef = {
  onOpenWorkspace: (entry: WorkspaceHistoryEntry) => void openHistoryWorkspace(entry),
  onOpenFile: (entry: FileHistoryEntry) => void openHistoryFile(entry),
  onRemoveWorkspace: (id: string) =>
    void (async () => {
      // Also drop the persisted directory handle for removed local entries
      const entry = (await loadWorkspaceHistory()).find((e) => e.id === id);
      await removeWorkspaceHistory(id);
      if (entry?.source === 'local' && entry.localName) {
        try {
          await removeRecentWorkspaceHandle(entry.localName);
        } catch {
          // ignore
        }
      }
      await refreshHistoryPanel(historyHandlersRef);
    })(),
  onRemoveFile: (id: string) =>
    void removeFileHistory(id).then(() => refreshHistoryPanel(historyHandlersRef)),
  onClearAll: () =>
    void clearAllHistory().then(() => refreshHistoryPanel(historyHandlersRef)),
};

/**
 * Reopen a local workspace from its persisted directory handle. The caller's
 * click supplies the user gesture `requestPermission` needs, so this usually
 * costs one "allow access?" confirmation instead of a full folder re-pick.
 * Returns false when no handle is stored or permission was refused.
 */
async function restoreLocalWorkspaceFromHandle(localName?: string): Promise<boolean> {
  if (!localName) {
    return false;
  }
  try {
    const handle = await loadRecentWorkspaceHandle(localName);
    if (!handle) {
      return false;
    }
    if (!(await ensureReadPermission(handle, true))) {
      return false;
    }
    await enterWorkspace(handle);
    return true;
  } catch (e) {
    console.warn('[vscode-md-preview] restore workspace handle failed', e);
    return false;
  }
}

async function openHistoryWorkspace(entry: WorkspaceHistoryEntry): Promise<void> {
  if (entry.source === 'local') {
    pendingHistoryFilePath = entry.lastFilePath;
    if (await restoreLocalWorkspaceFromHandle(entry.localName)) {
      return;
    }
    // No stored handle (cleared site data) or permission refused — re-pick.
    alert(
      entry.localName
        ? `无法直接恢复文件夹「${entry.localName}」的访问权限，请重新选择该文件夹。`
        : '请重新选择本地文件夹。',
    );
    pendingHistoryFilePath = entry.lastFilePath;
    await openWorkspaceFolder();
    return;
  }
  if (entry.source === 'ssh' && entry.ssh) {
    pendingHistoryFilePath = entry.lastFilePath;
    showSshDialog(true);
    // Prefill after dialog opens
    requestAnimationFrame(() => {
      const host = document.getElementById('ssh-host') as HTMLInputElement | null;
      const port = document.getElementById('ssh-port') as HTMLInputElement | null;
      const user = document.getElementById('ssh-user') as HTMLInputElement | null;
      const root = document.getElementById('ssh-root') as HTMLInputElement | null;
      if (host) host.value = entry.ssh!.host;
      if (port) port.value = String(entry.ssh!.port);
      if (user) user.value = entry.ssh!.username;
      if (root) root.value = entry.ssh!.root;
    });
    return;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    pendingHistoryFilePath = entry.lastFilePath;
    // Connect directly if bridge is up
    try {
      const meta = await wslConnect(entry.wsl.distro, entry.wsl.root);
      showWslDialog(false);
      await enterWslWorkspace(meta, entry.lastFilePath);
    } catch (e) {
      alert(
        `无法自动连接 WSL，请在对话框中重试。\n${e instanceof Error ? e.message : String(e)}`,
      );
      showWslDialog(true);
      setWslDialogMode('select');
      requestAnimationFrame(() => {
        const distro = document.getElementById('wsl-distro') as HTMLSelectElement | null;
        const root = document.getElementById('wsl-root') as HTMLInputElement | null;
        if (distro && entry.wsl) {
          // ensure option exists
          if (![...distro.options].some((o) => o.value === entry.wsl!.distro)) {
            const opt = document.createElement('option');
            opt.value = entry.wsl.distro;
            opt.textContent = entry.wsl.distro;
            distro.appendChild(opt);
          }
          distro.value = entry.wsl.distro;
        }
        if (root && entry.wsl) root.value = entry.wsl.root;
      });
    }
  }
}

async function openHistoryFile(entry: FileHistoryEntry): Promise<void> {
  if (entry.source === 'standalone' || !entry.path) {
    alert(`请重新选择文件「${entry.title}」（本地单文件无法自动恢复路径）。`);
    pickFile();
    return;
  }

  // Already in matching workspace?
  if (workspaceKind === 'local' && entry.source === 'local' && workspaceRoot) {
    if (!entry.localName || workspaceRoot.name === entry.localName) {
      await openWorkspaceFile(entry.path);
      return;
    }
  }
  if (workspaceKind === 'ssh' && entry.source === 'ssh' && sshMeta && entry.ssh) {
    if (
      sshMeta.host === entry.ssh.host &&
      sshMeta.port === entry.ssh.port &&
      sshMeta.username === entry.ssh.username &&
      // entry.path is relative to the entry's root — a session on the same
      // host with a different root would resolve it to the wrong file.
      sshMeta.root === entry.ssh.root
    ) {
      await openWorkspaceFile(entry.path);
      return;
    }
  }
  if (workspaceKind === 'wsl' && entry.source === 'wsl' && wslMeta && entry.wsl) {
    if (wslMeta.distro === entry.wsl.distro && wslMeta.root === entry.wsl.root) {
      await openWorkspaceFile(entry.path);
      return;
    }
  }

  // Reconnect then open
  if (entry.source === 'ssh' && entry.ssh) {
    pendingHistoryFilePath = entry.path;
    showSshDialog(true);
    requestAnimationFrame(() => {
      const host = document.getElementById('ssh-host') as HTMLInputElement | null;
      const port = document.getElementById('ssh-port') as HTMLInputElement | null;
      const user = document.getElementById('ssh-user') as HTMLInputElement | null;
      const root = document.getElementById('ssh-root') as HTMLInputElement | null;
      if (host) host.value = entry.ssh!.host;
      if (port) port.value = String(entry.ssh!.port);
      if (user) user.value = entry.ssh!.username;
      if (root) root.value = entry.ssh!.root;
    });
    return;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    pendingHistoryFilePath = entry.path;
    try {
      const meta = await wslConnect(entry.wsl.distro, entry.wsl.root);
      await enterWslWorkspace(meta, entry.path);
    } catch (e) {
      alert(`无法打开历史文件。\n${e instanceof Error ? e.message : String(e)}`);
      showWslDialog(true);
      setWslDialogMode('select');
      requestAnimationFrame(() => {
        const distro = document.getElementById('wsl-distro') as HTMLSelectElement | null;
        const root = document.getElementById('wsl-root') as HTMLInputElement | null;
        if (distro && entry.wsl) {
          if (![...distro.options].some((o) => o.value === entry.wsl!.distro)) {
            const opt = document.createElement('option');
            opt.value = entry.wsl.distro;
            opt.textContent = entry.wsl.distro;
            distro.appendChild(opt);
          }
          distro.value = entry.wsl.distro;
        }
        if (root && entry.wsl) root.value = entry.wsl.root;
      });
    }
    return;
  }
  if (entry.source === 'local') {
    pendingHistoryFilePath = entry.path;
    if (await restoreLocalWorkspaceFromHandle(entry.localName)) {
      return;
    }
    alert(
      entry.localName
        ? `请先打开本地文件夹「${entry.localName}」，再选择文件 ${entry.path}`
        : `请先打开对应工作区，再选择文件 ${entry.path}`,
    );
    pendingHistoryFilePath = entry.path;
    await openWorkspaceFolder();
  }
}

function updatePathBar(): void {
  const pathEl = document.getElementById('ws-current-path');
  const countEl = document.getElementById('ws-file-count');
  if (pathEl) {
    if (inSvgCompareMode && compareLeft && compareRight) {
      pathEl.textContent = `比较: ${compareLeft.name}  |  ${compareRight.name}`;
      pathEl.title = `L: ${compareLeft.path}\nR: ${compareRight.path}`;
    } else if (compareLeft || compareRight) {
      const l = compareLeft ? `L=${compareLeft.name}` : 'L=?';
      const r = compareRight ? `R=${compareRight.name}` : 'R=?';
      pathEl.textContent =
        currentPath ?? (doc ? doc.name : '选择左侧 Markdown / SVG 文件开始预览');
      pathEl.title = `比较选择: ${l} · ${r}（右键 SVG 继续选择）`;
    } else {
      pathEl.textContent =
        currentPath ?? (doc ? doc.name : '选择左侧 Markdown / SVG 文件开始预览');
      pathEl.title = pathEl.textContent;
    }
  }
  if (countEl) {
    const n = workspaceFiles.length;
    let extra = '';
    if (compareLeft || compareRight) {
      extra = ` · 比较 ${compareLeft ? 'L' : ''}${compareLeft && compareRight ? '+' : ''}${compareRight ? 'R' : ''}`;
    }
    countEl.textContent = n ? `${n} 个文件${extra}` : extra.trim();
  }
}

function currentWorkspaceExpandKey(): string | null {
  if (workspaceKind === 'local' && workspaceRoot) {
    return `local:${workspaceRoot.name}`;
  }
  if (workspaceKind === 'ssh' && sshMeta) {
    return `ssh:${sshMeta.username}@${sshMeta.host}:${sshMeta.port}:${sshMeta.root}`;
  }
  if (workspaceKind === 'wsl' && wslMeta) {
    return `wsl:${wslMeta.distro}:${wslMeta.root}`;
  }
  return null;
}

function refreshTree(): void {
  const treeEl = document.getElementById('ws-file-tree');
  if (!treeEl) {
    return;
  }
  const tree = buildFileTree(workspaceFiles);
  renderFileTree(
    treeEl,
    tree,
    inSvgCompareMode ? undefined : currentPath,
    {
      onOpenFile: (path) => void openWorkspaceFile(path),
      onFileContextMenu: (info) => void handleFileContextMenu(info),
    },
    {
      leftPath: compareLeft?.path,
      rightPath: compareRight?.path,
    },
  );
  updatePathBar();
}

/** Load per-workspace expand memory then paint the tree. */
async function prepareAndRefreshTree(): Promise<void> {
  const key = currentWorkspaceExpandKey();
  if (key) {
    await prepareFileTreeForWorkspace(key);
  }
  refreshTree();
}

/** Read a workspace file's text without switching the active preview doc. */
async function readWorkspaceText(path: string): Promise<string | null> {
  try {
    if (workspaceKind === 'ssh') {
      return await sshReadText(path);
    }
    if (workspaceKind === 'wsl') {
      return await wslReadText(path);
    }
    if (workspaceRoot) {
      const result = await readWorkspaceTextFile(workspaceRoot, path);
      return result?.text ?? null;
    }
  } catch (e) {
    console.error(e);
    alert(`无法读取文件: ${path}\n${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

async function loadCompareSlot(path: string): Promise<SvgCompareSlot | null> {
  if (!isSvgFileName(path)) {
    alert('仅支持对 .svg 文件做左右比较');
    return null;
  }
  const content = await readWorkspaceText(path);
  if (content === null) {
    return null;
  }
  return {
    path,
    name: path.split('/').pop() || path,
    content,
  };
}

function clearCompareSelection(): void {
  resetCompareState();
  refreshTree();
}

/** Drop compare slots without re-rendering (workspace switch / close). */
function resetCompareState(): void {
  compareLeft = null;
  compareRight = null;
  inSvgCompareMode = false;
}

async function setCompareSide(side: 'left' | 'right', path: string): Promise<void> {
  const slot = await loadCompareSlot(path);
  if (!slot) {
    return;
  }
  if (side === 'left') {
    compareLeft = slot;
  } else {
    compareRight = slot;
  }
  refreshTree();
  // When both sides ready, open compare (Beyond Compare "both selected")
  if (compareLeft && compareRight) {
    await openSvgCompareView();
  }
}

/** Mark this path as right and compare against the current left (BC "Compare to Left"). */
async function comparePathToLeft(path: string): Promise<void> {
  if (!compareLeft) {
    alert('请先右键另一个 SVG，选择「选为左侧文件」');
    return;
  }
  const slot = await loadCompareSlot(path);
  if (!slot) {
    return;
  }
  compareRight = slot;
  refreshTree();
  await openSvgCompareView();
}

async function handleFileContextMenu(info: {
  path: string;
  name: string;
  clientX: number;
  clientY: number;
}): Promise<void> {
  const isSvg = isSvgFileName(info.path);
  const items: ContextMenuItem[] = [
    { id: 'open', label: '打开' },
  ];

  if (isSvg) {
    items.push(
      { id: 'left', label: '选为左侧文件', separatorBefore: true },
      { id: 'right', label: '选为右侧文件' },
    );
    if (compareLeft && compareLeft.path !== info.path) {
      items.push({
        id: 'compare-to-left',
        label: `与左侧比较: ${compareLeft.name}`,
      });
    }
    if (compareRight && compareRight.path !== info.path) {
      items.push({
        id: 'compare-to-right',
        label: `与右侧比较: ${compareRight.name}`,
      });
    }
    if (compareLeft && compareRight) {
      items.push({
        id: 'open-compare',
        label: '打开左右比较',
        separatorBefore: true,
      });
    }
    if (compareLeft || compareRight) {
      items.push({
        id: 'clear-compare',
        label: '清除比较选择',
        separatorBefore: !compareLeft || !compareRight,
        danger: true,
      });
    }
  }

  const choice = await showContextMenu(info.clientX, info.clientY, items);
  if (!choice) {
    return;
  }
  switch (choice) {
    case 'open':
      await openWorkspaceFile(info.path);
      break;
    case 'left':
      await setCompareSide('left', info.path);
      break;
    case 'right':
      await setCompareSide('right', info.path);
      break;
    case 'compare-to-left':
      await comparePathToLeft(info.path);
      break;
    case 'compare-to-right': {
      // Treat current as left, existing right stays
      const slot = await loadCompareSlot(info.path);
      if (slot && compareRight) {
        compareLeft = slot;
        refreshTree();
        await openSvgCompareView();
      }
      break;
    }
    case 'open-compare':
      if (compareLeft && compareRight) {
        await openSvgCompareView();
      }
      break;
    case 'clear-compare':
      clearCompareSelection();
      if (!doc) {
        setEmptyPreviewVisible(true);
        $(ROOT_ID).hidden = true;
      } else {
        await showPreviewView();
      }
      break;
    default:
      break;
  }
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
  await prepareAndRefreshTree();

  setEmptyPreviewVisible(true);
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

  // Leaving remote sessions if any
  if (workspaceKind === 'ssh') {
    void sshDisconnect();
    sshMeta = null;
  }
  if (workspaceKind === 'wsl') {
    void wslDisconnect();
    wslMeta = null;
  }

  resetCompareState();
  workspaceRoot = root;
  workspaceKind = 'local';
  workspaceFiles = await listMarkdownFiles(root);
  const pending = preferredPath ?? pendingHistoryFilePath;
  pendingHistoryFilePath = undefined;
  await saveWorkspaceHandle(root, pending);
  void recordWorkspaceOpen({
    source: 'local',
    title: root.name,
    subtitle: '本地文件夹',
    localName: root.name,
    lastFilePath: pending,
  });
  await showWorkspaceShell(root.name, pending);
}

async function enterSshWorkspace(meta: SshSessionMeta, preferredPath?: string): Promise<void> {
  if (workspaceKind === 'wsl') {
    void wslDisconnect();
  }
  resetCompareState();
  workspaceRoot = null;
  workspaceKind = 'ssh';
  sshMeta = meta;
  wslMeta = null;
  try {
    await clearWorkspace();
  } catch {
    // ignore
  }
  workspaceFiles = await sshListMarkdown();
  const title = `${meta.username}@${meta.host}`;
  const ssh = {
    host: meta.host,
    port: meta.port,
    username: meta.username,
    root: meta.root,
  };
  const pending = preferredPath ?? pendingHistoryFilePath;
  pendingHistoryFilePath = undefined;
  void recordWorkspaceOpen({
    source: 'ssh',
    title,
    subtitle: `${meta.root} · :${meta.port}`,
    ssh,
    lastFilePath: pending,
  });
  await showWorkspaceShell(`${title}:${meta.root}`, pending);
}

async function enterWslWorkspace(meta: WslSessionMeta, preferredPath?: string): Promise<void> {
  if (workspaceKind === 'ssh') {
    void sshDisconnect();
    sshMeta = null;
  }
  resetCompareState();
  workspaceRoot = null;
  workspaceKind = 'wsl';
  wslMeta = meta;
  sshMeta = null;
  try {
    await clearWorkspace();
  } catch {
    // ignore
  }
  workspaceFiles = await wslListMarkdown();
  const title = `wsl://${meta.distro}`;
  const pending = preferredPath ?? pendingHistoryFilePath;
  pendingHistoryFilePath = undefined;
  void recordWorkspaceOpen({
    source: 'wsl',
    title,
    subtitle: meta.root,
    wsl: { distro: meta.distro, root: meta.root },
    lastFilePath: pending,
  });
  await showWorkspaceShell(`${title}${meta.root}`, pending);
}

async function openWorkspaceFolder(): Promise<void> {
  try {
    const root = await pickWorkspaceDirectory();
    await enterWorkspace(root);
  } catch (e) {
    // Cancelled/failed: drop any queued history file path so it cannot leak
    // into the next, unrelated workspace open.
    pendingHistoryFilePath = undefined;
    if (e instanceof DOMException && e.name === 'AbortError') {
      return;
    }
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Resume after extension popup configured a workspace/file (no blank intermediate page).
 * SSH/WSL session already lives on the local bridge.
 */
async function resumePendingEnterFromPopup(): Promise<void> {
  const pending = await takePendingEnter();
  if (!pending) {
    return;
  }
  try {
    if (pending.kind === 'local') {
      const handle = await loadWorkspaceHandle();
      if (!handle) {
        alert('未找到已选择的工作区文件夹，请重新打开。');
        return;
      }
      await enterWorkspace(handle);
      return;
    }
    if (pending.kind === 'doc') {
      const docPayload = await loadLocalDoc();
      if (!docPayload) {
        alert('未找到已打开的 Markdown 文件，请重新选择。');
        return;
      }
      await openSingleDoc(docPayload);
      return;
    }
    if (pending.kind === 'ssh') {
      const health = await sshHealth();
      if (!health.ok || !health.connected || !health.meta) {
        alert('SSH 会话不可用。请确认 Bridge 仍在运行，并在弹窗中重新连接。');
        showSshDialog(true);
        return;
      }
      await enterSshWorkspace(health.meta);
      return;
    }
    if (pending.kind === 'wsl') {
      const health = await sshHealth();
      if (!health.ok || !health.wslConnected || !health.wslMeta) {
        alert('WSL 会话不可用。请确认 Bridge 仍在运行，并在弹窗中重新连接。');
        showWslDialog(true);
        return;
      }
      await enterWslWorkspace(health.wslMeta, pending.preferredPath);
    }
  } catch (e) {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }
}

async function openWorkspaceFile(path: string): Promise<void> {
  // Single-file open leaves dual-pane compare (selection badges stay)
  if (inSvgCompareMode) {
    inSvgCompareMode = false;
  }
  closeContextMenu();

  // Last click wins: a slower read that resolves after a newer navigation
  // must not overwrite the newer document.
  const gen = ++navGen;

  if (workspaceKind === 'ssh') {
    try {
      const text = await sshReadText(path);
      if (gen !== navGen) {
        return;
      }
      currentPath = path;
      doc = {
        name: path.split('/').pop() || path,
        content: text,
        openedAt: Date.now(),
        size: text.length,
      };
    } catch (e) {
      if (gen !== navGen) {
        return;
      }
      alert(`无法读取远程文件: ${path}\n${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  } else if (workspaceKind === 'wsl') {
    try {
      const text = await wslReadText(path);
      if (gen !== navGen) {
        return;
      }
      currentPath = path;
      doc = {
        name: path.split('/').pop() || path,
        content: text,
        openedAt: Date.now(),
        size: text.length,
      };
    } catch (e) {
      if (gen !== navGen) {
        return;
      }
      alert(`无法读取 WSL 文件: ${path}\n${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  } else if (workspaceRoot) {
    const result = await readWorkspaceTextFile(workspaceRoot, path);
    if (gen !== navGen) {
      return;
    }
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

  // A stale in-page anchor must not re-scroll the next file (ids may collide).
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  await saveLocalDoc(doc);
  if (gen !== navGen) {
    return;
  }
  setDocumentTitle(doc.name);
  // Reveal active file folders; leave pure collapse-all so ancestors can open
  exitCollapsedAllMode();
  refreshTree();
  setEmptyPreviewVisible(false);

  // History + last session: file + workspace last path
  const fileName = doc.name;
  if (workspaceKind === 'local' && workspaceRoot) {
    void recordFileOpen({
      source: 'local',
      title: fileName,
      path,
      workspaceTitle: workspaceRoot.name,
      localName: workspaceRoot.name,
    });
    void touchWorkspaceLastFile(
      { source: 'local', localName: workspaceRoot.name },
      path,
    );
  } else if (workspaceKind === 'ssh' && sshMeta) {
    const ssh = {
      host: sshMeta.host,
      port: sshMeta.port,
      username: sshMeta.username,
      root: sshMeta.root,
    };
    void recordFileOpen({
      source: 'ssh',
      title: fileName,
      path,
      workspaceTitle: `${sshMeta.username}@${sshMeta.host}`,
      ssh,
    });
    void touchWorkspaceLastFile({ source: 'ssh', ssh }, path);
  } else if (workspaceKind === 'wsl' && wslMeta) {
    const wsl = { distro: wslMeta.distro, root: wslMeta.root };
    void recordFileOpen({
      source: 'wsl',
      title: fileName,
      path,
      workspaceTitle: `wsl://${wslMeta.distro}`,
      wsl,
    });
    void touchWorkspaceLastFile({ source: 'wsl', wsl }, path);
  }

  await showPreviewView();
}

/**
 * Resolve relative images against local FS or SSH bridge.
 */
async function resolveWorkspaceAssets(
  rootEl: HTMLElement,
  isStale?: () => boolean,
): Promise<void> {
  if (
    !currentPath ||
    (workspaceKind !== 'local' && workspaceKind !== 'ssh' && workspaceKind !== 'wsl')
  ) {
    return;
  }
  if (workspaceKind === 'local' && !workspaceRoot) {
    return;
  }
  revokeObjectUrls();

  const imgs = rootEl.querySelectorAll('img');
  for (const img of imgs) {
    // A newer render owns objectUrls now — stop before pushing stale blobs.
    if (isStale?.()) {
      return;
    }
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
    } else if (workspaceKind === 'wsl') {
      url = await wslCreateObjectUrl(resolved);
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
 * Intercept clicks on relative .md / .svg links to open within the workspace.
 * Bound once on the content host (not per render).
 */
function onPreviewClick(e: MouseEvent): void {
  const a = (e.target as HTMLElement).closest('a');
  if (!a || !currentPath) {
    return;
  }
  if (workspaceKind !== 'local' && workspaceKind !== 'ssh' && workspaceKind !== 'wsl') {
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
  if (!isPreviewableFileName(pathOnly)) {
    return;
  }
  e.preventDefault();
  const targetPath = resolveRelativePath(currentPath, pathOnly);
  const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
  void openWorkspaceFile(targetPath).then(() => {
    if (hash && !isSvgFileName(pathOnly)) {
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
  const root = $(ROOT_ID);
  // Remember the preview reading position so toggling back does not jump to top
  if (!root.hidden && renderedDocKey === docKey()) {
    previewScrollMemo = { key: docKey(), top: previewScroller().scrollTop };
  }
  // Unpinned outline closes in source mode; pinned stays (list still useful)
  if (outlinePanel.isOpen && !outlinePanel.isPinned) {
    outlinePanel.close();
  }
  root.hidden = true;

  const sourceEl = $(SOURCE_ID);
  sourceEl.hidden = false;
  renderSourceWithLineNumbers(sourceEl, doc.content);

  applyThemeClass();
  applyPreviewZoom(previewZoom);
  mountToolbarExtras();
}

function setEmptyPreviewVisible(visible: boolean): void {
  const emptyPrev = document.getElementById('ws-empty-preview');
  if (emptyPrev) {
    emptyPrev.hidden = !visible;
  }
}

/** Scroll host for tall SVG: compare pane scroller or workbench content. */
function findSvgScrollParent(frame: HTMLElement): HTMLElement {
  const pane = frame.closest('.svg-compare-pane-scroll');
  if (pane instanceof HTMLElement) {
    return pane;
  }
  return document.getElementById('ws-content') ?? document.documentElement;
}

/**
 * Mount an interactive SVG into a host via the extension sandbox page
 * (relaxed CSP so FlameGraph click-zoom scripts run).
 *
 * Tall SVGs expand the iframe height; scrolling happens on the outer pane
 * (not inside the iframe) so moving the mouse away does not reset position.
 */
function mountSvgSandboxFrame(
  host: HTMLElement,
  title: string,
  svgContent: string,
): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.className = 'svg-preview-frame';
  frame.title = title;
  // Do NOT set the HTML sandbox attr — the page is already an extension sandbox.
  frame.setAttribute('referrerpolicy', 'no-referrer');
  // Fill the pane until the sandbox reports the real content width
  // (avoids the HTML iframe intrinsic 300px without forcing a wide canvas).
  frame.style.width = '100%';
  frame.style.minWidth = '100%';
  frame.style.height = '50vh';
  frame.src = chrome.runtime.getURL('viewer/svg-sandbox.html');

  let posted = false;
  const postSvg = (): void => {
    if (posted) {
      return;
    }
    if (!frame.contentWindow) {
      return;
    }
    posted = true;
    try {
      frame.contentWindow.postMessage({ type: 'load-svg', content: svgContent }, '*');
    } catch (e) {
      console.error('[svg-preview] postMessage failed', e);
      posted = false;
    }
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== frame.contentWindow) {
      return;
    }
    const data = event.data as
      | {
          type?: string;
          width?: number;
          height?: number;
          deltaX?: number;
          deltaY?: number;
          deltaMode?: number;
          shiftKey?: boolean;
          ctrlKey?: boolean;
          metaKey?: boolean;
        }
      | null;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type === 'svg-sandbox-ready') {
      postSvg();
      return;
    }

    if (data.type === 'svg-sandbox-size') {
      if (typeof data.height === 'number') {
        frame.style.height = `${Math.max(1, Math.ceil(data.height))}px`;
      }
      if (typeof data.width === 'number' && data.width > 0) {
        // Use the measured content width as-is. The sandbox itself falls back
        // to 1200 only when the SVG has no absolute width, so small SVGs keep
        // their natural size (minWidth still fills the pane) and wide flame
        // graphs get a horizontal scrollbar.
        frame.style.width = `${Math.ceil(data.width)}px`;
        frame.style.minWidth = '100%';
        frame.style.maxWidth = 'none';
      }
      return;
    }

    if (data.type === 'svg-sandbox-wheel') {
      // Ctrl/Cmd+wheel zooms, matching the markdown preview shortcut
      // (compare view stays pinned at 100%).
      if ((data.ctrlKey || data.metaKey) && !inSvgCompareMode && doc) {
        const dy = Number(data.deltaY) || 0;
        if (dy < 0) zoomIn();
        else if (dy > 0) zoomOut();
        return;
      }
      const scroller = findSvgScrollParent(frame);
      let dx = Number(data.deltaX) || 0;
      let dy = Number(data.deltaY) || 0;
      const mode = Number(data.deltaMode) || 0;
      // 0: pixel, 1: line, 2: page
      if (mode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (mode === 2) {
        dx *= scroller.clientWidth;
        dy *= scroller.clientHeight;
      }
      // Shift+wheel → horizontal (common trackpad/mouse convention)
      if (data.shiftKey && dx === 0 && dy !== 0) {
        scroller.scrollLeft += dy;
      } else {
        scroller.scrollLeft += dx;
        scroller.scrollTop += dy;
      }
    }
  };

  window.addEventListener('message', onMessage);

  // Drop listener when the frame is removed (file switch / close compare)
  const mo = new MutationObserver(() => {
    if (!frame.isConnected) {
      window.removeEventListener('message', onMessage);
      mo.disconnect();
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  frame.addEventListener(
    'load',
    () => {
      // Fallback if ready message was missed
      window.setTimeout(() => postSvg(), 80);
    },
    { once: true },
  );

  host.appendChild(frame);
  return frame;
}

/**
 * Interactive SVG preview (FlameGraph click-zoom / search).
 */
function showSvgPreview(root: HTMLElement): void {
  revokeObjectUrls();

  // SVG uses the full pane — no markdown column padding/max-width
  root.className = 'vscode-md-preview-root is-svg-preview';
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.previewWidth = 'full';
  applyPreviewWidth('full');
  applyPreviewZoom(previewZoom);

  root.replaceChildren();
  mountSvgSandboxFrame(root, doc!.name, doc!.content);

  if (outlinePanel.isOpen) {
    outlinePanel.close();
  }
}

function buildComparePane(side: 'left' | 'right', slot: SvgCompareSlot): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'svg-compare-pane';

  const bar = document.createElement('div');
  bar.className = 'svg-compare-pane-bar';
  const tag = document.createElement('span');
  tag.className = `side-tag ${side}`;
  tag.textContent = side === 'left' ? 'Left' : 'Right';
  const pathEl = document.createElement('span');
  pathEl.className = 'side-path';
  pathEl.textContent = slot.path;
  pathEl.title = slot.path;
  bar.append(tag, pathEl);

  const scroll = document.createElement('div');
  scroll.className = 'svg-compare-pane-scroll';
  mountSvgSandboxFrame(scroll, slot.name, slot.content);

  pane.append(bar, scroll);
  return pane;
}

/**
 * Side-by-side SVG viewers (no content diff) — Beyond Compare-style dual pane.
 */
async function openSvgCompareView(): Promise<void> {
  if (!compareLeft || !compareRight) {
    return;
  }
  injectStyles();
  applyThemeClass();
  inSvgCompareMode = true;
  setEmptyPreviewVisible(false);
  $(SOURCE_ID).hidden = true;

  const root = $(ROOT_ID);
  root.hidden = false;
  revokeObjectUrls();

  root.className = 'vscode-md-preview-root is-svg-compare';
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.previewWidth = 'full';
  applyPreviewWidth('full');
  // Keep both panes at 100% so each FlameGraph has stable layout
  applyPreviewZoom(1);

  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'svg-compare';

  const toolbar = document.createElement('div');
  toolbar.className = 'svg-compare-toolbar';
  const title = document.createElement('span');
  title.className = 'svg-compare-title';
  title.textContent = `SVG Compare · ${compareLeft.name}  ↔  ${compareRight.name}`;
  title.title = `L: ${compareLeft.path}\nR: ${compareRight.path}`;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '关闭比较';
  closeBtn.title = '关闭并排比较（保留 L/R 选择）';
  closeBtn.addEventListener('click', () => void closeSvgCompareView());
  toolbar.append(title, closeBtn);

  const panes = document.createElement('div');
  panes.className = 'svg-compare-panes';
  panes.append(
    buildComparePane('left', compareLeft),
    buildComparePane('right', compareRight),
  );

  wrap.append(toolbar, panes);
  root.appendChild(wrap);

  if (outlinePanel.isOpen) {
    outlinePanel.close();
  }
  document.getElementById('vscode-md-preview-toolbar')?.remove();
  refreshTree();
  setDocumentTitle(`${compareLeft.name} ↔ ${compareRight.name}`);
}

async function closeSvgCompareView(): Promise<void> {
  inSvgCompareMode = false;
  if (doc) {
    setDocumentTitle(doc.name);
    await showPreviewView();
  } else {
    $(ROOT_ID).hidden = true;
    $(ROOT_ID).replaceChildren();
    setEmptyPreviewVisible(true);
    setDocumentTitle();
  }
  refreshTree();
}

async function showPreviewView(): Promise<void> {
  if (!doc) {
    return;
  }
  const gen = ++navGen;
  const root = $(ROOT_ID);

  // Keep the reading position across re-renders of the same document
  // (source→preview toggle, settings change).
  if (!root.hidden && renderedDocKey === docKey()) {
    previewScrollMemo = { key: docKey(), top: previewScroller().scrollTop };
  }

  mode = 'preview';
  injectStyles();
  applyThemeClass();

  // Always hide the placeholder once we have document content
  setEmptyPreviewVisible(false);

  const pre = $(SOURCE_ID);
  pre.hidden = true;

  root.hidden = false;

  if (isSvgFileName(doc.name)) {
    showSvgPreview(root);
    renderedDocKey = docKey();
    mountToolbarExtras();
    return;
  }

  root.className = 'vscode-md-preview-root';
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.previewWidth = settings.previewWidth || 'wide';
  applyPreviewWidth(settings.previewWidth);
  applyPreviewZoom(previewZoom);

  engine.updateSettings(settings);
  // documentBase unused for workspace assets (resolved after render)
  const rendered = engine.render(doc.content, undefined);
  root.innerHTML = rendered.html;
  attachCodeBlockCopyButtons(root);

  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  if (gen !== navGen) {
    return;
  }
  await resolveWorkspaceAssets(root, () => gen !== navGen);
  if (gen !== navGen) {
    return;
  }

  if (rendered.hasMermaid && settings.mermaidEnabled) {
    await runMermaid(root, {
      isDark: resolveTheme(settings.theme) === 'dark',
      mermaidTheme: settings.mermaidTheme,
    });
    if (gen !== navGen) {
      return;
    }
  }

  // Refresh floating outline if open (especially when pinned across files)
  if (outlinePanel.isOpen) {
    outlinePanel.updateFromDom(root);
  }

  mountToolbarExtras();

  renderedDocKey = docKey();
  if (previewScrollMemo && previewScrollMemo.key === docKey()) {
    previewScroller().scrollTop = previewScrollMemo.top;
    previewScrollMemo = null;
  }
}

function mountToolbarExtras(): void {
  if (!doc) {
    return;
  }
  const svg = isSvgFileName(doc.name);
  mountToolbar(mode, {
    onToggleMode: (m) => void setMode(m),
    onOpenOptions: () => showOptionsDialog(true),
    onToggleOutline:
      !svg && mode === 'preview'
        ? () => {
            const root = document.getElementById(ROOT_ID);
            outlinePanel.toggle(root);
          }
        : undefined,
    outlineOpen: outlinePanel.isOpen,
    onOpenFile: () => pickFile(),
    onOpenFolder: () => void openWorkspaceFolder(),
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onZoomReset: () => zoomReset(),
    zoom: previewZoom,
  });
}

async function setMode(next: PreviewMode): Promise<void> {
  if (next === 'source') {
    showSourceView();
  } else {
    await showPreviewView();
  }
}

async function openSingleDoc(
  next: LocalMarkdownDoc,
  opts?: { skipHistory?: boolean },
): Promise<void> {
  const inWorkspace = Boolean(
    workspaceRoot || workspaceKind === 'ssh' || workspaceKind === 'wsl',
  );

  doc = next;
  currentPath = undefined;
  await saveLocalDoc(next);
  setDocumentTitle(next.name);

  if (!opts?.skipHistory) {
    void recordFileOpen({
      source: 'standalone',
      title: next.name,
    });
  }

  if (!inWorkspace) {
    // True single-file mode — remember so next open does not force a workspace
    setWorkspaceChrome(true, next.name);
    const treeEl = document.getElementById('ws-file-tree');
    if (treeEl) {
      treeEl.innerHTML =
        '<p style="padding:12px;opacity:0.6;font-size:12px;line-height:1.4">当前为单文件预览。<br/>可打开本地文件夹、SSH 或 WSL 工作区。</p>';
    }
    $('empty-state').hidden = true;
    const emptyPrev = document.getElementById('ws-empty-preview');
    if (emptyPrev) {
      emptyPrev.hidden = true;
    }
  } else {
    // Keep workspace chrome / last-session; file is a transient view without path
    refreshTree();
  }
  updatePathBar();
  await showPreviewView();
}

async function openFile(file: File): Promise<void> {
  if (
    !isPreviewableFileName(file.name) &&
    file.type &&
    !/markdown|text\/plain|text\/|svg/i.test(file.type)
  ) {
    alert(`不支持的文件类型: ${file.name}`);
    return;
  }
  if (
    !isPreviewableFileName(file.name) &&
    !file.type &&
    !/\.(md|markdown|mdown|mkd|mdx|txt|svg)$/i.test(file.name)
  ) {
    alert(`不支持的文件类型: ${file.name}`);
    return;
  }
  const next = await readFileAsLocalDoc(file);
  await openSingleDoc(next);
}

function pickFile(): void {
  const input = $('file-input') as HTMLInputElement;
  input.accept = PREVIEW_ACCEPT;
  input.value = '';
  input.click();
}

function wireUi(): void {
  const dropzone = $('dropzone');
  const empty = $('empty-state');

  $('btn-open').addEventListener('click', () => pickFile());
  $('btn-open-folder')?.addEventListener('click', () => void openWorkspaceFolder());
  $('btn-open-ssh')?.addEventListener('click', () => showSshDialog(true));
  $('btn-open-wsl')?.addEventListener('click', () => showWslDialog(true));
  $('btn-options').addEventListener('click', () => showOptionsDialog(true));

  $('ws-btn-refresh')?.addEventListener('click', () => void refreshWorkspace());
  wireTreeFoldButton({
    getTree: () => buildFileTree(workspaceFiles),
    onChanged: () => refreshTree(),
  });
  $('ws-btn-open-file')?.addEventListener('click', () => pickFile());
  $('ws-btn-change-folder')?.addEventListener('click', () => {
    if (workspaceKind === 'ssh') {
      showSshDialog(true);
    } else if (workspaceKind === 'wsl') {
      showWslDialog(true);
    } else {
      void openWorkspaceFolder();
    }
  });
  $('ws-btn-close')?.addEventListener('click', () => void closeWorkspace());

  // SSH dialog wiring. Cancel also drops any queued history file path —
  // otherwise it would attach to the next unrelated workspace open.
  const cancelSshDialog = (): void => {
    pendingHistoryFilePath = undefined;
    showSshDialog(false);
  };
  document.getElementById('ssh-cancel')?.addEventListener('click', cancelSshDialog);
  document.querySelector('[data-ssh-dismiss]')?.addEventListener('click', cancelSshDialog);
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

  // WSL dialog wiring
  const cancelWslDialog = (): void => {
    pendingHistoryFilePath = undefined;
    showWslDialog(false);
  };
  document.getElementById('wsl-cancel')?.addEventListener('click', cancelWslDialog);
  document.querySelector('[data-wsl-dismiss]')?.addEventListener('click', cancelWslDialog);
  document.getElementById('wsl-connect')?.addEventListener('click', () => void connectWslFromDialog());
  document.getElementById('wsl-open-file')?.addEventListener('click', () => void openWslFileInTab());
  document.getElementById('wsl-mode-select')?.addEventListener('click', () => setWslDialogMode('select'));
  document.getElementById('wsl-mode-paste')?.addEventListener('click', () => setWslDialogMode('paste'));

  // Dropzone is drag-target only; explicit buttons open folder/file (avoids mis-clicks)

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

  initSidebarUi();
  wireModalKeyboard();
  wireHistoryClearButton(historyHandlersRef);
  void refreshHistoryPanel(historyHandlersRef);

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
    } else if (workspaceKind === 'wsl') {
      workspaceFiles = await wslListMarkdown();
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
  // Clear state BEFORE re-rendering the tree/path bar so no stale file name,
  // source view, or toolbar survives when the current file disappeared.
  if (currentPath && !workspaceFiles.some((f) => f.path === currentPath)) {
    currentPath = undefined;
    doc = null;
    $(ROOT_ID).hidden = true;
    $(SOURCE_ID).hidden = true;
    document.getElementById('vscode-md-preview-toolbar')?.remove();
    outlinePanel.close();
    setEmptyPreviewVisible(true);
    setDocumentTitle();
  }
  // Same workspace: keep expand memory, just re-list files
  refreshTree();
}

async function closeWorkspace(): Promise<void> {
  if (workspaceKind === 'ssh') {
    await sshDisconnect();
  }
  if (workspaceKind === 'wsl') {
    await wslDisconnect();
  }
  // Keep local FS handle in IndexedDB so the next workbench open can restore
  // the same folder + last file. Remote sessions only disconnect.
  if (workspaceKind !== 'local') {
    try {
      await clearWorkspace();
    } catch {
      // ignore
    }
  }
  revokeObjectUrls();
  outlinePanel.close();
  clearFileTreeExpandState();
  compareLeft = null;
  compareRight = null;
  inSvgCompareMode = false;
  closeContextMenu();
  showEmpty();
}

/** Focus first focusable control inside a dialog card */
function focusDialog(dialogId: string): void {
  const dlg = document.getElementById(dialogId);
  if (!dlg || dlg.hidden) {
    return;
  }
  const focusable = dlg.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  // Prefer first text/select field over cancel
  const preferred =
    dlg.querySelector<HTMLElement>(
      'select:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="file"])',
    ) ?? focusable;
  preferred?.focus({ preventScroll: true });
}

function wireModalKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') {
      // Enter to submit focused dialog
      if (e.key === 'Enter' && !e.isComposing) {
        const t = e.target as HTMLElement;
        if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') {
          return;
        }
        const wsl = document.getElementById('wsl-dialog');
        const ssh = document.getElementById('ssh-dialog');
        if (wsl && !wsl.hidden && wsl.contains(t)) {
          e.preventDefault();
          void connectWslFromDialog();
          return;
        }
        if (ssh && !ssh.hidden && ssh.contains(t)) {
          e.preventDefault();
          void connectSshFromDialog();
        }
      }
      return;
    }
    if (isOptionsDialogOpen()) {
      e.preventDefault();
      showOptionsDialog(false);
      return;
    }
    const wsl = document.getElementById('wsl-dialog');
    if (wsl && !wsl.hidden) {
      e.preventDefault();
      pendingHistoryFilePath = undefined;
      showWslDialog(false);
      return;
    }
    const ssh = document.getElementById('ssh-dialog');
    if (ssh && !ssh.hidden) {
      e.preventDefault();
      pendingHistoryFilePath = undefined;
      showSshDialog(false);
    }
  });
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
      requestAnimationFrame(() => focusDialog('ssh-dialog'));
    })();
  }
}

function setSshAuthMode(mode: 'password' | 'key'): void {
  const pw = document.getElementById('ssh-password-row');
  const key = document.getElementById('ssh-key-row');
  if (pw) pw.hidden = mode !== 'password';
  if (key) key.hidden = mode !== 'key';
}

/* —— WSL dialog —— */

type WslDialogMode = 'select' | 'paste';

function getWslDialogMode(): WslDialogMode {
  const pasteTab = document.getElementById('wsl-mode-paste');
  return pasteTab?.classList.contains('active') ? 'paste' : 'select';
}

function setWslDialogMode(mode: WslDialogMode): void {
  const selectTab = document.getElementById('wsl-mode-select');
  const pasteTab = document.getElementById('wsl-mode-paste');
  const selectPanel = document.getElementById('wsl-panel-select');
  const pastePanel = document.getElementById('wsl-panel-paste');
  const openFileBtn = document.getElementById('wsl-open-file') as HTMLButtonElement | null;
  const path = document.getElementById('wsl-path') as HTMLInputElement | null;

  selectTab?.classList.toggle('active', mode === 'select');
  pasteTab?.classList.toggle('active', mode === 'paste');
  selectTab?.setAttribute('aria-selected', mode === 'select' ? 'true' : 'false');
  pasteTab?.setAttribute('aria-selected', mode === 'paste' ? 'true' : 'false');

  if (selectPanel) selectPanel.hidden = mode !== 'select';
  if (pastePanel) pastePanel.hidden = mode !== 'paste';

  if (openFileBtn) {
    openFileBtn.hidden = mode !== 'paste';
    openFileBtn.disabled = mode !== 'paste';
    openFileBtn.title =
      mode === 'paste'
        ? '用 file://wsl.localhost 在新标签打开粘贴的 .md / .svg 文件'
        : '仅在「粘贴路径」模式下可用';
  }

  // Clear inactive side so values cannot conflict
  if (mode === 'select' && path) {
    path.value = '';
  }

  // Focus primary field of active panel
  requestAnimationFrame(() => {
    if (mode === 'select') {
      (document.getElementById('wsl-distro') as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    } else {
      path?.focus({ preventScroll: true });
    }
  });
}

function showWslDialog(show: boolean): void {
  const dlg = document.getElementById('wsl-dialog');
  if (dlg) {
    dlg.hidden = !show;
  }
  if (show) {
    void (async () => {
      const err = document.getElementById('wsl-error');
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
      setWslDialogMode('select');
      const distroSel = document.getElementById('wsl-distro') as HTMLSelectElement | null;
      const rootInput = document.getElementById('wsl-root') as HTMLInputElement | null;
      const pathInput = document.getElementById('wsl-path') as HTMLInputElement | null;
      const defaults = await loadWslFormDefaults();
      if (rootInput) {
        rootInput.value = defaults.root || '~';
      }
      if (pathInput) {
        pathInput.value = '';
      }
      if (distroSel) {
        distroSel.innerHTML = '<option value="">加载中…</option>';
        try {
          const distros = await wslListDistros();
          distroSel.innerHTML = '';
          if (!distros.length) {
            distroSel.innerHTML = '<option value="">未找到发行版</option>';
          } else {
            for (const d of distros) {
              const opt = document.createElement('option');
              opt.value = d;
              opt.textContent = d;
              if (d === defaults.distro) {
                opt.selected = true;
              }
              distroSel.appendChild(opt);
            }
            if (!defaults.distro && distros[0]) {
              distroSel.value = distros[0];
            }
          }
        } catch (e) {
          distroSel.innerHTML = '<option value="">无法列出发行版</option>';
          if (err) {
            err.hidden = false;
            err.textContent = e instanceof Error ? e.message : String(e);
          }
        }
      }
      setWslDialogMode('select');
      requestAnimationFrame(() => focusDialog('wsl-dialog'));
    })();
  }
}

function parseWslPasteInput(pathPaste: string): {
  distro: string;
  root: string;
  openAbsFile?: string;
} | { error: string } {
  const loc = parseWslLocation(pathPaste);
  if (loc) {
    if (isPreviewablePath(loc.linuxPath)) {
      const parent = loc.linuxPath.includes('/')
        ? loc.linuxPath.slice(0, loc.linuxPath.lastIndexOf('/')) || '/'
        : '/';
      return { distro: loc.distro, root: parent, openAbsFile: loc.linuxPath };
    }
    return { distro: loc.distro, root: loc.linuxPath };
  }
  if (pathPaste.startsWith('/')) {
    return {
      error: '粘贴 Linux 绝对路径时请使用完整形式，例如 wsl://发行版' + pathPaste,
    };
  }
  return {
    error: '无法解析路径。请使用 \\\\wsl.localhost\\Distro\\path 或 wsl://Distro/path',
  };
}

async function connectWslFromDialog(): Promise<void> {
  const errEl = document.getElementById('wsl-error');
  const btn = document.getElementById('wsl-connect') as HTMLButtonElement | null;
  const showErr = (msg: string) => {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  const mode = getWslDialogMode();
  let distro = '';
  let root = '~';
  let openAbsFile: string | undefined;

  if (mode === 'paste') {
    const pathPaste = (document.getElementById('wsl-path') as HTMLInputElement)?.value.trim();
    if (!pathPaste) {
      showErr('请粘贴完整 WSL 路径或 URI');
      return;
    }
    const parsed = parseWslPasteInput(pathPaste);
    if ('error' in parsed) {
      showErr(parsed.error);
      return;
    }
    distro = parsed.distro;
    root = parsed.root;
    openAbsFile = parsed.openAbsFile;
  } else {
    distro = (document.getElementById('wsl-distro') as HTMLSelectElement)?.value.trim();
    root = (document.getElementById('wsl-root') as HTMLInputElement)?.value.trim() || '~';
    if (!distro) {
      showErr('请选择 WSL 发行版');
      return;
    }
  }

  const health = await sshHealth();
  if (!health.ok) {
    showErr('本地 Bridge 未运行。请执行: npm run ssh-bridge（需在 Windows 上）');
    return;
  }
  if (health.wslAvailable === false) {
    showErr('当前 Bridge 不在 Windows 上，无法调用 wsl.exe');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.dataset.label = btn.textContent || '';
    btn.textContent = '连接中…';
  }
  try {
    const meta = await wslConnect(distro, root);
    await saveWslFormDefaults({ distro, root: meta.root });
    showWslDialog(false);
    let preferred: string | undefined;
    if (openAbsFile) {
      const prefix = meta.root.replace(/\/+$/, '');
      if (openAbsFile === prefix) {
        preferred = undefined;
      } else if (openAbsFile.startsWith(prefix + '/')) {
        preferred = openAbsFile.slice(prefix.length + 1);
      } else {
        preferred = openAbsFile.replace(/^\/+/, '');
      }
    }
    await enterWslWorkspace(meta, preferred);
  } catch (e) {
    showErr(e instanceof Error ? e.message : String(e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.label || '连接工作区';
    }
  }
}

/** Open a single WSL markdown/SVG file in Chrome via file://wsl.localhost/... */
async function openWslFileInTab(): Promise<void> {
  const errEl = document.getElementById('wsl-error');
  const showErr = (msg: string) => {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
  };

  if (getWslDialogMode() !== 'paste') {
    showErr('请切换到「粘贴路径」，并填入 .md / .svg 文件路径');
    return;
  }

  const pathPaste = (document.getElementById('wsl-path') as HTMLInputElement)?.value.trim();
  if (!pathPaste) {
    showErr('请粘贴完整 WSL 文件路径（.md 或 .svg）');
    return;
  }

  const loc = parseWslLocation(pathPaste);
  if (!loc || !isPreviewablePath(loc.linuxPath)) {
    showErr('请粘贴指向 .md / .svg 的完整路径，例如 \\\\wsl.localhost\\Debian\\home\\u\\a.md');
    return;
  }
  const url = toWslFileUrl(loc, 'wsl.localhost');
  await chrome.tabs.create({ url });
  showWslDialog(false);
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

  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.dataset.label = connectBtn.textContent || '';
    connectBtn.textContent = '连接中…';
  }
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
    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.textContent = connectBtn.dataset.label || '连接';
    }
  }
}

/** Focus an empty-state action button and explain why it needs a click. */
function promptEmptyAction(buttonId: string, hint: string): void {
  const meta = document.getElementById('empty-meta');
  if (meta) {
    meta.textContent = hint;
  }
  requestAnimationFrame(() => {
    (document.getElementById(buttonId) as HTMLButtonElement | null)?.focus();
  });
}

async function init(): Promise<void> {
  settings = await loadSettings();
  engine = new MarkdownPreviewEngine(settings);
  injectStyles();
  applyThemeClass();
  previewZoom = await loadPreviewZoom();
  applyPreviewZoom(previewZoom);
  await outlinePanel.loadPinPreference();
  wireUi();
  wirePreviewZoomShortcuts();
  document.getElementById('ws-content')?.addEventListener('click', onPreviewClick);

  const params = new URLSearchParams(location.search);
  const shouldPickFile = params.get('pick') === '1';
  const shouldPickFolder = params.get('workspace') === '1' || params.get('folder') === '1';
  const shouldSsh = params.get('ssh') === '1';
  const shouldWsl = params.get('wsl') === '1';
  const shouldEnter = params.get('enter') === '1';

  if (shouldPickFile || shouldPickFolder || shouldSsh || shouldWsl || shouldEnter) {
    history.replaceState(null, '', location.pathname);
  }

  // Always land on Markdown workbench empty state (open actions + recent history).
  // Last workspace is restored only when the user picks it from history or opens a source.
  showEmpty();
  applyThemeClass();

  if (shouldEnter) {
    // Popup already configured the source (picker / SSH / WSL); enter immediately.
    setTimeout(() => void resumePendingEnterFromPopup(), 0);
  } else if (shouldWsl) {
    setTimeout(() => showWslDialog(true), 50);
  } else if (shouldSsh) {
    setTimeout(() => showSshDialog(true), 50);
  } else if (shouldPickFolder) {
    // File/directory pickers require a user gesture; a freshly-opened tab has
    // none, so calling them here always fails (SecurityError / silently
    // blocked). Guide the user to the button instead.
    promptEmptyAction('btn-open-folder', '请点击「打开文件夹…」选择工作区（浏览器要求手动点击）。');
  } else if (shouldPickFile) {
    promptEmptyAction('btn-open', '请点击「打开文件…」选择 Markdown 文件（浏览器要求手动点击）。');
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
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
    if (!dirty) {
      return;
    }
    // Theme / width apply even on empty workbench
    applyThemeClass();
    applyPreviewWidth(settings.previewWidth);
    if (doc && mode === 'preview') {
      engine.updateSettings(settings);
      void showPreviewView();
    } else if (doc && mode === 'source') {
      engine.updateSettings(settings);
    } else {
      engine.updateSettings(settings);
    }
  });
}

void init();
