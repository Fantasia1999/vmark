/**
 * Shared SSH connect-form UI helpers used by popup and viewer.
 * Keeps auth-mode visibility, OpenSSH host loading, and connect-param
 * assembly in one place so the two surfaces cannot drift.
 */

import {
  loadSavedSshPassword,
  sshListOpenSshHosts,
  type SshAuthMode,
  type SshConnectParams,
} from './sshClient';

export type { SshAuthMode };

export interface SshFormElements {
  host: HTMLInputElement | null;
  hostSelect: HTMLSelectElement | null;
  port: HTMLInputElement | null;
  username: HTMLInputElement | null;
  root: HTMLInputElement | null;
  auth: HTMLSelectElement | null;
  password: HTMLInputElement | null;
  passphrase: HTMLInputElement | null;
  rememberPassword: HTMLInputElement | null;
  passwordRow: HTMLElement | null;
  keyRow: HTMLElement | null;
  passphraseRow: HTMLElement | null;
  rememberPasswordRow: HTMLElement | null;
  openSshHint: HTMLElement | null;
  /** Port + username row; hidden in OpenSSH mode (resolved by Bridge). */
  manualEndpointFields: HTMLElement | null;
}

export interface SshFormFillValues {
  host?: string;
  port?: string | number;
  username?: string;
  root?: string;
  authMode?: SshAuthMode;
  password?: string;
  rememberPassword?: boolean;
}

export type SshFormReadResult =
  | {
      ok: true;
      params: SshConnectParams;
      rememberPassword: boolean;
      defaults: {
        host: string;
        port: string;
        username: string;
        root: string;
        authMode: SshAuthMode;
      };
    }
  | { ok: false; error: string };

export function querySshForm(root: ParentNode = document): SshFormElements {
  return {
    host: root.querySelector('#ssh-host'),
    hostSelect: root.querySelector('#ssh-host-select'),
    port: root.querySelector('#ssh-port'),
    username: root.querySelector('#ssh-user'),
    root: root.querySelector('#ssh-root'),
    auth: root.querySelector('#ssh-auth'),
    password: root.querySelector('#ssh-password'),
    passphrase: root.querySelector('#ssh-passphrase'),
    rememberPassword: root.querySelector('#ssh-remember-password'),
    passwordRow: root.querySelector('#ssh-password-row'),
    keyRow: root.querySelector('#ssh-key-row'),
    passphraseRow: root.querySelector('#ssh-passphrase-row'),
    rememberPasswordRow: root.querySelector('#ssh-remember-password-row'),
    openSshHint: root.querySelector('#ssh-openssh-hint'),
    manualEndpointFields: root.querySelector('#ssh-manual-endpoint-fields'),
  };
}

export function parseSshAuthMode(value: string | null | undefined): SshAuthMode {
  if (value === 'key' || value === 'openssh') {
    return value;
  }
  return 'password';
}

/**
 * Toggle password / key / OpenSSH fields. Host list loads lazily on first
 * OpenSSH mode entry (or when the select cache was cleared).
 */
export function setSshAuthMode(
  els: SshFormElements,
  mode: SshAuthMode,
  loadHosts: () => void | Promise<void>,
): void {
  if (els.passwordRow) {
    els.passwordRow.hidden = mode !== 'password';
  }
  if (els.rememberPasswordRow) {
    els.rememberPasswordRow.hidden = mode !== 'password';
  }
  if (els.keyRow) {
    els.keyRow.hidden = mode !== 'key';
  }
  if (els.passphraseRow) {
    els.passphraseRow.hidden = mode === 'password';
  }
  if (els.openSshHint) {
    els.openSshHint.hidden = mode !== 'openssh';
  }
  if (els.host) {
    els.host.hidden = mode === 'openssh';
  }
  if (els.hostSelect) {
    els.hostSelect.hidden = mode !== 'openssh';
  }
  if (els.manualEndpointFields) {
    els.manualEndpointFields.hidden = mode === 'openssh';
  }
  if (mode === 'openssh' && els.hostSelect?.dataset.loaded !== 'true') {
    void loadHosts();
  }
}

export function clearSshHostSelectCache(els: SshFormElements): void {
  if (els.hostSelect) {
    delete els.hostSelect.dataset.loaded;
  }
}

export function fillSshForm(
  els: SshFormElements,
  values: SshFormFillValues,
  loadHosts: () => void | Promise<void>,
): void {
  if (values.host !== undefined && els.host) {
    els.host.value = values.host;
  }
  if (values.port !== undefined && els.port) {
    els.port.value = String(values.port);
  }
  if (values.username !== undefined && els.username) {
    els.username.value = values.username;
  }
  if (values.root !== undefined && els.root) {
    els.root.value = values.root;
  }
  if (values.password !== undefined && els.password) {
    els.password.value = values.password;
  }
  if (values.rememberPassword !== undefined && els.rememberPassword) {
    els.rememberPassword.checked = values.rememberPassword;
  }
  if (values.authMode !== undefined) {
    if (els.auth) {
      els.auth.value = values.authMode;
    }
    setSshAuthMode(els, values.authMode, loadHosts);
  }
  if (
    values.host !== undefined &&
    els.hostSelect?.dataset.loaded === 'true' &&
    els.hostSelect.querySelector(`option[value="${CSS.escape(values.host)}"]`)
  ) {
    els.hostSelect.value = values.host;
  }
}

