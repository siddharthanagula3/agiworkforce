# Desktop Product & Technical Specification

## 1. Mission

The desktop app should be the flagship AGI Workforce runtime. It is the primary local execution surface where conversation, tools, approvals, automation, connectors, memory, artifacts, and model orchestration come together.

If the user asks, “Where does AGI Workforce actually do the work?”, the default answer should be: desktop.

## 2. Users and jobs-to-be-done

### Primary users

- users who want a full local AI workstation
- professionals automating desktop and browser tasks
- users who need file, terminal, and computer-use capabilities
- users who want multi-step agent workflows with explicit control

### Jobs-to-be-done

- ask the system to perform real tasks, not just answer questions
- see what the agent is doing in real time
- approve or block sensitive actions
- connect local and remote tools in one place
- use multiple model providers and local models
- maintain durable projects, memory, and conversations

## 3. Scope and feature ownership

### Desktop owns

- privileged local execution
- local tool orchestration
- browser and computer-use integration
- durable local conversation and memory experience
- MCP and connector orchestration
- native windowing, tray, overlays, and local settings
- the richest agentic chat UX in the product

### Desktop does not own

- public marketing and acquisition
- billing-first lifecycle UX
- mobile-first interaction patterns
- IDE-native coding UX

## 4. Feature set

### Core chat and agent features

- unified agentic chat
- streaming answers and reasoning
- approval cards and tool timelines
- branching, compacting, export, and share flows
- quick query and command palette
- background tasks and agent status monitoring

### Local execution features

- filesystem access
- terminal execution
- browser automation
- computer use and screen capture
- document generation and file creation
- search, research, and workflow execution

### Model and LM features

- multi-provider model routing
- local model support
- provider fallback
- embeddings and semantic retrieval
- tool-aware agent loops
- model capability detection

### Connector and ecosystem features

- MCP servers and connector management
- native messaging bridge for the browser extension
- optional local bridge endpoints for companion surfaces
- mobile companion integration
- calendar, communications, productivity, and cloud integrations

### Product surface features

- onboarding
- settings and permissions management
- offline and degraded-state handling
- analytics, billing usage, and subscription state
- updater and desktop-native lifecycle management

## 4A. Competitive benchmark lens

These requirements should be informed by all major desktop AI competitors as of March 2026. AGI Workforce must beat or match every pattern listed here.

### Claude Desktop / Cowork

- Cowork launched on Windows (February 10, 2026) and brings Claude Code-style agentic capability into a visual desktop workflow. AGI desktop should offer the strongest visual agent handoff experience in the product.
- Anthropic launched a plugin marketplace with admin controls for curated extensions, code signing, encrypted storage, and enterprise governance. AGI desktop should treat local extensions and connectors as first-class product infrastructure with equivalent admin controls.
- Task scheduling lets Claude run recurring or deferred work. AGI desktop should own scheduled execution with richer trigger options.
- Dispatch (March 17, 2026) introduced QR phone-to-desktop pairing with persistent cross-device threads. This is a direct threat to our mobile companion differentiator. AGI desktop must ship cross-device orchestration with deeper capabilities than Dispatch.
- Claude in Chrome beta brings browser automation, workflow recording, and scheduled browser tasks. AGI desktop should match this and extend it with multi-browser and headless support.
- Claude for Office integrates with Excel and PowerPoint using shared context and skills. AGI desktop should support Office and Google Workspace document manipulation.
- Opus 4.6 and Sonnet 4.6 now ship with 1M context. AGI desktop should leverage extended context across all supported providers and make context management a visible user feature.
- Anthropic’s computer use design keeps Claude separated from the environment through an application-owned agent loop. AGI desktop should keep the model separate from direct system control and route actions through explicit tool/runtime layers.

Applicable official references:

- Installing Claude Desktop: `https://support.claude.com/en/articles/10065433-installing-claude-desktop`
- Computer use tool: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`
- Claude can now create and edit files: `https://claude.com/blog/create-files`
- Claude apps release notes: `https://support.claude.com/en/articles/12138966-release-notes`
- Claude Dispatch: `https://claude.com/blog/dispatch`
- Claude in Chrome: `https://chrome.google.com/webstore/detail/claude`

### ChatGPT Desktop + Atlas

