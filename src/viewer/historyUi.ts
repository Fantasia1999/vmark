import {
  formatHistoryTime,
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

export type WorkspaceFilterTab = 'all' | 'wsl' | 'ssh' | 'local';

/** Cached history lists for instant search and tab filtering */
let cachedWorkspaces: WorkspaceHistoryEntry[] = [];
let cachedFiles: FileHistoryEntry[] = [];
let currentFilterTab: WorkspaceFilterTab = 'all';
let currentSearchQuery = '';

const WS_PAGE_SIZE = 6;
const FILES_PAGE_SIZE = 6;
let wsCurrentPage = 1;
let filesCurrentPage = 1;

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

function fileIcon(name: string, source: string): IconName {
  if (source === 'standalone') {
    return 'file';
  }
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) {
    return 'preview';
  }
  return 'mdFile';
}

function workspaceBadge(source: string): { text: string; className: string } {
  switch (source) {
    case 'wsl':
      return { text: 'WSL', className: 'wb-badge wb-badge-wsl' };
    case 'ssh':
      return { text: 'SSH', className: 'wb-badge wb-badge-ssh' };
    default:
      return { text: 'LOCAL', className: 'wb-badge wb-badge-local' };
  }
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

function fileWorkspacePath(entry: FileHistoryEntry): string {
  if (entry.source === 'wsl' && entry.wsl?.root) {
    return entry.wsl.root;
  }
  if (entry.source === 'ssh' && entry.ssh?.root) {
    return entry.ssh.root;
  }
  if (entry.source === 'local' && entry.localName) {
    return entry.localName;
  }
  return '';
}

function fileSub(entry: FileHistoryEntry): string {
  const rel = entry.path || entry.title;
  if (entry.source === 'wsl') {
    const distro = entry.wsl?.distro ? `wsl://${entry.wsl.distro}` : (entry.workspaceTitle || 'WSL');
    return `${distro} • ${rel}`;
  }
  if (entry.source === 'ssh') {
    const sshTarget = entry.ssh ? `${entry.ssh.username}@${entry.ssh.host}` : (entry.workspaceTitle || 'SSH');
    return `${sshTarget} • ${rel}`;
  }
  if (entry.source === 'local') {
    const ws = entry.localName || entry.workspaceTitle || '本地工作区';
    return `${ws} • ${rel}`;
  }
  return entry.source === 'standalone' ? `本地单文件 • ${rel}` : rel;
}

function matchesSearch(text: string, query: string): boolean {
  if (!query) {
    return true;
  }
  return text.toLowerCase().includes(query.toLowerCase());
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

  const titleRow = document.createElement('span');
  titleRow.className = 'history-item-title-row';

  const badgeMeta = workspaceBadge(entry.source);
  const badge = document.createElement('span');
  badge.className = badgeMeta.className;
  badge.textContent = badgeMeta.text;

  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = entry.title;
  titleRow.append(badge, title);

  const sub = document.createElement('span');
  sub.className = 'history-item-sub';
  sub.textContent = workspaceSub(entry);
  text.append(titleRow, sub);

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
  icon.appendChild(createIconEl(fileIcon(entry.title || entry.path || '', entry.source)));

  const text = document.createElement('span');
  text.className = 'history-item-text';

  const titleRow = document.createElement('span');
  titleRow.className = 'history-item-title-row';

  const badgeMeta = workspaceBadge(entry.source);
  const badge = document.createElement('span');
  badge.className = badgeMeta.className;
  badge.textContent = badgeMeta.text;

  const title = document.createElement('span');
  title.className = 'history-item-title';
  title.textContent = entry.title;
  titleRow.append(badge, title);

  const wsPath = fileWorkspacePath(entry);
  if (wsPath) {
    const wsPathEl = document.createElement('span');
    wsPathEl.className = 'history-item-ws-path';
    wsPathEl.textContent = wsPath;
    wsPathEl.title = `工作区路径: ${wsPath}`;
    titleRow.appendChild(wsPathEl);
  }

  const sub = document.createElement('span');
  sub.className = 'history-item-sub';
  sub.textContent = fileSub(entry);
  text.append(titleRow, sub);

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

/** Render filtered views based on current filter tab, search query, and pagination */
function computePageSize(listId: string): number {
  const el = document.getElementById(listId);
  if (!el || el.clientHeight < 100) {
    return 8;
  }
  return Math.max(5, Math.floor(el.clientHeight / 50));
}

/** Render filtered views based on current filter tab, search query, and pagination */
function renderFilteredHistory(handlers: HistoryUiHandlers): void {
  const wsList = document.getElementById('history-workspaces');
  const fileList = document.getElementById('history-files');
  const wsEmptyHint = document.getElementById('ws-filter-empty');
  const filesEmptyHint = document.getElementById('files-filter-empty');
  const wsTotalBadge = document.getElementById('ws-total-count');
  const filesTotalBadge = document.getElementById('files-total-count');

  if (!wsList || !fileList) {
    return;
  }

  // Calculate synchronized dynamic page size for both columns
  const pageSize = Math.max(
    computePageSize('history-workspaces'),
    computePageSize('history-files'),
  );

  // 1. Filter Workspaces
  const q = currentSearchQuery.trim();
  const tab = currentFilterTab;

  const filteredWorkspaces = cachedWorkspaces.filter((w) => {
    // Tab filter
    if (tab !== 'all' && w.source !== tab) {
      return false;
    }
    // Search query filter
    if (!q) {
      return true;
    }
    const combined = `${w.title} ${workspaceSub(w)} ${w.source}`;
    return matchesSearch(combined, q);
  });

  const wsTotalPages = Math.max(1, Math.ceil(filteredWorkspaces.length / pageSize));
  if (wsCurrentPage > wsTotalPages) {
    wsCurrentPage = wsTotalPages;
  }
  if (wsCurrentPage < 1) {
    wsCurrentPage = 1;
  }
  const wsStart = (wsCurrentPage - 1) * pageSize;
  const pageWorkspaces = filteredWorkspaces.slice(wsStart, wsStart + pageSize);

  wsList.replaceChildren(...pageWorkspaces.map((e) => renderWorkspaceItem(e, handlers)));
  if (wsEmptyHint) {
    wsEmptyHint.hidden = filteredWorkspaces.length > 0 || cachedWorkspaces.length === 0;
  }
  if (wsTotalBadge) {
    wsTotalBadge.textContent = String(filteredWorkspaces.length);
  }

  // Workspaces pagination controls
  const wsPagination = document.getElementById('ws-pagination');
  const wsPageInfo = document.getElementById('ws-page-info');
  const wsPageNum = document.getElementById('ws-page-num');
  const wsPagePrev = document.getElementById('ws-page-prev') as HTMLButtonElement | null;
  const wsNext = document.getElementById('ws-page-next') as HTMLButtonElement | null;

  if (wsPagination) {
    wsPagination.hidden = filteredWorkspaces.length === 0;
  }
  if (wsPageInfo) {
    wsPageInfo.textContent = `第 ${wsCurrentPage} / ${wsTotalPages} 页 (共 ${filteredWorkspaces.length} 个)`;
  }
  if (wsPageNum) {
    wsPageNum.textContent = `${wsCurrentPage} / ${wsTotalPages}`;
  }
  if (wsPagePrev) {
    wsPagePrev.disabled = wsCurrentPage <= 1;
  }
  if (wsNext) {
    wsNext.disabled = wsCurrentPage >= wsTotalPages;
  }

  // 2. Filter Files
  let filteredFiles = cachedFiles;
  if (q) {
    filteredFiles = cachedFiles.filter((f) => {
      const wsPath = fileWorkspacePath(f);
      const combined = `${f.title} ${f.path || ''} ${f.workspaceTitle || ''} ${wsPath} ${f.source}`;
      return matchesSearch(combined, q);
    });
  }

  const filesTotalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  if (filesCurrentPage > filesTotalPages) {
    filesCurrentPage = filesTotalPages;
  }
  if (filesCurrentPage < 1) {
    filesCurrentPage = 1;
  }
  const filesStart = (filesCurrentPage - 1) * pageSize;
  const pageFiles = filteredFiles.slice(filesStart, filesStart + pageSize);

  fileList.replaceChildren(
    ...pageFiles.map((f) => renderFileItem(f, handlers)),
  );
  if (filesEmptyHint) {
    filesEmptyHint.hidden = filteredFiles.length > 0 || cachedFiles.length === 0;
  }
  if (filesTotalBadge) {
    filesTotalBadge.textContent = String(filteredFiles.length);
  }

  // Files pagination controls
  const filesPagination = document.getElementById('files-pagination');
  const filesPageInfo = document.getElementById('files-page-info');
  const filesPageNum = document.getElementById('files-page-num');
  const filesPagePrev = document.getElementById('files-page-prev') as HTMLButtonElement | null;
  const filesPageNext = document.getElementById('files-page-next') as HTMLButtonElement | null;

  if (filesPagination) {
    filesPagination.hidden = filteredFiles.length === 0;
  }
  if (filesPageInfo) {
    filesPageInfo.textContent = `第 ${filesCurrentPage} / ${filesTotalPages} 页 (共 ${filteredFiles.length} 个)`;
  }
  if (filesPageNum) {
    filesPageNum.textContent = `${filesCurrentPage} / ${filesTotalPages}`;
  }
  if (filesPagePrev) {
    filesPagePrev.disabled = filesCurrentPage <= 1;
  }
  if (filesPageNext) {
    filesPageNext.disabled = filesCurrentPage >= filesTotalPages;
  }
}

export async function refreshHistoryPanel(handlers: HistoryUiHandlers): Promise<void> {
  const panel = document.getElementById('history-panel');
  if (!panel) {
    return;
  }

  const [workspaces, files] = await Promise.all([
    loadWorkspaceHistory(),
    loadFileHistory(),
  ]);

  cachedWorkspaces = workspaces;
  cachedFiles = files;

  const hasAny = workspaces.length > 0 || files.length > 0;
  panel.hidden = !hasAny;

  renderFilteredHistory(handlers);
  // Trigger secondary layout measurement after browser flexbox pass
  requestAnimationFrame(() => {
    renderFilteredHistory(handlers);
  });
}

/** Wire filter tabs, search input, clear button, and pagination buttons */
export function wireHistoryControls(handlers: HistoryUiHandlers): void {
  // Clear all button
  document.getElementById('history-clear-all')?.addEventListener('click', () => {
    if (confirm('确定清空全部工作区与文件历史？')) {
      handlers.onClearAll();
    }
  });

  // Search input
  const searchInput = document.getElementById('wb-search-input') as HTMLInputElement | null;
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = '1';
    searchInput.addEventListener('input', () => {
      currentSearchQuery = searchInput.value;
      wsCurrentPage = 1;
      filesCurrentPage = 1;
      renderFilteredHistory(handlers);
    });
  }

  // Filter tabs
  const filterTabs = document.querySelectorAll('#ws-filter-tabs .wb-tab');
  filterTabs.forEach((tabBtn) => {
    if ((tabBtn as HTMLElement).dataset.wired) {
      return;
    }
    (tabBtn as HTMLElement).dataset.wired = '1';
    tabBtn.addEventListener('click', () => {
      filterTabs.forEach((btn) => btn.classList.remove('active'));
      tabBtn.classList.add('active');
      const filter = (tabBtn.getAttribute('data-filter') || 'all') as WorkspaceFilterTab;
      currentFilterTab = filter;
      wsCurrentPage = 1;
      renderFilteredHistory(handlers);
    });
  });

  // Workspaces pagination buttons
  const wsPrev = document.getElementById('ws-page-prev');
  if (wsPrev && !wsPrev.dataset.wired) {
    wsPrev.dataset.wired = '1';
    wsPrev.addEventListener('click', () => {
      if (wsCurrentPage > 1) {
        wsCurrentPage--;
        renderFilteredHistory(handlers);
      }
    });
  }
  const wsNext = document.getElementById('ws-page-next');
  if (wsNext && !wsNext.dataset.wired) {
    wsNext.dataset.wired = '1';
    wsNext.addEventListener('click', () => {
      wsCurrentPage++;
      renderFilteredHistory(handlers);
    });
  }

  // Files pagination buttons
  const filesPrev = document.getElementById('files-page-prev');
  if (filesPrev && !filesPrev.dataset.wired) {
    filesPrev.dataset.wired = '1';
    filesPrev.addEventListener('click', () => {
      if (filesCurrentPage > 1) {
        filesCurrentPage--;
        renderFilteredHistory(handlers);
      }
    });
  }
  const filesNext = document.getElementById('files-page-next');
  if (filesNext && !filesNext.dataset.wired) {
    filesNext.dataset.wired = '1';
    filesNext.addEventListener('click', () => {
      filesCurrentPage++;
      renderFilteredHistory(handlers);
    });
  }

  // Window resize handler (debounced)
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      renderFilteredHistory(handlers);
    }, 120);
  });
}

export function wireHistoryClearButton(handlers: HistoryUiHandlers): void {
  wireHistoryControls(handlers);
}

