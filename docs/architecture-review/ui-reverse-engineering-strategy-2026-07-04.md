# UI Reverse-Engineering Strategy — Claude Reference Screenshots (153 images)

Status: Draft for founder review
Scope: `/Users/siddhartha/Desktop/reference/claude_reference/` — all 153 images, every surface (web-free, web-max, desktop app, desktop-cowork, desktop-free, mobile, CLI, VS Code, Cursor, Chrome extension, Artifacts, Settings)
Method: 10 parallel agents read every image, cross-referenced against the corresponding `docs/products/*` volume files (229 volumes across 7 products) and, where relevant, the actual source files.
Architecture constraint applied throughout: **web and desktop share UI via `packages/` (web canonical, desktop = same components + desktop-only extras); mobile shares data/logic, not view code; chats/settings/memory/projects sync ONLY in Cloud mode, never Local/BYOK.** Tweaks below are grouped by that reuse boundary, not duplicated per-surface.

---

## 0. How to read this doc

Each finding is tagged:

- **(a) accurate** — already specced correctly, no action.
- **(b) tweak** — volume exists, missing detail from the reference; cite exact section to add to.
- **(c) gap** — no volume owns this at all; needs new spec content.
- **(d) conflict** — reference shows something that contradicts an existing locked decision; needs a founder call before anyone writes spec or code.

Priority tiers for sequencing (not effort estimates — see the production-timeline conversation for those):

- **P0** — trust-boundary/safety, do alongside the production push already scoped.
- **P1** — highest-density UI gap, blocks "looks like a real product" parity.
- **P2** — real but narrower gaps, do after P1.
- **P3** — nice-to-have polish / founder-decision-gated, do after a decision or in a later pass.

---

## 1. Shared web+desktop UI (packages/unified-chat, packages/ui) — P1, the single biggest finding

**This is the most important section in the whole doc.** Every one of the 10 agents that touched chat/artifacts/reasoning UI independently converged on the same conclusion: `docs/products/agi-web/volume-05-ai-response-rendering.md`, `agi-desktop/volume-06-ai-response-rendering.md`, and `agi-mobile/volume-10-ai-response-rendering.md` all correctly **cite** the real components (`ArtifactBlock.tsx`, `ToolCallCard.tsx`, `ArtifactsPanel.tsx`, desktop's `ArtifactRenderer.tsx`/`MermaidArtifact.tsx`/`SvgArtifact.tsx`, mobile's `ArtifactFullScreen.tsx`) as built — but **none of the three volumes ever specifies what those components should render.** The code exists; the contract doesn't. Per the shared-packages mandate, this should be written **once**, in the shared-package spec, not three times.

### 1.1 Tool-call card anatomy — (c) gap

- Collapsed row: icon (search/function/terminal/file-type glyph) + verb-phrase title + contextual sub-pill — `Result` for reads, `Script` for shell/exec, **literal filename** for file writes.
- Steps group under one collapsible header ("Used Filesystem integration, loaded tools ⌄"), terminating in a `Done` checkmark row.
- Expanded state reveals a bordered `Request`/`Response` two-part card (Request often literal JSON, Response often plain text) — one card, two internal sections, not two cards.
- Multi-file "presented" step collapses to a single `Presented N files` line even when N files were created individually above it.
- Source images: 378, 379, 382, 385, 397, 398, 401.

### 1.2 Reasoning / thinking blocks — (c) gap

- Clock icon (⏱) marks a reasoning line — purely iconographic, **not** a duration/timer readout.
- Bold one-line summary + chevron caps/collapses the whole reasoning group; long thoughts truncate with an inline `Show more` link.
- Reasoning groups and tool-call groups share the same collapsed-row visual language so they interleave in one timeline (this is what lets 108/115-120 show reasoning→search→reasoning chains).
- Source images: 108, 386, 390, 397, 400.

### 1.3 Artifact viewer/editor chrome — (c) gap