- ChatGPT Agent merges the former Operator product into the main desktop app, combining web browsing, form filling, and file editing into a single agent surface. AGI desktop should unify its agent capabilities similarly rather than fragmenting them across separate modes.
- Atlas Browser is an AI-native Chromium browser with a sidebar, Browser Memory, Agent Mode, and multi-account support. AGI desktop should match integrated browser intelligence without requiring a separate browser product.
- Codex App ships on Mac and Windows with parallel agents running in isolated worktrees. AGI desktop should support parallel agent execution with workspace isolation.
- ChatGPT for Excel brings AI directly into spreadsheet workflows. AGI desktop should support spreadsheet and document manipulation as first-class tool categories.
- GPT-5.4 ships with native computer use scoring 75% on OSWorld benchmarks. AGI desktop should target equivalent or better computer use performance through multi-model routing.
- 256K context is available in Thinking mode. AGI desktop should expose extended context across all providers that support it.
- The Apps ecosystem integrates DoorDash, Spotify, Uber, Zillow, Wix, and other consumer services with required confirmation for external actions. AGI desktop should expose the same clarity between context retrieval, research, and external actions.

Applicable official references:

- ChatGPT on desktop: `https://chatgpt.com/features/desktop`
- Apps in ChatGPT: `https://help.openai.com/en/articles/11487775-connectors-in-chatgpt`
- Tasks in ChatGPT: `https://help.openai.com/en/articles/10291617`
- OpenAI Codex: `https://openai.com/index/introducing-codex`
- Atlas Browser: `https://openai.com/atlas`

### Cursor

- Cursor reached $2B ARR, validating the market for AI-native desktop tools at scale. AGI desktop must compete on product quality at this level.
- Automations introduce always-on event-triggered agents responding to Slack, Linear, GitHub, PagerDuty, cron, and webhooks. AGI desktop should ship equivalent event-driven agent infrastructure.
- Cloud Agents with Computer Use run in isolated VMs and produce merge-ready PRs. AGI desktop should support cloud-delegated agent execution for heavy workloads.
- Bugbot Autofix processes 2M+ PRs per month with 76% resolution rate. AGI desktop should target equivalent automated fix capabilities for coding workflows.
- MCP Apps render interactive UIs in chat (charts, dashboards, forms). AGI desktop should support rich in-chat UI rendering from MCP tools.
- Plugin Marketplace and Composer 1.5 proprietary model show the value of a curated ecosystem. AGI desktop should build marketplace infrastructure.
- Background Agents and Security Automations run without user presence. AGI desktop should support autonomous background execution with safety controls.
- JetBrains integration via ACP (Agent Client Protocol) extends beyond VS Code. AGI desktop should support IDE integration through standard protocols.

Applicable official references:

- Cursor Automations: `https://www.cursor.com/blog/automations`
- Cursor Background Agents: `https://www.cursor.com/blog/background-agents`
- Cursor MCP Apps: `https://docs.cursor.com/chat/mcp`

### Perplexity Computer

- Perplexity orchestrates 19-20 AI models across tasks, the broadest model routing in the market. AGI desktop already supports 9+ providers and should push toward equivalent breadth.
- Cloud + Personal Computer (Mac mini) provides 24/7 local access with persistent agent state. AGI desktop should support always-on local agent execution.
- Model Council runs 3 models simultaneously on the same query for consensus answers. AGI desktop should support multi-model consensus as a routing strategy.
- Custom Skills let users define reusable agent capabilities. AGI desktop already has 150+ skills and should make them user-extensible.
- Voice Mode and Comet Browser (desktop + iOS) extend the interaction surface. AGI desktop should match voice and browser integration quality.
- $20B valuation validates the AI desktop agent market. AGI desktop should compete on capability, not just price.

Applicable official references:

- Perplexity Computer: `https://www.perplexity.ai/hub/blog/introducing-computer`
- Perplexity Comet: `https://www.perplexity.ai/hub/blog/comet`

### Manus “My Computer” (Meta)

- Manus launched “My Computer” desktop agent on March 16-18, 2026, providing local file and app control powered by Claude with 29 tools. This is a direct competitor to AGI desktop’s core value proposition.
- Meta acquired Manus for approximately $2B, signaling major investment in desktop AI agents. AGI desktop must differentiate on multi-model routing, extensibility, and user control.
- Manus focuses on ease of use and consumer-friendly agent UX. AGI desktop should match this simplicity while offering power-user depth.

