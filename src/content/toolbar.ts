import { createIconEl, setButtonIcon } from '../shared/icons';
import { formatPreviewZoom } from '../shared/previewZoom';

export type PreviewMode = 'preview' | 'source';

export interface ToolbarHandlers {
  onToggleMode: (mode: PreviewMode) => void;
  onOpenOptions: () => void;
  /** Optional: toggle document outline / TOC */
  onToggleOutline?: () => void;
  outlineOpen?: boolean;
  /** Viewer: open a single local file */
  onOpenFile?: () => void;
  /** Viewer: open local workspace folder */
  onOpenFolder?: () => void;
  /** Preview content zoom (0.5–2.5); not chrome UI */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  /** Current zoom factor for label (e.g. 1 = 100%) */
  zoom?: number;
}

const TOOLBAR_ID = 'vscode-md-preview-toolbar';

interface ToolbarRuntime {
  handlers: ToolbarHandlers;
  mode: PreviewMode;
}

function getRuntime(bar: HTMLElement): ToolbarRuntime | undefined {
  return (bar as HTMLElement & { __tb?: ToolbarRuntime }).__tb;
}

function setRuntime(bar: HTMLElement, runtime: ToolbarRuntime): void {
  (bar as HTMLElement & { __tb?: ToolbarRuntime }).__tb = runtime;
}

function ensureButton(
  bar: HTMLElement,
  action: string,
  factory: () => HTMLButtonElement,
): HTMLButtonElement {
  let btn = bar.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) {
    btn = factory();
    btn.dataset.action = action;
    bar.appendChild(btn);
  }
  return btn;
}

/**
 * Mount or update the floating preview toolbar in place (avoids focus flash).
 */
export function mountToolbar(
  mode: PreviewMode,
  handlers: ToolbarHandlers,
): HTMLElement {
  let bar = document.getElementById(TOOLBAR_ID) as HTMLElement | null;
  const created = !bar;

  if (!bar) {
    bar = document.createElement('div');
    bar.id = TOOLBAR_ID;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Markdown preview');

    const label = document.createElement('span');
    label.className = 'vsc-md-label';
    label.title = 'VS Code Markdown Preview';
    label.appendChild(createIconEl('brand'));
    bar.appendChild(label);

    bar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || !bar!.contains(btn)) {
        return;
      }
      const rt = getRuntime(bar!);
      if (!rt) {
        return;
      }
      const action = btn.dataset.action;
      switch (action) {
        case 'preview':
          rt.handlers.onToggleMode('preview');
          break;
        case 'source':
          rt.handlers.onToggleMode('source');
          break;
        case 'outline':
          rt.handlers.onToggleOutline?.();
          break;
        case 'options':
          rt.handlers.onOpenOptions();
          break;
        case 'open-file':
          rt.handlers.onOpenFile?.();
          break;
        case 'open-folder':
          rt.handlers.onOpenFolder?.();
          break;
        case 'zoom-in':
          rt.handlers.onZoomIn?.();
          break;
        case 'zoom-out':
          rt.handlers.onZoomOut?.();
          break;
        case 'zoom-label':
          rt.handlers.onZoomReset?.();
          break;
      }
    });

    document.documentElement.appendChild(bar);
  }

  setRuntime(bar, { handlers, mode });

  // Mode buttons
  const previewBtn = ensureButton(bar, 'preview', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Preview';
    b.title = '预览';
    return b;
  });
  const sourceBtn = ensureButton(bar, 'source', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Source';
    b.title = '源码';
    return b;
  });
  previewBtn.classList.toggle('active', mode === 'preview');
  sourceBtn.classList.toggle('active', mode === 'source');
  previewBtn.setAttribute('aria-pressed', mode === 'preview' ? 'true' : 'false');
  sourceBtn.setAttribute('aria-pressed', mode === 'source' ? 'true' : 'false');

  // Outline
  let outlineBtn = bar.querySelector<HTMLButtonElement>('button[data-action="outline"]');
  if (handlers.onToggleOutline) {
    if (!outlineBtn) {
      outlineBtn = document.createElement('button');
      outlineBtn.type = 'button';
      outlineBtn.className = 'vsc-icon-btn';
      outlineBtn.dataset.action = 'outline';
      outlineBtn.title = '文档大纲';
      setButtonIcon(outlineBtn, 'outline');
      // insert before options if present, else append
      const options = bar.querySelector('button[data-action="options"]');
      if (options) {
        bar.insertBefore(outlineBtn, options);
      } else {
        bar.appendChild(outlineBtn);
      }
    }
    outlineBtn.hidden = false;
    outlineBtn.classList.toggle('active', !!handlers.outlineOpen);
    outlineBtn.setAttribute('aria-pressed', handlers.outlineOpen ? 'true' : 'false');
  } else if (outlineBtn) {
    outlineBtn.hidden = true;
  }

  // Optional workspace actions (viewer)
  if (handlers.onOpenFile) {
    ensureButton(bar, 'open-file', () => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'File…';
      b.title = '打开单个文件';
      return b;
    }).hidden = false;
  } else {
    const b = bar.querySelector<HTMLButtonElement>('button[data-action="open-file"]');
    if (b) b.hidden = true;
  }

  if (handlers.onOpenFolder) {
    ensureButton(bar, 'open-folder', () => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Folder…';
      b.title = '打开本地文件夹';
      return b;
    }).hidden = false;
  } else {
    const b = bar.querySelector<HTMLButtonElement>('button[data-action="open-folder"]');
    if (b) b.hidden = true;
  }

  // Zoom group (content only) — before options
  ensureZoomGroup(bar, handlers);

  // Options always last
  const optionsBtn = ensureButton(bar, 'options', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vsc-icon-btn';
    b.title = '选项';
    setButtonIcon(b, 'settings');
    return b;
  });
  // keep options at end
  bar.appendChild(optionsBtn);

  if (created) {
    // subtle enter animation
    bar.classList.add('vsc-toolbar-enter');
    requestAnimationFrame(() => bar!.classList.add('vsc-toolbar-ready'));
  }

  return bar;
}