export function syncHostInputFromSelect(els: SshFormElements): void {
  if (els.host && els.hostSelect) {
    els.host.value = els.hostSelect.value;
  }
}

/**
 * In-flight host-list loads are coalesced so popup/viewer can call load freely.
 */
export function createOpenSshHostLoader(options?: {
  listHosts?: () => Promise<string[]>;
  /** When true after a successful load, keep the select disabled (e.g. dialog busy). */
  isSelectBusy?: () => boolean;
}): {
  load: (els: SshFormElements) => Promise<void>;
} {
  const listHosts = options?.listHosts ?? sshListOpenSshHosts;
  let inFlight: Promise<void> | null = null;

  return {
    async load(els: SshFormElements): Promise<void> {
      if (inFlight) {
        return inFlight;
      }
      inFlight = (async () => {
        const select = els.hostSelect;
        if (!select) {
          return;
        }
        select.disabled = true;
        select.replaceChildren(new Option('正在读取 OpenSSH 配置…', ''));
        try {
          const hosts = [...new Set(await listHosts())];
          const preferred = els.host?.value.trim() || '';
          select.replaceChildren();
          if (hosts.length === 0) {
            select.append(new Option('未在 ~/.ssh/config 中找到 Host', ''));
            select.disabled = true;
          } else {
            for (const alias of hosts) {
              select.append(new Option(alias, alias));
            }
            select.value =
              preferred && hosts.includes(preferred) ? preferred : hosts[0];
            select.disabled = options?.isSelectBusy?.() ?? false;
            if (els.host) {
              els.host.value = select.value;
            }
          }
          select.dataset.loaded = 'true';
        } catch (error) {
          select.replaceChildren(
            new Option(
              error instanceof Error
                ? `读取失败：${error.message}`
                : '读取 OpenSSH 配置失败',
              '',
            ),
          );
          select.disabled = true;
          delete select.dataset.loaded;
        }
      })();
      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}

/** Read + validate the form into bridge connect params (secrets included). */
export function readSshConnectForm(
  els: SshFormElements,
  privateKeyText: string,
): SshFormReadResult {
  const auth = parseSshAuthMode(els.auth?.value);
  const typedHost = (els.host?.value || '').trim();
  const selectedOpenSshHost = (els.hostSelect?.value || '').trim();
  const host = auth === 'openssh' ? selectedOpenSshHost : typedHost;
  const port = Number(els.port?.value) || 22;
  const username = (els.username?.value || '').trim();
  const root = (els.root?.value || '').trim() || '.';
  const password = els.password?.value || '';
  const passphrase = els.passphrase?.value || '';
  const rememberPassword = Boolean(els.rememberPassword?.checked);

  if (!host || (auth !== 'openssh' && !username)) {
    return {
      ok: false,
      error:
        auth === 'openssh' ? '请填写 OpenSSH Host 别名' : '请填写主机和用户名',
    };
  }
  if (auth === 'password' && !password) {
    return { ok: false, error: '请填写密码' };
  }
  if (auth === 'key' && !privateKeyText.trim()) {
    return { ok: false, error: '请选择私钥文件' };
  }

  const params: SshConnectParams =
    auth === 'openssh'
      ? {
          host,
          authMode: 'openssh',
          root,
          passphrase: passphrase || undefined,
        }
      : auth === 'password'
        ? {
            host,
            port,
            username,
            authMode: 'password',
            root,
            password,
          }
        : {
            host,
            port,
            username,
            authMode: 'key',
            root,
            privateKey: privateKeyText,
            passphrase: passphrase || undefined,
          };

  return {
    ok: true,
    params,
    rememberPassword,
    defaults: {
      host,
      port: String(port),
      username: auth === 'openssh' ? '' : username,
      root,
      authMode: auth,
    },
  };
}

export async function autoFillSavedPasswordIfRemembered(
  els: SshFormElements,
): Promise<void> {
  if (parseSshAuthMode(els.auth?.value) !== 'password') return;
  if (!els.rememberPassword?.checked) return;
  const host = (els.host?.value || '').trim();
  const port = Number(els.port?.value) || 22;
  const username = (els.username?.value || '').trim();
  if (host) {
    const saved = await loadSavedSshPassword(host, port, username);
    if (saved !== undefined && els.password) {
      els.password.value = saved;
    }
  }
}

export function wireSshFormAutoFill(
  els: SshFormElements,
  onFilled?: () => void,
): void {
  const trigger = () => {
    void (async () => {
      await autoFillSavedPasswordIfRemembered(els);
      onFilled?.();
    })();
  };
  els.host?.addEventListener('change', trigger);
  els.host?.addEventListener('blur', trigger);
  els.port?.addEventListener('change', trigger);
  els.port?.addEventListener('blur', trigger);
  els.username?.addEventListener('change', trigger);
  els.username?.addEventListener('blur', trigger);
  els.auth?.addEventListener('change', trigger);
  els.rememberPassword?.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) {
      trigger();
    }
  });
}
