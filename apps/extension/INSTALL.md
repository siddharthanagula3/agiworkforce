# Installation Guide - AGI Workforce Browser Extension

## Quick Install (Chrome Web Store)

**Coming Soon:** Extension will be available on Chrome Web Store

Once published:

1. Visit the extension page on Chrome Web Store
2. Click "Add to Chrome"
3. Click "Add extension" in the confirmation dialog
4. Done! The AGI Workforce icon will appear in your toolbar

---

## Manual Installation (For Development)

### Prerequisites

- Chrome browser version 105 or higher
- AGI Workforce desktop application installed

### Step-by-Step Installation

#### 1. Download the Extension

**Option A: From GitHub Release**

```bash
# Download the latest release
wget https://github.com/yourusername/agiworkforce/releases/latest/download/extension.zip

# Or clone the repository
git clone https://github.com/yourusername/agiworkforce.git
cd agiworkforce/apps/extension
```

**Option B: Build from Source**

```bash
# Navigate to extension directory
cd apps/extension

# Install dependencies
pnpm install

# Build extension
pnpm build

# The extension is now ready in the dist/ folder
```

#### 2. Load Extension in Chrome

**Step 1:** Open Chrome Extensions Page

- Type `chrome://extensions` in address bar and press Enter
- Or go to: Menu → More Tools → Extensions

**Step 2:** Enable Developer Mode

- Find the "Developer mode" toggle in the top-right corner
- Click to enable it (should turn blue/green)

**Step 3:** Load the Extension

- Click "Load unpacked" button (appears after enabling Developer mode)
- Navigate to the extension folder:
  - If built from source: Select `apps/extension/dist` folder
  - If downloaded: Extract ZIP and select the extracted folder
- Click "Select" or "Open"

**Step 4:** Verify Installation

- The AGI Workforce extension should now appear in the extensions list
- You should see the extension icon in your Chrome toolbar
- If not visible, click the puzzle piece icon and pin the extension

#### 3. Configure Extension

**Pin to Toolbar:**

1. Click the puzzle piece icon (Extensions) in Chrome toolbar
2. Find "AGI Workforce Browser Automation"
3. Click the pin icon to keep it visible

**Grant Permissions (if prompted):**

- When first using certain features, Chrome may ask for permissions
- Click "Allow" to enable full functionality

**Connect to Desktop App:**

1. Ensure AGI Workforce desktop application is running
2. Click the extension icon
3. Check that status shows "Connected" (green indicator)

---

## Verification Steps

### 1. Check Extension Status

1. Click the AGI Workforce icon in toolbar
2. Popup should open showing:
   - Connection status
   - Current page information
   - Session statistics

### 2. Test Connection

1. Ensure desktop app is running
2. Open extension popup
3. Status should show "Connected" with green indicator
4. If disconnected, try:
   - Starting/restarting desktop app
   - Clicking "Refresh" button in popup
   - Reloading extension in chrome://extensions

### 3. Test Basic Features

**Capture Screenshot:**

1. Navigate to any web page
2. Click extension icon
3. Click "Capture Page" button
4. Should show "Captured!" confirmation

**Keyboard Shortcut:**

- Press `Cmd+Shift+C` (Mac) or `Ctrl+Shift+C` (Windows/Linux)
- Should capture current page

---

## Troubleshooting Installation

### Extension Won't Load

**Problem:** Error when loading unpacked extension

**Solutions:**

1. **Check manifest.json syntax**
   - Ensure file is valid JSON
   - No trailing commas
   - All quotes properly closed

2. **Verify folder structure**

   ```
   dist/
   ├── manifest.json    (required)
   ├── icons/           (required)
   ├── src/             (required)
   └── assets/          (generated)
   ```

3. **Check Chrome version**
   - Type `chrome://version` in address bar
   - Ensure version is 105 or higher
   - Update Chrome if needed

4. **Review error messages**
   - Click "Errors" button in chrome://extensions
   - Fix any reported issues

### Extension Icon Not Visible

**Problem:** Can't find extension icon in toolbar

**Solution:**

1. Click puzzle piece icon (Extensions) in toolbar
2. Find "AGI Workforce Browser Automation"
3. Click pin icon to make visible
4. Icon should now appear in main toolbar

### "Manifest version 2 is deprecated" Warning

**Problem:** Old manifest version warning

**Solution:**

- This extension uses Manifest V3 (latest)
- If you see this warning, you may be using an old build
- Rebuild from latest source: `pnpm build`

### Native Messaging Connection Failed

**Problem:** Extension shows "Disconnected" status

**Solutions:**

1. **Start Desktop App**
   - Ensure AGI Workforce desktop application is running
   - Not minimized or in system tray only

