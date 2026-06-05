# Expo SDK 55 + React Native 0.83 — Best Practices, Versions & Pitfalls

Research date: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: Expo SDK 55 stable line and the React Native version it actually ships (0.83.x). Framed against AGI Workforce's Mobile surface (`apps/mobile`, Expo/React Native), v1 = Local + BYOK only, multi-provider routing, local-first privacy.

> Confidence: **medium-high**. Repo facts come from direct file reads of `apps/mobile/package.json` and `apps/mobile/eas.json` (high confidence). Version/date facts are corroborated against official Expo changelog and the official React Native blog/versions pages (high confidence). A few API-shape details are Context7- or doc-summary-derived and flagged inline. The on-device-ML and Reanimated-4 mechanism notes lean partly on first-party library docs (swmansion) plus one social source for the SDK-55 feature list — flagged where it matters.

---

## Summary

**The task's framing is off by one and must be corrected before anything else.** The brief says "Expo 55 + React Native 0.84." That pairing does not exist. **Expo SDK 55 ships React Native 0.83 and React 19.2** ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55), 2026-02-25; [RN 0.83 blog](https://reactnative.dev/blog/2025/12/10/react-native-0.83), 2025-12-10). React Native **0.84 is a real release** (2026-02-09, "Hermes V1 by default" + precompiled iOS binaries + Node 22 minimum) but **Expo skipped it** — there is no Expo SDK on RN 0.84 ([RN versions page](https://reactnative.dev/versions), accessed 2026-05-29; [RN 0.84 blog](https://reactnative.dev/blog), accessed 2026-05-29). RN 0.84 went straight to **0.85** (2026-04-06), which is what the **next** Expo release, **SDK 56**, ships (RN 0.85.2 / React 19.2.3) ([Expo SDK 56 beta](https://expo.dev/changelog/sdk-56-beta), 2026-05-06).

**The repo is correct and current.** `apps/mobile/package.json` pins `expo ~55.0.23`, `react-native 0.83.6`, `react 19.2.0` — i.e., AGI is on SDK 55 / RN 0.83, exactly as it should be. There is **no action to "upgrade to RN 0.84"** — that would be a downgrade-to-an-orphan path. The live decision for AGI is whether to ride SDK 55 (stable, on RN 0.83) or jump to **SDK 56** (RN 0.85, requires iOS 16.4 minimum and carries RN 0.85 breaking changes).

**The single most important architectural fact for AGI:** SDK 55 runs **entirely on the New Architecture (Fabric + TurboModules). It is always enabled and cannot be disabled** — the `newArchEnabled` flag was removed from `app.json`, and the option to disable was removed back in RN 0.82 ([Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/), accessed 2026-05-29). This makes **native-dependency New-Arch compatibility the dominant upgrade risk**. AGI's own `expo.doctor.reactNativeDirectoryCheck.exclude` list — `react-native-webrtc`, `react-native-executorch`, `react-native-executorch-expo-resource-fetcher`, `llama.rn` (read from `package.json`) — is precisely the set of native libs that bypass directory validation and must be hand-verified against Fabric/TurboModules.

AGI's secure-storage posture already matches best practice: it ships **both** `expo-secure-store ~55.0.13` (Keychain/Keystore, hardware-backed, for secrets) **and** `react-native-mmkv ^3.2.0` (fast KV, AES-256 only when you supply an `encryptionKey`). For a BYOK app the correct split is non-negotiable: provider API keys belong in SecureStore (or in MMKV encrypted with a SecureStore-held key), never in plaintext MMKV.

---

## Current bar (what best practice requires as of 2026-05-29)

These are the practices a modern Expo SDK 55 / RN 0.83 app is expected to meet. AGI status is marked where verifiable from the repo.

