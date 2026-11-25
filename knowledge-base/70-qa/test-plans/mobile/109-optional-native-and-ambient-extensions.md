---
id: "PLAN-mobile-109"
type: "test-plan"
title: "Mobile · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "109"
---
# Mobile · 109. Optional native and ambient extensions

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.03 Menu-bar quick actions.

- **Expected:** A menu-bar (or equivalent quick menu) offers one-click AGI actions such as new chat, quick ask, screenshot and voice.
- **Code:** done. Evidence present: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77; apps/mobile/native/android/widget/AGIQuickActionsWidget.kt:12; apps/mobile/native/ios/withAGIWidgets.cjs:108
- **Where to find it:** Home screen > add widget > AGI Mobile (iPhone widget or Android widget), then tap New chat, Camera or Voice on the widget. Quick-action widget and long-press app shortcuts also list New chat, Voice and Camera. There is no Mac menu-bar item in apps/mobile. (labels found in the code)
- **Needs:** a phone with the AGI Mobile app installed (iPhone or Android); no Mac menu bar exists in this app
- **Steps:**
  1. Long-press an empty spot on the home screen and add the AGI Mobile widget (medium size shows New chat, Camera and Voice; small size shows New chat).
  2. Tap New chat on the widget and check that the chat screen opens.
  3. Go back to the home screen, tap Camera on the widget and check that the camera screen opens.
  4. Tap Voice on the widget and check that voice mode opens (or the chat screen if on-device speech recognition is not available).

## S109.04 Desktop companion.

- **Expected:** A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:130 (quoted code not found in the file now); apps/mobile/app/(app)/companion/index.tsx:170
- **Where to find it:** not found in the code. Feature is off in this build: apps/mobile/lib/v1FeatureFlags.ts sets companion: false and dispatch: false. The companion screen (apps/mobile/app/(app)/companion/index.tsx) returns early when these flags are off, and the Settings Remote control section with Connections is shown only when FEATURES.companion is on. The drawer 'Code' entry only matches the companion path. Nothing reachable found.
- **Needs:** a paired desktop (not available in v1)

## S109.07 Global dictation.

- **Expected:** Dictation to AGI can be started from anywhere on the device (global shortcut or system voice command) without first opening the app.
- **Code:** done. Evidence present: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77; apps/mobile/app/_layout.tsx:219
- **Where to find it:** Siri: say 'Talk to AGI Mobile' or 'Ask AGI Mobile' (Siri shortcut 'Ask AGI'). Turn on first: Settings > Security and login > Ask from Siri. (labels found in the code)
- **Needs:** an iPhone with Siri, a signed-in AGI Cloud account, and Ask from Siri turned on
- **Steps:**
  1. Open Settings, then Security and login, and turn on Ask from Siri (this needs AGI Cloud mode; the switch says to switch to Cloud mode otherwise).
  2. Close the app to the home screen so it is not open.
  3. Activate Siri (hold the side button or say 'Hey Siri') and say 'Talk to AGI Mobile', then say a question.
  4. Check that Siri answers out loud and the answer is saved as a chat, without the app opening.

## S109.11 Hardware shortcut/macropad integration.

- **Expected:** A hardware button or macropad (Stream Deck, iPhone Action Button, etc.) can trigger AGI actions through a supported integration.
- **Code:** done. Evidence present: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90
- **Where to find it:** iPhone Control Center or Action Button: add the control 'AGI Mobile' (control named Open AGI Mobile); then press the control or Action Button to open AGI Mobile. No Stream Deck or macropad integration was found. (labels found in the code)
- **Needs:** an iPhone running iOS 18 or later (the control is declared only for iOS 18+); a Stream Deck or macropad is not supported
- **Steps:**
  1. On an iPhone with iOS 18 or later, add the AGI Mobile control to Control Center or the Lock Screen (the OS shows it as Open AGI Mobile).
  2. Assign it to the Action Button if you want a hardware press (OS setting).
  3. Press the control or Action Button with the phone locked or unlocked.
  4. Check that AGI Mobile opens to the app.

## S109.13 Headset/earbud invocation.

- **Expected:** The user can start talking to AGI from a headset or earbuds (button or voice command) without touching the phone or computer.
- **Code:** done. Evidence present: apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:11; apps/web/app/api/mobile/intent/ask/route.ts:26; apps/web/lib/server/mobile-intent.ts:221
- **Where to find it:** Siri via headset: say 'Talk to AGI Mobile' (or 'Ask AGI Mobile') with earbuds or a headset connected; turn on first in Settings > Security and login > Ask from Siri. (labels found in the code)
- **Needs:** an iPhone with Siri, AGI Cloud signed in, Ask from Siri turned on, and earbuds or a headset
- **Steps:**
  1. Open Settings, then Security and login, and turn on Ask from Siri (needs AGI Cloud mode).
  2. Connect the headset or earbuds to the iPhone.
  3. Trigger Siri with the headset button or voice (OS behavior), then say 'Talk to AGI Mobile' and ask a question.
  4. Check that the answer is spoken back and saved as a chat, with the phone not opened.

