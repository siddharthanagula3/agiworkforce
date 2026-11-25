---
id: "GAPS-AREA-070"
type: "gap-list"
title: "Gaps: Desktop application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 70. Desktop application

79 open gaps that touch this area. Area page: [20-features/070-desktop-application](../../20-features/070-desktop-application/README.md).

## CMP-C374

**Deep links that open the CLI with a prefilled prompt**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: No URL scheme is registered for the CLI.
- Evidence: searched: deep link, url scheme, handler registration in apps/cli/src

## CMP-C376

**disableDeepLinkRegistration: stop registering the CLI link handler**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: The CLI registers no link handler, so there is nothing to disable (the deep-link feature itself is Missing).
- Evidence: searched: deep.?link, agi://, register_protocol, url_scheme in apps/cli/src (6 hits, all curl scheme parsing in apps/cli/src/safety/network_target.rs:186-201; no handler registration)

## CMP-C397

**Release channels (stable and latest)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: One stable feed; prereleases are ignored and there is no way to pick a faster channel.
- Evidence: apps/cli/src/update_check.rs:5; docs/runbooks/cli-release.md:312

## CMP-D102

**Locked Use: computer use continues after the Mac locks**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: A task stops when the screen locks.
- Evidence: searched: locked use, authorization plugin in apps/desktop/electron/runtime

## CMP-D105

**Read the open app (notes, editor, terminal) into chat (Work with Apps)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Nothing reads text from another app into a chat; only a screenshot of a window can be sent.
- Evidence: searched: workWithApps, frontmostApp, axSelectedText, accessibility text in apps/desktop/electron and apps/web/features

## CMP-D106

**Start computer use by typing @Computer or @AppName**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: The @ menu has no computer or app entry.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2933-2943

## CMP-D112

**Linux app (.deb, .rpm, apt)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Detail: No Linux package target exists and the download route returns unavailable for Linux.
- Evidence: searched: linux, deb, rpm, AppImage in apps/desktop/electron-builder.yml; apps/web/app/api/download/route.ts:147

## CMP-D114

**Windows app (installer, x64 and ARM64)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Detail: No Windows build is made or offered: the website download route answers 503 for anything but Mac. The Windows workflow builds the retained Tauri app, not this one.
- Evidence: apps/desktop/electron-builder.yml (only a mac: block); release-desktop-cloud.yml (only build-macos); apps/web/app/api/download/route.ts:147 returns unavailable; build-windows-release.yml has no electron

## CMP-D115

**App updates itself on Windows**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: Self-update runs only on Mac (the supported check is platform darwin); with no Windows build there is nothing to update.
- Evidence: apps/desktop/electron/desktopAutoUpdate.ts:17-19 (app.isPackaged && process.platform === 'darwin')

## CMP-D116

**Choose a release channel (Stable or Latest, about one build a day)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: There is one channel; the feed always returns the latest stable release and Settings has no channel choice.
- Evidence: apps/desktop/electron/desktopCloudUpdate.ts:9 (single channel 'cloud'); apps/web/features/desktop-host/components/DesktopUpdateRow.tsx (no channel control); searched: channel, latest, beta in desktop-host components

## CMP-D93

**Computer use works in the background without taking the screen**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: Input is posted on the shared session, so the agent uses the screen and pauses when you move the mouse.
- Evidence: apps/desktop/electron/native/macos/agi-input.swift:42; apps/desktop/electron/runtime/computerUseSession.ts:167

## CMP-D94

**Deep link that starts a new chat with a prefilled prompt**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: A chat link must name an existing chat; the link parser keeps only a target and an id and drops any query, so no link opens a new chat with text in the box.
- Evidence: packages/contracts/local-runtime/src/host-bridge.ts:27-47 (parseDesktopDeepLink); apps/web/features/desktop-host/lib/deep-links.ts:40-56

## CMP-D95

**Admin switch to disable window sharing (Appshots)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: The governed features list has no switch for sharing the front window.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:35-50

