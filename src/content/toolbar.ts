import { createIconEl, setButtonIcon } from '../shared/icons';

export type PreviewMode = 'preview' | 'source';

export interface ToolbarHandlers {
  onToggleMode: (mode: PreviewMode) => void;
  onOpenOptions: () => void;
  /** Optional: toggle document outline / TOC */
  onToggleOutline?: () => void;
  outlineOpen?: boolean;
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
  label.title = 'VS Code Markdown Preview';
  label.appendChild(createIconEl('brand'));

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.dataset.mode = 'preview';

  const sourceBtn = document.createElement('button');
  sourceBtn.type = 'button';
  sourceBtn.textContent = 'Source';
  sourceBtn.dataset.mode = 'source';

  const outlineBtn = document.createElement('button');
  outlineBtn.type = 'button';
  outlineBtn.className = 'vsc-icon-btn';
  outlineBtn.title = '文档大纲';
  outlineBtn.dataset.action = 'outline';
  setButtonIcon(outlineBtn, 'outline');
  if (handlers.outlineOpen) {
    outlineBtn.classList.add('active');
  }

  const optionsBtn = document.createElement('button');
  optionsBtn.type = 'button';
  optionsBtn.className = 'vsc-icon-btn';
  optionsBtn.title = '选项';
  setButtonIcon(optionsBtn, 'settings');

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
  outlineBtn.addEventListener('click', () => handlers.onToggleOutline?.());
  optionsBtn.addEventListener('click', () => handlers.onOpenOptions());

  bar.append(label, previewBtn, sourceBtn);
  if (handlers.onToggleOutline) {
    bar.append(outlineBtn);
  }
  bar.append(optionsBtn);
  document.documentElement.appendChild(bar);
  return bar;
}

export function removeToolbar(): void {
  document.getElementById('vscode-md-preview-toolbar')?.remove();
}
