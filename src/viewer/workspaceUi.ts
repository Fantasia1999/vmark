import { createIconEl } from '../shared/icons';
import { t } from '../shared/i18n/index';
import type { WorkspaceTreeNode } from '../shared/workspaceFs';

export interface WorkspaceUiHandlers {
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCloseWorkspace: () => void;
  onOpenSingleFile: () => void;
  /** Right-click a file row (for compare, etc.) */
  onFileContextMenu?: (info: {
    path: string;
    name: string;
    clientX: number;
    clientY: number;
  }) => void;
}

export interface FileTreeCompareState {
  leftPath?: string;
  rightPath?: string;
}

const STORAGE_KEY = 'wsTreeExpand.v1';
const PERSIST_DEBOUNCE_MS = 250;

/** path → expanded (missing = collapsed; first open is all closed) */
const expandedDirs = new Map<string, boolean>();
/** Snapshot taken right before "collapse all", for one-click restore. */
let expandSnapshot: Record<string, boolean> | null = null;
/** True after user chose "collapse all" and has not restored / left that mode. */
let collapsedAllMode = false;
/** Current workspace identity for chrome.storage persistence. */
let workspaceKey: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function collectDirPaths(nodes: WorkspaceTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind === 'dir') {
      out.push(n.path);
      collectDirPaths(n.children, out);
    }
  }
  return out;
}

function mapToRecord(map: Map<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of map) {
    out[k] = v;
  }
  return out;
}

function openPathsFromMap(map: Map<string, boolean>): string[] {
  const open: string[] = [];
  for (const [k, v] of map) {
    if (v) {
      open.push(k);
    }
  }
  return open;
}

function applyOpenPaths(open: string[]): void {
  expandedDirs.clear();
  for (const p of open) {
    if (typeof p === 'string' && p.length > 0) {
      expandedDirs.set(p, true);
    }
  }
}

async function loadStoredOpenPaths(key: string): Promise<string[]> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const bag = raw[STORAGE_KEY];
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
      return [];
    }
    const entry = (bag as Record<string, unknown>)[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const open = (entry as { open?: unknown }).open;
    if (!Array.isArray(open)) {
      return [];
    }
    return open.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

async function writeStoredOpenPaths(key: string, open: string[]): Promise<void> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const bag =
      raw[STORAGE_KEY] && typeof raw[STORAGE_KEY] === 'object' && !Array.isArray(raw[STORAGE_KEY])
        ? { ...(raw[STORAGE_KEY] as Record<string, unknown>) }
        : {};
    bag[key] = { open };
    await chrome.storage.local.set({ [STORAGE_KEY]: bag });
  } catch {
    // ignore quota / unavailable
  }
}

function schedulePersist(): void {
  if (!workspaceKey) {
    return;
  }
  const key = workspaceKey;
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void writeStoredOpenPaths(key, openPathsFromMap(expandedDirs));
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersist(): void {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (!workspaceKey) {
    return;
  }
  void writeStoredOpenPaths(workspaceKey, openPathsFromMap(expandedDirs));
}

/**
 * Bind expand/collapse memory to a workspace identity.
 * Loads persisted open dirs (default: all collapsed). Call before first render.
 */
export async function prepareFileTreeForWorkspace(key: string): Promise<void> {
  if (workspaceKey === key) {
    return;
  }
  flushPersist();
  expandedDirs.clear();
  expandSnapshot = null;
  collapsedAllMode = false;
  workspaceKey = key;
  const open = await loadStoredOpenPaths(key);
  applyOpenPaths(open);
}

function ensureAncestorsExpanded(activePath: string | undefined): void {
  if (!activePath) {
    return;
  }
  const parts = activePath.split('/').filter(Boolean);
  let acc = '';
  let changed = false;
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    if (expandedDirs.get(acc) !== true) {
      expandedDirs.set(acc, true);
      changed = true;
    }
  }
  if (changed) {
    schedulePersist();
  }
}

/**
 * Leave "collapse all" mode so the next render can expand ancestors for the
 * active file. Keeps the snapshot until the next collapse-all overwrites it.
 */
export function exitCollapsedAllMode(): void {
  if (!collapsedAllMode) {
    return;
  }
  collapsedAllMode = false;
  syncTreeFoldButton();
}

function isDirExpanded(path: string): boolean {
  // Missing keys default to collapsed (first open = all closed)
  return expandedDirs.get(path) === true;
}

function setDirExpanded(path: string, open: boolean): void {
  expandedDirs.set(path, open);
  if (open) {
    collapsedAllMode = false;
  }
  schedulePersist();
}

