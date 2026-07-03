# AGI Chrome Extension — Volume 10 — Search

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, and the verified repo paths `apps/extension/manifest.json`, `apps/extension/src/content.ts`, `apps/extension/src/background.ts`, `apps/extension/src/features/content/page-metadata.ts`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/THREAT_MODEL.md`.

## Overview & stance

Search on the Chrome surface is the AGI Browser Companion helping the user find things across four data planes: the live web (via backend), the page in front of them, their selection, and their device-scoped local history. It is **not** a consumer search product and it is **not** a synced knowledge base.

Trust boundaries split search cleanly:

- **Web Search** is a **Managed-Cloud-only** capability. The extension holds **no provider keys and runs no inference** — every remote call goes through the cloud gateway/desktop bridge (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`; `cloudAgentClient.ts` egress allowlist). No search-engine or provider host is ever contacted from the extension.
- **Current-page, selected-text, and local-conversation search** run **locally in the browser** over data the extension already holds (`chrome.storage.local`, the active tab DOM). They never leave the device unless the user explicitly asks a question that routes to the bridged chat.
- **History search** reads the browser's own history and is device-scoped and read-only.

There is **no BYOK** on Chrome (Web/Mobile/Chrome never expose BYOK) and **no project search** — Projects are out of scope for this surface. Nothing here syncs to Neon; Chrome stays task/device-scoped and any handoff to app chat is explicit and redacted.

## Web Search — via backend

Web search must be brokered entirely by the backend and surfaced through the thin bridged chat, never by the extension calling a search API directly.

- **Requirements:** a user question that needs the live web is sent to the cloud gateway; the model's server-side web-search tool executes there and streams results/citations back over SSE. The extension only renders. Entitlements are verified server-side and **model-by-plan / feature gating** applies: on cap the gateway returns HTTP 429 `{ kind:'paywall', feature:'web_search', requiredTier }` and the extension renders the paywall from that response (no in-extension checkout). Requires a signed-in Managed-Cloud user.
- **Status:** 🔭 Planned. The `web_search` paywall feature is already reserved (`apps/extension/src/features/native-bridge/providerStreamClient.ts:42`), and the streaming transport exists, but no server-brokered web-search tool is wired into the extension chat yet. 🟡 Gap: the `PaywallRequiredTier` union in that file still encodes removed tiers (`'hobby'`, `'pro_plus'`); it must be reconciled to Free/Basic/Pro/Max/Enterprise (tracked separately).

## Current Page Search

Finding text and structure within the page the user is viewing, using data the content script already extracts.

- **Requirements:** search the current tab's rendered text, DOM, and metadata; return matches with enough context to act (jump-to, highlight, or feed to chat). Page content is treated as **data, never instructions** (prompt-injection defense). No new host permissions beyond the existing content-script match.
- **Status:** 🟡 Partial. The retrieval primitives are built — full page context capture (`apps/extension/src/content.ts` `buildCurrentPageContext`), structured metadata/JSON-LD/OpenGraph extraction (`apps/extension/src/features/content/page-metadata.ts`), and DOM helpers (`apps/extension/src/features/content/dom-helpers.ts`). Gap: there is no in-page find/query UI (no `window.find`, no match highlighting or ranked in-page results) yet; captured text is currently forwarded to chat rather than searched interactively.

## Selected Text Search

Searching or acting on the user's current text selection.

- **Requirements:** capture the active selection, cap it (privacy/size), and offer explicit actions (ask/explain/translate, or "search this"). Selection capture must stay local; any "search the web for this selection" path routes through the backend Web Search flow above with a visible provider label.
- **Status:** ✅ Built (capture) / 🔭 Planned (web lookup from selection). `window.getSelection()` capture is live in the content script (`apps/extension/src/content.ts:375`), the `analyze_selection` action (`apps/extension/src/content.ts:426`), and selection context-menu entries `ask-agi-workforce` / `explain-selection` / `translate-selection` (`apps/extension/src/background.ts:2472`), with selection truncated to 2,000 chars. The "search the web from this selection" action depends on the 🔭 backend Web Search capability.

