# Mobile Visual QA Pass 2026-06-05

Status: in progress
Owner: Codex

## Scope

- Surface: `apps/mobile` and iOS native shell.
- Device used: iPhone 17 Pro simulator, bundle `com.agiworkforce.app`.
- Native profile: workspace `ios/agiworkforce.xcworkspace`, scheme `agiworkforce`.
- Metro command used for QA:
  `EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC=1 pnpm --dir apps/mobile exec expo start --dev-client --host localhost`

## User Clarification

- AGI Standard 2 GB was already downloaded during manual testing.
- Treat an existing installed-model record as valid state.
- Do not show a required download path when the installed model record exists.

## Fixed During QA

- iOS app build now resolves Expo autolinking from the monorepo app root.
- iOS Info.plist now contains the deep-link scheme and the native privacy keys required by linked Expo modules.
- Calendar/reminder native permission strings are present for `expo-calendar`.
- Visual QA can bypass the biometric gate only in dev builds when `EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC=1`.
- Onboarding hero copy now avoids internal Cloud-gating language and uses a short AI-workspace message.
- Onboarding hero now uses the current website AGI mark beside the wordmark.
- Onboarding uses a real SVG progress ring instead of opacity-only progress styling.
- Device-tier copy hides unreliable simulator RAM values.
- Model picker no longer shows local catalog rows without a packaged/downloadable local preset.
- The already-installed AGI Standard path is handled before showing download-required copy.
- EU AI disclosure copy no longer tells users to toggle providers when there are no provider toggles.
- Mobile screenshot specs no longer rely on undocumented Detox launch arguments.

## Simulator Screens Captured

- Age gate: `/var/folders/.../screenshot_optimized_63f7a453-32a2-4275-8adb-7109a3c86c66.jpg`
- Onboarding hero: `/var/folders/.../screenshot_optimized_1019c144-b744-4361-b683-0275cc52362c.jpg`
- Device-tier screen: `/var/folders/.../screenshot_optimized_1e461998-8c06-4804-9ac6-2e5b1dd7848a.jpg`
- Model picker: `/var/folders/.../screenshot_optimized_47e8bb0f-13cf-4314-9d13-0e83a3056024.jpg`
- Polished onboarding hero after copy/logo fix: `/var/folders/9_/_g0m61810s75b_9vrd6hg_6r0000gn/T/screenshot_optimized_1ffbda9c-f0dc-4bbe-bc2a-e237d8476d90.jpg`

## Verification Status

- iOS native build/run succeeded on the iPhone 17 Pro simulator after Podfile and Info.plist fixes.
- Manual visual QA covered age gate, onboarding hero, disclosure flow, device-tier screen, and model picker.
- Detox is not installed in `apps/mobile/package.json`, so the screenshot automation files are maintained as a harness but were not executed in this pass.
- Android visual QA was not run in this pass because no Android emulator was active in the current session.

## Checks To Run Before Commit

- `pnpm --filter @agiworkforce/mobile typecheck`
- `pnpm --filter @agiworkforce/mobile lint`
- `pnpm --filter @agiworkforce/mobile test`
- `pnpm --filter @agiworkforce/compliance test`
- `pnpm check:mobile-hygiene`
- `pnpm check:agent-context`
- `pnpm check:repo-organization`
- `pnpm check:llm-failures`
- `git diff --check`
