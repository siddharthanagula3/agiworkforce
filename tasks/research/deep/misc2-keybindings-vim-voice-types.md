# MISC2 Deep Dive: Keybindings, Vim, Voice, Schemas, Types, Constants

> Scope: 7 directories, 54 files (`~/Desktop/reference/src/{keybindings,outputStyles,vim,voice,schemas,types,constants}/`).
> Read in full 2026-05-08. Citations are `path:line` against `~/Desktop/reference/src/`.

---

## 1. `keybindings/` — 14 files, 145 KB. The chord-aware terminal-keybinding engine.

### 1.1 Default bindings (`defaultBindings.ts:32-340`)

`DEFAULT_BINDINGS` is a `KeybindingBlock[]` exported as a constant. Each block is `{ context, bindings: Record<keystroke, action> }`. **Twenty contexts** are populated (the schema declares 18 — `Settings`, `Confirmation`, `Tabs`, `Transcript`, `HistorySearch`, `Task`, `ThemePicker`, `Scroll`, `Help`, `Attachments`, `Footer`, `MessageSelector`, `MessageActions`, `DiffDialog`, `ModelPicker`, `Select`, `Plugin`, `Autocomplete` plus `Global` and `Chat`). The schema set is at `schema.ts:12-32` and `validate.ts:60-79`.

Platform-conditional bindings:

- `IMAGE_PASTE_KEY` (`defaultBindings.ts:15`): `'alt+v'` on Windows (`ctrl+v` is system paste), `'ctrl+v'` elsewhere — bound to `chat:imagePaste` (`:87`).
- `MODE_CYCLE_KEY` (`:30`): `'shift+tab'` on terminals with VT mode (Node ≥22.17.0/24.2.0, Bun ≥1.2.23, or non-Windows), else `'meta+m'`. Drives `chat:cycleMode` (`:69`).
- `SUPPORTS_TERMINAL_VT_MODE` (`:21-25`) — semver gate per Microsoft Terminal issue #879.

Reserved-but-defined: `ctrl+c` → `app:interrupt` (`:40`) and `ctrl+d` → `app:exit` (`:41`) live in defaults so the resolver finds them, but `reservedShortcuts.ts:16-33` tags them `NON_REBINDABLE` (severity error). User attempts to override these surface a `/doctor` warning.

Chord prefixes: `ctrl+x ctrl+k` → `chat:killAgents` (`:68`), `ctrl+x ctrl+e` → `chat:externalEditor` (`:83`). Comment at `:67`: `ctrl+x` chord prefix avoids shadowing readline editing keys (`ctrl+a/b/e/f`).

Undo dual-binding for cross-terminal compat: `ctrl+_` (legacy `\x1f` control char) and `ctrl+shift+-` (Kitty protocol physical key) both → `chat:undo` (`:80-81`).

Feature-gated additions (`bun:bundle` `feature()` macro):

- `KAIROS` / `KAIROS_BRIEF` → `ctrl+shift+b` `app:toggleBrief` (`:45-47`).
- `QUICK_SEARCH` → `ctrl+shift+f` / `cmd+shift+f` (`app:globalSearch`) and `ctrl+shift+p` / `cmd+shift+p` (`app:quickOpen`) (`:52-58`).
- `TERMINAL_PANEL` → `meta+j` `app:toggleTerminal` (`:60`).
- `MESSAGE_ACTIONS` → entire `MessageActions` context (`:268-295`) and `shift+up` `chat:messageActions` (`:88-90`).
- `VOICE_MODE` → `space` `voice:pushToTalk` in `Chat` context (`:96`).

Scroll context (`:196-213`) includes wheel events: `wheelup` / `wheeldown` → `scroll:lineUp` / `scroll:lineDown`. Selection copy is `ctrl+shift+c` (`:210`) plus `cmd+c` (`:211`) — `cmd+c` only fires on terminals with Kitty keyboard protocol (kitty / WezTerm / ghostty / iTerm2).

### 1.2 User overrides + hot-reload (`loadUserBindings.ts`)

User config path: `~/.claude/keybindings.json` via `getKeybindingsPath()` (`:115-117`) which calls `getClaudeConfigHomeDir()`.

**Customization is gated to Anthropic employees**: `isKeybindingCustomizationEnabled()` (`:41-46`) returns `getFeatureValue_CACHED_MAY_BE_STALE('tengu_keybinding_customization_release', false)`. External users always get defaults — `loadKeybindings()` short-circuits at `:137-139` and `loadKeybindingsSyncWithWarnings()` at `:267-271`. The watcher initializer also no-ops at `:357-362`.

File format (`schema.ts:214-229`): wrapper object `{ $schema?, $docs?, bindings: KeybindingBlock[] }`. The schema URL is `https://www.schemastore.org/claude-code-keybindings.json` (`template.ts:46`). Parse path: `parseBindings(userBlocks)` (`parser.ts:191-203`) builds a flat `ParsedBinding[]` then `mergedBindings = [...defaultBindings, ...userParsed]` (`loadUserBindings.ts:197`) — **last entry wins** for action resolution, so user blocks override defaults.

Hot-reload via `chokidar.watch` (`:386-396`) with `awaitWriteFinish: { stabilityThreshold: 500ms, pollInterval: 200ms }` and `atomic: true`. Listeners on `add` / `change` (`handleChange`, `:424-437`) and `unlink` (`handleDelete`, `:439-447`) reload + emit through a `createSignal`-backed pub/sub at `:71`. Cleanup is registered via `registerCleanup` (`:403`).

Telemetry: `logCustomBindingsLoadedOncePerDay` (`:83-90`) emits `tengu_custom_keybindings_loaded` once per UTC date with the user binding count.

Validation pipeline:

- `checkDuplicateKeysInJson(content)` (`validate.ts:258-307`) — JSON.parse silently keeps last duplicate, this regex check (`:266`) finds duplicates within one bindings object so users get warned.
- `validateBindings(userBlocks, mergedBindings)` (`:425-451`) — runs `validateUserConfig`, `checkDuplicates`, `checkReservedShortcuts`. Returns `KeybindingWarning[]` deduplicated on `${type}:${key}:${context}`.
- Reserved checks (`reservedShortcuts.ts`): `NON_REBINDABLE` (`ctrl+c`/`ctrl+d`/`ctrl+m`, the last because terminals send CR for both Enter and ctrl+m), `TERMINAL_RESERVED` (`ctrl+z`/`ctrl+\\`), `MACOS_RESERVED` (`cmd+c|v|x|q|w|tab|space`).

### 1.3 Multi-key chord resolver (`resolver.ts`)

