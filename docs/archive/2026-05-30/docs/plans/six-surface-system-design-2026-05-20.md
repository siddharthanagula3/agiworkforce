# Six-Surface System Design Lock - 2026-05-20

Status: draft lock for implementation planning.

Purpose: define the system shape AGI should converge on across CLI, Desktop, Web, Mobile, Chrome extension, and VS Code extension. This plan synthesizes the repo SSOT, the 2026-05-15 design spec, reference UI/code folders, official Claude Code docs, and the 2026-05-20 parallel surface sweep.

Primary inputs:

- `AGI_WORKFORCE.md`, `BUILD.md`, `README.md`
- `docs/current/product-suite.md`, `docs/current/technical-architecture.md`, `PLAN.md`, `TODO.md`
- `docs/design/design-spec-2026-05-15.md`
- `~/Desktop/reference/ui`
- `~/Desktop/reference/src`
- `~/Desktop/reference/claw-code`
- Official Claude Code docs for extensibility, hooks, subagents, permissions, and configuration.

## 1. Product Thesis

AGI is one chat application shipped through six surfaces. The surfaces differ only where the platform demands it: native files, browser context, IDE context, mobile secure storage, Tauri IPC, or terminal behavior.

AGI wins by feeling Claude-grade while offering AGI-only provider freedom:

1. Multi-provider in one UI.
2. BYOK and Local LLM as first-class modes.
3. Cross-provider session continuity in one thread.
4. Claude-grade tools, skills, MCP, permissions, subagents, and artifacts across every surface.

## 2. Non-Negotiables

### One Chat Layout

The chat stream is the app. Images, videos, browser actions, terminal output, file reads, code diffs, web search, MCP output, skills, memory import, dispatch handoffs, and multi-agent status render inline in the conversation.

Allowed secondary surfaces:

- Left rail for conversation/project/navigation state.
- Bottom composer for prompt, attachments, model, mode, effort, voice, and send.
- Right artifact panel for explicit document/code/HTML/artifact preview.
- Modal/popover settings where required.

Not allowed:

- Separate terminal/database/images/workflow pages as primary destinations.
- Marketing-style empty states inside the product app.
- Surface-specific tool-call designs that drift from the shared inline tool grammar.

### One Model Catalog

No hardcoded model IDs. All model IDs flow from `packages/types/src/models.json` and catalog helpers.

Each surface can display a tailored picker, but it cannot own model identity, fallback policy, routing slots, pricing facts, or provider availability.

### One Mode Contract

Modes are shared product semantics, not per-surface booleans.

Canonical modes:

- `ask`: conservative default; approval for writes/destructive tools.
- `auto`: auto-approve low-risk actions with policy checks.
- `plan`: read/explore first, produce plan before writing.
- `accept-edits`: approve edits and common safe filesystem operations.
- `dont-ask`: deny tools unless pre-approved.
- `bypass`: full access for isolated environments only.

Every surface must map these modes to native UX:

- CLI/TUI: slash commands, footer status, permission banners.
- Desktop/Web: composer mode pill and settings.
- Mobile: compact mode pill and Dispatch approval UI.
- Chrome: ask/act browser-control selector.
- VS Code: `agiWorkforce.agent.mode` and command/chat participant behavior.

The 2026-05-20 VS Code fix proves why this must be centralized: chat participant, inline commands, and the Agent Mode panel had drifted because they read different settings.

### One Tool Event Contract

Every tool execution becomes a normalized event:

```ts
type ToolEvent = {
  id: string;
  messageId: string;
  runId: string;
  parentToolId?: string;
  source: 'builtin' | 'mcp' | 'plugin' | 'skill' | 'browser' | 'subagent' | 'system';
  kind:
    | 'bash'
    | 'read'
    | 'write'
    | 'edit'
    | 'web-search'
    | 'web-fetch'
    | 'fs-list'
    | 'image-gen'
    | 'browser'
    | 'mcp-custom'
    | 'thinking'
    | 'done'
    | 'unknown';
  label: string;
  providerLabel?: string;
  pluginLabel?: string;
  skillLabel?: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'partial';
  argsRedacted: Record<string, unknown>;
  resultPreview?: string;
  resultRedacted?: string;
  errorMessage?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  permissionDecision?: 'allowed' | 'asked' | 'denied' | 'blocked-by-policy';
};
```

