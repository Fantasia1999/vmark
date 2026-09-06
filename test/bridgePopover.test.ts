import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  getBridgePopoverModel,
} from '../src/viewer/bridgePopover';
import type { SshHealth } from '../src/shared/sshClient';

function fakeHealth(overrides: Partial<SshHealth> = {}): SshHealth {
  return {
    ok: true,
    connected: false,
    meta: null,
    tokenConfigured: true,
    tokenPreview: 'tok...123',
    auth: 'ok',
    ...overrides,
  };
}

describe('bridgePopover — getBridgePopoverModel', () => {
  it('handles offline status with no token configured', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: false,
        tokenConfigured: false,
        tokenPreview: '',
        auth: 'unchecked',
      }),
      { bridgeUrl: 'http://127.0.0.1:17823' },
    );

    assert.equal(model.online, false);
    assert.equal(model.statusText, 'Bridge 离线');
    assert.equal(model.statusTone, 'offline');
    assert.equal(model.authText, '未配置');
    assert.equal(model.authTone, 'warn');
    assert.equal(model.hintKind, 'offline');
    assert.equal(model.command, 'npm run ssh-bridge');
  });

  it('handles offline status with configured token', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: false,
        tokenConfigured: true,
        tokenPreview: 'abc...789',
        auth: 'unchecked',
      }),
      { bridgeUrl: 'http://127.0.0.1:17823' },
    );

    assert.equal(model.online, false);
    assert.equal(model.statusText, 'Bridge 离线');
    assert.equal(model.authText, '已配置 (离线未校验)');
    assert.equal(model.tokenPreview, 'abc...789');
    assert.equal(model.hintKind, 'offline');
  });

  it('handles online status with authorized token', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        auth: 'ok',
        tokenPreview: 'tok...123',
      }),
    );

    assert.equal(model.online, true);
    assert.equal(model.statusText, 'Bridge 在线');
    assert.equal(model.statusTone, 'online');
    assert.equal(model.authText, '已授权');
    assert.equal(model.authTone, 'ok');
    assert.equal(model.hintKind, 'ok');
  });

  it('handles online status with missing token', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        auth: 'missing',
        tokenConfigured: false,
        tokenPreview: '',
      }),
    );

    assert.equal(model.online, true);
    assert.equal(model.statusText, 'Bridge 在线');
    assert.equal(model.authText, '未配置');
    assert.equal(model.authTone, 'warn');
    assert.equal(model.hintKind, 'warn-missing-token');
  });

  it('handles online status with unauthorized token', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        auth: 'unauthorized',
        tokenConfigured: true,
        tokenPreview: 'bad...tok',
      }),
    );

    assert.equal(model.online, true);
    assert.equal(model.statusText, 'Bridge 在线');
    assert.equal(model.statusTone, 'warn');
    assert.equal(model.authText, '无效 / 未授权');
    assert.equal(model.authTone, 'bad');
    assert.equal(model.hintKind, 'warn-invalid-token');
  });

  it('displays WSL ready when wslAvailable is true', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        wslAvailable: true,
      }),
    );

    assert.equal(model.wslText, '可用 (wsl.exe)');
  });

  it('displays WSL unavailable when platform is not win32', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        platform: 'darwin',
        wslAvailable: false,
      }),
    );

    assert.equal(model.wslText, '不可用 (非 Windows)');
  });

  it('displays active SSH session info', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        connected: true,
        meta: {
          username: 'ubuntu',
          host: '192.168.1.100',
          port: 22,
          root: '/home/ubuntu/docs',
          connectedAt: Date.now(),
        },
      }),
    );

    assert.equal(model.sessionText, 'SSH (ubuntu@192.168.1.100)');
  });

  it('displays active WSL session info', () => {
    const model = getBridgePopoverModel(
      fakeHealth({
        ok: true,
        wslConnected: true,
        wslMeta: {
          distro: 'Ubuntu-22.04',
          root: '/home/user/project',
          connectedAt: Date.now(),
        },
      }),
    );

    assert.equal(model.sessionText, 'WSL (Ubuntu-22.04)');
  });
});

describe('bridgePopover — escapeHtml', () => {
  it('escapes HTML characters to prevent XSS', () => {
    assert.equal(
      escapeHtml('<script>alert("xss")&\'</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#39;&lt;/script&gt;',
    );
  });
});
