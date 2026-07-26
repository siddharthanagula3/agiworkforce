# AGI Mobile — Volume 02 — Mobile Architecture (Expo)

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`. Grounded in `apps/mobile/{app.config.js,eas.json,package.json}`, `apps/mobile/app/**`, `apps/mobile/stores/**`, `apps/mobile/services/**`, `apps/mobile/storage/db.ts`, `apps/mobile/lib/{secureStorage,pinning,mmkv,v1FeatureFlags}.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies AGI Mobile's client architecture: the Expo runtime, navigation, state, networking, storage, OTA, build, and release machinery. AGI Mobile exposes **two** trust modes only — **Local** (a small on-device LLM, free) and **Managed Cloud** (public alpha, open by default). **Mobile has NO BYOK.** "Provider Configuration" on mobile means on-device model management (download/select/remove weights), never API-key entry. The architecture keeps Local compute on-device and never silently routes Local chats, files, or memory to Cloud; cross-device data sync is Managed-Cloud chats only, via Neon delta-sync. A phone may also act as a **remote window** over a Desktop/CLI session (compute stays on host, outbound-only, QR + HMAC paired, approval-gated) — not a third storage tier and never moving Local host data to the cloud. Model IDs come only from `packages/contracts/types/src/models.json`.

## Expo Architecture

Mobile is an Expo / React Native app on **Expo SDK ~55** with **React Native 0.83.6** and **React 19.2.0** (`package.json`). The New Architecture (Fabric/TurboModules) is the SDK 55 default — `app.config.js` intentionally omits `newArchEnabled`. Config is dynamic (`app.config.js`, replacing `app.json`): app-env (`development`/`preview`/`production`) drives entitlements, associated domains, and conditional plugins (Push, SIWA, Siri, Translate). Native modules wire in via config plugins (`./native/ios/withAGINativeModulesIOS.cjs`, `./native/android/withAGI*.cjs`). **✅ Built** — `apps/mobile/app.config.js`. Requirement: every native capability ships as a config plugin so `expo prebuild` regenerates `/ios` and `android/` deterministically; no hand-edited native drift.

## Expo Router — navigation

Routing is file-based via **expo-router ~55** with `experiments.typedRoutes: true`. The tree under `apps/mobile/app/` has **74 screen route files** plus 6 `_layout.tsx` files, in route groups: `(app)` (authenticated shell, with a `(tabs)` group: index, chat, projects, agents, settings), `(auth)` (login, reset-password), `(public)` (onboarding, age-gate), and `legal/`. Deep links use scheme `agiworkforce` and verified universal/app links to `agiworkforce.com`. **✅ Built** — `apps/mobile/app/`. Requirement: route guards enforce the Cloud auth gate (`(auth)` redirect when signed-out) and never present a BYOK/provider-key route; typed routes must compile.

## React Native Architecture

RN 0.83.6 runs with Reanimated 4.3.1 + Worklets, Gesture Handler, Screens, Safe Area Context, FlashList, and NativeWind v4. On-device inference uses **react-native-executorch** and **llama.rn** runtimes (config plugins); weights download at runtime into Documents, never bundled. Custom Swift/Kotlin modules (Foundation Models, Translate, Vision OCR, App Intents) bridge through native plugins. **✅ Built** — `apps/mobile/native/`. Requirement: heavy compute (PDF/PPTX/DOCX, image generation) is **cloud-backed** — image gen calls the cloud API (`FEATURES.imageGen`, `apps/mobile/src/features/image/`); mobile must not become the first heavy local document/image-gen surface.

## State Management

Client state uses **Zustand v5** with `persist`. Stores live in `apps/mobile/stores/` (chat, settings, agentControl, connection, desktopStatus, dispatch, permissions, notificationPrefs, plus chat/memory/projects/settings slices). The persistence backend is chosen by sensitivity: non-sensitive settings to MMKV (`lib/mmkv.ts`), secrets through the SecureStore adapter. **✅ Built** — `apps/mobile/stores/`, `apps/mobile/lib/mmkv.ts`. Requirement: trust mode is store state, never inferred; switching Local↔Cloud is explicit and auditable, and `remoteChatGate` fails closed when Cloud is disabled.

## Networking — API communication

All outbound HTTPS flows through one chokepoint, **`services/secureFetch.ts`**, so every call site is greppable and TLS pinning flips on in one place (`lib/pinning.ts`, `PINNING_ENFORCED`; placeholder SPKI hashes block release until ops provisions real pins). Cloud chat streams via `services/streaming.ts` carrying the Clerk token from `services/authSession.ts`; resilience comes from `offlineQueue` and `egressGuard`. Cloud access is gated by `services/remoteChatGate.ts` (fails closed when `cloudChat` is off or the build is local-only). **✅ Built** — `services/secureFetch.ts`, `lib/pinning.ts`, `services/remoteChatGate.ts`. 🟡 **Partial** — pinning is wired but unenforced until real SPKI hashes land. Requirement: no `fetch` outside the chokepoint; Local inference issues no network calls.

## Secure Storage

Secrets use **expo-secure-store** (iOS Keychain / Android Keystore) via `lib/secureStorage.ts`, with `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (never synced to iCloud backup, only readable while unlocked). The adapter returns its promises so Zustand `persist` propagates write failures, and tolerates the iOS Before-First-Unlock state by treating a read failure as "no session" rather than crashing hydration. Biometric unlock uses expo-local-authentication. **✅ Built** — `apps/mobile/lib/secureStorage.ts`. Requirement: auth tokens and the SQLCipher key live only in SecureStore; no secret in MMKV or plaintext.

## SQLite Storage

Local persistence of conversations, messages, memory, doc chunks, installed-model records, and telemetry uses **expo-sqlite with SQLCipher** (`['expo-sqlite', { useSQLCipher: true }]`). `storage/db.ts` performs the PRAGMA key ceremony with a 256-bit hex key (expo-crypto) stored in SecureStore, sets WAL + foreign-keys, and runs versioned migrations atomically (body + `user_version` bump in one transaction). Rekey persists the new key before re-encrypting and rolls back on failure. **✅ Built** — `apps/mobile/storage/db.ts`, `storage/migrations.ts`. Requirement: SQLCipher must be linked (the plugin replaces stock SQLite); without it the PRAGMA key is a silent no-op leaving the DB unencrypted.

## OTA Updates — Expo Updates strategy

`expo-updates` is installed and registered as a plugin with `updates.fallbackToCacheTimeout: 0` (`app.config.js`), and EAS channels (`development`/`preview`/`production`) map builds to update streams (`eas.json`). But there is **no in-app update lifecycle** (no `Updates.checkForUpdateAsync`/`reloadAsync`) and **no `runtimeVersion` policy**. 🟡 **Partial** — `app.config.js`, `eas.json`. Requirement (🔭 Planned): add a `runtimeVersion` policy, an update-check on resume, and a rollback/staged-rollout plan before relying on OTA for hotfixes. Native ABI changes ship as full store builds, never OTA.

## Build System — Expo EAS Build

Builds run on **EAS Build** (`eas.json`, CLI `>= 13.0.0`, `appVersionSource: remote`, `requireCommit: true`). A `base` profile pins Node 24.18.0 / pnpm 9.15.3, iOS image `latest` on `m-medium`, Android NDK 27.1.12297006, and caches `node_modules`/`ios/Pods`. Profiles: `development` (dev client, simulator Debug), `preview`/`preview-simulator` (internal Release), `production` (Release, aab, remote credentials). **✅ Built** — `apps/mobile/eas.json`. Requirement: production uses `credentialsSource: remote`; signing secrets stay out of the JS bundle and git.

## Release Pipeline — mobile deployment

Release is script-driven under `apps/mobile/scripts/release/` (`preflight.sh`, `ios-prod.sh`, `android-prod.sh`, `submit-*.sh`), exposed via `package.json` (`release:preflight`, `release:ios:prod:submit`, etc.). EAS Submit profiles carry the App Store Connect API key (`./secrets/asc-api-key.p8`, team `D2PR62RLT4`, bundle `com.agiworkforce.app`) and the Google Play service account, Android tracks defaulting to `internal`/`draft`. The committed native iOS workspace lives at repo root `/ios` (Expo prebuild output at `apps/mobile/ios`). **✅ Built** — `apps/mobile/eas.json`, `apps/mobile/scripts/release/`, `/ios`. Requirement: `pnpm check:tls-pins` and preflight must pass before any production submit; secrets are referenced by path/CI var, never inlined.

## Repository map

- `apps/mobile/app/**` — expo-router route tree (74 screens, 6 layouts).
- `apps/mobile/{app.config.js,eas.json,metro.config.js,babel.config.js}` — config, build, bundler.
- `apps/mobile/stores/**` — Zustand stores (persist via MMKV / SecureStore).
- `apps/mobile/services/**` — `secureFetch`, `streaming`, `authSession`, `remoteChatGate`, `offlineQueue`, `modelDownload`.
- `apps/mobile/storage/**` — SQLCipher `db.ts`, `migrations.ts`, conversation/message/memory stores.
- `apps/mobile/lib/**` — `secureStorage`, `mmkv`, `pinning`, `egressGuard`, `sendQueue`, `v1FeatureFlags`.
- `apps/mobile/native/**`, `/ios`, `apps/mobile/ios` — native modules and iOS projects.
- `apps/mobile/scripts/release/**` — release/submit automation.
- Shared: `packages/platform/local-llm` (on-device tiers/catalog), `packages/contracts/types/src/models.json` (model SSOT).

## Competitor notes

ChatGPT and Claude mobile are single-provider cloud clients with cloud-only history sync and no on-device model. AGI Mobile diverges deliberately: (1) a real **on-device Local** mode (executorch + llama.rn) running free and offline with zero egress; (2) **multi-provider** Managed Cloud selecting models from `models.json` (e.g. `gpt-5.5`, `claude-opus-5`, `gemini-3.1-pro-preview`) instead of one vendor; (3) **per-surface trust** with explicitly **no BYOK on mobile**, unlike Desktop/CLI/VS Code; (4) a **remote-window** companion over a local host session rather than shipping all compute to the cloud.

## Acceptance / Definition of Done

Production-ready when: every outbound request flows through `secureFetch` with pinning enforced; SQLCipher is confirmed linked; Cloud is reachable only behind the real auth gate with `remoteChatGate` failing closed; Local inference performs no network I/O; OTA has a `runtimeVersion` policy; and `pnpm --filter @agiworkforce/mobile typecheck`/`test` plus `pnpm check:tls-pins` pass.

- [ ] **Build:** EAS `production` profile builds iOS + Android; typed routes compile; preflight green.
- [ ] **Trust:** no BYOK/provider-key affordance; Local never auto-routes to Cloud; sync limited to Managed-Cloud chats; remote window keeps compute on host.
- [ ] **Security:** secrets only in SecureStore; SQLCipher key never leaves the keychain; TLS pins provisioned (`lib/pinning.ts`); egress guard active.

## Anti-patterns

- Adding a BYOK / API-key entry screen, env, or store to mobile — forbidden; "Provider Configuration" is on-device model management only.
- Auto-sending or silently syncing Local chats/files/memory to Cloud.
- Faking unsupported capability (e.g. presenting OTA as production-ready, or pinning as enforced, while it is 🟡 Partial).
- Hardcoding or inventing model IDs — read `packages/contracts/types/src/models.json`. (Note: comments in `lib/v1FeatureFlags.ts` still say "Hobby tier"; canon retired that name — use Free/Basic/Pro/Max/Enterprise; treat the code naming as a tracked reconciliation gap.)
- Referencing Supabase (removed; stack is Clerk + Neon + Stripe).
- Bypassing `secureFetch`, hand-editing `/ios` instead of config plugins, or OTA-shipping native ABI changes.
