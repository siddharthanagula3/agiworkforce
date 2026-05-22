# U1 — utils/ direct files A–G (deep audit)

Source root: `/Users/siddhartha/Desktop/reference/src/utils/`. Scope: alphabetical A–G, excluding `attachments.ts` (M2), `auth.ts` (M3), and the `bash/` subdir (M7). Approx 70 files; 32K LOC across this slice. All cites are `file:line` against the reference checkout. The CLI ("Claude Code") source — these are notes for porting concepts to AGI Workforce's `packages/utils/`.

## 1. Cluster: Lifecycle / shutdown / cleanup

`abortController.ts:16-22` — `createAbortController(maxListeners=50)` wraps `new AbortController()` and calls `setMaxListeners(maxListeners, controller.signal)` to suppress Node's `MaxListenersExceededWarning` (10 by default). `createChildAbortController(parent, …)` at `:68-99` is the gem: it creates a child whose abort propagates from a parent **without** the parent strongly retaining the child — uses `WeakRef<AbortController>` on both directions and `{once:true}` listeners, then auto-removes the parent listener when the child aborts. Module-level `propagateAbort` / `removeAbortHandler` `bind`-time arg passing avoids a per-call closure allocation. Signature pattern we should adopt verbatim — current `packages/runtime` has no equivalent and any long-running session that derives child signals (per-tool, per-stream) leaks listeners.

`combinedAbortSignal.ts:15-46` — combines up to 2 signals + an optional timeout into one. Important detail at `:11`: explicit `setTimeout`+`clearTimeout` instead of `AbortSignal.timeout(ms)` because under Bun the latter "timers are finalized lazily and accumulate in native memory until they fire (measured ~2.4KB/call)". Returns `{signal, cleanup}` so callers can free the timer immediately. We should replicate this in any streaming code that wraps user-provided abort + provider timeout.

`cleanupRegistry.ts` (full file) — global `Set<()=>Promise<void>>`, `registerCleanup(fn)` returns an unregister fn, `runCleanupFunctions()` runs all in parallel via `Promise.all`. Separated from `gracefulShutdown.ts` to avoid circular deps. Drop-in pattern.

`gracefulShutdown.ts:59-100` — synchronous terminal restoration before `process.exit`. Uses `writeSync(1, …)` with hard-coded escape sequences (`DISABLE_MOUSE_TRACKING`, `EXIT_ALT_SCREEN`, `SHOW_CURSOR`, `DBP`/`DFE`, `DISABLE_KITTY_KEYBOARD`, `DISABLE_MODIFY_OTHER_KEYS`). Notable: it unmounts Ink directly **before** writing escape sequences because signal-exit would otherwise re-fire unmount and double-write `1049l`, jumping the cursor over the resume hint. This kind of TTY cleanup precision is not present anywhere in our Tauri or web stack but the desktop TUI in `apps/cli/src/tui/` would benefit.

`backgroundHousekeeping.ts:31-94` — `startBackgroundHousekeeping()` schedules `runVerySlowOps` 10 minutes after start, defers if `getLastInteractionTime() > now - 60s`, calls `cleanupOldMessageFilesInBackground()` then `cleanupOldVersions()`. Ant-only path runs `cleanupNpmCacheForAnthropicPackages` + `cleanupOldVersionsThrottled` every 24h via `setInterval(…).unref()`. Pattern: `unref()` everywhere so housekeeping never holds the loop.

`cleanup.ts:55-130` — `cleanupOldFilesInDirectory(dirPath, cutoffDate, isMessagePath)` reads dir, parses ISO-from-filename via `convertFileNameToDate` at `:48-53` (replaces `T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z` back to `T01:02:03.456Z`), unlinks anything older. `cleanupOldSessionFiles` at `:155-202` walks `projects/<projectDir>/<sessionId>` and removes `.jsonl`/`.cast` files plus tool-results subdirs older than `getCutoffDate()` (default 30 days, configurable via `settings.cleanupPeriodDays`).

## 2. Cluster: Filesystem & path safety

`path.ts:32-85` — `expandPath(path, baseDir?)`. Notable safety: `:48` rejects null bytes (`if (path.includes('\0') || actualBaseDir.includes('\0')) throw new Error('Path contains null bytes')`). `:53-66` handles `''`, `~`, `~/foo`, all NFC-normalized. `:69-76` Windows-specific POSIX→Windows conversion guarded by `/^\/[a-z]\//i`. `:84` final `resolve(actualBaseDir, processedPath).normalize('NFC')`.
`path.ts:109-125` — `getDirectoryForPath(path)` SECURITY-relevant: `:111-114` early-returns `dirname(absolutePath)` for UNC paths (`\\…` or `//…`) **without** any filesystem call, "to prevent NTLM credential leaks." This pattern matters for our `apply-patch` package: any code that statSyncs a user-supplied path on Windows can leak NTLM hashes via SMB.
`path.ts:133-135` — `containsPathTraversal(path)`: `/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)`. Cheap sanity check; doesn't replace canonical resolution.
`path.ts:138` re-exports `sanitizePath` from `sessionStoragePortable.ts` (zero-dep djb2/wyhash). `cachePaths.ts:13-19` reimplements a local `sanitizePath` using `djb2Hash` because cache directory names must remain stable across upgrades — using `Bun.hash` (wyhash) would orphan cache data when Bun is added/removed. Important compatibility lesson for us.

`fsOperations.ts:23-105` — a fully-typed `FsOperations` interface that wraps Node `fs` (sync + promise variants of stat, readdir, unlink, rmdir, mkdir, readFile, statSync, lstatSync, readFileSync, readSync, appendFileSync, copyFileSync, symlinkSync, readlinkSync, realpathSync, mkdirSync, readdirSync, isDirEmptySync, rmSync, createWriteStream, …). `getFsImplementation()` returns the singleton; `safeResolvePath(fs, p)` returns `{resolvedPath, isSymlink}` and is used everywhere a symlink decision is needed. We should adopt this exact interface as the `FileAdapter` boundary in `packages/data-layer` — it's the cleanest small-surface fs abstraction in the codebase.

