/**
 * SSH workspace markdown listing: remote find bulk path + concurrent SFTP fallback.
 * Kept out of server.mjs so HTTP/session code stays thin and listing is testable.
 */

import {
  LIST_CONCURRENCY,
  MAX_DEPTH,
  MAX_MD,
  MD_RE,
  SKIP,
} from './previewConstants.mjs';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
} from './remoteFind.mjs';
import { attrsLookLikeDir, classifySftpEntry } from './sftpEntry.mjs';

function joinRemote(root, rel) {
  const base = (root || '.').replace(/\/+$/, '') || '.';
  const r = (rel || '').replace(/^\/+/, '');
  if (!r || r === '.') {
    return base === '.' ? '.' : base;
  }
  if (base === '.' || base === '') {
    return r;
  }
  return `${base}/${r}`;
}

function listDir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err);
      } else {
        resolve(list || []);
      }
    });
  });
}

function statRemote(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, attrs) => {
      if (err) {
        reject(err);
      } else {
        resolve(attrs);
      }
    });
  });
}

function realpath(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.realpath(remotePath, (err, p) => {
      if (err) {
        reject(err);
      } else {
        resolve(p);
      }
    });
  });
}

function execRemote(client, command, maxBytes = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      const chunks = [];
      const stderrChunks = [];
      let size = 0;
      let settled = false;

      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          if (!settled) {
            settled = true;
            stream.close();
            reject(new Error('remote list output too large'));
          }
          return;
        }
        chunks.push(chunk);
      });
      stream.stderr.on('data', (chunk) => {
        if (stderrChunks.reduce((sum, item) => sum + item.length, 0) < 64 * 1024) {
          stderrChunks.push(chunk);
        }
      });
      stream.on('error', (streamError) => {
        if (!settled) {
          settled = true;
          reject(streamError);
        }
      });
      stream.on('close', (code, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
          reject(
            new Error(
              `remote list command failed (${code ?? signal ?? 'unknown'})${
                stderr ? `: ${stderr}` : ''
              }`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  });
}

/**
 * Resolve readdir entry kind. Incomplete attrs / symlinks need a follow-up
 * stat so directory walks still descend (otherwise /list returns []).
 */
async function resolveEntryKind(sftp, entry, absolutePath) {
  const kind = classifySftpEntry(entry);
  if (kind !== 'unknown') {
    return kind;
  }
  try {
    const attrs = await statRemote(sftp, absolutePath);
    return attrsLookLikeDir(attrs) ? 'dir' : 'file';
  } catch {
    // Broken symlink or unreadable path — do not treat as a walkable dir.
    return 'file';
  }
}

/**
 * @param {{ client: import('ssh2').Client, sftp: import('ssh2').SFTPWrapper, meta: { root: string } }} session
 * @param {string} [rootRel]
 */
export async function listMarkdown(session, rootRel = '') {
  if (!session) {
    throw new Error('not connected');
  }
  const { client, sftp, meta } = session;
  const out = [];
  const rootAbs = await realpath(sftp, joinRemote(meta.root, rootRel || ''));
  const rootPrefix = meta.root.endsWith('/') ? meta.root : `${meta.root}/`;
  if (rootAbs !== meta.root && !rootAbs.startsWith(rootPrefix)) {
    throw new Error('path outside workspace root');
  }
  const findCommand = buildRemoteFindCommand(rootAbs, {
    maxDepth: MAX_DEPTH,
    maxFiles: MAX_MD,
    skip: SKIP,
  });

  // One remote command avoids thousands of latency-bound SFTP round trips.
  // Fall back to SFTP for restricted shells and systems without GNU head/find.
  try {
    const output = await execRemote(client, findCommand);
    const files = parseRemoteFindOutput(output, rootAbs, MAX_MD);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  } catch (error) {
    console.error(
      `[ssh-bridge] remote bulk list unavailable, falling back to SFTP: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const pending = [{ absDir: rootAbs, rel: '', depth: 0 }];

  // Breadth-first batches let independent readdir requests overlap while
  // keeping memory, server load, and traversal depth bounded.
  while (pending.length > 0 && out.length < MAX_MD) {
    const batch = pending.splice(0, LIST_CONCURRENCY);
    const listings = await Promise.all(
      batch.map(async (dir) => {
        try {
          return { dir, entries: await listDir(sftp, dir.absDir) };
        } catch (error) {
          if (dir.depth === 0) {
            // Root listing failure = dead connection or bad permissions;
            // surface it instead of returning an empty tree.
            throw error;
          }
          return { dir, entries: [] };
        }
      }),
    );

    for (const { dir, entries } of listings) {
      if (out.length >= MAX_MD) {
        break;
      }
      // Classify (and stat unknowns) in parallel so incomplete attrs / symlinks
      // do not serialize the whole directory.
      const resolved = await Promise.all(
        entries.map(async (entry) => {
          const name = entry.filename;
          if (!name || name === '.' || name === '..') {
            return null;
          }
          const childRel = dir.rel ? `${dir.rel}/${name}` : name;
          const childAbs = dir.absDir.endsWith('/')
            ? `${dir.absDir}${name}`
            : `${dir.absDir}/${name}`;
          const kind = await resolveEntryKind(sftp, entry, childAbs);
          return { name, childRel, childAbs, kind };
        }),
      );

      for (const item of resolved) {
        if (!item || out.length >= MAX_MD) {
          break;
        }
        const { name, childRel, childAbs, kind } = item;
        if (kind === 'dir') {
          if (
            dir.depth < MAX_DEPTH &&
            !SKIP.has(name) &&
            !name.startsWith('.')
          ) {
            pending.push({ absDir: childAbs, rel: childRel, depth: dir.depth + 1 });
          }
        } else if (kind === 'file' && MD_RE.test(name)) {
          out.push({
            path: childRel,
            name,
            dir: dir.rel,
          });
        }
      }
    }
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