Applicable official references:

- Manus AI: `https://manus.im`

### Gemini

- Google has NO standalone Gemini desktop app, which remains AGI desktop’s key structural advantage in the local execution market.
- Google Labs ships a desktop launcher (Alt+Space) for quick invocation. AGI desktop should match global hotkey invocation quality.
- Gemini in Chrome side panel provides browser-integrated AI. AGI desktop should offer deeper browser integration through its extension and native automation.
- Jules coding agent handles autonomous coding tasks. AGI desktop should match Jules capabilities through its agent framework.

Applicable official references:

- Gemini: `https://gemini.google.com`
- Google AI Studio: `https://aistudio.google.com`

## 5. End-to-end flows

### Flow A: user asks desktop to complete a task

1. User enters a request in unified chat.
2. Frontend creates or resumes a conversation in chat state.
3. Backend resolves model, context, tools, and permissions.
4. LM begins streaming content and tool intents.
5. Frontend renders reasoning, tool timeline, pending approvals, and intermediate artifacts.
6. Approved tools execute through Rust command/runtime domains.
7. Results stream back through events into the chat UI.
8. Final answer, artifacts, cost, and history persist locally.

### Flow B: desktop executes privileged local work

1. User request requires filesystem, terminal, or automation access.
2. Tool intent is classified and checked against safety policy.
3. Sensitive actions require explicit approval.
4. Approved action executes in the relevant runtime domain.
5. Output is sanitized, summarized, and streamed back to the UI.
6. Undo, checkpoints, or artifacts remain visible to the user.

### Flow C: desktop coordinates with another surface

1. Browser extension, mobile, or VS Code sends a request or event.
2. Desktop bridge/native messaging/local API receives the request.
3. Desktop becomes the execution authority for privileged work.
4. Execution progress is emitted back to the caller and to local UI.
5. State persists centrally in the desktop runtime where appropriate.

## 6. UI, look, and layout

### Visual model

Desktop should look like a focused native workspace, not a set of disconnected mini-tools.

The visual system should emphasize:

- one primary task area
- visible execution state
- reversible actions
- low-noise high-density information display
- trustworthy system status

### Layout model

The desktop layout should center around the agent workspace:

1. primary shell window
2. top-level command palette and quick actions
3. central unified chat and task area
4. inline approvals, thinking, tool traces, artifacts, and sidecars
5. secondary overlays for voice, settings, onboarding, permissions, and floating tools

The main window should not fragment core task execution across too many isolated pages. Chat, tool results, approvals, and artifacts should feel like one coherent runtime.

### Look and feel rules

- native-feeling dark/light theming
- low-chrome, high-signal surfaces
- clear status banners for degraded, offline, or permission-constrained states
- consistent spacing and typography across chat, cards, settings, and sidecars
- strong inline feedback during long-running work

## 7. UI components

### Primary UI systems

- unified chat
- command palette
- quick query
- voice input overlay
- timeout and approval dialogs
- settings panel
- onboarding flow
- update checker and status banners
- offline indicator

### Major component families already visible in the codebase

- `UnifiedAgenticChat`
- `Terminal`
- `Browser`
- `ComputerUse`
- `Connectors`
- `Memory` and `MemoryPanel`
- `Documents` and `Document`
- `Media`
- `Workflows`
- `Teams`
- `Settings`
- `Onboarding`
- `Artifacts`
- `Execution` and `ExecutionSidecar`

### Component rules

- all components should surface actionable state, not just raw data
- approval UI must be inline, obvious, and low-friction
- artifacts should render inside the workflow, not as detached afterthoughts
- tool outputs should be grouped by task and message ownership
- settings should be separated into user preferences vs permission-sensitive controls

## 8. Frontend architecture

### Runtime

- React + TypeScript in the Tauri webview
- Zustand for application state
- event-driven updates from the Rust backend

### Frontend responsibilities

- render unified chat and feature surfaces
- manage local UI state and derived views
- invoke backend commands
- subscribe to stream and tool events
- coordinate settings, overlays, and shell behavior

