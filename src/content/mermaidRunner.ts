/**
 * Lazily render mermaid diagrams via a separate extension chunk,
 * using VS Code-style theming.
 */
import type { MermaidBuiltinTheme } from './vsCodeMermaidTheme';

export async function runMermaid(
  root: ParentNode,
  options?: {
    isDark?: boolean;
    mermaidTheme?: MermaidBuiltinTheme;
  },
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll('.mermaid')) as HTMLElement[];
  if (!nodes.length) {
    return;
  }

  try {
    const url = chrome.runtime.getURL('content/mermaidChunk.js');
    const mod = await import(/* @vite-ignore */ url);
    await mod.renderMermaid(nodes, {
      isDark: options?.isDark,
      mermaidTheme: options?.mermaidTheme ?? 'vscode',
    });
  } catch (e) {
    console.error('[vscode-md-preview] mermaid render failed', e);
    for (const node of nodes) {
      const err = document.createElement('div');
      err.className = 'vscode-md-preview-error';
      err.textContent = `Mermaid error: ${e instanceof Error ? e.message : String(e)}`;
      node.replaceWith(err);
    }
  }
}
