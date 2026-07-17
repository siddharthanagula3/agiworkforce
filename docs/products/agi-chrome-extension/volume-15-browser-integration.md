# AGI Chrome Extension — Volume 15 — Browser Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md`, and real repo paths: `apps/extension/manifest.json`, `apps/extension/src/background.ts`, `apps/extension/src/features/background/{shortcuts,tasks,conversation-history}.ts`, `apps/extension/src/features/content/browserTool.ts`, `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts`, `apps/extension/src/features/native-bridge/{providerStreamClient,pairing}.ts`, `apps/extension/src/background/memory-bridge.ts`, `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume specifies how the AGI Browser Companion wires into Chrome's own extension surfaces — the context menu, toolbar action, keyboard commands, side panel, tabs/tab-groups, storage, notifications, and (planned) omnibox/downloads. These are the OS-level seams where the browser hands control to our MV3 background worker and side panel.

The trust stance is inherited, not re-decided here. The extension holds **no provider keys and runs no inference of its own**: thin bridged chat streams through the cloud gateway (`apps/extension/src/features/native-bridge/providerStreamClient.ts` → `/api/v1/providers/<id>/stream`), and `cloudAgentClient.ts` enforces the egress rule that no provider host is ever contacted from the extension. Chrome is **not** a Local or BYOK surface — those keys live only on Desktop/CLI/VS Code. Every browser-integration entry point below is therefore a _task-scoped_ control that either (a) captures page context under the site allowlist, or (b) opens the side panel where the bridged chat lives. History and memory stay in `chrome.storage.local` only, device-scoped, **never synced** (canon "removed scope"). Model access is gated server-side; paywalls render from server `429 { kind:'paywall', requiredTier }` responses (`providerStreamClient.ts`, `apps/extension/src/types.ts`).

## Context Menus

✅ Built — `apps/extension/src/background.ts` `setupContextMenu()` registers eight items after `contextMenus.removeAll()`: `ask-agi-workforce`, `explain-selection`, `translate-selection`, `summarize-page`, `capture-element`, `get-element-info`, `discover-webmcp-tools`, and `add-to-tab-group`. Requirements: rebuild the menu on install/update; never inject page content as instructions (treat selection as data — prompt-injection defense per `THREAT_MODEL.md`); menu actions only fire against allowlisted origins.

## Right-click Actions

✅ Built — `contextMenus.onClicked` in `background.ts` routes each item: selection items stash a redacted payload into `chrome.storage.session` (`agi_pending_chat`) and open the side panel; `capture-element`/`get-element-info`/`discover-webmcp-tools` message the content script; `add-to-tab-group` calls `ensureTabGroup()`. Requirements: no right-click action may auto-send page data to any runtime without the allowlist check; handoff to the bridged chat is explicit (user opened the panel), never silent.

## Omnibox Commands

🔭 Planned — no `omnibox` key in `apps/extension/manifest.json` and no `chrome.omnibox` listener in the codebase. Design intent: an `agi` keyword that offers "ask", "summarize this page", and "run saved shortcut" suggestions, opening the side panel with a redacted payload. Must not become a second inference path — suggestions resolve through the same cloud-gateway bridge. Ships only after allowlist + injection review.

## Toolbar Icon

✅ Built — `manifest.json` declares the `action` (icons 16/32/48/128, title "AGI"), and `background.ts` calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the toolbar icon opens the side panel. Requirement: the icon must reflect pairing/connection state without leaking site data; a disconnected bridge shows a neutral state, not an error that exposes URLs.

## Badge Notifications

🟡 Partial — Chrome desktop notifications are built (`background.ts` uses `chrome.notifications.create` for task completion, gated on the `agi_task_notifications` pref, and `notifications.onClicked` opens the side panel). The numeric **action badge** (`chrome.action.setBadgeText` / `setBadgeBackgroundColor`) is **not** implemented — no `setBadge*` call exists. Gap → 🔭: add an unread/queued-task badge sourced from `chrome.storage.local` counts, cleared when the panel opens. Badge text must never encode PII or site names.

## Keyboard Shortcuts

✅ Built — `manifest.json` `commands` define `_execute_action` (Ctrl+Shift+A / Cmd+Shift+A, open side panel) and `capture_page` (Ctrl+Shift+C / Cmd+Shift+C); `chrome.commands.onCommand` in `background.ts` handles `capture_page`. Separately, user-defined **saved shortcuts** (record-and-replay workflows, max 50) live in `apps/extension/src/features/background/shortcuts.ts` and are validated via `validateShortcutActions`. Requirement: replayed shortcut actions run under the same ask-before-acting/high-risk approvals as live automation.

## Browser Commands — capture_page etc.

✅ Built — `captureCurrentPage()` (`background.ts`) uses `chrome.tabs.captureVisibleTab` (PNG, quality 90) and forwards a `page_capture` payload over the native bridge. The computer-use action set maps in `apps/extension/src/features/content/browserTool.ts` (`computerUseToPageActions`): `screenshot`, `left/right/middle/double/triple_click`, `mouse_move`, `key`, `type`, `scroll`, `hold_key`, plus navigate. CDP-driven execution with escalation is built in `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine}.ts`. Requirement: every capture/act command is allowlist- and approval-gated; high-risk sites trigger intervention before the command runs.

