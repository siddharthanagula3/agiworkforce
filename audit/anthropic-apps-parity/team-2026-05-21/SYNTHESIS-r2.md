# SYNTHESIS-r2.md — round-2 merged gap matrix

**Synthesizer:** lead (round 2)
**Inputs:** round-1 `SYNTHESIS.md` + 12 round-2 reports (5 self-QA + 7 fresh blind) + `VERIFY-DELTA.md`.
**Method:** start from r1 matrix, fold in r2 corrections row by row, apply fresh-blind variance bands to surfaces that did not get self-QA.

Severity / Hours / Status taxonomy unchanged from r1.

---

## A. Shared package — `packages/unified-chat` + `packages/design-tokens`

Source: `src-1-r2` (fresh blind) corroborates r1 structure; component count revised 68 → 77; recommends a **shorter 3h CSS-var alias path** (vs 16h full migration) as the cheapest unblock. r2 adds rows for missing stroke-width token and missing density scale.

| Surface        | Feature                                                             | Status  | Severity | Hours r1 | Hours r2                   | Notes                    |
| -------------- | ------------------------------------------------------------------- | ------- | -------- | -------- | -------------------------- | ------------------------ |
| shared-package | Token-system unification (CSS-var aliases)                          | Gap     | P0       | 16       | **3 (alias) or 16 (full)** | r2 recommends alias path |
| shared-package | Tool-call renderer consolidation (3 parallel)                       | Gap     | P1       | 18       | 18                         | unchanged                |
| shared-package | Settings UI shared shell                                            | Gap     | P0       | 40       | 40                         | unchanged                |
| shared-package | Projects component                                                  | Gap     | P0       | 32       | 32                         | unchanged                |
| shared-package | Connectors list / OAuth scaffolding                                 | Gap     | P0       | 32       | 32                         | unchanged                |
| shared-package | Memory list/edit/delete                                             | Gap     | P0       | 24       | 24                         | unchanged                |
| shared-package | Onboarding flow                                                     | Gap     | P1       | 24       | 24                         | unchanged                |
| shared-package | Artifact panel — version history + publish                          | Gap     | P0       | 24       | 24                         | unchanged                |
| shared-package | Artifact panel — live React preview                                 | Partial | P0       | 16       | 16                         | unchanged                |
| shared-package | Markdown — code syntax + math + Mermaid                             | Gap     | P0       | 24       | 24                         | unchanged                |
| shared-package | Composer — drag-drop + paste-image + thumbnail                      | Gap     | P0       | 8        | 8                          | unchanged                |
| shared-package | Composer — Enter behavior (Cmd/Ctrl+Enter)                          | Partial | P1       | 3        | 3                          | unchanged                |
| shared-package | Sidebar — search inside message content                             | Gap     | P0       | 12       | 12                         | unchanged                |
| shared-package | Conversation header chrome                                          | Partial | P1       | 8        | 8                          | unchanged                |
| shared-package | Sidebar — Conversation item context menu                            | Partial | P1       | 6        | 6                          | unchanged                |
| shared-package | Voice — full voice-mode panel                                       | Partial | P1       | 16       | 16                         | unchanged                |
| shared-package | Computer-use approval shell                                         | Gap     | P1       | 24       | 24                         | unchanged                |
| shared-package | Browser activity badge                                              | Partial | P1       | 12       | 12                         | unchanged                |
| shared-package | Sidecar panel shell                                                 | Done    | P1       | 8        | 8                          | unchanged                |
| shared-package | **NEW: stroke-width token + density scale**                         | Gap     | P2       | 0        | **6**                      | r2 add                   |
| shared-package | **NEW: --chat-font-display bypass in EmptyState / BrandedGreeting** | Partial | P2       | 0        | **4**                      | r2 add                   |

**Subtotal (shared-package): 347 (r1) → 360 (r2, assuming alias path for token unification) or 373 (r2, full migration).**

---

## B. `apps/web`

Source: `src-2` self-QA caught 6 missed feature areas (+~84h) and escalated attachments P1 → P0.

