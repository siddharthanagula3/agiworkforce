# Desktop UI/UX Gap Audit — 2026-05-05

## Surface

- App path: `apps/desktop/` + `packages/chat/` (active chat surface)
- Refs studied: 22 screenshots from `claude/claude-desktop/` (39 total, 22 opened), `chatgpt-desktop/` (3 opened), `codex-desktop/` (6 opened), `claude/claude-chat-artifacts-and-tools/` (3 opened), `claude/claude-connectors-directory/` (1 opened)
- Engineer: desktop-engineer

---

## A. Current state inventory

1. **App shell / layout** — `apps/desktop/src/App.tsx:1252-1298`: single-pane `ChatInterface` fills 100% viewport; no three-pane or resizable panel support wired at the shell level.
2. **Sidebar** — `packages/chat/src/components/Sidebar.tsx`: collapsible icon-rail + recents list; nav items: New Chat, Search, Customize (Palette), Chats, Projects, Skills (Zap), Connectors (Plug). No pinned conversations row, no star/archive actions on hover.
3. **Composer / ChatInput** — `packages/chat/src/components/ChatInput.tsx`: textarea + `+` (attachment), model selector button, mic, send/stop. Web-search and research toggles are local state only (not persisted). No plan-mode toggle, no permissions dropdown, no reasoning-level selector.
4. **Model selector** — `packages/chat/src/components/ModelSelector.tsx`: Radix Popover with provider-grouped list, tier badges (fast/premium/standard), local/BYOK flags. No thinking-effort slider, no "Temporary Chat" toggle.
5. **Empty state** — `packages/chat/src/components/EmptyState.tsx`: time-of-day emoji + greeting + "How can I help you today?" No quick-action chips below the composer (QuickChips component exists but wiring is separate).
6. **Artifact panel** — `packages/chat/src/components/ArtifactPanel.tsx`: right-side slide-in with preview/code toggle, copy, refresh, close, download. No tabbed multi-artifact, no print button.
7. **ThinkingBlock** — `packages/chat/src/components/ThinkingBlock.tsx`: step-by-step collapsible with typed icons. Rendered inline, not as a compact stacked chip row.
8. **Settings** — `apps/desktop/src/components/Settings/SettingsPanel.tsx:83-94`: 10-tab dialog (General, Account, Appearance, Privacy, Models & Keys, Agents, MCP & Skills, Apps & Integrations, Notifications, Voice). Modal dialog, not a full-page route.
9. **Connectors gallery** — `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx`: tab-filtered card grid with OAuth flow and API-key dialog. No per-tool permission-level dropdown (Always allow / Needs approval / Blocked).
10. **Profile popover** — referenced via `packages/chat/src/components/UserProfile.tsx` + Sidebar bottom avatar: contains Settings link and logout. No inline usage-meter / rate-limits remaining display.

---

## B. Pattern audit

### 1. Three-pane layout (sidebar + chat + project/artifact)

- Reference: `claude-desktop/05_three-pane-layout_sidebar-chat-project.png` — persistent right pane for project knowledge, files, and instructions alongside the conversation.
- Ours: `apps/desktop/src/App.tsx:1252` — single main column; artifact panel slides over chat on top.
- Gap: No persistent right panel for project context. The artifact panel is an overlay, not a docked pane.
- Verdict: ADJUST
- Impact: 4
- Effort: L
- Priority: P1

### 2. Composer — plan-mode toggle & permissions dropdown

- Reference: `codex-desktop/02_composer_attachment-menu-photos-plan-mode-speed.png` — `+` menu exposes "Plan mode" toggle (blue pill) and "Speed" submenu; `codex-desktop/04_composer_permissions-dropdown-default-vs-full-access.png` — bottom-bar "Full access" dropdown.
- Ours: `packages/chat/src/components/ChatInput.tsx:50-53` — web-search and research toggles are local state only; no plan-mode UI, no permissions dropdown.
- Gap: Plan-mode is wired in Rust (`tools.rs:193`) but has no composer toggle. Permissions level has no UI surface at all.
- Verdict: ADD
- Impact: 5
- Effort: M
- Priority: P0

### 3. Model selector — thinking-effort level & temporary-chat toggle