## Side Panel API

✅ Built — `manifest.json` `side_panel.default_path` = `src/side_panel.html`; `background.ts` opens it via `chrome.sidePanel.open({ tabId })` from context menus, notifications, and the toolbar behavior. The panel hosts the thin bridged chat and computer-use panel. Requirement: the panel renders the server paywall payload verbatim; it must not expose any provider key entry (Chrome has none).

## Downloads API

🔭 Planned — no `downloads` permission in `manifest.json` and no `chrome.downloads` usage. Design intent: let an approved workflow save a captured artifact (screenshot/exported page text) to the user's Downloads via an explicit action approval, with the filename shown in the plan preview. Adding the permission requires a `THREAT_MODEL.md` update per `apps/extension/AGENTS.md`.

## Tabs API

✅ Built — `tabs` and `tabGroups` permissions are declared; `background.ts` uses `chrome.tabs.query`, `onUpdated` (allowlist-gated context sync), `onRemoved` (rate-limit/state cleanup), `captureVisibleTab`, and tab-group management via `ensureTabGroup()` (`chrome.tabs.group` / `chrome.tabGroups.update` / `ungroup`, group "AGI Workforce", color blue). Requirement: `onUpdated` must never ship `innerText` for non-allowlisted origins (H-06 fix already enforces `siteAllowlistCache`).

## Storage API

✅ Built — `chrome.storage.local` is the only persistence: conversation history (`features/background/conversation-history.ts`, max 100 conversations, 30-day TTL), saved shortcuts and scheduled tasks (max 50 each, `shortcuts.ts`/`tasks.ts`), and device-scoped memory (`background/memory-bridge.ts`, `agi_memories`, max 200, 2000-char cap, **never synced**). `chrome.storage.session` holds the transient `agi_pending_chat` handoff. Requirement: no store may become a sync source — Neon delta-sync excludes Chrome by canon; any app-chat handoff is explicit and redacted.

## Repository map

- `apps/extension/manifest.json` — permissions, `action`, `commands`, `side_panel`.
- `apps/extension/src/background.ts` — context menus, `onCommand`, capture, tabs/tab-groups, notifications, side-panel behavior.
- `apps/extension/src/features/background/{shortcuts,tasks,conversation-history}.ts` — saved shortcuts, scheduled tasks, local history.
- `apps/extension/src/features/content/browserTool.ts` — computer-use → page-action mapping.
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts` — CDP automation, escalation, egress rule.
- `apps/extension/src/features/native-bridge/{providerStreamClient,pairing}.ts` — cloud-gateway stream, `X-Bridge-Token` pairing.
- `apps/extension/src/background/memory-bridge.ts` — device-scoped `agi_memories`.
- `apps/extension/THREAT_MODEL.md` — permission/injection review gate.

## Competitor notes

Claude for Chrome, ChatGPT's browser features, and Codex's browser tooling all bind similar seams (context menu, side panel, keyboard shortcuts, tab reading, computer-use). AGI's deliberate divergence: (1) the extension is a **thin window** — no keys, no inference; all model calls stream through the cloud gateway, mirroring Claude-in-Chrome plan gating but on our multi-provider catalog. (2) Per-surface trust — Chrome is Cloud/companion-only; BYOK stays on Desktop/CLI/VS Code, and the desktop native-messaging bridge (`com.agiworkforce.browser`) keeps local compute local. (3) Local-first data — history and memory are `chrome.storage.local`, never synced, versus competitors' account-wide sync. (4) Approval-gated automation with high-risk-site intervention as a first-class control, not a setting.

## Acceptance / Definition of Done

Production-ready when every declared browser-integration entry point is allowlist- and approval-gated, no path performs inference or holds keys inside the extension, and adding any new permission is accompanied by a `THREAT_MODEL.md` update.

Build:

- [ ] `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; `pnpm lint:extension` clean.
- [ ] Context menu, toolbar, `capture_page`, and side panel verified on a fresh MV3 install (minimum_chrome_version 132).

Trust:

- [ ] No context-menu/omnibox/badge/tabs path routes Local/BYOK data anywhere; Chrome contacts no provider host (verify `cloudAgentClient.ts` egress rule).
- [ ] History/memory stay in `chrome.storage.local`; nothing enters Neon delta-sync.

Security:

- [ ] Page content is treated as data (injection defense); `onUpdated` respects `siteAllowlistCache`.
- [ ] Bridge calls carry a valid `X-Bridge-Token` (`pairing.ts`); paywalls render only from server `429` responses.

## Anti-patterns

- Adding a provider SDK, API key field, or direct model call to any browser-integration handler — the extension runs no inference.
- Hardcoding or inventing a model ID; catalog IDs come only from `packages/contracts/types/src/models.json`.
- Silently syncing `chrome.storage.local` history/memory to Neon, or handing page data to app chat without an explicit, redacted step.
- Shipping omnibox/downloads without the permission, `THREAT_MODEL.md` update, and allowlist gate.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or top-ups; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise. Never invent Pro/Max INR.
- Referencing Supabase, or renaming Next.js `proxy.ts` to `middleware.ts`.
- Auto-acting on high-risk sites without intervention, or replaying saved shortcuts that bypass approvals.
