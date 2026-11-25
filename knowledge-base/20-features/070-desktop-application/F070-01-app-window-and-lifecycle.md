---
id: "F070-01"
type: "feature"
title: "App window and lifecycle"
aliases: ["Native application shell", "Dock/taskbar behavior", "Shell window", "Main window", "Single instance", "Renderer recovery", "S70.01", "S70.04"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "partly seen (1 of 2)", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.01", "S70.04"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/main.ts", "file:apps/desktop/electron/windowPolicy.ts", "file:apps/desktop/electron/runtime/rendererRecovery.ts", "SYS-authentication-and-identity", "SYS-observability-and-operations", "SYS-execution-boundaries", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-01 App window and lifecycle

The AGI Workforce desktop app (Electron) is an installed program that shows the hosted web app in a native window. It allows one running copy, hides instead of quitting on Mac, restores the window from the Dock, tray or a second launch, and reloads or explains a crashed page.

Area: [70. Desktop application](README.md). Requirement items: [S70.01](../../10-requirements/capabilities/070-desktop-application.md#s7001), [S70.04](../../10-requirements/capabilities/070-desktop-application.md#s7004).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | partly seen (1 of 2) |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs the desktop app as one installed program. It owns the main window, the single running copy, what happens when the window is closed, the Dock or tray restore, quit protection and recovery when the page crashes, stops answering or cannot load. (main.ts:2570, main.ts:2722, main.ts:2770, main.ts:895)

**Why it exists.** The brief says the product must run as an installed desktop app with its own lifecycle, single instance, sign-in and crash recovery (doc: knowledge-base/data/area-briefs/070-desktop-application.md S70.01, S70.04). The product spec calls the desktop a managed-cloud Electron shell (doc: docs/product/requirements.md:80).

**Who uses it.** Every person who installs the desktop app on Mac, Windows or Linux. Engineers and testers use it to reason about launch, quit and crash behaviour.

**Problems it solves**

- A second launch would start a second copy that fights the first for sign-in, shortcuts and the tray; the lock prevents it (main.ts:2570).
- A crashed or frozen page used to leave a blank window; it now reloads once and explains if it fails again (main.ts:887-893 comment, rendererRecovery.ts:63).
- Closing the window on Mac would lose the page state; it is hidden so the Dock brings back the same page (windowLifecycle.ts:1-6).
- Quitting during running agent work could lose it; a quit prompt asks first (main.ts:2729, quitGuard.ts).

**Use cases**

- Open the app from Applications; it shows the last conversation route if it was an in-app route (main.ts:1089-1140, windowState.ts:95).
- Click a agiworkforce-cloud link while the app runs; the first copy gets the link and comes forward (main.ts:2579).
- Close the window on Mac, click the Dock icon, and the same page returns (main.ts:2722).
- The page crashes; the app reloads the same page, and if it crashes again within 30 seconds shows a stopped screen with a Reload button (rendererRecovery.ts:42, shellScreens.ts:76).

## 2. User experience

**Where to find it**

- Desktop only (surface:desktop). Launched from Applications, the Dock, the Start menu or the OS launcher; no in-app menu entry is needed.
- Dock icon on Mac: click restores the window (main.ts:2722). Tray icon on Windows/Linux: click opens the main window (tray.ts:216).
- App menu on Mac: standard Hide, Hide Others, Quit items (appMenu.ts:133-154). Windows/Linux: File > Quit (appMenu.ts:227).
- Web, Mobile, CLI, VS Code, Chrome: not applicable; the brief marks them n/a.

**Before you start**

- An installed desktop build. The window loads the hosted app from the cloud origin, so a network connection is needed to show the product (main.ts:1065 windowUrlFor uses CLOUD_APP_ORIGIN).
- Sign-in happens through the user's browser and the shell draws its own sign-in screen; signed-out windows are redirected to it (main.ts:1286-1290 comment, windowPolicy.ts:98-110).

**Screens and controls**

- Main window with a native title bar chrome (windowChrome.ts via titleBarChrome, main.ts:1100).
- Loading overlay for the first load (loadingOverlay.ts, desktopLifecycle.test.ts 'keeps loading visible through a blank paint').
- Shell screens: sign-in, offline, service unavailable and crash screens (shellScreens.ts:37, :66, :76). The crash screen heading is 'This window stopped responding' with a 'Reload' action (shellScreens.ts:76-84).
- Quit prompt: a warning dialog listing running coding agent turns and local commands, with a confirm and a cancel button (quitGuard.ts:1-40, main.ts:2729-2755).
- Offer to move the app to the Applications folder on Mac (main.ts:1356-1371, applicationsFolder.ts).

**Journey**

1. Launch the app. If another copy runs, this process quits and the first copy shows its window (main.ts:2570-2583).
2. The main window opens at the remembered size and place, on the last in-app route if it belongs to the current account (main.ts:1089-1140, windowState.ts:246).
3. If signed out, a shell sign-in screen is shown instead of the product (windowPolicy.ts:103).
4. Use the app. On Mac, the close button hides the window; the Dock icon shows it again (main.ts:1150-1159, :2722).
5. On Windows/Linux, closing the last window quits the app unless a tray icon exists; the tray is on by default, so the app then keeps running (main.ts:2770-2774, garnishCore.ts:566).
6. Quit with Cmd+Q, the app menu or the tray. If agent turns or local commands are running, a prompt asks to confirm (main.ts:2729-2755).

**What the person sees and gets**

- Offline screen when the page cannot load (offlineScreen, main.ts:1314).
- Service unavailable screen on an HTTP 5xx from the product page (main.ts:1296).
- Crash screen on a second fault within 30 seconds (main.ts:906-911).
- Dock bounce on notifications is a separate feature (main.ts:1721).

**Settings**

- Launch at login (Settings, and File/app menu 'Launch at Login') starts the app at sign-in (appMenu.ts:140-145, launchAtLogin.ts).
- Menu bar switch decides whether the tray exists, which decides whether Windows/Linux keeps running with no window (main.ts:1858, :2770).
- Window size and place are remembered per display arrangement (windowState.ts, main.ts:1010).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Single instance lock: a second launch quits; the first gets the deep link and shows the main window (main.ts:2570-2583).
- Mac close hides the main window, including leaving full screen first; quitting really closes it (windowLifecycle.ts:13-32, main.ts:1150-1159).
- Dock activate shows or recreates the main window (main.ts:2722, :1373-1378).
- Windows/Linux: app quits on last window close only when no tray exists (main.ts:2770-2774).
- Renderer recovery: first fault reloads on the same page when it is ours; a second within 30 seconds shows the crash screen; an unresponsive page is only acted on after 10 seconds (rendererRecovery.ts:23, :42, :63; main.ts:895-940).
- Faults are counted in desktop telemetry as domain 'crash' (main.ts:903).
- Offline and 5xx recovery screens exist (main.ts:1296, :1314).
- Quit guard asks before quitting with live agent turns, local commands or an active phone remote session (quitGuard.ts:1-40, main.ts:2729).
- Test files cover the lifecycle pieces (desktopLifecycle.test.ts, windowLifecycle.test.ts, rendererRecovery.test.ts).

**Incomplete**

- The draft says 'one window'. The code supports many shell windows (File/Window > New Window), so 'one running copy, many windows' is the true model (main.ts:1457-1459).
- A clean renderer exit is ignored (rendererRecovery.ts:69); no screen is shown, which is intended.

**Present but disconnected or switched off**

- On a non-packaged build the Dock icon is set from an asset (main.ts:2591-2594); this is a development convenience only.

**Not available**

- No crash screen appears on the first fault; the window silently reloads (rendererRecovery.ts:75). The brief wording 'shows a recovery screen' fits only the second fault.
- Web, Mobile, CLI, VS Code and Chrome have no such shell (brief: n/a).

## 4. Required behaviour

**Established requirements**

- The product runs as an installed desktop app window with its own lifecycle, single instance, sign-in and crash recovery. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.01)
- Clicking the Dock/taskbar icon restores the app; closing the last window keeps it running on macOS and quits elsewhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.04)
- A second launch passes its link to the first copy and brings its window forward. (source: task Should list for F070-01)
- If the page crashes or stops responding for a long time, the app shows a recovery screen instead of a blank window. (source: task Should list for F070-01)
- The desktop is a managed-cloud Electron shell with approved local files and tools. (source: doc: docs/product/requirements.md:80)
- The public Desktop shows the hosted web app; apps/desktop/src does not reach the Electron window. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Start the app twice: only one process remains and its window comes forward.
2. On Mac, close the window then click the Dock icon: the same page returns without a reload.
3. On Windows or Linux with the menu bar switch off and nothing running, closing the last window quits the app; with the tray on, the app keeps running and the tray click opens a window.
4. Kill the page process once: the window reloads to the same conversation; kill it again within 30 seconds: the screen titled 'This window stopped responding' with a Reload button appears.
5. Quit while a coding agent turn runs: a warning prompt appears and Cancel keeps the app open.
6. Disconnect the network and launch: an offline screen appears, not a blank window.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the shell loads the hosted app, even Local mode work needs the page to load; offline use of the UI is limited to the recovery screens [inferred from main.ts:1065 and main.ts:1314].
- Closing a secondary window on Mac really closes it, since only the primary window has the hide-on-close handler [inferred from main.ts:1150-1159].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a one-line notice when the first reload happens, so a user who loses a draft understands why.
- [proposed] Record the Windows/Linux close-with-tray behaviour in the first-run help, since the tray defaults on.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Main process | `apps/desktop/electron/main.ts` | Single instance lock, window creation, quit handling, activate, recovery wiring, tray sync (main.ts:2570-2775). |
| service | windowPolicy | `apps/desktop/electron/windowPolicy.ts` | Decides which pages stay in the window, open in the browser or show sign-in (windowPolicy.ts:102-110). |
| service | windowLifecycle | `apps/desktop/electron/windowLifecycle.ts` | Hide-on-close rule for Mac and the full-screen exit (windowLifecycle.ts:13-32). |
| service | rendererRecovery | `apps/desktop/electron/runtime/rendererRecovery.ts` | Plans reload versus explain for a dead or unresponsive page (rendererRecovery.ts:63). |
| service | shellScreens | `apps/desktop/electron/shellScreens.ts` | Crash, offline, service unavailable screens (shellScreens.ts:37-84). |
| service | windowState | `apps/desktop/electron/windowState.ts` | Remembers frame per display arrangement and the restore route (windowState.ts:95, :230). |
| store | shellWindowStore | `apps/desktop/electron/shellWindowStore.ts` | Reads and writes the window state file (shellWindowStore.ts:19-29). |
| service | quitGuard | `apps/desktop/electron/quitGuard.ts` | Builds the warning shown when quitting with live work (quitGuard.ts:1-40). |
| service | deepLinkQueue | `apps/desktop/electron/deepLinkQueue.ts` | Holds links until the page is ready; used by second-instance (main.ts:2579). |
| service | windowChrome | `apps/desktop/electron/windowChrome.ts` | Title bar and background colour per platform and theme (main.ts:1100). |
| service | applicationsFolder | `apps/desktop/electron/applicationsFolder.ts` | Offers to move the app into Applications on Mac (main.ts:1356). |
| service | desktopTelemetry | `apps/desktop/electron/runtime/desktopTelemetry.ts` | Counts crash and launch events (main.ts:903, :2615). |
| component | DesktopHostMount | `apps/web/features/desktop-host/components/DesktopHostMount.tsx` | Page-side behaviour mounted when the page runs in the shell (DesktopHostMount.tsx:30-60). |
| test | desktopLifecycle test | `apps/desktop/electron/__tests__/desktopLifecycle.test.ts` | Covers hide on close, dock restore, quit paths, deep link replay. |
| test | rendererRecovery test | `apps/desktop/electron/__tests__/rendererRecovery.test.ts` | Covers reload, repeat fault and resume URL. |
| test | windowLifecycle test | `apps/desktop/electron/__tests__/windowLifecycle.test.ts` | Covers the hide decision and full-screen leave. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The process asks the OS for the single instance lock; if refused it quits. | device | main.ts:2570-2573 |
| When ready, it registers IPC handlers, loads the last account fingerprint and creates the main window with the remembered frame. | device | main.ts:2596-2620, main.ts:1089-1140 |
| The window loads the product page from the cloud origin through a persistent session partition. | our servers | main.ts:1065, main.ts:1115 (partition) |
| A second launch sends 'second-instance' to the first copy, which delivers the link and shows the window. | device | main.ts:2579-2583 |
| On window close on Mac the window is hidden; on activate it is shown again. | device | main.ts:1150-1159, main.ts:2722 |
| A render fault triggers a reload or the crash screen and a telemetry count. | device | main.ts:895-940 |
| On quit, live work is checked; confirmation lets quit proceed and will-quit stops runtimes. | device | main.ts:2729, main.ts:2757-2768 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Window frame, maximized flag, last route, account fingerprint | window state file in the user data folder (shellWindowStore.ts:15) and a copy of the frame in settings (main.ts:1020) | no sync found in the code | Kept until the app data is cleared; route is dropped when a different account signs in (main.ts:968-985, windowState.ts:299). |
| Held deep links | deep link queue file (deepLinkQueue.ts) | no | Loaded at start and replayed once the page loads (main.ts:2604-2607); retention period unknown. |
| Crash counts | desktop telemetry (desktopTelemetryService.ts) | unknown whether sent to a server | unknown |

