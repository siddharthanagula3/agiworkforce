# AGI Chrome Extension — Volume 02 — Authentication

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `apps/extension/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`; grounded in `apps/extension/manifest.json`, `apps/extension/src/background.ts`, `apps/extension/src/side_panel.ts`, `apps/extension/src/features/cloud-bridge/freeTrialClient.ts`, `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/pairing.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

The AGI Chrome Extension is the **AGI Browser Companion** — a permission-gated browser agent, not a standalone assistant. It holds **no provider keys and runs no inference**: every model call streams through the cloud gateway or the desktop bridge. That constraint shapes authentication end-to-end. There is **no in-extension checkout, no Clerk UI, and no OAuth widget**. The extension is a _client_ of an account created and managed on the Web surface; it holds only a short-lived session token to authorize cloud-gateway calls, plus a separate pairing token for the localhost desktop bridge.

Trust modes apply narrowly here. **BYOK does not exist on Chrome** (Desktop/CLI/VS Code only). The extension operates in exactly two authenticated postures: (1) **Managed Cloud** — a signed-in user whose session token authorizes `/api/v1/providers/<id>/stream` through the gateway (`providerStreamClient.ts`), public alpha, open by default; and (2) **bridged-to-Desktop** — a paired localhost session where the desktop host owns compute and persistence. Neither posture syncs consumer chat history: history and memory stay `chrome.storage.local`, device-scoped (`background.ts` sync-rule header). Cookie/redaction hygiene is authentication-critical: the extension must never read its own auth cookies or third-party identity cookies to impersonate a user.

## First Run Experience

On install the side panel renders a **signed-out** state: a sign-in prompt plus the site-allowlist/permission posture. No credentials exist yet; cloud actions are unavailable until the user signs in on the web, and browser-agent actions remain approval-gated. **✅ Built** — `apps/extension/src/side_panel.ts` renders `sp-cloud-signin-prompt` with copy "Sign in to get 3 free cloud chat prompts…" and `refreshCloudAccountUI()` shows the signed-out branch when `getAuthToken()` returns null. Requirement: first run must not auto-connect to any provider host or silently pair with a desktop; both are explicit user actions.

## Sign In — account link via web/desktop

Sign-in is a **link, not a form**. The button opens `https://agiworkforce.com/sign-in` in a new tab (Clerk on the Web surface); the user then copies their Clerk session token into the side-panel field, which calls `storeSessionToken()`. **✅ Built** — `side_panel.ts` (`chrome.tabs.create({ url: '.../sign-in' })`, "Paste Clerk session token…" input) and `freeTrialClient.ts`. A smoother **native token handoff** (web page or desktop bridge supplying the token) is design intent. **🔭 Planned** — no `chrome.identity`/message-channel handoff exists in `apps/extension/src`. Requirement: any future handoff must be origin-checked to `agiworkforce.com` and must reject tokens from arbitrary page script.

## Sign Up — routed to web

There is **no sign-up inside the extension**. New accounts are created on the Web surface (Clerk); the extension only deep-links out. **🟡 Partial** — the extension links to `.../sign-in` and `.../pricing` (`side_panel.ts`), but a dedicated `.../sign-up` deep-link is not yet wired; sign-up is reached via the web sign-in page. Requirement: never render account-creation, email/password capture, or checkout in the extension.

## OAuth

The extension performs **no OAuth of its own** — no `chrome.identity`, no `launchWebAuthFlow`, no provider consent screen (confirmed: zero matches in `apps/extension/src`). OAuth/SAML is delegated to Clerk on the Web surface; the extension consumes the resulting session token. **🔭 Planned** — a first-class `syncHost`/OAuth bridge (per Clerk chrome-extension patterns) is design intent, not built. Requirement: the extension must never embed provider OAuth secrets or contact a provider auth host directly (EGRESS rule in `providerStreamClient.ts`/`cloudAgentClient.ts`: no provider host is ever contacted from the extension).

## Session Management

The Clerk session token is stored in **`chrome.storage.session` (in-memory, cleared on browser close), never on disk**. `getAuthToken()` reads, in priority order: `chrome.storage.session['agi_clerk_session_token']`, then a **dev-build-only** `chrome.storage.local['agi_dev_bearer_token']` (tree-shaken out of production via `import.meta.env.DEV`), then null. **✅ Built** — `freeTrialClient.ts` (`getAuthToken`, `storeSessionToken`). Requirement: fail closed — if session storage is unavailable, do not persist a credential to disk; re-prompt for sign-in. Token expiry surfaces as a 401 from the gateway and must drop the client back to the signed-out UI.

## Subscription Verification — server-side entitlements

