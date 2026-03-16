# AGI Workforce — Windows Desktop Platform PRD

> **Status**: Public Alpha
> **Version**: 1.1.0
> **Last Updated**: 2026-03-15
> **Owner**: Product Team
> **Platform**: Windows 10 (21H2+) / Windows 11 — x64 (ARM64 roadmap)
> **Companion Document**: See `PRD-MACOS.md` for features identical across both desktop platforms

---

## Table of Contents

1. [Executive Summary](#section-1-executive-summary)
2. [Platform Requirements](#section-2-platform-requirements)
3. [Feature Matrix](#section-3-feature-matrix)
4. [Screen-by-Screen UI Specification](#section-4-screen-by-screen-ui-specification)
5. [Component Architecture](#section-5-component-architecture)
6. [Data Flow & API Connections](#section-6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#section-7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#section-8-build-deploy--distribution)
9. [Testing Strategy](#section-9-testing-strategy)
10. [Performance Requirements](#section-10-performance-requirements)
11. [Security](#section-11-security)
12. [Accessibility](#section-12-accessibility)
13. [Competitive Analysis](#section-13-competitive-analysis)

---

# Section 1: Executive Summary

## 1.1 Platform Vision

Windows is the world's largest desktop operating system, commanding approximately 72% of the global desktop market share as of early 2026. AGI Workforce for Windows represents the single largest addressable user base for the product and the primary battleground against competitors including Claude Desktop for Windows, ChatGPT for Windows, and Microsoft Copilot.

The Windows platform build of AGI Workforce delivers the full power of the Rust-backed AI agent runtime inside a native Windows application. It leverages Windows-specific capabilities that no competitor exploits:

- **UI Automation (UIA)** element tree traversal for structured, non-visual interaction with any Windows application
- **DXGI/GDI screen capture** for high-performance screen reading
- **Windows Credential Manager / DPAPI** integration for OS-level secret storage
- **Win32 window management** for cross-application agent orchestration
- **System tray (notification area)** with jump list support for background agent monitoring
- **Taskbar progress indicators** for long-running agent tasks
- **Windows Notification Center** integration for proactive alerts
- **Authenticode-signed MSI installer** for enterprise deployment confidence
- **Windows Registry** integration for auto-start, file associations, and deep linking

AGI Workforce for Windows is not a port of the macOS application. It is a first-class Windows citizen that uses native Win32 APIs, Windows COM interfaces, and Windows-specific UX patterns while sharing the same React/TypeScript frontend and Rust core engine.

## 1.2 Target Users

### 1.2.1 Enterprise Windows Users

The largest segment. Corporate environments are overwhelmingly Windows-based. These users need:

- IT-approved MSI installer deployable via SCCM, Intune, or Group Policy
- Authenticode code signing for SmartScreen trust
- Integration with Active Directory environments
- Windows Credential Manager for API key storage
- Compliance with enterprise security policies (UAC, AppLocker, Windows Defender)
- PowerShell and CMD terminal support for automation workflows
- Microsoft Office integration (Word, Excel, Outlook) via UI Automation

### 1.2.2 Developer Power Users

Windows developers who use Visual Studio, VS Code, Windows Terminal, and WSL. They need:

- Full terminal integration (PowerShell, CMD, WSL bash)
- File system access across Windows drives and WSL mount points
- Git integration via the integrated terminal
- Multi-monitor and high-DPI support (100-300% scaling)
- Custom keyboard shortcuts using Ctrl/Alt/Win modifiers
- MCP tool ecosystem for development workflow automation

### 1.2.3 Gamers and Content Creators

Windows-exclusive user segments with unique hardware and software configurations:

- High-DPI displays at non-standard scaling factors
- Multi-GPU configurations
- Game and streaming application automation
- Content creation tool integration (Adobe Creative Suite, OBS Studio)
- DirectX-based screen capture for high-performance scenarios

### 1.2.4 General Consumers

Non-technical users who want AI assistance on their personal Windows PCs:

- Simple installer with no prerequisites
- SmartScreen warning resolution (first-run flow)
- Straightforward onboarding with API key entry
- Voice input and output for hands-free operation
- Natural language task automation

## 1.3 Key Differentiators on Windows

| Differentiator                  | AGI Workforce    | Claude Desktop Windows | ChatGPT Windows  | Microsoft Copilot  |
| ------------------------------- | ---------------- | ---------------------- | ---------------- | ------------------ |
| Multi-LLM (12+ providers)        | Yes              | No (Anthropic only)    | No (OpenAI only) | No (GPT-4 only)    |
| Local models (Ollama/LM Studio) | Yes              | No                     | No               | No                 |
| UI Automation element tree      | Full UIA COM     | None                   | None             | Partial (own apps) |
| Background agents (24hr+)       | Yes              | No                     | No               | No                 |
| Multi-agent swarm (100)         | Yes              | No                     | No               | No                 |
| MCP tools (unlimited)           | Yes              | Yes (limited)          | No               | No                 |
| Computer use (vision+action)    | Full             | Limited beta           | No               | No                 |
| Voice I/O                       | Whisper+Piper    | No                     | Voice mode       | Voice mode         |
| MSI enterprise deployment       | Yes              | Basic EXE              | Basic EXE        | Pre-installed      |
| Authenticode signing            | Yes              | Yes                    | Yes              | Pre-signed         |
| BYOK (bring your own key)       | Yes              | No                     | No               | No                 |
| Offline-capable                 | Yes (local LLMs) | No                     | No               | No                 |
| Non-coding AI skills (169+)     | Yes              | No                     | No               | No                 |

## 1.4 Non-Negotiable Requirements

All non-negotiable requirements from the master PRD (NN-01 through NN-07) apply to the Windows platform. In addition, the following Windows-specific non-negotiables are defined:

| ID     | Requirement                                                 | Rationale                                             |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| NN-W01 | SmartScreen must not block installation after signing       | Authenticode signing + reputation building required   |
| NN-W02 | Application must run without administrator privileges       | Standard user accounts must have full functionality   |
| NN-W03 | High-DPI rendering must be pixel-perfect at 100-300%        | Windows has more scaling diversity than macOS         |
| NN-W04 | Windows Defender must not flag the application              | Binary must pass static and dynamic AV analysis       |
| NN-W05 | WSL integration must work alongside native Windows paths    | Many Windows developers use WSL daily                 |
| NN-W06 | PowerShell execution policy must not block agent operations | Agent terminal commands must execute reliably         |
| NN-W07 | System tray icon must be visible and functional             | Users expect background apps in the notification area |

## 1.5 Success Metrics

| Metric                                    | Target (v1.2.0) | Target (v2.0.0) |
| ----------------------------------------- | --------------- | --------------- |
| Windows installer download-to-launch rate | >= 85%          | >= 95%          |
| SmartScreen bypass rate (signed builds)   | 0% blocked      | 0% blocked      |
| Windows Defender false positive rate      | 0%              | 0%              |
| Cold start time (Windows 10, SSD)         | < 3 seconds     | < 2 seconds     |
| Cold start time (Windows 10, HDD)         | < 5 seconds     | < 3 seconds     |
| Memory footprint (idle)                   | < 200 MB        | < 150 MB        |
| Memory footprint (active chat)            | < 500 MB        | < 400 MB        |
| UI Automation element query latency       | < 200ms         | < 100ms         |
| High-DPI rendering correctness (200%)     | 100%            | 100%            |
| Crash-free session rate                   | >= 99.5%        | >= 99.9%        |
| Feature parity with macOS build           | >= 95%          | 100%            |
| Enterprise deployment success rate (MSI)  | >= 98%          | >= 99.5%        |

---

# Section 2: Platform Requirements

## 2.1 Operating System Requirements

### 2.1.1 Minimum Supported OS Versions

| OS         | Version | Build | Codename              | Support Status    |
| ---------- | ------- | ----- | --------------------- | ----------------- |
| Windows 10 | 21H2    | 19044 | November 2021 Update  | Minimum supported |
| Windows 10 | 22H2    | 19045 | October 2022 Update   | Fully supported   |
| Windows 11 | 21H2    | 22000 | Initial release       | Fully supported   |
| Windows 11 | 22H2    | 22621 | September 2022 Update | Fully supported   |
| Windows 11 | 23H2    | 22631 | October 2023 Update   | Fully supported   |
| Windows 11 | 24H2    | 26100 | October 2024 Update   | Fully supported   |

### 2.1.2 Rationale for Windows 10 21H2 Minimum

The Windows 10 21H2 minimum is driven by:

1. **WebView2 runtime**: Windows 10 21H2 ships with WebView2 Evergreen Runtime pre-installed. Earlier versions require a separate WebView2 installation step.
2. **Win32 API coverage**: The `windows` Rust crate v0.56 requires APIs available from Windows 10 1903+, but 21H2 provides the broadest tested surface.
3. **Market share**: Windows 10 21H2 and later represent >95% of active Windows 10 installations.
4. **Microsoft support**: Windows 10 versions before 21H2 are end-of-life.

### 2.1.3 Windows Server Support

| OS                  | Status                 | Notes                       |
| ------------------- | ---------------------- | --------------------------- |
| Windows Server 2019 | Unsupported (may work) | No testing or guarantees    |
| Windows Server 2022 | Community-supported    | Desktop Experience required |
| Windows Server 2025 | Community-supported    | Desktop Experience required |

Windows Server editions are not officially supported because:

- They lack Desktop Experience by default (required for WebView2)
- UI Automation may behave differently in server environments
- Audio capture (cpal) may not have available devices

## 2.2 Architecture Requirements

### 2.2.1 Supported Architectures

| Architecture | Status           | Distribution      | Notes                                   |
| ------------ | ---------------- | ----------------- | --------------------------------------- |
| x64 (AMD64)  | Fully supported  | Primary installer | Native 64-bit binary                    |
| ARM64        | Roadmap (v2.0.0) | Planned           | Via x64 emulation today, native planned |
| x86 (32-bit) | Not supported    | N/A               | 64-bit required                         |

### 2.2.2 ARM64 Roadmap

Windows on ARM devices (Surface Pro X, Snapdragon laptops) currently run AGI Workforce via x64 emulation, which incurs a ~20% performance penalty. A native ARM64 build is planned for v2.0.0 and requires:

1. Cross-compilation target: `aarch64-pc-windows-msvc`
2. ARM64 WebView2 runtime (available)
3. ARM64 builds of native dependencies (SQLCipher, cpal)
4. ARM64-specific CI runner in GitHub Actions

## 2.3 Hardware Requirements

### 2.3.1 Minimum Requirements

| Component | Minimum                      | Recommended                   |
| --------- | ---------------------------- | ----------------------------- |
| Processor | 64-bit x86, 2 cores, 1.5 GHz | 4+ cores, 2.5+ GHz            |
| RAM       | 4 GB                         | 8 GB+                         |
| Storage   | 500 MB free (installation)   | 2 GB+ free (models, cache)    |
| Display   | 1280x720, 100% scaling       | 1920x1080+, 125-150%          |
| GPU       | Not required                 | DirectX 11 (for DXGI capture) |
| Network   | Optional (offline-capable)   | Broadband for cloud LLMs      |
| Audio     | Optional                     | Microphone for voice input    |

### 2.3.2 Performance Scaling by Hardware

| Configuration             | Expected Performance                                    |
| ------------------------- | ------------------------------------------------------- |
| 4 GB RAM, HDD, 2-core     | Functional but slow (5s cold start, 300 MB limit)       |
| 8 GB RAM, SSD, 4-core     | Good (3s cold start, standard agent operation)          |
| 16 GB RAM, NVMe, 8-core   | Excellent (< 2s cold start, multi-agent swarms)         |
| 32+ GB RAM, NVMe, 16-core | Optimal (< 1s cold start, 100-agent swarms, local LLMs) |

## 2.4 Runtime Dependencies

### 2.4.1 WebView2 Runtime

AGI Workforce on Windows uses Microsoft Edge WebView2 to render the React frontend. This is the Tauri v2 webview backend on Windows (replacing WebKit used on macOS/Linux).

| Aspect           | Detail                                               |
| ---------------- | ---------------------------------------------------- |
| Runtime          | Microsoft Edge WebView2 Evergreen Runtime            |
| Minimum version  | 90.0.818.0                                           |
| Distribution     | Pre-installed on Windows 10 21H2+, Windows 11        |
| Fallback         | Installer downloads WebView2 bootstrapper if missing |
| Update mechanism | Automatic via Microsoft Edge Updater                 |

**Key differences from WebKit (macOS)**:

1. **Rendering engine**: Chromium-based (Blink) vs. WebKit
2. **JavaScript engine**: V8 vs. JavaScriptCore
3. **CSS compatibility**: Some CSS features may render differently
4. **DevTools**: Chrome DevTools vs. WebKit Inspector
5. **Performance characteristics**: Different memory/CPU profiles

### 2.4.2 Visual C++ Runtime

| Component    | Required Version    | Notes                                                    |
| ------------ | ------------------- | -------------------------------------------------------- |
| MSVC Runtime | 14.x (VS 2015-2022) | Bundled in installer via VC Redistributable merge module |

The installer bundles the Visual C++ 2015-2022 Redistributable (x64) as a merge module. If already installed, the module is a no-op. If missing, it is silently installed during AGI Workforce setup.

### 2.4.3 Optional Dependencies

| Dependency    | Required For               | Installation                    |
| ------------- | -------------------------- | ------------------------------- |
| Tesseract OCR | `ocr` feature flag         | User must install separately    |
| Ollama        | Local LLM inference        | User installs separately        |
| LM Studio     | Local LLM inference        | User installs separately        |
| PowerShell 7+ | Enhanced terminal features | Pre-installed on modern Windows |

## 2.5 Distribution Format

### 2.5.1 Primary: WiX MSI Installer (.exe bootstrap)

| Aspect              | Detail                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Installer format    | WiX v4 MSI wrapped in EXE bootstrapper                                                    |
| File name           | `AGI-Workforce-Setup-1.1.5-x64.exe`                                                       |
| Installer size      | ~30 MB (compressed)                                                                       |
| Installed size      | ~120 MB                                                                                   |
| Install location    | `%LOCALAPPDATA%\AGI Workforce\` (per-user) or `%ProgramFiles%\AGI Workforce\` (all-users) |
| Registry entries    | HKCU or HKLM depending on install scope                                                   |
| Code signing        | Authenticode (EV certificate)                                                             |
| Uninstaller         | Windows Add/Remove Programs entry                                                         |
| Silent install      | `AGI-Workforce-Setup-1.1.5-x64.exe /S`                                                    |
| Custom install path | `AGI-Workforce-Setup-1.1.5-x64.exe /D=C:\CustomPath`                                      |

### 2.5.2 Alternative: NSIS Installer

Tauri supports both WiX and NSIS installers. The NSIS variant provides:

| Aspect           | Detail                                              |
| ---------------- | --------------------------------------------------- |
| Installer format | NSIS .exe                                           |
| Use case         | Fallback if WiX causes enterprise deployment issues |
| Advantage        | Simpler installer UI, wider compatibility           |
| Disadvantage     | Less granular MSI features (GPO deployment)         |

### 2.5.3 Portable Mode (Planned v2.0.0)

A portable ZIP distribution is planned for users who cannot install software (kiosk machines, locked-down environments):

| Aspect        | Detail                                                    |
| ------------- | --------------------------------------------------------- |
| Format        | .zip archive                                              |
| Extraction    | Any directory                                             |
| Data location | `./data/` relative to executable                          |
| Limitation    | No auto-update, no Start Menu entry, no file associations |

## 2.6 Framework Stack

### 2.6.1 Technology Stack (Windows-Specific)

| Layer              | Technology              | Version   | Notes                       |
| ------------------ | ----------------------- | --------- | --------------------------- |
| Desktop framework  | Tauri                   | 2.9.3     | Webview2 backend on Windows |
| Webview            | Microsoft Edge WebView2 | Evergreen | Chromium-based              |
| Frontend framework | React                   | 19        | Same as macOS               |
| Build tool         | Vite                    | 7         | Same as macOS               |
| Frontend language  | TypeScript              | 5.9.3     | Same as macOS               |
| Backend language   | Rust                    | 1.90.0    | MSVC toolchain on Windows   |
| Windows APIs       | windows crate           | 0.56      | Win32, COM, UIA bindings    |
| Screen capture     | xcap                    | 0.0.12    | Uses DXGI on Windows        |
| Input simulation   | enigo                   | 0.6       | Win32 SendInput on Windows  |
| Clipboard          | arboard                 | 3.4       | Win32 Clipboard API         |
| Keychain           | keyring                 | 3         | Windows Credential Manager  |
| Terminal           | portable-pty            | 0.8       | ConPTY on Windows           |
| Audio              | cpal                    | 0.15      | WASAPI on Windows           |
| CSS                | Tailwind CSS            | 4         | Same as macOS               |
| State management   | Zustand                 | 5         | Same as macOS               |
| UI primitives      | Radix UI                | latest    | Same as macOS               |

### 2.6.2 Rust Toolchain (Windows)

| Component      | Requirement                              |
| -------------- | ---------------------------------------- |
| Rust version   | 1.90.0                                   |
| Toolchain      | `stable-x86_64-pc-windows-msvc`          |
| Target         | `x86_64-pc-windows-msvc`                 |
| Build tools    | Visual Studio Build Tools 2022           |
| Linker         | MSVC link.exe                            |
| C/C++ compiler | cl.exe (for native dependencies)         |
| Additional     | LLVM/clang (for SQLCipher bundled build) |

### 2.6.3 Windows-Specific Rust Dependencies

From `Cargo.toml` `[target.'cfg(windows)'.dependencies]`:

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.56", features = [
    "Win32_Foundation",
    "Win32_System_Threading",
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Input_KeyboardAndMouse",
    "Win32_UI_Accessibility",
    "Win32_Graphics_Gdi",
    "Win32_Graphics_Dxgi",
    "Win32_Graphics_Direct3D11",
    "Win32_System_Com",
    "Win32_System_DataExchange",
    "Win32_System_Ole",
    "Win32_UI_Shell",
    "Win32_Security",
    "Win32_System_Memory",
    "Win32_System_SystemServices",
    "Win32_System_Registry",
    "Win32_System_Power",
    "Media_SpeechRecognition",
    "Storage_Streams",
    "Globalization"
] }
```

**Feature breakdown**:

| Windows Feature                   | Purpose in AGI Workforce                               |
| --------------------------------- | ------------------------------------------------------ |
| `Win32_Foundation`                | Base types (HWND, BOOL, LPARAM, RECT)                  |
| `Win32_System_Threading`          | Process enumeration, window-process mapping            |
| `Win32_UI_WindowsAndMessaging`    | Window enumeration, SetForegroundWindow, ShowWindow    |
| `Win32_UI_Input_KeyboardAndMouse` | Keyboard/mouse input simulation backup                 |
| `Win32_UI_Accessibility`          | UI Automation (UIA) COM interfaces                     |
| `Win32_Graphics_Gdi`              | GDI screen capture (BitBlt fallback)                   |
| `Win32_Graphics_Dxgi`             | DXGI desktop duplication (primary capture)             |
| `Win32_Graphics_Direct3D11`       | Direct3D device for DXGI capture                       |
| `Win32_System_Com`                | COM initialization for UI Automation                   |
| `Win32_System_DataExchange`       | Clipboard operations (OpenClipboard, GetClipboardData) |
| `Win32_System_Ole`                | SafeArray operations for UIA runtime IDs               |
| `Win32_UI_Shell`                  | Shell integration, notifications, taskbar              |
| `Win32_Security`                  | Security descriptors for IPC                           |
| `Win32_System_Memory`             | Shared memory for inter-process communication          |
| `Win32_System_SystemServices`     | System information queries                             |
| `Win32_System_Registry`           | Registry read/write for auto-start, file associations  |
| `Win32_System_Power`              | Power state detection (battery/AC, sleep prevention)   |
| `Media_SpeechRecognition`         | Windows Speech Recognition API (fallback)              |
| `Storage_Streams`                 | Stream abstractions for file I/O                       |
| `Globalization`                   | Locale-aware text processing                           |

## 2.7 Feature Flags Applicable to Windows

All Rust feature flags from the master PRD apply to Windows builds. Windows-specific considerations:

| Feature Flag       | Default | Windows Notes                                                     |
| ------------------ | ------- | ----------------------------------------------------------------- |
| `shell`            | on      | Uses ConPTY via portable-pty; PowerShell and CMD supported        |
| `updater`          | on      | Tauri updater checks GitHub Releases for Windows `.exe` artifacts |
| `devtools`         | on      | WebView2 DevTools (Chrome DevTools Protocol)                      |
| `ocr`              | off     | Requires Tesseract for Windows (manual install)                   |
| `local-llm`        | off     | llama.cpp builds natively on Windows with MSVC                    |
| `vad`              | on      | WebRTC VAD works on Windows via WASAPI audio backend              |
| `local-whisper`    | off     | whisper.cpp builds on Windows; requires manual setup              |
| `billing`          | on      | No Windows-specific considerations                                |
| `remote-databases` | on      | All database clients (PG, MySQL, Mongo, Redis) work on Windows    |
| `sentry`           | off     | Sentry SDK works on Windows for crash reporting                   |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Core Chat & LLM Features

| ID      | Feature                                   | Priority | Windows Status | macOS Parity | Notes            |
| ------- | ----------------------------------------- | -------- | -------------- | ------------ | ---------------- |
| FR-D101 | Multi-provider LLM routing (12+ providers) | P0       | Implemented    | Identical    | Same Rust engine |
| FR-D102 | Routing strategies (7 modes)              | P1       | Implemented    | Identical    |                  |
| FR-D103 | Session cost cap ($50)                    | P1       | Implemented    | Identical    |                  |
| FR-D104 | Dual HTTP client architecture             | P0       | Implemented    | Identical    |                  |
| FR-D105 | Circuit breaker per provider              | P1       | Implemented    | Identical    |                  |
| FR-D106 | Provider-specific SSE parser              | P0       | Implemented    | Identical    |                  |
| FR-D107 | LLM response caching (LRU, 512)           | P2       | Implemented    | Identical    |                  |
| FR-D108 | Per-provider token cost calculation       | P1       | Implemented    | Identical    |                  |
| FR-D109 | Token counting (tiktoken-rs)              | P1       | Implemented    | Identical    |                  |
| FR-D110 | Rich LLM request parameters               | P0       | Implemented    | Identical    |                  |
| FR-D111 | Multimodal content parts                  | P0       | Implemented    | Identical    |                  |
| FR-D112 | Extended thinking / reasoning             | P1       | Implemented    | Identical    |                  |
| FR-D113 | Server-side tool support                  | P1       | Implemented    | Identical    |                  |
| FR-D114 | Credits & daily limit tracking            | P1       | Implemented    | Identical    |                  |

### 3.1.2 Agent & Automation Features

| ID      | Feature                                             | Priority | Windows Status | macOS Parity | Notes                                               |
| ------- | --------------------------------------------------- | -------- | -------------- | ------------ | --------------------------------------------------- |
| FR-D201 | Autonomous agent mode                               | P0       | Implemented    | Identical    |                                                     |
| FR-D202 | Background agents (24hr+)                           | P0       | Implemented    | Identical    |                                                     |
| FR-D203 | Multi-agent swarm (up to 100)                       | P1       | Implemented    | Identical    |                                                     |
| FR-D204 | Computer use (observe-plan-act)                     | P0       | Implemented    | Different    | Uses UIA on Windows vs AXUIElement on macOS         |
| FR-D205 | Screen capture (primary + region)                   | P0       | Implemented    | Different    | Uses DXGI/xcap on Windows vs CoreGraphics on macOS  |
| FR-D206 | Input simulation (keyboard + mouse)                 | P0       | Implemented    | Different    | Uses Win32 SendInput on Windows vs CGEvent on macOS |
| FR-D207 | Window management (enumerate, focus, activate)      | P0       | Implemented    | Different    | Uses EnumWindows/SetForegroundWindow on Windows     |
| FR-D208 | Application launching                               | P1       | Implemented    | Different    | Uses ShellExecuteW on Windows vs `open -a` on macOS |
| FR-D209 | UI element inspection                               | P1       | Implemented    | Different    | Full UIA InspectorService on Windows                |
| FR-D210 | Element tree traversal                              | P1       | Implemented    | Different    | UIA COM tree vs AX hierarchy on macOS               |
| FR-D211 | Element action execution (invoke, setValue, toggle) | P1       | Implemented    | Different    | UIA patterns on Windows                             |
| FR-D212 | Element wait and retry strategies                   | P1       | Implemented    | Different    | Async wait_for_element with backoff                 |
| FR-D213 | Clipboard management                                | P0       | Implemented    | Different    | arboard uses Win32 Clipboard API internally         |
| FR-D214 | Vision-based screen interaction                     | P1       | Implemented    | Identical    | Same visual_reasoner.rs                             |
| FR-D215 | Safety patterns (automation)                        | P0       | Implemented    | Identical    | Same safety_patterns.rs                             |
| FR-D216 | Action recording                                    | P2       | Implemented    | Identical    | Same recorder.rs                                    |

### 3.1.3 Tools & Integration Features

| ID      | Feature                                        | Priority | Windows Status | macOS Parity | Notes                             |
| ------- | ---------------------------------------------- | -------- | -------------- | ------------ | --------------------------------- |
| FR-D301 | MCP tool ecosystem (stdio, SSE, HTTP)          | P0       | Implemented    | Identical    |                                   |
| FR-D302 | File system operations                         | P0       | Implemented    | Identical    | Windows paths (backslash) handled |
| FR-D303 | Terminal execution (shell commands)            | P0       | Implemented    | Different    | PowerShell/CMD vs bash/zsh        |
| FR-D304 | Browser automation (CDP)                       | P1       | Implemented    | Identical    | Chrome DevTools Protocol          |
| FR-D305 | Email (IMAP/SMTP)                              | P1       | Implemented    | Identical    |                                   |
| FR-D306 | Calendar (Google, Outlook OAuth)               | P1       | Implemented    | Identical    |                                   |
| FR-D307 | Cloud storage (Drive, Dropbox, OneDrive)       | P2       | Partial        | Identical    |                                   |
| FR-D308 | Database connections (PG, MySQL, Mongo, Redis) | P2       | Implemented    | Identical    |                                   |
| FR-D309 | Document processing (PDF, DOCX, XLSX)          | P1       | Implemented    | Identical    |                                   |
| FR-D310 | Git operations                                 | P1       | Implemented    | Identical    | git2 vendored-openssl             |
| FR-D311 | Messaging                                      | P2       | Implemented    | Identical    |                                   |
| FR-D312 | Native messaging bridge (Chrome extension)     | P1       | Implemented    | Different    | Registry key for NMH manifest     |

### 3.1.4 Memory & Intelligence Features

| ID      | Feature                                  | Priority | Windows Status | macOS Parity | Notes |
| ------- | ---------------------------------------- | -------- | -------------- | ------------ | ----- |
| FR-D401 | Embeddings (Ollama local + OpenAI cloud) | P1       | Implemented    | Identical    |       |
| FR-D402 | RAG (retrieval-augmented generation)     | P1       | Implemented    | Identical    |       |
| FR-D403 | Intent detection                         | P1       | Implemented    | Identical    |       |
| FR-D404 | Research mode                            | P1       | Implemented    | Identical    |       |
| FR-D405 | Conversation summarization               | P2       | Implemented    | Identical    |       |
| FR-D406 | Codebase indexing                        | P2       | Implemented    | Identical    |       |
| FR-D407 | Skill registry (169+ skills)             | P1       | Implemented    | Identical    |       |

### 3.1.5 UI & UX Features

| ID      | Feature                        | Priority | Windows Status | macOS Parity | Notes                         |
| ------- | ------------------------------ | -------- | -------------- | ------------ | ----------------------------- |
| FR-D501 | Unified agentic chat interface | P0       | Implemented    | Identical    | Same React components         |
| FR-D502 | Tool execution timeline        | P0       | Implemented    | Identical    |                               |
| FR-D503 | Settings panel                 | P0       | Implemented    | Different    | Windows-specific sections     |
| FR-D504 | Model selector                 | P0       | Implemented    | Identical    |                               |
| FR-D505 | Artifact viewer / canvas       | P1       | Implemented    | Identical    |                               |
| FR-D506 | Code editor (Monaco)           | P1       | Implemented    | Identical    |                               |
| FR-D507 | Analytics dashboard            | P2       | Implemented    | Identical    |                               |
| FR-D508 | Skill marketplace              | P2       | Implemented    | Identical    |                               |
| FR-D509 | Dark mode                      | P0       | Implemented    | Different    | Reads Windows app theme       |
| FR-D510 | Onboarding wizard              | P0       | Implemented    | Different    | Windows-specific steps        |
| FR-D511 | Keyboard shortcuts             | P0       | Implemented    | Different    | Ctrl replaces Cmd             |
| FR-D512 | System tray icon               | P0       | Implemented    | Different    | Notification area vs menu bar |
| FR-D513 | Context menus                  | P0       | Implemented    | Different    | Windows right-click menus     |
| FR-D514 | File drag-and-drop             | P1       | Implemented    | Different    | Windows Explorer integration  |
| FR-D515 | Multi-window support           | P2       | Planned        | Identical    |                               |
| FR-D516 | Notification toasts            | P0       | Implemented    | Different    | Windows Notification Center   |
| FR-D517 | Custom title bar               | P0       | Implemented    | Different    | Windows chrome integration    |

### 3.1.6 Desktop-Specific Features

| ID      | Feature                      | Priority | Windows Status | macOS Parity | Notes                             |
| ------- | ---------------------------- | -------- | -------------- | ------------ | --------------------------------- |
| FR-D601 | Voice input (STT)            | P1       | Implemented    | Different    | WASAPI audio capture              |
| FR-D602 | Voice output (TTS)           | P1       | Implemented    | Different    | Windows Speech API fallback       |
| FR-D603 | Screen capture + OCR         | P1       | Implemented    | Different    | DXGI + Tesseract                  |
| FR-D604 | Background scheduling (cron) | P1       | Implemented    | Identical    |                                   |
| FR-D605 | Auto-update (Tauri updater)  | P0       | Implemented    | Different    | EXE update artifact               |
| FR-D606 | Deep linking (URI scheme)    | P1       | Implemented    | Different    | Windows Registry protocol handler |
| FR-D607 | Global keyboard shortcuts    | P1       | Implemented    | Different    | Win+hotkey registration           |
| FR-D608 | Window state persistence     | P0       | Implemented    | Identical    | tauri-plugin-window-state         |
| FR-D609 | Power state awareness        | P2       | Planned        | Different    | Win32 power management            |
| FR-D610 | Startup with Windows         | P2       | Implemented    | Different    | Registry Run key                  |

### 3.1.7 Windows-Exclusive Features

These features exist only on the Windows platform and have no macOS equivalent:

| ID     | Feature                                 | Priority | Status      | Notes                                                                       |
| ------ | --------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------- |
| FR-W01 | UI Automation element tree (UIA COM)    | P0       | Implemented | Full COM interface with caching                                             |
| FR-W02 | UIA pattern capabilities detection      | P1       | Implemented | Invoke, Value, Toggle, Text, Grid, Table, Scroll, ExpandCollapse, Selection |
| FR-W03 | UIA smart element finding               | P1       | Implemented | Partial name match, case-insensitive fallback, type-only fallback           |
| FR-W04 | UIA inspector service                   | P1       | Implemented | Point inspection, focused element, element tree traversal                   |
| FR-W05 | DXGI desktop duplication capture        | P1       | Implemented | DirectX 11 screen capture                                                   |
| FR-W06 | GDI BitBlt screen capture (fallback)    | P2       | Implemented | For systems without DXGI support                                            |
| FR-W07 | Taskbar progress indicator              | P2       | Planned     | ITaskbarList3::SetProgressValue                                             |
| FR-W08 | Jump list entries                       | P2       | Planned     | Recent conversations, quick actions                                         |
| FR-W09 | Windows Registry auto-start             | P2       | Implemented | HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run                          |
| FR-W10 | Windows Notification Center integration | P1       | Implemented | tauri-plugin-notification                                                   |
| FR-W11 | Authenticode code signing               | P0       | Planned     | EV certificate required                                                     |
| FR-W12 | MSI enterprise deployment               | P0       | Implemented | WiX v4 installer                                                            |
| FR-W13 | ConPTY terminal backend                 | P0       | Implemented | Windows Console API via portable-pty                                        |
| FR-W14 | Windows Credential Manager              | P0       | Implemented | keyring crate integration                                                   |
| FR-W15 | Win32 clipboard integration             | P0       | Implemented | Via arboard crate                                                           |

## 3.2 Feature Parity Summary

| Category              | Total Features | Windows Implemented | macOS Identical | Windows Different | Windows Exclusive |
| --------------------- | -------------- | ------------------- | --------------- | ----------------- | ----------------- |
| Core Chat & LLM       | 14             | 14                  | 14              | 0                 | 0                 |
| Agent & Automation    | 16             | 16                  | 6               | 10                | 0                 |
| Tools & Integration   | 12             | 12                  | 10              | 2                 | 0                 |
| Memory & Intelligence | 7              | 7                   | 7               | 0                 | 0                 |
| UI & UX               | 17             | 16                  | 8               | 8                 | 0                 |
| Desktop-Specific      | 10             | 9                   | 3               | 6                 | 0                 |
| Windows-Exclusive     | 15             | 12                  | 0               | 0                 | 15                |
| **Total**             | **91**         | **86**              | **48**          | **26**            | **15**            |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Overview

The Windows build shares the same React/TypeScript frontend as the macOS build, rendered through WebView2 (Chromium) instead of WebKit. All screens use the same component hierarchy, but Windows-specific differences exist in:

1. **Title bar**: Custom title bar with Windows minimize/maximize/close buttons
2. **Keyboard shortcuts**: All Cmd-based shortcuts map to Ctrl on Windows
3. **Context menus**: Right-click menus follow Windows conventions
4. **File paths**: Backslash separators, drive letters, %APPDATA% paths
5. **Drag-and-drop**: Windows Explorer drag-and-drop protocol
6. **Font rendering**: ClearType font rendering (different from macOS subpixel AA)
7. **Dark mode**: Windows app theme detection (registry + WM_SETTINGCHANGE)
8. **Scrollbar styling**: Windows native scrollbar appearance (wider, always visible option)
9. **Notifications**: Windows Notification Center toast style
10. **System tray**: Notification area icon (bottom-right) instead of menu bar (top-right)

## 4.2 Application Chrome (Window Frame)

### 4.2.1 Title Bar

**Route**: N/A (persistent across all routes)
**Purpose**: Application window frame with minimize/maximize/close controls and navigation

**Layout**:

```
+------------------------------------------------------------------------+
| [App Icon] AGI Workforce                    [_] [□] [X]               |
+------------------------------------------------------------------------+
```

**Component Inventory**:

| Component                     | Type          | Position                     | Windows-Specific Behavior                                                   |
| ----------------------------- | ------------- | ---------------------------- | --------------------------------------------------------------------------- |
| App Icon                      | Image (16x16) | Top-left corner              | Clicking opens system menu (Restore, Move, Size, Minimize, Maximize, Close) |
| App Title                     | Text          | Left of center               | "AGI Workforce" in system font (Segoe UI)                                   |
| Minimize Button `[_]`         | Button        | Top-right, third from right  | Standard Windows minimize (yellow on macOS)                                 |
| Maximize/Restore Button `[□]` | Button        | Top-right, second from right | Toggles between maximize and restore; icon changes                          |
| Close Button `[X]`            | Button        | Top-right, rightmost         | Red background on hover; closes to system tray if configured                |

**Exact Copy/Wording**:

- Title: "AGI Workforce"
- System menu items: "Restore", "Move", "Size", "Minimize", "Maximize", "Close"
- Tooltip (Minimize): "Minimize"
- Tooltip (Maximize): "Maximize" or "Restore Down"
- Tooltip (Close): "Close"

**Windows-Specific Behavior**:

- **Double-click title bar**: Toggles maximize/restore
- **Right-click title bar**: Opens Windows system menu
- **Drag title bar**: Moves window
- **Drag to screen edge**: Windows Snap (left half, right half, maximize)
- **Win+Arrow keys**: Snap positioning works as expected
- **Title bar height**: 32px (standard Windows chrome), not 28px (macOS)
- **Button style**: Windows 11 rounded corners if `dwm` composition is active; Windows 10 square corners
- **Close behavior**: If "Close to system tray" is enabled in Settings, the close button minimizes to notification area instead of closing the application. A toast notification appears: "AGI Workforce is still running in the background."

**Interaction Flows**:

1. User clicks `[X]` with "Close to tray" OFF:
   - Application window closes
   - All background agents are prompted for confirmation
   - If agents are running, dialog appears: "Background agents are still running. Close anyway?"
   - Options: "Close" (terminates agents), "Minimize to Tray" (keeps running)

2. User clicks `[X]` with "Close to tray" ON:
   - Window hides
   - System tray icon remains
   - Toast notification: "AGI Workforce is still running in the background."

3. User double-clicks title bar:
   - Window toggles between maximized and restored state
   - Window state persisted via `tauri-plugin-window-state`

4. User drags window to left/right screen edge:
   - Windows Snap layout activates
   - AGI Workforce occupies half the screen
   - Snap assist shows other windows for the other half

**State Variations**:

- **Maximized**: Maximize button shows "restore" icon (two overlapping squares)
- **Restored**: Maximize button shows single square icon
- **Focused**: Title bar uses system accent color (Windows 11) or white (Windows 10)
- **Unfocused**: Title bar grays out; text becomes lighter

### 4.2.2 System Tray (Notification Area) Icon

**Location**: Windows notification area (bottom-right of taskbar)
**Purpose**: Background monitoring and quick access when window is closed to tray

**Component Inventory**:

| Component   | Type            | Behavior                   |
| ----------- | --------------- | -------------------------- |
| Tray Icon   | 16x16 ICO image | AGI Workforce logo         |
| Left-click  | Action          | Shows/hides main window    |
| Right-click | Context menu    | Opens tray context menu    |
| Tooltip     | Text            | "AGI Workforce - [status]" |

**Right-click Context Menu Items**:

| Menu Item                 | Shortcut | Action                      | Condition          |
| ------------------------- | -------- | --------------------------- | ------------------ |
| "Show AGI Workforce"      |          | Brings main window to front | Always             |
| "New Conversation"        | Ctrl+N   | Opens new conversation      | Always             |
| --- (separator)           |          |                             |                    |
| "Active Agents ([count])" |          | Opens agent monitor         | count > 0          |
| "Pause All Agents"        |          | Pauses all running agents   | Any agents running |
| "Resume All Agents"       |          | Resumes paused agents       | Any agents paused  |
| --- (separator)           |          |                             |                    |
| "Settings"                |          | Opens settings panel        | Always             |
| "Check for Updates"       |          | Triggers update check       | Always             |
| --- (separator)           |          |                             |                    |
| "Quit AGI Workforce"      |          | Full application exit       | Always             |

**Tooltip Variations**:

- Idle: "AGI Workforce - Ready"
- Processing: "AGI Workforce - Processing..."
- Agents active: "AGI Workforce - 3 agents running"
- Update available: "AGI Workforce - Update available"

**Windows-Specific Behavior**:

- On Windows 11, the tray icon may be hidden in the overflow area by default. Users can pin it to the visible area via "Taskbar settings > Other system tray icons".
- On Windows 10, the icon appears in the system tray. Users can configure visibility in "Select which icons appear on the taskbar".
- The tray icon uses ICO format (multiple resolutions: 16x16, 32x32, 48x48, 256x256).
- Balloon notifications are used on Windows 10; toast notifications on Windows 11.

### 4.2.3 Taskbar Integration

**Location**: Windows taskbar (bottom of screen by default)
**Purpose**: Application representation and progress indication

**Component Inventory**:

| Component          | Type         | Behavior                                           |
| ------------------ | ------------ | -------------------------------------------------- |
| Taskbar button     | Button       | Click to focus/minimize; right-click for jump list |
| Taskbar thumbnail  | Preview      | Hover to see window preview                        |
| Progress indicator | Overlay      | Shows agent progress (green bar)                   |
| Badge counter      | Overlay      | Shows pending notification count                   |
| Jump list          | Context menu | Recent conversations, pinned actions               |

**Jump List Items (Right-click taskbar button)**:

| Section | Items                                  |
| ------- | -------------------------------------- |
| Pinned  | "New Conversation", "Open Settings"    |
| Recent  | Last 5 conversation titles             |
| Tasks   | "New Conversation", "Toggle Dark Mode" |

**Progress Indicator States**:

- **None**: No progress bar (idle)
- **Normal (green)**: Agent task in progress (0-100%)
- **Paused (yellow)**: Agent paused, awaiting user input
- **Error (red)**: Agent encountered an error
- **Indeterminate (pulsing green)**: Agent running without measurable progress

**Windows-Specific Behavior**:

- Jump list is populated via `ICustomDestinationList` COM interface
- Progress indicator uses `ITaskbarList3::SetProgressValue` and `ITaskbarList3::SetProgressState`
- Thumbnail preview shows the current view of the application window
- Taskbar button flashes orange when a background agent completes or needs attention

## 4.3 Main Application Layout

### 4.3.1 Screen: Landing / Onboarding

**Route**: `/` (first launch only)
**Purpose**: Welcome new users and configure essential settings

**Layout**:

```
+------------------------------------------------------------------------+
| [Title Bar - See 4.2.1]                                                |
+------------------------------------------------------------------------+
|                                                                        |
|                    [AGI Workforce Logo - 128x128]                      |
|                                                                        |
|                    Welcome to AGI Workforce                            |
|                    Your AI Desktop Agent Platform                      |
|                                                                        |
|                    +-----------------------------------------+         |
|                    | Step 1 of 4: Choose Your Theme          |         |
|                    |                                         |         |
|                    | ( ) Light Mode    ( ) Dark Mode         |         |
|                    | ( ) Follow Windows Theme                |         |
|                    |                                         |         |
|                    |            [Next ->]                    |         |
|                    +-----------------------------------------+         |
|                                                                        |
+------------------------------------------------------------------------+
```

**Component Inventory**:

| Component       | Type             | Details                               |
| --------------- | ---------------- | ------------------------------------- |
| Logo            | Image            | 128x128 SVG, AGI Workforce brand mark |
| Welcome heading | h1               | "Welcome to AGI Workforce"            |
| Subtitle        | p                | "Your AI Desktop Agent Platform"      |
| Step indicator  | Text             | "Step 1 of 4: Choose Your Theme"      |
| Theme selector  | Radio group      | Three options                         |
| Next button     | Button (primary) | "Next" with right arrow               |

**Onboarding Steps (Windows-specific differences)**:

**Step 1: Theme Selection**

- Title: "Choose Your Theme"
- Options:
  - "Light Mode" - White background, dark text
  - "Dark Mode" - Dark background, light text
  - "Follow Windows Theme" (default selected) - Reads `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize\AppsUseLightTheme`
- Windows-specific: "Follow Windows Theme" option reads the Windows personalization registry key and listens for `WM_SETTINGCHANGE` events to dynamically switch themes

**Step 2: Connect Your First AI Provider**

- Title: "Connect an AI Provider"
- Provider cards with "Add API Key" buttons:
  - Anthropic (Claude) - "Most capable reasoning"
  - OpenAI (GPT-4) - "Most widely used"
  - Google (Gemini) - "Multimodal excellence"
  - Ollama (Local) - "Free, private, offline"
- Each card has an input field for the API key
- "Skip for now" link at bottom
- Windows-specific: API keys stored in Windows Credential Manager via `keyring` crate, not Keychain

**Step 3: Set Up Permissions**

- Title: "Agent Permissions"
- Permission levels:
  - "Ask me before each action" (default, selected)
  - "Auto-approve read-only actions"
  - "Auto-approve all actions (trusted mode)"
- Explanation text: "You can change this anytime in Settings."
- Windows-specific: No additional OS permissions needed (unlike macOS which needs Accessibility, Screen Recording permissions)

**Step 4: Ready to Go**

- Title: "You're All Set!"
- Summary of choices made
- "Start Using AGI Workforce" button (primary, large)
- "Take a Quick Tour" link
- Windows-specific: Optional "Start AGI Workforce with Windows" checkbox (adds to Registry Run key)

**State Variations**:

- **First launch**: Full onboarding wizard shown
- **Subsequent launches**: Skipped; goes directly to chat
- **API key validation**: Green checkmark if key validates; red error text if invalid
- **Network error**: Yellow warning: "Could not verify API key. It will be saved and verified later."

### 4.3.2 Screen: Sidebar Navigation

**Route**: N/A (persistent across all routes)
**Purpose**: Primary navigation between application sections

**Layout**:

```
+---+-------------------------------------------------------------+
|   |                                                             |
| S |                                                             |
| I |                    [Main Content Area]                       |
| D |                                                             |
| E |                                                             |
| B |                                                             |
| A |                                                             |
| R |                                                             |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Sidebar Component Inventory (top to bottom)**:

| Component     | Icon        | Label       | Route        | Tooltip                     | Shortcut |
| ------------- | ----------- | ----------- | ------------ | --------------------------- | -------- |
| New Chat      | Plus circle | "New Chat"  | `/`          | "New Conversation (Ctrl+N)" | Ctrl+N   |
| Chat History  | Clock       | "History"   | `/history`   | "Chat History (Ctrl+H)"     | Ctrl+H   |
| --- (divider) |             |             |              |                             |          |
| Agents        | Bot         | "Agents"    | `/agents`    | "Active Agents"             |          |
| Skills        | Sparkles    | "Skills"    | `/skills`    | "AI Skills Marketplace"     |          |
| Research      | Search      | "Research"  | `/research`  | "Research Mode"             |          |
| --- (divider) |             |             |              |                             |          |
| Terminal      | Terminal    | "Terminal"  | `/terminal`  | "Terminal (Ctrl+`)"         | Ctrl+`   |
| Files         | Folder      | "Files"     | `/files`     | "File Browser"              |          |
| Browser       | Globe       | "Browser"   | `/browser`   | "Browser Automation"        |          |
| --- (divider) |             |             |              |                             |          |
| Analytics     | BarChart    | "Analytics" | `/analytics` | "Usage Analytics"           |          |
| Settings      | Gear        | "Settings"  | `/settings`  | "Settings (Ctrl+,)"         | Ctrl+,   |

**Windows-Specific Behavior**:

- **Keyboard shortcuts**: All use Ctrl instead of Cmd
- **Sidebar width**: Default 48px (collapsed), 220px (expanded)
- **Collapse/expand**: Click hamburger icon or press Ctrl+B
- **Right-click sidebar item**: No context menu (unlike macOS which may show Dock-style options)
- **Scrollbar**: Windows-style scrollbar appears if sidebar content overflows (wider than macOS scrollbar)

**Interaction Flows**:

1. User clicks "New Chat":
   - New conversation created with default model
   - Chat input focused
   - Conversation appears in History sidebar

2. User presses Ctrl+N:
   - Same as clicking "New Chat"
   - If a conversation is active with unsaved content, no confirmation dialog (draft is auto-saved)

3. User hovers over sidebar item:
   - Tooltip appears after 500ms delay
   - Background color changes to hover state (varies by theme)

**State Variations**:

- **Collapsed**: Only icons visible (48px wide)
- **Expanded**: Icons + labels visible (220px wide)
- **Active item**: Highlighted with accent color, left border indicator
- **Notifications**: Red badge on "Agents" icon when agents complete/error

### 4.3.3 Screen: Main Chat Interface

**Route**: `/` or `/chat/:conversationId`
**Purpose**: Primary agentic chat interaction

**Layout**:

```
+---+-------------------------------------------------------------+
|   | [Model Selector] [Conv Title] [Plus Menu] [Settings Toggle] |
|   +-------------------------------------------------------------+
|   |                                                             |
| S |  [Message List - Scrollable]                                |
| I |                                                             |
| D |  +-------------------------------------------------------+ |
| E |  | [User Avatar] User Message                            | |
| B |  +-------------------------------------------------------+ |
| A |  | [AI Avatar] AI Response                               | |
| R |  |   [Tool Timeline - Collapsible]                       | |
| B |  |   [Thinking Panel - Collapsible]                      | |
| A |  +-------------------------------------------------------+ |
| R |                                                             |
|   +-------------------------------------------------------------+
|   | [Attachments Bar]                                           |
|   | [+] [Chat Input - Multiline]            [Send] [Stop]      |
|   +-------------------------------------------------------------+
```

**Component Inventory - Chat Header**:

| Component          | Type             | Details                                            | Windows Shortcut |
| ------------------ | ---------------- | -------------------------------------------------- | ---------------- |
| Model Selector     | Dropdown         | Current model name + provider icon                 | Ctrl+M           |
| Conversation Title | Editable text    | Click to rename; auto-generated from first message |                  |
| Plus Menu          | Button + Popover | Attach file, paste image, record audio             |                  |
| Settings Toggle    | Icon button      | Opens right-side settings panel                    | Ctrl+Shift+S     |
| Budget Tracker     | Badge            | Shows remaining budget/tokens                      |                  |

**Component Inventory - Message List**:

| Component      | Type         | Details                                                             |
| -------------- | ------------ | ------------------------------------------------------------------- |
| User message   | Card         | Right-aligned, user avatar, message text, timestamp                 |
| AI message     | Card         | Left-aligned, model avatar, response text, metadata                 |
| Tool Timeline  | Collapsible  | Shows tool executions (Read, Write, Bash, WebSearch) with durations |
| Tool Label     | Inline badge | "Read(path)", "Write(path)", "Bash(cmd)" - Claude Code style        |
| Thinking Panel | Collapsible  | Shows model's reasoning/thinking content                            |
| Artifact Card  | Embedded     | Code blocks, images, files rendered inline                          |
| Cost Badge     | Inline       | "0.003 credits" per message                                         |
| Copy Button    | Icon button  | Copies AI response to clipboard                                     |
| Retry Button   | Icon button  | Re-sends the prompt                                                 |
| Edit Button    | Icon button  | Edits a sent message                                                |

**Component Inventory - Input Area**:

| Component            | Type            | Details                                          | Windows Shortcut |
| -------------------- | --------------- | ------------------------------------------------ | ---------------- |
| Plus Menu Button [+] | Icon button     | Opens attachment popover                         |                  |
| Chat Input           | Textarea        | Auto-resizing, 1-10 lines, placeholder text      |                  |
| Send Button          | Icon button     | Sends message                                    | Enter            |
| Stop Button          | Icon button     | Stops generation (appears during streaming)      | Escape           |
| Voice Input Button   | Icon button     | Hold to record audio                             | Ctrl+Shift+V     |
| Attachments Bar      | Horizontal list | Shows attached files as chips with remove button |                  |

**Exact Copy/Wording**:

- Input placeholder: "Send a message... (Enter to send, Shift+Enter for new line)"
- Empty state heading: "Start a new conversation"
- Empty state subtext: "Ask anything. Your AI agent can read files, run commands, browse the web, and more."
- Stop button tooltip: "Stop generating (Escape)"
- Send button tooltip: "Send message (Enter)"
- Copy button tooltip: "Copy to clipboard"
- Retry button tooltip: "Regenerate response"
- Tool timeline header: "Tool executions" with chevron toggle
- Thinking panel header: "Thinking..." (during) or "Thought for [Xs]" (complete)
- Cost badge format: "0.003 credits"
- Budget warning: "Budget limit approaching. [X] credits remaining."
- Budget exceeded: "Session budget exceeded. Start a new conversation or increase the limit in Settings."

**Windows-Specific Behavior**:

1. **Enter to send, Shift+Enter for newline**: Same as macOS but documented as "Enter" not "Return"
2. **File drag-and-drop**: User can drag files from Windows Explorer directly into the chat input area
   - Drop zone visual: Border turns blue, background shows "Drop files here to attach"
   - Supported: Images (PNG, JPG, WEBP), PDFs, text files, code files
   - Unsupported file types: Shows toast "File type not supported for attachment"
3. **Paste from clipboard**: Ctrl+V pastes images from clipboard (screenshot via Win+Shift+S)
4. **Context menu (right-click in chat)**:
   - On user message: "Edit", "Copy", "Delete"
   - On AI message: "Copy", "Copy Code Block", "Regenerate", "View Raw"
   - On selected text: "Copy", "Search", "Ask about this"
5. **Scrollbar**: Windows-style scrollbar (wider, always visible in some themes)
6. **Font rendering**: Uses ClearType; may appear slightly different from macOS
7. **Selection**: Standard Windows text selection (click-drag, Shift+click, Ctrl+A)
8. **Keyboard navigation**: Tab moves between interactive elements; Enter activates buttons

**Interaction Flows**:

1. User types message and presses Enter:
   - Message appears in chat with user avatar
   - Send button transforms to Stop button
   - AI response streams in token-by-token
   - Tool executions appear in timeline as they occur
   - Cost badge updates in real-time
   - Send button reappears when streaming completes

2. User clicks Plus Menu [+]:
   - Popover appears with options:
     - "Attach File" - Opens Windows file picker (common dialog)
     - "Paste Image" - Pastes from clipboard
     - "Record Audio" - Starts microphone recording
     - "Take Screenshot" - Captures screen region (Win+Shift+S style)
   - File picker uses native Windows common dialog (not custom)
   - Multiple file selection supported (Ctrl+click, Shift+click)

3. User drags file from Windows Explorer:
   - Drop zone activates (blue border)
   - File thumbnail appears in Attachments Bar
   - File path shown with Windows backslash format
   - Size shown in human-readable format (KB, MB)

4. User presses Escape during streaming:
   - Generation stops immediately
   - Partial response preserved
   - "Generation stopped" indicator shown
   - Send button reappears

5. User clicks model selector:
   - Dropdown opens with all configured models
   - Models grouped by provider (Anthropic, OpenAI, Google, Local)
   - Current model highlighted
   - Each model shows: name, provider, context window, cost tier
   - Keyboard: Arrow keys navigate, Enter selects, Escape closes

**State Variations**:

| State                       | Visual                                  | Behavior                                                       |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| Empty                       | Welcome illustration + suggestion cards | Clicking a suggestion sends it as a message                    |
| Loading                     | Skeleton animation in message area      | Input disabled                                                 |
| Streaming                   | Cursor blinking at end of AI response   | Stop button visible                                            |
| Error                       | Red error card with retry button        | "Something went wrong. Click to retry."                        |
| Budget exceeded             | Yellow warning bar at top               | Input disabled with explanation                                |
| Offline (no LLM configured) | Gray overlay                            | "No AI provider configured. Go to Settings to add one."        |
| Agent running               | Pulsing indicator in header             | Shows agent status and tool count                              |
| Agent paused                | Yellow "Paused" badge                   | "Agent is waiting for your approval" with Approve/Deny buttons |

### 4.3.4 Screen: Model Selector Dropdown

**Route**: N/A (overlay within chat)
**Purpose**: Select the active AI model for the current conversation

**Layout**:

```
+-----------------------------------------------+
| [Search Models...]                      [X]   |
+-----------------------------------------------+
| Cloud Models                                  |
|   [Anthropic Logo] Claude 3.5 Sonnet     [*] |
|   [Anthropic Logo] Claude 3 Opus             |
|   [OpenAI Logo] GPT-4o                       |
|   [OpenAI Logo] GPT-4o mini                  |
|   [Google Logo] Gemini 1.5 Pro               |
|   [Google Logo] Gemini 2.0 Flash             |
|   [Mistral Logo] Mistral Large               |
|   [DeepSeek Logo] DeepSeek V3               |
+-----------------------------------------------+
| Local Models                                  |
|   [Ollama Logo] llama3:latest                |
|   [Ollama Logo] codellama:13b               |
|   [LM Studio Logo] custom-model-1           |
+-----------------------------------------------+
| + Add Custom Model                            |
+-----------------------------------------------+
```

**Component Inventory**:

| Component        | Type           | Details                                          |
| ---------------- | -------------- | ------------------------------------------------ |
| Search input     | Text input     | Placeholder: "Search models..."                  |
| Close button     | Icon button    | Closes dropdown                                  |
| Section header   | Label          | "Cloud Models", "Local Models"                   |
| Model row        | Selectable row | Provider icon + model name + star (if favorited) |
| Active indicator | Check icon     | Shows current selection                          |
| Add Custom Model | Button link    | Opens custom model dialog                        |

**Exact Copy/Wording**:

- Search placeholder: "Search models..."
- Cloud section: "Cloud Models"
- Local section: "Local Models"
- No models: "No models configured. Add an API key in Settings."
- No search results: "No models matching '[query]'"
- Add custom: "+ Add Custom Model"
- Model unavailable: "[Model Name] - Offline" (grayed out)

**Windows-Specific Behavior**:

- Dropdown appears below the model selector button, aligned left
- Max height: 60% of window height, scrollable
- Keyboard: Arrow keys navigate, Enter selects, Escape closes, typing filters
- Focus trap: Tab stays within dropdown while open
- Click outside: Closes dropdown

### 4.3.5 Screen: Plus Menu (Attachment Popover)

**Route**: N/A (popover within chat input)
**Purpose**: Attach files, images, audio, or screenshots to a message

**Layout**:

```
+-----------------------------------+
| [File Icon] Attach File           |
| [Image Icon] Paste Image         |
| [Mic Icon] Record Audio          |
| [Camera Icon] Take Screenshot    |
| [Globe Icon] Add URL             |
+-----------------------------------+
```

**Component Inventory**:

| Component       | Icon       | Action                      | Windows Shortcut |
| --------------- | ---------- | --------------------------- | ---------------- |
| Attach File     | Paperclip  | Opens Windows file picker   | Ctrl+Shift+A     |
| Paste Image     | Image      | Pastes image from clipboard | Ctrl+V (auto)    |
| Record Audio    | Microphone | Starts voice recording      | Ctrl+Shift+V     |
| Take Screenshot | Camera     | Opens region capture        | Win+Shift+S      |
| Add URL         | Globe      | Opens URL input field       |                  |

**Exact Copy/Wording**:

- "Attach File" - opens file dialog
- "Paste Image" - reads clipboard
- "Record Audio" - starts microphone
- "Take Screenshot" - captures screen region
- "Add URL" - enters a URL to fetch

**Windows-Specific Behavior**:

- "Attach File" opens the native Windows common file dialog (`IFileOpenDialog`)
- File type filters: "All Supported Files", "Images", "Documents", "Code Files"
- "Take Screenshot" triggers the Windows Snipping Tool workflow or custom region selection
- "Record Audio" uses WASAPI audio capture (cpal backend)
- Keyboard: Arrow keys navigate, Enter activates, Escape closes

### 4.3.6 Screen: Chat History

**Route**: `/history`
**Purpose**: Browse, search, and manage past conversations

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Chat History                              [Search] [Filter] |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | [Search Bar: "Search conversations..."]                     |
| I |                                                             |
| D | Today                                                       |
| E |   [Conv Icon] Build a REST API             3:45 PM    [...] |
| B |   [Conv Icon] Debug TypeScript error        2:10 PM    [...] |
| A |                                                             |
| R | Yesterday                                                   |
| B |   [Conv Icon] Write marketing copy          5:30 PM    [...] |
| A |   [Conv Icon] Analyze quarterly report      1:15 PM    [...] |
| R |                                                             |
|   | Last Week                                                   |
|   |   [Conv Icon] Set up CI/CD pipeline         Mar 3     [...] |
|   |   [Conv Icon] Research competitor analysis  Mar 2     [...] |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component          | Type          | Details                                 |
| ------------------ | ------------- | --------------------------------------- |
| Page title         | h1            | "Chat History"                          |
| Search bar         | Text input    | "Search conversations..."               |
| Filter button      | Dropdown      | Filter by model, date range, tags       |
| Date group header  | Label         | "Today", "Yesterday", "Last Week", etc. |
| Conversation row   | Clickable row | Icon + title + time + actions menu      |
| Actions menu [...] | Dropdown      | "Rename", "Export", "Delete"            |
| Empty state        | Illustration  | "No conversations yet"                  |
| Load more          | Button        | "Load more conversations" at bottom     |

**Exact Copy/Wording**:

- Page title: "Chat History"
- Search placeholder: "Search conversations..."
- Empty state: "No conversations yet. Start a new chat to begin."
- Delete confirmation: "Are you sure you want to delete this conversation? This action cannot be undone."
- Delete button: "Delete"
- Cancel button: "Cancel"
- Export options: "Export as Markdown", "Export as JSON", "Export as PDF"

**Windows-Specific Behavior**:

- Right-click on a conversation row opens context menu: "Open", "Open in New Window", "Rename", "Export", "Delete"
- Delete key deletes selected conversation (with confirmation dialog)
- Ctrl+F focuses the search bar
- Conversation list uses virtualized rendering (react-window) for performance with thousands of items
- Export as PDF opens Windows print dialog with "Microsoft Print to PDF" option
- Scrollbar: Windows native style

**Interaction Flows**:

1. User clicks a conversation:
   - Navigates to `/chat/:conversationId`
   - Conversation messages load
   - Chat input focuses

2. User right-clicks a conversation:
   - Windows context menu appears
   - Options: "Open", "Open in New Window", "Rename", "Export", "Delete"

3. User types in search bar:
   - Conversations filter in real-time
   - Matching text highlighted in results
   - Full-text search across message content

4. User clicks [...] actions menu:
   - Dropdown appears: "Rename", "Export", "Delete"
   - "Rename" opens inline text editor
   - "Export" shows sub-menu with format options
   - "Delete" shows confirmation dialog

### 4.3.7 Screen: Settings Panel

**Route**: `/settings`
**Purpose**: Application configuration

**Layout**:

```
+---+-------------------+----------------------------------------+
|   | Settings          |                                        |
|   +-------------------+                                        |
|   |                   |                                        |
| S | [General]         |  [Setting Detail Area]                 |
| I | [API Keys]        |                                        |
| D | [Models]          |  Dynamically rendered based on         |
| E | [Appearance]      |  selected settings category            |
| B | [Chat]            |                                        |
| A | [Notifications]   |                                        |
| R | [MCP Tools]       |                                        |
| B | [Security]        |                                        |
| A | [Advanced]        |                                        |
| R | [About]           |                                        |
|   |                   |                                        |
+---+-------------------+----------------------------------------+
```

**Settings Categories and Items**:

#### 4.3.7.1 General Settings

| Setting                         | Type        | Default                 | Description                            | Windows-Specific         |
| ------------------------------- | ----------- | ----------------------- | -------------------------------------- | ------------------------ |
| Language                        | Dropdown    | "English"               | UI language selection                  |                          |
| Start on Windows startup        | Toggle      | Off                     | Adds HKCU\...\Run registry entry       | Yes                      |
| Close to system tray            | Toggle      | Off                     | Minimize to notification area on close | Yes                      |
| Check for updates automatically | Toggle      | On                      | Tauri updater check interval           |                          |
| Default download location       | Path picker | %USERPROFILE%\Downloads | Where exported files are saved         | Yes (Windows path)       |
| Terminal shell                  | Dropdown    | "PowerShell"            | Default shell for terminal             | Yes (PowerShell/CMD/WSL) |

**Exact Copy/Wording**:

- "Start AGI Workforce when Windows starts" (toggle label)
- "Minimize to system tray instead of closing" (toggle label)
- "Automatically check for updates" (toggle label)
- "Default download location" (path picker label)
- "Default terminal shell" (dropdown label)
- Shell options: "PowerShell", "Command Prompt (cmd)", "WSL (Bash)", "Git Bash"

**Windows-Specific Behavior**:

- "Start on Windows startup" toggle writes to `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` with value `"AGI Workforce"="<path>\AGI Workforce.exe" --minimized`
- "Close to system tray" changes the behavior of the window close button
- "Default terminal shell" dropdown detects available shells (PowerShell always available, CMD always available, WSL detected via `wsl --status`, Git Bash detected via `where git`)
- Path picker uses Windows folder picker dialog (`IFileDialog` with `FOS_PICKFOLDERS`)

#### 4.3.7.2 API Keys Settings

| Setting            | Type           | Default | Description      | Windows-Specific                     |
| ------------------ | -------------- | ------- | ---------------- | ------------------------------------ |
| Anthropic API Key  | Password input | (empty) | Claude models    | Stored in Windows Credential Manager |
| OpenAI API Key     | Password input | (empty) | GPT models       | Stored in Windows Credential Manager |
| Google AI API Key  | Password input | (empty) | Gemini models    | Stored in Windows Credential Manager |
| Mistral API Key    | Password input | (empty) | Mistral models   | Stored in Windows Credential Manager |
| Groq API Key       | Password input | (empty) | Groq models      | Stored in Windows Credential Manager |
| DeepSeek API Key   | Password input | (empty) | DeepSeek models  | Stored in Windows Credential Manager |
| OpenRouter API Key | Password input | (empty) | OpenRouter relay | Stored in Windows Credential Manager |

Each API key row:

| Component        | Type           | Details                                                |
| ---------------- | -------------- | ------------------------------------------------------ |
| Provider icon    | Image          | Provider logo                                          |
| Provider name    | Label          | "Anthropic (Claude)"                                   |
| API key input    | Password input | Masked with bullets; "Enter your API key" placeholder  |
| Show/hide toggle | Icon button    | Eye icon to toggle visibility                          |
| Verify button    | Button         | "Verify" - tests the key                               |
| Status indicator | Badge          | "Connected" (green), "Invalid" (red), "Not set" (gray) |
| Remove button    | Icon button    | Trash icon, with confirmation                          |

**Exact Copy/Wording**:

- Section header: "API Keys"
- Section description: "Connect your AI providers. API keys are encrypted and stored securely in Windows Credential Manager."
- Input placeholder: "Enter your API key"
- Verify button: "Verify"
- Status badges: "Connected", "Invalid Key", "Not Configured"
- Remove confirmation: "Remove API key for [Provider]? You will need to re-enter it to use [Provider] models."
- Security note: "Your API keys are encrypted with AES-256 and stored in Windows Credential Manager. They never leave your device."

**Windows-Specific Behavior**:

- API keys are stored via `keyring` crate which uses Windows Credential Manager (Windows Vault)
- Keys can be viewed/managed in Windows Control Panel > User Accounts > Credential Manager > Windows Credentials
- Keys are stored under the service name "agi-workforce" with usernames like "anthropic-api-key"
- If Windows Credential Manager is unavailable (very rare), falls back to SecretManager encrypted SQLite storage

#### 4.3.7.3 Models Settings

| Setting                 | Type         | Default             | Description                        |
| ----------------------- | ------------ | ------------------- | ---------------------------------- |
| Default model           | Dropdown     | "Claude 3.5 Sonnet" | Model used for new conversations   |
| Routing strategy        | Dropdown     | "Auto"              | Provider selection strategy        |
| Context window override | Number input | (model default)     | Override model context window      |
| Temperature             | Slider       | 0.7                 | Generation temperature (0.0 - 2.0) |
| Max tokens              | Number input | 4096                | Maximum response length            |
| Custom models           | List         | (empty)             | User-added custom endpoints        |

**Exact Copy/Wording**:

- "Default Model" dropdown label
- "Routing Strategy" dropdown label with tooltip: "How AGI Workforce selects which AI provider to use"
- Strategy options: "Auto (Recommended)", "Economy (Cheapest)", "Balanced", "Premium (Best Quality)", "Cost Optimized", "Latency Optimized", "Local First"

#### 4.3.7.4 Appearance Settings

| Setting           | Type         | Default                | Description                    | Windows-Specific      |
| ----------------- | ------------ | ---------------------- | ------------------------------ | --------------------- |
| Theme             | Radio group  | "Follow Windows Theme" | Light/Dark/System              | Yes                   |
| Accent color      | Color picker | System accent          | UI accent color                | Reads Windows accent  |
| Font size         | Slider       | 14px                   | Base font size (12-20px)       |                       |
| Sidebar collapsed | Toggle       | Off                    | Default sidebar state          |                       |
| Code font         | Dropdown     | "Cascadia Mono"        | Font for code blocks           | Yes (Windows default) |
| Message density   | Radio group  | "Normal"               | "Compact", "Normal", "Relaxed" |                       |

**Windows-Specific Behavior**:

- "Follow Windows Theme" reads `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize\AppsUseLightTheme`
  - Value 0 = Dark mode, Value 1 = Light mode
  - Listens for `WM_SETTINGCHANGE` to dynamically switch
- "Accent color" defaults to Windows system accent color
  - Read from `HKCU\SOFTWARE\Microsoft\Windows\DWM\AccentColor`
  - On Windows 11, uses the "Show accent color on title bars and window borders" setting
- Default code font: "Cascadia Mono" (ships with Windows Terminal), falls back to "Consolas"

#### 4.3.7.5 Chat Settings

| Setting            | Type         | Default | Description                                   |
| ------------------ | ------------ | ------- | --------------------------------------------- |
| Send with Enter    | Toggle       | On      | Enter sends, Shift+Enter for newline          |
| Auto-scroll        | Toggle       | On      | Auto-scroll to bottom on new messages         |
| Show thinking      | Toggle       | On      | Show model reasoning panel                    |
| Show tool timeline | Toggle       | On      | Show tool execution timeline                  |
| Show cost          | Toggle       | On      | Show per-message cost                         |
| Session budget     | Number input | $50.00  | Maximum spend per session                     |
| Auto-title         | Toggle       | On      | Auto-generate conversation titles             |
| Markdown rendering | Toggle       | On      | Render markdown in responses                  |
| Code execution     | Toggle       | Off     | Allow code execution in sandboxed environment |

#### 4.3.7.6 Notifications Settings

| Setting              | Type   | Default | Description                      | Windows-Specific                 |
| -------------------- | ------ | ------- | -------------------------------- | -------------------------------- |
| Enable notifications | Toggle | On      | Show system notifications        | Uses Windows Notification Center |
| Agent completion     | Toggle | On      | Notify when agent finishes       |                                  |
| Agent error          | Toggle | On      | Notify when agent errors         |                                  |
| Update available     | Toggle | On      | Notify when update is ready      |                                  |
| Sound                | Toggle | On      | Play notification sounds         | Uses Windows system sounds       |
| Focus assist respect | Toggle | On      | Suppress when Focus Assist is on | Yes (Windows 10/11)              |

**Windows-Specific Behavior**:

- Notifications use `tauri-plugin-notification` which maps to Windows Notification Center
- On Windows 10: Notifications appear in the Action Center
- On Windows 11: Notifications appear in the Notification Center (top-right bell icon)
- "Focus Assist respect" checks Windows Focus Assist / Do Not Disturb state before showing notifications
- Notification sounds use the Windows default notification sound (configurable in Windows Settings > System > Sound)
- Notifications can include action buttons: "View", "Dismiss"
- Notification icon: AGI Workforce logo

#### 4.3.7.7 MCP Tools Settings

| Setting          | Type            | Default       | Description                  |
| ---------------- | --------------- | ------------- | ---------------------------- |
| MCP servers list | Table           | Per .mcp.json | Connected MCP servers        |
| Add server       | Button          |               | Add stdio/SSE/HTTP server    |
| Server status    | Badge           |               | Connected/Disconnected/Error |
| Tool permission  | Per-tool toggle | Ask           | Ask/Auto-approve per tool    |
| Circuit breaker  | Read-only       |               | Open/Closed/HalfOpen status  |

**Exact Copy/Wording**:

- Section header: "MCP Tools"
- Add button: "+ Add MCP Server"
- Server status: "Connected" (green), "Disconnected" (gray), "Error" (red), "Circuit Open" (yellow)
- Permission modes: "Ask before use", "Auto-approve (read-only)", "Auto-approve (all)"

#### 4.3.7.8 Security Settings

| Setting              | Type           | Default    | Description                 | Windows-Specific            |
| -------------------- | -------------- | ---------- | --------------------------- | --------------------------- |
| Master password      | Toggle + input | Disabled   | Encrypt local database      |                             |
| Auto-lock timeout    | Dropdown       | "Never"    | Lock app after inactivity   |                             |
| Tool approval mode   | Radio group    | "Ask"      | Global tool permission      |                             |
| Allowed paths        | List           | All        | Restrict file system access |                             |
| Blocked commands     | List           | (defaults) | Shell commands to block     | PowerShell-specific entries |
| Audit logging        | Toggle         | On         | Log all tool executions     |                             |
| ToolGuard strictness | Dropdown       | "Standard" | Safety level                |                             |

**Exact Copy/Wording**:

- "Master Password" label with description: "Protect your data with an additional encryption layer. If you forget this password, you will lose access to stored API keys."
- "Auto-lock after" options: "Never", "1 minute", "5 minutes", "15 minutes", "30 minutes", "1 hour"
- "Tool Approval" options: "Ask me before each action", "Auto-approve read-only", "Auto-approve all (trusted mode)"
- Warning for "Auto-approve all": "Warning: Agents will execute any action without asking. Only use this if you trust all connected AI providers."

**Windows-Specific Behavior**:

- Blocked commands include Windows-specific entries: `format`, `del /s`, `rmdir /s`, `reg delete`, `net user`, `net localgroup`
- PowerShell-specific blocked commands: `Remove-Item -Recurse`, `Set-ExecutionPolicy Unrestricted`, `Invoke-Expression`
- Audit log file location: `%LOCALAPPDATA%\AGI Workforce\logs\audit.log`

#### 4.3.7.9 Advanced Settings

| Setting               | Type         | Default                      | Description              | Windows-Specific               |
| --------------------- | ------------ | ---------------------------- | ------------------------ | ------------------------------ |
| Data directory        | Path         | %LOCALAPPDATA%\AGI Workforce | App data location        | Yes                            |
| Log level             | Dropdown     | "Info"                       | Logging verbosity        |                                |
| Proxy settings        | Input fields | (empty)                      | HTTP/HTTPS proxy         | Windows system proxy detection |
| GPU acceleration      | Toggle       | On                           | WebView2 GPU rendering   | DirectX acceleration           |
| Hardware acceleration | Toggle       | On                           | Use GPU for rendering    |                                |
| Developer tools       | Toggle       | Off                          | Enable WebView2 DevTools | F12 to open                    |
| Custom CSS            | Textarea     | (empty)                      | Inject custom styles     |                                |
| Export data           | Button       |                              | Export all app data      |                                |
| Import data           | Button       |                              | Import app data backup   |                                |
| Reset to defaults     | Button       |                              | Reset all settings       |                                |

**Exact Copy/Wording**:

- "Data Directory" with description: "Location where AGI Workforce stores conversations, settings, and cached data."
- "Proxy Settings" with description: "Configure HTTP/HTTPS proxy for AI provider connections. Leave empty to use Windows system proxy settings."
- "Export All Data" button with description: "Export conversations, settings, and configurations as a ZIP archive."
- "Reset to Defaults" button with warning: "This will reset all settings to their default values. Your conversations and API keys will not be affected."
- Data directory default: `C:\Users\[Username]\AppData\Local\AGI Workforce`

**Windows-Specific Behavior**:

- "Proxy settings" auto-detects Windows system proxy from `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings\ProxyServer`
- "GPU acceleration" uses DirectX for WebView2 rendering
- Developer tools opened with F12 (WebView2 DevTools, equivalent to Chrome DevTools)
- "Data directory" shows `%LOCALAPPDATA%\AGI Workforce` which resolves to `C:\Users\<name>\AppData\Local\AGI Workforce`
- Export creates a `.zip` file; Windows uses its built-in zip handler

#### 4.3.7.10 About Settings

| Component         | Type       | Details                                        |
| ----------------- | ---------- | ---------------------------------------------- |
| App logo          | Image      | AGI Workforce logo (large)                     |
| Version           | Text       | "Version 1.1.5"                                |
| Build info        | Text       | "Windows x64 - Build 2026.03.09"               |
| Runtime info      | Text       | "Tauri 2.9.3, WebView2 [version], Rust 1.90.0" |
| License           | Link       | "Proprietary License"                          |
| Website           | Link       | "agiworkforce.com"                             |
| GitHub            | Link       | "github.com/agiworkforce/agiworkforce"         |
| Check for updates | Button     | "Check for Updates"                            |
| System info       | Expandable | OS version, RAM, CPU, GPU, display info        |

**Windows-Specific System Info**:

- OS: "Windows 11 Pro 24H2 (Build 26100)"
- CPU: "Intel Core i9-13900K (24 cores)"
- RAM: "32 GB"
- GPU: "NVIDIA GeForce RTX 4080"
- Display: "3840x2160 @ 150% scaling"
- WebView2: "Microsoft Edge WebView2 Runtime 122.0.2365.92"

### 4.3.8 Screen: Agent Monitor

**Route**: `/agents`
**Purpose**: View and manage running agents

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Active Agents (3)                            [+ New Agent]   |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | +---[Agent Card]--------------------------------------+     |
| I | | [Bot Icon] Research Agent              [Running] [...] |  |
| D | | Task: "Analyze Q4 market trends"                     |  |
| E | | Started: 2:30 PM | Duration: 1h 15m | 42 actions    |  |
| B | | Progress: [=========>                   ] 45%         |  |
| A | | Last action: Read(quarterly_report.xlsx)              |  |
| R | +----------------------------------------------------+   |
| B |                                                             |
| A | +---[Agent Card]--------------------------------------+     |
| R | | [Bot Icon] Code Agent                  [Paused] [...] |  |
|   | | Task: "Refactor authentication module"                |  |
|   | | Started: 3:00 PM | Duration: 45m | 28 actions        |  |
|   | | Status: Awaiting approval for Write(auth.ts)          |  |
|   | | [Approve] [Deny] [View Details]                       |  |
|   | +----------------------------------------------------+   |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory - Agent Card**:

| Component          | Type         | Details                                                                                  |
| ------------------ | ------------ | ---------------------------------------------------------------------------------------- |
| Agent icon         | Icon         | Bot icon with status color                                                               |
| Agent name         | Text         | User-assigned or auto-generated                                                          |
| Status badge       | Badge        | "Running" (green), "Paused" (yellow), "Completed" (blue), "Error" (red), "Queued" (gray) |
| Actions menu [...] | Dropdown     | "View Details", "Pause", "Resume", "Stop", "Restart"                                     |
| Task description   | Text         | Brief description of what the agent is doing                                             |
| Timing info        | Text         | Start time, duration, action count                                                       |
| Progress bar       | Progress     | Visual progress indicator (when measurable)                                              |
| Last action        | Label        | Tool label in Claude Code style (e.g., "Read(file.txt)")                                 |
| Approval buttons   | Button group | "Approve", "Deny", "View Details" (when paused)                                          |

**Exact Copy/Wording**:

- Page title: "Active Agents ([count])"
- New agent button: "+ New Agent"
- Status badges: "Running", "Paused", "Completed", "Error", "Queued", "Stopped"
- No agents: "No active agents. Start an agent from the chat interface."
- Stop confirmation: "Stop [Agent Name]? Any in-progress work will be lost."
- Approve button: "Approve"
- Deny button: "Deny"

**Windows-Specific Behavior**:

- When agents are running, the taskbar button shows a green progress bar
- When an agent needs approval, the taskbar button flashes orange
- Notification: "Agent '[Name]' needs your approval" appears in Windows Notification Center
- Right-click agent card: Windows context menu with "View Details", "Pause", "Stop", "Copy Task"

### 4.3.9 Screen: Skills Marketplace

**Route**: `/skills`
**Purpose**: Browse, search, and activate AI skills

**Layout**:

```
+---+-------------------------------------------------------------+
|   | AI Skills (169+)          [Search Skills...] [Grid] [List]  |
|   +-------------------------------------------------------------+
|   | [Category Tabs: All | Business | Dev | Creative | ...]      |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | [Skill Card] [Skill Card] [Skill Card] [Skill Card]        |
| I | [Skill Card] [Skill Card] [Skill Card] [Skill Card]        |
| D | [Skill Card] [Skill Card] [Skill Card] [Skill Card]        |
| E |                                                             |
| B | Load More...                                                |
| A |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component     | Type         | Details                                                                                               |
| ------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| Page title    | h1           | "AI Skills (169+)"                                                                                    |
| Search bar    | Text input   | "Search skills..."                                                                                    |
| View toggle   | Button group | Grid view / List view                                                                                 |
| Category tabs | Tab bar      | "All", "Business", "Development", "Creative", "Healthcare", "Legal", "Finance", "Education", "Trades" |
| Skill card    | Card         | Icon + name + category + description + activate button                                                |
| Load more     | Button       | Pagination                                                                                            |

**Skill Card Component**:

| Component       | Type        | Details                                   |
| --------------- | ----------- | ----------------------------------------- |
| Skill icon      | Icon/Emoji  | Category-appropriate icon                 |
| Skill name      | h3          | e.g., "Contract Review Assistant"         |
| Category badge  | Badge       | e.g., "Legal"                             |
| Description     | p           | Brief skill description (2 lines max)     |
| Activate button | Button      | "Activate" (outline) or "Active" (filled) |
| More info       | Icon button | Opens skill detail modal                  |

**Exact Copy/Wording**:

- Search placeholder: "Search skills..."
- Empty search: "No skills matching '[query]'. Try a different search term."
- Activate button: "Activate"
- Deactivate button: "Active" (with check icon)

### 4.3.10 Screen: Terminal

**Route**: `/terminal`
**Purpose**: Integrated terminal for command execution

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Terminal                    [+] [Split] [Shell: PowerShell] |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | PS C:\Users\user> _                                        |
| I |                                                             |
| D | (xterm.js terminal emulator)                                |
| E |                                                             |
| B |                                                             |
| A |                                                             |
| R |                                                             |
| B |                                                             |
| A |                                                             |
| R |                                                             |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component        | Type     | Details                               | Windows-Specific                       |
| ---------------- | -------- | ------------------------------------- | -------------------------------------- |
| Terminal title   | h1       | "Terminal"                            |                                        |
| New tab [+]      | Button   | Opens new terminal tab                |                                        |
| Split button     | Button   | Splits terminal pane                  |                                        |
| Shell selector   | Dropdown | Current shell type                    | "PowerShell", "CMD", "WSL", "Git Bash" |
| Terminal display | xterm.js | Terminal emulator with WebGL renderer |                                        |
| Tab bar          | Tabs     | Multiple terminal tabs                |                                        |

**Exact Copy/Wording**:

- "Terminal" page title
- Shell options: "PowerShell", "Command Prompt", "WSL (Bash)", "Git Bash"
- New tab tooltip: "New Terminal (Ctrl+Shift+`)"
- Split tooltip: "Split Terminal"

**Windows-Specific Behavior**:

- Default shell: PowerShell (detected via `$env:COMSPEC` for CMD, `where pwsh` for PowerShell 7, `wsl --status` for WSL)
- Terminal uses ConPTY on Windows (via portable-pty crate) instead of Unix PTY
- PowerShell prompt: `PS C:\Users\user> `
- CMD prompt: `C:\Users\user>`
- WSL prompt: `user@hostname:~$`
- Ctrl+C: Sends interrupt signal
- Ctrl+V: Paste from clipboard (standard Windows paste)
- Right-click: Paste (if terminal text not selected), Copy (if text selected)
- Font: "Cascadia Mono" (default), falls back to "Consolas"
- Color scheme: Matches application dark/light theme

### 4.3.11 Screen: File Browser

**Route**: `/files`
**Purpose**: Browse and manage files on the local system

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Files                [Path Bar: C:\Users\user\Documents]     |
|   +-------------------------------------------------------------+
|   | [<- Back] [-> Forward] [Up] [Home] [Refresh]                |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | Name                  Size      Modified          Type       |
| I | [Folder] Documents    --        Mar 8, 2026       Folder     |
| D | [Folder] Projects     --        Mar 7, 2026       Folder     |
| E | [File] report.pdf     2.4 MB    Mar 6, 2026       PDF        |
| B | [File] notes.md       12 KB     Mar 5, 2026       Markdown   |
| A | [File] data.xlsx      145 KB    Mar 4, 2026       Excel      |
| R |                                                             |
+---+-------------------------------------------------------------+
```

**Windows-Specific Behavior**:

- Path bar uses backslash separators: `C:\Users\user\Documents`
- Drive letter prefix: `C:\`, `D:\`, etc.
- Home directory: `%USERPROFILE%` (typically `C:\Users\<name>`)
- Hidden files: Respects Windows hidden file attribute
- File icons: Mapped from file extension (not MIME type)
- Double-click folder: Navigate into
- Double-click file: Open with default Windows application (`ShellExecuteW`)
- Right-click: Context menu with "Open", "Open With...", "Copy Path", "Attach to Chat", "Delete"
- Drag files to chat: Attaches as file attachment

### 4.3.12 Screen: Research Mode

**Route**: `/research`
**Purpose**: Multi-source agentic research orchestration

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Research Mode                              [New Research]    |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | [Research Query Input]                                      |
| I |                                                             |
| D | +--Research Panel-----------------------------------+       |
| E | | Sources (12)                    [Expand All]      |       |
| B | |                                                   |       |
| A | | [Web] "AI market trends 2026"         [Loading]  |       |
| R | | [Web] "Enterprise AI adoption"         [Done]    |       |
| B | | [File] quarterly_report.pdf            [Done]    |       |
| A | | [MCP] Company database query           [Done]    |       |
| R | +---------------------------------------------------+       |
|   |                                                             |
|   | +--Findings---------------------------------------+         |
|   | | Synthesized research summary...                |         |
|   | | [Citations inline]                              |         |
|   | +---------------------------------------------------+       |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component            | Type        | Details                              |
| -------------------- | ----------- | ------------------------------------ |
| Page title           | h1          | "Research Mode"                      |
| New Research button  | Button      | "New Research"                       |
| Research query input | Textarea    | "What would you like to research?"   |
| Sources panel        | Collapsible | List of research sources with status |
| Source item          | Row         | Type icon + title + status badge     |
| Findings panel       | Card        | Synthesized research output          |
| Citation             | Inline link | Clickable reference to source        |

**Exact Copy/Wording**:

- Input placeholder: "What would you like to research?"
- Sources header: "Sources ([count])"
- Source statuses: "Searching...", "Reading...", "Done", "Error"
- Expand All button: "Expand All" / "Collapse All"
- Empty state: "Enter a research topic to begin. AGI Workforce will search the web, read your files, and query connected tools to compile comprehensive findings."

### 4.3.13 Screen: Analytics Dashboard

**Route**: `/analytics`
**Purpose**: Usage statistics, cost tracking, and performance metrics

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Analytics                    [Date Range: Last 30 Days v]   |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | +--Total Spend--+  +--Messages--+  +--Tokens--+            |
| I | | $12.45        |  | 1,234      |  | 2.3M     |            |
| D | | +15% vs prev  |  | +8% vs prev|  | +12%     |            |
| E | +---------------+  +------------+  +----------+            |
| B |                                                             |
| A | +--Cost by Provider (Chart)-----------------------------+   |
| R | | [Bar chart showing spend per provider]                |   |
| B | +------------------------------------------------------+   |
| A |                                                             |
| R | +--Daily Usage (Chart)----------------------------------+   |
|   | | [Line chart showing daily message count]              |   |
|   | +------------------------------------------------------+   |
|   |                                                             |
|   | +--Top Models Used--------------------------------------+   |
|   | | 1. Claude 3.5 Sonnet - 456 messages - $5.23           |   |
|   | | 2. GPT-4o - 312 messages - $4.11                      |   |
|   | | 3. Gemini 1.5 Pro - 198 messages - $1.89              |   |
|   | +------------------------------------------------------+   |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component            | Type                  | Details                                                   |
| -------------------- | --------------------- | --------------------------------------------------------- |
| Page title           | h1                    | "Analytics"                                               |
| Date range picker    | Dropdown              | "Last 7 Days", "Last 30 Days", "Last 90 Days", "All Time" |
| Stat card - Spend    | Card                  | Total cost with trend                                     |
| Stat card - Messages | Card                  | Total messages with trend                                 |
| Stat card - Tokens   | Card                  | Total tokens with trend                                   |
| Provider chart       | Bar chart (Recharts)  | Cost breakdown by provider                                |
| Usage chart          | Line chart (Recharts) | Daily message count                                       |
| Top models table     | Table                 | Ranked by message count                                   |
| Export button        | Button                | "Export Report"                                           |

### 4.3.14 Screen: Computer Use / Automation

**Route**: `/automation` or triggered from chat
**Purpose**: Visual display of computer use sessions

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Computer Use Session                       [Stop] [Pause]   |
|   +-------------------------------------------------------------+
|   |                                                             |
| S | +--Screen Preview-------------------------------------+     |
| I | | [Screenshot of current screen state]                |     |
| D | | [Overlay: Highlighted element with bounding box]    |     |
| E | +----------------------------------------------------+     |
| B |                                                             |
| A | +--Action Log-----------------------------------------+     |
| R | | 14:32:01 - Observed screen state                    |     |
| B | | 14:32:02 - Click(1280, 720) on "Submit" button     |     |
| A | | 14:32:03 - Wait(500ms)                              |     |
| R | | 14:32:04 - Type("quarterly report")                |     |
|   | | 14:32:05 - KeyPress("Enter")                        |     |
|   | +----------------------------------------------------+     |
|   |                                                             |
|   | Reasoning: Looking for the submit button in the form...     |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component         | Type            | Details                            |
| ----------------- | --------------- | ---------------------------------- |
| Page title        | h1              | "Computer Use Session"             |
| Stop button       | Button (danger) | Stops the session                  |
| Pause button      | Button          | Pauses the session                 |
| Screen preview    | Image           | Latest screenshot with overlays    |
| Element highlight | Overlay         | Bounding box around target element |
| Action log        | Scrollable list | Timestamped action entries         |
| Reasoning         | Text            | Agent's current reasoning          |

**Windows-Specific Behavior**:

- Screenshots captured via DXGI desktop duplication (high performance) or xcap fallback
- Element highlighting uses UIA bounding rectangles for precise targeting
- Action log shows Windows-specific actions: "Click(x, y) on 'Save' button (UIA: Button)"
- Window focus changes shown: "Focused: 'Microsoft Excel - Report.xlsx'"
- UIA element info displayed: "Found: Button 'Submit' (AutomationId: btn_submit, Class: Button)"

### 4.3.15 Screen: Update Dialog

**Route**: N/A (modal overlay)
**Purpose**: Notify user of available updates and manage the update process

**Layout**:

```
+----------------------------------------------------+
| Update Available                              [X]  |
+----------------------------------------------------+
|                                                    |
| A new version of AGI Workforce is available.       |
|                                                    |
| Current version: 1.1.5                             |
| New version: 1.2.0                                 |
|                                                    |
| What's new:                                        |
| - Improved agent reliability                       |
| - New MCP server support                           |
| - Bug fixes and performance improvements           |
|                                                    |
| [Download & Install]  [Remind Me Later]  [Skip]    |
|                                                    |
+----------------------------------------------------+
```

**Exact Copy/Wording**:

- Title: "Update Available"
- Body: "A new version of AGI Workforce is available."
- Labels: "Current version: [X]", "New version: [Y]"
- "What's new:" followed by release notes
- Buttons: "Download & Install" (primary), "Remind Me Later" (secondary), "Skip This Version" (text)
- Progress: "Downloading update... [45%]"
- Complete: "Update downloaded. Restart AGI Workforce to apply."
- Restart button: "Restart Now"

**Windows-Specific Behavior**:

- Update downloaded to `%TEMP%\AGI-Workforce-Update\`
- Update is an EXE installer that replaces the current installation
- Tauri updater handles the download-replace-restart cycle
- If UAC is required for the installation directory, a UAC prompt appears
- For per-user installs (%LOCALAPPDATA%), no UAC is needed
- The update process: download EXE -> verify signature -> close app -> run installer -> restart
- If the user clicks "Remind Me Later", the dialog appears again after 24 hours
- If the user clicks "Skip This Version", that version is permanently skipped

### 4.3.16 Screen: Error States

**Purpose**: Consistent error display across all screens

**Error Types and Windows-Specific Messages**:

| Error Type           | User-Facing Message                                                                                   | Windows Detail             |
| -------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| No API key           | "No AI provider configured. Go to Settings to add an API key."                                        |                            |
| Provider unreachable | "Could not reach [Provider]. Check your internet connection."                                         | May show proxy hint        |
| Rate limited         | "Too many requests. Please wait a moment before trying again."                                        |                            |
| Budget exceeded      | "Session budget exceeded ($50.00). Start a new conversation or increase in Settings."                 |                            |
| Clipboard error      | "Could not access clipboard. Another application may be using it."                                    | Windows clipboard lock     |
| Screen capture error | "Could not capture screen. Make sure AGI Workforce has display access."                               | May need DXGI permissions  |
| UIA error            | "Could not interact with the target application. The window may have closed."                         | UIA COM error              |
| File access denied   | "Access denied: [path]. Check file permissions or run as administrator."                              | NTFS permissions           |
| PowerShell policy    | "Script execution is restricted by PowerShell execution policy. See Settings > Advanced for details." | Execution policy hint      |
| WebView2 missing     | "Microsoft Edge WebView2 Runtime is required. [Download Now]"                                         | Missing runtime            |
| SmartScreen warning  | (shown by OS, not by app)                                                                             | First-run only if unsigned |

### 4.3.17 Screen: Voice Input Overlay

**Route**: N/A (overlay triggered by keyboard shortcut or button)
**Purpose**: Capture and transcribe voice input for hands-free interaction

**Layout**:

```
+------------------------------------------------------+
|                                                      |
|              [Microphone Animation]                  |
|                                                      |
|           "Listening... Speak now"                    |
|                                                      |
|           [Waveform Visualization]                    |
|                                                      |
|         [Cancel]           [Done]                     |
|                                                      |
+------------------------------------------------------+
```

**Component Inventory**:

| Component             | Type                 | Details                                     |
| --------------------- | -------------------- | ------------------------------------------- |
| Microphone animation  | Animated icon        | Pulsing microphone icon when recording      |
| Status text           | Label                | "Listening... Speak now" or "Processing..." |
| Waveform              | Canvas visualization | Real-time audio level visualization         |
| Cancel button         | Button               | "Cancel" - discards recording               |
| Done button           | Button               | "Done" - stops and transcribes              |
| Transcription preview | Text                 | Shows real-time partial transcription       |

**Exact Copy/Wording**:

- Recording: "Listening... Speak now"
- Processing: "Processing your audio..."
- Complete: Transcription text inserted into chat input
- Error (no audio): "No audio detected. Check your microphone in Windows Settings."
- Error (no microphone): "No microphone found. Connect a microphone and try again."
- Cancel: "Voice input cancelled."

**Windows-Specific Behavior**:

- Audio captured via WASAPI (Windows Audio Session API) through the `cpal` crate
- Default input device detected from Windows Sound Settings
- If no microphone permission, Windows shows a system permission prompt
- Voice Activity Detection (VAD) via `webrtc-vad` crate detects speech start/end
- Transcription options:
  - Deepgram (cloud): Primary, highest accuracy, requires internet
  - Whisper (local): Offline fallback, requires `local-whisper` feature flag
  - Windows Speech Recognition: Last-resort fallback via `Media_SpeechRecognition` WinRT API
- Keyboard shortcut: Ctrl+Shift+V activates overlay
- Global shortcut: Win+Shift+V activates from any application
- ESC key cancels recording

**Interaction Flows**:

1. User presses Ctrl+Shift+V:
   - Voice overlay appears centered on screen
   - Microphone starts recording
   - Waveform visualization begins
   - Status: "Listening... Speak now"

2. User speaks:
   - Waveform reflects audio levels
   - If using streaming transcription, partial text appears
   - VAD detects speech boundaries

3. User presses Done or pauses for 2+ seconds (auto-detect):
   - Recording stops
   - Status: "Processing your audio..."
   - Audio sent to transcription service
   - Transcription text inserted into chat input
   - Overlay closes

4. User presses Cancel or ESC:
   - Recording discarded
   - Overlay closes
   - No text inserted

**State Variations**:

- **Recording**: Pulsing mic icon, green waveform, "Listening..."
- **Processing**: Spinner, "Processing your audio..."
- **Error (no mic)**: Red mic icon, error message
- **Error (transcription failed)**: Warning icon, "Could not transcribe. Please try again."

### 4.3.18 Screen: Canvas / Artifact Viewer

**Route**: N/A (embedded within chat or opened in separate panel)
**Purpose**: View and edit code artifacts, images, and rich content

**Layout**:

```
+---+-------------------------------------------------------------+
|   | [Tab: Code] [Tab: Preview] [Tab: Diff]   [Copy] [Download]  |
|   +-------------------------------------------------------------+
|   |                                                             |
| C | +--Monaco Editor--------------------------------------+     |
| H | | 1  function hello() {                               |     |
| A | | 2    console.log("Hello World");                    |     |
| T | | 3  }                                                |     |
|   | |                                                     |     |
| P | | [Syntax highlighting, line numbers, minimap]        |     |
| A | +----------------------------------------------------+     |
| N |                                                             |
| E | +--Version History------------------------------------+     |
| L | | v3 (current) - "Added error handling"    [Restore]  |     |
|   | | v2 - "Refactored function"               [Restore]  |     |
|   | | v1 - "Initial implementation"             [Restore]  |     |
|   | +----------------------------------------------------+     |
|   |                                                             |
+---+-------------------------------------------------------------+
```

**Component Inventory**:

| Component         | Type            | Details                                      |
| ----------------- | --------------- | -------------------------------------------- |
| Tab bar           | Tabs            | "Code", "Preview", "Diff"                    |
| Copy button       | Icon button     | Copy content to clipboard                    |
| Download button   | Icon button     | Download as file                             |
| Monaco editor     | Code editor     | Full-featured code editing                   |
| Preview pane      | Rendered output | HTML/Markdown preview                        |
| Diff viewer       | Diff display    | Side-by-side or inline diff                  |
| Version history   | List            | Artifact versions with restore buttons       |
| Language selector | Dropdown        | Programming language for syntax highlighting |

**Exact Copy/Wording**:

- Copy tooltip: "Copy to clipboard (Ctrl+C)"
- Download tooltip: "Download as file"
- Tab labels: "Code", "Preview", "Diff"
- Version format: "v[N] - [description]"
- Restore button: "Restore"
- Empty state: "No artifact to display."

**Windows-Specific Behavior**:

- Monaco editor uses Chromium's V8 engine within WebView2
- Font: "Cascadia Mono" (default code font on Windows)
- Download button opens Windows "Save As" dialog
- Copy button copies to Windows clipboard
- Keyboard shortcuts: Ctrl+S (save), Ctrl+Z (undo), Ctrl+Shift+Z (redo)
- Line endings: CRLF on Windows (configurable to LF)
- File encoding: UTF-8 with BOM option

### 4.3.19 Screen: Keyboard Shortcut Reference

**Access**: Ctrl+/ or Settings > Keyboard Shortcuts
**Purpose**: Display all keyboard shortcuts

**Windows Keyboard Shortcut Map**:

| Action                          | Windows Shortcut       | macOS Equivalent                                 |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| New conversation                | Ctrl+N                 | Cmd+N                                            |
| Close conversation              | Ctrl+W                 | Cmd+W                                            |
| Open chat history               | Ctrl+H                 | Cmd+H (conflicts with hide, use Cmd+Shift+H)     |
| Open settings                   | Ctrl+,                 | Cmd+,                                            |
| Toggle sidebar                  | Ctrl+B                 | Cmd+B                                            |
| Toggle dark mode                | Ctrl+Shift+D           | Cmd+Shift+D                                      |
| Focus chat input                | Ctrl+L                 | Cmd+L                                            |
| Send message                    | Enter                  | Enter (Return)                                   |
| New line in input               | Shift+Enter            | Shift+Return                                     |
| Stop generation                 | Escape                 | Escape                                           |
| Switch model                    | Ctrl+M                 | Cmd+M (conflicts with minimize, use Cmd+Shift+M) |
| Search in chat                  | Ctrl+F                 | Cmd+F                                            |
| Open terminal                   | Ctrl+`                 | Cmd+`                                            |
| New terminal tab                | Ctrl+Shift+`           | Cmd+Shift+`                                      |
| Zoom in                         | Ctrl+=                 | Cmd+=                                            |
| Zoom out                        | Ctrl+-                 | Cmd+-                                            |
| Reset zoom                      | Ctrl+0                 | Cmd+0                                            |
| Show shortcuts                  | Ctrl+/                 | Cmd+/                                            |
| Open DevTools                   | F12                    | Cmd+Option+I                                     |
| Copy (selected)                 | Ctrl+C                 | Cmd+C                                            |
| Paste                           | Ctrl+V                 | Cmd+V                                            |
| Select all                      | Ctrl+A                 | Cmd+A                                            |
| Undo                            | Ctrl+Z                 | Cmd+Z                                            |
| Redo                            | Ctrl+Y or Ctrl+Shift+Z | Cmd+Shift+Z                                      |
| Voice input                     | Ctrl+Shift+V           | Cmd+Shift+V                                      |
| Attach file                     | Ctrl+Shift+A           | Cmd+Shift+A                                      |
| Global shortcut (show/hide app) | Win+Shift+A            | Cmd+Shift+A                                      |
| Quick command palette           | Ctrl+K                 | Cmd+K                                            |

**Windows-Specific Notes**:

- `Ctrl+H` on Windows does not conflict with "Hide" (which is Cmd+H on macOS)
- `Ctrl+M` on Windows does not conflict with "Minimize" (which is Cmd+M on macOS)
- `F12` opens WebView2 DevTools (Chrome DevTools) when devtools feature is enabled
- `Win+Shift+A` is the global hotkey to show/hide the app from anywhere (registered via `tauri-plugin-global-shortcut`)
- `Alt+F4` closes the application (standard Windows behavior, respects "Close to tray" setting)

### 4.3.18 Screen: Command Palette

**Access**: Ctrl+K
**Purpose**: Quick command and navigation

**Layout**:

```
+------------------------------------------------------+
| [Search Icon] Type a command...                      |
+------------------------------------------------------+
| Recent Commands                                      |
|   [Clock] New Conversation                    Ctrl+N |
|   [Clock] Open Settings                       Ctrl+, |
|   [Clock] Toggle Dark Mode               Ctrl+Shift+D|
+------------------------------------------------------+
| Actions                                              |
|   [Bot] Start New Agent                              |
|   [Search] Open Research Mode                        |
|   [Terminal] Open Terminal                    Ctrl+`  |
|   [Model] Switch Model                       Ctrl+M  |
+------------------------------------------------------+
| Navigation                                           |
|   [Chat] Go to Chat                                  |
|   [History] Go to History                    Ctrl+H  |
|   [Settings] Go to Settings                 Ctrl+,   |
|   [Analytics] Go to Analytics                        |
+------------------------------------------------------+
```

**Exact Copy/Wording**:

- Input placeholder: "Type a command..."
- Section headers: "Recent Commands", "Actions", "Navigation"
- No results: "No matching commands. Try a different search."

**Windows-Specific Behavior**:

- Opens centered in the window (overlay)
- Keyboard: Arrow keys navigate, Enter activates, Escape closes
- Fuzzy search matching on command names
- Recently used commands appear at top
- Type filtering: prefix ">" for actions, "#" for navigation

### 4.3.19 Screen: Governance & Audit

**Route**: `/governance`
**Purpose**: Security audit logs, safety policies, and tool execution history

**Layout**:

```
+---+-------------------------------------------------------------+
|   | Governance                [Audit Log] [Safety] [Tool History]|
|   +-------------------------------------------------------------+
|   |                                                             |
| S | Audit Log                            [Export] [Filter]       |
| I |                                                             |
| D | Time          Action          Tool          Result           |
| E | 14:32:01     Execute         Bash          Success          |
| B | 14:31:45     Read            File          Success          |
| A | 14:31:30     Approve         WebSearch     Approved         |
| R | 14:31:15     Deny            Write         Denied           |
| B |                                                             |
+---+-------------------------------------------------------------+
```

**Windows-Specific Behavior**:

- Audit log exported as CSV (opens in Excel by default on Windows)
- Log files stored in `%LOCALAPPDATA%\AGI Workforce\logs\`
- Event Viewer integration: Critical errors also written to Windows Application Event Log

---

# Section 5: Component Architecture

## 5.1 Frontend Component Tree

The React/TypeScript frontend is shared between macOS and Windows builds. The component hierarchy is identical, rendered through WebView2 (Chromium/Blink) on Windows instead of WebKit on macOS.

### 5.1.1 Root Component Tree

```
App (root)
├── ErrorBoundary
│   └── Router (react-router-dom)
│       ├── Layout
│       │   ├── TitleBar (Windows-specific rendering)
│       │   │   ├── AppIcon
│       │   │   ├── AppTitle
│       │   │   ├── MinimizeButton
│       │   │   ├── MaximizeButton
│       │   │   └── CloseButton
│       │   ├── Sidebar
│       │   │   ├── SidebarItem (New Chat)
│       │   │   ├── SidebarItem (History)
│       │   │   ├── SidebarDivider
│       │   │   ├── SidebarItem (Agents)
│       │   │   ├── SidebarItem (Skills)
│       │   │   ├── SidebarItem (Research)
│       │   │   ├── SidebarDivider
│       │   │   ├── SidebarItem (Terminal)
│       │   │   ├── SidebarItem (Files)
│       │   │   ├── SidebarItem (Browser)
│       │   │   ├── SidebarDivider
│       │   │   ├── SidebarItem (Analytics)
│       │   │   └── SidebarItem (Settings)
│       │   └── MainContent (route-dependent)
│       │       ├── ChatInterface (/)
│       │       │   ├── ChatHeader
│       │       │   │   ├── ModelSelector
│       │       │   │   ├── ConversationTitle
│       │       │   │   ├── PlusMenu
│       │       │   │   ├── BudgetTracker
│       │       │   │   └── SettingsToggle
│       │       │   ├── MessageList (virtualized)
│       │       │   │   ├── UserMessage
│       │       │   │   │   ├── Avatar
│       │       │   │   │   ├── MessageContent (markdown)
│       │       │   │   │   └── MessageActions
│       │       │   │   └── AIMessage
│       │       │   │       ├── Avatar
│       │       │   │       ├── MessageContent (markdown)
│       │       │   │       ├── ToolTimeline
│       │       │   │       │   └── ToolLabel (per tool)
│       │       │   │       ├── ThinkingPanel
│       │       │   │       ├── ArtifactCard
│       │       │   │       ├── CostBadge
│       │       │   │       └── MessageActions
│       │       │   └── ChatInput
│       │       │       ├── PlusMenuButton
│       │       │       ├── TextareaAutosize
│       │       │       ├── AttachmentsBar
│       │       │       │   └── AttachmentChip (per file)
│       │       │       ├── SendButton
│       │       │       ├── StopButton
│       │       │       └── VoiceInputButton
│       │       ├── HistoryPanel (/history)
│       │       ├── AgentMonitor (/agents)
│       │       ├── SkillMarketplace (/skills)
│       │       ├── ResearchPanel (/research)
│       │       ├── TerminalView (/terminal)
│       │       ├── FileBrowser (/files)
│       │       ├── BrowserAutomation (/browser)
│       │       ├── AnalyticsDashboard (/analytics)
│       │       ├── SettingsPanel (/settings)
│       │       │   ├── GeneralSettings
│       │       │   ├── API Keys tab (inline in SettingsPanel)
│       │       │   ├── ModelsSettings
│       │       │   ├── AppearanceSettings
│       │       │   ├── ChatSettings
│       │       │   ├── NotificationsSettings
│       │       │   ├── MCPToolsSettings
│       │       │   ├── SecuritySettings
│       │       │   ├── AdvancedSettings
│       │       │   └── AboutSettings
│       │       └── GovernancePanel (/governance)
│       │           ├── AuditLog
│       │           ├── SafetyPolicies
│       │           └── ToolHistoryTable
│       └── Overlays
│           ├── CommandPalette (Ctrl+K)
│           ├── UpdateDialog
│           ├── ToolConfirmationDialog
│           ├── OnboardingWizard
│           └── NotificationToasts (Sonner)
```

### 5.1.2 Windows-Specific Component Differences

| Component     | Windows Behavior                                       | macOS Behavior                                |
| ------------- | ------------------------------------------------------ | --------------------------------------------- |
| TitleBar      | Custom with Windows min/max/close buttons (right side) | Custom with traffic light buttons (left side) |
| FileDialog    | IFileOpenDialog COM interface (native)                 | NSOpenPanel (native)                          |
| ContextMenu   | Windows right-click menu styling                       | macOS context menu styling                    |
| Scrollbar     | Wider, always visible option                           | Thin, auto-hide                               |
| SystemTray    | Notification area icon (bottom-right)                  | Menu bar icon (top-right)                     |
| Notification  | Windows Notification Center toast                      | macOS Notification Center banner              |
| FontRendering | ClearType subpixel                                     | macOS subpixel antialiasing                   |
| DragDrop      | Windows OLE drag-drop                                  | macOS NSPasteboard drag-drop                  |

### 5.1.3 WebView2 vs WebKit Rendering Considerations

| Aspect                | WebView2 (Windows)                     | WebKit (macOS)                      |
| --------------------- | -------------------------------------- | ----------------------------------- |
| Engine                | Chromium/Blink                         | WebKit                              |
| JS Engine             | V8                                     | JavaScriptCore                      |
| CSS Grid              | Full support                           | Full support                        |
| CSS Flexbox           | Full support                           | Full support                        |
| Backdrop blur         | `backdrop-filter` supported            | `-webkit-backdrop-filter` needed    |
| Scrollbar styling     | `::-webkit-scrollbar` works (Chromium) | `::-webkit-scrollbar` works         |
| Font smoothing        | ClearType                              | -webkit-font-smoothing: antialiased |
| DevTools              | Chrome DevTools (F12)                  | WebKit Inspector                    |
| GPU rendering         | DirectX / ANGLE                        | Metal                               |
| WebGL                 | WebGL 2.0 (ANGLE/DirectX)              | WebGL 2.0 (Metal)                   |
| Performance profiling | Chrome Performance tab                 | WebKit Timeline                     |

## 5.2 Shared Components (Cross-Platform)

All components in `apps/desktop/src/components/` are shared between Windows and macOS. Platform-specific behavior is handled through:

1. **Tauri API abstraction**: `@tauri-apps/api` provides a unified interface; the underlying implementation differs per platform
2. **Feature detection**: `navigator.platform` or `os.platform()` for platform checks
3. **CSS variables**: Theme tokens adjust based on platform
4. **Keyboard shortcut mapping**: Utility function maps Cmd to Ctrl on Windows

### 5.2.1 Platform Detection Utility

```typescript
// src/lib/platform.ts
export const isWindows = navigator.platform.startsWith('Win');
export const isMac = navigator.platform.startsWith('Mac');
export const isLinux = navigator.platform.startsWith('Linux');

export const modKey = isMac ? 'Cmd' : 'Ctrl';
export const altKey = isMac ? 'Option' : 'Alt';
```

## 5.3 State Management

### 5.3.1 Zustand Store Architecture (Shared)

All 41+ Zustand stores are shared between Windows and macOS. Platform-specific state is minimal:

| Store                  | Windows-Specific State                                                  | Notes                    |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------ | --------- | ----------------------------------- |
| `settingsStore`        | `startOnLogin: boolean`, `closeToTray: boolean`, `defaultShell: string` | Registry-backed settings |
| `appPreferencesStore`  | `theme: 'light'                                                         | 'dark'                   | 'system'` | System theme reads Windows registry |
| `chatPreferencesStore` | None                                                                    | Identical                |
| `unifiedChatStore`     | None                                                                    | Identical                |
| `mcpStore`             | None                                                                    | Identical                |
| `modelStore`           | None                                                                    | Identical                |
| `costStore`            | None                                                                    | Identical                |
| `authCoreStore`        | None                                                                    | Identical                |

### 5.3.2 TypeScript Interfaces for Key Data Models

All TypeScript interfaces are defined in `packages/types/src/` and are shared across platforms. No Windows-specific types are needed at the TypeScript layer; all platform differentiation occurs in the Rust backend.

Key interfaces used across the application:

```typescript
// packages/types/src/context.ts
interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// apps/desktop/src/types/chat.ts
interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
  total_cost: number;
  total_tokens: number;
}

// apps/desktop/src/types/agent.ts
interface AgentState {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'error' | 'queued' | 'stopped';
  task: string;
  actions_taken: number;
  started_at: string;
  duration_ms: number;
  last_action?: string;
  progress?: number;
}
```

---

# Section 6: Data Flow & API Connections

## 6.1 Frontend-Backend IPC (Tauri Invoke)

All frontend-backend communication uses Tauri's `invoke()` function, which calls `#[tauri::command]` Rust handlers. The IPC mechanism is identical on Windows and macOS, with one key difference:

**IPC Transport**:

- **Windows**: WebView2 uses `window.chrome.webview.postMessage` internally
- **macOS**: WebKit uses `window.webkit.messageHandlers` internally
- **Application code**: Both use the unified `@tauri-apps/api` invoke() interface

### 6.1.1 Critical IPC Rule (Windows + macOS)

All `invoke()` calls **MUST** use camelCase parameter keys. Tauri automatically converts from Rust's snake_case. Using snake_case in invoke() parameters silently fails on both platforms.

```typescript
// CORRECT - camelCase parameters
await invoke('chat_send_message', {
  conversationId: id, // camelCase
  messageContent: text, // camelCase
  modelId: model, // camelCase
});

// WRONG - snake_case parameters (silently fails)
await invoke('chat_send_message', {
  conversation_id: id, // WRONG: snake_case
  message_content: text, // WRONG: snake_case
  model_id: model, // WRONG: snake_case
});
```

### 6.1.2 IPC Call Catalog (Core Operations)

| Frontend Action          | Rust Command          | Parameters (camelCase)                    | Response             | Windows-Specific           |
| ------------------------ | --------------------- | ----------------------------------------- | -------------------- | -------------------------- |
| Send message             | `chat_send_message`   | `conversationId, messageContent, modelId` | Stream events        | No                         |
| Create conversation      | `create_conversation` | `title, modelId`                          | `Conversation`       | No                         |
| List conversations       | `list_conversations`  | `limit, offset`                           | `Vec<Conversation>`  | No                         |
| Set API key              | `set_api_key`         | `provider, apiKey`                        | `Result<()>`         | Windows Credential Manager |
| Get API key              | `get_api_key`         | `provider`                                | `Option<String>`     | Windows Credential Manager |
| Capture screen           | `capture_screen`      | `displayIndex`                            | `Base64 PNG`         | DXGI capture               |
| List windows             | `list_windows`        | (none)                                    | `Vec<AppWindow>`     | Win32 EnumWindows          |
| Focus window             | `focus_window`        | `handle`                                  | `Result<()>`         | Win32 SetForegroundWindow  |
| Find UI elements         | `find_ui_elements`    | `query, parentId`                         | `Vec<UIElementInfo>` | UIA COM only (Windows)     |
| Invoke UI element        | `invoke_ui_element`   | `elementId`                               | `Result<()>`         | UIA COM only (Windows)     |
| Set UI value             | `set_ui_value`        | `elementId, value`                        | `Result<()>`         | UIA COM only (Windows)     |
| Execute terminal command | `execute_command`     | `command, shell`                          | `CommandResult`      | PowerShell/CMD             |
| Open file                | `open_file`           | `path`                                    | `Result<()>`         | ShellExecuteW              |
| Launch application       | `launch_app`          | `name`                                    | `Result<()>`         | ShellExecuteW              |

### 6.1.3 Tauri Event Channels (Rust to Frontend)

| Event Channel                 | Payload                                                                                  | Purpose                          | Windows-Specific |
| ----------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- | ---------------- |
| `tool:event`                  | `ToolEvent { type, tool_name, display_name, display_args, duration_ms, result_preview }` | Real-time tool execution updates | No               |
| `agentic:loop-started`        | `{ conversationId, agentId }`                                                            | Agent loop lifecycle             | No               |
| `agentic:loop-status`         | `{ status, actionsCount, currentTool }`                                                  | Agent progress                   | No               |
| `agentic:loop-ended`          | `{ reason, totalActions }`                                                               | Agent completion                 | No               |
| `agentic:message-consumed`    | `{ messageId }`                                                                          | Message processing               | No               |
| `notification:agent-complete` | `{ agentId, summary }`                                                                   | Agent finished                   | Taskbar flash    |
| `notification:agent-error`    | `{ agentId, error }`                                                                     | Agent error                      | Taskbar flash    |
| `update:available`            | `{ version, releaseNotes }`                                                              | Update check result              | No               |

## 6.2 Windows Credential Manager Integration

### 6.2.1 Architecture

```
Frontend (React)
    │
    ▼ invoke('set_api_key', { provider: 'anthropic', apiKey: 'sk-...' })
Rust Command Handler (sys/commands/settings.rs)
    │
    ▼ SecretManager::store(key, plaintext)
SecretManager (sys/security/secret_manager.rs)
    │
    ├── Step 1: Derive encryption key via HKDF(SHA-256, master_key, label)
    ├── Step 2: Encrypt plaintext via AES-GCM(derived_key, random_nonce)
    ├── Step 3: Store ciphertext in SQLCipher DB
    └── Step 4: Store derived_key in OS keychain
         │
         ▼ keyring::Entry::new("agi-workforce", "anthropic-api-key")
    Windows Credential Manager (via keyring crate)
         │
         └── Stored in: Control Panel > User Accounts > Credential Manager
             > Windows Credentials > "agi-workforce/anthropic-api-key"
```

### 6.2.2 Credential Manager Entries

| Service       | Username          | Value                          |
| ------------- | ----------------- | ------------------------------ |
| agi-workforce | anthropic-api-key | AES-GCM encrypted key material |
| agi-workforce | openai-api-key    | AES-GCM encrypted key material |
| agi-workforce | google-api-key    | AES-GCM encrypted key material |
| agi-workforce | master-key-salt   | Key derivation salt            |
| agi-workforce | machine-uid-hash  | Machine identification hash    |

### 6.2.3 DPAPI Fallback

If the Windows Credential Manager is unavailable (extremely rare), the `keyring` crate falls back to DPAPI (Data Protection API) for encrypting credentials at rest:

1. DPAPI uses the user's login credentials as the encryption key
2. Encrypted data is stored in the registry or local file
3. Only the logged-in user can decrypt the data
4. Domain roaming profiles are supported

## 6.3 Offline Behavior

| Feature             | Offline Behavior | Notes                                        |
| ------------------- | ---------------- | -------------------------------------------- |
| Cloud LLMs          | Unavailable      | "No internet connection. Use a local model." |
| Local LLMs (Ollama) | Fully functional | No network needed                            |
| Chat history        | Fully functional | SQLite local storage                         |
| Settings            | Fully functional | Local storage                                |
| File operations     | Fully functional | Local file system                            |
| Terminal            | Fully functional | Local shell                                  |
| MCP stdio tools     | Fully functional | Local process                                |
| MCP SSE/HTTP tools  | Unavailable      | Network required                             |
| Auto-update         | Unavailable      | Checks on reconnect                          |
| Billing/Auth        | Cached session   | Re-validates on reconnect                    |

## 6.4 Real-Time Sync

When the user is online and authenticated, the following data syncs with Supabase:

| Data                | Sync Direction | Frequency      | Windows-Specific |
| ------------------- | -------------- | -------------- | ---------------- |
| Conversations       | Bidirectional  | On change      | No               |
| Settings            | Upload         | On change      | No               |
| Usage metrics       | Upload         | Batch (hourly) | No               |
| Subscription status | Download       | On app start   | No               |

---

# Section 7: Platform-Specific Capabilities

This is the critical section covering all Windows-native integrations.

## 7.1 UI Automation (UIA) Element Tree

### 7.1.1 Overview

Windows UI Automation (UIA) is a COM-based framework that provides programmatic access to the UI elements of any Windows application. AGI Workforce uses UIA as the primary mechanism for structured, non-visual interaction with Windows applications. This is the Windows equivalent of macOS's AXUIElement accessibility API.

### 7.1.2 Implementation

The UIA integration is implemented in `apps/desktop/src-tauri/src/automation/uia/`:

| File                | Purpose                                                                                         | Lines |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----- |
| `mod.rs`            | UIAutomationService: COM initialization, caching, thread safety                                 | ~250  |
| `element_tree.rs`   | Element discovery: list_windows, find_elements, describe_element                                | ~250  |
| `actions.rs`        | Element actions: invoke, setValue, toggle, setFocus, scroll, expand                             | ~230  |
| `patterns.rs`       | Pattern detection: Invoke, Value, Toggle, Text, Grid, Table, Scroll, ExpandCollapse, Selection  | ~130  |
| `wait.rs`           | Async wait strategies: wait_for_element, wait_for_visible, wait_for_enabled, retry_with_backoff | ~210  |
| `inspector_impl.rs` | Inspector service: point inspection, focused element, selector generation                       | ~280  |
| `tests.rs`          | Unit tests for UIA operations                                                                   | ~400  |

### 7.1.3 UIAutomationService API

```rust
pub struct UIAutomationService {
    automation: Arc<Mutex<IUIAutomation>>,  // COM interface, thread-safe
    cache: Mutex<HashMap<String, CachedElement>>,  // Element cache (30s TTL)
    cache_ttl: Duration,
}

impl UIAutomationService {
    // Discovery
    pub fn list_windows() -> Vec<UIElementInfo>;
    pub fn find_elements(parent_id, query) -> Vec<UIElementInfo>;
    pub fn find_window(title, class_name) -> Option<IUIAutomationElement>;
    pub fn find_element_smart(parent_id, query) -> Vec<UIElementInfo>;

    // Actions
    pub fn invoke(element_id) -> Result<()>;
    pub fn set_value(element_id, value) -> Result<()>;
    pub fn get_value(element_id) -> Result<String>;
    pub fn toggle(element_id) -> Result<()>;
    pub fn set_focus(element_id) -> Result<()>;
    pub fn focus_window(element_id) -> Result<()>;
    pub fn scroll_to_element(element_id) -> Result<()>;
    pub fn expand_tree_node(element_id, expand) -> Result<()>;

    // Grid/Table
    pub fn get_table_cell(element_id, row, column) -> Result<String>;
    pub fn get_grid_row_count(element_id) -> Result<i32>;
    pub fn get_grid_column_count(element_id) -> Result<i32>;

    // Pattern detection
    pub fn check_patterns(element_id) -> Result<PatternCapabilities>;

    // Inspection
    pub fn bounding_rect(element_id) -> Result<Option<BoundingRectangle>>;

    // Wait strategies
    pub async fn wait_for_element(parent_id, query, config) -> Result<UIElementInfo>;
    pub async fn wait_for_element_visible(element_id, config) -> Result<()>;
    pub async fn wait_for_element_enabled(element_id, config) -> Result<()>;
    pub async fn retry_with_backoff(operation, max_retries, initial_delay) -> Result<T>;
}
```

### 7.1.4 Supported UIA Patterns

| Pattern        | Description                      | Use Cases                  |
| -------------- | -------------------------------- | -------------------------- |
| Invoke         | Click buttons, activate controls | Button clicks, menu items  |
| Value          | Get/set text content             | Text fields, combo boxes   |
| Toggle         | Toggle on/off state              | Checkboxes, toggle buttons |
| Text           | Read text ranges                 | Document content, labels   |
| Grid           | Access grid cells by position    | Spreadsheets, data tables  |
| Table          | Access table structure           | Data grids with headers    |
| Scroll         | Scroll containers                | List views, tree views     |
| ExpandCollapse | Expand/collapse tree nodes       | File trees, accordions     |
| SelectionItem  | Select items in lists            | List boxes, radio groups   |

### 7.1.5 Smart Element Finding

The `find_element_smart` method implements a cascading search strategy:

1. **Exact match**: Search with all query parameters
2. **Partial name match**: If name has 3+ chars, search with first 10 chars
3. **Case-insensitive match**: Lowercase the name and retry
4. **Type-only match**: If a control type is specified, search by type only

This ensures agents can find elements even when exact names vary between application versions.

### 7.1.6 Thread Safety

UIAutomationService implements `Send + Sync` via `Arc<Mutex<IUIAutomation>>`:

- COM is initialized in STA (Single-Threaded Apartment) mode
- All COM operations are serialized through a parking_lot Mutex
- Microsoft documents IUIAutomation as "thread-agile" (callable from any thread)
- The Mutex prevents concurrent access to satisfy COM safety requirements

### 7.1.7 Element Caching

- Elements are cached by runtime ID with a 30-second TTL
- Cache is cleaned on every `get_element()` call (lazy eviction)
- `clear_cache()` and `clear_expired_cache()` methods available
- Cache prevents repeated COM queries for the same element within short timeframes

## 7.2 DXGI / GDI Screen Capture

### 7.2.1 Primary: DXGI Desktop Duplication

AGI Workforce uses the `xcap` crate for screen capture, which internally uses DXGI Desktop Duplication API on Windows:

| Aspect        | Detail                               |
| ------------- | ------------------------------------ |
| API           | IDXGIOutputDuplication (DXGI 1.2+)   |
| Performance   | Sub-10ms for 1920x1080               |
| Color format  | BGRA (converted to RGBA)             |
| Multi-monitor | Supported (capture by monitor index) |
| HDR support   | Basic (tone-mapped to SDR)           |
| DPI awareness | Captures at native resolution        |

### 7.2.2 Capture Functions

```rust
// Full screen capture (primary monitor)
pub fn capture_primary_screen() -> Result<CapturedImage>;

// Region capture (any monitor)
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<CapturedRegion>;

// Window-specific capture
pub fn capture_window(hwnd: HWND) -> Result<CapturedImage>;

// Multi-monitor enumeration
pub fn list_displays() -> Result<Vec<ScreenInfo>>;
```

### 7.2.3 Fallback: GDI BitBlt

If DXGI is unavailable (older GPU, remote desktop session), the system falls back to GDI:

```rust
// GDI-based screen capture (slower but universal)
// Uses: CreateCompatibleDC, CreateCompatibleBitmap, BitBlt, GetDIBits
```

| Aspect         | DXGI             | GDI               |
| -------------- | ---------------- | ----------------- |
| Performance    | ~5ms per capture | ~20ms per capture |
| GPU required   | DirectX 11       | None              |
| Remote desktop | May not work     | Works             |
| Cursor capture | Configurable     | Configurable      |
| Multi-monitor  | Full support     | Full support      |

### 7.2.4 ScreenInfo Structure

```rust
pub struct ScreenInfo {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}
```

## 7.3 Windows Notification Center

### 7.3.1 Implementation

Notifications use `tauri-plugin-notification` which maps to the Windows Notification Center:

| Aspect      | Detail                                         |
| ----------- | ---------------------------------------------- |
| API         | `tauri_plugin_notification::Notification`      |
| Backend     | Windows Toast Notification API (Windows 10/11) |
| Persistence | Notifications persist in Notification Center   |
| Actions     | Up to 3 action buttons per notification        |
| Icon        | AGI Workforce logo (from ICO resource)         |
| Sound       | Windows default notification sound             |

### 7.3.2 Notification Types

| Event                | Title              | Body                                   | Actions                   |
| -------------------- | ------------------ | -------------------------------------- | ------------------------- |
| Agent completed      | "Agent Completed"  | "[Agent Name] finished: [summary]"     | "View Results", "Dismiss" |
| Agent error          | "Agent Error"      | "[Agent Name] encountered an error"    | "View Details", "Dismiss" |
| Agent needs approval | "Approval Needed"  | "[Agent Name] wants to execute [tool]" | "Approve", "Deny", "View" |
| Update available     | "Update Available" | "Version [X] is ready to install"      | "Install Now", "Later"    |
| Background task      | "Task Complete"    | "[Task description] completed"         | "View", "Dismiss"         |

### 7.3.3 Focus Assist / Do Not Disturb

On Windows 10/11, notifications respect Focus Assist settings:

| Focus Assist Level     | Notification Behavior                              |
| ---------------------- | -------------------------------------------------- |
| Off                    | All notifications shown                            |
| Priority Only          | Only shown if AGI Workforce is in priority list    |
| Alarms Only            | Notifications queued, shown when Focus Assist ends |
| Do Not Disturb (Win11) | Notifications queued, shown on dismiss             |

The application checks Focus Assist state before sending non-critical notifications. Critical notifications (agent errors, approval requests) override Focus Assist.

## 7.4 Windows Credential Manager / DPAPI

### 7.4.1 Credential Manager Integration

The `keyring` crate (v3) provides cross-platform keychain access:

| Platform | Backend                                  | Location                           |
| -------- | ---------------------------------------- | ---------------------------------- |
| Windows  | Windows Credential Manager               | Control Panel > Credential Manager |
| macOS    | macOS Keychain                           | Keychain Access.app                |
| Linux    | Secret Service (GNOME Keyring / KWallet) | System keyring                     |

### 7.4.2 Credential Structure

Each credential stored as:

- **Target Name**: `agi-workforce/<key-name>`
- **User Name**: `agi-workforce`
- **Password**: Base64-encoded encrypted key material
- **Type**: Generic Credential

### 7.4.3 DPAPI Fallback Path

If Credential Manager access fails:

1. `keyring` falls back to DPAPI (`CryptProtectData` / `CryptUnprotectData`)
2. DPAPI encrypts using the user's Windows login credentials
3. Encrypted blob stored in `%LOCALAPPDATA%\AGI Workforce\credentials\`
4. Only decryptable by the same Windows user account on the same machine

## 7.5 Windows Keyboard Shortcuts & Global Hotkeys

### 7.5.1 Global Hotkey Registration

Global hotkeys are registered via `tauri-plugin-global-shortcut`:

| Hotkey      | Action                         | Scope            |
| ----------- | ------------------------------ | ---------------- |
| Win+Shift+A | Show/hide AGI Workforce window | Global (any app) |
| Win+Shift+V | Quick voice input              | Global (any app) |
| Win+Shift+C | Quick clipboard AI query       | Global (any app) |

### 7.5.2 Registration Process

```rust
// Global shortcut registration in lib.rs
app.global_shortcut()
    .on_shortcut("Super+Shift+A", |_app, _shortcut, _event| {
        // Toggle window visibility
    });
```

### 7.5.3 Conflict Detection

The application checks for conflicts with existing Windows shortcuts:

- Win+Shift+S (Snipping Tool) - Avoided
- Win+A (Action Center / Quick Settings) - Avoided
- Win+V (Clipboard History) - Avoided

If a global hotkey fails to register (conflict), a toast notification informs the user: "Hotkey [X] could not be registered. It may conflict with another application."

## 7.6 System Tray (Notification Area) Icon

### 7.6.1 Implementation

The system tray icon uses `tauri::tray::TrayIconBuilder`:

```rust
TrayIconBuilder::new()
    .icon(Icon::Raw(include_bytes!("../icons/icon.ico").to_vec()))
    .tooltip("AGI Workforce - Ready")
    .menu(&menu)
    .on_tray_icon_event(|tray, event| {
        match event {
            TrayIconEvent::Click { .. } => { /* toggle window */ },
            TrayIconEvent::DoubleClick { .. } => { /* show window */ },
            _ => {}
        }
    })
    .build(app)?;
```

### 7.6.2 Icon States

| State            | Icon Appearance     | Tooltip                            |
| ---------------- | ------------------- | ---------------------------------- |
| Ready            | Standard logo       | "AGI Workforce - Ready"            |
| Processing       | Animated (spinning) | "AGI Workforce - Processing..."    |
| Agent running    | Pulsing green dot   | "AGI Workforce - 3 agents running" |
| Agent error      | Red exclamation     | "AGI Workforce - Agent error"      |
| Update available | Blue arrow badge    | "AGI Workforce - Update available" |
| Offline          | Grayed out          | "AGI Workforce - Offline"          |

### 7.6.3 ICO File Requirements

The tray icon ICO file must contain multiple resolutions:

| Size    | DPI | Use Case                             |
| ------- | --- | ------------------------------------ |
| 16x16   | 96  | System tray (100% scaling)           |
| 20x20   | 120 | System tray (125% scaling)           |
| 24x24   | 144 | System tray (150% scaling)           |
| 32x32   | 192 | System tray (200% scaling) + Alt-Tab |
| 48x48   | 288 | Taskbar (large icons)                |
| 64x64   | 384 | Taskbar (300% scaling)               |
| 256x256 | N/A | Application icon, Start Menu         |

## 7.7 Taskbar Progress Indicator

### 7.7.1 Implementation (Planned)

```rust
// ITaskbarList3 COM interface
use windows::Win32::UI::Shell::ITaskbarList3;

pub fn set_taskbar_progress(hwnd: HWND, current: u64, total: u64) -> Result<()> {
    let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
    taskbar.SetProgressValue(hwnd, current, total)?;
    Ok(())
}

pub fn set_taskbar_progress_state(hwnd: HWND, state: TBPFLAG) -> Result<()> {
    let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
    taskbar.SetProgressState(hwnd, state)?;
    Ok(())
}
```

### 7.7.2 Progress States

| State                | Visual             | Use Case                               |
| -------------------- | ------------------ | -------------------------------------- |
| `TBPF_NOPROGRESS`    | No bar             | Idle                                   |
| `TBPF_INDETERMINATE` | Pulsing green      | Agent running (no measurable progress) |
| `TBPF_NORMAL`        | Green bar (0-100%) | Agent with measurable progress         |
| `TBPF_PAUSED`        | Yellow bar         | Agent paused, awaiting approval        |
| `TBPF_ERROR`         | Red bar            | Agent error                            |

## 7.8 Windows Registry Entries

### 7.8.1 Auto-Start

```
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
    "AGI Workforce" = "\"C:\Users\<user>\AppData\Local\AGI Workforce\AGI Workforce.exe\" --minimized"
```

### 7.8.2 URI Scheme Registration

```
HKCU\SOFTWARE\Classes\agiworkforce
    (Default) = "URL:AGI Workforce Protocol"
    "URL Protocol" = ""
    shell\open\command
        (Default) = "\"C:\Users\<user>\AppData\Local\AGI Workforce\AGI Workforce.exe\" \"%1\""
```

### 7.8.3 File Associations (Planned)

```
HKCU\SOFTWARE\Classes\.agw
    (Default) = "AGIWorkforce.Workspace"
HKCU\SOFTWARE\Classes\AGIWorkforce.Workspace
    shell\open\command
        (Default) = "\"...\AGI Workforce.exe\" --open \"%1\""
```

### 7.8.4 Uninstall Information

```
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\AGI Workforce
    DisplayName = "AGI Workforce"
    DisplayVersion = "1.1.5"
    Publisher = "AGI Automation LLC"
    UninstallString = "\"...\Uninstall AGI Workforce.exe\""
    DisplayIcon = "\"...\AGI Workforce.exe\""
    EstimatedSize = 120000 (KB)
```

## 7.9 Windows Defender / SmartScreen Interaction

### 7.9.1 SmartScreen First-Run Warning

When a user downloads and runs AGI Workforce for the first time, Windows SmartScreen may show a warning because the application is new and doesn't have established reputation:

**Unsigned build**:

```
+----------------------------------------------------+
| Windows protected your PC                          |
|                                                    |
| Microsoft Defender SmartScreen prevented an         |
| unrecognized app from starting. Running this app    |
| might put your PC at risk.                          |
|                                                    |
| App: AGI-Workforce-Setup-1.1.5-x64.exe            |
| Publisher: Unknown publisher                        |
|                                                    |
| [Don't run]  [More info]                           |
|              └─> [Run anyway]                       |
+----------------------------------------------------+
```

**Signed build (Authenticode)**:

```
+----------------------------------------------------+
| Windows protected your PC                          |
|                                                    |
| Microsoft Defender SmartScreen prevented an         |
| unrecognized app from starting.                     |
|                                                    |
| App: AGI-Workforce-Setup-1.1.5-x64.exe            |
| Publisher: AGI Automation LLC                       |
|                                                    |
| [Don't run]  [Run anyway]                          |
+----------------------------------------------------+
```

**EV Certificate (Extended Validation)**: No SmartScreen warning. The application is immediately trusted.

### 7.9.2 SmartScreen Resolution Strategy

1. **Phase 1 (Current)**: Standard Authenticode certificate. Users may see "Publisher: AGI Automation LLC" but no scary red warning.
2. **Phase 2**: Submit to Microsoft for SmartScreen reputation via [Microsoft Intelligence Security Graph](https://www.microsoft.com/en-us/wdsi/). Building download count reputation.
3. **Phase 3 (Target)**: Extended Validation (EV) code signing certificate. Immediate trust, no SmartScreen warning ever.

### 7.9.3 Windows Defender Considerations

| Concern                         | Mitigation                                                       |
| ------------------------------- | ---------------------------------------------------------------- |
| False positive on binary        | Submit to Microsoft Security Intelligence for analysis           |
| Flagged for input simulation    | enigo uses documented Win32 SendInput (not hooking)              |
| Flagged for screen capture      | DXGI Desktop Duplication is a documented API                     |
| Flagged for registry writes     | Only writes to HKCU (user-level, no admin needed)                |
| Flagged for process enumeration | Standard Win32 API (OpenProcess + QueryFullProcessImageName)     |
| Binary packing detection        | Release builds use `opt-level = "z"` + LTO but no custom packers |

## 7.10 UAC (User Account Control) Handling

### 7.10.1 Standard Operation (No UAC)

AGI Workforce is designed to run without administrator privileges:

| Operation                | Admin Required | Notes                      |
| ------------------------ | -------------- | -------------------------- |
| Installation (per-user)  | No             | Installs to %LOCALAPPDATA% |
| Installation (all-users) | Yes            | Installs to %ProgramFiles% |
| Normal operation         | No             | User-level permissions     |
| Auto-start registry      | No             | Writes to HKCU             |
| Screen capture           | No             | DXGI doesn't require admin |
| UI Automation            | No             | Standard user can use UIA  |
| Credential Manager       | No             | Per-user credentials       |
| File system access       | No             | User-accessible paths only |

### 7.10.2 Operations That May Trigger UAC

| Operation                       | When                        | User Experience        |
| ------------------------------- | --------------------------- | ---------------------- |
| All-users installation          | During setup                | Standard UAC prompt    |
| Update (Program Files)          | During update               | Standard UAC prompt    |
| Accessing admin-protected files | Agent file operation        | Error: "Access denied" |
| Port binding (< 1024)           | If MCP server uses low port | Error with guidance    |

### 7.10.3 UAC Best Practices

- Never request admin elevation for normal operations
- If an operation fails due to permissions, show a clear message: "This operation requires access to [path]. Try a different location, or run AGI Workforce as administrator."
- Never show a "Run as Administrator" recommendation as the default solution
- Log UAC-related failures for troubleshooting

## 7.11 Win32 Clipboard API

### 7.11.1 Implementation

The clipboard is managed through the `arboard` crate, which wraps the Win32 Clipboard API:

```rust
pub struct ClipboardManager {
    clipboard: Option<Clipboard>,
}

impl ClipboardManager {
    pub fn new() -> Result<Self>;
    pub fn get_text() -> Result<String>;
    pub fn set_text(text: &str) -> Result<()>;
    pub fn clear() -> Result<()>;
}
```

### 7.11.2 Win32 Clipboard API Flow

1. `OpenClipboard(hwnd)` - Locks clipboard for exclusive access
2. `GetClipboardData(CF_UNICODETEXT)` - Read text (or CF_BITMAP for images)
3. `SetClipboardData(CF_UNICODETEXT, handle)` - Write text
4. `CloseClipboard()` - Release clipboard lock

### 7.11.3 Clipboard Conflict Handling

Windows has a single system clipboard that can only be opened by one process at a time. If another application is using the clipboard:

| Error                          | User Message                                                                         | Recovery                              |
| ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------- |
| Clipboard lock timeout         | "Could not access clipboard. Another application may be using it. Please try again." | Auto-retry after 100ms, up to 3 times |
| Clipboard data format mismatch | "Clipboard contains unsupported content."                                            | Graceful degradation                  |

## 7.12 PowerShell Execution Policy

### 7.12.1 Overview

Windows restricts PowerShell script execution via execution policies. This can affect AGI Workforce agent terminal operations:

| Policy       | Description                             | Impact on AGI Workforce          |
| ------------ | --------------------------------------- | -------------------------------- |
| Restricted   | No scripts can run                      | Commands work, scripts do not    |
| AllSigned    | Only signed scripts                     | Agent-generated scripts may fail |
| RemoteSigned | Local scripts ok, remote must be signed | Most operations work             |
| Unrestricted | All scripts run (with warnings)         | Full functionality               |
| Bypass       | No restrictions                         | Full functionality               |

### 7.12.2 Mitigation Strategy

AGI Workforce uses the `-ExecutionPolicy Bypass -NonInteractive` flags when invoking PowerShell for agent operations:

```rust
// Terminal command execution
let cmd = format!(
    "powershell.exe -ExecutionPolicy Bypass -NonInteractive -Command {}",
    shlex::try_quote(&command)?
);
```

This ensures agent commands work regardless of the system's execution policy, while maintaining security (the bypass only applies to the spawned PowerShell process, not the system policy).

### 7.12.3 Settings Integration

In Settings > Security > Blocked Commands, the following PowerShell-specific commands are blocked by default:

- `Set-ExecutionPolicy`
- `Remove-Item -Recurse -Force /`
- `Format-Volume`
- `Stop-Process -Force`
- `Invoke-Expression` (when used with untrusted input)

## 7.13 Windows-Specific Paths

### 7.13.1 Application Paths

| Purpose            | Path                                                 | Registry/API             |
| ------------------ | ---------------------------------------------------- | ------------------------ |
| Application binary | `%LOCALAPPDATA%\AGI Workforce\AGI Workforce.exe`     | Installation default     |
| Application data   | `%LOCALAPPDATA%\AGI Workforce\data\`                 | `dirs::data_local_dir()` |
| Configuration      | `%LOCALAPPDATA%\AGI Workforce\config\`               | `dirs::config_dir()`     |
| SQLite database    | `%LOCALAPPDATA%\AGI Workforce\data\agi_workforce.db` |                          |
| Logs               | `%LOCALAPPDATA%\AGI Workforce\logs\`                 |                          |
| Cache              | `%LOCALAPPDATA%\AGI Workforce\cache\`                | `dirs::cache_dir()`      |
| Temp files         | `%TEMP%\AGI-Workforce\`                              | `std::env::temp_dir()`   |
| Downloads          | `%USERPROFILE%\Downloads\`                           | `dirs::download_dir()`   |
| Documents          | `%USERPROFILE%\Documents\`                           | `dirs::document_dir()`   |

### 7.13.2 Path Resolution

```
%LOCALAPPDATA%  = C:\Users\<name>\AppData\Local
%APPDATA%       = C:\Users\<name>\AppData\Roaming
%TEMP%          = C:\Users\<name>\AppData\Local\Temp
%USERPROFILE%   = C:\Users\<name>
%ProgramFiles%  = C:\Program Files
```

### 7.13.3 Path Handling Rules

- All paths use `std::path::Path` which handles backslash separators on Windows
- Display paths to users with backslash (Windows convention)
- Internal path operations use `PathBuf` for cross-platform safety
- WSL paths (`\\wsl$\Ubuntu\home\user\`) are supported in file operations
- Network paths (`\\server\share\`) are supported for file operations
- Long path support: Paths > 260 characters supported via `\\?\` prefix

## 7.14 High-DPI / Scaling Support

### 7.14.1 Overview

Windows has more scaling diversity than macOS (which uses only 2x Retina or 1x). Windows supports:

| Scale Factor | DPI     | Common Display        |
| ------------ | ------- | --------------------- |
| 100%         | 96 DPI  | 1080p at 24"          |
| 125%         | 120 DPI | 1080p at 15" (laptop) |
| 150%         | 144 DPI | 1440p at 27"          |
| 175%         | 168 DPI | 4K at 27"             |
| 200%         | 192 DPI | 4K at 15" (laptop)    |
| 250%         | 240 DPI | 4K at 13"             |
| 300%         | 288 DPI | 8K or small 4K        |

### 7.14.2 DPI Awareness

AGI Workforce is declared as **Per-Monitor DPI Aware v2** in the application manifest:

```xml
<application xmlns="urn:schemas-microsoft-com:asm.v3">
  <windowsSettings>
    <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">
      PerMonitorV2, PerMonitor
    </dpiAwareness>
  </windowsSettings>
</application>
```

### 7.14.3 Multi-Monitor DPI

When the user has multiple monitors at different DPI settings:

| Scenario                       | Behavior                                     |
| ------------------------------ | -------------------------------------------- |
| Move window between monitors   | WebView2 automatically re-renders at new DPI |
| Screen capture across monitors | Each monitor captured at native DPI          |
| UIA bounding rectangles        | Coordinates in physical pixels (DPI-aware)   |
| Mouse coordinates              | Physical pixel coordinates (DPI-aware)       |

### 7.14.4 Implementation Notes

- WebView2 handles HTML/CSS rendering DPI scaling automatically
- Tauri window management is DPI-aware via Windows APIs
- `xcap` capture returns images at native resolution (not scaled)
- UIA coordinates are in physical (screen) pixels
- `enigo` input simulation uses logical coordinates (scaled)
- Font rendering uses ClearType at all DPI levels

## 7.15 Win32 Window Management

### 7.15.1 Window Enumeration

Windows are enumerated using `EnumWindows` Win32 API:

```rust
pub fn list_windows() -> Result<Vec<AppWindow>> {
    // Callback-based enumeration via EnumWindows
    // Filters: visible windows only, non-tool windows, non-zero size
    // Gets: title (GetWindowTextW), process name (QueryFullProcessImageName),
    //        bounds (GetWindowRect), minimized state (IsIconic)
}
```

### 7.15.2 Window Activation

```rust
pub fn activate_window(title: &str) -> Result<WindowActivation> {
    // 1. Find window by title (case-insensitive substring match)
    // 2. If minimized, call ShowWindow(hwnd, SW_RESTORE)
    // 3. Call SetForegroundWindow(hwnd)
    // 4. Retry up to 3 times with 200ms delay
}
```

### 7.15.3 Application Launching

```rust
pub fn launch_application(name: &str) -> Result<()> {
    // 1. Validate application name (no path separators, no metacharacters)
    // 2. Use ShellExecuteW or CreateProcessW
    // 3. Wait for window to appear (up to 5 seconds)
}
```

### 7.15.4 SetForegroundWindow Limitations

Windows restricts `SetForegroundWindow` to prevent applications from stealing focus:

| Condition                                    | SetForegroundWindow Result     |
| -------------------------------------------- | ------------------------------ |
| Called from foreground process               | Success                        |
| Called from background process               | Taskbar button flashes instead |
| User recently interacted with calling window | Success                        |
| Foreground lock timeout expired              | Success                        |

Workaround: Simulate an Alt key press before calling SetForegroundWindow to satisfy the foreground lock requirement. This is implemented in the window activation logic.

## 7.16 Native Messaging Bridge (Chrome Extension)

### 7.16.1 Windows Registry Configuration

The Chrome extension communicates with the desktop app via Native Messaging Host (NMH). On Windows, the NMH manifest is registered in the Windows Registry:

```
HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.agiworkforce.bridge
    (Default) = "C:\Users\<user>\AppData\Local\AGI Workforce\nmh-manifest.json"
```

### 7.16.2 NMH Manifest (Windows)

```json
{
  "name": "com.agiworkforce.bridge",
  "description": "AGI Workforce Desktop Bridge",
  "path": "C:\\Users\\<user>\\AppData\\Local\\AGI Workforce\\agi-workforce-nmh.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<extension-id>/"]
}
```

## 7.17 Deep Linking (URI Scheme)

### 7.17.1 URI Scheme

AGI Workforce registers the `agiworkforce://` URI scheme on Windows:

| URI                           | Action                     |
| ----------------------------- | -------------------------- |
| `agiworkforce://`             | Open main window           |
| `agiworkforce://chat/new`     | Create new conversation    |
| `agiworkforce://chat/<id>`    | Open specific conversation |
| `agiworkforce://settings`     | Open settings              |
| `agiworkforce://pair/<token>` | Initiate mobile pairing    |

### 7.17.2 Registration

Registered via Windows Registry during installation (see Section 7.8.2).

### 7.17.3 Security

- All deep link parameters are validated against `ALLOWED_DEEP_LINK_PARAMS` allowlist
- Tokens are redacted from logs
- URL scheme validation prevents cross-scheme attacks

## 7.18 Power State Awareness

### 7.18.1 Implementation (Planned)

```rust
// Win32_System_Power feature
use windows::Win32::System::Power::*;

pub fn register_power_notifications(hwnd: HWND) -> Result<()> {
    // Register for: PBT_APMSUSPEND, PBT_APMRESUMESUSPEND
    // On suspend: pause background agents, save state
    // On resume: restore agents, check network, resume operations
}

pub fn prevent_sleep_while_agents_running() -> Result<()> {
    // SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
    // Prevents sleep while agents are actively executing
    // Cleared when all agents complete
}
```

### 7.18.2 Battery Awareness

| Power State       | Behavior                                              |
| ----------------- | ----------------------------------------------------- |
| AC power          | Normal operation                                      |
| Battery           | Reduce background polling frequency                   |
| Battery < 20%     | Pause non-critical background agents                  |
| Battery < 10%     | Notify user: "Low battery. Background agents paused." |
| Sleep/hibernate   | Save state, pause all agents                          |
| Resume from sleep | Restore state, check network, offer to resume agents  |

---

# Section 8: Build, Deploy & Distribution

## 8.1 Build Pipeline

### 8.1.1 Prerequisites

| Component                      | Version    | Installation                                     |
| ------------------------------ | ---------- | ------------------------------------------------ |
| Node.js                        | >= 22.12.0 | Official installer or nvm-windows                |
| pnpm                           | 9.15.3     | `npm install -g pnpm@9.15.3`                     |
| Rust                           | 1.90.0     | `rustup install 1.90.0`                          |
| Tauri CLI                      | 2.x        | `cargo install tauri-cli --version '^2'`         |
| Visual Studio Build Tools 2022 | Latest     | Microsoft Visual Studio Installer                |
| LLVM/Clang                     | Latest     | `winget install LLVM.LLVM` (for SQLCipher build) |
| WiX v4                         | 4.x        | `dotnet tool install --global wix`               |

### 8.1.2 Build Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Build frontend (TypeScript -> JavaScript bundle)
cd apps/desktop
pnpm build:web
# Runs: tsc && vite build
# Output: apps/desktop/dist/

# 3. Build backend + bundle installer (Rust -> Windows EXE + MSI)
pnpm build
# Runs: vite build && tauri build
# Output: apps/desktop/src-tauri/target/release/AGI Workforce.exe
#         apps/desktop/src-tauri/target/release/bundle/msi/AGI-Workforce_1.1.5_x64_en-US.msi
#         apps/desktop/src-tauri/target/release/bundle/nsis/AGI-Workforce-Setup_1.1.5_x64.exe
```

### 8.1.3 Build Configuration (tauri.conf.json)

```json
{
  "build": {
    "beforeBuildCommand": "pnpm build:web",
    "beforeDevCommand": "pnpm dev:vite",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com",
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      },
      "wix": {
        "language": "en-US",
        "upgradeCode": "<GUID>"
      },
      "nsis": {
        "displayLanguageSelector": false,
        "installMode": "currentUser",
        "languages": ["English"]
      }
    }
  }
}
```

### 8.1.4 Build Artifacts

| Artifact          | Path                                                           | Size   | Purpose                          |
| ----------------- | -------------------------------------------------------------- | ------ | -------------------------------- |
| EXE binary        | `target/release/AGI Workforce.exe`                             | ~30 MB | Standalone executable            |
| MSI installer     | `target/release/bundle/msi/AGI-Workforce_1.1.5_x64_en-US.msi`  | ~35 MB | Enterprise deployment            |
| NSIS installer    | `target/release/bundle/nsis/AGI-Workforce-Setup_1.1.5_x64.exe` | ~32 MB | Consumer installer               |
| PDB debug symbols | `target/release/AGI Workforce.pdb`                             | ~50 MB | Crash analysis (not distributed) |

## 8.2 Authenticode Code Signing

### 8.2.1 Signing Process

```bash
# Sign with Authenticode certificate
signtool sign /f certificate.pfx /p $PASSWORD /fd sha256 /tr http://timestamp.digicert.com /td sha256 "AGI Workforce.exe"
signtool sign /f certificate.pfx /p $PASSWORD /fd sha256 /tr http://timestamp.digicert.com /td sha256 "AGI-Workforce-Setup_1.1.5_x64.exe"
```

### 8.2.2 Certificate Requirements

| Aspect             | Requirement                                                     |
| ------------------ | --------------------------------------------------------------- |
| Certificate type   | Authenticode Code Signing (OV or EV)                            |
| Key size           | RSA 4096-bit minimum                                            |
| Hash algorithm     | SHA-256                                                         |
| Timestamp          | RFC 3161 timestamp from trusted TSA                             |
| Validity           | 1-3 years                                                       |
| Publisher name     | "AGI Automation LLC"                                            |
| EV for SmartScreen | Extended Validation certificate eliminates SmartScreen warnings |

### 8.2.3 Signing in CI/CD

```yaml
# .github/workflows/release-desktop.yml (Windows signing steps)
- name: Import certificate
  run: |
    $pfx = [Convert]::FromBase64String("${{ secrets.WINDOWS_CERTIFICATE }}")
    [IO.File]::WriteAllBytes("certificate.pfx", $pfx)

- name: Sign executable
  run: |
    signtool sign /f certificate.pfx /p "${{ secrets.CERTIFICATE_PASSWORD }}" /fd sha256 /tr http://timestamp.digicert.com /td sha256 "${{ env.BINARY_PATH }}"

- name: Sign installer
  run: |
    signtool sign /f certificate.pfx /p "${{ secrets.CERTIFICATE_PASSWORD }}" /fd sha256 /tr http://timestamp.digicert.com /td sha256 "${{ env.INSTALLER_PATH }}"

- name: Cleanup certificate
  run: Remove-Item certificate.pfx
```

## 8.3 CI/CD Pipeline

### 8.3.1 GitHub Actions Workflow

```yaml
# .github/workflows/release-desktop.yml
name: Release Desktop (Windows)
on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: '9.15.3'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: '1.90.0'
          targets: x86_64-pc-windows-msvc

      - name: Install LLVM (for SQLCipher)
        run: choco install llvm --version=17.0.6 -y

      - name: Install dependencies
        run: pnpm install

      - name: Run type check
        run: pnpm typecheck

      - name: Run Rust checks
        run: |
          cargo clippy -- -D warnings
          cargo test

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'AGI Workforce v__VERSION__'
          releaseBody: 'See the changelog for details.'
          releaseDraft: true
          prerelease: false

      - name: Sign with Authenticode
        run: |
          # Import and sign (see 8.2.3)
```

### 8.3.2 CI Gates (Windows-Specific)

| Gate                  | Tool         | Criterion                   |
| --------------------- | ------------ | --------------------------- |
| TypeScript type check | tsc          | Zero errors                 |
| ESLint                | eslint       | Zero errors                 |
| Vitest                | vitest       | All pass                    |
| Rust clippy           | cargo clippy | Zero warnings (-D warnings) |
| Rust tests            | cargo test   | All pass                    |
| Authenticode signing  | signtool     | Signed successfully         |
| Binary size           | custom check | < 50 MB                     |
| WebView2 presence     | build check  | Bootstrapper bundled        |

## 8.4 Auto-Update

### 8.4.1 Tauri Updater

The auto-update mechanism uses `tauri-plugin-updater`:

| Aspect                 | Detail                                                 |
| ---------------------- | ------------------------------------------------------ |
| Check frequency        | Every 6 hours (configurable)                           |
| Update server          | GitHub Releases API                                    |
| Update artifact        | NSIS installer EXE                                     |
| Signature verification | Ed25519 signature on update binary                     |
| User interaction       | Dialog with release notes + Install/Later/Skip buttons |

### 8.4.2 Update Flow

```
App starts -> Check GitHub Releases for latest version
    │
    ├── No update -> Continue normally
    │
    └── Update available -> Show dialog
         │
         ├── "Install Now" -> Download EXE -> Verify signature -> Close app -> Run installer -> Restart
         ├── "Later" -> Remind after 24 hours
         └── "Skip" -> Permanently skip this version
```

### 8.4.3 Update Endpoint

```json
// Tauri updater configuration
{
  "updater": {
    "endpoints": [
      "https://github.com/agiworkforce/agiworkforce/releases/latest/download/latest.json"
    ],
    "dialog": true,
    "pubkey": "<Ed25519 public key>"
  }
}
```

### 8.4.4 Update JSON Format

```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-03-10T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<Ed25519 signature>",
      "url": "https://github.com/.../releases/download/v1.2.0/AGI-Workforce-Setup_1.2.0_x64.exe.zip"
    }
  }
}
```

## 8.5 Enterprise Deployment

### 8.5.1 MSI Deployment via Group Policy

The MSI installer supports silent deployment via Active Directory Group Policy:

```batch
:: Silent install
msiexec /i "AGI-Workforce_1.1.5_x64_en-US.msi" /qn

:: Silent install with custom path
msiexec /i "AGI-Workforce_1.1.5_x64_en-US.msi" /qn INSTALLDIR="C:\Program Files\AGI Workforce"

:: Silent install with logging
msiexec /i "AGI-Workforce_1.1.5_x64_en-US.msi" /qn /l*v "install.log"
```

### 8.5.2 SCCM / Intune Deployment

| Aspect                 | Detail                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Detection method       | File existence: `%LOCALAPPDATA%\AGI Workforce\AGI Workforce.exe` |
| Install command        | `msiexec /i "AGI-Workforce_1.1.5_x64_en-US.msi" /qn`             |
| Uninstall command      | `msiexec /x {ProductCode} /qn`                                   |
| Restart required       | No                                                               |
| Estimated disk space   | 120 MB                                                           |
| Supported architecture | x64                                                              |

### 8.5.3 NSIS Silent Install

```batch
:: Silent install (current user)
AGI-Workforce-Setup_1.1.5_x64.exe /S

:: Silent install with custom path
AGI-Workforce-Setup_1.1.5_x64.exe /S /D=C:\CustomPath
```

---

# Section 9: Testing Strategy

## 9.1 Unit Tests

### 9.1.1 Frontend Unit Tests (Vitest)

| Module            | Test Count | Windows-Specific Tests          | Notes                |
| ----------------- | ---------- | ------------------------------- | -------------------- |
| Zustand stores    | 200+       | 5 (settings with Windows paths) | Shared with macOS    |
| React components  | 400+       | 10 (Windows keyboard shortcuts) | Shared with macOS    |
| Utility functions | 150+       | 3 (path handling)               | Shared with macOS    |
| IPC wrappers      | 100+       | 5 (Windows-specific commands)   | Shared with macOS    |
| Chat utilities    | 100+       | 0                               | Platform-independent |

### 9.1.2 Backend Unit Tests (cargo test)

| Module            | Test Count | Windows-Specific             | Notes                         |
| ----------------- | ---------- | ---------------------------- | ----------------------------- |
| UIA element tree  | 15         | Yes (Windows-only)           | Requires Windows desktop      |
| UIA actions       | 12         | Yes (Windows-only)           | Requires running applications |
| UIA patterns      | 8          | Yes (Windows-only)           | Pattern detection             |
| UIA wait          | 6          | Yes (Windows-only)           | Async waits                   |
| Screen capture    | 10         | Partial (DXGI-specific)      | CI needs display              |
| Window management | 8          | Yes (Win32 API)              | Requires desktop              |
| Clipboard         | 3          | Partial (Win32 fallback)     | CI may lack clipboard         |
| Input simulation  | 5          | Partial (SendInput)          | Requires desktop              |
| LLM router        | 50+        | No                           | Platform-independent          |
| SSE parser        | 30+        | No                           | Platform-independent          |
| SecretManager     | 15         | Partial (Credential Manager) | Keyring backend differs       |
| ToolGuard         | 40+        | No                           | Platform-independent          |
| Database          | 20+        | Partial (path differences)   | SQLCipher                     |

### 9.1.3 Windows-Only Test Configuration

```rust
#[cfg(test)]
#[cfg(target_os = "windows")]
mod windows_tests {
    use super::*;

    #[test]
    fn test_uia_list_windows() {
        if std::env::var("CI").is_ok() {
            return; // Skip in headless CI
        }
        let service = UIAutomationService::new().unwrap();
        let windows = service.list_windows().unwrap();
        assert!(!windows.is_empty(), "Should find at least one window");
    }

    #[test]
    fn test_dxgi_capture() {
        if std::env::var("CI").is_ok() {
            return; // Skip in headless CI
        }
        let image = capture_primary_screen().unwrap();
        assert!(image.pixels.width() > 0);
        assert!(image.pixels.height() > 0);
    }
}
```

## 9.2 Integration Tests

### 9.2.1 Windows-Specific Integration Tests

| Test   | Description                                  | Prerequisites            |
| ------ | -------------------------------------------- | ------------------------ |
| IT-W01 | Install MSI, verify installation, uninstall  | Clean Windows VM         |
| IT-W02 | Install NSIS, verify installation, uninstall | Clean Windows VM         |
| IT-W03 | Silent MSI install/uninstall                 | Clean Windows VM         |
| IT-W04 | Auto-start via registry                      | Installed app            |
| IT-W05 | Deep link URI handling                       | Installed app + browser  |
| IT-W06 | WebView2 bootstrap (missing runtime)         | Windows without WebView2 |
| IT-W07 | Credential Manager store/retrieve            | User account             |
| IT-W08 | System tray icon + context menu              | Desktop session          |
| IT-W09 | Windows Notification Center integration      | Desktop session          |
| IT-W10 | High-DPI rendering (200%)                    | High-DPI display or VM   |
| IT-W11 | Multi-monitor window management              | Multi-monitor setup      |
| IT-W12 | SmartScreen behavior (signed binary)         | Clean download           |
| IT-W13 | Windows Defender scan (no false positive)    | Default Defender config  |
| IT-W14 | UIA interaction with Notepad                 | Notepad open             |
| IT-W15 | UIA interaction with File Explorer           | Explorer open            |
| IT-W16 | PowerShell execution via terminal            | PowerShell installed     |
| IT-W17 | CMD execution via terminal                   | Always available         |
| IT-W18 | WSL integration (if available)               | WSL installed            |
| IT-W19 | File drag-and-drop from Explorer             | Desktop session          |
| IT-W20 | Clipboard paste (image from Win+Shift+S)     | Desktop session          |

## 9.3 E2E Tests (Playwright)

### 9.3.1 Windows E2E Test Configuration

```typescript
// playwright.config.ts (Windows)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false, // Serial for desktop automation
  retries: 2,
  workers: 1,
  reporter: [['html'], ['json', { outputFile: 'test-results.json' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'windows-1080p-100',
      use: {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'windows-1080p-150',
      use: {
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1.5,
      },
    },
    {
      name: 'windows-4k-200',
      use: {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
```

### 9.3.2 E2E Test Scenarios

| ID      | Scenario                          | Steps                                                | Expected Result           |
| ------- | --------------------------------- | ---------------------------------------------------- | ------------------------- |
| E2E-W01 | First launch onboarding           | Launch app -> Complete 4-step wizard                 | Chat interface shown      |
| E2E-W02 | Send message and receive response | Type message -> Press Enter -> Wait for response     | AI response displayed     |
| E2E-W03 | Switch AI model                   | Click model selector -> Choose model -> Send message | Response from new model   |
| E2E-W04 | Settings persistence              | Change settings -> Close app -> Reopen               | Settings preserved        |
| E2E-W05 | Dark mode toggle                  | Settings > Appearance > Dark Mode                    | Theme switches            |
| E2E-W06 | Keyboard shortcuts                | Press Ctrl+N, Ctrl+,, Ctrl+K                         | Correct actions triggered |
| E2E-W07 | File attachment                   | Click + > Attach File -> Select file                 | File attached to message  |
| E2E-W08 | Chat history navigation           | Send messages -> Go to History -> Click conversation | Conversation loads        |
| E2E-W09 | Terminal integration              | Open terminal -> Execute `dir`                       | Directory listing shown   |
| E2E-W10 | System tray behavior              | Close to tray -> Click tray icon                     | Window reappears          |
| E2E-W11 | Auto-update check                 | Settings > About > Check for Updates                 | Update status shown       |
| E2E-W12 | Error handling                    | Use invalid API key -> Send message                  | Friendly error displayed  |

## 9.4 Platform-Specific Test Matrix

### 9.4.1 OS Version Matrix

| OS         | Version      | Architecture      | DPI  | Status      |
| ---------- | ------------ | ----------------- | ---- | ----------- |
| Windows 10 | 21H2 (19044) | x64               | 100% | Required    |
| Windows 10 | 22H2 (19045) | x64               | 100% | Required    |
| Windows 10 | 22H2 (19045) | x64               | 150% | Required    |
| Windows 11 | 21H2 (22000) | x64               | 100% | Required    |
| Windows 11 | 23H2 (22631) | x64               | 125% | Required    |
| Windows 11 | 24H2 (26100) | x64               | 150% | Required    |
| Windows 11 | 24H2 (26100) | x64               | 200% | Required    |
| Windows 11 | 24H2 (26100) | ARM64 (emulation) | 150% | Best effort |

### 9.4.2 Hardware Matrix

| Configuration | CPU             | RAM   | Storage | GPU        | Status      |
| ------------- | --------------- | ----- | ------- | ---------- | ----------- |
| Low-end       | 2-core, 2.0 GHz | 4 GB  | HDD     | Integrated | Best effort |
| Mid-range     | 4-core, 2.5 GHz | 8 GB  | SSD     | Integrated | Required    |
| High-end      | 8-core, 3.5 GHz | 16 GB | NVMe    | Dedicated  | Required    |
| Multi-monitor | Any             | 8+ GB | SSD     | Any        | Required    |

### 9.4.3 Test Environment Setup

| Environment                     | Purpose                    | Platform                 |
| ------------------------------- | -------------------------- | ------------------------ |
| GitHub Actions (windows-latest) | CI: build + unit tests     | Windows Server 2022      |
| Azure VM (Windows 10)           | Manual: integration tests  | Windows 10 22H2          |
| Azure VM (Windows 11)           | Manual: integration tests  | Windows 11 24H2          |
| Physical hardware               | Manual: DPI, multi-monitor | Various                  |
| BrowserStack                    | Remote: compatibility      | Various Windows versions |

---

# Section 10: Performance Requirements

## 10.1 Startup Performance

| Metric                  | Target        | Measurement                                  |
| ----------------------- | ------------- | -------------------------------------------- |
| Cold start (SSD)        | < 3 seconds   | Time from double-click to chat input focused |
| Cold start (HDD)        | < 5 seconds   | Time from double-click to chat input focused |
| Warm start (from tray)  | < 500ms       | Time from tray click to window visible       |
| WebView2 initialization | < 1.5 seconds | Part of cold start                           |
| SQLite database open    | < 200ms       | Part of cold start                           |
| Settings load           | < 100ms       | Part of cold start                           |

### 10.1.1 Cold Start Breakdown

| Phase               | Target Duration | Actions                           |
| ------------------- | --------------- | --------------------------------- |
| Process launch      | < 200ms         | OS loads executable               |
| Rust initialization | < 500ms         | Tauri setup, state initialization |
| WebView2 init       | < 1000ms        | Edge WebView2 Runtime loads       |
| Frontend load       | < 800ms         | React app bundle loads            |
| Data hydration      | < 500ms         | Zustand stores + SQLite queries   |
| **Total**           | **< 3000ms**    |                                   |

## 10.2 Memory Footprint

| State                                 | Target    | Maximum |
| ------------------------------------- | --------- | ------- |
| Idle (no conversation)                | < 150 MB  | 200 MB  |
| Active chat (1 conversation)          | < 300 MB  | 400 MB  |
| Active chat (10 conversations loaded) | < 500 MB  | 700 MB  |
| Agent running (1 agent)               | < 400 MB  | 600 MB  |
| Agent swarm (10 agents)               | < 800 MB  | 1200 MB |
| Peak (100-agent swarm)                | < 2000 MB | 3000 MB |

### 10.2.1 Memory Breakdown

| Component                            | Typical Allocation |
| ------------------------------------ | ------------------ |
| Rust backend (Tokio runtime)         | ~30 MB             |
| SQLCipher database (in-memory cache) | ~20 MB             |
| WebView2 renderer                    | ~80 MB             |
| React application                    | ~40 MB             |
| Zustand stores                       | ~10 MB             |
| DOM elements                         | ~20 MB             |
| Image/attachment cache               | ~50 MB             |
| Per-agent overhead                   | ~20 MB each        |

## 10.3 CPU Usage

| State              | Target            | Maximum |
| ------------------ | ----------------- | ------- |
| Idle               | < 1%              | 3%      |
| Typing (input)     | < 5%              | 10%     |
| Streaming response | < 15%             | 25%     |
| Screen capture     | < 20% (momentary) | 30%     |
| Agent running      | < 20% sustained   | 40%     |
| Multi-agent swarm  | < 50% sustained   | 80%     |

## 10.4 Rendering Performance

| Metric           | Target  | Notes                           |
| ---------------- | ------- | ------------------------------- |
| UI animations    | 60 fps  | Framer Motion transitions       |
| Chat scroll      | 60 fps  | Virtualized list (react-window) |
| Terminal output  | 60 fps  | xterm.js WebGL renderer         |
| Theme switch     | < 100ms | CSS variable change             |
| Sidebar toggle   | < 200ms | CSS transition                  |
| Modal open/close | < 200ms | Radix UI animation              |

## 10.5 Network Performance

| Metric                   | Target                               | Notes              |
| ------------------------ | ------------------------------------ | ------------------ |
| LLM first token          | < 1 second (after provider response) | SSE parser latency |
| IPC invoke round-trip    | < 5ms                                | Tauri IPC          |
| File read (1 MB)         | < 50ms                               | SSD                |
| File write (1 MB)        | < 100ms                              | SSD                |
| SQLite query (indexed)   | < 10ms                               | Typical query      |
| SQLite query (full scan) | < 100ms                              | Should be rare     |

## 10.6 Bundle Size

| Artifact                 | Target   | Current | Notes                        |
| ------------------------ | -------- | ------- | ---------------------------- |
| EXE binary               | < 35 MB  | ~30 MB  | opt-level = "z", LTO enabled |
| NSIS installer           | < 35 MB  | ~32 MB  | Compressed                   |
| MSI installer            | < 40 MB  | ~35 MB  | MSI overhead                 |
| Frontend bundle (JS+CSS) | < 5 MB   | ~3 MB   | Vite tree-shaking            |
| Total installed size     | < 130 MB | ~120 MB | Including WebView2           |

## 10.7 Windows-Specific Performance

| Metric                    | Target  | Notes                              |
| ------------------------- | ------- | ---------------------------------- |
| UIA element query         | < 200ms | First query; cached queries < 10ms |
| DXGI screen capture       | < 10ms  | 1920x1080                          |
| GDI screen capture        | < 25ms  | 1920x1080 (fallback)               |
| Win32 window enumeration  | < 50ms  | Typical desktop (20 windows)       |
| Registry read             | < 5ms   | Single key read                    |
| Registry write            | < 10ms  | Single key write                   |
| Credential Manager access | < 50ms  | Store or retrieve                  |
| ConPTY spawn              | < 200ms | New terminal instance              |

---

# Section 11: Security

## 11.1 Windows Threat Model

### 11.1.1 Attack Surface

| Surface                 | Threats                                 | Mitigations                                    |
| ----------------------- | --------------------------------------- | ---------------------------------------------- |
| Installer               | Tampered installer, DLL sideloading     | Authenticode signing, integrity checks         |
| Binary                  | Reverse engineering, code injection     | Code signing, opt-level="z" minification       |
| IPC (WebView2 <-> Rust) | Message injection, privilege escalation | Tauri capability model, input validation       |
| Network                 | MITM, credential theft                  | rustls TLS 1.3, certificate pinning (planned)  |
| File system             | Sensitive file exposure, path traversal | ToolGuard path validation, deny lists          |
| Registry                | Malicious registry entries              | Only write to HKCU, validate all values        |
| Clipboard               | Clipboard sniffing                      | Lock-release pattern, no persistent monitoring |
| Screen capture          | Unauthorized screen recording           | Audit logging, user consent                    |
| UI Automation           | Unauthorized application control        | ToolGuard validation, audit logging            |
| Memory                  | Memory dump credential exposure         | Zeroize sensitive buffers (planned)            |

### 11.1.2 Threat Prioritization

| Threat                              | Severity | Likelihood | Priority       |
| ----------------------------------- | -------- | ---------- | -------------- |
| API key exposure in memory          | High     | Medium     | P0             |
| Shell injection via agent           | Critical | High       | P0 (mitigated) |
| Path traversal via file operations  | High     | Medium     | P0 (mitigated) |
| Clipboard data leak                 | Medium   | Low        | P2             |
| Screen capture misuse               | Medium   | Low        | P2             |
| UIA interaction with sensitive apps | Medium   | Medium     | P1             |
| DLL sideloading                     | High     | Low        | P1             |
| Registry manipulation               | Low      | Low        | P3             |

## 11.2 Secret Storage (Windows)

### 11.2.1 Primary: Windows Credential Manager

```
SecretManager.store("anthropic-api-key", "sk-ant-...")
    │
    ├── HKDF(SHA-256, master_key, "anthropic-api-key") -> derived_key
    ├── AES-GCM(derived_key, random_nonce, "sk-ant-...") -> ciphertext
    ├── SQLCipher: INSERT encrypted_secrets(key, ciphertext, nonce, tag)
    └── keyring::Entry("agi-workforce", "anthropic-api-key")
            .set_password(base64(derived_key))
                │
                └── Windows Credential Manager (Windows Vault)
                    Target: agi-workforce/anthropic-api-key
                    User: agi-workforce
                    Type: Generic Credential
```

### 11.2.2 Fallback: DPAPI

If Credential Manager is unavailable:

```
CryptProtectData(plaintext, entropy) -> encrypted_blob
    │
    └── Stored in: %LOCALAPPDATA%\AGI Workforce\credentials\<key-name>.bin
```

### 11.2.3 Security Properties

| Property             | Value                                |
| -------------------- | ------------------------------------ |
| Key derivation       | Argon2id (OWASP recommended)         |
| Encryption           | AES-256-GCM                          |
| At-rest storage      | SQLCipher (AES-256-CBC)              |
| Key material storage | Windows Credential Manager           |
| Machine binding      | machine-uid (tied to hardware)       |
| Password hashing     | PBKDF2-HMAC-SHA256 (master password) |
| Zeroization          | Planned (explicit buffer clearing)   |

## 11.3 Windows Defender Integration

### 11.3.1 Exclusion Recommendations

For enterprise deployments, administrators may want to add exclusions:

```powershell
# PowerShell (Administrator)
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\AGI Workforce"
Add-MpPreference -ExclusionProcess "AGI Workforce.exe"
```

These exclusions are optional and only recommended if Defender causes performance issues during file-intensive agent operations.

### 11.3.2 AMSI Integration (Planned)

Windows Antimalware Scan Interface (AMSI) integration is planned for v2.0.0:

- Scan agent-generated scripts before execution
- Scan downloaded files before processing
- Report scan results in audit log

## 11.4 SmartScreen Compliance

| Phase   | Certificate                | SmartScreen Behavior                                |
| ------- | -------------------------- | --------------------------------------------------- |
| Phase 1 | Standard Code Signing (OV) | Warning with publisher name, "Run anyway" available |
| Phase 2 | Standard + Reputation      | Reduced warnings as download count grows            |
| Phase 3 | Extended Validation (EV)   | No warning, immediate trust                         |

## 11.5 UAC Security Model

AGI Workforce runs entirely in standard user context:

- No operations require administrator privileges during normal use
- Per-user installation (`%LOCALAPPDATA%`) avoids UAC entirely
- Agent file operations are restricted to user-accessible directories
- Registry writes only to HKCU (user hive, no admin needed)
- Credential Manager access is per-user

## 11.6 Data at Rest / In Transit

| Data             | At Rest                                 | In Transit             |
| ---------------- | --------------------------------------- | ---------------------- |
| API keys         | AES-256-GCM (SecretManager) + SQLCipher | TLS 1.3 (rustls)       |
| Conversations    | SQLCipher (AES-256-CBC)                 | TLS 1.3 (to Supabase)  |
| Settings         | SQLCipher                               | N/A (local only)       |
| LLM requests     | Not persisted                           | TLS 1.3 (to providers) |
| Audit logs       | Plaintext (local file)                  | N/A (local only)       |
| Cached responses | SQLCipher                               | N/A (local only)       |

## 11.7 Shell Injection Mitigations

### 11.7.1 Windows-Specific CVE Mitigations

Three shell injection CVEs were patched in the security hardening pass (2026-03-08):

| CVE                            | Component         | Fix                                                                                    |
| ------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| Window title injection         | window_manager.rs | `sanitize_applescript_string()` + `sanitize_window_title_arg()`                        |
| Process launch injection       | window_manager.rs | `validate_app_name()` - allowlist characters, block path separators and metacharacters |
| Command injection via terminal | terminal commands | `shlex::try_quote()` for shell argument escaping                                       |

### 11.7.2 PowerShell-Specific Protections

- All PowerShell commands executed via `-NonInteractive -Command` (not `-File`)
- Command strings escaped via `shlex::try_quote()`
- Blocked command list includes dangerous PowerShell cmdlets
- ToolGuard validates all shell commands before execution
- Audit logging captures every shell execution

## 11.8 DLL Sideloading Prevention

| Mitigation             | Implementation                                                |
| ---------------------- | ------------------------------------------------------------- |
| Safe DLL search order  | Application manifest declares `<dllDirectory search="true"/>` |
| Signed dependencies    | All bundled DLLs are signed                                   |
| Load verification      | Planned: Verify DLL signatures at load time                   |
| Controlled search path | Application directory first, then system directories          |

---

# Section 12: Accessibility

## 12.1 Screen Reader Support

### 12.1.1 Supported Screen Readers

| Screen Reader                   | Status        | Notes                                 |
| ------------------------------- | ------------- | ------------------------------------- |
| NVDA (NonVisual Desktop Access) | P0 - Required | Most popular free screen reader       |
| JAWS (Job Access With Speech)   | P1 - High     | Most popular commercial screen reader |
| Windows Narrator                | P0 - Required | Built into Windows                    |

### 12.1.2 Implementation Strategy

WebView2 (Chromium) provides excellent built-in accessibility support:

| Feature            | Implementation                                               |
| ------------------ | ------------------------------------------------------------ |
| ARIA roles         | All Radix UI components have proper ARIA roles               |
| ARIA labels        | All interactive elements have aria-label or aria-labelledby  |
| ARIA live regions  | Chat messages use aria-live="polite" for announcements       |
| Focus management   | Keyboard focus visible indicator on all interactive elements |
| Tab order          | Logical tab order: sidebar -> header -> content -> footer    |
| Skip links         | "Skip to main content" link at top of page                   |
| Headings hierarchy | h1-h6 used correctly for document structure                  |

### 12.1.3 Screen Reader Announcements

| Event                    | Announcement                                       |
| ------------------------ | -------------------------------------------------- |
| New AI message           | "[Model Name] says: [first 100 chars of response]" |
| Tool execution started   | "Tool started: [tool name]"                        |
| Tool execution completed | "Tool completed: [tool name] in [duration]"        |
| Agent status change      | "Agent [name] status changed to [status]"          |
| Error                    | "Error: [friendly message]"                        |
| Notification             | "[notification title]: [notification body]"        |
| Model changed            | "Model changed to [model name]"                    |

### 12.1.4 NVDA-Specific Testing Checklist

| Area           | Test             | Expected                                  |
| -------------- | ---------------- | ----------------------------------------- |
| Chat input     | Focus + type     | Input announced, keystrokes echoed        |
| Send message   | Press Enter      | "Message sent" announced                  |
| AI response    | Response streams | Full response announced when complete     |
| Model selector | Open + navigate  | Model names announced                     |
| Settings       | Navigate tabs    | Tab names and setting values announced    |
| Sidebar        | Navigate items   | Item names and states announced           |
| Dialogs        | Open modal       | Focus trapped, title announced            |
| Notifications  | Toast appears    | Notification text announced via aria-live |

## 12.2 Keyboard-Only Navigation

### 12.2.1 Navigation Map

```
Tab Order:
1. Skip link ("Skip to main content")
2. Sidebar items (vertical)
   2.1 New Chat
   2.2 History
   2.3 Agents
   2.4 Skills
   2.5 Research
   2.6 Terminal
   2.7 Files
   2.8 Browser
   2.9 Analytics
   2.10 Settings
3. Header controls
   3.1 Model Selector
   3.2 Conversation Title
   3.3 Plus Menu
   3.4 Settings Toggle
4. Main content area (varies by route)
5. Chat input area
   5.1 Plus button
   5.2 Text input
   5.3 Send button
```

### 12.2.2 Keyboard Interaction Patterns

| Pattern         | Keys                   | Behavior                          |
| --------------- | ---------------------- | --------------------------------- |
| Navigate        | Tab / Shift+Tab        | Move between interactive elements |
| Activate        | Enter / Space          | Click button or link              |
| Navigate list   | Arrow keys             | Move within a list or menu        |
| Select          | Enter                  | Select current item               |
| Cancel          | Escape                 | Close modal, cancel operation     |
| Navigate tabs   | Arrow Left/Right       | Switch settings tabs              |
| Scroll          | Page Up/Down, Home/End | Scroll chat messages              |
| Focus input     | Ctrl+L                 | Focus chat input                  |
| Command palette | Ctrl+K                 | Open command palette              |

## 12.3 Color Contrast (WCAG AA)

### 12.3.1 Contrast Requirements

| Element              | Light Theme        | Dark Theme         | WCAG Level |
| -------------------- | ------------------ | ------------------ | ---------- |
| Body text            | >= 4.5:1           | >= 4.5:1           | AA         |
| Large text (18px+)   | >= 3:1             | >= 3:1             | AA         |
| Interactive elements | >= 3:1 (non-text)  | >= 3:1 (non-text)  | AA         |
| Focus indicators     | >= 3:1             | >= 3:1             | AA         |
| Error text           | >= 4.5:1           | >= 4.5:1           | AA         |
| Placeholder text     | >= 4.5:1           | >= 4.5:1           | AA         |
| Disabled elements    | N/A (not required) | N/A (not required) | N/A        |

### 12.3.2 Color Palette (Tested)

| Color Use      | Light Hex | Dark Hex | Contrast (Light bg) | Contrast (Dark bg) |
| -------------- | --------- | -------- | ------------------- | ------------------ |
| Primary text   | #1a1a1a   | #f5f5f5  | 16.8:1              | 16.1:1             |
| Secondary text | #4a4a4a   | #b3b3b3  | 7.4:1               | 7.1:1              |
| Primary action | #2563eb   | #60a5fa  | 4.7:1               | 5.2:1              |
| Error          | #dc2626   | #f87171  | 4.5:1               | 4.6:1              |
| Success        | #16a34a   | #4ade80  | 4.5:1               | 5.1:1              |
| Warning        | #ca8a04   | #fbbf24  | 4.5:1               | 3.1:1 (large text) |

## 12.4 High Contrast Mode

### 12.4.1 Windows High Contrast Detection

AGI Workforce detects Windows High Contrast mode and adjusts rendering:

```css
@media (forced-colors: active) {
  /* High contrast mode active */
  .button {
    border: 2px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
  .focus-ring {
    outline: 2px solid Highlight;
  }
}
```

### 12.4.2 High Contrast Themes

| Windows Theme                     | Behavior                            |
| --------------------------------- | ----------------------------------- |
| High Contrast #1 (White on Black) | All colors mapped to system colors  |
| High Contrast #2 (Black on White) | All colors mapped to system colors  |
| High Contrast Black               | Dark background with high contrast  |
| High Contrast White               | White background with high contrast |

### 12.4.3 Testing Requirements

All screens must be visually verified in:

- Standard light theme
- Standard dark theme
- Windows High Contrast #1
- Windows High Contrast #2

## 12.5 Windows Narrator

### 12.5.1 Narrator Compatibility

Windows Narrator uses UI Automation (UIA) to interact with WebView2:

| Feature             | Status    | Notes                              |
| ------------------- | --------- | ---------------------------------- |
| Content reading     | Supported | WebView2 exposes DOM as UIA tree   |
| Navigation          | Supported | Narrator scan mode works           |
| Form interaction    | Supported | Input fields properly exposed      |
| Live regions        | Supported | aria-live regions announce changes |
| Headings navigation | Supported | h1-h6 properly exposed             |
| Landmarks           | Supported | ARIA landmarks (main, nav, etc.)   |

## 12.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

When Windows "Show animations in Windows" setting is turned off, all Framer Motion animations are disabled and CSS transitions are reduced to near-instant.

---

# Section 13: Competitive Analysis

## 13.1 Claude Desktop for Windows

### 13.1.1 Overview

Claude Desktop launched on Windows on February 10, 2026. It provides a native Windows application for interacting with Anthropic's Claude models.

### 13.1.2 Feature Comparison

| Feature               | AGI Workforce                           | Claude Desktop Windows               | Advantage        |
| --------------------- | --------------------------------------- | ------------------------------------ | ---------------- |
| **Model support**     | 12+ cloud providers + local models       | Anthropic only                       | AGI Workforce    |
| **Local LLMs**        | Ollama, LM Studio, vLLM, llama.cpp      | None                                 | AGI Workforce    |
| **BYOK**              | Full (all providers)                    | None (subscription only)             | AGI Workforce    |
| **MCP tools**         | Unlimited (stdio, SSE, HTTP)            | Yes (stdio primarily)                | AGI Workforce    |
| **Computer use**      | Full (UIA + vision + input sim)         | Limited (beta, Anthropic-controlled) | AGI Workforce    |
| **UI Automation**     | Full UIA COM integration                | None                                 | AGI Workforce    |
| **Background agents** | 24hr+, multiple concurrent              | None                                 | AGI Workforce    |
| **Multi-agent swarm** | Up to 100 concurrent                    | None                                 | AGI Workforce    |
| **Voice I/O**         | Whisper + Piper + Deepgram              | None                                 | AGI Workforce    |
| **Terminal**          | Full (PowerShell, CMD, WSL)             | MCP-based (limited)                  | AGI Workforce    |
| **File operations**   | Direct file system access               | MCP-based (limited)                  | AGI Workforce    |
| **Code editor**       | Monaco editor (full IDE)                | Artifacts (read-only)                | AGI Workforce    |
| **Research mode**     | Multi-source agentic research           | Single-prompt (no orchestration)     | AGI Workforce    |
| **Analytics**         | Usage dashboard with cost tracking      | None                                 | AGI Workforce    |
| **Skills**            | 169+ non-coding skills                  | None (general chat only)             | AGI Workforce    |
| **Artifacts**         | Full (code, images, canvas)             | Yes (code blocks)                    | Parity           |
| **Markdown**          | Full (KaTeX, Mermaid, syntax highlight) | Full                                 | Parity           |
| **Chat quality**      | Depends on model choice                 | Claude-specific optimization         | Claude Desktop   |
| **Pricing**           | BYOK (pay API costs)                    | $20/mo Pro, $100/mo Max              | Depends on usage |
| **Mobile companion**  | QR-pair, live dashboard                 | Basic (web)                          | AGI Workforce    |
| **Installer**         | MSI + NSIS + Authenticode               | EXE + Authenticode                   | Parity           |
| **Auto-update**       | Tauri updater                           | Custom updater                       | Parity           |
| **System tray**       | Full (context menu, status)             | Basic                                | AGI Workforce    |
| **Offline support**   | Yes (local models)                      | No                                   | AGI Workforce    |

### 13.1.3 Claude Desktop Strengths

1. **First-party Claude integration**: Optimized prompt handling, extended thinking, and tool use specifically tuned for Claude models
2. **Brand trust**: Anthropic is a recognized AI brand
3. **Simplicity**: Single-model focus means fewer configuration options and less complexity
4. **Artifacts**: Well-polished artifact rendering

### 13.1.4 Claude Desktop Weaknesses

1. **Vendor lock-in**: Only works with Claude models
2. **No local models**: Requires internet connection and Anthropic subscription
3. **Limited automation**: No background agents, no multi-agent swarms
4. **No terminal**: Must use MCP for command execution
5. **No analytics**: No cost tracking or usage insights
6. **No enterprise deployment**: No MSI, no GPO support

## 13.2 ChatGPT for Windows

### 13.2.1 Overview

OpenAI offers a Windows desktop application for ChatGPT. It provides a native Windows wrapper around the ChatGPT interface.

### 13.2.2 Feature Comparison

| Feature                | AGI Workforce          | ChatGPT Windows          | Advantage               |
| ---------------------- | ---------------------- | ------------------------ | ----------------------- |
| **Model support**      | 12+ providers + local   | OpenAI only              | AGI Workforce           |
| **Desktop automation** | Full (UIA + vision)    | None                     | AGI Workforce           |
| **MCP tools**          | Yes                    | No                       | AGI Workforce           |
| **Background agents**  | Yes (24hr+)            | No                       | AGI Workforce           |
| **Voice**              | STT + TTS              | Advanced Voice Mode      | ChatGPT                 |
| **Image generation**   | Via API                | DALL-E integrated        | ChatGPT                 |
| **File operations**    | Direct file system     | Upload only              | AGI Workforce           |
| **Search**             | Multi-source research  | Web browsing             | Parity                  |
| **Code execution**     | Sandboxed terminal     | Code Interpreter         | Parity                  |
| **Memory**             | Local embeddings + RAG | Cloud-based memory       | AGI Workforce (privacy) |
| **Pricing**            | BYOK                   | $20/mo Plus, $200/mo Pro | Depends on usage        |
| **Offline**            | Yes (local models)     | No                       | AGI Workforce           |
| **Enterprise**         | MSI deployment         | Basic                    | AGI Workforce           |

### 13.2.3 ChatGPT Strengths

1. **Advanced Voice Mode**: Superior real-time voice conversation
2. **DALL-E integration**: Seamless image generation
3. **Brand recognition**: ChatGPT is the most recognized AI chatbot brand
4. **Polish**: Highly polished user interface

### 13.2.4 ChatGPT Weaknesses

1. **OpenAI lock-in**: Only OpenAI models
2. **No desktop automation**: Cannot interact with Windows applications
3. **No background agents**: Requires active user session
4. **No MCP tools**: Limited extensibility
5. **No local models**: Always requires internet + subscription

## 13.3 Microsoft Copilot

### 13.3.1 Overview

Microsoft Copilot is pre-installed on Windows 11 and deeply integrated into the OS. It uses GPT-4 and is accessible via the Win+C shortcut.

### 13.3.2 Feature Comparison

| Feature                | AGI Workforce                       | Microsoft Copilot         | Advantage            |
| ---------------------- | ----------------------------------- | ------------------------- | -------------------- |
| **Model choice**       | 12+ providers + local                | GPT-4 only                | AGI Workforce        |
| **OS integration**     | Deep (UIA, Win32)                   | Deepest (OS-level)        | Copilot              |
| **Settings control**   | Copilot can change Windows settings | Cannot change OS settings | Copilot              |
| **Office integration** | Via UIA (any app)                   | Native (M365 Copilot)     | Copilot (for Office) |
| **Desktop automation** | Full                                | Partial (own UI only)     | AGI Workforce        |
| **MCP tools**          | Yes                                 | No                        | AGI Workforce        |
| **Background agents**  | Yes                                 | No                        | AGI Workforce        |
| **Terminal**           | Full (PowerShell, CMD, WSL)         | No                        | AGI Workforce        |
| **Custom AI skills**   | 169+                                | None (general chat)       | AGI Workforce        |
| **Privacy**            | Local-first, BYOK                   | Cloud-only (Microsoft)    | AGI Workforce        |
| **Pricing**            | BYOK                                | Free (basic), $20/mo Pro  | Copilot (basic)      |
| **Enterprise**         | MSI deployment                      | Pre-installed             | Copilot              |
| **Offline**            | Yes (local models)                  | No                        | AGI Workforce        |

### 13.3.3 Copilot Strengths

1. **Pre-installed**: Ships with Windows 11, zero friction
2. **OS-level integration**: Can change Windows settings, open apps
3. **Microsoft 365 integration**: Deep Office integration (separate Copilot Pro product)
4. **Bing search**: Real-time web search integration
5. **Free tier**: Basic functionality at no cost

### 13.3.4 Copilot Weaknesses

1. **GPT-4 only**: No model choice
2. **No MCP**: Cannot extend with custom tools
3. **No background agents**: No autonomous operation
4. **No BYOK**: Must use Microsoft's infrastructure
5. **Privacy concerns**: All data processed by Microsoft
6. **No local models**: Internet always required
7. **Limited automation**: Cannot interact with third-party apps the way AGI Workforce can via UIA

## 13.4 Windows PowerToys

### 13.4.1 Overview

Microsoft PowerToys is a free utility suite for Windows that includes productivity tools. While not a direct AI competitor, several PowerToys features overlap with AGI Workforce capabilities.

### 13.4.2 Feature Overlap

| Feature            | AGI Workforce               | PowerToys                   | Notes                     |
| ------------------ | --------------------------- | --------------------------- | ------------------------- |
| Command palette    | Ctrl+K (AI-powered)         | PowerToys Run (Alt+Space)   | AGI Workforce is AI-aware |
| Window management  | Programmatic (agent-driven) | FancyZones (manual layouts) | Different purpose         |
| Keyboard shortcuts | Configurable global         | Keyboard Manager            | Similar capability        |
| Color picker       | Not implemented             | Color Picker                | PowerToys only            |
| File renaming      | AI-powered batch rename     | PowerRename (regex)         | AGI Workforce is AI-aware |
| Image resize       | Via AI model                | Image Resizer               | PowerToys is simpler      |
| Screen capture     | For AI analysis             | Not included (use Snipping) | AGI Workforce is AI-aware |

### 13.4.3 Complementary Use

AGI Workforce and PowerToys are complementary, not competitive. Users can use both simultaneously:

- PowerToys Run for quick app/file launching
- AGI Workforce Ctrl+K for AI-powered commands
- PowerToys FancyZones for window layout
- AGI Workforce for automated window management during agent tasks

## 13.5 Strategic Positioning Summary

### 13.5.1 Where AGI Workforce Leads

1. **Model agnosticism**: Only product with 12+ providers + local models
2. **Desktop automation**: Full UIA + vision + input simulation
3. **Agent autonomy**: Background agents, multi-agent swarms, 24hr+ operation
4. **MCP ecosystem**: Unlimited tools, no caps
5. **Privacy**: Local-first, BYOK, offline-capable
6. **Enterprise deployment**: MSI, silent install, GPO-compatible
7. **Non-coding skills**: 169+ skills across 23 categories

### 13.5.2 Where Parity is Needed

1. **Voice quality**: ChatGPT's Advanced Voice Mode is superior
2. **Image generation**: ChatGPT's DALL-E integration is more seamless
3. **Brand awareness**: All competitors have stronger brand recognition
4. **First-run experience**: SmartScreen warnings create friction
5. **Pre-installation**: Copilot has zero-friction distribution

### 13.5.3 Strategic Gaps to Own

1. **True desktop agent**: No competitor offers full autonomous desktop control + multi-model + native GUI
2. **Enterprise AI platform**: Position as the enterprise alternative to consumer AI chatbots
3. **Windows-native agent**: Leverage UIA for structured app interaction (competitors use only vision)
4. **Offline AI workforce**: Full functionality without internet via local models
5. **Mobile companion**: QR-pair with desktop, live agent dashboard from phone (unique in market)
6. **AI skill marketplace**: 169+ non-coding skills (healthcare, legal, finance, education) - every competitor is code-focused

### 13.5.4 Competitive Roadmap

| Timeline         | Action                                     | Target                            |
| ---------------- | ------------------------------------------ | --------------------------------- |
| v1.2.0 (Q2 2026) | EV code signing, zero SmartScreen warnings | Eliminate install friction        |
| v1.3.0 (Q3 2026) | ARM64 native build                         | Surface Pro X, Snapdragon laptops |
| v1.4.0 (Q4 2026) | Microsoft Store listing                    | Zero-friction distribution        |
| v2.0.0 (Q1 2027) | AMSI integration, AppLocker support        | Enterprise security certification |
| v2.1.0 (Q2 2027) | Active Directory SSO                       | Enterprise identity integration   |
| v2.2.0 (Q3 2027) | Intune MDM integration                     | Enterprise device management      |

---

# Appendix A: Windows API Reference

## A.1 Win32 APIs Used

| API                          | Header              | Purpose                          |
| ---------------------------- | ------------------- | -------------------------------- |
| `EnumWindows`                | WindowsAndMessaging | List all top-level windows       |
| `GetWindowTextW`             | WindowsAndMessaging | Get window title                 |
| `IsWindowVisible`            | WindowsAndMessaging | Check window visibility          |
| `GetWindowLongPtrW`          | WindowsAndMessaging | Get window style flags           |
| `GetWindowRect`              | WindowsAndMessaging | Get window position/size         |
| `GetWindowThreadProcessId`   | WindowsAndMessaging | Get window's process ID          |
| `SetForegroundWindow`        | WindowsAndMessaging | Activate a window                |
| `ShowWindow`                 | WindowsAndMessaging | Restore minimized window         |
| `IsIconic`                   | WindowsAndMessaging | Check if window is minimized     |
| `GetForegroundWindow`        | WindowsAndMessaging | Get currently focused window     |
| `OpenProcess`                | Threading           | Get process handle               |
| `QueryFullProcessImageNameW` | Threading           | Get process executable path      |
| `OpenClipboard`              | DataExchange        | Lock clipboard for access        |
| `GetClipboardData`           | DataExchange        | Read clipboard content           |
| `CloseClipboard`             | DataExchange        | Release clipboard lock           |
| `BitBlt`                     | Gdi                 | GDI screen capture               |
| `CreateCompatibleDC`         | Gdi                 | Create compatible device context |
| `CreateCompatibleBitmap`     | Gdi                 | Create compatible bitmap         |
| `GetDIBits`                  | Gdi                 | Get bitmap pixel data            |

## A.2 COM Interfaces Used

| Interface                            | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `IUIAutomation`                      | Root UIA interface, element search   |
| `IUIAutomationElement`               | Individual UI element                |
| `IUIAutomationCondition`             | Search filter condition              |
| `IUIAutomationInvokePattern`         | Button click, menu activation        |
| `IUIAutomationValuePattern`          | Text field read/write                |
| `IUIAutomationTogglePattern`         | Checkbox toggle                      |
| `IUIAutomationTextPattern`           | Text content extraction              |
| `IUIAutomationGridPattern`           | Grid/table cell access               |
| `IUIAutomationTablePattern`          | Table structure                      |
| `IUIAutomationScrollPattern`         | Container scrolling                  |
| `IUIAutomationExpandCollapsePattern` | Tree node expand/collapse            |
| `IUIAutomationSelectionItemPattern`  | List item selection                  |
| `IUIAutomationScrollItemPattern`     | Scroll element into view             |
| `ITaskbarList3`                      | Taskbar progress indicator (planned) |
| `ICustomDestinationList`             | Jump list entries (planned)          |

## A.3 Registry Keys Used

| Key                                                                                   | Purpose         | Access            |
| ------------------------------------------------------------------------------------- | --------------- | ----------------- |
| `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`                                  | Auto-start      | Read/Write        |
| `HKCU\SOFTWARE\Classes\agiworkforce`                                                  | URI scheme      | Write (installer) |
| `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\AGI Workforce`              | Uninstall info  | Write (installer) |
| `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.agiworkforce.bridge`            | Chrome NMH      | Write (installer) |
| `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize\AppsUseLightTheme` | Theme detection | Read              |
| `HKCU\SOFTWARE\Microsoft\Windows\DWM\AccentColor`                                     | Accent color    | Read              |
| `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings\ProxyServer`        | System proxy    | Read              |

---

# Appendix B: File System Layout

## B.1 Installation Directory (Per-User)

```
C:\Users\<name>\AppData\Local\AGI Workforce\
├── AGI Workforce.exe              # Main executable (~30 MB)
├── WebView2Loader.dll             # WebView2 bootstrap DLL
├── resources\                     # Bundled resources
│   ├── icons\                    # Application icons
│   └── assets\                   # Static assets
├── data\                         # Application data
│   ├── agi_workforce.db          # SQLCipher encrypted database
│   ├── agi_workforce.db-wal      # WAL journal
│   └── agi_workforce.db-shm      # Shared memory
├── config\                       # Configuration
│   ├── settings.json             # User settings
│   └── .mcp.json                 # MCP server configuration
├── logs\                         # Log files
│   ├── app.log                   # Application log
│   ├── audit.log                 # Security audit log
│   └── crash.log                 # Crash dumps
├── cache\                        # Cache directory
│   ├── llm_cache\               # LLM response cache
│   ├── model_cache\             # Downloaded model files
│   └── image_cache\             # Cached images
├── credentials\                  # DPAPI fallback credentials
├── nmh-manifest.json             # Chrome NMH manifest
└── uninstall.exe                 # Uninstaller
```

## B.2 Temporary Directory

```
C:\Users\<name>\AppData\Local\Temp\AGI-Workforce\
├── screenshots\                  # Temporary screenshot captures
├── uploads\                      # Temporary file uploads
├── exports\                      # Temporary export files
└── updates\                      # Downloaded update installers
```

---

# Appendix C: Error Codes

## C.1 Windows-Specific Error Codes

| Code  | Category   | User Message                                       | Internal Cause                    |
| ----- | ---------- | -------------------------------------------------- | --------------------------------- |
| W-001 | UIA        | "Could not interact with the target application."  | COM interface failure             |
| W-002 | UIA        | "Target window not found."                         | Window closed or title changed    |
| W-003 | UIA        | "Element not found in the application."            | UIA search returned empty         |
| W-004 | Capture    | "Could not capture screen."                        | DXGI failure                      |
| W-005 | Capture    | "Screen capture is not available in this session." | Remote desktop, no GPU            |
| W-006 | Clipboard  | "Clipboard is in use by another application."      | Clipboard lock conflict           |
| W-007 | Credential | "Could not access Windows Credential Manager."     | Credential Manager unavailable    |
| W-008 | Terminal   | "PowerShell execution failed."                     | Execution policy or command error |
| W-009 | Terminal   | "WSL is not available."                            | WSL not installed                 |
| W-010 | Registry   | "Could not write to Windows Registry."             | Permission denied                 |
| W-011 | Installer  | "WebView2 Runtime is required."                    | Missing WebView2                  |
| W-012 | Update     | "Update failed. Please download manually."         | Installer execution failure       |
| W-013 | Window     | "Could not bring window to front."                 | SetForegroundWindow restriction   |
| W-014 | File       | "Access denied: Check file permissions."           | NTFS permission denied            |
| W-015 | Power      | "System is going to sleep. Agents paused."         | Power state change                |

---

# Appendix D: Glossary

| Term             | Definition                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| AMSI             | Antimalware Scan Interface - Windows API for antivirus integration     |
| Authenticode     | Microsoft's code signing technology for Windows executables            |
| ConPTY           | Windows Console Pseudo Terminal - modern terminal API                  |
| COM              | Component Object Model - Windows inter-process communication framework |
| DPAPI            | Data Protection API - Windows data encryption tied to user credentials |
| DXGI             | DirectX Graphics Infrastructure - used for screen capture              |
| EV Certificate   | Extended Validation code signing certificate (highest trust level)     |
| GDI              | Graphics Device Interface - older Windows graphics API                 |
| GPO              | Group Policy Object - enterprise Windows configuration mechanism       |
| HWND             | Handle to a Window - Win32 window identifier                           |
| ICO              | Windows icon file format (multi-resolution)                            |
| Intune           | Microsoft Endpoint Manager for device management                       |
| MSI              | Microsoft Installer - enterprise deployment package format             |
| NSIS             | Nullsoft Scriptable Install System - installer framework               |
| NMH              | Native Messaging Host - Chrome extension to native app bridge          |
| NVDA             | NonVisual Desktop Access - open-source screen reader                   |
| SCCM             | System Center Configuration Manager - enterprise deployment tool       |
| SmartScreen      | Windows Defender SmartScreen - download reputation filter              |
| STA              | Single-Threaded Apartment - COM threading model                        |
| UAC              | User Account Control - Windows privilege elevation                     |
| UIA              | UI Automation - Windows accessibility and automation framework         |
| WASAPI           | Windows Audio Session API - low-level audio interface                  |
| WebView2         | Microsoft Edge-based web content renderer for desktop apps             |
| WiX              | Windows Installer XML Toolset - MSI builder                            |
| WM_SETTINGCHANGE | Windows message broadcast when system settings change                  |

---

# Appendix E: Revision History

| Version | Date       | Author       | Changes             |
| ------- | ---------- | ------------ | ------------------- |
| 1.0.0   | 2026-03-09 | Product Team | Initial Windows PRD |

---

# Appendix F: Detailed Interaction Flow Specifications

## F.1 First-Run Installation Flow (Windows)

### F.1.1 Download to First Launch

```
Step 1: User visits agiworkforce.com/download
    │
    ├── Browser shows download button: "Download for Windows (64-bit)"
    ├── Button text alternates: "Download .exe (32 MB)"
    │
    ▼
Step 2: Download completes
    │
    ├── Chrome: "AGI-Workforce-Setup-1.1.5-x64.exe" in downloads bar
    ├── Edge: "AGI-Workforce-Setup-1.1.5-x64.exe" in downloads flyout
    ├── Firefox: "AGI-Workforce-Setup-1.1.5-x64.exe" in downloads panel
    │
    ▼
Step 3: User double-clicks installer
    │
    ├── [If unsigned] SmartScreen warning: "Windows protected your PC"
    │   ├── User clicks "More info"
    │   └── User clicks "Run anyway"
    │
    ├── [If OV signed] SmartScreen warning: "Publisher: AGI Automation LLC"
    │   └── User clicks "Run anyway" (one click)
    │
    ├── [If EV signed] No SmartScreen warning
    │
    ▼
Step 4: Installer runs
    │
    ├── NSIS Installer UI:
    │   ├── Welcome page: "Welcome to AGI Workforce Setup"
    │   │   └── "This will install AGI Workforce on your computer."
    │   │   └── [Next >] [Cancel]
    │   │
    │   ├── Install location page:
    │   │   └── Default: "C:\Users\<name>\AppData\Local\AGI Workforce"
    │   │   └── [Browse...] to change
    │   │   └── "Space required: 120 MB"
    │   │   └── "Space available: XX GB"
    │   │   └── [< Back] [Install] [Cancel]
    │   │
    │   ├── Installation progress:
    │   │   └── Progress bar: "Installing..."
    │   │   └── File being extracted: "Extracting: AGI Workforce.exe"
    │   │   └── WebView2 check: "Checking WebView2 Runtime..."
    │   │   └── [If WebView2 missing] "Installing WebView2 Runtime..."
    │   │
    │   └── Completion page:
    │       └── "AGI Workforce has been installed on your computer."
    │       └── [x] "Run AGI Workforce" (checked by default)
    │       └── [x] "Create Desktop Shortcut" (checked by default)
    │       └── [ ] "Create Start Menu Shortcut" (unchecked by default)
    │       └── [Finish]
    │
    ▼
Step 5: Application launches
    │
    ├── Splash screen (optional, < 500ms):
    │   └── AGI Workforce logo
    │   └── "Loading..."
    │
    ├── WebView2 initialization (< 1.5s)
    │
    ├── React frontend loads (< 800ms)
    │
    └── Onboarding wizard (Step 1 of 4) appears
```

### F.1.2 Silent Installation Flow (Enterprise)

```
Step 1: IT admin prepares deployment
    │
    ├── MSI package placed on network share
    ├── Group Policy or SCCM configured
    │
    ▼
Step 2: Installation executes silently
    │
    ├── msiexec /i "AGI-Workforce_1.1.5_x64_en-US.msi" /qn
    ├── No user interaction required
    ├── No restart required
    │
    ▼
Step 3: Verification
    │
    ├── Detection: %LOCALAPPDATA%\AGI Workforce\AGI Workforce.exe exists
    ├── Registry: HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\AGI Workforce
    ├── Start Menu: "AGI Workforce" shortcut created
    │
    ▼
Step 4: First user launch
    │
    ├── Onboarding wizard appears (same as consumer flow)
    ├── Enterprise pre-configuration possible via config file:
    │   └── %LOCALAPPDATA%\AGI Workforce\config\enterprise.json
    │       {
    │         "defaultProvider": "anthropic",
    │         "skipOnboarding": false,
    │         "autoStart": true,
    │         "closeToTray": true,
    │         "defaultShell": "powershell"
    │       }
```

## F.2 Conversation Lifecycle Flow

### F.2.1 New Conversation

```
User presses Ctrl+N or clicks "New Chat"
    │
    ▼
Frontend: unifiedChatStore.createConversation()
    │
    ├── Generate UUID for conversation
    ├── Set default model from settingsStore.defaultModel
    ├── Set title to "" (auto-generated on first message)
    │
    ▼
Frontend -> Rust IPC: invoke('create_conversation', {
    title: "",
    modelId: "claude-3-5-sonnet-20241022"
})
    │
    ▼
Rust: create_conversation command handler
    │
    ├── Insert into SQLite: conversations table
    ├── Return: Conversation { id, title, model, created_at }
    │
    ▼
Frontend: Update Zustand stores
    │
    ├── unifiedChatStore.setActiveConversation(conversation)
    ├── Navigate to /chat/<conversationId>
    ├── Focus chat input
    ├── Show empty state: "Start a new conversation"
```

### F.2.2 Send Message Flow

```
User types message and presses Enter
    │
    ▼
Frontend: Validate input
    │
    ├── Check: message is not empty
    ├── Check: message length < 100,000 characters
    ├── Check: budget not exceeded
    ├── Check: model is configured (API key exists)
    │
    ▼
Frontend: Update UI immediately
    │
    ├── Add user message to message list
    ├── Show AI message placeholder with loading animation
    ├── Hide send button, show stop button
    ├── Disable input (while processing)
    │
    ▼
Frontend -> Rust IPC: invoke('chat_send_message', {
    conversationId: "uuid-...",
    messageContent: "User's message text",
    modelId: "claude-3-5-sonnet-20241022",
    attachments: [...],
    temperature: 0.7,
    maxTokens: 4096
})
    │
    ▼
Rust: chat_send_message command handler
    │
    ├── Step 1: Load conversation from SQLite
    ├── Step 2: Build message array (system + history + new message)
    ├── Step 3: Count tokens (tiktoken-rs)
    ├── Step 4: Check budget (cost_calculator)
    ├── Step 5: Route to LLM provider (llm_router)
    │   ├── Select provider based on routing strategy
    │   ├── Check circuit breaker status
    │   └── Prepare provider-specific request format (provider_adapter)
    │
    ├── Step 6: Send HTTP request (streaming_client)
    ├── Step 7: Parse SSE stream (sse_parser)
    │   ├── For each chunk:
    │   │   ├── Emit Tauri event: "chat:chunk" -> frontend
    │   │   ├── If tool_call: emit "tool:event" (Started)
    │   │   ├── Execute tool via ToolGuard
    │   │   ├── Emit "tool:event" (Completed)
    │   │   └── Continue with tool result
    │   │
    │   └── On stream complete:
    │       ├── Calculate cost
    │       ├── Save message to SQLite
    │       ├── Update conversation metadata
    │       └── Emit "chat:complete" event
    │
    ▼
Frontend: Handle streaming events
    │
    ├── "chat:chunk" -> Append text to AI message
    ├── "tool:event" (Started) -> Add to ToolTimeline
    ├── "tool:event" (Completed) -> Update ToolTimeline with duration
    ├── "chat:complete" ->
    │   ├── Show send button, hide stop button
    │   ├── Re-enable input
    │   ├── Update cost display
    │   ├── Auto-generate title (if first message)
    │   └── Focus input
```

### F.2.3 Stop Generation Flow

```
User presses Escape or clicks Stop button
    │
    ▼
Frontend: Immediate UI update
    │
    ├── Show send button, hide stop button
    ├── Re-enable input
    ├── Show "Generation stopped" indicator
    │
    ▼
Frontend -> Rust IPC: invoke('chat_stop_generation', {
    conversationId: "uuid-..."
})
    │
    ▼
Rust: chat_stop_generation handler
    │
    ├── Cancel HTTP request (drop streaming_client connection)
    ├── Save partial response to SQLite
    ├── Emit "chat:stopped" event
    │
    ▼
Frontend: Finalize
    │
    ├── Preserve partial AI response in message list
    ├── Show "Generation stopped" label on message
    ├── Focus input
```

## F.3 Agent Lifecycle Flow

### F.3.1 Start Agent

```
User sends message with agent-triggering intent
(e.g., "Research market trends and write a report")
    │
    ▼
Rust: Intent classifier detects multi-step task
    │
    ├── Classify as: agent_required = true
    ├── Determine: agent_type = "research_and_write"
    │
    ▼
Rust: Agent runtime starts
    │
    ├── Create AgentState {
    │     id: uuid,
    │     name: "Research Agent",
    │     status: "running",
    │     task: "Research market trends and write a report",
    │     actions_taken: 0,
    │     started_at: now(),
    │     progress: None
    │   }
    │
    ├── Emit "agentic:loop-started" event
    │
    ├── Agent loop begins:
    │   ├── Step 1: Plan (LLM call with planning prompt)
    │   │   └── Result: ActionPlan { actions: [...], reasoning: "..." }
    │   │
    │   ├── Step 2: Execute actions
    │   │   ├── For each action:
    │   │   │   ├── ToolGuard validation
    │   │   │   ├── If auto-approve: execute immediately
    │   │   │   ├── If ask: emit "agentic:approval-needed", pause
    │   │   │   │   └── Wait for user response
    │   │   │   ├── Execute tool (file read, web search, etc.)
    │   │   │   ├── Emit "tool:event" (Started/Completed)
    │   │   │   └── Emit "agentic:loop-status" (progress update)
    │   │   │
    │   │   └── Increment actions_taken
    │   │
    │   ├── Step 3: Verify progress (LLM call)
    │   │   └── Result: ProgressVerification { task_complete, making_progress }
    │   │
    │   ├── If task_complete: break loop
    │   ├── If !making_progress: break loop (error)
    │   └── Repeat from Step 1
    │
    ├── Agent loop ends:
    │   ├── Update AgentState { status: "completed" }
    │   ├── Emit "agentic:loop-ended"
    │   ├── Send Windows notification: "Agent completed"
    │   └── Flash taskbar button (if window not focused)
```

### F.3.2 Agent Approval Flow

```
Agent reaches a tool that requires user approval
    │
    ▼
Rust: ToolGuard determines approval needed
    │
    ├── Tool: "Write" to "report.docx"
    ├── Permission mode: "ask"
    │
    ▼
Rust: Emit "agentic:approval-needed" event
    │
    ├── Payload: {
    │     agentId: "uuid",
    │     toolName: "Write",
    │     toolArgs: { path: "report.docx", content: "..." },
    │     displayName: "Write(report.docx)",
    │     reasoning: "Writing the research report to a Word document"
    │   }
    │
    ▼
Frontend: Show approval dialog
    │
    ├── ToolConfirmationDialog appears:
    │   ├── Title: "Agent wants to Write a file"
    │   ├── Details: "Write(report.docx)"
    │   ├── Preview: First 500 chars of content
    │   ├── Reasoning: "Writing the research report to a Word document"
    │   ├── Buttons: [Approve] [Deny] [Approve All Similar]
    │   └── Checkbox: "Don't ask again for this tool"
    │
    ├── Windows Notification (if app not focused):
    │   └── "Agent needs approval: Write(report.docx)"
    │   └── Action buttons: [Approve] [Deny]
    │
    ├── Taskbar flash (if app not focused)
    │
    ▼
User clicks [Approve]
    │
    ▼
Frontend -> Rust IPC: invoke('approve_tool_execution', {
    agentId: "uuid",
    approved: true,
    rememberChoice: false
})
    │
    ▼
Rust: Agent resumes
    │
    ├── Execute the tool
    ├── Continue agent loop
```

## F.4 Computer Use Session Flow (Windows-Specific)

### F.4.1 Vision-Based Interaction

```
User: "Open Notepad and type 'Hello World'"
    │
    ▼
Rust: Computer use session starts
    │
    ├── Create ComputerUseSession {
    │     id: uuid,
    │     task_description: "Open Notepad and type 'Hello World'",
    │     status: Running
    │   }
    │
    ├── Observe-Plan-Act Loop:
    │
    │   Iteration 1:
    │   ├── OBSERVE: Capture screen (DXGI)
    │   │   ├── capture_primary_screen() -> CapturedImage
    │   │   ├── Encode as base64 PNG
    │   │   └── Send to vision model
    │   │
    │   ├── PLAN: LLM analyzes screenshot
    │   │   ├── Model: "I see the Windows desktop. I need to open Notepad."
    │   │   ├── Plan: [
    │   │   │     { type: "key_press", key: "Win" },
    │   │   │     { type: "wait", ms: 500 },
    │   │   │     { type: "type", text: "notepad" },
    │   │   │     { type: "wait", ms: 500 },
    │   │   │     { type: "key_press", key: "Enter" }
    │   │   │   ]
    │   │   └── Reasoning: "Opening Windows Start menu and searching for Notepad"
    │   │
    │   ├── ACT: Execute actions
    │   │   ├── Safety check (safety_patterns.rs)
    │   │   ├── KeyPress("Win") via enigo
    │   │   ├── Wait(500ms)
    │   │   ├── Type("notepad") via enigo
    │   │   ├── Wait(500ms)
    │   │   ├── KeyPress("Enter") via enigo
    │   │   └── Wait(1000ms) for app to open
    │   │
    │   └── VERIFY: Capture screen again
    │       ├── LLM confirms: "Notepad is now open"
    │       └── making_progress: true
    │
    │   Iteration 2:
    │   ├── OBSERVE: Screen shows Notepad window
    │   │
    │   ├── PLAN: Type the text
    │   │   ├── Plan: [
    │   │   │     { type: "click", x: 400, y: 300 },  // Click in Notepad text area
    │   │   │     { type: "type", text: "Hello World" }
    │   │   │   ]
    │   │   └── Reasoning: "Clicking in the Notepad text area and typing the message"
    │   │
    │   ├── ACT: Execute
    │   │   ├── Click(400, 300) via enigo
    │   │   └── Type("Hello World") via enigo
    │   │
    │   └── VERIFY: Screen shows "Hello World" in Notepad
    │       ├── LLM confirms: "Task complete. 'Hello World' is typed in Notepad."
    │       └── task_complete: true
    │
    ├── Session ends
    │   ├── ComputerUseSession { status: Completed, actions_taken: 7 }
    │   └── Report to user: "Done! I opened Notepad and typed 'Hello World'."
```

### F.4.2 UIA-Based Interaction (Windows-Specific)

```
User: "Find the 'Save' button in the open application and click it"
    │
    ▼
Rust: UIA interaction flow
    │
    ├── Step 1: Identify target window
    │   ├── UIAutomationService::list_windows()
    │   │   └── Returns: [{
    │   │         id: "1-2-3-4",
    │   │         name: "Untitled - Notepad",
    │   │         class_name: "Notepad",
    │   │         control_type: "Window",
    │   │         bounding_rect: { left: 100, top: 100, width: 800, height: 600 }
    │   │       }]
    │   │
    │   └── Determine: Notepad is the target (by foreground state or user context)
    │
    ├── Step 2: Find the Save button via UIA
    │   ├── UIAutomationService::find_elements(None, &ElementQuery {
    │   │     window: Some("Untitled - Notepad"),
    │   │     name: Some("Save"),
    │   │     control_type: Some("button"),
    │   │     ..Default::default()
    │   │   })
    │   │
    │   ├── If not found, try smart finding:
    │   │   └── find_element_smart(None, &query)
    │   │       ├── Attempt 1: Exact name "Save"
    │   │       ├── Attempt 2: Partial name "Sav"
    │   │       ├── Attempt 3: Case-insensitive "save"
    │   │       └── Attempt 4: Type-only (all buttons)
    │   │
    │   └── Result: UIElementInfo {
    │         id: "5-6-7-8",
    │         name: "Save",
    │         class_name: "Button",
    │         control_type: "Button",
    │         bounding_rect: Some({ left: 50, top: 25, width: 60, height: 30 })
    │       }
    │
    ├── Step 3: Check element capabilities
    │   ├── UIAutomationService::check_patterns("5-6-7-8")
    │   │   └── PatternCapabilities {
    │   │         invoke: true,   // Can be clicked
    │   │         value: false,
    │   │         toggle: false,
    │   │         text: false,
    │   │         grid: false,
    │   │         table: false,
    │   │         scroll: false,
    │   │         expand_collapse: false,
    │   │         selection: false
    │   │       }
    │   │
    │   └── Determine: Use Invoke pattern to click
    │
    ├── Step 4: Execute action
    │   ├── ToolGuard validation: Approve "invoke" on "Save" button
    │   ├── UIAutomationService::invoke("5-6-7-8")
    │   │   └── Internally: pattern.Invoke() via COM
    │   │
    │   └── If invoke fails, fallback to coordinate click:
    │       ├── Get bounding rect center: (80, 40)
    │       └── enigo click at (80, 40)
    │
    ├── Step 5: Verify result
    │   ├── Wait 500ms
    │   ├── Check if Save dialog appeared (if new file)
    │   └── Report: "Clicked the Save button in Notepad."
```

## F.5 MCP Tool Connection Flow

### F.5.1 stdio Transport (Windows)

```
User adds MCP server in Settings > MCP Tools
    │
    ├── Server type: "stdio"
    ├── Command: "npx"
    ├── Args: ["@modelcontextprotocol/server-gmail"]
    │
    ▼
Rust: MCP server spawn
    │
    ├── Step 1: Resolve command
    │   ├── On Windows: Check for npx.cmd (Windows script)
    │   ├── Use which::which("npx") to find full path
    │   └── Full path: "C:\Program Files\nodejs\npx.cmd"
    │
    ├── Step 2: Spawn child process
    │   ├── std::process::Command::new("C:\\Program Files\\nodejs\\npx.cmd")
    │   │   .args(["@modelcontextprotocol/server-gmail"])
    │   │   .stdin(Stdio::piped())
    │   │   .stdout(Stdio::piped())
    │   │   .stderr(Stdio::piped())
    │   │   .creation_flags(CREATE_NO_WINDOW)  // Windows: hide console window
    │   │   .spawn()
    │   │
    │   └── Note: On Windows, .cmd scripts require shell execution
    │       └── May need: cmd.exe /c npx.cmd ...
    │
    ├── Step 3: MCP handshake (JSON-RPC over stdin/stdout)
    │   ├── Send: { "jsonrpc": "2.0", "method": "initialize", ... }
    │   ├── Receive: { "result": { "capabilities": { "tools": true } } }
    │   └── Send: { "jsonrpc": "2.0", "method": "notifications/initialized" }
    │
    ├── Step 4: List tools
    │   ├── Send: { "jsonrpc": "2.0", "method": "tools/list" }
    │   ├── Receive: { "result": { "tools": [
    │   │     { "name": "gmail_search", ... },
    │   │     { "name": "gmail_read", ... },
    │   │     { "name": "gmail_send", ... }
    │   │   ] } }
    │   │
    │   └── Register tools in MCP tool registry
    │
    ├── Step 5: Update UI
    │   ├── Emit event: "mcp:server-connected"
    │   ├── Show in Settings: "Gmail - Connected (3 tools)"
    │   └── Tools available in agent tool selection
```

## F.6 Auto-Update Flow (Windows-Specific)

```
Application starts (or 6-hour check interval)
    │
    ▼
Rust: Check for updates
    │
    ├── HTTP GET: https://github.com/.../releases/latest/download/latest.json
    │
    ├── Parse response:
    │   {
    │     "version": "1.2.0",
    │     "notes": "Bug fixes and performance improvements",
    │     "platforms": {
    │       "windows-x86_64": {
    │         "url": "https://github.com/.../AGI-Workforce-Setup_1.2.0_x64.exe.zip",
    │         "signature": "..."
    │       }
    │     }
    │   }
    │
    ├── Compare: 1.2.0 > 1.1.5 -> Update available
    │
    ▼
Rust: Emit "update:available" event
    │
    ▼
Frontend: Show UpdateDialog
    │
    ├── Display version info and release notes
    ├── Buttons: [Download & Install] [Remind Me Later] [Skip This Version]
    │
    ▼
User clicks [Download & Install]
    │
    ▼
Rust: Download update
    │
    ├── Download to %TEMP%\AGI-Workforce-Update\AGI-Workforce-Setup_1.2.0_x64.exe
    ├── Progress events emitted to frontend
    ├── Verify Ed25519 signature against embedded public key
    │
    ▼
Frontend: Show download progress
    │
    ├── "Downloading update... [45%]"
    ├── Progress bar in dialog
    ├── Taskbar progress indicator (green bar)
    │
    ▼
Download complete
    │
    ├── Frontend: "Update downloaded. Restart to apply."
    ├── Button: [Restart Now] [Later]
    │
    ▼
User clicks [Restart Now]
    │
    ▼
Rust: Execute update
    │
    ├── Step 1: Save application state
    │   ├── Save open conversations
    │   ├── Save window position/size
    │   └── Save pending drafts
    │
    ├── Step 2: Launch installer
    │   ├── std::process::Command::new(update_exe_path)
    │   │   .args(["/S"])  // Silent install
    │   │   .spawn()
    │   │
    │   └── Note: If installed in %ProgramFiles%, UAC prompt appears
    │
    ├── Step 3: Close application
    │   ├── Close all windows
    │   ├── Stop all agents
    │   └── Exit process
    │
    ├── Step 4: Installer runs (in background)
    │   ├── Replaces files in installation directory
    │   ├── Preserves: data\, config\, logs\, cache\, credentials\
    │   └── Updates: executable, DLLs, resources
    │
    ├── Step 5: Installer launches new version
    │   └── "AGI Workforce.exe" --updated-from=1.1.5
    │
    ▼
New version starts
    │
    ├── Detects --updated-from flag
    ├── Shows toast: "Updated to version 1.2.0!"
    ├── Restores saved state (window position, open conversations)
    └── Resumes normal operation
```

---

# Appendix G: Windows-Specific Data Models

## G.1 Windows Platform Types

### G.1.1 AppWindow (Window Manager)

```rust
/// Information about an application window on Windows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppWindow {
    /// Window handle (HWND cast to isize for serialization).
    pub handle: isize,

    /// Window title text (from GetWindowTextW).
    pub title: String,

    /// Process name (e.g., "notepad.exe") from QueryFullProcessImageNameW.
    pub process_name: String,

    /// Window position and dimensions in physical pixels.
    pub bounds: WindowBounds,

    /// Whether the window is visible (IsWindowVisible).
    pub is_visible: bool,

    /// Whether the window is the foreground window (GetForegroundWindow).
    pub is_focused: bool,

    /// Whether the window is minimized (IsIconic).
    pub is_minimized: bool,
}

/// Window bounds in physical screen pixels.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WindowBounds {
    /// Returns the center point of the window.
    pub fn center(&self) -> (i32, i32) {
        (
            self.x + (self.width as i32 / 2),
            self.y + (self.height as i32 / 2),
        )
    }
}
```

### G.1.2 UIElementInfo (UI Automation)

```rust
/// Information about a UI element discovered via Windows UI Automation.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UIElementInfo {
    /// Runtime ID (unique within session, format: "1-2-3-4").
    pub id: String,

    /// Element name (from CurrentName property).
    pub name: String,

    /// Windows class name (from CurrentClassName).
    pub class_name: String,

    /// UIA control type (e.g., "Button", "Edit", "Window").
    pub control_type: String,

    /// Bounding rectangle in screen coordinates.
    pub bounding_rect: Option<BoundingRectangle>,
}

/// Detailed element information including properties, parent, and children.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedElementInfo {
    pub id: String,
    pub name: String,
    pub class_name: String,
    pub control_type: String,
    pub bounding_rect: Option<BoundingRectangle>,
    pub properties: HashMap<String, serde_json::Value>,
    pub automation_id: Option<String>,
    pub parent: Option<BasicElementInfo>,
    pub children: Vec<BasicElementInfo>,
    pub is_enabled: bool,
    pub is_offscreen: bool,
    pub has_keyboard_focus: bool,
}

/// Query parameters for finding UI elements.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ElementQuery {
    /// Window title to search within.
    pub window: Option<String>,
    /// Window class name filter.
    pub window_class: Option<String>,
    /// Element name (exact match).
    pub name: Option<String>,
    /// Element class name filter.
    pub class_name: Option<String>,
    /// UIA automation ID.
    pub automation_id: Option<String>,
    /// Control type filter (e.g., "button", "edit").
    pub control_type: Option<String>,
    /// Maximum results to return (default: 50).
    pub max_results: Option<usize>,
}
```

### G.1.3 PatternCapabilities (UI Automation)

```rust
/// Describes which UIA interaction patterns an element supports.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PatternCapabilities {
    /// Can be clicked/activated (buttons, menu items).
    pub invoke: bool,
    /// Has a readable/writable text value (text fields, combo boxes).
    pub value: bool,
    /// Can be toggled on/off (checkboxes, toggle buttons).
    pub toggle: bool,
    /// Contains readable text content (labels, documents).
    pub text: bool,
    /// Supports grid-based cell access (spreadsheets, data grids).
    pub grid: bool,
    /// Provides table structure with headers.
    pub table: bool,
    /// Can be scrolled (scroll containers, list views).
    pub scroll: bool,
    /// Can be expanded/collapsed (tree nodes, accordions).
    pub expand_collapse: bool,
    /// Can be selected (list items, radio buttons).
    pub selection: bool,
}
```

### G.1.4 ComputerAction (Automation Types)

```rust
/// Represents a single computer use action.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ComputerAction {
    /// Click at screen coordinates.
    Click { x: i32, y: i32 },
    /// Double-click at screen coordinates.
    DoubleClick { x: i32, y: i32 },
    /// Right-click at screen coordinates.
    RightClick { x: i32, y: i32 },
    /// Type text at current cursor position.
    Type { text: String },
    /// Scroll in a direction.
    Scroll { direction: ScrollDirection, amount: i32 },
    /// Press a key or key combination.
    KeyPress { key: String },
    /// Wait for a duration.
    Wait { ms: u64 },
    /// Drag from one point to another.
    DragTo { from_x: i32, from_y: i32, to_x: i32, to_y: i32 },
}

/// Scroll direction.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    Up,
    Down,
    Left,
    Right,
}
```

### G.1.5 ScreenInfo (Display Information)

```rust
/// Information about a connected display.
#[derive(Debug, Clone)]
pub struct ScreenInfo {
    /// Display index (0-based).
    pub id: u32,
    /// X position in virtual screen coordinates.
    pub x: i32,
    /// Y position in virtual screen coordinates.
    pub y: i32,
    /// Width in physical pixels.
    pub width: u32,
    /// Height in physical pixels.
    pub height: u32,
    /// DPI scale factor (1.0 = 100%, 1.5 = 150%, 2.0 = 200%).
    pub scale_factor: f32,
    /// Whether this is the primary display.
    pub is_primary: bool,
}
```

### G.1.6 WindowManagerConfig

```rust
/// Configuration for the window management subsystem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowManagerConfig {
    /// Timeout for window activation attempts.
    pub activation_timeout: Duration, // Default: 5 seconds
    /// Delay after activation before interaction (for window to settle).
    pub post_activation_delay: Duration, // Default: 200ms
    /// Whether to automatically bring windows to front.
    pub auto_bring_to_front: bool, // Default: true
    /// Number of retries for window activation.
    pub activation_retries: u32, // Default: 3
}
```

### G.1.7 WindowActivation

```rust
/// Result of a window activation attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowActivation {
    /// Whether activation succeeded.
    pub success: bool,
    /// The activated window (if successful).
    pub window: Option<AppWindow>,
    /// Error message if failed.
    pub error: Option<String>,
    /// Number of attempts made.
    pub attempts: u32,
}
```

### G.1.8 WaitConfig (UI Automation)

```rust
/// Configuration for async element wait operations.
#[derive(Debug, Clone)]
pub struct WaitConfig {
    /// Maximum time to wait for the element.
    pub timeout: Duration, // Default: 10 seconds
    /// Interval between checks.
    pub interval: Duration, // Default: 100ms
    /// Maximum number of retry attempts.
    pub retry_count: usize, // Default: 100
}
```

### G.1.9 ElementSelector

```rust
/// A selector for finding UI elements by different strategies.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementSelector {
    /// The type of selector.
    pub selector_type: SelectorType,
    /// The selector value.
    pub value: String,
}

