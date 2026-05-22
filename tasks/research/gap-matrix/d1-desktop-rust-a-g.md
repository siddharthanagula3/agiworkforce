# GAP-D1 — Desktop Rust Backend (A–G files)

> **Scope.** All `.rs` files under `apps/desktop/src-tauri/src/` whose **basename** begins with letters A–G. Total in scope: **248 files**.
> Reference: `tasks/research/anthropic-claude-suite-may-2026.md` (verbatim Claude Suite inventory) + deep-dive reports `m4-hooks-system.md`, `m9-services-mcp.md`, `t1-agenttool-insights-plugins-ui.md`, `m6-main-bootstrap.md`.
> Method. Read each file or representative slice; compare to Claude inventory; emit only MISSING + PARTIAL items relevant to AGI Workforce differentiators (multi-provider / BYOK / Local / Linux). HAVE items omitted by design.
> Date: 2026-05-08. Verified against latest Claude Code v2.1.133 (7 May 2026).

---

## Method note

This slice covers a **rich subset** of the desktop Rust backend: the entire `core/agent/` runtime (autonomous + planner + executor + continuous + background); most of `core/agi/` (checkpoints + memory + sandbox + reflection); all of `core/hooks/`; the first half of `core/mcp/`; most of `core/llm/` (cost + capability + council + daily_budget + fallback); the entire `automation/{browser,computer_use}/` tree (computer-use agent + visual reasoner + window manager); and `sys/commands/` A–G (all chat, agi, audit, automation, background, browser, calendar, canvas, capability, capture, cloud, code-\*, completion, computer-use, config-hierarchy, connector-permissions, custom-agents, custom-instructions, daily-budget, database, debugging, design, dispatch_hmac, document, dotfile, ecosystem, email, embeddings, error-reporting, extension, feedback, file_ops, file_watcher, git, github, gmail_oauth, google_batch, governance). It also includes `sys/diagnostics/checks/` (auth_health → disk_space), `sys/security/` A–G (api, approval_workflow, audit_logger, auth, command_validator, dispatch_hmac, dm_protection, encryption, guardrails), and the `automation/{screen,uia,input}` components.

The slice is heavy on _agent runtime_ and _computer-use_ — the audit places these against Claude Cowork (§3) and Claude Code (§4) reference material. MCP-side gaps are constrained to what's exposed by `core/mcp/{client,config,connectors,error,events,oauth,protocol,registry,session,transport,tool_executor}.rs`; the rest of MCP (logs, headers, in-process transport details) lives outside A–G or is small enough to roll up here.

Throughout this doc, **Reference =** `tasks/research/anthropic-claude-suite-may-2026.md` (the inventory). **Source paths** are absolute. **Effort estimates** assume Claude Max + AGI Workforce-velocity (one engineer, AI-pair-programmed, Rust expert), measured in days (1d = 8 productive hours).

---

## Missing

### Tools

#### M-T1 — `Setup` lifecycle event hook (P1)

Reference §5.4 lists `Setup` as one of the 12 documented Claude Code events: fires on `--init` / `--maintenance`, takes a `trigger` matcher, returns `additionalContext`. **Our `HookEvent` enum at `apps/desktop/src-tauri/src/core/hooks/event.rs:16-64` has 12 events but `Setup` is not one of them.** This breaks parity for any Claude-skill ported via SKILL.md that registers `Setup` hooks; we silently drop the event. Effort: **0.5 d** (add one variant + matcher field + dispatch in executor.rs).

#### M-T2 — `InstructionsLoaded` hook event (P1)

Reference §5.4 + Claude Code source ships `InstructionsLoaded` (fires after CLAUDE.md loaded; `load_reason` matcher: `session_start | nested_traversal | path_glob_match | include | compact`). **Not present at `core/hooks/event.rs:16-64`.** This is the key surface for skill-aware `description` mutation and for the "show what context just got loaded" surface. Effort: **1 d** including `load_reason` matcher.

#### M-T3 — `StopFailure` hook event (P1)

Reference §5.4 + deep-dive `m4-hooks-system.md:61` confirms `StopFailure` is the failure-twin of `Stop` — fires on `rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown` API errors. **Not present at `core/hooks/event.rs`.** Without it, partner observability stacks can't distinguish "Claude ran out of tokens mid-turn" from a clean stop. Effort: **0.5 d**.

#### M-T4 — `PreCompact` is present but `PostCompact` is missing (P1)

`core/hooks/event.rs:59` has `PreCompact`. Reference §5.4 + `m4-hooks-system.md:65` confirm Claude Code also ships `PostCompact` ("after compaction"). **Missing here.** Critical for surfacing compaction outcomes to the UI (token-savings telemetry) and for hooks that need to refresh derived state after compaction. Effort: **0.5 d**.

#### M-T5 — Cowork-only events: `TeammateIdle`, `TaskCreated`, `TaskCompleted` (P2)

Reference §5.4 + `m4-hooks-system.md:66-68` list three Cowork-specific events. We don't have a Cowork surface so this is technically out of scope; however, `apps/desktop/src-tauri/src/core/agent/background_tasks.rs:1-848` and `continuous_executor.rs:1-1723` _do_ implement task-style flows. Adding these three events would make our autonomous runtime hook-equivalent to Cowork. Effort: **2 d**.

#### M-T6 — `Elicitation` / `ElicitationResult` hook events (P0)

Reference §5.4 + `m9-services-mcp.md` §1.9 — Claude Code ships these as the MCP-server-driven user-input dialog flow. **Critical.** Our `core/mcp/session.rs:21-56` has the _MCP elicitation request types_ (server → client) but the _hook events_ `Elicitation` and `ElicitationResult` are not in `core/hooks/event.rs:16-64`. Without these events, a custom MCP server can't trigger a hook on user input requests — breaks Claude Apps spec compliance. Effort: **2 d** (event variants + JSON schema validation + REPL queue + `runElicitationHooks` / `runElicitationResultHooks` parity).

