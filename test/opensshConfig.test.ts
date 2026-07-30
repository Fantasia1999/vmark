import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  expandOpenSshPath,
  listOpenSshHosts,
  parseOpenSshConfig,
} from '../ssh-bridge/opensshConfig.mjs';

describe('OpenSSH config resolution', () => {
  it('parses repeated IdentityFile values and preserves spaces', () => {
    const config = parseOpenSshConfig(
      [
        'host example',
        'hostname 192.0.2.10',
        'user dev user',
        'port 2200',
        'identityfile ~/.ssh/id_ed25519',
        'identityfile C:/keys/work key',
      ].join('\n'),
    );
    assert.deepEqual(config.get('identityfile'), [
      '~/.ssh/id_ed25519',
      'C:/keys/work key',
    ]);
    assert.equal(config.get('user')?.[0], 'dev user');
  });

  it('expands home and OpenSSH percent tokens', () => {
    assert.equal(
      expandOpenSshPath('~/.ssh/%r@%h-%p', {
        host: 'server.example',
        port: 10022,
        username: 'alice',
      }),
      `${os.homedir()}${os.platform() === 'win32' ? '\\' : '/'}${[
        '.ssh',
        'alice@server.example-10022',
      ].join(os.platform() === 'win32' ? '\\' : '/')}`,
    );
    assert.equal(expandOpenSshPath('%d/key'), `${os.homedir()}/key`);
  });

  it('lists concrete Host aliases from config and Include files', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'openssh-config-test-'));
    try {
      const includeDir = path.join(temp, 'config.d');
      fs.mkdirSync(includeDir);
      fs.writeFileSync(
        path.join(temp, 'config'),
        ['Host alpha beta', 'Host *', 'Host !blocked', 'Include config.d/*'].join('\n'),
      );
      fs.writeFileSync(
        path.join(includeDir, 'work.conf'),
        ['Host work-01', '  HostName 192.0.2.1', 'Host work-*'].join('\n'),
      );
      assert.deepEqual(listOpenSshHosts(path.join(temp, 'config')), [
        'alpha',
        'beta',
        'work-01',
      ]);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
