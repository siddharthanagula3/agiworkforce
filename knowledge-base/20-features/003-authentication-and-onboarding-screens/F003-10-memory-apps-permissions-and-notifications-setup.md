---
id: "F003-10"
type: "feature"
title: "Memory, apps, permissions and notifications setup"
aliases: ["Memory setup", "Import memory from other AI providers", "Recommended apps", "Computer use permissions", "Desktop permissions", "Notification prompt", "Task completion notifications", "Permissions section", "Memory walkthrough step"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S3.25", "S3.26", "S3.27", "S3.28", "S3.29", "S3.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-memory-projects-and-context", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "table:user_memories", "api:POST /api/memory/import", "F085-04", "F003-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-10 Memory, apps, permissions and notifications setup

Settings that new users meet: choose whether memory is used, import memories from another assistant, review desktop system permissions, and opt in to notifications. Memory and import work on web, desktop and mobile; notifications are optional on each app; a role-based recommended-apps step and recommended plugins were not found.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.25](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s325), [S3.26](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s326), [S3.27](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s327), [S3.28](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s328), [S3.29](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s329), [S3.32](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s332).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person turn memory on or off, import facts from ChatGPT, Claude, Gemini, Copilot or another assistant after previewing them, see and change what the desktop app may do on their computer, and decide about notifications.

**Why it exists.** Memory, local permissions and notifications each affect privacy and trust, so each is an explicit, changeable choice rather than a hidden default. Importing saves a new user from starting empty.

**Who uses it.** New and existing users on every app; desktop users granting computer control.

**Problems it solves**

- Starting with no context.
- Unclear what the desktop app is allowed to do.
- Notification prompts at the wrong time (mobile spends the one OS prompt only after a primer).

**Use cases**

- A new web user opens Settings > Memory, presses 'Start import', pastes ChatGPT's list and commits the previewed facts.
- A Mac user opens Settings > Permissions and presses 'Open System Settings' for Screen Recording.
- A phone user turns on notifications from a primer and later changes categories.
- A VS Code user follows the walkthrough step 'Decide what AGI remembers'.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Memory with switches 'Persistent memory', 'Save memories from chats', 'Search past chats', 'Include sensitive topics in memory', row 'Import memory from other AI providers' with button 'Start import' (apps/web/features/settings/sections/MemorySection.tsx:317-455).
- Desktop: Settings > Permissions (heading 'Permissions', 'Your answers', 'Open System Settings') and Settings > Computer use (heading 'Computer use', 'Allowed apps', 'Refused apps') in the Electron window (DesktopPermissionsSection.tsx; ComputerUseSettings.tsx).
- Mobile: Settings > memory import screen (apps/mobile/app/(app)/settings/memory-import.tsx) and Settings > Notifications with 'Turn on notifications' (apps/mobile/src/features/settings/notifications/index.tsx:175,213).
- Web notification banner in chat: 'Get notified when the response is ready.' with 'Enable' and a dismiss button (WebChatPage.tsx:7601-7625).
- CLI: first-run note on memory and the question 'Ring the terminal bell when a long turn finishes?' (onboarding.rs:960-1000).
- VS Code: walkthrough step 'Decide what AGI remembers' (package.json:878) and command 'Code: Turn Memory On or Off'.
- Chrome: options entry 'Task completion notifications' (message key optNotificationsTitle) and the memory panel in the side panel (message key spMemoryTitle).

**Before you start**

- Cloud account for web memory and import.
- Desktop: the Electron app (settings pane only appears when the host is Electron, WebSettingsModal.tsx:243-246).
- Mobile import: signed in to Cloud (calls the web import route).

**Screens and controls**

- Import dialog (web): source buttons ChatGPT, Claude, Gemini, Copilot, Other; a prompt to copy ('List every memory you have stored about me...'); paste box or file (.txt, .json); steps compose, preview, done (ImportMemoryDialog.tsx:30-45).
- Desktop permissions rows: label, purpose, status text ('Allowed', 'Not allowed', 'Not asked yet', 'Blocked by your organization', 'Not needed on this computer'), button 'Open System Settings' only when action is needed (DesktopPermissionsSection.tsx:37-82).
- Permissions hint: 'Remove an answer and Desktop asks again the next time it needs it.' and 'None yet. Desktop asks the first time it needs each permission.'
- CLI directory trust: 'Trust This Directory' and a permission-mode menu.

**Journey**

1. Memory: open Settings > Memory, toggle the switches; changes apply later and can be reversed.
2. Import: press 'Start import', copy the export prompt into the other assistant, paste its answer or upload a file, review the preview, commit.
3. Desktop permissions: do a task that needs a permission; Desktop asks; later open Settings > Permissions to review or remove answers and to open the operating system pane for screen recording, accessibility or microphone.
4. Notifications: answer the web banner during a long task, or use the mobile primer and the system prompt, or toggle the Chrome option; change later in settings.

