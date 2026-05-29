# @agiworkforce/mobile

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Kind: app
Criticality: high

## Purpose

Expo 55 + React Native 0.83.6 + React 19 mobile app for **AGI** (iOS + Android).
Target launch: **2026-08-06**. Bundle id `com.agiworkforce.app`. Apple Developer ID `D2PR62RLT4` for EAS/release signing.

Authoritative specs (read these before non-trivial changes):

- Root `/AGI_WORKFORCE.md` — product SSOT
- `/docs/current/product-suite.md` — product thesis, surfaces, trust modes, and sync boundary
- `/docs/current/technical-architecture.md` — cross-surface architecture and generated-file strategy
- `/docs/current/commercial-and-launch.md` — Local/BYOK/Managed launch posture and waitlist gates
- `/docs/surfaces/mobile.md` — mobile surface deep-dive
- `/docs/decisions/CURRENT_DECISIONS.md` — latest decision index and mobile-v1 launch clarification
- `/docs/archive/2026-05-18-exploration-report.md` — 24-teammate verification report

## Top-level layout

```
apps/mobile/
├── app/                          Expo Router screens (file-based routing — DO NOT restructure casually)
├── src/features/                 Canonical product-domain root for Mobile feature code
├── src/shared/                   Cross-feature components/helpers without a single feature owner
├── components/ui/                Shared UI primitives retained for Expo-era import compatibility
├── lib/                          Pure utilities — no React state, no async I/O, no platform APIs
├── services/                     Remaining cross-feature async I/O; feature-owned I/O lives in src/features/<domain>/
├── stores/                       Remaining cross-feature Zustand state; feature-owned stores live in src/features/<domain>/
├── hooks/                        Cross-feature React hooks; feature-scoped hooks colocate in src/features/<domain>/
├── storage/                      SQLCipher + MMKV + sqlite-vec; SQL inlined in storage/migrations.ts
├── native/                       Custom Swift/Kotlin native modules (Tier 1/2/3 runtime, HealthKit, voice)
├── types/                        TypeScript ambient + module declarations
├── assets/                       Images, fonts, icons
├── __tests__/                    Top-level integration tests (Jest)
├── __mocks__/                    Jest manual mocks
├── scripts/                      Release + screenshot tooling (scripts/release/ has EAS_SIGNING_RUNBOOK.md)
├── secrets/                      Gitignored — ASC API key, signing creds
├── store-listing/                App Store + Play Store metadata
└── android/                      Generated on first `pnpm android` (not in tree yet)
```

Tracked iOS project output lives at root `ios/`. Do not create or hand-maintain a second tracked `apps/mobile/ios/` tree. Custom native module source belongs in `apps/mobile/native/ios/`; Xcode-consumed generated/project files belong in root `ios/`.

## Decision tree — where does new code go?

```
Does it have state or render UI?
├── Yes, domain-owned React component       → src/features/<domain>/components/
├── Yes, shared UI primitive                → components/ui/
├── Yes, cross-feature shared component     → src/shared/components/
├── Yes, feature-owned state                → src/features/<domain>/store.ts
├── Yes, cross-feature global state         → stores/<slice>Store.ts
├── Yes, React hook (cross-feature)         → hooks/use<X>.ts
├── Yes, React hook (single feature)        → src/features/<domain>/hooks/use<X>.ts
└── No, pure logic
    ├── Pure function / type guard / format → lib/<x>.ts
    ├── Feature-owned async I/O             → src/features/<domain>/service.ts
    ├── Cross-feature async I/O             → services/<x>.ts
    └── Database / cache / persistence      → storage/<x>.ts
```

## Naming conventions

- Component directories: **kebab-case** (`chat/`, `model-picker/`, `paywall/`)
- Component files: **PascalCase** (`MessageBubble.tsx`, `ProPlusPaywall.tsx`)
- Non-component files: **camelCase** (`tierGuard.ts`, `safeOpenURL.ts`)
- Feature store files: **`store.ts`** inside `src/features/<domain>/`
- Cross-feature store files: **`<slice>Store.ts`** inside `stores/`
- Test files: **`<unit>.test.ts(x)`** colocated or under `__tests__/`
- Path alias: **`@/`** = `apps/mobile/` (configured in `tsconfig.json` + `babel.config.js`)

## Routing (Expo Router file-based)

- `app/_layout.tsx` — root layout
- `app/(public)/` — pre-auth screens (onboarding)
- `app/(auth)/` — auth flow (login, reset-password)
- `app/(app)/` — authenticated app shell
  - `(tabs)/` — legacy tab-nav (kept for compat; drawer is the v1 target per `/docs/surfaces/mobile.md`)
  - `chat/[id].tsx` — primary chat screen
  - `settings/`, `connectors/`, `dispatch/`, `agents/`, `profile/`, etc.