## CMP-D96

**Admin switch to stop the app registering its link scheme**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: The app always registers its link scheme.
- Evidence: apps/desktop/electron/main.ts:2553

## CMP-DP100

**Attach a screenshot from the quick shortcut**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F014-05](../../20-features/014-attachment-intake-components/F014-05-screenshot-and-window-capture.md), [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: You cannot drag a region, and it hides Quick Ask instead of attaching there Screenshot to Chat captures the whole display under the pointer and pastes it into the main chat; you cannot drag a region, and it hides Quick Ask instead of attaching there.
- Evidence: apps/desktop/electron/screenshot.ts:111-175 (captureToChat); apps/desktop/electron/main.ts:1916

## CMP-DP101

**Confirm before quitting while work is running**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Detail: Does not cover what the row says The prompt exists (apps/desktop/electron/quitGuard.ts; main.ts:2274-2275) but does not cover what the row says. LiveWork holds only shell runs, local coding turns and Remote Control (quitGuard.ts:4-8; filled at main.ts:1750-1757); a computer-use run or a cloud Work step using this Mac is not counted
- Evidence: apps/desktop/electron/quitGuard.ts; apps/desktop/electron/main.ts:2274

## CMP-DP102

**Deep links to Skills, the new scheduled task form and a plugin's install page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: None opens the Skills page, the new-schedule form or a plugin install page Links open one existing schedule and any settings section; none opens the Skills page, the new-schedule form or a plugin install page.
- Evidence: packages/contracts/types/src/product-links.ts:1-9 (targets: chat, file, artifact, work, research, schedule, browser-task); apps/web/features/desktop-host/lib/deep-links.ts:40-56

## CMP-DP97

**Share the front window with chat (Appshot, click a window)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Detail: Only on Mac (it needs the computer-use input helper) and pastes into the main window Window to Chat grabs the front app window with a chord, but only on Mac (it needs the computer-use input helper) and pastes into the main window.
- Evidence: apps/desktop/electron/screenshot.ts:63-110; apps/desktop/electron/runtime/computerUseService.ts:392-401; apps/desktop/electron/main.ts:1917

## CMP-DP99

**Admin allow or block of computer use per app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: They cannot list apps Admins turn computer use on or off for a group; they cannot list apps.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:44

## CMP-VP60

**Link that opens the chat with a prefilled prompt or session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Detail: There is no general open link with a typed prompt Editor links work for browser handoff, cloud tasks and developer sessions from the desktop app; there is no general open link with a typed prompt.
- Evidence: apps/extension-vscode/src/features/context-handoff/index.ts:289-308

## CMP-VP67

**Stable and pre-release channels**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: The extension is version 0.0.1 with preview true (apps/extension-vscode/package.json:22) and row 'Listed on the VS Code… Only a release workflow exists (.github/workflows/release-vscode-extension.yml:50-58,229-238). The extension is version 0.0.1 with preview true (apps/extension-vscode/package.json:22) and row 'Listed on the VS Code Marketplace' says it is not live, so no user can pick a channel. Leader channel pract
- Evidence: .github/workflows/release-vscode-extension.yml:50-100

## GAP-AREA070-LW05

**Update channel: the feed URL is built from the architecture and version only, with no channel choice.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-070
- Detail: Area 70. Desktop application
- Evidence: apps/desktop/electron/desktopAutoUpdate.ts:69; apps/desktop/electron/desktopCloudUpdate.ts:8

## GAP-CAP-apps-and-install-01

**Desktop app for macOS, Windows and Linux: No Windows or Linux build of the public Electron Desktop. No written decision on Linux.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Requirement items: S70.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-03

**Desktop automatic update and Check for Updates: Mac only. Rollback and previous-version support not shown in code reading.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Requirement items: S70.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-04

**Release channel choice (stable or latest): No channel setting on any app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Requirement items: S70.27
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-apps-and-install-15

**Global shortcut quick chat: none known on Mac; unverified elsewhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-03](../../20-features/070-desktop-application/F070-03-global-shortcuts.md), [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md), [F109-03](../../20-features/109-optional-native-and-ambient-extensions/F109-03-compact-floating-quick-ask-panel.md)
- Requirement items: S109.05, S70.05, S70.06, S70.07
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-apps-and-install-17

