import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

/** In-memory chrome.storage.local mock (async like the real API). */
const store: Record<string, unknown> = {};

function resetStore(): void {
  for (const k of Object.keys(store)) {
    delete store[k];
  }
}

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      async get(keys: string | string[] | Record<string, unknown>) {
        await Promise.resolve(); // force async boundary like the real API
        if (typeof keys === 'string') {
          return { [keys]: structuredClone(store[keys]) };
        }
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((k) => [k, structuredClone(store[k])]));
        }
        const out: Record<string, unknown> = {};
        for (const [k, def] of Object.entries(keys)) {
          out[k] = k in store ? structuredClone(store[k]) : def;
        }
        return out;
      },
      async set(items: Record<string, unknown>) {
        await Promise.resolve();
        Object.assign(store, structuredClone(items));
      },
      async remove(keys: string | string[]) {
        await Promise.resolve();
        for (const k of Array.isArray(keys) ? keys : [keys]) {
          delete store[k];
        }
      },
    },
  },
};

// Import AFTER the mock exists (module only touches chrome inside functions,
// but keeping the order explicit documents the dependency).
import {
  clearAllHistory,
  loadFileHistory,
  loadWorkspaceHistory,
  recordFileOpen,
  recordWorkspaceOpen,
  removeFileHistory,
  touchWorkspaceLastFile,
} from '../src/shared/history';

describe('history — basics', () => {
  beforeEach(async () => {
    resetStore();
    await clearAllHistory();
  });

  it('records and dedupes workspaces by identity key', async () => {
    await recordWorkspaceOpen({ source: 'local', title: 'notes', localName: 'notes' });
    await recordWorkspaceOpen({ source: 'local', title: 'notes', localName: 'notes' });
    const list = await loadWorkspaceHistory();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'notes');
  });

  it('keeps distinct ssh roots as distinct workspaces', async () => {
    const base = { host: 'h', port: 22, username: 'u' };
    await recordWorkspaceOpen({ source: 'ssh', title: 'a', ssh: { ...base, root: '/a' } });
    await recordWorkspaceOpen({ source: 'ssh', title: 'b', ssh: { ...base, root: '/b' } });
    assert.equal((await loadWorkspaceHistory()).length, 2);
  });

  it('caps file history at 25 entries, newest first', async () => {
    for (let i = 0; i < 30; i++) {
      await recordFileOpen({
        source: 'local',
        title: `f${i}.md`,
        path: `f${i}.md`,
        localName: 'ws',
      });
    }
    const list = await loadFileHistory();
    assert.equal(list.length, 25);
    assert.equal(list[0].title, 'f29.md');
  });

  it('removeFileHistory deletes by id', async () => {
    await recordFileOpen({ source: 'standalone', title: 'a.md' });
    const [entry] = await loadFileHistory();
    await removeFileHistory(entry.id);
    assert.equal((await loadFileHistory()).length, 0);
  });
});

describe('history — concurrent write serialization (regression)', () => {
  beforeEach(async () => {
    resetStore();
    await clearAllHistory();
  });

  it('recordWorkspaceOpen + touchWorkspaceLastFile fired together both land', async () => {
    // Old bug: both read the same (empty) list; last set wins and one update
    // is silently dropped. The write lock serializes them.
    await Promise.all([
      recordWorkspaceOpen({ source: 'local', title: 'ws', localName: 'ws' }),
      touchWorkspaceLastFile({ source: 'local', localName: 'ws' }, 'a.md'),
    ]);
    const list = await loadWorkspaceHistory();
    assert.equal(list.length, 1);
    assert.equal(list[0].lastFilePath, 'a.md');
  });

  it('two concurrent recordFileOpen calls both persist', async () => {
    await Promise.all([
      recordFileOpen({ source: 'local', title: 'a.md', path: 'a.md', localName: 'ws' }),
      recordFileOpen({ source: 'local', title: 'b.md', path: 'b.md', localName: 'ws' }),
    ]);
    const titles = (await loadFileHistory()).map((e) => e.title).sort();
    assert.deepEqual(titles, ['a.md', 'b.md']);
  });

  it('a burst of mixed concurrent writes loses nothing', async () => {
    await Promise.all([
      recordWorkspaceOpen({ source: 'local', title: 'ws', localName: 'ws' }),
      recordFileOpen({ source: 'local', title: '1.md', path: '1.md', localName: 'ws' }),
      recordFileOpen({ source: 'local', title: '2.md', path: '2.md', localName: 'ws' }),
      touchWorkspaceLastFile({ source: 'local', localName: 'ws' }, '2.md'),
      recordFileOpen({ source: 'local', title: '3.md', path: '3.md', localName: 'ws' }),
    ]);
    assert.equal((await loadFileHistory()).length, 3);
    const [ws] = await loadWorkspaceHistory();
    assert.equal(ws.lastFilePath, '2.md');
  });
});
