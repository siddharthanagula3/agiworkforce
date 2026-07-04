# UI Implementation Status — Verified Against Real Code (2026-07-04)

Status: Draft for founder review
Companion to: `ui-reverse-engineering-strategy-2026-07-04.md` (which was a doc-vs-reference comparison). This doc is a **code-vs-reference** comparison — 7 parallel agents read the actual source (frontend, backend, shared packages) to check what's really implemented, wired, and reachable, not just what's specced.

Method note: several items previously reported as "gaps" in the strategy doc turned out to have real (sometimes complete, sometimes dead-code) implementations once someone actually grepped the source instead of the docs. That correction is the main value of this pass — treat this doc as authoritative over the strategy doc wherever they disagree.

---

## 0. Top-line finding: the shared-packages mandate is not happening in practice

This is the single most important result of the whole audit. The founder-locked architecture rule is: **web is canonical, desktop reuses the same components via `packages/unified-chat` + `packages/ui`, mobile shares data/logic.** Verified reality:

**`packages/unified-chat`'s shared components — `ToolCallCard`, `ToolTimeline`, `ThinkingBlock`, `ArtifactPanel` — exist, are exported, and are imported by neither `apps/web` nor `apps/desktop`.** Every piece of core chat UI has an independent fork on each surface:

| Component            | Web location                                                    | Desktop location                                                                                                                                         | packages/unified-chat               |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tool-call card       | `features/chat/components/ToolTimeline.tsx`, `ToolCallCard.tsx` | `features/chat/ToolTimeline.tsx`, `MessageBubble/ToolCallCard.tsx`                                                                                       | exists, unused                      |
| Reasoning block      | `ThinkingBlock.tsx`                                             | `ThinkingBlock.tsx`                                                                                                                                      | exists, unused (3rd near-duplicate) |
| Artifact viewer      | `ArtifactPreview.tsx` (full chrome)                             | **two** unrelated viewers: `canvas/ArtifactPreview.tsx` (minimal, no chrome) + `artifacts/ArtifactPanel.tsx` (full chrome)                               | exists, unused                      |
| Multi-artifact stack | `ArtifactsPanel.tsx`                                            | `ArtifactPanel.tsx`                                                                                                                                      | —                                   |
| Scroll-to-bottom     | named component `ChatMessageList.tsx`                           | inlined JSX in `ChatStream.tsx`                                                                                                                          | —                                   |
| Pasted-content badge | ✅ exists (`MessageBubble.tsx`)                                 | ❌ no equivalent                                                                                                                                         | —                                   |
| "Relevant chats"     | ❌ no equivalent                                                | ✅ exists (`RelevantChatsList.tsx`)                                                                                                                      | —                                   |
| Deep-research panel  | `ResearchPanel.tsx` — a citations sidebar                       | `ResearchPanel.tsx` (733 lines) **and** `DeepResearchPanel.tsx` (296 lines) — two different desktop implementations, both a different feature than web's | —                                   |

**Desktop is internally inconsistent, not just divergent from web** — it has two separate artifact viewers and two separate research panels within its own codebase. The split-pane artifact layout (chat 40% / artifact 60% / draggable divider) described in the reference doesn't ship on either surface: web has zero wiring for it, and desktop's `ArtifactWorkspaceLayout` is a fixed 50/50 layout with no drag handle and is itself dead/unreferenced code.

**Recommendation:** before adding any new UI to close the reference-parity gaps in the strategy doc, do a consolidation pass — delete the dead `packages/unified-chat` components if they're not going to be adopted, or (preferred, per the founder's standing mandate) migrate web's implementation into the package and have desktop consume it, deleting both forks. Building new features on top of the current forked structure will make the eventual consolidation harder, not easier.

---

## 1. Real bugs found (independent of Claude-reference parity — fix regardless)

These aren't "doesn't match Claude" gaps — they're functional defects or orphaned-but-complete work discovered while doing the comparison.

