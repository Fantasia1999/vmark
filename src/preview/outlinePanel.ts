/**
 * Compact floating outline (TOC) panel with pin support.
 * Does not reserve page layout — overlays the content.
 */

import { createIconEl } from '../shared/icons';
import {
  createOutlineScrollSpy,
  extractOutlineFromDom,
  renderOutline,
  setOutlineActive,
  type OutlineItem,
} from './outline';

export const OUTLINE_PANEL_ID = 'vscode-md-outline-panel';
const PIN_STORAGE_KEY = 'outlinePinned';

export interface OutlinePanelOptions {
  /** Element used as IntersectionObserver root (scroll container) */
  getScrollRoot: () => Element;
  /** Called when open/pin state changes (for toolbar active state) */
  onStateChange?: (state: { open: boolean; pinned: boolean }) => void;
}

export class OutlineFloatingPanel {
  #open = false;
  #pinned = false;
  #items: OutlineItem[] = [];
  #stopSpy: (() => void) | undefined;
  #outsideHandler: ((e: MouseEvent) => void) | undefined;
  #opts: OutlinePanelOptions;
  #dragCleanup: (() => void) | undefined;

  constructor(opts: OutlinePanelOptions) {
    this.#opts = opts;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get isPinned(): boolean {
    return this.#pinned;
  }

  async loadPinPreference(): Promise<void> {
    try {
      const stored = await chrome.storage.session.get(PIN_STORAGE_KEY);
      if (typeof stored[PIN_STORAGE_KEY] === 'boolean') {
        this.#pinned = stored[PIN_STORAGE_KEY];
      }
    } catch {
      // ignore
    }
  }

  async #savePin(): Promise<void> {
    try {
      await chrome.storage.session.set({ [PIN_STORAGE_KEY]: this.#pinned });
    } catch {
      // ignore
    }
  }

  #emit(): void {
    this.#opts.onStateChange?.({ open: this.#open, pinned: this.#pinned });
  }

  #ensurePanel(): HTMLElement {
    let panel = document.getElementById(OUTLINE_PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = OUTLINE_PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '文档大纲');
    panel.innerHTML = `
      <div class="md-outline-header" data-drag-handle>
        <span class="md-outline-title">大纲</span>
        <span class="md-outline-actions">
          <button type="button" data-action="pin" class="vsc-icon-btn" title="固定悬浮窗（切换文件/点击外部不关闭）" aria-pressed="false" aria-label="固定"></button>
          <button type="button" data-action="close" class="vsc-icon-btn" title="关闭" aria-label="关闭"></button>
        </span>
      </div>
      <div class="md-outline-body"></div>
    `;

