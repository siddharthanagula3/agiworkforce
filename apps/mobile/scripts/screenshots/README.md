# Screenshot capture pipeline — AGI mobile

> Detox-driven automated capture for every screenshot in
> `apps/mobile/store-listing/screenshots/specs/`. Real device frames
> are required by App Review (Guideline 2.3.10); these scripts run
> against the production binary on an iOS Simulator or Android
> Emulator to make captures reproducible.
>
> **Limitation**: simulator captures are acceptable for Google Play
> but Apple App Review may reject simulator captures for a paid app
> that requires a hardware-only feature. For v1 the only such risk is
> the Local mode capture (screenshot 1) which requires actual
> compute — on simulator the Phi-3-mini inference will work but
> slower. If reviewer pushes back, recapture on real device.

---

## Prerequisites

- macOS 14+ with Xcode 16 (for `xcrun simctl` automation)
- Android Studio with `emulator` + AVDs `pixel_8_pro_api_34` and `pixel_tablet_api_34`
- pnpm 9.x at repo root
- `apps/mobile/.env.screenshots` populated with test API keys
  (one Anthropic, one OpenAI, one Google — restricted to
  free-tier-friendly models)

```bash
cd apps/mobile
pnpm install
# iOS simulator boot
pnpm screenshots:ios
# Android emulator captures
pnpm screenshots:android
# Outputs land in apps/mobile/store-listing/screenshots/captures/
```

---

## Per-device target matrix

The `screenshots:ios` script iterates these simulators:

| Class      | Simulator                        | Resolution  |
| ---------- | -------------------------------- | ----------- |
| iOS 6.7"   | `iPhone 17 Pro Max` (iOS 26.2)   | 1290 × 2796 |
| iOS 6.5"   | `iPhone 11 Pro Max` (iOS 17.4)   | 1242 × 2688 |
| iOS 5.5"   | `iPhone 8 Plus` (iOS 16.x)       | 1242 × 2208 |
| iPad 12.9" | `iPad Pro (12.9-inch) (6th gen)` | 2048 × 2732 |
| iPad 11"   | `iPad Pro (11-inch) (4th gen)`   | 1668 × 2388 |

The `screenshots:android` script targets:

| Class      | AVD                        | Resolution  |
| ---------- | -------------------------- | ----------- |
| Phone      | `pixel_8_pro_api_34`       | 1080 × 2400 |
| 10" tablet | `pixel_tablet_api_34`      | 1920 × 1200 |
| 7" tablet  | `pixel_7_api_34_landscape` | 1280 × 800  |

---

## Per-screenshot capture spec

| File                               | Detox spec                  | Pre-conditions                                                                |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `01-multi-provider.png`            | `01-multi-provider.spec.ts` | Three provider keys added; one chat thread with 3 turns × different providers |
| `02-byok-keys.png`                 | `02-byok-keys.spec.ts`      | Settings → Provider Keys with 3 keys configured                               |
| `03-cross-provider-continuity.png` | `03-cross-provider.spec.ts` | One chat with web-search tool call migrating across 3 providers               |
| `04-voice-hold-to-speak.png`       | `04-voice.spec.ts`          | Composer mid-recording state (4s elapsed)                                     |
| `05-vision-attachment.png`         | `05-vision.spec.ts`         | Chat with sample image + model OCR response                                   |
| `06-cross-device-sync.png`         | `06-sync.spec.ts`           | Cloud-mode chat with sync chip mid-flash                                      |

Each Detox spec drives the app to the captured state and calls
`device.takeScreenshot('NN-name')`. The post-processor in
`pipeline.ts` composites the locked tagline overlay onto each raw
capture, writing both `raw/` and `final/` variants.

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

1. Connect a real device (iPhone 15 Pro Max for 6.7" class)
2. Build the production-config app to device with `eas build --profile preview`
3. Drive each spec manually via the in-app demo mode (Settings →
   Hidden → Demo) which pre-seeds the chat state
4. Use the device's screenshot key combo, AirDrop to Mac, drop into
   `captures/{class}/raw/`
5. Run the compositor: `pnpm screenshots:composite`

---

## CI / Release checklist (used by `eas-release` task #11)

Before submitting to App Store Connect:

- [ ] `pnpm screenshots:ios` exits 0
- [ ] `pnpm screenshots:android` exits 0
- [ ] Visual diff against the previous release's captures shows no
      regression in any of the 30 iOS + 18 Android frames
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

The following items **cannot be automated** and need founder action
before submission:

1. **Real test API keys** — the founder must drop free-tier-friendly
   Anthropic + OpenAI + Google + xAI keys into
   `apps/mobile/.env.screenshots`. These are not committed.
2. **Sample image for screenshot 5** — a hand-drawn whiteboard photo
   that's safe to publicly distribute. Owner: design.
3. **Audio bumper** — `assets/audio/bumper-12s.m4a` for the optional
   app preview video. Owner: design.
4. **Real device captures** if simulator is rejected — owner: founder
   (need physical iPhone 17 Pro Max + iPhone 14 Plus + iPhone 8 Plus
   - iPad 12.9" + iPad 11").