Renderer rules:

- Collapsed row is borderless, 32px high, with a Lucide icon, label, muted arg summary, and chevron only when expandable.
- Multi-step sequences use a 1px left guideline.
- Expanded body uses recessed code surface with `Request` and `Response` sections.
- Tool cards are not allowed in the main chat stream except for genuinely rich domain cards such as flights/maps/video/artifacts.
- Tool details use redacted payloads by default.

## 3. Target Architecture

```text
Six surfaces
  CLI/TUI | Desktop | Web | Mobile | Chrome extension | VS Code extension
        |
        v
Surface shell adapters
  file picker, keychain, browser context, IDE context, push, IPC, terminal
        |
        v
Unified chat UI package
  messages, composer, inline tools, artifacts, side rail, model/mode/effort UI
        |
        v
Agent session protocol
  messages, stream chunks, tool events, permission requests, subagent events
        |
        v
Runtime orchestration
  Rust CLI engine, Tauri backend, web API gateway, mobile Dispatch bridge
        |
        v
Provider/runtime layer
  provider adapters, llm-normalize, routing, cache intent, usage observations
        |
        v
Tools and extensions
  built-in tools, MCP, skills, hooks, plugins, browser tool, computer use
        |
        v
State and persistence
  local SQLite/keychain or cloud data-layer/auth/storage/realtime
```

## 4. Layer Ownership

### `apps/cli`

Role: authoritative agent engine and terminal UX.

Owns:

- Agent loop and stream protocol.
- Tool execution and permission gates.
- MCP client/server.
- Skills loader and skill learner.
- Subagents and future `TeamCreate` orchestration.
- Slash commands, TUI command palette, model/effort selectors.

Must not own:

- Surface-specific visual design for desktop/web/mobile.
- Web billing/auth policy.
- Hardcoded model IDs.

2026-05-20 sweep result:

- Added `/effort` plus `/reasoning` alias to the active TUI slash command surface.
- Wired `/effort <level>` to the existing effort persistence path.
- Added legacy command-registry metadata.
- `cargo check --workspace` passed.
- `cargo test -p agiworkforce-cli command_registry --lib` passed 8/8.

### `apps/desktop`

Role: primary native shell and Local mode host.

Owns:

- Tauri IPC and Rust backend commands.
- Local mode: SQLite, Ollama/LMStudio, local files, local key storage.
- Desktop Dispatch listener.
- Native windowing, menu bar, auto-update, terminal/popout integration.
- Desktop shell around `packages/unified-chat`.

Must not own:

- Provider model catalog logic.
- A separate chat renderer.
- Dead legacy onboarding mode picker.

2026-05-20 sweep result:

- Fixed v3 left rail `New Chat` and conversation selection through the host bridge.
- Aligned rail sizing to 48px collapsed / 260px expanded.
- Desktop typecheck passed.
- True Tauri visual smoke remains pending; Vite web mode hit the auth gate.

### `apps/web`

Role: hosted cloud shell and account/billing/waitlist surface.

Owns:

- Next.js routes, auth, CSRF, billing, waitlist, public pages.
- Cloud chat host adapter.
- Web-only API routes and Supabase/data-layer use.
- Web release/deploy verification.

Must not own:

- A separate model catalog.
- A separate chat UI divergent from `packages/unified-chat`.
- Service-role bypasses for user-scoped work.

2026-05-20 sweep result:

- Tightened web chat density against the reference spec.
- Corrected pricing/waitlist copy and JSON-LD so dormant paid tiers are not presented as live checkout.
- Fixed proprietary footer string.
- Rounded `AgiMark` SVG coordinates to reduce hydration drift.
- Web typecheck, targeted ESLint, diff check, and `/pricing` Playwright render check passed.

