---
id: "F078-07"
type: "feature"
title: "Permission explanations"
aliases: ["Grant-permission explanation", "S78.21", "Permission explanations", "Permissions screen (mobile)", "App Permissions (mobile)", "Permissions (Desktop settings)", "Site access card (Chrome)", "Bypass Permissions consent (VS Code)", "Permission required dialog (Desktop)", "Workspace policy approval (CLI)"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-security-and-privacy", "SYS-voice-and-media", "SYS-authorization-and-workspaces", "SYS-shared-ui-and-design", "file:apps/mobile/src/features/settings/permissions/registry.ts", "file:apps/desktop/electron/runtime/permissionManager.ts", "file:apps/extension-vscode/src/features/permissions/agentModeConsent.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-07 Permission explanations

When a feature needs a permission (microphone, camera, site access, agent autonomy, computer control), each app tells the person what the permission is for and how to change it later. There is no single shared component: Mobile, Desktop, Chrome, VS Code and CLI each have their own registry, dialog or prompt. Web dictation explains only after a denial.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.21](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7821).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person a plain-words reason for each permission a feature needs, at or before the moment it is asked, and a way to see and change the answer later. Mobile keeps a registry of eight device permissions with a one-line purpose each and a status screen. Desktop shows a question dialog with a reason and a Settings list of answers and operating-system permissions. Chrome shows a site-access card before browser control starts. VS Code shows a modal warning before the Bypass Permissions agent mode. The CLI shows an approval prompt with a summary and detail lines before a tool runs. (apps/mobile/src/features/settings/permissions/registry.ts; apps/desktop/electron/runtime/permissionManager.ts; apps/extension/src/features/side-panel/bubbles.ts:1399; apps/extension-vscode/src/features/permissions/agentModeConsent.ts; apps/cli/src/tui/approval_broker.rs:220)

**Why it exists.** An operating system or browser prompt says only 'allow microphone'. The person needs to know why AGI wants it and what it can do with it, so they can say yes with confidence and know where to undo it. The brief's requirement is that the explanation comes before or at the request, never only after a denial (brief S78.21). AGENTS.md section 9 also requires that an action a user cannot undo asks first and names the consequence (doc: AGENTS.md).

**Who uses it.** Any signed-in or local user of the six apps who starts dictation, a camera or photo attach, browser control, computer control, or an agent mode that removes approval prompts. Testers and engineers use it to check that permission copy is complete.

**Problems it solves**

- A person is asked for the microphone, camera, calendar or notifications with no reason given.
- A person denied a permission once and cannot find how to grant it later.
- An agent mode that removes approval prompts is switched on without the person understanding the risk.
- A site is granted to the browser agent without the person knowing what page content is sent to the cloud.

**Use cases**

- Mobile: open Settings, Safety & Security, Permissions, and read 'Used for voice input and audio recording.' under Microphone, then tap it to see the status and an Open Settings button.
- Chrome: the agent needs a site, so the side panel shows 'AGI needs access to <site>' with what is read, what is sent to AGI Cloud, and buttons to allow once, always allow or decline.
- VS Code: switch the agent mode to Bypass Permissions and a modal 'Turn on Bypass Permissions?' lists what it removes before it is applied.
- Desktop: the agent wants to control the mouse and keyboard, and a 'Permission required' dialog says what it wants to do and why, with Deny, Allow this session, or Always allow.

## 2. User experience

**Where to find it**

- Mobile: Settings, Safety & Security, then Permissions (screen title 'Permissions', section 'App Permissions'); each row opens a detail screen. Also reachable from the Capabilities screen. (apps/mobile/src/features/settings/permissions/index.tsx)
- Desktop (the Electron app showing the hosted web app): Settings section 'Permissions' with 'Your answers' and an operating-system group with an 'Open System Settings' button. (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:33-38)
- Desktop: native 'Permission required' dialog raised when the agent first needs a capability. (apps/desktop/electron/runtime/permissionManager.ts)
- Web: the microphone button in the chat composer (dictation). The only explanation is the error text shown after a denial. (apps/web/features/chat/stores/voice-input-store.ts:452)
- Chrome: inline card in the side panel titled 'AGI needs access to <host>', plus a history-search card and a 'AGI wants to start a browser task' card. (apps/extension/src/features/side-panel/bubbles.ts:1399; apps/extension/_locales/en/messages.json:4280)
- VS Code: modal warning 'Turn on Bypass Permissions?' and 'Use Max reasoning with Bypass Permissions?' when the agent mode or effort is changed in the mode picker or Settings. (apps/extension-vscode/src/features/permissions/agentModeConsent.ts)
- CLI: approval prompt in the terminal interface before a tool runs, including 'Workspace policy requires approval for <tool>'. (apps/cli/src/tui/approval_broker.rs; apps/cli/src/features/exec/tools/mod.rs)

