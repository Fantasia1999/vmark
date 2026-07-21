/**
 * Handoff from extension popup → viewer tab after configuring a workspace
 * (pick folder/file or connect SSH/WSL) without opening a blank page first.
 */

export const PENDING_ENTER_KEY = 'pendingWorkbenchEnter';

export type PendingWorkbenchEnter =
  | { kind: 'local' }
  | { kind: 'doc' }
  | { kind: 'ssh' }
  | { kind: 'wsl'; preferredPath?: string };

export async function setPendingEnter(payload: PendingWorkbenchEnter): Promise<void> {
  await chrome.storage.session.set({ [PENDING_ENTER_KEY]: payload });
}

export async function takePendingEnter(): Promise<PendingWorkbenchEnter | null> {
  try {
    const r = await chrome.storage.session.get(PENDING_ENTER_KEY);
    const raw = r[PENDING_ENTER_KEY] as PendingWorkbenchEnter | undefined;
    await chrome.storage.session.remove(PENDING_ENTER_KEY);
    if (!raw || typeof raw !== 'object' || !('kind' in raw)) {
      return null;
    }
    if (
      raw.kind !== 'local' &&
      raw.kind !== 'doc' &&
      raw.kind !== 'ssh' &&
      raw.kind !== 'wsl'
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}
