/**
 * Last workbench session — used to reopen the previous workspace + file
 * instead of falling back to a standalone document snapshot.
 */

import type { SshHistoryTarget, WslHistoryTarget } from './history';

const STORAGE_KEY = 'lastWorkbenchSession';

export type LastSession =
  | {
      kind: 'local';
      localName: string;
      lastFilePath?: string;
      updatedAt: number;
    }
  | {
      kind: 'ssh';
      ssh: SshHistoryTarget;
      lastFilePath?: string;
      updatedAt: number;
    }
  | {
      kind: 'wsl';
      wsl: WslHistoryTarget;
      lastFilePath?: string;
      updatedAt: number;
    }
  | {
      kind: 'standalone';
      name: string;
      updatedAt: number;
    };

export async function loadLastSession(): Promise<LastSession | null> {
  try {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    const raw = r[STORAGE_KEY] as LastSession | undefined;
    if (!raw || typeof raw !== 'object' || !('kind' in raw)) {
      return null;
    }
    if (
      raw.kind !== 'local' &&
      raw.kind !== 'ssh' &&
      raw.kind !== 'wsl' &&
      raw.kind !== 'standalone'
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** Payload without required timestamp — filled in by saveLastSession. */
export type LastSessionInput =
  | {
      kind: 'local';
      localName: string;
      lastFilePath?: string;
    }
  | {
      kind: 'ssh';
      ssh: SshHistoryTarget;
      lastFilePath?: string;
    }
  | {
      kind: 'wsl';
      wsl: WslHistoryTarget;
      lastFilePath?: string;
    }
  | {
      kind: 'standalone';
      name: string;
    };

export async function saveLastSession(session: LastSessionInput): Promise<void> {
  const full = { ...session, updatedAt: Date.now() } as LastSession;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: full });
  } catch {
    // ignore
  }
}

export async function clearLastSession(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // ignore
  }
}
