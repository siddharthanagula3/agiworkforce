# Expo SDK 55 — accepted version exceptions

## React 19.2.6 (Expo expects 19.2.0)

We pin React 19.2.6 across the monorepo via root `package.json` →
`pnpm.overrides`. This is a workspace-wide decision driven by
desktop + web + current Next.js needs; the mobile surface inherits it.

Expo dependency validation excludes `react` in `apps/mobile/package.json` while
the repository guard keeps `react-test-renderer` on the identical patch.

Expected exception:

    react@19.2.6 (Expo SDK 55 recommends 19.2.0)

This warning is **accepted**. Do NOT downgrade React in mobile to
19.2.0 — that would force a fork against the rest of the workspace
and likely break shared packages like `@agiworkforce/client-runtime`,
`@agiworkforce/types`, and the React 19 transition the desktop is on.

Re-evaluate this exception when:

1. Expo SDK 56 lands and either matches React 19.2.6 or moves React
   forward.
2. The desktop/web workspace bumps React to a version Expo SDK 55+
   accepts.

## React Native 0.83.10 (remote Expo validation expects 0.83.6)

The installed `expo@55.0.28` package declares React Native 0.83.10 in its own
`bundledNativeModules.json`, and a clean Expo prebuild recommends that patch.
Expo's remote dependency-validation matrix still reports 0.83.6. Until those
two official sources converge, `react-native` is an explicit validation
exception and `scripts/check-expo-deps.mjs` enforces the installed SDK's local
manifest instead.

The same guard requires `@agiworkforce/local-llm` to resolve the exact same
physical React Native runtime. This prevents a workspace peer from introducing
a second native module into Metro or the app binary.

Re-evaluate this exception when Expo's dependency-validation service expects
0.83.10 or when the app moves to a later Expo SDK.

`react-test-renderer` stays on the same 19.2.6 patch as React. Reanimated,
Worklets, and all Expo modules are not exceptions: keep them on the exact pair
recommended by the installed Expo SDK and let `pnpm --filter
@agiworkforce/mobile check:expo-deps` reject drift.

Owner: TL.
Last verified: 2026-07-17.