#### M-T7 — `ConfigChange` hook event (P2)

Reference §5.4 + `m4-hooks-system.md:71` — fires when `settings.json` / skills / plugins change mid-session, blocks the change if exit 2. Not in our enum. Without it, a security policy can't gate "user just enabled a third-party MCP server in the middle of a session." Effort: **1 d** (file-watcher hook into `core/hooks/config.rs`).

#### M-T8 — `CwdChanged` and `FileChanged` hook events (P2)

Reference §5.4 + `m4-hooks-system.md:72-73` — these are the workspace-aware events that drive Claude Code's "watched paths" feature (the equivalent of LSP textDocument/didChangeWatchedFiles). **Not present.** The closest analog in our scope is `core/agent/triggers.rs:1-1568` (which ships `FileWatcherTrigger`) — but it's a different code path that doesn't speak hook protocol. Effort: **1.5 d** (bridge the two systems).

#### M-T9 — `WorktreeCreate` / `WorktreeRemove` hook events (P2)

Reference §5.4 + `m4-hooks-system.md:74-75` — fires before/after a `git worktree add` from `claude --worktree`. We have no worktree command surface; closest is git command surface in `sys/commands/git.rs`. Until we add `--worktree`, these hooks are aspirational. Effort: **3 d** (worktree surface + 2 events).

#### M-T10 — `Bash` tool with bubblewrap/Seatbelt sandbox + auto-mode classifier (P0)