function ensureZoomGroup(bar: HTMLElement, handlers: ToolbarHandlers): void {
  let group = bar.querySelector<HTMLElement>('.vsc-zoom-group');
  if (!group) {
    group = document.createElement('span');
    group.className = 'vsc-zoom-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '预览缩放');

    const out = document.createElement('button');
    out.type = 'button';
    out.dataset.action = 'zoom-out';
    out.title = '缩小预览 (Ctrl+-)';
    out.setAttribute('aria-label', '缩小预览');
    out.textContent = '−';

    const label = document.createElement('button');
    label.type = 'button';
    label.dataset.action = 'zoom-label';
    label.title = '重置为 100% (Ctrl+0)';
    label.setAttribute('aria-label', '重置缩放');
    label.textContent = '100%';

    const inn = document.createElement('button');
    inn.type = 'button';
    inn.dataset.action = 'zoom-in';
    inn.title = '放大预览 (Ctrl+=)';
    inn.setAttribute('aria-label', '放大预览');
    inn.textContent = '+';

    group.append(out, label, inn);

    const options = bar.querySelector('button[data-action="options"]');
    if (options) {
      bar.insertBefore(group, options);
    } else {
      bar.appendChild(group);
    }
  }

  const hasZoom =
    Boolean(handlers.onZoomIn) ||
    Boolean(handlers.onZoomOut) ||
    Boolean(handlers.onZoomReset);
  group.hidden = !hasZoom;

  const labelBtn = group.querySelector<HTMLButtonElement>('button[data-action="zoom-label"]');
  if (labelBtn && typeof handlers.zoom === 'number') {
    labelBtn.textContent = formatPreviewZoom(handlers.zoom);
  }

  const outBtn = group.querySelector<HTMLButtonElement>('button[data-action="zoom-out"]');
  const inBtn = group.querySelector<HTMLButtonElement>('button[data-action="zoom-in"]');
  if (outBtn && typeof handlers.zoom === 'number') {
    outBtn.disabled = handlers.zoom <= 0.5;
  }
  if (inBtn && typeof handlers.zoom === 'number') {
    inBtn.disabled = handlers.zoom >= 2.5;
  }
}

export function removeToolbar(): void {
  document.getElementById(TOOLBAR_ID)?.remove();
}
