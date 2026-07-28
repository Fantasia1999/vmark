import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Plain .mjs module without type declarations
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { assertUnderRoot, buildListMarkdownScript, joinUnderRoot } from '../ssh-bridge/wsl.mjs';

describe('buildListMarkdownScript', () => {
  it('filters previewable files before applying the result cap', () => {
    const script = buildListMarkdownScript('/home/u/ws');
    const fileFilter = script.indexOf("-type f \\( -iname '*.md'");
    const print = script.indexOf('-print');
    const cap = script.indexOf('| head -n 2000');

    assert.ok(fileFilter >= 0, 'expected a find predicate for previewable extensions');
    assert.ok(print > fileFilter, 'expected filtering before printing results');
    assert.ok(cap > print, 'expected the cap after previewable files are selected');
    assert.doesNotMatch(script, /-type f -print/);
  });

  it('matches every supported preview extension case-insensitively', () => {
    const script = buildListMarkdownScript('/home/u/ws');
    for (const glob of ['*.md', '*.markdown', '*.mdown', '*.mkd', '*.mdx', '*.txt', '*.svg']) {
      assert.ok(script.includes(`-iname '${glob}'`), `missing case-insensitive filter for ${glob}`);
    }
  });

  it('prunes hidden paths and safely quotes the workspace root', () => {
    const script = buildListMarkdownScript("/home/u/it's docs");
    assert.match(script, /-path '\*\/\.\*'/);
    assert.match(script, /cd '\/home\/u\/it'\\''s docs'/);
  });
});

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
