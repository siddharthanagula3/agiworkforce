# AGI Workforce Browser Extension - Developer Guide

## Overview

The AGI Workforce Browser Extension is a Chrome Extension Manifest V3 compliant browser automation tool that enables seamless integration between the AGI Workforce desktop application and web browsers. It provides comprehensive browser automation capabilities, accessibility tree extraction, native messaging, and advanced web interaction features.

**Version:** 1.1.0
**Manifest Version:** 3
**Minimum Chrome Version:** 105

## Table of Contents

- [Architecture](#architecture)
- [Core Components](#core-components)
- [Message Passing System](#message-passing-system)
- [Security Features](#security-features)
- [API Reference](#api-reference)
- [Development Setup](#development-setup)
- [Building and Distribution](#building-and-distribution)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Tab                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Web Page (DOM)                          │  │
│  │                                                   │  │
│  │  ┌─────────────────┐    ┌──────────────────┐    │  │
│  │  │  Content Script │◄──►│ Injected Script  │    │  │
│  │  │   (content.js)  │    │  (injected.js)   │    │  │
│  │  └────────▲────────┘    └──────────────────┘    │  │
│  └───────────┼───────────────────────────────────────┘  │
│              │                                           │
└──────────────┼───────────────────────────────────────────┘
               │
               │ Runtime Messages
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│              Background Service Worker                    │
│                  (background.js)                          │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Message     │  │  Native      │  │  Browser APIs │  │
│  │  Router      │  │  Messaging   │  │  (tabs, etc)  │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                           │
└───────────────────────────┬───────────────────────────────┘
                            │
                            │ Native Messaging
                            │
                            ▼
            ┌───────────────────────────────┐
            │  AGI Workforce Desktop App     │
            │  (Native Host)                 │
            └───────────────────────────────┘
```

### Component Interaction Flow

1. **Content Script** - Injected into every web page
   - Builds accessibility tree
   - Performs DOM manipulations
   - Records user actions
   - Communicates with background script

2. **Background Service Worker** - Central hub for all operations
   - Routes messages between components
   - Manages native messaging connection
   - Handles browser API calls (tabs, cookies, screenshots)
   - Implements security policies

3. **Injected Script** - Deep page access utilities
   - Shadow DOM traversal
   - Custom keyboard event simulation
   - Text search across DOM
   - Provides page-level utilities

4. **Native Messaging** - Bridge to desktop application
   - Persistent connection to native host
   - Bidirectional message passing
   - Automatic reconnection on disconnect

5. **Popup UI** - User interface
   - Connection status display
   - Quick actions (capture, refresh)
   - Session statistics
   - Extension information

---

## Core Components

### 1. Background Service Worker (background.js)

**Purpose:** Central message hub, API gateway, and native messaging handler

**Key Features:**

- Native messaging connection management
- Rate limiting (120 requests/minute per tab)
- Cookie access controls with domain blocking
- Screenshot capture with cooldown (500ms)
- Tab lifecycle event tracking
- Security validation and origin checking

**Lifecycle:**

- Persistent connection to native host with auto-reconnect
- Event-driven architecture
- State managed via chrome.storage.local

**Code Structure:**

```javascript
// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRequestsPerMinute: 120,
  screenshotCooldownMs: 500
};

// Security checks
function isValidSender(sender) { ... }
function checkRateLimit(tabId, messageType) { ... }
function isCookieDomainAllowed(urlOrDomain) { ... }

// Native messaging
function connectToNativeHost() { ... }
function sendNativeMessage(message) { ... }
```

### 2. Content Script (content.js)

**Purpose:** DOM interaction, accessibility tree building, action recording

**Key Features:**

- **Accessibility Tree Builder:** Extracts semantic page structure with ARIA roles
- **DOM Manipulation:** Click, type, scroll, drag-drop, form filling
- **Element Discovery:** Query by selector, coordinates, text content
- **Action Recording:** Records user interactions for playback
- **Visual Feedback:** Highlights elements during automation

**Injected Resources:**

- Run at: `document_idle` (after DOM ready)
- Matches: `<all_urls>` (all pages)
- All frames: `false` (main frame only)

**Key Functions:**

```javascript
// Accessibility
buildAccessibilityTree(root, maxDepth);
getElementRole(element);
getAccessibleName(element);
isFocusable(element);

// Actions
handleClick(message, sendResponse);
handleType(message, sendResponse);
handleFillForm(message, sendResponse);

// Recording
handleStartRecording();
handleStopRecording();
recordAction(type, selector, value);
```

### 3. Popup Interface (popup.html + popup.js)

**Purpose:** User-facing extension interface

**Features:**

- Real-time connection status indicator
- Quick capture page functionality
- Session statistics (tabs, actions, time)
- Current page information display
- Keyboard shortcuts (Cmd/Ctrl+C, Cmd/Ctrl+R)

**UI Components:**

- Status card with animated connection indicator
- Action buttons (Capture, Refresh)
- Statistics grid (tabs, actions, session time)
- Page info section

### 4. Injected Script (injected.js)

**Purpose:** Deep page-level utilities that run in page context

**Utilities:**

- `findByText(text)` - Find elements by text content
- `getComputedStyles(selector)` - Get computed CSS styles
- `getShadowDomElements(selector)` - Query shadow DOM
- `simulateKeyPress(key, modifiers)` - Simulate keyboard input

**Access:** Via `window.agiWorkforceUtils` object

---

## Message Passing System

### Architecture

The extension uses Chrome's message passing APIs for communication between components:

```
Content Script ──► chrome.runtime.sendMessage() ──► Background
                                                         │
Background ──► chrome.tabs.sendMessage() ──► Content Script
                                                         │
Background ──► chrome.runtime.connectNative() ──► Native Host
```

### Message Format

All messages follow a consistent structure:

```javascript
{
  type: 'MESSAGE_TYPE',        // Required: Action identifier
  ...additionalData            // Optional: Message-specific data
}

// Response format
{
  success: boolean,            // Required: Operation status
  data?: any,                  // Optional: Response payload
  error?: string               // Optional: Error message
}
```

### Message Types

#### Content → Background

| Type                 | Description                   | Required Fields     | Response                                |
| -------------------- | ----------------------------- | ------------------- | --------------------------------------- |
| `PING`               | Check background availability | -                   | `{ success, message, nativeConnected }` |
| `GET_COOKIES`        | Retrieve cookies for URL      | `url`               | `{ success, data: Cookie[] }`           |
| `SET_COOKIE`         | Set a cookie                  | `cookie`            | `{ success }`                           |
| `CAPTURE_SCREENSHOT` | Capture visible tab           | `format?, quality?` | `{ success, data: dataUrl }`            |
| `GET_TAB_INFO`       | Get current tab details       | -                   | `{ success, data: TabInfo }`            |
| `GET_ALL_TABS`       | List all open tabs            | -                   | `{ success, data: TabInfo[] }`          |
| `CREATE_TAB`         | Open new tab                  | `url, active?`      | `{ success, data: Tab }`                |
| `NATIVE_MESSAGE`     | Relay to native host          | `payload`           | `{ success, data }`                     |

#### Background → Content

| Type                       | Description            | Required Fields                       | Response                      |
| -------------------------- | ---------------------- | ------------------------------------- | ----------------------------- |
| `CLICK`                    | Click element          | `selector`                            | `{ success }`                 |
| `TYPE`                     | Type into element      | `selector, text, clearFirst?, delay?` | `{ success }`                 |
| `GET_TEXT`                 | Get element text       | `selector`                            | `{ success, data: string }`   |
| `FILL_FORM`                | Fill form fields       | `formSelector?, fields: object`       | `{ success, filledFields }`   |
| `BUILD_ACCESSIBILITY_TREE` | Generate a11y tree     | -                                     | `{ success, data: TreeNode }` |
| `START_RECORDING`          | Begin action recording | -                                     | `{ success }`                 |
| `STOP_RECORDING`           | End recording          | -                                     | `{ success, actions }`        |

### Example Usage

**From Content Script:**

```javascript
// Request screenshot from background
const response = await chrome.runtime.sendMessage({
  type: 'CAPTURE_SCREENSHOT',
  format: 'png',
  quality: 90,
});

if (response.success) {
  console.log('Screenshot captured:', response.data);
}
```

**From Background to Content:**

```javascript
// Instruct content script to click element
const [tab] = await chrome.tabs.query({ active: true });
const response = await chrome.tabs.sendMessage(tab.id, {
  type: 'CLICK',
  selector: '#submit-button',
});
```

**Native Messaging:**

```javascript
// Send message to desktop app
const response = await chrome.runtime.sendMessage({
  type: 'NATIVE_MESSAGE',
  payload: {
    action: 'process_data',
    data: {
      /* ... */
    },
  },
});
```

---

## Security Features

### 1. Rate Limiting

**Purpose:** Prevent abuse and resource exhaustion

**Implementation:**

- 120 requests per minute per tab (general)
- 500ms cooldown between screenshots
- Tracking per tab ID
- Automatic reset after 60 seconds

**Exempt Operations:**

- `PING`
- `GET_CONNECTION_STATUS`

**Code:**

```javascript
function checkRateLimit(tabId, messageType) {
  // Check and update rate limit state
  // Returns: { allowed: boolean, reason?: string }
}
```

### 2. Domain Restrictions

**Cookie Access Blocked For:**

- Banking sites (`/bank/i`, `/chase/i`, `/wellsfargo/i`)
- Payment processors (`/paypal/i`, `/stripe/i`)
- Government sites (`/\.gov$/i`)
- Healthcare sites (`/healthcare/i`)

**localStorage Access Blocked For:**

- Auth tokens (`/token/i`, `/auth/i`, `/jwt/i`)
- Credentials (`/password/i`, `/secret/i`, `/api.?key/i`)
- Payment info (`/payment/i`, `/credit/i`, `/card/i`)
- Personal data (`/ssn/i`, `/private/i`)

### 3. Origin Validation

**Sender Validation:**

- Must be from same extension (ID check)
- Must have valid tab context
- Content scripts automatically trusted

**Code:**

```javascript
function isValidSender(sender) {
  if (!sender) return false;
  if (sender.id === chrome.runtime.id) return true;
  if (!sender.tab) return false;
  return true;
}
```

### 4. Content Security Policy

```json
{
  "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
}
```

- Scripts: Only from extension package
- Objects: Restricted
- Styles: Extension + inline (for performance)

### 5. Disabled Operations

**For Security:**

- `EVALUATE` - JavaScript execution (XSS risk)
- `CLEAR_LOCAL_STORAGE` - Bulk data deletion
- Cookie operations without URL specification

---

## API Reference

### Accessibility Tree Node

```typescript
interface AccessibilityNode {
  id: string; // Unique node identifier
  role: string; // ARIA role (button, link, textbox, etc)
  name: string | null; // Accessible name
  value: string | null; // Current value (for inputs)
  description: string | null; // aria-description or title
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  focusable: boolean; // Can receive keyboard focus
  focused: boolean; // Currently focused
  enabled: boolean; // Not disabled
  visible: boolean; // Computed visibility
  children: AccessibilityNode[]; // Child nodes
  attributes: Record<string, string>; // HTML attributes
  tagName: string; // HTML tag name
  selector: string; // CSS selector
}
```

### Tab Information

```typescript
interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  status: 'loading' | 'complete';
}
```

### Element Information

```typescript
interface ElementInfo {
  tagName: string;
  id: string | null;
  classList: string[];
  textContent: string;
  attributes: Record<string, string>;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selector: string;
}
```

### Recorded Action

```typescript
interface RecordedAction {
  type: 'click' | 'type' | 'select' | 'check' | 'uncheck' | 'scroll';
  selector: string | null;
  value?: any;
  timestamp: number;
  elementInfo?: ElementInfo;
}
```

---

## Development Setup

### Prerequisites

- Node.js 22.12.0+
- pnpm 9.15.3+
- Chrome/Edge browser (version 105+)

### Installation

```bash
# Navigate to extension directory
cd apps/extension

# Install dependencies
pnpm install

# Build extension
pnpm build

# Or run in watch mode for development
pnpm dev
```

### Loading in Browser

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `apps/extension/dist` directory
5. Extension icon should appear in toolbar

### Development Workflow

```bash
# Watch mode - auto-rebuild on changes
pnpm dev

# After changes, click reload button in chrome://extensions
```

### File Structure

```
apps/extension/
├── dist/                  # Build output (gitignored)
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/                   # Source files
│   ├── background.js     # Service worker
│   ├── content.js        # Content script
│   ├── injected.js       # Injected utilities
│   ├── popup.html        # Popup UI
│   └── popup.js          # Popup logic
├── manifest.json         # Extension manifest
├── package.json          # NPM config
├── vite.config.ts        # Build config
└── EXTENSION_GUIDE.md    # This file
```

---

## Building and Distribution

### Production Build

```bash
# Build optimized version
pnpm build

# Output: apps/extension/dist/
```

### Build Output

```
dist/
├── manifest.json         # Copied from root
├── icons/                # Copied from root
├── src/
│   ├── background.js    # Bundled service worker
│   ├── content.js       # Bundled content script
│   ├── popup.html       # Copied popup
│   └── popup.js         # Bundled popup script
└── assets/              # Other bundled assets
```

### Packaging for Chrome Web Store

```bash
# 1. Build production version
pnpm build

# 2. Create ZIP archive
cd dist
zip -r ../extension.zip .
cd ..

# 3. Upload extension.zip to Chrome Web Store
```

### Version Management

Update version in **both** files:

- `manifest.json` - Extension version
- `package.json` - NPM version

```json
// manifest.json
{
  "version": "1.1.0"
}

// package.json
{
  "version": "1.1.0"
}
```

---

## Testing

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup opens and displays correct information
- [ ] Connection status updates correctly
- [ ] Screenshot capture works
- [ ] Content script injects on all pages
- [ ] Native messaging connection established
- [ ] Tab management operations succeed
- [ ] Cookie operations respect security restrictions
- [ ] Rate limiting prevents spam
- [ ] Action recording captures events
- [ ] Accessibility tree builds correctly

### Testing Native Messaging

```javascript
// From popup or background console
chrome.runtime
  .sendMessage({
    type: 'CONNECT_NATIVE',
  })
  .then((response) => {
    console.log('Native connected:', response.connected);
  });
```

### Testing Content Script

```javascript
// From any web page console
chrome.runtime
  .sendMessage({
    type: 'BUILD_ACCESSIBILITY_TREE',
  })
  .then((response) => {
    console.log('A11y tree:', response.data);
  });
```

### Debug Logging

**Background Script Logs:**

- Open `chrome://extensions`
- Click "service worker" under extension
- View console logs

**Content Script Logs:**

- Open DevTools on any page (F12)
- View console logs prefixed with extension messages

**Popup Logs:**

- Right-click popup → Inspect
- View console in DevTools

---

## Troubleshooting

### Extension Not Loading

**Symptoms:** Extension missing from toolbar, errors in chrome://extensions

**Solutions:**

1. Check manifest.json syntax (valid JSON)
2. Ensure minimum_chrome_version requirement met
3. Verify all referenced files exist in dist/
4. Check for console errors in background service worker

### Native Messaging Not Working

**Symptoms:** Connection status shows "Disconnected"

**Solutions:**

1. Verify native host is installed and running
2. Check native messaging manifest location
3. Ensure extension ID matches in native host manifest
4. Review native host logs for connection errors
5. Check chrome.runtime.lastError in background console

### Content Script Not Injecting

**Symptoms:** Commands to content script fail, no DOM manipulation

**Solutions:**

1. Check if page matches content_scripts.matches
2. Verify content script loaded in DevTools → Sources
3. Check for CSP errors blocking script injection
4. Ensure page isn't a restricted URL (chrome://, etc)

### Rate Limit Errors

**Symptoms:** "Rate limit exceeded" error messages

**Solutions:**

1. Wait 60 seconds for rate limit reset
2. Reduce request frequency in automation scripts
3. Check for infinite loops sending messages
4. Adjust RATE_LIMIT_CONFIG if needed for development

### Screenshot Capture Fails

**Symptoms:** Screenshot returns error or empty data

**Solutions:**

1. Ensure activeTab permission granted
2. Check screenshot cooldown (500ms between captures)
3. Verify tab is visible and not minimized
4. Check browser capture API support

### Cookie Operations Blocked

**Symptoms:** "Cookie access blocked" error

**Solutions:**

1. Check if domain is in BLOCKED_COOKIE_DOMAINS
2. Verify URL parameter provided (not blank)
3. Ensure host_permissions includes target domain
4. Check if cookies permission granted

---

## Best Practices

### Performance

1. **Minimize Message Passing:** Batch operations when possible
2. **Lazy Load:** Build accessibility tree only when needed
3. **Debounce Events:** Rate limit high-frequency operations
4. **Clean Up:** Remove event listeners when done

### Security

1. **Validate Inputs:** Check message parameters
2. **Sanitize Outputs:** Escape data before displaying
3. **Limit Scope:** Request minimum necessary permissions
4. **Audit Access:** Log sensitive operations

### Reliability

1. **Handle Errors:** Wrap operations in try-catch
2. **Provide Feedback:** Return meaningful error messages
3. **Timeout Operations:** Set timeouts on async operations
4. **Retry Failed:** Implement reconnection logic

### User Experience

1. **Show Status:** Keep users informed of operations
2. **Visual Feedback:** Highlight active elements
3. **Keyboard Shortcuts:** Support common key combinations
4. **Clear Messages:** Use understandable error text

---

## Extension Permissions Explained

### Required Permissions

| Permission        | Purpose                           | API Access                               |
| ----------------- | --------------------------------- | ---------------------------------------- |
| `activeTab`       | Access current tab on user action | tabs.captureVisibleTab, tabs.sendMessage |
| `tabs`            | Query and manage tabs             | tabs.query, tabs.create, tabs.remove     |
| `storage`         | Store extension state             | storage.local API                        |
| `webNavigation`   | Track page navigation             | webNavigation events                     |
| `cookies`         | Read/write cookies                | cookies.get, cookies.set, cookies.remove |
| `scripting`       | Inject scripts dynamically        | scripting.executeScript                  |
| `nativeMessaging` | Communicate with native app       | runtime.connectNative                    |
| `alarms`          | Schedule periodic tasks           | alarms API                               |

### Optional Permissions

| Permission  | Purpose                 | User Prompt  |
| ----------- | ----------------------- | ------------ |
| `downloads` | Download files          | On first use |
| `bookmarks` | Access bookmarks        | On first use |
| `history`   | Access browsing history | On first use |

### Host Permissions

`<all_urls>` - Required for:

- Content script injection on any page
- Cookie access across domains
- Screenshot capture on any site

---

## Support and Resources

- **Documentation:** This file (EXTENSION_GUIDE.md)
- **User Guide:** USER_GUIDE.md
- **API Documentation:** API_REFERENCE.md
- **Chrome Extension Docs:** https://developer.chrome.com/docs/extensions/
- **Manifest V3 Migration:** https://developer.chrome.com/docs/extensions/mv3/intro/

---

## Changelog

### Version 1.1.0

- Enhanced popup UI with modern design
- Added keyboard shortcuts support
- Improved connection status indicators
- Added session statistics tracking
- Enhanced security with rate limiting
- Updated to Manifest V3 best practices
- Added comprehensive documentation

### Version 1.0.0

- Initial release
- Core automation features
- Native messaging support
- Accessibility tree extraction
- Cookie and tab management
