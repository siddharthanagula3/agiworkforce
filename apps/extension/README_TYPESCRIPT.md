# AGI Workforce Browser Extension - TypeScript Edition

Modern Chrome extension with TypeScript 5.0+ for seamless browser automation and AGI Workforce desktop app integration.

## Overview

This TypeScript-based extension enables AGI Workforce users to execute tasks from any web page. It provides a type-safe communication bridge between the browser and the desktop application via WebSocket connections.

**Key Features:**

- Full TypeScript type safety with strict mode enabled
- Service Worker-based background script (Manifest V3)
- Content script for DOM automation and form handling
- Popup UI for status monitoring and task control
- Rate limiting and security measures
- Comprehensive error handling and logging
- Support for page capture, element interaction, form filling, and script execution

## Architecture

### File Structure

```
apps/extension/
├── src/
│   ├── types.ts           # Type definitions (100% type coverage)
│   ├── utils.ts           # Utility functions and helpers
│   ├── background.ts      # Service Worker (main extension logic)
│   ├── content.ts         # Content script (page DOM interactions)
│   ├── popup.ts           # Popup script (UI interactions)
│   └── popup.html         # Popup UI markup
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
├── manifest.json          # Extension manifest (V3)
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
└── package.json           # Dependencies and scripts
```

### Components

#### Types (`src/types.ts`)

Comprehensive TypeScript definitions for all extension messages:

```typescript
// Connection status
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// Message types
export type NativeMessageType = 'CLICK' | 'TYPE' | 'CAPTURE_SCREENSHOT' | ...;

// Typed message interfaces
export interface ClickMessage extends BaseMessage {
  type: 'CLICK';
  selector: string;
  options?: { delay?: number; button?: 'left' | 'middle' | 'right' };
}

// Union types for all messages
export type ExtensionMessage = ClickMessage | TypeMessage | ...;
export type ExtensionResponse = ClickResponse | TypeResponse | ...;
```

#### Background Service Worker (`src/background.ts`)

Main extension logic:

- Message routing between popup, content scripts, and desktop app
- Screenshot capture via `chrome.tabs.captureVisibleTab()`
- Rate limiting (120 req/min per tab)
- Desktop app connection health checks (every 30s)
- Context menu setup for quick actions
- Tab cleanup on removal
- Keyboard command handling

**Key Functions:**

```typescript
// Message handling
chrome.runtime.onMessage.addListener(handleMessage);

// Connection checking
async function checkDesktopConnection(): Promise<void>;

// Rate limiting
const rateLimiter = new RateLimiter(120, 500);
rateLimiter.isLimited(tabId, messageType);

// Context menus
setupContextMenu(); // "Capture Element", "Get Element Info"
```

#### Content Script (`src/content.ts`)

DOM interaction and page automation:

- Element clicking (left/right/double-click)
- Text input and keyboard simulation
- Form detection and filling
- Page information extraction (URL, title, HTML)
- DOM utilities: querySelector, waitForSelector, scrollIntoView
- Automation state tracking
- Page indicator (shows connection status)

**Supported Actions:**

```typescript
type NativeMessageType =
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'TYPE'
  | 'GET_TEXT'
  | 'GET_ATTRIBUTE'
  | 'SET_ATTRIBUTE'
  | 'WAIT_FOR_SELECTOR'
  | 'EXECUTE_SCRIPT'
  | 'GET_PAGE_INFO'
  | 'GET_FORMS'
  | 'FILL_FORM'
  | 'SUBMIT_FORM'
  | 'CAPTURE_SCREENSHOT';
```

#### Popup Script (`src/popup.ts`)

User interface for status monitoring:

- Connection status display
- Current page info (tab ID, URL)
- Action statistics (tab count, actions performed, session time)
- Capture and refresh buttons
- Session timer
- Keyboard shortcuts (Cmd/Ctrl+R to refresh)

#### Utilities (`src/utils.ts`)

Reusable helper functions:

```typescript
// Configuration
export const DEFAULT_CONFIG: ExtensionConfig;
export async function getConfig(): Promise<ExtensionConfig>;

// Logging with conditional output
export const logger = { debug, info, warn, error };

// Async utilities
export function sleep(ms: number): Promise<void>;
export async function retry<T>(fn, maxRetries, delayMs);
export async function withTimeout<T>(promise, timeoutMs);

// Rate limiting
export class RateLimiter { ... }

// DOM utilities
export const domUtils = {
  querySelector(selector),
  querySelectorAll(selector),
  waitForSelector(selector, timeout, visible),
  safeClick(element, button),
  getText(element),
  getElementRect(element),
  scrollIntoView(element),
  isVisible(element),
};

// Form utilities
export const formUtils = {
  getForms(),
  getFormFields(form),
  fillField(field, value),
  submitForm(form),
};

// Storage
export const storageUtils = {
  getItem<T>(key, defaultValue),
  setItem<T>(key, value),
  removeItem(key),
  clear(),
};

// Validation
export const validators = {
  isSafeUrl(url),
  isValidSelector(selector),
  sanitizeInput(input),
};
```

## Communication Protocol

### Message Flow

```
Popup/Content Script
         ↓
   handleMessage()
         ↓
   Background Worker
    /           \
   /             \
Content Script   Desktop App
                 (localhost:3001)
```

