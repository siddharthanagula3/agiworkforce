# U5 — utils/\* misc subdirs deep dive (Computer Use, Chrome bridge, deep-link, telemetry, secure storage, ultraplan, sandbox, MCP helpers, file-persistence, native installer, teleport, dxt/.mcpb, background remote sessions, git-fs, plus single-file todo/skills/github)

> Scope: every remaining `utils/<subdir>/` not covered by sibling agents. ~94 files across 23 directories under `~/Desktop/reference/src/utils/`. Cross-reference: `tasks/research/anthropic-claude-suite-may-2026.md` §12 (Computer Use), §6.7 (mobile), §11 (deep links), §5.13 (IDE), §6.5 (Dispatch), §7 (Chrome).

---

## 1. computerUse/ — macOS-only, the deepest sub-system in the CLI

**Files (15):** `appNames.ts`, `cleanup.ts`, `common.ts`, `computerUseLock.ts`, `drainRunLoop.ts`, `escHotkey.ts`, `executor.ts`, `gates.ts`, `hostAdapter.ts`, `inputLoader.ts`, `mcpServer.ts`, `setup.ts`, `swiftLoader.ts`, `toolRendering.tsx`, `wrapper.tsx`.

This is the CLI implementation of Anthropic's Cowork-grade computer-use surface, ported off of Cowork's Electron path (`apps/desktop/src/main/nest-only/computer-use/executor.ts`) onto a terminal context. Two native NAPI modules: `@ant/computer-use-input` (Rust/enigo — mouse, keyboard, frontmost-app probe) and `@ant/computer-use-swift` (SCContentFilter screenshots, NSWorkspace apps, TCC permissions).

### 1.1 Action vocabulary (cite `executor.ts:294-644`)

The `ComputerExecutor` from `@ant/computer-use-mcp` wraps:

- **Display**: `getDisplaySize` / `listDisplays` / `findWindowDisplays` (`executor.ts:354-366`).
- **Capture**: `screenshot(allowedBundleIds, displayId)` returns pre-sized JPEG (Q=0.75) at `targetImageSize` so server-side resize is skipped (`executor.ts:399-418`). `zoom(region, allowedBundleIds, displayId?)` re-uses `cu.screenshot.captureRegion` with logical coords (`executor.ts:420-444`).
- **Pre-action**: `prepareForAction(allowlistBundleIds, displayId?)` wraps `cu.apps.prepareDisplay`, hiding apps not in allowlist before any mouse/key dispatch (`executor.ts:302-340`). `previewHideSet` (`executor.ts:342-350`) is the dry-run for the approval dialog. `resolvePrepareCapture` is one-shot resolve+hide+screenshot with auto-resolve of best display for the target apps (`executor.ts:368-392`).
- **Keyboard**: `key(keySequence, repeat?)` splits xdotool-style "ctrl+shift+a" on `+`, calls `input.keys(parts)` inside a `drainRunLoop` (`executor.ts:455-473`). 8ms between iterations = 125Hz USB polling cadence. `holdKey(keys[], durationMs)` press-then-sleep-then-release with orphan-guard (`executor.ts:475-507`). `type(text, {viaClipboard})` either dispatches per-grapheme via `input.typeText` (driven by upstream `toolCalls.ts`) OR uses `typeViaClipboard` which saves clipboard, writes hex-like read-back-verified text, presses Cmd+V, sleeps 100ms, restores clipboard in `finally` (`executor.ts:180-206`).
- **Mouse**: `moveMouse(x,y)` → `moveAndSettle` (50ms HID round-trip, `executor.ts:113-120`). `click(x,y,button,count,modifiers?)` move-then-click with `withModifiers` press/release bracket (`executor.ts:538-556`). `mouseDown` / `mouseUp` for fine-grained drag. `drag(from,to)` press → animated ease-out-cubic move (60fps, capped at 0.5s, only used for drag-to per `executor.ts:217-255`) → release in `finally`. `scroll(x,y,dx,dy)` move-then-vertical-then-horizontal.
- **App management**: `getFrontmostApp` (`executor.ts:613-617`), `appUnderPoint(x,y)` for hit-testing, `listInstalledApps` (Spotlight via Swift), `getAppIcon(path)` lazy-fetch, `listRunningApps`, `openApp(bundleId)`.
- **Clipboard**: `readClipboard` / `writeClipboard` via `pbpaste`/`pbcopy` subprocess (`executor.ts:70-88`) — no Electron `clipboard` module.

The MCP tool name set is whatever `buildComputerUseTools(capabilities, coordinateMode, installedAppNames?)` returns (`mcpServer.ts:67-72`); CLI pre-allowlists every `mcp__computer-use__*` so the CU package's per-action `request_access` dialog handles approval, not the generic permission system (`setup.ts:27-30`).

### 1.2 Coordinate-system handling (cite `executor.ts:60-68`, `gates.ts:69-72`)

`computeTargetDims(logicalW, logicalH, scaleFactor)` runs `targetImageSize(physW, physH, API_RESIZE_PARAMS)` so the screenshot byte payload matches the API resize ceiling (Opus 4.7 = 2576 px per `anthropic-claude-suite-may-2026.md:560`). The `coordinateMode` (`'pixels'` | `'normalized'`) is **frozen at first read** of the GrowthBook config (`gates.ts:68-72`) — a mid-session GB flip would otherwise tell the model "pixels" while the executor scaled clicks as normalized. The mode is propagated into both `setupComputerUseMCP()` (which is what the model sees in the tool descriptions) and `executor.ts` (which actually transforms coords) so the two views stay coherent.

### 1.3 Safety: lockfile, ESC abort, terminal exemption

