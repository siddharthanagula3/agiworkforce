# AGI Workforce Browser Extension - User Guide

## Welcome

The AGI Workforce Browser Extension bridges your browser with the AGI Workforce desktop application, enabling intelligent browser automation, visual interaction, and seamless workflow integration.

## Installation

### From Chrome Web Store (Recommended)

1. Visit the AGI Workforce extension page on Chrome Web Store
2. Click "Add to Chrome"
3. Confirm by clicking "Add extension"
4. The AGI Workforce icon will appear in your toolbar

### Manual Installation (Development)

1. Download the extension package
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension folder
6. Extension is now active

## Getting Started

### First Launch

1. **Install Desktop App:** Ensure AGI Workforce desktop application is installed and running
2. **Click Extension Icon:** Find the AGI Workforce icon in your browser toolbar
3. **Check Connection:** The popup should show "Connected" status when desktop app is running
4. **Start Automating:** You're ready to use browser automation features!

### Popup Interface Overview

When you click the extension icon, you'll see:

**Connection Status**

- Green indicator: Connected to desktop app
- Red indicator: Desktop app not detected
- Real-time status updates

**Quick Actions**

- **Capture Page (📸):** Takes screenshot of current page and sends to desktop app
- **Refresh (🔄):** Updates all information and connection status

**Statistics**

- **Tabs:** Number of open browser tabs
- **Actions:** Count of automation actions performed this session
- **Session:** Time elapsed since extension started

**Current Page Info**

- Tab ID: Unique identifier for current tab
- URL: Current page address (shortened)
- Version: Extension version number

## Features

### 1. Browser Automation

The extension enables the AGI Workforce desktop app to:

- **Click Elements:** Interact with buttons, links, and other clickable items
- **Fill Forms:** Automatically populate form fields with data
- **Type Text:** Enter text into input fields and text areas
- **Navigate:** Open, close, and switch between tabs
- **Scroll:** Control page scrolling programmatically
- **Extract Data:** Read text, attributes, and page content

### 2. Visual Capture

**Screenshot Capture:**

- High-quality PNG screenshots of visible page area
- Automatic transmission to desktop app
- Quick access via popup button or keyboard shortcut

**Keyboard Shortcut:**

- Mac: `Cmd + Shift + C`
- Windows/Linux: `Ctrl + Shift + C`

### 3. Page Intelligence

**Accessibility Tree:**

- Semantic understanding of page structure
- Identifies interactive elements automatically
- Extracts ARIA roles and labels
- Used by desktop app for intelligent automation

**Element Discovery:**

- Find elements by text content
- Query by CSS selector
- Locate by coordinates
- Search shadow DOM

### 4. Action Recording

**Record Your Actions:**

- Records clicks, typing, form filling
- Captures sequence of user interactions
- Enables workflow replay by desktop app

**How to Use:**

1. Desktop app starts recording mode
2. Perform actions in browser normally
3. Extension captures all interactions
4. Desktop app receives recorded sequence

### 5. Cookie Management

**Controlled Access:**

- Read cookies for specific domains
- Set cookies programmatically
- Security restrictions on sensitive sites

**Protected Sites:**

- Banking and financial sites blocked
- Government domains restricted
- Healthcare sites protected
- Payment processors secured

### 6. Session State

**Persistent Data:**

- Connection status saved
- Action count tracked
- Session statistics maintained
- Survives browser restart

## Keyboard Shortcuts

| Action         | Mac                  | Windows/Linux         |
| -------------- | -------------------- | --------------------- |
| Open Popup     | `Cmd + Shift + A`    | `Ctrl + Shift + A`    |
| Capture Page   | `Cmd + Shift + C`    | `Ctrl + Shift + C`    |
| Refresh Status | `Cmd + R` (in popup) | `Ctrl + R` (in popup) |

**Customize Shortcuts:**

1. Go to `chrome://extensions/shortcuts`
2. Find "AGI Workforce Browser Automation"
3. Click pencil icon to edit shortcuts
4. Save changes

## Connection Status

### Connected (Green)

**Indicators:**