- Reference: `chatgpt-desktop/09_composer_model-selector-auto-instant-thinking-legacy-temp-chat.png` — model menu has Auto / Instant / Thinking modes plus "Temporary Chat" toggle embedded in the same popover.
- Ours: `packages/chat/src/components/ModelSelector.tsx:1-82` — groups by provider, tier badges, no effort/mode axis, no temporary-chat.
- Gap: Cross-provider reasoning-effort selector (low/medium/high) absent; temporary/ephemeral session toggle absent.
- Verdict: ADJUST
- Impact: 4
- Effort: M
- Priority: P1

### 4. Stacked tool-status chips (compact in-flight steps)

- Reference: `claude/claude-chat-artifacts-and-tools/08_stacked-tool-status-messages_compact.png` — multi-step agentic work shown as compact, collapsible one-liners ("Ran 5 commands, created a file >") rather than full step cards.
- Ours: `packages/chat/src/components/ThinkingBlock.tsx` — each step is an expanded row with icon, text, and optional result detail. Gets visually heavy on long agentic runs.
- Gap: No "summarized" compact mode for stacked tool steps during streaming; expands everything inline.
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P1

### 5. Artifact panel — tabbed multi-artifact + print

- Reference: `claude/claude-chat-artifacts-and-tools/12_artifact-sidebar_html-resume-preview.png` + `24_artifact-viewer_tabbed-content-with-print-button.png` — multiple artifacts accessible via tabs; toolbar includes Print.
- Ours: `packages/chat/src/components/ArtifactPanel.tsx:1-58` — single artifact at a time, no tab row, no Print action.
- Gap: Multi-artifact navigation not possible without closing and reopening; Print missing.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 6. Connector permission-level dropdown

- Reference: `claude-desktop/23_connector-permissions-dropdown_airtable.png` — per-tool row has "Always allow / Needs approval / Blocked / Custom" dropdown; write/delete tools default to Blocked.
- Ours: `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx:25-60` + `ConnectorCard.tsx` — connect/disconnect only; no per-tool permission level control.
- Gap: Users have no granularity over what each connector tool is allowed to do. Critical for trust.
- Verdict: ADD
- Impact: 5
- Effort: L
- Priority: P0

### 7. Profile popover — inline usage meter

- Reference: `codex-desktop/17_user-popover_account-rate-limits-upgrade.png` — user popover shows "Rate limits remaining 6%" with 5h/weekly breakdown and expiry, plus "Upgrade to Pro" inline.
- Ours: `packages/chat/src/components/UserProfile.tsx` (referenced from Sidebar) — shows email, Settings, Logout. No usage indicator.
- Gap: Users have no ambient signal of how much quota remains without navigating to Settings → Account.
- Verdict: ADD
- Impact: 4
- Effort: S
- Priority: P1

### 8. Customize / Skills — Connectors landing page

- Reference: `claude-desktop/21_customize-claude-landing-page.png` — Customize landing shows three action cards: "Connect your apps", "Create new skills", "Browse plugins" with descriptions.
- Ours: `apps/desktop/src/components/Settings/SettingsPanel.tsx:91` — "MCP & Skills" and "Apps & Integrations" are separate tabs, no landing that unifies the three entry points.
- Gap: Discovery path for new users is fragmented; no single "extend your assistant" surface.
- Verdict: ADD
- Impact: 3
- Effort: S
- Priority: P2

### 9. Plans / pricing in-app surface

- Reference: `claude-desktop/35_plans-pricing_individual-plans.png` — in-app plans modal shows Max / Pro / Free cards with feature lists and CTA buttons.
- Ours: `apps/desktop/src/App.tsx` — upgrade CTAs link out; no in-app plan comparison surface.
- Gap: Conversion path requires leaving the app; no tier comparison visible to BYOK or Local-only users.
- Verdict: ADD
- Impact: 4
- Effort: M
- Priority: P1

### 10. Compact / popout mini window