**Before you start**

- Mobile: a device that reports the permission as available; Face ID, Speech Recognition, Photos & Files, Reminders rows show on iOS only, and the Face ID row only on a Face ID device. (apps/mobile/src/features/settings/permissions/registry.ts)
- Desktop: the Electron host must be present, otherwise the Permissions section renders nothing. (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx)
- Chrome: the person is signed in and starts a browser task on a web page; account pages are refused. (apps/extension/src/side_panel.ts:14000)
- VS Code: a workspace is open, because Bypass consent is stored per workspace. (apps/extension-vscode/src/features/permissions/agentModeConsent.ts)
- Dictation (web): dictation switched on in Voice settings and not switched off by the server. (apps/web/features/chat/hooks/use-dictation.ts)

**Screens and controls**

- Mobile Permissions list: icon, label, one-line purpose and a status label per row (for example 'Never', 'Ask', 'While using', 'Always'); a footer line 'AGI asks only when a feature you started needs access.' and a link 'Get help with permissions'. (apps/mobile/src/features/settings/permissions/index.tsx; types.ts)
- Mobile permission detail: headline ('Access Granted', 'Not Requested', 'Access Denied'), a status explanation, and a button 'Allow <label>' when not yet decided or 'Open Settings' when decided. (apps/mobile/src/features/settings/permissions/Detail.tsx; types.ts)
- Mobile voice denial alert 'Voice input unavailable' with buttons 'Not now' and 'Open Settings'. (apps/mobile/src/features/voice/components/voicePermissionAlert.ts)
- Desktop dialog: title 'Permission required', question 'Allow <app> to <action>?', detail with the reason, buttons Deny, 'Allow this session' and (for lower-risk capabilities) Always allow; a high-risk capability says it lasts until the app quits. (apps/desktop/electron/runtime/permissionManager.ts)
- Desktop settings: status texts 'Allowed', 'Not allowed', 'Not asked yet', 'Blocked by your organization', 'Not needed on this computer'; hint 'Computer use, screenshots and dictation need these.' (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:43-48)
- Chrome site card: body text for read access or act access, buttons 'Allow for this task', 'Always allow on this site' (act only) and 'Decline'. (apps/extension/src/features/side-panel/bubbles.ts:1399-1440)
- VS Code modal: Cancel and confirm buttons with a long detail text naming what is granted. (apps/extension-vscode/src/features/permissions/agentModeConsent.ts)

**Journey**

1. Person starts a task that needs a permission (dictation, camera, site, agent mode, tool).
2. The app checks the stored answer. If already decided, it does not ask again (Desktop returns the stored state; Chrome checks the approved-site list). (apps/desktop/electron/runtime/permissionManager.ts; apps/extension/src/side_panel.ts:14016)
3. If not decided, the app shows its own explanation (Desktop dialog, Chrome card, VS Code modal, CLI approval) or goes straight to the system prompt (web and mobile dictation).
4. Person answers. The answer is stored (Desktop decisions, Chrome approved sites, VS Code workspace state, mobile status cache).
5. If denied, mobile shows an alert with an Open Settings button; web shows an error text telling the person to allow access in the browser settings; Desktop records a denial and does not re-prompt until the answer is removed.
6. Later the person reviews or changes the answer: mobile Permissions screen, Desktop 'Your answers' list, Chrome site settings, VS Code mode picker or Settings.

**What the person sees and gets**

- Mobile: status label and headline update after returning from device Settings because the screen re-reads the statuses when the app becomes active. (apps/mobile/src/features/settings/permissions/index.tsx)
- Mobile: a failed read shows 'Could not read some permissions from your device. The statuses shown may be out of date.' (apps/mobile/src/features/settings/permissions/index.tsx)
- Web dictation: 'Microphone permission denied. Please allow access in your browser settings.' and other specific microphone errors. (apps/web/features/chat/stores/voice-input-store.ts:452-466)
- Chrome: activity steps 'Allowed <host> this time', 'Always allowed <host>', 'Skipped: you declined access to <host>', 'Chrome did not grant access to <host>'. (apps/extension/_locales/en/messages.json:4340-4372)
- CLI: refusal text 'Tool <name> was not approved under the workspace policy.' (apps/cli/src/features/exec/tools/mod.rs:675-686)

