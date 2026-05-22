# U3 — `~/Desktop/reference/src/utils/` direct files O–Z

> **Scope.** All `*.ts` / `*.tsx` files in `~/Desktop/reference/src/utils/` whose basename starts with O–Z, **excluding** `sessionStorage.ts` (owned by M3).
> **Started.** 2026-05-08 22:12.
> **Author.** Agent U3 of 30. Cite file:line.
> **File totals.** 120 files in scope, ~22,500 LOC. Largest: `worktree.ts` 1,519, `teleport.tsx` 1,225, `teammateMailbox.ts` 1,183, `stats.ts` 1,061, `toolResultStorage.ts` 1,040, `tasks.ts` 862, `words.ts` 800, `sessionStoragePortable.ts` 793, `toolSearch.ts` 756, `ripgrep.ts` 679, `theme.ts` 639.
> **Cross-reference.** Inventory items resolved against `tasks/research/anthropic-claude-suite-may-2026.md` (Anthropic Claude Suite, May 2026).

---

## 0. How to read this file

Findings are appended in alphabetical order, grouped by domain where the boundary is obvious. Per file we record: **purpose / exports / deps / called-by / structures / model-id leakage**. After the per-file pass, a Cross-Cutting section reconciles telemetry conventions, error types, settings shapes, provider-coupling, and dead code.

---

## 1. Per-file findings (alphabetical)

### `objectGroupBy.ts` (18 LOC)

`utils/objectGroupBy.ts:1-19` — TC39-spec `Object.groupBy` polyfill. Pure helper. **Exports**: `objectGroupBy<T,K>(items, keySelector)` returning `Partial<Record<K,T[]>>`. **Deps**: zero. **Pattern**: `Object.create(null)` to avoid prototype-pollution. **Reuse**: drop-in for any provider stream → grouping-by-tool-id flow.

### `pasteStore.ts` (104 LOC)

`utils/pasteStore.ts:1-104` — Content-addressable on-disk paste cache used by the composer to avoid re-shipping huge pasted blocks. **Exports**: `hashPastedText(content)` (sha256-truncated to 16 hex chars, `:21-23`), `storePastedText(hash, content)` (mode `0o600`, `:48`), `retrievePastedText(hash)` (`:59-69`), `cleanupOldPastes(cutoffDate)` (`:76-104`). **Deps**: `crypto`, `fs/promises`, `getClaudeConfigHomeDir` from `envUtils.js`, `logForDebugging` from `debug.js`, `isENOENT` from `errors.js`. **Storage path**: `${claudeConfigHome}/paste-cache/${hash}.txt`. **Called by**: paste-handling composer logic, history expansion (`expandPastedTextRefs`). Time-based cleanup (`cutoffDate.getTime()` mtime compare). Maps onto Anthropic suite §1.1 (composer paste handling) — file is the disk side of "Pasted text references" UX.

### `path.ts` (155 LOC)

`utils/path.ts:1-155` — Cross-platform path manipulation. **Exports**: `expandPath(path, baseDir?)` (`:32-85` — handles `~`, `~/x`, abs, rel, POSIX-on-Windows via `posixPathToWindowsPath`, NULL-byte injection guard at `:48`, NFC-normalization on every return), `toRelativePath(absolutePath)` (`:95-99` — uses `..` prefix as out-of-cwd signal), `getDirectoryForPath(path)` (`:109-125` — UNC-path NTLM-leak guard at `:111-113`), `containsPathTraversal(path)` (`:133-135`), `normalizePathForConfigKey(path)` (`:149-155` — Windows JSON-key normalization), re-exports `sanitizePath` from `sessionStoragePortable.js`. **Deps**: `os.homedir`, `path`, `getCwd` from `cwd.js`, `getFsImplementation`, `getPlatform`, `posixPathToWindowsPath`. **Security**: explicitly avoids fs ops on UNC paths (`\\\\` or `//`) to prevent SMB/NTLM credential exfiltration. **Reuse**: drop-in for our cross-surface path normalization (Desktop + CLI + Web).

### `peerAddress.ts` (21 LOC)

`utils/peerAddress.ts:1-21` — URI-style peer address parser. **Exports**: `parseAddress(to)` returning `{ scheme: 'uds'|'bridge'|'other', target }`. Splits `uds:`/`bridge:` prefixes, treats bare absolute paths as legacy UDS. **Deps**: zero. **Comment** `:1-5`: factored out so SendMessageTool can import without transitively pulling axios + fs + net (i.e., MCP bridge transport). **Maps onto** Anthropic suite §3 (Cowork) + §M-mailbox routing (teammate-to-teammate UDS messaging).

### `planModeV2.ts` (95 LOC)

`utils/planModeV2.ts:1-95` — Plan-mode-V2 feature flags + GrowthBook A/B variants. **Exports**: `getPlanModeV2AgentCount()` (`:5-29` — returns 1/3 based on `subscriptionType` (max@20x, enterprise, team) → 3 agents else 1; env override `CLAUDE_CODE_PLAN_V2_AGENT_COUNT`), `getPlanModeV2ExploreAgentCount()` (`:31-43` — env-override only, default 3), `isPlanModeInterviewPhaseEnabled()` (`:50-62` — `USER_TYPE === 'ant'` always-on, GrowthBook flag `tengu_plan_mode_interview_phase`), `getPewterLedgerVariant()` (`:88-95` — variants `'trim'|'cut'|'cap'|null` for plan-file-size experiment). **Deps**: `getFeatureValue_CACHED_MAY_BE_STALE` from `growthbook.js`, `getRateLimitTier`/`getSubscriptionType` from `auth.js`, `isEnvDefinedFalsy`/`isEnvTruthy` from `envUtils.js`. **Comment** `:73-87`: documents experiment baseline (p50 4,906 chars, p90 11,617, mean 6,207 chars; 82% Opus 4.6 traffic) — primary metric is session avg cost via fact `fact__201omjcij85f`. **Provider coupling**: explicitly mentions Opus-4.6 cost weighting. Maps onto Anthropic suite §5.4 (plan mode) + §C (recent changes).

### `platform.ts` (150 LOC)

`utils/platform.ts:1-151` — Platform detection. **Exports**: `Platform` type (`:7` — `'macos'|'windows'|'wsl'|'linux'|'unknown'`), `SUPPORTED_PLATFORMS` (`:9` — `['macos','wsl']` only — Linux native gated out), `getPlatform()` (`:11-49`, memoized — reads `/proc/version` for WSL detection), `getWslVersion()` (`:51-79`, memoized — parses `/WSL(\d+)/i`), `getLinuxDistroInfo()` (`:87-116`, memoized — reads `/etc/os-release` ID + VERSION_ID, plus `os.release()` kernel), `detectVcs(dir?)` (`:129-150` — checks 8 markers: `.git`, `.hg`, `.svn`, `.p4config`, `$tf`, `.tfvc`, `.jj`, `.sl`, plus `P4PORT` env). **Deps**: `fs/promises`, `lodash-es/memoize`, `os.release`, `getFsImplementation`, `logError`. **Note**: SUPPORTED_PLATFORMS exposes the Linux/Windows ship gap from Anthropic suite §2.5 ("Linux: Not shipped") — the harness ships only on macOS+WSL by policy. **Maps onto** Anthropic suite §2.5 (per-platform notes), §A (pricing) (`SUPPORTED_PLATFORMS`).

### `preflightChecks.tsx` (150 LOC, compiled)

`utils/preflightChecks.tsx:1-150` — Network connectivity preflight before app start. **Exports**: `PreflightCheckResult` type, `PreflightStep({onSuccess})` Ink component. Internal: `checkEndpoints()` axios-GETs `${BASE_API_URL}/api/hello` and `${TOKEN_URL.origin}/v1/oauth/hello` in parallel; on failure logs `tengu_preflight_check_failed` Statsig event with `{isConnectivityError, hasErrorMessage, isSSLError}`; renders SSL hint if `getSSLErrorHint(error)` returns one, else falls back to "Note: Claude Code might not be available in your country" with link to `anthropic.com/supported-countries`. **Side effect**: on failure waits 100 ms then calls `process.exit(1)` (`:148-149`). **Deps**: `axios`, `react`, `Spinner`, `getOauthConfig`, `useTimeout`, `Box`/`Text` from Ink, `getSSLErrorHint`, `getUserAgent`, `logError`, `logEvent`. **Note**: file is React Compiler output (mangled `$[i]` slots, `_c(12)`). **Telemetry event**: `tengu_preflight_check_failed`. **Maps onto** Anthropic suite §2.6 (auto-update) + §C (network-config doc). **Direct mention** of `code.claude.com/docs/en/network-config` and `anthropic.com/supported-countries`.

### `privacyLevel.ts` (55 LOC)

`utils/privacyLevel.ts:1-55` — Three-level privacy escalator. **Exports**: type `PrivacyLevel` (`:18` — `'default'|'no-telemetry'|'essential-traffic'`), `getPrivacyLevel()` (`:20-28` — maps `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` → essential-traffic, `DISABLE_TELEMETRY` → no-telemetry), `isEssentialTrafficOnly()` (`:34-36`), `isTelemetryDisabled()` (`:42-44`), `getEssentialTrafficOnlyReason()` (`:50-55` — returns the env var name for "unset X to re-enable" UX). **Deps**: zero. **Important**: `essential-traffic` shuts down auto-updates, grove (?), release notes, model capabilities — see comment `:11-12`. **Maps onto** Anthropic suite §11 (Trust Center) + §F (threat model). **Reuse**: copy-paste for our Desktop privacy panel.

