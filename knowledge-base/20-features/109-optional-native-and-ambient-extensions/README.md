---
id: "AREA-109"
type: "area"
title: "Optional native and ambient extensions"
features: ["F109-01", "F109-02", "F109-03", "F109-04", "F109-05", "F109-06", "F109-07", "F109-08", "F109-09", "F109-10", "F109-11", "F109-12", "F109-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 109. Optional native and ambient extensions

This area lets a person reach AGI without opening the main app. On the desktop, a menu-bar icon, global keyboard shortcuts and a small floating Quick Ask panel start chats, capture the screen or a window, and start dictation. On the phone, widgets, a hardware Action or Control button, and Siri or a headset can start a chat or ask a question. A desktop companion lets a paired phone watch and steer desktop coding sessions. Many items are still missing, especially on the desktop widget, selected-text rewrite, telephone, wearable, lock-screen and spatial surfaces.

**Who uses it.** Desktop users (menu bar, shortcuts, Quick Ask, capture, dictation) and phone users (widgets, Control button, Siri Ask). Remote Control (the companion) is limited to paid plans by the plan capability 'remote_control' (packages/contracts/types/src/billing-catalog.ts:352, PAID_TIERS), and on the phone it is hidden in the shipped build because the flags companion and dispatch are false (apps/mobile/lib/v1FeatureFlags.ts:12,16). Ask from Siri needs a switch turned on in the app and a valid token. Local-model screens on the phone are for any user who installs a model. Chrome users get the in-page floating panel. CLI and VS Code have no local-model download, storage or hardware features.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F109-01](F109-01-menu-bar-quick-menu-desktop.md) | Menu-bar quick menu (desktop) | n/a | built | no | n/a | n/a | n/a |
| [F109-02](F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md) | Screen and window capture to chat (desktop shortcuts) | n/a | built | n/a | n/a | n/a | built |
| [F109-03](F109-03-compact-floating-quick-ask-panel.md) | Compact floating Quick Ask panel | n/a | built | no | n/a | n/a | built |
| [F109-04](F109-04-global-dictation-from-anywhere-desktop-and-phone.md) | Global dictation from anywhere (desktop and phone) | n/a | built | built | n/a | n/a | no |
| [F109-05](F109-05-phone-home-screen-widgets-and-hardware-button.md) | Phone home-screen widgets and hardware button | n/a | no | partly | n/a | n/a | no |
| [F109-06](F109-06-siri-and-headset-invocation-phone.md) | Siri and headset invocation (phone) | n/a | no | built | n/a | n/a | n/a |
| [F109-07](F109-07-desktop-companion-pairing-phone-controls-desktop-w.md) | Desktop companion pairing (phone controls desktop work) | n/a | built | built | n/a | built | n/a |
| [F109-08](F109-08-on-device-model-library-download-storage-delete.md) | On-device model library (download, storage, delete) | n/a | n/a | built | no | no | n/a |
| [F109-09](F109-09-on-device-runtime-controls-and-health.md) | On-device runtime controls and health | n/a | n/a | built | no | no | n/a |
| [F109-10](F109-10-on-device-performance-dashboard.md) | On-device performance dashboard | n/a | n/a | partly | no | no | n/a |
| [F109-11](F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md) | Hybrid local and cloud task, and approval before cloud escalation | n/a | n/a | no | no | no | n/a |
| [F109-12](F109-12-channels-not-built-yet-lock-screen-selected-text-r.md) | Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial) | partly | no | no | n/a | n/a | n/a |
| [F109-99](F109-99-other-items.md) | Other items in Optional native and ambient extensions | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/109-optional-native-and-ambient-extensions.md](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md).

## How this area works in the code

