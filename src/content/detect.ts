import { isMarkdownPath, isWslFileUrl, parseWslLocation } from '../shared/wslPaths';

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx)(?:$|[?#])/i;

/**
 * Heuristic: is this page a raw markdown source we should preview?
 */
export function isMarkdownSourcePage(): boolean {
  const url = location.href;

  if (MD_EXT.test(url) || isMarkdownPath(url)) {
    return true;
  }

  // WSL file:// pages (\\wsl$\ / wsl.localhost) — even without extension, check content
  if (isWslFileUrl(url) || parseWslLocation(url)) {
    if (MD_EXT.test(url) || isMarkdownPath(location.pathname)) {
      return true;
    }
    // fall through to content heuristics
  }

  // GitHub / Gist raw
  if (
    location.hostname === 'raw.githubusercontent.com' ||
    location.hostname === 'gist.githubusercontent.com'
  ) {
    return true;
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
