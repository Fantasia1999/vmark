/**
 * Lazily render mermaid diagrams via a separate extension chunk.
 */
export async function runMermaid(root: ParentNode, isDark: boolean): Promise<void> {
  const nodes = Array.from(root.querySelectorAll('.mermaid')) as HTMLElement[];
  if (!nodes.length) {
    return;
  }

  try {
    const url = chrome.runtime.getURL('content/mermaidChunk.js');
    const mod = await import(/* @vite-ignore */ url);
    await mod.renderMermaid(nodes, isDark);
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