`resolveKeyWithChordState(input, key, activeContexts, bindings, pending)` returns a discriminated union: `{type:'match'|'none'|'unbound'|'chord_started'|'chord_cancelled'}` (`:15-21`).

Algorithm (`:166-244`):

1. Escape with non-null pending → `chord_cancelled`.
2. Build current `ParsedKeystroke`, ignoring Ink's `key.meta=true` for escape (`:89` — legacy terminal quirk).
3. Build `testChord = pending ? [...pending, currentKeystroke] : [currentKeystroke]`.
4. Filter bindings by `Set(activeContexts)` for O(n) instead of O(n·m).
5. Group prefix candidates by chord-string in a `Map<string,action|null>` (`:200-208`) so a later null-override shadows the default it unbinds — this fixes the bug where null-unbinding `ctrl+x ctrl+k` would otherwise still make `ctrl+x` enter chord-wait and the single-key binding never fires.
6. If any group has a non-null winner → `chord_started`.
7. Else find exact match (last-wins iteration) → `match` or `unbound` if action is `null`.
8. Else `chord_cancelled` if pending was non-null, else `none`.

Equality (`keystrokesEqual`, `:107-118`) collapses `alt`/`meta` into one logical modifier ("(a.alt || a.meta) === (b.alt || b.meta)") — legacy terminals can't distinguish them. `super` (cmd/win) is distinct, only arrives via Kitty keyboard protocol.

Chord timeout: `KeybindingProviderSetup.tsx:30` sets `CHORD_TIMEOUT_MS = 1000`. `setPendingChord` (`:172-187`) clears any prior timeout and starts a new one; on timeout, ref+state both go to null. **Ref + state dual storage** (`:141-142`) is necessary because chord resolve must see the new pending value synchronously — React state would lag a render.

### 1.4 React integration (`KeybindingContext.tsx`, `useKeybinding.ts`, `KeybindingProviderSetup.tsx`)

`KeybindingProvider` (`KeybindingContext.tsx:59-182`) exposes a context value with `resolve`, `setPendingChord`, `getDisplayText`, `bindings`, `pendingChord`, `activeContexts`, `registerActiveContext`, `unregisterActiveContext`, `registerHandler`, `invokeAction`. The handlerRegistry is a `Map<action, Set<{action, context, handler}>>` ref (`:56`).

`useRegisterKeybindingContext(context, isActive=true)` (`:215-242`) registers/unregisters a context on mount/unmount via `useLayoutEffect`. `ThemePicker` example in JSDoc (`:208-212`) registers `'ThemePicker'` so its `ctrl+t` (`theme:toggleSyntaxHighlighting`) wins over Global's `ctrl+t` (`app:toggleTodos`).

`useKeybinding(action, handler, options)` (`useKeybinding.ts:33-97`) and `useKeybindings(handlers, options)` (`:113-196`) — Ink-native hooks. The handler registers with the context for `ChordInterceptor` to invoke, and locally calls `resolve()` via `useInput`. On `match`, if action matches the current handler's action, calls handler — if return is not `false`, calls `event.stopImmediatePropagation()`. Returning `false` is fall-through (e.g., `ScrollKeybindingHandler` returns false when content fits so a child's wheel handler can take it).

`ChordInterceptor` (`KeybindingProviderSetup.tsx:226-307`) registers `useInput` at the root so chord second-keys are stopped before children (PromptInput) capture them. Skips wheel events when not in chord (`:238`). Builds full context list = handler-registered contexts ∪ active contexts ∪ `'Global'`.

### 1.5 Display + reserved validation (`shortcutFormat.ts`, `useShortcutDisplay.ts`, `parser.ts:157-186`)

`getShortcutDisplay(action, context, fallback)` (`shortcutFormat.ts:38-63`) — non-React caller variant. Logs `tengu_keybinding_fallback_used` analytics event once per `action+context` pair (kept in module-scope `Set` at `:19`) when the fallback is used.

`useShortcutDisplay` (`useShortcutDisplay.ts:29-59`) — React hook variant. Logs once per mount (not per render) via `hasLoggedRef`.

Platform-aware display: `keystrokeToDisplayString(ks, platform)` (`parser.ts:157-176`) — `opt` on macOS, `alt` elsewhere; `cmd` on macOS, `super` elsewhere. Display includes Unicode arrows for nav keys (`↑↓←→`).

### 1.6 Action set (`schema.ts:64-172`)

`KEYBINDING_ACTIONS` enumerates ~93 actions across categories: `app:*` (10), `history:*` (3), `chat:*` (12), `autocomplete:*` (4), `confirm:*` (10), `tabs:*` (2), `transcript:*` (2), `historySearch:*` (4), `task:*` (1), `theme:*` (1), `help:*` (1), `attachments:*` (4), `footer:*` (7), `messageSelector:*` (5), `diff:*` (7), `modelPicker:*` (2), `select:*` (4), `plugin:*` (2), `permission:*` (1), `settings:*` (3), `voice:*` (1). Action grammar: `domain:verb` lowercase. Special: `command:<name>` (regex `/^command:[a-zA-Z0-9:\-_]+$/`) is allowed in user config to bind a slash command to a key — but only in `Chat` context (`validate.ts:209-219` warns otherwise).

---

## 2. `outputStyles/` — 1 file, 3.4 KB

`loadOutputStylesDir.ts` is a `memoize`-cached loader (`:26-92`). Loads `.md` files from `.claude/output-styles/` walking up project tree and `~/.claude/output-styles/` user dir via `loadMarkdownFilesForSubdir('output-styles', cwd)`. Each filename → style name (no `.md`); content → `prompt`; frontmatter: `name`, `description`, `keep-coding-instructions` (boolean or string), `force-for-plugin` (warning logged for non-plugin styles at `:65-70`).

Built-in styles + priority ordering live in `constants/outputStyles.ts:41-135`:

- `default` (null — system prompt unmodified).
- `Explanatory` (`:43-55`) — keepCodingInstructions=true; appends `EXPLANATORY_FEATURE_PROMPT` ("Insight" boxed lines).
- `Learning` (`:56-134`) — keepCodingInstructions=true; "Learn by Doing" prompt with examples (whole-function, partial-function, debugging).

Style merge order (`:158-159`): `[pluginStyles, userStyles, projectStyles, managedStyles]` — managed (org policy) is highest priority, then user, then project, then plugin, then built-ins. Forced plugin styles win across all (`:182-204`); only one wins, others are warning-logged.

System-prompt integration: `getOutputStyleSection` (`prompts.ts:151-158`) emits `# Output Style: <name>\n<prompt>` directly into the system prompt. Tools are unaffected — output styles only modify the system prompt body.

