# Specification: Project Vision Exploration

Generated: 2026-02-25T22:55:39Z

## Task Overview

Seven parallel agents will explore the AGI Workforce codebase to build a comprehensive understanding of the product's vision, architecture, features, and roadmap. Each agent is READ-ONLY and focuses on one major domain. Their combined output will be compiled into a unified "Project Vision" document.

## Global Context

AGI Workforce is a monorepo (`/Users/siddhartha/Desktop/agiworkforce`) containing:

- **Desktop app** (`apps/desktop`): Tauri 2.x + React 19 + Vite 7 + Rust backend -- the primary product (version 1.1.3)
- **Web app** (`apps/web`): Next.js 16 with Supabase auth, Stripe payments, Upstash Redis rate limiting
- **Browser extension** (`apps/extension`): Chrome extension with native messaging, side panel, job auto-fill
- **API Gateway** (`services/api-gateway`): Express + WebSocket service
- **Signaling Server** (`services/signaling-server`): WebRTC signaling for real-time collaboration
- **Shared packages** (`packages/types`, `packages/utils`): Cross-app TypeScript types and utilities

The product vision is to become the number-one AI desktop assistant, surpassing Claude Desktop, ChatGPT Desktop, and Gemini by combining a native desktop app with browser automation, multi-agent orchestration, enterprise security, and a web companion.

### Key Vision Documents (All Agents Should Skim)

These files provide high-level context. Each agent should reference them for product vision but focus exploration time on their assigned scope.

- `/Users/siddhartha/Desktop/agiworkforce/CLAUDE.md` -- comprehensive project architecture reference
- `/Users/siddhartha/Desktop/agiworkforce/AGENTS.md` -- repository guidelines
- `/Users/siddhartha/Desktop/agiworkforce/GEMINI.md` -- project overview, structure, tech stack
- `/Users/siddhartha/Desktop/agiworkforce/TODO.md` -- open work items and roadmap
- `/Users/siddhartha/Desktop/agiworkforce/FIXME.md` -- critical blockers and their resolution status
- `/Users/siddhartha/Desktop/agiworkforce/TOOLCHAIN_BLOCKERS.md` -- user-facing bug fixes
- `/Users/siddhartha/Desktop/agiworkforce/docs/stabilization.md` -- subsystem health matrix
- `/Users/siddhartha/Desktop/agiworkforce/CODERABBIT_REVIEW.md` -- security audit findings (68 issues)

---

## Team Composition

| Agent | Domain | Primary Question |
|-------|--------|-----------------|
| Agent 1 | Desktop UI and User Experience | What is the user-facing experience? What can users see, click, and interact with? |
| Agent 2 | AI Agent Core -- Planner, Executor, LLM Routing | How does the AI agent think, plan, execute, and recover? |
| Agent 3 | Automation and Computer Use | What can the AI agent DO on the user's computer? |
| Agent 4 | Productivity and Collaboration Features | What calendar, email, team, workflow, and project capabilities exist? |
| Agent 5 | MCP, Extensions, and Developer Ecosystem | How is the platform extensible? What developer tools exist? |
| Agent 6 | Web App, API Gateway, and Services | What does the web presence and backend infrastructure provide? |
| Agent 7 | Security, Data, Infrastructure, and CI/CD | How is data secured, persisted, built, and deployed? |

---

## Agent Assignments

---

### Agent 1: Desktop UI and User Experience

**Domain**: The entire React frontend of the desktop app -- the chat interface, components, stores, hooks, and layout that define what users see and interact with.

**Allowed Files (read-only):**

Primary (the main chat interface -- prioritize these):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx` (110K, main orchestrator)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatMessageList.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/CommandPalette.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/MediaLab.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/QuickModelSelector.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/CheckpointManager.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/DeepResearchPanel.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ProjectsView.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/VoiceInputButton.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx`
- All subdirectories of UnifiedAgenticChat: `InlineToolResults/`, `InlinePanels/`, `MessageBubble/`, `Cards/`, `Sidecar/`, `Widgets/`, `Visualizations/`, `hooks/`, `artifact-components/`

