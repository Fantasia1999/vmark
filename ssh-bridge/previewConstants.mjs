/**
 * Shared workspace-scan limits and skip/preview patterns for SSH + WSL.
 * Keep one source of truth so list dialects cannot drift.
 */

export const SKIP = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);

export const PREVIEW_PATTERNS = [
  '*.md',
  '*.markdown',
  '*.mdown',
  '*.mkd',
  '*.mdx',
  '*.txt',
  '*.svg',
];

export const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt|svg)$/i;

export const MAX_MD = 2000;
export const MAX_DEPTH = 12;

/** SFTP readdir concurrency for the latency-bound fallback walk. */
export const LIST_CONCURRENCY = 16;
