# Squad: mobile

**Surface:** apps/mobile | **Subagent:** mobile-engineer

## Baseline (cited from plan)

- `describe.skip / it.skip / test.skip` in `apps/mobile`: **3 instances** (all env-gated via `skipIf`-style patterns, none hard-skipped)
- 5 test suites excluded via `testPathIgnorePatterns` per commit `03ec9ac9` (intentional, feature-gated, NOT regressions): `healthkit.test.ts`, `model-picker.test.tsx`, `auth-401.test.ts`, `api-paywall.test.ts`, `biometric-gate.test.tsx`
- Mobile test count per `03ec9ac9`: 54 suites pass, 978 tests green, 10 intentional skips
- ~41-42 .tsx screens, iOS bundle id com.agiworkforce.app, min iOS 12.0

## Checker output (source of truth)

- **typecheck**: `pnpm --filter @agiworkforce/mobile typecheck` — PASS (exit 0, no errors)
- **lint**: `pnpm --filter @agiworkforce/mobile lint` — PASS (exit 0, no warnings)
- **test**: `pnpm --filter @agiworkforce/mobile exec jest` — PASS on isolated and repeated runs (54 suites, 978 pass, 10 skip). One observed flaky failure on first cold run: `onboarding.test.tsx` — "Disclosure modal gate — tapping Start chatting shows disclosure modal" times out at 5 s. Root cause is an unwrapped async state update from `detectCapabilities().then(setDeviceInfo)` inside a `useEffect([], [])` — the resolved promise fires outside `act()` and delays React's scheduler enough to race the `waitFor` assertion. The test passes on isolated run and on every subsequent run in the full suite (confirmed 3× total runs). Classified as P2 flakiness.

## Findings

| #   | Severity | File:line                                    | Category                                       | Checker-cited? | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------- | -------------------------------------------- | ---------------------------------------------- | -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | P1       | `lib/pinning.ts:94` + `PINS_BY_HOST`         | Security — TLS pin placeholders in prod config | No             | 4            | `PINNING_ENFORCED=true` but all 6 hosts carry `PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*` SPKI hashes. `enforceProvisionedPinsForRelease()` blocks non-`__DEV__` builds at module load — correct — but the guard only fires in JS; `NSPinnedDomains` and `network_security_config.xml` are not yet populated in `app.config.js`. Ops must run the pin-capture runbook before release builds ship. Tracked in `lib/pinning.ts` runbook comment. |
| F-2 | P2       | `components/chat/CitationChip.tsx:15`        | URL open — missing allowlist guard             | No             | 0.5          | `Linking.openURL(url)` called directly with server-supplied citation URL. No `canOpenURL` pre-check and no scheme/host allowlist. `CollapsibleSources.tsx:26` has its own local `isValidExternalUrl` guard (allows `http:` and `https:`), but `CitationChip` has none. v1 is local-only so citations are unlikely to appear, but the guard gap is a P2 for post-v1.                                                                      |
| F-3 | P2       | `services/complianceLedger.ts` (entire file) | Compliance persistence stub                    | No             | 2            | Disclosure acceptance is stored only in process memory (`let inMemoryRecord`), not in MMKV. Every cold start re-shows the GDPR/Article 50(1) disclosure modal. The file's own comment flags it as a follow-up. Apple 5.1.2(i) and EU AI Act Article 50(1) require a durable record. Blocks post-v1 App Store review.                                                                                                                     |
| F-4 | P2       | `app/(public)/onboarding.tsx:239-256`        | Model download stub                            | No             | 8            | `handleStartDownload` contains a `TODO(model-catalog-engineer)` stub — no real download call is wired. The UI renders a progress bar with a fake `setInterval` timer but no actual model download. The download screen will be hit by users who have no on-device model (`needsDownload: true`). Blocks v1 completeness for on-device inference users.                                                                                   |
| F-5 | P2       | `__tests__/onboarding.test.tsx:207`          | Test flakiness — act() gap                     | No             | 1            | `detectCapabilities` mock resolves asynchronously; the `useEffect` in `OnboardingScreen` fires `setDeviceInfo`/`setRecommendedModel` state updates outside `act()`. Under CI parallelism the 5 s `waitFor` in the "Disclosure modal gate" test times out. Confirmed flaky only on the first cold-run ordering; passes in isolation. Needs `jest.useFakeTimers()` or `act(async () => { await Promise.resolve() })` wrapping at mount.    |
| F-6 | P3       | `services/complianceLedger.ts`               | Integration missing from test mocks            | No             | 0.5          | `onboarding.test.tsx` does not mock `@/services/complianceLedger`, so the in-memory stub executes in tests. State leaks between test cases if a prior test in the same suite mutates `inMemoryRecord`. Currently benign because each test begins with `mockIsDisclosureSatisfied.mockReturnValue(false)`, but coupling is fragile.                                                                                                       |
| F-7 | P3       | `services/healthData.ts:64`                  | Orphaned service TODO                          | No             | 0.25         | `TODO: decide whether to implement GET /api/health-context or remove this service.` — service file exists but the endpoint is undecided. Low risk; file is imported nowhere in production paths per grep.                                                                                                                                                                                                                                |