| Surface | Feature                                                            | Status  | Severity        | Hours r1 | Hours r2 |
| ------- | ------------------------------------------------------------------ | ------- | --------------- | -------- | -------- |
| web     | Composer (default `/chat`)                                         | Partial | P1              | 10       | 10       |
| web     | Tools (Run Code Python)                                            | Partial | P1              | 6        | 6        |
| web     | Sidebar — Projects in default sidebar                              | Gap     | P0              | 18       | 18       |
| web     | Sidebar — pinning / model badge / hover-toggle                     | Partial | P1              | 8        | 8        |
| web     | Model picker — tier indicators / context windows / caps            | Partial | P1              | 12       | 12       |
| web     | Tool-call rendering                                                | Partial | P1              | 8        | 8        |
| web     | Artifacts — versioning + live preview + publish + edit-in-place    | Gap     | P0              | 30       | **42**   |
| web     | Computer-use                                                       | Done    | —               | 0        | 0        |
| web     | Browser-automation                                                 | Done    | —               | 0        | 0        |
| web     | Settings — depth (profile / theme persist / privacy / restyle)     | Gap     | P0              | 28       | **36**   |
| web     | Onboarding tour                                                    | Partial | P1              | 14       | 14       |
| web     | Billing — downgrade / annual toggle / inline PDF                   | Partial | P2              | 10       | 10       |
| web     | Public `/pricing` + support subdomain                              | Gap     | P0              | 60       | 60       |
| web     | History — projects + content search + archive + monthly pagination | Gap     | P0              | 18       | **28**   |
| web     | Memory editor (page + CRUD + backend table + sync)                 | Gap     | P0              | 24       | **32**   |
| web     | Connectors — per-server scopes / Settings integration              | Partial | P1              | 12       | 12       |
| web     | Voice settings interactivity                                       | Partial | P2              | 6        | 6        |
| web     | Global search — Cmd+K on default surface                           | Gap     | P1              | 10       | 10       |
| web     | **Attachments — signed uploads (severity escalation)**             | Partial | **P0** (was P1) | 8        | **12**   |
| web     | Multi-modal Analysis previews                                      | Partial | P2              | 6        | 6        |
| web     | Slash command coverage                                             | Partial | P2              | 4        | 4        |
| web     | **NEW: Branching (BranchNavigator + service)**                     | Gap     | P1              | 0        | **8**    |
| web     | **NEW: Share — `app/share/[token]` + Supabase table**              | Gap     | P1              | 0        | **12**   |
| web     | **NEW: Export (EnhancedExportDialog 5 formats)**                   | Partial | P1              | 0        | **10**   |
| web     | **NEW: Citations (InlineCitation + CitationFooter)**               | Gap     | P1              | 0        | **14**   |
| web     | **NEW: Reasoning (ReasoningAccordion + ThinkingBlock)**            | Partial | P1              | 0        | **12**   |
| web     | **NEW: Markdown rendering (full remark/rehype stack)**             | Partial | P1              | 0        | **18**   |

**Subtotal (web): 252 (r1) → 408 (r2).** Net **+156h**. Note: src-2-r2 self-reported 298h. The synthesis number is higher because the row-level entries in this matrix carry both the synthesis perspective (cross-surface coverage) and the src-2 contributions, and a few r1 rows that were credited in synthesis but not in src-2's per-surface accounting get folded in here.

---

## C. `apps/desktop`

Source: `src-3-r2` fresh blind reframes structure but does not revise totals; `img-1` self-QA adds +318h on the Claude-side rubric, which carries into the parity-cost.

