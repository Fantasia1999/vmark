import { createIconEl } from '../shared/icons';
import type { WorkspaceTreeNode } from '../shared/workspaceFs';

export interface WorkspaceUiHandlers {
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCloseWorkspace: () => void;
  onOpenSingleFile: () => void;
}

/** Persist expand/collapse across re-renders */
const expandedDirs = new Set<string>();

function ensureAncestorsExpanded(activePath: string | undefined): void {
  if (!activePath) {
    return;
  }
  const parts = activePath.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    expandedDirs.add(acc);
  }
}

export function renderFileTree(
  container: HTMLElement,
  tree: WorkspaceTreeNode[],
  activePath: string | undefined,
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile'>,
): void {
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
      const isOpen = expandedDirs.has(node.path);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-row ws-dir-row';
      row.style.paddingLeft = `${8 + depth * 12}px`;
      row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      row.title = node.path;

      const twisty = document.createElement('span');
      twisty.className = `ws-twisty${isOpen ? ' open' : ''}`;
      twisty.appendChild(
        createIconEl(isOpen ? 'chevronDown' : 'chevronRight', 'vsc-icon vsc-icon-sm'),
      );

      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;
      row.append(twisty, label);

      const childUl = document.createElement('ul');
      childUl.className = 'ws-tree';
      childUl.setAttribute('role', 'group');
      childUl.hidden = !isOpen;
      appendNodes(childUl, node.children, activePath, handlers, depth + 1);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = childUl.hidden;
        childUl.hidden = !open;
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
        twisty.classList.toggle('open', open);
        twisty.replaceChildren(
          createIconEl(open ? 'chevronDown' : 'chevronRight', 'vsc-icon vsc-icon-sm'),
        );
        if (open) {
          expandedDirs.add(node.path);
        } else {
          expandedDirs.delete(node.path);
        }
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
          return; // already open
        }
        handlers.onOpenFile(node.path);
      });
      li.append(row);
    }
    parent.appendChild(li);
  }
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
}
