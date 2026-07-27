# Native Messaging Host Setup

The AGI Workforce Chrome extension communicates with the desktop application via
Chrome's native messaging API. The host name is `com.agiworkforce.browser`.

## Prerequisites

- AGI Workforce desktop app must be installed.
- The `native_messaging_host` helper must be bundled with the desktop app.
  Desktop release builds create this helper with
  `pnpm --filter @agiworkforce/desktop run build:native-host`.
- Launch AGI Desktop once before manual installation. On macOS it prepares an
  external, ad-hoc-signed helper without the app sandbox entitlements inherited
  by the bundled sidecar.

## Installation

The desktop app installs the production Chrome Web Store manifest on startup.
For dev/unpacked extensions, the `/pair` handshake sends the runtime extension
ID and the desktop app refreshes the manifest automatically.

Use the manual scripts below only when testing an unpacked extension before the
desktop app has completed pairing.

### macOS / Linux

```bash
apps/extension/native-host/install.sh <EXTENSION_ID> [HOST_PATH]
```

Default helper paths:

- macOS: `~/Library/Application Support/com.agiworkforce.desktop/native_messaging_host`
- Linux: `/opt/agiworkforce/native_messaging_host`

The script writes manifests for Chrome, Chromium, and Edge.

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File apps\extension\scripts\install-native-host.ps1 -ExtensionId <EXTENSION_ID> [-HostPath "C:\Path\to\native_messaging_host.exe"]
```

The PowerShell installer writes the manifest under:

```
%LOCALAPPDATA%\com.agiworkforce.desktop\native-messaging\
```

and registers these HKCU keys:

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.agiworkforce.browser
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.agiworkforce.browser
```

### Installed Manifest Locations

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

Windows uses the registry keys above. The JSON files live under
`%LOCALAPPDATA%\com.agiworkforce.desktop\native-messaging\`.

### Example (completed)

```json
{
  "name": "com.agiworkforce.browser",
  "description": "AGI Workforce Browser Automation Host",
  "path": "/Users/<user>/Library/Application Support/com.agiworkforce.desktop/native_messaging_host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
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
