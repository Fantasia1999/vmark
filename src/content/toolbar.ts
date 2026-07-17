export type PreviewMode = 'preview' | 'source';

export interface ToolbarHandlers {
  onToggleMode: (mode: PreviewMode) => void;
  onOpenOptions: () => void;
}

export function mountToolbar(
  mode: PreviewMode,
  handlers: ToolbarHandlers,
): HTMLElement {
  const existing = document.getElementById('vscode-md-preview-toolbar');
  existing?.remove();

  const bar = document.createElement('div');
  bar.id = 'vscode-md-preview-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Markdown preview');

  const label = document.createElement('span');
  label.className = 'vsc-md-label';
  label.textContent = 'MD';

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.dataset.mode = 'preview';

  const sourceBtn = document.createElement('button');
  sourceBtn.type = 'button';
  sourceBtn.textContent = 'Source';
  sourceBtn.dataset.mode = 'source';

  const optionsBtn = document.createElement('button');
  optionsBtn.type = 'button';
  optionsBtn.textContent = '⚙';
  optionsBtn.title = 'Options';

  const setActive = (m: PreviewMode) => {
    previewBtn.classList.toggle('active', m === 'preview');
    sourceBtn.classList.toggle('active', m === 'source');
  };
  setActive(mode);

  previewBtn.addEventListener('click', () => {
    setActive('preview');
    handlers.onToggleMode('preview');
  });
  sourceBtn.addEventListener('click', () => {
    setActive('source');
    handlers.onToggleMode('source');
  });
  optionsBtn.addEventListener('click', () => handlers.onOpenOptions());

  bar.append(label, previewBtn, sourceBtn, optionsBtn);
  document.documentElement.appendChild(bar);
  return bar;
}

export function removeToolbar(): void {
  document.getElementById('vscode-md-preview-toolbar')?.remove();
}