**Models and providers.** No model or provider takes part in this feature. It is the native container only.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The shell loads the signed-in product and redirects a signed-out window to a shell sign-in screen that signs in through the browser (windowPolicy.ts:98-110). The window itself opens without an account. |
| Permissions | No OS permission is needed for the shell. Launch at login asks for confirmation when turned on (main.ts:2184 confirmLaunchAtLogin). |
| Subscription | none found in the code |
| Limits and metering | none found in the code; crash reload is limited to one per 30 seconds (rendererRecovery.ts:42). |
| Feature flags | none found in the code for the lifecycle itself. |
| Model compatibility | Not applicable; no model is used. |
| Provider restrictions | Not applicable. |
| Local mode | The window, close, Dock and recovery behaviour do not depend on a plan. The page is loaded from the cloud origin, so with no network only the offline screen shows (main.ts:1314). Whether a fully offline Local-model chat can load the page is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | A loading overlay stays until the page draws (loadingOverlay.ts). | desktopLifecycle.test.ts 'keeps loading visible through a blank paint' |
| Offline or failed load | Offline screen with retry managed by screenRetry; a load aborted by navigation (-3) is ignored. | main.ts:1314-1322, main.ts:318 |
| Server error 5xx | Service unavailable screen. | main.ts:1296 |
| Crash first time | Silent reload to the same page if it belongs to the app. | rendererRecovery.ts:29, :75 |
| Crash twice in 30 seconds | Crash screen with a Reload action and a reference code. | main.ts:906-911, shellScreens.ts:76 |
| Unresponsive | Acted on only after 10 seconds without recovery. | rendererRecovery.ts:23, main.ts:924-931 |
| Quit with running work | Prompt; cancel keeps the app; on non-Mac with no windows left it shows the main window again. | main.ts:2729-2755 |
| Full-screen window closed on Mac | Leaves full screen first, then hides. | windowLifecycle.ts:25-31 |
| Account change | Other windows close and the kept one returns to the root. | main.ts:963-985 |
| Accessibility | Not handled in the code in the shell files I read; page-level accessibility belongs to the web app. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/desktopLifecycle.test.ts`: First-load overlay, deep link replay, hide on close on Mac, dock restore, close on Windows/Linux, quit paths.
- `apps/desktop/electron/__tests__/windowLifecycle.test.ts`: Hide decision by platform and quitting; full-screen leave before hide.
- `apps/desktop/electron/__tests__/rendererRecovery.test.ts`: Reload on first fault, explain on repeat, unresponsive handling, resume URL.
- `apps/desktop/electron/__tests__/windowState.test.ts`: Frame restore across displays and restorable routes.
- `apps/desktop/electron/__tests__/windowPolicy.test.ts`: Which navigations stay, open externally or show sign-in.

**Test scenarios**

- **Single instance**
  1. Launch the app.
  2. Launch it again from the Dock or command line.
  - Expected: Only one process stays; the existing window comes forward.
- **Mac close and Dock restore**
  1. On Mac open a conversation.
  2. Press the red close button.
  3. Click the Dock icon.
  - Expected: The window hides, the app stays in the Dock, and the same conversation shows without reload.
- **Crash twice**
  1. Open the app.
  2. Kill its renderer process.
  3. Within 30 seconds kill it again.
  - Expected: First: silent reload on the same route. Second: crash screen with Reload.
- **Quit guard**
  1. Start a coding agent turn.
  2. Press Cmd+Q or choose Quit.
  - Expected: A warning lists the running work; Cancel keeps the app.
- **Windows tray close**
  1. On Windows keep the menu bar switch on.
  2. Close the window.
  3. Click the tray icon.
  - Expected: The app keeps running and the tray click opens the window.

**Where to look when it fails**

- Console lines prefixed [applications-folder] and desktop telemetry events with domain 'crash' and 'launch' (main.ts:903, :2615).
- Help > Troubleshooting > Open Logs and Copy Diagnostics (appMenu.ts:564-571).
- No log of results was found; nothing here counts as run.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **The first renderer fault shows nothing, so a user may not know the window was reloaded and a draft lost.** Affects: Desktop users on all OS. Evidence: rendererRecovery.ts:75; crash screen says a typed message is kept (shellScreens.ts:79). Work needed: Decide whether to show a short notice; confirm what draft state survives a reload.
- **Brief says one window; code allows multiple windows, so the brief text and the app differ.** Affects: Docs and testers. Evidence: main.ts:1457. Work needed: Correct the brief wording.
- **Retention and upload of crash telemetry is not established.** Affects: Privacy review. Evidence: desktopTelemetryService.ts was not opened. Work needed: Read the telemetry service and document where counts go.

**Depends on**

- surface:desktop
- file:apps/desktop/electron/main.ts
- file:apps/desktop/electron/windowPolicy.ts
- file:apps/desktop/electron/runtime/rendererRecovery.ts
- SYS-authentication-and-identity
- SYS-observability-and-operations
- SYS-execution-boundaries
- SYS-shared-ui-and-design

## Unknown

- Where crash and launch telemetry counts are sent and how long they are kept (desktopTelemetryService.ts not opened).
- Whether secondary windows are reopened after a relaunch.
- What draft text survives a reload (the crash screen claims a typed message is kept on the device; the storing code was not opened).
- Behaviour on Linux desktops without tray support.
