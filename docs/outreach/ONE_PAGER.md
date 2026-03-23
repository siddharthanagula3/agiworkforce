# AGI Workforce — Acquisition One-Pager

**The native desktop AI platform your competitors already have.**

---

## The Problem You Have

| Company       | Desktop App       | CLI Agent             | MCP Ecosystem | Desktop Automation      | Mobile Companion   |
| ------------- | ----------------- | --------------------- | ------------- | ----------------------- | ------------------ |
| **Anthropic** | Claude Desktop    | Claude Code           | Full MCP      | Computer Use (API)      | No                 |
| **Google**    | Gemini Desktop    | Gemini CLI            | Partial       | Project Mariner         | Android native     |
| **OpenAI**    | ChatGPT (wrapper) | Codex CLI (code-only) | No            | Operator (API, $200/mo) | No agent oversight |

You're behind on desktop. Windsurf ($3B) only solved coding. The general-purpose desktop AI platform gap is still open.

---

## What AGI Workforce Is

A production-ready, model-agnostic AI desktop platform built on Tauri v2 (Rust + React 19). Eight shipping surfaces. One codebase.

### By the Numbers

| Metric            | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Total LOC         | 1.1M+ (400K Rust, 736K TypeScript)                                     |
| Tauri Commands    | 1,447 (76% wired to frontend)                                          |
| LLM Providers     | 24 providers, 71 models                                                |
| AI Skills         | 150+ (non-coding: legal, medical, finance, education)                  |
| MCP Tools         | Unlimited (vs Cursor's 40 cap)                                         |
| Shipping Surfaces | 8 (Desktop, Web, Mobile, CLI, Chrome Ext, VS Code Ext, API, Signaling) |
| Architecture      | Tauri v2 — native binary, not Electron wrapper                         |
| Security          | ToolGuard + SecretManager (Argon2id + AES-GCM)                         |
| Build Status      | Clean: 0 errors, 0 warnings across Rust + TypeScript                   |

### Eight Surfaces, One Platform

```
Desktop App        Tauri v2 (Rust + React 19) — native desktop control
Web App            Next.js 16 — Supabase auth, Stripe billing
Mobile App         Expo + React Native — agent oversight from phone
CLI Agent          Rust binary — 12 subcommands, voice mode, sandboxing
Chrome Extension   MV3 — native messaging, DOM automation
VS Code Extension  Chat participant, agent mode, inline completions
API Gateway        Express — mobile + integrations
Signaling Server   WebSocket — cross-device real-time streaming
```

---

## What You Can't Easily Build

1. **Multi-LLM Routing Engine** — Routes across 24 providers with SSE streaming, fallback chains, cost tracking. 18+ months to replicate.

2. **Native Desktop Automation** — Screen capture, OCR, input simulation, window management via native APIs. Not API-based "computer use" — actual local execution.

3. **Agent Runtime with Mobile Oversight** — Background agents execute tasks. Mobile companion shows real-time activity. Users approve/deny individual tool calls from their phone. Nobody else has this.

4. **150+ Non-Coding AI Skills** — Healthcare, legal, finance, education, trades, e-commerce. Expands your TAM from developers to every knowledge worker.

5. **Unlimited MCP** — stdio + SSE + streamable HTTP. No artificial tool caps. Full ecosystem access.

6. **Cross-Device Sync** — Persistent conversation threads synced across desktop and mobile via signaling server + WebRTC.

---

## Architecture

```
                    +-----------------+
                    |   React 19 UI   |  Zustand + Radix + Tailwind 4
                    +--------+--------+
                             |  invoke() / events
                    +--------+--------+
                    |  Tauri v2 IPC   |  1,447 commands
                    +--------+--------+
                             |
          +------------------+------------------+
          |          |          |          |     |
     +----+----+ +--+---+ +---+---+ +----+--+ +--+----+
     |  Core   | | Sys  | | Auto  | | Data  | | Feat  |
     +---------+ +------+ +-------+ +-------+ +-------+
     LLM Router  1,447    Screen    SQLite    Terminal
     Agent RT    Commands Input     Settings  Speech
     MCP Server  Security Browser   Cache     Calendar
     Embeddings  Auth     OCR       Secrets   Documents
     Swarm       Windows                      Search
     Triggers
```

---

## Strategic Value to OpenAI

1. **Closes the desktop gap** vs Anthropic/Google in weeks, not years
2. **Multi-model architecture** can be refocused to OpenAI-first while preserving third-party support
3. **150+ non-coding skills** unlock the professional market (lawyers, doctors, accountants) — a segment no AI company owns yet
4. **Mobile agent oversight** is the answer to "how do we make autonomous agents trustworthy"
5. **MCP ecosystem access** without building the infrastructure from scratch
6. **Tauri v2 (Rust)** — lightweight, fast, secure. Not an Electron memory hog

---

## Replacement Cost Estimate

| Component                        | Engineers  | Months     | Cost (@ $200K/yr fully loaded) |
| -------------------------------- | ---------- | ---------- | ------------------------------ |
| Rust backend (core + sys)        | 4          | 12         | $800K                          |
| React frontend (100+ components) | 3          | 10         | $500K                          |
| LLM routing + 24 providers       | 2          | 8          | $267K                          |
| Agent runtime + swarm            | 2          | 10         | $333K                          |
| MCP server + ecosystem           | 2          | 6          | $200K                          |
| Mobile app + cross-device        | 2          | 8          | $267K                          |
| CLI agent                        | 1          | 6          | $100K                          |
| Chrome + VS Code extensions      | 2          | 6          | $200K                          |
| Desktop automation               | 2          | 8          | $267K                          |
| Security layer                   | 1          | 4          | $67K                           |
| **Total**                        | **~8 avg** | **~12-18** | **$3M+**                       |

This estimate assumes experienced engineers who know the problem space. Actual cost with hiring, ramp-up, and iteration is likely 2-3x higher.

---

## The Ask

A conversation about acquisition. This platform closes your desktop gap, expands your TAM to non-developers, and ships tomorrow — not in 18 months.

**Contact**: [Your Name]
**Email**: [your@email.com]
**Demo**: [link to live demo or video]
**Live Web App**: https://agiworkforce-chat.vercel.app

---

_Confidential. Prepared March 2026._