## S109.18 Local-model download manager.

- **Expected:** The user can browse, download (with progress, pause/cancel) and install local models from inside the app.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:350 (quoted code not found in the file now); apps/mobile/src/features/model-picker/components/ModelRow.tsx:124; apps/mobile/services/modelDownload.ts:432
- **Where to find it:** Settings > General > Models (opens the models screen), then tap a local model row with the Download badge. (some labels not found in the code; trust the screen)
- **Needs:** a phone with enough storage for a local model; a Free or paid account (no subscription needed for the local model download)
- **Steps:**
  1. Open Settings, then General, then tap Models.
  2. Find an on-device model row showing the Download badge and tap it (tap to download; long press to favourite).
  3. Watch the row while it downloads; the row shows the downloading state (progress appears only in the accessibility label).
  4. Tap Cancel download on the row and check that the download stops and the badge returns.

## S109.19 Local-model storage manager.

- **Expected:** The user can see how much space each local model uses and delete models to free storage.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/storage.tsx:446; apps/mobile/app/(app)/settings/storage.tsx:112 (quoted code not found in the file now)
- **Where to find it:** Settings > Storage (or Settings > General > Storage), then find Downloaded Models and tap the trash button on a model row. (labels found in the code)
- **Needs:** at least one downloaded local model
- **Steps:**
  1. Open Settings, then Storage (or General, then Storage).
  2. Read the Downloaded models (estimated) row and the Estimated size under each model in Downloaded Models.
  3. Tap the trash button on a model row and read the Delete dialog that names the model.
  4. Tap Delete and check that the model is removed and the Downloaded models (estimated) total goes down.

## S109.20 Local hardware-capability panel.

- **Expected:** The app shows the device's hardware capability for local models (RAM, accelerators, supported runtimes).
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/performance.tsx:685; apps/mobile/app/(app)/settings/performance.tsx:378
- **Where to find it:** Settings > General > Performance, then read the Capabilities row (tier label, RAM and runtimes). (labels found in the code)
- **Needs:** none (reads the device; a local model is not needed to see the panel)
- **Steps:**
  1. Open Settings, then General, then tap Performance.
  2. Read the tier badge and description at the top of the screen (device tier and ExecuTorch needs 3.5 GB RAM note).
  3. Find the RAM row and compare it with the device's memory.
  4. Find the Capabilities row and check the listed runtimes (AICore, ExecuTorch, llama.rn or Apple FM).

## S109.21 Model loading/unloading controls.

- **Expected:** The user can load a local model into memory and unload it to free resources.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/performance.tsx:503; packages/platform/local-llm/src/selector.ts:165
- **Where to find it:** Settings > General > Performance, then tap Load (or Unload local models) under the selected local model. (labels found in the code)
- **Needs:** a downloaded local model selected on the Performance screen
- **Steps:**
  1. Open Settings, then General, then tap Performance.
  2. Read the status line under the selected model (Not loaded; an installed model loads on use).
  3. Tap Load and wait; the status changes to Loaded in memory.
  4. Tap Unload local models and check the status returns to not loaded.

## S109.22 Local runtime health.

- **Expected:** The app shows whether the local model runtime is running and healthy, with errors when it is not.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/performance.tsx:753; packages/platform/local-llm/src/selector.ts:165
- **Where to find it:** Settings > General > Performance, then read the status line under the local model (Loaded in memory, Working…, or Failed to load/unload with the message). (labels found in the code)
- **Needs:** a downloaded local model; a failure needs a model that cannot load (for example one that is not on the device)
- **Steps:**
  1. Open Settings, then General, then tap Performance.
  2. Read the status line under the selected local model.
  3. Tap Load; while it works the status shows Working….
  4. Check the result: Loaded in memory when healthy, or a Failed to ... message with the error text when the runtime fails.

## S109.25 Local resource/compute dashboard.

- **Expected:** A dashboard shows local compute use: speed (tokens/s), latency, memory and thermal state over time.
- **Code:** partial. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:3143
- **Known to be unfinished:** tok/s, first-token latency and thermal state now recorded for every local reply; peak memory stays 0 because no runtime reports it and no memory sampler is installed (needs a native module or an approved dependency)
- **Where to find it:** Settings > General > Performance, then scroll to the stats rows (avg tok/s, avg TTFT, mem peak, thermal) and the Run Benchmark button. (labels found in the code)
- **Needs:** a downloaded local model, and at least one local reply or a benchmark run
- **Steps:**
  1. Open Settings, then General, then tap Performance.
  2. Use a local model for a reply, or tap Run Benchmark, to create data.
  3. Scroll to the stats rows: avg tok/s, avg TTFT, mem peak and thermal.
  4. Compare the tok/s and TTFT values with the reply; mem peak may show no value because no runtime reports peak memory.
