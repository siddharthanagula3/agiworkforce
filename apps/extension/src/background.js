// AGI Workforce Browser Automation Extension - Background Script (Service Worker)

console.log('AGI Workforce extension background script loaded');

// WebSocket connection to desktop app (native messaging would be used in production)
let _desktopConnection = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('AGI Workforce extension installed');

  // Set default settings
  chrome.storage.local.set({
    enabled: true,
    connectedToDesktop: false,
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'PING':
      sendResponse({ success: true, message: 'pong' });
      break;

    case 'GET_COOKIES':
      handleGetCookies(message, sendResponse);
      return true; // Will respond asynchronously

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

// Handle get cookies
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

// Handle set cookie
async function handleSetCookie(message, sendResponse) {
  try {
    const { name, value, domain, path, secure, httpOnly } = message.cookie;
    await chrome.cookies.set({
      url: `https://${domain}${path || '/'}`,
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

// Handle clear cookies
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

// Handle execute script in tab
async function handleExecuteScript(message, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error('No tab ID available');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function(message.script),
    });

    sendResponse({ success: true, data: results[0]?.result });
  } catch (error) {
    console.error('Failed to execute script:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle capture screenshot
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

// Handle get tab info
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

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url);

    // Notify content script that tab is ready
    chrome.tabs
      .sendMessage(tabId, {
        type: 'TAB_READY',
        url: tab.url,
      })
      .catch(() => {
        // Content script might not be ready yet
      });
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
});

// Handle native messaging (for communication with desktop app)
// In production, this would use chrome.runtime.connectNative
function connectToDesktop() {
  try {
    // This would connect to the native messaging host
    // _desktopConnection = chrome.runtime.connectNative('com.agiworkforce.desktop');

    console.log('Desktop connection would be established here');

    chrome.storage.local.set({ connectedToDesktop: true });
  } catch (error) {
    console.error('Failed to connect to desktop:', error);
    chrome.storage.local.set({ connectedToDesktop: false });
  }
}

// Attempt to connect to desktop on startup
connectToDesktop();
