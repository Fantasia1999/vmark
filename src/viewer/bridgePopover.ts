import { copyText } from '../shared/clipboard';
import {
  DEFAULT_SSH_BRIDGE_URL,
  loadSshBridgeSettings,
  sshHealth,
  type SshBridgeSettings,
  type SshHealth,
} from '../shared/sshClient';

export interface BridgePopoverModel {
  online: boolean;
  statusText: string;
  statusTone: 'online' | 'offline' | 'warn';
  url: string;
  authText: string;
  authTone: 'ok' | 'warn' | 'bad';
  tokenPreview?: string;
  wslText: string;
  sessionText?: string;
  hintKind: 'offline' | 'warn-missing-token' | 'warn-invalid-token' | 'ok';
  hintDescription: string;
  command?: string;
  commandSubnote?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getBridgePopoverModel(
  h: SshHealth,
  settings: Partial<SshBridgeSettings> = {},
): BridgePopoverModel {
  const url = settings.bridgeUrl || DEFAULT_SSH_BRIDGE_URL;

  if (!h.ok) {
    let authText = '未配置';
    let authTone: 'ok' | 'warn' | 'bad' = 'warn';
    if (h.tokenConfigured || h.tokenPreview) {
      authText = '已配置 (离线未校验)';
      authTone = 'warn';
    }
    return {
      online: false,
      statusText: 'Bridge 离线',
      statusTone: 'offline',
      url,
      authText,
      authTone,
      tokenPreview: h.tokenPreview,
      wslText: '—',
      hintKind: 'offline',
      hintDescription:
        '本机 Bridge 服务未运行。如需连接 SSH 远程工作区或读取 WSL 文件，请在终端启动：',
      command: 'npm run ssh-bridge',
      commandSubnote: '首次使用请先执行: npm run ssh-bridge:install',
    };
  }

  let authText = '未校验';
  let authTone: 'ok' | 'warn' | 'bad' = 'warn';
  let hintKind: 'offline' | 'warn-missing-token' | 'warn-invalid-token' | 'ok' = 'ok';
  let hintDescription = '本机 Bridge 服务运行正常，支持 SSH 极速扫描与 WSL 文件访问。';

  switch (h.auth) {
    case 'ok':
      authText = '已授权';
      authTone = 'ok';
      hintKind = 'ok';
      break;
    case 'missing':
      authText = '未配置';
      authTone = 'warn';
      hintKind = 'warn-missing-token';
      hintDescription =
        '当前未配置鉴权 Token。建议在 Bridge 启动终端复制 Token 并在设置中保存，以增强安全性。';
      break;
    case 'unauthorized':
      authText = '无效 / 未授权';
      authTone = 'bad';
      hintKind = 'warn-invalid-token';
      hintDescription =
        'Bridge Token 校验失败。请确认设置中的 Token 是否与终端输出一致。';
      break;
    case 'error':
      authText = '校验失败';
      authTone = 'bad';
      hintKind = 'warn-invalid-token';
      hintDescription = 'Bridge Token 校验发生异常，请检查服务日志。';
      break;
    default:
      authText = '未校验';
      authTone = 'warn';
      hintKind = 'ok';
      hintDescription = '本机 Bridge 服务已连接。';
  }

  let wslText = '未就绪';
  if (h.wslAvailable) {
    wslText = '可用 (wsl.exe)';
  } else if (h.platform && h.platform !== 'win32') {
    wslText = '不可用 (非 Windows)';
  }

  let sessionText: string | undefined;
  if (h.connected && h.meta) {
    sessionText = `SSH (${h.meta.username}@${h.meta.host})`;
  } else if (h.wslConnected && h.wslMeta) {
    sessionText = `WSL (${h.wslMeta.distro})`;
  }

  return {
    online: true,
    statusText: 'Bridge 在线',
    statusTone: authTone === 'bad' ? 'warn' : 'online',
    url,
    authText,
    authTone,
    tokenPreview: h.tokenPreview,
    wslText,
    sessionText,
    hintKind,
    hintDescription,
  };
}

let lastHealth: SshHealth | null = null;
let lastSettings: SshBridgeSettings | null = null;
let isUpdating = false;

export function isBridgePopoverOpen(): boolean {
  const popover = document.getElementById('wb-bridge-popover');
  return Boolean(popover && !popover.hidden);
}

export function closeBridgePopover(): void {
  const popover = document.getElementById('wb-bridge-popover');
  const btn = document.getElementById('wb-bridge-status');
  if (popover) {
    popover.hidden = true;
  }
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

export function openBridgePopover(): void {
  const popover = document.getElementById('wb-bridge-popover');
  const btn = document.getElementById('wb-bridge-status');
  if (popover) {
    popover.hidden = false;
  }
  if (btn) {
    btn.setAttribute('aria-expanded', 'true');
  }
  void updateBridgePopover(true);
}

export function toggleBridgePopover(): void {
  if (isBridgePopoverOpen()) {
    closeBridgePopover();
  } else {
    openBridgePopover();
  }
}

function renderPopoverDom(model: BridgePopoverModel): void {
  const dot = document.getElementById('wb-bp-status-dot');
  const title = document.getElementById('wb-bp-title');
  const url = document.getElementById('wb-bp-url');
  const auth = document.getElementById('wb-bp-auth');
  const wsl = document.getElementById('wb-bp-wsl');
  const sessionRow = document.getElementById('wb-bp-session-row');
  const session = document.getElementById('wb-bp-session');
  const hint = document.getElementById('wb-bp-hint');

  if (dot) {
    dot.className = `wb-status-dot ${model.online ? 'online' : 'offline'}`;
  }
  if (title) {
    title.textContent = model.statusText;
  }
  if (url) {
    url.textContent = model.url;
  }
  if (auth) {
    auth.className = `wb-bp-val ${model.authTone}`;
    if (model.tokenPreview && model.tokenPreview.trim()) {
      auth.innerHTML = `${escapeHtml(model.authText)}<code class="wb-bp-token-preview">${escapeHtml(model.tokenPreview)}</code>`;
    } else {
      auth.textContent = model.authText;
    }
  }
  if (wsl) {
    wsl.textContent = model.wslText;
  }
  if (sessionRow && session) {
    if (model.sessionText) {
      sessionRow.hidden = false;
      session.textContent = model.sessionText;
    } else {
      sessionRow.hidden = true;
    }
  }

  if (hint) {
    if (model.hintKind === 'offline') {
      hint.innerHTML = `
        <div class="wb-bp-notice wb-bp-notice-offline">
          <div class="wb-bp-notice-desc">${escapeHtml(model.hintDescription)}</div>
          <div class="wb-bp-code-line">
            <code>npm run ssh-bridge</code>
            <button type="button" class="wb-bp-copy-btn" id="wb-bp-copy-cmd" title="复制启动命令" aria-label="复制启动命令">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="9" rx="1.25"/>
                <path d="M3.5 10.5V3.75A1.25 1.25 0 0 1 4.75 2.5h6.75"/>
              </svg>
            </button>
          </div>
          <div class="wb-bp-subnote">首次使用请先执行 <code>npm run ssh-bridge:install</code></div>
        </div>
      `;

      const copyBtn = document.getElementById('wb-bp-copy-cmd');
      copyBtn?.addEventListener('click', () => {
        void copyText('npm run ssh-bridge');
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-6.5"/>
          </svg>
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="9" rx="1.25"/>
              <path d="M3.5 10.5V3.75A1.25 1.25 0 0 1 4.75 2.5h6.75"/>
            </svg>
          `;
        }, 1500);
      });
    } else {
      const noticeClass =
        model.hintKind === 'warn-missing-token' || model.hintKind === 'warn-invalid-token'
          ? (model.authTone === 'bad' ? 'wb-bp-notice-bad' : 'wb-bp-notice-warn')
          : 'wb-bp-notice-ok';
      hint.innerHTML = `
        <div class="wb-bp-notice ${noticeClass}">
          <div class="wb-bp-notice-desc">${escapeHtml(model.hintDescription)}</div>
        </div>
      `;
    }
  }
}

export async function updateBridgePopover(probeNetwork = true): Promise<void> {
  const statusEl = document.getElementById('wb-bridge-status');
  const textEl = document.getElementById('wb-bridge-text');
  if (!statusEl || !textEl) {
    return;
  }

  if (probeNetwork || !lastHealth) {
    try {
      const [h, settings] = await Promise.all([
        sshHealth(),
        loadSshBridgeSettings(),
      ]);
      lastHealth = h;
      lastSettings = settings;
    } catch {
      lastHealth = {
        ok: false,
        connected: false,
        meta: null,
        tokenConfigured: false,
        tokenPreview: '',
        auth: 'unchecked',
      };
      lastSettings = { bridgeUrl: DEFAULT_SSH_BRIDGE_URL, bridgeToken: '' };
    }
  }

  const h = lastHealth || {
    ok: false,
    connected: false,
    meta: null,
    tokenConfigured: false,
    tokenPreview: '',
    auth: 'unchecked',
  };
  const settings = lastSettings || {
    bridgeUrl: DEFAULT_SSH_BRIDGE_URL,
    bridgeToken: '',
  };

  const model = getBridgePopoverModel(h, settings);

  if (model.online) {
    statusEl.className = 'wb-bridge-status online';
    textEl.textContent = 'Bridge 在线';
    statusEl.title = `本机 Bridge 在线 (HTTP ${h.auth === 'ok' ? '已鉴权' : '未开启鉴权'}) - 点击查看提示信息`;
  } else {
    statusEl.className = 'wb-bridge-status offline';
    textEl.textContent = 'Bridge 离线';
    statusEl.title = '本机 Bridge 服务未连接 - 点击查看提示信息';
  }

  renderPopoverDom(model);
}

export function initBridgePopover(options: { onOpenOptions: () => void }): void {
  const statusBtn = document.getElementById('wb-bridge-status');
  const refreshBtn = document.getElementById('wb-bp-refresh-btn');
  const openOptionsBtn = document.getElementById('wb-bp-open-options');

  statusBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBridgePopover();
  });

  statusBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleBridgePopover();
    }
  });

  refreshBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isUpdating) {
      return;
    }
    isUpdating = true;
    refreshBtn.classList.add('spinning');
    try {
      await updateBridgePopover(true);
    } finally {
      refreshBtn.classList.remove('spinning');
      isUpdating = false;
    }
  });

  openOptionsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeBridgePopover();
    options.onOpenOptions();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!isBridgePopoverOpen()) {
      return;
    }
    const target = e.target as Node | null;
    const wrap = document.querySelector('.wb-bridge-wrap');
    if (wrap && target && !wrap.contains(target)) {
      closeBridgePopover();
    }
  });

  // Initial status probe
  void updateBridgePopover(true);
}
