/**
 * Preview content zoom (does not affect toolbar, sidebar, or chrome).
 * Applied via CSS `zoom` on the preview root / source elements only.
 */

const STORAGE_KEY = 'previewZoom';

export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2.5;
export const PREVIEW_ZOOM_STEP = 0.1;
export const PREVIEW_ZOOM_DEFAULT = 1;

const ROOT_ID = 'vscode-md-preview-root';
const SOURCE_ID = 'vscode-md-preview-source';

export function clampPreviewZoom(z: number): number {
  if (!Number.isFinite(z)) {
    return PREVIEW_ZOOM_DEFAULT;
  }
  const stepped = Math.round(z * 100) / 100;
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, stepped));
}

export function stepPreviewZoom(current: number, direction: 1 | -1): number {
  return clampPreviewZoom(current + direction * PREVIEW_ZOOM_STEP);
}

export function formatPreviewZoom(z: number): string {
  return `${Math.round(clampPreviewZoom(z) * 100)}%`;
}

export async function loadPreviewZoom(): Promise<number> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    const raw = r[STORAGE_KEY];
    if (typeof raw === 'number') {
      return clampPreviewZoom(raw);
    }
    if (typeof raw === 'string') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        return clampPreviewZoom(n);
      }
    }
  } catch {
    // ignore
  }
  return PREVIEW_ZOOM_DEFAULT;
}

export async function savePreviewZoom(z: number): Promise<void> {
  const zoom = clampPreviewZoom(z);
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: zoom });
  } catch {
    // ignore
  }
}

/** Apply zoom to preview content elements only (not chrome UI). */
export function applyPreviewZoom(z: number): void {
  const zoom = clampPreviewZoom(z);
  document.documentElement.style.setProperty('--preview-zoom', String(zoom));
  for (const id of [ROOT_ID, SOURCE_ID]) {
    const el = document.getElementById(id);
    if (el) {
      (el as HTMLElement).style.zoom = String(zoom);
    }
  }
}

export function getPreviewZoomFromDom(): number {
  const raw = document.documentElement.style.getPropertyValue('--preview-zoom').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? clampPreviewZoom(n) : PREVIEW_ZOOM_DEFAULT;
}