/// Supported selector strategies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SelectorType {
    /// Match by UIA Automation ID (most reliable).
    AutomationId,
    /// Match by element name (display text).
    Name,
    /// Match by Windows class name.
    ClassName,
    /// Match by XPath expression (not currently supported).
    XPath,
    /// Match by screen coordinates ("x,y" format).
    Coordinates,
}
```

---

# Appendix H: Configuration File Formats

## H.1 settings.json

```json
{
  "version": 10,
  "general": {
    "language": "en",
    "startOnLogin": false,
    "closeToTray": false,
    "checkForUpdates": true,
    "defaultDownloadPath": "C:\\Users\\user\\Downloads",
    "defaultShell": "powershell"
  },
  "appearance": {
    "theme": "system",
    "accentColor": "#2563eb",
    "fontSize": 14,
    "sidebarCollapsed": false,
    "codeFont": "Cascadia Mono",
    "messageDensity": "normal"
  },
  "chat": {
    "sendWithEnter": true,
    "autoScroll": true,
    "showThinking": true,
    "showToolTimeline": true,
    "showCost": true,
    "sessionBudget": 50.0,
    "autoTitle": true,
    "markdownRendering": true,
    "codeExecution": false
  },
  "models": {
    "defaultModel": "claude-3-5-sonnet-20241022",
    "routingStrategy": "auto",
    "temperature": 0.7,
    "maxTokens": 4096
  },
  "notifications": {
    "enabled": true,
    "agentCompletion": true,
    "agentError": true,
    "updateAvailable": true,
    "sound": true,
    "focusAssistRespect": true
  },
  "security": {
    "masterPasswordEnabled": false,
    "autoLockTimeout": "never",
    "toolApprovalMode": "ask",
    "auditLogging": true,
    "toolGuardStrictness": "standard"
  },
  "advanced": {
    "logLevel": "info",
    "proxyHttp": "",
    "proxyHttps": "",
    "gpuAcceleration": true,
    "hardwareAcceleration": true,
    "developerTools": false,
    "customCss": ""
  }
}
```

## H.2 .mcp.json

```json
{
  "servers": {
    "gmail": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-gmail"],
      "transport": "stdio",
      "env": {
        "GMAIL_CLIENT_ID": "...",
        "GMAIL_CLIENT_SECRET": "..."
      }
    },
    "calendar": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-google-calendar"],
      "transport": "stdio"
    },
    "remote-tool": {
      "url": "https://mcp.example.com/api",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer ..."
      }
    }
  }
}
```

## H.3 enterprise.json (Enterprise Pre-Configuration)

```json
{
  "version": 1,
  "defaultProvider": "anthropic",
  "skipOnboarding": false,
  "autoStart": true,
  "closeToTray": true,
  "defaultShell": "powershell",
  "allowedProviders": ["anthropic", "openai", "ollama"],
  "blockedProviders": [],
  "defaultRoutingStrategy": "cost_optimized",
  "maxSessionBudget": 100.0,
  "toolApprovalMode": "ask",
  "auditLogging": true,
  "proxyHttp": "http://proxy.corp.com:8080",
  "proxyHttps": "http://proxy.corp.com:8080",
  "disableAutoUpdate": false,
  "disableLocalModels": false,
  "disableCustomModels": false,
  "logLevel": "info"
}
```

---

# Appendix I: Tauri Command Reference (Windows-Specific)

## I.1 Windows-Only Tauri Commands

These commands are only available on the Windows build:

| Command                     | Parameters                                                    | Return                                              | Description                         |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| `uia_list_windows`          | (none)                                                        | `Vec<UIElementInfo>`                                | List all visible windows via UIA    |
| `uia_find_elements`         | `query: ElementQuery, parentId: Option<String>`               | `Vec<UIElementInfo>`                                | Find elements matching query        |
| `uia_find_element_smart`    | `query: ElementQuery, parentId: Option<String>`               | `Vec<UIElementInfo>`                                | Smart find with fallback strategies |
| `uia_invoke`                | `elementId: String`                                           | `Result<()>`                                        | Click/activate a UIA element        |
| `uia_set_value`             | `elementId: String, value: String`                            | `Result<()>`                                        | Set text value of element           |
| `uia_get_value`             | `elementId: String`                                           | `Result<String>`                                    | Get text value of element           |
| `uia_toggle`                | `elementId: String`                                           | `Result<()>`                                        | Toggle element state                |
| `uia_set_focus`             | `elementId: String`                                           | `Result<()>`                                        | Set keyboard focus to element       |
| `uia_focus_window`          | `elementId: String`                                           | `Result<()>`                                        | Bring window to foreground          |
| `uia_check_patterns`        | `elementId: String`                                           | `PatternCapabilities`                               | Detect supported patterns           |
| `uia_bounding_rect`         | `elementId: String`                                           | `Option<BoundingRectangle>`                         | Get element bounds                  |
| `uia_scroll_to_element`     | `elementId: String`                                           | `Result<()>`                                        | Scroll element into view            |
| `uia_expand_tree_node`      | `elementId: String, expand: bool`                             | `Result<()>`                                        | Expand/collapse tree node           |
| `uia_get_table_cell`        | `elementId: String, row: i32, column: i32`                    | `Result<String>`                                    | Get grid cell value                 |
| `uia_get_grid_row_count`    | `elementId: String`                                           | `Result<i32>`                                       | Get grid row count                  |
| `uia_get_grid_column_count` | `elementId: String`                                           | `Result<i32>`                                       | Get grid column count               |
| `uia_wait_for_element`      | `query: ElementQuery, parentId: Option<String>, timeout: u64` | `Result<UIElementInfo>`                             | Wait for element to appear          |
| `uia_wait_for_visible`      | `elementId: String, timeout: u64`                             | `Result<()>`                                        | Wait for element visibility         |
| `uia_wait_for_enabled`      | `elementId: String, timeout: u64`                             | `Result<()>`                                        | Wait for element to be enabled      |
| `uia_inspect_at_point`      | `x: i32, y: i32`                                              | `DetailedElementInfo`                               | Inspect element at coordinates      |
| `uia_inspect_element`       | `elementId: String`                                           | `DetailedElementInfo`                               | Get detailed element info           |
| `uia_get_focused_element`   | (none)                                                        | `DetailedElementInfo`                               | Get currently focused element       |
| `uia_find_by_selector`      | `selector: ElementSelector`                                   | `Option<String>`                                    | Find element by selector            |
| `uia_generate_selectors`    | `elementId: String`                                           | `Vec<ElementSelector>`                              | Generate selectors for element      |
| `uia_get_element_tree`      | `elementId: String`                                           | `(Option<BasicElementInfo>, Vec<BasicElementInfo>)` | Get parent + children               |

## I.2 Cross-Platform Commands with Windows-Specific Behavior

| Command                    | Windows Behavior                     | macOS Behavior                    |
| -------------------------- | ------------------------------------ | --------------------------------- |
| `capture_screen`           | DXGI desktop duplication             | CoreGraphics CGDisplayCreateImage |
| `capture_region`           | DXGI + coordinate mapping            | CoreGraphics + coordinate mapping |
| `list_displays`            | DXGI monitor enumeration             | CoreGraphics display enumeration  |
| `list_windows`             | Win32 EnumWindows                    | AppleScript/NSWorkspace           |
| `activate_window`          | Win32 SetForegroundWindow            | AppleScript "activate"            |
| `launch_app`               | Win32 ShellExecuteW                  | NSWorkspace.open / `open -a`      |
| `set_api_key`              | Windows Credential Manager           | macOS Keychain                    |
| `get_api_key`              | Windows Credential Manager           | macOS Keychain                    |
| `execute_command`          | ConPTY (PowerShell/CMD)              | Unix PTY (bash/zsh)               |
| `get_clipboard_text`       | Win32 OpenClipboard/GetClipboardData | NSPasteboard                      |
| `set_clipboard_text`       | Win32 OpenClipboard/SetClipboardData | NSPasteboard                      |
| `send_notification`        | Windows Toast Notification           | macOS Notification Center         |
| `register_global_shortcut` | Win32 RegisterHotKey                 | CGEvent tap                       |

---

# Appendix J: Windows Desktop Integration Checklist

## J.1 Pre-Release Checklist

| #   | Category      | Item                                          | Status   |
| --- | ------------- | --------------------------------------------- | -------- |
| 1   | Installer     | MSI installs correctly (per-user)             | Required |
| 2   | Installer     | MSI installs correctly (all-users)            | Required |
| 3   | Installer     | NSIS installs correctly                       | Required |
| 4   | Installer     | Silent install works (/S flag)                | Required |
| 5   | Installer     | Uninstall removes all files                   | Required |
| 6   | Installer     | Uninstall removes registry entries            | Required |
| 7   | Installer     | Upgrade preserves user data                   | Required |
| 8   | Installer     | WebView2 bootstrapper works (missing runtime) | Required |
| 9   | Signing       | Authenticode signature valid                  | Required |
| 10  | Signing       | Timestamp present (RFC 3161)                  | Required |
| 11  | Signing       | SmartScreen shows publisher name              | Required |
| 12  | Security      | Windows Defender doesn't flag                 | Required |
| 13  | Security      | No UAC for standard operation                 | Required |
| 14  | Security      | Credential Manager works                      | Required |
| 15  | UI            | Title bar buttons (min/max/close) work        | Required |
| 16  | UI            | Window snap (left/right/maximize) works       | Required |
| 17  | UI            | System tray icon visible                      | Required |
| 18  | UI            | System tray context menu works                | Required |
| 19  | UI            | Alt+Tab shows correct icon and title          | Required |
| 20  | UI            | Dark mode detection works                     | Required |
| 21  | UI            | High-DPI rendering (150%) correct             | Required |
| 22  | UI            | High-DPI rendering (200%) correct             | Required |
| 23  | UI            | Windows 10 compatibility                      | Required |
| 24  | UI            | Windows 11 compatibility                      | Required |
| 25  | Keyboard      | All Ctrl+ shortcuts work                      | Required |
| 26  | Keyboard      | Global hotkey (Win+Shift+A) works             | Required |
| 27  | Keyboard      | Tab navigation works                          | Required |
| 28  | Keyboard      | F12 opens DevTools (when enabled)             | Required |
| 29  | Automation    | Screen capture (DXGI) works                   | Required |
| 30  | Automation    | UIA element discovery works                   | Required |
| 31  | Automation    | UIA element interaction works                 | Required |
| 32  | Automation    | Window enumeration works                      | Required |
| 33  | Automation    | Window activation works                       | Required |
| 34  | Automation    | Input simulation (keyboard) works             | Required |
| 35  | Automation    | Input simulation (mouse) works                | Required |
| 36  | Automation    | Clipboard read/write works                    | Required |
| 37  | Terminal      | PowerShell works                              | Required |
| 38  | Terminal      | CMD works                                     | Required |
| 39  | Terminal      | WSL works (if available)                      | Optional |
| 40  | Notifications | Windows toast notifications work              | Required |
| 41  | Notifications | Focus Assist respected                        | Required |
| 42  | Auto-start    | Registry entry created/removed correctly      | Required |
| 43  | Deep links    | agiworkforce:// URI scheme works              | Required |
| 44  | Update        | Auto-update check works                       | Required |
| 45  | Update        | Download and install works                    | Required |
| 46  | Update        | Rollback on failure                           | Required |
| 47  | Performance   | Cold start < 3s (SSD)                         | Required |
| 48  | Performance   | Memory < 200 MB (idle)                        | Required |
| 49  | Performance   | No memory leaks (1hr test)                    | Required |
| 50  | Accessibility | NVDA reads chat messages                      | Required |
| 51  | Accessibility | Windows Narrator navigates app                | Required |
| 52  | Accessibility | High Contrast mode renders correctly          | Required |
| 53  | Accessibility | Keyboard-only navigation complete             | Required |

---

# Appendix K: Known Limitations and Workarounds

## K.1 Windows-Specific Limitations

| Limitation                           | Impact                                  | Workaround                      | Fix Timeline           |
| ------------------------------------ | --------------------------------------- | ------------------------------- | ---------------------- |
| ARM64 via emulation only             | ~20% performance penalty on ARM devices | Native ARM64 build              | v2.0.0                 |
| SetForegroundWindow restriction      | Cannot always steal focus               | Alt-key hack, retry logic       | Inherent OS limitation |
| SmartScreen warning (non-EV cert)    | First-run friction                      | EV certificate                  | v1.2.0                 |
| DXGI fails on Remote Desktop         | No screen capture in RDP                | GDI fallback                    | Implemented            |
| UIA caching invalidation             | Stale element references                | 30s TTL cache, retry on failure | Implemented            |
| ConPTY Unicode rendering             | Some Unicode glyphs misaligned          | Terminal font configuration     | Ongoing                |
| WebView2 print dialog                | PDF export uses browser print           | Custom PDF export (planned)     | v1.3.0                 |
| Multi-monitor DPI mixing             | Occasional layout issues on move        | Per-monitor DPI v2 manifest     | Implemented            |
| Windows Credential Manager 2KB limit | Large credentials may fail              | Split into multiple entries     | Planned                |
| PowerShell Core not default          | PS7 must be explicitly selected         | Auto-detect pwsh.exe            | Implemented            |

## K.2 WebView2 vs WebKit Differences

| Difference                                | Impact                              | Mitigation                       |
| ----------------------------------------- | ----------------------------------- | -------------------------------- |
| Font rendering (ClearType vs subpixel AA) | Subtle text appearance differences  | CSS font-smoothing adjustments   |
| Scrollbar width                           | Windows scrollbars wider by default | CSS `::-webkit-scrollbar` styles |
| Native select element                     | Different dropdown appearance       | Use Radix Select (custom)        |
| File input styling                        | Different file picker button        | Custom file input component      |
| Print dialog                              | Different print flow                | Tauri print API abstraction      |
| DevTools                                  | Chrome DevTools vs WebKit Inspector | Document both in help            |
| JavaScript engine (V8 vs JSC)             | Performance characteristics differ  | No code changes needed           |
| CSS backdrop-filter                       | Both support, slight rendering diff | Acceptable visual difference     |

---

# Appendix L: Deployment Architectures

## L.1 Individual User Deployment

```
User Downloads Installer
    │
    ▼
