# Browser Automation Usage Guide

This document demonstrates how to use the AGI Workforce browser automation capabilities from the React frontend.

## Overview

The browser automation system provides comprehensive web automation capabilities including:
- Browser lifecycle management (launch, close)
- Tab/page management (open, close, navigate)
- DOM element interaction (click, type, select)
- Data extraction (text, attributes, screenshots)
- JavaScript execution
- Cookie and local storage management (via extension)

## Architecture

The browser automation system consists of three main components:

1. **Rust Backend** (`apps/desktop/src-tauri/src/browser/`)
   - `playwright_bridge.rs`: Browser process management
   - `tab_manager.rs`: Tab lifecycle and navigation
   - `dom_operations.rs`: DOM manipulation and interaction
   - `extension_bridge.rs`: Chrome extension communication

2. **Tauri Commands** (`apps/desktop/src-tauri/src/commands/browser.rs`)
   - IPC layer exposing browser operations to frontend

3. **Chrome Extension** (`apps/extension/`)
   - Deep DOM access and advanced features
   - Cookie and local storage management

## React Frontend Usage

### 1. Initialize Browser Automation

```typescript
import { invoke } from '@tauri-apps/api/core';

// Initialize browser automation system
async function initBrowserAutomation() {
  try {
    const result = await invoke<string>('browser_init');
    console.log('Browser automation initialized:', result);
  } catch (error) {
    console.error('Failed to initialize browser automation:', error);
  }
}

// Call on app startup
initBrowserAutomation();
```

### 2. Launch a Browser

```typescript
// Launch Chrome browser
async function launchBrowser() {
  try {
    const browserId = await invoke<string>('browser_launch', {
      browserType: 'chromium', // or 'firefox', 'webkit'
      headless: false // set to true for headless mode
    });

    console.log('Browser launched with ID:', browserId);
    return browserId;
  } catch (error) {
    console.error('Failed to launch browser:', error);
    throw error;
  }
}
```

### 3. Open and Navigate Tabs

```typescript
// Open a new tab
async function openTab(url: string) {
  try {
    const tabId = await invoke<string>('browser_open_tab', { url });
    console.log('Tab opened with ID:', tabId);
    return tabId;
  } catch (error) {
    console.error('Failed to open tab:', error);
    throw error;
  }
}

// Navigate to a URL
async function navigate(tabId: string, url: string) {
  try {
    await invoke('browser_navigate', { tabId, url });
    console.log('Navigated to:', url);
  } catch (error) {
    console.error('Failed to navigate:', error);
    throw error;
  }
}

// Go back in history
async function goBack(tabId: string) {
  await invoke('browser_go_back', { tabId });
}

// Go forward in history
async function goForward(tabId: string) {
  await invoke('browser_go_forward', { tabId });
}

// Reload page
async function reload(tabId: string) {
  await invoke('browser_reload', { tabId });
}

// Get current URL
async function getCurrentUrl(tabId: string) {
  const url = await invoke<string>('browser_get_url', { tabId });
  return url;
}

// Get page title
async function getPageTitle(tabId: string) {
  const title = await invoke<string>('browser_get_title', { tabId });
  return title;
}
```

### 4. DOM Element Interaction

```typescript
// Click an element
async function clickElement(tabId: string, selector: string) {
  try {
    await invoke('browser_click', { tabId, selector });
    console.log('Clicked element:', selector);
  } catch (error) {
    console.error('Failed to click element:', error);
    throw error;
  }
}

// Type text into input field
async function typeText(tabId: string, selector: string, text: string) {
  try {
    await invoke('browser_type', { tabId, selector, text });
    console.log('Typed text into:', selector);
  } catch (error) {
    console.error('Failed to type text:', error);
    throw error;
  }
}

// Select dropdown option
async function selectOption(tabId: string, selector: string, value: string) {
  try {
    await invoke('browser_select_option', { tabId, selector, value });
    console.log('Selected option:', value);
  } catch (error) {
    console.error('Failed to select option:', error);
    throw error;
  }
}

// Check checkbox
async function checkCheckbox(tabId: string, selector: string) {
  await invoke('browser_check', { tabId, selector });
}

// Uncheck checkbox
async function uncheckCheckbox(tabId: string, selector: string) {
  await invoke('browser_uncheck', { tabId, selector });
}

// Focus element
async function focusElement(tabId: string, selector: string) {
  await invoke('browser_focus', { tabId, selector });
}

// Hover over element
async function hoverElement(tabId: string, selector: string) {
  await invoke('browser_hover', { tabId, selector });
}

// Scroll element into view
async function scrollIntoView(tabId: string, selector: string) {
  await invoke('browser_scroll_into_view', { tabId, selector });
}
```

