# M4 — Claude Code Hooks System (Deep Dive)

> **Scope.** Full inventory of the user-facing hooks subsystem at `~/Desktop/reference/src/utils/hooks.ts` (5,022 LOC) + 17-file helper directory `~/Desktop/reference/src/utils/hooks/` + the 104-file React-side `~/Desktop/reference/src/hooks/` directory. Cross-referenced against the May 2026 inventory `tasks/research/anthropic-claude-suite-may-2026.md` §5.4. The §5.4 inventory says "12 events × 4 handler types"; the source ships **27 distinct events × 5 handler types** (12 documented + 15 internal/observability) — a major undercount in the public docs.
> **Cite-everything rule.** All citations are absolute reference paths (no relative paths, no "in the file"). Line numbers are 1-indexed.
> **Audience.** The author of `apps/cli/src/hooks.rs` (1,949 LOC) — the reference implementation we are porting against. Phase-1 gap matrix lives in §10.

---

## 1. The 5,022-LOC `hooks.ts` — section map

`~/Desktop/reference/src/utils/hooks.ts` has no headers; it is a flat module. Below is the actual layout I cite throughout this doc:

| Lines     | Section                                                     | What it does                                                                                                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–164     | Imports + module constants                                  | Pulls 41 distinct modules. `TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10*60*1000` (`hooks.ts:166`); `SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500` overridable via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` (`hooks.ts:175-182`).                                                                                             |
| 184–265   | `executeInBackground`                                       | Promotes a running command hook into the AsyncHookRegistry; supports a special `asyncRewake` path that bypasses the registry and notifies the agent loop via `enqueuePendingNotification` (`hooks.ts:237-242`).                                                                                                     |
| 267–296   | `shouldSkipHookDueToTrust`                                  | Trust-gate — interactive sessions require workspace-trust dialog accepted before any hook runs. Defends against issues where `SessionEnd`/`SubagentStop` hooks executed before trust accepted (`hooks.ts:281-282`).                                                                                                 |
| 298–328   | `createBaseHookInput`                                       | The 6-field base payload for _every_ hook event: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `agent_id`, `agent_type`.                                                                                                                                                                               |
| 330–376   | Result types                                                | `HookResult`, `AggregatedHookResult`, `HookBlockingError`.                                                                                                                                                                                                                                                          |
| 378–451   | `parseHookOutput` / `validateHookJson`                      | Zod-based stdout parser with explicit schema-hint error message (`hooks.ts:415-444`).                                                                                                                                                                                                                               |
| 453–487   | `parseHttpHookOutput`                                       | HTTP-only branch — empty body legal, non-JSON body fatal.                                                                                                                                                                                                                                                           |
| 489–737   | `processHookJSONOutput`                                     | The **discriminator** for `hookSpecificOutput.hookEventName`. 11 distinct branches: `PreToolUse`, `UserPromptSubmit`, `SessionStart`, `Setup`, `SubagentStart`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `PermissionRequest`, `Elicitation`, `ElicitationResult` (`hooks.ts:592-707`).              |
| 739–1335  | `execCommandHook`                                           | The 596-line shell-spawning workhorse. Bash + PowerShell paths, EPIPE handling, async-detection on first stdout line, prompt-request line interleaving, env-file injection.                                                                                                                                         |
| 1337–1421 | `matchesPattern` + `prepareIfConditionMatcher`              | Matcher resolution: literal, pipe-list, regex; legacy tool-name aliases.                                                                                                                                                                                                                                            |
| 1423–1593 | `getHooksConfig` / `getMatchingHooks` / `hasHookForEvent`   | Core registry assembly. Settings + plugin + skill + session sources, `managedOnly` filter, plugin-root namespacing for dedup.                                                                                                                                                                                       |
| 1595–1875 | Match + dedup pipeline                                      | 6 separate dedup Maps for command/prompt/agent/http/callback/function (`hooks.ts:1735-1806`); `if`-condition filter (`hooks.ts:1808-1848`); HTTP excluded from `SessionStart`/`Setup` (`hooks.ts:1853-1864`).                                                                                                       |
| 1877–1940 | Blocking-message formatters                                 | `getPreToolHookBlockingMessage`, `getStopHookMessage`, `getTeammateIdleHookMessage`, `getTaskCreatedHookMessage`, `getTaskCompletedHookMessage`, `getUserPromptSubmitHookBlockingMessage`.                                                                                                                          |
| 1942–2972 | `executeHooks` (async generator)                            | The orchestrator. Trust-check → dispatch by hook type → emit progress events → aggregate `permissionBehavior` with deny>ask>allow precedence (`hooks.ts:2826-2846`) → invoke `onHookSuccess` per session-hook entry (`hooks.ts:2906-2927`).                                                                         |
| 2974–3381 | `executeHooksOutsideREPL`                                   | The non-streaming variant for `Notification`, `SessionEnd`, `PreCompact`, `PostCompact`, `ConfigChange`, `InstructionsLoaded`, `WorktreeCreate`, `WorktreeRemove`, `Elicitation`, `ElicitationResult`, `CwdChanged`, `FileChanged`. Stop-hook prompt and agent variants are explicitly TODO (`hooks.ts:3152-3169`). |
| 3383–4192 | Public dispatch functions                                   | One per event family (see §2).                                                                                                                                                                                                                                                                                      |
| 4194–4369 | Env-var hooks                                               | `executeConfigChangeHooks`, `executeCwdChangedHooks`, `executeFileChangedHooks`, `executeInstructionsLoadedHooks` (`hooks.ts:4194-4369`).                                                                                                                                                                           |
| 4371–4575 | Elicitation + ElicitationResult                             | Newest event family — MCP-server-driven user input dialogs. `parseElicitationHookOutput` mirrors `processHookJSONOutput` for the non-REPL path (`hooks.ts:4388-4468`).                                                                                                                                              |
| 4577–4738 | `executeStatusLineCommand` + `executeFileSuggestionCommand` | Two non-event "command" hooks: status line (5 s timeout) and file-suggestion typeahead (5 s timeout). Both gated by `shouldSkipHookDueToTrust`.                                                                                                                                                                     |
| 4740–4896 | Callback + function-hook executors                          | In-memory callbacks (SDK / plugin native) bypass shell entirely (`hooks.ts:4740-4838`); `executeHookCallback` calls the JS callback directly and pipes the JSON return through `processHookJSONOutput` (`hooks.ts:4840-4896`).                                                                                      |
| 4898–5003 | Worktree hooks                                              | `hasWorktreeCreateHook`, `executeWorktreeCreateHook` (returns the path from stdout), `executeWorktreeRemoveHook` (best-effort logging).                                                                                                                                                                             |
| 5005–5022 | Telemetry helper                                            | `getHookDefinitionsForTelemetry`.                                                                                                                                                                                                                                                                                   |

---

## 2. Event inventory — actual vs documented

The §5.4 table lists **12 events**. The source registers **27 distinct events**. Sources:

- `~/Desktop/reference/src/utils/hooks/hooksConfigManager.ts:28-265` — the `getHookEventMetadata` table is the canonical UI list (27 keys).
- `groupHooksByEventAndMatcher` initialises a `grouped` record with **27 keys** at `~/Desktop/reference/src/utils/hooks/hooksConfigManager.ts:274-301`.
- `~/Desktop/reference/src/entrypoints/sdk/coreTypes.js` (referenced from `hookEvents.ts:9`) exports `HOOK_EVENTS`, the runtime allowlist that gates SDK event emission.

| #   | Event                  | Fires                                                                                                                                                  | Block?                      | Match field         | Source citation                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------- | ----------------------------------------------------- |
| 1   | **SessionStart**       | startup / resume / clear / compact                                                                                                                     | No (additionalContext only) | `source`            | `hooks.ts:3867-3892`, `hooksConfigManager.ts:86-94`   |
| 2   | **SessionEnd**         | clear / logout / prompt_input_exit / other                                                                                                             | No (fire-and-forget)        | `reason`            | `hooks.ts:4097-4141`, `hooksConfigManager.ts:154-162` |
| 3   | **Setup**              | init / maintenance                                                                                                                                     | No                          | `trigger`           | `hooks.ts:3902-3922`, `hooksConfigManager.ts:172-180` |
| 4   | **InstructionsLoaded** | session_start / nested_traversal / path_glob_match / include / compact                                                                                 | No (observability)          | `load_reason`       | `hooks.ts:4314-4369`, `hooksConfigManager.ts:229-243` |
| 5   | **UserPromptSubmit**   | user submits prompt                                                                                                                                    | Yes (exit 2 erases prompt)  | n/a                 | `hooks.ts:3826-3855`, `hooksConfigManager.ts:81-85`   |
| 6   | **PreToolUse**         | before any tool                                                                                                                                        | Yes (allow / deny / ask)    | `tool_name`         | `hooks.ts:3394-3436`, `hooksConfigManager.ts:29-37`   |
| 7   | **PermissionRequest**  | permission dialog about to appear                                                                                                                      | Yes                         | `tool_name`         | `hooks.ts:4157-4192`, `hooksConfigManager.ts:163-171` |
| 8   | **PermissionDenied**   | classifier or user denied                                                                                                                              | No (sets `retry`)           | `tool_name`         | `hooks.ts:3529-3562`, `hooksConfigManager.ts:56-64`   |
| 9   | **PostToolUse**        | after tool returns                                                                                                                                     | additionalContext only      | `tool_name`         | `hooks.ts:3450-3477`, `hooksConfigManager.ts:38-46`   |
| 10  | **PostToolUseFailure** | after tool error                                                                                                                                       | additionalContext only      | `tool_name`         | `hooks.ts:3492-3527`, `hooksConfigManager.ts:47-55`   |
| 11  | **Notification**       | Claude wants to notify user (`permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_complete`, `elicitation_response`) | No                          | `notification_type` | `hooks.ts:3570-3592`, `hooksConfigManager.ts:65-80`   |
| 12  | **Stop**               | Claude finishes responding                                                                                                                             | Yes (force-keep-working)    | n/a                 | `hooks.ts:3639-3697`, `hooksConfigManager.ts:95-99`   |
| 13  | **StopFailure**        | turn ended with API error (rate_limit, authentication_failed, billing_error, invalid_request, server_error, max_output_tokens, unknown)                | No (fire-and-forget)        | `error`             | `hooks.ts:3594-3627`, `hooksConfigManager.ts:100-116` |
| 14  | **SubagentStart**      | subagent (`Agent` tool) starts                                                                                                                         | No                          | `agent_type`        | `hooks.ts:3932-3952`, `hooksConfigManager.ts:117-125` |
| 15  | **SubagentStop**       | subagent ends                                                                                                                                          | Yes (continue running)      | `agent_type`        | `hooks.ts:3653-3697`, `hooksConfigManager.ts:126-135` |
| 16  | **PreCompact**         | before compaction                                                                                                                                      | Yes (block compaction)      | `trigger`           | `hooks.ts:3961-4025`, `hooksConfigManager.ts:136-144` |
| 17  | **PostCompact**        | after compaction                                                                                                                                       | No (display only)           | `trigger`           | `hooks.ts:4034-4089`, `hooksConfigManager.ts:145-153` |
| 18  | **TeammateIdle**       | a teammate about to go idle (Cowork)                                                                                                                   | Yes (keep working)          | n/a                 | `hooks.ts:3709-3729`, `hooksConfigManager.ts:181-185` |
| 19  | **TaskCreated**        | task being created (Cowork)                                                                                                                            | Yes (prevent creation)      | n/a                 | `hooks.ts:3745-3773`, `hooksConfigManager.ts:186-190` |
| 20  | **TaskCompleted**      | task being completed (Cowork)                                                                                                                          | Yes (prevent completion)    | n/a                 | `hooks.ts:3789-3817`, `hooksConfigManager.ts:191-195` |
| 21  | **Elicitation**        | MCP server wants user input                                                                                                                            | Yes (deny)                  | `mcp_server_name`   | `hooks.ts:4470-4523`, `hooksConfigManager.ts:196-204` |
| 22  | **ElicitationResult**  | user answered MCP elicitation                                                                                                                          | Yes (override)              | `mcp_server_name`   | `hooks.ts:4525-4575`, `hooksConfigManager.ts:205-213` |
| 23  | **ConfigChange**       | settings/skills changed mid-session                                                                                                                    | Yes (block change)          | `source`            | `hooks.ts:4194-4239`, `hooksConfigManager.ts:214-228` |
| 24  | **CwdChanged**         | working dir changed                                                                                                                                    | No (sets watchPaths + env)  | n/a                 | `hooks.ts:4260-4276`, `hooksConfigManager.ts:254-258` |
| 25  | **FileChanged**        | watched file changed                                                                                                                                   | No (sets watchPaths + env)  | filename glob       | `hooks.ts:4278-4294`, `hooksConfigManager.ts:259-263` |
| 26  | **WorktreeCreate**     | git-worktree about to be created                                                                                                                       | Throws on stdout-empty      | n/a                 | `hooks.ts:4928-4958`, `hooksConfigManager.ts:244-248` |
| 27  | **WorktreeRemove**     | git-worktree about to be removed                                                                                                                       | best-effort                 | n/a                 | `hooks.ts:4967-5003`, `hooksConfigManager.ts:249-253` |

**Implications for our port:** `apps/cli/src/hooks.rs` declares **22 events** at `apps/cli/src/hooks.rs:74-127` plus 6 AGI-specific ones (`PlanModeChanged`, `BeforeModelResolve`, `BeforePromptBuild`, `ToolResultPersist`, `CronTriggered`, `WebhookReceived`, `FileChanged`, `DaemonStarted`, `DaemonStopped`). Compared to Claude Code's 27, we are **missing**: `Setup`, `InstructionsLoaded`, `PostToolUseFailure`, `StopFailure`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `CwdChanged`, `WorktreeCreate`, `WorktreeRemove`. Of those, the most user-visible are `Setup`, `InstructionsLoaded`, `PostToolUseFailure` — see §10.

---

## 3. Handler types — 4 documented, 5 implemented

§5.4 lists **command, HTTP, prompt, agent**. The source has all 4 _plus_ a 5th — `function` — used internally for SDK-callback hooks (e.g. `registerStructuredOutputEnforcement` at `~/Desktop/reference/src/utils/hooks/hookHelpers.ts:70-83`):

| Type       | Implementation                                                 | LOC | Spawn target                                                                   | When                                                                                                               |
| ---------- | -------------------------------------------------------------- | --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `command`  | `~/Desktop/reference/src/utils/hooks.ts:747-1335`              | 588 | `bash`, `pwsh`, or `cmd→git-bash`                                              | Default when `hook.shell` unset; `DEFAULT_HOOK_SHELL` from `~/Desktop/reference/src/utils/shell/shellProvider.ts`. |
| `HTTP`     | `~/Desktop/reference/src/utils/hooks/execHttpHook.ts:123-242`  | 119 | `axios.post(hook.url)`                                                         | Excluded from `SessionStart` / `Setup` — sandbox ask-callback deadlock (`hooks.ts:1853-1864`).                     |
| `prompt`   | `~/Desktop/reference/src/utils/hooks/execPromptHook.ts:21-211` | 190 | LLM via `queryModelWithoutStreaming` with Haiku-class small-fast model         | Schema-validated to `{ok: bool, reason?: string}` via `hookResponseSchema()` (`hookHelpers.ts:16-24`).             |
| `agent`    | `~/Desktop/reference/src/utils/hooks/execAgentHook.ts:36-339`  | 303 | `query()` multi-turn loop, max **50** turns hardcoded (`execAgentHook.ts:119`) | Spawns a subagent with `mode: 'dontAsk'` and read access to its own transcript file (`execAgentHook.ts:138-153`).  |
| `function` | `~/Desktop/reference/src/utils/hooks.ts:4740-4838`             | 99  | Direct JS callback invocation                                                  | Not persistable — only registered in-session (`~/Desktop/reference/src/utils/hooks/sessionHooks.ts:93-115`).       |
| `callback` | `~/Desktop/reference/src/utils/hooks.ts:4840-4896`             | 56  | Direct JS callback (returns full JSON)                                         | SDK-injected and plugin-native; bypasses shell entirely.                                                           |

So a more accurate framing is: **6 handler types — 3 user-configurable (command/HTTP/prompt/agent) + 3 internal (callback/function/builtin)**. Our `apps/cli/src/hooks.rs` currently supports only `command` (`apps/cli/src/hooks.rs:31-62`).

### 3a. `command` handler details

- **Shell selection** (`hooks.ts:790-792`): `hook.shell` ∈ `'bash' | 'powershell'`, default = `DEFAULT_HOOK_SHELL` (bash on POSIX, configurable on Windows).
- **Windows POSIX-path conversion** for bash hooks (`hooks.ts:807-811`) — `windowsPathToPosixPath()` is pure-JS regex (`C:\Users\foo` → `/c/Users/foo`); LRU-500 memoised.
- **Plugin variable substitution** (`hooks.ts:822-857`): `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, and `${user_config.X}` (the last via `substituteUserConfigVariables` from plugin-options storage). **Substitution order matters**: plugin vars resolve BEFORE user config so a user-entered value containing literal `${CLAUDE_PLUGIN_ROOT}` is treated as opaque (`hooks.ts:818-822`).
- **`.sh` auto-prepend on Windows bash** (`hooks.ts:862-866`).
- **Async hook detection** (`hooks.ts:1117-1164`): if the **first line** of stdout parses to JSON `{"async": true, "asyncTimeout": 15000}`, the process is detached into the AsyncHookRegistry and the foreground promise resolves. Subtle race: `executeInBackground` is called from inside the `child.stdout.on('data', ...)` handler, which means a fast-emitting hook might write more than one chunk before this fires — the code parses **only `firstLineOf(stdout)`** (`hooks.ts:1118`) to avoid that bug.
- **Prompt-request interleaving** (`hooks.ts:1068-1110`): if a hook emits a JSON line that validates against `promptRequestSchema()` (`~/Desktop/reference/src/types/hooks.ts`), the harness writes a response back to the hook's stdin. Used for hooks that need to ask the user a question mid-execution.
- **EPIPE / ABORT_ERR / generic-error branches** at `hooks.ts:1283-1318` map to clean exit codes for the hook protocol.

