/**
 * Windows WSL helpers via wsl.exe (runs on Windows host only).
 *
 * Scripts are base64-encoded before being passed through wsl.exe to avoid
 * Windows/WSL argument splitting and accidental $var expansion.
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

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt|svg)$/i;
const PREVIEW_GLOBS = ['*.md', '*.markdown', '*.mdown', '*.mkd', '*.mdx', '*.txt', '*.svg'];
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
  let stdout;
  try {
    ({ stdout } = await execFileAsync('wsl.exe', ['-l', '-q'], {
      encoding: 'buffer',
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    }));
  } catch (e) {
    throw new Error(formatExecError('wsl.exe -l -q failed', e));
  }
  // wsl -l -q often emits UTF-16LE (NUL between chars)
  let text;
  if (stdout.length >= 2 && stdout[1] === 0) {
    text = stdout.toString('utf16le');
  } else {
    text = stdout.toString('utf8');
  }
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/\0/g, '').trim())
    .filter(Boolean)
    // drop docker-desktop noise if present
    .filter((n) => !/^docker-desktop/i.test(n));
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Drop known noisy WSL warnings from stderr (EN + localized/mojibake).
 *
 * wsl.exe often writes UTF-16LE diagnostics while the inner bash writes UTF-8,
 * so Node's utf8 decode leaves NULs between ASCII chars of the WSL line.
 * Strip NULs first so token filters can match.
 */
function cleanWslText(s) {
  return String(s || '')
    .replace(/\0/g, '')
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) {
        return false;
      }
      // English WSL proxy notices
      if (/localhost proxy configuration was detected/i.test(t)) {
        return false;
      }
      if (/WSL in NAT mode does not support localhost proxies/i.test(t)) {
        return false;
      }
      // Localized / garbled variants still contain these ASCII tokens
      // e.g. "wsl: … localhost … WSL … NAT … localhost …"
      if (/^wsl:\s*/i.test(t) && /localhost/i.test(t) && /NAT/i.test(t)) {
        return false;
      }
      if (/^wsl:\s*/i.test(t) && /localhost/i.test(t) && /proxy/i.test(t)) {
        return false;
      }
      // Any leftover wsl.exe chrome that is mostly non-printable after decode
      if (/^wsl:\s*/i.test(t) && /localhost/i.test(t)) {
        return false;
      }
      return true;
    })
    .join('\n')
    .trim();
}

function formatExecError(prefix, e) {
  const err = e && typeof e === 'object' ? e : {};
  const stderr = cleanWslText(err.stderr);
  const stdout = cleanWslText(err.stdout);
  // Node's "Command failed: …" often re-embeds the same mixed-encoding stderr
  const msg = cleanWslText(err.message ? String(err.message) : String(e))
    .replace(/^Command failed:.*$/m, '')
    .trim();
  // Prefer bash's own error over Node's "Command failed: ..."
  const detail = stderr || stdout || msg || String(err.message || e);
  return `${prefix}: ${detail}`;
}

/**
 * Run a bash script inside a WSL distro. Script is base64-wrapped for safe transport.
 */
async function wslBash(distro, script) {
  if (!isWindowsHost()) {
    throw new Error('WSL is only available when the bridge runs on Windows');
  }
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  // Single-quoted base64 payload — no $ or spaces issues through wsl.exe argv
  const runner = `echo '${b64}' | base64 -d | bash`;
  try {
    const { stdout, stderr } = await execFileAsync(
      'wsl.exe',
      ['-d', distro, '--', 'bash', '-c', runner],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return {
      stdout: String(stdout || ''),
      stderr: cleanWslText(stderr),
    };
  } catch (e) {
    throw new Error(formatExecError(`wsl.exe -d ${distro}`, e));
  }
}

/**
 * Resolve root to absolute path inside distro; throw if missing.
 */
export async function resolveRoot(distro, root) {
  const r = (root || '~').trim() || '~';
  // Expand ~ without eval. IMPORTANT: quote '~' in case/parameter patterns —
  // bash tilde-expands unquoted patterns, so ~/* becomes $HOME/* and never
  // matches a literal "~/path" input.
  // Support realpath or readlink -f or pwd -P fallback.
  const script = `
set -e
input=${shellQuote(r)}
case "$input" in
  '~'|'')
    p="$HOME"
    ;;
  '~/'*)
    p="$HOME/\${input#"~/"}"
    ;;
  *)
    p="$input"
    ;;
esac
if [ ! -e "$p" ]; then
  echo "WSL path not found: $p (distro=${distro}, input=$input, HOME=$HOME)" >&2
  exit 1
fi
if command -v realpath >/dev/null 2>&1; then
  realpath "$p"
elif command -v readlink >/dev/null 2>&1; then
  readlink -f "$p"
else
  cd "$p" && pwd -P
fi
`;
  const { stdout, stderr } = await wslBash(distro, script);
  const lines = stdout
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('/'));
  const abs = lines[lines.length - 1];
  if (!abs) {
    throw new Error(
      stderr ||
        `failed to resolve WSL path "${r}" in distro "${distro}" (empty result)`,
    );
  }
  return abs;
}

/**
 * Build the WSL-side scan script. Filtering must happen before the result cap:
 * large workspaces can contain thousands of source/build files before a later
 * directory with Markdown is visited by find.
 */
export function buildListMarkdownScript(rootAbs) {
  const prune = [...SKIP].map((d) => `-name ${shellQuote(d)}`).join(' -o ');
  const preview = PREVIEW_GLOBS.map((glob) => `-iname ${shellQuote(glob)}`).join(' -o ');
  return `
set -e
cd ${shellQuote(rootAbs)}
# Prune heavy/hidden trees, select previewable files, then apply the result cap.
find . -maxdepth 12 \\( -path '*/.*' -o ${prune} \\) -prune -o -type f \\( ${preview} \\) -print 2>/dev/null | head -n ${MAX_MD}
`;
}

/**
 * List markdown files under root (relative paths).
 */
export async function listMarkdown(distro, rootAbs) {
  const script = buildListMarkdownScript(rootAbs);
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
      continue;
    }
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

export async function readFileBase64(distro, absPath, rootAbs) {
  // With rootAbs: re-check containment after realpath inside the distro so a
  // symlink under the workspace cannot read files outside it. The lexical
  // joinUnderRoot/assertUnderRoot checks alone do not follow links.
  const guard = rootAbs
    ? `
root=${shellQuote(rootAbs.replace(/\/+$/, '') || '/')}
rp=$(realpath "$f" 2>/dev/null || readlink -f "$f" 2>/dev/null) || rp=""
if [ -z "$rp" ]; then
  echo "cannot resolve: $f" >&2
  exit 1
fi
case "$rp" in
  "$root"|"$root"/*) f="$rp" ;;
  *)
    echo "path outside workspace root" >&2
    exit 1
    ;;
esac`
    : '';
  const script = `
set -e
f=${shellQuote(absPath)}
if [ ! -f "$f" ]; then
  echo "file not found: $f" >&2
  exit 1
fi${guard}
if base64 -w0 "$f" 2>/dev/null; then
  :
elif base64 "$f" 2>/dev/null | tr -d '\\n'; then
  :
else
  echo "base64 failed for $f" >&2
  exit 1
fi
`;
  const { stdout } = await wslBash(distro, script);
  return stdout.trim();
}

export async function readFileUtf8(distro, absPath, rootAbs) {
  const b64 = await readFileBase64(distro, absPath, rootAbs);
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function joinUnderRoot(rootAbs, rel) {
  const r = (rel || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!r || r === '.') {
    return rootAbs;
  }
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
