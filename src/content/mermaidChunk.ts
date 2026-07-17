/**
 * Separate entry: only loaded when a page has mermaid diagrams.
 * Uses VS Code-derived Mermaid theme (base + themeVariables from CSS tokens).
 */
import mermaid from 'mermaid';
import {
  resolveMermaidTheme,
  type MermaidBuiltinTheme,
  vsCodeMermaidTheme,
} from './vsCodeMermaidTheme';

export async function renderMermaid(
  nodes: HTMLElement[],
  options?: {
    isDark?: boolean;
    /** 'vscode' (default) | built-in mermaid themes */
    mermaidTheme?: MermaidBuiltinTheme;
  },
): Promise<void> {
  const themeName = options?.mermaidTheme ?? vsCodeMermaidTheme;
  const { theme, themeVariables } = resolveMermaidTheme(themeName);

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    themeVariables,
    // fontFamily is also set via themeVariables when available
    fontFamily:
      (typeof themeVariables.fontFamily === 'string'
        ? themeVariables.fontFamily
        : undefined) ||
      'var(--markdown-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  });

  await mermaid.run({ nodes });
}
