# Screenshot capture pipeline — AGI mobile

Detox-driven automated capture for Mobile visual QA. This is a local
automation harness, not the final App Store / Play Store evidence package.
Store-release captures still require the actual App Review device matrix and
founder approval.

> **Limitation**: simulator captures are useful for local visual QA.
> Store submission still requires a release-device pass and founder
> approval before upload.

---

## Prerequisites

- macOS 14+ with Xcode 16 (for `xcrun simctl` automation)
- Android Studio with `emulator` + AVD `pixel_8_api_34` for Android captures
- pnpm 9.x at repo root
- Detox 20 installed locally before running this harness
- Expo dev client running with the visual-QA biometric bypass enabled
- onboarding completed and AGI Standard installed before specs 01, 03, 04, 05, and 06

```bash
cd apps/mobile
pnpm install
pnpm add -D detox@20
EXPO_PUBLIC_AGI_VISUAL_QA_DISABLE_BIOMETRIC=1 pnpm exec expo start --dev-client --host localhost
# iOS simulator boot
pnpm screenshots:ios
# Android emulator captures
pnpm screenshots:android
# Outputs land in apps/mobile/store-listing/screenshots/captures/
```

---

## Per-device target matrix

The `screenshots:ios` script iterates these simulators:

| Class             | Simulator               | Resolution  |
| ----------------- | ----------------------- | ----------- |
| iPhone 17 Pro     | `iPhone 17 Pro`         | 1206 × 2622 |
| iPhone 17 Pro Max | `iPhone 17 Pro Max`     | 1320 × 2868 |
| iPad Pro 13"      | `iPad Pro 13-inch (M5)` | 2048 × 2732 |
| iPad Pro 11"      | `iPad Pro 11-inch (M5)` | 1668 × 2388 |

The `screenshots:android` script targets:

| Class | AVD              | Resolution  |
| ----- | ---------------- | ----------- |
| Phone | `pixel_8_api_34` | 1080 × 2400 |

---

## Per-screenshot capture spec

| File                      | Detox spec                           | Pre-conditions                                |
| ------------------------- | ------------------------------------ | --------------------------------------------- |
| `01-local-demo-chat.png`  | `01-multi-provider.spec.ts`          | Onboarding complete and local model installed |
| `02-onboarding-local.png` | `02-onboarding-local.spec.ts`        | First launch with local onboarding            |
| `03-first-message.png`    | `03-chat-first-message.spec.ts`      | Onboarding complete and local model installed |
| `04-cloud-waitlist.png`   | `04-mode-toggle-to-waitlist.spec.ts` | Cloud invite gate reachable from chat         |
| `05-image-question.png`   | `05-image-with-question.spec.ts`     | Photo permission and fixture media available  |
| `06-voice-recording.png`  | `06-voice-record-and-send.spec.ts`   | Microphone permission granted                 |

Each Detox spec drives the app to the captured state and calls
`device.takeScreenshot('NN-name')`. The post-processor in `pipeline.ts`
composites the tagline overlay onto each raw capture, writing both `raw/` and
`final/` variants. The command exits early with a clear error if Detox is not
installed.

---

## Tagline overlay compositor

`pipeline.ts` does:

1. Read raw PNG from `captures/{class}/raw/NN-name.png`
2. Read tagline spec from `apps/mobile/store-listing/screenshots/specs/README.md`
   (text + heading size + subhead from the design tokens table)
3. Composite a top-of-frame teal gradient using `sharp` (Node)
4. Render text via SF Pro / Inter via the bundled Node-Canvas
   fallback so the output is deterministic across machines
5. Write `captures/{class}/final/NN-name.png`

---

## Real device capture (fallback)

If App Review pushes back on simulator captures:

1. Connect a real device for the target App Store or Play Store size class
2. Build the production-config app to device with `eas build --profile preview`
3. Complete onboarding, confirm AGI Standard is installed, and drive each frame manually
4. Use the device's screenshot key combo, AirDrop to Mac, drop into
   `captures/{class}/raw/`
5. Run the compositor: `pnpm screenshots:composite`

---

## CI / Release checklist (used by `eas-release` task #11)

Before submitting to App Store Connect:

- [ ] Detox is installed and `pnpm screenshots:ios` exits 0
- [ ] Android AVD exists and `pnpm screenshots:android` exits 0
- [ ] Visual diff against the previous release's captures shows no
      regression in any iOS or Android frame
- [ ] Founder approves each frame (PR review on `screenshots-vN/`
      branch)
- [ ] Captures uploaded to App Store Connect via `fastlane deliver`
      and to Play Console via `fastlane supply`

---

## Asset version control

`captures/` is **not** checked into git (PNGs are large; we track
deltas separately). The `.gitignore` block:

```
apps/mobile/store-listing/screenshots/captures/raw/
apps/mobile/store-listing/screenshots/captures/final/
```

The `specs/`, `pipeline.ts`, and Detox `.spec.ts` files **are**
checked in — they define the build, not the build output.

---

## Founder-input required

The following items need founder or design action before submission:

1. **Sample image for screenshot 5** — a hand-drawn whiteboard photo
   that's safe to publicly distribute. Owner: design.
2. **Audio bumper** — `assets/audio/bumper-12s.m4a` for the optional
   app preview video. Owner: design.
3. **Real device captures** for release upload when the simulator pass
   does not match the store device matrix. Owner: founder.
