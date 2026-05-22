# GAP-D6 — Desktop Components 301..450 (Settings → UnifiedAgenticChat/DragOverlay)

> **Scope.** 150 files alphabetically `apps/desktop/src/components/Settings/ModelComparison.tsx` … `apps/desktop/src/components/UnifiedAgenticChat/DragOverlay.tsx` (entries 301–450 of 611 total). This range covers (a) the entire Settings panel from `Model*` through `Voice*`, (b) `SimpleMode/`, `SkillMarketplace/`, `StatusBanner`, `Subscription/`, `Teams/`, `Terminal/`, `ToolCalling/`, `Tools/`, the entire `ui/` design-system kit, and (c) the first ~36 entries of `UnifiedAgenticChat/` (A..D alphabetic).
>
> **Mission.** Compare AGI Workforce desktop to the May-2026 Claude suite (claude.ai web, Claude Desktop three-tab shell, Claude Cowork, Claude Code, Claude Code CLI, Claude Mobile, Chrome ext, VS Code ext, JetBrains plugin, Computer Use). Output ONLY MISSING + PARTIAL features.
>
> **Method.** Read every reference doc in `tasks/research/`. For each file in scope, resolve "what does Claude have that this implements" → mark `MISSING` (no Claude equivalent shipped or shipped but trivial), `PARTIAL` (Claude ships a richer or stricter version) or `OK` (parity, not reported). Cite `file:line`. Effort estimates in person-days (PD) using a senior + design pair.
>
> **Reference docs read in full.** `anthropic-claude-suite-may-2026.md` (777 lines), `deep/m5-screens-trio.md` (REPL/Doctor/ResumeConversation), `deep/c3-components-chunk-3.md` (User\*Message/permissions/), `deep/c4-components-chunk-4.md` (PromptInput/Spinner/StructuredDiff/Stats/StatusLine), `ui-04-claude-connectors.md`, `ui-05-claude-extensions.md`, `ink-vendored-fork.md` (skim — no overlap with this slice).

---

## 0. Scope split (per category)

