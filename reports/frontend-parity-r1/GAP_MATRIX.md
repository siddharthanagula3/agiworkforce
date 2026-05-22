# Frontend Parity — Round 1 Gap Matrix

**Synthesized**: 2026-05-16 from 8 reference analyst reports + 6 surface engineer inventories.
**Reference corpus**: 473 image files across `~/Desktop/reference/{ui,ui-capture-runs,ui-verification,claude-desktop-captures-2026-05-13}`.
**Schema**: `reports/frontend-parity-r1/SCHEMA.md` (18-section component taxonomy).
**Constraint**: feature/pattern parity only — AGI Workforce brand (teal `#21808d` + terracotta `#da7756`, Lucide icons, our own copy).

Source reports:

- `refs/` — 8 competitor analyses (Claude Desktop / extended-settings / artifacts / connectors / ChatGPT+Codex / Gemini+Perplexity / CLI tools / Extensions+mobile)
- `surfaces/` — 6 surface inventories (desktop / web / mobile / cli / chrome / vscode)

---

## TL;DR — top 12 cross-surface gaps ranked by leverage

Each row = a gap that's missing or partial on multiple surfaces. Numbers in cells = priority on that surface (P0 = blocks v1 parity, P1 = important, P2 = polish, ✓ = HAS, — = N/A).

| #   | Gap                                                                                                              | Desktop                                                                      | Web                                                                                                                              | Mobile                                                              | CLI                                                             | Chrome                                                | VSCode                                           |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| 1   | **Voice input (Wispr-Flow pattern)**                                                                             | ✓                                                                            | ✓                                                                                                                                | ✓                                                                   | ✓ (no Linux)                                                    | ✓ (Web Speech)                                        | **P0** missing                                   |
| 2   | **Artifact sidebar with toolbar+tabs (Preview/Source/Data, copy/download/print/refresh/close)**                  | P1 (no print, no Download-all, popout state unverified)                      | P1 (no print, no spreadsheet, no dark-mode iframe)                                                                               | P2 (full-screen modal — correct mobile pattern but no toolbar/tabs) | —                                                               | **P0** missing                                        | **P0** missing                                   |
| 3   | **Ask-vs-Act approval UX (per-action confirmation gate)**                                                        | P1 (AgentModeSwitcher exists but no explicit Ask/Act toggle)                 | **P0** missing                                                                                                                   | ✓ (ApprovalCard with countdown)                                     | ✓ (approval_overlay)                                            | **P0** missing (autoSubmit silent — P2 audit finding) | ✓ (Accept/Reject All per-file with diff preview) |
| 4   | **Cloud-drive attachments (Drive/Dropbox/OneDrive/iCloud) + screenshot capture**                                 | P1 no cloud drive (has screen capture)                                       | P1 no cloud drive + no screenshot                                                                                                | P1 no cloud drive + no screenshot                                   | P1 no cloud drive + no screenshot                               | P2 has screenshot, no cloud                           | P1 no cloud, no screenshot                       |
| 5   | **Per-message inline copy/regenerate/branch buttons**                                                            | ✓ (icon row in footer)                                                       | ✓ (MessageActions)                                                                                                               | P1 long-press only                                                  | P1 global `/copy` only                                          | P1 missing                                            | P1 missing                                       |
| 6   | **Project gallery grid + detail tabs (Chats/Sources/Knowledge) + create modal with presets**                     | P1 ProjectsView exists, layout unverified, no presets                        | P1 sidebar list only, no grid, no preset templates                                                                               | P1 list only, no grid, no tabs, no knowledge upload                 | P2 module exists but DEFER per audit                            | —                                                     | —                                                |
| 7   | **Settings: MCP-Servers / Developer / Shortcuts / Personalization / Notifications as labeled tabs**              | ✓ most present (some not labeled e.g. no Git/Worktrees)                      | **P0** only 7 tabs vs ≥18 — missing MCP-Servers, Developer, Extensions, Shortcuts, Personalization, Worktrees, Environments, Git | P1 missing MCP / Developer / Extensions                             | ✓ slash-command equivalents                                     | P1 only inline settings bar (no dedicated page)       | ✓ uses native VS Code settings UI                |
| 8   | **A/B comparison side-by-side layout in chat**                                                                   | P2 (`ModelComparison.tsx` exists only in Settings)                           | P2 (BranchNavigator approximates)                                                                                                | P2 (`compare.tsx` exists but vertical stack only)                   | —                                                               | —                                                     | P2 missing                                       |
| 9   | **Plans comparison modal with Individual ↔ Team/Enterprise tabs + weekly-limit countdown widget**                | P1 PlansModal present but no individual/team tabs, no weekly-limit countdown | P1 pricing page exists, no modal with tabs, no countdown                                                                         | P1 paywall card only, no comparison, no countdown                   | P1 weekly-limit shown in status bar (good); no plans comparison | P1 paywall card only                                  | P1 upgrade button only                           |
| 10  | **Reasoning effort labeled as "low/medium/high/max" widget (not buried in QuickPick or speed/quality selector)** | P1 SpeedQualitySelector serves role but not labeled "reasoning effort"       | ✓ explicit EFFORT_ORDER in ComposerFooter                                                                                        | P1 in Add-to-Chat sheet, no quick toggle in composer                | ✓ `/effort` picker                                              | P1 missing                                            | P1 enum QuickPick only, not a slider             |
| 11  | **Empty-state hero with multi-category quick-action tabs (Search/Write/Code/Analyze)**                           | P1 BrandedGreeting + QuickStartPills but no tab grid                         | P1 GreetingBanner + FollowUpSuggestions but no tabs                                                                              | P1 3 fixed chips only                                               | P1 update banner only, no hero                                  | P1 prompt chips only                                  | P1 3 hardcoded chips, coding-first framing       |
| 12  | **Scroll-to-bottom FAB (floating button), inline search-result favicons**                                        | P2 inline in ChatStream but not standalone; favicon display unconfirmed      | P2 scroll FAB present; favicons unconfirmed                                                                                      | ✓ FlatList handles                                                  | P2 keyboard-driven only, no FAB                                 | P1 missing FAB                                        | P1 auto-scroll only, no FAB                      |

