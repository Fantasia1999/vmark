/**
 * Recent workspaces & files (chrome.storage.local).
 * Local FS handles are not serializable — local entries store names only.
 */

import type { SshAuthMode } from './sshClient';

export type HistorySource = 'local' | 'ssh' | 'wsl';

export interface SshHistoryTarget {
  host: string;
  port: number;
  username: string;
  root: string;
  authMode?: SshAuthMode;
}

export interface WslHistoryTarget {
  distro: string;
  root: string;
}

export interface WorkspaceHistoryEntry {
  id: string;
  kind: 'workspace';
  source: HistorySource;
  /** Primary label */
  title: string;
  /** Secondary line */
  subtitle?: string;
  openedAt: number;
  /** Local folder name from FileSystemDirectoryHandle.name */
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
  lastFilePath?: string;
}

export interface FileHistoryEntry {
  id: string;
  kind: 'file';
  source: HistorySource | 'standalone';
  title: string;
  /** Relative path inside workspace, or bare file name */
  path?: string;
  openedAt: number;
  /** Parent workspace context for re-open */
  workspaceTitle?: string;
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
}

const WS_KEY = 'historyWorkspaces';
const FILE_KEY = 'historyFiles';
const MAX_WS = 15;
const MAX_FILES = 25;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function workspaceKey(entry: Omit<WorkspaceHistoryEntry, 'id' | 'kind' | 'openedAt' | 'title' | 'subtitle' | 'lastFilePath'> & {
  title?: string;
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
  source: HistorySource;
}): string {
  if (entry.source === 'local') {
    return `local:${entry.localName || entry.title || ''}`;
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `ssh:${entry.ssh.username}@${entry.ssh.host}:${entry.ssh.port}:${entry.ssh.root}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return `wsl:${entry.wsl.distro}:${entry.wsl.root}`;
  }
  return `other:${entry.source}`;
}

function fileKey(entry: {
  source: FileHistoryEntry['source'];
  title: string;
  path?: string;
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
}): string {
  if (entry.source === 'standalone') {
    return `file:standalone:${entry.title}`;
  }
  if (entry.source === 'local') {
    return `file:local:${entry.localName || ''}:${entry.path || entry.title}`;
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `file:ssh:${entry.ssh.username}@${entry.ssh.host}:${entry.ssh.root}:${entry.path || entry.title}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return `file:wsl:${entry.wsl.distro}:${entry.wsl.root}:${entry.path || entry.title}`;
  }
  return `file:${entry.source}:${entry.path || entry.title}`;
}

/** Stable key for grouping recent files by workspace context. */
export function fileWorkspaceGroupKey(entry: {
  source: FileHistoryEntry['source'];
  localName?: string;
  workspaceTitle?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
}): string {
  if (entry.source === 'standalone') {
    return 'standalone';
  }
  if (entry.source === 'local') {
    return `local:${entry.localName || entry.workspaceTitle || ''}`;
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `ssh:${entry.ssh.username}@${entry.ssh.host}:${entry.ssh.port}:${entry.ssh.root}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return `wsl:${entry.wsl.distro}:${entry.wsl.root}`;
  }
  return `other:${entry.source}`;
}

export function fileWorkspaceGroupLabel(entry: FileHistoryEntry): string {
  if (entry.source === 'standalone') {
    return '本地文件';
  }
  if (entry.workspaceTitle) {
    return entry.workspaceTitle;
  }
  if (entry.source === 'local') {
    return entry.localName || '本地文件夹';
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `${entry.ssh.username}@${entry.ssh.host}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return `wsl://${entry.wsl.distro}`;
  }
  return entry.source;
}

export function fileWorkspaceGroupSub(entry: FileHistoryEntry): string | undefined {
  if (entry.source === 'standalone') {
    return undefined;
  }
  if (entry.source === 'local') {
    return entry.localName && entry.workspaceTitle !== entry.localName
      ? entry.localName
      : '本地文件夹';
  }
  if (entry.source === 'ssh' && entry.ssh) {
    return `${entry.ssh.root} · :${entry.ssh.port}`;
  }
  if (entry.source === 'wsl' && entry.wsl) {
    return entry.wsl.root;
  }
  return undefined;
}

