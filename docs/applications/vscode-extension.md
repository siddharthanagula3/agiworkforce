# VS Code Extension Product & Technical Specification

## 1. Mission

The VS Code extension should be the IDE-native AGI Workforce surface. It should help developers inside the editor with chat, code understanding, edit application, review, completions, and terminal help, while optionally escalating broader tasks to the desktop runtime.

## 2. Users and jobs-to-be-done

### Primary users

- developers working primarily in VS Code
- users who want coding assistance without leaving the editor
- teams comparing AGI Workforce to other AI coding extensions

### Jobs-to-be-done

- ask about code in place
- generate or apply edits safely
- review code and surface diagnostics
- get inline completions and context-aware help
- hand off larger workflows to desktop when needed

## 3. Scope and feature ownership

### The VS Code extension owns

- editor-native AI commands and surfaces
- code-focused chat and agent workflows
- workspace context gathering
- diff preview and patch application
- secure key storage inside VS Code

### It does not own

- the flagship desktop runtime
- general-purpose local automation outside editor context
- account and billing lifecycle UX
- browser automation

## 4. Feature set

### Core interaction features

- chat participant in VS Code chat
- sidebar webview
- conversation history tree
- context files tree
- command palette actions

### Coding features

- explain selection
- fix issues
- refactor code
- generate tests
- generate docs
- ask about code
- explain errors
- code review into diagnostics/problems
- hover and code actions
- inline completions
- CodeLens actions above symbols

### Agent features

- agent mode panel
- multi-file edit batches
- per-file accept/reject flows
- batch accept/reject behavior
- optional desktop escalation

### Observability features

- token counter
- token breakdown
- model dashboard
- bridge status bar

## 4A. Competitive benchmark lens

Four products define the competitive ceiling for AI-powered IDE extensions. AGI Workforce must match their strongest capabilities while pressing its own differentiators: 13 registered providers (chatParticipant, sidebar, agentMode, codeAction, codeLens, context, conversation, diagnostics, diff, errorExplainer, hover, inlineCompletion, terminal), desktop bridge escalation for privileged work, and comprehensive test coverage across every provider.

### GitHub Copilot

4.7M paid subscribers, 90% Fortune 100 adoption. Agent mode is GA with full edit-plan-execute loops. Coding Agent closes the issue-to-PR gap by letting users tag `@copilot` on a GitHub issue and receive a merge-ready pull request. Extensions (experimental, via `@github/copilot-sdk`) open a third-party ecosystem. Multi-model support spans Claude Opus 4.6, GPT-5.3-Codex, GPT-5.4-mini, and Gemini 3 Pro. Workspace indexing feeds repo-wide context into completions and chat. MCP support is shipping. Pricing: $10/mo individual, $19/mo business.

- Reference: https://github.blog/ai-and-ml/github-copilot/

### Cursor

v2.6, $2B ARR, $29.3B valuation. Subagents run as parallel workers inside the editor. Plugin Marketplace hosts first-party and community integrations (Amplitude, AWS, Figma, Linear, Stripe). MCP Apps render interactive UIs (charts, dashboards, diagrams) directly inside agent chat. Background Agents execute in cloud VMs on isolated repo clones and return merge-ready PRs. Bugbot Autofix processes 2M+ PRs/month with a 76% resolution rate. Automations trigger from external events (Slack, Linear, GitHub, PagerDuty, cron) and include four Security Automation templates. Composer 1.5 is a proprietary model. JetBrains support ships via ACP. Pricing: $20/mo Pro. Still enforces a 40-tool MCP cap.

- Reference: https://cursor.com/changelog

### Claude Code in VS Code

v2.1.79, 80K GitHub stars. Session listing appears in the VS Code activity bar. Native MCP server management dialog handles configuration without JSON editing. Skills 2.0 supports hot reload and custom agents. Agent Teams coordinate multiple Claude Code instances. Worktrees with sparse checkout keep parallel branches isolated. Remote control from phone or browser enables mobile approval flows. Hooks system (PreToolUse, PostToolUse, StopFailure, Elicitation) gates agent actions programmatically. Plugins and marketplaces extend capability. Voice mode (`/voice`, 20 languages) adds hands-free interaction. 1M context window on Max/Team/Enterprise plans. Opus 4.6 is the default model.

