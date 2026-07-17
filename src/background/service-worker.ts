export {}; // treat as ES module for isolated scope

const VIEWER_PATH = 'viewer/viewer.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vscode-md-preview-open-workspace',
      title: '打开工作区文件夹…',
      contexts: ['action'],
    });
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

function openViewer(query = ''): void {
  const url = chrome.runtime.getURL(`${VIEWER_PATH}${query}`);
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
    case 'vscode-md-preview-open-workspace':
      openViewer('?workspace=1');
      break;
    case 'vscode-md-preview-open-local':
      openViewer('?pick=1');
      break;
    case 'vscode-md-preview-open-viewer':
      openViewer('');
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
  if (message?.type === 'openWorkspace') {
    openViewer('?workspace=1');
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'openLocalFile' || message?.type === 'openViewer') {
    const q =
      message?.type === 'openLocalFile' || message?.pick === true
        ? '?pick=1'
        : message?.workspace
          ? '?workspace=1'
          : '';
    openViewer(q);
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'togglePreview') {
    void sendToActiveTab({ type: 'togglePreview' }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
