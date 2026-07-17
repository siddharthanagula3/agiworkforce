# Wave 0 Smoke Test — Founder Runbook

**Goal:** Validate that the app cold-launches, onboards, downloads Qwen3-4B-Instruct-2507, and runs
local inference end-to-end on real hardware before any beta invite goes out.

**Time:** ~10 min iPhone · ~10 min Pixel  
**Who runs this:** Founder (you) — no agents involved. This is a real-device test.

---

## Prerequisites

### Mac workstation

| Tool              | Min version | Check                 |
| ----------------- | ----------- | --------------------- |
| Xcode             | 16.0        | `xcodebuild -version` |
| iOS SDK           | 15.1        | bundled with Xcode 16 |
| Android SDK / ADB | API 31      | `adb version`         |
| EAS CLI           | 13.0        | `eas --version`       |
| Node              | 22.x        | `node --version`      |
| pnpm              | 9.15.3      | `pnpm --version`      |
| Expo account      | any         | `eas whoami`          |

Install EAS CLI if missing:

```sh
npm install -g eas-cli
eas login          # log in with your Expo account
```

### Devices

- **iPhone** running iOS 15.1 or later (iPhone 12 or newer recommended for Tier 1 detection)
- **Pixel** running Android 12 (API 31) or later — USB debugging enabled, developer options on
- USB cable or wireless debugging configured for both

Enable USB debugging on Pixel: **Settings → About phone → tap Build number 7× → Developer options → USB debugging ON**.

---

## Step 1 — Run the pre-test scripts

Open two terminal tabs (or run sequentially).

### iOS

```sh
bash /Users/siddhartha/Desktop/agiworkforce/apps/mobile/scripts/wave0-smoke/ios-smoke.sh
```

The script will:

1. Verify toolchain
2. Build a dev client via EAS (cloud build, ~10 min first time)
3. Print install instructions with your build URL

### Android

```sh
bash /Users/siddhartha/Desktop/agiworkforce/apps/mobile/scripts/wave0-smoke/android-smoke.sh
```

Same shape for Android.

**While the builds run** you can read the procedure below so you're ready to tap.

---

## iPhone Smoke Procedure (7 steps)

After installing the dev client from the build URL:

### Step 1 — Cold launch

1. Force-quit the app if it was open: swipe up from the bottom, swipe the app card away
2. Tap the AGI icon
3. Start timer when you tap
4. **PASS** if the AGI splash / onboarding hero appears in under 4 seconds
5. **FAIL** if it takes more than 4 s or shows a blank screen

### Step 2 — Onboarding hero

Look at the first screen that appears. Verify all of the following:

- [ ] Tagline reads exactly: **"AGI runs on your device."**
- [ ] Trust chip reads: **"AGI Automation LLC, USA"**
- [ ] DPDP Act badge / chip is present
- [ ] "Start chatting" button is visible at the bottom

**PASS** if all four bullets are checked. **FAIL** if any text differs or button is missing.

### Step 3 — Disclosure modal (Article 50)

1. Tap **"Start chatting"**
2. A modal must appear **before** the next screen loads
3. Verify modal contains:
   - A list of AI providers (Anthropic, OpenAI, Google, xAI, Perplexity, Mistral)
   - "Article 50" or "Article 50(1)" language
   - An "Accept" / "Agree" button

**PASS** if modal appears and contains provider list + Article 50 language.  
**FAIL** if tapping "Start chatting" goes directly to the next screen without showing the modal.

### Step 4 — Device-tier detection

1. Tap **Accept** on the disclosure modal
2. The device-tier screen should appear
3. Verify:
   - Device model name is shown (e.g. "iPhone 15 Pro")
   - RAM tier is detected (Tier 1, 2, or 3)
   - A model recommendation is shown (should be Qwen3-4B-Instruct-2507 for Tier 2/3, or Apple Foundation Models for Tier 1)

**PASS** if device info is populated and a model is recommended.  
**FAIL** if the screen is blank, shows "unknown", or crashes.

### Step 5 — Download model

1. Tap **"Download model"**
2. A progress indicator must appear (progress bar or percentage)
3. Verify:
   - Model name shown: **Qwen3-4B-Instruct-2507**
   - Approximate file size shown (~2 GB)
   - Download progress updates (does not stay stuck at 0%)

**NOTE:** If device is Tier 1 (Apple Foundation Models), there is no download step — the model is built into iOS. Skip to Step 6 and note "Tier 1 — no download" in the log.

**PASS** if download starts and progress moves.  
**FAIL** if tapping the button does nothing, progress stays at 0% for 30+ seconds (check network), or app crashes.

### Step 6 — Chat empty state

After download completes (or for Tier 1 after the detection screen), the chat view should appear.