### 3b. `HTTP` handler details

- **URL allowlist enforcement** (`execHttpHook.ts:135-145`): pattern-based with `*` wildcard; `allowedHttpHookUrls` ∈ {undefined → no restriction, `[]` → block-all, non-empty → must-match}.
- **Header env-var interpolation with allowlist** (`execHttpHook.ts:89-108`): only `$VAR` references in `hook.allowedEnvVars` resolve; others become empty strings. Sanitises CR/LF/NUL to prevent CRLF-injection (`execHttpHook.ts:76-79`).
- **SSRF guard** at `~/Desktop/reference/src/utils/hooks/ssrfGuard.ts:1-294`: rejects 0/8, 10/8, 100.64/10, 169.254/16 (cloud metadata!), 172.16/12, 192.168/16, IPv6 fc00::/7, fe80::/10, plus IPv4-mapped variants like `::ffff:a9fe:a9fe`. Loopback (127/8, ::1) explicitly **allowed** for local dev.
- **Sandbox proxy routing** (`execHttpHook.ts:21-41`): when sandboxing is enabled, requests route through the sandbox network proxy on `127.0.0.1:<port>` which enforces its own domain allowlist (returns HTTP 403 for blocks). SSRF guard skipped in that case.
- **Default timeout** = 10 minutes (`DEFAULT_HTTP_HOOK_TIMEOUT_MS`, `execHttpHook.ts:12`).