### Frontend structure

Key frontend domains visible in the codebase:

- `apps/desktop/src/components`
- `apps/desktop/src/stores`
- `apps/desktop/src/services`
- `apps/desktop/src/hooks`
- `apps/desktop/src/api`

### State model

The frontend should keep domain state separated by responsibility:

- chat state
- tool and execution state
- settings and UI shell state
- auth and subscription state
- connector and automation state
- feature-specific stores for memory, projects, workflows, vision, voice, and scheduling

## 9. Backend/runtime architecture

### Runtime

The desktop backend is the Rust/Tauri runtime. It is the authority for privileged work.

### Backend responsibilities

- command registration and dispatch
- model orchestration
- safety and security enforcement
- local persistence
- automation runtimes
- integrations and sync
- artifact and workflow execution

### Major backend domains

- `core/llm`
- `core/agent`
- `core/mcp`
- `core/embeddings`
- `core/research`
- `core/scheduler`
- `automation/*`
- `features/*`
- `data/*`
- `integrations/*`
- `sys/commands`
- `sys/security`

### Persistence model

- local application data directory
- encrypted database storage
- settings and cache layers
- project, memory, and workflow persistence

## 10. LM architecture

### Model ownership

Desktop should be the strongest model-orchestration surface in the product.

### Model behavior

- support multiple hosted providers
- support local models
- normalize model ids and provider capabilities
- choose tools based on provider capability
- track cost, latency, and usage
- support fallback and degraded behavior

### Context behavior

- assemble prompt context from conversation, project, memory, tools, and attachments
- support compaction and summarization
- use embeddings or semantic retrieval where helpful
- preserve message ownership so streamed events attach correctly in UI

### Streaming behavior

- parse provider-specific SSE/event formats into a unified event model
- expose reasoning, tool calls, approvals, and final answer chunks separately
- keep frontend rendering incremental and recoverable

## 11. API architecture

### Internal API

The primary desktop API is the Tauri command/event boundary:

- frontend invokes registered commands
- backend emits event streams and state changes

### External API

Desktop also needs controlled network boundaries to:

- hosted provider APIs
- Supabase/auth services
- Stripe/subscription services where needed
- external connectors and MCP transports
- local bridge endpoints for companion surfaces

### API rules

- all privileged work must cross an explicit boundary
- command names and payloads should be stable and typed
- local bridge APIs should be narrow, observable, and allowlisted

## 12. Tool architecture

### Tool categories

Desktop tools should be organized into clear domains:

- filesystem tools
- terminal tools
- browser tools
- computer-use tools
- document and media tools
- search and research tools
- connector and MCP tools
- productivity and communication tools

### Tool execution rules

- every tool call must have a clear owner and lifecycle
- sensitive tools must route through approval controls
- tool output must be sanitized before display or LM reuse
- tools must degrade gracefully when dependencies are unavailable

### Tool UX rules

- show tool purpose before execution
- show progress and result inline
- make failures understandable
- preserve retry and undo opportunities where possible

## 13. Data, state, and sync

### Data model

Desktop should maintain durable state for:

- conversations and messages
- projects and memory
- settings and permissions
- connector configurations
- analytics and usage
- artifacts and workflow history

### Sync model

- desktop may sync selected state with hosted services
- desktop should remain useful in a degraded or partially offline state
- desktop should act as the central state source for local companion surfaces

## 14. Security and privacy

- database and sensitive local state should be encrypted
- provider keys and secrets should never live in plaintext
- prompt injection and dangerous command patterns should be detected
- approvals should be mandatory for high-risk actions
- tool outputs should be redacted where needed
- extension and bridge integrations must be allowlisted and scoped

## 15. Performance and reliability

- the app must remain responsive during long-running tasks
- event streams must survive partial failures
- degraded modes should exist for optional subsystems
- local persistence failures should fail safely
- startup should initialize critical systems first and defer non-critical work

## 16. Observability, testing, and release gates

### Observability

- backend tracing and telemetry
- frontend error reporting
- health and degraded-state visibility
- model and tool usage metrics

### Testing expectations

- frontend component and store tests
- backend runtime and security tests
- end-to-end tests for critical chat and tool flows
- validation of command registration vs frontend usage

### Release gates

