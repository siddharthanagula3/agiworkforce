# AGI CLI — Best-of-Both Capture Map (codex-rs vs claude_reference)

Status: Reference input for the CLI production pipeline
Owner: Platform lead
Last updated: 2026-06-22
Source: comparison workflow `wq9h9s62t` — 8 dimensions, 9 Opus agents, whole-file reads of `~/Desktop/reference/codex-cli` (Rust) and `~/Desktop/reference/claude_reference/src` (TS).

> BRANDING MANDATE: adopt the _patterns_ below, never the wording/names. Everything rebrands to **AGI Code / AGI CLI / AGI Agent / AGI Work / AGI Tokens / AGI credits** in our own phrasing. No "Claude Code"/"Codex" strings in prompts/UI; no proprietary code copied. Verify model IDs only from `packages/types/src/models.json`.

## Overall verdict

**codex-rs = the portable Rust chassis** (ports near-verbatim into our Rust CLI). **claude_reference = the depth/behavior/protocol/extensibility library** layered on top (must be rebuilt in spirit, not copied from TS/Ink). Default move: codex structure everywhere it touches Rust systems plumbing; claude content/protocol/extensibility everywhere it touches model behavior, safety reasoning, and user-facing power. The one inversion is **commands**, where claude's user-extensible multi-source registry wins outright and we only borrow codex's typed-predicate gating discipline.

## Capture map (area → take from → what → priority)

### P0

- **Agent turn-loop chassis — codex.** TurnTask trait on Tokio + CancellationToken; ~100ms grace then hard abort; "interrupted turn" history marker flushed before TurnAborted; per-turn lifecycle/telemetry (turn started/complete/aborted, AGI Tokens usage).
- **Compaction model — codex.** Typed CompactionReason/CompactionPhase enums; pre-turn + mid-turn auto-compaction; AGI-Cloud-remote vs Local selection; cross-model compaction on context downshift or comp-hash change.
- **OS sandbox engine — codex.** In-tree `AgiSandboxType {None, MacosSeatbelt(SBPL), LinuxSeccomp(bubblewrap+seccomp), WindowsRestrictedToken}`; argv-wrapping transform at exec boundary; fail-closed managed network filtering socket() by address family; SIGSYS+keyword denial detection driving retry/escalation.
- **Per-model prompt architecture — codex.** Each model's base instructions as a per-model field in `packages/types/src/models.json` (SSOT), loaded at request time; NEVER hardcode model IDs/cutoffs in prompt code. Static base + volatile context injected as separate user-role XML fragments (`<environment_context>`, `<project_instructions>`) diff-rendered each turn to keep prompt cache warm.
- **Edit engine (primary patch lane) — codex.** Freeform patch tool in AGI's own marker grammar; multi-pass fuzzy line matcher (exact → trailing-ws-insensitive → trim-both → Unicode-normalized) + EOF-sentinel retry; multi-file add/update/delete/move in one call; committed-delta tracker w/ is_exact flag for partial-failure recovery.
- **Interleaved tool execution + concurrency — claude.** Spawn each tool call the moment its tool_use streams in; safety partition (read-only parallel up to `AGI_MAX_TOOL_CONCURRENCY`=10, mutating tools exclusive/in-order, sibling-abort on shell error); surface results in receive-order.
- **Stop/recovery state machine — claude.** Typed enum state machine with continue-arms: model fallback, max-output-tokens escalation then bounded retry-nudge, prompt-too-long → cheap context drop → full compaction, stop-hook reinjection, AGI Tokens/budget continuation; typed terminal-reason union.
- **Behavioral prompt content — claude.** "Acting with care" reversibility/blast-radius confirmation policy; minimal-complexity coding discipline (read-before-edit, prefer editing over creating, no gold-plating); precise output rules (file_path:line, no colon before tool calls, no emojis unless asked, parallel independent calls). Render active trust mode (Local/BYOK/Managed AGI-Cloud) + provider label in env fragment.

### P1