### 3c. `prompt` handler details

- LLM model defaults to `getSmallFastModel()` (Haiku-class), overrideable via `hook.model` (`execPromptHook.ts:79`).
- System prompt is a fixed two-rule output schema (`execPromptHook.ts:64-70`): return either `{ok: true}` or `{ok: false, reason: "..."}`.
- `outputFormat: { type: 'json_schema', schema: { ok: bool, reason?: string }, required: ['ok'] }` enforced server-side (`execPromptHook.ts:87-98`).
- `$ARGUMENTS` placeholder substitution via `substituteArguments` in `~/Desktop/reference/src/utils/argumentSubstitution.ts` — also supports indexed `$ARGUMENTS[0]`, `$0`, `$1` shorthand (`hookHelpers.ts:30-35`).
- Recursive-hook avoidance: `execPromptHook` calls `createUserMessage` directly instead of `processUserInput`, so it does NOT trigger another `UserPromptSubmit` chain (`execPromptHook.ts:39-42`).
- Default timeout = **30 s** (`execPromptHook.ts:55`), overrideable via `hook.timeout`.

### 3d. `agent` handler details

- Multi-turn agent loop with `MAX_AGENT_TURNS = 50` hard cap (`execAgentHook.ts:119`).
- `ALL_AGENT_DISALLOWED_TOOLS` filter (`execAgentHook.ts:101-104`) prevents agent hooks from spawning sub-subagents or entering plan mode.
- Forces `permissionMode: 'dontAsk'` and grants `Read(/<transcriptPath>)` session rule (`execAgentHook.ts:138-152`).
- Output enforcement via `SyntheticOutputTool` registered as a function hook on the spawned agent's `Stop` event (`execAgentHook.ts:157-160`, `hookHelpers.ts:70-83`). If the agent emits 50 turns without calling the structured output tool, `tengu_agent_stop_hook_max_turns` fires and the hook returns `cancelled` (no UI message).
- Default timeout = **60 s** (`execAgentHook.ts:75`).

