# Desktop Builds

Building and distributing the AGI Workforce desktop application.

## Build Command

```bash
pnpm build:desktop
```

This creates platform-specific installers in `apps/desktop/src-tauri/target/release/bundle/`.

## Platform Outputs

### macOS

```
bundle/
└── dmg/
    └── AGI Workforce_1.0.6_aarch64.dmg
    └── AGI Workforce_1.0.6_x64.dmg
```

### Windows

```
bundle/
└── msi/
    └── AGI Workforce_1.0.6_x64.msi
```

### Linux

```
bundle/
└── appimage/
    └── AGI Workforce_1.0.6_amd64.AppImage
```

## Build Requirements

### macOS

```bash
# Xcode Command Line Tools
xcode-select --install

# For universal builds
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin
```

### Windows

- Visual Studio Build Tools with C++ workload
- WebView2 Runtime (usually pre-installed on Windows 11)

### Linux

```bash
sudo apt install -y \
  build-essential \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev
```

## Code Signing

### macOS

1. Obtain Apple Developer certificate
2. Configure in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (XXXXXXXXXX)"
    }
  }
}
```

3. Notarize the app:

```bash
xcrun notarytool submit bundle/dmg/*.dmg \
  --apple-id "your@email.com" \
  --team-id "XXXXXXXXXX" \
  --password "@keychain:AC_PASSWORD"
```

### Windows

1. Obtain code signing certificate
2. Configure certificate path and password

## Auto-Updates

Tauri supports automatic updates via GitHub Releases:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://api.github.com/repos/siddhartha/agiworkforce/releases/latest"],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
    }
  }
}
```

## Release Process

1. Update version in `package.json` and `Cargo.toml`
2. Build: `pnpm build:desktop`
3. Test installer locally
4. Create GitHub Release
5. Upload artifacts
6. Users receive auto-update

## Build Configuration

### `tauri.conf.json`

```json
{
  "productName": "AGI Workforce",
  "version": "1.0.6",
  "identifier": "com.agiworkforce.app",
  "bundle": {
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "resources": [],
    "copyright": "AGI Automation LLC",
    "category": "Productivity"
  }
}
```

## Troubleshooting

### Build fails on macOS

```bash
# Clear Rust build cache
cd apps/desktop/src-tauri && cargo clean

# Update Rust
rustup update
```

### Missing libraries on Linux

```bash
# Check for missing dependencies
ldd target/release/agiworkforce | grep "not found"
```

### Windows build hangs

```bash
# Use verbose output
cargo build --release -vv
```

## Next Steps

- [Web Deployment](web-deployment.md)
- [Development Setup](../development/setup.md)
