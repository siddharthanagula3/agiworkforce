# @agiworkforce/mobile

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Kind: app
Criticality: high

## Purpose

Expo 55 + React Native 0.84 + React 19 mobile app for **AGI** (iOS + Android).
Target launch: **2026-08-06**. Bundle id `com.agiworkforce.app`. Apple Developer ID `D2PR62RLT4`.

Authoritative specs (read these before non-trivial changes):

- Root `/AGI_WORKFORCE.md` — product SSOT
- `/docs/PRD.md` — V5 product requirements
- `/docs/PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md` — scaling/observability/compliance
- `/docs/surfaces/mobile.md` — mobile surface deep-dive
- `/docs/decisions/CURRENT_DECISIONS.md` — latest decision index and mobile-v1 launch clarification
- `/docs/archive/2026-05-18-exploration-report.md` — 24-teammate verification report

## Top-level layout

```
apps/mobile/
├── app/                          Expo Router screens (file-based routing — DO NOT restructure casually)
├── components/                   React components, feature-grouped (kebab-case dirs, PascalCase files)
├── lib/                          Pure utilities — no React state, no async I/O, no platform APIs
├── services/                     Async I/O — HTTP, native bridges, MCP, dispatch, providers
├── stores/                       Zustand global state (one file per slice; `chat/` is the multi-slice exception)
├── hooks/                        React hooks (cross-feature; feature-scoped hooks colocate in components/<feature>/)
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
├── Yes, React component                    → components/<feature>/
├── Yes, global state (Zustand)             → stores/<slice>Store.ts
├── Yes, React hook (cross-feature)         → hooks/use<X>.ts
├── Yes, React hook (single feature)        → components/<feature>/use<X>.ts
└── No, pure logic
    ├── Pure function / type guard / format → lib/<x>.ts
    ├── Async I/O wrapper (fetch, RN bridge, MCP, Supabase) → services/<x>.ts
    └── Database / cache / persistence      → storage/<x>.ts
```

## Naming conventions

- Component directories: **kebab-case** (`chat/`, `model-picker/`, `paywall/`)
- Component files: **PascalCase** (`MessageBubble.tsx`, `ProPlusPaywall.tsx`)
- Non-component files: **camelCase** (`tierGuard.ts`, `safeOpenURL.ts`)
- Store files: **`<slice>Store.ts`** (`tierStore.ts`, `chatStore.ts`)
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

Capability-routed per device, configured in `lib/models.ts` + `services/modelCatalog.ts`:

| Tier | Runtime                       | Devices                        | Default models                |
| ---- | ----------------------------- | ------------------------------ | ----------------------------- |
| T1   | Apple Foundation Models (ANE) | iPhone 15 Pro+, M-series iPad  | Apple on-device LLM           |
| T2   | react-native-executorch       | A15+ / mid-range Android       | Llama 3.2 1B/3B, Phi-3.5 mini |
| T3   | llama.rn (GGUF, llama.cpp)    | Older devices, manual override | Llama 3.2 1B Q4               |

BYOK providers via `@agiworkforce/llm-normalize`: Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral, Qwen + Ollama + LMStudio. Mobile BYOK is direct-to-provider by default; any AGI relay path needs separate disclosure.

## Stack pins

| Pkg                     | Version |
| ----------------------- | ------- |
| Expo SDK                | 55.0.23 |
| React Native            | 0.84.0  |
| React                   | 19.2.0  |
| NativeWind              | 4.2.3   |
| react-native-mmkv       | 4.3.1   |
| react-native-reanimated | 4.3.1   |
| Expo Router             | 5.x     |

iOS min: **15.1** (SDK-derived from Expo SDK 55). Bundle id: `com.agiworkforce.app`.

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

- **`app.config.js` is the single Expo config.** The duplicate `app.json` was removed 2026-05-18.
- **Tier 1/2/3 mobile runtime** is wired in `native/` (custom Swift/Kotlin modules) — do NOT add a new on-device model path outside the tier router.
- **Permissions** (camera/mic/photos/calendar/HealthKit) are declared in `app.config.js` -> `ios.infoPlist` and `android.permissions`. Edit Expo config first; root `ios/agiworkforce/Info.plist` is the tracked Xcode-consumed copy.
- **NativeWind v4** is the styling layer; `global.css` + `tailwind.config.js` are its inputs. Don't import the React Native `StyleSheet` API for new components — use Tailwind classes.

## Known caveats (2026-05-18)

- `pnpm --filter @agiworkforce/mobile typecheck` has 5 pre-existing errors (ModeSwitchModal, @agiworkforce/compliance package not yet wired into mobile, `/legal/article-50` route typing, detox dep). Tracked in `/docs/archive/2026-05-18-exploration-report.md`.
- `stores/chat/` is the only subdirectory inside `stores/` — chat needed 3 stores split by concern (execution, message, view); other features use a single file.
- `dist/`, `.expo/`, `.cache/` are build output (gitignored).
