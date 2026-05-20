# U2 — utils direct H–N (Claude Code reference, May 2026)

> **Scope (assigned).** `~/Desktop/reference/src/utils/*.{ts,tsx}` files with names beginning H, I, J, K, L, M (excluding mega-files `hooks.ts` owned by M4 and `messages.ts` owned by M2), and N. Forty-seven files, ~11,019 LOC total per `wc -l`. The largest is `ide.ts` at 1,494 LOC, then `imageResizer.ts` at 880 LOC and `handlePromptSubmit.ts` at 610 LOC.
>
> **Citations** are file:line.
> **Anchor reference.** `/Users/siddhartha/Desktop/agiworkforce/tasks/research/anthropic-claude-suite-may-2026.md`.

---

## 1. Inventory and one-line purpose (per file)

### H

| File                    | Lines | Purpose                                                                                                                                                                                                                                                    |
| ----------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handlePromptSubmit.ts` |   610 | Single entrypoint for user-prompt submission — handles direct typing, queued commands, exit-aliases, immediate-slash-commands, paste-reference expansion, and dispatch into `executeUserInput` (`handlePromptSubmit.ts:120`, `handlePromptSubmit.ts:396`). |
| `hash.ts`               |    46 | djb2 + Bun.hash + sha256 wrappers; `hashContent`, `hashPair` (`hash.ts:7,19,34`).                                                                                                                                                                          |
| `headlessProfiler.ts`   |   178 | `performance.mark` checkpoints for the `-p` (print) headless mode; logs `tengu_headless_latency` with TTFT, query-overhead, time-to-system-message (`headlessProfiler.ts:62,103`).                                                                         |
| `heapDumpService.ts`    |   303 | `/heapdump` slash-command engine — captures V8 heap snapshot + `MemoryDiagnostics` JSON (uptime, RSS, native memory, detached contexts, smaps_rollup, active handles) into `~/Desktop` (`heapDumpService.ts:88,221,284`).                                  |
| `heatmap.ts`            |   198 | GitHub-style daily-activity heatmap rendered to terminal via chalk; uses Claude orange `#da7756` (`heatmap.ts:39,181`).                                                                                                                                    |
| `highlightMatch.tsx`    |    27 | Inverse-highlight every occurrence of a query in result rows / preview panes (Ink `<Text inverse>`).                                                                                                                                                       |
| `horizontalScroll.ts`   |   137 | Edge-based scroll-window calculator for tab/breadcrumb rows; ensures selected item stays visible without centering (`horizontalScroll.ts:21`).                                                                                                             |
| `http.ts`               |   136 | User-agent strings + `getAuthHeaders` (OAuth bearer vs `x-api-key`) + `withOAuth401Retry` clock-drift recovery (`http.ts:18,69,115`).                                                                                                                      |
| `hyperlink.ts`          |    39 | OSC 8 hyperlink emitter with chalk-blue display text and graceful fallback when terminal does not support hyperlinks.                                                                                                                                      |

### I

| File                          |     Lines | Purpose                                                                                                                                                                                                                                                                    |
| ----------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ide.ts`                      | **1,494** | Master IDE-integration module — lockfile discovery, IDE auto-detection, port probing, ancestor-PID walks, VS Code & JetBrains extension installer, WSL host-IP resolution, JetBrains marketplace installer, MCP `ide` client wiring.                                       |
| `idePathConversion.ts`        |        90 | `WindowsToWSLConverter` (`wslpath -u/-w` shellouts plus manual `C:` → `/mnt/c` fallback) for cross-realm IDE path translation.                                                                                                                                             |
| `idleTimeout.ts`              |        53 | Reads `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY` env var, runs `gracefulShutdownSync` after N ms idle in SDK mode.                                                                                                                                                                |
| `imagePaste.ts`               |       416 | Cross-platform clipboard image reader (macOS `osascript` + native NSPasteboard NAPI, Linux `xclip`/`wl-paste`, Windows PowerShell), BMP→PNG conversion via Sharp, drag-and-drop path detection.                                                                            |
| `imageResizer.ts`             |   **880** | Image compression pipeline — `maybeResizeAndDownsampleImageBuffer`, `compressImageBuffer`, `compressImageBlock`, magic-byte format detection, size-and-pixel-cap enforcement; massive try/catch with `tengu_image_resize_failed` analytics (`imageResizer.ts:50,169,498`). |
| `imageStore.ts`               |       167 | Per-session disk cache for pasted images at `~/.claude/image-cache/<session>/<id>.<ext>` with 200-entry LRU and old-session cleanup.                                                                                                                                       |
| `imageValidation.ts`          |       104 | Pre-API-boundary validator that throws `ImageSizeError` if any base64 image > 5MB; logs `tengu_image_api_validation_failed`.                                                                                                                                               |
| `immediateCommand.ts`         |        15 | One-line GrowthBook gate (`tengu_immediate_model_command`) for whether `/model`, `/fast`, `/effort` execute mid-stream.                                                                                                                                                    |
| `ink.ts`                      |        26 | `toInkColor` — converts agent color names to Ink TextProps via `AGENT_COLOR_TO_THEME_COLOR`, falls back to `ansi:<color>`.                                                                                                                                                 |
| `inProcessTeammateHelpers.ts` |       102 | Helpers for in-process subagent message routing — `findInProcessTeammateTaskId`, `setAwaitingPlanApproval`, `handlePlanApprovalResponse`, `isPermissionRelatedResponse`.                                                                                                   |
| `intl.ts`                     |        94 | Lazy singletons for `Intl.Segmenter` (grapheme/word) and `Intl.RelativeTimeFormat`; `firstGrapheme`, `lastGrapheme`, `getTimeZone`, `getSystemLocaleLanguage`.                                                                                                             |
| `iTermBackup.ts`              |        73 | Restores `com.googlecode.iterm2.plist` if iTerm2-setup wizard left a backup behind; reads `iterm2SetupInProgress` flag from global config.                                                                                                                                 |

### J

| File           | Lines | Purpose                                                                                                                                                                                                                                             |
| -------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jetbrains.ts` |   191 | OS-specific JetBrains plugin-directory walk (Application Support / `.config/JetBrains` / `%APPDATA%`), regex-matched against `IntelliJIdea`, `PyCharm`, etc., with `pluginInstalledCache` + `pluginInstalledPromiseCache` maps.                     |
| `json.ts`      |   277 | `safeParseJSON` (LRU-memoized over PARSE_CACHE_MAX_KEY_BYTES = 8 KiB), `safeParseJSONC`, `parseJSONL` (Bun.JSONL.parseChunk fast-path + Buffer/String fallbacks), `readJSONLFile` with 100 MB tail cap, `addItemToJSONCArray` (preserves comments). |
| `jsonRead.ts`  |    16 | Pure leaf — `stripBOM` for UTF-8 BOM that PowerShell 5.x writes by default. Extracted to break `settings → json → log → types/logs` cycle.                                                                                                          |

### K

