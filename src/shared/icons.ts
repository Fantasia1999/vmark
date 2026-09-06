/**
 * Inline SVG icons (no emoji). 16×16 viewBox, currentColor stroke/fill.
 */

const attrs =
  'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"';

function svg(inner: string): string {
  return `<svg ${attrs}>${inner}</svg>`;
}

/** Open folder / workspace */
export const iconFolder = svg(`
  <path d="M1.5 4.5h4l1.2 1.5H14.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z"
    stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
  <path d="M1.5 6.5h13" stroke="currentColor" stroke-width="1.25"/>
`);

/** Single markdown / document file */
export const iconFile = svg(`
  <path d="M4 1.5h5.5L12.5 4.5V13.5a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z"
    stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
  <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
  <path d="M5.5 8h5M5.5 10.5h3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
`);

/** Workbench / panels */
export const iconWorkbench = svg(`
  <rect x="1.5" y="2.5" width="13" height="11" rx="1.25" stroke="currentColor" stroke-width="1.25"/>
  <path d="M5.5 2.5v11M1.5 5.5h4" stroke="currentColor" stroke-width="1.25"/>
`);

/** Preview / eye */
export const iconPreview = svg(`
  <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
    stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
  <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.25"/>
`);

/** Settings gear (toothed cog — not a sun/theme control) */
export const iconSettings = svg(`
  <path
    d="M8.15 1.33h-.3a1.33 1.33 0 0 0-1.33 1.33v.12a1.33 1.33 0 0 1-.67 1.15l-.3.17a1.33 1.33 0 0 1-1.33 0l-.1-.05a1.33 1.33 0 0 0-1.82.49l-.15.25a1.33 1.33 0 0 0 .49 1.82l.1.07a1.33 1.33 0 0 1 .67 1.15v.34a1.33 1.33 0 0 1-.67 1.16l-.1.06a1.33 1.33 0 0 0-.49 1.82l.15.25a1.33 1.33 0 0 0 1.82.49l.1-.05a1.33 1.33 0 0 1 1.33 0l.3.17a1.33 1.33 0 0 1 .67 1.15v.12a1.33 1.33 0 0 0 1.33 1.33h.3a1.33 1.33 0 0 0 1.33-1.33v-.12a1.33 1.33 0 0 1 .67-1.15l.3-.17a1.33 1.33 0 0 1 1.33 0l.1.05a1.33 1.33 0 0 0 1.82-.49l.15-.26a1.33 1.33 0 0 0-.49-1.82l-.1-.05a1.33 1.33 0 0 1-.67-1.16v-.33a1.33 1.33 0 0 1 .67-1.16l.1-.06a1.33 1.33 0 0 0 .49-1.82l-.15-.25a1.33 1.33 0 0 0-1.82-.49l-.1.05a1.33 1.33 0 0 1-1.33 0l-.3-.17a1.33 1.33 0 0 1-.67-1.15V2.66a1.33 1.33 0 0 0-1.33-1.33z"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <circle cx="8" cy="8" r="2.1" stroke="currentColor" stroke-width="1.2"/>
`);

/** Outline / TOC list */
export const iconOutline = svg(`
  <path d="M3 3.5h10M3 8h10M3 12.5h7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
  <circle cx="1.75" cy="3.5" r="0.9" fill="currentColor"/>
  <circle cx="1.75" cy="8" r="0.9" fill="currentColor"/>
  <circle cx="1.75" cy="12.5" r="0.9" fill="currentColor"/>
`);

/** Pin (unpinned outline) */
export const iconPin = svg(`
  <path d="M10.2 2.3l3.5 3.5-1.6.3-2.4 2.4v3.2l-1.7-1.7-3.6 3.6-.9-.9 3.6-3.6-1.7-1.7h3.2l2.4-2.4.2-1.7z"
    stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
`);

/** Pin active (filled / stuck) */
export const iconPinFilled = svg(`
  <path d="M10.2 2.3l3.5 3.5-1.6.3-2.4 2.4v3.2l-1.7-1.7-3.6 3.6-.9-.9 3.6-3.6-1.7-1.7h3.2l2.4-2.4.2-1.7z"
    fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/>
`);

