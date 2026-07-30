#!/usr/bin/env node
/**
 * Local bridge for the Chrome extension: SSH/SFTP + Windows WSL.
 * Binds to 127.0.0.1 only. Requires a token on every request.
 *
 * Usage:
 *   npm start
 *   PORT=17823 TOKEN=my-secret npm start
 *   # or write token to ~/.vscode-md-preview-ssh-token
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'ssh2';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
} from './remoteFind.mjs';
import {
  listOpenSshHosts,
  resolveOpenSshConnection,
} from './opensshConfig.mjs';
import { attrsLookLikeDir, classifySftpEntry } from './sftpEntry.mjs';
import * as wsl from './wsl.mjs';

const PORT = Number(process.env.PORT || 17823);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN_FILE = process.env.TOKEN_FILE || path.join(os.homedir(), '.vscode-md-preview-ssh-token');

function loadOrCreateToken() {
  if (process.env.TOKEN) {
    return process.env.TOKEN;
  }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (t) {
        return t;
      }
    }
  } catch {
    // ignore
  }
  const t = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(TOKEN_FILE, `${t}\n`, { mode: 0o600 });
  } catch {
    // ignore
  }
  return t;
}

const TOKEN = loadOrCreateToken();

/** @type {{ client: Client, sftp: import('ssh2').SFTPWrapper, meta: object } | null} */
let session = null;

/** @type {{ distro: string, root: string, connectedAt: number } | null} */
let wslSession = null;

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
const MAX_MD = 2000;
const MAX_DEPTH = 12;
// SFTP requests are latency-bound on remote hosts. A serial directory walk can
// take minutes on a large repository, so issue a small bounded batch at once.
const LIST_CONCURRENCY = 16;

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bridge-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

function unauthorized(res) {
  json(res, 401, { error: 'unauthorized' });
}