---

## 3. `vim/` — 5 files, 41 KB

### 3.1 State machine (`types.ts`)

`VimState` (`:49-52`) is a discriminated union: `{mode:'INSERT', insertedText:string} | {mode:'NORMAL', command:CommandState}`. INSERT tracks the typed string for dot-repeat playback; NORMAL holds a `CommandState` for command parsing.

`CommandState` (`:59-75`) — 11 states: `idle`, `count`, `operator`, `operatorCount`, `operatorFind`, `operatorTextObj`, `find`, `g`, `operatorG`, `replace`, `indent`. Each carries the data it needs (operator, count, scope, find type, indent direction).

`PersistentState` (`:81-86`) — survives commands: `lastChange`, `lastFind`, `register`, `registerIsLinewise`. `RecordedChange` (`:92-119`) is a discriminated union with 10 variants for dot-repeat playback (`insert`, `operator`, `operatorTextObj`, `operatorFind`, `replace`, `x`, `toggleCase`, `indent`, `openLine`, `join`).

### 3.2 Constants (`types.ts:125-182`)

- `OPERATORS` (`:125-129`): `d→delete, c→change, y→yank` plus `isOperatorKey` type guard.
- `SIMPLE_MOTIONS` (`:135-149`): Set of `h l j k w b e W B E 0 ^ $`.
- `FIND_KEYS` (`:151`): `f F t T`.
- `TEXT_OBJ_SCOPES` (`:153-156`): `i→inner, a→around` plus `isTextObjScopeKey`.
- `TEXT_OBJ_TYPES` (`:164-180`): `w W " ' \` ( ) b [ ] { } B < >`.
- **`MAX_VIM_COUNT = 10000`** (`:182`) — caps numeric prefixes to prevent integer overflow / pathological repeat counts.

### 3.3 Motions (`motions.ts`)

`resolveMotion(key, cursor, count)` (`:13-25`) loops `applySingleMotion` count times, breaking early if cursor doesn't move (boundary). `applySingleMotion` (`:30-67`) is a switch over keys — delegates to `Cursor` methods (`left`, `right`, `downLogicalLine`, `upLogicalLine`, `nextVimWord`, `prevVimWord`, `endOfVimWord`, `nextWORD`, `prevWORD`, `endOfWORD`, `startOfLogicalLine`, `firstNonBlankInLogicalLine`, `endOfLogicalLine`, `startOfLastLine`). `gj`/`gk` are display-line motions (visible up/down across wraps), distinct from `j`/`k` which are logical-line.

`isInclusiveMotion('eE$')` (`:72-74`) — destination char is included in operator range. `isLinewiseMotion('jkG' || 'gg')` (`:80-82`) — operator extends to full lines.

### 3.4 Text objects (`textObjects.ts`)

`PAIRS` (`:19-33`) maps both bracket directions to the same pair; `b`/`B` aliases for `()` / `{}`. `findTextObject(text, offset, type, isInner)` (`:38-58`) dispatches: `w`/`W` → `findWordObject`; same-char delimiters (quotes) → `findQuoteObject`; bracket pairs → `findBracketObject`.

`findWordObject` (`:60-116`) is grapheme-safe — pre-segments via `Intl.Segmenter` so emoji/CJK/combining marks are handled. Walks left/right while predicate is consistent (word/whitespace/punctuation). Around-mode (`isInner=false`) extends through trailing then leading whitespace.

`findQuoteObject` (`:118-147`) line-scoped: pairs the `2*N` / `2*N+1` quotes on the line. `findBracketObject` (`:149-186`) depth-counts open/close to find balanced pair.

### 3.5 Operators (`operators.ts`, 557 lines)

`OperatorContext` (`:26-37`) — pure-function context object: `cursor`, `text`, `setText`, `setOffset`, `enterInsert`, `getRegister`, `setRegister`, `getLastFind`, `setLastFind`, `recordChange`. All operators are state-free pure functions parameterized on this context.

Special cases:

- `cw`/`cW` (`:441-451`) changes to **end** of word, not start of next word — vim quirk.
- Linewise operators include the preceding newline when at end-of-file (`:455-461`) so deleting the last line leaves no trailing newline.
- "Image-ref snap" (`:471-472`) — `cursor.snapOutOfImageRef(offset, edge)` extends operator range to cover whole `[Image #N]` chip so dw/cw/yw never leave a partial placeholder. This is bespoke to the agent's image-attachment system.

Implemented operators: `executeOperatorMotion`, `executeOperatorFind`, `executeOperatorTextObj`, `executeLineOp` (dd/cc/yy), `executeX` (delete char), `executeReplace` (r), `executeToggleCase` (~), `executeJoin` (J), `executePaste` (p/P with linewise/charwise distinction at `:302-343`), `executeIndent` (>>/<<), `executeOpenLine` (o/O), `executeOperatorG`, `executeOperatorGg`. Indent uses 2-space tabstop hardcoded at `:357`.

### 3.6 Transitions (`transitions.ts`)

`transition(state, input, ctx)` (`:59-88`) — dispatcher. `handleNormalInput` (`:98-200`) handles all idle-or-count-prefixed commands. `handleOperatorInput` (`:206-242`) handles inputs after an operator (motion/find/text-object/g).

Insert-mode entries: `i` (cursor offset), `I` (`firstNonBlank`), `a` (right-of-cursor), `A` (`endOfLogicalLine`), `o`/`O` (open line below/above, `executeOpenLine` already calls `enterInsert`).

Special inputs: `.` → `ctx.onDotRepeat?.()` (`:159-161`), `;`/`,` → `executeRepeatFind` (`:162-164`), `u` → `ctx.onUndo?.()` (`:165-167`), `D` → `delete to $` (`:137-139`), `C` → `change to $` (`:140-142`), `Y` → `yank line` (`:143-145`), `G` (count=1 → last line, count=N → line N at `:146-158`).

Count overflow: `MAX_VIM_COUNT` (10000) clamp at `:272-273` and `:322-323`. Replace mode handles backspace as cancel (`fromReplace`, `:438-448`) — `r<BS>` would otherwise pass `''` to `executeReplace` which would delete instead.

---

## 4. `voice/` — 1 file, 2.3 KB

`voiceModeEnabled.ts` is just the gate logic; the streaming implementation lives in `services/voice.ts` (out of scope).

`isVoiceGrowthBookEnabled()` (`:16-23`) — only true when `feature('VOICE_MODE')` is bundle-active AND the `tengu_amber_quartz_disabled` GrowthBook killswitch is **not** flipped on. Default `false` for the killswitch means missing/stale disk cache reads as "not killed" — fresh installs get voice immediately.

