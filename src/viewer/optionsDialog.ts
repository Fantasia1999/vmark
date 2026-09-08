/**
 * In-page settings dialog for the Markdown workbench (viewer).
 * Same fields as options.html; saves to chrome.storage so open previews refresh live.
 */

import {
  loadSettings,
  saveSettings,
  type MermaidThemeSetting,
  type PreviewSettings,
  type PreviewWidthSetting,
  type SupportedLocale,
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
import { t, setLocale, onLocaleChange, localizeDom, getLocale } from '../shared/i18n/index';
import { updateBridgePopover } from './bridgePopover';

export const OPTIONS_DIALOG_ID = 'options-dialog';

const CHECKBOX_IDS = [
  'opt-autoPreview',
  'opt-breaks',
  'opt-linkify',
  'opt-typographer',
  'opt-html',
  'opt-mathEnabled',
  'opt-mermaidEnabled',
] as const;

const SETTING_BY_CHECKBOX: Record<(typeof CHECKBOX_IDS)[number], keyof PreviewSettings> = {
  'opt-autoPreview': 'autoPreview',
  'opt-breaks': 'breaks',
  'opt-linkify': 'linkify',
  'opt-typographer': 'typographer',
  'opt-html': 'html',
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

export function localizeOptionsDialog(): void {
  const dlg = document.getElementById(OPTIONS_DIALOG_ID);
  if (!dlg) return;
  localizeDom(dlg);
}

async function refreshBridgeStatus(): Promise<void> {
  const el = document.getElementById('opt-bridge-status');
  if (!el) {
    return;
  }
  const h = await sshHealth();
  const { tone, html } = formatBridgeStatus(h, getLocale() === 'en' ? 'en' : 'zh');
  applyBridgeStatusTone(el, tone);
  el.innerHTML = html;
}

// Save only the changed key: writing the full form state would clobber
// settings changed meanwhile from the full options page.
async function persistSettings(partial: Partial<PreviewSettings>): Promise<void> {
  await saveSettings(partial);
  setStatus(t('options.saved'));
}

async function persistBridge(): Promise<void> {
  const url = ($('opt-sshBridgeUrl') as HTMLInputElement).value.trim() || DEFAULT_SSH_BRIDGE_URL;
  const token = ($('opt-sshBridgeToken') as HTMLInputElement).value.trim();
  await saveSshBridgeSettings({ bridgeUrl: url, bridgeToken: token });
  setStatus(t('options.bridgeSaved'));
  void refreshBridgeStatus();
  void updateBridgePopover(true);
}

async function fillForm(): Promise<void> {
  const settings = await loadSettings();
  for (const id of CHECKBOX_IDS) {
    const key = SETTING_BY_CHECKBOX[id];
    ($(id) as HTMLInputElement).checked = Boolean(settings[key]);
  }
  const localeEl = document.getElementById('opt-locale') as HTMLSelectElement | null;
  if (localeEl) {
    localeEl.value = settings.locale ?? 'en';
  }
  ($('opt-theme') as HTMLSelectElement).value = settings.theme;
  ($('opt-previewWidth') as HTMLSelectElement).value = settings.previewWidth ?? 'wide';
  ($('opt-mermaidTheme') as HTMLSelectElement).value = settings.mermaidTheme ?? 'vscode';

  const bridge = await loadSshBridgeSettings();
  ($('opt-sshBridgeUrl') as HTMLInputElement).value = bridge.bridgeUrl || DEFAULT_SSH_BRIDGE_URL;
  ($('opt-sshBridgeToken') as HTMLInputElement).value = bridge.bridgeToken || '';
  localizeOptionsDialog();
  void refreshBridgeStatus();
}

function wireOnce(): void {
  if (wired) {
    return;
  }
  wired = true;

  for (const id of CHECKBOX_IDS) {
    const key = SETTING_BY_CHECKBOX[id];
    $(id).addEventListener('change', () =>
      void persistSettings({ [key]: ($(id) as HTMLInputElement).checked }),
    );
  }
  const localeEl = document.getElementById('opt-locale') as HTMLSelectElement | null;
  if (localeEl) {
    localeEl.addEventListener('change', () => {
      const next = localeEl.value as SupportedLocale;
      setLocale(next);
      void persistSettings({
        locale: next,
      });
    });
  }
  onLocaleChange(() => {
    localizeOptionsDialog();
  });
  $('opt-theme').addEventListener('change', () =>
    void persistSettings({
      theme: ($('opt-theme') as HTMLSelectElement).value as ThemeMode,
    }),
  );
  $('opt-previewWidth').addEventListener('change', () =>
    void persistSettings({
      previewWidth: ($('opt-previewWidth') as HTMLSelectElement)
        .value as PreviewWidthSetting,
    }),
  );
  $('opt-mermaidTheme').addEventListener('change', () =>
    void persistSettings({
      mermaidTheme: ($('opt-mermaidTheme') as HTMLSelectElement)
        .value as MermaidThemeSetting,
    }),
  );
  $('opt-sshBridgeUrl').addEventListener('change', () => void persistBridge());
  $('opt-sshBridgeToken').addEventListener('change', () => void persistBridge());

  // Wire 4 tabs switching
  const tabs = document.querySelectorAll<HTMLButtonElement>('#options-dialog .opt-tab[data-opt-tab]');
  const panels = document.querySelectorAll<HTMLElement>('#options-dialog .opt-panel[data-opt-panel]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.optTab;
      tabs.forEach((t) => {
        const isTarget = t.dataset.optTab === target;
        t.classList.toggle('active', isTarget);
        t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      });
      panels.forEach((p) => {
        const isTarget = p.dataset.optPanel === target;
        p.hidden = !isTarget;
        p.classList.toggle('active', isTarget);
      });
    });
  });

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
