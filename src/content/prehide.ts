/**
 * Runs at document_start, before first paint: when the URL says this page is
 * a markdown document that will be auto-previewed, hide it until the main
 * content script (document_idle) renders the preview — otherwise the raw
 * source paints first and visibly "snaps" into the preview (FOUC).
 *
 * Conservative by design: only URL-extension matches are hidden. Content-based
 * detection (plain .txt that looks like markdown) still flashes — hiding every
 * text file until content is inspected would be worse.
 */
import { isLikelyMarkdownUrl } from './detect';
import {
  insertPrehideStyle,
  PREHIDE_FAILSAFE_MS,
  removePrehideStyle,
} from './prehideStyle';

(function main(): void {
  try {
    if (
      !isLikelyMarkdownUrl(
        location.href,
        location.protocol,
        location.hostname,
        location.pathname,
      )
    ) {
      return;
    }

    insertPrehideStyle();

    // Failsafe: never leave the page hidden if the main script dies.
    window.setTimeout(removePrehideStyle, PREHIDE_FAILSAFE_MS);

    // If auto-preview is disabled, unhide as soon as the setting arrives.
    try {
      chrome.storage.sync
        .get({ autoPreview: true })
        .then((v) => {
          if (!v.autoPreview) {
            removePrehideStyle();
          }
        })
        .catch(removePrehideStyle);
    } catch {
      removePrehideStyle();
    }
  } catch {
    removePrehideStyle();
  }
})();
