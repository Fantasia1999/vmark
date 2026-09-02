/**
 * Client for the local SSH bridge (ssh-bridge/server.mjs).
 */

import type { WorkspaceFileEntry } from './workspaceFs';

export const DEFAULT_SSH_BRIDGE_URL = 'http://127.0.0.1:17823';

export interface SshBridgeSettings {
  bridgeUrl: string;
  bridgeToken: string;
}

export type SshAuthMode = 'password' | 'key' | 'openssh';

/** Connect payload for the local bridge. Required fields depend on authMode. */
export type SshConnectParams =
  | {
      authMode: 'password';
      host: string;
      port?: number;
      username: string;
      password?: string;
      root?: string;
      reuseSession?: boolean;
    }
  | {
      authMode: 'key';
      host: string;
      port?: number;
      username: string;
      privateKey?: string;
      passphrase?: string;
      root?: string;
      reuseSession?: boolean;
    }
  | {
      authMode: 'openssh';
      /** OpenSSH Host alias from ~/.ssh/config */
      host: string;
      passphrase?: string;
      root?: string;
      reuseSession?: boolean;
    };

export interface SshSessionMeta {
  host: string;
  port: number;
  username: string;
  root: string;
  connectedAt: number;
  authMode?: SshAuthMode;
}

/** Token probe result — independent of process online/offline. */
export type BridgeAuthStatus =
  | 'ok'
  | 'missing'
  | 'unauthorized'
  | 'unchecked'
  | 'error';

export interface SshHealth {
  ok: boolean;
  connected: boolean;
  meta: SshSessionMeta | null;
  platform?: string;
  wslAvailable?: boolean;
  wslConnected?: boolean;
  wslMeta?: { distro: string; root: string; connectedAt: number } | null;
  /** Whether a non-empty token is saved in extension settings */
  tokenConfigured: boolean;
  /**
   * Token validity against the running bridge.
   * - ok: /auth/check succeeded
   * - missing: no token configured
   * - unauthorized: token rejected (401)
   * - unchecked: bridge offline (cannot probe)
   * - error: probe failed for other reasons
   */
  auth: BridgeAuthStatus;
  /** Masked token for UI confirmation, e.g. `a1b2…f9e0` (never full secret) */
  tokenPreview?: string;
}

const STORAGE_KEYS = {
  bridgeUrl: 'sshBridgeUrl',
  bridgeToken: 'sshBridgeToken',
  lastHost: 'sshLastHost',
  lastPort: 'sshLastPort',
  lastUser: 'sshLastUser',
  lastRoot: 'sshLastRoot',
  lastAuthMode: 'sshLastAuthMode',
  rememberPassword: 'sshRememberPassword',
  savedPasswords: 'sshSavedPasswords',
} as const;

export function getSshCredentialKey(
  host: string,
  port: number | string = 22,
  username = '',
): string {
  const p = Number(port) || 22;
  const u = username.trim();
  const h = host.trim();
  return u ? `${u}@${h}:${p}` : `${h}:${p}`;
}

export async function loadSshRememberPasswordPref(): Promise<boolean> {
  try {
    const s = await chrome.storage.local.get({
      [STORAGE_KEYS.rememberPassword]: false,
    });
    return Boolean(s[STORAGE_KEYS.rememberPassword]);
  } catch {
    return false;
  }
}

export async function saveSshRememberPasswordPref(remember: boolean): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.rememberPassword]: remember,
  });
}

export async function loadSavedSshPassword(
  host: string,
  port: number | string = 22,
  username = '',
): Promise<string | undefined> {
  if (!host.trim()) return undefined;
  try {
    const key = getSshCredentialKey(host, port, username);
    const s = await chrome.storage.local.get({
      [STORAGE_KEYS.savedPasswords]: {},
    });
    const map = (s[STORAGE_KEYS.savedPasswords] || {}) as Record<string, string>;
    return typeof map[key] === 'string' ? map[key] : undefined;
  } catch {
    return undefined;
  }
}

