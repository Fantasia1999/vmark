/**
 * Workbench sidebar: collapse toggle + drag-to-resize.
 * Width/collapsed state persist in chrome.storage.local across sessions.
 */

export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 600;
/** Keep at least this much room for the content pane while dragging. */
export const CONTENT_MIN_WIDTH = 320;

const WIDTH_KEY = 'wsSidebarWidth';
const COLLAPSED_KEY = 'wsSidebarCollapsed';

/**
 * Clamp a requested sidebar width against fixed bounds and the viewport
 * (never squeeze the content pane below CONTENT_MIN_WIDTH).
 */
export function clampSidebarWidth(px: number, viewportWidth: number): number {
  if (!Number.isFinite(px)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  const byViewport = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - CONTENT_MIN_WIDTH);
  const max = Math.min(SIDEBAR_MAX_WIDTH, byViewport);
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, px)));
}

interface SidebarState {
  width: number;
  collapsed: boolean;
}

async function loadState(): Promise<SidebarState> {
  try {
    const s = await chrome.storage.local.get({
      [WIDTH_KEY]: SIDEBAR_DEFAULT_WIDTH,
      [COLLAPSED_KEY]: false,
    });
    return {
      width: Number(s[WIDTH_KEY]) || SIDEBAR_DEFAULT_WIDTH,
      collapsed: Boolean(s[COLLAPSED_KEY]),
    };
  } catch {
    return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
  }
}

function persist(partial: Partial<Record<string, unknown>>): void {
  try {
    void chrome.storage.local.set(partial);
  } catch {
    // non-fatal
  }
}

function applyWidth(shell: HTMLElement, width: number): void {
  shell.style.setProperty('--ws-sidebar-width', `${width}px`);
}

function applyCollapsed(shell: HTMLElement, collapsed: boolean): void {
  shell.classList.toggle('sidebar-collapsed', collapsed);
  const collapseBtn = document.getElementById('ws-btn-collapse');
  collapseBtn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

/** Wire collapse button, expand rail, and the drag resizer. Call once. */
export function initSidebarUi(): void {
  const shell = document.getElementById('workspace-shell');
  const resizer = document.getElementById('ws-sidebar-resizer');
  if (!shell) {
    return;
  }

  let width = SIDEBAR_DEFAULT_WIDTH;
  let collapsed = false;

  void loadState().then((state) => {
    width = clampSidebarWidth(state.width, window.innerWidth);
    collapsed = state.collapsed;
    applyWidth(shell, width);
    applyCollapsed(shell, collapsed);
  });

  const setCollapsed = (next: boolean): void => {
    collapsed = next;
    applyCollapsed(shell, collapsed);
    persist({ [COLLAPSED_KEY]: collapsed });
  };

  document
    .getElementById('ws-btn-collapse')
    ?.addEventListener('click', () => setCollapsed(true));
  document
    .getElementById('ws-btn-expand')
    ?.addEventListener('click', () => setCollapsed(false));

  if (!resizer) {
    return;
  }

  let dragPointerId: number | null = null;

  resizer.addEventListener('pointerdown', (e) => {
    if (collapsed) {
      return;
    }
    dragPointerId = e.pointerId;
    resizer.setPointerCapture(e.pointerId);
    // Iframes (SVG preview) swallow pointermove; suspend them while dragging
    document.body.classList.add('ws-resizing');
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', (e) => {
    if (dragPointerId !== e.pointerId) {
      return;
    }
    width = clampSidebarWidth(e.clientX, window.innerWidth);
    applyWidth(shell, width);
  });

  const endDrag = (e: PointerEvent): void => {
    if (dragPointerId !== e.pointerId) {
      return;
    }
    dragPointerId = null;
    document.body.classList.remove('ws-resizing');
    persist({ [WIDTH_KEY]: width });
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);

  // Double-click: reset to the default width
  resizer.addEventListener('dblclick', () => {
    width = SIDEBAR_DEFAULT_WIDTH;
    applyWidth(shell, width);
    persist({ [WIDTH_KEY]: width });
  });

  // Keyboard accessibility on the separator
  resizer.addEventListener('keydown', (e) => {
    if (collapsed) {
      return;
    }
    const step = e.shiftKey ? 40 : 12;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      width = clampSidebarWidth(
        width + (e.key === 'ArrowLeft' ? -step : step),
        window.innerWidth,
      );
      applyWidth(shell, width);
      persist({ [WIDTH_KEY]: width });
    } else if (e.key === 'Home') {
      e.preventDefault();
      width = SIDEBAR_DEFAULT_WIDTH;
      applyWidth(shell, width);
      persist({ [WIDTH_KEY]: width });
    }
  });

  // Re-clamp when the window shrinks below the stored width
  window.addEventListener('resize', () => {
    const clamped = clampSidebarWidth(width, window.innerWidth);
    if (clamped !== width) {
      width = clamped;
      applyWidth(shell, width);
    }
  });
}
