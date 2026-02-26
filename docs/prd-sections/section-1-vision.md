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

| # | Application | Framework | Primary Purpose |
|---|-------------|-----------|-----------------|
| 1 | **Desktop App** (primary product) | Tauri v2 + React 19 + Vite 7 + Rust | Full AI agent runtime, local storage, native integrations |
| 2 | **Web App** | Next.js 16 App Router + Supabase | Account management, billing, web-based chat, team dashboard |
| 3 | **Browser Extension** | Chrome MV3 | DOM automation, job autofill, page context capture, native messaging bridge |
| 4 | **API Gateway** | Express.js (TypeScript) | Mobile device management, cross-device sync, credits API |
| 5 | **Signaling Server** | Express.js + WebSocket | WebRTC pairing between desktop and mobile devices |

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

| Feature | AGI Workforce | Claude Desktop | ChatGPT Desktop | Gemini | Cursor / Windsurf |
|---------|:---:|:---:|:---:|:---:|:---:|
| Model agnostic (any LLM) | **Yes** — 9+ cloud providers + local | No — Anthropic only | No — OpenAI only | No — Google only | Partial |
| Local model support | Ollama, LM Studio, vLLM, llama.cpp | No | No | No | Some |
| MCP tool ecosystem | Full (stdio, SSE, HTTP) | Yes | No | Limited | No |
| Computer use (vision + action) | Full | Limited (beta) | No | No | No |
| Background agents (24 hr+) | Yes | No | No | No | No |
| Multi-agent swarm (up to 100) | Yes | No | No | No | No |
| Voice I/O | Whisper + Piper + Deepgram | No | Voice mode | Voice mode | No |
| Browser automation | CDP + extension + DOM | No | Operator (web only, supervised) | No | No |
| Email / Calendar / Cloud storage | Native IMAP/SMTP, OAuth calendars, Drive/Dropbox/OneDrive | No | No | Gmail only | No |
| Document processing (PDF/DOCX/XLSX) | Read + write + edit | No | Upload only | Upload only | No |
| Database connections | SQLite, PostgreSQL, MySQL, MongoDB, Redis | No | No | No | No |
| Custom instruction files (multi-tool) | CLAUDE.md + GEMINI.md + .cursorrules auto-discovery | CLAUDE.md only | Custom instructions | No | .cursorrules only |
| Desktop autonomy | Full (FS, terminal, apps, clipboard) | Limited (artifacts) | No | No | Code-focused |
| Licensing | Proprietary (commercial) | Proprietary | Proprietary | Proprietary | Proprietary |

### 1.6.2 Strategic Gaps Owned by AGI Workforce

The following capabilities are **not available in any competing desktop product** as of 2026-02-26:

1. **Background scheduling** — agents that continue running after the user closes the chat window, triggered on a schedule or by external events
2. **Cross-application state** — agents that maintain context across multiple desktop applications (e.g., read a spreadsheet, draft an email, file a GitHub issue, all in one uninterrupted workflow)
3. **True offline mode** — full agent functionality on a local model with no internet connection required
4. **Windows platform parity** — Claude Desktop and ChatGPT Desktop have limited Windows feature sets; AGI Workforce ships a full-featured Windows build
5. **Instruction file portability** — a project configured for Claude Code, Cursor, or Windsurf works in AGI Workforce without modification

---

## 1.7 Subscription Tiers

| Tier | Level | LLM Access | Media Generation | Target User | Price |
|------|:-----:|-----------|:---:|-------------|-------|
| **Free** | 0 | None (access blocked pending subscription) | No | Evaluation | $0 |
| **Hobby** | 1 | Economy models only | No | Casual users | TBD |
| **Pro** | 2 | Economy + balanced models | No | Active developers | Waitlisted |
| **Max** | 3 | All models including flagship (GPT-4o, Claude Opus, Gemini Ultra) | Yes | Power users | Waitlisted |
| **Team** | 3.5 | All models | Yes | Small teams | $29/seat/month |
| **Enterprise** | 4 | All models + priority support + SLA | Yes | Organizations | $99/seat/month |

Pro and Max tiers are currently in waitlist mode and are not yet purchasable. The gating mechanism is enforced server-side via Supabase `user_subscriptions` and client-side via the `subscriptionGate` utility.

---

## 1.8 Non-Negotiable Product Requirements

The following requirements are absolute constraints. Any change that violates them requires explicit sign-off from the product owner and a new PRD revision.

| ID | Requirement | Rationale |
|----|------------|-----------|
| NN-01 | Zero user-visible raw error messages | Users must never see stack traces, provider error codes, or internal exception text. All errors must be translated to friendly messages. |
| NN-02 | `stream_watchdog_timeout` must never surface to the user | The watchdog is an internal Rust safety mechanism. If it fires, the session must recover gracefully. |
| NN-03 | Auto-approve mode must have zero friction | In trusted mode (user-configured), agents must execute tools without confirmation dialogs. Any latency introduced by permission prompts in auto-approve mode is a regression. |
| NN-04 | Multi-LLM routing must work across all 9+ providers | A failure in one provider must not prevent routing to another. Circuit breaker, retry, and fallback logic are required. |
| NN-05 | Full desktop autonomy must be complete | The platform must be able to perform any action a human can perform at a keyboard and mouse, including actions in third-party applications. |
| NN-06 | API keys and secrets must never appear in plaintext | All secrets go through SecretManager (Argon2id encryption, SQLCipher storage, OS keychain integration). |
| NN-07 | Proprietary license must be enforced | All source code remains proprietary. No dependency with a copyleft license (GPL, AGPL, SSPL) may be added without a licensing review. Contributions require a CLA. |

---

## 1.9 Feature Audit Baseline (2026-02-25)

A baseline audit of 114 features was completed on 2026-02-25. The results establish the quality floor for v1.x releases:

| Status | Count | Percentage |
|--------|------:|----------:|
| PASS | 66 | 57.9% |
| PARTIAL | 21 | 18.4% |
| FAIL | 3 | 2.6% |
| BLOCKED (missing dependency) | 9 | 7.9% |
| NOT TESTABLE (desktop-only) | 10 | 8.8% |
| UNKNOWN | 5 | 4.4% |
| **Total** | **114** | **100%** |

**Definition of done for v1.2.0 release**: All FAIL items resolved, all PARTIAL items either promoted to PASS or formally deferred to a tracked issue, and all BLOCKED items have a documented dependency resolution path.

---

## 1.10 Success Metrics

| Metric | Target (v1.2.0) | Target (v2.0.0) |
|--------|----------------|----------------|
| Feature audit PASS rate | >= 80% | >= 95% |
| User-visible error rate | < 0.1% of sessions | < 0.01% of sessions |
| LLM provider uptime (routing layer) | >= 99.5% | >= 99.9% |
| Desktop app cold start time | < 3 seconds | < 2 seconds |
| Agent task success rate (automated) | >= 85% | >= 95% |
| Pro/Max waitlist conversion | >= 30% | N/A |
| Team/Enterprise seats | 50 | 500 |

---

*Section 2: Architecture — see `section-2-architecture.md`*
*Section 3: Feature Specifications — see `section-3-features.md` (forthcoming)*
