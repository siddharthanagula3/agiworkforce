# AGI Workforce — Linux Desktop Platform PRD

> **Document version**: 1.0.0
> **Last updated**: 2026-03-09
> **Status**: Approved for implementation
> **Owner**: Product Team
> **Platform**: Linux Desktop (x86_64, aarch64 roadmap)

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

AGI Workforce for Linux is the **only native, multi-LLM, GUI-based AI desktop agent** available on the Linux platform. No competing product -- not Claude Desktop, not ChatGPT Desktop, not Gemini, not Cursor, not Windsurf -- ships a Linux desktop application with equivalent capability. This is not a gap we are racing to fill before competitors catch up; this is a strategic position we own entirely and plan to defend through superior integration with the Linux ecosystem.

Linux users represent a disproportionately valuable segment of the AI power user market. They are developers, researchers, data scientists, system administrators, and privacy advocates who:

- Prefer open protocols and local-first architectures over vendor-locked cloud services.
- Run local LLMs via Ollama, LM Studio, vLLM, and llama.cpp as a matter of daily practice.
- Manage servers, containers, and infrastructure from their desktops.
- Demand keyboard-first, tiling-window-manager-compatible applications.
- Value auditability and transparency in how their data is processed and stored.

AGI Workforce for Linux delivers the full Tauri v2 desktop experience -- identical feature set to macOS and Windows -- with deep, native integration into the Linux desktop ecosystem: XDG base directory compliance, D-Bus notifications, libsecret/GNOME Keyring credential storage, X11 and Wayland display server support, wmctrl/xdotool window management, and distribution as a self-contained AppImage with Ed25519 signature verification.

## 1.2 Target Users

### 1.2.1 Linux Developers and Engineers

Software engineers who use Linux as their primary development environment. They work across terminal, IDE, browser, and specialized tools throughout the day and need an AI agent that can operate across all of these applications seamlessly.

**Key needs:**

- Multi-model support: compare Claude, GPT-4o, Gemini, local Llama, and DeepSeek outputs in a single interface
- Terminal integration: AI that can run shell commands, manage tmux sessions, and interact with build systems
- MCP tool ecosystem: connect custom tools, internal APIs, and development services
- Git-aware: understand repository context, branch state, and commit history
- Code-focused workflows: refactoring, debugging, code generation, documentation across any language
- Tiling WM compatibility: the application must function correctly in i3, Sway, Hyprland, and bspwm

### 1.2.2 Data Scientists and ML Researchers

Users who train models, run experiments, and analyze datasets on Linux workstations with powerful GPUs.

**Key needs:**

- Local model inference via Ollama/vLLM without data leaving the machine
- Document processing: read and analyze PDFs, CSVs, Jupyter notebooks
- Vision capabilities: screenshot analysis, OCR for extracting data from papers and charts
- Long-running background agents that monitor experiments and report results
- Multi-agent swarms for parallelizing research tasks across multiple models

### 1.2.3 System Administrators and DevOps Engineers

Professionals managing Linux servers, Kubernetes clusters, and cloud infrastructure.

**Key needs:**

- Full desktop autonomy: agents that can SSH into servers, run diagnostics, and execute remediation
- Background scheduling: cron-style agents that monitor systems and alert on anomalies
- Database connections: query PostgreSQL, MySQL, MongoDB, Redis directly from the agent
- Email integration: automated status reports, incident notifications
- Secure credential storage: API keys, SSH keys, database passwords encrypted at rest

### 1.2.4 Privacy-Focused Power Users

Users who choose Linux specifically for control over their computing environment and data.

**Key needs:**

- True offline mode: full agent functionality with local models and zero network traffic
- Transparent data handling: all data stored locally in known XDG-compliant paths
- No telemetry by default: opt-in only, with clear documentation of what is collected
- Auditable tool execution: full audit log of every action taken by agents
- AppArmor/SELinux compatibility: the application must not require disabling mandatory access controls

### 1.2.5 Linux Desktop Enthusiasts and Early Adopters

Users who experiment with cutting-edge AI capabilities and want a native Linux experience.

**Key needs:**

- Day-one support for new model releases from any provider
- Voice I/O on Linux (Whisper STT, Piper TTS via ALSA/PulseAudio/PipeWire)
- Computer use and vision features on both X11 and Wayland
- Rapid iteration on new features; willingness to run beta/nightly channels
- Community engagement: AUR packages, Flatpak/Snap roadmap, `.desktop` file integration

## 1.3 Key Differentiators

### 1.3.1 Only Native GUI AI Agent on Linux

No competitor offers a native desktop GUI AI agent on Linux:

| Product           | Linux Support       | Form Factor              |
| ----------------- | ------------------- | ------------------------ |
| **AGI Workforce** | **Native AppImage** | **Full GUI desktop app** |
| Claude Desktop    | None                | N/A                      |
| ChatGPT Desktop   | None                | N/A                      |
| Gemini            | None                | N/A                      |
| Cursor            | Partial (AppImage)  | Code-only IDE            |
| Windsurf          | Partial (AppImage)  | Code-only IDE            |
| Claude Code       | CLI only            | Terminal                 |
| Aider             | CLI only            | Terminal                 |
| Open Interpreter  | CLI only            | Terminal                 |

AGI Workforce is the only product that combines:

1. Native Linux desktop application with full GUI
2. Multi-model support (9+ cloud providers + unlimited local models)
3. Full desktop autonomy (file system, terminal, browser, clipboard, screen capture)
4. MCP tool ecosystem (stdio, SSE, streamable HTTP)
5. Multi-agent swarm orchestration (up to 100 concurrent agents)

### 1.3.2 Local Model Emphasis

Linux users disproportionately run local LLMs. AGI Workforce treats local model support as a first-class feature, not an afterthought:

- **Ollama auto-discovery**: automatically detects running Ollama instances on localhost:11434
- **LM Studio integration**: connects to LM Studio's OpenAI-compatible API
- **vLLM support**: production-grade model serving with full streaming
- **llama.cpp embedded**: optional `local-llm` feature flag for in-process inference via llama-cpp-2 Rust bindings
- **Capability detection**: probes local models via `/api/show` to detect tool support, vision, and context window before routing tasks (prevents silent failures on non-tool-capable models)
- **Model routing intelligence**: automatically routes tasks to the cheapest/fastest capable model, whether cloud or local

### 1.3.3 Privacy-First Architecture

The entire application operates local-first with optional cloud features:

- All chat history, agent memory, and configuration stored in encrypted local SQLite (SQLCipher)
- API keys encrypted at rest via Argon2id + AES-GCM
- No telemetry by default; opt-in only
- Full offline mode with local models requires zero network connectivity
- Cloud features (billing, sync, team collaboration) augment but never gate core functionality

## 1.4 Non-Negotiable Requirements

These requirements are inherited from the platform-wide PRD and apply to the Linux build without exception:

| ID    | Requirement                                          | Linux-Specific Notes                                                                 |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| NN-01 | Zero user-visible raw error messages                 | All errors translated to friendly messages; no Rust panics surface to WebKitGTK      |
| NN-02 | `stream_watchdog_timeout` must never surface to user | Streaming client on Linux uses identical timeout-disabled configuration              |
| NN-03 | Auto-approve mode must have zero friction            | ToolGuard validation active but no confirmation dialogs in auto-approve mode         |
| NN-04 | Multi-LLM routing must work across all 9+ providers  | Circuit breaker, retry, and fallback logic identical to macOS/Windows                |
| NN-05 | Full desktop autonomy must be complete               | X11 and Wayland display server support for screen capture and input simulation       |
| NN-06 | API keys and secrets must never appear in plaintext  | SecretManager uses machine-derived keys; libsecret/GNOME Keyring as optional backend |
| NN-07 | Proprietary license must be enforced                 | No copyleft dependencies; AppImage signed with Ed25519                               |

## 1.5 Success Metrics

| Metric                                 | Target (v1.2.0) | Target (v2.0.0) |
| -------------------------------------- | --------------- | --------------- |
| Feature parity with macOS/Windows      | >= 95%          | 100%            |
| Linux-specific feature audit PASS rate | >= 80%          | >= 95%          |
| Cold start time on Ubuntu 24.04        | < 3 seconds     | < 2 seconds     |
| Memory footprint (idle)                | < 250 MB        | < 200 MB        |
| AppImage download size                 | < 120 MB        | < 100 MB        |
| X11 automation success rate            | >= 90%          | >= 95%          |
| Wayland automation success rate        | >= 70%          | >= 90%          |
| Local model inference latency overhead | < 50ms          | < 25ms          |
| Ubuntu/Fedora CI build success rate    | >= 98%          | >= 99%          |

---

# Section 2: Platform Requirements

## 2.1 Supported Distributions

### 2.1.1 Primary Support (Tier 1)

These distributions are tested in CI, included in the release test matrix, and receive priority bug fixes:

| Distribution | Versions             | Desktop Environment | Display Server         | Notes                      |
| ------------ | -------------------- | ------------------- | ---------------------- | -------------------------- |
| Ubuntu       | 22.04 LTS, 24.04 LTS | GNOME 42/46         | X11, Wayland           | Primary development target |
| Fedora       | 39, 40, 41           | GNOME 45/46/47      | Wayland (default), X11 | Wayland-first testing      |
| Debian       | 12 (Bookworm)        | GNOME 43            | X11 (default), Wayland | Stable/enterprise          |

### 2.1.2 Community Support (Tier 2)

These distributions are expected to work via the AppImage format but are not tested in CI. Bug reports are accepted and prioritized based on user impact:

| Distribution  | Versions              | Desktop Environment | Notes                     |
| ------------- | --------------------- | ------------------- | ------------------------- |
| Arch Linux    | Rolling               | Any                 | AUR package planned       |
| Manjaro       | Rolling               | GNOME, KDE, XFCE    | Based on Arch             |
| Linux Mint    | 21.x, 22.x            | Cinnamon, MATE      | Ubuntu-based              |
| Pop!\_OS      | 22.04, 24.04          | COSMIC, GNOME       | Ubuntu-based              |
| openSUSE      | Tumbleweed, Leap 15.6 | KDE, GNOME          | RPM-based                 |
| NixOS         | 24.05, 24.11          | Any                 | Nix package roadmap       |
| Void Linux    | Rolling               | Any                 | musl builds not supported |
| elementary OS | 7.x                   | Pantheon            | Ubuntu-based              |

### 2.1.3 Tiling Window Manager Support (Tier 2)

The application must function correctly in tiling window managers. "Correctly" means:

- The main window renders at the dimensions assigned by the WM (no hardcoded minimum that breaks tiling)
- Modals and dialogs do not spawn as floating windows in unexpected positions
- The system tray icon appears in the WM's bar/panel (via appindicator or StatusNotifierItem)
- Keyboard shortcuts do not conflict with common WM keybindings (Mod+key range)
- The application respects `_NET_WM_WINDOW_TYPE` hints for proper window classification

| Window Manager | Protocol    | Status | Notes                         |
| -------------- | ----------- | ------ | ----------------------------- |
| i3             | X11         | Tier 2 | Most popular tiling WM        |
| Sway           | Wayland     | Tier 2 | i3-compatible on Wayland      |
| Hyprland       | Wayland     | Tier 2 | Growing fast in adoption      |
| bspwm          | X11         | Tier 2 | Popular among power users     |
| dwm            | X11         | Tier 2 | Minimal, suckless philosophy  |
| awesome        | X11         | Tier 2 | Lua-configurable              |
| qtile          | X11/Wayland | Tier 2 | Python-configurable           |
| river          | Wayland     | Tier 2 | Zig-based, wlroots compositor |

### 2.1.4 Unsupported Configurations

| Configuration                 | Reason                                        | Workaround                   |
| ----------------------------- | --------------------------------------------- | ---------------------------- |
| musl libc (Alpine, Void musl) | glibc dependency in Tauri/WebKitGTK           | Use glibc-based distribution |
| 32-bit (i686)                 | No Tauri 2 support; Rust target deprecated    | Use x86_64                   |
| ARM32 (armhf)                 | WebKitGTK not available                       | None                         |
| Wayland without XWayland      | Some automation features require X11 fallback | Install XWayland package     |

## 2.2 Hardware Requirements

### 2.2.1 Minimum Requirements

| Component | Minimum                  | Notes                                                            |
| --------- | ------------------------ | ---------------------------------------------------------------- |
| CPU       | x86_64, 2 cores, 2.0 GHz | Any AMD64/Intel 64 processor from 2015+                          |
| RAM       | 4 GB                     | 2 GB for OS + 2 GB for AGI Workforce                             |
| Disk      | 500 MB free              | AppImage + data directory                                        |
| Display   | 1280x720                 | Minimum window size is 1000x700                                  |
| GPU       | None required            | Optional: NVIDIA/AMD GPU for local model acceleration            |
| Network   | Optional                 | Required only for cloud LLM providers; local models work offline |

### 2.2.2 Recommended Requirements

| Component | Recommended                     | Notes                                   |
| --------- | ------------------------------- | --------------------------------------- |
| CPU       | x86_64, 4+ cores, 3.0+ GHz      | For responsive agent execution          |
| RAM       | 16 GB                           | 8 GB for AGI Workforce + local models   |
| Disk      | 10 GB free                      | For local model storage (Ollama models) |
| Display   | 1920x1080                       | Optimal UI layout                       |
| GPU       | NVIDIA RTX 3060+ / AMD RX 6700+ | For GPU-accelerated local LLM inference |
| Network   | Broadband                       | For streaming cloud LLM responses       |

### 2.2.3 Local LLM Requirements

| Configuration          | RAM    | GPU VRAM | Example Models                         |
| ---------------------- | ------ | -------- | -------------------------------------- |
| Small models (1B-3B)   | 8 GB   | 4 GB     | Phi-3 mini, TinyLlama                  |
| Medium models (7B-13B) | 16 GB  | 8 GB     | Llama 3 8B, Mistral 7B, CodeLlama 13B  |
| Large models (30B-70B) | 32 GB  | 24 GB    | Llama 3 70B (quantized), CodeLlama 34B |
| Frontier models (70B+) | 64 GB+ | 48 GB+   | Llama 3 70B (FP16), Mixtral 8x22B      |

## 2.3 System Dependencies

### 2.3.1 Runtime Dependencies

These libraries must be present on the user's system for the AppImage to run. Most are provided by default on supported distributions:

| Dependency               | Package (Ubuntu/Debian)    | Package (Fedora)             | Package (Arch)          | Purpose                                               |
| ------------------------ | -------------------------- | ---------------------------- | ----------------------- | ----------------------------------------------------- |
| glibc                    | libc6 (>= 2.35)            | glibc (>= 2.35)              | glibc                   | C standard library                                    |
| WebKitGTK 4.1            | libwebkit2gtk-4.1-0        | webkit2gtk4.1                | webkit2gtk-4.1          | WebView rendering engine                              |
| GTK 3                    | libgtk-3-0                 | gtk3                         | gtk3                    | Window toolkit                                        |
| GLib 2                   | libglib2.0-0               | glib2                        | glib2                   | Core utilities                                        |
| libayatana-appindicator3 | libayatana-appindicator3-1 | libayatana-appindicator-gtk3 | libayatana-appindicator | System tray (StatusNotifierItem)                      |
| librsvg2                 | librsvg2-2                 | librsvg2                     | librsvg                 | SVG rendering (icons)                                 |
| ALSA                     | libasound2                 | alsa-lib                     | alsa-lib                | Audio capture (voice input)                           |
| OpenSSL                  | libssl3                    | openssl-libs                 | openssl                 | TLS (bundled via rustls; OpenSSL for SQLCipher build) |
| PulseAudio/PipeWire      | libpulse0 or pipewire      | pulseaudio-libs or pipewire  | libpulse or pipewire    | Audio output (TTS)                                    |
| D-Bus                    | libdbus-1-3                | dbus-libs                    | dbus                    | Notifications, secret service                         |
| libsecret                | libsecret-1-0              | libsecret                    | libsecret               | GNOME Keyring credential storage                      |

### 2.3.2 Build Dependencies

Required only for building from source or developing:

| Dependency                   | Package (Ubuntu/Debian)      | Purpose                                        |
| ---------------------------- | ---------------------------- | ---------------------------------------------- |
| build-essential              | build-essential              | GCC, make, etc.                                |
| pkg-config                   | pkg-config                   | Library discovery                              |
| libclang-dev                 | libclang-dev                 | SQLCipher bindgen (rusqlite bundled-sqlcipher) |
| libwebkit2gtk-4.1-dev        | libwebkit2gtk-4.1-dev        | WebKitGTK development headers                  |
| libssl-dev                   | libssl-dev                   | OpenSSL development headers                    |
| libayatana-appindicator3-dev | libayatana-appindicator3-dev | Appindicator development headers               |
| librsvg2-dev                 | librsvg2-dev                 | SVG development headers                        |
| libasound2-dev               | libasound2-dev               | ALSA development headers                       |
| libxdo-dev                   | libxdo-dev                   | xdotool library (window/input automation)      |
| libleptonica-dev             | libleptonica-dev             | Leptonica (OCR dependency)                     |
| libpng-dev                   | libpng-dev                   | PNG support                                    |
| libjpeg-dev                  | libjpeg-dev                  | JPEG support                                   |
| libtiff-dev                  | libtiff-dev                  | TIFF support                                   |
| zlib1g-dev                   | zlib1g-dev                   | Compression                                    |
| libwebp-dev                  | libwebp-dev                  | WebP image support                             |
| curl, wget, file             | curl, wget, file             | Build utilities                                |

### 2.3.3 Optional Dependencies

| Dependency                       | Package (Ubuntu/Debian)        | Feature Flag   | Purpose                        |
| -------------------------------- | ------------------------------ | -------------- | ------------------------------ |
| tesseract-ocr + libtesseract-dev | tesseract-ocr libtesseract-dev | `ocr`          | Optical character recognition  |
| wmctrl                           | wmctrl                         | None (runtime) | Window management (X11)        |
| xdotool                          | xdotool                        | None (runtime) | Input simulation (X11)         |
| xdg-utils                        | xdg-utils                      | None (runtime) | File/URL opening               |
| xclip or xsel                    | xclip / xsel                   | None (runtime) | Clipboard operations (X11)     |
| wl-clipboard                     | wl-clipboard                   | None (runtime) | Clipboard operations (Wayland) |
| grim + slurp                     | grim slurp                     | None (runtime) | Screen capture (Wayland)       |
| libnotify                        | libnotify-bin                  | None (runtime) | Desktop notifications (D-Bus)  |

## 2.4 Framework and Technology Stack

### 2.4.1 Core Stack

| Layer                 | Technology                   | Version                  | Linux-Specific Notes                                |
| --------------------- | ---------------------------- | ------------------------ | --------------------------------------------------- |
| Desktop framework     | Tauri                        | 2.9.3                    | Uses WebKitGTK rendering engine (not Chromium)      |
| Frontend framework    | React                        | 19                       | Identical codebase to macOS/Windows                 |
| Build tool            | Vite                         | 7                        | Identical build pipeline                            |
| Frontend language     | TypeScript                   | 5.9.3 (strict)           | No platform-specific TypeScript                     |
| Backend language      | Rust                         | 1.90.0 (edition 2021)    | `cfg(target_os = "linux")` blocks for platform code |
| CSS                   | Tailwind CSS                 | 4                        | GTK/Qt theme integration via CSS variables          |
| UI primitives         | Radix UI                     | latest                   | WebKitGTK renders these identically                 |
| State management      | Zustand                      | 5 + Immer + Persist      | localStorage via WebKitGTK                          |
| Async runtime         | Tokio                        | 1.37 (full features)     | epoll-based on Linux                                |
| HTTP client           | Reqwest                      | 0.12 (rustls-tls)        | No OpenSSL dependency at runtime                    |
| Local database        | rusqlite                     | 0.31 (bundled-sqlcipher) | Requires libclang-dev at build time                 |
| Screen capture        | xcap                         | 0.0.12                   | XCB/XRandR on X11; portal protocol on Wayland       |
| Input simulation      | enigo                        | 0.6                      | X11 via XTest; Wayland via virtual input protocol   |
| Keyboard/mouse events | rdev                         | 0.5                      | X11 via XRecord; limited Wayland support            |
| Window management     | wmctrl + xdotool             | System                   | X11 only; Wayland requires compositor-specific APIs |
| Clipboard             | arboard                      | 3.4                      | X11 clipboard; Wayland via wl-clipboard             |
| Notifications         | tauri-plugin-notification    | 2.3.3                    | D-Bus/libnotify on Linux                            |
| File dialogs          | tauri-plugin-dialog          | 2.6.0                    | GTK file chooser dialogs                            |
| Global shortcuts      | tauri-plugin-global-shortcut | 2.3.0                    | X11 via XGrabKey; Wayland limited                   |

### 2.4.2 Rendering Engine Differences

The Linux build uses **WebKitGTK** as its rendering engine, while macOS uses WebKit (WKWebView) and Windows uses WebView2 (Chromium-based). This creates the following behavioral differences:

| Behavior          | WebKitGTK (Linux)   | WebView2 (Windows) | WebKit (macOS)   |
| ----------------- | ------------------- | ------------------ | ---------------- |
| JavaScript engine | JavaScriptCore      | V8                 | JavaScriptCore   |
| CSS rendering     | WebKit-based        | Blink-based        | WebKit-based     |
| DevTools          | WebKit Inspector    | Chromium DevTools  | WebKit Inspector |
| localStorage cap  | 5 MB per origin     | ~10 MB per origin  | 5 MB per origin  |
| GPU acceleration  | EGL/GLX             | DirectX/ANGLE      | Metal            |
| Font rendering    | FreeType + HarfBuzz | DirectWrite        | CoreText         |
| Scroll physics    | GTK scroll behavior | Windows scroll     | Cocoa scroll     |

**Implications for development:**

- CSS `-webkit-` prefixes work identically on Linux and macOS but differently from Windows
- Font metrics may differ slightly between platforms due to FreeType vs DirectWrite
- GPU-accelerated animations use OpenGL on Linux vs Metal on macOS
- WebKit Inspector is available via right-click when `devtools` feature is enabled
- Some Web APIs may have different support levels between WebKitGTK and WebView2

### 2.4.3 Feature Flags

The following Cargo feature flags are relevant to the Linux build:

| Feature Flag       | Default          | Linux Notes                                       |
| ------------------ | ---------------- | ------------------------------------------------- |
| `shell`            | **on**           | Uses `/bin/sh` or user's shell; respects `$SHELL` |
| `updater`          | **on**           | Ed25519 signature verification; no Authenticode   |
| `devtools`         | **on** (default) | WebKit Inspector for debugging                    |
| `billing`          | **on** (default) | Stripe integration                                |
| `vad`              | **on** (default) | WebRTC VAD via ALSA/PulseAudio                    |
| `remote-databases` | **on** (default) | PostgreSQL, MySQL, MongoDB, Redis clients         |
| `ocr`              | off              | Requires system tesseract-ocr package             |
| `local-llm`        | off              | llama-cpp-2 FFI; requires CUDA/ROCm for GPU       |
| `webrtc-support`   | off              | WebRTC for mobile pairing                         |
| `local-whisper`    | off              | whisper-rs; requires whisper.cpp build            |
| `sentry`           | off              | Sentry error tracking                             |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Core AI Features

| #   | Feature                                                | Priority | Status      | Linux-Specific Notes                       |
| --- | ------------------------------------------------------ | -------- | ----------- | ------------------------------------------ |
| 1   | Multi-LLM chat (9+ cloud providers)                    | P0       | Implemented | Identical to macOS/Windows                 |
| 2   | Local LLM support (Ollama, LM Studio, vLLM, llama.cpp) | P0       | Implemented | Primary differentiator for Linux users     |
| 3   | SSE streaming responses                                | P0       | Implemented | reqwest + rustls (no OpenSSL)              |
| 4   | Tool use (function calling)                            | P0       | Implemented | Identical across platforms                 |
| 5   | Vision / image analysis                                | P0       | Implemented | Screenshot via xcap (X11/Wayland)          |
| 6   | MCP tool ecosystem (stdio, SSE, HTTP)                  | P0       | Implemented | stdio spawns child processes via fork/exec |
| 7   | Agent memory and context                               | P0       | Implemented | SQLCipher local storage                    |
| 8   | Conversation history                                   | P0       | Implemented | Local SQLite database                      |
| 9   | Model comparison (side-by-side)                        | P1       | Implemented | Identical UI                               |
| 10  | Custom model endpoints                                 | P1       | Implemented | Any OpenAI-compatible API                  |
| 11  | Prompt enhancement                                     | P1       | Implemented | Identical feature                          |
| 12  | Token counting and budget tracking                     | P1       | Implemented | tiktoken-rs identical                      |
| 13  | Cost estimation and tracking                           | P1       | Implemented | Per-model pricing database                 |
| 14  | Intent classification                                  | P2       | Implemented | Rust NLP module                            |
| 15  | Embeddings (local + cloud)                             | P1       | Implemented | Ollama nomic-embed-text / OpenAI fallback  |

### 3.1.2 Agent and Automation Features

| #   | Feature                         | Priority | Status      | Linux-Specific Notes                        |
| --- | ------------------------------- | -------- | ----------- | ------------------------------------------- |
| 16  | Autonomous agent mode           | P0       | Implemented | Full autonomy with ToolGuard                |
| 17  | Background agents (24hr+)       | P0       | Implemented | Runs as Tokio tasks; survives desktop sleep |
| 18  | Multi-agent swarm (up to 100)   | P1       | Implemented | Task decomposition + parallel execution     |
| 19  | Agent skills (140+ non-coding)  | P1       | Implemented | `.agi/employees/` skill files               |
| 20  | Auto-approve mode               | P0       | Implemented | ToolGuard remains active                    |
| 21  | Tool confirmation dialogs       | P0       | Implemented | WebKitGTK modal rendering                   |
| 22  | Risk assessment for tool calls  | P1       | Implemented | Identical risk scoring                      |
| 23  | Agent checkpoints and branching | P2       | Implemented | Conversation state snapshots                |
| 24  | Agentic loop status display     | P1       | Implemented | ToolLabel + ToolTimeline components         |

