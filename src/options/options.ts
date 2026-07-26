import {
  loadSettings,
  saveSettings,
  type MermaidThemeSetting,
  type PreviewSettings,
  type PreviewWidthSetting,
  type ThemeMode,
} from '../preview/config';
import {
  applyBridgeStatusTone,
  DEFAULT_SSH_BRIDGE_URL,
  formatBridgeStatus,
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
  const { tone, html } = formatBridgeStatus(h, 'en');
  applyBridgeStatusTone(el, tone);
  el.innerHTML = html;
}

async function init(): Promise<void> {
  const theme = $('theme') as HTMLSelectElement;
  const previewWidth = $('previewWidth') as HTMLSelectElement;
  const mermaidTheme = $('mermaidTheme') as HTMLSelectElement;

  async function fillForm(): Promise<void> {
    const settings = await loadSettings();
    for (const id of ids) {
      ($(id) as HTMLInputElement).checked = Boolean(settings[id]);
    }
    theme.value = settings.theme;
    previewWidth.value = settings.previewWidth ?? 'wide';
    mermaidTheme.value = settings.mermaidTheme ?? 'vscode';
  }

  await fillForm();

  for (const id of ids) {
    const input = $(id) as HTMLInputElement;
    input.addEventListener('change', () => void persist({ [id]: input.checked }));
  }
  theme.addEventListener('change', () =>
    void persist({ theme: theme.value as ThemeMode }),
  );
  previewWidth.addEventListener('change', () =>
    void persist({ previewWidth: previewWidth.value as PreviewWidthSetting }),
  );
  mermaidTheme.addEventListener('change', () =>
    void persist({ mermaidTheme: mermaidTheme.value as MermaidThemeSetting }),
  );

  // Keep the form in sync when settings change elsewhere (viewer dialog,
  // another options tab) so a later change here can't write back stale values.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
      void fillForm();
    }
  });

  const bridge = await loadSshBridgeSettings();
  const bridgeUrl = $('sshBridgeUrl') as HTMLInputElement;
  const bridgeToken = $('sshBridgeToken') as HTMLInputElement;
  bridgeUrl.value = bridge.bridgeUrl || DEFAULT_SSH_BRIDGE_URL;
  bridgeToken.value = bridge.bridgeToken || '';
  bridgeUrl.addEventListener('change', () => void persistBridge());
  bridgeToken.addEventListener('change', () => void persistBridge());

  void refreshBridgeStatus();
  setInterval(() => void refreshBridgeStatus(), 5000);

  // Save only the changed key: writing the full form state would clobber
  // settings changed meanwhile from the viewer's options dialog.
  async function persist(partial: Partial<PreviewSettings>): Promise<void> {
    await saveSettings(partial);
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
