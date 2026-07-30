import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attrsLookLikeDir,
  classifySftpEntry,
} from '../ssh-bridge/sftpEntry.mjs';

describe('classifySftpEntry', () => {
  it('detects directories from full Unix mode bits', () => {
    assert.equal(classifySftpEntry({ attrs: { mode: 0o40755 } }), 'dir');
    assert.equal(classifySftpEntry({ attrs: { mode: 0o100644 } }), 'file');
  });

  it('falls back when type bits are missing (permissions-only mode)', () => {
    // Bug: old check treated 0o755 as non-dir → walk never descended → empty /list
    assert.equal(
      classifySftpEntry({ attrs: { mode: 0o755 }, longname: 'drwxr-xr-x 2 u g 0 Jan 1 dir' }),
      'dir',
    );
    assert.equal(
      classifySftpEntry({ attrs: { mode: 0o644 }, longname: '-rw-r--r-- 1 u g 0 Jan 1 f.md' }),
      'file',
    );
  });

  it('uses longname when mode is unset', () => {
    assert.equal(classifySftpEntry({ attrs: {}, longname: 'drwxr-xr-x …' }), 'dir');
    assert.equal(classifySftpEntry({ attrs: {}, longname: '-rw-r--r-- …' }), 'file');
    assert.equal(classifySftpEntry({ attrs: {}, longname: 'lrwxrwxrwx …' }), 'unknown');
  });

  it('uses attrs.isDirectory helpers when present', () => {
    assert.equal(
      classifySftpEntry({
        attrs: {
          isDirectory: () => true,
          isFile: () => false,
        },
      }),
      'dir',
    );
    assert.equal(
      classifySftpEntry({
        attrs: {
          isDirectory: () => false,
          isFile: () => true,
        },
      }),
      'file',
    );
  });

  it('returns unknown for incomplete entries (caller should stat)', () => {
    assert.equal(classifySftpEntry({ attrs: { mode: 0 }, longname: '' }), 'unknown');
    assert.equal(classifySftpEntry({ attrs: { mode: 0o755 }, longname: '' }), 'unknown');
    assert.equal(classifySftpEntry({}), 'unknown');
    assert.equal(
      classifySftpEntry({
        attrs: {
          mode: 0o120777,
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
        },
        longname: 'lrwxrwxrwx …',
      }),
      'unknown',
    );
  });
});

describe('attrsLookLikeDir (post-stat resolution for unknown entries)', () => {
  it('reads full mode bits from sftp.stat attrs', () => {
    assert.equal(attrsLookLikeDir({ mode: 0o40755 }), true);
    assert.equal(attrsLookLikeDir({ mode: 0o100644 }), false);
    assert.equal(attrsLookLikeDir({ mode: 0o120777 }), false);
  });

  it('prefers isDirectory helpers (ssh2 Attrs)', () => {
    assert.equal(
      attrsLookLikeDir({
        mode: 0o100644,
        isDirectory: () => true,
      }),
      true,
    );
    assert.equal(
      attrsLookLikeDir({
        mode: 0o40755,
        isDirectory: () => false,
      }),
      false,
    );
  });

  it('returns false for missing or broken attrs', () => {
    assert.equal(attrsLookLikeDir(undefined), false);
    assert.equal(attrsLookLikeDir({}), false);
    assert.equal(
      attrsLookLikeDir({
        isDirectory: () => {
          throw new Error('broken');
        },
      }),
      false,
    );
  });
});
