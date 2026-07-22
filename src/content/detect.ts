import { isMarkdownPath, isWslFileUrl } from '../shared/wslPaths';

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx)(?:$|[?#])/i;

function isGitHubRawHost(hostname: string = location.hostname): boolean {
  return (
    hostname === 'raw.githubusercontent.com' ||
    hostname === 'gist.githubusercontent.com'
  );
}

/**
 * Heuristic: is this page a raw markdown source we should auto-preview?
 *
 * Policy:
 * - Local `file://` (incl. WSL): yes when path/content looks like Markdown
 * - GitHub / Gist raw hosts: yes only for Markdown paths (not SVG — leave native)
 * - Other http(s) pages (GitHub blob, arbitrary sites): never auto-hijack
 */
export function isMarkdownSourcePage(): boolean {
  const url = location.href;

  // GitHub / Gist raw — Markdown only; SVG stays browser-native
  if (isGitHubRawHost()) {
    return (
      MD_EXT.test(url) ||
      isMarkdownPath(url) ||
      isMarkdownPath(location.pathname)
    );
  }

  // General web pages: do not auto-preview
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return false;
  }

  // file:// (and other non-http schemes we may inject on)
  if (MD_EXT.test(url) || isMarkdownPath(url) || isMarkdownPath(location.pathname)) {
    return true;
  }

  if (location.protocol !== 'file:') {
    return false;
  }

  // Browser often wraps plain text in <pre>
  const body = document.body;
  if (!body) {
    return false;
  }

  const children = Array.from(body.childNodes).filter(
    (n) =>
      !(n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()) &&
      !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'SCRIPT'),
  );

  if (children.length === 1 && children[0] instanceof HTMLPreElement) {
    return looksLikeMarkdown(children[0].textContent ?? '');
  }

  // Plain-text document (Chrome file:// for .md sometimes has body with text only)
  if (document.contentType?.includes('markdown')) {
    return true;
  }

  if (document.contentType === 'text/plain' && (MD_EXT.test(url) || isWslFileUrl(url))) {
    return looksLikeMarkdown(body.innerText || body.textContent || '');
  }

  return false;
}

export function extractMarkdownSource(): string {
  const pre = document.querySelector('body > pre');
  if (pre && document.body.children.length <= 2) {
    // Chrome wraps text files in a single <pre>
    return pre.textContent ?? '';
  }

  // Some servers serve raw body text without pre
  if (document.body.children.length === 0) {
    return document.body.textContent ?? '';
  }

  // Fallback: full body text (may include chrome UI — prefer pre)
  return document.body.innerText;
}

function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) {
    return false;
  }
  // Common MD markers
  const samples = text.slice(0, 4000);
  return (
    /^#{1,6}\s/m.test(samples) ||
    /^\s*[-*+]\s+/m.test(samples) ||
    /```/.test(samples) ||
    /\[.+\]\(.+\)/.test(samples) ||
    /^\s*>\s+/m.test(samples)
  );
}