**Settings**

- Mobile Permissions screen and per-permission detail screens (read-only status plus link to device Settings).
- Desktop Settings, Permissions: remove an answer to be asked again; 'Refused apps' for application control. (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx)
- Web and mobile Voice settings: dictation on or off and microphone choice. (apps/web/features/settings/sections/VoiceSection.tsx)
- VS Code settings agiWorkforce.agent.mode and agiWorkforce.agent.effort, guarded by the consent module. (apps/extension-vscode/src/features/permissions/agentModeConsent.ts)
- Chrome approved-sites list in the extension options. (apps/extension/__tests__/site-allowlist-options.test.ts covers it)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile has one registry with eight permission kinds, each with a label and a one-line purpose, plus status reading and request functions; the list screen and detail screen read from it, so the text is part of the definition and not written per screen. (apps/mobile/src/features/settings/permissions/registry.ts; index.tsx; Detail.tsx)
- Mobile detail screen explains each state ('Nothing is accessed until you allow it.', 'Only Settings can change this.') and opens device Settings with a fallback alert if that fails. (apps/mobile/src/features/settings/permissions/types.ts; Detail.tsx)
- Mobile also sets the iOS usage-description text for the microphone and speech recognition at build time, which is what the system prompt shows. (apps/mobile/app.config.js:171-173, 412-416)
- Mobile voice denial shows an alert with 'Open Settings'. (apps/mobile/src/features/voice/components/voicePermissionAlert.ts)
- Desktop asks with a dialog that carries a reason, remembers the answer so a denial is not re-prompted, and offers a settings list to remove answers and open the operating-system privacy panes. (apps/desktop/electron/runtime/permissionManager.ts; apps/desktop/electron/runtime/systemPermissions.ts)
- Desktop permission labels live in one table (CAPABILITY_LABELS) keyed by capability. (apps/desktop/electron/runtime/permissionManager.ts)
- Chrome shows a site-access card that says what is read, what is sent to AGI Cloud and when access ends, before it asks Chrome for the host permission; the copy is in the locale file, not in the screen code. (apps/extension/src/features/side-panel/bubbles.ts:1399; apps/extension/_locales/en/messages.json:4290-4296)
- VS Code shows a modal naming the risk before Bypass Permissions and again for Max effort with Bypass; a raw Settings edit that skips the modal is reverted until confirmed; consent is per workspace. (apps/extension-vscode/src/features/permissions/agentModeConsent.ts; apps/extension-vscode/src/__tests__/agentModeConsent.test.ts)
- CLI approval requests carry a summary, detail lines, a risk level and whether the action can be reversed. (apps/cli/src/tui/approval_broker.rs:98-215)
- Web MCP app cards show 'This app wants to use your camera and microphone.' and do not grant the device until the person allows. (apps/web/features/chat/components/messages/cards/McpAppCard.tsx:76; McpAppCard.test.tsx:177)

**Incomplete**

- Web dictation: the browser microphone prompt is raised directly by getUserMedia when recording starts, with no in-app reason shown first. The only explanation is the error after a denial. (apps/web/features/chat/stores/voice-input-store.ts:268, 452)
- Mobile dictation: tapping voice requests the microphone from the system directly; the reason shown is the iOS usage-description string, not an in-app explanation. The in-app purpose text exists only on the Permissions screen. (apps/mobile/src/features/voice/services/voiceInput.ts:216-240; apps/mobile/app.config.js:171)
- Permission text is not shared across apps: mobile registry, Desktop label table, Chrome locale strings, VS Code literals and CLI strings are separate copies. [inferred from the separate files read]
- Web gives no way to see or grant the browser microphone permission later other than the error text; no list of web permissions was found. [inferred; not found in apps/web/features/settings/sections]
- Desktop microphone: the label 'use the microphone' exists but no dispatcher command maps to it; the microphone is decided by Chromium handlers in main.ts, which grant audio to the trusted app origin without an in-app reason dialog. (apps/desktop/electron/runtime/permissionManager.ts; apps/desktop/electron/main.ts:844; apps/desktop/electron/permissionPolicy.ts)