---

## 4. Async hooks — Jan 2026 implementation

Two async pathways:

1. **Configuration-time async** — `hook.async = true` in settings.json. Hook stdin written, then immediately backgrounded via `executeInBackground` (`hooks.ts:995-1029`); foreground returns `{ status: 0, backgrounded: true }`.
2. **Runtime async** — hook emits `{"async": true, "asyncTimeout": <ms>}` as its FIRST stdout line (`hooks.ts:1117-1164`). Same backgrounding path.

The **AsyncHookRegistry** at `~/Desktop/reference/src/utils/hooks/AsyncHookRegistry.ts:1-309` tracks pending hooks:

- `pendingHooks: Map<processId, PendingAsyncHook>` (line 28).
- `registerPendingAsyncHook` adds entry with default `timeout = 15000ms` if not specified (line 51).
- `checkForAsyncHookResponses` polled by the agent loop — drains completed hooks, parses sync JSON response from final stdout, sends `emitHookResponse` events (lines 113-268).
- Special handling for `SessionStart` async hooks: when the response arrives `invalidateSessionEnvCache()` fires (lines 257-262), so `CLAUDE_ENV_FILE` mutations from a SessionStart hook propagate to subsequent BashTool calls.
- Cleanup ordering matters: `responseAttachmentSent` flag prevents double-delivery; failures isolated via `Promise.allSettled` (line 144).
- The `asyncRewake` variant (`hooks.ts:205-246`) bypasses the registry entirely — used for Stop hooks that must run after the model has gone idle. On exit code 2 the rewake path enqueues a `task-notification` via `enqueuePendingNotification` (`hooks.ts:236-242`) which wakes the model via `useQueueProcessor`.

---

## 5. Permission decision schema

The big-five output fields, with the actual Zod-derived schema dumped in the validation error message at `hooks.ts:415-444`:

```jsonc
{
  "continue": false,                  // halt the agent loop entirely
  "suppressOutput": true,              // suppress non-JSON plaintext bonus output
  "stopReason": "string",              // shown when continue:false
  "decision": "approve" | "block",     // legacy global decision
  "reason": "string",                  // human-readable
  "systemMessage": "string",           // injected as system reminder
  "permissionDecision": "...",        // legacy global; same as below for back-compat
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "string",
    "updatedInput": { /* the model uses this instead of original tool input */ }
  }
}
```

Per-event `hookSpecificOutput` shapes (from `processHookJSONOutput` at `hooks.ts:592-707`):

