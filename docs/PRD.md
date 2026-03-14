# AGI Workforce — Product Reference Document

> **Status**: Reference document (last updated Feb 26, 2026)
> Use for architectural overview. For current sprint work, see CLAUDE.md + MEMORY.md

---

## Table of Contents

1. [Product Vision](#section-1-product-vision)
2. [Architecture](#section-2-architecture)
3. [Desktop Feature Specifications](#section-3-desktop-feature-specifications)
4. [Web Application](#section-4-web-application)
5. [Services & Extensions](#section-5-services--extensions)
6. [Security & Data](#section-6-security--data)
7. [Non-Functional Requirements & Technical Debt](#section-7-non-functional-requirements--technical-debt)

---

# AGI Workforce — Product Requirements Document

## Section 1: Product Vision

**Document version**: 1.0.0
**Last updated**: 2026-02-26
**Status**: Living document — update on each major release
**Owner**: Product Team

---

## 1.1 Executive Summary

AGI Workforce is an open, model-agnostic AI desktop platform built on Tauri v2 (Rust backend, React/TypeScript frontend). It gives individuals, developers, and enterprises a single application through which any large language model — cloud-hosted or running locally — can operate as an autonomous agent with full desktop access: file system, terminal, browser, email, calendar, camera, microphone, and connected cloud services.

Where competing products lock users to a single AI vendor, AGI Workforce treats model choice as a first-class user right. The platform routes tasks to the best available model across nine or more cloud providers and any number of locally hosted models, using the same tools, skills, memory, and multi-agent swarm infrastructure regardless of which model is selected.

**Current release**: Desktop v1.1.5 / Monorepo v0.1.1
**License**: Proprietary (commercial)
**Homepage**: https://agiworkforce.com

---

## 1.2 Problem Statement

The AI desktop assistant market is fragmented and vendor-locked:

- **Claude Desktop** provides an excellent MCP tool ecosystem but restricts users exclusively to Anthropic models. Users who want to compare models, use cheaper models for routine tasks, or use locally hosted models for privacy must open a separate application.
- **ChatGPT Desktop** is limited to OpenAI models. The Operator web product requires constant human supervision and is not a true autonomous agent.
- **Gemini** offers no desktop app with meaningful local autonomy. Calendar integration exists but tool breadth is minimal.
- **Cursor / Windsurf** are code-focused IDEs, not general-purpose desktop agents. They offer limited model switching within a code context and have no computer use, voice I/O, or background scheduling.

None of the above offer:

- Background agents that run unattended for hours or days
- A multi-agent swarm (up to 100 concurrent agents)
- True full-desktop autonomy (mouse, keyboard, screen reading, app launching)
- Offline-capable local model inference
- Cross-platform support (macOS universal + Windows + Linux) in a single native desktop app

AGI Workforce addresses all of these gaps in one product.

---

## 1.3 Product Vision Statement

> **Anything a human can do at a computer, an AI agent should be able to do — using any model the user chooses.**

AGI Workforce will become the number-one AI desktop platform by delivering:

1. **Unrestricted model access** — connect any LLM with a single API key or local endpoint
2. **Full desktop autonomy** — agents that can see the screen, control mouse and keyboard, run terminals, manage files, and operate every installed application
3. **Enterprise-grade security** — ToolGuard sandboxing, Argon2id-encrypted secrets, per-tool permission controls, and audit logging
4. **Composable agent architecture** — skills, memory, MCP tools, and multi-agent swarms that work identically across all connected models

---

## 1.4 Product Suite

AGI Workforce ships as a suite of five coordinated applications:

| #   | Application                       | Framework                           | Primary Purpose                                                             |
| --- | --------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| 1   | **Desktop App** (primary product) | Tauri v2 + React 19 + Vite 7 + Rust | Full AI agent runtime, local storage, native integrations                   |
| 2   | **Web App**                       | Next.js 16 App Router + Supabase    | Account management, billing, web-based chat, team dashboard                 |
| 3   | **Browser Extension**             | Chrome MV3                          | DOM automation, job autofill, page context capture, native messaging bridge |
| 4   | **API Gateway**                   | Express.js (TypeScript)             | Mobile device management, cross-device sync, credits API                    |
| 5   | **Signaling Server**              | Express.js + WebSocket              | WebRTC pairing between desktop and mobile devices                           |

All five applications share types (`@agiworkforce/types`) and utilities (`@agiworkforce/utils`) through a pnpm monorepo workspace.

---

## 1.5 Target Users

### 1.5.1 Individual Developers and Power Users

Developers who want AI assistance across their entire workflow — not just code editing — and who need to integrate multiple LLMs without switching applications. Key needs:

- Compare model outputs (Claude vs. GPT-4o vs. Gemini vs. local Llama) in a single interface
- AI that can run terminal commands, manage files, and operate desktop applications
- MCP tool ecosystem: connect custom tools via stdio, SSE, or HTTP transports
- Privacy option: route sensitive queries to locally hosted models (Ollama, LM Studio, vLLM, llama.cpp)

### 1.5.2 AI Enthusiasts and Early Adopters

Users who experiment with the frontier of AI capabilities and want access to emerging models immediately. Key needs:

- Day-one support for new model releases from any provider
- Local model experimentation without cloud costs or data exposure
- Voice I/O (Whisper STT, Piper TTS, Deepgram, macOS native TTS)
- Computer use and vision features (screenshot, OCR, screen-aware agents)

### 1.5.3 Enterprises

Organizations that need AI automation at scale with governance and security controls. Key needs:

- Vendor-neutral platform to prevent lock-in as the AI market evolves
- ToolGuard sandboxing to prevent runaway agent actions in production environments
- Encrypted secret storage (Argon2id + SQLCipher) for API keys and credentials
- Team and enterprise subscription tiers with per-seat licensing
- Planned: SSO/SCIM integration, audit trail export, compliance controls

---

## 1.6 Competitive Landscape

### 1.6.1 Feature Comparison Matrix

| Feature                               |                       AGI Workforce                       |   Claude Desktop    |         ChatGPT Desktop         |      Gemini      | Cursor / Windsurf |
| ------------------------------------- | :-------------------------------------------------------: | :-----------------: | :-----------------------------: | :--------------: | :---------------: |
| Model agnostic (any LLM)              |           **Yes** — 9+ cloud providers + local            | No — Anthropic only |        No — OpenAI only         | No — Google only |      Partial      |
| Local model support                   |            Ollama, LM Studio, vLLM, llama.cpp             |         No          |               No                |        No        |       Some        |
| MCP tool ecosystem                    |                  Full (stdio, SSE, HTTP)                  |         Yes         |               No                |     Limited      |        No         |
| Computer use (vision + action)        |                           Full                            |   Limited (beta)    |               No                |        No        |        No         |
| Background agents (24 hr+)            |                            Yes                            |         No          |               No                |        No        |        No         |
| Multi-agent swarm (up to 100)         |                            Yes                            |         No          |               No                |        No        |        No         |
| Voice I/O                             |                Whisper + Piper + Deepgram                 |         No          |           Voice mode            |    Voice mode    |        No         |
| Browser automation                    |                   CDP + extension + DOM                   |         No          | Operator (web only, supervised) |        No        |        No         |
| Email / Calendar / Cloud storage      | Native IMAP/SMTP, OAuth calendars, Drive/Dropbox/OneDrive |         No          |               No                |    Gmail only    |        No         |
| Document processing (PDF/DOCX/XLSX)   |                    Read + write + edit                    |         No          |           Upload only           |   Upload only    |        No         |
| Database connections                  |         SQLite, PostgreSQL, MySQL, MongoDB, Redis         |         No          |               No                |        No        |        No         |
| Custom instruction files (multi-tool) |    CLAUDE.md + GEMINI.md + .cursorrules auto-discovery    |   CLAUDE.md only    |       Custom instructions       |        No        | .cursorrules only |
| Desktop autonomy                      |           Full (FS, terminal, apps, clipboard)            | Limited (artifacts) |               No                |        No        |   Code-focused    |
| Licensing                             |                 Proprietary (commercial)                  |     Proprietary     |           Proprietary           |   Proprietary    |    Proprietary    |

### 1.6.2 Strategic Gaps Owned by AGI Workforce

The following capabilities are **not available in any competing desktop product** as of 2026-02-26:

1. **Background scheduling** — agents that continue running after the user closes the chat window, triggered on a schedule or by external events
2. **Cross-application state** — agents that maintain context across multiple desktop applications (e.g., read a spreadsheet, draft an email, file a GitHub issue, all in one uninterrupted workflow)
3. **True offline mode** — full agent functionality on a local model with no internet connection required
4. **Windows platform parity** — Claude Desktop and ChatGPT Desktop have limited Windows feature sets; AGI Workforce ships a full-featured Windows build
5. **Instruction file portability** — a project configured for Claude Code, Cursor, or Windsurf works in AGI Workforce without modification

---

## 1.7 Subscription Tiers

| Tier           | Level | LLM Access                                                        | Media Generation | Target User       | Price          |
| -------------- | :---: | ----------------------------------------------------------------- | :--------------: | ----------------- | -------------- |
| **Free**       |   0   | None (access blocked pending subscription)                        |        No        | Evaluation        | $0             |
| **Hobby**      |   1   | Economy models only                                               |        No        | Casual users      | TBD            |
| **Pro**        |   2   | Economy + balanced models                                         |        No        | Active developers | Waitlisted     |
| **Max**        |   3   | All models including flagship (GPT-4o, Claude Opus, Gemini Ultra) |       Yes        | Power users       | Waitlisted     |
| **Team**       |  3.5  | All models                                                        |       Yes        | Small teams       | $29/seat/month |
| **Enterprise** |   4   | All models + priority support + SLA                               |       Yes        | Organizations     | $99/seat/month |

Pro and Max tiers are currently in waitlist mode and are not yet purchasable. The gating mechanism is enforced server-side via Supabase `user_subscriptions` and client-side via the `subscriptionGate` utility.

---

## 1.8 Non-Negotiable Product Requirements

The following requirements are absolute constraints. Any change that violates them requires explicit sign-off from the product owner and a new PRD revision.

| ID    | Requirement                                              | Rationale                                                                                                                                                                     |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NN-01 | Zero user-visible raw error messages                     | Users must never see stack traces, provider error codes, or internal exception text. All errors must be translated to friendly messages.                                      |
| NN-02 | `stream_watchdog_timeout` must never surface to the user | The watchdog is an internal Rust safety mechanism. If it fires, the session must recover gracefully.                                                                          |
| NN-03 | Auto-approve mode must have zero friction                | In trusted mode (user-configured), agents must execute tools without confirmation dialogs. Any latency introduced by permission prompts in auto-approve mode is a regression. |
| NN-04 | Multi-LLM routing must work across all 9+ providers      | A failure in one provider must not prevent routing to another. Circuit breaker, retry, and fallback logic are required.                                                       |
| NN-05 | Full desktop autonomy must be complete                   | The platform must be able to perform any action a human can perform at a keyboard and mouse, including actions in third-party applications.                                   |
| NN-06 | API keys and secrets must never appear in plaintext      | All secrets go through SecretManager (Argon2id encryption, SQLCipher storage, OS keychain integration).                                                                       |
| NN-07 | Proprietary license must be enforced                     | All source code remains proprietary. No dependency with a copyleft license (GPL, AGPL, SSPL) may be added without a licensing review. Contributions require a CLA.            |

---

## 1.9 Feature Audit Baseline (2026-02-25)

A baseline audit of 114 features was completed on 2026-02-25. The results establish the quality floor for v1.x releases:

| Status                       |   Count | Percentage |
| ---------------------------- | ------: | ---------: |
| PASS                         |      66 |      57.9% |
| PARTIAL                      |      21 |      18.4% |
| FAIL                         |       3 |       2.6% |
| BLOCKED (missing dependency) |       9 |       7.9% |
| NOT TESTABLE (desktop-only)  |      10 |       8.8% |
| UNKNOWN                      |       5 |       4.4% |
| **Total**                    | **114** |   **100%** |

**Definition of done for v1.2.0 release**: All FAIL items resolved, all PARTIAL items either promoted to PASS or formally deferred to a tracked issue, and all BLOCKED items have a documented dependency resolution path.

---

## 1.10 Success Metrics

| Metric                              | Target (v1.2.0)    | Target (v2.0.0)     |
| ----------------------------------- | ------------------ | ------------------- |
| Feature audit PASS rate             | >= 80%             | >= 95%              |
| User-visible error rate             | < 0.1% of sessions | < 0.01% of sessions |
| LLM provider uptime (routing layer) | >= 99.5%           | >= 99.9%            |
| Desktop app cold start time         | < 3 seconds        | < 2 seconds         |
| Agent task success rate (automated) | >= 85%             | >= 95%              |
| Pro/Max waitlist conversion         | >= 30%             | N/A                 |
| Team/Enterprise seats               | 50                 | 500                 |

---

_Section 2: Architecture — see `section-2-architecture.md`_
_Section 3: Feature Specifications — see `section-3-features.md` (forthcoming)_

---

# AGI Workforce — Product Requirements Document

## Section 2: Technical Architecture

**Document version**: 1.0.0
**Last updated**: 2026-02-26
**Status**: Living document — update on each major release
**Owner**: Engineering Team

---

## 2.1 Architecture Overview

AGI Workforce is a monorepo containing five deployable applications, two shared packages, two backend services, and a comprehensive CI/CD pipeline. The desktop application is the primary product and contains the full AI agent runtime in its Rust backend. The remaining applications (web, browser extension, API gateway, signaling server) extend the platform's reach to browsers, mobile devices, and team-level management.

The central design principle is **local-first with optional cloud**: the desktop app is fully functional with no cloud connectivity. Cloud features (billing, sync, team collaboration) augment but never gate core functionality.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Machine                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Desktop App (Tauri v2)                     │  │
│  │                                                              │  │
│  │  ┌─────────────────────────┐  ┌──────────────────────────┐  │  │
│  │  │  React 19 Frontend      │  │    Rust Backend           │  │  │
│  │  │  (TypeScript 5.9.3)     │◄─►│    (Tokio async runtime) │  │  │
│  │  │  296 components         │  │    87 command modules     │  │  │
│  │  │  41 Zustand stores      │  │    579 source files       │  │  │
│  │  └─────────────────────────┘  └──────────┬───────────────┘  │  │
│  │                                          │                   │  │
│  │                                          ▼                   │  │
│  │                              ┌───────────────────────┐      │  │
│  │                              │  SQLite (SQLCipher)    │      │  │
│  │                              │  Encrypted local DB   │      │  │
│  │                              └───────────────────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────┐     ┌──────────────────────────────────────┐ │
│  │ Chrome Extension │────►│  Native Messaging Bridge             │ │
│  │ (MV3)            │     │  (Rust ↔ Browser IPC)                │ │
│  └──────────────────┘     └──────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ HTTPS / WebSocket
           ┌──────────────────────┼────────────────────────┐
           ▼                      ▼                        ▼
┌──────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│   LLM Providers  │  │   Web App (Vercel)   │  │  API Gateway       │
│   (cloud + local)│  │   Next.js 16         │  │  Express.js        │
│                  │  │   Supabase Auth      │  │  /auth /sync       │
│  Anthropic       │  │   Stripe Payments    │  │  /mobile /credits  │
│  OpenAI          │  └──────────────────────┘  └────────────────────┘
│  Google          │                                       │
│  Mistral         │  ┌──────────────────────┐  ┌────────────────────┐
│  Groq            │  │  Supabase            │  │  Signaling Server  │
│  DeepSeek        │  │  PostgreSQL + Auth   │  │  WebRTC Pairing    │
│  Ollama (local)  │  │  + Storage + Realtime│  │  Express.js + ws   │
│  LM Studio       │  └──────────────────────┘  └────────────────────┘
│  vLLM / llama.cpp│
│  OpenRouter      │  ┌──────────────────────┐
│  Together.ai     │  │  MCP Servers         │
│  Fireworks       │  │  Gmail, Calendar     │
└──────────────────┘  │  Vercel, n8n, etc.   │
                       └──────────────────────┘
```

---

## 2.2 Monorepo Structure

The repository uses pnpm workspaces (v9.15.3) with Node.js >= 22.12.0. The Rust workspace root is at `Cargo.toml` with a single member (`apps/desktop/src-tauri`).

```
~/Desktop/agiworkforce/                    # Monorepo root
├── apps/
│   ├── desktop/                           # Primary product: Tauri v2 desktop app
│   │   ├── src-tauri/                     # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs                # Entry point
│   │   │   │   ├── lib.rs                 # Tauri app builder, plugin registration
│   │   │   │   ├── automation/            # Desktop UI automation
│   │   │   │   │   ├── cdp/               # Chrome DevTools Protocol client
│   │   │   │   │   ├── computer_use/      # Vision-based screen interaction
│   │   │   │   │   └── input_sim/         # Keyboard + mouse simulation
│   │   │   │   ├── core/                  # AI engine (primary business logic)
│   │   │   │   │   ├── agent/             # AutonomousAgent, BackgroundAgent
│   │   │   │   │   ├── agi/               # AGI orchestration layer
│   │   │   │   │   ├── llm/               # LLM router, SSE parser, provider adapters
│   │   │   │   │   ├── mcp/               # MCP client (stdio, SSE, HTTP)
│   │   │   │   │   ├── swarm/             # Multi-agent swarm (TaskDecomposer, up to 100)
│   │   │   │   │   ├── embeddings/        # Local embedding generation
│   │   │   │   │   ├── research/          # Agentic research orchestrator
│   │   │   │   │   ├── skills/            # SKILL.md runtime, skill registry
│   │   │   │   │   ├── scheduler/         # Cron-based background scheduling
│   │   │   │   │   ├── intent/            # Intent classification
│   │   │   │   │   ├── artifacts/         # Canvas, code, image artifact management
│   │   │   │   │   ├── hooks/             # Pre/post tool execution hooks
│   │   │   │   │   └── codebase/          # Codebase indexing and search
│   │   │   │   ├── data/                  # Data layer
│   │   │   │   │   ├── db/                # SQLite schema, migrations, queries
│   │   │   │   │   ├── settings/          # User settings persistence
│   │   │   │   │   ├── database_connections/ # External DB connectors (PG, MySQL, Mongo, Redis)
│   │   │   │   │   ├── cache/             # In-process caching
│   │   │   │   │   ├── analytics/         # Usage analytics (local)
│   │   │   │   │   ├── metrics/           # Performance metrics
│   │   │   │   │   └── state/             # Cross-module state bus
│   │   │   │   ├── features/              # Product feature modules
│   │   │   │   │   ├── speech/            # STT (Whisper, Deepgram) + TTS (Piper, macOS)
│   │   │   │   │   ├── terminal/          # Shell command execution
│   │   │   │   │   ├── calendar/          # OAuth calendar (Google, Outlook)
│   │   │   │   │   ├── communications/    # IMAP/SMTP email
│   │   │   │   │   ├── document/          # PDF, DOCX, XLSX read/write
│   │   │   │   │   ├── messaging/         # In-app messaging
│   │   │   │   │   ├── productivity/      # Task management
│   │   │   │   │   ├── canvas/            # Visual canvas rendering
│   │   │   │   │   ├── search/            # Cross-app search
│   │   │   │   │   ├── tasks/             # Autonomous task queue
│   │   │   │   │   ├── teams/             # Team collaboration
│   │   │   │   │   ├── workflows/         # n8n-style workflow runner
│   │   │   │   │   ├── projects/          # Project context management
│   │   │   │   │   ├── clipboard/         # Clipboard monitor + history
│   │   │   │   │   └── updater/           # Auto-update (Tauri updater plugin)
│   │   │   │   ├── integrations/          # External service integrations
│   │   │   │   │   ├── cloud_storage/     # Drive, Dropbox, OneDrive
│   │   │   │   │   ├── native_messaging/  # Chrome extension bridge
│   │   │   │   │   ├── media/             # Image/video generation APIs
│   │   │   │   │   ├── realtime/          # WebSocket / SSE relay
│   │   │   │   │   └── sync/              # Cross-device sync
│   │   │   │   └── sys/                   # System and infrastructure
│   │   │   │       ├── commands/          # Tauri invoke command handlers (87 modules)
│   │   │   │       ├── security/          # ToolGuard, SecretManager, permissions
│   │   │   │       ├── telemetry/         # Optional telemetry (opt-in)
│   │   │   │       ├── diagnostics/       # Health checks, self-diagnostics
│   │   │   │       ├── filesystem/        # File system abstraction
│   │   │   │       ├── logging/           # Structured logging (tracing crate)
│   │   │   │       ├── permissions/       # OS permission requests (camera, mic, accessibility)
│   │   │   │       ├── billing/           # Stripe integration (feature-flagged)
│   │   │   │       ├── account/           # User account state
│   │   │   │       ├── api/               # HTTP client pool
│   │   │   │       └── error/             # Error taxonomy + friendly message mapping
│   │   │   ├── Cargo.toml                 # v1.1.5, edition 2021
│   │   │   └── capabilities/default.json  # Tauri capability declarations
│   │   ├── src/                           # React/TypeScript frontend
│   │   │   ├── components/                # 296 UI components across 70+ folders
│   │   │   ├── stores/                    # 41 Zustand stores (v5 + Immer + Persist)
│   │   │   ├── hooks/                     # 60+ custom React hooks
│   │   │   ├── api/                       # Tauri invoke() wrappers
│   │   │   ├── constants/                 # LLM model catalog (llm.ts, ~65K chars)
│   │   │   ├── services/                  # Frontend services (model router, subscription)
│   │   │   ├── lib/                       # Frontend utilities
│   │   │   └── types/                     # TypeScript type definitions
│   │   └── package.json                   # v1.1.5
│   ├── web/                               # Next.js 16 web application
│   │   ├── app/                           # App Router pages + 100+ API route handlers
│   │   ├── components/                    # React components
│   │   ├── stores/                        # Zustand stores
│   │   ├── lib/                           # supabase, stripe, csrf, cors, pino logger
│   │   └── middleware.ts                  # Auth, CSP headers, session refresh
│   └── extension/                         # Chrome MV3 browser extension
│       ├── manifest.json                  # v1.1.0, MV3
│       └── src/                           # background.js, content.js, side_panel/
├── packages/
│   ├── types/                             # @agiworkforce/types — shared TS types
│   │   └── src/                           # context, signaling, tauri, errors, customModel, prompt-enhancement
│   └── utils/                             # @agiworkforce/utils — shared utilities
│       └── src/                           # SignalingClient, validation, format, async, error
├── services/
│   ├── api-gateway/                       # Express.js API gateway (port 3000)
│   │   └── src/                           # routes: auth, desktop, sync, mobile, credits
│   └── signaling-server/                  # WebRTC pairing server
│       └── src/                           # HTTP endpoints, WebSocket, pairing sessions
├── supabase/                              # 16+ Supabase migration files
├── scripts/                               # Build and deploy utilities
├── .github/                               # CI/CD workflow definitions
├── .claude/                               # AI agent config (23 agents, skills, hooks)
├── docs/                                  # Documentation
├── package.json                           # Root pnpm monorepo config
├── pnpm-workspace.yaml                    # Workspace: apps/*, packages/*, services/*, tools/*
├── Cargo.toml                             # Rust workspace (single member)
└── docker-compose.yml                     # Local dev: PostgreSQL 16 + pgAdmin 4
```

---

## 2.3 Technology Stack

### 2.3.1 Desktop Application

| Layer               | Technology                                           | Version                          |
| ------------------- | ---------------------------------------------------- | -------------------------------- |
| Desktop framework   | Tauri                                                | 2.9.3                            |
| Frontend framework  | React                                                | 19                               |
| Build tool          | Vite                                                 | 7                                |
| Frontend language   | TypeScript                                           | 5.9.3 (strict mode)              |
| Backend language    | Rust                                                 | 1.90.0 (edition 2021)            |
| CSS                 | Tailwind CSS                                         | 4                                |
| UI primitives       | Radix UI                                             | latest                           |
| State management    | Zustand                                              | 5 (+ Immer + Persist)            |
| Icons               | Lucide                                               | latest                           |
| Toast notifications | Sonner                                               | latest                           |
| Async runtime       | Tokio                                                | 1.37 (full features)             |
| HTTP client         | Reqwest                                              | 0.12 (rustls-tls, no native-tls) |
| Local database      | rusqlite                                             | 0.31 (bundled-sqlcipher)         |
| Async DB wrapper    | tokio-rusqlite                                       | latest                           |
| Serialization       | serde + serde_json                                   | latest                           |
| Concurrency         | rayon 1.10 + dashmap 6.1 + parking_lot 0.12          |                                  |
| Cryptography        | argon2 0.5, aes-gcm, hkdf, sha2, hmac, ed25519-dalek |                                  |
| Token counting      | tiktoken-rs                                          | latest                           |
| Screen capture      | xcap                                                 | latest                           |
| OCR                 | tesseract                                            | optional feature flag            |
| PDF                 | pdf-extract + lopdf + printpdf                       |                                  |
| DOCX                | docx-rs                                              |                                  |
| XLSX                | calamine (read) + rust_xlsxwriter (write)            |                                  |
| Email               | lettre (SMTP) + imap (IMAP)                          |                                  |
| Markdown            | pulldown-cmark                                       |                                  |
| macOS platform      | accessibility-sys, core-foundation, objc, cocoa      |                                  |
| Windows platform    | windows 0.56 (Win32 APIs)                            |                                  |

### 2.3.2 Web Application

| Layer            | Technology                                  | Version               |
| ---------------- | ------------------------------------------- | --------------------- |
| Framework        | Next.js                                     | 16 (App Router)       |
| React            | React                                       | 19                    |
| Language         | TypeScript                                  | strict mode           |
| Auth             | Supabase Auth                               | SSR + JWT             |
| Payments         | Stripe SDK                                  | API 2026-02-25.clover |
| Rate limiting    | Upstash Redis                               | @upstash/ratelimit    |
| Validation       | Zod                                         | 4 (.strict() schemas) |
| State management | Zustand                                     | 5 (+ Immer + Persist) |
| UI               | Radix UI + Tailwind CSS 4 + Lucide + Sonner |                       |
| Markdown         | react-markdown + remark-gfm + KaTeX         |                       |
| Logging          | Pino + pino-pretty                          |                       |
| i18n             | i18next + react-i18next                     | en, es                |
| Deployment       | Vercel                                      | serverless            |

### 2.3.3 Backend Services

| Service          | Framework       | Language   | Exposed Port |
| ---------------- | --------------- | ---------- | ------------ |
| API Gateway      | Express.js      | TypeScript | 3000         |
| Signaling Server | Express.js + ws | TypeScript | configurable |

### 2.3.4 Shared Packages

| Package               | Export        | Contents                                                                                                 |
| --------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `@agiworkforce/types` | Named exports | `ContextMessage`, `SignalingMessage`, `TauriEvent`, `AppError`, `CustomModelConfig`, `PromptEnhancement` |
| `@agiworkforce/utils` | Named exports | `SignalingClient`, `validateInput`, `formatBytes`, `retry`, `mapError`                                   |

### 2.3.5 Build and Developer Tooling

| Tool            | Version / Config                                                           |
| --------------- | -------------------------------------------------------------------------- |
| Package manager | pnpm 9.15.3                                                                |
| Node.js         | >= 22.12.0                                                                 |
| Rust            | 1.90.0                                                                     |
| Git hooks       | Husky 9 + lint-staged                                                      |
| Commit linting  | commitlint — conventional commits, header max 100 chars, lowercase subject |
| Linting         | ESLint 9 + @typescript-eslint                                              |
| Formatting      | Prettier                                                                   |
| Unit testing    | Vitest                                                                     |
| E2E testing     | Playwright                                                                 |
| CI              | GitHub Actions                                                             |

---

## 2.4 Rust Architecture Details

### 2.4.1 Feature Flags

Rust features control platform-specific capabilities and optional dependencies. All features are disabled by default unless noted.

| Feature Flag     | Default | Purpose                                                       |
| ---------------- | :-----: | ------------------------------------------------------------- |
| `shell`          | **on**  | Tauri shell plugin (terminal execution)                       |
| `updater`        | **on**  | Tauri updater plugin (auto-update)                            |
| `devtools`       |   off   | Tauri devtools panel (development only)                       |
| `ocr`            |   off   | Tesseract OCR bindings (requires system Tesseract install)    |
| `local-llm`      |   off   | llama-cpp-2 for on-device inference (large binary dependency) |
| `webrtc-support` |   off   | WebRTC peer communications (mobile pairing on device)         |
| `sentry`         |   off   | Sentry error tracking integration                             |
| `billing`        |   off   | Stripe billing SDK integration                                |
| `vad`            |   off   | WebRTC voice activity detection                               |
| `local-whisper`  |   off   | Offline Whisper.cpp speech-to-text                            |

### 2.4.2 Lint and Safety Configuration

The following lint rules are enforced at the crate level, not merely at clippy suggestion level:

```toml
[lints.rust]
unsafe_code = "deny"       # No unsafe blocks permitted
dead_code = "deny"         # No unused code may be merged
unused = "deny"            # No unused imports, variables, or parameters
```

All Rust code must pass `cargo clippy -- -D warnings` in CI.

### 2.4.3 Release Profile (Production Builds)

```toml
[profile.release]
codegen-units = 1          # Maximum optimization: single codegen unit
lto = true                 # Link-time optimization across all crates
opt-level = "z"            # Optimize for binary size (not speed)
strip = true               # Strip debug symbols from binary
panic = "abort"            # Abort on panic (no unwinding overhead)
```

### 2.4.4 Tauri Capability Model

All Tauri capabilities are declared in `capabilities/default.json`. This file is the security boundary for what the WebView is permitted to invoke. The deny list includes critical paths (`.env` files, credential stores, system security directories) and is enforced at the Tauri permission layer before any Rust handler is invoked.

**Current deny-list size**: 15 path patterns.

Any addition to the capability list requires:

1. A security review comment in the PR
2. Update to this PRD section
3. Update to `docs/SESSION_STATE.md` noting the change

---

## 2.5 Security Architecture

Security is a foundational requirement, not a feature. The following components form a defense-in-depth stack:

| Layer               | Component                          | Mechanism                                                                                        |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Secrets storage     | `SecretManager`                    | Argon2id key derivation + AES-GCM encryption + SQLCipher at rest + OS keychain fallback          |
| Key derivation      | HKDF + SHA-256                     | Per-secret derived keys; master key never stored                                                 |
| Tool execution      | `ToolGuard`                        | 1,778-line sandboxing module. Validates tool inputs, enforces deny lists, rate-limits executions |
| Input validation    | Server-side + client-side          | Zod schemas (web), serde validation (Rust), deny-list patterns                                   |
| Capability boundary | Tauri capabilities                 | WebView cannot invoke undeclared commands                                                        |
| Network             | rustls (TLS 1.3)                   | No native-tls; rustls used exclusively in reqwest                                                |
| Database            | SQLCipher                          | Full-database encryption for local SQLite                                                        |
| Commits             | ed25519-dalek                      | Ed25519 signatures on AppImage releases                                                          |
| Web sessions        | CSRF tokens + SameSite cookies     | Enforced by web middleware                                                                       |
| CSP                 | Content-Security-Policy headers    | Configured in Next.js middleware                                                                 |
| Rate limiting       | Upstash Redis + @upstash/ratelimit | API gateway and web app routes                                                                   |

### 2.5.1 ToolGuard Operation

ToolGuard intercepts every tool execution call before it reaches the Rust handler:

1. **Input validation** — Check tool arguments against schema and deny-list patterns
2. **Permission check** — Verify the calling agent has permission for this tool in the current context
3. **Rate limit** — Apply per-tool execution rate limits
4. **Execution** — Pass to handler if all checks pass
5. **Audit log** — Record invocation, result, and timing regardless of outcome

Auto-approve mode bypasses the user-facing confirmation dialog only. ToolGuard validation and audit logging remain active in all modes.

### 2.5.2 SecretManager Protocol

```
User provides API key
        │
        ▼
SecretManager.store(key, plaintext)
        │
        ├── Derive encryption key via HKDF(SHA-256, master_key, key_label)
        ├── Encrypt plaintext via AES-GCM(derived_key, random_nonce)
        ├── Store ciphertext in SQLCipher DB
        └── Optionally store derived_key in OS keychain

SecretManager.get(key) → plaintext
        │
        ├── Retrieve ciphertext from SQLCipher DB
        ├── Retrieve or re-derive encryption key
        └── Decrypt via AES-GCM → return plaintext
```

Plaintext API keys must never appear in:

- Log files
- Error messages surfaced to users
- `process.env` in the renderer process
- Any `.env` file committed to the repository

---

## 2.6 Data Flow

```
User Input
    │
    ▼ (Tauri IPC)
React Frontend ──invoke()──► Rust Command Handler
                                      │
                 ┌────────────────────┼────────────────────────┐
                 ▼                    ▼                        ▼
          LLM Router            ToolGuard               SQLite (local)
          (core/llm/)           (sys/security/)         (data/db/)
                 │                    │
     ┌───────────┼──────────┐         ▼
     ▼           ▼          ▼    Tool Handler
  Cloud LLM  Local LLM   MCP     (filesystem, terminal,
  (HTTPS/SSE) (llama.cpp) Server  browser, email, calendar)
                                        │
                                        ▼
                                   Result + Audit Log
                                        │
                 ┌──────────────────────┘
                 ▼
          Rust Command Handler
                 │
                 ▼ (Tauri event)
          React Frontend ──► Zustand Store ──► UI Update
```

### 2.6.1 LLM Streaming Path

Streaming responses use a dedicated HTTP client (`streaming_client`) that does not have the `stream_watchdog_timeout` constraint of the standard client. The SSE parser (`core/llm/sse_parser.rs`) handles:

- Standard SSE (`data: {...}`)
- OpenAI-compatible streaming chunks
- Anthropic event types (`content_block_delta`, `message_delta`)
- Error recovery on malformed chunks without terminating the stream

Image generation remains on the standard HTTP client path. Migrating image generation to the streaming client is a tracked backlog item.

### 2.6.2 State Management (Frontend)

| Store Count       | Library            | Persistence                                   |
| ----------------- | ------------------ | --------------------------------------------- |
| 41 Zustand stores | Zustand v5 + Immer | zustand/persist (localStorage, migration v10) |

Maximum ID mapping cap per store: 1,000 entries (enforced to prevent unbounded memory growth, see STR-002 fix). Immer is initialized globally via `enableImmer()` before any store is created.

---

## 2.7 Platform Targets

### 2.7.1 Desktop Distribution

| Platform | Architecture            | Distribution Format      | Signing                     |
| -------- | ----------------------- | ------------------------ | --------------------------- |
| macOS    | Apple Silicon (aarch64) | .dmg                     | Developer ID + Notarization |
| macOS    | Intel (x86_64)          | .dmg                     | Developer ID + Notarization |
| macOS    | Universal (fat binary)  | .dmg                     | Developer ID + Notarization |
| Windows  | x64                     | .exe installer (WiX MSI) | Authenticode (planned)      |
| Linux    | x64                     | .AppImage                | Ed25519 signature           |

The universal macOS build is the primary release artifact. All three macOS targets are built and signed in the same CI job via `cargo build --target universal-apple-darwin`.

### 2.7.2 Web and Service Deployment

| Component        | Hosting                | URL Pattern                        | Notes                            |
| ---------------- | ---------------------- | ---------------------------------- | -------------------------------- |
| Web App          | Vercel                 | https://agiworkforce.com           | Serverless, auto-scaled          |
| Desktop App      | GitHub Releases        | github.com/…/releases/tag/v\*      | Tauri updater endpoint           |
| API Gateway      | TBD (any Node.js host) | https://api.agiworkforce.com       | Stateless, horizontally scalable |
| Signaling Server | Fly.io or Railway      | https://signaling.agiworkforce.com | Low-latency WebSocket            |
| Database         | Supabase               | \*.supabase.co                     | PostgreSQL 15 + Auth + Realtime  |
| Redis            | Upstash                | \*.upstash.io                      | Serverless Redis, rate limiting  |
| Payments         | Stripe                 | api.stripe.com                     | Webhook endpoint on web app      |

---

## 2.8 CI/CD Pipelines

All pipelines are defined as GitHub Actions workflows in `.github/workflows/`.

| Workflow File                 | Trigger                                       | Steps                                                                                            | Artifacts             |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| `ci.yml`                      | Push / PR to `main`                           | lint → typecheck → unit tests → build all apps → `cargo audit` → `cargo clippy` → Playwright e2e | Test reports          |
| `release-desktop.yml`         | Git tag matching `v*`                         | validate → build macOS / Windows / Linux → sign → notarize (macOS) → create GitHub Release       | .dmg, .exe, .AppImage |
| `deploy-signaling-server.yml` | Push affecting `services/signaling-server/**` | test → Docker build → deploy to Railway/Fly.io → health check                                    | Docker image          |
| `e2e-tests.yml`               | Schedule (nightly) / manual                   | Full Playwright E2E suite across macOS + Windows                                                 | Screenshots, videos   |

### 2.8.1 Required CI Gates (PRs cannot merge without all passing)

1. TypeScript typecheck — zero type errors across all workspaces
2. ESLint — zero lint errors (warnings are allowed but tracked)
3. Prettier format check — no unformatted files
4. Vitest unit tests — all tests pass
5. `cargo clippy -- -D warnings` — zero Clippy warnings
6. `cargo audit` — no known CVEs in dependency tree
7. commitlint — all commit messages conform to conventional commits spec

---

## 2.9 Local Development Setup

### 2.9.1 Prerequisites

| Requirement    | Version    | Install                                    |
| -------------- | ---------- | ------------------------------------------ |
| Node.js        | >= 22.12.0 | nvm or official installer                  |
| pnpm           | 9.15.3     | `npm install -g pnpm@9.15.3`               |
| Rust           | 1.90.0     | `rustup install 1.90.0`                    |
| Tauri CLI      | latest v2  | `cargo install tauri-cli --version '^2'`   |
| Docker Desktop | latest     | docker.com                                 |
| Xcode (macOS)  | 16+        | Xcode command-line tools (for codesigning) |

### 2.9.2 Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Start frontend-only dev server (hot reload, no Rust)
pnpm dev

# Start full desktop development (frontend + Rust backend, hot rebuild)
pnpm tauri dev

# Start local PostgreSQL + pgAdmin for web app development
docker compose up -d

# Type checking across all workspaces
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Rust type check (fast, no linking)
cargo check

# Rust lint
cargo clippy

# Production desktop build
pnpm tauri build

# Production frontend build only
pnpm build
```

### 2.9.3 Environment Configuration

Environment variables are managed through:

- `.env` files (gitignored, never committed)
- `SecretManager` for runtime API keys (encrypted in SQLite)
- Tauri `capabilities/default.json` for permission scope

**Never** put API keys, database URLs, or JWT secrets in:

- Source files
- `CLAUDE.md` or any instruction file
- GitHub Actions secrets visible in logs
- Browser localStorage or sessionStorage

---

## 2.10 LLM Provider Catalog

The model catalog is maintained in `apps/desktop/src/constants/llm.ts` (TypeScript, ~65K characters) and mirrored in `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (Rust). These two files must remain in sync; six known mismatches exist as of v1.1.5 and are tracked in `docs/rust-fixes-needed.md`.

### 2.10.1 Supported Cloud Providers

| Provider            | Auth Method     | Streaming | Tool Use    | Vision      |
| ------------------- | --------------- | --------- | ----------- | ----------- |
| Anthropic (Claude)  | API key         | SSE       | Yes         | Yes         |
| OpenAI (GPT series) | API key         | SSE       | Yes         | Yes         |
| Google (Gemini)     | API key / OAuth | SSE       | Yes         | Yes         |
| Mistral             | API key         | SSE       | Yes         | No          |
| Groq                | API key         | SSE       | Yes         | No          |
| DeepSeek            | API key         | SSE       | Yes         | No          |
| OpenRouter          | API key         | SSE       | Passthrough | Passthrough |
| Together.ai         | API key         | SSE       | Yes         | Some models |
| Fireworks.ai        | API key         | SSE       | Yes         | Some models |

### 2.10.2 Supported Local Model Runtimes

| Runtime                 | Protocol               | Default Endpoint       | Notes                             |
| ----------------------- | ---------------------- | ---------------------- | --------------------------------- |
| Ollama                  | OpenAI-compatible REST | http://localhost:11434 | Auto-discovery supported          |
| LM Studio               | OpenAI-compatible REST | http://localhost:1234  | Auto-discovery supported          |
| vLLM                    | OpenAI-compatible REST | http://localhost:8000  | Production-grade serving          |
| llama.cpp (server mode) | OpenAI-compatible REST | http://localhost:8080  |                                   |
| llama-cpp-2 (embedded)  | Rust FFI               | In-process             | Requires `local-llm` feature flag |

### 2.10.3 Custom Endpoint Support

Any OpenAI-compatible endpoint can be added as a custom model. The `CustomModelConfig` type (from `@agiworkforce/types`) defines the schema:

```typescript
interface CustomModelConfig {
  id: string;
  name: string;
  provider: 'openai-compatible' | 'anthropic-compatible' | 'ollama';
  baseUrl: string;
  apiKey?: string; // Optional; stored via SecretManager if provided
  modelId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolUse?: boolean;
  subscriptionLevel?: number; // 0-4, maps to tier gating
}
```

---

## 2.11 MCP (Model Context Protocol) Integration

MCP is the extensibility mechanism for adding external tools to agents.

### 2.11.1 Supported Transports

| Transport                | Use Case                                       | Config Location |
| ------------------------ | ---------------------------------------------- | --------------- |
| stdio                    | Local MCP servers (spawned as child processes) | `.mcp.json`     |
| SSE (Server-Sent Events) | Remote MCP servers over HTTP                   | `.mcp.json`     |
| Streamable HTTP          | Next-generation MCP transport                  | `.mcp.json`     |

### 2.11.2 Currently Connected MCP Servers

| Server          | Capability                           |
| --------------- | ------------------------------------ |
| Gmail           | Email read, compose, send            |
| Google Calendar | Event read, create, update           |
| Vercel          | Deployment triggers, project status  |
| n8n             | Workflow execution, webhook triggers |

### 2.11.3 Code-Complete but Not Active

| Server       | Status                                |
| ------------ | ------------------------------------- |
| Google Drive | Code exists, not wired to settings UI |
| Notion       | Code exists, not wired                |
| Trello       | Code exists, not wired                |
| Asana        | Code exists, not wired                |

### 2.11.4 Tool Permission Model

| Mode                    | Behavior                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| `ask`                   | Agent pauses and requests user approval before executing                       |
| `auto-approve-readonly` | Read-only tools execute without confirmation; write tools require approval     |
| `auto-approve-all`      | All tools execute without confirmation (trusted mode — ToolGuard still active) |

Permissions are scoped per tool, per agent, and can be overridden at the project level.

---

## 2.12 Architecture Decision Records

Brief record of significant architectural decisions made prior to v1.1.5:

| ID      | Decision                                   | Rationale                                                                                                                      | Date     |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| ADR-001 | Use Tauri v2 (not Electron)                | Binary size, memory footprint, Rust safety. Tauri builds are ~10x smaller than Electron equivalents.                           | Pre-v1.0 |
| ADR-002 | SQLCipher for local storage                | Encryption at rest with no performance penalty; single-file portable database.                                                 | Pre-v1.0 |
| ADR-003 | Separate streaming HTTP client             | Avoid `stream_watchdog_timeout` on long LLM streams without disabling safety entirely.                                         | v1.1.0   |
| ADR-004 | Zustand v5 + Immer (not Redux)             | Lower boilerplate for 41 stores; Immer draft pattern fits complex nested agent state.                                          | Pre-v1.0 |
| ADR-005 | Argon2id for key derivation                | OWASP-recommended as of 2026; resistant to GPU cracking for API key storage.                                                   | v1.0.5   |
| ADR-006 | pnpm workspaces (not npm/yarn)             | Strict hoisting prevents phantom dependency bugs; faster CI caching; disk-efficient symlinks.                                  | Pre-v1.0 |
| ADR-007 | rustls over native-tls                     | Removes OpenSSL dependency; consistent TLS behavior across macOS/Windows/Linux.                                                | v1.1.0   |
| ADR-008 | `opt-level = "z"` release profile          | Desktop app binary size matters for download UX; size optimization preferred over speed for UI layer.                          | v1.0.0   |
| ADR-009 | Proprietary commercial license             | Protect IP and revenue; prevent unauthorized redistribution; allow controlled enterprise licensing via per-seat subscriptions. | v1.1.5   |
| ADR-010 | ToolGuard always-on (even in auto-approve) | User convenience (no dialogs) must not compromise security audit trail or input validation.                                    | v1.0.8   |

---

_Section 1: Vision — see `section-1-vision.md`_
_Section 3: Feature Specifications — see `section-3-features.md` (forthcoming)_

---

# Section 3: Desktop Application — Feature Requirements

**Product**: AGI Workforce Desktop
**Version**: 1.1.5
**Framework**: Tauri v2 (Rust + React/TypeScript)
**Last Updated**: 2026-02-26
**Status Legend**: `Implemented` | `Partial` | `Planned` | `Blocked`
**Priority Legend**: `P0` = Must Ship | `P1` = High | `P2` = Medium | `P3` = Nice-to-Have

---

## 3.0 Overview

The AGI Workforce Desktop application is an open, model-agnostic AI platform built on Tauri v2. The Rust backend exposes approximately 1,069 Tauri commands across 87 modules, persists state in 80+ SQLite tables managed through 55 schema migrations, and toggles behavior through 11 compile-time feature flags (`shell`, `updater`, `devtools`, `ocr`, `local-llm`, `webrtc-support`, `sentry`, `billing`, `vad`, `local-whisper`). The React/TypeScript frontend comprises 296 components, 41 Zustand stores, and 60+ custom hooks.

The requirements in this section cover six functional categories:

| Category              | Prefix  | Description                                                 |
| --------------------- | ------- | ----------------------------------------------------------- |
| Core Chat & LLM       | FR-D1xx | Multi-provider LLM routing, streaming, cost management      |
| Agent & Automation    | FR-D2xx | Autonomous agents, swarms, computer use, desktop automation |
| Tools & Integrations  | FR-D3xx | MCP, email, calendar, cloud storage, databases, messaging   |
| Memory & Intelligence | FR-D4xx | Embeddings, RAG, intent detection, research mode            |
| UI & UX               | FR-D5xx | Chat interface, settings, analytics, artifacts, canvas      |
| Desktop-Specific      | FR-D6xx | Voice, screen capture, scheduling, updates, hooks           |

---

## 3.1 Core Chat & LLM (FR-D1xx)

### 3.1.1 Multi-Provider LLM Router

**FR-D101**: **Multi-Provider LLM Routing**

- **Description**: `LLMRouter` in `core/llm/llm_router.rs` routes requests to 11 provider targets: OpenAI, Anthropic, Google, Ollama, Perplexity, XAI, DeepSeek, Qwen, Moonshot, Zhipu, and ManagedCloud. A `RoutingStrategy` enum selects behavior at request time.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/llm/llm_router.rs`, `core/llm/provider_adapter.rs`

**FR-D102**: **Routing Strategies**

- **Description**: Seven selectable strategies govern provider selection — `Auto`, `AutoEconomy`, `AutoBalanced`, `AutoPremium`, `CostOptimized`, `LatencyOptimized`, `LocalFirst`. Strategy can be set per-conversation or globally in settings.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/llm_router.rs`

**FR-D103**: **Session Cost Cap**

- **Description**: Hard session-level spending limit of $50. Router rejects further API calls once the cap is reached and surfaces a user-friendly budget-exceeded message.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/llm_router.rs`, `core/llm/cost_calculator.rs`

**FR-D104**: **Dual HTTP Client Architecture**

- **Description**: Two distinct HTTP clients are maintained: `streaming_client` with a 300-second timeout for token-by-token SSE streams, and a `regular_client` with a 120-second timeout for synchronous requests. Keepalive event propagation prevents `stream_watchdog_timeout` errors.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/llm/llm_router.rs`, `core/llm/sse_parser.rs`

**FR-D105**: **Circuit Breaker per Provider**

- **Description**: Each provider tracks `record_success` / `record_server_error` calls. After repeated failures the provider is temporarily deprioritized and traffic shifts to healthy alternatives.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/llm_router.rs`

**FR-D106**: **Provider-Specific SSE Parser**

- **Description**: `sse_parser.rs` handles provider-specific SSE delimiters and keepalive formats. `StreamChunk` carries: `content`, `done`, `finish_reason`, `usage`, `keepalive`, `tool_calls`.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/llm/sse_parser.rs`

**FR-D107**: **LLM Response Caching**

- **Description**: LRU cache with 24-hour TTL and 512-entry capacity. Identical requests skip network calls. Cache is keyed by a hash of model, messages, and parameters.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `core/llm/cache_manager.rs`

**FR-D108**: **Per-Provider Token Cost Calculation**

- **Description**: `cost_calculator.rs` maintains per-provider, per-model input/output token prices. `LLMResponse` returns `cost`, `tokens`, `credits`, and `cached` fields so the UI can display accurate spend.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/cost_calculator.rs`

**FR-D109**: **Token Counting**

- **Description**: `token_counter.rs` uses `tiktoken-rs` for pre-flight context-length validation before sending requests.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/token_counter.rs`

### 3.1.2 LLM Request / Response Model

**FR-D110**: **Rich LLM Request Parameters**

- **Description**: `LLMRequest` supports: `messages`, `model`, `temperature`, `max_tokens`, `stream`, `tools`, `tool_choice`, `thinking_mode`, `thinking_level`, `response_format`, `cache_control`, `audio_output`, `background`, `previous_response_id`, `effort`.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/llm/` (types)

**FR-D111**: **Multimodal Content Parts**

- **Description**: `ContentPart` enum supports `Text`, `Image`, `Video`, `Audio`, `Document`, `ToolUse`, `ToolResult`. Users can attach images, PDFs, and audio recordings directly in the chat input.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/llm/` (types), `UnifiedAgenticChat/`

**FR-D112**: **Extended Thinking / Reasoning**

- **Description**: `ThinkingParameter` can be `Enabled(bool)`, `Level`, `Budget`, or `Adaptive`. `LLMResponse` returns `reasoning_content` for display in a collapsible panel.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/thinking.rs`

**FR-D113**: **Server-Side Tool Support**

- **Description**: `server_tools.rs` exposes five provider-hosted tools: `WebSearch`, `CodeInterpreter`, `ImageGeneration`, `ComputerUsePreview`, `Shell`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/server_tools.rs`

**FR-D114**: **Credits & Daily Limit Tracking**

- **Description**: `CreditsInfo` struct tracks `cost_cents`, `remaining_cents`, `daily_limit/used/remaining`, `daily_reset_at`. Displayed in the usage dashboard.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/` (types), analytics commands

### 3.1.3 Chat Commands

**FR-D115**: **Core Chat Commands**

- **Description**: 26 Tauri commands in `sys/commands/chat/mod.rs` cover the full conversation lifecycle. The main `chat_send_message` handler (3,124 lines) manages streaming, tool calls, cost tracking, and multimodal content in a single dispatch path. Known tech debt: decomposition into sub-handlers is pending.
- **Priority**: P0
- **Status**: Implemented (decomposition Planned)
- **Components**: `sys/commands/chat/mod.rs`

| Command                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `chat_send_message`        | Stream message to LLM, handle tool calls, update cost |
| `chat_create_conversation` | Start new conversation, return conversation ID        |
| `chat_get_conversations`   | Paginated conversation list                           |
| `chat_get_messages`        | Message history for a conversation                    |
| `chat_update_conversation` | Rename, pin, archive                                  |
| `chat_delete_conversation` | Permanent deletion with cascade                       |
| `chat_stop_generation`     | Cancel active stream                                  |
| `chat_handle_stop`         | Cleanup after stop                                    |
| `chat_detect_intent`       | Classify user intent                                  |
| `chat_save_decision`       | Persist user decision to memory                       |
| `chat_get_cost_analytics`  | Per-conversation cost breakdown                       |
| `chat_get_cost_overview`   | Aggregate spend dashboard                             |
| `chat_compact_context`     | Summarize + truncate context window                   |

**FR-D116**: **Custom Model Support**

- **Description**: Users can add local or third-party endpoints: Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Groq, Together, Fireworks, Mistral, DeepSeek, or any OpenAI-compatible base URL. Custom models appear in every model picker alongside first-party cloud models with no separate mode or toggle required.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `settingsStore.ts`, `CustomModelsSettings.tsx`, `core/llm/provider_adapter.rs`

**FR-D117**: **Conversation State Management**

- **Description**: `conversation_state.rs` tracks active context, injected system prompts, memory fragments, and tool call history across the lifetime of a conversation.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/llm/conversation_state.rs`

---

## 3.2 Agent & Automation (FR-D2xx)

### 3.2.1 Agent Runtime

**FR-D201**: **Agent Lifecycle Manager**

- **Description**: `AgentRuntime` in `core/agent/runtime.rs` manages the full agent lifecycle: initialization, task intake, step execution, approval gating, and termination.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agent/runtime.rs`

**FR-D202**: **Task Planning**

- **Description**: `TaskPlanner` decomposes a user goal into an ordered step sequence. Supports replanning mid-execution when a step fails.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agent/planner.rs`

**FR-D203**: **Autonomous Execution Loop**

- **Description**: `AutonomousAgent` runs a step-by-step plan without user intervention. Task states: `Pending → Planning → Executing → WaitingApproval → Paused → Completed / Failed / Cancelled`.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agent/autonomous.rs`, `core/agent/executor.rs`

**FR-D204**: **Background Agents**

- **Description**: `BackgroundAgent` and `BackgroundAgentManager` run agents detached from the active chat session. A `MAX_BACKGROUND_AGENTS` cap prevents resource exhaustion. Agents can be listed, paused, resumed, cancelled, or taken over by the foreground session.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/background_agent.rs`

**FR-D205**: **Persistent Task Checkpoints**

- **Description**: `PersistentTask`, `TaskCheckpoint`, and `TaskStorage` serialize agent state to SQLite at each step. If the app restarts or crashes, tasks resume from the last checkpoint without data loss.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/background_tasks.rs`, checkpoint commands

**FR-D206**: **Continuous / Scheduled Execution**

- **Description**: `ContinuousExecutor` runs recurring tasks on cron or interval schedules with configurable daily execution limits.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/continuous_executor.rs`, `core/scheduler/`

**FR-D207**: **Per-Tool Approval Control**

- **Description**: `ApprovalController` and `ApprovalManager` enforce per-tool, per-agent approval rules. Trust levels: `Ask`, `AutoApproveReadOnly`, `AutoApproveAll`. Trusted workflow hashes bypass repeat prompts.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agent/approval.rs`

**FR-D208**: **Undo Manager**

- **Description**: `UndoManager` maintains per-agent undo stacks for file and state mutations. `FormUndoManager` handles form submission undo. `ChangeTracker` records all file changes for diff display.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/undo_manager.rs`, `core/agent/form_undo.rs`, `core/agent/change_tracker.rs`

**FR-D209**: **Context Compaction**

- **Description**: `ContextCompactor` and `ContextManager` summarize past messages when the token budget approaches the model's context window limit. `CompactionResult` and `CompactionStats` are exposed to the UI for transparency.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/context_compactor.rs`, `core/agent/context_manager.rs`

**FR-D210**: **Timeout Management**

- **Description**: `TimeoutTracker` and `TimeoutConfig` enforce per-step and per-goal wall-clock limits. `TimeoutWarning` events surface in the UI before hard cancellation.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/timeout_manager.rs`

### 3.2.2 AGI Core & Orchestration

**FR-D211**: **AGI Core Execution Engine**

- **Description**: `AGICore` in `core/agi/core.rs` is the central engine above `AgentRuntime`. It integrates hierarchical planning (`AGIPlanner`), tool dispatch (`AGIExecutor`), and 17 specialized domain executors.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agi/`

| Executor       | Domain                        |
| -------------- | ----------------------------- |
| `api`          | REST/GraphQL API calls        |
| `browser`      | Browser navigation and DOM    |
| `calendar`     | Calendar CRUD                 |
| `cloud`        | Cloud storage operations      |
| `code`         | Code generation and execution |
| `database`     | SQL/NoSQL queries             |
| `email`        | Send/receive email            |
| `file`         | Filesystem read/write         |
| `git`          | Version control operations    |
| `llm`          | Nested LLM sub-calls          |
| `mcp`          | MCP tool invocation           |
| `media`        | Image/video/audio generation  |
| `ocr`          | Screen text extraction        |
| `outcome`      | Goal success evaluation       |
| `productivity` | Notion/Trello/Asana tasks     |
| `search`       | Web and local search          |
| `terminal`     | Shell command execution       |
| `ui`           | Desktop UI interaction        |

**FR-D212**: **Hierarchical Goal Decomposition**

- **Description**: `AGIPlanner` recursively breaks high-level goals into sub-goals. `AgentOrchestrator` assigns each sub-goal to the most capable executor, using `CoordinationPattern`, `ResourceLock`, `FileGuard`, and `UiGuard` to prevent conflicts.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agi/planner.rs`, `core/agi/orchestrator.rs`

**FR-D213**: **Reflection & Failure Recovery**

- **Description**: `ReflectionEngine` analyzes failed steps, identifies `FailurePattern` and `FailureCategory`, generates `Correction` strategies, and re-queues steps with modified parameters. `LearningSystem` persists outcome-based learning for future task runs.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agi/reflection.rs`, `core/agi/learning.rs`

**FR-D214**: **Process Ontology & Reasoning**

- **Description**: `ProcessOntology` and `ProcessTemplate` encode domain-specific workflows. `ProcessReasoning` selects the best `Strategy` and records `Outcome` for later learning.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `core/agi/process_ontology.rs`, `core/agi/process_reasoning.rs`

**FR-D215**: **Knowledge Base**

- **Description**: `KnowledgeBase` stores structured facts available to all agents. `ProjectMemoryManager` extends this with `ArchitecturalDecision`, `CodingStyle`, and `ProjectContext` records scoped to a workspace.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agi/knowledge.rs`, `core/agi/project_memory.rs`

**FR-D216**: **Code Execution Sandbox**

- **Description**: `Sandbox` and `SandboxManager` execute untrusted code in an isolated environment. Output is captured and returned as a `ContentPart::ToolResult`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agi/sandbox.rs`

### 3.2.3 Multi-Agent Swarm

**FR-D217**: **Swarm Orchestrator**

- **Description**: `SwarmOrchestrator` coordinates up to 100 concurrent sub-agents using a hub-and-spoke architecture. Critical path optimization minimizes total wall-clock time.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/swarm/orchestrator.rs`

**FR-D218**: **Parallel Task Decomposition**

- **Description**: `TaskDecomposer` splits a goal into parallel subtasks and builds a `DependencyGraph`. Content-addressed SHA-256 hashing deduplicates identical subtasks; the graph is cached for 1 hour.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/swarm/task_decomposer.rs`

**FR-D219**: **Dynamic Sub-Agent Spawning**

- **Description**: `AgentSpawner` instantiates new sub-agents on demand based on task type. `ResultAggregator` synthesizes parallel outputs into a single coherent response.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/swarm/agent_spawner.rs`, `core/swarm/result_aggregator.rs`

**FR-D220**: **AGI Goal Commands**

- **Description**: 34 Tauri commands covering the full goal lifecycle including swarm, parallel, and standard goal submission modes.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `sys/commands/agi/`

| Command                              | Purpose                     |
| ------------------------------------ | --------------------------- |
| `agi_submit_goal`                    | Single-agent goal execution |
| `agi_submit_goal_auto`               | Auto-select execution mode  |
| `agi_submit_goal_parallel`           | Force parallel execution    |
| `agi_submit_goal_swarm`              | Force swarm execution       |
| `agi_get_goal_status`                | Poll goal state             |
| `agi_list_goals`                     | All goals with status       |
| `agi_cancel_goal` / `agi_abort_task` | Interrupt execution         |
| `agi_pause_task` / `agi_resume_task` | Suspend and continue        |
| `agi_get_sub_goals`                  | Inspect decomposed subtasks |
| `agi_get_reflection_insights`        | Failure analysis results    |
| `agi_get_failure_patterns`           | Aggregated failure stats    |
| `agi_get_suggestions`                | AI-generated next actions   |
| `agi_should_use_swarm`               | Complexity heuristic        |
| `agi_extend_timeout`                 | Increase wall-clock limit   |
| `agi_get_timeout_status`             | Current timeout state       |
| `agi_get_recommendations`            | Routing recommendations     |

### 3.2.4 Computer Use & Desktop Automation

**FR-D221**: **Observe-Plan-Act Loop**

- **Description**: `OPA` loop in `automation/computer_use/observe_plan_act.rs` captures a screenshot, sends it to a vision model for understanding, generates a click/type/key action plan, executes it, and observes the result. Safety guardrails reject destructive actions.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/computer_use/`

**FR-D222**: **Vision-Guided Automation**

- **Description**: `VisionAutomation` in `core/agent/vision.rs` and `vision_planner.rs` use AI vision to locate UI elements when no accessible tree is available. Supports both macOS AXUIElement and Windows UI Automation as primary methods with vision fallback.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/computer_use/visual_reasoner.rs`, `core/agent/vision.rs`

**FR-D223**: **Cross-Platform UI Inspection**

- **Description**: macOS: AXUIElement inspector (`automation/mac/`). Windows: UI Automation element tree, patterns, and actions (`automation/uia/`). Both surfaces expose a unified `ElementRef` model to higher-level automation code.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/mac/`, `automation/uia/`, `automation/inspector.rs`

**FR-D224**: **Input Simulation**

- **Description**: Keyboard (key press, hotkeys, text input), mouse (click, drag, scroll), and clipboard read/write via `enigo` with a mutex-guarded `enigo_lock` to prevent concurrent input conflicts.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/input/`

**FR-D225**: **Browser Automation**

- **Description**: CDP client with advanced DOM operations, semantic element finder, tab manager, extension bridge, and Playwright bridge. Used by the browser executor and computer use.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/browser/`

**FR-D226**: **Action Recording & Playback**

- **Description**: `recorder.rs` records all input events into a replayable script. `codegen.rs` converts recordings into JavaScript/Python automation code. Scripts are saved, loaded, listed, and deleted via 20 enhanced automation commands.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `automation/recorder.rs`, `automation/codegen.rs`

**FR-D227**: **Screen Watching**

- **Description**: `screen_watcher.rs` continuously monitors the display for triggered conditions (element appearance, text change, color region). Used by background agents for event-driven automation.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `automation/screen_watcher.rs`

---

## 3.3 Tools & Integrations (FR-D3xx)

### 3.3.1 Model Context Protocol (MCP)

**FR-D301**: **MCP Server Manager**

- **Description**: `McpServerManager` manages the lifecycle of MCP server processes. Supports three transports: `StdioTransport`, `HttpSseTransport`, and streamable HTTP.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/mcp/manager.rs`, `core/mcp/transport.rs`

**FR-D302**: **MCP Health Monitoring**

- **Description**: `McpHealthMonitor` polls each connected server every 30 seconds. `ServerStatus` is surfaced in the Extensions settings tab and used by the router to skip unhealthy servers.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/mcp/health.rs`

**FR-D303**: **MCP Tool Registry**

- **Description**: `McpToolRegistry` discovers and caches tools from all connected servers. Tool metadata (name, description, input schema) is refreshed on server restart.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/mcp/registry.rs`

**FR-D304**: **MCP Extension Installer**

- **Description**: Extensions are defined by a manifest, packaged, and installable from the repository. `installer.rs` validates the package and registers the server.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `core/mcp/extensions/`

**FR-D305**: **Connected Integrations**

| Integration     | Status      | Notes                             |
| --------------- | ----------- | --------------------------------- |
| Gmail           | Partial     | Implemented; requires OAuth setup |
| Google Calendar | Partial     | Implemented; requires OAuth setup |
| Vercel          | Implemented | Connected via MCP                 |
| n8n             | Implemented | Connected via MCP                 |
| Google Drive    | Partial     | Code exists; OAuth needed         |
| Notion          | Blocked     | No native implementation          |
| Trello          | Blocked     | No native implementation          |
| Asana           | Blocked     | No native implementation          |

### 3.3.2 Email

**FR-D306**: **Email Client**

- **Description**: IMAP (read) and SMTP (send) clients with OAuth 2.0 for Gmail. `gmail_pubsub.rs` enables push notifications for new mail without polling.
- **Priority**: P1
- **Status**: Partial (OAuth setup required)
- **Components**: `features/communications/`

| Command                | Purpose                         |
| ---------------------- | ------------------------------- |
| `email_connect`        | Authenticate and add account    |
| `email_list_accounts`  | Enumerate connected accounts    |
| `email_list_folders`   | IMAP folder tree                |
| `email_list_emails`    | Paginated email list            |
| `email_get_email`      | Full email with attachments     |
| `email_send`           | Send via SMTP                   |
| `email_search`         | Full-text search across folders |
| `email_remove_account` | Revoke and disconnect           |

### 3.3.3 Calendar

**FR-D307**: **Calendar Integration**

- **Description**: Google Calendar OAuth client with full CRUD. Outlook calendar client. Timezone normalization layer.
- **Priority**: P1
- **Status**: Partial (OAuth setup required)
- **Components**: `features/calendar/`

| Command                   | Purpose                  |
| ------------------------- | ------------------------ |
| `calendar_connect`        | Start OAuth flow         |
| `calendar_complete_oauth` | Exchange code for tokens |
| `calendar_disconnect`     | Revoke and remove        |
| `calendar_list_accounts`  | All connected accounts   |
| `calendar_list_events`    | Date-range event query   |
| `calendar_create_event`   | New event with attendees |
| `calendar_update_event`   | Modify existing event    |
| `calendar_delete_event`   | Delete event             |

### 3.3.4 Cloud Storage

**FR-D308**: **Cloud Storage with End-to-End Encryption**

- **Description**: Clients for Google Drive, Dropbox, and OneDrive. All files are encrypted with AES-256-GCM before upload; the decryption key never leaves the device.
- **Priority**: P1
- **Status**: Partial (OAuth setup required)
- **Components**: `integrations/cloud/`

**FR-D309**: **Cloud Storage Commands**

- **Description**: 10 commands: `cloud_connect/disconnect/complete_oauth`, `cloud_list_accounts`, `cloud_list/upload/download/delete/share/create_folder`.
- **Priority**: P1
- **Status**: Partial
- **Components**: `integrations/cloud/`

### 3.3.5 Document Processing

**FR-D310**: **Document Read/Write**

- **Description**: Read PDF (pdf-extract, lopdf), DOCX (docx-rs), XLSX (calamine). Write PDF (printpdf), DOCX (docx-rs), XLSX (rust_xlsxwriter). Edit all three formats in-place.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/document/`

### 3.3.6 Messaging Platforms

**FR-D311**: **Unified Messaging**

- **Description**: Platform clients for Discord, Telegram, Slack, Microsoft Teams, Signal, and WhatsApp behind a unified channel abstraction. Agents can read and send messages across platforms.
- **Priority**: P2
- **Status**: Planned
- **Components**: `features/messaging/`

### 3.3.7 Productivity Tools

**FR-D312**: **Productivity Task Sync**

- **Description**: Notion, Trello, and Asana clients through a unified task abstraction. Agents can create, update, and complete tasks across platforms.
- **Priority**: P2
- **Status**: Blocked
- **Components**: `features/productivity/`

### 3.3.8 Terminal

**FR-D313**: **AI-Assisted Terminal**

- **Description**: PTY-based terminal using `portable-pty`. Shell detection auto-configures PATH. AI assistant generates command suggestions, explains errors, and proposes fixes. Sessions are managed and named.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/terminal/`

### 3.3.9 Database Connections

**FR-D314**: **Multi-Database Client**

- **Description**: SQL clients: SQLite, PostgreSQL, MySQL. NoSQL: MongoDB. Cache: Redis. `query_builder.rs` enforces parameterized queries (Select/Insert/Update/Delete). `security.rs` rejects SQL injection patterns.
- **Priority**: P1
- **Status**: Implemented (Docker required for PostgreSQL/MySQL)
- **Components**: `data/database/`

### 3.3.10 API Operations

**FR-D315**: **Generic API Commands**

- **Description**: 15 commands for REST operations (`api_get`, `api_post_json`, `api_put_json`, `api_delete`, `api_request`), JSON path extraction, Jinja2-style template rendering, OAuth flows (auth URL, code exchange, refresh, client credentials, client creation).
- **Priority**: P1
- **Status**: Implemented
- **Components**: `sys/commands/api/`

### 3.3.11 Git

**FR-D316**: **Git Operations**

- **Description**: Full set of git commands accessible to agents: init, clone, status, diff, add, commit, push, pull, branch, checkout, merge, rebase, log, stash.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `sys/commands/git/`

### 3.3.12 Code Editing

**FR-D317**: **AI-Native Code Editing**

- **Description**: 10 commands supporting a diff-based edit workflow: `code_generate_edit`, `code_apply_edit`, `code_reject_edit`, `code_list_pending_edits`, `composer_start_session/get_session/apply_session`, `apply_changes`, `revert_changes`. 8 AI-native commands for generate, refactor, test, analyze, context prompt, constraints, file access, and project context.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `sys/commands/code/`

---

## 3.4 Memory & Intelligence (FR-D4xx)

### 3.4.1 Embeddings & Semantic Search

**FR-D401**: **Workspace Embedding Index**

- **Description**: `IncrementalIndexer` processes workspace files into vector embeddings using `EmbeddingGenerator`. Progress is streamed to the UI. Index is stored in `.agi/embeddings.db`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/embeddings/indexer.rs`

**FR-D402**: **Code Chunking**

- **Description**: `CodeChunker` splits source files into semantically meaningful chunks (function, class, block) using multiple `ChunkStrategy` options before embedding.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/embeddings/chunker.rs`

**FR-D403**: **Similarity Search**

- **Description**: `SimilaritySearch` ranks chunks by cosine similarity against a query embedding. Used by RAG, memory recall, and the codebase indexer.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/embeddings/similarity.rs`

**FR-D404**: **Embedding Cache**

- **Description**: `EmbeddingCache` avoids re-embedding unchanged files. `CacheStats` tracks hit rate and size for the settings dashboard.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `core/embeddings/cache.rs`

### 3.4.2 Retrieval-Augmented Generation

**FR-D405**: **RAG Pipeline**

- **Description**: `rag_system.rs` orchestrates chunk retrieval, context injection, and source attribution. Used during `chat_send_message` to ground responses in workspace context.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agent/rag_system.rs`

**FR-D406**: **Hybrid Search (Semantic + FTS)**

- **Description**: `memory_persistence.rs` combines vector similarity with SQLite FTS5 full-text search. `HybridSearchResult` merges and re-ranks results from both sources.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agi/memory_persistence.rs`

### 3.4.3 Memory Layers

**FR-D407**: **AGI Working Memory**

- **Description**: `AGIMemory` holds in-session working state: current goal, sub-goal stack, active tool results, and intermediate reasoning.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `core/agi/memory.rs`

**FR-D408**: **Persistent Memory Store**

- **Description**: `MemoryManager` persists `MemoryEntry` records across sessions, categorized as `Preference`, `Fact`, `Decision`, or `Context`. Memories are injected into future conversations via 11 chat memory commands.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/agi/memory_manager.rs`, `core/agi/memory_persistence.rs`

**FR-D409**: **Chat Memory Commands**

| Command                            | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `chat_configure_memory_injection`  | Control what memories are injected        |
| `chat_recall_memory`               | Retrieve relevant memories for a message  |
| `chat_search_memories`             | Keyword/semantic search over memory store |
| `chat_load_project_memories`       | Load workspace-scoped memories            |
| `chat_prefetch_session_memories`   | Pre-load at session start                 |
| `chat_suggest_memories_for_review` | Surface stale or conflicting memories     |
| `chat_get_memory_dashboard`        | Aggregate memory stats                    |
| `chat_set_monthly_budget`          | Cap spend attributed to memory ops        |

### 3.4.4 Intent Detection

**FR-D410**: **Intent Classifier**

- **Description**: `IntentDetector` classifies each incoming message into an intent category using pattern matching and a lightweight LLM call. `quick_win.rs` routes simple intents (e.g., quick calculator, timezone convert) without invoking the full agent pipeline.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/intent/`

### 3.4.5 Research Mode

**FR-D411**: **Multi-Source Research Orchestration**

- **Description**: `research/orchestrator.rs` dispatches parallel research sub-agents across web sources. Modes: `Quick` (1-3 sources), `Standard` (5-10 sources), `Deep` (20+ sources), `Exhaustive` (unlimited with citation dedup). Reports include inline citations tracked by `citation.rs`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/research/`

### 3.4.6 Skills System

**FR-D412**: **Skills Manager**

- **Description**: `SkillsManager` loads `SKILL.md`-formatted files from a configurable directory. Each skill has YAML frontmatter and natural-language instructions under 5,000 tokens. Skills are auto-invoked by the agent when a matching trigger phrase is detected.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/skills/`

---

## 3.5 UI & UX (FR-D5xx)

### 3.5.1 Main Chat Interface

**FR-D501**: **Unified Agentic Chat**

- **Description**: `UnifiedAgenticChat/` (110K line orchestrator component) provides the primary user interaction surface: message composition with multimodal attachments, streaming token display, tool-call visualization, reasoning panel, cost indicator, and conversation history sidebar.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src/components/UnifiedAgenticChat/`

**FR-D502**: **Tool Call Visualization**

- **Description**: `ToolCalling/` components render in-progress and completed tool invocations with expandable arguments, result diffs, and approval prompts. Each tool call shows its display name, status icon, and elapsed time.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src/components/ToolCalling/`

**FR-D503**: **Simple Mode Toggle**

- **Description**: `SimpleMode/` provides a reduced-complexity UI hiding agent controls, tool panels, and advanced settings. Targeted at non-technical users. Toggled from the header bar.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/SimpleMode/`

**FR-D504**: **Floating Chat Overlay**

- **Description**: `FloatingChat/` renders a minimal always-on-top chat window that persists while the user works in other applications. Supports quick message entry and displays streaming responses.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/FloatingChat/`

**FR-D505**: **Quick Query Interface**

- **Description**: `QuickQuery/` provides a global hotkey-activated command palette for rapid single-turn queries without opening the full app window.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/QuickQuery/`

### 3.5.2 Settings

**FR-D506**: **9-Tab Settings Panel**

- **Description**: Settings panel with tabs: Custom Models, Agents, Instruction Files, Extensions (MCP), Skills & Plugins, Features & Privacy, Data & Privacy, Window, System. State persisted in Zustand with `persist` middleware (v10 migration).
- **Priority**: P1
- **Status**: Implemented
- **Components**: `src/components/Settings/`

| Tab                | Key Settings                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| Custom Models      | Add Ollama/OpenRouter/Groq/any OpenAI-compatible endpoint, test connection |
| Agents             | Approval mode, sub-agent toggle, execution preferences, trusted workflows  |
| Instruction Files  | Auto-discover and merge CLAUDE.md, AGENTS.md, .cursorrules, GEMINI.md      |
| Extensions         | MCP server management, transport config, enable/disable                    |
| Skills & Plugins   | Installed skills, project resources, plugin registry                       |
| Features & Privacy | Feature flags, telemetry consent, analytics opt-out                        |
| Data & Privacy     | Memory export/delete, conversation history, local data controls            |
| Window             | Theme, font size, always-on-top, sidebar layout                            |
| System             | Updater, dev tools, cache management, diagnostic logs                      |

### 3.5.3 Artifacts

**FR-D507**: **Artifacts Viewer & Editor**

- **Description**: 22-command artifact system for creating, versioning, and exporting code and document outputs. Supports rollback to any previous version, inline diffs, tags, pinning, archiving, and streaming artifact creation.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `src/components/Artifacts/`

### 3.5.4 Canvas

**FR-D508**: **Visual Canvas**

- **Description**: 13-command canvas system for freeform spatial arrangement of notes, code snippets, images, and agent outputs. Used for visual planning and brainstorming workflows.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/Canvas/`

### 3.5.5 Analytics & ROI Dashboard

**FR-D509**: **Usage Analytics**

- **Description**: 29 analytics commands track tool usage, session activity, cost trends, and time saved. `calculate_roi` computes dollar-value productivity gains. Weekly and monthly reports are generated and exportable.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/Analytics/`, `src/components/ROIDashboard/`

| Command Group  | Commands                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| Event tracking | `track_event`, `get_usage_stats`, `get_feature_usage`, `flush_events`     |
| Tool metrics   | `get_tool_metrics`, `get_process_metrics`                                 |
| ROI            | `calculate_roi`, `get_cost_saved_trend`, `get_time_saved_trend`           |
| Reporting      | `generate_weekly_report`, `generate_monthly_report`, `export_report`      |
| Data mgmt      | `save_snapshot`, `delete_all_data`, `get_session_id`, `set_user_property` |

### 3.5.6 Onboarding & Tutorials

**FR-D510**: **First-Run Onboarding**

- **Description**: `Onboarding/` guides new users through API key setup, first model connection, and first conversation. Progress is persisted and resumable.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `src/components/Onboarding/`

**FR-D511**: **Interactive Tutorials**

- **Description**: `Tutorials/` provides step-by-step in-app walkthroughs for advanced features: multi-agent swarms, computer use, custom models, and MCP configuration.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `src/components/Tutorials/`

### 3.5.7 State Management

**FR-D512**: **41 Zustand Stores**

- **Description**: Application state is distributed across 41 Zustand stores (v5 + Immer + Persist). Key stores: `chatStore`, `agentStore`, `toolStore`, `authStore`, `billingStore`, `automationStore`, `browserStore`, `calendarStore`, `emailStore`, `filesystemStore`, `memoryStore`, `mcpStore`, `researchStore`, `schedulerStore`, `settingsStore`, and 26 domain stores. Max mapping ID cap of 1,000 entries (STR-002 fix applied).
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src/stores/`

**FR-D513**: **60+ Custom Hooks**

- **Description**: `useAgenticEvents` (95K line central event hub) bridges Tauri event emissions to React state. Domain hooks/stores include `useBrowserAutomation`, `useCalendar`, `useEmail`, `useGit`, MCP via `mcpStore` + `api/mcp.ts`, `useMemory`, `useVoiceInput`, `useVoiceTranscription`, `useOCR`, `useCloudStorage`, and 50+ others.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src/hooks/`

---

## 3.6 Desktop-Specific Features (FR-D6xx)

### 3.6.1 Voice

**FR-D601**: **Local Speech-to-Text (Whisper)**

- **Description**: `local_stt.rs` runs Whisper models on-device. Supported model sizes: `tiny`, `base`, `small`, `medium`, `large`. No audio data leaves the device. Enabled by the `local-whisper` feature flag.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/speech/local_stt.rs`

**FR-D602**: **Cloud Speech-to-Text (Deepgram)**

- **Description**: `deepgram.rs` streams audio to Deepgram for real-time transcription with word-level timestamps and confidence scores.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/speech/deepgram.rs`

**FR-D603**: **Text-to-Speech**

- **Description**: `tts.rs` plays synthesized speech via the managed cloud API. `local_tts.rs` uses Piper for on-device synthesis. macOS native TTS available as fallback. Voice definitions in `PiperVoiceDefinitions`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/speech/tts.rs`, `features/speech/local_tts.rs`

**FR-D604**: **Voice Activity Detection**

- **Description**: `SharedVad` detects speech onset and silence boundaries for hands-free push-to-talk. Enabled by the `vad` feature flag.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/speech/vad.rs`

**FR-D605**: **Wake Word Detection**

- **Description**: `VoiceWake` monitors microphone input for a configurable wake phrase. `WakeWordConfig` sets the phrase and sensitivity threshold.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `features/speech/wake.rs`

**FR-D606**: **Barge-In & Push-to-Talk**

- **Description**: `BargeInDetector` allows users to interrupt ongoing TTS playback by speaking. `PushToTalk` binds a global hotkey for discrete voice capture.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `features/speech/barge_in.rs`, `features/speech/ptt.rs`

### 3.6.2 Screen Capture & OCR

**FR-D607**: **Screen Capture**

- **Description**: 8 commands via `xcap` (macOS/Linux) and DXGI (Windows): `capture_screen_full`, `capture_screen_region`, `capture_screen_window`, `capture_get_windows`, `capture_get_history`, `capture_delete`, `capture_from_clipboard`, `capture_save_to_clipboard`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/screen/`

**FR-D608**: **OCR**

- **Description**: Tesseract-based OCR (`ocr` feature flag) extracts text from screenshots and captured regions. Used by computer use, the file executor, and the `automation_ocr` command.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `automation/screen/ocr.rs`

### 3.6.3 Scheduler

**FR-D609**: **Task Scheduler**

- **Description**: `core/scheduler/` wraps `tokio-cron-scheduler` to support cron expressions, fixed intervals, and one-time `at` scheduling for background agents and automation scripts.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/scheduler/`

### 3.6.4 Auto-Updater

**FR-D610**: **Signed Auto-Update**

- **Description**: `features/updater.rs` checks for new releases and applies delta updates. All update packages are verified with Ed25519 signatures before installation. Enabled by the `updater` feature flag.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/updater.rs`

### 3.6.5 Hooks System

**FR-D611**: **Agent Lifecycle Hooks**

- **Description**: `core/hooks/` fires four lifecycle events: `PreToolUse` (validate/block before tool executes), `PostToolUse` (log results, trigger side-effects), `Stop` (agent completion handler), `SubagentStop` (sub-agent completion handler). Hooks are configured in `.claude/settings.json`.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `core/hooks/`

### 3.6.6 Security & Sandboxing

**FR-D612**: **Tauri Capability Filesystem Deny List**

- **Description**: 19 filesystem path patterns are blocked at the Tauri capability layer, including `.env` files, shell configs, credential stores, and SSH keys. Enforced before any Rust code runs.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src-tauri/capabilities/default.json`

**FR-D613**: **ToolGuard Execution Sandbox**

- **Description**: 1,778-line `ToolGuard` inspects every tool invocation against a deny list of dangerous operations before dispatching to the executor.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src-tauri/src/security/`

**FR-D614**: **Secret Manager**

- **Description**: All API keys and credentials are stored through `SecretManager` using Argon2id key derivation and AES-256-GCM encryption. Keys are never written to plaintext files or logged.
- **Priority**: P0
- **Status**: Implemented
- **Components**: `src-tauri/src/security/`

### 3.6.7 Instruction File Discovery

**FR-D615**: **Multi-Tool Instruction File Merge**

- **Description**: On workspace open, the app scans for instruction files from all AI tools: `CLAUDE.md`, `MEMORY.md`, `AGENTS.md`, `.claude/rules/*.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.windsurfrules`, `.github/copilot-instructions.md`. All discovered files are merged into a unified system context. Projects migrating from any AI tool retain their instructions automatically.
- **Priority**: P1
- **Status**: Partial (discovery implemented; full merge pipeline in progress)
- **Components**: `src/components/Settings/InstructionFilesSettings.tsx`

### 3.6.8 Teams & Billing

**FR-D616**: **Team Management**

- **Description**: `features/teams/` covers team creation, role-based permissions, shared billing, activity logging, and shared resource pools. Scoped under the `billing` feature flag.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `features/teams/`

**FR-D617**: **Stripe Billing Integration**

- **Description**: Subscription management and usage-based billing reconciliation. Scoped under the `billing` feature flag.
- **Priority**: P1
- **Status**: Implemented
- **Components**: `features/billing/`

### 3.6.9 Workflow Marketplace

**FR-D618**: **Workflow Publishing & Marketplace**

- **Description**: `features/workflows/` enables users to publish, discover, rate, favorite, and comment on shared automation workflows. Templates marketplace provides curated starting points.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `features/workflows/`

### 3.6.10 Cache Management

**FR-D619**: **Multi-Layer Cache System**

- **Description**: 22 cache commands manage LLM response cache, codebase index cache, and embedding cache. Operations: `cache_get_stats/analytics`, `cache_configure`, `cache_clear_all/by_provider/by_type`, `cache_prune_expired`, `cache_warmup`, `cache_export`, `cache_get_size`.
- **Priority**: P2
- **Status**: Implemented
- **Components**: `sys/commands/cache/`

---

## 3.7 Feature Audit Summary

| Feature                    | Audit Status | Notes                                          |
| -------------------------- | ------------ | ---------------------------------------------- |
| Core chat & streaming      | PASS         | All providers streaming correctly              |
| Model switching            | PASS         | All 11 providers switchable in-session         |
| Extended thinking          | PASS         | Reasoning content displayed                    |
| Vision / OCR               | PASS         | Screenshot + Tesseract working                 |
| Creative generation        | PASS         | Image and video generation functional          |
| File operations            | PASS         | Read/write/edit across formats                 |
| Git integration            | PASS         | Full git workflow via commands                 |
| Terminal                   | PASS         | PTY-based with AI assist                       |
| Code generation            | PASS         | Diff-based apply/reject flow                   |
| Screenshot                 | PASS         | Full, region, window capture                   |
| Voice (STT/TTS)            | PASS         | Local Whisper + Deepgram + Piper               |
| Reminders & calendar       | PASS         | Create/update/delete events                    |
| Image generation           | PASS         |                                                |
| Video generation           | PASS         |                                                |
| Multi-agent swarm          | PASS         | 5 parallel agents + resume + checkpoints       |
| Web search                 | PARTIAL      | Working; depth controls in progress            |
| Browser form filling       | PARTIAL      | Basic fills working; complex forms in progress |
| Google Calendar OAuth      | PARTIAL      | Code complete; OAuth credentials needed        |
| Gmail OAuth                | PARTIAL      | Code complete; OAuth credentials needed        |
| Cloud storage OAuth        | PARTIAL      | Code complete; OAuth credentials needed        |
| Instruction file discovery | PARTIAL      | Discovery working; merge pipeline in progress  |
| Docker-dependent features  | FAIL         | Requires `docker compose up -d postgres`       |
| Notion native integration  | BLOCKED      | No native client; MCP bridge needed            |
| Trello native integration  | BLOCKED      | No native client; MCP bridge needed            |
| Asana native integration   | BLOCKED      | No native client; MCP bridge needed            |
| Some MCP connections       | BLOCKED      | Server config / auth varies by tool            |

---

## 3.8 Command Count by Category

| Category              | Command Count |
| --------------------- | ------------- |
| Chat                  | 26            |
| AGI / Goal execution  | 34            |
| Agent runtime         | 8             |
| Background agent      | 11            |
| Background task       | 18            |
| Automation (basic)    | 21            |
| Automation (enhanced) | 20            |
| Computer use          | 11            |
| Checkpoint            | 13            |
| Analytics             | 29            |
| Artifacts             | 22            |
| Canvas                | 13            |
| Database              | 40            |
| API operations        | 15            |
| Email                 | 8             |
| Calendar              | 8             |
| Cloud storage         | 10            |
| Cache management      | 22            |
| Chat memory           | 11            |
| Screen capture        | 8             |
| **Total**             | **~1,069**    |

---

_End of Section 3 — Desktop Application Feature Requirements_

---

# Section 4 — Web Application

> PRD: AGI Workforce
> Last updated: 2026-02-26

---

## 4.1 Overview

The AGI Workforce web application is a full-stack Next.js 16 application that serves as both a standalone AI chat product and the account/billing layer for the desktop client. It provides plan management, credit tracking, media generation, conversation history, and the authoritative identity layer that desktop instances sync against.

The web app is deployed on Vercel (serverless, per-route `maxDuration` configuration) and uses Supabase as the primary database and authentication provider. All LLM and media generation requests are credit-gated and routed through server-side API routes — no provider API keys are exposed to the browser.

---

## 4.2 Technology Stack

| Category        | Technology                                             | Notes                              |
| --------------- | ------------------------------------------------------ | ---------------------------------- |
| Framework       | Next.js 16, App Router                                 | Server Components + Server Actions |
| Language        | TypeScript (strict mode)                               | All files `.ts` / `.tsx`           |
| Database / Auth | Supabase (PostgreSQL, Auth, SSR)                       | Row-level security on all tables   |
| Payments        | Stripe SDK, API version `2026-02-25.clover`            | Webhook + portal + checkout        |
| Rate Limiting   | Upstash Redis + `@upstash/ratelimit`                   | Per-user and per-IP                |
| State           | Zustand v5 + Immer + Persist                           | See §4.9 for store catalog         |
| Validation      | Zod v4 (`.strict()` schemas)                           | All API route inputs               |
| UI              | Radix UI, Tailwind CSS v4, Lucide icons, Sonner toasts |                                    |
| Markdown        | `react-markdown`, `remark-gfm`, KaTeX                  | Chat messages + docs               |
| Logging         | Pino + pino-pretty                                     | Structured JSON in prod            |
| i18n            | i18next, react-i18next                                 | Languages: `en`, `es`              |
| Testing         | Playwright (e2e), Vitest, MSW                          |                                    |
| Deploy          | Vercel serverless                                      | `maxDuration` set per route        |

---

## 4.3 Page Routes

### 4.3.1 Public Routes

| Route                   | Purpose                  | Notes                                                          |
| ----------------------- | ------------------------ | -------------------------------------------------------------- |
| `/`                     | Landing page             | Marketing, hero, feature highlights                            |
| `/pricing`              | Plan comparison          | Billing interval toggle, upgrade CTA, waitlist CTA for Pro/Max |
| `/download`             | Desktop app download     | Links to platform builds, beta channel                         |
| `/login`                | Email/password login     | Redirects via `?next=` after success                           |
| `/signup`               | New account registration | Creates Supabase user, initialises credit account              |
| `/forgot-password`      | Password reset request   | Sends reset email via Supabase Auth                            |
| `/auth/update-password` | Password reset landing   | Consumes token from email link                                 |
| `/verify`               | Email verification       | Processes Supabase verification token                          |
| `/privacy`              | Privacy policy           | Static                                                         |
| `/terms`                | Terms of service         | Static                                                         |
| `/about`                | About page               | Static                                                         |
| `/contact`              | Contact page             | Form submits to support queue                                  |
| `/faq`                  | FAQ                      | Static, expandable accordions                                  |
| `/get-started`          | Onboarding guide         | Step-by-step setup walkthrough                                 |
| `/docs`                 | Documentation            | MDX-based, full-text searchable                                |

### 4.3.2 Authenticated Routes

All authenticated routes validate the Supabase session in middleware. Unauthenticated requests are redirected to `/login?next=<original-path>`.

| Route                 | Purpose                 | Notes                                        |
| --------------------- | ----------------------- | -------------------------------------------- |
| `/chat`               | Main AI chat interface  | Model selector, message history, streaming   |
| `/dashboard`          | Main dashboard hub      | Summary cards, quick actions                 |
| `/dashboard/billing`  | Subscription management | Plan status, top-up credits, invoice history |
| `/dashboard/chat`     | Chat history            | Conversation list, search, delete            |
| `/dashboard/settings` | User and app settings   | Theme, model defaults, notifications         |
| `/dashboard/media`    | Media generation        | Image and video generation UI                |
| `/dashboard/usage`    | Analytics               | Token usage, credit consumption charts       |
| `/payment-failure`    | Post-checkout failure   | Retry/support CTA                            |
| `/diagnose`           | Debug/diagnostic tool   | Dev/support use only                         |

---

## 4.4 API Endpoint Catalog

All state-changing endpoints require a valid CSRF token passed via the `X-CSRF-Token` header. Server modules import `'server-only'` to prevent accidental client-side execution. All request bodies are validated with Zod `.strict()` schemas before processing.

### 4.4.1 Authentication Endpoints (`/api/auth/`)

| Method | Path                       | Auth        | Rate Limit      | Purpose                                                                      |
| ------ | -------------------------- | ----------- | --------------- | ---------------------------------------------------------------------------- |
| POST   | `/api/auth/sso`            | None        | 10/min per IP   | Enterprise SSO login via SAML/OIDC; exchanges assertion for Supabase session |
| GET    | `/api/auth/sso-check`      | None        | 30/min per IP   | Check SSO availability for a given email domain; returns provider config     |
| POST   | `/api/auth/security`       | Session     | 20/min per user | Security event logging (failed logins, suspicious actions)                   |
| GET    | `/api/auth/directory-sync` | Admin token | —               | List enterprise directory sync records (users/groups)                        |
| POST   | `/api/auth/directory-sync` | Admin token | —               | Trigger or update enterprise directory sync                                  |

**FR-W01: SSO Login Flow** — The `/api/auth/sso` endpoint must accept a SAML assertion or OIDC callback, validate the assertion against the stored IdP metadata, and exchange it for a Supabase session. The response must set a secure, HttpOnly session cookie.

**FR-W02: Domain-Based SSO Lookup** — `/api/auth/sso-check` must accept an `email` query parameter, extract the domain, and return the configured SSO provider (or `null` if none) so the login page can present the correct authentication method automatically.

### 4.4.2 Billing and Subscription Endpoints

| Method | Path                      | Auth               | Rate Limit              | Purpose                                                                                 |
| ------ | ------------------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/api/checkout`           | Session            | Per-user, 5/min         | Create Stripe Checkout session for new subscription                                     |
| POST   | `/api/portal`             | Session            | Per-user, 5/min         | Create Stripe Billing Portal session for existing subscriber                            |
| POST   | `/api/credit-topup`       | Session            | Per-user, 3/min         | Create Stripe Checkout session for one-time credit purchase ($10–$1,000); Max plan only |
| POST   | `/api/stripe-webhook`     | Stripe signature   | N/A (Stripe-controlled) | Ingest and process Stripe webhook lifecycle events                                      |
| GET    | `/api/cron/reset-credits` | Cron secret header | N/A                     | Monthly credit reset job, invoked by Vercel Cron                                        |
| POST   | `/api/sync-subscription`  | Session            | 5/min                   | Sync Stripe subscription state into Supabase `profiles` table                           |

**Stripe Webhook Events Handled:**

| Event                                  | Action                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `checkout.session.completed`           | Activate subscription, set `stripe_customer_id` in profile, initialise credit account |
| `customer.subscription.created`        | Insert subscription record, set tier in profile                                       |
| `customer.subscription.updated`        | Update tier, status, period end date                                                  |
| `customer.subscription.deleted`        | Downgrade to free tier, preserve credit balance for grace period                      |
| `customer.subscription.trial_will_end` | Queue trial-ending notification email                                                 |

**FR-W03: Checkout Session** — `/api/checkout` must validate that the user does not already have an active subscription before creating a session. The `success_url` must include `?session_id={CHECKOUT_SESSION_ID}` for reconciliation. Open redirect prevention: the `success_url` and `cancel_url` origins must be validated against the CORS allowlist.

**FR-W04: Credit Top-Up** — Top-up is restricted to Max-tier and Enterprise users. Amount must be between $10 and $1,000. The resulting credit grant is one-time, non-expiring, and separate from the monthly allocation.

**FR-W05: Webhook Idempotency** — All Stripe webhook handlers must use the Stripe event `id` as an idempotency key to prevent double-processing on Stripe retries.

**FR-W06: Monthly Credit Reset** — The Vercel Cron job must run on the first day of each calendar month UTC. It must reset monthly allocations without touching one-time top-up balances or daily allocations.

### 4.4.3 LLM / AI Endpoints

| Method | Path                           | Auth         | Rate Limit            | maxDuration | Purpose                                               |
| ------ | ------------------------------ | ------------ | --------------------- | ----------- | ----------------------------------------------------- |
| POST   | `/api/llm/completion`          | Bearer token | Per-user (tier-based) | 120s        | Full LLM completion with credit gating, SSE streaming |
| POST   | `/api/llm/v1/chat/completions` | Bearer token | Per-user (tier-based) | 120s        | OpenAI-compatible completions endpoint                |

**FR-W07: Credit-Gated LLM Completion** — Before forwarding to any LLM provider, the completion endpoint must call `check_credits_available` via Supabase RPC. If insufficient credits, return HTTP 402 with a `credit_balance` field in the error body. Credits are reserved at request start and reconciled (actual token cost) after the response completes.

**FR-W08: SSE Streaming** — The `/api/llm/completion` endpoint must stream responses using Server-Sent Events with `Content-Type: text/event-stream`. Each event must carry a `delta` field. A final `[DONE]` event signals stream end.

**FR-W09: TTFT SLO Monitoring** — The OpenAI-compatible endpoint (`/api/llm/v1/chat/completions`) must record time-to-first-token (TTFT). Target SLO: 2,500ms. Breach threshold: 5,000ms. Breaches must be logged to the structured log at `warn` level with model, provider, and user tier context.

**FR-W10: Tier-Based Model Access** — Model access must be enforced server-side per the tier matrix in §4.7. Attempting to use a model above the user's tier must return HTTP 403 with a `required_tier` field.

### 4.4.4 Media Generation Endpoints

| Method | Path                        | Auth   | maxDuration | Purpose                                     |
| ------ | --------------------------- | ------ | ----------- | ------------------------------------------- |
| POST   | `/api/media/image/generate` | Bearer | 60s         | Synchronous image generation                |
| POST   | `/api/media/video/generate` | Bearer | 60s         | Initiate asynchronous video generation task |
| GET    | `/api/media/video/status`   | Bearer | —           | Poll video task status by task ID           |

**Image Generation Provider Cascade:**

1. Imagen 4 (primary)
2. DALL-E 3 (fallback)
3. Stability AI (final fallback)

The cascade proceeds to the next provider on any non-200 response or timeout. The response includes a `provider` field indicating which provider served the request.

**Video Generation Providers:**

| Provider          | Duration Options | Resolution  | Estimated Wait |
| ----------------- | ---------------- | ----------- | -------------- |
| Runway Gen4 Turbo | 2s, 5s, 10s      | 720p, 1080p | 60–160s        |
| Veo 3.1           | 4s, 6s, 8s       | Up to 4K    | 90–210s        |

**FR-W11: Async Video Task** — The video generation endpoint must return immediately with a task ID (format: `runway_{id}` or `google_{operationId}`) and HTTP 202. The client polls `/api/media/video/status?task_id={id}` for completion. Status values: `pending`, `processing`, `completed`, `failed`.

**FR-W12: Media Access Gate** — Image and video generation endpoints must reject requests from Free, Hobby, and Pro tier users with HTTP 403. Only Max, Enterprise, and Team tiers may access media generation.

### 4.4.5 Chat / Conversation Endpoints

| Method | Path                           | Auth    | Purpose                                                                |
| ------ | ------------------------------ | ------- | ---------------------------------------------------------------------- |
| GET    | `/api/chat/conversations`      | Session | List all conversations for the authenticated user (paginated, 50/page) |
| POST   | `/api/chat/conversations`      | Session | Create a new conversation; returns `id`, `created_at`, `title`         |
| GET    | `/api/chat/conversations/[id]` | Session | Retrieve a single conversation with its full message array             |
| PUT    | `/api/chat/conversations/[id]` | Session | Update conversation metadata (title, pinned status)                    |
| DELETE | `/api/chat/conversations/[id]` | Session | Soft-delete conversation (hard-deleted after 30 days)                  |

**FR-W13: Conversation Ownership** — All conversation endpoints must enforce row-level security: a user may only read, modify, or delete conversations where `user_id = auth.uid()`. The API layer must never expose another user's conversation ID or content.

### 4.4.6 User / Account Endpoints

| Method | Path               | Auth    | Purpose                                                                   |
| ------ | ------------------ | ------- | ------------------------------------------------------------------------- |
| GET    | `/api/me`          | Session | Return current user profile (id, email, tier, credit balance, created_at) |
| GET    | `/api/user/data`   | Session | GDPR data export request; queues async export job                         |
| GET    | `/api/user/export` | Session | Download completed data export archive (ZIP)                              |
| DELETE | `/api/user/...`    | Session | Initiate account deletion; 30-day grace period before permanent removal   |

**FR-W14: GDPR Export** — The data export must include: profile, all conversations + messages, billing history, settings. The export must be delivered as a downloadable ZIP within 24 hours of request.

### 4.4.7 Device Linking Endpoints

| Method | Path                  | Auth    | Purpose                                                             |
| ------ | --------------------- | ------- | ------------------------------------------------------------------- |
| POST   | `/api/device/link`    | Session | Initiate device link; returns a short-lived `link_code` (5-min TTL) |
| GET    | `/api/device/poll`    | Session | Long-poll for device link confirmation (20s max hold)               |
| POST   | `/api/device/approve` | Session | Approve a pending device link request by `link_code`                |

**FR-W15: Device Linking Flow** — The desktop app requests a link code from the web app. The user approves in the web dashboard. The desktop polls until approval or timeout. On approval, the desktop receives a signed token tied to the `user_id`. Link codes expire after 5 minutes and are single-use.

### 4.4.8 Voice Endpoints

| Method | Path                    | Auth   | Rate Limit      | Purpose                                                                             |
| ------ | ----------------------- | ------ | --------------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/voice/transcribe` | Bearer | 30/min per user | Transcribe uploaded audio via Whisper API; returns `text`, `language`, `duration_s` |
| GET    | `/api/voice/health`     | None   | —               | Voice service health check; returns provider availability                           |

**FR-W16: Audio Transcription** — Accepted formats: `audio/webm`, `audio/ogg`, `audio/wav`, `audio/mp4`. Maximum file size: 25MB. The endpoint must forward to the Whisper API and return the transcript within the `maxDuration` budget.

### 4.4.9 Admin Endpoints

| Method   | Path                        | Auth      | Purpose                                                           |
| -------- | --------------------------- | --------- | ----------------------------------------------------------------- |
| GET      | `/api/admin/*`              | Admin JWT | Admin management endpoints (user list, tier override, suspension) |
| GET/POST | `/api/admin/sso`            | Admin JWT | Manage enterprise SSO provider configurations                     |
| GET/POST | `/api/admin/directory-sync` | Admin JWT | Manage enterprise directory sync jobs                             |

Admin JWT is a separate short-lived token (1h) issued only to users with `role = admin` in the `profiles` table.

### 4.4.10 Release Endpoints

| Method | Path                     | Auth | Purpose                                                                  |
| ------ | ------------------------ | ---- | ------------------------------------------------------------------------ |
| GET    | `/api/releases/latest`   | None | Latest desktop release metadata (version, date, notes)                   |
| GET    | `/api/releases/[target]` | None | Release artifact for a specific platform target (e.g., `darwin-aarch64`) |
| GET    | `/api/releases/check`    | None | Check if update is available given `current_version` query param         |

**FR-W17: Auto-Update Check** — `/api/releases/check` accepts `current_version` and `platform` query parameters and returns `{ update_available: boolean, latest_version, download_url }`. The desktop app polls this endpoint on startup and every 4 hours.

### 4.4.11 Waitlist Endpoints

| Method | Path            | Auth    | Purpose                                             |
| ------ | --------------- | ------- | --------------------------------------------------- |
| POST   | `/api/waitlist` | Session | Join waitlist for Pro or Max plan; records position |
| GET    | `/api/waitlist` | Session | Get current waitlist status and estimated position  |

### 4.4.12 Utility Endpoints

| Method | Path                      | Auth    | Purpose                                                          |
| ------ | ------------------------- | ------- | ---------------------------------------------------------------- |
| GET    | `/api/health`             | None    | Application health check (DB connectivity, cache)                |
| GET    | `/api/csrf`               | None    | Issue a CSRF token bound to the current session                  |
| POST   | `/api/validate-webhook`   | None    | Validate an inbound webhook signature (generic)                  |
| GET    | `/api/webhook-diagnostic` | None    | Webhook delivery diagnostic (last 10 events, status)             |
| GET    | `/api/download`           | None    | Redirect to latest stable desktop download for detected platform |
| GET    | `/api/download-beta`      | None    | Redirect to latest beta desktop download                         |
| GET    | `/api/debug`              | None    | Debug endpoint — enabled only in `NODE_ENV=development`          |
| POST   | `/api/claim-offer`        | Session | Claim a promotional offer code; applies credit or tier upgrade   |

---

## 4.5 Authentication and Authorization

### 4.5.1 Primary Authentication

Authentication is managed by Supabase Auth. `middleware.ts` calls `updateSession(request)` on every request, which:

1. Reads the Supabase session cookie.
2. Silently refreshes expired access tokens using the refresh token.
3. For authenticated-only routes, redirects unauthenticated requests to `/login?next=<original-path>`.

**FR-W18: Session Refresh** — The middleware must transparently refresh tokens with no user-visible interruption. If the refresh token is also expired or revoked, the user must be redirected to `/login` with the `?next=` parameter preserved.

### 4.5.2 Token Types

| Type                 | Transport              | Use Cases                                             | Verification                   |
| -------------------- | ---------------------- | ----------------------------------------------------- | ------------------------------ |
| Supabase Session JWT | HttpOnly cookie (SSR)  | Web pages, most API routes, SSR data fetching         | `supabase.auth.getSession()`   |
| Bearer Token         | `Authorization` header | LLM routes, media routes, desktop-originated requests | `supabase.auth.getUser(token)` |

### 4.5.3 Enterprise SSO

SAML/OIDC enterprise login flows through `/api/auth/sso`. Domain-based provider discovery is available via `/api/auth/sso-check` so the login page can present a "Sign in with SSO" button automatically for known domains.

### 4.5.4 CSRF Protection

All state-changing endpoints (POST, PUT, DELETE) require a valid CSRF token:

- Server issues token via `GET /api/csrf`.
- Client stores token in memory and attaches it via `addCsrfHeaders()` which sets the `X-CSRF-Token` header.
- Server validates with `requireCsrfToken(request)` before processing.

**FR-W19: CSRF Enforcement** — Any state-changing request without a valid `X-CSRF-Token` header must return HTTP 403.

### 4.5.5 Content Security Policy

CSP is generated per-request in `middleware.ts` with a random nonce to prevent script injection:

| Directive     | Value                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src` | `'self'`                                                                                                                                                                         |
| `script-src`  | `'self'` `'nonce-{random}'` `'unsafe-eval'` `https://js.stripe.com` `https://challenges.cloudflare.com`                                                                          |
| `connect-src` | `'self'` `https://*.supabase.co` `wss://*.supabase.co` `https://api.stripe.com` `https://api.openai.com` `https://api.anthropic.com` `https://generativelanguage.googleapis.com` |
| `frame-src`   | `https://js.stripe.com` `https://hooks.stripe.com` `https://challenges.cloudflare.com`                                                                                           |

### 4.5.6 HTTP Security Headers

Set globally in `next.config.ts`:

| Header                         | Value                                                          |
| ------------------------------ | -------------------------------------------------------------- |
| `X-DNS-Prefetch-Control`       | `off`                                                          |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains; preload`                 |
| `X-Frame-Options`              | `DENY`                                                         |
| `X-Content-Type-Options`       | `nosniff`                                                      |
| `X-XSS-Protection`             | `1; mode=block`                                                |
| `Referrer-Policy`              | `origin-when-cross-origin`                                     |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                  |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                  |
| `Cross-Origin-Embedder-Policy` | `credentialless`                                               |

---

## 4.6 Subscription and Billing System

### 4.6.1 Plan Tiers

| Tier       | Level | LLM Access                 | Media Generation | Purchase Status    |
| ---------- | ----- | -------------------------- | ---------------- | ------------------ |
| free       | 0     | Blocked (403)              | No               | Active (default)   |
| hobby      | 1     | Economy models only        | No               | Active             |
| pro        | 2     | Economy + Pro models       | No               | Waitlisted         |
| max        | 3     | All models incl. flagships | Yes              | Waitlisted         |
| team       | 3.5   | All models                 | Yes              | Active             |
| enterprise | 4     | All models                 | Yes              | Active (sales-led) |

Active subscription statuses: `active`, `trialing`
Inactive statuses: `past_due`, `canceled`, `incomplete`, `incomplete_expired`, `paused`

**FR-W20: Graceful Past-Due Handling** — Users with `past_due` subscriptions must retain their current tier access for a 3-day grace period before being downgraded to Free.

### 4.6.2 Credit System

Credits are the unit of consumption tracked in the `credit_accounts` Supabase table. Each plan tier grants a monthly allocation and a daily allocation. One-time top-up credits are tracked separately and do not expire.

**Credit Flow:**

1. LLM request arrives at `/api/llm/completion`.
2. Call `check_credits_available(user_id, estimated_tokens)` RPC.
3. If insufficient → HTTP 402, suggest top-up or fallback model.
4. If sufficient → reserve estimated credits, forward request to provider.
5. On response completion → call `deduct_credits(user_id, actual_tokens, idempotency_key)` RPC.
6. Reconcile: if actual < estimated, release the difference.

**Supabase RPCs:**

| RPC                       | Parameters                         | Returns                                                 |
| ------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `get_credit_balance`      | `user_id`                          | `{ monthly_remaining, daily_remaining, topup_balance }` |
| `check_credits_available` | `user_id, amount`                  | `boolean`                                               |
| `deduct_credits`          | `user_id, amount, idempotency_key` | `{ success, new_balance }`                              |

**FR-W21: Idempotency** — All `deduct_credits` calls must include a unique `idempotency_key` derived from the request ID to prevent double-deduction on retries.

**FR-W22: Fallback Model** — If a user has insufficient credits for their requested model, the system must offer (and optionally auto-select) the cheapest available model for their tier rather than returning a hard error.

---

## 4.7 LLM Model Tier Matrix

| Tier Required    | Models                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hobby (economy)  | `gemini-3-flash-preview`, `glm-4.7`, `glm-4.6v`, `deepseek-chat` ($0.28/$0.42 per 1M), `claude-haiku-4.5`, `gpt-5-nano` ($0.05/$0.40), `qwen-flash` ($0.05/$0.15) |
| Pro (pro-tier)   | `gpt-5.2`, `claude-sonnet-4.5`, `gemini-3-pro-preview`, `kimi-k2.5-turbo`, `qwen-max`, `qwen-coder-plus`, `sonar-pro`, `sonar-reasoning`, `sonar-deep-research`   |
| Max / Enterprise | `claude-opus-4.5`, `gpt-5-pro`, `gemini-3-ultra`, `o3`, `grok-4`, `deepseek-r1`                                                                                   |

**Access Logic:**

- `free` → HTTP 403, all models blocked.
- `hobby` → economy models only; pro/max models return HTTP 403 with `required_tier: "pro"`.
- `pro` → economy + pro models; max models return HTTP 403 with `required_tier: "max"`.
- `max` / `enterprise` / `team` → all models.
- Unknown tier → HTTP 403 denied.

---

## 4.8 i18n

**FR-W23: Internationalisation** — All user-facing strings must use `i18next` keys. The initial supported locales are `en` (default) and `es`. Language detection order: URL prefix → `Accept-Language` header → `en` fallback. All API error messages must be keyed and translated.

---

## 4.9 Web App State Management

Zustand v5 stores located in `/apps/web/stores/`:

| Store           | File                | Persisted | Purpose                                                                     |
| --------------- | ------------------- | --------- | --------------------------------------------------------------------------- |
| Settings        | `settingsStore.ts`  | Yes       | Theme, font size, streaming preference, default model, custom model configs |
| Chat            | `chatStore.ts`      | Session   | Active conversation ID, messages array, in-flight model selection           |
| Media           | `mediaStore.ts`     | No        | Current image/video generation request state, task IDs, results             |
| Memory          | `memoryStore.ts`    | Yes       | AI memory entries for the current user                                      |
| Scheduler       | `schedulerStore.ts` | Yes       | Scheduled agent task definitions                                            |
| Artifact        | `artifactStore.ts`  | Session   | Code/file artifacts produced by the AI during the session                   |
| UI              | `uiStore.ts`        | No        | Panel open states, active modals, sidebar visibility                        |
| Unified Agentic | `unified/`          | Session   | Multi-step agentic chat state (steps, tool calls, results)                  |

**FR-W24: Store Persistence** — Persisted stores must use Zustand's `persist` middleware with `version` set and a `migrate` function to handle schema evolution. The current migration target is v10.

---

## 4.10 Input Validation

**FR-W25: Zod Strict Validation** — Every API route handler must define a Zod `.strict()` schema for its request body. Unknown keys must cause a 400 response. Validation errors must be serialised using Zod's `ZodError.flatten()` and returned as `{ errors: { fieldErrors, formErrors } }`.

---

## 4.11 Rate Limiting

Rate limits are enforced via Upstash Redis + `@upstash/ratelimit`. Identifiers are per-user (authenticated) or per-IP (unauthenticated).

**FR-W26: Rate Limit Response** — When a rate limit is exceeded, the API must return HTTP 429 with headers `Retry-After` (seconds) and `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`.

---

## 4.12 Logging

**FR-W27: Structured Logging** — All server-side code must use Pino for structured JSON logging. Every log entry must include: `timestamp`, `level`, `route`, `userId` (if authenticated), `requestId` (UUID per request). PII must not appear in log bodies.

---

## 4.13 Non-Functional Requirements

| ID      | Requirement                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------- |
| NFR-W01 | All authenticated API routes must respond within 5,000ms at P99                                      |
| NFR-W02 | LLM streaming first byte must be delivered within 2,500ms at P95 (5,000ms breach threshold)          |
| NFR-W03 | The web application must achieve Lighthouse performance score ≥ 85 on the landing page               |
| NFR-W04 | All Supabase queries must use row-level security policies; no `service_role` key in client-side code |
| NFR-W05 | Stripe webhook handlers must complete idempotent processing within the 30s Stripe retry window       |
| NFR-W06 | The app must be fully functional in the latest two versions of Chrome, Firefox, and Safari           |

---

# Section 5 — Services and Browser Extension

> PRD: AGI Workforce
> Last updated: 2026-02-26

---

## 5.1 Overview

AGI Workforce's backend services layer consists of three independently deployable components:

1. **API Gateway** (`services/api-gateway/`) — Express.js service that provides REST + WebSocket APIs for desktop client authentication, device management, cross-device sync, mobile pairing, and credit accounting.
2. **Signaling Server** (`services/signaling-server/`) — Lightweight WebRTC signaling service that brokers peer-to-peer connections between the desktop app and mobile companion app via pairing codes.
3. **Browser Extension** (`apps/extension/`) — Manifest V3 Chromium extension that gives the AI agent the ability to observe and interact with any web page the user has open, bridging the browser into the desktop agent's tool surface.

All three services are designed for independent deployment and horizontal scaling. They share the Supabase PostgreSQL instance as the system of record.

---

## 5.2 API Gateway

### 5.2.1 Stack and Configuration

| Attribute           | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Runtime             | Node.js, Express.js, TypeScript                                                         |
| Port                | 3000                                                                                    |
| Auth                | JWT (HS256, 7-day expiry)                                                               |
| Password hashing    | bcrypt                                                                                  |
| Database            | Supabase (PostgreSQL)                                                                   |
| Security middleware | Helmet.js                                                                               |
| Logging             | Pino                                                                                    |
| WebSocket           | `ws` library                                                                            |
| Rate limiting       | `express-rate-limit` (in-memory; Redis migration documented as TODO for multi-instance) |

**Startup Validation:** The gateway refuses to start if any of the following environment variables are absent: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. A missing value causes a fatal log entry and `process.exit(1)`.

**FR-S01: Environment Guard** — The API Gateway must validate all required environment variables at startup and exit immediately with a descriptive error if any are missing. Partial initialisation must never occur.

### 5.2.2 JWT Token Specification

| Claim     | Value                      |
| --------- | -------------------------- |
| `userId`  | Supabase user UUID         |
| `email`   | User email                 |
| `iss`     | `agiworkforce-api-gateway` |
| `aud`     | `agiworkforce`             |
| Algorithm | HS256                      |
| Expiry    | 7 days                     |

**FR-S02: JWT Issuer and Audience Validation** — The auth middleware must validate both `iss` and `aud` claims on every token. Tokens with mismatched claims must be rejected with HTTP 401.

### 5.2.3 Authentication Routes (`/api/auth/`)

| Method | Path                 | Rate Limit                 | Auth Required | Purpose                                                                               |
| ------ | -------------------- | -------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register` | 5 requests / 15 min per IP | None          | Register new user: hash password with bcrypt, insert into Supabase, return signed JWT |
| POST   | `/api/auth/login`    | 5 requests / 15 min per IP | None          | Login: constant-time compare, return signed JWT                                       |
| GET    | `/api/auth/verify`   | —                          | JWT           | Verify token validity; returns `{ userId, email }`                                    |

**FR-S03: Timing Attack Prevention** — The `/api/auth/login` endpoint must perform a bcrypt comparison even when the user does not exist (using a pre-computed dummy hash) so that the response time is not measurably different for existing vs. non-existing users.

**FR-S04: Registration Uniqueness** — If the submitted email already exists in Supabase, the registration endpoint must return HTTP 409 with a generic message. The response must not confirm whether the email address exists in the system to prevent enumeration.

### 5.2.4 Desktop Device Routes (`/api/desktop/`)

All desktop routes require a valid JWT. Device ownership is enforced by matching `userId` from the JWT against the `user_id` column on every query.

| Method | Path                                | Rate Limit         | Purpose                                                                                  |
| ------ | ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| POST   | `/api/desktop/register`             | 10/min per user    | Register a new desktop device: accepts `name`, `platform`, `version`; returns `deviceId` |
| GET    | `/api/desktop/`                     | —                  | List all registered devices for the authenticated user                                   |
| GET    | `/api/desktop/:desktopId/status`    | 60/min per user    | Return device status; online if `last_seen_at` is within the past 60 seconds             |
| POST   | `/api/desktop/:desktopId/command`   | 30/min per user    | Send a command to a device; queued if device is offline                                  |
| POST   | `/api/desktop/:desktopId/heartbeat` | 600/min per device | Update `last_seen_at` to current timestamp                                               |
| DELETE | `/api/desktop/:desktopId`           | —                  | Unregister and delete a device record                                                    |

**FR-S05: Online Status Detection** — A device is considered `online` if and only if `last_seen_at > NOW() - INTERVAL '60 seconds'`. The status endpoint must return this boolean as the `online` field, not raw timestamp data.

**FR-S06: Offline Command Queuing** — If the target device is offline, the command must be persisted in the command queue with a maximum queue depth of 100 commands per device and a TTL of 5 minutes. When the device reconnects over WebSocket, all queued commands must be flushed in order.

**FR-S07: Device Ownership Enforcement** — Every request to `/api/desktop/:desktopId/*` must verify that the `desktopId` belongs to the JWT's `userId`. A mismatch must return HTTP 403, not HTTP 404, to avoid leaking device existence.

### 5.2.5 Sync Routes (`/api/sync/`)

All sync routes require a valid JWT. Conflict resolution uses last-write-wins semantics based on the `updated_at` timestamp of each item.

| Method | Path                          | Rate Limit      | Purpose                                                                                   |
| ------ | ----------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/api/sync/batch`             | 30/min per user | Batch sync: accepts up to 100 items in a single request; returns per-item success/failure |
| GET    | `/api/sync/updates`           | —               | Pull all updates for the user since a provided `since` ISO-8601 timestamp                 |
| POST   | `/api/sync/resolve-conflict`  | —               | Insert a conflict resolution record (winning version + loser reference)                   |
| GET    | `/api/sync/status`            | —               | Return sync status: `{ pending_count, last_sync_at }`                                     |
| POST   | `/api/sync/devices/register`  | —               | Upsert a device's sync registration (capabilities, sync schema version)                   |
| DELETE | `/api/sync/devices/:deviceId` | —               | Delete all sync data for a specific device                                                |

**FR-S08: Batch Limit** — The batch sync endpoint must reject payloads containing more than 100 items with HTTP 422 and a descriptive error. Processing must be atomic per item (partial failures are acceptable; the response body indicates per-item status).

**FR-S09: Last-Write-Wins** — When two devices submit conflicting updates for the same item, the item with the later `updated_at` wins. The losing version must be stored in the conflicts table via `/api/sync/resolve-conflict` for audit purposes.

### 5.2.6 Mobile Routes (`/api/mobile/`)

All mobile routes require a valid JWT.

| Method | Path                       | Rate Limit      | Purpose                                                                  |
| ------ | -------------------------- | --------------- | ------------------------------------------------------------------------ |
| POST   | `/api/mobile/register`     | 10/min per user | Register or update a mobile device record (upsert by device fingerprint) |
| POST   | `/api/mobile/push-token`   | —               | Update the push notification token for a registered mobile device        |
| POST   | `/api/mobile/pairing-code` | 10/min per user | Create a WebRTC pairing code; returns 8-char code and QR payload         |
| GET    | `/api/mobile/`             | —               | List all registered mobile devices for the authenticated user            |
| DELETE | `/api/mobile/:deviceId`    | —               | Delete a mobile device record and associated push token                  |

**FR-S10: Pairing Code Generation** — Pairing codes are generated by the Signaling Server (see §5.3) and stored with a 300s TTL. The `/api/mobile/pairing-code` endpoint proxies the creation request to the Signaling Server and returns the code and QR URI to the client. The QR payload format is `agiw:{CODE}`.

### 5.2.7 Credits Routes (`/api/credits/`)

All credits routes require a valid JWT. Credit state is the authoritative record in Supabase; the gateway is a thin proxy over Supabase RPCs.

| Method | Path                   | Rate Limit      | Purpose                                                                                |
| ------ | ---------------------- | --------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/credits/balance` | 10/min per user | Return current credit balance: `{ monthly_remaining, daily_remaining, topup_balance }` |
| POST   | `/api/credits/check`   | —               | Check if `amount` credits are available; returns `{ available: boolean }`              |
| POST   | `/api/credits/deduct`  | 5/min per user  | Deduct credits; requires `idempotency_key`; returns HTTP 402 on insufficient balance   |

**FR-S11: Credit Deduction Idempotency** — The deduct endpoint must accept an `idempotency_key` string. If a deduction with the same key has already been processed successfully, the endpoint must return HTTP 200 with the cached result without re-deducting. Keys expire after 24 hours.

**FR-S12: Insufficient Credits Response** — When credits are insufficient, the response must be HTTP 402 with body `{ error: "insufficient_credits", balance: { monthly_remaining, daily_remaining, topup_balance }, required: <amount> }`.

### 5.2.8 Health Endpoint

| Method | Path      | Rate Limit     | Auth | Purpose                                                 |
| ------ | --------- | -------------- | ---- | ------------------------------------------------------- |
| GET    | `/health` | 100/min per IP | None | Return service health: DB connectivity, uptime, version |

### 5.2.9 WebSocket Server

The WebSocket server runs at `ws://{host}/ws` on the same port as the HTTP server.

**Connection Lifecycle:**

1. Client opens WebSocket connection.
2. Client must send an `auth` message within **30 seconds** or the server closes the connection with code `4001` ("Authentication timeout").
3. On successful auth, the server registers the connection under `userId` + `deviceId`.
4. The connection is ready to send and receive typed messages.

**Auth Message Schema:**

```json
{
  "type": "auth",
  "token": "<JWT>",
  "deviceId": "<UUID>"
}
```

**Message Types:**

| Type      | Direction       | Purpose                                                       |
| --------- | --------------- | ------------------------------------------------------------- |
| `auth`    | Client → Server | Authenticate the connection (must be first message)           |
| `ping`    | Client → Server | Keepalive probe                                               |
| `pong`    | Server → Client | Response to `ping`                                            |
| `command` | Client → Server | Send a command to a target device by `deviceId`               |
| `command` | Server → Client | Deliver a command to the target device (or queue if offline)  |
| `sync`    | Client → Server | Broadcast a sync event to all of the user's connected devices |
| `sync`    | Server → Client | Deliver a sync event (sent to all devices except the sender)  |

**Keepalive:** The server sends a `ping` every 30 seconds. If the client does not respond with `pong` within 10 seconds, the connection is terminated.

**Command Delivery:**

- If target device is online (active WebSocket): immediate delivery.
- If target device is offline: command is persisted in the queue (max 100 per device, 5-min TTL).
- On reconnect: server flushes the queue in FIFO order before resuming real-time delivery.

**FR-S13: Auth Timeout** — The WebSocket server must close unauthenticated connections with code `4001` after 30 seconds. This prevents resource exhaustion from idle connections.

**FR-S14: WebSocket Ownership** — A device may only receive commands addressed to its own `deviceId`. The server must not forward a command to a device belonging to a different `userId`.

### 5.2.10 Authentication Middleware

The `authenticate` middleware used by all protected routes:

1. Extracts the JWT from the `Authorization: Bearer <token>` header.
2. Verifies signature with `JWT_SECRET` (HS256).
3. Validates `iss === 'agiworkforce-api-gateway'` and `aud === 'agiworkforce'`.
4. Checks expiry.
5. Performs a **kill switch** check: queries `profiles.account_status` for the `userId`.
   - Result is cached per `userId` for 60 seconds to reduce database load.
   - If `account_status = 'suspended'` → HTTP 403.
   - If `account_status = 'banned'` → HTTP 403.
   - If Supabase returns an error → **fail closed**: HTTP 503 (the request is rejected, not allowed through).
6. Attaches `{ userId, email }` to `req.user`.

**FR-S15: Kill Switch Fail-Closed** — On any Supabase database error during the kill switch check, the middleware must return HTTP 503 and must NOT allow the request to proceed. Availability is sacrificed in favour of security correctness.

**FR-S16: Constant-Time Password Comparison** — Login must use `bcrypt.compare()` and must always run the comparison (using a dummy hash if the user does not exist) so that response time cannot be used to infer account existence.

### 5.2.11 Rate Limiting Notes

Rate limiting is currently implemented with `express-rate-limit` using in-memory storage. This works correctly for single-instance deployment.

**FR-S17: Multi-Instance Rate Limiting** — Before horizontal scaling the API Gateway to more than one instance, the rate limiter store must be migrated to a Redis backend (Upstash or equivalent). This is a documented prerequisite for scaling.

---

## 5.3 Signaling Server

### 5.3.1 Stack and Configuration

| Attribute               | Value                                       |
| ----------------------- | ------------------------------------------- |
| Runtime                 | Node.js, Express.js + `ws`                  |
| Database                | Supabase (session persistence)              |
| Metrics                 | Prometheus (`prom-client`)                  |
| Deploy targets          | Fly.io or Railway                           |
| Max concurrent sessions | 1,000 (rehydrated from Supabase on startup) |

### 5.3.2 Pairing Code Specification

| Property                 | Value                                                          |
| ------------------------ | -------------------------------------------------------------- |
| Format                   | 8-character uppercase alphanumeric                             |
| Generation               | `crypto.randomBytes(6)` → base64url → slice(0,8) → toUpperCase |
| QR payload               | `agiw:{CODE}`                                                  |
| Default TTL              | 300 seconds                                                    |
| Maximum TTL              | 900 seconds                                                    |
| Session cleanup interval | Every 30 seconds                                               |

### 5.3.3 HTTP Endpoints

| Method | Path               | Rate Limit    | Auth        | Purpose                                                               |
| ------ | ------------------ | ------------- | ----------- | --------------------------------------------------------------------- |
| POST   | `/pairings`        | 10/min per IP | None        | Create a new pairing session; returns `{ code, qr_data, expires_at }` |
| GET    | `/pairings/:code`  | 60/min per IP | None        | Look up an existing pairing by code; returns session metadata         |
| DELETE | `/pairings/:code`  | 10/min per IP | None        | Delete a pairing session before TTL expiry                            |
| GET    | `/health`          | —             | None        | Full health check including Supabase DB connectivity                  |
| GET    | `/ready`           | —             | None        | Kubernetes/Fly.io readiness probe (returns 200 when server is ready)  |
| GET    | `/live`            | —             | None        | Kubernetes/Fly.io liveness probe (returns 200 always)                 |
| GET    | `/metrics`         | —             | Admin token | Prometheus metrics export                                             |
| GET    | `/admin/status`    | —             | Admin token | Server status: active sessions, connected clients, uptime             |
| POST   | `/admin/blacklist` | —             | Admin token | Add an IP address to the connection blacklist                         |

**FR-S18: Code Uniqueness** — When creating a pairing, the server must verify the generated code does not collide with any active session. If a collision occurs, the server must retry up to 5 times before returning HTTP 503.

**FR-S19: Session Rehydration** — On startup, the server must load all non-expired sessions from Supabase into memory. Sessions already expired must be discarded. This allows the signaling server to restart without disrupting active pairings.

### 5.3.4 WebSocket Protocol

The signaling server WebSocket runs at `ws://{host}/ws`.

**Session Join Flow:**

1. Client (desktop or mobile) opens a WebSocket connection.
2. Client sends a `register` message with `{ code, role, metadata }`.
   - `role` must be `'desktop'` or `'mobile'`.
3. Server validates the code, checks TTL, and sends a `registered` event.
4. When the second peer connects, server sends `peer_ready` to both peers.
5. Peers exchange WebRTC signaling messages.
6. Either peer may send a `terminate` control message to end the session.

**Signal Message Types (Zod-validated):**

| Type      | Description                           | Max Size |
| --------- | ------------------------------------- | -------- |
| `offer`   | WebRTC SDP offer                      | 100KB    |
| `answer`  | WebRTC SDP answer                     | 100KB    |
| `ice`     | ICE candidate                         | 64KB     |
| `control` | Session control (`terminate`, `ping`) | 1KB      |

**Server-to-Client Events:**

| Event             | Trigger                           | Payload                        |
| ----------------- | --------------------------------- | ------------------------------ |
| `registered`      | Successful `register`             | `{ code, role, session_id }`   |
| `peer_ready`      | Both peers connected              | `{ peer_role, peer_metadata }` |
| `peer_left`       | Peer disconnected                 | `{ role }`                     |
| `session_expired` | TTL elapsed                       | `{ code }`                     |
| `terminated`      | Control `terminate` received      | `{}`                           |
| `error`           | Protocol violation                | `{ message }`                  |
| `heartbeat_ack`   | In response to client `heartbeat` | `{ timestamp }`                |

**FR-S20: SDP Size Enforcement** — The server must reject any SDP offer or answer exceeding 100KB with a `4008` close code ("Payload too large"). ICE candidates are capped at 64KB. All other messages are capped at 1KB.

**FR-S21: Session Isolation** — Messages received from one peer must only be forwarded to the peer sharing the same pairing code session. Cross-session message leakage is a critical security defect.

### 5.3.5 Security

**FR-S22: Per-IP Connection Limits** — The signaling server must enforce a maximum number of concurrent WebSocket connections per IP address to prevent resource exhaustion.

**FR-S23: Message Rate Limiting** — Each WebSocket connection is subject to per-connection message rate limiting. Connections exceeding the limit are closed with code `4009` ("Rate limit exceeded").

**FR-S24: IP Blacklisting** — The `/admin/blacklist` endpoint allows operators to block abusive IP addresses. Blacklisted IPs must be rejected at connection time with code `4003` ("Forbidden").

**FR-S25: Expired Session Cleanup** — The server must run a cleanup job every 30 seconds that removes expired sessions from memory and marks them as expired in Supabase. WebSocket connections belonging to expired sessions must be closed with the `session_expired` event.

---

## 5.4 Browser Extension

### 5.4.1 Manifest and Identity

| Property              | Value                                |
| --------------------- | ------------------------------------ |
| Manifest version      | V3                                   |
| Extension version     | 1.1.0                                |
| Native messaging host | `com.agiworkforce.browser`           |
| Target browsers       | Chromium-based (Chrome, Edge, Brave) |

**Declared Permissions:**

| Permission        | Justification                                         |
| ----------------- | ----------------------------------------------------- |
| `activeTab`       | Inspect and interact with the currently active tab    |
| `tabs`            | Query tab metadata for context capture                |
| `storage`         | Persist extension settings and state                  |
| `nativeMessaging` | Connect to the Tauri desktop app via native messaging |
| `alarms`          | Keep-alive alarm for the service worker               |
| `contextMenus`    | Right-click context menu actions                      |
| `sidePanel`       | Display the AGI sidebar within the browser            |

**Optional Permissions (user-granted):**

| Permission  | Use Case                        |
| ----------- | ------------------------------- |
| `downloads` | Save captured content to disk   |
| `bookmarks` | Bookmark management by AI agent |
| `history`   | Browser history context for AI  |

**Host Permissions:** `<all_urls>` — required for content script injection on any page.

**Keyboard Shortcuts:**

| Shortcut                       | Action               |
| ------------------------------ | -------------------- |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | Open extension popup |
| `Cmd+Shift+C` / `Ctrl+Shift+C` | Capture current page |

### 5.4.2 Content Script Capabilities

The content script is injected into every page at `document_idle`. It receives commands from the background service worker and executes them in the page context, returning structured results.

#### Navigation and Query Commands

| Command             | Description                                     | Returns                                              |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------- | ------- |
| `GET_TEXT`          | Extract text content of a CSS selector          | `{ text: string }`                                   |
| `GET_ATTRIBUTE`     | Get a named attribute of an element             | `{ value: string                                     | null }` |
| `GET_PAGE_INFO`     | Full page metadata snapshot                     | `{ url, title, meta, scrollPosition, viewportSize }` |
| `GET_FORMS`         | Extract all forms and their fields              | `{ forms: FormDescriptor[] }`                        |
| `WAIT_FOR_SELECTOR` | Wait until a CSS selector is present in the DOM | `{ found: boolean }` — 30s max timeout               |

#### Interaction Commands

| Command         | Description                              | Notes                                                     |
| --------------- | ---------------------------------------- | --------------------------------------------------------- |
| `CLICK`         | Single click on a CSS selector target    | Dispatches `MouseEvent`                                   |
| `DOUBLE_CLICK`  | Double click on a CSS selector target    | Dispatches two `MouseEvent`s                              |
| `RIGHT_CLICK`   | Right click (context menu trigger)       | Dispatches `contextmenu` event                            |
| `TYPE`          | Clear an input field and type text       | Dispatches `input` + `change` events after each character |
| `FILL_FORM`     | Set multiple form fields by selector map | Dispatches events per field                               |
| `SUBMIT_FORM`   | Submit a form by selector                | Calls `form.submit()` or clicks the submit button         |
| `SET_ATTRIBUTE` | Set an attribute on an element           | Restricted to allowlist (see §5.4.4)                      |

#### Scripting Command (Sandboxed)

**`EXECUTE_SCRIPT`** — Executes a named DOM operation from a strict allowlist. No arbitrary JavaScript. Dynamic code evaluation via `eval` or `Function` constructors is explicitly prohibited.

Allowed operations:

| Operation           | Description                                        |
| ------------------- | -------------------------------------------------- |
| `scrollTo`          | Scroll to absolute x/y coordinates                 |
| `scrollBy`          | Scroll by relative x/y delta                       |
| `scrollIntoView`    | Scroll a selector into the viewport                |
| `getScrollPosition` | Return `{ x, y }` of current scroll position       |
| `getViewportSize`   | Return `{ width, height }` of the browser viewport |
| `getComputedStyle`  | Return computed CSS property for a selector        |
| `getBoundingRect`   | Return `DOMRect` for a selector                    |
| `focusElement`      | Call `.focus()` on a selector                      |
| `blurElement`       | Call `.blur()` on a selector                       |

**FR-S26: EXECUTE_SCRIPT Allowlist** — The `EXECUTE_SCRIPT` command must reject any operation name not in the explicit allowlist with an error. The error message must name the rejected operation. Dynamic code evaluation (via `eval` or equivalent constructs) is categorically prohibited and must never be introduced.

#### Compound Commands

| Command                     | Description                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| `RUN_PAGE_ACTIONS`          | Execute a sequence of commands with configurable delays between steps   |
| `AUTO_FILL_JOB_APPLICATION` | Platform-aware job application autofill (see §5.4.3)                    |
| `CAPTURE_ELEMENT`           | Screenshot a specific DOM element via canvas                            |
| `GET_ELEMENT_INFO`          | Return full descriptor: tag, id, class, text, attributes, bounding rect |

### 5.4.3 Job Application Autofill System

**FR-S27: Platform Detection** — The autofill system must detect the current platform from the page URL and apply platform-specific field selectors. Supported platforms: Greenhouse (`boards.greenhouse.io`), Workday (`*.myworkdayjobs.com`), Generic (CSS heuristic fallback).

**Autofill Profile Schema:**

| Field               | Type                               | Notes                                      |
| ------------------- | ---------------------------------- | ------------------------------------------ |
| `firstName`         | string                             |                                            |
| `lastName`          | string                             |                                            |
| `email`             | string                             |                                            |
| `phone`             | string                             |                                            |
| `location`          | string                             | City, state, country                       |
| `linkedIn`          | string                             | Full URL                                   |
| `github`            | string                             | Full URL                                   |
| `portfolio`         | string                             | Full URL                                   |
| `currentCompany`    | string                             |                                            |
| `yearsOfExperience` | number                             |                                            |
| `workAuthorization` | string                             | E.g., "US Citizen", "Requires Sponsorship" |
| `salary`            | string                             | Expected salary range                      |
| `resumeText`        | string                             | Plain text resume content                  |
| `coverLetterText`   | string                             | Plain text cover letter                    |
| `files`             | `{ name: string, data: string }[]` | Base64 data URLs for file uploads          |

**Autofill Options:**

| Option           | Type    | Default       | Description                              |
| ---------------- | ------- | ------------- | ---------------------------------------- |
| `platform`       | string  | auto-detected | Override platform detection              |
| `autoSubmit`     | boolean | `false`       | Automatically click submit after filling |
| `maxSubmitSteps` | number  | 3             | Maximum pages/steps to advance through   |

**FR-S28: AutoSubmit Guard** — When `autoSubmit` is `true`, the system must pause and request explicit user confirmation before submitting the final form if `maxSubmitSteps` has been reached. It must never submit more pages than `maxSubmitSteps` without confirmation.

### 5.4.4 Security Constraints

**FR-S29: SET_ATTRIBUTE Allowlist** — The `SET_ATTRIBUTE` command must maintain an explicit allowlist of safe attributes. The following attribute patterns must be blocked regardless of the target element:

- Any attribute beginning with `on` (event handlers: `onclick`, `onerror`, `onload`, etc.)
- `href` on `<script>` elements
- `src` on `<script>` elements
- `action` on `<form>` elements
- `formaction` on any element

Any attempt to set a blocked attribute must return an error without modifying the DOM.

**FR-S30: No Dynamic Code Execution** — The content script must never use dynamic code evaluation mechanisms (`eval`, `setTimeout` with a string argument, `setInterval` with a string argument, or dynamic function construction). All executable logic must be statically defined at load time.

**FR-S31: Closed Shadow DOM for FAB** — The floating action button (FAB) injected into pages must be attached using `attachShadow({ mode: 'closed' })`. The closed mode prevents page JavaScript from accessing or modifying the FAB's internal DOM.

**FR-S32: No Inline Scripts** — The extension must not inject any inline scripts into pages. All extension scripts must be declared in the manifest and loaded from the extension package.

### 5.4.5 Background Service Worker

The background service worker manages the native messaging connection to the Tauri desktop app and coordinates all content script operations.

**Native Messaging:**

- Host: `com.agiworkforce.browser`
- Protocol: Chrome native messaging (length-prefixed JSON)
- Connection: persistent; one connection per browser session

**Auto-Reconnect Policy:**

| Attempt | Delay |
| ------- | ----- |
| 1       | 1s    |
| 2       | 2s    |
| 3       | 4s    |
| 4       | 8s    |
| 5       | 16s   |
| 6       | 30s   |
| 7       | 30s   |
| 8       | 30s   |

Reconnection stops permanently on terminal errors: `host_not_found`, `access_denied`. All other errors trigger the backoff sequence.

**FR-S33: Reconnect Ceiling** — Exponential backoff must cap at 30 seconds. After 8 failed attempts, the extension must stop reconnecting and surface a user-visible error in the popup indicating the desktop app is not running.

**Rate Limiter:**

| Property     | Value          |
| ------------ | -------------- |
| Window       | 500ms          |
| Max requests | 120 per window |

All messages sent to the content script or native host pass through this rate limiter. Excess messages are queued, not dropped, unless the queue exceeds 1,000 pending items.

**Keep-Alive Alarm:** A Chrome `alarms` alarm fires every 60 seconds to prevent the service worker from being terminated by the browser. The alarm handler sends a no-op ping to maintain the native messaging connection.

**Context Sync Deduplication:**

The service worker syncs page context (URL, title, selected text) to the desktop app when the user changes tabs or makes a selection. Deduplication prevents excessive syncs:

- **Cooldown:** 5 seconds between syncs.
- **Fingerprint:** `hash(url + title + selection)`. Identical fingerprints within the cooldown window are discarded.

**FR-S34: Context Sync Throttle** — The context sync mechanism must not send more than one sync event per 5-second window for identical content. This prevents chat context pollution when the user holds a selection on a static page.

### 5.4.6 UI Injection

**Floating Action Button (FAB):**

- Injected via closed shadow DOM (see FR-S31).
- Displays a connection status dot: green (connected to desktop), amber (connecting/reconnecting), red (desktop not found).
- Click opens the side panel or the extension popup.

**Context Menu Items:**

The extension registers three context menu items that appear on right-click:

| Menu Item           | Trigger Condition          | Action                                                                  |
| ------------------- | -------------------------- | ----------------------------------------------------------------------- |
| "Capture Element"   | Right-click on any element | Runs `CAPTURE_ELEMENT` on the target, sends screenshot to desktop agent |
| "Get Element Info"  | Right-click on any element | Runs `GET_ELEMENT_INFO`, sends descriptor to desktop agent              |
| "Ask AGI Workforce" | Text is selected           | Sends selected text as a new chat message to the desktop app            |

---

## 5.5 Cross-Service Communication

### 5.5.1 Desktop to API Gateway

The Tauri desktop app connects to the API Gateway over HTTPS (REST) and WSS (WebSocket). The desktop authenticates using the JWT obtained during device registration (§5.2.3). The WebSocket connection carries real-time commands and sync events.

### 5.5.2 Desktop to Mobile (WebRTC via Signaling Server)

1. Desktop calls `/api/mobile/pairing-code` on the API Gateway.
2. API Gateway proxies to the Signaling Server's `POST /pairings`.
3. Signaling Server returns code + QR payload.
4. User scans QR code with mobile companion app.
5. Both apps connect to the Signaling Server WebSocket and identify by code.
6. Signaling Server brokers SDP offer/answer + ICE candidates.
7. WebRTC P2P connection is established; Signaling Server is no longer in the data path.

### 5.5.3 Browser Extension to Desktop

Communication is over Chrome Native Messaging (`com.agiworkforce.browser`). The Tauri app registers as the native messaging host. The extension service worker maintains a persistent connection and forwards page commands and context syncs bidirectionally.

---

## 5.6 Non-Functional Requirements

| ID      | Requirement                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| NFR-S01 | API Gateway REST endpoints must respond within 200ms at P95 (excluding Supabase RPC latency)                                 |
| NFR-S02 | The WebSocket server must support at least 10,000 concurrent connections per instance                                        |
| NFR-S03 | The Signaling Server must handle at least 1,000 concurrent pairing sessions                                                  |
| NFR-S04 | Native messaging round-trip (extension to desktop to extension) must complete within 100ms for DOM queries                   |
| NFR-S05 | The API Gateway kill switch cache must reduce Supabase auth queries by at least 90% under sustained load                     |
| NFR-S06 | All service endpoints must emit structured JSON logs compatible with Pino's output format                                    |
| NFR-S07 | The Signaling Server must export Prometheus metrics consumable by a standard Grafana dashboard                               |
| NFR-S08 | Browser extension content scripts must not increase page load time by more than 50ms (measured as Time to Interactive delta) |
| NFR-S09 | The API Gateway must gracefully drain connections on SIGTERM within 10 seconds                                               |
| NFR-S10 | All services must pass Helmet.js default security checks with no exceptions disabled                                         |

---

# Section 6 — Security & Data Architecture

> PRD: AGI Workforce — Open Model-Agnostic AI Desktop Platform
> Section: 6 of 8
> Last updated: 2026-02-26
> Status key: Implemented | Partial | Planned | Blocked

---

## 6.1 Security Architecture Overview

AGI Workforce employs a layered, defense-in-depth security model spanning the Tauri desktop application, Next.js web frontend, API gateway, browser extension, and signaling server. Each layer has independent controls; compromise of one layer does not cascade to others.

| Layer                             | Primary Module                                            | Status      |
| --------------------------------- | --------------------------------------------------------- | ----------- |
| Tool execution sandboxing         | ToolGuard (`sys/security/tool_guard.rs`, 1,778 lines)     | Implemented |
| Secret storage                    | SecretManager (`sys/security/secret_manager.rs`)          | Implemented |
| Encryption (at rest + in transit) | Argon2id / PBKDF2 / AES-256-GCM / SQLCipher               | Implemented |
| Authentication                    | AuthManager + Supabase Auth + JWT                         | Implemented |
| Authorization (RBAC)              | rbac.rs (desktop) + Supabase org roles (web)              | Partial     |
| Input validation                  | validator.rs + Zod (web) + command_validator.rs           | Implemented |
| Injection prevention              | injection_detector.rs + prompt_injection.rs               | Implemented |
| Audit logging                     | audit.rs + audit_logger.rs + Supabase security_audit_logs | Implemented |
| Web security headers              | Helmet.js + Next.js middleware                            | Implemented |
| Browser extension isolation       | Closed shadow DOM + allowlisted DOM ops                   | Implemented |
| Rate limiting                     | rate_limit.rs (desktop) + API gateway (web)               | Partial     |
| Process sandboxing                | sandbox.rs + macOS app sandbox (entitlements.plist)       | Implemented |

---

## 6.2 Tool Execution — ToolGuard

**SEC-01** — P0 — Implemented

ToolGuard is the central execution control point for all tool calls within the desktop agent runtime. Every tool invocation passes through ToolGuard before execution.

**Safety tier classification:**

| Tier                     | Examples                           | Default Behavior                 |
| ------------------------ | ---------------------------------- | -------------------------------- |
| Safe                     | Read files (user dirs), web search | Auto-approve                     |
| RequiresNotification     | Read system files                  | Notify user, auto-approve        |
| RequiresConfirmation     | Write files, run commands          | Prompt user once                 |
| RequiresExplicitApproval | Delete files, system changes       | Hard prompt, cannot auto-approve |

**Risk levels:** Low, Medium, High, Critical — each maps to ToolSafetyTier.

**SEC-02** — P0 — Implemented — Per-tool rate limiting enforced at ToolGuard level. Token-bucket algorithm via `rate_limit.rs`.

**SEC-03** — P0 — Implemented — Path traversal detection on all file-related tool calls. Blocks `../` and absolute path escapes outside approved directories.

**SEC-04** — P1 — Implemented — Domain blocking list for network tool calls. Prevents SSRF against loopback, link-local, and private RFC-1918 ranges.

**SEC-05** — P1 — Implemented — Approval workflow (`approval_workflow.rs`): per-tool approval state persisted in SQLite `approval_requests` and `approval_rules` tables. Approval modes: Ask, Auto-approve read-only, Auto-approve all.

**SEC-06** — P1 — Implemented — Destructive modification protection (`dm_protection.rs`): guard layer specifically for irreversible operations (mass delete, schema drop, credential overwrite).

---

## 6.3 Secret Management

**SEC-07** — P0 — Implemented

SecretManager stores all API keys and credentials using AES-256-GCM encryption backed by SQLCipher. Plaintext secrets never touch disk.

```
encrypt_secret(key, plaintext) -> EncryptedSecret { ciphertext, nonce, tag }
decrypt_secret(key, EncryptedSecret) -> plaintext
```

OS Keyring integration for email credentials:

- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service (libsecret)

**SEC-08** — P0 — Implemented — Environment variables for API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) are injected at build time via Vite / at runtime via Tauri env. Never committed to source.

---

## 6.4 Encryption Architecture

**SEC-09** — P0 — Implemented

Five distinct encryption layers protect data at rest and in transit:

| Layer                | Algorithm                            | Purpose                                    | Status      |
| -------------------- | ------------------------------------ | ------------------------------------------ | ----------- |
| Master password KDF  | Argon2id (19 MiB mem, 2 iter, 1 par) | OWASP-compliant user password hashing      | Implemented |
| Machine key KDF      | PBKDF2-HMAC-SHA256 (600,000 iter)    | Machine-derived key (no master password)   | Implemented |
| Symmetric encryption | AES-256-GCM                          | Secret + data encryption                   | Implemented |
| Key derivation       | HKDF-SHA256                          | Calendar tokens, cloud storage keys        | Implemented |
| Database encryption  | SQLCipher                            | Entire SQLite database at rest             | Implemented |
| Update signing       | Ed25519                              | Desktop auto-update signature verification | Implemented |

**SEC-10** — P1 — Partial — SQLite conversation history and audit log entries are encrypted only when a master password is set. Without a master password, SQLCipher uses the machine-derived key; plaintext recovery is possible with physical access to the device.

**Machine key derivation** (`sys/security/machine_key.rs`):

- Input: `machine-uid + hostname`
- Output via PBKDF2 + `derive_key()` → `KeyPurpose` enum
- Enables automatic encryption without user interaction

---

## 6.5 Authentication

**SEC-11** — P0 — Implemented

| Context     | Mechanism           | Details                                                                  |
| ----------- | ------------------- | ------------------------------------------------------------------------ |
| Desktop app | Session-based + JWT | AuthManager in `auth.rs`; Argon2id password hash; `alg:none` JWT blocked |
| Web app     | Supabase Auth       | JWT, session cookies via SSR, auto-refresh on expiry                     |
| API Gateway | JWT HS256           | 7-day expiry, issuer + audience validated                                |
| OAuth2      | PKCE flow           | Google, GitHub, Microsoft (consumer only)                                |

**SEC-12** — P0 — Implemented — Kill switch: `account_status` column on `profiles` table. Checked on every authenticated API request. 60-second in-memory cache for performance. Fails closed: returns HTTP 503 on Supabase DB error (does not grant access on failure).

**SEC-13** — P1 — Implemented — Constant-time password comparison on API gateway to prevent timing attacks. Dummy bcrypt hash evaluated when user is not found.

**SEC-14** — P2 — Planned — Enterprise SSO: WorkOS configuration exists in codebase but is not wired to live endpoints. No SAML 2.0. No Okta/Azure AD OIDC. Planned for enterprise tier.

---

## 6.6 Role-Based Access Control (RBAC)

**SEC-15** — P1 — Partial

| System                       | Roles                        | Location                                      | Status      |
| ---------------------------- | ---------------------------- | --------------------------------------------- | ----------- |
| Web (Supabase)               | owner, admin, member, viewer | `organization_members` table                  | Implemented |
| Desktop                      | Viewer, Editor, Admin        | SQLite `role_permissions` table via `rbac.rs` | Implemented |
| Unified cross-platform model | —                            | —                                             | Planned     |

**Known gaps:**

- No "Billing Manager" role in either system
- No custom roles
- Web and desktop role systems are entirely separate; a desktop admin is not recognized as a web admin
- Per-user subscriptions (not per-org); enterprise billing aggregation not implemented

**SEC-16** — P2 — Planned — Unified RBAC model required before enterprise release. Single role definition propagated to both web and desktop contexts.

---

## 6.7 Input Validation & Injection Prevention

**SEC-17** — P0 — Implemented

All inputs validated before processing:

| Layer            | Mechanism                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| Web API routes   | Zod `.strict()` schema validation on all request bodies                   |
| Desktop commands | `validator.rs` + `command_validator.rs`                                   |
| SQL queries      | `SqlSecurityValidator` on all external DB connections                     |
| File paths       | `validateFilePath()` in `packages/utils/src/validation.ts` — blocks `../` |
| API keys         | `validateApiKey()` format check                                           |

**SEC-18** — P0 — Implemented — SQL injection prevention via `injection_detector.rs` on external query builder. Also applied in `packages/utils/src/validation.ts` via `checkForInjection()` and `sanitizeCommandArgs()`.

**SEC-19** — P0 — Implemented — Prompt injection detection via `prompt_injection.rs`. Functions: `escape_xml()` and `sanitize_multiline_for_prompt()` applied to all tool results before they are inserted into LLM context.

**SEC-20** — P0 — Implemented — Open redirect prevention on web: redirect targets validated against CORS allowlist before issuing 302.

---

## 6.8 Web Application Security

**SEC-21** — P0 — Implemented

HTTP security headers set on all web responses:

| Header                       | Value                                        |
| ---------------------------- | -------------------------------------------- |
| Strict-Transport-Security    | max-age=63072000; includeSubDomains; preload |
| X-Frame-Options              | DENY                                         |
| X-Content-Type-Options       | nosniff                                      |
| X-XSS-Protection             | 1; mode=block                                |
| Referrer-Policy              | strict-origin-when-cross-origin              |
| Permissions-Policy           | camera=(), microphone=(), geolocation=()     |
| Cross-Origin-Opener-Policy   | same-origin                                  |
| Cross-Origin-Resource-Policy | same-origin                                  |
| Cross-Origin-Embedder-Policy | require-corp                                 |

**SEC-22** — P0 — Implemented — Content Security Policy: nonce-based per-request. `script-src` allows Stripe.js and Cloudflare. `connect-src` allows Supabase, Stripe, OpenAI, Anthropic, and Google endpoints only.

**SEC-23** — P0 — Implemented — CSRF protection: `requireCsrfToken()` applied on all state-changing API endpoints.

**SEC-24** — P1 — Implemented — `'server-only'` import guard on all server-side modules to prevent accidental client-side leakage of secrets.

---

## 6.9 Tauri Capabilities & Filesystem Deny List

**SEC-25** — P0 — Implemented

`capabilities/default.json` deny list: 19 entries covering system paths and sensitive files:

| Blocked Category         | Examples                                       |
| ------------------------ | ---------------------------------------------- |
| SSH keys                 | `~/.ssh/*`                                     |
| Shell configuration      | `~/.bashrc`, `~/.zshrc`, `~/.profile`          |
| Credential stores        | `~/.aws/credentials`, `~/.config/gcloud/*`     |
| System directories       | `/etc/passwd`, `/etc/shadow`, `/private/etc/*` |
| Process information      | `/proc/*`                                      |
| macOS Keychain directory | `~/Library/Keychains/*`                        |

**SEC-26** — P1 — Planned (TODO #16) — `.env` files are not currently in the Tauri filesystem deny list. A tool agent could theoretically read `.env` from the project working directory. Fix: add `**/.env`, `**/.env.*` to deny list.

**SEC-27** — P2 — Implemented — Write deny list has been aligned to 19 entries matching the read deny list (previously weaker).

---

## 6.10 Browser Extension Security

**SEC-28** — P1 — Implemented

| Control                  | Detail                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Script execution         | No dynamic code evaluation. Only allowlisted DOM operations permitted                                                                 |
| Attribute injection      | `SET_ATTRIBUTE` allowlisted safe attributes only; blocks `onclick`, `onerror`, `href` on scripts, `src` on scripts, `action` on forms |
| Overlay isolation        | FAB overlay rendered in closed shadow DOM — invisible to page JS                                                                      |
| Rate limiting            | 120 requests per 500ms per origin                                                                                                     |
| Origin validation        | All messages validated against registered origin                                                                                      |
| Native messaging backoff | Exponential backoff: base 1s, max 30s, 8 attempts                                                                                     |

---

## 6.11 API Gateway & Signaling Server Security

**SEC-29** — P1 — Implemented

API Gateway:

- Helmet.js security headers
- JWT HS256, issuer + audience validated
- UUID validation on all path params
- bcrypt for password hashing
- Rate limiting per endpoint (in-memory; Redis needed for multi-instance deployments — see DEBT-07)

Signaling Server:

- Per-IP connection limits enforced
- Message rate limiting per connection
- IP blacklisting via admin endpoint
- Message size caps: 64KB general, 100KB for SDP
- Session cleanup sweep every 30s

---

## 6.12 Audit Logging

**SEC-30** — P1 — Partial

Three fragmented audit systems currently exist:

| System                  | Location                                  | Format                     | Integrity                | Retention           |
| ----------------------- | ----------------------------------------- | -------------------------- | ------------------------ | ------------------- |
| Desktop operation audit | `audit.rs` + SQLite `audit_log` table     | Structured (AuditLogEntry) | HMAC-signed              | Indefinite          |
| Desktop event log       | `audit_logger.rs` + SQLite `audit_events` | Structured                 | HMAC-signed              | Indefinite          |
| Web security audit      | Supabase `security_audit_logs`            | JSON                       | Service-role access only | 90-day auto-cleanup |

**SEC-31** — P2 — Planned — Unified, immutable, aggregated audit log pipeline required for enterprise compliance (SOC 2, ISO 27001). Current logs are not exported, not aggregated across desktop + web, and not queryable by security tooling.

---

## 6.13 Data Architecture — Local Storage (SQLite + SQLCipher)

**DATA-01** — P0 — Implemented

Local database: encrypted SQLite via `bundled-sqlcipher`. Configuration:

| Setting          | Value                      |
| ---------------- | -------------------------- |
| Journal mode     | WAL (Write-Ahead Logging)  |
| Synchronous      | NORMAL                     |
| Cache size       | 64MB                       |
| Foreign keys     | ON                         |
| Busy timeout     | 5,000ms                    |
| Full-text search | FTS5 with Porter tokenizer |

Schema: 55 migrations (v1 to v55). 80+ tables grouped by functional domain:

| Category         | Key Tables                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Core             | conversations, messages, settings, settings_v2, schema_version                                                             |
| Security         | permissions, audit_log, audit_events, approval_requests, approval_rules                                                    |
| Auth             | users, auth_sessions, oauth_providers, api_keys, auth_audit_log, role_permissions, user_permissions                        |
| Memory           | user_memory, daily_logs, project_memories                                                                                  |
| AGI / Agents     | autonomous_sessions, autonomous_task_logs, ai_employees, user_employees, employee_tasks, background_agents                 |
| Workflows        | workflow_definitions, workflow_executions, workflow_execution_logs, published_workflows                                    |
| Billing          | billing_customers, billing_subscriptions, billing_invoices, billing_usage, billing_payment_methods, billing_webhook_events |
| Calendar / Email | calendar_accounts, email_accounts, emails, email_attachments, contacts                                                     |
| MCP              | mcp_servers, mcp_tools_cache, context_items                                                                                |
| Checkpoints      | conversation_checkpoints, checkpoint_restore_history, agi_tasks, agi_task_checkpoints                                      |
| Analytics        | analytics_snapshots, process_benchmarks, roi_configurations, realtime_metrics                                              |
| Teams            | teams, team_members, team_invitations, team_resources, team_activity, team_billing                                         |
| Scheduling       | scheduled_jobs, job_executions                                                                                             |
| Automation       | automation_history, overlay_events, command_history, clipboard_history                                                     |
| Captures         | captures, ocr_results                                                                                                      |
| Computer Use     | computer_use_sessions, computer_use_actions                                                                                |
| Master Password  | master_password, master_password_migration                                                                                 |
| Sync             | offline_operations_queue, codebase_cache                                                                                   |
| FTS (virtual)    | messages_fts, conversations_fts                                                                                            |

**Key model schemas:**

```
Conversation: id, user_id, title, created_at, updated_at
Message: id, conversation_id, user_id, role (User|Assistant|System),
         content, tokens, cost, provider, model
TokenUsage: input_tokens, output_tokens, total_cost, model, provider
Permission: permission_type (File*/Command*/App*/Clipboard*/Process*),
            state (Allowed|Prompt|PromptOnce|Denied)
AuditLogEntry: operation_type, approved, success, duration_ms
```

---

## 6.14 Data Architecture — Cloud Storage (Supabase PostgreSQL)

**DATA-02** — P0 — Implemented

16+ Supabase migrations establishing the cloud data model. Row-Level Security (RLS) enabled on all tables, keyed on `auth.uid()` and `organization_members`.

**Key tables:**

| Table                   | Purpose                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| profiles                | User profile; `stripe_customer_id`, `account_status`, timestamps                           |
| subscriptions           | Per-user; `plan_tier` (free/hobby/pro/max), `stripe_subscription_id`, `current_period_end` |
| credit_accounts         | `monthly_allocation`, `monthly_used`, `daily_allocation`, `daily_used`, `idempotency_keys` |
| organizations           | Multi-tenant container with RBAC                                                           |
| organization_members    | `role` (owner/admin/member/viewer)                                                         |
| security_audit_logs     | Service-role access only; 90-day TTL                                                       |
| processed_stripe_events | Stripe webhook idempotency                                                                 |

**DATA-03** — P1 — Partial — SCIM provisioning fields added to `profiles` and `organization_members` in migration `20260224000001_add_scim_fields.sql`. No SCIM 2.0 API endpoints implemented yet (see DEBT-12).

**DATA-04** — P2 — Partial — Subscriptions are per-user, not per-organization. Enterprise customers requiring org-level consolidated billing cannot be served by current schema. Team billing model exists in code ($29/seat Team, $99/seat Enterprise) but is not wired to Stripe.

---

## 6.15 Data Architecture — Embeddings & External Databases

**DATA-05** — P1 — Implemented

Embeddings stored in separate SQLite file (`.agi/embeddings.db`):

- `EmbeddingGenerator`, `EmbeddingModel`, `EmbeddingCache`
- `CodeChunker` with configurable `ChunkStrategy`
- Cosine similarity search for retrieval

**DATA-06** — P1 — Implemented — External database connectivity from desktop agent:

| Database          | Module            | Security Control             |
| ----------------- | ----------------- | ---------------------------- |
| PostgreSQL        | `sql_client.rs`   | `SqlSecurityValidator`       |
| MySQL             | `sql_client.rs`   | `SqlSecurityValidator`       |
| SQLite (external) | `sql_client.rs`   | `SqlSecurityValidator`       |
| MongoDB           | `nosql_client.rs` | Connection string validation |
| Redis             | `redis_client.rs` | Auth URL validation          |

Safe query construction via `query_builder.rs` (Select / Insert / Update / Delete builders).

---

## 6.16 Shared Types & Validation Utilities

**DATA-07** — P1 — Implemented

Canonical types in `packages/types/src/`:

| File           | Key Types                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| context.ts     | `ContextItemType` (file/folder/url/web/image/code-snippet/selection/clipboard), `ContextItem` variants                   |
| errors.ts      | `ErrorCode` (18 codes), `ApiError`, `FriendlyError`, `FRIENDLY_ERROR_MESSAGES`, `HTTP_STATUS_TO_ERROR_CODE`              |
| tauri.ts       | `BrowserActionPayload`, `SqlQueryResult`, `MCPServerConfig`, `SubscriptionStatus`, `PlanTier`, `ExtendedMessageMetadata` |
| customModel.ts | `CustomModelConfig` (id, displayName, provider, baseUrl, modelId, apiKeyRef, contextWindow, capabilities, status)        |
| signaling.ts   | `SignalingRole`, `SignalingEvent`, `SignalKind`, `SignalingClientOptions`                                                |

Shared validation in `packages/utils/src/validation.ts`:

- `validateEmail`, `validateUrl`, `validateFilePath` (blocks `../`), `validatePassword`
- `validateApiKey`, `validateJson`, `validateSqlQuery`
- `sanitizeCommandArgs`, `checkForInjection`

---

## 6.17 Cache Architecture

**DATA-08** — P2 — Implemented

| Cache               | Algorithm              | TTL             | Max Entries | Invalidation         |
| ------------------- | ---------------------- | --------------- | ----------- | -------------------- |
| LLM responses       | LRU                    | 24h             | 512         | Eviction on capacity |
| Codebase analysis   | File-watcher backed    | On-change       | Unbounded   | File system events   |
| Tool results        | Execution result cache | Per-tool config | —           | Manual or TTL        |
| Swarm decomposition | SHA-256 content hash   | 1h              | —           | Hash mismatch        |

22 Tauri cache commands exposed to frontend for manual cache management.

---

## 6.18 Security Compliance Gaps & Roadmap

**SEC-32** — P1 — Planned — Full enterprise compliance checklist:

| Requirement                    | Current State            | Gap                            | Priority |
| ------------------------------ | ------------------------ | ------------------------------ | -------- |
| SAML 2.0 / enterprise OIDC     | Not implemented          | WorkOS config unused           | P1       |
| Unified RBAC                   | Two separate systems     | No cross-platform propagation  | P1       |
| Org-level billing              | Per-user only            | Schema migration required      | P1       |
| SCIM 2.0 provisioning          | DB fields only           | No API endpoints               | P2       |
| Immutable audit log            | Three fragmented systems | Aggregation + export needed    | P1       |
| MDM profiles (GPO/Jamf/Intune) | Passive MSI/DMG          | No provisioning profiles       | P2       |
| IT-admin update deferral       | Ed25519 verify only      | No maintenance window config   | P2       |
| In-app proxy UI                | Auto-detect only         | No PAC/TLS inspection UI       | P3       |
| .env filesystem deny list      | Not blocked              | Tauri deny list gap (TODO #16) | P1       |
| Redis rate limiting            | In-memory only           | Single-instance limitation     | P1       |

---

# Section 7 — Non-Functional Requirements & Technical Debt

> PRD: AGI Workforce — Open Model-Agnostic AI Desktop Platform
> Section: 7 of 8
> Last updated: 2026-02-26
> Status key: Implemented | Partial | Planned | Blocked

---

## 7.1 Performance Requirements

### 7.1.1 Streaming & Latency

**NFR-01** — P0 — Implemented

| Metric                                | Target  | Breach Threshold | Monitoring                                  |
| ------------------------------------- | ------- | ---------------- | ------------------------------------------- |
| LLM stream TTFT (Time to First Token) | 2,500ms | 5,000ms          | `/api/llm/v1/chat/completions` SLO          |
| Streaming connection timeout          | 300s    | —                | Was 60s; extended to handle long tool loops |
| Follow-up invoke timeout              | 120s    | —                | Was 60s                                     |
| Streaming tool loop total             | 600s    | —                | Was 180s                                    |
| WebSocket keepalive interval          | 30s     | —                | Prevents proxy timeouts                     |
| DB busy timeout                       | 5,000ms | —                | SQLite WAL contention guard                 |

Environment variables controlling SLO thresholds:

- `LLM_TTFT_SLO_TARGET_MS` — target TTFT in milliseconds
- `LLM_TTFT_SLO_BREACH_MS` — breach alert threshold in milliseconds

**NFR-02** — P0 — Implemented — SSE keepalive messages sent on streaming connections to prevent `stream_watchdog_timeout` surfacing to users. Image generation path still does not use SSE keepalive (gap; see DEBT-01).

**NFR-03** — P1 — Implemented — LRU response cache for LLM completions: 512 entries, 24h TTL. Reduces redundant API calls on repeated identical prompts.

### 7.1.2 UI Responsiveness

**NFR-04** — P1 — Planned — UI interaction targets (not yet formally benchmarked):

| Interaction                     | Target                                   |
| ------------------------------- | ---------------------------------------- |
| App cold start (Tauri)          | < 3s to interactive                      |
| Settings panel open             | < 100ms                                  |
| Chat message render (streaming) | Token-by-token, < 50ms latency per chunk |
| Tool approval modal display     | < 200ms after tool invocation            |

**NFR-05** — P2 — Partial — localStorage quota risk for large conversation histories in Zustand persist store. No enforcement of quota limits; risk of silent data loss on low-disk devices (see DEBT-10).

---

## 7.2 Scalability Requirements

**NFR-06** — P1 — Partial

| Dimension                       | Current Limit                        | Target                       | Status      |
| ------------------------------- | ------------------------------------ | ---------------------------- | ----------- |
| Concurrent sub-agents (swarm)   | 100                                  | 100                          | Implemented |
| Background agents               | MAX_BACKGROUND_AGENTS (configurable) | Unbounded                    | Implemented |
| Sync batch size (offline queue) | 100 items                            | 100 items                    | Implemented |
| Command queue per device        | 100, 5-min TTL                       | —                            | Implemented |
| Pairing session rehydrations    | 1,000 concurrent                     | —                            | Implemented |
| API gateway rate limiting       | In-memory, single-instance           | Redis-backed, multi-instance | Partial     |
| Supabase RLS performance        | Cached `auth.uid()`                  | Indexed lookups              | Implemented |
| SQLite concurrent reads         | WAL mode                             | WAL mode                     | Implemented |
| LLM ID mapping cap              | 1,000 (STR-002 fix)                  | —                            | Implemented |

**NFR-07** — P1 — Partial — API gateway rate limiting uses in-memory storage. In a horizontally scaled deployment (multiple gateway instances), rate limits are not shared across instances. Redis integration required before multi-region production deployment (see DEBT-07).

**NFR-08** — P2 — Planned — Multi-agent swarm task decomposer (`core/swarm/task_decomposer.rs:408`) is not idempotent. Duplicate task submissions under network retry scenarios can result in double execution. SHA-256 content hash cache (1h TTL) partially mitigates this but does not fully eliminate the race.

---

## 7.3 Reliability Requirements

**NFR-09** — P0 — Implemented

| Mechanism                    | Detail                                                                |
| ---------------------------- | --------------------------------------------------------------------- |
| LLM provider circuit breaker | `record_success()` / `record_server_error()` per provider             |
| Provider failover chain      | Automatic fallback across configured LLM providers                    |
| Kill switch (auth)           | Fails closed (HTTP 503) on DB error — no access granted on failure    |
| Supabase session refresh     | Auto-refresh before expiry                                            |
| Ed25519 update signing       | Desktop update verified before install                                |
| Idempotency keys (billing)   | Credit deductions deduplicated via `credit_accounts.idempotency_keys` |
| Task persistence             | `PersistentTask` + `TaskCheckpoint` for resumable agent sessions      |
| Stripe webhook idempotency   | `processed_stripe_events` table deduplicates webhook replays          |
| Constant-time auth           | Timing attack prevention on password compare                          |

**NFR-10** — P1 — Implemented — Browser extension native messaging reconnect: exponential backoff (base 1s, max 30s, 8 attempts) on host disconnect.

**NFR-11** — P1 — Partial — Extension bridge non-tool message paths (UI events, non-structured messages) do not go through the EXECUTE_SCRIPT preflight check. Mitigation: tool-path coverage is complete; non-tool paths have lower risk surface (see DEBT-09).

**NFR-12** — P1 — Partial — Task decomposer idempotency (SHA-256 hash, 1h TTL) partially mitigates but does not fully eliminate duplicate swarm task creation under retry (see NFR-08 and DEBT-08).

---

## 7.4 Testing Requirements

**NFR-13** — P0 — Implemented

| Suite             | Technology              | Current State                                   |
| ----------------- | ----------------------- | ----------------------------------------------- |
| Unit (TypeScript) | Vitest                  | 820+ tests passing on CI                        |
| Unit (Rust)       | cargo test              | All non-platform-specific tests pass            |
| End-to-end        | Playwright              | Smoke tests + self-healing; 2 retries; 1 worker |
| E2E mocking       | Environment flags       | `E2E_MOCK_SUPABASE=1`, `E2E_MOCK_LLM=1`         |
| Linting (Rust)    | cargo clippy            | `-D warnings -D unsafe-code` enforced           |
| Linting (TS)      | ESLint                  | Max 5 warnings allowed                          |
| Security scanning | cargo audit, pnpm audit | `--audit-level=high` on pnpm                    |

**NFR-14** — P1 — Partial — Credits / billing domain has minimal test coverage. Critical path (charge, deduct, refund) not covered by unit tests. Risk: billing logic regressions ship silently (see DEBT-05).

**NFR-15** — P1 — Needs Human — `features.test.ts` is a 64KB monolithic test file (C3 from CodeRabbit audit). Difficult to maintain, slow to run in isolation, and prone to test order dependency. Requires human-led decomposition into domain-scoped test files.

**NFR-16** — P2 — Planned — Platform-specific Rust tests (enigo, AutomationService) are skipped in CI. They require physical display or Windows/macOS runners. No strategy yet for automated cross-platform GUI test execution.

---

## 7.5 Build, CI/CD & Release Requirements

**NFR-17** — P0 — Implemented

Three GitHub Actions workflows:

| Workflow                | File                          | Steps                                                                             |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| CI                      | `ci.yml`                      | lint → typecheck → test → build all → cargo audit → cargo clippy → Playwright e2e |
| Desktop release         | `release-desktop.yml`         | validate → build 5 platforms → sign → notarize → GitHub Release                   |
| Signaling server deploy | `deploy-signaling-server.yml` | test → Docker build → deploy → health check                                       |

**NFR-18** — P0 — Implemented — Conventional commits enforced by commitlint:

- Header max 100 characters
- Subject must be lowercase
- Scopes validated against allowed list
- Enforced via Husky pre-commit hook

**NFR-19** — P1 — Implemented — Git hooks (lint-staged on pre-commit): ESLint --fix + Prettier applied to staged TypeScript files before commit.

**NFR-20** — P1 — Implemented — Multi-platform desktop build matrix:

- macOS universal (aarch64 + x86_64), signed + notarized
- Windows x64
- Linux AppImage

**NFR-21** — P1 — Partial — `TAURI_SIGNING_PRIVATE_KEY` is potentially logged to CI output on release build error (CodeRabbit C1, `release-desktop.yml:286`). Key material could appear in GitHub Actions log artifacts. Fix: wrap signing step in error handler that suppresses env dump (see DEBT-04).

---

## 7.6 Observability Requirements

**NFR-22** — P2 — Partial

| Signal             | Current State                               | Gap                                     |
| ------------------ | ------------------------------------------- | --------------------------------------- |
| LLM TTFT SLO       | Monitored via env-configured thresholds     | No dashboard or alerting wired          |
| Desktop audit log  | HMAC-signed SQLite entries                  | Not shipped to central logging          |
| Web security audit | Supabase service-role table                 | No SIEM integration                     |
| Error surfaces     | `FriendlyError` + `FRIENDLY_ERROR_MESSAGES` | Raw errors still shown on some paths    |
| Streaming errors   | `stream_watchdog_timeout` suppressed        | Image gen path still surfaces raw error |

**NFR-23** — P2 — Planned — Centralized observability pipeline (structured logs, metrics, traces) not implemented. Required for production SLO tracking, on-call alerting, and customer-facing status page.

---

## 7.7 Environment Variables Registry

**NFR-24** — P1 — Implemented — Complete list of required environment variables by deployment context:

**Web App (`apps/web`):**

| Variable                           | Purpose                                      |
| ---------------------------------- | -------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL           | Supabase project URL                         |
| NEXT_PUBLIC_SUPABASE_ANON_KEY      | Supabase anonymous key                       |
| SUPABASE_SERVICE_ROLE_KEY          | Server-side Supabase admin access            |
| OPENAI_API_KEY                     | OpenAI API authentication                    |
| GOOGLE_API_KEY                     | Google AI / Gemini API authentication        |
| ANTHROPIC_API_KEY                  | Anthropic Claude API authentication          |
| STABILITY_API_KEY                  | Stability AI image generation                |
| RUNWAY_API_KEY                     | Runway video generation                      |
| STRIPE_SECRET_KEY                  | Stripe server-side billing                   |
| STRIPE_WEBHOOK_SECRET              | Stripe webhook HMAC validation               |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | Stripe client-side key                       |
| NEXT_PUBLIC_APP_URL                | Canonical app URL                            |
| NEXT_PUBLIC_SITE_URL               | Public site URL for redirects                |
| UPSTASH_REDIS_REST_URL             | Redis REST API URL                           |
| UPSTASH_REDIS_REST_TOKEN           | Redis REST API token                         |
| CRON_SECRET                        | Internal cron job authentication             |
| NODE_ENV                           | Runtime environment (development/production) |
| WORKOS_WEBHOOK_SECRET              | WorkOS SSO webhook validation                |
| LLM_TTFT_SLO_TARGET_MS             | TTFT SLO target (default: 2500)              |
| LLM_TTFT_SLO_BREACH_MS             | TTFT SLO breach alert (default: 5000)        |
| NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS   | Desktop installer URL for Windows            |
| NEXT_PUBLIC_DOWNLOAD_URL_MAC       | Desktop installer URL for macOS              |
| NEXT_PUBLIC_DOWNLOAD_URL_LINUX     | Desktop installer URL for Linux              |
| DESKTOP_GITHUB_OWNER               | GitHub org for desktop release artifacts     |
| DESKTOP_GITHUB_REPO                | GitHub repo for desktop release artifacts    |

**Desktop App (`apps/desktop`):**

| Variable                           | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| TAURI_SIGNING_PRIVATE_KEY          | Ed25519 private key for update signing            |
| TAURI_SIGNING_PRIVATE_KEY_PASSWORD | Password for signing key                          |
| VITE_SUPABASE_URL                  | Supabase URL injected at frontend build time      |
| VITE_SUPABASE_ANON_KEY             | Supabase anon key injected at frontend build time |

**API Gateway (`services/api-gateway`):**

| Variable          | Purpose                  |
| ----------------- | ------------------------ |
| JWT_SECRET        | HS256 JWT signing secret |
| SUPABASE_URL      | Supabase project URL     |
| SUPABASE_ANON_KEY | Supabase anonymous key   |
| PORT              | HTTP listener port       |

**Signaling Server:**

| Variable                  | Purpose                           |
| ------------------------- | --------------------------------- |
| PORT                      | WebSocket server port             |
| ALLOWED_ORIGINS           | CORS allowlist (comma-separated)  |
| SUPABASE_URL              | Supabase project URL              |
| SUPABASE_SERVICE_ROLE_KEY | Service-role key for session auth |

---

## 7.8 Technical Debt Register

The following items are tracked as known technical debt. Priority and effort are estimated relative to each other.

---

**DEBT-01** — P0 — Image generation streaming path does not use SSE keepalive

- **Domain:** LLM streaming / media generation
- **Impact:** `stream_watchdog_timeout` error surfaces to user on long image generation requests. Identified as a critical product quality issue (zero-visible-errors policy).
- **Root cause:** Image gen route uses a different HTTP client path that does not emit SSE keepalives during generation wait.
- **Fix:** Refactor image gen path to use the same streaming HTTP client as chat completions, or emit synthetic SSE keep-alive pings during polling.
- **Status:** Blocked (requires Rust streaming path refactor; write to `docs/rust-fixes-needed.md` before touching)
- **Effort:** Medium

---

**DEBT-02** — P1 — Model catalog source-of-truth drift between TypeScript and Rust

- **Domain:** LLM routing / model catalog
- **Impact:** 6 known mismatches between `src/constants/llm.ts` (TypeScript) and `core/llm/provider_adapter.rs` (Rust). Mismatched model IDs cause routing failures for specific model versions.
- **Root cause:** Model catalog maintained in two separate files with no automated sync check.
- **Fix (TODO #14, #15):** Introduce a single canonical model ID file (JSON or TOML) as the source of truth; generate both TypeScript and Rust constants from it at build time.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-03** — P1 — Cost cap not enforced on direct LLM callers

- **Domain:** Billing / LLM routing
- **Impact:** Callers that invoke the LLM provider directly (bypassing the standard router) do not have the $50 session cost cap applied. A runaway agent could exceed budget silently.
- **Root cause:** Cost cap enforcement lives in the router middleware; direct callers skip middleware.
- **Fix:** Move cost cap check to the provider adapter layer (invoked for all callers), or add a compile-time lint that disallows direct provider calls outside the router.
- **Status:** Open
- **Effort:** Small

---

**DEBT-04** — P0 — CI may log signing private key on build error

- **Domain:** CI/CD security
- **Impact:** `TAURI_SIGNING_PRIVATE_KEY` could appear in GitHub Actions log output if the signing step in `release-desktop.yml:286` exits with an error and the runner dumps environment state.
- **Root cause:** Error handler in release workflow does not suppress environment variable logging.
- **Fix (CodeRabbit C1):** Wrap the signing invocation in an error handler that explicitly masks the key variable. Add `TAURI_SIGNING_PRIVATE_KEY` to the GitHub Actions secret masking list.
- **Status:** Pending
- **Effort:** Small

---

**DEBT-05** — P1 — Billing / credits domain has near-zero test coverage

- **Domain:** Billing
- **Impact:** Charge, deduct, refund, and credit-cap enforcement logic ships without unit test coverage. Billing regressions are not caught before production.
- **Root cause:** Billing was added rapidly; test scaffolding was not prioritized.
- **Fix:** Add unit tests for `billing_customers`, `billing_subscriptions`, `credit_accounts` mutations and the `handle_refund` RPC. Mock Stripe client.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-06** — P1 — .env files absent from Tauri filesystem deny list

- **Domain:** Security / Tauri capabilities
- **Impact:** A malicious or misconfigured tool agent could read `.env`, `.env.local`, or `.env.production` from the working directory, exfiltrating API keys and secrets.
- **Root cause:** `capabilities/default.json` deny list was built targeting system paths; project-relative secret files were overlooked (TODO #16).
- **Fix:** Add `**/.env`, `**/.env.*`, `**/.env.local`, `**/.env.production` to both the read and write deny lists in `capabilities/default.json`.
- **Status:** Planned
- **Effort:** Trivial

---

**DEBT-07** — P1 — API gateway rate limiting is in-memory and not shared across instances

- **Domain:** API gateway / scalability
- **Impact:** In a horizontally scaled deployment, each gateway instance maintains its own rate limit counters. A client can exceed global rate limits by distributing requests across instances.
- **Root cause:** Rate limiter uses in-memory storage by design for simplicity; Redis integration deferred.
- **Fix:** Replace in-memory rate limit store with Upstash Redis (credentials already in environment as `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- **Status:** Planned
- **Effort:** Small

---

**DEBT-08** — P1 — Swarm task decomposer is not fully idempotent

- **Domain:** Multi-agent swarm
- **Impact:** Under network retry conditions, the same task can be submitted multiple times, resulting in duplicate agent executions, double tool invocations, and inconsistent state.
- **Root cause:** `core/swarm/task_decomposer.rs:408` performs task decomposition on every submission without a durable deduplication check.
- **Fix:** Store task fingerprint (SHA-256 of task spec + parent context) in SQLite `agi_task_checkpoints` on first decomposition. On retry, detect existing fingerprint and return existing task tree instead of re-decomposing.
- **Status:** Partial (1h in-memory cache applied as mitigation; persistent deduplication not done)
- **Effort:** Medium

---

**DEBT-09** — P2 — Browser extension non-tool message paths skip preflight

- **Domain:** Browser extension security
- **Impact:** Non-tool extension messages (UI event relay, custom DOM reads) bypass the EXECUTE_SCRIPT preflight check that validates operation safety. Lower risk surface than tool paths, but inconsistent security posture.
- **Root cause:** Preflight check was applied only to tool-dispatched operations during initial implementation.
- **Fix:** Apply the same origin validation and operation allowlist check to all extension-to-native-host messages, not only tool-dispatched ones.
- **Status:** Partially resolved
- **Effort:** Small

---

**DEBT-10** — P2 — localStorage quota risk in Zustand persist store

- **Domain:** Frontend state management
- **Impact:** Large conversation histories serialized into localStorage can silently fail when the browser's 5MB quota is exceeded, causing data loss or store corruption.
- **Root cause:** Zustand persist middleware uses localStorage with no size guard or fallback.
- **Fix:** Implement `storageFallback.ts` with quota detection. Migrate large payloads (conversation history, memory) to IndexedDB with graceful degradation.
- **Status:** Open (storageFallback.ts file created but not wired into persist middleware)
- **Effort:** Medium

---

**DEBT-11** — P2 — SCIM 2.0 provisioning fields exist but no SCIM endpoints are implemented

- **Domain:** Enterprise / identity
- **Impact:** Enterprise customers requiring automated user provisioning via Okta, Azure AD, or other IdPs cannot be served. SCIM fields were added to the database (migration `20260224000001_add_scim_fields.sql`) in anticipation of implementation, but no API endpoints handle SCIM requests.
- **Root cause:** SCIM endpoint work was deferred after DB field migration.
- **Fix:** Implement `GET/POST/PUT/DELETE /scim/v2/Users` and `GET/POST /scim/v2/Groups` endpoints on the API gateway. Integrate with WorkOS SCIM or implement RFC 7643/7644 directly.
- **Status:** Planned
- **Effort:** Large

---

**DEBT-12** — P2 — Audit logs are fragmented, not immutable, and not aggregated

- **Domain:** Compliance / security
- **Impact:** Three separate audit systems (desktop HMAC-signed log, desktop event log, Supabase security_audit_logs) cannot be queried together. No SIEM export. Supabase logs are pruned at 90 days. Not suitable for SOC 2 or ISO 27001 audit evidence.
- **Root cause:** Audit logging was added incrementally per component without a unified design.
- **Fix:** Design a unified audit event schema. Stream all audit events (desktop + web) to an append-only log (e.g., S3 + Athena, or a dedicated audit log service). Enforce immutability via write-once policy.
- **Status:** Planned
- **Effort:** Large

---

**DEBT-13** — P2 — Provider model catalogs are stale

- **Domain:** LLM routing / model catalog
- **Impact:** Model IDs in the catalog may not match current provider offerings (TODO #1). Users see outdated model names in dropdowns; routing may silently fall back.
- **Root cause:** Model catalog is a static file; no automated refresh mechanism.
- **Fix (TODO #1):** Implement a scheduled catalog refresh job that fetches live model lists from provider APIs (OpenAI `/models`, Anthropic `/models`, etc.) and patches the catalog. Add model-not-found fallback logging.
- **Status:** Open
- **Effort:** Medium

---

**DEBT-14** — P2 — Extension orchestration not wired into AGI planner

- **Domain:** Browser extension / agent planner
- **Impact:** The browser extension can execute isolated DOM operations, but these operations are not visible to or coordinated by the AGI planner. Multi-step web automation tasks require manual orchestration (FIXME #2).
- **Root cause:** Extension was built as a standalone module; planner integration was deferred.
- **Fix:** Add extension action events to the AGI planner event bus. Allow the planner to issue extension tasks as first-class actions alongside tool calls.
- **Status:** Open
- **Effort:** Large

---

**DEBT-15** — P3 — Features test file is a 64KB monolith

- **Domain:** Testing
- **Impact:** `features.test.ts` (64KB) is slow, difficult to maintain, and creates brittle test order dependencies. CI runs the entire file as a unit, making targeted re-runs impractical (CodeRabbit C3).
- **Root cause:** Feature tests were accumulated in a single file over time without domain-based decomposition.
- **Fix:** Split `features.test.ts` into per-domain test files (e.g., `chat.test.ts`, `tools.test.ts`, `billing.test.ts`). Requires human-led refactor to avoid breaking test interdependencies.
- **Status:** Needs Human
- **Effort:** Large

---

**DEBT-16** — P3 — Model behavior normalization for thinking modes incomplete

- **Domain:** LLM routing
- **Impact:** Extended thinking / reasoning mode parameters differ across providers (Anthropic `thinking` block, OpenAI `o-series` params, Gemini `thinking` mode). Normalization is partial (TODO #9), causing inconsistent behavior when users switch models.
- **Root cause:** Each provider's thinking mode API diverged during rapid release cycle; normalization layer not fully built out.
- **Fix:** Complete the model behavior normalization layer in `modelRouter.ts`. Define a provider-agnostic `thinking_mode` parameter that maps to provider-specific parameters at dispatch time.
- **Status:** Partial
- **Effort:** Medium

---

## 7.9 Stabilization Health Matrix

Current system stability as of 2026-02-26:

| Domain                | Status           | Key Gaps                                                |
| --------------------- | ---------------- | ------------------------------------------------------- |
| Chat / LLM Routing    | Stable with gaps | Direct callers bypass cost cap (DEBT-03)                |
| Tool Execution        | Stable           | Growing unit test coverage                              |
| Tool Approvals        | Stable           | requestId race condition fix verified                   |
| Offline / Local LLM   | Stable           | Ollama health check wired                               |
| Checkpoints / Resume  | Stable           | SQLite WAL mode; persistent task checkpoints            |
| Auth / JWT            | Stable           | Argon2id, alg:none blocked, kill switch fails closed    |
| Credits / Billing     | Partial          | Near-zero test coverage (DEBT-05)                       |
| Database (SQLite)     | Stable           | SQLCipher, repository pattern, 55 migrations            |
| Database (Supabase)   | Partial          | Kill switch design trade-off (fails closed)             |
| Prompt Injection      | Stable           | escape_xml applied to all tool results                  |
| Extension Bridge      | Partial          | Non-tool paths missing preflight (DEBT-09)              |
| MCP Transport         | Stable           | 120s timeout aligned with tool loop                     |
| Multi-Agent Swarm     | Partial          | Task decomposer not fully idempotent (DEBT-08)          |
| State / Store Sync    | Partial          | localStorage quota risk (DEBT-10)                       |
| Model Catalog         | Partial          | 6 TS/Rust mismatches (DEBT-02), stale entries (DEBT-13) |
| Security / Filesystem | Partial          | .env not in deny list (DEBT-06)                         |
| Build / CI            | Stable           | 820+ tests passing; signing key log risk (DEBT-04)      |
| Image Generation      | Broken           | stream_watchdog_timeout surfaces to user (DEBT-01)      |

---

## 7.10 CodeRabbit Audit Status (as of 2026-02-26)

Total issues reviewed: 109 across 4 severity tiers.

| Severity     | Total   | Fixed   | Pending | Needs Human |
| ------------ | ------- | ------- | ------- | ----------- |
| Critical (C) | 4       | 2       | 1       | 1           |
| High (H)     | 57      | ~35     | ~10     | ~12         |
| Medium (M)   | 38      | ~25     | ~8      | ~5          |
| Low (L)      | 10      | ~5      | ~5      | 0           |
| **Total**    | **109** | **~67** | **~24** | **~18**     |

**Remaining critical issues:**

| ID  | Description                                                                            | Status                    |
| --- | -------------------------------------------------------------------------------------- | ------------------------- |
| C1  | `TAURI_SIGNING_PRIVATE_KEY` potentially logged on CI error (`release-desktop.yml:286`) | Pending — see DEBT-04     |
| C3  | `features.test.ts` 64KB monolith                                                       | Needs Human — see DEBT-15 |

**Fixed critical issues:**

| ID  | Description                                      | Commit |
| --- | ------------------------------------------------ | ------ |
| C2  | Exponential backoff test missing delay assertion | Fixed  |
| C4  | Stripe webhook test must validate HMAC           | Fixed  |

---

## 7.11 Open TODO Items

| #   | Description                                                  | Priority | Status                |
| --- | ------------------------------------------------------------ | -------- | --------------------- |
| 1   | Refresh provider model catalogs from live API                | P2       | Open — see DEBT-13    |
| 7   | Documentation and comment hygiene across codebase            | P3       | Open                  |
| 8   | Reality-based stabilization pass                             | P1       | Open                  |
| 9   | Model behavior normalization (thinking modes)                | P2       | Partial — see DEBT-16 |
| 10  | Unified multi-agent wrapper                                  | P2       | Open                  |
| 13  | Internet-verified change protocol (validate before applying) | P2       | Open                  |
| 14  | Model ID indirection (single source of truth)                | P1       | Open — see DEBT-02    |
| 15  | Synchronize model catalog (6 TS/Rust mismatches)             | P1       | Open — see DEBT-02    |
| 16  | Expand Tauri filesystem deny list (.env files)               | P1       | Open — see DEBT-06    |

---

## 7.12 Open FIXME Items

| #   | Description                                        | Severity | Status                                          |
| --- | -------------------------------------------------- | -------- | ----------------------------------------------- |
| 1   | Extension Bridge runtime dependency risk           | Low      | Partially resolved                              |
| 2   | Extension orchestration not wired into AGI planner | Medium   | Open — see DEBT-14                              |
| 3   | Model/router source-of-truth drift (TS vs Rust)    | High     | Resolved (6 mismatches remain as DEBT-02)       |
| 4   | Tool event/execution parity                        | High     | Ongoing                                         |
| 5   | Prompt injection via unsanitized tool results      | High     | Resolved                                        |
| 6   | Streaming path no circuit breaker                  | Medium   | Resolved                                        |
| 7   | Cost cap not enforced in LLM hot path              | Medium   | Resolved (direct-caller gap remains as DEBT-03) |
| 8   | Ollama is_available() not wired                    | Low      | Resolved                                        |

---

## 7.13 Enterprise Readiness Gaps

Full enterprise readiness requires resolution of the following items before an enterprise tier can be offered:

| Capability                    | Current State            | Required State                        | Debt Item |
| ----------------------------- | ------------------------ | ------------------------------------- | --------- |
| SAML 2.0 / Enterprise OIDC    | Not implemented          | WorkOS or direct SAML 2.0 handler     | —         |
| Unified RBAC                  | Two separate systems     | Single propagated role model          | SEC-16    |
| SCIM 2.0 user provisioning    | DB fields only           | Full SCIM 2.0 API                     | DEBT-11   |
| Org-level billing             | Per-user Stripe          | Per-org consolidated billing          | DATA-04   |
| Immutable audit log           | Fragmented               | Unified, append-only, SIEM-exportable | DEBT-12   |
| MDM / managed deployment      | Passive installer        | GPO/Jamf/Intune provisioning profiles | —         |
| IT-controlled update deferral | Force + min_version only | Maintenance window config             | —         |
| In-app proxy configuration    | Auto-detect env var      | PAC / manual proxy UI                 | —         |
| Tenant isolation              | RLS per user             | RLS per organization                  | DATA-04   |
| Signing key CI security       | Potentially logged       | Masked, never logged                  | DEBT-04   |

---

## Glossary

- **AGI**: Artificial General Intelligence — used here as a brand name, not a technical claim
- **ADR**: Architecture Decision Record
- **CDP**: Chrome DevTools Protocol — browser automation wire protocol
- **CLA**: Contributor License Agreement
- **HKDF**: HMAC-based Key Derivation Function
- **LLM**: Large Language Model
- **MCP**: Model Context Protocol — Anthropic's open standard for tool integration
- **NFR**: Non-Functional Requirement
- **OWASP**: Open Worldwide Application Security Project
- **PRD**: Product Requirements Document
- **RAG**: Retrieval-Augmented Generation
- **RLS**: Row-Level Security (Supabase/PostgreSQL)
- **SLA**: Service Level Agreement
- **SQLCipher**: Encrypted SQLite variant
- **SSE**: Server-Sent Events — streaming protocol
- **SSO**: Single Sign-On
- **SCIM**: System for Cross-domain Identity Management
- **STT**: Speech-to-Text
- **TTS**: Text-to-Speech
- **Tauri**: Rust-based desktop app framework (alternative to Electron)
- **VAD**: Voice Activity Detection
- **WebRTC**: Web Real-Time Communication — peer-to-peer protocol

---

_End of document._