### `process.ts` (68 LOC)

`utils/process.ts:1-69` — stdout/stderr lifecycle helpers. **Exports**: `registerProcessOutputErrorHandlers()` (`:12-15` — installs EPIPE handler so `claude -p | head -1` doesn't leak memory), `writeToStdout(data)` (`:28-30`), `writeToStderr(data)` (`:32-34`), `exitWithError(message)` (`:38-43` — console.error + `process.exit(1)`), `peekForStdinData(stream, ms)` (`:50-68` — race timeout vs first-data; used by `-p` mode to detect inherited-but-idle parent stdin). **Deps**: zero. **Notable**: known unresolved TODO at `:23-24` ("we don't handle backpressure (write() returning false)"). **Maps onto** print-mode entrypoint (M1 owner).

### `profilerBase.ts` (46 LOC)

`utils/profilerBase.ts:1-46` — Shared timeline-line formatter for three profilers (startup/query/headless). **Exports**: `getPerformance()` (`:14-20` — lazy `require('perf_hooks').performance`), `formatMs(ms)` (`:22-24` — `.toFixed(3)`), `formatTimelineLine(totalMs, deltaMs, name, memory, totalPad, deltaPad, extra)` (`:33-46` — `[+totalMs] (+deltaMs) name extra | RSS: x, Heap: y` format). **Deps**: `formatFileSize` from `format.js`. **Called by**: `startupProfiler.ts`, `queryProfiler.ts`, plus a `headlessProfiler.ts` referenced in the docstring. **Reuse**: drop-in for our equivalent timeline reporting.

### `promptCategory.ts` (49 LOC)

`utils/promptCategory.ts:1-49` — Maps agent type / output-style to a `QuerySource` analytics key. **Exports**: `getQuerySourceForAgent(agentType, isBuiltInAgent)` (`:16-28` — returns `agent:builtin:${type}` / `agent:default` / `agent:custom`), `getQuerySourceForREPL()` (`:36-49` — base `repl_main_thread` plus `:outputStyle:${style}` or `:outputStyle:custom`). **Deps**: `QuerySource` type, `DEFAULT_OUTPUT_STYLE_NAME`, `OUTPUT_STYLE_CONFIG`, `getSettings_DEPRECATED`. **Maps onto** Anthropic suite §1.2 (Style picker) + §5.2 (output styles).

### `promptEditor.ts` (188 LOC)

`utils/promptEditor.ts:1-189` — Pop-out external editor for the prompt buffer. **Exports**: type `EditorResult = {content: string|null, error?: string}`, `editFileInEditor(filePath)` (`:31-101` — handles GUI vs terminal editors via `classifyGuiEditor`; for TUI editors uses `inkInstance.enterAlternateScreen`/`exitAlternateScreen` to coordinate Ink fullscreen mode; for GUI editors uses `pause`/`suspendStdin`; appends `code -w` / `subl --wait` flags via `EDITOR_OVERRIDES`), `editPromptInEditor(currentPrompt, pastedContents?)` (`:138-188` — expands paste-refs into a temp file, edits, re-collapses pasted-content matches via `recollapsePastedContent` `:107-135`, trims one trailing newline, deletes temp file). **Deps**: `expandPastedTextRefs`, `formatPastedTextRef`, `getPastedTextRefNumLines` from `history.js`; `instances` from `ink/instances.js`; `PastedContent` from `config.js`; `classifyGuiEditor`, `getExternalEditor` from `editor.js`; `execSync_DEPRECATED`; `getFsImplementation`; `toIDEDisplayName` from `ide.js`; `writeFileSync_DEPRECATED` from `slowOperations.js`; `generateTempFilePath`. **Maps onto** Anthropic suite §1.1 (composer external-editor support).

### `promptShellExecution.ts` (183 LOC)

`utils/promptShellExecution.ts:1-184` — Skill-frontmatter-driven shell-command embedding. **Exports**: `executeShellCommandsInPrompt(text, context, slashCommandName, shell?)` (`:69-143`). Handles two patterns:

- **Block**: triple-backtick + `!` (BLOCK_PATTERN `:49`).
- **Inline**: `` !`cmd` `` (INLINE_PATTERN `:55-56`, gated by `text.includes('!`')`cheap check at`:90`— comment notes lookbehind regex is 100× slower than block pattern on 17KB skill content).
Routes to`BashTool`by default; switches to`PowerShellTool`only when`shell === 'powershell'`AND`isPowerShellToolEnabled()` (runtime opt-in). PowerShellTool is **lazy-loaded** via cached require (`:35-46`) to avoid forcing PowerShell parser load at startup. Per-command flow: `hasPermissionsToUseTool`check →`shellTool.call({command}, ctx)`→`processToolResultBlock`→`String.replace(match[0], () => output)`(function replacer at`:131`to avoid`$$/$&/$\`/$'`interpretation in shell output, e.g. PowerShell`$env:PATH`). **Deps**: `randomUUID`, `Tool`/`ToolUseContext`, `BashTool`, `logForDebugging`, `errorMessage`/`MalformedCommandError`/`ShellError`, `FrontmatterShell`type,`createAssistantMessage`, `hasPermissionsToUseTool`, `processToolResultBlock`, `isPowerShellToolEnabled`. **Comment `:18`**: warns `call()`bypasses`validateInput`→ load-bearing checks must live in`call()` itself (PR #23311). **Maps onto** Anthropic suite §5.4 (slash commands with shell embedding).

### `queryContext.ts` (179 LOC)

`utils/queryContext.ts:1-180` — System-prompt cache-key prefix builder. **Exports**: `fetchSystemPromptParts({tools, mainLoopModel, additionalWorkingDirectories, mcpClients, customSystemPrompt})` (`:44-74` — fetches `defaultSystemPrompt`, `userContext`, `systemContext` in parallel; **skips defaults when `customSystemPrompt` is set** so SDK custom-prompt callers don't get the default appended), `buildSideQuestionFallbackParams({...})` (`:88-179` — rebuilds `CacheSafeParams` for SDK side_question handler when `getLastCacheSafeParams()` is null pre-turn-completion; mirrors QueryEngine.ts:ask() to preserve cache hit; strips in-progress assistant message when `stop_reason === null`; uses `shouldEnableThinkingByDefault()` to default `thinkingConfig` to `{type:'adaptive'}` else `{type:'disabled'}`). **Deps**: `Command`, `getSystemPrompt`, `getSystemContext`/`getUserContext`, `MCPServerConnection`, `AppState`, `Tools`/`ToolUseContext`, `AgentDefinition`, `Message`, `createAbortController`, `FileStateCache`, `CacheSafeParams`, `getMainLoopModel`, `asSystemPrompt`, `shouldEnableThinkingByDefault`/`ThinkingConfig`. **Comment `:1-10`**: file split out to break import cycle between context.ts → constants/prompts.ts → systemPrompt.ts/sideQuestion.ts. **Maps onto** Anthropic suite §1.6 (memory) + §E (memory deep dive).

### `QueryGuard.ts` (121 LOC)

`utils/QueryGuard.ts:1-122` — Synchronous query-lifecycle state machine (compatible with React `useSyncExternalStore`). States: `idle` / `dispatching` / `running`. **Class methods**: `reserve()` (`:38-43` — idle → dispatching), `cancelReservation()` (`:49-53` — dispatching → idle), `tryStart()` (`:61-67` — bumps generation on every transition to running), `end(generation)` (`:74-80` — only cleans up if generation matches), `forceEnd()` (`:88-93` — bumps generation to invalidate stale finally blocks), `isActive` getter (`:99-101`), `subscribe`/`getSnapshot` for `useSyncExternalStore` (`:111-115`). **Deps**: `createSignal` from `signal.js`. **Pattern**: generation counter prevents stale finally-block cleanup after force-cancel. **Reuse**: gold-standard pattern for any cross-surface streaming query coordinator.

### `queryHelpers.ts` (552 LOC)

`utils/queryHelpers.ts:1-553` — Hot-path helpers for the query pipeline. **Exports**:

- `PermissionPromptTool` type (`:39-42`).
- `isResultSuccessful(message, stopReason?)` (`:56-94` — returns true if last assistant has `text|thinking|redacted_thinking`, or last user is all-`tool_result`, or stopReason is `end_turn` with zero content blocks; `:84-93` documents a real production bug from `claude.ts:2026` where Opus emitted `stop_reason=end_turn`, `outputTokens=4`, `textContentLength=0` after seeing a subagent result).
- `normalizeMessage(message)` generator (`:102-222` — yields SDK messages from `assistant`/`progress`/`user`; **bash_progress** is throttled to 30 s per `parentToolUseID` with LRU at 100 entries `:96-100, :171-200`, **gated** by `CLAUDE_CODE_REMOTE` or `CLAUDE_CODE_CONTAINER_ID` only — i.e. SDK clients in non-remote mode never see Bash progress).
- `handleOrphanedPermission(orphanedPermission, tools, mutableMessages, ctx)` async generator (`:224-343` — replays a tool_use that was orphaned by an in-flight permission prompt; **dedupe at `:299-306`** specifically by `tool_use_id` not message-id because streaming chunks share message-id; persists transcript via `recordTranscript` if session persistence is enabled).
- `extractReadFilesFromMessages(messages, cwd, maxSize?)` (`:346-501` — two-pass scan: first pass collects file_read/write/edit `tool_use_id` → path map; second pass reads each `tool_result` to populate a `FileStateCache`; for **Edit results, re-reads disk** because the post-edit text is not in the tool result, only old/new strings; uses `getFileModificationTime` for cache mtime; strips `<system-reminder>` tags via regex at `:432`; default cache size 10 (`ASK_READ_FILE_STATE_CACHE_SIZE` `:46`)).
- `extractBashToolsFromMessages(messages)` (`:507-534` — extracts top-level CLI names from BashTool calls; uses `extractCliName` which strips env-var assignments and `sudo` prefix at `:543-552`).

**Deps**: `ToolUseBlock` from Anthropic SDK, `last` from lodash, session ID + persistence flags from `bootstrap/state`, `SDKMessage` type, `CanUseToolFn`, `runTools`, `findToolByName`, `Tool`/`Tools`, `BASH_TOOL_NAME`, `FILE_EDIT_TOOL_NAME`, `Input as FileReadInput`, `FILE_READ_TOOL_NAME`/`FILE_UNCHANGED_STUB`, `FILE_WRITE_TOOL_NAME`, `Message`, `OrphanedPermission`, `logForDebugging`, `isEnvTruthy`, `isFsInaccessible`, `getFileModificationTime`/`stripLineNumberPrefix`, `readFileSyncWithMetadata`, `createFileStateCacheWithSizeLimit`/`FileStateCache`, `isNotEmptyMessage`/`normalizeMessages`, `expandPath`, `permissionToolInputSchema`/`permissionToolOutputSchema` types, `ProcessUserInputContext`, `recordTranscript`. **Provider coupling**: imports Anthropic SDK directly (`'@anthropic-ai/sdk/resources/index.mjs'`). **Maps onto** Anthropic suite §1.8 (tool-use rendering) + §5 (Code CLI streaming).

### `queryProfiler.ts` (301 LOC)

`utils/queryProfiler.ts:1-302` — `perf_hooks`-based per-query timeline. Enabled by `CLAUDE_CODE_PROFILE_QUERY=1` (`:36`). Tracks ~20 named checkpoints from `query_user_input_received` to `query_profile_end` (full list in docstring `:8-28`). **Exports**: `startQueryProfile()` (`:50-64`), `queryCheckpoint(name)` (`:69-84`), `endQueryProfile()` (`:89-93`), `logQueryProfileReport()` (`:298-301`). **Internal**: `getSlowWarning(deltaMs, name)` (`:98-124` — flags >100ms as `SLOW`, >1000ms as `VERY SLOW`, plus name-specific hints for `git_status`/`tool_schema`/`client_creation`), `getQueryProfileReport()` (`:129-211` — formats lines via `formatTimelineLine`, computes TTFT decomposition: pre-request overhead vs network latency), `getPhaseSummary(marks, baselineTime)` (`:216-293` — 9 phases: Context loading, Microcompact, Autocompact, Query setup, Tool schemas, Message normalization, Client creation, Network TTFB, Tool execution; render unicode bars `█.repeat(min(ceil(d/10), 50))` at `:276`). **Deps**: `logForDebugging`, `isEnvTruthy`, `formatMs`/`formatTimelineLine`/`getPerformance` from `profilerBase`. **Maps onto** Anthropic suite §C (instrumentation/diagnostics).

### `queueProcessor.ts` (95 LOC)

`utils/queueProcessor.ts:1-96` — REPL between-turn queue draining. **Exports**: `processQueueIfReady({executeInput})` (`:52-87` — peek + dequeue with main-thread filter `cmd.agentId === undefined`; slash and `mode==='bash'` go individually for per-command isolation; everything else drains all items with the same mode at once), `hasQueuedCommands()` (`:93-95`). **Comment `:55-61`**: subtle bug — without main-thread filter, peek would target subagent-bound commands and stall. **Comment `:42-44`**: bash needs per-command exit-code/progress-UI isolation. **Deps**: `QueuedCommand`, `dequeue`/`dequeueAllMatching`/`hasCommandsInQueue`/`peek` from `messageQueueManager`. **Maps onto** Anthropic suite §1.8 (queueing UX).

### `readEditContext.ts` (227 LOC)

`utils/readEditContext.ts:1-228` — **Streaming context-window file reader** for FileEditTool. Returns ±N lines around a `needle` match. **Exports**: `CHUNK_SIZE` (8 KiB `:4`), `MAX_SCAN_BYTES` (10 MiB `:5`), `EditContext` type (`:8-15` — `content`, `lineOffset` 1-based, `truncated` flag), `readEditContext(path, needle, contextLines=3)` (`:31-43`), `openForScan(path)` (`:48-55`), `scanForContext(handle, needle, contextLines)` (`:60-113` — chunked scan with straddle overlap, model sends LF; tries CRLF if LF miss + needle has newlines), `readCapped(handle)` (`:123-145` — single buffer doubles on fill, log2(size/8KB) allocs vs O(n) chunks+concat).
**Internal**: `indexOfWithin(buf, needle, end)` (`:148-151` — bounds buf.indexOf without allocating view), `countNewlines(buf, start, end)` (`:153-157`), `normalizeCRLF(buf, len)` (`:160-163`), `sliceContext(handle, scratch, matchStart, matchLen, contextLines, linesBeforeMatch)` (`:171-227` — scans backward then forward from match boundaries, reuses scratch buffer for zero alloc on common paths).
**Deps**: `fs/promises.open`, `FileHandle`, `isENOENT` from `errors.js`. **Reuse**: gold-standard streaming context-finder pattern. **Maps onto** Anthropic suite §1.8 file-edit diff rendering.

### `readFileInRange.ts` (383 LOC)

`utils/readFileInRange.ts:1-384` — Two-path file reader with line-range selection. **Fast path**: regular files <10 MiB → `readFile + indexOf('\n')` split (`:128-194`). **Streaming path**: large files / pipes / devices → `createReadStream` + manual `indexOf('\n')` scan (`:200-383`); content for lines outside range is **counted but discarded** so reading line 1 of a 100 GB file doesn't balloon RSS. **Exports**: `FAST_PATH_MAX_SIZE = 10 * 1024 * 1024` (`:44`), `ReadFileRangeResult` type (`:46-55` — `content`, `lineCount`, `totalLines`, `totalBytes`, `readBytes`, `mtimeMs`, optional `truncatedByBytes`), `FileTooLargeError` class (`:57-67` — uses `formatFileSize` with rich error message and the explicit hint to "use offset and limit parameters"), `readFileInRange(filePath, offset?, maxLines?, maxBytes?, signal?, options?)` (`:73-122` — `truncateOnByteLimit` toggle: false throws `FileTooLargeError`, true caps output at last full line that fits). **Internal**: `StreamState` type (`:200-216`), `streamOnOpen` (`:218-222`), `streamOnData` (`:224-304` — bytes counter, partial line carry-over, truncation-collapse trick where `endLine = currentLineIndex` to stop accumulation while still counting `totalLines`), `streamOnEnd` (`:306-342`), `readFileInRangeStreaming(...)` (`:344-383` — module-level event handlers bound at registration to avoid closure allocations per call). **Reuse**: pattern is excellent — copy verbatim for our cross-platform file-read tool. **Maps onto** Anthropic suite §1.8 (file-read rendering) + §5.5.4 (Read tool quotas).

### `releaseNotes.ts` (360 LOC)

`utils/releaseNotes.ts:1-361` — Background changelog fetcher + version-diff diff display. **Exports**: `MAX_RELEASE_NOTES_SHOWN = 5` (`:13`), `CHANGELOG_URL = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'` (`:28`), `migrateChangelogFromConfig()` (`:55-76` — moves legacy `cachedChangelog` field out of `globalConfig` into a file at `~/.claude/cache/changelog.md`, uses `flag: 'wx'` write-only-if-not-exists), `fetchAndStoreChangelog()` (`:82-119` — bails out in non-interactive sessions and when `isEssentialTrafficOnly()`; saves `changelogLastFetched` Date.now to globalConfig), `getStoredChangelog()` (`:126-139` — populates `changelogMemoryCache`), `getStoredChangelogFromMemory()` (`:147-149` — sync accessor for React render path), `parseChangelog(content)` (`:156-196` — splits by `^## ` heading; first-line `1.2.3` or `1.2.3 - YYYY-MM-DD`; bullet points starting with `- `), `getRecentReleaseNotes(currentVersion, previousVersion, changelogContent?)` (`:207-240` — uses `coerce` from `semver` to strip SHA, `gt` compare, sorts newest first, slices to MAX_RELEASE_NOTES_SHOWN), `getAllReleaseNotes(...)` (`:249-276` — for full release-notes settings tab), `checkForReleaseNotes(lastSeenVersion, currentVersion?)` (`:287-327` — async; **for `USER_TYPE === 'ant'`, uses `MACRO.VERSION_CHANGELOG` baked at build time**), `checkForReleaseNotesSync(...)` (`:335-360` — sync mirror, ant-aware). **Deps**: `axios`, `fs/promises`, `path`, `coerce` from `semver`, `getIsNonInteractiveSession`, `getGlobalConfig`/`saveGlobalConfig`, `getClaudeConfigHomeDir`, `toError`, `logError`, `isEssentialTrafficOnly`, `gt`. **Network**: pulls `raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/CHANGELOG.md` only when not essential-traffic. **Maps onto** Anthropic suite §C (recent changes log) + §11 (privacy/Trust Center essential-traffic mode).

### `renderOptions.ts` (77 LOC)

`utils/renderOptions.ts:1-78` — Stdin detection for piped Ink rendering. **Exports**: `getBaseRenderOptions(exitOnCtrlC=false)` (`:68-77`). **Internal**: cached `getStdinOverride()` (`:15-60` — opens `/dev/tty` only when (a) stdin not TTY, (b) not in CI, (c) not running `mcp` subcommand, (d) not Windows). **Comment `:48-53`**: Bun-compiled binaries miss `isTTY` on `ReadStream` from FD; this code force-sets `ttyStream.isTTY = true`. **Deps**: `openSync` from `fs`, `ReadStream` from `tty`, `RenderOptions` from `ink.js`, `isEnvTruthy`, `logError`. **Reuse**: necessary for our CLI when migrating to Ink.

### `sanitization.ts` (91 LOC)

`utils/sanitization.ts:1-92` — **Critical security**: NFKC + Unicode-class stripping to defeat ASCII-Smuggling / Hidden-Prompt-Injection attacks. **Comment `:10-12`**: directly references HackerOne #3086545 against Claude Desktop's MCP. **Exports**: `partiallySanitizeUnicode(prompt)` (`:25-65` — iterates up to 10 passes; **NFKC normalization** at `:36`; primary defence: `replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '')` for format/private-use/unassigned categories at `:42`; fallback explicit ranges for: `​-‏` ZW spaces + LTR/RTL marks, `‪-‮` directional formatting, `⁦-⁩` directional isolates, `﻿` BOM, `-` BMP private use; `:58-62` throws on iteration cap, "should only ever happen if there is a bug or if someone purposefully created a deeply nested unicode string"), `recursivelySanitizeUnicode<T>(value)` (`:67-91` — recurses arrays + objects (sanitizes both keys and values)). **Deps**: zero. **Locked-rule mention**: HackerOne #3086545 — **must port to our MCP layer**. **Maps onto** Anthropic suite §F (threat model — ASCII Smuggling).

### `screenshotClipboard.ts` (121 LOC)

`utils/screenshotClipboard.ts:1-122` — Cross-platform "ANSI-to-PNG-to-clipboard" (used by `/screenshot` slash command). **Exports**: `copyAnsiToClipboard(ansiText, options?)` (`:16-44` — uses `ansiToPng` to render ANSI to a PNG buffer, writes to `${tmpdir}/claude-code-screenshots/screenshot-${Date.now()}.png`, calls `copyPngToClipboard` then `unlink`). **Internal**: `copyPngToClipboard(pngPath)` (`:46-121`):

- macOS: AppleScript via `osascript` `set the clipboard to (read (POSIX file "...") as «class PNGf»)` — escapes `\` and `"`.
- Linux: `xclip -selection clipboard -t image/png -i pngPath` then fallback to `xsel --clipboard --input --type image/png`.
- Windows: PowerShell `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile(...))`.
  **Deps**: `fs/promises`, `tmpdir`, `path.join`, `ansiToPng` from `ansiToPng.js`, `execFileNoThrowWithCwd`, `logError`, `getPlatform`. **Pattern**: pure-TS pipeline (no WASM, no system fonts) — works in both native + JS builds. **Maps onto** Anthropic suite §6.4 (mobile clipboard share — native bridge equivalent on desktop).

### `sdkEventQueue.ts` (134 LOC)

`utils/sdkEventQueue.ts:1-135` — Push-style SDK event queue for headless/streaming-mode consumers. **Types**: `TaskStartedEvent` (`:6-15`), `TaskProgressEvent` (`:17-34` — has `workflow_progress: SdkWorkflowProgress[]`), `TaskNotificationSdkEvent` (`:41-54` — terminal-state events `'completed'|'failed'|'stopped'`, comment `:36-40` notes consumers like VS Code use this to remove tasks from the subagent panel), `SessionStateChangedEvent` (`:62-66` — `'idle'|'running'|'requires_action'`, comment `:56-61` documents the critical "turn-is-over" semantics for SDK consumers like scmuxd / VS Code). **Constants**: `MAX_QUEUE_SIZE = 1000` (`:74`). **Exports**: `enqueueSdkEvent(event)` (`:77-87` — early-bail in TUI mode; ring buffer drops oldest), `drainSdkEvents()` (`:89-101` — atomically splices and stamps each with fresh UUID + session_id), `emitTaskTerminatedSdk(taskId, status, opts?)` (`:114-134` — closing-bookend helper). **Deps**: `crypto.UUID`, `randomUUID`, `getIsNonInteractiveSession`/`getSessionId`, `SdkWorkflowProgress` type. **Provider coupling**: none. **Maps onto** Anthropic suite §1.8, §6 (Mobile Dispatch).

### `semanticBoolean.ts` (29 LOC) + `semanticNumber.ts` (36 LOC)

Twin Zod-v4 helpers that **rescue model-quoted booleans/numbers** that would otherwise crash schema validation:

- `utils/semanticBoolean.ts:22-29` — `z.preprocess` accepting `"true"|"false"` literals; explicitly **avoids** `z.coerce.boolean()` because that uses JS truthiness (`"false" → true`).
- `utils/semanticNumber.ts:26-36` — `z.preprocess` accepting decimal numeric strings via regex `/^-?\d+(\.\d+)?$/`; explicitly **avoids** `z.coerce.number()` because that converts `""`/`null`.
  Comment block in both: `.optional()/.default()` must go on the inner schema, not chained after preprocess (Zod v4 widens output to `unknown`). The schema emitted to the API is still `{type:boolean}/{type:number}` — this is invisible client-side coercion. **Reuse**: drop-in for our tool input validators (locked-rule LLM brittleness mitigation).

### `semver.ts` (59 LOC)

`utils/semver.ts:1-60` — Bun-or-npm-semver shim. **Comment `:4-6`**: `Bun.semver.order()` is ~20× faster than npm semver. **Exports**: `gt`, `gte`, `lt`, `lte`, `satisfies`, `order`. Always uses `{loose: true}` on the npm fallback. **Deps**: `semver` (lazy required). **Reuse**: drop-in for any cross-platform semver.

### `sequential.ts` (56 LOC)

`utils/sequential.ts:1-57` — Single-flight async wrapper. **Exports**: `sequential<T,R>(fn)` (`:19-56`) — returns a function that queues callers and runs `fn` one-at-a-time, preserving each caller's resolve/reject. Used for file-write / DB-update conflict prevention. Re-checks queue after `processing=false` to handle adds during the await window (`:44-47`). **Deps**: zero. **Reuse**: drop-in.

### `sessionActivity.ts` (133 LOC)

`utils/sessionActivity.ts:1-134` — **Refcount-based 30s heartbeat** for remote-container keepalive. **Constant**: `SESSION_ACTIVITY_INTERVAL_MS = 30_000` (`:18`). **Reasons**: `'api_call' | 'tool_exec'` (`:20`). **Exports**: `registerSessionActivityCallback(cb)` (`:60-66`), `unregisterSessionActivityCallback()` (`:68-76`), `sendSessionActivitySignal()` (`:78-82` — gated by `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`), `isSessionActivityTrackingActive()` (`:84-86`), `startSessionActivity(reason)` (`:92-115` — increments refcount; on 0→1 starts heartbeat timer; registers cleanup hook on first call), `stopSessionActivity(reason)` (`:121-133` — decrements; on N→0 stops heartbeat, starts 30 s idle timer that logs `session_idle_30s`). **Telemetry**: `session_keepalive_heartbeat`, `session_idle_30s`, `session_activity_at_shutdown`. **Deps**: `registerCleanup`, `logForDiagnosticsNoPII`, `isEnvTruthy`. **Reuse**: prototype for our Cloud-mode keep-alive layer.

### `sessionEnvironment.ts` (166 LOC)

`utils/sessionEnvironment.ts:1-167` — Per-session shell-prelude script management. **Disk layout**: `~/.claude/session-env/${sessionId}/` with files matching `^(setup|sessionstart|cwdchanged|filechanged)-hook-(\d+)\.sh$`. **Priority order**: setup<sessionstart<cwdchanged<filechanged then ascending hook index (`:146-166`). **Exports**: `getSessionEnvDirPath()` (`:15-23` — mkdir-p), `getHookEnvFilePath(hookEvent, hookIndex)` (`:25-31`), `clearCwdEnvFiles()` (`:33-53`), `invalidateSessionEnvCache()` (`:55-58`), `getSessionEnvironmentScript()` (`:60-144` — reads `CLAUDE_ENV_FILE` env var first if set (used by HFI trajectory runner for venv/conda persistence), then concatenates all matching hook files in priority order). **Comment `:61-64`**: "Session environment not yet supported on Windows" — file silently returns null on win32. **Deps**: `fs/promises`, `getSessionId`, `logForDebugging`, `getClaudeConfigHomeDir`, `errorMessage`/`getErrnoCode`, `getPlatform`. **Maps onto** Anthropic suite §5.4 (hooks system) + §5.5.6 (env-injecting hooks).

### `sessionEnvVars.ts` (22 LOC)

`utils/sessionEnvVars.ts:1-23` — In-memory map of session-scoped env vars set via `/env` slash command. **Exports**: `getSessionEnvVars()` (returns `ReadonlyMap`), `setSessionEnvVar(name, value)`, `deleteSessionEnvVar(name)`, `clearSessionEnvVars()`. **Comment `:1-5`**: "Applied only to spawned child processes (via bash provider env overrides), not to the REPL process itself." **Deps**: zero.

### `sessionFileAccessHooks.ts` (250 LOC)

`utils/sessionFileAccessHooks.ts:1-251` — Telemetry hooks for memory-file access. Wires into `PostToolUse` for `Read|Grep|Glob|Edit|Write`. **Tracks**:

- session memory (Read/Grep/Glob)
- session transcript (Read/Grep/Glob)
- memdir/auto-mem files (Read/Edit/Write)
- team-memory files (Read/Edit/Write) under `feature('TEAMMEM')`
- memory shape telemetry under `feature('MEMORY_SHAPE_TELEMETRY')`
  **Exports**: `isMemoryFileAccess(toolName, toolInput)` (`:123-141`), `registerSessionFileAccessHooks()` (`:233-250`).
  **Internal**: `getFilePathFromInput(toolName, toolInput)` (`:49-69`), `getSessionFileTypeFromInput(toolName, toolInput)` (`:75-116` — Read uses `detectSessionFileType(file_path)`; Grep/Glob use `detectSessionFileType(path)` then `detectSessionPatternType(glob|pattern)`), `handleSessionFileAccess(input, _toolUseID, _signal)` (`:146-227` — bails out unless event is `PostToolUse`; emits `tengu_session_memory_accessed`, `tengu_transcript_accessed`, `tengu_memdir_accessed`, `tengu_memdir_file_read|edit|write`, `tengu_team_mem_accessed`, `tengu_team_mem_file_read|edit|write`; **side effect**: on team_mem write, calls `teamMemWatcher.notifyTeamMemoryWrite()`).
  **Deps**: `feature` from `bun:bundle`, `registerHookCallbacks`, `HookInput`/`HookJSONOutput`, `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`/`logEvent`, tool name/schema imports for Read/Edit/Write/Glob/Grep, `detectSessionFileType`/`detectSessionPatternType`/`isAutoMemFile`/`memoryScopeForPath` from `memoryFileDetection`, `getSubagentLogName`. **Maps onto** Anthropic suite §1.6 (memory) + §5 (memdir, claude.md).

### `sessionIngressAuth.ts` (140 LOC)

`utils/sessionIngressAuth.ts:1-141` — CCR (remote) session-token resolution. **Three sources** (`:88-110`):

1. env `CLAUDE_CODE_SESSION_ACCESS_TOKEN` (set at spawn, updatable in-process).
2. file descriptor via `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR` — read once and cached, uses `/dev/fd/${fd}` on macOS/BSD, `/proc/self/fd/${fd}` on Linux.
3. well-known file `CLAUDE_SESSION_INGRESS_TOKEN_FILE` env or `CCR_SESSION_INGRESS_TOKEN_PATH`.
   **Exports**: `getSessionIngressAuthToken()` (`:101-110`), `getSessionIngressAuthHeaders()` (`:117-131` — **session keys (`sk-ant-sid`) use `Cookie: sessionKey=${token}` + `X-Organization-Uuid`**, JWTs use `Bearer`), `updateSessionIngressAuthToken(token)` (`:138-140`). **Deps**: `getSessionIngressToken`/`setSessionIngressToken` from bootstrap, `CCR_SESSION_INGRESS_TOKEN_PATH`/`maybePersistTokenForSubprocesses`/`readTokenFromWellKnownFile`, `logForDebugging`, `errorMessage`, `getFsImplementation`. **Provider coupling**: hardcodes `sk-ant-sid` Anthropic-specific session key prefix (`:120`) and `X-Organization-Uuid` header (`:126`). **Maps onto** Anthropic suite §11 (auth + Trust Center) — must be split for our multi-provider port.

### `sessionRestore.ts` (551 LOC)

`utils/sessionRestore.ts:1-552` — Loads + restores all per-session state on `--resume`/`--continue`. **Types**: `ResumeResult` (`:64-70` — minimal), `ProcessedResume` (`:276-284` — full with restored agent + initial state + agentColor), `CoordinatorModeApi` (`:289-292` — interface for coordinator-mode helpers), `ResumeLoadResult` (`:297-315` — superset of ResumeResult: messages, snapshots, contentReplacements, sessionId, agentName/color/setting, customTitle, tag, mode, worktreeSession, prNumber/Url/Repository).
**Exports**:

- `restoreSessionStateFromLog(result, setAppState)` (`:99-150` — restores file history, attribution (gated by `feature('COMMIT_ATTRIBUTION')`), context-collapse log + staged snapshot (gated by `feature('CONTEXT_COLLAPSE')`), TodoWrite state (when not v2-tasks; SDK/non-interactive only)).
- `extractTodosFromTranscript(messages)` (`:77-93` — scans transcript backwards for last `TodoWrite` tool_use block).
- `computeRestoredAttributionState(result)` (`:157-168`).
- `computeStandaloneAgentContext(agentName, agentColor)` (`:175-188` — handles `'default'` as undefined sentinel).
- `restoreAgentFromSession(agentSetting, currentAgentDefinition, agentDefinitions)` (`:200-242` — preserves CLI `--agent` over session-saved value; sets `setMainThreadAgentType`, `setMainLoopModelOverride` if agent has model and user didn't override; `'inherit'` is treated as "use main loop's model").
- `refreshAgentDefinitionsForModeSwitch(modeWasSwitched, currentCwd, cliAgents, currentAgentDefinitions)` (`:251-271` — calls `getAgentDefinitionsWithOverrides.cache.clear?.()` before re-deriving).
- `restoreWorktreeForResume(worktreeSession?)` (`:332-366` — `process.chdir` is the TOCTOU-safe existence check (throws ENOENT if dir is gone); uses `setCwd`+`setOriginalCwd`; intentionally **does NOT** set projectRoot — it cannot tell whether the worktree was entered via `--worktree` or `EnterWorktreeTool`; clears `clearMemoryFileCaches`+`clearSystemPromptSections`+`getPlansDirectory.cache.clear?.()`).
- `exitRestoredWorktree()` (`:380-400` — undo for mid-session `/resume` to a non-worktree session).
- `processResumedConversation(result, opts, context)` (`:409-551` — top-level orchestrator: matches coordinator/normal mode; reuses session ID unless `--fork-session`; `recordContentReplacement` seeded for fork to avoid `FROZEN`-classification cache miss `:452-462`; restores worktree → adopts session file → restores context-collapse → restores agent → persists mode → computes initial state).
  **Deps**: `feature` from `bun:bundle`, `dirname`, `getMainLoopModelOverride`/`getSessionId`/`setMainLoopModelOverride`/`setMainThreadAgentType`/`setOriginalCwd`/`switchSession` from bootstrap, `clearSystemPromptSections`, `restoreCostStateForSession`, `AppState` type, `AgentColorName`, `AgentDefinition`/`AgentDefinitionsResult`/`getActiveAgentsFromList`/`getAgentDefinitionsWithOverrides`, `TODO_WRITE_TOOL_NAME`, `asSessionId`, log type imports, `Message` type, `renameRecordingForSession`, `clearMemoryFileCaches`, attribution helpers, `updateSessionName`, `getCwd`, `logForDebugging`, `FileHistorySnapshot`/`fileHistoryRestoreStateFromLog`, `createSystemMessage`, `parseUserSpecifiedModel`, `getPlansDirectory`, `setCwd` from `Shell`, multiple session-storage adapters, `isTodoV2Enabled`, `TodoList`/`TodoListSchema`, `ContentReplacementRecord`, worktree helpers.
  **Provider coupling**: none direct; goes through `parseUserSpecifiedModel`. **Maps onto** Anthropic suite §2 (Desktop multi-tab), §1.3 (Projects), §5 (Code CLI resume).

### `sessionStart.ts` (232 LOC)

`utils/sessionStart.ts:1-233` — Wires up SessionStart + Setup hooks (the Anthropic-Hooks system entry-point). **Module-level state**: `pendingInitialUserMessage` (`:26` — side-channel for hook-emitted `initialUserMessage`, consumed by `takeInitialUserMessage` `:28-32`).
**Exports**:

- `processSessionStartHooks(source, opts)` (`:35-175` — `source: 'startup'|'resume'|'clear'|'compact'`; **early bail in `--bare` mode** at `:47-49`; loads plugin hooks via `loadPluginHooks()` (memoized) wrapped in `withDiagnosticsTiming('load_plugin_hooks')`; **plugin hooks are skipped when `shouldAllowManagedHooksOnly()` is true**; rich error guidance for clone failures, EACCES, JSON parse, etc. `:84-122`; aggregates `additionalContexts`, `watchPaths`, `initialUserMessage`; calls `updateWatchPaths(allWatchPaths)` if any; emits final `hook_additional_context` attachment).
- `processSetupHooks(trigger, opts)` (`:177-232` — `trigger: 'init'|'maintenance'`; same shape).
- `takeInitialUserMessage()` (`:28-32`).
  **Deps**: `getMainThreadAgentType`, `HookResultMessage`, `createAttachmentMessage`, `logForDebugging`, `withDiagnosticsTiming`, `isBareMode`, `updateWatchPaths`, `shouldAllowManagedHooksOnly`, `executeSessionStartHooks`/`executeSetupHooks`, `logError`, `loadPluginHooks`. **Comment at `:34`**: explicit warning "Note to CLAUDE: do not add ANY 'warmup' logic. It is **CRITICAL** that you do not add extra work on startup." **Maps onto** Anthropic suite §5.4.5 (hooks system) + §5.5 (plugin marketplace).

### `sessionState.ts` (150 LOC)

`utils/sessionState.ts:1-151` — Three-state session lifecycle (`'idle'|'running'|'requires_action'`) + `requires_action` payload. **Types**: `SessionState` (`:1`), `RequiresActionDetails` (`:15-24` — `tool_name`, `action_description`, `tool_use_id`, `request_id`, `input`), `SessionExternalMetadata` (`:32-45` — keys round-tripped via CCR `external_metadata`: `permission_mode`, `is_ultraplan_mode`, `model`, `pending_action`, `post_turn_summary` (opaque to avoid leaking import path into `sdk.d.ts`), `task_summary` (mid-turn forked-summarizer line)).
**Exports**: `setSessionStateChangedListener(cb)` (`:60-64`), `setSessionMetadataChangedListener(cb)` (`:66-70`), `setPermissionModeChangedListener(cb)` (`:79-83`), `getSessionState()` (`:88-90`), `notifySessionStateChanged(state, details?)` (`:92-134` — emits **RFC 7396 null** to clear `pending_action`; clears `task_summary` on idle; **opt-in** SDK mirror via `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS` env var, comment `:122-126` explains why it's not on by default — would pin CCR web/mobile clients at "Running…"), `notifySessionMetadataChanged(metadata)` (`:136-140`), `notifyPermissionModeChanged(mode)` (`:148-150`).
**Deps**: `isEnvTruthy`, `PermissionMode`, `enqueueSdkEvent`. **Maps onto** Anthropic suite §3 (Cowork) + §6 (Mobile Dispatch — webhook payload types).

### `sessionStoragePortable.ts` (793 LOC)

`utils/sessionStoragePortable.ts` — **Skipped, owned by M3** per task note. Re-export hook lives in `path.ts` (`sanitizePath`).

### `sessionTitle.ts` (129 LOC)

`utils/sessionTitle.ts:1-130` — **Single source of truth** for AI-generated session titles. **Comment `:7-13`** notes there are still **two** legacy generators: `teleport.tsx generateTitleAndBranch` (CCR 6-word title + branch) and `rename/generateSessionName.ts` (kebab-case name for `/rename`). New callers should use this module. **Constants**: `MAX_CONVERSATION_TEXT = 1000` (`:26`), `SESSION_TITLE_PROMPT` (`:56-68` — sentence-case, 3-7 words, JSON output, with good/bad examples). **Exports**: `extractConversationText(messages)` (`:33-54` — flattens user+assistant text content; tail-slices to last 1000 chars), `generateSessionTitle(description, signal)` (`:79-129` — calls `queryHaiku` with structured-output JSON schema `{title: string}`, parses via `safeParseJSON` + Zod `lazySchema`; logs `tengu_session_title_generated` with success boolean). **Deps**: `zod/v4`, `getIsNonInteractiveSession`, `logEvent`, `queryHaiku` from `services/api/claude.js`, `Message`, `logForDebugging`, `safeParseJSON`, `lazySchema`, `extractTextContent`, `asSystemPrompt`. **Provider coupling**: hardcodes Haiku via `queryHaiku` (Anthropic-specific). **Maps onto** Anthropic suite §1.3 (Projects — auto title) + §5 (CLI session naming).

### `sessionUrl.ts` (64 LOC)

`utils/sessionUrl.ts:1-65` — Parser for resume identifier strings (`.jsonl` path, plain UUID, or session-ingress URL). **Type**: `ParsedSessionUrl` (`:4-10` — `sessionId`, `ingressUrl`, `isUrl`, `jsonlFile`, `isJsonlFile`). **Exports**: `parseSessionIdentifier(resumeIdentifier)` (`:20-64`). **Important Windows-path caveat at `:23-24`**: `.jsonl` check happens BEFORE URL parsing because Windows `C:\path\file.jsonl` is parsed as a valid URL with `C:` protocol. **Deps**: `crypto.randomUUID`/`UUID`, `validateUuid`. **Maps onto** Anthropic suite §5 (CLI `--resume`).

### `set.ts` (53 LOC)

`utils/set.ts:1-54` — Hot-path Set helpers. **Exports**: `difference(a,b)`, `intersects(a,b)`, `every(a,b)` (subset check), `union(a,b)`. Each function has a `// Note: this code is hot, so is optimized for speed.` header. **Deps**: zero. **Reuse**: drop-in.

### `shellConfig.ts` (167 LOC)

`utils/shellConfig.ts:1-168` — `.bashrc`/`.zshrc`/fish config-file management for the `claude` alias. **Constants**: `CLAUDE_ALIAS_REGEX = /^\s*alias\s+claude\s*=/` (`:12`). **Exports**: `getShellConfigPaths(options?)` (`:26-37` — respects `ZDOTDIR` env for zsh users; supports test overrides via `options.env`/`options.homedir`), `filterClaudeAliases(lines)` (`:45-75` — only removes installer-created aliases pointing at `getLocalClaudePath()`; preserves user custom aliases; tries quoted match then unquoted-until-comment), `readFileLines(filePath)` (`:81-91` — null on inaccessible), `writeFileLines(filePath, lines)` (`:96-107` — uses `fh.datasync()` for durability), `findClaudeAlias(options?)` (`:114-135`), `findValidClaudeAlias(options?)` (`:142-167` — expands `~` and stat-checks the target). **Deps**: `fs/promises.open|readFile|stat`, `os.homedir`, `path.join`, `isFsInaccessible`, `getLocalClaudePath`. **Maps onto** Anthropic suite §5.1 (`claude` install + alias).

### `sideQuery.ts` (222 LOC)

`utils/sideQuery.ts:1-223` — **Lightweight wrapper** for "side queries" outside the main loop. Used by permission-explainer, session search, model validation. **Adds** OAuth fingerprint validation, attribution header injection, CLI-system-prompt prefix, model-specific betas, API metadata, model normalization. **Type**: `SideQueryOptions` (`:29-64` — `model`, `system: string|TextBlockParam[]`, `messages: MessageParam[]`, optional `tools: Tool[]|BetaToolUnion[]`, `tool_choice`, `output_format: BetaJSONOutputFormat`, `max_tokens=1024`, `maxRetries=2`, `signal`, `skipSystemPromptPrefix`, `temperature`, `thinking: number|false`, `stop_sequences`, `querySource`). **Exports**: `sideQuery(opts)` (`:107-222` — uses `getAnthropicClient({maxRetries, model, source: 'side_query'})`; **structured outputs**: appends `STRUCTURED_OUTPUTS_BETA_HEADER` only when `modelSupportsStructuredOutputs(model)`; **attribution header is its own block** (`:148-149`) so server-side parsing extracts `cc_entrypoint` correctly; **thinking**: `false` → `{type:'disabled'}`, number → `{type:'enabled', budget_tokens: min(thinking, max_tokens-1)}`; logs `tengu_api_success` with rich usage breakdown including `cachedInputTokens`/`uncachedInputTokens`/`durationMsIncludingRetries`/`timeSinceLastApiCallMs`).
**Deps**: `Anthropic` SDK + Beta types, `getLastApiCompletionTimestamp`/`setLastApiCompletionTimestamp`, `STRUCTURED_OUTPUTS_BETA_HEADER`, `QuerySource`, `getAttributionHeader`/`getCLISyspromptPrefix`, `logEvent`, `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`, `getAPIMetadata`, `getAnthropicClient`, `getModelBetas`/`modelSupportsStructuredOutputs`, `computeFingerprint`, `normalizeModelStringForAPI`. **Provider coupling**: **HIGH** — entire file is Anthropic-SDK-bound; uses Beta API, structured outputs, OAuth fingerprint headers. **Maps onto** Anthropic suite §1.6 (memory side-question), §5 (model validation, permission explainer), §10 (API), §11 (auth attribution).

### `sideQuestion.ts` (222 LOC)

`utils/sideQuestion.ts:1-156` — `/btw` slash command implementation: ask a quick question without interrupting the main agent. **Pattern**: `BTW_PATTERN = /^\/btw\b/gi` (`:16`). **Exports**: `findBtwTriggerPositions(text)` (`:22-41` — for highlighting), `SideQuestionResult` type (`:43-46` — `response`, `usage: NonNullableUsage`), `runSideQuestion({question, cacheSafeParams})` (`:53-102` — uses `runForkedAgent` with `maxTurns: 1`, `canUseTool` returning deny `{behavior:'deny', message:'Side questions cannot use tools'}`, `skipCacheWrite: true`; **wraps the question in a tightly-scoped `<system-reminder>` block at `:61-78`** explicitly forbidding tool use, follow-up turns, "Let me try…" framing, etc.; **explicitly does NOT override thinkingConfig** because thinking is part of the API cache key — see comment `:82-84`).
**Internal**: `extractSideQuestionResponse(messages)` (`:125-155` — handles real bug where claude.ts yields one AssistantMessage per content block: with adaptive thinking enabled, you get `[thinking, text]` as two separate messages; old `.find(m => m.type === 'assistant')` grabbed the thinking-only message and returned null — **fix**: flatten `m.message.content` across all assistant messages and concatenate text blocks; falls back to api_error when no assistant content). **Deps**: `formatAPIError`, `NonNullableUsage`, `Message`/`SystemAPIErrorMessage`, `CacheSafeParams`/`runForkedAgent`, `createUserMessage`/`extractTextContent`. **Maps onto** Anthropic suite §5.4 (`/btw`).

### `signal.ts` (43 LOC)

`utils/signal.ts:1-44` — Tiny pub-sub primitive (no stored state). **Type**: `Signal<Args>` (`:18-25`). **Exports**: `createSignal<Args>()` (`:27-43`). Comment `:1-15`: collapses ~8-line `new Set + subscribe + notify` boilerplate duplicated ~15× in the codebase. Distinct from a store: no snapshot, no `getState`. **Reuse**: drop-in.

### `sinks.ts` (16 LOC)

`utils/sinks.ts:1-17` — `initSinks()` wraps `initializeErrorLogSink()` + `initializeAnalyticsSink()`. **Comment `:9-11`**: kept out of `setup.ts` to avoid a setup → commands → bridge → setup import cycle.

### `slashCommandParsing.ts` (60 LOC)

`utils/slashCommandParsing.ts:1-61` — Slash-command parser. **Type**: `ParsedSlashCommand = {commandName, args, isMcp}`. **Exports**: `parseSlashCommand(input)` (`:25-60` — handles `/cmd args` and `/mcp:tool (MCP) args` patterns). **Maps onto** Anthropic suite §4-5 (slash commands).

### `sleep.ts` (84 LOC)

`utils/sleep.ts:1-85` — Abort-responsive sleep + race-against-timeout. **Exports**: `sleep(ms, signal?, opts?)` (`:14-54` — `throwOnAbort`, `abortError`, `unref` options; checks `aborted` BEFORE setting up timer to dodge TDZ on `onAbort` reference; `signal.addEventListener('abort', onAbort, {once:true})`), `withTimeout(promise, ms, message)` (`:70-84` — uses `unref()` so timer doesn't block process exit; comment `:64-66`: "doesn't cancel the underlying work — if the promise is backed by a runaway async operation, that keeps running"). **Deps**: zero. **Reuse**: drop-in.

### `sliceAnsi.ts` (91 LOC)

`utils/sliceAnsi.ts:1-92` — ANSI-aware string slice. Uses `@alcalzone/ansi-tokenize` (handles OSC-8 hyperlinks correctly, unlike npm `slice-ansi`) + `stringWidth` from Ink. **Exports**: `default sliceAnsi(str, start, end?)` (`:26-91`). **Comment `:42-46`**: tracks display width via `stringWidth`, NOT code units — combining marks (Devanagari matras, virama, diacritics) advance position 0 but `.length` would advance past `end` early and truncate slice. **Comment `:47-58`**: zero-width marks attach to preceding base char; break AFTER trailing zero-width marks at `end` (so `"भा"` (`भ + ा`) at `end=1` keeps the `ा`). **Comment `:67-72`**: at `start` boundary, skip leading zero-width marks (they belong to preceding char). Closes any open style runs at the end via `undoAnsiCodes`. **Reuse**: gold-standard for our TUI.

### `slowOperations.ts` (286 LOC)

`utils/slowOperations.ts:1-287` — **Slow-op detection + wrapped JSON/clone APIs**. **Threshold** (`:29-44`): env override `CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS` → 20ms in dev → 300ms for ants → Infinity (off) for external builds. **Pattern**: `using _ = slowLogging\`structuredClone(\${value})\``— TS`using`declaration pattern. **Class**`AntSlowLogger` (`:96-125`): captures `performance.now()`+ cheap`new Error()`(V8/JSC defer the stack format until`.stack`is read), on`[Symbol.dispose]`measures duration and logs if`>SLOW_OPERATION_THRESHOLD_MS`; **re-entrancy guard** at `:51-52`because`logForDebugging`itself uses appendFileSync. **Internal**`buildDescription(args)` (`:75-94`) for tagged-template descriptions. **Constants**: `slowLogging`is **dead-code-eliminated** in non-ant builds via`feature('SLOW_OPERATION_LOGGING')`ternary at`:155-157`. **Wrapped APIs**:

- `jsonStringify(value, replacer?, space?)` (`:170-194`).
- `jsonParse(text, reviver?)` (`:204-211` — branches on reviver to dodge V8 de-opt at `:206-210`).
- `clone(value, options?)` (uses `structuredClone`).
- `cloneDeep(value)` (lodash).
- `writeFileSync_DEPRECATED(filePath, data, options?)` (`:248-286` — supports Node 20.1+ `flush` flag via manual `openSync + writeFileSync + fsyncSync + closeSync` to ensure data hits disk; falls back to plain writeFileSync otherwise).
  **Deps**: `feature` from `bun:bundle`, `WriteFileOptions` type, fs sync APIs, `lodash-es/cloneDeep`, `addSlowOperation` from bootstrap state, `logForDebugging`. **Reuse**: pattern + JSON/clone wrappers are gold standard for any chat UI's RSS/heap-pressure debugging.

### `standaloneAgent.ts` (23 LOC)

`utils/standaloneAgent.ts:1-24` — Returns standalone-agent name unless session is part of a swarm. **Exports**: `getStandaloneAgentName(appState)` (`:17-23` — returns `appState.standaloneAgentContext?.name` only when `getTeamName()` is falsy). **Deps**: `AppState`, `getTeamName` from `teammate.js`.

### `staticRender.tsx` (115 LOC, compiled)

`utils/staticRender.tsx:1-116` — React-Compiler-output workaround for "Ink doesn't support multiple `<Static>` in the same render tree." **Exports**: `renderToAnsiString(node, columns?)` (`:74-107`), `renderToString(node, columns?)` (`:112-115` — uses `stripAnsi`). **Pattern**: wraps node in `RenderOnceAndExit` which uses `useLayoutEffect + setTimeout(exit, 0)` (more robust than `process.nextTick()` on React 19 async render). **DEC sync markers** (`:54-55`): `\x1B[?2026h` (start) / `\x1B[?2026l` (end) — Ink with non-TTY stdout emits multiple frames; `extractFirstFrame` (`:62-69`) takes the content between the first pair of markers. **Reuse**: useful pattern for any "render React to ANSI for stdout" need.

### `stream.ts` (76 LOC)

`utils/stream.ts:1-77` — Single-iteration async-iterator queue. **Class** `Stream<T>` (`:1-76`) implements `AsyncIterator<T>`. **Methods**: `[Symbol.asyncIterator]` (`:11-17` — throws on second iteration), `next()` (`:19-36`), `enqueue(value)` (`:38-47`), `done()` (`:49-57`), `error(error)` (`:59-67`), `return()` (`:69-75`). **Constructor opts**: `returned` callback fires on early exit. **Reuse**: drop-in for our streaming layer.

### `streamlinedTransform.ts` (201 LOC)

`utils/streamlinedTransform.ts:1-202` — Transformer for **distillation-resistant** streamlined output mode. **Strategy**: keep text intact, **summarize tool calls with cumulative counts** (reset when text appears), **omit thinking blocks**, strip tool list and model info from init messages. **Type**: `ToolCounts = {searches, reads, writes, commands, other}` (`:27-33`).
**Categories**: `SEARCH_TOOLS = [Grep, Glob, WebSearch, LSP]` (`:38-43`), `READ_TOOLS = [Read, ListMcpResources]` (`:44`), `WRITE_TOOLS = [Write, Edit, NotebookEdit]` (`:45-49`), `COMMAND_TOOLS = [...SHELL_TOOL_NAMES, 'Tmux', TaskStop]` (`:50`).
**Functions**: `categorizeToolName(toolName)` (`:52-58`), `getToolSummaryText(counts)` (`:73-104` — produces "Searched 3 patterns, read 2 files, ran 1 command" via `capitalize`), `accumulateToolUses(message, counts)` (`:109-124`), `createStreamlinedTransformer()` (`:130-193` — closes over `cumulativeCounts`; emits `'streamlined_text'` on a text-bearing assistant message and resets counts; emits `'streamlined_tool_use_summary'` for tool-only messages; **drops** all of `system`, `user`, `stream_event`, `tool_progress`, `auth_status`, `rate_limit_event`, `control_response`, `control_request`, `control_cancel_request`, `keep_alive`), `shouldIncludeInStreamlined(message)` (`:199-201` — only `assistant`+`result`).
**Deps**: types from agentSdkTypes/controlTypes, tool-name constants, `extractTextContent`, `SHELL_TOOL_NAMES`, `capitalize` from `stringUtils`. **Maps onto** Anthropic suite §5 (CLI streamlined output) — important because this is the format that protects against prompt-injection-distillation attacks (a tool-call sequence summary cannot smuggle visible text).

### `streamJsonStdoutGuard.ts` (123 LOC)

`utils/streamJsonStdoutGuard.ts:1-124` — Runtime guard for `--output-format=stream-json`. **Wraps** `process.stdout.write` and buffers until newline. Lines that JSON-parse pass through; lines that don't are diverted to **stderr** prefixed with `STDOUT_GUARD_MARKER = '[stdout-guard]'` (`:8`). **Comment `:30-42`**: protects SDK clients consuming NDJSON from stray `console.log`/library banners breaking the parser. **Exports**: `STDOUT_GUARD_MARKER` (`:8`), `installStreamJsonStdoutGuard()` (`:49-110` — idempotent; registers cleanup that flushes any partial buffer; restores `originalWrite`), `_resetStreamJsonStdoutGuardForTesting()` (`:116-123`). **Reuse**: drop-in for our SDK stdout safety.

### `stringUtils.ts` (235 LOC)

Will read in dedicated section below.

### `subprocessEnv.ts` (99 LOC)

`utils/subprocessEnv.ts:1-100` — **Env-scrubbing for subprocesses in GitHub Actions**. **Constant** `GHA_SUBPROCESS_SCRUB` (`:15-53`) lists the env vars to strip, with a justifying comment per cluster:

- Anthropic auth (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_FOUNDRY_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`).
- OTLP exporter headers (carry `Authorization=Bearer` for monitoring backends).
- Cloud-provider creds (AWS, GOOGLE*APPLICATION_CREDENTIALS, AZURE_CLIENT*\*).
- GitHub Actions OIDC (`ACTIONS_ID_TOKEN_REQUEST_*` — leaking allows minting an App installation token → repo takeover).
- GitHub Actions artifact/cache (`ACTIONS_RUNTIME_TOKEN`/`URL` — cache-poisoning / supply-chain pivot).
- claude-code-action-specific (`ALL_INPUTS` containing `anthropic_api_key` JSON, `OVERRIDE_GITHUB_TOKEN`, `DEFAULT_WORKFLOW_TOKEN`, `SSH_SIGNING_KEY`).
  **Comment `:14-18`**: `GITHUB_TOKEN`/`GH_TOKEN` are NOT scrubbed because `gh.sh` wrapper scripts need them; that token is job-scoped and expires when the workflow ends.
  **Exports**: `registerUpstreamProxyEnvFn(fn)` (`:73-77` — wired by `init.ts` after lazy-loading the upstream-proxy module; stays undefined in non-CCR startups), `subprocessEnv()` (`:79-99` — gated on `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`; deletes both `KEY` and `INPUT_KEY` for each scrub var to handle GitHub Actions auto-`with:`-input duplicates). **Maps onto** Anthropic suite §F (threat model — prompt-injection exfil) and §11 (Trust Center — secret hygiene).

### `systemDirectories.ts` (74 LOC)

`utils/systemDirectories.ts:1-75` — Cross-platform system-directory resolver. **Type**: `SystemDirectories = {HOME, DESKTOP, DOCUMENTS, DOWNLOADS}` plus index signature. **Exports**: `getSystemDirectories(options?)` (`:27-74`): macOS/default uses `~/Desktop`, `~/Documents`, `~/Downloads`; Windows uses `USERPROFILE` to handle localized folder names; Linux/WSL uses `XDG_DESKTOP_DIR`/`XDG_DOCUMENTS_DIR`/`XDG_DOWNLOAD_DIR` env, falling back to defaults. Test overrides via `options.env`/`homedir`/`platform`. **Deps**: `homedir` from `os`, `path.join`, `logForDebugging`, `getPlatform`.

### `Shell.ts` (474 LOC)

`utils/Shell.ts:1-475` — **Centerpiece** of shell exec for the Bash/PowerShell tools. **Constants**: `DEFAULT_TIMEOUT = 30 * 60 * 1000` (30 minutes, `:44`).
**Type**: `ShellConfig = {provider: ShellProvider}`, `ExecOptions` (`:161-175` — `timeout`, `onProgress`, `preventCwdChanges`, `shouldUseSandbox`, `shouldAutoBackground`, `onStdout` for piped real-time chunks).
**Exports**:

- `findSuitableShell()` (`:73-137` — checks `CLAUDE_CODE_SHELL` override first; consults `SHELL` env (only `bash`/`zsh` accepted); uses `which()` to locate plus a fallback list `['/bin','/usr/bin','/usr/local/bin','/opt/homebrew/bin']`; preference order based on `preferBash`).
- `getShellConfig` memoized.
- `getPsProvider` memoized PowerShell provider via `getCachedPowerShellPath`.
- `exec(command, abortSignal, shellType, options?)` (`:181-442` — full pipeline: build sandbox temp dir using `getClaudeTempDirName()` for per-user isolation; `provider.buildExecCommand` with optional sandbox; **CWD recovery** at `:222-238` if cwd was deleted (e.g., temp dir cleanup) falls back to `getOriginalCwd()`; **Sandboxed PowerShell** at `:256-258` uses `/bin/sh` as outer with base64-encoded `pwsh -NoProfile -NonInteractive -EncodedCommand` to survive `shellquote.quote()`; spawns child with O_NOFOLLOW + O_APPEND to prevent symlink-following attacks (`:299-312`); attaches `onStdout` callback alongside `StreamWrapper`; on completion reads `pwd -P` output from `cwdFilePath` to track cwd changes (NFC-normalize comparison so APFS NFD doesn't false-positive `:404-407`); fires `invalidateSessionEnvCache()` + `onCwdChangedForHooks(...)` on cwd change; cleans up temp file).
- `setCwd(path, relativeTo?)` (`:447-474` — `realpathSync` to resolve symlinks; throws "Path X does not exist" on ENOENT).
  **Deps**: many — `child_process.execFileSync/spawn`, `fs/promises`, `lodash-es/memoize`, `path`, `path/posix`, `logEvent`, bootstrap state, `generateTaskId`, `pwd`, debug/errors/fs, `which`, `ShellCommand` factories, task disk output, `invalidateSessionEnvCache`, sandbox manager, bash/powershell providers, `subprocessEnv`, Windows path conversion.
  **Provider coupling**: PowerShell-specific paths around base64 encoding hack — but no LLM-provider coupling. Sandbox abstraction is via `SandboxManager.wrapWithSandbox`. **Maps onto** Anthropic suite §5.5 (Bash tool), §3 (Cowork — sandbox), §F (threat model — symlink/sandbox attacks).

### `ShellCommand.ts` (465 LOC)

`utils/ShellCommand.ts:1-466` — `ShellCommand` interface + the `ShellCommandImpl` class wrapping a child process. **Types**: `ExecResult` (`:13-30` — has `assistantAutoBackgrounded`, `outputFilePath`/`outputFileSize`/`outputTaskId` for spilled-large outputs, `preSpawnError` for "deleted cwd" path), `ShellCommand` (`:32-47`).
**Constants**: `SIGKILL=137`, `SIGTERM=143` (`:49-50`), `SIZE_WATCHDOG_INTERVAL_MS = 5_000` (`:54`).
**Class** `StreamWrapper` (`:66-104`): pipe-mode wrapper from `child.stdout/stderr` → `TaskOutput`. Sets `setEncoding('utf-8')` to avoid repeated `.toString()` calls. Releases `#stream`/`#taskOutput` refs on cleanup so they GC independently.
**Class** `ShellCommandImpl` (`:114-382`):

- `#sizeWatchdog` polls file size every 5s for **backgrounded** commands and SIGKILL if size exceeds `MAX_TASK_OUTPUT_BYTES` (this is the "768 GB incident" guardrail mentioned at `:355-358`).
- `#abortHandler` (`:186-193`): on `'interrupt'` reason (user submitted a new message), do NOT kill — let caller background so model sees partial output.
- `#exitHandler`: maps SIGTERM to exit code 144.
- `#handleExit` (`:291-335`): builds `ExecResult`; **size kill** prepends `Background command killed: output file exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY}`; **timeout** prepends `Command timed out after ${formatDuration}`; on `outputFileRedundant` deletes the output file (small content already inline).
- `kill`/`background`/`cleanup` wired carefully to avoid microtask races (comment `:373-376`: kill+cleanup sequence crash on null `#abortSignal` if order is wrong).
  **Exports**: `wrapSpawn(...)` factory (`:387-402`), `createAbortedCommand(backgroundTaskId?, opts?)` (`:437-445` — uses code 145 by default), `createFailedCommand(preSpawnError)` (`:447-465`).
  **Deps**: `ChildProcess`, `Readable`, `tree-kill` (kills the whole process tree, not just the shell), `fs/promises.stat`, `generateTaskId`, `formatDuration`, `MAX_TASK_OUTPUT_BYTES`/`DISPLAY`, `TaskOutput`. **Reuse**: pattern is gold standard for our cross-platform Bash equivalent.