## Expo 55 / RN 0.84 SDK compliance

- **AsyncStorage**: no usage in source (only in comments). MMKV is the sole storage layer. Clean.
- **expo-av legacy API** (`Audio.Sound`, `Audio.Recording`, `Video`): no direct usage found. `voiceInput.ts:105` references the string `'expo-av'` as a platform label only. `expo-av` is listed as a dependency for TTS/voice playback via `expo-speech` and `expo-av`'s `AVPlayer`. No deprecated `Audio.Sound.createAsync` or `Video` component calls found.
- **Linking.openURL guards**: `about.tsx:85` has a proper `canOpenURL` guard. `contentReport.ts:128` has a `canOpenURL` guard. `CitationChip.tsx:15` lacks a guard (F-2 above). `MessageContentRenderer.tsx:119-122` validates `http:` or `https:` protocol before calling `openURL` — acceptable. `CollapsibleSources.tsx:75-78` uses its own `isValidExternalUrl` guard. Remaining bare `openURL` calls are for known-safe `app-settings:` or `App-Prefs:` deep links on storage/settings screens — acceptable.
- **New Architecture**: `app.config.js` header note confirms New Architecture is default in Expo SDK 55; no `newArchEnabled` needed. No legacy bridge calls or `requireNativeModule` anti-patterns found.
- **StatusBar**: `VoiceConversationScreen.tsx:368` and `voice.tsx` import `StatusBar` from `react-native` directly and set `barStyle="light-content"`. The project otherwise uses `expo-status-bar`. The RN `StatusBar` component is not deprecated in RN 0.84, but mixing it with `expo-status-bar` in the same layout can cause ordering conflicts. Low risk — voice screen is full-screen and feature-flagged.
- **react-native-mmkv 3.2.0**: compatible with RN 0.84 New Architecture (JSI). Clean.
- **llama.rn 0.10.0**: listed in `expo.doctor.reactNativeDirectoryCheck.exclude` — known untraceable but the exclusion is documented. Not a regression.

## 5 excluded test suites — intentional? (verify, don't unskip)

| Suite                     | Blocking feature (per TODO in `jest.config.js`)                                                                                                  | Still tracked?                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `healthkit.test.ts`       | `services/healthKitPermission` is a stub today (confirmed: file returns `{ granted: [], denied: [...types] }` and `isHealthKitAvailable: false`) | YES — stub comment says "AUDIT-FIX: HealthKit permission service stub … downstream callers degrade gracefully"                                                                        |
| `model-picker.test.tsx`   | Predates the Perplexity-style picker redesign                                                                                                    | YES — `lib/models.ts` uses `@agiworkforce/types::getPickerModels`; redesign not yet tested                                                                                            |
| `auth-401.test.ts`        | SecureStore wiring diverged in the mobile reorg                                                                                                  | YES — `FEATURES.auth = false` in v1; auth wiring is cloud-only                                                                                                                        |
| `api-paywall.test.ts`     | Same auth wiring issue                                                                                                                           | YES — `FEATURES.billing = false` in v1; `PaywallBottomSheet` component exists and is tested separately in `paywall-bottom-sheet.test.tsx`                                             |
| `biometric-gate.test.tsx` | Hits the H-10 rehydration race ordering                                                                                                          | YES — H-10 fix is implemented in `useBiometricGate` and `_layout.tsx`; the test suite's own timing assumptions may be stale post-fix. Should be revisited after v1 ships, not before. |

All 5 intentional. None are regressions. Each has a TODO comment in `jest.config.js` naming the blocking work. Do NOT unskip.

## MMKV / biometric / SecureStore chain

**Chain integrity: SOUND with one known gap (complianceLedger).**

- `initMmkvEncryption()` runs in the root `_layout.tsx` first `useEffect`, before any store access. It generates a 32-byte CSPRNG key via `Crypto.getRandomBytesAsync(32)` (CRIT-MOB-02 fix, properly documented), stores it in `SecureStore` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, and replaces the no-op proxy MMKV instance. All Zustand stores using `mmkvStorage` degrade gracefully via the proxy until encryption is ready.
- **H-10 race**: documented and fixed. `useBiometricGate` returns `isReady: false` until `hydrated === true` from `biometricFlagStore`. The root layout gates the entire navigator tree on `isBiometricReady`, so no gated UI renders before the SecureStore read completes. The one-frame window where `enabled = false` defaults (before SecureStore returns) is explicitly accepted and documented as fail-safe (not fail-closed for UX).
- **biometricFlagStore**: flag lives in SecureStore, not MMKV (LOW-MOB-1 fix confirmed). Extracting the MMKV key no longer disables the biometric gate.
- **CRIT-MOB-01**: `initialize()` (Supabase session load) is deferred until `isUnlocked === true`. Session data is never loaded before biometric auth passes.
- **complianceLedger stub** (F-3): the one real gap. `services/complianceLedger.ts` uses in-memory state instead of MMKV. The `mmkvDisclosureLedger` object conforms to the `DisclosureLedger` interface but `write()` writes to a module-level `let` variable, not to encrypted storage. Cold-start behavior: disclosure re-appears every launch.
- **`whenMmkvReady` callback queue**: correctly drained after `_storage` is assigned. No race for late-registering stores.

