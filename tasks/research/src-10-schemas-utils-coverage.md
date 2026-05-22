# src-10: schemas / types / constants / utils / moreright / coverage

Reference root: `/Users/siddhartha/Desktop/reference/src/`. All citations use absolute paths from that prefix. This pass owns the "small but high-information" subtrees that don't fit into the narrative passes (queries, tools, screens) — the type system, validation schemas, runtime constants, the 290-file utils kitchen-sink, the singular `moreright/` directory, and the (light-touch) `native-ts/` ports.

## 1. Schemas

Only one .ts file in `src/schemas/` — `hooks.ts` (223 LOC).

- `schemas/hooks.ts:31-171` (`buildHookSchemas`) defines four discriminated-union members keyed by `type`: `BashCommandHookSchema` (`type: 'command'`), `PromptHookSchema` (`type: 'prompt'`), `HttpHookSchema` (`type: 'http'`), `AgentHookSchema` (`type: 'agent'`). Validation uses **Zod v4** (`import { z } from 'zod/v4'` at line 12) — JSON-Schema is derived later by `utils/zodToJsonSchema.ts:17-23` (with WeakMap caching keyed by ZodTypeAny identity, which is why all schemas are wrapped in `lazySchema()` from `utils/lazySchema.ts:5-8`).
- The exports are `HookCommandSchema` (line 176), `HookMatcherSchema` (line 194), `HooksSchema` (line 211 — `z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema()))`). Inferred TS types `HookCommand`, `BashCommandHook`, `PromptHook`, `AgentHook`, `HttpHook`, `HookMatcher`, `HooksSettings` at lines 216-222.
- The header comment (lines 1-9) explicitly states this file exists "to break import cycles" — both `utils/settings/types.ts` and `plugins/schemas.ts` previously imported each other; extracting to `schemas/` made them leaf modules.
- Zod schemas are **not** versioned alongside migrations. Versioning lives at the settings layer (`utils/settings/`) and at the migrations level (`migrations/`); schema files themselves carry a single shape per version. Hooks schema explicitly forbids `.transform()` (lines 130-137) because parsed values round-trip through `JSON.stringify` and a transform-injected function value would silently delete the user's prompt.

Other schemas live in-place (not in `src/schemas/`): plugin schemas at `utils/plugins/schemas.ts`, permission schemas at `utils/permissions/PermissionRule.ts:25-27` (`permissionBehaviorSchema`) and `PermissionUpdateSchema.ts`, hook JSON output validation at `types/hooks.ts:50-176`, MCP elicitation at `utils/mcp/elicitationValidation.ts`, etc. So the singular `schemas/` dir is just for hook command shape; it's not the canonical home.

## 2. Types

8 root files plus a `generated/` tree (8 .ts files total in scope):

