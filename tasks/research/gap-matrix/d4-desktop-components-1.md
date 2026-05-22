# GAP-D4 — Desktop Components, alphabetical 1..150

> **Mission.** Compare AGI Workforce's `apps/desktop/src/components/` entries 1..150 (alphabetical) against the Claude reference (Claude Code TUI's React-on-Ink components, plus Claude Desktop and Claude Artifacts). Output **only what we are missing** or **partially shipping**. Per-axis percentage at the end.
>
> **Scope.** Files 1..150 from `find ~/Desktop/agiworkforce/apps/desktop/src/components -type f -name '*.tsx' -o -name '*.ts' | sort`. Boundary entry: `apps/desktop/src/components/Marketplace/components/WorkflowSearch.tsx`. Total inventory in repo: 611 files; this gap-matrix is the first quarter (24% of file count, but covers the design-system / agent / artifact / browser / calendar / canvas / code / computer-use / connector / dialog / diff / editor / execution / feedback / filesystem / file-upload / floating / git / governance / images / layout / marketplace tracks, which is most of the **chat/agent surface**).
>
> **Method.** Read every relevant deep-dive in `tasks/research/deep/` (c1, c2, c3, c4, m5, ink-vendored-fork, misc2-keybindings) plus the inventory `anthropic-claude-suite-may-2026.md` and the UI deep-dives `ui-01-codex-desktop.md`, `ui-02-claude-desktop.md`, `ui-03-claude-artifacts.md`. For each Claude pattern, locate or fail to locate the AGI Workforce equivalent inside the 150-file slice. Cite repo file:line for what we have, and reference deep-dive `path:line` for what we lack.

---

## 0. Headline

The 150-file slice is wide but shallow. We have a **rich functional surface** (37 directories, ~530 lines of real code per dir on average — ChatInterface, ArtifactPanel, BrowserViewer, ApprovalModal, ExecutionSidecar, etc.) but we are systematically missing the **TUI-grade primitives** that make Claude Code's UI feel like a single product: a typed reusable design-system (Pane / Dialog / Tabs / Byline / KeyboardShortcutHint / FuzzyPicker / ListItem / StatusIcon / Divider / Ratchet / Spinner / OffscreenFreeze), a permission-dialog primitive composition (PermissionDialog + PermissionPrompt + PermissionExplanation + PermissionRuleExplanation), the streaming-markdown / structured-diff renderers, and the keybinding-context engine.

We also lack three big experience layers: **Plan Mode UI** (no proposal panel, no sticky approve/edit/reject footer, no Ctrl+G external editor handoff), **Cowork-style status footer** (locality | permissions | worktree chip cluster), and **artifact viewer parity with Claude Desktop** (single-artifact-in-sidebar with type-aware "Open in {app}" button, Copy / source-toggle / download / X toolbar, chip cards stacked in chat with Download all link, multiple artifacts selectable from chat).

**Top-level diagnosis.** We built features — they need a design-system. The C1 chunk lists 15 design-system primitives (Byline, Dialog, Divider, FuzzyPicker, KeyboardShortcutHint, ListItem, LoadingState, Pane, ProgressBar, Ratchet, StatusIcon, Tabs, ThemedBox, ThemedText, ThemeProvider) reused 60+ times across the suite. Our `apps/desktop/src/components/ui/` ships **shadcn-class** (Button, Popover, ScrollArea, Tabs, Tooltip, DropdownMenu, etc.) — useful, but we have no equivalent of `<Pane>` (chrome around a content card with an automatic Divider), `<Byline>` (period-separated metadata strip), `<KeyboardShortcutHint>` (themable kbd-and-action hint), or `<Ratchet>` (peak-height-locked Box). Cross-component consistency drifts as a result.

---

## 1. Missing — High-Impact (P0)

### M1.1 Streaming-markdown boundary tracking — MISSING

**Claude pattern.** `Markdown.tsx:186-235` (`tasks/research/deep/c2-components-chunk-2.md:228-235`) splits incoming text at the **last top-level block boundary**, memoizes the stable prefix (never re-lexes), re-lexes only the unstable suffix per delta. Adds `'use no memo'` directive (line 194) so React Compiler doesn't break the algorithm. Module-level token cache `TOKEN_CACHE_MAX=500` keyed by `hashContent(content)` (RSS regression fix #24180).
**AGI Workforce.** Our chat surface uses react-markdown + remark-gfm + remark-math + remark-breaks + rehype-highlight + rehype-raw (per `apps/web/features/chat/components/messages/MessageBubble.tsx:44-49` per MEMORY) but does **not** split prefix vs suffix. Streaming long assistant messages re-lexes the entire payload every delta.
**Effort.** 3–5 days for one engineer in `packages/chat`. Needs a hashing util, an LRU cache, and a `<StreamingMarkdown>` wrapper.