- core chat flow passes
- approvals render and resolve correctly
- model routing works
- database initializes correctly
- bridge integrations do not break startup
- degraded-state handling works for optional services

## 17. Definition of done

Desktop is in the right state when:

- it is clearly the main execution surface in the product
- users can see and control what the agent is doing
- local tools and connectors are strong, safe, and reliable
- model orchestration is more capable here than anywhere else
- companion surfaces integrate with it instead of competing with it

## 18. Canonical implementation anchors

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
- `apps/desktop/src/stores/unifiedChatStore.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- `docs/DESKTOP_ARCHITECTURE.md`
- `docs/PROJECT_REFERENCE.md`

## 19. Screen inventory

### Primary shell screens

- onboarding and first-run flow
- auth surface
- unified chat shell
- settings and permission panels
- update and status surfaces

### Work surfaces already represented in the codebase

- terminal
- browser
- computer use
- connectors/MCP
- memory and memory panel
- documents and artifacts
- workflows
- teams
- voice
- screen capture
- media
- marketplace and skill marketplace

### Overlay and utility surfaces

- floating chat
- command palette
- quick query
- timeout warning dialog
- offline indicator
- status banners

## 20. Component and state inventory

### Core component families

- `UnifiedAgenticChat`
- `Execution` and `ExecutionSidecar`
- `Artifacts`
- `Terminal`
- `Browser`
- `ComputerUse`
- `Connectors`
- `Settings`
- `Onboarding`
- `Voice`
- `Workflows`

### Core store families

- chat and tool stores
- auth and account stores
- automation/browser/computer-use stores
- connector and MCP stores
- memory/project/workflow stores
- model/settings/security stores
- updater and UI shell stores

## 21. API and tool inventory

### Internal desktop API layers

- Tauri command invocations
- Tauri event streams
- local bridge endpoints
- native messaging integration

### Major tool classes

- filesystem tools
- terminal tools
- browser/computer-use tools
- document/media generation tools
- search/research tools
- connector/MCP tools
- productivity/communications tools

## 22. Phased roadmap

### Phase 1: agent automation platform

- event-triggered agents responding to external signals (Slack messages, Linear issues, GitHub events, PagerDuty alerts, cron schedules, webhooks)
- always-on background agents that execute without user presence, with checkpoint and resume
- plugin and skill marketplace with discovery, install, update, and review workflows
- MCP Apps rendering interactive UIs inside chat (charts, dashboards, forms via ui:// scheme)
- agent safety infrastructure: sandboxed execution environments, approval workflows, rollback capabilities

### Phase 2: cross-device orchestration

- Dispatch-like phone-to-desktop pairing via QR code with persistent cross-device threads
- remote agent control from web and mobile surfaces (start, monitor, approve, cancel)
- cloud agent delegation for heavy workloads (isolated VMs, merge-ready outputs)
- session continuity across desktop, web, mobile, and IDE surfaces
- shared project and memory state synchronized across all surfaces

### Phase 3: desktop computer use excellence

- native computer use targeting and exceeding 75% OSWorld benchmark (matching GPT-5.4)
- browser automation with workflow recording and scheduled replay
- multi-application coordination (screenshot analysis, click/type/scroll across apps)
- Office and productivity suite integration (Excel, PowerPoint, Google Workspace)
- voice mode with natural conversation, command, and dictation capabilities

### Phase 4: enterprise platform grade

- SOC 2 Type II certification for AI product security controls
- OWASP Top 10 for Agentic Applications compliance (ASI01-ASI10)
- EU AI Act general application readiness (August 2026 deadline)
- admin controls for team management, policy enforcement, and audit logging
- team analytics dashboards with usage, cost, and agent performance metrics
- on-premise and data sovereignty deployment options for regulated industries

## 23. Gap analysis

### Gaps vs Claude Cowork

- Dispatch (QR phone-to-desktop pairing with persistent cross-device threads) is a direct counter to our mobile companion differentiator. We need equivalent or deeper cross-device orchestration.
- Plugin marketplace with admin controls (code signing, enterprise governance) is more mature than our current connector management. We need marketplace infrastructure with discovery, ratings, and admin policy enforcement.
- Office integration (Excel, PowerPoint with shared context and skills) is not yet implemented. We need document manipulation tools for Office and Google Workspace.
- 1M context window with Opus 4.6 raises the bar on conversation depth. We should leverage extended context across all providers and surface context budget as a visible user feature.
- Task scheduling is more productized. We need richer trigger options and a clear task management surface.

### Gaps vs ChatGPT Desktop

- Atlas Browser (AI-native Chromium with sidebar, Browser Memory, Agent Mode, multi-account) is a dedicated browser product we cannot match directly. We should offer deeper browser integration through our extension and native automation layers.
- Apps ecosystem (DoorDash, Spotify, Uber, Zillow, Wix) provides consumer integrations we do not yet have. We need a connector ecosystem that covers productivity and consumer services.
- Computer use benchmarks (GPT-5.4 at 75% OSWorld) set a performance target we must match through multi-model routing and optimized tool execution.
- Codex parallel agents with isolated worktrees enable concurrent coding workflows. We need parallel agent execution with workspace isolation and conflict resolution.
- 256K context in Thinking mode is a capability we should expose through model routing when available.

### Gaps vs Cursor

- Automations (always-on event-triggered agents for Slack, Linear, GitHub, PagerDuty, cron, webhooks) represent an entirely new agent paradigm we have not shipped. This is our highest-priority competitive gap.
- Bugbot Autofix (2M+ PRs/month, 76% resolution) demonstrates production-grade automated coding at scale. We need equivalent automated fix capabilities.
- Cloud Agents running in isolated VMs with merge-ready outputs let users delegate heavy work. We need cloud agent delegation infrastructure.
- $2B ARR validates the market and sets quality expectations. We must compete at this product quality level across the board.
- MCP Apps rendering interactive UIs in chat are more advanced than our current tool result rendering. We need rich in-chat UI rendering.

### Gaps vs Perplexity

- Multi-model orchestration across 19-20 models is broader than our current 9+ providers. We should expand provider coverage and make model switching frictionless.
- Personal Computer (Mac mini with 24/7 local access) offers always-on agent persistence. We need always-on local agent execution with persistent state across restarts.
- Model Council (3 models simultaneously for consensus) is a routing strategy we do not yet support. We should implement multi-model consensus as an optional routing mode.
- Comet Browser on desktop and iOS extends the interaction surface. We should ensure our browser and mobile experiences are equally integrated.

### Gaps vs Manus

- Meta backing (~$2B acquisition) provides resources and distribution we must counter with product quality and community.
- Desktop agent UX is consumer-friendly and simple. We should match this simplicity for basic use cases while offering power-user depth.
- App control capabilities with 29 tools represent a focused, polished toolset. We should ensure our broader tool surface does not sacrifice quality for quantity.

## 24. Feature acceptance criteria

| Feature | Acceptance criteria |
| --- | --- |
| Unified agentic chat | User can create/open conversations, stream responses, see reasoning/tool states inline, and preserve coherent message ownership through the entire run. |
| Approval workflows | Sensitive tool actions render approval UI inline, capture approve/reject decisions, and update runtime state immediately and visibly. |
| Filesystem and terminal execution | User can request file and shell work, preview risky actions, see outputs inline, and recover from failures without losing conversation state. |
| Browser and computer use | Desktop can coordinate browser and computer-use actions through explicit tool/runtime layers, with safety checks and visible execution feedback. |
| Model routing | Provider selection, fallback, local-model support, and cost/usage accounting work consistently across chat and feature modules. |
| Connectors and MCP | User can connect, inspect, and use connectors/MCP servers from a clear management surface with degraded handling for unavailable integrations. |
| Projects and memory | User can maintain durable project context and memory, and that context improves task performance without becoming opaque. |
| Artifacts and file generation | Chat can produce meaningful artifacts/files, render them in-product, and export/share them where supported. |
| Settings and permissions | User can inspect preferences, feature flags, and automation permissions separately, and changes apply predictably. |
| Onboarding and degraded states | First-run UX brings the user into a functional runtime quickly; degraded/offline/subscription failures surface clearly without bricking the app. |
| Cross-surface bridges | Desktop can safely serve as the execution authority for extension/mobile/VS Code handoffs without exposing uncontrolled local power. |

## 25. Screen-by-screen implementation checklist

### Onboarding and auth

- first-run experience explains value, permissions, and next steps
- auth loading state does not dead-end
- onboarding completion is durable and reversible for testing/admin flows

### Main chat shell

- central conversation area streams smoothly
- command palette and quick query remain reachable
- status banners show degraded states without obscuring work
- offline and timeout states are actionable

### Approval and tool execution views

- approvals appear inline near the relevant message
- tool timelines remain grouped to the correct message/task
- result cards render success, partial success, and failure distinctly

### Settings and permissions

- preferences, automation permissions, model settings, and account settings are clearly separated
- dangerous controls require deliberate interaction
- settings changes persist and hydrate correctly on restart

### Connector and MCP surfaces

- user can list connected systems
- health and permission state are visible per connector
- failed connectors degrade the feature, not the whole shell

### Browser/computer-use/terminal surfaces

- each execution surface has a clear entry point
- live state is visible while work is in progress
- user can stop, review, or retry operations

### Artifacts/documents/media

- generated outputs render in a stable, readable way
- download/share/export actions are obvious
- large or failed artifacts degrade gracefully

## 26. Agent automation patterns

### Event-triggered agents

AGI desktop should support agents that activate in response to external signals, following the pattern established by Cursor Automations:

- Slack: trigger agents on specific messages, mentions, or channel events
- Linear: trigger agents on issue creation, status changes, or assignment
- GitHub: trigger agents on PRs, issues, CI failures, review requests, and pushes
- PagerDuty: trigger agents on incidents, escalations, and acknowledgments
- Cron: trigger agents on time-based schedules (recurring tasks, periodic checks)
- Webhooks: trigger agents on arbitrary HTTP events from any external system

Each trigger should specify the agent to invoke, the context to inject, the approval policy, and the output destination.

### Always-on vs request-response agents

- Request-response agents handle a single user request, execute, and return results. This is the current default mode.
- Always-on background agents persist across sessions, monitor triggers, and execute autonomously. They require checkpoint, suspend, resume, and graceful shutdown capabilities.
- Background agents should have configurable resource limits (token budgets, execution time, cost caps) and automatic pause when limits are reached.
- Agent status should be visible from all surfaces (desktop tray, web dashboard, mobile companion).

### Agent safety

- Sandboxed execution: agents should run in isolated environments with explicit filesystem, network, and system access grants. No ambient authority.
- Approval workflows: sensitive actions require user approval. Approval policies should be configurable per agent, per tool, and per trigger source.
- Checkpoint and rollback: agents should checkpoint state before destructive actions. Users should be able to roll back to any checkpoint.
- Kill switch: users should be able to terminate any agent immediately from any surface, with cleanup of in-progress work.
- Audit trail: every agent action should be logged with timestamp, tool, input, output, and approval decision for post-hoc review.

### Multi-agent coordination

- Team leads: a coordinator agent can decompose complex tasks and delegate subtasks to specialist agents.
- Parallel workers: multiple agents can execute independent subtasks concurrently with shared context.
- Conflict resolution: when agents produce conflicting outputs (file edits, state changes), the system should detect conflicts and present resolution options.
- Handoff protocols: agents should be able to transfer work to other agents with full context, partial results, and remaining task descriptions.

### Computer use

- Screenshot analysis: capture and interpret screen content to determine application state and available actions.
- Click, type, scroll: execute precise UI interactions on native applications and browser surfaces.
- Workflow recording: record user actions as replayable workflows that agents can execute autonomously.
- Workflow replay: execute recorded workflows with parameterization, error recovery, and adaptive waiting.
- Multi-application coordination: agents should be able to orchestrate work across multiple applications in a single task.

## 27. Protocol and ecosystem standards

### MCP Apps

MCP Apps render interactive UIs inside the chat surface, moving beyond static tool results:

- Charts and visualizations rendered from tool output data
- Dashboards with live-updating metrics from connected systems
- Forms for structured input collection during agent workflows
- Interactive tables for data exploration and selection
- UI rendering via a `ui://` scheme that tools can return as part of their output
- Security: UI content is sandboxed and cannot access host application state directly

