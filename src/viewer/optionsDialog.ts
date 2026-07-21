/**
 * In-page settings dialog for the Markdown workbench (viewer).
 * Same fields as options.html; saves to chrome.storage so open previews refresh live.
 */

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type MermaidThemeSetting,
  type PreviewSettings,
  type PreviewWidthSetting,
  type ThemeMode,
} from '../preview/config';
import {
  DEFAULT_SSH_BRIDGE_URL,
  loadSshBridgeSettings,
  saveSshBridgeSettings,
  sshHealth,
} from '../shared/sshClient';

export const OPTIONS_DIALOG_ID = 'options-dialog';

const CHECKBOX_IDS = [
  'opt-autoPreview',
  'opt-breaks',
  'opt-linkify',
  'opt-typographer',
  'opt-sanitizeHtml',
  'opt-mathEnabled',
  'opt-mermaidEnabled',
] as const;

const SETTING_BY_CHECKBOX: Record<(typeof CHECKBOX_IDS)[number], keyof PreviewSettings> = {
  'opt-autoPreview': 'autoPreview',
  'opt-breaks': 'breaks',
  'opt-linkify': 'linkify',
  'opt-typographer': 'typographer',
  'opt-sanitizeHtml': 'sanitizeHtml',
  'opt-mathEnabled': 'mathEnabled',
  'opt-mermaidEnabled': 'mermaidEnabled',
};

let wired = false;
let bridgeTimer: ReturnType<typeof setInterval> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing #${id}`);
  }
  return el;
}

function setStatus(msg: string): void {
  const el = document.getElementById('opt-status');
  if (!el) {
    return;
  }
  el.textContent = msg;
  if (statusTimer) {
    clearTimeout(statusTimer);
  }
  if (msg) {
    statusTimer = setTimeout(() => {
      el.textContent = '';
    }, 2200);
  }
}

async function refreshBridgeStatus(): Promise<void> {
  const el = document.getElementById('opt-bridge-status');
  if (!el) {
    return;
  }
  const h = await sshHealth();
  if (!h.ok) {
    el.classList.remove('bridge-online');
    el.classList.add('bridge-offline');
    el.innerHTML =
      'Bridge：<span class="bridge-state">离线</span>（请启动 ssh-bridge）';
    return;
  }
  const extras: string[] = [];
  if (h.wslAvailable) {
    extras.push('WSL 可用');
  } else if (h.platform && h.platform !== 'win32') {
    extras.push('WSL 不可用');
  }
  if (h.connected && h.meta) {
    extras.push(`SSH ${h.meta.username}@${h.meta.host}`);
  }
  if (h.wslConnected && h.wslMeta) {
    extras.push(`WSL ${h.wslMeta.distro}`);
  }
  el.classList.remove('bridge-offline');
  el.classList.add('bridge-online');
  const suffix = extras.length ? ` · ${extras.join(' · ')}` : '';
  el.innerHTML = `Bridge：<span class="bridge-state">在线</span>${suffix}`;
}

async function readFormSettings(): Promise<PreviewSettings> {
  const next: PreviewSettings = { ...DEFAULT_SETTINGS };
  for (const id of CHECKBOX_IDS) {
    const key = SETTING_BY_CHECKBOX[id];
    next[key] = ($(id) as HTMLInputElement).checked as never;
  }
  next.theme = ($('opt-theme') as HTMLSelectElement).value as ThemeMode;
  next.previewWidth = ($('opt-previewWidth') as HTMLSelectElement)
    .value as PreviewWidthSetting;
  next.mermaidTheme = ($('opt-mermaidTheme') as HTMLSelectElement)
    .value as MermaidThemeSetting;
  return next;
}

async function persistSettings(): Promise<void> {
  const next = await readFormSettings();
  await saveSettings(next);
  setStatus('已保存');
}

async function persistBridge(): Promise<void> {
  const url = ($('opt-sshBridgeUrl') as HTMLInputElement).value.trim() || DEFAULT_SSH_BRIDGE_URL;
  const token = ($('opt-sshBridgeToken') as HTMLInputElement).value.trim();
  await saveSshBridgeSettings({ bridgeUrl: url, bridgeToken: token });
  setStatus('Bridge 设置已保存');
  void refreshBridgeStatus();
}

async function fillForm(): Promise<void> {
  const settings = await loadSettings();
  for (const id of CHECKBOX_IDS) {
    const key = SETTING_BY_CHECKBOX[id];
    ($(id) as HTMLInputElement).checked = Boolean(settings[key]);
  }
  ($('opt-theme') as HTMLSelectElement).value = settings.theme;
  ($('opt-previewWidth') as HTMLSelectElement).value = settings.previewWidth ?? 'wide';
  ($('opt-mermaidTheme') as HTMLSelectElement).value = settings.mermaidTheme ?? 'vscode';

  const bridge = await loadSshBridgeSettings();
  ($('opt-sshBridgeUrl') as HTMLInputElement).value = bridge.bridgeUrl || DEFAULT_SSH_BRIDGE_URL;
  ($('opt-sshBridgeToken') as HTMLInputElement).value = bridge.bridgeToken || '';
  void refreshBridgeStatus();
}

function wireOnce(): void {
  if (wired) {
    return;
  }
  wired = true;

  for (const id of CHECKBOX_IDS) {
    $(id).addEventListener('change', () => void persistSettings());
  }
  $('opt-theme').addEventListener('change', () => void persistSettings());
  $('opt-previewWidth').addEventListener('change', () => void persistSettings());
  $('opt-mermaidTheme').addEventListener('change', () => void persistSettings());
  $('opt-sshBridgeUrl').addEventListener('change', () => void persistBridge());
  $('opt-sshBridgeToken').addEventListener('change', () => void persistBridge());

  document.getElementById('opt-close')?.addEventListener('click', () => showOptionsDialog(false));
  document
    .querySelector('[data-options-dismiss]')
    ?.addEventListener('click', () => showOptionsDialog(false));
  document.getElementById('opt-open-full')?.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
}

export function isOptionsDialogOpen(): boolean {
  const dlg = document.getElementById(OPTIONS_DIALOG_ID);
  return Boolean(dlg && !dlg.hidden);
}

export function showOptionsDialog(show: boolean): void {
  const dlg = document.getElementById(OPTIONS_DIALOG_ID);
  if (!dlg) {
    return;
  }
  wireOnce();
  dlg.hidden = !show;

  if (show) {
    void fillForm();
    if (!bridgeTimer) {
      bridgeTimer = setInterval(() => {
        if (isOptionsDialogOpen()) {
          void refreshBridgeStatus();
        }
      }, 5000);
    }
    requestAnimationFrame(() => {
      const first = dlg.querySelector<HTMLElement>(
        'input, select, button:not([data-options-dismiss])',
      );
      first?.focus({ preventScroll: true });
    });
  } else if (bridgeTimer) {
    clearInterval(bridgeTimer);
    bridgeTimer = null;
  }
}