### M1.2 Markdown table renderer with terminal-aware layout — MISSING (web is fine; desktop has no tabular renderer)

**Claude pattern.** `MarkdownTable.tsx` (c2 chunk §16). Three-stage column-width algorithm: min widths, ideal widths, hard-wrap proportional to width. `MAX_ROW_LINES=4` threshold switches to vertical key-value layout. Uses `wrapAnsi` to preserve bold/color across line breaks.
**AGI Workforce.** Tables in ChatInterface come from raw react-markdown table renderer with no width budgeting; very wide tables overflow horizontally and force scroll.
**Effort.** 2 days; reuse react-markdown's `components.table` override with `react-virtualized-auto-sizer`.

### M1.3 Unseen-divider pill ("N new messages") — MISSING

**Claude pattern.** `FullscreenLayout.tsx:86-256` (c2 chunk §3). Tracks divider position when user scrolls away from bottom; `dividerYRef` snapshot at first scroll-away only; `countUnseenAssistantTurns` counts non-assistant→assistant transitions for visible-text-bearing entries; `computeUnseenDivider` clamps `count = max(1, count)` so the pill flips to "1 new message" instantly. `jumpToNew` calls `scrollToBottom()` (not `scrollTo(dividerY)`) so sticky-scroll re-engages.
**AGI Workforce.** Chat scroll has no unseen-divider pill — when streaming and the user has scrolled up, there's no affordance to jump back. We do not have `apps/desktop/src/components/Layout/UnseenDivider.tsx` or equivalent.
**Effort.** 2 days. Already need a virtualized scroll container; once we have one, the pill is a 60-line component.

### M1.4 Plan-Mode dialog with sticky approve/edit/reject footer + Ctrl+G external editor — MISSING

**Claude pattern.** `permissions/EnterPlanModePermissionRequest` and `permissions/ExitPlanModePermissionRequest` (c3 chunk §1.4 "Per-tool dialogs"). 8-value `ResponseValue` enum: `yes-bypass-permissions | yes-accept-edits | yes-accept-edits-keep-context | yes-default-keep-context | yes-resume-auto-mode | yes-auto-clear-context | ultraplan | no`. Sticky footer pinned in fullscreen `bottom` slot. Ctrl+G opens the plan in `$EDITOR` for direct edits before approval. Plans persisted to `~/.claude/plans/<slug>` with version numbers; `autoNameSessionFromPlan` fires-and-forgets a Haiku call.
**AGI Workforce.** `apps/desktop/src/components/Planning/` exists, plus `UnifiedAgenticChat/AgentModeSwitcher.tsx:export function useIsPlanMode(): boolean`. But there is no permission dialog, no sticky bottom slot pinning approve/edit/reject options, no Ctrl+G handoff, no plan-file persistence with version numbers.
**Effort.** 5–7 days. Needs the plan persistence layer, an approve dialog primitive, and `$EDITOR` handoff via `child_process.spawn`. This is the single most differentiating Claude Code pattern absent from our desktop.

### M1.5 Permission dialog primitive composition — MISSING

**Claude pattern.** `permissions/PermissionDialog.tsx` + `PermissionPrompt.tsx` + `PermissionExplanation.tsx` + `PermissionRuleExplanation.tsx` + `PermissionRequestTitle.tsx` (c3 chunk §1.4 "Core primitives"). 4-piece kit: Dialog (chrome), Prompt (option select with feedback toggle on accept and reject), Explanation (lazy LLM-backed risk explainer using React 19 `use(promise)` + Suspense; promise created **only on first toggle** so users who never invoke pay zero tokens), RuleExplanation (per-decision-reason renderer for `classifier|rule|hook|safetyCheck|workingDir`).
**AGI Workforce.** `apps/desktop/src/components/Governance/ApprovalModal.tsx` is one approve/reject form with a notes textarea. No primitive composition; no lazy LLM risk explainer; no per-tool subclasses (BashPermissionRequest, FileEditPermissionRequest, FileWritePermissionRequest, NotebookEditPermissionRequest, WebFetchPermissionRequest, SkillPermissionRequest, FilesystemPermissionRequest, ComputerUseApproval).
**Effort.** 2 weeks for one engineer. The lazy explainer is the highest-leverage piece (saves real token cost + adds visible safety affordance).

### M1.6 IDE diff round-trip for FileEdit / FileWrite — MISSING

