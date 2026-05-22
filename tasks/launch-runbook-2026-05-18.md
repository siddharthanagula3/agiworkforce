# AGI Mobile v1 — Founder Hardware Runbook

**Audience:** Siddhartha (solo founder, AGI Automation LLC)
**Last updated:** 2026-05-18
**Branch:** `claude/refine-local-plan-yhjFU` (also serves as base for reorg worktrees)
**Status:** All AI-completable work shipped. The five items below need YOU at the machine.

---

## What's been done before this runbook

- 1035 mobile tests passing · 0 typecheck errors · Metro bundle clean (4288 modules → 7.3 MB iOS bundle)
- All Wave 0 + Wave 2 features built and committed: chat, image+question, voice, OCR/scan, translate, memory, HealthKit, compare, performance, App Intents, age-gate + minor-safe + report/flag, 4K context budgeting, Hindi QA suite, on-device cloud waitlist
- All 4 Wave 2 iOS native modules wired through Expo config plugins; Info.plist + entitlements set
- `@agiworkforce/compliance` package committed (was a latent fresh-clone ship blocker)
- Reorg pilot proven on `waitlist` feature in a separate worktree (Phase 3 of the reorg plan); 5 more phases scheduled

---

## Item #1 — `pnpm install` (~1 min)

```bash
cd /Users/siddhartha/Desktop/agiworkforce
pnpm install
```

Confirm exit 0. If any peer-dep warnings show, ignore — already audited.

---

## Item #2 — `expo prebuild` (~3-5 min)

This generates the `ios/` and `android/` directories using the Expo config plugins we wired:

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile
npx expo prebuild
```

What it does:

- Generates `ios/` with the Swift native modules (AGIFoundationModels, AGIVisionOCR, AGITranslate, AGIAppIntents) copied into the Xcode project via `withAGINativeModulesIOS.cjs`
- Generates `android/` with AICore + Translate + VisionOCR Kotlin packages registered in MainApplication.kt + gradle deps wired via the 3 Android config plugins
- Adds Info.plist entries (HealthKit, Speech, Translation, NSUserActivityTypes for App Intents)
- Adds entitlements (`com.apple.developer.siri`, `com.apple.developer.natural-language.translation`)

If prebuild fails, expected causes + fixes:

- "Plugin not found" → run `pnpm install` first
- "Pod install warning" → safe, runs after prebuild
- "Xcode project format unrecognized" → ensure Xcode 16+ installed

DO NOT commit the generated `ios/` and `android/` dirs — they're in `.gitignore`.

---

## Item #3 — `pod install` for iOS (~5-8 min, first time)

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile/ios
pod install
```

If pods are stale:

```bash
pod deintegrate && pod install --repo-update
```

---

## Item #4 — Wire Xcode targets for App Intents (~5 min)

The App Intents Swift files were copied into `ios/<AppName>/AGIAppIntents/` by the config plugin, but the AGIAppIntentsTests XCTest target needs manual wiring because Expo doesn't generate XCTest targets.

```bash
open ios/agiworkforce.xcworkspace
```

In Xcode:

1. **File → New → Target → Unit Testing Bundle**
2. Name: `AGIAppIntentsTests`. Target to be tested: the main app target.
3. In the new target's Build Phases, add `apps/mobile/native/ios/AGIAppIntentsTests/*.swift` to "Compile Sources" — drag-drop or right-click + "Add Files to AGIAppIntentsTests"
4. Verify the main app target has these files in Compile Sources:
   - `AGIIntentDispatch.swift`
   - All 8 intent verb files (StartChatIntent, AskAGIIntent, SummarizeIntent, AnalyzeImageIntent, TranscribeIntent, TranslateIntent, ScanIntent, SetReminderIntent)
   - `AppShortcuts.swift`
5. Add to the main target's Info.plist (already added via Expo plugin — verify):
   ```
   NSUserActivityTypes = ['INSendMessageIntent', 'com.agiworkforce.app.intent']
   ```
6. Enable Siri capability in the main target's "Signing & Capabilities" → +Capability → Siri

You can skip this step on first run if you only want to test the core app. App Intents enables Siri / Visual Intelligence / Spotlight integration. Without it, the app still works.

---

## Item #5 — EAS init + App Store Connect + Play Console (Task #19; ~30-60 min)

This is the formal step that opens the door to TestFlight + Play Internal Testing.

### 5a. EAS project init

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile
npx eas init
```

Captures a real `projectId` UUID and writes it to `app.config.js` (currently the placeholder `agi-workforce` is there).

### 5b. Apple Developer / App Store Connect

You must do this manually in a browser at https://appstoreconnect.apple.com:

1. **Bundle ID**: `com.agiworkforce.app` — register at https://developer.apple.com/account/resources/identifiers if not already
2. **Create App Record**: App Store Connect → My Apps → +. Bundle ID = `com.agiworkforce.app`. Name = "AGI". SKU = `agi-mobile-v1`.
3. **Capabilities to enable** in your provisioning profile:
   - HealthKit
   - Siri
   - Push Notifications (deferred to v1.1 but enable now to avoid re-provisioning)
   - Background Modes — Background fetch (for compliance ledger sync once cloud opens)
4. **Reviewer notes** — copy verbatim from `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md`
5. **App icon** — 1024×1024, owner is marketing-engineer; wave-4 deliverable
6. **30 iOS screenshots** — wave-4 (app-store-engineer captures via Detox + R2 design assets)

### 5c. Google Play Console

At https://play.google.com/console:

1. **Application ID**: `com.agiworkforce.app`
2. **Create App Record**: Default language English (US). India is launch market.
3. **Reviewer notes** — copy from `apps/mobile/store-listing/REVIEWER-NOTES-ANDROID.md`
4. **18 Android screenshots** — wave-4 deliverable
5. **Feature graphic** — wave-4

### 5d. EAS secrets

The `apps/mobile/secrets/` directory expects you to place:

- `AuthKey_<KeyID>.p8` from App Store Connect → Users and Access → Keys
- `service-account.json` from Google Play Console → API access

Refer to `apps/mobile/scripts/release/EAS_SIGNING_RUNBOOK.md` for the canonical instructions (it was authored by smoke-test-prep-engineer with exact paths and validation steps).

### 5e. First TestFlight build

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile
npx eas build --profile preview --platform ios
```

