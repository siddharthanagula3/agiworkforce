# Section 3: Desktop Application — Feature Requirements

**Product**: AGI Workforce Desktop
**Version**: 1.1.5
**Framework**: Tauri v2 (Rust + React/TypeScript)
**Last Updated**: 2026-02-26
**Status Legend**: `Implemented` | `Partial` | `Planned` | `Blocked`
**Priority Legend**: `P0` = Must Ship | `P1` = High | `P2` = Medium | `P3` = Nice-to-Have

---

## 3.0 Overview

The AGI Workforce Desktop application is an open, model-agnostic AI platform built on Tauri v2. The Rust backend exposes approximately 1,069 Tauri commands across 87 modules, persists state in 80+ SQLite tables managed through 55 schema migrations, and toggles behavior through 12 compile-time feature flags (`shell`, `updater`, `devtools`, `ocr`, `local-llm`, `webrtc-support`, `sentry`, `billing`, `appstore`, `vad`, `local-whisper`). The React/TypeScript frontend comprises 296 components, 41 Zustand stores, and 60+ custom hooks.

The requirements in this section cover six functional categories:

| Category | Prefix | Description |
|---|---|---|
| Core Chat & LLM | FR-D1xx | Multi-provider LLM routing, streaming, cost management |
| Agent & Automation | FR-D2xx | Autonomous agents, swarms, computer use, desktop automation |
| Tools & Integrations | FR-D3xx | MCP, email, calendar, cloud storage, databases, messaging |
| Memory & Intelligence | FR-D4xx | Embeddings, RAG, intent detection, research mode |
| UI & UX | FR-D5xx | Chat interface, settings, analytics, artifacts, canvas |
| Desktop-Specific | FR-D6xx | Voice, screen capture, scheduling, updates, hooks |

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

| Command | Purpose |
|---|---|
| `chat_send_message` | Stream message to LLM, handle tool calls, update cost |
| `chat_create_conversation` | Start new conversation, return conversation ID |
| `chat_get_conversations` | Paginated conversation list |
| `chat_get_messages` | Message history for a conversation |
| `chat_update_conversation` | Rename, pin, archive |
| `chat_delete_conversation` | Permanent deletion with cascade |
| `chat_stop_generation` | Cancel active stream |
| `chat_handle_stop` | Cleanup after stop |
| `chat_detect_intent` | Classify user intent |
| `chat_save_decision` | Persist user decision to memory |
| `chat_get_cost_analytics` | Per-conversation cost breakdown |
| `chat_get_cost_overview` | Aggregate spend dashboard |
| `chat_compact_context` | Summarize + truncate context window |

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

| Executor | Domain |
|---|---|
| `api` | REST/GraphQL API calls |
| `browser` | Browser navigation and DOM |
| `calendar` | Calendar CRUD |
| `cloud` | Cloud storage operations |
| `code` | Code generation and execution |
| `database` | SQL/NoSQL queries |
| `email` | Send/receive email |
| `file` | Filesystem read/write |
| `git` | Version control operations |
| `llm` | Nested LLM sub-calls |
| `mcp` | MCP tool invocation |
| `media` | Image/video/audio generation |
| `ocr` | Screen text extraction |
| `outcome` | Goal success evaluation |
| `productivity` | Notion/Trello/Asana tasks |
| `search` | Web and local search |
| `terminal` | Shell command execution |
| `ui` | Desktop UI interaction |

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

| Command | Purpose |
|---|---|
| `agi_submit_goal` | Single-agent goal execution |
| `agi_submit_goal_auto` | Auto-select execution mode |
| `agi_submit_goal_parallel` | Force parallel execution |
| `agi_submit_goal_swarm` | Force swarm execution |
| `agi_get_goal_status` | Poll goal state |
| `agi_list_goals` | All goals with status |
| `agi_cancel_goal` / `agi_abort_task` | Interrupt execution |
| `agi_pause_task` / `agi_resume_task` | Suspend and continue |
| `agi_get_sub_goals` | Inspect decomposed subtasks |
| `agi_get_reflection_insights` | Failure analysis results |
| `agi_get_failure_patterns` | Aggregated failure stats |
| `agi_get_suggestions` | AI-generated next actions |
| `agi_should_use_swarm` | Complexity heuristic |
| `agi_extend_timeout` | Increase wall-clock limit |
| `agi_get_timeout_status` | Current timeout state |
| `agi_get_recommendations` | Routing recommendations |

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

| Integration | Status | Notes |
|---|---|---|
| Gmail | Partial | Implemented; requires OAuth setup |
| Google Calendar | Partial | Implemented; requires OAuth setup |
| Vercel | Implemented | Connected via MCP |
| n8n | Implemented | Connected via MCP |
| Google Drive | Partial | Code exists; OAuth needed |
| Notion | Blocked | No native implementation |
| Trello | Blocked | No native implementation |
| Asana | Blocked | No native implementation |

### 3.3.2 Email

**FR-D306**: **Email Client**
- **Description**: IMAP (read) and SMTP (send) clients with OAuth 2.0 for Gmail. `gmail_pubsub.rs` enables push notifications for new mail without polling.
- **Priority**: P1
- **Status**: Partial (OAuth setup required)
- **Components**: `features/communications/`

| Command | Purpose |
|---|---|
| `email_connect` | Authenticate and add account |
| `email_list_accounts` | Enumerate connected accounts |
| `email_list_folders` | IMAP folder tree |
| `email_list_emails` | Paginated email list |
| `email_get_email` | Full email with attachments |
| `email_send` | Send via SMTP |
| `email_search` | Full-text search across folders |
| `email_remove_account` | Revoke and disconnect |

### 3.3.3 Calendar

