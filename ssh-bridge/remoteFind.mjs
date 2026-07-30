/**
 * Build and parse the remote bulk-list command used by the SSH bridge.
 * Keeping this logic separate makes the security-sensitive quoting and path
 * containment rules independently testable.
 */

import { PREVIEW_PATTERNS } from './previewConstants.mjs';
import { shellQuote } from './shellQuote.mjs';

export { PREVIEW_PATTERNS, shellQuote };

/**
 * Use find + NUL records so spaces and newlines in filenames remain intact.
 * head limits remote output before it crosses the SSH channel.
 */
export function buildRemoteFindCommand(root, options = {}) {
  const maxDepth = Number(options.maxDepth ?? 12) + 1;
  const maxFiles = Number(options.maxFiles ?? 2000);
  const skip = options.skip || [];
  const patterns = [...(options.patterns || PREVIEW_PATTERNS)];
  const skipExpr = [...skip, '.*'].map((name) => `-name ${shellQuote(name)}`).join(' -o ');
  const fileExpr = patterns.map((pattern) => `-iname ${shellQuote(pattern)}`).join(' -o ');

  return [
    'find',
    shellQuote(root),
    `-maxdepth ${maxDepth}`,
    `\\( -type d \\( ${skipExpr} \\) -prune \\)`,
    '-o',
    `\\( \\( -type f -o -type l \\) \\( ${fileExpr} \\) -print0 \\)`,
    '2>/dev/null',
    '|',
    `head -z -n ${maxFiles}`,
  ].join(' ');
}

/** Convert NUL-delimited absolute paths to contained workspace-relative paths. */
export function parseRemoteFindOutput(output, root, maxFiles = 2000) {
  const rootBase = String(root).replace(/\/+$/, '');
  const prefix = `${rootBase}/`;
  const files = [];

  for (const absolutePath of Buffer.from(output).toString('utf8').split('\0')) {
    if (!absolutePath || !absolutePath.startsWith(prefix)) {
      continue;
    }
    const relativePath = absolutePath.slice(prefix.length);
    if (
      !relativePath ||
      relativePath.startsWith('/') ||
      relativePath.split('/').includes('..')
    ) {
      continue;
    }
    const slash = relativePath.lastIndexOf('/');
    files.push({
      path: relativePath,
      name: slash >= 0 ? relativePath.slice(slash + 1) : relativePath,
      dir: slash >= 0 ? relativePath.slice(0, slash) : '',
    });
    if (files.length >= maxFiles) {
      break;
    }
  }

  return files;
}
