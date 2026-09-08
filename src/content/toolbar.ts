import { createIconEl, flashButtonFeedback, setButtonIcon } from '../shared/icons';
import { formatPreviewZoom } from '../shared/previewZoom';
import { t, getLocale, setLocale, type SupportedLocale } from '../shared/i18n/index';

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
  /** Source mode: copy raw file */
  onCopyRaw?: () => void;
  /** Source mode: download raw file */
  onDownloadRaw?: () => void;
  /** Optional: toggle interface language */
  onToggleLocale?: (locale: SupportedLocale) => void;
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

const langMenuCleanups = new WeakMap<HTMLElement, () => void>();

function closeLangMenu(scope: HTMLElement): void {
  const menu = scope.querySelector<HTMLElement>('.vsc-lang-menu');
  const btn = scope.querySelector<HTMLButtonElement>('button[data-action="toggle-lang"]');
  if (menu) {
    menu.hidden = true;
  }
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
  }
  const cleanup = langMenuCleanups.get(scope);
  if (cleanup) {
    cleanup();
    langMenuCleanups.delete(scope);
  }
}

function openLangMenu(scope: HTMLElement): void {
  const prevCleanup = langMenuCleanups.get(scope);
  if (prevCleanup) {
    prevCleanup();
    langMenuCleanups.delete(scope);
  }

  const menu = scope.querySelector<HTMLElement>('.vsc-lang-menu');
  const btn = scope.querySelector<HTMLButtonElement>('button[data-action="toggle-lang"]');
  if (!menu || !btn) return;

  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  btn.classList.add('active');

  const onDocPointer = (e: MouseEvent | PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const dropdown = scope.classList.contains('vsc-lang-dropdown')
      ? scope
      : scope.querySelector('.vsc-lang-dropdown');
    if (dropdown && !dropdown.contains(target)) {
      closeLangMenu(scope);
    }
  };

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closeLangMenu(scope);
      btn.focus?.();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(menu.children) as HTMLButtonElement[];
      if (!items.length) return;
      const activeIndex = items.findIndex((el) => el === (document as any)?.activeElement);
      let nextIndex = 0;
      if (e.key === 'ArrowDown') {
        nextIndex = activeIndex >= 0 ? (activeIndex + 1) % items.length : 0;
      } else {
        nextIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus?.();
    }
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onDocKeyDown, true);
  }

  langMenuCleanups.set(scope, () => {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
    }
  });
}

function toggleLangMenu(scope: HTMLElement): void {
  const menu = scope.querySelector<HTMLElement>('.vsc-lang-menu');
  if (!menu || menu.hidden) {
    openLangMenu(scope);
  } else {
    closeLangMenu(scope);
  }
}

export interface MountLangDropdownOptions {
  buttonClass?: string;
  onSelect?: (locale: SupportedLocale) => void;
  insertBefore?: HTMLElement | null;
}