`hasVoiceAuth()` (`:32-44`) — voice requires Anthropic OAuth (uses `voice_stream` endpoint on claude.ai, **not available with API keys, Bedrock, Vertex, or Foundry**). Calls `isAnthropicAuthEnabled()` AND checks `getClaudeAIOAuthTokens()?.accessToken` — both gates necessary because the auth-provider check alone doesn't confirm a token exists.

`isVoiceModeEnabled() = hasVoiceAuth() && isVoiceGrowthBookEnabled()` (`:52-54`). Used by `/voice` command, `ConfigTool`, `VoiceModeNotice`. Render paths use `useVoiceEnabled()` (memoizes auth).

Default Chat-context binding `space` → `voice:pushToTalk` (`defaultBindings.ts:96`) is feature-gated via `feature('VOICE_MODE')`. Validation at `validate.ts:220-242` warns if user binds a bare letter to `voice:pushToTalk` because hold-detection needs OS auto-repeat and bare letters print into the input during warmup.

---

## 5. `schemas/hooks.ts` — 1 file, 7.9 KB

Zod schemas for `~/.claude/settings.json` `hooks` blocks. Extracted from `utils/settings/types.ts` to break a circular dependency with `plugins/schemas.ts` (header comment `:1-9`).

Four hook types via `discriminatedUnion('type', [...])` at `:183-188`:

1. **`BashCommandHookSchema`** (`:32-65`) — `command` (shell), `if` (permission-rule filter), `shell: 'bash'|'powershell'|...`, `timeout` (seconds, positive), `statusMessage`, `once`, `async`, `asyncRewake` (background, wakes on exit code 2).
2. **`PromptHookSchema`** (`:67-95`) — `prompt` with `$ARGUMENTS` placeholder, `model` (default small fast), `if`, `timeout`. **`@[MODEL LAUNCH]`** comment at `:80-86` references hardcoded example `"claude-sonnet-4-6"` in the `.describe()` string. This is an LLM-evaluated hook.
3. **`HttpHookSchema`** (`:97-126`) — POST to `url`, `headers` map with **explicit `allowedEnvVars` allowlist** for env-var interpolation in headers (`$VAR_NAME` or `${VAR_NAME}` syntax) — anything not in the allowlist is left as empty string. Critical security boundary: prevents arbitrary env exfiltration.
4. **`AgentHookSchema`** (`:128-163`) — `prompt` describing what to verify, `model` (default Haiku, again `"claude-sonnet-4-6"` example string at `:151-153`). Comment at `:130-138` warns: **DO NOT add `.transform()` here** — `parseSettingsFile` round-trips through `JSON.stringify` and would silently drop transformed function values. References gh-24920, CC-79.

Shared `IfConditionSchema` (`:19-27`) — permission-rule syntax (`Bash(git *)`, `Read(*.ts)`) evaluated against the hook's `tool_name` and `tool_input`. Avoids spawning hooks for non-matching commands.

`HookMatcherSchema` (`:194-204`) wraps `{ matcher?: string, hooks: HookCommand[] }`. `HooksSchema` (`:211-213`) is `z.partialRecord(z.enum(HOOK_EVENTS), z.array(HookMatcherSchema))` — keys are hook event names (defined in `agentSdkTypes.js`).

Inferred TypeScript types exported at `:216-222`: `HookCommand`, `BashCommandHook`, `PromptHook`, `AgentHook`, `HttpHook`, `HookMatcher`, `HooksSettings`.

---

## 6. `types/` — 11 files (8 top-level + `generated/{events_mono,google}/`), 65 KB

### 6.1 `command.ts` (215 lines)

The Command type — `Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)` (`:205-206`).

`PromptCommand` (`:25-57`) — markdown-defined slash commands with `getPromptForCommand(args, context)` returning `ContentBlockParam[]`. Notable fields: `model?`, `effort?`, `paths?[]` (glob patterns — skill only visible after model touches matching files), `context: 'inline' | 'fork'` (fork = sub-agent with separate token budget), `agent?` (agent type when forked), `disableNonInteractive?`, `hooks?: HooksSettings` (skill-scoped hooks), `skillRoot?` (`CLAUDE_PLUGIN_ROOT` env var for skill hooks), `source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'`.

`LocalCommand` (`:74-78`) and `LocalJSXCommand` (`:144-152`) — code-implemented commands with lazy `load()`.

`CommandAvailability` (`:169-173`): `'claude-ai' | 'console'` — auth/provider gating distinct from `isEnabled()` (which is a runtime/feature-flag check).

`CommandBase` (`:175-203`) optional flags: `aliases?`, `argumentHint?`, `whenToUse?` (Skill spec field), `disableModelInvocation?`, `userInvocable?`, `loadedFrom`, `kind: 'workflow'`, `immediate?` (executes without queue stop point), `isSensitive?` (args redacted from history). `userFacingName?: () => string` for plugin-prefix stripping.

### 6.2 `hooks.ts` (291 lines)

