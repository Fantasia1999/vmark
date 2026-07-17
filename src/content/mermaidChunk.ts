/**
 * Separate entry: only loaded when a page has mermaid diagrams.
 */
import mermaid from 'mermaid';

export async function renderMermaid(
  nodes: HTMLElement[],
  isDark: boolean,
): Promise<void> {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'var(--markdown-font-family, sans-serif)',
  });
  await mermaid.run({ nodes });
}