export async function saveSshPassword(
  host: string,
  port: number | string = 22,
  username = '',
  password = '',
): Promise<void> {
  if (!host.trim() || !password) return;
  const key = getSshCredentialKey(host, port, username);
  const s = await chrome.storage.local.get({
    [STORAGE_KEYS.savedPasswords]: {},
  });
  const map = { ...((s[STORAGE_KEYS.savedPasswords] || {}) as Record<string, string>) };
  map[key] = password;
  await chrome.storage.local.set({
    [STORAGE_KEYS.savedPasswords]: map,
  });
}

export async function deleteSavedSshPassword(
  host: string,
  port: number | string = 22,
  username = '',
): Promise<void> {
  if (!host.trim()) return;
  const key = getSshCredentialKey(host, port, username);
  const s = await chrome.storage.local.get({
    [STORAGE_KEYS.savedPasswords]: {},
  });
  const map = { ...((s[STORAGE_KEYS.savedPasswords] || {}) as Record<string, string>) };
  if (key in map) {
    delete map[key];
    await chrome.storage.local.set({
      [STORAGE_KEYS.savedPasswords]: map,
    });
  }
}

export async function loadSshBridgeSettings(): Promise<SshBridgeSettings> {
  try {
    const s = await chrome.storage.local.get({
      [STORAGE_KEYS.bridgeUrl]: DEFAULT_SSH_BRIDGE_URL,
      [STORAGE_KEYS.bridgeToken]: '',
    });
    return {
      bridgeUrl:
        normalizeBridgeUrl(String(s[STORAGE_KEYS.bridgeUrl] || '')) || DEFAULT_SSH_BRIDGE_URL,
      bridgeToken: String(s[STORAGE_KEYS.bridgeToken] || ''),
    };
  } catch {
    return { bridgeUrl: DEFAULT_SSH_BRIDGE_URL, bridgeToken: '' };
  }
}

/** Ensure an http(s) scheme so the URL is not fetched relative to the extension origin. */
function normalizeBridgeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function saveSshBridgeSettings(
  partial: Partial<SshBridgeSettings>,
): Promise<void> {
  const payload: Record<string, string> = {};
  if (partial.bridgeUrl !== undefined) {
    payload[STORAGE_KEYS.bridgeUrl] = normalizeBridgeUrl(partial.bridgeUrl);
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
  authMode: SshAuthMode;
}> {
  const s = await chrome.storage.local.get({
    [STORAGE_KEYS.lastHost]: '',
    [STORAGE_KEYS.lastPort]: '22',
    [STORAGE_KEYS.lastUser]: '',
    [STORAGE_KEYS.lastRoot]: '.',
    [STORAGE_KEYS.lastAuthMode]: 'password',
  });
  const storedAuthMode = String(s[STORAGE_KEYS.lastAuthMode] || 'password');
  const authMode: SshAuthMode =
    storedAuthMode === 'key' || storedAuthMode === 'openssh'
      ? storedAuthMode
      : 'password';
  return {
    host: String(s[STORAGE_KEYS.lastHost] || ''),
    port: String(s[STORAGE_KEYS.lastPort] || '22'),
    username: String(s[STORAGE_KEYS.lastUser] || ''),
    root: String(s[STORAGE_KEYS.lastRoot] || '.'),
    authMode,
  };
}

export async function saveSshFormDefaults(form: {
  host: string;
  port: string;
  username: string;
  root: string;
  authMode?: SshAuthMode;
}): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastHost]: form.host,
    [STORAGE_KEYS.lastPort]: form.port,
    [STORAGE_KEYS.lastUser]: form.username,
    [STORAGE_KEYS.lastRoot]: form.root,
    ...(form.authMode ? { [STORAGE_KEYS.lastAuthMode]: form.authMode } : {}),
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

