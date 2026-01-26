# Installation Guide

Complete installation guide for AGI Workforce development environment.

## System Requirements

### Minimum Requirements

| Component   | Requirement                           |
| ----------- | ------------------------------------- |
| **OS**      | macOS 11+, Windows 10+, Ubuntu 20.04+ |
| **RAM**     | 8 GB                                  |
| **Disk**    | 5 GB free space                       |
| **Node.js** | 22.12.0 or higher                     |
| **pnpm**    | 9.15.3 or higher                      |

### For Development

| Component | Requirement       |
| --------- | ----------------- |
| **Rust**  | 1.75 or higher    |
| **RAM**   | 16 GB recommended |
| **Disk**  | 10 GB free space  |

### Platform-Specific Requirements

**macOS:**

- Xcode Command Line Tools: `xcode-select --install`
- For notarization: Apple Developer account

**Windows:**

- Visual Studio Build Tools with C++ workload
- WebView2 Runtime (usually pre-installed on Windows 11)

**Linux (Ubuntu/Debian):**

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev
```

## Installation Steps

### 1. Install Node.js

**Using nvm (recommended):**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Restart terminal, then install Node.js
nvm install 22
nvm use 22
```

**Or download directly:** [nodejs.org](https://nodejs.org/)

Verify installation:

```bash
node --version  # Should show v22.12.0 or higher
```

### 2. Install pnpm

```bash
npm install -g pnpm
```

Verify:

```bash
pnpm --version  # Should show 9.15.3 or higher
```

### 3. Install Rust (for development)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your terminal, then verify:

```bash
rustc --version  # Should show 1.75.0 or higher
```

### 4. Clone the Repository

```bash
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce
```

### 5. Install Dependencies

```bash
pnpm install
```

This installs all workspace dependencies for:

- Desktop app (apps/desktop)
- Web app (apps/web)
- Browser extension (apps/extension)
- Backend services (services/\*)
- Shared packages (packages/\*)

### 6. Set Up Environment Files

```bash
# Desktop app
cp apps/desktop/.env.example apps/desktop/.env.local

# Web app (if using)
cp apps/web/.env.example apps/web/.env.local

# API Gateway (if using)
cp services/api-gateway/.env.example services/api-gateway/.env

# Signaling Server (if using)
cp services/signaling-server/.env.example services/signaling-server/.env
```

### 7. Verify Setup

```bash
pnpm typecheck:all
```

If this completes without errors, your setup is ready.

## Running the Applications

### Desktop App (Primary)

```bash
pnpm dev:desktop
```

Opens at `http://localhost:5173` with Tauri devtools.

### Web App

```bash
cd apps/web
pnpm dev
```

Opens at `http://localhost:3001`.

### Backend Services

```bash
# Terminal 1: API Gateway
pnpm --filter @agiworkforce/api-gateway dev

# Terminal 2: Signaling Server
pnpm --filter @agiworkforce/signaling-server dev
```

### Browser Extension

```bash
cd apps/extension
pnpm build
```

Then load `apps/extension/dist` as an unpacked extension in Chrome.

## Building for Production

### Desktop App

```bash
pnpm build:desktop
```

Creates platform-specific installers:

- macOS: `.dmg` in `apps/desktop/src-tauri/target/release/bundle/dmg/`
- Windows: `.msi` in `apps/desktop/src-tauri/target/release/bundle/msi/`
- Linux: `.AppImage` in `apps/desktop/src-tauri/target/release/bundle/appimage/`

### Web App

```bash
cd apps/web
pnpm build
```

### All Packages

```bash
pnpm build
```

## Troubleshooting

### "pnpm install" fails

```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
pnpm clean
pnpm install
```

### Rust compilation errors

```bash
# Update Rust
rustup update

# Clean Rust build cache
cd apps/desktop/src-tauri
cargo clean
```

### Port already in use

```bash
# Find and kill process using port 5173
lsof -ti:5173 | xargs kill -9

# Or use a different port
VITE_DEV_PORT=5174 pnpm dev:desktop
```

### SQLite database issues

```bash
# Reset local database
rm -rf ~/.config/agiworkforce/agiworkforce.db
```

## Next Steps

- [Configuration Guide](configuration.md) - Configure API keys and settings
- [Quick Start](quick-start.md) - Start using the app
- [Development Setup](../development/setup.md) - Full development guide