**Claude pattern.** `permissions/FileEditPermissionRequest` and `FileWritePermissionRequest` (c3 chunk §1.4). `ideDiffSupport.applyChanges` lets the user open the diff in their IDE, modify, and then writes back into `input.content` (or `old_string/new_string/replace_all`). VSCode-family terminals show "Save file to continue…" hint.
**AGI Workforce.** `editing/EnhancedDiffViewer.tsx` and `editing/VisualEditor.tsx` exist but have no IDE handoff. Our `apps/extension-vscode` ships v0.3.0 but the desktop has no contract to send a diff to it for in-IDE editing.
**Effort.** 5 days. Needs IPC contract between desktop and the VS Code extension via the desktopBridge port 8787 channel that already exists.

### M1.7 Tool-call inline rendering with "Used X" group header + chevron — PARTIAL

**Claude pattern.** Every tool sequence wraps in a single past-tense English summary: `Used Filesystem integration, loaded tools v` / `Ran 5 commands, created a file, read a file v` (`ui-03-claude-artifacts.md` §1.1). Sub-steps hidden when collapsed. Each sub-step has a small file-icon + action label + `Result` pill (border-only, no fill). Click pill → expanded Request/Response panel in monospace, no syntax highlighting, two faint `Request` / `Response` headers.
**AGI Workforce.** `Tools/`, `ToolCalling/`, `ExecutionSidecar/` directories show inline tool execution, but rendering is per-card (one card per tool call) with separate icons and explicit "Tool" prefixes. We have **no group header**, **no past-tense summary**, **no Result-pill expand pattern**. ChatInterface tool messages are always-expanded.
**Effort.** 1 week. Needs a grouping layer in `packages/chat` plus a new collapsed-card component.

### M1.8 Reasoning ("Thinking") block default-expanded with clock icon — PARTIAL

**Claude pattern.** Reasoning is rendered as tightly-grouped multi-row block with **clock icon** on left (`AssistantThinkingMessage.tsx`, c2 §20; `ui-03-claude-artifacts.md` §2.1). Group header: short reflective phrase ("Architected ideal candidate profile…", "Refined markdown formatting…") in past tense. Default = **expanded**. Body indented under icon. Multiple reasoning blocks separated by ~24px of whitespace, never with explicit "Step 1 / Step 2".
**AGI Workforce.** Per MEMORY: `ThinkingBlock IS wired into MessageBubble at apps/web/features/chat/components/messages/MessageBubble.tsx:60, 402-405`. Web has it; **desktop chat does not** have an equivalent in our 150-file slice. The icon and past-tense header pattern aren't there. Default-expanded is unverified.
**Effort.** 3 days. Port the web pattern into desktop chat.

### M1.9 FuzzyPicker — MISSING

**Claude pattern.** `design-system/FuzzyPicker.tsx` (c1 chunk §1.6). Generic typed picker. Props: `title, placeholder?, items: readonly T[], getKey, renderItem, renderPreview?, previewPosition? = 'bottom' | 'right', visibleCount? = 8, direction? = 'down' | 'up' (atuin-style), onQueryChange (caller owns filtering!), onSelect, onTab? : { action, handler }, onShiftTab?, onFocus?, onCancel, emptyMessage?, matchLabel?, selectAction? = 'select', extraHints?`. Compact mode toggled at `columns < 120`. Drives `GlobalSearchDialog`, `HistorySearchDialog`, `QuickOpenDialog`, `LogSelector`, `MessageFileSelector`, `LspRecommendationMenu`.
**AGI Workforce.** No FuzzyPicker. No GlobalSearchDialog (Cmd+Shift+F ripgrep). No HistorySearchDialog (up-arrow / Ctrl+R). No QuickOpenDialog (Cmd+Shift+P file fuzzy-open). Search is done one-off in each component.
**Effort.** 5 days for the primitive + 3 days each for the four consumer dialogs. **High leverage** — once shipped, half the tertiary search/picker UI in the app collapses to one component.

### M1.10 Single-artifact-in-sidebar with type-aware "Open in {app}" — MISSING

**Claude pattern.** `ui-03-claude-artifacts.md` §3. Sidebar shows **one artifact at a time, no tab bar**. To switch, click the artifact card in chat. Toolbar layout: left `[eye-icon] [Title] [Subtype]` (e.g. `Code · HTML`), right `[Copy] [code-bracket toggle for source view] [download] [X close]`. Right-side button on the chat card is **type-aware**: `Open in Comet`, `Open in Antigravity`, `Open in TextEdit`, `Open in Preview`. Multiple artifacts → stacked cards in chat with `Download all` link.
**AGI Workforce.** `Artifacts/ArtifactPanel.tsx` and `Artifacts/ArtifactsGallery.tsx` use a tabbed multi-artifact UI. No type-aware "Open in" button. No `Download all`. Toolbar order differs.
**Effort.** 2 weeks. Needs an artifact-type → external-app registry, OS launch handlers (`shell.openPath` via Tauri), and a redesign of the panel toolbar.

