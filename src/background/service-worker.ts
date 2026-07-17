chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'vscode-md-preview-toggle',
    title: 'Toggle Markdown Preview',
    contexts: ['page', 'frame'],
  });
});

async function sendToActiveTab(message: Record<string, unknown>): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Content script may not be injected (e.g. chrome:// pages). Try programmatic inject.
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

chrome.action.onClicked.addListener(() => {
  void sendToActiveTab({ type: 'togglePreview' });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'vscode-md-preview-toggle') {
    void sendToActiveTab({ type: 'togglePreview' });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'openOptions') {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