**Screenshot and window sharing to chat: Window capture Mac only; no admin switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F109-02](../../20-features/109-optional-native-and-ambient-extensions/F109-02-screen-and-window-capture-to-chat-desktop-shortcut.md)
- Requirement items: S109.09, S109.10, S70.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-18

**Reading context from the app in front: Not built.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Requirement items: S70.18
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-apps-and-install-19

**Computer use and its OS permissions: No background mode, no locked use, no admin per-app list.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md), [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Requirement items: S70.21, S70.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-20

**Deep links: No prefilled-prompt links, no admin switch, no CLI links.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md), [F071-06](../../20-features/071-mobile-application/F071-06-push-notifications.md)
- Requirement items: S70.30, S71.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-28

**Launch at login and background behaviour: No sleep, wake or lock handling; quit confirmation covers less than the row asks.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Requirement items: S70.24, S70.25, S70.32
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-apps-and-install-30

**Local model install and storage on the device: Desktop local model management and explicit cloud-escalation approval are missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md), [F071-09](../../20-features/071-mobile-application/F071-09-local-models-and-device-storage.md), [F109-08](../../20-features/109-optional-native-and-ambient-extensions/F109-08-on-device-model-library-download-storage-delete.md), [F109-09](../../20-features/109-optional-native-and-ambient-extensions/F109-09-on-device-runtime-controls-and-health.md), [F109-11](../../20-features/109-optional-native-and-ambient-extensions/F109-11-hybrid-local-and-cloud-task-and-approval-before-cl.md)
- Requirement items: S109.18, S109.19, S109.20, S109.21, S109.22, S109.23, S109.24, S70.23, S71.28, S71.30
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F070-01-01

**The first renderer fault shows nothing, so a user may not know the window was reloaded and a draft lost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Detail: Affects: Desktop users on all OS. Work needed: Decide whether to show a short notice; confirm what draft state survives a reload.
- Evidence: rendererRecovery.ts:75; crash screen says a typed message is kept (shellScreens.ts:79)

## GAP-F070-01-02

**Brief says one window; code allows multiple windows, so the brief text and the app differ.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Detail: Affects: Docs and testers. Work needed: Correct the brief wording.
- Evidence: main.ts:1457

## GAP-F070-01-03

**Retention and upload of crash telemetry is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-01](../../20-features/070-desktop-application/F070-01-app-window-and-lifecycle.md)
- Detail: Affects: Privacy review. Work needed: Read the telemetry service and document where counts go.
- Evidence: desktopTelemetryService.ts was not opened

## GAP-F070-02-01

**Brief asserts the tray offers Quick Ask, screenshot and voice; the tray labels them as shortcut rows, and no direct 'voice' label exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-02](../../20-features/070-desktop-application/F070-02-menu-bar-dock-and-tray-icon.md)
- Detail: Affects: Testers matching labels. Work needed: Use the exact labels in test scripts.
- Evidence: tray.ts:174-196

## GAP-F070-02-02

**The Menu bar switch does not visibly explain that it is held on while an agent runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-02](../../20-features/070-desktop-application/F070-02-menu-bar-dock-and-tray-icon.md)
- Detail: Affects: Desktop users. Work needed: Add a hint or disable state.
- Evidence: DesktopSettingsSection.tsx:355-361 vs main.ts:1858

## GAP-F070-02-03

**Linux tray support is not handled explicitly.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-02](../../20-features/070-desktop-application/F070-02-menu-bar-dock-and-tray-icon.md)
- Detail: Affects: Linux users. Work needed: Decide the fallback when no tray host exists.
- Evidence: tray.ts:209-221