`file.ts:39-46` — `pathExists` (try `stat`, catch → false). `:48` `MAX_OUTPUT_SIZE = 0.25 * 1024 * 1024` (256 KB). `:66-82` `getFileModificationTime[Async]` uses `Math.floor(stat.mtimeMs)` to suppress sub-millisecond drift from IDE watchers. `:84-98` `writeTextContent(path, content, encoding, endings)` performs CRLF normalize-then-rejoin so a `new_string` already containing `\r\n` doesn't become `\r\r\n`. `:137-141` `convertLeadingTabsToSpaces` short-circuits when content has no `\t` (regex would otherwise scan every line on no-match). `:155-170` `getDisplayPath` — relative to cwd if inside, `~` if under home, else absolute. Reference for our display-path helper.

`fileRead.ts:20-49` — `detectEncodingForResolvedPath(path)` reads first 4 KB via `readSync({length:4096})`, BOM-detects `utf16le` (FF FE) and `utf8` (EF BB BF), falls back to `utf8` for non-empty and **also for empty** ("This fixes a bug where writing emojis/CJK to empty files caused corruption"). `:51-65` `detectLineEndingsForString` — single linear pass. `:75-98` `readFileSyncWithMetadata` returns `{content, encoding, lineEndings}` in one filesystem pass, normalizing CRLF→LF; this is the API the `Edit`-class tools want.

`fileReadCache.ts` (full file) — singleton `FileReadCache` LRU-by-size-1000 keyed on file path; cache invalidation by `stats.mtimeMs` equality. Returns `{content, encoding}`.

`fileStateCache.ts:1-93` — `FileStateCache` wraps `lru-cache` with `maxEntries` + `maxSizeBytes` (default 25 MB). Crucial detail: `:42-43` keys all access through `normalize(key)` so `/foo/../bar` and `\foo` map to the same entry on Windows. `FileState` at `:1-15` carries `isPartialView?: boolean` flag — `claudemd.ts` sets this when content was injected but doesn't match disk (HTML comments stripped, frontmatter stripped, MEMORY.md truncated). Our `Read`/`Edit` tools should also distinguish "what model saw" from "raw disk bytes".

`generatedFiles.ts:9-77` — `EXCLUDED_FILENAMES`, `EXCLUDED_EXTENSIONS`, `EXCLUDED_DIRECTORIES`, `EXCLUDED_FILENAME_PATTERNS` (regex list). `isGeneratedFile(path)` — exact filename → ext → compound ext (`.min.js`) → directory pattern (`/dist/`, `/node_modules/`, `/.next/`, …) → regex pattern (`*.generated.*`, `*.pb.go`, …). Used by `commitAttribution` to filter Linguist-style vendored content out of attribution stats. Drop-in for our package.

`glob.ts:17-130` — `extractGlobBaseDirectory(pattern)` separates static prefix from glob suffix (`/foo/bar/*.ts` → `{baseDir:'/foo/bar', relativePattern:'*.ts'}`). Handles Windows root quirks at `:52-61` (drive root `C:` ≠ `C:/`). `glob()` itself shells out to ripgrep with `--files --glob …`, excludes via `--glob !pattern`, sorts by modtime, paginates by `offset/limit`. Single-source-of-truth for the project's globbing — does NOT use `fast-glob`, `glob`, `picomatch` (they depend on it but only for static matches).

`getWorktreePathsPortable.ts` (full file, 27 LOC) — pure-zero-dep `git worktree list --porcelain` parser. Designed to be importable from contexts (vscode extension, SDK) that can't pull in execa. We should ship the equivalent in `packages/utils` for the desktop+web split.

## 3. Cluster: Provider / API plumbing

