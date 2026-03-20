# Cross-Surface Appendix

This appendix defines the shared system architecture that applies across all six AGI Workforce applications.

It should be read together with:

- `docs/applications/cli.md`
- `docs/applications/desktop.md`
- `docs/applications/browser-extension.md`
- `docs/applications/vscode-extension.md`
- `docs/applications/mobile.md`
- `docs/applications/web.md`

## 1. Product architecture model

AGI Workforce is one product with six surfaces and one shared operating model.

### Surface roles

- `desktop` = local execution authority
- `web` = hosted control plane and public surface
- `mobile` = companion, approvals, voice, and continuity surface
- `cli` = terminal-native agent runtime
- `extension-vscode` = IDE-native coding surface
- `extension` = browser bridge

### Operating rule

No surface should try to impersonate all the others. Each surface should be best in its environment while sharing common product concepts.

## 2. Shared product objects

Every surface should align on the same conceptual objects, even if the storage model differs.

### Core objects

- user
- organization / workspace
- conversation
- message
- project
- task / scheduled work item
- artifact / generated file
- approval request
- tool call and tool result
- connector / app / MCP server
- agent / subagent
- skill / workflow template
- model and routing profile

### Contract rule

The shape and semantics of these objects should be shared where possible through shared packages or contract docs. Surface-local shape differences should be documented, not accidental.

## 3. Shared design principles

### Principle 1: visible execution

Users should be able to see:

- what the system is doing
- what tool is running
- whether approval is required
- what changed
- what result was produced

### Principle 2: reversible actions

Any mutating workflow should surface:

- preview where possible
- approval when risky
- undo or recovery path where feasible

### Principle 3: benchmark without cloning

Claude and OpenAI should be used as reference points for product quality and interaction patterns. AGI Workforce should not cargo-cult their exact structure when its own surface boundaries differ.

### Principle 4: context discipline

The system should gather enough context to be useful without turning every request into an unbounded context dump.

### Principle 5: local-vs-hosted clarity

Users should always be able to tell:

- what is happening locally
- what is happening in the cloud
- what data is being shared externally

## 4. Shared layout rules

### Common layout posture

All surfaces should organize around:

- primary task area
- visible system status
- explicit approvals for risky work
- recoverable errors
- clear navigation between ongoing work and historical work

### Surface-specific expression

- desktop = multi-pane workspace
- web = public shell + dashboard shell
- mobile = tab + stack + sheet model
- VS Code = tree views, editor affordances, webview panels
- CLI = linear terminal transcript
- browser extension = compact popup + side panel

## 5. Shared component system expectations

Every surface should have equivalents of the following interaction patterns, expressed natively for the environment:

- prompt/composer
- conversation stream
- tool status
- approval interaction
- artifact/result rendering
- history view
- context view
- settings/preferences
- connection or health status

## 6. Shared frontend architecture rules

### Rule 1

Keep view rendering separate from orchestration and service logic.

### Rule 2

Keep domain state separated:

- auth/account state
- conversation/message state
- tool/execution state
- settings/UI shell state
- feature-module state

### Rule 3

Event streams should be normalized before hitting presentation components.

### Rule 4

Surface-local UI code should not silently reimplement product-wide business rules.

## 7. Shared backend/runtime architecture rules

### Desktop

Owns privileged local runtime work.

### Web

Owns hosted APIs, public lifecycle, account state, and hosted integrations.

### CLI

Owns terminal-local runtime logic and direct provider/tool access for shell users.

### VS Code

Owns editor-local orchestration and optional bridge integration.

### Mobile

Owns mobile-native runtime concerns, not privileged execution.

### Extension

Owns browser-local runtime concerns, not product-wide orchestration.

## 8. Shared LM architecture

### Model catalog

Every surface should consume a common model vocabulary:

- model ids
- provider mapping
- capability flags
- cost and usage metadata
- auto-routing profiles

### Routing rules

- desktop and CLI should have the strongest direct model/runtime control
- web should own hosted LM use cases
- VS Code should use hosted LLM APIs with optional desktop escalation
- mobile should use hosted or paired-desktop paths
- browser extension should avoid becoming an independent model-routing system

### Context rules

- system prompt assembly should be deterministic
- projects, memory, and conversation state should be applied consistently
- attachments and files should be bounded and typed
- context compaction should be available for long-running work

## 9. Shared API architecture

### API layers

1. hosted API layer
2. local runtime API layer
3. event/stream layer
4. connector/app integration layer

### Rules

- validate requests
- limit access
- log failures safely
- avoid leaking secrets
- keep route boundaries explicit

## 10. Shared tool architecture

### Tool classes

- read tools
- write tools
- execution tools
- research/search tools
- connector/app tools
- workflow tools
- artifact-generation tools

### Shared approval model

Every surface should respect a common approval vocabulary:

- safe/read-only
- user-visible but low-risk
- mutating and reviewable
- high-risk / explicit confirmation required

## 11. Shared connector and app model

The product should distinguish clearly between:

- local connectors
- hosted connectors
- browser extensions
- IDE integrations
- MCP servers
- user-facing apps or app-like integrations

Anthropic and OpenAI both increasingly formalize this distinction. AGI Workforce should do the same to avoid product confusion.

## 12. Shared projects, memory, and tasks model

### Projects

Projects should be long-lived workspaces that may contain:

- instructions
- files
- conversations
- artifacts
- model preferences
- memory scoped to the project

### Memory

Memory should be layered:

- global
- organization/workspace
- project
- conversation
- local runtime/session where appropriate

### Tasks

Tasks or scheduled work should have:

- source prompt or workflow
- execution environment
- schedule
- current status
- notification and audit trail

## 13. Shared security model

### Core rules

- secrets never stored in plaintext when avoidable
- explicit approval for risky actions
- allowlists for bridge and connector operations
- sanitization of rendered content and tool output
- privacy boundary between local and hosted work

## 14. Shared observability model

Every surface should provide enough data to answer:

- what failed
- where it failed
- what the user experienced
- whether the issue is local, hosted, or integration-related

### Minimum observability categories

- auth/session
- model request lifecycle
- tool execution lifecycle
- connector lifecycle
- sync lifecycle
- performance metrics
- user-visible errors

## 15. Shared release gates

Before a cross-surface release is considered healthy, verify:

- auth continuity
- conversation continuity
- model selection and usage correctness
- approval workflows
- connector/app boundaries
- generated artifact/download flows
- degraded behavior under partial outage

## 16. Shared benchmark interpretation

### Anthropic references

- Claude Code
- Claude Desktop
- Claude mobile apps
- Claude connectors
- Claude file creation
- Claude computer use

### OpenAI references

- ChatGPT desktop
- ChatGPT apps/connectors
- ChatGPT synced connectors
- ChatGPT tasks
- ChatGPT projects
- Codex app and Codex multi-surface model

### Interpretation rule

Use these products as quality references, not as a requirement to replicate their exact IA, branding, or release sequencing.
