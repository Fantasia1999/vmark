/**
 * Render markdown source with a line-number gutter (editor-like).
 * Safe: uses textContent only; no HTML interpretation of the file body.
 */

export const SOURCE_VIEW_CLASS = 'md-source-view';

/** Split into display lines; empty document → one blank line. */
export function splitSourceLines(text: string): string[] {
  if (text.length === 0) {
    return [''];
  }
  return text.split('\n');
}

/**
 * Fill `container` with a line-numbered source view.
 * Replaces previous children. Adds {@link SOURCE_VIEW_CLASS}.
 */
export function renderSourceWithLineNumbers(container: HTMLElement, text: string): void {
  container.classList.add(SOURCE_VIEW_CLASS);

  const lines = splitSourceLines(text);
  const table = document.createElement('table');
  table.className = 'md-source-table';
  table.setAttribute('role', 'presentation');

  const frag = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    const tr = document.createElement('tr');
    tr.className = 'md-source-row';

    const ln = document.createElement('td');
    ln.className = 'md-source-ln';
    ln.textContent = String(i + 1);
    ln.setAttribute('data-line', String(i + 1));

    const code = document.createElement('td');
    code.className = 'md-source-line';
    // Keep empty rows tall; pre-wrap alone collapses zero-height cells
    const line = lines[i];
    code.textContent = line.length === 0 ? '\u00a0' : line;

    tr.append(ln, code);
    frag.appendChild(tr);
  }
  table.appendChild(frag);

  container.replaceChildren(table);
}