## Dispatch + push + paywall stubs

**Dispatch (mobile→desktop task delegation)**

- `services/dispatchRealtime.ts` is feature-gated: `if (!FEATURES.dispatch) return () => {}` — v1 ships with `FEATURES.dispatch = false`. In v1 the subscription is never created. Code path is in place for v1.1.
- The three Supabase Realtime channels (`dispatch_messages`, `dispatch_agent_state`, `surface_heartbeats`) mirror the Anthropic Dispatch protocol (INSERT for new messages, UPDATE for state, heartbeat surface filter). Deduplication by message ID is implemented. Companion pairing HMAC is in `lib/dispatchHmac.ts`.
- WebRTC fallback is implemented in `stores/connectionStore.ts` but also gated behind `FEATURES.companion = false`. Not active in v1.
- 5 dispatch test suites are active and passing (dispatch-store, dispatch-defense, dispatch-payload-schema, dispatch-e2e-smoke, dispatchHmac).

**Push notifications**

- `expo-notifications` setup is complete: 4 Android priority channels (critical/high/normal/low), iOS time-sensitive interrupt level for critical tier, EAS projectId lookup from `Constants.expoConfig.extra.eas.projectId`.
- Token registration is gated on `session && isInitialized` (MOB-1 fix) — no unauthenticated token POSTs.
- Route allowlist on notification tap navigation is implemented. agentId UUID validation is implemented. Unknown notification types fall back to `/(app)`.
- **v1 concern**: push notifications require a valid Supabase session (`FEATURES.auth = false` in v1). `registerForPushNotifications` is called only when `session` is truthy. In v1 local-only, no session exists, so push registration never fires. This is correct behavior — push is a cloud feature.
- Paywall card (Task #10 in `tasks/todo.md`) is a **web** task, not mobile. Mobile has `PaywallBottomSheet` for in-app `ApiPaywallError` handling, which is fully implemented and tested in `paywall-bottom-sheet.test.tsx`. Mobile paywall UX is complete.

**Paywall stubs**

- `PaywallBottomSheet` is complete (full implementation, `forwardRef`, `BottomSheet` control, pricing URL with UTM params, `openExternalUrl` allowlist guard). Not stubbed.
- `ProPlusPaywall` component in `components/Paywall/ProPlusPaywall.tsx` exists and is tested in `pro-plus-paywall.test.tsx`.
- Billing screen (`app/(app)/billing/index.tsx`) is feature-gated (`FEATURES.billing = false`) and returns null in v1. Correct.

## Out-of-scope observations

- `stores/crossDeviceStore.ts` comment references "AsyncStorage" in prose but imports MMKV. Comment is stale — not a code bug.
- `lib/dispatchHmac.ts` exports two `@deprecated` re-export aliases for `DispatchEnvelope` and `DispatchSessionState`. No callers import the deprecated aliases per grep. Safe to remove in a cleanup PR post-v1.
- `services/ragIndex.ts` has two `TODO(embedding-model)` stubs — on-device RAG embedding is a stub returning a placeholder vector. Not on v1 critical path.
- Screenshot Detox specs in `scripts/screenshots/specs/` are correctly excluded from `testPathIgnorePatterns`. The spec at `01-multi-provider.spec.ts:83` references `model.picker.openai.gpt-5-4` element ID — this is a Detox e2e testID, not a hardcoded model string in production code.
- `@ts-ignore` density: 8 instances in production source, all in `components/edge-cases/` for `accessibilityRole="alertdialog"` and Android `accessibilityLiveRegion` — legitimate TS-def gaps for RN accessibility props, not logic suppressions.

## False-positive watchlist

- `stores/crossDeviceStore.ts:5` mentions "AsyncStorage" in a JSDoc comment — not actual usage.
- `lib/mmkv.ts:146` mentions AsyncStorage in a comparison comment — not actual usage.
- `scripts/screenshots/specs/01-multi-provider.spec.ts:83` contains `gpt-5-4` — this is a Detox element testID in an excluded spec file, not a hardcoded model ID in production code.
- `lib/dispatchHmac.ts:125,133` `@deprecated` tags — are re-export aliases, not deprecated runtime paths.
- The single `onboarding.test.tsx` timeout failure observed on first run is a test-environment timing artifact (act() race on async `detectCapabilities` mock resolution), not a production bug. Confirmed passes on 3 isolated and 2 full-suite runs.