NSIS Installer (per-user)
    │
    ├── Installs to: %LOCALAPPDATA%\AGI Workforce\
    ├── No admin required
    ├── Registry: HKCU only
    ├── Shortcuts: Desktop + Start Menu
    │
    ▼
User Launches App
    │
    ├── Onboarding wizard
    ├── API key entry (stored in Windows Credential Manager)
    ├── Ready to use
```

## L.2 Enterprise Deployment (Small Team)

```
IT Admin Downloads MSI
    │
    ▼
MSI Distributed via Network Share
    │
    ├── \\server\software\AGI-Workforce_1.1.5_x64_en-US.msi
    │
    ▼
Users Install via Self-Service
    │
    ├── msiexec /i "\\server\software\AGI-Workforce_1.1.5_x64_en-US.msi"
    ├── Installs per-user (no admin)
    ├── Enterprise config applied from enterprise.json (if present)
```

## L.3 Enterprise Deployment (Large Organization)

```
IT Admin Prepares Package
    │
    ├── MSI + enterprise.json + Transform (.mst)
    │
    ▼
SCCM/Intune Deployment
    │
    ├── Application package created in SCCM/Intune
    ├── Detection rule: File exists %LOCALAPPDATA%\AGI Workforce\AGI Workforce.exe
    ├── Install command: msiexec /i "AGI-Workforce.msi" /qn
    ├── Assignment: Required or Available
    │
    ▼
