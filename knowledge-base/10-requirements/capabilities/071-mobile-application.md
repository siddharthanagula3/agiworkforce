---
id: "REQ-AREA-071"
type: "requirements"
title: "Requirement items: Mobile application"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 71. Mobile application

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S71.01

**Native navigation.** The phone app navigates with native patterns: a swipeable drawer plus stack routes with back gestures.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-01 Moving around and screen layout](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)

## S71.02

**Compact composer.** The composer starts as a one-line pill that grows up to a cap and can expand to a full-screen editor, then sends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-02 Writing a message in the composer](../../20-features/071-mobile-application/F071-02-writing-a-message-in-the-composer.md)

## S71.03

**Keyboard-aware layout.** When the keyboard opens the chat screen and composer move above it rather than being covered.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-02 Writing a message in the composer](../../20-features/071-mobile-application/F071-02-writing-a-message-in-the-composer.md)

## S71.04

**Touch message actions.** Assistant messages show tap targets (copy, read aloud, share, regenerate, rate) that act on the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-03 Message actions (tap buttons and long-press menu)](../../20-features/071-mobile-application/F071-03-message-actions-tap-buttons-and-long-press-menu.md)

## S71.05

**Long-press menus.** Long-pressing a message opens a menu of actions (edit, retry, copy, export, delete) that run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-03 Message actions (tap buttons and long-press menu)](../../20-features/071-mobile-application/F071-03-message-actions-tap-buttons-and-long-press-menu.md)

## S71.06

**Camera intake.** The user can take a photo with the phone camera and it is attached to (or sent in) a chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-04 Attaching photos, camera, files and shared content](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)

## S71.07

**Photo-picker intake.** The user can pick up to several photos from the system photo library and they attach to the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-04 Attaching photos, camera, files and shared content](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)

## S71.08

**File-provider intake.** The user can attach a file from the OS document picker (Files app / storage providers) to a chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-04 Attaching photos, camera, files and shared content](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)

## S71.09

**Share-sheet intake.** Sharing text, links, images or PDFs to the app from another app opens a preview that starts a chat or stages the files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-04 Attaching photos, camera, files and shared content](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)
- Competitor trace: CAP-apps-and-install-25

## S71.10

**Voice conversation.** The user can hold a full-duplex spoken conversation with the assistant inside a chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-05 Voice conversation](../../20-features/071-mobile-application/F071-05-voice-conversation.md)

## S71.11

**Audio-route controls.** During voice the user can choose the audio output route (speaker, Bluetooth, headset) and the session switches.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F071-05 Voice conversation](../../20-features/071-mobile-application/F071-05-voice-conversation.md)

## S71.12

**Push notifications.** The app registers for push, the server stores the token and sends pushes for agent, research and schedule events.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-06 Push notifications](../../20-features/071-mobile-application/F071-06-push-notifications.md)

## S71.13

**Notification deep links.** Tapping a notification opens the screen it is about (task, approval, schedule, chat).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-06 Push notifications](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Competitor trace: CAP-apps-and-install-20

## S71.14

**Quick reply to agent questions.** When an agent asks the user a question, the user can answer it from the phone (notification reply or quick answer field).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-07 Cloud tasks, agent answers and approvals](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)

## S71.15

**Remote action approval.** The user can approve or deny a pending agent action from the phone and the run resumes accordingly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-07 Cloud tasks, agent answers and approvals](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)

## S71.16

**Remote coding review.** The user can follow a coding session running elsewhere and review its changed files and diffs, then steer or approve.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-07 Cloud tasks, agent answers and approvals](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)

## S71.17

**Cloud-task initiation.** The user can start a cloud agent task from the phone and follow it in the task list.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-07 Cloud tasks, agent answers and approvals](../../20-features/071-mobile-application/F071-07-cloud-tasks-agent-answers-and-approvals.md)

## S71.18

**Background upload recovery.** An attachment upload interrupted by backgrounding continues or resumes automatically when the app returns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F071-04 Attaching photos, camera, files and shared content](../../20-features/071-mobile-application/F071-04-attaching-photos-camera-files-and-shared-content.md)

## S71.19

**Conversation restoration after process death.** After the OS kills the app, relaunching returns the user to their conversation with messages, draft and any in-flight reply.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-10 Keeping your place after the app closes](../../20-features/071-mobile-application/F071-10-keeping-your-place-after-the-app-closes.md)

## S71.20

**Home-screen widgets.** The user can add an AGI widget to the phone home screen that opens or starts a chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F071-08 Home screen, lock screen and OS shortcuts](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Competitor trace: CAP-apps-and-install-21, CAP-apps-and-install-22

## S71.21

**Lock-screen widgets where supported.** Where the OS supports it, the user can place an AGI widget on the lock screen.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F071-08 Home screen, lock screen and OS shortcuts](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Competitor trace: CAP-apps-and-install-21

## S71.22

**Live activity where supported.** Where supported, a running agent task or voice session shows as a Live Activity / ongoing notification with progress.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F071-08 Home screen, lock screen and OS shortcuts](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Competitor trace: CAP-apps-and-install-21

## S71.23

**System shortcuts/App Intents.** OS-level shortcuts (Siri/App Intents, Spotlight, launcher shortcuts) can start AGI actions such as ask or summarize.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F071-08 Home screen, lock screen and OS shortcuts](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Competitor trace: CAP-apps-and-install-23

## S71.24

**Default-assistant integration where supported.** On Android the user can set AGI as the default digital assistant so the assist gesture opens it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile missing
- Feature: [F071-08 Home screen, lock screen and OS shortcuts](../../20-features/071-mobile-application/F071-08-home-screen-lock-screen-and-os-shortcuts.md)
- Competitor trace: CAP-apps-and-install-22

## S71.25

**Tablet layout.** On tablets the app uses a wider layout (persistent drawer, multi-column grids) and adapts to split view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-01 Moving around and screen layout](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)

## S71.26

**Foldable adaptation.** On foldables the layout adapts when the device folds or unfolds (and ideally around the hinge).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F071-01 Moving around and screen layout](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)

## S71.27

**Landscape adaptation.** Rotating the phone to landscape re-lays out the chat usefully.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-01 Moving around and screen layout](../../20-features/071-mobile-application/F071-01-moving-around-and-screen-layout.md)

## S71.28

**Offline data management.** The user can see how much data is stored on the device and delete models, cache or all local data.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-09 Local models and device storage](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Competitor trace: CAP-apps-and-install-30

## S71.29

**Cellular-data preferences.** The user can choose whether large transfers use cellular data, and the app obeys it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F071-09 Local models and device storage](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)

## S71.30

**Local inference where intentionally implemented.** In Local mode the user can download a model and chat with it on the device without the cloud.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-09 Local models and device storage](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md)
- Competitor trace: CAP-apps-and-install-30

## S71.31

**App-store purchase and restoration.** The user can buy a plan or credits through the App Store / Google Play and restore purchases.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile partial
- Feature: [F071-11 Buying plans and credits in the store](../../20-features/071-mobile-application/F071-11-buying-plans-and-credits-in-the-store.md)
- Competitor trace: CAP-apps-and-install-07

## S71.32

**Mobile-specific privacy controls.** Mobile-only privacy controls exist: biometric app lock, privacy cover on app switch, and OS permission management.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Mobile done
- Feature: [F071-12 App lock and privacy controls](../../20-features/071-mobile-application/F071-12-app-lock-and-privacy-controls.md)
