---
id: "F086-11"
type: "feature"
title: "Local folders, websites, apps, clipboard and screen"
aliases: ["Local folders, websites, apps, clipboard and screen", "Local access", "Desktop permissions", "Approved folders", "Approved sites", "Site allowlist", "application.control", "clipboard.read", "screen.capture", "S86.16", "S86.17", "S86.18", "S86.19", "S86.22"]
area: "86 Security and connected-access settings"
available_on: ["desktop", "cli", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S86.16", "S86.17", "S86.18", "S86.19", "S86.22"]
depends_on: ["surface:desktop", "surface:web", "surface:chrome", "surface:cli", "mode:local", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-local-inference", "store:desktop-permissions", "file:apps/desktop/electron/runtime/permissionManager.ts", "file:apps/extension/src/features/options/site-allowlist.ts", "F086-10", "F086-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-11 Local folders, websites, apps, clipboard and screen

Controls what AGI may use on the person's own computer. Desktop lists approved folders, remembered answers (apps, clipboard) and system permission status; Chrome keeps an approved-sites list backed by real browser host permission; the CLI limits file reach to the folder it runs in plus added folders. Screen access has no dedicated preference.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.16](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8616), [S86.17](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8617), [S86.18](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8618), [S86.19](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8619), [S86.22](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8622).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Asks before the agent touches an app, reads the clipboard through copy and paste keys, or uses a folder, remembers the answer for this session or for good, and lets the person review and remove it. Desktop also shows the status of operating-system permissions (apps/desktop/electron/runtime/permissionManager.ts:107-189, 299-313; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:195-235).

**Why it exists.** An agent that can click and type on a person's computer can reach anything signed in. The person must decide, and be able to take it back (doc: docs/product/requirements.md section 9.7).

**Who uses it.** People using Desktop computer use or folders, the Chrome extension on sites, and the CLI in terminals.

**Problems it solves**

- The agent controlling an app the person did not intend.
- Silent clipboard reads.
- Unclear why screen capture fails on macOS.
- Chrome access to sites the person never approved.

**Use cases**

- Allow the agent to control one app for this session, and refuse another app for good.
- Remove a remembered 'Always allowed' answer so Desktop asks again.
- Add a folder with 'Add a folder' and later 'Remove access'.
- Approve a site in Chrome options and later remove it, which also removes the host permission.

## 2. User experience

**Where to find it**

- Desktop (and web): Settings, Capabilities, 'Local access' with 'Folders' and 'Commands' (apps/web/features/desktop-host/components/LocalAccessSection.tsx:37-55, 213).
- Desktop: Settings, General desktop settings, then 'Permissions' with 'Your answers' and a system privacy settings group (DesktopSettingsSection.tsx imports DesktopPermissionsSection; DesktopPermissionsSection.tsx:28-37, 195-235).
- Chrome: extension Options, permissions section, 'Approve a site so the assistant can act on it, and remove it any time.' with Add and a list ('No sites allowlisted yet.') (apps/extension/src/options.ts:1337-1345, 1403-1412).
- CLI: --add-dir, /add-dir, /remove-dir and /trust grant (apps/cli/src/lib.rs:409-411; apps/cli/src/claude_parity.rs:332-380; apps/cli/src/tui/tui_app.rs:7389).
- Phone, VS Code: not applicable here.

**Before you start**

- Desktop: the Electron host (host check useElectronHost); settings are hidden otherwise (DesktopPermissionsSection.tsx:195).
- Screen, accessibility and microphone permissions at operating-system level (SYSTEM_PERMISSION_KINDS: Screen Recording, Accessibility, Microphone) (packages/contracts/local-runtime/src/desktop-privacy.ts:3, 10-20).
- Chrome: Add must run from a real click so Chrome can show its permission prompt (apps/extension/src/features/options/site-allowlist.ts:86-97).

**Screens and controls**

- Desktop answer rows: label plus hint 'Allowed until you quit the app', 'Allowed once', 'Always allowed', 'Refused until you quit the app' or 'Always refused'; button 'Remove' or 'Ask again' (DesktopPermissionsSection.tsx:87-99, 165-181).
- System rows: status text Allowed, Not allowed, Not asked yet, Blocked by your organization, Not needed on this computer, and an 'Open System Settings' button when action is needed (DesktopPermissionsSection.tsx:48-85).
- 'Refresh' button on the system group.
- Run-time prompt 'Permission required': 'Allow <app> to control <name>?' with Deny, 'Allow this session' and 'Never allow' (permissionManager.ts:356-389; applicationControl.ts:104-120).
- Clipboard prompt for copy and paste key combos: Deny, 'Allow this session', 'Always allow' (permissionManager.ts:360-366; computerUseSteps.ts:58-73).
- 'Check this step' warning dialog for password-field typing with Deny and 'Allow once' (computerUseSteps.ts:84-117).
- Folders: 'Add a folder'; remove with a confirmation 'Remove access to <name>?' and button 'Remove access' (LocalAccessSection.tsx:55-56 and the section's remove handler).

**Journey**

1. The agent wants to click in an app.
2. Desktop shows the permission prompt naming the app and what it can do.
3. The person chooses Deny, Allow this session or Never allow; closing the dialog grants nothing.
4. Later the person opens Settings, Permissions, sees the answer, and presses Remove or Ask again.
5. For folders the person adds one with the system chooser and removes it with confirmation.
6. In Chrome the person opens the current tab's origin in Options, presses Add, accepts Chrome's prompt, and removes it later from the list.

**What the person sees and gets**

- Row hints state how long an answer lasts.
- 'Permissions could not be read from the app.', 'That answer was not removed.', 'That app was not added to Refused apps.' (DesktopPermissionsSection.tsx:38-40).
- Folder messages: 'Approved folders could not be read.', 'That folder was not approved.', 'That folder was not removed.' (LocalAccessSection.tsx:51-53).
- macOS only: dialog 'Screen recording permission needed' once per run when capture is denied or restricted (apps/desktop/electron/screenshot.ts:39-50).
- Agent receives a plain refusal text when a step is refused (applicationControl.ts:70-72).

**Settings**

- Desktop decisions file desktop-permissions.json under the app's user-data folder (permissionManager.ts:49-50).
- Chrome storage key agi_site_allowlist and a user site blocklist (apps/extension/src/background/policy.ts:187; options.ts:1170-1177).
- CLI additional roots list for the session (apps/cli/src/lib.rs:6080-6083).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop remembers granted or denied decisions per capability and scope: session decisions in memory, 'always' decisions persisted atomically; a corrupt store means everything asks again (permissionManager.ts:34-104, 127-150).
- High-risk capabilities (computer use, application control, shell, remote host, browser internals, destructive git) never get a permanent grant from the prompt; only 'Never allow' can be permanent, as a refusal (permissionManager.ts:360-395; packages/contracts/local-runtime/src/capabilities.ts:66-73).
- Each run step re-checks application permission and clipboard permission before acting, and a closed prompt or a stopped run leaves the app untouched (apps/desktop/electron/runtime/applicationControl.ts:121-133; computerUseSteps.ts:119-135).
- The agent may not control AGI's own window (applicationControl.ts:135-146).
- Settings list answers and revoke them; application answers are handled in a separate refused-apps flow (DesktopPermissionsSection.tsx:195-216).
- Folders: list, pick and revoke roots; revoking stops work in that folder first (apps/desktop/electron/runtime/dispatcher.ts:2312-2321; apps/web/features/desktop-host/lib/runtime-client.ts:123-165).
- Chrome approves a site only with a Chrome host-permission grant and removes it on delete (site-allowlist.ts:86-120).
- CLI adds and removes extra working directories and lists them (claude_parity.rs:332-380).

**Incomplete**

- Screen sharing preferences: there is no dedicated control; only the Screen Recording system row and the one-time macOS dialog exist (DesktopPermissionsSection.tsx:48-85; screenshot.ts:39-50). The brief points at DesktopSettingsSection.tsx:47, which holds only labels and imports.
- The draft cited apps/cli/src/tui/tui_app.rs:3868 for CLI folders; that line is input handling. CLI folder access is --add-dir, /add-dir, /remove-dir and /trust (apps/cli/src/lib.rs:409-411).
- 'Allowed once' appears in the hint text but one-time decisions are excluded from the review list (permissionManager.ts:299-313).

**Present but disconnected or switched off**

- Tauri desktop settings (apps/desktop/src) are internal; the public Desktop shows web settings (doc: AGENTS.md section 5).

**Not available**

- The macOS-only screen dialog is not shown on other platforms (screenshot.ts:40).
- Phone, VS Code: not applicable (brief).

## 4. Required behaviour

**Established requirements**

- The user can choose which local folders AGI may read or write, see the list and remove access. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.16)
- The user can choose which websites AGI may read or act on and remove them later. (source: S86.17 (same brief))
- The user can choose which desktop applications AGI may control and revoke that. (source: S86.18 (same brief))
- The user controls whether AGI may read the clipboard and can review or withdraw that permission. (source: S86.19 (same brief))
- The user can set preferences for whether and how AGI may see the screen. (source: S86.22 (same brief))
- A refused or closed prompt leaves the app untouched. (source: apps/desktop/electron/runtime/applicationControl.ts:121-133)
- Each run step re-checks the application and clipboard permission before acting. (source: apps/desktop/electron/runtime/computerUseSteps.ts:119-135)
- On macOS with screen capture blocked, Desktop shows a one-time explanation dialog. (source: apps/desktop/electron/screenshot.ts:39-50)
- Browser actions on new or sensitive domains and computer-use actions with consequences need approval prompts. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. A step aimed at an app with no answer shows the permission prompt and does not run until the person chooses.
2. Choosing Deny, closing the dialog or stopping the run leaves the app untouched and the answer is Refused until quit.
3. Choosing 'Never allow' records Always refused and a later step on that app is refused without a prompt.
4. Removing an answer in Settings makes Desktop ask again.
5. Pressing copy or paste key combinations the first time asks about the clipboard; refusing blocks the key press.
6. In Chrome, Add triggers Chrome's host-permission prompt and Remove deletes the host permission and list entry.
7. With macOS screen capture denied, a capture shows the explanation dialog once per run.
8. Removing a folder asks first and stops work in that folder.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Brief item S86.22 is only partly met because the person cannot set preferences, only view the OS state.
- [inferred] 'Always allow' for the clipboard is consumed as single use after the step (consumeSingleUse, computerUseSteps.ts:72), so a standing clipboard grant may behave per use; confirm in tests.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Screen sharing row that explains what capture is used for and links to the OS setting.
- [proposed] Show CLI added folders in the settings of Desktop when the CLI runs from Desktop.
- [proposed] Show remembered site answers in the same list as app answers on Desktop for the paired browser.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | permissionManager | `apps/desktop/electron/runtime/permissionManager.ts` | Decisions store, prompt, review, revoke. |
| service | applicationControl | `apps/desktop/electron/runtime/applicationControl.ts` | Per-app gate before click, type, scroll. |
| service | computerUseSteps | `apps/desktop/electron/runtime/computerUseSteps.ts` | Clipboard key gate, step review, step runner. |
| service | dispatcher permission and workspace commands | `apps/desktop/electron/runtime/dispatcher.ts` | workspace_*_root and permission_* commands (lines 2312-2330). |
| service | screenshot | `apps/desktop/electron/screenshot.ts` | Screen capture and macOS blocked-capture dialog. |
| config | desktop-permissions.json | `apps/desktop/electron/runtime/permissionManager.ts` | Persistent decisions file. |
| config | capabilities contract | `packages/contracts/local-runtime/src/capabilities.ts` | Capability list, durations, high-risk set, permission commands. |
| config | desktop-privacy contract | `packages/contracts/local-runtime/src/desktop-privacy.ts` | System permission kinds and labels. |
| component | DesktopPermissionsSection | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | Answers and system rows UI. |
| component | LocalAccessSection | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Folders, commands, withdraw. |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Hosts the permissions section. |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Hosts Local access. |
| service | desktop runtime client | `apps/web/features/desktop-host/lib/runtime-client.ts` | Calls to the Desktop host for roots and permissions. |
| service | site-allowlist | `apps/extension/src/features/options/site-allowlist.ts` | Origin normalising and host permission request, check, remove. |
| screen | Chrome options page | `apps/extension/src/options.ts` | Approved sites list and consent. |
| config | agi_site_allowlist | `apps/extension/src/background/policy.ts` | Storage key for approved origins. |
| service | CLI add-dir handling | `apps/cli/src/claude_parity.rs` | /add-dir and /remove-dir. |
| service | CLI path security | `apps/cli/src/path_security/file_authority.rs` | Workspace root registration (register_additional_workspace_root called at lib.rs:6080). |
| test | permissionManager tests | `apps/desktop/electron/__tests__/permissionManager.test.ts` | Decision store behaviour. |
| test | site allowlist tests | `apps/extension/__tests__/site-allowlist-host-permission.test.ts` | Host permission handling. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The agent issues a computer step; the runner finds which app is under the pointer or in front. | device | apps/desktop/electron/runtime/applicationControl.ts:73-100 |
| Stored state for application.control and that app is read; if none, a native dialog asks. | device | applicationControl.ts:104-120; permissionManager.ts:107-112, 334-389 |
| The answer is recorded in memory (session) or in desktop-permissions.json (always). | device | permissionManager.ts:127-150 |
| The step runs only on 'granted'; otherwise a refusal text goes back to the agent. | device | applicationControl.ts:125-133 |
| Clipboard key combos ask for clipboard.read the same way. | device | computerUseSteps.ts:58-73 |
| The Settings page (served by our web app) calls the Desktop host to list, remove or refuse decisions. | device and our servers | runtime-client.ts:441-460; dispatcher.ts:2322-2328 |
| Chrome: Add asks Chrome for host access for the origin, then saves it in local storage. | device | site-allowlist.ts:86-97; options.ts:1170-1177 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Permission decisions (capability, scope, state, duration, time, label) | desktop-permissions.json in the Desktop user-data folder; session ones in memory | No; device only | Removed by Remove or Ask again; corrupt file treated as empty |
| Approved folders (workspace roots) | Desktop host root list | No evidence of sync | Removed by 'Remove access' |
| Approved sites | chrome.storage.local key agi_site_allowlist and Chrome host permissions | Not synced by the code read | Removed from list and host permission |
| CLI added directories | In the running session | No | Until /remove-dir or exit |

**Models and providers.** No model or provider decides these permissions. They gate what an agent step may do whichever model or provider drives the agent. Screenshots later sent to a model are a separate trust-boundary question (doc: docs/product/requirements.md section 9.7).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop decisions are device-local and need no sign-in in the code read; the web page that shows them is served after sign-in. |
| Permissions | Operating-system permissions (Screen Recording, Accessibility, Microphone) are decided in the OS; the app can only open System Settings (DesktopPermissionsSection.tsx:70-85). 'Blocked by your organization' is shown when the OS says restricted (line 48-54). |
| Subscription | none found in the code for these permission controls. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Fully local: decisions, folders, sites and clipboard answers are stored on the device and need no paid plan. Local inference is itself a capability 'local.inference' in the same capability list (packages/contracts/local-runtime/src/capabilities.ts:25). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Spinner 'Loading permissions'. | DesktopPermissionsSection.tsx:203-205 |
| empty | 'None yet. Desktop asks the first time it needs each permission.' | DesktopPermissionsSection.tsx:30 |
| error | Alert text; refresh on window focus and on permission-changed events. | DesktopPermissionsSection.tsx:121-144, 197-201 |
| prompt closed or dismissed | Recorded as a session denial; nothing runs. | permissionManager.ts:395-402 |
| a second request for the same permission while asking | Joins the open question; no stacked dialog. | permissionManager.ts:326-333 |
| run stopped during prompt | Step does not run. | applicationControl.ts:120-127 (comment) |
| store cannot be written | Warning logged and retried on next review. | permissionManager.ts:88-102, 299-301 |
| macOS screen capture denied | One-time dialog; relaunch needed. | screenshot.ts:39-50 |
| Chrome host permission refused | Request returns false; site not added [inferred from the function result]. | site-allowlist.ts:86-97 |
| Chrome host permission cannot be removed | List entry removed anyway. | site-allowlist.ts:116-119 |
| offline, timeout | not handled in the code for local prompts | looked in permissionManager.ts and applicationControl.ts; no timeout branch found |
| accessibility | Buttons carry aria-labels such as 'Remove: <label>' and 'Open System Settings for <name>'. | DesktopPermissionsSection.tsx:77, 124 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/permissionManager.test.ts`: Decision store.
- `apps/desktop/electron/__tests__/permissionCore.test.ts`: Core evaluation.
- `apps/desktop/electron/__tests__/permissionPolicy.test.ts`: Permission policy.
- `apps/desktop/electron/__tests__/computerUseSteps.test.ts`: Step gating.
- `apps/desktop/electron/__tests__/screenshot.test.ts`: Capture behaviour.
- `apps/desktop/electron/__tests__/applicationsFolder.test.ts`: Applications list.
- `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx`: Local access section.
- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Computer use settings.
- `apps/extension/__tests__/site-allowlist-host-permission.test.ts`: Host permission handling.
- `apps/extension/__tests__/site-allowlist-options.test.ts`: Options list.
- `apps/extension/__tests__/host-permission-reconcile.test.ts`: Reconcile list and host permissions.
- `apps/extension/__tests__/site-permission-policy.test.ts`: Site policy.

**Test scenarios**

- **App prompt and refusal**
  1. Start computer use.
  2. Let the agent target an app with no answer.
  3. Choose Deny.
  - Expected: App untouched; Settings shows 'Refused until you quit the app' with Ask again.
- **Never allow**
  1. Repeat and choose Never allow.
  2. Restart Desktop.
  - Expected: Settings still shows Always refused; no prompt on later steps.
- **Clipboard**
  1. Have the agent press the paste key combination.
  - Expected: A clipboard prompt appears once; refusal blocks the key press.
- **Folder removal**
  1. Add a folder.
  2. Remove it and confirm.
  - Expected: Folder leaves the list and work in it stops.
- **Chrome site**
  1. Open options on a site tab.
  2. Press Add and accept Chrome's prompt.
  3. Remove the site.
  - Expected: Entry appears and disappears; host permission removed.
- **macOS screen capture blocked**
  1. Deny Screen Recording in System Settings.
  2. Take a screenshot in Desktop.
  - Expected: One-time explanation dialog.

**Where to look when it fails**

- Warning '[permissions] could not persist decisions:'.
- Row label states in Settings, Permissions.
- Chrome extension storage key agi_site_allowlist.
- Desktop runtime events permission-changed and computer-use-changed.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- CLI: [70-qa/test-plans/cli/086-security-and-connected-access-settings.md](../../70-qa/test-plans/cli/086-security-and-connected-access-settings.md)
- Chrome: [70-qa/test-plans/chrome/086-security-and-connected-access-settings.md](../../70-qa/test-plans/chrome/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **No dedicated screen-sharing preference (S86.22).** Affects: Desktop users.. Evidence: DesktopPermissionsSection.tsx:48-85; screenshot.ts:39-50. Work needed: Add a Screen row with purpose text, or restate the requirement.
- **Folder access differs per surface: Desktop list with removal, CLI per-session add-dir; no shared list.** Affects: Desktop, CLI.. Evidence: LocalAccessSection.tsx; claude_parity.rs:332-380. Work needed: Decide if CLI folders should persist and show in Desktop.
- **Draft evidence for the CLI folder control (tui_app.rs:3868) is wrong.** Affects: Documentation.. Evidence: apps/cli/src/tui/tui_app.rs:3850-3890. Work needed: Use corrected paths.
- **Empty state, waiting state and plan limits for the Folders list are not verified.** Affects: Desktop.. Evidence: LocalAccessSection.tsx. Work needed: Read the empty branch and add a test.
- **macOS-only explanation; no equivalent on other platforms.** Affects: Windows and Linux Desktop.. Evidence: screenshot.ts:40. Work needed: Check platform behaviour.

**Depends on**

- surface:desktop
- surface:web
- surface:chrome
- surface:cli
- mode:local
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-local-inference
- store:desktop-permissions
- file:apps/desktop/electron/runtime/permissionManager.ts
- file:apps/extension/src/features/options/site-allowlist.ts
- F086-10
- F086-12

## Unknown

- Whether the Chrome extension's remove path in options.ts also ends in-flight runs.
- Exact CLI persistence of /trust grants and added folders.
- Windows and Linux behaviour of system permission rows.
- Whether Desktop folders are synced to other devices.
- Empty-state copy of the Folders list.
- Whether the paired-browser site decisions (browser.site) appear in 'Your answers' for every case.