---

## Cross-surface foundational issues (fix once, ship everywhere)

These are architecture/shared-package gaps, not surface-specific.

### A. Shared component duplication

Multiple surfaces re-implement the same UI primitives. Each is a one-off:

- **Markdown renderer**: Desktop has its own, Web has `MarkdownContent.tsx`, Mobile has `MessageContentRenderer`, Chrome has `side_panel/markdown.ts` (marked + DOMPurify), VSCode has inline JS in the webview monolith
- **Inline tool-call UI**: shared `packages/unified-chat/InlineToolCall` exists, mobile imports its own copy, web has `ToolCallCard.tsx`, Chrome+VSCode have webview-local versions
- **Citation chips / sources**: Web has `InlineCitation`/`CitationFooter`, Mobile has `CitationChip`+`CollapsibleSources`, Desktop has `SourcePillRow`+`SourcesFooter` — three parallel implementations
- **Approval card**: Desktop has `ApprovalRequestCard`, Mobile has `ApprovalCard`, VSCode has `AgentUI.handleEditRequests` QuickPick — three patterns for same concept

**Recommendation:** consolidate into `packages/unified-chat` (React) + a web-component or vanilla wrapper for non-React contexts (Chrome ext, VSCode webview).

### B. Brand-token compliance regression

- **Chrome popup uses old gradient `#667eea` / `#764ba2`** (not design-token teal/terracotta). Single bug, single fix at `apps/extension/src/popup/popup.html`. Other surfaces all use tokens correctly.
- **CLI does not consume `packages/design-tokens`** — colors declared locally in `tui/color.rs` + `tui/design_system.rs`. Acceptable (terminal palette differs) but worth a follow-up pass to map ANSI codes to brand intent.

### C. VSCode webview monolith blocks parity work