export function mountLangDropdown(
  container: HTMLElement,
  options?: MountLangDropdownOptions,
): HTMLElement {
  let dropdown = container.querySelector<HTMLElement>('.vsc-lang-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'vsc-lang-dropdown';

    const oldBtn = container.querySelector<HTMLButtonElement>('button[data-action="toggle-lang"]');
    if (oldBtn && oldBtn.parentElement === container) {
      oldBtn.remove();
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = options?.buttonClass || 'vsc-icon-btn';
    btn.dataset.action = 'toggle-lang';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    setButtonIcon(btn, 'globe');
    dropdown.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'vsc-lang-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const locales: { id: SupportedLocale; label: string }[] = [
      { id: 'en', label: 'English' },
      { id: 'zh-CN', label: '简体中文' },
    ];

    for (const loc of locales) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'vsc-lang-menu-item';
      item.dataset.action = 'select-lang';
      item.dataset.lang = loc.id;
      item.setAttribute('role', 'menuitemradio');
      item.title = loc.label;

      const check = document.createElement('span');
      check.className = 'vsc-lang-menu-check';
      check.setAttribute('aria-hidden', 'true');
      item.appendChild(check);

      const label = document.createElement('span');
      label.className = 'vsc-lang-menu-label';
      label.textContent = loc.label;
      item.appendChild(label);

      menu.appendChild(item);
    }

    dropdown.appendChild(menu);

    dropdown.addEventListener('click', (e) => {
      const targetBtn = (e.target as HTMLElement).closest('button');
      if (!targetBtn || !dropdown!.contains(targetBtn)) return;
      e.stopPropagation();
      (e as any)._langHandled = true;
      const action = targetBtn.dataset.action;
      if (action === 'toggle-lang') {
        toggleLangMenu(container);
      } else if (action === 'select-lang') {
        const targetLang = targetBtn.dataset.lang as SupportedLocale;
        if (targetLang && targetLang !== getLocale()) {
          setLocale(targetLang);
          try {
            void chrome.storage?.sync?.set({ locale: targetLang });
          } catch {
            // ignore
          }
          options?.onSelect?.(targetLang);
        }
        closeLangMenu(container);
      }
    });

    if (options?.insertBefore) {
      container.insertBefore(dropdown, options.insertBefore);
    } else {
      container.appendChild(dropdown);
    }
  }

  const btn = dropdown.querySelector<HTMLButtonElement>('button[data-action="toggle-lang"]');
  if (btn) {
    btn.title = t('toolbar.language');
    btn.setAttribute('aria-label', t('toolbar.language'));
  }

  const current = getLocale();
  const menu = dropdown.querySelector<HTMLElement>('.vsc-lang-menu');
  if (menu) {
    for (let i = 0; i < menu.children.length; i++) {
      const item = menu.children[i] as HTMLButtonElement;
      if (!item || !item.dataset) continue;
      const isCurrent = item.dataset.lang === current;
      item.classList.toggle('is-active', isCurrent);
      item.setAttribute('aria-checked', isCurrent ? 'true' : 'false');
      const checkSpan = item.querySelector('.vsc-lang-menu-check');
      if (checkSpan) {
        if (isCurrent) {
          checkSpan.replaceChildren(createIconEl('check', 'vsc-icon'));
        } else {
          checkSpan.replaceChildren();
        }
      }
    }
  }

  return dropdown;
}

function ensureLangDropdown(bar: HTMLElement): HTMLElement {
  const options = bar.querySelector('button[data-action="options"]');
  return mountLangDropdown(bar, {
    buttonClass: 'vsc-icon-btn',
    insertBefore: options as HTMLElement | null,
    onSelect: (targetLang) => {
      const rt = getRuntime(bar);
      rt?.handlers.onToggleLocale?.(targetLang);
    },
  });
}

/**
 * Prefer embedding into the workbench main bar when the workspace shell is open;
 * otherwise float on the page (content-script preview).
 */
function resolveToolbarParent(explicit?: HTMLElement | null): HTMLElement {
  if (explicit) {
    return explicit;
  }
  const shell = document.getElementById('workspace-shell');
  if (shell && !shell.hidden) {
    const mainBar = shell.querySelector('.ws-main-bar');
    if (mainBar instanceof HTMLElement) {
      return mainBar;
    }
  }
  return document.documentElement;
}

/**
 * Mount or update the preview toolbar in place (avoids focus flash).
 * In the workbench viewer it nests inside `.ws-main-bar`; elsewhere it floats.
 */
