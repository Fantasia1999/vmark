export type ThemeMode = 'auto' | 'light' | 'dark';

export interface PreviewSettings {
  /** Auto-render when a markdown page is detected */
  autoPreview: boolean;
  breaks: boolean;
  linkify: boolean;
  typographer: boolean;
  mathEnabled: boolean;
  mermaidEnabled: boolean;
  theme: ThemeMode;
  /** Sanitize HTML with a basic allowlist pass (lighter than full DOMPurify for MVP) */
  sanitizeHtml: boolean;
}

export const DEFAULT_SETTINGS: PreviewSettings = {
  autoPreview: true,
  breaks: false,
  linkify: true,
  typographer: false,
  mathEnabled: true,
  mermaidEnabled: true,
  theme: 'auto',
  sanitizeHtml: false,
};

export async function loadSettings(): Promise<PreviewSettings> {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<PreviewSettings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}
