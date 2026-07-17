import {
  formatHistoryTime,
  fileWorkspaceGroupKey,
  fileWorkspaceGroupLabel,
  fileWorkspaceGroupSub,
  loadFileHistory,
  loadWorkspaceHistory,
  type FileHistoryEntry,
  type WorkspaceHistoryEntry,
} from '../shared/history';
import { createIconEl, type IconName } from '../shared/icons';

export interface HistoryUiHandlers {
  onOpenWorkspace: (entry: WorkspaceHistoryEntry) => void;
  onOpenFile: (entry: FileHistoryEntry) => void;
  onRemoveWorkspace: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
}

interface FileHistoryGroup {
  key: string;
  label: string;
  sub?: string;
  source: FileHistoryEntry['source'];
  files: FileHistoryEntry[];
  /** Most recent file open in this group */
  openedAt: number;
}

const EXPAND_STORAGE_KEY = 'historyFileGroupExpanded';

/** In-memory cache; hydrated from chrome.storage.local */
let expandState: Record<string, boolean> = {};
let expandStateLoaded = false;

async function loadExpandState(): Promise<Record<string, boolean>> {
  if (expandStateLoaded) {
    return expandState;
  }
  try {
    const r = await chrome.storage.local.get(EXPAND_STORAGE_KEY);
    const raw = r[EXPAND_STORAGE_KEY];
    expandState =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, boolean>)
        : {};
  } catch {
    expandState = {};
  }
  expandStateLoaded = true;
  return expandState;
}

async function setGroupExpanded(key: string, expanded: boolean): Promise<void> {
  expandState = { ...expandState, [key]: expanded };
  try {
    await chrome.storage.local.set({ [EXPAND_STORAGE_KEY]: expandState });
  } catch {
    // ignore
  }
}

function isGroupExpanded(key: string, defaultExpanded: boolean): boolean {
  if (Object.prototype.hasOwnProperty.call(expandState, key)) {
    return Boolean(expandState[key]);
  }
  return defaultExpanded;
}

function sourceIcon(source: string): IconName {
  switch (source) {
    case 'ssh':
      return 'ssh';
    case 'wsl':
      return 'folder';
    case 'local':
      return 'folder';
    default:
      return 'file';
  }
}

function fileIcon(source: string): IconName {
  return source === 'standalone' ? 'file' : 'mdFile';
}

