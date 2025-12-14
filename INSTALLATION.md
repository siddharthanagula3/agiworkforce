# Installation (Developer Preview)

No signed installers or published releases are available yet. Run from source or build your own unsigned bundles locally.

## Prerequisites

- Node.js ≥20.11.0
- pnpm ≥9.15.0
- Rust 1.90.0 (see `rust-toolchain.toml`)
- Platform toolchains:
  - **Windows**: Visual Studio Build Tools (Desktop C++), Microsoft Edge WebView2 Runtime
  - **macOS**: Xcode Command Line Tools
  - **Linux**: WebKit2GTK/GTK/appindicator libraries (see below)

## Quick Start (All Platforms)

```bash
git clone https://github.com/siddharthanagula3/agiworkforce-desktop-app.git
cd agiworkforce-desktop-app
pnpm install

# Run dev loop (Tauri + Vite)
pnpm dev:desktop

# Build the app (frontend + Tauri)
pnpm build:desktop
```

Built artifacts land under `apps/desktop/src-tauri/target/release` for your platform. Windows/macOS/Linux bundles are unsigned.

## Platform Notes

### Windows

- Install Microsoft Edge WebView2 Runtime.
- Install Visual Studio 2022 Build Tools with the **Desktop development with C++** workload.
- Run from repo root with `pnpm dev:desktop` or build with `pnpm build:desktop`. Expect SmartScreen warnings on unsigned builds.

### macOS

- Install Xcode Command Line Tools: `xcode-select --install`
- Gatekeeper will warn on unsigned builds; use right-click → Open on first launch.
- Build via `pnpm build:desktop`; unsigned DMG/app bundles appear in `apps/desktop/src-tauri/target/release/bundle/dmg`.

### Linux

Install GTK/WebKit dependencies before building/running. For Ubuntu/Debian:

```bash
sudo apt-get install \
  libwebkit2gtk-4.1-0 \
  libgtk-3-0 \
  libayatana-appindicator3-1
```

For development: `pnpm dev:desktop`  
For builds: `pnpm build:desktop` (AppImage/deb bundles land under `apps/desktop/src-tauri/target/release/bundle/`).

## Optional: Building Installers

Installers are not published. To generate unsigned Windows installers locally, see `docs/INSTALLER_BUILD.md`. macOS/Linux bundles are produced by the standard `pnpm build:desktop` flow.

## First Launch Setup

- Copy `apps/desktop/.env.example` → `apps/desktop/.env` and set provider keys (`VITE_OPENAI_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_GOOGLE_API_KEY`, optional Sentry DSN).
- Optional MCP servers: copy `apps/desktop/mcp-servers-config.example.json` and fill endpoints.
- Choose **Safe** vs **Full Control** mode in-app (safe mode prompts for dangerous tools).

## Troubleshooting

- **WebView2 missing (Windows)**: Install Microsoft Edge WebView2 Runtime.
- **Unsigned build warnings**: Use right-click → Open (macOS) or “More info → Run anyway” (Windows).
- **Missing Linux libs**: Install the GTK/WebKit packages listed above.
- **Frontend build errors**: `pnpm clean && pnpm install` (from repo root), then retry `pnpm build:desktop`.
- **Rust build errors**: From `apps/desktop/src-tauri`, run `cargo clean`, then `pnpm build:desktop`.

## Data Locations

- **Windows**: `%APPDATA%\com.agiworkforce.desktop`
- **macOS**: `~/Library/Application Support/com.agiworkforce.desktop`
- **Linux**: `~/.config/com.agiworkforce.desktop`
