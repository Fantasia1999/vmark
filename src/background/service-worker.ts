export {}; // treat as ES module for isolated scope

const VIEWER_PATH = 'viewer/viewer.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vscode-md-preview-open-local',
      title: '打开本地 Markdown…',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'vscode-md-preview-open-viewer',
      title: '打开预览工作台',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'vscode-md-preview-toggle',
      title: '切换当前页 Markdown 预览',
      contexts: ['page', 'frame', 'action'],
    });
  });
});

function openViewer(pick = false): void {
  const url = chrome.runtime.getURL(`${VIEWER_PATH}${pick ? '?pick=1' : ''}`);
  void chrome.tabs.create({ url });
}

async function sendToActiveTab(message: Record<string, unknown>): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js'],
      });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      console.warn('[vscode-md-preview] cannot inject content script', e);
    }
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  switch (info.menuItemId) {
    case 'vscode-md-preview-open-local':
      openViewer(true);
      break;
    case 'vscode-md-preview-open-viewer':
      openViewer(false);
      break;
    case 'vscode-md-preview-toggle':
      void sendToActiveTab({ type: 'togglePreview' });
      break;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'openOptions') {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'openLocalFile' || message?.type === 'openViewer') {
    openViewer(message?.type === 'openLocalFile' || message?.pick === true);
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'togglePreview') {
    void sendToActiveTab({ type: 'togglePreview' }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