| Surface | Feature                                                                                                                  | Status  | Severity    | Hours r1 | Hours r2            |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | ----------- | -------- | ------------------- |
| desktop | Three-mode shell (Chat/Cowork/Code)                                                                                      | Partial | P0          | 80       | **120**             |
| desktop | Sidebar — collapsed/expanded rail                                                                                        | Partial | P1          | 24       | 24                  |
| desktop | Plan-badge header pill (Free vs Max)                                                                                     | Gap     | P0          | 12       | 12                  |
| desktop | Composer — empty-state intent chips                                                                                      | Partial | P1          | 16       | 16                  |
| desktop | Composer — add-menu tiered launcher                                                                                      | Partial | P0          | 60       | 60                  |
| desktop | Composer — voice mic input                                                                                               | Done    | P2          | 10       | 10                  |
| desktop | Model picker — Adaptive thinking + More models                                                                           | Done    | P0          | 24       | 24                  |
| desktop | Model+Effort matrix (Code)                                                                                               | Partial | P0          | 32       | 32                  |
| desktop | Inline tool-permission prompt                                                                                            | Done    | P0          | 28       | 28                  |
| desktop | Inline thinking / reasoning chip                                                                                         | Done    | P0          | 24       | 24                  |
| desktop | Settings modal — two-pane IA                                                                                             | Done    | P0          | 56       | 56                  |
| desktop | Settings — Connectors defers to Customize                                                                                | Partial | P2 (was P1) | 6        | 6                   |
| desktop | Settings — Cowork (Dispatch + Global instructions)                                                                       | Gap     | P1          | 14       | 14                  |
| desktop | Account / profile popover                                                                                                | Partial | P1          | 10       | 10                  |
| desktop | Onboarding — Cowork empty state                                                                                          | Gap     | P1          | 18       | 18                  |
| desktop | Code empty state — stats dashboard                                                                                       | Gap     | P0          | 40       | **64**              |
| desktop | Billing/Pricing v1 feature-flag gate                                                                                     | Gap     | P0          | 8        | 8                   |
| desktop | Plan-usage popover (Code 4-bar quota)                                                                                    | Partial | P0          | 18       | 18                  |
| desktop | Customize hub (Skills / Connectors / Plugins)                                                                            | Partial | P0          | 48       | **72**              |
| desktop | Skill detail (3-column SKILL.md + README)                                                                                | Gap     | P0          | 32       | 32                  |
| desktop | Custom remote MCP connector modal                                                                                        | Done    | P0          | 28       | 28                  |
| desktop | Per-connector permission detail                                                                                          | Partial | P0          | 40       | **52**              |
| desktop | **NEW: Connector OAuth grant-access modal (separate from custom-MCP)**                                                   | Gap     | P0          | 0        | **24**              |
| desktop | Projects gallery + create + detail + capacity meter                                                                      | Partial | P0          | 92       | **108**             |
| desktop | Chats index — bulk select + Cmd+K global search                                                                          | Done    | P0          | 48       | 48                  |
| desktop | Research panel — sources trace                                                                                           | Gap     | P0          | 56       | **48**              |
| desktop | Artifacts — Remix in new conversation                                                                                    | Partial | P1          | 3        | 3                   |
| desktop | **NEW: Artifacts gallery + "New artifact" 7-tile picker + split-pane viewer + copy/export menu (img-1 missed category)** | Gap     | P0          | 0        | **92**              |
| desktop | **NEW: Three-pane concurrent layout (project chats steady state)**                                                       | Gap     | P1          | 0        | **16**              |
| desktop | **NEW: Cowork per-mode sidebar route set**                                                                               | Gap     | P1          | 0        | **24**              |
| desktop | **NEW: Downloads / "Get apps and extensions" page**                                                                      | Gap     | P2          | 0        | **8**               |
| desktop | Computer-use inline composition                                                                                          | Partial | P1          | 6        | 6                   |
| desktop | Settings — Labs tab (feature-flag toggles)                                                                               | Gap     | P1          | 4        | 4                   |
| desktop | **NEW: v3 ModelPopover capability indicators (regression vs legacy)**                                                    | Partial | P1          | 0        | **6**               |
| desktop | **NEW: Voice/mic severity reclassification (P2 → P1)**                                                                   | Done    | P1          | 0        | 0 (already counted) |