| File                   | Lines | Purpose                                                                                      |
| ---------------------- | ----: | -------------------------------------------------------------------------------------------- |
| `keyboardShortcuts.ts` |    14 | macOS Option-key special-character → keybinding map (`†`→`alt+t`, `π`→`alt+p`, `ø`→`alt+o`). |

### L

| File                  | Lines | Purpose                                                                                                                                                                                                                             |
| --------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lazySchema.ts`       |     8 | Memoized factory wrapper to defer Zod schema construction past module init.                                                                                                                                                         |
| `listSessionsImpl.ts` |   454 | Standalone (no-bootstrap) session lister for the Agent SDK — head/tail JSONL extraction, sidechain filtering, worktree-aware project-dir enumeration, stat-pass + content-pass with batch reads (`listSessionsImpl.ts:79,205,439`). |
| `localInstaller.ts`   |   162 | `~/.claude/local/` self-install — writes `package.json` + wrapper shell script (`#!/bin/sh exec node_modules/.bin/claude`), `npm install` of pinned channel, sets `installMethod: 'local'`.                                         |
| `lockfile.ts`         |    43 | Lazy `proper-lockfile` accessor — defers ~8 ms `graceful-fs` monkey-patch cost until a lock function is actually invoked.                                                                                                           |
| `log.ts`              |   362 | `logError`, `logMCPError`, `logMCPDebug`, `captureAPIRequest` for bug reports, `getLogDisplayTitle` (autonomous-prompt-aware), in-memory error log of last 100 errors, queued-events drain into `ErrorLogSink` once attached.       |
| `logoV2Utils.ts`      |   350 | Layout dimensions for the v2 splash logo (horizontal/compact mode), `truncatePath`, `getRecentActivity`, `getRecentReleaseNotesSync`.                                                                                               |

### M

| File                       | Lines | Purpose                                                                                                                                                                                                                                                    |
| -------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- | ----------- |
| `mailbox.ts`               |    73 | Generic mailbox primitive — `send`, `poll`, `receive(predicate)`, `subscribe`. Used for inter-agent messaging in `teamDiscovery.ts` and skills.                                                                                                            |
| `managedEnv.ts`            |   199 | Two-phase apply of settings.env → process.env — `applySafeConfigEnvironmentVariables` (pre-trust, allowlisted), `applyConfigEnvironmentVariables` (post-trust); strips SSH-tunnel vars and host-managed provider vars.                                     |
| `managedEnvConstants.ts`   |   191 | `PROVIDER_MANAGED_ENV_VARS` set + `PROVIDER_MANAGED_ENV_PREFIXES` + `DANGEROUS_SHELL_SETTINGS` + `SAFE_ENV_VARS` allowlist (~80 entries).                                                                                                                  |
| `markdown.ts`              |   381 | `marked`-based ANSI markdown renderer for the TUI — blockquote bars, code highlighting via CliHighlight, tables with column-width calculation, lists with letter/roman numbering, OSC 8 hyperlinks for `owner/repo#123`.                                   |
| `markdownConfigLoader.ts`  |   600 | Loads `.claude/{commands,agents,output-styles,skills,workflows}` markdown — `getProjectDirsUpToHome` (git-root-bounded), inode-keyed dedup, `findMarkdownFilesNative` (with cycle detection + bigint inodes for ExFAT), ripgrep-by-default file discovery. |
| `mcpInstructionsDelta.ts`  |   130 | Diff connected MCP servers' `InitializeResult.instructions` against what's already announced in this conversation; emits `tengu_mcp_instructions_pool_change`.                                                                                             |
| `mcpOutputStorage.ts`      |   189 | Mime-type → extension map (28 types), binary-content persistor that writes raw bytes to `tool-results/<id>.<ext>`, large-output instruction blocks for chunked-read prompts.                                                                               |
| `mcpValidation.ts`         |   208 | MCP tool-output truncation under `getMaxMcpOutputTokens` (env > GrowthBook > 25000 default); `mcpContentNeedsTruncation`, `truncateMcpContent` with image-block compression fallback.                                                                      |
| `mcpWebSocketTransport.ts` |   200 | `WebSocketTransport implements Transport` — bridges Bun native `WebSocket` and Node `ws` packages to `@modelcontextprotocol/sdk` JSONRPCMessage stream.                                                                                                    |
| `memoize.ts`               |   269 | `memoizeWithTTL`, `memoizeWithTTLAsync`, `memoizeWithLRU` — write-through caching with stale-while-refresh, in-flight dedup, identity-guarded refresh.                                                                                                     |
| `memoryFileDetection.ts`   |   289 | Predicates for whether a path is a Claude-managed memory file vs user-managed CLAUDE.md — `isAutoManagedMemoryFile`, `isMemoryDirectory`, `isShellCommandTargetingMemory` (with MinGW conversion), `detectSessionFileType`.                                |
| `messagePredicates.ts`     |     8 | `isHumanTurn` — guards against the four-PR-fixed bug where tool-result messages share `type:'user'`.                                                                                                                                                       |
| `messageQueueManager.ts`   |   547 | Module-level command queue for prompts/notifications/orphan-permissions — useSyncExternalStore-compatible signal, FIFO-within-priority dequeue (`now` > `next` > `later`), `popAllEditable` reconstruction, deprecated alias compatibility surface.        |
| `modelCost.ts`             |   231 | Per-model cost tiers (Haiku $0.80/$4, Sonnet $3/$15, Opus 4 $15/$75, Opus 4.5 $5/$25, Opus 4.6 fast-mode $30/$150) and `calculateUSDCost` from `BetaUsage`.                                                                                                |
| `modifiers.ts`             |    36 | macOS-only `modifiers-napi` wrapper for sync `isModifierPressed('shift'                                                                                                                                                                                    | 'command' | 'control' | 'option')`. |
| `mtls.ts`                  |   179 | Reads `CLAUDE_CODE_CLIENT_CERT/KEY/PASSPHRASE` env vars, returns `https.Agent` + `tls.ConnectionOptions` + `undici.Dispatcher` for fetch.                                                                                                                  |

### N

| File          | Lines | Purpose                                                                                                                                                                                       |
| ------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `notebook.ts` |   224 | Jupyter `.ipynb` reader — extracts cell source/outputs, encodes images as base64 ImageBlockParam, `cellContentToToolResult` builds `<cell id="...">` XML, oversized-output sentinel with `cat | jq` instructions. |

---

## 2. High-LOC files — data structures and flows

### 2.1 `ide.ts` (1,494 LOC)

The single largest file in the H-N range and arguably the most architecturally significant module: it handles every cross-process channel between Claude Code's CLI and a developer's IDE.

**Core data shapes** (`ide.ts:73–128`):

- `IdeType` — discriminated union of 18 IDE identifiers (cursor, windsurf, vscode, plus 15 JetBrains products) (`ide.ts:102`).
- `IdeConfig` — `{ ideKind: 'vscode' | 'jetbrains', displayName, processKeywordsMac, processKeywordsWindows, processKeywordsLinux }` (`ide.ts:122`).
- `supportedIdeConfigs: Record<IdeType, IdeConfig>` — full process-name regex catalog (`ide.ts:130–257`).
- `LockfileJsonContent` — `{ workspaceFolders, pid, ideName, transport: 'ws'|'sse', runningInWindows, authToken }` (`ide.ts:73`).
- `DetectedIDEInfo` — `{ name, port, workspaceFolders, url, isValid, authToken, ideRunningInWindows }` (`ide.ts:92`).