### 3.1.3 Desktop Autonomy Features

| #   | Feature                        | Priority | Status      | Linux-Specific Notes                                     |
| --- | ------------------------------ | -------- | ----------- | -------------------------------------------------------- |
| 25  | File system read/write         | P0       | Implemented | Standard POSIX I/O                                       |
| 26  | Terminal command execution     | P0       | Implemented | portable-pty; respects `$SHELL`                          |
| 27  | Screen capture                 | P0       | Implemented | xcap: XCB/XRandR (X11), portal (Wayland)                 |
| 28  | Mouse simulation               | P1       | Partial     | enigo: XTest (X11); Wayland requires compositor support  |
| 29  | Keyboard simulation            | P1       | Partial     | enigo: XTest (X11); Wayland requires virtual-keyboard-v1 |
| 30  | Window management              | P1       | Implemented | wmctrl (X11); compositor-specific (Wayland)              |
| 31  | Application launching          | P1       | Implemented | `std::process::Command::new(name)` with validation       |
| 32  | Clipboard read/write           | P0       | Implemented | arboard: X11 selections; wl-clipboard (Wayland)          |
| 33  | Browser automation (CDP)       | P1       | Implemented | Chrome DevTools Protocol via WebSocket                   |
| 34  | File/URL opening               | P1       | Implemented | `xdg-open` via `Command::new("xdg-open")`                |
| 35  | OCR (screen text extraction)   | P2       | Partial     | Requires `ocr` feature + system Tesseract                |
| 36  | Computer use (vision + action) | P1       | Partial     | Full on X11; partial on Wayland                          |

### 3.1.4 Communication Features

| #   | Feature                                  | Priority | Status      | Linux-Specific Notes             |
| --- | ---------------------------------------- | -------- | ----------- | -------------------------------- |
| 37  | Email (IMAP/SMTP)                        | P1       | Implemented | async-imap + lettre              |
| 38  | Gmail OAuth integration                  | P1       | Implemented | OAuth2 browser flow via xdg-open |
| 39  | Calendar (Google, Outlook)               | P1       | Implemented | OAuth2 calendar APIs             |
| 40  | Cloud storage (Drive, Dropbox, OneDrive) | P2       | Implemented | REST API integrations            |
| 41  | In-app messaging                         | P2       | Implemented | Real-time via WebSocket          |
| 42  | Team collaboration                       | P2       | Implemented | Supabase-backed                  |

### 3.1.5 Document Processing Features

| #   | Feature            | Priority | Status      | Linux-Specific Notes                              |
| --- | ------------------ | -------- | ----------- | ------------------------------------------------- |
| 43  | PDF read           | P0       | Implemented | pdf-extract + lopdf                               |
| 44  | PDF write/create   | P1       | Implemented | printpdf                                          |
| 45  | DOCX read/write    | P1       | Implemented | docx-rs                                           |
| 46  | XLSX read          | P1       | Implemented | calamine                                          |
| 47  | XLSX write         | P1       | Implemented | rust_xlsxwriter                                   |
| 48  | Markdown rendering | P0       | Implemented | pulldown-cmark (Rust) + react-markdown (frontend) |
| 49  | Image processing   | P1       | Implemented | image + imageproc crates                          |
| 50  | Git operations     | P1       | Implemented | git2 with vendored-openssl                        |

### 3.1.6 Voice and Audio Features

| #   | Feature                         | Priority | Status      | Linux-Specific Notes                                 |
| --- | ------------------------------- | -------- | ----------- | ---------------------------------------------------- |
| 51  | Speech-to-text (Deepgram cloud) | P1       | Implemented | Audio capture via ALSA/PulseAudio                    |
| 52  | Speech-to-text (Whisper local)  | P2       | Partial     | Requires `local-whisper` feature + whisper.cpp build |
| 53  | Text-to-speech (Piper local)    | P2       | Implemented | Piper TTS binary for Linux                           |
| 54  | Voice activity detection        | P1       | Implemented | WebRTC VAD via `vad` feature                         |
| 55  | Push-to-talk hotkey             | P1       | Implemented | X11 global key grab; Wayland limited                 |
| 56  | Voice input overlay             | P2       | Implemented | WebKitGTK overlay rendering                          |

### 3.1.7 UI and Experience Features

| #   | Feature                   | Priority | Status      | Linux-Specific Notes                             |
| --- | ------------------------- | -------- | ----------- | ------------------------------------------------ |
| 57  | System tray icon          | P0       | Implemented | libayatana-appindicator3 (StatusNotifierItem)    |
| 58  | Global keyboard shortcuts | P1       | Implemented | X11: XGrabKey; Wayland: requires compositor      |
| 59  | Deep link handling        | P1       | Implemented | `agiworkforce://` URI scheme via `.desktop` file |
| 60  | Auto-update               | P0       | Implemented | Ed25519-signed AppImage update                   |
| 61  | Notifications             | P1       | Implemented | D-Bus/libnotify via tauri-plugin-notification    |
| 62  | Drag and drop             | P1       | Implemented | GTK drag-and-drop                                |
| 63  | Window state persistence  | P1       | Implemented | tauri-plugin-window-state                        |
| 64  | Dark/light theme          | P0       | Implemented | Respects GTK theme / prefers-color-scheme        |
| 65  | Custom instructions       | P0       | Implemented | CLAUDE.md, .cursorrules auto-discovery           |
| 66  | Settings panel            | P0       | Implemented | Full settings UI                                 |
| 67  | Keyboard shortcuts dialog | P1       | Implemented | Platform-aware shortcut display                  |
| 68  | Command palette           | P1       | Implemented | Ctrl+K activation                                |
| 69  | Slash commands            | P1       | Implemented | `/` prefix in chat input                         |
| 70  | File mention picker       | P1       | Implemented | `@` prefix file autocomplete                     |

### 3.1.8 Security Features

| #   | Feature                                         | Priority | Status      | Linux-Specific Notes                                 |
| --- | ----------------------------------------------- | -------- | ----------- | ---------------------------------------------------- |
| 71  | Encrypted local database (SQLCipher)            | P0       | Implemented | Full-disk encryption at application level            |
| 72  | API key encryption (Argon2id + AES-GCM)         | P0       | Implemented | Machine-derived keys; no keyring prompts             |
| 73  | ToolGuard sandboxing                            | P0       | Implemented | 1,778-line validation module                         |
| 74  | Per-tool permission controls                    | P0       | Implemented | ask / auto-approve-readonly / auto-approve-all       |
| 75  | Audit logging                                   | P0       | Implemented | Every tool execution logged                          |
| 76  | Content Security Policy                         | P0       | Implemented | CSP headers in WebKitGTK                             |
| 77  | Master password protection                      | P1       | Implemented | Optional user-set master password                    |
| 78  | Deny-list path protection                       | P0       | Implemented | 15 path patterns denied by default                   |
| 79  | Ed25519 update verification                     | P0       | Implemented | AppImage signatures verified before install          |
| 80  | Input sanitization (shell injection prevention) | P0       | Implemented | `validate_app_name()`, `sanitize_window_title_arg()` |

### 3.1.9 Data and Storage Features

| #   | Feature                                        | Priority | Status      | Linux-Specific Notes            |
| --- | ---------------------------------------------- | -------- | ----------- | ------------------------------- |
| 81  | Database connections (PG, MySQL, Mongo, Redis) | P1       | Implemented | `remote-databases` feature flag |
| 82  | Codebase indexing and search                   | P1       | Implemented | walkdir + regex                 |
| 83  | Project context management                     | P1       | Implemented | Per-project settings and memory |
| 84  | Cache management                               | P2       | Implemented | XDG-compliant cache directory   |
| 85  | Analytics (local)                              | P2       | Implemented | Usage metrics stored locally    |
| 86  | Cross-device sync                              | P2       | Implemented | Supabase-backed cloud sync      |

### 3.1.10 Scheduling and Background Features

| #   | Feature                     | Priority | Status      | Linux-Specific Notes                               |
| --- | --------------------------- | -------- | ----------- | -------------------------------------------------- |
| 87  | Cron-style scheduling       | P1       | Implemented | tokio-cron-scheduler; NLP natural language parsing |
| 88  | Background task management  | P1       | Implemented | Tokio async tasks                                  |
| 89  | Proactive agent suggestions | P2       | Implemented | Based on user patterns                             |
| 90  | Workflow engine             | P2       | Implemented | n8n-style visual workflows                         |

### 3.1.11 Marketplace and Extensibility Features

| #   | Feature                    | Priority | Status      | Linux-Specific Notes                                 |
| --- | -------------------------- | -------- | ----------- | ---------------------------------------------------- |
| 91  | Skill Marketplace          | P2       | Implemented | Grid/list view, 9 categories, search                 |
| 92  | MCP server management      | P1       | Implemented | stdio, SSE, HTTP transports                          |
| 93  | Custom model configuration | P1       | Implemented | Any OpenAI-compatible endpoint                       |
| 94  | Plugin system              | P3       | Roadmap     | Extension points for third-party integrations        |
| 95  | Chrome extension bridge    | P2       | Implemented | Native messaging via `~/.config/BraveSoftware/` etc. |

## 3.2 Linux-Exclusive Considerations

### 3.2.1 Local Model Emphasis

Linux users run local models at a rate significantly higher than macOS or Windows users. The Linux build emphasizes:

- **Auto-discovery**: Ollama running on localhost is detected automatically on startup
- **GPU acceleration**: NVIDIA CUDA and AMD ROCm paths are detected and utilized
- **Model management UI**: download, update, and remove Ollama models from within the app
- **Performance monitoring**: GPU VRAM usage, inference tokens/second displayed in status bar
- **Context window optimization**: automatic quantization level recommendations based on available VRAM

### 3.2.2 Privacy Configuration

The Linux build includes a "Privacy Mode" preset that configures:

- All LLM routing restricted to local models only
- Telemetry disabled
- Cloud sync disabled
- Auto-update checks disabled (manual only)
- Network access limited to localhost only
- Full offline operation

### 3.2.3 Developer Workflow Integration

Features particularly important for the Linux developer audience:

- **Terminal multiplexer awareness**: detect and interact with tmux/screen sessions
- **SSH agent forwarding**: pass through SSH agent for remote operations
- **Container integration**: detect Docker/Podman and interact with running containers
- **Virtual environment detection**: detect Python venv, conda, nix-shell environments
- **IDE integration**: detect running VS Code, Neovim, Emacs instances for context

## 3.3 Feature Parity Status

### 3.3.1 Features with Reduced Capability on Linux

| Feature                     | macOS/Windows       | Linux              | Gap Description                                         | Priority |
| --------------------------- | ------------------- | ------------------ | ------------------------------------------------------- | -------- |
| Screen capture (Wayland)    | Full                | Partial            | Requires portal protocol; some compositors lack support | P1       |
| Input simulation (Wayland)  | Full                | Partial            | No universal Wayland input simulation protocol          | P1       |
| Window management (Wayland) | Full                | Partial            | No wmctrl equivalent; compositor-specific APIs          | P1       |
| Global shortcuts (Wayland)  | Full                | Partial            | No universal global shortcut protocol on Wayland        | P1       |
| Push-to-talk (Wayland)      | Full                | Partial            | Global key grab requires compositor support             | P2       |
| System tray                 | Full                | Platform-dependent | Some WMs/DEs don't support StatusNotifierItem           | P2       |
| macOS-specific TTS          | Full (macOS native) | N/A                | Linux uses Piper TTS instead of macOS native            | N/A      |
| Accessibility API           | Full (macOS)        | AT-SPI2            | Different accessibility API; same coverage goal         | P2       |

### 3.3.2 Features with Enhanced Capability on Linux

| Feature                 | macOS/Windows | Linux     | Enhancement Description                            |
| ----------------------- | ------------- | --------- | -------------------------------------------------- |
| Local LLM performance   | Standard      | Enhanced  | Better GPU utilization with CUDA/ROCm drivers      |
| Terminal integration    | Standard      | Enhanced  | Native shell integration, tmux/screen awareness    |
| Package management      | N/A           | Available | System package detection for optional dependencies |
| File system permissions | Standard      | Enhanced  | Fine-grained POSIX permissions and ACLs            |
| Process management      | Standard      | Enhanced  | Full /proc filesystem access for monitoring        |
| Container integration   | Standard      | Enhanced  | Native Docker/Podman socket access                 |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Application Shell

### 4.1.1 Main Window

**Purpose**: Primary application container. Houses the navigation sidebar, main content area, and status bar.

**Route**: `/` (root)

**Layout**:

```
+------------------------------------------------------------------+
| [System Title Bar - GTK decorated]                               |
+--------+---------------------------------------------------------+
|        |                                                         |
| Side   |              Main Content Area                          |
| bar    |              (router outlet)                             |
|        |                                                         |
| [Nav]  |                                                         |
|        |                                                         |
|        |                                                         |
|        |                                                         |
|        |                                                         |
|        |                                                         |
|        |                                                         |
|        |                                                         |
+--------+---------------------------------------------------------+
| [Status Bar]                                                     |
+------------------------------------------------------------------+
```

**Dimensions**:

- Default: 1400 x 850 pixels
- Minimum: 1000 x 700 pixels
- Resizable: Yes
- Fullscreen: Supported (F11)
- Decorations: Yes (GTK window decorations; `decorations: true` in tauri.conf.json)

**Linux-Specific Behavior**:

- Window decorations rendered by the GTK toolkit; appearance matches user's GTK theme
- In tiling WMs (i3, Sway), the window fills the assigned tile; decorations may be hidden per WM config
- `_NET_WM_WINDOW_TYPE_NORMAL` is set for proper WM classification
- Shadow rendering (`shadow: true`) may not appear in all compositors
- `acceptFirstMouse: true` allows interaction without first focusing the window
- Window state (position, size, maximized) persisted via tauri-plugin-window-state across sessions

**Component Inventory**:

| Component     | Location              | Purpose                                                   |
| ------------- | --------------------- | --------------------------------------------------------- |
| Title bar     | Top                   | GTK-native title bar with close/minimize/maximize buttons |
| Sidebar       | Left (240px default)  | Navigation, conversation list, quick actions              |
| Main content  | Center                | Route-dependent content rendering                         |
| Status bar    | Bottom (32px)         | Model indicator, token count, connection status           |
| Resize handle | Right edge of sidebar | Drag to resize sidebar width                              |

**Keyboard Shortcuts (Linux-specific)**:

- `Ctrl+,` -- Open Settings
- `Ctrl+K` -- Open Command Palette
- `Ctrl+N` -- New Conversation
- `Ctrl+Shift+N` -- New Window
- `Ctrl+W` -- Close current conversation
- `Ctrl+Q` -- Quit application
- `Ctrl+/` -- Toggle sidebar
- `Ctrl+Enter` -- Send message
- `F11` -- Toggle fullscreen
- `Ctrl+Plus` / `Ctrl+Minus` -- Zoom in/out
- `Ctrl+0` -- Reset zoom
- `Ctrl+Shift+I` -- Toggle DevTools (when devtools feature enabled)

**State Variations**:

| State                      | Description                    | Visual                                                         |
| -------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Initial (no conversations) | Fresh install, no chat history | Empty state with welcome message and getting started guide     |
| Active conversation        | Chat in progress               | Sidebar shows conversation list; main area shows chat          |
| Agent running              | Autonomous agent executing     | Status bar shows spinning indicator; ToolTimeline visible      |
| Offline                    | No network connectivity        | Status bar shows "Offline" badge; local models still available |
| Updating                   | Auto-update in progress        | Notification banner at top; application continues functioning  |
| Error recovery             | Unrecoverable error            | Error boundary component with "Restart" button                 |

### 4.1.2 Sidebar

**Purpose**: Primary navigation, conversation list, and quick actions.

**Component**: `Sidebar.tsx`

**Layout**:

```
+------------------------+
| [Logo] AGI Workforce   |
| [+ New Chat]           |
+------------------------+
| Search conversations   |
+------------------------+
| Today                  |
|   Conversation 1       |
|   Conversation 2       |
| Yesterday              |
|   Conversation 3       |
| Previous 7 Days        |
|   Conversation 4       |
|   Conversation 5       |
+------------------------+
| [Model Selector]       |
| [User Avatar] Account  |
| [Settings Gear]        |
+------------------------+
```

**Component Inventory**:

| Element            | Type                 | Label/Text                                         | Behavior                                                 |
| ------------------ | -------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Logo               | Image + Text         | "AGI Workforce"                                    | Clicking returns to root route                           |
| New Chat button    | Button (primary)     | "+ New Chat"                                       | Creates new conversation; `Ctrl+N` shortcut              |
| Search input       | Text input           | Placeholder: "Search conversations..."             | Filters conversation list in real-time                   |
| Date group headers | Text (muted)         | "Today", "Yesterday", "Previous 7 Days", "Older"   | Non-interactive section dividers                         |
| Conversation items | Clickable list items | First line of conversation or auto-generated title | Click to load conversation; right-click for context menu |
| Model selector     | Dropdown button      | Current model name + provider icon                 | Opens model selector popover                             |
| User avatar        | Avatar image         | User's profile picture or initials                 | Opens account menu on click                              |
| Settings gear      | Icon button          | Gear icon                                          | Opens Settings panel; `Ctrl+,` shortcut                  |
| Resize handle      | Draggable divider    | Invisible (cursor changes)                         | Drag to resize sidebar width (160px-400px range)         |

**Conversation Item Context Menu** (Right-click):

| Menu Item            | Action                              |
| -------------------- | ----------------------------------- |
| "Rename"             | Inline rename of conversation title |
| "Duplicate"          | Create copy of conversation         |
| "Export as Markdown" | Save conversation as `.md` file     |
| "Export as JSON"     | Save conversation as `.json` file   |
| "Share"              | Open share dialog                   |
| "Delete"             | Delete with confirmation dialog     |

**State Variations**:

| State                    | Visual                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Empty (no conversations) | "Start your first conversation" prompt with suggested actions |
| Search active            | Only matching conversations shown; highlight matching text    |
| Search no results        | "No conversations found" with suggestion to create new        |
| Collapsed                | Sidebar hidden; toggle via Ctrl+/ or hamburger icon           |
| Loading conversations    | Skeleton loading animation for conversation list              |

### 4.1.3 Status Bar

**Purpose**: Persistent status information across all views.

**Layout**:

```
+------------------------------------------------------------------+
| [Model: Claude 3.5 Sonnet] | [Tokens: 1,234/200K] | [Cost: $0.02] | [Status: Connected] | [Agent: Idle] |
+------------------------------------------------------------------+
```

**Component Inventory**:

| Element                           | Type                | Content                                                    | Behavior                                                          |
| --------------------------------- | ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Model indicator                   | Badge               | Provider icon + model name                                 | Click to change model                                             |
| Token counter                     | Text                | "Tokens: {used}/{limit}"                                   | Updates in real-time during streaming                             |
| Cost tracker                      | Text                | "Cost: ${amount}"                                          | Cumulative cost for current session                               |
| Connection status                 | Badge               | "Connected" / "Offline" / "Reconnecting"                   | Green dot for connected; yellow for reconnecting; red for offline |
| Agent status                      | Badge               | "Idle" / "Thinking..." / "Executing..." / "Background (3)" | Shows current agent activity                                      |
| Linux-specific: Wayland indicator | Badge (conditional) | "Wayland" / "X11"                                          | Shows active display server; click for automation capability info |

## 4.2 Chat Interface

### 4.2.1 Main Chat View

**Purpose**: Primary interaction surface for chatting with AI models and managing agent actions.

**Route**: `/chat/:conversationId`

**Layout**:

```
+------------------------------------------------------------------+
| [Conversation Title]                    [Model] [Branch] [Share] |
+------------------------------------------------------------------+
|                                                                    |
|  [System message / Context display]                                |
|                                                                    |
|  [User message bubble]                                             |
|     "How do I set up a Docker container for..."                    |
|                                                                    |
|  [Assistant message bubble]                                        |
|     "I'll help you set up a Docker container..."                   |
|     [Tool Timeline]                                                |
|       > Read(Dockerfile) -- 120ms                                  |
|       > Bash(docker build -t myapp .) -- 3.2s                     |
|       > Write(docker-compose.yml) -- 45ms                         |
|     [Thinking block - collapsible]                                 |
|     [Code block with syntax highlighting]                         |
|     [Copy] [Insert] [Run]                                          |
|                                                                    |
|  [User message bubble]                                             |
|     [Attached file: config.yaml]                                   |
|     "Can you review this configuration?"                           |
|                                                                    |
+------------------------------------------------------------------+
| [Attachments row: file1.py, screenshot.png]                       |
+------------------------------------------------------------------+
| [+ Plus menu] [Text input area]                  [Send / Stop]   |
| [Model: Claude 3.5 Sonnet v] [Agent Mode v]     [Ctrl+Enter]    |
+------------------------------------------------------------------+
```

**Component Inventory**:

| Component           | File                      | Purpose                                              |
| ------------------- | ------------------------- | ---------------------------------------------------- |
| ChatMessageList     | `ChatMessageList.tsx`     | Scrollable message list with virtualization          |
| MessageBubble       | `MessageBubble.tsx`       | Individual message rendering (user/assistant/system) |
| CodeBlock           | `CodeBlock.tsx`           | Syntax-highlighted code with copy/run buttons        |
| ToolTimeline        | `ToolTimeline.tsx`        | Collapsible timeline of tool executions              |
| ToolLabel           | `ToolLabel.tsx`           | Individual tool execution status (Started/Completed) |
| ThinkingBlock       | `ThinkingBlock.tsx`       | Collapsible reasoning/thinking display               |
| ChatInputArea       | `ChatInputArea.tsx`       | Multi-line text input with attachments               |
| SendButton          | `SendButton.tsx`          | Send / Stop toggle button                            |
| PlusMenu            | `PlusMenu.tsx`            | Attachment and action menu                           |
| ModelSelectorButton | `ModelSelectorButton.tsx` | Quick model switching                                |
| AgentModeSwitcher   | `AgentModeSwitcher.tsx`   | Toggle between chat/agent/auto modes                 |
| AttachmentPreview   | `AttachmentPreview.tsx`   | Preview of attached files                            |
| ReasoningAccordion  | `ReasoningAccordion.tsx`  | Extended reasoning display                           |
| CitationBadge       | `CitationBadge.tsx`       | Source citations with links                          |
| ToolCallCard        | `ToolCallCard.tsx`        | Detailed tool call result display                    |
| InlineToolResults   | `InlineToolResults/`      | Inline rendering of tool outputs                     |
| ContextDisplay      | `ContextDisplay.tsx`      | Current conversation context display                 |
| TokenCounter        | `TokenCounter.tsx`        | Token usage for current message                      |
| BudgetTracker       | `BudgetTracker.tsx`       | Budget remaining for session                         |
| BudgetAlertsPanel   | `BudgetAlertsPanel.tsx`   | Budget threshold alerts                              |

**Chat Input Area Details**:

| Element               | Type                | Behavior                                                  |
| --------------------- | ------------------- | --------------------------------------------------------- |
| Text input            | Multi-line textarea | Auto-grows up to 12 lines; supports Markdown              |
| Placeholder text      | Placeholder         | "Message AGI Workforce... (Ctrl+Enter to send)"           |
| Plus menu button      | Icon button (+)     | Opens attachment/action dropdown                          |
| Send button           | Icon button (arrow) | Sends message; changes to Stop (square) during generation |
| Model selector        | Dropdown            | Shows current model; click to switch                      |
| Agent mode selector   | Dropdown            | "Chat" / "Agent" / "Auto-approve" modes                   |
| File drop zone        | Overlay             | "Drop files here" overlay on drag-over                    |
| Slash command trigger | Text pattern        | "/" at start of line opens SlashCommandMenu               |
| File mention trigger  | Text pattern        | "@" opens FileMentionPicker                               |
| Skill mention trigger | Text pattern        | "#" opens SkillMentionPicker                              |

**Plus Menu Items**:

| Menu Item              | Icon       | Action                                |
| ---------------------- | ---------- | ------------------------------------- |
| "Attach File"          | Paperclip  | Opens GTK file chooser (multi-select) |
| "Take Screenshot"      | Camera     | Captures screen region via xcap       |
| "Paste from Clipboard" | Clipboard  | Pastes text/image from clipboard      |
| "Record Voice"         | Microphone | Starts voice recording                |
| "Add Context"          | Folder     | Opens context file/folder picker      |
| "Use Template"         | Template   | Opens template selector               |

**Message Bubble Interactions**:

| Action       | Trigger                                   | Result                                      |
| ------------ | ----------------------------------------- | ------------------------------------------- |
| Copy message | Hover > Copy icon                         | Copies message text to clipboard            |
| Edit message | Hover > Edit icon (user messages only)    | Converts message to editable input          |
| Regenerate   | Hover > Refresh icon (assistant messages) | Re-generates response from same input       |
| Branch       | Hover > Branch icon                       | Creates conversation branch at this message |
| React        | Hover > Thumbs up/down                    | Records feedback for message quality        |
| Delete       | Hover > Trash icon (user messages only)   | Removes message with confirmation           |

**Code Block Actions**:

| Button         | Label                                    | Behavior                                                |
| -------------- | ---------------------------------------- | ------------------------------------------------------- |
| Copy           | "Copy"                                   | Copies code to clipboard; shows "Copied!" for 2 seconds |
| Run            | "Run" (shell code only)                  | Executes in terminal; shows output inline               |
| Insert         | "Insert" (when editor context available) | Inserts code into active editor/file                    |
| Wrap           | "Wrap Lines"                             | Toggles line wrapping in code block                     |
| Language badge | Auto-detected                            | Shows detected language; click to change                |

**Tool Timeline Details**:

