# AGI Workforce Browser Extension - API Reference

## Overview

This document provides a complete API reference for the AGI Workforce Browser Extension. It covers all message types, data structures, and APIs exposed by the extension.

**Version:** 1.1.0
**API Version:** 1.0

---

## Table of Contents

- [Message Types](#message-types)
  - [Background → Content](#background--content)
  - [Content → Background](#content--background)
  - [Native Messaging](#native-messaging)
- [Data Structures](#data-structures)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)
- [Security Policies](#security-policies)

---

## Message Types

### Standard Response Format

All API responses follow this structure:

```typescript
interface Response<T = any> {
  success: boolean; // Operation status
  data?: T; // Response payload (on success)
  error?: string; // Error message (on failure)
}
```

---

## Background → Content

Messages sent from background service worker to content scripts.

### DOM Manipulation

#### `CLICK`

Click an element on the page.

**Request:**

```typescript
{
  type: 'CLICK';
  selector: string; // CSS selector
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

**Example:**

```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'CLICK',
  selector: '#submit-button',
});
```

---

#### `DOUBLE_CLICK`

Double-click an element.

**Request:**

```typescript
{
  type: 'DOUBLE_CLICK';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `RIGHT_CLICK`

Right-click an element (context menu).

**Request:**

```typescript
{
  type: 'RIGHT_CLICK';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `TYPE`

Type text into an input field.

**Request:**

```typescript
{
  type: 'TYPE';
  selector: string;       // Target input element
  text: string;           // Text to type
  clearFirst?: boolean;   // Clear existing value (default: true)
  delay?: number;         // Delay between keystrokes in ms (default: 0)
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

**Example:**

```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'TYPE',
  selector: '#email-input',
  text: 'user@example.com',
  clearFirst: true,
  delay: 50,
});
```

---

#### `HOVER`

Hover over an element.

**Request:**

```typescript
{
  type: 'HOVER';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `FOCUS`

Focus an element.

**Request:**

```typescript
{
  type: 'FOCUS';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `BLUR`

Remove focus from element.

**Request:**

```typescript
{
  type: 'BLUR';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

### Form Operations

#### `FILL_FORM`

Fill multiple form fields at once.

**Request:**

```typescript
{
  type: 'FILL_FORM';
  formSelector?: string;           // Optional form selector (uses first form if omitted)
  fields: Record<string, any>;     // Map of field names to values
}
```

**Response:**

```typescript
{
  success: boolean;
  filledFields: string[];          // Names of fields successfully filled
}
```

**Example:**

```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'FILL_FORM',
  formSelector: '#contact-form',
  fields: {
    name: 'John Doe',
    email: 'john@example.com',
    subscribe: true,
  },
});
```

---

#### `SUBMIT_FORM`

Submit a form.

**Request:**

```typescript
{
  type: 'SUBMIT_FORM';
  formSelector?: string;    // Optional (uses first form if omitted)
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `SELECT_OPTION`

Select an option from a dropdown.

**Request:**

```typescript
{
  type: 'SELECT_OPTION';
  selector: string; // Select element selector
  value: string; // Option value to select
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `CHECK`

Check a checkbox.

**Request:**

```typescript
{
  type: 'CHECK';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `UNCHECK`

Uncheck a checkbox.

**Request:**

```typescript
{
  type: 'UNCHECK';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `GET_FORMS`

Get all forms on the page.

**Request:**

```typescript
{
  type: 'GET_FORMS';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: FormInfo[];
}

interface FormInfo {
  index: number;
  id: string | null;
  name: string | null;
  action: string;
  method: string;
  fields: FieldInfo[];
}

interface FieldInfo {
  tagName: string;
  type: string;
  name: string;
  id: string;
  value: any;
  placeholder: string;
  required: boolean;
  disabled: boolean;
  label: string | null;
  selector: string;
}
```

---

### Page Interaction

#### `SCROLL`

Scroll the page.

**Request:**

```typescript
{
  type: 'SCROLL';
  x?: number;              // Horizontal position (default: 0)
  y?: number;              // Vertical position (default: 0)
  smooth?: boolean;        // Smooth scrolling (default: false)
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `SCROLL_TO_ELEMENT`

Scroll element into view.

**Request:**

```typescript
{
  type: 'SCROLL_TO_ELEMENT';
  selector: string;
  smooth?: boolean;                          // Smooth scroll (default: false)
  block?: 'start' | 'center' | 'end';       // Vertical alignment (default: 'center')
  inline?: 'start' | 'center' | 'end';      // Horizontal alignment (default: 'nearest')
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `CLICK_AT_COORDINATES`

Click at specific page coordinates.

**Request:**

```typescript
{
  type: 'CLICK_AT_COORDINATES';
  x: number;                               // X coordinate
  y: number;                               // Y coordinate
  button?: 'left' | 'right';               // Mouse button (default: 'left')
}
```

**Response:**

```typescript
{
  success: boolean;
  element: ElementInfo; // Element that was clicked
}
```

---

#### `DRAG_DROP`

Drag and drop operation.

**Request:**

```typescript
{
  type: 'DRAG_DROP';
  sourceSelector: string; // Element to drag
  targetSelector: string; // Drop target
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

### Data Extraction

#### `GET_TEXT`

Get text content of element.

**Request:**

```typescript
{
  type: 'GET_TEXT';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
  data: string; // Text content (trimmed)
}
```

---

#### `GET_ATTRIBUTE`

Get element attribute value.

**Request:**

```typescript
{
  type: 'GET_ATTRIBUTE';
  selector: string;
  attribute: string; // Attribute name (e.g., 'href', 'class')
}
```

**Response:**

```typescript
{
  success: boolean;
  data: string | null; // Attribute value
}
```

---

#### `SET_ATTRIBUTE`

Set element attribute.

**Request:**

```typescript
{
  type: 'SET_ATTRIBUTE';
  selector: string;
  attribute: string;
  value: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `QUERY_ALL`

Query multiple elements.

**Request:**

```typescript
{
  type: 'QUERY_ALL';
  selector: string;
}
```

**Response:**

```typescript
{
  success: boolean;
  data: ElementInfo[];
}
```

---

#### `GET_ELEMENT_AT_POINT`

Get element at coordinates.

**Request:**

```typescript
{
  type: 'GET_ELEMENT_AT_POINT';
  x: number;
  y: number;
}
```

**Response:**

```typescript
{
  success: boolean;
  data: ElementInfo | null;
}
```

---

#### `GET_PAGE_INFO`

Get comprehensive page information.

**Request:**

```typescript
{
  type: 'GET_PAGE_INFO';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: PageInfo;
}

interface PageInfo {
  url: string;
  title: string;
  faviconUrl: string | null;
  readyState: string;
  scrollPosition: { x: number; y: number };
  viewportSize: { width: number; height: number };
  documentSize: { width: number; height: number };
  meta: Record<string, string>;
}
```

---

#### `GET_PAGE_CONTENT`

Extract page content.

**Request:**

```typescript
{
  type: 'GET_PAGE_CONTENT';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: PageContent;
}

interface PageContent {
  html: string; // Body HTML (cleaned)
  text: string; // Text content
  links: Array<{ text: string; href: string }>;
  images: Array<{ src: string; alt: string }>;
  headings: Array<{ level: number; text: string }>;
}
```

---

### Accessibility

#### `BUILD_ACCESSIBILITY_TREE`

Build semantic accessibility tree.

**Request:**

```typescript
{
  type: 'BUILD_ACCESSIBILITY_TREE';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: AccessibilityNode;
}
```

**See:** [AccessibilityNode](#accessibilitynode) structure

---

#### `GET_FOCUSABLE_ELEMENTS`

Get all focusable elements.

**Request:**

```typescript
{
  type: 'GET_FOCUSABLE_ELEMENTS';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: ElementInfo[];
}
```

---

#### `GET_INTERACTIVE_ELEMENTS`

Get all interactive elements.

**Request:**

```typescript
{
  type: 'GET_INTERACTIVE_ELEMENTS';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: Array<ElementInfo & { role: string; name: string | null }>;
}
```

---

### Storage

#### `GET_LOCAL_STORAGE`

Read from localStorage (restricted keys).

**Request:**

```typescript
{
  type: 'GET_LOCAL_STORAGE';
  key: string; // Required - must specify key
}
```

**Response:**

```typescript
{
  success: boolean;
  data: string | null;
}
```

**Security:** Blocked keys include tokens, passwords, credentials, payment info.

---

#### `SET_LOCAL_STORAGE`

Write to localStorage (restricted keys).

**Request:**

```typescript
{
  type: 'SET_LOCAL_STORAGE';
  key: string;
  value: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

### Action Recording

#### `START_RECORDING`

Begin recording user actions.

**Request:**

```typescript
{
  type: 'START_RECORDING';
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `STOP_RECORDING`

Stop recording and return actions.

**Request:**

```typescript
{
  type: 'STOP_RECORDING';
}
```

**Response:**

```typescript
{
  success: boolean;
  actions: RecordedAction[];
}
```

---

#### `GET_RECORDED_ACTIONS`

Get recorded actions without stopping.

**Request:**

```typescript
{
  type: 'GET_RECORDED_ACTIONS';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: RecordedAction[];
}
```

---

### Utilities

#### `WAIT_FOR_SELECTOR`

Wait for element to appear.

**Request:**

```typescript
{
  type: 'WAIT_FOR_SELECTOR';
  selector: string;
  timeout?: number;          // Timeout in ms (default: 30000)
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

## Content → Background

Messages sent from content scripts to background service worker.

### Connection

#### `PING`

Check background availability.

**Request:**

```typescript
{
  type: 'PING';
}
```

**Response:**

```typescript
{
  success: boolean;
  message: 'pong';
  nativeConnected: boolean;
}
```

---

#### `GET_CONNECTION_STATUS`

Get native messaging connection status.

**Request:**

```typescript
{
  type: 'GET_CONNECTION_STATUS';
}
```

**Response:**

```typescript
{
  success: boolean;
  nativeConnected: boolean;
}
```

---

#### `CONNECT_NATIVE`

Initiate native host connection.

**Request:**

```typescript
{
  type: 'CONNECT_NATIVE';
}
```

**Response:**

```typescript
{
  success: boolean;
  connected: boolean;
}
```

---

### Tab Management

#### `GET_TAB_INFO`

Get current tab information.

**Request:**

```typescript
{
  type: 'GET_TAB_INFO';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: TabInfo;
}
```

---

#### `GET_ALL_TABS`

Get all open tabs.

**Request:**

```typescript
{
  type: 'GET_ALL_TABS';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: TabInfo[];
}
```

---

#### `CREATE_TAB`

Open a new tab.

**Request:**

```typescript
{
  type: 'CREATE_TAB';
  url: string;
  active?: boolean;          // Make active (default: true)
}
```

**Response:**

```typescript
{
  success: boolean;
  data: {
    id: number;
    url: string;
    title: string;
  }
}
```

---

#### `CLOSE_TAB`

Close a tab.

**Request:**

```typescript
{
  type: 'CLOSE_TAB';
  tabId: number;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `SWITCH_TAB`

Switch to a tab.

**Request:**

```typescript
{
  type: 'SWITCH_TAB';
  tabId: number;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

### Cookies

#### `GET_COOKIES`

Get cookies for a URL.

**Request:**

```typescript
{
  type: 'GET_COOKIES';
  url: string; // Required - no wildcard access
}
```

**Response:**

```typescript
{
  success: boolean;
  data: Cookie[];
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict';
  expirationDate?: number;
}
```

**Security:** Blocked for banking, government, healthcare domains.

---

#### `SET_COOKIE`

Set a cookie.

**Request:**

```typescript
{
  type: 'SET_COOKIE';
  cookie: {
    name: string;
    value: string;
    domain: string;
    path?: string;            // Default: '/'
    secure?: boolean;         // Default: true
    httpOnly?: boolean;       // Default: true
    url?: string;            // Optional explicit URL
  };
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

---

#### `CLEAR_COOKIES`

Clear cookies for URL.

**Request:**

```typescript
{
  type: 'CLEAR_COOKIES';
  url: string; // Required
}
```

**Response:**

```typescript
{
  success: boolean;
  cleared: number; // Number of cookies removed
}
```

---

### Capture

#### `CAPTURE_SCREENSHOT`

Capture visible tab area.

**Request:**

```typescript
{
  type: 'CAPTURE_SCREENSHOT';
  format?: 'png' | 'jpeg';   // Default: 'png'
  quality?: number;          // JPEG quality 0-100 (default: 80)
}
```

**Response:**

```typescript
{
  success: boolean;
  data: string; // Data URL (base64 encoded)
}
```

**Rate Limit:** 500ms cooldown between captures

---

#### `GET_ACCESSIBILITY_TREE`

Build and return accessibility tree (via content script).

**Request:**

```typescript
{
  type: 'GET_ACCESSIBILITY_TREE';
}
```

**Response:**

```typescript
{
  success: boolean;
  data: AccessibilityNode;
}
```

---

### Native Messaging

#### `NATIVE_MESSAGE`

Relay message to native host.

**Request:**

```typescript
{
  type: 'NATIVE_MESSAGE';
  payload: any; // Message to send to native host
}
```

**Response:**

```typescript
{
  success: boolean;
  data: any; // Response from native host
}
```

**Timeout:** 30 seconds

---

## Native Messaging

Messages between background script and native host.

### Extension → Native Host

```typescript
{
  id: string;                // Unique request ID
  message: {
    type: string;            // Message type
    [key: string]: any;      // Additional data
  };
}
```

### Native Host → Extension

```typescript
{
  id: string;                // Matching request ID
  [key: string]: any;        // Response data
}
```

### Built-in Events

Extension automatically sends these events to native host:

- `tab_loaded` - When tab finishes loading
- `tab_activated` - When user switches tabs
- `tab_closed` - When tab is closed
- `screenshot` - When screenshot captured
- `accessibility_tree` - When a11y tree generated

---

## Data Structures

### AccessibilityNode

Complete semantic representation of a page element.

```typescript
interface AccessibilityNode {
  id: string; // Unique node ID
  role: string; // ARIA role
  name: string | null; // Accessible name
  value: string | null; // Current value
  description: string | null; // Description
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  focusable: boolean;
  focused: boolean;
  enabled: boolean;
  visible: boolean;
  children: AccessibilityNode[];
  attributes: Record<string, string>;
  tagName: string;
  selector: string; // CSS selector
}
```

---

### ElementInfo

Basic element information.

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

---

### TabInfo

Browser tab information.

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

---

### RecordedAction

User action captured during recording.

```typescript
interface RecordedAction {
  type:
    | 'click'
    | 'type'
    | 'select'
    | 'check'
    | 'uncheck'
    | 'scroll'
    | 'dragdrop'
    | 'focus'
    | 'blur'
    | 'rightclick';
  selector: string | null;
  value?: any;
  timestamp: number;
  elementInfo?: ElementInfo;
}
```

---

## Error Codes

Standard error messages returned in `error` field:

| Error                                                     | Description                   |
| --------------------------------------------------------- | ----------------------------- |
| `"Unknown message type"`                                  | Message type not recognized   |
| `"Invalid sender"`                                        | Message from untrusted source |
| `"Rate limit exceeded"`                                   | Too many requests             |
| `"Screenshot cooldown not elapsed"`                       | Screenshot rate limit         |
| `"Element not found: {selector}"`                         | CSS selector matched nothing  |
| `"No tab ID available"`                                   | Tab context missing           |
| `"Not connected to native host"`                          | Native messaging unavailable  |
| `"Native message timeout"`                                | Native host didn't respond    |
| `"Cookie access for this domain is blocked for security"` | Domain restricted             |
| `"Access to this storage key is not allowed"`             | localStorage key blocked      |
| `"Must specify a URL"`                                    | URL parameter required        |
| `"EVALUATE is disabled for security reasons"`             | JavaScript execution blocked  |

---

## Rate Limits

### General Rate Limit

- **Limit:** 120 requests per minute per tab
- **Window:** 60 seconds (rolling)
- **Tracking:** Per tab ID
- **Exempt Operations:** PING, GET_CONNECTION_STATUS

**Error:** `"Rate limit exceeded"`

### Screenshot Rate Limit

- **Cooldown:** 500ms between captures
- **Tracking:** Per tab ID
- **Purpose:** Prevent resource exhaustion

**Error:** `"Screenshot cooldown not elapsed"`

### Native Messaging

- **Timeout:** 30 seconds per request
- **Pending Limit:** Unlimited (cleared on disconnect)
- **Retry:** Automatic reconnection after 5 seconds

---

## Security Policies

### Blocked Cookie Domains

**Pattern Matching:**

- Banking: `/bank/i`, `/chase/i`, `/wellsfargo/i`, `/citibank/i`
- Payment: `/paypal/i`, `/venmo/i`
- Government: `/\.gov$/i`
- Healthcare: `/healthcare/i`, `/medical/i`, `/health\.com/i`

**Operations Blocked:**

- GET_COOKIES
- SET_COOKIE
- CLEAR_COOKIES

---

### Blocked localStorage Keys

**Pattern Matching:**

- Auth: `/token/i`, `/auth/i`, `/session/i`, `/jwt/i`, `/bearer/i`
- Credentials: `/password/i`, `/secret/i`, `/api.?key/i`, `/credential/i`
- Payment: `/payment/i`, `/credit/i`, `/card/i`, `/stripe/i`
- Personal: `/ssn/i`, `/social.?security/i`, `/private/i`

**Operations Blocked:**

- GET_LOCAL_STORAGE
- SET_LOCAL_STORAGE

---

### Disabled Operations

**Permanently Disabled:**

- `EVALUATE` - Arbitrary JavaScript execution (XSS risk)
- `CLEAR_LOCAL_STORAGE` - Bulk data deletion (destructive)
- Cookie wildcard operations - Must specify URL

---

## Injected Script API

> **SECURITY NOTE:** The `window.agiWorkforceUtils` API was removed in version 1.1.0 for security reasons.
> Injecting utilities into page context exposed internal functionality to potentially malicious page scripts.

**Alternative Approach:**
All functionality previously available through injected utilities is now accessible via the message-based API.
Use the content script messaging system instead:

```javascript
// Use chrome.runtime.sendMessage from extension context
// or postMessage from page context (with verification)

// Example: Finding elements by text (via content script)
chrome.tabs.sendMessage(tabId, {
  type: 'FIND_ELEMENTS',
  selector: "text='Submit'",
});

// Example: Getting computed styles
chrome.tabs.sendMessage(tabId, {
  type: 'GET_ELEMENT_INFO',
  selector: '#header',
});
```

This message-based approach maintains proper security boundaries while providing equivalent functionality.

---

## Versioning

**API Version:** 1.0
**Extension Version:** 1.1.0

**Compatibility:**

- API version remains stable across minor extension updates
- Major API changes increment API version
- Backward compatibility maintained within major version

---

## Support

For questions or issues:

- Developer Guide: [EXTENSION_GUIDE.md](./EXTENSION_GUIDE.md)
- User Guide: [USER_GUIDE.md](./USER_GUIDE.md)
- GitHub: Report issues and request features

---

**Last Updated:** 2025-01-15
**API Version:** 1.0
**Extension Version:** 1.1.0