- `types/command.ts` (217 LOC) — `Command` is a discriminated union (`PromptCommand` | `LocalCommand` | `LocalJSXCommand`) AND-ed with `CommandBase` (line 205). `CommandAvailability` enum (`'claude-ai' | 'console'`, lines 169-173) gates which auth/provider can see a command. `LocalJSXCommandOnDone` (lines 117-126) is the callback the JSX commands fire when they finish — `nextInput`/`submitNextInput` are how `/init` chains into the next user turn.
- `types/hooks.ts` (290 LOC) — Heavy file. `syncHookResponseSchema` (line 50) is a giant Zod union over `hookSpecificOutput.hookEventName` literals: PreToolUse, UserPromptSubmit, SessionStart, Setup, SubagentStart, PostToolUse, PostToolUseFailure, PermissionDenied, Notification, PermissionRequest, Elicitation, ElicitationResult, CwdChanged, FileChanged, WorktreeCreate (lines 71-162) — at least 15 hook events. Compile-time SDK/Zod parity is asserted at line 197-199 (`type _assertSDKTypesMatch = Assert<IsEqual<SchemaHookJSONOutput, HookJSONOutput>>`). `PermissionRequestResult` discriminated union at lines 248-258. `HookCallback`/`HookCallbackMatcher`/`HookProgress`/`HookBlockingError`/`HookResult`/`AggregatedHookResult` round out the shape.
- `types/ids.ts` (44 LOC) — Branded types. `SessionId` and `AgentId` are nominal-typed strings using TS const-brand pattern (lines 10, 17). `toAgentId(s)` validator (line 42) uses regex `^a(?:.+-)?[0-9a-f]{16}$` (line 35) — agent IDs always start with `a` and end in 16 hex chars. Prevents `SessionId`/`AgentId` mix-ups at compile time.
- `types/logs.ts` (331 LOC) — Persistence shapes for the conversation transcript. `Entry` is a discriminated union of 19 record types (lines 297-318): TranscriptMessage, SummaryMessage, CustomTitleMessage, AiTitleMessage, LastPromptMessage, TaskSummaryMessage, TagMessage, AgentNameMessage/AgentColorMessage/AgentSettingMessage, PRLinkMessage, FileHistorySnapshotMessage, AttributionSnapshotMessage, QueueOperationMessage, SpeculationAcceptMessage, ModeEntry, WorktreeStateEntry, ContentReplacementEntry, ContextCollapseCommitEntry, ContextCollapseSnapshotEntry. Discriminator obfuscation at line 256 (`type: 'marble-origami-commit'`) is intentional — context-collapse entries shouldn't leak into external builds via descriptive type names.
- `types/permissions.ts` (442 LOC) — Pure-types-only file (no runtime). `PermissionMode` (line 29: `'acceptEdits' | 'bypassPermissions' | 'default' | 'dontAsk' | 'plan' | 'auto' | 'bubble'` — 7 modes), `PermissionBehavior` (`'allow' | 'deny' | 'ask'` line 44), `PermissionUpdate` discriminated union with 6 op types (addRules/replaceRules/removeRules/setMode/addDirectories/removeDirectories, lines 98-131), `PermissionDecision` (allow/ask/deny — lines 241-246), `PermissionDecisionReason` 11-arm union (rule, mode, subcommandResults, permissionPromptTool, hook, asyncAgent, sandboxOverride, classifier, workingDir, safetyCheck, other — lines 271-324). `ClassifierResult` and `YoloClassifierResult` (lines 330-397) capture the auto-mode classifier shape with stage1/stage2 thinking-token telemetry.
- `types/plugin.ts` (363 LOC) — `PluginError` is a 22-arm discriminated union (lines 101-283) covering everything from `git-auth-failed` and `mcpb-extract-failed` to `lsp-server-crashed` and `dependency-unsatisfied`. `PluginComponent` enum at line 72 (`commands | agents | skills | hooks | output-styles`). `BuiltinPluginDefinition` (lines 18-35) for plugins shipping with the CLI. `getPluginErrorMessage` switch covers every arm (lines 295-362) — adding a new arm would break the switch's exhaustiveness.
- `types/textInputTypes.ts` (388 LOC) — `BaseTextInputProps` (43 props line 27-202) is the props bag for the TUI text input. `QueuedCommand` (lines 299-358) carries pre-expansion paste expansion, bridge origin, meta, workload, agentId — every piece of state the queue dispatcher needs. `QueuePriority` (`'now' | 'next' | 'later'`, line 294) sets the drain semantics. `PromptInputMode` (line 265) is `'bash' | 'prompt' | 'orphaned-permission' | 'task-notification'`.
- `types/generated/` — protobuf-generated TS:
  - `events_mono/claude_code/v1/claude_code_internal_event.ts` — `EnvironmentMetadata` (line 22), `GitHubActionsMetadata` (line 12), more — generated by `protoc-gen-ts_proto v2.6.1` (line 3 header). DO NOT EDIT marker.
  - `events_mono/common/v1/auth.ts` — `PublicApiAuth`.
  - `events_mono/growthbook/v1/growthbook_experiment_event.ts` — feature-flag experiment events.
  - `google/protobuf/timestamp.ts` — Timestamp shim.

Top-level discriminated unions across the type tree: hook events (15), plugin errors (22), permission decisions (3 + classifier sub-shape), permission updates (6), permission decision reasons (11), log entries (19), command kinds (3 + base). The codebase leans heavily on TS discriminated unions for safety.

## 3. Constants

21 files in `src/constants/`. The two model-relevant findings up top:

- **HARDCODED MODEL IDs at `constants/prompts.ts:121-125`** (against the locked rule): `const CLAUDE_4_5_OR_4_6_MODEL_IDS = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' }`. There is also a `FRONTIER_MODEL_NAME = 'Claude Opus 4.6'` literal at line 118. The comment at 117 (`@[MODEL LAUNCH]: Update the latest frontier model`) and 120 (`@[MODEL LAUNCH]: Update the model family IDs below`) acknowledges this is launch-touched code; it's not driven from `models.json`. Hook Zod schemas at `schemas/hooks.ts:85, 153` describe `model` field examples as `"claude-sonnet-4-6"` (also a literal embedded in describe-text — less load-bearing but still hardcoded).
- `constants/system.ts:10-11` defines three sysprompt prefixes (`DEFAULT_PREFIX`, `AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX`, `AGENT_SDK_PREFIX`) — these are tagline strings, not model IDs. Attribution-header logic (lines 73-95) builds the `x-anthropic-billing-header` with `cc_version`, `cc_entrypoint`, `cch=00000` placeholder for native client attestation, and `cc_workload`.

