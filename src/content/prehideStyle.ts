/**
 * Shared control for the pre-hide style injected at document_start to avoid a
 * flash of raw markdown (FOUC) before the preview renders. Both the prehide
 * entry and the main content script bundle this module.
 */

export const PREHIDE_STYLE_ID = 'vscode-md-preview-prehide';

/** How long the page may stay hidden before we give up and show the raw text. */
export const PREHIDE_FAILSAFE_MS = 4000;

export function removePrehideStyle(): void {
  document.getElementById(PREHIDE_STYLE_ID)?.remove();
}

export function insertPrehideStyle(): void {
  if (document.getElementById(PREHIDE_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = PREHIDE_STYLE_ID;
  // visibility (not display) keeps layout so scroll anchors stay stable.
  style.textContent = 'html { visibility: hidden !important; }';
  (document.head ?? document.documentElement).appendChild(style);
}
