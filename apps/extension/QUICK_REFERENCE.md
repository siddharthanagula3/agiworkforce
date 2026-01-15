# AGI Workforce Browser Extension - Quick Reference Card

## Essential Information

**Version:** 1.1.0
**Manifest:** V3
**Min Chrome:** 105+

---

## Installation

### Chrome Web Store

```
1. Visit Chrome Web Store
2. Search "AGI Workforce"
3. Click "Add to Chrome"
```

### Manual Install

```bash
cd apps/extension
pnpm install && pnpm build
# Load dist/ folder in chrome://extensions
```

---

## Keyboard Shortcuts

| Action             | Mac           | Windows/Linux  |
| ------------------ | ------------- | -------------- |
| Open Popup         | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Capture Page       | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Refresh (in popup) | `Cmd+R`       | `Ctrl+R`       |

---

## Quick Commands

### From Content Script

```javascript
// Capture screenshot
chrome.runtime.sendMessage({
  type: 'CAPTURE_SCREENSHOT',
  format: 'png',
});

// Get connection status
chrome.runtime.sendMessage({
  type: 'GET_CONNECTION_STATUS',
});
```

### From Background to Content

```javascript
// Click element
chrome.tabs.sendMessage(tabId, {
  type: 'CLICK',
  selector: '#button',
});

// Fill form
chrome.tabs.sendMessage(tabId, {
  type: 'FILL_FORM',
  fields: { name: 'John', email: 'john@example.com' },
});

// Build accessibility tree
chrome.tabs.sendMessage(tabId, {
  type: 'BUILD_ACCESSIBILITY_TREE',
});
```

---

## Common Message Types

### DOM Manipulation

- `CLICK` - Click element
- `TYPE` - Type text
- `FILL_FORM` - Fill multiple fields
- `SCROLL` - Scroll page
- `HOVER` - Hover element

### Data Extraction

- `GET_TEXT` - Get element text
- `GET_ATTRIBUTE` - Get attribute
- `GET_PAGE_INFO` - Get page metadata
- `QUERY_ALL` - Query elements

### Browser Control

- `CAPTURE_SCREENSHOT` - Capture visible area
- `GET_TAB_INFO` - Get tab details
- `CREATE_TAB` - Open new tab
- `GET_COOKIES` - Get cookies

---

## Security Limits

### Rate Limits

- General: 120 requests/min per tab
- Screenshots: 500ms cooldown

### Blocked Domains

- Banking (Chase, Wells Fargo, etc.)
- Payment (PayPal, Stripe, etc.)
- Government (.gov)
- Healthcare

### Blocked Storage Keys

- Tokens, JWTs, auth
- Passwords, secrets, API keys
- Credit cards, payment info
- SSN, private data

---

## Connection Status

### Connected (Green)

✅ Desktop app running
✅ Native messaging active
✅ Full automation available

### Disconnected (Red)

❌ Desktop app not detected
❌ Limited functionality
🔄 Start desktop app

---

## File Locations

### Extension Files

```
apps/extension/
├── dist/           # Build output
├── src/            # Source files
├── icons/          # Extension icons
└── manifest.json   # Configuration
```

### Native Host Manifest

- **Mac:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- **Linux:** `~/.config/google-chrome/NativeMessagingHosts/`
- **Windows:** `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\`

---

## Troubleshooting

### Extension Won't Load

```
1. Check manifest.json syntax
2. Verify Chrome version (105+)
3. Review errors in chrome://extensions
```

### Connection Failed

```
1. Start desktop app
2. Check native host manifest installed
3. Verify extension ID matches
4. Click "Refresh" in popup
```

### Screenshot Fails

```
1. Wait 500ms between captures
2. Ensure tab is visible
3. Check activeTab permission
```

### Rate Limited

```
1. Wait 60 seconds for reset
2. Reduce request frequency
3. Check for infinite loops
```

---

## Build Commands

```bash
# Development (watch mode)
pnpm dev

# Production build
pnpm build

# Clean build artifacts
pnpm clean

# Create distribution ZIP
pnpm package

# Lint code
pnpm lint

# Format code
pnpm format
```

---

## Debug Locations

### Background Logs

```
chrome://extensions → service worker
```

### Content Logs

```
Page DevTools (F12) → Console
```

### Popup Logs

```
Right-click popup → Inspect
```

---

## Documentation Files

| File               | Purpose                 |
| ------------------ | ----------------------- |
| README.md          | Overview & quick start  |
| EXTENSION_GUIDE.md | Developer documentation |
| USER_GUIDE.md      | User documentation      |
| API_REFERENCE.md   | Complete API docs       |
| INSTALL.md         | Installation guide      |
| CHANGELOG.md       | Version history         |
| QUICK_REFERENCE.md | This file               |

---

## Response Format

All API responses follow:

```typescript
{
  success: boolean;
  data?: any;        // On success
  error?: string;    // On failure
}
```

---

## Common Selectors

### CSS Selectors

```javascript
'#id'; // By ID
'.class'; // By class
'tag'; // By tag
'[attr="value"]'; // By attribute
'parent > child'; // Direct child
'parent descendant'; // Descendant
```

### XPath (via helper)

```javascript
// Use findByText utility
window.agiWorkforceUtils.findByText('Submit');
```

---

## Injected Utilities

Available via `window.agiWorkforceUtils`:

```javascript
// Find by text
findByText('button text');

// Get computed styles
getComputedStyles('#element');

// Query shadow DOM
getShadowDomElements('.inside-shadow');

// Simulate key press
simulateKeyPress('Enter', { ctrl: true });
```

---

## Permissions

### Required

- activeTab, tabs, storage
- webNavigation, cookies
- scripting, nativeMessaging
- alarms

### Optional

- downloads, bookmarks, history

### Host

- `<all_urls>` for automation

---

## Status Codes

| Code            | Message                            |
| --------------- | ---------------------------------- |
| ✅ Success      | `success: true`                    |
| ❌ Error        | `success: false, error: "message"` |
| 🚫 Rate Limited | `"Rate limit exceeded"`            |
| 🔒 Blocked      | `"Access blocked for security"`    |
| ⏱️ Timeout      | `"Native message timeout"`         |

---

## Performance Tips

1. **Batch operations** when possible
2. **Build a11y tree** only when needed
3. **Debounce events** for high-frequency ops
4. **Clean up listeners** when done
5. **Use selectors** efficiently

---

## Security Best Practices

1. **Validate inputs** before processing
2. **Sanitize outputs** before displaying
3. **Request minimum** necessary permissions
4. **Audit access** to sensitive operations
5. **Handle errors** gracefully

---

## Support Resources

- **Docs:** See \*.md files in extension folder
- **Website:** https://agiworkforce.com
- **Issues:** GitHub repository
- **Version:** Check chrome://extensions

---

## Quick Stats

| Metric        | Value  |
| ------------- | ------ |
| Documentation | 82+ KB |
| Build time    | ~500ms |
| Build size    | ~45 KB |
| Gzip size     | ~10 KB |
| Message types | 40+    |
| Features      | 20+    |

---

**Last Updated:** 2025-01-15
**Version:** 1.1.0

📖 For detailed information, see [EXTENSION_GUIDE.md](./EXTENSION_GUIDE.md)