/**
 * Serialize read-modify-write cycles within this page. Without it, concurrent
 * calls (e.g. recordWorkspaceOpen + touchWorkspaceLastFile during workspace
 * entry) both read the same list and the last `set` silently drops the other.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function loadList<T>(key: string): Promise<T[]> {
  try {
    const r = await chrome.storage.local.get(key);
    const list = r[key];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
}

async function saveList<T>(key: string, list: T[]): Promise<void> {
  await chrome.storage.local.set({ [key]: list });
}

export async function loadWorkspaceHistory(): Promise<WorkspaceHistoryEntry[]> {
  const list = await loadList<WorkspaceHistoryEntry>(WS_KEY);
  return list.sort((a, b) => b.openedAt - a.openedAt);
}

export async function loadFileHistory(): Promise<FileHistoryEntry[]> {
  const list = await loadList<FileHistoryEntry>(FILE_KEY);
  return list.sort((a, b) => b.openedAt - a.openedAt);
}

export async function recordWorkspaceOpen(input: {
  source: HistorySource;
  title: string;
  subtitle?: string;
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
  lastFilePath?: string;
}): Promise<void> {
  await withWriteLock(async () => {
    const list = await loadWorkspaceHistory();
    const key = workspaceKey(input);
    const filtered = list.filter((e) => workspaceKey(e) !== key);
    const entry: WorkspaceHistoryEntry = {
      id: uid('ws'),
      kind: 'workspace',
      source: input.source,
      title: input.title,
      subtitle: input.subtitle,
      openedAt: Date.now(),
      localName: input.localName,
      ssh: input.ssh,
      wsl: input.wsl,
      lastFilePath: input.lastFilePath,
    };
    filtered.unshift(entry);
    await saveList(WS_KEY, filtered.slice(0, MAX_WS));
  });
}

export async function recordFileOpen(input: {
  source: FileHistoryEntry['source'];
  title: string;
  path?: string;
  workspaceTitle?: string;
  localName?: string;
  ssh?: SshHistoryTarget;
  wsl?: WslHistoryTarget;
}): Promise<void> {
  await withWriteLock(async () => {
    const list = await loadFileHistory();
    const key = fileKey(input);
    const filtered = list.filter((e) => fileKey(e) !== key);
    const entry: FileHistoryEntry = {
      id: uid('file'),
      kind: 'file',
      source: input.source,
      title: input.title,
      path: input.path,
      openedAt: Date.now(),
      workspaceTitle: input.workspaceTitle,
      localName: input.localName,
      ssh: input.ssh,
      wsl: input.wsl,
    };
    filtered.unshift(entry);
    await saveList(FILE_KEY, filtered.slice(0, MAX_FILES));
  });
}

/** Update lastFilePath on matching workspace entry */
export async function touchWorkspaceLastFile(
  match: {
    source: HistorySource;
    localName?: string;
    ssh?: SshHistoryTarget;
    wsl?: WslHistoryTarget;
  },
  lastFilePath: string,
): Promise<void> {
  await withWriteLock(async () => {
    const list = await loadWorkspaceHistory();
    const key = workspaceKey(match);
    let changed = false;
    for (const e of list) {
      if (workspaceKey(e) === key) {
        e.lastFilePath = lastFilePath;
        e.openedAt = Date.now();
        changed = true;
        break;
      }
    }
    if (changed) {
      list.sort((a, b) => b.openedAt - a.openedAt);
      await saveList(WS_KEY, list);
    }
  });
}

export async function removeWorkspaceHistory(id: string): Promise<void> {
  await withWriteLock(async () => {
    const list = await loadWorkspaceHistory();
    await saveList(
      WS_KEY,
      list.filter((e) => e.id !== id),
    );
  });
}

export async function removeFileHistory(id: string): Promise<void> {
  await withWriteLock(async () => {
    const list = await loadFileHistory();
    await saveList(
      FILE_KEY,
      list.filter((e) => e.id !== id),
    );
  });
}

export async function clearAllHistory(): Promise<void> {
  await chrome.storage.local.remove([WS_KEY, FILE_KEY, 'historyFileGroupExpanded']);
}

export function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
