---
id: "F066-02"
type: "feature"
title: "Session list, titles and status"
aliases: ["Coding-session list", "Session list", "Local sessions section", "Session title", "Session status", "Rail", "Sessions history", "Session picker", "S66.05", "S66.06", "S66.07"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.05", "S66.06", "S66.07"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:local", "mode:cloud", "SYS-sync-and-continuity", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "F066-01", "file:apps/web/features/code/components/LocalSessionsSection.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-02 Session list, titles and status

Shows the person's coding sessions grouped by folder, lets them open one, rename, pin, archive or restore it, and marks each as running, needing approval, waiting for an answer, or failed. On Desktop and web the marks follow live runtime events; the CLI and VS Code have their own pickers and trees.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.05](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6605), [S66.06](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6606), [S66.07](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6607).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists coding sessions with readable titles and status marks, and offers open, rename, pin, archive and restore actions.

**Why it exists.** People run several sessions at once and need to find one, know which needs them, and tidy the rest (S66.05 to S66.07, doc: knowledge-base/data/area-briefs/066-coding-workspace-frontend.md).

**Who uses it.** Developers on Desktop, web, CLI and VS Code; phone users when the computer-session path is enabled.

**Problems it solves**

- Losing track of long-running sessions.
- Not noticing that an agent waits for approval.
- Clutter from finished sessions.

**Use cases**

- Glance at the Desktop rail to see which session is running and which needs approval.
- Rename a session to a clear title.
- Pin the session for the current feature.
- In a terminal, type /history to resume an earlier session.

## 2. User experience

**Where to find it**

- Web /code and Desktop: left rail section titled 'On this device' (LOCAL_CODE_COPY.heading, local-code.ts:48; LocalSessionsSection.tsx:161-503). Cloud sessions use CodeRail (apps/web/features/code/components/CodeRail.tsx).
- Row menu: button with aria-label 'More actions for <title>' containing Pin/Unpin, Rename, Archive session or Restore (LocalSessionsSection.tsx:89-160; local-code.ts:196-205).
- Toggle 'Show archived' / 'Hide archived' (local-code.ts:207-208).
- CLI: /history or /sessions opens the 'Sessions' picker (Enter resume, r rename, Esc close) (apps/cli/src/tui/widgets/session_picker.rs:11-15); /resume; /rename <id> <new title> (apps/cli/src/repl/registry.rs:1031-1044).
- VS Code: the conversations tree, 'Code: Show Sessions History' and 'Code: Archived Sessions' commands (package.json; apps/extension-vscode/src/features/trees/sessionPickers.ts:60,134).
- Mobile: 'This computer's sessions are in ...' link and session rows (CodeSessionsCard.tsx:128-170; CodeSessionListRow.tsx not read).

**Before you start**

- Desktop shell with the CLI handshake complete.
- The folder must be allowed to run commands, otherwise its sessions are withheld (local-code.ts:70-72).
- Rename, pin and unarchive are shown only when the CLI reports thread_rename, thread_pin and thread_unarchive (use-local-sessions.ts:516-520).

**Screens and controls**

- Group header per folder with branch name (LocalSessionsSection.tsx:351-362).
- Row: title, marker (spinner for running, 'Needs approval', 'Waiting for your answer', 'Failed'), 'Pinned' label (local-code.ts:477-488,210).
- Inline title editor LocalSessionTitleInput with 200 character limit; Escape cancels (LocalSessionTitleInput.tsx:80-90).
- Archive confirmation dialog with title 'Archive this session?' (LocalSessionsSection.tsx:230-262).

**Journey**

1. 1. Open the Code screen; the rail loads sessions for every approved folder.
2. 2. Watch the marker on each row.
3. 3. Click a row to open the session.
4. 4. Open the row menu to pin, rename or archive.
5. 5. For archive, read the confirmation and confirm; the row leaves the list unless 'Show archived' is on.
6. 6. To bring one back, show archived and choose Restore.

**What the person sees and gets**

- Spinner with accessible label for running; text labels for needs approval, waiting and failed.
- Errors as alert paragraphs: 'That session could not be archived.', 'The session could not be renamed.', 'The pin could not be changed.' (local-code.ts:214-217,184).
- Archived rows show 'Archived'.
- A session open failure shows 'That session could not be opened.' with 'Retry loading session' (local-code.ts:123-124; LocalSessionPanel.tsx:1506-1509).

**Settings**

- CodeRail pins (codeRailPins in the settings store) control which rail items are pinned (CodeRail.tsx:354) (rail items, not sessions).
- VS Code session auto-archive behaviour exists (apps/extension-vscode/src/__tests__/sessionAutoArchive.test.ts); its setting name is not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web inside Desktop: list per folder with title, pinned first, status markers from live events, rename, pin, archive and restore (LocalSessionsSection.tsx:73-75,373-460; use-local-sessions.ts:195-234,427-470; local-code.ts:489-530). The brief calls web 'partial' because cloud gating applies; the local list does not depend on the cloud flag.
- Running sessions cannot be archived: the menu item is disabled with description 'Stop the running turn before archiving this session.' (LocalSessionsSection.tsx:140-146).
- Command access withheld: list says 'To see a folder’s sessions, allow running commands for that folder.' and offers 'Allow running commands' (LocalSessionsSection.tsx; local-code.ts:70-72).
- CLI: Sessions picker with resume and rename, /rename, /resume, /fork (session_picker.rs; tui_app.rs:5997-6030).
- VS Code: tree with running spinner, pinned and cloud icons; searchable history picker; archived picker with permanent delete confirmation (conversationTreeProvider.ts:20-50; sessionPickers.ts:60-160).

**Incomplete**

- A failed list read shows a message in an alert but no Retry button on the list itself (LocalSessionsSection.tsx:318-322; Retry exists only on opening one session). [inferred from absence]
- VS Code has no rename command in package.json; whether rename exists elsewhere (sessionGroups.ts) is not read.
- Mobile row layout and status chips (idle, running, awaiting_approval, failed, unknown) are in code (CodeSessionsCard.tsx:136-160) but the mounting screens are flag-gated.

**Present but disconnected or switched off**

- Mobile remote session list and view: FEATURES.companion is false (v1FeatureFlags.ts:16; companion/code/[threadId].tsx:81).
- Rename, pin and unarchive controls hide when the connected CLI does not report them (LocalSessionsSection.tsx:97-100).

**Not available**

- Web in a plain browser tab: no local session list (use-local-sessions.ts:121).
- Chrome extension: not applicable.
- The 'closed' status the brief mentions: no 'closed' marker found in the web marker set (local-code.ts:477-488).

## 4. Required behaviour

**Established requirements**

- The user sees a list of coding sessions and can open one. (source: S66.05)
- Each session shows a readable title, and the user can rename it where the surface offers renaming. (source: S66.06)
- Each session shows whether it is running, waiting for approval, idle, failed or closed. (source: S66.07)
- A session that is running cannot be deleted or archived; the person is told to stop the turn first. (source: apps/web/features/code/local-code.ts:196-205 (strings), LocalSessionsSection.tsx:140-146)
- Anything a user cannot undo asks first and names the consequence; chats and sessions are archived or moved, not destroyed. (source: doc: AGENTS.md section 9)
- New/resume/fork/archive developer session is a required developer-screen function. (source: doc: docs/product/experience-contract.md:262)

**Acceptance criteria**

1. Each row shows the session title and, when running, a labelled spinner.
2. A turn that needs approval makes the row show 'Needs approval' without reloading the page.
3. The archive menu item is disabled while a turn runs and explains why.
4. Rename saves a non-empty changed title and refuses an empty one; a failure shows 'The session could not be renamed.'
5. A folder without command access shows the withheld notice and an allow button instead of silently empty rows.
6. Archived sessions are hidden by default and reappear with 'Show archived', where Restore returns them.
7. In the CLI /rename <id> <title> reports success or a specific failure.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The live marker overrides the CLI-listed status until the page reloads (localSessionMarker, local-code.ts:515-524).
- [inferred] When the runtime stops, running rows become 'failed' (use-local-sessions.ts:198-208).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Retry button on the session list error.
- [proposed] Show a 'closed' state for finished sessions so S66.07 is met in full.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalSessionsSection and SessionMenu | `apps/web/features/code/components/LocalSessionsSection.tsx` | Rail list, row menu, archive confirmation, empty and withheld states. |
| component | LocalSessionTitleInput | `apps/web/features/code/components/LocalSessionTitleInput.tsx` | Inline rename field, 200 character limit. |
| hook | useLocalSessions | `apps/web/features/code/hooks/use-local-sessions.ts` | Loads groups, tracks activity markers, rename, archive and pin actions. |
| hook | useLocalSession | `apps/web/features/code/hooks/use-local-session.ts` | Opens one session and retryRead (line 369). |
| config | markers and copy | `apps/web/features/code/local-code.ts` | LOCAL_SESSION_MARKER_LABELS, nextSessionMarker, localSessionMarker (lines 477-530). |
| component | CodeRail | `apps/web/features/code/components/CodeRail.tsx` | Cloud session rail and rail item pins. |
| component | CodeSessionMenu | `apps/web/features/code/components/CodeSessionMenu.tsx` | Cloud session menu with share and archive. |
| endpoint | PATCH /api/code/sessions/[sessionId] | `apps/web/app/api/code/sessions/[sessionId]/route.ts` | Rename, archive and share a cloud session (lines 76-100). |
| endpoint | POST /api/code/local-sessions/activity | `apps/web/app/api/code/local-sessions/activity/route.ts` | Activity route for local sessions (purpose inferred from name; body not read). |
| service | Desktop dispatcher thread commands | `apps/desktop/electron/runtime/dispatcher.ts` | developer_thread_archive, unarchive, rename, pin, delete (lines 804-844). |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Lists sessions per folder through the CLI and maps capabilities (line 485). |
| component | SessionPickerView | `apps/cli/src/tui/widgets/session_picker.rs` | CLI 'Sessions' overlay with resume and rename. |
| command | CLI rename and resume | `apps/cli/src/repl/registry.rs` | rename_session_for_display (line 1031) and session commands. |
| store | CLI session store | `apps/cli/src/sessions.rs` | open_db, rename_session, search_sessions. |
| component | ConversationTreeItem | `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts` | VS Code tree row: spinner, pinned, cloud. |
| command | showSessionsHistory and showArchivedSessions | `apps/extension-vscode/src/features/trees/sessionPickers.ts` | Search quick-pick and archived list. |
| component | CodeSessionsCard | `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx` | Status labels and colours and entry link (lines 136-160). |
| service | remote code service | `apps/mobile/src/features/companion/remote-code/service.ts` | Sends code.sessions.list and related requests to the paired computer. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Desktop side of the remote link: sends code.sessions and snapshots (lines 500-640). |
| store | useRemoteCodeStore | `apps/mobile/src/features/companion/remote-code/store.ts` | Mobile state for roots, sessions and starts (persistence unknown). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page asks the desktop host to list sessions for all approved folders. | device | use-local-sessions.ts:152-176 |
| The Electron main process starts the CLI agent in each folder and reads its stored sessions. | device | dispatcher.ts:750-760 (reason text); developerSessionService.ts |
| Runtime events from the host update the row marker live. | device | use-local-sessions.ts:195-234; local-code.ts:489-512 |
| Rename, pin, archive call developer_thread_* commands; the list refreshes after success. | device | use-local-sessions.ts:427-470; dispatcher.ts:821-844 |
| Cloud sessions: the page lists them from GET /api/code/sessions and renames or archives through PATCH. | our servers | sessions/route.ts:42-65; [sessionId]/route.ts:76-100 |
| Mobile asks the paired computer over the Remote Control link for its session list. | device and our servers | remote-code/service.ts:29-31; relay route unknown (not read) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local session records and titles, pinned and archived flags | The CLI session store on the device (sessions.rs open_db); exact path unknown | not synced by this feature; mobile receives a copy over the remote link while paired | Archive keeps; delete is permanent and confirmed (local-code.ts:196-203) |
| Cloud session rows | table:cloud_code_sessions | server-held | archive via PATCH 'archived' |
| Draft text and context files per session | In-page memory (local-session-memory.ts) | no | lost on reload (storage kind unknown) |

**Models and providers.** The list does not call a model. A title may come from the first message or a model summary; how titles are generated was not read (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local list needs no account call; cloud list needs sign-in (sessions/route.ts:42). |
| Permissions | Listing a folder's sessions starts the CLI in that folder, so the desktop asks for shell.execute permission per folder (dispatcher.ts:755-758). Refusal lasts until quit or until withdrawn in Settings under Capabilities (local-code.ts:73). |
| Subscription | Cloud list shows availability.planEntitled and maxSessions (sessions/route.ts:55-65). The local list has no plan rule found. |
| Limits and metering | none found in the code for the local list. Cloud active-session cap applies at create (F066-01). |
| Feature flags | FEATURES.companion on mobile (v1FeatureFlags.ts:16); CLI capabilities thread_rename, thread_pin, thread_unarchive (developerSessionService.ts:515-518). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mode:local sessions are listed from the device with no payment; this list does not call our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading local sessions'. | LocalSessionsSection.tsx:300-304; local-code.ts:104 |
| Empty | 'No coding sessions on this device yet.' or 'No folder on this device is open to AGI yet.' | LocalSessionsSection.tsx:201; local-code.ts:68-69 |
| Withheld | Withheld notice with allow button; refused state offers 'Open Capabilities'. | LocalSessionsSection.tsx:330-345 |
| Error reading list | Alert text 'That session could not be opened.' is for one session; the list error uses the same readFailed string; no retry button found. | use-local-sessions.ts:166-168; LocalSessionsSection.tsx:318-322 |
| Rename failure | Returns error text to the input. | use-local-sessions.ts:439-441 |
| Running session | Archive disabled with explanation; delete says 'Stop the running turn before deleting this session.' | LocalSessionsSection.tsx:140-146; local-code.ts:197 |
| Another program holds the session | 'Another program is writing this session.' with 'Take over' confirmation. | local-code.ts:226-233 |
| Runtime stops | Active markers turn 'failed'. | use-local-sessions.ts:198-208 |
| Offline / reconnect | not handled in the code for the local list; mobile reconnect state is in connection store (not read). | not handled in the code (searched use-local-sessions.ts) |
| Accessibility | Group role with aria-label; focus returns to the row menu after rename; confirm dialog restores focus. | LocalSessionsSection.tsx:176-196,355 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalSessionsSection.test.tsx`: Lists a session under its folder and branch; git-off notice; new session per folder; says no folder is open; CLI missing line; one folder that cannot run while others list; failure as an alert.
- `apps/web/features/code/hooks/use-local-sessions.test.ts`: Reload after permission change, stale last read, plan-gated model choice.
- `apps/web/features/code/local-code.test.ts`: Local code helpers (file not read in detail).
- `apps/extension-vscode/src/__tests__/sessionPickers.test.ts`: VS Code session picker behaviour (cases not read).
- `apps/extension-vscode/src/__tests__/sessionAutoArchive.test.ts`: Auto archive (cases not read).
- `apps/mobile/src/features/companion/remote-code/__tests__/service.test.ts`: Remote code requests (cases not read).
- `apps/mobile/src/features/companion/components/__tests__/CodeSessionView.test.tsx`: Mobile session view (cases not read).
- `apps/web/app/api/code/local-sessions/activity/__tests__/route.test.ts`: Activity route.

**Test scenarios**

- **Live marker**
  1. Start a session that needs a command approval.
  2. Watch the rail row.
  - Expected: The row shows 'Needs approval' without a reload, then returns to the running spinner after you approve.
- **Archive while running**
  1. Start a long turn.
  2. Open the row menu.
  - Expected: Archive session is disabled with the stop-first explanation.
- **Rename**
  1. Open the row menu, choose Rename, type a new title, press Enter.
  - Expected: The row shows the new title; an empty title is not saved.
- **Command access withheld**
  1. Add a folder, refuse command access, open the Code screen.
  - Expected: The folder shows the withheld text and 'Open Capabilities'.
- **CLI resume and rename**
  1. Run /history, move to a row, press r to rename, then Enter on another.
  - Expected: The title changes and the chosen session resumes.

**Where to look when it fails**

- Strings readFailed, renameFailed, pinFailed, archiveFailed, restoreFailed in LOCAL_CODE_COPY.
- DesktopRuntimeError codes from the host.
- VS Code 'Session history unavailable' tree error item (conversationTreeProvider.ts:60).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **No closed status marker.** Affects: Web, Desktop. Evidence: local-code.ts:477-488 lists only running, needs-approval, needs-input, failed. Work needed: Define when a session is closed and show it.
- **No Retry on a failed list read.** Affects: Web, Desktop. Evidence: LocalSessionsSection.tsx:318-322. Work needed: Add a retry that calls refresh.
- **Mobile list is switched off.** Affects: Mobile. Evidence: v1FeatureFlags.ts:16. Work needed: Enable when Remote Control ships, then live check.
- **VS Code rename not found.** Affects: VS Code. Evidence: package.json has no rename command. Work needed: Confirm and add or document.
- **The brief rates Desktop and mobile 'done' while the Desktop UI is shared web code and mobile is flagged off.** Affects: Planning accuracy. Evidence: CloudCodePage.tsx:1949; v1FeatureFlags.ts:16. Work needed: Correct the inventory.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:local
- mode:cloud
- SYS-sync-and-continuity
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- F066-01
- file:apps/web/features/code/components/LocalSessionsSection.tsx

## Unknown

- How session titles are generated.
- Where the CLI session store file lives on each platform.
- What the activity route stores and for whom.
- Whether mobile rows persist between launches.
- How mobile rows look (CodeSessionListRow.tsx not read).
- Whether VS Code can rename a session.
