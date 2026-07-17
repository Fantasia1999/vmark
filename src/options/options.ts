import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type PreviewSettings,
  type ThemeMode,
} from '../preview/config';

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

  async function persist(): Promise<void> {
    const next: PreviewSettings = {
      ...DEFAULT_SETTINGS,
      autoPreview: ( $('autoPreview') as HTMLInputElement).checked,
      breaks: ($('breaks') as HTMLInputElement).checked,
      linkify: ($('linkify') as HTMLInputElement).checked,
      typographer: ($('typographer') as HTMLInputElement).checked,
      sanitizeHtml: ($('sanitizeHtml') as HTMLInputElement).checked,
      mathEnabled: ($('mathEnabled') as HTMLInputElement).checked,
      mermaidEnabled: ($('mermaidEnabled') as HTMLInputElement).checked,
      theme: theme.value as ThemeMode,
    };
    await saveSettings(next);
    const status = $('status');
    status.textContent = 'Saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  }
}

void init();