### MCP spec 2025-11-25

The MCP specification dated 2025-11-25 introduces capabilities AGI desktop should adopt:

- Tasks: long-running operations with progress reporting and cancellation
- Elicitation: servers can request structured input from the user mid-execution
- Bundles: packaging multiple related tools, resources, and prompts for distribution
- OAuth overhaul: standardized authentication flow for MCP server connections
- Streamable HTTP transport: replacing SSE with a more robust streaming mechanism

### A2A (Agent-to-Agent) protocol

- A2A enables inter-agent communication across organizational boundaries
- Agents advertise capabilities through Agent Cards (JSON metadata)
- Task lifecycle management with streaming updates and artifact exchange
- AGI desktop should implement A2A for communication between its own agents and external agent systems
- Discovery: agents should be able to find and negotiate with other agents dynamically

### Plugin and skill marketplace ecosystem

- Discovery: searchable catalog of plugins and skills with categories, ratings, and usage metrics
- Distribution: install, update, and uninstall plugins through a managed lifecycle
- Trust: code signing, publisher verification, and security review for marketplace submissions
- Monetization: plugin authors should be able to distribute free and paid plugins
- Admin controls: enterprise administrators should be able to allowlist, blocklist, and audit plugin usage

### ACP (Agent Client Protocol) for IDE integration