The ToolTimeline component displays a collapsible timeline of tool executions during agent processing:

```
> Tool Executions (3 tools, 3.4s total)
  [Completed] Read(Dockerfile) ........................ 120ms
  [Completed] Bash(docker build -t myapp .) ........... 3.2s
  [Running]   Write(docker-compose.yml) ............... ...
```

| Element              | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| Header               | "Tool Executions ({count} tools, {total_time} total)" with collapse toggle           |
| Tool entry           | Status icon + display name + arguments + duration                                    |
| Status icons         | Spinning (running), Check (completed), X (failed)                                    |
| Click to expand      | Shows full tool input/output for each tool                                           |
| Display name mapping | Maps internal tool names to user-friendly labels (e.g., `read_file` -> `Read(path)`) |

**State Variations**:

| State              | Description                    | Visual                                                                    |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| Empty conversation | No messages yet                | SimpleEmptyState or AdvancedEmptyState with suggestions                   |
| Streaming response | Assistant is generating        | Animated text cursor; message appearing incrementally; Stop button active |
| Agent executing    | Autonomous agent running tools | ToolTimeline expanding; AgenticLoopStatusBar showing progress             |
| Approval required  | Agent needs tool confirmation  | ApprovalModal overlay with tool details and Approve/Deny buttons          |
| Error state        | LLM or tool error              | Error message in assistant bubble with "Retry" button                     |
| Rate limited       | Provider rate limit hit        | "Rate limited. Retrying in {n}s..." message with countdown                |
| Offline            | No network                     | "Offline. Switch to a local model to continue." banner                    |
| Context exceeded   | Token limit reached            | "Context limit reached. Start a new conversation or compact." warning     |

### 4.2.2 Approval Modal

**Purpose**: Displays tool execution details for user approval when not in auto-approve mode.

**Component**: `ApprovalModal.tsx`

**Layout**:

```
+------------------------------------------+
| Tool Approval Required                    |
+------------------------------------------+
| [Tool icon] Bash                          |
|                                           |
| Command:                                  |
| docker build -t myapp .                   |
|                                           |
| Risk Level: [Medium - yellow badge]       |
|                                           |
| This command will:                        |
| - Execute a shell command                 |
| - Access the file system                  |
| - Use network (Docker pull)              |
|                                           |
| [Deny]  [Approve Once]  [Always Approve] |
+------------------------------------------+
```

**Component Inventory**:

| Element               | Type               | Label                                                                     | Behavior                                          |
| --------------------- | ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Title                 | Heading            | "Tool Approval Required"                                                  | Static text                                       |
| Tool icon             | Icon               | Tool-specific icon                                                        | Visual indicator of tool type                     |
| Tool name             | Text (bold)        | Tool display name (e.g., "Bash", "Read", "Write")                         | Static text                                       |
| Command/args display  | Code block         | Tool arguments                                                            | Scrollable if long                                |
| Risk level badge      | Badge              | "Low" (green) / "Medium" (yellow) / "High" (red) / "Critical" (red pulse) | Color-coded risk assessment                       |
| Impact description    | Bulleted list      | What the tool will do                                                     | Auto-generated from tool metadata                 |
| Deny button           | Button (outline)   | "Deny"                                                                    | Rejects execution; agent continues without result |
| Approve Once button   | Button (primary)   | "Approve Once"                                                            | Approves this single execution                    |
| Always Approve button | Button (secondary) | "Always Approve"                                                          | Adds tool to auto-approve list for this session   |

**Keyboard Shortcuts**:

- `Enter` -- Approve Once
- `Escape` -- Deny
- `Shift+Enter` -- Always Approve

### 4.2.3 Chat Input Toolbar

**Purpose**: Secondary toolbar above the input area for additional chat controls.

**Component**: `ChatInputToolbar.tsx`

**Layout**:

```
+------------------------------------------------------------------+
| [Focus: General v] [Agent: Chat v] [Temperature: 0.7] [Thinking] |
+------------------------------------------------------------------+
```

**Elements**:

| Element            | Type             | Options                                               | Default       |
| ------------------ | ---------------- | ----------------------------------------------------- | ------------- |
| Focus selector     | Dropdown         | "General", "Code", "Research", "Creative", "Analysis" | "General"     |
| Agent mode         | Dropdown         | "Chat", "Agent", "Auto-approve"                       | "Chat"        |
| Temperature slider | Slider (0.0-2.0) | Continuous                                            | 0.7           |
| Thinking toggle    | Toggle switch    | On/Off                                                | Off           |
| Max tokens input   | Number input     | 1-200000                                              | Model default |

## 4.3 Settings Panel

### 4.3.1 Settings Overview

**Purpose**: Centralized configuration for all application settings.

**Route**: Modal overlay (not a separate route)

**Trigger**: Sidebar gear icon or `Ctrl+,`

**Layout**:

```
+------------------------------------------------------------------+
| Settings                                              [X Close]   |
+------------------------------------------------------------------+
| [Settings navigation]  | [Active settings panel]                  |
|                        |                                           |
| General                | General Settings                          |
| API Keys               |                                           |
| Models                 | Theme                                     |
| Automation             |   [System v] [Light] [Dark]               |
| MCP Tools              |                                           |
| MCP Servers            | Language                                  |
| Skills & Plugins       |   [English v]                             |
| Privacy & Data         |                                           |
| Notifications          | Default Model                             |
| Voice                  |   [Claude 3.5 Sonnet v]                   |
| Research               |                                           |
| Updates                | Startup Behavior                          |
| Master Password        |   [x] Start minimized to tray             |
| Account                |   [x] Restore last session                |
| About                  |                                           |
|                        | Data Directory                            |
|                        |   ~/.local/share/com.agiworkforce.desktop  |
|                        |   [Open in File Manager]                  |
|                        |                                           |
+------------------------------------------------------------------+
```

**Settings Navigation Items**:

| Item             | Component                                             | Description                                       |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------- |
| General          | `GeneralSettings.tsx`                                 | Theme, language, startup behavior, data directory |
| API Keys         | `ApiKeysSettings.tsx`                                 | Provider API key management                       |
| Models           | `ModelSelector.tsx` + `CustomModelsSettings.tsx`      | Model selection, custom endpoints, favorites      |
| Automation       | `AutomationPermissionsSettings.tsx`                   | Computer use permissions, safety settings         |
| MCP Tools        | `MCPToolsSettings.tsx`                                | MCP tool configuration and permissions            |
| MCP Servers      | `MCPServerSettings.tsx`                               | MCP server connections management                 |
| Skills & Plugins | `SkillsPluginsSettings.tsx`                           | AI skill configuration, plugin management         |
| Privacy & Data   | `PrivacySettings.tsx` + `FeaturesPrivacySettings.tsx` | Telemetry, data retention, privacy mode           |
| Notifications    | `NotificationsSettings.tsx`                           | Desktop notification preferences                  |
| Voice            | `VoiceSettings.tsx`                                   | STT/TTS configuration, audio device selection     |
| Research         | `ResearchSettings.tsx`                                | Research mode settings                            |
| Updates          | `UpdateSettings.tsx`                                  | Auto-update channel, check frequency              |
| Master Password  | `MasterPasswordSettings.tsx`                          | Set/change/remove master password                 |
| Account          | `AccountSettings.tsx`                                 | User account, subscription, billing               |
| About            | Component in GeneralSettings                          | Version info, licenses, system info               |

### 4.3.2 General Settings

**Component**: `GeneralSettings.tsx`

**Fields**:

| Field                | Type                         | Options/Values              | Default                                        | Linux Notes                                           |
| -------------------- | ---------------------------- | --------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| Theme                | Radio group                  | System, Light, Dark         | System                                         | Reads GTK theme preference via `prefers-color-scheme` |
| Language             | Dropdown                     | English, Espanol            | English                                        | Uses i18next                                          |
| Default Model        | Model picker                 | All available models        | Claude 3.5 Sonnet                              | Lists cloud + local models                            |
| Start minimized      | Checkbox                     | On/Off                      | Off                                            | Minimizes to system tray on startup                   |
| Restore last session | Checkbox                     | On/Off                      | On                                             | Restores conversation state on launch                 |
| Show in system tray  | Checkbox                     | On/Off                      | On                                             | Requires libayatana-appindicator3                     |
| Close to tray        | Checkbox                     | On/Off                      | On                                             | Window close minimizes to tray instead of quitting    |
| Data directory       | Read-only path + Open button | XDG path                    | `~/.local/share/com.agiworkforce.desktop`      | XDG_DATA_HOME compliant                               |
| Config directory     | Read-only path + Open button | XDG path                    | `~/.config/com.agiworkforce.desktop`           | XDG_CONFIG_HOME compliant                             |
| Cache directory      | Read-only path + Open button | XDG path                    | `~/.cache/com.agiworkforce.desktop`            | XDG_CACHE_HOME compliant                              |
| Log directory        | Read-only path + Open button | XDG path                    | `~/.local/state/com.agiworkforce.desktop/logs` | XDG_STATE_HOME compliant                              |
| Font size            | Slider (10-24px)             | Continuous                  | 14px                                           | FreeType rendering                                    |
| Zoom level           | Dropdown                     | 75%, 100%, 125%, 150%, 200% | 100%                                           | WebKitGTK zoom                                        |
| Send with Enter      | Toggle                       | On/Off                      | Off                                            | When on, Enter sends; Shift+Enter for newline         |

### 4.3.3 API Keys Settings

**Component**: `ApiKeysSettings.tsx`

**Layout**:

```
+------------------------------------------+
| API Keys                                  |
+------------------------------------------+
| Configure your AI provider API keys.      |
| Keys are encrypted with AES-GCM and      |
| stored locally.                           |
|                                           |
| Anthropic                                 |
|   [sk-ant-*****...****] [Show] [Remove]  |
|   Status: [Connected - green]             |
|                                           |
| OpenAI                                    |
|   [Not configured]      [Add Key]         |
|                                           |
| Google AI                                 |
|   [Not configured]      [Add Key]         |
|                                           |
| Mistral                                   |
|   [Not configured]      [Add Key]         |
|                                           |
| Groq                                      |
|   [Not configured]      [Add Key]         |
|                                           |
| DeepSeek                                  |
|   [Not configured]      [Add Key]         |
|                                           |
| OpenRouter                                |
|   [Not configured]      [Add Key]         |
|                                           |
| Together.ai                               |
|   [Not configured]      [Add Key]         |
|                                           |
| Fireworks.ai                              |
|   [Not configured]      [Add Key]         |
|                                           |
| Local Models                              |
|   Ollama: [Auto-detected at :11434]       |
|   LM Studio: [Not detected]              |
|   Custom: [Add Endpoint]                  |
+------------------------------------------+
```

**Interaction Flows**:

1. **Add API Key**:
   - User clicks "Add Key" next to provider name
   - Input field appears with password masking
   - User pastes API key
   - "Save" button appears; user clicks Save
   - Key is encrypted via SecretManager (Argon2id + AES-GCM)
   - Connection test runs automatically
   - Status badge updates to "Connected" (green) or "Invalid" (red)
   - Success toast: "API key saved and verified"

2. **Remove API Key**:
   - User clicks "Remove" next to existing key
   - Confirmation dialog: "Remove Anthropic API key? This cannot be undone."
   - On confirm: key deleted from SQLCipher database
   - Status badge updates to "Not configured"
   - Toast: "API key removed"

3. **Show/Hide API Key**:
   - User clicks "Show" to reveal masked key
   - Key displayed for 10 seconds, then auto-hides
   - "Show" button changes to "Hide" while visible

### 4.3.4 MCP Tools Settings

**Component**: `MCPToolsSettings.tsx`

**Layout**:

```
+------------------------------------------+
| MCP Tools                                 |
+------------------------------------------+
| Manage Model Context Protocol tools and   |
| their permissions.                        |
|                                           |
| [Search tools...]                         |
|                                           |
| Gmail MCP Server                          |
|   Status: [Connected]                     |
|   Tools: 12 available                     |
|   Permission: [Auto-approve readonly v]   |
|   [Configure] [Disconnect]               |
|                                           |
| Google Calendar                           |
|   Status: [Connected]                     |
|   Tools: 8 available                      |
|   Permission: [Ask for approval v]        |
|   [Configure] [Disconnect]               |
|                                           |
| [+ Add MCP Server]                        |
|   Transport: [stdio v] [SSE] [HTTP]       |
|   Command/URL: [                       ]  |
|   [Test Connection]  [Save]              |
+------------------------------------------+
```

**Fields per MCP Server**:

| Field                     | Type                 | Purpose                                                           |
| ------------------------- | -------------------- | ----------------------------------------------------------------- |
| Server name               | Text (read-only)     | Display name from server manifest                                 |
| Status badge              | Badge                | "Connected" / "Disconnected" / "Error" / "Circuit Open"           |
| Tool count                | Text                 | "N tools available"                                               |
| Permission dropdown       | Dropdown             | "Ask for approval" / "Auto-approve readonly" / "Auto-approve all" |
| Configure button          | Button               | Opens server-specific configuration                               |
| Disconnect button         | Button (destructive) | Disconnects and removes server                                    |
| Circuit breaker indicator | Badge (conditional)  | Shows "Circuit Open (30s cooldown)" when tripped                  |

### 4.3.5 Privacy Settings

**Component**: `PrivacySettings.tsx`

**Layout**:

```
+------------------------------------------+
| Privacy & Data                            |
+------------------------------------------+
| Control how your data is stored and       |
| processed.                                |
|                                           |
| Telemetry                                 |
|   [ ] Send anonymous usage analytics     |
|   [ ] Send crash reports                 |
|                                           |
| Data Retention                            |
|   Keep conversations for: [Forever v]     |
|   Keep audit logs for: [90 days v]       |
|                                           |
| Privacy Mode                              |
|   [ ] Enable Privacy Mode                |
|   Restricts all LLM routing to local     |
|   models. Disables cloud sync, telemetry, |
|   and auto-update checks.                |
|                                           |
| Data Management                           |
|   [Export All Data]                       |
|   [Clear Conversation History]           |
|   [Clear Agent Memory]                   |
|   [Clear Cache] (128 MB used)            |
|   [Delete All Data and Reset]            |
|                                           |
| Network Access                            |
|   [x] Allow cloud LLM providers          |
|   [x] Allow auto-update checks           |
|   [ ] Allow telemetry                    |
|   [x] Allow MCP server connections       |
+------------------------------------------+
```

### 4.3.6 Automation Permissions Settings

**Component**: `AutomationPermissionsSettings.tsx`

**Layout**:

```
+------------------------------------------+
| Automation Permissions                    |
+------------------------------------------+
| Control what agents can do on your        |
| system.                                   |
|                                           |
| File System                               |
|   [x] Read files                         |
|   [x] Write files                        |
|   [x] Delete files                       |
|   Denied paths: /etc, /boot, /sys, ...   |
|   [Edit denied paths]                    |
|                                           |
| Terminal                                  |
|   [x] Execute commands                   |
|   [x] Interactive sessions               |
|   [x] Background commands               |
|   Denied commands: rm -rf /, mkfs, ...   |
|   [Edit denied commands]                 |
|                                           |
| Screen & Input                            |
|   [x] Screen capture                     |
|   [x] Mouse simulation                   |
|   [x] Keyboard simulation               |
|   Display server: [X11 / Wayland]        |
|   Note: Some features limited on Wayland |
|                                           |
| Browser                                   |
|   [x] CDP automation                     |
|   [x] Open URLs                          |
|   [x] DOM interaction                    |
|                                           |
| Network                                   |
|   [x] HTTP requests                      |
|   [x] WebSocket connections              |
|   [ ] Raw socket access                  |
|                                           |
| Databases                                 |
|   [x] Read queries                       |
|   [x] Write queries                      |
|   [ ] DDL operations (CREATE/DROP)       |
+------------------------------------------+
```

### 4.3.7 Voice Settings

**Component**: `VoiceSettings.tsx`

**Layout (Linux-specific)**:

```
+------------------------------------------+
| Voice Settings                            |
+------------------------------------------+
| Speech-to-Text                            |
|   Provider: [Deepgram (cloud) v]          |
|   Alternative: [Whisper (local) v]        |
|   Language: [English (US) v]             |
|                                           |
| Text-to-Speech                            |
|   Provider: [Piper TTS (local) v]         |
|   Voice: [en_US-lessac-medium v]         |
|   Speed: [1.0x slider]                   |
|   [Test Voice]                           |
|                                           |
| Audio Devices                             |
|   Input: [Default - PulseAudio v]        |
|   Output: [Default - PulseAudio v]       |
|   Audio system: PipeWire / PulseAudio    |
|   [Test Audio]                           |
|                                           |
| Push-to-Talk                              |
|   Hotkey: [Ctrl+Space]  [Change]         |
|   Note: Global hotkeys may not work      |
|   on Wayland without compositor support.  |
|   Current: X11 (supported)               |
|                                           |
| Voice Activity Detection                  |
|   [x] Enable VAD (auto-detect speech)    |
|   Sensitivity: [Medium slider]           |
+------------------------------------------+
```

### 4.3.8 Update Settings

**Component**: `UpdateSettings.tsx`

**Layout (Linux-specific)**:

```
+------------------------------------------+
| Updates                                   |
+------------------------------------------+
| Current Version: 1.1.5                    |
| Channel: [Stable v]                       |
|                                           |
| [Check for Updates]                       |
|                                           |
| Auto-Update                               |
|   [x] Check for updates automatically    |
|   [x] Download updates in background     |
|   [ ] Install updates automatically      |
|                                           |
| Update Verification                       |
|   Updates are verified using Ed25519      |
|   digital signatures before installation. |
|   Public key: dW50cnVzdGVk...             |
|                                           |
| Distribution Format: AppImage             |
| Update endpoint:                          |
|   agiworkforce.com/api/releases/          |
|   linux-x86_64/{version}                 |
|                                           |
| Last checked: 2026-03-09 14:30 UTC       |
| Last updated: 2026-03-08 10:00 UTC       |
+------------------------------------------+
```

## 4.4 Model Selector

### 4.4.1 Quick Model Selector

**Purpose**: Rapid model switching from the chat interface.

**Component**: `QuickModelSelector.tsx`

**Trigger**: Click on model name in status bar or chat input toolbar.

**Layout**:

```
+------------------------------------------+
| Select Model                    [Search]  |
+------------------------------------------+
| Favorites                                 |
|   [*] Claude 3.5 Sonnet    [Anthropic]   |
|   [*] GPT-4o               [OpenAI]      |
|   [*] Llama 3 8B           [Ollama]      |
+------------------------------------------+
| Cloud Models                              |
|   Anthropic                               |
|     Claude 3.5 Sonnet      $3/$15/M      |
|     Claude 3.5 Haiku        $0.25/$1.25  |
|     Claude 3 Opus           $15/$75/M    |
|   OpenAI                                  |
|     GPT-4o                  $2.5/$10/M   |
|     GPT-4o mini             $0.15/$0.6   |
|     o1                      $15/$60/M    |
|   Google                                  |
|     Gemini 2.0 Flash        $0.1/$0.4    |
|     Gemini 1.5 Pro          $1.25/$5/M   |
|   ...                                     |
+------------------------------------------+
| Local Models                              |
|   Ollama (localhost:11434)                |
|     llama3:8b               [Running]    |
|     codellama:13b           [Available]  |
|     mistral:7b              [Available]  |
|   LM Studio (not detected)               |
|   Custom Endpoints                        |
|     My vLLM Server          [Connected]  |
+------------------------------------------+
| [+ Add Custom Model]                      |
+------------------------------------------+
```

**Fields per model**:

| Element          | Content                                         | Behavior                   |
| ---------------- | ----------------------------------------------- | -------------------------- |
| Star icon        | Filled (favorite) / Outline                     | Toggle favorite status     |
| Model name       | Display name                                    | Click to select model      |
| Provider badge   | Provider icon + name                            | Visual grouping            |
| Pricing          | Input/Output cost per million tokens            | Displayed for cloud models |
| Status badge     | "Running" / "Available" / "Connected" / "Error" | For local models           |
| Capability icons | Tool, Vision, Code                              | Shows model capabilities   |
| Context window   | Token count                                     | "200K context" or similar  |

## 4.5 Agent Mode Interface

### 4.5.1 Agentic Loop Status Bar

**Purpose**: Shows real-time status of autonomous agent execution.

**Component**: `AgenticLoopStatusBar.tsx`

**Layout** (displayed above chat input when agent is active):

```
+------------------------------------------------------------------+
| Agent Active                                          [Pause][Stop]|
| Step 5/12 | Elapsed: 2m 34s | Tools: 8 | Tokens: 45,234          |
| Current: Executing Bash(npm test --coverage)                       |
| Pending: 3 messages from user                                      |
+------------------------------------------------------------------+
```

**Component Inventory**:

| Element          | Type                 | Content                                               |
| ---------------- | -------------------- | ----------------------------------------------------- |
| Status label     | Text (bold)          | "Agent Active" / "Agent Paused" / "Awaiting Approval" |
| Step counter     | Text                 | "Step N/M" (estimated total)                          |
| Elapsed timer    | Text                 | "Elapsed: Xm Ys" (real-time updating)                 |
| Tool counter     | Text                 | "Tools: N" (tools executed this loop)                 |
| Token counter    | Text                 | "Tokens: N" (tokens consumed this loop)               |
| Current action   | Text                 | "Current: {action description}"                       |
| Pending messages | Badge                | "N messages from user" (queued while agent runs)      |
| Pause button     | Button               | Pauses agent after current step                       |
| Stop button      | Button (destructive) | Terminates agent loop immediately                     |

### 4.5.2 Background Agent Monitor

**Purpose**: Displays and manages background agents that run independently.

**Route**: Accessible via system tray menu or sidebar "Background" section.

**Layout**:

```
+------------------------------------------------------------------+
| Background Agents                                    [+ New Agent] |
+------------------------------------------------------------------+
| [Running] Server Monitor                                           |
|   Started: 2h ago | Tools: 124 | Cost: $0.45                      |
|   Last action: Checked server health (all OK)                      |
|   [View Log] [Pause] [Stop]                                       |
+------------------------------------------------------------------+
| [Running] Email Summarizer                                         |
|   Started: 45m ago | Tools: 12 | Cost: $0.08                      |
|   Last action: Summarized 3 new emails                             |
|   [View Log] [Pause] [Stop]                                       |
+------------------------------------------------------------------+
| [Completed] Code Review                                            |
|   Duration: 15m | Tools: 45 | Cost: $0.32                         |
|   Result: 12 issues found, report generated                       |
|   [View Report] [Restart] [Delete]                                |
+------------------------------------------------------------------+
```

## 4.6 Command Palette

### 4.6.1 Command Palette Dialog

**Purpose**: Fuzzy-search command launcher for power users.

**Component**: `CommandPalette.tsx`

**Trigger**: `Ctrl+K`

**Layout**:

```
+------------------------------------------+
| > [Search commands...]                    |
+------------------------------------------+
| Recent                                    |
|   New Conversation          Ctrl+N        |
|   Switch to Claude 3.5     --             |
|   Open Settings             Ctrl+,        |
+------------------------------------------+
| Commands                                  |
|   New Conversation          Ctrl+N        |
|   Toggle Sidebar            Ctrl+/        |
|   Open Settings             Ctrl+,        |
|   Switch Model              --            |
|   Clear History             --            |
|   Export Conversation        --            |
|   Toggle Dark Mode           --            |
|   Open Terminal              --            |
|   Start Agent               --             |
|   Check for Updates          --            |
+------------------------------------------+
```

**Behavior**:

- Opens as centered modal overlay
- Fuzzy search across all commands and recent conversations
- Arrow keys navigate; Enter selects; Escape closes
- Commands show keyboard shortcuts where available
- Recently used commands shown first
- Supports ">" prefix for commands-only mode (no conversation search)

## 4.7 Keyboard Shortcuts Dialog

### 4.7.1 Keyboard Shortcuts Reference

**Purpose**: Displays all available keyboard shortcuts with Linux-specific bindings.

**Component**: `KeyboardShortcutsDialog.tsx`

**Trigger**: `Ctrl+?` or `Ctrl+Shift+/`

**Layout**:

```
+------------------------------------------+
| Keyboard Shortcuts           [X Close]    |
+------------------------------------------+
| General                                   |
|   New Conversation       Ctrl+N           |
|   New Window             Ctrl+Shift+N     |
|   Close Conversation     Ctrl+W           |
|   Quit Application       Ctrl+Q           |
|   Toggle Sidebar         Ctrl+/           |
|   Command Palette        Ctrl+K           |
|   Settings               Ctrl+,           |
|   Toggle Fullscreen      F11              |
|   Zoom In                Ctrl++           |
|   Zoom Out               Ctrl+-           |
|   Reset Zoom             Ctrl+0           |
+------------------------------------------+
| Chat                                      |
|   Send Message           Ctrl+Enter       |
|   New Line               Shift+Enter      |
|   Stop Generation        Escape           |
|   Regenerate             Ctrl+Shift+R     |
|   Edit Last Message      Ctrl+Up          |
|   Focus Chat Input       Ctrl+L           |
|   Clear Chat             Ctrl+Shift+K     |
+------------------------------------------+
| Navigation                                |
|   Next Conversation      Ctrl+Tab         |
|   Prev Conversation      Ctrl+Shift+Tab   |
|   Go to Conversation     Ctrl+G           |
|   Search Conversations   Ctrl+F           |
+------------------------------------------+
| Agent                                     |
|   Toggle Agent Mode      Ctrl+Shift+A     |
|   Pause Agent            Ctrl+Shift+P     |
|   Stop Agent             Ctrl+Shift+S     |
|   Approve Tool           Enter (in modal) |
|   Deny Tool              Escape (in modal)|
+------------------------------------------+
| Voice                                     |
|   Push-to-Talk           Ctrl+Space       |
|   Toggle Recording       Ctrl+Shift+V     |
+------------------------------------------+
| Developer                                 |
|   Toggle DevTools        Ctrl+Shift+I     |
|   Reload                 Ctrl+R           |
|   Hard Reload            Ctrl+Shift+R     |
+------------------------------------------+
```