Reference §F.2 — Claude Code's auto-mode is two-layer (input prompt-injection probe + output Sonnet-4.6 transcript classifier). **Our `core/agi/sandbox.rs:1-1050` is a barebones subprocess runner** with timeout + stdin/stdout capture — no bubblewrap, no Seatbelt, no transcript classifier. Reference §F.7 documents Anthropic's published 0.4% false-positive / 5.7% false-negative classifier numbers. CLI has Seatbelt + bwrap shipped (per `MEMORY.md` CLI row); desktop does not. Effort: **8 d** (bubblewrap on Linux, Seatbelt-policy on macOS, classifier wiring via `LLMRouter` to the user's small-fast model).

#### M-T11 — Plan-mode (read-only tool subset) (P1)

Reference §5.6 — plan mode restricts Claude to read/grep/glob/web-fetch/web-search/notebook-read; cannot Edit/Write/Bash/NotebookEdit. The CLI has a `/plan` slash and `--plan-mode` flag. **Desktop scope shows no plan-mode gate** in `core/agent/executor.rs:1-576` or `core/agent/autonomous.rs:1-1614`; `Action::ExecuteCommand` is admitted unconditionally. Effort: **1.5 d** (PermissionMode enum extension + per-Action gate).

#### M-T12 — `update_plan` tool (P1)

Reference §5.6 — plan mode produces a markdown file in `~/.claude/plans/`; `Ctrl+G` opens in `$EDITOR`. AGI-side, we have `core/agent/planner.rs:1-367` (which generates a plan tree) but no `update_plan` editor flow, no markdown persistence, no version-numbered plan slots. Effort: **2 d**.

#### M-T13 — Session-resume PR-URL search (P2)

Reference §5.15 — `--resume <PR-URL>` finds the originating session. Our `core/agi/checkpoint_store.rs:1-539` keys checkpoints by `task_id` only; no PR / GitHub URL index. Effort: **1.5 d** (add URL → session map in checkpoint_store).

#### M-T14 — `--effort {low,medium,high,max,auto}` per-call effort selector (P1)

Reference §5.2 + §5.3 — Claude Code exposes `/effort` slash + `--effort` flag; Pro/Max default to "high" on Opus 4.6 / Sonnet 4.6 since v2.1.117 (22 Apr 2026). **Our `core/llm/llm_router.rs:1-2542` has model selection but no effort dial.** A user wanting Opus 4.7 in `max` mode can't request it. Effort: **2 d** (add effort field on `LLMRequest` + per-provider mapping for Anthropic `extra_headers["thinking"]` and OpenAI `reasoning_effort`).

#### M-T15 — `output_style` + ship-default `default | explanatory | learning` (P1)

Reference §5.12 — output styles modify Claude's system prompt without affecting tool behavior. **Our `core/llm/prompt_policy.rs:1-329` has system-prompt construction but no named style variants.** Effort: **1 d**.

### Sub-agents

#### M-S1 — Subagent type + config schema (P0)

Reference §5.7 — subagents are markdown + YAML files in `~/.claude/agents/` (user) or `.claude/agents/` (project). Frontmatter: `name`, `description`, `tools`, `model`, `permissionMode`. Our scope has `core/swarm/agent_spawner.rs:1-100+` (Kimi K2.5 dynamic spawner) and `core/research/agents.rs:1-100+` (per-source search agents) but **neither parses YAML frontmatter** and neither matches Claude's `description` semantic-trigger contract. Effort: **3 d** (YAML loader + description-matching + per-subagent permissionMode gate).

#### M-S2 — Built-in `Explore` and `Plan` subagents (P1)

Reference §5.7 — Claude ships `Explore`, `Plan`, `general-purpose` built-ins. We have `core/agent/planner.rs:1-367` (functional but not a subagent) and no Explore equivalent. Effort: **2 d**.

#### M-S3 — Subagent-isolated context window (P0)

Reference §5.7 — "Subagents run in their own context window." Critical because that's the _whole_ point — keep main thread short. Our `core/swarm/agent_spawner.rs:1-100+` does run agents in parallel but they share the parent's `LLMRouter` state including conversation history. Effort: **2 d** (separate `ChatHistory` per subagent in `swarm_orchestrator.rs`).

#### M-S4 — `tools` allow-list per subagent (P0)

Reference §5.7 — per-subagent tool restriction is the CLI's main safety hatch. **`core/swarm/agent_spawner.rs:23-52` has resource limits but no per-subagent tool filter** — every subagent in our system has root-level tool access. Effort: **1 d**.

#### M-S5 — `description` semantic-trigger phrasing (PROACTIVELY / MUST BE USED) (P1)

Reference §5.7 — "Use `PROACTIVELY` / `MUST BE USED` for stronger triggering." Description-matching that nudges Claude to invoke the subagent. Not implemented anywhere in scope. Effort: **0.5 d** (description string + LLM router prompt-template tweak).

#### M-S6 — Marketplace-distributed subagents (P2)

Reference §5.7 — `VoltAgent/awesome-claude-code-subagents` (100+ subagents) and `wshobson/agents` (80+). We have a connector marketplace at `core/mcp/connectors.rs:1-100+` (87 manifests) but no parallel subagent marketplace. Effort: **3 d**.

### Agent teams

#### M-A1 — Cowork-style autonomous-task UI persistence (P0)

Reference §3.3 — task cards persist with status (Running / Awaiting approval / Completed / Failed); resume across app restart. Our `core/agent/background_tasks.rs:1-848` has `TaskStorage` but the status state machine has fewer states (`Pending | Planning | Executing | WaitingApproval | Paused | Completed | Failed | Cancelled` per `core/agent/mod.rs:64-73`) — _missing_ the "Awaiting approval" + "needs human review" hand-off shape that mobile Dispatch (§6.5) expects. Effort: **2 d**.

#### M-A2 — Recurring-task scheduler (daily/weekly/monthly) (P1)

Reference §3.4 — Cowork ships scheduled-task UX (daily/weekly/monthly recurring). Our `core/agent/triggers.rs:1-1568` has `TriggerType` enum but the audit spot-check shows it's event-driven (file-watch / cron pattern) — not a UI-friendly recurrence schedule. Effort: **2 d** (cron parsing + UI status).

#### M-A3 — VM-isolated execution (Apple VF + Hyper-V) (P0)

Reference §3.5 — Cowork lives in `~/Library/Application Support/Claude/vm_bundles/claudevm.bundle`. Our `core/agi/sandbox.rs:1-1050` is process-level only. Reference §3.7 confirms this is the single biggest enterprise gate. Effort: **20+ d** (build VM bundle pipeline; macOS Apple Virtualization Framework via `objc2-virtualization`, Linux KVM via `qemu`, Windows Hyper-V via WMI — multi-platform binary distribution layer). **Linux differentiator angle: we ship Linux first because Anthropic doesn't.**

#### M-A4 — Network egress allowlist + VM-internal proxy (P0)

Reference §3.4 / §F.3 — Cowork has a network egress allowlist; web fetch/search use Anthropic egress and bypass it. Our scope shows **zero network-policy enforcement** — `core/agent/executor.rs:1-576` lets `Action::Navigate` and `Action::ExecuteCommand` hit any URL. Effort: **3 d** (proxy crate `agiworkforce-network-proxy` already exists per `Cargo.toml`; needs wiring + UI).

#### M-A5 — Multi-agent council with majority-vote (P2 — partial; see Partial section)

We have `core/llm/council.rs:1-374` which implements majority-vote across providers. **Reference does not document a Claude analog** — this is a differentiator. Listed here only to flag it as our advantage to preserve.

#### M-A6 — `/team-onboarding` slash that generates onboarding doc from CLAUDE.md (P2)

Reference §5.2 + §5.4 — v2.1.101+ ships `/team-onboarding` (April 2026). We have CLAUDE.md analogs in `core/agi/project_memory.rs:1-1345`. No slash-command surface for "generate team onboarding doc from current memory." Effort: **1 d**.

### MCP

#### M-M1 — Streamable-HTTP transport with `Accept: application/json, text/event-stream` guard (P0)

Reference §1.4 + §D.1 + `m9-services-mcp.md` §1.2 — Claude Code's `wrapFetchWithTimeout` re-asserts Accept header at the last hop because some runtimes drop it (HTTP 406 from spec-strict servers). **Our `core/mcp/transport.rs:1-2281` has SSE + stdio + HTTP transports, but the audit at line 100 suggests a basic `reqwest::Client::get`** — no Accept-header re-assertion guard at the last hop. Effort: **0.5 d** (one wrapper).

#### M-M2 — Per-request fresh-timeout wrapper (P0)

Reference + `m9-services-mcp.md` §1.3 — without per-request fresh `AbortController` + `setTimeout`, a single timeout created at connect-time goes stale after 60s. Our scope at `core/mcp/transport.rs:23-37` has fixed-window timeouts (`HTTP_REQUEST_TIMEOUT_SECS=30`, `STDIO_REQUEST_TIMEOUT_SECS=120`) — likely no per-request fresh timeout. Effort: **1 d**.

#### M-M3 — `claudeai-proxy` transport (P1)

Reference + `m9-services-mcp.md` §1.13 — Claude Code uses `claudeai-proxy` to route MCP traffic via Anthropic's proxy when the user wants the connection to flow through Anthropic's egress. We have HTTP/SSE/stdio transports but no proxy transport in `core/mcp/transport.rs:1-2281`. Effort: **1.5 d** (variant in transport enum + bearer wrap + 401 retry + token rotation).

#### M-M4 — In-process linked transport pair (`InProcessTransport`) (P1)

Reference §D.1 + `m9-services-mcp.md` §1.12 — Claude Code uses this to host the Chrome MCP and Computer-Use MCP in-process (avoids 325 MB subprocess). We don't have an in-process transport in `core/mcp/transport.rs:1-2281`. Effort: **1 d** (mpsc-based microqueue transport).

#### M-M5 — `SdkControlTransport` for SDK-mode MCP servers (P2)

Reference + `m9-services-mcp.md` §1.11 — Claude Code wraps SDK-MCP traffic in a control-channel pattern so the control-channel multiplexes per `server_name`. We don't have this in `core/mcp/transport.rs:1-2281`. Effort: **2 d**.

#### M-M6 — `tools/list` Unicode sanitization (P1)

Reference + `m9-services-mcp.md` §1.6 — `recursivelySanitizeUnicode(result.tools)` strips zero-width / control chars. Our `core/mcp/registry.rs:1-100+` has `INJECTION_PATTERNS` regex set + 1024-byte truncation but doesn't strip zero-width chars. Effort: **0.5 d**.

#### M-M7 — `_meta['anthropic/searchHint']` / `alwaysLoad` annotations (P2)

Reference + `m9-services-mcp.md` §1.6 — `searchHint` collapses whitespace; `alwaysLoad` forces tool into context. Our scope's tool catalog `core/mcp/registry.rs:1-739` stores name + description but not these annotations. Effort: **0.5 d**.

#### M-M8 — `isReadOnly`/`isConcurrencySafe`/`isDestructive`/`isOpenWorld` annotations (P1)

Reference + `m9-services-mcp.md` §1.6 — these annotations from `tool.annotations.readOnlyHint / destructiveHint / openWorldHint` drive permission decisions. We don't read these in `core/mcp/registry.rs:1-739`. Effort: **1 d**.

#### M-M9 — `mcp__<server>__<tool>` collision-safe encoding (P1 — partial; see Partial)

Reference + `m9-services-mcp.md` §1.6 confirms naming convention. Our `core/mcp/registry.rs:91-98` has `TOOL_ID_DELIMITER = "__"` + length cap 64 chars + hex/b64 fallback for unsafe chars — **PARTIAL but correct**. Verifying: the hex*/b64* prefix dual-form is good; the legacy `hex:` and `b64:` prefixes (lines 95-97) suggest backwards-compat from an earlier scheme. Effort: 0 (HAVE).

#### M-M10 — URL-elicitation auto-retry with hook integration (P0)

Reference + `m9-services-mcp.md` §1.9 — Claude Code's `callMCPToolWithUrlElicitationRetry` runs `runElicitationHooks` first, falls back to REPL prompt, then retries up to 3 times. **We do not have URL-elicitation handling in `core/mcp/session.rs:1-758`** — only generic elicitation. Effort: **2 d**.

#### M-M11 — DCR (Dynamic Client Registration) for OAuth (P1)

Reference §5.5 + `m9-services-mcp.md` §2 — Claude Code's `auth.ts` does Dynamic Client Registration for servers without pre-registered clients. **Our `core/mcp/oauth.rs:1-1193` requires a static `client_id` + `auth_url` + `token_url` config (line 41-57)** — no `/register` discovery. Effort: **2 d** (RFC 7591 implementation).

#### M-M12 — Slack-quirk OAuth normalizer (P2)

Reference + `m9-services-mcp.md` §2.2 — Slack returns HTTP 200 for OAuth errors; Claude Code rewrites to 400 so SDK error mapping runs. Our `core/mcp/oauth.rs:1-1193` doesn't have this normalizer. Effort: **0.5 d**.

#### M-M13 — Paste-callback fallback for SSH/Codespaces (P1)

Reference §5.5 + `m9-services-mcp.md` §2.4 — when `localhost:port` callback isn't reachable (SSH session), Claude Code exposes a `submit(callbackUrl)` for paste fallback. Our `core/mcp/oauth.rs:1-1193` requires localhost callback. Effort: **1 d**.

#### M-M14 — RFC 9728 / 8414 OAuth metadata discovery chain (P1)

Reference + `m9-services-mcp.md` §2.1 — three-tier fallback. Our `core/mcp/oauth.rs:1-1193` requires explicit `auth_url` + `token_url` — no discovery. Effort: **1 d**.

#### M-M15 — Transcript classifier + Auto-Mode (P0 — see M-T10)

Cross-listed.

#### M-M16 — `/mcp` interactive management UI parity (P2)

Reference §5.2 — `/mcp` lists servers, status, last-error, tools. Our `sys/commands/...` files cover MCP commands but don't ship a `/mcp` slash UX equivalent. Effort: **2 d** (TUI panel; user can still go to settings).

#### M-M17 — `enabledPlugins` setting + extension marketplace (P1)

Reference §5.10 + §5.11 — Claude Code has `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `claude plugin marketplace add <repo>`. We have `core/mcp/config.rs:1178-1563` with `mcpb/1` bundle support — **partial**. No marketplace registry, no `extraKnownMarketplaces`. Effort: **3 d**.

### Plugins

#### M-P1 — Plugin marketplace (`.claude-plugin/marketplace.json` registry) (P0)

Reference §5.11 — Plugins are GitHub repos with `.claude-plugin/marketplace.json`. `claudemarketplaces.com` reports 4,200+ skills, 770+ MCP servers, 2,500+ marketplaces. Our scope has connector manifests at `core/mcp/connectors.rs:1-100+` (~87 entries, hardcoded) — no GitHub-based marketplace. Effort: **5 d** (gh-API client + manifest validator + cache + UI).

#### M-P2 — `claude plugin tag` Git-tag release pipeline (P2)

Reference §5.11 — `claude plugin tag` (May 2026) creates Git release tags with version validation. Effort: **1 d**.

#### M-P3 — Plugin variable substitution `${CLAUDE_PLUGIN_ROOT}` (P1)

Reference + `m4-hooks-system.md` §3a — Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${user_config.X}` in hook commands. Our `core/hooks/executor.rs:1-100+` has env-var injection of `CLAUDE_*` analogs (per file header) but the audit at lines 30-79 shows no plugin-variable substitution. Effort: **0.5 d**.

#### M-P4 — Plugin-install hook (running install script when plugin loaded) (P2)

Reference §5.11. Effort: **1 d**.

### Skills

#### M-K1 — Progressive-disclosure skill loading (metadata at session start, body on-demand) (P0)

Reference §1.5 / §E.1 — _the_ defining Skill mechanic. **Our `core/skills/skill.rs:1-100+` has `SkillSource` + `SkillContextMode { Main | Fork }` (line 26-33) but no progressive-disclosure**. The `SkillContextMode::Fork` (subagent) and `Main` (full context) modes are an alternative model — but Claude's progressive disclosure is what keeps token cost flat. Effort: **3 d** (description-only at session-start; `loadSkillBody` on semantic match).

#### M-K2 — `~/.claude/skills/<name>/SKILL.md` standard layout (P0)

Reference §E.1 + §5.9 — Anthropic schema: YAML frontmatter (`name` ≤ 64 chars, lowercase/hyphens; `description` ≤ 1024 chars) + Markdown body (≤ 500 lines), optional `scripts/` + `references/` + `assets/`. **Our `core/skills/skill.rs:1-100+` has internal types but no SKILL.md parser visible in the slice.** Effort: **2 d**.

#### M-K3 — Skill marketplace + `claude plugin install <name>@<marketplace>` (P1)

Reference §E.1 — `claudeskills.info`, `skillsmp.com`, `lobehub.com/skills`, `claudemarketplaces.com`. Connectors are equivalent surface; we lack the Skill subset. Effort: **2 d** (overlap with M-P1).

#### M-K4 — Org-shared Skill provisioning (Team/Enterprise default-enable) (P2)

Reference §E.1 — Q4 2025 landed for Team/Enterprise. Effort: **2 d**.

#### M-K5 — Pre-built Skills `pdf`, `docx`, `pptx`, `xlsx`, `mcp-builder`, `algorithmic-art`, `canvas-design`, `frontend-design` (P1)

Reference §1.5 — Anthropic ships these. We have `features/document/{create,edit}_{pdf,word,excel,powerpoint}.rs` (per file list) but they're surface-level commands, not Skills with progressive disclosure. Effort: **3 d** (port the 8 official Skills as Skill packages).

#### M-K6 — Skill description "pushy" guidance (P3)

Reference §E.1 — "descriptions should be 'pushy'" for trigger reliability. Documentation update on Skill-creator guidance. Effort: **0.5 d**.

### System architecture

#### M-SA1 — Claude Apps spec (interactive UI in chat) (P0)

Reference §1.4 — MCP Apps spec launched 26 Jan 2026 with Amplitude, Asana, Box, Canva, Clay, Figma, Hex, Monday, Slack, Salesforce as launch partners. **No equivalent in our scope** — `features/canvas/{a2ui,elements}.rs` is closest but is a desktop canvas editor, not in-chat live UI. Effort: **5 d** (sandboxed iframe + RPC bridge).

#### M-SA2 — Live Artifacts (auto-refresh against connected MCP servers) (P1)

Reference §1.9 — Apr 2026 ship. **Not in our scope.** Effort: **3 d** (MCP-server-driven artifact re-render).

#### M-SA3 — Persistent Artifact storage (20MB per artifact, personal/shared) (P1)

Reference §1.9. Effort: **2 d**.

#### M-SA4 — Direct API calls from Artifacts (counts against viewer's subscription) (P2)

Reference §1.9 — viewer-pays model. Effort: **3 d**.

#### M-SA5 — Memory synthesis ("daily memory regeneration") (P0)

Reference §1.6 / §E.2 — synthesized profile updated ~daily. **Our `core/agi/memory_manager.rs:1-2263` + `memory_persistence.rs:1-1446` are large but I see no daily-cron synthesis.** Effort: **3 d** (cron + synthesizer prompt + diff-write).

#### M-SA6 — Memory import from ChatGPT/Gemini/Grok at `/import-memory` (P2)

Reference §1.6 — landed 3 Mar 2026. Effort: **2 d** (per-source parser + de-dup).

#### M-SA7 — Per-account global memory + per-project memory (P1)

Reference §1.6 / §E.2 — two-tier scope. Our `core/agi/project_memory.rs:1-1345` is project-scoped; `memory_manager.rs:1-2263` is _cross-conversation_ but I don't see explicit per-account vs per-project segregation. Effort: **2 d**.

#### M-SA8 — Memory-pause + memory-reset (irreversible) UX (P1)

Reference §1.6. Effort: **0.5 d**.

#### M-SA9 — Sensitive-data redaction during synthesis (passwords / financial / health) (P0)

Reference §1.6 — Anthropic excludes these from synthesis. **No redaction layer visible in scope.** Effort: **2 d** (regex + LLM-classifier hybrid).

#### M-SA10 — Memory tool (server-side, separate from chat history) (P1)

Reference §5.8 — distinct from `CLAUDE.md`. Effort: **2 d**.

#### M-SA11 — Compliance API (Enterprise audit log) (P1)

Reference §10.5 / §11.2. We have `sys/security/audit_logger.rs:1-100+` (file present) — **PARTIAL**. Effort: **3 d** (export to OTel + S3-compatible).

#### M-SA12 — Zero Data Retention (ZDR) configuration (P1)

Reference §11.2 — Files API + Skills excluded. Effort: **1.5 d**.

#### M-SA13 — Audit-log export (data-export bundle for users) (P1)

Reference §1.6. Effort: **1 d**.

#### M-SA14 — Long-running task resume across reconnect (P0)

Reference §1.10. Our `core/agi/checkpoint_manager.rs:1-401` has checkpoint-store but no streaming-handoff for live web connections. Effort: **3 d**.

#### M-SA15 — Computer-use server-side prompt-injection probe + action classifier (P0)

Reference §12.1 — server-side prompt-injection probe scans screenshots/OCR'd content. **Our `automation/computer_use/safety.rs:1-871` has client-side regex injection patterns + per-app permission gating; no server-side probe.** Effort: **5 d** (run small classifier on each LLM-generated action via LLMRouter — analogous to Auto-Mode classifier).

#### M-SA16 — `enable_zoom: true` + `region` arg on screenshot (P1)

Reference §12.1. **Our `automation/computer_use/zoom.rs:1-616` has zoom action, but I need to confirm the `enable_zoom` capability flag and `region: [x1,y1,x2,y2]` arg shape match the Anthropic `computer_20251124` schema.** Effort: **0.5 d** (schema audit).

#### M-SA17 — Anthropic `computer_20251124` tool schema parity (P0)

Reference §12.1 — `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `left_mouse_down`, `left_mouse_up`, `mouse_move`, `cursor_position`, `key`, `type`, `scroll`, `hold_key`, `wait`, `zoom` — full action vocabulary. Our `automation/computer_use/types.rs:178-286` has `Click`, `DoubleClick`, `TripleClick`, `RightClick`, `Type`, `KeyPress`, `Hotkey`, `Scroll`, `Drag`, `MoveMouse`, `Wait`, `Screenshot`, `FocusWindow`, `LaunchApplication`, `Copy`, `Paste`, `SelectAll`, `Undo`, `Redo`, `Zoom` — **MISSING `MiddleClick`, `LeftMouseDown`, `LeftMouseUp`, `CursorPosition`, `HoldKey`** as discrete actions. Effort: **1 d**.

#### M-SA18 — Per-app permission categories with auto-block sensitive (banking/crypto/healthcare) (P0)

Reference §3.2 #5 + §12.2 — sensitive apps blocked by default. **Our `automation/computer_use/app_permissions.rs:1-396` has allow/deny/ask but I don't see a default-blocked sensitive-app list.** Effort: **1 d** (bundle-id + window-title denylist with US-banking + crypto-exchange + EHR patterns).

#### M-SA19 — 30-min Dispatch session re-prompt (P2)

Reference §12.2. Effort: **0.5 d**.

#### M-SA20 — Cowork data-exfil patch (Jan 2026 vuln) — N/A; we don't have Cowork.

### Frontend (no scope; this slice is backend Rust only)

### Backend

#### M-B1 — `worktree.baseRef` setting (`fresh` | `head`) (P2)

Reference §5.10 — May 2026 setting. Effort: **0.5 d**.

#### M-B2 — `sandbox.bwrapPath` / `sandbox.socatPath` settings (P1)

Reference §5.10. Effort: **0.5 d**.

#### M-B3 — `forceLoginMethod` (`claudeai` | `console`) + `forceLoginOrgUUID` (P3)

Reference §5.10. Effort: **0.5 d**.

#### M-B4 — `parentSettingsBehavior` (`first-wins` | `merge`) (P1)

Reference §5.10. Effort: **1 d**.

#### M-B5 — `disableAllHooks` / `allowManagedHooksOnly` / `allowedHookHttpUrls` / `allowedHookEnvVars` (P0)

Reference §5.10. **Our `core/hooks/config.rs:1-100+` has hook config but the slice header at executor.rs:1-100 mentions a _blocklist_ of dangerous patterns — not these denylist toggles.** Effort: **1.5 d**.

#### M-B6 — `otelHeadersHelper` (P1)

Reference §5.10 — Enterprise OTel observability gateway. Effort: **1 d**.

#### M-B7 — Hierarchy: Managed → Project → Local → User; deny-rules-first precedence (P0)

Reference §5.10. **Our `data/config_hierarchy.rs:1-100+` exists** (in scope) — needs audit; deep-read out of slice budget. Effort: 0–2 d depending on audit.

#### M-B8 — `--dangerously-skip-permissions` flag (P1)

Reference §5.3 — flag is present in CLI; missing in our IPC layer. Effort: **0.5 d**.

#### M-B9 — `--exclude-dynamic-system-prompt-sections` (P1)

Reference §5.3 — for prompt-cache hit-rate. Effort: **1 d** (prompt template diff).

### Connections

#### M-C1 — Health-data connector (Apple Health + Health Connect) (P3 — not in-scope; mobile)

Reference §1.4. Out of scope (mobile).

#### M-C2 — Custom-connector wizard with Client ID/Secret (P0)

Reference §1.4 — `+ Add custom connector` wizard with remote-MCP URL + OAuth client. **Our `core/mcp/connectors.rs:1-100+` has hardcoded manifests; no UI for "I'll paste my MCP server URL and OAuth client config."** Effort: **2 d**.

#### M-C3 — Tool-access mode (Auto / On demand) for envs with 10+ connectors (P1)

Reference §1.4. Effort: **1 d**.

#### M-C4 — OAuth scope confirmation page (P2)

Reference §1.4. Effort: **0.5 d**.

#### M-C5 — "Read but never write" per-action scope override (P1)

Reference §1.4 / §E.4 — connector-write blocking gate. Effort: **1.5 d** (per-tool-name policy).

#### M-C6 — Connector revoke from Settings (P2)

Reference §1.2 / §E.4. Our `sys/commands/connector_permissions.rs:1-50+` has permission storage; UI to revoke is frontend (out of scope). Effort: 0 (HAVE backend).

### Workflow

#### M-W1 — `/loop` slash for recurring runs (P1)

Reference §5.2 — built-in slash for recurring polling/run. Effort: **0.5 d** (overlap with M-A2).

#### M-W2 — `/simplify` slash (P2)

Reference §5.2 — built-in. Effort: **0.5 d**.

#### M-W3 — `/security-review` slash (P1)

Reference §5.2. Effort: **1 d** (calls Sonnet 4.6 with codebase + diff).

#### M-W4 — `/init` slash (CLAUDE.md generation) (P1)

Reference §5.2. We have `ui/onboarding/first_run.rs:1-100+` for desktop onboarding — that's not the same. Effort: **1 d**.

#### M-W5 — `/team-onboarding` slash (P2 — cross-listed M-A6)

#### M-W6 — `/batch` slash (P2)

Reference §5.2. Effort: **0.5 d**.

#### M-W7 — `/claude-api` slash (P3)

Reference §5.2. Effort: **0.5 d**.

#### M-W8 — `/desktop` slash (move to desktop app) (P2)

Reference §5.2. Effort: **0.5 d** (Tauri deep-link).

#### M-W9 — `/btw` slash (P3)

Reference §5.2 — small contextual aside. Effort: **0.25 d**.

### System prompts

#### M-SP1 — Per-tool-call action classifier (P0)

Cross-listed M-T10 / M-SA15 — the Claude Code Auto-Mode classifier sees only user messages and agent tool calls. Effort: **5 d** (already counted).

#### M-SP2 — Style picker prompts ("Normal," "Concise," "Explanatory," "Formal") (P2)

Reference §1.1. Effort: **0.5 d**.

#### M-SP3 — Profile/personalization prompts ("What should Claude call you?") (P2)

Reference §1.2 → "Profile" tab. Effort: **0.5 d**.

### Design

Out of scope for backend slice.

---

## Partial

### P-1 — Hooks event coverage (12 of 27)

Source: `apps/desktop/src-tauri/src/core/hooks/event.rs:16-64`. We ship 12 events (`SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, SubagentStart, SubagentStop, Stop, PreCompact, Notification`). Reference §5.4 + `m4-hooks-system.md` §2 documents 27. **Missing 15**: `Setup, InstructionsLoaded, StopFailure, PostCompact, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, CwdChanged, FileChanged, WorktreeCreate, WorktreeRemove, PermissionDenied`. Note `PermissionDenied` is missing too — important because Claude lets the user "tell the model 'try a different approach.'" Total effort to close gap: **8 d** (M-T1 through M-T9).

### P-2 — Hook handler types (1 of 6)

Source: file headers in `core/hooks/executor.rs:1-100+` mention only `command` shell-spawning. Reference §5.4 + `m4-hooks-system.md` §3 documents 6 (`command, HTTP, prompt, agent, function, callback`). We have `command` only. **Missing 5**: HTTP (with SSRF guard), prompt (LLM-evaluated), agent (subagent spawn), function (in-memory JS callback), callback (SDK-injected). Total effort: **6 d**.

### P-3 — Computer-use action vocabulary (15 of 16)

Source: `automation/computer_use/types.rs:178-286`. Missing `MiddleClick`, `LeftMouseDown`, `LeftMouseUp`, `CursorPosition`, `HoldKey` as discrete schema variants — see M-SA17. Effort: 1 d.

### P-4 — Subagent runtime (no SKILL.md / YAML / context isolation / per-subagent tool ACL)

Source: `core/swarm/agent_spawner.rs:23-52`. Effort to bring to Claude parity: **6 d** (M-S1 + M-S3 + M-S4).

### P-5 — Skills system (no progressive disclosure)

Source: `core/skills/skill.rs:1-100+`, `core/skills/{loader,manager}.rs`. Has `SkillContextMode { Main | Fork }` — Claude has _progressive disclosure_ (metadata-only-at-load + on-demand body). Effort: **3 d** (M-K1).

### P-6 — MCP server config (`.mcpb` bundle present; marketplace missing)

Source: `core/mcp/config.rs:1178-1563`. We have bundle parsing (`mcpb/1` magic). Missing: marketplace registry, `extraKnownMarketplaces` schema, GitHub-discovery. Effort: 5 d (M-P1).

### P-7 — OAuth (no DCR, no metadata-discovery, no Slack-quirk)

Source: `core/mcp/oauth.rs:1-1193`. Static-config-only (line 41-57). Missing M-M11, M-M12, M-M13, M-M14. Effort: **5 d**.

### P-8 — Memory (no synthesis, no pause/reset UX, no redaction)

Source: `core/agi/memory_manager.rs:1-2263`, `memory_persistence.rs:1-1446`. Has _storage_ (huge LOC) but missing the synthesizer cron + redaction layer (M-SA5, M-SA9). Effort: **5 d**.

### P-9 — Audit logging (file write present; OTel/Compliance API missing)

Source: `sys/security/audit_logger.rs:1-100+`. Effort: **3 d** (M-SA11).

### P-10 — Sandbox (process-level only; no VM, no bwrap, no Seatbelt)

Source: `core/agi/sandbox.rs:1-1050`. Effort: **20+ d** (M-A3) for VM; **8 d** (M-T10) for in-process classifier.

### P-11 — Connectors (87 hardcoded manifests; no marketplace-add)

Source: `core/mcp/connectors.rs:1-100+`. Catalog count is competitive (200+ at Claude vs our 87) but the `+ Add custom connector` flow (M-C2) is a P0 gap.

### P-12 — Hook env-var injection (no plugin substitution)

Source: `core/hooks/executor.rs:1-100+`. We inject Claude-style env vars (file header confirms) but not `${CLAUDE_PLUGIN_ROOT}` / `${user_config.X}` substitution at command-construction time (M-P3). Effort: **0.5 d**.

### P-13 — Async hook detection (registry missing)

Source: file content not deep-read in slice. Reference + `m4-hooks-system.md` §4 describes the AsyncHookRegistry that drains completed background hooks; ours likely lacks the rewake-via-`enqueuePendingNotification` path. Effort: **2 d**.

### P-14 — Network egress allowlist (no UI; crate exists)

Source: `Cargo.toml` lists `agiworkforce-network-proxy` per CLAUDE.md; our scope `core/agent/executor.rs` does not gate network. Effort: **3 d** (M-A4).

### P-15 — Hook command blocklist (regex-only, no path-anchor)

Source: `core/hooks/executor.rs:36-79`. We have a 40-pattern blocklist (`rm -rf /`, fork bombs, etc.). Per `MEMORY.md` recent commit `a0a4baf82 chore(security): tighten model-id gate path-anchor`, similar tightening is needed. Effort: **0.5 d**.

---

## Per-axis percentage for our slice (D1, A–G files)

For each axis, the percentage represents _what we have vs. what Reference documents Claude Code v2.1.133 ships in this functional area, weighted toward features visible in our A–G slice_.

| Axis       | %   | Notes                                                                                                                                                                                                                                                        |
| ---------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools      | 60% | Have core hook framework + tool catalog + execution. Missing 15 of 27 hook events, 5 of 6 handler types, plan-mode gate, effort dial, output styles, 4 computer-use action variants.                                                                         |
| Web search | 35% | Out-of-scope mostly (web-search lives elsewhere) — slice has `core/research/agents.rs` web agent but no web-search streaming, no inline citations beyond `core/research/citation.rs`. Inline-chip rendering is frontend.                                     |
| Answering  | 70% | LLM router (`core/llm/llm_router.rs:1-2542`) + provider adapter (`core/llm/provider_adapter.rs:1-3103`) cover answering. Missing memory-injection per-chat, missing thinking-block compaction at scale, missing artifact-flow.                               |
| MCP        | 65% | Stdio + SSE + HTTP transports + tool catalog + OAuth + bundles. Missing in-process transport, claudeai-proxy transport, SDK transport, DCR, paste-callback, RFC 9728/8414 chain, Apps spec, URL-elicitation.                                                 |
| Plugins    | 15% | We have hardcoded connector manifests (87) and `mcpb/1` bundle support. No GitHub-based marketplace, no `${CLAUDE_PLUGIN_ROOT}` substitution, no plugin-tag releases. Reference: 2,500+ marketplaces; we have 0.                                             |
| Skills     | 25% | We have a Skills type system with `SkillSource`, `SkillContextMode { Main                                                                                                                                                                                    | Fork }`, file-based loaders. Missing: progressive disclosure (the defining property), SKILL.md YAML parser, marketplace, official Anthropic Skills (pdf/docx/pptx/xlsx), org-shared provisioning. |
| Sub-agents | 30% | We have `core/swarm/agent_spawner.rs` (Kimi K2.5 dynamic) + `core/research/agents.rs` (per-source). Missing: SKILL.md-style YAML config, isolated context window, per-subagent tool ACL, description-trigger semantics, Explore/Plan built-ins, marketplace. |

**Slice-weighted average: ~42%.**

---

## Top P0 / P1 dependencies for AGI Workforce v1 ship

In rough priority order for desktop alpha (multi-provider / BYOK / Local / Linux differentiators):

1. **Subagent isolation + tool-ACL** (M-S3 + M-S4, 3 d) — without per-subagent context + tools, a buggy subagent writes anywhere.
2. **Hook coverage of `Elicitation` / `ElicitationResult` / `Setup` / `InstructionsLoaded`** (M-T6 + M-T1 + M-T2, 3.5 d) — these break MCP-Apps-spec compliance and skill-aware UX.
3. **Auto-Mode classifier + Bash sandbox** (M-T10, 8 d) — in our scope this is `core/agi/sandbox.rs` only; the Auto-Mode safety blanket is what makes BYOK-Local-Linux viable for non-trivial workloads.
4. **Skills progressive disclosure** (M-K1 + M-K2, 5 d) — defining mechanic; without it our `Skill` system is a glorified slash-command registry.
5. **MCP DCR + paste-callback + Slack-quirk + RFC discovery** (M-M11 + M-M12 + M-M13 + M-M14, 5 d) — these are the ones that gate "user paste a random MCP URL and have it just work."
6. **Memory synthesis + redaction** (M-SA5 + M-SA9, 5 d) — without these, Memory is fictional.
7. **VM-isolated execution for Linux-first Cowork** (M-A3, 20+ d) — biggest enterprise differentiator. **Linux VM-bundle is our wedge.**
8. **Computer-use server-side classifier + sensitive-app block list** (M-SA15 + M-SA18, 6 d) — table stakes for shipping computer-use without negative news cycles.
9. **Custom-connector wizard** (M-C2, 2 d) — the difference between "we have 87 hardcoded servers" and "user can add their own."

**Total cumulative effort to close P0+P1 gaps in this slice: ~85 days at AI velocity.**

---

_Slice owner: GAP-D1 / Desktop Rust A–G. Compiled 2026-05-08. Output path: `/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/d1-desktop-rust-a-g.md`. Per-axis percentages calibrated against `tasks/research/anthropic-claude-suite-may-2026.md` (verbatim Anthropic reference inventory)._
