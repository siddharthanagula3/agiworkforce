# C2 — Components Chunk 2 (entries 96..195 alphabetically)

> Scope: 100 files from `~/Desktop/reference/src/components/` indexed [96..195] in `find … | sort` order: FeedbackSurvey/\* through messages/teamMemCollapsed.tsx. **PromptInput.tsx is at index 286**, NOT in this chunk — see "Brief Inconsistency" note at end. This chunk is the read/diff/dialog/markdown/MCP/messages backbone of the Claude Code TUI.

---

## 0. Brief Inconsistency Note

The user prompt instructed me to capture `PromptInput/PromptInput.tsx` as part of chunk 2, but `find ~/Desktop/reference/src/components -type f | sort | sed -n '96,195p'` yields entries `FeedbackSurvey/TranscriptSharePrompt.tsx` (96) through `messages/teamMemCollapsed.tsx` (195). PromptInput.tsx is at sort-index **286**. I honored the actual chunk-2 file range; PromptInput belongs to a later chunk (likely C3/C4). The 1,500-word PromptInput allocation is therefore reallocated to the highest-density components actually in this chunk: `FullscreenLayout.tsx` (the layout shell that PromptInput renders inside), `Markdown.tsx` + `MarkdownTable.tsx` (rendering pipeline), `Message.tsx` + `MessageRow.tsx`, and the messages/ tool-render family.

---

## 1. FeedbackSurvey/ — six files (entries 96-101)

A self-contained, telemetry-driven survey subsystem. Three orthogonal survey kinds (general session feedback, memory-feature feedback, post-compaction feedback) all share one state machine via `useSurveyState`. Probability/turn/time gates are read from a remote feature-flag service (`useDynamicConfig` for `tengu_feedback_survey_config`, `tengu_bad_survey_transcript_ask_config`, `tengu_good_survey_transcript_ask_config`, GrowthBook gates `tengu_dunwich_bell` and `tengu_post_compact_survey`).

### TranscriptSharePrompt.tsx (88 LOC)

Tiny Ink prompt asking "Can Anthropic look at your session transcript?" with `1: Yes`, `2: No`, `3: Don't ask again`. Reads single digits via `useDebouncedDigitInput` so users typing `"1. First item"` don't accidentally submit (`/Users/siddhartha/Desktop/reference/src/components/FeedbackSurvey/TranscriptSharePrompt.tsx:1-87`). The response type `'yes' | 'no' | 'dont_ask_again'` is reused by all three surveys.

### useDebouncedDigitInput.ts (82 LOC, plain TS)

**Reusable input pattern.** Watches `inputValue` for a single trailing digit, debounces 400ms (`/Users/siddhartha/Desktop/reference/src/components/FeedbackSurvey/useDebouncedDigitInput.ts:8`), trims the digit from the input, and fires `onDigit`. Uses **latest-ref pattern** (`callbacksRef`, line 41-42) so callers can pass inline closures without resetting the debounce timer. Normalizes full-width digits via `normalizeFullWidthDigits` (line 55) — gives JP/CN keyboard users a working numeric flow. `once` and `enabled` flags. **Lift-target.**

### useFeedbackSurvey.tsx (295 LOC)

The central session-feedback hook. Contract (lines 43-47): takes `messages`, `isLoading`, `submitCount`, `surveyType` (`'session'`), `hasActivePrompt`. Returns `{state, lastResponse, handleSelect, handleTranscriptSelect}`. Pacing (lines 30-39): `minTimeBeforeFeedbackMs=600000` (10 min), `minTimeBetweenFeedbackMs=3600000` (1 h), `minTimeBetweenGlobalFeedbackMs=100000000` (~28 h cross-session), `minUserTurnsBeforeFeedback=5`, `minUserTurnsBetweenFeedback=10`, `hideThanksAfterMs=3000`, `probability=0.005`. Probability is **rolled once per eligibility window** via `probabilityPassedRef` (lines 263-268) — without this, repeated `useMemo` re-evaluations would make the survey near-certain to appear after enough renders. Transcript-share probability gate is **separate per rating** (`badTranscriptAskConfig` vs `goodTranscriptAskConfig`, lines 141-142), so Anthropic can ask for transcripts more aggressively after `bad` ratings. Persists `feedbackSurveyState.lastShownTime` in the global config (lines 86-89). Filesystem read is deferred to last (line 277 comment). Telemetry: `tengu_feedback_survey_event` + OTel `feedback_survey`.

### useMemorySurvey.tsx (212 LOC)

Triggers only on assistant turns whose text matches `/\bmemor(?:y|ies)\b/i` (line 23) AND a memory-file read was observed earlier in the session (`hasMemoryFileRead` scan, lines 24-46). Once a memory read is observed, `memoryReadSeen.current = true` and the O(n) scan never runs again — turn-O(1) thereafter. Uses `seenAssistantUuids` set (line 59) to skip already-evaluated turns. Survey probability 0.2. Reset on `/clear` (lines 159-163).

### usePostCompactSurvey.tsx (205 LOC)

Triggers after a compaction boundary if a user/assistant message arrives after it (`hasMessageAfterBoundary`, lines 17-31). 0.2 probability. Pending-boundary state (`pendingCompactBoundaryUuid.current`) survives until the next post-compaction message arrives. Telemetry includes `session_memory_compaction_enabled` (lines 184, 198) so Anthropic correlates feedback with the compaction-strategy A/B.

### useSurveyState.tsx (99 LOC) — **core lift-target**

Six-state machine: `'closed' | 'open' | 'thanks' | 'transcript_prompt' | 'submitting' | 'submitted'`. Handles the optional transcript-prompt branch and the optional async-submit branch (lines 68-91). `appearanceId` is a fresh `randomUUID()` per `open()` so analytics dedupe per-appearance. Returns `{state, lastResponse, open, handleSelect, handleTranscriptSelect}`. Submit failures gracefully fall back to the thanks state (line 81). Three callback hooks (`onOpen`, `onSelect`, `shouldShowTranscriptPrompt`/`onTranscriptPromptShown`/`onTranscriptSelect`) make this generic across all three surveys.