**Linux-Specific Notes**:

- All shortcuts use `Ctrl` instead of `Cmd` (macOS)
- `Super`/`Meta` key avoided to prevent conflicts with window manager bindings
- In tiling WMs, `Ctrl+Shift+N` (new window) may conflict with WM keybindings; users should configure WM to passthrough
- Global shortcuts (push-to-talk) require X11 or compositor support on Wayland

## 4.8 Governance and Audit

### 4.8.1 Audit Log

**Purpose**: View and search the complete audit trail of agent actions.

**Component**: `AuditLog.tsx`

**Layout**:

```
+------------------------------------------------------------------+
| Audit Log                                                          |
+------------------------------------------------------------------+
| [Search logs...]  [Date: All v]  [Tool: All v]  [Status: All v]  |
+------------------------------------------------------------------+
| Timestamp           | Tool     | Args          | Status | Duration|
| 2026-03-09 14:30:01 | Bash     | npm test      | Pass   | 3.2s   |
| 2026-03-09 14:29:58 | Read     | package.json  | Pass   | 12ms   |
| 2026-03-09 14:29:55 | Write    | test.ts       | Pass   | 45ms   |
| 2026-03-09 14:29:50 | Bash     | git status    | Pass   | 234ms  |
| 2026-03-09 14:25:12 | Navigate | github.com    | Pass   | 1.2s   |
| 2026-03-09 14:25:00 | Search   | "auth token"  | Pass   | 890ms  |
+------------------------------------------------------------------+
| Showing 1-50 of 1,234 entries           [< Prev] [Page 1] [Next >]|
+------------------------------------------------------------------+
```

### 4.8.2 Safety Policies

**Purpose**: View and configure safety policies for tool execution.

**Component**: `SafetyPolicies.tsx`

**Layout**:

```
+------------------------------------------+
| Safety Policies                           |
+------------------------------------------+
| Denied Paths (15 patterns)                |
|   /etc/shadow                             |
|   /etc/passwd                             |
|   ~/.ssh/                                 |
|   ~/.gnupg/                               |
|   ~/.config/agiworkforce/secrets/         |
|   /boot/                                  |
|   /sys/                                   |
|   /proc/                                  |
|   /dev/                                   |
|   /mnt/                                   |
|   /media/                                 |
|   /run/user/                              |
|   .env                                    |
|   .env.local                              |
|   credentials.json                        |
|   [+ Add Pattern]                         |
|                                           |
| Denied Commands (safety patterns)         |
|   rm -rf / (recursive root delete)       |
|   mkfs (filesystem format)               |
|   dd (disk operations)                   |
|   :(){ :|:& };: (fork bomb)             |
|   > /dev/sda (disk overwrite)           |
|   chmod -R 777 / (permission reset)      |
|   [+ Add Pattern]                         |
|                                           |
| Rate Limits                               |
|   Max tool calls per minute: [30]        |
|   Max concurrent agents: [10]            |
|   Max file writes per minute: [20]       |
|   Max shell commands per minute: [15]    |
+------------------------------------------+
```

## 4.9 Research Panel

### 4.9.1 Deep Research View

**Purpose**: Dedicated interface for multi-step research tasks.

**Component**: `DeepResearchPanel.tsx`

**Layout**:

```
+------------------------------------------------------------------+
| Deep Research                                          [Settings]  |
+------------------------------------------------------------------+
| Research Query:                                                    |
| [Compare Docker Compose vs Kubernetes for small teams           ]  |
| [Start Research]                                                   |
+------------------------------------------------------------------+
| Research Progress                                                  |
|   Step 1: Analyzing query scope          [Completed]              |
|   Step 2: Searching web sources          [Completed] (12 sources)|
|   Step 3: Analyzing Docker Compose       [In Progress]            |
|   Step 4: Analyzing Kubernetes           [Queued]                 |
|   Step 5: Comparing features             [Queued]                 |
|   Step 6: Writing report                 [Queued]                 |
+------------------------------------------------------------------+
| Sources Found (12)                                                 |
|   [1] kubernetes.io - Official docs              [Relevant: High]|
|   [2] docs.docker.com - Compose overview         [Relevant: High]|
|   [3] stackoverflow.com - Comparison thread      [Relevant: Med] |
|   ...                                                             |
+------------------------------------------------------------------+
| Report Preview                                                     |
|   # Docker Compose vs Kubernetes for Small Teams                  |
|   ## Executive Summary                                             |
|   ...                                                              |
|   [Export as Markdown] [Export as PDF] [Copy]                     |
+------------------------------------------------------------------+
```

## 4.10 Canvas and Artifacts

### 4.10.1 Artifact Renderer

**Purpose**: Renders and manages code artifacts, documents, and visual outputs.

**Component**: `ArtifactRenderer.tsx`

**Layout**:

```
+------------------------------------------+
| Artifact: server.py          [v3 of 3]   |
+------------------------------------------+
| [Code] [Preview] [Diff]     [Copy] [Save]|
+------------------------------------------+
| 1  from flask import Flask               |
| 2  import os                             |
| 3                                         |
| 4  app = Flask(__name__)                  |
| 5                                         |
| 6  @app.route('/')                       |
| 7  def hello():                          |
| 8      return 'Hello, World!'            |
| 9                                         |
| 10 if __name__ == '__main__':            |
| 11     app.run(debug=True)              |
+------------------------------------------+
| Language: Python | Lines: 11 | Size: 245B|
+------------------------------------------+
```

**Features**:

- Syntax highlighting via CodeBlock component
- Version history navigation (v1, v2, v3...)
- Diff view between versions
- Copy to clipboard
- Save to file (GTK file save dialog)
- Live preview for HTML/CSS/Markdown
- Run button for executable code

## 4.11 Terminal Interface

### 4.11.1 Integrated Terminal

**Purpose**: Embedded terminal for command execution and output viewing.

**Component**: Located in `components/Terminal/`

**Layout**:

```
+------------------------------------------------------------------+
| Terminal                        [+ New Tab] [Split] [Close]       |
+------------------------------------------------------------------+
| user@hostname:~/project$ npm test                                  |
|                                                                    |
| PASS  src/__tests__/auth.test.ts                                  |
| PASS  src/__tests__/chat.test.ts                                  |
|                                                                    |
| Test Suites: 2 passed, 2 total                                    |
| Tests:       14 passed, 14 total                                  |
| Snapshots:   0 total                                               |
| Time:        3.456 s                                               |
|                                                                    |
| user@hostname:~/project$ _                                        |
+------------------------------------------------------------------+
```

**Linux-Specific Behavior**:

- Spawns user's default shell from `$SHELL` environment variable
- Falls back to `/bin/bash` then `/bin/sh`
- Uses `portable-pty` for pseudo-terminal allocation
- Supports 256-color and true-color via TERM environment variable
- Respects user's shell configuration (`.bashrc`, `.zshrc`, etc.)
- Supports tmux/screen sessions within the embedded terminal
- Working directory inherits from project context or defaults to `$HOME`

## 4.12 Skill Marketplace

### 4.12.1 Marketplace View

**Purpose**: Browse, search, and install AI skills.

**Component**: Located in `components/SkillMarketplace/`

**Layout**:

```
+------------------------------------------------------------------+
| Skill Marketplace                                    [Grid][List] |
+------------------------------------------------------------------+
| [Search skills...]  [Category: All v]  [Sort: Popular v]          |
+------------------------------------------------------------------+
| Categories: All | Code | Research | Writing | Analysis | Data |   |
|              Business | Creative | Education | Healthcare         |
+------------------------------------------------------------------+
|                                                                    |
| +------------------+  +------------------+  +------------------+ |
| | Code Reviewer    |  | Data Analyst     |  | Technical Writer | |
| | [Code icon]      |  | [Chart icon]     |  | [Doc icon]       | |
| | Review code for  |  | Analyze data     |  | Write technical  | |
| | quality, bugs,   |  | sets, generate   |  | documentation    | |
| | and best prac... |  | insights, vis... |  | from code and... | |
| | Rating: 4.8/5    |  | Rating: 4.6/5    |  | Rating: 4.5/5    | |
| | [Install]        |  | [Installed]      |  | [Install]        | |
| +------------------+  +------------------+  +------------------+ |
|                                                                    |
| +------------------+  +------------------+  +------------------+ |
| | Email Drafter    |  | Legal Reviewer   |  | Math Tutor       | |
| | ...              |  | ...              |  | ...              | |
| +------------------+  +------------------+  +------------------+ |
|                                                                    |
| Showing 1-9 of 140 skills          [< Prev] [Page 1] [Next >]   |
+------------------------------------------------------------------+
```

## 4.13 Onboarding Flow

### 4.13.1 First Launch Experience

**Purpose**: Guide new users through initial setup.

**Screens** (sequential):

**Screen 1: Welcome**

```
+------------------------------------------+
|           Welcome to AGI Workforce        |
|                                           |
|    The AI desktop platform that works     |
|    with any model you choose.             |
|                                           |
|    [Get Started]                          |
+------------------------------------------+
```

**Screen 2: API Key Setup**

```
+------------------------------------------+
| Set Up Your First AI Provider             |
|                                           |
| Choose one or more providers to start:    |
|                                           |
| [Anthropic]  Recommended for most users   |
| [OpenAI]     GPT-4o, o1 series           |
| [Google]     Gemini models               |
| [Ollama]     Free, local, private        |
|                                           |
| Or connect any provider later in Settings.|
|                                           |
| [Next]                [Skip for now]      |
+------------------------------------------+
```

**Screen 3: Local Models (Linux-specific)**

```
+------------------------------------------+
| Local Model Setup                         |
|                                           |
| Detected: Ollama running on :11434       |
|   Models available:                       |
|     llama3:8b (4.7 GB)                   |
|     codellama:13b (7.4 GB)               |
|                                           |
| [ ] Use local models by default          |
|     (Best for privacy; no data leaves    |
|      your machine)                        |
|                                           |
| [Next]                                    |
+------------------------------------------+
```

**Screen 4: Permissions**

```
+------------------------------------------+
| Agent Permissions                         |
|                                           |
| Choose your default safety level:         |
|                                           |
| [Cautious]                                |
|   Ask before every tool execution         |
|   Recommended for new users               |
|                                           |
| [Balanced]                                |
|   Auto-approve reads; ask for writes      |
|   Recommended for developers              |
|                                           |
| [Autonomous]                              |
|   Auto-approve all tools                  |
|   For experienced users only              |
|                                           |
| You can change this anytime in Settings.  |
|                                           |
| [Finish Setup]                            |
+------------------------------------------+
```

**Screen 5: Ready**

```
+------------------------------------------+
|           You're all set!                 |
|                                           |
|    Start a conversation with any AI       |
|    model, or try one of these:            |
|                                           |
|    "Explain my Docker setup"              |
|    "Review my latest git changes"         |
|    "Find all TODO comments in my code"    |
|    "Set up a cron job for backups"        |
|                                           |
|    [Start Chatting]                       |
+------------------------------------------+
```

## 4.14 System Tray

### 4.14.1 Tray Icon and Menu

**Purpose**: Persistent system tray presence for quick access and background agent visibility.

**Implementation**: libayatana-appindicator3 via Tauri tray plugin

**Menu Items**:

| Item                         | Icon               | Action                                           |
| ---------------------------- | ------------------ | ------------------------------------------------ |
| "Open AGI Workforce"         | App icon           | Activates/focuses main window                    |
| "New Conversation"           | Plus               | Creates new conversation and focuses window      |
| Separator                    | ---                | ---                                              |
| "Background Agents ({n})"    | Submenu arrow      | Expands to list running background agents        |
| " Agent 1: Server Monitor"   | Status dot (green) | Click to view agent log                          |
| " Agent 2: Email Summarizer" | Status dot (green) | Click to view agent log                          |
| " Stop All Agents"           | Stop icon          | Stops all background agents                      |
| Separator                    | ---                | ---                                              |
| "Quick Query"                | Lightning bolt     | Opens floating quick query input                 |
| "Take Screenshot"            | Camera             | Captures screen and opens in new conversation    |
| Separator                    | ---                | ---                                              |
| "Settings"                   | Gear               | Opens settings panel                             |
| "Check for Updates"          | Download           | Checks for and installs updates                  |
| Separator                    | ---                | ---                                              |
| "Quit"                       | Exit               | Terminates application and all background agents |

**Linux-Specific Behavior**:

- Uses StatusNotifierItem (SNI) protocol via libayatana-appindicator3
- Falls back to legacy XEmbed tray if SNI not supported
- Some tiling WMs (i3, bspwm) require a separate tray application (e.g., `stalonetray`, `trayer`)
- Sway supports `waybar` tray module for SNI icons
- Icon renders as PNG at appropriate DPI (not SVG in tray)
- Left-click toggles window visibility; right-click opens context menu

---

# Section 5: Component Architecture

## 5.1 Frontend Component Tree

```
App (root)
├── ErrorBoundary
│   └── AppLayout
│       ├── Sidebar
│       │   ├── SidebarHeader (logo, new chat)
│       │   ├── ConversationSearch
│       │   ├── ConversationList
│       │   │   └── ConversationItem (repeating)
│       │   ├── SidebarFooter
│       │   │   ├── ModelSelector
│       │   │   ├── UserAvatar
│       │   │   └── SettingsButton
│       │   └── ResizeHandle
│       ├── MainContent (router outlet)
│       │   ├── UnifiedAgenticChat (primary view)
│       │   │   ├── ChatMessageList
│       │   │   │   └── MessageBubble (repeating)
│       │   │   │       ├── UserMessage
│       │   │   │       │   ├── AttachmentPreview
│       │   │   │       │   └── EditableMessage
│       │   │   │       └── AssistantMessage
│       │   │   │           ├── ThinkingBlock
│       │   │   │           ├── ReasoningAccordion
│       │   │   │           ├── CodeBlock
│       │   │   │           ├── ToolTimeline
│       │   │   │           │   └── ToolLabel (repeating)
│       │   │   │           ├── ToolCallCard
│       │   │   │           ├── InlineToolResults
│       │   │   │           ├── CitationBadge
│       │   │   │           ├── ArtifactRenderer
│       │   │   │           └── SourcesFooter
│       │   │   ├── AgenticLoopStatusBar
│       │   │   ├── BudgetTracker
│       │   │   ├── PendingMessagesBubbles
│       │   │   ├── ApprovalModal
│       │   │   ├── RiskConfirmationDialog
│       │   │   └── ChatStream
│       │   │       └── StreamingMessage
│       │   ├── ChatInputArea
│       │   │   ├── ChatInputToolbar
│       │   │   │   ├── FocusSelector
│       │   │   │   ├── AgentModeSwitcher
│       │   │   │   └── ActiveModeTags
│       │   │   ├── TextInput
│       │   │   ├── PlusMenu
│       │   │   ├── SendButton
│       │   │   ├── VoiceInputButton
│       │   │   ├── AttachmentRow
│       │   │   ├── SlashCommandMenu
│       │   │   ├── FileMentionPicker
│       │   │   ├── SkillMentionPicker
│       │   │   ├── PromptSuggestionsDropdown
│       │   │   └── InputFooter
│       │   │       ├── ModelSelectorButton
│       │   │       ├── TokenCounter
│       │   │       └── InputToolbar
│       │   ├── SimpleEmptyState / AdvancedEmptyState
│       │   ├── DragDropOverlay
│       │   └── Sidecar (optional right panel)
│       │       ├── DeepResearchPanel
│       │       ├── ArtifactsView
│       │       ├── ProjectsView
│       │       ├── MediaLab
│       │       └── DynamicSidecar
│       ├── SettingsPanel (modal overlay)
│       │   ├── GeneralSettings
│       │   ├── ApiKeysSettings
│       │   ├── CustomModelsSettings
│       │   ├── AutomationPermissionsSettings
│       │   ├── MCPToolsSettings
│       │   ├── MCPServerSettings
│       │   ├── SkillsPluginsSettings
│       │   ├── PrivacySettings
│       │   ├── FeaturesPrivacySettings
│       │   ├── NotificationsSettings
│       │   ├── VoiceSettings
│       │   ├── ResearchSettings
│       │   ├── UpdateSettings
│       │   ├── MasterPasswordSettings
│       │   ├── AccountSettings
│       │   ├── ModelCard
│       │   ├── ModelComparison
│       │   ├── CostEstimator
│       │   ├── CacheManagement
│       │   ├── AnalyticsSettings
│       │   ├── FavoriteModelsSelector
│       │   ├── TaskRoutingSettings
│       │   ├── CustomInstructionsSettings
│       │   ├── InstructionFilesSettings
│       │   └── AllowedDirectoriesSettings
│       ├── CommandPalette (modal overlay)
│       ├── KeyboardShortcutsDialog (modal overlay)
│       ├── ShareConversationDialog (modal overlay)
│       └── ProjectSettingsDialog (modal overlay)
│   ├── StatusBar
│   │   ├── ModelIndicator
│   │   ├── TokenDisplay
│   │   ├── CostDisplay
│   │   ├── ConnectionStatus
│   │   └── AgentStatusBadge
│   ├── Governance
│   │   ├── AuditLog
│   │   ├── SafetyPolicies
│   │   └── ToolHistoryTable
│   ├── SkillMarketplace
│   │   ├── SkillGrid
│   │   ├── SkillCard (repeating)
│   │   └── SkillDetails
│   ├── Terminal
│   │   ├── TerminalTab (repeating)
│   │   └── TerminalOutput
│   ├── Messaging
│   │   └── MessagingPanel
│   └── Notifications
│       └── NotificationToast (Sonner)
├── VoiceRecordingStatus (overlay)
├── VoiceInputOverlay (overlay)
├── Onboarding (first-launch flow)
├── ModelComparison (standalone view)
├── ROIDashboard
├── FloatingChat (mini chat window)
└── Overlay (screen overlay for computer use)
```

## 5.2 Shared vs Platform-Specific Components

### 5.2.1 Shared Components (Identical Across All Platforms)

All React components in the `components/` directory are shared across macOS, Windows, and Linux. The Tauri framework abstracts platform differences at the Rust layer, and the WebView renders the same React/TypeScript code on all platforms.

**No platform-specific React components exist** for the Linux build. All Linux-specific behavior is handled at:

1. The Rust backend layer (via `#[cfg(target_os = "linux")]` and `#[cfg(not(any(target_os = "windows", target_os = "macos")))]` blocks)
2. CSS media queries (for theme integration)
3. Conditional rendering based on platform detection (e.g., showing Wayland/X11 indicator)

### 5.2.2 Platform Detection in Frontend

The frontend detects the platform via Tauri's `os` API and conditionally renders:

| Detection                                | Purpose                         | Example                                     |
| ---------------------------------------- | ------------------------------- | ------------------------------------------- |
| `navigator.userAgent` contains "Linux"   | Platform-specific UI labels     | "Ctrl" instead of "Cmd" for shortcuts       |
| Display server query (via Rust IPC)      | Wayland/X11 indicator           | Status bar display server badge             |
| Package manager detection (via Rust IPC) | Optional dependency suggestions | "Install wmctrl for window management"      |
| Audio system detection (via Rust IPC)    | Audio device labels             | "PulseAudio" / "PipeWire" in Voice Settings |

## 5.3 State Management

### 5.3.1 Zustand Store Inventory

The application uses 50+ Zustand stores organized by domain. All stores use Zustand v5 with Immer middleware for immutable state updates and Persist middleware for localStorage persistence.

**Core Stores**:

| Store                   | File                       | Purpose                                    | Persisted           |
| ----------------------- | -------------------------- | ------------------------------------------ | ------------------- |
| `unifiedChatStore`      | `unifiedChatStore.ts`      | Chat messages, conversations, active model | Yes                 |
| `settingsStore`         | `settingsStore.ts`         | Application configuration                  | Yes (migration v10) |
| `modelStore`            | `modelStore.ts`            | Model selection and configuration          | Yes                 |
| `mcpStore`              | `mcpStore.ts`              | MCP server connections and tool state      | Yes                 |
| `mcpbStore`             | `mcpbStore.ts`             | MCP bridge state                           | Yes                 |
| `mcpServerStore`        | `mcpServerStore.ts`        | MCP server management                      | Yes                 |
| `mcpAppStore`           | `mcpAppStore.ts`           | MCP application state                      | Yes                 |
| `authCoreStore`         | `authCoreStore.ts`         | Authentication state                       | Yes                 |
| `subscriptionPlanStore` | `subscriptionPlanStore.ts` | Subscription tier                          | Yes                 |
| `deviceLinkStore`       | `deviceLinkStore.ts`       | Mobile device pairing                      | Yes                 |
| `featureFlagStore`      | `featureFlagStore.ts`      | Feature flags                              | Yes                 |

**Agent and Execution Stores**:

| Store                       | File                           | Purpose                     | Persisted |
| --------------------------- | ------------------------------ | --------------------------- | --------- |
| `agentTaskStore`            | `agentTaskStore.ts`            | Agent task queue and status | No        |
| `executionStore`            | `executionStore.ts`            | Tool execution state        | No        |
| `executionPreferencesStore` | `executionPreferencesStore.ts` | Execution preferences       | Yes       |
| `automationStore`           | `automationStore.ts`           | Desktop automation state    | No        |
| `computerUseStore`          | `computerUseStore.ts`          | Computer use session state  | No        |
| `schedulerStore`            | `schedulerStore.ts`            | Background scheduling       | Yes       |

**Chat Sub-stores** (in `stores/chat/`):

| Store       | File                | Purpose                                          | Persisted |
| ----------- | ------------------- | ------------------------------------------------ | --------- |
| `toolStore` | `chat/toolStore.ts` | Tool execution tracking; listens on `tool:event` | No        |

**UI and Preference Stores**:

| Store                      | File                          | Purpose                    | Persisted |
| -------------------------- | ----------------------------- | -------------------------- | --------- |
| `appPreferencesStore`      | `appPreferencesStore.ts`      | App-level preferences      | Yes       |
| `chatPreferencesStore`     | `chatPreferencesStore.ts`     | Chat-specific preferences  | Yes       |
| `securityPreferencesStore` | `securityPreferencesStore.ts` | Security settings          | Yes       |
| `llmConfigStore`           | `llmConfigStore.ts`           | LLM configuration          | Yes       |
| `tokenBudgetStore`         | `tokenBudgetStore.ts`         | Token budget limits        | Yes       |
| `costStore`                | `costStore.ts`                | Cost tracking              | Yes       |
| `billingStore`             | `billingStore.ts`             | Billing state              | Yes       |
| `billingUsage`             | `billingUsage.ts`             | Usage tracking for billing | No        |
| `roiStore`                 | `roiStore.ts`                 | ROI metrics                | Yes       |
| `usageTrackingStore`       | `usageTrackingStore.ts`       | Usage analytics            | Yes       |
| `analyticsMetricsStore`    | `analyticsMetricsStore.ts`    | Analytics metrics          | Yes       |
| `skillMarketplaceStore`    | `skillMarketplaceStore.ts`    | Marketplace state          | Yes       |

**Feature-Specific Stores**:

| Store                     | File                         | Purpose                            | Persisted |
| ------------------------- | ---------------------------- | ---------------------------------- | --------- |
| `voiceInputStore`         | `voiceInputStore.ts`         | Voice input state                  | No        |
| `terminalStore`           | `terminalStore.ts`           | Terminal sessions                  | No        |
| `filesystemStore`         | `filesystemStore.ts`         | File system browser                | No        |
| `browserStore`            | `browserStore.ts`            | Browser automation                 | No        |
| `calendarStore`           | `calendarStore.ts`           | Calendar integration               | Yes       |
| `emailStore`              | `emailStore.ts`              | Email integration                  | Yes       |
| `cloudStore`              | `cloudStore.ts`              | Cloud storage                      | Yes       |
| `memoryStore`             | `memoryStore.ts`             | Agent memory                       | No        |
| `researchStore`           | `researchStore.ts`           | Research sessions                  | No        |
| `canvasStore`             | `canvasStore.ts`             | Canvas/artifact state              | No        |
| `codeStore`               | `codeStore.ts`               | Code editing state                 | No        |
| `documentStore`           | `documentStore.ts`           | Document processing                | No        |
| `projectStore`            | `projectStore.ts`            | Project context                    | Yes       |
| `teamStore`               | `teamStore.ts`               | Team collaboration                 | Yes       |
| `governanceStore`         | `governanceStore.ts`         | Governance/audit                   | No        |
| `productivityStore`       | `productivityStore.ts`       | Productivity features              | Yes       |
| `customInstructionsStore` | `customInstructionsStore.ts` | Custom instruction files           | Yes       |
| `connectorsStore`         | `connectorsStore.ts`         | External connectors                | Yes       |
| `connectionStore`         | `connectionStore.ts`         | Connection status                  | No        |
| `databaseStore`           | `databaseStore.ts`           | Database connections               | Yes       |
| `mediaGenerationStore`    | `mediaGenerationStore.ts`    | Media generation                   | No        |
| `editingStore`            | `editingStore.ts`            | Message editing                    | No        |
| `templateStore`           | `templateStore.ts`           | Prompt templates                   | Yes       |
| `updaterStore`            | `updaterStore.ts`            | Auto-update state                  | No        |
| `settingsDialogStore`     | `settingsDialogStore.ts`     | Settings dialog open/close         | No        |
| `ui`                      | `ui.ts`                      | General UI state (sidebar, modals) | No        |
| `artifactStore`           | `artifactStore.ts`           | Artifact management                | No        |
| `apiStore`                | `apiStore.ts`                | API connection state               | No        |

### 5.3.2 Store Persistence on Linux

Zustand stores persist to WebKitGTK's localStorage, which is stored at:

```
~/.local/share/com.agiworkforce.desktop/webkit/localstorage/
```

