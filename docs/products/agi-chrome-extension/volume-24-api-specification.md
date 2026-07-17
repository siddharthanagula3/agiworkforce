# AGI Chrome Extension — Volume 24 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/extension/manifest.json`; `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/native-bridge/pairing.ts` (→ `apps/extension/src/pairing.ts`); `apps/extension/src/background.ts`; `apps/extension/src/features/background/{conversation-history,tasks}.ts`; `apps/extension/src/background/memory-bridge.ts`; `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md`. Model IDs are read from `packages/contracts/types/src/models.json` only.

## Overview & stance

This volume defines the API contract for the AGI Browser Companion: the **Cloud APIs** it calls over the network and the **Chrome extension APIs** it declares in the manifest. The Chrome surface is a permission-gated browser agent, **not** a consumer assistant. It holds **no provider keys and runs no inference** — all model traffic streams through the AGI cloud gateway; **BYOK and Local are not available on this surface** (canon: Chrome is task-scoped). Managed Cloud is public alpha, open by default for signed-in users. Egress is allowlist-locked: no provider host (openai.com, anthropic.com, …) is ever contacted directly (`cloudAgentClient.ts` EGRESS rule, `validateGatewayUrl`). History and memory are `chrome.storage.local` only — device-scoped, never synced.

## Cloud APIs: Authentication

The service worker cannot run Clerk's browser SDK. The popup/side panel obtains a Clerk session token and relays it to the worker via `chrome.runtime.sendMessage`; the worker stores it in `chrome.storage.session` under `agi_clerk_session_token` (short TTL, cleared on browser close). `getAuthToken()` reads session storage first, then a dev-only `agi_dev_bearer_token` in `chrome.storage.local`, else returns `null` (caller must surface a sign-in prompt). All gateway requests carry `Authorization: Bearer <token>`.

- 🟡 Partial — token relay + `getAuthToken()` shipped (`apps/extension/src/features/computer-use/cloudAgentClient.ts`); the `createClerkClient`-in-service-worker integration is a documented TODO. 🔭 Planned — headless service-worker Clerk client.

## Cloud APIs: Chat — gateway streaming

Two real, distinct egress endpoints, both SSE (`data: {...}\n\n`):

- **Computer-use / agent chat** — `POST https://api.agiworkforce.com/api/llm/v1/chat/completions`, OpenAI-compatible, `stream:true`, with `BROWSER_TOOL_DEFINITIONS` and `tool_choice:'auto'`. Model is read from `models.json` (`providers.managed_cloud.taskRouting.computer_use`) via `COMPUTER_USE_MODEL` — never hardcoded. Requires `X-Requested-With: XMLHttpRequest` (gateway CSRF). ✅ Built — `cloudAgentClient.ts:callCloud`.
- **Provider bridge stream** — `POST <gatewayUrl>/api/v1/providers/<id>/stream` with `authorization: Bearer` and `x-requested-with: agiworkforce-chrome-extension`; provider id ∈ `anthropic|openai|ollama|google`; yields typed `StreamChunk`s (`text-delta`, `thinking-delta`, `tool-use-*`, `usage`, `stop`, `paywall`). ✅ Built — `providerStreamClient.ts:streamFromProvider`.
  Both validate the gateway origin against the exact allowlist before sending the JWT. The gateway URL is overridable only to allowlisted values (`resolveGatewayBase`, `validateGatewayUrl`).

## Cloud APIs: Billing entitlements

Entitlements are verified **server-side**; there is **no checkout in the extension** (canon: no in-extension Stripe/billing). The gateway returns HTTP `429` with a structured body `{kind:'paywall', feature, requiredTier, reason?}`; the client yields it as a first-class `paywall` chunk so callers render upgrade UI instead of an error. Model-by-plan gating mirrors Claude-in-Chrome plan gating (computer-use requires a paid plan).