- ACP standardizes communication between AI agents and IDE clients (VS Code, JetBrains, Neovim)
- AGI desktop should support ACP to act as an agent backend for any ACP-compatible IDE
- Capabilities include: code completion, inline editing, chat, terminal commands, and file operations
- ACP complements MCP by focusing on the IDE-to-agent boundary rather than the agent-to-tool boundary

## 28. Enterprise compliance and governance

### OWASP Top 10 for Agentic Applications 2026

AGI desktop must address the OWASP Agentic Security Initiative risks (ASI01-ASI10):

- ASI01 Agentic Identity and Access Misuse: enforce least-privilege agent identities with scoped credentials
- ASI02 Tool and Function Misuse: validate all tool calls against declared schemas and safety policies
- ASI03 Uncontrolled Agentic Behavior: implement guardrails, rate limits, and kill switches for autonomous agents
- ASI04 Insecure Agentic Communication: encrypt and authenticate all agent-to-agent and agent-to-tool communication
- ASI05 Inadequate Sandboxing: isolate agent execution environments with explicit resource and access grants
- ASI06 Over-Permissioned Agent: audit and minimize agent permissions; require justification for elevated access
- ASI07 Lack of Observability: log all agent actions, decisions, and tool calls for audit and debugging
- ASI08 Agent Goal Manipulation: detect and prevent prompt injection, goal hijacking, and instruction override
- ASI09 Insecure Output Handling: sanitize agent outputs before display, storage, or downstream consumption
- ASI10 Inadequate Human Oversight: maintain human-in-the-loop for high-risk actions with configurable approval policies

