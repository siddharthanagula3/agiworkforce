# AGI Workforce — Product Vision

_March 20, 2026_

---

## The Problem

Every major AI company is building a chatbot. Claude Desktop, ChatGPT, Gemini — they all share the same fatal constraint: **model lock-in**. Anthropic will never ship a ChatGPT model in Claude Desktop. OpenAI will never route to Claude. Google will never let you use anything but Gemini.

Users are left managing 3-5 separate AI subscriptions, switching between apps depending on which model is best for the task, losing context across platforms, and paying redundant costs for overlapping capabilities.

**The pain is specific and growing:**

1. **Model lock-in** — Each platform only supports its own models. Users can't use Claude for reasoning and GPT-4o for vision in the same workflow.
2. **No desktop autonomy** — Cloud-only platforms can't control your computer, manage files, run terminal commands, or automate desktop workflows.
3. **No local/offline option** — When you need privacy (medical records, legal documents, proprietary code), cloud-only platforms force you to upload sensitive data.
4. **Chat-only paradigm** — Current AI tools are glorified chatbots. They can't plan multi-step workflows, coordinate parallel agents, or operate autonomously.
5. **Fragmented ecosystem** — MCP tools work on one platform, not another. Skills built for Claude don't transfer to ChatGPT. Your conversation history is scattered.

## The Solution

AGI Workforce is not a chatbot. It is an **AI workforce platform** — a native desktop application where users deploy a company of specialized AI agents that plan, execute, and coordinate work autonomously.

**The paradigm shift: from "assistant" to "workforce."**

Instead of chatting with one AI model, users:

- Connect **any model** from any provider (22+ supported)
- Deploy **specialized agents** with domain expertise (150+ non-coding skills)
- Grant agents **desktop autonomy** — file management, terminal, browser control, screen capture
- Coordinate **parallel agent swarms** that decompose and execute complex tasks
- Monitor and approve agent actions from **desktop, web, or mobile**

## The 6 Moats

### 1. Multi-LLM Routing Engine

**Code: `core/llm/llm_router.rs` (1,200+ lines)**

The only production-grade multi-model router that supports 22+ providers (OpenAI, Anthropic, Google, Ollama, DeepSeek, Perplexity, XAI/Grok, Mistral, Cohere, AWS Bedrock, and more) with automatic failover, cost tracking, cache-aware pricing, and per-session safety caps.

Users bring their own keys. Use Claude for reasoning, GPT-4o for vision, Gemini for multimodal, Ollama for privacy — in the same conversation.

**No competitor offers this.** Claude Desktop: Claude only. ChatGPT: GPT only. Cursor: ~5 providers. Gemini CLI: Gemini only.

### 2. Native Desktop Autonomy

**Code: `automation/` (browser, computer_use, input simulation)**

Full computer use: screen capture, OCR, mouse/keyboard simulation, browser automation via CDP, 20 action types. Protected by prompt injection detection (15 patterns), per-action validation, rate limiting (120 actions/min), and sandbox mode.

The desktop is the only platform that can truly automate workflows — manipulating any application, not just browser tabs.

### 3. Mobile Companion (QR Pair)

**Code: `apps/mobile/` (React Native + Expo)**

QR-scan pairing with the desktop app. Monitor background agents, approve/deny actions, view live dashboards — all from your phone. WebRTC data channel for real-time communication.

**The killer differentiator:** No competitor offers mobile agent monitoring. Your agents work while you're away from your desk.

### 4. 150+ Non-Coding Skills

**Code: `core/skills/`, `.agi/employees/` (140+ skill definitions)**

While competitors focus exclusively on coding, AGI Workforce ships 150+ specialized skills across 10 categories: Healthcare, Legal, Finance, Education, Creative, Trades, E-Commerce, Productivity, Lifestyle, and Technical.

Auto-injected via Jaccard similarity matching. Your AI workforce knows domains beyond code.

### 5. Unlimited MCP Integration

**Code: `core/mcp/` (server, transport, registry, extensions)**

Full MCP support: stdio, SSE, and streamable HTTP transports. No artificial tool count limits (Cursor caps at 40). JSON-RPC 2.0 compliant. The embedded MCP server exposes AGI Workforce's own capabilities to other AI platforms.

### 6. Security-First Agent Platform

**Code: `sys/security/` (ToolGuard 2,310 LOC, SecretManager, auth)**

ToolGuard validates every tool execution with per-tool policies, rate limiting, risk levels, and approval requirements. API keys encrypted via Argon2id + AES-256-GCM. Constant-time token comparison. Command injection prevention. RBAC with Viewer/Editor/Admin roles.

Enterprise-grade security that competitors treat as an afterthought.

## Architecture

### 8-Surface Monorepo

