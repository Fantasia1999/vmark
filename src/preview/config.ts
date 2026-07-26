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
  /** Auto-render on local file:// and GitHub/Gist raw pages when detected */
  autoPreview: boolean;
  breaks: boolean;
  linkify: boolean;
  typographer: boolean;
  mathEnabled: boolean;
  mermaidEnabled: boolean;
  theme: ThemeMode;
  /** Mermaid look; default `vscode` uses VS Code-derived colors */
  mermaidTheme: MermaidThemeSetting;
  /** Disable raw HTML passthrough in Markdown (markdown-it `html: false`) */
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
  // Raw HTML is injected via innerHTML without a sanitizer, so it must be
  // off by default — inline handlers in a .md file would run on file:// pages.
  sanitizeHtml: true,
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
