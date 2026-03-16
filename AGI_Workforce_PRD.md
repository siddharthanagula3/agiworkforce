# AGI Workforce — Product Requirements Document

**Version:** 1.0
**Date:** March 16, 2026
**Author:** Siddhartha Nagula
**Status:** Living Document
**Classification:** Investor / Stakeholder Material

---

## 1. Executive Summary

AGI Workforce is an open, model-agnostic AI desktop platform that unifies LLM access, autonomous agents, desktop automation, and 140+ non-coding skills into a single native application. Unlike competitors who target developers exclusively (Claude Code, Cursor, GitHub Copilot) or lock users into a single model (ChatGPT, Claude Desktop), AGI Workforce delivers the trifecta of native desktop control, multi-model orchestration, and a polished GUI — serving knowledge workers, professionals, and enterprises across every industry.

The platform ships as a Tauri v2 desktop app (macOS, Windows, Linux) with a companion mobile app (iOS/Android), Chrome extension, VS Code extension, and a Next.js web portal for marketing, auth, and billing. A real-time signaling server and API gateway support cross-device communication and third-party integrations.

**Market context (March 2026):** 87% of professional developers use AI tools daily. The AI desktop assistant market is dominated by Claude, ChatGPT, Cursor, and GitHub Copilot — all of which are code-focused, single-model, or lack native desktop control. AGI Workforce occupies the whitespace at the intersection of all three.

---

## 2. Problem Statement

Today's AI desktop tools force users into painful tradeoffs. Claude Desktop and ChatGPT offer polished chat but no desktop automation and lock users into a single provider. Cursor and Copilot are powerful but exclusively serve developers inside an IDE. No existing product lets a non-technical professional connect their preferred LLM, automate desktop workflows, manage autonomous agents, and access domain-specific AI skills — all from one native application.

**Who experiences this:** Knowledge workers, operations teams, small business owners, freelancers, and enterprises who need AI beyond coding — in healthcare, legal, finance, education, creative, trades, and e-commerce.

**How often:** Daily. AI is becoming a baseline productivity tool, but current products serve less than 15% of professional use cases.

**Cost of not solving:**

- Users juggle 3-5 AI subscriptions at $20-200/month each, with no interoperability
- Enterprises cannot standardize on a single AI platform without locking into one provider
- Non-developers are excluded from the most powerful AI capabilities (agents, tools, automation)
- Teams lack oversight and governance over AI tool execution

---

## 3. Goals

| #   | Goal                                                                       | Metric                                                    | Target                          |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| 1   | Become the default AI desktop platform for non-developers                  | MAU across non-developer segments                         | 100K MAU within 12 months of GA |
| 2   | Deliver model freedom — eliminate provider lock-in                         | % of users connecting 2+ providers                        | >40% within 6 months            |
| 3   | Enable autonomous workflows that save measurable time                      | Average weekly time saved per active user (ROI dashboard) | >5 hours/week                   |
| 4   | Establish a marketplace ecosystem for skills, plugins, and agents          | Marketplace listings (skills + plugins + agents)          | 500+ within 12 months           |
| 5   | Capture enterprise revenue through governance, security, and team features | Enterprise ARR                                            | $2M within 18 months            |

---

## 4. Non-Goals (v1)

| Non-Goal                                                       | Rationale                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Build a full IDE or code editor to compete with Cursor/Copilot | Different market; we integrate with VS Code instead                                     |
| Train or fine-tune proprietary models                          | We are model-agnostic; value is in orchestration, not model training                    |
| Replace Slack/Teams as a communication platform                | We integrate with messaging platforms, not compete with them                            |
| Offer a fully hosted cloud-only version (no desktop)           | Native desktop control is a core differentiator; web is for marketing/auth/billing only |
| Support self-hosted enterprise deployment in v1                | Premature; will revisit once product-market fit is confirmed                            |

---

## 5. Platform Architecture

### 5.1 Desktop Application (Primary Product)

**Technology:** Tauri v2 (Rust backend + React 19/TypeScript frontend)
**Platforms:** macOS, Windows, Linux
**Distribution:** Direct download, auto-updater

The desktop app is the core of AGI Workforce. It provides a native, high-performance shell around a React single-page application, with a Rust backend handling LLM routing, agent execution, desktop automation, security, and system integration.

**Why Tauri v2:**

