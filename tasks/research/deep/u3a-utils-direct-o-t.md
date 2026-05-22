# U3a — utils/ Direct Files O–T (Deep Dive)

**Owner:** U3a (split from U3; covers `~/Desktop/reference/src/utils/*.ts|*.tsx` files alphabetically O–T)
**Skipped:** `sessionStorage.ts` (M3 owns it — mega-file)
**Files in scope:** ~98 files
**Method:** Read in full where feasible; for >500 LOC files capture structures + flows. Cite file:line.

---

## Top-level inventory (LOC sorted, scope O–T)

|  LOC | File                        |
| ---: | --------------------------- |
| 1225 | `teleport.tsx`              |
| 1183 | `teammateMailbox.ts`        |
| 1061 | `stats.ts`                  |
| 1040 | `toolResultStorage.ts`      |
|  862 | `tasks.ts`                  |
|  793 | `sessionStoragePortable.ts` |
|  756 | `toolSearch.ts`             |
|  679 | `ripgrep.ts`                |
|  639 | `theme.ts`                  |
|  552 | `queryHelpers.ts`           |
|  551 | `sessionRestore.ts`         |
|  474 | `Shell.ts`                  |
|  465 | `ShellCommand.ts`           |
|  434 | `statsCache.ts`             |
|  427 | `tmuxSocket.ts`             |
|  426 | `proxy.ts`                  |
|  397 | `plans.ts`                  |
|  383 | `readFileInRange.ts`        |
|  361 | `status.tsx`                |
|  360 | `releaseNotes.ts`           |

(Remaining 78 files in 14–301 LOC range, captured below.)

---

## File-by-file findings

### `objectGroupBy.ts` (18 LOC)

- **Purpose:** Polyfill of TC39 `Object.groupBy`. Returns `Partial<Record<K, T[]>>` from iterable + key selector.
- **Notable:** Uses `Object.create(null)` for safe prototypeless map — defends against `__proto__` injection. Reusable utility.

### `pasteStore.ts` (104 LOC)

- **Purpose:** Content-addressable disk store for pasted text under `<configHome>/paste-cache/<sha256-prefix16>.txt`.
- **API:** `hashPastedText(content) → 16-hex-digest`, `storePastedText(hash, content)`, `retrievePastedText(hash)`, `cleanupOldPastes(cutoffDate)`.
- **Key features:** Mode `0o600` for confidentiality; ENOENT silently ignored on retrieve; mtime-based TTL cleanup.
- **Reusable pattern:** Pre-computed sync hash returned to caller while async write proceeds (decouples reference creation from disk durability — caller can inject `[#paste:<hash>]` references immediately into chat history).

### `path.ts` (155 LOC)

- **Purpose:** `expandPath(path, baseDir?)`, `toRelativePath`, `getDirectoryForPath`, `containsPathTraversal`, `normalizePathForConfigKey`, re-export `sanitizePath`.
- **Notable:**
  - `path.ts:48` — null-byte rejection (security).
  - `path.ts:69-76` — Windows POSIX-style path conversion via `posixPathToWindowsPath`.
  - `path.ts:111-114` — UNC paths (`\\server\share`) skipped on `statSync` to avoid NTLM credential leaks.
  - `path.ts:129-135` — `containsPathTraversal` regex `/(?:^|[\\/])\.\.(?:[\\/]|$)/`.
  - `path.ts:149-155` — JSON-key normalization (forward-slash on Windows for stable config keys).
- **Reusable.**

### `peerAddress.ts` (21 LOC)

- **Purpose:** Parse URI-style peer addresses (`uds:`, `bridge:`, bare-`/`-as-uds-legacy). Kept tiny on purpose: SendMessageTool imports `parseAddress` without dragging axios + UDS modules into tool-enumeration phase.
- **Pattern:** Split-out for **import-cost engineering** — a great pattern for tool surface keep-alive.

### `planModeV2.ts` (95 LOC)

- **Purpose:** Plan-mode tier sizing + experiment flags.
- `getPlanModeV2AgentCount()` — env override `CLAUDE_CODE_PLAN_V2_AGENT_COUNT` (1–10), then **`max + default_claude_max_20x → 3`**, **`enterprise|team → 3`**, else 1.
- `getPlanModeV2ExploreAgentCount()` — env override or default 3.
- `isPlanModeInterviewPhaseEnabled()` — `USER_TYPE=ant` always-on, otherwise GrowthBook gate `tengu_plan_mode_interview_phase`.
- `getPewterLedgerVariant()` — A/B variant `'trim' | 'cut' | 'cap' | null` for `tengu_pewter_ledger` (plan-file size guidance experiment). Doc comment on lines 64–87 documents experiment design (control 14d N=26.3M, p50 4906 chars, 82% Opus 4.6, output-cost-weighted primary metric).
- **Provider coupling:** mentions Opus 4.6 in comment only, not a runtime dep. Tier checks couple to Anthropic-style subscription names.

### `platform.ts` (150 LOC)

- **Purpose:** `getPlatform()` (`'macos'|'windows'|'wsl'|'linux'|'unknown'`), `getWslVersion()`, `getLinuxDistroInfo()`, `detectVcs(dir?)`.
- **Notable:**
  - `platform.ts:9` — `SUPPORTED_PLATFORMS = ['macos', 'wsl']` — Windows-bare and Linux-bare are not supported.
  - WSL detection reads `/proc/version`, looks for `microsoft` or `wsl` substring.
  - `detectVcs` checks markers `.git, .hg, .svn, .p4config, $tf, .tfvc, .jj, .sl` plus `P4PORT` env.
- **Memoized.** Linux distro info from `/etc/os-release`.
- **Reusable.**

### `preflightChecks.tsx` (150 LOC)

- **Purpose:** Connectivity/SSL preflight for Anthropic services. React Ink component (`PreflightStep`).
- Endpoints checked: `${BASE_API_URL}/api/hello` and `${TOKEN_URL.origin}/v1/oauth/hello`.
- Uses `getSSLErrorHint` to surface `claude.com/docs/en/network-config` link on TLS errors.
- Logs `tengu_preflight_check_failed` with `isConnectivityError | hasErrorMessage | isSSLError` to Statsig.
- Compiled JSX output (React Compiler `_c` cache + memoization). Spinner appears only after 1000ms delay.
- **Provider coupling:** Anthropic-only endpoint paths.

### `privacyLevel.ts` (55 LOC)