- Green pulsing dot in popup
- "Connected" status text
- "Desktop app is active" subtitle

**What It Means:**

- Native messaging bridge established
- Desktop app can send commands
- Automation features fully operational

**What You Can Do:**

- All automation features available
- Screenshots automatically forwarded
- Tab events sent to desktop app

### Disconnected (Red)

**Indicators:**

- Red pulsing dot in popup
- "Disconnected" status text
- "Desktop app not detected" subtitle

**What It Means:**

- Desktop app not running or not responding
- Native messaging unavailable
- Limited functionality

**What You Can Do:**

- Basic browser features still work
- Screenshots saved but not forwarded
- Start desktop app to restore connection

**Troubleshooting:**

1. Ensure AGI Workforce desktop app is running
2. Check desktop app is not minimized/closed
3. Restart desktop app if needed
4. Click "Refresh" button in extension popup
5. Restart browser if problem persists

## Privacy and Security

### What the Extension Can Access

**Required Permissions:**

- **Active Tab:** Current tab content when you click extension icon
- **All Sites:** Needed for automation on any website
- **Cookies:** Read/write cookies (with restrictions)
- **Native Messaging:** Communication with desktop app
- **Storage:** Save extension settings and statistics

### What the Extension Does NOT Do

- ❌ Does not collect browsing history
- ❌ Does not track personal information
- ❌ Does not send data to external servers
- ❌ Does not access cookies on sensitive sites
- ❌ Does not store passwords or credentials
- ❌ Does not run without desktop app control

### Security Features

**Rate Limiting:**

- Maximum 120 requests per minute per tab
- 500ms cooldown between screenshots
- Prevents resource abuse

**Domain Restrictions:**

- Banking sites blocked from cookie access
- Government sites protected
- Payment processors secured
- Healthcare data protected

**Data Protection:**

- Auth tokens cannot be read via localStorage
- Passwords blocked from access
- Credit card data protected
- Social security numbers blocked

**Origin Validation:**

- All messages validated for source
- External scripts cannot send commands
- Content script injection controlled

## Best Practices

### For Optimal Performance

1. **Keep Desktop App Running:** Maintain connection for best experience
2. **Close Unused Tabs:** Improves browser performance
3. **Update Regularly:** Install extension updates when available
4. **Monitor Statistics:** Check action count and session time

### For Security

1. **Review Permissions:** Understand what extension can access
2. **Use on Trusted Sites:** Be cautious on unfamiliar websites
3. **Keep Updated:** Security patches in new versions
4. **Report Issues:** Contact support if suspicious activity

### For Reliability

1. **Stable Connection:** Ensure desktop app stays connected
2. **Avoid Spam Clicking:** Respect rate limits
3. **Wait for Operations:** Let actions complete before next command
4. **Refresh on Errors:** Use refresh button if issues occur

## Troubleshooting

### Extension Not Appearing

**Problem:** Can't find extension icon in toolbar

**Solution:**

1. Click puzzle piece icon in Chrome toolbar
2. Find "AGI Workforce Browser Automation"
3. Click pin icon to add to toolbar

### Connection Keeps Dropping

**Problem:** Status switches between connected and disconnected

**Solution:**

1. Check desktop app is running and responsive
2. Verify no firewall blocking native messaging
3. Restart both browser and desktop app
4. Reinstall extension if persists

### Screenshots Not Working

**Problem:** Capture button shows error

**Solution:**