/** Collapse every directory; remembers prior layout for {@link restoreFileTreeExpand}. */
export function collapseAllFileTree(_tree: WorkspaceTreeNode[]): void {
  if (!collapsedAllMode) {
    expandSnapshot = mapToRecord(expandedDirs);
  }
  // Missing keys default to collapsed — clearing is enough
  expandedDirs.clear();
  collapsedAllMode = true;
  schedulePersist();
  syncTreeFoldButton();
}

/** Restore layout from the last collapse-all snapshot. */
export function restoreFileTreeExpand(): boolean {
  if (!expandSnapshot) {
    return false;
  }
  expandedDirs.clear();
  for (const [path, open] of Object.entries(expandSnapshot)) {
    expandedDirs.set(path, open);
  }
  expandSnapshot = null;
  collapsedAllMode = false;
  schedulePersist();
  syncTreeFoldButton();
  return true;
}

export function isFileTreeCollapsedAllMode(): boolean {
  return collapsedAllMode;
}

export function canRestoreFileTreeExpand(): boolean {
  return expandSnapshot !== null;
}

/** Reset expand cache (e.g. closing workspace). Flushes pending save first. */
export function clearFileTreeExpandState(): void {
  flushPersist();
  expandedDirs.clear();
  expandSnapshot = null;
  collapsedAllMode = false;
  workspaceKey = null;
  syncTreeFoldButton();
}

export function renderFileTree(
  container: HTMLElement,
  tree: WorkspaceTreeNode[],
  activePath: string | undefined,
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile' | 'onFileContextMenu'>,
  compare?: FileTreeCompareState,
): void {
  // While in collapse-all mode, do not auto-expand ancestors (that would undo the action).
  // Callers that open a file should exitCollapsedAllMode() first.
  if (!collapsedAllMode) {
    ensureAncestorsExpanded(activePath);
  }
  container.replaceChildren();
  const ul = document.createElement('ul');
  ul.className = 'ws-tree';
  ul.setAttribute('role', 'tree');
  appendNodes(ul, tree, activePath, handlers, 0, compare);
  container.appendChild(ul);
  syncTreeFoldButton();

  requestAnimationFrame(() => {
    const active = container.querySelector('.ws-file-row.active');
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function setDirRowUi(
  li: HTMLElement,
  row: HTMLButtonElement,
  twisty: HTMLElement,
  childUl: HTMLElement,
  open: boolean,
): void {
  li.classList.toggle('is-collapsed', !open);
  li.classList.toggle('is-expanded', open);
  childUl.hidden = !open;
  row.setAttribute('aria-expanded', open ? 'true' : 'false');
  twisty.classList.toggle('open', open);
  twisty.replaceChildren(
    createIconEl(open ? 'chevronDown' : 'chevronRight', 'vsc-icon vsc-icon-sm'),
  );
}

function appendNodes(
  parent: HTMLElement,
  nodes: WorkspaceTreeNode[],
  activePath: string | undefined,
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile' | 'onFileContextMenu'>,
  depth: number,
  compare?: FileTreeCompareState,
): void {
  for (const node of nodes) {
    const li = document.createElement('li');
    li.className = `ws-node ws-${node.kind}`;
    li.setAttribute('role', 'treeitem');

    if (node.kind === 'dir') {
      const isOpen = isDirExpanded(node.path);
      li.dataset.path = node.path;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-row ws-dir-row';
      row.style.paddingLeft = `${8 + depth * 12}px`;
      row.title = isOpen
        ? t('sidebar.collapseDir', { path: node.path })
        : t('sidebar.expandDir', { path: node.path });

      const twisty = document.createElement('span');
      twisty.className = 'ws-twisty';
      twisty.setAttribute('aria-hidden', 'true');

      const folderIcon = document.createElement('span');
      folderIcon.className = 'ws-folder-icon';
      folderIcon.setAttribute('aria-hidden', 'true');
      folderIcon.appendChild(createIconEl('folder', 'vsc-icon vsc-icon-sm'));

      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;

      const count = document.createElement('span');
      count.className = 'ws-dir-count';
      const fileCount = countFiles(node);
      count.textContent = String(fileCount);
      count.title = t('sidebar.fileCount', { count: fileCount });

      row.append(twisty, folderIcon, label, count);

      const childUl = document.createElement('ul');
      childUl.className = 'ws-tree ws-tree-children';
      childUl.setAttribute('role', 'group');
      appendNodes(childUl, node.children, activePath, handlers, depth + 1, compare);

      setDirRowUi(li, row, twisty, childUl, isOpen);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const next = li.classList.contains('is-collapsed');
        setDirExpanded(node.path, next);
        setDirRowUi(li, row, twisty, childUl, next);
        row.title = next
          ? t('sidebar.collapseDir', { path: node.path })
          : t('sidebar.expandDir', { path: node.path });
        syncTreeFoldButton();
      });

      li.append(row, childUl);
    } else {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-row ws-file-row';
      row.style.paddingLeft = `${8 + depth * 12 + 14}px`;
      row.title = node.path;
      if (node.path === activePath) {
        row.classList.add('active');
        row.setAttribute('aria-current', 'page');
      }
      if (compare?.leftPath === node.path) {
        row.classList.add('compare-left');
      }
      if (compare?.rightPath === node.path) {
        row.classList.add('compare-right');
      }

      const icon = document.createElement('span');
      icon.className = 'ws-file-icon';
      icon.appendChild(createIconEl('mdFile'));
      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;
      row.append(icon, label);

      if (compare?.leftPath === node.path || compare?.rightPath === node.path) {
        const badge = document.createElement('span');
        badge.className = 'ws-compare-badge';
        if (compare.leftPath === node.path && compare.rightPath === node.path) {
          badge.textContent = 'L+R';
          badge.title = t('sidebar.compareBoth');
          badge.classList.add('both');
        } else if (compare.leftPath === node.path) {
          badge.textContent = 'L';
          badge.title = t('sidebar.compareLeft');
          badge.classList.add('left');
        } else {
          badge.textContent = 'R';
          badge.title = t('sidebar.compareRight');
          badge.classList.add('right');
        }
        row.appendChild(badge);
      }

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.path === activePath) {
          return;
        }
        handlers.onOpenFile(node.path);
      });
      row.addEventListener('contextmenu', (e) => {
        if (!handlers.onFileContextMenu) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handlers.onFileContextMenu({
          path: node.path,
          name: node.name,
          clientX: e.clientX,
          clientY: e.clientY,
        });
      });
      li.append(row);
    }
    parent.appendChild(li);
  }
}