Entitlements are **verified server-side only**; the extension renders state from server responses. Over-quota returns **HTTP 429 with `{ kind:'paywall', feature, requiredTier, reason }`**, which the UI renders as a paywall/upgrade prompt (upgrade opens `.../pricing`). Free-trial quota (3 cloud prompts) is tracked via `getRemainingFreePrompts()`. Model-by-plan gating mirrors the catalog's `tierAllowedModels` in `packages/contracts/types/src/models.json` — the extension must not invent model IDs or grant models the server would refuse. **🟡 Partial** — 429 paywall handling exists (`providerStreamClient.ts` `PaywallPayload`) and quota UI exists (`side_panel.ts`, `freeTrialClient.ts`), **but** `PaywallRequiredTier` still encodes removed tiers `'hobby' | 'pro' | 'pro_plus' | 'max'`. Gap: reconcile to canon tiers (Free / Basic / Pro / Max / Enterprise; drop `hobby`/`pro_plus`) — tracked with the `billing-catalog.ts` reconciliation. Requirement: never client-side-elevate entitlements; the server is authoritative.

## Device Registration

There is no separate cloud "device registry." Two device-scoped identities exist: the **CRX extension origin** (`chrome-extension://<id>`, the CORS principal for the gateway) and the **desktop pairing token** `agi_bridge_token` with a short user-visible fingerprint, validated by shape (`PAIRING_TOKEN_RE`, 32–128 chars) and carried as `X-Bridge-Token`; the native bridge also negotiates a per-session HMAC-SHA256 secret. **✅ Built** — `pairing.ts` and `background.ts` (`X-Bridge-Token`, HMAC envelope). An account-managed registered-devices list is **🔭 Planned**. Requirement: pairing is outbound-only to `127.0.0.1`/`localhost` and approval-gated; a paired desktop is a remote window, not a new trust mode.

## Account Switching

Switching accounts today = **sign out, then sign in with a different token** (single active session). **🟡 Partial** — `clearAuthToken()` + re-paste is supported (`side_panel.ts`, `freeTrialClient.ts`), but no multi-account picker or fast-switch exists. **🔭 Planned** — an in-panel account switcher. Requirement: switching must clear the prior session token, quota cache, and any bridge pairing that belonged to the old identity before the new session is usable.

## Logout

Logout clears the in-memory session token and the dev-only local token, then re-renders the signed-out UI. **✅ Built** — `clearAuthToken()` removes `agi_clerk_session_token` (session) and `agi_dev_bearer_token` (local); the side-panel sign-out handler calls it and refreshes. Requirement: logout must not touch the user's website cookies (the extension never manages `agiworkforce.com` auth cookies) and must not delete `chrome.storage.local` conversation history unless the user explicitly requests a data wipe.

## Repository map

- `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` — `getAuthToken`/`storeSessionToken`/`clearAuthToken`, session-token storage contract, free-trial quota.
- `apps/extension/src/side_panel.ts` — sign-in/sign-out UI, `refreshCloudAccountUI`, quota + upgrade rendering, web deep-links.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — gateway stream client + `PaywallPayload` (429) types.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — cloud agent client + EGRESS rule.
- `apps/extension/src/pairing.ts` (+ `src/features/native-bridge/pairing.ts` re-export) — desktop pairing token/fingerprint validation.
- `apps/extension/src/background.ts` — `X-Bridge-Token`, HMAC envelope, cookie blocklist, sync-rule compliance header.
- `packages/contracts/types/src/models.json` — `tierAllowedModels`, model-by-plan gating.

## Competitor notes

Claude for Chrome and ChatGPT's browser extensions authenticate against a single first-party account and gate features by that vendor's plan. AGI's deliberate divergence: (1) **per-surface trust** — Chrome carries no BYOK and no local inference, so it holds a session token only, never provider keys; (2) **web-owned identity** — account creation, OAuth, and checkout live on the Web surface (Clerk); (3) **local-first bridge** — a paired desktop keeps compute and persistence on the host (parity: Claude Code Remote Control / Codex remote connections); (4) **server-authoritative entitlements** from 429 paywall payloads, not client-side plan checks.

## Acceptance / Definition of Done

Production-ready when: signed-out first run is safe and inert; sign-in/out round-trips through the web account with no in-extension checkout; the session token lives only in `chrome.storage.session`; entitlements come only from server responses; pairing is approval-gated and HMAC-verified; and paywall tiers match canon.

- [ ] **Build**: `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; sign-in → token store → gateway auth verified against a stub 401/429.
- [ ] **Trust**: no BYOK path; no provider host contacted from the extension (EGRESS assertion holds); session token never written to `chrome.storage.local` in production.
- [ ] **Security**: cookie blocklist covers `agiworkforce.com` and identity providers; logout clears session + dev token; `PaywallRequiredTier` reconciled to Free/Basic/Pro/Max/Enterprise.

## Anti-patterns

- Adding in-extension sign-up, OAuth widgets, or Stripe checkout (removed scope).
- Persisting the Clerk session token to `chrome.storage.local`/disk, or trusting a token posted by arbitrary page script.
- Client-side entitlement elevation instead of honoring server 429/401.
- Referencing removed tiers (`hobby`, `pro_plus`, "Plus", "Hobby") or inventing INR prices for Pro/Max.
- Hardcoding model IDs instead of reading `packages/contracts/types/src/models.json` `tierAllowedModels`.
- Reading the user's `agiworkforce.com` auth cookies to impersonate a session, or syncing chat/memory off-device.
- Any reference to Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts` in cross-surface auth notes.
- Treating a paired desktop as a fourth trust mode instead of an approval-gated remote window.