- `app/legal/` — legal pages (article-50, etc.) — accessible without auth via deep link

## Mobile runtime — three-tier model

Capability-routed per device, configured in `lib/models.ts` + `src/features/model-picker/service.ts`:

| Tier | Runtime                       | Devices                        | Default models                |
| ---- | ----------------------------- | ------------------------------ | ----------------------------- |
| T1   | Apple Foundation Models (ANE) | iPhone 15 Pro+, M-series iPad  | Apple on-device LLM           |
| T2   | react-native-executorch       | A15+ / mid-range Android       | Llama 3.2 1B/3B, Phi-3.5 mini |
| T3   | llama.rn (GGUF, llama.cpp)    | Older devices, manual override | Llama 3.2 1B Q4               |

Mobile v1 does not expose BYOK. It ships small on-device/local LLM routes plus Cloud Managed invite/waitlist. Cloud sends require invite/subscription-backed account state and must stay visually separate from Local.

## Stack pins

| Pkg                     | Version |
| ----------------------- | ------- |
| Expo SDK                | 55.0.23 |
| React Native            | 0.83.6  |
| React                   | 19.2.0  |
| NativeWind              | 4.2.3   |
| react-native-mmkv       | 4.3.1   |
| react-native-reanimated | 4.3.1   |
| Expo Router             | 5.x     |

iOS min: **17.0** (AppShortcuts.xcstrings + local-LLM native runtime floor). Bundle id: `com.agiworkforce.app`.

## Build & test

```bash
# Dev
pnpm --filter @agiworkforce/mobile start      # Metro
pnpm --filter @agiworkforce/mobile ios        # iOS simulator
pnpm --filter @agiworkforce/mobile android    # Android emulator

# Quality gates (run before commit)
pnpm --filter @agiworkforce/mobile typecheck  # tsc --noEmit
pnpm --filter @agiworkforce/mobile lint
pnpm --filter @agiworkforce/mobile test       # jest

# Release (EAS)
pnpm --filter @agiworkforce/mobile run release:ios:beta      # see scripts/release/
pnpm --filter @agiworkforce/mobile run release:android:beta
```

EAS signing runbook: `scripts/release/EAS_SIGNING_RUNBOOK.md`.

## Config notes

- **`app.config.js` is the single Expo config.** The stale root/mobile `app.json` files were removed 2026-05-21.
- **iOS entitlement profile:** default `APP_ENV=development` builds use a reduced entitlement set for basic development provisioning profiles. To force full production entitlements locally (Push / SIWA / Siri / Translate), set `APP_ENV=preview|production` or `EXPO_ENABLE_PRODUCTION_IOS_ENTITLEMENTS=1`.
- **Physical iPhone debug:** run `pnpm --filter @agiworkforce/mobile run ios:device:dev -- <device-udid-or-name>` to clean-regenerate ignored iOS prebuild artifacts with the reduced development entitlement set before installing. Local iPhone builds default to the company Apple team `D2PR62RLT4`; override only with `AGI_IOS_DEVELOPMENT_TEAM=<team-id>`. In Xcode, `Team: AGI AUTOMATION LLC` plus a provisioning profile that includes the device is enough even when the certificate common name shows an individual developer name. Use `ios:device:dev:no-prebuild` only after the generated `apps/mobile/ios/` project is already in the right entitlement state. If iOS reports that the profile is not explicitly trusted, open iPhone Settings -> General -> VPN & Device Management -> Developer App, trust the company developer profile, then rerun the `no-prebuild` command.
- **Tier 1/2/3 mobile runtime** is wired in `native/` (custom Swift/Kotlin modules) — do NOT add a new on-device model path outside the tier router.
- **Permissions** (camera/mic/photos/calendar/HealthKit) are declared in `app.config.js` -> `ios.infoPlist` and `android.permissions`. Edit Expo config first; root `ios/agiworkforce/Info.plist` is the tracked Xcode-consumed copy.
- **NativeWind v4** is the styling layer; `global.css` + `tailwind.config.js` are its inputs. Don't import the React Native `StyleSheet` API for new components — use Tailwind classes.

## Known caveats (2026-05-21)

- `pnpm --filter @agiworkforce/mobile typecheck` is expected to pass after the feature-domain move.
- `stores/chat/` is the only subdirectory inside `stores/` — chat needed 3 stores split by concern (execution, message, view); remaining layer-first stores should migrate only when a feature owner is clear.
- `dist/`, `.expo/`, `.cache/` are build output (gitignored).
