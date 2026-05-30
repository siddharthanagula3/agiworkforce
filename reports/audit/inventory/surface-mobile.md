# Surface Inventory Audit — Mobile (Expo 55 + React Native)

**Slice:** Mobile surface — `apps/mobile`, `ios/`
**Date:** 2026-05-29
**Auditor:** inventory auditor (read-only recon)
**Method:** Anchor-doc read → systematic Grep signal collection → targeted Read of entry points, security-sensitive files, the local-LLM chat path, feature gates, and import chains. Roughly 380 non-test `.ts`/`.tsx` source files; I read the load-bearing modules and sampled the rest.

> **Headline:** The mobile surface is genuinely built, not slop. Security primitives (HMAC/HKDF dispatch auth, secure storage, URL allowlist, TLS-pinning chokepoint) are real and well-reasoned. The v1 local-only architecture (`v1FeatureFlags` + `remoteChatGate` + on-device `localGenerate`) is wired correctly and fails closed. **However there is one confirmed P0 ship-blocker: TLS pinning is enforced with placeholder pins, which throws at module load in any preview/production build, crashing the app on launch.** This is a known, tested tripwire awaiting ops provisioning — not an accidental bug — but it blocks every TestFlight/App Store build as-is.

---

## Purpose & Architecture

AGI Mobile is the **lead launch surface**: a single iOS+Android Expo app delivering private on-device AI chat (Local mode, no account, offline) in v1, with Cloud Managed invite/waitlist gated and **no BYOK in mobile v1**.

- **Stack (verified from `apps/mobile/package.json`):** Expo `~55.0.23`, **React Native `0.83.6`** (surface doc claims 0.84.0 — stale), React `19.2.0`, NativeWind `^4.2.3`, **react-native-mmkv `^3.2.0`** (surface doc claims 4.3.1 — stale).
- **Routing:** Expo Router file-based, 66 `.tsx` route files under `app/` (groups: `(public)` onboarding/age-gate, `(auth)` login/reset, `(app)` main with nested `(tabs)`, `chat`, `settings/*`, `billing`, `dispatch`, `agents`, `code`, `schedules`, `connectors`, `messaging`, `legal`).
- **Feature modules:** `src/features/*` (31 features), Zustand `stores/*`, `services/*` (29 service modules), `lib/*` (18 utility/security modules), `storage/*` (SQLCipher + MMKV + sqlite-vec repositories), `native/{ios,android}` (Tier-1 native modules + Expo config plugins).
- **Two iOS projects exist:** `ios/` (root, `agiworkforce.xcodeproj`, lowercase) AND `apps/mobile/ios/` (`AGIWorkforce.xcodeproj`, CamelCase). The surface doc treats the root `ios/PrivacyInfo.xcprivacy` as Xcode-canonical. This duplication is a drift risk (see P2).

**v1 local-only chat flow (the core value prop) — VERIFIED REAL:**
`stores/chat/chatExecutionStore.ts` `sendMessage()` checks `getRemoteChatDisabledReason()`; when remote is disabled (the v1 default) it calls `localGenerate()` from `@agiworkforce/local-llm` with real streaming `onToken` callbacks, graceful "download a model" fallback, and abort handling. `localGenerate` (`packages/local-llm/src/selector.ts:115`) dispatches to real tier1/tier2/tier3 adapters — not a stub.

---

## Alive vs Dead

**ALIVE (reachable from entry points, shipping in v1):**
- Onboarding (`app/(public)/onboarding.tsx`) — hero → device-tier → download flow; sets `onboarding-done` MMKV flag; root `_layout.tsx` redirects accordingly. **The prior P0 first-run dead-end is fixed.**
- Age gate (`app/(public)/age-gate.tsx`) — gates before onboarding on first run.
- Local chat: `app/(app)/chat/[id].tsx` → `useChatStore` → `chatExecutionStore` → `localGenerate`.
- Models picker + download: `app/(app)/models.tsx`, `src/features/model-picker/*`, `services/modelDownload.ts` (real resumable, SHA-256-checked, Wi-Fi-aware download).
- Settings tree, memory, artifacts, voice, translate (native module), camera/scan (Vision OCR), legal/Article-50, account (sign-in optional, auth flagged off).
- Security/compliance chain: `lib/secureStorage.ts`, `lib/mmkv.ts`, `lib/biometricFlagStore.ts`, `hooks` biometric gate, `services/complianceLedger.ts`, `services/llmGate.ts`, `lib/contentFilter.ts` (minor-safe blocklist), `lib/safeOpenURL.ts`.