## GAP-F070-03-01

**Brief says custom shortcuts can be set; the page may only pick presets or off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-03](../../20-features/070-desktop-application/F070-03-global-shortcuts.md)
- Detail: Affects: Desktop users wanting other chords. Work needed: Decide whether a native capture-a-chord control is wanted.
- Evidence: garnishCore.ts:192-199, main.ts:2163-2172

## GAP-F070-03-02

**Quick Ask model and mode behaviour is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-03](../../20-features/070-desktop-application/F070-03-global-shortcuts.md)
- Detail: Affects: Testers and billing review. Work needed: Read WebChatRoot compact mode and chat hooks.
- Evidence: quick-ask page renders WebChatRoot only

## GAP-F070-03-03

**Brief S70.20 says cross-app dictation is not applicable, but code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-03](../../20-features/070-desktop-application/F070-03-global-shortcuts.md)
- Detail: Affects: Docs accuracy. Work needed: Reconcile brief with code and ship state.
- Evidence: main.ts:1893-1930

## GAP-F070-04-01

**No compact companion window exists apart from the Quick Ask panel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md)
- Detail: Affects: Desktop users expecting a companion like leaders. Work needed: Decide scope and build or re-describe item S70.07.
- Evidence: grep of electron files found 'companion' only at quickAsk.ts:46

## GAP-F070-04-02

**Brief marks detachable panels missing but Details and Research detach today; artifact and preview do not.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md)
- Detail: Affects: Docs and users. Work needed: Update brief; decide on other panels.
- Evidence: panel-windows.ts:7, PanelWindow.tsx:39-41

## GAP-F070-04-03

**Always on Top is not remembered across launches and has no setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md)
- Detail: Affects: Desktop users. Work needed: Decide whether to persist.
- Evidence: main.ts:1487-1490

## GAP-F070-04-04

**Secondary windows are not restored after relaunch (not established).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md)
- Detail: Affects: Multi-window users. Work needed: Verify and document.
- Evidence: main.ts:1143-1150

## GAP-F070-04-NOTBUILT

**Window management: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F070-04](../../20-features/070-desktop-application/F070-04-window-management.md)
- Requirement items: S70.10
- Detail: Desktop: S70.10

## GAP-F070-05-01

**Brief cites ChatComposerNew.tsx:4461 as the capture UI; that line is queued follow-up code. The capture entry points are the shell menu, tray and chord.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Detail: Affects: Docs and testers. Work needed: Correct the brief reference.
- Evidence: ChatComposerNew.tsx:4440-4480

## GAP-F070-05-02

**Computer use and window capture work only on macOS but the brief says 'desktop done' without that limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Detail: Affects: Windows and Linux users. Work needed: State the limit or build support.
- Evidence: computerUseService.ts:226-232

## GAP-F070-05-03

**Whether Local (on-device) models can use screen steps is not available; steps are offered only on cloud chat requests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Detail: Affects: Local-mode users. Work needed: Decide the rule and document it under SYS-local-inference.
- Evidence: host-headers.ts:44-57, dispatcher.ts:2298

## GAP-F070-05-04

**Subscription rule for computer use is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-05](../../20-features/070-desktop-application/F070-05-screen-capture-and-computer-use.md)
- Detail: Affects: Billing and access. Work needed: Read the cloud entitlement code for device tools.
- Evidence: no plan check in the desktop files

## GAP-F070-06-01

**A deleted or renamed approved folder says 'no longer reachable', not 'choose it again', and the root stays listed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-06](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)
- Detail: Affects: Desktop users with moved folders. Work needed: Add re-pick or remove action on unreachable roots.
- Evidence: pathGuard.ts:119-121 vs task Should line

## GAP-F070-06-02

