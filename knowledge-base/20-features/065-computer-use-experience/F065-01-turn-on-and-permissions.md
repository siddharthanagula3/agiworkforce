---
id: "F065-01"
type: "feature"
title: "Turn on and permissions"
aliases: ["Turn on and permissions", "Computer use toggle", "Any app switch", "Computer-access setup (S65.01)", "Operating-system permission explanation (S65.02)", "computer.use permission", "Screen Recording and Accessibility rows"]
area: "65 Computer-use experience"
available_on: ["desktop", "chrome"]
implementation: {web: "missing", desktop: "built", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S65.01", "S65.02"]
depends_on: ["surface:desktop", "surface:chrome", "mode:cloud", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "file:apps/desktop/electron/runtime/computerUseSession.ts", "file:apps/web/features/desktop-host/components/ComputerUseSettings.tsx", "F065-99", "store:desktop-permission-store"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F065-01 Turn on and permissions

In AGI Desktop (Electron), Settings has a Computer use section with an Any app switch, which defaults to off. Turning it on asks macOS for Accessibility and shows Accessibility and Screen Recording status rows with an Open System Settings button. While off, screen steps are refused. On other systems a reason is shown. The Chrome extension has its own consent.

Area: [65. Computer-use experience](README.md). Requirement items: [S65.01](../../10-requirements/capabilities/065-computer-use-experience.md#s6501), [S65.02](../../10-requirements/capabilities/065-computer-use-experience.md#s6502).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It is the front door of computer use on Desktop. One switch (labelled 'Any app') turns on letting the AGI agent see the screen and use mouse and keyboard on this Mac. When on, it shows the two macOS permissions needed (Accessibility and Screen Recording) with their status and a button that opens the right System Settings pane. When off, or when the platform cannot do it, every screen step is refused with a reason the model can relay. (apps/web/features/desktop-host/components/ComputerUseSettings.tsx:171-196; apps/desktop/electron/runtime/computerUseSession.ts:261-267)

**Why it exists.** Controlling a computer is high impact, so it must be an explicit opt-in that is off by default, with the operating-system permissions explained where the user needs them. The product requirements demand site/app permission prompts and clear state while AGI controls the computer. (doc: docs/product/requirements.md section 21.4; apps/desktop/electron/garnishCore.ts:570)

**Who uses it.** A person using AGI Desktop on a Mac who wants the agent to work in apps on screen. A tester checking permissions. An engineer extending the permission rows.

**Problems it solves**

- The agent cannot touch the screen until the person turns it on.
- The person is told which macOS permission is missing and gets a button to open the right pane instead of a silent failure.
- On Windows or Linux the person sees a clear reason instead of a broken switch.

**Use cases**

- A Mac user turns on Any app so the agent can fill a form in a native app.
- A user sees 'Not allowed' next to Screen Recording and presses Open System Settings to fix it.
- A user on Windows opens the section and reads that mouse and keyboard control is supported on macOS only.
- A user who turned the switch off finds the agent refuses the next screen step and explains why.

## 2. User experience

**Where to find it**

- Desktop (Electron shell, which shows the hosted web app): Settings, section 'Computer use'. The section renders only inside the desktop shell and returns nothing in a normal browser (apps/web/features/settings/components/WebSettingsModal.tsx:251; apps/web/features/desktop-host/components/ComputerUseSettings.tsx:159).
- Desktop settings search lists the fields 'Any app', 'Allowed apps', 'Refused apps' for this section (apps/web/features/settings/components/web-settings-navigation.ts:115-119).
- Desktop window File menu: 'Stop Computer Use', 'Take Over Screen Control', 'Hand Back Screen Control' (apps/desktop/electron/appMenu.ts:196-212).
- Chrome extension: side panel Computer Use tab with a permission mode selector (Ask first, Auto, Full access, YOLO) and a per-site browser-control consent; the Desktop 'Computer use' section has a Chrome row with a Manage link to the Capabilities settings section (apps/web/features/desktop-host/components/ComputerUseSettings.tsx:198-212; apps/extension/_locales/en/messages.json spAutonomy* keys).
- Web in a normal browser, CLI: no setup exists (brief S65.01: web missing, cli missing). Mobile and VS Code: not applicable (brief).

**Before you start**

- AGI Desktop on macOS (computer use returns 'supported on macOS only' elsewhere) (apps/desktop/electron/runtime/computerUseService.ts:226-232).
- The input helper binary available: packaged builds ship it; a development run compiles it with the Swift toolchain, otherwise the capability is reported unavailable (apps/desktop/electron/runtime/computerUseService.ts:111-117).
- macOS Accessibility and Screen Recording turned on for the app (apps/desktop/electron/runtime/computerUseService.ts:245-268).
- A signed-in AGI account and a cloud chat turn that offers screen tools; the steps come from the cloud model and are carried out on this machine (apps/web/lib/hooks/useChatStream.ts:1886-1899).

**Screens and controls**

- Heading 'Computer use' with hint 'Let AGI see your screen and use the mouse and keyboard in apps you allow.' (ComputerUseSettings.tsx:34-35).
- Group 'Control': switch 'Any app' with the hint that AGI asks before it controls each app and Escape stops it at any time, plus a 'Learn more' link to the computer-use help article (ComputerUseSettings.tsx:76-79,171-196).
- Under the switch, a note shows the unavailable reason when the platform or a permission blocks it (ComputerUseSettings.tsx:174-176).
- Row 'Chrome' with a status note ('Connected', 'Paired, but Chrome is not connected right now', 'not paired', 'Chrome cannot reach this app') and a 'Manage' link (ComputerUseSettings.tsx:37-45,198-212).
- When enabled: rows 'Accessibility' and 'Screen Recording' with status text (Allowed, Not allowed, Not asked yet, Blocked by your organization, Not needed on this computer) and an 'Open System Settings' button when the status is Not allowed or Not asked yet (ComputerUseSettings.tsx:228-233; DesktopPermissionsSection.tsx:41-90).
- Row 'Refused for now' with 'Ask again' when the person refused computer use at the prompt (ComputerUseSettings.tsx:214-226).

**Journey**

1. 1. Open Settings, then Computer use in AGI Desktop on a Mac.
2. 2. Read that the switch is off (the saved default is off).
3. 3. Turn on 'Any app'. The app saves the setting and asks macOS for Accessibility if it is not yet trusted (computerUseSession.ts:380-388; systemPermissions.ts listForAccessibility).
4. 4. The Accessibility and Screen Recording rows appear. For any row marked Not allowed or Not asked yet press 'Open System Settings'; for an undecided Screen Recording the app first triggers the macOS capture prompt, otherwise it opens the Privacy pane (systemPermissions.ts openSystemPermission).
5. 5. Return to the app: the page re-reads status on window focus (use-computer-use.ts effect on 'focus').
6. 6. Ask the agent in chat to do something on screen. The first screen step raises a native dialog 'Let the agent use your screen?' with 'Allow for this task' (dispatcher.ts:1950-1966), and later each app asks separately.
7. 7. To turn it off flip the switch: this withdraws the grant, kills the input helper and ends any run (computerUseSession.ts:335-342,387).

**What the person sees and gets**

- Switch state, unavailable-reason note and per-permission status text in the section.
- When a run is active, a floating bar 'AGI is using your computer' with Take over and Stop (ComputerUseControlBar.tsx:22-58), and a native notification 'AGI is using your computer' (computerUseSession.ts:213-218).
- Refusal text returned to the model when off: 'Computer use is turned off in ... settings, so this step did not run...' (computerUseSession.ts:53).

**Settings**

- Preference computerUseEnabled, default false (apps/desktop/electron/garnishCore.ts:570).
- Permission capability computer.use, scope global, states prompt/granted/denied (computerUseSession.ts:32,96).
- Per-site mode for the Chrome extension: Ask first, Auto (default), Full access, YOLO (apps/extension/src/features/computer-use/askBeforeActing.ts:7-9).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop switch 'Any app' persists computerUseEnabled and re-reads status; turning it off stops computer use (apps/web/features/desktop-host/hooks/use-computer-use.ts; computerUseSession.ts:380-388).
- Off state refuses every screen step with a message for the model (computerUseSession.ts:261-263; dispatcher.ts:3423).
- Unsupported platform returns a reason: macOS only (computerUseService.ts:226-232). Missing Screen Recording and missing Accessibility each return their own reason text naming the System Settings path (computerUseService.ts:245-268).
- Accessibility and Screen Recording status rows with an Open System Settings action (DesktopPermissionsSection.tsx:41-90; systemPermissions.ts).
- The model is only offered screen tools when computer use is on and available (dispatcher.ts:2255,2297; device-tools.ts header comment).
- Chrome extension: per-site 'browser control' consent text 'This grants full DevTools-Protocol control' and a permission-mode setting (apps/extension/src/features/computer-use/browserControlConsent.ts:6-17; askBeforeActing.ts).

**Incomplete**

- The brief asks for a guided setup that grants the needed permissions. The code is a switch plus status rows and buttons, not a step-by-step wizard (ComputerUseSettings.tsx:171-233).
- The 'Chrome' row only shows pairing state and links to another section; pairing itself is done elsewhere (ComputerUseSettings.tsx:198-212).
- Screen Recording changes need the app relaunched; the message says so but the app does not relaunch itself (computerUseService.ts:245-258 text).

**Present but disconnected or switched off**

- Retained Tauri build has its own ComputerUseSettings with a consent dialog; it is internal code, not the public Desktop (apps/desktop/src/features/settings/ComputerUseSettings.tsx:1-14; doc: docs/decisions/2026-09-15-founder-decisions.md line 80-86).
- The surface matrix labels computer use 'experimental' (doc: docs/product/surface-feature-matrix.md:102).

**Not available**

- Web in a normal browser: section not rendered (ComputerUseSettings.tsx:159; brief S65.01 missing).
- CLI: no computer-use setup (brief S65.01 missing; doc: docs/product/surface-feature-matrix.md Computer use cli absent).
- Mobile and VS Code: not applicable (brief; matrix).
- Windows and Linux desktop: reported unsupported (computerUseService.ts:226-232).

## 4. Required behaviour

**Established requirements**

- The user turns computer use on in a guided setup that grants the needed permissions. (source: S65.01 (brief))
- The product explains which operating-system permissions computer use needs and how to grant them. (source: S65.02 (brief))
- Off refuses steps; unsupported platforms show a reason. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S65.01, S65.02)
- Browser and computer use need site/app permission prompts, clear visible state while AGI controls the computer, and a manual takeover path. (source: doc: docs/product/requirements.md section 21.4)
- Computer use is advertised only where the Electron implementation supports it. (source: doc: docs/decisions/2026-09-15-founder-decisions.md)
- Prefer typed connectors, then controlled browser automation, then screen-level computer use; no fallback bypasses permissions. (source: doc: docs/product/definition.md:143-147)

**Acceptance criteria**

1. With the setting at its default, the Any app switch is off and a screen step returns the 'turned off' refusal.
2. Turning the switch on on a Mac without Accessibility triggers the macOS Accessibility prompt and shows the Accessibility row as Not allowed or Not asked yet with an Open System Settings button.
3. After both macOS permissions are granted both rows read Allowed and the unavailable note disappears.
4. On a non-macOS system the switch shows the note 'Controlling the mouse and keyboard is supported on macOS only; this device runs <platform>.'
5. Turning the switch off while a run is active ends the run, shows no active bar and the next screen step is refused.
6. In a plain browser tab the Computer use section is not rendered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A tester should be able to complete setup without leaving the section except to macOS System Settings. [inferred from the Open System Settings button]
- The refusal text is written for the model so that it tells the user where to switch computer use on. [inferred from computerUseSession.ts:53]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Turn the rows into a guided checklist with a single 'Check again' that detects when Screen Recording needs relaunch.
- [proposed] Offer a Windows implementation or hide the section entirely on unsupported systems instead of showing a disabled switch.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComputerUseSettings | `apps/web/features/desktop-host/components/ComputerUseSettings.tsx` | Settings section: Any app switch, Chrome row, permission rows, allowed and refused app lists, takeover and stop buttons |
| hook | useComputerUse | `apps/web/features/desktop-host/hooks/use-computer-use.ts` | Reads status, refreshes on focus, calls enable, stop, take over, hand back, ask again |
| component | SystemPermissionRow and useDesktopPermissions | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | Shows macOS permission status and the Open System Settings button |
| service | runtime-client (readComputerUse, setComputerUseEnabled, openSystemPermissionSettings) | `apps/web/features/desktop-host/lib/runtime-client.ts` | Calls the desktop runtime commands from the page |
| config | settings modal registration | `apps/web/features/settings/components/WebSettingsModal.tsx` | Adds the 'computer-use' section only when an Electron host exists (line 251) |
| config | settings search fields | `apps/web/features/settings/components/web-settings-navigation.ts` | Lists Any app, Allowed apps, Refused apps for search (line 115) |
| service | computerUseSession | `apps/desktop/electron/runtime/computerUseSession.ts` | Status, enable/disable, run phases, stop shortcut, notifications |
| service | computerUseService | `apps/desktop/electron/runtime/computerUseService.ts` | Platform support, permission availability reasons, helper process, capture |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | Reads Accessibility and Screen Recording status, prompts, opens System Settings panes |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Command table: computer_use_set_enabled, computer_use_status, session gate for computer.use, host declaration |
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Stores computer.use grant and refusal state; withdrawGrant keeps a refusal |
| config | DEFAULT_PREFERENCES.computerUseEnabled | `apps/desktop/electron/garnishCore.ts` | Default off preference (line 570) |
| schema | ComputerUseStatus and front-window helpers | `packages/contracts/local-runtime/src/computer-use.ts` | Shared status type, stop shortcut constant, front-window refusals |
| schema | SYSTEM_PERMISSION_LABELS and PURPOSES | `packages/contracts/local-runtime/src/desktop-privacy.ts` | Visible permission names and purpose text |
| component | app menu stop, take over, hand back | `apps/desktop/electron/appMenu.ts` | File menu items for computer use (lines 196-212) |
| component | ComputerUseControlBar | `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx` | Floating bar shown while a run is active or paused |
| service | device tool offering | `apps/web/lib/device-steps/device-tools.ts` | Offers screen tools to the model only for capabilities the host declared |
| service | chat request processor (declared device host) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Believes a device declaration only from desktop and mobile, drops computer.use when a workspace admin disabled it (lines 3354-3375, 3708-3716) |
| component | browser control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Chrome extension per-site DevTools-Protocol consent text and storage |
| config | permission modes | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Ask first, Auto, Full access, YOLO; default Auto |
| component | Tauri ComputerUseSettings (retained) | `apps/desktop/src/features/settings/ComputerUseSettings.tsx` | Internal Tauri settings panel with consent dialog, not public Desktop |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips Any app in the Settings page, which runs inside the Electron window and calls the desktop runtime command computer_use_set_enabled. | device | apps/web/features/desktop-host/hooks/use-computer-use.ts; apps/desktop/electron/runtime/dispatcher.ts:2610-2611 |
| The shell saves computerUseEnabled and, when turning on, asks macOS for Accessibility if it is not trusted; turning off withdraws the grant, stops the helper and ends any run. | device | apps/desktop/electron/runtime/computerUseSession.ts:380-388; apps/desktop/electron/runtime/systemPermissions.ts |
| The page reads status: support, available reason, grant state, phase and the two system permission states. | device | apps/desktop/electron/runtime/computerUseSession.ts:90-106 |
| Before each chat request the page reads a device declaration; screen capability is declared only if enabled, available and not refused. The declaration is sent as a header to our server. | device and our servers | apps/desktop/electron/runtime/dispatcher.ts:2255-2279; apps/web/lib/device-steps/host-headers.ts |
| The server believes the declaration only for desktop and mobile surfaces, removes computer.use if the workspace administrator turned it off, and adds device tools to the model's tool list. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3354-3361, 3363-3375, 6359-6364 |
| When a step comes back, it runs on the desktop. If computer use is off, a step is refused before any prompt. | device | apps/desktop/electron/runtime/dispatcher.ts:3423; computerUseSession.ts:261-263 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| computerUseEnabled preference | Desktop settings store on the device (default false) | No sync found in the code reviewed | Persists until changed; unknown whether uninstall removes it |
| computer.use permission decision (granted, denied, prompt) | Desktop permission store on the device (permissionManager) | No sync found in the code reviewed | Grant is withdrawn when computer use stops; a refusal is kept until the person clears it (permissionManager.ts:183-191) |
| Device registry profile with computerUse capability flag | Our servers (device heartbeat endpoint, column computer_use_available) | Yes, sent by the desktop | Retention not established |

**Models and providers.** The settings and permission steps involve no model. Screen steps are chosen by a model in a cloud chat turn on our servers; the Desktop sends only the declaration and step results. Which providers can be used is decided by the chat route, not by this feature. (apps/web/lib/hooks/useChatStream.ts:1886-1899)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The settings switch works without an account in the code reviewed, but screen steps come only from a signed-in cloud chat turn (apps/web/lib/hooks/useChatStream.ts:1930-1938 sends a bearer token). |
| Permissions | macOS Accessibility and Screen Recording; the in-app computer.use grant; a per-task allow dialog; per-app grants (see F065-99) (apps/desktop/electron/runtime/dispatcher.ts:1920-1966). |
| Subscription | No plan check on the switch itself. Cloud model routing lists computer_use slots for Pro, Max and Enterprise plans and none for Free (packages/contracts/types/src/model-catalog.ts:1235-1372). Whether a Free user can start a screen turn is unknown. |
| Limits and metering | Monthly computer use requests are metered when the resolved model slot is a computer-use slot; a soft cap and hard cap are defined for one plan in the catalog (1,000 and 2,500) (packages/contracts/types/src/model-catalog.ts:1344-1345; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5624-5625,6132-6146). |
| Feature flags | Workspace feature access computer_use can withhold the capability for an organization (request-processor.ts:3363-3375). Settings nav marks the section with feature key computer_use (web-settings-navigation.ts:146). |
| Model compatibility | Not established from the code reviewed; the tool list is added for whatever model serves the turn (request-processor.ts:6359-6364). |
| Provider restrictions | none found in the code |
| Local mode | Screen steps are requested by the cloud tool loop through x_device_step_request (apps/web/lib/hooks/useChatStream.ts:3549-3552); the desktop registry profile reports localModels false (apps/desktop/electron/runtime/dispatcher.ts:2297 vicinity). No path where a local model drives computer use was found. Whether Local or own-key chat can reach it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Switch is disabled until status is read (disabled when status is null). | apps/web/features/desktop-host/components/ComputerUseSettings.tsx:187-190 |
| Error reading or changing status | Alert text 'Computer use settings could not be read from the app.' or 'The app did not make that change.' | apps/web/features/desktop-host/hooks/use-computer-use.ts:20-21 |
| Unsupported platform | Reason text under the switch; steps fail with unsupported-platform. | computerUseService.ts:226-232; dispatcher.ts:3199-3207 |
| Permission denied by macOS | Row shows 'Not allowed' in the failure style with the Open System Settings button; managed devices show 'Blocked by your organization'. | DesktopPermissionsSection.tsx:41-50,68-84 |
| Refused at the prompt | 'Refused for now' row with 'Ask again' that clears the computer.use decision. | ComputerUseSettings.tsx:214-226; use-computer-use.ts askAgain |
| Offline | not handled in the code reviewed for this feature; the section is local to the device. | No offline branch found in ComputerUseSettings.tsx or use-computer-use.ts |
| Accessibility | Switch has aria-label 'Any app'; the control bar is a status region with aria-live polite; keyboard use of the app picker is tested. | ComputerUseSettings.tsx:189; ComputerUseControlBar.tsx:27-30; apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx:254 |
| App differences | Web outside Desktop renders nothing; Chrome has a separate mode selector; CLI none. | ComputerUseSettings.tsx:159; askBeforeActing.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Renders nothing in a browser; switch and Chrome row under Control; empty and filled allowed and refused lists; help link; refuse-app picker; no Add app where computer use cannot run; search index fields
- `apps/desktop/electron/__tests__/computerUseSession.test.ts`: Stopping withdraws the grant; stopping never clears a refusal
- `apps/desktop/electron/__tests__/computerUseServiceSecureInput.test.ts`: Front-app and secure-input read without Accessibility; refuses off macOS without starting the helper
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher commands including computer use (73 matches for 'computer'; specific cases not individually read)
- `apps/web/lib/device-steps/__tests__/device-tools.test.ts`: Device tools offered only for declared capabilities (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.workspace-controls.test.ts`: Workspace controls withholding device capabilities (by file name; contents not read)
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Chrome extension browser control consent (by file name)
- `apps/extension/__tests__/computer-use-default-ask.test.ts`: Default ask behaviour of the extension (by file name)

**Test scenarios**

- **Default off refuses**
  1. Fresh Desktop profile on a Mac
  2. Open Settings, Computer use
  3. Ask the agent in chat to click something
  - Expected: Switch is off and the model is told computer use is turned off in settings.
- **Permission guidance**
  1. Turn on Any app with Accessibility off
  2. Read the Accessibility row
  3. Press Open System Settings
  - Expected: Row says Not allowed (or Not asked yet) and the macOS Accessibility pane opens.
- **Unsupported platform**
  1. Open the same section in AGI Desktop on Windows or Linux
  - Expected: Note reads 'Controlling the mouse and keyboard is supported on macOS only; this device runs <platform>.'
- **Switch off during a run**
  1. Start a screen task and allow it
  2. Flip Any app off
  - Expected: Run stops, control bar disappears, next step is refused.
- **Browser tab**
  1. Open the web app in a normal browser
  2. Open Settings
  - Expected: No Computer use section.

**Where to look when it fails**

- Desktop telemetry events domain desktop_control with outcome started, ok or refused (computerUseSession.ts:212,241,338).
- Error name ComputerUseRefused with reasons permission, unsupported, failed, paused mapped to permission-denied, unsupported-platform or io-error (dispatcher.ts:3199-3207).
- Server audit event type computer_use_action for screen tools (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3503-3507).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/065-computer-use-experience.md](../../70-qa/test-plans/desktop/065-computer-use-experience.md)
- Chrome: [70-qa/test-plans/chrome/065-computer-use-experience.md](../../70-qa/test-plans/chrome/065-computer-use-experience.md)

## 10. Gaps and dependencies

- **Setup is a switch and status rows, not a guided flow** Affects: Desktop users on a Mac. Evidence: ComputerUseSettings.tsx:171-233 versus S65.01 Should. Work needed: Add a guided checklist that detects each permission and needed relaunch.
- **No setup on Web outside Desktop or on CLI** Affects: Web and CLI users. Evidence: Brief S65.01 web missing, cli missing; ComputerUseSettings.tsx:159. Work needed: Decide whether those surfaces should show an explanation or hand off to Desktop.
- **Windows and Linux are unsupported** Affects: Non-Mac desktop users. Evidence: computerUseService.ts:226-232. Work needed: Native input helper per platform, or hide the section.
- **Chrome and Desktop pairing setup is split across two sections** Affects: Users of both. Evidence: ComputerUseSettings.tsx:198-212. Work needed: Unify or link clearly.
- **Free-plan behaviour unknown** Affects: Free users. Evidence: model-catalog.ts free tier lists no computer_use slot. Work needed: State and test what a Free user sees.
- Not built on: Web, CLI (from the capability ledger).

**Depends on**

- surface:desktop
- surface:chrome
- mode:cloud
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- file:apps/desktop/electron/runtime/computerUseSession.ts
- file:apps/web/features/desktop-host/components/ComputerUseSettings.tsx
- F065-99
- store:desktop-permission-store

## Unknown

- Whether Local or own-key chats can ever offer screen tools.
- Whether a Free account can run a screen turn (no plan check found; catalog lists no computer_use slot for Free).
- Whether the computerUseEnabled preference is removed on uninstall.
- What the exact label of the settings navigation entry is (only the section heading 'Computer use' and field labels were read).
- Whether the BrowserPairingSection fully matches the Chrome row (file not read).
- Brief code references for the extension side_panel.ts and CLI files did not match the files at those lines and were not used.