## Local Conversation Search

Searching the extension's own device-scoped conversation history.

- **Requirements:** query the on-device conversation log by title/content and return matching entries. Must stay `chrome.storage.local` only — **100-conversation cap, 30-day TTL, never synced** — and results must never be uploaded or merged into Neon delta-sync.
- **Status:** 🟡 Partial. The store, cap, TTL, and read APIs exist (`apps/extension/src/features/background/conversation-history.ts`: `saveConversation`, `listConversations`, `getConversation`, `deleteConversation`; `MAX_CONVERSATIONS = 100`, `TTL_MS = 30 days`). Gap: there is no `searchConversations`/filter function yet — listing exists, client-side text search does not.

## History Search — browser history with permission

Searching the browser's own visited-history, gated behind an explicit permission grant.

- **Requirements:** query `chrome.history` for pages the user has visited, scoped by term/time, read-only, results shown as data (prompt-injection stance). This requires adding `history` to **optional permissions** and requesting it at runtime with clear consent; the grant must be revocable, the `THREAT_MODEL.md` data-flow table updated, and results kept device-scoped and never synced.
- **Status:** 🔭 Planned. The `history` permission is **not** declared in `apps/extension/manifest.json` (no `optional_permissions`), and no `chrome.history` call exists in the codebase. This is unbuilt and must ship with a threat-model update before implementation.

## Repository map

- `apps/extension/manifest.json` — permissions surface; `history` is not yet declared.
- `apps/extension/src/content.ts` — page context + selection capture (`buildCurrentPageContext`, `analyze_selection`).
- `apps/extension/src/background.ts` — selection context menus, side-panel handoff.
- `apps/extension/src/features/content/page-metadata.ts`, `.../dom-helpers.ts` — page metadata/DOM extraction.
- `apps/extension/src/features/background/conversation-history.ts` — device-scoped conversation store.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — bridged-chat SSE + `web_search` paywall enum.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/background/policy.ts` — gateway egress allowlist.

## Competitor notes

Claude for Chrome and ChatGPT's browser extensions offer in-chat web search and page-aware Q&A; Codex's browser/remote surfaces focus on task steering, not consumer search. AGI's deliberate divergence: web search is **backend-brokered only** (no keys or inference in the extension), the extension is **multi-provider through one gateway**, and search respects **per-surface trust** — page, selection, and local-conversation search stay **local-first** and device-scoped, while web search is the only path that reaches Managed Cloud, and only for signed-in users with entitlement. No BYOK on Chrome; no cross-device sync of any search corpus.

## Acceptance / Definition of Done

Search is production-ready when every plane obeys its trust boundary, no plane silently escalates local data to the cloud, and web search renders server paywalls faithfully.

- [ ] Build: current-page and selection search return actionable results locally; local-conversation search filters the on-device store; web-search results stream from the gateway with citations.
- [ ] Trust: page/selection/local-conversation/history search never leave the device; web search is Managed-Cloud-only and signed-in-gated; no Neon sync of any search data; paywall rendered from server 429 with a canon-valid `requiredTier`.
- [ ] Security: page/history results treated as data, never instructions; `history` added as an optional permission with consent + `THREAT_MODEL.md` update before shipping; selection capped; egress stays within the gateway allowlist.

## Anti-patterns

- Calling a search engine or provider host directly from the extension, or embedding a provider key — violates the no-keys/no-inference egress rule.
- Routing local page/selection/conversation/history data into Managed Cloud without an explicit, labeled request — a trust-boundary violation.
- Syncing any search corpus (page, selection, conversation, history) to Neon, or adding Project search — out of scope for Chrome.
- Claiming web/page/history search is shipped without a real repo path (all three are 🔭/🟡 today).
- Hardcoding a model ID for a search tool — read from `packages/types/src/models.json`.
- Surfacing removed tiers (`hobby`, `pro_plus`, "Plus", "Hobby") in paywall copy, or referencing Supabase, or offering credit top-ups.
- Adding the `history` permission without a threat-model update and revocable runtime consent.