### M1.11 Cowork-style status footer (locality | permissions | worktree chip cluster) — MISSING

**Claude pattern.** Codex Desktop status footer (`ui-01-codex-desktop.md` §1). Three chips below the composer: `🖥 Local 6% ⌄` (locality + quota), `⚠ Full access ⌄` (permissions, orange when elevated), `↗ main ⌄` (worktree). One-glance proof "this conversation is isolated".
**AGI Workforce.** `Layout/StatusBar.tsx` exists but does not surface locality / permissions / worktree as per-conversation chips. Composer has model picker but no permission / sandbox-profile chip; no worktree picker. We have backend (Seatbelt + bwrap in `apps/cli/src/sandbox.rs`) but no UI affordance.
**Effort.** 1 week. Three pop-overs over our existing chip pattern, plus a sandbox-profile picker and a git-worktree mutator.

### M1.12 Sticky composer header (truncated current-prompt) — MISSING

**Claude pattern.** `FullscreenLayout.tsx:551-589` "StickyPromptHeader" (c2 §3). Fixed at height=1 row (NOT variable) — a wrapped 2-row prompt would shift the ScrollBox top each time the sticky text changes during scroll. Truncate-end keeps chrome stable.
**AGI Workforce.** No sticky-prompt header in our chat pane. When scrolling deep into a long turn, the user loses context of which prompt they're inside.
**Effort.** 2 days. Needs a derived "current visible turn" hook plus a one-line `<Text wrap="truncate-end">` header.

### M1.13 Compact summary marker after `/compact` — MISSING

**Claude pattern.** `CompactSummary.tsx` (c1 chunk §1.10) renders the auto-generated session-summary marker user message. Two states: collapsed (`MessageResponse` with metadata `Summarized N messages …`, plus optional `Context: "userContext"`, plus `(ctrl+o to expand history)` shortcut), and transcript-expanded (raw `textContent`).
**AGI Workforce.** No `/compact` slash command, no compact-summary message kind in our chat schema. Per MEMORY, our app accumulates context without a manual compact pathway.
**Effort.** 2 weeks (this is also a Rust-side / Tauri command, not just a UI piece — it needs a backend "summarize and replace" call).

### M1.14 OffscreenFreeze + Ratchet for stable scrollback — MISSING

**Claude pattern.** `OffscreenFreeze.tsx:23-43` (c3 chunk §1.3). Visibility-based render bailout. Marked `'use no memo'`. Children that scroll out of view freeze to their last cached element ref. Pairs with `Ratchet.tsx` (c1 §1.6): locks a Box to its peak height with `lock = 'always' | 'offscreen'`, prevents layout flicker when content shrinks-then-grows.
**AGI Workforce.** Our message virtualization story is unclear; we have not adopted these patterns. Long conversations at 1000+ messages are likely re-rendering the entire list per stream tick.
**Effort.** 1 week. Map both to React Native Web / Tauri-Webview-equivalent: `IntersectionObserver` + `useDeferredValue` and a peak-height ref. **High leverage for streaming chat performance.**

### M1.15 Centralized 5-slot FullscreenLayout — MISSING

**Claude pattern.** `<FullscreenLayout>` (m5 §A.11). 5 slots: `scrollable` (transcript), `bottom` (composer + dialogs + spinner), `overlay` (permission requests), `bottomFloat` (Buddy bubble), `modal` (centered local-jsx slash commands). Plus `sticky` (unseen-divider pill) tracked independently. **This is the architectural backbone**, not a feature.
**AGI Workforce.** Our chat layout is composed ad-hoc inside `UnifiedAgenticChat/index.tsx` and `apps/desktop/src/App.tsx`. There is no canonical 5-slot layout, no overlay vs modal distinction, no `bottomFloat` slot, no `sticky` slot.
**Effort.** 3 weeks. This is the foundation that M1.3, M1.4, M1.5, M1.11, M1.12, M1.13 all bolt onto.

---

## 2. Missing — Medium-Impact (P1)

### M2.1 — Design system primitives (KeyboardShortcutHint, Dialog-with-keybindings, ListItem, StatusIcon, ProgressBar block-char, Pane with auto-divider) — MISSING

