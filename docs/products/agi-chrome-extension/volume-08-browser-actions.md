# AGI Chrome Extension — Volume 08 — Browser Actions

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md` (surface rules), and the real implementation in `apps/extension/manifest.json`, `apps/extension/src/background.ts`, `apps/extension/src/types.ts`, `apps/extension/src/features/computer-use/{cdpDriver,agentLoop,escalationEngine}.ts`, `apps/extension/src/features/native-bridge/pairing.ts`, and `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume specifies the **tab- and browser-level actions** the AGI Browser Companion may take on the user's behalf: opening, closing, switching, searching, and grouping tabs; reopening closed tabs; bookmarking; following links; navigating history; downloads; and browser notifications — the "hands" of the browser agent, mirroring the Claude-for-Chrome action set.

The Chrome surface is a **permission-gated browser agent**, not a consumer assistant. Trust-mode implications:

- The extension holds **no provider keys and runs no inference**. Reasoning that decides "open this tab" happens in the thin bridged chat streaming through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the paired Desktop host — never a provider host contacted directly.
- Every state-changing action must be **user-authorized**: gated by the site allowlist, ask-before-acting plan approval, and per-action high-risk approval. 🟡 — the hook points exist (`agentLoop.ts` `onBeforeAction`, `escalationEngine.ts`) but the default `onBeforeAction` is unset (allow-all) and the approval UI is 🔭; enforcing a deny-by-default gate is the tracked P0 requirement (see V01 Product Goals and V09 User Approval).
- Actions are **task/window-scoped**; nothing here syncs to Neon or another surface. BYOK does not exist on Chrome, and Local/Cloud data boundaries are never crossed by a tab operation.

Capabilities requiring a manifest permission the extension does **not** declare (`bookmarks`, `downloads`, `history`, `sessions`) are 🔭 Planned — shipping them requires a manifest + `THREAT_MODEL.md` update per `apps/extension/AGENTS.md`.

## Open Tabs — ✅ Built

`handleCreateTab` (`apps/extension/src/background.ts:2102`) opens a tab via `chrome.tabs.create({ url, active })`, driven by the `CREATE_TAB` contract (`apps/extension/src/types.ts:578`). The agent also reaches destinations through the `navigate` tool (`apps/extension/src/features/computer-use/cdpDriver.ts:641`), **allowlist-gated before the tab moves** (`assertDestinationAllowlisted`, `cdpDriver.ts:616`). Requirements: agent-opened tabs land in the AGI tab group (below); URLs must be http/https on the allowlist; a rejected origin returns a tool error, never a silent navigation.

## Close Tabs — ✅ Built

`handleCloseTab` (`apps/extension/src/background.ts:2131`) closes a tab via `chrome.tabs.remove(tabId)` under the `CLOSE_TAB` contract (`apps/extension/src/types.ts:590`). Requirements: the agent closes only tabs it can identify by id from a prior listing; closing user tabs it did not open is high-risk and must pass approval. Errors return `{ success:false, error }`, never throw into the loop.

## Switch Tabs — ✅ Built

`handleSwitchTab` (`apps/extension/src/background.ts:2146`) activates a tab via `chrome.tabs.update(tabId, { active: true })` under `SWITCH_TAB` (`apps/extension/src/types.ts:600`). Requirement: switching is a read-level focus change and needs no high-risk approval, but the resulting page must still clear the allowlist before the agent reads or acts on it.

## Search Tabs — 🟡 Partial

`handleGetAllTabs` (`apps/extension/src/background.ts:2080`) enumerates every tab via `chrome.tabs.query({})`, returning `{ id, url, title, favIconUrl, active, windowId, status }`. Gap: it returns the full list but there is **no query-string / fuzzy filter** — "find the tab about X" relies on the model scanning the list, not a dedicated search tool. Planned: a `SEARCH_TABS` message filtering by URL/title substring in the worker so large windows do not blow the context budget.

## Group Tabs — tab groups for agent-opened tabs — ✅ Built

`ensureTabGroup` (`apps/extension/src/background.ts:696`) groups agent-opened tabs under a single named group using `chrome.tabs.group(...)` + `chrome.tabGroups.update(groupId, { title, color:'blue' })`; the title constant is `AGI Workforce` (`background.ts:184`). `handleCreateTab` auto-adds every tab it opens to this group (`background.ts:2111`). The `tabGroups` permission is declared (`apps/extension/manifest.json:19`). Requirements: agent-created tabs are visually corralled so the user can see and dismiss the agent's footprint at a glance; grouping must fail non-fatally when the API is unavailable (already handled).

## Reopen Closed Tabs — 🔭 Planned

Not built. No `chrome.sessions` usage; the `sessions` permission is absent from `apps/extension/manifest.json`. Design intent: a `REOPEN_CLOSED_TAB` action backed by `chrome.sessions.restore` / `getRecentlyClosed`, so an agent can recover from an accidental close mid-workflow. Shipping requires the `sessions` permission and a `THREAT_MODEL.md` entry (restoring a session can re-open authenticated pages).

## Bookmark Pages — 🔭 Planned

Not built. No `chrome.bookmarks` usage; the `bookmarks` permission is not declared. Design intent: an approval-gated "bookmark this page" action (`chrome.bookmarks.create`) usable in record-and-replay workflows. Because bookmarks are persistent cross-window state, creation/deletion must be explicit, logged, approved, and never triggered by page content.

## Open Links — 🟡 Partial