**What the person sees and gets**

- Import preview shows what will be added; result shows counts inserted, skipped as duplicates, blocked by policy and excluded (import route response).
- Permissions page error texts 'Permissions could not be read from the app.' and 'That answer was not removed.'
- Mobile notification states: Push, Off, Blocked.
- CLI prints 'Turn it off with /config set bell false.' when the bell is on.

**Settings**

- Memory switches and import (web); mobile memory settings.
- Desktop Permissions and Computer use panes; 'Allowed apps' and 'Refused apps' lists.
- CLI config key bell; VS Code settings agiWorkforce.memory.enabled and agiWorkforce.optOut.memory.
- Mobile notification categories.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web import route: POST /api/memory/import with modes dry-run and commit; CSRF and rate limit; commit filters excluded and duplicate items, checks workspace memory write policy per item, stores rows and returns counts (apps/web/app/api/memory/import/route.ts:55-190).
- Web Memory settings switches and Start import button (MemorySection.tsx:317-455); dialog presets and export prompt (ImportMemoryDialog.tsx:30-45).
- Mobile memory import posts to the same route (apps/mobile/src/features/memory/services/memoryImport.ts:18,39; app/(app)/settings/memory-import.tsx).
- Desktop: system permission status and open-pane actions for screen recording, accessibility, microphone (apps/desktop/electron/runtime/systemPermissions.ts:22-71), shown in the Permissions section.
- Web notification banner after long tasks (research, agent work, pending media), stored dismiss flag, and web push enable in settings (WebChatPage.tsx:2236-2286, web-push-client.ts:168-180).
- Mobile notification primer then one OS prompt from an explicit action (services/notifications.ts:203-225).
- CLI: directory trust, permission mode, memory note, bell question (onboarding.rs:157-260,752-776,960-1000).
- VS Code: walkthrough memory step and memory commands; Chrome: notifications option and memory panel.

**Incomplete**

- Web and desktop wizard (/welcome) has no memory or notification step; those choices exist only in Settings or contextual prompts (OnboardingWizard.tsx has two steps).
- CLI memory is explanatory text only; there is no choice to make during setup (onboarding.rs:960-968).
- Desktop permissions are not a guided setup walk-through: the app asks when needed and Settings lets people review; folders are tied to workspace roots; no single recorded 'setup' (dispatcher.ts permission map; DesktopPermissionsSection.tsx).
- Chrome memory choice lives in the side-panel memory panel and a link to web settings, not in its welcome page.

**Present but disconnected or switched off**

- Mobile Remote and companion are off (not part of this feature; see F003-11).

**Not available**

- Recommended apps by role (brief S3.27): no code found that recommends connectors to new users; the brief's cited lines in WebSettingsModal.tsx are the connectors pane and skills/plugins adapters (no 'recommended', 'featured' or 'popular' logic found in features/connectors hooks).
- Recommended plugins/skills installation step (brief S3.28): none on any app.
- Recommended apps on mobile, CLI, VS Code and Chrome: missing, as the brief says.
- Notification setup on VS Code: not found.

## 4. Required behaviour

**Established requirements**

- During setup the user is told about memory, chooses whether and how it is used, and can change it later. (source: Brief S3.25)
- The user can bring memories or history from another assistant through a guided import. (source: Brief S3.26)
- New users are shown a few recommended apps and can connect them in a guided flow. (source: Brief S3.27)
- New users are offered recommended plugins or skills (no app has it). (source: Brief S3.28)
- The app walks the user through the local permissions it needs and records the grants. (source: Brief S3.29)
- Notifications are offered optionally, are declinable and can be changed later. (source: Brief S3.32)
- Imports go through the memory import route and respect workspace memory policy. (source: apps/web/app/api/memory/import/route.ts:107-135)

**Acceptance criteria**

