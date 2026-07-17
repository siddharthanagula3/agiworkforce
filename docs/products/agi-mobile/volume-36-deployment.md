# AGI Mobile — Volume 36 — Deployment

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and verified repo paths: `apps/mobile/eas.json`, `apps/mobile/app.config.js`, `apps/mobile/package.json`, `apps/mobile/scripts/release/`, `apps/mobile/scripts/wave0-smoke/`, `apps/mobile/store-listing/`, `apps/mobile/EAS_SIGNING_RUNBOOK.md`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines how AGI Mobile ships from source to a public store binary. Mobile is an Expo / React Native app (`apps/mobile`) with a checked-in root `ios/` project. Its trust exposure is **Local** (small on-device LLM, free) + **Managed Cloud** only — **there is no BYOK on mobile**, so deployment never provisions, embeds, or rotates user provider keys. The binary ships with on-device model runtime wiring (`llama.rn`, ML Kit native modules) and a Clerk-gated Cloud path; both must survive store review and run offline for Local. Model IDs are read from `packages/contracts/types/src/models.json` — the build never bakes in invented IDs. The governing rule for this volume: **Mobile v1 is not done until it is publicly released on the App Store** (and Play). Internal builds, TestFlight, and simulator smoke runs are milestones, not the finish line.

## Expo EAS Build

✅ Built — `apps/mobile/eas.json`. Profiles: `base` (Node 22.12.0, pnpm 9.15.3, cache key `agi-mobile-v1`), `development` (dev client, internal, `Debug`, simulator), `preview` (internal `Release`, remote credentials, `autoIncrement: buildNumber`), `preview-simulator`, and `production` (`Release`, remote credentials, `autoIncrement: true`, iOS `m-medium`, Android `app-bundle`). Wrapper scripts exist (`apps/mobile/package.json`: `build:dev`, `build:preview`, `build:prod`; `release:ios:*`, `release:android:*` under `apps/mobile/scripts/release/`). Requirements: every release build MUST pass `release:preflight` (`apps/mobile/scripts/release/preflight.sh` — checks `eas`/`git`/`jq`, EAS login, config presence); `requireCommit: true` forbids dirty-tree builds; native module config plugins in `app.config.js` (SQLCipher, llama.rn, ML Kit translate/OCR, App Intents) must be present so encrypted storage and Local inference actually link.

## Expo EAS Update — OTA

🟡 Partial — `apps/mobile/app.config.js` lists the `expo-updates` plugin and `eas.json` defines update channels (`development`/`preview`/`production`), but no `updates.url`/`runtimeVersion` is wired and **OTA is intentionally disabled for v1** (`apps/mobile/store-listing/KILL-SWITCH.md`). v1 kill switches are compile-time MMKV-backed flags in `apps/mobile/lib/v1FeatureFlags.ts`, not remote config, so Local works with no network and reviewers see the same binary as users. Requirements when OTA is enabled (post-v1): OTA may ship only JS/asset changes compatible with the installed `runtimeVersion`; any native change (new pod/gradle dep, permission, entitlement) requires a full store binary, never an OTA. OTA must never alter the trust-mode boundary, silently enable Cloud, or add a BYOK affordance.

## App Store Deployment — iOS

🟡 Partial — submit config exists (`apps/mobile/eas.json` `submit.production.ios`: team `D2PR62RLT4`, bundle `com.agiworkforce.app`, ASC API key under `./secrets/asc-api-key.p8` with `$ASC_*` env), signing runbook (`apps/mobile/EAS_SIGNING_RUNBOOK.md`, remote credentials), reviewer materials (`apps/mobile/store-listing/REVIEWER-NOTES-IOS.md`, `REVIEW-DEFENSE-PACK.md`, `LISTING-METADATA-IOS.json`, `FOUNDER-SUBMISSION-CHECKLIST.md`), and a privacy manifest + usage strings in `app.config.js`. The actual public App Store release is 🔭 Planned (the DoD gate). Requirements: privacy manifest (`NSPrivacyAccessedAPITypes`, `NSPrivacyCollectedDataTypes`, `NSPrivacyTracking: false`) and every `NS*UsageDescription` must match real runtime behavior; reviewer notes must explain Local vs Cloud and that no API-key entry exists; submit via `release:ios:prod:submit` (`scripts/release/submit-ios.sh --profile production`).

## Google Play Deployment — Android

🟡 Partial — `apps/mobile/eas.json` `submit.production.android` targets the `internal` track with `releaseStatus: draft`, service account at `./secrets/google-play-service-account.json`; production build emits an `app-bundle` (AAB). Reviewer/listing assets: `apps/mobile/store-listing/REVIEWER-NOTES-ANDROID.md`, `LISTING-METADATA-ANDROID.json`, `store-listing/android/`. Public Play release is 🔭 Planned. Requirements: declared permissions in `app.config.js` (`CAMERA`, `RECORD_AUDIO`, `USE_BIOMETRIC`, etc.) must map to a used feature with a Data Safety form entry; `allowBackup: false` and autoverified App Links (`assetlinks.json` for `agiworkforce.com`) must hold; promote `internal` → `closed` → `production` only after smoke pass; submit via `release:android:prod:submit`.

## Versioning