**Flow A — `findAvailableIDE()` (`ide.ts:626`):**

1. Cancel any in-flight IDE search via shared `currentIDESearch` AbortController.
2. `cleanupStaleIdeLockfiles()` — unlinks lockfiles whose `pid` is dead or whose port doesn't accept a TCP probe.
3. Loop ≤30 s × 1 s ticks: skip while `getIsScrollDraining()` is true (avoids competing with scroll frames), call `detectIDEs(false)`, return when exactly one match.
4. Returns `null` after 30 s with no exact match — UI then prompts the user with `/ide`.

**Flow B — `detectIDEs(includeInvalid)` (`ide.ts:664`):**

1. Read `CLAUDE_CODE_SSE_PORT` env (set when CC was spawned by an IDE-integrated terminal).
2. Get sorted lockfiles via `getSortedIdeLockfiles()` and `Promise.all(map(readIdeLockfile))`.
3. Lazy ancestor-PID walk via `makeAncestorPidLookup()` — prevents the once-per-lockfile shellout that previously dominated CPU profiles.
4. For each lockfile:
   - Validate cwd is inside `workspaceFolders` (NFC-normalized, with WSL conversion via `WindowsToWSLConverter`, with Windows drive-letter case-folding).
   - If a supported terminal AND not WSL, ancestry-check the lockfile's PID against our parent process chain.
   - Build URL: `ws://host:port` for ws transport, `http://host:port/sse` for SSE.
5. Single-out exactly one IDE if `envPort` matches.

**Flow C — Extension installation (`ide.ts:879`):**

- VS Code: `installFromArtifactory` for ant users (downloads VSIX from `artifactory.infra.ant.dev`), else `code --force --install-extension anthropic.claude-code`.
- JetBrains: returns `null` — JB plugin install is manual via marketplace, but `isJetBrainsPluginInstalledCached` (from `jetbrains.ts`) populates the status-notice cache.
- Windows nuance at `ide.ts:1029`: VS Code 1.110.0 prepends install root to PATH, so a bare `code` resolves to the GUI binary; the code requests `code.cmd` explicitly.

**Flow D — WSL host-IP resolution (`detectHostIP`, `ide.ts:1353`):**

- Memoized over `(isIdeRunningInWindows, port)`.
- Honors `CLAUDE_CODE_IDE_HOST_OVERRIDE`.
- Default = `127.0.0.1`.
- WSL+Windows-IDE case: `ip route show | grep default` → extract gateway IP → probe → use it.

**Provider/model coupling.** None — IDE detection is provider-agnostic. The `ide` MCP client appears in `mcpClients` but routing is handled by `services/mcp/client.ts`'s `callIdeRpc` which is re-exported here at `ide.ts:1244`.

### 2.2 `imageResizer.ts` (880 LOC)

The end-to-end image-pipeline boundary. Three classification axes:

**Error classification** (`imageResizer.ts:50–124`):

- 8 error-type constants used as numeric `tengu_image_resize_failed` enums (avoids high-cardinality message fields in analytics): `MODULE_LOAD=1`, `PROCESSING=2`, `UNKNOWN=3`, `PIXEL_LIMIT=4`, `MEMORY=5`, `TIMEOUT=6`, `VIPS=7`, `PERMISSION=8`.
- Code-first matching (`MODULE_NOT_FOUND`, `EACCES`, `ENOMEM`), then string-match fallback for sharp/vips errors that don't expose codes.

**`maybeResizeAndDownsampleImageBuffer` decision tree** (`imageResizer.ts:169`):

1. Empty buffer → `ImageResizeError` immediately (avoids API-side "image cannot be empty" failure).
2. Sharp metadata read.
3. If under both raw-size cap (`IMAGE_TARGET_RAW_SIZE`) and dimension caps (`IMAGE_MAX_WIDTH × IMAGE_MAX_HEIGHT`) → return as-is.
4. If only over size: try PNG palette compression first (preserves transparency), then JPEG quality cascade `[80, 60, 40, 20]`.
5. If over dimensions: resize with `fit: 'inside', withoutEnlargement: true`.
6. If still over after resize: PNG-palette retry, then JPEG cascade, then aggressive 1000×1000 + JPEG quality 20 last-resort.
7. Catch block (`imageResizer.ts:383`): logs analytics with `error_message_hash`, returns raw buffer iff base64-encoded size fits AND PNG header dims (offsets 16–24) confirm under cap, else throws.

**`compressImageBuffer` (`imageResizer.ts:498`) — token-budget pipeline:**

1. Already-fits short-circuit.
2. `tryProgressiveResizing` — scaling factors `[1.0, 0.75, 0.5, 0.25]` with format-preserving optimizations.
3. `tryPalettePNG` — 800×800 + palette + 64-color reduction.
4. `tryJPEGConversion` (quality 50, 600×600).
5. `createUltraCompressedJPEG` — 400×400, quality 20.

**Magic-byte detection** (`imageResizer.ts:769`):

- PNG: `89 50 4E 47`
- JPEG: `FF D8 FF`
- GIF: `47 49 46`
- WebP: `52 49 46 46 ...... 57 45 42 50`

**Provider/model coupling.** Output `ImageBlockParam` is Anthropic-SDK-typed (`@anthropic-ai/sdk/resources/messages.mjs`). The 5 MB API limit (`API_IMAGE_MAX_BASE64_SIZE`) is Anthropic-specific.

### 2.3 `handlePromptSubmit.ts` (610 LOC)

The single funnel that every user prompt goes through, regardless of source (typed input, queue dequeue, bridge/CCR remote, immediate /command).

**Two-path dispatch** (`handlePromptSubmit.ts:120`):

- **Queue-processor path** (`queuedCommands?.length`, `handlePromptSubmit.ts:150`): commands pre-validated, skip input validation/reference parsing, call `executeUserInput` directly.
- **Direct-input path:** validate, expand pasted-text refs (`expandPastedTextRefs`), filter orphan images by `[Image #N]` placeholder presence (`handlePromptSubmit.ts:180`), handle exit aliases (`exit`, `quit`, `:q`, `:q!`, `:wq`, `:wq!`), dispatch immediate-slash-commands inline if guard is busy, else enqueue with `enqueue({ value: finalInput.trim(), preExpansionValue, mode, pastedContents, skipSlashCommands, uuid })` (`handlePromptSubmit.ts:336`).

**`executeUserInput` (`handlePromptSubmit.ts:396`):**