1. **Shortcut or menu press on the desktop.** The main process holds the handlers for each action and passes them to the shortcut registry. A chord is registered with the operating system, or the press is refused with a reason. (`apps/desktop/electron/main.ts:1936-1960 (garnishHandlers and garnishShortcutHandlers)`, `apps/desktop/electron/shortcuts.ts:92-116 (registerGarnishShortcuts)`, `apps/desktop/electron/shortcuts.ts:150-169 (changeGarnishShortcuts, restores old chords when an always-on chord is lost)`)
2. **Default chords and choices.** Each action has a default chord and a fixed list of alternatives, shared by the desktop and the page. Empty text means the action has no shortcut. (`packages/contracts/local-runtime/src/host-bridge.ts:140-170 (HOST_SHORTCUT_KEYS, HOST_SHORTCUT_CHOICES, defaultHostShortcut)`, `apps/desktop/electron/garnishCore.ts:46-125 (DEFAULT_SHORTCUTS, SHORTCUT_LABELS, shortcutMayBeOff)`)
3. **Capture to chat.** A capture reads the clipboard, takes the screen or chosen window thumbnail, puts the PNG on the clipboard, focuses the chat composer and pastes. It then restores the old clipboard text if the user has not copied something new. (`apps/desktop/electron/screenshot.ts:142-188 (captureWindowToChat)`, `apps/desktop/electron/screenshot.ts:190 (captureToChat)`, `apps/desktop/electron/screenshot.ts:92-110 (takeCaptureBackFromClipboard)`)
4. **Quick Ask floating panel.** A frameless 480 by 620 window loads the Quick Ask route of the cloud app in a separate session partition. Navigation to other pages is handed to the main window. (`apps/desktop/electron/quickAsk.ts:52-126 (createPanel, navigation handoff)`, `apps/desktop/electron/quickAsk.ts:150-171 (surfaceQuickAsk, toggleQuickAsk)`)
5. **Dictation press.** A dictation press goes to the visible Quick Ask panel, or the visible main window, or raises Quick Ask. The page then toggles its own voice capture. (`apps/desktop/electron/voiceDictation.ts:34-78 (dictationTarget, toggleGlobalDictation)`, `apps/desktop/electron/main.ts:1921-1930 (dictateFromShortcut)`)
6. **Remote Control pairing request (desktop, web, VS Code).** The client asks the server to start a pairing. The server checks the screen-share switch, the plan and the account, then returns a code, a relay socket address and a token. The desktop then shows the code and confirms each phone. (`apps/web/app/api/pair/initiate/route.ts:16-66`, `apps/web/lib/feature-flags/remote-control-gate.ts (remoteControlRefusal, remoteControlPlanRefusal)`, `apps/desktop/electron/remote/remoteControlService.ts:196-210 (confirmPhone), :85 (APPROVAL_CONFIRM_TIMEOUT_MS)`, `apps/extension-vscode/src/features/remote-control/remoteControlService.ts:150-170 (requestPairing)`)
7. **Phone widget and Siri entry points.** Widgets and Control buttons open a deep link. Siri calls the server with a stored token, and the server answers with the chat route chosen by the plan. (`apps/mobile/native/android/widget/AGIQuickActionsWidget.kt:12-22`, `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77-107`, `apps/mobile/app/_layout.tsx:161 (isIntentLink)`, `apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:11-97 (AskAGIIntent, AGIAskClient)`, `apps/web/app/api/mobile/intent/ask/route.ts:24-70 (handleAsk)`, `apps/web/lib/server/mobile-intent.ts:150-215 (answerMobileIntentAsk)`)
8. **On-device model download and removal.** Before a download starts, the app checks free space, Wi-Fi or cellular consent and then streams the file with a resumable downloader. Cancel pauses it. Removal is refused while the model is replying. (`apps/mobile/services/modelDownload.ts:213-240 (assertFreeSpaceFor, assertDownloadAllowed)`, `apps/mobile/services/modelDownload.ts:303-310 (cancelDownload)`, `apps/mobile/services/modelDownload.ts:432-470 (downloadModel)`, `apps/mobile/services/modelDownload.ts:633 (deleteDownloadedModel)`, `apps/mobile/app/(app)/settings/storage.tsx:112 (AgiStorageSummary)`)
9. **Performance event after a local reply.** When a local reply finishes, the app computes tokens per second and latency and records one event with the thermal state. (`apps/mobile/stores/chat/chatExecutionStore.ts:3134-3150 (tokensPerSecond, recordPerfEvent)`, `apps/mobile/app/(app)/settings/performance.tsx:318-430 (benchmark, load and unload controls)`)

## Files to know

| File | Role |
|---|---|
| `apps/desktop/electron/shortcuts.ts` | Registers, checks and changes the global desktop shortcuts; restores old chords if an always-on chord is lost. |
| `packages/contracts/local-runtime/src/host-bridge.ts` | Single list of desktop shortcut keys, default chords and alternatives, shared with the page. |
| `apps/desktop/electron/screenshot.ts` | Screen and window capture to the chat, clipboard handling and restore. |
| `apps/desktop/electron/quickAsk.ts` | The compact floating Quick Ask panel: window, navigation handoff, show and hide. |
| `apps/desktop/electron/voiceDictation.ts` | Decides which window receives a global dictation press. |
| `apps/desktop/electron/tray.ts` | Menu-bar or tray menu: actions, running sessions, shortcut submenu. |
| `apps/desktop/electron/remote/remoteControlService.ts` | Desktop side of Remote Control: pairing, phone confirmation, approvals, relay of session events. |
| `apps/web/app/api/pair/initiate/route.ts` | Server route that starts a Remote Control pairing and applies the plan and switch checks. |
| `apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift` | Siri and App Intent 'Ask AGI Mobile', which calls the server with a keychain token. |
| `apps/web/lib/server/mobile-intent.ts` | Server answer path for Siri and widget asks: checks, routing, usage reservation. |
| `apps/mobile/services/modelDownload.ts` | On-device model download (resumable, cancel), free-space and Wi-Fi checks, removal. |
| `apps/mobile/app/(app)/settings/performance.tsx` | Device capability, load and unload, and benchmark screen for on-device models. |