- Reference: `codex-desktop/21_popout-window_compact-mini-mode-empty-state.png` — full composer + status bar in ~480px portrait window; `chatgpt-desktop/18_popout-window_compact-mode-empty-state.png` — similar compact frame.
- Ours: `apps/desktop/src/components/FloatingChat/index.tsx` exists; `App.tsx:1435` routes `/floating` path to it.
- Gap: FloatingChat exists but is not exposed via any in-app UI affordance (no "popout" button visible in the main window); users cannot discover or trigger it without knowing the route or global hotkey.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 11. Sidebar — hover actions on conversation items

- Reference: `claude-desktop/02_sidebar-expanded_chat-history.png` — conversation row shows archive/pin/delete actions on hover (ellipsis + star).
- Ours: `packages/chat/src/components/ConversationItem.tsx` — title + timestamp, no hover action row visible from the file structure.
- Gap: Conversation management (pin, archive, rename, delete) has no per-item affordance.
- Verdict: ADJUST
- Impact: 3
- Effort: S
- Priority: P2

### 12. Settings IA — "Desktop app" sub-section

- Reference: `claude-desktop/07_settings-general-tab.png` — settings has two clear sections: general account settings (Profile, Notifications, Appearance) and a distinct "Desktop app" sub-group (General, Extensions, Developer).
- Ours: `apps/desktop/src/components/Settings/SettingsPanel.tsx:83-94` — flat 10-tab list; "Agents", "MCP & Skills", "Apps & Integrations", "Voice" are peer tabs alongside "General" and "Account" without grouping.
- Gap: Flat tab list is cognitively noisy at 10 items; desktop-specific settings not grouped separately from account settings.
- Verdict: ADJUST
- Impact: 3
- Effort: M
- Priority: P2

### 13. Connectors gallery — categorized scrollable directory

- Reference: `claude/claude-connectors-directory/02_directory_modal-page-02-...` — modal grid with Search, Sort, Type, Categories filter chips; ~14 connectors per view in a dense card layout.
- Ours: `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx:22-30` — tab (featured/all) + status filter + category select; exists but category select is a plain `<select>`, not pill chips, and filter bar is below the tab row.
- Gap: Filter UX is functional but below-reference polish; missing sort control; pill-chip filter affordance expected by users who've seen Claude/Perplexity connector galleries.
- Verdict: ADJUST
- Impact: 2
- Effort: S
- Priority: P2

---

## C. Top 10 priority gaps (ranked)

1. **Connector per-tool permission levels** — Ref: `claude-desktop/23_connector-permissions-dropdown_airtable.png` — Ours: `apps/desktop/src/components/Connectors/ConnectorCard.tsx` — Add Always-allow / Needs-approval / Blocked dropdown per tool row in connector detail view — P0 (Impact 5, Effort L)

2. **Plan-mode toggle + permissions dropdown in composer** — Ref: `codex-desktop/02_composer_attachment-menu-photos-plan-mode-speed.png` — Ours: `packages/chat/src/components/ChatInput.tsx:50` — Wire plan_mode Rust command to a composer toggle; add Full/Default access dropdown to status bar — P0 (Impact 5, Effort M)

3. **Three-pane layout: persistent right panel for project knowledge** — Ref: `claude-desktop/05_three-pane-layout_sidebar-chat-project.png` — Ours: `apps/desktop/src/App.tsx:1252` — Replace overlay artifact panel with a resizable docked right pane that persists across messages — P1 (Impact 4, Effort L)

4. **In-app plans/pricing comparison surface** — Ref: `claude-desktop/35_plans-pricing_individual-plans.png` — Ours: `apps/desktop/src/App.tsx` (upgrade links out) — Add modal or panel showing Local / BYOK / Hobby / Pro tier cards with CTAs, reachable from profile popover — P1 (Impact 4, Effort M)

5. **Profile popover: inline usage / quota meter** — Ref: `codex-desktop/17_user-popover_account-rate-limits-upgrade.png` — Ours: `packages/chat/src/components/UserProfile.tsx` — Add rate-limits-remaining percentage + expiry breakdown + Upgrade CTA to the bottom-of-sidebar user popover — P1 (Impact 4, Effort S)

6. **Model selector: thinking-effort axis** — Ref: `chatgpt-desktop/09_composer_model-selector-auto-instant-thinking-legacy-temp-chat.png` — Ours: `packages/chat/src/components/ModelSelector.tsx` — Add Auto / Standard / Extended-thinking mode row for providers that support it (Anthropic, OpenAI o-series) — P1 (Impact 4, Effort M)