**DEAD / PRESERVED-BUT-GATED in v1 (intentional, flag-hidden — NOT slop):**
- Cloud chat, billing, auth, BYOK keys, agents, dispatch, schedules, companion, messaging, cloud connectors, web search, computer use, image gen, cross-device sync — all `false` in `lib/v1FeatureFlags.ts`. Screens return `null` when flag off (e.g. `dispatch/index.tsx:525`, `settings/integrations.tsx:276`), drawer hides items (`DrawerContent.tsx:47-63`), and services throw clear errors (`usage.ts:48`: "cloud usage not available in v1"). Gating is consistent and disciplined.
- `storage/providerKeys.ts` — BYOK key-metadata repository exists but `FEATURES.byokKeys=false`; preserved for Desktop/CLI parity, dead in mobile v1. Acceptable.

**Module imports are eager even when features are runtime-gated.** Root `_layout.tsx` imports `stores/chatStore`, `services/conversationSync`, `services/realtime`, `services/dispatchRealtime`, `services/desktopStatus` at module level. The FEATURES checks live inside `useEffect`s, so the imports always load — which is how `lib/pinning.ts` loads at startup (see P0).

---

## Test Coverage

**Strong.** 85 test files in `apps/mobile/__tests__/` plus 4 feature-local `__tests__` dirs. Notable specs: `chatStore.test.ts`, `dispatchHmac.test.ts`, `dispatch-defense.test.ts`, `dispatch-payload-schema.test.ts`, `compliance-ledger.test.ts`, `content-filter.test.ts`, `auth-storage.test.ts`, `biometric-gate.test.tsx`, `pinning.test.ts`, `secure-fetch.test.ts`, `doc-qa.test.ts`, `context-budgeting.test.ts`, `hindi-qa-harness.test.ts`, `app-intents-deeplink.test.ts`.

**Gaps:**
- **No real Detox e2e suite.** `detox.config.js` exists but there is no `apps/mobile/e2e/` directory and no `*.e2e.ts` specs. The only e2e-named file, `__tests__/dispatch-e2e-smoke.test.ts`, is a Jest test. The surface doc's "Detox e2e (5 specs)" is unfulfilled.
- `pinning.test.ts` deliberately asserts the placeholder-launch-crash behavior (`hasPlaceholderPins()===true`, "simulated release-mode launch with placeholders throws `/TLS pinning not provisioned/`"). The P0 is therefore a *known and tested* state.

I did not run the suite (builds prohibited); coverage assessed by file inventory + reading representative specs.

---

## Panic / Crash Sites

- **57 `throw new Error(...)`** in non-test source. The overwhelming majority are genuine invariants/guards (model not downloaded, queue full, gate closed) surfaced to the user as friendly copy, not user-reachable crashes.
- **`lib/pinning.ts:160` — `throw new Error('TLS pinning not provisioned')` at module load** in preview/production builds. THIS IS REACHABLE ON LAUNCH (P0 — see below).
- `JSON.parse` appears in 8 service/lib files; all sampled sites are wrapped in try/catch (`streaming.ts:155`, `providerStreamClient.ts:107`, `connectionStore.ts:395`). No unguarded parse-on-network-input crash found.
- Non-null assertions (`!.`) on UI paths: only ~8, low risk.
- `chatExecutionStore` correctly guards aborts, queue-full (`QueueFullError` → Alert), upload retries, and never lets memory/artifact capture throw into the chat flow.

---

## TODO / FIXME / HACK

Only **11** in non-test source — low. Material ones:
- `app/(public)/onboarding.tsx:280` — `TODO(model-catalog-engineer)`: catalog entry lacks `downloadUrl`/`checksum`/`format`, so onboarding download falls through to `finishOnboarding()` (no fake progress — honest). Means the **default model may not actually download from onboarding until the catalog is populated** (see P1).
- `app/(public)/onboarding.tsx:670` — TODO replace conic-fill placeholder with react-native-svg Arc (cosmetic).
- `src/features/memory/services/ragIndex.ts:9,23,108` — `EMBEDDING_MODEL_ID = 'nomic-embed-text-v1.5'` is a placeholder; embeddings are a **trigram feature-hashing fallback** that "cannot capture semantic similarity" (see P1/P2).
- `src/features/integrations/services/healthData.ts:64` — TODO decide whether `/api/health-context` is implemented or removed.

