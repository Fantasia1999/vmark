import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRemoteFindCommand,
  parseRemoteFindOutput,
  shellQuote,
} from '../ssh-bridge/remoteFind.mjs';

describe('remote SSH workspace listing', () => {
  it('quotes roots so shell metacharacters cannot be evaluated', () => {
    assert.equal(shellQuote("/tmp/a'b; touch /tmp/pwned"), "'/tmp/a'\"'\"'b; touch /tmp/pwned'");
  });

  it('builds a depth/file-limited NUL-delimited find command', () => {
    const command = buildRemoteFindCommand('/workspace', {
      maxDepth: 12,
      maxFiles: 2000,
      skip: new Set(['.git', 'build']),
    });
    assert.ok(command.startsWith("find '/workspace' -maxdepth 13 "));
    assert.ok(command.includes("-name '.git'"));
    assert.match(command, /-print0/);
    assert.match(command, /\| head -z -n 2000$/);
  });

  it('parses spaces and newlines while rejecting paths outside the root', () => {
    const output = Buffer.from(
      [
        '/workspace/README.md',
        '/workspace/docs/a b.md',
        '/workspace/docs/line\nbreak.txt',
        '/other/escape.md',
        '/workspace/sub/../escape.md',
        '',
      ].join('\0'),
    );
    assert.deepEqual(parseRemoteFindOutput(output, '/workspace'), [
      { path: 'README.md', name: 'README.md', dir: '' },
      { path: 'docs/a b.md', name: 'a b.md', dir: 'docs' },
      { path: 'docs/line\nbreak.txt', name: 'line\nbreak.txt', dir: 'docs' },
    ]);
  });

  it('honors the client-side result cap', () => {
    const output = Buffer.from(
      '/workspace/a.md\0/workspace/b.md\0/workspace/c.md\0',
    );
    assert.equal(parseRemoteFindOutput(output, '/workspace', 2).length, 2);
  });
});