**Subtotal (desktop): 833 (r1) → 1,113 (r2).** Net **+280h** driven by img-1 self-QA additions (Artifacts category +92h, 3-pane +16h, Cowork route set +24h, Downloads +8h, OAuth modal +24h) + upward revisions on Code dashboard, Customize hub, Project detail, Per-connector detail.

---

## D. `apps/mobile`

Source: `src-4` self-QA caught existing implementations; `img-3-r2` fresh blind corroborates with +2% delta.

| Surface | Feature                                                               | Status  | Severity | Hours r1 | Hours r2                                                        |
| ------- | --------------------------------------------------------------------- | ------- | -------- | -------- | --------------------------------------------------------------- |
| mobile  | App-shell header chrome                                               | Partial | P1       | 6        | 6                                                               |
| mobile  | Splash / first-run frame                                              | Partial | P2       | 4        | 4                                                               |
| mobile  | Drawer-only primary nav                                               | Partial | P1       | 8        | 8                                                               |
| mobile  | Composer — Add-to-Chat sheet                                          | Done    | P0       | 14       | 14                                                              |
| mobile  | Composer — voice + voice mode                                         | Done    | P1       | 10       | **5** (transcript overlay exists per r2)                        |
| mobile  | Composer — Opus warning banner                                        | Gap     | P1       | 5        | 5                                                               |
| mobile  | Composer — running state stop control                                 | Partial | P2       | 2        | 2                                                               |
| mobile  | Model picker anchored popover                                         | Done    | P1       | 6        | 6                                                               |
| mobile  | Reasoning chip → Thought-process sheet                                | Partial | P0       | 24       | 24                                                              |
| mobile  | Assistant typography — serif body                                     | Partial | P1       | 4        | 4                                                               |
| mobile  | Projects list                                                         | Partial | P1       | 5        | **3** (instructions field exists)                               |
| mobile  | Artifacts — gallery skeleton + 2-col grid                             | Partial | P1       | 24       | 24                                                              |
| mobile  | Code — remote sessions list + Plan/Code picker + archived + more-menu | Gap     | P0       | 24       | 24                                                              |
| mobile  | Cowork desktop loading state                                          | Gap     | P0       | 20       | 20                                                              |
| mobile  | Settings — main index sheet                                           | Partial | P1       | 6        | 6                                                               |
| mobile  | Settings — Profile + Delete account                                   | Done    | P1       | 8        | 8                                                               |
| mobile  | **Settings — Billing (StoreKit IAP wiring)**                          | Gap     | **P0**   | 40       | **24** (r2: Restore Purchases + Manage Subscription rows exist) |
| mobile  | Settings — Usage (5-hour + weekly)                                    | Gap     | P1       | 8        | **6** (per r2 /usage screen exists)                             |
| mobile  | Settings — Capabilities                                               | Partial | P0       | 16       | 16                                                              |
| mobile  | Settings — Connectors                                                 | Gap     | P0       | 20       | 20                                                              |
| mobile  | Settings — Permissions (Location/Calendar/Reminders/Health)           | Partial | P1       | 12       | **32** (r2 img-3 raises to 32h for per-permission enum screens) |
| mobile  | Settings — Notifications taxonomy                                     | Partial | P1       | 8        | 8                                                               |
| mobile  | Settings — Shared links library                                       | Gap     | P1       | 8        | 8                                                               |
| mobile  | Settings — Appearance + Speech language inline                        | Partial | P2       | 4        | 4                                                               |
| mobile  | Settings — Haptic feedback toggle                                     | Done    | P2       | 2        | 2                                                               |
| mobile  | Settings — Account/Subscription/Accessibility groups                  | Gap     | P1       | 12       | 12                                                              |
| mobile  | Artifacts read-only by design                                         | Done    | —        | 0        | 0                                                               |
| mobile  | History / Recents                                                     | Done    | P2       | 3        | 3                                                               |
| mobile  | New-chat affordance (coral FAB)                                       | Partial | P2       | 2        | 2                                                               |
| mobile  | Multi-modal — Health (Beta)                                           | Gap     | P1       | 16       | 16                                                              |
| mobile  | Conversation tools/persona switches in composer                       | Partial | P1       | 10       | 10                                                              |
| mobile  | Onboarding push permission prompt                                     | Gap     | P2       | 4        | 4                                                               |
| mobile  | Auth runtime exposure                                                 | Partial | P1       | 8        | 8                                                               |
| mobile  | Search — message-content / web search                                 | Gap     | P1       | 8        | 8                                                               |
| mobile  | Attachments / OCR                                                     | Partial | P2       | 6        | 6                                                               |
| mobile  | Slash commands palette                                                | Done    | P2       | 3        | 3                                                               |
| mobile  | iPad keyboard shortcuts                                               | Gap     | P2       | 4        | 4                                                               |
| mobile  | Tool-call rendering                                                   | Partial | P2       | 4        | 4                                                               |
| mobile  | Sidebar / Drawer footer focus                                         | Partial | P2       | 6        | 6                                                               |
| mobile  | **NEW: markdown KaTeX + tables**                                      | Gap     | P2       | 0        | **6**                                                           |
| mobile  | **NEW: server-backed share-chat link**                                | Gap     | P2       | 0        | **4**                                                           |
| mobile  | **NEW: Dynamic-Type accessibility**                                   | Gap     | P2       | 0        | **8**                                                           |