export function mountToolbar(
  mode: PreviewMode,
  handlers: ToolbarHandlers,
  options?: { parent?: HTMLElement | null },
): HTMLElement {
  const parent = resolveToolbarParent(options?.parent);
  const embedded = parent.classList.contains('ws-main-bar');

  let bar = document.getElementById(TOOLBAR_ID) as HTMLElement | null;
  const created = !bar;

  if (!bar) {
    bar = document.createElement('div');
    bar.id = TOOLBAR_ID;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Markdown preview');

    const label = document.createElement('span');
    label.className = 'vsc-md-label';
    label.title = 'VMark (Markdown Preview)';
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
        case 'copy-raw':
          if (rt.handlers.onCopyRaw) {
            rt.handlers.onCopyRaw();
            flashButtonFeedback(btn, {
              idleIcon: 'copy',
              feedbackTitle: t('toolbar.copied'),
              idleTitle: t('toolbar.copyRaw'),
            });
          }
          break;
        case 'download-raw':
          if (rt.handlers.onDownloadRaw) {
            rt.handlers.onDownloadRaw();
            flashButtonFeedback(btn, {
              idleIcon: 'download',
              feedbackTitle: t('toolbar.downloading'),
              idleTitle: t('toolbar.downloadRaw'),
            });
          }
          break;
        case 'toggle-lang': {
          if ((e as any)._langHandled) {
            break;
          }
          toggleLangMenu(bar!);
          break;
        }
        case 'select-lang': {
          if ((e as any)._langHandled) {
            break;
          }
          const targetLang = btn.dataset.lang as SupportedLocale;
          if (targetLang && targetLang !== getLocale()) {
            setLocale(targetLang);
            try {
              void chrome.storage?.sync?.set({ locale: targetLang });
            } catch {
              // ignore
            }
            rt.handlers.onToggleLocale?.(targetLang);
          }
          closeLangMenu(bar!);
          break;
        }
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
  }

  if (bar.parentElement !== parent) {
    parent.appendChild(bar);
  }
  bar.classList.toggle('vsc-toolbar-embedded', embedded);

  setRuntime(bar, { handlers, mode });

  const brand = bar.querySelector<HTMLElement>('.vsc-md-label');
  if (brand) {
    // Brand mark only useful on the floating overlay
    brand.hidden = embedded;
  }

  // Mode buttons
  const previewBtn = ensureButton(bar, 'preview', () => {
    const b = document.createElement('button');
    b.type = 'button';
    return b;
  });
  previewBtn.textContent = t('toolbar.preview');
  previewBtn.title = t('toolbar.previewTitle');
  previewBtn.setAttribute('aria-label', t('toolbar.preview'));

  const sourceBtn = ensureButton(bar, 'source', () => {
    const b = document.createElement('button');
    b.type = 'button';
    return b;
  });
  sourceBtn.textContent = t('toolbar.source');
  sourceBtn.title = t('toolbar.sourceTitle');
  sourceBtn.setAttribute('aria-label', t('toolbar.source'));

  previewBtn.classList.toggle('active', mode === 'preview');
  sourceBtn.classList.toggle('active', mode === 'source');
  previewBtn.setAttribute('aria-pressed', mode === 'preview' ? 'true' : 'false');
  sourceBtn.setAttribute('aria-pressed', mode === 'source' ? 'true' : 'false');

  // Source mode raw file operations (GitHub-style)
  const copyRawBtn = ensureButton(bar, 'copy-raw', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vsc-icon-btn';
    setButtonIcon(b, 'copy');
    return b;
  });
  copyRawBtn.title = t('toolbar.copyRaw');
  copyRawBtn.setAttribute('aria-label', t('toolbar.copyRaw'));

  const downloadRawBtn = ensureButton(bar, 'download-raw', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vsc-icon-btn';
    setButtonIcon(b, 'download');
    return b;
  });
  downloadRawBtn.title = t('toolbar.downloadRaw');
  downloadRawBtn.setAttribute('aria-label', t('toolbar.downloadRaw'));
  sourceBtn.after(copyRawBtn, downloadRawBtn);

  const showSourceActions = mode === 'source';
  copyRawBtn.hidden = !showSourceActions || !handlers.onCopyRaw;
  downloadRawBtn.hidden = !showSourceActions || !handlers.onDownloadRaw;

  // Outline
  let outlineBtn = bar.querySelector<HTMLButtonElement>('button[data-action="outline"]');
  if (handlers.onToggleOutline) {
    if (!outlineBtn) {
      outlineBtn = document.createElement('button');
      outlineBtn.type = 'button';
      outlineBtn.className = 'vsc-icon-btn';
      outlineBtn.dataset.action = 'outline';
      setButtonIcon(outlineBtn, 'outline');
      // insert before options if present, else append
      const options = bar.querySelector('button[data-action="options"]');
      if (options) {
        bar.insertBefore(outlineBtn, options);
      } else {
        bar.appendChild(outlineBtn);
      }
    }
    outlineBtn.title = t('toolbar.outline');
    outlineBtn.setAttribute('aria-label', t('toolbar.outline'));
    outlineBtn.hidden = false;
    outlineBtn.classList.toggle('active', !!handlers.outlineOpen);
    outlineBtn.setAttribute('aria-pressed', handlers.outlineOpen ? 'true' : 'false');
  } else if (outlineBtn) {
    outlineBtn.hidden = true;
  }

  // Optional open actions — skip when embedded
  const showOpenFile = Boolean(handlers.onOpenFile) && !embedded;
  const showOpenFolder = Boolean(handlers.onOpenFolder) && !embedded;
  if (showOpenFile) {
    const openFileBtn = ensureButton(bar, 'open-file', () => {
      const b = document.createElement('button');
      b.type = 'button';
      return b;
    });
    openFileBtn.textContent = t('toolbar.openFile');
    openFileBtn.title = t('toolbar.openFileTitle');
    openFileBtn.setAttribute('aria-label', t('toolbar.openFileTitle'));
    openFileBtn.hidden = false;
  } else {
    const b = bar.querySelector<HTMLButtonElement>('button[data-action="open-file"]');
    if (b) b.hidden = true;
  }

  if (showOpenFolder) {
    const openFolderBtn = ensureButton(bar, 'open-folder', () => {
      const b = document.createElement('button');
      b.type = 'button';
      return b;
    });
    openFolderBtn.textContent = t('toolbar.openFolder');
    openFolderBtn.title = t('toolbar.openFolderTitle');
    openFolderBtn.setAttribute('aria-label', t('toolbar.openFolderTitle'));
    openFolderBtn.hidden = false;
  } else {
    const b = bar.querySelector<HTMLButtonElement>('button[data-action="open-folder"]');
    if (b) b.hidden = true;
  }

  // Zoom group (content only) — before language & options
  ensureZoomGroup(bar, handlers);

  // Language dropdown popover — before options
  ensureLangDropdown(bar);

  // Options always last
  const optionsBtn = ensureButton(bar, 'options', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vsc-icon-btn';
    setButtonIcon(b, 'settings');
    return b;
  });
  optionsBtn.title = t('toolbar.optionsTitle');
  optionsBtn.setAttribute('aria-label', t('toolbar.optionsTitle'));
  // keep options at end
  bar.appendChild(optionsBtn);

  if (created) {
    // subtle enter animation (floating); embedded is static in the main bar
    bar.classList.add('vsc-toolbar-enter');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => bar!.classList.add('vsc-toolbar-ready'));
    } else {
      bar.classList.add('vsc-toolbar-ready');
    }
  }

  return bar;
}