2. **Check Native Host Manifest**
   - Verify native host manifest is installed
   - Location:
     - **Mac:** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agiworkforce.browser.json`
     - **Linux:** `~/.config/google-chrome/NativeMessagingHosts/com.agiworkforce.browser.json`
     - **Windows:** `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser`

3. **Verify Extension ID**
   - Copy extension ID from chrome://extensions
   - Check it matches in native host manifest
   - Reinstall desktop app if needed

4. **Check Permissions**
   - Ensure nativeMessaging permission granted
   - Review in chrome://extensions → Extension details

### Permission Warnings

**Problem:** Chrome shows permission warnings

**Expected Permissions:**

- "Read and change all your data on all websites" - Required for automation
- "Communicate with cooperating native applications" - For desktop integration
- These are normal and necessary for functionality

**To Review:**

1. Go to chrome://extensions
2. Click "Details" under AGI Workforce extension
3. Scroll to "Permissions" section
4. Review what extension can access

---

## Updating the Extension

### From Chrome Web Store

- Extensions auto-update by default
- Manual update:
  1. Go to chrome://extensions
  2. Enable "Developer mode"
  3. Click "Update" button at top
  4. Wait for update to complete

### Manual Update (Development)

```bash
# Pull latest changes
git pull origin main

# Navigate to extension
cd apps/extension

# Rebuild
pnpm install  # if dependencies changed
pnpm build

# In Chrome:
# 1. Go to chrome://extensions
# 2. Find AGI Workforce extension
# 3. Click reload icon (circular arrow)
```

---

## Uninstalling the Extension

### Complete Uninstall

1. Open chrome://extensions
2. Find "AGI Workforce Browser Automation"
3. Click "Remove"
4. Confirm removal
5. Extension data will be deleted

### Disable Without Uninstalling

1. Open chrome://extensions
2. Find the extension
3. Toggle the switch to disable
4. Can re-enable later without reinstalling

---

## Installation for Different Browsers

### Microsoft Edge

1. Open `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select extension folder
5. Same steps as Chrome

### Brave Browser

1. Open `brave://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select extension folder
5. Same steps as Chrome

### Firefox (Not Currently Supported)

- Extension uses Chrome Manifest V3
- Firefox uses different manifest format
- Support planned for future version

### Safari (Not Supported)

- Safari uses different extension system
- Not compatible with Chrome extensions
- No current plans for Safari support

---

## Post-Installation Setup

### Configure Keyboard Shortcuts

1. Open `chrome://extensions/shortcuts`
2. Find "AGI Workforce Browser Automation"
3. Click pencil icon to edit shortcuts
4. Set preferred key combinations
5. Click outside to save

**Default Shortcuts:**

- Open popup: `Cmd/Ctrl + Shift + A`
- Capture page: `Cmd/Ctrl + Shift + C`

### Set Startup Behavior

1. Open chrome://extensions
2. Click "Details" under AGI Workforce
3. Scroll to "Site access"
4. Choose access level:
   - "On click" - Manual activation (recommended)
   - "On specific sites" - Limit to certain domains
   - "On all sites" - Full automation access

### Configure Extension Settings

- Currently managed by desktop application
- Future versions will have in-extension settings
- Check desktop app preferences for automation options

---

## Getting Help

### Documentation

- **User Guide:** [USER_GUIDE.md](./USER_GUIDE.md)
- **Developer Guide:** [EXTENSION_GUIDE.md](./EXTENSION_GUIDE.md)
- **API Reference:** [API_REFERENCE.md](./API_REFERENCE.md)

### Support Channels

- **Website:** https://agiworkforce.com
- **GitHub Issues:** Report bugs and request features
- **Community Forum:** Ask questions and share tips

### Diagnostic Information

When reporting installation issues, include:

- Chrome version (`chrome://version`)
- Operating system and version
- Extension version (shown in chrome://extensions)
- Error messages from console
- Screenshots of the problem

---

## Security and Privacy

### What Gets Installed

- Extension files in Chrome's extension directory
- No system-level changes
- No additional software
- Native messaging manifest (installed by desktop app)

### Data Storage

- Extension settings stored locally in Chrome
- No cloud storage
- No tracking or analytics
- All data stays on your machine

### Permissions Explained

- **All sites access:** Required for automation on any website
- **Native messaging:** Communication with desktop app only
- **Cookies, tabs, storage:** Standard automation features
- No data sent to external servers

---

**Version:** 1.1.0
**Last Updated:** 2025-01-15
**Supported Browsers:** Chrome 105+, Edge 105+, Brave 105+

For detailed usage instructions, see [USER_GUIDE.md](./USER_GUIDE.md)