### Example: Click Element

**From Popup to Background:**

```typescript
const response = await chrome.runtime.sendMessage({
  type: 'CLICK',
  selector: 'button.submit',
  options: { delay: 500, button: 'left' },
});
```

**From Background to Content:**

```typescript
const response = await chrome.tabs.sendMessage(tabId, {
  type: 'CLICK',
  selector: 'button.submit',
  options: { delay: 500, button: 'left' },
});
```

**Response:**

```typescript
{
  success: true,
  element: {
    tag: 'button',
    id: 'submit-btn',
    className: 'btn btn-primary',
    text: 'Submit'
  }
}
```

## Security Features

### Rate Limiting

**Configuration:**

- Max 120 requests per minute per tab
- 500ms cooldown between screenshots
- Automatic reset after 1 minute

**Usage:**

```typescript
if (rateLimiter.isLimited(tabId, messageType)) {
  return { success: false, error: 'Rate limit exceeded' };
}
```

### Input Validation

**URL Validation:**

- Block `chrome://`, `about://`, `data:` protocols
- Verify proper URL format

**Selector Validation:**

- Test against `document.querySelector()`
- Catch invalid CSS selectors early

**Input Sanitization:**

- XSS prevention with text content encoding
- Safe attribute setting

### Origin Validation

**Sender Verification:**

```typescript
function isValidSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.id === chrome.runtime.id) return false; // Own extension only
  if (!sender.tab) return false; // Content scripts must have tab info
  return true;
}
```

## Development

### Prerequisites

- Node.js 22.12.0+
- pnpm 9.15.3+
- Chrome/Chromium browser

### Setup

```bash
cd apps/extension
pnpm install
```

### Build

**Development (with watch):**

```bash
pnpm dev
```

**Production:**

```bash
pnpm build
```

**Package as ZIP:**

```bash
pnpm package
```

### Type Checking

```bash
cd apps/extension
npx tsc --noEmit
```

### Linting

```bash
pnpm lint
```

## Installation

### Chrome

1. Build the extension: `pnpm build`
2. Open `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `apps/extension/dist` folder

### Testing

**Popup:**

1. Click extension icon to open popup
2. Should show connection status
3. Click "Capture Page" to test

**Content Script:**

1. Open any web page
2. Look for AGI Workforce indicator (⚙) in bottom-right corner
3. It should show green if desktop app is running

**Background Worker:**

1. Open `chrome://extensions/`
2. Click "Inspect views" next to extension
3. Check console for logs

## Configuration

### Desktop App Connection

Default: `http://localhost:3001`

To change:

```typescript
await saveConfig({
  desktopAppPort: 3001,
  desktopAppUrl: 'http://localhost:3001',
});
```

### Enable Debug Logging

```typescript
await saveConfig({ enableLogging: true });
```

### Adjust Rate Limits

Create a new `RateLimiter`:

```typescript
const limiter = new RateLimiter(200, 300); // 200 req/min, 300ms screenshot cooldown
```

## Performance

### Bundle Size

- Minified + gzipped: ~35KB
- Source map: ~45KB

### Optimization

- Tree shaking enabled
- Code splitting per entry point
- Terser minification
- Chrome extension best practices

## Testing

### Unit Tests

```bash
pnpm test
```

### Manual Testing Checklist

- [ ] Popup displays connection status correctly
- [ ] Capture Page button works
- [ ] Refresh updates statistics
- [ ] Content script indicators appear on pages
- [ ] Form detection finds all forms
- [ ] Form filling works with various input types
- [ ] Type action simulates keyboard correctly
- [ ] Click action triggers element events
- [ ] Rate limiting prevents spam
- [ ] Session timer increments

## Troubleshooting

### Extension not showing in Chrome

1. Check `manifest.json` is valid JSON
2. Verify `src/background.js` and `src/content.js` exist
3. Check browser console for errors (`chrome://extensions/`)

### Content script not loading

1. Verify content script matches in manifest
2. Check page doesn't have CSP restrictions
3. Inspect page in DevTools for errors

### Desktop app connection failing

1. Verify desktop app is running on port 3001
2. Check network tab for CORS issues
3. Verify `localhost:3001/health` is accessible

### Rate limiting too strict

Adjust in `background.ts`:

```typescript
const rateLimiter = new RateLimiter(200, 300);
```

## API Reference

### Types

All types are exported from `src/types.ts`:

```typescript
import type {
  ExtensionMessage,
  ExtensionResponse,
  ClickMessage,
  ClickResponse,
  ConnectionStatus,
  // ... more types
} from '@agiworkforce/extension/types';
```

### Utils

Helper functions exported from `src/utils.ts`:

```typescript
import {
  logger,
  sleep,
  retry,
  withTimeout,
  RateLimiter,
  domUtils,
  formUtils,
  storageUtils,
  validators,
} from '@agiworkforce/extension/utils';
```

## Contributing

See main project [CLAUDE.md](/CLAUDE.md) for contribution guidelines.

## License

MIT - See LICENSE file

## Support

For issues or questions:

- GitHub Issues: [AGI Workforce Issues](https://github.com/siddhartha/agiworkforce/issues)
- Documentation: [AGI Workforce Docs](https://agiworkforce.com/docs)