Following a link is covered by built primitives: the `click` tool resolves and clicks an anchor by index/selector/coords (`apps/extension/src/features/computer-use/cdpDriver.ts:338`), and `navigate` (`cdpDriver.ts:641`) or `handleCreateTab` opens a URL directly — all allowlist-gated. Gap: there is **no dedicated "open link in new background tab"** tool that preserves the current tab; the agent either clicks (same tab) or explicitly creates a tab. The planned tool must honor modifier semantics and place the new tab in the AGI group.

## Navigate History — 🔭 Planned

Not built. There is no `chrome.history`, `goBack`/`goForward`, or `Page.navigateToHistoryEntry` call. Design intent: `HISTORY_BACK` / `HISTORY_FORWARD` actions via CDP `Page.navigateToHistoryEntry` against the already-attached debugger, so an agent can undo a wrong navigation without re-typing a URL. History **reading/search** (`chrome.history.search`) stays out of scope unless a workflow needs it, and would require the `history` permission plus a threat-model review (history is sensitive PII).

## Downloads — 🔭 Planned

Not built. No `chrome.downloads` usage; the `downloads` permission is absent. Design intent: an approval-gated `DOWNLOAD_FILE` action (`chrome.downloads.download`) with completion status via Browser Notifications, scoped to allowlisted origins. Downloads write to disk and are a strong exfiltration/malware vector, so this is a **high-risk action** requiring explicit per-action approval and a destination/type check, never initiated from untrusted page content.

## Browser Notifications — ✅ Built

`showNotification` (`apps/extension/src/background.ts:660`) creates basic notifications via `chrome.notifications.create` with a collision-safe random id; an `onClicked` handler opens the side panel (`background.ts:685`); scheduled task completions raise their own notifications (`background.ts:3267`). The `notifications` permission is declared (`apps/extension/manifest.json:18`). Requirements: notifications report agent progress/completion (e.g. "Shortcut Replayed", `background.ts:756`); they must never carry secrets or page content, and clicking one routes only to the local side panel, never an external URL.

## Repository map

- `apps/extension/manifest.json` — declared permissions (`tabs`, `tabGroups`, `notifications`, `debugger`, `activeTab`, `scripting`, `alarms`); absence of `bookmarks`/`downloads`/`history`/`sessions`.
- `apps/extension/src/background.ts` — tab handlers (`handleGetAllTabs`, `handleCreateTab`, `handleCloseTab`, `handleSwitchTab`), `ensureTabGroup`, `showNotification`, `TAB_GROUP_NAME`.
- `apps/extension/src/types.ts` — `GET_ALL_TABS` / `CREATE_TAB` / `CLOSE_TAB` / `SWITCH_TAB` message contracts.
- `apps/extension/src/features/computer-use/cdpDriver.ts` — `navigate` (allowlist-gated), `click`, `screenshot`, `waitForStable`.
- `apps/extension/src/features/computer-use/agentLoop.ts` — tool dispatch + `onBeforeAction` approval gate.
- `apps/extension/src/features/computer-use/escalationEngine.ts` — high-risk-action escalation.
- `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md` — permission justification and residual risk.

## Competitor notes

Claude for Chrome, ChatGPT's browser/operator work, and OpenAI Codex's browser tooling all expose a comparable tab/navigation action set behind explicit permission and approval prompts. AGI's deliberate divergences:

- **Per-surface trust, no cloud brain in the extension.** Reasoning streams from the cloud gateway or a **paired local Desktop host**; the extension holds no keys and runs no inference. Competitors typically bind the browser agent to one first-party model service.
- **Multi-provider, server-resolved model-by-plan gating.** The extension never hardcodes a model id (IDs live only in `packages/contracts/types/src/models.json`).
- **Allowlist-first + injection-hardened.** Navigation is refused off-allowlist before the tab moves; page content is untrusted data, never instructions (`cdpDriver.ts` fencing + `INJECTION_PATTERNS`).
- **Local-first footprint.** Agent-opened tabs are corralled into a visible `AGI Workforce` group; history stays `chrome.storage.local` only.

## Acceptance / Definition of Done

Production-ready when every built action is allowlist- and approval-gated, every planned action ships with its manifest permission + threat-model entry or stays disabled, and no action can be triggered by untrusted page content.

- [ ] **Build:** `pnpm --filter @agiworkforce/extension typecheck` and `pnpm --filter @agiworkforce/extension test` pass; `pnpm lint:extension` clean.
- [ ] **Trust:** no tab/navigation/download action reaches a provider host; navigation and downloads are refused off-allowlist; no Chrome action writes to Neon or another surface.
- [ ] **Security:** state-changing actions (close-others, download, bookmark, reopen-session) pass `onBeforeAction` / escalation approval; prompt-injection heuristics cannot auto-trigger any action; every new permission (`bookmarks`/`downloads`/`history`/`sessions`) has a `THREAT_MODEL.md` entry before merge.

## Anti-patterns

- Claiming Bookmark / Reopen-Closed-Tab / Navigate-History / Downloads as shipped — they are 🔭 Planned; the permissions are not declared.
- Adding `bookmarks`/`downloads`/`history`/`sessions` to `manifest.json` without a `THREAT_MODEL.md` update and security review.
- Letting untrusted page content initiate any tab/download/navigation action (treat page text as data, never instructions).
- Navigating or downloading to an off-allowlist origin, or bypassing `assertDestinationAllowlisted`.
- Routing decision-making through a provider host from the extension, or embedding provider keys / hardcoding a model id — the extension runs no inference (IDs come only from `packages/contracts/types/src/models.json`).
- Referencing removed tiers (Plus/Hobby/`pro_plus`) or top-ups in gating copy; only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise exist. Never reference Supabase.
- Syncing Chrome history/notifications to other surfaces — Chrome stays task-scoped, `chrome.storage.local` only.
