console.log('AGI Workforce extension background script loaded');

// Native messaging connection
let nativePort = null;
let isNativeConnected = false;
const NATIVE_HOST_NAME = 'com.agiworkforce.browser';

// Pending requests waiting for native responses
const pendingRequests = new Map();

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('AGI Workforce extension installed');
  chrome.storage.local.set({
    enabled: true,
    connectedToDesktop: false,
    nativeMessagingSupported: true,
  });

  // Try to connect to native host
  connectToNativeHost();
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'PING':
      sendResponse({ success: true, message: 'pong', nativeConnected: isNativeConnected });
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

    case 'CAPTURE_SCREENSHOT':
      handleCaptureScreenshot(message, sender, sendResponse);
      return true;

    case 'GET_TAB_INFO':
      handleGetTabInfo(sender, sendResponse);
      return true;

    case 'GET_ALL_TABS':
      handleGetAllTabs(sendResponse);
      return true;

    case 'CREATE_TAB':
      handleCreateTab(message, sendResponse);
      return true;

    case 'CLOSE_TAB':
      handleCloseTab(message, sendResponse);
      return true;

    case 'SWITCH_TAB':
      handleSwitchTab(message, sendResponse);
      return true;

    case 'GET_ACCESSIBILITY_TREE':
      handleGetAccessibilityTree(sender, sendResponse);
      return true;

    case 'NATIVE_MESSAGE':
      handleNativeMessage(message, sendResponse);
      return true;

    case 'CONNECT_NATIVE':
      connectToNativeHost();
      sendResponse({ success: true, connected: isNativeConnected });
      break;

    case 'GET_CONNECTION_STATUS':
      sendResponse({ success: true, nativeConnected: isNativeConnected });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// Native Messaging Functions
function connectToNativeHost() {
  if (nativePort) {
    console.log('Native port already exists');
    return;
  }

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((response) => {
      console.log('Received from native host:', response);

      // Handle response for pending request
      if (response.id && pendingRequests.has(response.id)) {
        const { resolve } = pendingRequests.get(response.id);
        pendingRequests.delete(response.id);
        resolve(response);
      }

      // Update connection status
      if (!isNativeConnected) {
        isNativeConnected = true;
        chrome.storage.local.set({ connectedToDesktop: true });
        broadcastConnectionStatus(true);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('Native host disconnected:', chrome.runtime.lastError?.message);
      nativePort = null;
      isNativeConnected = false;
      chrome.storage.local.set({ connectedToDesktop: false });
      broadcastConnectionStatus(false);

      // Reject all pending requests
      for (const [id, { reject }] of pendingRequests) {
        reject(new Error('Native host disconnected'));
        pendingRequests.delete(id);
      }

      // Try to reconnect after a delay
      setTimeout(connectToNativeHost, 5000);
    });

    // Send initial connection message
    sendNativeMessage({
      type: 'connect',
      extension_id: chrome.runtime.id,
    });

    console.log('Connected to native host');
  } catch (error) {
    console.error('Failed to connect to native host:', error);
    nativePort = null;
    isNativeConnected = false;
  }
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    if (!nativePort) {
      reject(new Error('Not connected to native host'));
      return;
    }

    const id = generateRequestId();
    const request = { id, message };

    pendingRequests.set(id, { resolve, reject });

    // Set timeout for request
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Native message timeout'));
      }
    }, 30000);

    nativePort.postMessage(request);
  });
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function broadcastConnectionStatus(connected) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'CONNECTION_STATUS_CHANGED',
          connected,
        })
        .catch(() => {});
    }
  });
}

// Handle native message relay
async function handleNativeMessage(message, sendResponse) {
  try {
    const response = await sendNativeMessage(message.payload);
    sendResponse({ success: true, data: response });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Cookie handlers
async function handleGetCookies(message, sendResponse) {
  try {
    const url = message.url || undefined;
    const cookies = url ? await chrome.cookies.getAll({ url }) : await chrome.cookies.getAll({});
    sendResponse({ success: true, data: cookies });
  } catch (error) {
    console.error('Failed to get cookies:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSetCookie(message, sendResponse) {
  try {
    const { name, value, domain, path, secure, httpOnly, url } = message.cookie;
    await chrome.cookies.set({
      url: url || `https://${domain}`,
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
    const url = message.url;
    const cookies = url ? await chrome.cookies.getAll({ url }) : await chrome.cookies.getAll({});

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

// Screenshot handler
async function handleCaptureScreenshot(message, sender, sendResponse) {
  try {
    const format = message.format || 'png';
    const quality = message.quality || 80;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format,
      quality: format === 'jpeg' ? quality : undefined,
    });

    // If native host is connected, also send to it
    if (isNativeConnected && nativePort) {
      sendNativeMessage({
        type: 'screenshot',
        tab_id: sender.tab?.id,
        data: dataUrl,
        format,
      }).catch((e) => console.error('Failed to send screenshot to native:', e));
    }

    sendResponse({ success: true, data: dataUrl });
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Tab handlers
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
        status: tab.status,
      },
    });
  } catch (error) {
    console.error('Failed to get tab info:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetAllTabs(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsInfo = tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      active: tab.active,
      windowId: tab.windowId,
      status: tab.status,
    }));

    sendResponse({ success: true, data: tabsInfo });
  } catch (error) {
    console.error('Failed to get all tabs:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCreateTab(message, sendResponse) {
  try {
    const tab = await chrome.tabs.create({
      url: message.url,
      active: message.active !== false,
    });

    sendResponse({
      success: true,
      data: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
      },
    });
  } catch (error) {
    console.error('Failed to create tab:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCloseTab(message, sendResponse) {
  try {
    await chrome.tabs.remove(message.tabId);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to close tab:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSwitchTab(message, sendResponse) {
  try {
    await chrome.tabs.update(message.tabId, { active: true });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Failed to switch tab:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Accessibility tree handler
async function handleGetAccessibilityTree(sender, sendResponse) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error('No tab ID available');
    }

    // Send message to content script to build accessibility tree
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'BUILD_ACCESSIBILITY_TREE',
    });

    // Also forward to native host if connected
    if (isNativeConnected && nativePort) {
      sendNativeMessage({
        type: 'accessibility_tree',
        tab_id: tabId,
        tree: response.data,
      }).catch((e) => console.error('Failed to send a11y tree to native:', e));
    }

    sendResponse(response);
  } catch (error) {
    console.error('Failed to get accessibility tree:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Tab lifecycle events
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url);

    // Notify content script
    chrome.tabs
      .sendMessage(tabId, {
        type: 'TAB_READY',
        url: tab.url,
      })
      .catch(() => {});

    // Notify native host if connected
    if (isNativeConnected && nativePort) {
      sendNativeMessage({
        type: 'tab_loaded',
        tab_id: tabId,
        url: tab.url,
        title: tab.title,
      }).catch(() => {});
    }
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);

  if (isNativeConnected && nativePort) {
    sendNativeMessage({
      type: 'tab_activated',
      tab_id: activeInfo.tabId,
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId, _removeInfo) => {
  console.log('Tab closed:', tabId);

  if (isNativeConnected && nativePort) {
    sendNativeMessage({
      type: 'tab_closed',
      tab_id: tabId,
    }).catch(() => {});
  }
});

// Initialize native connection on startup
connectToNativeHost();
