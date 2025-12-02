# AGI Workforce Desktop App

> **Powerful AI-powered desktop automation and productivity tool**

AGI Workforce is an intelligent desktop application that combines AI chat, tool execution, browser automation, terminal control, and workflow orchestration to boost your productivity.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)](https://github.com/yourusername/agiworkforce-desktop-app/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#supported-platforms)

---

## ✨ Features

- **🤖 AI Chat Interface** - Interact with multiple LLM providers (OpenAI, Anthropic, Google, Ollama, xAI, DeepSeek, etc.)
- **🛠️ Tool Execution** - AI can execute real tools: file operations, terminal commands, browser automation, API calls
- **🌐 Browser Automation** - Built-in browser with recording and playback capabilities
- **💻 Terminal Integration** - PowerShell, CMD, Bash, WSL support with full session management
- **📊 Workflow Orchestration** - Visual workflow designer for complex automation tasks
- **🔌 MCP Protocol Support** - Extend functionality with Model Context Protocol servers
- **🔒 Security First** - Safe mode for dangerous operations, audit logging, prompt injection detection
- **📈 Analytics** - Track costs, usage, and performance metrics

---

## 📥 Download & Installation

### Windows

**Option 1: Installer (.msi)**
1. Download the latest `.msi` installer from [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
2. Double-click the installer and follow the wizard
3. Launch "AGI Workforce" from Start Menu

**Option 2: Portable (.exe)**
1. Download the `.exe` from [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
2. Run the executable directly - no installation needed

### macOS

**Option 1: DMG**
1. Download the `.dmg` file from [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
2. Open the DMG and drag "AGI Workforce" to Applications
3. Launch from Applications folder

**Option 2: App Bundle**
1. Download the `.app.tar.gz` from [Releases](https://github.com/yourusername/agiworkforce-desktop-app/releases)
2. Extract and move to Applications folder

### Linux

**Option 1: AppImage** (Recommended)
```bash
# Download AppImage
wget https://github.com/yourusername/agiworkforce-desktop-app/releases/latest/download/agi-workforce.AppImage

# Make executable
chmod +x agi-workforce.AppImage

# Run
./agi-workforce.AppImage
```

**Option 2: Debian/Ubuntu (.deb)**
```bash
# Download and install
wget https://github.com/yourusername/agiworkforce-desktop-app/releases/latest/download/agi-workforce.deb
sudo dpkg -i agi-workforce.deb
```

---

## 🚀 Quick Start

1. **First Launch** - Complete the onboarding wizard
2. **Configure AI Provider** - Add API keys in Settings → LLM Config
3. **Start Chatting** - Use the AI chat to ask questions or give commands
4. **Try Tools** - Ask the AI to read files, run commands, or browse the web
5. **Create Workflows** - Build automation workflows visually

---

## 🏗️ Build from Source

### Prerequisites

- **Node.js** ≥20.11.0
- **pnpm** ≥9.15.0
- **Rust** ≥1.90.0 (for Tauri)
- **Windows**: Visual Studio Build Tools
- **macOS**: Xcode Command Line Tools
- **Linux**: WebKit2GTK, libsoup, librsvg

### Build Steps

```bash
# Clone repository
git clone https://github.com/yourusername/agiworkforce-desktop-app.git
cd agiworkforce-desktop-app

# Install dependencies
pnpm install

# Run in development mode
pnpm dev:desktop

# Build for production
pnpm --filter @agiworkforce/desktop build
```

The built application will be in `apps/desktop/src-tauri/target/release/`.

---

## 🔧 Configuration

### API Keys

Configure your LLM provider API keys in **Settings → LLM Config**:

- **OpenAI**: Get from https://platform.openai.com/api-keys
- **Anthropic**: Get from https://console.anthropic.com/
- **Google**: Get from https://makersuite.google.com/app/apikey
- **Ollama**: Run locally - no API key needed

### Safe Mode vs Full Control

- **Safe Mode** (Recommended): Requires approval for dangerous operations
- **Full Control**: AI can execute all tools without confirmation

Change in conversation settings or per-chat basis.

---

## 📚 Documentation

- [Installation Guide](./docs/INSTALLATION.md) - Detailed installation instructions
- [User Guide](./apps/desktop/README.md) - How to use the application
- [Developer Guide](./docs/DEVELOPER.md) - Contributing and development
- [API Documentation](./docs/API.md) - Tool and MCP integration

---

## 🔒 Security

- **Prompt Injection Detection** - Automatically detects and blocks malicious prompts
- **Tool Approval System** - Review dangerous operations before execution
- **Audit Logging** - All actions logged for compliance
- **Sandboxed Execution** - Tools run in controlled environment
- **Rate Limiting** - Prevent DoS attacks on IPC layer

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development

```bash
# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
pnpm typecheck

# Format code
pnpm format
```

---

## 📋 System Requirements

### Minimum
- **OS**: Windows 10, macOS 11, Ubuntu 20.04
- **RAM**: 4GB
- **Storage**: 500MB
- **Internet**: Required for cloud LLM providers

### Recommended
- **RAM**: 8GB+
- **Storage**: 1GB+
- **GPU**: For local LLM inference with Ollama

---

## 🛠️ Supported Platforms

| Platform | Status | Formats |
|----------|--------|---------|
| Windows 10/11 | ✅ Supported | `.msi`, `.exe` |
| macOS 11+ (Intel) | ✅ Supported | `.dmg`, `.app` |
| macOS 11+ (Apple Silicon) | ✅ Supported | `.dmg`, `.app` |
| Ubuntu 20.04+ | ✅ Supported | `.deb`, `.AppImage` |
| Debian 11+ | ✅ Supported | `.deb`, `.AppImage` |
| Fedora 36+ | ⚠️ Untested | `.AppImage` |
| Arch Linux | ⚠️ Untested | `.AppImage` |

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- [Tauri](https://tauri.app/) - Desktop app framework
- [React](https://react.dev/) - UI framework
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Radix UI](https://www.radix-ui.com/) - UI primitives

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/agiworkforce-desktop-app/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/agiworkforce-desktop-app/discussions)
- **Discord**: [Join our community](https://discord.gg/agiworkforce)
- **Email**: support@agiworkforce.com

---

<p align="center">Made with ❤️ by the AGI Workforce Team</p>
