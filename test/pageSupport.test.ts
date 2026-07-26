import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPagePreviewSupport,
  pageSupportMessage,
} from '../src/shared/pageSupport';

describe('classifyPagePreviewSupport', () => {
  it('supports normal http(s) pages', () => {
    assert.deepEqual(
      classifyPagePreviewSupport('https://example.com/readme.md', true),
      { ok: true },
    );
    assert.deepEqual(classifyPagePreviewSupport('http://localhost:8000/', false), {
      ok: true,
    });
  });

  it('supports file:// when file access is granted', () => {
    assert.deepEqual(classifyPagePreviewSupport('file:///home/u/a.md', true), {
      ok: true,
    });
  });

  it('flags file:// without the file-URL permission', () => {
    assert.deepEqual(classifyPagePreviewSupport('file:///home/u/a.md', false), {
      ok: false,
      reason: 'file-access',
    });
  });

  it('flags browser-internal pages', () => {
    for (const url of [
      'chrome://extensions/',
      'chrome://newtab/',
      'about:blank',
      'edge://settings/',
      'devtools://devtools/bundled/inspector.html',
      'chrome-extension://abcdef/viewer/viewer.html',
      'view-source:https://example.com/',
      'data:text/plain,hello',
    ]) {
      assert.deepEqual(
        classifyPagePreviewSupport(url, true),
        { ok: false, reason: 'internal' },
        url,
      );
    }
  });

  it('flags web store pages', () => {
    for (const url of [
      'https://chromewebstore.google.com/detail/x/abc',
      'https://chrome.google.com/webstore/detail/x/abc',
      'https://microsoftedge.microsoft.com/addons/detail/abc',
    ]) {
      assert.deepEqual(
        classifyPagePreviewSupport(url, true),
        { ok: false, reason: 'webstore' },
        url,
      );
    }
  });

  it('flags missing/unparseable URLs as unknown (restricted page)', () => {
    assert.deepEqual(classifyPagePreviewSupport(undefined, true), {
      ok: false,
      reason: 'unknown',
    });
    assert.deepEqual(classifyPagePreviewSupport('not a url', true), {
      ok: false,
      reason: 'unknown',
    });
  });

  it('has a user-facing message for every reason', () => {
    for (const reason of ['internal', 'webstore', 'file-access', 'unknown'] as const) {
      const msg = pageSupportMessage(reason);
      assert.equal(typeof msg, 'string');
      assert.ok(msg.length > 5, reason);
    }
  });
});