Deployment to Endpoints
    │
    ├── SCCM pushes to target collection
    ├── or Intune deploys to enrolled devices
    │
    ▼
Post-Deployment
    │
    ├── Enterprise config applied automatically
    ├── API keys provisioned via separate process
    ├── Monitoring via SCCM compliance
```

## L.4 Deployment with Proxy Server

```
Enterprise Network with HTTP Proxy
    │
    ├── Proxy: http://proxy.corp.com:8080
    │
    ▼
AGI Workforce Configuration
    │
    ├── Settings > Advanced > Proxy Settings
    │   ├── HTTP Proxy: http://proxy.corp.com:8080
    │   └── HTTPS Proxy: http://proxy.corp.com:8080
    │
    ├── Or auto-detect from Windows system proxy:
    │   └── HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings\ProxyServer
    │
    ├── Or enterprise.json pre-configuration:
    │   ├── "proxyHttp": "http://proxy.corp.com:8080"
    │   └── "proxyHttps": "http://proxy.corp.com:8080"
    │
    ▼
All HTTP traffic routed through proxy
    │
    ├── LLM API calls (reqwest uses proxy settings)
    ├── Update checks (Tauri updater respects proxy)
    ├── Supabase sync (reqwest uses proxy settings)
    └── MCP SSE/HTTP servers (reqwest uses proxy settings)

    Note: MCP stdio servers are local and NOT proxied