- **PreToolUse**: `permissionDecision`, `permissionDecisionReason`, `updatedInput` (lines 593-623), `additionalContext`.
- **UserPromptSubmit**: `additionalContext` (line 624-626).
- **SessionStart**: `additionalContext`, `initialUserMessage`, `watchPaths` (lines 627-635). **`initialUserMessage` is a SessionStart-only field** that pre-fills the first user message slot.
- **Setup**: `additionalContext` only (lines 637-639).
- **SubagentStart**: `additionalContext` only.
- **PostToolUse**: `additionalContext`, `updatedMCPToolOutput` (lines 643-650). The `updatedMCPToolOutput` is a P0 hook-feature for PII redaction.
- **PostToolUseFailure**: `additionalContext` (lines 651-653).
- **PermissionDenied**: `retry: bool` (lines 654-656). `retry=true` tells the model "the user said no, but you may try a different approach".
- **PermissionRequest**: `decision: { behavior: 'allow'|'deny', updatedInput?, updatedPermissions?, message?, interrupt? }` (lines 657-673).
- **Elicitation** / **ElicitationResult**: `action: 'accept'|'decline'|'cancel'`, `content`. `decline` is a blocking error (lines 674-707).

**Precedence** (`hooks.ts:2826-2846`): when multiple hooks fire, **deny > ask > allow**. `passthrough` does not set behaviour. `updatedInput` only takes effect when `behavior` is `allow` or `ask` (`hooks.ts:2851-2856`).

**Exit codes** (`hooks.ts:2647-2697`):

- `0`: success — stdout shown to model only when not suppressed.
- `2`: blocking — stderr becomes the blocking-error message returned to the model.
- _other_: non-blocking error — stderr shown to user only.

---

## 6. Environment variables injected into hooks

From `execCommandHook` (`hooks.ts:881-926`):

| Var                          | Source                                             | Always set?                                               |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `CLAUDE_PROJECT_DIR`         | `getProjectRoot()` (stable, **not** worktree path) | Yes                                                       |
| `CLAUDE_PLUGIN_ROOT`         | `pluginRoot` arg → from PluginHookMatcher          | Plugin/skill hooks only                                   |
| `CLAUDE_PLUGIN_DATA`         | `getPluginDataDir(pluginId)`                       | Plugin hooks only                                         |
| `CLAUDE_PLUGIN_OPTION_<KEY>` | `loadPluginOptions(pluginId)`                      | Plugin hooks with userConfig                              |
| `CLAUDE_ENV_FILE`            | `getHookEnvFilePath(hookEvent, hookIndex)`         | `SessionStart`, `Setup`, `CwdChanged`, `FileChanged` only |
| `CLAUDECODE`                 | Set elsewhere by `subprocessEnv()`                 | Yes (sentinel: child knows parent is Claude Code)         |

**`CLAUDE_FILE_PATH`, `CLAUDE_TOOL_NAME`, `CLAUDE_TOOL_INPUT`, `CLAUDE_SESSION_ID`** — claimed in §5.4 of the inventory, but I cannot find these as injected env vars anywhere in `~/Desktop/reference/src/utils/hooks/` or `~/Desktop/reference/src/utils/sessionEnvironment.ts`. The hook input _body_ (sent as JSON over stdin) contains `tool_name`, `tool_input`, and `session_id`. The §5.4 claim that these are env vars is **incorrect** for at least the May 2026 snapshot — they live in stdin JSON only, **not** the env. (Filesystem search confirms zero hits across the entire reference tree.)

**`CLAUDE_ENV_FILE` mechanism** (`hooks.ts:917-926`): hooks can write `export FOO=bar` lines to this file; `getSessionEnvironmentScript()` then concatenates them and `bashProvider` injects the content into subsequent BashTool commands. PowerShell hooks skip this — they would naturally write `$env:FOO = 'bar'` syntax, which bash cannot parse. This is THE mechanism for hooks to mutate the environment used by tool calls.

**`CLAUDE_CODE_SHELL_PREFIX`** (`hooks.ts:872-875`): wraps the command via POSIX shell-quote when set. Bash-only.
**`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`** (`hooks.ts:177`): user-overridable SessionEnd timeout.
**`CLAUDE_CODE_SIMPLE`** (`hooks.ts:1982`): truthy → all hooks skipped. Diagnostic / minimal-mode flag.

---

## 7. settings.json keys for hooks

From `~/Desktop/reference/src/utils/settings/types.ts` and `~/Desktop/reference/src/utils/hooks/hooksConfigSnapshot.ts:18-88`:

- **`hooks: HooksSettings`** — top-level event → matcher list. `HooksSettings ≅ Partial<Record<HookEvent, HookMatcher[]>>`.
- **`disableAllHooks: boolean`** — when true in **non-managed** settings, only managed hooks run (`hooksConfigSnapshot.ts:46-49`); when true in **managed/policy** settings, ALL hooks (including managed) disabled (`hooksConfigSnapshot.ts:21-24`).
- **`allowManagedHooksOnly: boolean`** — managed-settings-only flag; when set, only `policySettings.hooks` runs (`hooksConfigSnapshot.ts:26-29`).
- **`allowedHttpHookUrls: string[]`** — pattern allowlist for HTTP hook URLs (`*` wildcard). `undefined`=any, `[]`=none, non-empty=must-match (`execHttpHook.ts:55, 138`). The §5.4 spelling `allowedHookHttpUrls` is **wrong** — actual key is `allowedHttpHookUrls`.
- **`httpHookAllowedEnvVars: string[]`** — global env-var allowlist for HTTP-hook header interpolation (`execHttpHook.ts:56, 165`). Intersected with per-hook `hook.allowedEnvVars` when both set.
- Per-source hook hierarchy: **policySettings → user → project → local** (settings) plus **plugin → skill → session** (registered/derived). Source-priority sort at `~/Desktop/reference/src/utils/hooks/hooksSettings.ts:230-271`.

The `isRestrictedToPluginOnly('hooks')` check (`hooksConfigSnapshot.ts:39-41`) gates `strictPluginOnlyCustomization` — when set, only `policySettings.hooks` (not user/project/local) is honoured, but plugin hooks still run.

---

## 8. Verbose / Ctrl+O hook display

The `Ctrl+O` claim in §5.4 ("verbose mode shows hook execution") maps onto:

- `~/Desktop/reference/src/utils/hooks/hookEvents.ts:163-169` — `emitHookResponse` ALWAYS calls `logForDebugging` with the full hook stdout/stderr regardless of verbose mode.
- `~/Desktop/reference/src/utils/hooks/hookEvents.ts:84-91` — `shouldEmit` gates which hook events get sent to the registered `eventHandler`. By default only `SessionStart` and `Setup` events emit (`ALWAYS_EMITTED_HOOK_EVENTS = ['SessionStart', 'Setup']` at line 18). The full event firehose unlocks via `setAllHookEventsEnabled(true)` — set when SDK option `includeHookEvents` is set or when running in `CLAUDE_CODE_REMOTE` mode (`hookEvents.ts:179-186`).
- `MAX_PENDING_EVENTS = 100` (`hookEvents.ts:20`) — buffer cap when no handler registered yet.

