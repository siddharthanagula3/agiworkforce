# Mobile surface (lead launch surface)

> **Path:** `apps/mobile/` · **Stack:** Expo SDK 55 + React Native 0.84.0 + native modules · **Owner:** founder · **Status:** M0 spike running this week (May 17-23); M3 public launch target **Aug 6-16, 2026**. **Updated:** 2026-06-27.

## Mission

The lead launch surface. A single iOS + Android app where someone gets free private AI on their phone (Local mode: works offline, no account, on-device LLM) or explicitly continues selected context with their own keys for 10+ providers (BYOK mode). AGI-managed cloud credits are public alpha and open by default (2026-06-27; subscription/entitlement-gated, env kill-switch only), no longer waitlist-gated. The "AI on a plane" demo is the most viral artifact we'll ever ship.

**Mobile is FIRST IN TIME, not ONLY IN SCOPE** — per PRD V5 §20 lock #17. Mobile leads the App Store / Play submission cycle because Apple Review is the hardest gate. Web parity ships same week; desktop must be W6-stable before mobile launches.

## Status at HEAD

| Item                                                        | State                                      |
| ----------------------------------------------------------- | ------------------------------------------ |
| Onboarding flow + 5.1.2(i) consent modal                    | ✅ shipped 2026-05-18 (commit `157157c35`) |
| Chat surface + provenance badge + mode-switch modal         | ✅ shipped 2026-05-18 (commit `f8418351f`) |
| Tier 1/2/3 native modules + runtime selector                | ✅ shipped 2026-05-18 (commit `adea9adc6`) |
| `models.json` deprecation calendar + three-tier router      | ✅ shipped 2026-05-18 (commit `569e42df4`) |
| BYOK key management + Keychain                              | 🚧 working tree (uncommitted)              |
| BYOK direct-provider client + `@agiworkforce/llm-normalize` | 🚧 working tree                            |
| SQLCipher + MMKV storage                                    | 🚧 working tree                            |
| Detox e2e (5 specs)                                         | 🚧 working tree (testIDs land first)       |
| Apple Privacy Manifest + App Store listing                  | 🚧 working tree                            |
| EAS Build pipeline                                          | 🚧 working tree                            |
| `@agiworkforce/compliance` (Article 50)                     | 🚧 working tree                            |
| TestFlight build                                            | ⏳ M2 milestone (target Jul 19)            |
| Public launch                                               | ⏳ M3 milestone (target Aug 6-16)          |

## Verified codebase numbers (2026-05-17 audit)

- **166** `.tsx` / `.ts` files in `apps/mobile/`
- **55,951** LOC
- **45** screens (Expo Router `app/` files) — was claimed 43 (understated)
- **46** test files
- **Expo SDK 55.0.23** · **React Native 0.84.0** · **React 19.2.0** (verified from `apps/mobile/package.json`)
- Bundle id: `com.agiworkforce.app` (iOS + Android)
- Dispatch wiring in 6 files

## Canonical spec

⚠ **Current mobile decisions live in `docs/current/` and this surface doc.** The former mobile PRD is archived under `docs/archive/2026-05-21-docs-consolidation/` as source material only.

## Three runtime tiers (locked PRD V5 §10 lock #22)

The single most important architecture decision. Auto-selected per device:

| Tier                            | Wraps                                                                | Devices                                                         | Cost             | Download        |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- | --------------- |
| **Tier 1 (zero download)**      | Apple Foundation Models (iOS 26+) / Gemini Nano via AICore (Android) | iPhone 15 Pro+ · M-series iPad/Mac · Pixel 8+ · Galaxy S24+     | $0 (OS-resident) | 0 bytes         |
| **Tier 2 (downloadable, fast)** | `react-native-executorch` with Qwen 2.5 1.5B / Llama 3.2 3B PTE      | iOS 17+ / Android 13+, ≥3.5 GB RAM (iPhone 12+, Pixel 6+, S22+) | $0 to AGI        | 1.0-1.8 GB once |
| **Tier 3 (universal fallback)** | `llama.rn` with GGUF                                                 | iOS 15+ / Android 10+                                           | $0 to AGI        | 0.7-1.8 GB once |

