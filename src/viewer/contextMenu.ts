/**
 * Lightweight floating context menu for the workbench file tree.
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  /** Visual separator before this item */
  separatorBefore?: boolean;
  danger?: boolean;
}

export type ContextMenuChoice = string | null;

const MENU_ID = 'ws-context-menu';

let openMenu: HTMLElement | null = null;
let outsideHandler: ((e: Event) => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function closeContextMenu(): void {
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler, true);
    document.removeEventListener('contextmenu', outsideHandler, true);
    outsideHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
  }
  openMenu?.remove();
  openMenu = null;
}

/**
 * Show a menu at page coordinates. Resolves with item id or null if dismissed.
 */
export function showContextMenu(
  clientX: number,
  clientY: number,
  items: ContextMenuItem[],
): Promise<ContextMenuChoice> {
  closeContextMenu();

  return new Promise((resolve) => {
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'ws-context-menu';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;

    const finish = (id: ContextMenuChoice): void => {
      closeContextMenu();
      resolve(id);
    };

    for (const item of items) {
      if (item.separatorBefore) {
        const sep = document.createElement('div');
        sep.className = 'ws-context-sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-context-item';
      btn.setAttribute('role', 'menuitem');
      btn.dataset.id = item.id;
      btn.textContent = item.label;
      if (item.disabled) {
        btn.disabled = true;
      }
      if (item.danger) {
        btn.classList.add('danger');
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!item.disabled) {
          finish(item.id);
        }
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    openMenu = menu;

    // Position within viewport
    const pad = 6;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    outsideHandler = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menu.contains(t)) {
        return;
      }
      finish(null);
    };
    keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };

    // Defer so the opening contextmenu event does not immediately dismiss
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', outsideHandler!, true);
      document.addEventListener('contextmenu', outsideHandler!, true);
      document.addEventListener('keydown', keyHandler!, true);
      menu.focus();
    });
  });
}
