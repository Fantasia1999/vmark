/**
 * Extension action popup: open workbench, or configure local/SSH/WSL inline
 * before opening the viewer tab (no blank page first).
 */

import { iconHtml, type IconName } from '../shared/icons';
import {
  isPreviewableFileName,
  PREVIEW_ACCEPT,
  readFileAsLocalDoc,
  saveLocalDoc,
} from '../shared/localDoc';
import {
  loadSshFormDefaults,
  saveSshFormDefaults,
  sshConnect,
  sshHealth,
} from '../shared/sshClient';
import {
  loadWslFormDefaults,
  saveWslFormDefaults,
  wslConnect,
  wslListDistros,
} from '../shared/wslClient';
import { isPreviewablePath, parseWslLocation, wslParentDir } from '../shared/wslPaths';
import {
  isDirectoryPickerSupported,
  pickWorkspaceDirectory,
} from '../shared/workspaceFs';
import { setPendingEnter, type PendingWorkbenchEnter } from '../shared/pendingEnter';

export {};

type PanelId = 'main' | 'ssh' | 'wsl';

// Fill data-icon slots with SVG
for (const el of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  const name = el.dataset.icon as IconName | undefined;
  if (name) {
    el.innerHTML = iconHtml(name);
  }
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`#${id} missing`);
  }
  return el;
}

function showPanel(id: PanelId): void {
  for (const p of ['main', 'ssh', 'wsl'] as const) {
    const el = document.getElementById(`panel-${p}`);
    if (el) {
      el.hidden = p !== id;
    }
  }
  if (id === 'main') {
    hideError('main-error');
  }
}

function showError(id: string, msg: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.hidden = false;
    el.textContent = msg;
  }
}

function hideError(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
}

function openViewer(query = ''): void {
  const url = chrome.runtime.getURL(`viewer/viewer.html${query}`);
  void chrome.tabs.create({ url });
  window.close();
}

async function openViewerAfterEnter(payload: PendingWorkbenchEnter): Promise<void> {
  await setPendingEnter(payload);
  openViewer('?enter=1');
}

// ——— Main ———

document.getElementById('openWorkbench')?.addEventListener('click', () => {
  openViewer('');
});

document.getElementById('openWorkspace')?.addEventListener('click', () => {
  void (async () => {
    hideError('main-error');
    if (!isDirectoryPickerSupported()) {
      showError('main-error', '当前浏览器不支持打开文件夹（需要 Chromium File System Access API）');
      return;
    }
    try {
      await pickWorkspaceDirectory();
      await openViewerAfterEnter({ kind: 'local' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      showError('main-error', e instanceof Error ? e.message : String(e));
    }
  })();
});

document.getElementById('openLocal')?.addEventListener('click', () => {
  void (async () => {
    hideError('main-error');
    try {
      if (typeof window.showOpenFilePicker === 'function') {
        const [handle] = await window.showOpenFilePicker({
          id: 'vscode-md-preview-file',
          multiple: false,
          types: [
            {
              description: 'Markdown / SVG',
              accept: {
                'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
                'text/plain': ['.txt'],
                'image/svg+xml': ['.svg'],
              },
            },
          ],
        });
        const file = await handle.getFile();
        if (!isPreviewableFileName(file.name)) {
          showError('main-error', `不支持的文件类型: ${file.name}`);
          return;
        }
        const doc = await readFileAsLocalDoc(file);
        await saveLocalDoc(doc);
        await openViewerAfterEnter({ kind: 'doc' });
        return;
      }

      // Fallback: hidden <input type=file>
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = PREVIEW_ACCEPT;
      input.style.display = 'none';
      document.body.appendChild(input);
      const file = await new Promise<File | null>((resolve) => {
        input.addEventListener(
          'change',
          () => {
            resolve(input.files?.[0] ?? null);
            input.remove();
          },
          { once: true },
        );
        input.click();
      });
      if (!file) {
        return;
      }
      if (!isPreviewableFileName(file.name)) {
        showError('main-error', `不支持的文件类型: ${file.name}`);
        return;
      }
      const doc = await readFileAsLocalDoc(file);
      await saveLocalDoc(doc);
      await openViewerAfterEnter({ kind: 'doc' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      showError('main-error', e instanceof Error ? e.message : String(e));
    }
  })();
});

document.getElementById('openSsh')?.addEventListener('click', () => {
  void showSshPanel();
});

document.getElementById('openWsl')?.addEventListener('click', () => {
  void showWslPanel();
});

document.getElementById('togglePreview')?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'togglePreview' }).finally(() => window.close());
});

document.getElementById('openOptions')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

for (const btn of document.querySelectorAll('[data-back]')) {
  btn.addEventListener('click', () => showPanel('main'));
}

// ——— SSH ———