Default downloadable model: **Qwen 2.5 1.5B Instruct Q4_K_M** (~1.0 GB, "Fast"). Capable upgrade: **Llama 3.2 3B Instruct Q4** (~1.8 GB).

Per PRD-MOBILE §8 excluded SDKs: **Cactus**, **RunAnywhere**, **MediaPipe LLM Inference (mobile API)**, **MLX-Swift directly**.

## Stack + locked versions (per PRD-MOBILE §8)

| Item                      | Pin                                   |
| ------------------------- | ------------------------------------- |
| Expo SDK                  | 55.0.23                               |
| React Native              | 0.84.0                                |
| React                     | 19.2.0                                |
| Reanimated                | 4.3.1                                 |
| MMKV                      | 4.3.1                                 |
| NativeWind                | 4.2.3                                 |
| `expo-dev-client`         | latest stable                         |
| `llama.rn`                | v0.10+ (New Architecture support)     |
| `react-native-executorch` | latest stable (ExecuTorch 1.0+)       |
| `whisper.cpp`             | latest stable (Core ML / NNAPI accel) |
| `sqlite-vec`              | latest stable                         |
| Detox                     | latest stable                         |
| Jest preset               | `jest-expo`                           |

## File layout

```
apps/mobile/
├── app/                            Expo Router (file-based routing) — 45 screens
│   ├── (public)/onboarding.tsx     3-branch flow: Local / BYOK / Decide later
│   ├── (app)/
│   │   ├── _layout.tsx             drawer registration
│   │   ├── chat/[id].tsx           main chat surface
│   │   ├── (tabs)/settings.tsx     6-section settings (appearance, default mode, voice, telemetry off, Wi-Fi-only, network-off)
│   │   ├── models.tsx              installed list + download new
│   │   ├── keys.tsx                BYOK provider keys
│   │   ├── account.tsx             optional sign-in
│   │   └── about.tsx
│   └── legal/                      Article 50 disclosure + privacy policy
├── components/
│   ├── chat/
│   │   ├── MessageBubble.tsx       provenance footer wired
│   │   ├── ModeSwitchModal.tsx     Local -> BYOK fork confirmation
│   │   ├── MessageList.tsx         FlashList with auto-scroll + scroll-to-bottom FAB
│   │   ├── ChatInput.tsx           composer
│   │   └── Composer/Composer.tsx   wraps ChatInput + 6 TaskChips on empty
│   ├── onboarding/
│   │   ├── ModeCard.tsx            mode picker card
│   │   └── ByokConsentModal.tsx    5.1.2(i) consent modal
│   └── drawer/                     6-item nav
├── api/
│   ├── llm-client.ts               three-tier router + CacheIntent + CacheObservation + R-023 gate
│   └── streaming.ts                SSE consumer wired to /api/llm/v1/chat/completions
├── native/
│   ├── ios/AGIFoundationModels.swift + .m   Tier 1 iOS native module
│   └── android/AGIAICoreModule.kt + AGIAICorePackage.kt   Tier 1 Android native module
├── storage/                        SQLCipher + MMKV + sqlite-vec
│   ├── db.ts
│   ├── migrations.ts
│   └── types.ts
├── stores/                         Zustand stores
│   ├── provider-keys.ts            BYOK key management
│   ├── settingsStore.ts            5 fields including telemetry off + Network: Off mode
│   └── ...
├── db/migrations/0001_initial.sql  SQLCipher schema (PRD-MOBILE §12)
├── e2e/                            Detox specs (5 critical-path)
├── scripts/release/                ios-beta/ios-prod/android-beta/android-prod build scripts + runbook
├── store-listing/                  Privacy Manifest + screenshots + App Review notes
├── eas.json                        Expo Application Services build profiles
├── app.config.js                   canonical Expo config
└── package.json                    @agiworkforce/mobile
```