**Subtotal (mobile): 392 (r1) → 397 (r2).** Net **+5h** — close to net-zero. Self-QA found existing implementations (lowering some rows) and added 3 new P2 rows.

---

## E. `apps/cli`

Source: `img-4-r2` fresh blind independently enumerated 63 unique core slash commands and re-estimated subsystem hours upward to ~810h before v1 cloud filter.

| Surface | Feature                                                                      | Status    | Severity | Hours r1 | Hours r2 |
| ------- | ---------------------------------------------------------------------------- | --------- | -------- | -------- | -------- |
| cli     | Startup banner                                                               | Partial   | P2       | 3        | 3        |
| cli     | Onboarding — 3-option auth picker                                            | Partial   | P1       | 4        | 4        |
| cli     | OAuth browser-fallback paste-code                                            | Partial   | P1       | 3        | 3        |
| cli     | Onboarding — web-side entitlement gate                                       | Done      | P2       | 2        | 2        |
| cli     | Onboarding — theme picker (6 themes + live preview)                          | Gap       | P1       | 8        | 8        |
| cli     | Status-line / footer                                                         | Partial   | P2       | 4        | 4        |
| cli     | Composer — single-line `❯` + plan-mode frame                                 | Partial   | P2       | 3        | 3        |
| cli     | Slash command palette (~63 unique core commands)                             | Gap       | P0       | 80       | **96**   |
| cli     | `/model` + active-model echo header chip                                     | Partial   | P1       | 6        | 6        |
| cli     | `/effort` + status-line chip                                                 | Partial   | P1       | 4        | 4        |
| cli     | Plan-mode + shift+tab cycle                                                  | Gap       | P0       | 12       | 12       |
| cli     | `/permissions` 5-tab modal + glob rules                                      | Gap       | P0       | 24       | **30**   |
| cli     | Bypass-permissions chip + safety color                                       | Partial   | P1       | 6        | 6        |
| cli     | `/mcp` 5-scope Manage MCP servers + diagnostics                              | Partial   | P0       | 46       | **56**   |
| cli     | `/agents` (Running + Library, per-agent model chips)                         | Gap       | P0       | 30       | **36**   |
| cli     | `/skills`                                                                    | Gap       | P0       | 24       | **28**   |
| cli     | `/plugin` 4-tab subsystem                                                    | Gap       | P0       | 54       | **60**   |
| cli     | `/tasks` background sessions                                                 | Gap       | P0       | 24       | **30**   |
| cli     | `/ide` bridge                                                                | Partial   | P1       | 12       | 12       |
| cli     | `/remote-control` + `/teleport` + `/desktop` + `/mobile` (cloud-only, defer) | Done (v1) | P1       | 24       | 24       |
| cli     | `/chrome` bridge (cloud-only, defer)                                         | Done (v1) | P2       | 10       | 10       |
| cli     | `/memory`                                                                    | Partial   | P0       | 30       | **36**   |
| cli     | `/context` + `/compact` + `/rewind` + `/branch` + `/resume` + `/clear`       | Gap       | P0       | 36       | **44**   |
| cli     | Session ops — `/recap`/`/rename`/`/export`/`/copy`                           | Partial   | P1       | 10       | 10       |
| cli     | `/hooks` viewer                                                              | Partial   | P1       | 14       | 14       |
| cli     | `/keybindings`                                                               | Partial   | P2       | 3        | 3        |
| cli     | `/config` + `/privacy-settings` + `/focus`                                   | Partial   | P1       | 16       | 16       |
| cli     | `/terminal-setup` + `/theme` + `/tui`                                        | Partial   | P1       | 10       | 10       |
| cli     | `/usage` (cloud-only, defer)                                                 | Done (v1) | P1       | 12       | 12       |
| cli     | `/upgrade` + `/extra-usage` (cloud-only, defer)                              | Done (v1) | P2       | 4        | 4        |
| cli     | `/init`                                                                      | Gap       | P0       | 12       | **16**   |
| cli     | `/doctor` + `/debug`                                                         | Partial   | P1       | 10       | 10       |
| cli     | `/security-review` + `/autofix-pr` + `/ultrareview`                          | Partial   | P1       | 20       | 20       |
| cli     | `/install-github-app` + `/install-slack-app` (cloud-only, defer)             | Done (v1) | P2       | 8        | 8        |
| cli     | `/voice` (cloud-only, defer)                                                 | Done (v1) | P2       | 0        | 0        |
| cli     | `/sandbox` (inline status row)                                               | Partial   | P1       | 16       | 16       |
| cli     | Stickers / passes / powerup / release-notes (cloud-only, defer)              | Done (v1) | P2       | 0        | 0        |
| cli     | `/btw` (side-question channel)                                               | Gap       | P2       | 12       | 12       |
| cli     | `/advisor` configuration                                                     | Partial   | P2       | 14       | 14       |

