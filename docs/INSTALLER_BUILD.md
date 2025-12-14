# Windows Installer Build Guide

## Overview

Developer-preview note: installers are **not published or signed**. Use this guide only if you need to generate local unsigned Windows packages (NSIS `.exe` / MSI `.msi`) from the current source. Expect SmartScreen warnings on unsigned builds.

## Prerequisites

### Required Software

1. **Node.js** (v20.11.0 or higher)
   - Verify: `node --version`

2. **pnpm** (v9.15.0 or higher)
   - Install: `npm install -g pnpm`
   - Verify: `pnpm --version`

3. **Rust** (1.90.0 or higher)
   - Install from: https://rustup.rs/
   - Verify: `rustc --version`

4. **WebView2** (Microsoft Edge WebView2 Runtime)
   - Usually pre-installed on Windows 10+
   - Download from: https://developer.microsoft.com/microsoft-edge/webview2/

5. **Visual Studio Build Tools** (C++ compiler)
   - Install from: https://visualstudio.microsoft.com/downloads/
   - Required components: "Desktop development with C++"

6. **NSIS** (for `.exe` installer)
   - Install from: https://nsis.sourceforge.io/Download
   - Add to PATH: `C:\Program Files (x86)\NSIS`

7. **WiX Toolset** (for `.msi` installer, optional)
   - Install from: https://wixtoolset.org/releases/
   - Version 3.x required

## Current Configuration

### Tauri Settings

**File**: `apps/desktop/src-tauri/tauri.conf.json`

```json
{
  "productName": "AGI Workforce",
  "version": "5.0.0",
  "identifier": "com.agiworkforce.desktop",
  "bundle": {
    "active": true,
    "targets": "all",
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

- **Product Name**: AGI Workforce
- **Version**: 5.0.0 (update in `apps/desktop/package.json` and `tauri.conf.json`)
- **App Identifier**: com.agiworkforce.desktop
- **Bundle Targets**: `all` (builds NSIS and MSI)

## Build Commands

### From Repository Root

```bash
# Build installer (recommended method)
pnpm build:desktop

# Alternative: Using filter
pnpm --filter @agiworkforce/desktop build
```

### From apps/desktop Directory

```bash
cd apps/desktop

# Build installer
pnpm build

# Build with specific target
pnpm tauri build --target x86_64-pc-windows-msvc

# Build debug version
pnpm tauri build --debug
```

## Build Process

When you run the build command, Tauri executes these steps:

1. **Frontend Build** (`beforeBuildCommand`)
   - Runs: `cd ../.. && pnpm --filter @agiworkforce/desktop run build:web`
   - Compiles TypeScript → JavaScript
   - Bundles React app with Vite
   - Outputs to: `apps/desktop/dist/`

2. **Rust Backend Build**
   - Compiles Rust code in release mode
   - Links Windows APIs and dependencies
   - Outputs to: `apps/desktop/src-tauri/target/release/`

3. **Installer Generation**
   - Creates NSIS installer (`.exe`)
   - Creates MSI installer (`.msi`) if WiX is installed
   - Outputs to bundle directories

## Output Locations

After a successful build, installers are located at:

```
apps/desktop/src-tauri/target/release/bundle/
├── nsis/
│   └── AGI Workforce_5.0.0_x64-setup.exe
└── msi/
    └── AGI Workforce_5.0.0_x64_en-US.msi
```

**Raw executable** (without installer):

```
apps/desktop/src-tauri/target/release/agiworkforce-desktop.exe
```

## Code Signing (NOT CONFIGURED)

Currently, code signing is **not configured**. The installers are unsigned.

### What's Missing for Signed Installers

1. **Code Signing Certificate**
   - Purchase from: DigiCert, Sectigo, or other CA
   - Install certificate to Windows certificate store

2. **Certificate Configuration**
   - Set `certificateThumbprint` in `tauri.conf.json`
   - Or use environment variable: `TAURI_SIGNING_CERT_THUMBPRINT`

3. **signtool.exe** (included with Windows SDK)
   - Tauri uses this automatically if configured

### Enabling Code Signing

Update `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT_HERE",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

Or set environment variable:

```powershell
$env:TAURI_SIGNING_CERT_THUMBPRINT = "YOUR_CERT_THUMBPRINT"
pnpm build:desktop
```

## Security Configuration

### Content Security Policy (CSP)

CSP is configured in `tauri.conf.json` to allow:

- Self-hosted resources
- OpenAI, Anthropic, Google AI APIs
- Microsoft Graph, GitHub, Slack APIs
- AGI Workforce domains (\*.agiworkforce.com)

### Auto-Updater

**Status**: Disabled

The Tauri updater plugin is intentionally disabled in `Cargo.toml` because signature verification is not yet implemented. Do not enable the updater without proper signature verification.

```toml
# NOTE: Updater disabled for public beta due to unimplemented signature verification
# If re-enabling, MUST implement proper Ed25519/RSA signature verification first
# tauri-plugin-updater = "2.0.0"
```

## Troubleshooting

### Build Fails with "WebView2 not found"

Install Microsoft Edge WebView2 Runtime:
https://developer.microsoft.com/microsoft-edge/webview2/

### Build Fails with Rust Compilation Errors

1. Update Rust: `rustup update`
2. Clean build artifacts: `cargo clean` (in `apps/desktop/src-tauri/`)
3. Rebuild: `pnpm build:desktop`

### NSIS Installer Not Generated

1. Verify NSIS is installed: `makensis /VERSION`
2. Add NSIS to PATH
3. Rebuild

### MSI Installer Not Generated

1. Install WiX Toolset v3.x
2. Add WiX to PATH
3. Rebuild

### Frontend Build Fails

```bash
# Clean node_modules and reinstall
cd apps/desktop
rm -rf node_modules
pnpm install
pnpm build:web
```

## CI/CD Integration

For GitHub Actions or other CI:

```yaml
- name: Install Tauri dependencies
  run: |
    # Install Rust
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # Install pnpm
    npm install -g pnpm
    # Install dependencies
    pnpm install --frozen-lockfile

- name: Build Windows Installer
  run: pnpm build:desktop

- name: Upload Installer
  uses: actions/upload-artifact@v3
  with:
    name: windows-installer
    path: apps/desktop/src-tauri/target/release/bundle/nsis/*.exe
```

## Next Steps for Public Beta

### Required Before Public Release

1. **Code Signing Certificate**
   - Purchase and install certificate
   - Configure in Tauri

2. **Version Bumping Strategy**
   - Establish semver policy
   - Sync versions across `package.json` and `tauri.conf.json`

3. **Release Notes**
   - Generate changelog
   - Document known issues

4. **Testing Checklist**
   - Install on clean Windows 10/11 machines
   - Verify WebView2 bootstrapper works
   - Test uninstall process
   - Check Start Menu/Desktop shortcuts

### Optional Improvements

1. **Auto-Update Implementation**
   - Implement signature verification
   - Enable tauri-plugin-updater
   - Host update manifests on releases.agiworkforce.com

2. **Installer Customization**
   - Custom NSIS installer UI
   - License agreement screen
   - Installation directory selection

3. **Silent Install Option**
   - For enterprise deployment
   - MSI with `/quiet` or `/qn` flags