So the user-visible "Ctrl+O verbose" behaviour is the front-end consuming `started`/`progress`/`response` events that were already being emitted; the gate is on _delivery_, not _generation_. The progress poll in `startHookProgressInterval` (`hookEvents.ts:124-151`) ticks every 1000 ms and only emits when stdout/stderr changed since last tick.

---

## 9. Open issue #6305 — PostToolUse not firing

Searched the entire reference tree for `PostToolUse hooks not` / `gh-?6305` / `#6305` — **no code reference**. The hook fires unconditionally from `executePostToolHooks` (`hooks.ts:3450-3477`) which always builds `hookInput` and yields through `executeHooks`. The likely cause based on code patterns:

1. `hasHookForEvent('PostToolUseFailure', ...)` early-out at `hooks.ts:3505-3507` — only on the _failure_ path. The success path (`executePostToolHooks`) does NOT have an `hasHookForEvent` early-out, so PostToolUse hooks should always run when configured.
2. **Trust dialog gate** at `hooks.ts:1994-1998` — silently skips ALL hook execution when `shouldSkipHookDueToTrust()` returns true. This is the most likely cause of "hooks not firing" in user reports: workspace trust was implicitly skipped via SDK / non-interactive mode and then PostToolUse hooks went silent.
3. **`CLAUDE_CODE_SIMPLE`** truthy → all hooks skipped (`hooks.ts:1982`). Diagnostic flag set in CI/automation environments by accident.

Issue #6305 is therefore most plausibly a workspace-trust-gating bug, not a hooks-system bug per se. Our port should NOT replicate the silent skip — log a one-time warning when trust gating disables hooks.

---

## 10. The 104-file `src/hooks/` directory — React hooks (UI side)

These are **NOT** the user-facing hooks system; they are the React-Ink TUI's internal state hooks. Cataloguing them in full is outside scope, but a few are load-bearing for the hooks system end-to-end:

| Hook                                         | Purpose                                                                                                                                                                                                                      | File:line                                                                  | Returned shape                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `useDeferredHookMessages`                    | Bridges async SessionStart hook output into the message stream                                                                                                                                                               | `~/Desktop/reference/src/hooks/useDeferredHookMessages.ts:12-46`           | `() => Promise<void>` callback to call before first API request       |
| `useExitOnCtrlCD`                            | Ctrl-C / Ctrl-D double-press exit handling — relevant because it interacts with `Stop` hooks (Ctrl-C triggers `executeStopHooks`)                                                                                            | `~/Desktop/reference/src/hooks/useExitOnCtrlCD.ts:46-95+`                  | `ExitState = { pending: boolean, keyName: 'Ctrl-C'\|'Ctrl-D'\|null }` |
| `useDoublePress`                             | The 800 ms timer used by `useExitOnCtrlCD`                                                                                                                                                                                   | `~/Desktop/reference/src/hooks/useDoublePress.ts`                          | `() => void` press-handler                                            |
| `useApiKeyVerification`                      | Loops through OAuth + helper + env to validate Anthropic key — gated by `getAnthropicApiKeyWithSource` and the trust-dialog skip-flag                                                                                        | `~/Desktop/reference/src/hooks/useApiKeyVerification.ts:23-84+`            | `{ status, reverify, error }`                                         |
| `usePromptsFromClaudeInChrome`               | Bridges Chrome-extension prompts back to CLI; touches the prompt-request interleaving in `execCommandHook`                                                                                                                   | `~/Desktop/reference/src/hooks/usePromptsFromClaudeInChrome.tsx:1-70`      | `Subscriber<PromptRequest>`                                           |
| `useReplBridge`                              | The 722-line REPL connector that wires the agent loop to React; consumes hook events emitted by `hookEvents.ts`                                                                                                              | `~/Desktop/reference/src/hooks/useReplBridge.tsx:1-722`                    | Numerous                                                              |
| `useScheduledTasks`                          | Backs the **scheduled tasks** UI (Cowork); calls `executeTaskCreatedHooks`/`executeTaskCompletedHooks`                                                                                                                       | `~/Desktop/reference/src/hooks/useScheduledTasks.ts:1-139`                 | `{ tasks, addTask, ... }`                                             |
| `useTaskListWatcher`                         | Mirrors task-system state for `TaskCreated/TaskCompleted` hooks                                                                                                                                                              | `~/Desktop/reference/src/hooks/useTaskListWatcher.ts:1-221`                | `void` (side-effecting)                                               |
| `useTeammateViewAutoExit`                    | Wires `TeammateIdle` hook into the teammate UI                                                                                                                                                                               | `~/Desktop/reference/src/hooks/useTeammateViewAutoExit.ts:1-63`            | `void`                                                                |
| `useSettingsChange` / `useSkillsChange`      | Backs `ConfigChange` hook firing on settings/skills file mutation                                                                                                                                                            | `~/Desktop/reference/src/hooks/useSettingsChange.ts`, `useSkillsChange.ts` | `void`                                                                |
| `notifs/useRateLimitWarningNotification.tsx` | Subscribes to `Notification` hook stream                                                                                                                                                                                     | `~/Desktop/reference/src/hooks/notifs/*` (16 files)                        | per-notification                                                      |
| `toolPermission/PermissionContext.ts`        | The 388-line ToolUse-permission React-state machine; calls `executePermissionRequestHooks` directly (`PermissionContext.ts:222-261`) — this is THE bridge between the React permission UI and the `PermissionRequest` event. | `~/Desktop/reference/src/hooks/toolPermission/PermissionContext.ts:96-388` | `ReturnType<createPermissionContext>`                                 |

The `toolPermission/handlers/` subdir (`coordinatorHandler.ts`, `interactiveHandler.ts`, `swarmWorkerHandler.ts`) holds 760 LOC of permission-flow state machines that consume hook output — `interactiveHandler.ts` (536 LOC) is the largest.