- Toolbar: eye/code segmented toggle (preview vs. source) left, filename + `· TYPE` label center, right cluster = Copy / more-options chevron / refresh-regenerate / close.
- PDF artifacts drop the eye/code toggle **and** the Copy button entirely (no source concept, can't copy binary) — download/refresh/close only.
- Split-pane presentation (chat ~40% left, artifact ~60% right, draggable divider) is a **distinct layout** from the toggle-panel `ArtifactsPanel.tsx` we have today — add as a new layout mode, don't conflate with the existing panel.
- "Copy ▾" should be a split-button exposing "Download as Markdown"/"Download as PDF," not a single copy action.
- Source images: 080/081 (live interactive artifact state — segmented toggle changes data, state persists across clicks, confirming these are stateful React components, not static renders), 088/391/393/394/399 (chrome), 094/095/118 (split-pane), 396 (PDF variant).

### 1.4 Multi-artifact responses — (c) gap

- N artifacts render as a vertical card stack (icon + filename + type subtitle + action button per card), followed by one `Download all` button — separate from the per-message copy/thumbs/regenerate row.
- Source images: 392, 401.

### 1.5 Smaller shared-chat items — (b) tweaks

- Scroll-to-bottom floating button (small dark circle, chevron, centered above composer) — verify it isn't already owned by `volume-04-chat.md` before filing as a pure gap. Source: 380.
- Pasted-content preview: large pastes render as a separate truncated preview card tagged `PASTED`, stacked above the typed message bubble — not merged into one bubble. Source: 389.
- "Relevant chats" cross-conversation retrieval renders as just another inline tool-step (chat-bubble icon + title + result count → card of past-chat titles) — check `volume-10-memory.md` before filing as gap vs. tweak. Source: 384.
- Inline web-search pattern is two distinct UI moments, not one: a query-execution row (globe icon + literal query text + `N results`) during search, then citation chips/pills after the answer is written. Current spec only describes the latter. Source: 035, 096, 120, 381.
- Deep-research side panel: a full timeline UI ("Research plan created" → "Gathered N sources" with a per-domain bar-chart breakdown → topic-clustered query groups each with a synthesized paragraph + source-count footer → "Done") is completely unspecced despite `ResearchPanel.tsx`/`research-panel-store.ts` being ✅ built per `volume-09-search.md`. This is a **tweak**, not a gap — the backend/store exists, only the UI contract is missing. Source: 096, 120.

**Action:** write one new shared section — likely `packages/unified-chat`'s own spec doc, or a net-new `volume-05a-tool-call-and-reasoning-ui.md` referenced by all three product specs rather than repeated — covering 1.1–1.4. Mobile inherits the data model but renders its own RN views over it per the DOM-vs-RN reality already documented in memory.

---

## 2. Desktop-specific (Tauri chrome, connectors/MCP, settings) — P1/P2

### 2.1 Connector permission granularity — (b) tweak, real code gap too

Reference shows a consistent pattern across every connector detail view: tools grouped into categories (Read-only / Write-delete / Interactive / Other), each category with a **bulk default** (Always allow / Needs approval / Blocked / **Custom**) and each individual tool row with its own override (3-icon segmented control). Our actual `ConnectorDetailView.tsx` already implements the 3-state dropdown with per-tool override — genuinely close — but is missing the **Custom** option and the category-level bulk-apply UX. `MCPServerSettings.tsx`, by contrast, is still a plain boolean checkbox per tool with no grouping at all — a real implementation gap, not just a doc gap.

- Add to `volume-17-settings.md` §Connected Services + `volume-19-security.md`.
- Source: 164, 167, 169, 170, 213, 214, 249.

### 2.2 Local MCP server client-side management — (c) gap, real

Claude's "Local MCP servers" screen (per-server list with running/stopped status pill, "managed by extension" note, Command/Arguments readout, View Logs, raw JSON "Edit Config") has **no equivalent** in our product. `CustomRemoteMcpConnectorDialog.tsx` only supports adding one custom remote connector via a form — no list, no status, no logs. This is distinct from (and often confused with) `MCPServerSettings.tsx`, which exposes _our own app_ as an MCP server to external clients — the reverse direction.

- Add new subsection to `volume-14-desktop-integrations.md` or `volume-17-settings.md`.
- Source: 240.

### 2.3 "Plugin" bundling concept — (c) gap, potentially large new surface

Claude has a distinct product concept — a **Plugin**: a named, versioned, marketplace-installable bundle of Skills + Connectors + legal/compliance disclosure, distinct from a bare Connector or a bare Skill. Includes: "Personal plugins" sidebar list, plugin detail view (Source/Version/Author/Last updated/Description + Update/Customize/toggle/⋯ menu), a per-plugin Skills sub-tab (skill browser with raw-markdown source preview + Trigger metadata), a per-plugin Connectors sub-tab (plugin-scoped recommended connectors), a "Browse plugins" marketplace overlay (search/filter/sort, category grid, publisher + download count), and a "Create plugin" authoring flow. **This does not exist anywhere in our 33-volume desktop spec or in code.** This is the single largest net-new scope item in the whole audit — flag to founder before committing time, it is not a small tweak.

- Source: 203–207, 253.

### 2.4 Desktop settings — (b) tweaks, smaller

- Directory/browse pattern for connectors (`ConnectorGallery.tsx`) already matches the reference structurally (search, category filter, connected/available sections) — missing only: popularity rank (#N popular), New/Trending/Beta/Interactive badges, "Available to your team" org grouping (no-op until org/team concept exists). Source: 251, 252, 255, 256.
- OAuth-connector lifecycle (Connect/Disconnect + external-tab sign-in + "Relaunch the tab" fallback) vs. local/native-connector lifecycle (Enabled toggle + Uninstall) should be documented as two distinct patterns, not one. Source: 168 vs. 174/175.
- Filesystem-style connector-specific config sub-blocks (e.g., "Allowed Directories" path list with add/remove/Save) should be documented as a general pattern for connectors with their own settings, not just described inline for Filesystem. We already have `AllowedDirectoriesSettings.tsx` — this is doc-only. Source: 171, 172.
- "Dispatch (Beta)" tab (async background-task thread with mobile check-in/notification copy) doesn't belong under Settings/Integrations at all — route to whichever volume covers Projects/scheduled tasks. Source: 230.

---

## 3. Web-specific (pricing, home/library pages, settings body) — P1/P2, includes 3 founder decisions

### 3.1 (d) CONFLICT — Incognito/private chat mode

Reference shows a distinct un-persisted mode (black background, dashed-border composer, explicit "not saved, added to memory, or used to train" disclaimer). This **directly conflicts** with `volume-04-chat.md`'s current hard invariant that every web conversation is a persisted, RLS-scoped Managed-Cloud row. **Do not spec this until the founder makes an explicit scope call** — it's an architectural decision (a genuinely non-persisted chat mode is a new trust boundary), not a UI tweak. Source: 043.

### 3.2 (d) CONFLICT — Team tier

`volume-13-subscription.md` currently retires "Team" as a pricing tier in favor of Enterprise-covers-everything. Reference shows a fully-designed Team card (per-seat $20 standard / $100 premium, 5–150 users) sitting alongside Enterprise. Confirm with founder whether Team is truly dead or should inform a future re-introduction before anyone builds a Team pricing page. Source: 085, 177.

### 3.3 (d) CONFLICT — Usage credit top-ups

Reference's Usage tab has a full credit/overage system (buy credits, auto-reload, spend limit, balance). Our `volume-13-subscription.md` explicitly lists "no credit top-ups" as an anti-pattern / intentional differentiation (already reasoned through per project pricing memory). **This is confirmed-intentional, not a gap** — flagging here only so nobody "fixes" this into matching Claude's system later. No action needed. Source: 406.

### 3.4 (c) gaps — net-new pages

- **Artifacts library/grid page** — a dedicated `/artifacts` page (search bar, "New artifact" button, 3-column card grid: title + excerpt + last-edited) is missing entirely from the web spec canon, at any volume. Source: 038.
- **Standalone Chats list page** distinct from the sidebar's time-bucketed Recents — flat list, "Select chats" bulk-action button, per-row relative timestamp. Source: 039.
- Settings: **"Usage" and "AGI Code" are both locked top-level tabs in `volume-12-settings.md`'s IA (line 13) with zero spec body written for either.** This is the biggest settings-specific finding — the IA promises these tabs exist but nothing describes their contents. Usage needs: session-quota bar, weekly all-models vs. per-model quota bars, feature-specific quota rows. "AGI Code" (if we have a CLI-in-web settings concept) needs its own full section — referral, code-appearance theme/font, session classification, PR automation, auth-token management, session deletion, sharing controls — modeled on Claude Code's settings sub-app. Confirm whether an "AGI Code" web settings surface is even in scope before writing this section. Source: 406, 409, 413 (`claude-code-appearance-general-pr-top`), 414 (`claude-code-pullrequests-and-tokens`), 415 (`claude-code-auth-tokens-list`), 416 (`claude-code-sessions-and-sharing`) — renamed from their original mislabeled filenames (`claude-code-execution`, `general-pull-requests`, `capabilities-memory-2`, `connectors-connected-apps`) to match actual on-screen content; 415/416 are a real scroll-continuation pair (auth-token pagination + a distinct "Claude Code (CLI, Desktop, IDE)" section with Delete-sessions/Sharing-settings), not duplicates of each other.
- Settings: Claude has **retired Connectors as its own settings tab**, redirecting it into a separate "Customize" browse surface (408). We still spec Connectors as a Settings tab — deliberate decision needed on whether to follow that consolidation or keep our current IA.
- Skills: named in nav (`volume-12-settings.md` line 13) with zero detail anywhere else. Reference shows a full surface: personal-skills list with expandable file tree (SKILL.md/README.md/etc.), per-skill toggle, metadata (Added by/Last updated/Trigger), Preview/Code-toggle raw-markdown viewer, "Allowed tools" scope line. Check whether any Skills backend exists before writing status labels. Source: 139.

### 3.5 (b) tweaks

- `+` add-menu exact item set/order: Add files or photos, Take a screenshot, Add to project, Add from GitHub, Skills, Add connectors, Web search (toggle), Use style — current spec only lists a generic tools popover. Source: 017.
- Model selector: per-model one-line subtext, locked/gated model shows "Upgrade" badge + hover tooltip, separate "Adaptive thinking" toggle distinct from model choice. Source: 016.
- Downgrade UX: project-knowledge-capacity-exceeded pattern (blocking red composer banner + red overfilled progress bar + "Remove files to continue" copy) isn't specced anywhere despite per-plan knowledge caps already being tracked in `volume-11-projects.md`. Source: 159.
- Connector per-tool permission granularity in web settings (same pattern as desktop §2.1) needs the same tweak applied to `volume-12-settings.md`. Source: 138.
- Login page keeps full marketing nav + a "Download desktop app" CTA even on `/login` — confirm whether AGI's auth shell should match or intentionally stays stripped-down. Source: 044.

---

## 4. Mobile-specific — P2 (mostly cheap wins — code already exists, docs don't)

The good news here: several "gaps" are actually **already built and just undocumented** — cheapest category in this whole audit.

- **Artifacts gallery is already built** (`apps/mobile/app/(app)/artifacts/index.tsx` + `src/features/artifacts/{index.tsx,store.ts,types.ts}`, 2-column grid, kind badges, skeleton loading state) but has zero spec section anywhere. Pure documentation task. Source: 283, 284.
- **Profile screen** (Full Name/Nickname fields, Personal Preferences textarea with disabled-until-dirty Save button, Delete account) and **Capabilities/Tool-access screen** (Artifacts/Code-execution/Web-search toggles, Memory subsection with nested "View your memory" nav card, tri-state Tool-access radio group: Auto/On-demand/Always-available) are both real, presumably-built screens with no home in `volume-23-settings.md`. Source: 266/270/274, 268/272/275/278.
- Permissions screen (Location/Calendar/Reminders with inline value+chevron, e.g. "Read only"/"Read & write") — confirmed ✅ already matches, no change needed. Source: 270, 276.
- Shared Links section needs its own subsection (empty-state copy/icon, share-created-from-chat flow, manage/revoke) — currently only a passing mention inside Data Controls. Source: 273, 280.
- Connectors screen for mobile settings (badge-count for connected, grey "Connect" + external-link icon for not-connected, "Connector discovery" toggle) is fully undocumented. Source: 269.
- Upgrade/Plans sheet: adopt the two-tile (monthly/annual + "Save %") + bullet-checklist + "Limits apply" + Terms/Privacy footer **layout pattern** — do **not** copy the INR figures shown (Claude's own pricing; ours are TBD per locked pricing canon). Source: 285, 286.
- Home greeting is vertically centered in the empty space (not top-anchored) and is time-aware personalized copy ("Up late, {name}?") — add as explicit requirement to `volume-07-home.md`. Source: 258, 263.
- **Note:** two images in the source library were mislabeled (271/272 claimed "billing"/"capabilities" but are actually the light-theme counterparts of 277/278's "spoken-language"/"notifications" screens) — **fixed**: renamed to `271_mobile__settings-spoken-language_light.png` and `272_mobile__settings-notifications_light.png`. Don't mistake this pair for a missing light-mode screenshot of billing/capabilities — those screens just aren't in this reference set.
- Explicit non-gaps: BYOK, starter cards, auto-sync-without-consent are intentionally absent per already-locked trust model — do not backport just because Claude's reference has them.

---

## 5. CLI-specific — P2

- Theme selector: our `theme_picker.rs` already ships 6 themes (Dark/Light/Ansi/SolarizedDark/SolarizedLight/Colorblind) — same count as Claude's 6, different composition. Add doc: enumerate the 6 choices + the live diff-preview pane shown during selection. Source: 290.
- Status bar: shift+tab permission-mode cycling + persistent red "bypass permissions on" chip isn't documented (our `--dangerously-skip-permissions` exists in code/security volume, but not this UI detail). Source: 287.
- First-run auth chooser: no volume specs what the CLI's actual first-run auth screen looks like (ours is architecturally more divergent — 3 trust modes + multi-provider BYOK table vs. Claude's single-vendor 3-way picker — so this is not a literal port, just a missing "what does ours actually show" spec). Source: 288, 289.

---

## 6. VS Code / Cursor extension — P2

- In-composer "Modes" popover (Ask before edits / Edit automatically / Plan mode / Bypass permissions) with shift+tab cycling — the underlying setting (`agiWorkforce.agent.mode`) already exists as a settings.json key; needs an in-composer UI control, not just a config key. Source: 322.
- Same for the effort slider — `agiWorkforce.agent.effort` exists as a key; needs an in-composer slider. Source: 322, 323.
- Unified composer "…" action menu (Attach file, Mention file, Clear conversation, **Rewind**/checkpoint-restore, Switch model, Account & usage, fast-mode toggle) — no equivalent exists as one filterable menu today. Source: 323.
- Lightweight `+`-button quick-attach popup (Upload from computer / Add context) distinct from the fuller action menu. Source: 324.
- Queue-message-while-streaming composer state + stop button; consider rotating thinking-status verbs ("Thought for 0s" → "Looking at…" → "Cogitating…"). Source: 333.
- Document the intentional divergence: our webview architecture doesn't need process-wrapper-path/use-terminal/ctrl-enter-to-send/python-env settings that Claude's terminal-wrapping extension has — state this explicitly rather than silently omitting. Source: 320, 321.

---

## 7. Chrome extension — P0 (two items tie directly into an already-tracked trust-boundary bug)

This is the only surface where the reference comparison surfaces a **safety-relevant** finding, not just a UI gap, and it lines up with an issue already in project memory (dormant RLS / allow-all computer-use trust-boundary risk).

- **Ask-before-acting default.** Claude's composer has an explicit "Ask before acting" vs. "Act without asking" dropdown, defaulting to **Ask**. Spec this UI (§`volume-08-browser-actions.md`) and — more importantly — confirm/fix our own default to fail-closed; this is a live P0 gap per existing project memory, not just a doc gap. Source: 341.
- **Sensitive-site hard block.** Claude has a real navigation-level interstitial (`blocked.html` full-tab page + matching side-panel shield-icon empty state) for categories like banking/health/gov. Our `volume-18-security.md` already tracks a cookie-layer blocklist as built but marks the **user-facing interstitial as "Planned."** Build it — this is the highest-priority single item across the whole Chrome extension batch. Source: 352.
- Smaller tweaks: three-tier model selector (capability/efficiency/speed descriptors), "Quick mode is experimental" confirmation modal (safety disclaimer + premium-rate cost disclaimer before switching to a fast/cheap model), desktop-pairing flow UI (named-browser text field, Ignore/Connect), options-page restructure to explicit left-nav (Permissions/Shortcuts/Options), runtime permission-escalation inline chat card ("New permissions required" + Allow/Decline/Always-allow with keyboard shortcuts), shortcut-creation modal, voice-narration mic-permission flow. Source: 343, 344, 345, 349, 350/357, 351, 353/354, 355.

---

## 8. Priority-ordered action list

1. **P0** — Chrome ext: fix Ask/Act default to fail-closed; build the sensitive-site interstitial. (Ties into an already-tracked trust-boundary bug — do alongside the production-readiness push, not after.)
2. **P1** — Write the shared tool-call-card / reasoning-block / artifact-viewer-chrome / multi-artifact-response spec once, in the shared-package layer (§1). This is the highest-density, highest-reuse gap in the whole audit and unblocks accurate implementation across web + desktop simultaneously.
3. **P1** — Desktop connector-permission granularity (Custom option + category bulk-apply) — closes the gap between spec-close-but-incomplete and matches what's already 90% built in `ConnectorDetailView.tsx`.
4. **P2** — Mobile: document the already-built Artifacts gallery, Profile, and Capabilities screens (cheapest wins in the whole audit — pure documentation, no new code).
5. **P2** — Web: write the missing "Usage" and "AGI Code" settings sections (IA already promises them; currently empty).
6. **P2** — Desktop: spec Local MCP server client-side management (list/status/logs/config) — real, uncontested gap.
7. **P3, founder decision required first** — Incognito mode (architectural conflict), Team tier (pricing conflict), Plugin bundling concept (large net-new surface, scope before building), Artifacts library/grid page for web (net-new page), CLI/VS Code in-composer mode+effort controls (config-to-UI work, not blocked on anything but sequencing).

## 9. Explicitly NOT to copy (confirmed-intentional divergences — do not "fix" these later)

- Usage-credit top-up system (web) — we deliberately don't have this.
- Mobile BYOK, starter cards, silent Local→Cloud sync — locked out by trust model.
- Mobile/desktop pricing figures shown in reference screenshots — Claude's own numbers, not ours (ours are TBD per locked pricing canon where not yet set).
- "Open in Comet"/"Open in Antigravity" buttons seen in a couple of artifact-card captures — these are third-party browser/IDE chrome bleeding into the reference set, not claude.ai's own UI; adopt the surrounding card layout, not that specific button.