**Claude.** c1 §1.6: KeyboardShortcutHint (`<Text>{shortcut} to {action}</Text>` with parens/bold), Dialog (137 LOC, built-in `useKeybinding('confirm:no')`, default Byline `Enter to confirm · Esc to cancel`, "Press {key} again to exit" when ctrl+c/d armed), ListItem (universal: `figures.pointer` focused, `figures.tick` selected, `figures.arrowDown/Up` scroll edges, `disabled` blank+inactive), StatusIcon (6-status table at lines 24-52), ProgressBar (8-step block chars `[' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']` with theme keys), Pane (`<Box paddingTop={1}><Divider/><Box paddingX={2}/>` with `useIsInsideModal` drop-divider; `flexShrink=0` is load-bearing — without it Yoga collapses against modal undetermined parent).
**AGI Workforce.** shadcn primitives only. Each dialog hardcodes "Press Enter". Each list rolls its own pointer/tick. Lucide icons direct-imported per consumer. BudgetStatusWidget unverified. Each pane in Settings/Connectors/Marketplace draws its own border.
**Effort.** 1 week for the 6 primitives + 2 weeks of conversion across the slice.

### M2.2 Spinner with stalled-red transition + verb table + glimmer — PARTIAL

**Claude.** c4 §2.12, §7. `useAnimationFrame(50)` clock; stall→red after 3s without tokens, fade over 2s, smooths via `current += diff * 0.1` per tick; reduced-motion skips smoothing. ~190 spinner verbs (`Clauding`, `Combobulating`, `Hyperspacing`). Per-character glimmer via `getGraphemeSegmenter()` (Intl) for emoji safety.
**AGI Workforce.** Basic Spinner. No stalled-red, no verb table, no glimmer, no reduced-motion. **Effort.** 4 days.

### M2.3 OS-native notifications on long-running tools — PARTIAL

`useTerminalNotification` (ink-fork.md §1, §8): bell + iTerm2/Kitty/Ghostty notify + OSC 9;4 progress. Tauri equivalent: `@tauri-apps/api/notification`. `Notifications/` exists; per-tool / approval / completion granularity unverified. **Effort.** 2 days.

### M2.4 BackgroundTasks taxonomy (8 types + master/detail + anti-drift formatter) — PARTIAL

**Claude.** c4 §8.3. 8 task types: `local_bash, remote_agent, local_agent, in_process_teammate, local_workflow, monitor_mcp, dream, leader`. Master/detail with `{mode:'list'} | {mode:'detail', itemId}`. Each task type a detail dialog. `formatToolUseSummary` shared helper (explicit anti-drift comment).
**AGI Workforce.** 2 files vs Claude's 12. No per-type detail dialogs, no shared activity-description, no master/detail mode. **Effort.** 2 weeks.

### M2.5 Calendar / Browser action log / DynamicCanvas / Database / Cloud / Documents — DIFFERENTIATORS (we LEAD)

- `Calendar/` 5 files (Day/Week/Month/Workspace/EventDialog). Claude has no first-party Calendar UI.
- `Browser/` 5 files (action log, replay, debug tabs, viewer, visualization). Claude renders browser inline only.
- `Database/`, `Cloud/`, `Documents/`, `DynamicCanvas/` — Claude relegates to Artifacts / per-connector stubs.
- `ExecutionSidecar/` 7 files (filmstrip, approvals, screen view, terminal, timeline) — on-par with Claude's Cowork activity feed; verify per-pane parity (1d audit).
- `Marketplace/` 13 files for workflow marketplace — much bigger than Claude's CLI `plugin install`. Differentiator IF paid creator economy ships.
- `Governance/` 3 files (AuditEventsList, AuditLog, ToolHistoryTable). **Claude excludes Cowork from Audit Logs / Compliance API / Data Exports.** Real differentiator if we surface real export.

### M2.6 Connectors per-tool 3-tier permissions + custom add-form — PARTIAL

**Claude.** ui-02 §5.2-5.3. Per-category dropdown: `Always allow / Needs approval / Blocked / Custom`. Per-tool icons: ✓ / pause / 🚫. Three-tier granularity (master → category → per-tool). Pre-connect transparency page: developer attribution + full tool list + example use-cases + trust disclaimer **before** OAuth (image 34, ui-02 §5.5).
**AGI Workforce.** `ConnectorCard.tsx:1-60` has Connect/Disconnect/Configure but **no per-tool permission grid, no per-category dropdown, no pre-connect transparency page**. `connectorDefinitions.ts` hardcoded, no UI extension. **Effort.** 1 week + 5 days.

### M2.7 ComputerUse with TCC state branching + sentinel-app blocklist — PARTIAL

**Claude.** c3 §1.4. `request.tccState` → `ComputerUseTccPanel` ("Open System Settings → Accessibility/Screen Recording" with `execFileNoThrow('open', ['x-apple.systempreferences:…?Privacy_Accessibility'])`), else `ComputerUseAppListPanel`. Sentinel-app categories block banking/crypto/healthcare apps by default.
**AGI Workforce.** `ComputerUse/` 4 files. TCC-state handling unverified, no deep-link, no sentinel blocklist. **Effort.** 3d sentinel + 2d TCC deep-link.