## Key files to know

| File                                                     | What                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app.config.js`                              | Canonical Expo config. Stale root/mobile `app.json` files were deleted to avoid drift.                           |
| `apps/mobile/app/(public)/onboarding.tsx`                | 3-branch onboarding state machine. Already shipped per commit `157157c35`.                                       |
| `apps/mobile/components/onboarding/ByokConsentModal.tsx` | Apple 5.1.2(i) consent modal — single highest App Review rejection risk. Verbatim copy from PRD Appendix B §B.7. |
| `apps/mobile/components/chat/MessageBubble.tsx`          | Provenance footer "On device" / "BYOK · {provider}" — locked per PRD-MOBILE §6.                                  |
| `apps/mobile/components/chat/ModeSwitchModal.tsx`        | Local -> BYOK fork confirmation modal.                                                                           |
| `apps/mobile/api/llm-client.ts`                          | Three-tier router + CacheIntent/CacheObservation + R-023 Chinese-HQ gate (default-off).                          |
| `apps/mobile/native/ios/AGIFoundationModels.swift`       | Tier 1 iOS — requires `com.apple.developer.foundation-models` entitlement (provisioning profile update).         |
| `apps/mobile/native/android/AGIAICoreModule.kt`          | Tier 1 Android — requires `play-services-aicore` gradle dep.                                                     |
| `ios/agiworkforce/PrivacyInfo.xcprivacy`                 | Apple Privacy Manifest with 4 required-reason API categories, tracked in the root Xcode-consumed project.        |
| `apps/mobile/store-listing/ios/review-notes.md`          | App Review notes — cites Nov 13 2025 5.1.2(i) update + 2.5.2 self-containment argument.                          |
| `apps/mobile/scripts/release/README.md`                  | Founder runbook for App Store / Play submission.                                                                 |
| `packages/local-llm/`                                    | Shared package — tier selection + capability detection + catalog.                                                |
| `packages/compliance/`                                   | `@agiworkforce/compliance` — Article 50 disclosure + machine-readable AI-content marking.                        |

## Build + test commands

```bash
# Dev (Expo dev client)
pnpm --filter @agiworkforce/mobile start
pnpm --filter @agiworkforce/mobile ios
pnpm --filter @agiworkforce/mobile android

# Typecheck
pnpm --filter @agiworkforce/mobile typecheck

# Unit tests (jest-expo)
pnpm --filter @agiworkforce/mobile test

# Detox e2e (requires EAS build first)
pnpm --filter @agiworkforce/mobile e2e:ios
pnpm --filter @agiworkforce/mobile e2e:android

# Release builds
pnpm --filter @agiworkforce/mobile release:preflight
pnpm --filter @agiworkforce/mobile release:ios:beta -- --auto-submit
pnpm --filter @agiworkforce/mobile release:ios:prod -- --auto-submit
pnpm --filter @agiworkforce/mobile release:android:beta -- --auto-submit
pnpm --filter @agiworkforce/mobile release:android:prod -- --auto-submit
```

## Release process

See `apps/mobile/scripts/release/README.md` (8-section runbook). High-level:

1. Apple Developer Program enrollment active (Team `D2PR62RLT4`)
2. App Store Connect: create app record (one-time manual). Note `ascAppId`.
3. App Store Connect API key (.p8) → save to `apps/mobile/secrets/asc-api-key.p8`
4. `eas init` → replace placeholder `projectId` with real UUID; commit
5. Google Play Console: create app record (one-time manual)
6. Service account JSON → `apps/mobile/secrets/google-play-service-account.json`
7. Install `eas-cli` globally; `eas login`
8. `pnpm release:ios:beta -- --auto-submit` builds + uploads to TestFlight
9. After Apple review (~24-72h), promote to App Store

## Provider integrations on mobile

12 named providers via `packages/types/src/models.json`. **Chinese-HQ providers default-OFF** until per-provider user opt-in (PRD V5 R-023). Three-tier route via `apps/mobile/api/llm-client.ts`:

```
Local (Apple FM / Gemini Nano / executorch / llama.rn)
   ↓
