import { isWslFileUrl } from '../shared/wslPaths';

/**
 * True markdown extensions only. Deliberately excludes `.txt`
 * (wslPaths.isMarkdownPath includes it, which made every local .txt
 * auto-hijack into preview) — .txt goes through the strict content check.
 */
const MD_EXT = /\.(md|markdown|mdown|mkd|mdx)(?:$|[?#])/i;

function hasMarkdownExtension(href: string, pathname: string): boolean {
  return MD_EXT.test(href) || MD_EXT.test(decodeSafe(pathname));
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function isGitHubRawHost(hostname: string = location.hostname): boolean {
  return (
    hostname === 'raw.githubusercontent.com' ||
    hostname === 'gist.githubusercontent.com'
  );
}

/**
 * URL-only check: is this (very likely) a markdown document by extension?
 * Used both by detection below and by the document_start pre-hide script,
 * which runs before any content exists.
 */
export function isLikelyMarkdownUrl(
  href: string,
  protocol: string,
  hostname: string,
  pathname: string,
): boolean {
  if (isGitHubRawHost(hostname)) {
    return hasMarkdownExtension(href, pathname);
  }
  if (protocol === 'http:' || protocol === 'https:') {
    return false;
  }
  return hasMarkdownExtension(href, pathname);
}

/** Everything detection needs, extracted so the policy is unit-testable. */
export interface PageDescriptor {
  href: string;
  protocol: string;
  hostname: string;
  pathname: string;
  contentType?: string;
  /** Text content when the body is a single browser-generated `<pre>` wrapper */
  singlePreText?: string | null;
  /** Fallback body text for text/plain documents */
  bodyText?: string;
}

/**
 * Heuristic: is this page a raw markdown source we should auto-preview?
 *
 * Policy:
 * - Local `file://` (incl. WSL): yes when the path says Markdown; for other
 *   plain-text files only when the CONTENT strongly looks like Markdown
 *   (≥2 distinct markers — a lone `[link](url)` or `- item` in a .txt/.log
 *   must not hijack the page)
 * - GitHub / Gist raw hosts: yes only for Markdown paths (not SVG — leave native)
 * - Other http(s) pages (GitHub blob, arbitrary sites): never auto-hijack
 */
export function isMarkdownSourceDescriptor(d: PageDescriptor): boolean {
  // GitHub / Gist raw — Markdown only; SVG stays browser-native
  if (isGitHubRawHost(d.hostname)) {
    return hasMarkdownExtension(d.href, d.pathname);
  }

  // General web pages: do not auto-preview
  if (d.protocol === 'http:' || d.protocol === 'https:') {
    return false;
  }

  if (hasMarkdownExtension(d.href, d.pathname)) {
    return true;
  }

  if (d.protocol !== 'file:') {
    return false;
  }

  if (d.contentType?.includes('markdown')) {
    return true;
  }

  // Non-.md local text: require strong content evidence
  if (typeof d.singlePreText === 'string') {
    return looksStronglyLikeMarkdown(d.singlePreText);
  }
  if (d.contentType === 'text/plain' && isWslFileUrl(d.href)) {
    return looksStronglyLikeMarkdown(d.bodyText ?? '');
  }

  return false;
}

/** DOM-reading wrapper around {@link isMarkdownSourceDescriptor}. */
export function isMarkdownSourcePage(): boolean {
  let singlePreText: string | null = null;
  const body = document.body;
  if (body) {
    // Browser often wraps plain text in <pre>
    const children = Array.from(body.childNodes).filter(
      (n) =>
        !(n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim()) &&
        !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'SCRIPT'),
    );
    if (children.length === 1 && children[0] instanceof HTMLPreElement) {
      singlePreText = children[0].textContent ?? '';
    }
  }

  return isMarkdownSourceDescriptor({
    href: location.href,
    protocol: location.protocol,
    hostname: location.hostname,
    pathname: location.pathname,
    contentType: document.contentType,
    singlePreText,
    bodyText: body ? body.innerText || body.textContent || '' : '',
  });
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

const MD_SIGNALS: RegExp[] = [
  /^#{1,6}\s\S/m, // ATX heading
  /^\s*[-*+]\s+\S/m, // unordered list
  /^\s*\d+\.\s+\S/m, // ordered list
  /```/, // fenced code block
  /\[[^\]\n]+\]\([^()\s]+\)/, // inline link [text](url)
  /^\s*>\s+\S/m, // blockquote
  /^\s*\|.+\|\s*$/m, // table row
  /(^|\s)(\*\*|__)\S[^\n]*\2/m, // bold emphasis
];

/** Count distinct markdown markers in the first 4 KB. */
export function countMarkdownSignals(text: string): number {
  if (!text) {
    return 0;
  }
  const sample = text.slice(0, 4000);
  let n = 0;
  for (const re of MD_SIGNALS) {
    if (re.test(sample)) {
      n++;
    }
  }
  return n;
}

/** Loose check (any single marker) — for content we already trust by extension. */
export function looksLikeMarkdown(text: string): boolean {
  return !!text && text.length >= 2 && countMarkdownSignals(text) >= 1;
}

/**
 * Strict check for files WITHOUT a markdown extension: require at least two
 * distinct markers so a .txt/.log mentioning `[ticket](JIRA-1)` or starting
 * lines with `-` does not get hijacked into preview mode.
 */
export function looksStronglyLikeMarkdown(text: string): boolean {
  return !!text && text.length >= 2 && countMarkdownSignals(text) >= 2;
}