1. Ensure tab is visible (not minimized)
2. Check not on restricted page (chrome://, etc)
3. Wait 500ms between screenshots (cooldown)
4. Grant "activeTab" permission if prompted

### Automation Commands Failing

**Problem:** Desktop app can't control browser

**Solution:**

1. Verify connection status is green
2. Check page loaded completely
3. Ensure not on restricted site
4. View browser console for error messages
5. Restart extension via chrome://extensions

### High CPU Usage

**Problem:** Browser slow with extension active

**Solution:**

1. Check action count - may be too many operations
2. Close unnecessary tabs
3. Restart browser to clear state
4. Check desktop app not sending spam commands

### Cookie Operations Blocked

**Problem:** "Cookie access blocked" error

**Solution:**

- This is intentional for security
- Banking, government, and sensitive sites protected
- Cannot be overridden
- Use different method if needed

## FAQ

**Q: Does the extension work without the desktop app?**
A: Basic features work (popup, statistics), but automation requires desktop app connection.

**Q: Can I use this extension on mobile?**
A: No, Chrome extensions are not supported on mobile browsers. Desktop only.

**Q: Is my browsing data sent to the cloud?**
A: No, all communication is local between extension and desktop app via native messaging.

**Q: Why does it need access to "all sites"?**
A: Required for content script injection to enable automation on any website you visit.

**Q: Can I disable it on specific sites?**
A: Yes, right-click extension icon → "This can read and change site data" → Choose option.

**Q: Does it work in Incognito mode?**
A: Only if you enable "Allow in Incognito" in chrome://extensions.

**Q: How do I uninstall?**
A: Go to chrome://extensions, find AGI Workforce, click "Remove".

**Q: Will it slow down my browser?**
A: Minimal impact. Content script is lightweight and only activates when needed.

**Q: Can multiple extensions conflict?**
A: Rare, but other automation extensions might interfere. Disable conflicting ones.

**Q: Is the extension open source?**
A: Check the AGI Workforce repository for source code and contribution guidelines.

## Support

### Get Help

**Documentation:**

- Extension Guide (for developers): EXTENSION_GUIDE.md
- API Reference: API_REFERENCE.md
- Desktop App Docs: See main application documentation

**Support Channels:**

- Website: https://agiworkforce.com
- GitHub Issues: Report bugs and request features
- Community Forum: Ask questions and share tips

**Diagnostic Information:**

When reporting issues, include:

- Extension version (shown in popup)
- Chrome version (chrome://version)
- Operating system
- Connection status
- Error messages from console
- Steps to reproduce

### Updates

**Automatic Updates:**

- Chrome auto-updates extensions from Web Store
- Check for updates manually in chrome://extensions

**What's New:**

- View changelog in EXTENSION_GUIDE.md
- Release notes on GitHub
- Update notifications in desktop app

## Advanced Usage

### Developer Mode

Enable for advanced features:

1. Go to chrome://extensions
2. Enable "Developer mode"
3. Access background console via "service worker"
4. View content script logs in page DevTools

### Manual Message Sending

From page console:

```javascript
// Test connection
chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
  console.log('Extension response:', response);
});

// Capture screenshot
chrome.runtime.sendMessage(
  {
    type: 'CAPTURE_SCREENSHOT',
    format: 'png',
  },
  (response) => {
    if (response.success) {
      console.log('Screenshot URL:', response.data);
    }
  },
);
```

### Custom Automation Scripts

The desktop app can send custom commands:

- Use documented message types
- Respect rate limits
- Handle errors gracefully
- Provide user feedback

## Tips and Tricks

1. **Pin the Extension:** Keep icon visible in toolbar for quick access
2. **Use Keyboard Shortcuts:** Faster than clicking icon
3. **Monitor Session Stats:** Track automation efficiency
4. **Check Connection First:** Green status = ready to automate
5. **Refresh on Problems:** Quick fix for most issues
6. **Read Console Logs:** Helpful for debugging automation
7. **Close Popup After Capture:** Popup auto-updates, no need to keep open
8. **Update Desktop App:** Keep both extension and app in sync

## Glossary

- **Content Script:** Code injected into web pages
- **Background Script:** Extension's central message hub
- **Native Messaging:** Communication bridge to desktop app
- **Accessibility Tree:** Semantic page structure
- **Service Worker:** Background script in Manifest V3
- **Tab ID:** Unique identifier for browser tab
- **Host Permissions:** Access to website domains
- **Rate Limiting:** Request throttling for security

---

**Version:** 1.1.0
**Last Updated:** 2025-01-15
**Compatible With:** Chrome 105+, Edge 105+

For developer documentation, see [EXTENSION_GUIDE.md](./EXTENSION_GUIDE.md)
