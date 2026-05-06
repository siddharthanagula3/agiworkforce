# Native Messaging Host Setup

The AGI Workforce Chrome extension communicates with the desktop application via
Chrome's native messaging API. The host name is `com.agiworkforce.browser`.

## Prerequisites

- AGI Workforce desktop app must be installed.
- The `agi-workforce-bridge` binary is bundled inside the desktop app package.

## Installation

### 1. Copy the template

Copy `com.agiworkforce.browser.json.template` to the platform-specific location
below and rename it to `com.agiworkforce.browser.json`.

#### macOS

```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agiworkforce.browser.json
```

For Chromium:

```
~/Library/Application Support/Chromium/NativeMessagingHosts/com.agiworkforce.browser.json
```

#### Linux

```
~/.config/google-chrome/NativeMessagingHosts/com.agiworkforce.browser.json
```

For Chromium:

```
~/.config/chromium/NativeMessagingHosts/com.agiworkforce.browser.json
```

#### Windows

Create the following registry key:

```
HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser
```

Set the default value (REG_SZ) to the full path of the installed JSON file, e.g.:

```
C:\Users\<username>\AppData\Local\AGIWorkforce\native-host\com.agiworkforce.browser.json
```

The JSON file content is the same as the template (see below).

### 2. Edit the installed file

Open the installed JSON file and make two substitutions:

**Replace `<EXTENSION_ID_PLACEHOLDER>`** with the actual Chrome extension ID.
After installing from the Chrome Web Store, the extension ID appears in
`chrome://extensions/` under the extension's detail page.

**Replace the `path` value** with the actual path to the `agi-workforce-bridge`
binary on the target machine:

- macOS default: `/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge`
- Linux default: `/opt/agiworkforce/agi-workforce-bridge`
- Windows default: `C:\Program Files\AGI Workforce\agi-workforce-bridge.exe`

### Example (completed)

```json
{
  "name": "com.agiworkforce.browser",
  "description": "AGI Workforce desktop bridge for the Chrome extension",
  "path": "/Applications/AGI Workforce.app/Contents/MacOS/agi-workforce-bridge",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://abcdefghijklmnopqrstuvwxyz123456/"]
}
```

## Verification

After installation, reload the AGI Workforce extension in `chrome://extensions/`
and open the extension's side panel. The connection status indicator should show
"Connected" if the desktop app is running and the host manifest is correct.

If the connection fails, check the Chrome extension console (background service
worker) for `nativeMessaging` error messages.

## Notes

- The `nativeMessaging` permission in `manifest.json` requires this host manifest
  to be installed on each user's machine. Chrome will block the connection with
  "Specified native messaging host not found" if the file is absent.
- The AGI Workforce installer (macOS .dmg / Linux .AppImage / Windows .exe) will
  eventually automate this step. Until then, manual installation is required.
- The HTTP bridge fallback (port 8787) remains available if native messaging is
  not installed; it uses a different code path in `background.ts`.