This is the smoke-build. Approx 15-20 min on EAS cloud. Output: an .ipa you can install on a test device via TestFlight.

For Android Internal Testing:

```bash
npx eas build --profile preview --platform android
```

---

## Item #6 — Wave 0 device smoke test (Task #12; ~10 min/platform)

smoke-test-prep-engineer authored a self-contained kit at `apps/mobile/scripts/wave0-smoke/`. Run:

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile/scripts/wave0-smoke
bash ios-smoke.sh
# follow the README.md 7-step procedure on a physical iPhone

# then on Android
bash android-smoke.sh
# follow the same README.md procedure on a Pixel/Galaxy
```

Important constraint (caught by smoke-test-prep-engineer): **Apple Foundation Models gates on `iOS 26.0+` which is not yet on shipping hardware (current is iOS 18.x).** So the iPhone smoke test actually exercises Tier 2 (executorch) or Tier 3 (llama.rn), not Tier 1 (Apple FM). Same applies for Android AICore — only Pixel 8+/Galaxy S24+ have AICore. On older Pixels, the app falls through to Tier 2/3.

This is correct expected behavior. Document the actual route in the SMOKE-TEST-LOG.template.md.

---

## Item #7 — Hindi QA on-device (Task #31; ~30 min)

After the app installs and the default Qwen3-4B-Instruct-2507 model downloads:

1. Settings → Performance → "Run Hindi QA test"
2. The 60-prompt suite from `tasks/research/HINDI-QA-MATRIX-2026-05-18.md` runs against the loaded model
3. Score each output against the `expectedCriteria` (human eval for the 36 prompts that require it; auto BLEU/chrF for the 24 translation prompts)
4. Set `HINDI_ACCEPTANCE_THRESHOLD` in `apps/mobile/services/languageQA.ts` based on observed quality
5. If below threshold, follow the fallback decision tree in `docs/launch/HINDI-LAUNCH-CHECKLIST.md` (defer Hindi marketing to v1.1, or swap default model)

---

## Item #8 — TestFlight beta opens (Wave 4)

Open ~Jul 13 with 50-100 invitees (India + EU mix per GTM playbook). Use `eas submit` after `eas build`:

```bash
cd /Users/siddhartha/Desktop/agiworkforce/apps/mobile
npx eas submit --profile preview --platform ios   # → TestFlight
npx eas submit --profile preview --platform android # → Play Internal Testing
```

---

## Verification ladder (each green before moving on)

- [ ] Item #1 succeeds (pnpm install exit 0)
- [ ] Item #2 succeeds (expo prebuild generates ios/ + android/)
- [ ] Item #3 succeeds (pod install exit 0)
- [ ] Item #4 done (Xcode opens, AGIAppIntentsTests target builds)
- [ ] Item #5a-5e done (EAS projectId real, store records exist, secrets in place, first build green)
- [ ] Item #6 done (iPhone + Pixel smoke logs filled, GO/NO-GO verdict)
- [ ] Item #7 done (Hindi QA scored, threshold set or fallback chosen)
- [ ] Item #8 done (TestFlight + Play Internal Testing both live)

---

## Where to find canonical info

- Build runbook: `apps/mobile/scripts/release/README.md`
- Signing runbook: `apps/mobile/scripts/release/EAS_SIGNING_RUNBOOK.md`
- Store listing copy: `apps/mobile/store-listing/`
- Reviewer notes (iOS + Android): `apps/mobile/store-listing/REVIEWER-NOTES-{IOS,ANDROID}.md`
- Review defense pack: `apps/mobile/store-listing/REVIEW-DEFENSE-PACK.md`
- Kill switches: `apps/mobile/store-listing/KILL-SWITCH.md`
- Wave 0 smoke kit: `apps/mobile/scripts/wave0-smoke/{README,ios-smoke.sh,android-smoke.sh,SMOKE-TEST-LOG.template.md}`
- Hindi launch checklist: `docs/launch/HINDI-LAUNCH-CHECKLIST.md`
- v1 launch checklist: `tasks/launch-checklist-2026-07-18.md`
- Master plan: `~/.claude/plans/here-is-the-approved-ancient-clover.md`

---

## Reorg phases running in parallel (don't touch, just know they exist)

- Phase 3 (mobile pilot): worktree `/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot` — DONE, expanding to feedback + compare
- Phase 4 (shared contracts): worktree `/Users/siddhartha/Desktop/agiworkforce-phase4-contracts` — running
- Phase 5 web: worktree `/Users/siddhartha/Desktop/agiworkforce-phase5-web` — running
- Phase 5 desktop: worktree `/Users/siddhartha/Desktop/agiworkforce-phase5-desktop` — running
- Phase 6 CLI: worktree `/Users/siddhartha/Desktop/agiworkforce-phase6-cli` — running
- Phase 6 Chrome ext: worktree `/Users/siddhartha/Desktop/agiworkforce-phase6-chrome` — running
- Phase 6 VS Code ext: worktree `/Users/siddhartha/Desktop/agiworkforce-phase6-vscode` — running
- Phase 7 alias scout: running in main tree
- Phase 8 enforcement prototyper: running in main tree

Founder review on each worktree branch happens after each Phase reports STOP.