- 🟡 Partial — paywall parsing shipped (`providerStreamClient.ts` `PaywallPayload`), **but** `PaywallRequiredTier` still encodes removed tiers (`'hobby' | 'pro' | 'pro_plus' | 'max'`). Gap: must reconcile to the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise); tracked with the repo-wide `billing-catalog.ts` reconciliation.

## Browser APIs: Tabs API

`"tabs"` + `"activeTab"` + `"tabGroups"` permissions declared. Used to resolve the active tab, open the side panel per-tab, and read page context for the agent loop. Tab operations feed the CDP driver, which requires an allowlisted origin before acting. ✅ Built — `apps/extension/manifest.json`; `apps/extension/src/background.ts`.

## Browser APIs: Side Panel API

`"sidePanel"` permission + `side_panel.default_path: "src/side_panel.html"`. `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` and `chrome.sidePanel.open({ tabId })` drive the primary UI. ✅ Built — `manifest.json`; `background.ts` (`sidePanel.setPanelBehavior`/`open`).

## Browser APIs: Storage API

`"storage"` permission. `chrome.storage.local`: conversation history (max **100** convs, **30-day** TTL — `conversation-history.ts`) and device-scoped memory (`agi_memories`, max **200**, never synced — `memory-bridge.ts`), plus scheduled tasks (`agi_scheduled_tasks`, max 50). `chrome.storage.session`: pairing token (`agi_bridge_token`) and Clerk session token — short-lived, cleared on browser close. ✅ Built — cited files.

## Browser APIs: Scripting & Cookies

`"scripting"` and `"cookies"` permissions are declared (`apps/extension/manifest.json`). Scripting injects the content-script surfaces (page context capture, in-page panel, autofill) on allowlisted origins. Cookie access exists for session/redaction hygiene — `background.ts` redacts cookie material before any page context leaves the browser, covered by `__tests__/background.cookies.test.ts` (see V28 QA and V31 CWS permission justifications). ✅ Built — manifest + cited tests. Requirement: both permissions stay justified in `MANIFEST_NOTES.md` and any expansion goes through `THREAT_MODEL.md` review.

## Browser APIs: Downloads API

No `"downloads"` permission is declared and no `chrome.downloads` call exists. Any export/save-to-disk flow is out of the current manifest and must add the permission + threat-model review before use.

- 🔭 Planned — not in `apps/extension/manifest.json`; do not spec as available.

## Browser APIs: Notifications API

`"notifications"` permission. `chrome.notifications.create` surfaces scheduled-task completions and agent alerts; `onClicked` opens the side panel and clears the notification. ✅ Built — `background.ts` (`notifications.create`, `agi_task_notif_*`).

## Browser APIs: Context Menus API

`"contextMenus"` permission. Menus are rebuilt via `removeAll()` then `create()`, with `onClicked` routing to page actions / side-panel open. ✅ Built — `background.ts`.

## Browser APIs: Commands API

Manifest `commands`: `_execute_action` (`Ctrl/Cmd+Shift+A`, open side panel) and `capture_page` (`Ctrl/Cmd+Shift+C`, capture current page). Handled in the background worker. ✅ Built — `manifest.json`; `apps/extension/src/features/background/shortcuts.ts`.

## Browser APIs: Runtime Messaging

Internal messaging uses `chrome.runtime.sendMessage` with typed `ExtensionMessage` → `ExtensionResponse` (`apps/extension/src/types.ts`); handlers live in `background.ts`. **No `externally_connectable`** entry exists, so there is **no** `onMessageExternal` cross-site surface — all inbound messages originate from the extension's own pages/content scripts. Extension-page-only message types are enforced by origin (`ORIGIN_EXTENSION_PAGE`). ✅ Built.

## Browser APIs: Native Messaging