Remaining web risk:

- Authenticated `/chat` transcript parity still needs a session-backed visual pass.
- Existing CSP/dev warnings and root-layout JSON-LD nonce mismatch remain outside this sweep.

### `apps/mobile`

Role: mobile companion and future app-store local/BYOK client.

Owns:

- Expo navigation, native secure storage, biometric gates.
- Push notifications and Dispatch approvals.
- Mobile file/photo capture flows.
- Mobile model/mode picker sheets.
- App Store and Play policy UX.

Must not own:

- Provider routing policy.
- Managed-cloud purchase policy outside StoreKit constraints.
- Separate tool-call grammar.

2026-05-20 sweep result:

- Fixed document picker flow so selected documents become composer attachments.
- Fixed model selector pill to use active native theme tokens.
- Local mobile lint passed for touched files.
- Full mobile typecheck is blocked by unrelated untracked storage files.

### `apps/extension`

Role: browser control plane.

Owns:

- MV3 background/content/side-panel/popup.
- Browser page context and WebMCP discovery.
- Autofill workflows.
- Native messaging bridge to desktop.
- Browser-specific prompt shortcuts.

Must not own:

- LLM brain logic.
- Model catalog drift.
- Emoji/marketing UI that diverges from the shared icon language.

2026-05-20 sweep result:

- Reworked popup/in-page panel/side panel toward tokenized AGI branding and icon controls.
- Fixed extension-local typecheck blockers.
- Typecheck, 764 tests, build, and lint passed.
- Chrome visual smoke remains pending because macOS screen capture failed while loading the unpacked extension.

### `apps/extension-vscode`

Role: IDE control plane.

Owns:

- VS Code chat participant.
- Sidebar webview.
- Command palette/commands/keybindings.
- IDE context files/history/model picker.
- Desktop bridge.

Must not own:

- Separate agent mode semantics.
- Hardcoded provider-specific copy.
- MCP/plugins/skills status hidden behind scattered commands only.

2026-05-20 sweep result:

- Fixed plan-mode drift across chat participant, inline commands, and Agent Mode panel.
- Replaced stale Claude-specific copy with AGI/provider-neutral wording.
- Typecheck, 509 tests, lint, and VSIX package passed.

### `packages/unified-chat`

Role: canonical visual chat surface.

Owns:

- Chat stream.
- Composer.
- Shared model/mode/effort UI primitives.
- Inline tool calls.
- Artifact panel.
- Sidebar primitives.
- Shared design tokens consumed by desktop/web and adapted by extension/mobile where needed.

Must not own:

- Provider SDK calls.
- Tauri/Web/Mobile platform APIs.
- Billing/auth side effects.

2026-05-20 sweep in progress:

- `MessageBubble` now uses `InlineToolCall`/`InlineToolCallStack` instead of bordered tool cards.
- `InlineToolCall` token usage is being corrected to `--chat-*` variables.
- Package-level typecheck passed and unified-chat tests passed 361/361 after token expectation reconciliation.

## 5. Agent Runtime Design

The agent session protocol is the shared boundary between surfaces and runtime.

Required event families:

- `message.created`
- `message.delta`
- `message.completed`
- `tool.started`
- `tool.delta`
- `tool.completed`
- `tool.failed`
- `permission.requested`
- `permission.resolved`
- `artifact.created`
- `artifact.updated`
- `subagent.started`
- `subagent.completed`
- `team.created`
- `team.updated`
- `run.completed`

Design rules:

- Events are append-only.
- Every event has `runId`, `conversationId`, and `messageId` where applicable.
- Tool args/results are redacted before they reach UI logs.
- Raw provider payloads stay behind debug-only boundaries.

## 6. Subagents and TeamCreate

Subagents are runtime primitives, not surface widgets.

Minimum contract:

```ts
type AgentSpec = {
  id: string;
  name: string;
  description: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh';
  mode?: AgentMode;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  mcpServers?: string[];
  isolation?: 'shared' | 'worktree';
  maxTurns?: number;
};
```