### EU AI Act general application (August 2026)

- AGI desktop must classify its AI systems under the EU AI Act risk categories
- General-purpose AI model obligations apply to model providers, but AGI desktop as a deployer must ensure transparency and documentation
- High-risk use cases (if applicable) require conformity assessments, risk management, and human oversight
- Users must be informed when they are interacting with an AI system
- Record-keeping and logging must meet EU AI Act requirements for traceability

### SOC 2 Type II requirements

- Trust service criteria: security, availability, processing integrity, confidentiality, and privacy
- Continuous monitoring of controls over a minimum 6-month observation period
- Access controls, encryption at rest and in transit, incident response procedures
- Vendor management for third-party model providers and cloud services
- Annual audit and certification renewal

### AI governance tools landscape

- Airia: agent orchestration and governance for enterprise deployments
- Kore.ai: conversational AI governance with compliance controls
- OpenAI Frontier: safety and alignment monitoring for frontier models
- AGI desktop should integrate with or provide equivalent governance capabilities for enterprise customers
- Policy engine: configurable rules for agent behavior, data access, and output restrictions

### Data sovereignty and on-premise deployment

- AGI desktop should support fully on-premise deployment with no external data transmission
- Local model support (Ollama, LM Studio) enables air-gapped operation for sensitive environments
- Data residency controls should let enterprises specify where conversation and memory data is stored
- Encryption keys should be customer-managed for maximum control
- Deployment options: desktop-only (current), desktop + hosted services, fully on-premise with local model backends
