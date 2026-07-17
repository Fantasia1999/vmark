#!/usr/bin/env node
/**
 * Local SSH/SFTP bridge for the Chrome extension.
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
const MAX_DEPTH = 12;

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
  const h =
    req.headers['x-bridge-token'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return h && h === TOKEN;
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

function connectSsh(opts) {
  return new Promise((resolve, reject) => {
    disconnect();
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
          session = {
            client,
            sftp,
            meta: {
              host: opts.host,
              port: opts.port,
              username: opts.username,
              root: opts.root || '.',
              connectedAt: Date.now(),
            },
          };
          resolve(session.meta);
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
        readyTimeout: opts.timeoutMs || 20000,
        // Prefer modern algorithms; let ssh2 negotiate
        tryKeyboard: false,
      });
  });
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
  const { sftp, meta } = session;
  const out = [];
  const rootAbs = await realpath(sftp, joinRemote(meta.root, rootRel || ''));

  async function walk(absDir, rel, depth) {
    if (depth > MAX_DEPTH || out.length >= MAX_MD) {
      return;
    }
    let entries;
    try {
      entries = await listDir(sftp, absDir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_MD) {
        break;
      }
      const name = e.filename;
      if (!name || name === '.' || name === '..') {
        continue;
      }
      const childRel = rel ? `${rel}/${name}` : name;
      const childAbs = absDir.endsWith('/') ? `${absDir}${name}` : `${absDir}/${name}`;
      const isDir = (e.attrs.mode & 0o170000) === 0o040000;
      if (isDir) {
        if (SKIP.has(name) || name.startsWith('.')) {
          continue;
        }
        await walk(childAbs, childRel, depth + 1);
      } else if (MD_RE.test(name)) {
        out.push({
          path: childRel,
          name,
          dir: rel,
        });
      }
    }
  }

  await walk(rootAbs, '', 0);
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

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      connected: !!session,
      meta: session?.meta
        ? {
            host: session.meta.host,
            port: session.meta.port,
            username: session.meta.username,
            root: session.meta.root,
            connectedAt: session.meta.connectedAt,
          }
        : null,
    });
    return;
  }

  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/connect') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.host || !body.username) {
        json(res, 400, { error: 'host and username required' });
        return;
      }
      if (!body.password && !body.privateKey) {
        json(res, 400, { error: 'password or privateKey required' });
        return;
      }
      const meta = await connectSsh({
        host: String(body.host),
        port: Number(body.port) || 22,
        username: String(body.username),
        password: body.password ? String(body.password) : undefined,
        privateKey: body.privateKey ? String(body.privateKey) : undefined,
        passphrase: body.passphrase ? String(body.passphrase) : undefined,
        root: body.root ? String(body.root) : '.',
      });
      // validate root
      try {
        await realpath(session.sftp, joinRemote(meta.root, ''));
      } catch (e) {
        disconnect();
        json(res, 400, { error: `root path not found: ${meta.root}` });
        return;
      }
      json(res, 200, { ok: true, meta });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/disconnect') {
      disconnect();
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/list') {
      if (!session) {
        json(res, 409, { error: 'not connected' });
        return;
      }
      const files = await listMarkdown(url.searchParams.get('path') || '');
      json(res, 200, { files, meta: session.meta });
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
  console.log('VS Code Markdown Preview — SSH Bridge');
  console.log('--------------------------------------');
  console.log(`Listening:  http://${HOST}:${PORT}`);
  console.log(`Token:      ${TOKEN}`);
  console.log(`Token file: ${TOKEN_FILE}`);
  console.log('');
  console.log('In the extension options, set:');
  console.log(`  Bridge URL:   http://${HOST}:${PORT}`);
  console.log(`  Bridge token: (paste token above)`);
  console.log('');
  console.log('Keep this process running while using SSH workspace.');
  console.log('');
});

process.on('SIGINT', () => {
  disconnect();
  server.close(() => process.exit(0));
});