Runtime hook plumbing. **17 PreToolUse / PostToolUse / PermissionRequest / etc. hook events** in `syncHookResponseSchema` (`:50-166`) discriminated union: `PreToolUse`, `UserPromptSubmit`, `SessionStart`, `Setup`, `SubagentStart`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Notification`, `PermissionRequest`, `Elicitation`, `ElicitationResult`, `CwdChanged`, `FileChanged`, `WorktreeCreate`. (Aligns with the "22 canonical event names" mention in MEMORY but at the hook-RESPONSE schema level the count is what's listed here.)

`promptRequestSchema` (`:28-40`) — elicitation protocol: `prompt` is the request id (mirroring `{async:true}` pattern), `message`, `options[]` with `key`/`label`/`description`. `PromptResponse` (`:44-47`) is `{prompt_response: id, selected: key}`.

`HookCallback` (`:211-225`) — function-form hooks (not persistable to settings): callback `(input, toolUseID, abort, hookIndex?, context?)` returns `Promise<HookJSONOutput>`. `internal: true` excludes from `tengu_run_hook` metrics.

`HookResult` (`:260-275`) and `AggregatedHookResult` (`:277-290`) — aggregator drains multiple hooks, merges `additionalContexts: string[]`, picks first `permissionBehavior`, etc.

Compile-time SDK/Zod parity: `_assertSDKTypesMatch` (`:198-200`) using `IsEqual<SchemaHookJSONOutput, HookJSONOutput>` — fails compile if SDK `agentSdkTypes.js` and the local Zod schema diverge.

### 6.3 `ids.ts` (45 lines)

Branded `SessionId` and `AgentId` types prevent mixing at compile time. `AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/` (`:35`) — the `a` prefix + optional label + 16 hex chars. `toAgentId(s)` returns `null` for non-matching strings (e.g. teammate names, team-addressing).

### 6.4 `logs.ts` (331 lines)

Persisted transcript schema. `SerializedMessage = Message & { cwd, userType, entrypoint?, sessionId, timestamp, version, gitBranch?, slug? }` (`:8-17`). `LogOption` (`:19-53`) is the on-disk session record with **45 fields** including `mode: 'coordinator'|'normal'`, `worktreeSession: PersistedWorktreeSession|null`, `prNumber/prUrl/prRepository`, `customTitle`, `summary`, `tag`, `agentName/agentColor/agentSetting`, `isTeammate`, `fileHistorySnapshots`, `attributionSnapshots`, `contextCollapseCommits[]`, `contextCollapseSnapshot` (last-wins).

Discriminator-based entries (`:297-317`): `TranscriptMessage`, `SummaryMessage`, `CustomTitleMessage`, `AiTitleMessage`, `LastPromptMessage`, `TaskSummaryMessage`, `TagMessage`, `AgentNameMessage`, `AgentColorMessage`, `AgentSettingMessage`, `PRLinkMessage`, `FileHistorySnapshotMessage`, `AttributionSnapshotMessage`, `QueueOperationMessage`, `SpeculationAcceptMessage`, `ModeEntry`, `WorktreeStateEntry`, `ContentReplacementEntry`, `ContextCollapseCommitEntry` (type literal `'marble-origami-commit'` is **obfuscated** to match a feature gate name — comment at `:251-260` explains: external builds shouldn't see descriptive strings via the appendEntry dispatch), `ContextCollapseSnapshotEntry` (`'marble-origami-snapshot'`).

`TaskSummaryMessage` (`:93-98`) — periodic fork-generated mid-turn summaries written every `min(5 steps, 2min)` so `claude ps` shows useful state instead of "ok go".

`FileAttributionState` (`:198-203`) — `{contentHash, claudeContribution, mtime}` — character-level Claude contribution tracking for commit attribution.

### 6.5 `permissions.ts` (442 lines)

`EXTERNAL_PERMISSION_MODES` (`:16-22`): `acceptEdits`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Internal modes add `auto`, `bubble` (`:28`). `INTERNAL_PERMISSION_MODES` runtime-feature-gates `'auto'` behind `feature('TRANSCRIPT_CLASSIFIER')` (`:33-36`).

`PermissionBehavior = 'allow' | 'deny' | 'ask'` (`:44`).

`PermissionRuleSource` (`:54-62`): 8 origins — `userSettings`, `projectSettings`, `localSettings`, `flagSettings`, `policySettings`, `cliArg`, `command`, `session`.

`PermissionUpdate` discriminated union (`:98-131`): `addRules`, `replaceRules`, `removeRules`, `setMode`, `addDirectories`, `removeDirectories`. Each has a `destination: PermissionUpdateDestination` (5 values: same as source minus `flagSettings`/`policySettings`/`command`).

`PermissionDecision = PermissionAllowDecision | PermissionAskDecision | PermissionDenyDecision` (`:241-247`). `PermissionResult` adds a `'passthrough'` variant (`:251-266`).

`PermissionDecisionReason` discriminated union (`:271-324`) — 9 reasons: `rule`, `mode`, `subcommandResults` (Map), `permissionPromptTool`, `hook`, `asyncAgent`, `sandboxOverride` (`'excludedCommand'|'dangerouslyDisableSandbox'`), `classifier`, `workingDir`, `safetyCheck` (with `classifierApprovable: bool`), `other`.

`YoloClassifierResult` (`:346-397`) — bash classifier with optional 2-stage XML support (`stage: 'fast'|'thinking'`), per-stage `Usage`/`DurationMs`/`RequestId`/`MsgId` for join-back to api_usage logs. `transcriptTooLong?: bool` is deterministic so callers fall back to normal prompting.

### 6.6 `plugin.ts` (363 lines)

`BuiltinPluginDefinition` (`:18-35`) — ships-with-CLI plugins. `LoadedPlugin` (`:48-70`) — runtime plugin record with `commandsPath/commandsPaths`, `agentsPath/agentsPaths`, `skillsPath/skillsPaths`, `outputStylesPath/outputStylesPaths`, `hooksConfig`, `mcpServers`, `lspServers`, `commandsMetadata: Record<string, CommandMetadata>`.

`PluginError` (`:101-283`) — discriminated union with **22 error types** covering git/network/manifest/marketplace/MCP/MCPB/LSP/dependency/cache failures. Comment at `:88-100` notes: only 2 (`generic-error`, `plugin-not-found`) are used in production today; the rest support UI formatting and provide a roadmap for incremental error-specificity refactors. `getPluginErrorMessage(error)` (`:295-362`) renders a display message per variant.

### 6.7 `textInputTypes.ts` (388 lines)

`BaseTextInputProps` (`:27-202`) — text input shared props. Notable fields: `inlineGhostText?: InlineGhostText` for mid-input command autocomplete (`:15-22`), `inputFilter?: (input, key) => string` for raw-input transformation, `disableEscapeDoublePress?` (set when a keybinding context owns escape — child useInput effects register before parent), `maxVisibleLines?` (viewport windowing), `placeholderElement?: React.ReactNode`.

`VimTextInputProps = BaseTextInputProps & { initialMode?: VimMode, onModeChange? }` (`:207-217`). `VimMode = 'INSERT' | 'NORMAL'` (`:222`).

`PromptInputMode` (`:265-269`): `'bash' | 'prompt' | 'orphaned-permission' | 'task-notification'`.

`QueuePriority = 'now' | 'next' | 'later'` (`:294`) — semantically: `now` interrupts in-flight tool call; `next` waits for current tool to finish, sends between tool result and next API round-trip; `later` waits for full turn. Wakes `SleepTool` in proactive mode.

`QueuedCommand` (`:299-358`) — fields include `bridgeOrigin?` (from Remote Control bridge — filters slash commands through `isBridgeSafeCommand` to prevent the `/model` local picker leak per PR #19134), `isMeta?` (transcript-hidden but model-visible — for proactive ticks/teammate messages), `origin?: MessageOrigin`, `workload?` (rides on QueuedCommand to be picked up only when dequeued — bridges async cron firing to actual turn), `agentId?` (subagent isolation in unified queue per PR #18453).

### 6.8 `generated/{events_mono,google}/` — out of scope (auto-generated).

---

## 7. `constants/` — 21 files, 314 KB

### 7.1 `prompts.ts` (914 lines) — system prompt + hardcoded model IDs

**Hardcoded model IDs** (LOCKED-rule violation if ported):

- `prompts.ts:118`: `const FRONTIER_MODEL_NAME = 'Claude Opus 4.6'` with comment `// @[MODEL LAUNCH]: Update the latest frontier model.`
- `prompts.ts:121-125`: `CLAUDE_4_5_OR_4_6_MODEL_IDS = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' }`.
- `prompts.ts:696`: System prompt template uses these IDs literally — "Opus 4.6: '${...opus}', Sonnet 4.6: '${...sonnet}', Haiku 4.5: '${...haiku}'".
- `prompts.ts:702`: Fast-mode message uses `${FRONTIER_MODEL_NAME}` — "Fast mode for Claude Code uses the same Claude Opus 4.6 model with faster output."
- `prompts.ts:715-727`: `getKnowledgeCutoff(modelId)` hardcoded mapping: sonnet-4-6 → "August 2025", opus-4-6 → "May 2025", opus-4-5 → "May 2025", haiku-4 → "February 2025", opus-4/sonnet-4 → "January 2025".

`SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'` (`:114-115`) — marker separating cross-org cacheable static content from session-specific dynamic content. Cache logic is in `utils/api.ts` `splitSysPromptPrefix` and `services/api/claude.ts` `buildSystemPromptBlocks`.

`CLAUDE_CODE_DOCS_MAP_URL = 'https://code.claude.com/docs/en/claude_code_docs_map.md'` (`:103`).

### 7.2 `apiLimits.ts` (95 lines) — API limits, last verified 2025-12-22

Image: `API_IMAGE_MAX_BASE64_SIZE = 5 MB` (`:22`), `IMAGE_TARGET_RAW_SIZE = 3.75 MB` (`:29`), `IMAGE_MAX_WIDTH/HEIGHT = 2000` (`:42-43`).

PDF: `PDF_TARGET_RAW_SIZE = 20 MB` (`:54`), `API_PDF_MAX_PAGES = 100` (`:59`), `PDF_EXTRACT_SIZE_THRESHOLD = 3 MB` (`:66`), `PDF_MAX_EXTRACT_SIZE = 100 MB` (`:72`), `PDF_MAX_PAGES_PER_READ = 20` (`:77`), `PDF_AT_MENTION_INLINE_THRESHOLD = 10` pages (`:83`).

Per-request: `API_MAX_MEDIA_PER_REQUEST = 100` (`:94`).

### 7.3 `betas.ts` (53 lines) — 14 beta headers

`CLAUDE_CODE_20250219_BETA_HEADER`, `INTERLEAVED_THINKING_BETA_HEADER` (`2025-05-14`), `CONTEXT_1M_BETA_HEADER` (`2025-08-07`), `CONTEXT_MANAGEMENT_BETA_HEADER` (`2025-06-27`), `STRUCTURED_OUTPUTS_BETA_HEADER` (`2025-12-15`), `WEB_SEARCH_BETA_HEADER` (`2025-03-05`), tool-search betas differ by provider: `TOOL_SEARCH_BETA_HEADER_1P = 'advanced-tool-use-2025-11-20'` (Claude API + Foundry), `TOOL_SEARCH_BETA_HEADER_3P = 'tool-search-tool-2025-10-19'` (Vertex + Bedrock), `EFFORT_BETA_HEADER` (`2025-11-24`), `TASK_BUDGETS_BETA_HEADER` (`2026-03-13`), `PROMPT_CACHING_SCOPE_BETA_HEADER` (`2026-01-05`), `FAST_MODE_BETA_HEADER` (`2026-02-01`), `REDACT_THINKING_BETA_HEADER` (`2026-02-12`), `TOKEN_EFFICIENT_TOOLS_BETA_HEADER` (`2026-03-28`), `ADVISOR_BETA_HEADER` (`2026-03-01`).

Feature-gated: `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` (CONNECTOR_TEXT), `AFK_MODE_BETA_HEADER` (TRANSCRIPT_CLASSIFIER), `CLI_INTERNAL_BETA_HEADER` (USER_TYPE === 'ant').

`BEDROCK_EXTRA_PARAMS_HEADERS` (`:38-42`) — Set of betas that go in `extraBodyParams` instead of headers (Bedrock-specific). `VERTEX_COUNT_TOKENS_ALLOWED_BETAS` (`:48-52`) — only 3 betas don't 400 on Vertex countTokens API.

### 7.4 `common.ts` (34 lines) — date helpers

`getLocalISODate()` (`:4-15`) — env override `CLAUDE_CODE_OVERRIDE_DATE` for ant-only testing; else local YYYY-MM-DD. `getSessionStartDate = memoize(getLocalISODate)` (`:24`) — memoized for prompt-cache stability across midnight rollover. `getLocalMonthYear()` (`:28-33`) — "February 2026" format, used in tool prompts to minimize cache busting (changes monthly not daily).

### 7.5 `cyberRiskInstruction.ts` (24 lines)

`CYBER_RISK_INSTRUCTION` (`:24`) — single literal: "Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases."

Header comment (`:6-22`) marks file as **owned by Safeguards team (David Forsythe, Kyla Guru)**, requires explicit approval to modify. Claude is told "Do not edit this file unless explicitly asked".

### 7.6 `errorIds.ts` (16 lines)

Numeric error IDs for production tracing — obfuscated identifiers per-`logError` site. Currently exports only `E_TOOL_USE_SUMMARY_GENERATION_FAILED = 344`. **Next ID: 346** — comment instructs adding a `const` then incrementing.

### 7.7 `figures.ts` (45 lines) — Unicode glyph constants

Platform-aware: `BLACK_CIRCLE = '⏺'` macOS, `'●'` else. Effort indicators: `EFFORT_LOW='○'`, `EFFORT_MEDIUM='◐'`, `EFFORT_HIGH='●'`, `EFFORT_MAX='◉'` (Opus 4.6 only). MCP indicators: `REFRESH_ARROW='↻'`, `CHANNEL_ARROW='←'`, `INJECTED_ARROW='→'`, `FORK_GLYPH='⑂'`. Review states: `DIAMOND_OPEN='◇'` (running), `DIAMOND_FILLED='◆'`. Bridge spinner frames `[·|·, ·/·, ·—·, ·\·]`.

### 7.8 `files.ts` (157 lines)