```
┌─────────────────────────────────────────────────────────┐
│                    AGI Workforce                         │
├─────────────┬──────────┬──────────┬────────┬───────────┤
│   Desktop   │   Web    │  Mobile  │  CLI   │Extensions │
│  Tauri v2   │ Next.js  │  Expo    │  Rust  │Chrome+VSC │
│  Rust+React │  16      │  RN 19   │        │           │
├─────────────┴──────────┴──────────┴────────┴───────────┤
│              Shared Types & Utilities                    │
│        packages/types/  |  packages/utils/              │
├─────────────────────────────────────────────────────────┤
│                    Services Layer                        │
│          API Gateway  |  Signaling Server               │
├─────────────────────────────────────────────────────────┤
│                   Data Layer                             │
│        SQLite (desktop)  |  Supabase (cloud)            │
│        MMKV (mobile)     |  SecretManager               │
└─────────────────────────────────────────────────────────┘
```

### How Agents Work

```
User Request
    ↓
Intent Detection → Skill Matching (Jaccard)
    ↓
LLM Router → Provider Selection → Model Routing
    ↓
Agent Planner → Task Decomposition
    ↓
Tool Executor → ToolGuard Validation → Execute
    ↓
Result → Follow-up (up to 25 iterations) → Stream to UI
    ↓
Swarm Orchestrator (parallel agents, if needed)
```

### Codebase Scale

| Layer                     | LOC            | Files      |
| ------------------------- | -------------- | ---------- |
| Rust backend              | ~397,000       | 759        |
| TypeScript (all surfaces) | ~753,000       | ~2,848     |
| AI skill definitions      | ~15,000        | 150        |
| **Total**                 | **~1,165,000** | **~3,757** |

Development velocity: 1,508 commits (verified 2026-03-20).

## Market Landscape 2026

### Feature Matrix

| Capability                | AGI Workforce     | Claude Desktop | ChatGPT Desktop | Cursor    | Gemini CLI    |
| ------------------------- | ----------------- | -------------- | --------------- | --------- | ------------- |
| Model support             | 22+ providers     | Claude only    | GPT only        | ~5        | Gemini only   |
| BYOK (Bring Your Own Key) | Yes               | No             | No              | Yes       | No            |
| Local/Offline LLMs        | Yes (Ollama)      | No             | No              | No        | No            |
| Desktop automation        | Full              | Limited        | No              | No        | No            |
| MCP tools                 | Unlimited         | Unlimited      | No              | 40 cap    | Yes           |
| Non-coding skills         | 150               | 0              | 0               | 0         | 0             |
| Mobile companion          | Yes (QR pair)     | Preview        | Mobile app      | No        | No            |
| Agent orchestration       | Multi-agent swarm | Single agent   | Single agent    | Single    | Single        |
| Open source               | Planned           | No             | No              | No        | Yes           |
| Runtime                   | Rust (Tauri)      | Electron       | Electron        | Electron  | TypeScript    |
| Price                     | BYOK (free tier)  | $20-200/mo     | $20-200/mo      | $20-40/mo | Free (1K/day) |

### Competitor Positions (Web-Researched, March 2026)

**Anthropic (Claude Desktop/Code)** — $380B valuation, $19B ARR, ~18.9M MAU. Claude Code at $2.5B ARR. Opus 4.6 with 1M context, agent teams, Claude Cowork for autonomous tasks. IPO targeting June-July 2026. Pricing: $20-200/mo. Strategic weakness: **will NEVER support competing models** — business model requires Claude lock-in. No local LLM support natively. Aggressive rate limits even on paid tiers.

**ChatGPT Desktop / Codex (OpenAI)** — GPT-5.4 (March 2026) with native computer use — screen reading, mouse/keyboard, browser automation. Codex desktop: 1.6M+ weekly active users. Pricing: $20-200/mo. Limitation: OpenAI models only, computer use requires API/Codex (not in standard Desktop), no BYOK for other providers.

**Cursor (Anysphere)** — $29.3B valuation (Nov 2025), $1B+ ARR, 1M+ DAU. VS Code fork with multi-file editing agents. Pricing: $20-200/mo with credit system. Limitation: **code editor only** — not a general-purpose AI platform. No desktop automation, no local LLM, no non-coding skills.

**Windsurf (Cognition/Devin)** — Acquired for ~$250M (Dec 2025), Google licensed IP for $2.4B separately. $82M ARR at acquisition. "Cascade" AI with project-wide understanding. Limitation: code editor only, same as Cursor. Integration with Devin still in progress.