---

## 2. FileEdit family — four files (102-105)

The diff-rendering pipeline for file-edit tool calls.

### FileEditToolDiff.tsx (180 LOC)

Suspense-bounded loader that reads the on-disk file, runs `structuredPatch`, and renders via `StructuredDiffList`. **Memory-conscious large-edit handling** (`/Users/siddhartha/Desktop/reference/src/components/FileEditToolDiff.tsx:113-115`): if the user passes the entire file as `old_string` (`length >= CHUNK_SIZE`), skip the file read — diff the inputs directly to avoid an O(needle) overlap-buffer allocation. `scanForContext` uses streaming reads with a windowed context (`CONTEXT_LINES`) for single-edit cases (lines 138-152); multi-edit + empty `old_string` fall back to full-file read (line 124). `normalizeEdit` (lines 172-179) calls `findActualString` + `preserveQuoteStyle` so the displayed diff matches the file's exact whitespace/quote style. **Lift-target.**

### FileEditToolUpdatedMessage.tsx (123 LOC)

Renders "Added X lines, removed Y lines" summary with proper plural agreement; counts lines starting with `+`/`-` per hunk (lines 32-33, 112-119). Has `condensed` style and `verbose` flag — condensed renders only the summary text, verbose includes the full `<StructuredDiffList>` (lines 76-78, 87-99).

### FileEditToolUseRejectedMessage.tsx (169 LOC)

Renders rejected edits with subtle color, "User rejected write/update to <path>" prefix (line 41), supports both `write` operations (renders `HighlightedCode` with first 10 lines) and `update` operations (renders dim-color diff). MAX_LINES_TO_RENDER=10 (line 11) before truncation hint.

### FilePathLink.tsx (42 LOC)

**OSC 8 hyperlink for file paths.** Wraps a `Link` with `pathToFileURL(filePath).href` so iTerm and modern terminals identify file paths even inside parentheses. Tiny but reused everywhere (Markdown, AttachmentMessage, SystemTextMessage). **Lift-target — every TUI surface should support this.**

---

## 3. FullscreenLayout.tsx (636 LOC) — **architectural cornerstone**

This is the layout shell that owns:

- The scroll box for transcript content (`ScrollBox` from `ink/components/ScrollBox`)
- The bottom slot (PromptInput goes here)
- The `overlay` slot (PermissionRequest renders inside the scroll area)
- The `bottomFloat` slot (companion speech bubble, absolute-positioned bottom-right of scroll)
- The `modal` slot (slash-command dialogs that paint over both scroll AND bottom)
- A "N new messages" pill that appears when scrolled away from bottom
- A sticky-prompt header pinned above the scroll viewport showing the prompt of the turn you're scrolled into
- Slash-command suggestion + dialog overlays portaled from PromptInput via `PromptOverlayProvider`

Three exported APIs:

### `useUnseenDivider(messageCount)` — lines 86-190

Tracks the divider position when user scrolls away from the bottom. State: `dividerIndex` (which message index the divider sits on) plus `dividerYRef` (the snapshot scrollHeight at first scroll-away — pixel y-position of the divider in content coords). Snapshots on **first** scroll-away only (lines 141-145) so subsequent PageUps don't reset the count. `onRepin` clears `dividerIndex` (line 124) but **not** `dividerYRef` immediately — the ref is cleared in a subsequent useEffect (lines 168-175) so a wheel event racing in the same stdin batch can't see null and re-snapshot. `jumpToNew` calls `scrollToBottom()` (not `scrollTo(dividerY)`) so sticky-scroll re-engages and clamping works correctly (lines 147-157). `shiftDivider` adjusts both index and y when messages prepend (infinite scroll-back).

### `countUnseenAssistantTurns(messages, dividerIndex)` — lines 200-216

Counts user-perceived "new messages" in `messages[dividerIndex..end)`. A turn = a non-assistant→assistant transition for entries that **carry visible text** (lines 209-212). `tool_use`-only assistant entries and progress messages are skipped — without this, a long search/read sequence would tick the pill before Claude's text response ever lands.

### `computeUnseenDivider(messages, dividerIndex)` — lines 239-256

Builds the divider object passed to Messages + the pill. `count` is `Math.max(1, count)` (line 254) so the pill flips from "Jump to bottom" → "1 new message" the instant ANY content arrives — even tool_use that `countUnseenAssistantTurns` skips — preventing the dead zone where users thought chat had stalled.

### `<FullscreenLayout>` component — lines 270-459

- Decides fullscreen-on/off via `isFullscreenEnvEnabled()` (line 338). External users default OFF (`CLAUDE_CODE_NO_FLICKER=1` to opt in); ants default ON.
- Subscribes to ScrollBox via `useSyncExternalStore(subscribe, t6)` (lines 305-329) for `pillVisible` — scrolling never re-renders REPL.
- The "N new messages" pill (`NewMessagesPill`, lines 491-537) is absolute-positioned at `bottom={0}` of the scrollwrap, hover state changes background. Slack-style.
- The sticky-prompt header (`StickyPromptHeader`, lines 551-589) is **fixed at height=1 row**, not variable: a wrapped 2-row prompt would shift the ScrollBox top each time the sticky text changes during scroll, breaking the diff renderer. Truncate-end keeps chrome stable.
- `onHyperlinkClick` is wired at the Ink instance level (lines 481-489): `file:` URLs route through `openPath`, others through `openBrowser`.
- `SuggestionsOverlay` and `DialogOverlay` (lines 599-635) read from `PromptOverlayContext` so PromptInput can portal its slash-command dropdown into a position-absolute container above the bottom slot, escaping the bottom slot's overflow-clip.

