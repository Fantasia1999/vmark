import { createIconEl } from '../shared/icons';
import type { WorkspaceTreeNode } from '../shared/workspaceFs';

export interface WorkspaceUiHandlers {
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCloseWorkspace: () => void;
  onOpenSingleFile: () => void;
}

/** Persist expand/collapse across re-renders (path → expanded). */
const expandedDirs = new Map<string, boolean>();
/** After first tree of a workspace session, stop auto-expanding everything. */
let seededExpand = false;

function collectDirPaths(nodes: WorkspaceTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind === 'dir') {
      out.push(n.path);
      collectDirPaths(n.children, out);
    }
  }
  return out;
}

/** Expand every directory once when a workspace is first shown. */
function seedExpandAll(tree: WorkspaceTreeNode[]): void {
  if (seededExpand) {
    return;
  }
  for (const path of collectDirPaths(tree)) {
    if (!expandedDirs.has(path)) {
      expandedDirs.set(path, true);
    }
  }
  seededExpand = true;
}

function ensureAncestorsExpanded(activePath: string | undefined): void {
  if (!activePath) {
    return;
  }
  const parts = activePath.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    expandedDirs.set(acc, true);
  }
}

function isDirExpanded(path: string): boolean {
  // Unknown dirs default to expanded (friendly for new folders after refresh)
  if (!expandedDirs.has(path)) {
    return true;
  }
  return expandedDirs.get(path) === true;
}

function setDirExpanded(path: string, open: boolean): void {
  expandedDirs.set(path, open);
}

export function renderFileTree(
  container: HTMLElement,
  tree: WorkspaceTreeNode[],
  activePath: string | undefined,
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile'>,
): void {
  seedExpandAll(tree);
  ensureAncestorsExpanded(activePath);
  container.replaceChildren();
  const ul = document.createElement('ul');
  ul.className = 'ws-tree';
  ul.setAttribute('role', 'tree');
  appendNodes(ul, tree, activePath, handlers, 0);
  container.appendChild(ul);

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
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile'>,
  depth: number,
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
      row.title = isOpen ? `收起 ${node.path}` : `展开 ${node.path}`;

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
      count.title = `${fileCount} 个 Markdown`;

      row.append(twisty, folderIcon, label, count);

      const childUl = document.createElement('ul');
      childUl.className = 'ws-tree ws-tree-children';
      childUl.setAttribute('role', 'group');
      appendNodes(childUl, node.children, activePath, handlers, depth + 1);

      setDirRowUi(li, row, twisty, childUl, isOpen);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const next = li.classList.contains('is-collapsed');
        setDirExpanded(node.path, next);
        setDirRowUi(li, row, twisty, childUl, next);
        row.title = next ? `收起 ${node.path}` : `展开 ${node.path}`;
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
      const icon = document.createElement('span');
      icon.className = 'ws-file-icon';
      icon.appendChild(createIconEl('mdFile'));
      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;
      row.append(icon, label);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.path === activePath) {
          return;
        }
        handlers.onOpenFile(node.path);
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
}

/** Reset expand cache (e.g. closing workspace). */
export function clearFileTreeExpandState(): void {
  expandedDirs.clear();
  seededExpand = false;
}
