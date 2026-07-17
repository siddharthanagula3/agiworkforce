# AGI Chrome Extension — Volume 03 — Extension Architecture

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md` (nearest surface rules), and grounded in real repo paths: `apps/extension/manifest.json`, `apps/extension/MANIFEST_NOTES.md`, `apps/extension/THREAT_MODEL.md`, `apps/extension/src/background.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/features/{computer-use,native-bridge,content,cloud-bridge,side-panel,background}/`, `apps/extension/src/background/memory-bridge.ts`, and `apps/extension/native-host/`.

## Overview & stance

This volume specifies the MV3 shell of the **AGI Browser Companion** — the manifest, the background service worker, UI surfaces (side panel, options, the deliberately-absent popup), content scripts, scheduled background tasks, the message router, storage, permissions, lifecycle, and update behavior. It defines _how the extension is assembled and stays alive_, not the agent behaviors layered on top (those are their own volumes).

Trust-mode shaping is strict on this surface. The extension is **task-scoped**, not a chat data-sync client: it holds **no provider keys and runs no inference**. Every model call egresses only to the AGI cloud gateway (`cloudAgentClient.ts` / `providerStreamClient.ts`) or to the paired Desktop over the localhost bridge — never to a provider host directly. There is **no BYOK** and **no Managed-Cloud chat sync** here; history and memory are `chrome.storage.local` only, device-scoped, and never synced (canon "Chrome scope"). Local Desktop sessions reached over the bridge stay local — Remote-Control/bridge access is a secure window, not a fourth trust mode.

## Manifest V3

The manifest is MV3 with `name` "AGI Browser Companion", `version` 1.2.0, `minimum_chrome_version` 132, `offline_enabled: false`, a module service worker (`background.type: "module"`), a hardened `content_security_policy.extension_pages`, and `web_accessible_resources` scoped to provider SVG icons on `*.agiworkforce.com` only. **✅ Built** — `apps/extension/manifest.json`. Rationale for non-standard-looking choices (why `debugger` is present, why `host_permissions` is broad `localhost/*`, why `style-src 'unsafe-inline'` was dropped) lives in `MANIFEST_NOTES.md`, not as `_`-prefixed manifest keys (which Chrome flags as errors). **✅ Built** — `apps/extension/MANIFEST_NOTES.md`. Requirement: the manifest MUST contain only standard MV3 keys; any policy note goes in `MANIFEST_NOTES.md` + `THREAT_MODEL.md`.

## Background Service Worker

A single module service worker (`src/background.js`, source `src/background.ts`) is the trust core: it owns the message router, the site-allowlist gate, the native-messaging connection, the localhost bridge fetch, alarm handling, and the computer-use agent loop dispatch. **✅ Built** — `apps/extension/src/background.ts` (~3,357 lines). Because MV3 workers are ephemeral, all durable state lives in `chrome.storage.local`; the worker rehydrates on wake. Requirement: no module-scope side effects beyond listener registration; validators are pure and imported from `src/background/policy.ts` so tests share one hardened path (no policy drift). **✅ Built** — `apps/extension/src/background/policy.ts`. Planned: extract handlers into the `src/features/background/` barrel (`index.ts` currently a placeholder). **🟡 Partial** — `apps/extension/src/features/background/index.ts` (barrel empty; logic still in `background.ts`).

## Side Panel

The Side Panel is the **primary UI surface**: chat, computer-use panel, onboarding, voice, and markdown rendering. `side_panel.default_path` is `src/side_panel.html`; the worker calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the toolbar action opens the panel, and `chrome.sidePanel.open({ tabId })` opens it contextually. **✅ Built** — `apps/extension/manifest.json` (`side_panel`), `apps/extension/src/background.ts` (`setPanelBehavior`, `sidePanel.open`), `apps/extension/src/side_panel.ts` (~7,281 lines), `apps/extension/src/features/side-panel/`. Requirement: the panel renders the bridged chat stream and the server-driven paywall from `429 {kind:'paywall', requiredTier}` responses; it never embeds checkout.

## Popup

There is **deliberately no `default_popup`**: the toolbar `action` declares only icon + title, and clicking it opens the Side Panel (above). This is an intentional divergence from a compact-popup design — a full panel is required for approval-gated agent workflows. **✅ Built (as absence)** — `apps/extension/manifest.json` (`action` has no `default_popup`). A lightweight action popup (e.g. quick capture / status) is **🔭 Planned** and not yet built; the `options_page` (`src/options.html`) covers configuration today. **✅ Built** — `apps/extension/src/options.html`.

## Content Scripts

One content script (`src/content.js`, source `src/content.ts`) is injected at `document_idle` on `http://*/*` and `https://*/*`, `all_frames: false`, `match_about_blank: false`. It performs page/DOM/console capture, autofill, in-page panel, WebMCP, and NLWeb — treating **page content as data, never instructions** (prompt-injection defense). **✅ Built** — `apps/extension/manifest.json` (`content_scripts`), `apps/extension/src/content.ts` (~2,284 lines), `apps/extension/src/features/content/`. Requirement: DOM-mutating or capture actions run only after the tab passes the site-allowlist gate; content-script CSP is the page's, so shadow-DOM styling is used (no inline injection into extension pages).

