/**
 * Workspace support via the File System Access API (directory handles).
 * Handles are persisted in IndexedDB so a folder can be reopened across reloads.
 */

import { isPreviewableFileName } from './localDoc';

const DB_NAME = 'vscode-md-preview-workspace';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'root';
const META_KEY = 'workspaceMeta';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.turbo',
  '.idea',
  '.vscode',
]);

const MAX_MD_FILES = 2000;
const MAX_DEPTH = 12;

export interface WorkspaceMeta {
  name: string;
  savedAt: number;
  lastFilePath?: string;
}

export interface WorkspaceFileEntry {
  /** POSIX-style path relative to workspace root, e.g. docs/guide.md */
  path: string;
  name: string;
  /** directory segments for tree UI */
  dir: string;
}

export type WorkspaceTreeNode =
  | { kind: 'dir'; name: string; path: string; children: WorkspaceTreeNode[] }
  | { kind: 'file'; name: string; path: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isDirectoryPickerSupported()) {
    throw new Error('当前浏览器不支持打开文件夹（需要 Chromium File System Access API）');
  }
  const handle = await window.showDirectoryPicker({
    id: 'vscode-md-preview-workspace',
    mode: 'read',
    startIn: 'documents',
  });
  await saveWorkspaceHandle(handle);
  return handle;
}

export async function saveWorkspaceHandle(
  handle: FileSystemDirectoryHandle,
  lastFilePath?: string,
): Promise<void> {
  await idbSet(HANDLE_KEY, handle);
  const meta: WorkspaceMeta = {
    name: handle.name,
    savedAt: Date.now(),
    lastFilePath,
  };
  await idbSet(META_KEY, meta);
  try {
    await chrome.storage.session.set({
      workspaceName: handle.name,
      workspaceLastFile: lastFilePath ?? null,
    });
  } catch {
    // optional
  }
}

export async function loadWorkspaceMeta(): Promise<WorkspaceMeta | null> {
  return (await idbGet<WorkspaceMeta>(META_KEY)) ?? null;
}

export async function loadWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  return handle ?? null;
}

export async function clearWorkspace(): Promise<void> {
  await idbDelete(HANDLE_KEY);
  await idbDelete(META_KEY);
  try {
    await chrome.storage.session.remove(['workspaceName', 'workspaceLastFile']);
  } catch {
    // ignore
  }
}

export type PermissionStateResult = PermissionState | 'unsupported';

export async function ensureReadPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = true,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' };
  // queryPermission / requestPermission exist on FileSystemHandle in Chromium
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
    requestPermission?: (o: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  };
  if (typeof h.queryPermission !== 'function') {
    return true;
  }
  let state = await h.queryPermission(opts);
  if (state === 'granted') {
    return true;
  }
  if (requestIfNeeded && typeof h.requestPermission === 'function') {
    state = await h.requestPermission(opts);
  }
  return state === 'granted';
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/**
 * Recursively list previewable files (Markdown + SVG) under the workspace root.
 */
export async function listMarkdownFiles(
  root: FileSystemDirectoryHandle,
): Promise<WorkspaceFileEntry[]> {
  const out: WorkspaceFileEntry[] = [];

  async function walk(dir: FileSystemDirectoryHandle, rel: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_MD_FILES) {
      return;
    }
    // values() yields FileSystemHandle in Chromium
    for await (const handle of (
      dir as FileSystemDirectoryHandle & {
        values(): AsyncIterable<FileSystemHandle>;
      }
    ).values()) {
      if (out.length >= MAX_MD_FILES) {
        break;
      }
      if (handle.kind === 'directory') {
        if (SKIP_DIRS.has(handle.name) || handle.name.startsWith('.')) {
          continue;
        }
        await walk(handle as FileSystemDirectoryHandle, joinPath(rel, handle.name), depth + 1);
      } else if (handle.kind === 'file' && isPreviewableFileName(handle.name)) {
        const path = joinPath(rel, handle.name);
        out.push({
          path,
          name: handle.name,
          dir: rel,
        });
      }
    }
  }

  await walk(root, '', 0);
  out.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  return out;
}

export function buildFileTree(files: WorkspaceFileEntry[]): WorkspaceTreeNode[] {
  type DirNode = {
    kind: 'dir';
    name: string;
    path: string;
    children: WorkspaceTreeNode[];
    map: Map<string, DirNode>;
  };

  const rootChildren: WorkspaceTreeNode[] = [];
  const rootMap = new Map<string, DirNode>();

  function ensureDir(segments: string[]): DirNode | null {
    if (!segments.length) {
      return null;
    }
    let map = rootMap;
    let list = rootChildren;
    let pathAcc = '';
    let node: DirNode | null = null;
    for (const seg of segments) {
      pathAcc = pathAcc ? `${pathAcc}/${seg}` : seg;
      let next = map.get(seg);
      if (!next) {
        next = { kind: 'dir', name: seg, path: pathAcc, children: [], map: new Map() };
        map.set(seg, next);
        list.push(next);
      }
      node = next;
      map = next.map;
      list = next.children;
    }
    return node;
  }

  for (const f of files) {
    const segments = f.dir ? f.dir.split('/').filter(Boolean) : [];
    const fileNode: WorkspaceTreeNode = { kind: 'file', name: f.name, path: f.path };
    if (!segments.length) {
      rootChildren.push(fileNode);
    } else {
      const dir = ensureDir(segments);
      dir?.children.push(fileNode);
    }
  }

  const sortNodes = (nodes: WorkspaceTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    for (const n of nodes) {
      if (n.kind === 'dir') {
        sortNodes(n.children);
      }
    }
  };
  sortNodes(rootChildren);

  // strip internal map fields by returning plain nodes
  const strip = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    nodes.map((n) =>
      n.kind === 'dir'
        ? { kind: 'dir', name: n.name, path: n.path, children: strip(n.children) }
        : n,
    );
  return strip(rootChildren);
}

/**
 * Resolve a path relative to workspace root (POSIX, no leading slash).
 */
export async function getFileHandleByPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length) {
    return null;
  }
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (seg === '..' || seg === '.') {
      continue;
    }
    try {
      dir = await dir.getDirectoryHandle(seg);
    } catch {
      return null;
    }
  }
  const fileName = parts[parts.length - 1];
  try {
    return await dir.getFileHandle(fileName);
  } catch {
    return null;
  }
}

/** Resolve path relative to a file's directory within the workspace. */
export function resolveRelativePath(fromFilePath: string, relativeHref: string): string {
  const clean = relativeHref.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('/')) {
    // treat absolute-from-root paths as workspace-root relative
    return clean.replace(/^\/+/, '');
  }
  const baseDir = fromFilePath.includes('/')
    ? fromFilePath.slice(0, fromFilePath.lastIndexOf('/'))
    : '';
  const stack = baseDir ? baseDir.split('/') : [];
  for (const part of clean.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

export async function readWorkspaceTextFile(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<{ text: string; file: File } | null> {
  const fh = await getFileHandleByPath(root, relativePath);
  if (!fh) {
    return null;
  }
  const file = await fh.getFile();
  const text = await file.text();
  return { text, file };
}

/**
 * Create an object URL for a workspace-relative asset (images, etc.).
 * Caller should revoke when done.
 */
export async function createWorkspaceObjectUrl(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string | null> {
  const fh = await getFileHandleByPath(root, relativePath);
  if (!fh) {
    return null;
  }
  const file = await fh.getFile();
  return URL.createObjectURL(file);
}
