---
id: "REQ-AREA-109"
type: "requirements"
title: "Requirement items: Optional native and ambient extensions"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 109. Optional native and ambient extensions

25 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S109.01

**Home-screen widgets.** The user can add an AGI widget to the phone or desktop home screen that shows content or starts an action.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile missing
- Feature: [F109-05 Phone home-screen widgets and hardware button](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Competitor trace: CAP-apps-and-install-21

## S109.02

**Lock-screen widgets.** The phone lock screen can show an AGI widget or start an AGI action without unlocking.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)
- Competitor trace: CAP-apps-and-install-21

## S109.03

**Menu-bar quick actions.** A menu-bar (or equivalent quick menu) offers one-click AGI actions such as new chat, quick ask, screenshot and voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done
- Feature: [F109-01 Menu-bar quick menu (desktop)](../../20-features/109-optional-native-and-ambient-extensions/F109-01-menu-bar-quick-menu-desktop.md)
- Competitor trace: CAP-apps-and-install-16

## S109.04

**Desktop companion.** A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, VS Code done
- Feature: [F109-07 Desktop companion pairing (phone controls desktop work)](../../20-features/109-optional-native-and-ambient-extensions/F109-07-desktop-companion-pairing-phone-controls-desktop-w.md)

## S109.05

**Compact floating assistant.** A compact assistant floats over other content (other apps or pages) and can take a prompt without opening the full app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile missing, Chrome done
- Feature: [F109-03 Compact floating Quick Ask panel](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Competitor trace: CAP-apps-and-install-15

## S109.06

**Optional animated companion/pet.** An optional animated companion or pet character can be shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F109-99 Other items in Optional native and ambient extensions](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)

## S109.07

**Global dictation.** Dictation to AGI can be started from anywhere on the device (global shortcut or system voice command) without first opening the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, Chrome missing
- Feature: [F109-04 Global dictation from anywhere (desktop and phone)](../../20-features/109-optional-native-and-ambient-extensions/F109-04-global-dictation-from-anywhere-desktop-and-phone.md)

## S109.08

**Selected-text rewrite shortcut.** Text selected in any app can be rewritten by AGI with a shortcut and the result put back in place.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)

## S109.09

**Screenshot-to-chat shortcut.** A shortcut captures the screen and attaches it to an AGI chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F109-02 Screen and window capture to chat (desktop shortcuts)](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Competitor trace: CAP-apps-and-install-17

## S109.10

**Window-to-chat shortcut.** A shortcut captures one chosen window (not the whole screen) into an AGI chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done
- Feature: [F109-02 Screen and window capture to chat (desktop shortcuts)](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Competitor trace: CAP-apps-and-install-17

## S109.11

**Hardware shortcut/macropad integration.** A hardware button or macropad (Stream Deck, iPhone Action Button, etc.) can trigger AGI actions through a supported integration.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile done, Chrome missing
- Feature: [F109-05 Phone home-screen widgets and hardware button](../../20-features/109-optional-native-and-ambient-extensions/F109-05-phone-home-screen-widgets-and-hardware-button.md)
- Competitor trace: CAP-apps-and-install-29

## S109.12

**Wearable voice access.** The user can talk to AGI from a smartwatch or other wearable.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)

## S109.13

**Headset/earbud invocation.** The user can start talking to AGI from a headset or earbuds (button or voice command) without touching the phone or computer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile done
- Feature: [F109-06 Siri and headset invocation (phone)](../../20-features/109-optional-native-and-ambient-extensions/F109-06-siri-and-headset-invocation-phone.md)
- Competitor trace: CAP-apps-and-install-23

## S109.14

**Automotive voice surface.** The user can use AGI by voice through an in-car system (CarPlay, Android Auto).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F109-99 Other items in Optional native and ambient extensions](../../20-features/109-optional-native-and-ambient-extensions/F109-99-other-items.md)
- Competitor trace: CAP-apps-and-install-26

## S109.15

**Telephone access.** The user can reach AGI by calling or texting a phone number.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)

## S109.16

**Messaging-platform access.** The user can talk to AGI from a messaging platform (Slack, Teams, WhatsApp, Telegram) and get answers there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)

## S109.17

**Spatial/XR interface.** AGI offers a spatial or XR interface (Vision Pro, Quest).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F109-12 Channels not built yet (lock screen, selected-text rewrite, phone calls, messaging, wearables, spatial)](../../20-features/109-optional-native-and-ambient-extensions/F109-12-channels-not-built-yet-lock-screen-selected-text-r.md)

## S109.18

**Local-model download manager.** The user can browse, download (with progress, pause/cancel) and install local models from inside the app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI missing, VS Code missing
- Feature: [F109-08 On-device model library (download, storage, delete)](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Competitor trace: CAP-apps-and-install-30

## S109.19

**Local-model storage manager.** The user can see how much space each local model uses and delete models to free storage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI missing, VS Code missing
- Feature: [F109-08 On-device model library (download, storage, delete)](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md)
- Competitor trace: CAP-apps-and-install-30

## S109.20

**Local hardware-capability panel.** The app shows the device's hardware capability for local models (RAM, accelerators, supported runtimes).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI missing, VS Code missing
- Feature: [F109-09 On-device runtime controls and health](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Competitor trace: CAP-apps-and-install-30

## S109.21

**Model loading/unloading controls.** The user can load a local model into memory and unload it to free resources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI missing, VS Code missing
- Feature: [F109-09 On-device runtime controls and health](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Competitor trace: CAP-apps-and-install-30

## S109.22

**Local runtime health.** The app shows whether the local model runtime is running and healthy, with errors when it is not.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done, CLI done, VS Code done
- Feature: [F109-09 On-device runtime controls and health](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md)
- Competitor trace: CAP-apps-and-install-30

## S109.23

**Hybrid local/cloud task mode.** A task can run partly on a local model and partly in the cloud in one hybrid mode.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing
- Feature: [F109-11 Hybrid local and cloud task, and approval before cloud escalation](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Competitor trace: CAP-apps-and-install-30

## S109.24

**Explicit cloud-escalation approval.** Before a local task is sent to the cloud, the app asks the user to approve the escalation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing, CLI missing, VS Code missing
- Feature: [F109-11 Hybrid local and cloud task, and approval before cloud escalation](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Competitor trace: CAP-apps-and-install-30

## S109.25

**Local resource/compute dashboard.** A dashboard shows local compute use: speed (tokens/s), latency, memory and thermal state over time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile partial, CLI missing, VS Code missing
- Feature: [F109-10 On-device performance dashboard](../../20-features/109-optional-native-and-ambient-extensions/F109-10-on-device-performance-dashboard.md)
