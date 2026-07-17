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

function fileSub(entry: FileHistoryEntry): string {
  const parts: string[] = [];
  if (entry.workspaceTitle) {
    parts.push(entry.workspaceTitle);
  }
  if (entry.path && entry.path !== entry.title) {
    parts.push(entry.path);
  }
  if (!parts.length) {
    parts.push(entry.source === 'standalone' ? '本地文件' : entry.source);
  }
  return parts.join(' · ');
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
  li.className = 'history-item';
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
  sub.textContent = fileSub(entry);
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

export async function refreshHistoryPanel(handlers: HistoryUiHandlers): Promise<void> {
  const panel = document.getElementById('history-panel');
  const wsList = document.getElementById('history-workspaces');
  const fileList = document.getElementById('history-files');
  if (!panel || !wsList || !fileList) {
    return;
  }

  const [workspaces, files] = await Promise.all([
    loadWorkspaceHistory(),
    loadFileHistory(),
  ]);

  wsList.replaceChildren(...workspaces.map((e) => renderWorkspaceItem(e, handlers)));
  fileList.replaceChildren(...files.map((e) => renderFileItem(e, handlers)));

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