**Present but disconnected or switched off**

- Mobile Permissions screen hides rows for kinds the device does not offer (Face ID on a device without it, iOS-only kinds on Android). (apps/mobile/src/features/settings/permissions/registry.ts PERMISSION_KINDS)
- Desktop 'Permissions' section returns nothing outside the Electron host. (apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx)

**Not available**

- Chrome and VS Code have no permission list screen of the mobile kind; Chrome has the approved-sites list in options and VS Code has settings. [inferred]
- CLI has no stand-alone permissions screen in the files read; permissions are per-prompt approvals and saved permission rules. (apps/cli/src/features/exec/tools/mod.rs saved_permission_commands)

## 4. Required behaviour

**Established requirements**

- The explanation appears before or at the moment of the system permission request, never only after a denial. (source: S78.21 (brief: when a feature needs a permission, the surface explains what it is for before or when asking))
- A denied permission shows how to grant it later in settings. (source: S78.21 (first-draft requirement in the task; mobile Detail.tsx 'Open Settings' and voicePermissionAlert.ts implement it))
- The explanation text is part of the permission definition, not written per screen. (source: S78.21 (first-draft requirement in the task; mobile registry.ts implements it))
- An action a user cannot undo asks first and the question names the consequence. (source: doc: AGENTS.md section 9)
- Product and company names come from the product-names registry, so permission copy should not hardcode them. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Mobile: every kind in the permission list shows a non-empty purpose line under its label and opens a detail screen with a status headline.
2. Mobile: with the microphone denied, tapping voice shows the alert 'Voice input unavailable' with an 'Open Settings' button that opens device settings.
3. Desktop: when the agent first needs a capability, a 'Permission required' dialog names the action and the reason; after Deny, the same request does not re-prompt until the answer is removed in Settings, Permissions.
4. Chrome: before any page text is read or acted on, the site card states what is read, what leaves the device and when access ends; Decline results in no host permission and a skipped step.
5. VS Code: selecting Bypass Permissions shows the modal; Cancel leaves the previous mode; confirming applies it only for the current workspace.
6. Web: clicking the microphone button states the purpose before the browser prompt, and a denial shows how to grant it later. (target; currently only the second half holds)
7. CLI: a tool that needs approval shows a summary and detail before the person answers, and a refusal is returned to the model as a failed result.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A single permission copy owner shared across apps would satisfy 'part of the permission definition' on every surface, not only mobile. [inferred]
- Web should offer the same pre-explanation as mobile, since web is also the Desktop window content. [inferred from AGENTS.md section 5: the public Desktop shows the hosted web app]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a short in-app reason line to the web dictation button's first use, shown before getUserMedia is called, and a link to browser site settings in the denial text.
- [proposed] Add the same in-app explanation before the first mobile voice request so the reason is not limited to the system prompt string.
- [proposed] Move permission labels and reasons for all apps into a shared contract so each surface renders the same words.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | PERMISSION_REGISTRY | `apps/mobile/src/features/settings/permissions/registry.ts` | Mobile definition of eight permissions: label, one-line description, icon, allowed levels, status read and request functions. |
| screen | PermissionsScreen | `apps/mobile/src/features/settings/permissions/index.tsx` | Mobile list of permissions with purpose and status; re-reads statuses when the app returns to the foreground. |
| screen | PermissionDetailScreen | `apps/mobile/src/features/settings/permissions/Detail.tsx` | Mobile detail with status headline, explanation and Allow or Open Settings button. |
| config | STATUS_HEADLINES and STATUS_EXPLANATIONS | `apps/mobile/src/features/settings/permissions/types.ts` | Shared mobile status words and explanations. |
| store | usePermissionsStore | `apps/mobile/stores/permissionsStore.ts` | Mobile cache of the last observed status per permission. [inferred from import in index.tsx; file not opened] |
| component | showVoicePermissionAlert | `apps/mobile/src/features/voice/components/voicePermissionAlert.ts` | Alert with Open Settings after a microphone denial. |
| service | requestMicPermission | `apps/mobile/src/features/voice/services/voiceInput.ts` | Reads then requests the microphone and speech permission before capture starts. |
| config | iOS usage descriptions and expo-speech-recognition strings | `apps/mobile/app.config.js` | Build-time text the system prompt shows for microphone, camera, photos and speech recognition. |
| service | requestPermission and CAPABILITY_LABELS | `apps/desktop/electron/runtime/permissionManager.ts` | Desktop question dialog with reason, stored decisions, review list for Settings. |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | Reads operating-system status for screen recording, accessibility and microphone, and opens the matching settings pane. |
| config | permissionPolicy | `apps/desktop/electron/permissionPolicy.ts` | Decides which browser permission requests the trusted app origin gets (audio only for media). |
| component | DesktopPermissionsSection | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | Desktop settings list of answers and operating-system permissions with Open System Settings. |
| config | SYSTEM_PERMISSION_LABELS | `packages/contracts/local-runtime/src/desktop-privacy.ts` | Shared labels for the three operating-system permissions. |
| hook | useDictation | `apps/web/features/chat/hooks/use-dictation.ts` | Web dictation state: start, stop, retry and the messages shown when it is off or refused. |
| store | useVoiceInputStore and buildMediaError | `apps/web/features/chat/stores/voice-input-store.ts` | Web microphone capture via getUserMedia and the error text per failure name. |
| component | McpAppCard deviceAccessSentence | `apps/web/features/chat/components/messages/cards/McpAppCard.tsx` | Web card that states which device features an embedded app wants before granting. |
| component | buildSiteGrantCard | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome site-access card with read or act body text and allow, always, decline buttons. |
| config | spBrowserAccess strings | `apps/extension/_locales/en/messages.json` | Chrome explanation copy kept in the locale file. |
| service | requestBrowserControlHostPermission flow | `apps/extension/src/side_panel.ts` | Chrome asks the browser for the host permission after the person chooses and records transient or approved sites. |
| service | agentModeConsent | `apps/extension-vscode/src/features/permissions/agentModeConsent.ts` | VS Code modal consent, per-workspace consent storage, revert of unconfirmed raw settings edits. |
| service | ApprovalRequest and ApprovalRequestKind | `apps/cli/src/tui/approval_broker.rs` | CLI approval prompt content: summary, detail, risk level, reversibility. |
| service | workspace_policy_gate | `apps/cli/src/features/exec/tools/mod.rs` | CLI prompt and refusal text when a workspace policy requires approval. |
| test | agentModeConsent tests | `apps/extension-vscode/src/__tests__/agentModeConsent.test.ts` | Covers VS Code consent behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile: person opens Settings, Safety & Security, Permissions; the screen reads the status of each permission from the device and shows the registry text. | device | apps/mobile/src/features/settings/permissions/index.tsx (pollAll calls entry.getStatus) |
| Mobile: person taps voice; the app reads the microphone and speech status and, if not granted, calls the system request; the system shows the build-time usage description. A denial throws 'mic-permission-denied' and an alert with Open Settings is shown. | device | apps/mobile/src/features/voice/services/voiceInput.ts:216-240, 417-427; voicePermissionAlert.ts |
| Web: person clicks the microphone button; useDictation checks the Voice setting and the server kill switch, then the store calls getUserMedia, which raises the browser prompt. A denial maps to a text by error name. | device | apps/web/features/chat/hooks/use-dictation.ts; apps/web/features/chat/stores/voice-input-store.ts:268, 452 |
| Web: after recording stops, the audio is sent to the transcription endpoint on our servers; this is after the permission step and is not part of this feature. | our servers | apps/web/features/chat/stores/voice-input-store.ts:16, 231 |
| Desktop: the agent asks requestPermission; if a stored decision exists it is returned, otherwise a native dialog is shown with the reason, and the answer is recorded. | device | apps/desktop/electron/runtime/permissionManager.ts requestPermission and ask |
| Desktop: the Settings list reads decisions and operating-system status through the host bridge; focus and permission-changed events re-read it. | device | apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx useDesktopPermissions |
| Chrome: the side panel builds the site-access card; on Allow it asks Chrome for the host permission and records a one-time or always grant. | device | apps/extension/src/side_panel.ts:7902-7930; apps/extension/src/features/side-panel/bubbles.ts:1399 |
| VS Code: a mode change calls setAgentModeWithConsent, which shows the modal, then stores consent in workspace state and writes the setting. | device | apps/extension-vscode/src/features/permissions/agentModeConsent.ts setAgentModeWithConsent |
| CLI: a tool call reaches the policy gate and approval broker, which shows the request and returns allow or refuse to the tool runner. | device | apps/cli/src/features/exec/tools/mod.rs:640-690; apps/cli/src/tui/approval_broker.rs |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Mobile last observed status per permission | store:permissionsStore (mobile app storage) [inferred] | unknown; not seen syncing | kept on device; refreshed on each visit |
| Desktop permission decisions (capability, scope, duration) | Desktop app storage written by permissionManager recordDecision | no sync seen | 'once' decisions are not listed; 'session' lasts until quit; 'always' kept until removed in Settings (apps/desktop/electron/runtime/permissionManager.ts) |
| Chrome approved sites and transient site grants | extension storage (writeApprovedSite, recordTransientHostPermission) | unknown | one-time grants end with the task, Stop, expiry or a source or account change (apps/extension/_locales/en/messages.json:4298); always-allow stays until removed |
| VS Code bypass consent record (version, workspace identity) | VS Code workspace state | no; device-global state is cleared | cleared when the person returns to a safe mode (apps/extension-vscode/src/__tests__/agentModeConsent.test.ts:154, 337) |