- Reference: https://code.claude.com/docs/en/changelog

### OpenAI Codex IDE Extension

Ships for VS Code, Cursor, and Windsurf. File referencing with `@` tagging pulls specific files into context. Switchable model selection with reasoning effort control (low/medium/high) lets users trade speed for depth. Three approval modes (Agent, Chat, Agent Full Access) set the autonomy boundary. Cloud delegation offloads larger tasks to Codex Cloud without blocking the editor. Web search and image drag-and-drop enrich prompts. Shares configuration with Codex CLI via AGENTS.md and MCP settings, creating a unified multi-surface experience.

- Reference: https://developers.openai.com/codex/ide/features

## 5. End-to-end flows

### Flow A: user asks about selected code

1. User selects code and invokes an AGI Workforce command.
2. Extension gathers selection, file, diagnostics, and workspace context.
3. Request is sent to the cloud LLM API.
4. Response streams into chat/sidebar or a result surface.
5. Conversation history updates and remains available in the tree view.

### Flow B: user requests an edit

1. User invokes fix/refactor/tests/docs from editor or sidebar.
2. Context builder prepares prompt context and constraints.
3. LM returns an edit or patch.
4. Patch engine applies diff decorations or opens diff views.
5. User accepts or rejects changes per diff, file, or batch.

### Flow C: user escalates to desktop

1. Task requires capabilities beyond editor-safe scope.
2. Extension sends a command to desktop bridge.
3. Desktop performs privileged or broader orchestration work.
4. Status and results return over HTTP/WebSocket bridge paths.

## 6. UI, look, and layout

### Visual rules

- follow VS Code theme variables and native idioms
- feel like a serious editor extension, not a mini marketing site
- place information where VS Code users expect it: tree views, status bar, diff editors, CodeLens, inline text

### Layout model

- activity-bar entry for AGI Workforce
- sidebar webview for conversation
- tree views for history and context
- status bar items for tokens, model/bridge state
- inline editor surfaces for CodeLens, hover, actions, completions, and diffs

### Look and feel rules

- webviews should be restrained and theme-aware
- multi-file agent mode should emphasize review and control
- inline completion UI should stay quiet until useful
- diagnostics-driven review should feel native to Problems panel workflows

## 7. UI components

### Primary components

- sidebar provider
- agent mode panel
- conversation tree provider
- context panel provider
- inline completion provider
- diagnostics provider
- CodeLens provider
- hover provider
- code action provider
- terminal provider
- error explainer provider
- model metrics panel

### Component rules

- every component should have a clear editor-native purpose
- webviews must preserve context safely and remain CSP-safe
- diff UI must default to review before blind application
- history and context views should be lightweight and navigable

## 8. Frontend architecture

### Runtime

- TypeScript extension host
- webview UI where richer chat UX is needed
- VS Code APIs for editor-native behaviors

### Frontend responsibilities

- register commands and providers
- collect workspace/editor context
- manage conversation and view state
- render webview UI
- surface editor-native affordances

### Key code areas

- `apps/extension-vscode/src/extension.ts`
- `apps/extension-vscode/src/providers/*`
- `apps/extension-vscode/src/services/*`
- `apps/extension-vscode/src/storage/conversationStore.ts`

## 9. Backend/runtime architecture

For this surface, the “backend” is the extension-host service layer plus optional desktop bridge integration.

### Responsibilities

- API calls to hosted LM endpoints
- bridge connection management
- workspace indexing
- context budgeting
- patch engine and diff application
- metrics and telemetry

### Key runtime modules

- `utils/api.ts`
- `services/desktopBridge.ts`
- `services/contextBuilder.ts`
- `services/contextBudget.ts`
- `services/workspaceIndexer.ts`
- `services/patchEngine.ts`

## 10. LM architecture

### Default model path

- use hosted AGI Workforce LLM endpoints
- support model selection via extension settings
- stream responses by default where possible

### Fallback path

- allow fallback to VS Code LM APIs when configured
- keep fallback behavior explicit and understandable

### Context behavior

- include selection, current file, diagnostics, git state, open files, and workspace index where relevant
- enforce context budgets rather than shoving everything into every request
- track tokens, usage, and model metrics

