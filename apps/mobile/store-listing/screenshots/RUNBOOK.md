# Store screenshot capture runbook

Everything below runs from `apps/mobile`. The pipeline drives a real simulator/emulator
through Detox, captures a frame per spec, and composites each one onto a branded canvas
sized exactly to a store upload slot.

Budget roughly 15 minutes per device class after the builds are done. The builds
themselves are the slow part (iOS release ~15–25 min cold, Android release ~10 min).

## What the stores actually require

| Device class        | Canvas      | Upload slot                                    |
| ------------------- | ----------- | ---------------------------------------------- |
| `iphone-17-pro-max` | 1320 × 2868 | App Store Connect, iPhone 6.9" **(required)**  |
| `ipad-pro-13`       | 2048 × 2732 | App Store Connect, iPad 13" **(required)**     |
| `phone`             | 1080 × 1920 | Play Console, phone screenshots **(required)** |
| `tablet-10`         | 1440 × 2560 | Play Console, 10" tablet (optional)            |
| `iphone-17-pro`     | 1206 × 2622 | none, internal review only                     |
| `ipad-pro-11`       | 1668 × 2388 | none, internal review only                     |

The iPad slot is required because `app.config.js` sets `ios.supportsTablet: true`.
`iphone-17-pro` and `ipad-pro-11` produce good-looking frames that App Store Connect has
no slot for; capture them only for internal review.

## One-time setup

### iOS

Xcode 26.6 and all four simulators are already present on this machine. `apps/mobile/ios`
is already prebuilt with CocoaPods installed. Nothing to do.

If `apps/mobile/ios` is ever missing, regenerate it with `npx expo prebuild -p ios`
(do **not** pass `--clean`; it discards the AGIShareExtension target).

### Android: required, not yet done

The SDK and the `android-34` ARM64 system image are installed, but **no AVD exists**, which
is why no Android screenshot has ever been captured. Create the phone AVD:

```bash
avdmanager create avd -n pixel_8_api_34 \
  -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_8
```

Optional, only if you want the Play large-screen listing:

```bash
avdmanager create avd -n pixel_tablet_api_34 \
  -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_tablet
```

Confirm with `emulator -list-avds`. The names must match exactly, the pipeline fails fast
and prints what it did find if they do not.

## Step 1: build the app once per platform

Store frames are captured from **release** builds so no dev overlay, Metro banner, or
LogBox warning can land in a submitted screenshot. The pipeline defaults to release and
refuses to start without the binary.

```bash
pnpm exec detox build --configuration ios.sim.release
pnpm exec detox build --configuration android.emu.release   # only if shipping to Play now
```

The pipeline installs the built app onto each device itself, so you do not need to install
anything by hand.

## Step 2: verify the capture wiring (60 seconds)

Do this before burning an hour on a full run. It boots one simulator, launches the app,
takes one throwaway frame, and proves the whole capture → copy chain works.

```bash
pnpm screenshots:verify
```

Output lands in `captures/ios/iphone-17-pro-max/verify/` and is never mixed with store
frames. If this passes, a full run will not fail on plumbing.

## Step 3: capture

```bash
pnpm screenshots:required      # the three classes the stores require
```

Or one class at a time, which is easier to babysit:

```bash
pnpm exec tsx scripts/screenshots/pipeline.ts iphone-17-pro-max
pnpm exec tsx scripts/screenshots/pipeline.ts ipad-pro-13
pnpm exec tsx scripts/screenshots/pipeline.ts phone
```

Other targets: `all`, `ios`, `android`, or any single class name from the table above.
Add `--debug` to capture from a debug build instead (needs Metro running; not for
submission).

## Step 4: collect the output

```
store-listing/screenshots/captures/<platform>/<class>/
  raw/     unretouched device captures
  final/   composited, exactly the canvas size in the table, upload these
```

Upload `final/` contents:

- App Store Connect → 6.9" iPhone slot ← `ios/iphone-17-pro-max/final/`
- App Store Connect → 13" iPad slot ← `ios/ipad-pro-13/final/`
- Play Console → phone screenshots ← `android/phone/final/`

Both stores accept up to 8 screenshots per slot; the pipeline produces 5.

Re-run just the compositing (no simulator needed) after a heading or subhead edit:

```bash
pnpm screenshots:composite
```

## The five frames

| File                  | Spec                                | Heading                  |
| --------------------- | ----------------------------------- | ------------------------ |
| `01-local-demo-chat`  | `01-multi-provider.spec.ts`         | Local chat first         |
| `02-onboarding-local` | `02-onboarding-local.spec.ts`       | Start without an account |
| `03-first-message`    | `03-chat-first-message.spec.ts`     | Chat with local models   |
| `04-cloud-sign-in`    | `04-mode-toggle-to-sign-in.spec.ts` | Sign in for Cloud        |
| `06-voice-recording`  | `06-voice-record-and-send.spec.ts`  | Hold to speak            |

Headings and subheads live in `scripts/screenshots/catalog.ts` and are the single source of
truth for both the pipeline and the compositor.

## Troubleshooting

**`No ios release binary at …`**, run the Step 1 build for that platform.

**`No available simulator named "…"`**, create it in Xcode → Windows → Devices and
Simulators. When a name exists on several runtimes the pipeline picks the newest one by
UDID, so duplicates are not ambiguous.

**`No Android AVD named "pixel_8_api_34"`**, run the One-time setup command above. The
error lists every AVD the emulator actually reports.

**`Detox produced no "<id>-<name>.png"`**, the spec's `device.takeScreenshot()` argument
must equal `<id>-<name>` from `catalog.ts`. The error prints what Detox did write.
`pipeline.test.ts` enforces this pairing, so it should never happen after a green test run.

**Emulator never finishes booting**, the pipeline polls `sys.boot_completed` for 5
minutes before giving up. A cold first boot of a new AVD can exceed that; boot it once by
hand (`emulator -avd pixel_8_api_34`) and re-run.

## Do not run this while other agents are working

A full `all` run boots six devices and drives 30 Detox sessions. Run it on an otherwise
idle machine.