let sshPrivateKeyText = '';

function setSshAuthMode(mode: 'password' | 'key'): void {
  const pw = document.getElementById('ssh-password-row');
  const key = document.getElementById('ssh-key-row');
  if (pw) {
    pw.hidden = mode !== 'password';
  }
  if (key) {
    key.hidden = mode !== 'key';
  }
}

async function showSshPanel(): Promise<void> {
  hideError('ssh-error');
  const defaults = await loadSshFormDefaults();
  (document.getElementById('ssh-host') as HTMLInputElement).value = defaults.host;
  (document.getElementById('ssh-port') as HTMLInputElement).value = defaults.port;
  (document.getElementById('ssh-user') as HTMLInputElement).value = defaults.username;
  (document.getElementById('ssh-root') as HTMLInputElement).value = defaults.root || '.';
  (document.getElementById('ssh-password') as HTMLInputElement).value = '';
  (document.getElementById('ssh-passphrase') as HTMLInputElement).value = '';
  sshPrivateKeyText = '';
  const keyFile = document.getElementById('ssh-key-file') as HTMLInputElement | null;
  if (keyFile) {
    keyFile.value = '';
  }
  setSshAuthMode('password');
  (document.getElementById('ssh-auth') as HTMLSelectElement).value = 'password';
  showPanel('ssh');
}

document.getElementById('ssh-auth')?.addEventListener('change', (e) => {
  setSshAuthMode((e.target as HTMLSelectElement).value as 'password' | 'key');
});

document.getElementById('ssh-key-file')?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) {
    sshPrivateKeyText = '';
    return;
  }
  sshPrivateKeyText = await file.text();
});

document.getElementById('ssh-connect')?.addEventListener('click', () => {
  void (async () => {
    hideError('ssh-error');
    const host = (document.getElementById('ssh-host') as HTMLInputElement).value.trim();
    const port = Number((document.getElementById('ssh-port') as HTMLInputElement).value) || 22;
    const username = (document.getElementById('ssh-user') as HTMLInputElement).value.trim();
    const root = (document.getElementById('ssh-root') as HTMLInputElement).value.trim() || '.';
    const auth = (document.getElementById('ssh-auth') as HTMLSelectElement).value as
      | 'password'
      | 'key';
    const password = (document.getElementById('ssh-password') as HTMLInputElement).value;
    const passphrase = (document.getElementById('ssh-passphrase') as HTMLInputElement).value;

    if (!host || !username) {
      showError('ssh-error', '请填写主机和用户名');
      return;
    }
    if (auth === 'password' && !password) {
      showError('ssh-error', '请填写密码');
      return;
    }
    if (auth === 'key' && !sshPrivateKeyText.trim()) {
      showError('ssh-error', '请选择私钥文件');
      return;
    }

    const health = await sshHealth();
    if (!health.ok) {
      showError('ssh-error', '本地 Bridge 未运行。请执行: npm run ssh-bridge');
      return;
    }

    const btn = document.getElementById('ssh-connect') as HTMLButtonElement;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '连接中…';
    try {
      await sshConnect({
        host,
        port,
        username,
        root,
        password: auth === 'password' ? password : undefined,
        privateKey: auth === 'key' ? sshPrivateKeyText : undefined,
        passphrase: auth === 'key' && passphrase ? passphrase : undefined,
      });
      await saveSshFormDefaults({
        host,
        port: String(port),
        username,
        root,
      });
      await openViewerAfterEnter({ kind: 'ssh' });
    } catch (e) {
      showError('ssh-error', e instanceof Error ? e.message : String(e));
    } finally {
      btn.disabled = false;
      btn.textContent = prev || '连接';
    }
  })();
});

// ——— WSL ———

type WslMode = 'select' | 'paste';

function setWslMode(mode: WslMode): void {
  const selectTab = document.getElementById('wsl-tab-select');
  const pasteTab = document.getElementById('wsl-tab-paste');
  const selectPanel = document.getElementById('wsl-panel-select');
  const pastePanel = document.getElementById('wsl-panel-paste');
  selectTab?.classList.toggle('active', mode === 'select');
  pasteTab?.classList.toggle('active', mode === 'paste');
  selectTab?.setAttribute('aria-selected', mode === 'select' ? 'true' : 'false');
  pasteTab?.setAttribute('aria-selected', mode === 'paste' ? 'true' : 'false');
  if (selectPanel) {
    selectPanel.hidden = mode !== 'select';
  }
  if (pastePanel) {
    pastePanel.hidden = mode !== 'paste';
  }
}

