# AGI Workforce -- Project Reference

> **STALE (2026-03-16)**: This consolidation predates the current folder structure and is no longer maintained. Prefer individual docs in `docs/architecture/`, `docs/applications/`, `docs/competitive/`, and `docs/planning/`.

Consolidated from all `docs/*.md` and `docs/features/*.md` files on 2026-03-16.
This is the single reference document for the project's architecture, release gates, execution plan, feature specifications, and skill prompt template.

---

## Table of Contents

1. [Architecture](#1-architecture)
   1. [Desktop Runtime](#11-desktop-runtime)
   2. [Cross-Surface Contracts](#12-cross-surface-contracts)
   3. [Event Architecture](#13-event-architecture)
2. [Release Gates](#2-release-gates)
3. [Execution Plan](#3-execution-plan)
4. [Feature Specifications](#4-feature-specifications)
5. [Skill Prompt Template](#5-skill-prompt-template)

---

## 1. Architecture

### 1.1 Desktop Runtime

Source: `DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`

AGI Workforce desktop is the flagship native agent runtime. It is not a narrow chat client. It is the local execution surface for general-purpose chat, coding/terminal workflows, filesystem operations, MCP tools/connectors, search/deep research, media generation orchestration, memory-backed assistance, and autonomous/semi-autonomous agent workflows.

#### Planning Rule

1. Explore the live runtime first.
2. Identify canonical files actually mounted, registered, or invoked.
3. Patch only canonical files first.
4. Delete duplicates only after proving they are disconnected.
5. Validate after each cleanup slice.

#### Canonical Frontend Surface

Primary desktop shell: `apps/desktop/src/App.tsx`

Primary chat interface: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

Primary Tauri event bridge for chat/tool streaming:

- `useTauriStreamListeners.ts`, `useMessageRuntimeActivity.ts`, `MessageRuntimeActivity.tsx`
- `lib/messageArtifacts.ts`, `lib/messageActivity.ts`, `lib/messageLookup.ts`
- `lib/runtimeActivity.ts`, `lib/streamContentRuntime.ts`, `lib/streamLifecycle.ts`
- `lib/toolTimelineRuntime.ts`, `lib/toolStreamRuntime.ts`, `lib/toolNameEncoding.ts`
- `stores/extensionEventsStore.ts`

Primary inline reasoning render path:

- `ChatStream.tsx`, `ThinkingBlock.tsx`, `ReasoningAccordion.tsx`, `MessageBubble/ThinkingMessageBlock.tsx`

Primary inline approval render path:

- `ChatStream.tsx`, `MessageApprovals.tsx`, `Cards/ApprovalRequestCard.tsx`

#### Canonical Backend Surface

Primary Rust chat runtime: `sys/commands/chat/mod.rs` with 30+ active submodules including `agent_mode.rs`, `attachments.rs`, `branching.rs`, `browser_context.rs`, `compaction.rs`, `conversation.rs`, `control.rs`, `cost.rs`, `export.rs`, `intent.rs`, `maintenance.rs`, `memory_handler.rs`, `message_context.rs`, `pending.rs`, `persistence.rs`, `provider_access.rs`, `prompt_context.rs`, `search.rs`, `send_message.rs`, `send_message_execution.rs`, `send_message_setup.rs`, `share.rs`, `state.rs`, `stream_runtime.rs`, `tool_config.rs`, `tool_execution.rs`, `tool_events.rs`, `tool_timeouts.rs`, `tools.rs`, `types.rs`

Primary embedded MCP server runtime: `core/mcp/server/http_server.rs`, `handlers.rs`, `executor.rs`, `tools.rs`, `sys/commands/mcp_server.rs`

Primary desktop MCP frontend/runtime surface: `api/mcp.ts`, `stores/mcpStore.ts`, `stores/mcpbStore.ts`, `stores/mcpServerStore.ts`, `stores/mcpAppStore.ts`, `stores/connectorsStore.ts`

Primary SSE parser: `core/llm/sse_parser.rs`
Primary provider normalization: `core/llm/provider_adapter.rs`
Primary auth/session: `sys/security/auth.rs`, `auth_db.rs`, `oauth.rs`
Primary security: `sys/security/audit_logger.rs`, `command_validator.rs`

#### Registered Tauri Chat Commands

`chat_create_conversation`, `chat_get_conversations`, `chat_get_conversation`, `chat_get_messages`, `chat_send_message`, `chat_stop_generation`, `cancel_tool_execution`, `chat_get_conversation_stats`, `chat_get_cost_overview`, `chat_get_cost_analytics`, `chat_set_monthly_budget`, `chat_detect_intent`, `chat_is_stop_command`, `chat_handle_stop`, `chat_compact_context`, `clear_local_database`, `search_chat_history`, `conversation_export`, `conversation_export_pdf`

#### Canonical Runtime Flows

**Send Message**: Frontend entry in `UnifiedAgenticChat/index.tsx` -> Backend command in `send_message.rs` -> Setup in `send_message_setup.rs` -> Execution in `send_message_execution.rs` -> Tauri command name: `chat_send_message`

**Inline Reasoning**: Provider adapters (`provider_adapter.rs`) -> SSE parser (`sse_parser.rs`) -> Emitted from `chat/mod.rs` -> Consumed in `useTauriStreamListeners.ts` -> Rendered in `ChatStream.tsx`, `ThinkingBlock.tsx`, `ReasoningAccordion.tsx`

**Tool Timeline**: Label/status shaping in `lib/toolTimelineRuntime.ts`, writers in `stores/chat/toolStore.ts` and `useTauriStreamListeners.ts`

**Approvals**: Funneled through `useTauriStreamListeners.ts` and `toolStore.ts`, rendered inline via `MessageApprovals.tsx` and `Cards/ApprovalRequestCard.tsx`

**Inline Activity Ownership**: Centralized in `lib/runtimeMessageOwnership.ts` with precedence: explicit `metadata.messageId` > current streaming message > latest assistant message > latest system message

**Tool/MCP Naming**: Centralized in `lib/toolNameEncoding.ts`, `lib/chatToolUtils.ts`, `lib/toolDisplayNames.ts` -- decode encoded `b64_` segments, preserve decoded names, prefer display-map labels

#### Single-Source-of-Truth Rules

Canonical source is determined by: (1) imported by mounted React tree, (2) declared as Rust submodule from active `mod.rs`, (3) registered in `src-tauri/src/lib.rs`, (4) referenced by live send/stream path. Files failing all four checks are candidate orphans.

**Deletion Rule**: Delete only when no live import/registration exists, same responsibility exists in canonical path, useful behavior has been ported, and targeted validation passes.

#### Weekly Sprint Updates (2026-03-15/16)

**Week 1**: Audit re-baseline (5 items corrected). Tool event processing consolidated to canonical `tool:event` listener in `toolStore.ts`.

**Week 2**: Cache token extraction fixed for Anthropic/OpenAI/Gemini. Cost undercounting fixed (input tokens included). Cache-aware costing added. Frontend usage types updated.

**Week 3**: Shared types created in `packages/types/src/` for `workflow.ts`, `model-catalog.ts`, `conversation.ts`. Cross-surface contract map created.

**Week 4**: Gemini thinking blocks/reasoning tokens/model field fixes. Release gate reconciliation completed -- all 7 sections PASS.

---

### 1.2 Cross-Surface Contracts

Source: `CROSS_SURFACE_CONTRACT_MAP.md`

#### Shared Type Packages

| Package               | Path              | Contents                                                                                                                                                    |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agiworkforce/types` | `packages/types/` | context, tool-events, auth, signaling, errors, voice, agent-status, customModel, conversation, workflow, model-catalog, tauri, prompt-enhancement, database |
| `@agiworkforce/utils` | `packages/utils/` | Shared utility functions                                                                                                                                    |

#### Capability Ownership Summary

| Domain                     | Ownership                                             |
| -------------------------- | ----------------------------------------------------- |
| Model catalog data         | Shared: `apps/web/constants/models.json`              |
| Model catalog types        | Shared: `packages/types/src/model-catalog.ts`         |
| LLM routing engine         | Desktop-native: `core/llm/llm_router.rs`              |
| Core conversation types    | Shared: `packages/types/src/conversation.ts`          |
| Full message shape         | Surface-local (SQLite IDs vs API IDs vs MMKV)         |
| Tool event types           | Shared: `packages/types/src/tool-events.ts`           |
| Tool execution engine      | Desktop-native: `sys/commands/chat/tool_execution.rs` |
| MCP server connections     | Desktop-native: `core/mcp/`                           |
| Agent executor             | Desktop-native: `core/agent/executor.rs`              |
| Workflow types             | Shared: `packages/types/src/workflow.ts`              |
| Auth types                 | Shared: `packages/types/src/auth.ts`                  |
| Desktop automation         | Desktop-native only                                   |
| Voice types                | Shared: `packages/types/src/voice.ts`                 |
| Signaling types            | Shared: `packages/types/src/signaling.ts`             |
| Browser extension protocol | Extension-local: `apps/extension/src/types.ts`        |

#### Provider Parity Matrix

| Provider  | Desktop       | Web     | Mobile  | VS Code     | Extension   |
| --------- | ------------- | ------- | ------- | ----------- | ----------- |
| OpenAI    | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Anthropic | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Google    | Full (Router) | Via API | Via API | Via API     | Via Desktop |
| Ollama    | Full (Local)  | N/A     | N/A     | Via Desktop | N/A         |

#### Critical Bridge Contract Risks

1. Extension (native): Host name `com.agiworkforce.browser` hardcoded
2. Extension Bridge (Rust): `ws://127.0.0.1:8787` hardcoded
3. Mobile: Chat types diverge from `SharedMessage` (incompatible field names, missing role types)
4. Mobile: Approval response format inconsistent between `agentStore.ts` and `companion.ts`

#### Data Flow

```
models.json (source of truth)
    +-- Rust: include_str! -> models_config.rs -> llm_router, cost_calculator
    +-- Desktop TS: import -> llm.ts -> modelStore, llmConfigStore
    +-- Web: import -> model selectors, pricing display
    +-- Mobile: via API -> limited model list

Tool Execution: Desktop Rust (ToolGuard -> Execute -> Result) -> Tauri event "tool:event" -> Frontend toolStore

Conversations: Desktop=SQLite, Web=Supabase, Mobile=MMKV+API, VS Code=globalState
```

---

### 1.3 Event Architecture

Source: `DESKTOP_EVENT_INGESTION_MAP.md`

#### Canonical Listener Files

**`useTauriStreamListeners.ts`** -- transport-heavy and chat-runtime-heavy listeners: chat stream lifecycle (`chat:stream-start/status/chunk/end/error`), pending message queue, provider thinking stream, agent finished/stop, tool result/timeout/mode blocking, inline artifact and action-trail updates tied to active streaming.

**`useAgenticEvents.ts`** -- higher-level agent and integration events: file/terminal/generic tool execution, extension events, agent plan/action updates, metrics/background tasks, approval request/resolution, calendar/automation/cloud/gmail integration, MCP server/tool execution, action-log updates.

#### Stabilized Rules

- Sidecar must not auto-open from runtime activity
- Action-trail entries must resolve to a transcript message
- Inline chat is the primary execution transcript
- Transcript message targeting centralized in `runtimeMessageOwnership.ts`
- Per-message activity reads centralized in `messageActivity.ts` and `useMessageRuntimeActivity.ts`
- Artifact merge/update centralized in `messageArtifacts.ts`
- Runtime activity emission centralized in `runtimeActivity.ts`
- Tool timeline label/status centralized in `toolTimelineRuntime.ts`
- Stream finalization centralized in `streamLifecycle.ts`
- Tool-stream cleanup centralized in `toolStreamRuntime.ts`
- Tool name encoding centralized in `toolNameEncoding.ts` and `toolDisplayNames.ts`

#### Next Consolidation Target

1. Keep `useTauriStreamListeners.ts` as transport/event-capture layer
2. Move normalization into one shared message-activity mapper
3. Make `useAgenticEvents.ts` feed that same mapper
4. Render chat transcript from normalized per-message activity state

---

## 2. Release Gates

Source: `DESKTOP_RELEASE_GATE.md`

### Gate Criteria

**1. Runtime Authority**: One canonical frontend send path, backend chat runtime, reasoning stream path, approval path. No duplicate handlers. Authority determined by mounted React tree imports, active Rust `mod.rs` declarations, registered Tauri commands.

**2. Inline Visibility**: Chat transcript must expose inline: reasoning/summary, tool/function calls, approvals, progress, results/errors. Release blocked if user must open sidecar to understand agent actions.

**3. Event Contract**: Every runtime event affecting user trust must be attributable to a transcript unit with `conversation_id`, `message_id`/`frontend_message_id`, `action_id`, `kind`, `status`.

**4. Frontend Validation**: `pnpm --filter @agiworkforce/desktop typecheck`, targeted chat UI tests, targeted store tests. Regression areas include: sidecar not auto-taking over, `check-wiring.sh` accuracy, browser extension state sharing, reasoning/approvals rendering inline, stream end/error path correctness, tool name encoding, tool timeline sync.

**5. Backend Validation**: Targeted Rust parser/runtime tests. Regression areas include: reasoning deltas parsing, tool event streaming, chat backend state from `chat/state.rs`, extracted submodule ownership stability, embedded MCP `max_steps` propagation, workflow scheduler runtime, auth session encryption, analytics connection reuse.

**6. Deletion Safety**: Not mounted/imported/registered, responsibility exists in canonical path, useful behavior ported, targeted validation passes.

**7. UX Release Questions**: Can user tell what agent is doing? Can user see tool use inline? Can user see approvals inline? Can user distinguish reasoning from output? Can user recover from errors without hunting across panels?

### Gate Reconciliation (2026-03-16) -- ALL PASS

- Runtime Authority: PASS (canonical paths verified, 483 dead commands removed, ~289 registered)
- Inline Visibility: PASS (reasoning, tools, approvals, progress, errors all inline)
- Event Contract: PASS (all events carry required identifiers)
- Frontend Validation: PASS (typecheck 0 errors)
- Backend Validation: PASS (cargo check, cargo clippy 0 warnings)
- Deletion Safety: PASS (prior sprint removed 39 dead files, 12K LOC)
- UX Release Questions: PASS (architectural)
- Deferred: E2E user-flow testing, `check-wiring.sh` script validation

---

## 3. Execution Plan

Source: `MULTI_MONTH_EXECUTION_PLAN.md`

### Role and Mission

The execution agent's job is to move the codebase toward a release-capable, desktop-first, cross-surface AI platform in 30 days. Primary responsibilities: read real code before deciding, obey canonical runtime ownership, reduce architectural ambiguity, improve desktop runtime trust first, keep docs synchronized.

### High-Level Mission

1. Desktop runtime: clearly authoritative, transcript-first, release-candidate quality
2. Major model/provider behavior: trustworthy for reasoning, tools, multimodal
3. Shared contracts: explicit enough for surfaces to converge
4. Each surface: concrete documented convergence path
5. Documentation and release gates: closely match live code

### Non-Negotiable Rules

- R1: Explore before editing (read feature blueprints, PRDs, authority docs, live code)
- R2: Treat mounted/imported/registered paths as authoritative
- R3: Desktop is the primary release gate
- R4: Transcript trust outranks side-panel cleverness
- R5: Shared contracts outrank surface-local convenience
- R6: Do not stabilize fake surfaces
- R7: Documentation updates are required work
- R8: Never create authority by prose alone
- R9: Do not optimize for breadth over leverage
- R10: No hallucinated completion

### Week Structure

**Week 1**: Runtime authority and ambiguity removal -- re-baseline live defects, refresh authority docs, continue desktop runtime normalization, cross-check MCP/browser/security authority.

**Week 2**: Provider fidelity and transcript trust -- provider adapter correctness sweep, token/cost/cache truth, transcript trust sweep, MCP and browser visibility alignment.

**Week 3**: Shared contracts and cross-surface convergence -- shared conversation/runtime contracts, model catalog/capability contract, desktop-to-other-surface contract map, bridge surface alignment.

**Week 4**: Hardening, release-gate alignment, integration closure -- security/approval hardening, release-gate reconciliation, focused cleanup/simplification, month-end regression/smoke pass.

### Agent Lane Assignments

| Lane                        | Scope                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| L1: Runtime Core            | `src-tauri/src/sys/commands/chat/`, `core/llm/`, `core/agi/`, `core/mcp/`, `automation/` |
| L2: Transcript UX           | `components/UnifiedAgenticChat/`, `hooks/`, `stores/`, `lib/`                            |
| L3: Provider And Memory     | `core/llm/`, `core/embeddings/`, `core/agi/memory*`                                      |
| L4: MCP And Integrations    | `core/mcp/`, `sys/commands/mcp*.rs`, `components/MCP/`, `stores/mcp*.ts`                 |
| L5: Security And Governance | `sys/security/`, `sys/permissions/`, `sys/commands/security.rs`                          |
| L6: Web Platform            | `apps/web/`, `services/api-gateway/`                                                     |
| L7: Mobile Platform         | `apps/mobile/`, `services/signaling-server/`                                             |
| L8: VS Code Surface         | `apps/extension-vscode/`                                                                 |
| L9: Docs And Verification   | `docs/`, targeted regression coverage                                                    |

### Continuous Workstreams

CW1: Documentation synchronization (always update feature blueprints, authority docs, release gates)
CW2: Integration review (is this the live path? duplicates? drifts shared contracts?)
CW3: Targeted regression coverage (provider adapter, parser, command, store, component tests)
CW4: Release gate maintenance (track actual blockers, not historical concerns)

### Validation Matrix

Desktop frontend: `pnpm --filter @agiworkforce/desktop typecheck`, targeted `vitest` suites
Desktop backend: `cargo check/test` on touched runtime files
Other surfaces: typecheck only what you change
Documentation: does a feature doc now lie? does an authority doc now lie? does the release gate need updating?

### Rolls to Next Month

Full cross-surface conversation sync, full mobile/web parity, broad enterprise export/compliance, full CLI/shared-runtime, comprehensive plugin/package productization.

---

## 4. Feature Specifications

Source: `docs/features/*.md` (35 files including INDEX.md)

### 4.0 Feature Index

Source: `features/INDEX.md`

14 main features and 20 sub-features documented. Includes complete store-to-feature map (55+ Zustand stores), event channel registry (70+ Tauri events), web API route index (76 routes), hook-to-feature map (35 hooks), cross-feature dependency graph, Rust command module index (80+ command files), and IPC rules.

Key IPC rules: All `invoke()` calls use camelCase param names. Model IDs use hyphens. Event names use colons.

### 4.1 Chat

Core message exchange pipeline. User types message -> streams through Rust LLM router via SSE -> response renders token-by-token. Frontend entry: `UnifiedAgenticChat/index.tsx`. Backend: `sys/commands/chat/` (31 files). Streaming via `chat:stream-start/chunk/end/error`. Tool loop up to 25 iterations or 600s. Dual-write to Supabase for cross-device sync. SQLite authoritative. Supports incognito mode, rAF stream batching, frontend UUID/backend integer ID mapping.

### 4.2 Agentic Mode

Autonomous multi-turn tool-use loop. Two paths: Path A (streaming tool loop in `send_message_execution.rs`, primary) and Path B (AutonomousAgent for desktop automation, requires macOS Accessibility). Path A: LLM returns tool_calls -> execute batch -> follow-up -> repeat up to 25 iterations/600s. Tool display names mapped to Claude Code-style labels in Rust. Rate-limited progress events (100ms gap). Approval timeout 300s. Message queuing during active loop.

### 4.3 Analytics & Metrics

Four subsystems: telemetry event tracking (54 event types), ROI metrics (automation value), usage tracking (billing meters via Stripe), system/app metrics (sysinfo). Privacy-first: opt-in by default, granular consent, PII sanitization, log redaction. ROI dashboard with real-time WebSocket updates. Report generation (MD/CSV/JSON).

### 4.4 Auth

Multi-layer: Supabase cloud auth (primary identity), local master password encryption (Argon2id + AES-256-GCM), OAuth providers, QR device pairing, encrypted session bridging. Desktop auth orchestrator uses single-listener pattern to prevent race conditions. Token encryption: PBKDF2/HKDF or Argon2id-derived AES-256-GCM keys. Web-to-desktop bridge uses AES-256-GCM with 60s TTL. RBAC with Viewer/Editor/Admin roles.

### 4.5 Billing

Stripe-powered. Web: checkout, webhooks, portal, credit topup. Desktop Rust: feature-gated billing module. Credit metering in cents via Supabase RPC (atomic deduction, daily limit = 30% monthly). Plans: Hobby ($10/mo), Pro ($29.99), Max ($299.99), Enterprise (custom). Price-tier mapping centralized in `price-tier-mapping.ts`.

### 4.6 Browser Automation

Full CDP browser control. Launch/navigate/click/type via Chrome DevTools Protocol over WebSocket. `BrowserStateWrapper` graceful degradation. CSS selector injection prevention via allowlist. Two-layer security for JS execution (explicit user confirmation required). Auto-tile on first navigation. Recording as side-effect of action logging. Screenshot streaming at 500ms polling. Extension bridge fallback via WebSocket relay. 40+ registered browser commands.

### 4.7 Canvas & Artifacts

Versioned, type-aware document previews. Eight artifact types: Code, Document, Spreadsheet, Diagram, Web, Chart, Presentation, Image. In-memory `HashMap` storage (not persisted to SQLite). Version history per artifact (max 50). Diff-based updates. Streaming support with 100ms poll. Sharing: base64 for <4KB, Supabase for larger. Canvas A2UI protocol defined but commands NOT registered in `lib.rs`.

### 4.8 Cloud Storage

Multi-provider (Google Drive, Dropbox, OneDrive) with OAuth2, E2EE (AES-256-GCM with machine-derived key), chunked uploads (8-10 MB). Data sync layer (`integrations/sync/`) for cross-device entity sync (not wired to UI). `cloud_disconnect` not registered in `lib.rs`.

### 4.9 Computer Use

Autonomous desktop control via Observe-Plan-Act loop. Vision LLM analysis (`claude-sonnet-4-5`), mouse/keyboard simulation via `enigo`, 20 action types. Safety: prompt injection detection (15 patterns), per-action validation, rate limiting (120 actions/min), sandbox mode. Session management with before/after screenshots. Max 100 iterations, 300s timeout.

### 4.10 Connectors

Gallery-style integration hub. 63 external services, 48 "coming soon." OAuth path (PKCE), API key path, MCP remote path. Dual-config MCP injection: runtime env (plaintext token to process) vs persisted env (placeholder to disk). Single-use state for CSRF. 5-minute OAuth timeout. AES-256-GCM encryption at rest.

### 4.11 Custom Instructions & Templates

Three priority levels: project > conversation > global. XML-tagged merging for LLM context. Dual persistence (localStorage + Rust-side JSON file). 15 built-in agent templates with workflow definitions. Template execution is a stub (returns serialized JSON, not orchestrated).

### 4.12 Deep Linking

`agiworkforce://` custom URL scheme. Supports auth callback, encrypted session transfer, MCP OAuth callback, mobile device pairing. Event-driven decoupling via CustomEvents. AES-256-GCM encrypted token with 60s TTL, one-time nonce, rate limiting.

### 4.13 Email

IMAP/SMTP client with Gmail OAuth. TLS-only IMAP, STARTTLS SMTP. Three-tier credential storage (OS keyring, AES-256-GCM SQLite, legacy base64). Gmail Pub/Sub for real-time notifications (implemented but not wired to frontend). AI agent integration via `EmailExecutor`. All 6 Gmail OAuth commands NOT registered in `lib.rs`.

### 4.14 Embeddings & RAG

Two parallel subsystems: code embeddings (workspace indexing via Ollama nomic-embed-text, 768-dim) and memory embeddings (conversation RAG with 3-tier fallback: Ollama -> OpenAI -> None). Hybrid search: 70% vector + 30% FTS5 BM25. Code chunking: semantic (language-aware), fixed, hybrid strategies. Graceful degradation to in-memory service. Never returns zero vectors.

### 4.15 Extensions (Chrome + VS Code)

Chrome: Manifest V3, native messaging to desktop via stdio+WebSocket relay, 40+ message types, side panel chat, job autofill system. VS Code: chat participant (`@agi`), 6 slash commands, desktop bridge via HTTP+WebSocket, 19 commands, inline completions. Native messaging host binary authenticates via `.ipc_token`.

### 4.16 Files

Native filesystem browser with security sandboxing, rich document reading/creation (PDF/Word/Excel), live filesystem watching.

### 4.17 Git

Native Git version control via `git2` Tauri IPC plus server-side GitHub App webhook-driven AI code review.

### 4.18 LLM Router & Providers

Multi-provider routing with intelligent model selection, automatic failover, SSE streaming, cost tracking, per-session safety caps. Supports OpenAI, Anthropic, Google, Ollama, DeepSeek, Perplexity, XAI/Grok, and others.

### 4.19 MCP Tools

Model Context Protocol integration layer. JSON-RPC 2.0 over STDIO subprocess or HTTP/SSE transports. No artificial tool count limits. Supports stdio, SSE, and streamable HTTP transports.

### 4.20 Media Generation

AI-powered image/video generation via unified "Media Lab" panel. Supports Imagen 4, DALL-E 3, Stable Diffusion, Runway Gen4 Turbo, Google Veo 3.1 with server-side billing and credit reservation.

### 4.21 Memory

Cross-session persistent memory with automatic LLM context injection, importance scoring, temporal decay, compaction, and management UI.

### 4.22 Notifications

Three-tier system: OS-level desktop notifications, in-app notification center with persistence/pagination, ephemeral Sonner/Radix toasts.

### 4.23 Research

Multi-source deep research orchestration with LLM-powered query analysis, parallel search agents, citation tracking, structured Markdown report generation.

### 4.24 Scheduling

Job scheduling with NLP parsing, cron triggers, and workflow integration.

### 4.25 Security

ToolGuard validation (1778 lines), SecretManager (Argon2id + AES-GCM), auth, RBAC, rate limiting, audit logging, command validation.

### 4.26 Settings

App configuration with provider keys, model selection, feature toggles, theme, and preferences across desktop/web/mobile.

### 4.27 Skills & AI Employees

140+ non-coding AI skill prompts in `apps/web/.agi/employees/`. Auto-injection via Jaccard similarity matching (>= 0.15, top 2). Slash command activation.

### 4.28 Swarm / Multi-Agent

Parallel agent orchestration: task decomposition, agent spawning, result aggregation via `core/swarm/`.

### 4.29 Teams

Team management with members and billing via `features/teams/`.

### 4.30 Terminal

Full PTY terminal with sessions, input/output, resize. Commands: `terminal_spawn`, `terminal_send_input`, `terminal_resize`, `terminal_kill`.

### 4.31 Updater

App update management via `features/updater.rs` and `sys/security/updater.rs`.

### 4.32 Vision

Screen capture, OCR, computer use integration. Desktop-native only.

### 4.33 Voice

Full voice pipeline: local Whisper, VAD, push-to-talk, Deepgram live transcription, TTS playback, barge-in detection.

### 4.34 Workflows & Orchestration

Workflow engine with visual canvas (React Flow), executor, and cron/runtime scheduler via `core/orchestration/`.

---

## 5. Skill Prompt Template

Source: `SKILL_PROMPT_TEMPLATE.md`

Canonical template for writing the 140+ AI skill prompts in `apps/web/.agi/employees/`.

### Design Principles

1. Structure beats length -- explicit, bounded, easy to check
2. XML tags for Claude, Markdown headings for readability
3. Be clear and direct -- strip fluff, use plain language
4. Explicit permission to say "I don't know"
5. Examples enforce format, not just reasoning
6. Constraints as important as instructions
7. Tool instructions must be concrete
8. One skill, one job

### The 10-Layer Structure

| Layer                   | Purpose                                      | Required?     |
| ----------------------- | -------------------------------------------- | ------------- |
| 1. Task Context         | WHO the skill is, WHAT domain                | Yes           |
| 2. Tone Context         | HOW the skill communicates                   | Yes           |
| 3. Context Data         | Reference documents, knowledge bases         | If applicable |
| 4. Detailed Rules       | Instructions, constraints, boundaries        | Yes           |
| 5. Examples             | 1-3 concrete input/output demonstrations     | Yes           |
| 6. Conversation History | Multi-turn context handling                  | If applicable |
| 7. Immediate Task       | User's current request (injected at runtime) | Runtime       |
| 8. Reasoning Guidance   | Step-by-step thinking instructions           | Recommended   |
| 9. Output Format        | Exact response structure                     | Yes           |
| 10. Prefilled Response  | Opening text to steer response               | Optional      |

### Template Structure

```markdown
---
name: [skill-id-kebab-case]
description: [One-line, max 120 chars, starts with role title]
tools:
  - [Tool1]
  - [Tool2]
model: claude-sonnet-4-6
category: [Technical | Healthcare | Legal | Finance | Education | Creative | Trades | E-Commerce | Productivity | Lifestyle]
expertise:
  - '[keyword1]'
  ... (10-12 keywords)
---

# [Skill Display Name]

You are a **[Full Professional Title]** with [X]+ years of experience in [primary domain]...

<role_boundaries>
You are NOT a general-purpose assistant...
</role_boundaries>

## Core Competencies

- **[Area 1]**: [capabilities]
  ...

## Communication Style

- **[Trait 1]**: [behavior]
  ...

<tone_constraints>

- Do NOT use corporate jargon...
  </tone_constraints>

## [OPTIONAL] Domain Reference

<context>[reference material]</context>

## [REQUIRED FOR REGULATED DOMAINS] Critical Disclaimer

<disclaimer>...</disclaimer>

## How You Help

### 1. [Primary Service]

...

## Boundaries and Limitations

<constraints>
NEVER: [hard boundaries]
ALWAYS: [required behaviors]
WHEN UNCERTAIN: [uncertainty handling]
</constraints>

## Example Responses

<examples>
<example index="1">
<user_input>[question]</user_input>
<ideal_response>[complete response]</ideal_response>
</example>
</examples>

## Reasoning Approach

<thinking_guidance>

1. Classify the request
2. Assess scope
3. Identify key factors
4. Check for safety concerns
5. Determine depth
6. Formulate response
   </thinking_guidance>

## Output Format

<output_format>
[exact response structure with length guidance]
</output_format>

## Tool Usage

<tools>
- **[Tool1]**: [when to use]
</tools>

## Quality Checklist

<verification>
- [ ] Response follows output format
- [ ] Disclaimer included (if regulated)
- [ ] No out-of-domain information
- [ ] Recommendations specific and actionable
- [ ] Uncertainty stated explicitly
</verification>
```

### Frontmatter Schema

Validated by `EmployeeFrontmatterSchema` in `apps/web/core/ai/employees/prompt-management.ts`:

| Field         | Type     | Required | Notes                                                 |
| ------------- | -------- | -------- | ----------------------------------------------------- |
| `name`        | string   | Yes      | Kebab-case, slash command name                        |
| `description` | string   | Yes      | Max 120 chars                                         |
| `tools`       | string[] | Yes      | Tool names (Read, Write, Grep, Glob, WebSearch, etc.) |
| `model`       | string   | No       | Defaults to `inherit`                                 |
| `category`    | string   | No       | 10 categories                                         |
| `expertise`   | string[] | No       | 10-12 keywords for Jaccard matching                   |

### How Prompts Are Injected

1. **Auto-injection (desktop)**: Chat pipeline tokenizes user message, computes Jaccard similarity against every skill's `name + description`, injects top 2 matching skills as system messages.
2. **Employee selection (web)**: `prompt-management.ts` reads `.md` file, parses frontmatter with `gray-matter`, validates with Zod, passes markdown body as `systemPrompt`.
3. **Slash command (desktop)**: User types `/skill-name args`, Rust backend substitutes `$ARGUMENTS`, returns full prompt.

### Conversion Checklist

Frontmatter: kebab-case name, <120 char description, YAML array tools, explicit category, 10-12 expertise keywords, no emoji.

Layer 1: "You are a **[Title]**" with credentials, `<role_boundaries>`, 4-6 core competencies.
Layer 2: 4-6 communication style bullets, `<tone_constraints>`.
Layer 4: Disclaimer for regulated domains, "How You Help" with 2-4 service areas, `<constraints>` with NEVER/ALWAYS/WHEN UNCERTAIN.
Layer 5: 1-3 fully written examples in `<examples>` tags.
Layer 8: `<thinking_guidance>` with domain-specific reasoning steps.
Layer 9: `<output_format>` with length guidance.
Layer 10: `<response_steering>` defining opening approach.
Tools: Each tool with specific "when to use" instruction.
Quality: `<verification>` checklist with 6-8 domain-specific checks.
General: 800-2000 words (not counting examples), no placeholders, no emoji.
