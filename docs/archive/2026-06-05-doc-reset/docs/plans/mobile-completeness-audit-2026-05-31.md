# Mobile App Completeness Audit (Code-Verified)

Status: Active
Owner: Platform lead / Founder
Last updated: 2026-05-31

## Method

Code-verified audit of `apps/mobile` (Expo 55 + React Native 0.84) and
`packages/local-llm`, run as a 9-dimension parallel review with file-level
evidence required for every claim ("complete" only if an end-to-end path
UI → store/action → service/native → observable effect could be cited). The
three highest-stakes claims were re-verified by hand against source (marked
✓ code-verified below). This is an honest engineering assessment for the
asset-sale Day-8–14 "Package" step; it is internal until the founder chooses to
promote any of it into the buyer-facing data room (`reports/asset-sale-prep/`).

Snapshot commit: tree at `c6a202707` on `main`. `tsc --noEmit` clean;
1208/1228 Jest tests pass (3 suites red — see blockers).

## Headline

**~90% UI built · ~65% functionally complete end-to-end.**

It is a real app, not a facade — the core loop genuinely works. The 25-point
gap between "renders" and "works" is the diligence surface. The headline
differentiator (on-device inference) is **iOS-only and unproven on a physical
device**.

> One-line verdict: a real, end-to-end-functional local-first AI chat app with a
> working iOS on-device inference path and genuine memory/personalization, but
> the headline differentiator is device-unverified and iOS-only, and four core
> defects plus two store-submission blockers mean it is sellable as a
> ~65%-functional asset, not a finished product.

## What genuinely works (verified end-to-end)

- **Core chat loop** — send → on-device generation → token streaming → render →
  MMKV persistence; typing/empty/skeleton/error/offline states; reasoning-trace
  parsing; tokens/sec; edit/delete/regenerate (local by design).
- **iOS ExecuTorch inference path** — `react-native-executorch` 0.8.4, pods
  linked, resource fetcher wired at startup, default **Qwen3-4B `.pte` URL
  confirmed live** (302 → HF CDN, ~2.5 GB). Full UI→native→token chain exists.
- **Memory / personalization** — per-turn retrieval injects persona + memory
  into the prompt; after-chat extract→dedupe→persist runs on real turns and is
  correctly skipped in temporary chat. _Strongest dimension (82%)._ Caveat: the
  sqlite-vec semantic path is dead — retrieval is keyword-LIKE + pinned fallback.
- **Local→cloud trust boundary** — fail-closed and correctly wired;
  `getRemoteChatDisabledReason()` gates the send path, `assertRemoteChatAllowed()`
  throws at the remote-stream entry, a test asserts BYOK alone never unlocks
  cloud. Cloud/dispatch/companion/billing are intentionally flag-gated off for v1
  (gated-by-design, **not** gaps).
- **App shell** — ~67 route files, working custom drawer, onboarding + age-gate
  that persists, encryption-at-rest (SQLCipher PRAGMA key + 256-bit MMKV key,
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keychain hygiene). Voice TTS (expo-speech) +
  STT (on-device) real.

## Confirmed defects / gaps (the real sale risks)

| #   | Issue                                                                                                                                                                                                                                                                                                     | Status                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | **No proof of on-device execution; Android entirely unbuilt** (no `android/` dir; Tier-1 stubbed; Tier-3 fallback unreachable). Core differentiator is iOS-only + device-unverified.                                                                                                                      | must run 1 real device gen |
| 2   | **Stop/cancel does not halt native generation** — tier2/tier3 take no `AbortSignal` and never call `interrupt()`; Stop only freezes the JS UI while the model runs to completion.                                                                                                                         | confirmed                  |
| 3   | **Data export returns empty chat history** — `insertConversation` (`storage/conversations.ts:18`) and `insertMessage` (`storage/messages.ts:23`) have **zero non-test callers**; chat persists to MMKV (`chatViewStore.ts:142`, `chatMessageStore.ts:288`). Export reads the never-written SQLite tables. | ✓ code-verified            |
| 4   | **"Delete everything" leaves encryption keys** — `wipeAllLocalData` (`services/dsarExport.ts:433`) clears SQLite + MMKV + model files but has **no `SecureStore.deleteItemAsync` call**; the SQLCipher/MMKV keys + device id (`storage/db.ts`) survive. Breaks GDPR/DPDP erasure.                         | ✓ code-verified            |
| 5   | **Onboarding "pick a different model" is ignored** — the picker writes the model store, but the download handler always fetches the tier default.                                                                                                                                                         | confirmed                  |
| 6   | **Saved-but-ignored toggles** — `capabilities.artifacts/codeExecution/camera`, `fontPreference`, perf thermal/battery-pause/show-chip persist but no runtime path consumes them. "Temporary chat" only suppresses memory learning; messages still persist.                                                | confirmed                  |
| 7   | **Multimodal mismatch** — camera/scan UX implies the local AI can see images, but attachments collapse to the literal text `[image attachment]` for the default local model. True vision is the waitlist-gated cloud path.                                                                                | confirmed                  |
| 8   | **Alpha waitlist/invite** — displayed waitlist rank is hardcoded `{rank:0}` client-side; invite redemption only accepts the literal `ALPHATESTER`. Must not be represented as a production queue/referral system.                                                                                         | confirmed                  |

