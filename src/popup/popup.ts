export {}; // treat as ES module for isolated scope

function openViewer(query = ''): void {
  const url = chrome.runtime.getURL(`viewer/viewer.html${query}`);
  void chrome.tabs.create({ url });
  window.close();
}

document.getElementById('openWorkspace')?.addEventListener('click', () => {
  openViewer('?workspace=1');
});

document.getElementById('openLocal')?.addEventListener('click', () => {
  openViewer('?pick=1');
});

document.getElementById('openViewer')?.addEventListener('click', () => {
  openViewer('');
});

document.getElementById('togglePreview')?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'togglePreview' }).finally(() => window.close());
});

document.getElementById('openOptions')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});