## Background Tasks

Scheduled recurring browser tasks are persisted (`agi_scheduled_tasks`, max 50) and driven by `chrome.alarms` with a `agi_task_` alarm prefix; schedule types map to alarm periods (hourly/daily/weekly/monthly). **✅ Built** — `apps/extension/src/features/background/tasks.ts`. A `keep-alive` alarm (`periodInMinutes: 1.0`) mitigates worker eviction during active work, and `chrome.alarms.onAlarm` fans out to task + keep-alive handlers. **✅ Built** — `apps/extension/src/background.ts` (`alarms.create('keep-alive')`, `onAlarm`). Requirement: task execution respects the same allowlist + approval gates as interactive runs; a task may not silently perform high-risk actions.

## Messaging

Three channels, each policy-gated: (1) in-extension `chrome.runtime.onMessage` routed through a **declarative per-message-type policy** (extension-page-only types, DOM-mutation types, allowlist gating) in `policy.ts`; **✅ Built** — `apps/extension/src/background.ts` (`onMessage.addListener`), `apps/extension/src/background/policy.ts`. (2) **native messaging** to Desktop via `chrome.runtime.connectNative("com.agiworkforce.browser")` with `allowed_origins` pinned to the extension ID; **✅ Built** — `apps/extension/src/background.ts` (`connectNative`), `apps/extension/native-host/com.agiworkforce.browser.json.template`. (3) the **localhost bridge** (default port 8787) over HTTP/WS with an `X-Bridge-Token` header, URL user-configurable via `agi_bridge_url` and validated by `validateBridgeUrl()` (local-only). **✅ Built** — `apps/extension/src/background.ts` (`X-Bridge-Token`, `agi_bridge_url`), `apps/extension/src/features/native-bridge/pairing.ts`. QR + HMAC pairing gates the bridge. **✅ Built** — `apps/extension/src/pairing.ts`.

## Storage

`chrome.storage.local` is the only durable store; `chrome.storage.session` holds the short-TTL Clerk token (`agi_clerk_session_token`). Bounded namespaces: conversation history `agi_conversation_history` (max 100, 30-day TTL) **✅ Built** — `apps/extension/src/features/background/conversation-history.ts`; device-scoped memory `agi_memories` (max 200, **never synced**) **✅ Built** — `apps/extension/src/background/memory-bridge.ts`; `agi_scheduled_tasks` (max 50) and `agi_saved_shortcuts` (max 50) **✅ Built** — `apps/extension/src/features/background/{tasks,shortcuts}.ts`. Requirement: no storage key may mirror Neon consumer chat/memory tables; no delta-sync client exists on this surface.

## Permissions

Declared permissions: `activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups, debugger`; `host_permissions` limited to localhost/127.0.0.1 + `agiworkforce.com`/`api.agiworkforce.com`. **✅ Built** — `apps/extension/manifest.json`. `debugger` exists solely for CDP computer-use (`Page.captureScreenshot`, `Input.*`, `Page.navigate`) and attaches only to allowlist-passing tabs, detaching on every code path. **✅ Built** — `apps/extension/MANIFEST_NOTES.md`, `apps/extension/src/features/computer-use/cdpDriver.ts`. Requirement: adding any permission requires a `THREAT_MODEL.md` update (per `apps/extension/AGENTS.md`).

