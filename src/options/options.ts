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

const ids = [
  'autoPreview',
  'breaks',
  'linkify',
  'typographer',
  'sanitizeHtml',
  'mathEnabled',
  'mermaidEnabled',
] as const;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing #${id}`);
  }
  return el;
}

async function refreshBridgeStatus(): Promise<void> {
  const el = document.getElementById('sshBridgeStatus');
  if (!el) {
    return;
  }
  const h = await sshHealth();
  if (!h.ok) {
    el.textContent = 'Bridge status: offline (start ssh-bridge)';
    return;
  }
  const bits = ['online'];
  if (h.wslAvailable) {
    bits.push('WSL ready');
  } else if (h.platform && h.platform !== 'win32') {
    bits.push('WSL n/a (not Windows)');
  }
  if (h.connected && h.meta) {
    bits.push(`SSH ${h.meta.username}@${h.meta.host}`);
  }
  if (h.wslConnected && h.wslMeta) {
    bits.push(`WSL ${h.wslMeta.distro}:${h.wslMeta.root}`);
  }
  el.textContent = `Bridge status: ${bits.join(' · ')}`;
}

async function init(): Promise<void> {
  const settings = await loadSettings();

  for (const id of ids) {
    const input = $(id) as HTMLInputElement;
    input.checked = Boolean(settings[id]);
    input.addEventListener('change', () => void persist());
  }

  const theme = $('theme') as HTMLSelectElement;
  theme.value = settings.theme;
  theme.addEventListener('change', () => void persist());

  const previewWidth = $('previewWidth') as HTMLSelectElement;
  previewWidth.value = settings.previewWidth ?? 'wide';
  previewWidth.addEventListener('change', () => void persist());

  const mermaidTheme = $('mermaidTheme') as HTMLSelectElement;
  mermaidTheme.value = settings.mermaidTheme ?? 'vscode';
  mermaidTheme.addEventListener('change', () => void persist());

  const bridge = await loadSshBridgeSettings();
  const bridgeUrl = $('sshBridgeUrl') as HTMLInputElement;
  const bridgeToken = $('sshBridgeToken') as HTMLInputElement;
  bridgeUrl.value = bridge.bridgeUrl || DEFAULT_SSH_BRIDGE_URL;
  bridgeToken.value = bridge.bridgeToken || '';
  bridgeUrl.addEventListener('change', () => void persistBridge());
  bridgeToken.addEventListener('change', () => void persistBridge());

  void refreshBridgeStatus();
  setInterval(() => void refreshBridgeStatus(), 5000);

  async function persist(): Promise<void> {
    const next: PreviewSettings = {
      ...DEFAULT_SETTINGS,
      autoPreview: ($('autoPreview') as HTMLInputElement).checked,
      breaks: ($('breaks') as HTMLInputElement).checked,
      linkify: ($('linkify') as HTMLInputElement).checked,
      typographer: ($('typographer') as HTMLInputElement).checked,
      sanitizeHtml: ($('sanitizeHtml') as HTMLInputElement).checked,
      mathEnabled: ($('mathEnabled') as HTMLInputElement).checked,
      mermaidEnabled: ($('mermaidEnabled') as HTMLInputElement).checked,
      theme: theme.value as ThemeMode,
      mermaidTheme: mermaidTheme.value as MermaidThemeSetting,
      previewWidth: previewWidth.value as PreviewWidthSetting,
    };
    await saveSettings(next);
    const status = $('status');
    status.textContent = 'Saved. Reload open preview tabs to apply layout/theme changes.';
    setTimeout(() => {
      status.textContent = '';
    }, 2500);
  }

  async function persistBridge(): Promise<void> {
    await saveSshBridgeSettings({
      bridgeUrl: bridgeUrl.value.trim() || DEFAULT_SSH_BRIDGE_URL,
      bridgeToken: bridgeToken.value.trim(),
    });
    const status = $('status');
    status.textContent = 'SSH Bridge settings saved.';
    void refreshBridgeStatus();
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  }
}

void init();