---

## Security-sensitive code (concrete review)

**Genuinely strong:**
- `lib/dispatchHmac.ts` — RFC-2104 HMAC-SHA-256 + RFC-5869 HKDF over expo-crypto, 16-byte nonce, ±30s timestamp window, sliding nonce-replay cache, **constant-time compare**. Real crypto, well-commented. (Dispatch is flagged off in v1.)
- `lib/secureStorage.ts` — iOS Keychain / Android Keystore via expo-secure-store, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no iCloud backup), returns promises so Zustand persist can detect failures, handles Before-First-Unlock gracefully.
- `lib/safeOpenURL.ts` — strict https-only allowlist (`agiworkforce.com`/`*.agiworkforce.com`/`stripe.com`/`*.stripe.com`), rejects `intent:`/`javascript:`/`file:`/embedded credentials. Defends the red-team `Linking.openURL(data.url)` finding.
- `services/secureFetch.ts` — single outbound-HTTPS chokepoint; one grep reveals every egress.
- `services/streaming.ts:321-322` — re-asserts `assertRemoteChatAllowed()` + `ensureLlmGateOpen()` at the top of every cloud stream (defense in depth beyond the store-level gate).
- `lib/contentFilter.ts` — client-side minor-safe prompt blocklist for EU AI Act Art. 5(1)(b), no network.
- `storage/providerKeys.ts` — only non-secret metadata + keychain_ref pointer persisted; key bytes stay in Keychain.

**Network egress is tiny and benign:** 7 fetch sites; only `api.agiworkforce.com` (gateway, gated), `api.deepgram.com` (voice STT), `cdn.jsdelivr.net` (KaTeX in MathBlock — note: remote CDN dependency for math rendering). No `eval`/`new Function`.