## Browser Lifecycle

On worker wake the extension registers listeners, sets panel behavior, and restores alarms; `chrome.commands.onCommand` binds `_execute_action` (open panel, Ctrl/Cmd+Shift+A) and `capture_page` (Ctrl/Cmd+Shift+C); `chrome.runtime.onSuspend` performs teardown. **✅ Built** — `apps/extension/manifest.json` (`commands`), `apps/extension/src/background.ts` (`commands.onCommand`, `onSuspend`). Requirement: no state assumed in-memory across wakes; the debugger and native port must be re-established lazily and always detached/closed on suspend or error.

## Extension Updates

The extension is versioned in `manifest.json` (currently 1.2.0) and distributed via the Chrome Web Store; `minimum_chrome_version: 132` gates install. A formal `chrome.runtime.onInstalled` migration/onboarding path and `onUpdateAvailable` deferral (to avoid interrupting an in-flight agent run) are **🔭 Planned** — not yet wired in `background.ts`. Requirement (planned): schema migrations for the bounded storage namespaces on version bump, and update deferral while a computer-use loop or bridged task is active.

## Repository map

- `apps/extension/manifest.json`, `apps/extension/MANIFEST_NOTES.md`, `apps/extension/THREAT_MODEL.md`
- `apps/extension/src/background.ts`, `apps/extension/src/background/{policy.ts,memory-bridge.ts}`
- `apps/extension/src/features/background/{index.ts,tasks.ts,shortcuts.ts,conversation-history.ts}`
- `apps/extension/src/{side_panel.ts,side_panel.html,options.ts,options.html,content.ts}`
- `apps/extension/src/features/{side-panel,content,computer-use,native-bridge,cloud-bridge}/`
- `apps/extension/src/pairing.ts`, `apps/extension/native-host/`

## Competitor notes

Claude for Chrome and ChatGPT's browser agents keep provider keys and inference behind the vendor's own cloud and pair to a single first-party model. OpenAI Codex remote connections QR-pair a phone to a host. AGI's deliberate divergence: the extension is a **keyless, inference-free companion** that routes to a **multi-provider** gateway (models resolved only from `packages/contracts/types/src/models.json`), and additionally bridges to a **local-first** Desktop host over localhost so a user's own Local/BYOK Desktop session can drive the browser without any data leaving the device. Per-surface trust holds: BYOK is never exposed in Chrome; cross-device chat sync is intentionally absent.

## Acceptance / Definition of Done

The MV3 shell is production-ready when every surface loads under the hardened CSP, all storage namespaces stay bounded, and no path contacts a provider host or syncs local data.

- [ ] Build/typecheck/test green: `pnpm --filter @agiworkforce/extension typecheck` + `test`, `pnpm lint:extension`; manifest contains only standard MV3 keys.
- [ ] Trust: no BYOK path, no Neon chat/memory sync client, `agi_memories` never leaves the device; all egress passes `validateGatewayUrl` / `validateBridgeUrl`.
- [ ] Security: `debugger` attaches only to allowlist tabs and detaches on every path; permission additions ship with a `THREAT_MODEL.md` update.

## Anti-patterns

- Adding `default_popup` or a second inference surface that holds provider keys — the extension is keyless by design.
- Introducing a delta-sync client or writing to Neon consumer chat/memory tables from the extension.
- Hardcoding a model ID instead of reading `packages/contracts/types/src/models.json` (`managed_cloud.taskRouting.computer_use`).
- Referencing removed tiers (Plus, pro_plus, Hobby) or in-extension checkout; paywalls render from server `429` only.
- Any reference to Supabase, or renaming `proxy.ts` back to `middleware.ts` in shared web code.
- Restating security policy in `background.ts`/tests instead of importing from `src/background/policy.ts`; leaving the debugger or native port attached on error.