- **`computerUseLock.ts:148-195`** — single-process O_EXCL lock at `~/.claude/computer-use.lock` containing `{sessionId, pid, acquiredAt}`. Tries to recover stale (dead-PID) locks; uses signal-0 process probe (`computerUseLock.ts:65-72`). Three states: `free | held_by_self | blocked`. Cleanup-registered shutdown handler (`registerCleanup`) so /exit mid-tool releases the lock. Re-entrant for the same session.
- **`escHotkey.ts:25-49`** — global Escape via Swift `CGEventTap.tapCreate`. Once registered, Esc is **system-wide consumed** (PI defense — a prompt-injected action can't dismiss the dialog). Holds a `drainRunLoop` pump retain. `notifyExpectedEscape()` punches a hole for model-synthesized Escapes so they don't fire the abort callback. If `tapCreate` fails (typically missing Accessibility permission), CU still works without ESC abort, and the OS notification at acquire time switches its message accordingly (`wrapper.tsx:217-225`).
- **`common.ts:43-47`** — `getTerminalBundleId()` reads `__CFBundleIdentifier` (LaunchServices stamps it on terminal-bundle children) or falls back to a static `TERMINAL_BUNDLE_ID_FALLBACK` (`common.ts:21-28`) covering iTerm, Apple Terminal, Ghostty, Kitty, Warp, vscode. Used as `surrogateHost` so the terminal we're running in is exempted from `prepareDisplay`'s hide set, exempted from screenshot capture (Swift 0.2.1's `captureExcluding` actually takes an allow-list — apps#30355 — so we strip terminal from `allowedBundleIds` via `withoutTerminal` at `executor.ts:283-286`), and skipped in the activate-z-order walk so the terminal being frontmost doesn't eat clicks meant for the target.
- **`appNames.ts:33-97`** — defends against prompt injection in app names. Path allowlist `/Applications/`, `/System/Applications/`, `~/Applications/`. Display-name blocklist on `Helper`, `Agent`, `Service`, `Uninstaller`, `Updater`, `^.` (`NAME_PATTERN_BLOCKLIST` at `appNames.ts:44-51`). Char allowlist `/^[\p{L}\p{M}\p{N}_ .&'()+-]+$/u` (`appNames.ts:108`) — uses Unicode-property classes so Bücher / 微信 / Préférences pass; rejects newlines, quotes, brackets, pipes (any of which could split tool description into a multi-line injection). 50-app cap (`appNames.ts:110`); always-keep set of 30 known-good bundle IDs (`appNames.ts:59-97`) bypasses the path/name filter for browsers, Office, Slack/Zoom/Teams, Linear/Figma, dev tools, Apple system essentials.

### 1.4 Async marshaling: drainRunLoop

**Critical implementation note (`drainRunLoop.ts:1-79`):** Swift's four `@MainActor` async methods (`captureExcluding`, `captureRegion`, `apps.listInstalled`, `resolvePrepareCapture`) and `enigo`'s `key()`/`keys()` dispatch onto `DispatchQueue.main`. Under libuv (Node/Bun) that queue NEVER drains — the promises hang. Electron pumps it via CFRunLoop, so Cowork doesn't need this. The CLI uses one refcounted `setInterval(_drainMainRunLoop, 1ms)` pump (`drainRunLoop.ts:24-40`) shared across concurrent calls, with a 30s timeout backstop. The `retainPump`/`releasePump` exports let long-lived registrations (CGEventTap) hold the pump for their lifetime.

### 1.5 MCP wiring + approval UX (cite `wrapper.tsx`, `mcpServer.ts`)

`wrapper.tsx:230-238` builds a process-lifetime `Binding` cache: one `ComputerUseSessionContext` (state read-throughs via per-call `currentToolUseContext` ref) and one dispatcher closure from `bindSessionContext` that holds the screenshot blob across calls. The package's `defersLockAcquire` set means `request_access` and `list_granted_applications` can run without taking the file lock — the enter-notification and overlay only fire when a real action acquires it (`wrapper.tsx:181-228`).

The approval dialog (`runPermissionDialog`, `wrapper.tsx:296+`) renders `<ComputerUseApproval>` via `setToolJSX` and a `Promise` — same pattern as `spawnMultiAgent.ts:419-436` for It2SetupPrompt. CLI deltas: no `withClickThrough` (we have no overlay window — `executor.ts:11-15`), no Electron `nativeImage` for pixel-validation crop (we return `null` and skip — `hostAdapter.ts:60-66`).

### 1.6 Gates / rollout (cite `gates.ts:39-58`)

External rollout: Max/Pro only (`hasRequiredSubscription`). Ant bypass for dogfooding. Feature flag `tengu_malort_pedway` controls `enabled` + sub-gates `pixelValidation`, `clipboardPasteMultiline`, `mouseAnimation` (default true), `hideBeforeAction` (default true), `autoTargetDisplay`, `clipboardGuard`, `coordinateMode`. An ant whose shell inherited monorepo dev config (`MONOREPO_ROOT_DIR` set) is auto-disabled unless `ALLOW_ANT_COMPUTER_USE_MCP=1` (`gates.ts:50-57`). The MCP server name is the literal string `'computer-use'` (`common.ts:4`) — the API backend detects `mcp__computer-use__*` and emits `COMPUTER_USE_MCP_AVAILABILITY_HINT` into the system prompt (`setup.ts:18-22`), so the model knows CU is wired even without the model author having to ship a specific instruction.

### 1.7 Cleanup (cite `cleanup.ts:30-86`)

End-of-turn (called from `stopHooks.ts` and `query.ts`'s aborted-streaming + aborted-tools paths): unhide every app `prepareForAction` hid (`hiddenDuringTurn` set in AppState), unregister the ESC hotkey, release the file lock, fire a `computer_use_exit` OS notification iff we actually unlocked. Zero-syscall pre-checks so non-CU turns no-op cheaply.

---

## 2. shell/ — bash + PowerShell providers + read-only command validator

**Files (10):** `bashProvider.ts`, `outputLimits.ts`, `powershellDetection.ts`, `powershellProvider.ts`, `prefix.ts`, `readOnlyCommandValidation.ts` (68KB!), `resolveDefaultShell.ts`, `shellProvider.ts`, `shellToolUtils.ts`, `specPrefix.ts`.

### 2.1 Shell types + defaults

`shellProvider.ts:1-3` enumerates only `'bash' | 'powershell'`. No fish, csh, ksh — those flow through the bash path. `resolveDefaultShell.ts` reads `settings.defaultShell` and falls back to `'bash'` everywhere — explicitly no Windows auto-flip to PowerShell (would break Windows users with bash hooks).

### 2.2 bashProvider — shell snapshot + tmux isolation

`bashProvider.ts:58-255`. On creation, fires `createAndSaveSnapshot(shellPath)` (from `bash/ShellSnapshot.ts`) to capture the user's PATH, aliases, exports without paying that cost on every invocation. `buildExecCommand`:

1. Re-stat the snapshot (`access()` check at `:93-102`) — if tmpdir cleanup nuked it, set `lastSnapshotFilePath = undefined` so `getSpawnArgs` adds `-l` (login shell).
2. Compute `cwdFilePath` (sandbox tmpdir or system tmpdir + `claude-${id}-cwd`); on Windows, separate POSIX path for inside the bash command vs native path for Node fs ops.
3. `rewriteWindowsNullRedirect(command)` — the model emits `2>nul` on Windows, but Git Bash on Windows turns that into a literal file `nul` which breaks git (`#4928`).
4. `quoteShellCommand(normalizedCommand, addStdinRedirect)` then optional `rearrangePipeCommand` for piped commands needing stdin redirect.
5. Build command parts: `source <snapshot> 2>/dev/null || true`, then session env script (from `getSessionEnvironmentScript` — captured at session-start hooks), then `getDisableExtglobCommand(shellPath)` for security (extended globs can be exploited via malicious filenames that expand AFTER our validation — `bashProvider.ts:39-56`), then `eval ${quotedCommand}`, then `pwd -P >| cwdFilePath`.
6. Apply `CLAUDE_CODE_SHELL_PREFIX` if set (`formatShellPrefixCommand`).

`getEnvironmentOverrides`: TMUX socket isolation deferred until first tmux use (`hasTmuxToolBeenUsed() || command.includes('tmux')`) — at that point, override TMUX to point at Claude's isolated socket (NOT the user's, so all Claude tmux activity stays in its own socket). Sandbox sets TMPDIR + CLAUDE_CODE_TMPDIR + TMPPREFIX (zsh's heredoc temp dir). Session env vars from `/env` get layered last.

### 2.3 PowerShell stack — three-file deep

`powershellDetection.ts:24-57` finds PowerShell. `pwsh` first (PowerShell 7+, supports `&&`/`||`/`?:`/`??`), `powershell` second (5.1, no chain operators, stderr-sets-`$?` bug, UTF-16 default encoding). On Linux, if `which('pwsh')` resolves into `/snap/...` (the snap launcher hangs in subprocesses while snapd inits confinement — observed bug), it probes `/opt/microsoft/powershell/7/pwsh` and `/usr/bin/pwsh` directly. `getPowerShellEdition()` infers `core | desktop` from the basename without spawning, so the tool prompt can give version-appropriate syntax guidance.

`powershellProvider.ts:11-13, 23-25, 35-95`: `buildPowerShellArgs(cmd)` always uses `-NoProfile -NonInteractive -Command cmd`. Critical hack: when sandboxed, the runtime applies `shellquote.quote()` on top of whatever we build, and any `'` triggers double-quote mode which escapes `!` as `\!` — POSIX `sh` keeps it literal, PS parser errors. The fix is `-EncodedCommand <base64-utf16-le>` (`encodePowerShellCommand` at `powershellProvider.ts:23-25`): the output is `[A-Za-z0-9+/=]` only — no chars any quoting layer can corrupt (review 2964609818 in code). Exit-code capture prefers `$LASTEXITCODE` over `$?` because PS 5.1 sets `$? = false` when a native command writes to stderr in a redirected stream (e.g. `git push 2>&1`) even if the exit code is 0.

`shellToolUtils.ts:17-22` — `isPowerShellToolEnabled()` is **Windows-only** (the permission engine uses Win32-specific path normalizations). Ant defaults on (opt-out via `CLAUDE_CODE_USE_POWERSHELL_TOOL=0`); external defaults off (opt-in via `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`).

### 2.4 Output cap

`outputLimits.ts` — `BASH_MAX_OUTPUT_DEFAULT = 30_000` chars, `BASH_MAX_OUTPUT_UPPER_LIMIT = 150_000`, controlled via env var `BASH_MAX_OUTPUT_LENGTH`. Mirrors the task-output cap in `task/outputFormatting.ts`.

### 2.5 prefix.ts + specPrefix.ts — Haiku-extracted command prefixes

`prefix.ts:92-120` builds a memoized LRU(200) extractor that calls Haiku to extract the command prefix for "Yes, and don't ask again for: \_\_\_" suggestions. Eviction-on-rejection via identity-guard so aborted calls don't poison the cache. `DANGEROUS_SHELL_PREFIXES` blocks `bash|zsh|sh|fish|csh|tcsh|ksh|dash|cmd|powershell|pwsh|bash.exe` etc. — accepting `bash:*` would defeat the whole permission system.

`specPrefix.ts:21-34` — `DEPTH_RULES` per-CLI overrides for fig-spec depth: `gcloud=4`, `gcloud compute=6`, `kubectl=3`, `docker=3`, `git push=2`. The fig-spec walker reads `subcommands` and `options` to decide how deep into args a meaningful prefix extends. Pure over `(string, string[], CommandSpec)` so PowerShell's extractor reuses it (`powershell/staticPrefix.ts` imports `buildPrefix`).

`readOnlyCommandValidation.ts` is 68KB — a deep allowlist of read-only invocations of common CLIs (`ls`, `cat`, `git status`, `git log`, `npm view`, `kubectl get`, etc.) used by Plan Mode and by the auto-mode classifier. Skim only — covered in detail by a sibling agent.

---

## 3. telemetry/ — OpenTelemetry + BigQuery + Perfetto + plugin events

**Files (9):** `betaSessionTracing.ts`, `bigqueryExporter.ts`, `events.ts`, `instrumentation.ts`, `logger.ts`, `perfettoTracing.ts`, `pluginTelemetry.ts`, `sessionTracing.ts`, `skillLoadedEvent.ts`.

### 3.1 Two parallel telemetry pipelines

1. **First-party events (`tengu_*`)** — `services/analytics/index.ts:logEvent(name, metadata)` flows to BigQuery via 1P event logging. Strict typing on metadata: `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` vs `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED`. The PII-tagged columns route to privileged `_PROTO_*` BQ columns the analyst pool can't see by default.

2. **OTEL events (`claude_code.*`)** — `events.ts:21-75` `logOTelEvent(eventName, metadata)` emits via `getEventLogger()`'s `LogRecord`. Includes `event.name`, `event.timestamp`, `event.sequence` (monotonic counter), `prompt.id`, optional `workspace.host_paths` from `CLAUDE_CODE_WORKSPACE_HOST_PATHS` (events only — too high cardinality for metric dimensions). User prompts gated by `OTEL_LOG_USER_PROMPTS=true`; otherwise content is `<REDACTED>`.

### 3.2 Notable tengu event names (sampled across utils — search across full src/utils tree turned up these)

`tengu_skill_loaded` (`telemetry/skillLoadedEvent.ts:23`) per-skill at session-start; `tengu_plugin_enabled_for_session` (`telemetry/pluginTelemetry.ts:199`); `tengu_plugin_load_failed` (`pluginTelemetry.ts:277`); `tengu_dir_search` (`markdownConfigLoader.ts:416`); `tengu_input_prompt` (`processUserInput/processTextPrompt.ts:61`); `tengu_input_bash` (`processUserInput/processBashCommand.tsx:27`); `tengu_paste_text`, `tengu_immediate_command_executed`, `tengu_cancel` (`handlePromptSubmit.ts:225-325`); `tengu_uncaught_exception`, `tengu_unhandled_rejection`, `tengu_cache_eviction_hint` (`gracefulShutdown.ts:306-493`); `tengu_file_changed` (`diff.ts:75`); `tengu_image_api_validation_failed` (`imageValidation.ts:91`); `tengu_agent_memory_loaded` (`systemPrompt.ts:87`); `tengu_teleport_*` (12+ variants in `teleport.tsx`); `tengu_preflight_check_failed` (`preflightChecks.tsx`); `tengu_tool_search_*` (`toolSearch.ts`); `tengu_fast_mode_*` (`fastMode.ts`); `tengu_file_persistence_started` (`filePersistence/filePersistence.ts:89`); `tengu_version_check_success` / `tengu_version_check_failure` (`nativeInstaller/download.ts:53-101`); `tengu_slash_command_forked` (`processSlashCommand.tsx:65`).

### 3.3 GrowthBook gates referenced in utils

`tengu_malort_pedway` (computer-use sub-gates / `computerUse/gates.ts:31`), `tengu_chrome_auto_enable` (`claudeInChrome/setup.ts:81`), `tengu_copper_bridge` (`claudeInChrome/mcpServer.ts:54`), `tengu_pewter_ledger` (plan file structure experiment / `planModeV2.ts`), `tengu_plan_mode_interview_phase`, `tengu_pid_based_version_locking` (`nativeInstaller/pidLock.ts:46`), `tengu_collage_kaleidoscope` (image paste / `imagePaste.ts:102`), `tengu_marble_sandcastle` + `tengu_penguins_off` (fast-mode), `tengu_kairos_cron_config` (cron / `cronTasks.ts`), `tengu_glacier_2xr` (deferred tools / `toolSearch.ts:632`), `tengu_trace_lantern` (beta tracing / `telemetry/betaSessionTracing.ts:93`), `tengu_ccr_bundle_seed_enabled` (teleport bundles / `teleport.tsx:944`), `tengu_ccr_bundle_max_bytes`.

### 3.4 OTEL instrumentation (`instrumentation.ts:87-200+`)

Three exporters per signal: `otlp` (`http/protobuf`, `http/json`, or `grpc`), `prometheus`, `console`. Each is dynamically imported (`@opentelemetry/exporter-metrics-otlp-grpc` is ~700KB) so the chunk only loads the chosen path. `bootstrapTelemetry()` re-exports ANT*\*-prefixed env vars to OTEL*\*. Default temporality `delta` (more sane than cumulative). Metrics interval 60s, logs/traces interval 5s.

### 3.5 sessionTracing.ts — beta enhanced telemetry

Three span types: `interaction` (root per user message), `llm_request`, `tool` (with `.execution` / `.blocked_on_user` sub-spans). `AsyncLocalStorage<SpanContext>` for `interaction` and `tool` so async-rooted code keeps the span. **WeakRef** map of all active spans + 30-min cleanup interval (`sessionTracing.ts:71-120`) catches orphaned spans (aborted streams, uncaught exceptions). `addBetaInteractionAttributes`, `addBetaLLMRequestAttributes`, `addBetaToolInputAttributes`, `addBetaToolResultAttributes` are gated on `tengu_trace_lantern` GrowthBook gate.

### 3.6 perfettoTracing.ts — ant-only Chrome Trace Event format

`CLAUDE_CODE_PERFETTO_TRACE=1` writes Chrome Trace Event format JSON to `~/.claude/traces/trace-<sid>.json` for opening in `ui.perfetto.dev`. Captures agent hierarchy (parent-child swarm relationships), API requests with TTFT / TTLT / cache stats / msg ID / speculative flag, tool executions with token usage, user-input wait time. Eliminated from external builds.

### 3.7 pluginTelemetry.ts — privacy twin-column pattern

`hashPluginId(name, marketplace)` → 16-char SHA256 truncation with fixed salt `claude-plugin-telemetry-v1` (`pluginTelemetry.ts:39-54`). Same constant across repos so customers can compute the same hash on their own plugin lists. `TelemetryPluginScope` four-value enum: `official | default-bundle | org | user-local` (`pluginTelemetry.ts:66-81`). `EnabledVia`: `user-install | org-policy | default-enable | seed-mount`. `InvocationTrigger`: `user-slash | claude-proactive | nested-skill`.

### 3.8 BigQuery / logger / skill loaded — small files

`logger.ts` is the diag adapter to OTEL Diag; only error/warn route to `logError`. `bigqueryExporter.ts` (skim only) is the metrics exporter for the ant-internal BigQuery sink. `skillLoadedEvent.ts:13-39` walks `getSkillToolCommands(cwd)` and emits one `tengu_skill_loaded` per skill with `_PROTO_skill_name` + `skill_source` + `skill_loaded_from` + `skill_budget` + optional `skill_kind`.

---

## 4. claudeInChrome/ — native messaging host + Chrome extension bridge (cite §7 anthropic-claude-suite-may-2026.md)

**Files (7):** `chromeNativeHost.ts`, `common.ts`, `mcpServer.ts`, `prompt.ts`, `setup.ts`, `setupPortable.ts`, `toolRendering.tsx`.

### 4.1 Architecture

`setup.ts:91-171` registers an MCP stdio server with name `claude-in-chrome` (`common.ts:12`). Two transport modes:

1. **Native messaging (default)** — Chrome calls a native host via stdin/stdout length-prefixed JSON. The CLI installs a manifest file at the per-browser `NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json` containing `path`, `type=stdio`, `allowed_origins` keyed to the prod extension ID `fcoeoabgfenejglbffodgkkbkcdhcgfn` plus dev/ant IDs for ant users (`setup.ts:198-213`).
2. **Bridge (gated `tengu_copper_bridge` or ant)** — WebSocket fallback via `wss://bridge.claudeusercontent.com` (or staging / local / `ws://localhost:8765`) so non-Chrome browsers can be controlled (`mcpServer.ts:51-72`).

Manifests live in **every supported Chromium browser data dir** — Chrome, Brave, Arc, Chromium, Edge, Vivaldi, Opera (`common.ts:39-130`+, `setupPortable.ts:55-91`). Extension detection scans every browser × every profile (`Default`, `Profile *`) for a directory at `Extensions/<extensionId>/` (`setupPortable.ts:147-213`). The check is async; positive results are cached to `globalConfig.cachedChromeExtensionInstalled` but **negative results are NEVER cached** because users may share `~/.claude.json` between machines and a remote dev environment shouldn't poison the host machine's auto-enable.

### 4.2 chromeNativeHost.ts — native messaging implementation

`chromeNativeHost.ts:50-57` `sendChromeMessage` writes a 4-byte little-endian length prefix + JSON bytes to stdout. `MAX_MESSAGE_SIZE = 1MB` (`:27`). The host also creates a Unix socket at `getSecureSocketPath()` (Windows: TCP) for in-process MCP clients to attach with the same protocol; socket dir is mode `0o700`, socket file `0o600`. Stale sockets cleaned by signal-0 PID probe (`:140-159`).

### 4.3 BROWSER_TOOLS catalog (cite §7 of suite ref)

`setup.ts:1` imports `BROWSER_TOOLS` from `@ant/claude-for-chrome-mcp`. The MCP names are pre-allowed `mcp__claude-in-chrome__${tool.name}` (`setup.ts:97-99`). Per `prompt.ts:38-46` the catalog includes (referenced in the system prompt): `tabs_context_mcp` (read tab list), `tabs_create_mcp` (open tab), `read_console_messages` (with regex pattern filter), `javascript_tool` (eval), `gif_creator` (multi-step recording), `read_page`, `get_page_text`, `find`, `form_input`, `file_upload`, `read_network_requests`, `navigate`, `screenshot` (via wrapper), `tabs_close_mcp`, plus shortcuts/window-resize.

### 4.4 Permission modes (`mcpServer.ts:36-44`)

Three values: `'ask'` (default — propose plan, user approves; per-site allow rules persist), `'skip_all_permission_checks'` (bypass — only set via env var when `getSessionBypassPermissionsMode()`), `'follow_a_plan'` (Anthropic's restricted mode for replay/automation). This maps directly to the §7.3 "Ask vs Act" UX in the suite reference.

### 4.5 Wrapper script + Windows registry (`setup.ts:308-345`, `:271-298`)

Chrome's manifest `path` field doesn't accept arguments, so `createWrapperScript` writes a `chrome-native-host` shell wrapper (or `.bat` on Windows) at `~/.claude/chrome/` that `exec`s `process.execPath --chrome-native-host`. Windows additionally needs registry entries under `HKEY_CURRENT_USER\Software\<browser>\NativeMessagingHosts\<id>` pointing to the manifest; `registerWindowsNativeHosts` shells out to `reg add` per browser (`setup.ts:271-298`).

### 4.6 First-install reconnect

`setup.ts:251-265` — when any manifest file is **freshly written** AND the Chrome extension is detected as installed, opens `https://clau.de/chrome/reconnect` in the user's default Chrome so the extension reattaches.

### 4.7 Two skill hints (`prompt.ts:76-83`)

`CLAUDE_IN_CHROME_SKILL_HINT` — minimal "before any `mcp__claude-in-chrome__*` tool call, invoke Skill(skill: 'claude-in-chrome')". `CLAUDE_IN_CHROME_SKILL_HINT_WITH_WEBBROWSER` — variant for sessions with the built-in WebBrowser tool active: steers dev tasks to WebBrowser, reserves the extension for logged-in / OAuth / computer-use scenarios. Tool-search instructions (`CHROME_TOOL_SEARCH_INSTRUCTIONS`, `prompt.ts:53-61`) are injected separately at request time only when ToolSearch is actually enabled.

---

## 5. secureStorage/ — macOS Keychain wrappers, plaintext fallback, prefetch optimization

**Files (6):** `fallbackStorage.ts`, `index.ts`, `keychainPrefetch.ts`, `macOsKeychainHelpers.ts`, `macOsKeychainStorage.ts`, `plainTextStorage.ts`.

### 5.1 Platform routing

`index.ts:7-17` — `darwin` returns `createFallbackStorage(macOsKeychainStorage, plainTextStorage)`; everything else returns `plainTextStorage`. Linux libsecret is a TODO comment. Windows Credential Manager **is not wrapped here** — falls through to plaintext.

### 5.2 macOS Keychain (cite `macOsKeychainStorage.ts:97-176`)

Reads via `security find-generic-password -a <user> -w -s <service>`. Writes via stdin to `security -i` (so process monitors like CrowdStrike see only `security -i`, NOT the JSON payload — INC-3028). The payload is hex-encoded JSON to avoid shell-escape issues: `Buffer.from(jsonString, 'utf-8').toString('hex')`. **Stdin overflow fallback** (`macOsKeychainStorage.ts:24, 121-145`) — `security -i` reads with a 4096-byte fgets() buffer. Payloads near that limit fall back to argv (1MB ARG_MAX); hex argv is recoverable by a determined observer but defeats naive plaintext-grep, and silent corruption is strictly worse (#30337).

### 5.3 Service-name hash for non-default config dir

`macOsKeychainHelpers.ts:29-41` — `getMacOsKeychainStorageServiceName(suffix)` returns `Claude Code<oauthSuffix><suffix><dirHash>`. `dirHash` is empty for the default `~/.claude` (backwards compat); for `CLAUDE_CONFIG_DIR=...` it appends `-` + first 8 chars of SHA-256(configDir) so two dirs don't collide.

### 5.4 Prefetch optimization (cite `keychainPrefetch.ts:1-117`)

`security find-generic-password` is ~32ms per invocation. The CLI used to call it sequentially for OAuth + legacy API key = ~65ms on every macOS startup. **`startKeychainPrefetch()`** fires both subprocesses in parallel at the very top of `main.tsx` (immediately after `startMdmRawRead()`) so they race the rest of the import chain. `ensureKeychainPrefetchCompleted()` is awaited later in preAction. Result is primed into `keychainCacheState.cache` only if the call wasn't a timeout — timed-out reads don't poison the cache (would shadow a key the sync path could fetch).

`keychainCacheState` (`macOsKeychainHelpers.ts:71-91`) keeps a `cache: { data, cachedAt }`, a monotonic `generation` counter (incremented on every invalidation so a stale subprocess result doesn't overwrite fresh data from `update()`), and `readInFlight` to dedupe concurrent reads. **TTL 30s** (`KEYCHAIN_CACHE_TTL_MS`) — 50+ claude.ai MCP connectors auth-refreshing at startup with a short TTL caused a 5.5s event-loop stall (go/ccshare/adamj-20260326-212235); 30s of cross-process staleness is fine because OAuth tokens expire in hours.

### 5.5 Stale-while-error

`macOsKeychainStorage.ts:54-66` — if a refresh `security` spawn fails AND we previously had a value, **keep serving the stale value** rather than caching `null`. A single transient subprocess failure would otherwise surface as "Not logged in" across all subsystems until the next user interaction. `clearKeychainCache()` still does explicit invalidation (logout, delete) so it reads through.

### 5.6 Fallback semantics (cite `fallbackStorage.ts:7-69`)

`createFallbackStorage(primary, secondary)` reads primary; if non-null, return; else read secondary or `{}`. Update prefers primary; on success, **deletes secondary** if primary previously had no value (migration on first write — preserves shared-`.claude` host/container scenarios per #1414). If primary write FAILS but the fallback succeeds AND primary had an OLDER value, **explicitly delete primary** (`fallbackStorage.ts:51-58`) — otherwise the stale primary entry would shadow the fresh data on the next read (`/login` loop, #30337). Delete unions both; success if either succeeds.

### 5.7 Plaintext fallback

`plainTextStorage.ts:19-84` — JSON at `<configDir>/.credentials.json`, mode 0600, returns `{success:true, warning:'Warning: Storing credentials in plaintext.'}`. Used on all non-darwin platforms.

### 5.8 isMacOsKeychainLocked

`macOsKeychainStorage.ts:211-231` — `security show-keychain-info` returns exit 36 when locked (common in SSH sessions where keychain isn't auto-unlocked). Result is **process-lifetime cached** because it's called from React render and unlock state doesn't change during a CLI session (a virtual-scroll remount cascade was spawning `security` 27ms-per-message before this cache).

---

## 6. deepLink/ — `claude-cli://` URL scheme (cite §11 of suite ref)

**Files (6):** `banner.ts`, `parseDeepLink.ts`, `protocolHandler.ts`, `registerProtocol.ts`, `terminalLauncher.ts`, `terminalPreference.ts`.

> Note: the implemented scheme is `claude-cli://`, NOT `claude://` as the suite ref's §6.5 suggests. The CLI binary handles its own scheme; `claude://` is reserved for the desktop app.

### 6.1 URI schema (`parseDeepLink.ts:23-153`)

`claude-cli://open?q=<query>&cwd=<abs-path>&repo=<owner>/<repo>`. All optional. Defaults: cwd=home, q=no prefill, repo=resolve via `githubRepoPathMapping.ts` MRU clone lookup.

**Hardening** (`parseDeepLink.ts:36-153`):

- `containsControlChars` rejects bytes 0x00–0x1F + 0x7F (newlines etc. would split shell command at use site).
- `REPO_SLUG_PATTERN = /^[\w.-]+\/[\w.-]+$/` (`:50`) — exactly one slash, no traversal.
- `MAX_QUERY_LENGTH = 5000` (`:70`) — practical ceiling for Windows cmd.exe fallback's 8191-char limit. Reject (don't truncate) — truncation changes meaning. A pathological query > 60% percent-signs could 2× past the limit but cmd.exe is last-resort.
- `MAX_CWD_LENGTH = 4096` (Linux PATH_MAX).
- `cwd` must be absolute (POSIX `/` or Windows `C:[/\\]`).
- `partiallySanitizeUnicode(rawQuery.trim())` strips ASCII-smuggling / hidden Unicode chars before length check.

### 6.2 Origin banner (cite §1.1 of `banner.ts`)

`buildDeepLinkBanner({cwd, prefillLength?, repo?, lastFetch?})` returns multi-line warning showing tildified cwd ("which CLAUDE.md will load"), repo slug + last-fetch age (>7 days = "CLAUDE.md may be stale"), and prefill length warning. Above `LONG_PREFILL_THRESHOLD = 1000` chars (`banner.ts:30`), the message switches from "review carefully" to "scroll to review the entire prompt" — a malicious tail buried past line 60 isn't silently off-screen. `readLastFetchTime(cwd)` reads `.git/FETCH_HEAD` mtime; for worktrees, returns max(local mtime, common mtime) so a recently-fetched main repo doesn't read as "never fetched" from a worktree.

### 6.3 Protocol handler entry (`protocolHandler.ts:36-105`)

`handleDeepLinkUri(uri)`: parse → resolve cwd from explicit cwd OR repo MRU OR home → `readLastFetchTime` (resolves in trampoline so launched instance is await-free) → `launchInTerminal(process.execPath, {query, cwd, repo, lastFetchMs})`. `handleUrlSchemeLaunch()` checks `__CFBundleIdentifier === MACOS_BUNDLE_ID` (LaunchServices stamps it on URL-handler bundle launches), then dynamically imports `url-handler-napi` and `waitForUrlEvent(5000)` to receive the URL from the Apple Event.

### 6.4 Registration (`registerProtocol.ts:33-100`+)

- **macOS** — minimal `.app` trampoline at `~/Applications/Claude Code URL Handler.app/`. `Info.plist` has `CFBundleURLTypes` for the scheme; `Contents/MacOS/claude` is a symlink to `claudePath`. Avoids needing a separately signed binary (Santa allowlist friction). Bundle ID = `com.anthropic.claude-code-url-handler` (`:33`).
- **Linux** — `.desktop` file at `$XDG_DATA_HOME/applications/claude-code-url-handler.desktop` registered with `xdg-mime`.
- **Windows** — `HKCU\Software\Classes\claude-cli\shell\open\command` registry value = `"claude.exe" --handle-uri "%1"`.

`FAILURE_BACKOFF_MS = 24h` (`:54`) so a registration failure doesn't retry on every launch.

### 6.5 Terminal launcher (`terminalLauncher.ts:14-100`+)

macOS preference order: iTerm2 → Ghostty → Kitty → Alacritty → WezTerm → Terminal.app (`MACOS_TERMINALS` at `:28-43`). Linux: Ghostty → Kitty → Alacritty → WezTerm → gnome-terminal → konsole → xfce4-terminal → mate-terminal → tilix → xterm. Windows: wt.exe → PowerShell → cmd.exe (cmd.exe last-resort because of the 8191-char limit). `detectMacosTerminal` first checks the stored `globalConfig.deepLinkTerminal` preference (the ONLY signal that survives into the headless LaunchServices launch context), then `TERM_PROGRAM` env var (which is unset in headless), then `mdfind` Spotlight, then direct `/Applications/<app>.app/` probe.

`terminalPreference.ts:38-54` — `updateDeepLinkTerminalPreference()` is called fire-and-forget from interactive startup. Maps `TERM_PROGRAM` lower-case (`iterm.app → iTerm`, `apple_terminal → Terminal`, etc.) and writes to `globalConfig.deepLinkTerminal` so the next browser-launched session uses the right terminal.

---

## 7. task/ — task framework + on-disk output capture (TaskOutput v2)

**Files (5):** `diskOutput.ts`, `framework.ts`, `outputFormatting.ts`, `sdkProgress.ts`, `TaskOutput.ts`.

> This is alongside V1 todo, NOT instead of it (`todo/types.ts` keeps the `pending|in_progress|completed` schema). Tasks are the runtime instances; todos are the user-visible plan items.

### 7.1 Task lifecycle (cite `framework.ts`)

`TaskState` types include `LocalAgentTaskState`, `RemoteAgentTaskState`, etc.; status enum `pending | running | completed | failed | killed`. `registerTask` at `framework.ts:78-117` registers in AppState and emits `task_started` SDK event (skipped on resume to avoid double-emit). Re-register carries forward `retain` / `startTime` / `messages` / `diskLoaded` / `pendingMessages` so user UI state survives `resumeAgentBackground`.

`pollTasks` (called from the framework at 1s intervals, `POLL_INTERVAL_MS = 1000`): generate attachments for tasks with new output OR status changes, apply offsetlets atomically (re-check status on fresh state inside the merge — task may have completed during await), emit task notifications. `evictTerminalTask` at `framework.ts:122-144` checks `'retain' in task && evictAfter > Date.now()` (panel grace 30s, `PANEL_GRACE_MS`) before deletion. Killed tasks display 3s before eviction (`STOPPED_DISPLAY_MS`).

### 7.2 TaskOutput dual-mode (cite `TaskOutput.ts`)

Two modes: **file** (bash — stdout/stderr direct to fd, never enters JS) and **pipe** (hooks — buffered in memory, spills to disk past `DEFAULT_MAX_MEMORY = 8MB`). File mode uses a **shared poller** (`TaskOutput.#tick` at `:107-119`) that tails every actively-polled task's file by `PROGRESS_TAIL_BYTES = 4096` every `POLL_INTERVAL_MS = 1000`. Single `setInterval` registry; `startPolling`/`stopPolling` driven by React useEffect. `unref()` so the timer doesn't keep process alive.

Disk path uses `O_NOFOLLOW` (`diskOutput.ts:21`) — without it, an attacker in the sandbox could create symlinks in tasks dir pointing at arbitrary host files and force Claude to write to them. `MAX_TASK_OUTPUT_BYTES = 5GB` is the disk cap (`:30`). Session-ID-namespaced path so concurrent sessions in the same project don't clobber each other's output (#4586). Session ID is captured at FIRST CALL not re-read on every invocation — `/clear` calls `regenerateSessionId()`, but background bash tasks surviving `/clear` need their fd path stable.

### 7.3 outputFormatting.ts — truncation header

`getMaxTaskOutputLength()` reads `TASK_MAX_OUTPUT_LENGTH` env (default 32K, max 160K). When output exceeds, returns last `(maxLen - header.length)` chars with header `[Truncated. Full output: <path>]\n\n` so the model can read the full file via FileReadTool if needed.

### 7.4 sdkProgress.ts — task_progress event

Mid-run progress emit. Used by background agents (per tool_use in `runAsyncAgentLifecycle`) and workflows (per flushProgress batch). Carries `task_id`, `tool_use_id`, `description`, `usage` (total_tokens / tool_uses / duration_ms), `last_tool_name`, `summary`, `workflow_progress`.

---

## 8. suggestions/ — fuzzy autocomplete + skill ranking + Slack channel cache

**Files (5):** `commandSuggestions.ts`, `directoryCompletion.ts`, `shellHistoryCompletion.ts`, `skillUsageTracking.ts`, `slackChannelSuggestions.ts`.

### 8.1 commandSuggestions — Fuse.js fuzzy match

`getCommandFuse(commands)` builds a Fuse index keyed by the commands array IDENTITY (not contents) — REPL.tsx memoizes the array so we only rebuild on real change. Search keys: `commandName` (weight 3), `partKey` for multi-part names split on `[:_-]` (weight 2), `aliasKey` (weight 2), `descriptionKey` cleaned word list (weight 0.5). Threshold 0.3, location 0 (prefer beginning matches), distance 100 (allow description matches). Scores blended with `getSkillUsageScore(commandName)`.

### 8.2 directoryCompletion — LRU(500) directory + path scan

`parsePartialPath(partialPath, basePath?)` splits into directory + prefix, expands `~`, handles trailing separator. Two caches: `directoryCache` (directories only) and `pathCache` (files + directories), 5min TTL. Used by `@`-mention path expansion.

### 8.3 shellHistoryCompletion — ghost-text from `!` history

Reads from `getHistory()` (lifted out of the `!` prefix entries), unique commands, max 50 most recent, 60s cache TTL (history doesn't change while typing). `getShellHistoryCompletion(input)` returns `{fullCommand, suffix}` if `command.startsWith(input) && command !== input`. `prependToShellHistoryCache(command)` lets just-submitted commands bubble to front without flushing.

### 8.4 skillUsageTracking — exponential-decay ranking

`recordSkillUsage(name)`: 60s debounce so rapid invocations don't write `globalConfig` repeatedly. `getSkillUsageScore`: `usageCount * max(0.5^(daysSinceUse/7), 0.1)` — 7-day half-life with 0.1 floor so heavily-used-but-old skills don't drop entirely. Used to rank skill-style commands in the suggestion list.

### 8.5 slackChannelSuggestions — MCP-driven typeahead

Calls `slack_search_channels` MCP tool when an `#`-mention is typed. Uses a plain `Map` (not LRU) because findReusableCacheEntry needs prefix-iteration. Maintains a flat `knownChannels` set used by `subscribeKnownChannels` so PromptInput colors only confirmed-real channel names. The Slack MCP server wraps results in `{"results": "<markdown>"}` envelope; `unwrapResults` strips that.

---

## 9. nativeInstaller/ — `claude install` self-installer

**Files (5):** `download.ts`, `index.ts`, `installer.ts` (54KB), `packageManagers.ts`, `pidLock.ts`.

### 9.1 Architecture

Symlink-based versioning. Three XDG dirs: `versions/` (data — permanent), `staging/` (cache — can be deleted), `locks/` (state). User-bin executable symlinks to currently-active version. `VERSION_RETENTION_COUNT = 2` — keep only current + previous so disk doesn't grow.

### 9.2 Sources

`download.ts:30-149`. Two release backends:

- **Ant** — Artifactory NPM `https://artifactory.infra.ant.dev/artifactory/api/npm/npm-all/`, queried with `npm view`. Tag: `stable | latest`.
- **External** — GCS bucket `https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases`. Channel: `stable | latest` plus direct `vX.Y.Z` versions. `99.99.x` is reserved for CI smoke-test fixtures (gated via DCE on `feature('ALLOW_TEST_VERSIONS')`).

### 9.3 packageManagers.ts — install-source detection

Detects which package manager owns the running binary by exec-path heuristic: `mise/installs/` → `mise`, `.asdf/installs/` → `asdf`, `Caskroom/` → `homebrew`. Reads `/etc/os-release` for distro family (`ID`, `ID_LIKE`) so we can skip `dpkg`/`rpm` on distros that can't have them. Memoized.

### 9.4 pidLock.ts — version-running detection

Lock file content: `{pid, version, execPath, acquiredAt}`. Stale check: signal-0 PID probe AND optional process command-line match (`getProcessCommand`) so PID reuse doesn't cause false positives. Fallback timeout `FALLBACK_STALE_MS = 2h` for the very rare case PID probe is inconclusive (NFS edge cases). Mtime-based fallback when PID locking is disabled (default 30 days, used to be the only mechanism). Gated `tengu_pid_based_version_locking`.

### 9.5 Installer flow (high-level from `installer.ts:74-200`)

1. `downloadVersion(stagingPath, version)` — npm-pack OR axios direct download. Validates SHA256.
2. `chmod +x`.
3. Move from staging to `versions/<version>/`.
4. Atomically swap `~/.local/bin/claude` symlink (or Windows `~/AppData/Local/...`).
5. Update shell config (PATH check, alias detection in `shellConfig.ts`).
6. Cleanup old versions per `VERSION_RETENTION_COUNT`.
7. Cleanup orphan npm installations from prior `npm i -g @anthropic-ai/claude-code`.

`SetupMessage` triplet: `{message, userActionRequired, type: 'path' | 'alias' | 'info' | 'error'}` returned to caller for user-facing post-install instructions.

---

## 10. teleport/ — `--teleport`, BYOC, environment selection

**Files (4):** `api.ts`, `environments.ts`, `environmentSelection.ts`, `gitBundle.ts`.

### 10.1 Beta header

`CCR_BYOC_BETA = 'ccr-byoc-2025-07-29'` (`api.ts:19`). All teleport-related API calls send this header.

### 10.2 API client (cite `api.ts:13-120`+)

`axiosGetWithRetry` 4-retry exponential backoff (2s, 4s, 8s, 16s) on transient errors only (`!error.response` OR `5xx`). 4xx is not retried. SessionStatus enum: `requires_action | running | idle | archived`. `SessionContextSource = GitSource | KnowledgeBaseSource`.

### 10.3 Environment kinds (cite `environments.ts:9`)

Three: `'anthropic_cloud' | 'byoc' | 'bridge'`. Anthropic-cloud creates a default sandbox with Python 3.11 + Node 20 in `/home/user`, default network policy `allow_default_hosts: true`. `fetchEnvironments()` requires Claude.ai OAuth (NOT API key — explicit error message; `environments.ts:33-39`). `createDefaultCloudEnvironment(name)` is the auto-onboard path.

### 10.4 Environment selection (`environmentSelection.ts:24-77`)

Reads `settings.remote.defaultEnvironmentId` from layered settings (managed/project/local/user). Falls back to first non-bridge environment. Reports back which `SettingSource` provided the choice so the UI can show "configured in <source>".

### 10.5 Git bundle seeding (cite `gitBundle.ts:26-100`+)

`DEFAULT_BUNDLE_MAX_BYTES = 100MB` (configurable via `tengu_ccr_bundle_max_bytes`). Three-tier fallback: `--all` → `HEAD` → `squashed-root` (parentless commit of HEAD's tree, embedding stash content). `git stash create` → `update-ref refs/seed/stash`, bundle, upload to `/v1/files`, set `seed_bundle_file_id` on SessionContext, `update-ref -d refs/seed/stash` to clean up. Telemetry: `tengu_ccr_bundle_seed_enabled` gate, `tengu_teleport_bundle_mode` event.

---

## 11. processUserInput/ — input pipeline (4 files)

**Files (4):** `processBashCommand.tsx`, `processSlashCommand.tsx` (144KB!), `processTextPrompt.ts`, `processUserInput.ts`.

### 11.1 Top-level dispatch (`processUserInput.ts:85-120`+)

Inputs branch on shape: `string | ContentBlockParam[]`. Three subtypes:

1. **Slash command (`/foo`)** — routed via `parseSlashCommand` → `processSlashCommand` (forked subagent OR inline expansion).
2. **Bash (`!foo`)** — routed via `processBashCommand` → BashTool/PowerShellTool.call() with `dangerouslyDisableSandbox: true`.
3. **Text prompt** — `processTextPrompt`.

Image paste via `imageStore`/`imageResizer` happens before any of the three; ultraplan keyword detection (`hasUltraplanKeyword(preExpansionInput)`) uses the pre-`[Pasted text #N]`-expansion input so pasted content can't trigger it.

### 11.2 processTextPrompt (cite `processTextPrompt.ts:19-99`)

Generates `promptId = randomUUID()`, sets via `setPromptId`. Starts an OTEL `interaction` span via `startInteractionSpan(userPromptText)`. Emits `claude_code.user_prompt` OTEL event (with prompt text only if `OTEL_LOG_USER_PROMPTS=true`, else `<REDACTED>`). For VS Code (array input), uses `findLast(text)` because `createUserContent` pushes the user message AFTER `<ide_selection>` / attachment context blocks (#33301). `tengu_input_prompt` 1P event with `is_negative` (matches negative keyword) / `is_keep_going`. If image content blocks present, builds a multi-block content array `[text, ...images]` so text renders above images.

### 11.3 processBashCommand (cite `processBashCommand.tsx:17-100`)

Routing: `usePowerShell = isPowerShellToolEnabled() && resolveDefaultShell() === 'powershell'`. `tengu_input_bash` event with `powershell` flag. Wraps user message as `<bash-input>cmd</bash-input>`. Renders `<BashModeProgress>` inline via `setToolJSX`. Calls BashTool/PowerShellTool with `dangerouslyDisableSandbox: true` (user-initiated `!` bypasses sandbox). PowerShellTool is **lazy-required** (~300KB chunk only loads when default shell is powershell). `processToolResultBlock` formats result the same as model-initiated tool result (so the `<persisted-output>` wrapping for >32K outputs fires here too).

### 11.4 processSlashCommand (cite `processSlashCommand.tsx:62-200`+ — 144KB total)

`executeForkedSlashCommand` for skills with `context: 'fork'`: spawns subagent with `prepareForkedCommandContext`, runs it, extracts result. Under `feature('KAIROS') && kairosEnabled`, fires the subagent in background (`bgAbortController` so main-thread ESC doesn't kill it) and re-enqueues the result as an `isMeta` prompt — N scheduled tasks become parallel, not serial. Workload tagging via `getWorkload()` + `runWithWorkload` ALS for cron attribution. MCP settle: poll up to 10s before launching forked subagent so MCP tools are available.

Twin-column plugin telemetry (`buildPluginCommandTelemetryFields`) on every slash invocation — `_PROTO_plugin_name` raw + redacted twin. `recordSkillUsage(commandName)` for fuzzy ranking.

---

## 12. powershell/ — AST parser + cmdlet allow/deny

**Files (3):** `dangerousCmdlets.ts`, `parser.ts` (66KB!), `staticPrefix.ts`.

### 12.1 dangerousCmdlets.ts — five categorical sets

- `FILEPATH_EXECUTION_CMDLETS`: `invoke-command`, `start-job`, `start-threadjob`, `register-scheduledjob` — accept `-FilePath` and execute the file.
- `DANGEROUS_SCRIPT_BLOCK_CMDLETS`: above + `invoke-expression`, `register-engineevent`, `register-objectevent`, `register-wmievent`, `new-pssession`, `enter-pssession`.
- `MODULE_LOADING_CMDLETS`: `import-module`/`ipmo`, `install-module`, `save-module`, `update-module`, `install-script`, `save-script` — `.psm1` files run their top-level body on import.
- `SHELLS_AND_SPAWNERS`: `pwsh`, `powershell`, `cmd`, `bash`, `wsl`, `sh`, `start-process`, `start`, `add-type`, `new-object`.
- Network cmdlets: `Invoke-WebRequest`, `Invoke-RestMethod`, etc. (referenced by alias-resolver so wildcard rules like `Invoke-WebRequest:*` are blocked).

`NEVER_SUGGEST` (referenced from `staticPrefix.ts:18`) is the union — these never appear in "Don't ask again for: \_\_\_" suggestions.

### 12.2 parser.ts — PowerShell AST (66KB)

Owns: `parsePowerShellCommand(text)` → tree-sitter-style AST, `getAllCommands(ast)` → flat list of `ParsedCommandElement[]`, `nameType` classifier (`'cmdlet' | 'application' | 'unknown'`), `COMMON_ALIASES` map (gci → Get-ChildItem etc.), `toUtf16LeBase64` for `-EncodedCommand`. Covered in detail by sibling agent — skim only.

### 12.3 staticPrefix.ts — fig-spec walker for PS

Mirrors bash's `getCommandPrefixStatic`. For cmdlets (Verb-Noun), the name itself is the right granularity (no subcommand concept — `Get-Process -Name pwsh` → `Get-Process`). For external commands (git, npm, docker, kubectl): guards element types — first element MUST be `StringConstant` (else dynamic invocation `& $cmd status` produces dead rules); all subsequent must be `StringConstant | Parameter` (no `Variable`/`SubExpression`/`ScriptBlock`/`ExpandableString`). Then feeds argv into shared `buildPrefix` with `DEPTH_RULES` from `shell/specPrefix.ts`. PowerShell is case-insensitive so name is lowercased for fig-spec lookup (Linux fs is case-sensitive, macOS hides this bug).

---

## 13. git/ — filesystem-only git reads (no subprocess)

**Files (3):** `gitConfigParser.ts`, `gitFilesystem.ts`, `gitignore.ts`.

### 13.1 gitFilesystem.ts — verified against git source

Refs the file path equivalents straight from git's C source. `resolveGitDir(startPath?)` finds `.git/` (handles worktrees and submodules where `.git` is a `gitdir: <path>` text file per `setup.c read_gitfile_gently`). `isSafeRefName(name)` is the most security-critical helper here — allowlist `[a-zA-Z0-9/._+@-]+` + reject `^-` (argument injection), `^/` (absolute path traversal), `..` (relative traversal), single-dot path components (would normalize to repo root), empty path components. .git/HEAD is plain text writable by anyone — without this validator, an attacker who could write to .git/HEAD could embed `..`, leading `-`, or shell metacharacters into a branch name that the commit-push-pr skill interpolates into shell.

`GitHeadWatcher` class (referenced) uses `fs.watchFile` to cache branch + SHA without subprocess.

### 13.2 gitConfigParser.ts — verified against git config.c

Hand-rolled parser, NOT regex-only. Section names case-insensitive, subsection names quoted-string with `\\` and `\"` escapes case-sensitive, key names case-insensitive, values support inline comments (`#`/`;`), backslash escapes, optional quoting. `parseConfigString` walks line-by-line tracking `inSection` state.

### 13.3 gitignore.ts — global gitignore management

`isPathGitignored(path, cwd)` shells out to `git check-ignore` (consults all sources with correct precedence). `addFileGlobRuleToGitignore(filename, cwd)` appends `**/${filename}` to `~/.config/git/ignore` (the global gitignore) iff not already ignored by ANY gitignore source. Used to teach git to ignore Claude artifacts (`*.claude.lock`, etc.) without polluting per-project `.gitignore`.

---

## 14. ultraplan/ — keyword trigger + plan-mode polling

**Files (2):** `ccrSession.ts`, `keyword.ts`.

### 14.1 keyword.ts — pre-submit keyword detector

Mirrors `findThinkingTriggerPositions` (in `thinking.ts`). Returns positions `{word, start, end}`. Skips occurrences inside paired delimiters (backticks, double quotes, angle brackets — only tag-like, not generic `<` so `n < 5 ultraplan n > 10` works), curly braces, square brackets (innermost — covers `[Pasted text #N]` placeholders), parens. Single quotes are delimiters only when not apostrophes (preceded by non-word + followed by non-word). Skips path-like context (`/foo/ultraplan/bar.ts`, `--ultraplan-mode`), file extensions (`ultraplan.tsx`), question form (`ultraplan?`), slash commands (text starting with `/`). PromptInput rainbow-highlights the word + shows a "will launch ultraplan" notification when the trigger fires.

`replaceUltraplanKeyword(text)` strips the `ultra` prefix from the first triggerable occurrence so the forwarded prompt stays grammatical: "please ultraplan this" → "please plan this". Preserves casing of the `plan` suffix.

Symmetric pair: `findUltrareviewTriggerPositions` for review variant.

### 14.2 ccrSession.ts — ExitPlanMode polling for /ultraplan

Polls a remote CCR session for an approved `ExitPlanMode` tool result. State machine `ExitPlanModeScanner` ingests `SDKMessage[]` batches and classifies each turn as `approved | teleport | rejected | pending | terminated | unchanged`. Sentinel `__ULTRAPLAN_TELEPORT_LOCAL__` on the rejection feedback signals the user clicked "teleport back to terminal" in the browser PlanModal.

`POLL_INTERVAL_MS = 3000`, `MAX_CONSECUTIVE_FAILURES = 5` (for ~30min poll = 600 calls, any nonzero 5xx rate would otherwise blow up). `UltraplanPhase`: `running | needs_input | plan_ready`. Plan mode is set via `set_permission_mode` control_request in the CreateSession `events` array (caller side, not here).

Precedence: approved > terminated > rejected > pending > unchanged. A batch can contain both an approved tool_result AND a subsequent `result.subtype !== 'success'` (user approved, then remote crashed) — the approved plan is real and in threadstore, don't drop it.

---

## 15. sandbox/ — adapter onto `@anthropic-ai/sandbox-runtime`

**Files (2):** `sandbox-adapter.ts` (35KB), `sandbox-ui-utils.ts`.

`sandbox-adapter.ts:1-120`+ wraps `SandboxManager` from `@anthropic-ai/sandbox-runtime` with Claude-CLI–specific path conventions:

- `//path` → absolute from filesystem root (becomes `/path`).
- `/path` → relative to settings file directory (becomes `$SETTINGS_DIR/path` resolved via `getSettingsRootPathForSource(source)`).
- `~/path` → passed through (sandbox-runtime handles).
- `./path` / `path` → passed through.

Imports `BashTool`, `FileEditTool`, `FileReadTool`, `WebFetchTool` to convert permission rules from `<tool>:<rule>` form to the schema the sandbox-runtime expects. Settings change detector + memoized lookup so a settings reload doesn't re-build the manager from scratch.

`sandbox-ui-utils.ts` is tiny — `removeSandboxViolationTags(text)` strips `<sandbox_violations>...</sandbox_violations>` from displayed messages.

---

## 16. memory/ — Memory tool versioning + types

**Files (2):** `types.ts`, `versions.ts`.

`types.ts` — `MEMORY_TYPE_VALUES = ['User', 'Project', 'Local', 'Managed', 'AutoMem', ...(feature('TEAMMEM') ? ['TeamMem'] : [])]`. The `feature()` is `bun:bundle` — DCE'd out for non-team builds, so external CLI doesn't expose the TeamMem option in `/memory edit`.

`versions.ts` — `projectIsInGitRepo(cwd)` sync wrapper around `findGitRoot`. Used to gate Memory-tool operations that need a project root.

---

## 17. mcp/ — natural-language datetime + elicitation validation

**Files (2):** `dateTimeParser.ts`, `elicitationValidation.ts`.

### 17.1 dateTimeParser.ts — Haiku-driven NL → ISO 8601

`parseNaturalLanguageDateTime(input, format: 'date' | 'date-time', signal)`. System prompt: "respond with ONLY the ISO 8601 string", "prefer future over past for ambiguous", "for times without dates use today", "respond INVALID for incomplete/gibberish". User prompt includes current ISO datetime, local timezone, day of week as context. Validates result starts with `\d{4}` (year). Supports "tomorrow at 3pm" → `2025-10-15T15:00:00-07:00`, "next Monday", "in 2 hours". `looksLikeISO8601(input)` quick check avoids spending Haiku tokens on already-ISO strings.

### 17.2 elicitationValidation.ts — MCP elicit/\* schema validation

MCP servers can elicit user input via primitive schemas (`StringSchema`, `EnumSchema`, `MultiSelectEnumSchema`). Supports `enum` (legacy) and `oneOf` (new) for single-select; `array` with `items.enum` or `items.anyOf` for multi-select with display labels (`title` field on `oneOf` entries). `STRING_FORMATS` map for `email`, `uri`, `date`, `date-time` with description + example pairs surfaced in the prompt. Uses `dateTimeParser` for the `date`/`date-time` formats so users can type natural language.

---

## 18. filePersistence/ — BYOC end-of-turn outputs upload

**Files (2):** `filePersistence.ts`, `outputsScanner.ts`.

### 18.1 Architecture

End-of-turn hook in BYOC environments (`CLAUDE_CODE_ENVIRONMENT_KIND === 'byoc'`). Scans `<cwd>/<sessionId>/outputs/` for files modified since `turnStartTime` (recursive readdir + parallel lstat, skip symlinks for security — `outputsScanner.ts:78-126`). Uploads new/changed files to the Files API via `uploadSessionFiles` and emits `tengu_file_persistence_started` + final `FilesPersistedEventData` event with successes/failures. `FILE_COUNT_LIMIT`, `DEFAULT_UPLOAD_CONCURRENCY` constants in `types.ts`.

For `anthropic_cloud` the path is different — rclone handles sync, this module just queries the Files API listDirectory for resulting file IDs (referenced but not implemented in this dir).

### 18.2 Symlink protection

`outputsScanner.ts:81-83, 100-103` — skip symlinks in BOTH the readdir filter AND the post-stat check (TOCTOU: file may become a symlink between calls). Without this, a malicious file in outputs could symlink to `~/.ssh/` and the BYOC upload would publish private keys.

---

## 19. dxt/ — `.dxt` / `.mcpb` desktop extension format

**Files (2):** `helpers.ts`, `zip.ts`.

> Reference §2.3: "Desktop Extensions (.mcpb): install/uninstall/update; admins on Team/Enterprise can enable/disable public extensions and upload custom extensions per the Aug 2025 admin-controls release."

### 19.1 zip.ts — zip-bomb-resistant extraction

Limits (`zip.ts:7-13`): `MAX_FILE_SIZE = 512MB`, `MAX_TOTAL_SIZE = 1024MB`, `MAX_FILE_COUNT = 100k`, `MAX_COMPRESSION_RATIO = 50:1` (above is suspicious, zip-bomb signal), `MIN_COMPRESSION_RATIO = 0.5:1` (below might indicate already-compressed malicious payload). `isPathSafe(path)` uses `containsPathTraversal` + reject `isAbsolute(normalize(path))`. fflate `unzipSync` is dynamically imported (~196KB of top-level lookup tables — `revfd Int32Array(32769)`, `rev Uint16Array(32768)` etc. — kept out of startup heap).

### 19.2 helpers.ts — manifest validation

Lazy-imports `@anthropic-ai/mcpb` (zod-v3 with 24 `.bind(this)` per schema = ~700KB of bound closures otherwise loaded at startup). `validateManifest` returns typed `McpbManifest` or throws with formatted error. `parseAndValidateManifestFromText` / `...FromBytes` wrap text/binary input.

`generateExtensionId(manifest, prefix?)` — deterministic ID = sanitized author + name. Sanitize: lowercase, spaces→`-`, drop non-`[a-z0-9-_.]`, dedupe `-`, trim. Prefixes: `local.unpacked` (dev mode) | `local.dxt` (.dxt installed). Same algorithm as the directory backend so package-IDs match across tools.

---

## 20. background/remote/ — background remote-session preflight

**Files (2):** `preconditions.ts`, `remoteSession.ts`.

`BackgroundRemoteSessionPrecondition` 6-value union: `not_logged_in | no_remote_environment | not_in_git_repo | no_git_remote | github_app_not_installed | policy_blocked`. `checkBackgroundRemoteSessionEligibility({skipBundle})` short-circuits on `policy_blocked` (Enterprise admins can `allow_remote_sessions: false`). `bundleSeedGateOn` — when bundle seeding is enabled (env or `tengu_ccr_bundle_seed_enabled`), being in a `.git/` is enough; no GitHub remote or app required (CCR can seed from the local bundle). Else: GitHub remote + GitHub App installed are required.

`checkGithubAppInstalled(owner, repo)` calls `GET /api/oauth/organizations/<orgUUID>/code/repos/<owner>/<repo>` with the Claude.ai access token. `checkIsGitClean({ignoreUntracked: true})` so untracked files (which won't be lost on branch switch) don't false-block.

Used by `--background-remote` (Cmd+Shift+R style) to enable persistent CCR sessions that survive shell exit.

---

## 21. todo/ — V1 TodoList schema (single file)

**File (1):** `types.ts`.

`TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed'])`. `TodoItemSchema = z.object({content, status, activeForm})` — `activeForm` is the present-progressive verb form for display ("Searching the codebase" vs "Search the codebase"). `TodoListSchema = z.array(TodoItemSchema)`. Lazy-imported via `lazySchema` so the zod runtime cost is deferred until the TodoTool actually fires.

This V1 is alongside the larger Task framework in `task/` — todos are user-visible plan items, tasks are runtime workflow instances (background bash, subagents, remote sessions).

---

## 22. skills/ — chokidar-based skill change detector

**File (1):** `skillChangeDetector.ts`.

Watches `getSkillsPath()` directories with chokidar `depth: 2`. **Bun workaround** (`:54-62`): native `fs.watch` has a `PathWatcherManager` deadlock (`oven-sh/bun#27469`, `#26385`) where closing a watcher on the main thread while the File Watcher thread is delivering events can hang both threads in `__ulock_wait2` forever. Chokidar-with-depth-2 on large skill trees triggers this reliably during git operations. Workaround: use `usePolling: true` under Bun (`USE_POLLING = typeof Bun !== 'undefined'`), 2s interval. Once the upstream Bun fix lands the polling-only path can be removed.

`FILE_STABILITY_THRESHOLD_MS = 1000` — wait for stable state before processing changes (skill edits often touch multiple files in a burst). `RELOAD_DEBOUNCE_MS = 300` — coalesce cascading reloads to avoid event-loop lockup when 30+ files change at once. On change: `clearSkillCaches` + `clearCommandsCache` + `executeConfigChangeHooks` + notify subscribers via `createSignal`.

---

## 23. github/ — gh CLI auth status

**File (1):** `ghAuthStatus.ts`.

Returns `'authenticated' | 'not_authenticated' | 'not_installed'`. Uses `which('gh')` first (Bun's fast no-subprocess `which`) then `gh auth token` (NOT `gh auth status` — `status` makes a network call to GitHub's API; `auth token` only reads local config / keyring). Spawns with `stdout: 'ignore'` so the token never enters this process. Used for telemetry and to decide whether to show `gh login` instructions in the doctor output.

---

## Top-level cross-cutting observations

1. **GrowthBook gate names are all `tengu_<word>_<word>`** — code-name safety net. ~30 distinct gates referenced across these utils alone. Any port that wants real-world feature toggles needs a similar generic gate-eval client (`getFeatureValue_CACHED_MAY_BE_STALE<T>`) and a runtime-cached config object.

2. **Native modules are darwin-only** — `@ant/computer-use-input` (enigo), `@ant/computer-use-swift` (SCContentFilter / NSWorkspace / TCC). Linux/Windows CU is **not implemented** in the CLI (Cowork-via-VM handles those; CLI never exposed CU outside macOS). This is a major gap for AGI Workforce parity if we want CU in the CLI on Windows/Linux.

3. **Multiple async-marshaling layers** — drainRunLoop pump (CFRunLoop pump for libuv runtimes), keychainPrefetch (parallel subprocess fan-out before main.tsx imports finish), `withResolvers` timeout race, `AsyncLocalStorage` for span context. Engine-level expertise required.

4. **Two parallel telemetry systems** — first-party `tengu_*` (BigQuery via `_PROTO_*` PII columns) AND OpenTelemetry (`claude_code.*`). They emit independently for the same user actions in many cases. The split of "analytics for Anthropic" vs "OTel for customer SOC pipeline" is intentional.

5. **`128KB+ files**: `processSlashCommand.tsx` (144K), `executor.ts`+`wrapper.tsx` (49K+34K), `installer.ts` (54K), `parser.ts` PowerShell AST (66K), `readOnlyCommandValidation.ts` (68K), `instrumentation.ts` (26K), `perfettoTracing.ts` (29K), `sessionTracing.ts` (28K). All single-source, no module split — explicitly accept the chunk size for incremental compile speed.

6. **Settings layering is everywhere** — `getSettingsForSource(source)`, `SETTING_SOURCES` precedence, `getSettings_DEPRECATED` for the merged view. Any port needs the same five-tier hierarchy: managed → policy → project → local → user.

7. **Process lifecycle hooks** — `registerCleanup(fn)` is the universal mechanism (computerUseLock, escHotkey, perfettoTracing, telemetry, native installer locks). Caller registers; gracefulShutdown drains them on exit/abort. Avoids stuck modifier keys, orphan locks, half-flushed traces.

---

## File path list (absolute)

- `/Users/siddhartha/Desktop/reference/src/utils/computerUse/{appNames,cleanup,common,computerUseLock,drainRunLoop,escHotkey,executor,gates,hostAdapter,inputLoader,mcpServer,setup,swiftLoader,toolRendering.tsx,wrapper.tsx}.{ts,tsx}`
- `/Users/siddhartha/Desktop/reference/src/utils/shell/{bashProvider,outputLimits,powershellDetection,powershellProvider,prefix,readOnlyCommandValidation,resolveDefaultShell,shellProvider,shellToolUtils,specPrefix}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/telemetry/{betaSessionTracing,bigqueryExporter,events,instrumentation,logger,perfettoTracing,pluginTelemetry,sessionTracing,skillLoadedEvent}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/claudeInChrome/{chromeNativeHost,common,mcpServer,prompt,setup,setupPortable,toolRendering.tsx}.{ts,tsx}`
- `/Users/siddhartha/Desktop/reference/src/utils/secureStorage/{fallbackStorage,index,keychainPrefetch,macOsKeychainHelpers,macOsKeychainStorage,plainTextStorage}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/deepLink/{banner,parseDeepLink,protocolHandler,registerProtocol,terminalLauncher,terminalPreference}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/task/{diskOutput,framework,outputFormatting,sdkProgress,TaskOutput}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/suggestions/{commandSuggestions,directoryCompletion,shellHistoryCompletion,skillUsageTracking,slackChannelSuggestions}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/nativeInstaller/{download,index,installer,packageManagers,pidLock}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/teleport/{api,environments,environmentSelection,gitBundle}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/processUserInput/{processBashCommand.tsx,processSlashCommand.tsx,processTextPrompt,processUserInput}.{ts,tsx}`
- `/Users/siddhartha/Desktop/reference/src/utils/powershell/{dangerousCmdlets,parser,staticPrefix}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/git/{gitConfigParser,gitFilesystem,gitignore}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/ultraplan/{ccrSession,keyword}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/sandbox/{sandbox-adapter,sandbox-ui-utils}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/memory/{types,versions}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/mcp/{dateTimeParser,elicitationValidation}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/filePersistence/{filePersistence,outputsScanner}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/dxt/{helpers,zip}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/background/remote/{preconditions,remoteSession}.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/todo/types.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/skills/skillChangeDetector.ts`
- `/Users/siddhartha/Desktop/reference/src/utils/github/ghAuthStatus.ts`

Total: 94 files across 23 directories. ~1,650 LOC for the smallest (memory/types.ts is 12 lines), ~2,400 LOC for the largest (`processSlashCommand.tsx`).