### 5. Data Extraction

```typescript
// Get text content from element
async function getElementText(tabId: string, selector: string) {
  try {
    const text = await invoke<string>('browser_get_text', { tabId, selector });
    return text;
  } catch (error) {
    console.error('Failed to get text:', error);
    throw error;
  }
}

// Get attribute value
async function getElementAttribute(
  tabId: string,
  selector: string,
  attribute: string
) {
  try {
    const value = await invoke<string | null>('browser_get_attribute', {
      tabId,
      selector,
      attribute
    });
    return value;
  } catch (error) {
    console.error('Failed to get attribute:', error);
    throw error;
  }
}

// Get all matching elements
async function queryAllElements(tabId: string, selector: string) {
  try {
    const elements = await invoke<any[]>('browser_query_all', {
      tabId,
      selector
    });
    return elements;
  } catch (error) {
    console.error('Failed to query elements:', error);
    throw error;
  }
}
```

### 6. Wait for Elements

```typescript
// Wait for element to appear
async function waitForElement(
  tabId: string,
  selector: string,
  timeoutMs: number = 30000
) {
  try {
    await invoke('browser_wait_for_selector', {
      tabId,
      selector,
      timeoutMs
    });
    console.log('Element found:', selector);
  } catch (error) {
    console.error('Element not found within timeout:', error);
    throw error;
  }
}
```

### 7. Screenshots

```typescript
// Take a screenshot
async function takeScreenshot(tabId: string, fullPage: boolean = false) {
  try {
    const screenshotPath = await invoke<string>('browser_screenshot', {
      tabId,
      fullPage
    });
    console.log('Screenshot saved to:', screenshotPath);
    return screenshotPath;
  } catch (error) {
    console.error('Failed to take screenshot:', error);
    throw error;
  }
}
```

### 8. JavaScript Execution

```typescript
// Execute JavaScript in page context
async function executeScript(tabId: string, script: string) {
  try {
    const result = await invoke<any>('browser_evaluate', {
      tabId,
      script
    });
    return result;
  } catch (error) {
    console.error('Failed to execute script:', error);
    throw error;
  }
}

// Example: Get all links on page
async function getAllLinks(tabId: string) {
  const script = `
    Array.from(document.querySelectorAll('a'))
      .map(a => ({ href: a.href, text: a.textContent }))
  `;
  return await executeScript(tabId, script);
}
```

### 9. Tab Management

```typescript
// List all open tabs
async function listAllTabs() {
  try {
    const tabs = await invoke<any[]>('browser_list_tabs');
    return tabs;
  } catch (error) {
    console.error('Failed to list tabs:', error);
    throw error;
  }
}

// Close a tab
async function closeTab(tabId: string) {
  try {
    await invoke('browser_close_tab', { tabId });
    console.log('Tab closed:', tabId);
  } catch (error) {
    console.error('Failed to close tab:', error);
    throw error;
  }
}
```

## Complete Example: Automated Google Search

```typescript
import { invoke } from '@tauri-apps/api/core';

async function automatedGoogleSearch(query: string) {
  try {
    // 1. Initialize browser automation
    await invoke('browser_init');

    // 2. Launch browser
    const browserId = await invoke<string>('browser_launch', {
      browserType: 'chromium',
      headless: false
    });

    // 3. Open Google
    const tabId = await invoke<string>('browser_open_tab', {
      url: 'https://www.google.com'
    });

    // 4. Wait for search box
    await invoke('browser_wait_for_selector', {
      tabId,
      selector: 'input[name="q"]',
      timeoutMs: 10000
    });

    // 5. Type search query
    await invoke('browser_type', {
      tabId,
      selector: 'input[name="q"]',
      text: query
    });

    // 6. Click search button or press Enter
    await invoke('browser_click', {
      tabId,
      selector: 'input[name="btnK"]'
    });

    // 7. Wait for results
    await invoke('browser_wait_for_selector', {
      tabId,
      selector: '#search',
      timeoutMs: 10000
    });

    // 8. Extract search results
    const results = await invoke<any[]>('browser_query_all', {
      tabId,
      selector: 'div.g'
    });

    console.log('Search results:', results);

    // 9. Take screenshot
    const screenshotPath = await invoke<string>('browser_screenshot', {
      tabId,
      fullPage: true
    });

    console.log('Screenshot saved to:', screenshotPath);

    return {
      results,
      screenshotPath
    };

  } catch (error) {
    console.error('Automated search failed:', error);
    throw error;
  }
}

// Usage
automatedGoogleSearch('AGI Workforce automation');
```