This is the layout PromptInput renders inside; chunk 2 captures it but not PromptInput itself.

---

## 4. GlobalSearchDialog.tsx (342 LOC) — workspace search

Bound to ctrl+shift+f / cmd+shift+f. Wraps `<FuzzyPicker>` with debounced ripgrep (`/Users/siddhartha/Desktop/reference/src/components/GlobalSearchDialog.tsx:38, 28`):

- `DEBOUNCE_MS=100`, `VISIBLE_RESULTS=12`, `PREVIEW_CONTEXT_LINES=4`, `MAX_MATCHES_PER_FILE=10` (rg `-m`), `MAX_TOTAL_MATCHES=500` global cap (lines 28-32).
- `previewOnRight` triggers when terminal width ≥ 140; otherwise preview goes below.
- Streaming results via `ripGrepStream(['-n','--no-heading','-i','-m', String(MAX_MATCHES_PER_FILE), '-F','-e', query], cwd, signal, lines => {…})` (line 268). Pure literal-string search (`-F`), case-insensitive, deduplicates against existing matches via a `Set(matchKey)` (lines 290-297).
- Optimistic filter while typing: existing matches are filtered down before the new query runs (lines 142-146) so the visible list shrinks instantly.
- On select: `openFileInExternalEditor(absolute, line)` (line 161), with telemetry `tengu_global_search_select` recording `result_count` and `opened_editor`.
- Tab inserts as `@path#Lline ` mention; Shift-Tab inserts as `path:line ` plain (lines 196-216) — clever dual modifier to differentiate "reference for AI" vs "literal path".
- `parseRipgrepLine` (lines 331-341) is exported for testing; uses `^(.*?):(\d+):(.*)$` (handles Windows `C:\…` drive letters that a naive `:` split would mangle).

**Lift-target.** This is the single best workspace-search-from-composer pattern.

---

## 5. grove/Grove.tsx (462 LOC) — privacy/terms dialog

Pre-Oct-8-2025 grace-period & post-grace-period UX for the consumer-terms update around the "Help improve Claude" training-data toggle. Renders `<GracePeriodContentBody>` or `<PostGracePeriodContentBody>` depending on `groveConfig.notice_is_grace_period`. Logs five distinct telemetry events: `tengu_grove_policy_viewed`, `tengu_grove_policy_submitted` (with `state` boolean), `tengu_grove_policy_dismissed`, `tengu_grove_policy_escaped`, `tengu_grove_privacy_settings_viewed`. ASCII-art `NEW_TERMS` envelope (lines 16-26) for visual emphasis. The `domain_excluded` branch hides the opt-IN option (lines 237-246) for users on email domains where Anthropic isn't allowed to train. `PrivacySettingsDialog` (lines 357-461) is the post-acceptance toggle — Tab/Enter/Space to flip; the `domainExcluded` lock greys the value and removes the toggle hint.

---

## 6. HelpV2/ — three files (109-111)

### HelpV2.tsx (183 LOC)

Tabbed help dialog. Tabs: `general` (the General component below), `commands` (built-ins via `Commands`), `custom-commands`, plus an `[ant-only]` tab gated on a constant-false flag (lines 114-127, dead in OSS). Reads `builtInCommandNames()`, splits into `builtinCommands` / `customCommands` / `antOnlyCommands` (lines 58-78). Bound to `help:dismiss` keybinding with `dismissShortcut` displayed in the inputGuide footer.

### General.tsx (22 LOC)

Tiny — renders the welcome blurb plus `<PromptInputHelpMenu gap={2} fixedWidth={true} />` (the keyboard-shortcut grid). PromptInputHelpMenu is the canonical shortcut reference (used in chunk 3).

### Commands.tsx (81 LOC)

Renders a `Select` with one row per command (`/name` + `truncate(formatDescriptionWithSource(cmd), maxWidth, true)`). De-duplicates by name (`seen` Set, lines 35-53). `useTabHeaderFocus` integration for tab navigation. `disableSelection={true}, hideIndexes={true}, layout="compact-vertical"`. `onUpFromFirstItem={focusHeader}` lets you arrow-up from the first command back to the tab bar.

---

## 7. HighlightedCode + HistorySearchDialog (112-115)

### HighlightedCode.tsx (189 LOC)

Memoized syntax-highlighting wrapper. **Three-tier rendering** (`/Users/siddhartha/Desktop/reference/src/components/HighlightedCode.tsx:32-103`): (1) `syntaxHighlightingDisabled` setting → return null and let `HighlightedCodeFallback` render plain text. (2) `expectColorFile()` returns a ColorFile constructor → instantiate with `(code, filePath)` and call `colorFile.render(theme, measuredWidth, dim)`. (3) Fallback to `HighlightedCodeFallback`. Auto-measures element width via `measureElement(ref.current)` (lines 65-73) when explicit `width` not provided. Renders **gutter line numbers** in fullscreen mode only (`gutterWidth = lineCount.toString().length + 2`, lines 105-121). Splits each line into `<NoSelect fromLeftEdge>{gutter}</NoSelect>` + `<Text>{content}</Text>` so click-drag selection skips the line-number gutter (lines 137-188).

### HighlightedCode/Fallback.tsx (192 LOC)