## What is stored

- Desktop shortcut chords (settings): Desktop settings store via getShortcuts/saveSettings (apps/desktop/electron/shortcuts.ts:2,154-168)
- Desktop show-in-menu-bar preference: Desktop preferences read by getPreferences (apps/desktop/electron/main.ts:1860)
- Siri ask token: Device keychain, service com.agiworkforce.app.ask-intent:no-auth (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift, keychainService constant)
- Ask intent token on the server: Resolved by resolveMobileIntentToken (apps/web/app/api/mobile/intent/ask/route.ts:24-30); storage not traced
- Downloaded on-device model files: Phone file system, excluded from backup (apps/mobile/services/modelDownload.ts:100)
- Local reply performance events: recordPerfEvent in mobile app (apps/mobile/stores/chat/chatExecutionStore.ts:3142-3150); destination not traced
- Managed usage reservation for Siri asks: Server usage store via reserveManagedUsageRequest (apps/web/lib/server/mobile-intent.ts, idempotency key mobile-intent:<token>:<request>)
- Remote Control pairing codes and tokens: Relay server (wsUrl and pairTokens from /api/pair/initiate); held in memory on desktop (apps/desktop/electron/remote/remoteControlService.ts)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **FEATURES.companion**: Shows and runs the phone companion screen (false in the shipped build) (apps/mobile/lib/v1FeatureFlags.ts:16, read in apps/mobile/app/(app)/companion/index.tsx:100-125)
- **FEATURES.dispatch**: Needed with companion for pairing on the phone (false) (apps/mobile/lib/v1FeatureFlags.ts:12)
- **remote_control plan capability**: Paid plans only; a non-paid plan gets a 'comes with paid plans' message and a pairing refusal (packages/contracts/types/src/billing-catalog.ts:309,352,410; apps/web/components in RemoteControlSection.tsx:50-79; remoteControlPlanRefusal in apps/web/lib/feature-flags/remote-control-gate.ts)
- **Screen-share kill switch (SCREEN_SHARE_CAPABILITY)**: Closes Remote Control pairing server-side (apps/web/lib/feature-flags/remote-control-gate.ts (remoteControlRefusal); registry packages/contracts/types/src/feature-registry.json)
- **showInMenuBar preference**: Shows the menu-bar icon (also shown while computer use is granted or an agent is running) (apps/desktop/electron/main.ts:1858-1864 (trayNeeded))
- **Shortcut chords and off value**: Set a chord per action or turn one off (empty value); a conflicting chord is refused (apps/desktop/electron/shortcuts.ts:74-90; defaults in packages/contracts/local-runtime/src/host-bridge.ts:161-171)
- **dictateIntoFocusedApp preference**: Makes dictation try the app in front first (apps/desktop/electron/main.ts:1921-1923)
- **Ask from Siri switch**: Turns the Siri ask token on or off; signing out turns it off (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift (switchedOffMessage text); switch itself in the app (not traced))
- **AGIApiBaseURL (Info.plist value)**: Server origin for Siri asks; must be https (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift (endpoint()))
- **Cellular download consent**: Allows model downloads on mobile data (apps/mobile/services/modelDownload.ts:191-205)
- **Managed compute access and capability canChat**: Refuses a Siri ask when chat or managed compute is not allowed (apps/web/lib/server/mobile-intent.ts (assertCapabilityAvailable, evaluateManagedComputeAccess))
- **Pairing TTL (ttlSeconds)**: Sets how long a pairing code lives, 30 to 900 seconds, default 300 (apps/web/app/api/pair/initiate/route.ts:18-22)

## Shared between apps

