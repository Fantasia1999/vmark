import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFileHandleByPath,
  resolveRelativePath,
} from '../src/shared/workspaceFs';

describe('resolveRelativePath', () => {
  it('resolves siblings and ./ prefixes', () => {
    assert.equal(resolveRelativePath('docs/a.md', 'img/x.png'), 'docs/img/x.png');
    assert.equal(resolveRelativePath('docs/a.md', './img/x.png'), 'docs/img/x.png');
  });

  it('resolves ../ upward', () => {
    assert.equal(resolveRelativePath('docs/guide/a.md', '../img/x.png'), 'docs/img/x.png');
    assert.equal(resolveRelativePath('a.md', '../x.png'), 'x.png');
  });

  it('treats absolute hrefs as workspace-root relative', () => {
    assert.equal(resolveRelativePath('docs/a.md', '/img/x.png'), 'img/x.png');
  });

  it('strips query and hash', () => {
    assert.equal(resolveRelativePath('docs/a.md', 'b.md#sec?x=1'), 'docs/b.md');
  });
});

/** Minimal in-memory FileSystemDirectoryHandle fake. */
type Tree = { [name: string]: Tree | string };

function fakeDir(tree: Tree, name = 'root'): FileSystemDirectoryHandle {
  const dir = {
    kind: 'directory' as const,
    name,
    async getDirectoryHandle(child: string) {
      const v = tree[child];
      if (v === undefined || typeof v === 'string') {
        throw new DOMException('not found', 'NotFoundError');
      }
      return fakeDir(v, child);
    },
    async getFileHandle(child: string) {
      const v = tree[child];
      if (typeof v !== 'string') {
        throw new DOMException('not found', 'NotFoundError');
      }
      return { kind: 'file', name: child } as unknown as FileSystemFileHandle;
    },
  };
  return dir as unknown as FileSystemDirectoryHandle;
}

describe('getFileHandleByPath', () => {
  const root = fakeDir({
    'readme.md': 'x',
    a: { b: { 'x.md': 'x' }, 'y.md': 'y' },
  });

  it('resolves nested paths', async () => {
    const h = await getFileHandleByPath(root, 'a/b/x.md');
    assert.equal(h?.name, 'x.md');
  });

  it('tolerates ./ segments and backslashes', async () => {
    const h = await getFileHandleByPath(root, 'a\\.\\y.md');
    assert.equal(h?.name, 'y.md');
  });

  it('returns null for missing files', async () => {
    assert.equal(await getFileHandleByPath(root, 'a/missing.md'), null);
  });

  it('rejects ".." segments instead of silently resolving the wrong file (regression)', async () => {
    // Old bug: "a/../a/y.md" dropped ".." and resolved to a/a/y.md-ish paths
    assert.equal(await getFileHandleByPath(root, 'a/../readme.md'), null);
    assert.equal(await getFileHandleByPath(root, '../readme.md'), null);
  });
});