This location follows XDG base directory specification when `XDG_DATA_HOME` is set, falling back to `~/.local/share/` by default.

**Persistence limits**:

- WebKitGTK localStorage: 5 MB per origin
- Maximum ID mapping cap per store: 1,000 entries (prevents unbounded growth)
- Migration support: persist middleware handles schema migrations (currently at version 10)

## 5.4 React Hooks Inventory

### 5.4.1 Custom Hooks

| Hook                          | File                             | Purpose                                    |
| ----------------------------- | -------------------------------- | ------------------------------------------ |
| `useAgenticEvents`            | `useAgenticEvents.ts`            | Subscribe to agentic loop lifecycle events |
| `useAgentLoopEvents`          | `useAgentLoopEvents.ts`          | Agent loop start/status/end event handling |
| `useToolEvents`               | `useToolEvents.ts`               | Subscribe to `tool:event` channel          |
| `useNotificationEvents`       | `useNotificationEvents.ts`       | System notification events                 |
| `useFileTerminalEvents`       | `useFileTerminalEvents.ts`       | File and terminal operation events         |
| `useExtensionBridgeEvents`    | `useExtensionBridgeEvents.ts`    | Chrome extension bridge events             |
| `useSendMessage`              | `useSendMessage.ts`              | Chat message sending logic                 |
| `useStopGeneration`           | `useStopGeneration.ts`           | Stop streaming/agent generation            |
| `useStreamBuffer`             | `useStreamBuffer.ts`             | Buffer and render streaming text           |
| `useTauriStreamListeners`     | `useTauriStreamListeners.ts`     | Tauri SSE stream event listeners           |
| `useKeyboardShortcuts`        | `useKeyboardShortcuts.ts`        | Global keyboard shortcut registration      |
| `useGlobalVoicePTT`           | `useGlobalVoicePTT.ts`           | Global push-to-talk hotkey                 |
| `useVoiceInput`               | `useVoiceInput.ts`               | Voice recording and transcription          |
| `useVoiceHotkey`              | `useVoiceHotkey.ts`              | Voice hotkey detection                     |
| `useVoiceTranscription`       | `useVoiceTranscription.ts`       | Audio-to-text conversion                   |
| `useTTS`                      | `useTTS.ts`                      | Text-to-speech playback                    |
| `useMCP`                      | `useMCP.ts`                      | MCP server connection management           |
| `useTerminal`                 | `useTerminal.ts`                 | Terminal session management                |
| `useScreenCapture`            | `useScreenCapture.ts`            | Screen capture operations                  |
| `useOCR`                      | `useOCR.ts`                      | OCR text extraction                        |
| `useWindowManager`            | `useWindowManager.ts`            | Window management operations               |
| `useBrowserAutomation`        | `useBrowserAutomation.ts`        | CDP browser automation                     |
| `useFileOperations`           | `useFileOperations.ts`           | File system operations                     |
| `useGit`                      | `useGit.ts`                      | Git operations                             |
| `useDocuments`                | `useDocuments.ts`                | Document processing                        |
| `useEmail`                    | `useEmail.ts`                    | Email IMAP/SMTP operations                 |
| `useCalendar`                 | `useCalendar.ts`                 | Calendar API operations                    |
| `useCloudStorage`             | `useCloudStorage.ts`             | Cloud storage operations                   |
| `useMemory`                   | `useMemory.ts`                   | Agent memory operations                    |
| `useMemoryIntegration`        | `useMemoryIntegration.ts`        | Memory integration with chat               |
| `useScheduler`                | `useScheduler.ts`                | Background scheduling                      |
| `useBackgroundTasks`          | `useBackgroundTasks.ts`          | Background task management                 |
| `useCheckpoints`              | `useCheckpoints.ts`              | Conversation checkpoints                   |
| `useSlashCommands`            | `useSlashCommands.ts`            | Slash command handling                     |
| `useSlashCommandAutocomplete` | `useSlashCommandAutocomplete.ts` | Slash command autocomplete                 |
| `useCommandAutocomplete`      | `useCommandAutocomplete.ts`      | Command palette autocomplete               |
| `useApiPromptCompletion`      | `useApiPromptCompletion.ts`      | Ghost-text prompt completion               |
| `usePromptSuggestions`        | `usePromptSuggestions.ts`        | Smart prompt suggestions                   |
| `useModelCapabilities`        | `useModelCapabilities.ts`        | Query model capabilities                   |
| `useAnalytics`                | `useAnalytics.ts`                | Usage analytics                            |
| `useAutoCorrection`           | `useAutoCorrection.ts`           | Auto-correction features                   |
| `useApprovalActions`          | `useApprovalActions.ts`          | Tool approval workflow                     |
| `useAutomationEvents`         | `useAutomationEvents.ts`         | Automation event handling                  |
| `useReducedMotion`            | `useReducedMotion.ts`            | Accessibility motion preference            |
| `useDeepLink`                 | `useDeepLink.ts`                 | Deep link URL handling                     |
| `useNotifications`            | `useNotifications.ts`            | Notification management                    |
| `useTeam`                     | `useTeam.ts`                     | Team collaboration                         |
| `useWorkflows`                | `useWorkflows.ts`                | Workflow management                        |
| `useOrchestratorActions`      | `useOrchestratorActions.ts`      | Agent orchestration actions                |
| `useLSP`                      | `useLSP.ts`                      | Language Server Protocol                   |
| `useTrayQuickActions`         | `useTrayQuickActions.ts`         | System tray quick actions                  |
| `useUpdater`                  | `useUpdater.ts`                  | Auto-update management                     |
| `useToast`                    | `useToast.ts`                    | Toast notification helper                  |
| `useTimeout`                  | `useTimeout.ts`                  | Timeout utility hook                       |
| `useCreditRefresh`            | `useCreditRefresh.ts`            | Credit balance refresh                     |

## 5.5 TypeScript Interfaces

### 5.5.1 Key Data Models

```typescript
// Conversation model
interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  modelId: string;
  provider: string;
  messages: Message[];
  metadata: ConversationMetadata;
}

// Message model
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  modelId?: string;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  thinking?: string;
  citations?: Citation[];
  costUsd?: number;
  tokenCount?: number;
}

// Tool execution event (from Rust via tool:event channel)
interface ToolEvent {
  type: 'Started' | 'Progress' | 'Completed';
  toolName: string;
  displayName: string;
  displayArgs?: string;
  conversationId: string;
  messageId: string;
  durationMs?: number;
  resultPreview?: string;
  error?: string;
}

// MCP server configuration
interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  apiKey?: string;
  env?: Record<string, string>;
  enabled: boolean;
  permission: 'ask' | 'auto-approve-readonly' | 'auto-approve-all';
}

// Custom model configuration
interface CustomModelConfig {
  id: string;
  name: string;
  provider: 'openai-compatible' | 'anthropic-compatible' | 'ollama';
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolUse?: boolean;
  subscriptionLevel?: number;
}

// Agent task
interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  toolsExecuted: number;
  tokensConsumed: number;
  costUsd: number;
  error?: string;
}

// Platform info (Linux-specific fields)
interface PlatformInfo {
  os: 'linux';
  arch: 'x86_64' | 'aarch64';
  displayServer: 'x11' | 'wayland' | 'unknown';
  desktopEnvironment: string;
  distribution: string;
  distributionVersion: string;
  kernelVersion: string;
  audioSystem: 'pulseaudio' | 'pipewire' | 'alsa' | 'unknown';
  gpuInfo?: GpuInfo;
}
```

---

# Section 6: Data Flow & API Connections

## 6.1 Frontend-Backend Communication (Tauri IPC)

### 6.1.1 Communication Pattern

All frontend-to-backend communication uses Tauri's `invoke()` IPC mechanism:

```
React Component
    │
    ▼ (hook or direct call)
invoke('commandName', { paramKey: value })
    │
    ▼ (Tauri IPC bridge)
#[tauri::command]
async fn command_name(param_key: String) -> Result<T, String>
    │
    ▼ (business logic)
Rust handler processes request
    │
    ▼ (return value serialized to JSON)
Result<T> → React component receives Promise<T>
```

**Critical IPC Rule**: All `invoke()` calls MUST use camelCase parameter keys. Tauri automatically converts from Rust snake_case. Using snake_case in `invoke()` causes silent parameter loss.

### 6.1.2 Event Channels (Rust to Frontend)

Rust-to-frontend communication uses Tauri event channels:

| Channel                    | Payload                                                                             | Frontend Listener             |
| -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `tool:event`               | `ToolEvent { type, toolName, displayName, displayArgs, durationMs, resultPreview }` | `chat/toolStore.ts`           |
| `agentic:loop-started`     | `{ conversationId, modelId }`                                                       | `useAgentLoopEvents.ts`       |
| `agentic:loop-status`      | `{ step, totalSteps, currentAction }`                                               | `useAgentLoopEvents.ts`       |
| `agentic:loop-ended`       | `{ conversationId, reason, toolsExecuted, tokensUsed }`                             | `useAgentLoopEvents.ts`       |
| `agentic:message-consumed` | `{ messageId }`                                                                     | `useAgentLoopEvents.ts`       |
| `chat:stream-chunk`        | `{ conversationId, chunk, done }`                                                   | `useTauriStreamListeners.ts`  |
| `notification:show`        | `{ title, body, icon }`                                                             | `useNotificationEvents.ts`    |
| `file:changed`             | `{ path, operation }`                                                               | `useFileTerminalEvents.ts`    |
| `terminal:output`          | `{ sessionId, data }`                                                               | `useFileTerminalEvents.ts`    |
| `extension:message`        | `{ type, data }`                                                                    | `useExtensionBridgeEvents.ts` |

### 6.1.3 Key IPC Commands

#### Chat Commands (`sys/commands/chat/`)

| Command                | Parameters                                            | Return           | Description               |
| ---------------------- | ----------------------------------------------------- | ---------------- | ------------------------- |
| `send_message`         | `{ conversationId, content, attachments?, modelId? }` | `Message`        | Send chat message         |
| `get_conversations`    | `{}`                                                  | `Conversation[]` | List all conversations    |
| `get_conversation`     | `{ conversationId }`                                  | `Conversation`   | Get single conversation   |
| `create_conversation`  | `{ title?, modelId? }`                                | `Conversation`   | Create new conversation   |
| `delete_conversation`  | `{ conversationId }`                                  | `void`           | Delete conversation       |
| `get_messages`         | `{ conversationId, limit?, offset? }`                 | `Message[]`      | Get conversation messages |
| `search_conversations` | `{ query }`                                           | `Conversation[]` | Full-text search          |
| `export_conversation`  | `{ conversationId, format }`                          | `string`         | Export as MD/JSON         |
| `compact_conversation` | `{ conversationId }`                                  | `void`           | Summarize and compact     |
| `stop_generation`      | `{ conversationId }`                                  | `void`           | Stop streaming response   |
| `get_pending_messages` | `{ conversationId }`                                  | `Message[]`      | Get queued user messages  |

#### LLM Commands (`sys/commands/llm.rs`)

| Command                  | Parameters             | Return              | Description               |
| ------------------------ | ---------------------- | ------------------- | ------------------------- |
| `get_available_models`   | `{}`                   | `ModelInfo[]`       | List all available models |
| `validate_api_key`       | `{ provider, apiKey }` | `boolean`           | Test API key validity     |
| `set_api_key`            | `{ provider, apiKey }` | `void`              | Store encrypted API key   |
| `remove_api_key`         | `{ provider }`         | `void`              | Remove stored API key     |
| `get_model_capabilities` | `{ modelId }`          | `ModelCapabilities` | Query model features      |
| `detect_local_models`    | `{}`                   | `LocalModelInfo[]`  | Scan for Ollama/LM Studio |

#### Tool Commands (`sys/commands/tool_confirmation.rs`)

| Command               | Parameters     | Return | Description            |
| --------------------- | -------------- | ------ | ---------------------- |
| `approve_tool_call`   | `{ callId }`   | `void` | Approve pending tool   |
| `deny_tool_call`      | `{ callId }`   | `void` | Deny pending tool      |
| `always_approve_tool` | `{ toolName }` | `void` | Auto-approve tool type |

#### MCP Commands (`sys/commands/mcp.rs`)

| Command                 | Parameters                     | Return            | Description           |
| ----------------------- | ------------------------------ | ----------------- | --------------------- |
| `connect_mcp_server`    | `{ config }`                   | `McpConnection`   | Connect to MCP server |
| `disconnect_mcp_server` | `{ serverId }`                 | `void`            | Disconnect server     |
| `list_mcp_tools`        | `{ serverId }`                 | `McpTool[]`       | List available tools  |
| `execute_mcp_tool`      | `{ serverId, toolName, args }` | `ToolResult`      | Execute MCP tool      |
| `get_mcp_server_status` | `{ serverId }`                 | `McpServerStatus` | Get connection status |

#### File Operations (`sys/commands/file_ops.rs`)

| Command              | Parameters               | Return        | Description             |
| -------------------- | ------------------------ | ------------- | ----------------------- |
| `read_file`          | `{ path }`               | `string`      | Read file contents      |
| `write_file`         | `{ path, content }`      | `void`        | Write file              |
| `list_directory`     | `{ path }`               | `FileEntry[]` | List directory contents |
| `open_file_external` | `{ path }`               | `void`        | Open with `xdg-open`    |
| `search_files`       | `{ directory, pattern }` | `FileEntry[]` | Search files            |
| `get_file_info`      | `{ path }`               | `FileInfo`    | Get file metadata       |

#### Scheduler Commands (`sys/commands/scheduler.rs`)

| Command           | Parameters                                      | Return       | Description           |
| ----------------- | ----------------------------------------------- | ------------ | --------------------- |
| `create_schedule` | `{ cronExpression, taskDescription, modelId? }` | `Schedule`   | Create scheduled task |
| `list_schedules`  | `{}`                                            | `Schedule[]` | List all schedules    |
| `delete_schedule` | `{ scheduleId }`                                | `void`       | Remove schedule       |
| `pause_schedule`  | `{ scheduleId }`                                | `void`       | Pause schedule        |
| `resume_schedule` | `{ scheduleId }`                                | `void`       | Resume schedule       |

## 6.2 XDG Data Storage Paths

### 6.2.1 Directory Layout

AGI Workforce follows the XDG Base Directory Specification on Linux:

| XDG Variable      | Default          | AGI Workforce Path                         | Contents                                   |
| ----------------- | ---------------- | ------------------------------------------ | ------------------------------------------ |
| `XDG_DATA_HOME`   | `~/.local/share` | `~/.local/share/com.agiworkforce.desktop/` | SQLCipher database, model data, skills     |
| `XDG_CONFIG_HOME` | `~/.config`      | `~/.config/com.agiworkforce.desktop/`      | User settings, MCP config, custom models   |
| `XDG_CACHE_HOME`  | `~/.cache`       | `~/.cache/com.agiworkforce.desktop/`       | LLM response cache, thumbnails, temp files |
| `XDG_STATE_HOME`  | `~/.local/state` | `~/.local/state/com.agiworkforce.desktop/` | Logs, session state, auto-save             |
| `XDG_RUNTIME_DIR` | `/run/user/$UID` | `/run/user/$UID/com.agiworkforce.desktop/` | Unix sockets, PID files, IPC               |

### 6.2.2 Database Files

| File              | Location               | Purpose                   | Encryption                 |
| ----------------- | ---------------------- | ------------------------- | -------------------------- |
| `agiworkforce.db` | `$XDG_DATA_HOME/.../`  | Main application database | SQLCipher (AES-256-CBC)    |
| `memory.db`       | `$XDG_DATA_HOME/.../`  | Agent memory database     | SQLCipher                  |
| `analytics.db`    | `$XDG_DATA_HOME/.../`  | Usage analytics           | SQLCipher                  |
| `cache.db`        | `$XDG_CACHE_HOME/.../` | Response cache            | Not encrypted (cache only) |

### 6.2.3 Configuration Files

| File                 | Location                                     | Purpose                  | Format |
| -------------------- | -------------------------------------------- | ------------------------ | ------ |
| `settings.json`      | `$XDG_CONFIG_HOME/.../`                      | User preferences         | JSON   |
| `.mcp.json`          | Project directory or `$XDG_CONFIG_HOME/.../` | MCP server configuration | JSON   |
| `custom-models.json` | `$XDG_CONFIG_HOME/.../`                      | Custom model endpoints   | JSON   |
| `denied-paths.json`  | `$XDG_CONFIG_HOME/.../`                      | ToolGuard deny list      | JSON   |

## 6.3 D-Bus Integration

### 6.3.1 Notification Interface

AGI Workforce sends desktop notifications via the D-Bus `org.freedesktop.Notifications` interface:

```
Bus: Session Bus
Interface: org.freedesktop.Notifications
Method: Notify

Parameters:
  app_name: "AGI Workforce"
  replaces_id: 0 (or previous notification ID for updates)
  app_icon: "/path/to/icon.png"
  summary: "Agent Completed"
  body: "Your research task finished. 12 sources found."
  actions: ["view", "View Results", "dismiss", "Dismiss"]
  hints: {
    "urgency": 1,  // 0=low, 1=normal, 2=critical
    "category": "im.received"
  }
  expire_timeout: 5000  // ms, -1 for persistent
```

**Notification Categories**:

| Category         | Use Case                          | Urgency  |
| ---------------- | --------------------------------- | -------- |
| Agent completed  | Background agent finished         | Normal   |
| Agent error      | Agent encountered error           | Critical |
| Approval needed  | Tool awaiting approval            | Critical |
| Update available | New version ready                 | Low      |
| Scheduled task   | Scheduled agent started/completed | Normal   |
| System alert     | Low disk space, memory warning    | Critical |

### 6.3.2 Secret Service Interface

The application uses D-Bus `org.freedesktop.Secret.Service` for optional credential storage:

```
Bus: Session Bus
Interface: org.freedesktop.Secret.Service
Collection: "AGI Workforce"

Operations:
  - CreateItem: Store encrypted credential
  - GetSecrets: Retrieve credential
  - Delete: Remove credential
  - SearchItems: Find credentials by attribute
```

**Note**: The primary credential storage uses machine-derived keys (not the Secret Service). The D-Bus Secret Service is an optional backup mechanism via the `keyring` crate.

## 6.4 External API Connections

### 6.4.1 Cloud LLM Provider APIs

| Provider   | Endpoint                                                  | Protocol    | Auth                    |
| ---------- | --------------------------------------------------------- | ----------- | ----------------------- |
| Anthropic  | `https://api.anthropic.com/v1/messages`                   | HTTPS + SSE | `x-api-key` header      |
| OpenAI     | `https://api.openai.com/v1/chat/completions`              | HTTPS + SSE | `Authorization: Bearer` |
| Google     | `https://generativelanguage.googleapis.com/v1beta/models` | HTTPS + SSE | `x-goog-api-key` header |
| Mistral    | `https://api.mistral.ai/v1/chat/completions`              | HTTPS + SSE | `Authorization: Bearer` |
| Groq       | `https://api.groq.com/openai/v1/chat/completions`         | HTTPS + SSE | `Authorization: Bearer` |
| DeepSeek   | `https://api.deepseek.com/v1/chat/completions`            | HTTPS + SSE | `Authorization: Bearer` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions`           | HTTPS + SSE | `Authorization: Bearer` |
| Together   | `https://api.together.xyz/v1/chat/completions`            | HTTPS + SSE | `Authorization: Bearer` |
| Fireworks  | `https://api.fireworks.ai/inference/v1/chat/completions`  | HTTPS + SSE | `Authorization: Bearer` |

### 6.4.2 Local LLM Endpoints

| Runtime   | Default Endpoint                             | Protocol   | Auth     |
| --------- | -------------------------------------------- | ---------- | -------- |
| Ollama    | `http://localhost:11434/v1/chat/completions` | HTTP + SSE | None     |
| LM Studio | `http://localhost:1234/v1/chat/completions`  | HTTP + SSE | None     |
| vLLM      | `http://localhost:8000/v1/chat/completions`  | HTTP + SSE | Optional |
| llama.cpp | `http://localhost:8080/v1/chat/completions`  | HTTP + SSE | None     |

### 6.4.3 Platform Services

| Service       | Endpoint                                                       | Purpose              | Auth             |
| ------------- | -------------------------------------------------------------- | -------------------- | ---------------- |
| Update check  | `https://agiworkforce.com/api/releases/linux-x86_64/{version}` | Auto-update          | None             |
| Supabase Auth | `https://*.supabase.co/auth/v1`                                | Authentication       | Anon key + JWT   |
| Supabase DB   | `https://*.supabase.co/rest/v1`                                | Cloud data           | Service role key |
| Stripe        | `https://api.stripe.com`                                       | Billing              | Stripe key       |
| API Gateway   | `https://api.agiworkforce.com`                                 | Mobile sync, credits | JWT              |
| Signaling     | `wss://agiworkforce-signaling.fly.dev`                         | WebRTC pairing       | JWT              |

## 6.5 Offline Behavior

### 6.5.1 Offline Capability Matrix

| Feature              | Offline Support | Notes                            |
| -------------------- | --------------- | -------------------------------- |
| Local LLM chat       | Full            | Ollama/LM Studio must be running |
| Conversation history | Full            | Local SQLite database            |
| Agent memory         | Full            | Local SQLite database            |
| File operations      | Full            | Direct POSIX I/O                 |
| Terminal             | Full            | Local shell execution            |
| Screen capture       | Full            | Local xcap library               |
| Input simulation     | Full            | Local enigo library              |
| Cloud LLM chat       | None            | Requires internet                |
| MCP (stdio)          | Full            | Local process execution          |
| MCP (SSE/HTTP)       | Partial         | Only local servers               |
| Auto-update          | None            | Requires internet                |
| Cloud sync           | None            | Requires internet                |
| Billing              | None            | Requires internet                |
| Email                | None            | Requires internet                |
| Calendar             | None            | Requires internet                |

---

# Section 7: Platform-Specific Capabilities

## 7.1 Display Server Support

### 7.1.1 X11 Support

X11 is the traditional display server on Linux and provides the broadest automation capability:

| Feature              | X11 Implementation                  | Library/Tool                 |
| -------------------- | ----------------------------------- | ---------------------------- |
| Screen capture       | XCB + XRandR                        | xcap crate                   |
| Mouse simulation     | XTest extension                     | enigo crate                  |
| Keyboard simulation  | XTest extension                     | enigo crate                  |
| Window enumeration   | `wmctrl -l -G`                      | wmctrl (CLI)                 |
| Window activation    | `wmctrl -i -a 0x{handle}`           | wmctrl (CLI)                 |
| Window closing       | `wmctrl -c {title}`                 | wmctrl (CLI)                 |
| Global shortcuts     | XGrabKey                            | tauri-plugin-global-shortcut |
| Clipboard            | X11 selections (PRIMARY, CLIPBOARD) | arboard crate                |
| Key event monitoring | XRecord extension                   | rdev crate                   |
| Window title reading | `_NET_WM_NAME` property             | wmctrl (CLI)                 |

**X11 Dependencies**:

- `wmctrl` for window management (optional; runtime detection)
- `xdotool` for advanced input simulation (optional; runtime detection)
- `xclip` or `xsel` for clipboard operations (fallback; arboard preferred)

### 7.1.2 Wayland Support

Wayland is the modern display server protocol. It provides better security isolation but restricts the automation capabilities that AGI Workforce depends on:

| Feature              | Wayland Implementation                                             | Status        | Notes                                    |
| -------------------- | ------------------------------------------------------------------ | ------------- | ---------------------------------------- |
| Screen capture       | xdg-desktop-portal (screenshot)                                    | Implemented   | User must approve via portal dialog      |
| Mouse simulation     | `virtual-keyboard-unstable-v1` / `wlr-virtual-pointer-unstable-v1` | Partial       | Compositor-dependent                     |
| Keyboard simulation  | `virtual-keyboard-unstable-v1`                                     | Partial       | Compositor-dependent                     |
| Window enumeration   | Compositor-specific (no standard protocol)                         | Limited       | Sway: `swaymsg -t get_tree`; GNOME: none |
| Window activation    | Compositor-specific                                                | Limited       | Sway: `swaymsg [title="..."] focus`      |
| Window closing       | Compositor-specific                                                | Limited       | Via D-Bus or compositor CLI              |
| Global shortcuts     | `xdg-desktop-portal GlobalShortcuts`                               | Partial       | Requires portal support                  |
| Clipboard            | `wl-copy` / `wl-paste` (wl-clipboard)                              | Implemented   | Via `wl-clipboard` package               |
| Key event monitoring | None (by design)                                                   | Not available | Wayland isolates input for security      |
| Window title reading | Compositor-specific                                                | Limited       | No standard protocol                     |

**Wayland Compositor Compatibility**:

| Compositor    | Desktop Environment  | Support Level | Notes                                      |
| ------------- | -------------------- | ------------- | ------------------------------------------ |
| Mutter        | GNOME                | Good          | Portal support; limited window enumeration |
| KWin          | KDE Plasma           | Good          | Portal support; D-Bus window management    |
| Sway          | Standalone (i3-like) | Good          | `swaymsg` for window management; IPC       |
| Hyprland      | Standalone           | Moderate      | `hyprctl` for window management; IPC       |
| wlroots-based | Various              | Moderate      | Depends on which protocols are implemented |
| Weston        | Reference            | Limited       | Minimal protocol support                   |

**Wayland Fallback Strategy**:

When running on Wayland, AGI Workforce employs a tiered fallback:

1. **Portal protocol**: Preferred for screen capture, file dialogs, notifications
2. **Compositor-specific IPC**: Sway IPC, Hyprland IPC, KWin D-Bus
3. **XWayland**: Falls back to X11 protocols via XWayland compatibility layer
4. **Graceful degradation**: Features that cannot work display informational message

Detection logic:

```rust
fn detect_display_server() -> DisplayServer {
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        DisplayServer::Wayland
    } else if std::env::var("DISPLAY").is_ok() {
        DisplayServer::X11
    } else {
        DisplayServer::Unknown
    }
}
```

### 7.1.3 Screen Capture Pipeline

**X11 Pipeline**:

```
xcap::Monitor::all()          // Enumerate monitors via XRandR
    │
    ▼
monitor.capture_image()        // XCB shared memory capture
    │
    ▼
image::DynamicImage            // In-memory image buffer
    │
    ├──► base64 encode ──► Send to LLM vision API
    ├──► Save to temp file ──► OCR via Tesseract
    └──► Display in UI ──► AttachmentPreview component
```

**Wayland Pipeline**:

```
xdg-desktop-portal            // Portal screenshot request
    │
    ▼
User approval dialog           // Compositor shows permission dialog
    │
    ▼
Shared file descriptor          // Portal returns image file
    │
    ▼
image::DynamicImage            // Load from file descriptor
    │
    ├──► base64 encode ──► Send to LLM vision API
    ├──► Save to temp file ──► OCR via Tesseract
    └──► Display in UI ──► AttachmentPreview component
```

## 7.2 Window Management

### 7.2.1 Window Management Implementation

The `WindowEnumerator` and `WindowCoordinator` classes in `automation/computer_use/window_manager.rs` provide cross-platform window management:

**Linux (X11) Implementation**:

- Uses `wmctrl -l -G` for window enumeration (returns handle, desktop, x, y, w, h, machine, title)
- Uses `wmctrl -i -a 0x{handle}` for window activation
- Uses `wmctrl -c {title}` for window closing
- Application launching via `std::process::Command::new(name)` with `validate_app_name()` security check

**Security Measures**:

- `sanitize_window_title_arg()`: Strips null bytes and enforces 200-character length limit for wmctrl arguments (passed as separate argv elements, not through shell)
- `validate_app_name()`: Rejects path separators, shell metacharacters, empty strings, and relative path components; allows only alphanumeric, hyphens, spaces, and dots
- No shell interpolation: wmctrl commands use `std::process::Command` with separate arguments, preventing shell injection

**Linux (Wayland) Implementation**:

- Compositor-specific detection and IPC
- Sway: `swaymsg -t get_tree` for enumeration; `swaymsg [title="..."] focus` for activation
- Hyprland: `hyprctl clients` for enumeration; `hyprctl dispatch focuswindow title:...` for activation
- GNOME/Mutter: D-Bus `org.gnome.Shell.Eval` for window management
- Fallback: XWayland for X11 protocol compatibility

### 7.2.2 Input Simulation

**X11 Implementation** (via enigo crate):

- Mouse movement: XTest `XTestFakeMotionEvent`
- Mouse click: XTest `XTestFakeButtonEvent`
- Key press: XTest `XTestFakeKeyEvent`
- Key release: XTest `XTestFakeKeyEvent`
- Text typing: XTest key event sequence with keyboard map lookup

**Wayland Implementation** (limited):

- Requires `virtual-keyboard-unstable-v1` protocol (wlroots-based compositors)
- Requires `wlr-virtual-pointer-unstable-v1` protocol (wlroots-based compositors)
- GNOME Mutter: `org.gnome.Shell.Eval` for JavaScript-based input simulation
- Fallback: XWayland provides X11 input simulation to XWayland-aware applications

## 7.3 Secret Storage

### 7.3.1 Machine-Derived Key Architecture

AGI Workforce uses machine-derived encryption keys as the primary credential storage mechanism. This approach eliminates OS keyring permission prompts that can confuse users:

```
Machine Unique ID (machine-uid crate)
    │
    ▼
Hostname (hostname crate)
    │
    ▼
HKDF-SHA256(machine_uid + hostname + salt)
    │
    ▼
Machine-derived master key
    │
    ├──► HKDF-SHA256(master_key, "api_key_anthropic") ──► Per-key derived key
    ├──► HKDF-SHA256(master_key, "api_key_openai") ──► Per-key derived key
    └──► ...
         │
         ▼
    AES-GCM(derived_key, random_nonce, plaintext) ──► Ciphertext
         │
         ▼
    Store in SQLCipher database
```

### 7.3.2 libsecret / GNOME Keyring (Optional)

The `keyring` crate provides optional integration with the Linux Secret Service via D-Bus:

- **Backend**: `org.freedesktop.Secret.Service` (typically GNOME Keyring or KDE Wallet)
- **Usage**: Backup storage for the machine-derived master key
- **Fallback**: If libsecret is unavailable (headless server, minimal install), the machine-derived key operates independently
- **No user prompts**: The keyring is accessed silently; if permission is denied, the application falls back gracefully

### 7.3.3 Master Password (Optional)

Users can set an additional master password that encrypts the machine-derived key:

```
User enters master password
    │
    ▼
Argon2id(password, random_salt, time_cost=3, memory_cost=65536, parallelism=4)
    │
    ▼
Master password key
    │
    ▼
AES-GCM(master_password_key, nonce, machine_derived_key) ──► Encrypted master key
    │
    ▼
Store encrypted master key in SQLCipher
```

When master password is set, the user must enter it on each application launch.

## 7.4 XDG Desktop Integration

### 7.4.1 Desktop Entry File

The AppImage includes a `.desktop` file for application menu integration:

```ini
[Desktop Entry]
Name=AGI Workforce
Comment=AI Desktop Platform - Multi-LLM Agent Workstation
Exec=AGI.Workforce.AppImage %U
Icon=com.agiworkforce.desktop
Terminal=false
Type=Application
Categories=Development;Utility;ArtificialIntelligence;
MimeType=x-scheme-handler/agiworkforce;
Keywords=AI;LLM;Agent;Chat;Automation;MCP;
StartupNotify=true
StartupWMClass=AGI Workforce
X-GNOME-UsesNotifications=true
Actions=new-conversation;quick-query;

[Desktop Action new-conversation]
Name=New Conversation
Exec=AGI.Workforce.AppImage --new-conversation

[Desktop Action quick-query]
Name=Quick Query
Exec=AGI.Workforce.AppImage --quick-query
```

### 7.4.2 MIME Type Registration

The application registers as the handler for the `agiworkforce://` URI scheme:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="x-scheme-handler/agiworkforce">
    <comment>AGI Workforce Deep Link</comment>
    <glob pattern="agiworkforce://*"/>
  </mime-type>
</mime-info>
```

### 7.4.3 Icon Installation

Icons are installed at standard XDG icon paths:

| Size     | Path                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 32x32    | `~/.local/share/icons/hicolor/32x32/apps/com.agiworkforce.desktop.png`    |
| 128x128  | `~/.local/share/icons/hicolor/128x128/apps/com.agiworkforce.desktop.png`  |
| 256x256  | `~/.local/share/icons/hicolor/256x256/apps/com.agiworkforce.desktop.png`  |
| Scalable | `~/.local/share/icons/hicolor/scalable/apps/com.agiworkforce.desktop.svg` |

## 7.5 Notification System

### 7.5.1 D-Bus Desktop Notifications

Notifications are delivered via `org.freedesktop.Notifications` D-Bus interface (through tauri-plugin-notification):

| Event              | Title                  | Body                                       | Urgency  | Actions        |
| ------------------ | ---------------------- | ------------------------------------------ | -------- | -------------- |
| Agent completed    | "Agent Completed"      | "{task description} finished successfully" | Normal   | View Results   |
| Agent error        | "Agent Error"          | "Error in {task}: {error message}"         | Critical | View Details   |
| Tool approval      | "Tool Approval Needed" | "{tool name} wants to {action}"            | Critical | Approve, Deny  |
| Update available   | "Update Available"     | "Version {version} is ready to install"    | Low      | Install, Later |
| Background alert   | "Background Agent"     | "{agent name}: {status message}"           | Normal   | View           |
| Schedule triggered | "Scheduled Task"       | "{task name} started"                      | Low      | View           |

### 7.5.2 Sound Notifications

Optional sound notifications use PulseAudio/PipeWire for audio output:

- Notification sound: system default or custom `.wav` file
- Agent completion chime
- Error alert tone
- Configurable in Settings > Notifications

## 7.6 Chrome Extension Native Messaging

### 7.6.1 Native Messaging Manifest (Linux)

The native messaging manifest for Chrome/Chromium browsers on Linux is installed at:

```
~/.config/google-chrome/NativeMessagingHosts/com.agiworkforce.native.json
~/.config/chromium/NativeMessagingHosts/com.agiworkforce.native.json
~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.agiworkforce.native.json
```

Manifest contents:

```json
{
  "name": "com.agiworkforce.native",
  "description": "AGI Workforce Native Messaging Host",
  "path": "/path/to/agiworkforce-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID/"]
}
```

## 7.7 Deep Linking

### 7.7.1 URI Scheme

The `agiworkforce://` URI scheme is registered via the `.desktop` file and `xdg-mime`:

| URI Pattern                                | Action                               |
| ------------------------------------------ | ------------------------------------ |
| `agiworkforce://chat/{conversationId}`     | Open specific conversation           |
| `agiworkforce://new?model={modelId}`       | New conversation with specific model |
| `agiworkforce://settings/{section}`        | Open specific settings panel         |
| `agiworkforce://auth/callback?token={jwt}` | Authentication callback              |
| `agiworkforce://mcp/connect?url={url}`     | Connect to MCP server                |

**Security**: Deep link parameters are validated against an allowlist (`ALLOWED_DEEP_LINK_PARAMS`). Tokens are redacted from logs. Scheme validation prevents open redirect attacks.

## 7.8 Auto-Update Mechanism

### 7.8.1 Update Flow

```
Application startup (or manual check)
    │
    ▼
GET https://agiworkforce.com/api/releases/linux-x86_64/{current_version}
    │
    ▼
Response: { version, url, signature, pub_date, notes }
    │
    ▼
Compare versions (semver)
    │
    ▼ (if newer version available)
Download AppImage.tar.gz from URL
    │
    ▼
Verify Ed25519 signature against embedded public key
    │
    ▼ (if signature valid)
Extract new AppImage
    │
    ▼
Replace current AppImage
    │
    ▼
Prompt user to restart (or auto-restart)
```

**Public Key** (embedded in tauri.conf.json):

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQxODAzNEI3NDk3MzIzODEK
UldTQkkzTkp0elNBUVhkUzdsanZXek5CTGJqTkFVSUlWelJZa25ueWdnWktQZ0JwWjJjeVhsdlAK
```

---

# Section 8: Build, Deploy & Distribution

## 8.1 Build Pipeline

### 8.1.1 CI Build Configuration

The Linux build is defined in `.github/workflows/release-desktop.yml` under the `build-linux` job:

**Runner**: `ubuntu-22.04`
**Timeout**: 60 minutes

**Build Steps**:

1. **Checkout code**

   ```yaml
   uses: actions/checkout@v6
   ```

2. **Setup pnpm** (v9.15.3)

   ```yaml
   uses: pnpm/action-setup@v4
   with:
     version: 9.15.3
   ```

3. **Setup Node.js** (v22)

   ```yaml
   uses: actions/setup-node@v6
   with:
     node-version: 22
     cache: 'pnpm'
   ```

4. **Setup Rust** (v1.90.0)

   ```yaml
   uses: actions-rust-lang/setup-rust-toolchain@v1
   with:
     toolchain: 1.90.0
   ```

5. **Install Linux system dependencies**

   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     libwebkit2gtk-4.1-dev \
     build-essential \
     curl wget file \
     libxdo-dev \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev \
     pkg-config \
     libleptonica-dev \
     libpng-dev libjpeg-dev libtiff-dev \
     zlib1g-dev libwebp-dev \
     libasound2-dev \
     libclang-dev
   ```

6. **Cache Rust dependencies**

   ```yaml
   uses: Swatinem/rust-cache@v2
   with:
     workspaces: apps/desktop/src-tauri
     cache-on-failure: true
   ```

7. **Install JavaScript dependencies**

   ```bash
   pnpm install --frozen-lockfile
   ```

8. **Build web frontend**

   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" \
     pnpm --filter @agiworkforce/desktop run build:web
   ```

9. **Build Tauri application**

   ```yaml
   uses: tauri-apps/tauri-action@73fb865345c54760d875b94642314f8c0c894afa # v0.6.1
   env:
     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
   with:
     releaseId: ${{ needs.prepare-release.outputs.release_id }}
   ```

10. **Upload artifacts**
    ```yaml
    uses: actions/upload-artifact@v7
    with:
      name: linux-x64-artifacts
      path: |
        apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage
        apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz
        apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz.sig
      retention-days: 7
    ```

### 8.1.2 Build Artifacts

| File                                                | Format              | Purpose                   | Approximate Size |
| --------------------------------------------------- | ------------------- | ------------------------- | ---------------- |
| `AGI.Workforce_{version}_amd64.AppImage`            | AppImage            | Self-contained executable | ~100-120 MB      |
| `AGI.Workforce_{version}_amd64.AppImage.tar.gz`     | Compressed AppImage | For auto-updater          | ~80-100 MB       |
| `AGI.Workforce_{version}_amd64.AppImage.tar.gz.sig` | Ed25519 signature   | Update verification       | ~256 bytes       |

### 8.1.3 Cargo Build Configuration

```toml
[profile.release]
codegen-units = 1      # Single codegen unit for maximum optimization
lto = true             # Link-time optimization across all crates
opt-level = "z"        # Optimize for binary size
strip = true           # Strip debug symbols
panic = "abort"        # Abort on panic (no unwinding)
```

**Default features enabled for Linux build**: `shell`, `updater`, `billing`, `devtools`, `vad`, `remote-databases`

**Feature flags NOT enabled by default** (user must build from source to enable):

- `ocr` -- requires system Tesseract
- `local-llm` -- requires llama.cpp build
- `local-whisper` -- requires whisper.cpp build
- `webrtc-support` -- adds WebRTC dependency
- `sentry` -- adds Sentry SDK

## 8.2 Distribution Formats

### 8.2.1 AppImage (Primary)

**What is AppImage**: A self-contained application format for Linux. The entire application (binary + libraries + resources) is packed into a single executable file. No installation, root access, or package manager required.

**Usage**:

```bash
# Download
wget https://github.com/agiworkforce/releases/download/v1.1.5/AGI.Workforce_1.1.5_amd64.AppImage

# Make executable
chmod +x AGI.Workforce_1.1.5_amd64.AppImage

# Run
./AGI.Workforce_1.1.5_amd64.AppImage
```

**AppImage Contents**:

```
AGI.Workforce.AppImage
├── AppRun (entry point script)
├── com.agiworkforce.desktop.desktop (desktop entry)
├── com.agiworkforce.desktop.png (application icon)
├── usr/
│   ├── bin/
│   │   └── agiworkforce-desktop (Rust binary)
│   ├── lib/
│   │   ├── libwebkit2gtk-4.1.so (WebKitGTK)
│   │   ├── libgtk-3.so (GTK 3)
│   │   └── ... (bundled shared libraries)
│   └── share/
│       ├── applications/
│       │   └── com.agiworkforce.desktop.desktop
│       └── icons/
│           └── hicolor/
│               └── ... (application icons)
└── .DirIcon (icon for file managers)
```

**AppImage Integration**:

- Desktop integration (menu entry + icon) via `appimaged` or manual `.desktop` file
- No sandboxing by default (runs with user permissions)
- Auto-update via Tauri updater plugin
- Compatible with all glibc-based Linux distributions

### 8.2.2 Debian Package (Roadmap)

**Status**: Planned for v1.3.0

```
agiworkforce_1.1.5_amd64.deb
├── DEBIAN/
│   ├── control (package metadata)
│   ├── postinst (post-install script)
│   ├── prerm (pre-remove script)
│   └── triggers (file triggers)
├── usr/
│   ├── bin/
│   │   └── agiworkforce-desktop
│   ├── lib/
│   │   └── agiworkforce/ (bundled libraries)
│   └── share/
│       ├── applications/
│       │   └── com.agiworkforce.desktop.desktop
│       └── icons/
│           └── hicolor/ ...
└── etc/
    └── agiworkforce/ (default configuration)
```

**Debian control file**:

```
Package: agiworkforce
Version: 1.1.5
Architecture: amd64
Maintainer: AGI Automation LLC <support@agiworkforce.com>
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, libayatana-appindicator3-1, libasound2
Recommends: wmctrl, xdotool, xdg-utils
Suggests: tesseract-ocr, ollama
Description: AI Desktop Platform - Multi-LLM Agent Workstation
 AGI Workforce is a model-agnostic AI desktop platform that connects
 to any LLM (cloud or local) and provides full desktop autonomy,
 MCP tools, and multi-agent swarm orchestration.
```

### 8.2.3 Flatpak (Roadmap)

**Status**: Planned for v1.4.0

Flatpak provides sandboxed distribution with explicit permission declarations:

```yaml
# com.agiworkforce.desktop.yml
app-id: com.agiworkforce.desktop
runtime: org.gnome.Platform
runtime-version: '46'
sdk: org.gnome.Sdk
command: agiworkforce-desktop

finish-args:
  - --share=network # Cloud LLM access
  - --share=ipc # X11 shared memory
  - --socket=x11 # X11 display
  - --socket=wayland # Wayland display
  - --socket=pulseaudio # Audio (voice input/output)
  - --filesystem=home # Home directory access
  - --filesystem=/tmp # Temp files
  - --talk-name=org.freedesktop.Notifications # Desktop notifications
  - --talk-name=org.freedesktop.secrets # Secret Service
  - --talk-name=org.freedesktop.portal.Desktop # Portal access
  - --device=dri # GPU access (local LLMs)
```

### 8.2.4 Snap (Roadmap)

**Status**: Planned for v1.5.0

```yaml
# snapcraft.yaml
name: agiworkforce
version: '1.1.5'
summary: AI Desktop Platform - Multi-LLM Agent Workstation
description: |
  AGI Workforce connects to any LLM and provides full desktop autonomy.
grade: stable
confinement: classic # Required for full desktop automation
base: core22

apps:
  agiworkforce:
    command: agiworkforce-desktop
    desktop: com.agiworkforce.desktop.desktop
    extensions: [gnome]
    plugs:
      - desktop
      - desktop-legacy
      - home
      - network
      - network-bind
      - audio-playback
      - audio-record
      - screen-inhibit-control
      - unity7
      - x11
      - wayland
```

### 8.2.5 AUR (Arch User Repository) (Roadmap)

**Status**: Planned for v1.3.0

```bash
# PKGBUILD
pkgname=agiworkforce
pkgver=1.1.5
pkgrel=1
pkgdesc='AI Desktop Platform - Multi-LLM Agent Workstation'
arch=('x86_64')
url='https://agiworkforce.com'
license=('custom:proprietary')
depends=('webkit2gtk-4.1' 'gtk3' 'libayatana-appindicator' 'alsa-lib')
optdepends=('wmctrl: window management'
            'xdotool: input simulation'
            'tesseract: OCR support'
            'ollama: local LLM support')
source=("https://github.com/agiworkforce/releases/download/v${pkgver}/AGI.Workforce_${pkgver}_amd64.AppImage")

package() {
    install -Dm755 "AGI.Workforce_${pkgver}_amd64.AppImage" \
        "${pkgdir}/opt/agiworkforce/agiworkforce.AppImage"
    install -Dm644 "com.agiworkforce.desktop.desktop" \
        "${pkgdir}/usr/share/applications/com.agiworkforce.desktop.desktop"
    install -Dm644 "icon.png" \
        "${pkgdir}/usr/share/icons/hicolor/256x256/apps/com.agiworkforce.desktop.png"
}
```

## 8.3 Code Signing

### 8.3.1 Ed25519 Signature

Linux releases are signed with Ed25519 digital signatures (not GPG, not Authenticode):

| Aspect               | Detail                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| Algorithm            | Ed25519 (via minisign format)                                          |
| Key generation       | `tauri signer generate`                                                |
| Private key          | Stored as GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY`)          |
| Private key password | Stored as GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) |
| Public key           | Embedded in `tauri.conf.json` `plugins.updater.pubkey`                 |
| Signature file       | `.AppImage.tar.gz.sig`                                                 |
| Verification         | Tauri updater plugin verifies before installing updates                |

**Verification flow**:

```
Download update (.AppImage.tar.gz + .AppImage.tar.gz.sig)
    │
    ▼
ed25519_dalek::verify(public_key, signature, file_hash)
    │
    ├──► Valid: proceed with update installation
    └──► Invalid: reject update, log error, notify user
```

### 8.3.2 CI Secret Management

| Secret                               | Purpose                                   | Scope            |
| ------------------------------------ | ----------------------------------------- | ---------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Ed25519 private key for update signing    | Release workflow |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for private key                  | Release workflow |
| `GITHUB_TOKEN`                       | GitHub API access for release creation    | All workflows    |
| `SUPABASE_URL`                       | Supabase project URL for release database | Release workflow |
| `SUPABASE_SERVICE_ROLE_KEY`          | Supabase admin access for release upsert  | Release workflow |

All secrets are masked in CI logs via `::add-mask::` before any build step executes.

## 8.4 Release Channels

| Channel | Frequency       | Audience           | Auto-Update         |
| ------- | --------------- | ------------------ | ------------------- |
| Stable  | Every 2-4 weeks | All users          | Default enabled     |
| Beta    | Weekly          | Early adopters     | Opt-in via Settings |
| Nightly | Daily           | Developers/testers | Opt-in via Settings |

**Channel detection**: Version strings containing `-beta`, `-rc` route to Beta channel. Strings containing `-alpha`, `-nightly` route to Nightly channel.

## 8.5 Release Database

After a successful build across all platforms, the `update-database` job upserts release metadata to Supabase:

```sql
-- Supabase RPC function
SELECT upsert_release(
  p_version := '1.1.5',
  p_platform := 'linux-x86_64',
  p_download_url := 'https://github.com/.../AGI.Workforce_1.1.5_amd64.AppImage.tar.gz',
  p_signature := '{ed25519_signature}',
  p_notes := NULL,
  p_pub_date := '2026-03-09T12:00:00Z',
  p_file_size_bytes := 104857600,
  p_is_prerelease := false,
  p_is_critical := false,
  p_channel := 'stable'
);
```

The Tauri updater queries this database via the update endpoint:

```
GET https://agiworkforce.com/api/releases/linux-x86_64/1.1.5
```

---

# Section 9: Testing Strategy

## 9.1 Test Infrastructure

### 9.1.1 Test Frameworks

| Framework  | Language   | Scope                  | Location                                              |
| ---------- | ---------- | ---------------------- | ----------------------------------------------------- |
| Vitest     | TypeScript | Frontend unit tests    | `apps/desktop/src/__tests__/`                         |
| Playwright | TypeScript | Frontend E2E tests     | `apps/desktop/e2e/`                                   |
| Cargo test | Rust       | Backend unit tests     | `apps/desktop/src-tauri/src/` (inline `#[cfg(test)]`) |
| Criterion  | Rust       | Backend benchmarks     | `apps/desktop/src-tauri/benches/`                     |
| Proptest   | Rust       | Property-based testing | Inline with cargo test                                |
| Mockall    | Rust       | Mocking framework      | Dev dependency                                        |

### 9.1.2 Current Test Coverage

| Suite          | Files                | Tests       | Pass Rate        |
| -------------- | -------------------- | ----------- | ---------------- |
| Desktop Vitest | 82 files             | 1,358 tests | 100%             |
| Cargo test     | Workspace-wide       | 3,267 tests | 100%             |
| Playwright E2E | Smoke + Self-healing | Variable    | Project-specific |

## 9.2 Unit Test Strategy

### 9.2.1 Frontend Unit Tests (Vitest)

**Target**: >= 80% statement coverage on critical paths

**Priority Test Targets**:

| Module                 | Critical Functions                                      | Test Focus                              |
| ---------------------- | ------------------------------------------------------- | --------------------------------------- |
| `unifiedChatStore`     | `sendMessage`, `loadConversation`, `deleteConversation` | State transitions, error handling       |
| `settingsStore`        | `setSetting`, `persist`, `migrate`                      | Persistence, migration v10              |
| `toolStore`            | `handleToolEvent`, `getToolTimeline`                    | Event processing, timeline construction |
| `mcpStore`             | `connect`, `disconnect`, `executeTool`                  | Connection lifecycle, circuit breaker   |
| `modelStore`           | `selectModel`, `detectLocal`, `getCapabilities`         | Model selection, capability detection   |
| `chatToolUtils`        | `normalizeToolName`, `getDisplayName`                   | Name mapping, edge cases                |
| `useKeyboardShortcuts` | Shortcut registration and dispatch                      | Platform-specific key handling          |
| `useSendMessage`       | Message preparation and IPC                             | Attachment handling, error recovery     |

**Linux-Specific Test Considerations**:

- Tauri mock shim (`tauri-mock`) provides `invoke()` and `listen()` stubs for web-mode testing
- IPC parameter names must use camelCase (matching production behavior)
- `navigator.userAgent` mock must include "Linux" for platform detection tests
- Fake timers interact with `Date.now()` differently; use `waitFor` for async state changes

### 9.2.2 Backend Unit Tests (Cargo)

**Target**: >= 70% statement coverage on security-critical paths

**Priority Test Targets**:

| Module                    | Test Focus                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `window_manager.rs`       | `sanitize_window_title_arg`, `validate_app_name`, `sanitize_applescript_string`, window bounds |
| `tool_guard.rs`           | Deny-list validation, rate limiting, input sanitization                                        |
| `secret_manager.rs`       | Encryption/decryption round-trip, key derivation                                               |
| `machine_key.rs`          | Machine key generation, deterministic output                                                   |
| `llm_router.rs`           | Model routing, normalize_model_id, provider selection                                          |
| `sse_parser.rs`           | SSE chunk parsing, error recovery, multi-line                                                  |
| `provider_adapter.rs`     | Provider-specific request/response mapping                                                     |
| `capability_detection.rs` | Ollama probe, tool support detection, caching                                                  |
| `safety_patterns.rs`      | Dangerous command detection                                                                    |