function checkAuth(req) {
  const h = String(
    req.headers['x-bridge-token'] ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
  );
  if (!h) {
    return false;
  }
  const a = Buffer.from(h);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Reject DNS-rebinding: the bridge is loopback-only, so Host must be too. */
function checkHost(req) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  return (
    host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === HOST
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function disconnect() {
  if (session) {
    try {
      session.client.end();
    } catch {
      // ignore
    }
    session = null;
  }
}

/**
 * Open a new SSH+SFTP connection WITHOUT touching the current session, so a
 * failed reconnect cannot destroy a working one. The caller validates the
 * root and then swaps it in via adoptSession().
 */
function connectSsh(opts) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('SSH connection timeout'));
    }, opts.timeoutMs || 20000);

    client
      .on('ready', () => {
        client.sftp((err, sftp) => {
          clearTimeout(timeout);
          if (err) {
            client.end();
            reject(err);
            return;
          }
          resolve({ client, sftp });
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .connect({
        host: opts.host,
        port: opts.port || 22,
        username: opts.username,
        password: opts.password || undefined,
        privateKey: opts.privateKey || undefined,
        passphrase: opts.passphrase || undefined,
        agent: opts.agent || undefined,
        readyTimeout: opts.timeoutMs || 20000,
        // Detect dead TCP connections (laptop sleep, NAT drop) instead of
        // reporting connected:true forever.
        keepaliveInterval: 15000,
        keepaliveCountMax: 4,
        // Prefer modern algorithms; let ssh2 negotiate
        tryKeyboard: false,
      });
  });
}

/** Replace the active session and clear it again when this client dies. */
function adoptSession(client, sftp, meta) {
  disconnect();
  session = { client, sftp, meta };
  const clear = () => {
    if (session && session.client === client) {
      session = null;
      console.error('[ssh-bridge] SSH connection lost; session cleared');
    }
  };
  client.on('error', clear);
  client.on('close', clear);
  client.on('end', clear);
}

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

function normalizeRel(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
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

function readFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
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

async function listMarkdown(rootRel) {
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bridge-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (!checkHost(req)) {
    json(res, 403, { error: 'forbidden host' });
    return;
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (url.pathname === '/health') {
    if (!checkAuth(req)) {
      // Liveness only. Session details (SSH identity, workspace roots) are
      // token-gated — any webpage can reach 127.0.0.1 and must learn nothing.
      json(res, 200, { ok: true, authRequired: true });
      return;
    }
    json(res, 200, {
      ok: true,
      platform: process.platform,
      wslAvailable: process.platform === 'win32',
      connected: !!session,
      wslConnected: !!wslSession,
      meta: session?.meta
        ? {
            host: session.meta.host,
            port: session.meta.port,
            username: session.meta.username,
            root: session.meta.root,
            connectedAt: session.meta.connectedAt,
          }
        : null,
      wslMeta: wslSession,
    });
    return;
  }

  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  try {
    // Lightweight token probe (health stays public; this confirms X-Bridge-Token)
    if (req.method === 'GET' && url.pathname === '/auth/check') {
      json(res, 200, { ok: true, authorized: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ssh/hosts') {
      json(res, 200, { hosts: listOpenSshHosts() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/connect') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const authMode = String(body.authMode || '');
      const useOpenSshConfig = authMode === 'openssh' || body.useOpenSshConfig === true;
      if (!body.host || (!useOpenSshConfig && !body.username)) {
        json(res, 400, {
          error: useOpenSshConfig ? 'host alias required' : 'host and username required',
        });
        return;
      }
      if (!useOpenSshConfig && !body.password && !body.privateKey) {
        json(res, 400, { error: 'password or privateKey required' });
        return;
      }
      const resolved = useOpenSshConfig
        ? await resolveOpenSshConnection(
            String(body.host),
            body.passphrase ? String(body.passphrase) : undefined,
          )
        : {
            alias: null,
            host: String(body.host),
            port: Number(body.port) || 22,
            username: String(body.username),
            password: body.password ? String(body.password) : undefined,
            privateKey: body.privateKey ? String(body.privateKey) : undefined,
            passphrase: body.passphrase ? String(body.passphrase) : undefined,
            agent: undefined,
          };
      // SFTP has no tilde expansion (that is an ssh-client feature); '~'
      // resolves against the login cwd, which realpath('.') reaches.
      const rawRoot = body.root ? String(body.root) : '.';
      const rootInput =
        rawRoot === '~' ? '.' : rawRoot.startsWith('~/') ? rawRoot.slice(2) : rawRoot;
      const { client, sftp } = await connectSsh({
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        password: resolved.password,
        privateKey: resolved.privateKey,
        passphrase: resolved.passphrase,
        agent: resolved.agent,
      });
      // validate root before replacing any existing working session
      let rootAbs;
      try {
        rootAbs = await realpath(sftp, joinRemote(rootInput, ''));
      } catch (e) {
        try {
          client.end();
        } catch {
          // ignore
        }
        json(res, 400, { error: `root path not found: ${rawRoot}` });
        return;
      }
      const meta = {
        host: resolved.alias || resolved.host,
        port: resolved.port,
        username: resolved.username,
        root: rootAbs,
        connectedAt: Date.now(),
        authMode: useOpenSshConfig ? 'openssh' : authMode || undefined,
      };
      adoptSession(client, sftp, meta);
      json(res, 200, { ok: true, meta });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/disconnect') {
      disconnect();
      json(res, 200, { ok: true });
      return;
    }

    // —— WSL ——
    if (req.method === 'GET' && url.pathname === '/wsl/distros') {
      const distros = await wsl.listDistros();
      json(res, 200, { distros, platform: process.platform });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/wsl/connect') {
      if (!wsl.isWindowsHost()) {
        json(res, 400, { error: 'WSL bridge requires Windows host (wsl.exe)' });
        return;
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      const distro = String(body.distro || '').trim();
      const root = String(body.root || '~').trim() || '~';
      if (!distro) {
        json(res, 400, { error: 'distro required' });
        return;
      }
      const rootAbs = await wsl.resolveRoot(distro, root);
      wslSession = { distro, root: rootAbs, connectedAt: Date.now() };
      json(res, 200, { ok: true, meta: wslSession });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/wsl/disconnect') {
      wslSession = null;
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/wsl/list') {
      if (!wslSession) {
        json(res, 409, { error: 'WSL not connected' });
        return;
      }
      const files = await wsl.listMarkdown(wslSession.distro, wslSession.root);
      json(res, 200, { files, meta: wslSession });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/wsl/read') {
      if (!wslSession) {
        json(res, 409, { error: 'WSL not connected' });
        return;
      }
      const rel = normalizeRel(url.searchParams.get('path') || '');
      if (!rel) {
        json(res, 400, { error: 'path required' });
        return;
      }
      const abs = wsl.joinUnderRoot(wslSession.root, rel);
      wsl.assertUnderRoot(wslSession.root, abs);
      const encoding = url.searchParams.get('encoding') || 'utf8';
      if (encoding === 'base64') {
        // rootAbs re-checks containment after realpath inside the distro,
        // so symlinks cannot escape the workspace (mirrors the SSH /read path).
        const content = await wsl.readFileBase64(wslSession.distro, abs, wslSession.root);
        json(res, 200, {
          path: rel,
          encoding: 'base64',
          content,
          size: Buffer.from(content, 'base64').length,
        });
      } else {
        const content = await wsl.readFileUtf8(wslSession.distro, abs, wslSession.root);
        json(res, 200, {
          path: rel,
          encoding: 'utf8',
          content,
          size: Buffer.byteLength(content),
        });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/list') {
      if (!session) {
        json(res, 409, { error: 'not connected' });
        return;
      }
      const meta = session.meta;
      const files = await listMarkdown(url.searchParams.get('path') || '');
      json(res, 200, { files, meta });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/read') {
      if (!session) {
        json(res, 409, { error: 'not connected' });
        return;
      }
      const rel = normalizeRel(url.searchParams.get('path') || '');
      if (!rel) {
        json(res, 400, { error: 'path required' });
        return;
      }
      // prevent path escape via .. beyond root by resolving realpath under root
      const remote = joinRemote(session.meta.root, rel);
      const rootAbs = await realpath(session.sftp, joinRemote(session.meta.root, ''));
      const fileAbs = await realpath(session.sftp, remote);
      if (fileAbs !== rootAbs && !fileAbs.startsWith(rootAbs.endsWith('/') ? rootAbs : `${rootAbs}/`)) {
        json(res, 403, { error: 'path outside workspace root' });
        return;
      }
      const data = await readFile(session.sftp, fileAbs);
      const encoding = url.searchParams.get('encoding') || 'utf8';
      if (encoding === 'base64') {
        json(res, 200, {
          path: rel,
          encoding: 'base64',
          content: data.toString('base64'),
          size: data.length,
        });
      } else {
        json(res, 200, {
          path: rel,
          encoding: 'utf8',
          content: data.toString('utf8'),
          size: data.length,
        });
      }
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ssh-bridge]', msg);
    json(res, 500, { error: msg });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('VS Code Markdown Preview — Local Bridge (SSH + WSL)');
  console.log('----------------------------------------------------');
  console.log(`Listening:  http://${HOST}:${PORT}`);
  console.log(`Token:      ${TOKEN}`);
  console.log(`Token file: ${TOKEN_FILE}`);
  console.log(`Platform:   ${process.platform}`);
  console.log(`WSL APIs:   ${process.platform === 'win32' ? 'enabled' : 'disabled (need Windows)'}`);
  console.log('');
  console.log('In the extension options, set:');
  console.log(`  Bridge URL:   http://${HOST}:${PORT}`);
  console.log(`  Bridge token: (paste token above)`);
  console.log('');
  console.log('Keep this process running while using SSH / WSL workspace.');
  console.log('');
});

process.on('SIGINT', () => {
  disconnect();
  server.close(() => process.exit(0));
});