1. Reserve `queryGuard` BEFORE `processUserInput` (so concurrent submits queue rather than starting a second loop).
2. Compute `turnWorkload` — only non-undefined when **every** queued command shares the same workload tag (a human in the mix overrides cron tagging).
3. Wrap entire turn in `runWithWorkload(turnWorkload, async () => { ... })` AsyncLocalStorage context — the documented mechanism (`handlePromptSubmit.ts:472`) for propagating workload across `await` boundaries through detached background-agent closures.
4. Iterate commands: first command gets attachments + ideSelection + image-resizing pastedContents; rest skip attachments to avoid duplicating turn-level context.
5. Stamp `origin` based on `cmd.mode === 'task-notification'` for non-meta surfaces.
6. File-history snapshot every selectable user message via `fileHistoryMakeSnapshot`.
7. Call `onQuery(...)` — only the primary command's flags propagate (allowedTools, model, effort, nextInput).
8. `finally`: `queryGuard.cancelReservation()` + `setUserInputOnProcessing(undefined)` safety nets.

**Telemetry.** Emits `tengu_paste_text` with `pastedTextCount` and `pastedTextBytes`, `tengu_immediate_command_executed` for inline-dispatched immediate slash commands, and `tengu_cancel` with `source: 'interrupt_on_submit'` when an interruptible tool is cancelled.

### 2.4 `markdownConfigLoader.ts` (600 LOC)

The discovery pipeline that powers `.claude/{commands,agents,output-styles,skills,workflows}` everywhere.

**Discovery boundary logic** (`markdownConfigLoader.ts:191–289`):

- `resolveStopBoundary(cwd)` widens the upward walk to the _session's_ git root when the cwd is in a nested git repo (submodule / vendored clone) inside the session's project (`#31905` regression). Worktrees stay on the old behavior.
- `getProjectDirsUpToHome(subdir, cwd)` traverses upward from cwd, hitting `~/.claude/<subdir>` candidates only on directories that actually exist (statSync probe), stopping at git root or home.

**Worktree fallback** (`markdownConfigLoader.ts:319–335`):

- If cwd is a git worktree (`gitRoot !== canonicalRoot`) AND the worktree itself does not have `.claude/<subdir>` checked out (sparse-checkout case), fall back to the main repo's copy. A standard `git worktree add` checks out the full tree, so this fires only in sparse-checkout — preventing the duplication bug from `#29599`, `#28182`, `#26992`.

**Inode dedup** (`markdownConfigLoader.ts:159,388`):

- `getFileIdentity` calls `lstat(filePath, { bigint: true })` — bigint mandatory because ExFAT inodes exceed JavaScript's 53-bit Number precision (`#13893`). NFS/FUSE mounts that report `dev=0n && ino=0n` skip dedup (fail open). Identity is `${dev}:${ino}` string.
- Source priority for dedup: managed > user > project. First-seen wins.

**Discovery engines** (`markdownConfigLoader.ts:546–600`):