- **Approval pipeline — claude.** Bypass-immune multi-source allow/deny/ask precedence (user/project/local/policy/session); safety checks for sensitive paths (.git/, secrets, config) that prompt even in bypass/auto; injection-resistant command analyzer (CR/IFS/ANSI-C/heredoc/zsh-module + compound/env-strip guards); permission modes (default/accept-edits/plan/bypass/ask) bound to Local(strictest)/BYOK(explicit-consent)/Cloud(server-enforced).
- **Auditable policy DSL — codex.** `agi_rule(pattern, decision=allow|prompt|forbidden, justification)` with host-executable metadata, alongside heuristics, so approvals are auditable/self-documenting.
- **Edit engine (surgical fallback lane) — claude.** Strict string-replace Edit as guarded fallback: read-before-edit, since-read staleness check, unique-match-or-replace-all, OOM/large-file guard. Both lanes wrapped in dispatch envelope (schema-parse → validate → permission/hook gates → execute → post hooks).
- **Tool dispatch repair + schema sanitization — both.** claude: deferred-tool "schema-not-sent, reload via tool-search then retry" hint. codex: MCP input-schema sanitizer + budget-compactor (coerce malformed/boolean schemas, const→enum, prune unreachable defs, lossy to ~1k tokens). Cap tool-result size with char-boundary-safe truncation.
- **MCP credential store + transport — codex.** AGI Credential Store: OS keyring + encrypted local + `~/.agi/.credentials.json` fallback; keyring failures warn-and-fallback (never fatal); 0o600; ~30s refresh skew. Transport Retry classifier (408/429/5xx + transient JSON-RPC w/ bounded backoff + deadline; 404 session-expiry → transparent re-init behind recovery lock then one replay; elicitation-aware timeout). Never let an MCP token cross Local→Managed Cloud silently.
- **MCP actionable errors + login server hardening — codex.** Per-server startup error formatter (auth-required → "Run agi mcp login <server>"; timeout → exact config snippet; no-OAuth → PAT/env workaround). Harden login server: CSRF state validation, sensitive-query redaction, XSS-escaped branded error page, port-with-fallback + cancel-previous, Connection: close.
- **MCP OAuth protocol + agent-auth tool — claude.** RFC 9728→8414 discovery w/ path-aware fallback; RFC 7009 revocation; normalize non-standard invalid_grant aliases; step-up on 403 insufficient_scope (omit refresh token → fresh PKCE); proactive refresh w/ buffer + in-flight dedupe; per-server keying by name+config-hash. `agi__<server>__authenticate` pseudo-tool so the agent can initiate OAuth and hot-swap real tools in on completion.
- **Command registry (extensibility) — claude.** Multi-source registry of polymorphic command objects (Prompt/Local/UI kinds) aggregating built-ins, bundled skills, user/project/policy markdown in `.agi/commands` + `.agi/skills`, plugins, MCP prompts. Frontmatter (allowed-tools, model, effort, args) + templating ($ARGUMENTS/indexed/named, `${AGI_PLUGIN_ROOT}`/`${AGI_SESSION_ID}`, permission-checked inline shell capture run BEFORE the expanded prompt reaches the model). Memoize loading but re-evaluate availability every lookup so Local/BYOK/Cloud changes apply live.
- **Command gating discipline — codex.** Typed per-command predicates (supports_inline_args, available_during_task, available_in_side_session, is_visible) instead of scattered flags; route all popup/dispatch visibility through ONE declarative feature-gated filter; fuzzy prefix matching; single shared slash-name parser.
- **Skills loader + budget renderer — both.** codex: skill-name/SKILL.md dirs + render budgeting (2%-of-context AGI-token budget, fair char-level truncation w/ redistribution, scope ordering System>Admin>Repo>User, per-skill ExecutorFileSystem for Local + AGI Work/E2B remote). claude: conditional path-activation, dynamic dir-walk discovery, realpath dedup, MCP-skill no-inline-shell rule.
- **Hooks engine — codex.** Port the Rust hooks crate as AgiHooksEngine (JSON-over-stdin: permissionDecision allow/deny, updatedInput rewrite, exit-2 blocking, additionalContext; parallel + configured-order reporting + last-completion-wins). Expand event set toward claude's taxonomy as needed (PermissionDenied, Notification, ConfigChange, FileChanged/CwdChanged, Elicitation).
- **Plugins + marketplace — claude.** AGI plugin manifest (plugin.json) w/ claude's breadth (commands/agents/skills/output-styles/mcpServers/hooks/lspServers/settings + userConfig w/ OS-keychain secrets → `${user_config.KEY}`); reuse codex's typed manifest interface for marketplace cards; security model: reserved official-name allowlist, homograph/non-ASCII block, source-org verification, per-marketplace auto-update; GitHub/git/url/local sources + remote bundles. Gate remote fetch/BYOK/Cloud skill exec behind explicit consent + visible provider labels.

### P2

- **In-process extension API — codex.** Typed in-process AGI ExtensionRegistry (Thread/Turn/Tool lifecycle + TurnInput + Context + Tool contributors w/ scoped state) as a fast compile-checked path alongside subprocess hooks.
- **TUI core (scrollback/composer/footer/keymap/theme) — codex.** ratatui terminal-native model: History Scrollback via ANSI scroll-region (HistoryCell display_lines(width) + raw_lines() for copy, OSC-8 links clickable); Composer input state machine (paste-burst detection, merged history, slash/file/skill popups, kill-buffer); Footer w/ width-based progressive collapse; Keymap normalizing cross-terminal quirks + remappable via /keymap; Theme w/ CIE-Lab perceptual matching + truecolor→ansi256→ansi16 downgrade.
- **TUI sub-patterns (statusline + spinner) — claude.** User-configurable Status Line shelling out to a command w/ documented JSON contract (model, workspace, AGI Tokens/context usage, cost, agent, worktree); richer spinner w/ rotating AGI Agent verbs, time-based tips, AGI Tokens budget ETA, stall detection.

## Dimension winners

agent-loop: mixed · system-prompt: mixed · tools: mixed · tui-ux: **codex** · commands: **claude** · skills-plugins: mixed · sandbox-permissions: mixed · mcp-auth-errors: mixed
