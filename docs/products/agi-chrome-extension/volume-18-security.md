# AGI Chrome Extension — Volume 18 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/extension/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the surface's authoritative security artifacts: `apps/extension/THREAT_MODEL.md`, `apps/extension/MANIFEST_NOTES.md`, `apps/extension/manifest.json`, and `apps/extension/src/{background/policy.ts,background.ts,pairing.ts}` plus the feature files cited inline. Model facts referenced from `packages/types/src/models.json` (never re-listed).

## Overview & stance

The Chrome product is the **AGI Browser Companion** — a permission-gated browser agent, not a consumer assistant. Its security posture rests on one fact: the extension **holds no provider keys and runs no inference**. Chat and computer-use stream through the cloud gateway (`cloudAgentClient.ts`, `providerStreamClient.ts`); the key lives on the server. So this surface never exposes **BYOK** (Desktop/CLI/VS Code only) or **Local** inference. It touches two trust boundaries: **Managed Cloud** (signed-in, public alpha) for inference, and the **local desktop bridge** (a paired, loopback-only window over a session that keeps running on the host — not a fourth trust mode). Page DOM is always the **least-trusted** plane. `THREAT_MODEL.md`'s six-plane model (A extension page → F page-supplied data) is authoritative and every requirement below maps to it.

## Authentication

The service worker cannot run Clerk's browser SDK, so auth uses a **token-relay seam**: the popup/side-panel obtains a fresh Clerk session JWT and posts it to the worker, stored in `chrome.storage.session.agi_clerk_session_token` (short-lived, cleared on browser close); a dev/demo static token (`agi_dev_bearer_token`) exists for screencasts. `getAuthToken()` checks session first, then local, else returns `null` and the caller surfaces a sign-in prompt. 🟡 Partial — the relay seam and 401 handling are built (`cloudAgentClient.ts` `getAuthToken`), but the `createClerkClient`-for-service-workers integration is a tracked TODO (Day-2), so token freshness depends on the popup.

## OAuth

OAuth (Google/GitHub/etc.) is delegated entirely to the AGI web app's Clerk instance; the extension never runs its own OAuth flow and never receives provider OAuth tokens. It consumes only the resulting Clerk session JWT via the relay seam above; the web session lives in AGI web-app cookies scoped to AGI origins only (`THREAT_MODEL.md` §2). 🔭 Planned — a wired `syncHost` OAuth handoff (per `clerk-chrome-extension-patterns`) is design intent; today only the JWT relay is proven in repo.

## Permission Management

The manifest requests broad MV3 permissions (`tabs`, `cookies`, `debugger`, `nativeMessaging`, `scripting`, `tabGroups`, …) because MV3 needs them declared; **runtime access is far narrower** (`MANIFEST_NOTES.md`, `THREAT_MODEL.md` §2.1). ✅ Built (`apps/extension/src/background/policy.ts`):

- Page-originated messages are rejected unless the tab origin is in the user-managed `agi_site_allowlist` (`isAllowlistedSender`, EXT-1/EXT-2).
- State-mutating types (`SAVE_SHORTCUT`, `CREATE_SCHEDULED_TASK`, `SET_RECORDING_VALUE_CAPTURE`, …) are **extension-page-only** (`EXTENSION_PAGE_ONLY_MESSAGE_TYPES`, C-02/C-03).
- DOM writes are restricted to the sender's own tab (`DOM_MUTATION_MESSAGE_TYPES`, EXT-3).
- `chrome.debugger` (CDP) attaches only to allowlist-gated tabs and **detaches on every code path** (`MANIFEST_NOTES.md`).

## Session Security

Two session tokens, both in `chrome.storage.session` (never local, never disk-persisted). The **desktop-bridge pairing token** (`agi_bridge_token`) authorizes localhost bridge calls via the `X-Bridge-Token` header; token shape is validated `^[A-Za-z0-9_-]{32,128}$` and fingerprints `^[A-Za-z0-9_-]{4,32}$` (H-07). ✅ Built (`apps/extension/src/pairing.ts`). The bridge URL must be loopback — `validateBridgeUrl` accepts only `localhost`/`127.0.0.1`/`[::1]` and rejects `0.0.0.0` (H-02/H-03/H-08). 🔭 Planned — the canon's **QR + HMAC** request framing for the remote-window path is design intent beyond today's bearer-token pairing.

