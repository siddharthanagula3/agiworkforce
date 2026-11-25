# Area 109. Optional native and ambient extensions

25 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S109.01 Home-screen widgets.
- Should: The user can add an AGI widget to the phone or desktop home screen that shows content or starts an action.
- Status: desktop missing, mobile missing

## S109.02 Lock-screen widgets.
- Should: The phone lock screen can show an AGI widget or start an AGI action without unlocking.
- Status: mobile missing

## S109.03 Menu-bar quick actions.
- Should: A menu-bar (or equivalent quick menu) offers one-click AGI actions such as new chat, quick ask, screenshot and voice.
- Status: desktop done, mobile done
- Code: apps/desktop/electron/tray.ts:93; apps/desktop/electron/main.ts:1120; apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77; apps/mobile/native/android/widget/AGIQuickActionsWidget.kt:12; apps/mobile/native/ios/withAGIWidgets.cjs:99

## S109.04 Desktop companion.
- Should: A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone.
- Status: desktop done, mobile done, vscode done
- Code: apps/web/features/desktop-host/components/RemoteControlSection.tsx:199; apps/desktop/electron/remote/remoteControlService.ts:32; apps/mobile/src/features/drawer/components/DrawerContent.tsx:130; apps/mobile/app/(app)/companion/index.tsx:146; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:166; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:330

## S109.05 Compact floating assistant.
- Should: A compact assistant floats over other content (other apps or pages) and can take a prompt without opening the full app.
- Status: desktop done, mobile missing, chrome done
- Code: apps/desktop/electron/appMenu.ts:101; apps/desktop/electron/quickAsk.ts:12; apps/extension/src/inPagePanel/setup.ts:60; apps/extension/src/features/content/in-page-panel/panel.ts:160; apps/extension/src/background.ts:3833

## S109.06 Optional animated companion/pet.
- Should: An optional animated companion or pet character can be shown.
- Status: not applicable anywhere

## S109.07 Global dictation.
- Should: Dictation to AGI can be started from anywhere on the device (global shortcut or system voice command) without first opening the app.
- Status: desktop done, mobile done, chrome missing
- Code: apps/desktop/electron/quickAsk.ts:13; apps/desktop/electron/quickAsk.ts:39; apps/desktop/electron/main.ts:1525; apps/desktop/electron/voiceDictation.ts:42; apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77; apps/mobile/app/_layout.tsx:579

## S109.08 Selected-text rewrite shortcut.
- Should: Text selected in any app can be rewritten by AGI with a shortcut and the result put back in place.
- Status: desktop missing

## S109.09 Screenshot-to-chat shortcut.
- Should: A shortcut captures the screen and attaches it to an AGI chat.
- Status: desktop done, chrome done
- Code: apps/desktop/electron/appMenu.ts:108; apps/desktop/electron/screenshot.ts:61; apps/desktop/electron/shortcuts.ts:84; apps/extension/manifest.json:75; apps/desktop/electron/browser/bridgeServer.ts:521; apps/desktop/electron/main.ts:352

## S109.10 Window-to-chat shortcut.
- Should: A shortcut captures one chosen window (not the whole screen) into an AGI chat.
- Status: desktop done
- Code: packages/contracts/local-runtime/src/host-bridge.ts:70; apps/desktop/electron/screenshot.ts:95; apps/desktop/electron/screenshot.ts:118; apps/desktop/electron/main.ts:1190; apps/desktop/electron/native/macos/agi-input.swift:217; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:71

## S109.11 Hardware shortcut/macropad integration.
- Should: A hardware button or macropad (Stream Deck, iPhone Action Button, etc.) can trigger AGI actions through a supported integration.
- Status: desktop missing, mobile done, chrome missing
- Code: apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:98

## S109.12 Wearable voice access.
- Should: The user can talk to AGI from a smartwatch or other wearable.
- Status: mobile missing

## S109.13 Headset/earbud invocation.
- Should: The user can start talking to AGI from a headset or earbuds (button or voice command) without touching the phone or computer.
- Status: desktop missing, mobile done
- Code: apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:11; apps/web/app/api/mobile/intent/ask/route.ts:24; apps/web/lib/server/mobile-intent.ts:161

## S109.14 Automotive voice surface.
- Should: The user can use AGI by voice through an in-car system (CarPlay, Android Auto).
- Status: not applicable anywhere

## S109.15 Telephone access.
- Should: The user can reach AGI by calling or texting a phone number.
- Status: web missing

## S109.16 Messaging-platform access.
- Should: The user can talk to AGI from a messaging platform (Slack, Teams, WhatsApp, Telegram) and get answers there.
- Status: web partial
- Code: apps/web/app/api/github/webhook/route.ts:253
- Unfinished: web: owner: create the Slack app per docs/runbooks/connector-oauth-apps.md:249-256 (bot scopes only), set SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET and SLACK_SIGNING_SECRET, subscribe to app_mention and message.im; migration 0333 must be applied before deploy

## S109.17 Spatial/XR interface.
- Should: AGI offers a spatial or XR interface (Vision Pro, Quest).
- Status: mobile missing

## S109.18 Local-model download manager.
- Should: The user can browse, download (with progress, pause/cancel) and install local models from inside the app.
- Status: mobile done, cli missing, vscode missing
- Code: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:350; apps/mobile/src/features/model-picker/components/ModelRow.tsx:85; apps/mobile/services/modelDownload.ts:352

## S109.19 Local-model storage manager.
- Should: The user can see how much space each local model uses and delete models to free storage.
- Status: mobile done, cli missing, vscode missing
- Code: apps/mobile/app/(app)/settings/storage.tsx:352; apps/mobile/app/(app)/settings/storage.tsx:112

## S109.20 Local hardware-capability panel.
- Should: The app shows the device's hardware capability for local models (RAM, accelerators, supported runtimes).
- Status: mobile done, cli missing, vscode missing
- Code: apps/mobile/app/(app)/settings/performance.tsx:527; apps/mobile/app/(app)/settings/performance.tsx:318

## S109.21 Model loading/unloading controls.
- Should: The user can load a local model into memory and unload it to free resources.
- Status: mobile done, cli missing, vscode missing
- Code: apps/mobile/app/(app)/settings/performance.tsx:422; packages/platform/local-llm/src/selector.ts:159

## S109.22 Local runtime health.
- Should: The app shows whether the local model runtime is running and healthy, with errors when it is not.
- Status: mobile done, cli done, vscode done
- Code: apps/mobile/app/(app)/settings/performance.tsx:682; packages/platform/local-llm/src/selector.ts:159; apps/cli/src/lib.rs:1182; apps/cli/src/lib.rs:2250; apps/cli/src/local_models.rs:284; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1441; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3863

## S109.23 Hybrid local/cloud task mode.
- Should: A task can run partly on a local model and partly in the cloud in one hybrid mode.
- Status: mobile missing, cli missing, vscode missing

## S109.24 Explicit cloud-escalation approval.
- Should: Before a local task is sent to the cloud, the app asks the user to approve the escalation.
- Status: mobile missing, cli missing, vscode missing

## S109.25 Local resource/compute dashboard.
- Should: A dashboard shows local compute use: speed (tokens/s), latency, memory and thermal state over time.
- Status: mobile partial, cli missing, vscode missing
- Code: apps/mobile/stores/chat/chatExecutionStore.ts:2116
- Unfinished: mobile: tok/s, first-token latency and thermal state now recorded for every local reply; peak memory stays 0 because no runtime reports it and no memory sampler is installed (needs a native module or an approved dependency)
