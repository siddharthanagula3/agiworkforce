# apps/mobile

Status: Current
Owner: Mobile surface maintainers
Last updated: 2026-09-17

The Expo and React Native surface, shipped to the App Store and Google Play. The
repository-wide map is in `ARCHITECTURE.md`; the rules that govern changing any
of it are in `AGENTS.md`.

## Shape

| Directory     | Holds                                                          |
| ------------- | -------------------------------------------------------------- |
| `app`         | Expo Router routes: `(app)`, `(auth)`, `(public)` and `legal`  |
| `src`         | Features, navigation, storage, i18n and shared UI              |
| `components`  | Screen-level components the routes compose                     |
| `services`    | Device-side services the features call                         |
| `native`      | Config plugins and native module glue                          |
| `store-listing` | Store metadata and reviewer notes, not developer documentation |

**The native projects are generated.** `apps/mobile/ios` and
`apps/mobile/android` are gitignored and produced by prebuild. A native change
goes through a config plugin under `native`, never through a hand edit to
generated output, because the next prebuild discards it.

## Commands

| Task                | Command                                                    |
| ------------------- | ---------------------------------------------------------- |
| Metro dev server    | `pnpm --filter @agiworkforce/mobile dev`                   |
| Run on iOS          | `pnpm --filter @agiworkforce/mobile ios`                   |
| Run on Android      | `pnpm --filter @agiworkforce/mobile android`               |
| Run on a real phone | `pnpm --filter @agiworkforce/mobile ios:device:dev`        |
| Unit tests          | `pnpm --filter @agiworkforce/mobile test`                  |
| Typecheck           | `pnpm --filter @agiworkforce/mobile typecheck`             |
| Lint                | `pnpm --filter @agiworkforce/mobile lint`                  |
| Detox smoke         | `pnpm --filter @agiworkforce/mobile test:e2e:ios:ci`       |

`test` runs the Node script tests first and then Jest, because a broken release
script otherwise only shows up at release time.

## Guards this surface has of its own

| Guard                     | What it refuses                                              |
| ------------------------- | ------------------------------------------------------------ |
| `check:expo-deps`         | a dependency version Expo's SDK does not support             |
| `check:tls-pins`          | a production build whose certificate pins are missing or stale |
| `pnpm check:no-hex-mobile` | a literal colour where a token belongs                       |
| `pnpm check:mobile-hygiene` | the surface-level structure rules                           |

The last two run from the repository root and are part of the guard chain.

## Releasing

Every release script lives under `scripts/release`. The preflight
(`pnpm --filter @agiworkforce/mobile release:preflight`) is what decides whether
a build is worth starting; the verifiers beside it check store associations,
privacy declarations and store listings, and each has a Node test next to it so
the verifier itself is exercised in CI. The workflow is
`.github/workflows/release-mobile.yml`.

Store screenshots are generated, not captured by hand:
`pnpm --filter @agiworkforce/mobile screenshots:required` produces the sizes the
stores demand, and `screenshots:verify` checks one of them before submission.