**Concerns:**
1. **P0 — TLS pinning enforced with placeholder pins** (`lib/pinning.ts:59-89, 154-164`). `PINNING_ENFORCED=true`, all pins are `sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*`, and `enforceProvisionedPinsForRelease()` throws at module load when `EXPO_PUBLIC_APP_ENV !== 'development'`. eas.json sets preview/production env to non-development. Crashes the app on launch in any store build.
2. **P2 — dispatch HMAC transitional cutoff already passed + stale comment.** `dispatchHmac.ts` comments say cutoff `2026-06-05`, but the canonical `DISPATCH_HMAC_REQUIRED_AFTER` in `packages/types/src/dispatch.ts:47` is `2026-05-26` (already past today 2026-05-29) — so unsigned messages now fail-closed (good), but the mobile comment is wrong. Low impact (dispatch off in v1).
3. **P3 — MathBlock loads KaTeX from `cdn.jsdelivr.net`** (`MathBlock.tsx:22-23`), a third-party CDN egress in an otherwise local-first app; not pinned, not in the allowlist (it's a WebView/render dependency, not secureFetch).

---

## AI-slop

Low overall. The codebase shows consistent patterns, honest comments, and real implementations. Identified items:
- **Trigram "embedding" stand-in** (`ragIndex.ts:98-159`): a non-neural feature-hashing vector that the author honestly labels "cannot capture semantic similarity." It produces near-random semantic-search results in the memory UI. Honest-but-placeholder, not deceptive.
- **`_artifactThemeColors` persisted fallback** (`chatExecutionStore.ts:148`): documented as intentional stable fallback; live color re-derived at render. Not slop.
- **~125 hardcoded hex/rgba color literals** across `app/`/`src/`/`components/` (e.g. `error.tsx`, `not-found.tsx`, `camera.tsx`, `scan.tsx`, `translate.tsx`, `bottom-sheet.tsx`, `input.tsx`) — violates the project's no-hardcoded-colors rule (design tokens required). Error/not-found screens are defensible (theme provider may be unmounted); camera/scan/translate are not. Quality debt, not functional slop.
- No fabricated/RNG data rendered to users in non-test paths. Usage screen reads real `UsageSummary` from the gateway (and the service throws in v1 rather than faking numbers). Billing reads pricing config and is flag-gated to `null`.

---

## Broken / half-built features (file:line evidence)

- **P0:** App launch crashes in store builds — `lib/pinning.ts:160` via eager import chain `app/_layout.tsx:39 → stores/chatStore → stores/chat/chatExecutionStore.ts:8 → services/streaming.ts → services/secureFetch.ts → lib/pinning.ts`.
- **P1:** Onboarding default-model download is inert until catalog is populated — `app/(public)/onboarding.tsx:277-282` falls through to `finishOnboarding()` when `downloadUrl`/`checksum`/`format` are missing. Combined with the trigram-embedding placeholder, the "download a model and chat locally" first-run demo may land users in chat with **no model installed**, where `localGenerate` then throws "Download a model first" (handled gracefully by `localSetupMessage`, but the headline on-device-AI experience is not turnkey on first run). Needs verification against the live `@agiworkforce/local-llm` catalog.
- **P1:** On-device memory retrieval injects irrelevant context — `chatExecutionStore.ts:333` calls `retrieveMemoryContext(content, 5)` with **no embedding arg**, so `store.ts:216-239` uses text search then falls back to the 5 most-recent facts. If a user has added memory facts, up to 5 possibly-irrelevant facts are injected as system context into **every** chat turn when text search misses. Quality/correctness concern.
- **P2:** No Detox e2e despite `detox.config.js` — surface doc overstates "5 specs."
- **P2:** Duplicate iOS Xcode projects (`ios/` vs `apps/mobile/ios/`) and duplicate `PrivacyInfo.xcprivacy` copies — drift risk before EAS Build.
- **P3:** `healthData.ts:64` undecided endpoint (`/api/health-context` implement-or-remove).

---

## Severity-ranked issues

### P0 — TLS pinning enforced with placeholder pins crashes every release build on launch
- **File:** `apps/mobile/lib/pinning.ts:59-89, 154-164`
- **Evidence:** `PINNING_ENFORCED = true` (line 89); every pin is `sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*` (lines 60-79); `enforceProvisionedPinsForRelease()` runs at module load and `throw new Error('TLS pinning not provisioned')` (line 160) unless `__DEV__`/`NODE_ENV==='test'`/`EXPO_PUBLIC_APP_ENV==='development'`. `eas.json` sets preview→`EXPO_PUBLIC_APP_ENV:"preview"` and production→`"production"`. The module is loaded at startup via `_layout.tsx:39 → chatStore → chatExecutionStore.ts:8 → streaming → secureFetch → pinning`. `pinning.test.ts:54-75` confirms placeholders are present and the release-mode launch throws.
- **Impact:** Any TestFlight or App Store build is dead-on-arrival (white-screen / immediate crash) until pins are provisioned. Blocks M2/M3 launch.
- **Fix hint:** Ops must run the pin-capture runbook (in the file) and replace placeholders with real SPKI SHA-256 hashes for the 5 `REQUIRED_PINNED_HOSTS`, then mirror into `app.config.js` `NSPinnedDomains` (iOS) and the Android `network_security_config.xml` plugin. As an interim, treat `preview` like `development` in the guard until pins exist, OR keep `PINNING_ENFORCED=false` until provisioning. Wire `assertPinningReadyIfEnforced()` into bootstrap (currently never called).

### P1 — First-run on-device model may never download (catalog not populated)
- **File:** `apps/mobile/app/(public)/onboarding.tsx:277-282`
- **Evidence:** TODO(model-catalog-engineer); when catalog entry lacks `downloadUrl`/`checksum`/`format` the flow skips download and goes straight to chat.
- **Impact:** The signature "free private AI on your phone" demo can leave a fresh install with no model; subsequent local chat shows the "download a model first" setup message instead of inference.
- **Fix hint:** Confirm `@agiworkforce/local-llm` catalog has a complete default entry (Qwen 2.5 1.5B) with real `downloadUrl`+`checksum`+`format`; add a regression test for onboarding → download → first local turn.

### P1 — Memory context injection surfaces irrelevant facts on every turn
- **File:** `apps/mobile/stores/chat/chatExecutionStore.ts:331-343`, `apps/mobile/src/features/memory/store.ts:216-239`
- **Evidence:** Called without an embedding; falls back to `listMemoryFacts({ limit: 5 })` (most recent) when text search misses, injected as system context each turn.
- **Fix hint:** Only inject when text/semantic match clears a relevance threshold; do not inject most-recent-as-fallback. Land the real embedding model before relying on semantic recall.

### P2 — On-device RAG/memory semantic search is a non-semantic placeholder
- **File:** `apps/mobile/src/features/memory/services/ragIndex.ts:98-159`
- **Evidence:** Trigram feature-hashing "embedding"; comment admits it cannot capture semantic similarity. Used by `searchMemories` in the memory UI.
- **Fix hint:** Wire a real on-device embedding (catalog task #18); until then label the memory search as keyword-only in the UI.

### P2 — ~125 hardcoded color literals violate design-token rule
- **Files:** `app/(app)/camera.tsx`, `scan.tsx`, `translate.tsx`, `components/ui/bottom-sheet.tsx`, `components/ui/input.tsx`, `app/error.tsx`, `app/not-found.tsx`, others.
- **Fix hint:** Migrate to `@agiworkforce/design-tokens` / NativeWind theme vars. Error/not-found screens may keep literals if justified (provider-unmounted fallback).

### P2 — No Detox e2e suite despite config; duplicate iOS projects
- **Files:** `apps/mobile/detox.config.js` (no `e2e/` dir); `ios/` vs `apps/mobile/ios/`.
- **Fix hint:** Either implement the e2e specs or remove the config + doc claim; pick one canonical Xcode project and Privacy Manifest, delete/clearly mark the other.

### P3 — Stale dispatch-HMAC cutoff comment; KaTeX CDN egress; undecided health endpoint
- **Files:** `lib/dispatchHmac.ts:67,111` (says 2026-06-05; canonical is 2026-05-26 in `packages/types/src/dispatch.ts:47`); `src/features/chat/components/MathBlock.tsx:22-23` (jsdelivr CDN); `src/features/integrations/services/healthData.ts:64`.
- **Fix hint:** Sync comment to canonical constant; bundle KaTeX locally or pin/allowlist the CDN; resolve the health endpoint TODO.

---

## Anchor-doc staleness noted (verify-against-code findings)
- `docs/surfaces/mobile.md` claims RN **0.84.0** / MMKV **4.3.1**; actual `package.json` is RN **0.83.6** / MMKV **^3.2.0**.
- Surface doc references `api/llm-client.ts`, `api/streaming.ts`, `app/(app)/keys.tsx`, `db/migrations/0001_initial.sql`, `e2e/` — none exist at those paths now (refactored into `services/streaming.ts`, `lib/providerStreamClient.ts`, `storage/migrations.ts`; keys/e2e absent). The doc's "Detox e2e (5 specs)" and "BYOK key management" lines describe a pre-pivot state.
- Surface doc says "166 .ts/.tsx files"; actual non-test source is ~380 — the surface grew substantially since the 2026-05-17 audit.
- `reports/frontend-parity-r1/surfaces/mobile.md` says "~160 source files / 43 screens"; also stale (66 route files, ~380 source files).

---

## Open questions / uncertainty
1. **Pinning intent for v1 local-only:** v1 makes almost no network calls (chat is on-device), yet the pinning guard still crashes release builds. Is the intent to ship v1 with `PINNING_ENFORCED=false` (since there's little egress) or to provision pins regardless? The current state ships neither — it crashes. (High confidence the crash is real; uncertain which fix the team intends.)
2. **`@agiworkforce/local-llm` catalog completeness** is outside this slice; I verified `localGenerate` is real but did NOT verify the default model's `downloadUrl`/`checksum` are populated. The onboarding TODO suggests they may not be.
3. I did not execute the test suite or any build (prohibited). Coverage assessed by reading, not running.
4. The two iOS project trees — I did not deep-read the Xcode project files; which is the EAS-consumed one needs confirmation.
5. `services/realtime.ts`, `conversationSync.ts`, `dispatchRealtime.ts` are eagerly imported but runtime-gated; I confirmed the gates but did not exhaustively verify none of them trigger network at import time (they appeared lazy/subscription-based).
