# AGI Chrome Extension — Volume 27 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01
Authority: `AGENTS.md` (repo root), `apps/extension/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon); grounded in `apps/extension/{manifest.json,THREAT_MODEL.md}` and real code under `apps/extension/src/features/computer-use/`, `.../native-bridge/`, `.../background/`, `.../cloud-bridge/`, `apps/extension/src/pairing.ts`, and `apps/extension/src/background/`. Model-by-plan gating draws model facts only from `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how the **AGI Browser Companion** behaves when things go wrong: denied permissions, unsupported pages, DOM churn, cross-origin walls, auth/stream failures, rate limits, and MV3 worker / debugger / Desktop-bridge dropouts mid-task. The companion is a **permission-gated browser agent**, so every failure must **fail closed toward the trust boundary**: no silent routing of Local/Desktop data to Cloud, no acting on a non-allowlisted page, no error swallowed into a fake "success." The extension holds **no provider keys and runs no inference**; all inference streams through the cloud gateway (`cloudAgentClient.ts`, `providerStreamClient.ts`). Managed Cloud is the only network trust mode reachable here — **BYOK and Local never apply to Chrome**. History and memory are `chrome.storage.local` only and never sync, so recovery is device-local. Handling means degrade gracefully, say what broke, and never fabricate capability.

## Permission Denied

A denied or revoked permission must abort the action with a specific, testable message — never a silent no-op or fake completion. CDP control requires the `debugger` permission (`manifest.json`); when denied, `attach()` rejects with `CDP attach failed: <msg>`. ✅ Built (`apps/extension/src/features/computer-use/cdpDriver.ts`, `THREAT_MODEL.md` §3.14). Actions on a non-allowlisted origin must be refused before any DOM mutation — 🟡 Partial: the message-policy matrix and `allowlisted-tab` sender class are enforced (`apps/extension/src/background/policy.ts` `MESSAGE_POLICY`, `agi_site_allowlist`), but a per-permission denial UI and `optional_permissions` re-prompts are 🔭 Planned.

## Unsupported Website

On `chrome://`, the Web Store, PDF viewers, and other pages where content scripts and CDP cannot run, the companion must detect the unsupported surface and disable action affordances, not throw. Autofill escalation classifies structural blockers — `unknown_platform`, `login_wall`, `captcha` — and on `login_wall` instructs the agent to **stop and report, never log in**. ✅ Built for the job-autofill path (`apps/extension/src/features/computer-use/escalationEngine.ts` `makeEscalationDecision`). A general unsupported-page preflight for arbitrary goals and high-risk-site detection/intervention (banking, checkout) beyond the login/CAPTCHA heuristics are 🔭 Planned.

## Dynamic DOM Changes

SPA re-renders invalidate element references mid-task. `waitForStable()` polls a DOM hash + `readyState` until quiet (3s cap, best-effort on timeout) after navigate/click/type; the index→selector map is **replaced on every `getPageContent()` snapshot** so stale indices cannot resolve — `resolveIndexedSelector()` returns `null` and the model re-snapshots. Read-back verification catches React swallowing a filled value (`verifyReadback` → `readback_mismatch`). ✅ Built (`apps/extension/src/features/computer-use/cdpDriver.ts`, `escalationEngine.ts`). Requirement: an action against a stale index must fail with a re-orient instruction, never click the wrong element.

## Cross-origin Restrictions

The content script runs `all_frames:false` and never `match_about_blank` (`manifest.json`), so cross-origin iframes are not scriptable and capture must treat foreign frames as opaque. Egress is hard-pinned: `validateGatewayUrl()` rejects any host outside `GATEWAY_URL_ALLOWLIST_EXACT` and rejects non-`https:`; the bridge accepts only `localhost`/`127.0.0.1`/`[::1]` (`ALLOWED_BRIDGE_HOSTS`); CSP `connect-src` further constrains origins. ✅ Built (`apps/extension/src/background/policy.ts`, `manifest.json`). **No provider host is ever contacted from the extension** — a request to `openai.com`/`anthropic.com` is an anti-pattern, not a fallback.

## Authentication Failure

The service worker cannot run Clerk's browser SDK; `getAuthToken()` reads a short-TTL session token from `chrome.storage.session` (`agi_clerk_session_token`), else `null` — a `null` token must surface an auth prompt, not proceed. A gateway **401** throws a specific "paste a fresh session token" error; a **403** is disambiguated as either the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` incident kill-switch or a plan gate — **never** framed as "an operator must enable an env var" (managed cloud is public alpha, open by default). ✅ Built (`apps/extension/src/features/computer-use/cloudAgentClient.ts`). Requirement: an expired token mid-stream must re-prompt, not loop.

## Streaming Failure

Both stream clients parse SSE `data:` frames and must survive truncation, malformed frames, and mid-stream disconnects. `streamFromProvider` yields a first-class `error` chunk (`retryable:true` on 5xx) then a `stop` frame, ignores malformed frames, and always `releaseLock()`s the reader in `finally`; `callCloud` skips malformed chunks and assembles partial `tool_calls` deltas. ✅ Built (`providerStreamClient.ts`, `cloudAgentClient.ts`). Requirement: a dropped stream renders a retry affordance and preserves the partial turn — never fabricate a completed answer; an `AbortSignal` abort stops cleanly.

## Rate Limits

A **429** with body `{kind:'paywall', feature, requiredTier}` must surface as a first-class `paywall` chunk driving upgrade UI, **not** an error toast — rendered from the server response, with **no in-extension checkout** (canon Chrome scope). ✅ Built (`apps/extension/src/features/native-bridge/providerStreamClient.ts`). `requiredTier` must map to the canon ladder — **Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise**. 🟡 Partial: `PaywallRequiredTier` still encodes legacy `'hobby'|'pro_plus'` labels (tracked billing-catalog reconciliation). Non-paywall 429s must back off.