- **Purpose:** Three-tier privacy level: `default | no-telemetry | essential-traffic`.
- Resolved by env: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` (most restrictive) > `DISABLE_TELEMETRY` > default.
- `isEssentialTrafficOnly()`, `isTelemetryDisabled()` (true at no-telemetry+), `getEssentialTrafficOnlyReason()` returns env-var name for "unset X to re-enable" UX.
- **Reusable.** Clean tier ordering. Disables auto-updates/grove/release-notes/model-capabilities at strictest level.

### `process.ts` (68 LOC)

- **Purpose:** Stdout/stderr safe writers + EPIPE hardening + `peekForStdinData`.
- `registerProcessOutputErrorHandlers()` destroys streams on EPIPE (e.g., `claude -p | head -1`).
- `exitWithError(message)` — consolidated `console.error + process.exit(1)`.
- `peekForStdinData(stream, ms)` — race timeout vs `data`/`end` events; returns `true` on timeout, `false` on end. Used by `-p` mode to distinguish a real pipe producer from inherited-but-idle parent stdin.
- **Reusable pattern.** Backpressure note: `write()` callback not handled — flagged in comment.

### `profilerBase.ts` (46 LOC)

- **Purpose:** Lazy-loaded `perf_hooks.performance` accessor + `formatTimelineLine` shared by `startupProfiler`, `queryProfiler`, `headlessProfiler`.
- Format: `[+  total.ms] (+  delta.ms) name [extra] [| RSS: .., Heap: ..]`.
- `totalPad/deltaPad` configurable for column alignment (startup uses 8/7, query uses 10/9).
- **Reusable pattern.**

### `promptCategory.ts` (49 LOC)

- **Purpose:** Maps agent type / output style → analytics `QuerySource`.
- `getQuerySourceForAgent(agentType, isBuiltInAgent)` → `agent:builtin:<name>` | `agent:default` | `agent:custom`.
- `getQuerySourceForREPL()` → `repl_main_thread` (default) | `repl_main_thread:outputStyle:<name>` | `:custom`.
- **Telemetry attribute generator.**

### `promptEditor.ts` (188 LOC)

- **Purpose:** Open external editor (`$EDITOR`) for prompt composition with paste reference expand/collapse.
- `EDITOR_OVERRIDES` adds wait flags: `code -w`, `subl --wait` (line 17–19).
- `editFileInEditor(filePath)` — alt-screen-aware Ink hand-off: GUI editors → `pause + suspendStdin`; terminal editors → `enterAlternateScreen` (because fullscreen mode would otherwise be knocked back to main buffer). Returns `{ content, error? }`.
- `editPromptInEditor(currentPrompt, pastedContents?)` — temp file workflow: expand pasted-text refs → write → edit → trim trailing `\n` → re-collapse refs. Cleanup in finally.
- Imports: `expandPastedTextRefs`, `formatPastedTextRef`, `getPastedTextRefNumLines` from `../history.js`.
- **Reusable pattern:** terminal-vs-GUI editor branching with Ink alt-screen handoff.

### `promptShellExecution.ts` (183 LOC)

- **Purpose:** Parses `!`backtick``/` ```! ` blocks in skill markdown / slash commands and executes embedded shell commands routed through BashTool or PowerShellTool.
- **Patterns:** `BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g`; `INLINE_PATTERN = /(?<=^|\s)!\`([^\`]+)\`/gm`(lookbehind 100× slower; gated on`text.includes('!`')` check at line 90 — 93% skip).
- **Lazy require for PowerShellTool** (line 34–46) — startup-cost engineering.
- **Permission gate:** `hasPermissionsToUseTool` before `shellTool.call()` (line 98–104).
- **String.replace via fn replacer** (line 131) — defends against `$$/$&/$``/$'`` interpretation in shell output.
- **Frontmatter shell selection:** `shell?: 'bash'|'powershell'`; PowerShell only if `isPowerShellToolEnabled()` runtime gate.

### `proxy.ts` (426 LOC)

- **Purpose:** HTTP proxy + mTLS + NO_PROXY plumbing for axios + undici + AWS SDK + WebSocket + Bun.
- **Notable:**
  - `proxy.ts:1-4` — `@aws-sdk/credential-provider-node` and `@smithy/node-http-handler` dynamically imported (defers ~929KB); `undici` lazy-required (~1.5MB).
  - `disableKeepAlive()` — sticky after stale-pool ECONNRESET to avoid reusing dead pooled sockets (line 27–35).
  - `getAddressFamily(LookupOptions)` — normalizes `0|4|6|'IPv4'|'IPv6'|undefined` → `0|4|6`.
  - `getProxyUrl(env)` — prefers lowercase: `https_proxy > HTTPS_PROXY > http_proxy > HTTP_PROXY`.
  - `shouldBypassProxy(url, noProxy)` — supports `*`, exact host, `.suffix.com`, `host:port`, IPs.
  - `createHttpsProxyAgent` — wires mTLS cert/key/ca; `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` skips local DNS (line 151–158).
  - `getProxyAgent` (memoized) returns `EnvHttpProxyAgent` with `requestTls` (CONNECT tunnel TLS) + `connect` (direct conn TLS).
  - `getProxyFetchOptions({forAnthropicAPI})` — `ANTHROPIC_UNIX_SOCKET` env var tunnels through `claude ssh` auth proxy under Bun. Hardcoded to api.anthropic.com upstream — must be scoped to Anthropic SDK only or MCP/SSE requests get misrouted.
  - `configureGlobalAgents()` — workaround for axios#4531 (`axios.defaults.proxy = false`).
- **Provider coupling:** `ANTHROPIC_UNIX_SOCKET` is Anthropic-only routing.
- **Reusable patterns:** lazy SDK imports for size, NO_PROXY parser, dual TLS option propagation.

### `queryContext.ts` (179 LOC)

- **Purpose:** Build the cache-key prefix (`systemPrompt`, `userContext`, `systemContext`) for `query()` calls. Lives in own file to avoid cycles with `commands.ts`.
- `fetchSystemPromptParts({...})` — when `customSystemPrompt` is set, both `getSystemPrompt` and `getSystemContext` are skipped (custom replaces default entirely).
- `buildSideQuestionFallbackParams({...})` — used when SDK side_question fires before turn completes (no stopHooks snapshot). Mirrors QueryEngine's prompt assembly to preserve cache hit. Strips in-progress assistant message (`stop_reason === null`). Invokes `shouldEnableThinkingByDefault()`.

### `QueryGuard.ts` (121 LOC)

- **Purpose:** Synchronous state machine for query lifecycle, compatible with React's `useSyncExternalStore`.
- **States:** `idle | dispatching | running`. Transitions: `idle→dispatching` (reserve), `dispatching→running` (tryStart), `idle→running` (direct submit), `running→idle` (end/forceEnd), `dispatching→idle` (cancelReservation).
- **Generation counter** on tryStart, ensures stale `finally` blocks from cancelled queries detect mismatch via `end(generation)` returning false.
- `subscribe`/`getSnapshot` — useSyncExternalStore interface; `isActive` is sync (not subject to React batching delays).
- **Reusable pattern:** generation-keyed query cancellation, exposing snapshot to React without batching races.

### `queueProcessor.ts` (95 LOC)

- **Purpose:** REPL queue processor. Slash commands and bash-mode commands are processed individually for per-command error isolation; other modes are batched (drain all matching mode at once → single `executeInput` with array).
- **Mainline filter** `cmd.agentId === undefined` — subagent-targeted notifications stay in queue (line 61).
- **Reusable pattern:** mode-batched dequeue with peek+predicate.

### `readEditContext.ts` (227 LOC)

- **Purpose:** Streaming search of file for a needle; returns context window slice with line offset.
- **Constants:** `CHUNK_SIZE = 8KB`, `MAX_SCAN_BYTES = 10MB`. `truncated: true` if MAX hit.
- **Algorithm:** 8KB chunks with overlap = `needleLen + nlCount - 1` (handles needle straddling chunk boundary). LF first; if needle has newlines, lazy-encode CRLF and rescan.
- **CRLF handling:** `normalizeCRLF(buf, len)` only if `\r` present; both LF and CRLF needle variants checked.
- `readCapped(handle)` — single buffer doubled on fill (~log2(size/8KB) allocs), used by FileEditTool multi-edit path.
- `sliceContext` — backward scan for `contextLines` newlines, forward scan, returns `{ content, lineOffset, truncated }`.
- **Reusable.**

### `queryHelpers.ts` (552 LOC)

- **Purpose:** SDK message normalization + result-success classifier + read-file state extraction.
- `isResultSuccessful(message, stopReason)` — assistant-with-text/thinking/redacted_thinking, or user-only-tool_results, or `stopReason === 'end_turn'` carve-out for zero-content turns (claude.ts:2026 reference).
- `normalizeMessage(message)` — generator yielding SDKMessage variants. Routes `assistant`, `progress` (`agent_progress | skill_progress | bash_progress | powershell_progress`), `user`. Bash/PowerShell progress throttled to 30s and only emitted under `CLAUDE_CODE_REMOTE` or `CLAUDE_CODE_CONTAINER_ID`.
- `handleOrphanedPermission(orphanedPermission, tools, mutableMessages, ctx)` — replays an out-of-band permission decision: pushes assistant message (dedup against same `tool_use.id`), runs tool with synthetic `canUseTool`, persists transcript via `recordTranscript`. **CCR resume edge case** documented at lines 290–298.
- `extractReadFilesFromMessages(messages, cwd, maxSize=10)` — two-pass: collect FileRead/FileWrite/FileEdit tool_use ids → on each tool_result, populate `FileStateCache`. Edit path **re-reads from disk** because Edit's `tool_use.input` lacks post-edit content (line 477–494). Strips `<system-reminder>` blocks; uses `stripLineNumberPrefix`.
- `extractBashToolsFromMessages` + `extractCliName` — strips env-var assignments (`FOO=bar vercel` → `vercel`) and `sudo` prefixes.
- **Provider coupling:** Anthropic SDK types (`@anthropic-ai/sdk`); progress throttling tied to remote-only env.

### `queryProfiler.ts` (301 LOC)

- **Purpose:** TTFT-focused profiler enabled by `CLAUDE_CODE_PROFILE_QUERY=1`. Uses Node `perf_hooks`; module-level marks + memory snapshots.
- **Checkpoints (in order):** `query_user_input_received` → context loading → query_fn_entry → microcompact → autocompact → setup → api_loop_start → api_streaming_start → tool_schema_build → message_normalization → client_creation → **api_request_sent** → response_headers_received → **first_chunk_received (TTFT)** → api_streaming_end → tool_execution → recursive_call → end.
- **Slow warnings:** `>1000ms = VERY SLOW`, `>100ms = SLOW`; specific bottleneck heuristics for `git_status`, `tool_schema`, `client_creation`.
- **Phase summary** with per-phase bar-chart (`█` 1 block per 10ms, max 50). Total TTFT split into pre-request overhead + network latency.
- **Reusable pattern.** Pairs with `profilerBase.ts`.

### `readFileInRange.ts` (383 LOC)

- **Purpose:** Line-oriented file reader with two paths: fast (`<10MB regular files`, `readFile + indexOf` split) and streaming (`createReadStream + manual split` with state object bound via `.bind(state)` for zero closures).
- `FileTooLargeError` — message includes formatted size + recommendation to use offset/limit or search.
- **`truncateOnByteLimit` mode:** caps SELECTED OUTPUT at maxBytes, sets `truncatedByBytes`. In streaming, collapses `endLine` once budget exceeded so subsequent content isn't accumulated (memory bound). Handles huge single-line files in selected range.
- Both paths strip UTF-8 BOM and `\r` (CRLF→LF). `mtimeMs` from `fstat`/`stat`.
- **Reusable pattern.**

### `releaseNotes.ts` (360 LOC)

- **Purpose:** Fetches `CHANGELOG.md` from GitHub, caches at `~/.claude/cache/changelog.md`, parses for last-N versions, surfaces in UI.
- `CHANGELOG_URL = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'` (line 28). Raw URL on line 30.
- **Migration helper:** `migrateChangelogFromConfig` removes deprecated `cachedChangelog` config field, writes file with `flag: 'wx'` (no overwrite).
- **Network gate:** `isEssentialTrafficOnly()` and `getIsNonInteractiveSession()` skip fetch.
- **Memory cache** for sync React render path; `getStoredChangelogFromMemory()` is sync entry point. setup.ts awaits `checkForReleaseNotes()` first to populate.
- **Ant special case:** `process.env.USER_TYPE === 'ant'` uses `MACRO.VERSION_CHANGELOG` (build-time bundled commits).
- `parseChangelog(content)` — splits on `^## ` markdown heading, accepts `1.2.3` and `1.2.3 - YYYY-MM-DD` forms.
- `MAX_RELEASE_NOTES_SHOWN = 5`.
- **Provider coupling:** GitHub URL anthropics/claude-code; harmless string but represents the brand.

### `renderOptions.ts` (77 LOC)

- **Purpose:** Build base Ink `RenderOptions` with stdin override for piped stdin.
- `getStdinOverride()` opens `/dev/tty` as `ReadStream` when stdin is piped (so Ink can still take interactive input). Skips: TTY stdin, CI, `mcp` argv, Windows.
- Sets `ttyStream.isTTY = true` explicitly because Bun compiled binaries may misdetect.
- **Reusable pattern.**

### `sanitization.ts` (91 LOC)

- **Purpose:** Unicode hidden-character sanitization. Mitigates HackerOne #3086545 — ASCII Smuggling and Hidden Prompt Injection via Tag chars / format controls / private use / noncharacters.
- **Algorithm:** Iterative until idempotent (max 10 iters, throws otherwise).
  - NFKC normalize.
  - Strip `\p{Cf}\p{Co}\p{Cn}` (format/private-use/unassigned).
  - Explicit ranges: `​-‏`, `‪-‮`, `⁦-⁩`, `﻿`, `-`.
- `recursivelySanitizeUnicode<T>` — strings, arrays, objects (sanitizes both keys + values).
- **Critical security primitive.** Reusable.

### `screenshotClipboard.ts` (121 LOC)

- **Purpose:** Copy ANSI text → PNG → system clipboard. Supports macOS (`osascript ... «class PNGf»`), Linux (`xclip` then `xsel` fallback), Windows (PowerShell `Clipboard::SetImage`).
- `copyAnsiToClipboard(ansiText, options)` writes temp PNG (`tmpdir/claude-code-screenshots/screenshot-<ts>.png`), then `copyPngToClipboard`, then unlink.
- **Pure-TS pipeline:** `ansiToPng` (no WASM, no system fonts) — works in JS+native builds.

### `sdkEventQueue.ts` (134 LOC)

- **Purpose:** SDK event queue for headless/streaming mode. Drained directly into output stream — bypasses XML task_notification parser.
- **Event types:** `task_started`, `task_progress` (token + tool count + duration + workflow_progress delta), `task_notification` (`completed | failed | stopped` + output_file + summary + usage), `session_state_changed` (`idle | running | requires_action`).
- `MAX_QUEUE_SIZE = 1000` — drops head on overflow. Skipped when not non-interactive (TUI would accumulate forever).
- `emitTaskTerminatedSdk(taskId, status, opts)` — bookend to `registerTask()`. Distinguishes from XML-route to avoid double-emit (kill paths, abort branches use direct emit).
- **Provider coupling:** None. **Reusable pattern.**

### `semanticBoolean.ts` (29 LOC) and `semanticNumber.ts` (36 LOC)

- **Purpose:** Zod v4 preprocess wrappers tolerating model-emitted quoted booleans/numbers (`"replace_all":"false"` → `false`; `"head_limit":"30"` → `30`).
- Critical insight: `z.coerce.boolean()` is wrong — uses JS truthiness, so `"false" → true`. `z.coerce.number()` accepts `""` and `null`. These regex-gate (`/^-?\d+(\.\d+)?$/` for numbers; literal `"true"|"false"` for booleans) and pass through everything else.
- `z.preprocess` emits `{"type":"boolean"}` / `{"type":"number"}` to API schema — invisible client-side coercion.
- Note: `.optional()/.default()` must be inside (on inner schema), not chained — chaining onto `ZodPipe` widens `z.output<>` to `unknown`.
- **Highly reusable.**

### `semver.ts` (59 LOC)

- **Purpose:** Semver comparison preferring `Bun.semver.order()` (~20× faster) and falling back to npm `semver` with `{loose: true}`.
- Exports `gt, gte, lt, lte, satisfies, order`.
- **Reusable pattern:** Bun runtime detection.

### `sequential.ts` (56 LOC)

- **Purpose:** Wrap async fn in single-flight sequential queue.
- Returns `(...args) => Promise<R>` that pushes `{args, resolve, reject, context}` to queue and processes one at a time. Re-fires `processQueue` if items added after drain.
- **Reusable pattern.** Common building block.

### `sessionActivity.ts` (133 LOC)

- **Purpose:** Refcount-based heartbeat timer for keep-alives during long ops. Bracket work with `startSessionActivity('api_call' | 'tool_exec')` / `stopSessionActivity`.
- **Heartbeat:** Every 30s while refcount>0, logs `session_keepalive_heartbeat` and (if `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`) calls registered `activityCallback`.
- **Idle timer:** On refcount→0, starts a 30s timer that logs `session_idle_30s`.
- **`registerCleanup`** logs `session_activity_at_shutdown` with refcount + active reasons + oldest_activity_ms.
- **Reusable pattern.**

### `sessionEnvironment.ts` (166 LOC)

- **Purpose:** Aggregates session-scoped env scripts (sourced before each shell command).
- Storage: `<configHome>/session-env/<sessionId>/<event>-hook-<i>.sh`. Hook events: `Setup | SessionStart | CwdChanged | FileChanged`.
- **Priority order:** `setup(0) < sessionstart(1) < cwdchanged(2) < filechanged(3)` (sorted then by index).
- **CLAUDE_ENV_FILE** env var support: parent process (HFI trajectory runner) can pre-write a venv/conda activate script.
- Cache states: `undefined` (not loaded), `null` (no files exist), `string` (cached). Windows skipped.
- `clearCwdEnvFiles()` clears `cwdchanged-*` and `filechanged-*` on cwd change.

### `sessionEnvVars.ts` (22 LOC)

- **Purpose:** In-memory `Map<string,string>` of session-scoped env vars set via `/env` slash command.
- Applied only to spawned children (via bash provider env overrides), not the REPL itself.
- API: `getSessionEnvVars()` (readonly), `setSessionEnvVar`, `deleteSessionEnvVar`, `clearSessionEnvVars`.

### `sessionFileAccessHooks.ts` (250 LOC)

- **Purpose:** PostToolUse hooks that emit telemetry events on session-memory + transcript + memdir + team-memory file access.
- **Events:** `tengu_session_memory_accessed`, `tengu_transcript_accessed`, `tengu_memdir_accessed`, `tengu_memdir_file_read|edit|write`, `tengu_team_mem_accessed`, `tengu_team_mem_file_read|edit|write`.
- **Lazy feature gates:** `bun:bundle` `feature('TEAMMEM')`, `feature('MEMORY_SHAPE_TELEMETRY')` — modules required only when the feature is enabled.
- Hook timeout `1ms` — emphasizes "just logging" non-blocking telemetry.
- **Provider coupling:** None.

### `sessionIngressAuth.ts` (140 LOC)

- **Purpose:** Resolve session ingress auth token. Priority order:
  1. `CLAUDE_CODE_SESSION_ACCESS_TOKEN` env var.
  2. File descriptor (`CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR`) — read once, cached, accessed via `/dev/fd/<n>` (macOS/BSD) or `/proc/self/fd/<n>` (Linux).
  3. Well-known file fallback (`CLAUDE_SESSION_INGRESS_TOKEN_FILE` env var path or `CCR_SESSION_INGRESS_TOKEN_PATH`).
- `getSessionIngressAuthHeaders()` — branch on `sk-ant-sid` prefix: Cookie + `X-Organization-Uuid` for session keys, `Authorization: Bearer <token>` for JWTs.
- `updateSessionIngressAuthToken(token)` — REPL bridge injects fresh token after reconnection.
- **Provider coupling:** Anthropic SID convention; `X-Organization-Uuid` header.

### `sessionRestore.ts` (551 LOC)

- **Purpose:** Resume + continue logic. Re-applies file history, attribution snapshots, context-collapse persistence, todos, agent type/model, worktree.
- `extractTodosFromTranscript(messages)` — backwards scan for last `tool_use(name=TodoWrite)`, parses `todos` via `TodoListSchema`.
- `restoreSessionStateFromLog(result, setAppState)` — calls `fileHistoryRestoreStateFromLog`, `attributionRestoreStateFromLog` (gated by `feature('COMMIT_ATTRIBUTION')`), `contextCollapse/persist.restoreFromEntries` (gated by `feature('CONTEXT_COLLAPSE')`), seeds `AppState.todos[agentId]` if v2 disabled.
- `computeRestoredAttributionState`, `computeStandaloneAgentContext` — preview state for initial render.
- `restoreAgentFromSession(agentSetting, currentAgentDef, defs)` — `--agent` flag wins; otherwise looks up `activeAgents.find(a=>a.agentType===setting)`. Sets `MainThreadAgentType` + `MainLoopModelOverride` (parsed via `parseUserSpecifiedModel`).
- `refreshAgentDefinitionsForModeSwitch(modeWasSwitched, ...)` — re-derives builtin agents on coordinator/normal switch.
- `restoreWorktreeForResume(worktreeSession)` — TOCTOU-safe `process.chdir`; if dir gone → `saveWorktreeState(null)`. Doesn't set `projectRoot` (intentionally — matches EnterWorktreeTool behavior). Clears memory + system prompt + plans-dir caches.
- `exitRestoredWorktree()` — undo before mid-session `/resume` switches sessions.
- `processResumedConversation(result, opts, context)` — coordinator-mode matching, session ID adoption (`switchSession` + `renameRecordingForSession`), worktree restore, agent restore, mode persistence, initial state computation.
- **Fork session edge case** (`opts.forkSession`): preloaded `contentReplacements` re-recorded with new sessionId so cache lookups match (line 452–462). Worktree stripped on fork to avoid double-ownership.
- **Provider coupling:** None directly. Uses `parseUserSpecifiedModel` (model.ts) to translate user-specified strings.

### `sessionStart.ts` (232 LOC)

- **Purpose:** Run SessionStart + Setup hook lifecycles. Emits `HookResultMessage[]` from plugin and project hooks.
- **Sources:** `'startup' | 'resume' | 'clear' | 'compact'`.
- **Bare-mode skip** (`isBareMode()`).
- **`shouldAllowManagedHooksOnly()`** — policy gate that disables plugin hooks (untrusted external code).
- **Plugin hook loading errors** — friendly user guidance based on error message classification (network / permission / config / generic).
- `pendingInitialUserMessage` side-channel — hook-emitted initial user message consumed once via `takeInitialUserMessage()`. Used in print mode.
- **Annotation comment:** "Note to CLAUDE: do not add ANY 'warmup' logic" — startup-cost discipline.

### `sessionState.ts` (150 LOC)

- **Purpose:** `SessionState = 'idle' | 'running' | 'requires_action'` with listener registry.
- **`RequiresActionDetails`** — `tool_name`, `action_description` (e.g. "Editing src/foo.ts"), `tool_use_id`, `request_id`, optional `input`. Two delivery paths: typed proto (Datadog) + opaque `external_metadata.pending_action` JSON (CCR queryable).
- **`SessionExternalMetadata`** — `permission_mode`, `is_ultraplan_mode`, `model`, `pending_action`, `post_turn_summary`, `task_summary` (mid-turn forked-summarizer line, fires every ~5 steps / 2min).
- `notifySessionStateChanged(state, details?)` — also enqueues SDK event when `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS` is set (opt-in until CCR clients learn to ignore in `isWorking()` heuristics — see Slack thread referenced).
- **Choke point** for permission-mode change broadcasts.

### `sessionTitle.ts` (129 LOC)

- **Purpose:** Single source of truth for AI-generated session titles. Calls `queryHaiku` with JSON-schema output.
- **Prompt** at line 56–68: 3–7 word sentence-case title, JSON `{title}`. Bad examples included.
- `extractConversationText(messages)` — concatenates user+assistant text content; tail-slices last `MAX_CONVERSATION_TEXT = 1000` chars (recent context wins).
- `outputFormat: {type: 'json_schema', schema: {...}, required:['title']}`.
- **Provider coupling:** `queryHaiku` calls Anthropic Haiku model. `'generate_session_title'` is the QuerySource. Logs `tengu_session_title_generated`.
- **Hardcoded model reference:** None at this layer — `queryHaiku` resolves the model elsewhere.

### `sessionUrl.ts` (64 LOC)

- **Purpose:** Parse `--resume <identifier>` argument: JSONL path | UUID | URL.
- **JSONL precedence:** Windows absolute paths (`C:\...`) parse as URLs with `C:` protocol — must check `.jsonl` suffix first.
- Returns `{sessionId, ingressUrl, isUrl, jsonlFile, isJsonlFile}`.

### `set.ts` (53 LOC)

- **Purpose:** Hot-path Set utilities optimized for speed: `difference`, `intersects`, `every`, `union`. All `for-of` loops, no functional helpers.
- **Reusable.**

### `Shell.ts` (474 LOC)

- **Purpose:** Shell discovery + child-process exec with sandbox/Big-output handling.
- `findSuitableShell()` — `CLAUDE_CODE_SHELL` override → `SHELL` env (bash/zsh) → `Bun.which`/`which` → fallback paths (`/bin, /usr/bin, /usr/local/bin, /opt/homebrew/bin`). Validates with `--version`. Throws if no posix shell found.
- `getShellConfig` (memoized) → `{provider: ShellProvider}` (bash provider). `getPsProvider` (memoized) for PowerShell.
- `DEFAULT_TIMEOUT = 30 * 60 * 1000` (30 min).
- `exec(command, abortSignal, shellType, options)` — long, dense:
  - Builds `{commandString, cwdFilePath}` via `provider.buildExecCommand` with optional sandbox `{sandboxTmpDir, useSandbox}`.
  - **CWD recovery:** if cwd no longer exists on disk (`realpath` throws), falls back to `getOriginalCwd()`.
  - **Sandboxed PowerShell special case** (line 256–278): wraps via `pwsh -NoProfile -NonInteractive -EncodedCommand <base64>` because runtime's `shellquote.quote()` would otherwise mangle args; uses `/bin/sh` as inner sandbox shell.
  - Output mode: pipe (callback `onStdout`) vs file. File mode opens output handle with `O_WRONLY | O_CREAT | O_APPEND | O_NOFOLLOW` (or `'w'` on Windows due to libuv quirk that strips `FILE_WRITE_DATA` on `'a'`). `O_NOFOLLOW` is anti-symlink-attack-from-sandbox.
  - Spawn env: `subprocessEnv() + SHELL + GIT_EDITOR='true' + CLAUDECODE='1' + envOverrides + (CLAUDE_CODE_SESSION_ID for ant builds)`.
  - On result: cwdFile read sync (`readFileSync`/`unlinkSync`) — must be sync within `.then()` microtask so callers see updated cwd. Windows: convert via `posixPathToWindowsPath`. NFC normalize before comparing (macOS APFS NFD).
  - On cwd change: `setCwd → invalidateSessionEnvCache → onCwdChangedForHooks`.
  - Linux bwrap creates 0-byte mount-point ghost dotfiles → `SandboxManager.cleanupAfterCommand()` synchronously.
- `setCwd(path, relativeTo?)` — `realpathSync` to resolve symlinks (TOCTOU-safe), throws friendly ENOENT message.
- **Provider coupling:** Anthropic-only env `CLAUDE_CODE_SESSION_ID` for ant builds.
- **Reusable patterns.**

### `ShellCommand.ts` (465 LOC)

- **Purpose:** Wrap `ChildProcess` with timeout, abort, background, kill, and output watchdog.
- **Type `ExecResult`:** `{stdout, stderr, code, interrupted, backgroundTaskId?, backgroundedByUser?, assistantAutoBackgrounded?, outputFilePath?, outputFileSize?, outputTaskId?, preSpawnError?}`.
- **`StreamWrapper`** — pipe-mode wrapper feeding `TaskOutput.writeStdout/Stderr`. Sets `setEncoding('utf-8')` to avoid `.toString()` per chunk. Cleanup nulls refs to allow GC.
- **`ShellCommandImpl`** — reads:
  - `'exit'` (not `'close'`) so detached `sleep 30 &` grandchildren don't keep result hanging.
  - **Auto-background on timeout** if `shouldAutoBackground` + `onTimeoutCallback`.
  - **`#abortHandler`:** on `signal.reason === 'interrupt'`, doesn't kill — lets caller background so model sees partial output.
  - **Size watchdog** (`SIZE_WATCHDOG_INTERVAL_MS = 5_000`): when backgrounded, polls `stat(path).size`; if exceeds `MAX_TASK_OUTPUT_BYTES`, SIGKILL with stderr prepended `Background command killed: output file exceeded ...`. Justified by "768GB incident".
  - `#exitHandler` derives exit code: `code` if present, `144` for SIGTERM, else 1.
  - Magic codes: `SIGKILL = 137`, `SIGTERM = 143`. AbortedShellCommand defaults to code 145.
  - On exit: small files inlined → delete file (`outputFileRedundant`), large files keep file path.
- `wrapSpawn`, `createAbortedCommand`, `createFailedCommand` — public factories.
- **Reusable patterns:** size watchdog, auto-background, abort vs interrupt distinction.

### `shellConfig.ts` (167 LOC)

- **Purpose:** Manage `.bashrc`/`.zshrc`/`config.fish` for `claude` alias install/uninstall.
- `CLAUDE_ALIAS_REGEX = /^\s*alias\s+claude\s*=/`.
- `getShellConfigPaths` — respects `ZDOTDIR` env (zsh users).
- `filterClaudeAliases(lines)` — preserves custom user aliases, only removes alias targets pointing to `getLocalClaudePath()` (the installer location). Regex covers quoted + unquoted forms.
- `findClaudeAlias` / `findValidClaudeAlias` — scan all configs, return first matching alias target if executable exists.
- `writeFileLines` uses `fh.datasync()` for durability before close.

### `sideQuery.ts` (222 LOC)

- **Purpose:** Lightweight wrapper around `client.beta.messages.create()` for "side queries" outside main loop. Handles fingerprint, attribution header, CLI sysprompt prefix, model betas, structured-outputs beta, model normalization (`normalizeModelStringForAPI` strips `[1m]` 1M-context suffix).
- **System assembled as TextBlockParam[]** — attribution header in its own block so server-side parser correctly extracts `cc_entrypoint` without including system content.
- **Use cases (from JSDoc):** permission_explainer, session_search, model_validation.
- `thinking: number | false` — `disabled` or `enabled` with `budget_tokens = min(thinking, max_tokens-1)`.
- Logs `tengu_api_success` with full usage breakdown (input/output/cached/uncached + duration_ms_including_retries + time_since_last_api_call_ms).
- **Provider coupling:** Anthropic SDK direct dependency, OAuth attribution headers, `getCLISyspromptPrefix`.

### `sideQuestion.ts` (222 LOC, "/btw")

- **Purpose:** Forked agent for `/btw` quick questions without interrupting main agent context.
- `BTW_PATTERN = /^\/btw\b/gi`.
- `runSideQuestion({question, cacheSafeParams})` — wraps with `<system-reminder>` instructing model: separate lightweight agent, NO tools available, single response, no follow-up turns. Uses `runForkedAgent` with `canUseTool: deny`, `maxTurns: 1`, `skipCacheWrite: true`.
- **Cache-key preservation note (line 82–84):** Doesn't override `thinkingConfig` because thinking is part of API cache key — diverging busts cache.
- **`extractSideQuestionResponse`** — important comment (lines 104–124): claude.ts yields one AssistantMessage **per content block**, so thinking responses are `[thinking_block_msg, text_block_msg]`. Old `find(m=>m.type==='assistant')` grabbed thinking-only first message → "No response received" bug. Now flattens content blocks across all assistant messages. Also handles tool_use slip and api_error fallback.
- **Provider coupling:** Anthropic-style content-block streaming.

### `signal.ts` (43 LOC)

- **Purpose:** Tiny `Signal<Args>` listener-set primitive. Replaces 8-line boilerplate duplicated ~15× across codebase.
- API: `subscribe(listener) → unsubscribe`, `emit(...args)`, `clear()`.
- Distinct from store (no snapshot/getState).
- **Highly reusable.**

### `sinks.ts` (16 LOC)

- **Purpose:** Boot-time wiring of error log + analytics sinks. Both inits idempotent; called from `setup()` and other entrypoints to drain pre-attachment queues.
- Doc note: kept as leaf module to avoid `setup → commands → bridge → setup` import cycle.

### `slashCommandParsing.ts` (60 LOC)

- **Purpose:** `parseSlashCommand(input) → {commandName, args, isMcp}`.
- MCP commands have second word `(MCP)` (e.g. `/mcp:tool (MCP) arg1 arg2` → `commandName: 'mcp:tool (MCP)'`).
- Returns null on no-leading-slash or empty.

### `sleep.ts` (84 LOC)

- **Purpose:** Abort-responsive `sleep(ms, signal?, opts?)` and `withTimeout(promise, ms, message)`.
- Sleep options: `throwOnAbort`, `abortError: () => Error` (custom rejection class — useful for `APIUserAbortError`-aware retry loops), `unref: true` (don't block process exit).
- Pre-check `signal?.aborted` BEFORE setTimeout to avoid TDZ on `timer` ref.
- `withTimeout` doesn't cancel underlying work — just races a timeout.
- **Reusable.**

### `sliceAnsi.ts` (91 LOC)

- **Purpose:** `sliceAnsi(str, start, end?)` replacement for npm `slice-ansi` that handles OSC 8 hyperlinks and zero-width combining marks correctly.
- Uses `@alcalzone/ansi-tokenize` (handles hyperlink open/close pairs).
- Advances by **display width** (`stringWidth`), not code units. Combining marks (Devanagari matras, virama, diacritics) have width 0; legacy `.length` truncation dropped them.
- Special handling around `position >= end`: continues past trailing zero-width marks attached to preceding base char, but NOT past ANSI codes (those open new style runs that would leak into undo sequence).
- Skips leading zero-width marks at start boundary (left half owns them) when `start > 0` to prevent double-emit.
- Closes with `undoAnsiCodes` for active start codes.
- **Reusable.**

### `slowOperations.ts` (286 LOC)

- **Purpose:** Tagged-template `slowLogging\`...\``for timing operations + wrapped`JSON.stringify`/`JSON.parse`/`structuredClone`/`cloneDeep`/`writeFileSync_DEPRECATED`.
- **Threshold:** `CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS` env or 20ms (dev) / 300ms (ant) / Infinity (external default).
- **DCE pattern:** External builds get `NOOP_LOGGER` (zero-alloc `Disposable`); ant builds use `AntSlowLogger` with deferred stack formatting (V8/JSC defer `.stack` string formatting until read).
- `using _ = slowLogging\`structuredClone(${value})\``— Symbol.dispose pattern.`buildDescription` summarizes args (Array[N], Object{N keys}, strings >80 truncated to "…", primitives as String).
- **Re-entrancy guard `isLogging`** — prevents `appendFileSync` → debug → slow → debug recursion.
- `addSlowOperation` → bootstrap state for DevBar warnings. `callerFrame(stack)` extracts first non-slowOperations frame.
- `jsonParse` branches on `reviver === undefined` because V8 deopts JSON.parse with second arg even if undefined.
- `writeFileSync_DEPRECATED({flush:true})` → manual `openSync + fsWriteFileSync(fd) + fsyncSync + closeSync` for durability.

### `standaloneAgent.ts` (23 LOC)

- **Purpose:** Returns `appState.standaloneAgentContext.name` if set AND not in a swarm (`getTeamName()` returns falsy). Swarm context takes precedence.

### `startupProfiler.ts` (194 LOC)

- **Purpose:** Two-mode startup profiler.
  - **Sampled (Statsig):** 100% ant + 0.5% external (`STATSIG_SAMPLE_RATE = 0.005`). Decision made once at module load — non-sampled users pay zero cost.
  - **Detailed (`CLAUDE_CODE_PROFILE_STARTUP=1`):** Full report + memory snapshots written to `<configHome>/startup-perf/<sessionId>.txt`.
- **Phase definitions:** `import_time = cli_entry → main_tsx_imports_loaded`, `init_time = init_function_start → init_function_end`, `settings_time = eagerLoadSettings_start → eagerLoadSettings_end`, `total_time = cli_entry → main_after_run`.
- **Memory snapshots stored as array** (NOT Map) — keyed by index because some checkpoints fire multiple times (e.g. `loadSettingsFromDisk_start` fires during init AND after plugins reset cache).
- Logs `tengu_startup_perf` with phase durations + checkpoint count.

### `staticRender.tsx` (115 LOC)

- **Purpose:** Render React Ink tree to string for static printing (workaround for Ink's lack of multi-`<Static>` support).
- `RenderOnceAndExit` wrapper uses `useLayoutEffect → setTimeout(exit, 0)` so React's commit phase completes (more robust than `process.nextTick()` for React 19 async render).
- DEC synchronized update markers: `\x1B[?2026h` (start), `\x1B[?2026l` (end). `extractFirstFrame` grabs content between — Ink in non-TTY mode emits multiple frames.
- `renderToAnsiString(node, columns?)` and `renderToString(node, columns?)` (ANSI stripped via `strip-ansi`).

### `stats.ts` (1061 LOC) — high-LOC, summary

- **Purpose:** Compute and aggregate Claude Code usage stats from JSONL transcripts in `~/.claude/projects/<project>/<sessionId>.jsonl` and `<projectDir>/<sessionId>/subagents/agent-*.jsonl`.
- **Types:** `DailyActivity (date, messageCount, sessionCount, toolCallCount)`, `DailyModelTokens`, `StreakInfo`, `SessionStats`, `ClaudeCodeStats`.
- **`processSessionFiles(files, {fromDate, toDate})`** — batches of 20 in parallel. For each:
  - `fs.stat` first; skip if `mtime < fromDate`.
  - For files >64KB, `readSessionStartDate(file)` peek-reads 4KB and JSON-parses lines until first transcript message — defends against `file-history-snapshot.snapshot.timestamp` carrying _previous_ session's date (resumed sessions get new mtime but old start date).
  - Filters `isSidechain` for session metadata (subagents tracked separately).
  - Aggregates `modelUsage` (input/output/cache_read/cache_creation tokens, costUSD, max contextWindow).
  - Skips `SYNTHETIC_MODEL` messages (internal).
  - **Shot stats** (ant-only feature `SHOT_STATS`): regex `/(\d+)-shotted by/` against `gh pr create` Bash command extracts attribution shot count. Dedups via `parentSessionId` so subagents don't double-count.
- **`getAllSessionFiles()`** — projects dir + nested subagents dirs in parallel.
- **`aggregateClaudeCodeStats()`** — uses `withStatsCacheLock` (from `statsCache.ts`); split processing: cache + new days up to yesterday → save; today processed live.
- **`aggregateClaudeCodeStatsForRange('7d'|'30d'|'all')`** — bypasses cache for shorter ranges.
- **`calculateStreaks(dailyActivity)`** — current streak (back from today) + longest streak (Set lookup, day-diff scan). Returns start/end dates.
- **Provider coupling:** Anthropic-style `usage` shape (cache_read/cache_creation tokens). Reads SDK `ModelUsage` type. Skips synthetic model. **Hardcoded model strings:** none — `model` strings are read directly from message data.

### `statsCache.ts` (434 LOC)

- **Purpose:** Persisted disk cache (`<configHome>/stats-cache.json`) for stats aggregates that won't change. Bounded by days, models, hours (24).
- `STATS_CACHE_VERSION = 3`, `MIN_MIGRATABLE_VERSION = 1`.
- **`PersistedStatsCache`** type: `version, lastComputedDate, dailyActivity, dailyModelTokens, modelUsage, totalSessions, totalMessages, longestSession, firstSessionDate, hourCounts, totalSpeculationTimeSavedMs, shotDistribution?`.
- **In-memory single-flight lock** (`statsCacheLockPromise`) — `withStatsCacheLock(fn)` waits for any existing lock before proceeding.
- **Atomic write:** `<path>.<random8hex>.tmp` → write + `fh.sync()` → `rename`. Mode `0o600`.
- **Migration:** preserves historical aggregates that would otherwise be lost when transcript files age out past `cleanupPeriodDays`. `shotDistribution` undefined preservation forces recompute under `SHOT_STATS` feature.
- `mergeCacheWithNewStats(existing, newStats, lastComputedDate)` — combines daily activity (sums by date), tokens-by-model, modelUsage (max contextWindow / maxOutputTokens), session aggregates (longest, firstDate), hour counts.

### `streamlinedTransform.ts` (201 LOC)

- **Purpose:** Stateful transformer for `--output-format=streamlined`. Distillation-resistant format:
  - Text messages → `streamlined_text`. Counts reset.
  - Tool-only assistant messages → `streamlined_tool_use_summary` with cumulative-since-last-text counts.
  - Thinking blocks dropped. Init message tool list + model stripped.
- **Tool categories:** `searches (Grep, Glob, WebSearch, LSP)`, `reads (FileRead, ListMcpResources)`, `writes (FileWrite, FileEdit, NotebookEdit)`, `commands (shell tools, Tmux, TaskStop)`, `other`.
- Pluralization helper for nicer summaries: `searched 3 patterns, read 5 files, wrote 2 files, ran 7 commands`.
- Filters out `system, user, stream_event, tool_progress, auth_status, rate_limit_event, control_response, control_request, control_cancel_request, keep_alive` → `null`.

### `streamJsonStdoutGuard.ts` (123 LOC)

- **Purpose:** Wraps `process.stdout.write` for `--output-format=stream-json` mode. Buffers until `\n`, JSON-parses each line; if it parses, forward to original stdout; if not, divert to stderr tagged `[stdout-guard]` so SDK clients don't see corrupted NDJSON.
- `STDOUT_GUARD_MARKER = '[stdout-guard]'` — grep tag for log scrapers/tests.
- **Buffer flushed at shutdown** via `registerCleanup`. Empty lines tolerated as valid (NDJSON trailing newline / blank separator).
- Reuses original `write` callback signature (queueMicrotask-deferred).
- **Critical defense** against console.log slipping into NDJSON stream from dependencies/banners.

### `stream.ts` (76 LOC)

- **Purpose:** `Stream<T> implements AsyncIterator<T>`. Single-flight queue + waiter. `enqueue` resolves a pending `next()` waiter or pushes to queue. `done()` resolves remaining waiter to `{done:true}`. `error(e)` rejects pending. `return()` invokes `returned` callback.
- Iteration restricted: `started = true` flag throws on second iteration.
- **Reusable building block.**

### `stringUtils.ts` (235 LOC)

- **Exports:** `escapeRegExp`, `capitalize` (only first char, doesn't lowercase rest unlike lodash), `plural(n, word, pluralWord?)`, `firstLineOf` (no split), `countCharInString` (indexOf jumps), `normalizeFullWidthDigits`, `normalizeFullWidthSpace` (CJK IME), `safeJoinLines` (with truncation marker), `EndTruncatingAccumulator` class (max=2^25 chars; truncation marker `\n... [output truncated - NKB removed]`), `truncateToLines`.
- `MAX_STRING_LENGTH = 2^25` ≈ 32MB chars.
- **Reusable.**

### `subprocessEnv.ts` (99 LOC)

- **Purpose:** GitHub Actions secret scrubber for child processes (Bash, MCP stdio, LSP, hooks).
- **`GHA_SUBPROCESS_SCRUB`** list: `ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_FOUNDRY_API_KEY, ANTHROPIC_CUSTOM_HEADERS, OTEL_EXPORTER_OTLP_*HEADERS (4 vars), AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_BEARER_TOKEN_BEDROCK, GOOGLE_APPLICATION_CREDENTIALS, AZURE_CLIENT_SECRET, AZURE_CLIENT_CERTIFICATE_PATH, ACTIONS_ID_TOKEN_REQUEST_TOKEN, ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_RUNTIME_TOKEN, ACTIONS_RUNTIME_URL, ALL_INPUTS, OVERRIDE_GITHUB_TOKEN, DEFAULT_WORKFLOW_TOKEN, SSH_SIGNING_KEY`.
- **`GITHUB_TOKEN/GH_TOKEN` intentionally NOT scrubbed** — `gh.sh` wrappers need them; job-scoped.
- `INPUT_<NAME>` duplicates scrubbed (GHA auto-creates from `with:` inputs).
- `registerUpstreamProxyEnvFn(fn)` — late-binding for CCR upstreamproxy (HTTPS_PROXY + CA bundle).
- Gated on `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.
- **Provider coupling:** Anthropic + cloud-provider auth env names; Anthropic-specific subprocess hardening.

### `systemDirectories.ts` (74 LOC)

- **Purpose:** Cross-platform `HOME, DESKTOP, DOCUMENTS, DOWNLOADS`.
- Windows uses `USERPROFILE` env (handles localized folder names).
- Linux/WSL respects XDG: `XDG_DESKTOP_DIR`, `XDG_DOCUMENTS_DIR`, `XDG_DOWNLOAD_DIR`.
- macOS / unknown use defaults.

### `systemPrompt.ts` (123 LOC)

- **Purpose:** `buildEffectiveSystemPrompt({...})` priority:
  - 0. `overrideSystemPrompt` (e.g. loop mode) REPLACES all.
  - 1. Coordinator system prompt (`feature('COORDINATOR_MODE') + CLAUDE_CODE_COORDINATOR_MODE env + !mainThreadAgentDefinition`).
  - 2. Agent system prompt (built-in: `getSystemPrompt({toolUseContext})`; custom: `getSystemPrompt()`). In **proactive mode (`PROACTIVE | KAIROS`)**, agent prompt is APPENDED to default (`# Custom Agent Instructions\n...`) — same pattern as teammates.
  - 3. `customSystemPrompt` (`--system-prompt`).
  - 4. Default system prompt.
  - Plus `appendSystemPrompt` always at end (except override).
- Logs `tengu_agent_memory_loaded` with agent_type/scope/source for ant builds.

### `systemPromptType.ts` (14 LOC)

- **Purpose:** Branded type `SystemPrompt = readonly string[] & {__brand: 'SystemPrompt'}`. Dependency-free for unrestricted importing. `asSystemPrompt(value)` is just a cast.

### `systemTheme.ts` (119 LOC)

- **Purpose:** OSC 11 terminal background-color → `dark | light` resolver for `theme: 'auto'`.
- **`themeFromOscColor(data)`** — parses `rgb:R/G/B` (1–4 hex digits each, ITU-R BT.709 luminance) or `#RRGGBB`/`#RRRRGGGGBBBB`. Mid-split: > 0.5 = light.
- `parseOscRgb` accepts optional `rgba:.../.../.../.....` (alpha ignored).
- **`detectFromColorFgBg()`** — synchronous initial guess from `$COLORFGBG` env (rxvt convention: bg 0–6 or 8 dark; 7 + 9–15 light).
- **`resolveThemeSetting(setting)`** — `auto` → `getSystemThemeName()`, else `setting`.

### `taggedId.ts` (54 LOC)

- **Purpose:** Encode UUID → `tag_01<base58>` IDs matching API's `tagged_id.py`. Format: `{tag}_{version}{base58(uuid_as_128bit_int)}`.
- `BASE_58_CHARS` (Bitcoin alphabet); `VERSION = '01'`; `ENCODED_LENGTH = 22` (ceil(128/log2(58))).
- Reusable for round-trip with API IDs (`user_01PaGUP2rbg1XDh7Z9W1CEpd`).

### `tempfile.ts` (31 LOC)

- **Purpose:** `generateTempFilePath(prefix?, ext?, {contentHash?})`.
- **Important note** (`contentHash` use case): when path appears in content sent to Anthropic API (e.g. sandbox deny lists in tool descriptions), random UUID busts prompt cache prefix on every spawn. Use sha256(content) to make the path **stable across processes with same content**.

### `terminal.ts` (131 LOC)

- **Purpose:** Render output with line-based truncation for terminal display.
- `MAX_LINES_TO_SHOW = 3`, `PADDING_TO_PREVENT_OVERFLOW = 10`.
- `wrapText(text, wrapWidth)` — uses `sliceAnsi` and `stringWidth`. Special case: if `remainingLines === 1` shows it directly (avoids "+1 line" hint).
- `renderTruncatedContent(content, terminalWidth, suppressExpandHint?)` — early-truncates input (`maxChars = MAX_LINES * wrapWidth * 4`) so 64MB binary dumps don't cause O(n) wrap on 382K rows.
- `isOutputLineTruncated(content)` — fast-path: counts newlines via repeated `indexOf` (no terminal-width consideration).

### `textHighlighting.ts` (166 LOC)

- **Purpose:** `segmentTextByHighlights(text, highlights)` for ANSI-aware text decoration ranges.
- **`TextHighlight`:** `{start, end, color, dimColor?, inverse?, shimmerColor?, priority}`.
- **Conflict resolution:** sort highlights by start asc, priority desc; reject overlaps.
- **`HighlightSegmenter`** maintains dual position counters (visible vs string with ANSI codes). Carries forward active codes through segment boundaries — emits prefix codes + suffix `undoAnsiCodes`.
- **Reusable.**

### `theme.ts` (639 LOC)

- **Purpose:** Six themes (`dark, light, light-daltonized, dark-daltonized, light-ansi, dark-ansi`) plus `auto` resolved via systemTheme.ts.
- **`Theme` type** (~89 fields): `autoAccept, bashBorder, claude, claudeShimmer, claudeBlue_FOR_SYSTEM_SPINNER, permission*, planMode, ide, promptBorder*, text, inverseText, inactive*, subtle, suggestion, remember, background, success, error, warning, merged, warningShimmer, diffAdded/Removed/Word*, 8 agent colors (red_FOR_SUBAGENTS_ONLY etc.), professionalBlue (Grove), chromeYellow, clawd_body/background, userMessageBackground/Hover, messageActionsBackground, selectionBg, bashMessageBackgroundColor, memoryBackgroundColor, rate_limit_fill/empty, fastMode/Shimmer, briefLabelYou/Claude, 7 rainbow_* colors + shimmer pairs (for ultrathink keyword highlighting)`.
- **Hardcoded brand:** `claude: 'rgb(215,119,87)'` (Claude orange) — present in light + dark + light-daltonized swap (`rgb(255,153,51)` for deuteranopia).
- **ANSI variants** for terminals without truecolor: only 16 standard ANSI colors.
- `themeColorToAnsi(themeColor)` extracts opening escape sequence by chalk-rendering "X" and slicing before the X. Apple_Terminal forced to `Chalk({level:2})` (256-color) — Apple Terminal mishandles 24-bit color sequences.

### `thinking.ts` (162 LOC)

- **Purpose:** Thinking mode config + adaptive-thinking detection + ultrathink keyword highlighting.
- **`ThinkingConfig`:** `{type:'adaptive'} | {type:'enabled', budgetTokens} | {type:'disabled'}`.
- **`isUltrathinkEnabled()`** — `feature('ULTRATHINK')` build flag + GrowthBook `tengu_turtle_carbon` runtime gate.
- **`hasUltrathinkKeyword`/`findThinkingTriggerPositions`** — `\bultrathink\b/i`. **Comment** notes fresh `/g` regex per call to avoid `String.prototype.matchAll`'s lastIndex leak from `.test()`.
- **`modelSupportsThinking(model)`:** 1P/Foundry → all Claude 4+ (excludes `claude-3-`). 3P (Bedrock/Vertex) → only `sonnet-4` or `opus-4` substrings. 3P override via `get3PModelCapabilityOverride`.
- **`modelSupportsAdaptiveThinking(model)`:** subset — `opus-4-6` or `sonnet-4-6` only on canonical name. Other opus/sonnet/haiku → false. Default true for unknown 1P/Foundry strings (because Foundry is a proxy and newer 4.6+ models are trained on adaptive thinking).
- **`shouldEnableThinkingByDefault()`:** `MAX_THINKING_TOKENS` env > 0, `settings.alwaysThinkingEnabled !== false`, default true.
- **Critical comments** (lines 100, 131, 156): "Do not change ... without notifying the model launch DRI and research" — degrades model quality.
- **Provider coupling:** Provider-aware thinking detection. References `claude-3, sonnet-4, opus-4, opus-4-6, sonnet-4-6` strings — these are pattern matches, not hardcoded model IDs (uses canonical name). **Hardcoded model substring matches:** `claude-3-`, `sonnet-4`, `opus-4`, `opus-4-6`, `sonnet-4-6`, `opus`, `sonnet`, `haiku`.

### `timeouts.ts` (39 LOC)

- **Purpose:** `BASH_DEFAULT_TIMEOUT_MS = 120_000` (2min), `BASH_MAX_TIMEOUT_MS = 600_000` (10min). Env overrides parsed; max enforced ≥ default.

### `tokenBudget.ts` (73 LOC)

- **Purpose:** Parse user-typed token budgets from text. `parseTokenBudget(text)` accepts:
  - `+500k` / `+1m` / `+2.5b` (anchored start/end).
  - `use 2M tokens` / `spend 1.5b tokens` (verbose, anywhere).
- **Why `\s` not lookbehind:** `(?<=\s)` defeats YARR JIT in JSC; capture whitespace and offset `index += 1`.
- `findTokenBudgetPositions` — for syntax highlighting in input.
- `getBudgetContinuationMessage(pct, turnTokens, budget)` — "Stopped at NN% of token target (X / Y). Keep working — do not summarize."

### `tokens.ts` (261 LOC)

- **Purpose:** Token usage extraction from message stream + canonical context-window measurement.
- `getTokenUsage(message)` — strips synthetic messages.
- `getTokenCountFromUsage(usage)` — `input + cache_creation + cache_read + output`.
- `tokenCountFromLastAPIResponse` / `messageTokenCountFromLastAPIResponse` (output only).
- **`finalContextTokensFromLastResponse(messages)`** — final context window from `usage.iterations[-1].input + output` (server-side tool loops). Falls back to top-level `input + output` (no cache). Server's budget countdown is context-based, not billing.
- **`tokenCountWithEstimation`** — CANONICAL function. Walks back from end, finds first usage-bearing record. **Critical edge case:** parallel tool calls split into multiple AssistantMessages with same `message.id`; walks back to FIRST sibling so all interleaved tool_results are counted. Uses `roughTokenCountEstimationForMessages(messages.slice(i+1))`.
- `doesMostRecentAssistantMessageExceed200k` — threshold 200k.
- `getAssistantMessageContentLength` — char count for spinner token estimation (`chars/4 ≈ tokens`). Counts `text + thinking + redacted_thinking.data + tool_use input(stringified)`. Excludes `signature_delta`.
- **Provider coupling:** Anthropic SDK `BetaUsage` type. `iterations` field cast (Stainless types don't include it).

### `toolErrors.ts` (132 LOC)

- **Purpose:** Format `Error → string` for tool-result stream. Includes `ShellError` exit-code formatting, `AbortError` interrupt sentinel.
- Truncates >10000 char messages by keeping 5000 head + 5000 tail with `... [N characters truncated] ...` middle.
- **`formatZodValidationError(toolName, ZodError)`** — converts Zod errors to LLM-friendly text:
  - Missing params: `The required parameter \`name\` is missing`.
  - Unrecognized keys: `An unexpected parameter \`x\` was provided`.
  - Type mismatches: `The parameter \`y\` type is expected as \`X\` but provided as \`Y\``.
  - Joins with `\n`. Path formatting: `todos[0].activeForm` (numbers in brackets).

### `toolPool.ts` (79 LOC)

- **Purpose:** Merge two tool pools, apply MCP-suffix-based PR-activity-allowlist + coordinator-mode filter.
- **`PR_ACTIVITY_TOOL_SUFFIXES = ['subscribe_pr_activity', 'unsubscribe_pr_activity']`** — these MCP tools always pass through (orchestration).
- `mergeAndFilterTools(initial, assembled, mode)` — `uniqBy('name')`, then `partition` into `mcp` vs `builtIn`, then sort each by name. Built-ins must stay a contiguous prefix for server cache policy.
- `applyCoordinatorToolFilter(tools)` — keeps `COORDINATOR_MODE_ALLOWED_TOOLS.has(t.name)` or `isPrActivitySubscriptionTool(t.name)`.
- React-free file so SDK module graph stays clean.

### `toolSchemaCache.ts` (26 LOC)

- **Purpose:** Session-scoped `Map<string, BetaTool & {strict?, eager_input_streaming?}>` for rendered tool schemas.
- **Cache rationale (commented):** Tool schemas render at server position 2 (before system prompt) — any byte change busts ~11K-token tool block + everything downstream. GB gate flips, MCP reconnects, dynamic content all bust without this. Locks bytes at first render.
- Leaf module — auth.ts can clear without import cycle (plans → settings → file → growthbook → config → bridgeEnabled → auth would cycle).

### `transcriptSearch.ts` (202 LOC)

- **Purpose:** Search-cache for `/search` slash command in chat transcript. WeakMap-cached (messages immutable, append-only) lowercased text.
- Why lowercase at cache time: caller `.toLowerCase()`d on every keystroke, re-lowering ~1.5MB on every keystroke (the backspace hang).
- **`renderableSearchText(msg)`** — flattens `RenderableMessage`:
  - `user`: skips sentinel `INTERRUPT_MESSAGE` strings (would phantom-match `terr` → `interrupted`); for `tool_result` blocks, **uses `toolResultSearchText(msg.toolUseResult)` (the tool's native Out)** NOT `b.content` (which adds system-reminders / persisted-output wrappers / cyber-risk reminders that the UI never displays).
  - `assistant`: `text` blocks + `tool_use(input)`-via-`toolUseSearchText` (renders as `⏺ Bash(cmd)`). Skips `thinking`.
  - `attachment.relevant_memories`: full content joined.
  - `attachment.queued_command`: prompt text (skips `task-notification` mode + `isMeta`).
  - `collapsed_read_search.relevantMemories`.
- Strips `<system-reminder>...</system-reminder>` runs.
- **`toolUseSearchText(input)`** — duck-type allowlist: `command, pattern, file_path, path, prompt, description, query, url, skill`. Plus arrays `args, files`. Under-count vs phantom strategy.
- **`toolResultSearchText(r)`** — Bash `{stdout, stderr}`, Read `{file:{content}}`, allowlisted `content, output, result, text, message`, arrays `filenames, lines, results`.

### `treeify.ts` (170 LOC)

- **Purpose:** Custom treeify (based on `notatestuser/treeify`) with Ink theme color support + circular ref guard (WeakSet).
- Tree chars: `figures.lineUpDownRight` (`├`), `lineUpRight` (`└`), `lineVertical` (`│`).
- `TreeifyOptions`: `showValues, hideFunctions, useColors, themeName, treeCharColors`.
- Arrays summarized as `[Array(N)]`, functions as `[Function]`, special-case for empty key string.

### `truncate.ts` (179 LOC)

- **Purpose:** Width-aware (uses `ink/stringWidth`) grapheme-safe truncation for terminal display.
- **`truncatePathMiddle`** — `src/components/…/MyComponent.tsx` style. Filename + ellipsis + truncated dir; recovers when filename alone exceeds width by truncating from start.
- `truncateToWidth(text, maxWidth)` — appends `…`. Splits on `getGraphemeSegmenter()` boundaries (Intl.Segmenter for proper emoji/CJK/surrogate pair handling).
- `truncateStartToWidth` — prepend `…`, walk backward.
- `truncateToWidthNoEllipsis` — for callers that add their own separator.
- `truncate(str, maxWidth, singleLine?)` — `singleLine: true` truncates at first `\n` and appends `…`.
- `wrapText(text, width)` — grapheme-safe line wrapping.

### `telemetryAttributes.ts` (71 LOC)

- **Purpose:** OpenTelemetry attribute building. Returns OTel `Attributes` map.
- Always: `user.id`. Conditional: `session.id` (default true), `app.version` (default false), `organization.id`, `user.email`, `user.account_uuid`, `user.account_id`, `terminal.type`.
- Cardinality controlled by env: `OTEL_METRICS_INCLUDE_SESSION_ID, OTEL_METRICS_INCLUDE_VERSION, OTEL_METRICS_INCLUDE_ACCOUNT_UUID`.
- `user.account_id` from `CLAUDE_CODE_ACCOUNT_TAGGED_ID` env or `toTaggedId('user', accountUuid)`.

### `teamDiscovery.ts` (81 LOC)

- **Purpose:** Scan `~/.claude/teams/` for teams. `getTeammateStatuses(teamName)` reads team file, excludes `team-lead`, computes `running | idle` from `member.isActive`.
- **`TeammateStatus`** type: `name, agentId, agentType, model, prompt, status, color, idleSince, tmuxPaneId, cwd, worktreePath, isHidden, backendType, mode`.

### `teammate.ts` (292 LOC)

- **Purpose:** Identify whether this Claude Code is running as swarm teammate. Identity priority: AsyncLocalStorage (`teammateContext`) > `dynamicTeamContext` (tmux teammates via CLI args) > env vars.
- **Functions:** `getParentSessionId, getAgentId, getAgentName, getTeamName(teamContext?), isTeammate, getTeammateColor, isPlanModeRequired, isTeamLead(teamContext)`.
- `dynamicTeamContext` set via `setDynamicTeamContext` (when joining team at runtime). `clearDynamicTeamContext` on leave.
- **`hasActiveInProcessTeammates(appState)`**, **`hasWorkingInProcessTeammates`** (running but not idle).
- **`waitForTeammatesToBecomeIdle(setAppState, appState)`** — promise that resolves when all working teammates become idle. Registers `onIdle` callbacks on each task, handles race where teammate became idle between snapshot and registration (calls `onIdle` immediately if `task.isIdle`).
- `isTeamLead(teamContext)` — `myAgentId === leadAgentId` or backwards-compat (no agent ID + has team context = original lead).
- `isPlanModeRequired()` — falls back to `CLAUDE_CODE_PLAN_MODE_REQUIRED` env.

### `teammateContext.ts` (96 LOC)

- **Purpose:** AsyncLocalStorage-based context for in-process teammates (concurrent execution without global state conflicts).
- **`TeammateContext`:** `agentId, agentName, teamName, color?, planModeRequired, parentSessionId, isInProcess: true (discriminator), abortController`.
- `runWithTeammateContext(ctx, fn)`, `getTeammateContext()`, `isInProcessTeammate()`.
- `createTeammateContext(config)` adds `isInProcess: true`.

### `teamMemoryOps.ts` (88 LOC)

- **Purpose:** Detect team memory file access. `isTeamMemorySearch`, `isTeamMemoryWriteOrEdit(toolName, input)`.
- **`appendTeamMemorySummaryParts`** — verb agreement based on `isActive` (Recalling/Recalled, Searching/Searched, Writing/Wrote) and `parts.length === 0` (capitalize first part). Pluralizes "memory/memories".

### `pdf.ts` (300 LOC)

- **Purpose:** PDF readout for FileReadTool. Two paths: native PDF document blocks (base64) for supported models; pdftoppm-based JPEG page extraction for older models / large files.
- `PDFError.reason: 'empty' | 'too_large' | 'password_protected' | 'corrupted' | 'unknown' | 'unavailable'`.
- `readPDF(filePath)` validates **PDF magic bytes** (`%PDF-`) — defends against HTML files renamed to `.pdf` that would corrupt conversation: once an invalid PDF document block is in message history, every subsequent API call fails with 400 and session is unrecoverable without `/clear`.
- Size limits from `apiLimits.ts`: `PDF_TARGET_RAW_SIZE`, `PDF_MAX_EXTRACT_SIZE`. API has 32MB total request limit; base64 grows ~33%; PDF must be <~20MB raw.
- `extractPDFPages` uses `pdftoppm -jpeg -r 100 -f firstPage -l lastPage`. Output to `<toolResultsDir>/pdf-<uuid>/page-NN.jpg`.
- **`getPDFPageCount`** uses `pdfinfo`.
- `pdftoppmAvailable` cached for process lifetime; `--v` test (some versions exit 99 with version info on stderr).

### `pdfUtils.ts` (70 LOC)

- **Purpose:** Page-range parser and PDF support check.
- `parsePDFPageRange(text)`: `"5"`, `"1-10"`, `"3-"` (open-ended → Infinity).
- **`isPDFSupported()`** — `!getMainLoopModel().toLowerCase().includes('claude-3-haiku')`. Comment: "Haiku 3 is the only remaining model that predates PDF support." All providers (1P/Vertex/Bedrock/Foundry) support PDF blocks.
- **Hardcoded model substring:** `claude-3-haiku` (in lowercase model match).

### `plans.ts` (397 LOC)

- **Purpose:** Plan-mode plan file persistence at `<configHome>/plans/<word-slug>.md` (or per-session `<word-slug>-agent-<agentId>.md` for subagents).
- **Word slugs** from `generateWordSlug()` retried up to `MAX_SLUG_RETRIES = 10` against existing files.
- `setPlanSlug, clearPlanSlug, clearAllPlanSlugs` for `/clear` and resume flows.
- **`getPlansDirectory` (memoized!)** — settings `plansDirectory` (relative, must stay within cwd — path traversal check) or `<configHome>/plans/`. Memoization avoids re-`mkdirSync` per render (regressed in #20005).
- `copyPlanForResume(log, targetSessionId)` — sets slug from log, ENOENT recovery via `findFileSnapshotEntry` (file-snapshot system messages) or `recoverPlanFromMessages` (ExitPlanMode tool_use input → user.planContent → attachment.plan_file_reference). Only attempts recovery in remote sessions (CCR) where files don't persist.
- `copyPlanForFork(log, target)` — generates NEW slug for forked session (don't reuse — would clobber).
- `persistFileSnapshotIfRemote()` — incrementally writes plan content into transcript as `system{subtype:'file_snapshot', snapshotFiles:[{key,path,content}]}` for CCR sessions where local files don't persist.

### `status.tsx` (361 LOC) — partial

- **Purpose:** Build property/diagnostic arrays for the `/status` slash command.
- Imports: account, memory, doctor diagnostic, AWS region, vertex region, IDE, model, MCP, mTLS, native installer, proxy, sandbox, settings, theme.
- **`buildSandboxProperties()`** — ant-only; shows "Bash Sandbox Enabled/Disabled".
- **`buildIDEProperties(mcpClients, ideInstallationStatus, theme)`** — Connected/Installed/Error states; version mismatch detection (`installedVersion !== ideClient.serverInfo?.version`); JetBrains plugin/extension naming.
- **`buildMcpProperties(clients, theme)`** — summarizes 20+ servers as `N connected, N need auth, N pending, N failed · /mcp` (instead of full list which would dominate the pane).
- `buildMemoryDiagnostics()` — flags memory files exceeding `MAX_MEMORY_CHARACTER_COUNT` from `claudemd`.
- (Remaining ~240 LOC contains other diagnostic builders for proxy/mTLS/AWS/GCP/sandbox/auth/policy/settings.)

### `statusNoticeDefinitions.tsx` (197 LOC) — not fully read

- **Purpose (inferred from filename + sibling helpers):** Static notice definitions (warnings, info banners) that appear at top of status pane.

### `statusNoticeHelpers.ts` (20 LOC)

- **Purpose:** `AGENT_DESCRIPTIONS_THRESHOLD = 15_000`. `getAgentDescriptionsTotalTokens(agentDefinitions)` sums `roughTokenCountEstimation(<agentType>: <whenToUse>)` across non-built-in active agents — used to warn when custom-agent context bloat hits threshold.

### `terminalPanel.ts` (191 LOC)

- **Purpose:** Built-in terminal panel toggled with `Meta+J`. Uses tmux for shell persistence (per-instance socket `claude-panel-<sessionId.slice(0,8)>`).
- **Pattern:** Meta+J binds to `detach-client` inside tmux → press to return to Claude while shell keeps running. Next toggle re-attaches same session.
- Falls back to non-persistent shell via `spawnSync` if tmux unavailable.
- **Custom status bar** inside tmux: `Alt+J to return to Claude` (right side).
- Cleanup: `kill-server` on exit (detached + unref so it doesn't block gracefulShutdown serialization).
- Uses `inkInstance.enterAlternateScreen` (same pattern as `promptEditor.ts`).

### `tasks.ts` (862 LOC) — summary (key patterns)

- **Purpose:** File-backed Task store at `<configHome>/tasks/<taskListId>/<id>.json` for cross-session/swarm coordination.
- **`Task` schema:** `{id, subject, description, activeForm?, owner?, status: pending|in_progress|completed, blocks: string[], blockedBy: string[], metadata?}`.
- **`getTaskListId()` priority:** `CLAUDE_CODE_TASK_LIST_ID` env > in-process teammate's team name > `getTeamName()` > `leaderTeamName` > `getSessionId()`. So in-process teammates share leader's task list.
- **High water mark file** (`.highwatermark`) — `findHighestTaskId = max(filesystem, hwm)` so task IDs don't reuse after delete.
- **File locking** via `proper-lockfile`: `retries=30, minTimeout=5ms, maxTimeout=100ms` (~2.6s total wait) — sized for 10+ concurrent swarm agents.
- **`sanitizePathComponent(input)`** = `input.replace(/[^a-zA-Z0-9_-]/g, '-')` — used by `tasks.ts` AND `teammateMailbox.ts`. Path-traversal hardening.
- `notifyTasksUpdated()` `Signal` for in-process UI refresh.
- `isTodoV2Enabled()` — force-on via `CLAUDE_CODE_ENABLE_TASKS` or non-interactive.
- **Status migration (ant-only):** `open → pending`, `resolved → completed`, `planning|implementing|reviewing|verifying → in_progress`.
- (Remaining ~700 LOC implements `createTask, getTask, updateTask, deleteTask, listTasks` — all locked, schema-validated, with notifyTasksUpdated emit.)

### `teammateMailbox.ts` (1183 LOC) — high-LOC, summary

- **Purpose:** File-based messaging between agent swarm members. Inbox at `~/.claude/teams/<team>/inboxes/<agent>.json`.
- **`TeammateMessage`:** `{from, text, timestamp, read, color?, summary?}`.
- **API:** `getInboxPath, readMailbox, readUnreadMessages, writeToMailbox, markMessageAsReadByIndex, markMessagesAsRead`.
- **File lock pattern:** `lockfilePath = ${inboxPath}.lock`; `LOCK_OPTIONS = {retries: 10, minTimeout: 5, maxTimeout: 100}`.
- **`writeFile(path, '[]', {flag: 'wx'})` first** to ensure file exists before locking (proper-lockfile requires it).
- `sanitizePathComponent` (imported from `tasks.ts`) — path traversal defense.
- (Remaining ~1000 LOC implements transport-style send/receive APIs, attachment construction wrapping `<teammate-message>...</teammate-message>` XML, summary generation via Haiku, request_id correlation, plus various status/management helpers.)

### `toolResultStorage.ts` (1040 LOC) — high-LOC, partial

- **Purpose:** Persist large tool results to disk so the model gets a preview + filepath instead of a 50K-token blob.
- **Key constants from `toolLimits.ts`:** `BYTES_PER_TOKEN`, `DEFAULT_MAX_RESULT_SIZE_CHARS`, `MAX_TOOL_RESULT_BYTES`, `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS`. `PREVIEW_SIZE_BYTES = 2000`.
- **`PERSISTED_OUTPUT_TAG/CLOSING_TAG`** = `<persisted-output>`/`</persisted-output>`. Wrapper for the model-facing reference message.
- **`TOOL_RESULT_CLEARED_MESSAGE = '[Old tool result content cleared]'`** — when content was cleared without persisting.
- **`getPersistenceThreshold(toolName, declaredMaxResultSizeChars)`:**
  - GrowthBook flag `tengu_satin_quoll` (override map: `tool name → threshold chars`). Wins when present + valid.
  - **Infinity = hard opt-out**: tool reads itself back and a file write would be circular. Checked before GB override.
  - Fallback: `Math.min(declared, DEFAULT_MAX_RESULT_SIZE_CHARS)` — caps at 50k.
- **`persistToolResult(content, toolUseId)`** — writes to `<projectDir>/<sessionId>/tool-results/<id>.<json|txt>` with **`flag: 'wx'`** (skip if exists — microcompact replays original messages without re-writing).
- **`buildLargeToolResultMessage(result)`** — `<persisted-output>\nOutput too large (NMB). Full output saved to: <path>\n\nPreview (first 2KB):\n<preview>\n...\n</persisted-output>`.
- (Remaining ~840 LOC handles content replacement records, microcompact dehydration, transcript GC, oversized-message routing, ContentBlockParam transforms.)

### `toolSearch.ts` (756 LOC) — high-LOC, partial

- **Purpose:** Three modes for deferrable tools (MCP + `shouldDefer`):
  - **`tst`** — Tool Search Tool always enabled; deferred tools discovered via `ToolSearchTool`.
  - **`tst-auto`** — auto-defer when total deferred tool tokens exceed threshold.
  - **`standard`** — disabled; all tools inline.
- `ENABLE_TOOL_SEARCH=auto|auto:N` env var (N% of context window, default 10%).
- `getAutoToolSearchTokenThreshold(model)` = `floor(contextWindow(model) * percentage)`.
- `CHARS_PER_TOKEN = 2.5` fallback chars heuristic when token-counting API unavailable.
- **Memoized** `getDeferredToolTokenCount` — keyed by deferred tool names (joined by comma); cache invalidated on MCP connect/disconnect.
- (Remaining ~600 LOC implements ToolSearchTool integration: deferral negotiation, dynamic loading, query handling.)

### `teleport.tsx` (1225 LOC) — high-LOC, partial

- **Purpose:** Resume a Claude Code session from another machine via session_ingress API. Fetches session logs + git bundle + branch.
- **Flow steps:** `'validating' | 'fetching_logs' | 'fetching_branch' | 'checking_out' | 'done'`.
- **`generateTitleAndBranch(description, signal)`** — uses `queryHaiku` with JSON schema for `{title, branch}`. Branch always `claude/...` lowercase dashes. Uses `SESSION_TITLE_AND_BRANCH_PROMPT` (lines 76-91): "≤6 words sentence-case title; ≤4 words branch; `claude/` prefix".
- **Fallbacks:** `truncateToWidth(description, 75)` for title; `claude/task` for branch.
- **Uses `queryHaiku`** for title generation — Haiku-tier model.
- (Remaining ~1100 LOC implements session sync flow: oauth checks, conversation deserialization, git operations via `git.ts` helpers, environment fetching, repository auto-detection, error wrapping in `TeleportOperationError`.)

### `ripgrep.ts` (679 LOC) — partial

- **Purpose:** Wrap ripgrep binary. **Three modes:**
  - **`system`** (`USE_BUILTIN_RIPGREP=false`): use `rg` from PATH.
  - **`builtin`** (default): vendored binary at `vendor/ripgrep/<arch>-<platform>/rg[.exe]`.
  - **`embedded`** (bundled native mode): `process.execPath` with `argv0='rg'` — ripgrep statically compiled into bun-internal, dispatches on argv[0]; spawn ourselves with override.
- **Security:** When `mode === 'system'`, command is hardcoded `'rg'` (not the resolved path) so PATH hijacking fails (`./rg.exe` in cwd can't sneak in). Uses Windows `NoDefaultCurrentDirectoryInExePath` protection.
- `MAX_BUFFER_SIZE = 20_000_000` (20MB) — large monorepos can have 200k+ files.
- **EAGAIN retry**: detects `os error 11` / `Resource temporarily unavailable` (resource-constrained Docker/CI). Retries with `singleThread = true` (`-j 1`).
- `RipgrepTimeoutError` — distinguishes "no matches" from "timed out".
- WSL has 3-5× perf penalty; default timeout 60s on WSL vs 20s elsewhere. `CLAUDE_CODE_GLOB_TIMEOUT_SECONDS` env override.
- (Remaining ~530 LOC implements the wrapped exec functions: `ripGrepRaw, ripGrep, ripGrepListFiles, ripGrepFileContent` with stdout/stderr buffer truncation, error hardening.)

### `tmuxSocket.ts` (427 LOC) — partial

- **Purpose:** Isolated tmux socket `claude-<PID>` so Claude's tmux operations don't affect user's tmux sessions.
- **All Tmux tool commands AND all Bash tool subprocess `TMUX` env var point at this isolated socket**, so even `tmux kill-session` via Bash can't kill user's session.
- Windows: routes through WSL with `wsl -e tmux ...` (`-e` execs tmux directly without login shell — bash would eat `#` characters in `display-message -p '#{...}'`).
- Lazy initialization with `initPromise` mutex.
- (Remaining ~300 LOC contains tmux-server lifecycle: launch, hold-server-pid, attach, detach, cleanup.)

---

## Top-level summary

### Top findings

1. **Multi-tier privacy-by-env model.** `privacyLevel.ts` defines `default | no-telemetry | essential-traffic`, gated by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC > DISABLE_TELEMETRY > default`. `releaseNotes.ts`, `sanitization.ts` (always-on), `subprocessEnv.ts` (GHA secret scrub), `streamJsonStdoutGuard.ts` form a layered defense: traffic gate → secret scrub → input sanitization → output safety. **Reusable for any product with telemetry / managed agent boundary.**
2. **Memoized session-scoped caches with intentional cache-key alignment.** `toolSchemaCache.ts` (locked at first render → mid-session GB refreshes don't bust ~11K-token tool block), `tempfile.ts` `contentHash` option (stable path across processes for prompt-cache prefix stability), `sessionTitle.ts` re-uses parent context cache by inheriting `thinkingConfig` (cache key part), `tokens.ts` walks back through siblings sharing same `message.id` for parallel-tool-call usage measurement. **Pattern: cache-keyed thinking is a shared design discipline across the entire utils tree.**
3. **Hardcoded model substring matches still exist.** `pdfUtils.ts:60` `claude-3-haiku`; `thinking.ts:107-128` `claude-3-`, `sonnet-4`, `opus-4`, `opus-4-6`, `sonnet-4-6`, plus generic `opus|sonnet|haiku`. These are **canonical-name pattern matches** (not raw model IDs from `models.json`), but for AGI Workforce — which spans 12+ providers — these gates should be re-modeled as `ProviderCapability` flags emitted by adapters, not substring tests, per project rule `rule-models-json.md`.
4. **File-based swarm coordination.** Tasks (`tasks.ts:1-862`), inboxes (`teammateMailbox.ts:1-1183`), team discovery (`teamDiscovery.ts`), team memory (`teamMemoryOps.ts`), AsyncLocalStorage in-process context (`teammateContext.ts`) plus `dynamicTeamContext` (`teammate.ts`) form a coherent multi-process+in-process agent coordination system. All use `proper-lockfile` with retry budgets sized for 10+ concurrent agents (~2.6s tail latency) and `sanitizePathComponent(input)` for path-traversal hardening. **Reusable as the foundation for AGI Workforce's multi-agent coordination.**

### Top reusable patterns

1. **Generation-keyed query lifecycle (`QueryGuard.ts`).** Three states (`idle | dispatching | running`) with monotonic `generation` counter. `tryStart()` returns the generation; `end(generation)` returns `false` if a newer query started, so stale `finally` blocks from cancelled queries don't double-cleanup. `useSyncExternalStore`-compatible `subscribe`/`getSnapshot` exposes liveness without React state batching delays. Drop-in reusable for any sync external store with cancellable async work.
2. **Tagged-template slow-op timing with build-flag DCE (`slowOperations.ts`).** `using _ = slowLogging\`structuredClone(${value})\``— Symbol.dispose lazy-build description. Ant builds get`AntSlowLogger`(deferred`.stack`formatting); external builds get`NOOP_LOGGER`(zero alloc, zero work). DCE compresses to no-op in external builds. Pairs with`JSON.stringify`/`structuredClone`/`fs.writeFileSync`wrappers and`addSlowOperation` → DevBar warnings. **Pattern is the cleanest "instrument everywhere, pay only when sampled" implementation I've seen.**
3. **Two-pass file scanner with chunk straddle (`readEditContext.ts`).** 8KB chunks, overlap = `needleLen + nlCount - 1` bytes copied to next read. Lazy-encode CRLF needle on miss (cheap when files are pure-LF). Bounded scan (`MAX_SCAN_BYTES = 10MB`). Streaming-style ergonomics, file-state-cache friendly. Used both for editing context and the multi-edit `readCapped` path. **Excellent pattern for file searches that don't fit into ripgrep's domain.**

### Provider-coupling and model-ID flags

| File                            | Coupling/Flag                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pdfUtils.ts:60`                | Hardcoded substring `claude-3-haiku`                                                                        |
| `thinking.ts:107-128`           | Hardcoded substrings `claude-3-`, `sonnet-4`, `opus-4`, `opus-4-6`, `sonnet-4-6`, `opus`, `sonnet`, `haiku` |
| `releaseNotes.ts:28-31`         | GitHub URL `anthropics/claude-code` (brand)                                                                 |
| `preflightChecks.tsx:21`        | Anthropic `${BASE_API_URL}/api/hello` + `${TOKEN_URL.origin}/v1/oauth/hello`                                |
| `proxy.ts:288-305`              | `ANTHROPIC_UNIX_SOCKET` env tunnels through `claude ssh` auth proxy hardcoded to api.anthropic.com          |
| `sessionIngressAuth.ts:115-130` | `sk-ant-sid` cookie key, `X-Organization-Uuid` header                                                       |
| `sideQuery.ts`                  | Anthropic SDK direct (`client.beta.messages.create`), `getCLISyspromptPrefix`                               |
| `sideQuestion.ts`               | Anthropic-style content blocks (`[thinking, text]` per-block messages)                                      |
| `sessionTitle.ts:87`            | `queryHaiku` Anthropic Haiku                                                                                |
| `subprocessEnv.ts:18-52`        | Anthropic + cloud-provider auth env names (scrub list)                                                      |
| `tokens.ts:1`                   | Anthropic SDK `BetaUsage` type, `iterations` cast                                                           |
| `toolSchemaCache.ts:1`          | Anthropic SDK `BetaTool` type                                                                               |
| `teleport.tsx:107`              | `queryHaiku` Anthropic Haiku for title+branch generation                                                    |
| `theme.ts:118-191`              | `claude: 'rgb(215,119,87)'` brand color                                                                     |
| `planModeV2.ts:14-29`           | Anthropic-style subscription tiers (`max + default_claude_max_20x → 3` agent count)                         |
| `stats.ts`                      | Anthropic-style usage shape (`cache_read_input_tokens`, `cache_creation_input_tokens`)                      |
| `streamlinedTransform.ts`       | Anthropic-style content blocks                                                                              |
| `queryHelpers.ts:1`             | Anthropic SDK `ToolUseBlock`                                                                                |
| `releaseNotes.ts`               | Anthropic version-string parsing                                                                            |

### Hardcoded GrowthBook flags discovered

- `tengu_plan_mode_interview_phase`
- `tengu_pewter_ledger`
- `tengu_turtle_carbon` (ultrathink)
- `tengu_satin_quoll` (toolResultStorage persist threshold override)
- `tengu_tool_pear`, `tengu_fgts` (referenced as cache-bust triggers in `toolSchemaCache.ts`)

### Hardcoded environment variable namespace

The `CLAUDE_CODE_*` namespace is heavily used; partial inventory from this scope:

- `CLAUDE_CODE_SHELL` (Shell.ts override)
- `CLAUDE_CODE_TMPDIR` (Shell.ts sandbox tmp)
- `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` (proxy.ts)
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_TELEMETRY`
- `CLAUDE_CODE_PROFILE_QUERY`, `CLAUDE_CODE_PROFILE_STARTUP`
- `CLAUDE_CODE_REMOTE`, `CLAUDE_CODE_CONTAINER_ID` (queryHelpers progress emit)
- `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES` (sessionActivity)
- `CLAUDE_CODE_SESSION_ACCESS_TOKEN`, `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR`, `CLAUDE_SESSION_INGRESS_TOKEN_FILE` (sessionIngressAuth)
- `CLAUDE_CODE_ORGANIZATION_UUID` (sessionIngressAuth)
- `CLAUDE_CODE_PLAN_V2_AGENT_COUNT`, `CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT`, `CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE` (planModeV2)
- `CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS` (slowOperations)
- `CLAUDE_CODE_COORDINATOR_MODE` (systemPrompt)
- `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (subprocessEnv)
- `CLAUDE_CODE_TASK_LIST_ID`, `CLAUDE_CODE_TEAM_NAME`, `CLAUDE_CODE_AGENT_ID`, `CLAUDE_CODE_PLAN_MODE_REQUIRED`, `CLAUDE_CODE_ENABLE_TASKS` (tasks/teammate)
- `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS` (sessionState — opt-in, breaks CCR clients still)
- `CLAUDE_CODE_GLOB_TIMEOUT_SECONDS` (ripgrep)
- `CLAUDE_CODE_ACCOUNT_TAGGED_ID` (telemetryAttributes)
- `CLAUDE_CODE_SESSION_ID` (Shell.ts ant-only env passthrough)
- `MAX_THINKING_TOKENS` (thinking.ts)
- `BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`, `BASH_MAX_OUTPUT_LENGTH` (timeouts.ts)
- `ENABLE_TOOL_SEARCH` (toolSearch — `auto`/`auto:N`)
- `USER_TYPE === 'ant'` (gate; persistent across many files)
- `USE_BUILTIN_RIPGREP` (ripgrep)
- `CLAUDE_ENV_FILE` (sessionEnvironment — venv/conda activate persistence)

### Files NOT fully read (PARTIAL — covered by summary):

- `stats.ts` (1061 LOC) — read in full but with summary
- `toolResultStorage.ts` (1040 LOC) — first 200 lines read; summary inferred
- `toolSearch.ts` (756 LOC) — first 160 lines read; summary inferred
- `teammateMailbox.ts` (1183 LOC) — first 280 lines read; summary inferred
- `tasks.ts` (862 LOC) — first 350 lines read; summary inferred
- `teleport.tsx` (1225 LOC) — first 120 lines read; summary inferred
- `ripgrep.ts` (679 LOC) — first 150 lines read; summary inferred
- `tmuxSocket.ts` (427 LOC) — first 120 lines read; summary inferred
- `statusNoticeDefinitions.tsx` (197 LOC) — not read; inferred from filename + helper
- `status.tsx` (361 LOC) — first 120 lines read; summary inferred