1. Dry-run import returns a preview without writing; commit writes only admitted, non-duplicate items.
2. Commit over MAX_IMPORT_ITEMS is rejected.
3. Turning off 'Persistent memory' stops the assistant using saved facts without deleting them.
4. Settings > Permissions lists each system permission with the right status and offers 'Open System Settings' only when action is needed.
5. Removing a permission answer makes Desktop ask again next time.
6. The web notification banner appears at most until dismissed or enabled and never again after (stored flag).
7. Mobile asks for the OS notification permission only after the person presses 'Turn on notifications'.
8. CLI bell stays off unless the person answers yes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Imported memory should be subject to the same admission rules as typed memory [inferred from memoryWriteAdmission use].
- Desktop grants made through ask-on-use are the 'recorded grants' of S3.29 [inferred from DesktopPermissionsSection 'Your answers'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a memory choice to the first-run wizard on web and mobile.
- [proposed] Decide whether recommended apps and plugins stay in scope; if not, mark S3.27 and S3.28 not applicable.
- [proposed] Turn the permission review into a short guided pass on first desktop launch.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Memory switches, export, clear all, Start import. |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Guided import: compose, preview, done. |
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | Dry-run and commit import. |
| service | import-store | `apps/web/lib/memory/import-store.ts` | Writes imported rows to user_memories with dedupe key. |
| table | user_memories | `apps/web/lib/memory/import-store.ts` | Where imported facts are stored. |
| screen | Mobile memory import | `apps/mobile/app/(app)/settings/memory-import.tsx` | Phone import screen. |
| service | memoryImport (mobile) | `apps/mobile/src/features/memory/services/memoryImport.ts` | Calls /api/memory/import. |
| component | DesktopPermissionsSection | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | System permission rows and remembered answers. |
| component | ComputerUseSettings | `apps/web/features/desktop-host/components/ComputerUseSettings.tsx` | Computer-use control, allowed and refused apps. |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | Reads macOS and Windows permission state and opens system panes. |
| service | permissionPolicy | `apps/desktop/electron/permissionPolicy.ts` | Which browser permissions (including notifications) the trusted page may use. |
| component | WebSettingsModal | `apps/web/features/settings/components/WebSettingsModal.tsx` | Hosts settings panes including desktop panes and connectors. |
| component | WebChatPage notification banner | `apps/web/features/chat/pages/WebChatPage.tsx` | Banner and permission request (lines 2228-2286, 7601-7625). |
| service | web-push-client | `apps/web/features/notifications/lib/web-push-client.ts` | enableWebPush and disableWebPush. |
| screen | Mobile notifications settings | `apps/mobile/src/features/settings/notifications/index.tsx` | Primer, categories, states. |
| service | Mobile notifications service | `apps/mobile/services/notifications.ts` | enablePushNotifications and registration. |
| command | CLI onboarding memory and bell | `apps/cli/src/onboarding.rs` | Memory note, bell question, trust and permission mode. |
| config | VS Code memory walkthrough step and setting | `apps/extension-vscode/package.json` | setUpMemory step; agiWorkforce.memory.enabled. |
| service | Chrome memory client | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | Reads and writes account memory from the extension. |
| config | Chrome options destinations | `apps/extension/src/features/options/destinations.ts` | Link to web settings/memory. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person pastes another assistant's list; the dialog sends it as a dry-run to /api/memory/import. | device and our servers | ImportMemoryDialog.tsx:48-60; route.ts:55 |
| Server parses items, drops duplicates and excluded content, returns a preview. | our servers | route.ts:55-105 |
| On commit the server checks workspace memory policy per item and inserts admitted items into user_memories. | our servers | route.ts:107-146; lib/memory/import-store.ts:55-70 |
| Desktop reads operating-system permission state and opens the matching system pane when asked. | device | systemPermissions.ts:22-71 |
| Web banner asks the browser for notification permission when the person presses Enable. | device | WebChatPage.tsx:2276-2282 |
| Mobile requests the OS permission, then registers the device for push with the account. | device and our servers | services/notifications.ts:203-225 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported memory facts with source and dedupe key | table:user_memories | Account memory, shared across apps that read it | Edited or deleted in Settings > Memory ('Delete all memory facts?' confirm). |
| Pasted import text | Request only; the commit stores items, not the full paste (route.ts:107-146) | No | Not kept beyond the request [inferred]. |
| Desktop permission answers | Desktop permission manager on the machine (apps/desktop/electron/runtime/permissionManager) | Not shown to be synced (unknown) | Removed per answer in Settings > Permissions. |
| Web banner resolved flag | Browser local storage (NOTIF_BANNER_STORAGE_KEY) | No | Stays until browser data is cleared. |
| CLI bell | CLI user config key bell | No | Edited with /config set bell. |

**Models and providers.** Imported memory later travels with chat turns to whichever model answers, under the product's memory rules. The import itself uses no model: the other assistant produces the text, the server only parses and stores it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Memory and import need a signed-in Cloud account. Desktop permissions and CLI setup need none. Notifications need an account only for push registration on mobile. |
| Permissions | Memory writes pass workspace policy (loadMemoryWritePolicies); desktop permissions need operating-system consent; a managed organization can pin CLI tool approval (onboarding.rs:810-822). |
| Subscription | none found in the code for memory import. Remote and some desktop capabilities have plan rules, not part of this feature. |
| Limits and metering | Import limited by MAX_IMPORT_ITEMS and MAX_IMPORT_TEXT_CHARS (values in packages types; not read); rate limit 'chat-conversation'. |
| Feature flags | None found for memory import; VS Code setting agiWorkforce.memory.enabled. |
| Model compatibility | Not applicable to import; memory text is model-neutral. |
| Provider restrictions | None. |
| Local mode | Local mode keeps its own device memory rules (not read here). Cloud memory import is a Cloud feature. Desktop permissions and CLI setup work offline; none requires payment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Import: too many items | Request rejected with 'No more than N memories can be imported at once'. | route.ts:92-95 |
| Import: invalid mode or body | Validation error. | route.ts:179-190 |
| Import: blocked by policy or duplicate | Counted separately in the response and not stored. | route.ts:117-135,150-160 |
| Import dialog disabled | Start import is disabled until the memory controller exists. | MemorySection.tsx:447-452 |
| Clipboard copy fails | Message 'The prompt was not copied. Select it and copy it yourself.' | ImportMemoryDialog.tsx:39 |
| Permissions unreadable | 'Permissions could not be read from the app.' | DesktopPermissionsSection.tsx:35 |
| Restricted by organization | Status 'Blocked by your organization'. | DesktopPermissionsSection.tsx:43 |
| Notifications denied | Mobile shows 'Blocked'; web banner is not shown once the browser permission is not 'default'. | notifications/index.tsx:424-426; WebChatPage.tsx:2240 |
| Storage blocked | Web banner flag write is ignored; banner may return next session. | WebChatPage.tsx:629-637 |
| Offline | not handled in the code for import beyond request errors. | searched ImportMemoryDialog.tsx and import route |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Import preview then commit**
  1. Open Settings > Memory > Start import.
  2. Choose ChatGPT, paste three lines, preview.
  3. Commit; repeat the same paste.
  - Expected: First commit inserts three; second reports them as duplicates.
- **Policy block**
  1. Use a workspace whose memory write policy blocks a category.
  2. Import an item in that category.
  - Expected: blockedCount increases and the item is not stored.
- **Desktop permission review**
  1. On a Mac without screen recording, open Settings > Permissions.
  - Expected: Row shows 'Not asked yet' or 'Not allowed' with 'Open System Settings'.
- **Web notification banner**
  1. Start a research turn in a browser with notifications at default.
  2. Press Enable.
  - Expected: Browser permission prompt appears; the banner never returns.
- **Mobile notification primer**
  1. Open Settings > Notifications, press 'Turn on notifications'.
  - Expected: OS prompt appears once; granted state shows Push.
- **CLI first run bell**
  1. Run first-run setup and answer yes to the bell.
  - Expected: config bell is true and the hint to turn it off is printed.

**Where to look when it fails**

- Log 'Failed to import memories' (import route).
- Response counts insertedCount, skippedDuplicateCount, blockedCount, excludedCount.
- Mobile and web push registration states in notifications settings.
- No automated test files for memory import, Memory settings or desktop permissions were located in this pass (searched by name only); coverage is unknown.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- CLI: [70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md)
- VS Code: [70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md)
- Chrome: [70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **No memory or notification choice in the first-run wizard on web, desktop or mobile.** Affects: New users on those apps.. Evidence: OnboardingWizard.tsx has two steps only.. Work needed: Add the steps or reword the brief.
- **Recommended apps and recommended plugins are not built, though the brief marks recommended apps done on web and desktop.** Affects: Web, desktop, mobile, CLI, VS Code, Chrome.. Evidence: No recommendation code found in features/connectors or the settings modal.. Work needed: Build or remove from scope.
- **Desktop permissions are ask-on-use plus a review page, not a guided setup.** Affects: Desktop.. Evidence: DesktopPermissionsSection.tsx:29-30.. Work needed: Decide whether a first-launch walk-through is required.
- **CLI memory 'choice' is a note, not a choice.** Affects: CLI.. Evidence: onboarding.rs:960-968.. Work needed: Add a choice or change the brief.
- **No notification setup on VS Code.** Affects: VS Code.. Evidence: Nothing found in package.json or src.. Work needed: Decide if needed (the IDE shows its own notifications).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-memory-projects-and-context
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- table:user_memories
- api:POST /api/memory/import
- F085-04
- F003-09

## Unknown

- Where desktop permission answers are persisted and whether they sync.
- Values of MAX_IMPORT_ITEMS and MAX_IMPORT_TEXT_CHARS.
- Whether tests exist for the import route, Memory settings and desktop permissions.
- Whether the Chrome side-panel memory panel offers an on/off choice.
- How mobile Local mode treats memory.