Shared: the remote-control contract (packages/contracts/local-runtime/src/remote-control.ts) used by desktop and VS Code; the desktop shortcut contract (packages/contracts/local-runtime/src/host-bridge.ts) read by the desktop shell and the page; the plan capability table (packages/contracts/types/src/billing-catalog.ts) used by web, mobile and the server; the remote-control utility (@agiworkforce/utils/remote-control) used by desktop; the mobile-intent server path used by iOS and Android deep links. Separate per app: desktop tray, shortcuts, capture and Quick Ask (apps/desktop/electron); the Chrome in-page panel (apps/extension); the iOS widget, Siri intent and Control widget (apps/mobile/native/ios); the Android widget (apps/mobile/native/android); on-device model code (apps/mobile/services and stores); VS Code remote control service (apps/extension-vscode). The CLI has its own local-server probe (apps/cli/src/local_models.rs), not the on-device feature.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks mobile home-screen widgets 'missing', but a working iOS widget and an Android AppWidgetProvider exist and are wired by a config plugin. (apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:77-107; apps/mobile/native/android/widget/AGIQuickActionsWidget.kt:12-22; apps/mobile/native/ios/withAGIWidgets.cjs:90-110)
- Brief marks mobile companion 'done', but the companion flag and the dispatch flag are both false, so the screen and pairing never run in the shipped build. (apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app/(app)/companion/index.tsx:100-125)
- Brief cites DrawerContent.tsx:130 as the companion entry. That line is not a companion entry; the only companion reference in the drawer is a route match. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:585)
- Brief cites apps/desktop/electron/main.ts:1120 for the menu-bar, but that line is window policy code. The tray wiring is at main.ts:1858-1872 and 1936-1939. (apps/desktop/electron/main.ts:1120, 1858-1872)
- Brief cites apps/extension/src/background.ts:3833 for the floating assistant, but that line is scheduled-task recovery code, not the panel. The panel is mounted from setup.ts. (apps/extension/src/background.ts:3833; apps/extension/src/inPagePanel/setup.ts:55-65)
- Brief cites apps/web/app/api/github/webhook/route.ts:253 for messaging access. That line handles pull-request review requests; the chat-from-Slack path is apps/web/app/api/webhooks/slack/route.ts. (apps/web/app/api/github/webhook/route.ts:245-262; apps/web/app/api/webhooks/slack/route.ts:1-25)
- Brief cites apps/cli/src/lib.rs:1182 and :2250 and VS Code ChatStateManager.ts:1441 and :3863 as local runtime health. These lines are not local-runtime health code (CLI lines are a cloud-handoff argument list and discovery command; VS Code lines are a composer reset and context-warning preference). (apps/cli/src/lib.rs:1178-1186, 2246-2252, 4765-4791; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1436-1444, 3858-3866)
- Brief cites apps/mobile/app/_layout.tsx:579 for global dictation. That range is the app-lock and storage reset code; dictation is driven from the desktop and the page. (apps/mobile/app/_layout.tsx:570-600)
- Brief says peak memory is a gap, and the code records peakMemoryMB as whatever local value is passed in, so the dashboard receives 0 when no sampler is installed. (apps/mobile/stores/chat/chatExecutionStore.ts:3142-3149)
- Brief marks the desktop Quick Ask and capture as done, but the desktop shortcuts only register if the user keeps a non-empty chord. A chord another app holds is reported as taken and the user gets a notification. (apps/desktop/electron/shortcuts.ts:74-90, 106-115)
- Brief says the Chrome in-page panel is done, but the panel is mounted without any plan check that was seen in setup.ts. (apps/extension/src/inPagePanel/setup.ts:55-65)

## Not established

- Whether the Siri ask token storage on the server (resolveMobileIntentToken) and the in-app Ask from Siri switch were traced end to end; I read the client and route only.
- Where the mobile performance events are stored and whether any screen displays them (recordPerfEvent destination not traced).
- Whether the desktop dictation page capture (the page side of the toggle message) works; I did not open the web page code for it.
- The Chrome screenshot path (apps/extension/manifest.json:75 and the bridge server) was not traced beyond the file's existence.
- Whether the desktop Window-to-chat capture uses frontWindowIdOutside correctly on every platform; only the call site was read.
- Android equivalents of the Siri and hardware features; none were found.
- Items 06 (animated companion) and 14 (automotive voice) are marked not applicable in the brief; I did not look for them in code, and they are not in a feature group.
- Whether a Stream Deck or macropad integration exists outside the iOS Control button (desktop and Chrome were searched only by brief reference).
- Whether the phone's home-screen widget data is ever live; the iOS provider looked static and was not traced further.
- Whether the desktop, VS Code or CLI Remote Control approval timeout matches the mobile side (only the desktop 120 second timeout was read).