## 11. API architecture

### Hosted API

The extension should talk to an OpenAI-compatible chat completion endpoint with streaming support. The extension should not make the desktop bridge the primary LM path.

### Bridge API

Desktop bridge should remain for non-AI operations or extended local capabilities:

- HTTP for commands
- WebSocket for real-time events
- health-check endpoint for status

### API rules

- auth keys live in VS Code SecretStorage
- request/response typing should be stable
- retries should be conservative
- bridge commands should be allowlisted

## 12. Tool architecture

### Tool categories

- editor-context tools
- patch and diff tools
- diagnostics/review tools
- terminal assistance tools
- desktop bridge tools

### Tool rules

- editor changes should always be reviewable
- terminal actions should be explicit user-initiated workflows
- desktop bridge should only expose narrow, well-defined operations
- no silent privileged execution

## 13. Data, state, and sync

### Required state

- conversation history
- pinned context files
- token and model metrics
- diff sessions
- bridge status
- settings and feature flags

### Persistence rules

- secrets in SecretStorage
- conversations and metrics in global/workspace state where appropriate
- avoid over-persisting temporary editor noise

## 14. Security and privacy

- API keys must stay in SecretStorage
- webviews need strict CSP and sanitization
- diff application must be transparent
- bridge access must remain localhost-scoped and controlled
- telemetry must be optional

## 15. Performance and reliability

- activation must not feel heavy
- context gathering must stay incremental
- webview state should be retained where it materially improves UX
- bridge reconnect behavior should be clear and bounded
- completion latency must remain low enough for typing use cases

## 16. Observability, testing, and release gates

### Testing expectations

- extension activation tests
- API client tests
- chat participant tests
- inline completion tests
- diff application tests
- desktop bridge tests
- workspace indexer tests

### Release gates

- extension activates cleanly
- commands match package contributions
- streaming chat works
- diff apply/accept/reject works
- bridge status and reconnect UX works
- secret storage flows work

## 17. Definition of done

The VS Code extension is in the right state when:

- it feels native inside VS Code
- coding workflows are fast and reviewable
- editor context is strong without being noisy
- desktop escalation exists for broader tasks without becoming a crutch

## 18. Canonical implementation anchors

- `apps/extension-vscode/package.json`
- `apps/extension-vscode/src/extension.ts`
- `apps/extension-vscode/src/providers/sidebarProvider.ts`
- `apps/extension-vscode/src/providers/agentModeProvider.ts`
- `apps/extension-vscode/src/utils/api.ts`
- `apps/extension-vscode/src/services/desktopBridge.ts`
- `apps/extension-vscode/README.md`

## 19. Surface inventory

### Native VS Code surfaces

- chat participant
- activity bar entry
- sidebar webview
- conversation history tree
- context files tree
- status bar items
- editor CodeLens, hover, code actions, diagnostics, and inline completions

### User action inventory

- explain
- fix
- refactor
- generate tests
- generate docs
- code review
- ask about code
- explain terminal output
- run command
- suggest command
- add/remove/clear context

## 20. Component and service inventory

### Provider inventory

- `chatParticipant`
- `sidebarProvider`
- `agentModeProvider`
- `codeActionProvider`
- `codeLensProvider`
- `contextPanelProvider`
- `conversationTreeProvider`
- `diagnosticsProvider`
- `diffDecorationProvider`
- `errorExplainerProvider`
- `hoverProvider`
- `inlineCompletionProvider`
- `terminalProvider`

### Service inventory

- `contextBuilder`
- `contextBudget`
- `workspaceIndexer`
- `desktopBridge`
- `tokenCounter`
- `modelMetrics`
- `patchEngine`
- `telemetry`

## 21. API and tool inventory

### Hosted API inventory

- chat completions
- streaming completions
- model selection metadata
- auth via stored key

### Bridge inventory

- local health check
- local command dispatch
- local WebSocket event feed

### Tool inventory

- editor-context explain/fix/refactor
- diff apply/accept/reject
- diagnostics review
- terminal explanation/suggestion
- desktop bridge delegation

## 22. Phased roadmap

### Phase 1: Agent parity

