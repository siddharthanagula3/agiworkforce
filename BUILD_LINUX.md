# Building AGI Workforce on Linux

## Overview

AGI Workforce is a **Windows-first** application built with Tauri 2.0. While the core business logic is cross-platform Rust, building on Linux requires additional system dependencies due to Tauri's use of GTK for its WebView on Linux.

## System Requirements

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libpango1.0-dev \
    libatk1.0-dev \
    libgdk-pixbuf2.0-dev \
    libcairo2-dev \
    libglib2.0-dev
```

### Fedora/RHEL

```bash
sudo dnf install -y \
    webkit2gtk4.1-devel \
    gtk3-devel \
    libayatana-appindicator-gtk3-devel \
    librsvg2-devel \
    pango-devel \
    atk-devel \
    gdk-pixbuf2-devel \
    cairo-devel \
    glib2-devel
```

### Arch Linux

```bash
sudo pacman -S --needed \
    webkit2gtk \
    gtk3 \
    libayatana-appindicator \
    librsvg \
    pango \
    atk \
    gdk-pixbuf2 \
    cairo \
    glib2
```

## Build Commands

After installing system dependencies:

```bash
# Install Node.js dependencies
pnpm install

# Build the desktop app
pnpm --filter @agiworkforce/desktop build

# Or run in development mode
pnpm --filter @agiworkforce/desktop dev
```

## Feature Flags

Some features can be disabled to reduce dependencies:

```bash
# Build without WebRTC support (reduces GTK dependency footprint)
cd apps/desktop/src-tauri
cargo build --no-default-features

# Build with specific features
cargo build --features ocr,local-llm
```

## Known Issues

1. **Primary Target**: This application is optimized for Windows. Linux builds are provided for development and testing purposes.

2. **Screen Capture**: The `screenshots` crate is Windows-only in this build. Screen capture on Linux may have limited functionality.

3. **Input Simulation**: The `rdev` crate for input monitoring is Windows-only in this build.

4. **WebRTC**: P2P features via WebRTC require GTK dependencies on Linux. Use the `webrtc-support` feature flag to enable.

## Production Deployment

For production deployments, we recommend:

- **Windows**: Use the official MSI installer
- **Linux**: Use containerized deployments or ensure GTK libraries are installed
- **CI/CD**: Use GitHub Actions with appropriate Linux runners that have GTK pre-installed

## Support

For Linux-specific build issues, please:

1. Verify all system dependencies are installed
2. Check Tauri's Linux prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites/#linux
3. Open an issue on GitHub with your distro version and build error

## Why GTK?

Tauri uses GTK's WebKitGTK for its WebView on Linux. This is a design decision of the Tauri framework, not AGI Workforce specifically. All Tauri applications on Linux require GTK.

The trade-off is:
- ✅ Native performance and small bundle size
- ✅ Cross-platform Rust code
- ❌ Requires system dependencies on Linux

Alternatives like Electron bundle Chromium, avoiding system dependencies but resulting in 100MB+ applications. AGI Workforce prioritizes performance and size (~5MB) over zero-dependency builds.