async function probeBridgeAuth(
  bridgeUrl: string,
  token: string,
): Promise<BridgeAuthStatus> {
  if (!token) {
    return 'missing';
  }
  try {
    const res = await fetch(`${bridgeUrl}/auth/check`, {
      method: 'GET',
      headers: {
        'X-Bridge-Token': token,
      },
    });
    if (res.ok) {
      return 'ok';
    }
    if (res.status === 401) {
      return 'unauthorized';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

/**
 * Mask a token for display so users can spot typos without exposing the full secret.
 * Examples: `a1b2…9f0e` (len≥12), `ab…yz` (shorter), `***` (very short).
 */
export function maskBridgeToken(token: string, head = 4, tail = 4): string {
  const t = token.trim();
  if (!t) {
    return '';
  }
  if (t.length <= 4) {
    return '*'.repeat(t.length);
  }
  if (t.length <= head + tail) {
    const h = Math.max(1, Math.floor(t.length / 3));
    const end = Math.max(1, Math.floor(t.length / 3));
    return `${t.slice(0, h)}…${t.slice(-end)}`;
  }
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

/**
 * Process liveness (`/health`, no token) + token validity (`/auth/check`).
 * Online and auth are independent: bridge can be up while token is missing/invalid.
 */
export async function sshHealth(): Promise<SshHealth> {
  const settings = await loadSshBridgeSettings();
  const token = settings.bridgeToken.trim();
  const tokenConfigured = Boolean(token);
  const tokenPreview = tokenConfigured ? maskBridgeToken(token) : undefined;
  try {
    // Send the token when configured: the bridge only reveals session details
    // (SSH user/host, roots) to authenticated callers.
    const res = await fetch(`${settings.bridgeUrl}/health`, {
      headers: token ? { 'X-Bridge-Token': token } : undefined,
    });
    if (!res.ok) {
      return {
        ok: false,
        connected: false,
        meta: null,
        tokenConfigured,
        tokenPreview,
        auth: 'unchecked',
      };
    }
    const data = (await res.json()) as Omit<
      SshHealth,
      'tokenConfigured' | 'auth' | 'tokenPreview'
    >;
    const auth = await probeBridgeAuth(settings.bridgeUrl, token);
    return {
      ok: true,
      connected: Boolean(data.connected),
      meta: data.meta ?? null,
      platform: data.platform,
      wslAvailable: data.wslAvailable,
      wslConnected: data.wslConnected,
      wslMeta: data.wslMeta ?? null,
      tokenConfigured,
      tokenPreview,
      auth,
    };
  } catch {
    return {
      ok: false,
      connected: false,
      meta: null,
      tokenConfigured,
      tokenPreview,
      auth: 'unchecked',
    };
  }
}

export type BridgeStatusLocale = 'zh' | 'en';

/**
 * Shared status line for options UI: process online + token auth + session extras.
 */
export function formatBridgeStatus(
  h: SshHealth,
  locale: BridgeStatusLocale = 'zh',
): { tone: 'online' | 'offline' | 'warn'; html: string } {
  const zh = locale === 'zh';

  if (!h.ok) {
    const offlinePreview =
      h.tokenPreview &&
      ` · Token：<code class="bridge-token-preview">${escapeHtml(h.tokenPreview)}</code>`;
    return {
      tone: 'offline',
      html: zh
        ? `Bridge：<span class="bridge-state">离线</span>（请启动 ssh-bridge）${offlinePreview || (h.tokenConfigured ? '' : ' · Token：未配置')}`
        : `Bridge status: <span class="bridge-state">offline</span> (start ssh-bridge)${offlinePreview || (h.tokenConfigured ? '' : ' · Token: not set')}`,
    };
  }

  const parts: string[] = [];
  parts.push(
    zh
      ? 'Bridge：<span class="bridge-state">在线</span>'
      : 'Bridge status: <span class="bridge-state">online</span>',
  );

  let authWarn = false;
  const preview =
    h.tokenPreview && h.auth !== 'missing'
      ? `<code class="bridge-token-preview" title="${zh ? '已保存 Token 的首尾片段' : 'Saved token head/tail'}">${escapeHtml(
          h.tokenPreview,
        )}</code>`
      : '';

  switch (h.auth) {
    case 'ok':
      parts.push(
        zh
          ? `Token：<span class="bridge-auth ok">已授权</span>${preview ? ` ${preview}` : ''}`
          : `Token: <span class="bridge-auth ok">authorized</span>${preview ? ` ${preview}` : ''}`,
      );
      break;
    case 'missing':
      authWarn = true;
      parts.push(
        zh
          ? 'Token：<span class="bridge-auth bad">未配置</span>'
          : 'Token: <span class="bridge-auth bad">not set</span>',
      );
      break;
    case 'unauthorized':
      authWarn = true;
      parts.push(
        zh
          ? `Token：<span class="bridge-auth bad">无效/未授权</span>${preview ? ` ${preview}` : ''}`
          : `Token: <span class="bridge-auth bad">invalid / unauthorized</span>${preview ? ` ${preview}` : ''}`,
      );
      break;
    case 'error':
      authWarn = true;
      parts.push(
        zh
          ? `Token：<span class="bridge-auth bad">校验失败</span>${preview ? ` ${preview}` : ''}`
          : `Token: <span class="bridge-auth bad">check failed</span>${preview ? ` ${preview}` : ''}`,
      );
      break;
    default:
      parts.push(
        zh
          ? `Token：<span class="bridge-auth">未校验</span>${preview ? ` ${preview}` : ''}`
          : `Token: <span class="bridge-auth">unchecked</span>${preview ? ` ${preview}` : ''}`,
      );
  }

  if (h.wslAvailable) {
    parts.push(zh ? 'WSL 可用' : 'WSL ready');
  } else if (h.platform && h.platform !== 'win32') {
    parts.push(zh ? 'WSL 不可用' : 'WSL n/a (not Windows)');
  }
  // Escape session strings — they come from whatever process answers on the
  // configured bridge URL and are rendered via innerHTML.
  if (h.connected && h.meta) {
    parts.push(`SSH ${escapeHtml(`${h.meta.username}@${h.meta.host}`)}`);
  }
  if (h.wslConnected && h.wslMeta) {
    parts.push(
      zh
        ? `WSL ${escapeHtml(h.wslMeta.distro)}`
        : `WSL ${escapeHtml(`${h.wslMeta.distro}:${h.wslMeta.root}`)}`,
    );
  }

  return {
    tone: authWarn ? 'warn' : 'online',
    html: parts.join(' · '),
  };
}

/** Apply tone classes on a status element (online / offline / warn). */
export function applyBridgeStatusTone(
  el: HTMLElement,
  tone: 'online' | 'offline' | 'warn',
): void {
  el.classList.remove('bridge-online', 'bridge-offline', 'bridge-warn');
  if (tone === 'online') {
    el.classList.add('bridge-online');
  } else if (tone === 'offline') {
    el.classList.add('bridge-offline');
  } else {
    el.classList.add('bridge-online', 'bridge-warn');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sshConnect(params: SshConnectParams): Promise<SshSessionMeta> {
  const body =
    params.authMode === 'openssh'
      ? {
          host: params.host,
          authMode: 'openssh' as const,
          passphrase: params.passphrase,
          root: params.root || '.',
          reuseSession: params.reuseSession,
        }
      : params.authMode === 'password'
        ? {
            host: params.host,
            port: params.port ?? 22,
            username: params.username,
            authMode: 'password' as const,
            password: params.password,
            root: params.root || '.',
            reuseSession: params.reuseSession,
          }
        : {
            host: params.host,
            port: params.port ?? 22,
            username: params.username,
            authMode: 'key' as const,
            privateKey: params.privateKey,
            passphrase: params.passphrase,
            root: params.root || '.',
            reuseSession: params.reuseSession,
          };
  const data = await request<{ ok: boolean; meta: SshSessionMeta }>(
    'POST',
    '/connect',
    body,
  );
  return data.meta;
}

export async function sshListOpenSshHosts(): Promise<string[]> {
  const data = await request<{ hosts: string[] }>('GET', '/ssh/hosts');
  return Array.isArray(data.hosts) ? data.hosts : [];
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
