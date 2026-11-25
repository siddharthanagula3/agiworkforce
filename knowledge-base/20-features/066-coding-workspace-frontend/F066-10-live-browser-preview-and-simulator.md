---
id: "F066-10"
type: "feature"
title: "Live browser preview and simulator"
aliases: ["Browser pane", "Browser preview (S66.31)", "Preview", "iOS Simulator pane", "Simulator panel (S66.35)", "Console errors (S66.32)", "Send console errors", "Port/preview URL (S66.34)", "LocalBrowserPanel", "LocalSimulatorPane"]
area: "66 Coding-workspace frontend"
available_on: ["desktop"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S66.31", "S66.32", "S66.34", "S66.35"]
depends_on: ["surface:desktop", "mode:local", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "F066-09", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-10 Live browser preview and simulator

On the desktop app, the Code session can open a built-in browser pane that shows the page the agent is building, and, on a Mac, a live iOS Simulator pane that can be docked or floated. A running dev server's printed address gets a Preview button, and errors from the preview page can be sent to the agent.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.31](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6631), [S66.32](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6632), [S66.34](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6634), [S66.35](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6635).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows the app being built next to the chat: a browser pane with address bar, back, forward and reload, and an iOS Simulator pane with device controls and screenshots. Preview-page console errors can be sent to the agent as one message.

**Why it exists.** Developers need to see what the agent built without leaving the session (S66.31, S66.34, S66.35).

**Who uses it.** Developers using local coding sessions in the desktop app, mostly web app and iOS app work.

**Problems it solves**

- Switching windows to see the result.
- Copying console errors by hand to the agent.
- Seeing an iOS app run while the agent edits it.

**Use cases**

- Open the browser pane and type localhost:3000.
- Press 'Preview' beside a dev server in 'Running in this folder'.
- Press 'Send N console errors' to give the agent the preview's errors.
- Open the iOS Simulator, start a device, take a screenshot and add it to the chat.

## 2. User experience

**Where to find it**

- Desktop app, local session: header buttons and the tool menu 'Browser' and 'iOS Simulator' (apps/web/features/code/components/LocalSessionPanel.tsx:681-690,1082-1101); the two panes share a switcher (CodeToolSwitcher.tsx:18-47).
- The browser pane needs the desktop host (browserPaneAvailable, LocalSessionPanel.tsx:413); the simulator needs a Mac host (apps/web/features/desktop-host/lib/simulator-client.ts:24-25; apps/desktop/electron/runtime/simulatorService.ts:211-213).
- Neither pane is offered on a remote SSH session (LocalSessionPanel.tsx:681-684,1082,1094).
- Web (browser tab), mobile, CLI, VS Code, Chrome: not found.

**Before you start**

- Desktop app (Electron) with a local folder session.
- For the simulator: macOS with Xcode simulators installed; permission to use the simulator may be asked ('This pane needs permission to use the iOS Simulator...', apps/web/features/code/simulator-pane.ts:15-16).

**Screens and controls**

- Browser: 'Back', 'Forward', 'Reload', 'Web address' field with placeholder 'Type a URL', 'Close browser' (local-code.ts:209-221); empty state 'Browse the web' with 'Type a URL to open a site. Pages on this computer open right away.'
- Refused site: "<host> isn't allowed in the browser pane." with 'Try again'.
- Simulator: 'Choose a device', 'Start simulator', 'Looking for the iOS Simulator', menus Edit, Device, View; zoom, Home, Screenshot, Record, Annotate; 'Float over the chat', 'Dock' (simulator-pane.ts:11-107).
- Console: button 'Send N console errors' in the running list (local-code.ts:157-160 area; LocalRunningCommands.tsx:158-166).

**Journey**

1. 1. In a local session open 'Browser' from the header or tool menu.
2. 2. Type an address and press Enter; the pane loads it.
3. 3. Or start a dev server and press 'Preview' on its row; the browser pane opens that address.
4. 4. If the preview logged errors, press 'Send N console errors'; they go to the agent as one turn.
5. 5. For iOS work open 'iOS Simulator', choose a device and 'Start simulator'.
6. 6. Use Home, Screenshot, Record and 'Add to chat' as needed; dock or float the pane.

**What the person sees and gets**

- 'Enter a web address such as example.com.' for an invalid address (local-code.ts:220).
- 'The page could not be opened.' on failure (local-code.ts:221).
- 'The iOS Simulator could not be reached.' and 'Try again' (simulator-pane.ts:11-14).
- 'No simulators are installed. You can add one in Xcode's settings, under Components.' (simulator-pane.ts:17).
- 'Starting the simulator. This can take a minute or more.' and a memory note (simulator-pane.ts:19-20).

**Settings**

- Browser pane site list stored in the desktop user data (desktop-browser-sites.json, apps/desktop/electron/browserPane.ts:23); clear pane data command browser_pane_clear_data (dispatcher.ts:2486).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Browser pane in the desktop host: loads pages, back, forward, reload, bounds sync, hides under dialogs (apps/web/features/code/components/LocalBrowserPanel.tsx:62-190; apps/desktop/electron/browserPane.ts).
- Preview of a printed dev-server address opens in the browser pane or a separate preview window (LocalRunningCommands.tsx:73-80; apps/desktop/electron/previewWindow.ts).
- Console errors from the preview are buffered and can be read and cleared (apps/desktop/electron/previewConsole.ts; previewWindow.ts:41-60; runtime-client.ts:347-354).
- iOS Simulator service with status, boot, shutdown, frames, settings, clipboard, screenshot, recording, captures (dispatcher.ts:2489-2531; apps/desktop/electron/runtime/simulatorService.ts).
- Simulator pane UI with docking and floating (LocalSessionPanel.tsx:493-640,1929-1940).

**Incomplete**

- Console logs are errors only, and only as a send-to-agent action; there is no console log panel (previewWindow.ts:46-53 records only error-level messages).
- Preview URL display exists only as a Preview button on a running command and the address bar; no stand-alone port list.
- Browser is not offered for sites that the pane refuses (browserPaneDecision).

**Present but disconnected or switched off**

- The brief marks every part missing for every app; the code exists on the desktop-hosted page. That is a conflict, not verified by any recorded run.

**Not available**

- Simulator on non-Mac computers (simulatorSupported returns true only for darwin, simulatorService.ts:211-213).
- Browser and simulator panes on the plain web app, mobile, CLI, VS Code and Chrome: not found.
- Simulator for Android: not found.

## 4. Required behaviour

**Established requirements**

- The workspace shows a live browser preview of the app the session builds. (source: S66.31 Should)
- It shows the previewed app's console logs. (source: S66.32 Should)
- It shows the port or preview URL of a server the session runs and opens it. (source: S66.34 Should)
- Where offered, a device simulator shows the app under development. (source: S66.35 Should)
- The desktop is a real desktop app; preview and simulator are desktop features. (source: doc: project decision 'desktop is a real desktop app' recorded in memory product-direction [inferred applicability])

**Acceptance criteria**

1. Entering example.com loads it in the pane; an invalid string shows the invalid-address message.
2. A refused host shows the refused message and 'Try again'.
3. The simulator pane says 'Looking for the iOS Simulator' while probing and 'could not be reached' on failure.
4. On a non-Mac the iOS Simulator button is absent.
5. Pressing Preview on a running server opens its address in the pane.
6. 'Send N console errors' appears only when the preview logged errors and a turn can take them, and sends one message then clears.
7. Opening a dialog hides the native pane and closing it shows it again.
8. Shutdown asks for confirmation naming what is lost.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The pane uses a native Electron view, so it cannot render in a normal browser tab [inferred from browserPane.ts WebContentsView].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a console log panel with levels beyond errors.
- [proposed] Provide a browser preview for the cloud session sandbox (its server port) on web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalBrowserPanel | `apps/web/features/code/components/LocalBrowserPanel.tsx` | Address bar, controls, bounds sync, hide under modals. |
| component | LocalSimulatorPane | `apps/web/features/code/components/LocalSimulatorPane.tsx` | Simulator pane UI. |
| config | SIMULATOR_PANE_COPY | `apps/web/features/code/simulator-pane.ts` | Simulator labels and messages, formatters. |
| component | CodeToolSwitcher | `apps/web/features/code/components/CodeToolSwitcher.tsx` | Switch between Browser and iOS Simulator. |
| hook | use-simulator | `apps/web/features/code/hooks/use-simulator.ts` | Simulator state hook. |
| component | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Opens, docks and floats the panes. |
| component | LocalRunningCommands | `apps/web/features/code/components/LocalRunningCommands.tsx` | Preview button and console-error offer. |
| service | simulator-client | `apps/web/features/desktop-host/lib/simulator-client.ts` | simulatorPaneSupported and calls into the host. |
| service | runtime-client | `apps/web/features/desktop-host/lib/runtime-client.ts` | openLocalPreview, readPreviewConsoleErrors. |
| service | browserPane | `apps/desktop/electron/browserPane.ts` | Native browser view, site decisions, console buffer. |
| service | previewWindow | `apps/desktop/electron/previewWindow.ts` | Local preview window that keeps navigation local. |
| service | previewConsole | `apps/desktop/electron/previewConsole.ts` | Console error buffer. |
| service | simulatorService | `apps/desktop/electron/runtime/simulatorService.ts` | Talks to the iOS Simulator on a Mac. |
| command | browser_pane_* and simulator_* commands | `apps/desktop/electron/runtime/dispatcher.ts` | Host commands (lines 2452-2531). |
| config | browser pane contract | `packages/contracts/local-runtime/src` | browserPaneAddress, browserPaneDecision, localPreviewOrigin, PreviewConsoleReport. |
| test | LocalBrowserPanel test | `apps/web/features/code/components/LocalBrowserPanel.test.tsx` | Pane behaviour. |
| test | LocalSimulatorPane test | `apps/web/features/code/components/LocalSimulatorPane.test.tsx` | Simulator pane behaviour. |
| test | browserPane host test | `apps/desktop/electron/__tests__/browserPane.test.ts` | Host browser pane. |
| test | simulatorService test | `apps/desktop/electron/__tests__/simulatorService.test.ts` | Simulator service. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page checks whether the host offers the browser pane and, on Electron, whether the Mac simulator is supported. | device | LocalSessionPanel.tsx:413,423-428; simulator-client.ts:23-33 |
| Opening the pane asks the host to show a native view at the pane's bounds; the page keeps bounds in sync. | device | LocalBrowserPanel.tsx:82-130; dispatcher.ts:2452-2478 |
| The address goes through browserPaneAddress and a site decision; the page loads from the user's own network or localhost. | outside service | LocalBrowserPanel.tsx:171-180; apps/desktop/electron/browserPane.ts (browserPaneDecision) |
| The host records error-level console messages and page crashes of the preview. | device | apps/desktop/electron/previewWindow.ts:41-60 |
| 'Send console errors' reads and clears the buffer and sends one agent turn. | device and our servers | LocalRunningCommands.tsx:99-110; turn goes through the session send path |
| The simulator service drives the local simulator tools and streams frames to the pane. | device | dispatcher.ts:2489-2531; simulatorService.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Browser pane sign-ins and cookies | Electron partition 'persist:agi-browser-pane' on the device | No | Cleared by browser_pane_clear_data (dispatcher.ts:2486-2488) |
| Allowed and blocked site list | desktop-browser-sites.json in app data | No | Kept until the user removes sites (browser_sites_remove) |
| Preview console errors | in-memory buffer | No | Cleared when read with clear or on reset |
| Simulator screenshots and recordings | files on the Mac | No | User can delete after a confirmation 'The file is removed from this Mac and cannot be brought back.' (simulator-pane.ts) |

**Models and providers.** No model is involved in showing the panes. Sending console errors or a simulator screenshot adds content to an agent turn, which then goes to whichever model the session uses (SYS-chat-turn-pipeline, SYS-inference-providers).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The panes need the desktop app; no account check found in the pane code. |
| Permissions | The simulator may need a macOS permission, explained in the pane (simulator-pane.ts:15-16). The browser pane refuses sites the host decides against. |
| Subscription | none found in the code for the panes. Sending content to a managed-model turn uses the plan as any turn does. |
| Limits and metering | none found in the code. A running simulator uses several gigabytes of memory (simulator-pane.ts:20). |
| Feature flags | none found in the code. |
| Model compatibility | Attaching a screenshot needs a model that accepts images; the pane offers 'Add to chat' only when the session can attach images (LocalSessionPanel.tsx:1938 canAttachImages). |
| Provider restrictions | none found in the code. |
| Local mode | Fully on the device. No server holds the page or the simulator frames. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading simulator | 'Looking for the iOS Simulator'. | simulator-pane.ts:12 |
| Simulator unreachable | Message and 'Try again'. | simulator-pane.ts:11-14 |
| Permission refused | Explains how to allow it again. | simulator-pane.ts:15-16 |
| No devices | Tells the person to add one in Xcode. | simulator-pane.ts:17 |
| Boot fails | 'The simulator could not be started.' | simulator-pane.ts bootFailed |
| Browser load error | 'The page could not be opened.' alert. | LocalBrowserPanel.tsx:62-70; local-code.ts:221 |
| Frame stops | 'The screen is not updating.' with the reason. | simulator-pane.ts screenStale |
| Remote SSH session | Panes not offered. | LocalSessionPanel.tsx:1082,1094 |
| Dialog opens over the pane | Native view hidden, restored after. | LocalBrowserPanel.tsx:82-125 |
| Offline, timeout | not handled in the code beyond the load error. | LocalBrowserPanel.tsx:62-70 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalBrowserPanel.test.tsx`: Opens given address, empty state, keeps typed address, reveal without reload, refuses non-web address, refused site with retry, hides on unmount.
- `apps/web/features/code/components/LocalSimulatorPane.test.tsx`: Simulator pane UI (case list not read).
- `apps/web/features/code/components/LocalRunningCommands.test.tsx`: Preview open and console error send.
- `apps/desktop/electron/__tests__/browserPane.test.ts`: Host browser pane.
- `apps/desktop/electron/__tests__/previewWindow.test.ts`: Preview window.
- `apps/desktop/electron/__tests__/previewConsole.test.ts`: Console buffer.
- `apps/desktop/electron/__tests__/simulatorService.test.ts`: Simulator service.

**Test scenarios**

- **Open a local page**
  1. Run a dev server in a local session.
  2. Open Browser and enter its address.
  - Expected: The page shows; Reload works.
- **Refused host**
  1. Enter a site the pane refuses.
  - Expected: Refused message with 'Try again'.
- **Console errors to agent**
  1. Load a page that logs an error.
  2. Press 'Send N console errors'.
  - Expected: One agent turn contains the errors; the button disappears.
- **Simulator start**
  1. On a Mac open iOS Simulator, choose a device, Start simulator.
  - Expected: Frames appear; Screenshot adds a capture; Add to chat attaches it.
- **Non-Mac**
  1. Open a local session on a non-Mac desktop.
  - Expected: No iOS Simulator button.

**Where to look when it fails**

- Host commands browser_pane_state, simulator_status.
- Messages 'The iOS Simulator could not be reached.' and 'The page could not be opened.'

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **The brief marks browser preview, port URL and simulator missing everywhere; code exists on the desktop-hosted page.** Affects: Brief accuracy. Evidence: LocalSessionPanel.tsx:1922-1940. Work needed: Update the brief; live-verify.
- **No console log panel; errors only, sent to the agent on request.** Affects: S66.32 on desktop. Evidence: previewWindow.ts:46-53. Work needed: Add a log view if required.
- **No browser preview for cloud sessions.** Affects: surface:web cloud sessions. Evidence: No code found. Work needed: Design a preview of the cloud sandbox's port.
- **No simulator or emulator outside macOS and none for Android.** Affects: Non-Mac desktop users. Evidence: simulatorService.ts:211-213. Work needed: Decide scope.
- Not built on: Web, Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:desktop
- mode:local
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- F066-09
- SYS-shared-ui-and-design

## Unknown

- What browserPaneDecision allows and refuses (function in the contract not opened).
- Whether the Tauri desktop build has a preview.
- Exact case list of LocalSimulatorPane.test.tsx.
- Whether the preview works with a remote dev server or only localhost.
