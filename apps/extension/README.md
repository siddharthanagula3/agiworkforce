# AGI Workforce Browser Extension

> Intelligent browser automation and integration for AGI Workforce desktop application

[![Manifest](https://img.shields.io/badge/manifest-v3-brightgreen)](manifest.json)
[![Chrome](https://img.shields.io/badge/chrome-105%2B-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## Overview

The AGI Workforce Browser Extension enables seamless integration between your browser and the AGI Workforce desktop application. It provides comprehensive browser automation, accessibility tree extraction, native messaging, and intelligent page interaction capabilities.

**Key Features:**

- Browser automation (click, type, form filling, navigation)
- Accessibility tree extraction for semantic understanding
- Native messaging bridge to desktop app
- Screenshot capture and page analysis
- Action recording and playback
- Security-hardened with rate limiting and domain restrictions

## Quick Start

### Installation

#### From Chrome Web Store

1. Visit [AGI Workforce Extension](https://chrome.google.com/webstore) (link TBD)
2. Click "Add to Chrome"
3. Confirm installation

#### Manual Installation (Development)

```bash
# Navigate to extension directory
cd apps/extension

# Install dependencies
pnpm install

# Build extension
pnpm build

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select apps/extension/dist folder
```

### Development

```bash
# Watch mode - auto-rebuild on changes
pnpm dev

# Build for production
pnpm build
```

## Documentation

- **[Extension Guide](./EXTENSION_GUIDE.md)** - Complete developer documentation
- **[User Guide](./USER_GUIDE.md)** - End-user instructions and features
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation

## Features

### Browser Automation

- **DOM Manipulation:** Click, type, scroll, hover, focus
- **Form Operations:** Fill forms, select options, check/uncheck
- **Navigation:** Tab management, URL navigation
- **Element Discovery:** Query by selector, text, coordinates

### Accessibility

- **Semantic Tree:** Extract complete accessibility tree with ARIA roles
- **Smart Selection:** Find interactive and focusable elements
- **Context Awareness:** Understand page structure semantically

### Visual Capture

- **Screenshots:** High-quality PNG/JPEG capture
- **Rate Limited:** 500ms cooldown for resource protection
- **Auto-Forward:** Sends captures to desktop app

### Action Recording

- **Record & Replay:** Capture user interactions
- **Event Tracking:** Clicks, typing, form filling, scrolling
- **Workflow Creation:** Enable automation workflow generation

### Security

- **Rate Limiting:** 120 requests/min per tab
- **Domain Restrictions:** Banking, government, healthcare protected
- **Storage Protection:** Sensitive keys blocked from access
- **Origin Validation:** All messages validated for source

## Architecture

```
┌─────────────────────────────────────┐
│         Browser Tab                 │
│  ┌───────────────────────────────┐  │
│  │     Content Script            │  │
│  │    (DOM Interaction)          │  │
│  └────────────┬──────────────────┘  │
└───────────────┼─────────────────────┘
                │ Messages
                ▼
┌───────────────────────────────────────┐
│    Background Service Worker         │
│  ┌──────────────┐  ┌───────────────┐ │
│  │  Message     │  │  Native       │ │
│  │  Router      │  │  Messaging    │ │
│  └──────────────┘  └───────────────┘ │
└───────────────┬───────────────────────┘
                │ Native Protocol
                ▼
    ┌────────────────────────────┐
    │  AGI Workforce Desktop     │
    │  (Native Host)             │
    └────────────────────────────┘
```

## Usage Examples

### Send Message from Content Script

```javascript
// Capture screenshot
const response = await chrome.runtime.sendMessage({
  type: 'CAPTURE_SCREENSHOT',
  format: 'png',
  quality: 90,
});

if (response.success) {
  console.log('Screenshot captured:', response.data);
}
```

### Control from Desktop App (via Background)

```javascript
// Click element via content script
const response = await chrome.tabs.sendMessage(tabId, {
  type: 'CLICK',
  selector: '#submit-button',
});

if (response.success) {
  console.log('Element clicked successfully');
}
```

### Build Accessibility Tree

```javascript
const response = await chrome.tabs.sendMessage(tabId, {
  type: 'BUILD_ACCESSIBILITY_TREE',
});

console.log('Page structure:', response.data);
```

## Message Types

### Common Operations

| Operation       | Type                       | Description               |
| --------------- | -------------------------- | ------------------------- |
| Click           | `CLICK`                    | Click an element          |
| Type            | `TYPE`                     | Type into input field     |
| Fill Form       | `FILL_FORM`                | Fill multiple form fields |
| Screenshot      | `CAPTURE_SCREENSHOT`       | Capture visible area      |
| Get Page Info   | `GET_PAGE_INFO`            | Extract page metadata     |
| Build A11y Tree | `BUILD_ACCESSIBILITY_TREE` | Generate semantic tree    |

See [API Reference](./API_REFERENCE.md) for complete message documentation.

## Security

### Rate Limits

- **General:** 120 requests/minute per tab
- **Screenshots:** 500ms cooldown between captures

### Protected Domains

Cookie and storage operations blocked on:

- Banking sites (Chase, Wells Fargo, etc.)
- Payment processors (PayPal, Stripe, etc.)
- Government sites (.gov domains)
- Healthcare sites

### Blocked Storage Keys

localStorage access restricted for:

- Auth tokens, JWTs, session IDs
- Passwords, API keys, secrets
- Credit card data, payment info
- Social security numbers, private data

## File Structure

```
apps/extension/
├── dist/                      # Build output
├── icons/                     # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/                       # Source files
│   ├── background.js         # Service worker
│   ├── content.js            # Content script
│   ├── injected.js           # Injected utilities
│   ├── popup.html            # Popup UI
│   └── popup.js              # Popup logic
├── manifest.json             # Extension manifest
├── package.json              # NPM config
├── vite.config.ts            # Build configuration
├── EXTENSION_GUIDE.md        # Developer guide
├── USER_GUIDE.md             # User documentation
├── API_REFERENCE.md          # API documentation
└── README.md                 # This file
```

## Development

### Prerequisites

- Node.js 22.12.0+
- pnpm 9.15.3+
- Chrome 105+ or Edge 105+

### Build Commands

```bash
# Install dependencies
pnpm install

# Development mode (watch)
pnpm dev

# Production build
pnpm build
```

### Testing

1. Load extension in Chrome (see Installation)
2. Open popup to verify connection
3. Test automation on web pages
4. Check console logs for errors
5. Monitor native messaging connection

### Debugging

**Background Script:**

- Open chrome://extensions
- Click "service worker" under extension
- View console logs

**Content Script:**

- Open DevTools on any page (F12)
- View console logs

**Popup:**

- Right-click popup → Inspect
- View console in DevTools

## Permissions

### Required

- `activeTab` - Access current tab on user action
- `tabs` - Query and manage tabs
- `storage` - Store extension state
- `webNavigation` - Track page navigation
- `cookies` - Read/write cookies (restricted)
- `scripting` - Inject scripts dynamically
- `nativeMessaging` - Communicate with desktop app
- `alarms` - Schedule periodic tasks

### Optional

- `downloads` - Download files
- `bookmarks` - Access bookmarks
- `history` - Access browsing history

### Host Permissions

- `<all_urls>` - Required for content script injection and automation

## Browser Support

| Browser | Minimum Version | Status                                     |
| ------- | --------------- | ------------------------------------------ |
| Chrome  | 105+            | ✅ Supported                               |
| Edge    | 105+            | ✅ Supported                               |
| Brave   | 105+            | ✅ Supported                               |
| Firefox | -               | ❌ Not supported (Manifest V3 differences) |
| Safari  | -               | ❌ Not supported                           |

## Troubleshooting

### Extension Not Loading

- Check manifest.json syntax
- Verify all files exist in dist/
- Review chrome://extensions for errors

### Native Messaging Issues

- Ensure desktop app is running
- Check native host manifest installation
- Verify extension ID matches in native manifest

### Automation Commands Failing

- Check connection status (green = connected)
- Verify page loaded completely
- Review console logs for errors

See [User Guide](./USER_GUIDE.md#troubleshooting) for detailed troubleshooting.

## Contributing

Contributions are welcome! Please:

1. Read the [Extension Guide](./EXTENSION_GUIDE.md)
2. Follow existing code style
3. Add tests for new features
4. Update documentation
5. Submit pull request

## License

[MIT License](../../LICENSE) - See main repository license

## Support

- **Documentation:** See guides in this directory
- **Issues:** Report on GitHub
- **Website:** https://agiworkforce.com

## Changelog

### Version 1.1.0 (Current)

- Enhanced popup UI with modern design
- Added keyboard shortcuts (Cmd/Ctrl+C, Cmd/Ctrl+A)
- Improved connection status indicators
- Added session statistics tracking
- Enhanced security with rate limiting
- Comprehensive documentation added
- Updated to Manifest V3 best practices

### Version 1.0.0

- Initial release
- Core automation features
- Native messaging support
- Accessibility tree extraction
- Cookie and tab management

---

**Version:** 1.1.0
**Manifest Version:** 3
**Minimum Chrome:** 105+
**Last Updated:** 2025-01-15

For detailed information, see [EXTENSION_GUIDE.md](./EXTENSION_GUIDE.md)