The other constants:

- `apiLimits.ts` — Server-side API limits: `API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024`, `IMAGE_MAX_WIDTH/HEIGHT = 2000`, `PDF_TARGET_RAW_SIZE = 20 MB`, `API_PDF_MAX_PAGES = 100`, `PDF_MAX_PAGES_PER_READ = 20`, `API_MAX_MEDIA_PER_REQUEST = 100`. Last-verified date `2025-12-22` per header.
- `betas.ts` — 14 beta-header constants (e.g. `INTERLEAVED_THINKING_BETA_HEADER = 'interleaved-thinking-2025-05-14'`, `CONTEXT_1M_BETA_HEADER`, `STRUCTURED_OUTPUTS_BETA_HEADER`, `EFFORT_BETA_HEADER`, `TASK_BUDGETS_BETA_HEADER`, `TOKEN_EFFICIENT_TOOLS_BETA_HEADER`, `ADVISOR_BETA_HEADER`). Bedrock/Vertex compat sets at lines 38-52.
- `common.ts` — `getLocalISODate()` with `CLAUDE_CODE_OVERRIDE_DATE` env override, `getSessionStartDate` (memoized for prompt-cache stability — line 24 comment).
- `cyberRiskInstruction.ts` — Single string constant `CYBER_RISK_INSTRUCTION` (line 24, owned by Safeguards team — line 18 marker).
- `errorIds.ts` — Single ID `E_TOOL_USE_SUMMARY_GENERATION_FAILED = 344`. Next ID 346. Each is its own const for dead-code elimination in external builds.
- `figures.ts` — Unicode glyphs: `BLACK_CIRCLE`, `BULLET_OPERATOR`, `EFFORT_LOW/MEDIUM/HIGH/MAX`, `DIAMOND_OPEN/FILLED`, etc. `BLACK_CIRCLE` is `⏺` on darwin, `●` elsewhere (line 4 — windows/linux compat).
- `files.ts` — `BINARY_EXTENSIONS` Set with 80+ entries, plus `hasBinaryExtension()`, `isBinaryContent()` (null-byte + non-printable threshold).
- `github-app.ts` — GitHub Action workflow YAML template + PR title/body for `/install-github-app`.
- `keys.ts` — GrowthBook SDK client keys (one for `ant`, one for OSS).
- `messages.ts` — `NO_CONTENT_MESSAGE = '(no content)'`.
- `oauth.ts` — OAuth config with prod/staging/local/custom modes (lines 6-16 type, 84-104 prod, 118-143 staging, 148-174 local). `ALLOWED_OAUTH_BASE_URLS` allowlist (line 179) restricts custom URL to FedStart/PubSec — defense against credential leaks. Prod scopes at lines 33-51. Client ID `9d1c250a-e61b-44d9-88ed-5944d1962f5e`.
- `outputStyles.ts` — Built-in output styles `Explanatory`, `Learning` with rendered prompts (lines 41-100+).
- `product.ts` — `PRODUCT_URL = 'https://claude.com/claude-code'`, `CLAUDE_AI_BASE_URL`, `CLAUDE_AI_STAGING_BASE_URL`, `CLAUDE_AI_LOCAL_BASE_URL`. URL helpers including `getRemoteSessionUrl` (line 65) which has a `cse_→session_` shim (line 56-64) for compat between worker endpoints and frontend.
- `prompts.ts` — 54K-LOC prompts file. Beyond the model-ID hardcoding, this is where every system-prompt section text lives.
- `spinnerVerbs.ts` — Whimsical 195-verb spinner list (`'Bamboozling'`, `'Choreographing'`, ..., `'Zigzagging'`).
- `system.ts` — Sysprompt prefixes (Default vs AGENT_SDK presets) + attribution header builder.
- `systemPromptSections.ts` — Memoized factory for prompt sections with `cacheBreak` flag.
- `toolLimits.ts` — `DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000`, `MAX_TOOL_RESULT_TOKENS = 100_000`, `BYTES_PER_TOKEN = 4`, `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000`, `TOOL_SUMMARY_MAX_LENGTH = 50`.
- `tools.ts` — `ALL_AGENT_DISALLOWED_TOOLS`, `CUSTOM_AGENT_DISALLOWED_TOOLS`, `ASYNC_AGENT_ALLOWED_TOOLS`, `IN_PROCESS_TEAMMATE_ALLOWED_TOOLS`, `COORDINATOR_MODE_ALLOWED_TOOLS` — Sets of tool-name strings dictating which tools each agent kind may call. Imports tool name constants from each tool's own constants file (TODO_WRITE_TOOL_NAME, FILE_READ_TOOL_NAME, etc.) — single-source-of-truth pattern.
- `turnCompletionVerbs.ts` — Past-tense complement to spinnerVerbs (`'Baked'`, `'Cogitated'`, `'Worked'`, etc — 8 verbs).
- `xml.ts` — XML tag string constants for `<command-name>`, `<bash-stdout>`, `<tick>`, `<task-notification>`, `<ultraplan>`, `<remote-review>`, `<teammate-message>`, `<channel-message>`, `<cross-session-message>`, `<fork-boilerplate>`, etc. Plus `COMMON_HELP_ARGS` and `COMMON_INFO_ARGS` for slash-command argument matching.

