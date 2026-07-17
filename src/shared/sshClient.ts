/**
 * Client for the local SSH bridge (ssh-bridge/server.mjs).
 */

import type { WorkspaceFileEntry } from './workspaceFs';

export const DEFAULT_SSH_BRIDGE_URL = 'http://127.0.0.1:17823';

export interface SshBridgeSettings {
  bridgeUrl: string;
  bridgeToken: string;
}

export interface SshConnectParams {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** Remote workspace root path (absolute or ~) */
  root?: string;
}

export interface SshSessionMeta {
  host: string;
  port: number;
  username: string;
  root: string;
  connectedAt: number;
}

export interface SshHealth {
  ok: boolean;
  connected: boolean;
  meta: SshSessionMeta | null;
  platform?: string;
  wslAvailable?: boolean;
  wslConnected?: boolean;
  wslMeta?: { distro: string; root: string; connectedAt: number } | null;
}

const STORAGE_KEYS = {
  bridgeUrl: 'sshBridgeUrl',
  bridgeToken: 'sshBridgeToken',
  lastHost: 'sshLastHost',
  lastPort: 'sshLastPort',
  lastUser: 'sshLastUser',
  lastRoot: 'sshLastRoot',
} as const;

export async function loadSshBridgeSettings(): Promise<SshBridgeSettings> {
  try {
    const s = await chrome.storage.local.get({
      [STORAGE_KEYS.bridgeUrl]: DEFAULT_SSH_BRIDGE_URL,
      [STORAGE_KEYS.bridgeToken]: '',
    });
    return {
      bridgeUrl: String(s[STORAGE_KEYS.bridgeUrl] || DEFAULT_SSH_BRIDGE_URL).replace(/\/+$/, ''),
      bridgeToken: String(s[STORAGE_KEYS.bridgeToken] || ''),
    };
  } catch {
    return { bridgeUrl: DEFAULT_SSH_BRIDGE_URL, bridgeToken: '' };
  }
}

export async function saveSshBridgeSettings(
  partial: Partial<SshBridgeSettings>,
): Promise<void> {
  const payload: Record<string, string> = {};
  if (partial.bridgeUrl !== undefined) {
    payload[STORAGE_KEYS.bridgeUrl] = partial.bridgeUrl.replace(/\/+$/, '');
  }
  if (partial.bridgeToken !== undefined) {
    payload[STORAGE_KEYS.bridgeToken] = partial.bridgeToken;
  }
  await chrome.storage.local.set(payload);
}

export async function loadSshFormDefaults(): Promise<{
  host: string;
  port: string;
  username: string;
  root: string;
}> {
  const s = await chrome.storage.local.get({
    [STORAGE_KEYS.lastHost]: '',
    [STORAGE_KEYS.lastPort]: '22',
    [STORAGE_KEYS.lastUser]: '',
    [STORAGE_KEYS.lastRoot]: '.',
  });
  return {
    host: String(s[STORAGE_KEYS.lastHost] || ''),
    port: String(s[STORAGE_KEYS.lastPort] || '22'),
    username: String(s[STORAGE_KEYS.lastUser] || ''),
    root: String(s[STORAGE_KEYS.lastRoot] || '.'),
  };
}

export async function saveSshFormDefaults(form: {
  host: string;
  port: string;
  username: string;
  root: string;
}): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastHost]: form.host,
    [STORAGE_KEYS.lastPort]: form.port,
    [STORAGE_KEYS.lastUser]: form.username,
    [STORAGE_KEYS.lastRoot]: form.root,
  });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  const settings = await loadSshBridgeSettings();
  if (!settings.bridgeToken) {
    throw new Error('未配置 SSH Bridge Token。请先启动 ssh-bridge 并在选项页填入 token。');
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
      `无法连接 SSH Bridge（${settings.bridgeUrl}）。请确认已运行: cd ssh-bridge && npm start`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `bridge error ${res.status}`);
  }
  return data;
}

export async function sshHealth(): Promise<SshHealth> {
  const settings = await loadSshBridgeSettings();
  try {
    const res = await fetch(`${settings.bridgeUrl}/health`);
    return (await res.json()) as SshHealth;
  } catch {
    return { ok: false, connected: false, meta: null };
  }
}

export async function sshConnect(params: SshConnectParams): Promise<SshSessionMeta> {
  const data = await request<{ ok: boolean; meta: SshSessionMeta }>('POST', '/connect', {
    host: params.host,
    port: params.port ?? 22,
    username: params.username,
    password: params.password,
    privateKey: params.privateKey,
    passphrase: params.passphrase,
    root: params.root || '.',
  });
  return data.meta;
}

export async function sshDisconnect(): Promise<void> {
  try {
    await request('POST', '/disconnect', {});
  } catch {
    // ignore if bridge down
  }
}

export async function sshListMarkdown(): Promise<WorkspaceFileEntry[]> {
  const data = await request<{ files: WorkspaceFileEntry[] }>('GET', '/list');
  return data.files ?? [];
}

export async function sshReadText(path: string): Promise<string> {
  const data = await request<{ content: string }>('GET', '/read', undefined, {
    path,
    encoding: 'utf8',
  });
  return data.content;
}

export async function sshReadBase64(path: string): Promise<{ content: string; size: number }> {
  const data = await request<{ content: string; size: number }>('GET', '/read', undefined, {
    path,
    encoding: 'base64',
  });
  return { content: data.content, size: data.size };
}

export async function sshCreateObjectUrl(path: string, mimeHint?: string): Promise<string | null> {
  try {
    const { content } = await sshReadBase64(path);
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const mime = mimeHint || guessMime(path);
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}
