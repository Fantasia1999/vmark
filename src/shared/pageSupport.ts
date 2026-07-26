/**
 * Decide whether "toggle preview on current page" can work on a given tab,
 * so the popup can explain failures instead of silently closing.
 *
 * Pure logic (no chrome.* access) — the popup supplies the tab URL and the
 * file-scheme permission flag.
 */

export type PageSupportReason =
  | 'internal' // chrome://, edge://, about:, devtools, extension pages, …
  | 'webstore' // Chrome Web Store blocks content scripts
  | 'file-access' // file:// without "Allow access to file URLs"
  | 'unknown'; // no URL available (usually a restricted page)

export type PagePreviewSupport =
  | { ok: true }
  | { ok: false; reason: PageSupportReason };

const WEBSTORE_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
]);

export function classifyPagePreviewSupport(
  url: string | undefined,
  fileAccessAllowed: boolean,
): PagePreviewSupport {
  if (!url) {
    // Without host permission for the page, Chrome hides the URL entirely —
    // which means we cannot inject there anyway.
    return { ok: false, reason: 'unknown' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'unknown' };
  }
  const protocol = parsed.protocol;
  if (protocol === 'http:' || protocol === 'https:') {
    if (WEBSTORE_HOSTS.has(parsed.hostname)) {
      return { ok: false, reason: 'webstore' };
    }
    return { ok: true };
  }
  if (protocol === 'file:') {
    if (!fileAccessAllowed) {
      return { ok: false, reason: 'file-access' };
    }
    return { ok: true };
  }
  // chrome:, chrome-extension:, about:, edge:, devtools:, view-source:, data:, …
  return { ok: false, reason: 'internal' };
}

export function pageSupportMessage(reason: PageSupportReason): string {
  switch (reason) {
    case 'webstore':
      return '应用商店页面不允许扩展注入脚本，无法在此页面预览。';
    case 'file-access':
      return '需要在扩展设置中开启「允许访问文件网址」，才能预览本地 file:// 页面。';
    case 'internal':
      return '浏览器内部页面（chrome:// 等）不支持 Markdown 预览。';
    case 'unknown':
    default:
      return '当前页面不支持 Markdown 预览（受限页面或无法读取地址）。';
  }
}