Secondary (all other UI components -- survey breadth):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/` -- ALL subdirectories EXCEPT `UnifiedAgenticChat/`:
  - `Agent/`, `AGI/`, `Analytics/`, `Auth/`, `Automation/`, `BackgroundTasks/`, `Beta/`, `Browser/`, `Calendar/`, `Canvas/`, `Cloud/`, `Code/`, `Communications/`, `CustomInstructions/`, `Database/`, `Document/`, `editing/`, `Editor/`, `Execution/`, `Feedback/`, `Filesystem/`, `FileUpload/`, `FloatingChat/`, `Git/`, `Governance/`, `Help/`, `KnowledgeBaseViewer/`, `Layout/`, `Marketplace/`, `MCP/`, `Media/`, `Memory/`, `MemoryPanel/`, `Messaging/`, `Migration/`, `Mobile/`, `Notifications/`, `Onboarding/`, `Outcomes/`, `Overlay/`, `Productivity/`, `QuickQuery/`, `Realtime/`, `Reminders/`, `Research/`, `ResourceMonitor/`, `ROIDashboard/`, `Scheduler/`, `ScreenCapture/`, `SearchResultsRenderer/`, `Settings/`, `SimpleMode/`, `Subscription/`, `Teams/`, `templates/`, `Terminal/`, `ToolCalling/`, `Tutorials/`, `ui/`, `Updates/`, `Vision/`, `Voice/`, `Workflows/`
  - `ErrorBoundary.tsx`, `StatusBanner.tsx`

State and hooks:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/` -- ALL store files (43 files)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/hooks/` -- ALL hooks (43 files)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/App.tsx` (23K -- root app component)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/main.tsx`

**Current State:**
- 74 component directories plus standalone component files
- 43 Zustand stores covering chat, auth, billing, automation, browser, calendar, code, database, email, filesystem, governance, MCP, media generation, memory, models, productivity, projects, research, scheduler, settings, teams, terminal, and more
- 43 React hooks covering agentic events, browser automation, calendar, checkpoints, cloud storage, email, file operations, git, keyboard shortcuts, LSP, MCP, memory, notifications, OCR, scheduler, screen capture, slash commands, teams, terminal, TTS, updater, voice input, voice transcription, window manager, workflows

**Primary Question**: What is the full user-facing experience of the AGI Workforce desktop app? What can users see, do, and interact with from the chat interface, sidebar, sidecar panels, command palette, and specialized component panels?

**Key Aspects to Document:**
- The main chat layout (sidebar, main area, sidecar) and navigation model
- All user-facing capabilities accessible from the chat (voice input, file upload, slash commands, model selection, media lab, checkpoints, deep research, projects)
- How tool execution results appear inline (InlineToolResults)
- Artifact rendering (code, documents, visualizations, media)
- The command palette and keyboard shortcuts
- The breadth of specialized UI panels (70+ component directories representing unique features)
- State management architecture (modular chat stores vs. domain-specific stores)
- How the hook layer bridges the React frontend to the Rust backend via `useAgenticEvents`

**DO NOT TOUCH:**
- Any Rust backend files (those belong to Agents 2, 3, 4, 5, 7)
- Any web app or extension files (those belong to Agents 5 and 6)

---

### Agent 2: AI Agent Core -- Planner, Executor, LLM Routing

**Domain**: The Rust AI engine -- the agent runtime (planner, executor, autonomous agent), the LLM routing layer (retries, fallbacks, cost tracking, streaming), provider adapters, and the AGI orchestration layer.

**Allowed Files (read-only):**

Agent runtime (`core/agent/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/planner.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/executor.rs` (21K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/autonomous.rs` (35K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/runtime.rs` (42K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_agent.rs` (52K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/continuous_executor.rs` (60K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/ai_orchestrator.rs` (14K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/approval.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/context_manager.rs` (14K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/context_compactor.rs` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/undo_manager.rs` (31K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/code_generator.rs` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/prompt_engineer.rs` (20K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/rag_system.rs` (8K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/vision.rs` (6K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/timeout_manager.rs` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/background_tasks.rs` (16K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/change_tracker.rs` (18K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/intelligent_file_access.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/form_undo.rs` (22K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agent/mod.rs` (8K)

LLM routing layer (`core/llm/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/llm_router.rs` (94K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/fallback_chain.rs` (43K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/sse_parser.rs` (44K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` (22K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/token_counter.rs` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/cache_manager.rs` (11K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/conversation_state.rs` (27K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/memory_integration.rs` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/thinking.rs` (15K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/prompt_policy.rs` (2K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/background_manager.rs` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/mod.rs` (23K)

Provider adapters:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (81K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` (34K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` (17K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/http_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/http_client_factory.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/mod.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/server_tools.rs` (11K)

AGI orchestration (`core/agi/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/orchestrator.rs` (24K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/core.rs` (54K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/planner.rs` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executor.rs` (37K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/memory_manager.rs` (75K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/memory_persistence.rs` (49K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/reflection.rs` (42K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/process_reasoning.rs` (28K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/process_ontology.rs` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/project_memory.rs` (27K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/checkpoint_manager.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/checkpoint_store.rs` (21K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/checkpoint.rs` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/sandbox.rs` (35K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/knowledge.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/learning.rs` (8K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/semantic_search.rs` (19K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs` (17K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/outcome_tracker.rs` (19K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/resources.rs` (5K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/mod.rs` (8K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/memory.rs` (2K)

Swarm multi-agent system (`core/swarm/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/orchestrator.rs` (25K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/agent_spawner.rs` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/task_decomposer.rs` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/result_aggregator.rs` (18K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/swarm/mod.rs`

Research system (`core/research/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/orchestrator.rs` (37K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/agents.rs` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/citation.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/report.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/types.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/web_search_config.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/research/mod.rs`

Frontend LLM constants (for cross-referencing):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/constants/llm.ts` (65K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/modelRouter.ts` (46K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/multiModalRouter.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/intentClassifier.ts` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/constants/pricing.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/constants/planModels.ts`

**Current State:**
- Agent runtime: TaskPlanner decomposes user requests into TaskStep arrays; TaskExecutor runs individual steps; AutonomousAgent orchestrates with self-healing (up to 3 retries); BackgroundAgent handles long-running tasks; ContinuousExecutor for multi-step agent loops
- LLM routing: Exponential backoff retry (3 retries, 500ms initial, 2x multiplier), fallback chains across providers, cost caps ($5/task, $50/session), circuit breaker for 5xx errors, SSE streaming
- Providers: ManagedCloudProvider covers Anthropic, OpenAI, Google, xAI, DeepSeek; OllamaProvider for local models; proxy and custom CA cert support
- AGI layer: Orchestrator coordinates complex tasks; checkpoint system for resumability; memory manager (75K) for long-term memory; reflection system for self-evaluation
- Swarm: Multi-agent parallel task execution with task decomposer, agent spawner, result aggregator, and circuit breaker
- Research: Multi-step research pipeline with specialized agents, citation tracking, report generation

**Primary Question**: How does the AI agent think, plan, execute, and recover from errors? What is the full lifecycle from user request to completed task? How does the multi-provider LLM routing ensure reliability? What makes the AGI orchestration layer more advanced than simple chatbot architectures?

**Key Aspects to Document:**
- The plan-execute-verify cycle and self-healing loop
- The approval system and 4 safety tiers
- LLM retry, fallback, and circuit breaker patterns
- Cost tracking and budget enforcement
- Multi-agent swarm parallel execution
- Deep research pipeline
- Memory persistence and reflection
- Checkpoint/resume for long-running tasks
- All supported LLM providers and models
- How the intent classifier routes to the best model

**DO NOT TOUCH:**
- Desktop UI components and stores (Agent 1)
- Desktop automation and computer use modules (Agent 3)
- Feature modules (calendar, email, terminal, teams, workflows) (Agent 4)
- MCP system (Agent 5)
- Web app and services (Agent 6)
- Security and data persistence modules (Agent 7)

---

### Agent 3: Automation and Computer Use

**Domain**: The desktop automation layer -- input control, screen capture, OCR, action recording, browser automation, computer use (observe-plan-act), and the tool executor that gives the AI agent its hands.

**Allowed Files (read-only):**

Desktop automation (`automation/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/mod.rs` (7K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/executor.rs` (18K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/safety.rs` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/safety_patterns.rs` (17K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/recorder.rs` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/codegen.rs` (14K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/types.rs` (5K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/screen_watcher.rs` (11K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/vision_planner.rs` (11K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/inspector.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/os_lock.rs`

Input control (`automation/input/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/input/keyboard.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/input/mouse.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/input/clipboard.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/input/mod.rs`

Screen capture and OCR (`automation/screen/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/screen/capture.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/screen/ocr.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/screen/mod.rs`

Browser automation (`automation/browser/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/cdp_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/semantic.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/tab_manager.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/advanced.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/dom_operations.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/browser/mod.rs`

Computer use (`automation/computer_use/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/observe_plan_act.rs` (42K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/visual_reasoner.rs` (24K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/safety.rs` (25K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/session.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/types.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs` (25K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/zoom.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/computer_use/mod.rs`

macOS-specific automation:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/mac/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/automation/uia/` -- all files

Tool executor (the dispatch hub for all agent tool calls):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/tool_executor.rs` (348K -- the single largest file in the codebase)

AGI domain executors (`core/agi/executors/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/mod.rs` (17K -- dispatch/registry)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/file_executor.rs` (32K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/git_executor.rs` (99K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/browser_executor.rs` (36K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs` (39K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs` (43K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/api_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/calendar_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/cloud_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/database_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/email_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/llm_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/mcp_executor.rs` (34K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/ocr_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/productivity_executor.rs` (32K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs` (35K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/outcome_executor.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/ui_executor.rs`

Relevant command handlers:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/automation.rs` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/automation_enhanced.rs` (8K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/computer_use.rs` (16K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/browser.rs` (37K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/capture.rs` (24K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/vision.rs`

**Current State:**
- The tool_executor.rs at 348K is the single largest file -- it dispatches ALL tool calls from the LLM to the appropriate Rust executor
- 18+ domain executors cover file operations, git (99K -- extremely comprehensive), browser automation, terminal, code editing, API calls, calendar, cloud, database, email, media, OCR, MCP, and more
- Computer use has a full observe-plan-act loop with visual reasoning, window management, and dedicated safety controls
- Browser automation uses three strategies: CDP (Chrome DevTools Protocol), Playwright bridge, and extension bridge (native messaging)
- Action recording can capture user interactions and generate automation scripts via codegen

**Primary Question**: What can the AI agent actually DO on the user's computer? What is the full catalog of executable tools and automation capabilities? How does the observe-plan-act computer use system work? What safety mechanisms prevent harmful automation?

**Key Aspects to Document:**
- The tool executor dispatch system (348K file -- what tools exist and how they are routed)
- All 18+ domain executors and their capabilities
- Input automation (keyboard, mouse, clipboard)
- Screen capture, OCR, and screen watching
- Browser automation via CDP, Playwright, and extension bridge
- Computer use observe-plan-act loop and visual reasoning
- Action recording and codegen
- Safety systems (what patterns are blocked, what requires approval)
- Comparison to competitors: what can AGI Workforce automate that others cannot?

**DO NOT TOUCH:**
- Agent runtime planning/reasoning (Agent 2)
- LLM routing layer (Agent 2)
- Feature modules like calendar, email content (Agent 4 handles the feature Rust code)
- MCP system (Agent 5)
- Web and services (Agent 6)
- Security and data layers (Agent 7)

---

### Agent 4: Productivity and Collaboration Features

**Domain**: The Rust feature modules for calendar, email/communications, speech/voice, terminal, tasks, teams, workflows, document management, projects, and the scheduling/orchestration engine.

**Allowed Files (read-only):**

Calendar (`features/calendar/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/calendar/` -- all files: `mod.rs`, `google_calendar.rs`, `outlook_calendar.rs`, `event_types.rs`, `timezone.rs`

Communications and email (`features/communications/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/communications/` -- all files: `mod.rs`, `contacts.rs`, `email_parser.rs`, `gmail_oauth.rs`, `gmail_pubsub.rs`, `imap_client.rs`, `smtp_client.rs`

Speech and voice (`features/speech/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/speech/` -- all files: `mod.rs`, `deepgram.rs`, `local_stt.rs`, `local_tts.rs`, `tts.rs`, `barge_in.rs`, `ptt.rs`, `recognition.rs`, `vad.rs`, `wake.rs`

Terminal (`features/terminal/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/terminal/` -- all files: `mod.rs`, `ai_assistant.rs`, `pty.rs`, `session_manager.rs`, `shells.rs`, `tests.rs`

Tasks (`features/tasks/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/tasks/` -- all files: `mod.rs`, `executor.rs`, `persistence.rs`, `queue.rs`, `types.rs`, `examples.rs`

Teams (`features/teams/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/teams/` -- all files: `mod.rs`, `team_manager.rs`, `team_billing.rs`, `team_permissions.rs`, `team_activity.rs`, `team_resources.rs`

Workflows and marketplace (`features/workflows/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/workflows/` -- all files: `mod.rs`, `marketplace.rs`, `publishing.rs`, `social.rs`, `templates_marketplace.rs`

Orchestration engine (`core/orchestration/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/workflow_engine.rs` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/workflow_executor.rs` (28K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/workflow_scheduler.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/mod.rs`

Scheduler (`core/scheduler/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/scheduler/` -- all files

Documents (`features/document/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/document/` -- all files

Projects (`features/projects/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/projects/` -- all files: `mod.rs`, `manager.rs`, `knowledge.rs`, `rag.rs`

Other features:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/messaging/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/canvas/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/clipboard/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/productivity/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/search/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/webhooks/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/updater.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/features/mod.rs`

Relevant command handlers:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/calendar.rs` (21K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/email.rs` (47K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/voice.rs` (57K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/terminal.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/teams.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/scheduler.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/messaging.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/document.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/projects.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/productivity.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/continuous_job_runner.rs` (106K)

**Current State:**
- Calendar: integrates with Google Calendar and Outlook
- Email: Full email pipeline (Gmail OAuth, IMAP/SMTP, pub/sub for real-time)
- Speech: Deepgram for STT, local STT/TTS, wake word detection, push-to-talk, voice activity detection, barge-in
- Terminal: PTY-based with AI assistant (command suggestions, error diagnosis), multi-shell support
- Tasks: Queue-based with persistence and prioritization
- Teams: Manager, billing, permissions, activity tracking, resource sharing
- Workflows: Engine + executor + scheduler with marketplace publishing and social sharing
- The continuous_job_runner at 106K is one of the largest command handlers

**Primary Question**: What productivity and collaboration features does AGI Workforce offer? How do calendar, email, voice, terminal, tasks, teams, and workflows work together to make the AI a true personal secretary and team assistant?

**Key Aspects to Document:**
- Calendar integration (Google + Outlook): create, read, update events
- Email capabilities: Gmail OAuth, IMAP/SMTP, pub/sub for real-time notifications
- Voice features: STT (Deepgram, local), TTS, wake word, push-to-talk, VAD, barge-in
- Terminal: PTY, AI assistant, multi-shell, session management
- Task queue and execution system
- Team management (roles, permissions, billing, activity)
- Workflow engine with marketplace and templates
- Scheduling and recurring automation
- How these features make AGI Workforce more than just a chatbot

**DO NOT TOUCH:**
- Agent runtime and LLM routing (Agent 2)
- Desktop automation and computer use (Agent 3)
- MCP and developer ecosystem (Agent 5)
- Web app and services (Agent 6)
- Security and data layers (Agent 7)

---

### Agent 5: MCP, Extensions, and Developer Ecosystem

**Domain**: The Model Context Protocol implementation, extension/plugin marketplace, embeddings/search, browser extension, skills system, and code-related features that define the developer and extensibility story.

**Allowed Files (read-only):**

MCP system (`core/mcp/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/client.rs` (7K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/manager.rs` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/registry.rs` (17K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/protocol.rs` (10K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/transport.rs` (57K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/session.rs` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/config.rs` (26K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/health.rs` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/events.rs` (2K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/error.rs` (1K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/tool_executor.rs` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/logs.rs` (1K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/mod.rs` (1K)

MCP extensions/plugins (`core/mcp/extensions/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/mcp/extensions/` -- all files: `installer.rs`, `manager.rs`, `manifest.rs`, `package.rs`, `repository.rs`, `mod.rs`

Skills system (`core/skills/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/skills/` -- all files

Embeddings and semantic search (`core/embeddings/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/embeddings/` -- all files: `mod.rs`, `generator.rs`, `chunker.rs`, `indexer.rs`, `similarity.rs`, `cache.rs`

Browser extension (the full extension app):
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/background.ts` (28K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/content.ts` (31K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/popup.ts` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/popup.html` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/side_panel.ts` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/side_panel.html` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/types.ts` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/utils.ts` (12K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/jobAutofill.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/jobAutofill.runtime.js` (37K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/src/injected.js`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/manifest.json`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/vite.config.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/package.json`

MiniMax skills:
- `/Users/siddhartha/Desktop/agiworkforce/.minimax/` -- all files

Frontend developer API and TypeScript layer:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/api/` -- all 25 API wrapper files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/tauri-mock.ts` (the IPC bridge)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/browserAutomation.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/toolMatcher.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/lib/toolDisplayNames.ts`

Relevant command handlers:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcp.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcp_extensions.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcpb.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/marketplace.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/extension.rs` (21K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/skills.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/code_editing.rs` (22K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/embeddings.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/lsp.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/git.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/github.rs`

Shared packages:
- `/Users/siddhartha/Desktop/agiworkforce/packages/types/src/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/packages/utils/src/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/packages/types/package.json`
- `/Users/siddhartha/Desktop/agiworkforce/packages/utils/package.json`

MCP config:
- `/Users/siddhartha/Desktop/agiworkforce/.mcp.json`

API docs:
- `/Users/siddhartha/Desktop/agiworkforce/docs/api/openapi.yaml`
- `/Users/siddhartha/Desktop/agiworkforce/docs/api/examples/` -- all files

**Current State:**
- MCP transport at 57K implements the full client-server protocol with stdio and WebSocket transports
- Extension system supports installing third-party MCP tools from a repository/marketplace
- Browser extension has native messaging bridge to desktop, content script injection, side panel AI chat, and job auto-fill runtime (37K)
- Skills system provides reusable automation patterns
- Embeddings system with chunking, indexing, and similarity search for local RAG
- 25 TypeScript API wrapper files covering chat, automation, memory, MCP, code editing, and more
- The tauri-mock system enables cross-platform operation (desktop, web, test)

**Primary Question**: How is AGI Workforce extensible? What does MCP enable for third-party integrations? How does the browser extension bridge web and desktop? What developer tools (code editing, git, LSP, embeddings) exist? What is the API surface area?

**Key Aspects to Document:**
- MCP architecture (transport, protocol, sessions, tool discovery, tool execution)
- Extension/plugin marketplace (installer, manifest, package format, repository)
- Browser extension capabilities (native messaging, content scripts, side panel, job auto-fill)
- Embedding and semantic search pipeline
- Developer tools: code editing, LSP integration, git operations, GitHub integration
- The TypeScript API layer (25+ domain-specific wrappers)
- The tauri-mock pattern for cross-platform operation
- Shared types and utilities across the monorepo
- Skills system for reusable automation patterns
- How MCP makes AGI Workforce an open platform vs. a closed product

**DO NOT TOUCH:**
- Agent runtime and LLM routing (Agent 2)
- Desktop automation internals (Agent 3 -- though some overlap with executors is expected)
- Feature modules (Agent 4)
- Web app and services (Agent 6)
- Security and data layers (Agent 7)

---

### Agent 6: Web App, API Gateway, and Services

**Domain**: The Next.js web application, its API routes, the API gateway, the signaling server, Supabase integration, Stripe payments, and the web-based chat/media features.

**Allowed Files (read-only):**

Web app pages and layout:
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/page.tsx` (17K -- landing page)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/layout.tsx` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/globals.css` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/providers.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/error.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/not-found.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/robots.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/sitemap.ts`
- All page directories: `auth/`, `chat/`, `dashboard/`, `login/`, `signup/`, `forgot-password/`, `verify/`, `pricing/`, `download/`, `get-started/`, `about/`, `contact/`, `faq/`, `docs/`, `privacy/`, `terms/`, `payment-failure/`, `i18n/`, `diagnose/`

Web API routes:
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/` -- ALL subdirectories:
  - `admin/` (directory-sync, security, sso), `auth/` (sso-check)
  - `chat/`, `checkout/`, `credit-topup/`, `cron/`, `csrf/`, `debug/`, `device/`, `download/`, `download-beta/`, `health/`, `llm/`, `me/`, `media/`, `portal/`, `releases/`, `stripe-webhook/`, `sync-subscription/`, `user/`, `validate-webhook/`, `voice/`, `waitlist/`, `webhook-diagnostic/`, `webhooks/`, `claim-offer/`

Web components:
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/` -- ALL directories:
  - `chat/`, `dashboard/`, `ui/`, `settings/`, `Subscription/`, `SimpleMode/`, `Media/`, `CommandPalette/`, `accessibility/`, `layout/`, `modals/`, `stripe/`
  - `ApplicationPreview.tsx`, `DirectDownloadButtons.tsx`, `DownloadSection.tsx`

Web lib, hooks, stores, services:
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/` -- ALL files
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/stores/` -- `chatStore.ts`, `mediaStore.ts`, `settingsStore.ts`, `uiStore.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/middleware.ts` (3K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/next.config.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/instrumentation.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/package.json`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/vercel.json`

API Gateway:
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/` -- ALL files:
  - `index.ts`, `env.ts`, `authenticated-user.ts`, `websocket.ts` (11K)
  - `middleware/`, `routes/`, `lib/`, `validations/`
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/package.json`

Signaling Server:
- `/Users/siddhartha/Desktop/agiworkforce/services/signaling-server/src/` -- ALL files:
  - `index.ts` (38K), `connection-manager.ts`, `constants.ts`, `db.ts`, `logger.ts`, `metrics.ts`
  - `middleware/`
- `/Users/siddhartha/Desktop/agiworkforce/services/signaling-server/Dockerfile`
- `/Users/siddhartha/Desktop/agiworkforce/services/signaling-server/fly.toml`
- `/Users/siddhartha/Desktop/agiworkforce/services/signaling-server/package.json`

Root deployment configs:
- `/Users/siddhartha/Desktop/agiworkforce/vercel.json`

**Current State:**
- Web app has 20+ pages: landing, auth flow (login, signup, SSO, forgot password, verify), dashboard with multiple sub-pages, web chat, pricing, download, get-started, about, contact, FAQ, docs, diagnose
- 25+ API routes covering admin (SSO, security, directory sync), auth, chat, payments (checkout, credit-topup, portal, stripe webhook, subscription sync), device management, LLM proxy, media, releases, voice, waitlist, webhooks
- Web lib has 9+ LLM provider implementations (Anthropic, OpenAI, Google, DeepSeek, xAI, Perplexity, Moonshot, Qwen, Zhipu)
- Security middleware: CORS, CSRF, rate limiting, egress policy, leak detection
- API gateway provides authenticated WebSocket + REST bridge for external clients
- Signaling server at 38K enables WebRTC peer-to-peer connections for real-time collaboration

**Primary Question**: What does the web presence and backend infrastructure provide? How does the web app complement the desktop app? What server-side capabilities enable payments, auth, admin, media, and real-time collaboration?

**Key Aspects to Document:**
- Landing page marketing narrative and product positioning
- Authentication flow (Supabase, SSO with domain detection, signup, forgot password)
- Dashboard experience
- Web chat and how it compares to desktop chat
- Stripe payment integration (checkout, portal, webhooks, credit top-up, subscription sync)
- Admin APIs (SSO management, security actions, directory sync)
- LLM proxy routes for web-based AI
- Media generation API
- Device management and registration
- The API gateway architecture and WebSocket support
- The signaling server for WebRTC
- Deployment configuration (Vercel, Fly.io, Railway)

**DO NOT TOUCH:**
- Desktop app frontend (Agent 1)
- Rust backend agent/LLM/automation code (Agents 2, 3, 4)
- MCP system and browser extension (Agent 5)
- Security and data layers in the Rust backend (Agent 7)

---

### Agent 7: Security, Data, Infrastructure, and CI/CD

**Domain**: The security architecture, local data persistence, database encryption, CI/CD pipelines, Supabase migrations, build configuration, and project infrastructure.

**Allowed Files (read-only):**

Security system (`sys/security/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/` -- ALL 27 files:
  - `master_password.rs` (26K), `auth.rs` (20K), `auth_db.rs`, `secret_manager.rs`, `tool_guard.rs` (51K), `command_validator.rs`, `storage.rs`, `machine_key.rs`, `encryption.rs`, `audit_logger.rs`, `audit.rs`, `rbac.rs`, `sandbox.rs`, `validator.rs`, `rate_limit.rs`, `permissions.rs`, `prompt_injection.rs`, `injection_detector.rs`, `dm_protection.rs`, `oauth.rs`, `approval_workflow.rs`, `updater.rs`, `policy_integration.rs`, `policy/`, `guardrails.rs`, `api.rs`, `mod.rs`

Data layer (`data/`):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/` -- `mod.rs`, `models.rs`, `repository.rs` (28K), `migrations.rs` (147K), `encryption.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/settings/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/database/` -- all files: `connection.rs`, `postgres_client.rs`, `mysql_client.rs`, `redis_client.rs`, `nosql_client.rs`, `sql_client.rs`, `sqlite_pool.rs`, `query_builder.rs`, `pool.rs`, `security.rs`, `mod.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/analytics/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/cache/` -- all files
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/state.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/mod.rs`

Local SQLite migrations:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/migrations/` -- all files

Supabase migrations (30 files):
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/` -- all 30 SQL files

Tauri configuration and capabilities:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/tauri.conf.json`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/capabilities/default.json`

State and lib.rs:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` (112K -- app entry point, state initialization, command registration)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/state.rs` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/main.rs`

Integrations:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/integrations/` -- all subdirectories: `api_integrations/`, `cloud/`, `native_messaging/`, `realtime/`, `sync/`

UI system (Rust-side window/tray management):
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/ui/` -- all files: `events/`, `hooks/`, `onboarding/`, `overlay/`, `tray.rs`, `window/`, `mod.rs`

Telemetry:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/telemetry/` -- all files

Billing:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/billing/` -- all files

CI/CD:
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/ci.yml` (6K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/release-desktop.yml` (23K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/release.yml` (5K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/e2e-tests.yml` (4K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/build-appstore.yml` (6K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/workflows/deploy-signaling-server.yml` (7K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/dependabot.yml` (9K)
- `/Users/siddhartha/Desktop/agiworkforce/.github/codeql/`

Root build configs:
- `/Users/siddhartha/Desktop/agiworkforce/package.json`
- `/Users/siddhartha/Desktop/agiworkforce/pnpm-workspace.yaml`
- `/Users/siddhartha/Desktop/agiworkforce/Cargo.toml`
- `/Users/siddhartha/Desktop/agiworkforce/tsconfig.base.json`
- `/Users/siddhartha/Desktop/agiworkforce/eslint.config.mjs`
- `/Users/siddhartha/Desktop/agiworkforce/commitlint.config.cjs`
- `/Users/siddhartha/Desktop/agiworkforce/.prettierrc.json`
- `/Users/siddhartha/Desktop/agiworkforce/rust-toolchain.toml`
- `/Users/siddhartha/Desktop/agiworkforce/.npmrc`
- `/Users/siddhartha/Desktop/agiworkforce/.husky/` -- all files

Audit documents:
- `/Users/siddhartha/Desktop/agiworkforce/CODERABBIT_REVIEW.md` (31K)
- `/Users/siddhartha/Desktop/agiworkforce/SECURITY.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/stabilization.md` (13K)
- `/Users/siddhartha/Desktop/agiworkforce/docs/release/rc-2026-02-23-hardening.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/release/subscription-posture.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/specs/` -- all existing spec documents

Testing infrastructure:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/` -- all test files
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/` -- all test files
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/e2e/` -- all E2E test files
- `/Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/__tests__/` -- test files if present
- `/Users/siddhartha/Desktop/agiworkforce/apps/extension/__tests__/` -- test files

**Current State:**
- Security: Master password (Argon2id OWASP params), tool guard (51K -- 4 safety tiers), prompt injection detection, RBAC, audit logging, sandbox execution, machine key derivation, kill switch
- Data: SQLite via rusqlite with SQLCipher encryption, 147K migrations file, repository pattern, multi-database clients (Postgres, MySQL, Redis, MongoDB) for user operations
- Supabase: 30 migration files tracking evolution from init through auth, billing, devices, security, SSO, SCIM, waitlist
- CI/CD: 6 GitHub Actions workflows covering CI (lint/typecheck/test/cargo), desktop release (macOS/Windows/Linux), web release, E2E tests, App Store build, signaling server deploy
- CodeRabbit audit found 68 issues (5 critical, 28 high, 24 medium, 11 low)
- Stabilization document tracks 16+ domain health statuses

**Primary Question**: How is data secured, persisted, built, tested, and deployed? What is the full security posture? What does the database evolution reveal about product maturation? How does CI/CD ensure quality?

**Key Aspects to Document:**
- Master password and encryption system (Argon2id, HKDF-SHA256, SQLCipher)
- Tool guard safety tiers and approval workflow
- Prompt injection prevention
- RBAC for teams
- Audit logging system
- SQLite schema and migration evolution
- Supabase migration history (30 files showing feature progression)
- Multi-database client support for user database operations
- CI/CD pipelines (what is tested, how releases are built)
- Desktop release pipeline for macOS, Windows, Linux
- App Store build process
- Dependabot and CodeQL automated security
- Tauri capabilities and permission model (deny lists for sensitive paths)
- Known security issues from CODERABBIT_REVIEW.md (5 critical, 28 high)
- Stabilization status across all subsystems

**DO NOT TOUCH:**
- Desktop UI components and stores (Agent 1)
- Agent runtime, LLM routing, AGI orchestration (Agent 2)
- Desktop automation and computer use (Agent 3)
- Feature modules (Agent 4)
- MCP and browser extension (Agent 5)
- Web app pages, API routes, and components (Agent 6)

---

## Interface Contracts Between Agents

There are no code modification interface contracts since all agents are READ-ONLY explorers. However, agents should be aware of these cross-domain dependencies when documenting integration points:

### Agent 1 (UI) <-> Agent 2 (AI Core)
- The React hooks (especially `useAgenticEvents.ts`) subscribe to Tauri events emitted by the Rust agent runtime
- The TypeScript API layer (`src/api/chat.ts`) invokes Rust commands in `sys/commands/chat/`
- The chat stores (`stores/chat/`) mirror state managed by the Rust agent/LLM system

### Agent 1 (UI) <-> Agent 3 (Automation)
- InlineToolResults components render the output of tool executions dispatched by the tool executor
- The automation and browser UI components invoke commands handled by Agent 3's Rust code

### Agent 2 (AI Core) <-> Agent 3 (Automation)
- The tool_executor.rs (348K, in Agent 3's scope) is called BY the agent runtime (in Agent 2's scope)
- The AGI executors dispatch actual operations that the automation layer carries out

### Agent 4 (Productivity) <-> Agent 2 (AI Core)
- The workflow engine and scheduler use the agent runtime for executing scheduled tasks
- Feature modules expose Tauri commands that the agent can invoke as tools

### Agent 5 (Extensions) <-> Agent 2 (AI Core)
- MCP tools are registered in the LLM's tool list and dispatched via the MCP tool executor
- The MCP extension system extends what tools the agent can use

### Agent 5 (Extensions) <-> Agent 3 (Automation)
- The browser extension communicates with the desktop automation layer via native messaging
- The extension_bridge.rs is in Agent 3's scope; the extension TypeScript is in Agent 5's scope

### Agent 6 (Web/Services) <-> Agent 7 (Security/Data)
- Web API routes use Supabase auth and Stripe (middleware and security are in Agent 7's audit scope)
- The API gateway auth middleware enforces kill switch and JWT validation (documented by Agent 7)

---

## DO NOT TOUCH Sections (Global)

**No agent should modify ANY file.** All agents are READ-ONLY.

Additionally, these files are CRITICAL and should be noted if any issues are found but never modified:
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` (112K) -- core entry point
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/main.rs` -- binary entry point
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml` -- Rust dependency manifest
- `/Users/siddhartha/Desktop/agiworkforce/package.json` -- monorepo root config
- `/Users/siddhartha/Desktop/agiworkforce/pnpm-lock.yaml` -- dependency lockfile

---

## Instructions for Each Agent

Each agent should:

1. **Read all files in its assigned scope** (prioritize the largest/most important files if time is limited)
2. **Answer the primary question** with specific evidence from the code (file paths, line numbers, function names)
3. **Document the key aspects** listed in the assignment
4. **Highlight unique differentiators** -- what does this domain do that Claude Desktop, ChatGPT, or Gemini cannot?
5. **Note integration points** -- how does this domain connect to other domains (see Interface Contracts above)?
6. **Identify gaps or issues** -- incomplete features, TODO comments, stubs, error-prone areas
7. **Estimate scope** -- approximate lines of code and number of features in the domain

### Output Format for Each Agent

```
## [Domain Name]

### Summary
[2-3 sentence overview answering the primary question]

### Capabilities
[Bulleted list of specific capabilities discovered in the code]

### Unique Differentiators
[What makes this special compared to Claude Desktop, ChatGPT, Gemini]

### Integration Points
[How this domain connects to others, with specific file paths]

### Technical Details
[Key data structures, algorithms, or architectural patterns worth noting]

### Gaps or Issues
[Incomplete features, bugs, TODO comments, or areas for improvement found in code]

### Scope Estimate
[Approximate lines of Rust/TypeScript code and number of features]
```

---

## Compilation Plan

After all 7 agents complete, their outputs should be compiled into a single "AGI Workforce -- Project Vision" document organized as:

1. **Executive Summary** -- What AGI Workforce is in one paragraph
2. **Product Architecture** -- How the desktop, web, extension, and services work together
3. **Core AI Engine** -- Agent runtime, LLM routing, multi-agent swarm, research (from Agent 2)
4. **Automation Capabilities** -- Desktop automation, browser control, computer use, terminal, tools (from Agent 3)
5. **Productivity Features** -- Calendar, email, voice, tasks, teams, workflows, scheduling (from Agent 4)
6. **Developer and Extensibility Platform** -- MCP, browser extension, embeddings, code tools, API surface (from Agent 5)
7. **User Experience** -- Chat interface, voice, media, artifacts, command palette, component breadth (from Agent 1)
8. **Web Platform and Services** -- Web app, API routes, payments, real-time collaboration (from Agent 6)
9. **Enterprise Security and Infrastructure** -- Security, encryption, data, CI/CD, migrations, audit (from Agent 7)
10. **Competitive Analysis** -- Combined from all agents: what AGI Workforce does that competitors cannot
11. **Known Gaps and Roadmap** -- Combined from all agents: what is incomplete, what needs work

---

## Verification Checklist

- [x] All file paths exist in the codebase (verified via ls/ls -la during spec creation)
- [x] No agent scopes overlap except at documented interface boundaries
- [x] All 7 agents cover the entire codebase between them
- [x] DO NOT TOUCH sections are clearly communicated (all agents are read-only)
- [x] Output format is specified for consistent compilation
- [x] Interface contracts between agents are documented
- [x] Spec saved to `docs/specs/spec-2026-02-25-project-vision-exploration.md`
