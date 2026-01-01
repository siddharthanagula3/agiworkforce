console.log('AGI Workforce extension background script loaded');

let _desktopConnection = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('AGI Workforce extension installed');

  chrome.storage.local.set({
    enabled: true,
    connectedToDesktop: false,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'PING':
      sendResponse({ success: true, message: 'pong' });
      break;

    case 'GET_COOKIES':
      handleGetCookies(message, sendResponse);
      return true;

    case 'SET_COOKIE':
      handleSetCookie(message, sendResponse);
      return true;

    case 'CLEAR_COOKIES':
      handleClearCookies(message, sendResponse);
      return true;

    case 'EXECUTE_SCRIPT':
      handleExecuteScript(message, sender, sendResponse);
      return true;

    case 'CAPTURE_SCREENSHOT':
      handleCaptureScreenshot(message, sender, sendResponse);
      return true;

    case 'GET_TAB_INFO':
      handleGetTabInfo(sender, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

async function handleGetCookies(message, sendResponse) {
  try {
    const url = message.url || '<all_urls>';
    const cookies = await chrome.cookies.getAll({ url });
    sendResponse({ success: true, data: cookies });
  } catch (error) {
    console.error('Failed to get cookies:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSetCookie(message, sendResponse) {
  try {
    const { name, value, domain, path, secure, httpOnly } = message.cookie;
    await chrome.cookies.set({
      url: 'https://api.agiworkforce.com',
      name,
      value,
      domain,
      path: path || '/',
      secure: secure !== false,
      httpOnly: httpOnly !== false,
    });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to set cookie:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleClearCookies(message, sendResponse) {
  try {
    const url = message.url || '<all_urls>';
    const cookies = await chrome.cookies.getAll({ url });

    for (const cookie of cookies) {
      await chrome.cookies.remove({
        url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`,
        name: cookie.name,
      });
    }

    sendResponse({ success: true, cleared: cookies.length });
  } catch (error) {
    console.error('Failed to clear cookies:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleExecuteScript(message, sender, sendResponse) {
  sendResponse({
    success: false,
    error: 'EXECUTE_SCRIPT is disabled for security reasons',
  });
}

async function handleCaptureScreenshot(message, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error('No tab ID available');
    }

    const format = message.format || 'png';
    const quality = message.quality || 80;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format,
      quality: format === 'jpeg' ? quality : undefined,
    });

    sendResponse({ success: true, data: dataUrl });
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetTabInfo(sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error('No tab ID available');
    }

    const tab = await chrome.tabs.get(tabId);

    sendResponse({
      success: true,
      data: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        active: tab.active,
        windowId: tab.windowId,
      },
    });
  } catch (error) {
    console.error('Failed to get tab info:', error);
    sendResponse({ success: false, error: error.message });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url);

    chrome.tabs
      .sendMessage(tabId, {
        type: 'TAB_READY',
        url: tab.url,
      })
      .catch(() => {});
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
});

function connectToDesktop() {
  try {
    console.log('Desktop connection would be established here');

    chrome.storage.local.set({ connectedToDesktop: true });
  } catch (error) {
    console.error('Failed to connect to desktop:', error);
    chrome.storage.local.set({ connectedToDesktop: false });
  }
}

connectToDesktop();
