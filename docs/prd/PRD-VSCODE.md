# PRD-VSCODE: AGI Workforce VS Code Extension

> **Document version**: 1.0.0
> **Last updated**: 2026-03-09
> **Status**: Approved for implementation
> **Owner**: Product Team
> **Platform**: Visual Studio Code Extension (Marketplace)
> **Competitor baseline**: Claude Code VS Code Extension, GitHub Copilot Chat, Cline/Roo Code, Continue

---

## Table of Contents

1. [Executive Summary](#section-1-executive-summary)
2. [Platform Requirements](#section-2-platform-requirements)
3. [Feature Matrix](#section-3-feature-matrix)
4. [Screen-by-Screen UI Specification](#section-4-screen-by-screen-ui-specification)
5. [Component Architecture](#section-5-component-architecture)
6. [Data Flow & API Connections](#section-6-data-flow--api-connections)
7. [Platform-Specific Capabilities](#section-7-platform-specific-capabilities)
8. [Build, Deploy & Distribution](#section-8-build-deploy--distribution)
9. [Testing Strategy](#section-9-testing-strategy)
10. [Performance Requirements](#section-10-performance-requirements)
11. [Security](#section-11-security)
12. [Accessibility](#section-12-accessibility)
13. [Competitive Analysis](#section-13-competitive-analysis)

---

# Section 1: Executive Summary

## 1.1 Platform Vision

The AGI Workforce VS Code Extension brings the full power of the AGI Workforce multi-model AI platform into Visual Studio Code, the world's most popular code editor with over 35 million monthly active users (as of early 2026). Rather than being locked to a single AI provider -- as GitHub Copilot is locked to OpenAI, or the Claude Code extension is locked to Anthropic -- AGI Workforce lets developers use any LLM from nine or more cloud providers, plus locally hosted models, all through a single unified interface embedded in the editor they already use.

The extension is not a standalone product. It is a first-class companion to the AGI Workforce desktop application, connected via a local WebSocket/HTTP bridge. When the desktop app is running, the VS Code extension gains access to the full agent runtime: MCP tools, autonomous multi-file editing, background scheduling, computer use, and 140+ AI skills. When the desktop app is not running, the extension operates independently via the AGI Workforce cloud API, providing chat, inline completions, code actions, and basic agent capabilities.

This dual-mode architecture -- cloud-independent + desktop-enhanced -- is unique in the marketplace and positions the extension as the only VS Code AI assistant that:

1. Routes to any model (GPT-5, Claude Opus 4.6, Gemini 3 Pro, DeepSeek R1, Grok 4, local models)
2. Connects to a native desktop agent runtime for full computer use and tool execution
3. Supports MCP tools directly from within VS Code
4. Provides ghost-text inline completions from any LLM
5. Offers a fully functional agent mode with multi-file editing, plan-then-execute workflow, and batch undo

## 1.2 Target Users

### 1.2.1 Primary: Professional Developers

Developers who spend 4+ hours daily in VS Code and want AI assistance that is not locked to one provider. They want to compare model outputs, use the best model for each task (fast models for completions, reasoning models for architecture, cheap models for boilerplate), and maintain control over their API spend.

**Key needs:**

- Multi-model access without leaving VS Code
- Inline completions that work with any LLM
- Context-aware code actions (explain, fix, refactor, test)
- Agent mode for multi-file refactoring
- Git integration for AI-assisted commits

### 1.2.2 Secondary: AI Enthusiasts and Experimenters

Users who want to test new models as they launch. When a new model drops from any provider, AGI Workforce supports it immediately through the remote model catalog, without waiting for an extension update.

**Key needs:**

- Day-one model access via remote catalog
- Easy model switching via status bar or command palette
- Ability to compare model quality on the same prompt

### 1.2.3 Tertiary: Teams and Enterprises

Organizations deploying AI tools across development teams, who need vendor neutrality to avoid lock-in, centralized API key management, and audit-friendly telemetry.

**Key needs:**

- BYOK (Bring Your Own Keys) -- organization provides API keys, users consume them
- Workspace-level settings for team-wide configuration
- Desktop bridge for connecting to enterprise tool infrastructure
- Telemetry that respects VS Code privacy settings

## 1.3 Key Differentiators Over Competitors

| Differentiator            | AGI Workforce                      | GitHub Copilot | Claude Code    | Cline           |
| ------------------------- | ---------------------------------- | -------------- | -------------- | --------------- |
| Model providers           | 9+ cloud + local                   | OpenAI only    | Anthropic only | BYOK but manual |
| Desktop agent integration | Native bridge                      | None           | None           | None            |
| MCP tools in VS Code      | Yes (via bridge)                   | No             | Limited        | Yes             |
| Inline completions        | Any model                          | GPT-4o only    | No             | No              |
| Agent mode (multi-file)   | Yes + plan mode                    | Limited        | Yes            | Yes             |
| Auto-routing              | 3 modes (balanced/economy/premium) | None           | None           | None            |
| Cost tracking             | Built-in                           | Hidden         | Visible        | Manual          |
| Remote model catalog      | Auto-updated hourly                | Fixed          | Fixed          | Manual          |
| Batch undo for AI edits   | Yes                                | No             | No             | No              |

## 1.4 Non-Negotiable Requirements

These requirements are absolute constraints inherited from the AGI Workforce platform:

| ID       | Requirement                                 | Rationale                                                                                                                                |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| NN-VS-01 | Zero user-visible raw error messages        | All errors must be translated to friendly messages with actionable next steps (e.g., "Set API Key" button).                              |
| NN-VS-02 | API keys must never appear in plaintext     | All keys stored via VS Code SecretStorage API (OS keychain-backed). Never logged, never in settings.json.                                |
| NN-VS-03 | Extension must not block editor performance | All AI calls are async. Extension host activation must complete in under 500ms. No synchronous network I/O.                              |
| NN-VS-04 | Multi-model routing must work               | Users must be able to switch models at any time. A failure in one provider must not prevent use of others.                               |
| NN-VS-05 | Fallback must always be available           | If AGI Workforce API is unreachable, fall back to VS Code built-in Language Model API (Copilot). If that fails, show clear instructions. |
| NN-VS-06 | Desktop bridge must be optional             | The extension must be fully functional without the desktop app. Bridge is an enhancement, not a requirement.                             |
| NN-VS-07 | Proprietary license enforced                | Extension source code is proprietary. VSIX package is distributed via VS Code Marketplace under commercial terms.                        |

## 1.5 Success Metrics

| Metric                            | Target (6 months post-launch) | Measurement                            |
| --------------------------------- | ----------------------------- | -------------------------------------- |
| Marketplace installs              | 50,000+                       | VS Code Marketplace dashboard          |
| Monthly active users              | 15,000+                       | Telemetry (extension/activated events) |
| Average rating                    | 4.3+ stars                    | Marketplace reviews                    |
| Daily chat messages               | 100,000+                      | API gateway logs                       |
| Desktop bridge adoption           | 30% of active users           | Telemetry (bridge status events)       |
| Agent mode sessions               | 5,000+/month                  | Telemetry (agent mode events)          |
| Inline completion acceptance rate | 25%+                          | Telemetry (completion/accepted events) |

---

# Section 2: Platform Requirements

## 2.1 VS Code Version Requirements

| Requirement        | Minimum                       | Recommended   |
| ------------------ | ----------------------------- | ------------- |
| VS Code version    | 1.95.0                        | Latest stable |
| Node.js runtime    | 18.x (bundled with VS Code)   | 20.x+         |
| Extension API      | Chat Participants API (1.93+) | Latest        |
| Language Model API | vscode.lm (1.90+)             | Latest        |

The extension declares `"engines": { "vscode": "^1.95.0" }` in `package.json`. This minimum version ensures:

- Chat Participants API is available for the `@agi` chat participant
- Language Model API (`vscode.lm`) is available for fallback completions
- SecretStorage API is mature and OS-keychain-backed
- Inline Completion API supports cancellation tokens
- WebSocket support in the Node.js runtime (for desktop bridge)

## 2.2 Operating System Support

The extension runs inside the VS Code Extension Host, which is OS-agnostic. It supports all platforms where VS Code runs:

| Platform            | Support Level | Notes                                                  |
| ------------------- | ------------- | ------------------------------------------------------ |
| macOS (arm64)       | Full          | Primary development platform                           |
| macOS (x64)         | Full          | Intel Macs                                             |
| Windows 10/11 (x64) | Full          | Desktop bridge uses localhost networking               |
| Linux (x64)         | Full          | All major distributions                                |
| Linux (arm64)       | Full          | Raspberry Pi, ARM servers                              |
| VS Code for the Web | Partial       | No desktop bridge, no filesystem access for agent mode |
| GitHub Codespaces   | Partial       | Cloud API only, no desktop bridge                      |

## 2.3 Hardware Requirements

The extension itself has minimal hardware requirements beyond what VS Code needs:

| Resource                   | Requirement                                             |
| -------------------------- | ------------------------------------------------------- |
| RAM overhead               | <50 MB above VS Code baseline                           |
| Disk (installed extension) | <5 MB (VSIX package)                                    |
| Network                    | Internet for cloud API; localhost for desktop bridge    |
| CPU                        | Negligible (all compute is server-side or desktop-side) |

## 2.4 Distribution Format

| Channel             | Format                  | Notes                                             |
| ------------------- | ----------------------- | ------------------------------------------------- |
| VS Code Marketplace | `.vsix` package         | Primary distribution                              |
| Open VSX Registry   | `.vsix` package         | For VS Codium and other open-source VS Code forks |
| Direct download     | `.vsix` file            | Enterprise offline installation                   |
| Pre-release channel | Marketplace pre-release | Beta testing                                      |

## 2.5 Framework and Tech Stack

| Layer              | Technology                     | Version |
| ------------------ | ------------------------------ | ------- |
| Language           | TypeScript                     | 5.8+    |
| Build tool         | esbuild                        | 0.25+   |
| Module format      | CommonJS (required by VS Code) | --      |
| Target             | Node.js 18 (ES2022)            | --      |
| Runtime dependency | `ws` (WebSocket client)        | 8.18+   |
| Test framework     | Vitest                         | 4.0+    |
| E2E test runner    | @vscode/test-electron          | 2.4+    |
| Package tool       | @vscode/vsce                   | 3.0+    |
| Linting            | ESLint 9 + @typescript-eslint  | 8.0+    |

## 2.6 Feature Flags

The extension uses VS Code's `contributes.configuration` for feature flags. All flags are user-configurable:

| Flag                                     | Default | Scope | Description                                            |
| ---------------------------------------- | ------- | ----- | ------------------------------------------------------ |
| `agiWorkforce.inlineCompletions.enabled` | `false` | User  | Enable ghost-text inline completions                   |
| `agiWorkforce.mcp.enabled`               | `false` | User  | Enable MCP tool integrations (requires desktop bridge) |
| `agiWorkforce.desktopBridge.enabled`     | `true`  | User  | Connect to AGI Workforce desktop app                   |
| `agiWorkforce.agent.planMode`            | `false` | User  | Show a plan before executing agent tasks               |
| `agiWorkforce.hoverEnabled`              | `false` | User  | Show quick actions on hover over identifiers           |
| `agiWorkforce.autoApplyFixes`            | `false` | User  | Auto-apply AI-suggested fixes without diff preview     |
| `agiWorkforce.telemetryEnabled`          | `false` | User  | Send anonymous usage telemetry                         |
| `agiWorkforce.fallbackToVscodeLm`        | `true`  | User  | Fall back to VS Code built-in LM API                   |
| `agiWorkforce.streamingEnabled`          | `true`  | User  | Enable streaming responses                             |

---

# Section 3: Feature Matrix

## 3.1 Complete Feature List

### 3.1.1 Chat & Conversation (P0 -- Must Ship)

| ID      | Feature                    | Priority | Status      | Description                                                        |
| ------- | -------------------------- | -------- | ----------- | ------------------------------------------------------------------ |
| CHAT-01 | @agi Chat Participant      | P0       | Implemented | Register as `@agi` in VS Code Chat panel with slash commands       |
| CHAT-02 | Sidebar chat panel         | P0       | Implemented | Dedicated webview chat in the activity bar sidebar                 |
| CHAT-03 | Streaming responses        | P0       | Implemented | SSE-based token-by-token streaming                                 |
| CHAT-04 | Conversation history       | P0       | Implemented | Persist conversations in globalState, tree view in sidebar         |
| CHAT-05 | Context gathering          | P0       | Implemented | Automatic active file, selection, workspace name, language context |
| CHAT-06 | System prompt with context | P0       | Implemented | Dynamic system prompt including editor state and feature flags     |
| CHAT-07 | Multi-turn conversation    | P0       | Implemented | Full history maintained in sidebar chat and @agi participant       |
| CHAT-08 | Cancel streaming           | P0       | Implemented | CancellationToken support for aborting in-flight requests          |
| CHAT-09 | Markdown rendering         | P0       | Implemented | Fenced code blocks, bold, inline code rendering in sidebar         |
| CHAT-10 | Error recovery             | P0       | Implemented | Friendly error messages with "Set API Key" action buttons          |
| CHAT-11 | vscode.lm fallback         | P0       | Implemented | Fall back to Copilot/built-in models when AGI API unavailable      |
| CHAT-12 | Follow-up suggestions      | P1       | Implemented | Quick follow-up buttons after responses (/explain, /fix, /tests)   |
| CHAT-13 | Conversation export        | P2       | Planned     | Export conversation as Markdown file                               |
| CHAT-14 | Conversation search        | P2       | Planned     | Full-text search across conversation history                       |
| CHAT-15 | Conversation sharing       | P3       | Planned     | Share conversation via URL (requires web backend)                  |
| CHAT-16 | Image/screenshot context   | P2       | Planned     | Attach images for vision-capable models                            |
| CHAT-17 | File attachment context    | P1       | Planned     | @-mention files to include as context                              |
| CHAT-18 | Folder context             | P2       | Planned     | @-mention folders to include directory structure                   |
| CHAT-19 | Selection context          | P1       | Implemented | Automatic inclusion of editor selection in context                 |
| CHAT-20 | Workspace context          | P1       | Implemented | WorkspaceIndexer provides relevant file/symbol context             |

### 3.1.2 Model Management (P0 -- Must Ship)

| ID       | Feature                    | Priority | Status      | Description                                                 |
| -------- | -------------------------- | -------- | ----------- | ----------------------------------------------------------- |
| MODEL-01 | Model selector (QuickPick) | P0       | Implemented | Quick pick with 15+ models, descriptions, tier labels       |
| MODEL-02 | Status bar model indicator | P0       | Implemented | Shows current model + feature chips in status bar           |
| MODEL-03 | Auto-routing modes         | P0       | Implemented | auto-balanced, auto-economy, auto-premium routing           |
| MODEL-04 | Remote model catalog       | P0       | Implemented | Fetch models from /api/models, cache 1 hour, stale fallback |
| MODEL-05 | Per-message model override | P1       | Implemented | Sidebar chat allows per-message model selection             |
| MODEL-06 | Model comparison           | P2       | Planned     | Send same prompt to multiple models, diff results           |
| MODEL-07 | Local model support        | P1       | Planned     | Ollama/LM Studio via desktop bridge proxy                   |
| MODEL-08 | Model usage tracking       | P2       | Planned     | Track tokens/cost per model per session                     |
| MODEL-09 | Model recommendations      | P3       | Planned     | Suggest best model based on task type                       |
| MODEL-10 | Custom model endpoints     | P1       | Implemented | Configurable API endpoint URL                               |

### 3.1.3 Code Intelligence (P0 -- Must Ship)

| ID      | Feature                  | Priority | Status      | Description                                       |
| ------- | ------------------------ | -------- | ----------- | ------------------------------------------------- |
| CODE-01 | Explain selection        | P0       | Implemented | Explain selected code via command or context menu |
| CODE-02 | Fix issues               | P0       | Implemented | Fix bugs/errors in selection with corrected code  |
| CODE-03 | Refactor code            | P0       | Implemented | Refactoring suggestions with explanations         |
| CODE-04 | Generate tests           | P0       | Implemented | Unit test generation for selected code            |
| CODE-05 | Generate docs            | P1       | Implemented | Documentation comment generation (via @agi /docs) |
| CODE-06 | Code actions (lightbulb) | P0       | Implemented | Quick-fix and refactor in VS Code lightbulb menu  |
| CODE-07 | Hover quick actions      | P1       | Implemented | Explain/Fix/Tests links on hover (opt-in)         |
| CODE-08 | Apply inline             | P0       | Implemented | Apply AI fix directly to editor via WorkspaceEdit |
| CODE-09 | Auto-apply fixes         | P1       | Implemented | Auto-apply without diff preview (configurable)    |
| CODE-10 | View in new tab          | P0       | Implemented | Open AI response in side-by-side Markdown tab     |
| CODE-11 | Diagnostic-aware fixes   | P1       | Implemented | CodeActionProvider triggers on diagnostic errors  |
| CODE-12 | Multi-language support   | P0       | Implemented | Works with any language VS Code supports          |
| CODE-13 | Code review              | P2       | Planned     | AI-powered code review with inline annotations    |
| CODE-14 | Security analysis        | P2       | Planned     | Identify security vulnerabilities in selection    |
| CODE-15 | Performance analysis     | P3       | Planned     | Identify performance bottlenecks                  |

### 3.1.4 Inline Completions (P1 -- High Priority)

| ID        | Feature                | Priority | Status      | Description                                     |
| --------- | ---------------------- | -------- | ----------- | ----------------------------------------------- |
| INLINE-01 | Ghost-text completions | P1       | Implemented | InlineCompletionItemProvider with debounce      |
| INLINE-02 | Configurable debounce  | P1       | Implemented | 50-2000ms debounce (default 300ms)              |
| INLINE-03 | Max completion length  | P1       | Implemented | 50-5000 chars (default 500)                     |
| INLINE-04 | Prefix context         | P1       | Implemented | 80 lines before cursor as context               |
| INLINE-05 | Suffix context         | P1       | Implemented | 20 lines after cursor for better completions    |
| INLINE-06 | Result caching         | P1       | Implemented | 15-second TTL cache to avoid duplicate requests |
| INLINE-07 | Smart filtering        | P1       | Implemented | Skip mid-token, short prefix (<3 chars)         |
| INLINE-08 | Code block extraction  | P1       | Implemented | Strip markdown fences from model responses      |
| INLINE-09 | Multi-line completions | P2       | Planned     | Complete entire function bodies                 |
| INLINE-10 | Fill-in-the-middle     | P2       | Planned     | Use suffix context for FIM-style completions    |

### 3.1.5 Agent Mode (P1 -- High Priority)

| ID       | Feature                 | Priority | Status      | Description                                                   |
| -------- | ----------------------- | -------- | ----------- | ------------------------------------------------------------- |
| AGENT-01 | Agent mode panel        | P1       | Implemented | Dedicated webview panel for autonomous agent                  |
| AGENT-02 | Multi-file reading      | P1       | Implemented | Agent reads files via @read directive                         |
| AGENT-03 | Multi-file editing      | P1       | Implemented | Agent edits files via `edit:path` blocks                      |
| AGENT-04 | Diff preview            | P1       | Implemented | Side-by-side diff before applying edits                       |
| AGENT-05 | Batch apply/reject      | P1       | Implemented | Apply all or cancel all edits in a batch                      |
| AGENT-06 | Batch undo              | P1       | Implemented | Undo entire batch of applied edits                            |
| AGENT-07 | Plan mode               | P1       | Implemented | Show numbered plan before executing edits                     |
| AGENT-08 | Autonomous continuation | P1       | Implemented | Agent auto-continues after reading files                      |
| AGENT-09 | Iteration limit         | P1       | Implemented | Configurable max iterations (default 25) with user prompt     |
| AGENT-10 | Workspace indexer       | P1       | Implemented | Index top-level symbols for context (100 files, 5000 symbols) |
| AGENT-11 | Open editors context    | P1       | Implemented | Include visible editor files as context                       |
| AGENT-12 | File creation           | P1       | Implemented | Create new files that don't exist yet                         |
| AGENT-13 | Tool execution          | P2       | Planned     | Execute MCP tools via desktop bridge                          |
| AGENT-14 | Terminal integration    | P2       | Planned     | Agent can run terminal commands                               |
| AGENT-15 | Git integration         | P2       | Planned     | Agent can stage, commit, create branches                      |
| AGENT-16 | Multi-workspace support | P3       | Planned     | Agent works across multi-root workspaces                      |
| AGENT-17 | Background agent        | P3       | Planned     | Agent continues running in background                         |
| AGENT-18 | Agent history view      | P2       | Planned     | View past agent sessions and applied edits                    |

### 3.1.6 Desktop Bridge (P1 -- High Priority)

| ID        | Feature                 | Priority | Status      | Description                                       |
| --------- | ----------------------- | -------- | ----------- | ------------------------------------------------- |
| BRIDGE-01 | WebSocket connection    | P1       | Implemented | Real-time bidirectional communication             |
| BRIDGE-02 | HTTP API                | P1       | Implemented | RESTful commands to desktop app                   |
| BRIDGE-03 | Auto-reconnect          | P1       | Implemented | Reconnect on disconnect (5s interval)             |
| BRIDGE-04 | Health check loop       | P1       | Implemented | Periodic health check (30s interval)              |
| BRIDGE-05 | Status bar indicator    | P1       | Implemented | Bridge connection status in status bar            |
| BRIDGE-06 | Send code to desktop    | P1       | Implemented | Send selection/file to desktop agent              |
| BRIDGE-07 | Sync workspace context  | P1       | Implemented | Share workspace folders and active file           |
| BRIDGE-08 | Trigger agent actions   | P1       | Implemented | Open chat, run task, open tool on desktop         |
| BRIDGE-09 | Receive desktop events  | P1       | Implemented | Open file, show message, run command from desktop |
| BRIDGE-10 | Command allowlist       | P0       | Implemented | Security: only allowlisted commands executable    |
| BRIDGE-11 | Agent status monitoring | P1       | Implemented | Poll/stream agent session status from desktop     |
| BRIDGE-12 | MCP tool passthrough    | P2       | Planned     | Execute MCP tools on desktop from VS Code         |
| BRIDGE-13 | Desktop notifications   | P1       | Implemented | Notify on agent completion/failure                |
| BRIDGE-14 | Port configuration      | P1       | Implemented | Configurable bridge port (default 8787)           |

### 3.1.7 Git Integration (P1 -- High Priority)

| ID     | Feature            | Priority | Status      | Description                                    |
| ------ | ------------------ | -------- | ----------- | ---------------------------------------------- |
| GIT-01 | Git status command | P1       | Implemented | Open terminal and run git status               |
| GIT-02 | Git diff command   | P1       | Implemented | Open terminal and run git diff                 |
| GIT-03 | Git commit command | P1       | Implemented | Prompt for message, add modified files, commit |
| GIT-04 | Run tests command  | P1       | Implemented | Auto-detect test runner and run tests          |
| GIT-05 | AI commit message  | P2       | Planned     | Generate commit message from staged diff       |
| GIT-06 | AI PR description  | P2       | Planned     | Generate PR description from branch diff       |
| GIT-07 | Git blame context  | P3       | Planned     | Include blame information in AI context        |
| GIT-08 | Diff review        | P2       | Planned     | AI review of staged changes                    |

### 3.1.8 Settings & Configuration (P0 -- Must Ship)

| ID        | Feature                    | Priority | Status      | Description                                       |
| --------- | -------------------------- | -------- | ----------- | ------------------------------------------------- |
| CONFIG-01 | API key management         | P0       | Implemented | Set/clear API key via SecretStorage               |
| CONFIG-02 | Model selection            | P0       | Implemented | Default model in settings                         |
| CONFIG-03 | API endpoint               | P0       | Implemented | Configurable API endpoint URL                     |
| CONFIG-04 | Context lines              | P1       | Implemented | Surrounding lines for context (0-500, default 50) |
| CONFIG-05 | Streaming toggle           | P1       | Implemented | Enable/disable streaming                          |
| CONFIG-06 | Inline completion settings | P1       | Implemented | Debounce, max length, enable/disable              |
| CONFIG-07 | Agent settings             | P1       | Implemented | Plan mode, max iterations                         |
| CONFIG-08 | Bridge settings            | P1       | Implemented | Enable/disable, port                              |
| CONFIG-09 | Telemetry settings         | P1       | Implemented | Enable/disable anonymous telemetry                |
| CONFIG-10 | First-run welcome          | P0       | Implemented | Welcome message with API key setup prompt         |
| CONFIG-11 | Feature validation         | P1       | Implemented | Validate feature flag combinations on change      |
| CONFIG-12 | Workspace vs user settings | P1       | Implemented | All settings support workspace-level override     |

## 3.2 VS Code-Exclusive Features

These features are only available in the VS Code extension, not in the desktop app or web app:

1. **@agi Chat Participant** -- Integrated into VS Code's native Chat panel alongside GitHub Copilot
2. **Code Actions (Lightbulb)** -- Appears in VS Code's built-in quick-fix and refactor menus
3. **Hover Quick Actions** -- Command links in hover tooltips
4. **Inline Completions** -- Ghost-text suggestions in the editor
5. **Editor Context Menus** -- Right-click actions on selected code
6. **Conversation Tree View** -- VS Code native tree view for history
7. **Status Bar Integration** -- Model name, feature chips, bridge status in VS Code status bar
8. **vscode.lm Fallback** -- Seamless fallback to VS Code's built-in Language Model API

## 3.3 Feature Parity Table vs Competitors

| Feature              | AGI Workforce                                    | GitHub Copilot Chat                | Claude Code VSC | Cline            | Continue         |
| -------------------- | ------------------------------------------------ | ---------------------------------- | --------------- | ---------------- | ---------------- |
| Chat in VS Code      | @agi + sidebar                                   | @github + panel                    | @claude + panel | Sidebar          | Sidebar          |
| Slash commands       | /explain, /fix, /refactor, /tests, /docs, /model | /explain, /fix, /tests, /new, /doc | /explain        | Various          | /edit, /comment  |
| Inline completions   | Yes (any model)                                  | Yes (GPT-4o)                       | No              | No               | Yes              |
| Code actions         | Yes                                              | Yes                                | No              | No               | No               |
| Agent mode           | Yes (multi-file)                                 | No (workspace in beta)             | Yes (limited)   | Yes              | No               |
| Plan mode            | Yes                                              | No                                 | No              | No               | No               |
| Batch undo           | Yes                                              | No                                 | No              | No               | No               |
| Model count          | 15+ (remote catalog)                             | 3-4                                | 3               | BYOK             | BYOK             |
| Auto-routing         | 3 modes                                          | None                               | None            | None             | None             |
| Desktop bridge       | Yes                                              | No                                 | No              | No               | No               |
| MCP tools            | Yes (via bridge)                                 | No                                 | Limited         | Yes              | Yes              |
| Git commands         | Yes                                              | No                                 | No              | No               | No               |
| Workspace indexing   | Yes (100 files)                                  | Built-in                           | Built-in        | Yes              | Yes              |
| Conversation history | Yes (tree view)                                  | Yes                                | Yes             | Yes              | No               |
| Free tier            | No (API key required)                            | Free (limited)                     | Free (limited)  | Free (BYOK)      | Free (BYOK)      |
| Offline mode         | Via desktop bridge + local models                | No                                 | No              | Via local models | Via local models |

---

# Section 4: Screen-by-Screen UI Specification

## 4.1 Activity Bar Icon

### 4.1.1 Purpose

Entry point to the AGI Workforce sidebar. Provides one-click access to the chat interface and conversation history.

### 4.1.2 Visual Specification

| Property           | Value                                 |
| ------------------ | ------------------------------------- |
| Icon file          | `media/icon-sidebar.svg`              |
| Icon format        | SVG, monochrome, 24x24 logical pixels |
| Activity bar ID    | `agi-workforce-sidebar`               |
| Activity bar title | "AGI Workforce"                       |
| Badge              | None (future: unread message count)   |
| Tooltip            | "AGI Workforce"                       |

### 4.1.3 State Variations

| State                   | Icon Appearance                        | Badge                  |
| ----------------------- | -------------------------------------- | ---------------------- |
| Default (no activity)   | Standard SVG icon, VS Code theme color | None                   |
| Agent running           | Standard SVG icon                      | Future: spinning badge |
| Unread response         | Standard SVG icon                      | Future: numeric badge  |
| Extension not activated | Grayed out (VS Code handles this)      | None                   |

### 4.1.4 Interaction Flows

1. **User clicks activity bar icon** --> Sidebar opens, showing the chat webview and conversation history tree view.
2. **User clicks icon again while sidebar is open** --> Sidebar closes (VS Code default behavior).
3. **User drags icon** --> Can reorder in activity bar (VS Code default behavior).

---

## 4.2 Primary Sidebar Panel -- Chat Interface

### 4.2.1 Purpose

A self-contained chat UI rendered inside a VS Code webview. Provides a direct-messaging experience for AI conversations without leaving the editor. This is the primary interface for users who prefer a sidebar workflow over the VS Code Chat panel.

### 4.2.2 Layout Description

The sidebar panel is a vertical stack with four zones:

```
+----------------------------------+
|  HEADER                          |
|  [AGI Workforce]  [Clear] [Gear] |
+----------------------------------+
|  API KEY BANNER (if no key)      |
|  [Enter your AGI Workforce       |
|   API key to start chatting]     |
|  [sk-agi-...] [Save]            |
+----------------------------------+
|                                  |
|  MESSAGES AREA                   |
|  (scrollable)                    |
|                                  |
|  [User message bubble]           |
|  [Assistant response bubble]     |
|  [User message bubble]           |
|  [Assistant response bubble]     |
|  [Typing indicator...]          |
|                                  |
+----------------------------------+
|  INPUT AREA                      |
|  Model: [auto-balanced v]        |
|  [Ask about your code...] [Send] |
+----------------------------------+
```

### 4.2.3 Component Inventory

#### Header Bar

| Component       | Type       | Label/Text       | Behavior                                                         |
| --------------- | ---------- | ---------------- | ---------------------------------------------------------------- |
| Title           | `<span>`   | "AGI Workforce"  | Static, teal color (#21808d)                                     |
| Clear button    | `<button>` | "x" (close icon) | Clears conversation, resets state                                |
| Settings button | `<button>` | Gear icon        | Opens `workbench.action.openSettings` filtered to "agiWorkforce" |

#### API Key Banner (Conditional)

| Component     | Type                      | Label/Text                                                                        | Behavior                                       |
| ------------- | ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Description   | `<p>`                     | "Enter your AGI Workforce API key to start chatting. Get one at agiworkforce.com" | Static                                         |
| API key input | `<input type="password">` | Placeholder: "sk-agi-..."                                                         | Masked input, autocomplete off, spellcheck off |
| Save button   | `<button>`                | "Save"                                                                            | Stores key via SecretStorage, hides banner     |

**Visibility logic:** Banner is `display:none` when API key exists. On webview `ready`, the extension sends `{ type: 'apiKeyStatus', payload: { hasKey: boolean } }`.

#### Messages Area

| Component         | Type                  | Styling                                          | Behavior                            |
| ----------------- | --------------------- | ------------------------------------------------ | ----------------------------------- |
| Container         | `<div id="messages">` | `flex: 1; overflow-y: auto; padding: 12px`       | Scrollable message list             |
| User message      | `.message.user`       | Dark background (#242424), right-aligned, border | User's input text                   |
| Assistant message | `.message.assistant`  | Transparent, left-aligned, teal left border      | AI response with Markdown rendering |
| Error message     | `.message.error`      | Red background, red border                       | Error text (API failures)           |
| System message    | `.message.system`     | Centered, small, secondary text                  | System notifications                |
| Typing indicator  | `.typing-indicator`   | Three animated teal dots                         | Shown while waiting for first token |

**Message rendering pipeline:**

1. User message: `textContent` (plain text, no HTML injection)
2. Assistant message during streaming: `textContent` (accumulate tokens)
3. Assistant message on `done`: `innerHTML` with custom Markdown renderer (HTML-escaped first, then Markdown patterns applied)
4. Error message: `textContent` (plain text)

#### Input Area

| Component        | Type         | Label/Text                                                                                                                                                                                                                            | Behavior                                                       |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Model label      | `<span>`     | "Model:"                                                                                                                                                                                                                              | Static, 11px, secondary text                                   |
| Model select     | `<select>`   | Options: auto-balanced, auto-economy, auto-premium, claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5, gpt-5-pro, gpt-5.2, gpt-5-nano, gemini-3-pro-preview, gemini-3-flash-preview, deepseek-r1, deepseek-chat, sonar-pro, grok-4 | Dropdown, synced with extension config                         |
| Text input       | `<textarea>` | Placeholder: "Ask about your code..."                                                                                                                                                                                                 | Auto-resize (38-140px), Enter to send, Shift+Enter for newline |
| Send/Stop button | `<button>`   | Arrow icon (idle) / Square icon (streaming)                                                                                                                                                                                           | Send message or cancel streaming                               |

**Send button states:**

- Idle: Terra cotta background (#da7756), up-arrow icon, click sends message
- Streaming: Dark background with border, square stop icon, click cancels stream
- Disabled: 40% opacity, not-allowed cursor (never actually disabled -- button toggles between send and stop)

### 4.2.4 Interaction Flows

#### Flow: Send a Message

1. User types in textarea
2. User presses Enter (or clicks Send button)
3. Message appears in messages area as `.message.user`
4. Typing indicator appears (three animated dots)
5. Send button changes to stop icon
6. Textarea is disabled
7. Tokens stream in, accumulating in `.message.assistant` element
8. On completion: Markdown rendering applied to final response
9. Textarea re-enabled, send button returns to arrow icon
10. Conversation persisted to ConversationStore

#### Flow: Cancel Streaming

1. User clicks stop button during streaming
2. Extension sends cancellation signal to API
3. Partial response is kept and Markdown-rendered
4. UI returns to idle state

#### Flow: Set API Key (First Run)

1. Sidebar opens, extension checks SecretStorage
2. No key found: API key banner is shown
3. User types key into masked input
4. User clicks Save (or presses Enter)
5. Extension stores key via SecretStorage
6. Banner hides, user can start chatting
7. Informational toast: "AGI Workforce API key saved."

#### Flow: Clear Conversation

1. User clicks clear button (x icon in header)
2. Messages area is reset to initial system message: "Conversation cleared. Ask anything about your code."
3. Internal state is reset (streaming stopped, assistant element cleared)

### 4.2.5 Design Tokens

The sidebar webview uses custom CSS variables matching the AGI Workforce brand:

| Token              | Value                           | Usage                                                  |
| ------------------ | ------------------------------- | ------------------------------------------------------ |
| `--bg-base`        | `#0f0f0f`                       | Body background                                        |
| `--bg-elevated`    | `#1a1a1a`                       | Header, input area                                     |
| `--bg-overlay`     | `#242424`                       | User messages, model select                            |
| `--accent-teal`    | `#21808d`                       | Title color, assistant border, focus ring, typing dots |
| `--accent-terra`   | `#da7756`                       | Send button                                            |
| `--text-primary`   | `rgba(255, 255, 255, 0.92)`     | Body text                                              |
| `--text-secondary` | `rgba(255, 255, 255, 0.55)`     | Labels, placeholders                                   |
| `--border`         | `rgba(255, 255, 255, 0.07)`     | Dividers, input borders                                |
| `--radius-md`      | `8px`                           | Messages, input, buttons                               |
| `--radius-lg`      | `12px`                          | Not currently used (reserved)                          |
| `--transition`     | `cubic-bezier(0.16, 1, 0.3, 1)` | Animations                                             |

### 4.2.6 Content Security Policy

The webview enforces a strict CSP:

```
default-src 'none';
style-src 'nonce-${nonce}';
script-src 'nonce-${nonce}';
img-src ${cspSource} https: data:;
font-src ${cspSource};
```

All inline scripts and styles use a cryptographic nonce. No `eval()`, no external script loading.

### 4.2.7 Webview-Extension Communication Protocol

**Webview to Extension:**

| Message Type   | Payload                            | Trigger                                  |
| -------------- | ---------------------------------- | ---------------------------------------- |
| `sendMessage`  | `{ text: string, model?: string }` | User sends a chat message                |
| `setApiKey`    | `{ key: string }`                  | User saves API key in banner             |
| `clearApiKey`  | (none)                             | User clears API key                      |
| `ready`        | (none)                             | Webview finished loading                 |
| `getModel`     | (none)                             | Webview requests current model           |
| `openSettings` | (none)                             | User clicks settings gear                |
| `cancel`       | (none)                             | User clicks stop button during streaming |

**Extension to Webview:**

| Message Type   | Payload               | Trigger                           |
| -------------- | --------------------- | --------------------------------- |
| `token`        | `{ text: string }`    | Streaming token received from API |
| `done`         | (none)                | Streaming complete                |
| `error`        | `{ message: string }` | API error or network failure      |
| `apiKeyStatus` | `{ hasKey: boolean }` | On ready or after key change      |
| `model`        | `{ model: string }`   | Current model configuration       |

---

## 4.3 Conversation History Tree View

### 4.3.1 Purpose

A native VS Code tree view showing past conversations, displayed below the chat webview in the sidebar. Supports click-to-open, delete, and refresh.

### 4.3.2 Layout Description

```
+----------------------------------+
|  History                   [Ref] |
+----------------------------------+
|  > Fix the authentication bug    |
|    2h ago                        |
|  > Explain the router module     |
|    5h ago                        |
|  > Generate API tests            |
|    1d ago                        |
|  > Refactor database layer       |
|    3d ago                        |
+----------------------------------+
```

### 4.3.3 Component Inventory

| Component             | Type                               | Description                                                       |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| View container        | `views` in `agi-workforce-sidebar` | Native tree view                                                  |
| View ID               | `agi-workforce.conversations`      | Registered in extension manifest                                  |
| View title            | "History"                          | Shown in view header                                              |
| Refresh button        | Title bar action                   | Icon: `$(refresh)`, triggers `agi-workforce.refreshConversations` |
| Tree item             | `ConversationTreeItem`             | Extends `vscode.TreeItem`                                         |
| Tree item icon        | `$(comment)`                       | Theme icon for each conversation                                  |
| Tree item label       | Conversation title                 | First 60 characters of first user message                         |
| Tree item description | Relative time                      | "just now", "2h ago", "3d ago", etc.                              |
| Tree item tooltip     | First 120 chars of first message   | Preview on hover                                                  |
| Context menu: Open    | Inline button                      | `$(comment)` icon, opens conversation in new tab                  |
| Context menu: Delete  | Inline button                      | `$(trash)` icon, deletes with confirmation                        |

### 4.3.4 State Variations

| State                 | Appearance                                         |
| --------------------- | -------------------------------------------------- |
| No conversations      | Empty tree view (VS Code shows "No items" message) |
| 1-50 conversations    | Flat list sorted by updatedAt descending           |
| Over 50 conversations | Oldest automatically pruned by ConversationStore   |

### 4.3.5 Interaction Flows

#### Flow: Open a Conversation

1. User clicks a conversation in the tree view
2. Command `agi-workforce.openConversation` fires with conversation ID
3. Conversation is loaded from ConversationStore
4. A new untitled Markdown document is created with conversation content:

   ```markdown
   # Fix the authentication bug

   _Model: claude-sonnet-4.6 - 4 messages_

   **You**

   Fix the authentication bug in auth.ts

   **AGI Workforce**

   I found the issue...
   ```

5. Document opens in a preview tab

#### Flow: Delete a Conversation

1. User clicks the trash icon on a conversation item
2. Modal confirmation: "Delete conversation 'Fix the authentication bug'?"
3. Options: "Delete" / Cancel
4. If confirmed: conversation removed from ConversationStore, tree view refreshed
5. If cancelled: no action

#### Flow: Refresh Conversations

1. User clicks refresh icon in view title bar
2. ConversationTreeProvider fires `onDidChangeTreeData`
3. Tree view re-renders with current ConversationStore data

### 4.3.6 Data Model

```typescript
interface StoredConversation {
  id: string; // Base-36 timestamp + random suffix
  title: string; // First 60 chars of first user message
  messages: StoredMessage[];
  model: string; // Model used for this conversation
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp (updated on each message)
}

interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

---

## 4.4 Status Bar Items

### 4.4.1 Model Status Bar Item

| Property         | Value                                    |
| ---------------- | ---------------------------------------- |
| Priority         | 100 (right side, high priority)          |
| Alignment        | Right                                    |
| Command on click | `agi-workforce.selectModel`              |
| Tooltip          | "AGI Workforce -- click to change model" |

**Text format:** `$(hubot) AGI: {model}` or `$(hubot) AGI: {model} . {chips}`

**Chip indicators:**

- `plan` -- when `agiWorkforce.agent.planMode` is true
- `mcp` -- when `agiWorkforce.mcp.enabled` is true
- `bridge:{port}` -- when `agiWorkforce.desktopBridge.enabled` is true

**Examples:**

- `$(hubot) AGI: auto-balanced`
- `$(hubot) AGI: claude-opus-4.6 . plan . mcp . bridge:8787`
- `$(hubot) AGI: gpt-5.2 . bridge:8787`

### 4.4.2 Agent Status Bar Item

| Property         | Value                               |
| ---------------- | ----------------------------------- |
| Priority         | 95 (to the left of model indicator) |
| Alignment        | Right                               |
| Command on click | `agi-workforce.showAgentStatus`     |
| Tooltip          | "AGI Workforce -- Agent Status"     |

**State text:**

- Running: `$(sync~spin) {N} agent{s} running`
- Idle: `$(check) Agents idle`

**Visibility:** Always shown once AgentStatusService is started.

### 4.4.3 Bridge Status Bar Item

| Property         | Value                                |
| ---------------- | ------------------------------------ |
| Priority         | 90 (to the left of agent status)     |
| Alignment        | Right                                |
| Command on click | `agi-workforce.syncContextToDesktop` |
| Tooltip          | Dynamic based on status              |

**State text:**

- Connected: `$(plug) AGI Bridge: connected`
- Connecting: `$(sync~spin) AGI Bridge: connecting...`
- Offline: `$(warning) AGI Bridge: offline`

**Visibility:** Only shown when `agiWorkforce.desktopBridge.enabled` is true.

**Background color:** Warning background (`statusBarItem.warningBackground`) when offline, default otherwise.

---

## 4.5 Agent Mode Panel

### 4.5.1 Purpose

A dedicated webview panel (full editor tab, not sidebar) for autonomous agent mode. The agent can read workspace files, suggest multi-file edits with diff previews, and apply them with batch undo support.

### 4.5.2 Layout Description

```
+--------------------------------------------------+
|  HEADER                                          |
|  [AGI Agent Mode] [PLAN badge?]        [Clear]   |
+--------------------------------------------------+
|                                                  |
|  MESSAGES AREA                                   |
|  (scrollable)                                    |
|                                                  |
|  [You] What needs to change in the auth module?  |
|  [Agent] Let me read the relevant files first... |
|  [System] Read 3 file(s): auth.ts, login.ts...  |
|  [Agent] Here are my proposed changes...         |
|  [System] Edits applied to: auth.ts, login.ts   |
|           [Undo Batch]                           |
|                                                  |
+--------------------------------------------------+
|  [Agent is thinking...] (when active)            |
+--------------------------------------------------+
|  INPUT AREA                                      |
|  [Ask the agent to read, analyze,     ] [Send]   |
|  [or edit files...                     ]          |
+--------------------------------------------------+
```

### 4.5.3 Component Inventory

#### Header

| Component       | Type       | Label            | Behavior                                |
| --------------- | ---------- | ---------------- | --------------------------------------- |
| Title           | `<h2>`     | "AGI Agent Mode" | 14px, font-weight 600                   |
| Plan mode badge | `<span>`   | "PLAN"           | Blue badge, shown when plan mode active |
| Clear button    | `<button>` | "Clear"          | Clears conversation and edit history    |

#### Messages Area

| Component      | Type                 | Styling                                                | Notes                   |
| -------------- | -------------------- | ------------------------------------------------------ | ----------------------- |
| User message   | `.message.user`      | VS Code input background + border                      | Label: "You"            |
| Agent message  | `.message.assistant` | VS Code blockquote background + link-color left border | Label: "Agent"          |
| System message | `.message.system`    | VS Code info background + italic                       | Label: "System"         |
| Error message  | `.message.error`     | VS Code error background + error border                | Label: "Error"          |
| Undo button    | `.undo-btn`          | VS Code secondary button styling                       | "Undo Batch", per-batch |

#### Thinking Indicator

| Component     | Type                     | Label                  | Behavior                                    |
| ------------- | ------------------------ | ---------------------- | ------------------------------------------- |
| Thinking text | `<div class="thinking">` | "Agent is thinking..." | Italic, 12px, shown/hidden via class toggle |

#### Input Area

| Component   | Type         | Label                                                           | Behavior                                           |
| ----------- | ------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| Textarea    | `<textarea>` | Placeholder: "Ask the agent to read, analyze, or edit files..." | Auto-resize (36-120px), Enter to send              |
| Send button | `<button>`   | "Send"                                                          | VS Code primary button, disabled during processing |

### 4.5.4 Agent Interaction Protocol

The agent communicates through structured text patterns in its responses:

**File read request:**

```
@read path/to/file.ts
```

**File edit request:**

````
```edit:path/to/file.ts
<complete new file content>
```
````

**Agent continuation flow:**

1. User sends message
2. Agent may request file reads (`@read`)
3. Extension reads files, feeds content back to agent
4. Agent processes and may suggest edits (`\`\`\`edit:`)
5. Extension shows diff preview for each file
6. User: "Apply All" or "Cancel"
7. If applied: WorkspaceEdit applied, batch recorded in history
8. Agent may auto-continue after reading files (governed by iteration limit)

### 4.5.5 Diff Preview

When the agent suggests file edits, each file is shown in VS Code's built-in diff viewer:

| Property            | Value                             |
| ------------------- | --------------------------------- |
| Original URI scheme | `agi-original`                    |
| Modified URI scheme | `agi-modified`                    |
| Tab title           | `AGI Agent: {filePath} (Preview)` |
| Mode                | Preview (temporary tab)           |

Content providers are registered in the constructor to supply original and modified content for the virtual documents.

### 4.5.6 Iteration Limit UX

When the agent reaches the configured maximum iterations:

1. Warning dialog (non-modal): "AGI Workforce Agent has reached {N} autonomous iterations. Continue running? This may consume significant API credits."
2. Options: "Continue" / "Stop"
3. If "Continue": counter resets to 1, agent gets another N iterations
4. If "Stop": system message shown, agent halts

### 4.5.7 Plan Mode Badge

When `agiWorkforce.agent.planMode` changes:

1. Extension sends `{ type: 'planModeChanged', enabled: boolean }` to webview
2. If enabled: blue badge appended to header h2 element
   - Text: "PLAN"
   - Style: `background: var(--vscode-badge-background)`, `border-radius: 10px`, `font-size: 11px`
   - Tooltip: "Plan Mode active -- agent will propose a plan before editing"
3. If disabled: badge removed

### 4.5.8 Plan Mode System Prompt Addition

When plan mode is active, this is appended to the system prompt:

> PLAN MODE is active: Before making any edits, first output a numbered plan describing all changes you intend to make. Wait for the user to confirm before applying any edits.

---

## 4.6 Command Palette Commands

All commands registered in the extension and their complete specification:

### 4.6.1 Primary Commands

| Command ID                    | Palette Title                    | Icon                    | Keybinding (macOS) | Keybinding (Win/Linux) | When Clause          | Description                                                      |
| ----------------------------- | -------------------------------- | ----------------------- | ------------------ | ---------------------- | -------------------- | ---------------------------------------------------------------- |
| `agi-workforce.chat`          | AGI Workforce: Open Chat         | `$(comment-discussion)` | `Cmd+Shift+A`      | `Ctrl+Shift+A`         | `!terminalFocus`     | Opens VS Code Chat panel (fallback: Copilot panel, then sidebar) |
| `agi-workforce.agentMode`     | AGI Workforce: Agent Mode        | `$(robot)`              | `Cmd+Shift+Alt+G`  | `Ctrl+Shift+Alt+G`     | (always)             | Opens/reveals the Agent Mode webview panel                       |
| `agi-workforce.explain`       | AGI Workforce: Explain Selection | `$(info)`               | `Cmd+Shift+Alt+E`  | `Ctrl+Shift+Alt+E`     | `editorHasSelection` | Explains selected code in a new tab                              |
| `agi-workforce.fix`           | AGI Workforce: Fix Issue         | `$(wrench)`             | (none)             | (none)                 | `editorTextFocus`    | Fixes bugs/errors in selected code                               |
| `agi-workforce.refactor`      | AGI Workforce: Refactor Code     | `$(symbol-class)`       | (none)             | (none)                 | (none)               | Refactors selected code with explanations                        |
| `agi-workforce.generateTests` | AGI Workforce: Generate Tests    | `$(beaker)`             | (none)             | (none)                 | (none)               | Generates unit tests for selected code                           |

### 4.6.2 Configuration Commands

| Command ID                  | Palette Title                | Icon             | Description                                             |
| --------------------------- | ---------------------------- | ---------------- | ------------------------------------------------------- |
| `agi-workforce.setApiKey`   | AGI Workforce: Set API Key   | `$(key)`         | Opens password input box, stores key in SecretStorage   |
| `agi-workforce.clearApiKey` | AGI Workforce: Clear API Key | `$(trash)`       | Modal confirmation, then deletes key from SecretStorage |
| `agi-workforce.selectModel` | AGI Workforce: Select Model  | `$(symbol-misc)` | Opens QuickPick with 15+ models, updates global config  |

### 4.6.3 Conversation Commands

| Command ID                           | Palette Title                        | Icon         | Description                                         |
| ------------------------------------ | ------------------------------------ | ------------ | --------------------------------------------------- |
| `agi-workforce.openConversation`     | AGI Workforce: Open Conversation     | `$(comment)` | Opens a past conversation in a Markdown preview tab |
| `agi-workforce.deleteConversation`   | AGI Workforce: Delete Conversation   | `$(trash)`   | Deletes a conversation after modal confirmation     |
| `agi-workforce.refreshConversations` | AGI Workforce: Refresh Conversations | `$(refresh)` | Refreshes the conversation tree view                |

### 4.6.4 Desktop Bridge Commands

| Command ID                           | Palette Title                                    | Icon        | Description                                           |
| ------------------------------------ | ------------------------------------------------ | ----------- | ----------------------------------------------------- |
| `agi-workforce.sendToDesktop`        | AGI Workforce: Send Code to Desktop Agent        | `$(export)` | Sends active file or selection to desktop app         |
| `agi-workforce.syncContextToDesktop` | AGI Workforce: Sync Workspace Context to Desktop | `$(sync)`   | Shares workspace folders and active file with desktop |
| `agi-workforce.triggerAgentAction`   | AGI Workforce: Trigger Agent Action on Desktop   | `$(play)`   | Opens QuickPick: open-chat, run-task, open-tool       |

### 4.6.5 Git/Development Commands

| Command ID       | Palette Title   | Icon                | Description                                                             |
| ---------------- | --------------- | ------------------- | ----------------------------------------------------------------------- |
| `agi.git.status` | AGI: Git Status | `$(source-control)` | Opens terminal, runs `git status`                                       |
| `agi.git.diff`   | AGI: Git Diff   | `$(diff)`           | Opens terminal, runs `git diff`                                         |
| `agi.git.commit` | AGI: Git Commit | `$(git-commit)`     | Prompts for message, runs `git add -u && git commit`                    |
| `agi.test.run`   | AGI: Run Tests  | `$(beaker)`         | Auto-detects test runner (npm/pnpm/yarn/cargo/pytest), runs in terminal |

### 4.6.6 Internal Commands (Not in Palette)

| Command ID                      | Description                  | Trigger                     |
| ------------------------------- | ---------------------------- | --------------------------- |
| `agi-workforce.showAgentStatus` | Shows agent status QuickPick | Click agent status bar item |
| `agi-workforce.sidebar.focus`   | Focuses the sidebar webview  | Fallback for chat command   |

### 4.6.7 Planned Commands (Not Yet Implemented)

| Command ID                        | Palette Title                      | Priority | Description                                   |
| --------------------------------- | ---------------------------------- | -------- | --------------------------------------------- |
| `agi-workforce.newChat`           | AGI Workforce: New Chat            | P1       | Start a fresh conversation in sidebar         |
| `agi-workforce.askAboutSelection` | AGI Workforce: Ask About Selection | P1       | Open chat with selection pre-filled           |
| `agi-workforce.compareModels`     | AGI Workforce: Compare Models      | P2       | Send prompt to multiple models simultaneously |
| `agi-workforce.insertSnippet`     | AGI Workforce: Insert Snippet      | P2       | Generate and insert a code snippet at cursor  |
| `agi-workforce.viewAgentHistory`  | AGI Workforce: View Agent History  | P2       | Show past agent sessions and edit batches     |
| `agi-workforce.startAgent`        | AGI Workforce: Start Agent         | P2       | Quick-start agent mode with pre-filled task   |
| `agi-workforce.openSettings`      | AGI Workforce: Open Settings       | P1       | Direct link to extension settings             |
| `agi-workforce.switchModel`       | AGI Workforce: Switch Model        | P1       | Alias for selectModel                         |

---

## 4.7 Editor Context Menu Items

Right-click context menu in the editor provides four AI actions when text is selected:

### 4.7.1 Menu Group

All items are in the `agi-workforce` menu group, which appears as a section separator in the context menu.

| Menu Item         | Command                       | When Clause          | Group Order       |
| ----------------- | ----------------------------- | -------------------- | ----------------- |
| Explain Selection | `agi-workforce.explain`       | `editorHasSelection` | `agi-workforce@1` |
| Fix Issue         | `agi-workforce.fix`           | `editorHasSelection` | `agi-workforce@2` |
| Refactor Code     | `agi-workforce.refactor`      | `editorHasSelection` | `agi-workforce@3` |
| Generate Tests    | `agi-workforce.generateTests` | `editorHasSelection` | `agi-workforce@4` |

### 4.7.2 Context Menu Behavior

1. User selects code in the editor
2. User right-clicks to open context menu
3. Four AGI Workforce items appear in a grouped section
4. User clicks one of the items
5. Progress notification appears: "AGI Workforce: {Command Label}..."
6. On completion: result shown via `applyLlmEdit` (inline apply or new tab)

---

## 4.8 Code Actions (Lightbulb)

### 4.8.1 Quick Fix Actions (on Diagnostics)

When the editor shows a diagnostic error (red squiggly), the lightbulb menu includes:

| Action                 | Kind       | Command             | Preferred             |
| ---------------------- | ---------- | ------------------- | --------------------- |
| Fix with AGI Workforce | `QuickFix` | `agi-workforce.fix` | No (not auto-applied) |

The action includes the diagnostic information, allowing the LLM to see the specific error.

### 4.8.2 Refactor Actions (on Selection)

When text is selected, the lightbulb/refactor menu includes:

| Action                            | Kind       | Command                       |
| --------------------------------- | ---------- | ----------------------------- |
| Refactor with AGI Workforce       | `Refactor` | `agi-workforce.refactor`      |
| Explain with AGI Workforce        | `Empty`    | `agi-workforce.explain`       |
| Generate Tests with AGI Workforce | `Empty`    | `agi-workforce.generateTests` |

---

## 4.9 Hover Quick Actions

### 4.9.1 Specification

When `agiWorkforce.hoverEnabled` is true (default: false):

| Property    | Value                                              |
| ----------- | -------------------------------------------------- |
| Trigger     | Hovering over any identifier (word)                |
| Content     | Markdown string with command links                 |
| Display     | "**AGI Workforce** -- [Explain] . [Fix] . [Tests]" |
| Icons       | `$(info)`, `$(wrench)`, `$(beaker)`                |
| Trust level | `isTrusted: true`, `supportThemeIcons: true`       |

### 4.9.2 Exact Markdown Content

```markdown
**AGI Workforce** — [$(info) Explain](command:agi-workforce.explain 'Explain this code') · [$(wrench) Fix](command:agi-workforce.fix 'Fix issues in selection') · [$(beaker) Tests](command:agi-workforce.generateTests 'Generate tests')
```

---

## 4.10 Inline Completions (Ghost Text)

### 4.10.1 Specification

When `agiWorkforce.inlineCompletions.enabled` is true (default: false):

| Property | Value                               |
| -------- | ----------------------------------- |
| Provider | `AgiInlineCompletionProvider`       |
| Pattern  | `**` (all files)                    |
| Trigger  | User pauses typing (debounced)      |
| Display  | VS Code ghost text (grayed, inline) |
| Accept   | Tab key                             |
| Dismiss  | Continue typing or Escape           |

### 4.10.2 Smart Filtering Rules

The provider does not fire a request when:

1. Line prefix has fewer than 3 characters (ignoring whitespace)
2. Cursor is in the middle of non-whitespace text (suffix is not empty after trimming)
3. Previous request is still debouncing
4. Cached result matches current context (within 15s TTL)

### 4.10.3 Context Window

| Context                | Lines          | Purpose                    |
| ---------------------- | -------------- | -------------------------- |
| Prefix (before cursor) | Up to 80 lines | Primary completion context |
| Suffix (after cursor)  | Up to 20 lines | Fill-in-the-middle context |

### 4.10.4 Response Processing

1. LLM response received
2. `extractCompletionText()` strips Markdown fences
3. First non-empty line extracted if no fenced block
4. Truncated to `maxLength` setting (default 500)
5. Cached with position-based key
6. Returned as `InlineCompletionItem`

---

## 4.11 Model Selector QuickPick

### 4.11.1 Specification

Triggered by: `agi-workforce.selectModel` command or clicking status bar item.

| Property    | Value                           |
| ----------- | ------------------------------- |
| Title       | "AGI Workforce -- Select Model" |
| Placeholder | "Current: {currentModel}"       |
| Match on    | Description and detail          |

### 4.11.2 Model List

| Model ID                 | Description                          | Detail                                                           | Tier    |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------- | ------- |
| `auto-balanced`          | Smart routing -- best model per task | Recommended: AGI Workforce picks the optimal model automatically | Auto    |
| `auto-economy`           | Smart routing -- fastest & cheapest  | Best for quick questions and simple tasks                        | Auto    |
| `auto-premium`           | Smart routing -- highest quality     | Best for complex reasoning and long contexts                     | Auto    |
| `claude-opus-4.6`        | Anthropic -- flagship reasoning      | Max tier -- best for complex architecture, long contexts         | Max     |
| `claude-sonnet-4.6`      | Anthropic -- best all-rounder        | Pro tier -- excellent for most coding tasks                      | Pro     |
| `claude-haiku-4.5`       | Anthropic -- ultra-fast              | Economy -- ideal for quick completions                           | Economy |
| `gpt-5-pro`              | OpenAI -- flagship                   | Max tier -- OpenAI's most capable model                          | Max     |
| `gpt-5.2`                | OpenAI -- mid-tier general           | Pro tier -- great for general coding                             | Pro     |
| `gpt-5-nano`             | OpenAI -- ultra-fast & cheap         | Economy -- best OpenAI speed/cost ratio                          | Economy |
| `gemini-3-pro-preview`   | Google -- strong all-rounder         | Pro tier -- multimodal, long context                             | Pro     |
| `gemini-3-flash-preview` | Google -- fast                       | Economy -- very fast Google model                                | Economy |
| `deepseek-r1`            | DeepSeek -- reasoning                | Max tier -- strong at algorithmic problems                       | Max     |
| `deepseek-chat`          | DeepSeek -- balanced                 | Pro tier -- cost-effective                                       | Pro     |
| `sonar-pro`              | Perplexity -- search + reasoning     | Pro tier -- web search integrated                                | Pro     |
| `grok-4`                 | xAI -- flagship                      | Max tier -- xAI's best model                                     | Max     |

The current model is marked with `picked: true`.

### 4.11.3 Remote Model Catalog

The extension also supports a remote model catalog that supplements the hardcoded list:

1. On first use (or cache miss): fetch `GET {baseUrl}/api/models`
2. Parse `ApiModelsResponse` containing all available models
3. Filter to `chat`, `code`, `reasoning`, `other` categories
4. Convert to `CatalogModel` with provider label and tier
5. Cache in `globalState` with 1-hour TTL
6. On network failure: use stale cache, then fall back to hardcoded list
7. Auto-routing modes are always prepended regardless of fetch result

---

## 4.12 Agent Status QuickPick

### 4.12.1 Specification

Triggered by: clicking the agent status bar item.

| Property    | Value                          |
| ----------- | ------------------------------ |
| Title       | "AGI Workforce - Agent Status" |
| Placeholder | "{N} session{s}"               |
| Match on    | Description and detail         |

### 4.12.2 Session Item Format

| Field       | Content                           |
| ----------- | --------------------------------- |
| Label       | `{statusIcon} {session.name}`     |
| Description | `{status}{progress%} - {elapsed}` |
| Detail      | Current action or error message   |

**Status icons:**

- Running: `$(sync~spin)`
- Completed: `$(check)`
- Failed: `$(error)`
- Paused: `$(debug-pause)`
- Cancelled: `$(close)`

**Elapsed time format:**

- `<60s`: `{N}s`
- `<60m`: `{N}m`
- `>=60m`: `{N}h {M}m`

### 4.12.3 Empty State

When no agent sessions exist:

Information message: "AGI Workforce: No agent sessions to show."

### 4.12.4 Refresh Action

A "$(refresh) Refresh" item is appended at the bottom of the list. Clicking it triggers a fresh poll.

---

## 4.13 Trigger Agent Action QuickPick

### 4.13.1 Specification

Triggered by: `agi-workforce.triggerAgentAction` command.

| Property    | Value                                            |
| ----------- | ------------------------------------------------ |
| Title       | "AGI Workforce -- Trigger Agent Action"          |
| Placeholder | "Select an action to trigger on the desktop app" |

### 4.13.2 Action List

| Label       | Description                                         | Parameters                      |
| ----------- | --------------------------------------------------- | ------------------------------- |
| `open-chat` | Open the AGI Workforce chat panel on the desktop    | None                            |
| `run-task`  | Trigger an autonomous task run on the desktop agent | Task description (via InputBox) |
| `open-tool` | Open a specific tool in the desktop app             | None                            |

### 4.13.3 Task Description Input

When "run-task" is selected:

| Property    | Value                                                      |
| ----------- | ---------------------------------------------------------- |
| Title       | "AGI Workforce -- Task Description"                        |
| Prompt      | "Describe the task for the desktop agent to run"           |
| Placeholder | "e.g. Summarize the open project and suggest improvements" |
| Validation  | Non-empty required                                         |

---

## 4.14 Progress Notifications

### 4.14.1 Inline Command Progress

When an inline command (explain, fix, refactor, tests) is running:

| Property    | Value                               |
| ----------- | ----------------------------------- |
| Location    | `ProgressLocation.Notification`     |
| Title       | "AGI Workforce: {Command Label}..." |
| Cancellable | Yes                                 |
| Duration    | Until API response completes        |

**Examples:**

- "AGI Workforce: Explain Code..."
- "AGI Workforce: Fix Issues..."
- "AGI Workforce: Refactor..."
- "AGI Workforce: Generate Tests..."

### 4.14.2 Agent Completion/Failure Notifications

When an agent session transitions from running to completed/failed:

- **Completed**: Information message: `AGI Workforce: Agent "{name}" completed successfully.`
- **Failed**: Warning message: `AGI Workforce: Agent "{name}" failed{errorSuffix}`

---

## 4.15 Error and Information Notifications

### 4.15.1 Error Messages

All error messages follow the pattern: `AGI Workforce: {friendly message}`. Raw error details are never shown to the user. Actionable buttons are included where appropriate.

| Scenario               | Message                                                                  | Actions              |
| ---------------------- | ------------------------------------------------------------------------ | -------------------- |
| No API key             | "No AGI Workforce API key configured. Run 'AGI Workforce: Set API Key'." | "Set API Key" button |
| API error              | "AGI Workforce error: {sanitized message}"                               | "Set API Key" button |
| Bridge not connected   | "AGI Workforce: Desktop bridge is not connected. Enable it in settings." | None                 |
| No active editor       | "AGI Workforce: No active editor. Open a file first."                    | None                 |
| No selection           | "AGI Workforce: Select some code first."                                 | None                 |
| No code to send        | "AGI Workforce: No code to send."                                        | None                 |
| Code send failed       | "AGI Workforce: {error}"                                                 | None                 |
| Context sync failed    | "AGI Workforce: {error}"                                                 | None                 |
| Agent action failed    | "AGI Workforce: Failed to trigger action '{action}'."                    | None                 |
| No workspace           | "No workspace open"                                                      | None                 |
| Conversation not found | "AGI Workforce: Conversation not found."                                 | None                 |

### 4.15.2 Information Messages

| Scenario          | Message                                                   | Actions                            |
| ----------------- | --------------------------------------------------------- | ---------------------------------- |
| API key saved     | "AGI Workforce API key saved."                            | "Open Chat" button                 |
| API key cleared   | "AGI Workforce API key cleared."                          | None                               |
| Model changed     | "AGI Workforce model set to: {model}"                     | None                               |
| Code sent         | "AGI Workforce: Code sent to desktop agent."              | None                               |
| Context synced    | "AGI Workforce: Workspace context synced to desktop."     | None                               |
| Agent action sent | "AGI Workforce: Agent action '{action}' sent to desktop." | None                               |
| Edit applied      | "AGI Workforce: Apply {command} result?"                  | "Apply Inline" / "View in New Tab" |

### 4.15.3 Warning Messages

| Scenario                       | Message                                                                       | Modal |
| ------------------------------ | ----------------------------------------------------------------------------- | ----- |
| Clear API key                  | "Clear the stored AGI Workforce API key?"                                     | Yes   |
| Delete conversation            | "Delete conversation '{title}'?"                                              | Yes   |
| Agent edits proposed           | "AGI Agent proposes edits to {N} file(s): {files}"                            | Yes   |
| Iteration limit reached        | "AGI Workforce Agent has reached {N} autonomous iterations..."                | No    |
| MCP without bridge             | "AGI Workforce MCP is enabled, but desktop bridge is disabled..."             | No    |
| Bridge init failed             | "AGI Workforce: Desktop bridge failed to initialize -- {error}."              | No    |
| Inline completions without key | "AGI Workforce inline completions are enabled, but no API key is configured." | No    |

---

## 4.16 First-Run Experience

### 4.16.1 Flow

1. Extension activates on VS Code startup (`onStartupFinished`)
2. Check `globalState['agiWorkforce.shownWelcome']`
3. If false: check SecretStorage for API key
4. If no key: show welcome message
5. Information message: "Welcome to AGI Workforce! Set up your API key to use GPT-4o, Claude, Gemini, and more in VS Code."
6. Actions: "Set API Key" / "Later"
7. If "Set API Key": opens password input box
8. Set `globalState['agiWorkforce.shownWelcome'] = true`
9. Welcome is never shown again

---

# Section 5: Component Architecture

## 5.1 Extension Manifest Structure

The `package.json` `contributes` section defines the extension's VS Code integration points:

### 5.1.1 Commands (20 registered)

```
agi-workforce.chat
agi-workforce.agentMode
agi-workforce.explain
agi-workforce.fix
agi-workforce.refactor
agi-workforce.generateTests
agi-workforce.setApiKey
agi-workforce.clearApiKey
agi-workforce.selectModel
agi-workforce.openConversation
agi-workforce.deleteConversation
agi-workforce.refreshConversations
agi-workforce.sendToDesktop
agi-workforce.syncContextToDesktop
agi-workforce.triggerAgentAction
agi.git.status
agi.git.diff
agi.git.commit
agi.test.run
agi-workforce.showAgentStatus (internal)
```

### 5.1.2 Chat Participants

One participant registered:

```json
{
  "id": "agiworkforce.agi",
  "name": "agi",
  "fullName": "AGI Workforce",
  "description": "Model-agnostic AI assistant -- use any LLM",
  "isSticky": true,
  "commands": ["explain", "fix", "refactor", "tests", "docs", "model"]
}
```

### 5.1.3 Views

Activity bar container: `agi-workforce-sidebar`

Views within the container:

1. `agi-workforce.sidebar` (webview) -- Chat interface
2. `agi-workforce.conversations` (tree) -- Conversation history

### 5.1.4 Configuration

16 settings under `agiWorkforce.*` namespace (detailed in Section 4 and Section 7).

### 5.1.5 Keybindings

3 keybindings:

- `Cmd+Shift+A` / `Ctrl+Shift+A`: Open Chat
- `Cmd+Shift+Alt+E` / `Ctrl+Shift+Alt+E`: Explain Selection
- `Cmd+Shift+Alt+G` / `Ctrl+Shift+Alt+G`: Agent Mode

### 5.1.6 Menus

- `editor/context`: 4 items (explain, fix, refactor, tests) -- conditional on `editorHasSelection`
- `view/item/context`: 2 items (open, delete) for conversation tree items
- `view/title`: 1 item (refresh) for conversation tree view
- `commandPalette`: 2 items with when clauses

## 5.2 Source Code Module Map

```
src/
  extension.ts                          # Entry point: activate() and deactivate()
  providers/
    chatParticipant.ts                  # @agi chat participant (VS Code Chat panel)
    sidebarProvider.ts                  # Sidebar webview panel
    agentModeProvider.ts                # Agent mode webview panel (editor tab)
    codeActionProvider.ts               # Lightbulb quick-fix/refactor actions
    hoverProvider.ts                    # Hover quick actions
    inlineCompletionProvider.ts         # Ghost-text inline completions
    conversationTreeProvider.ts         # Conversation history tree view
  services/
    agentStatus.ts                      # Agent session status monitoring
    desktopBridge.ts                    # Desktop app WebSocket/HTTP bridge
    modelCatalog.ts                     # Remote model catalog fetch + cache
    telemetry.ts                        # Anonymous usage telemetry
    workspaceIndexer.ts                 # Workspace file/symbol indexer
  storage/
    conversationStore.ts                # Conversation persistence (globalState)
  utils/
    api.ts                              # HTTP client for AGI Workforce LLM API
    applyEdit.ts                        # LLM response -> WorkspaceEdit application
  __tests__/
    __mocks__/vscode.ts                 # VS Code API mock for unit tests
    vscode.mock.ts                      # Alternative VS Code mock
    extension.test.ts                   # Extension activation tests
    chatParticipant.test.ts             # Chat participant tests
    codeActionProvider.test.ts          # Code action tests
    hoverProvider.test.ts               # Hover provider tests
    inlineCompletionProvider.test.ts    # Inline completion tests
    conversationStore.test.ts           # Conversation storage tests
    conversationTreeProvider.test.ts    # Tree provider tests
    applyEdit.test.ts                   # Edit application tests
    desktopBridge.test.ts               # Desktop bridge tests
    workspaceIndexer.test.ts            # Workspace indexer tests
    api.test.ts                         # API client tests
```

## 5.3 Component Dependency Graph

```
extension.ts (entry point)
  |
  +-- telemetry.ts (fire-and-forget, non-blocking)
  |
  +-- desktopBridge.ts (singleton, WebSocket + HTTP)
  |     |
  |     +-- agentStatus.ts (polls bridge or API gateway)
  |
  +-- conversationStore.ts (globalState persistence)
  |     |
  |     +-- conversationTreeProvider.ts (TreeDataProvider)
  |
  +-- chatParticipant.ts (VS Code Chat API)
  |     |
  |     +-- api.ts (HTTP client)
  |     +-- conversationStore.ts (persist conversations)
  |
  +-- sidebarProvider.ts (WebviewViewProvider)
  |     |
  |     +-- api.ts (HTTP client)
  |     +-- conversationStore.ts (persist conversations)
  |
  +-- agentModeProvider.ts (WebviewPanel)
  |     |
  |     +-- api.ts (HTTP client)
  |     +-- workspaceIndexer.ts (file/symbol context)
  |
  +-- codeActionProvider.ts (CodeActionProvider, stateless)
  |
  +-- hoverProvider.ts (HoverProvider, stateless)
  |
  +-- inlineCompletionProvider.ts (InlineCompletionItemProvider)
        |
        +-- api.ts (HTTP client)
```

## 5.4 State Management

### 5.4.1 Extension-Level State

| State               | Storage                       | Lifetime   | Size Limit              |
| ------------------- | ----------------------------- | ---------- | ----------------------- |
| API key             | `SecretStorage` (OS keychain) | Permanent  | 1 key                   |
| Conversations       | `globalState` (JSON)          | Permanent  | 50 conversations        |
| Model catalog cache | `globalState` (JSON)          | 1 hour TTL | ~100 models             |
| Welcome shown flag  | `globalState` (boolean)       | Permanent  | 1 boolean               |
| Workspace index     | `workspaceState` (JSON)       | 1 hour TTL | 100 files, 5000 symbols |

### 5.4.2 In-Memory State

| State                          | Owner                                  | Lifetime                  |
| ------------------------------ | -------------------------------------- | ------------------------- |
| Conversation history (sidebar) | `SidebarProvider._conversationHistory` | Until sidebar is disposed |
| Agent messages                 | `AgentModePanel.messages`              | Until panel is disposed   |
| Agent edit history             | `AgentModePanel.editHistory`           | Until panel is disposed   |
| Agent iteration counter        | `AgentModePanel._iterationCount`       | Reset per user message    |
| Desktop bridge status          | `DesktopBridge._status`                | Until bridge disposed     |
| Agent sessions                 | `AgentStatusService._sessions`         | Updated on each poll      |
| Inline completion cache        | `AgiInlineCompletionProvider.cache`    | 15 second TTL             |
| Streaming cancel source        | Various `CancellationTokenSource`      | Per request               |

## 5.5 TypeScript Interfaces

### 5.5.1 API Types

```typescript
// Chat message (OpenAI-compatible)
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Request body for /chat/completions
interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  metadata?: Record<string, string | number | boolean>;
}

// SSE chunk (streaming)
interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

// Full response (non-streaming)
interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 5.5.2 Bridge Types

```typescript
interface DesktopBridgeConfig {
  enabled: boolean;
  port: number;
}

interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
```

### 5.5.3 Agent Types

```typescript
interface AgentSession {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentAction: string | null;
  startedAt: string;
  completedAt: string | null;
  progress: number | null;
  model?: string;
  iterationCount?: number;
  maxIterations?: number;
  error?: string;
  toolCallCount?: number;
}

interface FileEdit {
  filePath: string;
  uri: vscode.Uri;
  originalContent: string;
  newContent: string;
  language: string;
}

interface EditBatch {
  id: string;
  timestamp: number;
  edits: FileEdit[];
  description: string;
}
```

### 5.5.4 Model Catalog Types

```typescript
interface ApiModelEntry {
  id: string;
  name: string;
  provider: string;
  category: string;
  contextWindow: number;
  maxOutputTokens: number | null;
  capabilities: {
    vision: boolean;
    tools: boolean;
    streaming: boolean;
    thinking: boolean;
    imageGen: boolean;
    videoGen: boolean;
    codeExecution: boolean;
    search: boolean;
  };
  speed: string | null;
  quality: string | null;
  bestFor: string[];
  released: string | null;
}

interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  description: string;
}
```

### 5.5.5 Storage Types

```typescript
interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

### 5.5.6 Workspace Indexer Types

```typescript
interface FileEntry {
  uri: vscode.Uri;
  language: string;
  symbols: string[];
  size: number;
}

interface CacheEntry {
  timestamp: number;
  files: Array<{
    path: string;
    language: string;
    symbols: string[];
    size: number;
  }>;
}
```

---

# Section 6: Data Flow & API Connections

## 6.1 LLM API Communication

### 6.1.1 Endpoint

Default: `https://agiworkforce.com/api/llm/v1`

Configurable via `agiWorkforce.apiEndpoint` setting. All LLM calls go to the cloud API, never through the desktop bridge.

### 6.1.2 Authentication

```
Authorization: Bearer {apiKey}
User-Agent: agi-workforce-vscode/0.1.0
X-Client: vscode-extension
```

API key is retrieved from VS Code SecretStorage on each request. Never cached in memory beyond the request scope.

### 6.1.3 Request Flow (Streaming)

```
Extension                           AGI Workforce API
   |                                       |
   |-- POST /chat/completions ----------->|
   |   {model, messages, stream: true,     |
   |    metadata: {mcp_enabled, ...}}      |
   |                                       |
   |<--- SSE: data: {chunk} --------------|
   |     onToken(chunk.choices[0].delta)   |
   |<--- SSE: data: {chunk} --------------|
   |     onToken(...)                      |
   |<--- SSE: data: [DONE] --------------|
   |     onDone()                          |
   |                                       |
```

### 6.1.4 Request Flow (Non-Streaming)

```
Extension                           AGI Workforce API
   |                                       |
   |-- POST /chat/completions ----------->|
   |   {model, messages, stream: false}    |
   |                                       |
   |<--- 200 {choices[0].message} --------|
   |     onToken(full_content)             |
   |     onDone()                          |
   |                                       |
```

### 6.1.5 Retry Logic

- Server errors (5xx): retry up to 2 times with exponential backoff (1s, 2s)
- Client errors (4xx): no retry (throw immediately)
- Network errors: retry up to 2 times
- Cancellation: throw immediately (no retry)

### 6.1.6 Error Classification

| HTTP Status   | Error Code   | User Message                             |
| ------------- | ------------ | ---------------------------------------- |
| 401           | `NO_API_KEY` | "No AGI Workforce API key configured..." |
| 429           | `HTTP_ERROR` | "API error 429: Rate limited"            |
| 5xx           | `HTTP_ERROR` | "API error {status}: {body}"             |
| Network error | (native)     | "Request failed: {message}"              |
| Cancellation  | `CANCELLED`  | (silent -- no message)                   |

## 6.2 Model Catalog API

### 6.2.1 Endpoint

`GET {baseUrl}/api/models`

Where `baseUrl` is derived from the API endpoint setting (e.g., `https://agiworkforce.com`).

### 6.2.2 Request

```http
GET /api/models HTTP/1.1
Accept: application/json
```

No authentication required for the model catalog.

### 6.2.3 Response Shape

```json
{
  "models": [
    {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "provider": "anthropic",
      "category": "chat",
      "contextWindow": 200000,
      "maxOutputTokens": 64000,
      "capabilities": {
        "vision": true,
        "tools": true,
        "streaming": true,
        "thinking": true,
        "imageGen": false,
        "videoGen": false,
        "codeExecution": false,
        "search": false
      },
      "speed": "fast",
      "quality": "medium",
      "bestFor": ["coding", "analysis"],
      "released": "2025-11-01"
    }
  ],
  "version": "2026.03",
  "lastUpdated": "2026-03-09T00:00:00Z"
}
```

### 6.2.4 Caching Strategy

1. Cache key: `agiWorkforce.modelCatalog` (globalState)
2. TTL key: `agiWorkforce.modelCatalogTtl` (globalState)
3. TTL: 1 hour (3,600,000 ms)
4. On fresh request: update cache + TTL
5. On stale + network failure: return stale cache
6. On no cache + network failure: return auto-routing modes only
7. Timeout: 10 seconds (AbortController)

## 6.3 Desktop Bridge Communication

### 6.3.1 HTTP API

All bridge HTTP calls go to `http://127.0.0.1:{port}/api/bridge/{command}`.

| Command            | Method | Payload                                            | Response                                              |
| ------------------ | ------ | -------------------------------------------------- | ----------------------------------------------------- |
| `code-snippet`     | POST   | `{ code, language, filePath }`                     | `{ ok: boolean }`                                     |
| `sync-context`     | POST   | `{ workspaceFolders, activeFile, activeLanguage }` | `{ ok: boolean }`                                     |
| `agent-action`     | POST   | `{ action, ...params }`                            | `{ ok: boolean }`                                     |
| `get-agent-status` | POST   | `{}`                                               | `{ ok: boolean, data: { sessions: AgentSession[] } }` |

### 6.3.2 WebSocket Events

Connection: `ws://127.0.0.1:{port}/ws`

**Extension to Desktop (outbound):**

| Event Type         | Payload                                  | Trigger         |
| ------------------ | ---------------------------------------- | --------------- |
| `vscode:connected` | `{ workspaceFolders, extensionVersion }` | WebSocket opens |

**Desktop to Extension (inbound):**

| Event Type                    | Payload                                 | Handler                     |
| ----------------------------- | --------------------------------------- | --------------------------- |
| `desktop:agent-status-update` | `{ sessions: AgentSession[] }`          | Update status bar + notify  |
| `desktop:open-file`           | `{ filePath: string }`                  | Open file in editor         |
| `desktop:show-message`        | `{ text: string }`                      | Show information message    |
| `desktop:run-command`         | `{ command: string, args?: unknown[] }` | Execute allowlisted command |

### 6.3.3 Health Check

`GET http://127.0.0.1:{port}/api/health`

- Timeout: 3 seconds
- Frequency: every 30 seconds when connected
- On failure: status set to `error`, WebSocket closed, reconnect scheduled

### 6.3.4 Reconnection Strategy

- Interval: 5 seconds between reconnection attempts
- On WebSocket close (not user-initiated): schedule reconnect
- On health check failure: close WebSocket, schedule reconnect
- On config change (port or enabled): disconnect and reconnect with new settings
- On extension deactivation: disconnect and dispose

## 6.4 VS Code API Usage

### 6.4.1 Workspace API

| API                                                    | Usage                                                 |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `vscode.workspace.workspaceFolders`                    | Get workspace root paths for file resolution          |
| `vscode.workspace.openTextDocument`                    | Read files for agent mode, open conversation previews |
| `vscode.workspace.applyEdit`                           | Apply AI-suggested code changes                       |
| `vscode.workspace.findFiles`                           | WorkspaceIndexer: find source files                   |
| `vscode.workspace.fs.stat`                             | WorkspaceIndexer: get file sizes                      |
| `vscode.workspace.asRelativePath`                      | Convert absolute paths to workspace-relative          |
| `vscode.workspace.getConfiguration`                    | Read all `agiWorkforce.*` settings                    |
| `vscode.workspace.onDidChangeConfiguration`            | React to settings changes                             |
| `vscode.workspace.registerTextDocumentContentProvider` | Virtual document providers for diff preview           |

### 6.4.2 Window API

| API                                         | Usage                                                  |
| ------------------------------------------- | ------------------------------------------------------ |
| `vscode.window.activeTextEditor`            | Get current editor for context gathering               |
| `vscode.window.visibleTextEditors`          | Get open editors for agent context                     |
| `vscode.window.showTextDocument`            | Open files, show diff, show conversation preview       |
| `vscode.window.showInformationMessage`      | Success messages, welcome, apply/reject dialogs        |
| `vscode.window.showWarningMessage`          | Delete confirmations, bridge warnings, iteration limit |
| `vscode.window.showErrorMessage`            | API errors with "Set API Key" action                   |
| `vscode.window.showInputBox`                | API key entry, commit message, task description        |
| `vscode.window.showQuickPick`               | Model selection, agent status, agent actions           |
| `vscode.window.withProgress`                | Progress notifications for inline commands             |
| `vscode.window.createStatusBarItem`         | Model indicator, agent status, bridge status           |
| `vscode.window.createTerminal`              | Git commands, test runner                              |
| `vscode.window.registerWebviewViewProvider` | Sidebar chat panel                                     |
| `vscode.window.createWebviewPanel`          | Agent mode panel                                       |

### 6.4.3 Languages API

| API                                                     | Usage                        |
| ------------------------------------------------------- | ---------------------------- |
| `vscode.languages.registerCodeActionsProvider`          | Lightbulb quick-fix/refactor |
| `vscode.languages.registerHoverProvider`                | Hover quick actions          |
| `vscode.languages.registerInlineCompletionItemProvider` | Ghost-text completions       |

### 6.4.4 Chat API

| API                                 | Usage                               |
| ----------------------------------- | ----------------------------------- |
| `vscode.chat.createChatParticipant` | Register @agi participant           |
| `vscode.lm.selectChatModels`        | Select built-in models for fallback |

### 6.4.5 Commands API

| API                               | Usage                                              |
| --------------------------------- | -------------------------------------------------- |
| `vscode.commands.registerCommand` | Register all 20+ commands                          |
| `vscode.commands.executeCommand`  | Open settings, diff, focus views, symbol providers |

### 6.4.6 Extensions API

| API                              | Usage                                          |
| -------------------------------- | ---------------------------------------------- |
| `vscode.extensions.getExtension` | Get extension version for telemetry/user-agent |

## 6.5 Offline Behavior

### 6.5.1 No Internet Connection

| Feature              | Behavior                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Chat (sidebar)       | Error message: API call fails. "Set API Key" action shown.                                      |
| Chat (@agi)          | Attempts vscode.lm fallback (Copilot models). If fallback fails, shows error with instructions. |
| Inline completions   | Silently returns empty (no error shown).                                                        |
| Agent mode           | Error message on LLM call failure.                                                              |
| Model catalog        | Stale cache used. If no cache, only auto-routing modes shown.                                   |
| Desktop bridge       | Works (localhost only, no internet needed).                                                     |
| Conversation history | Works (local storage).                                                                          |
| Settings             | Works (local storage).                                                                          |

### 6.5.2 Desktop Bridge Offline

| Feature         | Behavior                                              |
| --------------- | ----------------------------------------------------- |
| Chat            | Works normally via cloud API.                         |
| MCP tools       | Unavailable. Warning shown if enabled without bridge. |
| Agent status    | Falls back to API gateway polling (if configured).    |
| Send to desktop | Warning: "Desktop bridge is not connected."           |
| Sync context    | Warning: "Desktop bridge is not connected."           |
| Trigger action  | Warning: "Desktop bridge is not connected."           |

---

# Section 7: Platform-Specific Capabilities

## 7.1 VS Code Chat Participant Integration

### 7.1.1 @agi Participant

The extension registers a Chat Participant that integrates into VS Code's native Chat panel (the same panel used by GitHub Copilot, Claude Code, etc.). This allows users to use `@agi` alongside other chat participants.

**Participant ID:** `agiworkforce.agi`
**Name in chat:** `@agi`
**Sticky:** Yes (stays selected between turns)
**Icon:** `media/icon-chat.png`

### 7.1.2 Slash Commands

| Command     | Description                                            | Behavior                                    |
| ----------- | ------------------------------------------------------ | ------------------------------------------- |
| `/explain`  | Explain the selected code or current file              | Appends explanation-focused system prompt   |
| `/fix`      | Find and fix bugs or issues in the selected code       | Appends fix-focused system prompt           |
| `/refactor` | Suggest refactoring improvements for the selected code | Appends refactoring-focused system prompt   |
| `/tests`    | Generate unit tests for the selected code              | Appends test-generation system prompt       |
| `/docs`     | Generate documentation comments for the selected code  | Appends documentation-focused system prompt |
| `/model`    | Switch the active LLM model                            | Opens model QuickPick, returns early        |

### 7.1.3 Disambiguation Categories

The participant declares two disambiguation categories so VS Code can route relevant questions:

1. **coding**: "Questions about writing, understanding, debugging, or improving code"
   - Examples: "Explain this function to me", "Why is this code throwing an error?"
2. **architecture**: "Questions about software design, architecture, and best practices"
   - Examples: "What design pattern should I use here?", "What are the tradeoffs?"

### 7.1.4 Follow-up Provider

After each response, three follow-up suggestions are shown:

1. `/explain` -- "Explain the selected code"
2. `/fix` -- "Fix issues in the selection"
3. `/tests` -- "Generate tests"

After `/fix` or `/refactor` commands, an additional button is shown:

- `$(info) Explain this` -- Triggers `agi-workforce.explain`

## 7.2 Editor Integration

### 7.2.1 Selection Context

The extension automatically captures the current editor selection for all commands. If no text is selected, the entire file content is used as context.

Context gathering includes:

- `fileName`: Full path of the active file
- `languageId`: VS Code language identifier (e.g., "typescript", "python")
- `selectedText`: Currently selected text
- `surroundingCode`: Lines surrounding the selection (configurable, default 50)
- `workspaceName`: Name of the first workspace folder

### 7.2.2 Inline Edit Application

When the AI returns code in a fenced block, the user is offered three options:

1. **Apply Inline**: Replace the selection with the AI-generated code via WorkspaceEdit
2. **View in New Tab**: Open the full response in a side-by-side Markdown preview
3. **Cancel**: Do nothing

When `autoApplyFixes` is enabled, the "fix" command applies directly without the dialog.

### 7.2.3 Terminal Integration

Git and test commands use VS Code's terminal API:

- `vscode.window.createTerminal(name)`: Create named terminal
- `terminal.show()`: Make terminal visible
- `terminal.sendText(command)`: Execute command

Terminals are named for identification:

- "AGI Git" for git commands
- "AGI Tests" for test runner

### 7.2.4 Test Runner Auto-Detection

The `agi.test.run` command auto-detects the project's test runner:

| File Present                     | Test Command |
| -------------------------------- | ------------ |
| `pnpm-lock.yaml`                 | `pnpm test`  |
| `yarn.lock`                      | `yarn test`  |
| `package.json` (default)         | `npm test`   |
| `Cargo.toml`                     | `cargo test` |
| `pytest.ini` or `pyproject.toml` | `pytest`     |

## 7.3 Workspace Indexer

### 7.3.1 File Discovery

Scans workspace for source files:

- **Include pattern:** `**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,h,rb,php,swift,kt}`
- **Exclude pattern:** `{**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/target/**}`
- **Max files:** 100

### 7.3.2 Symbol Extraction

For each file, extracts top-level symbols using VS Code's Document Symbol Provider:

- Filters to `SymbolKind` <= `Property` (classes, functions, methods, variables, etc.)
- Max 50 symbols per file
- Max 5000 symbols total across all files

### 7.3.3 Relevance Scoring

When a user sends a message, the indexer scores files by keyword overlap:

- Split query into words (3+ characters)
- Score each file: count of query words found in path + symbol names
- Return top 10 files with score > 0
- Format as workspace context (max 2000 characters)

### 7.3.4 Cache Strategy

- Storage: `workspaceState` (per-workspace)
- TTL: 1 hour
- Triggered: on first agent mode message if stale

## 7.4 Multi-Root Workspace Support

### 7.4.1 Current Behavior

The extension uses `workspaceFolders[0]` as the root for:

- Agent mode file resolution
- Git commands (workspace root check)
- Test runner detection
- Desktop bridge context sync

### 7.4.2 Planned Enhancements (P3)

- File resolution should check all workspace folders
- Agent mode should include all roots in context
- Model selector should support per-folder configuration

## 7.5 Git Integration

### 7.5.1 Current Implementation

Four git-related commands use the terminal API:

1. **git status**: Opens terminal, runs `git status`
2. **git diff**: Opens terminal, runs `git diff`
3. **git commit**: Prompts for commit message via InputBox, runs `git add -u && git commit -m "{message}"`
   - Uses `git add -u` (tracked files only) to avoid staging sensitive or large files
   - Escapes double quotes in commit message
4. **Run tests**: Auto-detects test runner and runs in terminal

### 7.5.2 Planned Git Enhancements (P2)

- AI-generated commit messages from staged diff
- AI-generated PR descriptions
- Git blame context for AI prompts
- AI review of staged changes
- Integration with VS Code's SCM API

## 7.6 MCP Tool Integration

### 7.6.1 Architecture

MCP tools are accessed through the desktop bridge, not directly from the extension. The flow is:

1. Extension sets `mcp_enabled: true` in API request metadata
2. API routes to desktop app's MCP runtime (via bridge)
3. Desktop executes MCP tools (stdio, SSE, HTTP transports)
4. Results returned to extension via bridge

### 7.6.2 Current State

MCP integration is gated behind `agiWorkforce.mcp.enabled` (default: false). When enabled without the desktop bridge, a warning is shown. The extension connects to the bridge on startup when MCP is enabled.

### 7.6.3 Planned Enhancements (P2)

- Direct MCP tool execution within the extension (no bridge required)
- MCP tool discovery and listing in sidebar
- Per-tool enable/disable configuration
- Tool execution status in agent mode

---

# Section 8: Build, Deploy & Distribution

## 8.1 Build Pipeline

### 8.1.1 Development Build

```bash
cd apps/extension-vscode
node esbuild.js              # Single build, sourcemaps enabled
node esbuild.js --watch      # Watch mode for development
```

### 8.1.2 Production Build

```bash
cd apps/extension-vscode
pnpm run prebuild            # clean + typecheck
pnpm run compile             # esbuild production build
```

### 8.1.3 esbuild Configuration

| Option       | Value                         | Rationale                            |
| ------------ | ----------------------------- | ------------------------------------ |
| Entry point  | `src/extension.ts`            | Single entry, tree-shaken            |
| Output       | `out/extension.js`            | CommonJS bundle                      |
| Platform     | `node`                        | VS Code extensions run in Node.js    |
| Target       | `node18`                      | Minimum for VS Code 1.95             |
| Format       | `cjs`                         | Required by VS Code extension host   |
| External     | `['vscode']`                  | Provided by VS Code at runtime       |
| Sourcemap    | `true` (dev) / `false` (prod) | Debug in dev, smaller bundle in prod |
| Minify       | `false` (dev) / `true` (prod) | Smaller VSIX in production           |
| Tree shaking | `true`                        | Remove unused code                   |

### 8.1.4 Output Artifacts

| File                   | Size (est.)        | Description            |
| ---------------------- | ------------------ | ---------------------- |
| `out/extension.js`     | ~150 KB (minified) | Bundled extension code |
| `out/extension.js.map` | ~300 KB (dev only) | Source maps            |

## 8.2 VSIX Packaging

### 8.2.1 Package Command

```bash
pnpm run package   # node esbuild.js --production && vsce package --no-dependencies
```

### 8.2.2 .vscodeignore

Files excluded from the VSIX package:

```
.vscode/**
src/**
node_modules/**
.cache/**
.tsbuildinfo
*.map
.gitignore
tsconfig.json
vitest.config.ts
esbuild.js
scripts/**
```

### 8.2.3 Included in VSIX

```
out/extension.js          # Bundled extension code
media/icon.png            # Marketplace icon (128x128)
media/icon-chat.png       # Chat participant icon
media/icon-sidebar.svg    # Activity bar icon
CHANGELOG.md              # Version history
README.md                 # Marketplace README
package.json              # Extension manifest
LICENSE                   # Proprietary license
```

### 8.2.4 Expected VSIX Size

Target: < 500 KB (excluding media assets)

## 8.3 VS Code Marketplace Submission

### 8.3.1 Publisher Information

| Field                  | Value                      |
| ---------------------- | -------------------------- |
| Publisher ID           | `agiworkforce`             |
| Publisher display name | "AGI Workforce"            |
| Publisher URL          | `https://agiworkforce.com` |

### 8.3.2 Extension Metadata

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| Extension ID  | `agiworkforce.agi-workforce`                           |
| Display name  | "AGI Workforce"                                        |
| Description   | "AI-powered coding assistant powered by AGI Workforce" |
| Version       | `0.1.0` (initial)                                      |
| License       | PROPRIETARY                                            |
| Repository    | `https://github.com/agiworkforce/agiworkforce`         |
| Icon          | `media/icon.png` (128x128, PNG)                        |
| Banner        | Blue/teal gradient (TBD)                               |
| Gallery theme | Dark                                                   |

### 8.3.3 Marketplace Categories

```json
["AI", "Chat", "Other"]
```

### 8.3.4 Marketplace Keywords

```json
["ai", "llm", "chat", "copilot", "assistant", "coding", "agent", "gpt", "claude", "gemini"]
```

### 8.3.5 README Content Plan

The marketplace README should include:

1. Hero image/GIF showing the extension in action
2. Feature highlights (multi-model, agent mode, inline completions)
3. Getting started (install, set API key, open chat)
4. Model list
5. Command reference
6. Settings reference
7. Desktop bridge setup
8. FAQ
9. Support links

### 8.3.6 CHANGELOG Content Plan

Follow Keep a Changelog format:

```markdown
# Changelog

## [0.1.0] - 2026-03-XX

### Added

- @agi chat participant with /explain, /fix, /refactor, /tests, /docs, /model
- Sidebar chat panel with streaming
- Agent mode with multi-file editing and batch undo
- Inline completions (ghost text)
- Desktop bridge integration
- Model selector with 15+ models and auto-routing
- Conversation history with tree view
- Code actions (lightbulb) and hover quick actions
- Git commands and test runner
```

## 8.4 Update Mechanism

VS Code handles extension updates automatically via the Marketplace. When a new version is published:

1. VS Code checks for updates periodically (configurable by user)
2. If auto-update is enabled: extension updates silently on next restart
3. If auto-update is disabled: user is notified of available update
4. Extension can check `vscode.extensions.getExtension().packageJSON.version` to compare versions

### 8.4.1 Pre-Release Channel

For beta testing, publish to the pre-release channel:

```bash
vsce package --pre-release
vsce publish --pre-release
```

Users can opt into pre-release versions in the Marketplace.

## 8.5 CI/CD Pipeline

### 8.5.1 Planned GitHub Actions Workflow

```yaml
name: VS Code Extension CI

on:
  push:
    paths:
      - 'apps/extension-vscode/**'
  pull_request:
    paths:
      - 'apps/extension-vscode/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable && pnpm install
      - run: cd apps/extension-vscode && pnpm typecheck
      - run: cd apps/extension-vscode && pnpm lint
      - run: cd apps/extension-vscode && pnpm test
      - run: cd apps/extension-vscode && pnpm compile

  publish:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable && pnpm install
      - run: cd apps/extension-vscode && pnpm package
      - run: cd apps/extension-vscode && npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

---

# Section 9: Testing Strategy

## 9.1 Unit Tests

### 9.1.1 Framework

- **Runner:** Vitest 4.0+
- **Mock framework:** Vitest built-in mocks + custom VS Code API mock
- **Config:** `vitest.config.ts` in `apps/extension-vscode/`

### 9.1.2 VS Code API Mock

The tests use a custom mock at `src/__tests__/__mocks__/vscode.ts` that provides:

- Mock `SecretStorage` (in-memory map)
- Mock `workspace.getConfiguration` (configurable return values)
- Mock `window.showQuickPick`, `showInputBox`, `showInformationMessage`, etc.
- Mock `languages.registerCodeActionsProvider`, etc.
- Mock `Uri`, `Range`, `Position`, `Selection` classes
- Mock `CancellationTokenSource`

### 9.1.3 Test Files and Coverage Targets

| Test File                          | Module Under Test             | Coverage Target                                           |
| ---------------------------------- | ----------------------------- | --------------------------------------------------------- |
| `extension.test.ts`                | `extension.ts` (activation)   | Activation, command registration, status bar              |
| `chatParticipant.test.ts`          | `chatParticipant.ts`          | System prompt, context gathering, slash commands, history |
| `codeActionProvider.test.ts`       | `codeActionProvider.ts`       | Quick fix on diagnostics, refactor on selection           |
| `hoverProvider.test.ts`            | `hoverProvider.ts`            | Hover enabled/disabled, word range                        |
| `inlineCompletionProvider.test.ts` | `inlineCompletionProvider.ts` | Debounce, caching, extraction, filtering                  |
| `conversationStore.test.ts`        | `conversationStore.ts`        | CRUD, pruning, sorting                                    |
| `conversationTreeProvider.test.ts` | `conversationTreeProvider.ts` | Tree items, refresh, empty state                          |
| `applyEdit.test.ts`                | `applyEdit.ts`                | Code block extraction, apply/reject flow                  |
| `desktopBridge.test.ts`            | `desktopBridge.ts`            | Connection, reconnect, message handling                   |
| `workspaceIndexer.test.ts`         | `workspaceIndexer.ts`         | File discovery, symbol extraction, scoring                |
| `api.test.ts`                      | `api.ts`                      | Streaming, non-streaming, error handling, retry           |

### 9.1.4 Run Commands

```bash
cd apps/extension-vscode
pnpm test                    # Run all unit tests
pnpm test -- --watch         # Watch mode
pnpm test -- --coverage      # With coverage report
```

## 9.2 Integration Tests

### 9.2.1 Framework

- **Runner:** @vscode/test-electron 2.4+
- **CLI:** @vscode/test-cli 0.0.10+

Integration tests run inside a real VS Code instance:

```bash
cd apps/extension-vscode
npx vscode-test                # Run integration tests in real VS Code
```

### 9.2.2 Integration Test Scenarios

| ID     | Scenario             | Steps                                     | Expected                                       |
| ------ | -------------------- | ----------------------------------------- | ---------------------------------------------- |
| INT-01 | Extension activates  | Open VS Code with extension               | No errors, status bar shows model              |
| INT-02 | Set API key          | Run "Set API Key" command, enter key      | Key stored in SecretStorage, success message   |
| INT-03 | Chat in sidebar      | Open sidebar, type message, send          | Streaming response appears, conversation saved |
| INT-04 | @agi participant     | Open Chat panel, type `@agi explain this` | Response appears in chat panel                 |
| INT-05 | Model switch         | Click status bar, pick different model    | Status bar updates, config saved               |
| INT-06 | Code action          | Open file with error, trigger lightbulb   | "Fix with AGI Workforce" appears               |
| INT-07 | Context menu         | Select code, right-click                  | Four AGI items in context menu                 |
| INT-08 | Agent mode           | Open agent mode, ask to edit file         | Diff preview shown, apply/reject dialog        |
| INT-09 | Desktop bridge       | Enable bridge with running desktop app    | Status changes to connected                    |
| INT-10 | Conversation history | Send messages, check tree view            | Conversations appear in tree                   |

## 9.3 E2E Test Scenarios

### 9.3.1 Full User Journeys

| ID     | Journey              | Description                                                         |
| ------ | -------------------- | ------------------------------------------------------------------- |
| E2E-01 | First run            | Install extension, see welcome, set API key, chat, receive response |
| E2E-02 | Multi-model workflow | Switch model, chat, switch again, verify different model used       |
| E2E-03 | Code fix workflow    | Open file with bugs, select code, run Fix, apply inline             |
| E2E-04 | Agent refactoring    | Open agent mode, ask to refactor module, approve plan, apply edits  |
| E2E-05 | Bridge + desktop     | Enable bridge, send code to desktop, trigger agent action           |
| E2E-06 | Inline completions   | Enable setting, type code, accept ghost text                        |
| E2E-07 | Offline degradation  | Disable network, attempt chat, see fallback behavior                |

## 9.4 Test Matrix

### 9.4.1 VS Code Versions

| Version                 | Test Level      |
| ----------------------- | --------------- |
| 1.95.0 (minimum)        | Full regression |
| 1.96.x (current stable) | Full regression |
| Insiders (latest)       | Smoke test      |

### 9.4.2 Operating Systems

| OS               | Test Level                    |
| ---------------- | ----------------------------- |
| macOS arm64      | Full regression (primary dev) |
| macOS x64        | Smoke test                    |
| Windows 11 x64   | Full regression               |
| Ubuntu 22.04 x64 | Full regression               |

---

# Section 10: Performance Requirements

## 10.1 Extension Activation

| Metric               | Target   | Measurement                               |
| -------------------- | -------- | ----------------------------------------- |
| Cold activation time | < 500 ms | Time from `activate()` call to return     |
| Status bar render    | < 100 ms | Time to first status bar text             |
| First chat ready     | < 1 s    | Time until sidebar webview is interactive |

### 10.1.1 Activation Strategy

The extension uses `onStartupFinished` activation event, meaning it activates after VS Code's UI is fully loaded, not during startup. This ensures zero impact on VS Code's initial load time.

Activation flow is non-blocking:

1. Telemetry init (try/catch, non-blocking)
2. Desktop bridge init (try/catch, non-blocking)
3. ConversationStore + TreeProvider (sync, fast)
4. Chat participant registration (sync, fast)
5. Sidebar provider registration (sync, fast)
6. Code intelligence providers (sync, fast)
7. Command registration (sync, fast)
8. Status bar creation (sync, fast)
9. First-run check (async, non-blocking)

## 10.2 Memory Usage

| Metric                  | Target   | Notes                                 |
| ----------------------- | -------- | ------------------------------------- |
| Extension host overhead | < 50 MB  | Above VS Code baseline                |
| Conversation storage    | < 5 MB   | 50 conversations in globalState       |
| Workspace index cache   | < 2 MB   | 100 files, 5000 symbols               |
| Model catalog cache     | < 100 KB | ~100 model entries                    |
| Webview (sidebar)       | < 20 MB  | Single HTML page with minimal DOM     |
| Webview (agent mode)    | < 30 MB  | More complex DOM with message history |

### 10.2.1 Memory Optimization Strategies

- esbuild tree-shaking removes unused code from the bundle
- Conversations pruned at 50 items
- Workspace index limited to 100 files, 5000 symbols
- Inline completion cache has 15s TTL (single entry)
- Agent mode file reads capped at 10,000 characters per file
- Streaming tokens accumulated in array, joined only on completion

## 10.3 Network Performance

| Metric                      | Target | Notes                                   |
| --------------------------- | ------ | --------------------------------------- |
| First token latency         | < 2 s  | Time from send to first streaming token |
| Inline completion latency   | < 1 s  | After debounce period                   |
| Model catalog fetch         | < 3 s  | With 10s timeout                        |
| Desktop bridge health check | < 1 s  | With 3s timeout                         |
| Desktop bridge command      | < 5 s  | With 10s timeout                        |

### 10.3.1 Network Optimization Strategies

- SSE streaming for immediate token display
- Debounced inline completions (300ms default) to avoid excessive requests
- Model catalog cached for 1 hour
- Desktop bridge uses WebSocket for real-time (no polling when connected)
- Polling fallback only when WebSocket unavailable (5s interval)
- Retry with exponential backoff for server errors

## 10.4 Bundle Size

| Metric            | Target   | Notes                 |
| ----------------- | -------- | --------------------- |
| VSIX total size   | < 1 MB   | Including all assets  |
| JavaScript bundle | < 200 KB | Minified, tree-shaken |
| Media assets      | < 500 KB | Icon PNG + SVG        |

## 10.5 Editor Impact

| Metric                | Target  | Notes                                                          |
| --------------------- | ------- | -------------------------------------------------------------- |
| Typing latency impact | 0 ms    | No synchronous processing on keystroke                         |
| Hover latency         | < 10 ms | Simple config check + markdown construction                    |
| Code action latency   | < 10 ms | Synchronous, no API calls                                      |
| IntelliSense impact   | 0 ms    | Extension does not register completion providers (only inline) |

---

# Section 11: Security

## 11.1 Threat Model

### 11.1.1 Threats

| Threat                            | Severity | Mitigation                                                            |
| --------------------------------- | -------- | --------------------------------------------------------------------- |
| API key exposure in settings.json | Critical | Keys stored in VS Code SecretStorage (OS keychain), never in settings |
| API key logged to console         | High     | Key only used in Authorization header, never logged                   |
| XSS in webview                    | High     | CSP with nonce, HTML entity escaping, no eval()                       |
| Malicious bridge commands         | High     | Command allowlist (12 commands), non-allowlisted commands blocked     |
| Code injection via LLM response   | Medium   | User must explicitly approve all code changes                         |
| Malicious MCP tools               | Medium   | MCP gated behind feature flag, desktop bridge acts as sandbox         |
| Telemetry data leak               | Low      | No PII collected, respects VS Code + extension telemetry settings     |
| MITM on API calls                 | Medium   | HTTPS enforced for cloud API, localhost for bridge                    |
| Insecure WebSocket                | Low      | Bridge WebSocket on localhost only (127.0.0.1)                        |

### 11.1.2 Attack Surface

```
Internet ----[HTTPS]---- AGI Workforce Cloud API
                              |
Extension Host ----[HTTP/WS over localhost]---- Desktop Bridge
                              |
Webview ----[postMessage]---- Extension Host
```

## 11.2 Secret Storage

### 11.2.1 API Key Storage

| Property    | Value                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Storage API | `vscode.SecretStorage`                                                                                  |
| Key name    | `agiWorkforce.apiKey`                                                                                   |
| Encryption  | VS Code delegates to OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux) |
| Access      | Only the extension can read its own secrets                                                             |
| Persistence | Survives extension updates and VS Code restarts                                                         |

### 11.2.2 API Key Lifecycle

1. **Set**: User enters key via InputBox (password mode) or sidebar banner
2. **Store**: `secrets.store('agiWorkforce.apiKey', key)`
3. **Read**: `secrets.get('agiWorkforce.apiKey')` on each API request
4. **Clear**: `secrets.delete('agiWorkforce.apiKey')` with user confirmation
5. **Never**: key is never written to settings.json, console, logs, or telemetry

## 11.3 Content Security Policy

### 11.3.1 Sidebar Webview CSP

```
default-src 'none';
style-src 'nonce-${nonce}';
script-src 'nonce-${nonce}';
img-src ${cspSource} https: data:;
font-src ${cspSource};
```

### 11.3.2 Agent Mode Webview CSP

```
default-src 'none';
style-src 'nonce-${nonce}';
script-src 'nonce-${nonce}';
```

Both webviews:

- Use cryptographic nonces for all inline scripts and styles
- Do not load external resources (no CDN scripts, no remote CSS)
- Do not use `eval()`, `new Function()`, or `innerHTML` with user input
- HTML entity escaping applied before any Markdown rendering

## 11.4 Desktop Bridge Security

### 11.4.1 Command Allowlist

The bridge only executes commands from a hardcoded allowlist:

```typescript
const ALLOWED_BRIDGE_COMMANDS = new Set([
  'agi-workforce.chat',
  'agi-workforce.agentMode',
  'agi-workforce.explain',
  'agi-workforce.fix',
  'agi-workforce.refactor',
  'agi-workforce.generateTests',
  'agi-workforce.selectModel',
  'agi-workforce.openConversation',
  'agi-workforce.sendToDesktop',
  'agi-workforce.syncContextToDesktop',
  'workbench.action.openSettings',
  'workbench.action.files.openFile',
]);
```

Non-allowlisted commands are:

1. Blocked (not executed)
2. Logged to console with warning: `[AGI Workforce Bridge] blocked disallowed command: {commandId}`

### 11.4.2 Localhost-Only Communication

The bridge only connects to `127.0.0.1:{port}`. No remote bridge connections are supported. This ensures:

- No exposure to network attacks
- No cross-machine command execution
- No DNS rebinding vulnerability

### 11.4.3 No Authentication on Bridge

Currently, the bridge does not use authentication tokens. This is acceptable because:

- Connection is localhost-only
- The desktop app controls who can connect
- Risk is limited to local processes on the same machine

**Planned enhancement (P3):** Shared secret authentication for bridge connections.

## 11.5 Data at Rest

| Data                 | Location                      | Encryption               | Notes                        |
| -------------------- | ----------------------------- | ------------------------ | ---------------------------- |
| API key              | OS keychain via SecretStorage | OS-level encryption      | Strongest available          |
| Conversations        | VS Code globalState           | VS Code handles (SQLite) | Not encrypted at field level |
| Model catalog cache  | VS Code globalState           | VS Code handles          | Not sensitive                |
| Workspace index      | VS Code workspaceState        | VS Code handles          | Paths and symbol names only  |
| Telemetry session ID | In-memory only                | N/A                      | Regenerated each session     |

## 11.6 Data in Transit

| Connection               | Protocol         | Encryption            |
| ------------------------ | ---------------- | --------------------- |
| Cloud API                | HTTPS            | TLS 1.2+              |
| Model catalog            | HTTPS            | TLS 1.2+              |
| Desktop bridge HTTP      | HTTP (localhost) | None (localhost-only) |
| Desktop bridge WebSocket | WS (localhost)   | None (localhost-only) |
| Telemetry                | HTTPS            | TLS 1.2+              |

## 11.7 Workspace Trust

The extension respects VS Code's Workspace Trust model:

- In untrusted workspaces: extension activates but functionality is not restricted (it does not execute code from the workspace)
- Agent mode file operations are explicit and user-approved
- The extension does not auto-execute any workspace-defined scripts or configurations

## 11.8 Privacy

### 11.8.1 Data Sent to AGI Workforce Cloud

| Data            | Purpose        | Opt-out                             |
| --------------- | -------------- | ----------------------------------- |
| Chat messages   | LLM inference  | Use local models via desktop bridge |
| Code context    | AI suggestions | Reduce `contextLines` to 0          |
| Model selection | Routing        | Always sent                         |
| Feature flags   | API behavior   | Minimal metadata                    |

### 11.8.2 Telemetry Data Collected

When telemetry is enabled (opt-in, default off):

| Data Point         | Example                  | PII |
| ------------------ | ------------------------ | --- |
| Event name         | `chat/messageSent`       | No  |
| Extension version  | `0.1.0`                  | No  |
| VS Code version    | `1.95.0`                 | No  |
| Platform           | `darwin`                 | No  |
| Selected model     | `claude-sonnet-4.6`      | No  |
| Command used       | `explain`                | No  |
| Language ID        | `typescript`             | No  |
| Session ID         | `a1b2c3...` (random hex) | No  |
| Error name/message | `AgiWorkforceApiError`   | No  |

**Never collected:**

- File contents
- File paths
- API keys
- IP addresses (server-side, not extension)
- User identifiers
- Code snippets

---

# Section 12: Accessibility

## 12.1 VS Code Built-in Accessibility

The extension inherits VS Code's comprehensive accessibility infrastructure:

| Feature                               | Support                                       |
| ------------------------------------- | --------------------------------------------- |
| Screen reader (VoiceOver, NVDA, JAWS) | Full (via VS Code ARIA)                       |
| High contrast themes                  | Full (webviews use VS Code CSS variables)     |
| Keyboard navigation                   | Full (all commands have keyboard shortcuts)   |
| Reduced motion                        | Respected (CSS `prefers-reduced-motion`)      |
| Tab order                             | Logical (header -> messages -> input)         |
| Focus indicators                      | VS Code focus border (`--vscode-focusBorder`) |

## 12.2 Keyboard Navigation Map

### 12.2.1 Global Shortcuts

| Action            | macOS             | Windows/Linux      |
| ----------------- | ----------------- | ------------------ |
| Open Chat         | `Cmd+Shift+A`     | `Ctrl+Shift+A`     |
| Explain Selection | `Cmd+Shift+Alt+E` | `Ctrl+Shift+Alt+E` |
| Agent Mode        | `Cmd+Shift+Alt+G` | `Ctrl+Shift+Alt+G` |

### 12.2.2 Sidebar Chat Panel

| Action                | Key                       |
| --------------------- | ------------------------- |
| Focus message input   | Tab into sidebar          |
| Send message          | `Enter`                   |
| New line in message   | `Shift+Enter`             |
| Focus model selector  | `Tab` from input          |
| Focus clear button    | `Tab` from model selector |
| Focus settings button | `Tab` from clear button   |

### 12.2.3 Agent Mode Panel

| Action              | Key                     |
| ------------------- | ----------------------- |
| Focus message input | Automatic on panel open |
| Send message        | `Enter`                 |
| New line in message | `Shift+Enter`           |
| Focus clear button  | `Tab` from input        |

### 12.2.4 Command Palette

All 20+ commands are accessible via `Cmd+Shift+P` / `Ctrl+Shift+P`.

## 12.3 Color Contrast

### 12.3.1 Sidebar Webview

The sidebar uses custom design tokens. WCAG AA contrast ratios:

| Element          | Foreground               | Background             | Ratio  | Passes AA |
| ---------------- | ------------------------ | ---------------------- | ------ | --------- |
| Primary text     | `rgba(255,255,255,0.92)` | `#0f0f0f`              | 17.3:1 | Yes       |
| Secondary text   | `rgba(255,255,255,0.55)` | `#0f0f0f`              | 8.7:1  | Yes       |
| Teal accent      | `#21808d`                | `#0f0f0f`              | 5.1:1  | Yes       |
| Error text       | `#fca5a5`                | `rgba(239,68,68,0.12)` | 8.2:1  | Yes       |
| Send button text | `#ffffff`                | `#da7756`              | 4.5:1  | Yes (AA)  |

### 12.3.2 Agent Mode Panel

The agent mode panel uses VS Code CSS variables, which automatically adapt to the user's theme (light, dark, high contrast). No custom color values that could break contrast.

## 12.4 Screen Reader Considerations

### 12.4.1 Status Bar Items

All status bar items have `tooltip` properties that screen readers announce:

- Model: "AGI Workforce -- click to change model"
- Agent: "AGI Workforce -- Agent Status"
- Bridge: Dynamic tooltip with port and status

### 12.4.2 QuickPick Items

All QuickPick items have:

- `label`: Primary identifier
- `description`: Short context
- `detail`: Extended information

Screen readers announce all three fields.

### 12.4.3 Notifications

All notification messages use clear, descriptive text. Error messages include:

- What went wrong
- What action to take
- Action buttons where applicable

### 12.4.4 Webview Accessibility

The sidebar and agent mode webviews:

- Use semantic HTML (`<header>`, `<main>`, `<footer>` -- pending)
- Include `title` attributes on buttons
- Use `placeholder` text on inputs
- Use `aria-live` regions for streaming updates (planned)

## 12.5 Planned Accessibility Enhancements

| ID      | Enhancement                                                     | Priority |
| ------- | --------------------------------------------------------------- | -------- |
| A11Y-01 | Add `aria-live="polite"` to messages area for streaming updates | P1       |
| A11Y-02 | Add `role="log"` to messages container                          | P1       |
| A11Y-03 | Semantic HTML in webviews (`<header>`, `<main>`)                | P2       |
| A11Y-04 | Skip-to-content link in webviews                                | P3       |
| A11Y-05 | Announce model changes to screen readers                        | P2       |
| A11Y-06 | High contrast mode testing and fixes                            | P1       |
| A11Y-07 | Reduced motion: disable typing animation                        | P2       |
| A11Y-08 | Focus management after message send                             | P1       |

---

# Section 13: Competitive Analysis

## 13.1 Competitor Overview

### 13.1.1 GitHub Copilot Chat

**Publisher:** GitHub (Microsoft)
**Model:** OpenAI GPT-4o (primary), GPT-4o-mini (economy)
**Pricing:** Free (limited), $10/mo individual, $19/mo business
**Marketplace installs:** 20M+ (as of early 2026)

**Architecture:**

- Integrated as a first-party VS Code feature
- @github chat participant with slash commands
- Inline completions (ghost text) -- industry leader
- Copilot Edits for multi-file changes (workspace agent)
- Code review in pull requests
- Context: open files, workspace, terminal output

**Strengths:**

- Deepest VS Code integration (first-party)
- Best inline completion quality and speed
- Massive user base and ecosystem
- Free tier available
- Enterprise features (policy, audit, IP indemnity)

**Weaknesses:**

- Locked to OpenAI models only
- No model choice or comparison
- No BYOK support
- No local model support
- No desktop agent integration
- No MCP tools
- Limited customization

### 13.1.2 Claude Code VS Code Extension

**Publisher:** Anthropic
**Model:** Claude family (Opus 4.6, Sonnet 4.6, Haiku 4.5)
**Pricing:** Included with Claude Pro ($20/mo) or Max ($100-200/mo)
**Marketplace installs:** 500K+ (as of early 2026)

**Architecture:**

- @claude chat participant
- Agentic coding capabilities (file reading, editing)
- Terminal command execution
- MCP tool support (limited)
- Extended thinking for complex tasks

**Strengths:**

- Excellent code quality from Claude models
- Agentic capabilities (read, edit, run)
- Extended thinking for complex reasoning
- MCP support (emerging)
- Strong brand recognition

**Weaknesses:**

- Locked to Anthropic models only
- No inline completions (ghost text)
- No model switching
- Expensive (requires Claude Pro/Max subscription)
- Limited VS Code integration points (no code actions, no hover)
- No desktop agent bridge
- No plan mode or batch undo

### 13.1.3 Cline / Roo Code

**Publisher:** Cline (community), Roo Code (fork)
**Model:** BYOK (any OpenAI-compatible API)
**Pricing:** Free (open source, BYOK)
**Marketplace installs:** 2M+ (Cline + Roo Code combined, as of early 2026)

**Architecture:**

- Sidebar panel with chat interface
- Agentic coding with file read/write
- Terminal command execution
- MCP tool support
- Browser automation via Playwright
- Configurable system prompts

**Strengths:**

- Open source and free
- BYOK -- any model via API key
- MCP tool ecosystem
- Active community
- Highly configurable
- Browser automation

**Weaknesses:**

- No inline completions
- No VS Code Chat participant integration
- No auto-routing between models
- No desktop agent integration
- No remote model catalog
- Fragmented (Cline vs Roo Code vs forks)
- Configuration complexity
- No enterprise features

### 13.1.4 Continue

**Publisher:** Continue.dev
**Model:** BYOK (any OpenAI-compatible API)
**Pricing:** Free (open source, BYOK)
**Marketplace installs:** 1M+ (as of early 2026)

**Architecture:**

- Sidebar chat panel
- Inline completions (Tab autocomplete)
- Context providers (custom context sources)
- Slash commands
- Configurable via `config.json`

**Strengths:**

- Open source and free
- BYOK with many providers
- Inline completions
- Extensible context system
- Local model support (Ollama)

**Weaknesses:**

- No VS Code Chat participant integration
- No agent mode (no file editing)
- No desktop integration
- Configuration-heavy
- Smaller community
- No MCP support
- No auto-routing

### 13.1.5 Cursor (Not an Extension)

**Note:** Cursor is a VS Code fork, not an extension. It replaces VS Code entirely. Included here for competitive context.

**Model:** Multi-model (GPT-4o, Claude, custom)
**Pricing:** Free (limited), $20/mo Pro, $40/mo Business
**Users:** 1M+ (as of early 2026)

**Strengths:**

- Deep editor integration (fork advantages)
- Multi-model support
- Excellent inline completions
- Composer for multi-file editing
- Codebase indexing

**Weaknesses:**

- Requires abandoning VS Code
- Proprietary fork, diverges from VS Code
- Limited extensions compatibility
- No desktop agent
- No MCP
- No mobile companion

## 13.2 Feature-by-Feature Comparison

| Feature                  | AGI Workforce  | Copilot    | Claude Code | Cline | Continue | Cursor     |
| ------------------------ | -------------- | ---------- | ----------- | ----- | -------- | ---------- |
| **Multi-model**          | 9+ providers   | 1          | 1           | BYOK  | BYOK     | 3          |
| **Auto-routing**         | 3 modes        | No         | No          | No    | No       | Limited    |
| **Inline completions**   | Yes            | Yes (best) | No          | No    | Yes      | Yes (best) |
| **@mention participant** | @agi           | @github    | @claude     | No    | No       | N/A        |
| **Slash commands**       | 6              | 6          | 1           | No    | Yes      | Yes        |
| **Code actions**         | 4 types        | Yes        | No          | No    | No       | Yes        |
| **Agent mode**           | Yes            | Beta       | Yes         | Yes   | No       | Yes        |
| **Plan mode**            | Yes            | No         | No          | No    | No       | No         |
| **Batch undo**           | Yes            | No         | No          | No    | No       | No         |
| **Diff preview**         | Yes            | Yes        | No          | Yes   | No       | Yes        |
| **MCP tools**            | Via bridge     | No         | Limited     | Yes   | No       | No         |
| **Desktop bridge**       | Yes            | No         | No          | No    | No       | No         |
| **Agent status bar**     | Yes            | No         | No          | No    | No       | No         |
| **Workspace indexing**   | 100 files      | Full       | Full        | Yes   | Custom   | Full       |
| **Git integration**      | 4 commands     | PR review  | No          | Yes   | No       | Yes        |
| **Conversation history** | Tree view      | Yes        | Yes         | Yes   | No       | Yes        |
| **Remote model catalog** | Yes (hourly)   | No         | No          | No    | No       | No         |
| **Telemetry controls**   | 2-layer opt-in | VS Code    | VS Code     | No    | VS Code  | Yes        |
| **Free tier**            | No (BYOK)      | Yes        | No          | Yes   | Yes      | Yes        |
| **Open source**          | No             | No         | No          | Yes   | Yes      | No         |
| **Desktop OS control**   | Via bridge     | No         | No          | No    | No       | No         |

## 13.3 Where AGI Workforce Leads

### 13.3.1 Multi-Model Access

AGI Workforce is the only VS Code extension that provides:

- 15+ models across 9 providers in a single QuickPick
- Auto-routing (balanced, economy, premium) that picks the best model per task
- Remote model catalog that adds new models without extension updates
- Model comparison (planned) to evaluate quality side-by-side

No competitor offers this breadth in a VS Code extension.

### 13.3.2 Desktop Agent Bridge

AGI Workforce is the only extension with a native bridge to a desktop agent runtime:

- Real-time agent status monitoring
- Send code/context from VS Code to desktop agent
- Trigger desktop agent actions from VS Code
- MCP tool access through the desktop runtime
- Computer use capabilities (desktop control) accessible from the IDE

This is a unique capability that no competitor offers.

### 13.3.3 Plan-Then-Execute Agent Mode

AGI Workforce's agent mode with plan mode is unique:

1. Agent reads files and understands the codebase
2. Agent outputs a numbered plan (no edits yet)
3. User reviews the plan
4. User says "proceed" to execute
5. Agent applies all changes with diff preview
6. User can undo the entire batch with one click

No other extension provides this full plan-review-execute-undo cycle.

### 13.3.4 Iteration-Limited Autonomous Mode

The configurable iteration limit (default 25) with user confirmation prevents runaway agent loops while still enabling powerful autonomous workflows. Competitors either don't have agent mode or don't have configurable safety limits.

## 13.4 Where Parity is Needed

### 13.4.1 Inline Completion Quality

**Gap:** GitHub Copilot and Cursor have superior inline completion quality and speed due to:

- Purpose-built completion models
- Larger training datasets
- Deeper editor integration

**Plan:** Improve completion quality through:

- Better prompt engineering for completion tasks
- Suffix context (partially implemented)
- Fill-in-the-middle support (planned)
- Multi-line completion (planned)
- Dedicated completion model routing via auto-economy

### 13.4.2 Workspace-Wide Context

**Gap:** Copilot and Cursor index the entire workspace. AGI Workforce indexes 100 files.

**Plan:** Increase index limits, add embeddings-based search via desktop bridge, support `@workspace` context in chat.

### 13.4.3 Terminal Integration in Agent Mode

**Gap:** Claude Code and Cline can execute terminal commands. AGI Workforce's agent mode cannot.

**Plan:** Add terminal command execution to agent mode (P2), with user approval and output capture.

### 13.4.4 Free Tier

**Gap:** Copilot, Cline, and Continue all offer free tiers. AGI Workforce requires an API key.

**Plan:** Introduce a free tier with limited daily messages using economy models. The `vscode.lm` fallback partially addresses this for Copilot users.

## 13.5 Strategic Gaps to Own

### 13.5.1 VS Code + Desktop Agent Convergence

No competitor has a bridge between a VS Code extension and a native desktop agent. This enables:

- File system access beyond the workspace
- Application automation (browser, email, calendar)
- Background agents that persist after VS Code closes
- Multi-agent swarms coordinating across desktop and IDE
- MCP tools with native transport support

### 13.5.2 Model Marketplace in VS Code

Planned: a model marketplace within the extension where users can browse, compare, and select models with pricing transparency. No competitor provides in-IDE model shopping.

### 13.5.3 Cross-IDE Consistency

AGI Workforce provides the same AI capabilities across:

- VS Code extension
- Desktop app (Tauri)
- Web app (Next.js)
- Mobile app (React Native)
- Chrome extension

No competitor offers this breadth of platform support with a unified backend.

### 13.5.4 Enterprise Multi-Model Governance

For enterprises, AGI Workforce enables:

- Centralized model access control (which models each team can use)
- Cost attribution per developer, per team
- Model usage audit logs
- BYOK with organization-wide key management
- Vendor diversification to prevent lock-in

No extension-based competitor offers these enterprise governance features.

---

# Appendix A: Complete VS Code Settings Reference

## A.1 All Configuration Properties

### A.1.1 Core Settings

| Setting                           | Type      | Default                               | Scope | Description                                                                              |
| --------------------------------- | --------- | ------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `agiWorkforce.apiEndpoint`        | `string`  | `https://agiworkforce.com/api/llm/v1` | User  | AGI Workforce API endpoint base URL                                                      |
| `agiWorkforce.model`              | `string`  | `auto-balanced`                       | User  | Default LLM model (e.g. auto-balanced, claude-sonnet-4.6, gpt-5.2, gemini-3-pro-preview) |
| `agiWorkforce.streamingEnabled`   | `boolean` | `true`                                | User  | Enable streaming responses from AGI Workforce API                                        |
| `agiWorkforce.contextLines`       | `number`  | `50`                                  | User  | Number of surrounding lines to include as context (min: 0, max: 500)                     |
| `agiWorkforce.fallbackToVscodeLm` | `boolean` | `true`                                | User  | Fall back to VS Code built-in Language Model API if AGI Workforce API is unavailable     |
| `agiWorkforce.telemetryEnabled`   | `boolean` | `false`                               | User  | Send anonymous usage telemetry to help improve AGI Workforce                             |

### A.1.2 UI Settings

| Setting                       | Type      | Default | Scope | Description                                                   |
| ----------------------------- | --------- | ------- | ----- | ------------------------------------------------------------- |
| `agiWorkforce.hoverEnabled`   | `boolean` | `false` | User  | Show AGI Workforce quick actions on hover over identifiers    |
| `agiWorkforce.autoApplyFixes` | `boolean` | `false` | User  | Automatically apply AI-suggested fixes without showing a diff |

### A.1.3 Inline Completion Settings

| Setting                                     | Type      | Default | Range   | Scope | Description                                                         |
| ------------------------------------------- | --------- | ------- | ------- | ----- | ------------------------------------------------------------------- |
| `agiWorkforce.inlineCompletions.enabled`    | `boolean` | `false` | --      | User  | Enable ghost-text inline completions (requires API key)             |
| `agiWorkforce.inlineCompletions.debounceMs` | `number`  | `300`   | 50-2000 | User  | Debounce delay in milliseconds before requesting inline completions |
| `agiWorkforce.inlineCompletions.maxLength`  | `number`  | `500`   | 50-5000 | User  | Maximum character length for inline completion suggestions          |

### A.1.4 Agent Settings

| Setting                            | Type      | Default | Range | Scope | Description                                                      |
| ---------------------------------- | --------- | ------- | ----- | ----- | ---------------------------------------------------------------- |
| `agiWorkforce.agent.planMode`      | `boolean` | `false` | --    | User  | Show a plan before executing agent tasks (requires confirmation) |
| `agiWorkforce.agent.maxIterations` | `number`  | `25`    | 1-200 | User  | Maximum autonomous continuation iterations per agent session     |

### A.1.5 Integration Settings

| Setting                              | Type      | Default | Range      | Scope | Description                                                          |
| ------------------------------------ | --------- | ------- | ---------- | ----- | -------------------------------------------------------------------- |
| `agiWorkforce.mcp.enabled`           | `boolean` | `false` | --         | User  | Enable Model Context Protocol (MCP) tool integrations                |
| `agiWorkforce.desktopBridge.enabled` | `boolean` | `true`  | --         | User  | Connect to AGI Workforce desktop app for extended agent capabilities |
| `agiWorkforce.desktopBridge.port`    | `number`  | `8787`  | 1024-65535 | User  | Local port for AGI Workforce desktop bridge connection               |

---

# Appendix B: Complete Keybinding Reference

## B.1 Default Keybindings

| Command           | macOS             | Windows/Linux      | When Clause          |
| ----------------- | ----------------- | ------------------ | -------------------- |
| Open Chat         | `Cmd+Shift+A`     | `Ctrl+Shift+A`     | `!terminalFocus`     |
| Explain Selection | `Cmd+Shift+Alt+E` | `Ctrl+Shift+Alt+E` | `editorHasSelection` |
| Agent Mode        | `Cmd+Shift+Alt+G` | `Ctrl+Shift+Alt+G` | (always)             |

## B.2 Planned Keybindings

| Command                   | macOS (Proposed)  | Windows/Linux (Proposed) | When Clause          |
| ------------------------- | ----------------- | ------------------------ | -------------------- |
| Fix Issue                 | `Cmd+Shift+Alt+F` | `Ctrl+Shift+Alt+F`       | `editorHasSelection` |
| Generate Tests            | `Cmd+Shift+Alt+T` | `Ctrl+Shift+Alt+T`       | `editorHasSelection` |
| Select Model              | `Cmd+Shift+Alt+M` | `Ctrl+Shift+Alt+M`       | (always)             |
| Inline Completions Toggle | `Cmd+Shift+Alt+I` | `Ctrl+Shift+Alt+I`       | (always)             |

## B.3 Keybinding Conflicts

The chosen keybindings are designed to avoid conflicts with:

- VS Code default keybindings
- Common extension keybindings (Copilot, GitLens, etc.)
- OS-level shortcuts

The `Cmd+Shift+A` / `Ctrl+Shift+A` binding for Open Chat is the most commonly used and is chosen for:

- Memorable (A for AI/AGI)
- Not conflicting with Copilot (`Ctrl+Shift+I`)
- Not conflicting with VS Code defaults

---

# Appendix C: Marketplace Submission Checklist

## C.1 Pre-Submission

- [ ] Extension builds without errors (`pnpm typecheck && pnpm lint && pnpm compile`)
- [ ] All unit tests pass (`pnpm test`)
- [ ] VSIX packages correctly (`pnpm package`)
- [ ] README.md is complete with feature descriptions, screenshots, and getting started guide
- [ ] CHANGELOG.md has initial version entry
- [ ] Icon (`media/icon.png`) is 128x128 PNG with transparent background
- [ ] Activity bar icon (`media/icon-sidebar.svg`) is monochrome SVG
- [ ] Chat icon (`media/icon-chat.png`) is visible at 16x16 and 32x32
- [ ] package.json has correct publisher, version, and repository fields
- [ ] LICENSE file is present
- [ ] .vscodeignore excludes source, tests, and build tools

## C.2 Publisher Setup

- [ ] Create publisher account at https://marketplace.visualstudio.com/manage
- [ ] Publisher ID: `agiworkforce`
- [ ] Generate Personal Access Token (PAT) with Marketplace > Manage scope
- [ ] Store PAT in GitHub Secrets as `VSCE_PAT`

## C.3 First Publish

```bash
cd apps/extension-vscode
pnpm package                           # Build VSIX
npx vsce login agiworkforce            # Login with PAT
npx vsce publish                       # Publish to Marketplace
```

## C.4 Post-Submission Verification

- [ ] Extension appears in Marketplace search within 30 minutes
- [ ] Install from Marketplace on a clean VS Code instance
- [ ] Verify activation, set API key, send chat message
- [ ] Verify all commands appear in command palette
- [ ] Verify status bar items appear
- [ ] Check marketplace listing for correct icon, description, and categories

---

# Appendix D: Glossary

| Term                 | Definition                                                                              |
| -------------------- | --------------------------------------------------------------------------------------- |
| **BYOK**             | Bring Your Own Keys -- users provide their own API keys for LLM providers               |
| **Chat Participant** | VS Code API for registering AI assistants in the Chat panel (@mention)                  |
| **CSP**              | Content Security Policy -- browser security mechanism restricting resource loading      |
| **Desktop Bridge**   | Local WebSocket/HTTP connection between VS Code extension and AGI Workforce desktop app |
| **Ghost Text**       | Translucent inline completion suggestions shown in the editor                           |
| **MCP**              | Model Context Protocol -- standard for connecting AI models to external tools           |
| **Nonce**            | Cryptographic random value used in CSP to authorize specific inline scripts/styles      |
| **QuickPick**        | VS Code UI element for presenting a filterable list of options                          |
| **SecretStorage**    | VS Code API for secure credential storage backed by OS keychain                         |
| **SSE**              | Server-Sent Events -- HTTP streaming protocol for real-time data                        |
| **VSIX**             | VS Code extension package format (ZIP archive with manifest)                            |
| **WebviewView**      | VS Code API for rendering HTML content in sidebar panels                                |
| **WebviewPanel**     | VS Code API for rendering HTML content in editor tabs                                   |
| **WorkspaceEdit**    | VS Code API for batch file modifications (create, edit, delete)                         |

---

# Appendix E: Revision History

| Version | Date       | Author       | Changes                   |
| ------- | ---------- | ------------ | ------------------------- |
| 1.0.0   | 2026-03-09 | Product Team | Initial comprehensive PRD |

---

_End of PRD-VSCODE.md_