- background and cloud agents: delegate tasks to sandboxed cloud VMs that return merge-ready PRs without blocking the editor (Cursor Background Agents, Codex Cloud pattern)
- event-triggered automations: configure workflows that fire on Slack messages, GitHub events, Linear updates, PagerDuty alerts, or cron schedules (Cursor Automations pattern)
- MCP Apps support: render interactive tool UIs (charts, diagrams, dashboards) directly inside agent chat threads (Cursor MCP Apps pattern)

### Phase 2: Cross-surface skill sharing

- portable skills: skills and workflows created in CLI, desktop, or web are discoverable and executable from the IDE without re-authoring
- AGENTS.md alignment: adopt the AGENTS.md / SKILL.md configuration standard used by Codex and Cursor so project-level agent instructions work across all surfaces
- plugin marketplace for IDE: surface community and first-party plugins inside the extension, synchronized with the desktop marketplace catalog

### Phase 3: Multi-IDE and enterprise

- ACP protocol support: expose an ACP-compatible interface so AGI Workforce agents run natively in JetBrains and Zed IDEs alongside the VS Code extension
- admin analytics and policy hooks: managed deployment controls, usage dashboards, model allow/deny lists, and cost guardrails for enterprise teams
- security review automation: automated PR review with vulnerability detection and fix suggestions, modeled on Cursor Bugbot's 76% resolution approach

## 23. Gap analysis

### vs GitHub Copilot

- GitHub ecosystem integration: Copilot's Coding Agent turns GitHub issues into PRs end-to-end; AGI Workforce lacks native issue-to-PR automation tied to a repository platform
- multi-model breadth: Copilot offers Claude Opus 4.6, GPT-5.3-Codex, GPT-5.4-mini, and Gemini 3 Pro inside the IDE; AGI Workforce supports more providers overall but model switching UX in the extension is less polished
- user base and ecosystem scale: 4.7M paid subscribers and a growing extension SDK create network effects AGI Workforce cannot yet match
- extension ecosystem: Copilot's `@github/copilot-sdk` enables third-party extensions; AGI Workforce has no equivalent SDK for community-built IDE plugins

### vs Cursor

- background agents in VMs: Cursor runs agent tasks in cloud VMs on isolated repo clones; AGI Workforce has no cloud execution environment for the IDE surface
- Automations: Cursor triggers agent workflows from Slack, Linear, GitHub, PagerDuty, and cron; AGI Workforce lacks event-driven automation from the IDE
- Bugbot Autofix: 2M+ PRs/month at 76% resolution rate; AGI Workforce has no equivalent automated security/code-review bot
- Plugin Marketplace: Cursor ships a marketplace with Amplitude, AWS, Figma, Linear, Stripe plugins; AGI Workforce's IDE has no plugin system
- MCP Apps: interactive UIs (charts, diagrams, dashboards) render in Cursor's agent chat; AGI Workforce MCP tools return text-only results in the IDE
- market validation: $2B ARR and $29.3B valuation confirm demand for the agent-IDE category at scale

### vs Claude Code

- Agent Teams: Claude Code coordinates multiple instances; AGI Workforce's IDE runs a single agent session
- Skills 2.0: hot-reloadable skills and custom agents with a mature plugin lifecycle; AGI Workforce skills are static and not hot-swappable in the IDE
- plugin ecosystem depth: Claude Code has a growing marketplace; AGI Workforce has no IDE plugin registry
- voice mode: `/voice` with 20 languages in terminal; AGI Workforce has no voice input in the IDE surface
- 1M context window: available on Max/Team/Enterprise; AGI Workforce context window is limited by provider defaults without a comparable tier
- remote control: approve/deny agent actions from phone or browser; AGI Workforce's mobile companion does not yet control IDE agent sessions

### vs Codex IDE Extension

- cloud delegation: Codex offloads tasks to Codex Cloud and returns results without blocking; AGI Workforce has no cloud execution backend for IDE tasks
- Codex Cloud background execution: long-running tasks execute in sandboxed environments; AGI Workforce requires the editor to remain active
- AGENTS.md shared config: Codex shares project-level agent instructions across CLI, IDE, and web; AGI Workforce configuration is per-surface
- multi-surface continuity: Codex maintains session context across CLI, IDE, web, and app; AGI Workforce surfaces share auth but not agent state