Verify:

- [ ] On-device shield badge is visible in the header (shield icon or "On-device" chip)
- [ ] ModeToggle shows "On-device" as active, "Cloud" as locked (lock icon)
- [ ] Empty chat state with a prompt or example messages visible

**PASS** if all three bullets checked.  
**FAIL** if chat loads but shield/badge is missing, or Cloud shows as active.

### Step 7 — First inference

1. Tap the message input
2. Type: **hello**
3. Tap send
4. Start timer when you tap send

Verify:

- [ ] A streaming response appears (text appears progressively, not all at once)
- [ ] PerformanceChip appears below the assistant response
- [ ] PerformanceChip shows tok/s (e.g. "22 t/s") and ttft in ms
- [ ] The response is coherent (a greeting, not garbled text)

**PASS** if streaming response with PerformanceChip appears in under 30 seconds.  
**FAIL** if nothing appears after 30 s, the response is garbled, or the app hangs.

---

## Extended procedure — Cloud sign-in (3 steps)

Run this after the 7-step core procedure passes. Managed Cloud is public alpha and open by
default (founder decision 2026-06-27, PA-2): signing in IS the entitlement — there is no
invite code or waitlist step. `CloudWaitlistSheet`/`InviteCodeModal` still exist in the
codebase but are not part of this flow; do not expect them to appear here.

### Step 8 — Tap Cloud chip (signed out)

1. In the chat header, tap the **Cloud** segment (with lock icon)
2. The app must route straight to the sign-in screen (`/(auth)/login`)

**PASS** if the sign-in screen appears.

**FAIL** if a waitlist sheet, invite-code modal, or dead toggle appears instead.

### Step 9 — Complete sign-in

1. Sign in with a real or test Clerk account
2. The app should return to chat with Cloud mode active, with no separate confirmation step

**PASS** if `cloudUnlocked` flips and Cloud mode activates automatically (`ClerkTokenBridge`).

**FAIL** if the user is stuck on the sign-in screen, or Cloud stays locked after a successful sign-in.

### Step 10 — Header chip updated

After sign-in, look at the chat header ModeToggle:

- [ ] Cloud segment now shows an unlocked/active state (no lock icon)
- [ ] The default cloud model for the account's tier is selected

**PASS** if Cloud shows unlocked and a real model is selected.

**FAIL** if the lock icon persists or no model is selected.

---

## Android-specific variations

The procedure is identical for Pixel with these differences:

- Tier 1 (Apple Foundation Models) is not available on Android. The device will always
  land on Tier 2 or Tier 3 → model download is required.
- If AICore / Android AI (Gemini Nano on-device) is detected, Tier 2 applies. Otherwise Tier 3.
- PerformanceChip will show a different tok/s range than iPhone — this is expected.
- Biometric unlock (if tested) uses fingerprint on Pixel, Face ID on iPhone.

---

## Failure-mode triage

| Symptom                              | First thing to try                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App crashes on launch                | Check Metro logs: `adb logcat -s ReactNativeJS` or Xcode console. Common: missing env var in app.config.js                                                         |
| Cold-launch > 4 s                    | Restart the device (not just the app). First launch after install is always slower due to AOT compilation                                                          |
| Disclosure modal doesn't appear      | Check `MMKV` key `disclosure_accepted` — if set from a previous install, clear app data (iOS: Settings → AGI → Reset; Android: Settings → Apps → AGI → Clear data) |
| Device-tier screen blank / "unknown" | `detectCapabilities()` in `@agiworkforce/local-llm` may be throwing. Check Xcode console for "detectCapabilities error"                                            |
| Model download stuck at 0%           | Network issue or stub not wired. In v1 (Wave 0), the download is a simulated timer — if the timer doesn't start, check `onboarding.tsx` `handleDownloadStart`      |
| First token never arrives            | LLMController initialization. Check `lib/llmController.ts` — model path may not match download path                                                                |
| App crashes during inference         | Memory pressure on low-RAM device. Try Tier 3 (llama.rn) fallback. Report model name + device RAM                                                                  |
| Article 50 modal doesn't appear      | `composeFirstRunDisclosure` returned null — check `@agiworkforce/compliance` package build. Run `pnpm typecheck` in `apps/mobile`                                  |
| Cloud sign-in doesn't unlock Cloud   | Clerk auth or `ClerkTokenBridge` may be failing to flip `cloudUnlocked`. Check network/auth logs and verify the Clerk session token before launch                  |

---

## After the test

1. Fill in `SMOKE-TEST-LOG.template.md` with your results
2. Screenshot or record video of any failures
3. If all 7 core steps PASS, Wave 0 is GO for alpha invite list
4. Report defects in `tasks/todo.md` with device model, OS version, and reproduction steps
