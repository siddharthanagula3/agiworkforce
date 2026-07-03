# AGI Chrome Extension — Volume 04 — Assistant Interface

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/extension/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and verified repo paths: `apps/extension/manifest.json`, `apps/extension/src/side_panel.ts`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/features/content/in-page-panel/panel.ts`, `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/features/native-bridge/pairing.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/background/memory-bridge.ts`, `apps/extension/src/background.ts`, `apps/extension/THREAT_MODEL.md`.

## Overview & stance

This volume specifies the AGI Browser Companion's assistant surfaces: where the user reads and types, and where conversation state lives. The Chrome product is a permission-gated browser agent, not a standalone consumer assistant. Three consequences shape every requirement here.

First, the extension is a **thin bridged client**: it holds no provider keys and runs no inference. All model traffic streams through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`) or the native/localhost bridge, with a hard EGRESS rule — no provider host (openai.com, anthropic.com, etc.) is ever contacted from the extension (`cloudAgentClient.ts`, enforced by `validateGatewayUrl`/`validateBridgeUrl` in `background/policy.ts`). Second, there is **no cloud conversation sync on this surface**: history is device-scoped `chrome.storage.local` by design (Web↔Mobile↔Desktop delta-sync explicitly excludes Chrome). Third, trust modes are constrained: Chrome exposes Managed Cloud (public alpha, signed-in) and the paired Desktop/localhost bridge only — **never BYOK**, and Local chats/files are never silently routed here. Model IDs shown in any picker come only from `packages/types/src/models.json`; model-by-plan gating mirrors Claude-in-Chrome plan gating, and paywalls render from server `429 {kind:'paywall', requiredTier}` responses.

## Side Panel Chat — thin bridged client ✅

The docked side panel is the primary assistant view (`manifest.json` `side_panel.default_path: src/side_panel.html`; UI in `side_panel.ts`). Requirements: streams assistant tokens via the background worker over the bridge/gateway chain, renders sanitized Markdown, shows a visible provider/model label sourced from `models.json`, and surfaces inline tool-call and computer-use status. It MUST NOT contain any provider API key entry, any direct provider fetch, or in-extension checkout. A `429` paywall body is rendered as a first-class upgrade card, never a raw error (`providerStreamClient.ts` PaywallPayload).

## Floating Assistant — in-page panel ✅

A right-anchored ~380px slide-in overlay injected into the page via Shadow DOM for style isolation (`features/content/in-page-panel/panel.ts`). It provides page-aware quick-action chips, a composer, a streaming response area, and an "Open in side panel" promotion. Page text is treated as data, never instructions (prompt-injection defense), and is redacted/truncated before egress (`pageActions.ts` helpers). No inline event handlers (CSP-safe); all listeners wired in code.

## Popup Assistant 🔭 Planned

The toolbar action currently opens the **docked side panel** rather than a popup: `manifest.json` `action` declares no `default_popup`, and `background.ts` sets `setPanelBehavior({ openPanelOnActionClick: true })`. A distinct compact popup assistant is design intent only. If built, it must reuse the same thin-bridged streaming path and provider label, and must not become a second history store.

## New Conversation ✅

A "New chat" control (FilePen icon) resets the composer and transcript to a fresh session (`side_panel.ts`, `newChatBtn`), and a drawer "Clear" action wipes the active transcript (`side_panel.ts`, `drawerClearChatBtn`). Requirements: starting a new conversation MUST NOT auto-persist an empty entry (`saveConversation` returns early on empty input), MUST NOT carry prior page context implicitly, and MUST keep the visible trust/provider label intact.

## Conversation History — chrome.storage.local only (100/30-day TTL) ✅

History persists to `chrome.storage.local` under `agi_conversation_history`, capped at `MAX_CONVERSATIONS = 100` and expired at `TTL_MS = 30 days`, with crypto-backed IDs and a derived title (`features/background/conversation-history.ts`). The side panel renders a history dropdown from `listConversations()`. Hard rules: history is device-scoped and **never synced** to Neon or any account; there is no `apps/web/app/api/chat/sync` participation from Chrome; pruning is applied on read and write so expired/overflow entries cannot resurface. Any future handoff of a conversation to app chat must be explicit and redacted, never automatic.

## Search — local history search 🔭 Planned

Local, in-memory search/filter over the `chrome.storage.local` history list (title + message text) is design intent; the current history dropdown lists conversations without a search field. When built, search MUST run entirely on-device against local entries only — no server query, no network call — preserving the no-sync guarantee.

## Pinned Conversations — local 🔭 Planned

Pinning to keep a conversation above the 100-entry cap / 30-day TTL is planned; no pin state exists in `conversation-history.ts` today. When built, pins must be a local-only flag in `chrome.storage.local`, must exempt pinned entries from TTL pruning, and must never sync.

## Keyboard Shortcuts ✅