## 24. Feature acceptance criteria

| Feature                         | Acceptance criteria                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension activation            | Extension activates cleanly on supported VS Code versions without blocking the editor on non-critical failures.                                                                                                            |
| Sidebar and chat participant    | User can start a conversation from sidebar or `@agi`, stream replies, and preserve history coherently.                                                                                                                     |
| Context panel                   | User can pin, remove, clear, and refresh context files; active context is visible and reflected in requests.                                                                                                               |
| Explain/fix/refactor/tests/docs | Core code-assistance commands gather relevant context and return useful coding output from editor entry points.                                                                                                            |
| Agent mode                      | Multi-file edits are reviewable, stateful, and allow accept/reject at the right granularity.                                                                                                                               |
| Diff and patch review           | Diff sessions can be accepted/rejected per diff, file, or batch without corrupting file state.                                                                                                                             |
| Inline completions              | Completion latency is low enough for typing, respects config, and does not overwhelm normal editing.                                                                                                                       |
| Diagnostics/code review         | Review output lands in the Problems panel with usable issue mapping.                                                                                                                                                       |
| Terminal assistance             | User can ask for run/explain/suggest command help and receive context-aware results.                                                                                                                                       |
| Desktop bridge                  | Bridge status is visible, reconnects are understandable, and local delegation works without becoming the primary LM path.                                                                                                  |
| Background/cloud agents         | IDE can delegate tasks to cloud execution environments that return results/PRs without blocking the editor. Agent progress is visible in the sidebar, and completed work opens as reviewable diffs.                        |
| MCP Apps                        | Interactive tool UIs (charts, diagrams, dashboards) render inline within agent chat in the IDE. UIs are sandboxed, theme-aware, and respond to user interaction without leaving the conversation thread.                   |
| Event-triggered automation      | IDE can configure automations triggered by Slack, GitHub, Linear, or cron events. Automation definitions are editable from the IDE, with run history and logs visible in a dedicated panel.                                |
| Cross-surface skills            | Skills created in CLI or desktop are discoverable and usable from the IDE. Skill catalog syncs across surfaces, and IDE-invoked skills produce the same output as their CLI/desktop equivalents.                           |
| Security review automation      | Automated code review runs on PRs with vulnerability detection and fix suggestions. Results integrate into the Problems panel with severity ratings, and one-click fix application is available for supported issue types. |

## 25. Screen-by-screen and surface-by-surface implementation checklist

### Sidebar webview

- retains context when hidden
- supports message send, stream, cancel, and history updates
- remains theme-aware and CSP-safe

### Agent mode panel

- renders plan/progress state clearly
- supports multi-file patch review
- makes accept/reject actions obvious and reversible where feasible

### Conversation history tree

- lists recent conversations predictably
- supports open, delete, and refresh actions
- stays in sync with sidebar/chat participant activity

### Context panel

- shows pinned files clearly
- supports add/remove/clear/refresh actions
- reflects auto-context updates without being noisy

### Editor-native surfaces

- CodeLens renders above valid symbols
- hover actions are non-intrusive
- code actions appear in the expected lightbulb flows
- diagnostics map to files/lines correctly
- inline completions can be enabled/disabled without reload confusion

### Status and settings surfaces

- token counter updates correctly
- model metrics remain inspectable
- bridge status bar reflects true connection state
- settings changes take effect with minimal friction

## 26. Cross-surface skill sharing

Skills and workflows should be portable across CLI, IDE, desktop, and web. A user who builds a skill in the desktop app or CLI should find it immediately available in the VS Code extension without re-authoring.

### Configuration standards

- adopt AGENTS.md and SKILL.md as the project-level configuration standard for agent instructions and skill definitions. These files are already recognized by Codex, Cursor, and Copilot, making interoperability a baseline expectation rather than a differentiator
- a single `.agi/skills/` directory at the workspace root should be the canonical location for portable skills; all surfaces read from the same directory
- MCP server configuration should be shared between CLI and IDE (Codex pattern): one `.mcp.json` file, used by both `agiworkforce-cli` and the VS Code extension, avoiding divergent tool availability across surfaces

### Plugin marketplace alignment

