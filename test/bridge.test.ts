/**
 * Integration tests for ssh-bridge/server.mjs HTTP behavior:
 * auth gating on /health, Host validation, and error codes.
 * Requires ssh-bridge/node_modules (skipped otherwise).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOKEN = 'test-token-for-bridge-tests';
const PORT = 17901;
const BASE = `http://127.0.0.1:${PORT}`;

const depsInstalled = existsSync(join(ROOT, 'ssh-bridge/node_modules/ssh2'));

describe('ssh-bridge server', { skip: !depsInstalled && 'ssh-bridge deps not installed' }, () => {
  let child: ChildProcess;

  before(async () => {
    child = spawn(process.execPath, [join(ROOT, 'ssh-bridge/server.mjs')], {
      env: { ...process.env, TOKEN, PORT: String(PORT), HOST: '127.0.0.1' },
      stdio: 'ignore',
    });
    // Wait for the server to accept connections
    const deadline = Date.now() + 8000;
    for (;;) {
      try {
        await fetch(`${BASE}/health`);
        break;
      } catch {
        if (Date.now() > deadline) {
          throw new Error('bridge did not start in time');
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  after(() => {
    child?.kill('SIGINT');
  });

  it('/health without token: liveness only, no session details (regression)', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.authRequired, true);
    for (const secret of ['meta', 'wslMeta', 'connected', 'platform']) {
      assert.ok(!(secret in body), `unauthenticated /health leaks "${secret}"`);
    }
  });

  it('/health with token: full details', async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: { 'X-Bridge-Token': TOKEN },
    });
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.connected, false);
    assert.equal(body.meta, null);
    assert.equal(typeof body.platform, 'string');
  });

  it('rejects non-loopback Host headers (DNS rebinding)', async () => {
    // fetch() strips the forbidden Host header, so issue a raw HTTP request.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: PORT,
          path: '/health',
          headers: { Host: 'evil.example.com' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  });

  it('rejects wrong tokens with 401', async () => {
    const res = await fetch(`${BASE}/list`, {
      headers: { 'X-Bridge-Token': 'wrong-token' },
    });
    assert.equal(res.status, 401);
  });

  it('rejects empty token with 401', async () => {
    const res = await fetch(`${BASE}/list`);
    assert.equal(res.status, 401);
  });

  it('/auth/check confirms a valid token', async () => {
    const res = await fetch(`${BASE}/auth/check`, {
      headers: { 'X-Bridge-Token': TOKEN },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.authorized, true);
  });

  it('/ssh/hosts returns a token-protected alias list', async () => {
    const res = await fetch(`${BASE}/ssh/hosts`, {
      headers: { 'X-Bridge-Token': TOKEN },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { hosts?: unknown };
    assert.ok(Array.isArray(body.hosts));
  });

  it('/read without a session returns 409', async () => {
    const res = await fetch(`${BASE}/read?path=a.md`, {
      headers: { 'X-Bridge-Token': TOKEN },
    });
    assert.equal(res.status, 409);
  });

  it('/connect validates required fields', async () => {
    const res = await fetch(`${BASE}/connect`, {
      method: 'POST',
      headers: { 'X-Bridge-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('answers CORS preflight', async () => {
    const res = await fetch(`${BASE}/health`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
  });
});