## Complete Example: Form Automation

```typescript
async function automateFormFilling(tabId: string) {
  try {
    // Navigate to form page
    await invoke('browser_navigate', {
      tabId,
      url: 'https://example.com/contact'
    });

    // Wait for form to load
    await invoke('browser_wait_for_selector', {
      tabId,
      selector: 'form#contact-form',
      timeoutMs: 10000
    });

    // Fill out text fields
    await invoke('browser_type', {
      tabId,
      selector: '#name',
      text: 'John Doe'
    });

    await invoke('browser_type', {
      tabId,
      selector: '#email',
      text: 'john@example.com'
    });

    await invoke('browser_type', {
      tabId,
      selector: '#message',
      text: 'This is an automated message from AGI Workforce!'
    });

    // Select dropdown option
    await invoke('browser_select_option', {
      tabId,
      selector: '#topic',
      value: 'general'
    });

    // Check checkbox
    await invoke('browser_check', {
      tabId,
      selector: '#agree-terms'
    });

    // Take screenshot before submission
    await invoke('browser_screenshot', {
      tabId,
      fullPage: false
    });

    // Submit form
    await invoke('browser_click', {
      tabId,
      selector: 'button[type="submit"]'
    });

    // Wait for success message
    await invoke('browser_wait_for_selector', {
      tabId,
      selector: '.success-message',
      timeoutMs: 10000
    });

    // Get success message text
    const successMessage = await invoke<string>('browser_get_text', {
      tabId,
      selector: '.success-message'
    });

    console.log('Form submitted successfully:', successMessage);

  } catch (error) {
    console.error('Form automation failed:', error);
    throw error;
  }
}
```

## React Component Example

```typescript
import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

export function BrowserAutomation() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  const initBrowser = async () => {
    try {
      await invoke('browser_init');
      await invoke('browser_launch', {
        browserType: 'chromium',
        headless: false
      });
      await loadTabs();
    } catch (error) {
      console.error('Failed to initialize browser:', error);
    }
  };

  const loadTabs = async () => {
    try {
      const tabList = await invoke<TabInfo[]>('browser_list_tabs');
      setTabs(tabList);
    } catch (error) {
      console.error('Failed to load tabs:', error);
    }
  };

  const openNewTab = async () => {
    try {
      const tabId = await invoke<string>('browser_open_tab', {
        url: url || 'https://www.google.com'
      });
      setCurrentTabId(tabId);
      await loadTabs();
    } catch (error) {
      console.error('Failed to open tab:', error);
    }
  };

  const closeTab = async (tabId: string) => {
    try {
      await invoke('browser_close_tab', { tabId });
      await loadTabs();
      if (currentTabId === tabId) {
        setCurrentTabId(null);
      }
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  };

  const navigate = async () => {
    if (!currentTabId || !url) return;

    try {
      await invoke('browser_navigate', {
        tabId: currentTabId,
        url
      });
      await loadTabs();
    } catch (error) {
      console.error('Failed to navigate:', error);
    }
  };

  return (
    <div className="browser-automation">
      <div className="controls">
        <button onClick={initBrowser}>Initialize Browser</button>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL..."
        />
        <button onClick={openNewTab}>Open New Tab</button>
        <button onClick={navigate} disabled={!currentTabId}>
          Navigate
        </button>
      </div>

      <div className="tabs">
        <h3>Open Tabs:</h3>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === currentTabId ? 'active' : ''}`}
            onClick={() => setCurrentTabId(tab.id)}
          >
            <span>{tab.title || 'Loading...'}</span>
            <small>{tab.url}</small>
            <button onClick={() => closeTab(tab.id)}>Close</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Best Practices

1. **Always wait for elements** before interacting with them
2. **Use specific selectors** to avoid ambiguity
3. **Handle errors gracefully** with try-catch blocks
4. **Close tabs and browsers** when done to free resources
5. **Use headless mode** for background automation
6. **Add delays** between actions for realistic behavior
7. **Take screenshots** for debugging and verification

## Known Limitations

1. **Playwright Integration**: Current implementation uses Chrome DevTools Protocol directly. Full Playwright integration planned for production.
2. **Extension Communication**: Native messaging between extension and desktop app not yet implemented (WebSocket fallback available).
3. **Multi-Browser Support**: Firefox and WebKit support in progress.
4. **Session Persistence**: Cookie/localStorage persistence to database not yet implemented.

## Future Enhancements

- Full Playwright server integration
- Native messaging with browser extension
- Session persistence and restoration
- Visual element selector tool
- Workflow recording and playback
- Proxy and network interception
- Mobile browser emulation