### M2.8 Diff infrastructure (DiffDetailView + DiffDialog + DiffFileList + StructuredDiff WeakMap cache) — PARTIAL

**Claude.** c1 §1.8 + c4 §2.16. Two-pane viewer, `MAX_VISIBLE_FILES = 5`, centered viewport, per-turn historical stepping (`DiffSource = {type:'current'} | {type:'turn', turn:TurnDiff}`), word-level diffing + syntax highlighting via `<StructuredDiff>`. `RENDER_CACHE = WeakMap<patch, Map<key, CachedRender>>` keyed on `theme|width|dim|gutterWidth|firstLine|filePath`. NAPI `color-diff-napi` primary; `diffWordsWithSpace` fallback with `CHANGE_THRESHOLD=0.4`.
**AGI Workforce.** Three separate diff renderers (`Code/DiffViewer.tsx`, `editing/EnhancedDiffViewer.tsx`, `Git/GitDiffViewer.tsx`). No viewport, no per-turn stepping, no WeakMap cache, no fallback strategy. **Effort.** 1 week to consolidate + 4 days for cache.

### M2.9 Filesystem-permission diff embedded in approval — MISSING

Claude's `FileEditPermissionRequest` embeds `<FileEditToolDiff>` inside the permission card. Our `Governance/ApprovalModal.tsx` shows `request.summary` text only. **Effort.** 3 days; embed existing DiffViewer.

### M2.10 InlineGhostText for slash-command autocomplete — MISSING

`BaseTextInputProps.inlineGhostText` (misc2 §6.7) lets typed `/` show ghost completion. Our composer uses popover only. **Effort.** 3 days.

### M2.11 Image generation thumbnail in chat — PARTIAL

ui-03 §1.8: 64×80px rounded-rect floats top-right of assistant turn before text; click opens in sidebar. We have `Images/` gallery destination but no per-turn floating thumbnail. **Effort.** 2 days.

### M2.12 ApprovalModal feedback-mode toggle on accept and reject — PARTIAL

c3 §1.4: `feedbackConfig: { type:'accept'|'reject', placeholder? }`. Tab toggles input-type option with freeform text. Defaults: `accept→'tell Claude what to do next'`, `reject→'tell Claude what to do differently'`. Our ApprovalModal is binary. **Effort.** 2 days.

### M2.13 Onboarding step set parity — PARTIAL

c3 §1.3: `'preflight' | 'theme' | 'oauth' | 'api-key' | 'security' | 'terminal-setup'`. Security step uses `OrderedList` with two locked items: "Claude can make mistakes" / "Due to prompt injection risks, only use it with code you trust" + security-docs link. Per MEMORY `OnboardingWizard.tsx` is the canonical mode picker; step list parity unverified. **Effort.** 3 days.

### M2.14 Wizard primitives (Provider + DialogLayout + NavigationFooter + useWizard) — PARTIAL

c4 §12: auto-generated step suffix `(N/M)`, throwing-context-hook pattern, WizardProvider tracks `currentStepIndex/wizardData/isCompleted/navigationHistory`. Each AGI Workforce wizard rolls its own. **Effort.** 1 week to lift into `packages/ui-primitives`.

---

## 3. Missing — Lower-Impact (P2)

Compressed list. Each row = `name — claude-ref-loc — our-state — effort`.