function ensureZoomGroup(bar: HTMLElement, handlers: ToolbarHandlers): void {
  let group = bar.querySelector<HTMLElement>('.vsc-zoom-group');
  if (!group) {
    group = document.createElement('span');
    group.className = 'vsc-zoom-group';
    group.setAttribute('role', 'group');

    const out = document.createElement('button');
    out.type = 'button';
    out.dataset.action = 'zoom-out';
    out.textContent = '−';

    const label = document.createElement('button');
    label.type = 'button';
    label.dataset.action = 'zoom-label';
    label.textContent = '100%';

    const inn = document.createElement('button');
    inn.type = 'button';
    inn.dataset.action = 'zoom-in';
    inn.textContent = '+';

    group.append(out, label, inn);

    const lang =
      bar.querySelector('.vsc-lang-dropdown') ||
      bar.querySelector('button[data-action="toggle-lang"]');
    const options = bar.querySelector('button[data-action="options"]');
    const insertBeforeTarget = lang || options;
    if (insertBeforeTarget) {
      bar.insertBefore(group, insertBeforeTarget);
    } else {
      bar.appendChild(group);
    }
  }

  group.setAttribute('aria-label', t('toolbar.zoomGroup'));

  const out = group.querySelector<HTMLButtonElement>('button[data-action="zoom-out"]');
  if (out) {
    out.title = t('toolbar.zoomOut');
    out.setAttribute('aria-label', t('toolbar.zoomOutAria'));
  }
  const label = group.querySelector<HTMLButtonElement>('button[data-action="zoom-label"]');
  if (label) {
    label.title = t('toolbar.zoomReset');
    label.setAttribute('aria-label', t('toolbar.zoomResetAria'));
  }
  const inn = group.querySelector<HTMLButtonElement>('button[data-action="zoom-in"]');
  if (inn) {
    inn.title = t('toolbar.zoomIn');
    inn.setAttribute('aria-label', t('toolbar.zoomInAria'));
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
  const bar = document.getElementById(TOOLBAR_ID);
  if (bar) {
    closeLangMenu(bar);
    bar.remove();
  }
}