/** Close */
export const iconClose = svg(`
  <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
`);

/** Chevron down (tree open) */
export const iconChevronDown = svg(`
  <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
`);

/** Chevron right (tree closed) */
export const iconChevronRight = svg(`
  <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
`);

/** Compact MD file badge for tree */
export const iconMdFile = svg(`
  <path d="M3.5 2h6l3 3v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
    stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M9.5 2v3H12.5" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M5 9.2c.4-.7 1.1-1 1.8-1 .9 0 1.5.5 1.5 1.2 0 1.4-2.6 1.1-2.6 2.6V12.5h3.2"
    stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
`);

/** Brand mark for toolbar (unified with wb-logo) */
export const iconBrand = svg(`
  <rect x="1.5" y="2.5" width="13" height="11" rx="1.25" stroke="currentColor" stroke-width="1.25"/>
  <path d="M5.5 2.5v11M1.5 5.5h4" stroke="currentColor" stroke-width="1.25"/>
`);

/** SSH / remote terminal */
export const iconSsh = svg(`
  <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" stroke-width="1.25"/>
  <path d="M4 7.5l2 2-2 2M8 11.5h3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
`);

/** Clipboard / copy */
export const iconCopy = svg(`
  <rect x="5.5" y="5.5" width="8" height="9" rx="1.25" stroke="currentColor" stroke-width="1.25"/>
  <path d="M3.5 10.5V3.75A1.25 1.25 0 0 1 4.75 2.5h6.75" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
`);

/** Checkmark (copy success) */
export const iconCheck = svg(`
  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
`);

/**
 * Copy absolute path: clipboard + leading slash so it differs from plain copy.
 */
export const iconCopyAbsolute = svg(`
  <path d="M2.5 4.5v7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M2.5 4.5h2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  <rect x="6" y="5.5" width="7.5" height="8.5" rx="1.2" stroke="currentColor" stroke-width="1.25"/>
  <path d="M4.75 10V3.7A1.2 1.2 0 0 1 5.95 2.5H12" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
`);

/** Search glass */
export const iconSearch = svg(`
  <path d="M6.5 11.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.5 10.5l4 4"
    stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
`);

/** Chevron left */
export const iconChevronLeft = svg(`
  <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
`);

export type IconName =
  | 'folder'
  | 'file'
  | 'workbench'
  | 'preview'
  | 'settings'
  | 'outline'
  | 'pin'
  | 'pinFilled'
  | 'close'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronLeft'
  | 'mdFile'
  | 'brand'
  | 'ssh'
  | 'copy'
  | 'check'
  | 'copyAbsolute'
  | 'search';

const map: Record<IconName, string> = {
  folder: iconFolder,
  file: iconFile,
  workbench: iconWorkbench,
  preview: iconPreview,
  settings: iconSettings,
  outline: iconOutline,
  pin: iconPin,
  pinFilled: iconPinFilled,
  close: iconClose,
  chevronDown: iconChevronDown,
  chevronRight: iconChevronRight,
  chevronLeft: iconChevronLeft,
  mdFile: iconMdFile,
  brand: iconBrand,
  ssh: iconSsh,
  copy: iconCopy,
  check: iconCheck,
  copyAbsolute: iconCopyAbsolute,
  search: iconSearch,
};

export function iconHtml(name: IconName): string {
  return map[name];
}

/** Create a span wrapping an SVG icon for DOM use. */
export function createIconEl(name: IconName, className = 'vsc-icon'): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = iconHtml(name);
  return span;
}

/** Set button content to icon (+ optional text label). */
export function setButtonIcon(
  btn: HTMLElement,
  name: IconName,
  options?: { label?: string; className?: string },
): void {
  btn.replaceChildren();
  const icon = createIconEl(name, options?.className ?? 'vsc-icon');
  btn.appendChild(icon);
  if (options?.label) {
    const t = document.createElement('span');
    t.className = 'vsc-icon-label';
    t.textContent = options.label;
    btn.appendChild(t);
  }
}