1. **Web: a fully-built, unit-tested per-tool connector permission control is completely disconnected from the live UI.** `features/connectors/components/ToolPermissionsPanel.tsx` + `stores/tool-permissions-store.ts` implement exactly the 3-state allow/ask/deny granularity the reference shows — but it's imported only by its own test file. The live `ConnectorsPage.tsx` (978 lines) only exposes connect/disconnect, no per-tool control at all. This is close to a one-line wiring fix, not new engineering.
2. **Desktop: same pattern.** `features/mcp/MCPServerManager.tsx` — full server list, Start/Stop, Configure, **View Logs** (wired to `MCPLogsViewer`), Uninstall — is dead code, self-exported but never imported by any route. The live path (`MCPWorkspace.tsx` + `MCPServerCard.tsx` + `MCPConfigEditor.tsx`) is real but weaker (no logs button, config view is read-only display not an editable raw-JSON textarea).
3. **VS Code extension: the "+ Add context" quick-attach menu item is mis-wired** — its click handler (`webviewContent.ts:1507-1513`) posts `openModePicker`, so clicking "Add context" actually opens the agent-mode picker instead of any attach/context action. Real functional defect, not a completeness gap.
4. **CLI: `--dangerously-skip-permissions` doesn't drive its own status indicator.** The flag only sets `session.skip_permissions` (`tui_app.rs:3022,2134`) — it never touches `app.mode`, which always starts at `Chat` (`tui_app.rs:369`). So launching with the flag active shows the default mode badge, not a bypass indicator; the badge only reflects state reached interactively via Shift+Tab. Additionally, the interactive `BypassPermissions` mode badge renders in warning yellow (`ui_warning()`), not the red (`ui_danger()`) used for the more severe `FullAuto` mode — worth aligning for consistent risk-signaling.
5. **Mobile: Upgrade/Plans has no in-app screen at all.** `cloud-billing/index.tsx` shows a plan-summary card, but the "Upgrade plan" row opens an **external browser** to `agiworkforce.com/pricing` (line 113-115) rather than an in-app purchase sheet. Worth flagging beyond UX: digital-goods purchases routed to an external browser instead of in-app purchase are the kind of thing app-store review guidelines scrutinize — confirm this is intentional (e.g. deliberately avoiding IAP fees) and not an oversight before shipping broadly.
6. **Mobile: Shared Links is an explicit "Coming soon" placeholder** (`shared-links.tsx:78-89`) wired to a waitlist CTA, not a real feature — matches the reference's empty-state visuals by coincidence, not by having the underlying feature.

---

## 2. Corrections to the strategy doc (previously "gap," actually partial/real)

| Strategy-doc claim                                                          | Corrected finding                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop connector permissions: "3-state, missing Custom + grouping"         | **Confirmed accurate** — `ConnectorDetailView.tsx` really is missing the 4th state and category grouping (tools render as a flat list). No correction needed here.                                                                                                                                                                                                                       |
| Desktop "Local MCP servers": total gap                                      | **Wrong** — `MCPWorkspace.tsx` is live and reachable (Sidebar → right panel), gives name/status/Command/Args/Env/raw-JSON view. What's actually missing: "managed by extension" note, a working View Logs button (exists only in the dead `MCPServerManager.tsx`), and edit-in-place JSON (current view is read-only display).                                                           |
| Desktop "Plugin" bundling concept: total gap, doesn't exist anywhere        | **Wrong** — `SkillsPluginsSettings.tsx` implements a real, wired plugin manager (versioned, skills+agents, install via `name@marketplace`, backed by `claude plugins` CLI passthrough). What's genuinely missing vs. the reference: no connectors in the bundle (only skills+agents), no legal/consent step, no browsable marketplace grid (text-entry install only, no search/gallery). |
| CLI theme selector: "6 themes + live preview pane"                          | Themes confirmed (6, matching count). "Preview pane" is real but much thinner than the reference implies — one static 3-line snippet that re-tints color live, not a full mockup UI.                                                                                                                                                                                                     |
| CLI first-run auth: "3 trust-mode + BYOK table"                             | The BYOK table is real (13 providers) and the flow is fully wired, but there's no literal "3-mode" labeled selector in code — it's a flat 5-item menu with nested submenus that functionally maps onto Local/BYOK/Cloud without that being an explicit UI construct. Don't describe it as a 3-mode picker in any spec — it isn't one.                                                    |
| VS Code "Modes popover": "no UI control exists, settings-key only"          | **Too strong** — a control exists (mode/effort chips that open native VS Code QuickPicks), it's just not an in-webview popover/slider as the reference shows. Shift+Tab cycling is real and correctly wired at the keybinding level.                                                                                                                                                     |
| Mobile "Profile screen": one screen with name fields + preferences + delete | **Conflated** — these are actually three separate screens (Profile hub → Personalization → Cloud Account), each reachable but from different entry points. Also: Personalization's Save button is not disabled-until-dirty as claimed; there's no `disabled` prop on it at all.                                                                                                          |

---

## 3. Condensed status by surface

### Shared web+desktop chat/artifacts — see §0 above (dead shared package, pervasive forking)

