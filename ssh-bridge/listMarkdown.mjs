/**
 * SSH workspace markdown listing via a single remote GNU find command.
 *
 * Contract: the SSH target must be Linux (or a POSIX environment) with a
 * login shell that can run `find … -print0 | head -z`. There is no SFTP
 * directory walk fallback — Windows SSH targets and find-less hosts fail
 * with an explicit error.
 */

import { MAX_DEPTH, MAX_MD, SKIP } from './previewConstants.mjs';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
} from './remoteFind.mjs';

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
 * @param {{ client: import('ssh2').Client, sftp: import('ssh2').SFTPWrapper, meta: { root: string } }} session
 * @param {string} [rootRel]
 */
export async function listMarkdown(session, rootRel = '') {
  if (!session) {
    throw new Error('not connected');
  }
  const { client, sftp, meta } = session;
  const rootAbs =
    !rootRel || rootRel === '.'
      ? meta.root
      : await realpath(sftp, joinRemote(meta.root, rootRel));
  const rootPrefix = meta.root.endsWith('/') ? meta.root : `${meta.root}/`;
  if (rootAbs !== meta.root && !rootAbs.startsWith(rootPrefix)) {
    throw new Error('path outside workspace root');
  }

  const findCommand = buildRemoteFindCommand(rootAbs, {
    maxDepth: MAX_DEPTH,
    maxFiles: MAX_MD,
    skip: SKIP,
  });

  let output;
  try {
    output = await execRemote(client, findCommand);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SSH 工作区列举需要远程 Linux 上的 GNU find（find … -print0 | head -z）。` +
        `不支持以 Windows 为 SSH 目标，也没有 SFTP 扫目录回退。原因：${detail}`,
    );
  }

  const files = parseRemoteFindOutput(output, rootAbs, MAX_MD);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