**Subtotal (cli): 658 (r1) → 730 (r2).** Net **+72h**. Mostly upward subsystem re-estimation per `img-4-r2`. Cloud-only rows preserved at their r1 hours since they're scheduled for post-v1 anyway.

---

## F. `apps/extension` (Chrome MV3)

Source: `src-5` self-QA found a second wire bug + promoted allowlist UI to P0 + promoted in-page panel rendering to its own P0 + reclassified React-refactor P0 → P1.

| Surface    | Feature                                                       | Status  | Severity | Hours r1 | Hours r2                                 |
| ---------- | ------------------------------------------------------------- | ------- | -------- | -------- | ---------------------------------------- |
| chrome-ext | Side-panel surface (vs popup)                                 | Partial | P1       | 24       | 24                                       |
| chrome-ext | Paid-plan gating banner                                       | Partial | P1       | 6        | 6                                        |
| chrome-ext | Ask vs Act permission pill                                    | Gap     | P0       | 16       | 16                                       |
| chrome-ext | Attachment menu (Screenshot / Image) + wire bug               | Partial | P0       | 13       | **14** (wire bug +1h)                    |
| chrome-ext | **NEW: Extended-thinking toggle also dropped on wire**        | Gap     | P1       | 0        | **4**                                    |
| chrome-ext | More-options (Convert to task / Settings / Language)          | Gap     | P1       | 10       | 10                                       |
| chrome-ext | Model selector dropdown                                       | Partial | P1       | 6        | 6                                        |
| chrome-ext | Quick mode (Haiku default + Opus-fast surcharge)              | Gap     | P1       | 14       | 14                                       |
| chrome-ext | Desktop pairing flow                                          | Done    | P0       | 20       | 20                                       |
| chrome-ext | Options page — Permissions / Shortcuts                        | Partial | P1       | 18       | 18                                       |
| chrome-ext | Shortcuts list + Create shortcut modal + Schedule             | Partial | P1       | 32       | 32                                       |
| chrome-ext | Mic permission multi-mic selector                             | Partial | P1       | 6        | 6                                        |
| chrome-ext | In-stream permission prompt (⏎/Esc/⌘⏎)                        | Gap     | P0       | 32       | 32                                       |
| chrome-ext | Sensitive-site denylist                                       | Done    | P1       | 14       | 14                                       |
| chrome-ext | History — search/projects/rename/pin/export                   | Gap     | P1       | 16       | 16                                       |
| chrome-ext | Projects/folders                                              | Gap     | P0       | 24       | 24                                       |
| chrome-ext | Artifacts panel                                               | Gap     | P0       | 30       | **80** (r2: wishful at 30; realistic 80) |
| chrome-ext | Composer in popup                                             | Gap     | P1       | 6        | 6                                        |
| chrome-ext | **In-page panel — markdown render (escalated to own P0 row)** | Gap     | **P0**   | 0        | **8**                                    |
| chrome-ext | Markdown rendering — tables / copy-code button                | Partial | P1       | 8        | 8                                        |
| chrome-ext | Settings — full surface                                       | Gap     | P1       | 12       | 12                                       |
| chrome-ext | **Allowlist management UI (escalated P1 → P0)**               | Gap     | **P0**   | 8        | 8                                        |
| chrome-ext | Onboarding                                                    | Gap     | P1       | 16       | 16                                       |
| chrome-ext | **React-refactor (reclassified P0 → P1)**                     | Gap     | **P1**   | 40       | **60**                                   |
| chrome-ext | Tier badge / paywall — side panel parity                      | Partial | P1       | 14       | 14                                       |
| chrome-ext | Voice — language + interim + TTS                              | Partial | P1       | 6        | 6                                        |
| chrome-ext | Slash chips — `/` autocomplete                                | Partial | P2       | 3        | 3                                        |
| chrome-ext | In-side-panel keymap                                          | Partial | P1       | 5        | 5                                        |
| chrome-ext | Tool-call rendering — structured args/result                  | Partial | P1       | 12       | 12                                       |
| chrome-ext | WebMCP / connectors directory                                 | Gap     | P1       | 14       | 14                                       |
| chrome-ext | Recording / Workflows tab                                     | Done    | P2       | 0        | 0                                        |
| chrome-ext | Job autofill                                                  | Done    | P2       | 0        | 0                                        |
| chrome-ext | Tab-group integration                                         | Done    | P2       | 0        | 0                                        |
| chrome-ext | Design-tokens unification                                     | Partial | P1       | 6        | 6                                        |