**Brief says storage is not confirmed; code confirms it, so the brief and docs are out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-06](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: workspaceStore.ts:36-38

## GAP-F070-06-03

**Brief cites device-steps.ts:225-233 in web lib for search, which is screen-step code; the search tools are defined in the contract at device-steps.ts:158-171.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-06](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)
- Detail: Affects: Docs. Work needed: Correct the references.
- Evidence: apps/web/features/desktop-host/lib/device-steps.ts:140-160

## GAP-F070-06-04

**Entitlement and plan rule for model-driven file tools is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-06](../../20-features/070-desktop-application/F070-06-local-folders-and-files.md)
- Detail: Affects: Billing and access. Work needed: Read cloud entitlement code.
- Evidence: no plan check found in desktop code

## GAP-F070-07-01

**The brief's code pointers for S70.15 do not locate the runner**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-07](../../20-features/070-desktop-application/F070-07-local-shell-commands.md)
- Detail: Affects: Engineers and testers reading the brief. Work needed: Correct the brief to cite shellService.ts, dispatcher.ts and LocalCommandDialog.tsx
- Evidence: data/area-briefs/070-desktop-application.md S70.15 vs shellService.ts

## GAP-F070-07-02

**Whether the interactive terminal runs in the same sandbox as agent commands is stated in copy but enforced by the CLI, not shown in desktop code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-07](../../20-features/070-desktop-application/F070-07-local-shell-commands.md)
- Detail: Affects: surface:desktop users relying on the terminal's limits. Work needed: Verify the CLI's terminal plan against the agent command sandbox and add a test
- Evidence: dispatcher.ts:643; developerSessionService.ts:1990-1999

## GAP-F070-07-03

**No sandbox on platforms other than macOS and Linux; every run asks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-07](../../20-features/070-desktop-application/F070-07-local-shell-commands.md)
- Detail: Affects: Any future Windows build. Work needed: Add a Windows sandbox or keep refusing
- Evidence: shellSandbox.ts:189-203

## GAP-F070-07-04

**Running commands are lost when the app restarts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-07](../../20-features/070-desktop-application/F070-07-local-shell-commands.md)
- Detail: Affects: surface:desktop. Work needed: Decide whether to list or clean up orphaned commands on start
- Evidence: shellService.ts:109-113

## GAP-F070-08-01

**Brief says a phone can ask to refresh pairing; only a computer-side refresh was found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-08](../../20-features/070-desktop-application/F070-08-phone-remote-control.md)
- Detail: Affects: surface:desktop, surface:mobile. Work needed: Confirm the mobile behaviour or add a phone request
- Evidence: remoteControlService.ts:289-300; use-remote-pairing-refresh.ts:20

## GAP-F070-08-02

**Lock check covers only approvals that need confirming at the computer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-08](../../20-features/070-desktop-application/F070-08-phone-remote-control.md)
- Detail: Affects: surface:desktop. Work needed: Decide whether other phone commands should also refuse when locked
- Evidence: remoteControlService.ts:132

## GAP-F070-08-03

**Phone-side behaviour and labels were not read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-08](../../20-features/070-desktop-application/F070-08-phone-remote-control.md)
- Detail: Affects: surface:mobile. Work needed: Document mobile separately
- Evidence: apps/mobile/app/(app)/companion/index.tsx named only in docs/product/surface-feature-matrix.md

## GAP-F070-09-01

**No pause or resume of agent turns, terminals or computer use on sleep, wake or lock**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Detail: Affects: surface:desktop. Work needed: Define the expected behaviour and implement it for CLI turns and terminals
- Evidence: powerMonitor uses only in main.ts:321, localRoutineService.ts:232, skillCapture.ts:174, computerUseSession.ts:166, remoteControlService.ts:132

## GAP-F070-09-02

**Menu toggle skips the confirmation that Settings uses**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Detail: Affects: surface:desktop. Work needed: Route the menu through the same confirmation
- Evidence: appMenu.ts:28-34 vs main.ts:2185-2190

## GAP-F070-09-03