function workspaceSub(entry: WorkspaceHistoryEntry): string {
  if (entry.subtitle) {
    return entry.subtitle;
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `${entry.ssh.username}@${entry.ssh.host}:${entry.ssh.port} · ${entry.ssh.root}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return `${entry.wsl.distro} · ${entry.wsl.root}`;
  }
  if (entry.lastFilePath) {
    return entry.lastFilePath;
  }
  return entry.source;
}

/** Path-only subtitle when already nested under a workspace group. */
function fileSubInGroup(entry: FileHistoryEntry): string {
  if (entry.path && entry.path !== entry.title) {
    return entry.path;
  }
  if (entry.source === 'standalone') {
    return '本地单文件';
  }
  return entry.path || entry.source;
}

function groupFilesByWorkspace(files: FileHistoryEntry[]): FileHistoryGroup[] {
  const map = new Map<string, FileHistoryGroup>();
  for (const file of files) {
    const key = fileWorkspaceGroupKey(file);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        label: fileWorkspaceGroupLabel(file),
        sub: fileWorkspaceGroupSub(file),
        source: file.source,
        files: [],
        openedAt: file.openedAt,
      };
      map.set(key, group);
    }
    group.files.push(file);
    if (file.openedAt > group.openedAt) {
      group.openedAt = file.openedAt;
      // Prefer label from the newest entry
      group.label = fileWorkspaceGroupLabel(file);
      group.sub = fileWorkspaceGroupSub(file);
    }
  }

  const groups = [...map.values()];
  // Within each group: newest first
  for (const g of groups) {
    g.files.sort((a, b) => b.openedAt - a.openedAt);
  }
  // Groups: most recently used first
  groups.sort((a, b) => b.openedAt - a.openedAt);
  return groups;
}

function renderWorkspaceItem(
  entry: WorkspaceHistoryEntry,
  handlers: HistoryUiHandlers,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'history-item';
  li.dataset.id = entry.id;

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'history-item-main';
  main.title = `打开工作区：${entry.title}`;

  const icon = document.createElement('span');
  icon.className = 'history-item-icon';
  icon.appendChild(createIconEl(sourceIcon(entry.source)));

  const text = document.createElement('span');
  text.className = 'history-item-text';
  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = entry.title;
  const sub = document.createElement('span');
  sub.className = 'history-item-sub';
  sub.textContent = workspaceSub(entry);
  text.append(title, sub);

  const time = document.createElement('span');
  time.className = 'history-item-time';
  time.textContent = formatHistoryTime(entry.openedAt);

  main.append(icon, text, time);
  main.addEventListener('click', () => handlers.onOpenWorkspace(entry));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'history-item-remove';
  remove.title = '删除此记录';
  remove.setAttribute('aria-label', `删除工作区记录 ${entry.title}`);
  remove.appendChild(createIconEl('close', 'vsc-icon vsc-icon-sm'));
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onRemoveWorkspace(entry.id);
  });

  li.append(main, remove);
  return li;
}

function renderFileItem(entry: FileHistoryEntry, handlers: HistoryUiHandlers): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'history-item history-item-file';
  li.dataset.id = entry.id;

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'history-item-main';
  main.title = entry.path ? `打开 ${entry.path}` : `打开 ${entry.title}`;

  const icon = document.createElement('span');
  icon.className = 'history-item-icon';
  icon.appendChild(createIconEl(fileIcon(entry.source)));

  const text = document.createElement('span');
  text.className = 'history-item-text';
  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = entry.title;
  const sub = document.createElement('span');
  sub.className = 'history-item-sub';
  sub.textContent = fileSubInGroup(entry);
  text.append(title, sub);

  const time = document.createElement('span');
  time.className = 'history-item-time';
  time.textContent = formatHistoryTime(entry.openedAt);

  main.append(icon, text, time);
  main.addEventListener('click', () => handlers.onOpenFile(entry));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'history-item-remove';
  remove.title = '删除此记录';
  remove.setAttribute('aria-label', `删除文件记录 ${entry.title}`);
  remove.appendChild(createIconEl('close', 'vsc-icon vsc-icon-sm'));
  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onRemoveFile(entry.id);
  });

  li.append(main, remove);
  return li;
}

function applyGroupExpandedUi(
  groupEl: HTMLElement,
  chevron: HTMLElement,
  fileUl: HTMLElement,
  expanded: boolean,
): void {
  groupEl.classList.toggle('is-collapsed', !expanded);
  groupEl.classList.toggle('is-expanded', expanded);
  fileUl.hidden = !expanded;
  chevron.replaceChildren(createIconEl(expanded ? 'chevronDown' : 'chevronRight', 'vsc-icon vsc-icon-sm'));
}

function renderFileGroup(
  group: FileHistoryGroup,
  handlers: HistoryUiHandlers,
  defaultExpanded: boolean,
): HTMLLIElement {
  const expanded = isGroupExpanded(group.key, defaultExpanded);

  const li = document.createElement('li');
  li.className = 'history-group';
  li.dataset.groupKey = group.key;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'history-group-header';
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  header.title = expanded ? `收起 ${group.label}` : `展开 ${group.label}`;

  const chevron = document.createElement('span');
  chevron.className = 'history-group-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  const icon = document.createElement('span');
  icon.className = 'history-item-icon history-group-icon';
  icon.appendChild(createIconEl(sourceIcon(group.source)));

  const text = document.createElement('span');
  text.className = 'history-item-text';
  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = group.label;
  text.appendChild(title);
  if (group.sub) {
    const sub = document.createElement('span');
    sub.className = 'history-item-sub';
    sub.textContent = group.sub;
    text.appendChild(sub);
  }

  const count = document.createElement('span');
  count.className = 'history-group-count';
  count.textContent = String(group.files.length);

  header.append(chevron, icon, text, count);

  const fileUl = document.createElement('ul');
  fileUl.className = 'history-group-files';
  fileUl.replaceChildren(...group.files.map((f) => renderFileItem(f, handlers)));

  applyGroupExpandedUi(li, chevron, fileUl, expanded);

  header.addEventListener('click', () => {
    const next = li.classList.contains('is-collapsed');
    applyGroupExpandedUi(li, chevron, fileUl, next);
    header.setAttribute('aria-expanded', next ? 'true' : 'false');
    header.title = next ? `收起 ${group.label}` : `展开 ${group.label}`;
    void setGroupExpanded(group.key, next);
  });

  li.append(header, fileUl);
  return li;
}

export async function refreshHistoryPanel(handlers: HistoryUiHandlers): Promise<void> {
  const panel = document.getElementById('history-panel');
  const wsList = document.getElementById('history-workspaces');
  const fileList = document.getElementById('history-files');
  if (!panel || !wsList || !fileList) {
    return;
  }

  const [, workspaces, files] = await Promise.all([
    loadExpandState(),
    loadWorkspaceHistory(),
    loadFileHistory(),
  ]);

  wsList.replaceChildren(...workspaces.map((e) => renderWorkspaceItem(e, handlers)));

  const groups = groupFilesByWorkspace(files);
  // Default: only the most recently used group is expanded
  fileList.classList.add('history-file-groups');
  fileList.replaceChildren(
    ...groups.map((g, i) => renderFileGroup(g, handlers, i === 0)),
  );

  const hasAny = workspaces.length > 0 || files.length > 0;
  panel.hidden = !hasAny;

  // Hide section headers when their lists are empty
  const wsHead = wsList.previousElementSibling as HTMLElement | null;
  const fileHead = fileList.previousElementSibling as HTMLElement | null;
  if (wsHead) {
    wsHead.hidden = workspaces.length === 0;
  }
  if (fileHead) {
    fileHead.hidden = files.length === 0;
  }

  const clearBtn = document.getElementById('history-clear-all');
  if (clearBtn) {
    clearBtn.hidden = !hasAny;
  }
}

export function wireHistoryClearButton(handlers: HistoryUiHandlers): void {
  document.getElementById('history-clear-all')?.addEventListener('click', () => {
    if (confirm('确定清空全部工作区与文件历史？')) {
      handlers.onClearAll();
    }
  });
}