- **OSC 8 file-path hyperlinks → `shell.openPath`** (Tauri analog) — N/A → wire — 1d.
- **Idle-return dialog** (`IdleReturnDialog.tsx`, c2 §9) — MISSING — 2d.
- **$5 cost-threshold dialog** (`CostThresholdDialog.tsx`, c1 §1.10) — MISSING — 1d.
- **`/desktop` slash command DesktopHandoff** (c1 §1.10) — N/A inverse (`/web`, `/mobile` Dispatch) — 3d.
- **BridgeDialog with QR pairing** (c1 §1.10) — PARTIAL via `Mobile/` — 3d.
- **DiagnosticsDisplay compact+verbose** (c1 §1.10) — MISSING — 2d.
- **Effort callout / picker (low/med/high/max)** (`EffortCallout.tsx`, c1 §1.9) — MISSING — 1w.
- **ExportDialog (copy / save)** (c1 §1.10) — MISSING — 2d.
- **Error remediation routing** (`AssistantTextMessage.tsx`, c2 §20) — `Errors/ErrorToast.tsx` PARTIAL, no per-class hint — 1w.
- **KeybindingProvider with chord support** (misc2-keybindings §1; 20-context, 1s chord) — MISSING — 2w. **High-leverage**: every dialog polish becomes free.
- **Vim text input** (`VimTextInput.tsx`, c4 §2.32) — MISSING composer — 2w (or 0 via monaco vim in Editor pane).
- **VoiceIndicator with shimmer** (c4 §1.9) — `Voice/` exists, unverified — 2d.
- **Token-warning banner** (`TokenWarning.tsx`, c4 §2.28) — MISSING — 3d.
- **ValidationErrorsList primitive** (c4 §2.31) — MISSING — 1d.
- **TrustDialog (untrusted directory gate)** (c4 §10.2) — MISSING. Critical when opening a new repo with `.mcp.json` — 1w.
- **WorktreeExitDialog** (c4 §2.35) — MISSING — 3d.
- **Sandbox doctor/dependencies/overrides tabs** (`sandbox/*`, c4 §3) — MISSING UI; backend in `apps/cli/src/sandbox.rs` — 1w.
- **`prefersReducedMotion` respect** — UNKNOWN; needs audit — 1d.
- **Themed raw-color bypass** (c1 §1.6) — PARTIAL via Tailwind — 1d.
- **FloatingChat** (`FloatingChat/index.tsx`) — PARTIAL; Claude has no equivalent — differentiator.
- **Documents + DocumentGenerator workspaces** — Claude relegates to Artifacts — differentiator.
- **Database workspace** — no Claude equivalent — differentiator.
- **Cloud storage panel (unified)** — Claude has per-connector stubs — differentiator.
- **DynamicCanvas (live React re-render)** — novel — differentiator IF stable.

---

## 4. Per-axis percentages (slice 1..150)

Where 100% = "Claude has it shipped, we have it shipped at full parity in this slice." Excludes places we deliberately diverge (multi-provider, BYOK).

| Axis                                                                                                     | Score   | Notes                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend / Design system primitives**                                                                  | **20%** | We have shadcn but no Pane / Byline / KeyboardShortcutHint / Dialog-with-keybinding-glue / FuzzyPicker / ListItem / StatusIcon / Ratchet / OffscreenFreeze / ProgressBar (block char) / ThemedText with raw bypass.                                                                    |
| **UX (composer / placeholder / sticky-prompt / unseen-divider / ghost-text)**                            | **35%** | Composer has multi-provider model picker. Missing inline ghost-text, sticky-prompt header, unseen-divider pill, brief layout.                                                                                                                                                          |
| **Tools rendering (group header, Result-pill, request/response panel, web-search card, citation chips)** | **25%** | Tool calls render but lack the past-tense group-header pattern, the Result-pill, the consistent two-section Request/Response layout.                                                                                                                                                   |
| **Plugins / Skills marketplace**                                                                         | **45%** | Marketplace dirs exist. Per-skill detail page, allowed-tools chip strip, frontmatter-derived metadata: not in slice.                                                                                                                                                                   |
| **Workflow primitives (Wizard, Onboarding multi-step)**                                                  | **40%** | Onboarding exists. Wizard primitive split across surfaces; not unified.                                                                                                                                                                                                                |
| **Permissions / Approvals UI**                                                                           | **20%** | ApprovalModal exists, lacks PermissionDialog/PermissionPrompt/PermissionExplanation/PermissionRuleExplanation primitive composition; lacks per-tool subclasses (BashPermission, FileEditPermission, FileWritePermission, ComputerUseApproval with TCC); lacks lazy LLM risk explainer. |
| **Plan Mode UI**                                                                                         | **5%**  | Hook `useIsPlanMode` exists but no proposal panel, sticky footer, Ctrl+G external editor handoff, plan-file persistence.                                                                                                                                                               |
| **Artifact viewer**                                                                                      | **40%** | ArtifactPanel + Gallery exist. Missing: type-aware "Open in {app}" button, single-artifact-at-a-time sidebar, Download all link, source-toggle/Copy/X toolbar order.                                                                                                                   |
| **Diff / structured-diff**                                                                               | **30%** | Three diff renderers (Code/, editing/, Git/). Missing: WeakMap render cache, NAPI fallback, MAX_VISIBLE_FILES viewport, per-turn historical stepping, word-level highlighting via diffWordsWithSpace.                                                                                  |
| **FullscreenLayout (5-slot architecture)**                                                               | **10%** | Layout is ad-hoc; no canonical scrollable/bottom/overlay/bottomFloat/modal slot system.                                                                                                                                                                                                |
| **Background tasks taxonomy + detail dialogs**                                                           | **30%** | Panel + indicator only. Missing 6 of 8 task-type detail dialogs.                                                                                                                                                                                                                       |
| **Connectors per-tool 3-tier permissions + custom add**                                                  | **25%** | Connector list + cards exist; per-tool grid + Custom add form missing.                                                                                                                                                                                                                 |
| **Status footer (locality / permissions / worktree)**                                                    | **0%**  | None of the three chips.                                                                                                                                                                                                                                                               |
| **Spinner / animation polish (verbs, glimmer, stalled-red, reduced-motion)**                             | **15%** | Basic spinner only.                                                                                                                                                                                                                                                                    |
| **Browser tool replay / action log**                                                                     | **80%** | We LEAD here.                                                                                                                                                                                                                                                                          |
| **Calendar workspace**                                                                                   | **80%** | We LEAD here.                                                                                                                                                                                                                                                                          |
| **Database workspace**                                                                                   | **70%** | We LEAD here.                                                                                                                                                                                                                                                                          |
| **Audit log + export**                                                                                   | **50%** | We have the dirs; verify export format.                                                                                                                                                                                                                                                |
| **Notifications (OS-native)**                                                                            | **40%** | Tauri-wired but per-tool granularity missing.                                                                                                                                                                                                                                          |
| **Floating chat / mini panel**                                                                           | **60%** | We LEAD here, if Tauri Always-on-Top works.                                                                                                                                                                                                                                            |