**FR-D307**: **Calendar Integration**
- **Description**: Google Calendar OAuth client with full CRUD. Outlook calendar client. Timezone normalization layer.
- **Priority**: P1
- **Status**: Partial (OAuth setup required)
- **Components**: `features/calendar/`

| Command | Purpose |
|---|---|
| `calendar_connect` | Start OAuth flow |
| `calendar_complete_oauth` | Exchange code for tokens |
| `calendar_disconnect` | Revoke and remove |
| `calendar_list_accounts` | All connected accounts |
| `calendar_list_events` | Date-range event query |
| `calendar_create_event` | New event with attendees |
| `calendar_update_event` | Modify existing event |
| `calendar_delete_event` | Delete event |

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

| Command | Purpose |
|---|---|
| `chat_configure_memory_injection` | Control what memories are injected |
| `chat_recall_memory` | Retrieve relevant memories for a message |
| `chat_search_memories` | Keyword/semantic search over memory store |
| `chat_load_project_memories` | Load workspace-scoped memories |
| `chat_prefetch_session_memories` | Pre-load at session start |
| `chat_suggest_memories_for_review` | Surface stale or conflicting memories |
| `chat_get_memory_dashboard` | Aggregate memory stats |
| `chat_set_monthly_budget` | Cap spend attributed to memory ops |

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

| Tab | Key Settings |
|---|---|
| Custom Models | Add Ollama/OpenRouter/Groq/any OpenAI-compatible endpoint, test connection |
| Agents | Approval mode, sub-agent toggle, execution preferences, trusted workflows |
| Instruction Files | Auto-discover and merge CLAUDE.md, AGENTS.md, .cursorrules, GEMINI.md |
| Extensions | MCP server management, transport config, enable/disable |
| Skills & Plugins | Installed skills, project resources, plugin registry |
| Features & Privacy | Feature flags, telemetry consent, analytics opt-out |
| Data & Privacy | Memory export/delete, conversation history, local data controls |
| Window | Theme, font size, always-on-top, sidebar layout |
| System | Updater, dev tools, cache management, diagnostic logs |

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

| Command Group | Commands |
|---|---|
| Event tracking | `track_event`, `get_usage_stats`, `get_feature_usage`, `flush_events` |
| Tool metrics | `get_tool_metrics`, `get_process_metrics` |
| ROI | `calculate_roi`, `get_cost_saved_trend`, `get_time_saved_trend` |
| Reporting | `generate_weekly_report`, `generate_monthly_report`, `export_report` |
| Data mgmt | `save_snapshot`, `delete_all_data`, `get_session_id`, `set_user_property` |

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
- **Description**: `useAgenticEvents` (95K line central event hub) bridges Tauri event emissions to React state. Domain hooks: `useBrowserAutomation`, `useCalendar`, `useEmail`, `useGit`, `useMCP`, `useMemory`, `useVoiceInput`, `useVoiceTranscription`, `useOCR`, `useCloudStorage`, and 50+ others.
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
- **Description**: Subscription management, usage-based billing reconciliation, and App Store receipt validation. Scoped under the `billing` and `appstore` feature flags.
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

| Feature | Audit Status | Notes |
|---|---|---|
| Core chat & streaming | PASS | All providers streaming correctly |
| Model switching | PASS | All 11 providers switchable in-session |
| Extended thinking | PASS | Reasoning content displayed |
| Vision / OCR | PASS | Screenshot + Tesseract working |
| Creative generation | PASS | Image and video generation functional |
| File operations | PASS | Read/write/edit across formats |
| Git integration | PASS | Full git workflow via commands |
| Terminal | PASS | PTY-based with AI assist |
| Code generation | PASS | Diff-based apply/reject flow |
| Screenshot | PASS | Full, region, window capture |
| Voice (STT/TTS) | PASS | Local Whisper + Deepgram + Piper |
| Reminders & calendar | PASS | Create/update/delete events |
| Image generation | PASS | |
| Video generation | PASS | |
| Multi-agent swarm | PASS | 5 parallel agents + resume + checkpoints |
| Web search | PARTIAL | Working; depth controls in progress |
| Browser form filling | PARTIAL | Basic fills working; complex forms in progress |
| Google Calendar OAuth | PARTIAL | Code complete; OAuth credentials needed |
| Gmail OAuth | PARTIAL | Code complete; OAuth credentials needed |
| Cloud storage OAuth | PARTIAL | Code complete; OAuth credentials needed |
| Instruction file discovery | PARTIAL | Discovery working; merge pipeline in progress |
| Docker-dependent features | FAIL | Requires `docker compose up -d postgres` |
| Notion native integration | BLOCKED | No native client; MCP bridge needed |
| Trello native integration | BLOCKED | No native client; MCP bridge needed |
| Asana native integration | BLOCKED | No native client; MCP bridge needed |
| Some MCP connections | BLOCKED | Server config / auth varies by tool |

---

## 3.8 Command Count by Category

| Category | Command Count |
|---|---|
| Chat | 26 |
| AGI / Goal execution | 34 |
| Agent runtime | 8 |
| Background agent | 11 |
| Background task | 18 |
| Automation (basic) | 21 |
| Automation (enhanced) | 20 |
| Computer use | 11 |
| Checkpoint | 13 |
| Analytics | 29 |
| Artifacts | 22 |
| Canvas | 13 |
| Database | 40 |
| API operations | 15 |
| Email | 8 |
| Calendar | 8 |
| Cloud storage | 10 |
| Cache management | 22 |
| Chat memory | 11 |
| Screen capture | 8 |
| **Total** | **~1,069** |

---

*End of Section 3 — Desktop Application Feature Requirements*
