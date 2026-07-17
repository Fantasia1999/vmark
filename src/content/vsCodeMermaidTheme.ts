/*---------------------------------------------------------------------------------------------
 *  Derived from VS Code mermaid-markdown-features/preview-src/shared/vsCodeTheme.ts
 *  Copyright (c) Microsoft Corporation. MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Identifier for the custom Mermaid theme derived from VS Code color tokens.
 * Implemented as mermaid `base` + resolved `themeVariables`.
 */
export const vsCodeMermaidTheme = 'vscode';

export type MermaidBuiltinTheme =
  | 'base'
  | 'forest'
  | 'dark'
  | 'default'
  | 'neutral'
  | typeof vsCodeMermaidTheme;

export interface VsCodeMermaidThemeVariables {
  readonly variables: Record<string, string | boolean>;
  readonly fingerprint: string;
}

/**
 * True when our preview (or VS Code webview body classes) is in dark mode.
 */
export function isDarkPreviewTheme(): boolean {
  const root = document.getElementById('vscode-md-preview-root');
  const theme =
    root?.dataset.theme ||
    document.documentElement.dataset.theme ||
    document.body.dataset.theme;

  if (theme === 'dark') {
    return true;
  }
  if (theme === 'light') {
    return false;
  }

  return (
    document.body.classList.contains('vscode-dark') ||
    (document.body.classList.contains('vscode-high-contrast') &&
      !document.body.classList.contains('vscode-high-contrast-light')) ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function themeRoot(): Element {
  return (
    document.getElementById('vscode-md-preview-root') ||
    document.documentElement
  );
}

/**
 * Resolves a CSS color (e.g. `var(--vscode-editor-background)`) to a hex string.
 */
function resolveCssColor(cssValue: string): string | undefined {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = cssValue;
  themeRoot().appendChild(probe);
  try {
    return rgbStringToHex(getComputedStyle(probe).color);
  } finally {
    probe.remove();
  }
}

function rgbStringToHex(value: string): string | undefined {
  // rgb(r, g, b) / rgba(r, g, b, a)
  let match = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  // Modern: rgb(r g b / a)
  if (!match) {
    match = value.match(
      /^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/,
    );
  }
  if (!match) {
    return undefined;
  }
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  let a = 255;
  if (match[4] !== undefined) {
    const raw = match[4];
    a = raw.endsWith('%')
      ? Math.round((parseFloat(raw) / 100) * 255)
      : Math.round(parseFloat(raw) * 255);
  }
  const hex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return a < 255
    ? `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`
    : `#${hex(r)}${hex(g)}${hex(b)}`;
}

function readCssVar(name: string): string {
  return getComputedStyle(themeRoot()).getPropertyValue(name).trim();
}

function pickColor(...varNames: string[]): string | undefined {
  for (const name of varNames) {
    // Peek at the raw custom property first so missing vars don't fall back to inherited color.
    if (!readCssVar(name)) {
      continue;
    }
    const hex = resolveCssColor(`var(${name})`);
    if (hex) {
      return hex;
    }
  }
  return undefined;
}

/**
 * Compute Mermaid `themeVariables` from live VS Code-style CSS custom properties.
 */
export function computeVsCodeMermaidThemeVariables(): VsCodeMermaidThemeVariables {
  const variables: Record<string, string | boolean> = {
    darkMode: isDarkPreviewTheme(),
  };

  const set = (key: string, ...varNames: string[]) => {
    const color = pickColor(...varNames);
    if (color) {
      variables[key] = color;
    }
  };

  // Canvas / text
  set('background', '--vscode-editor-background');
  set(
    'textColor',
    '--vscode-charts-foreground',
    '--vscode-editor-foreground',
    '--vscode-foreground',
  );
  set(
    'lineColor',
    '--vscode-chart-line',
    '--vscode-charts-lines',
    '--vscode-editor-foreground',
    '--vscode-foreground',
  );

  // Primary (default node)
  set('primaryColor', '--vscode-editorWidget-background');
  set(
    'primaryTextColor',
    '--vscode-charts-foreground',
    '--vscode-editor-foreground',
    '--vscode-foreground',
  );
  set(
    'primaryBorderColor',
    '--vscode-chart-line',
    '--vscode-editorWidget-border',
    '--vscode-focusBorder',
  );
  set('mainBkg', '--vscode-editorWidget-background');
  set(
    'nodeBorder',
    '--vscode-chart-line',
    '--vscode-editorWidget-border',
    '--vscode-focusBorder',
  );

  // Secondary
  set('secondaryColor', '--vscode-input-background', '--vscode-editorWidget-background');
  set('secondaryTextColor', '--vscode-input-foreground', '--vscode-foreground');
  set('secondaryBorderColor', '--vscode-input-border', '--vscode-editorWidget-border');

  // Tertiary / subgraph
  set('tertiaryColor', '--vscode-textBlockQuote-background', '--vscode-input-background');
  set('tertiaryTextColor', '--vscode-foreground');
  set('tertiaryBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');
  set('clusterBkg', '--vscode-textBlockQuote-background', '--vscode-input-background');
  set('clusterBorder', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');

  // Notes
  set('noteBkgColor', '--vscode-textBlockQuote-background', '--vscode-editorWidget-background');
  set('noteTextColor', '--vscode-foreground');
  set('noteBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');

  // Errors
  set(
    'errorBkgColor',
    '--vscode-inputValidation-errorBackground',
    '--vscode-editorError-background',
  );
  set('errorTextColor', '--vscode-editorError-foreground', '--vscode-foreground');

  // Misc
  set(
    'titleColor',
    '--vscode-charts-foreground',
    '--vscode-editor-foreground',
    '--vscode-foreground',
  );
  set('edgeLabelBackground', '--vscode-editor-background');

  // Palette: pie1..pie12 / cScale0..cScale11
  const chartPalette = [
    '--vscode-charts-blue',
    '--vscode-charts-green',
    '--vscode-charts-orange',
    '--vscode-charts-red',
    '--vscode-charts-purple',
    '--vscode-charts-yellow',
  ];
  for (let i = 0; i < chartPalette.length; i++) {
    set(`pie${i + 1}`, chartPalette[i]);
    set(`cScale${i}`, chartPalette[i]);
  }

  const fontFamily =
    readCssVar('--vscode-font-family') ||
    readCssVar('--markdown-font-family');
  if (fontFamily) {
    variables.fontFamily = fontFamily;
  }

  const fontSize =
    readCssVar('--vscode-font-size') || readCssVar('--markdown-font-size');
  if (fontSize) {
    variables.fontSize = fontSize;
  }

  return {
    variables,
    fingerprint: JSON.stringify(variables),
  };
}

export interface ResolveMermaidThemeResult {
  theme: 'base' | 'forest' | 'dark' | 'default' | 'neutral';
  themeVariables: Record<string, string | boolean>;
}

/**
 * Map extension theme preference to mermaid initialize options.
 * Default `'vscode'` → mermaid `base` + CSS-derived themeVariables (VS Code behavior).
 */
export function resolveMermaidTheme(
  themeName: MermaidBuiltinTheme = vsCodeMermaidTheme,
): ResolveMermaidThemeResult {
  if (themeName === vsCodeMermaidTheme) {
    return {
      theme: 'base',
      themeVariables: computeVsCodeMermaidThemeVariables().variables,
    };
  }

  return {
    theme: themeName,
    // Clear stale variables if mermaid was previously initialized with vscode theme
    themeVariables: {},
  };
}
