# AGI Workforce Developer Surfaces Public Release Audit

Status: Paused audit snapshot; current evidence through 2026-09-14
Owner: CLI lead + VS Code extension lead
Last updated: 2026-09-21

Website is the active release surface. CLI and VS Code implementation resumes
only in the founder's serial order after Mobile, Desktop, and Chrome. This audit
remains evidence of the September 14 tree. On resume, both clients must consume
the same Host Developer session/tool/permission/file/credential owners as
Desktop Code; neither may create a private ecosystem or sync local authority
into Account Cloud without an explicit handoff.

Scope: `apps/cli` (Rust crate `agiworkforce-cli` 1.7.1, binary `agi`) and
`apps/extension-vscode` (`agiworkforce.agi-workforce` 0.3.0), plus the shared
crates and packages both consume. Web, mobile, desktop and the Chrome extension
appear only where a shared contract reaches these two surfaces.

Evidence classes used throughout: **MEASURED** (a number taken from a run in
this audit), **OBSERVED** (behaviour reproduced in this audit against a real
process), **READ** (established from code, with a `file:line` citation),
**HYPOTHESIZED** (inferred, not reproduced), **UNVERIFIED** (could not be
checked from this checkout).

How the live evidence was produced. A debug build of `agi` (Linux x64,
`cargo build -p agiworkforce-cli`, 3 min 3 s) ran against an isolated
`HOME` and a fake OpenAI-compatible server on `localhost:1234` posing as LM
Studio. The fake server scripts each scenario by the first word of the prompt,
records every request body it receives, and returns streaming tool calls
(`read_file`, `edit_file`, `write_file`, `run_command`) or text. Every claim
marked OBSERVED or MEASURED below comes from that harness, a pty driver for the
TUI, or a direct invocation. Nothing in this document is taken from a
provider-side estimate. The instrument's own limits: one platform (Linux x64,
no `bwrap`, so sandboxed `run_command` refused and the unsandboxed path was
exercised with `--no-sandbox`), a debug binary (startup numbers are upper
bounds), and no VS Code runtime (the 323 MB VS Code download aborts through
this environment's proxy, so activation and webview timings stay
HYPOTHESIZED).

## 1. Executive Summary

**Overall: NOT READY.**

| Surface | Verdict             | Why in one line                                                                                                                                                                                                                              |
| ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI     | NOT READY           | Not installable as documented (npm package 404, newest published release 1.0.0 and unsigned), SIGTERM corrupts the terminal and orphans tool children, headless permission flags are inconsistent, secrets read by tools persist unredacted. |
| VS Code | NOT READY           | Typecheck, `check:refs` and the integration compile were red at HEAD (fixed in this PR), the inline diff Accept applies a stale range with no version or content check, and there is no Marketplace listing to update.                       |
| Shared  | CONDITIONALLY READY | The shared core is real and mostly single-owner (catalog, protocol, tools, MCP, routing data); the divergences are in vocabularies and guards, not in behaviour that damages code.                                                           |

Severity counts (34 findings): **P0: 0**, **P1: 3**, **P2: 11**, **P3: 16**, **P4: 4**.

Top shared blockers:

1. `DEV-003` Neither surface is installable through the channel its own README and `agi update --install` name.
2. `DEV-008` The CLI has no sensitive-file rule and no redaction on tool output, while the VS Code extension enforces `isSensitiveFile` on its own attachments; in agent mode the VS Code extension runs its file tools inside the same `agi app-server`, so the VS Code guard is bypassed by the shared tool layer.
3. `DEV-014` Four independent permission-mode vocabularies, one of which (`approval_mode` in `config.toml`, written by onboarding) is never read.

Top CLI blockers:

1. `DEV-005` SIGTERM leaves the terminal in raw mode on the alternate screen and orphans a running tool child (no SIGTERM handler).
2. `DEV-004` `agi exec` ignores the global permission flags; `--permission-mode acceptEdits` cannot edit a file headlessly; a headless denial hard-exits the process mid `--json-events` stream.
3. `DEV-007` `agi ... | head` panics with a broken-pipe trace and exit 101 on the JSON and completion paths.

Top VS Code blockers:

1. `DEV-001` The release workflow's `typecheck` step and CI's `check:refs` fail at HEAD (fixed here, one-line lib change).
2. `DEV-002` Inline diff Accept replaces a captured `Range` without checking the document version or the original text, so an edit made between propose and accept is overwritten.
3. `DEV-023` No `CHANGELOG.md`, `preview: true`, and no live listing.

Strongest areas: the CLI's write path (read-before-write, mtime plus content
staleness check, project-root containment, path-escape refusal), the CLI's
stdout/stderr discipline and JSON validity, Workspace Trust gating on every
chat entry point in VS Code, SecretStorage and OS-keyring credential storage,
the VSIX allowlist packaging, the generated model catalog feeding both
languages from one source, and the app-server protocol version being pinned by
a cross-language test.

Weakest areas: signal handling and process lifecycle in the CLI, the VS Code
inline-diff apply path, distribution on both surfaces, and the permission
vocabulary sprawl.

## 2. Architecture Map

```text
                    packages/ai/model-registry (curation -> compile.mjs)
                              |                  |
      packages/contracts/types/src/models.json   crates/agiworkforce-model-registry (include_str!)
                              |                  |
   crates/agiworkforce-protocol (ts-rs) --> packages/contracts/types/src/generated/protocol
                              |
   crates/agiworkforce-llm | agiworkforce-mcp | agiworkforce-agent-core | agiworkforce-execpolicy
                              |
                       apps/cli  (agi)  ---- `agi app-server` (JSON-RPC over stdio) ----+
                              |                                                        |
        TUI / REPL / --print / exec                    apps/extension-vscode (LocalRuntimeClient spawns agi)
                                                            |
                              webview sidebar, chat participant, CodeLens diff review, inline commands
                              (its own HTTPS client to /api/llm/v1 for explain/fix/refactor/review/completions)
```

What is genuinely shared (READ):

- Model catalog: one generator emits `packages/contracts/types/src/models.json` and `crates/agiworkforce-model-registry/src/generated/model_registry.json` (`packages/ai/model-registry/scripts/compile.mjs:37,55-64`). Both surfaces resolve IDs from it.
- Developer-session protocol: `crates/agiworkforce-protocol` exports ts-rs bindings; the extension pins `SUPPORTED_PROTOCOL_VERSION = 7` and `AGENT_EVENT_SCHEMA_VERSION = 4` against the Rust constants in `apps/extension-vscode/src/__tests__/cliProtocolContract.test.ts:72-99`.
- Tools, MCP, sandbox, exec policy, local-model probing: implemented once in Rust and consumed by VS Code agent mode through `agi app-server` (`apps/extension-vscode/src/integrations/localRuntimeClient.ts:786-794`). VS Code has no tool or MCP implementation of its own.
- Routing policy data: same JSON tables; the algorithms differ (see §3).
- AGI Cloud wire contracts: `/api/auth/device/*`, `/api/llm/v1/*`, `/api/usage`, `/api/me` are called by two independent HTTP clients with the same shapes.

Duplicated systems (READ): auto-routing algorithm (`apps/cli/src/routing/{classify,fallback}.rs` vs `packages/ai/routing`), provider error classification (`crates/agiworkforce-llm/src/error.rs` vs `apps/extension-vscode/src/core/cloudUtilityErrorActions.ts`), SSE parsing (`crates/agiworkforce-llm/src/stream.rs` vs `apps/extension-vscode/src/utils/api.ts:392-410`), permission-mode enums (four copies, `DEV-014`), context-handoff constants (`apps/cli/src/context_handoff.rs:9-12` vs `packages/contracts/types/src/context-handoff-uri.ts:10-17`), tier enums, sensitive-file rules (TS only).

Dead or legacy (READ): `apps/cli/src/subagent_v2.rs` (no call sites), `AGIWORKFORCE_OAUTH` PKCE record with endpoints that differ from the live device flow (`apps/cli/src/oauth.rs:56-67`, unreachable via `apps/cli/src/auth.rs:1041-1043,1194-1212`), `config.default.approval_mode` (written by onboarding, never read), `agi mcp-server` (advertises no tools by design), `agi marketplace` (backend not deployed, `apps/cli/src/lib.rs:131-135`), `WorkspaceIndexer.index()` and `ContextBuilder.buildFullContext()` in VS Code (never called), `patchEngine.applyPatch*` in VS Code (only `showOriginalContext` is wired).

## 3. Shared Capability Matrix