**Aggregated weighted score across the slice: ~30%.**

Weighted by Frontend/Design (3x), Tools rendering (3x), Permissions (2x), Plan Mode (2x), Artifact viewer (2x), FullscreenLayout (2x), and the rest (1x), our weighted parity inside this 150-file slice is approximately **30%**. The big gaps are concentrated in (a) the design-system, (b) the permission-dialog primitive composition, and (c) the FullscreenLayout 5-slot architecture. These three together are the load-bearing scaffolding that Claude Code's apparent polish rests on.

---

## 5. Where we LEAD inside this slice

Not all of this is reactive. Inside the 150-file slice we ship features Claude does not (or ships only via Connectors, which is structurally weaker for offline / BYOK):

- **Calendar workspace** — full day / week / month / event-dialog (~5 files). Claude has no first-party calendar UI.
- **Database workspace** — Claude has no first-party DB workspace.
- **Browser action log / replay** — Claude renders browser tool calls inline only. We have a dedicated 5-file replay viewer with screenshots + visualization.
- **Cloud storage panel** — unified surface vs Claude's per-connector stubs.
- **Documents workspace + DocumentGenerator** — separate first-class destination.
- **DynamicCanvas** — live React re-render against tool calls.
- **FloatingChat** (if Tauri Always-on-Top is solid) — Claude has no equivalent.
- **Marketplace (workflow)** — bigger than Claude's `claude plugin install` CLI search; potential creator economy.
- **Audit log + export** — Cowork is excluded from Claude's audit logs; we can ship full audit + export.
- **Multi-provider model picker** (in our composer; not in this slice but Q-2 of MEMORY confirms the differentiator).
- **BYOK + Local LLM** in the same composer.

---

## 6. Top-7 Missing UI/Component Features (highest leverage)

1. **FullscreenLayout 5-slot architecture** (M1.15) — every other UI fix bolts onto this. Build first.
2. **Permission Dialog primitive composition** with lazy LLM risk explainer (M1.5) — converts ApprovalModal into a reusable safety surface and beats Codex on per-tool granularity.
3. **Plan Mode dialog with sticky footer + Ctrl+G** (M1.4) — the single biggest Claude Code differentiator absent from us.
4. **FuzzyPicker primitive + GlobalSearchDialog + HistorySearchDialog + QuickOpenDialog** (M1.9) — collapses 4 search/picker UIs into one.
5. **Streaming-markdown boundary tracking + module-level token cache** (M1.1) — fixes long-message streaming perf and unblocks 1k+-message conversations.
6. **Cowork-style status footer** (locality | permissions | worktree chips, M1.11) — single-glance proof of isolation; differentiator.
7. **Tool-call group header + Result-pill** (M1.7) — fixes inline tool-call density problem and converges with Claude's signature.

**Per-axis percentage summary:**

- Design system primitives: **20%**
- Tools rendering: **25%**
- Permissions / approvals: **20%**
- Plan Mode UI: **5%**
- Artifact viewer: **40%**
- FullscreenLayout: **10%**
- Background tasks taxonomy: **30%**
- Connectors permissions: **25%**
- Status footer: **0%**
- Diff infrastructure: **30%**
- **Aggregate weighted parity: ~30%.**

**Output file:** `/Users/siddhartha/Desktop/agiworkforce/tasks/research/gap-matrix/d4-desktop-components-1.md` (this file).

---

End of GAP-D4.
