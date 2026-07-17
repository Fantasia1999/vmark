export {}; // treat as ES module for isolated scope

function openViewer(pick = false): void {
  const url = chrome.runtime.getURL(`viewer/viewer.html${pick ? '?pick=1' : ''}`);
  void chrome.tabs.create({ url });
  window.close();
}

document.getElementById('openLocal')?.addEventListener('click', () => {
  openViewer(true);
});

document.getElementById('openViewer')?.addEventListener('click', () => {
  openViewer(false);
});

document.getElementById('togglePreview')?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'togglePreview' }).finally(() => window.close());
});

document.getElementById('openOptions')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});