`BINARY_EXTENSIONS` Set (`:5-112`) — ~80 extensions across images/videos/audio/archives/executables/documents/fonts/bytecode/databases/design files/Flash/lock-data. `hasBinaryExtension(filePath)` (`:117-120`) tests last `.ext`. `isBinaryContent(buffer)` (`:131-156`) checks first 8192 bytes — null byte = binary; >10% non-printable = binary.

### 7.9 `github-app.ts` (145 lines)

GitHub Actions workflow templates. `WORKFLOW_CONTENT` (`:6-56`) — claude.yml; `CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT` (`:100-144`) — code-review.yml using plugin marketplace. Both use `anthropics/claude-code-action@v1`.

### 7.10 `keys.ts` (12 lines) — GrowthBook SDK keys

Three SDK keys: `'sdk-yZQvlplybuXjYh6L'` (ant + dev override), `'sdk-xRVcrliHIlrg4og4'` (ant prod), `'sdk-zAZezfDKGoZuXXKe'` (external). Lazy-read for env-var ordering.

### 7.11 `messages.ts` (1 line)

`NO_CONTENT_MESSAGE = '(no content)'`.

### 7.12 `oauth.ts` (235 lines)

`CLAUDE_AI_INFERENCE_SCOPE = 'user:inference'`, `CLAUDE_AI_PROFILE_SCOPE = 'user:profile'`, `CONSOLE_SCOPE = 'org:create_api_key'`, `OAUTH_BETA_HEADER = 'oauth-2025-04-20'`. `CLAUDE_AI_OAUTH_SCOPES`: profile + inference + `user:sessions:claude_code` + `user:mcp_servers` + `user:file_upload`.

Three OAuth modes: `prod` (default), `staging` (ant-only via `USE_STAGING_OAUTH`), `local` (ant-only via `USE_LOCAL_OAUTH`). PROD endpoints: `BASE_API_URL='https://api.anthropic.com'`, `CLAUDE_AI_AUTHORIZE_URL='https://claude.com/cai/oauth/authorize'` (bounces through claude.com for attribution, 307s twice), `CLIENT_ID='9d1c250a-e61b-44d9-88ed-5944d1962f5e'`, `MCP_PROXY_URL='https://mcp-proxy.anthropic.com'`.

`CLAUDE_CODE_CUSTOM_OAUTH_URL` env override allowed only against `ALLOWED_OAUTH_BASE_URLS` (`:179-183`) — FedStart/PubSec only — to prevent token leakage to arbitrary endpoints. `MCP_CLIENT_METADATA_URL = 'https://claude.ai/oauth/claude-code-client-metadata'` for CIMD/SEP-991.

### 7.13 `outputStyles.ts` — already covered in §2.

### 7.14 `product.ts` (76 lines)

`PRODUCT_URL = 'https://claude.com/claude-code'`. `CLAUDE_AI_BASE_URL = 'https://claude.ai'`, staging `'https://claude-ai.staging.ant.dev'`, local `'http://localhost:4000'`. `getRemoteSessionUrl` translates `cse_*` → `session_*` (temporary shim gated by `tengu_bridge_repl_v2_cse_shim_enabled`).

### 7.15 `spinnerVerbs.ts` (205 lines)

**~190 spinner verbs** alphabetized: `Accomplishing`, `Actioning`, `Actualizing`... `Wrangling`, `Zesting`, `Zigzagging`. Notable Claude-isms: `'Clauding'`, `'Combobulating'`, `'Hyperspacing'`, `'Jitterbugging'`, `'Razzle-dazzling'`, `'Whatchamacalliting'`. User extensible via `settings.spinnerVerbs = { mode: 'replace'|'append', verbs: [...] }` (`:1-13`).

### 7.16 `system.ts` (96 lines)

Three CLI sysprompt prefixes (`:10-12`):

- `DEFAULT_PREFIX`: "You are Claude Code, Anthropic's official CLI for Claude."
- `AGENT_SDK_CLAUDE_CODE_PRESET_PREFIX`: same + ", running within the Claude Agent SDK."
- `AGENT_SDK_PREFIX`: "You are a Claude agent, built on Anthropic's Claude Agent SDK."

`getCLISyspromptPrefix({isNonInteractive, hasAppendSystemPrompt})` (`:30-46`) — vertex always default; non-interactive with append → CC preset; non-interactive without append → SDK; else default.

`getAttributionHeader(fingerprint)` (`:73-95`) emits `x-anthropic-billing-header: cc_version=${MACRO.VERSION}.${fingerprint}; cc_entrypoint=${entrypoint}; cch=00000; cc_workload=...`. **`cch=00000` is a placeholder** that Bun's native HTTP stack overwrites in the request body bytes with a computed hash for client attestation (`feature('NATIVE_CLIENT_ATTESTATION')`). Same-length replacement avoids Content-Length changes. `cc_workload` rides for QoS-pool routing.

### 7.17 `systemPromptSections.ts` (69 lines)

Memoized sections with `cacheBreak: false`. `systemPromptSection(name, compute)` (`:20-25`) — cached. `DANGEROUS_uncachedSystemPromptSection(name, compute, _reason)` (`:32-38`) — recomputes every turn (will break prompt cache); requires a reason argument as documentation. `clearSystemPromptSections()` runs on `/clear` and `/compact`, resets beta-header latches too.

### 7.18 `toolLimits.ts` (57 lines)

`DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000` per-tool default. `MAX_TOOL_RESULT_TOKENS = 100_000` (~400KB). `BYTES_PER_TOKEN = 4`. `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000` aggregate per-turn budget — overridable via GrowthBook `tengu_hawthorn_window`. `TOOL_SUMMARY_MAX_LENGTH = 50` chars for compact-view summaries.

### 7.19 `tools.ts` (113 lines)

`ALL_AGENT_DISALLOWED_TOOLS` (`:36-46`) — 4 tools blocked from sub-agents: `TaskOutputTool`, `ExitPlanModeV2Tool`, `EnterPlanModeTool`, `AgentTool` (ant only allows nested agents), `AskUserQuestionTool`, `TaskStopTool`, `WorkflowTool` (under `feature('WORKFLOW_SCRIPTS')`).

`ASYNC_AGENT_ALLOWED_TOOLS` (`:55-71`) — 14 tools async agents may use: FileRead, WebSearch, TodoWrite, Grep, WebFetch, Glob, all Shell tools, FileEdit, FileWrite, NotebookEdit, Skill, SyntheticOutput, ToolSearch, EnterWorktree, ExitWorktree.

`IN_PROCESS_TEAMMATE_ALLOWED_TOOLS` (`:77-88`) — additional tools for in-process teammates: TaskCreate/Get/List/Update, SendMessage, plus cron tools under `feature('AGENT_TRIGGERS')`.

