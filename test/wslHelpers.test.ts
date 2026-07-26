import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Plain .mjs module without type declarations
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { assertUnderRoot, joinUnderRoot } from '../ssh-bridge/wsl.mjs';

describe('joinUnderRoot', () => {
  it('joins simple relative paths', () => {
    assert.equal(joinUnderRoot('/home/u/ws', 'a/b.md'), '/home/u/ws/a/b.md');
  });

  it('normalizes backslashes and leading slashes', () => {
    assert.equal(joinUnderRoot('/home/u/ws', '\\a\\b.md'), '/home/u/ws/a/b.md');
    assert.equal(joinUnderRoot('/home/u/ws', '///a.md'), '/home/u/ws/a.md');
  });

  it('clamps .. traversal at the root', () => {
    assert.equal(joinUnderRoot('/home/u/ws', '../../etc/passwd'), '/home/u/ws/etc/passwd');
    assert.equal(joinUnderRoot('/home/u/ws', 'a/../b.md'), '/home/u/ws/b.md');
  });

  it('returns the root itself for empty or "." input', () => {
    assert.equal(joinUnderRoot('/home/u/ws', ''), '/home/u/ws');
    assert.equal(joinUnderRoot('/home/u/ws', '.'), '/home/u/ws');
  });

  it('handles root = /', () => {
    assert.equal(joinUnderRoot('/', 'a.md'), '/a.md');
  });
});

describe('assertUnderRoot', () => {
  it('accepts paths under the root and the root itself', () => {
    assert.doesNotThrow(() => assertUnderRoot('/home/u/ws', '/home/u/ws/a.md'));
    assert.doesNotThrow(() => assertUnderRoot('/home/u/ws', '/home/u/ws'));
  });

  it('rejects paths outside the root', () => {
    assert.throws(() => assertUnderRoot('/home/u/ws', '/home/u/other/a.md'));
    assert.throws(() => assertUnderRoot('/home/u/ws', '/etc/passwd'));
  });

  it('rejects sibling-prefix confusion (ws vs ws2)', () => {
    assert.throws(() => assertUnderRoot('/home/u/ws', '/home/u/ws2/a.md'));
  });
});