1. **Be on the New Architecture, full stop.** SDK 55+ is New-Arch-only; there is no opt-out. Every native dependency must be Fabric/TurboModule-compatible or run through the interop layer, and the interop "is not perfect" ([Expo New Architecture guide](https://docs.expo.dev/guides/new-architecture/)). **AGI: on SDK 55 → New Arch by definition. Risk concentrated in the 4 doctor-excluded native libs.**

2. **Use Expo-managed (SDK-aligned) versions for every `expo-*` and core RN lib.** Install via `npx expo install`, not raw npm, so versions match the SDK's tested matrix; run `npx expo-doctor` in CI ([Expo Router installation](https://docs.expo.dev/router/installation/), accessed 2026-05-29). **AGI: all `expo-*` pinned to `~55.0.x`; has a `doctor` config block.**

3. **Secrets in hardware-backed storage; fast data in MMKV.** Tokens/API keys → `expo-secure-store` (iOS Keychain / Android Keystore, Secure Enclave / TEE-backed, ~2KB-per-key practical limit). Large or hot data → MMKV; if it's sensitive, enable MMKV's AES-256 with a key **generated at runtime and stored in SecureStore**, never hardcoded in the JS bundle ([SecureStore docs](https://docs.expo.dev/versions/latest/sdk/securestore/); [MMKV vs SecureStore comparison](https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026), accessed 2026-05-29). **AGI: ships both — must enforce the split for BYOK keys.**

4. **Biometric gate for sensitive surfaces via `expo-local-authentication`.** FaceID/TouchID on iOS, BiometricPrompt on Android; pair with a config-plugin `faceIDPermission` string (also required by SecureStore's plugin) ([LocalAuthentication docs](https://docs.expo.dev/versions/v55.0.0/sdk/local-authentication/), Context7; [SecureStore plugin config](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/), Context7). **AGI: ships `expo-local-authentication ~55.0.13`.**

5. **Push via `expo-notifications` + a development/standalone build (never Expo Go for push on SDK 53+).** SDK 55 updated Android Firebase deps with background-task and crash fixes; configure channels and request permission explicitly ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)). **AGI: ships `expo-notifications ~55.0.22`, `expo-task-manager`, `expo-background-fetch`.**

6. **EAS Update with channels + the bytecode-diffing win.** SDK 55 adds **Hermes bytecode diffing** (~75% smaller update download / JS download time), opt-in via `enableBsdiffPatchSupport`. EAS Update now requires an `--environment` flag. Use `Updates.channel` (`null` in Expo Go / dev builds) to gate channels ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55); [Updates docs](https://docs.expo.dev/versions/v55.0.0/sdk/updates), Context7). **AGI: ships `expo-updates ~55.0.21`; `eas.json` sets `channel` per profile.**

7. **EAS Build pinned + reproducible.** Set `appVersionSource: remote`, `requireCommit: true`, pin Node/pnpm/NDK, cache `node_modules`/Pods. SDK 55 bumps **Xcode 26.2 default / Xcode 26 minimum** on EAS Build ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)). **AGI: `eas.json` already does all of this (Node 22.12.0, pnpm 9.15.3, NDK 27.1.x, `requireCommit`, cache).**

8. **Honor the iOS deployment-target floor.** SDK 55 minimum is **iOS 15.1** (SDK 56 raises it to **iOS 16.4**) ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55); [Expo SDK 56 beta](https://expo.dev/changelog/sdk-56-beta)). Set via `expo-build-properties` `ios.deploymentTarget`. **AGI: SDK 55 → 15.1 floor applies; verify if any native dep forces higher.**

9. **Reanimated 4 + worklets wired correctly.** Reanimated 4 is New-Arch-only and requires the separate **`react-native-worklets`** package, plus the Babel plugin switch from `react-native-reanimated/plugin` to `react-native-worklets/plugin` ([Reanimated 3→4 migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/), accessed 2026-05-29). **AGI: ships `react-native-reanimated 4.3.1` + `react-native-worklets 0.8.0` (devDependency) — present; the Babel plugin must be the worklets one (verify in `babel.config.js`).**

10. **On-device ML through a New-Arch-ready runtime.** The two viable RN paths in 2026 are **ExecuTorch** (Meta/PyTorch, `react-native-executorch`, declarative, supports Qwen 3 / Llama 3.2 / SmolLM 2 / Whisper / CLIP) and **llama.cpp bindings** (`llama.rn`, GGUF). Both are private/offline by design ([RN ExecuTorch docs](https://docs.swmansion.com/react-native-executorch/), accessed 2026-05-29). **AGI: ships both `react-native-executorch ^0.8.4` and `llama.rn ^0.10.0` — directly serves local-first.**

---

## Version-specific facts (exact versions + dates)

| Item | Value | Source / date |
|---|---|---|
| Expo SDK 55 release | **2026-02-25**, stable | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55) |
| SDK 55 bundles | **React Native 0.83**, **React 19.2** | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55); [RN 0.83 blog](https://reactnative.dev/blog/2025/12/10/react-native-0.83) |
| SDK 55 iOS min deployment target | **15.1** | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55) |
| SDK 55 New Architecture | Mandatory, **cannot be disabled**; `newArchEnabled` removed from `app.json` | [Expo New Arch guide](https://docs.expo.dev/guides/new-architecture/) |
| SDK 55 router | **Expo Router v7** (Colors API / Material 3, Apple Zoom Transition, `Stack.Toolbar`, experimental SplitView, native-tabs safe areas) | [Expo X announcement](https://x.com/expo/status/2026811977990025364) (social); [Router docs](https://docs.expo.dev/versions/latest/sdk/router/) |
| SDK 55 EAS Build | Xcode **26.2 default**, **26 minimum** | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55) |
| SDK 55 EAS Update | Hermes bytecode diffing (~75% smaller, opt-in `enableBsdiffPatchSupport`); `--environment` flag now required | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55) |
| SDK 55 expo-file-system | `append` option added to write methods | [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55) |
| SDK 55 other | `expo-brownfield` isolation; Expo Widgets (alpha); Expo Blur on Android stable | [Expo X announcement](https://x.com/expo/status/2026811977990025364) (social); [databear SDK 55 summary](https://databear.com/expo-sdk-55-features/) |
| RN 0.83 release | **2025-12-10**; React 19.2; **no user-facing breaking changes**; new DevTools (Network/Performance panels + desktop app) | [RN 0.83 blog](https://reactnative.dev/blog/2025/12/10/react-native-0.83) |
| **RN 0.84 release** | **2026-02-09** (versions page) / blog post ~2026-02-11; "**Hermes V1 by default**", precompiled iOS binaries, **Node 22 minimum**, more legacy-arch removal. **NOT shipped in any Expo SDK.** | [RN versions page](https://reactnative.dev/versions); [RN blog](https://reactnative.dev/blog) |
| RN 0.85 release | **2026-04-06**; new Animation Backend, Metro TLS, new Jest preset package; breaking: Jest preset moved, EOL Node dropped, `StyleSheet.absoluteFillObject` removed | [RN versions page](https://reactnative.dev/versions); [RN blog](https://reactnative.dev/blog) |
| Expo SDK 56 beta | Announced **2026-05-06**; bundles **RN 0.85.2 / React 19.2.3**; **iOS min 16.4** (macOS 13.4) | [Expo SDK 56 beta](https://expo.dev/changelog/sdk-56-beta) |
| RN latest stable | **0.85.x** (0.84 = previous active; 0.83 = end-of-cycle) | [RN versions page](https://reactnative.dev/versions) |
| Reanimated 4 requirements | New-Arch-only; needs separate `react-native-worklets`; Babel plugin → `react-native-worklets/plugin` | [Reanimated 3→4 migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/) |

**Repo state (read from `apps/mobile/package.json`, 2026-05-29):** `expo ~55.0.23`, `react-native 0.83.6`, `react 19.2.0`, `expo-router ~55.0.14`, `expo-secure-store ~55.0.13`, `react-native-mmkv ^3.2.0`, `expo-local-authentication ~55.0.13`, `expo-notifications ~55.0.22`, `expo-updates ~55.0.21`, `react-native-reanimated 4.3.1` + `react-native-worklets 0.8.0` (dev), `react-native-executorch ^0.8.4`, `llama.rn ^0.10.0`, `react-native-webrtc ^124.0.5`, `nativewind ^4.2.3` + `tailwindcss ^3.4.17`, `@shopify/flash-list 2.0.2`, `zustand ^5.0.12`. `eas.json`: `appVersionSource: remote`, `requireCommit: true`, Node 22.12.0, pnpm 9.15.3, NDK 27.1.12297006, per-profile channels.

---

## Known pitfalls & gotchas

1. **"Expo 55 + RN 0.84" is not a real combination.** Anyone (or any LLM) targeting RN 0.84 *under SDK 55* is wrong: SDK 55 = RN 0.83. Treat the brief's version as a typo. Do not bump `react-native` to 0.84 inside a SDK 55 project — Expo never shipped that pairing and it isn't in the tested matrix ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55); [RN versions page](https://reactnative.dev/versions)).

2. **No New-Architecture escape hatch.** If a native dep is incompatible, you cannot fall back to the legacy arch in SDK 55 — Expo's own guidance is to *temporarily remove the library* or move down to SDK 54 ([Expo New Arch guide](https://docs.expo.dev/guides/new-architecture/)). For AGI this is sharpest on the **doctor-excluded** libs (`react-native-webrtc`, `react-native-executorch`(+resource-fetcher), `llama.rn`): they skip RN-Directory validation, so New-Arch compatibility is on AGI to verify per native-build, not assumed.

3. **Reanimated 4 dual-package + Babel trap.** Upgrading Reanimated without adding `react-native-worklets` and switching the Babel plugin produces runtime "native part of Worklets" errors and Pod failures. AGI ships both packages, but the Babel config must point at `react-native-worklets/plugin` (verify `babel.config.js`) ([Reanimated 3→4 migration](https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/); [RN 0.82 + Reanimated nightmare writeup](https://medium.com/@atisosyalmedya/react-native-0-82-reanimated-nightmare-how-i-fixed-native-part-of-worklets-and-pod-issues-df5a9ff7ecbc), accessed 2026-05-29).

4. **MMKV is NOT encrypted by default.** Plain `new MMKV()` writes cleartext. AES-256 only applies when you pass `encryptionKey`, and that key must be generated at runtime + stored in SecureStore — hardcoding it in the JS bundle is trivially extractable from the app binary ([MMKV vs SecureStore](https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026); [MMKV encryption issue #595](https://github.com/mrousavy/react-native-mmkv/issues/595), accessed 2026-05-29). For a BYOK app this is the highest-stakes storage decision.

5. **SecureStore has a ~2KB-per-key practical ceiling and needs a config plugin for FaceID.** Large secrets/datasets won't fit; the documented pattern is MMKV-encrypted-with-a-SecureStore-key. The `expo-secure-store` config plugin must set `faceIDPermission` (and `configureAndroidBackup`) or biometric-gated reads/Face ID can fail at runtime ([SecureStore docs](https://docs.expo.dev/versions/latest/sdk/securestore/); [SecureStore plugin config](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/), Context7).

6. **EAS Update channel is `null` in Expo Go and dev builds.** Code that branches on `Updates.channel` silently no-ops during development — test channel logic in an internal-distribution build, not Expo Go ([Updates docs](https://docs.expo.dev/versions/v55.0.0/sdk/updates), Context7).

7. **EAS Update now demands `--environment`; bytecode diffing is opt-in.** Existing update scripts break until the flag is added; the 75% download win does nothing unless `enableBsdiffPatchSupport` is turned on ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)).

8. **Xcode 26 floor on EAS Build.** Local-vs-CI Xcode drift will cause "works on EAS, fails locally" (or vice-versa). Pin local Xcode to 26.x to match ([Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)).

9. **The SDK-56 jump is two RN versions at once (0.83 → 0.85), skipping 0.84.** Moving AGI to SDK 56 means absorbing RN 0.84's changes (Hermes V1 default, precompiled iOS binaries, Node 22 min) *and* RN 0.85's breaking changes (`StyleSheet.absoluteFillObject` removed, Jest preset relocated, dropped EOL Node) **and** the iOS 16.4 minimum bump — in a single hop. Plan it as a real migration, not a patch ([RN blog](https://reactnative.dev/blog); [Expo SDK 56 beta](https://expo.dev/changelog/sdk-56-beta)).

10. **NativeWind v4 + Tailwind 3 (not 4).** AGI ships `nativewind ^4.2.3` with `tailwindcss ^3.4.17`. NativeWind v4 targets the Tailwind v3 engine; do not casually bump Tailwind to v4 expecting NativeWind to follow — verify the compatibility matrix before any Tailwind major. (Repo fact from `package.json`; treat the Tailwind-v4 caution as a general NativeWind compatibility risk to verify before acting.)

---

## Implications / gaps for AGI Workforce

1. **No "RN 0.84" work item.** The headline instruction in the brief is a non-task. AGI is correctly on SDK 55 / RN 0.83.6. The only real forward decision is **SDK 55 → SDK 56 (RN 0.85)**, and that is gated by the four risks in pitfall #9 plus the iOS 16.4 floor. Recommendation: stay on SDK 55 for v1 launch stability; schedule SDK 56 as a tracked migration once `react-native-executorch`, `llama.rn`, and `react-native-webrtc` confirm RN 0.85 support.

2. **On-device ML is a differentiator AGI already has wired, but it's the New-Arch fault line.** `react-native-executorch` (Qwen 3 / Llama 3.2 / SmolLM 2 / Whisper / CLIP) and `llama.rn` (GGUF) give AGI true local inference matching the local-first/BYOK story. Because both are doctor-excluded, AGI must own per-release New-Arch validation and keep the exclude list current — this is the most likely place an SDK bump breaks the build.

3. **BYOK secret-storage trust boundary maps cleanly onto the SecureStore/MMKV split.** Provider keys → SecureStore (Keychain/Keystore, Secure Enclave/TEE). Larger sensitive state (e.g., cached conversation context, model metadata) → MMKV **encrypted with a SecureStore-held key**. AGI ships both libs; the gap to verify is enforcement: confirm no code path writes a provider key to plain MMKV/AsyncStorage, and confirm MMKV instances holding sensitive data are constructed with an `encryptionKey`. This should be a lint/review rule given the "never silently route secrets" lock.

4. **Local→BYOK fork rules and OTA updates interact.** AGI's lock requires Local→BYOK to be explicit (consent, secret scan, provider label). EAS Update can ship JS changes to that flow OTA; ensure channel gating (`Updates.channel`, with its `null`-in-dev caveat) and that consent/secret-scan logic can't be silently altered by an unreviewed OTA bundle. Bytecode diffing (`enableBsdiffPatchSupport`) is a free download-size win worth enabling for India-first GTM bandwidth.

5. **Biometric gate is available and shipped — wire it to the secret boundary.** `expo-local-authentication` should gate access to BYOK keys / Local-session unlock, with the SecureStore + LocalAuth `faceIDPermission` config strings set so Face ID prompts don't fail. This is a concrete v1 hardening item that the dependency set already supports.

6. **CI guardrails to add/confirm:** `npx expo-doctor` and `npx expo install --check` in mobile CI to catch SDK-version drift; a check that the Babel plugin is `react-native-worklets/plugin`; a check that the iOS deployment target is ≥15.1 (and ≥16.4 before any SDK 56 move). `eas.json` already enforces `requireCommit` and pinned toolchains — good.

---

## Sources

All accessed 2026-05-29 unless the page itself is dated.

- Expo SDK 55 changelog (stable, 2026-02-25) — https://expo.dev/changelog/sdk-55
- Expo SDK 56 beta changelog (2026-05-06) — https://expo.dev/changelog/sdk-56-beta
- Expo — React Native's New Architecture guide — https://docs.expo.dev/guides/new-architecture/
- Expo — SecureStore docs (SDK 55) — https://docs.expo.dev/versions/v55.0.0/sdk/securestore — and latest: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo — LocalAuthentication docs (SDK 55, via Context7 `/websites/expo_dev_versions_v55_0_0`) — https://docs.expo.dev/versions/v55.0.0/sdk/local-authentication/
- Expo — Updates docs (SDK 55, via Context7) — https://docs.expo.dev/versions/v55.0.0/sdk/updates
- Expo — build-properties docs (iOS deploymentTarget, via Context7) — https://docs.expo.dev/versions/v55.0.0/sdk/build-properties
- Expo — Router installation — https://docs.expo.dev/router/installation/ — and Router SDK page: https://docs.expo.dev/versions/latest/sdk/router/
- Expo on X — SDK 55 announcement (RN 0.83, React 19.2, Router v7, brownfield, MCP) [social tier] — https://x.com/expo/status/2026811977990025364
- React Native 0.83 blog (2025-12-10) — https://reactnative.dev/blog/2025/12/10/react-native-0.83
- React Native blog index (0.84 "Hermes V1 by default" ~2026-02; 0.85 ~2026-04-07) — https://reactnative.dev/blog
- React Native versions page (0.83 EOC, 0.84 2026-02-09, 0.85 2026-04-06 latest) — https://reactnative.dev/versions
- React Native Reanimated — Migration 3.x → 4.x — https://docs.swmansion.com/react-native-reanimated/docs/guides/migration-from-3.x/
- React Native Reanimated — Compatibility table — https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/
- React Native ExecuTorch docs (on-device LLM/CV; Qwen3, Llama 3.2, SmolLM2, Whisper, CLIP) — https://docs.swmansion.com/react-native-executorch/
- react-native-executorch (npm) — https://www.npmjs.com/package/react-native-executorch
- MMKV vs AsyncStorage vs Expo SecureStore (2026 comparison) — https://www.pkgpulse.com/guides/react-native-mmkv-vs-async-storage-vs-expo-secure-store-2026
- react-native-mmkv — "Unclear docs regarding encryption" issue #595 — https://github.com/mrousavy/react-native-mmkv/issues/595
- RN 0.82 + Reanimated "native part of Worklets" troubleshooting writeup [community tier] — https://medium.com/@atisosyalmedya/react-native-0-82-reanimated-nightmare-how-i-fixed-native-part-of-worklets-and-pod-issues-df5a9ff7ecbc
- databear — Expo SDK 55 features summary [community tier] — https://databear.com/expo-sdk-55-features/
- AGI repo (read 2026-05-29): `apps/mobile/package.json`, `apps/mobile/eas.json`