- Native performance with ~10MB binary (vs Electron's ~100MB+)
- Rust backend for memory safety, concurrency, and system-level access
- Full access to OS APIs for automation, screen capture, input simulation
- Plugin ecosystem for extending capabilities

### 5.2 Mobile Companion App

**Technology:** React Native + Expo (iOS/Android)
**Purpose:** Live agent dashboard, remote approvals, voice interaction

### 5.3 Web Portal

**Technology:** Next.js 16, App Router
**Purpose:** Marketing, authentication (Supabase), billing (Stripe), documentation

### 5.4 Browser Extension

**Technology:** Chrome Manifest V3
**Purpose:** Context-aware AI on any webpage, form autofill, native messaging to desktop

### 5.5 VS Code Extension

**Purpose:** Code assistance, inline generation, native messaging to desktop

### 5.6 Backend Services

**API Gateway:** Express.js — mobile API, MCP proxy, real-time communication
**Signaling Server:** WebSocket — agent status, tool approvals, collaboration presence

---

## 6. Feature Specifications

### 6.1 Multi-Model LLM Engine

#### Problem

Users are locked into single AI providers, paying $20-200/month for each. Switching providers means losing context, workflows, and muscle memory. No existing tool lets users compare models side-by-side or route tasks to the optimal model automatically.

#### User Stories

- As a power user, I want to connect my own API keys for OpenAI, Anthropic, Google, and other providers so that I control my AI spend and am not locked into any vendor.
- As a team lead, I want to compare model outputs side-by-side so that I can choose the best model for each use case.
- As a cost-conscious user, I want to see real-time cost tracking per conversation so that I stay within budget.
- As an enterprise admin, I want to restrict which models my team can access so that I can enforce compliance and cost controls.
- As a privacy-focused user, I want to run local models via Ollama so that sensitive data never leaves my machine.

#### Requirements

**Must-Have (P0):**

- LLM router supporting 9+ providers: OpenAI, Anthropic, Google (Gemini), Azure OpenAI, AWS Bedrock, Ollama, LM Studio, Groq, Mistral, DeepSeek, xAI, and custom OpenAI-compatible endpoints
- Bring-your-own-key (BYOK) for all cloud providers, stored encrypted via SecretManager (Argon2id + AES-GCM)
- SSE streaming with token-by-token delivery for all providers
- Token counting and real-time cost calculation per conversation
- Model capability detection for local LLMs (Ollama `/api/show` probing for tool support)
- Provider fallback chains — automatic failover if primary provider is down
- Model ID normalization across dot/hyphen format variations

**Nice-to-Have (P1):**

- Side-by-side model comparison UI
- Auto-routing based on task type (e.g., reasoning tasks → Opus, quick tasks → Haiku)
- Cached responses to reduce redundant API calls
- Extended thinking/reasoning mode with configurable token budgets

**Future Considerations (P2):**

- Fine-tuned model hosting marketplace
- Custom model adapter SDK for niche providers

#### Success Metrics

- Adoption: >60% of users connect at least one API key within first session
- Multi-provider: >40% of active users connect 2+ providers within 30 days
- Cost transparency: <2% of support tickets related to unexpected billing

#### Technical Notes

- Core implementation: `core/llm/llm_router.rs` (2,274 lines), `provider_adapter.rs`, `sse_parser.rs`
- Model catalog maintained in three locations that must stay in sync: `src/constants/llm.ts` (frontend), `constants/models.json` (web, 2,571 lines), `provider_adapter.rs` (Rust)
- `normalize_model_id()` handles dot/hyphen format normalization at router entry
- Dual HTTP clients: one standard, one with streaming timeout disabled

---

### 6.2 Agent Runtime & Autonomous Execution

#### Problem

Users spend hours on repetitive multi-step tasks that could be automated. Existing AI chat interfaces require constant hand-holding — the user must specify each step. There is no consumer-grade product that lets a non-developer say "research competitors and write a report" and have an AI agent handle the full workflow autonomously.

#### User Stories

- As a knowledge worker, I want to give a high-level task description and have an AI agent plan and execute it autonomously so that I can focus on higher-value work.
- As a manager, I want to monitor agent progress in real-time and approve or deny specific tool calls so that I maintain oversight without micromanaging.
- As a power user, I want to run multiple agents in the background simultaneously so that parallel workstreams don't block each other.
- As an enterprise user, I want a full audit trail of every action an agent takes so that I can demonstrate compliance.
- As a mobile user, I want to approve or deny agent tool calls from my phone so that agents can proceed while I'm away from my desk.

#### Requirements

**Must-Have (P0):**

- Agent executor with plan → execute → verify loop
- Task planning and decomposition (planner module)
- Tool execution pipeline with ToolGuard sandboxing (1,778 lines of safety validation)
- Tool confirmation/approval system (agent requests permission before sensitive actions)
- Real-time agent status events (`agentic:loop-started`, `agentic:loop-status`, `agentic:loop-ended`)
- Tool event emission to frontend (`tool:event` channel with Started/Progress/Completed lifecycle)
- Background agent execution (agents run without blocking the UI)
- Context management and compression for long-running agents
- Multi-level undo/redo for agent actions
- Change tracking for all agent modifications

**Nice-to-Have (P1):**

- Swarm orchestration — parallel agent spawning, task decomposition, result aggregation
- Continuous execution mode for long-running workflows
- Vision-based planning (agent uses screenshots to decide next action)
- Dynamic prompt engineering (agent adapts its approach based on results)
- RAG system for agent knowledge retrieval

**Future Considerations (P2):**

- Agent marketplace (share/sell custom agents)
- Agent-to-agent communication protocol
- Self-improving agents that learn from past executions

#### Success Metrics

- Activation: >30% of users trigger an agentic workflow in their first week
- Completion rate: >75% of agentic tasks complete successfully without user intervention
- Time saved: Average 3+ hours/week per active agent user (measured via ROI dashboard)
- Trust: <5% of tool calls are denied by users after the first month (indicating calibrated trust)

#### Technical Notes

- Core: `core/agent/executor.rs`, `planner.rs`, `runtime.rs`, `autonomous.rs`, `background_agent.rs`
- Security: `sys/security/tool_guard.rs` validates every tool execution
- Events: `sys/commands/chat/tool_events.rs` emits structured `ToolEvent` to frontend
- Frontend: `chat/toolStore.ts` → `ToolLabel.tsx` + `ToolTimeline.tsx` render tool execution UI

---

### 6.3 Desktop Automation & Computer Use

#### Problem

AI assistants live in a chat box, disconnected from the user's actual desktop environment. They can generate text but cannot interact with applications, fill forms, navigate the web, or perform the screen-level tasks that consume hours of a knowledge worker's day.

#### User Stories

- As an office worker, I want the AI to fill out forms in my browser by reading the screen so that I avoid repetitive data entry.
- As a researcher, I want the AI to navigate websites, extract information, and compile it into a document so that I save hours of manual web research.
- As a power user, I want to record a sequence of desktop actions and have the AI replay them on demand so that I can automate recurring workflows.
- As a cautious user, I want safety guardrails that prevent the AI from performing destructive actions (deleting files, sending emails) without my explicit approval.

#### Requirements

**Must-Have (P0):**

- Screen capture with multi-monitor support
- OCR from screenshots (text extraction from any screen region)
- Browser automation via Playwright CDP (Chrome DevTools Protocol)
- Keyboard and mouse input simulation
- Vision-based planning (screenshot → AI analysis → action decision)
- Safety guardrails with known-safe automation patterns
- OS lock detection (pause automation when screen is locked)
- Action logging for full audit trail

**Nice-to-Have (P1):**

- macOS-specific automation via Accessibility APIs and AppleScript
- Windows UIA (UI Automation) integration
- DOM inspection for structured page interaction
- Screen watcher for continuous monitoring and reactive automation
- Action recording and playback

**Future Considerations (P2):**

- Cross-application workflow orchestration (e.g., "copy data from Excel → paste into Salesforce")
- Natural language macro creation ("every morning at 9am, open Slack and summarize unread messages")

#### Success Metrics

- Adoption: >20% of users trigger at least one automation action in their first month
- Safety: Zero critical safety incidents (destructive actions without approval)
- Reliability: >90% automation task completion rate

#### Technical Notes

- Core: `automation/` module — `browser/`, `computer_use/`, `input/`, `screen/`, `vision_planner.rs`
- Safety: `automation/safety.rs`, `safety_patterns.rs`, `os_lock.rs`
- Platform-specific: `automation/mac/` (UIA, AppleScript), `automation/uia/` (Windows)

---

### 6.4 MCP (Model Context Protocol) Integration

#### Problem

AI tools need to interact with external services (databases, APIs, file systems, cloud platforms), but each tool implements its own integrations. MCP is the emerging standard for tool interoperability, but existing platforms either don't support it or impose artificial limits (Cursor caps at 40 tools).

#### User Stories

- As a developer, I want to connect any MCP server to AGI Workforce so that my AI agents can use tools from any MCP-compatible service.
- As a team lead, I want to manage MCP server connections for my organization so that the team has access to approved tools.
- As an advanced user, I want to use stdio, SSE, and HTTP transports so that I can connect both local and remote MCP servers.
- As a builder, I want to create custom MCP extensions so that I can add proprietary tools to the platform.

#### Requirements

**Must-Have (P0):**

- Full MCP client supporting stdio, SSE, and streamable HTTP transports
- Unlimited tool registration (no artificial caps)
- Tool discovery and browsing UI (MCP browser)
- Connection status monitoring and health checks
- MCP credential management with secure storage
- Configuration via `.mcp.json`
- OAuth flow support for authenticated MCP servers

**Nice-to-Have (P1):**

- MCP server logs viewer for debugging
- MCP config editor in settings UI
- Custom MCP extension loading
- Bundled MCP servers for common use cases

**Future Considerations (P2):**

- MCP server marketplace
- Hosted MCP server infrastructure
- MCP server creation wizard (no-code)

#### Success Metrics

- Adoption: >25% of users connect at least one MCP server
- Tool breadth: Average 10+ MCP tools per active MCP user
- Reliability: >99% uptime for connected MCP servers

#### Technical Notes

- Core: `core/mcp/` — server connections, tool registration, extension management
- Frontend: `mcpStore.ts`, `mcpbStore.ts`, `mcpServerStore.ts`, `mcpAppStore.ts`
- Config: `.mcp.json` in project root
- Commands: `sys/commands/mcp.rs`, `mcp_extensions.rs`

---

### 6.5 140+ Non-Coding AI Skills

#### Problem

Every AI assistant on the market is code-focused. Developers have Claude Code, Cursor, and Copilot. But the 85% of professionals who are not developers — doctors, lawyers, accountants, teachers, marketers, tradespeople — have no AI tool purpose-built for their domain.

#### User Stories

- As a healthcare professional, I want AI skills for medical documentation, patient communication, and clinical decision support so that I can focus on patient care.
- As a small business owner, I want AI skills for invoicing, inventory management, and customer communication so that I can run my business more efficiently.
- As a lawyer, I want AI skills for contract review, legal research, and document drafting so that I can serve more clients.
- As a teacher, I want AI skills for lesson planning, grading assistance, and student communication so that I can spend more time teaching.
- As a skill creator, I want to build and publish custom skills to the marketplace so that I can monetize my domain expertise.

#### Requirements

**Must-Have (P0):**

- Skill execution runtime integrated with the agent system
- 140+ pre-built skills across: healthcare, legal, finance, education, creative, trades, e-commerce, productivity, marketing, sales, operations, engineering, customer support, design, and data analysis
- Skill marketplace UI with search, filtering, and categorization
- Skill installation and version management
- Custom skill creation framework

**Nice-to-Have (P1):**

- Skill performance analytics (usage, satisfaction, completion rate)
- Skill recommendations based on user behavior
- Skill chaining (compose multiple skills into a workflow)

**Future Considerations (P2):**

- Revenue sharing for third-party skill creators
- Enterprise skill libraries (private, team-specific skills)
- Skill certification program

#### Success Metrics

- Breadth: 140+ skills available at launch
- Adoption: >50% of users activate at least one non-coding skill
- Retention: Users who use skills retain at 2x the rate of chat-only users
- Marketplace: 50+ third-party skills within 6 months

#### Technical Notes

- Core: `core/skills/` — skill definitions, versioning, runtime
- Commands: `sys/commands/skills.rs`, `marketplace.rs`
- Frontend: `SkillMarketplace/` components, `skillMarketplaceStore.ts`
- Intent routing: `core/intent/` — maps natural language to skill activation

---

### 6.6 Mobile Companion App

#### Problem

AI agents running on a desktop need human oversight, but the human isn't always at their desk. No competitor offers a dedicated mobile app for monitoring and controlling desktop AI agents. Claude's "Remote Control" is restricted to Max tier ($100-200/month).

#### User Stories

- As a mobile user, I want to pair my phone with my desktop via QR code so that setup is instant and secure.
- As a manager, I want a live dashboard showing what my desktop agents are doing so that I maintain oversight while mobile.
- As a user on the go, I want to approve or deny agent tool calls from my phone so that agents aren't blocked waiting for my return.
- As a voice-first user, I want to have voice conversations with my AI from my phone so that I can interact hands-free.
- As a multi-device user, I want my conversations to sync across desktop and mobile so that I can continue work seamlessly.

#### Requirements

**Must-Have (P0):**

- QR code pairing with desktop app (no account required for initial pairing)
- Real-time agent status dashboard
- Tool approval/denial cards (approve/deny per tool call)
- Chat interface with message history sync
- Push notifications for agent events requiring attention
- Model selection and management

**Nice-to-Have (P1):**

- Voice conversations with waveform visualization
- Schedule management (create/edit/delete scheduled tasks)
- Multi-platform messaging integration (Slack, Teams, Discord)
- Memory management (view/edit agent knowledge)

**Future Considerations (P2):**

- Mobile-initiated agent tasks (start desktop agents from phone)
- Widget for quick agent status on home screen
- Apple Watch / WearOS companion for notifications

#### Success Metrics

- Pairing: >30% of desktop users pair a mobile device within 30 days
- Engagement: Paired users check agent status 3+ times/day on average
- Approval speed: <2 minute average response time for tool approval requests
- Retention: Paired users retain at 1.5x the rate of desktop-only users

#### Technical Notes

- Technology: React Native + Expo
- Communication: WebSocket via signaling server + API gateway
- Auth: OAuth flow shared with web portal (Supabase)
- Screens: Companion dashboard, chat, approvals, voice, settings

---

### 6.7 Security & Governance

#### Problem

Enterprises cannot adopt AI tools without security, audit, and governance controls. Most AI desktop tools have no RBAC, no audit logging, no encryption-at-rest for secrets, and no tool execution sandboxing.

#### User Stories

- As an enterprise admin, I want role-based access control so that I can limit what each team member can do.
- As a compliance officer, I want a full audit trail of every AI action so that I can demonstrate regulatory compliance.
- As a security engineer, I want all API keys encrypted at rest with industry-standard algorithms so that a database breach doesn't expose credentials.
- As a team admin, I want to set tool execution policies (approve, deny, auto-allow) per tool category so that I can balance productivity with security.
- As a privacy-focused user, I want the option to run everything locally (local LLMs, no cloud calls) so that sensitive data never leaves my machine.

#### Requirements

**Must-Have (P0):**

- ToolGuard: Tool execution sandboxing with validation for every tool call (1,778 lines)
- SecretManager: API key encryption via Argon2id key derivation + AES-256-GCM, stored in OS keychain or SQLCipher
- Role-based access control (RBAC) with configurable roles
- Audit logging for all security-relevant operations
- Rate limiting per user and per API key
- Input validation at all system boundaries
- Deep link security with allowlist validation and token redaction
- Master password protection for the secret vault

**Nice-to-Have (P1):**

- Governance dashboard (pending approvals, audit events)
- Per-tool approval policies (auto-allow, ask, deny)
- Session management and forced logout
- Export audit logs for compliance reporting

**Future Considerations (P2):**

- SOC 2 Type II certification
- SSO/SAML integration for enterprise identity providers
- Data loss prevention (DLP) rules for agent outputs
- HIPAA-compliant deployment option

#### Success Metrics

- Security: Zero credential exposure incidents
- Adoption: >80% of enterprise trial users cite security as a deciding factor
- Compliance: Audit logs satisfy compliance requirements for 3+ frameworks (SOC 2, HIPAA, GDPR)

#### Technical Notes

- Core: `sys/security/tool_guard.rs` (1,778 lines), `SecretManager`, encryption modules
- Auth: `sys/security/auth`, `sys/account/`
- Data: SQLCipher encrypted database, OS keychain integration
- RBAC: `sys/security/rbac.rs`, `sys/permissions/`

---

### 6.8 Chat & Conversation System

#### Problem

Chat is the primary interaction surface for AI assistants. Users need rich conversations with streaming responses, tool execution visibility, artifacts, citations, file attachments, and conversation management — not just a text box.

#### User Stories

- As a user, I want to see tool execution in real-time (what the agent is doing, progress, results) so that I understand and trust the AI's work.
- As a researcher, I want citations with source links in AI responses so that I can verify claims.
- As a creative user, I want inline artifact rendering (code, charts, documents) so that I can see results without switching contexts.
- As a power user, I want to attach files, images, and documents to my messages so that the AI has full context.
- As an organizer, I want to manage conversations with auto-tagging and search so that I can find past conversations quickly.

#### Requirements

**Must-Have (P0):**

- SSE streaming with token-by-token rendering
- Tool execution timeline (collapsible, showing tool name, args, duration, result preview)
- File upload and attachment support (images, documents, code)
- Conversation history with search
- Message citations with source attribution
- Token usage and cost display per message
- Keyboard shortcuts for power users
- Auto-tagging for conversation organization

**Nice-to-Have (P1):**

- Inline artifact rendering (HTML, React, Mermaid diagrams, SVGs)
- Ghost-text prompt completion (predictive input)
- Conversation branching (explore alternative responses)
- Export conversations (Markdown, PDF)
- Custom system prompts per conversation

**Future Considerations (P2):**

- Collaborative conversations (multiple users in one chat)
- Conversation templates for common workflows
- Voice-to-text input with real-time transcription

#### Success Metrics

- Engagement: Average session length >15 minutes
- Tool transparency: >90% of users report understanding what agents are doing (via tool timeline)
- Retention: 7-day retention >60%

#### Technical Notes

- Frontend: `UnifiedAgenticChat/` — `ToolLabel.tsx`, `ToolTimeline.tsx`, inline panels
- Stores: `unifiedChatStore.ts`, `chat/chatStore.ts`, `chat/toolStore.ts`
- Backend: `sys/commands/chat/` — message handling, streaming, tool events
- Utility: `lib/chatToolUtils.ts` — tool name normalization, data transforms

---

### 6.9 Voice & Speech

#### Problem

Many users prefer voice interaction, especially when multitasking, on mobile, or in accessibility scenarios. Existing AI chat tools treat voice as an afterthought — a dictation feature bolted onto text chat.

#### User Stories

- As a multitasking user, I want to speak to the AI using a global hotkey so that I can interact without switching windows.
- As a mobile user, I want full voice conversations with natural turn-taking so that I can use the AI hands-free.
- As a user with accessibility needs, I want reliable speech-to-text and text-to-speech so that I can use the AI without typing.

#### Requirements

**Must-Have (P0):**

- Global hotkey voice input (press-to-talk from any app)
- Speech-to-text transcription
- Text-to-speech output
- Voice conversation mode with waveform visualization
- Voice input on mobile companion

**Nice-to-Have (P1):**

- Local Whisper integration for offline speech-to-text
- Voice Activity Detection (VAD) for natural turn-taking
- Voice command system ("Hey AGI, start a new conversation")

**Future Considerations (P2):**

- Multi-language voice support
- Voice cloning for personalized TTS
- Real-time voice translation

#### Technical Notes

- Backend: `features/speech/` — TTS, STT engines
- Frontend: `Voice/` components — overlay, waveform, global commands
- Rust features: `vad`, `local-whisper` (optional compile-time features)

---

### 6.10 Research & Knowledge Management

#### Problem

Research is one of the most time-consuming knowledge work tasks. Users need to gather information from multiple sources, synthesize findings, and maintain a knowledge base — all of which AI can accelerate dramatically.

#### User Stories

- As a researcher, I want to give the AI a research question and have it search the web, synthesize sources, and produce a report so that I save hours of manual research.
- As a knowledge worker, I want the AI to remember context from past conversations so that I don't repeat myself.
- As a team member, I want to browse and search the AI's memory so that I can see what it knows and correct any errors.

#### Requirements

**Must-Have (P0):**

- Web research with source ranking and citation
- Research progress tracking and history
- Memory system with importance indicators
- Memory browser for viewing and editing stored knowledge
- Embedding-based semantic search (3-tier fallback: Ollama local → OpenAI cloud → FTS-only)

**Nice-to-Have (P1):**

- Research report generation with source cards
- Code search across repositories
- Document search and indexing
- RAG (Retrieval-Augmented Generation) for grounding responses in stored knowledge

**Future Considerations (P2):**

- Automated knowledge graph construction
- Team shared knowledge base
- Knowledge decay (auto-deprecate outdated information)

#### Technical Notes

- Core: `core/research/`, `core/embeddings/`
- Memory: `core/agent/rag_system.rs`, `sys/commands/memory.rs`
- Embedding fallback: `core/agi/conversation_summarizer.rs` — Ollama (nomic-embed-text, 768-dim) → OpenAI (text-embedding-3-small, 1536-dim) → None

---

### 6.11 Productivity & Scheduling

#### Problem

Users need AI to proactively manage their time, not just react to prompts. Scheduling tasks, tracking time, and measuring productivity are core needs that no AI desktop tool addresses natively.

#### User Stories

- As a busy professional, I want to schedule AI tasks to run at specific times (daily reports, weekly summaries) so that work happens automatically.
- As a productivity-focused user, I want to see how much time the AI has saved me so that I can quantify ROI.
- As a manager, I want focus mode controls so that my team can work without AI interruptions during deep work.

#### Requirements

**Must-Have (P0):**

- Task scheduler with recurring schedule support (NLP-parsed scheduling)
- ROI dashboard: time saved tracking, cost analysis, comparison with manual work
- Calendar integration (view/create/manage events)
- Reminder system

**Nice-to-Have (P1):**

- Proactive scheduling (AI suggests optimal times for tasks)
- Focus modes (AI adjusts behavior based on user's availability)
- Productivity analytics (patterns, trends, recommendations)
- Export ROI reports

**Future Considerations (P2):**

- Integration with external calendars (Google Calendar, Outlook)
- Team productivity dashboards
- AI-powered daily briefings

#### Technical Notes

- Scheduler: `core/scheduler/` — NLP parser, proactive scheduling, types
- ROI: `ROIDashboard/` components, `roiStore.ts`
- Calendar: `features/calendar/`, `calendarStore.ts`
- Commands: `sys/commands/scheduler.rs`, `productivity.rs`, `calendar.rs`

---

### 6.12 Workspace & Document Management

#### Problem

Knowledge workers live in documents — Word files, PDFs, spreadsheets, presentations. AI tools that can only generate text in a chat window miss the opportunity to work directly with the user's actual files and filesystem.

#### User Stories

- As an office worker, I want the AI to read, create, and edit documents in my filesystem so that I can work with real files, not just chat text.
- As a project manager, I want to organize AI work into separate workspaces per project so that context doesn't bleed across projects.
- As a data analyst, I want the AI to query databases and visualize results so that I can analyze data without writing SQL.

#### Requirements

**Must-Have (P0):**

- Filesystem workspace explorer (browse, read, write files)
- Multi-workspace support (separate contexts per project)
- Document management (create, edit, organize)
- File watcher for detecting external changes
- Code editor with diff viewer and syntax highlighting
- Integrated terminal

**Nice-to-Have (P1):**

- Database workspace (connect, query, visualize)
- Git integration panel
- File upload/download with preview
- Conflict resolution for concurrent edits
- Canvas workspace for artifact management

**Future Considerations (P2):**

- Cloud storage sync (Google Drive, OneDrive, Dropbox)
- Collaborative editing (multiple users editing the same document)
- Version history for all files

#### Technical Notes

- Frontend: `Filesystem/`, `Documents/`, `Code/`, `Editor/`, `Terminal/`, `Database/`, `Canvas/`
- Stores: `filesystemStore.ts`, `documentStore.ts`, `codeStore.ts`, `terminalStore.ts`, `workspaceStore.ts`
- Backend: `sys/commands/file_ops.rs`, `file_watcher.rs`, `document.rs`, `terminal.rs`, `database.rs`
- Cloud: `integrations/cloud/` — sync and storage

---

### 6.13 Communication Integrations

#### Problem

AI tools are siloed — they don't connect to the platforms where work actually happens. Users want AI to read, draft, and send messages across Slack, Teams, email, and other channels without switching contexts.

#### User Stories

- As a team communicator, I want the AI to draft messages for Slack, Teams, and email from a single interface so that I save time context-switching.
- As an email user, I want Gmail integration so that the AI can read, draft, and manage my email.
- As a support agent, I want to connect multiple messaging platforms so that the AI can help me respond across channels.

#### Requirements

**Must-Have (P0):**

- Multi-channel messaging support (Slack, Teams, Discord, email)
- Gmail OAuth integration for email read/write
- Message composer with platform-specific formatting
- Message history and search

**Nice-to-Have (P1):**

- WhatsApp, Telegram, SMS integration
- Email workspace with folder management
- Auto-draft responses based on context
- Communication analytics

**Future Considerations (P2):**

- AI-powered email triage and prioritization
- Automated response workflows
- Multi-language communication support

#### Technical Notes

- Features: `features/messaging/`, `features/communications/`
- Email: `sys/commands/email.rs`, `gmail_oauth.rs`
- Frontend: `Messaging/`, `Email/`, `Communications/`
- Stores: `emailStore.ts`

---

### 6.14 Connector Ecosystem

#### Problem

Users need AI to work with their existing tools — CRMs, project managers, analytics platforms, cloud services. Building individual integrations doesn't scale; a connector framework does.

#### User Stories

- As a user, I want to browse and install connectors for my existing tools (Salesforce, Jira, GitHub, etc.) so that the AI can work with my data.
- As a developer, I want to build custom connectors using OAuth or API keys so that I can integrate proprietary services.
- As an admin, I want to manage which connectors my team uses so that I control data access.

#### Requirements

**Must-Have (P0):**

- Connector gallery UI with search and categories
- OAuth flow support for connector authentication
- API key management for simple connectors
- GitHub integration (repos, issues, PRs)

**Nice-to-Have (P1):**

- Google Workspace batch operations
- Cloud storage connectors (Google Drive, OneDrive, Dropbox)
- API workspace for testing and managing integrations

**Future Considerations (P2):**

- Connector SDK for third-party developers
- Pre-built connectors for 50+ popular services
- Connector marketplace with revenue sharing

#### Technical Notes

- Frontend: `Connectors/` — gallery, OAuth flow, API key management
- Backend: `integrations/api_integrations/`, `sys/commands/extension.rs`
- Stores: `connectorsStore.ts`

---

### 6.15 Media & Creative Tools

#### Problem

AI-generated images and videos are increasingly important for marketing, content creation, and design. Users want these capabilities integrated into their AI workspace, not scattered across separate tools.

#### User Stories

- As a content creator, I want to generate images and videos from text descriptions so that I can create visual assets without design skills.
- As a vision user, I want to upload images for AI analysis so that I can extract information from screenshots, documents, and photos.

#### Requirements

**Must-Have (P0):**

- Vision analysis (upload images, get AI descriptions/analysis)
- Image upload with preview in chat

**Nice-to-Have (P1):**

- Image generation from text prompts
- Video generation
- Media gallery and management
- Screen capture with OCR

**Future Considerations (P2):**

- Image editing (inpainting, outpainting)
- Batch media processing
- Brand kit integration

#### Technical Notes

- Frontend: `Vision/`, `Media/`, `ScreenCapture/`
- Backend: `sys/commands/media.rs`, `vision.rs`, `capture.rs`, `ocr.rs`
- Stores: `mediaGenerationStore.ts`

---

### 6.16 Real-Time Collaboration

#### Problem

AI tools are single-user. As teams adopt AI, they need shared workspaces with presence awareness, live cursors, and synchronized state.

#### User Stories

- As a team member, I want to see who else is viewing the same conversation so that I know my colleagues are engaged.
- As a collaborator, I want real-time cursor indicators so that I can see what others are looking at.

#### Requirements

**Must-Have (P0):**

- WebSocket signaling for real-time updates
- Agent status broadcasting across devices

**Nice-to-Have (P1):**

- Collaborative cursors and presence indicators
- Live message syncing across team members
- Shared workspace state

**Future Considerations (P2):**

- Collaborative agent control (multiple users managing one agent)
- Screen sharing within the platform

#### Technical Notes

- Signaling: `services/signaling-server/`
- Frontend: `Realtime/` — cursors, presence
- Backend: `integrations/realtime/`

---

### 6.17 Onboarding & Help

#### Problem

Powerful tools are useless if users can't learn them. AGI Workforce has extensive features that require guided onboarding and in-app help.

#### User Stories

- As a new user, I want a guided onboarding flow that helps me set up my first API key, run my first agent, and understand the interface so that I get value quickly.
- As a returning user, I want contextual help and tutorials so that I can discover features progressively.

#### Requirements

**Must-Have (P0):**

- First-run onboarding wizard
- Tutorial system with element highlighting and guided tours
- Help section with searchable documentation

**Nice-to-Have (P1):**

- Interactive tutorials for key workflows
- Tooltip-based feature discovery
- "Simple mode" for non-power-users

**Future Considerations (P2):**

- AI-powered help (ask the AI about how to use the AI)
- Community forum integration

#### Technical Notes

- Frontend: `Onboarding/`, `Tutorials/`, `Help/`, `SimpleMode/`
- Backend: `ui/onboarding`, `sys/commands/tutorials.rs`

---

### 6.18 Billing & Subscription

#### Problem

A SaaS product needs tiered pricing, usage tracking, and self-serve billing. Enterprise customers need team management and usage controls.

#### User Stories

- As a free user, I want to use basic models and features so that I can evaluate the product before committing.
- As a paying user, I want to manage my subscription, view invoices, and track usage so that I stay in control of my spend.
- As an enterprise admin, I want to manage team billing and usage limits so that I control costs across the organization.

#### Requirements

**Must-Have (P0):**

- Tiered pricing: Free, Hobby, Pro, Max, Enterprise
- Stripe integration for payment processing
- Usage tracking and billing dashboard
- Feature gating per tier (models, tools, limits)

**Nice-to-Have (P1):**

- Team billing and seat management
- Usage alerts and spending limits
- Invoice history and download

**Future Considerations (P2):**

- Annual billing with discounts
- Custom enterprise pricing
- Marketplace revenue sharing

#### Technical Notes

- Web: `features/billing/`, `app/api/payment/`
- Stripe: Server-side via `STRIPE_SECRET_KEY`, client via `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Price IDs: 8 `STRIPE_PRICE_*` environment variables
- Frontend: `billingUsage` store

---

### 6.19 Chrome Extension

#### Problem

AI is most useful in context. When a user is browsing the web, they shouldn't need to switch to a separate app to get AI assistance. The browser is where much of knowledge work happens.

#### User Stories

- As a web user, I want AI assistance on any webpage via a sidebar so that I can get help without leaving my current context.
- As a job seeker, I want the AI to autofill application forms using my profile data so that I save time on repetitive applications.
- As a researcher, I want to select text on any page and send it to the AI for analysis so that I can get instant insights.

#### Requirements

**Must-Have (P0):**

- Chrome Manifest V3 extension
- Side panel chat interface
- Context-aware AI on any webpage
- Native messaging to desktop app
- Text selection → chat interaction

**Nice-to-Have (P1):**

- Form autofill (jobs, applications)
- Page content injection for contextual AI
- Popup quick-access interface

**Future Considerations (P2):**

- Firefox, Safari, Edge support
- Browser automation from extension (vs desktop)
- Extension marketplace

#### Technical Notes

- Technology: Vite + React, Manifest V3
- Communication: Native messaging to Tauri desktop app
- Modules: `background.ts`, `content.ts`, `popup.ts`, `side_panel.ts`, `autofill/`

---

### 6.20 VS Code Extension

#### Problem

While AGI Workforce is not an IDE, many users are developers who want AI assistance inside their editor. A VS Code extension bridges the gap without competing with Cursor/Copilot directly.

#### User Stories

- As a developer, I want inline AI code generation in VS Code so that I get AI help where I write code.
- As a VS Code user, I want my VS Code extension to communicate with the desktop app so that I have a unified AI experience.

#### Requirements

**Must-Have (P0):**

- VS Code extension with AI code assistance
- Native messaging to desktop app

**Nice-to-Have (P1):**

- Inline code generation
- Code explanation and documentation
- Terminal integration

#### Technical Notes

- Technology: Vite build, VS Code extension API
- Communication: Native messaging via `integrations/native_messaging/`

---

### 6.21 AI Intelligence Layer (RAG, Intent, Reflection)

#### Problem

A truly autonomous agent needs more than an LLM call — it needs intent understanding, retrieval-augmented grounding, structured reasoning, and self-reflection to produce reliable, verifiable results.

#### User Stories

- As a user giving vague instructions, I want the AI to correctly interpret my intent and route my request to the right skill or agent so that I don't have to be precise.
- As a user working with domain-specific data, I want the AI to ground its answers in my stored knowledge (RAG) so that responses are factual, not hallucinated.
- As a power user, I want the AI to self-reflect on its answers and compare alternatives so that I get the highest-quality output.

#### Requirements

**Must-Have (P0):**

- Intent detection and classification system (maps natural language to actions, skills, and agent behaviors)
- RAG (Retrieval-Augmented Generation) pipeline — query embeddings, semantic search, context injection
- 3-tier embedding fallback: Ollama local (nomic-embed-text, 768-dim) → OpenAI cloud (text-embedding-3-small, 1536-dim) → FTS-only
- Context management and compression for long conversations
- Conversation summarization for memory efficiency

**Nice-to-Have (P1):**

- Reflection module — AI evaluates its own outputs before returning them
- Answer comparison — compare multiple approaches and select the best
- Process reasoning — structured multi-step reasoning for complex tasks
- Checkpoint/resumable agent state for failure recovery

**Future Considerations (P2):**

- Continuous learning from user corrections
- Custom intent classifiers per domain
- Explainable reasoning traces for enterprise audit

#### Technical Notes

- Intent: `core/intent/` (10+ subdirectories covering classification, routing, entity extraction)
- RAG: `core/agent/rag_system.rs`
- Embeddings: `core/embeddings/`, `core/agi/conversation_summarizer.rs`
- Reflection: `core/agi/reflection.rs`, `comparator.rs`, `process_reasoning.rs`
- Checkpoints: `core/agi/checkpoint.rs`

---

### 6.22 Hooks & Extensibility System

#### Problem

Power users and enterprises need to customize agent behavior without modifying source code. A hooks system (inspired by Claude Code) allows intercepting tool execution at key lifecycle points for validation, logging, transformation, or policy enforcement.

#### User Stories

- As an enterprise admin, I want to add a PreToolUse hook that blocks certain tool calls based on policy so that I enforce security rules without modifying the agent.
- As a developer, I want to add a PostToolUse hook that auto-formats code after every file write so that code style is always consistent.
- As an automation builder, I want hooks to trigger external workflows when agents complete tasks so that I integrate AGI Workforce into my pipeline.

#### Requirements

**Must-Have (P0):**

- PreToolUse hooks: Execute before any tool call (validation, parameter modification, blocking)
- PostToolUse hooks: Execute after tool completion (auto-format, logging, chaining)
- Stop hooks: Execute when an agent session ends (final verification, cleanup)
- Hook configuration via settings (no code changes required)

**Nice-to-Have (P1):**

- Hook marketplace (share/install community hooks)
- Hook debugging and logging
- Conditional hooks (only trigger on specific tools or patterns)

#### Technical Notes

- Core: `core/hooks/` — `executor.rs`, `config.rs`, `types.rs`

---

### 6.23 Orchestration & Workflow Engine

#### Problem

Complex business processes involve multiple steps, branching logic, and dependencies. Users need a way to define, execute, and monitor multi-step workflows that coordinate multiple agents and tools.

#### User Stories

- As a business process owner, I want to define multi-step workflows that chain agent actions together so that complex processes run automatically.
- As an operations manager, I want to monitor workflow execution and see where bottlenecks occur so that I can optimize processes.

#### Requirements

**Must-Have (P0):**

- Workflow definition and execution engine (separate from the agent swarm layer)
- Step sequencing with dependency management
- Workflow state persistence and resumability
- Error handling and retry logic

**Nice-to-Have (P1):**

- Visual workflow builder
- Conditional branching and parallel execution paths
- Workflow templates for common business processes

#### Technical Notes

- Core: `core/orchestration/` — workflow engine, executor, scheduler, state management
- Commands: `sys/commands/orchestration.rs`, `workflows.rs`

---

### 6.24 Codebase Understanding

#### Problem

For developer users and code-related tasks, agents need to understand repository structure, navigate files, search code, and reason about codebases — not just generate code in isolation.

#### User Stories

- As a developer, I want the AI agent to understand my project structure so that code generation fits my architecture.
- As a code reviewer, I want the AI to search my codebase for patterns and references so that it provides contextually accurate suggestions.

#### Requirements

**Must-Have (P0):**

- Repository structure analysis
- Code search and navigation
- File tree understanding
- Language-aware parsing

**Nice-to-Have (P1):**

- Dependency graph analysis
- Symbol resolution across files
- Code change impact analysis

#### Technical Notes

- Core: `core/codebase/` — structure analysis, search, navigation

---

## 7. Competitive Positioning

### Direct Competitors

| Capability            | AGI Workforce | Claude Desktop |     ChatGPT     |      Cursor       | GitHub Copilot  |
| --------------------- | :-----------: | :------------: | :-------------: | :---------------: | :-------------: |
| Native Desktop App    |      Yes      |      Yes       |    No (web)     |     Yes (IDE)     | No (IDE plugin) |
| Multi-Model           | 9+ providers  |  Claude only   |    GPT only     |    Multi-model    |   Multi-model   |
| Desktop Automation    |     Full      |    Limited     |       No        |        No         |       No        |
| Non-Coding Skills     |     140+      |      None      |      None       |       None        |      None       |
| Mobile Companion      |      Yes      | $100+/mo tier  |       No        |        No         |       No        |
| BYOK + Local LLMs     |      Yes      |       No       |       No        |        No         |       No        |
| Unlimited MCP Tools   |      Yes      |    Limited     |       No        |      40 cap       |       No        |
| Agent Runtime         |     Full      |     Basic      |      Basic      | Background agents |       No        |
| Enterprise Governance | RBAC + Audit  |       No       | Enterprise tier |        No         | Enterprise tier |

### Six Unique Differentiators

1. **Local Desktop Control + Multi-Model + Native GUI** — The only tool combining a native Tauri desktop app with 9+ model providers and screen/keyboard/app automation. Claude Code has local control but no GUI; Cursor has GUI + multi-model but zero desktop control.

2. **Mobile Companion with Live Agent Dashboard** — Dedicated iOS/Android app with QR-pair, real-time agent oversight, per-tool-call approve/deny. Zero competitors offer this.

3. **140+ Non-Coding AI Skills** — Every competitor is code-focused. AGI Workforce serves healthcare, legal, finance, education, creative, trades, and e-commerce.

4. **Full BYOK + Local LLMs + Native GUI** — Users own their API relationships and can run fully offline with Ollama/LM Studio. No other native GUI app offers this.

5. **Proprietary Desktop-Native Agent Platform** — Closed-source, enterprise-grade security, commercial SaaS model with full IP protection.

6. **MCP Without Artificial Limits** — Unlimited MCP tools across stdio, SSE, and HTTP transports. Cursor caps at 40 tools.

---

## 8. Success Metrics Summary

### Leading Indicators (Days to Weeks Post-Launch)

| Metric                   | Target                                  | Measurement       |
| ------------------------ | --------------------------------------- | ----------------- |
| Daily Active Users (DAU) | 10K within 90 days                      | Analytics         |
| API Key Connection Rate  | >60% connect in first session           | Onboarding funnel |
| Agent Activation Rate    | >30% trigger agentic workflow in week 1 | Feature usage     |
| Mobile Pairing Rate      | >30% pair within 30 days                | Pairing events    |
| Skill Activation Rate    | >50% activate a non-coding skill        | Skill usage       |
| Task Completion Rate     | >75% of agent tasks succeed             | Agent logs        |

### Lagging Indicators (Weeks to Months)

| Metric                  | Target                        | Measurement      |
| ----------------------- | ----------------------------- | ---------------- |
| Monthly Active Users    | 100K within 12 months         | Analytics        |
| 7-Day Retention         | >60%                          | Cohort analysis  |
| Net Promoter Score      | >50                           | Survey           |
| Enterprise ARR          | $2M within 18 months          | Stripe/CRM       |
| Marketplace Listings    | 500+ within 12 months         | Marketplace data |
| Average Time Saved      | >5 hours/week per active user | ROI dashboard    |
| Multi-Provider Adoption | >40% use 2+ providers         | Settings data    |

---

## 9. Open Questions

| #   | Question                                                                           | Owner               | Blocking?                        |
| --- | ---------------------------------------------------------------------------------- | ------------------- | -------------------------------- |
| 1   | What is the pricing for each tier (Free, Hobby, Pro, Max, Enterprise)?             | Product/Business    | Yes — before public launch       |
| 2   | Which MCP servers should be bundled out-of-the-box vs. installed from marketplace? | Product/Engineering | No                               |
| 3   | What is the SOC 2 certification timeline for enterprise sales?                     | Security/Compliance | No — but blocking for enterprise |
| 4   | Should the mobile app require a paid plan or be available on free tier?            | Product/Business    | Yes — before mobile launch       |
| 5   | What is the revenue sharing model for third-party skill creators?                  | Business/Legal      | No — future consideration        |
| 6   | Which local LLM models should be officially supported (beyond Ollama/LM Studio)?   | Engineering         | No                               |
| 7   | What is the data retention policy for conversation history and agent logs?         | Legal/Security      | Yes — before enterprise launch   |
| 8   | Should the Chrome extension be a standalone product or require the desktop app?    | Product             | No                               |

---

## 10. Timeline Considerations

### Phase 1: Desktop GA (Current)

- Core LLM engine with 9+ providers
- Agent runtime with ToolGuard security
- Desktop automation (browser, screen, input)
- MCP integration (unlimited tools)
- 140+ non-coding skills
- Chat system with tool timeline
- Voice input/output
- Chrome extension
- Web portal with auth and billing

### Phase 2: Mobile + Enterprise (Next)

- Mobile companion app GA (iOS/Android)
- Enterprise governance dashboard
- Team billing and seat management
- SSO/SAML integration
- Expanded connector ecosystem

### Phase 3: Marketplace + Ecosystem (Following)

- Skill marketplace with third-party listings
- Agent marketplace
- Connector SDK for developers
- Revenue sharing program
- API for third-party integrations

---

## 11. Technical Scale

| Metric                     | Value                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Feature Specifications     | 24 (sections 6.1–6.24)                                                             |
| TypeScript Components      | 400+                                                                               |
| Zustand Stores             | 55+                                                                                |
| Tauri Command Handlers     | 125+                                                                               |
| Rust Modules               | 100+                                                                               |
| LLM Providers Supported    | 9+                                                                                 |
| Pre-built AI Skills        | 140+                                                                               |
| Web Routes                 | 30+                                                                                |
| API Endpoints              | 20+                                                                                |
| Platform Targets           | macOS, Windows, Linux, iOS, Android, Chrome, VS Code                               |
| Compile-Time Feature Flags | 7 (shell, updater, ocr, local-llm, vad, local-whisper, remote-databases, devtools) |
| Security Systems           | ToolGuard (1,778 LOC), SecretManager (Argon2id + AES-GCM), RBAC, Audit Logging     |

---

_This document is a living PRD. It reflects the current state of AGI Workforce as of March 2026 and will be updated as features ship, metrics are collected, and strategy evolves._