## Secure Storage

Storage is split by sensitivity and **nothing on this surface syncs** (Chrome is out-of-scope for conversation/memory sync per canon). ✅ Built:

- Provider API key: **none — dismantled by design.** The former `chrome.storage.session.agi_api_key` path was removed via H-10/CHROME-HIGH-3: `__tests__/security-fixes.test.ts` statically **forbids** reading `agi_api_key` and asserts `CHAT_MESSAGE` carries no `apiKey`; `background.ts` notes "The `apiKey` destructure is gone." The only surviving reference is logout cleanup (`options.ts` — `chrome.storage.local.remove`) purging any legacy copy. This is the enforcement of the no-provider-keys trust boundary, not an active key store. ✅ Built (removal + regression tests).
- Autofill profile: `chrome.storage.local.agi_autofill_profile`, **never** `chrome.storage.sync`; `migrateAutofillProfile()` clears any legacy sync copy (H-04).
- Memory: `chrome.storage.local.agi_memories`, max 200, device-scoped, never synced (`apps/extension/src/background/memory-bridge.ts`).
- History: `chrome.storage.local.agi_conversation_history`, 100 entries, 30-day TTL (`apps/extension/src/features/background/conversation-history.ts`).

## CSP

The `extension_pages` CSP is strict: `default-src 'self'; script-src 'self'; object-src 'self'; style-src 'self'` (no `unsafe-inline` — M-08 resolved via `<link>` stylesheets + Constructable Stylesheets); `img-src 'self' data:`; `connect-src` enumerates only the local bridge + AGI origins; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. ✅ Built (`apps/extension/manifest.json`).

## Extension Sandboxing

MV3 service-worker isolation; content script runs `all_frames:false`, `match_about_blank:false`. `externally_connectable` is **not** declared, so other extensions cannot message the worker. LLM-supplied markdown renders through DOMPurify (`sanitizeHtml`) with `FORBID_TAGS: img` — closing the EchoLeak Markdown-image exfil vector (CVE-2025-32711) — and forces `rel="noopener noreferrer"` on anchors (`THREAT_MODEL.md` §3.3). ✅ Built (`apps/extension/src/side_panel/markdown.ts`).

## Prompt-Injection Defenses — page content as data

Page content is **data, never instructions**. Text bound for the LLM passes `sanitizePageText` — strip invisible Unicode (zero-width/bidi/tag), shared `redactSecrets`, then cap at `MAX_CONTEXT_HTML_CHARS` (100 KB); page-supplied JSON is size-capped via `safeJsonParse` (JSON-LD 256 KB, WebMCP schema 64 KB, NLWeb 256 KB). ✅ Built (`apps/extension/src/background/policy.ts`). Computer-use is the highest-risk path: **ask-before-acting is the fail-closed default** (an unset `agi_cu_ask_before_acting` is treated as gated), approval requests carry a CSPRNG `crypto.randomUUID` id and are honored **only** from a trusted extension page (`sender.id === chrome.runtime.id && !sender.tab`), and no response within 30 s = DENY (`THREAT_MODEL.md` §3.14, `apps/extension/src/features/computer-use/agentLoop.ts`).

## High-risk-site Intervention

Cookie access is gated by a structured `BLOCKED_COOKIE_DOMAINS` blocklist (banks/crypto, `gov`/`mil`/healthcare, cloud consoles, auth providers, email, social) parsed with `new URL` + lowercased hostname in exact/suffix/substring modes (M-01); job platforms (LinkedIn/Lever/Greenhouse/Workday) are blocked at the **cookie** layer even though autofill writes their DOM. ✅ Built (`apps/extension/src/background.ts` `isCookieDomainAllowed`). The escalation engine detects login walls and CAPTCHA and tells the agent to **stop, not log in, and never click Submit** (`escalationEngine.ts`). 🟡 Partial — detection + the do-not-submit guardrail exist, but a user-facing "sensitive site" interstitial before computer-use runs is 🔭 Planned.

## Abuse Prevention