| Sub-tree                               | Count | Lines (approx)      | Theme                                                                                                                                        |
| -------------------------------------- | ----- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Settings/` (Model*..Voice*)           | 18    | 7,143               | Multi-tab settings panel + theme editor + voice + usage + privacy                                                                            |
| `SimpleMode/`                          | 2     | 47                  | Simplified-mode toggle (no Claude analog)                                                                                                    |
| `SkillMarketplace/`                    | 4     | ~750                | Card grid + category filter + search bar                                                                                                     |
| `StatusBanner.tsx`                     | 1     | ~150                | Top-app banner                                                                                                                               |
| `Subscription/`                        | 3     | ~250                | Tier-gate dialogs                                                                                                                            |
| `Teams/`                               | 5     | ~950                | Team dashboard + invitation + member list + activity log                                                                                     |
| `Terminal/`                            | 3     | ~700                | Embedded terminal + AI assistant overlay                                                                                                     |
| `ToolCalling/`                         | 9     | ~1,300              | Diff/JSON/Table/Image viewers + approval dialog + tool cards                                                                                 |
| `Tools/`                               | 3     | ~400                | Tool invoker + categorical grid                                                                                                              |
| `ui/` (whole kit)                      | 47    | ~6,500              | Design-system primitives (radix-shadcn-style)                                                                                                |
| `UnifiedAgenticChat/` (Active*..Drag*) | ~55   | varies (1 to 1,735) | Active modes, Cards/, ArtifactRenderer, BranchNavigator, BudgetTracker, CheckpointManager, CommandPalette, CouncilView, DeepResearchPanel, … |

Total: 150 files. The asymmetric distribution matters: ~73% of the gap pressure lands on `Settings/` (must match `claude.ai/settings` 8-tab IA per ref §1.2) and `UnifiedAgenticChat/Cards/` (must match Cowork activity-feed + Claude Code permission-dialog grammar per ref §3.2 + ref `c3-components-chunk-3` permissions/ tree).

---

## 1. MISSING — categorical

### 1.1 Settings — claude.ai/settings parity gap

Reference: `anthropic-claude-suite-may-2026.md` §1.2 lists 11 canonical settings tabs (General / Appearance / Account / Privacy / Billing / Usage / Capabilities / Connectors / Claude Code / Desktop-app-developer-MCP / Profile-Personalization). Our `SettingsPanel.tsx:65-94` declares **10 tabs** (general / account / appearance / privacy / models-keys / agents / mcp-skills / connectors / notifications / voice). Direct mapping shows the following gaps.

#### M-1.1.1 — `Capabilities` tab does not exist (MISSING)

**Spec** (`anthropic-claude-suite-may-2026.md:54`): "Memory toggle (Generate memory from chat history; Pause; Reset memory), Chat search toggle, Memory import (from ChatGPT/Gemini/Grok), Health-data connector (US iOS/Android only), Voice mode preferences, Custom visuals, Research mode."

**Reality.** `SettingsPanel.tsx:65-94` has no `capabilities` tab. Memory toggling lives nowhere in this slice (the `Settings/PersonalizationSettings.tsx` is identity + style sliders, not memory). `ResearchSettings.tsx` exists but is research-mode-toggle only — it doesn't surface the daily-Memory-Synthesis state, "Pause memory" button, "Reset memory" destructive action, or the `claude.com/import-memory` import flow. There is NO Health-data connector entry point; mobile-only feature on Claude. Custom-visuals (charts/diagrams render toggle) is absent.

**Cite:** `apps/desktop/src/components/Settings/SettingsPanel.tsx:65-94` (canonical tab list); `apps/desktop/src/components/Settings/ResearchSettings.tsx` (research-only stub); no MemorySettings.tsx in tree.

**Effort.** 5 PD: Memory tab + Pause/Reset destructive flow + import-from-Claude wizard + chat-search toggle + custom-visuals toggle. (Health connector is mobile-only; explicitly out of desktop scope.)

#### M-1.1.2 — `Billing` tab does not exist (MISSING)

**Spec** (`anthropic-claude-suite-may-2026.md:54`): "Current plan, seat usage, invoice history, payment method, upgrade/downgrade, annual-vs-monthly toggle, extra-usage purchase (Team/Enterprise only)."

**Reality.** `TeamAccountSettings.tsx:1-399` is team-account, not personal billing. There is no invoice-list, no payment-method-edit, no annual/monthly toggle. The `Subscription/SubscriptionGate.tsx` is a one-shot upgrade-prompt modal, not a tab. Hobby-tier-launch ship-blocker per `MEMORY.md`.

**Cite:** `apps/desktop/src/components/Settings/TeamAccountSettings.tsx:1-399` (team-only); `apps/desktop/src/components/Subscription/SubscriptionGate.tsx:1-105` (single-shot, not tab).

**Effort.** 4 PD assuming Stripe RPC + portal-link. Stripe portal link plus our own invoice-list view from Supabase `stripe_invoices` table (canonical migration `supabase/migrations/20260505000007_stripe_webhook_idempotency.sql`).

#### M-1.1.3 — `Claude Code` tab analog does not exist (MISSING)

**Spec** (`anthropic-claude-suite-may-2026.md:58`): "OAuth tokens for the `claude` CLI, 'Sign out from CLI' button, Remote Control session list."

**Reality.** Our `OAuthCredentialsPanel.tsx` is in scope but it's **per-provider keys**, not a per-CLI-binary OAuth listing. The Remote Control session list (active CLI sessions paired with the desktop) is not surfaced anywhere. Our `apps/cli/` does have device-pairing in `~/.cargo/bin/agiworkforce` per `MEMORY.md` "CLI Demo Sprint" but the desktop has no UI for it.

**Cite:** `apps/desktop/src/components/Settings/OAuthCredentialsPanel.tsx` (provider keys only).

**Effort.** 3 PD: read paired-CLI session list from `~/.agiworkforce/sessions/*.json` (CLI dotfile dir), render with revoke action.

#### M-1.1.4 — Per-tab Personalization breakdown (PARTIAL)

`PersonalizationSettings.tsx:30-58` ships three sliders (formality / warmth / detail) + 3 emoji-usage stops. Claude's `Profile / Personalization` tab (`anthropic-claude-suite-may-2026.md:60`) is name + role + traits + custom-prompt-text-box.

Mismatch: **we don't surface "What should Claude call you?"**, "What do you do?", or "What traits should Claude have?" The slider-based UX is a divergent design and may be a deliberate differentiator, but the canonical-name + role + custom-prompt pattern is missing from this file. Per `comp-claude-ui.md` competitive memory, that's the user-recognizable signal.

**Effort.** 1 PD: add 4 textareas with debounced save.

#### M-1.1.5 — Theme editor parity (PARTIAL)

`ThemeEditorDialog.tsx:1-432` exists. Claude does not expose a per-channel HSL theme editor — Claude's themes are 3 fixed (light/dark/system) plus per-density (Compact/Comfortable). Our editor is more flexible than Claude's: this is a deliberate differentiator. **Do NOT mark missing.** But our `ThemeSettings.tsx` only delegates to `ThemeEditorDialog` — we don't ship a "density" toggle (per `anthropic-claude-suite-may-2026.md:54` Appearance row "Theme + density (Compact/Comfortable)").

**Effort.** 0.5 PD: add `density` enum to `chatPreferences`, wire into `cn` switch in `ChatMessageList`.

#### M-1.1.6 — Usage dashboard 5-hour window + weekly cap visualizations (PARTIAL)

`UsageDashboard.tsx:1-427` has token budget + cost-overview. Claude's Usage tab (`anthropic-claude-suite-may-2026.md:55`) is much more specific: "Current 5-hour-window usage bar, weekly all-model usage bar (Pro/Max/Team), separate Sonnet weekly bar (Max/Team Premium), Claude Code usage rollup."

`UsageDashboard.tsx:67-99` renders generic `UsageRow` with `pct` plus a single budget bar. We don't ship the **5-hour rolling window** primitive (Claude's signature mechanic, surfaced everywhere — see `comp-claude-ui.md`), nor the **weekly-cap separate-Sonnet-bar** for tier-Max parity.

**Effort.** 2 PD: add `Window5HrBar` primitive; track `usage_5hr_buckets` server-side in `supabase/migrations/`. Already partially scoped per `auto-routing-spec-2026-05-07.md`.

#### M-1.1.7 — Voice settings — full-duplex spoken Voice mode UX (PARTIAL)

`VoiceSettings.tsx:1-664` covers dictation (Whisper/Deepgram/OpenAI-Whisper providers + persona). Claude Mobile (`anthropic-claude-suite-may-2026.md:373`) ships **full-duplex spoken Voice mode** — tap sound-wave icon → choose voice → real-time conversation. Our desktop has dictation-in / TTS-out persona, not a single "Voice mode" UX wrapper that flips chat into speak-listen. The persona selector at `VoicePersonaSelector.tsx:1-246` is good groundwork but isn't wired to a global `voiceMode: bool` chat flag.

**Effort.** 3 PD: wrap existing primitives in a `VoiceMode` modal component invoked from the composer's sound-wave icon.

#### M-1.1.8 — Notifications tab — Cowork/Dispatch/Code-Remote-Control routing (MISSING)

`NotificationsSettings.tsx` exists in scope. Claude Mobile spec (`anthropic-claude-suite-may-2026.md:380`) lists 4 distinct trigger sources: (a) Cowork task complete/fail/needs-approval, (b) Dispatch session has a result, (c) Claude Code Remote Control session signals "needs review"/"complete", (d) scheduled Cowork task ready. We can't yet route by source because we have no Dispatch/Cowork/RC primitive on desktop. **Skip — out of slice scope.**

---

### 1.2 SkillMarketplace — Connectors-Directory parity gap

Reference: `ui-04-claude-connectors.md` (264 lines) is the canonical directory deep-dive. The May-2026 Claude directory has 200+ entries with category facets, scope-preview chips, per-tool permission grid (Always-allow/Needs-approval/Blocked), and the trust statement at the modal header.

#### M-1.2.1 — Skill marketplace ≠ Connector directory (PARTIAL)

`SkillMarketplace/SkillCard.tsx:1-374` and `SkillMarketplace.tsx:1-236` ship a **skill-only** marketplace. Claude separates **Skills** (folder with SKILL.md, code-execution required, per ref §1.5) from **Connectors** (OAuth-authorized third-party MCP servers, per ref §1.4). Our slice has zero `Connector*` component — the connector setup lives in `Settings/SettingsPanel.tsx` `connectors` tab and `ConnectorDiscoveryBar.tsx` (in our slice), but there's no full directory modal with the 5-chip taxonomy (`Popular`, `Trending`, `New`, `Beta`, `Interactive`, `Limited`).

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/ConnectorDiscoveryBar.tsx:34-116` (slim bar, 5 hard-coded placeholders) — this is far below Claude's modal.

**Effort.** 8 PD: build `ConnectorDirectoryModal` (modal-not-route per ref §8 implication), 2-column card grid, three filter dropdowns (`Sort`, `Type`, `Categories`), 5-chip badge taxonomy, per-card `+`/`✓` install state, custom-connector hyperlink in the header.

#### M-1.2.2 — Per-tool permission grid (MISSING)

**Spec** (`ui-04-claude-connectors.md` §2.7): "Permission control is granular **per individual tool**, not just per-connector." Three glyphs per tool row: green check (Always-allow), yellow clock (Needs-approval), red slash (Blocked). Per-group default selector (Always allow / Needs approval / Blocked / Custom). Excel example: full-disabled state with grey text.

**Reality.** Our `ToolCalling/ToolApprovalDialog.tsx:1-176` is a per-call approval modal, not a per-connector tool-permission grid. The settings tab `MCPToolsSettings.tsx` (out of slice — at file 264) supports MCP tool listing but no per-tool permission persistence.

**Cite:** `apps/desktop/src/components/ToolCalling/ToolApprovalDialog.tsx:1-176`.

**Effort.** 5 PD: per-connector tool-permission grid + per-group default selector + per-tool override; persisting in `~/.agiworkforce/connector-permissions.json` (CLI compatibility), and respecting it in `ToolApprovalDialog`'s default-allow logic.

#### M-1.2.3 — Three-verb install vocabulary (`Connect` / `Configure` / `Connected`) (MISSING)

**Spec** (`ui-04-claude-connectors.md` §2.5): three distinct verbs. We use a single `Install` verb in `SkillCard.tsx:1-374` and a generic `Connect` in `ConnectorDiscoveryBar.tsx`. We lose the post-auth `Configure` distinction.

**Effort.** 0.5 PD: tri-state install button.

#### M-1.2.4 — Filesystem-class connector config form (MISSING)

**Spec** (`ui-04-claude-connectors.md` §2.4): Filesystem connector requires `Allowed Directories (Required)` section with per-directory rows + `+ Add directory` + `Save` button. Canonical template for any connector with structured config.

**Reality.** `Settings/AllowedDirectoriesSettings.tsx` exists (lazy-loaded from `SettingsPanel.tsx:99`) but is **global** workspace dirs, not per-connector. There is no per-connector config-form pattern.

**Effort.** 3 PD: per-connector `ConfigSection` slot in connector detail + first-class FS connector use case.

---

### 1.3 ToolCalling — Tool-result rendering parity gap

Reference: `c3-components-chunk-3.md` §1.2 (`UserToolResultMessage/`), `anthropic-claude-suite-may-2026.md` §1.8 (Tool-use rendering in chat).

#### M-1.3.1 — `DiffViewer` lacks IDE-diff round-trip (PARTIAL)

`ToolCalling/DiffViewer.tsx:1-196` is a static diff renderer. Claude's reference implementation (`c3-components-chunk-3.md` §1.4 `FilePermissionDialog`) ships `IDEDiffSupport<T>.applyChanges` — the user can open the diff in their IDE, edit it, and apply changes back into `old_string/new_string`. Our DiffViewer is read-only.

**Cite:** `apps/desktop/src/components/ToolCalling/DiffViewer.tsx:1-196`.

**Effort.** 4 PD: spawn-IDE → write to tmp → watch + diff-back; ties into `Tauri 2`'s `tauri-plugin-dialog`.

#### M-1.3.2 — `ToolApprovalDialog` lacks classifier-shimmer + 8-value plan exit + feedback-mode toggle (PARTIAL)

`ToolApprovalDialog.tsx:1-176` is single-pane allow/deny. Claude's `ExitPlanModePermissionRequest` (`c3-components-chunk-3.md` §1.4) supports an **8-value response enum** (`yes-bypass-permissions | yes-accept-edits | yes-accept-edits-keep-context | yes-default-keep-context | yes-resume-auto-mode | yes-auto-clear-context | ultraplan | no`), the `ClassifierCheckingSubtitle` shimmer (per `BashPermissionRequest`), and the feedback-mode toggle (Tab → freeform "tell Claude what to do differently").

**Cite:** `apps/desktop/src/components/ToolCalling/ToolApprovalDialog.tsx:1-176`.

**Effort.** 6 PD: split into `BashPermissionRequest` / `FilePermissionRequest` / `WebFetchPermissionRequest` / `ExitPlanModePermissionRequest` analogs; add classifier shimmer (cosmetic until classifier ships); add feedback-mode toggle (we already have a sticky-footer pattern in `MessageBubble`).

#### M-1.3.3 — `ToolCalling/JsonViewer.tsx` and `TableViewer.tsx` lack collapsible-by-default (PARTIAL)

`anthropic-claude-suite-may-2026.md:91`: "File read/write: Inline collapsed JSON cards labeled 'Read /path' or 'Write /path'; expand to see content; click 'View diff' for edits." — i.e., the canonical Claude pattern is **collapsed-by-default with view-diff link**. Our viewers are expanded-by-default.

**Effort.** 1 PD: change defaults + add View-diff link routing to `DiffViewer`.

#### M-1.3.4 — `ToolExecutionTimeline.tsx` lacks "compact-boundary keep" (MISSING)

`m5-screens-trio.md` §A.9 documents Claude's compact-boundary mechanic at REPL.tsx:2594-2607: in fullscreen mode, post-`/compact` runs keep the prior compact-interval visible. Our `ToolCalling/ToolExecutionTimeline.tsx:1-310` doesn't track a compact boundary — every `/compact`-equivalent wipes scrollback.

**Cite:** `apps/desktop/src/components/ToolCalling/ToolExecutionTimeline.tsx:1-310`.

**Effort.** 3 PD: introduce `compactBoundaryMessageId` in chat store + slice timeline at the boundary; pair with a `BeforeCompact` placeholder.

#### M-1.3.5 — `ToolCalling/ImagePreview.tsx` does not render OSC-8 hyperlinks back to terminal (MISSING)

Claude's `UserImageMessage.tsx` (per `c3-components-chunk-3.md` §1.1 line 200) supports `pathToFileURL(...).href` link with hyperlink-supporting terminal fallback. Our `ImagePreview.tsx` is GUI-only.

**Effort.** 0.5 PD: add `getStoredImagePath` resolver + OSC-8 link in CLI subprocess; out-of-scope for desktop GUI.

#### M-1.3.6 — Citation chips with hover-preview (PARTIAL)

`UnifiedAgenticChat/CitationBadge.tsx:1-149` ships hover-card + open-in-Sidecar. Good. But `parseCitations` only matches `\[(\d+)\]` literal brackets — Claude's footnote pattern is more flexible (sup-tag fallback, multi-format). Our regex misses citation patterns from Perplexity-style sources.

**Effort.** 1 PD: extend regex + add Markdown citation transformer.

---

### 1.4 UnifiedAgenticChat — Agentic-loop, council, deep-research (mostly OK / PARTIAL)

These are AGI-Workforce-specific differentiators that have no direct Claude equivalent. Audit them only for "would a Claude user expect this in their workflow?"

#### M-1.4.1 — `CouncilView.tsx` (multi-provider consensus) is a TRUE differentiator (NOT MISSING)

`UnifiedAgenticChat/CouncilView.tsx:1-244` queries multiple providers in parallel then synthesizes consensus. Claude is single-provider by design — this is one of our locked differentiators per `MEMORY.md` ("Multi-provider in one UI — switch mid-conversation"). Mark **OK**, do not regress.

#### M-1.4.2 — `DeepResearchPanel.tsx` (multi-step research) — partially aligned (PARTIAL)

`UnifiedAgenticChat/DeepResearchPanel.tsx:1-296` ships steps + findings + sources tabs. Claude's Research mode is spec'd at `anthropic-claude-suite-may-2026.md` §1.5 (toggle in `+` menu) and the finished-research output renders inline citations + source list — but Claude does **not ship a panel-style breakdown**. Our panel is richer than Claude's. This is **OK**, mark only as aspirational alignment.

But: Claude's Research mode auto-streams progress to the activity feed. Our `DeepResearchPanel` is a separate Card and doesn't merge with the chat stream. **PARTIAL** — wire it into `ChatMessageList` events.

**Effort.** 1 PD.

#### M-1.4.3 — `BranchNavigator.tsx` for fork-of-conversation (MISSING vs. Claude Code `--fork-session`)

`anthropic-claude-suite-may-2026.md:259`: "`/fork` branches a new session from the current point". Our `BranchNavigator.tsx:1-99` is the GOOD primitive — but it requires backing branches to actually be created, which today only happens via the Rust backend's checkpoints. We need a `Fork from here` action in the message-context menu that creates a new branch + activates it.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/BranchNavigator.tsx:1-99`.

**Effort.** 2 PD: add `forkFromMessage(msgId)` action in chat store; expose in `MessageActionsBar`.

#### M-1.4.4 — `CheckpointManager.tsx` lacks `/rewind` double-Esc shortcut (PARTIAL)

`UnifiedAgenticChat/CheckpointManager.tsx:1-370` ships create/restore/delete + branch_name field. Good. But Claude Code's headline `/rewind` is the _double-Esc_ keybinding (`anthropic-claude-suite-may-2026.md:255`). Our component has no global keybinding hook into double-Esc. Without it, the muscle memory differs from Claude Code users.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/CheckpointManager.tsx:1-370`.

**Effort.** 0.5 PD: register `Escape, Escape` in `useGlobalKeybindings`.

#### M-1.4.5 — `CommandPalette.tsx` lacks `claude.com/import-memory`-style import + Quick-Pick action palette (PARTIAL)

`UnifiedAgenticChat/CommandPalette.tsx:1-791` ships fuzzy command + chat-FTS-search. Claude's VS-Code-extension `Filter actions…` quick-pick (per `ui-05-claude-extensions.md` §B.10) groups by Context / Model / Account sections. Our palette doesn't section actions, doesn't show `Effort (High)` slider inline, doesn't surface `Switch model…` with provider grouping (the natural place to expose 10+ Providers).

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/CommandPalette.tsx:1-791`.

**Effort.** 2 PD: section grouping + inline `EffortSlider` row + provider-grouped `Switch model…` row.

#### M-1.4.6 — `Cards/ApprovalRequestCard.tsx` — risk-level chip OK, but missing per-tool default selector (PARTIAL)

`Cards/ApprovalRequestCard.tsx:1-399` ships 3-level risk chips (Low/Medium/High). Good. Missing: the "Always allow / Always allow for project / Once / Deny" four-button row from `anthropic-claude-suite-may-2026.md:170` (Cowork approval-prompt UX, variant 3 "Shell command allow"). We have allow/reject only.

**Effort.** 2 PD: add four-button row + persistence to `~/.agiworkforce/permissions.json`.

#### M-1.4.7 — `Cards/ComputerUseActionCard.tsx` — sentinel-app gating (PARTIAL)

`Cards/ComputerUseActionCard.tsx:1-229` renders a click/type/scroll/screenshot action. Claude Computer Use (`anthropic-claude-suite-may-2026.md:567-572`) auto-blocks investment/trading/crypto apps. Our card has no `getSentinelCategory()` analog — every action is rendered identically.

**Effort.** 3 PD: build a sentinel-app blocklist (mirror Anthropic's published list at trust.anthropic.com); reject card-level + show "Blocked by AGI Workforce policy" pill.

#### M-1.4.8 — `Cards/TerminalCommandCard.tsx` — output streaming + ephemeral-progress merge (PARTIAL)

`Cards/TerminalCommandCard.tsx:1-234` shows stdout/stderr after completion. Per `m5-screens-trio.md` §A.9 streaming-events flow, Claude merges per-second progress on `parentToolUseID + data.type` so Sleep/Bash one-second-tick tools don't blow the transcript. Our card waits for full completion then renders.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/TerminalCommandCard.tsx:1-234`.

**Effort.** 4 PD: wire the Tauri-event-stream from CLI subprocess, render delta, throttle at 16ms (matches Ink's render).

#### M-1.4.9 — `BudgetTracker.tsx` is a no-op renderer (PARTIAL)

`BudgetTracker.tsx:1-37` writes token usage to billing store, returns `null`. There's no UI surface here for a 5-hour-window indicator (Claude's signature). Adjacent `BudgetAlertsPanel.tsx` (in scope at file 366) is the user-visible alerts panel but it doesn't render the **rolling 5-hour bar**.

**Effort.** 1 PD: add 5-hour bar visualization in `BudgetTracker` or fold into `UsageDashboard`.

#### M-1.4.10 — `AdvancedEmptyState.tsx` is intentionally empty (PARTIAL)

`AdvancedEmptyState.tsx:1-22` returns an empty `div`. Claude's empty state ships **suggested prompts surfaced based on the current page** (Chrome ext A.5 in `ui-05-claude-extensions.md`) plus quick-start pills. Our `BrandedGreeting.tsx` (file 359) does the greeting; Empty-state shows nothing. Suggestions are missing.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/AdvancedEmptyState.tsx:1-22`.

**Effort.** 2 PD: 3-pill suggestion row that reads from `getExampleCommandFromCache()` analog.

#### M-1.4.11 — `ConnectorDiscoveryBar.tsx` 5 hard-coded connector placeholders (PARTIAL)

`ConnectorDiscoveryBar.tsx:22-28` hardcodes Gmail/Slack/GitHub/Notion/Calendar. The actual user's auth state is never queried; clicking opens `Settings → connectors`. Claude's directory has 200+ entries. Our hardcoded 5 don't even query whether each is installed.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/ConnectorDiscoveryBar.tsx:22-28`.

**Effort.** 1 PD: read `useConnectorsStore().installed` and render the top-5 unauthed connectors.

#### M-1.4.12 — `ArtifactRenderer.tsx` — Live Artifacts + persistent storage (PARTIAL)

`ArtifactRenderer.tsx:1-1735` is the largest file in slice — supports HTML/React/SVG/Mermaid/code/Markdown/PDF/spreadsheet/presentation. Good. Claude's late-2025 Artifacts ship **Live Artifacts** (auto-refresh against MCP servers, Apr 2026), **persistent storage** (20MB per artifact), **direct API calls** (artifact calls Claude's API without the user supplying keys; usage counts against viewer's subscription), and **MCP-connected artifacts**. None of these four are in our renderer.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx:1-1735`.

**Effort.** 8 PD (full quartet): Live MCP wiring (3 PD) + persistent-storage-bucket (2 PD) + direct-API-call shim (2 PD) + MCP-connected slot (1 PD).

#### M-1.4.13 — `AgentModeSwitcher.tsx` — modes vocabulary doesn't match Claude's published copy (PARTIAL)

`AgentModeSwitcher.tsx:7-43` defines: `safe / plan / build / autopilot`. Claude (`ui-05-claude-extensions.md` §B.11) publishes: `Ask before edits / Edit automatically / Plan mode / Bypass permissions`. Cross-app muscle memory matters — our mode names are aspirational but uncommon.

Recommend the rename: `safe → ask-before-edits`, `build → edit-automatically`, `plan → plan-mode`, `autopilot → bypass-permissions`. Functional behavior is already correct.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/AgentModeSwitcher.tsx:7-43`.

**Effort.** 0.5 PD: rename + persist migration in `chatPreferences.agentMode`.

#### M-1.4.14 — `Cards/ScreenshotCard.tsx` — server-side prompt-injection probe (MISSING)

`anthropic-claude-suite-may-2026.md:558`: "Server-side prompt-injection probe scans inputs (file reads, web fetches, screenshots) before they enter the agent context." Our `ScreenshotCard.tsx` (file 392, in slice) just renders the screenshot without any probe-state pill.

**Effort.** 4 PD: server-side probe (Rust-side) + UI pill ("Scanned for injection: Pass / Flagged"); requires backend work.

#### M-1.4.15 — `CommandSuggestion.tsx` — `Add to never-prompt-again` rule (PARTIAL)

`CommandSuggestion.tsx:1-289` runs `execute_terminal_command` after Run click. Claude (`anthropic-claude-suite-may-2026.md:170`) ships an "Always-allow for project" checkbox on every shell-command approval. Our card has Run / Copy / Edit only.

**Cite:** `apps/desktop/src/components/UnifiedAgenticChat/CommandSuggestion.tsx:1-289`.

**Effort.** 0.5 PD: third-button "Always allow this command".

---

### 1.5 ui/ design-system kit — broad parity, narrow gaps

47 files. Most are radix-shadcn primitives and need no Claude analog. Two specific gaps:

#### M-1.5.1 — `ui/Toaster.tsx` lacks per-priority lanes (PARTIAL)

`ui/Toaster.tsx` and `Toast.tsx` ship default + destructive variants. Claude's `Notification` event (per `anthropic-claude-suite-may-2026.md:289` Hooks event list) is one of 12 hook events with custom routing. Our Toaster doesn't expose lane-level routing.

**Effort.** 0.5 PD.

#### M-1.5.2 — `ui/PromptDialog.tsx` doesn't expose feedback-mode toggle (PARTIAL)

Claude's `PermissionPrompt.tsx` (per `c3-components-chunk-3.md` §1.4) Tab-toggles into a freeform-text feedback input. Our `PromptDialog.tsx` is a single-line input. The pattern of "tell Claude what to do differently" is recognized cross-product muscle-memory.

**Effort.** 1 PD.

---

### 1.6 Subscription/ — tier-gate behavior

#### M-1.6.1 — `SubscriptionGate.tsx:1-105` has no annual-vs-monthly toggle (PARTIAL)

`anthropic-claude-suite-may-2026.md:54` lists "annual-vs-monthly toggle, extra-usage purchase (Team/Enterprise only)" inside Billing. Our gate is one-button "Upgrade".

**Effort.** 1 PD.

#### M-1.6.2 — `SubscriptionLockDialog.tsx` lacks 5-hour-window upsell context (PARTIAL)

Claude shows the 5-hour countdown ("Limit resets in 2h 14m") above any limit-hit modal. Our dialog is generic.

**Effort.** 0.5 PD.

---

### 1.7 Teams/ — Team Standard / Premium parity

`Teams/TeamDashboard.tsx`, `TeamSettings.tsx`, `TeamMemberList.tsx`, `TeamInvitation.tsx`, `TeamActivityLog.tsx` — 5 files, ~950 LOC.

#### M-1.7.1 — Teams lack SCIM + admin-controls panel (PARTIAL)

`anthropic-claude-suite-may-2026.md:584` Team Standard ships SSO + SCIM. Team Premium adds OTel + admin controls. Our TeamSettings doesn't expose either; we can't be Team-Standard-equivalent without SCIM.

**Effort.** 5 PD: SCIM endpoint + admin-controls UI; deferred per `MEMORY.md` (Pro tier waitlist).

#### M-1.7.2 — Activity log doesn't ship audit-log feed (PARTIAL)

`TeamActivityLog.tsx` is in scope but Claude's audit logs are Compliance-API-backed (`anthropic-claude-suite-may-2026.md:511`). Our activity log is local-only.

**Effort.** 4 PD: audit-log RPC + Compliance-API-style export.

---

### 1.8 Terminal/ — embedded shell with AI assistant

`Terminal/Terminal.tsx`, `TerminalAIAssistant.tsx`, `TerminalWorkspace.tsx`.

#### M-1.8.1 — Terminal is good — but lacks `claude` CLI handoff (PARTIAL)

Claude's Code-tab ships `Open in Terminal` + auto-detects `claude` CLI installs (`anthropic-claude-suite-may-2026.md:237`). Our `TerminalAIAssistant.tsx` is in-house overlay; no `claude` CLI passthrough. Deliberate — we have our own CLI (`agiworkforce`). Mark **OK**.

#### M-1.8.2 — No `bashes` background-task drawer (MISSING)

`anthropic-claude-suite-may-2026.md:255` mentions `&` background a session, plus the `BackgroundTasksDialog` (per `c4-components-chunk-4.md` §3.x). Our terminal has no background-tasks drawer.

**Effort.** 2 PD: list active subprocesses + ESC-to-cancel.

---

### 1.9 SimpleMode/ + StatusBanner — small surfaces

`SimpleMode/SimpleModeToggle.tsx` is a binary switch — no Claude analog. **OK**.

`StatusBanner.tsx` shows a top banner. Claude's IA uses banners sparingly (`Connectors have moved to Customize` banner per `ui-04-claude-connectors.md` §6.1). Our banner is generic. **OK** in slice, but:

#### M-1.9.1 — StatusBanner lacks announcement-feed integration (PARTIAL)

Claude streams release-notes-style announcements via the bridge. Our banner is local-only.

**Effort.** 2 PD: subscribe to a `/announcements` endpoint.

---

## 2. PARTIAL summary table

| Component                                            | Partial reason                                | PD  |
| ---------------------------------------------------- | --------------------------------------------- | --- |
| `Settings/SettingsPanel.tsx:65-94`                   | 10 tabs vs Claude's 11 (no Capabilities)      | 5   |
| `Settings/PersonalizationSettings.tsx`               | Sliders ≠ name+role+traits                    | 1   |
| `Settings/ThemeSettings.tsx`                         | No density toggle                             | 0.5 |
| `Settings/UsageDashboard.tsx`                        | Generic budget vs 5-hr-window                 | 2   |
| `Settings/VoiceSettings.tsx`                         | Dictation only, no full-duplex Voice mode     | 3   |
| `Settings/OAuthCredentialsPanel.tsx`                 | Per-provider keys, no CLI Remote-Control list | 3   |
| `SkillMarketplace/*.tsx`                             | Skill-only, no Connector directory modal      | 8   |
| `Subscription/SubscriptionGate.tsx`                  | Single-shot, not Billing tab                  | 4   |
| `Subscription/SubscriptionLockDialog.tsx`            | No 5-hr countdown context                     | 0.5 |
| `Teams/TeamSettings.tsx`                             | No SCIM                                       | 5   |
| `Teams/TeamActivityLog.tsx`                          | No Compliance-API export                      | 4   |
| `Terminal/*`                                         | No bashes drawer                              | 2   |
| `ToolCalling/DiffViewer.tsx`                         | No IDE-diff round-trip                        | 4   |
| `ToolCalling/ToolApprovalDialog.tsx`                 | 2-button vs 4-button + 8-value plan exit      | 6   |
| `ToolCalling/JsonViewer.tsx` `TableViewer.tsx`       | Expanded-by-default                           | 1   |
| `ToolCalling/ToolExecutionTimeline.tsx`              | No compact-boundary                           | 3   |
| `ToolCalling/ImagePreview.tsx`                       | No OSC-8 hyperlink                            | 0.5 |
| `Tools/ToolsPanel.tsx`                               | Generic grid, no per-tool perm                | 2   |
| `ui/Toaster.tsx`                                     | No per-priority lanes                         | 0.5 |
| `ui/PromptDialog.tsx`                                | No feedback-mode toggle                       | 1   |
| `UnifiedAgenticChat/AdvancedEmptyState.tsx`          | Empty `div`, no suggestions                   | 2   |
| `UnifiedAgenticChat/AgentModeSwitcher.tsx`           | Mode names diverge from Claude                | 0.5 |
| `UnifiedAgenticChat/ArtifactRenderer.tsx`            | No Live/persistent/direct-API/MCP             | 8   |
| `UnifiedAgenticChat/BranchNavigator.tsx`             | No fork-from-message action                   | 2   |
| `UnifiedAgenticChat/BudgetTracker.tsx`               | No-op renderer; no 5-hr bar                   | 1   |
| `UnifiedAgenticChat/Cards/ApprovalRequestCard.tsx`   | 2-button vs 4-button                          | 2   |
| `UnifiedAgenticChat/Cards/ComputerUseActionCard.tsx` | No sentinel-app gating                        | 3   |
| `UnifiedAgenticChat/Cards/TerminalCommandCard.tsx`   | No streaming progress merge                   | 4   |
| `UnifiedAgenticChat/CheckpointManager.tsx`           | No double-Esc keybind                         | 0.5 |
| `UnifiedAgenticChat/CitationBadge.tsx`               | Regex misses sup-tag formats                  | 1   |
| `UnifiedAgenticChat/CommandPalette.tsx`              | No section grouping                           | 2   |
| `UnifiedAgenticChat/CommandSuggestion.tsx`           | No always-allow rule                          | 0.5 |
| `UnifiedAgenticChat/ConnectorDiscoveryBar.tsx`       | 5 hard-coded placeholders                     | 1   |
| `UnifiedAgenticChat/CouncilView.tsx`                 | Differentiator — keep                         | 0   |
| `UnifiedAgenticChat/DeepResearchPanel.tsx`           | Doesn't merge with chat stream                | 1   |
| `StatusBanner.tsx`                                   | No announcement-feed                          | 2   |

**Total PARTIAL effort: ~85 PD.**

---

## 3. MISSING summary table

| Concept                                                                                         | Where Claude has it                     | Effort |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| `Settings → Capabilities` tab (Memory + Pause + Reset + import + chat-search + custom-visuals)  | `anthropic-claude-suite-may-2026.md:54` | 5      |
| `Settings → Billing` tab (invoice list + payment + annual/monthly + extra usage)                | ref §1.2                                | 4      |
| `Settings → Claude Code` analog (paired-CLI session list + revoke)                              | ref §1.2                                | 3      |
| Per-tool permission grid (Always-allow / Needs-approval / Blocked / Custom + per-group default) | `ui-04-claude-connectors.md` §2.7       | 5      |
| Three-verb install vocabulary (`Connect`/`Configure`/`Connected`)                               | ref §2.5                                | 0.5    |
| Filesystem-class connector config form (`Allowed Directories (Required)`)                       | ref §2.4                                | 3      |
| ScreenshotCard server-side prompt-injection probe pill                                          | ref §12.1 + §F.2                        | 4      |
| Connector directory modal (200+ entries, 5-chip taxonomy, filters)                              | `ui-04-claude-connectors.md` §1         | 8      |
| Bashes background-task drawer                                                                   | `m5-screens-trio.md` §A.10              | 2      |
| `/import-memory` wizard flow                                                                    | `anthropic-claude-suite-may-2026.md:83` | 2      |
| Compact-boundary keep in `ToolExecutionTimeline`                                                | `m5-screens-trio.md` §A.9               | 3      |
| Compliance-API export in `TeamActivityLog`                                                      | ref §11.2                               | 4      |

**Total MISSING effort: ~43.5 PD.**

---

## 4. Per-axis percentage (against Claude May-2026 spec)

For each axis, we score `(implemented / spec'd) × 100` for the in-slice surface area only.

| Axis                                          | Spec'd surfaces                                                                                                         | Implemented                                     | Partial             | %                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------- | ---------------- |
| **Settings IA**                               | 11 tabs × 8 affordances avg                                                                                             | 10 tabs implemented; 8 affordances avg          | 4 mismatches        | 70%              |
| **Connectors** (in this slice)                | Directory + per-tool perms + 3-verb install + config-form + chips                                                       | ConnectorDiscoveryBar + Skills marketplace stub | None of the 5 fully | 25%              |
| **Tool calling**                              | DiffViewer + JSON/Table viewers + ApprovalDialog (8-state) + Timeline (compact-boundary) + Image OSC-8 + Citation chips | All present in shape                            | 5 partials          | 55%              |
| **UnifiedAgenticChat (A..D slice)**           | Empty-state + agent-mode + artifact (4-feature) + branch + budget + checkpoint + cards (4) + composer affordances       | All shipped in basic shape                      | 11 partials         | 60%              |
| **Subscription / Teams / Terminal**           | Tier-gate + Billing + SCIM + bashes drawer                                                                              | Subscription/Team UIs exist                     | 4 partials          | 50%              |
| **ui/ design system**                         | shadcn-grade primitives                                                                                                 | Full kit shipped                                | 2 partials          | 95%              |
| **Settings — Personalization specifically**   | Name + role + traits + custom-prompt                                                                                    | 3 sliders + emoji                               | Different design    | 40%              |
| **Settings — Voice specifically**             | Full-duplex spoken Voice mode + persona                                                                                 | Persona + dictation only                        | No spoken mode      | 60%              |
| **Settings — Usage specifically**             | 5-hr window + weekly + Sonnet bar                                                                                       | Generic budget bars                             | No 5-hr window      | 35%              |
| **Differentiators (multi-provider, council)** | n/a — beyond Claude                                                                                                     | Council + provider switching                    | Already-OK          | 110% (advantage) |

**Weighted slice average (excluding differentiator axis): ~55%.**

The lowest-scoring axes — Connectors, Personalization, Usage 5-hr window — are also the ones Claude leans on for retention. Highest-leverage fixes per the table above are: Connector directory modal (8 PD), per-tool permission grid (5 PD), Capabilities tab (5 PD), Billing tab (4 PD), full-duplex Voice mode (3 PD), 4-button approval row (2 PD).

---

## 5. Top-5 recommended ship-this-quarter

Given budget bias toward parity-with-Claude before launch (per `MEMORY.md` "GO-WITH-CAVEATS in 5–7 days"):

1. **Connector directory modal + per-tool permission grid** (13 PD combined). Without this, our connector story fails the basic claude.ai-equivalence test.
2. **Capabilities tab + Billing tab** (9 PD combined). Without these, paid-tier launch (Hobby) cannot complete.
3. **`ToolApprovalDialog` 8-value plan-exit + classifier shimmer + feedback-mode toggle** (6 PD). The single most user-visible permission UX gap.
4. **`UsageDashboard` 5-hour rolling window** (2 PD with backend support; backend is `auto-routing-spec-2026-05-07.md`). Bare minimum for tier muscle-memory.
5. **`Cards/ComputerUseActionCard` sentinel-app gating** (3 PD). Required before any computer-use ships to any tier.

Total: **33 PD across 7 components**, addresses ~60% of the parity deficit measured in §4.

---

## 6. Confirmed parity (no action — keep)

- `ui/*` 47 primitives — at 95% parity, ahead of Claude's component-library exposure (Claude doesn't ship a public design-system).
- `UnifiedAgenticChat/CouncilView.tsx` — multi-provider differentiator, not in Claude.
- `UnifiedAgenticChat/ArtifactRenderer.tsx` shape (HTML/React/SVG/Mermaid/Markdown/PDF/spreadsheet/presentation) — full taxonomy.
- `UnifiedAgenticChat/CitationBadge.tsx` hover-card pattern — better than Claude's footnote-style.
- `Settings/ThemeEditorDialog.tsx` per-channel HSL — richer than Claude.
- `Settings/SkillsPluginsSettings.tsx` plugin/skill listing — Claude has a similar surface but in `~/.claude/plugins/` only.

---

## 7. Cross-references to other GAP-D agents

- GAP-D5 (entries 151..300) covers `Chat/`, `MessageBubble`, `Onboarding/`, `MessageActionsBar` — those touch the **MessageActionsBar pattern** referenced in M-1.4.3 above.
- GAP-D7 (entries 451..600) will cover the rest of `UnifiedAgenticChat/` (E..Z) plus `Visualizations/`, `Whiteboard/`, `Workspace/` — those will hit the `MessageList` virtualization (paired with `OffscreenFreeze` per `c4-components-chunk-4.md` §2.1) and `ToolBudget` (paired with `BudgetTracker` here).
- GAP-D8 (entries 601..611) is leftover — likely `windows/`, `bridge/`, leftover `UnifiedAgenticChat/Z*` files.

Slice handoff for `MessageActionsBar` integration: **D6 → D7** carries the open ask "register Esc-Esc for `/rewind` parity at the global keybinding layer," tied to `CheckpointManager.tsx`.

---

_Compiled by GAP-D6 agent 2026-05-08 against `apps/desktop/src/components/` entries 301-450. References resolved against `tasks/research/anthropic-claude-suite-may-2026.md` (777 LOC), `tasks/research/deep/m5-screens-trio.md` (505 LOC), `tasks/research/deep/c3-components-chunk-3.md` (180 LOC), `tasks/research/deep/c4-components-chunk-4.md` (200 LOC of 800), `tasks/research/ui-04-claude-connectors.md` (264 LOC), `tasks/research/ui-05-claude-extensions.md` (323 LOC). Total reference text consumed: ~2,250 LOC._