Module-level highlight cache (`HL_CACHE_MAX=500`, lines 19-38) keyed by `hashPair(language, code)` — `useMemo` doesn't survive virtual-scroll unmount/remount, and full source strings aren't retained in the key (per #24180 RSS regression fix). Promotion-on-hit makes it LRU-ish. `<Suspense>` for the async `getCliHighlightPromise()` import; falls back to plain ANSI while loading.

### HistorySearchDialog.tsx (117 LOC)

Bash-history search wrapping `<FuzzyPicker>`. **Two-pass match strategy** (lines 65-79): exact substring matches first, then subsequence-fuzzy (`isSubsequence`, lines 111-116) — feels like fzf without the dep. AGE column (`AGE_WIDTH=8`) padded with `formatRelativeTimeAgo` (line 50), allowing right-aligned visual columns. `PREVIEW_ROWS=6` cap with `… +N more lines` overflow. Streams history via `for await (entry of getTimestampedHistory())` (lines 41-58) so large histories never block first paint.

---

## 8. hooks/ — six files (116-121) — read-only hooks browser

The new `/hooks` UI is **read-only**. The old editing UI only handled `command`-type hooks; duplicating the JSON editor for the four hook types (command/prompt/agent/http) would have been a maintenance burden, so users now drill in to view + are directed to settings.json or asked to ask Claude.

- **HooksConfigMenu.tsx (577 LOC)** — root state machine with `mode = 'select-event' | 'select-matcher' | 'select-hook' | 'view-hook'` (lines 37-50). Detects policy-disabled hooks (`disableAllHooks`) and policy-restricted (`allowManagedHooksOnly`) and renders distinct dialogs (lines 281-379). Combines tool names from React tools + MCP tools (line 91) so per-tool matchers can target both. `useSettingsChange` (line 71) re-evaluates policy state when settings.json changes.
- **PromptDialog.tsx (89 LOC)** — generic prompt dialog used by `prompt`-type hooks for user response. Passes through to `PermissionDialog` chrome.
- **SelectEventMode.tsx (126 LOC)** — top-level event picker with `(N)` count badges (line 85). Includes a `restrictedByPolicy` sub-banner (line 48) and an info bar pointing to docs.
- **SelectHookMode.tsx (111 LOC)** — list hooks for a given event+matcher pair, labeled `[command|prompt|agent|http] <command/prompt/url text>` with source-color description (`[user|local|project|enterprise|pluginHook(name)]`).
- **SelectMatcherMode.tsx (143 LOC)** — list matchers for an event with `[sources] matcher_pattern` labels.
- **ViewHookMode.tsx (198 LOC)** — read-only detail card. `getContentFieldLabel` and `getContentFieldValue` (lines 170-197) switch on hook type to display the right primary field. `statusMessage` is shown separately so the detail view always exposes the actual command/prompt/URL.

---

## 9. Ide\* + Idle dialogs (122-126)

### IdeAutoConnectDialog.tsx (153 LOC)

Two dialogs — auto-connect prompt and disable-auto-connect prompt. Persists choice in `getGlobalConfig().autoConnectIde` + `hasIdeAutoConnectDialogBeenShown`. Eligibility helpers `shouldShowAutoConnectDialog` and `shouldShowDisableAutoConnectDialog` (lines 73-76, 150-152) gate by `!isSupportedTerminal()` (i.e., user is in plain Terminal.app, not VS Code/JetBrains).

### IdeOnboardingDialog.tsx (166 LOC)

First-time-from-IDE welcome with platform-specific shortcut hints (`Cmd+Option+K` vs `Ctrl+Alt+K` per `env.platform === 'darwin'`, line 63). Shows installed extension version (`installedVersion` prop). Per-terminal "shown once" via `hasIdeOnboardingBeenShown[terminal]` map (lines 149-165) so users with multiple IDEs see this once each.

### IdeStatusIndicator.tsx (57 LOC)

Renders the `⧉ <selection>` indicator at the right of the prompt: either "⧉ N lines selected" or "⧉ In <basename>". Hidden unless IDE status is `connected` AND there's a real selection.

### IdleReturnDialog.tsx (117 LOC)

**Idle-return UX.** When user returns after `idleMinutes`, shows token count and offers (1) Continue this conversation, (2) Send message as a new conversation (clear), (3) Don't ask me again. `formatIdleDuration` outputs `< 1m` / `Nm` / `Nh` / `Nh Nm` (lines 104-117).

### InterruptedByUser.tsx (14 LOC)

One-line "Interrupted · What should Claude do instead?" message with `[ANT-ONLY]` /issue alternative gated on a constant-false flag.

---

## 10. Invalid\* + Keybinding dialogs (127-129)

### InvalidConfigDialog.tsx (155 LOC)

Bootstraps a fresh Ink render context (`render(<AppStateProvider>…`, line 137) with a hardcoded `SAFE_ERROR_THEME_NAME = 'dark'` (line 120) — avoids circular dep on `getGlobalConfig()` when the config itself is unparseable. Two options: exit (process.exit(1)) or reset (writes `error.defaultConfig` to the file then exits 0). Pattern to copy when bootstrapping error UIs over a broken config.

### InvalidSettingsDialog.tsx (88 LOC)

Renders `<ValidationErrorsList>` of settings errors. Two options: exit-and-fix vs continue-without-these-settings. Footer "Files with errors are skipped entirely, not just the invalid settings" (line 51) is the key UX clarification.

### KeybindingWarnings.tsx (54 LOC)

Persistent in-UI banner of `getCachedKeybindingWarnings()` errors/warnings. Gated on `isKeybindingCustomizationEnabled()` (ants-only + feature gate). Splits errors vs warnings, shows path to `~/.claude/keybindings.json`, prefixes each row with `[Error]` or `[Warning]` and an indented `→ <suggestion>` hint.

---

## 11. LanguagePicker.tsx (85 LOC) — entry 130

`<TextInput>`-driven prompt for response/voice language. Placeholder: `e.g., Japanese, 日本語, Español…`. Bound to `confirm:no` to exit; trims on submit. Footer "Leave empty for default (English)".

---

## 12. LogoV2/ — fifteen files (131-145)

The boot-time logo + onboarding feed. Two layouts: full (with feed columns) and condensed (just the Clawd mascot + 3 lines of text).

### LogoV2.tsx (543 LOC)

Auto-switches between full and condensed (line 179): condensed iff no release notes AND no project onboarding AND `CLAUDE_CODE_FORCE_FULL_LOGO` not set. **Five feed configurations** (lines 12, 39-41) chosen by state: project-onboarding, what's-new, recent-activity, guest-passes upsell, overage-credit upsell. Tree-shaking pattern: `ChannelsNoticeModule = feature('KAIROS') || feature('KAIROS_CHANNELS') ? require('./ChannelsNotice.js') : null` (lines 30-37) — module-scope conditional require so external builds DCE the entire file.

### CondensedLogo.tsx (160 LOC)

Three-line right-side text: `Claude Code v<version>`, model + billing (split if narrow), agent + cwd. Uses `useShowGuestPassesUpsell` + `useShowOverageCreditUpsell` to decide upsell rendering, and `incrementGuestPassesSeenCount`/`incrementOverageCreditUpsellSeenCount` (lines 39-71) — frequency-capped upsells.

### Clawd.tsx (240 LOC) + AnimatedClawd.tsx (123 LOC)

Clawd is the mascot ASCII, with poses `default | arms-up | look-right | look-left`. AnimatedClawd wraps Clawd in a fixed-height-3 container so layout never shifts during animation. Click handler triggers one of two random animations (`JUMP_WAVE` = crouch+spring×2, `LOOK_AROUND` = glance right→left→default), driven by setTimeout chains at `FRAME_MS=60`. **Reduced-motion respected** (line 99: `getInitialSettings().prefersReducedMotion`).

### AnimatedAsterisk.tsx (49 LOC)

Spinning rainbow asterisk for ~3s (`SWEEP_DURATION_MS=1500 × SWEEP_COUNT=2`), then settles to `SETTLED_GREY = rgb(153,153,153)`. Uses `useAnimationFrame` (Ink hook) — pauses automatically when offscreen. Cycles hue 0→360 at elapsed/SWEEP_DURATION × 360 % 360.

### Other LogoV2 files

- **WelcomeV2.tsx (433 LOC)** — full ASCII welcome banner with dark/light theme variants. Apple_Terminal gets a separate stripped variant (`AppleTerminalWelcomeV2`) because Terminal.app has poor support for the Unicode block characters used. `WELCOME_V2_WIDTH=58`.
- **Feed.tsx (112 LOC) + FeedColumn.tsx (59 LOC) + feedConfigs.tsx (92 LOC)** — the feed pattern: each "feed" is `{title, items[]}`, scrollable column. `feedConfigs.tsx` exports `createRecentActivityFeed`, `createWhatsNewFeed`, `createProjectOnboardingFeed`, `createGuestPassesFeed` factories.
- **EmergencyTip.tsx (58 LOC), VoiceModeNotice.tsx (68 LOC), Opus1mMergeNotice.tsx (55 LOC), ChannelsNotice.tsx (266 LOC)** — first-run notices with frequency caps.
- **GuestPassesUpsell.tsx (70 LOC) + OverageCreditUpsell.tsx (166 LOC)** — paid-tier nudges. `useShowGuestPassesUpsell` reads telemetry + tier; `incrementGuestPassesSeenCount` persists in global config.

---

## 13. LogSelector.tsx (1,575 LOC) — entry 146

The biggest single file in chunk 2. (Read partial.) Multi-tab session-log browser used by `/resume`. Powered by `<FuzzyPicker>` and the unified design-system list primitives. Critical pattern: streams logs from disk, paginated, with preview pane.

## 14. LspRecommendation/LspRecommendationMenu.tsx (88 LOC) — entry 147

Promotes installing a missing LSP server based on the current working directory's languages. Lightweight Select with one row per recommended LSP.

## 15. ManagedSettingsSecurityDialog/ — two files (148-149)

`utils.ts` (144 LOC) defines security-warning text + checks for managed-settings + paths/permissions. `ManagedSettingsSecurityDialog.tsx` (149 LOC) is the warning that appears when a managed settings file is detected — prompts user to acknowledge or exit before continuing.

---

## 16. Markdown.tsx (235 LOC) + MarkdownTable.tsx (321 LOC) — entries 150-151

The markdown rendering pipeline. Two innovations worth lifting wholesale.

### Markdown.tsx — caching + streaming

1. **Plain-text fast path** (`/Users/siddhartha/Desktop/reference/src/components/Markdown.tsx:31-36, 42-53`): `MD_SYNTAX_RE = /[#*\`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /`runs on first 500 chars; if no markdown markers → skip`marked.lexer` (~3ms) and synthesize a single paragraph token. Cuts the hot path for short user prompts and tool output tails.
2. **Module-level token cache** (`TOKEN_CACHE_MAX=500`, lines 22-71): keyed by `hashContent(content)` (NOT content directly — RSS regression fix #24180). Promote-on-hit gives LRU semantics. Memory-bounded.
3. **Streaming markdown** (`StreamingMarkdown`, lines 186-235): boundary-tracking pattern. Splits at the **last top-level block boundary** — everything before is stable (`stablePrefix` memoized inside `<Markdown>`, never re-parsed); only the unstable suffix re-lexes per delta. Boundary advances monotonically (idempotent under StrictMode double-render). `'use no memo'` directive (line 194) — opts out of React Compiler because the algorithm reads/writes ref during render. **Lift-target — the cleanest streaming-markdown architecture I've seen.**
4. **Hybrid rendering** (lines 132-160): Tables go through `<MarkdownTable>` (React component, flexbox-aware layout); everything else goes through `formatToken` to ANSI string + `<Ansi>`. Each ANSI block trimmed, all spliced via `flushNonTableContent`.

### MarkdownTable.tsx — terminal-aware layout

- **Three-stage column-width algorithm** (`/Users/siddhartha/Desktop/reference/src/components/MarkdownTable.tsx:131-156`): (1) min widths from longest word, (2) ideal widths from full content, (3) if total ideal fits → ideal; else if total min fits → min plus proportional extra; else hard-wrap proportionally to fit terminal.
- **`MAX_ROW_LINES=4`** threshold (line 25): if wrapping makes rows taller than 4 lines, switch to vertical (key-value) format for readability.
- **Safety margin = 4** (line 15) — without buffer, terminal-resize races caused infinite-flicker loops where Ink's clip truncated differently on alternating frames. Hard-learned.
- ANSI-aware wrap via `wrapAnsi` (line 52) preserves bold/color across line breaks. Strips trailing whitespace before wrapping (line 51) — `formatToken` adds EOL that would otherwise create blank lines in cells.

---

## 17. mcp/ — fourteen files (152-165) + 4 top-level MCP\* files (166-169)

The MCP server browser/manager UI. Three-level navigation: list → server-detail → tool-list/tool-detail.

- **mcp/index.ts** (9 LOC) — barrel exports.
- **MCPListPanel.tsx (504 LOC)** — top of MCP UI. Groups servers by `ConfigScope`: `'project' | 'local' | 'user' | 'enterprise'` plus `'dynamic'` (built-in) (`/Users/siddhartha/Desktop/reference/src/components/mcp/MCPListPanel.tsx:36-90`). Each scope has its own heading with config file path (`describeMcpConfigFilePath(scope)`). Server entries are sorted alphabetically within scope, can be combined with `agentServers` (servers exposed by sub-agents).
- **MCPSettings.tsx (398 LOC)** — orchestrates the multi-screen view-state machine: `'list' | 'remote-server' | 'stdio-server' | 'agent-server' | 'tool-list' | 'tool-detail'`. Per-server transport (`'sse' | 'http' | 'stdio' | 'claudeai-proxy'`) controls which detail view loads. Auth detection (lines 76-83): SSE/HTTP servers get `ClaudeAuthProvider(name, config).tokens()` to determine `isAuthenticated`, OR session-ingress auth, OR "has tools and is connected" (heuristic for managed-cloud servers).
- **MCPRemoteServerMenu.tsx (649 LOC)** — biggest server-menu file. Handles auth flows, scope selection, JSON config editor, capabilities display.
- **MCPStdioServerMenu.tsx (177 LOC) + MCPAgentServerMenu.tsx (183 LOC)** — transport-specific menus.
- **MCPToolDetailView.tsx (212 LOC) + MCPToolListView.tsx (141 LOC)** — Tool browser. ToolListView annotates tools with `read-only` (success color), `destructive` (error color), `open-world` (`/Users/siddhartha/Desktop/reference/src/components/mcp/MCPToolListView.tsx:60-79`). Critical for users to scan dangerous tools.
- **CapabilitiesSection.tsx (60 LOC)** — `Capabilities: tools, resources, prompts` byline.
- **ElicitationDialog.tsx (1,169 LOC)** — biggest in chunk 2. The MCP elicitation dialog: an MCP server can request input from the user via the elicitation spec, and this dialog renders dynamic JSON-Schema forms (text/number/boolean/select/multi-select) within Ink. Major architectural piece — equivalent to OpenAI's "function args UI" but server-driven.
- **McpParsingWarnings.tsx (213 LOC)** — persistent in-UI banner for malformed MCP configs.
- **MCPReconnect.tsx (167 LOC) + utils/reconnectHelpers.tsx (49 LOC)** — manual reconnect button with state machine (`connecting | connected | error`).
- **MCPServerApprovalDialog.tsx (115 LOC)** — first-time-server approval ("Allow Claude Code to connect to <server>?").
- **MCPServerDesktopImportDialog.tsx (203 LOC)** — imports MCP servers from the Claude Desktop config file.
- **MCPServerMultiselectDialog.tsx (133 LOC)** — multi-select for bulk enable/disable.

---

## 18. memory/ + MemoryUsageIndicator (170-172)

- **MemoryFileSelector.tsx (438 LOC)** — picker for `~/.claude/memory/` files used by the `Memory` tool, with create/rename/delete inline.
- **MemoryUpdateNotification.tsx (45 LOC)** — small toast when memory file changes.
- **MemoryUsageIndicator.tsx (37 LOC)** — Bytes-used indicator for memory files in the prompt footer.

---

## 19. Message.tsx + MessageRow + MessageResponse + MessageModel + Messages (173-177)

The transcript-rendering core.

### Message.tsx (627 LOC)

Top-level dispatch on `message.type`: `'attachment' | 'assistant' | 'user' | 'system' | 'grouped_tool_use' | 'collapsed_read_search'` (`/Users/siddhartha/Desktop/reference/src/components/Message.tsx:82`). For assistant messages, iterates `message.message.content` rendering each block via `<AssistantMessageBlock>` (lines 102-122) which dispatches to `AssistantTextMessage`, `AssistantThinkingMessage`, `AssistantRedactedThinkingMessage`, `AssistantToolUseMessage`, `AdvisorMessage` per `param.type`. Separate `hasThinkingContent(message)` helper exported for caller logic. The `lookups` prop bundles `resolvedToolUseIDs`, `erroredToolUseIDs`, `progressMessagesByToolUseID`, `inProgressHookCounts`, `resolvedHookCounts`, `toolResultByToolUseID` — pre-computed per-render maps that avoid O(n) scans inside leaf components.

### MessageRow.tsx (383 LOC)

Wraps `<Message>` with `<MessageModel>`, `<MessageTimestamp>`, animation gating, and `OffscreenFreeze` (skip re-render when not visible). Exports `hasContentAfterIndex(messages, index, tools, streamingToolUseIDs)` (lines 50-92) — scans forward to decide if a collapsed read/search group should remain in active state. Exists outside the component so React Compiler doesn't pin the full `renderableMessages` array in the fiber's memoCache (≈1-2MB over a 7-turn session — explicit cited concern, line 47).

### MessageResponse.tsx (77 LOC)

The `⎿  ` indented child-message wrapper. Self-aware via `MessageResponseContext` — nesting two `<MessageResponse>` doesn't double-render the `⎿`. Wraps in `<Ratchet lock="offscreen">` for absolute-position stability when offscreen.

### MessageModel.tsx (42 LOC)

Tiny — renders the model name in transcript mode only, only for assistant messages with text content. `minWidth = stringWidth(modelName) + 8` keeps columns aligned.

### Messages.tsx (834 LOC) — also large; partial read

Filters `messages` through `isNullRenderingAttachment` (defined in `nullRenderingAttachments.ts`) BEFORE applying the 200-message render cap, so 30+ invisible attachment types (hook_success, command_permissions, plan_mode, todo_reminder, etc.) don't eat into the budget (CC-724). Exposes `shouldRenderStatically` for static-mode optimization.

---

## 20. messages/ — 19 files (178-195)

The per-block / per-message-type render registry.

### Tool-call rendering (verbose path)

- **AssistantToolUseMessage.tsx (368 LOC)** — Renders a tool_use block. Branch for `isTransparentWrapper` (lines 123-156) — some tools render only a progress message, no card. Detects `isClassifierChecking` (auto-mode permission classifier in flight). `useSelectedMessageBg` (line 53) integrates with the message-actions selection model. Calls `tool.userFacingName(parsedInput)`, `tool.renderToolUseMessage(parsedInput)`, `tool.renderToolUseTag(parsedInput)` etc — all the per-tool customization plumbing.
- **GroupedToolUseContent.tsx (57 LOC)** — When N consecutive tool_use of the same tool name happen (e.g., ten Read calls), the tool's `renderGroupedToolUse` callback gets a flat list of `{param, isResolved, isError, isInProgress, progressMessages, result}` entries — tool decides how to fold (e.g., "Read 10 files" with toggle).
- **CollapsedReadSearchContent.tsx (484 LOC)** — Renders the `⏺ Searched for 13 patterns, read 6 files` summaries. Active-group state uses present-tense verbs ("Reading…", "Searching…"); resolved uses past-tense ("Read", "Searched"). MIN_HINT_DISPLAY_MS=700 holds each progress hint visible long enough to read on fast tools. Loads `teamMemCollapsed.tsx` (139 LOC, entry 195) only when `feature('TEAMMEM')` so external builds DCE.
- **HookProgressMessage.tsx (115 LOC)** — Rendered inline while a hook is running mid-tool. Distinguishes `PreToolUse|PostToolUse` (only shown in transcript mode, "N hooks ran") from other events (always shown, "Running N hooks…").
- **AdvisorMessage.tsx (157 LOC)** — Server-tool-use rendering for the Advisor feature: "Advising using <model>" with input preview, then either `advisor_result`, `advisor_redacted_result`, or `advisor_tool_result_error` body.

### Assistant text/thinking

- **AssistantTextMessage.tsx (270 LOC)** — Routes text by detection: rate-limit messages → `<RateLimitMessage>`; the static error-string constants (PROMPT*TOO_LONG, INVALID_API_KEY, ORG_DISABLED*\*, TOKEN_REVOKED, API_TIMEOUT, CREDIT_BALANCE_TOO_LOW, ERROR_MESSAGE_USER_ABORT) → custom error renderers; everything else → `<Markdown>`. The error-routing pattern is **lift-worthy** — surface-specific errors get tailored remediation text inline instead of a generic banner. Examples: PROMPT_TOO_LONG → "/compact or /clear to continue · upgrade hint"; INVALID_API_KEY → checks `isMacOsKeychainLocked()` and shows `security unlock-keychain` hint; CREDIT_BALANCE_TOO_LOW → `https://platform.claude.com/settings/billing` link.
- **AssistantThinkingMessage.tsx (85 LOC)** — Collapsed: italic dim "∴ Thinking <CtrlOToExpand>". Verbose/transcript: "∴ Thinking…" header + indented `<Markdown dimColor>` of the thinking content.
- **AssistantRedactedThinkingMessage.tsx (30 LOC)** — Even smaller: just `✻ Thinking…` italic.
- **HighlightedThinkingText.tsx (160 LOC)** — Rainbow-colored ultrathink trigger phrases (`findThinkingTriggerPositions(text)`) embedded in user-prompt rendering when `isUltrathinkEnabled()`. Per-character `getRainbowColor(i - t.start)` (line 124).

### Attachments + System

- **AttachmentMessage.tsx (536 LOC)** — Massive switch over attachment.type. Special case at top: `teammate_mailbox` filters out idle/terminated entries before counting (lines 51-62) so "2 messages in mailbox" matches what's visually shown. Different renderers for task_assignment, plan_approval, shutdown_request, shutdown_rejected, plain teammate text; image attachments → `<UserImageMessage>`; text attachments → `<UserTextMessage>`. `feature('EXPERIMENTAL_SKILL_SEARCH')`-gated `IS_DEMO` env mode (lines 44-46) shows demo attachments with a useMemo-at-mount.
- **SystemTextMessage.tsx (827 LOC)** — Subtype switch: `turn_duration`, `memory_saved`, `away_summary`, `agents_killed`, `bridge_status`, `thinking`, plus the default. Each subtype gets its own dedicated renderer with subtype-specific telemetry/UX. Background highlighting via `useSelectedMessageBg`.
- **SystemAPIErrorMessage.tsx (140 LOC)** — Retry countdown via `useInterval` with countdown text "Retrying in N seconds… (attempt R/M)" + `API_TIMEOUT_MS` hint when set. Hidden until `retryAttempt < 4` (line 27) — early retries are silent, only persistent failures surface.
- **CompactBoundaryMessage.tsx (17 LOC)** — Single-line "✻ Conversation compacted (ctrl+o for history)" using `useShortcutDisplay`.
- **PlanApprovalMessage.tsx (221 LOC)** — Three components: `PlanApprovalRequestDisplay` (planMode-color border, plan content via Markdown, plan file path), `PlanApprovalResponseDisplay` (success-green or error-red border per approved/rejected, with revision instructions). Plus `tryRenderPlanApprovalMessage` and `formatTeammateMessageContent` helpers exported for use by AttachmentMessage and others.
- **RateLimitMessage.tsx (160 LOC)** — Tier-aware upsell: Max 20x users get `/extra-usage` (or `/login` to switch billing); Pro users get `/upgrade`; Team/Enterprise users get `/extra-usage` request flows. Auto-opens the rate-limit options menu via effect when `shouldAutoOpenRateLimitOptionsMenu`.
- **ShutdownMessage.tsx (131 LOC)** — Three variants for the agent-swarm shutdown protocol: ShutdownRequest (warning border), ShutdownRejected (subtle border with feedback), ShutdownApproved (rendered inline by caller).
- **TaskAssignmentMessage.tsx (75 LOC)** — Cyan-bordered card "Task #N assigned by <user>", subject (bold), optional description (dim).
- **nullRenderingAttachments.ts (70 LOC)** — Exports `NULL_RENDERING_TYPES` set (33 attachment types) + `isNullRenderingAttachment(msg)`. Critical filter — hooked into Messages.tsx's pre-render filtering.
- **teamMemCollapsed.tsx (139 LOC)** — Tree-shaken-out by default; renders teamMemory verbs ("Recalling/Recalled N team memories", "Searching/Searched team memories", "Writing/Wrote N team memories") in collapsed read/search rows when `feature('TEAMMEM')`.

---

## 21. Top patterns to lift (TUI / desktop / web)

1. **Streaming-markdown boundary tracking** (`Markdown.tsx:186-235`) — split at last top-level block; memoize stable prefix; re-lex only the unstable suffix. Cleanest pattern; opt-out from React Compiler with `'use no memo'`.
2. **Module-level LRU cache keyed by hash** (`Markdown.tsx:22-71`, `Fallback.tsx:19-38`) — survives virtual-scroll unmount/remount; `Map` insertion order gives FIFO eviction; promote-on-hit gives LRU. Avoid retaining full content strings as keys (RSS regression — explicit comment).
3. **Separation of layout invariants from content** (`FullscreenLayout.tsx:551-589`) — fixed-height sticky-prompt header is a hard-won lesson; variable height shifts the scroll region every prompt change. Pin chrome heights, truncate content.
4. **Message-prefix filtering before render-budget cap** (`messages/nullRenderingAttachments.ts` + Messages.tsx) — invisible attachment types must be filtered out BEFORE the 200-message cap so they don't consume budget. The set is type-checked against `Attachment['type']` so adding a new attachment type without an entry fails typecheck.

---

## 22. Inventory cross-ref: composer features

PromptInput is NOT in this chunk; it's at sort-index 286. However, chunk 2 contains all the **scaffolding PromptInput renders inside or relies on**:

- `FullscreenLayout` provides the bottom slot and the `PromptOverlayProvider` for the slash-command dropdown portal.
- `GlobalSearchDialog` is keybound from the composer (ctrl+shift+f).
- `HistorySearchDialog` is the up-arrow / `ctrl+r` history picker.
- `LanguagePicker` is invoked from the composer settings.
- `IdeStatusIndicator` renders inline at the top-right of the prompt area showing IDE selection.
- `MemoryUsageIndicator` renders in the prompt footer.
- `KeybindingWarnings` and `McpParsingWarnings` render banners above the prompt area.

The chunk-3/4 PromptInput dive will need to reference these as integration points.

---

## 23. Cross-refs to other chunks

- `design-system/Dialog`, `design-system/Pane`, `design-system/Tabs`, `design-system/Byline`, `design-system/KeyboardShortcutHint`, `design-system/FuzzyPicker`, `design-system/LoadingState`, `design-system/Ratchet` — all from a previous (lower-index) components/design-system/ chunk.
- `CustomSelect/{index,select}` — chunk 1.
- `HistorySearchInput`, `PromptInputFooter*`, `PromptInputHelpMenu`, `PromptInputModeIndicator`, `PromptInputQueuedCommands`, `PromptInputStashNotice`, `SandboxPromptFooterHint`, `ShimmeredInput`, `VoiceIndicator`, `inputModes`, `inputPaste`, `Notifications`, `IssueFlagBanner`, `useMaybeTruncateInput`, `usePromptInputPlaceholder`, `useShowFastIconHint`, `useSwarmBanner`, `utils.ts`, **PromptInput.tsx itself** — all in chunks 3+.
- `messages/UserTextMessage`, `messages/UserImageMessage`, `messages/UserToolResultMessage/`, `messages/UserTeammateMessage`, `messages/teamMemSaved` — entries 196+, chunk 3.
- Permission dialogs (`permissions/PermissionDialog`) — chunk 4.
- `StructuredDiffList`, `StructuredDiff/colorDiff` — chunk 4+.
- `ToolUseLoader`, `OffscreenFreeze`, `Ratchet`, `CtrlOToExpand`, `SentryErrorBoundary`, `ToolUseLoader`, `CompactSummary`, `MessageTimestamp`, `VirtualMessageList`, `ConfigurableShortcutHint` — chunk 4+.
- `Spinner/utils` (used by AnimatedAsterisk hueToRgb), `PrBadge` — chunk 4+.

---