For our port, the React-side hooks are a TUI-implementation detail. The CLI does not need to mirror these one-to-one; it needs to expose the same _event_ outputs that they consume.

---

## 11. Skill / frontmatter hook registration

Hooks can be declared in three additional sources beyond settings.json:

1. **Plugin manifest hooks** — registered at plugin-load time via the `getRegisteredHooks()` registry in `~/Desktop/reference/src/bootstrap/state.js`. Carry `pluginRoot` and `pluginId` for env-var injection (`hooks.ts:1683-1709`).
2. **Skill frontmatter hooks** — `~/Desktop/reference/src/utils/hooks/registerSkillHooks.ts:20-64` walks the skill's `hooks:` section and adds each one as a session hook. Skills support `once: true` — hook auto-removes after first successful execution via the `onHookSuccess` callback path (`registerSkillHooks.ts:36-43`).
3. **Agent frontmatter hooks** — `~/Desktop/reference/src/utils/hooks/registerFrontmatterHooks.ts:18-67`. Agents convert their `Stop` hooks to `SubagentStop` automatically (`registerFrontmatterHooks.ts:38-45`) because subagents trigger SubagentStop, not Stop, when they finish.

`HOOK_EVENTS` enumeration drives the for-loop in both registration paths (`registerFrontmatterHooks.ts:31`, `registerSkillHooks.ts:29`). The exhaustive iteration is what allows skills/agents to declare hooks for any of the 27 events.

---

## 12. Telemetry

`tengu_run_hook` event fires on hook fanout (`hooks.ts:2023-2034`, `hooks.ts:3059-3071`) with: `hookName`, `numCommands`, `hookTypeCounts` (JSON of `{command:N, prompt:N, agent:N, http:N}`), and `pluginHookCounts` (only "official" marketplaces by name; everything else collapsed to `'third-party'` per `getPluginHookCounts` at `hooks.ts:1462-1478`). Names are matched against `ALLOWED_OFFICIAL_MARKETPLACE_NAMES`.

`tengu_repl_hook_finished` fires after all hooks resolve with the success/blocking/non_blocking_error/cancelled tally (`hooks.ts:2935-2944`).

OTel tracing via `startHookSpan` / `endHookSpan` (`hooks.ts:2087-2092`, `hooks.ts:2966-2971`) is gated on `isBetaTracingEnabled()` and produces `hook_execution_start` / `hook_execution_complete` events (`hooks.ts:2076-2084`, `hooks.ts:2950-2962`) with `managed_only`, `hook_source`, full `hook_definitions` JSON.

For agent hooks specifically, `tengu_agent_stop_hook_max_turns`, `tengu_agent_stop_hook_error`, `tengu_agent_stop_hook_success` events fire from `~/Desktop/reference/src/utils/hooks/execAgentHook.ts:242-291`.

---

## 13. Analysis: gaps in `apps/cli/src/hooks.rs`

(See §10 of the §5.4 inventory for partial overlap.)

`apps/cli/src/hooks.rs` (1,949 LOC) currently has these limitations vs the reference:

1. **Only `command` handler** (no HTTP, prompt, agent, function, callback). The four advanced types are almost the entire feature surface of the May-2026 hooks system. **Priority: HTTP > prompt > agent.**
2. **22 events vs 27.** Missing high-value events: `Setup` (init/maintenance triggers), `InstructionsLoaded` (CLAUDE.md observability), `PostToolUseFailure` (error handler), `Elicitation`/`ElicitationResult` (MCP user-input flow), `ConfigChange` (audit trail), `WorktreeCreate`/`Remove` (VCS-agnostic isolation hook). 4 AGI-specific (`PlanModeChanged`, `BeforeModelResolve`, `BeforePromptBuild`, `ToolResultPersist`) overlap somewhat with `PostToolUse` + custom contexts, but are not direct ports.
3. **Async / AsyncHookRegistry not implemented.** Without it, slow `SessionStart` hooks block REPL render by their full duration. Reference targets ~500 ms first-paint regardless of hook duration.
4. **No structured `hookSpecificOutput` schema.** Our port only honours `decision: 'block'` + `continue: false` (`apps/cli/src/hooks.rs:546-587`). We are missing `permissionDecision allow/deny/ask`, `updatedInput`, `additionalContext`, `updatedMCPToolOutput`, `initialUserMessage`, `watchPaths`, `retry` (PermissionDenied), Elicitation `action`.
5. **No precedence rules** for multiple hooks on the same event (`hooks.ts:2826-2846` — deny>ask>allow). Our `aggregate_results` at `apps/cli/src/hooks.rs:546` collapses on first block but does not implement the deny>ask>allow precedence.
6. **No deduplication.** Reference dedups by `(pluginRoot|skillRoot, command, shell, if)` so the same hook in user/project/local doesn't fire 3×. Our port runs all matched hooks unconditionally.
7. **No `if:` rule semantics** beyond the simple permission-rule-style filter. Reference's `prepareIfConditionMatcher` (`hooks.ts:1390-1421`) uses the tool's `preparePermissionMatcher` to evaluate against actual tool-input shape (e.g., a Bash hook with `if: "Bash(git *)"` only fires for git commands by parsing the bash command via tree-sitter).
8. **No SSRF guard for HTTP hooks** (we don't have HTTP hooks at all yet). When we add them, port `~/Desktop/reference/src/utils/hooks/ssrfGuard.ts:1-294` faithfully — the cloud-metadata block (169.254.169.254, 100.64/10) is a security must-have.
9. **No `disableAllHooks` / `allowManagedHooksOnly`** policy gates. Required for any enterprise deployment.
10. **No `Ctrl+O` verbose hook-output stream.** Front-end consumes `hookEvents.ts` events; we emit nothing equivalent. The `apps/cli/src/tui/` stack would need a hook-events subscription channel.
11. **No env-var allowlist for HTTP hook headers.** Need both global (`httpHookAllowedEnvVars`) and per-hook (`hook.allowedEnvVars`) and the CRLF-injection sanitiser.
12. **No prompt-request interleaving** in command hooks (`hooks.ts:1068-1110`). Hooks cannot ask the user a question mid-execution.
13. **No `CLAUDE_ENV_FILE` mechanism.** Hooks cannot mutate environment for subsequent BashTool calls — major workflow gap (env-loaders, version managers).
14. **No `executeHooksOutsideREPL` distinction.** All our hooks go through the same path; the reference splits because outside-REPL hooks (Notification, SessionEnd) shouldn't surface stderr to model.
15. **Missing the §5.4-claimed env vars** `CLAUDE_FILE_PATH`, `CLAUDE_TOOL_NAME`, `CLAUDE_TOOL_INPUT`, `CLAUDE_SESSION_ID`. Reference exposes these via stdin JSON, not env. We should match — the §5.4 doc is wrong.

### Tier-1 ports for our v1 ship

In priority order:

- **HTTP hook handler + URL allowlist + SSRF guard.** ~600 LOC port; users want this for Slack/PagerDuty notifications.
- **`Setup` event** (init/maintenance triggers). One of the highest-value events for repo-onboarding (`/init` hook).
- **`PostToolUseFailure` event.** Error-class observability that does not need to be blocking.
- **Async hook registry** (file: `apps/cli/src/hooks/async_registry.rs`). Without this, every SessionStart hook blocks the agent loop.
- **Permission decision schema** (allow/deny/ask + updatedInput).
- **Multi-hook precedence rules** (deny > ask > allow).
- **`CLAUDE_ENV_FILE`** propagation into the BashTool env.

Three deferable for v2:

- `agent` hook handler (300 LOC, requires sub-agent infrastructure).
- `prompt` hook handler (190 LOC, requires the "small fast model" routing layer).
- `function` hook (in-memory JS callbacks; only meaningful if we expose an SDK).

---

## 14. Quick reference — file:line sitemap

| Concern                                          | File                                                                | Lines     |
| ------------------------------------------------ | ------------------------------------------------------------------- | --------- |
| Workspace-trust gate                             | `~/Desktop/reference/src/utils/hooks.ts`                            | 267-296   |
| Base hook input                                  | `~/Desktop/reference/src/utils/hooks.ts`                            | 298-328   |
| JSON schema validation                           | `~/Desktop/reference/src/utils/hooks.ts`                            | 378-451   |
| `processHookJSONOutput` (the main discriminator) | `~/Desktop/reference/src/utils/hooks.ts`                            | 489-737   |
| `execCommandHook`                                | `~/Desktop/reference/src/utils/hooks.ts`                            | 747-1335  |
| Pattern + if-condition matching                  | `~/Desktop/reference/src/utils/hooks.ts`                            | 1346-1421 |
| `getMatchingHooks` (with dedup)                  | `~/Desktop/reference/src/utils/hooks.ts`                            | 1603-1874 |
| `executeHooks` (the orchestrator)                | `~/Desktop/reference/src/utils/hooks.ts`                            | 1942-2972 |
| `executeHooksOutsideREPL`                        | `~/Desktop/reference/src/utils/hooks.ts`                            | 2974-3381 |
| Public dispatch entry-points                     | `~/Desktop/reference/src/utils/hooks.ts`                            | 3383-4192 |
| Async hook registry                              | `~/Desktop/reference/src/utils/hooks/AsyncHookRegistry.ts`          | 1-309     |
| HTTP handler                                     | `~/Desktop/reference/src/utils/hooks/execHttpHook.ts`               | 1-242     |
| SSRF guard                                       | `~/Desktop/reference/src/utils/hooks/ssrfGuard.ts`                  | 1-294     |
| Prompt handler                                   | `~/Desktop/reference/src/utils/hooks/execPromptHook.ts`             | 1-211     |
| Agent handler                                    | `~/Desktop/reference/src/utils/hooks/execAgentHook.ts`              | 1-339     |
| Hook event metadata table (27 events)            | `~/Desktop/reference/src/utils/hooks/hooksConfigManager.ts`         | 28-265    |
| Settings snapshot + policy gates                 | `~/Desktop/reference/src/utils/hooks/hooksConfigSnapshot.ts`        | 1-133     |
| Session-scoped hook store                        | `~/Desktop/reference/src/utils/hooks/sessionHooks.ts`               | 1-447     |
| Skill frontmatter registration                   | `~/Desktop/reference/src/utils/hooks/registerSkillHooks.ts`         | 1-64      |
| Agent frontmatter registration                   | `~/Desktop/reference/src/utils/hooks/registerFrontmatterHooks.ts`   | 1-67      |
| Hook event emission (Ctrl+O backbone)            | `~/Desktop/reference/src/utils/hooks/hookEvents.ts`                 | 1-193     |
| Permission-context bridge (React side)           | `~/Desktop/reference/src/hooks/toolPermission/PermissionContext.ts` | 96-388    |

---

## 15. Closing observations

- The reference codebase has clearly been pruning since the `Plan` mode era; commented-out fragments at `hooks.ts:3152-3169` (TODO Stop-hook prompt-and-agent variants outside-REPL) and `hooks.ts:881-926` (`CLAUDE_ENV_FILE` only for 4 events) suggest the system is still maturing.
- The dedup map's cross-source-context namespacing (gh-29724 reference at `hooks.ts:1714-1719`) is a regression-fix that is easy to miss when porting; without it, the same hook in user+project settings runs twice.
- The `processedPromptLines` content-matching strip (`hooks.ts:1062-1063`, `hooks.ts:1239-1249`) is another easy-to-miss feature: prompt-request lines that the harness consumed must NOT leak back into final stdout for `parseHookOutput`. Fail-closed means content-match against the actually-processed set, not index-tracking.
- The cloud-metadata cover at SSRF includes 100.64.0.0/10 specifically because Alibaba Cloud uses 100.100.100.200 for metadata (`ssrfGuard.ts:78-81`). Easy to miss in a clean-room port.

For our `apps/cli/src/hooks.rs`, the high-leverage additions ranked by impact-per-LOC are: **(1) Async hook registry** (single largest UX gain), **(2) HTTP handler with allowlist + SSRF guard** (largest feature gain, matches docs claim), **(3) Permission decision schema** (allows the rest of the agentic loop to honour hook-driven approvals), **(4) Setup + PostToolUseFailure events** (biggest coverage gap for community hooks). Together those four items are roughly 1,500 LOC of port; the remaining 11 gaps in §13 are smaller individually.