## App Store / Play submission blockers

1. **Privacy-label mismatch** ✓ — `app.config.js:113-114` declares
   `NSPrivacyCollectedDataTypes: []` / `NSPrivacyTracking: false` while
   `src/features/waitlist/service.ts` collects + POSTs the user's email. Near-
   certain privacy rejection; doubly damaging for a privacy-brand app.
2. **HealthKit overclaim** — `NSHealthShareUsageDescription` declared
   (`app.config.js:81`, `Info.plist:60`) over a stub `healthKitPermission.ts`
   returning `false`. Entitlement/metadata rejection risk. Cleaner fix: remove
   the declaration (the feature is a stub).
3. **Age-gate deep-link bypass** — with `FEATURES.auth=false` the root guard
   (`app/_layout.tsx:265-278`) only enforces when `inAuthGroup` (never true in
   v1); a deep link to any `/(app)/*` route renders without age confirmation.
4. **Advertised-but-absent functionality** — Capabilities screen offers "Code
   Execution" and "Artifacts" as live toggles with no backend. Hide/relabel as
   waitlist before submission.
5. **Red test suite out of the box** — 3 of 90 runnable suites fail (chatStore
   on-device-streaming test, dispatch-store, dispatch-e2e-smoke); the biometric
   security gate is de-scoped from CI, so green CI overstates verified safety.

> Note: the external-web paywall raises an Apple 3.1.1 concern only if a buyer
> enables cloud monetization without adding StoreKit IAP; as shipped it is
> unreachable.

## Per-dimension breakdown (functional %)

| Dimension                            | UI % | Functional % | Confidence |
| ------------------------------------ | ---- | ------------ | ---------- |
| memory-personalization               | 90   | **82**       | high       |
| core-chat-loop                       | 95   | 80           | high       |
| app-shell-nav                        | 92   | 80           | medium     |
| privacy-dsar / trust-boundary        | 95   | 80\*         | high       |
| model-picker / download / onboarding | 90   | 70           | high       |
| settings / voice / attachments       | 95   | 68           | high       |
| audit-gaps / build-health            | 85   | 62           | high       |
| on-device-llm                        | 85   | **58**       | high       |
| dispatch / paywall / waitlist        | 95   | 55           | high       |

\* Trust boundary itself is solid; the score does not yet discount defects #3/#4
(export + wipe), which a buyer should weigh as severe.

## Recommended punch-list (ordered; all small except chat→SQLite)

1. **Store blockers (config-only)** — fix the privacy nutrition label (declare
   the email collection accurately) and remove the HealthKit overclaim. Verify
   against Apple's current `PrivacyInfo`/`NSPrivacyCollectedDataTypes` schema
   before editing.
2. **Make the privacy features real** — wire chat persistence to the existing
   SQLCipher `conversations`/`messages` schema (so export isn't empty) and add
   `SecureStore.deleteItemAsync` for every key in `wipeAllLocalData`.
3. **Make Stop real** — thread an `AbortSignal` through the local-llm tiers to
   `interrupt()` the native runtime.
4. **Hide/relabel dead toggles** — artifacts, code-execution, vision.
5. **Test suite** — fix or intentionally de-scope the 3 red suites; document.

## Honesty notes

- Numbers are calibrated, not precise; treat ±5 points as noise.
- Items #3, #4, and the privacy-label blocker were re-verified by direct
  source read in this session; the rest are single-pass agent findings
  reconciled against the prior multi-agent audit rollup
  (`docs/archive/2026-06-05-doc-reset/audit/completed-audits-2026-05-31.md`)
  and should be re-read against current source before being turned into hard
  buyer-facing commitments.
- "Gated-by-design" (cloud, dispatch, billing, BYOK) is correct for v1 and is
  not counted as incompleteness.