**Models and providers.** Models and providers take no part in showing the explanation. The Chrome site card says page text and screenshots are sent to AGI Cloud during the task, so the cloud route is named in the copy (apps/extension/_locales/en/messages.json:4290-4296). The CLI refuses network tools in Local privacy mode instead of asking (apps/cli/src/features/exec/tools/mod.rs:675-686).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile Permissions screen and Desktop Settings list need no account in the code read. Chrome site access needs a signed-in account because the agent runs in AGI Cloud. VS Code consent needs none. Web dictation needs a captured session. (apps/web/features/chat/hooks/use-dictation.ts captureSession; apps/extension/src/side_panel.ts:14000) |
| Permissions | This feature is the permission explanation itself. It gates on operating-system microphone, camera, photo, notification, calendar, reminder and Face ID permissions on mobile; screen recording, accessibility and microphone on Desktop; Chrome host permissions; VS Code agent mode settings. |
| Subscription | none found in the code for the explanation. Dictation use can be refused by an allowance limit and shows an upgrade or not-upgradable state (apps/web/features/chat/hooks/use-dictation.ts dictationLimit). |
| Limits and metering | none found in the code for the explanation. Dictation allowance refusal is counted by the voice store (apps/web/features/chat/stores/voice-input-store.ts allowanceRefusal). |
| Feature flags | Web dictation can be switched off by the server capability named dictation, and by the Voice setting; the text then says dictation is temporarily switched off. (apps/web/features/chat/hooks/use-dictation.ts; apps/web/lib/feature-flags/kill-switches.ts:33) |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Permissions screen and voice permission requests run fully on the device with no network call; mobile voice recognition is on-device and refuses to start if on-device recognition is not available (apps/mobile/src/features/voice/services/voiceInput.ts:300-310). CLI Local privacy mode refuses web and browser tools with a message to create an explicit own-key or Cloud continuation (apps/cli/src/features/exec/tools/mod.rs:675-686). Desktop dictation in Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Mobile permission not yet decided | Headline 'Not Requested'; explanation 'Nothing is accessed until you allow it.'; button asks the system. | apps/mobile/src/features/settings/permissions/types.ts; Detail.tsx |
| Mobile permission denied | Headline 'Access Denied'; 'Only Settings can change this.'; button 'Open Settings'; falls back to an alert if Settings cannot be opened. | apps/mobile/src/features/settings/permissions/Detail.tsx:32-35, 163-167 |
| Mobile status cannot be read | List shows an alert-role warning that statuses may be out of date; detail shows a read-failure message. | apps/mobile/src/features/settings/permissions/index.tsx; Detail.tsx:27 |
| Mobile request throws | Message 'Your device could not process the request. Try again, or open Settings.' | apps/mobile/src/features/settings/permissions/Detail.tsx:29 |
| Unknown permission id in the route | Screen shows 'Unknown permission type.' | apps/mobile/src/features/settings/permissions/Detail.tsx |
| Face ID | iOS gives no status before first use, so the row shows 'Not Confirmed' and a 'Check Face ID' action. | apps/mobile/src/features/settings/permissions/registry.ts (faceId entry) |
| Web microphone denied, missing, busy, interrupted or blocked | Specific text per failure name; unknown failure gives a generic text. | apps/web/features/chat/stores/voice-input-store.ts:449-466 |
| Web dictation off or switched off by server | Button disabled with the reason text; an active recording is cancelled. | apps/web/features/chat/hooks/use-dictation.ts (effect on dictationEnabled and disabledFeatures); ChatComposerNew.tsx:6945 |
| Desktop dialog closed without a button | Counts as deny for this session; nothing is granted. | apps/desktop/electron/runtime/permissionManager.ts (ask: duration null path) |
| Desktop two requests for the same capability at once | Joined into one question. | apps/desktop/electron/runtime/permissionManager.ts (asking map) |
| Desktop operating-system permission restricted by an organization | Row says 'Blocked by your organization'. | apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:43-48 |
| Chrome site grant card dismissed or tab changed while open | Treated as declined, and a just-granted host permission is removed if the tab moved. | apps/extension/src/side_panel.ts:7897-7930 |
| Chrome Chrome refuses the host permission | Banner 'Chrome did not grant site access for <origin>, so browser control was not enabled.' | apps/extension/src/side_panel.ts:14016-14022 |
| VS Code raw settings edit to Bypass without consent | Reverted to the safe mode until confirmed. | apps/extension-vscode/src/__tests__/agentModeConsent.test.ts:106-128 |
| Accessibility | Mobile rows have role and a spoken label with the level; Chrome card has group role and labelled title; web dictation announces recording state through a live region. Other apps: not checked. | apps/mobile/src/features/settings/permissions/index.tsx; bubbles.ts:1399-1410; use-dictation.ts ANNOUNCEMENT |
| Offline | Mobile and Desktop permission screens work without a network; Chrome site card needs no network to show but the task needs AGI Cloud. Web dictation transcription needs the network after capture. | files above [inferred] |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/settings/permissions/__tests__/PermissionsScreen.snapshot.test.tsx`: Mobile Permissions list rendering.
- `apps/mobile/src/features/settings/permissions/__tests__/PermissionStatusLabel.test.tsx`: Mobile status label mapping.
- `apps/mobile/__tests__/voice-permission-alert.test.ts`: Denied microphone alert offers Not now and Open Settings, and Open Settings opens device settings.
- `apps/extension-vscode/src/__tests__/agentModeConsent.test.ts`: Modal names granted scopes and risks, cancel keeps safe mode, raw edits revert, Max plus Bypass compound consent, per-workspace consent.
- `apps/web/features/chat/hooks/useDictation.test.tsx`: Web dictation hook behaviour (file exists; specific cases not read).
- `apps/web/features/chat/stores/voice-input-store.test.ts`: Microphone request options and microphone error texts.
- `apps/web/features/chat/components/messages/cards/McpAppCard.test.tsx`: Device access sentence and no camera or microphone grant until the person allows.
- `apps/desktop/electron/__tests__/permissionPolicy.test.ts`: Which browser permission requests the app origin is granted (file exists; cases not read).
- `apps/extension/__tests__/browser-task-site-grants.test.ts`: Chrome task site grants (file exists; cases not read).
- `apps/extension/__tests__/browser-one-time-site-grant.test.ts`: Chrome one-time site grant (file exists; cases not read).

**Test scenarios**

- **Mobile denied microphone recovery**
  1. On a device, deny the microphone for AGI Mobile in device settings.
  2. Open a chat and tap the voice control.
  3. Read the alert and tap Open Settings.
  4. Allow the microphone, return to the app, open Settings, Safety & Security, Permissions.
  - Expected: Alert 'Voice input unavailable' appears with Open Settings; device Settings opens; the Microphone row now shows an allowed level without restarting the app.
- **Mobile permission purposes**
  1. Open Settings, Safety & Security, Permissions on iOS and on Android.
  2. Compare the rows and purpose lines.
  - Expected: Each row has a purpose line; iOS shows Speech Recognition, Photos & Files, Reminders and (on a Face ID device) Face ID; Android hides them.
- **Web first-use microphone**
  1. On web with a fresh browser profile, click the composer microphone button.
  2. Observe what is shown before the browser prompt.
  3. Block the prompt and read the text shown.
  - Expected: Current behaviour: browser prompt without an in-app reason, then 'Microphone permission denied. Please allow access in your browser settings.' Required behaviour: a reason before the prompt (gap).
- **Desktop deny and review**
  1. In Desktop, ask the agent to use computer control and press Deny.
  2. Repeat the request.
  3. Open Settings, Permissions and remove the answer, then repeat.
  - Expected: The first request shows the dialog with a reason; the repeat does not re-prompt; after removing the answer the dialog appears again.
- **Chrome site card**
  1. Sign in to the extension and start a browser task on an ordinary web page.
  2. Read the card and press Decline; repeat and press 'Allow for this task'.
  - Expected: Decline gives a 'Skipped' step and no host permission; Allow for this task grants access that ends with the task.
- **VS Code Bypass consent**
  1. Open a workspace and choose Bypass Permissions in the mode picker.
  2. Cancel, then repeat and confirm; open a second workspace.
  - Expected: Cancel keeps the previous mode; confirm applies it for this workspace only; the second workspace asks again.

**Where to look when it fails**

- Mobile: console warnings from the permission reads; alert-role text 'Could not read some permissions...'.
- Web: voice-input-store error strings and the store field error; /api/voice/transcribe response after capture.
- Desktop: the 'permission-changed' runtime event and the permissions review returned by the host bridge.
- Chrome: activity steps such as 'Chrome did not grant access to <host>'; browser extension logs.
- VS Code: the agiWorkforce.agent.mode setting value after cancel; workspace state key for bypass consent.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Web dictation explains the microphone only after a denial; there is no reason before the browser prompt.** Affects: Web and Desktop (Desktop shows the web app); all users of dictation.. Evidence: apps/web/features/chat/stores/voice-input-store.ts:268 calls getUserMedia directly; text at :452 is shown after the error; apps/web/features/chat/hooks/use-dictation.ts start has no pre-step.. Work needed: Show a short reason at first use before the request and keep the denial text with a clear way to grant later.
- **Mobile voice requests the microphone from the system with no in-app reason; the reason is only the system usage string and the Permissions screen.** Affects: Mobile (iOS and Android).. Evidence: apps/mobile/src/features/voice/services/voiceInput.ts:216-240; apps/mobile/app.config.js:171.. Work needed: Add an in-app explanation before the first system request, reusing the registry description.
- **Explanation text is a mobile registry only; other apps keep separate copies.** Affects: All apps; consistency and translation.. Evidence: registry.ts (mobile), permissionManager.ts CAPABILITY_LABELS (Desktop), messages.json (Chrome), agentModeConsent.ts literals (VS Code).. Work needed: Decide a shared owner for permission copy and move each surface to it.
- **Desktop microphone has no in-app reason dialog; the trusted app origin gets audio through Chromium handlers.** Affects: Desktop dictation.. Evidence: apps/desktop/electron/runtime/permissionManager.ts comment on microphone label; apps/desktop/electron/permissionPolicy.ts; apps/desktop/electron/main.ts:844.. Work needed: Decide whether to add an in-app reason before the operating-system prompt; the Settings list already links to the system pane.
- **The brief's first-draft claim that mobile Settings lists every permission with a description is true only for eight kinds; location, contacts or other kinds are not in the registry.** Affects: Mobile.. Evidence: apps/mobile/src/features/settings/permissions/types.ts MobilePermissionKind.. Work needed: Confirm no other permission is requested by the app and add any that is.
- **No test file was found for the Desktop permission dialog text or the Chrome site card copy by name.** Affects: Desktop and Chrome.. Evidence: apps/desktop/electron/__tests__ and apps/extension/__tests__ listings; cases of browser-task-site-grants were not read.. Work needed: Confirm coverage or add tests asserting the reason text appears before the grant.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-security-and-privacy
- SYS-voice-and-media
- SYS-authorization-and-workspaces
- SYS-shared-ui-and-design
- file:apps/mobile/src/features/settings/permissions/registry.ts
- file:apps/desktop/electron/runtime/permissionManager.ts
- file:apps/extension-vscode/src/features/permissions/agentModeConsent.ts

## Unknown

- Whether the mobile permissions store file is at apps/mobile/stores/permissionsStore.ts exactly and whether it syncs; only its import was seen.
- Whether Desktop dictation in Local mode needs the cloud transcription endpoint.
- Cases inside the Desktop permissionPolicy test, the Chrome site-grant tests and useDictation.test.tsx were not read.
- What the CLI shows for saved permission rules management; only the approval request path was read.
- Whether iOS and Android first-run flows show any extra in-app explanation not in the files read.
- Whether any test has been run: no file in the repository was found that records a result.
