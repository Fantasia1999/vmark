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
  listOpenSshHosts,
  resolveOpenSshConnection,
} from './opensshConfig.mjs';
import { listMarkdown } from './listMarkdown.mjs';
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
      const useOpenSshConfig = authMode === 'openssh';
      const reuseSession = Boolean(body.reuseSession);

      if (!body.host || (!useOpenSshConfig && !body.username)) {
        json(res, 400, {
          error: useOpenSshConfig ? 'host alias required' : 'host and username required',
        });
        return;
      }

      // SFTP has no tilde expansion (that is an ssh-client feature); '~'
      // resolves against the login cwd, which realpath('.') reaches.
      const rawRoot = body.root ? String(body.root) : '.';
      const rootInput =
        rawRoot === '~' ? '.' : rawRoot.startsWith('~/') ? rawRoot.slice(2) : rawRoot;

      const targetHost = String(body.host);
      const targetPort = Number(body.port) || 22;
      const targetUser = String(body.username || '');

      // Check for active session reuse:
      // Reuse only when requested via reuseSession: true, or when credentials are omitted.
      // If the client explicitly provided a new password or private key, we perform a fresh connect.
      const shouldAttemptReuse =
        reuseSession || (!body.password && !body.privateKey);

      if (session && shouldAttemptReuse) {
        const matchesSession =
          (session.meta.host === targetHost || session.meta.alias === targetHost) &&
          (useOpenSshConfig || (!targetUser || session.meta.username === targetUser)) &&
          (useOpenSshConfig || session.meta.port === targetPort);

        if (matchesSession) {
          try {
            const rootAbs = await realpath(session.sftp, joinRemote(rootInput, ''));
            session.meta.root = rootAbs;
            session.meta.connectedAt = Date.now();
            if (authMode) {
              session.meta.authMode = useOpenSshConfig ? 'openssh' : authMode;
            }
            json(res, 200, { ok: true, meta: session.meta, reused: true });
            return;
          } catch (e) {
            if (reuseSession && !body.password && !body.privateKey && !useOpenSshConfig) {
              json(res, 400, {
                error: `无法复用会话: ${e instanceof Error ? e.message : String(e)}`,
              });
              return;
            }
          }
        }
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
        alias: resolved.alias || undefined,
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
      const files = await listMarkdown(session, url.searchParams.get('path') || '');
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