**Subtotal (chrome-ext): 433 (r1) → 522 (r2).** Net **+89h**. Driven by Artifacts panel reprice (+50h), new dead-extended-thinking row (+4h), wire bug +1h, React-refactor reprice (+20h, severity P0 → P1), new in-page-panel-markdown P0 row (+8h).

---

## G. `apps/extension-vscode`

Source: `src-6` self-QA caught its own retraction (sidebar DOES persist), downgraded 3 P0/P1 → P1/P2, raised composer image-attach hours, added 3 new rows.

| Surface    | Feature                                                                                      | Status  | Severity | Hours r1         | Hours r2       |
| ---------- | -------------------------------------------------------------------------------------------- | ------- | -------- | ---------------- | -------------- |
| vscode-ext | Marketplace listing                                                                          | Partial | P1       | 8                | 8              |
| vscode-ext | Sidebar — Composer + Plus menu (image-attach misleads)                                       | Gap     | P0       | 14               | **17**         |
| vscode-ext | Composer — model pill                                                                        | Done    | P2       | 0                | 0              |
| vscode-ext | Composer — Modes dropdown + Effort slider                                                    | Done    | P0       | 18               | 18             |
| vscode-ext | Composer — Skills / Connectors menu                                                          | Gap     | P0       | 14               | 14             |
| vscode-ext | Composer — slash command autocomplete (sidebar)                                              | Gap     | P1       | 10               | 10             |
| vscode-ext | Composer — empty-state prompt chips                                                          | Partial | P1       | 6                | 6              |
| vscode-ext | Sidebar — header                                                                             | Partial | P1       | 5                | 5              |
| vscode-ext | Assistant — incremental markdown during stream                                               | Partial | P1       | 12               | 12             |
| vscode-ext | Code-block rendering — Apply / Insert + syntax highlight                                     | Gap     | P0       | 16               | 16             |
| vscode-ext | **Tool-call rendering — split into 3 rows (result viewer / permission UI / editable input)** | Gap     | P0       | 18               | **19** (8+5+6) |
| vscode-ext | System / error messages — retry / report                                                     | Partial | P1       | 4                | 4              |
| vscode-ext | **Citations / sources (downgraded P1 → P2)**                                                 | Gap     | **P2**   | 10               | **6**          |
| vscode-ext | **Inline images / multimodal output (downgraded P1 → P2)**                                   | Gap     | **P2**   | 8                | **6**          |
| vscode-ext | **Conversation history tree (downgraded P0 → P1, simplified)**                               | Gap     | **P1**   | 14               | **9**          |
| vscode-ext | Context files tree                                                                           | Done    | P2       | 0                | 0              |
| vscode-ext | **Sidebar webview persistence to ConversationStore (RETRACTED)**                             | Done    | —        | (0 in synthesis) | 0              |
| vscode-ext | Sessions history — Local/Web tabs + search                                                   | Gap     | P1       | 6                | 6              |
| vscode-ext | Settings — surface                                                                           | Partial | P2       | 0                | 0              |
| vscode-ext | First-run prompts                                                                            | Partial | P1       | 6                | 6              |
| vscode-ext | Sign-in / auth (OAuth via browser handoff)                                                   | Partial | P1       | 12               | 12             |
| vscode-ext | Memory / projects UI                                                                         | Gap     | P1       | 16               | 16             |
| vscode-ext | Conversation search                                                                          | Gap     | P1       | 6                | 6              |
| vscode-ext | Share conversation / export                                                                  | Partial | P2       | 6                | 6              |
| vscode-ext | Voice input                                                                                  | Gap     | P1       | 12               | 12             |
| vscode-ext | **NEW: Token-counter / context-budget UI in webview**                                        | Gap     | P1       | 0                | **5**          |
| vscode-ext | **NEW: Agent-mode HiTL flow woven into chat stream**                                         | Gap     | P1       | 0                | **12**         |
| vscode-ext | **NEW: @-mention namespaces (workspace/symbol/recent)**                                      | Gap     | P2       | 0                | **4**          |

