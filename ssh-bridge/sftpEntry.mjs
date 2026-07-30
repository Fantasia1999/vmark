/**
 * Pure helpers for classifying SFTP readdir entries.
 * Kept separate from server.mjs so tests can import without starting HTTP.
 */

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

/**
 * Classify a readdir entry without extra RPCs.
 * Some SFTP servers omit file-type bits in attrs.mode (only 0o777 perms),
 * leave mode unset, or only populate longname — a bare
 * `(mode & S_IFMT) === S_IFDIR` check then treats every directory as a file,
 * so the walk never descends and /list returns [].
 *
 * @param {{ attrs?: object, longname?: string }} entry
 * @returns {'dir'|'file'|'unknown'}
 */
export function classifySftpEntry(entry) {
  const attrs = entry?.attrs;
  if (attrs && typeof attrs.mode === 'number') {
    const type = attrs.mode & S_IFMT;
    if (type === S_IFDIR) {
      return 'dir';
    }
    if (type === S_IFREG) {
      return 'file';
    }
    // symlink or type bits missing (0) → fall through
    if (type !== S_IFLNK && type !== 0) {
      // other special types (fifo/socket/device) — not a walkable dir
      return 'file';
    }
  }
  if (attrs && typeof attrs.isDirectory === 'function') {
    try {
      if (attrs.isDirectory()) {
        return 'dir';
      }
      if (typeof attrs.isFile === 'function' && attrs.isFile()) {
        return 'file';
      }
      if (typeof attrs.isSymbolicLink === 'function' && attrs.isSymbolicLink()) {
        return 'unknown';
      }
    } catch {
      // ignore broken attr helpers
    }
  }
  const longname = String(entry?.longname || '');
  if (longname.startsWith('d')) {
    return 'dir';
  }
  if (longname.startsWith('-')) {
    return 'file';
  }
  // 'l' symlink, empty longname, or incomplete attrs.
  // Callers that walk a tree should sftp.stat() and use attrsLookLikeDir().
  return 'unknown';
}

export function attrsLookLikeDir(attrs) {
  if (!attrs) {
    return false;
  }
  if (typeof attrs.isDirectory === 'function') {
    try {
      return attrs.isDirectory();
    } catch {
      // fall through
    }
  }
  if (typeof attrs.mode === 'number') {
    return (attrs.mode & S_IFMT) === S_IFDIR;
  }
  return false;
}

export { S_IFMT, S_IFDIR, S_IFREG, S_IFLNK };