Defaults vs env-overridable: Most constants are pure defaults; date and OAuth are env-overridable (`CLAUDE_CODE_OVERRIDE_DATE`, `USE_LOCAL_OAUTH`, `USE_STAGING_OAUTH`, `CLAUDE_CODE_CUSTOM_OAUTH_URL`, `CLAUDE_CODE_OAUTH_CLIENT_ID`). Beta headers are static; some are gated behind `feature(...)` (CONNECTOR_TEXT, TRANSCRIPT_CLASSIFIER) for dead-code elimination per build.

## 4. Utils

`src/utils/` is the codebase's kitchen-sink. Top-level: **290 .ts/.tsx files + 31 subdirectories** (verified via `find -maxdepth 1`). I've grouped them.

**String / formatting / display:** `format.ts`, `stringUtils.ts`, `markdown.ts`, `markdownConfigLoader.ts`, `truncate.ts`, `displayTags.ts`, `treeify.ts`, `cliHighlight.ts`, `textHighlighting.ts`, `highlightMatch.tsx`, `sliceAnsi.ts`, `ansiToPng.ts`, `ansiToSvg.ts`, `hyperlink.ts`, `intl.ts`, `words.ts`, `wordsTodelete (none — moved)`. Telemetry/logging: `log.ts`, `debug.ts`, `debugFilter.ts`, `unaryLogging.ts`, `errorLogSink.ts`, `errors.ts`, `diagLogs.ts`. Telemetry subdir (`telemetry/`) has 9 files (events, instrumentation, perfetto/bigquery exporters).

**File / path / I/O:** `path.ts` (with `expandPath`, `toRelativePath`, `getDirectoryForPath` — null-byte rejection at line 48-50 and `homedir`/tilde expansion), `file.ts`, `fileRead.ts`, `fileReadCache.ts`, `fileStateCache.ts`, `fileHistory.ts`, `glob.ts`, `notebook.ts`, `pdf.ts`, `pdfUtils.ts`, `windowsPaths.ts`, `xdg.ts`, `tempfile.ts`, `cachePaths.ts`, `frontmatterParser.ts`, `fsOperations.ts`, `readEditContext.ts`, `readFileInRange.ts`, `which.ts`, `findExecutable.ts`, `lockfile.ts`, `cleanupRegistry.ts`, `sessionStorage.ts`, `sessionStoragePortable.ts`. `filePersistence/` subdir has the persistence layer.

**Async / process / streaming:** `abortController.ts`, `combinedAbortSignal.ts`, `withResolvers.ts`, `signal.ts`, `gracefulShutdown.ts`, `idleTimeout.ts`, `sleep.ts`, `timeouts.ts`, `sequential.ts`, `slowOperations.ts`, `process.ts`, `genericProcessUtils.ts`, `subprocessEnv.ts`, `execFileNoThrow.ts`, `execFileNoThrowPortable.ts`, `execSyncWrapper.ts`, `bufferedWriter.ts`, `stream.ts` (custom AsyncIterator queue at line 1-60), `streamlinedTransform.ts`, `streamJsonStdoutGuard.ts`, `mailbox.ts`, `messageQueueManager.ts`, `queueProcessor.ts`, `messagePredicates.ts`. Profiling: `profilerBase.ts`, `headlessProfiler.ts`, `queryProfiler.ts`, `startupProfiler.ts`, `fpsTracker.ts`, `heapDumpService.ts`, `stats.ts`, `statsCache.ts`.