**Linux-Specific Backend Tests**:

```rust
#[cfg(test)]
#[cfg(target_os = "linux")]
mod linux_tests {
    #[test]
    fn test_xdg_data_path() {
        // Verify XDG_DATA_HOME is respected
    }

    #[test]
    fn test_display_server_detection() {
        // Test WAYLAND_DISPLAY and DISPLAY environment variable detection
    }

    #[test]
    fn test_wmctrl_output_parsing() {
        // Parse sample wmctrl -l -G output
    }

    #[test]
    fn test_sanitize_window_title_arg_strips_nulls() {
        let input = "My Window\0Title";
        let result = sanitize_window_title_arg(input);
        assert_eq!(result, "My WindowTitle");
    }

    #[test]
    fn test_sanitize_window_title_arg_length_limit() {
        let input = "a".repeat(300);
        assert_eq!(sanitize_window_title_arg(&input).len(), 200);
    }
}
```

## 9.3 Integration Test Strategy

### 9.3.1 IPC Integration Tests

Test the frontend-to-backend communication path:

| Test Scenario     | Frontend Action                                          | Expected Backend Behavior            | Verification                    |
| ----------------- | -------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| Send message      | `invoke('sendMessage', { conversationId, content })`     | Message stored in SQLite; LLM called | Response message returned       |
| Get conversations | `invoke('getConversations', {})`                         | Query SQLite                         | Array of conversations          |
| Set API key       | `invoke('setApiKey', { provider, apiKey })`              | Encrypt via SecretManager; store     | Key retrievable via `getApiKey` |
| Execute MCP tool  | `invoke('executeMcpTool', { serverId, toolName, args })` | Validate via ToolGuard; execute      | Tool result returned            |
| Screen capture    | `invoke('captureScreen', {})`                            | xcap capture + base64 encode         | Base64 image string             |

### 9.3.2 MCP Integration Tests

| Test Scenario             | Transport | Expected Behavior                             |
| ------------------------- | --------- | --------------------------------------------- |
| Connect stdio server      | stdio     | Child process spawned; tools listed           |
| Execute stdio tool        | stdio     | Input/output via stdin/stdout                 |
| Connect SSE server        | SSE       | HTTP connection established; tools listed     |
| Circuit breaker open      | Any       | After 3 failures, circuit opens; 30s cooldown |
| Circuit breaker half-open | Any       | After cooldown, single test request sent      |

## 9.4 E2E Test Strategy (Playwright)

### 9.4.1 E2E Test Scenarios

| #   | Scenario                | Steps                                               | Expected Result                           |
| --- | ----------------------- | --------------------------------------------------- | ----------------------------------------- |
| 1   | New conversation        | Launch app > Click "New Chat" > Type message > Send | Assistant response displayed              |
| 2   | Model switching         | Start conversation > Change model mid-chat          | Next response from new model              |
| 3   | File attachment         | Click + > Attach File > Select file > Send          | File processed and referenced in response |
| 4   | Settings navigation     | Ctrl+, > Navigate all settings panels               | All panels render without error           |
| 5   | Keyboard shortcuts      | Ctrl+N, Ctrl+K, Ctrl+/, F11                         | Correct actions triggered                 |
| 6   | Tool execution (mock)   | Send "list files in /tmp" in agent mode             | Tool timeline shows Read tool execution   |
| 7   | Error recovery          | Trigger network error during streaming              | Error message shown; Retry button works   |
| 8   | Dark/light theme        | Toggle theme in settings                            | UI colors update correctly                |
| 9   | Sidebar collapse/expand | Ctrl+/                                              | Sidebar toggles visibility                |
| 10  | Conversation search     | Type in search box                                  | Conversations filtered                    |

### 9.4.2 Playwright Configuration for Linux

```typescript
// playwright.config.ts (Linux-specific settings)
export default defineConfig({
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:5175',
      },
    },
    {
      name: 'self-healing',
      testMatch: /self-healing\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:5175',
      },
    },
  ],
  use: {
    headless: true, // Required for CI (no display)
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  retries: 2,
  workers: 1, // Serial for deterministic mock behavior
});
```

**Linux CI Setup**:

```bash
# Start Xvfb (virtual framebuffer) for headless testing
xvfb-run --auto-servernum pnpm exec playwright test
```

## 9.5 Distribution Test Matrix

### 9.5.1 Manual Test Matrix

| Distribution | Version   | Desktop  | Display Server | Test Priority |
| ------------ | --------- | -------- | -------------- | ------------- |
| Ubuntu       | 22.04 LTS | GNOME 42 | X11            | High          |
| Ubuntu       | 24.04 LTS | GNOME 46 | Wayland        | High          |
| Ubuntu       | 24.04 LTS | GNOME 46 | X11            | High          |
| Fedora       | 40        | GNOME 46 | Wayland        | High          |
| Fedora       | 40        | GNOME 46 | X11            | Medium        |
| Debian       | 12        | GNOME 43 | X11            | Medium        |
| Arch         | Rolling   | i3       | X11            | Medium        |
| Arch         | Rolling   | Sway     | Wayland        | Medium        |
| Arch         | Rolling   | Hyprland | Wayland        | Medium        |
| Linux Mint   | 22        | Cinnamon | X11            | Low           |
| Pop!\_OS     | 24.04     | GNOME    | X11            | Low           |

### 9.5.2 Test Checklist per Distribution

| #   | Test                     | Pass Criteria                         |
| --- | ------------------------ | ------------------------------------- |
| 1   | AppImage launches        | Main window visible within 5 seconds  |
| 2   | System tray icon appears | Icon visible in panel/tray            |
| 3   | GTK theme applied        | UI follows system dark/light mode     |
| 4   | File dialog opens        | GTK file chooser appears on attach    |
| 5   | Notifications work       | D-Bus notification displayed          |
| 6   | Clipboard works          | Copy/paste text between apps          |
| 7   | Deep link works          | `agiworkforce://` URL opens app       |
| 8   | Audio input works        | Voice recording captures audio        |
| 9   | Audio output works       | TTS produces sound                    |
| 10  | Screen capture works     | Screenshot saved/attached             |
| 11  | Window management works  | wmctrl/xdotool operations succeed     |
| 12  | Auto-update works        | Update check returns correct response |
| 13  | Local model detected     | Ollama at localhost:11434 found       |
| 14  | Keyboard shortcuts work  | All Ctrl+ shortcuts functional        |
| 15  | Tiling WM compatible     | Window fills tile; no layout issues   |

---

# Section 10: Performance Requirements

## 10.1 Performance Targets

### 10.1.1 Startup Performance

| Metric                                  | Target      | Measurement Method                              |
| --------------------------------------- | ----------- | ----------------------------------------------- |
| Cold start (first launch after install) | < 5 seconds | Time from `./AppImage` to main window visible   |
| Warm start (subsequent launches)        | < 3 seconds | Time from launch to main window visible         |
| Hot start (from system tray)            | < 500 ms    | Time from tray click to window visible          |
| Time to interactive                     | < 4 seconds | Time from launch to first message send possible |
| Database initialization                 | < 1 second  | SQLCipher database open + migration check       |

### 10.1.2 Memory Performance

| Metric                           | Target   | Notes                              |
| -------------------------------- | -------- | ---------------------------------- |
| Idle memory (no conversations)   | < 200 MB | RSS (Resident Set Size)            |
| Active memory (1 conversation)   | < 300 MB | Including WebKitGTK renderer       |
| Active memory (10 conversations) | < 500 MB | Virtualized message list           |
| Active memory (agent running)    | < 600 MB | Including tool execution buffers   |
| Maximum memory (100-agent swarm) | < 2 GB   | With aggressive garbage collection |
| WebKitGTK renderer process       | < 150 MB | Separate process from Rust backend |

### 10.1.3 Rendering Performance

| Metric                  | Target    | Notes                                     |
| ----------------------- | --------- | ----------------------------------------- |
| Frame rate (scrolling)  | >= 60 FPS | Message list with syntax-highlighted code |
| Frame rate (animations) | >= 60 FPS | Sidebar transitions, modals, tooltips     |
| Frame rate (streaming)  | >= 30 FPS | During real-time text streaming           |
| Input latency (typing)  | < 16 ms   | Keystroke to character displayed          |
| Scroll latency          | < 16 ms   | Touch/scroll input to visual update       |
| Theme switch            | < 100 ms  | Dark/light mode transition                |

### 10.1.4 LLM Performance

| Metric                        | Target                | Notes                                   |
| ----------------------------- | --------------------- | --------------------------------------- |
| Time to first token (cloud)   | < 2 seconds           | From send to first streamed character   |
| Time to first token (local)   | < 5 seconds           | Ollama with model loaded in VRAM        |
| Streaming throughput          | Display at wire speed | No client-side buffering bottleneck     |
| Model switch time             | < 1 second            | Changing selected model in dropdown     |
| Local model detection         | < 3 seconds           | Scanning for Ollama/LM Studio instances |
| Capability detection (Ollama) | < 2 seconds           | Probing model via `/api/show`           |

### 10.1.5 File and I/O Performance

| Metric                             | Target   | Notes                                  |
| ---------------------------------- | -------- | -------------------------------------- |
| File read (< 1 MB)                 | < 100 ms | Including ToolGuard validation         |
| File write (< 1 MB)                | < 200 ms | Including ToolGuard validation + fsync |
| Directory listing (1000 files)     | < 500 ms | walkdir with metadata                  |
| Database query (conversation list) | < 100 ms | SQLite FTS for search                  |
| Screen capture                     | < 500 ms | Full-screen capture + encoding         |
| Clipboard read/write               | < 50 ms  | Text content                           |

## 10.2 Bundle Size

### 10.2.1 AppImage Size Budget

| Component               | Budget       | Notes                              |
| ----------------------- | ------------ | ---------------------------------- |
| Rust binary             | < 40 MB      | With LTO, opt-level="z", strip     |
| WebKitGTK libraries     | < 50 MB      | Bundled in AppImage                |
| GTK libraries           | < 15 MB      | Bundled in AppImage                |
| Frontend assets         | < 10 MB      | JavaScript + CSS + fonts + icons   |
| Other bundled libraries | < 10 MB      | SQLCipher, audio, image processing |
| **Total AppImage**      | **< 120 MB** | Target: < 100 MB for v2.0.0        |
| **Compressed (tar.gz)** | **< 80 MB**  | For auto-update downloads          |

### 10.2.2 Disk Usage Budget

| Usage                | Budget     | Notes                           |
| -------------------- | ---------- | ------------------------------- |
| AppImage file        | < 120 MB   | Single file, no installation    |
| SQLCipher databases  | < 500 MB   | Grows with conversation history |
| Cache directory      | < 200 MB   | Auto-purged                     |
| Log files            | < 100 MB   | Rotated                         |
| WebKitGTK storage    | < 50 MB    | localStorage + cookies          |
| **Total disk usage** | **< 1 GB** | Excluding local LLM models      |

## 10.3 Battery and Power

### 10.3.1 Power Usage Targets

| State                              | CPU Usage | Notes                             |
| ---------------------------------- | --------- | --------------------------------- |
| Idle (minimized to tray)           | < 0.5%    | No active timers or polling       |
| Idle (window visible, no activity) | < 2%      | WebKitGTK renderer idle           |
| Active conversation (typing)       | < 5%      | Input processing + spell check    |
| Streaming response                 | < 15%     | SSE parsing + rendering           |
| Agent executing                    | < 30%     | Tool execution + rendering        |
| Multi-agent swarm (10 agents)      | < 60%     | Parallel execution                |
| Background agent (idle)            | < 1%      | Waiting for next scheduled action |

### 10.3.2 Wake-up Frequency

| Event Source            | Frequency  | Notes                                 |
| ----------------------- | ---------- | ------------------------------------- |
| Cursor blink timer      | 530 ms     | Standard GTK cursor blink             |
| Connection health check | 60 seconds | Cloud provider keepalive              |
| Background agent check  | 30 seconds | Next scheduled action poll            |
| Auto-save               | 30 seconds | When conversation has unsaved changes |
| System metrics          | 60 seconds | Memory + CPU monitoring               |
| Garbage collection      | 5 minutes  | Store cleanup, cache eviction         |

---

# Section 11: Security

## 11.1 Threat Model

### 11.1.1 Linux-Specific Threat Landscape

| Threat                     | Vector                                               | Impact               | Mitigation                                                     |
| -------------------------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| Shell injection via agent  | User prompts agent to execute malicious command      | System compromise    | ToolGuard deny-list + validate_app_name() + sanitize functions |
| Path traversal             | Agent reads/writes outside allowed directories       | Data exfiltration    | ToolGuard path validation + deny-list (15 patterns)            |
| AppImage tampering         | Modified AppImage distributed via unofficial channel | Malware installation | Ed25519 signature verification on all updates                  |
| Credential theft           | Attacker reads SQLCipher database file               | API key exposure     | SQLCipher encryption + machine-derived keys                    |
| MCP server compromise      | Malicious MCP server sends harmful tool calls        | System compromise    | ToolGuard validates all tool inputs regardless of source       |
| Local privilege escalation | Agent executes `sudo` or `pkexec` commands           | Root access          | ToolGuard blocks sudo/su/pkexec/doas commands                  |
| Memory scraping            | Attacker reads process memory                        | Secret exposure      | Secrets zeroed after use; Rust ownership prevents leaks        |
| Network interception       | MITM on LLM API calls                                | Data exposure        | rustls TLS 1.3 exclusively; no native-tls fallback             |
| XSS via chat content       | LLM response contains malicious HTML/JS              | Session hijack       | CSP headers in WebKitGTK; React's built-in XSS protection      |
| Deep link injection        | Crafted agiworkforce:// URL with malicious params    | Unintended actions   | ALLOWED_DEEP_LINK_PARAMS allowlist; token redaction            |

### 11.1.2 Linux-Specific Attack Surface

| Surface                             | Risk Level | Status                                                  |
| ----------------------------------- | ---------- | ------------------------------------------------------- |
| AppImage (no sandboxing by default) | Medium     | Documented; Flatpak roadmap adds sandboxing             |
| X11 global key/screen access        | Medium     | Any X11 client can read keystrokes/screen               |
| `/proc` filesystem exposure         | Low        | Agent cannot read other process memory (user isolation) |
| D-Bus session bus                   | Low        | Only registered services accessible                     |
| Unix socket IPC                     | Low        | Protected by filesystem permissions                     |
| `.desktop` file manipulation        | Low        | Requires write access to user's XDG dirs                |

## 11.2 Secret Storage Security

### 11.2.1 Encryption Architecture

```
Layer 1: SQLCipher (database-level encryption)
  └── AES-256-CBC with PBKDF2-derived key
  └── Entire database file encrypted at rest

Layer 2: Per-secret encryption (field-level)
  └── Machine-derived master key (HKDF-SHA256)
  └── Per-secret derived key (HKDF-SHA256 with label)
  └── AES-GCM encryption with random nonce
  └── Ciphertext + nonce stored in SQLCipher

Layer 3: Optional master password
  └── Argon2id(password, salt)
  └── AES-GCM encrypt machine-derived key
  └── Required on each application launch
```

### 11.2.2 Key Material Handling

| Material                   | Storage                                | Lifetime                         | Zeroing                    |
| -------------------------- | -------------------------------------- | -------------------------------- | -------------------------- |
| Machine-derived master key | In-memory only (never written to disk) | Application session              | Dropped on exit            |
| Per-secret derived keys    | In-memory only                         | Used once, then dropped          | Immediate after use        |
| Plaintext API keys         | In-memory only (during use)            | Milliseconds                     | After API call             |
| SQLCipher database key     | In-memory only                         | Application session              | Dropped on exit            |
| Master password            | In-memory only                         | Duration of Argon2id computation | Immediate after derivation |

### 11.2.3 No Plaintext Storage Guarantee

API keys and secrets must never appear in:

- Log files (tracing crate redaction)
- Error messages surfaced to users
- `process.env` in the WebKitGTK renderer process
- `.env` files committed to the repository
- Crash reports (if Sentry enabled, secrets are excluded)
- D-Bus messages
- Clipboard history (clipboard write for secrets is blocked)
- Core dumps (rlimit set to prevent core dumps with secrets)

## 11.3 ToolGuard Security

### 11.3.1 Validation Pipeline

Every tool execution passes through ToolGuard regardless of mode (including auto-approve):

```
Tool execution request
    │
    ▼
1. Input schema validation
   - Verify tool arguments match expected types
   - Reject unexpected parameters
    │
    ▼
2. Deny-list path check
   - /etc/shadow, /etc/passwd, ~/.ssh/, ~/.gnupg/
   - /boot/, /sys/, /proc/, /dev/
   - /mnt/, /media/, /run/user/
   - .env, .env.local, credentials.json
   - /home/ (sensitive subdirectories)
    │
    ▼
3. Dangerous command check
   - rm -rf /, mkfs, dd, fork bomb patterns
   - chmod -R 777 /, > /dev/sda
   - sudo, su, pkexec, doas
    │
    ▼
4. Permission check
   - Calling agent has permission for this tool
   - Rate limit not exceeded
    │
    ▼
5. If mode == "ask":
   - Show ApprovalModal to user
   - Wait for Approve/Deny
    │
    ▼
6. Execute tool
    │
    ▼
7. Audit log entry
   - Tool name, arguments, result, duration, success/failure
   - Stored in local SQLite audit table
```

### 11.3.2 Shell Injection Prevention

The ground truth audit identified and fixed three shell injection CVEs in `window_manager.rs`:

| CVE                       | Description                                              | Fix                                                                                     |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AppleScript injection     | Unsanitized window titles in AppleScript string literals | `sanitize_applescript_string()` removes quotes, backslashes, null bytes; 200-char limit |
| Process launch injection  | Arbitrary binary execution via path separators           | `validate_app_name()` rejects `/`, `\`, shell metacharacters                            |
| wmctrl argument injection | Null bytes in window titles could truncate argv          | `sanitize_window_title_arg()` strips null bytes; 200-char limit                         |

## 11.4 AppArmor / SELinux Considerations

### 11.4.1 AppArmor Profile (Optional)

Distributions with AppArmor can use this profile:

```
# /etc/apparmor.d/com.agiworkforce.desktop
#include <tunables/global>