    const pinBtn = panel.querySelector('[data-action="pin"]') as HTMLButtonElement;
    const closeBtn = panel.querySelector('[data-action="close"]') as HTMLButtonElement;
    pinBtn.replaceChildren(createIconEl('pin'));
    closeBtn.replaceChildren(createIconEl('close'));

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.togglePin();
    });

    this.#wireDrag(panel);
    document.documentElement.appendChild(panel);
    this.#syncPinUi(panel);
    return panel;
  }

  #syncPinUi(panel: HTMLElement): void {
    panel.classList.toggle('is-pinned', this.#pinned);
    const pinBtn = panel.querySelector('[data-action="pin"]') as HTMLButtonElement | null;
    if (pinBtn) {
      pinBtn.setAttribute('aria-pressed', this.#pinned ? 'true' : 'false');
      pinBtn.classList.toggle('active', this.#pinned);
      pinBtn.title = this.#pinned
        ? '取消固定'
        : '固定悬浮窗（切换文件/点击外部不关闭）';
      pinBtn.setAttribute('aria-label', this.#pinned ? '取消固定' : '固定');
      pinBtn.replaceChildren(createIconEl(this.#pinned ? 'pinFilled' : 'pin'));
    }
  }

  #wireDrag(panel: HTMLElement): void {
    this.#dragCleanup?.();
    const handle = panel.querySelector('[data-drag-handle]') as HTMLElement | null;
    if (!handle) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;
    let dragging = false;

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origLeft = rect.left;
      origTop = rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${origLeft}px`;
      panel.style.top = `${origTop}px`;
      panel.classList.add('is-dragging');
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxL = window.innerWidth - panel.offsetWidth - 8;
      const maxT = window.innerHeight - 48;
      panel.style.left = `${Math.min(maxL, Math.max(8, origLeft + dx))}px`;
      panel.style.top = `${Math.min(maxT, Math.max(8, origTop + dy))}px`;
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      panel.classList.remove('is-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    this.#dragCleanup = () => {
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
  }

  #escHandler: ((e: KeyboardEvent) => void) | undefined;

  #bindOutsideClick(): void {
    this.#unbindOutsideClick();
    this.#outsideHandler = (e: MouseEvent) => {
      if (this.#pinned || !this.#open) {
        return;
      }
      const panel = document.getElementById(OUTLINE_PANEL_ID);
      const t = e.target as Node;
      if (panel?.contains(t)) {
        return;
      }
      // Ignore toolbar outline button
      if ((t as HTMLElement).closest?.('#vscode-md-preview-toolbar [data-action="outline"]')) {
        return;
      }
      this.close();
    };
    this.#escHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !this.#open) {
        return;
      }
      // Let modal dialogs take precedence
      const wsl = document.getElementById('wsl-dialog');
      const ssh = document.getElementById('ssh-dialog');
      if ((wsl && !wsl.hidden) || (ssh && !ssh.hidden)) {
        return;
      }
      if (this.#pinned) {
        return;
      }
      e.preventDefault();
      this.close();
    };
    // next tick so the opening click doesn't immediately close
    window.setTimeout(() => {
      if (this.#outsideHandler) {
        document.addEventListener('mousedown', this.#outsideHandler, true);
      }
      if (this.#escHandler) {
        document.addEventListener('keydown', this.#escHandler, true);
      }
    }, 0);
  }

  #unbindOutsideClick(): void {
    if (this.#outsideHandler) {
      document.removeEventListener('mousedown', this.#outsideHandler, true);
      this.#outsideHandler = undefined;
    }
    if (this.#escHandler) {
      document.removeEventListener('keydown', this.#escHandler, true);
      this.#escHandler = undefined;
    }
  }

  navigateToHeading(id: string): void {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('md-outline-target');
    window.setTimeout(() => el.classList.remove('md-outline-target'), 1200);
    const body = document.querySelector(`#${OUTLINE_PANEL_ID} .md-outline-body`);
    if (body instanceof HTMLElement) {
      setOutlineActive(body, id);
    }
    try {
      history.replaceState(null, '', `#${encodeURIComponent(id)}`);
    } catch {
      // ignore
    }
  }

  /**
   * Rebuild list + scroll spy from a rendered markdown root.
   * No-op if panel is closed (unless force when open).
   */
  updateFromDom(previewRoot: ParentNode | null): void {
    if (!this.#open) {
      return;
    }
    const panel = this.#ensurePanel();
    const body = panel.querySelector('.md-outline-body') as HTMLElement;
    this.#stopSpy?.();
    this.#stopSpy = undefined;

    this.#items = previewRoot ? extractOutlineFromDom(previewRoot) : [];
    renderOutline(body, this.#items, {
      onNavigate: (id) => this.navigateToHeading(id),
      emptyText: '没有标题',
    });

    const count = panel.querySelector('.md-outline-title');
    if (count) {
      count.textContent = this.#items.length ? `大纲 · ${this.#items.length}` : '大纲';
    }

    if (this.#items.length) {
      this.#stopSpy = createOutlineScrollSpy(
        this.#opts.getScrollRoot(),
        this.#items.map((i) => i.id),
        (id) => setOutlineActive(body, id),
      );
    }
  }

  open(previewRoot?: ParentNode | null): void {
    this.#open = true;
    const panel = this.#ensurePanel();
    panel.hidden = false;
    panel.setAttribute('aria-modal', 'false');
    this.#syncPinUi(panel);
    this.updateFromDom(previewRoot ?? document.getElementById('vscode-md-preview-root'));
    // Always listen for Esc when unpinned; pin also keeps outside-click off
    if (!this.#pinned) {
      this.#bindOutsideClick();
    } else {
      this.#unbindOutsideClick();
    }
    // Focus panel body for keyboard users without trapping
    const body = panel.querySelector('.md-outline-body') as HTMLElement | null;
    body?.setAttribute('tabindex', '-1');
    body?.focus({ preventScroll: true });
    this.#emit();
  }

  close(): void {
    this.#open = false;
    this.#stopSpy?.();
    this.#stopSpy = undefined;
    this.#unbindOutsideClick();
    const panel = document.getElementById(OUTLINE_PANEL_ID);
    if (panel) {
      panel.hidden = true;
    }
    this.#emit();
  }

  toggle(previewRoot?: ParentNode | null): void {
    if (this.#open) {
      this.close();
    } else {
      this.open(previewRoot);
    }
  }

  async togglePin(): Promise<void> {
    this.#pinned = !this.#pinned;
    await this.#savePin();
    const panel = document.getElementById(OUTLINE_PANEL_ID);
    if (panel) {
      this.#syncPinUi(panel);
    }
    if (this.#open) {
      if (this.#pinned) {
        this.#unbindOutsideClick();
      } else {
        this.#bindOutsideClick();
      }
    }
    this.#emit();
  }

  /** Destroy DOM (e.g. leaving preview). Keeps pin preference. */
  dispose(): void {
    this.close();
    this.#dragCleanup?.();
    this.#dragCleanup = undefined;
    document.getElementById(OUTLINE_PANEL_ID)?.remove();
  }
}

/** Compact floating panel styles (no layout reservation). */
export const outlinePanelCss = `
.md-outline {
  font-size: 12px;
  line-height: 1.3;
}
.md-outline-empty {
  margin: 0;
  padding: 8px 10px;
  opacity: 0.55;
  font-size: 11px;
}
.md-outline-list {
  list-style: none;
  margin: 0;
  padding: 2px 0 6px;
}
.md-outline-item { margin: 0; }
.md-outline-link {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 2px 8px 2px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.88;
  border-radius: 3px;
}
.md-outline-link:hover {
  background: var(--vscode-list-hoverBackground, rgba(90, 93, 94, 0.35));
  opacity: 1;
}
.md-outline-link.active {
  background: color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 32%, transparent);
  opacity: 1;
  font-weight: 500;
}

#vscode-md-outline-panel {
  position: fixed;
  top: 52px;
  right: 12px;
  left: auto;
  bottom: auto;
  width: min(220px, 36vw);
  max-height: min(52vh, 420px);
  z-index: 2147483645;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 92%, transparent);
  backdrop-filter: blur(10px);
  color: var(--vscode-editor-foreground, #ccc);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 8px;
  box-shadow: 0 6px 20px var(--vscode-widget-shadow, rgba(0,0,0,.35));
  overflow: hidden;
  font-family: var(--markdown-font-family, system-ui, sans-serif);
  font-size: 12px;
}
#vscode-md-outline-panel[hidden] {
  display: none !important;
}
#vscode-md-outline-panel.is-pinned {
  border-color: color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 55%, var(--vscode-editorWidget-border, #454545));
}
#vscode-md-outline-panel.is-dragging {
  opacity: 0.92;
  user-select: none;
}
#vscode-md-outline-panel .md-outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 6px 4px 8px;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
  font-size: 11px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  background: color-mix(in srgb, var(--vscode-editorWidget-background, #252526) 80%, transparent);
}
#vscode-md-outline-panel .md-outline-header:active {
  cursor: grabbing;
}
#vscode-md-outline-panel .md-outline-title {
  opacity: 0.8;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
#vscode-md-outline-panel .md-outline-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
#vscode-md-outline-panel .md-outline-header button {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  opacity: 0.75;
}
#vscode-md-outline-panel .md-outline-header button:hover {
  background: var(--vscode-toolbar-hoverBackground, rgba(90,93,94,.31));
  opacity: 1;
}
#vscode-md-outline-panel .md-outline-header button.active {
  opacity: 1;
  color: var(--vscode-focusBorder, #3794ff);
  background: color-mix(in srgb, var(--vscode-focusBorder, #007fd4) 18%, transparent);
}
#vscode-md-outline-panel .md-outline-body {
  flex: 1;
  overflow: auto;
  padding: 2px 4px 4px;
  min-height: 0;
}
`;