7. **Stacked tool-step compact summary mode** — Ref: `claude/claude-chat-artifacts-and-tools/08_stacked-tool-status-messages_compact.png` — Ours: `packages/chat/src/components/ThinkingBlock.tsx` — Collapse multi-step agentic work into a single "Ran N commands, created M files >" summary row while streaming, expandable on click — P1 (Impact 3, Effort M)

8. **FloatingChat popout discoverability** — Ref: `codex-desktop/21_popout-window_compact-mini-mode-empty-state.png` — Ours: `apps/desktop/src/components/FloatingChat/index.tsx` (exists but no trigger UI) — Add a "Popout" / compact-mode button to the conversation header or sidebar footer — P2 (Impact 3, Effort S)

9. **Sidebar conversation hover actions** — Ref: `claude-desktop/02_sidebar-expanded_chat-history.png` — Ours: `packages/chat/src/components/ConversationItem.tsx` — Show pin / archive / rename / delete on hover via ellipsis menu — P2 (Impact 3, Effort S)

10. **Unified Customize landing page** — Ref: `claude-desktop/21_customize-claude-landing-page.png` — Ours: `apps/desktop/src/components/Settings/SettingsPanel.tsx:91` — Add a single "Extend" or "Customize" landing card in Settings that routes to Skills, Connectors, and Plugins from one place — P2 (Impact 3, Effort S)

---

## D. Anti-patterns from refs we should NOT copy

1. **Single-vendor model selector** (`claude-desktop/01_empty-state_new-chat-collapsed-sidebar.png` shows "Sonnet 4.6 Extended" hardcoded in the composer footer). Our product supports 13 providers — the model selector must remain a first-class multi-provider picker, not be reduced to a mode-within-one-provider widget.

2. **Upgrade CTA as gating blocker** (`claude-desktop/35_plans-pricing_individual-plans.png` gates entire capability tiers). We must never gate the Local-only or BYOK tiers behind an in-app paywall wall — upgrade prompts should be additive and dismissible, not modal-blocking flows.

3. **"Connect your apps" requires Claude account** (`claude-desktop/21_customize-claude-landing-page.png` — all personal plugins are account-bound). Our connector model must support BYOK/Local users having their own connectors that persist without a cloud account (store config locally in SQLite when in local mode).

4. **Rate limits framed as user fault** (`codex-desktop/17_user-popover_account-rate-limits-upgrade.png` shows "Rate limits remaining 6%" with blunt "Upgrade to Pro"). For our BYOK users, the quota is their own API key's limit, not ours — the usage meter framing must distinguish "your key's limits" from "our managed plan limits".

5. **Commit/PR toolbar as primary CTA** (`codex-desktop/02_composer_attachment-menu-photos-plan-mode-speed.png` + header Commit button). Codex is a code-only tool. We are a general-purpose multi-provider assistant — surfacing commit/PR as a primary action would mislead users who are not in a coding session.

---

## E. Open product questions (need user decision)

1. **Three-pane vs. overlay**: Should the artifact panel become a persistent docked right pane (like Claude Desktop's project knowledge panel) or remain an overlay? The docked version requires changing the ChatInterface layout contract in `packages/chat` (affects all surfaces).

2. **Plan-mode scope**: When a user enables plan-mode in the composer, should it apply only to the current conversation or persist as a global setting (stored in `settingsStore`)?

3. **Local-mode connector persistence**: Connectors currently use `connectorsStore` which syncs to Supabase. What is the storage target for BYOK/Local users? (SQLite? localStorage?)

4. **Popout window trigger**: Should the compact/popout mode be triggered from (a) a toolbar button, (b) a keyboard shortcut only, or (c) both? If both, does it require a Tauri window command or can it reuse the existing `/floating` path?

5. **Settings IA grouping**: Should the 10-tab flat list be regrouped into sections (e.g., "Account" / "Interface" / "AI" / "Extensions") or reduced by merging thin tabs (e.g., "Voice" into "General", "Notifications" into "Account")?