## Browser Restart

In-memory agent state is lost on restart; persisted state must reload deterministically. Scheduled tasks re-arm via `restoreScheduledTaskAlarms()` on worker startup (MV3 restarts kill alarms); pairing state reloads from `chrome.storage.session` (cleared on browser close, so the user re-pairs); history/memory reload from `chrome.storage.local` with TTL/count pruning (100 convs/30-day; 200 memories). ✅ Built (`tasks.ts`, `pairing.ts`, `conversation-history.ts`, `memory-bridge.ts`). Requirement: no scheduled task fires twice or is dropped across a restart; an interrupted agent run does **not** auto-resume.

## Extension Disabled

When the user disables/uninstalls the extension, in-flight CDP sessions must tear down and no stale debugger attachment may outlive it (`THREAT_MODEL.md` §3.14). Per-action attach/detach means the debugger is never left attached across the disable boundary. ✅ Built (`cdpDriver.ts`). Device-scoped `chrome.storage.local` history/memory persist across disable→re-enable and never sync. Requirement: no scheduled task fires while disabled; re-enable re-arms alarms via `restoreScheduledTaskAlarms()`.

## Service Worker Restart

MV3 evicts the service worker aggressively; long agent loops must tolerate eviction mid-step. The `chrome.debugger.onDetach` listener (`ensureOnDetachListener()`) **transparently re-attaches** on eviction-driven detaches for registered active tabs, but **does not** re-attach on `canceled_by_user` (the user pulled the CDP banner). The send queue keeps an in-memory-authoritative snapshot with fire-and-forget writes so a mid-write eviction cannot corrupt it. ✅ Built (`cdpDriver.ts`, `sendQueue.ts`). Requirement: the ask-before-acting gate must **fail closed** — a 30s timeout resolves DENY, so a dropped approval UI can never auto-approve (`agentLoop.ts` P2-5).

## Desktop Bridge Unavailable

The native-messaging bridge (`com.agiworkforce.browser`) and localhost `8787` pairing bridge are optional; the extension must fully function (chat, autofill, computer-use) without them. When `/pair` refuses (ECONNREFUSED / non-OK), `requestPairing()` transitions to `phase:'error'` and the UI stays usable. Cross-surface cloud-unlock inheritance over the bridge is explicitly **deferred** — each surface tracks its own state. ✅ Built (`apps/extension/src/pairing.ts`, `apps/extension/src/features/cloud-bridge/desktopBridge.ts`). Requirement: a bridge outage degrades to a clear "Desktop not connected" state with retry, never a hang; token shape checks (32–128 chars) apply on reconnect.

## Repository map

- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,escalationEngine,cloudAgentClient}.ts` — agent loop, CDP driver, escalation, cloud stream.
- `apps/extension/src/features/native-bridge/{pairing,providerStreamClient,sendQueue}.ts`, `apps/extension/src/pairing.ts` — pairing, provider SSE, queue.
- `apps/extension/src/features/cloud-bridge/desktopBridge.ts`; `apps/extension/src/features/background/{tasks,conversation-history}.ts` — unlock state, alarms, local history.
- `apps/extension/src/background/{policy,memory-bridge}.ts`; `apps/extension/{manifest.json,THREAT_MODEL.md}` — allowlist/egress, device memory, permissions/CSP.

## Competitor notes

Claude for Chrome and OpenAI's browser/computer-use previews handle these edge cases inside a single first-party account with server-managed keys. AGI's divergence: trust rules bind **per surface** — Chrome is Managed-Cloud-only with **no BYOK and no Local** (unlike Desktop/CLI/VS Code), so a failure here can never silently fall back to a user key or local model. Egress is pinned to an AGI allowlist, history/memory stay device-local, and paywalls render from server 429s rather than an in-extension purchase.

## Acceptance / Definition of Done

Every edge case has a deterministic, user-visible outcome; no failure produces a fabricated success, silent no-op, or trust-boundary crossing; partial/legacy items are tracked, not shipped.

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` + `test` green and `pnpm lint:extension` clean; each edge case has a test (attach-denied, stale-index, 401/403/429, onDetach eviction vs. user-cancel, alarm restore, bridge down).
- [ ] Trust: no path routes Chrome data to BYOK/Local; egress stays within `GATEWAY_URL_ALLOWLIST_EXACT`/`ALLOWED_BRIDGE_HOSTS`; history/memory never sync; 403 messaging reflects public-alpha.
- [ ] Security: debugger never outlives a task/disable; approval gate fails closed on timeout; token shapes checked on reconnect; paywall tiers reconciled to the canon ladder before GA.

## Anti-patterns

- Falling back to a provider key or local model on Cloud auth/rate-limit failure (Chrome has neither), or contacting a provider host (`openai.com`, `anthropic.com`) as a "retry."
- Auto-approving a pending action when the approval UI is evicted (must fail closed/DENY); re-attaching the debugger after the user pulled the CDP banner.
- Fabricating a completed answer from a truncated stream, or reporting success on a stale/failed selector.
- Presenting removed tiers (`Plus`, `pro_plus`, `Hobby`), inventing INR prices for Pro/Max, or adding an in-extension checkout.
- Hardcoding a model ID instead of reading `packages/contracts/types/src/models.json`; referencing Supabase; renaming `proxy.ts` to `middleware.ts`; syncing history/memory off-device.
