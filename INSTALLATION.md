# Installation Guide

Complete installation instructions for AGI Workforce Desktop App.

---

## Table of Contents

- [Windows Installation](#windows-installation)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [Build from Source](#build-from-source)
- [First Launch Setup](#first-launch-setup)
- [Troubleshooting](#troubleshooting)

---

## Windows Installation

### Method 1: MSI Installer (Recommended)

The MSI installer provides a standard Windows installation experience.

1. **Download the installer**
   - Go to [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
   - Download `AGI-Workforce_x.x.x_x64.msi`

2. **Run the installer**
   - Double-click the downloaded `.msi` file
   - Windows SmartScreen may show a warning - click "More info" → "Run anyway"
   - Follow the installation wizard
   - Choose installation directory (default: `C:\Program Files\AGI Workforce`)

3. **Launch the application**
   - Find "AGI Workforce" in Start Menu
   - Or use the desktop shortcut if created during installation

### Method 2: Portable Executable

No installation required - run directly.

1. **Download**
   - Get `AGI-Workforce.exe` from [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)

2. **Run**
   - Double-click the `.exe` file
   - Windows SmartScreen warning: "More info" → "Run anyway"
   - App runs without installation
   - Settings stored in `%APPDATA%\com.agiworkforce.desktop`

### System Requirements

- Windows 10 (1809+) or Windows 11
- 64-bit processor
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space
- Internet connection (for cloud LLM providers)

---

## macOS Installation

### Method 1: DMG Installer (Recommended)

1. **Download**
   - Go to [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
   - Download `AGI-Workforce_x.x.x_universal.dmg` (works on Intel & Apple Silicon)

2. **Install**
   - Open the downloaded DMG file
   - Drag "AGI Workforce" icon to Applications folder
   - Eject the DMG

3. **First Launch**
   - Open from Applications folder
   - macOS will show "unidentified developer" warning
   - Right-click → "Open" → Confirm to bypass Gatekeeper
   - Or: System Settings → Privacy & Security → "Open Anyway"

### Method 2: App Bundle

1. **Download**
   - Get `AGI-Workforce.app.tar.gz` from releases

2. **Extract and Install**
   ```bash
   tar -xzf AGI-Workforce.app.tar.gz
   mv AGI\ Workforce.app /Applications/
   ```

3. **Launch**
   - Open from Applications
   - Handle Gatekeeper warning as above

### macOS-Specific Notes

- **Apple Silicon (M1/M2/M3)**: Use universal build for best performance
- **Intel Macs**: Universal build also supported
- **Code Signing**: App is not notarized yet - use "Open" from context menu on first launch
- **Settings Location**: `~/Library/Application Support/com.agiworkforce.desktop`

### System Requirements

- macOS 11 (Big Sur) or later
- Intel or Apple Silicon processor
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space

---

## Linux Installation

### Method 1: AppImage (Recommended for all distros)

AppImage works on most Linux distributions without installation.

1. **Download**
   ```bash
   wget https://github.com/yourusername/agiworkforce-desktop-app/releases/latest/download/agi-workforce_x.x.x_amd64.AppImage
   ```

2. **Make Executable**
   ```bash
   chmod +x agi-workforce_*.AppImage
   ```

3. **Run**
   ```bash
   ./agi-workforce_*.AppImage
   ```

4. **Optional: Desktop Integration**
   ```bash
   # Install AppImageLauncher for automatic desktop integration
   # Ubuntu/Debian:
   sudo add-apt-repository ppa:appimagelauncher-team/stable
   sudo apt update
   sudo apt install appimagelauncher

   # Then double-click the AppImage
   ```

### Method 2: Debian/Ubuntu (.deb package)

For Debian-based distributions (Ubuntu, Linux Mint, Pop!_OS, etc.)

1. **Download**
   ```bash
   wget https://github.com/yourusername/agiworkforce-desktop-app/releases/latest/download/agi-workforce_x.x.x_amd64.deb
   ```

2. **Install**
   ```bash
   sudo dpkg -i agi-workforce_*.deb

   # Install dependencies if needed:
   sudo apt-get install -f
   ```

3. **Launch**
   ```bash
   agi-workforce
   # Or find "AGI Workforce" in application menu
   ```

4. **Uninstall**
   ```bash
   sudo apt remove agi-workforce
   ```

### Method 3: Build from Source (Advanced)

See [Build from Source](#build-from-source) section below.

### Linux Dependencies

The app requires these system libraries (usually pre-installed):

**Ubuntu/Debian:**
```bash
sudo apt-get install \
  libwebkit2gtk-4.1-0 \
  libgtk-3-0 \
  libayatana-appindicator3-1
```

**Fedora:**
```bash
sudo dnf install \
  webkit2gtk4.1 \
  gtk3 \
  libappindicator-gtk3
```

**Arch Linux:**
```bash
sudo pacman -S \
  webkit2gtk-4.1 \
  gtk3 \
  libappindicator-gtk3
```

### System Requirements

- Ubuntu 20.04+, Debian 11+, Fedora 36+, or Arch Linux
- x86_64 processor (ARM64 support coming soon)
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space
- X11 or Wayland display server

---

## Build from Source

For developers who want to build from source.

### Prerequisites

1. **Install Rust**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup default 1.90.0
   ```

2. **Install Node.js 20+**
   ```bash
   # Using nvm (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   nvm use 20
   ```

3. **Install pnpm**
   ```bash
   npm install -g pnpm@9.15.3
   ```

4. **Platform-Specific Dependencies**

   **Windows:**
   - Install [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/)
   - Include "Desktop development with C++" workload

   **macOS:**
   ```bash
   xcode-select --install
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt-get install \
     libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```

### Build Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/agiworkforce-desktop-app.git
   cd agiworkforce-desktop-app
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Run in Development Mode**
   ```bash
   pnpm dev:desktop
   ```

4. **Build for Production**
   ```bash
   pnpm --filter @agiworkforce/desktop build
   ```

   Built files will be in:
   - **Windows**: `apps/desktop/src-tauri/target/release/agi-workforce.exe`
   - **macOS**: `apps/desktop/src-tauri/target/release/bundle/dmg/`
   - **Linux**: `apps/desktop/src-tauri/target/release/bundle/appimage/`

---

## First Launch Setup

After installation, complete the onboarding wizard:

### Step 1: Welcome Screen
- Click "Get Started" to begin setup

### Step 2: Configure LLM Provider
- **OpenAI**: Enter API key from https://platform.openai.com/api-keys
- **Anthropic**: Enter API key from https://console.anthropic.com/
- **Google**: Enter API key from https://makersuite.google.com/app/apikey
- **Ollama**: Select "Use Local LLM" (requires Ollama installed)
- **Skip**: You can configure later in Settings

### Step 3: Choose Conversation Mode
- **Safe Mode** (Recommended): Approve dangerous operations before execution
- **Full Control**: AI can execute all tools without confirmation

### Step 4: Optional Features
- Enable/disable analytics
- Configure MCP servers
- Set up keyboard shortcuts

### Step 5: Complete Setup
- Click "Finish" to start using AGI Workforce

---

## Troubleshooting

### Windows Issues

**"Windows protected your PC" warning**
- Click "More info" → "Run anyway"
- This appears because the app isn't code-signed (costs $$$)

**App won't start**
- Check Windows version (needs 10 1809+ or 11)
- Install latest Visual C++ Redistributable
- Check antivirus hasn't blocked the app

**WebView2 error**
- Windows 10: Install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- Windows 11: Already includes WebView2

### macOS Issues

**"Cannot open because developer cannot be verified"**
- Right-click app → "Open" → "Open" again
- Or: System Settings → Privacy & Security → "Open Anyway"

**App crashes on startup**
- Check macOS version (needs 11+)
- Grant necessary permissions in System Settings → Privacy & Security

**Rosetta 2 prompt (Apple Silicon)**
- Universal build works natively - no Rosetta needed
- If you downloaded Intel-only build, install Rosetta:
  ```bash
  softwareupdate --install-rosetta
  ```

### Linux Issues

**Missing libraries error**
```bash
# Ubuntu/Debian
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0

# Fedora
sudo dnf install webkit2gtk4.1 gtk3

# Arch
sudo pacman -S webkit2gtk-4.1 gtk3
```

**AppImage won't run**
```bash
# Make sure it's executable
chmod +x agi-workforce_*.AppImage

# Try FUSE if available
sudo apt install libfuse2  # Ubuntu/Debian
```

**Wayland issues**
```bash
# Force X11 backend if needed
GDK_BACKEND=x11 ./agi-workforce_*.AppImage
```

### General Issues

**API keys not working**
- Verify keys are correct (no extra spaces)
- Check API provider has credits/quota
- Ensure internet connection is active

**Tools not executing**
- Check conversation mode (Safe vs Full Control)
- Look for approval prompts
- Check logs in Settings → Developer → View Logs

**High memory usage**
- Close unused conversations
- Restart app periodically
- Disable browser auto-record if not needed

**Need more help?**
- Check [GitHub Issues](https://github.com/yourusername/agiworkforce-desktop-app/issues)
- Join [Discord community](https://discord.gg/agiworkforce)
- Email support@agiworkforce.com

---

## Data Locations

**Windows:**
- Settings: `%APPDATA%\com.agiworkforce.desktop`
- Database: `%APPDATA%\com.agiworkforce.desktop\data.db`
- Logs: `%APPDATA%\com.agiworkforce.desktop\logs`

**macOS:**
- Settings: `~/Library/Application Support/com.agiworkforce.desktop`
- Database: `~/Library/Application Support/com.agiworkforce.desktop/data.db`
- Logs: `~/Library/Application Support/com.agiworkforce.desktop/logs`

**Linux:**
- Settings: `~/.config/com.agiworkforce.desktop`
- Database: `~/.config/com.agiworkforce.desktop/data.db`
- Logs: `~/.config/com.agiworkforce.desktop/logs`

---

## Next Steps

After installation:

1. **Quick Start Guide**: See [README.md](./README.md#quick-start)
2. **User Documentation**: Check [User Guide](./apps/desktop/README.md)
3. **Configure Settings**: Settings → LLM Config, Terminal, Browser, etc.
4. **Join Community**: [Discord](https://discord.gg/agiworkforce)

---

Enjoy using AGI Workforce! 🚀