**Perplexity Computer** — Launched Feb 25, 2026. **First multi-model agentic AI**: 19 models (GPT-5.2, Claude Opus 4.6, Gemini, etc.), multi-agent orchestration, 400+ app integrations. Cloud-sandboxed. Pricing: **$200/mo minimum** (Max tier). Limitation: cloud-only (no local), web-only (no native app), no BYOK, no local LLM.

**Gemini CLI** — Free, open source (Apache 2.0), v0.33.2 (March 2026). Gemini 2.5 Pro with 1M context. Plan Mode, browser agent, MCP support. Limitation: Google models only, CLI-only (no GUI), no desktop automation, significant availability issues, model retirement churn.

### MCP Ecosystem (Web-Researched)

- **Adoption**: Natively supported by Anthropic, OpenAI, Google, Microsoft, Amazon — de facto standard
- **Scale**: 10,000+ public MCP servers, SDKs at 97M+ monthly downloads (Python + TypeScript)
- **Market**: ~$1.8B enterprise demand (healthcare, finance, manufacturing)
- **2026 roadmap**: Streamable HTTP for remote servers, stateful sessions, event-driven triggers, ContextForge security

### AI Desktop Market Size (Web-Researched)

- **AI PC shipments**: 143M units in 2026, 55% of total PC market (IDC/Canalys)
- **AI platform market**: $14.2B (2024) → $251B by 2033, 38.1% CAGR
- **Global IT spending**: $6.15T in 2026, 10.8% growth (Gartner)
- **Signal**: Cursor alone crossed $1B ARR. Perplexity launched Computer at $200/mo. Market is proven.

### Protocol Landscape

| Protocol | Owner                        | Status   | AGI Workforce Support           |
| -------- | ---------------------------- | -------- | ------------------------------- |
| MCP      | Anthropic → Linux Foundation | Standard | Full (stdio, SSE, HTTP)         |
| WebMCP   | W3C (Google+Microsoft)       | Emerging | Implemented in Chrome extension |
| A2A      | Google                       | Early    | Planned                         |
| NLWeb    | Microsoft                    | Early    | Detection implemented           |
| ACP      | OpenCode                     | Early    | Planned for VS Code extension   |

## Roadmap

### 3 Months (April-June 2026)

**Ship v1.0 publicly:**

- macOS code-signed DMG + Windows installer + Linux AppImage
- Chrome Web Store listing
- VS Code Marketplace listing
- App Store + Play Store submission
- Vercel production deployment

**Complete wiring:**

- Wire remaining ~55% of Tauri commands to frontend (643 of 1,439 wired)
- Email workspace UI (IMAP backend ready)
- Visual workflow builder (engine ready, need drag-drop canvas)
- Knowledge base browser (RAG backend ready)

### 6 Months (July-September 2026)

**Platform expansion:**

- AGI Workforce CLI (multi-model Claude Code competitor)
- Plugin/skill marketplace
- Team collaboration features
- MCP Apps rendering in desktop
- Deep Research agent (100+ source analysis)

### 12 Months (October 2026 - March 2027)

**Enterprise + ecosystem:**

- Enterprise SSO/SCIM
- On-premise deployment option
- Advanced governance and audit trails
- Full offline mode across all surfaces
- Messaging relay (WhatsApp/Slack/Telegram)
- Local LLM fine-tuning UI
- WebRTC video/audio agent calls

## Why Now

1. **Tauri v2 maturity** — Native performance with web UI flexibility. Rust backend for security and speed. Cross-platform from a single codebase.

2. **MCP ecosystem explosion** — The tool integration standard is here. Every AI company is adopting MCP. The platform that connects to the most tools wins.

3. **Multi-model world** — No single model is best at everything. Claude excels at reasoning, GPT-4o at vision, Gemini at multimodal, local models at privacy. Users need a platform, not a chatbot.

4. **Agent-native workflows** — 2026 is the year AI agents go from demos to production. The platforms that ship agent orchestration, approval workflows, and monitoring will define the category.

5. **Desktop AI gap** — Cloud platforms can't control your computer. Desktop apps that can (Perplexity Computer, Claude Desktop) are single-model. The market needs an open, multi-model desktop AI platform.

## The Ask

**AGI Workforce is ~1.2M lines of working code across 8 surfaces.** The technical moat is deep — 22-provider LLM router, ToolGuard security layer, 150+ domain skills, native desktop automation, mobile companion, and the only production-grade multi-model agent platform.

What's needed to win:

1. **Users** — Ship v1.0, get to 10K MAU, validate product-market fit
2. **Distribution** — Chrome Web Store, VS Code Marketplace, App Stores, ProductHunt
3. **Community** — Open-source the core, build contributor ecosystem
4. **Revenue** — BYOK free tier + Pro subscription + Enterprise licensing
5. **Team** — 2-3 engineers to accelerate the ~55% unwired command gap and enterprise features
