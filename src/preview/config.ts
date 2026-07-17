export type ThemeMode = 'auto' | 'light' | 'dark';

/** Mermaid theme: `vscode` matches VS Code (base + CSS themeVariables). */
export type MermaidThemeSetting =
  | 'vscode'
  | 'default'
  | 'dark'
  | 'forest'
  | 'neutral'
  | 'base';

/**
 * Preview content width.
 * - comfortable: ~980px (classic reading column)
 * - wide: ~1280px (default, better on large monitors)
 * - fluid: up to ~1600px / 96vw
 * - full: use full pane width
 */
export type PreviewWidthSetting = 'comfortable' | 'wide' | 'fluid' | 'full';

export interface PreviewSettings {
  /** Auto-render when a markdown page is detected */
  autoPreview: boolean;
  breaks: boolean;
  linkify: boolean;
  typographer: boolean;
  mathEnabled: boolean;
  mermaidEnabled: boolean;
  theme: ThemeMode;
  /** Mermaid look; default `vscode` uses VS Code-derived colors */
  mermaidTheme: MermaidThemeSetting;
  /** Sanitize HTML with a basic allowlist pass (lighter than full DOMPurify for MVP) */
  sanitizeHtml: boolean;
  /** Max width of the rendered markdown column */
  previewWidth: PreviewWidthSetting;
}

export const DEFAULT_SETTINGS: PreviewSettings = {
  autoPreview: true,
  breaks: false,
  linkify: true,
  typographer: false,
  mathEnabled: true,
  mermaidEnabled: true,
  theme: 'auto',
  mermaidTheme: 'vscode',
  sanitizeHtml: false,
  previewWidth: 'wide',
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