```

---

# Appendix M: Telemetry and Diagnostics

## M.1 Diagnostic Data Collection (Opt-In)

When users opt in to telemetry (Settings > Advanced > Share Usage Data), the following data is collected:

| Data Point           | Purpose                   | PII               | Windows-Specific  |
| -------------------- | ------------------------- | ----------------- | ----------------- |
| OS version           | Compatibility analysis    | No                | "Windows 11 24H2" |
| Architecture         | ARM64 support planning    | No                | "x86_64"          |
| DPI scale factor     | DPI bug prioritization    | No                | "1.5"             |
| WebView2 version     | Renderer compatibility    | No                | "122.0.2365.92"   |
| App version          | Version adoption tracking | No                | "1.1.5"           |
| Session duration     | Engagement metrics        | No                | Minutes           |
| Feature usage counts | Feature prioritization    | No                | Counts only       |
| Crash reports        | Bug fixing                | No (symbolicated) | Stack traces      |
| Error codes          | Error prioritization      | No                | Error types only  |

### M.1.1 Data NOT Collected

- Chat messages or conversation content
- API keys or credentials
- File paths or file content
- Screen captures
- Clipboard content
- User identity (unless authenticated)
- IP address (anonymized by proxy)

## M.2 Self-Diagnostics

### M.2.1 Health Check Command

Users can run diagnostics from Settings > Advanced > Run Diagnostics:

```
AGI Workforce Diagnostics Report
================================
Date: 2026-03-09T14:30:00Z
Version: 1.1.5 (Windows x64)

