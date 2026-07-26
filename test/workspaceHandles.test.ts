import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Minimal in-memory IndexedDB fake covering exactly the API surface
 * workspaceFs.ts uses: open → onupgradeneeded/onsuccess, transaction →
 * objectStore → get/put/delete, tx.oncomplete.
 */
type StoreMap = Map<string, unknown>;

function installFakeIndexedDB(): { stores: Map<string, StoreMap> } {
  const stores = new Map<string, StoreMap>();

  const fake = {
    open(_name: string, _version?: number) {
      const req: {
        result?: unknown;
        error?: unknown;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      queueMicrotask(() => {
        const isNew = stores.size === 0;
        const db = {
          objectStoreNames: {
            contains: (s: string) => stores.has(s),
          },
          createObjectStore(s: string) {
            stores.set(s, new Map());
          },
          transaction(storeName: string, _mode: string) {
            const tx: {
              error?: unknown;
              oncomplete?: () => void;
              onerror?: () => void;
              objectStore: (n?: string) => unknown;
            } = {
              objectStore: () => ({
                get(key: string) {
                  const r: { result?: unknown; onsuccess?: () => void; onerror?: () => void } =
                    {};
                  queueMicrotask(() => {
                    r.result = stores.get(storeName)?.get(key);
                    r.onsuccess?.();
                  });
                  return r;
                },
                put(value: unknown, key: string) {
                  stores.get(storeName)?.set(key, value);
                },
                delete(key: string) {
                  stores.get(storeName)?.delete(key);
                },
              }),
            };
            queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
            return tx;
          },
        };
        req.result = db;
        if (isNew) {
          db.createObjectStore('handles');
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  (globalThis as Record<string, unknown>).indexedDB = fake;
  return { stores };
}

const { stores } = installFakeIndexedDB();

import {
  ensureReadPermission,
  loadRecentWorkspaceHandle,
  removeRecentWorkspaceHandle,
  saveRecentWorkspaceHandle,
  saveWorkspaceHandle,
} from '../src/shared/workspaceFs';

type PermScript = PermissionState[]; // consecutive query/request results

function fakeHandle(name: string, perms?: PermScript): FileSystemDirectoryHandle {
  const script = perms ? [...perms] : null;
  const next = (): PermissionState =>
    script && script.length ? (script.shift() as PermissionState) : 'granted';
  const h: Record<string, unknown> = {
    kind: 'directory',
    name,
  };
  if (script) {
    h.queryPermission = async () => next();
    h.requestPermission = async () => next();
  }
  return h as unknown as FileSystemDirectoryHandle;
}

describe('recent workspace handles (history restore)', () => {
  beforeEach(() => {
    stores.get('handles')?.clear();
  });

  it('round-trips a handle by folder name', async () => {
    await saveRecentWorkspaceHandle(fakeHandle('notes'));
    const restored = await loadRecentWorkspaceHandle('notes');
    assert.equal(restored?.name, 'notes');
  });

  it('returns null for unknown or empty names', async () => {
    assert.equal(await loadRecentWorkspaceHandle('nope'), null);
    assert.equal(await loadRecentWorkspaceHandle(''), null);
  });

  it('overwrites the stored handle for the same folder name', async () => {
    const first = fakeHandle('ws');
    const second = fakeHandle('ws');
    await saveRecentWorkspaceHandle(first);
    await saveRecentWorkspaceHandle(second);
    assert.equal(await loadRecentWorkspaceHandle('ws'), second);
  });

  it('saveWorkspaceHandle also records the recent handle', async () => {
    await saveWorkspaceHandle(fakeHandle('docs'), 'readme.md');
    const restored = await loadRecentWorkspaceHandle('docs');
    assert.equal(restored?.name, 'docs');
  });

  it('prunes to the 15 most recent folders', async () => {
    for (let i = 0; i < 18; i++) {
      await saveRecentWorkspaceHandle(fakeHandle(`ws${i}`));
    }
    assert.equal(await loadRecentWorkspaceHandle('ws0'), null);
    assert.equal(await loadRecentWorkspaceHandle('ws2'), null);
    assert.equal((await loadRecentWorkspaceHandle('ws3'))?.name, 'ws3');
    assert.equal((await loadRecentWorkspaceHandle('ws17'))?.name, 'ws17');
  });

  it('re-saving an existing folder does not evict others', async () => {
    for (let i = 0; i < 15; i++) {
      await saveRecentWorkspaceHandle(fakeHandle(`ws${i}`));
    }
    await saveRecentWorkspaceHandle(fakeHandle('ws0')); // refresh, not new
    assert.equal((await loadRecentWorkspaceHandle('ws1'))?.name, 'ws1');
    assert.equal((await loadRecentWorkspaceHandle('ws14'))?.name, 'ws14');
  });

  it('removeRecentWorkspaceHandle deletes the stored handle', async () => {
    await saveRecentWorkspaceHandle(fakeHandle('gone'));
    await removeRecentWorkspaceHandle('gone');
    assert.equal(await loadRecentWorkspaceHandle('gone'), null);
  });
});

describe('ensureReadPermission (history-click grant flow)', () => {
  it('passes through when permission is already granted', async () => {
    assert.equal(await ensureReadPermission(fakeHandle('a', ['granted']), true), true);
  });

  it('requests permission when in prompt state and accepts a grant', async () => {
    // query → 'prompt', request → 'granted'
    assert.equal(
      await ensureReadPermission(fakeHandle('a', ['prompt', 'granted']), true),
      true,
    );
  });

  it('returns false when the user denies the request', async () => {
    assert.equal(
      await ensureReadPermission(fakeHandle('a', ['prompt', 'denied']), true),
      false,
    );
  });

  it('does not prompt when requestIfNeeded is false', async () => {
    assert.equal(
      await ensureReadPermission(fakeHandle('a', ['prompt', 'granted']), false),
      false,
    );
  });

  it('assumes granted when the API is unavailable', async () => {
    assert.equal(await ensureReadPermission(fakeHandle('a'), true), true);
  });
});
