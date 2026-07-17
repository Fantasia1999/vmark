import type { WorkspaceTreeNode } from '../shared/workspaceFs';

export interface WorkspaceUiHandlers {
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCloseWorkspace: () => void;
  onOpenSingleFile: () => void;
}

export function renderFileTree(
  container: HTMLElement,
  tree: WorkspaceTreeNode[],
  activePath: string | undefined,
  handlers: Pick<WorkspaceUiHandlers, 'onOpenFile'>,
): void {
  container.replaceChildren();
  const ul = document.createElement('ul');
  ul.className = 'ws-tree';
  appendNodes(ul, tree, activePath, handlers, 0);
  container.appendChild(ul);
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

    if (node.kind === 'dir') {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-row ws-dir-row';
      row.style.paddingLeft = `${8 + depth * 12}px`;
      const twisty = document.createElement('span');
      twisty.className = 'ws-twisty open';
      twisty.textContent = '▾';
      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;
      row.append(twisty, label);

      const childUl = document.createElement('ul');
      childUl.className = 'ws-tree';
      appendNodes(childUl, node.children, activePath, handlers, depth + 1);

      row.addEventListener('click', () => {
        const open = childUl.hidden;
        childUl.hidden = !open;
        twisty.classList.toggle('open', open);
        twisty.textContent = open ? '▾' : '▸';
      });

      li.append(row, childUl);
    } else {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-row ws-file-row';
      row.style.paddingLeft = `${8 + depth * 12 + 14}px`;
      if (node.path === activePath) {
        row.classList.add('active');
      }
      const icon = document.createElement('span');
      icon.className = 'ws-file-icon';
      icon.textContent = 'MD';
      const label = document.createElement('span');
      label.className = 'ws-label';
      label.textContent = node.name;
      label.title = node.path;
      row.append(icon, label);
      row.addEventListener('click', () => handlers.onOpenFile(node.path));
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
  }
}