- the IDE plugin catalog should mirror the desktop marketplace, so plugins installed in the desktop app are also available in VS Code
- plugins should declare their surface compatibility (CLI, IDE, desktop, web) in a manifest, and the IDE should only surface compatible plugins
- marketplace search, install, and update flows should work from within the extension's sidebar without requiring the desktop app

### Shared state model

- skill definitions, MCP server configs, and model preferences should sync through a shared configuration layer rather than per-surface storage
- when a user modifies a skill in the desktop app, the change should appear in the IDE on next activation without manual re-import
- credential sharing should go through SecretStorage on each surface, with a sync mechanism that avoids plaintext transfer between surfaces

## 27. Background and cloud agents

Cloud-based agent execution is the most significant capability gap between AGI Workforce's IDE surface and the current competitive field. Cursor, Codex, and Copilot all offer some form of "delegate work, get a PR back" without blocking the editor.

### Competitive patterns

- Cursor Background Agents: spin up cloud VMs with isolated repo clones, execute multi-step agent plans, and produce merge-ready PRs. The user reviews diffs in the IDE after completion
- Codex Cloud: assign a task from the IDE or CLI, and Codex executes it in a sandboxed cloud environment. Results return as a PR or a set of file changes
- GitHub Coding Agent: tag `@copilot` on a GitHub issue, and a background agent creates a branch, makes changes, and opens a PR for review

### Implementation approach

- the IDE should offer a "delegate to cloud" action that sends the current task context (files, instructions, conversation history) to a cloud execution backend
- cloud execution must happen in sandboxed environments with no access to the user's local filesystem or credentials beyond what is explicitly shared
- completed work should return as reviewable diffs in the IDE, not as auto-merged changes. The user must approve before any merge
- progress should be visible in the sidebar: queued, running, completed, failed states with logs accessible on click

### Safety and cost management

- sandboxed execution: cloud agents run in ephemeral containers with read-only access to the repo snapshot provided at delegation time
- approval before merge: all cloud-generated changes require explicit user review and approval in the IDE before any branch push or PR creation
- rate limits: configurable per-user and per-team limits on concurrent background tasks and monthly cloud compute usage
- cost visibility: estimated and actual costs for cloud execution should be visible before and after each task, integrated into the token counter and model metrics panel

## 28. Agent Client Protocol (ACP)

ACP is an open standard initiated by JetBrains and adopted by Zed that defines a communication protocol between AI agents and IDEs, analogous to what LSP did for language intelligence. Cursor is now available in JetBrains IDEs via ACP, validating the protocol as a viable multi-IDE distribution channel.

- Reference: https://blog.jetbrains.com/ai/2026/03/cursor-joined-the-acp-registry-and-is-now-live-in-your-jetbrains-ide/

### Why ACP matters for AGI Workforce

- multi-IDE distribution without per-editor rewrites: a single ACP-compatible agent backend can serve VS Code, JetBrains, Zed, and any future ACP-adopting editor
- competitive table stakes: Cursor's JetBrains availability via ACP means users who switch IDEs no longer lose their AI tooling. AGI Workforce must match this portability or accept IDE lock-in as a disadvantage
- protocol-first vs plugin-first: building to a protocol standard reduces maintenance burden compared to maintaining separate native plugins for each IDE

### How AGI Workforce could expose an ACP-compatible interface

- the existing extension host service layer (API client, context builder, patch engine, workspace indexer) already encapsulates the core agent logic. Wrapping this behind an ACP-compatible interface would expose the same capabilities to any ACP client
- the desktop bridge could serve as the ACP backend process, handling agent orchestration while the IDE-specific layer handles only UI rendering and editor integration
- provider registration (13 providers today) would map to ACP capability declarations, letting each IDE understand what the agent can do without IDE-specific negotiation

### Protocol vs plugin tradeoffs

- protocol approach (ACP): one agent backend, multi-IDE reach, lower per-IDE maintenance, but constrained to ACP's capability vocabulary and update cadence
- plugin approach (native extensions): full control over UX and deep IDE integration, but requires separate codebases for VS Code, JetBrains, and Zed
- recommended hybrid: maintain the VS Code extension as the primary surface with full UX control, and expose an ACP-compatible interface for JetBrains and Zed as a lower-maintenance expansion path
