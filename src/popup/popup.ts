import { iconHtml, type IconName } from '../shared/icons';

export {}; // treat as ES module for isolated scope

// Fill data-icon slots with SVG
for (const el of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  const name = el.dataset.icon as IconName | undefined;
  if (name) {
    el.innerHTML = iconHtml(name);
  }
}

function openViewer(query = ''): void {
  const url = chrome.runtime.getURL(`viewer/viewer.html${query}`);
  void chrome.tabs.create({ url });
  window.close();
}

/** Primary entry: Markdown workbench (restores last workspace session). */
document.getElementById('openWorkbench')?.addEventListener('click', () => {
  openViewer('');
});

document.getElementById('openWorkspace')?.addEventListener('click', () => {
  openViewer('?workspace=1');
});

document.getElementById('openSsh')?.addEventListener('click', () => {
  openViewer('?ssh=1');
});

document.getElementById('openWsl')?.addEventListener('click', () => {
  openViewer('?wsl=1');
});

document.getElementById('openLocal')?.addEventListener('click', () => {
  openViewer('?pick=1');
});

document.getElementById('togglePreview')?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'togglePreview' }).finally(() => window.close());
});

document.getElementById('openOptions')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});
