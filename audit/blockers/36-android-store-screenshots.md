# No Android store screenshot has been captured

Lifted on 2026-09-27 from "Android: required, not yet done" in `apps/mobile/store-listing/screenshots/RUNBOOK.md`. Delete this file when the Play listing has its phone screenshots.

The Android SDK and the `android-34` ARM64 system image are installed on the capture machine, but no AVD exists, so the screenshot pipeline has never produced an Android frame and the Play Store listing has none. The fix is the one-time setup in the runbook's "Android" section: create the `pixel_8_api_34` phone AVD (and `pixel_tablet_api_34` if the Play large-screen listing is wanted), confirm it with `emulator -list-avds`, build the release app, and run the pipeline for Android. The AVD names must match exactly; the pipeline fails fast and prints what it found when they do not.