| Capability      | CLI                                                                                                     | VS Code                                                                                            | Shared Core                                                               | Divergence                                              | Status                                |
| --------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Auth            | Device code to `agiworkforce.com/api/auth/device/*`, OS keyring, 0600 file fallback (`auth.rs:177-302`) | Device code to the same endpoints, `SecretStorage` (`deviceAuth.ts:108-190,287`)                   | Wire contract only                                                        | Dead PKCE record with other endpoints (`DEV-018`)       | INTENTIONAL (native storage) + LEGACY |
| Model catalog   | `include_str!` of generated JSON                                                                        | `@agiworkforce/types`                                                                              | `packages/ai/model-registry`                                              | none                                                    | SHARED, good                          |
| Model routing   | `routing/classify.rs` + `fallback.rs`, two files                                                        | `@agiworkforce/routing` (14 files, capability health, task families)                               | Policy JSON only                                                          | Algorithm depth                                         | DUPLICATION (`DEV-027`)               |
| Local AI        | Probes Ollama `:11434` and LM Studio `:1234` (`local_models.rs`)                                        | `model/list` RPC to `agi app-server`; "local runtime" there means the CLI process                  | CLI is the owner                                                          | Naming collision only                                   | SHARED, good                          |
| Projects        | `project_registry.rs` trust registry + `agi projects link`                                              | VS Code workspace folders; no registry                                                             | none                                                                      | Different root semantics (see §6)                       | INTENTIONAL                           |
| Tools           | `features/exec/tools/*`                                                                                 | none; renders events from the app-server                                                           | Rust                                                                      | none                                                    | SHARED, good                          |
| MCP             | `crates/agiworkforce-mcp` + `mcp/*`                                                                     | none; status notifications only                                                                    | Rust                                                                      | none                                                    | SHARED, good                          |
| Usage           | `/api/usage`, `UserTier` enum (`tier_cache.rs:71-83`)                                                   | `/api/usage`, `UIPlanTier` from `@agiworkforce/types`                                              | Wire contract; TS type is canonical                                       | Rust enum hand-maintained                               | DUPLICATION, low risk                 |
| Context loading | cwd, git branch/status, project instructions, explicit `-f`/`@` mentions                                | selection or `contextLines` window, explicit attachments, pinned files, memory                     | none                                                                      | Different by design                                     | INTENTIONAL                           |
| File exclusion  | none for `read_file`/`run_command`; `.gitignore` via `git ls-files` for mentions only                   | `isSensitiveFile` on attachments and completions (`packages/platform/utils/src/sensitiveFiles.ts`) | TS only                                                                   | CLI lacks the rule; VS Code agent mode inherits the gap | BUG (`DEV-008`)                       |
| Streaming       | `crates/agiworkforce-llm` SSE/NDJSON, idle watchdog                                                     | Own SSE parser for `/api/llm/v1` (`utils/api.ts:392-410`), 1 MB buffer cap                         | none                                                                      | Two parsers                                             | DUPLICATION, low risk                 |
| Cancellation    | Ctrl+C races the turn future; TUI key handling                                                          | `CancellationToken` -> `turn/interrupt` RPC; `req.destroy()` on the HTTPS path                     | Protocol `turn/interrupt`                                                 | Child processes survive (`DEV-006`)                     | BUG (CLI)                             |
| Error mapping   | `LlmError` -> `CliError` kinds                                                                          | `AgiWorkforceApiError` codes + `classifyCloudUtilityFailure`                                       | Paywall JSON shape only                                                   | Names invented twice                                    | DUPLICATION (`DEV-029`)               |
| Approvals       | `PermissionMode` (5) + `config.approval_mode` (3, unread)                                               | `ExtensionAgentMode` (4, hand-copied) -> protocol `DeveloperAgentMode` (4)                         | `DeveloperAgentMode` generated type exists but is not imported by VS Code | Four vocabularies                                       | BUG (`DEV-014`)                       |

## 4. CLI Command Matrix

Every public command was invoked with `--help`; the rows marked OBSERVED were
run for real with stdin from `/dev/null` and stdout to a file, so "Non-TTY"
means the command completed without a prompt and "stdout clean" means zero
ANSI bytes and zero diagnostics on stdout.