`TeamCreate` should create a group of `AgentSpec` objects plus a shared task board:

- Main coordinator owns task decomposition and final synthesis.
- Agents own bounded work scopes.
- Write scopes are explicit.
- Status renders inline in chat and optionally in a compact task panel.
- Team results return summaries plus changed-file lists.

No surface should implement its own team scheduler. CLI/runtime owns scheduling; surfaces render state.

## 7. Provider and Routing Design

Provider adapters implement one owned contract:

- `catalog()`
- `stream()`
- optional replay policy
- optional tool schema normalization
- optional cache policy
- optional provider-specific capabilities

Routing output:

```ts
type RoutingDecision = {
  source: 'manual' | 'auto';
  provider: string;
  model: string;
  slot?: string;
  taskType?: string;
  reason: string;
  fallbackChain: string[];
  budgetEstimate?: UsageEstimate;
  cacheIntent?: CacheIntent;
};
```

Rules:

- The UI renders "why this model" from `RoutingDecision`.
- Managed cloud routes enforce quotas before the provider call.
- BYOK routes estimate spend and show a pre-request quota/spend line where possible.
- Local routes never require Supabase auth.
- Fallback must preserve conversation/tool-call continuity through `llm-normalize`.

## 8. Tools, MCP, Skills, Hooks, Plugins

Built-in tools belong to the runtime and emit normalized tool events:

- filesystem read/list/write/edit
- shell/terminal
- apply patch
- browser automation
- web search/fetch
- image/video/document generation adapters
- task/subagent/team creation

MCP is a supply-chain and permissions product.

MCP trust levels:

- `official`: shipped and maintained by AGI.
- `verified`: reviewed metadata and known publisher.
- `project`: checked into repo/project config.
- `custom`: user-supplied local/server config.

Every MCP tool needs:

- server label
- tool label
- scope summary
- destructive flag
- permission default
- output token cap
- audit log entry

Skills are markdown instructions plus optional assets/scripts/MCP requirements.

Skill UI rules:

- Skill presence should be visible in composer and inline tool/status output.
- Skill invocation should show a small skill indicator, not a separate page.
- Learned skills must have provenance and pruning.

Hooks are lifecycle automation. Supported hook types should include:

- command
- HTTP
- MCP tool
- prompt verifier
- agent verifier

Hook output cannot bypass deny rules. Deny-first policy remains absolute.

Plugins package skills, hooks, MCP servers, agents, and commands. Plugin install must define marketplace/source, version, permissions, installed files, revocation path, and update policy.

## 9. State and Persistence

| Object        | Local mode            | Cloud mode              | Conflict behavior                             |
| ------------- | --------------------- | ----------------------- | --------------------------------------------- |
| Preferences   | local store           | data-layer              | last-write-wins                               |
| Conversations | SQLite                | append-only event log   | append-only with repair                       |
| Messages      | SQLite                | append-only event log   | immutable after completion except annotations |
| Tool audit    | SQLite                | append-only audit table | immutable                                     |
| Artifacts     | local files/SQLite    | storage + DB metadata   | versioned                                     |
| Memory        | local markdown/SQLite | explicit import/export  | user-controlled merge                         |
| Provider keys | keychain/secure store | never plaintext in DB   | no sync unless explicitly encrypted           |

Local mode must work with no Supabase, no auth, SQLite/OS secure storage, Ollama/LMStudio, and no network except chosen providers/local runtimes.

Cloud mode uses Supabase today through `packages/data-layer`, BYOK or future managed cloud quotas, realtime sync, Dispatch, and optional waitlist/billing state.

## 10. Permission and Safety Design

Permission evaluation order:

1. Managed/policy deny.
2. User/project deny.
3. Prompt-injection/tool-risk classifier where enabled.
4. Hook verifier.
5. User/project allow.
6. Mode default.
7. Prompt user if required.

Non-negotiable safety:

- Prompt/output telemetry off by default.
- No prompts, outputs, provider keys, or raw tool payloads in logs without explicit debug mode.
- MCP custom servers show trust warnings.
- Browser/page-supplied tool descriptions are labeled as page-originated.
- Destructive shell/file operations require explicit mode or permission.
- `bypass` mode is visible and visually distinct.
- App-store AI safety and report flows exist on mobile.

## 11. Visual System

All surfaces should converge on:

- warm off-white / warm charcoal canvas
- 14px dense chat text on desktop/web/extension
- 15px floor on mobile
- Lucide-style icons
- no emoji controls in core product UI
- collapsed rail 48px, expanded rail 260px
- composer max width near 760px on desktop/web
- bottom composer with plus, model, mode/permissions, effort/thinking, mic, send
- model picker inside composer, not top bar
- mode/permission inside composer, not buried only in settings
- 3-5 starter chips max
- artifact panel only when relevant

Inline tool visual grammar:

- tiny operation icon at the left
- plain-text label with muted args
- vertical guide for sequences
- recessed code panel when expanded
- `Request` / `Response` body sections
- status suffix only when it carries useful state
- plugin/skill/MCP labels in compact badges

Settings should be dense and utilitarian:

- Account
- Appearance
- Models and BYOK
- Local runtimes
- MCP servers
- Skills
- Plugins
- Permissions
- Usage/waitlist/billing
- Privacy/export/delete

Chrome and VS Code should expose compact status/control panes rather than full settings clones.

## 12. Same-Device Parallel Work Rules

This repo is often edited by multiple agents and user-run tools at once. Future agents must follow these rules:

- Never run destructive git commands unless the user explicitly asks.
- Never run broad `pnpm format`, repo-wide codemods, or generated-file rewrites during parallel work.
- Before editing, run `git status --short <paths>` for the intended write scope.
- Own a small write set and announce it.
- Do not edit files another active agent owns unless coordinating explicitly.
- Prefer new docs/plans files over rewriting existing canonical docs during planning.
- Do not touch store/native metadata unless the task is release metadata.
- Use Node 22 when running JS checks in this repo.
- Quote shell paths containing parentheses.
- Do not commit, stash, or clean untracked files unless requested.
- If tests fail in unrelated untracked files, report that separately and keep touched-file verification clear.

## 13. Implementation Phases

### Phase 0 - Freeze Contracts

Deliverables:

- `AgentMode` shared type and settings mapping.
- `ToolEvent` shared type.
- `RoutingDecision`, `CacheIntent`, and `UsageObservation` schemas.
- Surface host-bridge contract for create/select conversation, attach files, open artifact, choose model, set mode, set effort.

Verification:

- Type tests in `packages/types`.
- All six surfaces compile against shared types.

### Phase 1 - Shared Chat Convergence

Deliverables:

- `MessageBubble` consumes normalized tool events.
- `InlineToolCall` uses `--chat-*` tokens.
- Tool stacks render the Claude-style vertical timeline.
- Composer exposes model, mode, effort/thinking, attachments, mic, send.
- Empty states are reduced to work-first prompts.

Verification:

- `pnpm --filter @agiworkforce/unified-chat typecheck`
- unified-chat vitest suite
- browser screenshots for desktop and web
- mobile screenshot pass where possible

### Phase 2 - Runtime Protocol

Deliverables:

- CLI emits canonical session events.
- Desktop/web/mobile/extension/VS Code host adapters consume the same event shape.
- Permission requests and tool events render identically by source.
- Subagent and `TeamCreate` events render as inline task timelines.

Verification:

- CLI unit tests.
- desktop/web stream fixture tests.
- protocol fixture round-trip tests.

### Phase 3 - Six-Surface Parity

Deliverables:

- CLI: `/effort`, `/permissions`, `/mcp`, `/skills`, `/plugins`, `/subagents`, `/team`.
- Desktop: rail, composer, artifact panel, MCP/settings, terminal/popout.
- Web: cloud shell, auth/waitlist, chat parity.
- Mobile: Dispatch approvals, secure storage, file/photo attachment, app-store safety.
- Chrome: page context, WebMCP, autofill progress, browser control plane.
- VS Code: chat participant, IDE context, mode/effort, MCP/plugins/skills status.

Verification:

- Surface typechecks/builds.
- Targeted test suites.
- Screenshot/contact-sheet comparison against `~/Desktop/reference/ui`.

### Phase 4 - Safety, Cost, and Launch Readiness

Deliverables:

- BYOK key storage audit.
- MCP trust labels and audit logs.
- Prompt/output telemetry redaction tests.
- Quota preflight and auto-fallback.
- Stripe waitlist state remains dormant until graduation.
- Mobile StoreKit/external-link policy gate.

Verification:

- Security regression tests.
- Web API auth tests.
- Mobile store review checklist.
- Provider cost simulation.

### Phase 5 - Release Gate

Required green checks:

- `cargo check --workspace`
- targeted CLI tests for changed modules
- `pnpm lint`
- `pnpm typecheck:all` or scoped equivalent with unrelated failures documented
- `pnpm test` or scoped equivalent
- desktop/web visual smoke
- Chrome/VS Code package builds
- mobile lint/typecheck scoped to touched files if full typecheck is blocked

Required review:

- no hardcoded model IDs
- no unredacted secrets/logging
- no copied proprietary reference code
- no stale `AGI Workforce` public-brand copy unless required by internal package/store metadata
- no surface-specific tool-call UI drift

## 14. Open Backlog From 2026-05-20 Sweep

Implemented after the second-pass knowledge-base audit:

- Web provider-stream proxy now validates and forwards the canonical provider `ChatRequest` shape instead of stripping tool, system, thinking, metadata, and max-output fields.
- Web provider-stream allowlist now matches the currently wired api-gateway provider adapter set.
- CLI fast mode no longer uses a production model literal as fallback; it resolves through the shared catalog.
- Web Mission Control treats invalid or empty planner output as a failed plan and refunds the net charged credits.
- Api-gateway cloud chat now reads `GOOGLE_API_KEY` first, keeps `GOOGLE_AI_API_KEY` as legacy fallback, and resolves its default Anthropic planner model from the catalog.
- Desktop default file-read trust now excludes `$HOME` unless the user has explicitly saved that broader directory.

High priority:

- Re-run true Tauri desktop visual smoke; Vite web mode hit auth gate.
- Run authenticated web chat transcript visual parity pass.
- Build MCP/plugins/skills status surfaces for VS Code, Chrome, and Desktop.
- Add explicit CLI tests for `/effort` dispatch.
- Audit autofill progress UI in Chrome for multi-step status parity.

Medium priority:

- Mobile full model picker sheet still has dark-only styling.
- Empty-chat prompt chips need tighter 3-5 reference density.
- CLI first-run auth fallback polish should match Claude/Codex/Gemini references.
- VS Code marketplace engine metadata may need stack alignment review.
- Desktop bridge local TCP/token risk needs cross-surface protocol design.
- Web CSP/dev warnings and root-layout JSON-LD nonce mismatch need a focused pass.

Blocked/needs coordination:

- Full repo typecheck is risky during same-device parallel work due unrelated untracked files and concurrent edits.
- Broad visual QA should wait until active local agents finish or write scopes are frozen.

## 15. Staff-Level Acceptance Bar

The system is properly designed only when these are true:

- A new provider can be added without editing six surfaces.
- A new tool can be added once and render correctly everywhere.
- A new mode can be added once and respected by CLI, Desktop, Web, Mobile, Chrome, and VS Code.
- A new MCP server shows the same trust, permission, and audit semantics everywhere.
- A user can switch models mid-thread without tool-call/result corruption.
- Local mode can run without Supabase.
- Cloud mode can sync without leaking BYOK secrets.
- Tool activity visually matches the reference inline timeline across all surfaces.
- Every shipped surface passes its scoped verification gate.