**Brief status 'missing' for S70.32 is out of date**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Detail: Affects: Documentation. Work needed: Change the brief to partial
- Evidence: Code references above

## GAP-F070-09-04

**Not known whether the app starts hidden at login**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Detail: Affects: surface:desktop. Work needed: Decide and implement or document
- Evidence: No code for it found

## GAP-F070-09-NOTBUILT

**Background work, launch at login and sleep: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F070-09](../../20-features/070-desktop-application/F070-09-background-work-launch-at-login-and-sleep.md)
- Requirement items: S70.32
- Detail: Desktop: S70.32

## GAP-F070-10-01

**No update channel choice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: Affects: surface:desktop users who want beta builds. Work needed: Design channels, feed parameter and a settings control
- Evidence: update route.ts:35 fixed 'stable'; desktopCloudUpdate.ts:19-23 feed has no channel

## GAP-F070-10-02

**Automatic update only on macOS**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: Affects: Any Windows or Linux build. Work needed: Add platform builds and updaters if planned
- Evidence: desktopAutoUpdate.ts:17; electron-builder.yml

## GAP-F070-10-03

**Diagnostics are copy only; no file export or send**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Detail: Affects: Support workflow. Work needed: Optional save-to-file
- Evidence: main.ts:1631

## GAP-F070-10-NOTBUILT

**Updates and diagnostics: not built on Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F070-10](../../20-features/070-desktop-application/F070-10-updates-and-diagnostics.md)
- Requirement items: S70.27
- Detail: Desktop: S70.27

## GAP-F070-11-01

**'Manage' in General > Storage does not lead to the Storage pane**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: Affects: surface:desktop users. Work needed: Open the Storage pane or remove the row
- Evidence: DesktopSettingsSection.tsx:186, :364-376; no test names it

## GAP-F070-11-02

**Unroutable link gives no message**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: Affects: surface:desktop users. Work needed: Show a notice or route to home
- Evidence: use-desktop-deep-links.ts:18-21

## GAP-F070-11-03

**Clean-ups delete permanently, not to Trash**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: Affects: surface:desktop users. Work needed: Confirm that is acceptable for user-initiated clean-ups
- Evidence: storageService.ts:150-196 vs AGENTS.md section 9 (agent removals); these are user-initiated and confirmed

## GAP-F070-11-04

**'Clear cache' scope not tied to sign-in by a test**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-11](../../20-features/070-desktop-application/F070-11-local-storage-privacy-and-links.md)
- Detail: Affects: surface:desktop. Work needed: Add an end-to-end check that sign-in survives
- Evidence: storageService.test.ts only checks the session clear is called

## GAP-F070-12-01

**Brief statuses for S70.17, S70.20 and S70.23 disagree with the code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Affects: Documentation and test planning. Work needed: Update the brief; add these to the test plan
- Evidence: dispatcher.ts:2862, main.ts:1896, dispatcher.ts:3242

## GAP-F070-12-02

**MCP tools reach only the coding agent, not the chat assistant**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Affects: surface:desktop chat users. Work needed: Decide whether chat should get local MCP tools
- Evidence: LocalMcpSettings.tsx:35-36

## GAP-F070-12-03

**No active-app context for the assistant (title, selection, contents)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Affects: surface:desktop. Work needed: Design a permissioned context reader
- Evidence: front-app reads only in computerUseService.ts and dictation

## GAP-F070-12-04

**Local model panel code ships in the web app but is unreachable on Electron**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Affects: Maintainers. Work needed: Keep as Tauri-only or remove from the shared page
- Evidence: host.ts:45-48; host-bridge.ts:690

## GAP-F070-12-05

**Plan check for local MCP not found although docs say paid only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F070-12](../../20-features/070-desktop-application/F070-12-planned-or-not-applicable-items.md)
- Detail: Affects: Subscription consistency. Work needed: Confirm where it is enforced or add it
- Evidence: docs/product/definition.md:303; no check in LocalMcpSettings.tsx