- Default: ripgrep (`['--files', '--hidden', '--follow', '--no-ignore', '--glob', '*.md']`) — battle-tested, fast.
- Fallback: `findMarkdownFilesNative` via Node fs APIs (`markdownConfigLoader.ts:451`) — needed because ripgrep startup is poor in native builds and is gated by `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`. Implements its own cycle-detection via device+inode tracking (matching ripgrep's same_file library).

**Telemetry.** `tengu_dir_search` with `durationMs`, per-source file counts, and `subdir`.

### 2.5 `messageQueueManager.ts` (547 LOC)

Module-level priority command queue, the de-facto inbox for all input destined for the agent loop.

**Data shapes:**

- `commandQueue: QueuedCommand[]` — mutable.
- `snapshot: readonly QueuedCommand[]` — frozen, recreated on every mutation for `useSyncExternalStore` stability.
- `queueChanged = createSignal()` from `signal.ts` — subscriber notification.

**Priority order** (`messageQueueManager.ts:151`): `now: 0 > next: 1 > later: 2`. Default for user input is `next`; default for task notifications is `later` (so user input is never starved).

**Operations:**

- `enqueue(command)` (`messageQueueManager.ts:128`) — push, default priority `next`, log `'enqueue'`.
- `enqueuePendingNotification(command)` (`messageQueueManager.ts:142`) — push, default priority `later`.
- `dequeue(filter?)` (`messageQueueManager.ts:167`) — find best-priority match; FIFO within priority tier.
- `dequeueAll`, `dequeueAllMatching`, `peek`, `remove`, `removeByFilter`.
- `popAllEditable(currentInput, currentCursorOffset)` (`messageQueueManager.ts:428`) — used by ESC/UP key to pull editable queued commands back into the input buffer (text + cursor + images), preserving original PastedContent ids so imageStore lookups still work.

**Editability gate** (`messageQueueManager.ts:343–375`):

- `NON_EDITABLE_MODES = {'task-notification'}`. System-generated commands that contain raw XML must not leak into user input.
- `isQueuedCommandVisible` is a superset (channel messages show but stay non-editable).

**Backwards-compat aliases** (`messageQueueManager.ts:486–516`): nine deprecated names (`subscribeToPendingNotifications`, `getPendingNotificationsSnapshot`, `dequeuePendingNotification`, etc.) kept for migration callers.

### 2.6 `listSessionsImpl.ts` (454 LOC)

Standalone session enumerator for the Agent SDK — explicitly avoids `bootstrap/state.ts`, analytics, and `bun:bundle` so the SDK entrypoint stays clean.

**`SessionInfo` shape** (`listSessionsImpl.ts:33`): `{ sessionId, summary, lastModified, fileSize?, customTitle?, firstPrompt?, gitBranch?, cwd?, tag?, createdAt? }`.

**Pagination performance pattern** (`listSessionsImpl.ts:439–453`):

- When `limit` or `offset` is set: cheap stat-only candidate pass (`doStat=true`) sorts before expensive head/tail reads. `limit: 20` over 1000 sessions → ~1000 stats + ~20 content reads.
- When neither is set: skip stat (`doStat=false`), read all candidates, sort/dedup post-read on real mtimes from `readSessionLite`.

**Sort comparator** (`listSessionsImpl.ts:230`): `lastModified` desc; ties broken by `sessionId` desc for stable ordering.

**Worktree-aware project enumeration** (`listSessionsImpl.ts:309`): walks all paths from `getWorktreePathsPortable`, sorts by sanitized-prefix length descending (longest match wins), case-insensitive on Windows, exact match for short prefixes (under `MAX_SANITIZED_LENGTH`) and `startsWith` for long ones (handles hash-suffix truncation).

**Filtering rules:**

- Skip sidechain sessions (`isSidechain:true` in first line) — `listSessionsImpl.ts:88`.
- Skip metadata-only sessions (no title, no summary, no prompt) — `listSessionsImpl.ts:122`.
- `customTitle` precedence: `customTitle` → `aiTitle` → `lastPrompt` → `summary` → `firstPrompt` (`listSessionsImpl.ts:96`).

### 2.7 `markdown.ts` (381 LOC)

ANSI markdown renderer for the TUI, built on the `marked` lexer. Tokenized format pipeline (`markdown.ts:36`).

Salient features:

- **Strikethrough disabled** (`markdown.ts:27`) — the model often uses `~` for "approximate" (`~100`); literal strikethrough renders are confusing.
- **Code blocks** route through `CliHighlight` if provided, else raw text + EOL.
- **List numbering**: depth 0/1 = decimal, depth 2 = letters (a-z), depth 3 = roman lowercase.
- **Tables** compute column widths based on stripped-ANSI display text width (`stringWidth(stripAnsi(...))`) so embedded styling does not break alignment.
- **Hyperlinks** emit OSC 8 only when `supportsHyperlinks()` is true. `mailto:` links are flattened to the email text alone.
- **Issue references** (`markdown.ts:289`): regex `(^|[^\w./-])([A-Za-z0-9][\w-]*\/[A-Za-z0-9][\w.-]*)#(\d+)\b` linkifies `owner/repo#123`. Bare `#NNN` was removed because it guessed the current repo.
- **EOL is hard-coded `\n`** (`markdown.ts:16`) — `os.EOL` on Windows would inject `\r` and break the character-to-segment mapping in `applyStylesToWrappedText`.

### 2.8 `log.ts` (362 LOC)

Multi-sink error logger with queue-then-attach indirection.

**Sink interface** (`log.ts:82`): `{ logError, logMCPError, logMCPDebug, getErrorsPath, getMCPLogsPath }`.

**Behavior pre-attach** (`log.ts:96`): events queue into `errorQueue: QueuedErrorEvent[]`. `attachErrorLogSink` is idempotent and drains the queue immediately.

**Suppression triggers** (`log.ts:166`): cloud providers (Bedrock/Vertex/Foundry), `DISABLE_ERROR_REPORTING`, and `isEssentialTrafficOnly()`.

**Hard-fail mode** (`log.ts:154`): `feature('HARD_FAIL') && process.argv.includes('--hard-fail')` causes `process.exit(1)` on any `logError` call. Memoized to avoid re-scanning argv per error.

**`captureAPIRequest`** (`log.ts:331`) — captures the last API request for `/share`, but only for `repl_main_thread*` query sources. Strips messages from the params (already in transcript) for non-ant users; ants keep the full messages reference (so `dumpPrompts.ts` already retains 5 full bodies).

### 2.9 `logoV2Utils.ts` (350 LOC)

Layout-and-truncation helpers for the v2 splash logo.

- **Layout modes** (`logoV2Utils.ts:35`): `horizontal` ≥70 cols, `compact` <70.
- **`truncatePath(path, maxLength)`** (`logoV2Utils.ts:108`) — width-aware (uses `stringWidth` for CJK/emoji), tries to keep first + ellipsis + middle + last, falls through cases for path lengths and parts count.
- **Recent-activity preload** (`logoV2Utils.ts:189`) — caches a single-flight promise; filters out current session, sidechain, "I apologize"-prefix summaries, and missing prompts. Returns top 3.
- **Release-notes feed** (`logoV2Utils.ts:312`) — for ants, uses `MACRO.VERSION_CHANGELOG` (commits bundled at build time); for external users, parses public changelog from memory.

### 2.10 `imagePaste.ts` (416 LOC)

Cross-platform clipboard image and image-path extraction.

**Platform commands** (`imagePaste.ts:31`):

- darwin: `osascript -e 'the clipboard as «class PNGf»'` → save → read.
- linux: `xclip -selection clipboard -t TARGETS -o | grep image/(png|jpeg|jpg|gif|webp|bmp)` → `xclip -selection clipboard -t image/png -o > path` (with wl-paste fallback for Wayland and BMP-fallback for WSL2).
- win32: PowerShell `Get-Clipboard -Format Image; $img.Save(...)`.

**Native fast path** (`imagePaste.ts:131`): `feature('NATIVE_CLIPBOARD_IMAGE')` + `tengu_collage_kaleidoscope` (default true) gate the macOS-only NSPasteboard NAPI module — ~5 ms cold, sub-ms warm vs. ~1.5 s for osascript. Returns a buffer + the originally-captured dimensions; downstream still passes through `maybeResizeAndDownsampleImageBuffer` if buffer exceeds raw-size cap.

**BMP→PNG conversion** (`imagePaste.ts:215`): magic-byte check (`buffer[0]===0x42 && buffer[1]===0x4d`) triggers `sharp(imageBuffer).png().toBuffer()`. Required because the API does not accept BMP and WSL2 copies images as BMP by default.

**Path detection** (`imagePaste.ts:266–344`):

- `IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i`.
- `removeOuterQuotes` strips matching `'"`.
- `stripBackslashEscapes` swaps `\\` for a random-salt placeholder, removes shell-escape `\<char>` sequences, then restores. Random salt prevents injection where path contains the literal placeholder.

### 2.11 `notebook.ts` (224 LOC)

Jupyter `.ipynb` reader.

- **`LARGE_OUTPUT_THRESHOLD = 10000`** (`notebook.ts:20`) — when summed `text.length + image_data.length` over a cell's outputs exceeds this, the cell's outputs become a single sentinel: `Outputs are too large to include. Use ${BASH_TOOL_NAME} with: cat <notebook_path> | jq '.cells[${index}].outputs'`.
- **Image extraction** (`notebook.ts:41`) — only `image/png` and `image/jpeg`, whitespace stripped from the base64.
- **Cell content → tool result** (`notebook.ts:119`): wraps each cell as `<cell id="${cell_id}"><cell_type>...</cell_type><language>...</language>${source}</cell id="${cell_id}">`. Adjacent text blocks are merged (`notebook.ts:198`).

---

## 3. Cross-cutting concerns

### 3.1 Telemetry events (the "tengu\_\*" namespace)

This file group emits at least the following analytics events:

- `tengu_paste_text` — `pastedTextCount`, `pastedTextBytes` (`handlePromptSubmit.ts:225`).
- `tengu_immediate_command_executed` — `commandName` (`handlePromptSubmit.ts:253`).
- `tengu_cancel` — `source`, `streamMode` (`handlePromptSubmit.ts:325`).
- `tengu_image_resize_failed` — `original_size_bytes`, `error_type` (1–8 enum), `error_message_hash` (djb2) (`imageResizer.ts:388`).
- `tengu_image_resize_fallback` — when raw image clears base64-cap and PNG-dim cap (`imageResizer.ts:415`).
- `tengu_image_compress_failed` — `original_size_bytes`, `max_bytes`, `error_type`, `error_message_hash` (`imageResizer.ts:553`).
- `tengu_image_api_validation_failed` — `base64_size_bytes`, `max_bytes` (`imageValidation.ts:91`).
- `tengu_unknown_model_cost` — `model`, `shortName` (`modelCost.ts:167`); also flips `setHasUnknownModelCost()`.
- `tengu_dir_search` — `durationMs`, per-source file counts, `subdir` (`markdownConfigLoader.ts:416`).
- `tengu_mcp_instructions_pool_change` — `addedCount`, `removedCount`, `priorAnnouncedCount`, `clientSideCount`, `messagesLength`, `attachmentCount`, `midCount` (`mcpInstructionsDelta.ts:114`).
- `tengu_binary_content_persisted` — `mimeType`, `sizeBytes`, `ext` (`mcpOutputStorage.ts:166`).
- `tengu_heap_dump` — `triggerManual` boolean, `triggerAuto15GB` boolean, `dumpNumber`, `success` (`heapDumpService.ts:259`).
- `tengu_headless_latency` — `turn_number`, `time_to_system_message_ms`, `time_to_query_start_ms`, `time_to_first_response_ms`, `query_overhead_ms`, `checkpoint_count`, `entrypoint` (`headlessProfiler.ts:166`).
- `tengu_ext_installed`, `tengu_ext_install_error` (`ide.ts:597,611`).

Several callers route through the `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` cast to satisfy a custom analytics-sanitization lint. This is a workspace-wide convention worth replicating in agi-workforce: it forces a manual review per call site that the value is from a fixed vocabulary, not user code or paths.

### 3.2 Settings layering and trust

`managedEnv.ts` and `managedEnvConstants.ts` establish a four-layer settings model that any analog in agi-workforce will need:

- **Trusted sources** (`managedEnv.ts:105`): `userSettings`, `flagSettings`, `policySettings` — all env vars apply.
- **Project-scoped sources** (`projectSettings`, `localSettings`) — only `SAFE_ENV_VARS` apply, and only after a trust dialog. The threat model is committed-by-malicious-collaborator settings that redirect traffic.
- **Provider-managed escape hatch** (`managedEnvConstants.ts:14`): when `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` is truthy, `PROVIDER_MANAGED_ENV_VARS` is stripped from settings-sourced env so a user's `~/.claude/settings.json` cannot redirect requests away from the host's provider config.
- **CCD spawn-env capture** (`managedEnv.ts:69`): keys present in `process.env` at first `applySafeConfigEnvironmentVariables` call (when entrypoint is `claude-desktop`) are remembered as untouchable — settings cannot override them. Ensures `OTEL_LOGS_EXPORTER=console` from settings does not corrupt the stdio JSON-RPC transport with the desktop host.

The `SAFE_ENV_VARS` allowlist has ~80 entries with explicit per-category notes in code comments distinguishing **"redirect to attacker-controlled server,"** **"trust attacker-controlled server,"** and **"switch to attacker-controlled project."**

### 3.3 Error-typing patterns

- `imageResizer.ts:50` — `classifyImageError` uses Node error codes first (`ERR_DLOPEN_FAILED`, `ENOMEM`, `EACCES`) then sharp/vips message substring matches.
- `log.ts:154` — `--hard-fail` argv flag escalates `logError` to `process.exit(1)` so test runs surface real errors instead of swallowing them.
- `imageValidation.ts:16` — `ImageSizeError` and `imageResizer.ts:37` — `ImageResizeError` are distinct subclasses, allowing callers to distinguish "API rejected" (validation) from "Sharp gave up" (compression).

### 3.4 Memoization patterns (multiple flavors)

- `memoize.ts:40` — `memoizeWithTTL` (sync, write-through stale-while-refresh, identity-guarded refresh).
- `memoize.ts:120` — `memoizeWithTTLAsync` adds `inFlight` Map for cold-miss dedup so concurrent callers don't each spawn `aws sso login`.
- `memoize.ts:234` — `memoizeWithLRU` over a fixed-size window via `lru-cache`. Used by `json.ts:42` (`safeParseJSON`) at `max=50` because the previous lodash memoize cached every JSON string forever causing 300 MB+ leaks.
- `intl.ts:13,46` — module-level lazy singletons for expensive Intl constructors.
- `lockfile.ts:18` — lazy `require('proper-lockfile')` to defer the 8 ms graceful-fs monkey-patch cost off the startup path.
- `mtls.ts:23,78` — `lodash-es/memoize` for env-var-derived configs with `clearMTLSCache` + `clearProxyCache` invalidation hook called when settings.env changes.

---

## 4. Provider-coupling notes

| File                      | Provider coupling                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `modelCost.ts`            | Heavy. Hard-codes Claude-only pricing tiers and references `model/configs.ts` for canonical first-party names (`CLAUDE_OPUS_4_6_CONFIG`, etc.). Opus 4.6 fast-mode pricing is special-cased (`modelCost.ts:148`). |
| `http.ts`                 | Moderate. `getAuthHeaders` chooses OAuth bearer (Claude.ai subscriber) vs `x-api-key` (Anthropic API), and `getWebFetchUserAgent` brands as `Claude-User`.                                                        |
| `imageResizer.ts`         | Moderate. Imports `Base64ImageSource`, `ImageBlockParam` from `@anthropic-ai/sdk/resources/messages.mjs`. `API_IMAGE_MAX_BASE64_SIZE` reflects Anthropic's 5 MB limit.                                            |
| `mcpValidation.ts`        | Light. `ContentBlockParam` types are Anthropic-SDK; the truncation logic itself is provider-neutral.                                                                                                              |
| `mcpOutputStorage.ts`     | None — mime/extension only.                                                                                                                                                                                       |
| `notebook.ts`             | Light. `TextBlockParam                                                                                                                                                                                            | ImageBlockParam | ToolResultBlockParam` are Anthropic-SDK shapes; the rest is generic. |
| `markdownConfigLoader.ts` | None.                                                                                                                                                                                                             |
| `messageQueueManager.ts`  | Light. `ContentBlockParam[]` for queued-command values when remote bridge embeds images directly.                                                                                                                 |
| `ide.ts`                  | None at the protocol layer (MCP-generic), but the `IdeType` enumeration encodes which IDEs this codebase has actually shipped extension support for.                                                              |
| `managedEnvConstants.ts`  | Heavy. Anthropic-specific `ANTHROPIC_*`, `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`, `VERTEX_REGION_CLAUDE_*` etc. Anything an agi-workforce port copies from this file would need full provider-substitution.      |

The most-portable files in this group are the leaf primitives: `hash`, `intl`, `lockfile`, `lazySchema`, `messagePredicates`, `keyboardShortcuts`, `modifiers`, `horizontalScroll`, `highlightMatch`, `hyperlink`, `mailbox`, `memoize`, `objectGroupBy`-adjacent code in `messageQueueManager.ts`, and `jsonRead.ts`. These can be lifted near-verbatim into agi-workforce's `packages/utils`.

---

## 5. Dead code / tree-shaken stubs

- **`messageQueueManager.ts:486–516`** — nine `@deprecated` aliases (e.g., `subscribeToPendingNotifications`, `getPendingNotificationsSnapshot`, `dequeuePendingNotification`). Live in code but new callsites should use the canonical names. Opportunity: drop them at the next major version.
- **`mcpInstructionsDelta.ts:37`** — `isMcpInstructionsDeltaEnabled` is gated by `tengu_basalt_3kr` GrowthBook flag with `CLAUDE_CODE_MCP_INSTR_DELTA` env override. The legacy `DANGEROUS_uncachedSystemPromptSection` path stays alive in `prompts.ts` as the fallback, so both paths exist.
- **`immediateCommand.ts:10`** — `shouldInferenceConfigCommandBeImmediate` is a one-line GrowthBook gate (`tengu_immediate_model_command`), defaulting `false` for external users. Fully GrowthBook-controlled.
- **`imagePaste.ts:131,134`** — `feature('NATIVE_CLIPBOARD_IMAGE')` is a Bun build-time feature flag (`bun:bundle`). Tree-shaken out when not enabled; the osascript fallback is the path that always exists.
- **`markdownConfigLoader.ts:35`** — `feature('TEMPLATES')` conditionally adds `'templates'` to `CLAUDE_CONFIG_DIRECTORIES`. Likewise tree-shaken at build time.
- **`memoryFileDetection.ts:17,107,137,170`** — `feature('TEAMMEM')` gates the entire team-memory codepath; the `teamMemPaths` import is `null` when the feature is off, with non-null-asserted access guarded by the feature check. This is the documented "module-scope helpers are NOT tree-shaken — feature() must be re-checked at every callsite" pattern.
- **`mtls.ts:140`** — `require('undici')` is inside `getTLSFetchOptions`, only loaded when CA certs / mTLS are configured, deferring the ~1.5 MB undici load.
- **`ide.ts:33`** — `ideOnboardingDialog()` lazy-requires `IdeOnboardingDialog.tsx` (which pulls React/ink) only on the interactive onboarding path.
- **`messageQueueManager.ts:370`** — `feature('KAIROS') || feature('KAIROS_CHANNELS')` gates whether channel-message queue items render in the preview. This is the only feature flag in messageQueueManager.

---

## 6. Inventory cross-references (agi-workforce mapping notes)

For files in this scope that have a likely mapping in agi-workforce surfaces:

| Reference utility                                                                                | Likely target in agi-workforce                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handlePromptSubmit.ts`                                                                          | Replace `apps/web/features/chat/` submit handlers + `apps/desktop/src/components/chat/ChatInterface` submit; today's submit logic is not centralized like Claude Code's.                                                                                                                 |
| `messageQueueManager.ts`                                                                         | New file — there's currently no priority command queue across surfaces. Highest-value port.                                                                                                                                                                                              |
| `imageResizer.ts` + `imagePaste.ts` + `imageStore.ts` + `imageValidation.ts`                     | `packages/chat` lacks an image pipeline of comparable robustness. The error-type enum + `tengu_image_*` analytics events are best-of-breed instrumentation.                                                                                                                              |
| `markdown.ts`                                                                                    | Already partially solved by `react-markdown` in web. CLI-side ANSI rendering is missing.                                                                                                                                                                                                 |
| `markdownConfigLoader.ts`                                                                        | Inode-keyed dedup + worktree fallback should be a baseline for any `.agi-workforce/{commands,agents,...}` discovery.                                                                                                                                                                     |
| `mcpValidation.ts`, `mcpOutputStorage.ts`, `mcpInstructionsDelta.ts`, `mcpWebSocketTransport.ts` | `packages/mcp` has zero tests per `MEMORY.md`; these four files (737 LOC combined) define the truncation, persistence, instruction-delta, and WebSocket-transport layer that should be ported.                                                                                           |
| `ide.ts`                                                                                         | VS Code extension already exists at `apps/extension-vscode/` (v0.3.0); the lockfile-port-probe pattern would be the right model for desktop ↔ web connection-discovery.                                                                                                                  |
| `modelCost.ts`                                                                                   | `models.json` is the single source of truth in agi-workforce per the locked rule, so any port must read tiers from `models.json` rather than hard-coding (the reference's hard-coding is the exact pattern the rule prohibits).                                                          |
| `managedEnv.ts` + `managedEnvConstants.ts`                                                       | Equivalent settings-trust scaffolding does not exist in agi-workforce. The "trusted vs project-scoped" allowlist + the spawn-env-snapshot pattern (untouchable keys) would directly address the WEB-SET-TOKEN-UNVALIDATED / WEB-RLS-BYPASS class of issues if ported to the API gateway. |
| `log.ts`                                                                                         | The queue-then-attach `ErrorLogSink` indirection is missing in agi-workforce; every package uses ad-hoc console logging.                                                                                                                                                                 |
| `memoize.ts`                                                                                     | `memoizeWithTTLAsync`'s in-flight dedup pattern is the textbook fix for the dual-store / mock-drift issues called out in `MEMORY.md`.                                                                                                                                                    |

---

## 7. Notable bug-history annotations

The reference codebase is unusually rich with PR-specific comments that document past failures:

- **`messagePredicates.ts:3–4`** — "Four PRs (#23977, #24016, #24022, #24025) independently fixed miscounts from checking `type==='user'` alone" → tool-result messages share the discriminant, so checking only `type` mistakenly counts assistant tool-result echoes.
- **`markdownConfigLoader.ts:153–157`** — "Without bigint, different large inodes can round to the same Number, causing false duplicate detection." `#13893`. Filesystem inodes that exceed JS 53-bit precision (ExFAT, network mounts).
- **`markdownConfigLoader.ts:191–220`** — `#31905`: nested git repos (submodules) inside the session project caused the parent project's `.claude/` to be unreachable. Fixed via `resolveStopBoundary`.
- **`markdownConfigLoader.ts:307–318`** — `#29599`, `#28182`, `#26992`: worktree fallback was over-triggering and duplicating commands. Fixed via existence check on the worktree's own `.claude/<subdir>`.
- **`ide.ts:1029–1037`** — `microsoft/vscode#299416` + `anthropics/claude-code#30975`: VS Code 1.110.0 path-ordering regression that made bare `code` resolve to the GUI binary on Windows. Fixed by requesting `code.cmd` explicitly.
- **`json.ts:14–28`** — Memory leak from old lodash memoize caching every unique JSON string forever; bounded to 50 LRU + skip caching above 8 KiB.
- **`memoize.ts:127–132`** — `aws sso login` storm regression: the old sync `memoizeWithTTL` accidentally provided in-flight dedup via early Promise storage; the async variant lost it, so concurrent cold-miss callers each spawned a separate `aws sso login`.
- **`imageResizer.ts:288–292`** — Native image-processor-napi bug where reusing a `sharp` instance after `toBuffer()` does not apply format conversions. Fix: always create fresh `sharp(imageBuffer)` per operation. Cause was that all PNG/JPEG quality variants returned identical sizes.
- **`http.ts:108–114`** — `bridgeApi.ts` has a separate DI-injected version of `withOAuth401Retry` because importing `handleOAuth401Error` transitively pulls in `config.ts` (~1300 modules), which would break the SDK bundle.
- **`heapDumpService.ts:34,134–148`** — distinguishes V8 heap leaks (in snapshot) from native memory leaks (NOT in snapshot); detached-context counter is a known iframe/context leak indicator.

These annotations are **invaluable** for porting, because the comments explicitly enumerate the conditions that broke and the conditions that are guarded against. A direct port without preserving the rationale comments is at high risk of re-introducing the same bugs.

---

## 8. Security-relevant findings

- `managedEnvConstants.ts:108` — the `SAFE_ENV_VARS` allowlist explicitly enumerates dangerous categories ("redirect to attacker-controlled server", "trust attacker-controlled server", "switch to attacker-controlled project") with the rationale in code comments. This is a model for the threat-modeling that agi-workforce's web settings-injection path lacks.
- `imagePaste.ts:307` — the random-salt placeholder in `stripBackslashEscapes` prevents path-injection attacks where the path itself contains the literal placeholder string. This is a useful pattern for any token-substitution code.
- `imageStore.ts:64` — pasted images are written with mode `0o600` (owner-read/write only), preventing other local users from reading captured screenshots.
- `heapDumpService.ts:251,300` — heap dumps and diagnostic JSON are written to `~/Desktop` with mode `0o600`. Heap snapshots can contain memory contents including secrets, so the strict permission matters.
- `markdownConfigLoader.ts:191` — git-root boundary on commands/skills loading prevents `~/projects/.claude/commands/` from leaking into `~/projects/my-repo/` when the repo is git-managed. Without this, a malicious parent-directory `.claude/commands/` could shadow project-trusted commands.
- `mcpInstructionsDelta.ts:99–105` — explicit decision not to retroactively retract MCP instructions for a still-connected server (treats history as historical). A connected server cannot rescind its own instructions mid-session — even if `/model` flips a model gate.
- `ide.ts:697` — `CLAUDE_CODE_IDE_SKIP_VALID_CHECK` env var bypasses workspace-folder validation. Documented escape hatch but worth noting in the threat model.

---

## 9. Performance-relevant findings

- **Lazy-require pattern is everywhere.** `lockfile.ts`, `modifiers.ts`, `imagePaste.ts` (NSPasteboard NAPI), `mtls.ts` (undici), `ide.ts` (IdeOnboardingDialog), `idleTimeout.ts` (gracefulShutdown) all defer expensive imports past the startup path. This is the dominant perf pattern.
- **Memoize-with-cache-clear** is the second pattern. `mtls.ts:157`, `proxy.ts` (referenced from `managedEnv.ts:194`), `caCerts.ts` (referenced from `managedEnv.ts:193`) all expose `clearXCache` so settings reloads can invalidate.
- **Sort-then-batch-read** in `listSessionsImpl.ts:248` (READ_BATCH_SIZE = 32) — stat-only candidate pass is cheap; full content reads happen in chunks until enough survivors collected. Pagination cost is roughly N stats + (limit + filter-loss) reads, not N reads.
- **AsyncLocalStorage for context propagation** in `handlePromptSubmit.ts:472` — documented in code as the only correct mechanism for propagating `workload` across `await` boundaries through detached background-agent closures. Process-global mutable slots would be clobbered.
- **JSON parse cache key budget** in `json.ts:29` — `PARSE_CACHE_MAX_KEY_BYTES = 8 * 1024`. Skip caching above this size because LRU stores the full string as the key, which would pin ~10 MB across 50 slots for a 200 KB config file. Also: large inputs like `~/.claude.json` change between reads (every CC startup bumps `numStartups`), so the cache never hits anyway.
- **Bun-first hot paths** — `hash.ts` uses `Bun.hash` (~100x faster than sha256) when available; `json.ts` uses `Bun.JSONL.parseChunk` if available; `heapDumpService.ts:285` uses `Bun.generateHeapSnapshot` when in Bun runtime. All have Node.js fallbacks.
- **Native NAPI fast paths** — `imagePaste.ts:131` (NSPasteboard ~5 ms cold vs. ~1.5 s for osascript), `modifiers.ts:17` (sync modifier-key reads). Each is feature-gated on `feature('...')` + GrowthBook flag.

---

## 10. Summary

The H–N range of `~/Desktop/reference/src/utils/` covers nine functional clusters:

1. **IDE integration** (`ide.ts`, `idePathConversion.ts`, `jetbrains.ts`) — the most code by far, ~1,775 LOC for cross-process IDE detection, lockfile management, and extension installation.
2. **Image pipeline** (`imagePaste.ts`, `imageResizer.ts`, `imageStore.ts`, `imageValidation.ts`) — ~1,567 LOC for the most rigorous image pipeline anywhere in this codebase, with 8-way error classification and 5-strategy compression cascade.
3. **MCP plumbing** (`mcpInstructionsDelta.ts`, `mcpOutputStorage.ts`, `mcpValidation.ts`, `mcpWebSocketTransport.ts`) — ~727 LOC of MCP-protocol-level logic (truncation, persistence, instruction-delta, WebSocket transport).
4. **Markdown / config discovery** (`markdown.ts`, `markdownConfigLoader.ts`) — ~981 LOC for ANSI rendering and `.claude/<subdir>` discovery.
5. **Submit / queue** (`handlePromptSubmit.ts`, `messageQueueManager.ts`, `immediateCommand.ts`) — ~1,172 LOC for the unified prompt-submission funnel and priority command queue.
6. **Settings + environment** (`managedEnv.ts`, `managedEnvConstants.ts`, `mtls.ts`, `http.ts`) — ~705 LOC for trust layering, mTLS, OAuth retry.
7. **Sessions + logging** (`listSessionsImpl.ts`, `log.ts`, `logoV2Utils.ts`, `heapDumpService.ts`) — ~1,469 LOC for session enumeration, multi-sink error logging, splash logo, and heap-dump diagnostics.
8. **Memoization + leaf primitives** (`hash.ts`, `intl.ts`, `lockfile.ts`, `memoize.ts`, `lazySchema.ts`, `jsonRead.ts`, `messagePredicates.ts`, `keyboardShortcuts.ts`, `modifiers.ts`, `mailbox.ts`, `highlightMatch.tsx`, `hyperlink.ts`, `horizontalScroll.ts`, `ink.ts`, `iTermBackup.ts`, `idleTimeout.ts`, `inProcessTeammateHelpers.ts`, `heatmap.ts`, `headlessProfiler.ts`, `localInstaller.ts`, `notebook.ts`) — the bulk of leaf utilities.
9. **Cost + memory** (`modelCost.ts`, `memoryFileDetection.ts`, `json.ts`) — ~797 LOC for pricing and memory-file path classification.

The single largest porting wins for agi-workforce are likely:

- `messageQueueManager.ts` — fully missing, high value, leaf-style.
- `memoize.ts` — directly addresses the dual-store mock-drift issues called out in MEMORY.md.
- The image-pipeline cluster — `packages/chat` has nothing comparable.
- The MCP plumbing cluster — `packages/mcp` has zero tests today; these four files define the truncation/persistence/delta/transport boundary.
- `managedEnvConstants.ts` SAFE_ENV_VARS pattern — directly applicable to the WEB-SET-TOKEN-UNVALIDATED class of issues.

The single largest non-portable surface is `modelCost.ts`: hard-codes Claude tiers in a way that **violates** the agi-workforce locked rule (`models.json` is the SSOT). Any port must read tiers from `models.json` rather than from `model/configs.ts`.