profile com.agiworkforce.desktop flags=(complain) {
  #include <abstractions/base>
  #include <abstractions/audio>
  #include <abstractions/dbus-session>
  #include <abstractions/fonts>
  #include <abstractions/freedesktop.org>
  #include <abstractions/gnome>
  #include <abstractions/nameservice>
  #include <abstractions/openssl>
  #include <abstractions/X>

  # Application binary
  /opt/agiworkforce/agiworkforce-desktop mr,

  # XDG directories
  owner @{HOME}/.local/share/com.agiworkforce.desktop/** rw,
  owner @{HOME}/.config/com.agiworkforce.desktop/** rw,
  owner @{HOME}/.cache/com.agiworkforce.desktop/** rw,

  # User home directory (for file operations)
  owner @{HOME}/** rw,

  # Temp files
  /tmp/** rw,

  # Network access
  network inet stream,
  network inet6 stream,

  # Required for WebKitGTK
  /usr/lib/webkit2gtk-4.1/** rm,
  /usr/share/webkitgtk-4.1/** r,

  # D-Bus
  dbus send bus=session,
  dbus receive bus=session,

  # Deny dangerous paths
  deny /etc/shadow r,
  deny /etc/gshadow r,
  deny /boot/** w,
  deny /sys/** w,
}
```

### 11.4.2 SELinux Policy (Optional)

Distributions with SELinux can use a custom type enforcement:

```
# agiworkforce.te
policy_module(agiworkforce, 1.0.0)

type agiworkforce_t;
type agiworkforce_exec_t;
application_domain(agiworkforce_t, agiworkforce_exec_t)

# Allow network access
corenet_tcp_connect_http_port(agiworkforce_t)
corenet_tcp_connect_http_cache_port(agiworkforce_t)

# Allow user home access
userdom_manage_user_home_content(agiworkforce_t)

# Allow D-Bus
dbus_session_client(agiworkforce_t)

# Allow audio
audio_rw_data(agiworkforce_t)
```

## 11.5 Content Security Policy

The WebKitGTK webview enforces the following CSP:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://agiworkforce.com https://*.supabase.co
        https://avatars.githubusercontent.com https://lh3.googleusercontent.com;
font-src 'self' https://fonts.gstatic.com data:;
connect-src 'self' ipc: https://api.agiworkforce.com https://agiworkforce.com
            https://*.supabase.co wss://*.supabase.co https://api.stripe.com
            https://agiworkforce-signaling.fly.dev wss://agiworkforce-signaling.fly.dev
            http://localhost:11434 http://127.0.0.1:11434;
frame-src 'self' https://js.stripe.com;
frame-ancestors 'none';
media-src 'self' blob:;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self'
```

**Notable allowances**:

- `http://localhost:11434` and `http://127.0.0.1:11434` for Ollama local model API
- `wasm-unsafe-eval` for WebAssembly execution (tiktoken tokenizer)
- `unsafe-inline` for styles (required by Radix UI and dynamic theming)
- `blob:` for media (voice recording, image processing)

## 11.6 Network Security

### 11.6.1 TLS Configuration

| Aspect                   | Detail                                               |
| ------------------------ | ---------------------------------------------------- |
| TLS library              | rustls (not OpenSSL)                                 |
| Minimum version          | TLS 1.2                                              |
| Preferred version        | TLS 1.3                                              |
| Certificate verification | Mozilla root certificates (webpki-roots)             |
| Certificate pinning      | None (not implemented; would break custom endpoints) |
| HSTS                     | Respected for web endpoints                          |
| OCSP stapling            | Supported by rustls                                  |

### 11.6.2 Local Network Security

| Connection                 | Encryption         | Authentication    |
| -------------------------- | ------------------ | ----------------- |
| Ollama (localhost:11434)   | None (HTTP)        | None              |
| LM Studio (localhost:1234) | None (HTTP)        | None              |
| vLLM (localhost:8000)      | None (HTTP)        | Optional API key  |
| MCP stdio servers          | N/A (stdin/stdout) | Process isolation |
| WebSocket (signaling)      | WSS (TLS)          | JWT token         |

**Note**: Local model connections use unencrypted HTTP because they are localhost-only. The CSP `connect-src` directive restricts localhost connections to specific ports.

---

# Section 12: Accessibility

## 12.1 Accessibility Standards

### 12.1.1 Target Compliance

| Standard     | Level     | Status                   |
| ------------ | --------- | ------------------------ |
| WCAG 2.1     | AA        | Partial compliance       |
| WAI-ARIA 1.2 | Full      | Implemented via Radix UI |
| AT-SPI2      | Supported | Linux accessibility API  |
| Section 508  | Compliant | US federal accessibility |

### 12.1.2 Linux Accessibility Stack

```
User
  │
  ▼
Screen Reader (Orca)
  │
  ▼
AT-SPI2 (Accessibility Technology - Service Provider Interface)
  │
  ▼
ATK (Accessibility Toolkit - GTK bridge)
  │
  ▼
WebKitGTK (exposes DOM accessibility tree via ATK)
  │
  ▼
React Components (with ARIA attributes via Radix UI)
```

## 12.2 Screen Reader Support

### 12.2.1 Orca Screen Reader

Orca is the primary screen reader on Linux (pre-installed on GNOME):

| Feature             | Support Status | Notes                                      |
| ------------------- | -------------- | ------------------------------------------ |
| Page reading        | Supported      | WebKitGTK exposes full DOM to ATK          |
| Form navigation     | Supported      | All inputs have labels via Radix UI        |
| Landmark navigation | Supported      | ARIA landmarks on main regions             |
| Live regions        | Supported      | Streaming messages announced via aria-live |
| Table navigation    | Supported      | Data tables have proper headers            |
| Heading navigation  | Supported      | h1-h6 hierarchy maintained                 |
| Link navigation     | Supported      | All interactive elements are focusable     |
| Image descriptions  | Supported      | alt text on all images                     |

### 12.2.2 ARIA Implementation

| Component         | ARIA Role     | ARIA Properties                                              |
| ----------------- | ------------- | ------------------------------------------------------------ |
| Sidebar           | `navigation`  | `aria-label="Main navigation"`                               |
| Conversation list | `list`        | `aria-label="Conversations"`                                 |
| Conversation item | `listitem`    | `aria-selected`, `aria-current`                              |
| Chat message list | `log`         | `aria-live="polite"`, `aria-label="Chat messages"`           |
| User message      | `article`     | `aria-label="Your message"`                                  |
| Assistant message | `article`     | `aria-label="Assistant response"`                            |
| Code block        | `code`        | `aria-label="Code: {language}"`                              |
| Tool timeline     | `list`        | `aria-label="Tool executions"`                               |
| Chat input        | `textbox`     | `aria-label="Message input"`, `aria-multiline="true"`        |
| Send button       | `button`      | `aria-label="Send message"` / `aria-label="Stop generation"` |
| Model selector    | `combobox`    | `aria-label="Select model"`, `aria-expanded`                 |
| Settings panel    | `dialog`      | `aria-label="Settings"`, `aria-modal="true"`                 |
| Command palette   | `combobox`    | `aria-label="Command palette"`, `role="listbox"`             |
| Approval modal    | `alertdialog` | `aria-label="Tool approval required"`, `aria-describedby`    |
| Status bar        | `status`      | `aria-live="polite"`                                         |
| Notifications     | `alert`       | `aria-live="assertive"`                                      |

## 12.3 Keyboard Navigation

### 12.3.1 Focus Management

| Interaction           | Focus Behavior                                      |
| --------------------- | --------------------------------------------------- |
| App launch            | Focus on chat input                                 |
| New conversation      | Focus on chat input                                 |
| Open settings         | Focus on first settings item; Escape closes         |
| Open command palette  | Focus on search input; Escape closes                |
| Approval modal opens  | Focus on Approve button; Tab cycles through options |
| Tool timeline expands | Focus on first tool entry                           |
| Modal closes          | Focus returns to trigger element                    |

### 12.3.2 Tab Order

The tab order follows a logical reading flow:

1. Sidebar navigation items
2. Conversation list items
3. Main content area
4. Chat message list (messages are focusable via arrow keys)
5. Chat input area
6. Chat input toolbar
7. Status bar (not focusable; read-only status)

### 12.3.3 Focus Indicators

| Element    | Focus Style                            |
| ---------- | -------------------------------------- |
| Buttons    | 2px solid blue outline with 2px offset |
| Inputs     | 2px solid blue outline                 |
| List items | Background highlight + left border     |
| Links      | Underline + color change               |
| Cards      | Box shadow + border change             |

All focus indicators meet WCAG 2.1 AA contrast requirements (3:1 minimum against adjacent colors).

## 12.4 Color and Contrast

### 12.4.1 Color Contrast Requirements

| Element         | Foreground        | Background        | Ratio           | WCAG AA |
| --------------- | ----------------- | ----------------- | --------------- | ------- |
| Body text       | #1a1a1a / #e5e5e5 | #ffffff / #0a0a0a | 15.3:1 / 16.2:1 | Pass    |
| Muted text      | #737373           | #ffffff / #0a0a0a | 4.6:1 / 4.8:1   | Pass    |
| Primary button  | #ffffff           | #2563eb           | 8.6:1           | Pass    |
| Error text      | #dc2626           | #ffffff           | 4.8:1           | Pass    |
| Warning text    | #d97706           | #ffffff           | 3.1:1           | Pass    |
| Code block text | #1a1a1a / #e5e5e5 | #f5f5f5 / #171717 | 11.7:1 / 12.4:1 | Pass    |

### 12.4.2 Non-Color Information Conveyance

| Visual Indicator      | Additional Indicator                           |
| --------------------- | ---------------------------------------------- |
| Red error badge       | Error icon + "Error" text                      |
| Green success badge   | Checkmark icon + "Connected" text              |
| Yellow warning badge  | Warning icon + "Warning" text                  |
| Tool status colors    | Status text: "Running", "Completed", "Failed"  |
| Risk level colors     | Risk text: "Low", "Medium", "High", "Critical" |
| Model provider colors | Provider name displayed as text                |

## 12.5 Motion and Animation

### 12.5.1 Reduced Motion Support

The application respects the `prefers-reduced-motion` media query:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**React hook**: `useReducedMotion()` provides a boolean for conditional animation in JavaScript.

**Affected animations**:

- Sidebar slide-in/out
- Modal fade-in/out
- Streaming text cursor blink
- Loading spinners (replaced with static "Loading..." text)
- Tool timeline expand/collapse
- Scroll animations (snapped instead of smooth)

### 12.5.2 Linux Desktop Environment Integration

| Desktop Environment | Motion Preferences                           | Detection                        |
| ------------------- | -------------------------------------------- | -------------------------------- |
| GNOME               | Settings > Accessibility > Reduce Animation  | `prefers-reduced-motion` via GTK |
| KDE Plasma          | Settings > Accessibility > Reduce Animations | `prefers-reduced-motion` via Qt  |
| XFCE                | Accessibility settings                       | Limited detection                |
| i3/Sway             | No built-in setting                          | Manual CSS override              |

## 12.6 Text and Font Accessibility

### 12.6.1 Font Size Controls

| Feature             | Implementation                  |
| ------------------- | ------------------------------- |
| Minimum font size   | 10px (configurable in Settings) |
| Default font size   | 14px                            |
| Maximum font size   | 24px                            |
| Zoom levels         | 75%, 100%, 125%, 150%, 200%     |
| Keyboard zoom       | Ctrl+Plus, Ctrl+Minus, Ctrl+0   |
| System font scaling | Respects GTK font DPI settings  |

### 12.6.2 Font Rendering on Linux

| Aspect             | Implementation                                            |
| ------------------ | --------------------------------------------------------- |
| Rendering engine   | FreeType + HarfBuzz (via WebKitGTK)                       |
| Hinting            | Uses system fontconfig settings                           |
| Subpixel rendering | Uses system fontconfig (RGB/BGR/none)                     |
| Font stack         | system-ui, -apple-system, "Segoe UI", Roboto, sans-serif  |
| Monospace font     | "JetBrains Mono", "Fira Code", "Cascadia Code", monospace |
| Fallback fonts     | System fonts via fontconfig                               |

---

# Section 13: Competitive Analysis

## 13.1 Competitive Landscape on Linux

### 13.1.1 The Strategic Gap

AGI Workforce occupies a unique position on Linux: **there is no direct competitor**. No other product combines a native desktop GUI, multi-LLM support, full desktop autonomy, and MCP tool ecosystem on the Linux platform.

This is not a temporary gap. The reasons competitors have not entered this space are structural:

1. **Claude Desktop** (Anthropic): Focused on macOS/Windows. No Linux build announced. Anthropic's strategy prioritizes their own CLI tool (Claude Code) for the Linux developer audience.

2. **ChatGPT Desktop** (OpenAI): macOS/Windows only. OpenAI has shown no interest in Linux desktop applications. Their web app is the Linux fallback.

3. **Gemini** (Google): No desktop application on any platform. Web-only strategy.

4. **Cursor / Windsurf**: Ship AppImage builds but are code-focused IDEs, not general-purpose AI agents. Limited to editing code; no desktop autonomy, no background agents, no MCP tools beyond code context.

5. **Claude Code** (Anthropic): CLI-only. Powerful for terminal users but offers no GUI, no visual feedback, no system tray, no notifications, no visual tool timeline, and no accessibility for non-terminal users.

6. **Aider / Open Interpreter**: CLI tools. No GUI, no background agents, no MCP support, no multi-agent swarms.

### 13.1.2 Why This Gap Matters

Linux represents approximately:

- 4.5% of desktop OS market share globally (StatCounter, 2026)
- 25-40% of developer workstations (Stack Overflow Developer Survey, 2025)
- 80%+ of server operating systems
- 90%+ of cloud infrastructure
- 100% of Android development base
- 100% of embedded systems development

The disproportionate representation of Linux in the developer and technical professional segments means that Linux desktop users are the highest-value segment for an AI agent product. They:

- Spend more on developer tools
- Have higher willingness to pay for productivity software
- Are more likely to recommend tools within their technical communities
- Are more likely to run local LLMs (privacy-focused, have powerful hardware)
- Are more likely to use MCP tools and custom integrations

## 13.2 Feature Comparison Matrix

### 13.2.1 AGI Workforce vs CLI Tools on Linux

| Feature                  | AGI Workforce                        | Claude Code          | Aider           | Open Interpreter |
| ------------------------ | ------------------------------------ | -------------------- | --------------- | ---------------- |
| **Interface**            | Native GUI                           | CLI                  | CLI             | CLI              |
| **Multi-model**          | 9+ providers + local                 | Claude only          | Multi-model     | Multi-model      |
| **Local models**         | Full (Ollama, LM Studio, vLLM)       | None                 | Partial         | Partial          |
| **Desktop autonomy**     | Full (screen, keyboard, mouse, apps) | Full (terminal only) | None            | Partial          |
| **Background agents**    | Yes (24hr+)                          | No                   | No              | No               |
| **Multi-agent swarm**    | Yes (up to 100)                      | No                   | No              | No               |
| **MCP tools**            | Full (stdio, SSE, HTTP)              | Full                 | None            | None             |
| **Vision/screenshots**   | Yes                                  | Yes                  | No              | Yes              |
| **Voice I/O**            | Yes                                  | No                   | No              | No               |
| **Tool timeline**        | Visual timeline                      | Terminal output      | Terminal output | Terminal output  |
| **Accessibility**        | Screen reader support                | Terminal only        | Terminal only   | Terminal only    |
| **System tray**          | Yes                                  | No                   | No              | No               |
| **Notifications**        | Desktop notifications                | Terminal only        | Terminal only   | Terminal only    |
| **Settings GUI**         | Full settings panel                  | Config files         | Config files    | Config files     |
| **Keyboard shortcuts**   | 40+ shortcuts                        | Shell shortcuts      | Shell shortcuts | Shell shortcuts  |
| **File attachments**     | Drag-and-drop, paste                 | File paths           | File paths      | File paths       |
| **Conversation history** | Searchable, exportable               | Session-based        | Session-based   | Session-based    |
| **Auto-update**          | Ed25519-signed updates               | pip/cargo update     | pip update      | pip update       |
| **Pricing**              | Subscription tiers                   | Usage-based          | BYOK            | BYOK             |

### 13.2.2 AGI Workforce vs Code-Focused IDEs on Linux

| Feature                  | AGI Workforce            | Cursor      | Windsurf    | VS Code + Copilot  |
| ------------------------ | ------------------------ | ----------- | ----------- | ------------------ |
| **Primary purpose**      | General-purpose AI agent | Code editor | Code editor | Code editor        |
| **Linux format**         | AppImage                 | AppImage    | AppImage    | .deb / .rpm / snap |
| **Non-coding tasks**     | 140+ AI skills           | None        | None        | None               |
| **Desktop automation**   | Full                     | None        | None        | None               |
| **Email integration**    | IMAP/SMTP                | None        | None        | None               |
| **Calendar integration** | Google/Outlook           | None        | None        | None               |
| **Database connections** | PG, MySQL, Mongo, Redis  | None        | None        | None               |
| **Document processing**  | PDF, DOCX, XLSX          | None        | None        | None               |
| **Background agents**    | Yes                      | No          | No          | No                 |
| **Multi-agent swarm**    | Yes                      | No          | No          | No                 |
| **MCP tools**            | Unlimited                | 40 tool cap | Limited     | Limited            |
| **Local LLM support**    | Full                     | Partial     | Partial     | None               |
| **Voice I/O**            | Yes                      | No          | No          | No                 |
| **Computer use**         | Vision + action          | None        | None        | None               |
| **Tiling WM support**    | Full                     | Good        | Good        | Good               |

### 13.2.3 AGI Workforce vs Web Apps on Linux

| Feature                              | AGI Workforce           | claude.ai   | chatgpt.com | gemini.google.com |
| ------------------------------------ | ----------------------- | ----------- | ----------- | ----------------- |
| **Local execution**                  | Yes                     | No          | No          | No                |
| **File system access**               | Direct                  | Upload only | Upload only | Upload only       |
| **Terminal access**                  | Yes                     | No          | No          | No                |
| **Screen capture**                   | Yes                     | No          | No          | No                |
| **Desktop automation**               | Yes                     | No          | No          | No                |
| **Offline mode**                     | Yes (local models)      | No          | No          | No                |
| **Background agents**                | Yes                     | No          | No          | No                |
| **Multi-agent swarm**                | Yes                     | No          | No          | No                |
| **Local LLM**                        | Yes                     | No          | No          | No                |
| **MCP tools**                        | Yes                     | No          | No          | No                |
| **Encrypted local storage**          | Yes (SQLCipher)         | Server-side | Server-side | Server-side       |
| **Privacy (no data leaves machine)** | Yes (with local models) | No          | No          | No                |
| **System notifications**             | D-Bus native            | Browser     | Browser     | Browser           |
| **Global shortcuts**                 | Yes                     | No          | No          | No                |
| **System tray**                      | Yes                     | No          | No          | No                |
| **Auto-update**                      | Ed25519-signed          | N/A         | N/A         | N/A               |

## 13.3 Where AGI Workforce Leads

### 13.3.1 Uncontested Advantages

1. **Only native GUI AI agent on Linux** -- No competitor offers this combination
2. **Multi-model + local models + native GUI** -- The trifecta that no competitor matches
3. **140+ non-coding AI skills** -- Healthcare, legal, finance, education, creative, trades, e-commerce skills that no code-focused tool offers
4. **Full BYOK + local LLMs** -- Users own their API relationships and can run fully offline
5. **Unlimited MCP tools** -- No artificial caps (Cursor caps at 40)
6. **Background agents on Linux** -- No other tool offers 24hr+ autonomous agents on Linux
7. **Multi-agent swarm on Linux** -- Up to 100 concurrent agents, unique to AGI Workforce
8. **Desktop automation on Linux** -- Screen capture, input simulation, window management via X11/Wayland
9. **Privacy-first architecture** -- All data local, encrypted, auditable
10. **System integration** -- D-Bus notifications, system tray, global shortcuts, XDG compliance

### 13.3.2 Developer Workflow Advantages

For the Linux developer audience specifically:

1. **Shell integration**: AI that understands your terminal, your shell (bash/zsh/fish), your tmux sessions
2. **Git awareness**: Reads repository context, understands branches, can commit and push
3. **Container integration**: Interacts with Docker/Podman containers
4. **Package manager awareness**: Detects optional dependencies, suggests installations
5. **Environment detection**: Recognizes Python venvs, conda, nix-shell
6. **Tiling WM compatibility**: Works in i3, Sway, Hyprland without layout issues
7. **Keyboard-first**: 40+ keyboard shortcuts; command palette for everything
8. **Local model priority**: Ollama auto-detection and routing for privacy-sensitive work

## 13.4 Where Parity Is Needed

### 13.4.1 Wayland Automation Gap

The most significant gap compared to the macOS/Windows experience is Wayland automation:

| Capability        | X11             | Wayland                | Gap Action                                       |
| ----------------- | --------------- | ---------------------- | ------------------------------------------------ |
| Screen capture    | Full            | Portal dialog required | Accept portal UX; investigate background capture |
| Input simulation  | Full            | Compositor-dependent   | Support wlroots, Mutter, KWin                    |
| Window management | Full (wmctrl)   | Compositor-specific    | Implement Sway, Hyprland, GNOME IPC              |
| Global shortcuts  | Full (XGrabKey) | Portal protocol        | Implement xdg-desktop-portal shortcuts           |
| Key monitoring    | Full (XRecord)  | Not possible           | Accept limitation; document for users            |

**Timeline**: Wayland automation parity is targeted for v1.4.0 (Q3 2026).

### 13.4.2 Accessibility Gaps

| Gap                          | Current State | Target                               |
| ---------------------------- | ------------- | ------------------------------------ |
| Orca screen reader testing   | Manual only   | Automated AT-SPI2 testing in CI      |
| High contrast mode           | Partial       | Full GTK high contrast theme support |
| Large text mode              | Via zoom only | Native large text support            |
| Keyboard navigation coverage | 90%           | 100% of interactive elements         |

## 13.5 Strategic Gaps to Own

### 13.5.1 Linux Server Management

AGI Workforce is uniquely positioned to become the go-to tool for Linux server management:

- **SSH agent integration**: Forward SSH agent for secure remote operations
- **Log analysis**: Tail and analyze system logs, application logs, journal logs
- **Container orchestration**: Manage Docker/Podman containers and Kubernetes pods
- **Package management**: Query and update system packages via apt/dnf/pacman
- **Service management**: Start/stop/restart systemd services
- **Network diagnostics**: Run network tests, analyze traffic patterns

### 13.5.2 Linux Development Environment

No other tool offers AI-assisted full-stack development with desktop automation on Linux:

- **IDE agnostic**: Works alongside any editor (VS Code, Neovim, Emacs, JetBrains)
- **Build system integration**: Understand and interact with Make, CMake, Cargo, npm, pip
- **CI/CD integration**: Trigger and monitor GitHub Actions, GitLab CI, Jenkins
- **Database management**: Query and manage databases directly from the agent
- **API testing**: Test APIs, manage environments, validate responses

### 13.5.3 Privacy-First AI Computing

For privacy-conscious Linux users:

- **Zero-network mode**: Complete operation with no outbound network traffic
- **Local embeddings**: Generate embeddings locally via Ollama (nomic-embed-text)
- **Local STT/TTS**: Whisper and Piper run entirely on-device
- **Audit trail**: Every agent action logged and reviewable
- **Data portability**: Export all data in standard formats (JSON, Markdown, SQLite)
- **No telemetry**: Zero data collection by default; opt-in only

### 13.5.4 Community Engagement

The Linux community values open engagement and distribution diversity:

- **AUR package** (planned v1.3.0): Official PKGBUILD for Arch users
- **Flatpak** (planned v1.4.0): Sandboxed distribution via Flathub
- **Snap** (planned v1.5.0): Distribution via Snapcraft store
- **NixOS package** (planned v1.5.0): Nix expression for reproducible builds
- **GitHub Releases**: Always available as standalone AppImage
- **Community feedback**: Linux-specific feature requests prioritized in roadmap
- **Documentation**: Linux installation, troubleshooting, and optimization guides

---

## Appendix A: Linux-Specific Configuration Reference

### A.1 Environment Variables

| Variable           | Purpose                      | Default                  |
| ------------------ | ---------------------------- | ------------------------ |
| `XDG_DATA_HOME`    | Data directory base          | `~/.local/share`         |
| `XDG_CONFIG_HOME`  | Config directory base        | `~/.config`              |
| `XDG_CACHE_HOME`   | Cache directory base         | `~/.cache`               |
| `XDG_STATE_HOME`   | State directory base         | `~/.local/state`         |
| `XDG_RUNTIME_DIR`  | Runtime directory            | `/run/user/$UID`         |
| `DISPLAY`          | X11 display server           | `:0`                     |
| `WAYLAND_DISPLAY`  | Wayland display server       | `wayland-0`              |
| `SHELL`            | User's default shell         | `/bin/bash`              |
| `TERM`             | Terminal type                | `xterm-256color`         |
| `OLLAMA_HOST`      | Ollama API endpoint          | `http://localhost:11434` |
| `LIBCLANG_PATH`    | libclang for SQLCipher build | Auto-detected            |
| `GTK_THEME`        | GTK theme override           | System default           |
| `AGIWORKFORCE_LOG` | Log level override           | `info`                   |

### A.2 Command-Line Arguments

| Argument             | Purpose                          | Example                                             |
| -------------------- | -------------------------------- | --------------------------------------------------- |
| `--new-conversation` | Open with new conversation       | `./AGI.Workforce.AppImage --new-conversation`       |
| `--quick-query`      | Open quick query floating window | `./AGI.Workforce.AppImage --quick-query`            |
| `--minimized`        | Start minimized to tray          | `./AGI.Workforce.AppImage --minimized`              |
| `--debug`            | Enable debug logging             | `./AGI.Workforce.AppImage --debug`                  |
| `--no-update-check`  | Skip auto-update check           | `./AGI.Workforce.AppImage --no-update-check`        |
| `--data-dir PATH`    | Override data directory          | `./AGI.Workforce.AppImage --data-dir /mnt/data/agi` |

### A.3 `.desktop` Actions

| Action           | D-Bus Activation           | Command                                       |
| ---------------- | -------------------------- | --------------------------------------------- |
| Default launch   | `com.agiworkforce.desktop` | `./AGI.Workforce.AppImage`                    |
| New conversation | N/A                        | `./AGI.Workforce.AppImage --new-conversation` |
| Quick query      | N/A                        | `./AGI.Workforce.AppImage --quick-query`      |

---

## Appendix B: Troubleshooting Guide

### B.1 Common Issues

| Issue                                    | Cause                                        | Solution                                                        |
| ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| AppImage won't launch                    | Missing execute permission                   | `chmod +x AGI.Workforce.AppImage`                               |
| Blank white window                       | WebKitGTK not installed or outdated          | Install `libwebkit2gtk-4.1-0` (Ubuntu) or equivalent            |
| No system tray icon                      | Missing appindicator library                 | Install `libayatana-appindicator3-1`                            |
| No audio input                           | ALSA not available                           | Install `libasound2` or configure PulseAudio/PipeWire           |
| Window management fails                  | wmctrl not installed (X11)                   | Install `wmctrl` package                                        |
| Screen capture fails (Wayland)           | Portal protocol not supported                | Use X11 session or install `xdg-desktop-portal-gnome`           |
| Keyboard shortcuts not working (Wayland) | Global shortcuts not supported by compositor | Use X11 session or configure compositor passthrough             |
| SQLCipher build fails                    | Missing libclang                             | Install `libclang-dev` (Ubuntu) or `clang-devel` (Fedora)       |
| GPU acceleration issues                  | Missing DRI/Mesa drivers                     | Install `mesa-dri-drivers` or NVIDIA drivers                    |
| Theme mismatch                           | GTK theme not detected                       | Set `GTK_THEME` environment variable                            |
| Font rendering issues                    | Fontconfig not configured                    | Copy system fontconfig or set `FC_MATCH`                        |
| AppImage too slow to start               | FUSE not available                           | Extract AppImage: `./AGI.Workforce.AppImage --appimage-extract` |
| D-Bus notifications fail                 | Notification daemon not running              | Install `dunst`, `mako`, or enable GNOME notifications          |
| Clipboard not working (Wayland)          | wl-clipboard not installed                   | Install `wl-clipboard` package                                  |

### B.2 Performance Optimization

| Optimization            | Command/Setting                                  | Impact                         |
| ----------------------- | ------------------------------------------------ | ------------------------------ |
| GPU rendering           | Ensure `DRI_PRIME=1` for discrete GPU            | Better WebKitGTK rendering     |
| Extract AppImage        | `--appimage-extract` and run from extracted dir  | Faster startup (no FUSE mount) |
| Disable animations      | Settings > General > Reduce Motion               | Lower CPU usage                |
| Limit agent concurrency | Settings > Automation > Max concurrent agents: 5 | Lower memory usage             |
| Use local models        | Settings > Privacy > Privacy Mode                | Zero network latency           |
| Increase swap           | Configure swap for large models                  | Prevent OOM with 70B+ models   |

---

## Appendix C: Build From Source Guide

### C.1 Prerequisites

```bash
# Ubuntu 22.04 / 24.04
sudo apt-get update
sudo apt-get install -y \
  build-essential pkg-config curl wget file \
  libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libxdo-dev libleptonica-dev libclang-dev \
  libpng-dev libjpeg-dev libtiff-dev zlib1g-dev \
  libwebp-dev libasound2-dev

# Install Node.js 22 (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22
nvm use 22

# Install pnpm
npm install -g pnpm@9.15.3

# Install Rust 1.90.0
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup install 1.90.0
rustup default 1.90.0

# Install Tauri CLI
cargo install tauri-cli --version '^2'
```

### C.2 Build Commands

```bash
# Clone repository
git clone https://github.com/agiworkforce/agiworkforce.git
cd agiworkforce

# Install JavaScript dependencies
pnpm install

# Development mode (hot reload)
cd apps/desktop
pnpm dev           # Frontend + Rust backend

# Production build
cd apps/desktop
pnpm build         # Produces AppImage in src-tauri/target/release/bundle/appimage/

# Build with optional features
cd apps/desktop/src-tauri
cargo build --release --features "ocr,local-llm,local-whisper"

# Run tests
cargo test                           # Rust tests
cd ../.. && pnpm test               # Frontend tests
pnpm test:e2e                       # E2E tests (requires Playwright browsers)
```

### C.3 Fedora Build Dependencies

```bash
# Fedora 39+
sudo dnf install -y \
  webkit2gtk4.1-devel openssl-devel gtk3-devel \
  libayatana-appindicator-gtk3-devel librsvg2-devel \
  libxdo-devel leptonica-devel clang-devel \
  libpng-devel libjpeg-devel libtiff-devel zlib-devel \
  libwebp-devel alsa-lib-devel gcc g++ pkg-config \
  curl wget file
```

### C.4 Arch Linux Build Dependencies

```bash
# Arch Linux
sudo pacman -S --needed \
  webkit2gtk-4.1 openssl gtk3 \
  libayatana-appindicator librsvg \
  xdotool leptonica clang \
  libpng libjpeg-turbo libtiff zlib \
  libwebp alsa-lib base-devel pkg-config \
  curl wget file
```

---

## Appendix D: Glossary

| Term          | Definition                                                           |
| ------------- | -------------------------------------------------------------------- |
| AppImage      | Self-contained Linux application format requiring no installation    |
| AT-SPI2       | Accessibility Technology Service Provider Interface (Linux a11y API) |
| BYOK          | Bring Your Own Key -- users provide their own API keys               |
| CDP           | Chrome DevTools Protocol -- for browser automation                   |
| D-Bus         | Desktop Bus -- Linux IPC system for desktop integration              |
| Ed25519       | Elliptic curve digital signature algorithm used for update signing   |
| enigo         | Rust crate for cross-platform input simulation                       |
| GTK           | GIMP Toolkit -- widget toolkit used by WebKitGTK                     |
| GNOME Keyring | GNOME's secret storage service (via libsecret)                       |
| HKDF          | HMAC-based Key Derivation Function                                   |
| IPC           | Inter-Process Communication                                          |
| libsecret     | Library for accessing the Linux Secret Service                       |
| MCP           | Model Context Protocol -- extensibility protocol for AI tools        |
| Ollama        | Local LLM runtime for running models on user's machine               |
| Orca          | GNOME's screen reader for visually impaired users                    |
| Portal        | xdg-desktop-portal -- sandboxed access to desktop resources          |
| rustls        | Rust TLS library (no OpenSSL dependency)                             |
| SNI           | StatusNotifierItem -- modern Linux system tray protocol              |
| SQLCipher     | Encrypted SQLite database                                            |
| Tauri         | Desktop application framework (Rust backend + web frontend)          |
| ToolGuard     | AGI Workforce's tool execution sandboxing module                     |
| WebKitGTK     | GTK port of the WebKit rendering engine                              |
| wmctrl        | CLI tool for X11 window management                                   |
| XDG           | Cross-Desktop Group -- specifications for Linux desktop integration  |
| xdotool       | CLI tool for X11 window and input simulation                         |
| xcap          | Rust crate for cross-platform screen capture                         |
| XWayland      | X11 compatibility layer for Wayland compositors                      |

---

_Document version 1.0.0 -- Last updated 2026-03-09_
_AGI Workforce v1.1.5 -- Proprietary (commercial)_
_AGI Automation LLC_