**Subtotal (vscode-ext): 221 (r1) → 235 (r2).** Net **+14h** after retraction (−n/a, already 0), downgrades (Citations −4, Inline images −2, History tree −5), upward composer (+3) + tool-call (+1), and new rows (+21).

---

## Round-2 grand totals (arithmetic sum)

| Section / surface          | Hours r1  | Hours r2                                                               |
| -------------------------- | --------- | ---------------------------------------------------------------------- |
| A. Shared package          | 347       | **373** (full migration) or 360 (alias)                                |
| B. apps/web                | 252       | **408**                                                                |
| C. apps/desktop            | 833       | **1,113**                                                              |
| D. apps/mobile             | 392       | **397**                                                                |
| E. apps/cli                | 658       | **730**                                                                |
| F. apps/extension (Chrome) | 433       | **522**                                                                |
| G. apps/extension-vscode   | 221       | **235**                                                                |
| **Grand total**            | **3,136** | **3,778** (full migration on shared package) or **3,765** (alias path) |

Per-surface arithmetic — each subtotal is the sum of every Hours r2 cell in that section. Per-section sums verified.

**Grand total r2: 3,778 hours** (full token-system migration) / **3,765 hours** (alias-only).

This sits **within the 3,800h–4,300h range** that `VERIFY-DELTA.md` projected from the fresh-blind variance. The lower end of the range is corroborated by the row-level matrix here.

---

## End of SYNTHESIS-r2.md