`"nativeMessaging"` permission. `chrome.runtime.connectNative('com.agiworkforce.browser')` opens a port to the Desktop native host for bridged chat/persistence (`background.ts:172,407`; host under `apps/extension/native-host/`). A parallel **localhost HTTP pairing bridge** posts `POST <bridgeUrl>/pair` (default `http://localhost:8787`, host restricted to `ALLOWED_BRIDGE_HOSTS`); tokens must match `^[A-Za-z0-9_-]{32,128}$` and are stored in `chrome.storage.session`; requests carry the `X-Bridge-Token`. ✅ Built — `pairing.ts`, `native-bridge/index.ts`.

## Browser APIs: Debugger/CDP

`"debugger"` permission. `cdpDriver.ts` attaches the debugger **per action** and detaches on completion/error (never left attached), driving `Page.captureScreenshot`, `Input.dispatchMouseEvent`, `Input.insertText`, `Runtime.evaluate`, and `Page.navigate`. Callers must pass a tab that has already cleared the site-allowlist gate (`agentLoop.ts` orchestrates; `escalationEngine.ts` escalates deterministic autofill to computer-use). ✅ Built — `apps/extension/src/features/computer-use/{cdpDriver,agentLoop,escalationEngine}.ts`.

## Repository map

- `apps/extension/manifest.json` — permissions, host permissions, commands, side panel, CSP.
- `apps/extension/src/features/computer-use/` — `cloudAgentClient.ts`, `cdpDriver.ts`, `agentLoop.ts`, `escalationEngine.ts`.
- `apps/extension/src/features/native-bridge/` — `providerStreamClient.ts`, `pairing.ts`, `sendQueue.ts` (→ `apps/extension/src/pairing.ts`).
- `apps/extension/src/features/background/` — `conversation-history.ts`, `tasks.ts`, `shortcuts.ts`.
- `apps/extension/src/background/` — `memory-bridge.ts`, `policy.ts`; `apps/extension/src/background.ts` (worker).
- `apps/extension/native-host/` — Desktop native-messaging host; `apps/extension/THREAT_MODEL.md`, `MANIFEST_NOTES.md`.
- `packages/contracts/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude for Chrome and ChatGPT/Codex browser tooling pair a first-party model with browser control. AGI diverges deliberately: (1) **multi-provider through one gateway** (`anthropic|openai|ollama|google`) rather than a single vendor; (2) **per-surface trust** — Chrome is Cloud-only and key-less (BYOK stays on Desktop/CLI/VS Code), so no provider host is ever contacted from the browser; (3) **local-first data** — history and memory live in `chrome.storage.local`, never synced, unlike competitors' account-synced history; (4) a **Desktop native-messaging bridge** so long-running compute can stay on the host (remote-window pattern), not the cloud.

## Acceptance / Definition of Done

Production-ready when every declared API above has a cited implementation, egress stays allowlist-locked, and paywall tiers match the canon ladder.

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; manifest install verified after any permission change.
- [ ] Trust: no BYOK/Local path on this surface; no provider host in any request; history/memory remain `storage.local` and unsynced; `THREAT_MODEL.md` updated for permission changes.
- [ ] Security: gateway URL validated against the exact allowlist before JWT send; pairing/bridge tokens shape-validated; `PaywallRequiredTier` reconciled to Free/Basic/Pro/Max/Enterprise.

## Anti-patterns

- Contacting a provider host directly, embedding a provider API key, or running inference in the extension.
- Adding a `downloads` (or any) permission, or an `externally_connectable` entry, without a threat-model update.
- Hardcoding a model ID instead of reading `models.json` (`COMPUTER_USE_MODEL`).
- Emitting or requiring removed tiers (`hobby`, `pro_plus`, `Plus`, `Hobby`) or any credit top-up flow.
- Syncing history/memory to the cloud, or adding Projects/image-generation/in-extension checkout (removed scope).
- Referencing Supabase, or renaming Next.js `proxy.ts` to `middleware.ts`.
- Leaving the CDP debugger attached across actions, or acting on a tab that has not cleared the site-allowlist gate.