function parseWslPaste(pathPaste: string):
  | { distro: string; root: string; openAbsFile?: string }
  | { error: string } {
  const loc = parseWslLocation(pathPaste);
  if (loc) {
    if (isPreviewablePath(loc.linuxPath)) {
      return {
        distro: loc.distro,
        root: wslParentDir(loc.linuxPath),
        openAbsFile: loc.linuxPath,
      };
    }
    return { distro: loc.distro, root: loc.linuxPath };
  }
  if (pathPaste.startsWith('/')) {
    return {
      error: '粘贴 Linux 绝对路径时请使用完整形式，例如 wsl://发行版' + pathPaste,
    };
  }
  return {
    error: '无法解析路径。请使用 \\\\wsl.localhost\\Distro\\path 或 wsl://Distro/path',
  };
}

async function showWslPanel(): Promise<void> {
  hideError('wsl-error');
  setWslMode('select');
  const defaults = await loadWslFormDefaults();
  (document.getElementById('wsl-root') as HTMLInputElement).value = defaults.root || '~';
  (document.getElementById('wsl-path') as HTMLInputElement).value = '';

  const sel = document.getElementById('wsl-distro') as HTMLSelectElement;
  sel.innerHTML = '<option value="">加载中…</option>';
  showPanel('wsl');

  const health = await sshHealth();
  if (!health.ok) {
    sel.innerHTML = '<option value="">—</option>';
    showError('wsl-error', '本地 Bridge 未运行。请执行: npm run ssh-bridge（需在 Windows 上）');
    return;
  }
  if (health.wslAvailable === false) {
    sel.innerHTML = '<option value="">—</option>';
    showError('wsl-error', '当前 Bridge 不在 Windows 上，无法调用 wsl.exe');
    return;
  }

  try {
    const distros = await wslListDistros();
    sel.innerHTML = '';
    if (!distros.length) {
      sel.innerHTML = '<option value="">未找到发行版</option>';
      showError('wsl-error', '未检测到 WSL 发行版（wsl -l -q 为空）');
      return;
    }
    for (const d of distros) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    }
    if (defaults.distro && distros.includes(defaults.distro)) {
      sel.value = defaults.distro;
    }
  } catch (e) {
    sel.innerHTML = '<option value="">—</option>';
    showError('wsl-error', e instanceof Error ? e.message : String(e));
  }
}

document.getElementById('wsl-tab-select')?.addEventListener('click', () => setWslMode('select'));
document.getElementById('wsl-tab-paste')?.addEventListener('click', () => setWslMode('paste'));

document.getElementById('wsl-connect')?.addEventListener('click', () => {
  void (async () => {
    hideError('wsl-error');
    const pastePanel = document.getElementById('wsl-panel-paste');
    const isPaste = pastePanel && !pastePanel.hidden;

    let distro = '';
    let root = '~';
    let preferredPath: string | undefined;

    if (isPaste) {
      const pathPaste = (document.getElementById('wsl-path') as HTMLInputElement).value.trim();
      if (!pathPaste) {
        showError('wsl-error', '请粘贴完整 WSL 路径或 URI');
        return;
      }
      const parsed = parseWslPaste(pathPaste);
      if ('error' in parsed) {
        showError('wsl-error', parsed.error);
        return;
      }
      distro = parsed.distro;
      root = parsed.root;
      preferredPath = parsed.openAbsFile;
    } else {
      distro = (document.getElementById('wsl-distro') as HTMLSelectElement).value.trim();
      root = (document.getElementById('wsl-root') as HTMLInputElement).value.trim() || '~';
      if (!distro) {
        showError('wsl-error', '请选择 WSL 发行版');
        return;
      }
    }

    const health = await sshHealth();
    if (!health.ok) {
      showError('wsl-error', '本地 Bridge 未运行。请执行: npm run ssh-bridge（需在 Windows 上）');
      return;
    }
    if (health.wslAvailable === false) {
      showError('wsl-error', '当前 Bridge 不在 Windows 上，无法调用 wsl.exe');
      return;
    }

    const btn = document.getElementById('wsl-connect') as HTMLButtonElement;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '连接中…';
    try {
      const meta = await wslConnect(distro, root);
      await saveWslFormDefaults({ distro, root: meta.root });

      // If paste pointed at a file, map absolute path → relative under root
      let rel: string | undefined;
      if (preferredPath) {
        const prefix = meta.root.replace(/\/+$/, '');
        if (preferredPath === prefix) {
          rel = undefined;
        } else if (preferredPath.startsWith(prefix + '/')) {
          rel = preferredPath.slice(prefix.length + 1);
        } else {
          rel = preferredPath.replace(/^\/+/, '');
        }
      }

      await openViewerAfterEnter({ kind: 'wsl', preferredPath: rel });
    } catch (e) {
      showError('wsl-error', e instanceof Error ? e.message : String(e));
    } finally {
      btn.disabled = false;
      btn.textContent = prev || '连接';
    }
  })();
});