### Desktop connectors/MCP/plugins

✅ `ConnectorGallery.tsx` (directory/browse), `AllowedDirectoriesSettings.tsx` (Filesystem config), Dispatch-equivalent (`AgiWorkDispatch.tsx` + `services/dispatch.ts`, real mobile-pairing + background-task surface).
🟡 Connector permission granularity (missing Custom + grouping), Local MCP management (live but missing logs/notes/edit-in-place), Plugin concept (real but narrower shape than reference).
❌ `MCPServerSettings.tsx` remains a flat boolean-checkbox list, no grouping.

### Web

✅ Settings "Usage" tab (genuine quota bars), Settings "Skills" (API-backed, real), Composer `+` menu (mostly complete, missing "Add to project"/"Add from GitHub"), Model selector (mostly complete), Connectors directory (connect/disconnect works).
🟡 Per-tool connector permissions (built, orphaned — see §1.1), model-selector upgrade tooltip (aria-label only, not a generic tooltip).
❌ `/artifacts` library page, standalone `/chats` list page, "AGI Code" settings tab, project knowledge-capacity blocking UX (only a soft conversation-count warning exists, unrelated to knowledge/source capacity).

### Mobile

✅ Artifacts gallery (full match — grid, badges, skeleton state, reachable).
🟡 Profile (split across 3 screens), Capabilities (real screen but read-only, no toggles/tri-state control), Permissions (correct layout, missing Calendar/Reminders types), Connectors screen (real but no badge-counts/discovery-toggle), Home greeting (correctly centered, but not personalized with name).
❌ Shared Links (placeholder only), Upgrade/Plans (external browser redirect, no in-app sheet).

### CLI

✅ Shift+Tab mode cycling (5-state, fully wired), BYOK auth flow (13 providers, real).
🟡 Theme preview (thin), first-run auth (works, not a literal 3-mode picker).
❌ Bypass-permissions status chip doesn't reflect the CLI flag (see §1.4).

### VS Code / Cursor

✅ Unified "…" action menu (genuinely aggregated, filterable), shortcut/stop-button streaming control, terminal-wrapper architectural divergence (confirmed intentional — webview+REST, not a pty wrapper).
🟡 Mode/effort controls (chip→QuickPick, not in-webview popover/slider), quick-attach popup (real but see bug in §1.3).
❌ Queue-while-streaming (composer just disables), rotating thinking-status verbs.

### Chrome extension

✅ **P0 #1 fixed**: ask-before-acting defaults to `'ask'` and is enforced end-to-end (fail-closed on deny/timeout, traced through to the actual action-block point) — the "allow-all" trust-boundary leak in memory appears already resolved. Three-tier model selector, shortcut-creation modal.
🟡 **P0 #2 partial**: sensitive-site blocklist (`BLOCKED_COOKIE_DOMAINS`, ~40 entries) is real and fail-closed, but scoped only to cookie access — does not block screenshots/page actions on the same sites, and there is still no user-facing interstitial (a blocked call returns a silent JSON error with nothing rendered to the user). Desktop-pairing flow and permission-escalation card exist but don't match the reference's exact fields/keybindings.
❌ Quick-mode experimental confirmation modal, options-page left-nav tab structure, voice-narration mic-permission flow.

---

## 4. Updated priority list (supersedes strategy-doc §8 where they conflict)

1. **Wire the two orphaned-but-complete features** (§1.1 web `ToolPermissionsPanel`, §1.2 desktop `MCPServerManager`) — this is the cheapest, highest-ratio fix in the whole audit: real engineering work already done, just not connected.
2. **Fix the two confirmed real bugs**: VS Code "Add context" mis-wiring (§1.3), CLI bypass-flag/status-chip disconnect (§1.4).
3. **Decide on the shared-package consolidation** (§0) before building any more chat/artifact UI on either web or desktop — every hour spent adding features to the forked components now is an hour added to the eventual migration cost.
4. **Chrome extension P0 #2**: extend the sensitive-site block from cookies-only to page-actions/screenshots, and build the user-facing interstitial — the enforcement logic pattern from P0 #1 (fail-closed, traced to actual block point) is the right template to copy.
5. **Mobile Upgrade/Plans**: build a real in-app sheet, or explicitly confirm the external-browser redirect is an intentional monetization choice (App Store guideline consideration, not just UX polish).
6. Everything else in the original strategy doc's priority list (§8 there), now informed by which items are real gaps (build from scratch) vs. wiring gaps (connect existing code) per the corrections in §2 above.