Cache-aggressive middle (DeepSeek V4-Flash 98% cache discount OR Kimi K2.6 auto-cache)
   ↓
Frontier (Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro)
```

Cache-discount magnitude locked at 90% per V5 §10 lock #23.

## Current open work (Wave 6 + mobile sprint)

1. **Apple Developer Program** — confirm active, request **Foundation Models Framework Adapter Entitlement** if pursuing LoRA in v1.1
2. **`pnpm install` blocked** — a `react-native-executorch-expo-resource-fetcher@^1.0.0` reference doesn't exist on npm (latest is 0.8.0). Pin to actual stable.
3. **Expo config drift** — `apps/mobile/app.config.js` is canonical; do not recreate root
   `app.json` or `apps/mobile/app.json` before EAS builds.
4. **Brand rename in `app.config.js:5`** — still reads "AGI Workforce", should be "AGI" (public brand 2026-05-15)
5. **`LSMinimumSystemVersion`** is now 15.1 in `ios/agiworkforce/Info.plist`; keep screenshots/store metadata aligned with that support floor
6. **Apple Privacy Manifest sync** — canonical Xcode-consumed copy is `ios/agiworkforce/PrivacyInfo.xcprivacy`; store-review copy is `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy`. Keep them synchronized before EAS Build runs
7. **Detox testIDs** — already wired by onboarding/byok teammates; wire chat-UI testIDs to enable specs

## Gotchas

- **Mobile is NOT the only-in-scope launch.** Web parity must ship same week. Desktop must be W6-stable before mobile launches. Per V5 §20 lock #17.
- **Apple 5.1.2(i) is the rejection-risk single point.** Legacy consent modal copy is archived under `docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-B-API-CONTRACTS.md` §B.7. Promote reviewed final legal copy into a current legal doc before shipment. No pre-checked toggles. No bundled consent.
- **No in-app code execution UI on iOS.** Apple's 2.5.2 enforcement against Replit / Vibecode / Anything (Mar-Apr 2026) is the precedent. Mobile v1 = controller + chat surface only. Code execution lives on desktop / CLI / web. V5 §10 lock #25.
- **Chinese-HQ providers default-OFF.** DeepSeek, Moonshot/Kimi, Qwen, Zhipu require user opt-in per provider. V5 §17 R-023.
- **Kimi K2 family discontinues 2026-05-25 (7 days from V5 lock).** `packages/types/src/models.json` already pins `kimi-k2.6`.
- **DeepSeek V4-Pro promo expires 2026-05-31 15:59 UTC.** Auto-reroute logic already wired in `packages/routing/`.
- **Article 50 disclosure must ship pre-2026-08-02.** EU AI Act enforcement starts 4 days before mobile launch target. €15M / 3% global turnover penalty exposure.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - Mobile role, trust modes, and sync boundary.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - generated-file and compute strategy.
- [docs/current/commercial-and-launch.md](../current/commercial-and-launch.md) - Local/BYOK/Managed launch posture and waitlist gates.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - mobile v1, Local to BYOK fork, and managed-cloud decisions.
- Historical mobile PRD and API-contract details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/locks/mobile-first-strategy-2026-05-16.md` — original mobile-first strategy
- `memory/locks/mobile-first-amendments-2026-05-17.md` — iteration-5 amendments
- `memory/audits/mobile-security-2026-05-05.md` — 10 mobile security fixes + 138 tests

## Operational owner

Founder. Apple Developer Program + Google Play Console under founder's account. EAS Build account: pending founder setup per `apps/mobile/scripts/release/README.md`.