`COORDINATOR_MODE_ALLOWED_TOOLS` (`:107-112`) — 4 tools only: AgentTool, TaskStopTool, SendMessageTool, SyntheticOutputTool.

### 7.20 `turnCompletionVerbs.ts` (13 lines)

8 past-tense verbs that work with "Worked for 5s" — `Baked, Brewed, Churned, Cogitated, Cooked, Crunched, Sautéed, Worked`.

### 7.21 `xml.ts` (87 lines)

XML tag constants for system-injected content. Command tags: `command-name`, `command-message`, `command-args`. Bash/local-command output: `bash-input`, `bash-stdout`, `bash-stderr`, `local-command-stdout/stderr/caveat` aggregated as `TERMINAL_OUTPUT_TAGS` (`:16-23`).

Task notification tags: `task-notification`, `task-id`, `tool-use-id`, `task-type`, `output-file`, `status`, `summary`, `reason`, `worktree`, `worktreePath`, `worktreeBranch`. Specialized: `ultraplan` (remote parallel planning), `remote-review` (teleported review session), `remote-review-progress` (10s heartbeat), `teammate-message` (swarm), `channel-message` + `channel`, `cross-session-message` (UDS to another Claude session inbox), `fork-boilerplate` + `FORK_DIRECTIVE_PREFIX = 'Your directive: '`, `tick` (`TICK_TAG`).

Help arg conventions: `COMMON_HELP_ARGS = ['help', '-h', '--help']` (`:69`); `COMMON_INFO_ARGS = ['list','show','display','current','view','get','check','describe','print','version','about','status','?']` (`:72-86`).

---

## 8. Cross-cutting findings + porting priorities

### 8.1 Top 7 architectural findings

1. **Twenty-context keybinding system** with Last-wins merge semantics, multi-key chords (`CHORD_TIMEOUT_MS=1000ms`), platform-aware modifiers, and **NULL-action unbinding** that must shadow longer chord prefixes (`resolver.ts:200-208`). This is more sophisticated than VS Code's keybinding system because it handles both the kitty keyboard protocol and legacy alt/meta collapsing.

2. **User keybinding customization is gated to ant employees** via `tengu_keybinding_customization_release` GrowthBook flag (`loadUserBindings.ts:41-46`). External users always get hardcoded defaults — confirmed across all four call sites (`loadKeybindings`, `loadKeybindingsSyncWithWarnings`, `initializeKeybindingWatcher`, plus the no-op telemetry in template.ts).

3. **Hardcoded model IDs in 5 prompts.ts call sites** (`:118, :122-124, :696, :702, :715-727`) — direct violation of our LOCKED rule. Each is annotated with `@[MODEL LAUNCH]` markers as porting checklist.

4. **Vim mode is a 11-state discriminated-union state machine** (`vim/types.ts:59-75`) with grapheme-safe text objects (Intl.Segmenter at `textObjects.ts:67-69`), bespoke image-chip range extension (`operators.ts:471-472`), and `MAX_VIM_COUNT=10000` overflow cap.

5. **Voice mode requires Anthropic OAuth** (`voiceModeEnabled.ts:32-44`) — incompatible with API keys, Bedrock, Vertex, or Foundry. The kill-switch GrowthBook flag is `tengu_amber_quartz_disabled` with default-false (fail-open) so fresh installs work without GrowthBook init delay.

6. **Hooks have 4 types** with discriminated `type` field (`schemas/hooks.ts:183-188`): `command`, `prompt`, `agent`, `http`. HTTP hooks have an **explicit `allowedEnvVars` allowlist** for env-var interpolation in headers — a critical security boundary against arbitrary env exfiltration. Agent hooks must NOT use `.transform()` because the JSON.stringify round-trip in `parseSettingsFile` silently drops function values (gh-24920, CC-79).

7. **Output styles modify only the system prompt** (constants/outputStyles.ts:41-135 + prompts.ts:151-158) — not tools, not behavior. Two built-ins: `Explanatory` and `Learning`. User/project/managed/plugin styles are loaded from `<root>/.claude/output-styles/*.md` with frontmatter `name`/`description`/`keep-coding-instructions`/`force-for-plugin` (plugin only).

### 8.2 Top 4 to-port priorities for AGI Workforce

1. **Port the keybinding architecture wholesale** — `KeybindingSetup` + `useKeybinding` + `useRegisterKeybindingContext` + chord interceptor + `~/.claude/keybindings.json` watcher. **But replace the ant-only gate** at `loadUserBindings.ts:137-139` so external users CAN customize. Use a JSON-schema URL of our own. Targets: CLI TUI (Ratatui — port the action set, leave the React provider), Desktop chat (port full React). The 1s chord timeout and chord-prefix null-shadowing logic are the high-value bits.

2. **Port the vim text-input state machine** as a free-standing module in `packages/utils/vim/`. Pure-function design (operators are state-free with explicit `OperatorContext`), grapheme-safe text objects, and `MAX_VIM_COUNT` cap make this trivially portable to React Native, Tauri webview, and Ratatui.

3. **Port the hooks Zod schema** (`schemas/hooks.ts`) as the canonical settings-file shape across all 6 surfaces. Critical: keep the **`allowedEnvVars` allowlist** for HTTP hook env interpolation. Replace the hardcoded `claude-sonnet-4-6` example strings in describe() with a placeholder pulled from `models.json`.

4. **Port the systemPromptSection memo + boundary marker pattern** (`constants/systemPromptSections.ts` + `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` from prompts.ts:114-115). This is the trick that makes Claude Code's prompt cache stable across midnight rollover, model switches, and turn boundaries: split the system prompt at a static/dynamic boundary, then mark cache-breaking sections explicitly with `DANGEROUS_uncachedSystemPromptSection(name, compute, reason)`. We can use it for `apps/cli` system prompts immediately.

### 8.3 Counter-recommendations (do NOT port)

- The `cyberRiskInstruction.ts` literal is owned by Anthropic Safeguards. We need our own equivalent reviewed by a security professional, not a copy.
- The hardcoded `MACOS_RESERVED` list in `reservedShortcuts.ts:59-67` only covers macOS Cocoa shortcuts. For our Tauri desktop, also need Windows (`alt+f4`, `win+l`, `win+d`) and Linux (Super-key DE shortcuts).
- The `obfuscated discriminator strings` pattern in `logs.ts` (`'marble-origami-commit'` etc.) exists because Anthropic ships ant-only features in external builds. We don't need this — our build already feature-gates dead code via the `feature()` macro pattern documented in `betas.ts:26-28`.
