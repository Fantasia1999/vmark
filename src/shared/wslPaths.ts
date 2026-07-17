/**
 * Windows WSL path / URL helpers.
 *
 * Supported shapes:
 * - \\wsl$\Ubuntu\home\user\a.md
 * - \\wsl.localhost\Ubuntu\home\user\a.md
 * - file://wsl.localhost/Ubuntu/home/user/a.md
 * - file://wsl%24/Ubuntu/...  or file://wsl$/Ubuntu/...
 * - wsl://Ubuntu/home/user/a.md
 * - vscode-remote://wsl+Ubuntu/home/user/a.md
 */

export interface WslLocation {
  distro: string;
  /** Absolute Linux path starting with / */
  linuxPath: string;
}

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

export function isMarkdownPath(path: string): boolean {
  return MD_EXT.test(path.split('?')[0].split('#')[0]);
}

/** Hostnames Chrome uses for WSL UNC shares */
export function isWslFileHost(hostname: string): boolean {
  const h = decodeURIComponent(hostname).toLowerCase();
  return h === 'wsl.localhost' || h === 'wsl$' || h === 'wsl%24' || h === 'wsl';
}

/**
 * True when the current browser location is a WSL-backed file:// page.
 */
export function isWslFileUrl(href: string = typeof location !== 'undefined' ? location.href : ''): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== 'file:') {
      return false;
    }
    return isWslFileHost(u.hostname) || parseWslLocation(href) !== null;
  } catch {
    return parseWslLocation(href) !== null;
  }
}

/**
 * Parse various WSL path / URI forms into { distro, linuxPath }.
 */
export function parseWslLocation(input: string): WslLocation | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  // vscode-remote://wsl+Ubuntu/home/user/file.md
  const vscodeRemote = raw.match(
    /^vscode-remote:\/\/wsl\+([^/]+)(\/.*)?$/i,
  );
  if (vscodeRemote) {
    return {
      distro: decodeURIComponent(vscodeRemote[1]),
      linuxPath: normalizeLinuxPath(vscodeRemote[2] || '/'),
    };
  }

  // wsl://Ubuntu/home/user/file.md  or  wsl://Ubuntu@/home/...
  const wslScheme = raw.match(/^wsl:\/\/([^/@]+)(?:@)?(\/.*)?$/i);
  if (wslScheme) {
    return {
      distro: decodeURIComponent(wslScheme[1]),
      linuxPath: normalizeLinuxPath(wslScheme[2] || '/'),
    };
  }

  // UNC: \\wsl$\Ubuntu\home\...  or  \\wsl.localhost\Ubuntu\home\...
  const unc = raw.replace(/\//g, '\\');
  const uncMatch = unc.match(
    /^\\\\(?:wsl\$|wsl\.localhost)\\([^\\]+)(\\.*)?$/i,
  );
  if (uncMatch) {
    const linux = (uncMatch[2] || '/').replace(/\\/g, '/');
    return {
      distro: uncMatch[1],
      linuxPath: normalizeLinuxPath(linux),
    };
  }

  // file:// URLs
  try {
    const u = new URL(raw);
    if (u.protocol === 'file:') {
      const host = decodeURIComponent(u.hostname);
      if (isWslFileHost(host)) {
        // pathname: /Ubuntu/home/user/a.md
        const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        if (parts.length >= 1) {
          const distro = parts[0];
          const rest = '/' + parts.slice(1).join('/');
          return {
            distro,
            linuxPath: normalizeLinuxPath(parts.length > 1 ? rest : '/'),
          };
        }
      }
      // Some Chromium builds put everything in pathname: /wsl.localhost/Ubuntu/home/...
      const pathParts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (
        pathParts.length >= 2 &&
        (pathParts[0].toLowerCase() === 'wsl.localhost' ||
          pathParts[0].toLowerCase() === 'wsl$' ||
          pathParts[0].toLowerCase() === 'wsl')
      ) {
        return {
          distro: pathParts[1],
          linuxPath: normalizeLinuxPath('/' + pathParts.slice(2).join('/')),
        };
      }
    }
  } catch {
    // not a URL
  }

  return null;
}

function normalizeLinuxPath(p: string): string {
  let s = p.replace(/\\/g, '/');
  if (!s.startsWith('/')) {
    s = '/' + s;
  }
  // collapse //
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  return s || '/';
}

/**
 * Build a Chrome-friendly file:// URL for a WSL path (Windows host browser).
 * Prefers wsl.localhost (Win11+ / recent WSL).
 */
export function toWslFileUrl(
  loc: WslLocation,
  prefer: 'wsl.localhost' | 'wsl$' = 'wsl.localhost',
): string {
  const host = prefer === 'wsl$' ? 'wsl%24' : 'wsl.localhost';
  const path =
    loc.linuxPath === '/'
      ? `/${encodeURIComponent(loc.distro)}/`
      : `/${encodeURIComponent(loc.distro)}${loc.linuxPath
          .split('/')
          .map((seg) => (seg ? encodeURIComponent(seg) : ''))
          .join('/')}`;
  return `file://${host}${path}`;
}

/** UNC form for display / File Explorer */
export function toWslUnc(loc: WslLocation, prefer: 'wsl.localhost' | 'wsl$' = 'wsl.localhost'): string {
  const host = prefer === 'wsl$' ? 'wsl$' : 'wsl.localhost';
  const winPath = loc.linuxPath.replace(/\//g, '\\');
  return `\\\\${host}\\${loc.distro}${winPath === '\\' ? '' : winPath}`;
}

export function wslParentDir(linuxPath: string): string {
  const p = normalizeLinuxPath(linuxPath);
  if (p === '/') {
    return '/';
  }
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function wslBasename(linuxPath: string): string {
  const p = normalizeLinuxPath(linuxPath);
  if (p === '/') {
    return '/';
  }
  return p.slice(p.lastIndexOf('/') + 1);
}

/** Resolve a relative href against a WSL linux file path (not file://). */
export function resolveWslRelative(fromLinuxFile: string, relativeHref: string): string {
  const clean = relativeHref.split('#')[0].split('?')[0];
  if (!clean) {
    return fromLinuxFile;
  }
  if (clean.startsWith('/')) {
    return normalizeLinuxPath(clean);
  }
  const baseDir = wslParentDir(fromLinuxFile);
  const stack = baseDir === '/' ? [] : baseDir.split('/').filter(Boolean);
  for (const part of clean.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return normalizeLinuxPath('/' + stack.join('/'));
}