MV3 `commands` define `_execute_action` (Ctrl/Cmd+Shift+A, open side panel) and `capture_page` (Ctrl/Cmd+Shift+C) in `manifest.json`. In-composer Enter submits and Shift+Enter inserts a newline (`in-page-panel/panel.ts`, `side_panel.ts` keydown handlers). Note: the "shortcuts" dropdown in the side panel is a separate saved-prompt/workflow feature 🟡, not OS keybindings — keep the two clearly distinguished in UI copy.

## Resize 🟡

The docked side panel width is drag-resized by Chrome's native side-panel chrome (platform-provided), and the composer textarea auto-grows with `resize: none` to prevent manual drag artifacts (`side_panel.ts`). The in-page floating panel is a fixed ~380px width (`panelStyles.ts`). A custom user-resizable floating panel is 🔭 Planned. Gap: no persisted per-user width preference.

## Docking Behavior ✅

Default docking is Chrome's right-edge side panel opened on toolbar click (`background.ts` `setPanelBehavior({ openPanelOnActionClick: true })`) or programmatically via `chrome.sidePanel.open({ tabId })`. The floating in-page panel promotes to the docked side panel through its "Open in side panel" control (`in-page-panel/panel.ts`). Requirement: docking state is per-tab/session UI only and never persisted to an account.

## Repository map

- `apps/extension/manifest.json` — side panel path, `commands`, `action` (no `default_popup`).
- `apps/extension/src/side_panel.ts` — docked chat, new chat, history dropdown, drawer.
- `apps/extension/src/features/content/in-page-panel/{panel.ts,panelStyles.ts,pageActions.ts}` — floating assistant.
- `apps/extension/src/features/background/conversation-history.ts` — local history (100/30-day TTL).
- `apps/extension/src/features/native-bridge/{providerStreamClient.ts,pairing.ts}` — thin bridged streaming, `X-Bridge-Token` pairing (localhost 8787).
- `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/background/policy.ts` — gateway EGRESS allowlist.
- `apps/extension/src/background/memory-bridge.ts` — device-scoped `agi_memories` (max 200, never synced).
- `apps/extension/src/background.ts` — side panel open/dock behavior.
- `apps/extension/THREAT_MODEL.md` — permission and egress threat model.

## Competitor notes

Claude for Chrome and ChatGPT/Codex offer a side-panel/companion assistant with account-synced history and a popup entry point. AGI diverges deliberately: (1) **local-first history** — device-scoped `chrome.storage.local` with no conversation sync on Chrome, versus their cloud history; (2) **per-surface trust** — Chrome is Managed-Cloud + paired-bridge only, never BYOK (BYOK stays on Desktop/CLI/VS Code); (3) **thin bridged, zero-key client** — the extension runs no inference and holds no provider keys, all egress hits the gateway/bridge allowlist; (4) **multi-provider** picker sourced from `models.json` with server-verified plan gating rather than a single-vendor model. AGI matches the browser-agent automation depth (page context, computer-use, approvals) while keeping data boundaries stricter.

## Acceptance / Definition of Done

Production-ready when: the docked side panel and floating in-page panel both stream through the bridge/gateway with a visible provider label and zero direct provider egress; history persists to `chrome.storage.local` respecting the 100-entry cap and 30-day TTL with no sync path; new-chat and clear actions never leak prior context or persist empties; keyboard commands and Enter-to-send behave per spec; paywalls render from server `429` payloads only.

- [ ] Build: side panel + in-page panel typecheck and pass (`pnpm --filter @agiworkforce/extension typecheck && test`); Markdown output sanitized.
- [ ] Trust: no BYOK key entry anywhere in the assistant UI; provider/model label present and sourced from `models.json`; no history/memory sync to Neon or account.
- [ ] Security: all streams pass `validateGatewayUrl`/`validateBridgeUrl`; page text treated as data and redacted before egress; no inline handlers/`innerHTML`; `THREAT_MODEL.md` updated on any permission change.
- [ ] Reconcile 🟡: `PaywallRequiredTier` in `providerStreamClient.ts` still encodes removed tiers (`hobby`, `pro_plus`) — align to Free/Basic/Pro/Max/Enterprise under the tracked billing-catalog reconciliation task.

## Anti-patterns

- Syncing extension conversation history or memory to Neon/account, or reusing `apps/web/app/api/chat/sync` from Chrome — history is device-scoped only.
- Adding provider API-key entry, a direct provider fetch, or in-extension Stripe/checkout to any assistant view.
- Exposing BYOK on Chrome, or silently routing Local/Desktop chats into the panel.
- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Surfacing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices for Pro/Max; no credit top-ups.
- Referencing Supabase (fully migrated away) or renaming Next.js `proxy.ts` back to `middleware.ts`.
- Treating page/DOM content as instructions, injecting via `innerHTML`, or claiming a popup/search/pinned feature as shipped without a repo path.