VSCode extension webview is a single ~1,600-line HTML string in `webviewContent.ts`. No component framework, no shared package consumption, no React. This is the single biggest blocker for VSCode artifact sidebar, voice input, and any rich UI parity work. Until this is broken up into a React/Svelte bundle, VSCode parity will lag by months.

**Recommendation:** create `packages/webview-ui` (React+esbuild bundle, no Tauri/Next.js dep) and migrate VSCode webview to it. Side-benefit: Chrome ext side panel could consume the same bundle.

### D. Mobile pattern gaps that aren't actually missing

Items below are **correctly N/A on mobile** (don't try to add them):

- Persistent split-pane artifact sidebar — full-screen modal is the right mobile pattern
- Popout mini-window — not a mobile concept
- Keyboard shortcuts dialog — not a mobile concept
- Worktrees/Environments/Git settings — desktop-developer features

### E. Cursor-style cap UX is invisible in the chat surface

Per the locked profit-from-day-1 rule: cap ladder is 80% warn → 100% silent downgrade → 150% hard cap. The 100%-downgrade step **is currently silent in the UI**. Competitors (Cursor, Codex) show a small indicator when downgrade triggers ("running on faster model after limit"). We should at minimum surface a status-bar chip on Desktop/Web/Mobile/VSCode when the user is silently downgraded, otherwise sophisticated users will think the model degraded for no reason.

---

## Per-surface synthesis (top 5 actionable gaps each)

### Desktop (`apps/desktop`)

1. **Cloud-drive attachments** in `PlusMenu` (Drive / Dropbox / OneDrive / Notebook source)
2. **Project gallery grid view** in `ProjectsView` + create modal with template presets
3. **Dispatch HMAC** desktop-side implementation (deadline 2026-06-05 from MEMORY)
4. **Reasoning effort widget** labeled explicitly (rename/repackage `SpeedQualitySelector` or add new)
5. **Weekly-limit countdown** widget in status bar (paired with cap-downgrade indicator)

### Web (`apps/web`)

1. **Settings tab expansion**: add MCP-Servers / Developer / Shortcuts / Personalization / Notifications tabs (currently 7 — should be ≥12)
2. **Ask-vs-Act approval gates** for agentic mode (current: status bar + trail only, no per-action confirmation)
3. **Onboarding wizard** for Local/BYOK/Hobby mode choice (currently lands directly on login)
4. **Plans comparison modal** with Individual/Team/Enterprise tabs (pricing page exists, no comparison modal)
5. **Mobile breakpoint composer collapse** + bottom-sheet model picker for narrow viewport

### Mobile (`apps/mobile`)

1. **Artifact viewer toolbar** (copy / download / refresh / share) on `ArtifactFullScreen`
2. **Project detail tabs** (Chats / Sources / Knowledge) + knowledge upload
3. **Project picker** in Add-to-Chat sheet (currently a placeholder stub)
4. **Inline message actions** (copy/regenerate) visible by default, not just long-press
5. **Plan/tier badge** in drawer header (currently only on profile screen)

### CLI (`apps/cli`)

1. **Ghost model fix**: `claude-opus-4-6-mini` at `tui/chatwidget.rs:412` and `tui/bottom_pane/list_selection_view.rs:1415,1497` (P0)
2. **`FAST_STATUS_MODEL` hardcoded** at `tui/chatwidget.rs:344` — replace with catalog lookup (P0)
3. **Inline citation chips / web search favicons** in chat stream
4. **Inline upgrade prompt** triggered on usage-limit hit (currently error text only)
5. **Voice on Linux**: hold-to-talk gated `#[cfg(not(target_os = "linux"))]` — wire Linux backend

### Chrome ext (`apps/extension`)

1. **Popup brand gradient fix**: `#667eea`/`#764ba2` → design-token teal/terracotta — one-liner
2. **Ask-vs-Act approval gates** in side panel for browser-control / computer-use actions (P2 audit finding open)
3. **Native messaging host manifest** `com.agiworkforce.browser.json` add to repo (P2 finding)
4. **Model picker in in-page overlay** (currently shows label only, no picker)
5. **Artifact sidebar** (or at minimum, code-block-with-copy in in-page overlay output)

### VSCode ext (`apps/extension-vscode`)

1. **Webview monolith → React bundle** (`packages/webview-ui`) — foundational, unblocks 2-5
2. **Voice input** wiring (entirely missing)
3. **Artifact sidebar** with HTML/MD/PDF preview tabs
4. **File attachment end-to-end**: handler for `openFilePicker` exists in webview but no extension-side processing
5. **Ghost command `agi-workforce.showSubsystemHealth`** test pollution fix (P0)

---

## Mislabel report (filename ↔ content)

All 8 reference analysts reported zero mislabels. Image filenames follow the documented convention `NN_<view>_<feature>.png` and accurately describe content. The curated `ui/INDEX.md` is the canonical map.

**No rename proposals needed.**

The `ui-capture-runs/` and `ui-verification/` paths contain timestamped capture-pass output (not user-curated) — filenames are tool-generated and consistent. No proposed renames.

---

## What we are NOT missing (worth celebrating)

Items where the curated reference set documents a pattern AND every applicable surface already has it:

- Multi-provider model picker grouped by provider (all surfaces use `MANUAL_MODEL_OPTIONS` / `PROVIDER_DISPLAY` from `@agiworkforce/types`)
- Markdown rendering (react-markdown on web/desktop, marked+DOMPurify on Chrome, native on VSCode webview, ratatui on CLI, RN markdown on mobile)
- Slash command palette (all chat surfaces)
- Thinking/reasoning block UI (Desktop ThinkingBlock + ReasoningAccordion / Web ditto / Mobile ThinkingBottomSheet / CLI ReasoningSummaryCell / VSCode missing — actually wait, this IS a gap on VSCode, see top-12 row 5)
- Stripe billing wired end-to-end on Web (Hobby/Pro/Pro+/Max + waitlist for Pro/Max per locked rules)
- Conversation persistence + history navigation across all surfaces
- Tier-aware paywall cards (Desktop SubscriptionGate + Mobile PaywallBottomSheet + Chrome popup paywall card + Web InlinePaywallCard + VSCode usage-meter banner)
- Multi-provider in-thread switch with Pro+ paywall guard (Mobile + VSCode have `providerSwitchGuard`)

---

## Suggested execution sequence

### Wave 1 — Foundation (1 week)

- Fix Chrome popup brand gradient (1 line)
- Fix CLI ghost model + hardcoded FAST_STATUS_MODEL (2 P0s)
- Fix VSCode ghost command test pollution (1 P0)
- Create `packages/webview-ui` skeleton (React + esbuild)
- Document Dispatch HMAC desktop-side requirements before 2026-06-05

### Wave 2 — Shared components (2 weeks)

- Consolidate citation chips / sources into `packages/unified-chat`
- Consolidate approval card into `packages/unified-chat`
- Migrate VSCode webview to `packages/webview-ui` (React bundle)
- Add Cursor-style "running on workhorse" status chip when cap ladder hits 100% — wire on Desktop/Web/Mobile/VSCode

### Wave 3 — Per-surface fills (parallel, 2-3 weeks)

- Desktop: cloud drives + project gallery + reasoning-effort widget + dispatch HMAC
- Web: settings tab expansion + ask-vs-act + onboarding wizard + plans modal + mobile breakpoint
- Mobile: artifact toolbar + project detail tabs + inline message actions + plan badge in drawer
- CLI: inline citations + upgrade prompt + Linux voice
- Chrome: ask-vs-act + native messaging manifest + in-page overlay model picker + artifact panel
- VSCode: voice + artifact sidebar + file attachment + ghost command fix

### Wave 4 — Polish (1 week)

- Empty-state quick-action tabs across all surfaces (productivity-first framing)
- Per-message inline copy/regenerate buttons on Chrome+VSCode+Mobile+CLI
- A/B comparison side-by-side layout (low-priority — only Perplexity ships at $271/seat)
- Scroll-to-bottom FAB standardization
