/**
 * Client for WSL APIs on the local bridge (Windows + wsl.exe).
 */

import type { WorkspaceFileEntry } from './workspaceFs';
import { loadSshBridgeSettings } from './sshClient';
import {
  parseWslLocation,
  resolveWslRelative,
  toWslFileUrl,
  type WslLocation,
} from './wslPaths';

export interface WslSessionMeta {
  distro: string;
  root: string;
  connectedAt: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  const settings = await loadSshBridgeSettings();
  if (!settings.bridgeToken) {
    throw new Error('未配置 Bridge Token。请启动本地 bridge 并在选项页填入 token。');
  }
  const url = new URL(path, settings.bridgeUrl + '/');
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': settings.bridgeToken,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `无法连接 Bridge（${settings.bridgeUrl}）。请确认已运行: npm run ssh-bridge`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `bridge error ${res.status}`);
  }
  return data;
}

export async function wslListDistros(): Promise<string[]> {
  const data = await request<{ distros: string[] }>('GET', '/wsl/distros');
  return data.distros ?? [];
}

export async function wslConnect(distro: string, root: string): Promise<WslSessionMeta> {
  const data = await request<{ ok: boolean; meta: WslSessionMeta }>('POST', '/wsl/connect', {
    distro,
    root,
  });
  return data.meta;
}

export async function wslDisconnect(): Promise<void> {
  try {
    await request('POST', '/wsl/disconnect', {});
  } catch {
    // ignore
  }
}

export async function wslListMarkdown(): Promise<WorkspaceFileEntry[]> {
  const data = await request<{ files: WorkspaceFileEntry[] }>('GET', '/wsl/list');
  return data.files ?? [];
}

export async function wslReadText(path: string): Promise<string> {
  const data = await request<{ content: string }>('GET', '/wsl/read', undefined, {
    path,
    encoding: 'utf8',
  });
  return data.content;
}

export async function wslCreateObjectUrl(path: string): Promise<string | null> {
  try {
    const data = await request<{ content: string }>('GET', '/wsl/read', undefined, {
      path,
      encoding: 'base64',
    });
    const bin = atob(data.content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const blob = new Blob([bytes]);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export { parseWslLocation, resolveWslRelative, toWslFileUrl };
export type { WslLocation };

const LAST = {
  distro: 'wslLastDistro',
  root: 'wslLastRoot',
} as const;

export async function loadWslFormDefaults(): Promise<{ distro: string; root: string }> {
  const s = await chrome.storage.local.get({
    [LAST.distro]: '',
    [LAST.root]: '~',
  });
  return {
    distro: String(s[LAST.distro] || ''),
    root: String(s[LAST.root] || '~'),
  };
}

export async function saveWslFormDefaults(form: { distro: string; root: string }): Promise<void> {
  await chrome.storage.local.set({
    [LAST.distro]: form.distro,
    [LAST.root]: form.root,
  });
}