`api.ts:119-265` — `toolToAPISchema(tool, options)`. Two-layer caching: (1) module-level `getToolSchemaCache()` keyed on `tool.name + jsonStringify(inputJSONSchema)` — name-only keying broke `StructuredOutput` tools (PR#25424, 5.4% → 51% error rate); (2) per-request overlay for `defer_loading` and `cache_control`. `:165-167` swarm fields are filtered out at runtime when `!isAgentSwarmsEnabled()`.

`api.ts:198-205` — `eager_input_streaming` is gated to `getAPIProvider() === 'firstParty'` && `isFirstPartyAnthropicBaseUrl()` because LiteLLM/Bedrock/Vertex with Claude 4.5 reject this field with 400. `:243-260` `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` strips all extra fields except `cache_control` from tool schemas at the choke point — a pattern we should replicate as a single egress filter in `packages/llm-normalize`.

`api.ts:281-435` — `splitSysPromptPrefix(systemPrompt, options?)` is the prompt-cache-scope decision tree. Three modes:

1. MCP tools present (`skipGlobalCacheForSystemPrompt=true`) → 3 blocks org-cached, no global.
2. Global-cache feature ON + dynamic boundary marker found → 4 blocks: attribution(null), prefix(null), static(global), dynamic(null).
3. Default (3P providers / no boundary) → 3 blocks org-cached.
   The dynamic-boundary marker is `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` from `constants/prompts.ts`, inserted by the prompt builder at the cut between cacheable and per-turn material. Powerful concept; our `packages/chat` does not have any equivalent of "scope-aware cache control" — provider adapters all flatten into one block.

`api.ts:437-474` — `appendSystemContext` and `prependUserContext` (for system reminders). `prependUserContext` skips when `NODE_ENV==='test'`, otherwise prepends a single user message containing a `<system-reminder>` block — exact same shape we observed in this very task's prompt.

`api.ts:566-718` — `normalizeToolInput(tool, input, agentId)` and `normalizeToolInputForAPI(tool, input)` are the symmetric pair: pre-execution we inject extra fields (`Bash` strips `cd cwd && `, replaces `\\;` for find -exec; `FileEdit` synthesizes single-edit array; `ExitPlanModeV2` reads plan from disk and injects), pre-API-send we strip them so the API schema (which doesn't know about `plan` or `planFilePath`) doesn't reject. Old `--resume`'d transcripts where pre-PR-#20357 sessions had synthesized `old_string`/`new_string` get cleaned in `:702-714`. Pattern we should replicate in `packages/providers/*` adapters: a `wireFormat` boundary distinct from internal tool input.

`apiPreconnect.ts:31-71` — `preconnectAnthropicApi()`: fire-and-forget HEAD to base URL during init, leveraging Bun's keep-alive pool. Skips when proxy/mTLS/unix-socket/Bedrock/Vertex/Foundry — anywhere the SDK uses a custom dispatcher that wouldn't reuse the pool. ~100-200 ms TCP+TLS overlap. `apps/web` already has a similar idea via `<link rel=preconnect>` but desktop/CLI don't preconnect at all.

`betas.ts:33-87` — `ALLOWED_SDK_BETAS = [CONTEXT_1M_BETA_HEADER]`. `partitionBetasByAllowlist` and `filterAllowedSdkBetas` warn-and-drop unknown betas; subscribers (`isClaudeAISubscriber()`) get all betas dropped because subscribers aren't allowed custom betas. Important threat-model rule: SDK-supplied betas are an attacker surface (an external integration could try to flip on `tools-2025-12-XX-experimental` and cause unexpected behavior).
`betas.ts:142-157` — `modelSupportsStructuredOutputs(model)` is provider-aware: `firstParty`/`foundry` only, model-string includes `claude-sonnet-4-6|4-5|opus-4-1|4-5|4-6|haiku-4-5`. `:160-195` `modelSupportsAutoMode(model)` is ant-restricted; uses GrowthBook `tengu_auto_mode_config.allowModels` as override list.

`extraUsage.ts` (full file, 23 LOC) — `isBilledAsExtraUsage(model, isFastMode, isOpus1mMerged)`: subscribers + (fast mode OR Opus 4.6 1m OR Sonnet 4.6 1m, with Opus-merged carve-out). Captures the entire pricing-edge logic in 23 lines.

## 4. Cluster: Auth / credentials / billing

`authFileDescriptor.ts:30-50` — `maybePersistTokenForSubprocesses` writes tokens to `/home/claude/.claude/remote/.{oauth_token,api_key,session_ingress_token}` with `mode 0o600`, **only** under `CLAUDE_CODE_REMOTE`. `:97-166` `getCredentialFromFd` reads from a pipe FD env var (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` / `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`) using `/dev/fd/$N` (macOS/BSD) or `/proc/self/fd/$N` (Linux), with fallback to the well-known file when the FD env var is absent or read fails (subprocess case). Cached in global state. This is how CCR's environment-manager hands credentials to the CLI; the FD design avoids leaving tokens on disk in the parent process while still giving subprocesses access via the disk fallback. Concept worth reusing for our managed-cloud teammates.

`authPortable.ts` (full file, 19 LOC) — only two helpers: `maybeRemoveApiKeyFromMacOSKeychainThrows()` shells out to `security delete-generic-password`; `normalizeApiKeyForConfig(key) = key.slice(-20)` keeps the last 20 chars as a stable identifier (full key never logged).

`awsAuthStatusManager.ts:18-81` — singleton with `isAuthenticating`, `output[]`, `error?`, exposed via `createSignal`. Subscribers (React) re-render on AWS/Vertex auth refresh events. Pattern we already use; comment at `:6-8` flags that name is legacy-AWS but applies to all cloud-provider auth.

`aws.ts:25-47` — `isValidAwsStsOutput(obj)` typeguard for `{Credentials:{AccessKeyId,SecretAccessKey,SessionToken,…}}` with non-empty string checks; `:61-74` `clearAwsIniCache()` calls `fromIni({ignoreCache:true})` to refresh provider cache after credential file changes. Lessons: typeguard before consuming any external JSON; the SDK's iniProvider has internal cache that needs explicit invalidation.

`billing.ts:10-78` — `hasConsoleBillingAccess()` and `hasClaudeAiBillingAccess()` check role tuples (`['admin','billing']` for org, `['workspace_admin','workspace_billing']` for workspace; consumer plans Max/Pro always pass; team/enterprise need `['admin','billing','owner','primary_owner']`). `setMockBillingAccessOverride` for `/mock-limits` testing. Cleanest model of two parallel billing universes — useful template for our Hobby/Pro/Pro+/Max gating.

## 5. Cluster: Telemetry / analytics integration points

Telemetry hook patterns are **everywhere**:

- `claudemd.ts:411-415` — emits `tengu_claude_md_permission_error` with `is_access_error=1, has_home_dir=0|1` (no path leak).
- `claudemd.ts:1027-1040` — `tengu_claudemd__initial_load` with file_count, total_content_length, per-type counts.
- `attribution.ts:374-376` — generates "X% N-shotted by model" attribution string from in-process state plus transcript scan.
- `fileOperationAnalytics.ts:9-71` — `hashFilePath` truncates SHA256 to 16 chars; `hashFileContent` uses 64-char SHA256 but only when content < 100 KB (memory exhaustion guard for base64 images). `logFileOperation({operation, tool, filePath, content?, type?})` is the single sink for `read|write|edit` events.
- `diff.ts:75-78` — `tengu_file_changed{lines_added,lines_removed}` emitted from `countLinesChanged`.

Cross-cutting `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` brand type (`agentContext.ts:25`, others). The deliberately ugly name is a code-review prompt: "look at every callsite that produces this and verify the value contains no PII." `errors.ts:93-101` mirrors with `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`. We should adopt this naming convention.

`diagLogs.ts:27-94` — `logForDiagnosticsNoPII(level, event, data?)` writes JSONL to `process.env.CLAUDE_CODE_DIAGNOSTICS_FILE`. Comment at `:21-22`: **must NOT contain any PII (file paths, project names, repo names, prompts)**. `withDiagnosticsTiming(event, fn, getData?)` emits `<event>_started` and `<event>_completed{duration_ms,...}`.

`agentContext.ts:24-179` — `AsyncLocalStorage<AgentContext>` with a discriminated union `SubagentContext | TeammateAgentContext`. The "WHY" comment at `:17-22` is the headline pattern: "When agents are backgrounded (ctrl+b), multiple agents can run concurrently in the same process. AppState is a single shared state that would be overwritten… AsyncLocalStorage isolates each async execution chain." This is the right pattern for our concurrent-conversation infrastructure. `consumeInvokingRequestId()` at `:163-178` implements sparse-edge semantics: invokingRequestId appears on **exactly one** terminal API event per spawn/resume so downstream a non-NULL value marks a boundary.

`agentId.ts:38-99` — agent IDs are deterministic strings `agentName@teamName`; request IDs are `requestType-timestamp@agentId`. Reproducibility & reconnection after crash benefit. `parseAgentId` uses `indexOf('@')` not split because team names CAN contain `@` per spec (no, actually they can't — see `:30-32` constraint — but this implementation is robust to that).

`activityManager.ts:13-164` — singleton tracker for user vs CLI active time, with deduplication (multiple overlapping operations only count once). 5-second user activity timeout. `:90-92`: if `startCLIActivity(opId)` is called again with the same id, it force-cleans the previous one (component crashes/unmounts that didn't end cleanly). `trackOperation(opId, fn)` is the convenience wrapper. Drop-in for our usage analytics.

`fingerprint.ts` (full file) — `FINGERPRINT_SALT = '59cf53e54c78'` (hardcoded — must match backend), `computeFingerprint(messageText, version)` computes `SHA256(SALT + msg[4] + msg[7] + msg[20] + version).slice(0,3)` — 3-character attribution fingerprint sent on every API request. Comment at `:43-44`: "Do not change this method without careful coordination with 1P and 3P (Bedrock, Vertex, Azure) APIs." This is how Anthropic detects "Claude Code"-originated traffic across providers.

## 6. Cluster: Memory / CLAUDE.md (`claudemd.ts`, 1479 LOC)

`claudemd.ts:1-26` — load-order spec: Managed → User → Project → Local. Discovery: User from home dir; Project/Local by traversing cwd → root. `@import` directive: `@./path`, `@~/path`, `@/path`, or relative `@path`; works in leaf text nodes only (not code blocks/spans); circular references prevented by `processedPaths: Set<string>`; non-existent files silently ignored.

`claudemd.ts:96-227` — `TEXT_FILE_EXTENSIONS` is a hardcoded allowlist (~120 extensions). Anything outside (binaries, images, PDFs) is skipped from `@include` to prevent loading binary into context.

`claudemd.ts:292-334` — `stripHtmlComments(content)`: lex with `marked` (gfm:false), keep only `html`-block tokens that begin with `<!--` and contain `-->`, strip via `<!--[\s\S]*?-->/g` regex on the `token.raw`. Keeps inline comments inside paragraphs intact. **Unclosed comments are preserved** so a typo doesn't silently swallow the rest of the file.

`claudemd.ts:343-400` — `parseMemoryFileContent(rawContent, filePath, type, includeBasePath?)`. Important guard at `:362-374`: `gfm:false` is required because `~/path` would tokenize as strikethrough under GFM. Detection at `:387-388`: `contentDiffersFromDisk = finalContent !== rawContent` (covers HTML strip, frontmatter strip, AutoMem/TeamMem truncation). When true, `rawContent` is preserved alongside `content` so callers can cache an "isPartialView" readFileState entry — model has only seen modified content; Edit/Write must re-Read first.

`claudemd.ts:451-535` — `extractIncludePathsFromTokens(tokens, basePath)`. Regex `/(?:^|\s)@((?:[^\s\\]|\\ )+)/g` accepts escaped spaces. Strips fragment identifiers (`#heading`). Fast prefilter via `path.startsWith` to drop @-mentions of identifiers. Recurses into `tokens.tokens` and `tokens.items` (lists). Skips `code`/`codespan` tokens. **Special handling for `html` tokens**: comments are stripped and the residue (e.g. `<!-- note --> @./file.md`) is re-scanned for `@paths` — so a comment doesn't completely hide an include directive that follows it on the same line.

`claudemd.ts:547-612` — `isClaudeMdExcluded(filePath, type)` honors `settings.claudeMdExcludes` patterns. **Symlink-aware**: builds an expanded pattern list that also includes realpath-resolved versions of absolute patterns (`/tmp` → `/private/tmp` on macOS). Glob-static-prefix is resolved separately so `/tmp/project/**/*.md` becomes both literally and `(/private/tmp)/project/**/*.md`. Uses `picomatch.isMatch` with `{dot:true}`.

`claudemd.ts:618-685` — `processMemoryFile(filePath, type, processedPaths, includeExternal, depth, parent?)`. `MAX_INCLUDE_DEPTH = 5` (line 537). Symlink-resolves early; adds both raw and resolved path to `processedPaths` to break symlink cycles. Includes are processed BFS — main file first, then children — and `pathInOriginalCwd` is used to honor an external-include approval gate (`hasClaudeMdExternalIncludesApproved` in project config).

`claudemd.ts:697-788` — `processMdRules({rulesDir,type,…,conditionalRule})` walks `.claude/rules/*.md` recursively. `conditionalRule:true` filters to files WITH frontmatter `paths:` (path-conditional rules); `false` filters to files WITHOUT (always-on rules). `visitedDirs: Set` prevents directory cycles via symlinks. Errors `ENOENT|EACCES|ENOTDIR` are silently swallowed; any other error is propagated.

`claudemd.ts:790-1049` — `getMemoryFiles = memoize(async forceIncludeExternal=false)`. Order: Managed → User (always-include-external because user memory is already user-controlled) → cwd-up walk for Project + Local → `--add-dir` paths under env gate `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` → AutoMem (memdir entrypoint) → TeamMem (gated by `feature('TEAMMEM')`).

**Worktree fix at `:868-934`** — when running from a git worktree nested inside its main repo, the upward walk passes through both worktree root and main repo root and would load CLAUDE.md twice. Skip Project files (checked-in) from dirs above the worktree but inside the main repo. CLAUDE.local.md is gitignored so it only exists once and is still loaded. References issue #29599.

This entire file is the canonical implementation of memory loading. We don't ship anything equivalent. For AGI Workforce's "Memory" surface (mobile P1) the spec should match this load order verbatim.

## 7. Cluster: Compaction / context analysis (`analyzeContext.ts`, 1382 LOC)

`analyzeContext.ts:75` — `TOOL_TOKEN_COUNT_OVERHEAD = 500`. Anthropic API adds a tool-prompt preamble of ~500 tokens once per call; counting tools individually multiplies that by N. This constant is subtracted from per-tool counts so display shows actual per-tool content size.

`analyzeContext.ts:77-109` — `countTokensWithFallback(messages, tools)`: tries `countMessagesTokensWithAPI` first; falls back to `countTokensViaHaikuFallback` if API returns null or throws. Logs but doesn't propagate.

`analyzeContext.ts:191-232` — `ContextData` shape:

```
categories: ContextCategory[] // {name, tokens, color, isDeferred?}
totalTokens, maxTokens, rawMaxTokens, percentage
gridRows: GridSquare[][] // 10x10 or 20x10 viz grid
model
memoryFiles: {path, type, tokens}[]
mcpTools: {name, serverName, tokens, isLoaded?}[]
deferredBuiltinTools? (ant-only)
systemTools? (ant-only, with proportional-split estimates)
systemPromptSections? (ant-only)
agents: {agentType, source, tokens}[]
slashCommands?: {totalCommands, includedCommands, tokens}
skills?: {totalSkills, includedSkills, tokens, skillFrontmatter[]}
autoCompactThreshold?, isAutoCompactEnabled
messageBreakdown? // call/result tokens by tool, attachment tokens
apiUsage: {input, output, cache_creation, cache_read} | null
```

This is the most thorough context-budget breakdown I've seen — covers all 6 axes (system, tools, MCP, agents, memory, skills) plus message-level subcategories.

`analyzeContext.ts:434-491` — Built-in tool counting separates `alwaysLoadedTools` from `deferredBuiltinTools` (ToolSearch). Per-tool breakdown for ant users uses **proportional split**: locally estimate JSON-schema tokens via `roughTokenCountEstimation`, distribute the bulk-counted total proportionally minus `TOOL_TOKEN_COUNT_OVERHEAD`. Cheap, accurate enough for display, single API call.

`analyzeContext.ts:616-730` — `countMcpToolTokens` uses bulk API call once + per-tool proportional split for display. Crucial for performance (instead of N calls). For loaded vs deferred: scans messages for `tool_use` blocks matching MCP tool names; loaded MCP tools count toward usage, deferred tokens are tracked separately for display.

`analyzeContext.ts:1090-1146` — `actualUsage = sum(non-deferred categories)`; reserved tokens = either autocompact buffer or manual compact buffer. **Reactive-only mode (`tengu_cobalt_raccoon`)** and **context-collapse (`tengu_marble_origami`)** suppress the reserved buffer entirely because the threshold ladder is owned elsewhere — showing it would lie. Comments at `:1108-1127` document the exact reasoning.

`analyzeContext.ts:1176-1295` — Grid sizing scales with model:

- 1M context: 20×10 (or 5×10 narrow)
- 200k: 10×10 (or 5×5 narrow)
  Squares preserve fractional fullness — the partial square gets `squareFullness = fractionalPart`. Reserved category placed at end so the visualization reads "used → free → reserved" in flow order.

`contextAnalysis.ts:27-97` — separate, simpler `analyzeContext(messages)` that returns `TokenStats` with **duplicate file read detection**: tracks `Read` tool's `file_path` input → matches with subsequent `tool_result` to compute `count` and `totalTokens` per file. Threshold `count > 1` → all-but-first reads are duplicates whose tokens could have been saved. Big win for our chat-store: we re-read same files frequently in long sessions.

`contextSuggestions.ts:21-235` — generates user-facing suggestions when:

- Context > 80% (`NEAR_CAPACITY_PERCENT`): warn
- Tool result > 15% AND > 10k tokens: tool-specific advice (Bash: pipe through head/tail/grep; Read: use offset/limit; Grep: narrow patterns; WebFetch: extract specifics)
- Read result > 5% bloat AND > 10k: re-reading guidance
- Memory > 5% AND > 5k: list top-3 largest files, pruning hint
- AutoCompact disabled AND 50%–80%: enable suggestion

These thresholds are concrete. We should ship the same suggestion engine in our chat surface — none of our packages produce actionable "you're using too much of X" hints.

## 8. Cluster: Conversation lifecycle / session management

`conversationRecovery.ts:154-200+` (only first 200 read) — `deserializeMessages`/`deserializeMessagesWithInterruptDetection`. Pipeline: `migrateLegacyAttachmentTypes` (`new_file`→`file`, `new_directory`→`directory`, backfill `displayPath`) → strip invalid `permissionMode` (foreign-build values) → `filterUnresolvedToolUses` → `filterOrphanedThinkingOnlyMessages` (these break API on resume — streaming yields separate messages per content block, interleaved user messages prevent merge by `message.id`) → `filterWhitespaceOnlyAssistantMessages` (model output `\n\n` before thinking when user cancels mid-stream).

`concurrentSessions.ts:31-204` — registers PID files in `~/.claude/sessions/` for `claude ps`. `:64-72` registerCleanup for unlinking. `:85-95` writes JSON with pid, sessionId, cwd, startedAt, kind ('interactive'|'bg'|'daemon'|'daemon-worker'), entrypoint. `:101-105` updates pid file on session-id change (--resume). `:181-203` sweep walks PID files; `/^\d+\.json$/` strict filename guard at `:186` — without it, `parseInt`'s lenient prefix-parsing was sweeping `2026-03-14_notes.md` as PID 2026 (issue #34210, "silent user data loss"). WSL skips sweep because Windows PIDs aren't probeable (false delete). Same anti-pattern lurks anywhere we list-and-filter-numeric in our codebase.

`crossProjectResume.ts:30-75` — gates "resume from another project" decision: `--resume` against a log from a different project path. Same-repo worktree → resume directly; different repo → generate `cd … && claude --resume <id>` command. Worktree detection ant-gated for staged rollout.

`agenticSessionSearch.ts:146-307` — agentic search across stored sessions. Pre-filters sessions by query containment in title/customTitle/tag/branch/summary/firstPrompt/transcript-excerpt, then up to `MAX_SESSIONS_TO_SEARCH=100` are sent to a small/fast model (`getSmallFastModel()`) with instruction to return relevant indices. System prompt at `:15-48` is well-tuned ("be VERY inclusive", "when in doubt, INCLUDE"). Lite logs are loaded to full via `loadFullLog`. Concept reusable for our /chat search across cloud-stored conversations.

`commitAttribution.ts` (961 LOC, not read in full but referenced by `attribution.ts`) computes per-file Claude vs human authorship percentages from the git commit/diff state. `attribution.ts:297-393` builds the enhanced PR attribution: "🤖 Generated with [Claude Code]() (93% 3-shotted by claude-opus-4-5, 2 memories recalled)" — combines `claudePercent`, `promptCount` (from transcript scan, count user-text messages, exclude tool_results and `<bash-input>`/`<bash-stdout>` etc.), and `memoryAccessCount` (count of `Read|Grep|Glob|FileEdit|FileWrite` tool_use blocks targeting memory files).

## 9. Cluster: Streaming / IO building blocks

`bufferedWriter.ts` (full file) — `createBufferedWriter({writeFn, flushIntervalMs=1000, maxBufferSize=100, maxBufferBytes=Infinity, immediateMode=false})`. Returns `{write, flush, dispose}`. **Two flush modes**:

- `flush()` — synchronous drain.
- `flushDeferred()` — detach buffer synchronously into `pendingOverflow`, schedule `setImmediate(() => writeFn(...))`. Caller never waits on writeFn even if it's `appendFileSync`. Crucial for hot paths (errorLogSink) where blocking on a sync write inside React render would stall the UI.

`asciicast.ts:140-238` — `installAsciicastRecorder()` wraps `process.stdout.write` to capture all terminal output as asciicast v2 (`[elapsed, 'o', text]` lines). Includes resize event recording (`'r'` event). Buffered via `createBufferedWriter` with 500 ms flush, 50-line / 10 MB caps. Path computed once and cached in `recordingState`; renames recording file when session ID changes via `--resume` (`renameRecordingForSession`). Drop-in for any "share this terminal session" feature.

`completionCache.ts:24-167` — shell-completion install. Detects shell from `$SHELL`, locates `.zshrc`/`.bashrc`/fish config, writes `claude completion <shell>` output to a cache file in `~/.claude/`, idempotently appends a source line to rc file if not already present. Keep this around for desktop+CLI install flow.

`crossProjectResume.ts:43-44` — uses `quote([log.projectPath])` from `bash/shellQuote.js` to safely build `cd <quoted-path> && claude --resume <id>`. Important pattern: never construct shell commands with raw user input.

## 10. Cluster: Cron / scheduling

`cron.ts:1-308` — minimal 5-field cron parser (no `L`, `W`, `?`, name aliases). `expandField(field, range)` supports `*`, `*/N`, `N-M`, `N-M/S`, comma-lists, `7` as Sunday alias (DOW). `computeNextCronRun(fields, from)` walks minute-by-minute up to 366 days. **DST notes at `:113-118`**: spring-forward gap → fixed-hour cron skips that day; fall-back repeat fires once. `cronToHuman(cron, opts)` covers common patterns ("Every minute", "Every hour at :30", "Every day at 9:00 AM", "Weekdays at 9:00", "Every Tuesday at 4:00 PM"); falls back to raw cron for anything else. UTC mode for CCR remote triggers handles midnight-crossing weekday calculation.

`cronJitterConfig.ts:1-75` — `tengu_kairos_cron_config` GrowthBook-backed jitter config with Zod validation. Fields: `recurringFrac, recurringCapMs, oneShotMaxMs, oneShotFloorMs, oneShotMinuteMod, recurringMaxAgeMs`. Refresh every 60 s — short because this is an incident lever.

`cronTasksLock.ts:1-195` — scheduler lease lock for `.claude/scheduled_tasks.json`. Pattern mirrors `computerUseLock.ts`: O_EXCL atomic create (`flag:'wx'`), PID liveness probe, stale-lock recovery, registerCleanup. `tryAcquireSchedulerLock` returns `true` if acquired or already-ours, `false` if another live PID holds it. `lastBlockedBy` suppresses repeat log lines when polling. **Subtle**: after `--resume` the session ID is restored but the PID is new — lock file is rewritten so other sessions see a live PID and don't steal it.

`cronScheduler.ts` (565 LOC, not read) — the scheduler proper.
`cronTasks.ts` (458 LOC, not read) — task definitions + jitter math.

## 11. Cluster: Display / UX

`format.ts:9-308` — pure display formatters (zero-Ink). `formatFileSize` (KB/MB/GB), `formatDuration({hideTrailingZeros, mostSignificantOnly})`, cached `Intl.NumberFormat` for compact tokens, `formatRelativeTime(date, {style:'narrow'|'short'|'long', numeric, now?})` with custom narrow units (`s/m/h/d/w/mo/y`), `formatLogMetadata({modified,messageCount,fileSize?,gitBranch,tag,agentSetting,prNumber})` joins parts with " · ", `formatResetTime(timestampInSeconds, showTimezone, showTime)`. `truncate*` helpers re-exported from `truncate.ts` (back-compat shim).

`formatBriefTimestamp.ts:16-77` — message-app-style timestamp scaling: same day → "1:30 PM"; within 6 days → "Sunday, 4:15 PM"; older → "Sunday, Feb 20, 4:30 PM". Honors POSIX `LC_ALL`/`LC_TIME`/`LANG` (Bun ignores them on macOS so we convert to BCP 47 ourselves). `now` is injectable for tests.

`displayTags.ts:15-51` — `XML_TAG_BLOCK_PATTERN = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g`. **Lowercase-only** regex (`[a-z]`) so user prose mentioning JSX/HTML components ("fix the `<Button>` layout", `<!DOCTYPE html>`) passes through. Strips system-injected tags from titles/UI without an ever-growing allowlist. `stripIdeContextTags` is the narrower variant (only `ide_opened_file|ide_selection`) used by textForResubmit so UP-arrow preserves user-typed `<code>` blocks.

`autoRunIssue.tsx` (full file) — React component (compiled via React Compiler memo cache) that shows "Running feedback capture…" + ESC to cancel. `shouldAutoRunIssue(reason)` is currently always-false in external builds (the `"external" !== 'ant'` literal at `:84` reveals this is a build-time substitution). Pattern: ant-only behavior compiled out via string replacement.

## 12. Cluster: Provider/model coupling we'd need to invert

The slice is **deeply Anthropic-coupled**, but the coupling is structured rather than scattered. Inversion candidates:

1. `api.ts:281-435` (sysprompt cache scope) — concept generalizes (any provider with prompt-cache: OpenAI cached_completions, Vertex cached_content). The 3-vs-4-block decision isn't Anthropic-only.

2. `betas.ts:142-195` — `modelSupportsX()` boolean fans (Structured Outputs, Auto Mode, ISP, Context Management, Web Search, 1M context) take model strings and check substrings. **Provider-aware**: `getAPIProvider() === 'firstParty' | 'foundry'` gates many features. Ports cleanly to our `ProviderAdapter.catalog()` returning capabilities.

3. `effort.ts:23-329` — entirely Anthropic effort-level model. `modelSupportsEffort` and `modelSupportsMaxEffort` substring-match `opus-4-6|sonnet-4-6`; `get3PModelCapabilityOverride(model, 'effort')` is the existing extension hook. Important: env var `CLAUDE_CODE_ALWAYS_ENABLE_EFFORT` force-enables for unknown models. This is the cleanest example of how to extend a "fixed list" to 3P.

4. `advisor.ts:60-128` — advisor tool gating. `modelSupportsAdvisor` substring-checks `opus-4-6|sonnet-4-6`. The advisor tool itself is server-side (`server_tool_use`), specific to Anthropic API. To replicate cross-provider we'd implement a client-side advisor that calls a stronger model (whatever the user's "strong" model is — Claude 4.6, GPT-5.4, Gemini 3.1) with the conversation transcript. The instructions at `:130-145` are excellent and provider-agnostic.

5. `attribution.ts:73-78` — hardcoded fallback `"Claude Opus 4.6"` for unrecognized models (anti-codename-leak). Our equivalent should be `"GPT-5.4"`/`"Claude Opus 4.7"`/etc. depending on provider, or generic `"AI assistant"`.

6. `fingerprint.ts:8` — `FINGERPRINT_SALT` is shared with backend. Our equivalent for cross-provider fingerprinting (if we want one) would need our own salt + server-side validator.

7. `apiPreconnect.ts:44-54` — preconnect skips proxy/mTLS/Bedrock/Vertex/Foundry. For us, multi-provider preconnect should fan out to each enabled provider's base URL on init.

## 13. Cluster: Misc gems (high impact, low LOC)

- `array.ts` (13 LOC) — `intersperse(as, sep)`, `count(arr, pred)`, `uniq(xs)`. Useful primitives.
- `crypto.ts` (13 LOC) — explicit `import {randomUUID}; export {randomUUID}` because re-export syntax breaks under Bun bytecode (PR #20957/#21178 regression). Reference for any package that wants browser+node parity via the `package.json:browser` field.
- `CircularBuffer.ts` (84 LOC) — fixed-capacity ring buffer. `add`, `addAll`, `getRecent(count)`, `toArray()`, `clear()`. Drop-in for our event-stream rolling windows.
- `claudeCodeHints.ts:53-194` — `<claude-code-hint v="1" type="plugin" value="name@marketplace" />`. Self-closing XML protocol for CLIs/SDKs (running under the harness) to emit recommendations to stderr; harness scans output, strips hints before model sees, surfaces a single install prompt per session. Generic, reusable concept for ANY tool that wants to silently inform the harness of recommendations.
- `binaryCheck.ts:14-46` — `isBinaryInstalled(command)` with session-scope `Map<string, boolean>` cache; uses `which` from `./which.js`. We rebuild this dance in 5 places across the desktop/CLI codebase.
- `controlMessageCompat.ts` — normalizes camelCase `requestId` → snake_case `request_id` on incoming control messages because old iOS app builds had a missing Swift `CodingKeys` mapping. **Cross-surface compatibility shim** that costs 33 LOC and fixed a silent message-drop bug.
- `embeddedTools.ts` (29 LOC) — checks `EMBEDDED_SEARCH_TOOLS` env var to decide whether `find`/`grep` are bun-binary-shadowed shell functions vs real binaries. `embeddedSearchToolsBinaryPath() = process.execPath`. Concept: ship sidecar binaries inside the main bun executable.
- `directMemberMessage.ts:5-20` — `parseDirectMemberMessage(input)` matches `^@([\w-]+)\s+(.+)$/s`. Routes user input "starts with @name" to a teammate without sending to model. Useful pattern for our team-chat surface.
- `fpsTracker.ts` — minimal frame-time tracker; `low1PctFps` uses `p99FrameTimeMs` (sort desc, take ceil(1%)-1). Drop-in for our React render perf tracking.
- `findExecutable.ts:11-17` — replaces spawn-rx's `findActualExecutable` (which dragged in 313 KB of rxjs) with a 7-line wrapper around `whichSync`. Bundle hygiene example.
- `editor.ts:81-184` — `openFileInExternalEditor(filePath, line?)` distinguishes GUI editors (code, cursor, windsurf, codium, subl, atom, gedit, notepad++; spawn detached; VS Code uses `-g file:line`, subl uses `file:line`) from terminal editors (vi/vim/nvim/nano/emacs/pico/micro/helix/hx; alt-screen handoff via `inkInstance.enterAlternateScreen`/`exitAlternateScreen`; `+N` arg; on Windows uses `shell:true` with explicit quoting because cmd.exe can't execute .cmd/.bat directly via CreateProcess).
- `errors.ts:111-238` — full taxonomy: `ClaudeError`, `MalformedCommandError`, `AbortError`, `ConfigParseError`, `ShellError`, `TeleportOperationError`, `TelemetrySafeError_I_VERIFIED_…`. Plus utilities: `isAbortError`, `toError`, `errorMessage`, `getErrnoCode`, `isENOENT`, `isFsInaccessible` (ENOENT|EACCES|EPERM|ENOTDIR|ELOOP), `classifyAxiosError(e) → {kind:'auth'|'timeout'|'network'|'http'|'other', status?, message}`, `shortErrorStack(e, maxFrames=5)` (saves 500-2000 chars in tool_results). Replace our scattered `instanceof Error` checks with this set.
- `frontmatterParser.ts:9-60` (header read) — `FrontmatterData` schema is the union of every frontmatter field used by skills/commands/agents/memory: `allowed-tools`, `description`, `type`, `argument-hint`, `when_to_use`, `version`, `hide-from-slash-command-tool`, `model`, `skills`, `user-invocable`, `hooks`, `effort`, `context: 'inline'|'fork'`, `agent`, `paths`, `shell`. Single source of truth for our command/skill spec.

## 14. Inventory cross-ref

- **Memory** — `claudemd.ts` is THE memory loader; `analyzeContext.ts:319-361` counts memory tokens; `attribution.ts:213-243` counts memory accesses for PR attribution.
- **Compaction** — `analyzeContext.ts:1090-1147` (autocompact buffer math + reactive/collapse suppression); `context.ts:114-144` (`calculateContextPercentages`, `getModelMaxOutputTokens`); `contextSuggestions.ts` (auto-compact-disabled hint at 50%).
- **Auto-mode classifier** — `autoModeDenials.ts` (rolling 20-deep buffer of recent denials, `feature('TRANSCRIPT_CLASSIFIER')` gated); `classifierApprovals.ts` (rolling map of auto-approved tool_use_ids by classifier kind); `betas.ts:160-195` `modelSupportsAutoMode` with allowlist+denylist+GrowthBook override.
- **Trust + Safety** — `caCertsConfig.ts` warns about trust-dialog ordering; `auth.ts` (out of scope, M3) is the bulk; `attribution.ts:53-55` `isUndercover()` short-circuits; `errors.ts` `TelemetrySafeError_I_VERIFIED_…`; `path.ts:111-114` UNC NTLM-leak guard; `editor.ts` POSIX argv vs Windows shell:true distinction (RCE from malicious filename).
- **Token-counting** — `analyzeContext.ts:75` overhead constant; lives mostly in `services/tokenEstimation.ts` (out of scope) but `roughTokenCountEstimation` is referenced from `:421-431` for proportional split.

## 15. Dead code / tree-shaken stubs

- `bundledMode.ts:7-22` — `isRunningWithBun()` and `isInBundledMode()`. Used as guard before referencing `Bun.embeddedFiles`.
- `extraUsage.ts` — only invoked from one site (statusline subscription), candidate for inlining.
- `autoRunIssue.tsx:84` — `if ("external" !== 'ant')` — build-time substitution, dead branch in external builds.
- `feature(...)` macros from `bun:bundle` (~20 sites in this slice) tree-shake at compile time. Our equivalent in Vite would be `import.meta.env`.
- `agentSwarmsEnabled.ts:24-44` — gated by USER_TYPE + env var + GrowthBook killswitch. External builds hit the `tengu_amber_flint` killswitch.

## 16. What we should port FIRST

Priority 1 (week-1):

1. `abortController.ts` + `combinedAbortSignal.ts` → `packages/utils/abort/` (50 LOC total).
2. `cleanupRegistry.ts` → `packages/utils/lifecycle/cleanup-registry.ts`.
3. `bufferedWriter.ts` → `packages/utils/io/buffered-writer.ts`.
4. `errors.ts` → expand `packages/utils/errors.ts` with the full taxonomy (`isFsInaccessible`, `classifyAxiosError`, `shortErrorStack`, `TelemetrySafeError`).
5. `path.ts` (the parts we don't already have) — UNC guard, null-byte check, NFC normalization.

Priority 2 (week-2): 6. `claudemd.ts` — port to `packages/utils/memory/loader.ts` for cross-surface CLAUDE.md/AGENTS.md equivalent. 7. `analyzeContext.ts` — extract to `packages/utils/context/analyze.ts`. Single biggest UX upgrade. 8. `contextSuggestions.ts` — pair with #7. 9. `bashtypes/embeddedTools.ts` — model after our embedded ripgrep concept (already in CLI binary). 10. `agentContext.ts` `AsyncLocalStorage` pattern → `packages/runtime/agent-context.ts`.

Priority 3 (when paid tier launches): 11. `billing.ts` — pattern-match for our Hobby/Pro/Pro+/Max role checks. 12. `extraUsage.ts` — apply to our overage billing flag. 13. `betas.ts` `partitionBetasByAllowlist` for SDK-supplied feature flags.

## 17. Off-limits / shared SCC notes

- `auth.ts` (M3 ownership) is the keystone for `betas.ts`, `billing.ts`, `extraUsage.ts`, `fastMode.ts`. Anything we port from those files must not cross the ownership line.
- `attachments.ts` (M2) is referenced by `conversationRecovery.ts` (`suppressNextSkillListing`) — `conversationRecovery` ports cleanly without it.
- `bash/` subdir (M7) is referenced by `argumentSubstitution.ts` (`tryParseShellCommand`) and `crossProjectResume.ts` (`quote`). Both call sites are tiny one-liners — easy to swap to whatever shell-quote primitive M7 produces.

— end U1