**Sandbox helpers:** `sandbox/sandbox-adapter.ts` (271 LOC sample) wraps `@anthropic-ai/sandbox-runtime` (note: it is **not** a fork of sandbox-policy crate from this repo's Rust workspace) — the adapter bridges the npm package's `SandboxManager`/`SandboxRuntimeConfigSchema`/`SandboxViolationStore` with Claude CLI's settings + tools. So the actual Seatbelt/bwrap/Landlock dispatch lives behind the npm shim, not in `utils/sandbox/`. `sandbox/sandbox-ui-utils.ts` is a 12-LOC helper that strips `<sandbox_violations>` tags. **No direct OS-call wrappers** for Seatbelt/bwrap/Landlock in `utils/`.

**Token counting:** `tokens.ts` (262 LOC) — `getTokenCountFromUsage`, `tokenCountFromLastAPIResponse`, `tokenCountWithEstimation` (canonical, line 226-261, walks back through split assistant records sharing the same API response id). `tokenBudget.ts` parses shorthand budgets like `+500k` and `use 2M tokens`. `services/tokenEstimation.ts` (outside utils) does the rough estimate.

**Path-traversal protection:** `permissions/pathValidation.ts:1-150` (sample) checks file ops against `ToolPermissionContext`, with `getGlobBaseDirectory` (line 57-74), `expandTilde` (line 80, `~username` explicitly disallowed for security per line 79). Also `path.ts:48-50` rejects null bytes. `permissions/dangerousPatterns.ts` lists `CROSS_PLATFORM_CODE_EXEC` (python/node/deno/tsx/ruby/perl/php/lua/npx/bunx/.../bash/sh/ssh — line 18-42) and `DANGEROUS_BASH_PATTERNS` for the auto-mode classifier.

**Streaming-response helpers:** `stream.ts` (Stream class), `bufferedWriter.ts`, `streamlinedTransform.ts`, `sdkEventQueue.ts`. Most of the actual streaming I/O lives in `query.ts` / `services/` not utils.

**Auth:** `auth.ts`, `authPortable.ts`, `authFileDescriptor.ts`. `secureStorage/` subdir has 5 files (macOS Keychain helpers + plaintext fallback + prefetch).

**Config / settings:** `config.ts`, `configConstants.ts`, `settings/` subdir has 15+ files (allErrors, applySettingsChange, changeDetector, constants, internalWrites, managedPath, mdm, permissionValidation, pluginOnlyPolicy, schemaOutput, settings, settingsCache, toolValidationConfig, types, validateEditTool, validation, validationTips). `settings/types.ts` is the canonical home of the runtime `HooksSettings` (re-exported from `schemas/hooks.ts`).

**Domain-specific subdirs (29 by name):** `bash/` (15+ files: ast, bashParser, ParsedCommand, prefix, registry, shellQuote, ShellSnapshot, treeSitterAnalysis, specs/), `claudeInChrome/` (chromeNativeHost, mcpServer, prompt, setup, toolRendering — 7 files), `computerUse/` (15 files including escHotkey, executor, gates, hostAdapter, swiftLoader, mcpServer), `deepLink/` (banner, parseDeepLink, protocolHandler, terminalLauncher), `dxt/` (helpers, zip), `filePersistence/`, `git/` (gitConfigParser, gitFilesystem, gitignore), `github/` (ghAuthStatus only), `hooks/` (17 files: AsyncHookRegistry, execAgentHook, execHttpHook, execPromptHook, fileChangedWatcher, hookEvents, hookHelpers, hooksConfigManager, hooksConfigSnapshot, hooksSettings, postSamplingHooks, registerFrontmatterHooks, registerSkillHooks, sessionHooks, skillImprovement, ssrfGuard, apiQueryHookHelper), `mcp/` (dateTimeParser, elicitationValidation), `memory/` (types, versions), `messages/` (mappers, systemInit), `model/` (16 files including agent, aliases, antModels, bedrock, configs, deprecation, model, modelCapabilities, providers, validateModel, modelStrings — note `modelStrings.ts:46-60` has the only "claude-opus-4-6" string mentions but only as part of comments/regex docstrings; the real hardcode is in constants/prompts.ts), `nativeInstaller/` (download/installer/packageManagers/pidLock — 5 files), `permissions/` (24 files: classifiers, filesystem, pathValidation, permissionRuleParser, permissionsLoader, PermissionMode, PermissionResult, PermissionRule, PermissionUpdate, dangerousPatterns, denialTracking, shadowedRuleDetection, shellRuleMatching, yoloClassifier, etc.), `plugins/` (45+ files for plugin loader/marketplace/policy), `powershell/` (3 files), `processUserInput/` (4 files), `sandbox/` (2 files — adapter + ui-utils), `secureStorage/`, `settings/` (15+), `shell/` (10 files), `skills/` (1: skillChangeDetector), `suggestions/` (5 files), `swarm/` (15+ files including backends/), `task/` (5 files), `teleport/` (api/environments/environmentSelection/gitBundle), `telemetry/` (9 files), `todo/` (1: types only), `ultraplan/` (ccrSession, keyword), `background/` (just remote/ subdir).

**Other notable top-level:** `xml.ts`, `yaml.ts`, `json.ts`, `jsonRead.ts`, `lazySchema.ts` (shown above — 8 LOC factory), `zodToJsonSchema.ts` (24 LOC, WeakMap-cached), `frontmatterParser.ts`, `editor.ts`, `theme.ts`, `keyboardShortcuts.ts`, `terminal.ts`, `terminalPanel.ts`, `transcriptSearch.ts`, `toolSearch.ts`, `toolPool.ts`, `toolResultStorage.ts`, `toolErrors.ts`, `toolSchemaCache.ts`. UI-helper-tsx: `autoRunIssue.tsx`, `exportRenderer.tsx`, `preflightChecks.tsx`, `staticRender.tsx`, `status.tsx`, `statusNoticeDefinitions.tsx`, `teleport.tsx`. Output: `outputStyles.ts` lives in constants, but rendering helpers like `renderOptions.ts` live in utils.

Top **import frequency** (samples, from grep over `from '../utils/...'`): `debug` 73, `settings` 57, `config` 54, `errors` 41, `log` 36, `envUtils` 34, `slowOperations` 30, `messages` 28, `model` 27, `format` 26, `permissions` 25, `plugins` 20, `swarm` 17, `cwd` 17, `auth` 17, `sessionStorage` 15, `lazySchema` 14, `theme` 13, `teleport` 13, `stringUtils` 13, `ide` 12, `hooks` 12, `git` 12, `env` 11, `gracefulShutdown` 10. So `debug` / `settings` / `config` / `errors` / `log` are the top-5 most heavily used utility modules — every file that needs to log or read settings touches one of them.

Probable dead-code or low-traffic utils (single-digit references): `appleTerminalBackup`, `iTermBackup`, `screenshotClipboard`, `gif_creator`-shaped adapters not present, `userPromptKeywords`, `Cursor.ts`, `mcpInstructionsDelta`, `peerAddress`, `crossProjectResume`. Need a separate pass to confirm — most of these appear single-purpose, not dead.

## 5. Moreright

Single file: `moreright/useMoreRight.tsx` (26 LOC + sourceMappingURL appended).

- File header (lines 1-5) declares this is a **stub for external builds — the real hook is internal only**. Path comment notes "scripts/external-stubs/src/moreright/ before overlay" — the build pipeline overlays a real implementation when building Anthropic-internal `USER_TYPE === 'ant'` builds, but external (open-source) builds just see this stub.
- The stub returns `{ onBeforeQuery: async () => true, onTurnComplete: async () => {}, render: () => null }` (lines 20-24). It accepts an args object (`enabled`, `setMessages`, `inputValue`, `setInputValue`, `setToolJSX`) but ignores them (`_args`).
- Used at exactly one call-site: `screens/REPL.tsx:68` (import) and `:1665` (call site, destructuring `mrOnBeforeQuery`/`mrOnTurnComplete`/`mrRender`). The hook is wired into REPL pre-query and post-turn lifecycle.
- **Best guess for what "more right" means:** based on the hook's signature (`onBeforeQuery`, `onTurnComplete`, `setMessages`, `setInputValue`, `setToolJSX`), this is the integration point for an internal Anthropic feature that mutates the user's input before the query runs (`onBeforeQuery` returns `boolean` — likely "should the query proceed?") and reacts after each turn. The name "moreright" appears non-descriptive on purpose — it's a **code name** for an internal feature whose actual behavior is intentionally elided from external builds. Likely candidates given the hook surface: an experimental sidebar-widget injector, an autocompletion polish layer, or a personalization feature. The "right" might literally refer to the right-hand side of the TUI (the prompt input panel is on the right in some layouts), but the more probable read is that it's a project codename — Anthropic uses opaque codenames elsewhere (e.g. `marble-origami` for context-collapse in `types/logs.ts:256`).
- It's both UI and logic: returns a `render()` function (UI) plus query/turn lifecycle hooks (logic).

## 6. native-ts (light)

Per the prompt, primary deep-dive owner is the coordinator agent. Confirmed contents:

- `native-ts/color-diff/index.ts` (~1000 LOC) — **Pure-TypeScript port of vendor/color-diff-src** (Rust NAPI module that wraps syntect+bat for syntax highlighting + the `similar` crate for word diff). The TS port uses `highlight.js` + `diff` (npm) instead. API signature exactly matches `vendor/color-diff-src/index.d.ts` (lines 6-9 of file header). Exports `ColorDiff` class (line 842), `ColorFile` class (line 935), `getSyntaxTheme()` (line 970), `getNativeModule()` (line 982). Includes RGB→ANSI256 fallback (lines 105-127), Monokai/GitHub theme palettes (lines 190-244, measured from syntect's output). Used to render colored diffs in the TUI when the native module isn't available.
- `native-ts/file-index/index.ts` (~600+ LOC, only lines 1-120 sampled) — **Pure-TS port of vendor/file-index-src** Rust NAPI module that wraps `nucleo` (Helix Editor's fzf-style fuzzy finder). Implements fuzzy file path matching with the same scoring constants (SCORE_MATCH=16, BONUS_BOUNDARY=8, BONUS_CAMEL=6, etc — line 24-30). Has `loadFromFileList` (sync) and `loadFromFileListAsync` for 270k+ path indexes (line 83+, yields every 4ms — `CHUNK_MS = 4`).
- `native-ts/yoga-layout/{index.ts, enums.ts}` — **Pure-TS port of yoga-layout** (Meta's flexbox engine). The header (lines 1-39) lists exactly which CSS subset is implemented (flex-direction, grow/shrink/basis, align-items/self, justify-content, margin/padding/border/gap, width/height/min/max, position rel/abs, display flex/none, measure functions) and what's intentionally not (aspect-ratio, content-box box-sizing, RTL — Ink only uses LTR). Used by `src/ink/layout/yoga.ts`.

Bindings target: highlight.js, the `diff` npm package, and a from-scratch flexbox engine — all replacing native Rust NAPI modules to ship a 100% JavaScript build for environments where the prebuilt native module can't be used.

## 7. Root files (light)

- `src/projectOnboardingState.ts` (84 LOC) — Tracks per-project onboarding state. Two `Step` records (line 19-41): `'workspace'` (suggesting the user create a new app or clone a repo, enabled when cwd is empty) and `'claudemd'` (asking the user to run `/init` to create a `CLAUDE.md`, enabled when cwd is non-empty). `isProjectOnboardingComplete()` returns true when all enabled+completable steps are done (line 43). `maybeMarkProjectOnboardingComplete()` (line 49) is the writer (debounced via `getCurrentProjectConfig().hasCompletedProjectOnboarding` short-circuit at line 52). `shouldShowProjectOnboarding` (line 63, memoized) caps display at 4 views (`projectOnboardingSeenCount >= 4`) and respects `process.env.IS_DEMO`.
- `src/cost-tracker.ts` and `costHook.ts` — primary owner is the agent-loop / src-01 agent. Mention only: cost-tracker.ts is 10K LOC, costHook.ts is 617 bytes (likely a tiny shim).

## 8. COVERAGE TABLE

Every entry returned by `ls ~/Desktop/reference/src/` mapped to its owning agent:

| Path                        | Owner agent                                   |
| --------------------------- | --------------------------------------------- |
| `assistant/`                | src-05                                        |
| `bootstrap/`                | src-01                                        |
| `bridge/`                   | src-07                                        |
| `buddy/`                    | src-05                                        |
| `cli/` (dir)                | src-08 (also listed under src-01 entrypoints) |
| `commands/` (dir)           | src-02                                        |
| `commands.ts`               | src-02                                        |
| `components/`               | src-06                                        |
| `constants/`                | **src-10 (this pass)**                        |
| `context/`                  | src-08                                        |
| `context.ts`                | src-01                                        |
| `coordinator/`              | src-04                                        |
| `cost-tracker.ts`           | src-01 (mentioned by src-10)                  |
| `costHook.ts`               | src-01 (mentioned by src-10)                  |
| `dialogLaunchers.tsx`       | src-01                                        |
| `entrypoints/`              | src-01                                        |
| `history.ts`                | src-01                                        |
| `hooks/`                    | src-08                                        |
| `ink/`                      | src-06                                        |
| `ink.ts`                    | src-06                                        |
| `interactiveHelpers.tsx`    | src-01                                        |
| `keybindings/`              | src-06                                        |
| `main.tsx`                  | src-01                                        |
| `memdir/`                   | src-09                                        |
| `migrations/`               | src-09                                        |
| `moreright/`                | **src-10 (this pass)**                        |
| `native-ts/`                | src-04 (light coverage by src-10)             |
| `outputStyles/`             | src-06                                        |
| `plugins/`                  | src-09                                        |
| `projectOnboardingState.ts` | **src-10 (this pass)**                        |
| `query/`                    | src-04                                        |
| `query.ts`                  | src-01                                        |
| `QueryEngine.ts`            | src-01                                        |
| `remote/`                   | src-07                                        |
| `replLauncher.tsx`          | src-01                                        |
| `schemas/`                  | **src-10 (this pass)**                        |
| `screens/`                  | src-06                                        |
| `server/`                   | src-07                                        |
| `services/`                 | src-08                                        |
| `setup.ts`                  | src-01                                        |
| `skills/`                   | src-05                                        |
| `state/`                    | src-08                                        |
| `Task.ts`                   | src-01                                        |
| `tasks/`                    | src-05                                        |
| `tasks.ts`                  | src-01                                        |
| `Tool.ts`                   | src-01                                        |
| `tools/`                    | src-03                                        |
| `tools.ts`                  | src-01                                        |
| `types/`                    | **src-10 (this pass)**                        |
| `upstreamproxy/`            | src-07                                        |
| `utils/`                    | **src-10 (this pass)**                        |
| `vim/`                      | src-06                                        |
| `voice/`                    | src-06                                        |
| `.DS_Store`                 | macOS metadata, ignore                        |

**No top-level src/ entry is unassigned.** All 53 visible entries (excluding .DS_Store) have a primary owner. The dotted-line-ownership entries (src-10 mentions cost-tracker.ts/costHook.ts; src-04 owns native-ts/ deep dive) are explicitly noted in the prompt and respected.

## 9. Open Questions

1. **What is `moreright/` actually for?** The single 26-LOC stub is wired into REPL.tsx's lifecycle but its real implementation lives in an internal Anthropic overlay (`scripts/external-stubs/src/moreright/`). Best guesses (UI: right-pane sidebar widget; logic: pre-query input mutation; experimental: a sidecar agent like Cowork). A code-search inside Anthropic's monorepo would resolve this but is outside our access. The hook signature (`onBeforeQuery: (input, all, n) => Promise<boolean>`, `onTurnComplete: (all, aborted) => Promise<void>`, `render: () => null`) suggests it can veto a query and inject UI. It is feature-orthogonal to our `apps/cli/` Rust port — we should not try to mirror it without knowing what it does.
2. **Is the hardcoded model id at `constants/prompts.ts:121-125` ([`opus`, `sonnet`, `haiku`]) considered a violation of our locked rule, or was that file copied verbatim from the reference and we accept the drift?** Recommend adding it to the next CLI ghost-model audit (similar to `claude-opus-4-6-mini` finding at `tui/chatwidget.rs:412`) — even though prompts.ts is reference, if anything in `apps/cli/` re-uses literal model strings derived from this file, that's a regression.
3. **Are there `*.ts` files in `utils/` we can confirm dead?** A formal dead-code pass with `ts-prune` or `knip` would surface them. From import-frequency sampling, single-digit-import utils worth investigating: `appleTerminalBackup.ts`, `iTermBackup.ts`, `screenshotClipboard.ts`, `Cursor.ts`, `userPromptKeywords.ts`, `peerAddress.ts`, `crossProjectResume.ts`, `idePathConversion.ts`. None confirmed dead — they may be conditionally loaded — so this is open.
4. **`SandboxManager` at `utils/sandbox/sandbox-adapter.ts:19-22`** wraps the npm package `@anthropic-ai/sandbox-runtime`. We have parallel work in our Rust crate `sandbox-policy` (the Cargo workspace). Is the npm package a published wrapper around the same crate, or an independent Anthropic-internal abstraction we'd have to recreate? Worth verifying before our `apps/desktop/` adopts the same adapter pattern.
5. **`types/generated/`** is protobuf-generated; do we have the `.proto` source files? The `claude_code_internal_event.proto`, `auth.proto`, `growthbook_experiment_event.proto`, and `timestamp.proto` are referenced in headers but not present in `~/Desktop/reference/src/`. If we want to evolve the event schema independently, we need the source `.proto`s — or accept we re-generate against an upstream we don't control.
