import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** chrome.storage.local mock for the bridge-settings round trip. */
const store: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      async get(keys: Record<string, unknown>) {
        const out: Record<string, unknown> = {};
        for (const [k, def] of Object.entries(keys)) {
          out[k] = k in store ? store[k] : def;
        }
        return out;
      },
      async set(items: Record<string, unknown>) {
        Object.assign(store, items);
      },
    },
  },
};

import {
  DEFAULT_SSH_BRIDGE_URL,
  formatBridgeStatus,
  loadSshBridgeSettings,
  maskBridgeToken,
  saveSshBridgeSettings,
  type SshHealth,
} from '../src/shared/sshClient';

function health(overrides: Partial<SshHealth> = {}): SshHealth {
  return {
    ok: true,
    connected: false,
    meta: null,
    tokenConfigured: true,
    auth: 'ok',
    tokenPreview: 'abcd…wxyz',
    ...overrides,
  };
}

describe('maskBridgeToken', () => {
  it('masks middle, keeps head/tail', () => {
    assert.equal(maskBridgeToken('abcdef1234567890'), 'abcd…7890');
  });
  it('handles short tokens without exposing them fully', () => {
    assert.equal(maskBridgeToken('abc'), '***');
    assert.equal(maskBridgeToken(''), '');
    const mid = maskBridgeToken('abcdefgh');
    assert.ok(mid.includes('…'));
    assert.ok(mid.length < 'abcdefgh'.length + 1);
  });
});

describe('formatBridgeStatus — HTML escaping (regression)', () => {
  it('escapes bridge-supplied SSH identity before innerHTML', () => {
    const h = health({
      connected: true,
      meta: {
        host: 'example.com',
        port: 22,
        username: '<img src=x onerror=alert(1)>',
        root: '/srv',
        connectedAt: 0,
      },
    });
    const { html } = formatBridgeStatus(h, 'zh');
    assert.ok(!html.includes('<img'), html);
    assert.ok(html.includes('&lt;img'), html);
  });

  it('escapes WSL distro/root strings', () => {
    const h = health({
      wslConnected: true,
      wslMeta: { distro: '<b>Evil</b>', root: '/<i>x</i>', connectedAt: 0 },
    });
    for (const locale of ['zh', 'en'] as const) {
      const { html } = formatBridgeStatus(h, locale);
      assert.ok(!html.includes('<b>'), html);
      assert.ok(!html.includes('<i>'), html);
    }
  });

  it('reports offline with tone', () => {
    const { tone } = formatBridgeStatus(health({ ok: false }), 'zh');
    assert.equal(tone, 'offline');
  });

  it('warns when the token is missing or rejected', () => {
    assert.equal(formatBridgeStatus(health({ auth: 'missing' })).tone, 'warn');
    assert.equal(formatBridgeStatus(health({ auth: 'unauthorized' })).tone, 'warn');
    assert.equal(formatBridgeStatus(health({ auth: 'ok' })).tone, 'online');
  });
});

describe('bridge URL normalization (regression)', () => {
  it('prefixes http:// on scheme-less URLs so fetch is not extension-relative', async () => {
    await saveSshBridgeSettings({ bridgeUrl: '127.0.0.1:17823' });
    const s = await loadSshBridgeSettings();
    assert.equal(s.bridgeUrl, 'http://127.0.0.1:17823');
  });

  it('keeps explicit schemes and strips trailing slashes', async () => {
    await saveSshBridgeSettings({ bridgeUrl: 'https://127.0.0.1:9999///' });
    const s = await loadSshBridgeSettings();
    assert.equal(s.bridgeUrl, 'https://127.0.0.1:9999');
  });

  it('falls back to the default for empty values', async () => {
    await saveSshBridgeSettings({ bridgeUrl: '' });
    const s = await loadSshBridgeSettings();
    assert.equal(s.bridgeUrl, DEFAULT_SSH_BRIDGE_URL);
  });
});