System Information:
  OS: Windows 11 Pro 24H2 (Build 26100)
  CPU: Intel Core i9-13900K (24 cores)
  RAM: 32 GB (18 GB available)
  GPU: NVIDIA GeForce RTX 4080
  Display: 3840x2160 @ 150% (256 DPI)
  WebView2: 122.0.2365.92
  Rust: 1.90.0

Application Status:
  Database: OK (agi_workforce.db, 45 MB, 80 tables)
  Settings: OK (v10 migration applied)
  Credential Manager: OK (7 credentials stored)
  Log Files: OK (3 files, 12 MB total)
  Cache: OK (156 MB)
  Temp: OK (2 MB)

Provider Status:
  Anthropic: Connected (circuit: closed)
  OpenAI: Connected (circuit: closed)
  Google: Not configured
  Ollama: Offline (localhost:11434 unreachable)

MCP Servers:
  Gmail: Connected (3 tools)
  Calendar: Disconnected (error: auth expired)

Windows Integration:
  UI Automation: OK (COM initialized)
  Screen Capture: OK (DXGI available)
  Input Simulation: OK (enigo initialized)
  Clipboard: OK
  System Tray: OK (icon visible)
  Auto-start: Disabled
  Deep Links: OK (agiworkforce:// registered)

Performance:
  Memory: 245 MB (within budget)
  CPU: 3% (idle)
  SQLite queries: avg 4ms
  IPC latency: avg 2ms
```

## M.3 Crash Reporting

### M.3.1 Windows Crash Handling

| Crash Type          | Handler                                     | Report                   |
| ------------------- | ------------------------------------------- | ------------------------ |
| Rust panic          | `panic = "abort"` in release (no unwinding) | Stack trace to crash.log |
| WebView2 crash      | Chromium crash handler                      | Crash dump to logs\      |
| Out of memory       | Windows error handler                       | Logged if possible       |
| Unhandled exception | SetUnhandledExceptionFilter (planned)       | Minidump (.dmp)          |

### M.3.2 Crash Report Format

```
AGI Workforce Crash Report
==========================
Timestamp: 2026-03-09T14:30:00Z
Version: 1.1.5
Platform: Windows 11 24H2 x64
WebView2: 122.0.2365.92

Error: thread 'main' panicked at 'assertion failed'
Location: src/core/llm/llm_router.rs:1234
Backtrace:
  0: std::panicking::begin_panic
  1: core::llm::llm_router::LLMRouter::route_request
  2: sys::commands::chat::chat_send_message
  ...

System State at Crash:
  Memory: 456 MB
  Active agents: 2
  Open conversations: 3
  Last action: chat_send_message (model: claude-3-5-sonnet)
```

---

# Appendix N: Migration Guides

## N.1 Migrating from Claude Desktop for Windows

| Step | Action                                                                   | Notes                            |
| ---- | ------------------------------------------------------------------------ | -------------------------------- |
| 1    | Download AGI Workforce installer                                         | agiworkforce.com/download        |
| 2    | Install (can coexist with Claude Desktop)                                | Both apps can run simultaneously |
| 3    | Add Anthropic API key in Settings > API Keys                             | Same key works in both apps      |
| 4    | Copy MCP config: Claude Desktop `.mcp.json` -> AGI Workforce `.mcp.json` | Same format supported            |
| 5    | Import conversations (planned feature)                                   | Manual copy for now              |
| 6    | Configure preferred settings                                             | AGI Workforce has more options   |

## N.2 Migrating from ChatGPT for Windows

| Step | Action                                      | Notes                            |
| ---- | ------------------------------------------- | -------------------------------- |
| 1    | Download AGI Workforce installer            | agiworkforce.com/download        |
| 2    | Install                                     | Can coexist with ChatGPT         |
| 3    | Add OpenAI API key in Settings > API Keys   | Direct API access (BYOK)         |
| 4    | Select GPT-4o as default model              | Same models available            |
| 5    | Note: Conversation history does not migrate | ChatGPT stores on OpenAI servers |

## N.3 Upgrading from AGI Workforce v1.x to v2.0

| Step | Action                             | Notes                                 |
| ---- | ---------------------------------- | ------------------------------------- |
| 1    | Auto-update prompts for v2.0       | Or download from website              |
| 2    | Installer handles in-place upgrade | Data directory preserved              |
| 3    | Settings migrated automatically    | Migration v10 -> v11                  |
| 4    | SQLite schema migrated             | Migration scripts run on first launch |
| 5    | API keys preserved                 | Windows Credential Manager unchanged  |
| 6    | MCP config preserved               | .mcp.json format compatible           |

---

# Appendix E: Revision History

| Version | Date       | Author       | Changes             |
| ------- | ---------- | ------------ | ------------------- |
| 1.0.0   | 2026-03-09 | Product Team | Initial Windows PRD |

---

_End of document. This PRD covers the complete Windows Desktop platform specification for AGI Workforce._
_Document version 1.1.0 — Last updated 2026-03-15_
_For features identical across both desktop platforms, see `PRD-MACOS.md`._