| Command                                         | Interactive                | Non-TTY                                                                               | JSON                                                                      | Exit Code                                                    | Verified                       |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `agi` (bare)                                    | TUI (ratatui)              | reads stdin as prompt; blocks until EOF (`DEV-021`)                                   | `--output-format json\|stream-json`                                       | 0; 1 on provider error; 130 on Ctrl+C in TUI; auth failure 1 | OBSERVED                       |
| `agi "prompt"` / `--print`                      | streams to stdout          | works                                                                                 | `--output-format json` valid, `stream-json` valid JSONL                   | 0 / 1; SIGINT kills by signal (no 130)                       | OBSERVED                       |
| `agi exec`                                      | n/a                        | works; `--full-auto` honours edits                                                    | `exec --json` valid; top-level `--json` before `exec` ignored (`DEV-030`) | 0 / 1 / 130                                                  | OBSERVED                       |
| `agi review`                                    | n/a                        | UNVERIFIED (needs a diff and a model)                                                 | none                                                                      | UNVERIFIED                                                   | READ                           |
| `agi apply`                                     | prints result              | works                                                                                 | none                                                                      | non-zero on `git apply` failure (`lib.rs:2905-2933`)         | READ                           |
| `agi sandbox`                                   | n/a                        | works                                                                                 | none                                                                      | propagates child exit code (`lib.rs:2948`)                   | READ                           |
| `agi update [--check]`                          | prints                     | works, 833 ms to the production feed                                                  | none                                                                      | 0; `--check` exits 1 when newer exists                       | OBSERVED                       |
| `agi mcp add\|list\|get\|login\|logout\|remove` | prompts on login           | list works                                                                            | none                                                                      | 0                                                            | READ                           |
| `agi hooks list\|add\|remove`                   | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi mcp-server`                                | stdio server               | works, advertises zero tools by design                                                | JSON-RPC                                                                  | n/a                                                          | READ                           |
| `agi completion <shell>`                        | n/a                        | works; panics on closed pipe (`DEV-007`)                                              | n/a                                                                       | 0; 101 on `\| head`                                          | OBSERVED                       |
| `agi app-server`                                | stdio / ws server          | works                                                                                 | JSON-RPC                                                                  | n/a                                                          | READ (integration tests exist) |
| `agi resume\|fork\|session`                     | prompts on delete          | list/show work                                                                        | none                                                                      | 0                                                            | READ                           |
| `agi models list\|status\|scan\|set`            | n/a                        | works, 717 ms (debug build)                                                           | `--json` valid; `--output-format json` valid (376 rows)                   | 0; 101 on `\| head` with JSON (`DEV-007`)                    | OBSERVED                       |
| `agi plugin list\|install`                      | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi features`                                  | n/a                        | works                                                                                 | none                                                                      | 0                                                            | OBSERVED                       |
| `agi approvals *`                               | n/a                        | `list` renders a TUI widget to a pipe (`DEV-012`)                                     | `export` JSON                                                             | 0                                                            | OBSERVED                       |
| `agi execpolicy`                                | n/a                        | works                                                                                 | none                                                                      | 0                                                            | OBSERVED                       |
| `agi ecosystem scan\|import\|show`              | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi migrate [--dry-run]`                       | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi history`                                   | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi sync status\|export\|import`               | n/a                        | works                                                                                 | `export` JSON on stdout                                                   | 0                                                            | READ                           |
| `agi login [provider]`                          | device code, opens browser | prints URL and code to stderr, polls up to 5 min; does not fail fast in CI            | none                                                                      | 0 / 1; 124 under `timeout` in this audit                     | OBSERVED                       |
| `agi logout`                                    | n/a                        | works                                                                                 | none                                                                      | 0                                                            | READ                           |
| `agi auth-status`                               | n/a                        | works                                                                                 | none                                                                      | 0                                                            | OBSERVED                       |
| `agi doctor [--json]`                           | n/a                        | works, 102 ms                                                                         | valid JSON, 0 ANSI bytes                                                  | 0 even when `overall: warn`                                  | OBSERVED                       |
| `agi marketplace *`                             | n/a                        | backend not deployed (`lib.rs:131-135`)                                               | none                                                                      | UNVERIFIED                                                   | READ                           |
| `agi init`                                      | n/a                        | works; trusts cwd without a prompt (documented as the explicit headless trust action) | none                                                                      | 0                                                            | OBSERVED                       |
| `agi onboarding`                                | wizard                     | exits when stdin is not a TTY                                                         | none                                                                      | 0                                                            | READ                           |
| `agi usage`                                     | n/a                        | works; prints "unavailable" without auth                                              | none                                                                      | 0                                                            | OBSERVED                       |
| `agi schedules\|projects\|memory *`             | n/a                        | refuse in Local/BYOK mode (`lib.rs:1423-1439`)                                        | `schedules --json`                                                        | 1 on connect failure                                         | READ                           |

Parse errors: unknown flag exits 2 with a one-line error on stderr; `agi exec`
without a prompt exits 2 (OBSERVED). Untrusted directory in headless mode
exits 1 with a one-line reason (OBSERVED; with `RUST_BACKTRACE=1` in the
environment the `Error:` Debug form appends a full backtrace, `DEV-020`).

## 5. VS Code Command / Contribution Matrix

85 contributed commands, all registered and none registered without a
contribution (READ, verified by diffing `package.json` against every
`register(` site). Grouped by feature:

| Feature                                                | Entry Point                                                            | Context                                                           | Safety                                                                                                 | Verified                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Sidebar chat                                           | activity bar view `agi-workforce.sidebar`, `AGI Workforce: Open Chat`  | selection or `contextLines`, explicit attachments                 | Workspace Trust checked before a turn (`ChatStateManager.ts:1251,1620,1976`); approvals as modals      | READ, unit tests pass               |
| `@agi` chat participant                                | `agiworkforce.agi`, slash `explain\|fix\|refactor\|tests\|docs\|model` | editor context fenced as untrusted (`chatParticipant.ts:255-271`) | Trust check (`chatParticipant.ts:303-307`); cancellation -> `turn/interrupt`                           | READ                                |
| Explain / Fix / Refactor / Tests / Docs / Review       | editor context menu (needs `editorHasSelection`), palette              | selection                                                         | `applyLlmEdit` asks "Apply Inline" unless `autoApplyFixes` and trusted (`runInlineCommand.ts:52-53`)   | READ                                |
| Inline diff review                                     | CodeLens Accept/Reject/All/Batch, `ctrl+shift+a`, `escape`             | pending `DiffSession`                                             | Modal naming files for bulk ops; **no stale check** (`DEV-002`); batch non-atomic (`DEV-011`)          | READ, tests cover modal gating only |
| Terminal: run / suggest / explain                      | palette, chat "run" affordance                                         | AGI Workforce terminal, cwd = active folder                       | Trust gate at the single sink (`terminalProvider.ts:712-717`); allowlist validator + modal for AI text | READ, tests                         |
| Agent mode picker / effort                             | `AGI Workforce: Choose Agent Mode`, status bar                         | global setting, machine scope                                     | Bypass needs a modal consent per workspace identity (`agentModeConsent.ts`)                            | READ, tests                         |
| Model picker                                           | `AGI Workforce: Select Model`, status bar, sidebar select              | tier-gated, locked models shown disabled                          | Provider-switch guard needs `max` tier (`providerSwitchGuard.ts:29-44`)                                | READ, tests                         |
| Sign in / out, API key                                 | palette                                                                | SecretStorage                                                     | Same-origin check on the device URL; modal before clearing a key                                       | READ, tests                         |
| Cloud tasks / schedules / memory / conversations trees | five tree views, context menus with `when` clauses                     | account                                                           | argument-only commands hidden from the palette (`when: false`)                                         | READ, tests                         |
| Inline completions                                     | `inlineCompletions.enabled` (default off)                              | 1200-char prefix                                                  | skips `isSensitiveFile` and secret-shaped names                                                        | READ, tests                         |
| Code actions / hover / CodeLens                        | registered for `*`; hover and CodeLens gated by settings               | diagnostics, selection                                            | read-only                                                                                              | READ                                |
| Desktop bridge                                         | `desktopBridge.enabled` (default off)                                  | `ws://127.0.0.1:8787`, token file must be 0600                    | off by default                                                                                         | READ                                |
| Settings panel                                         | `AGI Workforce: Open Settings`                                         | webview, `localResourceRoots: []`                                 | CSP nonce                                                                                              | READ, tests                         |
| Walkthrough                                            | `agiWorkforce.gettingStarted`                                          | 4 steps                                                           | n/a                                                                                                    | READ                                |

Test evidence (MEASURED): `vitest run` 92 files / 1094 tests pass;
`vitest run --config vitest.webview.config.ts` 20 files / 128 tests pass; eslint
clean with `--max-warnings=0`; VSIX packages to 17 files, 546 KB, and
`verify-vsix.mjs` accepts it. `tsc --noEmit` and `tsc -b tsconfig.build.json`
failed at HEAD and pass after the one-line fix in this PR (`DEV-001`).

## 6. Context & Privacy Model

```text
developer source (cwd / workspace folder, selection, attachments, tool reads)
      |
context builder
      CLI: gather_system_context (cwd, git branch/status, CI detection), project instructions
           gated on the trust prompt, explicit -f / @mentions via `git ls-files`
      VS Code: selection or contextLines window fenced as <untrusted_editor_context>,
           explicit attachments validated by isSensitiveFile + path containment, pinned files under cwd
      |
AGI Workforce (managed) or provider (BYOK / local) -- Local mode never leaves the device
      |
router (Auto slots from the shared catalog; CLI FallbackChain, VS Code @agiworkforce/routing)
      |
provider
```

What the CLI sends by default (OBSERVED from the recorded request bodies): a
5,871-character system prompt, the user prompt, and 13 tool definitions
(`read_file, write_file, run_command, powershell, search_files, list_directory,
edit_file, web_search, web_fetch, task, grep_files, tool_search, skill`). No
repository files, no git diff, no `.env` content is sent unless a tool reads
it or the user attaches it. That is the right default.

What is captured, stored and logged:

- CLI managed sessions: `~/.agiworkforce/managed_sessions/*.jsonl`, mode 0600, directory 0700 (OBSERVED). Tool results are stored verbatim; the `.env` line `SECRET_TOKEN=sk-ant-api03-...` read by `read_file` was found in two session files (`DEV-008`).
- CLI tracing: stderr only, filter `agiworkforce_cli=warn` by default (`apps/cli/src/lib.rs:631-650`). `~/.agiworkforce/log` stayed empty across every run.
- CLI `--json-events` redacts obvious secret shapes in tool arguments (`agent_events.rs` `args_redacted`).
- VS Code telemetry: default off, endpoint allowlisted, `redactSecrets` on every property, structural-only crash payloads (`core/telemetry.ts:15-59`, `core/errorReporting.ts:9-27`). Console output is `warn`/`error` only; two sites log a raw malformed message object locally.
- VS Code `redactSecrets` is applied to git diff-stat context, not to selections; exclusion rather than scrubbing protects model-bound context.

Repository root semantics (READ):

- CLI: project trust and policy are keyed by `project_scope::resolve_project_scope(cwd)` and the registry in `~/.agiworkforce/projects.json`; `cwd` is the workspace root for tool containment (`tools/mod.rs:526-539`). `--add-dir` registers extra roots. A nested git repository or a monorepo package is whatever directory `agi` was started in; there is no walk-up to a `.git` boundary for tool containment, so starting `agi` inside one package directory confines edits to that package (safe) while starting at the monorepo root allows any package (expected).
- VS Code: multi-root is handled by active-editor resolution with a quick pick fallback (`platform/workspaceFolders.ts:4-39`), except project instructions, which always read folder 0 (`DEV-015`). Each `LocalRuntimeClient` is keyed by workspace path (`localRuntimePool.ts:23-35`), so two windows spawn two `agi app-server` processes and cannot share threads (`tests/developer_session_host.rs::a_workspace_scoped_host_cannot_fork_or_archive_another_workspace_thread`).

Cross-workspace isolation (READ, integration-tested on the Rust side): the
app-server rejects context files outside the thread's workspace
(`tests/developer_session_host.rs::a_turn_rejects_context_files_outside_its_workspace`).
The CLI's read-state cache is process-global and keyed by canonical path
(`file_state.rs:11-53`), so an app-server serving several workspaces shares
freshness state by absolute path, which is harmless.

## 7. Code-Change Safety Matrix

| Capability        | CLI                                                                                                                                                                              | VS Code                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diff preview      | REPL/headless: unified diff on stderr before the prompt (`file_ops/mod.rs:517-548`); TUI: approval overlay with the change                                                       | Inline decorations plus CodeLens; "Show Original Context" opens a real diff editor for fuzzy matches; agent-mode edits are previewed by the CLI's approval event |
| Stale detection   | **Works.** mtime then content compare; OBSERVED: an edit after an external change returned "File has been modified since read" and did not write                                 | **Missing** on the CodeLens path (`diffDecorationProvider.ts:302-318`), `DEV-002`; `applyLlmEdit` reuses the selection captured before the request               |
| Multi-file        | `multiedit` applies all edits in memory before one write; not offered in the default tool set (OBSERVED "not available in this session")                                         | Batch accept iterates `applyEdit` per session, not one `WorkspaceEdit` (`DEV-011`)                                                                               |
| Conflict handling | `edit_file` requires a unique `old_string`; `git apply` for patches is strict                                                                                                    | Fuzzy match refuses ambiguous matches (`patchEngine.ts:277-312`) but that engine is not wired to Accept                                                          |
| Apply             | `tokio::fs::write`, direct, not atomic (`DEV-013`); path containment enforced (OBSERVED `../outside.txt` refused)                                                                | `vscode.workspace.applyEdit`, correct API, undo-integrated                                                                                                       |
| Undo / revert     | **None for files.** `/rewind` restores conversation checkpoints only (`agent/history.rs`); no shadow repo (`DEV-017`)                                                            | Native editor Undo after Accept; one-level "Restore Discarded" for rejects (by design)                                                                           |
| Partial failure   | `multiedit` is all-or-nothing in memory; a multi-tool turn has no rollback and the model narrates the outcome (OBSERVED `exit 3` reported as `Exit code: 3` and the run exits 0) | Batch stops at a failing file with a per-file warning, no summary, earlier files stay applied (`DEV-011`)                                                        |

## 8. Tool / Agent Safety

All tools run in the CLI (`apps/cli/src/platform/runtime/tool_catalog.rs`) and
are the same tools VS Code agent mode uses through the app-server.

| Class       | Tools                                                                                                                                                  | Gate (READ unless noted)                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| READ        | `read_file`, `read_many_files`, `search_files`, `grep_files`, `glob`, `list_directory`, `lsp_*`, `todo_read`, `tool_search`, `skill`, `list_worktrees` | Auto-approved; project containment only; **no sensitive-file rule** (OBSERVED `.env` returned to the model), 500 KB read cap                                                                                                   |
| WRITE       | `write_file`, `edit_file`, `multiedit`, `apply_patch`, `notebook_edit`, `enter_worktree`, `exit_worktree`, `todo_write`, `update_plan`                 | Read-before-write and staleness (OBSERVED), approval unless bypass; headless without bypass hard-exits 1 (`DEV-004`)                                                                                                           |
| EXTERNAL    | `web_search`, `web_fetch`, `advisor`, `cron_*`, `team_*`, MCP tools                                                                                    | Blocked in Local privacy mode (`tools/mod.rs:334-346`); MCP calls go through the same approval path                                                                                                                            |
| DESTRUCTIVE | `run_command` / `powershell` with `rm`, `git reset`, `git clean`, `git push --force`, `sudo`, `dd`, `mkfs`                                             | Exec policy `Forbidden` is unoverridable; dangerous classification defaults to deny (OBSERVED `rm -rf ./victim` denied in headless default mode); under `--dangerously-skip-permissions` it runs (OBSERVED, directory deleted) |

Shell execution (READ, `features/exec/tools/bash/mod.rs`): the model's command
string is passed as one argv element to `sh -c` (no string concatenation);
cwd is the process cwd; timeout 30 s; output capped at 50 KB / 2000 lines;
exit code reported in the tool result; sandbox is `bwrap` on Linux and
Seatbelt on macOS with network denied, none on Windows; without the backend
the tool refuses (OBSERVED "Sandbox unavailable") unless `--no-sandbox`.

Approval consistency: the CLI's dangerous-command classifier and exec policy
apply identically to VS Code agent mode because the decision is made in the
app-server; VS Code only renders Approve once / for session / Deny / Abort. The
VS Code-side terminal suggestion path has its own allowlist validator and modal
(`terminalProvider.ts:602-631,860-868`), which is a second, stricter gate for a
second, user-visible terminal, not a duplicate of the agent gate.

## 9. Streaming / Performance

MEASURED, debug build (`target/debug/agi`, unoptimized), Linux x64, 4 vCPU:

| Point                                             | Value                 | Note                                                                                               |
| ------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `agi --version` wall time                         | 15 ms                 | 3 runs                                                                                             |
| `agi --help`                                      | 17 ms                 |                                                                                                    |
| `agi doctor --json`                               | 102 ms                | probes git, sh, rg, node, cargo                                                                    |
| `agi models list`                                 | 717 ms                | includes both local-server probes with connection refusal                                          |
| One-shot prompt to provider auth failure          | 100 ms                | process start, config, trust, context, dispatch                                                    |
| T0 submit to T7 first byte on stdout              | 2,207 ms              | fake provider held first token for 2,000 ms; CLI overhead ~207 ms including the `/v1/models` probe |
| Token forwarding cadence                          | 100 ms between chunks | 21 stdout chunks for 20 tokens sent 100 ms apart: no buffering, no coalescing                      |
| Ctrl+C during streaming (`exec`)                  | 5 ms to exit 130      | partial output flushed, `Finished{reason:"interrupted"}` on `--json-events`                        |
| Ctrl+C during a running tool (`exec --full-auto`) | 5 ms to exit 130      | but the child `sleep 60` survived (`DEV-006`)                                                      |
| SIGTERM during a running tool                     | immediate, exit 143   | child survived, terminal not restored (`DEV-005`)                                                  |
| TUI first paint                                   | UNVERIFIED            | the pty driver polled at 4 s; instrument limit, not a product number                               |
| Memory                                            | UNVERIFIED            | `/usr/bin/time` absent in this container                                                           |

The fake provider ran locally, so T2 to T6 (backend request, route, dispatch,
provider first token, AGI receive) collapse to the server's 2,000 ms hold and
are not a statement about `agiworkforce.com`. The managed-cloud route was not
exercised: no account credential is available in this environment. ACTIVE_ISSUES
records 2.1 s to answer "hi" on the free router over the durable transport on
`:3100` (2026-09-10); that number is the backend's, not this audit's.

VS Code: activation, extension-host CPU, webview render and send-to-first-token
are HYPOTHESIZED from code: `activate()` performs no awaited network call and
no workspace scan; the only eager network is the opt-in localhost desktop
bridge; `refreshAccountTierCache` fires and is not awaited
(`extension.ts:244`). The always-on `WorkspaceIndexer` file watcher and the
unconditional 30 s telemetry timer are the two pieces of idle activation work
with no benefit (`DEV-016`).

## 10. Security

Credentials:

- CLI: OS keyring by default, `auth.json` carries only a provider index (OBSERVED `{"storage":"os-keyring","providers":[]}`), 0600 plaintext fallback only when `AGIWORKFORCE_NO_KEYRING` is set and never on keyring failure (`auth.rs:296-302`). Good.
- VS Code: `SecretStorage` for the API key and account token; no token in `globalState` (READ). Good.
- MCP OAuth tokens: `mcp/oauth_store.rs`, CLI-owned. VS Code holds none.

Context and secrets: see `DEV-008`. The CLI's `secret_redaction.rs` covers
known key shapes for "persisted logs and explicit Local to cloud payload
previews" by its own doc, yet the session transcript on disk contained the raw
key. Under managed mode a transcript can be pushed to the account
(`cloud/chat.rs:378`), so an unredacted tool result can leave the device; not
reproduced here (no account).

Logs: no token or key logging found in either surface (READ). The CLI never
writes a log file on the audited paths; VS Code's Patches output channel logs
patch sizes and confidence only.

Telemetry: VS Code default off, redacted, allowlisted endpoint; CLI has no
telemetry client on the audited paths.

Shell execution: structured argv into `sh -c` in the CLI; `terminal.sendText`
into a visible terminal in VS Code (the user sees and can interrupt it); git
and test runners use `execFile` with argv arrays and a 30 s timeout. No shell
string concatenation found.

MCP: Rust-owned; elicitation auto-declines in headless hosts
(`lib.rs:4222-4223`); timeouts per call kind; remote OAuth with RFC 9728/8414/7591
discovery. VS Code inherits all of it and adds nothing, which is the right
shape.

Trust boundaries: Local mode blocks network tools (OBSERVED
`web_search ... unavailable in Local privacy mode` path in
`tools/mod.rs:334-346`); repository-controlled `.agiworkforce/config.toml` cannot
redirect a provider `base_url` off loopback without consent
(`config.rs:454-510`); a repository policy file cannot remove an approval until
the directory is trusted (`tools/mod.rs:541-553`). `check:trust-boundaries` does
not include the CLI surface (`DEV-024`).

## 11. Distribution / Marketplace Readiness

CLI (OBSERVED 2026-09-14):

- `npm view @agiworkforce/cli` returns 404: the package the README and `agi update --install` point at does not exist on the registry.
- `agi update --check` against the production feed: running 1.7.1, newest published 1.0.0 (2026-05-03), and the README states no published release carries the signed checksum manifest the installer requires. `agi update --install` therefore cannot succeed on any current release.
- `release-cli.yml` builds six targets (macOS arm64/x64, Linux x64/arm64, Windows arm64/x64) with Sigstore-signed checksums; none of them has been cut since 1.0.0 (READ, `release-cli.yml:108-136`; ACTIVE_ISSUES row `v-cli-1.0.0`).
- `apps/cli/npm/package.json` declares `engines.node >= 24`; this environment's Node 22 ran the extension toolchain but the npm shim would refuse to install.
- License is "Proprietary" in both manifests; `LICENSE` ships in the VSIX; `THIRD_PARTY_LICENSES.md` exists at the root. UNVERIFIED whether the npm tarball carries a license text.

VS Code (OBSERVED 2026-09-14):

- `marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce` returns 404: there is no listing yet.
- VSIX contents are exactly the allowlisted 17 entries; `verify-vsix.mjs` rejects `.env`, maps, logs, `src/`, `scripts/`, tsconfigs and internal docs; no localhost or staging default (the only `staging.agiworkforce.com` string is an endpoint allowlist entry). Clean.
- `preview: true`, `pricing: Free`, icon present, README present, **no CHANGELOG.md**, `qna: marketplace`.
- The release workflow runs `typecheck`, which failed at HEAD (`DEV-001`).

## 12. Findings

### DEV-001: VS Code typecheck, `check:refs` and the integration compile fail at HEAD

Severity: P1
Surface: VS Code
Area: build, CI, release workflow
Command/View: `pnpm --filter agi-workforce typecheck`, `check:refs`, `test:integration*`
Evidence: four `TS2339: Property 'entries' does not exist on type 'Headers'` errors in `packages/contracts/cloud-contracts/src/{managed-cloud-chat-attachments-client.ts:78, managed-cloud-project-knowledge-client.ts:139, managed-cloud-projects-client.ts:158, schedules.ts:287}` (MEASURED, TypeScript 5.9.3). Introduced by `0a38c6cf` (2026-09-13).
Reproduction: `pnpm --filter agi-workforce typecheck` at `caa192dc`.
Expected: green, as `ci.yml:340` and `release-vscode-extension.yml:94` require.
Actual: exit 2; `xvfb-run pnpm test:integration:package` dies at `tsc -p tsconfig.test.json`.
Root Cause: Verified. `apps/extension-vscode/tsconfig.json` sets `lib: ["ES2022","DOM"]` while `tsconfig.base.json` uses `["ES2021","DOM","DOM.Iterable"]`; `Headers.entries()` lives in `DOM.Iterable`. The extension compiles the cloud-contracts sources as part of its own program, so the narrower lib wins.
Code/Data Safety Impact: none at runtime; blocks every release path.
Recommended Correction: add `"DOM.Iterable"` to the extension lib (done in this PR). Longer term, `packages/contracts/cloud-contracts` should be consumed through its own build rather than re-typechecked under each consumer's lib.
Shared Impact: the same package is consumed by web and desktop; only the VS Code program had the narrower lib.
Verification: `pnpm --filter agi-workforce typecheck` and `check:refs` exit 0 after the change (MEASURED); unit and webview suites unchanged.

### DEV-002: Inline diff Accept writes a captured range without checking the document changed

Severity: P1
Surface: VS Code
Area: code-change safety, stale patch
Command/View: `agi-workforce.acceptDiff`, `acceptCurrentDiff`, `acceptAll*`, `acceptBatch`; `applyLlmEdit` with `autoApplyFixes`
Evidence: `DiffSession` stores `uri`, `range`, `originalText`, `newText` (`diffDecorationProvider.ts:3-13`); `acceptDiff` builds `WorkspaceEdit.replace(session.uri, session.range, session.newText)` with no comparison of `document.getText(session.range)` to `originalText` and no `document.version` capture (`:302-318`); only `onDidChangeActiveTextEditor` and `onDidCloseTextDocument` are subscribed (`:225-230`). `applyLlmEdit` replaces the `selection` captured before the model call (`platform/applyEdit.ts:38-48`).
Reproduction: propose a diff from the sidebar on a selection, type two lines above it, press Accept.
Expected: refuse or re-anchor, and say the file changed.
Actual: READ, not run (no VS Code runtime here): the edit lands at the recorded line range, which now holds different text; `applyEdit` returns true, so the "document may have changed" warning never shows.
Root Cause: Verified from code.
Code/Data Safety Impact: user text overwritten by an AI patch; the native Undo stack recovers it, which is why this is P1 and not P0.
Recommended Correction: capture `document.version` and `originalText` at `showDiff`; on accept, if `document.getText(range) !== originalText`, re-locate with `patchEngine.applyPatch` (which already exists and reports confidence) or refuse with the "Show Original Context" diff; invalidate sessions on `onDidChangeTextDocument` for that URI; for `applyLlmEdit` re-read the selection text before applying. Add a component test that edits the document between propose and accept.
Shared Impact: the CLI's `file_state.rs` already implements the equivalent rule; the two surfaces should share the semantics ("refuse when the target text moved") even though the mechanism differs.
Verification: new test under `src/__tests__/diffDecorationProvider.test.ts` covering a shifted range and a changed original; manual pass in VS Code.

### DEV-003: Neither surface is installable through its documented channel

Severity: P1
Surface: Shared (distribution)
Area: packaging, install, update
Command/View: `npm install -g @agiworkforce/cli`, `agi update --install`, Marketplace listing
Evidence: `npm view @agiworkforce/cli` 404 (OBSERVED); `agi update --check` reports newest published 1.0.0 dated 2026-05-03 (OBSERVED, 833 ms); README states no published release carries a signed manifest and the installer refuses unsigned archives (`apps/cli/README.md:56-61`); Marketplace URL 404 (OBSERVED).
Reproduction: run the commands above.
Expected: a 1.7.1 release with `SHA256SUMS` and Sigstore bundle, an npm package, a Marketplace listing.
Actual: none of the three exists.
Root Cause: Verified. Release workflows exist and have not been run since 1.0.0 (ACTIVE_ISSUES `v-cli-1.0.0` row).
Code/Data Safety Impact: users who follow the docs cannot install; those who build from source get a binary with the findings below.
Recommended Correction: cut a CLI release from current main after the P1/P2 CLI findings, publish the npm shim, and publish the VSIX once `DEV-001`, `DEV-002` and `DEV-023` are closed. Keep `agi update --install` refusing unsigned archives.
Shared Impact: both surfaces.
Verification: `agi update --check` exits 0 with a newer-or-equal published version carrying a manifest; `npm view` and the Marketplace URL resolve.

### DEV-004: Headless permission flags are inconsistent across `exec`, `--print`, and `--permission-mode`

Severity: P2
Surface: CLI
Area: approvals, CI, exit codes
Command/View: `agi exec`, `agi --print`, `--permission-mode`, `-y`, `--dangerously-skip-permissions`, `--json-events`
Evidence (OBSERVED, all with stdin from `/dev/null`, scenario read-then-edit):

| Invocation                                        | Result                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `agi --dangerously-skip-permissions --print`      | edit applied, exit 0                                                     |
| `agi --permission-mode bypassPermissions --print` | edit applied, exit 0                                                     |
| `agi --permission-mode acceptEdits --print`       | "requires approval ... exiting", exit 1, no write                        |
| `agi --permission-mode dontAsk --print`           | exit 1 (acceptable, documented as deny)                                  |
| `agi exec --full-auto`                            | edit applied, exit 0                                                     |
| `agi --dangerously-skip-permissions exec`         | exit 1: `exec` ignores the global flag                                   |
| `agi --permission-mode bypassPermissions exec`    | exit 1: ignored                                                          |
| `agi exec -y`                                     | clap error, exit 2: `-y` is not accepted after `exec`                    |
| `--json-events` plus a denied edit                | stream ends after `running_tool`, no `error` or `finished` event, exit 1 |

Expected: `acceptEdits` accepts file edits (its name, and the mode Claude Code and Codex users know); global permission flags apply to every subcommand; a JSONL consumer always sees a terminal event.
Actual: as tabled. `should_auto_approve_safe` treats `AcceptEdits` and `DontAsk` identically (safe reads only, `cli_options.rs:71-80`); `Command::Exec` reads only its own `full_auto` (`lib.rs:2617-2620`); `abort_noninteractive_auto_deny` calls `std::process::exit(1)` inside the tool (`file_ops/mod.rs:110-127`).
Root Cause: Verified.
Code/Data Safety Impact: fails closed (no unwanted writes). Scripts break, and users escalate to `bypassPermissions` because the safer mode does not work, which is the real risk.
Recommended Correction: make `AcceptEdits` auto-approve `write_file`/`edit_file`/`multiedit`/`apply_patch`/`notebook_edit` and keep prompting for commands; derive `exec`'s permissions from `CliOptions` like the `--print` path and accept `-y` there; replace the in-tool `process::exit` with a typed denial that the turn loop converts into `AgentEvent::Error{kind:"approval_required"}` plus exit 1.
Shared Impact: VS Code agent mode maps `DeveloperAgentMode::Auto` to `AcceptEdits` (`developer_host.rs:2215-2232`), so an "Auto" VS Code session relies on the app-server's approval callback rather than this flag; fixing the flag semantics must keep that mapping.
Verification: the scenario table above re-run; `tests/json_events_jsonl.rs` extended with a denied-edit case.

### DEV-005: SIGTERM corrupts the terminal and orphans tool children

Severity: P2
Surface: CLI
Area: signals, terminal state
Command/View: TUI, any run with an in-flight `run_command`
Evidence: pty driver: after `SIGTERM` to the TUI, alternate screen not left, cursor not shown, bracketed paste still on, termios `ICANON/ECHO/ISIG` all false (OBSERVED, `pty_tui.py sigterm`). After `SIGTERM` during `run_command sleep 60`, `agi` exits 143 and `sleep 60` keeps running (OBSERVED). No `SIGTERM` handler exists in `apps/cli/src` (READ).
Reproduction: `agi` in a terminal, `kill <pid>` from another shell; or the sigtest script.
Expected: restore the terminal, kill the process group, exit 143.
Actual: as above. Ctrl+C (twice) in the TUI restores everything and exits 0 (OBSERVED), so the restore code exists and only the signal path misses it.
Root Cause: Verified. `install_panic_restore_hook` covers panics; `restore_terminal` runs on normal return; `ProcessTreeChild` kill guards run on `Drop`; the default SIGTERM disposition runs none of them.
Code/Data Safety Impact: a stuck shell after a container stop or `kill`; a runaway tool child.
Recommended Correction: install a `tokio::signal::unix::signal(SignalKind::terminate())` listener in `run_main` that restores the terminal when `tui_active()`, terminates the supervised process groups, flushes the managed session, and exits 143.
Shared Impact: VS Code's `LocalRuntimeClient` shutdown uses `shutdown` RPC then kill; on Windows it uses `taskkill /T`, so the extension is not affected on that path.
Verification: `pty_tui.py sigterm` shows restored termios; sigtest TERM shows zero surviving `sleep`.

### DEV-006: Ctrl+C during a running tool leaves the tool's child running

Severity: P2
Surface: CLI
Area: cancellation
Command/View: `agi exec`, `agi --print`
Evidence: SIGINT at 4 s into `run_command sleep 60`: `exec` exits 130 in 5 ms with "Interrupted, turn cancelled" and `sleep 60` survives; `--print` dies by signal and `sleep 60` survives (OBSERVED, `stream_timing.py` with `SIGINT_AFTER=4`).
Expected: the process group of the running tool is killed before exit.
Actual: `std::process::exit(130)` (`lib.rs:2740`) bypasses the `Drop` guards in `process_tree.rs`.
Root Cause: Verified.
Code/Data Safety Impact: a long build or migration keeps running after the user thought they stopped it.
Recommended Correction: terminate supervised children explicitly before `exit`, or return from `run_main` with the code and let `Drop` run.
Shared Impact: the app-server's `turn/interrupt` path is separate (`developer_host.rs`); VS Code Stop should be re-tested after the fix.
Verification: sigtest INT with zero surviving `sleep`.

### DEV-007: Broken pipe panics on the JSON and completion paths

Severity: P2
Surface: CLI
Area: stdout, pipes
Command/View: `agi --output-format json models list | head`, `agi completion bash | head`
Evidence: exit 101 with `thread 'main' panicked ... Broken pipe` on stderr (OBSERVED, three runs each); `agi models list | head` and `agi --help | head` exit 0.
Expected: exit quietly (conventionally 0 or 141).
Actual: panic text and 101.
Root Cause: Verified. Rust ignores SIGPIPE, `println!`/`write_all` returns `EPIPE`, the JSON printer and `clap_complete::generate` unwrap it. No `SIGPIPE` handling in the crate.
Code/Data Safety Impact: none; trust and scripting.
Recommended Correction: write JSON through a `BufWriter` with `io::ErrorKind::BrokenPipe` mapped to a silent exit, and route `clap_complete::generate` output through the same writer; alternatively reset SIGPIPE to default at start-up via `nix` (the crate denies `unsafe_code`, so the writer approach is the one that fits).
Shared Impact: none.
Verification: `assert_cmd` test piping into a closed reader.

### DEV-008: No sensitive-file rule and no redaction on tool output in the shared tool layer

Severity: P2
Surface: Shared (implemented in CLI, inherited by VS Code agent mode)
Area: secrets, context
Command/View: `read_file`, `run_command`, session persistence
Evidence: `read_file .env` returned `SECRET_TOKEN=sk-ant-api03-...` to the model and to stdout (OBSERVED); `run_command cat .env` the same under bypass (OBSERVED); the raw value persisted in two `managed_sessions/*.jsonl` files (OBSERVED). `execute_read_file` validates containment only (`file_ops/mod.rs:247-330`); `secret_redaction.rs` is not applied on the tool path (READ). VS Code enforces `isSensitiveFile` on attachments and completions (`packages/platform/utils/src/sensitiveFiles.ts`, `contextPanelProvider.ts:15-44`, `inlineCompletionProvider.ts:96-99`) but its agent turns run `read_file` in the CLI, so the guard does not reach them.
Expected: a model-initiated read of `.env*`, private keys, `~/.ssh`, `~/.aws/credentials` and the like needs an explicit approval even in `acceptEdits`, and secret-shaped values are redacted before persistence and before a managed transcript is pushed.
Actual: no gate, no redaction.
Root Cause: Verified.
Code/Data Safety Impact: secrets in the model context and on disk (0600). No perfect detection is claimed; this is about the obvious files.
Recommended Correction: port `SENSITIVE_FILE_PATTERNS` into a Rust module (generated from the TS list or a shared JSON so both languages read one source), apply it in `execute_read_file`, `read_many_files`, `grep_files` result paths and as a `run_command` argument check, with an "Ask" decision that bypass modes still honour for credential files; apply `secret_redaction::redact` to tool results before `ManagedSession` persistence and before any cloud push.
Shared Impact: closes the gap for VS Code agent mode at the same time.
Verification: the read_env and cat_env scenarios return an approval request; grep the session directory for the fake key finds nothing.

### DEV-009: `--json-events` stream is truncated without a terminal event on headless denial

Severity: P2
Surface: CLI
Area: JSON output contract
Command/View: `agi --json-events exec`
Evidence: the last line was `running_tool edit_file`; no `error`, no `finished` (OBSERVED).
Root Cause: Verified, same `process::exit(1)` as `DEV-004`.
Recommended Correction: covered by `DEV-004`.
Verification: `tests/json_events_jsonl.rs` asserts a terminal event on every exit path.

### DEV-010: `agi apply` picks any message containing `---` and applies it into the current directory

Severity: P2
Surface: CLI
Area: stale patch, repository context
Command/View: `agi apply [session]`
Evidence: `apply_from_session` selects the newest message whose text contains `diff --git` **or** `---` and passes `cwd: None` (`apply_patch.rs:232-247`), so a markdown horizontal rule or front matter qualifies, and a session recorded in another repository is applied to whatever directory the user is in.
Expected: only a real unified diff, applied to the session's recorded `workspace_root`, refusing if the cwd differs.
Actual: as described. `git apply` rejects garbage, so corruption is unlikely; a clean patch from repository A applied to repository B is not.
Root Cause: Verified by reading; not run.
Recommended Correction: require `diff --git` or a `---`/`+++` header pair, resolve `ManagedSession.workspace_root` and refuse or `--cwd` explicitly.
Verification: unit test with a horizontal-rule message and a session whose root differs from cwd.

### DEV-011: Batch accept is not atomic and partial failure is not summarised

Severity: P2
Surface: VS Code
Area: multi-file apply, partial failure
Command/View: `acceptBatch`, `acceptAll*`
Evidence: `_acceptSessions` loops `acceptDiff` per session (`diffDecorationProvider.ts:423-437`); a failing `applyEdit` shows one warning and continues; earlier files stay modified.
Recommended Correction: build one `WorkspaceEdit` across all sessions (VS Code applies it atomically and as one Undo step), verify each session's original text first (`DEV-002`), and report "3 of 5 applied, 2 skipped: ..." when a session is refused.
Verification: test with one stale session among three.

### DEV-012: `agi approvals list` renders an interactive widget to a non-TTY stdout

Severity: P2
Surface: CLI
Area: non-TTY output
Evidence: stdin `/dev/null`, stdout to a pipe: output is the permissions overlay with "Search…", "tab switch · return · Esc cancel" (OBSERVED).
Expected: a plain table on stdout, or JSON with `--json`.
Recommended Correction: when stdout is not a terminal print the rule list; keep the overlay for the TUI `/permissions` command.
Verification: `agi approvals list | cat` shows rules only.

### DEV-013: File writes are not atomic

Severity: P3
Surface: CLI
Area: apply
Evidence: `tokio::fs::write` in `write_file`, `edit_file`, `multiedit` (`file_ops/mod.rs:589,819,1118`).
Recommended Correction: write to a sibling temp file, `fsync`, preserve mode, `rename`; keep symlink targets resolved through `canonicalize` as today.
Verification: unit test that kills the writer mid-write is impractical; a temp-and-rename helper with a test for mode preservation is enough.

### DEV-014: Four permission-mode vocabularies, one of them dead

Severity: P2
Surface: Shared
Area: approvals, configuration
Evidence: `suggest|auto-edit|full-auto` (`config.rs:87-88`, written by `onboarding.rs:695-706`, read nowhere else); `Default|Plan|AcceptEdits|BypassPermissions|DontAsk` (`cli_options.rs:13-23`); `Ask|Auto|Plan|Bypass` (`crates/agiworkforce-protocol/src/developer_session.rs:426-431`, generated into TS); `'ask'|'auto'|'plan'|'bypass'` hand-typed in `agentModeConsent.ts:3` instead of importing the generated type.
Expected: one protocol enum, one CLI presentation of it, one VS Code presentation of it, and onboarding writing a value something reads.
Recommended Correction: delete `approval_mode` or map it onto `PermissionMode` at load; import `DeveloperAgentMode` in VS Code; document the CLI names as aliases of the protocol names.
Verification: `grep approval_mode` finds a reader; a type-level test that `ExtensionAgentMode` equals `DeveloperAgentMode`.

### DEV-015: Multi-root: project instructions always come from folder 0

Severity: P3
Surface: VS Code
Evidence: `projectInstructions.ts:18` `workspaceFolders[0]!`; display only (Context and Settings panels).
Recommended Correction: resolve through `getActiveWorkspaceFolder()` like every other path.
Verification: multi-root test with `AGENTS.md` in folder 1 only.

### DEV-016: Workspace indexer watchers are permanently inert

Severity: P3
Surface: VS Code
Evidence: `registerFileWatcher()` runs at activation (`chatSetup.ts:118`) but `index()` is never called, so every handler no-ops (`workspaceIndexer.ts:72-111`); `buildFullContext()` is also uncalled.
Recommended Correction: delete the indexer and the dead builder, or wire `index()` behind an explicit command with the sensitive-file filter. Deleting is the smaller change and removes an idle watcher over `**/*.{ts,...}` with no exclude glob.
Verification: knip reports no unused exports in `src/data`.

### DEV-017: No file-level undo in the CLI

Severity: P2
Surface: CLI
Area: undo / revert
Evidence: `/rewind` restores `history.rs` checkpoints of the conversation; no shadow repository, no per-edit backup (READ). Claude Code, Gemini CLI, Copilot and Cursor all ship a checkpoint/restore for files (class B, §research).
Expected: a way to revert what the agent wrote in this session without relying on the user's own git discipline.
Recommended Correction: snapshot the pre-image of every approved write into `~/.agiworkforce/checkpoints/<session>/` (content-addressed, bounded) and extend `/rewind` to offer "code", "conversation", "both"; document that shell commands are not covered, as competitors do.
Verification: edit, `/rewind`, file restored; `agi session show` lists the checkpoint.

### DEV-018: Hand-duplicated constants and a dead OAuth record

Severity: P3
Surface: Shared
Evidence: `context_handoff.rs:9-12` duplicates four constants from `context-handoff-uri.ts:10-17` with no parity test; `AGIWORKFORCE_OAUTH` (`oauth.rs:56-67`) names `api.agiworkforce.com/auth/device/token`, a host the live flow does not use, and is unreachable.
Recommended Correction: delete the record; add a `cliProtocolContract`-style test for the handoff constants.

### DEV-019: Help text quality

Severity: P3
Surface: CLI
Evidence: `agi exec --help`, `review --help`, `apply --help`, `sandbox --help` show empty descriptions for `<PROMPT>`, `-m`, `--full-auto`, `--json`, `--base`, `--commit`, `--file`; top-level help leaks "Sprint B4:" into `--mode` and `--auto-approve-plan`; `--demo` ("synthesizes a rate-limit error") is public (OBSERVED).
Recommended Correction: doc comments on every arg; drop sprint references; hide `--demo` behind `#[arg(hide = true)]`.

### DEV-020: Top-level error formatting

Severity: P4
Surface: CLI
Evidence: `main` returns `anyhow::Result`, so a bail prints `Error: ...` in Debug form and a full backtrace when `RUST_BACKTRACE` is set (OBSERVED, 5 KB on stderr); other paths print lowercase `error: ...`.
Recommended Correction: route `run_main` errors through `exit_with_error`.

### DEV-021: A positional prompt still blocks on non-TTY stdin

Severity: P3
Surface: CLI
Evidence: `sleep 30 | agi --print "text"` produced nothing until the pipe closed (OBSERVED, 30 s); `agi exec "text"` under the same condition completed in time because `exec` does not read stdin. `is_piped` triggers a blocking `read_to_string` whenever stdin is not a terminal (`lib.rs:3600-3611`).
Recommended Correction: when a positional prompt is present, read stdin only with `--stdin` or `-`; otherwise poll for readiness with a short deadline. Codex uses `-` for "prompt from stdin" and treats piped data as appended context, which matches the existing `<stdin>` wrapping here.

### DEV-022: Onboarding banner

Severity: P4
Surface: CLI
Evidence: first interactive run prints a six-line ASCII logo before the wizard (OBSERVED via pty).
Recommended Correction: one line with name and version.

### DEV-023: Marketplace readiness gaps

Severity: P3
Surface: VS Code
Evidence: no `CHANGELOG.md`; `preview: true`; `extension.js` 2.43 MB (vsce warns); no listing.
Recommended Correction: add a changelog (release-vscode workflow can generate it from conventional commits), decide on the preview flag before the first listing, and check the bundle for the largest dependency graph (`@agiworkforce/routing` and `cloud-contracts` are likely most of it).

### DEV-024: Guards do not cover the CLI where they cover VS Code

Severity: P3
Surface: Shared
Evidence: `scripts/check-trust-boundaries.mjs:9-45` lists `extension-vscode` and five others but not `cli`; `scripts/check-no-hardcoded-model-ids.mjs` never scans `.rs` sources (only skips the generated Rust files, `:68-70`).
Recommended Correction: add a `trust-boundary` proof test for `apps/cli` (privacy-mode gating of network tools already exists as unit tests) and extend the model-id scan to Rust.

### DEV-025: Dead or half-exposed public surface

Severity: P3
Surface: CLI
Evidence: `agi mcp-server` advertises zero tools (documented); `agi marketplace` has no backend (`lib.rs:131-135`); `subagent_v2.rs` has no callers; `/a2a` works in the REPL but is absent from the command palette golden list and its module is marked PHASE2 (`lib.rs:141-150`).
Recommended Correction: remove `mcp-server` and `marketplace` from the public command list until they work; delete `subagent_v2.rs`; either list `/a2a` or gate it.

### DEV-026: `exec --json` succeeds with a different shape than `--output-format json`

Severity: P3
Surface: CLI
Evidence: `exec --json` prints `{input_tokens, output_tokens, response}`; `--output-format json --print` prints `{type:"result", is_error, model, cost, duration_ms, ...}` (OBSERVED). Two success schemas for one product.
Recommended Correction: make `exec --json` an alias of `--output-format json` and emit the `result` schema.

### DEV-027: Auto routing implemented twice with different depth

Severity: P3
Surface: Shared
Evidence: `apps/cli/src/routing/*` (two files) vs `packages/ai/routing` (task families, capability health, breaker profiles). Same policy JSON.
Classification: DUPLICATION with drift risk. Whether the CLI should be simpler is a product decision; if so, document it in `routing/mod.rs`, which already forbids a bespoke CLI router.

### DEV-028: Windows runs `run_command` unsandboxed by construction

Severity: P3
Surface: CLI
Evidence: README table "Windows: none"; the TUI "no sandbox" indicator is described in terms of `--no-sandbox` (`lib.rs:356-360`). UNVERIFIED whether the indicator lights on Windows.
Recommended Correction: show the indicator whenever the effective executor is `none`, whatever the cause; `agi doctor` already reports it.

### DEV-029: Provider error categories are named twice

Severity: P3
Surface: Shared
Evidence: `LlmError` kinds (`crates/agiworkforce-llm/src/error.rs:14-44`) and `AgiWorkforceApiError` codes plus `classifyCloudUtilityFailure` (`cloudUtilityErrorActions.ts:4-34`). The paywall JSON shape is the only shared piece.
Recommended Correction: publish the category list (`AUTH, NETWORK, MODEL, RATE_LIMIT, QUOTA, CONTEXT_LIMIT, TOOL, FILE, PERMISSION, LOCAL_RUNTIME, CANCELLED, INTERNAL`) in `packages/contracts/types` and have `CliError::kind` and the TS `code` values come from it. Rendering stays native.

### DEV-030: Flag position changes meaning

Severity: P3
Surface: CLI
Evidence: `agi --json exec text` streams plain text; `agi exec --json text` prints JSON (OBSERVED). `--provider`/`--model` are honoured at either position by explicit code (`lib.rs:2576-2597`).
Recommended Correction: make `exec` honour the global output flags, or reject the ambiguous combination.

### DEV-031: Headless `agi login` waits up to five minutes with no fast-fail

Severity: P3
Surface: CLI
Evidence: with stdin from `/dev/null` the device flow printed the URL and code to stderr and polled until killed (OBSERVED, 124 under `timeout`); `MAX_POLL_ATTEMPTS` gives five minutes (`auth.rs:491`).
Expected: this is the right headless design (Codex `--device-auth`, Claude `setup-token`); it needs a `CI=true`/non-TTY notice of the deadline and an env-var path (`AGIWORKFORCE_TOKEN`) so CI never has to poll.
Recommended Correction: document `AGIWORKFORCE_NO_KEYRING` plus a token env var for CI; print the remaining time.

### DEV-032: Streaming interrupt on the `--print` path exits by signal, not 130

Severity: P4
Surface: CLI
Evidence: `exec` exits 130 with a flushed partial; `--print` dies with the default SIGINT disposition (OBSERVED exit status -2), no "Interrupted" line, session not marked cancelled.
Recommended Correction: reuse the `exec` select loop on the print path.

### DEV-033: Read-state cache is capped at 100 files

Severity: P4
Surface: CLI
Evidence: `MAX_READ_FILE_STATE_ENTRIES = 100` (`file_state.rs:8`); the 101st file read evicts the first, and a later write to it is refused with "File has not been read yet".
Recommended Correction: raise the cap or key eviction by size; fails closed today, so P4.

### DEV-034: `acceptEdits` is presented to VS Code as "Auto" and to the CLI as "acceptEdits"

Severity: P3
Surface: Shared
Evidence: `developer_host.rs:2215-2232` maps `Auto -> AcceptEdits`; VS Code's default `agent.mode` is `auto` (`package.json:1044-1058`), the CLI's default is `Default`. A developer switching surfaces gets a stricter default in the terminal than in the editor without being told.
Recommended Correction: one documented default per product with the same name on both surfaces; the status bar and the TUI footer should show the same word.

## 13. Competitor reference classification (dated 2026-09-14)

Full research with sources is in the audit transcript; the classification that
matters for the corrections above:

| Behaviour                                                                | Class                  | Applies to AGI Workforce                                       |
| ------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------- |
| exit codes, stdout for result, stderr for progress, `NO_COLOR`           | A                      | Implemented; `DEV-007`, `DEV-012` are the gaps                 |
| JSONL event stream for scripting                                         | B                      | Implemented (`--json-events`, `stream-json`); `DEV-009`        |
| named approval tiers incl. "accept edits" and "plan"                     | B                      | Implemented; `DEV-004`, `DEV-014`, `DEV-034`                   |
| bypass mode named as dangerous                                           | B                      | Implemented                                                    |
| destructive commands never auto-approved                                 | B                      | Implemented in default modes; bypass runs them (same as peers) |
| checkpoint / rewind of files                                             | B                      | Missing in CLI (`DEV-017`), native Undo in VS Code             |
| diff review before apply                                                 | B                      | Implemented; `DEV-002` on staleness                            |
| product ignore file (`.geminiignore`, `.cursorignore`, `.copilotignore`) | C                      | Not needed if `DEV-008` lands a shared sensitive-file rule     |
| OS sandbox (Seatbelt, bubblewrap)                                        | B                      | Implemented, none on Windows (`DEV-028`)                       |
| device-code or token path for headless auth                              | B                      | Device code implemented; token env var missing (`DEV-031`)     |
| keychain storage with 0600 fallback                                      | B                      | Implemented                                                    |
| `AGENTS.md` read as the cross-tool instruction file                      | B                      | Implemented (CLI init writes it; VS Code reads it)             |
| single-vendor subscription as the only auth path                         | D                      | Correctly avoided: BYOK, local and managed coexist             |
| a fixed model family with no override                                    | D                      | Correctly avoided                                              |
| Workspace Trust (VS Code native) gating agent actions                    | C (Copilot documented) | Implemented on every chat entry point                          |

## 14. Execution order

Group by root cause; each phase names the findings it closes.

- Phase 0, secrets and destructive execution: `DEV-008` (shared sensitive-file rule + redaction before persistence), `DEV-005`, `DEV-006`.
- Phase 1, shared context and stale-patch safety: `DEV-002`, `DEV-011`, `DEV-010`, `DEV-015`.
- Phase 2, auth, routing, shared APIs: `DEV-014`, `DEV-034`, `DEV-029`, `DEV-018`, `DEV-031`.
- Phase 3, diff, apply, undo: `DEV-017`, `DEV-013`, `DEV-033`.
- Phase 4, tools, shell, approvals: `DEV-004`, `DEV-009`, `DEV-028`.
- Phase 5, streaming and cancellation: `DEV-032` (streaming itself measured healthy).
- Phase 6, CLI stdout/stderr, exit codes, signals, CI: `DEV-007`, `DEV-012`, `DEV-021`, `DEV-026`, `DEV-030`, `DEV-020`.
- Phase 7, VS Code activation and native UX: `DEV-016`, `DEV-001` (done).
- Phase 8, local runtime and offline: no defect found; the local-runtime error strings are already normalised and identical on both surfaces because VS Code renders the CLI's.
- Phase 9, performance and large repositories: measure the release binary on a real monorepo; nothing in this audit contradicts the design (no eager scans on either surface).
- Phase 10, packaging: `DEV-003`, `DEV-023`, `DEV-019`, `DEV-025`.
- Phase 11, polish: `DEV-022`, `DEV-024`, `DEV-027`.
- Phase 12, regression: the scenario harness in this audit (fake provider + `agi exec` scenarios, pty driver, sigtest) is worth promoting to `apps/cli/tests/` as an `assert_cmd` suite; the VS Code side needs the integration runner with `--cli=<path>` executed in CI, which `release-vscode-extension.yml:116` already does under xvfb.

## 15. Final public-release gate (state on 2026-09-14)

Shared: correct repository context (pass, READ); no context leakage (pass,
integration-tested); secret exclusions (**fail**, `DEV-008`); model routing
consistency (partial, `DEV-027`); privacy fallback (pass: Local mode blocks
network tools, no silent cloud fallback found); cancellation (**fail**,
`DEV-006`); normalized errors (partial, `DEV-029`); local runtime (pass);
tool approvals (partial, `DEV-004`).

CLI: help works (pass, `DEV-019` cosmetic); non-TTY works (partial,
`DEV-012`, `DEV-021`); stdout clean (pass); stderr correct (pass); exit codes
(pass, `DEV-032` cosmetic); JSON valid (pass, `DEV-026` shape split); Ctrl+C
works (pass in TUI; `DEV-006`); terminal always restores (**fail** on SIGTERM,
`DEV-005`); CI never hangs (pass: headless denials exit 1; `agi login` polls
five minutes by design); install works (**fail**, `DEV-003`).

VS Code: activation fast (HYPOTHESIZED pass); Workspace Trust respected
(pass); no-workspace supported (pass, READ); multi-root correct (pass except
`DEV-015`); context visible (pass); dirty files safe (**fail**, `DEV-002`);
stale patch detection (**fail**, `DEV-002`); diff accurate (pass for
line-level decorations); apply safe (**fail**, `DEV-002`, `DEV-011`); Undo
works (pass, native); webview theme and accessibility (pass by tests and CSP;
not run in a browser here); extension host responsive (HYPOTHESIZED pass,
`DEV-016` is idle overhead); VSIX clean (pass); typecheck (pass after
`DEV-001`).

## 16. The two questions

**If thousands of developers started using AGI Workforce tomorrow from both
VS Code and the terminal, what could make them stop trusting the product?**

1. They cannot install it the way the docs say (`DEV-003`), and the first
   thing a CI user meets is that `acceptEdits` refuses to edit (`DEV-004`).
2. In VS Code, an Accept after a small edit of their own overwrites what they
   just typed (`DEV-002`); Undo saves them, once they notice.
3. In the terminal, `kill` or a container stop leaves the shell unusable and a
   build running (`DEV-005`, `DEV-006`); `agi ... | head` prints a Rust panic
   (`DEV-007`).
4. A model that decides to read `.env` gets it, and the value sits in a
   transcript on disk and, in managed mode, possibly in the account
   (`DEV-008`).
5. The same word means different things across surfaces: "Auto" in VS Code is
   "acceptEdits" in the CLI, the onboarding wizard's approval choice is never
   applied, and two success JSON schemas exist (`DEV-014`, `DEV-034`,
   `DEV-026`).
6. No file-level rewind in the CLI when every peer has one (`DEV-017`).

**If a professional developer alternated between the CLI and VS Code all day
on a real production repository, where would the two surfaces behave
inconsistently, expose different risks, duplicate logic, lose context, damage
trust, or feel unfinished?**

- Inconsistent: default permission posture (`DEV-034`); sensitive files are
  refused when attached in VS Code but read freely by the agent in either
  surface (`DEV-008`); stale-edit safety is enforced in the CLI and absent in
  the VS Code diff review (`DEV-002`).
- Different risks: the CLI risks the terminal and orphaned processes; VS Code
  risks the buffer.
- Duplicated logic: routing, error taxonomy, SSE parsing, tier and permission
  enums, handoff constants (`DEV-014`, `DEV-018`, `DEV-027`, `DEV-029`).
- Lost context: none found across windows or terminals; the per-workspace
  app-server pool and the project registry keep sessions apart. Project
  instructions in a multi-root window can show the wrong folder (`DEV-015`).
- Unfinished: `mcp-server` with no tools, `marketplace` with no backend, dead
  indexer and patch engine, empty help descriptions, no changelog, no listing,
  no release since 1.0.0 (`DEV-025`, `DEV-016`, `DEV-019`, `DEV-023`,
  `DEV-003`).

What already works the way one product with two surfaces should: one model
catalog, one protocol with a version pinned by a test, one tool and MCP
implementation, one exec policy and sandbox, Workspace Trust and project trust
as parallel gates, keychain and SecretStorage, clean stdout, valid JSON,
progressive streaming with no added latency, and a VSIX that ships exactly
four runtime files.