✅ Built — `app.config.js` `version: '1.2.0'`; `eas.json` `cli.appVersionSource: "remote"` with `autoIncrement` (build number on `preview`, full on `production`) so EAS owns build/version codes server-side — never hand-edit `ios.buildNumber` / `android.versionCode` for releases. Expo SDK 55 / React 19.2.6 pin is documented (`apps/mobile/scripts/release/EXPO_VERSION_NOTES.md`). Requirements: bump marketing `version` per release; one git commit per build (`requireCommit`); a `runtimeVersion` policy is a prerequisite before OTA can be turned on (🔭).

## Rollback

🟡 Partial — today rollback is **forward-only via a new binary plus compile-time flag flips** in `apps/mobile/lib/v1FeatureFlags.ts` (e.g. `cloudChat`), and Managed Cloud has an instant server-side kill via `AGI_MANAGED_COMPUTE_PRIVATE_BETA` (re-gates Cloud; `remoteChatGate` fails closed when Cloud is disabled — `apps/mobile/services/remoteChatGate.ts`). True OTA rollback (`eas update:rollback`) is 🔭 Planned and blocked on enabling OTA. Requirements: every release keeps the prior store build promotable; a Cloud incident must be resolvable without an app update (env kill-switch); Local must keep working when Cloud is rolled back.

## Monitoring

🔭 Planned — no crash/analytics SDK (Sentry/Crashlytics/PostHog) is wired in `apps/mobile` today. Pre-release signal comes from EAS build/submit dashboards and smoke scripts (`apps/mobile/scripts/wave0-smoke/`, `apps/mobile/.maestro/cloud-chat-smoke.yaml`, `detox.config.js`). Requirements before scale: opt-in, privacy-manifest-consistent crash reporting (no tracking, `NSPrivacyTracking` stays false), Cloud-path error/latency telemetry that never logs Local chat contents or prompts, and release-health gating on adoption/crash-free rate.

## CI/CD

🟡 Partial — release orchestration is local scripts (`apps/mobile/scripts/release/*.sh`, `package.json` `release:*`) invoking EAS cloud builders; **no GitHub Actions workflow exists for mobile** (`.github/workflows/` covers desktop/cli/web only). A hosted mobile pipeline is 🔭 Planned. Requirements for the pipeline: run `typecheck` + `test` (`jest --runInBand --forceExit`) + `release:preflight` before any build; gate production submit on a green smoke run; inject `$ASC_*` / Play secrets from CI secret store (never commit `secrets/`); keep serial-by-surface lock honored (Mobile is the active surface).

## Repository map

- `apps/mobile/eas.json` — build/submit profiles and channels.
- `apps/mobile/app.config.js` — Expo config, native plugins, privacy manifest, version.
- `apps/mobile/package.json` — `build:*` / `release:*` / `test` / `typecheck` scripts.
- `apps/mobile/scripts/release/` — preflight, ios/android beta+prod, submit scripts, signing runbook, version notes.
- `apps/mobile/scripts/wave0-smoke/`, `apps/mobile/.maestro/`, `apps/mobile/detox.config.js` — smoke/e2e.
- `apps/mobile/store-listing/` — metadata, reviewer notes, readiness/submission checklists, KILL-SWITCH.
- `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts` — flag/kill-switch + Cloud gate.
- `apps/mobile/ios/`, `apps/mobile/secrets/` — native project; credential mounts (git-ignored).
- `packages/contracts/types/src/models.json` — canonical model IDs the build references.

## Competitor notes

ChatGPT and Claude mobile ship a single cloud-account binary: deployment assumes a network and one managed backend. AGI diverges deliberately. (1) **On-device Local** is a first-class deploy target — the binary must run inference offline, so native model plugins and SQLCipher are release-blocking and OTA cannot be required for the core path. (2) **Per-surface trust** — mobile carries Local + Cloud but **no BYOK**; deployment must never add an API-key screen even though Desktop/CLI/VS Code have one. (3) **Multi-provider** is expressed only through `models.json`, so no provider key or hardcoded model ID is baked into the build. (4) Cloud can be **kill-switched server-side** without resubmitting, where competitors rely on backend toggles invisible to the app.

## Acceptance / Definition of Done

Production gate: a publicly downloadable App Store build (and Play release) of the current `app.config.js` version, signed via remote EAS credentials, that boots into Local with no network, gates Cloud behind a real Clerk login (no demo bypass), references only `models.json` model IDs, and passes store review with truthful privacy disclosures. Mobile v1 is **not** done until this public release exists.

- [ ] Build: `release:preflight` green; clean commit; `production` profile builds iOS + Android (AAB) with native plugins linked.
- [ ] Trust: no BYOK/API-key affordance anywhere; Local runs offline; `remoteChatGate` fails closed when Cloud disabled; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` kill-switch verified.
- [ ] Security/store: `secrets/` never committed; privacy manifest + usage strings + Data Safety match real behavior; reviewer notes shipped; public App Store release live.

## Anti-patterns

- Adding a BYOK / provider-API-key screen to mobile, or any "Provider Configuration" that means API keys rather than on-device model management.
- Shipping an OTA that flips the trust boundary, auto-enables Cloud, or silently sends Local chats to Cloud.
- Claiming a public release from a green simulator/TestFlight/internal build — those are milestones, not the DoD.
- Hardcoding or inventing a model ID instead of reading `packages/contracts/types/src/models.json`.
- Committing `secrets/` (ASC `.p8`, Play service account) or hand-editing build/version codes that EAS owns remotely.
- Referencing Supabase, or reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or invented INR prices in store/billing copy.
- OTA-pushing native changes (new pod/gradle dep, permission, entitlement) that legally require a full store binary.