function countFiles(node: WorkspaceTreeNode): number {
  if (node.kind === 'file') {
    return 1;
  }
  let n = 0;
  for (const c of node.children) {
    n += countFiles(c);
  }
  return n;
}

export function setWorkspaceChrome(
  visible: boolean,
  workspaceName?: string,
): void {
  const shell = document.getElementById('workspace-shell');
  const empty = document.getElementById('empty-state');
  if (shell) {
    shell.hidden = !visible;
  }
  if (empty) {
    empty.hidden = visible;
  }
  const title = document.getElementById('ws-title');
  if (title && workspaceName) {
    title.textContent = workspaceName;
    title.title = workspaceName;
  }
  syncTreeFoldButton();
}

/** Toggle label/icon for the fold button based on collapse-all mode. */
export function syncTreeFoldButton(): void {
  const btn = document.getElementById('ws-btn-tree-fold') as HTMLButtonElement | null;
  if (!btn) {
    return;
  }
  const restoring = collapsedAllMode && expandSnapshot !== null;
  btn.replaceChildren();
  if (restoring) {
    btn.appendChild(createIconEl('chevronDown', 'vsc-icon vsc-icon-sm'));
    const tEl = document.createElement('span');
    tEl.textContent = t('sidebar.unfoldAll');
    btn.appendChild(tEl);
    btn.title = t('sidebar.unfoldAllTitle');
    btn.setAttribute('aria-label', t('sidebar.unfoldAll'));
    btn.dataset.mode = 'restore';
  } else {
    btn.appendChild(createIconEl('chevronRight', 'vsc-icon vsc-icon-sm'));
    const tEl = document.createElement('span');
    tEl.textContent = t('sidebar.foldAll');
    btn.appendChild(tEl);
    btn.title = t('sidebar.foldAllTitle');
    btn.setAttribute('aria-label', t('sidebar.foldAll'));
    btn.dataset.mode = 'collapse';
  }
}

/**
 * Wire the tree fold button once. `getTree` / `onChanged` let the viewer re-render.
 */
export function wireTreeFoldButton(options: {
  getTree: () => WorkspaceTreeNode[];
  onChanged: () => void;
}): void {
  const btn = document.getElementById('ws-btn-tree-fold');
  if (!btn || btn.dataset.wired === '1') {
    return;
  }
  btn.dataset.wired = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (collapsedAllMode && expandSnapshot) {
      restoreFileTreeExpand();
    } else {
      collapseAllFileTree(options.getTree());
    }
    options.onChanged();
  });
  syncTreeFoldButton();
}
