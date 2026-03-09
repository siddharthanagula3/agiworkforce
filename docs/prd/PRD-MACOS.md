# AGI Workforce — macOS Desktop Platform PRD

> **Document version**: 1.0.0
> **Created**: 2026-03-09
> **Status**: Approved for implementation
> **Owner**: Product Team
> **Platform**: macOS (Apple Silicon + Intel Universal Binary)
> **Framework**: Tauri v2 + Rust 1.90.0 + React 19 + Vite 7 + Tailwind CSS 4

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Requirements](#2-platform-requirements)
3. [Feature Matrix](#3-feature-matrix)
4. [Screen-by-Screen UI Specification](#4-screen-by-screen-ui-specification)
5. [Component Architecture](#5-component-architecture)
6. [Data Flow & API Connections](#6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#8-build-deploy--distribution)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance Requirements](#10-performance-requirements)
11. [Security](#11-security)
12. [Accessibility](#12-accessibility)
13. [Competitive Analysis](#13-competitive-analysis)

---

# 1. Executive Summary

## 1.1 Platform Vision

AGI Workforce for macOS is the flagship desktop product of the AGI Workforce platform suite. It is a native Tauri v2 application delivering an unrestricted, model-agnostic AI agent runtime that runs entirely on the user's Mac. The application gives users a single unified interface to connect any large language model — from Anthropic Claude to OpenAI GPT to locally-hosted Ollama models — and operate those models as autonomous desktop agents with full access to the file system, terminal, browser, email, calendar, screen, keyboard, and mouse.

The macOS build is the primary development target. macOS users represent the core early-adopter audience for AI productivity tools, and macOS-specific capabilities (AXUIElement accessibility tree, macOS Keychain, NSUserNotification, universal binary distribution) are first-class features, not afterthoughts.

## 1.2 Target Users

### 1.2.1 Developers and Engineers on Mac

Software developers who use macOS as their primary development platform and want AI assistance that extends beyond code editing into the full development workflow: terminal commands, git operations, file management, browser testing, API debugging, and documentation generation. These users currently switch between Claude Desktop (for chat), Cursor (for code), and manual terminal work. AGI Workforce unifies all three into a single agent-driven workflow.

Key needs:

- Compare model outputs (Claude Opus vs GPT-5 vs Gemini Ultra vs local Llama) in a single interface
- AI that can run terminal commands, manage files, and operate desktop applications autonomously
- MCP tool ecosystem: connect custom tools via stdio, SSE, or HTTP transports
- Privacy option: route sensitive queries to locally hosted models (Ollama, LM Studio) with zero cloud exposure
- Background agents that continue working after the user shifts focus to another application

### 1.2.2 Knowledge Workers and Power Users

Non-developer professionals (researchers, analysts, writers, marketers, lawyers, healthcare workers) who want AI automation for repetitive tasks: document processing (PDF/DOCX/XLSX), email management, calendar scheduling, web research, data analysis, and report generation. These users need a polished native Mac experience with no terminal exposure required.

Key needs:

- Voice input (hold-to-speak, Wispr Flow style) for hands-free dictation
- Document processing: read, write, and edit PDF, Word, and Excel files
- Email and calendar integration via OAuth (Gmail, Google Calendar, Outlook)
- Research mode with inline citations and multi-source synthesis
- Simple Mode toggle that hides advanced agent controls

### 1.2.3 AI Enthusiasts and Early Adopters

Users who experiment with frontier AI capabilities and want day-one support for new model releases from any provider. They run local models via Ollama or LM Studio, configure MCP servers, and push computer-use vision features to their limits.

Key needs:

- Day-one support for new model releases from any provider
- Local model experimentation without cloud costs or data exposure
- Computer use features: screenshot, OCR, screen-aware agents, observe-plan-act loops
- Multi-agent swarm orchestration (up to 100 concurrent agents)
- Canvas and artifact system for visual planning and code artifact management

### 1.2.4 Enterprise Teams

Organizations deploying AI at scale on Mac fleets, requiring governance controls, audit logging, encrypted secret storage, and team collaboration features.

Key needs:

- Vendor-neutral platform to prevent lock-in as the AI market evolves
- ToolGuard sandboxing to prevent runaway agent actions
- Encrypted secret storage (Argon2id + AES-GCM + macOS Keychain)
- Team subscription tier with per-seat licensing
- MDM/Jamf-compatible deployment via signed and notarized DMG

## 1.3 Key Differentiators Over Competitors

| Differentiator            | AGI Workforce macOS                    | Claude Desktop            | ChatGPT Desktop      | Cursor              |
| ------------------------- | -------------------------------------- | ------------------------- | -------------------- | ------------------- |
| Model agnostic (any LLM)  | 9+ cloud providers + local models      | Anthropic only            | OpenAI only          | Limited multi-model |
| Full desktop autonomy     | FS, terminal, apps, mouse, keyboard    | Limited (artifacts)       | None                 | Code-focused only   |
| Background agents (24hr+) | Yes — persistent, checkpoint-resumable | No                        | No                   | No                  |
| Multi-agent swarm (100)   | Yes — parallel task decomposition      | No                        | No                   | No                  |
| MCP tools (unlimited)     | Full (stdio, SSE, HTTP) — no caps      | Yes (limited)             | No                   | 40-tool cap         |
| Voice I/O                 | Whisper + Piper + Deepgram + macOS TTS | No                        | Voice mode (limited) | No                  |
| Computer use (vision)     | Full OPA loop + AXUIElement + OCR      | Beta (limited)            | No                   | No                  |
| 140+ non-coding AI skills | Healthcare, legal, finance, education  | No                        | No                   | No                  |
| Mobile companion          | QR-pair, live agent dashboard          | No (Max tier remote only) | No                   | No                  |
| Local model support       | Ollama, LM Studio, vLLM, llama.cpp     | No                        | No                   | Some                |
| Universal binary          | Apple Silicon + Intel native           | Apple Silicon only        | Apple Silicon only   | Electron (Rosetta)  |

## 1.4 Non-Negotiable Requirements

| ID    | Requirement                                              | Rationale                                                                                                                                                             |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NN-01 | Zero user-visible raw error messages                     | Users must never see stack traces, provider error codes, or internal exception text. All errors must be translated to friendly messages via the FriendlyError system. |
| NN-02 | `stream_watchdog_timeout` must never surface to the user | The watchdog is an internal Rust safety mechanism. If it fires, the session must recover gracefully and silently.                                                     |
| NN-03 | Auto-approve mode must have zero friction                | In trusted mode, agents execute tools without confirmation dialogs. Any latency introduced by permission prompts in auto-approve mode is a regression.                |
| NN-04 | Multi-LLM routing must work across all 9+ providers      | A failure in one provider must not prevent routing to another. Circuit breaker, retry, and fallback logic are required.                                               |
| NN-05 | Full desktop autonomy must be complete                   | The platform must perform any action a human can perform at a keyboard and mouse, including actions in third-party applications via AXUIElement.                      |
| NN-06 | API keys and secrets must never appear in plaintext      | All secrets go through SecretManager (Argon2id + AES-GCM + SQLCipher + macOS Keychain fallback).                                                                      |
| NN-07 | Proprietary license must be enforced                     | All source code remains proprietary. No copyleft dependency (GPL, AGPL, SSPL) may be added without licensing review.                                                  |
| NN-08 | macOS universal binary required for release              | Every release artifact must be a universal binary supporting both Apple Silicon (aarch64) and Intel (x86_64).                                                         |
| NN-09 | Code signing and notarization required                   | Every DMG must be signed with Apple Developer ID and notarized via Apple's notarization service before distribution.                                                  |

## 1.5 Success Metrics

| Metric                              | Target (v1.2.0)    | Target (v2.0.0)     |
| ----------------------------------- | ------------------ | ------------------- |
| Feature audit PASS rate             | >= 80%             | >= 95%              |
| User-visible error rate             | < 0.1% of sessions | < 0.01% of sessions |
| LLM provider uptime (routing layer) | >= 99.5%           | >= 99.9%            |
| macOS cold start time               | < 3 seconds        | < 2 seconds         |
| Agent task success rate             | >= 85%             | >= 95%              |
| DMG download-to-first-chat time     | < 5 minutes        | < 3 minutes         |
| Pro/Max waitlist conversion         | >= 30%             | N/A                 |
| macOS MAU (monthly active users)    | 5,000              | 50,000              |
| Crash-free session rate             | >= 99.5%           | >= 99.9%            |
| App Store rating (if submitted)     | >= 4.5             | >= 4.7              |

---

# 2. Platform Requirements

## 2.1 Operating System Requirements

| Requirement               | Value                  | Rationale                                                                |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Minimum macOS version     | 13.0 (Ventura)         | WebView2/WKWebView API baseline; AXUIElement stability; Tauri v2 minimum |
| Recommended macOS version | 14.0 (Sonoma) or newer | Best performance; latest security patches; improved VoiceOver            |
| Maximum tested version    | 15.x (Sequoia)         | Forward-compatibility validated in CI                                    |

## 2.2 Hardware Requirements

| Component         | Minimum                              | Recommended                              |
| ----------------- | ------------------------------------ | ---------------------------------------- |
| Processor         | Apple M1 or Intel Core i5 (2018+)    | Apple M2 Pro or newer                    |
| RAM               | 8 GB                                 | 16 GB (32 GB for local LLM inference)    |
| Disk space (app)  | 250 MB (base install)                | 500 MB (with local models cache)         |
| Disk space (data) | 500 MB                               | 2 GB (conversations, embeddings, caches) |
| Display           | 1280x800 minimum                     | Retina display recommended               |
| Network           | Optional (offline with local models) | Broadband for cloud LLM streaming        |

## 2.3 Architecture Targets

| Target        | Rust Triple              | Notes                                       |
| ------------- | ------------------------ | ------------------------------------------- |
| Apple Silicon | `aarch64-apple-darwin`   | Native ARM64; primary development target    |
| Intel         | `x86_64-apple-darwin`    | Native x86_64 for older Macs                |
| Universal     | `universal-apple-darwin` | Fat binary combining both; release artifact |

The universal binary is the sole distribution artifact. It is produced via `cargo build --target universal-apple-darwin` which links both architecture slices into a single Mach-O binary. This ensures a single DMG serves all Mac users.

## 2.4 Distribution Format

| Format              | Purpose                                            | Signing                                 |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| `.dmg` (disk image) | Primary distribution; drag-to-Applications install | Developer ID Application + Notarization |
| GitHub Releases     | Hosting for auto-updater endpoint                  | Ed25519 signature on update payload     |
| Direct download     | Website download page at agiworkforce.com/download | HTTPS + hash verification               |

No Mac App Store distribution is planned for v1.x due to sandbox restrictions that would prevent terminal execution, accessibility API access, and MCP stdio server spawning. Mac App Store submission is a v2.0 milestone with feature-flagged sandbox-compatible mode.

## 2.5 Technology Stack

### 2.5.1 Desktop Framework

| Layer               | Technology                                  | Version                       |
| ------------------- | ------------------------------------------- | ----------------------------- |
| Desktop framework   | Tauri                                       | 2.9.3                         |
| Frontend framework  | React                                       | 19.2.4                        |
| Build tool          | Vite                                        | 7.3.1                         |
| Frontend language   | TypeScript                                  | 5.9.3 (strict mode)           |
| Backend language    | Rust                                        | 1.90.0 (edition 2021)         |
| CSS framework       | Tailwind CSS                                | 4.2.1                         |
| UI primitives       | Radix UI                                    | latest (15+ components)       |
| State management    | Zustand                                     | 5.0.11 (+ Immer 11 + Persist) |
| Icons               | Lucide React                                | 0.575.0                       |
| Toast notifications | Sonner                                      | 2.0.7                         |
| Routing             | react-router-dom                            | 7.13.1                        |
| Code editor         | Monaco Editor                               | 0.55.1                        |
| Terminal emulator   | xterm.js                                    | 6.0.0                         |
| Charts              | Recharts                                    | 3.7.0                         |
| Markdown            | react-markdown + remark-gfm + KaTeX         | latest                        |
| Syntax highlighting | react-syntax-highlighter                    | 16.1.0                        |
| Animations          | Framer Motion                               | 12.34.3                       |
| Search              | Fuse.js                                     | 7.1.0                         |
| Validation          | Zod                                         | 4.3.6                         |
| i18n                | i18next + react-i18next                     | latest                        |
| QR code             | qrcode                                      | 1.5.4                         |
| PDF viewer          | pdfjs-dist                                  | 5.4.624                       |
| Diff viewer         | react-diff-viewer-continued                 | 3.4.0                         |
| Virtualization      | react-window + react-virtualized-auto-sizer | latest                        |

### 2.5.2 Rust Backend Stack

| Category         | Crate                                                                                      | Version                  | Purpose                           |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------- |
| Async runtime    | tokio                                                                                      | 1.37 (full)              | All async I/O                     |
| HTTP client      | reqwest                                                                                    | 0.12 (rustls-tls)        | LLM API calls, no native-tls      |
| Database         | rusqlite                                                                                   | 0.31 (bundled-sqlcipher) | Encrypted local storage           |
| Async DB         | tokio-rusqlite                                                                             | 0.5                      | Non-blocking DB queries           |
| Serialization    | serde + serde_json                                                                         | 1.0                      | All data marshalling              |
| Concurrency      | rayon 1.10 + dashmap 6.1 + parking_lot 0.12                                                | -                        | Parallel processing               |
| Crypto           | argon2 0.5 + aes-gcm 0.10 + sha2 0.10 + ed25519-dalek 2.1                                  | -                        | Secret encryption, update signing |
| Token counting   | tiktoken-rs                                                                                | 0.9.1                    | Pre-flight context validation     |
| Screen capture   | xcap                                                                                       | 0.0.12                   | macOS screen capture              |
| Input simulation | enigo 0.6 + rdev 0.5                                                                       | -                        | Keyboard/mouse automation         |
| Terminal         | portable-pty                                                                               | 0.8                      | Shell session management          |
| PDF              | pdf-extract + lopdf + printpdf                                                             | -                        | Document read/write               |
| DOCX             | docx-rs                                                                                    | 0.4                      | Word document support             |
| XLSX             | calamine + rust_xlsxwriter                                                                 | -                        | Spreadsheet read/write            |
| Email            | async-imap + lettre                                                                        | -                        | IMAP read, SMTP send              |
| Git              | git2                                                                                       | 0.20 (vendored-openssl)  | Version control                   |
| Image            | image 0.25 + imageproc 0.26                                                                | -                        | Image processing                  |
| Logging          | tracing + tracing-subscriber + tracing-appender                                            | 0.1/0.3/0.2              | Structured logging                |
| macOS APIs       | accessibility-sys 0.1.2 + core-foundation 0.9 + core-graphics 0.24 + objc 0.2 + cocoa 0.25 | -                        | Native macOS integration          |
| Keyring          | keyring 3                                                                                  | -                        | macOS Keychain access             |
| Audio            | cpal 0.15                                                                                  | -                        | Microphone capture                |
| VAD              | webrtc-vad 0.4 (optional)                                                                  | -                        | Voice activity detection          |
| Whisper          | whisper-rs 0.11 (optional)                                                                 | -                        | Local speech-to-text              |
| Scheduling       | tokio-cron-scheduler 0.15 + cron 0.12                                                      | -                        | Background job scheduling         |
| WebSocket        | tokio-tungstenite 0.21                                                                     | -                        | Realtime communication            |
| OAuth            | oauth2 4.4                                                                                 | -                        | Google/GitHub/Microsoft OAuth     |
| Billing          | async-stripe 0.31                                                                          | -                        | Stripe integration                |

### 2.5.3 macOS-Specific Dependencies

| Crate               | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `accessibility-sys` | `AXIsProcessTrusted()`, `AXUIElementCreateSystemWide()` — accessibility tree inspection |
| `core-foundation`   | CFString, CFRunLoop, property list handling                                             |
| `core-graphics`     | `CGEventTap` for global shortcuts, display enumeration for screen capture               |
| `objc`              | Objective-C runtime bridge for Cocoa API calls                                          |
| `cocoa`             | NSWindow, NSApplication, NSUserNotification, NSPasteboard                               |
| `keyring`           | macOS Keychain read/write for credential storage fallback                               |

## 2.6 Feature Flags

Rust feature flags control platform capabilities and optional dependencies. These are compile-time decisions:

| Flag               | Default      | Purpose                                   | macOS Impact                               |
| ------------------ | ------------ | ----------------------------------------- | ------------------------------------------ |
| `shell`            | ON           | Tauri shell plugin for terminal execution | Required for all terminal/command features |
| `updater`          | ON           | Tauri updater plugin for auto-update      | Required for DMG auto-update flow          |
| `devtools`         | ON (default) | Tauri DevTools panel                      | Enabled in dev builds, stripped in release |
| `billing`          | ON (default) | Stripe billing integration                | Enables subscription management            |
| `vad`              | ON (default) | WebRTC voice activity detection           | Enables hands-free push-to-talk            |
| `remote-databases` | ON (default) | PostgreSQL, MySQL, MongoDB, Redis clients | Enables external database connections      |
| `ocr`              | OFF          | Tesseract OCR bindings                    | Requires `brew install tesseract`          |
| `local-llm`        | OFF          | llama-cpp-2 for embedded inference        | Large binary; opt-in for local model users |
| `local-whisper`    | OFF          | Whisper.cpp for offline STT               | Requires whisper.cpp build                 |
| `webrtc-support`   | OFF          | WebRTC peer communications                | Enables direct mobile pairing              |
| `sentry`           | OFF          | Sentry error tracking                     | Optional crash reporting                   |

---

# 3. Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Core Chat & LLM (P0)

| ID      | Feature                                                                                | Priority | Status      | macOS-Specific |
| ------- | -------------------------------------------------------------------------------------- | -------- | ----------- | -------------- |
| FR-M101 | Multi-provider LLM routing (11 providers)                                              | P0       | Implemented | No             |
| FR-M102 | Seven routing strategies (Auto, Economy, Balanced, Premium, Cost, Latency, LocalFirst) | P1       | Implemented | No             |
| FR-M103 | Session cost cap ($50 hard limit)                                                      | P1       | Implemented | No             |
| FR-M104 | Dual HTTP client (streaming 300s, standard 120s)                                       | P0       | Implemented | No             |
| FR-M105 | Per-provider circuit breaker                                                           | P1       | Implemented | No             |
| FR-M106 | Provider-specific SSE parser                                                           | P0       | Implemented | No             |
| FR-M107 | LLM response caching (LRU, 512 entries, 24h TTL)                                       | P2       | Implemented | No             |
| FR-M108 | Per-provider token cost calculation                                                    | P1       | Implemented | No             |
| FR-M109 | Token counting (tiktoken-rs pre-flight)                                                | P1       | Implemented | No             |
| FR-M110 | Rich request parameters (thinking, tools, multimodal)                                  | P0       | Implemented | No             |
| FR-M111 | Multimodal content (text, image, video, audio, document)                               | P0       | Implemented | No             |
| FR-M112 | Extended thinking / reasoning display                                                  | P1       | Implemented | No             |
| FR-M113 | Server-side tool support (WebSearch, CodeInterpreter, etc.)                            | P1       | Implemented | No             |
| FR-M114 | Credits and daily limit tracking                                                       | P1       | Implemented | No             |
| FR-M115 | 26 chat commands (send, create, list, stop, compact, etc.)                             | P0       | Implemented | No             |
| FR-M116 | Custom model endpoints (Ollama, LM Studio, vLLM, any OpenAI-compatible)                | P0       | Implemented | No             |
| FR-M117 | Conversation state management                                                          | P1       | Implemented | No             |
| FR-M118 | Conversation branching and forking                                                     | P2       | Implemented | No             |
| FR-M119 | Conversation export (JSON, PDF)                                                        | P2       | Implemented | No             |
| FR-M120 | Chat history search (FTS5)                                                             | P1       | Implemented | No             |

### 3.1.2 Agent & Automation (P0)

| ID      | Feature                                                              | Priority | Status      | macOS-Specific |
| ------- | -------------------------------------------------------------------- | -------- | ----------- | -------------- |
| FR-M201 | Agent lifecycle manager (AgentRuntime)                               | P0       | Implemented | No             |
| FR-M202 | Task planning (TaskPlanner, recursive decomposition)                 | P0       | Implemented | No             |
| FR-M203 | Autonomous execution loop                                            | P0       | Implemented | No             |
| FR-M204 | Background agents (detached, persistent)                             | P1       | Implemented | No             |
| FR-M205 | Persistent task checkpoints (SQLite)                                 | P1       | Implemented | No             |
| FR-M206 | Continuous/scheduled execution (cron, interval)                      | P1       | Implemented | No             |
| FR-M207 | Per-tool approval control (Ask, AutoApproveReadOnly, AutoApproveAll) | P0       | Implemented | No             |
| FR-M208 | Undo manager (file + form mutations)                                 | P1       | Implemented | No             |
| FR-M209 | Context compaction (summarize + truncate)                            | P1       | Implemented | No             |
| FR-M210 | Timeout management (per-step, per-goal)                              | P1       | Implemented | No             |
| FR-M211 | AGI Core execution engine (17 domain executors)                      | P0       | Implemented | No             |
| FR-M212 | Hierarchical goal decomposition                                      | P0       | Implemented | No             |
| FR-M213 | Reflection and failure recovery                                      | P1       | Implemented | No             |
| FR-M214 | Knowledge base (structured facts)                                    | P1       | Implemented | No             |
| FR-M215 | Code execution sandbox                                               | P1       | Implemented | No             |
| FR-M216 | Swarm orchestrator (up to 100 concurrent agents)                     | P1       | Implemented | No             |
| FR-M217 | Parallel task decomposition (dependency graph)                       | P1       | Implemented | No             |
| FR-M218 | Dynamic sub-agent spawning                                           | P1       | Implemented | No             |

### 3.1.3 Computer Use & Desktop Automation (P1)

| ID      | Feature                                              | Priority | Status      | macOS-Specific               |
| ------- | ---------------------------------------------------- | -------- | ----------- | ---------------------------- |
| FR-M301 | Observe-Plan-Act loop (screenshot → vision → action) | P1       | Implemented | Yes (xcap for capture)       |
| FR-M302 | Vision-guided automation (AI element location)       | P1       | Implemented | Yes (AXUIElement primary)    |
| FR-M303 | AXUIElement accessibility tree inspector             | P1       | Implemented | Yes (macOS exclusive)        |
| FR-M304 | Input simulation (keyboard, mouse, clipboard)        | P1       | Implemented | Yes (enigo + rdev)           |
| FR-M305 | Browser automation (CDP + extension bridge)          | P1       | Implemented | No                           |
| FR-M306 | Action recording and playback                        | P2       | Implemented | No                           |
| FR-M307 | Screen watching (continuous monitoring)              | P2       | Implemented | No                           |
| FR-M308 | Screen capture (full, region, window)                | P1       | Implemented | Yes (xcap macOS)             |
| FR-M309 | OCR (Tesseract-based, optional feature flag)         | P1       | Implemented | Yes (brew install tesseract) |

### 3.1.4 Tools & Integrations (P1)

| ID      | Feature                                                           | Priority | Status      | macOS-Specific            |
| ------- | ----------------------------------------------------------------- | -------- | ----------- | ------------------------- |
| FR-M401 | MCP server manager (stdio, SSE, HTTP)                             | P0       | Implemented | No                        |
| FR-M402 | MCP health monitoring (30s polling)                               | P1       | Implemented | No                        |
| FR-M403 | MCP tool registry (auto-discovery, caching)                       | P0       | Implemented | No                        |
| FR-M404 | MCP extension installer                                           | P2       | Implemented | No                        |
| FR-M405 | Email client (IMAP read, SMTP send, Gmail OAuth)                  | P1       | Partial     | No                        |
| FR-M406 | Calendar integration (Google Calendar, Outlook)                   | P1       | Partial     | No                        |
| FR-M407 | Cloud storage (Drive, Dropbox, OneDrive with E2E encryption)      | P1       | Partial     | No                        |
| FR-M408 | Document processing (PDF, DOCX, XLSX read/write)                  | P1       | Implemented | No                        |
| FR-M409 | AI-assisted terminal (PTY, shell detection, AI suggestions)       | P1       | Implemented | No                        |
| FR-M410 | Multi-database client (SQLite, PostgreSQL, MySQL, MongoDB, Redis) | P1       | Implemented | No                        |
| FR-M411 | Git operations (full workflow: init through merge)                | P1       | Implemented | No                        |
| FR-M412 | AI-native code editing (diff-based apply/reject)                  | P1       | Implemented | No                        |
| FR-M413 | Generic API operations (REST, OAuth flows)                        | P1       | Implemented | No                        |
| FR-M414 | Web search                                                        | P1       | Partial     | No                        |
| FR-M415 | Native messaging bridge (Chrome extension)                        | P1       | Implemented | Yes (macOS manifest path) |

### 3.1.5 Memory & Intelligence (P1)

| ID      | Feature                                                           | Priority | Status      | macOS-Specific |
| ------- | ----------------------------------------------------------------- | -------- | ----------- | -------------- |
| FR-M501 | Workspace embedding index (IncrementalIndexer)                    | P1       | Implemented | No             |
| FR-M502 | Code chunking (semantic function/class splitting)                 | P1       | Implemented | No             |
| FR-M503 | Similarity search (cosine)                                        | P1       | Implemented | No             |
| FR-M504 | RAG pipeline (chunk retrieval + context injection)                | P1       | Implemented | No             |
| FR-M505 | Hybrid search (semantic + FTS5)                                   | P1       | Implemented | No             |
| FR-M506 | Persistent memory store (Preference, Fact, Decision, Context)     | P1       | Implemented | No             |
| FR-M507 | Intent classifier (pattern matching + LLM)                        | P1       | Implemented | No             |
| FR-M508 | Research mode (Quick/Standard/Deep/Exhaustive)                    | P1       | Implemented | No             |
| FR-M509 | Skills manager (SKILL.md loading, trigger detection)              | P1       | Implemented | No             |
| FR-M510 | Project memory (ArchitecturalDecision, CodingStyle)               | P1       | Implemented | No             |
| FR-M511 | Conversation summarizer (automatic memory extraction)             | P1       | Implemented | No             |
| FR-M512 | Embeddings via HttpSummaryLLM (Ollama -> OpenAI -> None fallback) | P1       | Implemented | No             |

### 3.1.6 Voice & Audio (P1)

| ID      | Feature                                                  | Priority | Status      | macOS-Specific            |
| ------- | -------------------------------------------------------- | -------- | ----------- | ------------------------- |
| FR-M601 | Local speech-to-text (Whisper, multiple model sizes)     | P1       | Implemented | No                        |
| FR-M602 | Cloud speech-to-text (Deepgram, real-time)               | P1       | Implemented | No                        |
| FR-M603 | Text-to-speech (Piper local + macOS native TTS fallback) | P1       | Implemented | Yes (NSSpeechSynthesizer) |
| FR-M604 | Voice activity detection (WebRTC VAD)                    | P1       | Implemented | No                        |
| FR-M605 | Wake word detection (configurable phrase)                | P2       | Implemented | No                        |
| FR-M606 | Barge-in detection (interrupt TTS by speaking)           | P2       | Implemented | No                        |
| FR-M607 | Push-to-talk (global hotkey binding)                     | P2       | Implemented | Yes (CGEventTap)          |
| FR-M608 | Voice input overlay (Wispr-style hold-to-record)         | P1       | Implemented | Yes (global shortcut)     |

### 3.1.7 UI & UX Features (P0-P2)

| ID      | Feature                                            | Priority | Status      | macOS-Specific        |
| ------- | -------------------------------------------------- | -------- | ----------- | --------------------- |
| FR-M701 | Unified agentic chat interface                     | P0       | Implemented | No                    |
| FR-M702 | Tool call visualization (timeline, labels, status) | P0       | Implemented | No                    |
| FR-M703 | Simple mode toggle (reduced complexity)            | P2       | Implemented | No                    |
| FR-M704 | Floating chat overlay (always-on-top)              | P2       | Implemented | Yes (NSWindow level)  |
| FR-M705 | Quick query interface (global hotkey palette)      | P2       | Implemented | Yes (Cmd+Space style) |
| FR-M706 | Settings panel (9 tabs)                            | P1       | Implemented | No                    |
| FR-M707 | Artifacts viewer & editor (22 commands)            | P1       | Implemented | No                    |
| FR-M708 | Visual canvas (13 commands)                        | P2       | Implemented | No                    |
| FR-M709 | Usage analytics & ROI dashboard                    | P2       | Implemented | No                    |
| FR-M710 | First-run onboarding                               | P1       | Implemented | No                    |
| FR-M711 | Interactive tutorials                              | P2       | Implemented | No                    |
| FR-M712 | Model comparison panel (side-by-side)              | P2       | Implemented | No                    |
| FR-M713 | Research panel (progress, citations, report)       | P1       | Implemented | No                    |
| FR-M714 | Skill marketplace (grid, categories, search)       | P2       | Implemented | No                    |
| FR-M715 | Governance dashboard (approvals, audit, safety)    | P1       | Implemented | No                    |
| FR-M716 | Scheduling panel (create/edit/list tasks)          | P1       | Implemented | No                    |
| FR-M717 | Background tasks panel (list, status, control)     | P1       | Implemented | No                    |
| FR-M718 | Notification center                                | P2       | Implemented | No                    |

### 3.1.8 Desktop-Specific Features (P1)

| ID      | Feature                                                    | Priority | Status      | macOS-Specific                   |
| ------- | ---------------------------------------------------------- | -------- | ----------- | -------------------------------- |
| FR-M801 | System tray icon with menu                                 | P1       | Implemented | Yes (NSStatusItem)               |
| FR-M802 | Global keyboard shortcuts                                  | P1       | Implemented | Yes (CGEventTap + Accessibility) |
| FR-M803 | Auto-updater (signed delta updates)                        | P1       | Implemented | Yes (DMG + notarization)         |
| FR-M804 | Agent lifecycle hooks (pre/post tool, stop)                | P1       | Implemented | No                               |
| FR-M805 | Instruction file discovery (CLAUDE.md, .cursorrules, etc.) | P1       | Partial     | No                               |
| FR-M806 | Team management (roles, shared billing)                    | P2       | Implemented | No                               |
| FR-M807 | Stripe billing integration                                 | P1       | Implemented | No                               |
| FR-M808 | Workflow marketplace                                       | P2       | Implemented | No                               |
| FR-M809 | Multi-layer cache system (22 commands)                     | P2       | Implemented | No                               |
| FR-M810 | Tauri capability filesystem deny list (19 patterns)        | P0       | Implemented | Yes (Keychain paths)             |

## 3.2 Platform-Exclusive Features (macOS Only)

These features are available exclusively on macOS and have no Windows/Linux equivalent:

| Feature                         | Implementation                                | Notes                                                                     |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| AXUIElement accessibility tree  | `accessibility-sys` crate                     | macOS-only API for UI element inspection; primary method for computer use |
| macOS Keychain integration      | `keyring` crate                               | Fallback credential storage beyond SQLCipher                              |
| macOS native TTS                | `NSSpeechSynthesizer` via `cocoa`             | Fallback when Piper is not available                                      |
| Global shortcuts via CGEventTap | `core-graphics` crate                         | Requires Accessibility permission                                         |
| Universal binary distribution   | `cargo build --target universal-apple-darwin` | Single DMG serves all Mac architectures                                   |
| Apple Developer ID notarization | `xcrun notarytool`                            | Required for Gatekeeper acceptance                                        |
| NSUserNotification              | `tauri-plugin-notification`                   | Native macOS notification center                                          |
| Menu bar tray icon              | NSStatusItem via Tauri tray API               | Persistent status icon with right-click menu                              |
| Accessibility permission flow   | `AXIsProcessTrusted()` check                  | Deferred init until permission granted                                    |
| Full Disk Access flow           | System Preferences redirect                   | Required for reading protected directories                                |

## 3.3 Feature Parity Table vs Competitors

| Feature           | AGI Workforce macOS              | Claude Desktop (macOS) | ChatGPT Desktop (macOS) | Cursor (macOS)  |
| ----------------- | -------------------------------- | ---------------------- | ----------------------- | --------------- |
| **Models**        | 9+ cloud + unlimited local       | Claude only            | GPT only                | Multi (limited) |
| **Chat**          | Full streaming + branching       | Full streaming         | Full streaming          | Inline only     |
| **Agents**        | Autonomous + background          | No autonomous          | No autonomous           | No autonomous   |
| **Swarm**         | 100 concurrent agents            | None                   | None                    | None            |
| **Computer Use**  | Full (AXUIElement + vision)      | Beta (limited)         | None                    | None            |
| **Voice**         | Full (STT + TTS + VAD)           | None                   | Voice mode              | None            |
| **MCP Tools**     | Unlimited (3 transports)         | Limited MCP            | None                    | 40 tool cap     |
| **Terminal**      | Full PTY + AI assist             | None                   | None                    | Integrated      |
| **Code Editing**  | Diff-based + Monaco              | None                   | None                    | Full IDE        |
| **Documents**     | PDF/DOCX/XLSX read+write         | None                   | Upload only             | None            |
| **Email**         | IMAP/SMTP + Gmail OAuth          | None                   | None                    | None            |
| **Calendar**      | Google + Outlook OAuth           | None                   | None                    | None            |
| **Cloud Storage** | Drive/Dropbox/OneDrive E2E       | None                   | None                    | None            |
| **Memory**        | Persistent + semantic            | Project memory         | Conversation memory     | Project context |
| **Research**      | Multi-source + citations         | None                   | Web browsing            | None            |
| **Skills**        | 140+ non-coding                  | None                   | None                    | None            |
| **Canvas**        | Visual spatial canvas            | None                   | Canvas (limited)        | None            |
| **Scheduling**    | Cron + interval + one-time       | None                   | None                    | None            |
| **Analytics**     | ROI + usage + cost               | None                   | None                    | None            |
| **Offline**       | Full (local models)              | None                   | None                    | Partial         |
| **Tray Icon**     | Full menu + status               | Basic icon             | Basic icon              | None            |
| **Updater**       | Signed auto-update               | Auto-update            | Auto-update             | Auto-update     |
| **Security**      | ToolGuard + Argon2id + SQLCipher | Basic sandboxing       | Basic sandboxing        | None            |
| **Teams**         | Role-based + shared billing      | None                   | Teams plan              | None            |
| **Mobile**        | QR-pair companion app            | Remote (Max only)      | None                    | None            |

## 3.4 Implementation Notes for Key Features

### 3.4.1 Multi-Provider LLM Routing (FR-M101)

The LLM routing engine (`llm_router.rs`, 2,274 lines) is the core intelligence layer. It accepts a routing request containing the user message, model preference, and conversation context, then:

1. **Model ID normalization**: `normalize_model_id()` converts dot-format IDs (`claude-opus-4.6`) to hyphen-format (`claude-opus-4-6`) using the `models.json` canonicalization map. This normalization happens at the router entry point for routing decisions only — the original model ID is preserved for API payloads sent to providers.

2. **Provider resolution**: The router maps the normalized model ID to a provider adapter. Each of the 11 providers has a dedicated adapter in `provider_adapter.rs` that knows how to format the HTTP request body, set auth headers, and parse the response.

3. **Circuit breaker check**: Before sending the request, the router checks the provider's circuit breaker state. If the circuit is open (provider has failed 3+ times within 30 seconds), the router either returns an error or falls back to the next available provider in the routing strategy's priority list.

4. **HTTP client selection**: The router selects from two pre-configured `reqwest::Client` instances:
   - **Streaming client**: 300-second timeout (for SSE streaming responses)
   - **Standard client**: 120-second timeout (for non-streaming tool calls)

5. **Request dispatch**: The provider adapter builds the HTTP request with provider-specific headers, body format, and query parameters. The request is dispatched via tokio with full async/await.

6. **Response parsing**: The SSE parser (`sse_parser.rs`) handles provider-specific stream formats, extracting tokens, tool use blocks, and completion signals.

7. **Cost calculation**: After the stream completes, the router calculates the exact cost using per-token pricing from the model catalog (`models.json`), accounting for cache read/write tokens where applicable (Anthropic prompt caching).

**Routing strategies**:

| Strategy   | Behavior                                        | When to Use                        |
| ---------- | ----------------------------------------------- | ---------------------------------- |
| Auto       | Selects model based on task complexity analysis | Default — good for mixed workloads |
| Economy    | Cheapest model that can handle the task         | Budget-conscious users             |
| Balanced   | Mid-tier model (cost/quality tradeoff)          | General use                        |
| Premium    | Best available model regardless of cost         | Quality-critical tasks             |
| Cost       | Strictly cheapest by input/output token price   | Batch processing                   |
| Latency    | Fastest time-to-first-token                     | Interactive use                    |
| LocalFirst | Prefers Ollama/local models, cloud fallback     | Privacy-focused users              |

### 3.4.2 Autonomous Agent Loop (FR-M203)

The autonomous execution loop runs in a Rust tokio task, separate from the UI thread. The loop follows this lifecycle:

```
1. PLAN   → LLM generates a multi-step plan from the user's goal
2. EXECUTE → Each step is executed sequentially (or in parallel via swarm)
3. OBSERVE → Results of each step are observed and evaluated
4. REFLECT → Agent assesses progress, adjusts plan if needed
5. LOOP   → Steps 2-4 repeat until goal is achieved or max iterations reached
```

**Key parameters**:

- `max_iterations`: Maximum loop iterations before forced stop (default: 25, configurable per task)
- `step_timeout`: Maximum time per individual step (default: 120 seconds)
- `goal_timeout`: Maximum total time for the entire goal (default: 3600 seconds)
- `approval_mode`: Controls whether tool calls require user approval (`Ask`, `AutoApproveReadOnly`, `AutoApproveAll`)

**Agentic events emitted during execution**:

- `agentic:loop-started` — Emitted once when the loop begins, includes `conversation_id` and `max_iterations`
- `agentic:loop-status` — Emitted after each iteration, includes current `step` number and `description` of what the agent is doing
- `agentic:loop-ended` — Emitted once when the loop terminates, includes `success` flag and optional `error`
- `agentic:message-consumed` — Emitted when a pending message queued by the user during execution is consumed by the agent

**Tool execution during agent loop**:
When the LLM requests a tool call, the executor:

1. Emits `tool:event` (Started) with `display_name` and `display_args`
2. Checks ToolGuard safety tier for the tool
3. If tier is `RequiresConfirmation` or `RequiresExplicitApproval` and approval mode is not `AutoApproveAll`, emits an approval request and waits
4. Executes the tool (file read, terminal command, web search, MCP call, etc.)
5. Emits `tool:event` (Completed) with `duration_ms`, `result_preview`, and `success` flag
6. Injects the tool result back into the LLM context for the next iteration

### 3.4.3 ToolGuard Sandboxing (FR-M207)

ToolGuard (`tool_guard.rs`, 1,778 lines) is the security layer that validates all tool executions before they proceed. It implements a three-tier safety model:

**Safety tiers**:

| Tier                       | Approval Required                  | Examples                                                     |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `Safe`                     | Never                              | `file_read`, `code_search`, `git_status`, `memory_search`    |
| `RequiresConfirmation`     | Unless auto-approved               | `file_write`, `terminal_execute`, `git_commit`, `email_send` |
| `RequiresExplicitApproval` | Always (even in auto-approve mode) | `file_delete` in system dirs, `rm -rf`, `sudo`, `curl \| sh` |

**Capability deny list** (19 patterns blocked unconditionally):

- `/System/**`, `/usr/**`, `/Library/**`, `/private/**` (system directories)
- `~/Library/Keychains/**` (macOS Keychain files)
- `~/.ssh/**`, `~/.gnupg/**` (SSH and GPG keys)
- `**/.env`, `**/.env.*` (environment files with secrets)
- Any path matching `**/credentials*`, `**/secrets*`, `**/tokens*`

**Trusted workflows**: When a user approves a sequence of tool calls, the sequence is hashed and stored as a "trusted workflow." Subsequent identical sequences skip confirmation prompts, enabling efficient batch processing without repeated approval dialogs.

### 3.4.4 MCP Server Management (FR-M401)

The MCP (Model Context Protocol) subsystem supports three transport types:

**stdio transport** (most common):

1. Desktop spawns a child process specified by `command` and `args`
2. Communication happens over stdin/stdout using JSON-RPC 2.0
3. Process lifecycle is managed by the MCP manager (restart on crash, graceful shutdown)
4. Environment variables can be injected via `env` config

**SSE transport**:

1. Desktop opens an HTTP connection to the SSE endpoint (`url`)
2. Server sends events as SSE stream
3. Desktop sends requests via HTTP POST to a companion endpoint
4. Connection is maintained with heartbeat pings

**Streamable HTTP transport**:

1. Desktop sends HTTP POST requests with JSON-RPC payloads
2. Server responds with streaming HTTP responses
3. Custom headers can be specified via `headers` config

**Health monitoring**: Every 30 seconds, the MCP manager polls each connected server with a `tools/list` call. If the server fails to respond within 5 seconds, it increments the circuit breaker failure count. After 3 failures, the circuit opens and the server is marked as `degraded`. After a 30-second cooldown, the circuit moves to `HalfOpen` and a single test call is made. If the test succeeds, the circuit closes and the server returns to `healthy`.

**Tool discovery**: When a server connects, the MCP manager calls `tools/list` to discover all available tools. Each tool's `inputSchema` is cached and used for argument validation before tool calls. Tools are merged into the global tool registry and appear in the chat interface's tool picker.

### 3.4.5 Computer Use — Observe-Plan-Act Loop (FR-M301)

The OPA (Observe-Plan-Act) loop enables vision-guided desktop automation:

**Observe phase**:

1. Capture screenshot via `xcap` (macOS-native screen capture)
2. Optionally query the AXUIElement accessibility tree for structured element info
3. Encode screenshot as base64 PNG and send to the LLM with the current goal
4. LLM analyzes the screenshot and returns:
   - Description of what it sees on screen
   - Identified UI elements and their approximate locations
   - Recommended next action

**Plan phase**:

1. LLM generates a plan based on the observation
2. Plan includes specific actions (click coordinates, text to type, keys to press)
3. Safety check: actions targeting system-level UI (menu bar, dock, system preferences) require explicit approval

**Act phase**:

1. Execute the planned action via desktop automation primitives:
   - Mouse: `enigo` crate for click, double-click, right-click, drag
   - Keyboard: `enigo` crate for typing text and key combinations
   - Clipboard: `arboard` crate for clipboard read/write
2. Wait for the action to take effect (configurable delay, default 500ms)
3. Return to Observe phase

**AXUIElement integration (macOS-exclusive)**:

- Before vision-based element location, the OPA loop queries macOS Accessibility API
- `AXUIElement` provides exact bounds, roles, labels, and states of UI elements
- When available, element coordinates from AXUIElement are preferred over vision-based estimation
- Requires the user to grant Accessibility permission in System Preferences
- Deferred initialization: the automation subsystem checks `AXIsProcessTrusted()` at launch and initializes AXUIElement support only after permission is confirmed

### 3.4.6 Voice Input — Hold-to-Speak (FR-M608)

Voice input follows the Wispr Flow pattern: hold a global hotkey to record, release to transcribe and insert.

**Recording pipeline**:

1. User holds `Ctrl+Space` (configurable global hotkey registered via CGEventTap)
2. `speech_start_recording` Tauri command initializes microphone capture via `cpal` crate
3. Audio is captured at 16kHz mono (Whisper-compatible format)
4. Voice Activity Detection (WebRTC VAD) filters silence
5. Audio waveform level is streamed to frontend for visual feedback (VoiceInputOverlay)
6. On hotkey release, `speech_stop_and_transcribe` is called

**Transcription pipeline** (3-tier fallback):

1. **Local Whisper** (if `local-whisper` feature flag enabled): `whisper-rs` crate runs Whisper model on-device
2. **Deepgram Cloud** (if API key configured): Streams audio to Deepgram's real-time API
3. **macOS native STT** (fallback): Uses `NSSpeechRecognizer` for basic transcription

**Result insertion**:

- Transcribed text is inserted at the cursor position in the ChatInputArea
- If the chat input is empty, the full transcription becomes the message
- If the chat input has existing text, the transcription is appended at the cursor position

### 3.4.7 Background Agents (FR-M204)

Background agents run as detached tokio tasks that persist even when the user switches to a different conversation or minimizes the app.

**Lifecycle**:

1. User sends a message with agent mode enabled, then starts a new conversation
2. The original agent continues executing in the background
3. System tray icon shows a badge with the number of running background agents
4. Frontend polls `background_agent_list` every 5 seconds for status updates
5. On completion, a macOS notification is shown via NSUserNotification

**Persistence**:

- Agent state is checkpointed to SQLite every 10 iterations
- If the app crashes or is force-quit, background agents resume from last checkpoint on next launch
- Checkpoint data includes: current iteration, conversation history, pending tool calls, partial results

**Resource management**:

- Maximum concurrent background agents is tier-gated (Free: 1, Hobby: 3, Pro: 10, Max: 20)
- Each background agent reserves ~50MB RAM for conversation context
- CPU-intensive operations (embeddings, local model inference) are rate-limited to prevent background agents from starving the foreground

### 3.4.8 Conversation Compaction (FR-M209)

When conversation context approaches the model's token limit, the compaction system activates:

1. **Trigger**: Input token count exceeds 80% of model context window
2. **Summary generation**: Sends the oldest messages (up to 40% of context) to the LLM with a summarization prompt
3. **Replacement**: Replaces the summarized messages with a single "context summary" message
4. **Metadata preservation**: Original messages are not deleted — they remain in SQLCipher for history search and export
5. **User notification**: A subtle toast appears: "Context compacted — older messages summarized to free space"

**Automatic vs manual**:

- **Automatic**: Enabled by default in settings (`autoCompactContext: true`). Triggers transparently.
- **Manual**: User can invoke via slash command `/compact` or the Command Palette

### 3.4.9 Swarm Orchestration (FR-M216)

The swarm orchestrator enables parallel multi-agent task execution:

1. **Goal decomposition**: The coordinator agent breaks the user's goal into independent sub-tasks
2. **Dependency analysis**: Sub-tasks are analyzed for dependencies. Independent tasks run in parallel; dependent tasks run sequentially.
3. **Agent spawning**: Each sub-task is assigned to a spawned agent with its own conversation context
4. **Progress tracking**: The orchestrator maintains a dependency graph with task statuses
5. **Result aggregation**: As sub-tasks complete, their results are collected and synthesized into a final report
6. **Failure handling**: If a sub-task fails, the orchestrator can retry, skip (if non-critical), or abort the swarm

**Limits**: Maximum 100 concurrent agents (Max tier). Each agent uses the model specified in the swarm config or inherits the parent's model selection.

### 3.4.10 Research Mode (FR-M508)

Research mode performs multi-source web research with citations:

| Depth      | Sources Searched | Time Estimate | Output Length    |
| ---------- | ---------------- | ------------- | ---------------- |
| Quick      | 3-5 sources      | 15-30 seconds | 500-1000 words   |
| Standard   | 8-12 sources     | 1-3 minutes   | 1500-3000 words  |
| Deep       | 15-25 sources    | 3-8 minutes   | 3000-6000 words  |
| Exhaustive | 30-50 sources    | 10-30 minutes | 5000-10000 words |

**Pipeline**:

1. **Query formulation**: LLM generates 3-5 search queries from the user's question
2. **Web search**: Queries are sent to search APIs (configurable: DuckDuckGo, Bing, Google)
3. **Source ranking**: Results are ranked by relevance, authority, and recency
4. **Content fetching**: Top sources are fetched and their text content extracted
5. **Analysis**: LLM reads each source, extracts key facts, and identifies consensus/disagreement
6. **Report generation**: LLM synthesizes a structured report with inline citations
7. **Citation verification**: Each claim in the report is linked to its source(s)

---

# 4. Screen-by-Screen UI Specification

## 4.1 Application Shell

### 4.1.1 Window Chrome

**Screen name**: Application Window
**Route**: N/A (native window frame)
**Purpose**: The outermost container providing the native macOS window controls and the application's structural layout.

**Layout**:

- macOS native title bar with traffic light buttons (close, minimize, maximize) at top-left
- Custom drag region spanning the title bar area
- No native menu bar text in the title bar; the app name appears in the macOS menu bar
- Window state is persisted via `tauri-plugin-window-state` (position, size, maximized state)

**Window dimensions**:

- Default: 1200 x 800 pixels
- Minimum: 800 x 600 pixels
- Maximum: no limit (responds to display bounds)

**State variations**:

- Normal: standard window with resize handles
- Maximized: fills the screen (via green traffic light or `Cmd+Ctrl+F`)
- Fullscreen: true macOS fullscreen (separate Space)
- Floating: always-on-top mini window (toggle via `Cmd+Shift+F`)
- Docked: side-docked to screen edge (left or right)
- Pinned: always-on-top standard window (toggle via tray menu)

**macOS keyboard shortcuts**:
| Shortcut | Action |
|---|---|
| `Cmd+Q` | Quit application |
| `Cmd+W` | Close window (minimize to tray) |
| `Cmd+M` | Minimize to dock |
| `Cmd+H` | Hide application |
| `Cmd+Ctrl+F` | Toggle fullscreen |
| `Cmd+,` | Open Settings |
| `Cmd+N` | New conversation |
| `Cmd+T` | New conversation (alternate) |
| `Cmd+Shift+F` | Toggle floating mode |
| `Cmd+K` | Open command palette |
| `Cmd+/` | Toggle sidebar |
| `Cmd+.` | Stop generation |
| `Cmd+Enter` | Send message |
| `Cmd+Shift+Enter` | Send with agent mode |
| `Option+Space` | Global: Quick Query overlay (requires Accessibility permission) |
| `Cmd+Shift+V` | Voice input (hold to record, release to transcribe) |

### 4.1.2 App Layout (AppLayout.tsx)

**Screen name**: Main Application Layout
**Route**: `/` (root)
**Purpose**: The structural skeleton containing the sidebar, main content area, and optional sidecar panels.

**Layout description**:

```
+-----------------------------------------------------------+
| [macOS title bar with traffic lights]        [Window ctrls]|
+--------+--------------------------------------------------+
|        |                                                    |
| Sidebar|              Main Content Area                     |
| (280px)|              (flex-1)                              |
|        |                                                    |
|  Logo  |   +------------------------------------------+    |
|  ----  |   |                                          |    |
|  Conv. |   |    Content varies by route:              |    |
|  List  |   |    - Chat (default)                      |    |
|  ----  |   |    - Agent view                          |    |
|  Quick |   |    - Settings                            |    |
|  Actions   |    - Research                            |    |
|        |   |    - Canvas                              |    |
|  ----  |   |    - Analytics                           |    |
|  User  |   |                                          |    |
|  Menu  |   +------------------------------------------+    |
|        |                                                    |
+--------+--------------------------------------------------+
```

**Component inventory**:

Sidebar (280px width, collapsible):

- **Logo area** (top): AGI Workforce logo icon (24x24) + "AGI Workforce" text label
- **New Conversation button**: `+` icon button, label "New Chat", keyboard shortcut hint `Cmd+N`
- **Search input**: text input with placeholder "Search conversations...", magnifying glass icon, keyboard shortcut hint `Cmd+F`
- **Conversation list**: virtualized scrollable list of conversation items
  - Each item: title text (truncated at 200px), timestamp ("2m ago", "Yesterday", "Mar 5"), model icon badge, pin indicator
  - Selected state: blue background highlight
  - Hover state: light gray background
  - Right-click context menu: Rename, Pin/Unpin, Archive, Export, Delete
- **Quick actions section**: divider label "Quick Actions"
  - "Agent Mode" button with robot icon
  - "Research" button with globe icon
  - "Computer Use" button with monitor icon
  - "Voice Chat" button with microphone icon
- **User section** (bottom):
  - User avatar (from Supabase profile) or initials circle
  - User email (truncated)
  - Settings gear icon button
  - Subscription badge (Free, Hobby, Pro, Max, Team, Enterprise)

Main Content Area (flex-1):

- Renders the active route component
- Default route: UnifiedAgenticChat
- Transition: no animation, instant swap

**Interaction flows**:

- User clicks `+` or presses `Cmd+N` → new conversation created via `chat_create_conversation` invoke → conversation list updates → empty chat view displayed
- User clicks a conversation item → messages loaded via `chat_get_messages` → chat view populated
- User clicks gear icon → Settings panel opens as overlay
- User right-clicks conversation → context menu appears → action dispatched
- User types in search → conversation list filtered in real-time via Fuse.js

**Navigation paths**:

- From sidebar: click conversation → Chat view
- From sidebar: click Quick Action → switches to appropriate mode
- From sidebar: click Settings → Settings overlay
- From any screen: `Cmd+K` → Command Palette overlay

**State variations**:

- **Sidebar collapsed**: only icons visible (48px width), tooltips on hover
- **Sidebar expanded**: full 280px with labels
- **No conversations**: empty state in conversation list showing "Start your first conversation" message with CTA button
- **Offline mode**: orange banner at top of sidebar "Offline — local models only"

## 4.1.3 macOS Menu Bar Integration

**Purpose**: Standard macOS application menu bar providing keyboard-discoverable access to all features.

**Menu structure**:

**AGI Workforce** (application menu):

- "About AGI Workforce" → modal with version, build number, copyright, licenses
- "Check for Updates..." → triggers update check
- Separator
- "Preferences..." (`Cmd+,`) → opens Settings panel
- "Services" → standard macOS Services submenu
- Separator
- "Hide AGI Workforce" (`Cmd+H`)
- "Hide Others" (`Cmd+Option+H`)
- "Show All"
- Separator
- "Quit AGI Workforce" (`Cmd+Q`)

**File** menu:

- "New Conversation" (`Cmd+N`)
- "Open Project Folder..." (`Cmd+O`) → system folder picker
- Separator
- "Export Conversation..." → export options (JSON, Markdown, PDF)
- "Export All Data..." → comprehensive data export (ZIP)
- Separator
- "Close Window" (`Cmd+W`) → minimizes to tray (configurable: close vs hide)

**Edit** menu:

- "Undo" (`Cmd+Z`)
- "Redo" (`Cmd+Shift+Z`)
- Separator
- "Cut" (`Cmd+X`)
- "Copy" (`Cmd+C`)
- "Paste" (`Cmd+V`)
- "Select All" (`Cmd+A`)
- Separator
- "Find..." (`Cmd+F`) → search conversations

**View** menu:

- "Toggle Sidebar" (`Cmd+/`)
- "Toggle Fullscreen" (`Cmd+Ctrl+F`)
- "Toggle Floating Mode" (`Cmd+Shift+F`)
- Separator
- "Zoom In" (`Cmd+=`)
- "Zoom Out" (`Cmd+-`)
- "Actual Size" (`Cmd+0`)
- Separator
- "Show Command Palette" (`Cmd+K`)
- "Show Notifications" → opens notification center
- "Show Background Tasks" (`Cmd+Shift+B`)

**Chat** menu:

- "Send Message" (`Cmd+Enter`)
- "Stop Generation" (`Cmd+.`)
- Separator
- "Toggle Agent Mode" (`Cmd+Shift+A`)
- "Toggle Research Mode" (`Cmd+Shift+R`)
- "Toggle Thinking Mode"
- Separator
- "Compact Context" → runs context compaction
- "Fork Conversation" → creates branch from current message

**Tools** menu:

- "Screen Capture" (`Cmd+Shift+S`)
- "Voice Input" (`Cmd+Shift+V`)
- "Open Terminal" (`Cmd+Shift+T`)
- Separator
- "Change Model" (`Cmd+Shift+M`)
- "Canvas View" (`Cmd+Shift+C`)
- "Research Mode" (`Cmd+Shift+R`)
- Separator
- "MCP Server Manager" → opens MCP settings
- "Skill Marketplace" → opens marketplace

**Window** menu:

- "Minimize" (`Cmd+M`)
- "Zoom" → macOS window zoom
- Separator
- "Bring All to Front"

**Help** menu:

- "AGI Workforce Help" → opens documentation in browser
- "Keyboard Shortcuts" → opens KeyboardShortcutsDialog
- "Report Issue..." → opens GitHub issue template
- Separator
- "Release Notes" → opens release notes page
- "Documentation" → opens docs site
- "Community" → opens community forum

## 4.1.4 Context Menus

**Conversation list item context menu** (right-click):
| Item | Icon | Action |
|---|---|---|
| "Rename" | Edit3 | Opens inline rename input |
| "Pin" / "Unpin" | Pin/PinOff | Toggles pin status |
| "Archive" / "Unarchive" | Archive/ArchiveRestore | Moves to/from archive |
| "Duplicate" | Copy | Creates conversation copy |
| --- | --- | Separator |
| "Export as JSON" | Download | Exports conversation as JSON |
| "Export as PDF" | FileText | Exports conversation as PDF |
| "Export as Markdown" | FileText | Exports conversation as Markdown |
| --- | --- | Separator |
| "Delete" | Trash2 | Confirmation dialog, then deletes |

**Message context menu** (right-click on message):
| Item | Icon | Action |
|---|---|---|
| "Copy Text" | Copy | Copies message text to clipboard |
| "Copy as Markdown" | FileText | Copies with Markdown formatting |
| "Edit Message" | Edit3 | Opens inline editor (user messages only) |
| "Fork from Here" | GitBranch | Creates conversation branch |
| "Regenerate" | RefreshCw | Re-sends to LLM (assistant messages only) |
| --- | --- | Separator |
| "Delete Message" | Trash2 | Confirmation, then deletes |

**Code block context menu** (right-click on code):
| Item | Icon | Action |
|---|---|---|
| "Copy Code" | Copy | Copies code content |
| "Copy as Markdown" | FileText | Copies with ``` fencing |
| "Open in Canvas" | Layers | Creates canvas artifact |
| "Run in Terminal" | Terminal | Executes in terminal (with confirmation) |
| "Save to File" | Download | Opens save dialog |

## 4.2 Onboarding Flow

### 4.2.1 Welcome Screen

**Screen name**: Onboarding Welcome
**Route**: `/onboarding/welcome`
**Purpose**: First screen shown to new users after installation. Introduces the product and begins the setup flow.

**Layout**: Full-window centered card (600px wide, auto height) with gradient background

**Component inventory**:

- **Hero illustration**: AGI Workforce logo animation (Lottie or CSS keyframes), 120x120px
- **Heading**: "Welcome to AGI Workforce"
- **Subheading**: "The open, model-agnostic AI desktop platform. Connect any LLM, automate anything."
- **Feature highlights** (3 cards, horizontal):
  - Card 1: Robot icon + "Any Model" + "Connect 9+ cloud providers or run local models"
  - Card 2: Shield icon + "Secure by Default" + "Encrypted storage, sandboxed execution, audit logging"
  - Card 3: Zap icon + "Full Autonomy" + "Agents that can see, click, type, and navigate your Mac"
- **Primary button**: "Get Started" (blue, full-width within card)
- **Secondary link**: "Skip setup — I'll configure later" (text link below button)
- **Version badge**: "v1.1.5" in bottom-right corner

**Interaction flows**:

- User clicks "Get Started" → navigates to API Key Setup screen
- User clicks "Skip setup" → navigates directly to main chat view with empty state

**State variations**:

- First launch: shown automatically
- Return visit: not shown (onboarding completion persisted in settings)

### 4.2.2 API Key Setup

**Screen name**: API Key Configuration
**Route**: `/onboarding/api-keys`
**Purpose**: Guide the user to add at least one LLM provider API key.

**Layout**: Full-window centered card (600px wide), step indicator at top showing "Step 1 of 3"

**Component inventory**:

- **Step indicator**: 3 dots with labels: "API Keys" (active), "Model Selection", "First Chat"
- **Heading**: "Connect Your AI Providers"
- **Subheading**: "Add at least one API key to get started. You can add more later in Settings."
- **Provider cards** (vertical list):
  - Each card: Provider logo (32x32) + provider name + API key input (password field) + "Test" button + status indicator
  - Providers listed (in order):
    1. Anthropic (Claude) — `sk-ant-...` placeholder
    2. OpenAI — `sk-...` placeholder
    3. Google (Gemini) — `AIza...` placeholder
    4. Ollama (Local) — URL input `http://localhost:11434` with "Detect" button instead of API key
    5. Mistral — placeholder
    6. Groq — placeholder
    7. DeepSeek — placeholder
    8. OpenRouter — placeholder
    9. Together.ai — placeholder
    10. Fireworks.ai — placeholder
  - Initially: only top 4 visible; "Show more providers" expandable section for 5-10
- **Test button behavior**:
  - Idle: "Test" label, gray outline
  - Testing: spinner icon + "Testing..." label
  - Success: green checkmark + "Connected" label
  - Failure: red X + "Failed — check key" label + tooltip with error detail
- **API key input**: password type with eye toggle to reveal, paste auto-detection
- **Help link per provider**: "Get API key" → opens provider's key management page in default browser
- **Primary button**: "Continue" (blue, enabled when at least one key tests successfully)
- **Secondary button**: "Skip — use local models only" (enabled when Ollama detected)
- **Back button**: left arrow, returns to Welcome

**Interaction flows**:

- User pastes API key → auto-test fires after 500ms debounce → status updates
- User clicks "Test" → manual test via `invoke('llm_test_connection', { provider, apiKey })` → status updates
- User clicks "Get API key" → `open` shell command opens provider URL in default browser
- User clicks "Detect" for Ollama → `invoke('ollama_detect')` checks localhost:11434 → shows available models
- User clicks "Continue" → all entered keys stored via SecretManager → navigates to Model Selection
- User clicks "Skip" → navigates directly to main chat (no keys stored)

**Error messages**:

- Invalid key format: "This doesn't look like a valid [Provider] API key. Check the format."
- Network error: "Could not reach [Provider]. Check your internet connection."
- Auth error: "This API key was rejected by [Provider]. Verify it's correct and active."
- Ollama not running: "Ollama not detected at localhost:11434. Make sure Ollama is running."

**State variations**:

- No keys entered: "Continue" button disabled, helper text "Add at least one provider to continue"
- One+ key verified: "Continue" button enabled, green summary "1 provider connected"
- All tests failed: warning banner "No providers connected. You can add keys later in Settings."

### 4.2.3 Model Selection

**Screen name**: Default Model Selection
**Route**: `/onboarding/model-selection`
**Purpose**: Let the user pick their default model from verified providers.

**Layout**: Full-window centered card (600px wide), step indicator at top showing "Step 2 of 3"

**Component inventory**:

- **Step indicator**: 3 dots: "API Keys" (completed checkmark), "Model Selection" (active), "First Chat"
- **Heading**: "Choose Your Default Model"
- **Subheading**: "This model will be used for new conversations. You can switch models anytime."
- **Model grid**: 2-column grid of model cards
  - Each card: Model icon + model name + provider badge + context window size + pricing tier badge
  - Only models from verified providers shown
  - Selected state: blue border + checkmark
  - Cards grouped by tier: "Flagship" (Claude Opus, GPT-5 Pro, Gemini Ultra), "Balanced" (Claude Sonnet, GPT-5.2, Gemini Pro), "Economy" (Claude Haiku, GPT-5 Nano, Gemini Flash), "Local" (Ollama models)
- **Routing strategy selector**: dropdown with options:
  - "Auto (recommended)" — system picks best model per task
  - "Always use selected model" — fixed model for all conversations
  - "Cost optimized" — cheapest model that can handle the task
  - "Latency optimized" — fastest response time
  - "Local first" — prefer local models, fall back to cloud
- **Primary button**: "Continue"
- **Back button**: left arrow

**Interaction flows**:

- User clicks a model card → selected model highlighted → stored in settingsStore as default
- User changes routing strategy → stored in settingsStore
- User clicks "Continue" → navigates to First Chat

### 4.2.4 First Chat

**Screen name**: First Chat Experience
**Route**: `/onboarding/first-chat`
**Purpose**: Let the user send their first message and experience the core product.

**Layout**: Full-window split — left half shows a pre-populated chat suggestion, right half shows tips

**Component inventory**:

- **Step indicator**: 3 dots: all completed except "First Chat" (active)
- **Chat area** (left, 60%): Simplified version of UnifiedAgenticChat
  - Pre-populated assistant message: "Hi! I'm your AI assistant. I can help with code, documents, research, automation, and much more. What would you like to work on?"
  - Suggestion chips below the message:
    - "Write a Python script to organize my Downloads folder"
    - "Summarize the last 5 emails in my inbox"
    - "Research the latest trends in [your field]"
    - "Help me draft a professional email"
  - Message input at bottom with send button
- **Tips panel** (right, 40%): scrollable card list
  - Tip 1: "Use Cmd+K for the command palette"
  - Tip 2: "Type / for slash commands"
  - Tip 3: "Press Cmd+Shift+V to dictate with voice"
  - Tip 4: "Prefix with & to run tasks in the background"
  - Tip 5: "Switch models mid-conversation with the model selector"
- **"Finish Setup" button**: at bottom of tips panel, closes onboarding

**Interaction flows**:

- User clicks suggestion chip → text inserted into composer → user presses Enter or clicks Send → message sent to LLM → streaming response displayed
- User types custom message → sends normally
- User clicks "Finish Setup" → onboarding marked complete in settingsStore → full app layout displayed

## 4.3 Main Chat Interface

### 4.3.1 Chat Message Area

**Screen name**: Unified Agentic Chat
**Route**: `/chat/:conversationId` (default route)
**Purpose**: The primary user interaction surface for conversing with AI models, viewing tool executions, and managing agent workflows.

**Layout**:

```
+-----------------------------------------------------------+
| Sidebar |  Header Bar                                      |
|         |  [Model] [Mode] [Branch]  [Actions] [Settings]   |
|         +--------------------------------------------------+
|         |                                                    |
|         |  Message List (scrollable, virtualized)            |
|         |                                                    |
|         |  +----------------------------------------------+  |
|         |  | [Avatar] User message                         |  |
|         |  +----------------------------------------------+  |
|         |  | [Avatar] Assistant message                    |  |
|         |  |   [Reasoning accordion]                       |  |
|         |  |   [Tool timeline]                             |  |
|         |  |   [Artifact renderers]                        |  |
|         |  |   [Citations]                                 |  |
|         |  +----------------------------------------------+  |
|         |                                                    |
|         +--------------------------------------------------+
|         |  Composer Area                                     |
|         |  [Attachments] [Input] [Send] [Voice] [Plus]      |
|         +--------------------------------------------------+
```

**Header Bar** (48px height):

- **Model selector button** (ModelSelectorButton.tsx): Current model name + provider icon. Click opens QuickModelSelector dropdown.
  - Dropdown shows: grouped model list, search filter, favorites section, "Add Custom Model" link
  - Label: current model display name (e.g., "Claude Sonnet 4.5")
  - Tooltip: "Switch model (Cmd+Shift+M)"
- **Mode tags** (ActiveModeTags.tsx): Horizontal pill badges showing active modes
  - "Agent" (blue pill) — shown when agent mode is active
  - "Research" (purple pill) — shown when research mode is active
  - "Computer Use" (orange pill) — shown when computer use is active
  - "Simple" (gray pill) — shown when simple mode is active
- **Branch navigator** (BranchNavigator.tsx): Shows current branch if conversation has branches
  - Label: "Branch 1 of 3"
  - Left/right arrows to navigate branches
  - "Fork" button to create a new branch from current message
- **Action buttons** (right side of header):
  - Share button (share icon) — opens ShareConversationDialog
  - Checkpoint button (save icon) — creates conversation checkpoint
  - Export button (download icon) — opens export options (JSON, PDF)
  - Keyboard shortcuts button (keyboard icon) — opens KeyboardShortcutsDialog

**Message List** (ChatMessageList.tsx):

- Virtualized scrollable container (react-window) for performance with large conversation histories
- Auto-scrolls to bottom on new messages; scroll-to-bottom FAB appears when scrolled up
- Each message rendered as a MessageBubble

**User Message Bubble**:

- **Avatar**: User profile image (32x32) or initials circle
- **Username**: "You" label
- **Timestamp**: relative time ("just now", "2m ago") on hover
- **Content**: Markdown-rendered text
- **Attachments**: inline previews of attached images, files, or code snippets
  - Image: thumbnail (max 300px wide) with lightbox on click
  - File: file icon + filename + size badge
  - Code: syntax-highlighted code block with copy button
- **Edit button**: pencil icon, appears on hover → converts message to editable textarea
- **Copy button**: clipboard icon, appears on hover → copies raw text
- **Context menu** (right-click): Copy, Edit, Fork from here, Delete

**Assistant Message Bubble**:

- **Avatar**: Model provider icon (32x32) with model badge
- **Model label**: Provider + model name (e.g., "Claude · Sonnet 4.5")
- **Content**: Markdown-rendered with:
  - GFM tables
  - Fenced code blocks with syntax highlighting (react-syntax-highlighter) + copy button + language badge
  - Math (KaTeX inline `$...$` and block `$$...$$`)
  - Mermaid diagrams (rendered via mermaid library)
  - Inline links (open in default browser)
- **Reasoning accordion** (ReasoningAccordion.tsx): Collapsible section showing model's thinking/reasoning
  - Header: "Thinking..." (during stream) or "Reasoning" (after completion) + chevron icon
  - Content: monospace text of the model's extended thinking output
  - Default: collapsed
- **Tool timeline** (ToolTimeline.tsx): Collapsible timeline of tool executions
  - Each tool entry: ToolLabel component showing:
    - Display name (Claude Code style): "Read(src/main.rs)", "Write(output.txt)", "Bash(npm install)", "WebSearch(query)"
    - Status icon: spinner (running), checkmark (success), X (failed)
    - Duration: "1.2s"
    - Expandable detail showing: full arguments, result preview (first 200 chars), raw output toggle
  - Header: "Tools (3)" with expand/collapse toggle
- **Artifact renderers** (ArtifactRenderer.tsx): Inline rendered artifacts
  - Code artifacts: Monaco editor with syntax highlighting, line numbers, copy button
  - Image artifacts: rendered image with download button
  - Document artifacts: preview with "Open in editor" button
  - Versioning: version indicator "v3" with left/right arrows to navigate versions
- **Citations** (SourcesFooter.tsx): When research mode is active
  - "[1] Source title — domain.com" links
  - Hover shows preview snippet
- **Token counter**: small text showing "1,234 tokens · $0.02" at bottom-right of message
- **Feedback buttons** (on hover): thumbs up/down for response quality
- **Copy button**: clipboard icon at bottom-right
- **Regenerate button**: refresh icon at bottom-right → re-sends the last user message

**Streaming state**: During active streaming:

- Cursor blink animation at the end of the last token
- "Stop" button appears in the composer area (replaces Send)
- Token counter updates in real-time
- Tool timeline entries appear as tools are invoked
- AgenticLoopStatusBar shows: "Running step 3 of 5 — Executing Bash command"

**Composer Area** (ChatInputArea.tsx):

- **Attachment bar** (AttachmentPreview.tsx): horizontal scrollable row above input
  - Each attachment: thumbnail/icon + filename + remove X button
  - Drop zone: entire composer area accepts drag-and-drop files
  - "+" button (PlusMenu.tsx) opens attachment picker:
    - "Upload File" — system file picker dialog
    - "Capture Screen" — triggers screen capture
    - "Paste Image" — reads clipboard
    - "Add Context" — opens folder/file selector for project context
    - "Add URL" — input field for web page context
- **Text input**: Multi-line textarea with auto-resize (min 44px, max 300px)
  - Placeholder: "Message AGI Workforce... (Cmd+Enter to send)"
  - Slash command trigger: typing "/" opens SlashCommandMenu
  - File mention trigger: typing "@" opens FileMentionPicker
  - Skill mention trigger: typing "#" opens SkillMentionPicker
  - Ghost text: inline completion suggestions (dimmed text) from `get_prompt_completion`
  - Markdown preview: not shown in input (raw text only)
- **Input toolbar** (InputToolbar.tsx): row of icon buttons below text input
  - Model selector: compact version showing current model icon
  - Agent mode toggle: robot icon (toggles between chat and agent mode)
  - Thinking toggle: brain icon (enables extended thinking)
  - Web search toggle: globe icon (enables web search tool)
  - Focus mode selector: target icon with dropdown (Code, Writing, Research, General)
  - Attachment button: paperclip icon
  - Voice input button: microphone icon (hold to record via VoiceInputButton.tsx)
- **Send button** (SendButton.tsx): Right-aligned
  - Label: arrow-up icon
  - State: enabled (blue) when input has text; disabled (gray) when empty
  - Click or `Cmd+Enter`: sends message
  - During streaming: becomes red "Stop" square icon
  - Dropdown arrow on send button: "Send" / "Send with Agent Mode" / "Send as Background Task"
- **Token counter** (TokenCounter.tsx): small badge showing estimated token count for current input

**State variations**:

- **Empty conversation**:
  - Large centered greeting: "What can I help you with?"
  - Suggestion cards (4): "Write code", "Analyze data", "Draft content", "Research a topic"
  - Model selector prominently displayed
- **Loading messages**: skeleton pulse animation for message bubbles
- **Error state**: Red error banner at top of message list
  - Text: "Something went wrong. [Retry] [Report Issue]"
  - Never shows raw error text (NN-01)
- **Streaming**: Live token display + progress indicators
- **Agent executing**: Step timeline visible + approval modals may appear
- **Offline**: Yellow banner "You are offline. Using local models only."

### 4.3.2 Approval Modal

**Screen name**: Tool Approval Dialog
**Route**: Overlay on chat view
**Purpose**: Requests user permission before executing a tool that requires confirmation.

**Layout**: Centered modal dialog (480px wide), semi-transparent backdrop

**Component inventory**:

- **Header**: "Approve Action" title + shield icon
- **Tool info**:
  - Tool name badge: e.g., "Write File" or "Run Command"
  - Safety tier indicator: color-coded (green=Safe, yellow=RequiresConfirmation, red=RequiresExplicitApproval)
  - Risk level: "Low Risk", "Medium Risk", "High Risk", "Critical"
- **Details section**:
  - "What will happen:" — plain language description of the action
  - "Arguments:" — formatted JSON of tool arguments (collapsible)
  - "Affected files/paths:" — list of file paths that will be modified
- **Checkbox**: "Trust this tool for the rest of this session" (unchecked by default)
- **Checkbox**: "Always approve this workflow" (unchecked by default, shows workflow hash)
- **Primary button**: "Approve" (green)
- **Secondary button**: "Deny" (red outline)
- **Tertiary button**: "Approve All Similar" (blue outline, visible for non-critical tools)
- **Cancel/escape**: closes modal and denies the action

**Interaction flows**:

- Modal appears → user reviews → clicks Approve → tool executes → modal closes → result appears in timeline
- User clicks Deny → tool skipped → agent receives denial and replans
- User checks "Trust this tool" + Approve → future invocations of same tool auto-approved in session
- User checks "Always approve this workflow" + Approve → workflow hash stored → future identical workflows auto-approved

**Keyboard shortcuts**:

- `Enter` or `Cmd+Enter`: Approve
- `Escape`: Deny
- `Tab`: cycle between buttons

### 4.3.3 Command Palette

**Screen name**: Command Palette
**Route**: Overlay (Cmd+K)
**Purpose**: Quick access to any application action via fuzzy search.

**Layout**: Centered modal (560px wide, max 400px tall), input at top, scrollable result list below

**Component inventory**:

- **Search input**: Auto-focused text input with placeholder "Search commands, conversations, settings..."
- **Result list**: Grouped sections
  - "Recent Conversations" — last 5 conversations
  - "Actions" — New Chat, Open Settings, Toggle Sidebar, Toggle Agent Mode, etc.
  - "Models" — quick model switch: Claude Opus, GPT-5, Gemini Ultra, etc.
  - "Navigation" — Settings, Analytics, Research, Canvas, Scheduler
  - "Tools" — Screen Capture, Voice Input, Browser Launch, Terminal
- **Each result item**: Icon + label + keyboard shortcut hint (right-aligned, dimmed)
- **Selected item**: blue highlight, navigable with arrow keys
- **Empty state**: "No results for '[query]'"

**Interaction flows**:

- `Cmd+K` → palette opens → auto-focus on search input
- User types → results filtered in real-time via Fuse.js
- User presses Enter on selected item → action executed → palette closes
- User presses Escape → palette closes

## 4.4 Settings Panel

### 4.4.1 Settings Overview

**Screen name**: Settings Panel
**Route**: `/settings` (overlay or full-screen depending on context)
**Purpose**: Central configuration hub for all application settings.

**Layout**: Two-column: left sidebar with tab list (200px), right content area (flex-1)

**Tab list** (SettingsPanel.tsx):
| Tab | Icon | Label |
|---|---|---|
| 1 | Sliders | General |
| 2 | Cpu | Custom Models |
| 3 | Key | API Keys |
| 4 | Bot | Agents |
| 5 | FileText | Instruction Files |
| 6 | Plug | Extensions (MCP) |
| 7 | Sparkles | Skills & Plugins |
| 8 | Shield | Security & Privacy |
| 9 | CreditCard | Account & Billing |
| 10 | Bell | Notifications |
| 11 | Mic | Voice |
| 12 | Monitor | Window & Display |
| 13 | Wrench | System |

### 4.4.2 General Settings

**Screen name**: General Settings
**Route**: `/settings/general`
**Purpose**: Application-wide preferences.

**Component inventory**:

- **Theme selector**: Radio group
  - "System" (follows macOS appearance)
  - "Light"
  - "Dark"
  - Currently selected: filled circle indicator
- **Language selector**: Dropdown
  - "English" (default)
  - "Spanish"
- **Font size**: Slider (12px to 20px, default 14px)
  - Label: "Chat Font Size"
  - Live preview text below slider
- **Default model**: Dropdown showing all available models grouped by provider
- **Routing strategy**: Dropdown (Auto, Economy, Balanced, Premium, Cost, Latency, Local First)
- **Send behavior**: Radio group
  - "Enter sends, Shift+Enter for newline" (default)
  - "Cmd+Enter sends, Enter for newline"
- **Streaming**: Toggle switch "Stream responses token-by-token" (default: on)
- **Auto-save conversations**: Toggle switch (default: on)
- **Telemetry**: Toggle switch "Send anonymous usage data" (default: off)
  - Helper text: "Helps us improve the product. No conversation content is ever sent."
- **Startup behavior**: Radio group
  - "Open last conversation" (default)
  - "Show empty chat"
  - "Show onboarding tips"
- **Reset button**: "Reset to Defaults" (red outline, confirmation dialog)

### 4.4.3 Custom Models Settings

**Screen name**: Custom Models Settings
**Route**: `/settings/models`
**Purpose**: Add, configure, and test custom model endpoints.

**Component inventory**:

- **Header**: "Custom Models" + "Add Model" button (blue)
- **Model list**: Vertical list of configured custom models
  - Each item: Model name, provider type badge, endpoint URL (truncated), status indicator (green dot = healthy, red = error)
  - Actions: Edit (pencil), Test (play), Delete (trash)
- **Add/Edit Model form** (modal or inline):
  - "Display Name": text input, placeholder "My Llama Model"
  - "Provider Type": dropdown — "OpenAI Compatible", "Anthropic Compatible", "Ollama"
  - "Base URL": text input, placeholder "http://localhost:11434"
  - "Model ID": text input, placeholder "llama3.2:70b"
  - "API Key" (optional): password input with eye toggle
  - "Context Window": number input, default 8192
  - "Max Output Tokens": number input, default 4096
  - "Supports Vision": toggle switch
  - "Supports Tool Use": toggle switch
  - "Test Connection" button → tests the endpoint → shows success/failure inline
  - "Save" button + "Cancel" button
- **Detected local models section**: Auto-discovered Ollama/LM Studio models
  - Header: "Local Models Detected"
  - Each: model name + size + "Add" button to add to model list
  - Empty state: "No local models detected. Install Ollama to run models locally."

### 4.4.4 API Keys Settings

**Screen name**: API Keys
**Route**: `/settings/api-keys`
**Purpose**: Manage provider API keys stored in SecretManager.

**Component inventory**:

- **Provider list**: Each provider in a card:
  - Provider logo + name
  - Key status: "Connected" (green) or "Not configured" (gray)
  - Masked key preview: "sk-ant-...x7Qm" (last 4 chars visible)
  - "Update Key" button → opens password input
  - "Remove" button → confirmation dialog → removes key from SecretManager
  - "Test" button → tests the key → shows result inline
  - "Get API key" link → opens provider's key page in browser
- **Providers listed** (in order):
  1. Anthropic (Claude)
  2. OpenAI
  3. Google (Gemini)
  4. Mistral
  5. Groq
  6. DeepSeek
  7. OpenRouter
  8. Together.ai
  9. Fireworks.ai
  10. Deepgram (for voice)
- **Security notice**: Info banner: "All API keys are encrypted with AES-256-GCM and stored in your local encrypted database. Keys never leave your device."

### 4.4.5 Agents Settings

**Screen name**: Agent Configuration
**Route**: `/settings/agents`
**Purpose**: Configure agent behavior, approval modes, and execution preferences.

**Component inventory**:

- **Approval mode**: Radio group
  - "Ask before each action" (default for new users)
  - "Auto-approve read-only actions" — reads proceed, writes prompt
  - "Auto-approve all actions" — fully autonomous (trusted mode)
  - Warning text for auto-approve-all: "Agents will execute all actions without asking. ToolGuard safety checks remain active."
- **Sub-agents**: Toggle "Allow agents to spawn sub-agents" (default: on)
  - "Max concurrent sub-agents": number input (1-100, default 5)
- **Background agents**: Toggle "Allow background agent execution" (default: on)
  - "Max background agents": number input (1-20, default 5)
- **Execution preferences**:
  - "Default execution timeout": dropdown (5min, 15min, 30min, 1hr, 4hr, unlimited)
  - "Auto-compact context when 80% full": toggle (default: on)
  - "Enable reflection on failure": toggle (default: on)
  - "Enable persistent task checkpoints": toggle (default: on)
- **Trusted workflows section**:
  - List of trusted workflow hashes with "Revoke" button each
  - "Clear all trusted workflows" button

### 4.4.6 Extensions (MCP) Settings

**Screen name**: MCP Extensions
**Route**: `/settings/extensions`
**Purpose**: Manage MCP server connections and installed extensions.

**Component inventory**:

- **Header**: "Model Context Protocol" + "Add Server" button
- **Connected servers list**:
  - Each server card:
    - Server name
    - Transport type badge (stdio / SSE / HTTP)
    - Status indicator: green "Connected", yellow "Connecting", red "Error", gray "Disabled"
    - Health: "Healthy" / "Degraded" / "Offline"
    - Tool count badge: "12 tools"
    - Toggle switch: Enable/Disable
    - Actions: Configure (gear), Reconnect (refresh), Remove (trash)
- **Add Server form** (modal):
  - "Server Name": text input
  - "Transport": dropdown (stdio, SSE, Streamable HTTP)
  - For stdio: "Command": text input, "Arguments": text input (comma-separated), "Environment Variables": key-value editor
  - For SSE: "URL": text input
  - For HTTP: "URL": text input, "Headers": key-value editor
  - "Test Connection" button
  - "Save" button + "Cancel" button
- **Tool browser** (expandable section per server):
  - List of discovered tools with: name, description (truncated), input schema preview
  - Toggle: enable/disable individual tools
- **MCP config file**: "Edit .mcp.json" button → opens in Monaco editor
- **Empty state**: "No MCP servers configured. Add a server to extend your AI's capabilities." + link to MCP documentation

### 4.4.7 Voice Settings

**Screen name**: Voice Settings
**Route**: `/settings/voice`
**Purpose**: Configure speech-to-text, text-to-speech, and voice input behavior.

**Component inventory**:

- **Speech-to-Text section**:
  - "STT Provider": dropdown (Deepgram Cloud, Local Whisper, macOS Dictation)
  - For Deepgram: API key status indicator + "Configure" link to API Keys tab
  - For Local Whisper: "Model size" dropdown (tiny, base, small, medium, large) + "Download" button + size indicator
  - "Language": dropdown (auto-detect, English, Spanish, etc.)
- **Text-to-Speech section**:
  - "TTS Provider": dropdown (Piper Local, macOS Native, None)
  - For Piper: "Voice" dropdown (list of available voices) + "Preview" play button
  - For macOS: "Voice" dropdown (system voices from NSSpeechSynthesizer)
  - "Speed": slider (0.5x to 2.0x, default 1.0x)
  - "Auto-play responses": toggle (default: off)
- **Voice Input section**:
  - "Push-to-talk hotkey": key capture input showing current binding (default: Cmd+Shift+V)
  - "Voice Activity Detection": toggle (enables VAD for auto-stop, requires `vad` feature)
  - "Wake word": text input (optional), placeholder "Hey AGI"
  - "Barge-in detection": toggle "Interrupt TTS by speaking" (default: off)
- **Microphone section**:
  - "Input device": dropdown (system audio devices)
  - Level meter: real-time audio level visualization
  - "Test microphone" button

### 4.4.8 Security & Privacy Settings

**Screen name**: Security & Privacy
**Route**: `/settings/security`
**Purpose**: Configure security controls, privacy preferences, and data management.

**Component inventory**:

- **Master Password section**:
  - Status: "Set" or "Not set"
  - "Set Master Password" / "Change Master Password" button
  - Helper text: "Adds an additional encryption layer to your stored secrets."
- **Tool Safety section**:
  - "Global safety level": dropdown (Standard, Strict, Permissive)
  - "Show safety tier in approval dialogs": toggle (default: on)
  - "Log all tool executions": toggle (default: on)
  - "Blocked operations" list with add/remove capability
- **Privacy section**:
  - "Send telemetry data": toggle (default: off)
  - "Include model usage in analytics": toggle (default: on)
  - "Local-only mode": toggle "Never send data to cloud" (disables sync, billing)
- **Data Management section**:
  - "Export all data" button → generates ZIP with conversations, settings, memories
  - "Delete all conversations" button → confirmation dialog with text input "DELETE"
  - "Delete all memories" button → confirmation dialog
  - "Clear cache" button → clears LLM cache, embedding cache, codebase cache
  - "Database size": label showing current SQLite file size

### 4.4.9 Account & Billing Settings

**Screen name**: Account & Billing
**Route**: `/settings/account`
**Purpose**: Manage user account, subscription, and billing.

**Component inventory**:

- **Profile section** (AccountSettings.tsx):
  - User avatar: circular image (64x64) with "Change" overlay on hover → opens file picker
  - Display name: editable text input
  - Email: read-only, grayed out, from Supabase (`user.email`)
  - "Sign Out" button (red outline) → calls `supabaseAuth.signOut()` → redirects to login
  - "Delete Account" button (red, small text) → confirmation dialog:
    - Warning text: "This will permanently delete your account and all associated data. You have a 30-day grace period to change your mind."
    - Text input: "Type DELETE to confirm"
    - "Delete My Account" button (red, disabled until "DELETE" typed)
    - "Cancel" button
- **Subscription section**:
  - Current plan badge: colored pill showing "Free" (gray), "Hobby" (blue), "Pro" (purple), "Max" (gold), "Team" (green), "Enterprise" (black)
  - Plan details card:
    - Feature list with checkmarks for included features, X marks for excluded
    - Usage meters:
      - "Messages today: 42 / 100" with progress bar
      - "Credits remaining: 1,234 / 10,000" with progress bar
      - "Background agents: 2 / 5" with progress bar
    - Next billing date: "March 15, 2026"
    - Amount: "$29.00 / month"
  - "Upgrade" button → opens upgrade flow:
    - Plan comparison cards (3-column)
    - Each card: plan name, price, feature list, "Select" button
    - Selected plan: Stripe checkout embedded via iframe
  - "Manage Subscription" button → opens Stripe customer portal
  - Credit balance (if applicable): "Monthly: 1,234 / 10,000 credits remaining" with circular progress
  - "Top Up Credits" button (Max tier and above only) → opens credit purchase flow
  - "Cancel Subscription" link (small text) → confirmation dialog with retention offer
- **Billing history section**:
  - Table: Date | Amount | Status | Invoice
  - Each row: "March 1, 2026" | "$29.00" | "Paid" (green badge) | "Download PDF" link
  - Pagination: 10 per page
- **Payment method section**:
  - Card on file: "[Visa] ending in 4242, expires 12/2028"
  - "Update Payment Method" button → Stripe update flow
- **Device linking section**:
  - "Link Mobile Device" button → generates QR code:
    - QR code display (200x200px) with pairing code text below
    - Timer: "Code expires in 5:00"
    - Instructions: "Scan this QR code with the AGI Workforce mobile app"
  - Linked devices list: vertical list
    - Each device card:
      - Device icon (phone/tablet)
      - Device name: "John's iPhone 16 Pro"
      - Platform: "iOS" or "Android"
      - Last seen: "Active now" (green) or "2 hours ago" (gray)
      - "Unlink" button → confirmation dialog
  - Empty state: "No devices linked. Download the mobile app to monitor agents on the go."
- **Team section** (Team/Enterprise tiers only):
  - Team name (editable)
  - Member count: "5 of 10 seats used"
  - Member list: table with Name | Email | Role (Admin/Member/Viewer) | Last Active
  - "Invite Member" button → email input + role selector
  - Role management: dropdown per member to change role
  - "Remove" button per member → confirmation
  - "Manage Team" button → full team management view

### 4.4.10 Notifications Settings

**Screen name**: Notifications Settings
**Route**: `/settings/notifications`
**Purpose**: Configure system notification preferences.

**Component inventory** (NotificationsSettings.tsx):

- **System notifications section**:
  - "Enable desktop notifications": toggle (default: on)
  - macOS notification permission status: "Granted" (green) / "Not Granted" (yellow with "Request" button)
  - "Notification sound": toggle (default: on)
- **Notification types section**: Per-type toggles
  - "Agent task completed": toggle (default: on)
  - "Agent needs approval": toggle (default: on)
  - "Background task finished": toggle (default: on)
  - "Scheduled task executed": toggle (default: on)
  - "Update available": toggle (default: on)
  - "Error alerts": toggle (default: on)
  - "Mobile device connected": toggle (default: off)
  - "Credit balance low": toggle (default: on)
- **Quiet hours section**:
  - "Enable quiet hours": toggle (default: off)
  - "Start time": time picker (default: 22:00)
  - "End time": time picker (default: 07:00)
  - "Allow critical alerts during quiet hours": toggle (default: on)
- **Notification history section**:
  - "Clear all notifications" button → confirmation
  - "Notification retention": dropdown (1 day, 7 days, 30 days, forever)

### 4.4.11 Window & Display Settings

**Screen name**: Window & Display
**Route**: `/settings/window`
**Purpose**: Configure window behavior and display preferences.

**Component inventory**:

- **Window behavior section**:
  - "Close button behavior": radio group
    - "Minimize to tray" (default)
    - "Quit application"
  - "Start on login": toggle (default: off) → registers login item via macOS API
  - "Restore window position on launch": toggle (default: on)
  - "Always on top": toggle (default: off)
  - "Start minimized": toggle (default: off)
- **Sidebar section**:
  - "Default sidebar state": radio group
    - "Expanded" (default)
    - "Collapsed"
  - "Sidebar width": slider (200px to 400px, default 280px)
- **Display section**:
  - "Zoom level": slider (75% to 200%, default 100%)
  - "Use system accent color": toggle (default: on)
  - "Custom accent color": color picker (disabled if system accent enabled)
- **Animation section**:
  - "Enable animations": toggle (default: on)
  - "Respect system reduced motion": toggle (default: on)
  - Helper text: "When enabled, animations are disabled when macOS 'Reduce motion' is active"

### 4.4.12 System Settings

**Screen name**: System Settings
**Route**: `/settings/system`
**Purpose**: System-level configuration, cache management, diagnostics.

**Component inventory**:

- **Update section** (UpdateSettings.tsx):
  - Current version: "v1.1.5"
  - "Check for Updates" button → checks update endpoint
  - "Auto-check for updates": toggle (default: on)
  - "Check frequency": dropdown (Every launch, Every 4 hours, Daily, Weekly)
  - Update status: "Up to date" (green) or "Update available: v1.2.0 [Install]" (blue)
  - Release notes: expandable text area with latest release notes
- **Cache management section** (CacheManagement.tsx):
  - "LLM response cache": size display + "Clear" button
  - "Embedding cache": size display + "Clear" button
  - "Codebase index cache": size display + "Rebuild" button
  - "Image cache": size display + "Clear" button
  - "Total cache size": sum of all caches
  - "Clear All Caches" button → confirmation
- **Database section**:
  - "Database size": display (e.g., "124.5 MB")
  - "Database location": file path display
  - "Optimize database" button → VACUUM + ANALYZE
  - "Export database" button → SQLCipher export (encrypted)
  - "Database health": "Healthy" (green) or "Issues detected" (red with details)
- **Diagnostics section**:
  - "System info": macOS version, architecture, memory, disk space
  - "Rust backend version": display
  - "Feature flags": list of enabled/disabled Rust features
  - "Active MCP servers": count + list
  - "Generate diagnostic report" button → creates text file with all diagnostic info
  - "Open log directory" button → opens `~/Library/Logs/AGI Workforce/` in Finder
- **Reset section**:
  - "Reset all settings to defaults" button → confirmation dialog
  - "Reset onboarding" button → shows onboarding on next launch
  - "Factory reset" button → deletes all data, settings, and keys → confirmation with text input "RESET"

## 4.5 Computer Use View

**Screen name**: Computer Use Monitor
**Route**: `/computer-use` or inline panel in chat
**Purpose**: Display and control the Observe-Plan-Act automation loop.

**Layout**: Split view — left panel (preview), right panel (action log)

**Component inventory**:

- **Screen preview** (ScreenPreview.tsx): Live screenshot of current screen state
  - Updated after each OPA cycle
  - Overlay markers showing: click targets (red circles), text input locations (blue rectangles)
  - Zoom controls: fit-to-panel, 100%, 200%
- **Action plan display**:
  - Current step: highlighted with "Executing..." spinner
  - Upcoming steps: dimmed list
  - Completed steps: checkmark with timing
  - Failed steps: red X with error description
- **Action log** (ActionLog.tsx): Scrollable timeline
  - Each entry: timestamp + action type icon + description
  - "Screenshot captured" + thumbnail
  - "Clicked at (x, y)" + element description
  - "Typed: [text]" + target field
  - "Navigated to: [url]"
- **Control bar** (bottom):
  - "Pause" button — pauses OPA loop
  - "Resume" button — resumes paused loop
  - "Stop" button — terminates computer use session
  - "Take Over" button — switches from autonomous to manual input
  - "Screenshot" button — captures current state on demand
- **Safety guard display**:
  - Banner: "Destructive action blocked: [description]" (when safety guardrail triggers)

**State variations**:

- **Idle**: "Start Computer Use" CTA button + description
- **Running**: Live preview + action timeline + progress
- **Paused**: Yellow banner "Paused — click Resume to continue"
- **Waiting for approval**: Approval modal overlaid
- **Completed**: Green banner "Task completed successfully" + summary
- **Failed**: Red banner "Task failed: [friendly error]" + retry button

## 4.6 Voice Input Overlay

**Screen name**: Voice Input Overlay
**Route**: Overlay (triggered by hotkey)
**Purpose**: Wispr Flow-style voice input — hold hotkey, speak, release to transcribe.

**Layout**: Floating pill overlay, centered horizontally, 80px from bottom of screen

**Component inventory**:

- **Pill container**: rounded rectangle (240px x 60px), dark semi-transparent background, blur effect
- **Microphone icon**: pulsing animation when recording
- **Audio waveform**: real-time visualization of audio input (5 bars, animating)
- **Status text**:
  - Recording: "Listening..."
  - Transcribing: "Transcribing..."
  - Complete: "Done" (briefly, then disappears)
- **Duration indicator**: "0:03" showing recording length
- **Cancel hint**: "Press Esc to cancel"

**Interaction flows**:

- User holds `Cmd+Shift+V` → overlay appears → recording starts → waveform animates
- User speaks → audio captured via cpal
- User releases hotkey → recording stops → audio sent to STT provider → transcription inserted into active composer
- User presses Escape during hold → recording cancelled → overlay disappears → no text inserted
- If no speech detected after 5 seconds → auto-cancel with subtle "No speech detected" message

**State variations**:

- **Recording**: Pulsing mic icon, waveform active, "Listening..."
- **Processing**: Spinner icon, waveform frozen, "Transcribing..."
- **Error**: Red mic icon, "Microphone not available" or "Transcription failed"

## 4.7 Background Agents Panel

**Screen name**: Background Tasks
**Route**: `/background-tasks` or sidebar panel
**Purpose**: View and control agents running in the background.

**Layout**: Full-width list view

**Component inventory**:

- **Header**: "Background Tasks" + count badge + "New Task" button
- **Task list**: Vertical list of task cards
  - Each card:
    - Task title (from goal text, truncated)
    - Status badge: "Running" (blue), "Paused" (yellow), "Completed" (green), "Failed" (red), "Queued" (gray)
    - Progress: step X of Y with progress bar
    - Model used: provider icon + model name
    - Started: relative timestamp
    - Duration: elapsed time
    - Cost: "$0.42"
    - Action buttons:
      - Pause (pause icon)
      - Resume (play icon, when paused)
      - Cancel (X icon)
      - View Details (expand icon → opens full agent timeline)
      - Take Over (hand icon → moves to foreground chat)
- **Empty state**: "No background tasks running. Prefix a message with '&' to run it in the background."

## 4.8 Skill Marketplace

**Screen name**: Skill Marketplace
**Route**: `/marketplace` or sidebar panel
**Purpose**: Browse, install, and manage AI skills.

**Layout**: Header + filter bar + grid/list toggle + skill grid

**Component inventory**:

- **Header**: "Skill Marketplace" + skill count + view toggle (grid/list)
- **Search bar** (SkillSearchBar.tsx): text input with placeholder "Search skills..."
- **Category filter** (SkillCategoryFilter.tsx): horizontal pill row
  - Categories: All, Code, Writing, Research, Data, Finance, Legal, Healthcare, Education, Creative
  - Selected: filled pill, unselected: outline pill
- **Skill grid**: 3-column grid of skill cards (SkillCard.tsx)
  - Each card:
    - Skill icon (category-based)
    - Skill name
    - Short description (2 lines max)
    - Category badge
    - Rating: stars (if available)
    - Install/Uninstall button
    - "Details" expandable section: full description, trigger phrases, author
- **Empty state**: "No skills match your search."
- **Settings link**: "Configure skill directory" → opens Settings > Skills & Plugins

## 4.9 Research Panel

**Screen name**: Research Panel
**Route**: Inline panel within chat or standalone `/research`
**Purpose**: Display research progress, sources, and generated reports.

**Layout**: Side panel (400px) or full-width panel

**Component inventory**:

- **Research header**:
  - Research mode badge: "Quick" / "Standard" / "Deep" / "Exhaustive"
  - Query text (the research question)
  - Progress indicator: "Searching 5 of 10 sources..."
- **Source cards** (ResearchSourceCard.tsx): Scrollable list
  - Each card: favicon + domain + title + relevance score + "View" link
  - Status per source: searching, found, analyzing, complete, failed
- **Progress panel** (ResearchProgressPanel.tsx):
  - Stage indicators: "Searching" → "Reading" → "Analyzing" → "Writing"
  - Current stage highlighted with spinner
  - Time elapsed
- **Report view** (ResearchReport.tsx):
  - Markdown-rendered report
  - Inline citation badges [1], [2], [3] — click opens source
  - Section headers with anchor links
  - "Export" button (PDF, Markdown)
  - "Copy" button
- **History** (ResearchHistory.tsx): List of past research queries

**State variations**:

- **Not started**: "Enter a research question to begin"
- **In progress**: Progress indicators active, sources populating
- **Complete**: Full report displayed with citations
- **Error**: "Research failed: [friendly error]. Try narrowing your question."

## 4.10 Canvas / Artifacts View

**Screen name**: Canvas Workspace
**Route**: `/canvas` or inline sidecar
**Purpose**: Visual spatial canvas for arranging code artifacts, notes, images, and agent outputs.

**Layout**: Full-width zoomable canvas with toolbar

**Component inventory**:

- **Toolbar** (top):
  - Zoom controls: zoom in (+), zoom out (-), fit-to-view, percentage display
  - Tool selector: pointer (select), text (add note), code (add code block), image (add image)
  - History: undo (Cmd+Z), redo (Cmd+Shift+Z)
  - Actions: save, export (PNG, PDF), share
- **Canvas area** (CanvasWorkspace.tsx):
  - Infinite scrollable area with grid background
  - Drag-to-pan, scroll-to-zoom, pinch-to-zoom (trackpad)
  - Artifact nodes: draggable, resizable
    - Code artifact: Monaco editor with syntax highlighting, language selector, copy button
    - Text note: rich text editor with markdown preview
    - Image: rendered image with resize handles
    - Agent output: message bubble with model attribution
  - Version indicator: "v3" badge on artifacts with "View history" dropdown
- **Artifact list sidebar** (ArtifactList.tsx): Collapsible left panel
  - List of all artifacts with: title, type icon, timestamp
  - Click: scroll to and select artifact on canvas
  - Right-click: rename, duplicate, delete, pin, archive

## 4.11 System Tray Menu

**Screen name**: macOS System Tray (Menu Bar)
**Purpose**: Persistent status indicator and quick-action menu accessible from the macOS menu bar.

**Tray icon**: AGI Workforce monochrome icon (16x16 template image for macOS dark/light mode)

**Badge**: Optional unread count badge (red circle with number)

**Menu items** (right-click or left-click on tray icon):
| Item | Shortcut | Action |
|---|---|---|
| "AGI Workforce" | — | Header (disabled, shows version) |
| --- | — | Separator |
| "Show Window" | — | Brings main window to front |
| "New Conversation" | `Cmd+N` | Creates new conversation and shows window |
| "Quick Query" | `Option+Space` | Opens quick query overlay |
| --- | — | Separator |
| "Background Tasks (3)" | — | Opens background tasks panel |
| "Pause All Agents" | — | Pauses all running agents |
| "Resume All Agents" | — | Resumes all paused agents |
| --- | — | Separator |
| "Voice Input" | `Cmd+Shift+V` | Starts voice recording |
| "Screen Capture" | `Cmd+Shift+S` | Opens screen capture picker |
| --- | — | Separator |
| "Settings" | `Cmd+,` | Opens settings |
| "Check for Updates" | — | Triggers update check |
| --- | — | Separator |
| "Quit AGI Workforce" | `Cmd+Q` | Quits application |

**Interaction flows**:

- Left-click on tray icon → toggles main window visibility
- Right-click on tray icon → opens context menu
- "Background Tasks (N)" → label updates dynamically with running count

## 4.12 Model Comparison Panel

**Screen name**: Model Comparison
**Route**: `/compare` or sidecar panel
**Purpose**: Send the same prompt to multiple models and compare outputs side-by-side.

**Layout**: Horizontal split into 2-4 columns, one per model

**Component inventory**:

- **Controls bar** (ComparisonControls.tsx):
  - Model selector per column (dropdown)
  - "Add Column" button (up to 4)
  - "Remove Column" button per column
  - "Send to All" button
  - Shared input area at bottom
- **Comparison columns** (ModelComparisonCard.tsx): Each column:
  - Model name + provider icon header
  - Streaming response area (same rendering as chat messages)
  - Metrics: token count, cost, time-to-first-token, total time
  - "Copy" button
  - "Use This Response" button → inserts into main conversation
- **Shared prompt input**: Text area at bottom spanning full width
  - Placeholder: "Enter a prompt to compare across models"
  - Send button: "Compare" (sends to all selected models simultaneously)

## 4.13 Scheduling Panel

**Screen name**: Task Scheduler
**Route**: `/scheduler` or sidebar panel
**Purpose**: Create, view, and manage scheduled AI tasks.

**Layout**: Header + task list + create button

**Component inventory**:

- **Header**: "Scheduled Tasks" + count + "Create Task" button
- **Task list** (ScheduledTasksPanel.tsx):
  - Each task card (ScheduledTaskCard.tsx):
    - Task name
    - Schedule: human-readable ("Every weekday at 9am", "Every hour", "March 15 at 2pm")
    - Next run: relative time ("in 2 hours")
    - Last run: relative time + status (success/failure)
    - Model: provider + model name
    - Toggle: enable/disable
    - Actions: Edit, Run Now, Delete
- **Create/Edit dialog** (CreateTaskModal.tsx):
  - "Task Name": text input
  - "Goal/Prompt": multi-line text area
  - "Schedule Type": radio (Cron Expression, Fixed Interval, One-Time)
    - Cron: cron expression input with helper (TaskScheduleInput.tsx)
    - Interval: number + unit (minutes/hours/days)
    - One-time: date + time picker
  - "Model": model selector dropdown
  - "Max Daily Runs": number input (0 = unlimited)
  - "Notification on completion": toggle
  - "Save" + "Cancel" buttons
- **Empty state**: "No scheduled tasks. Create a task to automate recurring work."

## 4.14 Notifications Panel

**Screen name**: Notification Center
**Route**: Overlay panel (bell icon in header)
**Purpose**: Display system notifications, agent completions, and alerts.

**Component inventory**:

- **Header**: "Notifications" + unread count badge + "Mark all read" link
- **Notification list**: Scrollable list, newest first
  - Each notification:
    - Icon: type-specific (checkmark for completion, warning for alert, info for update)
    - Title: "Background task completed", "Update available", "Agent needs approval"
    - Description: 1-2 line summary
    - Timestamp: relative ("2m ago")
    - Unread indicator: blue dot on left edge
    - Action button: context-specific ("View", "Update Now", "Approve")
  - Click notification → navigates to relevant screen
- **Empty state**: "No notifications"

## 4.15 Messaging Panel

**Screen name**: Messaging Panel
**Route**: `/messaging` or sidecar
**Purpose**: Manage cross-platform messaging integrations (Discord, Telegram, Slack, Teams, Signal).

**Layout**: Two-column — left sidebar with platform list (200px), right content with message feed (flex-1)

**Component inventory**:

- **Connected platforms** (left sidebar): List of connected messaging accounts
  - Each: platform icon (24x24) + account name + status indicator (green dot = connected, gray = disconnected)
  - "Disconnect" button (red outline, appears on hover)
  - Connection timestamp: "Connected 3 days ago"
- **Message feed** (right panel): Unified inbox of messages from all platforms
  - Each message card:
    - Platform icon badge (top-left corner)
    - Sender name + avatar
    - Message text (Markdown-rendered, max 500 chars with "Show more" expand)
    - Timestamp: relative ("2m ago", "1h ago")
    - "Reply" button → opens inline reply composer
    - "Forward to Agent" button → sends message content as agent instruction
    - "Archive" button → removes from feed
  - Filter bar: "All", "Unread", per-platform tabs
  - Sort: "Newest first" / "Oldest first" dropdown
- **Connect new platform**: "Add Connection" button at bottom of left sidebar
  - Opens modal with platform grid:
    - Discord: OAuth2 flow → redirect to discord.com/oauth2/authorize
    - Telegram: Bot token input → validates via `https://api.telegram.org/bot<token>/getMe`
    - Slack: OAuth2 flow → redirect to slack.com/oauth/v2/authorize
    - Microsoft Teams: OAuth2 flow via Microsoft identity platform
    - Signal: Signal Desktop bridge (requires Signal Desktop installed)
  - Each platform card: logo (48x48) + name + "Connect" button + status
- **Empty state**: "Connect a messaging platform to receive and respond to messages through your AI assistant."

**Interaction flows**:

- User clicks "Add Connection" → platform grid modal opens → user selects platform → OAuth/token flow → connection saved → platform appears in sidebar
- User clicks message → message detail expands → reply composer shown inline
- User clicks "Forward to Agent" → message content injected as new chat message with context prefix "[Forwarded from Slack] ..."
- User clicks "Reply" → inline reply composer opens below message → user types → clicks "Send Reply" → reply sent via platform API

**State variations**:

- **No connections**: Full-width empty state with CTA to connect first platform
- **Connected, no messages**: "No new messages" empty state
- **Loading**: Skeleton pulse animation on message cards
- **Connection error**: Red banner "Slack connection lost. [Reconnect]"
- **Rate limited**: Yellow banner "Telegram rate limit reached. Messages will sync in 5 minutes."

## 4.15.1 Governance Dashboard

**Screen name**: Governance Dashboard
**Route**: `/governance` or sidebar panel
**Purpose**: Enterprise governance controls — pending approvals, audit trail, tool execution history, and safety policies.

**Layout**: Tab bar at top with four tabs, content area below

**Tab 1: Pending Approvals** (PendingApprovals.tsx):

- **Header**: "Pending Approvals" + count badge (red if > 0)
- **Approval cards**: Vertical list, sorted by risk level (high first)
  - Each card:
    - Risk badge: "Low" (green), "Medium" (yellow), "High" (red) — pill-shaped
    - Tool name: e.g., "terminal_command", "file_delete", "api_call"
    - Description: plain-language summary of what will happen
    - Details section (collapsible):
      - Arguments: formatted JSON
      - Affected resources: file paths, URLs, database names
      - Impact assessment: estimated scope of change
    - Timestamp: "Requested 30s ago"
    - Action buttons:
      - "Approve" (green, filled)
      - "Reject" (red, outlined)
      - "Reject with Reason" (opens text input)
    - Timeout indicator: countdown timer if `timeoutSeconds` is set, "Auto-reject in 45s"
- **Empty state**: "No pending approvals. All agent actions are proceeding as configured."

**Tab 2: Audit Log** (AuditLog.tsx):

- **Header**: "Audit Log" + date range filter + export button
- **Date range picker**: Quick presets ("Today", "This Week", "This Month", "All Time") + custom date range
- **Log entries**: Virtualized scrollable list (react-window), newest first
  - Each entry:
    - Timestamp: "2026-03-09 14:23:45"
    - Event type icon: shield (security), wrench (tool), user (auth), cog (config)
    - Event type badge: "Tool Execution", "Configuration Change", "Authentication", "Security Alert"
    - Actor: "Agent (Claude Sonnet 4.5)" or "User" or "System"
    - Description: "Executed file_write on /Users/sid/project/index.ts"
    - HMAC signature badge: checkmark if valid, warning if tampered
    - Expandable detail: full JSON payload
  - Search bar: full-text search across all log entries
  - Filter chips: by event type, by actor, by outcome (success/failure)
- **Export**: "Export CSV" and "Export JSON" buttons
- **Empty state**: "No audit log entries for the selected period."

**Tab 3: Tool History** (ToolHistoryTable.tsx):

- **Header**: "Tool Execution History" + total count + success rate percentage
- **Table columns**: Timestamp | Tool Name | Display Name | Arguments (truncated) | Duration | Status | Cost
- **Table features**:
  - Sortable columns (click header to sort)
  - Pagination: 50 per page with page selector
  - Row expansion: click row to see full arguments and output
  - Filter bar: tool name dropdown, status dropdown (Success/Error/Cancelled), date range
  - Bulk export: "Export Selected" checkbox column + "Export" button
- **Summary bar**: "Total: 1,234 executions | Success: 98.2% | Avg duration: 340ms | Total cost: $12.34"
- **Empty state**: "No tool executions recorded yet."

**Tab 4: Safety Policies** (SafetyPolicies.tsx):

- **Header**: "Safety Policies" + "Add Policy" button
- **Active policies**: Vertical list of configured safety rules
  - Each policy card:
    - Policy name: e.g., "Block destructive file operations"
    - Rule type: "Deny List", "Rate Limit", "Approval Required", "Path Restriction"
    - Description: "Prevents rm -rf, format, and similar destructive commands"
    - Status toggle: enabled/disabled
    - Priority: number (lower = higher priority)
    - Actions: Edit (pencil), Delete (trash)
  - Built-in policies (non-deletable, toggleable):
    - "Filesystem deny list (19 patterns)" — always enabled
    - "Shell injection prevention" — always enabled
    - "Maximum execution timeout (30 minutes)" — configurable
    - "Session cost cap ($50)" — configurable
    - "Rate limiting (10 tool calls/minute)" — configurable
- **Add Policy form** (modal):
  - "Policy Name": text input
  - "Rule Type": dropdown (Deny List, Rate Limit, Approval Required, Path Restriction, Custom)
  - "Pattern/Value": text input or pattern editor
  - "Priority": number input
  - "Description": textarea
  - "Save" + "Cancel" buttons
- **Empty state**: N/A (built-in policies always present)

**Interaction flows**:

- Admin clicks Tab 1 → sees pending approvals → clicks "Approve" → invokes `agent_resolve_approval({ requestId, approved: true })` → card disappears → agent continues
- Admin clicks Tab 2 → browses audit log → searches "file_delete" → sees all file deletion events → clicks export → downloads CSV
- Admin clicks Tab 3 → sorts by duration descending → identifies slowest tool calls → clicks row → sees full output
- Admin clicks Tab 4 → toggles "Rate limiting" off → warning dialog "Disabling rate limiting allows unlimited tool executions per minute. Continue?" → confirms → policy disabled

## 4.15.2 Analytics / ROI Dashboard

**Screen name**: Analytics Dashboard
**Route**: `/analytics` or sidebar panel
**Purpose**: Display usage metrics, cost analytics, time savings estimates, and ROI calculations.

**Layout**: Dashboard grid with metric cards (top row), charts (middle), and detailed tables (bottom)

**Component inventory**:

**Top Row — Summary Cards** (4 cards, equal width):

- Card 1 "Total Cost":
  - Large number: "$124.56"
  - Trend indicator: "+12% this week" (up arrow, red)
  - Sparkline: 7-day cost trend
  - Click → opens cost breakdown view
- Card 2 "Time Saved":
  - Large number: "42.5 hours"
  - Subtitle: "Estimated based on task complexity"
  - Trend indicator: "+8 hours this week" (up arrow, green)
  - Click → opens time savings methodology
- Card 3 "Tasks Completed":
  - Large number: "1,234"
  - Subtitle: "98.2% success rate"
  - Sparkline: 7-day completion trend
- Card 4 "ROI":
  - Large number: "340%"
  - Calculation: "($14,450 value / $4,250 cost)"
  - Green badge: "Positive ROI"

**Middle Row — Charts** (2 charts, equal width):

- Chart 1 "Cost by Provider" (Recharts pie chart):
  - Segments: Anthropic (blue), OpenAI (green), Google (red), Local (gray), Other (orange)
  - Hover shows: provider name, total cost, percentage, token count
  - Legend below chart
  - Date range selector: "7 days", "30 days", "90 days", "All time"
- Chart 2 "Daily Usage" (Recharts area chart):
  - X-axis: dates (last 30 days)
  - Y-axis: token count (left), cost (right)
  - Two series: input tokens (blue area), output tokens (purple area)
  - Hover tooltip: date, input tokens, output tokens, cost

**Bottom Row — Detailed Tables**:

- Tab 1 "Cost Breakdown":
  - Table: Provider | Model | Input Tokens | Output Tokens | Cost | Conversations | Avg Cost/Conv
  - Sortable, paginated
- Tab 2 "Model Usage":
  - Table: Model | Provider | Messages | Tokens | Avg Response Time | Success Rate
  - Bar chart: model usage distribution
- Tab 3 "Feature Usage":
  - Table: Feature | Sessions | Total Time | Avg Duration
  - Features tracked: Chat, Agent Mode, Computer Use, Voice, Research, Canvas, Terminal, Scheduler
- Tab 4 "Budget":
  - Budget configuration:
    - "Daily budget": number input with currency selector ($)
    - "Monthly budget": number input
    - "Alert at": percentage slider (default 80%)
    - "Hard stop at": percentage slider (default 100%)
  - Budget status bar: visual progress bar showing current spend vs budget
  - Budget history: chart showing daily spend vs budget line

**Interaction flows**:

- User navigates to Analytics → summary cards load from `analyticsMetricsStore` and `costStore`
- User clicks "Cost by Provider" segment → filters table below to show only that provider's models
- User changes date range → all charts and tables refresh for selected period
- User sets budget → saved via `update_settings` → alerts fire when threshold reached
- User clicks "Export" → generates PDF report with all visible charts and tables

**State variations**:

- **No data**: "Start using AGI Workforce to see your analytics here." + sample data preview
- **Loading**: Skeleton cards and chart placeholders
- **Error**: "Failed to load analytics. [Retry]"
- **Budget exceeded**: Red banner "Daily budget exceeded ($25.00 / $20.00). New requests will be blocked until tomorrow."

## 4.15.3 Deep Research Panel

**Screen name**: Deep Research
**Route**: `/research/deep` or inline sidecar
**Purpose**: Multi-stage research with configurable depth, source management, and report generation.

**Layout**: Three-panel layout — query panel (left, 300px), progress panel (center, flex-1), report panel (right, 400px)

**Component inventory**:

**Query Panel** (DeepResearchPanel.tsx):

- **Research question input**: Large textarea (4 lines)
  - Placeholder: "What would you like to research?"
  - Character count: "0 / 2,000"
- **Depth selector**: Radio group
  - "Quick" — 3-5 sources, <30 seconds, best for simple factual questions
  - "Standard" — 10-15 sources, 1-3 minutes, balanced depth
  - "Deep" — 20-30 sources, 5-10 minutes, thorough analysis
  - "Exhaustive" — 50+ sources, 15-30 minutes, comprehensive report
- **Source preferences**:
  - "Include academic papers": toggle (default: off)
  - "Include news sources": toggle (default: on)
  - "Include technical docs": toggle (default: on)
  - "Restrict to domains": comma-separated domain input
  - "Exclude domains": comma-separated domain input
- **Model selector**: dropdown for research model (defaults to most capable available)
- **"Start Research" button**: blue, full-width
- **Research history**: collapsible list of past research sessions
  - Each: question (truncated) + date + depth + "View Report" link

**Progress Panel** (ResearchProgressPanel.tsx):

- **Stage timeline**: Vertical stepper showing research stages:
  - Stage 1 "Searching": magnifying glass icon → "Found 23 sources"
  - Stage 2 "Reading": book icon → "Reading 15 of 23 sources"
  - Stage 3 "Analyzing": brain icon → "Synthesizing findings"
  - Stage 4 "Writing": pen icon → "Generating report"
  - Current stage: highlighted with spinner animation
  - Completed stages: green checkmark
  - Pending stages: gray outline
- **Source discovery feed**: Real-time list of discovered sources
  - Each source card (ResearchSourceCard.tsx):
    - Favicon (16x16) + domain name
    - Page title (truncated at 80 chars)
    - Status icon: searching (spinner), found (checkmark), reading (eye), analyzing (brain), failed (X)
    - Relevance score: bar chart (0-100%)
    - "Open" link → opens in default browser
    - "Exclude" button → removes from research set
- **Statistics bar** (bottom):
  - Sources found: 23
  - Sources read: 15
  - Time elapsed: 2m 34s
  - Estimated time remaining: ~1m 30s
  - Tokens used: 45,234

**Report Panel** (ResearchReport.tsx):

- **Report header**:
  - Research question (full text)
  - Depth badge: "Deep Research"
  - Generated timestamp
  - Model used
- **Report body**: Markdown-rendered content
  - Section headers with anchor links for navigation
  - Inline citation badges: [1], [2], [3] — clickable, shows source preview on hover
  - Key findings highlighted in callout boxes
  - Tables for comparative data
  - Confidence indicators per claim: "High confidence" (green), "Medium" (yellow), "Low" (red)
- **Report actions** (toolbar):
  - "Copy" button → copies Markdown to clipboard
  - "Export PDF" button → generates PDF via `conversation_export_pdf`
  - "Export Markdown" button → saves .md file via save dialog
  - "Send to Chat" button → inserts report as assistant message in active conversation
  - "Refine" button → opens text input for follow-up research question
- **Citation panel** (collapsible, right edge):
  - Full list of citations with: number, title, URL, domain, relevance score, excerpt

**State variations**:

- **Idle**: Query panel visible, progress and report panels hidden
- **Searching**: Progress panel appears with real-time source discovery
- **Complete**: Report panel appears with full rendered report
- **Error**: Red banner "Research failed: [friendly error]. Try a more specific question or reduce depth."
- **Partial failure**: Yellow banner "3 sources could not be accessed. Report generated from available sources."

## 4.15.4 Inline Tool Result Renderers

**Screen name**: Inline Tool Results (within chat messages)
**Route**: N/A (rendered inline within assistant messages)
**Purpose**: Rich visual rendering of tool execution results directly in the chat message flow.

**Renderer types** (InlineToolResults/ directory):

**InlineCodeDiff.tsx** — Code file operations:

- **Read operation**: Syntax-highlighted code with line numbers, file path header, copy button
  - Language auto-detection from file extension
  - Collapsible if > 50 lines with "Show all 234 lines" toggle
  - Search within code: `Cmd+F` when focused
- **Write operation**: Side-by-side diff view (react-diff-viewer-continued)
  - Left panel: "Before" (red deletions)
  - Right panel: "After" (green additions)
  - Unified/split toggle
  - Line count summary: "+12 / -3 lines"
  - "Apply" / "Reject" buttons for pending edits
- **Create operation**: Full file content with "New File" badge
  - Green left border indicator
  - File path in header with "Created" badge

**InlineTerminalOutput.tsx** — Terminal command results:

- **Command display**: Monospace font, gray background
  - `$` prefix for the command
  - Copy button (copies command only)
- **Output display**: ANSI-rendered output (ansi-to-react)
  - Scrollable container (max 300px height)
  - "Show all" toggle for long output
- **Exit code badge**: Green "0" or Red "1" (or exit code number)
- **Duration badge**: "1.2s"
- **Error state**: Red border, stderr displayed below stdout

**InlineWebSearch.tsx** — Web search results:

- **Query display**: Search query in quotation marks
- **Results list**: Compact cards
  - Each: favicon + title (link) + domain + snippet (2 lines)
  - Click title → opens in browser
- **Result count**: "Found 10 results for 'query'"

**InlineScreenshot.tsx** — Screenshot display:

- **Image**: Rendered inline (max 600px wide, aspect-ratio preserved)
- **Controls**: Zoom in (+), zoom out (-), full-screen view
- **Annotations**: Red circles, blue rectangles overlaid by agent
- **Metadata**: Resolution, capture timestamp

**InlineFileExplorer.tsx** — Directory listing:

- **Tree view**: Collapsible file/folder tree
  - Folders: folder icon + name + item count
  - Files: file type icon + name + size
- **Path breadcrumb**: `/Users/sid/project/src/`
- **Actions**: Click file → opens read operation, click folder → expands

**InlineDatabaseResult.tsx** — Database query results:

- **Query display**: SQL syntax-highlighted
- **Results table**: Scrollable data table
  - Column headers from query result
  - Row limit: 100 (with "Load more" pagination)
  - Cell truncation at 200 chars with tooltip
- **Metadata**: "5 rows returned in 23ms"

**InlineImageGeneration.tsx** — AI-generated images:

- **Image**: Rendered inline (max 500px wide)
- **Prompt display**: The generation prompt (collapsible)
- **Actions**: Download, Copy, Send to Canvas, Regenerate
- **Metadata**: Model used, resolution, generation time

## 4.15.5 Sidecar Panels

**Screen name**: Dynamic Sidecar
**Route**: N/A (slide-in panels attached to main content area)
**Purpose**: Contextual panels that appear alongside the chat view for multi-tasking.

**Layout**: Slide-in from right side, 400px default width, resizable (min 300px, max 600px)

**Available sidecar panels** (DynamicSidecar.tsx):

| Panel           | Trigger                   | Content                   |
| --------------- | ------------------------- | ------------------------- |
| Research        | Research mode activated   | ResearchPanel             |
| Canvas          | Artifact created          | CanvasWorkspace (compact) |
| Terminal        | Terminal command executed | TerminalPanel             |
| File Browser    | File operation executed   | File tree + editor        |
| Browser Preview | Web navigation            | Browser page preview      |
| Code Editor     | Code artifact selected    | Monaco editor             |
| Image Preview   | Image generated/captured  | Image viewer with tools   |
| Database        | Database query executed   | Query results table       |

**Sidecar chrome**:

- **Header bar**: Panel title + close (X) button + undock button (opens in separate window)
- **Resize handle**: Left edge, drag to resize
- **Tab bar**: When multiple sidecars are active, tab bar at top for switching
- **Collapse button**: Chevron to collapse to icon-only strip (48px)

**Interaction flows**:

- Agent executes code write → sidecar opens with code diff
- Agent runs terminal command → sidecar shows terminal output
- User clicks "Open in sidecar" on any inline tool result → content moves to sidecar
- User clicks undock → sidecar content opens in separate Tauri window (floating)
- User drags resize handle → sidecar width adjusts → preference saved to `appPreferencesStore`

## 4.15.6 Floating Chat Window

**Screen name**: Floating Chat
**Route**: Separate Tauri window
**Purpose**: Always-on-top mini chat window for quick interactions without leaving current work.

**Layout**: Compact window (400x600px), no sidebar, simplified chrome

**Component inventory**:

- **Title bar**: Compact — model name only + close (X) + pin toggle
- **Message area**: Simplified message list (no tool timeline, no branching)
- **Composer**: Simplified — text input + send button only
- **Resize**: Standard window resize from edges

**Activation**: `Cmd+Shift+F` toggles floating mode

**Behavior**:

- Window level: `NSWindow.Level.floating` (always above normal windows)
- Position: Persisted per-session (bottom-right of primary display by default)
- Shares conversation state with main window via `unifiedChatStore`
- When main window is hidden, floating chat remains visible
- Closing floating chat returns to main window

## 4.15.7 Quick Query Overlay

**Screen name**: Quick Query
**Route**: Global overlay (Option+Space)
**Purpose**: Spotlight-style quick query interface for instant AI answers without switching to the full app.

**Layout**: Centered floating panel (560px wide, 60px initial height, expands on response)

**Component inventory**:

- **Search-style input**: Auto-focused, placeholder "Ask anything..."
  - Large text (18px)
  - No border, just bottom line
  - `Escape` closes overlay
  - `Enter` sends query
  - Model badge in right corner of input (small, clickable to change)
- **Response area** (appears after query):
  - Streaming markdown-rendered response
  - Compact rendering (no tool timeline)
  - Max height: 400px with scroll
  - "Open in Full App" button → transfers to main chat view
  - "Copy" button
- **Background**: Semi-transparent dark backdrop
- **Animation**: Fade-in from top (100ms), fade-out on close

**Interaction flows**:

- User presses `Option+Space` → overlay appears → input focused → user types question → presses Enter → streaming response appears → user reads → presses Escape → overlay closes
- User clicks "Open in Full App" → conversation created in main chat → main window shown → overlay closes

**State variations**:

- **Input mode**: Just the search input visible
- **Loading**: Input disabled + spinner
- **Response mode**: Input + response area visible
- **Error**: Red text below input "[friendly error message]"

## 4.16 Terminal Panel

**Screen name**: AI-Assisted Terminal
**Route**: Inline within chat or standalone `/terminal`
**Purpose**: PTY-based terminal with AI command suggestions and error explanations.

**Component inventory**:

- **Terminal emulator**: xterm.js canvas (full-width, resizable height)
  - Shell detection: auto-configures PATH for zsh/bash on macOS
  - Theme: matches app theme (dark/light)
  - Font: system monospace
  - Copy/paste: `Cmd+C` / `Cmd+V` (when terminal focused)
  - Scrollback: 10,000 lines
- **AI suggestion bar** (above terminal):
  - "Suggested command:" followed by the AI-generated command
  - "Run" button (executes the suggestion)
  - "Edit" button (inserts into terminal input for editing)
  - "Explain" button (asks AI to explain what the command does)
- **Session tabs**: Multiple terminal sessions with tab bar
  - "+" button to create new session
  - Right-click tab: rename, close
- **Error detection**: When a command fails, AI auto-generates:
  - "Error explanation:" plain-language description
  - "Fix:" suggested corrective command

---

# 5. Component Architecture

## 5.1 Component Tree

```
App (root)
├── ErrorBoundary
├── AppLayout
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── NewConversationButton
│   │   ├── SearchInput
│   │   ├── ConversationList (virtualized)
│   │   │   └── ConversationItem (repeated)
│   │   ├── QuickActionsSection
│   │   │   ├── AgentModeButton
│   │   │   ├── ResearchButton
│   │   │   ├── ComputerUseButton
│   │   │   └── VoiceChatButton
│   │   └── UserSection
│   │       ├── UserAvatar
│   │       ├── UserEmail
│   │       ├── SettingsButton
│   │       └── SubscriptionBadge
│   │
│   └── MainContent (route-based)
│       ├── UnifiedAgenticChat (default route)
│       │   ├── HeaderBar
│       │   │   ├── ModelSelectorButton → QuickModelSelector
│       │   │   ├── ActiveModeTags
│       │   │   ├── BranchNavigator
│       │   │   ├── ShareButton → ShareConversationDialog
│       │   │   ├── CheckpointButton
│       │   │   ├── ExportButton
│       │   │   └── KeyboardShortcutsButton → KeyboardShortcutsDialog
│       │   │
│       │   ├── ChatMessageList (virtualized)
│       │   │   └── MessageBubble (repeated)
│       │   │       ├── UserMessage
│       │   │       │   ├── Avatar
│       │   │       │   ├── MarkdownContent
│       │   │       │   └── AttachmentPreview
│       │   │       └── AssistantMessage
│       │   │           ├── Avatar + ModelLabel
│       │   │           ├── MarkdownContent
│       │   │           │   ├── CodeBlock (syntax highlighted)
│       │   │           │   ├── MermaidDiagram
│       │   │           │   └── KaTeX (math)
│       │   │           ├── ReasoningAccordion
│       │   │           ├── ToolTimeline
│       │   │           │   └── ToolLabel (repeated)
│       │   │           ├── ArtifactRenderer
│       │   │           ├── SourcesFooter (citations)
│       │   │           └── TokenCounter
│       │   │
│       │   ├── AgenticLoopStatusBar
│       │   │
│       │   └── ComposerArea
│       │       ├── AttachmentBar
│       │       ├── ChatInputArea (textarea)
│       │       │   ├── SlashCommandMenu (overlay)
│       │       │   ├── FileMentionPicker (overlay)
│       │       │   └── SkillMentionPicker (overlay)
│       │       ├── InputToolbar
│       │       │   ├── ModelMiniSelector
│       │       │   ├── AgentModeToggle
│       │       │   ├── ThinkingToggle
│       │       │   ├── WebSearchToggle
│       │       │   ├── FocusSelector
│       │       │   ├── AttachmentButton → PlusMenu
│       │       │   └── VoiceInputButton
│       │       ├── SendButton
│       │       └── TokenCounter
│       │
│       ├── SettingsPanel
│       │   ├── GeneralSettings
│       │   ├── CustomModelsSettings
│       │   ├── ApiKeysSettings
│       │   ├── AgentsSettings
│       │   ├── InstructionFilesSettings
│       │   ├── ExtensionsSettings (MCP)
│       │   │   ├── MCPServerSettings
│       │   │   └── MCPToolsSettings
│       │   ├── SkillsPluginsSettings
│       │   ├── SecurityPrivacySettings
│       │   │   └── MasterPasswordSettings
│       │   ├── AccountSettings
│       │   ├── NotificationsSettings
│       │   ├── VoiceSettings
│       │   ├── WindowSettings
│       │   └── SystemSettings
│       │       ├── UpdateSettings
│       │       └── CacheManagement
│       │
│       ├── ComputerUseMonitor
│       │   ├── ScreenPreview
│       │   └── ActionLog
│       │
│       ├── ResearchPanel
│       │   ├── ResearchProgressPanel
│       │   ├── ResearchSourceCard (repeated)
│       │   ├── ResearchReport
│       │   └── ResearchHistory
│       │
│       ├── CanvasWorkspace
│       │   ├── CanvasToolbar
│       │   ├── CanvasContainer (infinite pan/zoom)
│       │   │   ├── CodeArtifactNode
│       │   │   ├── TextNoteNode
│       │   │   ├── ImageNode
│       │   │   └── AgentOutputNode
│       │   └── ArtifactList (sidebar)
│       │
│       ├── SchedulerPanel
│       │   ├── ScheduledTasksPanel
│       │   │   └── ScheduledTaskCard (repeated)
│       │   └── CreateTaskModal
│       │
│       ├── SkillMarketplace
│       │   ├── SkillSearchBar
│       │   ├── SkillCategoryFilter
│       │   └── SkillCard (repeated)
│       │
│       ├── ModelComparisonView
│       │   ├── ComparisonControls
│       │   └── ModelComparisonCard (repeated)
│       │
│       ├── GovernanceDashboard
│       │   ├── PendingApprovals
│       │   ├── AuditLog
│       │   ├── AuditEventsList
│       │   ├── ToolHistoryTable
│       │   └── SafetyPolicies
│       │
│       ├── Analytics / ROIDashboard
│       ├── BackgroundTasksPanel
│       ├── TerminalPanel
│       └── MessagingPanel
│
├── FloatingChat (separate window, always-on-top)
├── QuickQuery (global overlay, Option+Space)
├── VoiceInputOverlay (floating pill)
├── CommandPalette (Cmd+K overlay)
├── ApprovalModal (overlay)
├── RiskConfirmationDialog (overlay)
└── NotificationCenter (overlay panel)
```

## 5.2 Store-Component Mapping

| Component            | Primary Store(s)        | Secondary Store(s)                      |
| -------------------- | ----------------------- | --------------------------------------- |
| ConversationList     | `unifiedChatStore`      | `settingsStore`                         |
| ChatMessageList      | `unifiedChatStore`      | `chat/toolStore`                        |
| ModelSelectorButton  | `modelStore`            | `settingsStore`                         |
| AgentModeToggle      | `executionStore`        | `settingsStore`                         |
| ToolTimeline         | `chat/toolStore`        | —                                       |
| ApprovalModal        | `governanceStore`       | —                                       |
| VoiceInputButton     | `voiceInputStore`       | —                                       |
| SettingsPanel        | `settingsStore`         | `settingsDialogStore`                   |
| CustomModelsSettings | `settingsStore`         | `modelStore`                            |
| ApiKeysSettings      | `settingsStore`         | —                                       |
| MCPServerSettings    | `mcpStore`              | `mcpServerStore`                        |
| SkillMarketplace     | `skillMarketplaceStore` | —                                       |
| ResearchPanel        | `researchStore`         | —                                       |
| CanvasWorkspace      | `canvasStore`           | `artifactStore`                         |
| SchedulerPanel       | `schedulerStore`        | —                                       |
| ComputerUseMonitor   | `computerUseStore`      | `automationStore`                       |
| BackgroundTasksPanel | `agentTaskStore`        | —                                       |
| Analytics            | `analyticsMetricsStore` | `costStore`, `usageTrackingStore`       |
| TerminalPanel        | `terminalStore`         | —                                       |
| GovernanceDashboard  | `governanceStore`       | —                                       |
| BudgetTracker        | `costStore`             | `tokenBudgetStore`                      |
| FloatingChat         | `unifiedChatStore`      | —                                       |
| QuickQuery           | `unifiedChatStore`      | —                                       |
| AccountSettings      | `authCoreStore`         | `billingStore`, `subscriptionPlanStore` |
| NotificationCenter   | — (local state)         | —                                       |

## 5.3 Store Catalog

All stores are located in `apps/desktop/src/stores/`:

| Store File                     | Persisted | Key State                                                      |
| ------------------------------ | --------- | -------------------------------------------------------------- |
| `unifiedChatStore.ts`          | Session   | conversations, messages, activeConversationId, streamingState  |
| `chat/toolStore.ts`            | No        | toolExecutions, toolTimeline (listens on `tool:event` channel) |
| `settingsStore.ts`             | Yes (v10) | theme, fontSize, defaultModel, routingStrategy, approvalMode   |
| `modelStore.ts`                | Session   | availableModels, selectedModel, favoriteModels                 |
| `voiceInputStore.ts`           | No        | isRecording, transcription, audioLevel                         |
| `mcpStore.ts`                  | Yes       | connectedServers, tools, serverHealth                          |
| `mcpbStore.ts`                 | Yes       | bundles, bundleHealth                                          |
| `mcpServerStore.ts`            | Yes       | serverConfigs, serverStatus                                    |
| `researchStore.ts`             | Session   | activeResearch, sources, report                                |
| `canvasStore.ts`               | Session   | artifacts, positions, zoom                                     |
| `artifactStore.ts`             | Session   | artifacts, versions, selected                                  |
| `schedulerStore.ts`            | Yes       | scheduledJobs, executionHistory                                |
| `computerUseStore.ts`          | No        | opaState, screenshots, actionPlan                              |
| `automationStore.ts`           | No        | recordings, scripts, inspectedElements                         |
| `agentTaskStore.ts`            | Session   | backgroundTasks, taskStatus                                    |
| `costStore.ts`                 | Yes       | sessionCost, totalCost, budgetLimit                            |
| `tokenBudgetStore.ts`          | Yes       | budgetConfig, usage                                            |
| `governanceStore.ts`           | No        | pendingApprovals, auditLog                                     |
| `terminalStore.ts`             | No        | sessions, activeSession                                        |
| `auth.ts`                      | Yes       | user, session, isAuthenticated                                 |
| `authCoreStore.ts`             | Yes       | profile, subscription                                          |
| `billingStore.ts`              | Yes       | creditBalance, subscriptionStatus                              |
| `subscriptionPlanStore.ts`     | Yes       | currentPlan, features                                          |
| `skillMarketplaceStore.ts`     | Yes       | installedSkills, categories                                    |
| `memoryStore.ts`               | Yes       | memories, searchResults                                        |
| `emailStore.ts`                | No        | accounts, messages, folders                                    |
| `calendarStore.ts`             | No        | accounts, events                                               |
| `browserStore.ts`              | No        | tabs, activePage, domSnapshot                                  |
| `cloudStore.ts`                | No        | accounts, files                                                |
| `databaseStore.ts`             | No        | connections, queryResults                                      |
| `filesystemStore.ts`           | No        | fileTree, openFiles                                            |
| `projectStore.ts`              | Yes       | activeProject, recentProjects                                  |
| `customInstructionsStore.ts`   | Yes       | discoveredFiles, mergedContext                                 |
| `editingStore.ts`              | No        | pendingEdits, diffState                                        |
| `executionStore.ts`            | No        | agentMode, executionState                                      |
| `executionPreferencesStore.ts` | Yes       | timeout, compaction, reflection                                |
| `settingsDialogStore.ts`       | No        | activeTab, isOpen                                              |
| `analyticsMetricsStore.ts`     | Yes       | metrics, snapshots                                             |
| `usageTrackingStore.ts`        | Yes       | dailyUsage, monthlyUsage                                       |
| `roiStore.ts`                  | Yes       | timeSaved, costSaved                                           |
| `appPreferencesStore.ts`       | Yes       | windowState, sidebarCollapsed                                  |
| `chatPreferencesStore.ts`      | Yes       | sendBehavior, showTimestamps                                   |
| `securityPreferencesStore.ts`  | Yes       | safetyLevel, logToolExecutions                                 |
| `featureFlagStore.ts`          | Yes       | enabledFeatures                                                |
| `llmConfigStore.ts`            | Yes       | providerConfigs, apiKeyStatus                                  |
| `deviceLinkStore.ts`           | Yes       | linkedDevices, pairingCode                                     |
| `connectionStore.ts`           | No        | onlineStatus, syncState                                        |
| `updaterStore.ts`              | No        | updateAvailable, downloadProgress                              |
| `mediaGenerationStore.ts`      | No        | pendingGenerations, results                                    |
| `teamStore.ts`                 | Yes       | team, members, invitations                                     |
| `templateStore.ts`             | Yes       | templates, categories                                          |
| `productivityStore.ts`         | No        | tasks, connectedServices                                       |
| `ui.ts`                        | No        | panelStates, modals, overlays                                  |

## 5.4 Component-to-Tauri Command Mapping

| Component               | Tauri Commands Invoked                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| ChatInputArea (send)    | `chat_send_message`, `chat_add_pending_message`                                                         |
| ChatMessageList (load)  | `chat_get_messages`, `chat_get_conversations`                                                           |
| ConversationList        | `chat_get_conversations`, `chat_create_conversation`, `chat_delete_conversation`                        |
| ModelSelector           | `get_available_models`, `llm_test_connection`                                                           |
| ApprovalModal           | `agent_resolve_approval`                                                                                |
| ToolTimeline            | (listens on `tool:event` channel)                                                                       |
| VoiceInputButton        | `speech_start_recording`, `speech_stop_and_transcribe`                                                  |
| SettingsPanel (general) | `get_settings`, `update_settings`                                                                       |
| ApiKeysSettings         | `secret_store`, `secret_get`, `secret_delete`, `llm_test_connection`                                    |
| CustomModelsSettings    | `get_custom_models`, `add_custom_model`, `remove_custom_model`, `test_custom_model`                     |
| MCPServerSettings       | `mcp_list_servers`, `mcp_connect_server`, `mcp_disconnect_server`, `mcp_get_tools`                      |
| SchedulerPanel          | `scheduler_list_jobs`, `scheduler_create_job`, `scheduler_delete_job`, `scheduler_run_now`              |
| ComputerUseMonitor      | `computer_use_start`, `computer_use_stop`, `computer_use_screenshot`, `computer_use_act`                |
| ResearchPanel           | `research_start`, `research_get_status`, `research_get_report`                                          |
| CanvasWorkspace         | `canvas_create`, `canvas_add_item`, `canvas_move_item`, `canvas_delete_item`                            |
| TerminalPanel           | `terminal_create_session`, `terminal_write`, `terminal_resize`                                          |
| BackgroundTasksPanel    | `background_agent_list`, `background_agent_pause`, `background_agent_resume`, `background_agent_cancel` |
| GovernanceDashboard     | `governance_get_audit_log`, `governance_get_pending_approvals`                                          |
| UpdateSettings          | `check_for_update`, `install_update`                                                                    |
| AccountSettings         | (Supabase client calls, not Tauri)                                                                      |

## 5.5 TypeScript Interfaces

### 5.5.1 Core Message Types

```typescript
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentPart[];
  tokens?: number;
  cost?: number;
  model?: string;
  provider?: string;
  createdAt: string;
  updatedAt: string;
  branchId?: string;
  parentMessageId?: string;
  metadata?: MessageMetadata;
}

interface ContentPart {
  type: 'text' | 'image' | 'code' | 'tool_use' | 'tool_result' | 'thinking' | 'citation';
  text?: string;
  imageUrl?: string;
  imageBase64?: string;
  language?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolId?: string;
  thinkingContent?: string;
  citationUrl?: string;
  citationTitle?: string;
}

interface MessageMetadata {
  thinkingTokens?: number;
  outputTokens?: number;
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  latencyMs?: number;
  timeToFirstTokenMs?: number;
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
}
```

### 5.5.2 Conversation Types

```typescript
interface Conversation {
  id: string;
  title: string;
  model: string;
  provider: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalCost: number;
  branchCount?: number;
  activeBranchId?: string;
  projectId?: string;
  tags?: string[];
}

interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  provider: string;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: string;
  messageCount: number;
  totalCost: number;
  preview?: string;
}

type ConversationSortBy = 'lastMessageAt' | 'createdAt' | 'title' | 'messageCount';
type ConversationFilterBy = 'all' | 'pinned' | 'archived' | 'active';
```

### 5.5.3 Tool Execution Types

```typescript
interface ToolEvent {
  type: 'Started' | 'Progress' | 'Completed';
  toolName: string;
  displayName: string;
  displayArgs?: string;
  conversationId: string;
  messageId: string;
  durationMs?: number;
  resultPreview?: string;
  success?: boolean;
  error?: string;
  parallelGroup?: string;
}

// Payload for `tool:event` Tauri events emitted by the agentic loop.
// Mirrors the Rust `ToolEvent` enum serialized with serde(tag = "type", rename_all = "snake_case").
interface ToolEventPayload {
  type: 'started' | 'progress' | 'completed';
  id: string;
  conversation_id: number;
  message_id: string;
  tool_name?: string;
  display_name?: string;
  display_args?: string;
  iteration?: number;
  stdout_chunk?: string;
  progress_pct?: number;
  success?: boolean;
  duration_ms?: number;
  result_preview?: string;
  error?: string;
  parallel_group?: string;
}

interface ToolLabelEntry {
  id: string;
  displayName: string;
  displayArgs: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  error?: string;
  parallelGroup?: string;
}

interface ToolStreamStateEntry {
  tool_id: string;
  tool_name: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  progressMessage?: string;
  outputChunks: string[];
  outputBuffer: string;
  bytesProcessed?: number;
  bytesTotal?: number;
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration_ms?: number;
  retryable?: boolean;
  parameters?: Record<string, unknown>;
}

// Tool display name mapping (Claude Code-style labels)
// Maps raw tool names to user-friendly display names
type ToolDisplayNameMap = Record<
  string,
  {
    displayName: string;
    icon:
      | 'FileText'
      | 'Terminal'
      | 'Search'
      | 'Globe'
      | 'Edit3'
      | 'FolderOpen'
      | 'GitBranch'
      | 'Image'
      | 'Database'
      | 'Wrench';
  }
>;
```

### 5.5.4 Agent Types

```typescript
interface AgentTask {
  id: string;
  goal: string;
  status: AgentTaskStatus;
  currentStep: number;
  totalSteps: number;
  model: string;
  startedAt: string;
  completedAt?: string;
  cost: number;
  isBackground: boolean;
  checkpointId?: string;
  parentTaskId?: string;
  subTasks?: AgentTask[];
}

type AgentTaskStatus =
  | 'Pending'
  | 'Planning'
  | 'Executing'
  | 'WaitingApproval'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

interface AgentStep {
  id: string;
  taskId: string;
  type: 'plan' | 'execute' | 'observe' | 'reflect' | 'tool_call';
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

interface AgenticLoopStatus {
  active: boolean;
  conversationId: number;
  iteration: number;
  maxIterations: number;
}

interface ActionTrailEntry {
  type: 'running' | 'completed' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: Date;
  fadeAfter?: number;
  metadata?: Record<string, unknown>;
}
```

### 5.5.5 MCP Types

```typescript
interface McpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status: 'connected' | 'connecting' | 'error' | 'disabled';
  toolCount: number;
  lastHealthCheck?: string;
  healthStatus?: 'healthy' | 'degraded' | 'offline';
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
  enabled: boolean;
}

interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// Circuit breaker state for MCP servers
type CircuitBreakerState = 'Closed' | 'Open' | 'HalfOpen';

interface McpCircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt?: string;
  cooldownMs: number; // 30000ms default
}
```

### 5.5.6 Settings Types

```typescript
interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  defaultModel: string;
  routingStrategy: RoutingStrategy;
  approvalMode: ApprovalMode;
  sendBehavior: 'enter' | 'cmd-enter';
  streaming: boolean;
  telemetry: boolean;
  language: string;
  startupBehavior: 'last-conversation' | 'empty-chat' | 'onboarding-tips';
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  autoSaveConversations: boolean;
  autoCompactContext: boolean;
  enableReflection: boolean;
  enableCheckpoints: boolean;
  maxBackgroundAgents: number;
  maxConcurrentSubAgents: number;
  executionTimeout: number;
  safetyLevel: 'standard' | 'strict' | 'permissive';
  logToolExecutions: boolean;
}

type RoutingStrategy =
  | 'Auto'
  | 'Economy'
  | 'Balanced'
  | 'Premium'
  | 'Cost'
  | 'Latency'
  | 'LocalFirst';
type ApprovalMode = 'ask' | 'auto-approve-readonly' | 'auto-approve-all';
type FocusMode = 'General' | 'Code' | 'Writing' | 'Research' | 'Data';

interface CostEntry {
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  conversationId: string;
}
```

### 5.5.7 Approval Types

```typescript
type ApprovalRiskLevel = 'low' | 'medium' | 'high';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';
type ApprovalScopeType = 'terminal' | 'filesystem' | 'browser' | 'ui' | 'mcp';

interface ApprovalScope {
  type: ApprovalScopeType;
  command?: string;
  cwd?: string;
  path?: string;
  domain?: string;
  description?: string;
  risk: ApprovalRiskLevel;
}

interface ApprovalRequest {
  id: string;
  type:
    | 'file_delete'
    | 'terminal_command'
    | 'api_call'
    | 'data_modification'
    | 'mcp_tool'
    | 'tool_execution';
  description: string;
  riskLevel: ApprovalRiskLevel;
  details: Record<string, unknown>;
  impact?: string;
  status: ApprovalStatus;
  timeoutSeconds?: number;
  createdAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  workflowHash?: string;
  actionId?: string;
  scope?: ApprovalScope;
  actionSignature?: string;
}

interface TrustedWorkflow {
  hash: string;
  label?: string;
  createdAt: Date;
  actionSignatures: string[];
}
```

### 5.5.8 File Operation Types

```typescript
type FileOperationType = 'read' | 'write' | 'create' | 'delete' | 'move' | 'rename';

interface FileOperation {
  id: string;
  type: FileOperationType;
  filePath: string;
  oldContent?: string;
  newContent?: string;
  sizeBytes?: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  sessionId?: string;
  agentId?: string;
  goalId?: string;
}

interface TerminalCommand {
  id: string;
  command: string;
  cwd: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  timestamp: Date;
  sessionId?: string;
  agentId?: string;
}

interface Screenshot {
  id: string;
  imageBase64: string;
  action?: string;
  elementBounds?: { x: number; y: number; width: number; height: number };
  confidence?: number;
  timestamp: Date;
}
```

### 5.5.9 Research Types

```typescript
interface ResearchSession {
  id: string;
  question: string;
  depth: 'Quick' | 'Standard' | 'Deep' | 'Exhaustive';
  status: 'searching' | 'reading' | 'analyzing' | 'writing' | 'completed' | 'failed';
  sources: ResearchSource[];
  report?: ResearchReport;
  startedAt: string;
  completedAt?: string;
  tokensUsed: number;
  model: string;
}

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  domain: string;
  status: 'searching' | 'found' | 'reading' | 'analyzing' | 'completed' | 'failed';
  relevanceScore: number;
  excerpt?: string;
  favicon?: string;
}

interface ResearchReport {
  content: string; // Markdown
  citations: Citation[];
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  generatedAt: string;
}

interface Citation {
  number: number;
  title: string;
  url: string;
  domain: string;
  relevanceScore: number;
  excerpt: string;
}
```

### 5.5.10 Voice Types

```typescript
interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  duration: number;
  transcription?: string;
  error?: string;
  sttProvider: 'deepgram' | 'whisper-local' | 'macos';
}

interface VoiceOutputState {
  isSpeaking: boolean;
  ttsProvider: 'piper' | 'macos' | 'none';
  voice: string;
  speed: number;
  autoPlay: boolean;
}

interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  isInput: boolean;
}
```

### 5.5.11 Subscription Types

```typescript
type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'max' | 'team' | 'enterprise';

interface SubscriptionStatus {
  tier: SubscriptionTier;
  creditsRemaining: number;
  creditsTotal: number;
  resetDate: string;
  isActive: boolean;
  features: Record<string, boolean>;
}

interface BillingInfo {
  customerId: string;
  subscriptionId: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentMethod?: {
    brand: string;
    last4: string;
    expiresAt: string;
  };
}
```

## 5.6 Hook Catalog

All React hooks are located in `apps/desktop/src/hooks/`:

### 5.6.1 Chat & Agent Hooks

| Hook                 | Purpose                                                | Key State / Returns                                      |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `useAgenticEvents`   | Orchestrates all agentic event handling                | Combines sub-hooks for loop, tool, notification events   |
| `useAgentLoopEvents` | Listens to `agentic:loop-*` events                     | `agenticLoopStatus`, `isAgentRunning`                    |
| `useToolEvents`      | Listens to `tool:event` channel, updates tool timeline | `toolTimeline`, `activeTools`                            |
| `useApprovalActions` | Handles approval/rejection of tool execution requests  | `approve(id)`, `reject(id, reason?)`, `pendingApprovals` |
| `useBackgroundTasks` | Manages background agent lifecycle                     | `tasks`, `pause(id)`, `resume(id)`, `cancel(id)`         |

### 5.6.2 Voice & Media Hooks

| Hook                    | Purpose                                          | Key State / Returns                                                   |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| `useVoiceInput`         | Push-to-talk voice recording management          | `startRecording()`, `stopRecording()`, `isRecording`, `transcription` |
| `useVoiceHotkey`        | Global hotkey binding for voice input            | `isHotkeyActive`, `hotkeyConfig`                                      |
| `useVoiceTranscription` | Speech-to-text transcription pipeline            | `transcribe(audioData)`, `isTranscribing`, `result`                   |
| `useGlobalVoicePTT`     | Global push-to-talk with macOS Accessibility API | `isListening`, `vadEnabled`                                           |
| `useTTS`                | Text-to-speech output management                 | `speak(text)`, `stop()`, `isSpeaking`, `voice`                        |
| `useOCR`                | Optional OCR via Tesseract                       | `recognizeText(imageData)`, `isProcessing`                            |
| `useScreenCapture`      | Screen capture via `xcap`                        | `captureScreen()`, `captureRegion()`, `captureWindow()`               |

### 5.6.3 Tool & Integration Hooks

| Hook                   | Purpose                              | Key State / Returns                                           |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `useMCP`               | MCP server management                | `servers`, `connect(config)`, `disconnect(id)`, `tools`       |
| `useTerminal`          | PTY terminal session management      | `sessions`, `createSession()`, `write(data)`, `resize()`      |
| `useFileOperations`    | File system operations via Tauri IPC | `readFile(path)`, `writeFile(path, content)`, `listDir(path)` |
| `useGit`               | Git operations via `git2`            | `status()`, `commit(msg)`, `diff()`, `branches()`             |
| `useEmail`             | Email IMAP/SMTP operations           | `accounts`, `messages`, `sendEmail()`, `fetchInbox()`         |
| `useCalendar`          | Calendar integration                 | `events`, `createEvent()`, `fetchEvents(range)`               |
| `useCloudStorage`      | Cloud file storage                   | `accounts`, `files`, `upload()`, `download()`                 |
| `useDocuments`         | Document processing                  | `readPDF(path)`, `writeDOCX()`, `readXLSX()`                  |
| `useBrowserAutomation` | Chrome CDP / extension bridge        | `navigate(url)`, `click(selector)`, `screenshot()`            |

### 5.6.4 Navigation & UI Hooks

| Hook                          | Purpose                                  | Key State / Returns                                       |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `useKeyboardShortcuts`        | Register and handle keyboard shortcuts   | `register(shortcut, handler)`, `unregister(shortcut)`     |
| `useReducedMotion`            | Respect macOS "Reduce motion" preference | `prefersReducedMotion: boolean`                           |
| `useSlashCommands`            | Slash command parsing and execution      | `parseCommand(input)`, `executeCommand(cmd, args)`        |
| `useSlashCommandAutocomplete` | Autocomplete for slash commands          | `suggestions`, `selectedIndex`                            |
| `useCommandAutocomplete`      | General command autocomplete             | `results`, `search(query)`                                |
| `useDeepLink`                 | Handle `agiworkforce://` deep links      | `handleDeepLink(url)`                                     |
| `useUpdater`                  | Auto-update checking and installation    | `updateAvailable`, `checkForUpdate()`, `installUpdate()`  |
| `useNotifications`            | System notification management           | `send(title, body)`, `requestPermission()`                |
| `useToast`                    | Sonner toast notifications               | `success(msg)`, `error(msg)`, `info(msg)`, `warning(msg)` |

### 5.6.5 Data & Analytics Hooks

| Hook                   | Purpose                                  | Key State / Returns                                          |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `useAnalytics`         | Usage analytics tracking                 | `trackEvent(name, props)`, `metrics`                         |
| `useMemory`            | Persistent memory management             | `memories`, `store(memory)`, `search(query)`, `delete(id)`   |
| `useMemoryIntegration` | Memory-conversation integration          | `extractMemories(conversation)`, `injectContext()`           |
| `useScheduler`         | Task scheduling management               | `jobs`, `createJob(config)`, `deleteJob(id)`, `runNow(id)`   |
| `useCheckpoints`       | Conversation checkpoint management       | `createCheckpoint()`, `restoreCheckpoint(id)`, `checkpoints` |
| `useModelCapabilities` | Model capability detection (esp. Ollama) | `supportsVision`, `supportsTools`, `contextWindow`           |
| `useCreditRefresh`     | Subscription credit refresh polling      | `credits`, `refreshCredits()`                                |

### 5.6.6 Event Listener Hooks

These hooks establish Tauri event channel listeners:

| Hook                       | Tauri Event(s) Listened                                                                         | Purpose                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `useAgentLoopEvents`       | `agentic:loop-started`, `agentic:loop-status`, `agentic:loop-ended`, `agentic:message-consumed` | Tracks agentic loop lifecycle                              |
| `useToolEvents`            | `tool:event`                                                                                    | Processes tool execution events into timeline entries      |
| `useFileTerminalEvents`    | `file:changed`                                                                                  | Watches for file system changes from Rust notify watcher   |
| `useExtensionBridgeEvents` | `extension:event`                                                                               | Receives events from Chrome extension via native messaging |
| `useNotificationEvents`    | `notification:new`                                                                              | Receives system notification events from Rust              |
| `useTauriStreamListeners`  | `chat:stream-chunk`, `chat:stream-error`                                                        | Handles SSE stream chunks for chat message rendering       |
| `useAutomationEvents`      | `automation:status`, `automation:screenshot`                                                    | Receives computer use automation updates                   |

## 5.7 Utility Modules

### 5.7.1 Tool Display Name Mapping (`lib/toolDisplayNames.ts`)

Maps raw Rust tool names to Claude Code-style user-facing labels:

| Raw Tool Name      | Display Name     | Icon       | Example Display                    |
| ------------------ | ---------------- | ---------- | ---------------------------------- |
| `file_read`        | `Read`           | FileText   | `Read(src/main.rs)`                |
| `file_write`       | `Write`          | FileText   | `Write(output.txt)`                |
| `file_edit`        | `Edit`           | Edit3      | `Edit(config.ts)`                  |
| `file_list`        | `LS`             | FolderOpen | `LS(src/)`                         |
| `code_search`      | `Search`         | Search     | `Search("async function")`         |
| `terminal_execute` | `Bash`           | Terminal   | `Bash(npm install)`                |
| `web_search`       | `WebSearch`      | Globe      | `WebSearch(tauri v2 docs)`         |
| `web_fetch`        | `WebFetch`       | Globe      | `WebFetch(https://docs.rs)`        |
| `memory_store`     | `Memory`         | Database   | `Memory(store preference)`         |
| `git_commit`       | `Git`            | GitBranch  | `Git(commit "fix bug")`            |
| `image_generate`   | `ImageGen`       | Image      | `ImageGen(sunset landscape)`       |
| (any MCP tool)     | Server tool name | Wrench     | `mcp__filesystem__read_file(path)` |

### 5.7.2 Chat Tool Utilities (`lib/chatToolUtils.ts`)

Pure utility functions for tool data normalization:

| Function                                                             | Purpose                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `normalizeToolNameForUi(toolName)`                                   | Strips `__server__` prefix from MCP tool names                                                                                             |
| `toolNameToArtifactType(toolName)`                                   | Maps tool names to artifact types (code, image, document, spreadsheet)                                                                     |
| `toolNameToTitle(toolName)`                                          | Converts tool name to human-readable title                                                                                                 |
| `normalizeInlineToolData(toolName, rawData)`                         | Normalizes tool result data for inline renderers (handles image, video, document, screenshot, browser, file_read, MCP filesystem variants) |
| `extractMcpTextBlocks(data)`                                         | Extracts text blocks from MCP content array format                                                                                         |
| `normalizeMcpFilesystemInlineData(tool, data)`                       | Normalizes MCP filesystem tool results (read_text_file, list_directory, list_allowed_directories) into standard shapes                     |
| `validateSlashCommandArgs(command, args)`                            | Validates slash command arguments for safety (length limits, dangerous pattern detection)                                                  |
| `buildProjectSlashCommandInstructions(command, args, content, path)` | Builds system prompt for project-level slash commands                                                                                      |

### 5.7.3 Error Message Utilities (`lib/errorMessages.ts`)

Translates internal errors to user-friendly messages (NN-01 compliance):

| Internal Error Pattern    | User-Facing Message                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ECONNREFUSED`            | "Could not connect to the server. Check your internet connection."                                                               |
| `401 Unauthorized`        | "Your API key was rejected. Check Settings > API Keys."                                                                          |
| `429 Rate Limited`        | "You've hit the rate limit. The request will retry automatically in a moment."                                                   |
| `500 Internal Server`     | "The AI provider is experiencing issues. Try again or switch models."                                                            |
| `context_length_exceeded` | "Your conversation is too long for this model. Try compacting the context or switching to a model with a larger context window." |
| `stream_watchdog_timeout` | (silent recovery — NN-02: user never sees this)                                                                                  |
| `billing_limit_exceeded`  | "You've reached your daily spending limit. Adjust your budget in Settings > Analytics."                                          |
| Any unmatched error       | "Something went wrong. Please try again."                                                                                        |

---

# 6. Data Flow & API Connections

## 6.1 Tauri IPC Invoke Catalog

All frontend-to-backend communication uses `@tauri-apps/api invoke()` with camelCase parameter keys. The Rust backend receives these as snake_case automatically via Tauri's serde deserialization.

### 6.1.1 Chat Commands

| Command                    | Request Shape                                                                                                                         | Response Shape                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------- |
| `chat_create_conversation` | `{ title?: string, model?: string }`                                                                                                  | `{ id: string, title: string, createdAt: string }`                                    |
| `chat_get_conversations`   | `{ limit?: number, offset?: number }`                                                                                                 | `Conversation[]`                                                                      |
| `chat_get_conversation`    | `{ conversationId: string }`                                                                                                          | `Conversation`                                                                        |
| `chat_get_messages`        | `{ conversationId: string, limit?: number, offset?: number }`                                                                         | `Message[]`                                                                           |
| `chat_send_message`        | `{ conversationId: string, content: string, attachments?: Attachment[], model?: string, agentMode?: boolean, thinkingMode?: string }` | Streams via Tauri events; final `{ messageId: string, cost: number, tokens: number }` |
| `chat_stop_generation`     | `{ conversationId: string }`                                                                                                          | `{ stopped: boolean }`                                                                |
| `chat_handle_stop`         | `{ conversationId: string }`                                                                                                          | `void`                                                                                |
| `chat_detect_intent`       | `{ message: string }`                                                                                                                 | `{ intent: string, confidence: number }`                                              |
| `chat_compact_context`     | `{ conversationId: string }`                                                                                                          | `{ compactedTokens: number, summary: string }`                                        |
| `chat_get_cost_overview`   | `{}`                                                                                                                                  | `{ totalCost: number, sessionCost: number, dailyCost: number }`                       |
| `chat_get_cost_analytics`  | `{ conversationId: string }`                                                                                                          | `{ costs: CostEntry[] }`                                                              |
| `search_chat_history`      | `{ query: string, limit?: number }`                                                                                                   | `{ results: SearchResult[] }`                                                         |
| `conversation_export`      | `{ conversationId: string, format: 'json'                                                                                             | 'markdown' }`                                                                         | `{ content: string }` |
| `conversation_export_pdf`  | `{ conversationId: string }`                                                                                                          | `{ filePath: string }`                                                                |
| `conversation_fork`        | `{ conversationId: string, messageId: string }`                                                                                       | `{ newConversationId: string }`                                                       |
| `chat_add_pending_message` | `{ conversationId: string, content: string }`                                                                                         | `void`                                                                                |
| `chat_pop_pending_message` | `{ conversationId: string }`                                                                                                          | `{ content?: string }`                                                                |
| `cancel_tool_execution`    | `{ conversationId: string }`                                                                                                          | `{ cancelled: boolean }`                                                              |

### 6.1.2 AGI / Agent Commands

| Command                       | Request Shape                                                      | Response Shape                                                               |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `agi_submit_goal`             | `{ goal: string, model?: string, conversationId?: string }`        | `{ goalId: string }`                                                         |
| `agi_submit_goal_parallel`    | `{ goal: string, model?: string }`                                 | `{ goalId: string }`                                                         |
| `agi_get_goal_status`         | `{ goalId: string }`                                               | `{ status: string, currentStep: number, totalSteps: number, steps: Step[] }` |
| `agi_list_goals`              | `{}`                                                               | `Goal[]`                                                                     |
| `agi_cancel_goal`             | `{ goalId: string }`                                               | `{ cancelled: boolean }`                                                     |
| `agi_pause_task`              | `{ taskId: string }`                                               | `{ paused: boolean }`                                                        |
| `agi_resume_task`             | `{ taskId: string }`                                               | `{ resumed: boolean }`                                                       |
| `agi_abort_task`              | `{ taskId: string }`                                               | `{ aborted: boolean }`                                                       |
| `agi_get_reflection_insights` | `{ goalId: string }`                                               | `{ insights: Insight[] }`                                                    |
| `agi_get_sub_goals`           | `{ goalId: string }`                                               | `{ subGoals: SubGoal[] }`                                                    |
| `agent_resolve_approval`      | `{ requestId: string, approved: boolean, trustSession?: boolean }` | `void`                                                                       |
| `agent_set_workflow_hash`     | `{ workflowHash: string, trusted: boolean }`                       | `void`                                                                       |

### 6.1.3 Background Agent Commands

| Command                     | Request Shape         | Response Shape               |
| --------------------------- | --------------------- | ---------------------------- |
| `background_agent_list`     | `{}`                  | `BackgroundAgent[]`          |
| `background_agent_pause`    | `{ agentId: string }` | `void`                       |
| `background_agent_resume`   | `{ agentId: string }` | `void`                       |
| `background_agent_cancel`   | `{ agentId: string }` | `void`                       |
| `background_agent_takeover` | `{ agentId: string }` | `{ conversationId: string }` |

### 6.1.4 MCP Commands

| Command                 | Request Shape                                                                | Response Shape                            |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `mcp_initialize`        | `{}`                                                                         | `{ message: string }`                     |
| `mcp_list_servers`      | `{}`                                                                         | `McpServer[]`                             |
| `mcp_connect_server`    | `{ config: McpServerConfig }`                                                | `{ serverId: string, tools: McpTool[] }`  |
| `mcp_disconnect_server` | `{ serverId: string }`                                                       | `void`                                    |
| `mcp_get_tools`         | `{ serverId?: string }`                                                      | `McpTool[]`                               |
| `mcp_execute_tool`      | `{ serverId: string, toolName: string, arguments: Record<string, unknown> }` | `{ result: unknown }`                     |
| `mcp_get_server_health` | `{ serverId: string }`                                                       | `{ healthy: boolean, lastCheck: string }` |

### 6.1.5 Voice Commands

| Command                      | Request Shape                             | Response Shape                                         |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `speech_start_recording`     | `{ device?: string }`                     | `void`                                                 |
| `speech_stop_and_transcribe` | `{}`                                      | `{ text: string, language: string, duration: number }` |
| `voice_transcribe_blob`      | `{ audioData: number[], format: string }` | `{ text: string }`                                     |
| `tts_speak`                  | `{ text: string, voice?: string }`        | `void`                                                 |
| `tts_stop`                   | `{}`                                      | `void`                                                 |

### 6.1.6 Automation Commands

| Command                   | Request Shape                                             | Response Shape                                         |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `automation_list_windows` | `{}`                                                      | `WindowInfo[]`                                         |
| `automation_click`        | `{ x: number, y: number }`                                | `void`                                                 |
| `automation_type`         | `{ text: string }`                                        | `void`                                                 |
| `automation_send_keys`    | `{ keys: string }`                                        | `void`                                                 |
| `automation_hotkey`       | `{ modifiers: string[], key: string }`                    | `void`                                                 |
| `automation_screenshot`   | `{}`                                                      | `{ imageData: string }`                                |
| `automation_ocr`          | `{ imageData: string }`                                   | `{ text: string }`                                     |
| `capture_screen_full`     | `{}`                                                      | `{ imageData: string, width: number, height: number }` |
| `capture_screen_region`   | `{ x: number, y: number, width: number, height: number }` | `{ imageData: string }`                                |
| `capture_screen_window`   | `{ windowId: number }`                                    | `{ imageData: string }`                                |

### 6.1.7 Settings & Security Commands

| Command                  | Request Shape                          | Response Shape                         |
| ------------------------ | -------------------------------------- | -------------------------------------- |
| `get_settings`           | `{}`                                   | `AppSettings`                          |
| `update_settings`        | `{ settings: Partial<AppSettings> }`   | `void`                                 |
| `secret_store`           | `{ key: string, value: string }`       | `void`                                 |
| `secret_get`             | `{ key: string }`                      | `{ value?: string }`                   |
| `secret_delete`          | `{ key: string }`                      | `void`                                 |
| `secret_list`            | `{}`                                   | `{ keys: string[] }`                   |
| `llm_test_connection`    | `{ provider: string, apiKey: string }` | `{ success: boolean, error?: string }` |
| `master_password_set`    | `{ password: string }`                 | `void`                                 |
| `master_password_verify` | `{ password: string }`                 | `{ valid: boolean }`                   |
| `master_password_status` | `{}`                                   | `{ isSet: boolean }`                   |

### 6.1.8 Scheduler Commands

| Command                           | Request Shape                                                                                                                                  | Response Shape      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `scheduler_list_jobs`             | `{}`                                                                                                                                           | `ScheduledJob[]`    |
| `scheduler_create_job`            | `{ name: string, goal: string, cronExpression?: string, intervalSeconds?: number, model?: string, actionType?: string, actionData?: unknown }` | `{ jobId: string }` |
| `scheduler_delete_job`            | `{ jobId: string }`                                                                                                                            | `void`              |
| `scheduler_toggle_job`            | `{ jobId: string, enabled: boolean }`                                                                                                          | `void`              |
| `scheduler_run_now`               | `{ jobId: string }`                                                                                                                            | `void`              |
| `scheduler_get_execution_history` | `{ jobId: string }`                                                                                                                            | `Execution[]`       |
| `scheduler_update_job`            | `{ jobId: string, name?: string, goal?: string, cronExpression?: string }`                                                                     | `void`              |

### 6.1.9 Memory & Embeddings Commands

| Command                | Request Shape                                              | Response Shape                                               |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `memory_store`         | `{ content: string, memoryType: string, tags?: string[] }` | `{ memoryId: string }`                                       |
| `memory_search`        | `{ query: string, limit?: number, memoryType?: string }`   | `{ memories: Memory[] }`                                     |
| `memory_list`          | `{ memoryType?: string, limit?: number, offset?: number }` | `{ memories: Memory[], total: number }`                      |
| `memory_delete`        | `{ memoryId: string }`                                     | `void`                                                       |
| `memory_update`        | `{ memoryId: string, content: string }`                    | `void`                                                       |
| `memory_clear`         | `{ memoryType?: string }`                                  | `{ deleted: number }`                                        |
| `embeddings_generate`  | `{ text: string }`                                         | `{ embedding: number[], model: string, dimensions: number }` |
| `embeddings_search`    | `{ query: string, limit?: number }`                        | `{ results: { text: string, score: number }[] }`             |
| `project_memory_store` | `{ key: string, value: string, projectId: string }`        | `void`                                                       |
| `project_memory_get`   | `{ key: string, projectId: string }`                       | `{ value?: string }`                                         |

### 6.1.10 File Operations Commands

| Command               | Request Shape                                                 | Response Shape                             |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `file_read`           | `{ path: string }`                                            | `{ content: string, size: number }`        |
| `file_write`          | `{ path: string, content: string }`                           | `void`                                     |
| `file_create`         | `{ path: string, content?: string }`                          | `void`                                     |
| `file_delete`         | `{ path: string }`                                            | `void`                                     |
| `file_move`           | `{ source: string, destination: string }`                     | `void`                                     |
| `file_copy`           | `{ source: string, destination: string }`                     | `void`                                     |
| `file_list_directory` | `{ path: string, recursive?: boolean }`                       | `{ entries: FileEntry[] }`                 |
| `file_search`         | `{ directory: string, pattern: string, maxResults?: number }` | `{ results: string[] }`                    |
| `file_watch`          | `{ paths: string[] }`                                         | `void` (events via `file:changed` channel) |

### 6.1.11 Terminal Commands

| Command                    | Request Shape                                         | Response Shape                                                             |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `terminal_create_session`  | `{ cwd?: string, shell?: string }`                    | `{ sessionId: string }`                                                    |
| `terminal_write`           | `{ sessionId: string, data: string }`                 | `void`                                                                     |
| `terminal_resize`          | `{ sessionId: string, rows: number, cols: number }`   | `void`                                                                     |
| `terminal_close_session`   | `{ sessionId: string }`                               | `void`                                                                     |
| `terminal_list_sessions`   | `{}`                                                  | `{ sessions: TerminalSession[] }`                                          |
| `terminal_get_output`      | `{ sessionId: string, since?: number }`               | `{ output: string }`                                                       |
| `terminal_execute_command` | `{ command: string, cwd?: string, timeout?: number }` | `{ stdout: string, stderr: string, exitCode: number, durationMs: number }` |

### 6.1.12 Git Commands

| Command             | Request Shape                                         | Response Shape                                                  |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| `git_status`        | `{ path: string }`                                    | `{ modified: string[], staged: string[], untracked: string[] }` |
| `git_diff`          | `{ path: string, file?: string }`                     | `{ diff: string }`                                              |
| `git_commit`        | `{ path: string, message: string, files?: string[] }` | `{ commitHash: string }`                                        |
| `git_log`           | `{ path: string, limit?: number }`                    | `{ commits: GitCommit[] }`                                      |
| `git_branches`      | `{ path: string }`                                    | `{ branches: GitBranch[], current: string }`                    |
| `git_checkout`      | `{ path: string, branch: string }`                    | `void`                                                          |
| `git_create_branch` | `{ path: string, name: string }`                      | `void`                                                          |
| `git_stash`         | `{ path: string }`                                    | `void`                                                          |
| `git_push`          | `{ path: string, remote?: string, branch?: string }`  | `void`                                                          |
| `git_pull`          | `{ path: string, remote?: string, branch?: string }`  | `void`                                                          |

### 6.1.13 Document Processing Commands

| Command                 | Request Shape                                            | Response Shape                                                          |
| ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `document_read_pdf`     | `{ path: string }`                                       | `{ text: string, pageCount: number, metadata: Record<string, string> }` |
| `document_read_docx`    | `{ path: string }`                                       | `{ text: string, metadata: Record<string, string> }`                    |
| `document_read_xlsx`    | `{ path: string, sheet?: string }`                       | `{ rows: unknown[][], headers: string[], sheetNames: string[] }`        |
| `document_write_pdf`    | `{ path: string, content: string }`                      | `void`                                                                  |
| `document_write_docx`   | `{ path: string, content: string }`                      | `void`                                                                  |
| `document_write_xlsx`   | `{ path: string, headers: string[], rows: unknown[][] }` | `void`                                                                  |
| `document_extract_text` | `{ path: string }`                                       | `{ text: string, format: string }`                                      |

### 6.1.14 Email Commands

| Command                | Request Shape                                                                                                 | Response Shape                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `email_list_accounts`  | `{}`                                                                                                          | `EmailAccount[]`               |
| `email_add_account`    | `{ email: string, imapHost: string, imapPort: number, smtpHost: string, smtpPort: number, password: string }` | `{ accountId: string }`        |
| `email_fetch_inbox`    | `{ accountId: string, limit?: number }`                                                                       | `{ messages: EmailMessage[] }` |
| `email_read_message`   | `{ accountId: string, messageId: string }`                                                                    | `{ message: EmailMessage }`    |
| `email_send`           | `{ accountId: string, to: string[], subject: string, body: string, attachments?: string[] }`                  | `{ messageId: string }`        |
| `gmail_oauth_start`    | `{}`                                                                                                          | `{ authUrl: string }`          |
| `gmail_oauth_callback` | `{ code: string }`                                                                                            | `{ accountId: string }`        |

### 6.1.15 Database Commands

| Command                   | Request Shape                                                 | Response Shape                                                                   |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `database_connect`        | `{ connectionString: string, dbType: string }`                | `{ connectionId: string }`                                                       |
| `database_disconnect`     | `{ connectionId: string }`                                    | `void`                                                                           |
| `database_query`          | `{ connectionId: string, query: string, params?: unknown[] }` | `{ rows: unknown[][], columns: string[], rowCount: number, durationMs: number }` |
| `database_list_tables`    | `{ connectionId: string }`                                    | `{ tables: string[] }`                                                           |
| `database_describe_table` | `{ connectionId: string, table: string }`                     | `{ columns: ColumnInfo[] }`                                                      |

### 6.1.16 Canvas & Artifact Commands

| Command                  | Request Shape                                                               | Response Shape                            |
| ------------------------ | --------------------------------------------------------------------------- | ----------------------------------------- |
| `canvas_create`          | `{ title?: string }`                                                        | `{ canvasId: string }`                    |
| `canvas_add_item`        | `{ canvasId: string, type: string, content: string, x: number, y: number }` | `{ itemId: string }`                      |
| `canvas_move_item`       | `{ canvasId: string, itemId: string, x: number, y: number }`                | `void`                                    |
| `canvas_resize_item`     | `{ canvasId: string, itemId: string, width: number, height: number }`       | `void`                                    |
| `canvas_delete_item`     | `{ canvasId: string, itemId: string }`                                      | `void`                                    |
| `canvas_update_item`     | `{ canvasId: string, itemId: string, content: string }`                     | `void`                                    |
| `canvas_get`             | `{ canvasId: string }`                                                      | `{ canvas: Canvas }`                      |
| `canvas_list`            | `{}`                                                                        | `{ canvases: CanvasSummary[] }`           |
| `artifact_create`        | `{ type: string, content: string, title?: string, language?: string }`      | `{ artifactId: string, version: number }` |
| `artifact_update`        | `{ artifactId: string, content: string }`                                   | `{ version: number }`                     |
| `artifact_get`           | `{ artifactId: string, version?: number }`                                  | `{ artifact: Artifact }`                  |
| `artifact_list_versions` | `{ artifactId: string }`                                                    | `{ versions: ArtifactVersion[] }`         |

### 6.1.17 Research Commands

| Command                  | Request Shape                                                                                              | Response Shape                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `research_start`         | `{ question: string, depth: string, model?: string, sourceDomains?: string[], excludeDomains?: string[] }` | `{ sessionId: string }`                                                           |
| `research_get_status`    | `{ sessionId: string }`                                                                                    | `{ status: string, sourcesFound: number, sourcesRead: number, progress: number }` |
| `research_get_sources`   | `{ sessionId: string }`                                                                                    | `{ sources: ResearchSource[] }`                                                   |
| `research_get_report`    | `{ sessionId: string }`                                                                                    | `{ report: ResearchReport }`                                                      |
| `research_cancel`        | `{ sessionId: string }`                                                                                    | `void`                                                                            |
| `research_list_sessions` | `{ limit?: number }`                                                                                       | `{ sessions: ResearchSession[] }`                                                 |

### 6.1.18 Swarm Commands

| Command            | Request Shape                                          | Response Shape                                               |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------ |
| `swarm_start`      | `{ goal: string, maxAgents?: number, model?: string }` | `{ swarmId: string }`                                        |
| `swarm_get_status` | `{ swarmId: string }`                                  | `{ status: string, agents: SwarmAgent[], progress: number }` |
| `swarm_cancel`     | `{ swarmId: string }`                                  | `void`                                                       |
| `swarm_list`       | `{}`                                                   | `{ swarms: SwarmSummary[] }`                                 |

### 6.1.19 Window & Display Commands

| Command                    | Request Shape          | Response Shape                                                                |
| -------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `window_set_always_on_top` | `{ enabled: boolean }` | `void`                                                                        |
| `window_set_floating_mode` | `{ enabled: boolean }` | `void`                                                                        |
| `window_toggle_sidebar`    | `{}`                   | `{ collapsed: boolean }`                                                      |
| `window_get_state`         | `{}`                   | `{ x: number, y: number, width: number, height: number, maximized: boolean }` |
| `tray_set_unread_badge`    | `{ count: number }`    | `void`                                                                        |
| `check_for_update`         | `{}`                   | `{ available: boolean, version?: string, releaseNotes?: string }`             |
| `install_update`           | `{}`                   | `void` (app restarts)                                                         |

### 6.1.20 Governance & Audit Commands

| Command                            | Request Shape                                                                                   | Response Shape                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------- |
| `governance_get_audit_log`         | `{ limit?: number, offset?: number, eventType?: string, startDate?: string, endDate?: string }` | `{ entries: AuditLogEntry[], total: number }`    |
| `governance_get_pending_approvals` | `{}`                                                                                            | `{ approvals: ApprovalRequest[] }`               |
| `governance_export_audit_log`      | `{ format: 'csv'                                                                                | 'json', startDate?: string, endDate?: string }`  | `{ content: string }` |
| `governance_get_tool_history`      | `{ limit?: number, offset?: number, toolName?: string }`                                        | `{ executions: ToolExecution[], total: number }` |
| `governance_get_safety_policies`   | `{}`                                                                                            | `{ policies: SafetyPolicy[] }`                   |
| `governance_update_safety_policy`  | `{ policyId: string, enabled: boolean }`                                                        | `void`                                           |

### 6.1.21 Custom Instructions Commands

| Command                          | Request Shape           | Response Shape                                 |
| -------------------------------- | ----------------------- | ---------------------------------------------- |
| `custom_instructions_discover`   | `{ directory: string }` | `{ files: InstructionFile[] }`                 |
| `custom_instructions_read`       | `{ path: string }`      | `{ content: string, format: string }`          |
| `custom_instructions_merge`      | `{ paths: string[] }`   | `{ mergedContext: string, sources: string[] }` |
| `custom_instructions_set_active` | `{ paths: string[] }`   | `void`                                         |

### 6.1.22 Ollama-Specific Commands

| Command              | Request Shape      | Response Shape                                                                                     |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `ollama_detect`      | `{}`               | `{ detected: boolean, version?: string, models?: OllamaModel[] }`                                  |
| `ollama_list_models` | `{}`               | `{ models: OllamaModel[] }`                                                                        |
| `ollama_pull_model`  | `{ name: string }` | Streams progress via events                                                                        |
| `ollama_model_info`  | `{ name: string }` | `{ name: string, size: number, parameters: number, quantization: string, supportsTools: boolean }` |

### 6.1.23 Workspace & Project Commands

| Command               | Request Shape                                          | Response Shape                       |
| --------------------- | ------------------------------------------------------ | ------------------------------------ |
| `workspace_index`     | `{ directory: string }`                                | `{ indexed: number, total: number }` |
| `workspace_search`    | `{ query: string, directory: string, limit?: number }` | `{ results: SearchResult[] }`        |
| `project_create`      | `{ name: string, directory: string }`                  | `{ projectId: string }`              |
| `project_list`        | `{}`                                                   | `{ projects: Project[] }`            |
| `project_set_active`  | `{ projectId: string }`                                | `void`                               |
| `project_get_context` | `{ projectId: string }`                                | `{ context: ProjectContext }`        |

### 6.1.24 Skills Commands

| Command                 | Request Shape                        | Response Shape                                 |
| ----------------------- | ------------------------------------ | ---------------------------------------------- |
| `skills_list`           | `{ category?: string }`              | `{ skills: Skill[] }`                          |
| `skills_get`            | `{ skillId: string }`                | `{ skill: Skill }`                             |
| `skills_install`        | `{ skillId: string }`                | `void`                                         |
| `skills_uninstall`      | `{ skillId: string }`                | `void`                                         |
| `skills_detect_trigger` | `{ message: string }`                | `{ matchedSkill?: Skill, confidence: number }` |
| `skills_execute`        | `{ skillId: string, input: string }` | `{ result: string }`                           |

## 6.2 Tauri Event Channels (Rust to Frontend)

| Event Name                 | Payload Shape                                                                                                | Listener Location             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `tool:event`               | `ToolEvent { type, toolName, displayName, displayArgs, conversationId, durationMs, resultPreview, success }` | `chat/toolStore.ts`           |
| `agentic:loop-started`     | `{ conversationId: string, model: string }`                                                                  | `useAgentLoopEvents.ts`       |
| `agentic:loop-status`      | `{ conversationId: string, step: number, totalSteps: number, description: string }`                          | `useAgentLoopEvents.ts`       |
| `agentic:loop-ended`       | `{ conversationId: string, success: boolean, error?: string }`                                               | `useAgentLoopEvents.ts`       |
| `agentic:message-consumed` | `{ conversationId: string, messageId: string }`                                                              | `useAgentLoopEvents.ts`       |
| `chat:stream-chunk`        | `{ conversationId: string, content: string, done: boolean }`                                                 | `useTauriStreamListeners.ts`  |
| `chat:stream-error`        | `{ conversationId: string, error: string }`                                                                  | `useTauriStreamListeners.ts`  |
| `notification:new`         | `{ title: string, body: string, type: string }`                                                              | `useNotificationEvents.ts`    |
| `file:changed`             | `{ path: string, event: string }`                                                                            | `useFileTerminalEvents.ts`    |
| `extension:event`          | `{ type: string, data: unknown }`                                                                            | `useExtensionBridgeEvents.ts` |

## 6.3 Auth & Session Management

Authentication for cloud features (billing, sync, team) uses Supabase Auth:

1. User signs in via Supabase on the web app or in-app webview
2. Session JWT stored in `SessionState` (Rust-managed, not localStorage)
3. JWT refreshed automatically before expiry via Supabase client
4. API Gateway calls use `Authorization: Bearer <jwt>` header
5. Local-only features (chat, agents, tools) work without authentication

**Offline behavior**:

- All core features work offline with local models
- Conversations stored locally in SQLCipher database
- No cloud sync until connectivity restored
- Billing/subscription status cached locally with 24-hour grace period
- Queue offline operations in `offline_operations_queue` SQLite table

## 6.4 Real-time Sync

When online and authenticated:

- Conversations sync to Supabase via API Gateway `/api/sync/batch`
- Settings sync bidirectionally with last-write-wins
- Device presence via WebSocket (`ws://localhost:8787`)
- Mobile companion real-time via Signaling Server WebRTC

### 6.4.1 Sync Architecture

```
Desktop App (SQLCipher)
  ↕ Tauri IPC
Rust Sync Engine (tokio)
  ↕ HTTPS
API Gateway (Express)
  ↕ Supabase Client
Supabase (PostgreSQL + Realtime)
  ↕ WebSocket
Other Devices (Mobile App, Web App)
```

### 6.4.2 Sync Conflict Resolution

| Data Type     | Resolution Strategy                | Rationale                               |
| ------------- | ---------------------------------- | --------------------------------------- |
| Settings      | Last-write-wins (by timestamp)     | Settings are singular; no merge needed  |
| Conversations | Server-authoritative merge         | Server maintains canonical state        |
| Messages      | Append-only (no conflict possible) | Messages are immutable once created     |
| API keys      | Device-local only (never synced)   | Security: keys stay on device           |
| Memories      | Server merge with dedup            | Memories from multiple devices combined |
| Schedules     | Last-write-wins (by timestamp)     | Schedules are singular per job          |

### 6.4.3 Offline Queue

When offline, operations are queued in `offline_operations_queue` SQLite table:

| Column           | Type                | Purpose                                |
| ---------------- | ------------------- | -------------------------------------- |
| `id`             | INTEGER PRIMARY KEY | Auto-increment ID                      |
| `operation_type` | TEXT                | create, update, delete                 |
| `entity_type`    | TEXT                | conversation, message, memory, setting |
| `entity_id`      | TEXT                | UUID of affected entity                |
| `payload`        | TEXT (JSON)         | Serialized operation data              |
| `created_at`     | TEXT                | ISO 8601 timestamp                     |
| `retry_count`    | INTEGER             | Number of sync attempts                |
| `last_error`     | TEXT                | Last sync error message                |

When connectivity is restored:

1. Queue is processed in FIFO order
2. Each operation is sent to API Gateway
3. Successful operations are removed from queue
4. Failed operations increment `retry_count`
5. Operations with `retry_count > 10` are moved to dead-letter queue

### 6.4.4 Mobile Device Pairing

Mobile companion app pairing flow:

1. **Desktop**: User clicks "Link Mobile Device" in Account Settings
2. **Desktop**: Generates 6-character alphanumeric pairing code + QR code
3. **Desktop**: Sends pairing intent to Supabase with device metadata
4. **Mobile**: User opens mobile app → "Link Desktop" → scans QR or enters code
5. **Mobile**: Sends pairing confirmation to Supabase
6. **Desktop**: Receives pairing confirmation → stores device info in `deviceLinkStore`
7. **Both**: Establish WebRTC signaling channel for real-time communication

Paired devices can:

- View live agent status
- Approve/deny tool execution requests
- Send follow-up messages to running agents
- View conversation history (read-only from mobile)
- Receive push notifications for agent completions

## 6.5 LLM Provider Request Flow

Detailed request/response flow for LLM API calls:

```
Frontend: invoke('chat_send_message', { conversationId, content, model, agentMode })
  ↓
Rust: chat_send_message handler
  ↓
Rust: LlmRouter.route(request)
  ├── normalize_model_id() → canonical model ID
  ├── provider_adapter.build_request() → provider-specific HTTP payload
  ├── check circuit breaker state
  ├── if circuit open → try next provider
  └── select HTTP client (streaming: 300s timeout / standard: 120s)
  ↓
Rust: reqwest POST to provider API
  ↓
Rust: SSE stream parser (sse_parser.rs)
  ├── parse chunk → extract token
  ├── emit 'chat:stream-chunk' event to frontend
  ├── if tool_use → emit 'tool:event' Started
  ├── if tool_result → emit 'tool:event' Completed
  └── on stream end → emit final cost/token summary
  ↓
Frontend: useTauriStreamListeners receives chunks
  ├── append to message content
  ├── update token counter
  └── trigger re-render
  ↓
Rust: on stream complete
  ├── calculate cost (per-token pricing from provider_adapter)
  ├── store message in SQLCipher
  ├── update conversation metadata
  └── if agentic → check for tool_use → execute tools → loop
```

### 6.5.1 Provider-Specific Request Formats

| Provider        | Auth Header                   | Base URL                                                                                | Request Body Differences                                     |
| --------------- | ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Anthropic       | `x-api-key: <key>`            | `https://api.anthropic.com/v1/messages`                                                 | `anthropic_version`, `thinking` block, `max_tokens` required |
| OpenAI          | `Authorization: Bearer <key>` | `https://api.openai.com/v1/chat/completions`                                            | `messages` array with roles, `stream_options` for usage      |
| Google Gemini   | `x-goog-api-key: <key>`       | `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` | `contents` array, `generationConfig`                         |
| Mistral         | `Authorization: Bearer <key>` | `https://api.mistral.ai/v1/chat/completions`                                            | OpenAI-compatible format                                     |
| Groq            | `Authorization: Bearer <key>` | `https://api.groq.com/openai/v1/chat/completions`                                       | OpenAI-compatible format                                     |
| DeepSeek        | `Authorization: Bearer <key>` | `https://api.deepseek.com/v1/chat/completions`                                          | OpenAI-compatible format                                     |
| OpenRouter      | `Authorization: Bearer <key>` | `https://openrouter.ai/api/v1/chat/completions`                                         | OpenAI-compatible + `HTTP-Referer` header                    |
| Together.ai     | `Authorization: Bearer <key>` | `https://api.together.xyz/v1/chat/completions`                                          | OpenAI-compatible format                                     |
| Fireworks.ai    | `Authorization: Bearer <key>` | `https://api.fireworks.ai/inference/v1/chat/completions`                                | OpenAI-compatible format                                     |
| Ollama (local)  | None                          | `http://localhost:11434/api/chat`                                                       | Ollama-specific format with `stream: true`                   |
| Custom endpoint | Configurable                  | Configurable                                                                            | OpenAI-compatible or Anthropic-compatible (auto-detect)      |

### 6.5.2 SSE Stream Parsing

The `sse_parser.rs` module handles provider-specific SSE formats:

| Provider          | SSE Field     | Token Location                        | Done Signal            |
| ----------------- | ------------- | ------------------------------------- | ---------------------- |
| Anthropic         | `data:`       | `delta.text` or `delta.thinking`      | `event: message_stop`  |
| OpenAI            | `data:`       | `choices[0].delta.content`            | `data: [DONE]`         |
| Google Gemini     | JSON stream   | `candidates[0].content.parts[0].text` | `finishReason: "STOP"` |
| Ollama            | JSON-per-line | `message.content`                     | `done: true`           |
| OpenAI-compatible | `data:`       | `choices[0].delta.content`            | `data: [DONE]`         |

### 6.5.3 Token Counting and Cost Calculation

Pre-flight token counting uses `tiktoken-rs`:

| Stage        | Implementation                       | Purpose                                                         |
| ------------ | ------------------------------------ | --------------------------------------------------------------- |
| Pre-send     | Count input tokens via `tiktoken-rs` | Validate fits within model context window                       |
| Pre-send     | Estimate cost from input tokens      | Show estimated cost in TokenCounter component                   |
| Post-receive | Count output tokens from SSE stream  | Track actual output tokens                                      |
| Post-receive | Calculate actual cost                | `(input_tokens * input_price) + (output_tokens * output_price)` |
| Post-receive | Update cost stores                   | `costStore`, `usageTrackingStore`, `analyticsMetricsStore`      |

Cost data stored per-message:

- `inputTokens`: exact count
- `outputTokens`: exact count
- `cacheReadTokens`: tokens read from prompt cache (Anthropic)
- `cacheCreationTokens`: tokens written to prompt cache
- `cost`: calculated in USD

---

# 7. Platform-Specific Capabilities

## 7.1 Universal Binary (Apple Silicon + Intel)

The macOS release is a universal binary combining `aarch64-apple-darwin` and `x86_64-apple-darwin` slices. This is produced by:

```bash
cargo build --release --target universal-apple-darwin
```

The resulting binary runs natively on both Apple Silicon (M1/M2/M3/M4) and Intel Macs without Rosetta translation. Binary size is approximately 2x a single-architecture build but ensures zero-friction installation for all Mac users.

## 7.2 DMG Distribution and Notarization

**DMG contents**: Application bundle + symlink to /Applications

**Code signing**: Apple Developer ID Application certificate

- Team ID: registered AGI Automation LLC developer account
- Entitlements: `entitlements.plist` specifying:
  - `com.apple.security.automation.apple-events` (AppleScript, accessibility)
  - `com.apple.security.device.camera` (optional, for video input)
  - `com.apple.security.device.microphone` (voice input)
  - `com.apple.security.network.client` (outbound HTTPS for LLM APIs)
  - `com.apple.security.files.user-selected.read-write` (file access)

**Notarization**: After signing, the DMG is submitted to Apple's notarization service via `xcrun notarytool submit`. The stapled notarization ticket is embedded in the DMG so that Gatekeeper accepts the app on first launch without requiring an internet check.

## 7.3 AXUIElement Accessibility Tree

macOS provides the AXUIElement API for inspecting and interacting with any application's UI element tree. AGI Workforce uses this as the primary method for computer use automation on macOS.

**Initialization**: `AXIsProcessTrusted()` is checked at startup. If the Accessibility permission is not granted, AutomationService initialization is deferred to avoid triggering the system permission dialog on every launch. The user is prompted to grant permission when they first attempt to use computer use features.

**Capabilities**:

- Enumerate all windows and their UI element hierarchies
- Read element attributes (title, value, role, position, size)
- Perform actions on elements (click, set value, press)
- Monitor element changes for screen watching

**Fallback**: When AXUIElement inspection fails (e.g., non-standard UI frameworks), the system falls back to vision-based automation using screenshot + AI vision model analysis.

## 7.4 macOS Keychain

The `keyring` crate provides macOS Keychain integration for credential storage. This serves as a fallback and complement to the primary SQLCipher-based SecretManager:

- Email account credentials stored in Keychain for system-level persistence
- Machine-specific encryption key derivation salt cached in Keychain
- Accessible via `keyring::Entry::new("com.agiworkforce", "credential-name")`

## 7.5 System Notifications

macOS notifications use `tauri-plugin-notification` which maps to `NSUserNotificationCenter` (macOS 13+) or `UNUserNotificationCenter` (macOS 14+):

- Agent completion notifications
- Background task status updates
- Scheduled task execution results
- Update availability alerts
- Approval request notifications (when app is not focused)

## 7.6 Menu Bar Icon and Tray Menu

The system tray uses Tauri's `tray-icon` feature:

- **Icon**: 16x16 PNG template image (supports macOS dark/light mode automatically)
- **Badge**: Unread notification count via `tray_set_unread_badge` command
- **Left-click**: Toggle main window visibility
- **Right-click**: Open context menu (see Section 4.11)

## 7.7 Global Hotkey System

Global hotkeys use `tauri-plugin-global-shortcut` backed by `CGEventTap`:

| Hotkey         | Action                       | Accessibility Required |
| -------------- | ---------------------------- | ---------------------- |
| `Option+Space` | Quick Query overlay          | Yes                    |
| `Cmd+Shift+V`  | Voice input (hold-to-record) | Yes                    |
| `Cmd+Shift+S`  | Screen capture               | No                     |

**Accessibility permission requirement**: `CGEventTap` requires the Accessibility permission (`kTCCServiceAccessibility`). Global shortcuts are deferred until the user grants this permission. Without it, these hotkeys only work when the app is focused.

**Permission request flow**:

1. User attempts to use a feature requiring Accessibility
2. App detects `AXIsProcessTrusted() == false`
3. Dialog shown: "AGI Workforce needs Accessibility permission to use global shortcuts and computer use features."
4. "Open System Settings" button → opens `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
5. User grants permission in System Settings
6. App detects permission granted on next check → initializes AutomationService and global shortcuts

## 7.8 Full Disk Access Permission

Some file operations require Full Disk Access (FDA):

- Reading files in `~/Library/` (e.g., Safari bookmarks, Mail data)
- Reading files in other users' directories
- Reading Time Machine backups

**Permission request flow**:

1. File operation fails with permission error
2. App shows dialog: "AGI Workforce needs Full Disk Access to read [path]."
3. "Open System Settings" button → opens FDA preferences
4. User grants permission → operation retried automatically

## 7.9 macOS Keyboard Shortcuts

Full keyboard shortcut map for macOS:

| Category    | Shortcut          | Action                                       |
| ----------- | ----------------- | -------------------------------------------- |
| **Window**  | `Cmd+Q`           | Quit application                             |
|             | `Cmd+W`           | Close window (minimize to tray)              |
|             | `Cmd+M`           | Minimize to dock                             |
|             | `Cmd+H`           | Hide application                             |
|             | `Cmd+Ctrl+F`      | Toggle fullscreen                            |
|             | `Cmd+Shift+F`     | Toggle floating mode                         |
|             | `Cmd+,`           | Open Settings                                |
| **Chat**    | `Cmd+N`           | New conversation                             |
|             | `Cmd+Enter`       | Send message                                 |
|             | `Cmd+Shift+Enter` | Send with agent mode                         |
|             | `Cmd+.`           | Stop generation                              |
|             | `Cmd+/`           | Toggle sidebar                               |
|             | `Cmd+F`           | Search conversations                         |
|             | `Cmd+K`           | Command palette                              |
|             | `Cmd+Up`          | Previous conversation                        |
|             | `Cmd+Down`        | Next conversation                            |
| **Editing** | `Cmd+Z`           | Undo                                         |
|             | `Cmd+Shift+Z`     | Redo                                         |
|             | `Cmd+C`           | Copy                                         |
|             | `Cmd+V`           | Paste                                        |
|             | `Cmd+A`           | Select all                                   |
| **Voice**   | `Cmd+Shift+V`     | Voice input (hold to record)                 |
| **Tools**   | `Cmd+Shift+S`     | Screen capture                               |
|             | `Cmd+Shift+T`     | Open terminal                                |
|             | `Cmd+Shift+R`     | Research mode                                |
|             | `Cmd+Shift+M`     | Change model                                 |
| **Global**  | `Option+Space`    | Quick Query overlay (requires Accessibility) |

## 7.10 macOS `open` Command Fallback

The `Action::Navigate` agent action uses PlaywrightBridge (CDP) as the primary method for opening URLs. When PlaywrightBridge is unavailable, the fallback uses macOS's `open` command:

```rust
std::process::Command::new("open").arg(&url).spawn()
```

This opens the URL in the user's default browser. The `open` command also supports:

- `open -a "Safari" <url>` — open in specific browser
- `open <file>` — open file in default application
- `open -R <file>` — reveal file in Finder

## 7.11 Auto-Updater

The Tauri updater plugin handles auto-updates on macOS:

1. On startup (and every 4 hours), check `GET /api/releases/check?current_version=1.1.5&platform=darwin`
2. If update available, download DMG in background
3. Verify Ed25519 signature on downloaded payload
4. Show notification: "Update available: v1.2.0. [Install Now] [Later]"
5. If user clicks "Install Now": extract, replace binary, restart app
6. If user clicks "Later": remind on next launch

**Update payload format**:

```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-03-15T00:00:00Z",
  "platforms": {
    "darwin-universal": {
      "url": "https://github.com/agiworkforce/desktop/releases/download/v1.2.0/agiworkforce-desktop_1.2.0_universal.app.tar.gz",
      "signature": "<Ed25519 signature>"
    }
  }
}
```

**Rollback**: If the new version fails to launch (crash within 30 seconds of startup), the updater automatically rolls back to the previous version and reports the failure via telemetry (if enabled).

## 7.12 Drag and Drop

macOS native drag and drop is fully supported:

| Drop Target               | Accepted Types      | Action                                          |
| ------------------------- | ------------------- | ----------------------------------------------- |
| Chat composer             | Files (any), images | Attach to current message                       |
| Canvas workspace          | Files, images, text | Create artifact node at drop position           |
| Sidebar conversation list | Files               | Create new conversation with file as attachment |
| Terminal panel            | Text                | Paste text into terminal                        |
| File browser sidecar      | Files               | Copy/move to target directory                   |

**Drag source**:

- Code artifacts can be dragged from chat to canvas
- Files from file browser sidecar can be dragged to Finder
- Images from inline results can be dragged to other applications

## 7.13 macOS Services Menu

AGI Workforce registers with macOS's Services menu system:

| Service Name                    | Input         | Action                                            |
| ------------------------------- | ------------- | ------------------------------------------------- |
| "Send to AGI Workforce"         | Selected text | Opens Quick Query with selected text as input     |
| "Ask AGI Workforce"             | Selected text | Opens Quick Query with "Explain: [selected text]" |
| "Transcribe with AGI Workforce" | Audio file    | Transcribes audio file using STT provider         |

Users access these via the application menu bar: `[Application Name] > Services` or right-click context menu in any macOS application.

## 7.14 Spotlight Indexing (Future)

Planned for v2.0: Index conversation titles and summaries for macOS Spotlight search.

| Indexed Content     | Spotlight Display                    |
| ------------------- | ------------------------------------ |
| Conversation titles | Show as "AGI Workforce Conversation" |
| Research reports    | Show as "AGI Workforce Research"     |
| Skill names         | Show as "AGI Workforce Skill"        |

Users would type in Spotlight and see AGI Workforce results, clicking to open the relevant conversation/report.

## 7.15 macOS Menu Bar

The application provides a standard macOS menu bar:

| Menu              | Items                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **AGI Workforce** | About AGI Workforce, Preferences (Cmd+,), Services >, Hide (Cmd+H), Hide Others (Cmd+Option+H), Show All, Quit (Cmd+Q)                        |
| **File**          | New Conversation (Cmd+N), Open Project Folder, Export Conversation, Close Window (Cmd+W)                                                      |
| **Edit**          | Undo (Cmd+Z), Redo (Cmd+Shift+Z), Cut (Cmd+X), Copy (Cmd+C), Paste (Cmd+V), Select All (Cmd+A), Find (Cmd+F)                                  |
| **View**          | Toggle Sidebar (Cmd+/), Toggle Fullscreen (Cmd+Ctrl+F), Toggle Floating (Cmd+Shift+F), Zoom In (Cmd+=), Zoom Out (Cmd+-), Actual Size (Cmd+0) |
| **Chat**          | Send Message (Cmd+Enter), Stop Generation (Cmd+.), New Conversation (Cmd+N), Agent Mode (Cmd+Shift+A), Research Mode (Cmd+Shift+R)            |
| **Tools**         | Command Palette (Cmd+K), Screen Capture (Cmd+Shift+S), Terminal (Cmd+Shift+T), Voice Input (Cmd+Shift+V)                                      |
| **Window**        | Minimize (Cmd+M), Zoom, Bring All to Front                                                                                                    |
| **Help**          | AGI Workforce Help, Documentation, Report Issue, Check for Updates                                                                            |

## 7.16 Handoff and Continuity (Future)

Planned for v2.0: Support for Apple's Handoff protocol to continue conversations between Mac and iPhone/iPad:

- Start a conversation on macOS → continue on iPhone via AGI Workforce mobile app
- Activity type: `com.agiworkforce.conversation`
- Requires same Apple ID on both devices
- Conversation state synced via Supabase, Handoff provides the context switch signal

---

# 8. Build, Deploy & Distribution

## 8.1 Build Pipeline

### 8.1.1 Development Build

```bash
# Install dependencies
pnpm install

# Start development (hot-reload frontend + Rust backend)
cd apps/desktop && pnpm dev
# Equivalent: cd apps/desktop && pnpm tauri dev

# Frontend-only development (no Rust rebuild)
cd apps/desktop && pnpm dev:vite
```

### 8.1.2 Production Build

```bash
# Full production build
cd apps/desktop && pnpm build
# Executes: vite build && tauri build

# Detailed steps:
# 1. TypeScript compilation check (tsc --noEmit)
# 2. Vite production bundle (minified, tree-shaken)
# 3. Rust compilation (release profile: codegen-units=1, lto=true, opt-level="z", strip=true)
# 4. Tauri packaging (DMG for macOS)
# 5. Code signing
# 6. Notarization
```

### 8.1.3 Release Profile (Cargo.toml)

```toml
[profile.release]
codegen-units = 1     # Maximum optimization: single codegen unit
lto = true            # Link-time optimization
opt-level = "z"       # Optimize for binary size
strip = true          # Strip debug symbols
panic = "abort"       # No unwinding overhead
```

## 8.2 Code Signing and Notarization

### 8.2.1 Signing

```bash
# Environment variables required
APPLE_CERTIFICATE=<base64-encoded .p12>
APPLE_CERTIFICATE_PASSWORD=<password>
APPLE_SIGNING_IDENTITY="Developer ID Application: AGI Automation LLC (XXXXXXXXXX)"
```

Tauri's built-in signing handles this automatically during `tauri build`.

### 8.2.2 Notarization

```bash
# Environment variables required
APPLE_ID=<apple-developer-email>
APPLE_PASSWORD=<app-specific-password>
APPLE_TEAM_ID=<team-id>

# Automatic via Tauri:
# 1. tauri build produces signed DMG
# 2. xcrun notarytool submit <dmg> --apple-id $APPLE_ID --password $APPLE_PASSWORD --team-id $APPLE_TEAM_ID --wait
# 3. xcrun stapler staple <dmg>
```

## 8.3 CI/CD Workflow

**File**: `.github/workflows/release-desktop.yml`

**Trigger**: Git tag matching `v*`

**macOS build job**:

1. Checkout code
2. Setup Rust toolchain (1.90.0) + universal target
3. Setup Node.js (22.x) + pnpm
4. `pnpm install`
5. `cargo clippy -- -D warnings`
6. `cargo test`
7. `pnpm typecheck`
8. `pnpm test`
9. `pnpm build` (vite build + tauri build targeting `universal-apple-darwin`)
10. Code sign with Developer ID
11. Notarize with Apple
12. Upload DMG to GitHub Release
13. Update auto-updater endpoint JSON

## 8.4 Distribution Channels

| Channel          | URL                                        | Update Policy                      |
| ---------------- | ------------------------------------------ | ---------------------------------- |
| GitHub Releases  | `github.com/agiworkforce/desktop/releases` | Primary distribution               |
| Website download | `agiworkforce.com/download`                | Redirects to latest GitHub Release |
| Auto-updater     | `api.agiworkforce.com/api/releases/check`  | Automatic check every 4 hours      |

## 8.5 Release Process

### 8.5.1 Version Numbering

Semantic versioning: `MAJOR.MINOR.PATCH`

| Component | When Incremented                                | Example       |
| --------- | ----------------------------------------------- | ------------- |
| MAJOR     | Breaking changes to data format or API contract | 1.x.x → 2.0.0 |
| MINOR     | New features, non-breaking                      | 1.1.x → 1.2.0 |
| PATCH     | Bug fixes, performance improvements             | 1.1.5 → 1.1.6 |

Version is maintained in sync across:

- `apps/desktop/package.json` (`version` field)
- `apps/desktop/src-tauri/Cargo.toml` (`[package] version`)
- `apps/desktop/src-tauri/tauri.conf.json` (`version` field)

### 8.5.2 Release Checklist

Pre-release checklist executed before every release:

| Step                    | Command                                     | Pass Criteria                   |
| ----------------------- | ------------------------------------------- | ------------------------------- |
| 1. Rust lint            | `cargo clippy -- -D warnings`               | 0 warnings                      |
| 2. Rust test            | `cargo test`                                | All tests pass (3,267+)         |
| 3. TypeScript typecheck | `cd apps/desktop && pnpm typecheck`         | 0 errors                        |
| 4. TypeScript lint      | `pnpm lint`                                 | 0 errors, 0 warnings            |
| 5. Frontend test        | `cd apps/desktop && pnpm test`              | All tests pass (1,358+)         |
| 6. Build frontend       | `cd apps/desktop && pnpm build:web`         | Build succeeds                  |
| 7. Build Rust + DMG     | `cd apps/desktop && pnpm build`             | DMG produced                    |
| 8. Smoke test           | Manual: launch, chat, settings              | 10-point checklist passes       |
| 9. Version bump         | Update all 3 version files                  | Versions in sync                |
| 10. Tag                 | `git tag v1.1.6`                            | Tag created                     |
| 11. Push                | `git push origin --tags`                    | CI triggered                    |
| 12. CI build            | GitHub Actions release workflow             | DMG signed, notarized, uploaded |
| 13. Verify              | Download and launch DMG from GitHub Release | App launches correctly          |
| 14. Update endpoint     | Update auto-updater JSON                    | Clients receive update          |

### 8.5.3 DMG Contents and Layout

The DMG disk image contains:

```
AGI Workforce.dmg
├── AGI Workforce.app/        # Application bundle
│   ├── Contents/
│   │   ├── Info.plist        # App metadata
│   │   ├── MacOS/
│   │   │   └── agiworkforce-desktop  # Universal binary
│   │   ├── Resources/
│   │   │   ├── icon.icns     # Application icon
│   │   │   └── ...           # Frontend assets (HTML, JS, CSS)
│   │   ├── Frameworks/       # Embedded frameworks
│   │   ├── _CodeSignature/   # Code signature
│   │   └── embedded.provisionprofile
│   └── ...
├── Applications (symlink)    # Shortcut to /Applications
└── .background/
    └── dmg-background.png    # DMG window background image
```

DMG window layout:

- Background: branded gradient with install instruction arrow
- AGI Workforce.app icon on left
- Applications folder alias on right
- Arrow pointing from app to Applications suggesting drag-to-install
- Window size: 600x400 pixels

### 8.5.4 Build Environment Requirements

| Requirement           | Version              | Purpose                                      |
| --------------------- | -------------------- | -------------------------------------------- |
| macOS                 | 13.0+ (build host)   | Xcode tools, codesign                        |
| Xcode CLT             | 15.0+                | Build tools, SDK                             |
| Rust toolchain        | 1.90.0               | Rust compiler                                |
| rust-src              | (via rustup)         | Required for `universal-apple-darwin` target |
| Node.js               | 22.x                 | Frontend build                               |
| pnpm                  | 9.15.3+              | Package manager                              |
| Apple Developer ID    | AGI Automation LLC   | Code signing                                 |
| `llvm` (via Homebrew) | Latest               | Required for `bundled-sqlcipher`             |
| `xcrun notarytool`    | Built into Xcode CLT | Notarization                                 |

### 8.5.5 CI/CD Environment Variables

| Variable                             | Purpose                                                  | Secret?             |
| ------------------------------------ | -------------------------------------------------------- | ------------------- |
| `APPLE_CERTIFICATE`                  | Base64-encoded .p12 certificate                          | Yes                 |
| `APPLE_CERTIFICATE_PASSWORD`         | Certificate password                                     | Yes                 |
| `APPLE_SIGNING_IDENTITY`             | "Developer ID Application: AGI Automation LLC (TEAM_ID)" | No                  |
| `APPLE_ID`                           | Apple Developer email                                    | Yes                 |
| `APPLE_PASSWORD`                     | App-specific password for notarization                   | Yes                 |
| `APPLE_TEAM_ID`                      | Apple Developer Team ID                                  | No                  |
| `TAURI_SIGNING_PRIVATE_KEY`          | Ed25519 private key for update signatures                | Yes                 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Ed25519 key password                                     | Yes                 |
| `GITHUB_TOKEN`                       | GitHub API token for release upload                      | Yes (auto-provided) |

## 8.6 Rollback Procedure

If a release causes critical issues:

1. **Hotfix path**: Create patch release (v1.1.7) with fix
2. **Rollback path**: Update auto-updater endpoint to point to previous version
3. **User communication**: Push notification via Supabase to affected users
4. **Emergency**: Revoke notarization ticket (Apple can revoke; extreme measure)

Auto-updater rollback:

- If the new version crashes within 30 seconds of launch, auto-restore previous binary
- Crash detection via `launch_time < 30s + exit_code != 0` check on next launch
- Previous version stored in `~/Library/Caches/com.agiworkforce.desktop/previous/`

---

# 9. Testing Strategy

## 9.1 Unit Tests (TypeScript)

**Framework**: Vitest 4.0
**Location**: `apps/desktop/src/__tests__/` and co-located `*.test.ts` files
**Current count**: 1,358 tests across 82 files (all passing)

**Key test areas**:
| Area | Files | Tests | Coverage Target |
|---|---|---|---|
| Stores (Zustand) | 20 | 400+ | 80% |
| Components (React) | 30 | 500+ | 70% |
| Hooks | 15 | 200+ | 75% |
| Utilities | 10 | 150+ | 90% |
| IPC/invoke wrappers | 7 | 100+ | 85% |

**Test environment**: jsdom, @testing-library/react, msw for API mocking

**Tauri mock**: Custom `tauri-mock` shim replacing `@tauri-apps/api` in test environment:

- `invoke()` mocked with `vi.fn()` — records call arguments
- `listen()` mocked separately — allows simulating Tauri events
- All IPC param names must match exactly (camelCase)

## 9.2 Unit Tests (Rust)

**Framework**: `cargo test` with built-in test harness
**Current count**: 3,267 tests (all passing)
**Benchmarks**: `criterion` (automation_benchmarks, agi_benchmarks)

**Key test areas**:
| Module | Focus |
|---|---|
| `core/llm/` | Provider routing, SSE parsing, cost calculation, token counting |
| `core/agent/` | Plan decomposition, approval logic, checkpoint persistence |
| `core/mcp/` | Transport lifecycle, tool discovery, health monitoring |
| `sys/security/` | ToolGuard validation, SecretManager encryption/decryption, path traversal detection |
| `data/db/` | Migration integrity, schema validation, query correctness |
| `automation/` | Input simulation (platform-specific, skipped in CI) |

## 9.3 End-to-End Tests

**Framework**: Playwright
**Location**: `apps/desktop/e2e/`

**macOS test scenarios**:
| Scenario | Priority | Automated |
|---|---|---|
| App launches and shows chat interface | P0 | Yes |
| New conversation creates and renders | P0 | Yes |
| Message send and streaming response | P0 | Yes |
| Model switching mid-conversation | P0 | Yes |
| Settings panel opens and saves | P1 | Yes |
| API key setup and test connection | P1 | Yes |
| Screen capture and display | P1 | Manual |
| Voice input record and transcribe | P1 | Manual |
| Computer use OPA loop | P2 | Manual |
| MCP server connect and tool list | P1 | Yes |
| Background agent lifecycle | P1 | Yes |
| Auto-update check and install | P2 | Manual |

## 9.4 macOS Test Matrix

| macOS Version  | Architecture  | CI Runner               | Status    |
| -------------- | ------------- | ----------------------- | --------- |
| 13.0 (Ventura) | Intel         | GitHub Actions macos-13 | Automated |
| 14.0 (Sonoma)  | Apple Silicon | GitHub Actions macos-14 | Automated |
| 15.0 (Sequoia) | Apple Silicon | GitHub Actions macos-15 | Automated |
| 13.0 (Ventura) | Apple Silicon | Manual testing          | Ad-hoc    |

## 9.5 Integration Test Scenarios

### 9.5.1 LLM Provider Integration Tests

| Scenario                        | Provider                  | Test Method                         | Assertion                                            |
| ------------------------------- | ------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Single-turn chat with streaming | Anthropic Claude          | Mock SSE endpoint                   | Tokens arrive in order, cost calculated correctly    |
| Single-turn chat with streaming | OpenAI GPT                | Mock SSE endpoint                   | Streaming chunks parsed correctly, TTFT recorded     |
| Single-turn chat with streaming | Google Gemini             | Mock SSE endpoint                   | Gemini-specific SSE format handled                   |
| Provider failover               | Anthropic (down) → OpenAI | Mock 503 → mock 200                 | Circuit breaker opens on Anthropic, routes to OpenAI |
| Context window overflow         | Any provider              | Send > max tokens                   | Graceful error with compaction suggestion, no crash  |
| API key validation              | All providers             | Real API call (rate-limited CI key) | Success/failure correctly detected                   |
| Extended thinking               | Anthropic                 | Mock thinking + response            | Thinking blocks rendered in ReasoningAccordion       |
| Tool use round trip             | Anthropic/OpenAI          | Mock tool_use + tool_result         | Tool timeline populated, result displayed inline     |
| Multimodal (image)              | Anthropic/OpenAI/Google   | Mock with base64 image              | Image sent in correct provider format                |
| Cost calculation accuracy       | All providers             | Compare against known pricing       | Per-token cost within 0.01% of published pricing     |

### 9.5.2 MCP Integration Tests

| Scenario               | Transport | Test Method                  | Assertion                                             |
| ---------------------- | --------- | ---------------------------- | ----------------------------------------------------- |
| Server connect (stdio) | stdio     | Spawn test MCP server        | Server connects, tools discovered                     |
| Server connect (SSE)   | SSE       | Mock SSE endpoint            | Server connects via SSE stream                        |
| Server connect (HTTP)  | HTTP      | Mock HTTP endpoint           | Server connects via streamable HTTP                   |
| Tool execution         | stdio     | Call test tool               | Tool input received, output returned                  |
| Server disconnect      | Any       | Kill server process          | Status updates to 'error', circuit breaker triggers   |
| Health check           | Any       | Mock healthy/unhealthy       | Health status correctly reflected in UI               |
| Circuit breaker        | Any       | Force 3 failures             | State transitions: Closed → Open → HalfOpen after 30s |
| Tool discovery         | Any       | Connect server with 10 tools | All 10 tools appear in registry                       |
| Environment variables  | stdio     | Pass env vars in config      | Server receives environment variables correctly       |
| Reconnection           | Any       | Disconnect + reconnect       | Server reconnects within 5 seconds                    |

### 9.5.3 Agent Lifecycle Tests

| Scenario                               | Test Method                              | Assertion                                                 |
| -------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Goal submission → planning → execution | Integration test with mock LLM           | Agent progresses through all states                       |
| Approval flow (approve)                | Submit goal requiring approval           | Approval modal appears → approve → agent continues        |
| Approval flow (reject)                 | Submit goal requiring approval           | Reject → agent replans without blocked action             |
| Background agent creation              | Prefix message with `&`                  | Agent runs in background, appears in BackgroundTasksPanel |
| Background agent takeover              | Call `background_agent_takeover`         | Agent moves to foreground chat                            |
| Checkpoint and resume                  | Create checkpoint → restart app → resume | State restored from SQLite checkpoint                     |
| Sub-agent spawning                     | Submit complex goal                      | Sub-agents created, results aggregated                    |
| Execution timeout                      | Set 5s timeout on long task              | Agent times out gracefully with partial results           |
| Context compaction                     | Fill context to 80%                      | Auto-compaction triggers, summary generated               |
| Failure recovery                       | Force tool execution failure             | Agent reflects, replans, retries with different approach  |

### 9.5.4 Data Persistence Tests

| Scenario                       | Test Method                              | Assertion                                               |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------- |
| Conversation persist/load      | Create conversation → restart app → load | All messages restored with correct ordering             |
| Settings migration             | Load v9 settings schema                  | Migration to v10 completes, no data loss                |
| Secret encryption roundtrip    | Store → retrieve → compare               | Decrypted value matches original                        |
| SQLCipher integrity            | Corrupt DB → open                        | Error detected, backup restored or graceful degradation |
| Concurrent DB access           | 5 parallel writes                        | All writes succeed, no WAL corruption                   |
| Large conversation (1000 msgs) | Load 1000-message conversation           | Loads in < 2s, scroll performance 60fps                 |

### 9.5.5 UI Component Tests

| Component            | Test Scenario                      | Assertion                                                       |
| -------------------- | ---------------------------------- | --------------------------------------------------------------- |
| ConversationList     | 100 conversations rendered         | Virtualized list renders correctly, scroll works                |
| ChatMessageList      | Message with code, math, mermaid   | All content types render correctly                              |
| ToolTimeline         | 5 tool entries with parallel group | Parallel group rendered with branch indicator                   |
| ApprovalModal        | High-risk approval                 | Red risk badge, "Reject with Reason" visible                    |
| CommandPalette       | Search "settings"                  | Settings action appears in results                              |
| ModelSelector        | 20 models from 5 providers         | Models grouped by provider, favorites at top                    |
| VoiceInputOverlay    | Hold → release                     | Waveform animates, "Listening..." shown, transcription returned |
| SendButton           | Queue mode active                  | Button changes to amber Clock icon                              |
| ToolLabel            | Error status                       | Red X icon, error message truncated with tooltip                |
| BudgetTracker        | Budget 80% consumed                | Yellow warning state shown                                      |
| AgenticLoopStatusBar | Step 3/5                           | "Agent working (step 3/5)" shown with spinner                   |

## 9.6 Smoke Test Suite

Quick validation suite run before every release:

| Step      | Action                       | Expected Result                                    | Duration |
| --------- | ---------------------------- | -------------------------------------------------- | -------- |
| 1         | Launch app                   | Window appears within 3 seconds                    | 3s       |
| 2         | Create new conversation      | Empty chat view displayed, conversation in sidebar | 1s       |
| 3         | Type message and send        | Message appears in chat, streaming response begins | 2s       |
| 4         | Stop generation              | Streaming stops, partial response preserved        | 1s       |
| 5         | Open Settings                | Settings panel renders all tabs                    | 1s       |
| 6         | Switch model                 | Model selector dropdown works, selection persisted | 1s       |
| 7         | Open Command Palette (Cmd+K) | Palette opens with search input focused            | 1s       |
| 8         | Close and reopen app         | Last conversation restored, settings preserved     | 3s       |
| 9         | Check tray icon              | Tray icon visible in menu bar                      | 1s       |
| 10        | Check for update             | "No update available" or update prompt shown       | 2s       |
| **Total** |                              |                                                    | **~16s** |

## 9.7 Performance Benchmark Tests

Automated benchmarks using Criterion (Rust) and Vitest (TypeScript):

### 9.7.1 Rust Benchmarks (`benches/`)

| Benchmark               | Target                            | Measurement                     |
| ----------------------- | --------------------------------- | ------------------------------- |
| `automation_benchmarks` | Screenshot capture throughput     | < 100ms per full-screen capture |
| `automation_benchmarks` | AXUIElement tree traversal        | < 500ms for 1000-element tree   |
| `automation_benchmarks` | Input simulation (100 keystrokes) | < 50ms total                    |
| `agi_benchmarks`        | LLM router model selection        | < 1ms per routing decision      |
| `agi_benchmarks`        | SSE parser throughput             | > 10MB/s token parsing          |
| `agi_benchmarks`        | Token counting (tiktoken)         | < 10ms for 10,000 tokens        |
| `agi_benchmarks`        | ToolGuard validation              | < 1ms per tool validation       |
| `agi_benchmarks`        | Secret encryption/decryption      | < 5ms per operation             |
| `agi_benchmarks`        | SQLite conversation query         | < 10ms for 100 messages         |
| `agi_benchmarks`        | Embedding similarity search       | < 50ms for 10,000 vectors       |

### 9.7.2 TypeScript Performance Tests

| Test                                         | Target  | Measurement               |
| -------------------------------------------- | ------- | ------------------------- |
| Store initialization (all 60+ stores)        | < 50ms  | Time from import to ready |
| Message list render (100 messages)           | < 100ms | React render time         |
| Tool timeline render (20 entries)            | < 16ms  | Single frame budget       |
| Settings panel render                        | < 50ms  | Full panel with all tabs  |
| Command palette search (1000 items)          | < 10ms  | Fuse.js search latency    |
| Conversation list filter (500 conversations) | < 20ms  | Filter + re-render        |

## 9.8 Regression Test Catalog

Tests targeting known bugs that have been fixed. Each test verifies the fix remains intact.

### 9.8.1 IPC Parameter Regression Tests

These tests verify that all `invoke()` calls use camelCase parameter keys (Tauri auto-converts to snake_case for Rust). Snake_case in TypeScript `invoke()` silently fails — parameters arrive as `undefined`.

| Test ID     | Description                                                           | File Under Test          | Expected Behavior                        |
| ----------- | --------------------------------------------------------------------- | ------------------------ | ---------------------------------------- |
| REG-IPC-001 | `cancelToolConfirmation` uses camelCase param `confirmationId`        | `tool_confirmation.ts`   | Rust receives non-null `confirmation_id` |
| REG-IPC-002 | `getToolSafetyTier` uses camelCase param `toolName`                   | `tool_confirmation.ts`   | Rust receives non-null `tool_name`       |
| REG-IPC-003 | `scheduler_create_job` uses `actionType` not `action_type`            | `schedulerStore.ts`      | Rust receives non-null `action_type`     |
| REG-IPC-004 | `scheduler_create_job` uses `actionData` not `action_data`            | `schedulerStore.ts`      | Rust receives non-null `action_data`     |
| REG-IPC-005 | `scheduler_delete_job` uses `jobId` not `job_id`                      | `schedulerStore.ts`      | Rust receives non-null `job_id`          |
| REG-IPC-006 | `scheduler_toggle_job` uses `jobId` not `job_id`                      | `schedulerStore.ts`      | Rust receives non-null `job_id`          |
| REG-IPC-007 | `scheduler_run_now` uses `jobId` not `job_id`                         | `schedulerStore.ts`      | Rust receives non-null `job_id`          |
| REG-IPC-008 | `chat_send_message` uses `conversationId` not `conversation_id`       | `unifiedChatStore.ts`    | Rust receives non-null `conversation_id` |
| REG-IPC-009 | `chat_get_messages` uses `conversationId` not `conversation_id`       | `unifiedChatStore.ts`    | Rust receives non-null `conversation_id` |
| REG-IPC-010 | `agent_resolve_approval` uses `requestId` not `request_id`            | `governanceStore.ts`     | Rust receives non-null `request_id`      |
| REG-IPC-011 | `agent_set_workflow_hash` uses `workflowHash` not `workflow_hash`     | `governanceStore.ts`     | Rust receives non-null `workflow_hash`   |
| REG-IPC-012 | `mcp_connect_server` uses camelCase nested config                     | `mcpStore.ts`            | All config fields received in Rust       |
| REG-IPC-013 | `background_agent_pause` uses `agentId` not `agent_id`                | `backgroundTaskStore.ts` | Rust receives non-null `agent_id`        |
| REG-IPC-014 | `research_start` uses `sourceDomains` not `source_domains`            | `researchStore.ts`       | Rust receives non-null `source_domains`  |
| REG-IPC-015 | `conversation_export_pdf` uses `conversationId` not `conversation_id` | `exportStore.ts`         | Rust receives non-null `conversation_id` |

### 9.8.2 Shell Injection Regression Tests

Tests verifying that all shell command construction properly escapes user input. These address CVEs fixed in the Ground Truth Fixes sprint.

| Test ID     | Description                         | File Under Test            | Attack Vector                                   | Expected                                                |
| ----------- | ----------------------------------- | -------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| REG-SEC-001 | AppleScript window title injection  | `window_manager.rs`        | `"; do shell script "malicious"` in title       | Title escaped via `shlex::try_quote()`, no injection    |
| REG-SEC-002 | Process launch path injection       | `window_manager.rs`        | `; rm -rf /` in app path                        | Path validated, command rejected                        |
| REG-SEC-003 | wmctrl command injection            | `window_manager.rs`        | Malicious window name with shell metacharacters | Arguments passed as array, not shell-interpolated       |
| REG-SEC-004 | Terminal command with backticks     | `terminal_execute`         | `` `curl attacker.com` `` in command            | Command executed in PTY sandbox, not shell-interpolated |
| REG-SEC-005 | File path with shell metacharacters | `file_read` / `file_write` | `file;rm -rf /` as path                         | Path validated by ToolGuard, rejected                   |
| REG-SEC-006 | Git message injection               | `git_commit`               | `-m "msg" --amend --no-verify` in message       | Message treated as string argument, not parsed as flags |

### 9.8.3 Embedding and Memory Regression Tests

Tests verifying that the embedding pipeline never returns zero vectors and gracefully degrades.

| Test ID     | Description                                                  | Expected                                                 |
| ----------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| REG-EMB-001 | `HttpSummaryLLM::embed()` with Ollama available              | Returns 768-dimension vector via nomic-embed-text        |
| REG-EMB-002 | `HttpSummaryLLM::embed()` with Ollama down, OpenAI available | Returns 1536-dimension vector via text-embedding-3-small |
| REG-EMB-003 | `HttpSummaryLLM::embed()` with both down                     | Returns None (not zero vector)                           |
| REG-EMB-004 | Memory search with embeddings available                      | Returns cosine similarity-ranked results                 |
| REG-EMB-005 | Memory search with embeddings unavailable                    | Falls back to FTS5 full-text search                      |
| REG-EMB-006 | Conversation summarizer with embedding provider              | Generates summary with real embeddings                   |

### 9.8.4 Model ID Normalization Regression Tests

Tests verifying that model IDs are correctly normalized at the router entry point.

| Test ID     | Input                           | Expected Normalized                               | Provider  |
| ----------- | ------------------------------- | ------------------------------------------------- | --------- |
| REG-MID-001 | `claude-opus-4.6`               | `claude-opus-4-6`                                 | Anthropic |
| REG-MID-002 | `claude-opus-4-6`               | `claude-opus-4-6` (unchanged)                     | Anthropic |
| REG-MID-003 | `claude-sonnet-4.5`             | `claude-sonnet-4-5`                               | Anthropic |
| REG-MID-004 | `gpt-4o`                        | `gpt-4o` (unchanged)                              | OpenAI    |
| REG-MID-005 | `gemini-2.0-flash`              | `gemini-2.0-flash` (unchanged, hyphens preserved) | Google    |
| REG-MID-006 | Custom model (arbitrary string) | Passed through unchanged                          | Custom    |
| REG-MID-007 | Empty string                    | Error returned (not panic)                        | N/A       |
| REG-MID-008 | Ollama model `llama3.2:70b`     | Ollama format preserved for local API             | Ollama    |

### 9.8.5 UI State Regression Tests

Tests verifying that UI components render correctly in edge-case states.

| Test ID    | Component            | State                                 | Expected                                                 |
| ---------- | -------------------- | ------------------------------------- | -------------------------------------------------------- |
| REG-UI-001 | SendButton           | `showStopButton=true`, no other props | Renders red stop button (not send)                       |
| REG-UI-002 | SendButton           | `queueMode=true`                      | Renders amber clock icon                                 |
| REG-UI-003 | ToolTimeline         | Empty entries array                   | Renders nothing (no empty state placeholder)             |
| REG-UI-004 | ToolTimeline         | 100+ entries                          | Virtualizes list, renders < 16ms                         |
| REG-UI-005 | PlusMenu             | `visionSupported=false`               | Screenshot button disabled, "No vision" badge on attach  |
| REG-UI-006 | AgenticLoopStatusBar | `active=true, iteration=0`            | Shows "Agent working (step 0)" with spinner              |
| REG-UI-007 | ConversationList     | 0 conversations                       | Shows empty state with "Start a new conversation" prompt |
| REG-UI-008 | ModelSelector        | No API keys configured                | Shows "Add API key" link instead of model list           |
| REG-UI-009 | ChatInputArea        | Disabled state                        | Textarea not focusable, send button grayed out           |
| REG-UI-010 | VoiceInputOverlay    | Recording active                      | Shows pulsing waveform, duration counter, cancel button  |
| REG-UI-011 | ResearchPanel        | All sources failed                    | Shows error state with retry button                      |
| REG-UI-012 | SkillMarketplace     | 0 skills match search                 | Shows "No skills found" empty state                      |
| REG-UI-013 | ApprovalModal        | Timeout (60s)                         | Auto-rejects with timeout reason                         |
| REG-UI-014 | SettingsPanel        | Invalid API key format                | Shows red validation error below input                   |
| REG-UI-015 | BackgroundTasksPanel | 5 agents, 1 failed                    | Failed agent shows red status, others green              |

### 9.8.6 Mobile Secure Storage Regression Tests

Tests verifying that mobile auth tokens are stored in platform-secure storage, not AsyncStorage.

| Test ID     | Platform | Storage                | Expected                                                   |
| ----------- | -------- | ---------------------- | ---------------------------------------------------------- |
| REG-MOB-001 | iOS      | expo-secure-store      | Session token stored in Keychain, not AsyncStorage         |
| REG-MOB-002 | Android  | expo-secure-store      | Session token stored in Android Keystore                   |
| REG-MOB-003 | iOS      | Chunked storage (>2KB) | Large tokens split and stored in multiple Keychain entries |
| REG-MOB-004 | Both     | Token retrieval        | `getSecureItem()` returns valid token across app restarts  |
| REG-MOB-005 | Both     | Token deletion         | `deleteSecureItem()` removes all chunks                    |

### 9.8.7 Chrome Extension Security Regression Tests

| Test ID     | Description                                 | Expected                                          |
| ----------- | ------------------------------------------- | ------------------------------------------------- |
| REG-EXT-001 | API key stored in `chrome.storage.session`  | Not in `chrome.storage.local`                     |
| REG-EXT-002 | Migration from `local` to `session` storage | Old key removed from `local` after migration      |
| REG-EXT-003 | Session storage cleared on browser close    | API key not persisted across browser sessions     |
| REG-EXT-004 | Content script isolation                    | Cannot access API key from content script context |

---

# 10. Performance Requirements

## 10.1 Cold Start Time

| Metric                       | Target        | Measurement                                       |
| ---------------------------- | ------------- | ------------------------------------------------- |
| App launch to window visible | < 1.5 seconds | From process start to first paint                 |
| App launch to interactive    | < 3.0 seconds | From process start to chat input focusable        |
| Database initialization      | < 500ms       | SQLCipher open + migration check                  |
| MCP auto-connect             | Background    | Does not block UI; servers connect asynchronously |

## 10.2 Memory Footprint

| State                             | Target   | Measurement                |
| --------------------------------- | -------- | -------------------------- |
| Idle (no conversations)           | < 150 MB | RSS after initial load     |
| Active chat (10 messages)         | < 250 MB | RSS during normal use      |
| Heavy use (100 messages, 5 tools) | < 500 MB | RSS during agent execution |
| Background agents (5 active)      | < 800 MB | RSS with concurrent agents |
| Peak (swarm, 20 agents)           | < 2 GB   | RSS during swarm execution |

## 10.3 Bundle Size

| Component                  | Target   |
| -------------------------- | -------- |
| DMG (universal binary)     | < 120 MB |
| App bundle (uncompressed)  | < 200 MB |
| Frontend assets (JS + CSS) | < 15 MB  |
| Rust binary (universal)    | < 80 MB  |

## 10.4 Rendering Performance

| Metric                   | Target                    |
| ------------------------ | ------------------------- |
| Message list scrolling   | 60 FPS (virtualized)      |
| Token streaming render   | < 16ms per frame (60 FPS) |
| Settings panel open      | < 100ms                   |
| Tool timeline expand     | < 50ms                    |
| Canvas zoom/pan          | 60 FPS                    |
| Voice waveform animation | 60 FPS                    |

## 10.5 Network Performance

| Metric                         | Target                     | Measurement Method                                    |
| ------------------------------ | -------------------------- | ----------------------------------------------------- |
| LLM TTFT (time to first token) | < 2,500ms (P95)            | From invoke() call to first `chat:stream-chunk` event |
| Streaming throughput           | No dropped tokens          | Verify all tokens from SSE arrive in frontend         |
| MCP tool response              | < 5,000ms (P95)            | From tool invocation to result return                 |
| Auto-update download           | Background, no UI blocking | Download in background tokio task                     |
| Supabase auth                  | < 1,000ms                  | Login to JWT available                                |
| Ollama local inference         | < 500ms TTFT               | Localhost round-trip for local models                 |

## 10.6 Battery Impact (MacBook)

| State                            | Target     | Measurement                        |
| -------------------------------- | ---------- | ---------------------------------- |
| Idle (window open, no activity)  | < 2% CPU   | Activity Monitor process CPU       |
| Idle (minimized to tray)         | < 0.5% CPU | Activity Monitor process CPU       |
| Active chat (streaming response) | < 15% CPU  | During SSE parsing and rendering   |
| Agent executing (background)     | < 25% CPU  | During tool execution loop         |
| Computer use (OPA loop)          | < 35% CPU  | During screenshot capture + vision |
| Voice recording                  | < 10% CPU  | During cpal audio capture          |

Power optimization strategies:

- No polling when idle (event-driven architecture)
- WebView process suspended when window hidden (Tauri default)
- MCP health check interval increases to 120s when on battery
- Auto-update check skipped on battery (deferred to AC power)
- Animation frame rate reduced to 30fps on battery via `prefers-reduced-motion` detection

## 10.7 Disk I/O Performance

| Operation                      | Target  | Notes                         |
| ------------------------------ | ------- | ----------------------------- |
| Conversation load (100 msgs)   | < 50ms  | SQLCipher indexed query       |
| Message insert                 | < 5ms   | Single row insert             |
| Settings read                  | < 2ms   | localStorage access           |
| Settings write                 | < 5ms   | localStorage + debounced sync |
| File read (< 1MB)              | < 20ms  | Tauri fs plugin               |
| File write (< 1MB)             | < 30ms  | Tauri fs plugin               |
| Embedding search (10K vectors) | < 100ms | Cosine similarity scan        |
| Full-text search (FTS5)        | < 30ms  | SQLite FTS5 index             |
| Cache lookup (LRU)             | < 1ms   | In-memory DashMap             |

## 10.8 Startup Sequence Timing

Detailed breakdown of cold start time budget:

| Phase                   | Budget        | Action                                            |
| ----------------------- | ------------- | ------------------------------------------------- |
| Process launch          | 200ms         | macOS loads Mach-O binary                         |
| Tauri init              | 300ms         | WebView creation, plugin loading                  |
| Database open           | 200ms         | SQLCipher open + WAL mode setup                   |
| State initialization    | 100ms         | AppState, managed state constructors              |
| Migration check         | 50ms          | Check DB schema version                           |
| Frontend load           | 400ms         | Vite bundle load + React hydration                |
| Store initialization    | 100ms         | Zustand stores restore from localStorage          |
| MCP auto-connect        | 0ms (async)   | Background task, does not block UI                |
| First paint             | 150ms         | Initial render of app shell                       |
| **Total (interactive)** | **< 1,500ms** | User sees app shell                               |
| Deferred init           | 500ms         | Accessibility check, global shortcuts, tray setup |
| **Total (fully ready)** | **< 2,000ms** | All features available                            |

Deferred initialization (does not block window):

1. `AXIsProcessTrusted()` check → deferred if not granted
2. Global shortcut registration → deferred until accessibility granted
3. System tray icon setup → parallel to frontend load
4. Auto-update check → 5-second delay after launch
5. MCP server auto-connect → background task
6. Analytics session start → non-blocking

---

# 11. Security

## 11.1 Threat Model (macOS-Specific)

| Threat                         | Mitigation                                                            | Status      |
| ------------------------------ | --------------------------------------------------------------------- | ----------- |
| Plaintext API key exposure     | SecretManager: Argon2id + AES-256-GCM + SQLCipher + Keychain          | Implemented |
| Malicious tool execution       | ToolGuard: safety tiers, deny lists, rate limiting, audit log         | Implemented |
| Path traversal via agent       | Tauri capability deny list (19 patterns), ToolGuard path validation   | Implemented |
| AppleScript injection          | `shlex::try_quote()` on all shell arguments in `window_manager.rs`    | Implemented |
| Unsigned binary execution      | Developer ID signing + Apple Notarization + Ed25519 update signing    | Implemented |
| Memory dump of secrets         | Secrets kept in Rust heap (not JS), SQLCipher at rest                 | Implemented |
| Keychain access by malware     | macOS Keychain ACL scoped to app bundle ID                            | Implemented |
| Man-in-the-middle on LLM APIs  | rustls (TLS 1.3), no native-tls, certificate pinning on update server | Implemented |
| Accessibility permission abuse | Deferred init until user grants; AXIsProcessTrusted() check           | Implemented |
| IPC parameter injection        | camelCase enforcement, Tauri capability boundary, serde validation    | Implemented |

## 11.2 Secret Storage

**Primary**: SecretManager (Rust)

- Key derivation: HKDF-SHA256 from master key (per-secret derived keys)
- Encryption: AES-256-GCM with random nonce
- Storage: SQLCipher (encrypted SQLite)
- Master key: Argon2id-derived from user's master password, or PBKDF2-derived from machine identity if no master password set

**Fallback**: macOS Keychain

- Used for: email credentials, OAuth tokens, machine key salt
- Access control: scoped to app bundle ID (`com.agiworkforce.desktop`)

## 11.3 ToolGuard Sandboxing

Every tool execution passes through ToolGuard before reaching the handler:

1. **Input validation**: Check tool arguments against schema and deny-list patterns
2. **Permission check**: Verify agent has permission for this tool
3. **Safety tier classification**: Safe, RequiresNotification, RequiresConfirmation, RequiresExplicitApproval
4. **Rate limiting**: Token-bucket per-tool rate limiter
5. **Execution**: Pass to handler if all checks pass
6. **Audit log**: HMAC-signed entry recording invocation, result, timing

Auto-approve mode bypasses the user dialog only. ToolGuard validation and audit logging remain active in all modes.

## 11.4 Tauri Capability Deny List

The filesystem deny list in `capabilities/default.json` blocks 19 path patterns:

| Category          | Blocked Patterns                                         |
| ----------------- | -------------------------------------------------------- |
| SSH keys          | `~/.ssh/*`                                               |
| Shell config      | `~/.bashrc`, `~/.zshrc`, `~/.profile`, `~/.bash_profile` |
| Credential stores | `~/.aws/credentials`, `~/.config/gcloud/*`, `~/.npmrc`   |
| System files      | `/etc/passwd`, `/etc/shadow`, `/private/etc/*`           |
| Process info      | `/proc/*`                                                |
| macOS Keychain    | `~/Library/Keychains/*`                                  |
| macOS system      | `/System/*`, `/Library/Keychains/*`                      |

## 11.5 Platform CVE Mitigations

| CVE Category                  | Mitigation                                                                                                  | Implementation Location                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Shell injection               | `shlex::try_quote()` on all arguments passed to shell commands                                              | `window_manager.rs`, `automation.rs`, `terminal.rs` |
| SQL injection                 | `SqlSecurityValidator` on all external database queries; parameterized queries only                         | `database.rs`, `SqlSecurityValidator` struct        |
| Prompt injection              | `escape_xml()` + `sanitize_multiline_for_prompt()` on all tool results before LLM context injection         | `core/agi/executors/`, tool result handlers         |
| XSS                           | DOMPurify on all rendered HTML; React's default escaping; no `dangerouslySetInnerHTML` without sanitization | All Markdown renderers, `MarkdownContent.tsx`       |
| Open redirect                 | Redirect target validated against CORS allowlist                                                            | `useDeepLink.ts`, web navigation handlers           |
| Dependency vulnerabilities    | `cargo audit` + `pnpm audit --audit-level=high` in CI                                                       | `.github/workflows/codeql.yml`                      |
| Path traversal                | `PathValidator` checks all file paths against deny list before access                                       | `path_validation.rs`, `file_ops.rs`                 |
| AppleScript injection         | All AppleScript arguments sanitized via `shlex::try_quote()`                                                | `window_manager.rs` lines 45-67                     |
| Process spawn injection       | All process arguments validated and quoted                                                                  | `window_manager.rs`, `automation_enhanced.rs`       |
| Clipboard data exfiltration   | Clipboard reads require explicit agent permission; writes are audited                                       | `automation.rs`, `arboard` usage                    |
| Deep link parameter injection | `ALLOWED_DEEP_LINK_PARAMS` allowlist; scheme validation; token redaction                                    | `useDeepLink.ts`, `tauri-plugin-deep-link`          |
| WebSocket hijacking           | WebSocket connections validated with auth token; origin checked                                             | `tokio-tungstenite` handlers                        |
| Binary tampering              | Ed25519 signature verification on all update payloads                                                       | `ed25519-dalek` in update handler                   |
| Memory disclosure             | Secrets kept in Rust heap (not JS accessible); zeroized on drop                                             | `SecretManager`, `aes-gcm` usage                    |

## 11.6 Data at Rest Protection

| Data Category         | Storage Location                     | Encryption                                   | Access Control            |
| --------------------- | ------------------------------------ | -------------------------------------------- | ------------------------- |
| Conversations         | `conversations.db` (SQLCipher)       | AES-256 (SQLCipher bundled)                  | File permissions 0600     |
| Messages              | `conversations.db` (SQLCipher)       | AES-256 (SQLCipher bundled)                  | File permissions 0600     |
| API keys              | `conversations.db` via SecretManager | Argon2id KDF + AES-256-GCM                   | Per-key derived keys      |
| Email credentials     | macOS Keychain                       | macOS Keychain encryption                    | App bundle ID ACL         |
| OAuth tokens          | macOS Keychain                       | macOS Keychain encryption                    | App bundle ID ACL         |
| Settings              | localStorage (browser storage)       | Not encrypted (non-sensitive)                | Tauri sandbox             |
| Audit log             | `conversations.db` (SQLCipher)       | AES-256 (SQLCipher bundled) + HMAC integrity | Append-only               |
| Embeddings            | `conversations.db` (SQLCipher)       | AES-256 (SQLCipher bundled)                  | File permissions 0600     |
| Cache (LLM responses) | In-memory (DashMap)                  | Not persisted                                | Cleared on quit           |
| Conversation exports  | User-selected path                   | Not encrypted (user's choice)                | Standard file permissions |

## 11.7 Data in Transit Protection

| Communication Channel         | Protocol          | Certificate            | Pinning                   |
| ----------------------------- | ----------------- | ---------------------- | ------------------------- |
| LLM API calls (all providers) | HTTPS (TLS 1.3)   | rustls (no native-tls) | Root CA validation        |
| Supabase auth/sync            | HTTPS (TLS 1.3)   | System CA bundle       | None (Supabase manages)   |
| Auto-update check             | HTTPS (TLS 1.3)   | rustls                 | Ed25519 payload signature |
| MCP stdio                     | Unix pipe (local) | N/A (local)            | N/A                       |
| MCP SSE                       | HTTPS             | rustls                 | Root CA validation        |
| MCP HTTP                      | HTTPS             | rustls                 | Root CA validation        |
| WebSocket (signaling)         | WSS (TLS 1.3)     | rustls                 | Auth token validation     |
| Ollama (local)                | HTTP (localhost)  | N/A (local only)       | Localhost-only binding    |

## 11.8 Permission Enforcement

### 11.8.1 macOS System Permissions

| Permission       | API Gate                                          | Usage                                      | Prompt Timing                                    |
| ---------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Accessibility    | `AXIsProcessTrusted()`                            | AXUIElement, CGEventTap (global shortcuts) | On first use of computer use or global shortcuts |
| Microphone       | `AVCaptureDevice.requestAccess(.audio)`           | Voice input via `cpal`                     | On first voice input attempt                     |
| Screen Recording | System Settings redirect                          | Screen capture via `xcap`                  | On first screenshot attempt                      |
| Full Disk Access | System Settings redirect                          | Reading protected directories              | On first access to protected path                |
| Camera           | `AVCaptureDevice.requestAccess(.video)`           | Video input (future)                       | On first camera use                              |
| Notifications    | `UNUserNotificationCenter.requestAuthorization()` | System notifications                       | On first notification send                       |

### 11.8.2 Application-Level Permissions

| Permission         | Default                       | Controlled By               | Override                                   |
| ------------------ | ----------------------------- | --------------------------- | ------------------------------------------ |
| Tool execution     | Requires approval             | `approvalMode` setting      | Auto-approve mode                          |
| File read          | Allowed                       | ToolGuard safe tier         | Deny list blocks protected paths           |
| File write         | Requires approval             | ToolGuard confirmation tier | Auto-approve mode                          |
| File delete        | Requires explicit approval    | ToolGuard explicit tier     | Cannot be auto-approved in standard safety |
| Terminal command   | Requires approval             | ToolGuard confirmation tier | Auto-approve mode                          |
| Browser navigation | Allowed                       | ToolGuard safe tier         | Domain deny list                           |
| Email send         | Requires explicit approval    | ToolGuard explicit tier     | Cannot be auto-approved                    |
| Database write     | Requires approval             | ToolGuard confirmation tier | Auto-approve mode                          |
| MCP tool execution | Requires approval (first use) | ToolGuard per-tool config   | Trust after first approval                 |

## 11.9 Audit Trail

All security-relevant operations are logged to the audit trail with HMAC-SHA256 integrity signatures:

| Event Category  | Events Logged                                                        | Retention |
| --------------- | -------------------------------------------------------------------- | --------- |
| Authentication  | Login, logout, token refresh, failed auth attempts                   | 90 days   |
| Tool Execution  | All tool invocations (name, args, result, duration, success/failure) | 30 days   |
| Configuration   | Settings changes, API key additions/removals, policy changes         | 90 days   |
| Agent Actions   | Goal submissions, step completions, approval decisions               | 30 days   |
| Security        | Permission requests, deny list violations, rate limit hits           | 90 days   |
| MCP             | Server connections, disconnections, tool discoveries                 | 30 days   |
| File Operations | All file read/write/delete operations with paths                     | 30 days   |

Audit log entries include:

- **Timestamp**: ISO 8601 with timezone
- **Event type**: Category + specific event name
- **Actor**: User, Agent (with model name), or System
- **Description**: Human-readable description
- **HMAC signature**: SHA-256 HMAC of entry content for tamper detection
- **Metadata**: JSON blob with event-specific details

## 11.10 Threat Mitigations — Detailed

### 11.10.1 Malicious MCP Server Protection

**Threat**: A user connects to a malicious MCP server that returns harmful tool results or exfiltrates data.

**Mitigations**:

1. All MCP tool results are sanitized before injection into LLM context (`escape_xml()`, `sanitize_multiline_for_prompt()`)
2. MCP servers cannot access the local filesystem except through their own process sandbox
3. Tool results are logged to the audit trail
4. Circuit breaker (30s cooldown) prevents rapid fire from a misbehaving server
5. Users can disable individual tools from any server
6. Health monitoring (30s polling) detects unresponsive servers

### 11.10.2 Agent Runaway Prevention

**Threat**: An autonomous agent enters an infinite loop or performs escalating actions.

**Mitigations**:

1. Max iteration limit per agentic loop (configurable, default 25)
2. Per-session cost cap ($50 hard limit, configurable)
3. Per-step execution timeout (configurable, default 30 minutes)
4. ToolGuard validation on every tool invocation (no bypass)
5. Rate limiting: max 10 tool calls per minute per agent
6. Reflection on failure: agent must analyze and explain failures before retrying
7. Background agent max concurrent limit (default 5)
8. Swarm agent max concurrent limit (default 100)

### 11.10.3 Local Model Data Privacy

**Threat**: User expects local model inference to be fully private but data leaks to cloud.

**Mitigations**:

1. "Local-only mode" setting completely disables all cloud API calls
2. Local model detection via `/api/show` endpoint (Ollama) runs entirely on localhost
3. No telemetry data includes conversation content (ever)
4. Embedding generation falls back to Ollama local before attempting cloud
5. "Local First" routing strategy prefers local models for all requests
6. Network indicator in sidebar clearly shows when cloud APIs are being used

---

# 12. Accessibility

## 12.1 VoiceOver Support

AGI Workforce supports macOS VoiceOver screen reader:

| Element                 | VoiceOver Label                        | Role     |
| ----------------------- | -------------------------------------- | -------- |
| New Conversation button | "New conversation"                     | button   |
| Conversation list item  | "[Title], [timestamp], [model]"        | listitem |
| Message bubble          | "[Role] message: [content preview]"    | article  |
| Send button             | "Send message"                         | button   |
| Stop button             | "Stop generation"                      | button   |
| Model selector          | "Current model: [name]. Change model." | button   |
| Tool timeline entry     | "[Tool name], [status], [duration]"    | listitem |
| Settings tab            | "[Tab name] settings"                  | tab      |
| Approval dialog         | "Approve action: [tool name]"          | dialog   |
| Voice input indicator   | "Recording. Press Escape to cancel."   | status   |

All interactive elements have `aria-label` attributes. Live regions (`aria-live="polite"`) announce:

- Streaming response updates (batched, not per-token)
- Tool execution status changes
- Agent step completions
- Error messages

## 12.2 Keyboard-Only Navigation

Full keyboard navigation without mouse:

| Context           | Keys                | Action                                |
| ----------------- | ------------------- | ------------------------------------- |
| Global            | `Tab` / `Shift+Tab` | Navigate between focusable elements   |
| Global            | `Escape`            | Close modal/overlay, cancel operation |
| Conversation list | `Arrow Up/Down`     | Navigate conversations                |
| Conversation list | `Enter`             | Open conversation                     |
| Message list      | `Arrow Up/Down`     | Navigate messages                     |
| Tool timeline     | `Enter` on tool     | Expand/collapse detail                |
| Settings          | `Arrow Up/Down`     | Navigate tabs                         |
| Settings          | `Tab`               | Move to content area                  |
| Approval dialog   | `Enter`             | Approve                               |
| Approval dialog   | `Escape`            | Deny                                  |
| Command palette   | `Arrow Up/Down`     | Navigate results                      |
| Command palette   | `Enter`             | Execute action                        |

Focus indicators: 2px solid blue outline on all focused elements. Focus trap in modal dialogs.

## 12.3 Color Contrast

All text meets WCAG AA contrast requirements:

| Element                 | Foreground          | Background         | Contrast Ratio |
| ----------------------- | ------------------- | ------------------ | -------------- |
| Body text (dark theme)  | #E5E7EB (gray-200)  | #1F2937 (gray-800) | 10.5:1         |
| Body text (light theme) | #1F2937 (gray-800)  | #FFFFFF            | 14.5:1         |
| Primary button text     | #FFFFFF             | #3B82F6 (blue-500) | 4.6:1          |
| Error text              | #EF4444 (red-500)   | #1F2937 / #FFFFFF  | 4.6:1 / 4.0:1  |
| Success text            | #10B981 (green-500) | #1F2937 / #FFFFFF  | 5.3:1 / 3.4:1  |
| Muted text              | #9CA3AF (gray-400)  | #1F2937 / #FFFFFF  | 5.4:1 / 3.0:1  |

Status indicators use both color and shape (not color alone):

- Success: green + checkmark icon
- Error: red + X icon
- Warning: yellow + exclamation icon
- Info: blue + info icon

## 12.4 Reduced Motion

When macOS "Reduce motion" is enabled (`prefers-reduced-motion: reduce`):

- All CSS animations disabled
- Framer Motion animations disabled via `useReducedMotion` hook
- Streaming text appears instantly (no typing animation)
- Voice waveform shows static bars (no animation)
- Page transitions are instant (no slide/fade)

## 12.5 Platform Accessibility APIs

| macOS API           | Usage                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| `NSAccessibility`   | All native window controls expose accessibility attributes               |
| VoiceOver rotor     | Custom landmarks for sidebar, main content, composer                     |
| Keyboard navigation | Full tab order through all interactive elements                          |
| Dynamic Type        | Not applicable (desktop, not iOS) — font size controlled by app settings |
| `AXValue`           | Exposes text content for VoiceOver reading of chat messages              |
| `AXRole`            | Correct roles for all custom components (button, dialog, list, etc.)     |
| `AXNotification`    | `AXValueChanged` notifications for streaming text updates                |

## 12.6 ARIA Implementation Details

### 12.6.1 Landmarks

| Region            | ARIA Role       | ARIA Label                 | Component                        |
| ----------------- | --------------- | -------------------------- | -------------------------------- |
| Sidebar           | `navigation`    | "Conversation navigation"  | `Sidebar.tsx`                    |
| Main content      | `main`          | "Chat workspace"           | `MainContent` in `AppLayout.tsx` |
| Chat message list | `log`           | "Conversation messages"    | `ChatMessageList.tsx`            |
| Composer          | `form`          | "Message composer"         | `ChatInputArea.tsx`              |
| Settings panel    | `complementary` | "Application settings"     | `SettingsPanel.tsx`              |
| Tool timeline     | `list`          | "Tool execution timeline"  | `ToolTimeline.tsx`               |
| Command palette   | `dialog`        | "Command palette"          | `CommandPalette.tsx`             |
| Approval modal    | `alertdialog`   | "Action approval required" | `ApprovalModal.tsx`              |

### 12.6.2 Live Regions

| Region                | `aria-live` Value | Purpose                                 | Update Frequency                    |
| --------------------- | ----------------- | --------------------------------------- | ----------------------------------- |
| Streaming response    | `polite`          | Announces new response content          | Batched (every 500ms during stream) |
| Tool execution status | `polite`          | Announces "Tool started: Read(file.ts)" | Per tool event                      |
| Agent step progress   | `polite`          | Announces "Agent working (step 3/5)"    | Per step transition                 |
| Error banner          | `assertive`       | Announces error messages immediately    | On error occurrence                 |
| Notification toast    | `polite`          | Announces toast content                 | On toast appearance                 |
| Upload progress       | `polite`          | Announces "Upload 50% complete"         | Every 25% increment                 |

### 12.6.3 Focus Management

| Trigger                  | Focus Target                                    | Mechanism                           |
| ------------------------ | ----------------------------------------------- | ----------------------------------- |
| New conversation created | Chat input textarea                             | `useEffect` with `inputRef.focus()` |
| Approval modal opens     | "Approve" button                                | Radix Dialog auto-focus             |
| Command palette opens    | Search input                                    | Radix Dialog auto-focus             |
| Settings panel opens     | First focusable element in active tab           | `useEffect` with auto-focus         |
| Modal closes             | Previously focused element                      | Radix Dialog focus restoration      |
| Tool timeline expands    | First tool entry                                | `aria-expanded` state change        |
| Error banner appears     | Dismiss button                                  | `assertive` live region             |
| Conversation deleted     | Next conversation in list, or "New Chat" button | Programmatic focus                  |

### 12.6.4 Screen Reader Announcements

Specific announcements made to screen readers:

| Event                   | Announcement                                  | Screen Reader API       |
| ----------------------- | --------------------------------------------- | ----------------------- |
| Message sent            | "[Model name] is responding..."               | `aria-live="polite"`    |
| Response complete       | "Response complete. [token count] tokens."    | `aria-live="polite"`    |
| Generation stopped      | "Generation stopped."                         | `aria-live="polite"`    |
| Tool started            | "Running [tool name]..."                      | `aria-live="polite"`    |
| Tool completed          | "[Tool name] completed in [duration]."        | `aria-live="polite"`    |
| Tool failed             | "[Tool name] failed: [error]."                | `aria-live="assertive"` |
| Agent step              | "Agent working, step [n] of [total]."         | `aria-live="polite"`    |
| Model changed           | "Model changed to [model name]."              | `aria-live="polite"`    |
| Voice recording started | "Recording. Press Escape to cancel."          | `aria-live="assertive"` |
| Voice recording ended   | "Transcribing..."                             | `aria-live="polite"`    |
| Transcription complete  | "Transcription inserted: [first 50 chars]..." | `aria-live="polite"`    |
| Error occurred          | "Error: [friendly message]."                  | `aria-live="assertive"` |
| Update available        | "Update available: version [version]."        | `aria-live="polite"`    |

## 12.7 Touch Bar Support (Legacy)

For MacBook Pro models with Touch Bar (2016-2020):

| Context   | Touch Bar Items                                           |
| --------- | --------------------------------------------------------- |
| Chat view | Send button, Stop button, New Chat button, Model selector |
| Settings  | Tab navigation, Save button                               |
| Terminal  | Ctrl+C button, Clear button                               |
| Voice     | Record/Stop toggle                                        |

Note: Touch Bar support is implemented via Tauri's native window integration. Since Apple has discontinued the Touch Bar in current MacBook Pro models, this is maintained but not actively enhanced.

## 12.8 Display Accommodation

| Accommodation      | Implementation                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| High contrast mode | Detected via `prefers-contrast: more`; increases all border widths to 2px, uses maximum contrast text colors |
| Inverted colors    | Works naturally with CSS custom properties                                                                   |
| Zoom               | Application supports macOS zoom (Accessibility > Zoom); all layouts are responsive down to effective 800x600 |
| Large cursor       | Works naturally with macOS cursor APIs                                                                       |
| Slow keys          | Handled by macOS; no interference from app keyboard handlers                                                 |
| Sticky keys        | Handled by macOS; global shortcuts compatible                                                                |
| Mouse keys         | Full mouse-free operation via keyboard navigation                                                            |
| Head pointer       | Works naturally with macOS Accessibility                                                                     |
| Switch Control     | All interactive elements focusable and activatable                                                           |

---

# 13. Competitive Analysis

## 13.1 Claude Desktop (macOS)

**Current version**: Claude Desktop 2.x (Anthropic)
**Architecture**: Electron-based desktop app
**Model access**: Claude models only (Haiku, Sonnet, Opus)
**MCP support**: stdio and SSE transports; limited server ecosystem

### 13.1.1 Features Claude Desktop Has

| Feature           | Claude Desktop                      | AGI Workforce Parity                                                        |
| ----------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Streaming chat    | Full streaming with thinking blocks | Parity: full streaming + thinking for all providers                         |
| MCP tools         | stdio + SSE, growing ecosystem      | Advantage: also supports streamable HTTP, no tool cap                       |
| Project knowledge | Project memory with CLAUDE.md       | Advantage: discovers and merges CLAUDE.md + .cursorrules + GEMINI.md + more |
| Artifacts         | Code, document, and app artifacts   | Parity: full artifact system with versioning and canvas                     |
| Extended thinking | Claude-specific thinking blocks     | Parity: provider-agnostic thinking mode normalization                       |
| Computer use      | Beta computer use (limited)         | Advantage: full OPA loop + AXUIElement + vision + action recording          |

### 13.1.2 Features Claude Desktop Lacks

| Missing Feature        | AGI Workforce Advantage                                    |
| ---------------------- | ---------------------------------------------------------- |
| Multi-model            | AGI Workforce: 9+ cloud providers + unlimited local models |
| Background agents      | No persistent background execution in Claude Desktop       |
| Multi-agent swarm      | No parallel agent orchestration                            |
| Voice I/O              | No voice input or text-to-speech                           |
| Terminal integration   | No embedded terminal                                       |
| Email/Calendar         | No email or calendar features                              |
| Browser automation     | No CDP/extension bridge                                    |
| Scheduling             | No cron-based task scheduling                              |
| Analytics/ROI          | No usage analytics or cost tracking dashboard              |
| Offline mode           | Requires internet connection                               |
| Custom model endpoints | Cannot connect to Ollama or custom API endpoints           |
| Mobile companion       | Remote control limited to Max tier ($200/month)            |
| Universal binary       | Apple Silicon only; Intel Macs require Rosetta             |

### 13.1.3 Strategic Assessment

Claude Desktop is the closest competitor in the macOS AI desktop space. Its MCP ecosystem is growing and its chat experience is polished. AGI Workforce differentiates through multi-model support, full desktop autonomy, background agents, and a breadth of integrations that Claude Desktop does not attempt. The risk is that Anthropic rapidly expands Claude Desktop features; the defense is that multi-model support and local model privacy are structural advantages that a single-vendor product cannot match.

## 13.2 Claude Code (Cowork)

**Current version**: Anthropic's VM-based agent system
**Architecture**: Cloud VM with browser-based access
**Model access**: Claude models only

### 13.2.1 Features Claude Cowork Has

| Feature              | Cowork                         | AGI Workforce Comparison                          |
| -------------------- | ------------------------------ | ------------------------------------------------- |
| VM-based execution   | Full Linux VM with sudo access | AGI Workforce: runs on user's Mac, not a cloud VM |
| Background execution | Runs for hours in cloud VM     | Parity: background agents run locally             |
| Git operations       | Full git in VM                 | Parity: full git via libgit2                      |
| Code execution       | Full sandbox in VM             | Parity: code sandbox with ToolGuard               |

### 13.2.2 Where AGI Workforce Leads Over Cowork

| Advantage             | Detail                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop integration   | Cowork runs in a cloud VM disconnected from user's local environment; AGI Workforce runs natively on the user's Mac with access to all local files, applications, and configurations |
| Multi-model           | Cowork uses Claude only; AGI Workforce uses any model                                                                                                                                |
| Cost                  | Cowork requires Claude Max plan; AGI Workforce supports free local models                                                                                                            |
| Privacy               | Cowork runs code on Anthropic's servers; AGI Workforce keeps everything local                                                                                                        |
| Latency               | Cowork has VM spin-up latency; AGI Workforce starts instantly                                                                                                                        |
| macOS native features | Cowork has no access to AXUIElement, Keychain, Finder, or macOS apps                                                                                                                 |

## 13.3 ChatGPT Desktop (macOS)

**Current version**: ChatGPT for macOS (OpenAI)
**Architecture**: Electron-based desktop app
**Model access**: OpenAI models only (GPT-4o, GPT-5, o-series)

### 13.3.1 Comparison

| Feature  | ChatGPT Desktop                 | AGI Workforce                        |
| -------- | ------------------------------- | ------------------------------------ |
| Models   | OpenAI only                     | 9+ providers + local                 |
| Chat     | Full streaming                  | Full streaming + branching           |
| Voice    | Voice mode (limited)            | Full STT/TTS/VAD/wake word           |
| Vision   | Screenshot + camera             | Screenshot + AXUIElement + OPA loop  |
| Tools    | Limited built-in                | Unlimited MCP + 17 executors         |
| Agents   | Operator (web only, supervised) | Full autonomous + background + swarm |
| Terminal | None                            | Full PTY + AI assist                 |
| Code     | None                            | Diff-based editing + Monaco          |
| Memory   | Conversation memory             | Persistent + semantic + project      |
| Offline  | None                            | Full with local models               |

### 13.3.2 Where AGI Workforce Leads

ChatGPT Desktop is a simple chat client with limited tool support. It has no agent mode, no background execution, no MCP tools, no terminal, no code editing, and no offline capability. AGI Workforce is a fundamentally more capable product targeting power users and developers, while ChatGPT Desktop targets casual conversational use.

## 13.4 Cursor (macOS)

**Current version**: Cursor IDE
**Architecture**: Electron-based (VS Code fork)
**Model access**: Multi-model (Claude, GPT, Gemini, local)

### 13.4.1 Comparison

| Feature           | Cursor                        | AGI Workforce                        |
| ----------------- | ----------------------------- | ------------------------------------ |
| Models            | Multi-model                   | Multi-model (more providers, no cap) |
| Chat              | Inline + sidebar              | Full chat + branching + canvas       |
| Agent mode        | Composer agent (code-focused) | General-purpose autonomous agent     |
| MCP tools         | 40-tool cap                   | Unlimited                            |
| Computer use      | None                          | Full OPA + AXUIElement               |
| Terminal          | Integrated                    | Full PTY + AI assist                 |
| Code editing      | Full IDE                      | Diff-based (not IDE-level)           |
| Non-code tasks    | None                          | 140+ skills across 9 domains         |
| Voice             | None                          | Full STT/TTS                         |
| Background agents | None                          | Persistent background execution      |
| Research          | None                          | Multi-source with citations          |
| Email/Calendar    | None                          | Full integrations                    |

### 13.4.2 Strategic Assessment

Cursor is the best code-focused AI tool but is limited to software development. AGI Workforce targets a broader audience with general-purpose AI automation. For pure code editing, Cursor is superior. For everything else (email, calendar, browser automation, document processing, research, scheduling, computer use), AGI Workforce wins. The products are complementary rather than directly competitive for developer users, but AGI Workforce's code editing features aim to be sufficient that many users may not need both.

## 13.5 Perplexity Computer (macOS)

**Current version**: Perplexity Computer (early access)
**Architecture**: Desktop app with connector ecosystem

### 13.5.1 Comparison

| Feature         | Perplexity Computer                     | AGI Workforce                                |
| --------------- | --------------------------------------- | -------------------------------------------- |
| Search/Research | Core competency — deep web search       | Strong: multi-source research with citations |
| Connectors      | Growing ecosystem (Google, Slack, etc.) | MCP: extensible protocol, unlimited servers  |
| Models          | Perplexity models + some routing        | 9+ providers + local                         |
| Desktop control | Limited computer use                    | Full AXUIElement + OPA loop                  |
| Privacy         | Cloud-only                              | Local-first, offline-capable                 |
| Voice           | None                                    | Full STT/TTS                                 |
| Agents          | No autonomous agents                    | Full autonomous + background + swarm         |

### 13.5.2 Competitive Positioning

Perplexity Computer's connector ecosystem is inspiring but proprietary. AGI Workforce's MCP-based approach is more open and extensible. Perplexity's search capabilities are best-in-class; AGI Workforce matches this with research mode that can use multiple search providers. The key differentiator is AGI Workforce's local-first architecture and full desktop autonomy, which Perplexity Computer does not offer.

## 13.6 Summary Competitive Matrix

| Capability           | AGI Workforce    | Claude Desktop | Claude Cowork | ChatGPT | Cursor   | Perplexity |
| -------------------- | ---------------- | -------------- | ------------- | ------- | -------- | ---------- |
| Multi-model          | **9+ providers** | No             | No            | No      | Limited  | No         |
| Local models         | **Full**         | No             | No            | No      | Some     | No         |
| Desktop autonomy     | **Full**         | Limited        | VM only       | No      | No       | Limited    |
| Background agents    | **Yes**          | No             | Yes (VM)      | No      | No       | No         |
| Multi-agent swarm    | **100 agents**   | No             | No            | No      | No       | No         |
| MCP tools            | **Unlimited**    | Limited        | No            | No      | 40 cap   | No         |
| Voice I/O            | **Full**         | No             | No            | Limited | No       | No         |
| Computer use         | **Full**         | Beta           | VM            | No      | No       | Limited    |
| Research             | **Deep**         | No             | No            | Browse  | No       | **Best**   |
| Code editing         | Good             | No             | VM            | No      | **Best** | No         |
| 140+ non-code skills | **Yes**          | No             | No            | No      | No       | No         |
| Mobile companion     | **Yes**          | Max only       | No            | No      | No       | No         |
| Offline              | **Full**         | No             | No            | No      | Partial  | No         |
| Universal binary     | **Yes**          | No             | N/A           | No      | No       | Unknown    |
| Security (ToolGuard) | **Enterprise**   | Basic          | Basic         | Basic   | None     | Basic      |

## 13.7 Competitive UI Pattern Analysis

### 13.7.1 Chat Interface Patterns

| Pattern                | Claude Desktop                               | ChatGPT Desktop                    | AGI Workforce                                                                               |
| ---------------------- | -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **Message layout**     | Clean, spacious bubbles with thinking blocks | Compact messages with suggestions  | Rich messages with tool timeline, reasoning accordion, citations, artifact renderers        |
| **Model indicator**    | Fixed (Claude only)                          | Fixed (GPT only)                   | Per-message model badge; switchable mid-conversation                                        |
| **Streaming**          | Character-level streaming                    | Word-level streaming               | Token-level streaming with real-time cost counter                                           |
| **Code blocks**        | Syntax highlighting + copy                   | Syntax highlighting + copy + apply | Syntax highlighting + copy + language badge + line numbers + inline diff view               |
| **Artifacts**          | Side panel with versioned artifacts          | Canvas for longer documents        | Inline artifact renderer with versioning + sidecar + canvas workspace                       |
| **Tool visibility**    | Minimal (tool name only)                     | None                               | Claude Code-style timeline: `Read(file)`, `Bash(cmd)` with duration, status, expand         |
| **Thinking/reasoning** | Collapsible thinking block                   | Not exposed                        | Collapsible ReasoningAccordion with monospace thinking text                                 |
| **Input area**         | Simple text + attachment                     | Text + attachment + voice          | Text + attachment + voice + 6 toolbar toggles + slash commands + file mentions + ghost text |

### 13.7.2 Settings and Configuration Patterns

| Pattern            | Competitors               | AGI Workforce Approach                                                                 |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------- |
| API key management | Built-in (no user keys)   | Full BYOK with SecretManager encryption, per-provider test buttons, masked preview     |
| Model selection    | Fixed or limited dropdown | Full catalog with provider grouping, favorites, custom endpoints, capability detection |
| Tool configuration | Limited or none           | MCP server manager with health monitoring, per-tool enable/disable, circuit breaker    |
| Safety controls    | Black box                 | Transparent ToolGuard with configurable safety levels, audit log, trusted workflows    |
| Approval flow      | Implicit (operator model) | Explicit 3-tier approval (Ask/AutoReadOnly/AutoAll) with workflow trust hashing        |

### 13.7.3 Navigation Patterns

| Pattern           | Competitors               | AGI Workforce Approach                                                                  |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Conversation list | Simple chronological list | Virtualized list with search (Fuse.js), pin/archive, context menu, project grouping     |
| Command palette   | Not available             | Full Cmd+K palette with fuzzy search across commands, conversations, models, navigation |
| Quick access      | None                      | Option+Space global Quick Query overlay (Spotlight-style)                               |
| Sidebar           | Basic conversation list   | Collapsible sidebar with quick actions, user profile, subscription badge                |

## 13.8 Strategic Gaps to Own

### 13.8.1 Gaps Where AGI Workforce Already Leads

| Gap                         | Current Advantage                                    | Defense Strategy                                            |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Multi-model with native GUI | Only product combining 9+ providers + native desktop | Continue adding providers day-one; local model parity       |
| Mobile companion            | QR-pair with live dashboard                          | Ship iOS/Android apps before competitors add mobile         |
| Non-code AI skills          | 140+ skills across 9 domains                         | Rapidly expand skill library; community skill contributions |
| MCP without limits          | Unlimited tools, 3 transports                        | Stay ahead of MCP spec evolution; contribute to protocol    |
| Local-first privacy         | Full offline mode with local models                  | Deepen local model support; on-device embeddings            |

### 13.8.2 Gaps Where Parity is Needed

| Gap                          | Current Status                          | Action Required                                              |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Claude Desktop MCP ecosystem | Growing 3rd-party server ecosystem      | Create MCP server directory; one-click install               |
| ChatGPT voice mode quality   | GPT-4o real-time voice is best-in-class | Improve Whisper + Piper quality; add streaming TTS           |
| Cursor code editing          | Full IDE with git integration           | Not attempting IDE parity; focus on agent-first code editing |
| Perplexity search depth      | Best-in-class web search                | Enhance research mode with more search providers             |

### 13.8.3 Gaps to Own (Uncontested)

| Opportunity                              | Status                          | Competitor Coverage                                       |
| ---------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| Desktop automation + AI agent            | Implemented (AXUIElement + OPA) | No competitor has full desktop automation inside AI agent |
| Scheduled autonomous tasks               | Implemented (cron + interval)   | No competitor offers cron-scheduled AI tasks              |
| Multi-agent swarm (100)                  | Implemented                     | No competitor offers parallel multi-agent orchestration   |
| Enterprise governance dashboard          | Implemented                     | No competitor offers ToolGuard-level governance           |
| Cross-platform agent monitoring (mobile) | In development                  | Claude offers Max-tier remote only ($200/mo)              |

## 13.9 Market Positioning Statement

AGI Workforce for macOS occupies a unique position at the intersection of three capabilities that no single competitor offers simultaneously:

1. **Native desktop application** with full macOS integration (Keychain, AXUIElement, global shortcuts, system tray, notifications, universal binary)
2. **Model-agnostic AI agent platform** supporting every major LLM provider plus local models, with autonomous execution, background agents, and swarm orchestration
3. **140+ non-coding AI skills** across healthcare, legal, finance, education, creative, trades, and e-commerce — targeting knowledge workers, not just developers

The closest competitor combination that matches this breadth would require using Claude Desktop (MCP tools, chat) + Cursor (multi-model code editing) + a separate automation tool (Keyboard Maestro, BetterTouchTool) + separate scheduling (cron, Shortcuts) — four separate products versus one unified platform.

---

# Appendix A: Glossary

| Term         | Definition                                                                |
| ------------ | ------------------------------------------------------------------------- |
| AGI          | Artificial General Intelligence — used as brand name, not technical claim |
| AXUIElement  | macOS accessibility API for UI element inspection                         |
| CDP          | Chrome DevTools Protocol — browser automation wire protocol               |
| CGEventTap   | macOS API for intercepting keyboard/mouse events globally                 |
| DMG          | Disk Image — macOS application distribution format                        |
| HKDF         | HMAC-based Key Derivation Function                                        |
| LLM          | Large Language Model                                                      |
| MCP          | Model Context Protocol — Anthropic's open standard for tool integration   |
| NSStatusItem | macOS API for menu bar tray icons                                         |
| OPA          | Observe-Plan-Act — computer use automation loop                           |
| PTY          | Pseudo-Terminal — terminal emulation interface                            |
| RAG          | Retrieval-Augmented Generation                                            |
| SQLCipher    | Encrypted SQLite variant                                                  |
| SSE          | Server-Sent Events — streaming protocol                                   |
| STT          | Speech-to-Text                                                            |
| TTS          | Text-to-Speech                                                            |
| VAD          | Voice Activity Detection                                                  |

---

# Appendix B: File Reference

| File                                                                     | Purpose                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `apps/desktop/src-tauri/src/lib.rs`                                      | Tauri app builder, plugin registration, all managed state initialization |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs`                      | LLM routing engine (2,274 lines)                                         |
| `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`                      | SSE stream parser for all providers                                      |
| `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`                | Provider-specific API format mapping                                     |
| `apps/desktop/src-tauri/src/core/agent/autonomous.rs`                    | Autonomous agent execution loop                                          |
| `apps/desktop/src-tauri/src/core/agent/background_agent.rs`              | Background agent manager                                                 |
| `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs`                  | Multi-agent swarm coordinator                                            |
| `apps/desktop/src-tauri/src/core/mcp/manager.rs`                         | MCP server lifecycle manager                                             |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`                  | Tool execution sandboxing (1,778 lines)                                  |
| `apps/desktop/src-tauri/src/sys/security/secret_manager.rs`              | Encrypted secret storage                                                 |
| `apps/desktop/src-tauri/src/automation/computer_use/observe_plan_act.rs` | OPA loop for computer use                                                |
| `apps/desktop/src-tauri/src/features/speech/`                            | Voice input/output modules                                               |
| `apps/desktop/src-tauri/src/ui/tray.rs`                                  | System tray icon and menu                                                |
| `apps/desktop/src-tauri/Cargo.toml`                                      | Rust dependencies and feature flags                                      |
| `apps/desktop/package.json`                                              | Frontend dependencies and scripts                                        |
| `apps/desktop/src/components/UnifiedAgenticChat/`                        | Main chat interface (80+ files)                                          |
| `apps/desktop/src/components/Settings/`                                  | Settings panel (30+ files)                                               |
| `apps/desktop/src/stores/`                                               | Zustand stores (60+ files)                                               |
| `apps/desktop/src/hooks/`                                                | React hooks (50+ files)                                                  |
| `apps/desktop/src/constants/llm.ts`                                      | TypeScript model catalog                                                 |

---

# Appendix C: Tauri IPC Contract

## C.1 Parameter Name Convention

**Critical rule**: All `invoke()` calls in TypeScript MUST use camelCase parameter keys. Tauri's serde deserialization automatically converts camelCase to snake_case for Rust. Using snake_case in TypeScript `invoke()` will silently fail — parameters arrive as `undefined` in Rust.

**Example (correct)**:

```typescript
// TypeScript invoke — MUST use camelCase
invoke('scheduler_add_job', {
  name: 'Daily report',
  actionType: 'agent', // camelCase (maps to action_type in Rust)
  actionData: { goal: '...' }, // camelCase (maps to action_data in Rust)
});
```

**Example (incorrect — will silently fail)**:

```typescript
// WRONG — snake_case params arrive as undefined in Rust
invoke('scheduler_add_job', {
  name: 'Daily report',
  action_type: 'agent',  // !! snake_case — BREAKS silently
  action_data: { ... },   // !! snake_case — BREAKS silently
});
```

## C.2 Model ID Format Convention

Model IDs use **hyphens** (matching API conventions): `claude-opus-4-6`, `claude-sonnet-4-5`.

Never use dots in model IDs: `claude-opus-4.6` is incorrect. The model catalog's `canonicalization` map in `models.json` handles conversion if a dot-format is received from user input.

## C.3 Event Channel Contract

All Tauri event channels use the format `category:event-name`:

| Channel                    | Direction       | Payload Type                                     | Description                       |
| -------------------------- | --------------- | ------------------------------------------------ | --------------------------------- |
| `tool:event`               | Rust → Frontend | `ToolEventPayload`                               | Tool execution lifecycle events   |
| `agentic:loop-started`     | Rust → Frontend | `{ conversation_id, max_iterations }`            | Agent loop begins                 |
| `agentic:loop-status`      | Rust → Frontend | `{ conversation_id, iteration, max_iterations }` | Agent loop progress               |
| `agentic:loop-ended`       | Rust → Frontend | `{ conversation_id, iterations_used }`           | Agent loop completes              |
| `agentic:message-consumed` | Rust → Frontend | `{ pending_message: { id } }`                    | Pending message consumed by agent |
| `chat:stream-chunk`        | Rust → Frontend | `{ conversation_id, content, done }`             | SSE stream token chunk            |
| `chat:stream-error`        | Rust → Frontend | `{ conversation_id, error }`                     | SSE stream error                  |
| `notification:new`         | Rust → Frontend | `{ title, body, type }`                          | System notification               |
| `file:changed`             | Rust → Frontend | `{ path, event }`                                | File watcher event                |
| `extension:event`          | Rust → Frontend | `{ type, data }`                                 | Chrome extension bridge event     |
| `automation:status`        | Rust → Frontend | `{ status, step, screenshot? }`                  | Computer use status               |
| `automation:screenshot`    | Rust → Frontend | `{ imageBase64, timestamp }`                     | New screenshot captured           |

---

# Appendix D: Subscription Tiers

## D.1 Tier Features Matrix

| Feature                | Free           | Hobby ($9/mo) | Pro ($29/mo) | Max ($99/mo)        | Team ($49/seat/mo) | Enterprise (Custom) |
| ---------------------- | -------------- | ------------- | ------------ | ------------------- | ------------------ | ------------------- |
| Cloud LLM messages/day | 25             | 100           | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Local model usage      | Unlimited      | Unlimited     | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Background agents      | 1              | 3             | 10           | 20                  | 20                 | Unlimited           |
| Concurrent sub-agents  | 1              | 3             | 10           | 100                 | 50                 | Unlimited           |
| MCP servers            | 3              | 10            | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Conversation history   | 30 days        | 1 year        | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Voice input            | 10 min/day     | 60 min/day    | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Research depth         | Quick only     | Standard      | Deep         | Exhaustive          | Exhaustive         | Exhaustive          |
| Computer use           | 10 actions/day | 100           | Unlimited    | Unlimited           | Unlimited          | Unlimited           |
| Cloud sync             | No             | Basic         | Full         | Full                | Full               | Full + SSO          |
| Mobile companion       | No             | No            | Yes          | Yes                 | Yes                | Yes                 |
| Custom skills          | No             | Yes           | Yes          | Yes                 | Yes                | Yes + custom        |
| Team management        | No             | No            | No           | No                  | Yes                | Yes + roles         |
| Audit log              | 7 days         | 30 days       | 90 days      | 90 days             | 1 year             | Unlimited           |
| Priority support       | No             | Email         | Email + chat | Email + chat + call | Dedicated          | Dedicated + SLA     |

## D.2 Subscription Gate Implementation

Features are gated via `SubscriptionGateResult` checks in the frontend:

```typescript
type SubscriptionGateResult = {
  allowed: boolean;
  reason?: string;
  requiredTier?: SubscriptionTier;
  upgradeUrl?: string;
};
```

When a gated feature is accessed:

1. `subscriptionGate(feature)` checks current tier
2. If `allowed: false`, `SubscriptionLockDialog` appears
3. Dialog shows: feature name, required tier, "Upgrade" button, "Cancel" button
4. "Upgrade" opens Stripe checkout or billing portal

---

# Appendix E: Error Handling Matrix

## E.1 Error Categories and User-Facing Messages

All errors are translated through the FriendlyError system to ensure NN-01 compliance (zero raw error messages to users).

| Error Source | Internal Error                  | User-Facing Message                                                                                                    | Recovery Action               |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| LLM Provider | `ECONNREFUSED`                  | "Could not connect to [provider]. Check your internet connection."                                                     | Retry button                  |
| LLM Provider | `401 Unauthorized`              | "Your [provider] API key was rejected. Please check Settings > API Keys."                                              | Link to API Keys settings     |
| LLM Provider | `429 Rate Limited`              | "You've hit the rate limit for [provider]. Retrying automatically..."                                                  | Auto-retry with backoff       |
| LLM Provider | `500 Server Error`              | "[Provider] is experiencing issues. Try again or switch to a different model."                                         | Retry + model switch link     |
| LLM Provider | `context_length_exceeded`       | "Your conversation is too long for [model]. Try compacting the context or using a model with a larger context window." | Compact button + model switch |
| LLM Provider | `content_filter`                | "The AI provider flagged this content. Try rephrasing your request."                                                   | None (user rephrases)         |
| LLM Router   | `no_provider_available`         | "No AI providers are available. Check your API keys in Settings."                                                      | Link to API Keys settings     |
| LLM Router   | `all_providers_circuit_open`    | "All providers are temporarily unavailable. Retrying in 30 seconds..."                                                 | Auto-retry                    |
| Streaming    | `stream_watchdog_timeout`       | (silent recovery — session restarts automatically, NN-02)                                                              | Automatic silent recovery     |
| Streaming    | `stream_parse_error`            | "Received an unexpected response. Retrying..."                                                                         | Auto-retry                    |
| MCP          | `server_connect_failed`         | "Could not connect to MCP server '[name]'. Check its configuration."                                                   | Link to MCP settings          |
| MCP          | `tool_execution_failed`         | "Tool '[name]' failed: [friendly summary]. The agent will try an alternative approach."                                | Agent replans                 |
| File System  | `EACCES`                        | "Permission denied for '[path]'. Check file permissions or grant Full Disk Access."                                    | System Settings link          |
| File System  | `ENOENT`                        | "File not found: '[path]'."                                                                                            | None                          |
| File System  | `ENOSPC`                        | "Disk space is low. Free up space to continue."                                                                        | None                          |
| Database     | `SQLITE_CORRUPT`                | "Your local database may be corrupted. AGI Workforce will attempt to repair it."                                       | Auto-repair from backup       |
| Voice        | `mic_not_available`             | "Microphone not available. Check System Settings > Privacy > Microphone."                                              | System Settings link          |
| Voice        | `transcription_failed`          | "Could not transcribe audio. Try speaking more clearly or check your STT settings."                                    | Link to Voice settings        |
| Auth         | `session_expired`               | "Your session has expired. Please sign in again."                                                                      | Sign in button                |
| Auth         | `account_deactivated`           | "Your account has been deactivated. Contact support for assistance."                                                   | Support link                  |
| Billing      | `credits_exhausted`             | "You've used all your credits for today. Credits reset at midnight UTC, or upgrade your plan for more."                | Upgrade button                |
| Billing      | `subscription_expired`          | "Your subscription has expired. Renew to continue using premium features."                                             | Renew button                  |
| Update       | `update_download_failed`        | "Could not download the update. It will retry automatically later."                                                    | None (auto-retry)             |
| Update       | `signature_verification_failed` | "Update verification failed. The update will not be installed for security reasons."                                   | None                          |
| General      | Any unmatched                   | "Something went wrong. Please try again."                                                                              | Retry button                  |

## E.2 Error Recovery Strategies

| Strategy                            | Implementation                                          | When Used                                           |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Auto-retry with exponential backoff | `reqwest-retry` middleware                              | Network errors, rate limits, 5xx errors             |
| Provider failover                   | Circuit breaker opens → routes to next provider         | Provider outages                                    |
| Context compaction                  | Auto-compact when context > 80% capacity                | Context overflow                                    |
| Silent session recovery             | Watchdog timeout → restart SSE connection               | Stream stalls (NN-02)                               |
| Agent replan                        | Denied tool → agent receives denial → plans alternative | Approval rejection                                  |
| Graceful degradation                | Feature disabled but app continues                      | Optional feature unavailable (e.g., OCR, local LLM) |
| Backup restoration                  | SQLCipher backup restored on corruption detection       | Database corruption                                 |
| Cache invalidation                  | LRU cache evicted on provider error                     | Stale cache entries                                 |

---

# Appendix F: Internationalization (i18n)

## F.1 Supported Languages

| Language             | Code    | Status  | Coverage            |
| -------------------- | ------- | ------- | ------------------- |
| English (US)         | `en-US` | Default | 100%                |
| Spanish              | `es`    | Planned | 0% (v2.0 milestone) |
| French               | `fr`    | Planned | 0% (v2.0 milestone) |
| German               | `de`    | Planned | 0% (v2.0 milestone) |
| Japanese             | `ja`    | Planned | 0% (v2.0 milestone) |
| Chinese (Simplified) | `zh-CN` | Planned | 0% (v2.0 milestone) |
| Portuguese (BR)      | `pt-BR` | Planned | 0% (v2.0 milestone) |
| Korean               | `ko`    | Planned | 0% (v2.0 milestone) |

## F.2 i18n Implementation

**Framework**: i18next + react-i18next + i18next-browser-languagedetector

**Key design decisions**:

- All user-facing strings extracted to JSON translation files
- Error messages go through FriendlyError system (translatable)
- Date/time formatting via `date-fns` locale system
- Number formatting via `Intl.NumberFormat`
- RTL support deferred (no Arabic/Hebrew planned for v1.x)
- LLM model names and technical terms are not translated (kept in English)

---

# Appendix G: Deep Link URL Scheme

## G.1 URL Scheme

**Scheme**: `agiworkforce://`

**Supported paths**:

| Path                           | Parameters         | Action                                                   |
| ------------------------------ | ------------------ | -------------------------------------------------------- |
| `agiworkforce://chat`          | `conversationId`   | Open conversation in chat view                           |
| `agiworkforce://chat/new`      | `model`, `message` | Create new conversation with optional pre-filled message |
| `agiworkforce://settings`      | `tab`              | Open settings at specified tab                           |
| `agiworkforce://auth/callback` | `code`, `state`    | OAuth callback handler                                   |
| `agiworkforce://pair`          | `code`, `deviceId` | Mobile device pairing                                    |
| `agiworkforce://update`        | `version`          | Trigger update check for specific version                |

**Security**:

- Only parameters in `ALLOWED_DEEP_LINK_PARAMS` allowlist are accepted
- Scheme validated (must be `agiworkforce://`)
- Tokens and sensitive data are redacted from logs
- No arbitrary code execution via deep links

---

# Appendix H: Keyboard Shortcut Reference Card

## H.1 Complete Shortcut Map

### Global Shortcuts (work when app is not focused, require Accessibility permission)

| Shortcut       | Action                                              |
| -------------- | --------------------------------------------------- |
| `Option+Space` | Quick Query overlay                                 |
| `Cmd+Shift+V`  | Voice input (hold to record, release to transcribe) |

### Application Shortcuts (work when app is focused)

**Window Management**:

| Shortcut      | Action                                        |
| ------------- | --------------------------------------------- |
| `Cmd+Q`       | Quit application                              |
| `Cmd+W`       | Close window (minimize to tray if configured) |
| `Cmd+M`       | Minimize to dock                              |
| `Cmd+H`       | Hide application                              |
| `Cmd+Ctrl+F`  | Toggle fullscreen                             |
| `Cmd+Shift+F` | Toggle floating mode                          |
| `Cmd+,`       | Open Settings                                 |
| `Cmd+/`       | Toggle sidebar                                |

**Chat**:

| Shortcut                | Action                       |
| ----------------------- | ---------------------------- |
| `Cmd+N`                 | New conversation             |
| `Cmd+T`                 | New conversation (alternate) |
| `Cmd+Enter`             | Send message                 |
| `Cmd+Shift+Enter`       | Send with agent mode         |
| `Cmd+.`                 | Stop generation              |
| `Cmd+F`                 | Search conversations         |
| `Cmd+K`                 | Command palette              |
| `Cmd+Up`                | Previous conversation        |
| `Cmd+Down`              | Next conversation            |
| `Cmd+1` through `Cmd+9` | Switch to conversation 1-9   |

**Editing**:

| Shortcut      | Action     |
| ------------- | ---------- |
| `Cmd+Z`       | Undo       |
| `Cmd+Shift+Z` | Redo       |
| `Cmd+C`       | Copy       |
| `Cmd+V`       | Paste      |
| `Cmd+A`       | Select all |
| `Cmd+X`       | Cut        |

**Tools & Features**:

| Shortcut      | Action               |
| ------------- | -------------------- |
| `Cmd+Shift+S` | Screen capture       |
| `Cmd+Shift+T` | Open terminal        |
| `Cmd+Shift+R` | Research mode        |
| `Cmd+Shift+M` | Change model         |
| `Cmd+Shift+A` | Toggle agent mode    |
| `Cmd+Shift+C` | Canvas view          |
| `Cmd+Shift+B` | Background tasks     |
| `Cmd+Shift+G` | Governance dashboard |

**Command Palette**:

| Shortcut        | Action                   |
| --------------- | ------------------------ |
| `Arrow Up/Down` | Navigate results         |
| `Enter`         | Execute selected action  |
| `Escape`        | Close palette            |
| `Cmd+K`         | Re-open palette (toggle) |

**Approval Dialog**:

| Shortcut               | Action                |
| ---------------------- | --------------------- |
| `Enter` or `Cmd+Enter` | Approve               |
| `Escape`               | Deny                  |
| `Tab`                  | Cycle between buttons |

**Terminal (when focused)**:

| Shortcut | Action                                 |
| -------- | -------------------------------------- |
| `Cmd+C`  | Copy selected text (not Ctrl+C signal) |
| `Cmd+V`  | Paste into terminal                    |
| `Ctrl+C` | Send SIGINT to process                 |
| `Ctrl+D` | Send EOF                               |
| `Ctrl+L` | Clear terminal                         |

---

# Appendix I: Complete Rust Module Structure

The Rust backend (`apps/desktop/src-tauri/src/`) is organized into six top-level modules plus the entry points. This appendix documents the full module tree for developer reference.

## I.1 Entry Points

| File       | Purpose                  | Key Functions                                                                 |
| ---------- | ------------------------ | ----------------------------------------------------------------------------- |
| `main.rs`  | Application entry point  | Calls `lib::run()`                                                            |
| `lib.rs`   | Tauri app builder        | Registers all plugins, managed state, and IPC command handlers (865 commands) |
| `state.rs` | Global `AppState` struct | Contains all managed state containers, passed to Tauri via `app.manage()`     |

## I.2 Core Module (`core/`)

The intelligence layer containing all AI, agent, and LLM functionality.

### `core/llm/` — LLM Routing and Providers

| File                      | Lines (approx.) | Purpose                                                                           |
| ------------------------- | --------------- | --------------------------------------------------------------------------------- |
| `llm_router.rs`           | 2,274           | LLM request routing, model selection, circuit breaker, fallback logic             |
| `sse_parser.rs`           | ~600            | SSE stream parser for all provider formats (Anthropic, OpenAI, Gemini, Ollama)    |
| `provider_adapter.rs`     | ~1,200          | Maps provider-specific API formats (auth headers, request body, response parsing) |
| `capability_detection.rs` | ~300            | Ollama/local LLM capability probing via `/api/show`; detects tool support         |
| `cost_calculator.rs`      | ~200            | Per-token cost calculation using model catalog pricing                            |
| `token_counter.rs`        | ~150            | Pre-flight token counting via `tiktoken-rs`                                       |
| `cache.rs`                | ~250            | LRU response cache (512 entries, 24h TTL)                                         |
| `types.rs`                | ~300            | Shared LLM types (LlmRequest, LlmResponse, ModelInfo, etc.)                       |

### `core/agent/` — Agent Runtime

| File                  | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `runtime.rs`          | AgentRuntime — manages agent lifecycle (start, pause, resume, cancel)          |
| `planner.rs`          | TaskPlanner — recursive goal decomposition into step sequences                 |
| `executor.rs`         | Step executor — runs individual steps (tool calls, LLM queries, observations)  |
| `autonomous.rs`       | Autonomous execution loop (plan → execute → observe → reflect → loop)          |
| `background_agent.rs` | Background agent manager — detached tasks, checkpointing, resource management  |
| `vision.rs`           | Vision-guided agent capabilities (screenshot analysis, element identification) |
| `rag.rs`              | RAG pipeline integration — retrieves context from workspace embeddings         |
| `reflection.rs`       | Self-reflection module — evaluates progress, adjusts plans                     |
| `types.rs`            | Agent types (AgentTask, AgentStep, AgentConfig, AgentStatus)                   |

### `core/swarm/` — Multi-Agent Orchestration

| File              | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `orchestrator.rs` | Swarm coordinator — decomposes goals, spawns agents, collects results  |
| `task_graph.rs`   | Dependency graph for sub-tasks (topological sort, parallel scheduling) |
| `agent_pool.rs`   | Agent pool management (spawn, reclaim, resource limits)                |
| `types.rs`        | Swarm types (SwarmConfig, SwarmAgent, SwarmStatus)                     |

### `core/mcp/` — Model Context Protocol

| File                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `manager.rs`         | MCP server lifecycle manager (connect, disconnect, health check)    |
| `transport_stdio.rs` | stdio transport (child process, stdin/stdout JSON-RPC)              |
| `transport_sse.rs`   | SSE transport (HTTP SSE stream, POST requests)                      |
| `transport_http.rs`  | Streamable HTTP transport (HTTP POST, streaming response)           |
| `tool_registry.rs`   | Global tool registry (auto-discovery, schema caching, dedup)        |
| `circuit_breaker.rs` | Per-server circuit breaker (Closed → Open → HalfOpen, 30s cooldown) |
| `types.rs`           | MCP types (McpServer, McpTool, McpConfig, CircuitBreakerState)      |

### `core/agi/` — AGI Orchestration

| File                         | Purpose                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `conversation_summarizer.rs` | Context compaction and memory extraction via `HttpSummaryLLM`                       |
| `executors/`                 | 17 domain-specific executors (mcp_executor, file_executor, terminal_executor, etc.) |
| `templates/`                 | Goal templates for common tasks (code review, document analysis, etc.)              |

### Other `core/` Modules

| Module                | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `core/embeddings/`    | Embedding generation and vector storage (Ollama → OpenAI → None fallback)  |
| `core/research/`      | Multi-source web research pipeline (search, fetch, analyze, report)        |
| `core/scheduler/`     | Task scheduling engine (cron parser, interval timer, NLP date parsing)     |
| `core/skills/`        | Skill file loader (SKILL.md format), trigger detection, skill registry     |
| `core/intent/`        | Intent classifier (pattern matching + optional LLM classification)         |
| `core/artifacts/`     | Artifact versioning (code, document, image artifacts with version history) |
| `core/orchestration/` | Workflow engine (workflow definitions, executor, scheduler)                |

## I.3 System Module (`sys/`)

System services, Tauri command handlers, and platform integration.

### `sys/commands/` — Tauri IPC Command Handlers

All `#[tauri::command]` functions are defined here and registered in `lib.rs`.

| Subdirectory             | Command Count (approx.) | Purpose                                                           |
| ------------------------ | ----------------------- | ----------------------------------------------------------------- |
| `chat/`                  | 26                      | Chat message, conversation, streaming, export, search, compaction |
| `agi.rs`                 | 15                      | Goal submission, status, pause/resume, reflection                 |
| `agent.rs`               | 8                       | Agent approval, workflow hash, trusted workflows                  |
| `background_agent.rs`    | 5                       | Background agent list, pause, resume, cancel, takeover            |
| `mcp.rs`                 | 10                      | MCP server management, tool execution, health checks              |
| `scheduler.rs`           | 8                       | Job creation, listing, toggle, run-now, execution history         |
| `voice.rs`               | 6                       | Recording, transcription, TTS, VAD, device listing                |
| `automation.rs`          | 12                      | Screen capture, input simulation, window listing, OCR             |
| `settings.rs`            | 8                       | Get/update settings, theme, language, startup behavior            |
| `security.rs`            | 10                      | Secret store/get/delete, master password, key management          |
| `file.rs`                | 10                      | File CRUD, directory listing, search, watch                       |
| `terminal.rs`            | 7                       | PTY session management, command execution                         |
| `git.rs`                 | 12                      | Full git workflow (status, diff, commit, branch, push, pull)      |
| `document.rs`            | 7                       | PDF/DOCX/XLSX read and write                                      |
| `email.rs`               | 7                       | IMAP/SMTP, Gmail OAuth, send/receive                              |
| `database.rs`            | 5                       | Multi-database client (connect, query, describe)                  |
| `canvas.rs`              | 8                       | Canvas and artifact CRUD, version management                      |
| `research.rs`            | 6                       | Research start, status, sources, report, cancel                   |
| `swarm.rs`               | 4                       | Swarm start, status, cancel, list                                 |
| `window.rs`              | 7                       | Window state, always-on-top, floating mode, sidebar toggle        |
| `governance.rs`          | 6                       | Audit log, pending approvals, tool history, safety policies       |
| `memory.rs`              | 8                       | Memory store, search, list, delete, project memory                |
| `embeddings.rs`          | 3                       | Generate embeddings, similarity search                            |
| `skills.rs`              | 6                       | Skill listing, install, uninstall, trigger detection              |
| `workspace.rs`           | 5                       | Workspace indexing, project management                            |
| `ollama.rs`              | 4                       | Ollama detection, model listing, model pull                       |
| `custom_instructions.rs` | 4                       | Instruction file discovery, reading, merging                      |
| `updater.rs`             | 2                       | Check for update, install update                                  |
| `tool_confirmation.rs`   | 4                       | Tool approval/rejection, safety tier queries                      |
| `analytics.rs`           | 5                       | Usage tracking, cost analytics, ROI metrics                       |
| `billing.rs`             | 4                       | Subscription status, credit refresh, Stripe portal                |

### `sys/security/` — Security Layer

| File                | Lines (approx.) | Purpose                                                                  |
| ------------------- | --------------- | ------------------------------------------------------------------------ |
| `tool_guard.rs`     | 1,778           | Tool execution sandboxing — safety tiers, deny lists, trusted workflows  |
| `secret_manager.rs` | ~600            | Encrypted secret storage (Argon2id + AES-256-GCM + SQLCipher + Keychain) |
| `auth.rs`           | ~300            | Session management, JWT validation, Supabase integration                 |
| `rbac.rs`           | ~200            | Role-based access control for team features                              |
| `rate_limiter.rs`   | ~150            | Per-user, per-provider rate limiting                                     |
| `encryption.rs`     | ~250            | Cryptographic primitives (Argon2id, AES-GCM, HKDF)                       |

### Other `sys/` Modules

| Module             | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `sys/billing/`     | Stripe subscription management, credit tracking               |
| `sys/diagnostics/` | System health checks, crash reporting                         |
| `sys/logging/`     | Structured logging (tracing crate, file rotation)             |
| `sys/telemetry/`   | Anonymous usage telemetry (opt-in)                            |
| `sys/permissions/` | macOS permission management (Accessibility, Full Disk Access) |
| `sys/account/`     | User account management, profile, preferences                 |

## I.4 Automation Module (`automation/`)

Desktop automation capabilities for computer use.

| File                               | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `computer_use/observe_plan_act.rs` | OPA loop — screenshot → vision analysis → action execution → repeat |
| `computer_use/window_manager.rs`   | Window listing, focusing, resizing via AXUIElement and AppleScript  |
| `computer_use/input.rs`            | Keyboard and mouse simulation via `enigo` crate                     |
| `computer_use/screenshot.rs`       | Screen capture via `xcap` (full, region, window)                    |
| `computer_use/ocr.rs`              | OCR via Tesseract (optional feature flag)                           |
| `browser/cdp_client.rs`            | Chrome DevTools Protocol client for browser automation              |
| `browser/extension_bridge.rs`      | Native messaging bridge to Chrome extension                         |

## I.5 Features Module (`features/`)

Domain-specific feature implementations.

| Subdirectory | Purpose                                                               |
| ------------ | --------------------------------------------------------------------- |
| `terminal/`  | PTY-based terminal emulator with AI command suggestions               |
| `speech/`    | Voice input (recording, VAD) and output (TTS via Piper, macOS native) |
| `calendar/`  | Calendar integration (Google Calendar, Outlook, CalDAV)               |
| `teams/`     | Team management, shared billing, role-based access                    |
| `workflows/` | Workflow definitions, templates, marketplace                          |
| `documents/` | Document processing (PDF, DOCX, XLSX read/write)                      |
| `canvas/`    | Spatial canvas for artifact arrangement and visual planning           |
| `email/`     | IMAP/SMTP client, Gmail OAuth, message management                     |

## I.6 Integrations Module (`integrations/`)

External service integrations.

| Subdirectory        | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `cloud_sync/`       | Supabase sync engine, offline queue, conflict resolution |
| `native_messaging/` | Chrome extension native messaging host                   |
| `realtime/`         | WebSocket/WebRTC signaling for mobile companion          |
| `apis/`             | Generic REST API client, OAuth flow manager              |

## I.7 Data Module (`data/`)

Data persistence and caching.

| File               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `database.rs`      | SQLCipher database manager (migrations, WAL mode, connection pool) |
| `settings.rs`      | Settings serialization/deserialization                             |
| `cache.rs`         | Multi-layer cache system (memory → disk → network)                 |
| `analytics.rs`     | Analytics data collection and aggregation                          |
| `metrics.rs`       | Performance metrics recording                                      |
| `supabase_sync.rs` | Supabase data synchronization engine                               |

## I.8 UI Module (`ui/`)

Native UI helpers (non-WebView).

| File            | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `tray.rs`       | System tray icon (NSStatusItem) with dynamic menu and unread badge     |
| `window.rs`     | Window management (floating mode, always-on-top, position persistence) |
| `overlay.rs`    | Floating overlay windows (quick query, voice input)                    |
| `onboarding.rs` | First-run onboarding flow logic                                        |

## I.9 Feature Flags

The Rust backend uses Cargo feature flags to conditionally compile optional modules:

| Feature Flag       | Default | Modules Affected                 | Description                                       |
| ------------------ | ------- | -------------------------------- | ------------------------------------------------- |
| `shell`            | Yes     | `features/terminal/`             | PTY terminal support                              |
| `updater`          | Yes     | `ui/`, `sys/commands/updater.rs` | Auto-update via Tauri updater                     |
| `ocr`              | No      | `automation/computer_use/ocr.rs` | Tesseract OCR (requires `brew install tesseract`) |
| `local-llm`        | No      | `core/llm/`                      | Extended local model support                      |
| `vad`              | No      | `features/speech/`               | Voice activity detection                          |
| `local-whisper`    | No      | `features/speech/`               | On-device Whisper transcription                   |
| `remote-databases` | No      | `sys/commands/database.rs`       | PostgreSQL, MySQL, MongoDB, Redis client          |
| `devtools`         | No      | `lib.rs`                         | WebView DevTools enabled                          |

---

# Appendix J: Zustand Store Architecture

The frontend uses 60+ Zustand v5 stores with Immer middleware for immutable state updates and Persist middleware for localStorage persistence.

## J.1 Store Categories

### Core Stores (loaded at app startup)

| Store              | File                  | Persist?  | Purpose                                          |
| ------------------ | --------------------- | --------- | ------------------------------------------------ |
| `unifiedChatStore` | `unifiedChatStore.ts` | Yes (v3)  | Conversations, messages, active conversation     |
| `settingsStore`    | `settingsStore.ts`    | Yes (v10) | App configuration (theme, model, shortcuts)      |
| `modelStore`       | `modelStore.ts`       | Yes (v2)  | Model selection, custom models, capability cache |
| `toolStore`        | `chat/toolStore.ts`   | No        | Tool execution state, timeline, approvals        |
| `mcpStore`         | `mcpStore.ts`         | Yes (v1)  | MCP server configs, connection status            |
| `authCoreStore`    | `authCoreStore.ts`    | Yes (v1)  | Authentication state, JWT, user profile          |

### Feature Stores (loaded on demand)

| Store                   | File                       | Persist? | Purpose                                       |
| ----------------------- | -------------------------- | -------- | --------------------------------------------- |
| `voiceInputStore`       | `voiceInputStore.ts`       | No       | Voice recording state, transcription results  |
| `researchStore`         | `researchStore.ts`         | No       | Research session state, sources, report       |
| `canvasStore`           | `canvasStore.ts`           | Yes (v1) | Canvas items, positions, viewport             |
| `schedulerStore`        | `schedulerStore.ts`        | No       | Scheduled jobs, execution history             |
| `governanceStore`       | `governanceStore.ts`       | No       | Audit log, pending approvals, safety policies |
| `analyticsMetricsStore` | `analyticsMetricsStore.ts` | No       | Usage metrics, session analytics              |
| `costStore`             | `costStore.ts`             | Yes (v1) | Per-conversation and total cost tracking      |
| `roiStore`              | `roiStore.ts`              | Yes (v1) | ROI calculation, time saved estimates         |
| `skillMarketplaceStore` | `skillMarketplaceStore.ts` | No       | Skill catalog, search, install state          |

### Preference Stores (persist across sessions)

| Store                       | File                           | Persist? | Purpose                                         |
| --------------------------- | ------------------------------ | -------- | ----------------------------------------------- |
| `appPreferencesStore`       | `appPreferencesStore.ts`       | Yes (v1) | Window position, sidebar width, theme           |
| `chatPreferencesStore`      | `chatPreferencesStore.ts`      | Yes (v1) | Send behavior, streaming, auto-compact          |
| `executionPreferencesStore` | `executionPreferencesStore.ts` | Yes (v1) | Approval mode, timeouts, safety level           |
| `securityPreferencesStore`  | `securityPreferencesStore.ts`  | Yes (v1) | Master password enabled, telemetry opt-in       |
| `llmConfigStore`            | `llmConfigStore.ts`            | Yes (v1) | Per-provider API key presence, routing strategy |

### Billing and Subscription Stores

| Store                   | File                       | Persist? | Purpose                                    |
| ----------------------- | -------------------------- | -------- | ------------------------------------------ |
| `subscriptionPlanStore` | `subscriptionPlanStore.ts` | Yes (v1) | Current tier, feature gates                |
| `billingStore`          | `billingStore.ts`          | No       | Stripe customer, invoice history           |
| `tokenBudgetStore`      | `tokenBudgetStore.ts`      | Yes (v1) | Daily/session token budgets, spending caps |
| `usageTrackingStore`    | `usageTrackingStore.ts`    | No       | Real-time usage counters                   |

### Device and Feature Flag Stores

| Store              | File                  | Persist? | Purpose                                    |
| ------------------ | --------------------- | -------- | ------------------------------------------ |
| `deviceLinkStore`  | `deviceLinkStore.ts`  | Yes (v1) | Paired mobile devices, pairing codes       |
| `featureFlagStore` | `featureFlagStore.ts` | Yes (v1) | Remote feature flags, A/B test assignments |

## J.2 Store Migration Pattern

Zustand Persist stores include a `version` number and a `migrate` function for schema evolution:

```typescript
// Example: settingsStore migration from v9 to v10
persist(
  (set, get) => ({
    /* store definition */
  }),
  {
    name: 'app-settings',
    version: 10,
    migrate: (persistedState: unknown, version: number) => {
      const state = persistedState as Record<string, unknown>;
      if (version < 10) {
        // v9 → v10: Added 'routingStrategy' field
        state.routingStrategy = state.routingStrategy ?? 'Auto';
        // v9 → v10: Renamed 'autoApprove' → 'approvalMode'
        if ('autoApprove' in state) {
          state.approvalMode = state.autoApprove ? 'auto-approve-all' : 'ask';
          delete state.autoApprove;
        }
      }
      return state as AppSettings;
    },
  },
);
```

**Migration rules**:

1. Always provide default values for new fields
2. Handle renamed fields by copying and deleting the old key
3. Never remove fields without a migration step (would cause runtime crashes)
4. Increment the version number for every schema change
5. The `migrate` function must handle jumps (e.g., v7 → v10 must apply v8, v9, v10 migrations)

## J.3 Store-to-Store Communication

Stores communicate via Zustand's `subscribe` and `getState()`:

| Source Store       | Target Store            | Trigger                       | Action                       |
| ------------------ | ----------------------- | ----------------------------- | ---------------------------- |
| `unifiedChatStore` | `costStore`             | New message received          | Update per-conversation cost |
| `settingsStore`    | `modelStore`            | Default model changed         | Refresh model capabilities   |
| `mcpStore`         | `toolStore`             | Server connected/disconnected | Update available tools list  |
| `authCoreStore`    | `subscriptionPlanStore` | Auth state changed            | Refresh subscription tier    |
| `toolStore`        | `governanceStore`       | New approval request          | Push to pending approvals    |
| `settingsStore`    | `appPreferencesStore`   | Theme changed                 | Sync theme to preferences    |

---

_End of macOS Desktop Platform PRD._

_Document version 1.0.0 — 2026-03-09_
