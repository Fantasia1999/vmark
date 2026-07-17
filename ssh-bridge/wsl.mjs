/**
 * Windows WSL helpers via wsl.exe (runs on Windows host only).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SKIP = new Set([
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

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;
const MAX_MD = 2000;

export function isWindowsHost() {
  return process.platform === 'win32';
}

/**
 * List installed WSL distro names (UTF-16 LE output from wsl -l -q).
 */
export async function listDistros() {
  if (!isWindowsHost()) {
    throw new Error('WSL is only available when the bridge runs on Windows');
  }
  const { stdout } = await execFileAsync('wsl.exe', ['-l', '-q'], {
    encoding: 'buffer',
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  // wsl -l -q emits UTF-16LE
  let text;
  if (stdout[1] === 0) {
    text = stdout.toString('utf16le');
  } else {
    text = stdout.toString('utf8');
  }
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/\0/g, '').trim())
    .filter(Boolean);
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function wslBash(distro, script) {
  const { stdout, stderr } = await execFileAsync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-lc', script],
    {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return { stdout, stderr };
}

/**
 * Resolve root to absolute path inside distro; throw if missing.
 */
export async function resolveRoot(distro, root) {
  const r = root || '~';
  const script = `set -e; p=${shellQuote(r)}; p=$(eval echo "$p"); realpath -m "$p"; test -d "$p" || test -e "$p"`;
  const { stdout } = await wslBash(distro, script);
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const abs = lines[lines.length - 1];
  if (!abs || !abs.startsWith('/')) {
    throw new Error(`invalid WSL root: ${root}`);
  }
  // verify exists
  const check = await wslBash(
    distro,
    `test -e ${shellQuote(abs)} && echo OK`,
  );
  if (!check.stdout.includes('OK')) {
    throw new Error(`WSL path not found: ${abs}`);
  }
  return abs;
}

/**
 * List markdown files under root (relative paths).
 */
export async function listMarkdown(distro, rootAbs) {
  // find is reliable; limit depth
  const script = [
    'set -e',
    `cd ${shellQuote(rootAbs)}`,
    `find . -maxdepth 12 \\( ${[...SKIP].map((d) => `-name ${shellQuote(d)}`).join(' -o ')} \\) -prune -o -type f -print 2>/dev/null | head -n 8000`,
  ].join('; ');

  const { stdout } = await wslBash(distro, script);
  const files = [];
  for (const line of stdout.split(/\r?\n/)) {
    let rel = line.trim();
    if (!rel || rel === '.') {
      continue;
    }
    if (rel.startsWith('./')) {
      rel = rel.slice(2);
    }
    if (rel.startsWith('/')) {
      // shouldn't happen after cd
      continue;
    }
    // skip hidden segments
    if (rel.split('/').some((s) => s.startsWith('.') && s !== '.')) {
      continue;
    }
    if (!MD_RE.test(rel)) {
      continue;
    }
    const name = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    files.push({ path: rel, name, dir });
    if (files.length >= MAX_MD) {
      break;
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export async function readFileBase64(distro, absPath) {
  const script = `base64 -w0 ${shellQuote(absPath)} 2>/dev/null || base64 ${shellQuote(absPath)} | tr -d '\\n'`;
  const { stdout } = await wslBash(distro, script);
  const b64 = stdout.trim();
  if (!b64) {
    // empty file is ok; distinguish missing
    const exists = await wslBash(distro, `test -f ${shellQuote(absPath)} && echo Y || echo N`);
    if (!exists.stdout.includes('Y')) {
      throw new Error(`file not found: ${absPath}`);
    }
  }
  return b64;
}

export async function readFileUtf8(distro, absPath) {
  const b64 = await readFileBase64(distro, absPath);
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function joinUnderRoot(rootAbs, rel) {
  const r = (rel || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!r || r === '.') {
    return rootAbs;
  }
  // block escape
  const parts = [];
  for (const p of r.split('/')) {
    if (!p || p === '.') {
      continue;
    }
    if (p === '..') {
      if (parts.length) {
        parts.pop();
      }
      continue;
    }
    parts.push(p);
  }
  if (rootAbs === '/') {
    return '/' + parts.join('/');
  }
  return rootAbs.replace(/\/+$/, '') + '/' + parts.join('/');
}

export function assertUnderRoot(rootAbs, absPath) {
  const root = rootAbs.replace(/\/+$/, '') || '/';
  const file = absPath.replace(/\/+$/, '') || '/';
  if (file === root) {
    return;
  }
  if (root === '/') {
    return;
  }
  if (!file.startsWith(root + '/')) {
    throw new Error('path outside workspace root');
  }
}