A per-tab/per-type `RateLimiter` (120 ops / 500 ms) throttles the message router (`apps/extension/src/utils.ts`). Entitlements are verified **server-side**: the gateway returns HTTP 429 with a structured `{kind:'paywall', feature, requiredTier}` body rendered as an upgrade card, and 403 when the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch re-gates or the account lacks the paid plan (`providerStreamClient.ts`, `cloudAgentClient.ts`). Egress is exact-match allowlisted (`validateGatewayUrl`, C-1/M-02). ✅ Built. 🟡 Gap — `providerStreamClient.ts` still types `PaywallRequiredTier` as `hobby|pro|pro_plus|max`, encoding **removed** tiers; reconcile to Free/Basic/Pro/Max/Enterprise (tracked billing-catalog task).

## Privacy Controls

Everything device-scoped stays device-scoped: no conversation sync, memory sync, image generation, or in-extension billing (canon out-of-scope). The recorder defaults to **selector-only**; on value opt-in it drops `<input type=password>`, redacts `cc-*`/`current-password`/`new-password`/`one-time-code`, and runs `redactSecrets` (C-05). Page-script console interception (`patchConsole`) was **removed entirely** (M-13, fingerprint/interference risk). ✅ Built (`THREAT_MODEL.md` §3.5/§3.13).

## Repository map

- `apps/extension/{THREAT_MODEL.md,MANIFEST_NOTES.md,manifest.json}` — model, manifest rationale, CSP.
- `apps/extension/src/background/policy.ts` — allowlists, gates, `sanitizePageText`, `validateBridgeUrl`/`validateGatewayUrl`, `safeJsonParse`, size caps.
- `apps/extension/src/background.ts` — message-router gates, cookie blocklist, rate limiter.
- `apps/extension/src/pairing.ts` (re-exported by `src/features/native-bridge/pairing.ts`) — bridge token/fingerprint validation.
- `apps/extension/src/features/computer-use/{agentLoop,cloudAgentClient,escalationEngine}.ts` — approval gate, cloud egress, high-risk detection.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — bridged-chat stream + 429 paywall.
- `apps/extension/src/background/memory-bridge.ts`, `src/features/background/conversation-history.ts` — device-scoped stores.
- `apps/extension/__tests__/*` — enforced invariants (`security-fixes.test.ts`, `policy.test.ts`, `computer-use-default-ask.test.ts`).

## Competitor notes

Claude for Chrome and Codex-style browser control treat page content as untrusted and gate high-risk actions — AGI mirrors that (ask-before-acting default, page-as-data). Divergence: (1) AGI is **multi-provider through a gateway** with no provider key ever in the browser; (2) trust is **per-surface** — no BYOK or Local inference in Chrome by design; (3) the extension is a **companion to a local host** (paired loopback bridge to Desktop), so compute can stay on the host; (4) history/memory is local-first and never synced, unlike assistants that sync conversations by default.

## Acceptance / Definition of Done

Production-ready when every `THREAT_MODEL.md` §4 invariant is green, no page-originated message can mutate persistent state or a foreign tab, and no path can egress a JWT or key to a non-allowlisted origin.

- [ ] Build: `pnpm --filter @agiworkforce/extension test` and `pnpm lint:extension` pass; conflict-marker + `patchConsole`-removed checks green.
- [ ] Trust: provider key never leaves `chrome.storage.session`; no BYOK/Local inference path exists in `apps/extension`; bridge URL loopback-only; gateway egress exact-match only.
- [ ] Security: computer-use default is ask-before-acting (unset = gated); approvals accepted only from trusted extension pages with CSPRNG ids; `sanitizePageText` + size caps applied on every page→LLM path; cookie blocklist covers finance/gov/auth/email/social.

## Anti-patterns

- Adding a BYOK key field or any in-browser inference — Chrome is Cloud-bridge-only; keys live server-side.
- Silently routing Local/BYOK/Desktop-session data through the cloud gateway, or sending the provider key to the local bridge.
- Defaulting computer-use to allow-all, or accepting an approval response from a content script.
- Feeding raw page text/JSON to the LLM without `sanitizePageText`/`safeJsonParse` caps, or treating page content as instructions.
- Widening `connect-src`/gateway allowlist to `*.agiworkforce.com`, re-adding `style-src 'unsafe-inline'`, or declaring `externally_connectable` without extending sender checks.
- Persisting secrets to `chrome.storage.local`/`sync`, or adding conversation/memory **sync** (out-of-scope) — history/memory stay device-scoped.
- Hardcoding a model ID (use the `COMPUTER_USE_MODEL` constant from `models.json`), referencing removed tiers (`hobby`/`pro_plus`/Plus), inventing INR prices, or referencing Supabase.
