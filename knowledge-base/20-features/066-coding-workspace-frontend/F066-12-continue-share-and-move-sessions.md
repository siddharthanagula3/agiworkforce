---
id: "F066-12"
type: "feature"
title: "Continue, share and move sessions"
aliases: ["Share session (S66.40)", "Continue in another client (S66.41)", "Continue in VS Code or the terminal", "Session share link", "SharedCodeSessionPage", "attach and detach (remote code)", "agi resume", "teleport / handoff"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.40", "S66.41"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "SYS-sync-and-continuity", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "table:cloud_code_sessions", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-12 Continue, share and move sessions

Cloud coding sessions can be shared by link: a team link in a workspace, or a signed-in link for a personal session. Local sessions are not shareable. A local session can be continued in the terminal with a copyable resume command, in VS Code, or from a paired phone that attaches over remote control.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.40](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6640), [S66.41](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6641).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Share: sets who can open a cloud session (private, team or public-to-signed-in) and gives a link to a read-only view. Continue: gives a way to carry a session to another client: a resume command and VS Code link on the desktop-hosted page, VS Code and CLI continue commands, and phone attach through Remote Control.

**Why it exists.** People want to show a session to a teammate and to move work between machines. The founder decision follows the leaders: only cloud sessions are shared, and cloud results come to a local checkout through the CLI and VS Code (doc: docs/decisions/2026-09-27-founder-decisions.md:334-351).

**Who uses it.** Developers and their teammates; phone users watching a desktop session.

**Problems it solves**

- Asking a teammate for a screenshot of a session.
- Switching from desktop to terminal or editor without losing history.
- Approving a desktop agent's request from a phone.

**Use cases**

- Share a cloud session with the team and paste the link in chat.
- Press 'Continue in VS Code or the terminal' and copy the resume command.
- Pair the phone, open a desktop session list and approve a command away from the desk.
- In the CLI run 'resume --cloud' to bring a cloud session to the local checkout.

## 2. User experience

**Where to find it**

- Web Code page, cloud session menu: 'Share' opens the 'Share session' dialog (apps/web/features/code/components/CodeSessionMenu.tsx:129-137; CodeShareDialog.tsx; labels in code-surface.ts:359-383).
- Shared link page: /code/shared/{token} (apps/web/app/code/shared/[token]/page.tsx; component SharedCodeSessionPage.tsx).
- Desktop-hosted local session menu: 'Continue in VS Code or the terminal' shows a resume command and 'Continue in VS Code' link (apps/web/features/code/components/LocalSessionPanel.tsx:1201-1204,1617-1640).
- Web cloud changes panel: 'Continue in VS Code' (CodeChangesPanel.tsx:268,513).
- Mobile: opening a desktop session in the companion code view attaches automatically (apps/mobile/src/features/companion/components/CodeSessionView.tsx:134-139) after pairing; pairing UI is the Remote Control section (apps/web/features/desktop-host/components/RemoteControlSection.tsx).
- CLI: 'resume' subcommand with an id, '--cloud', and a mode that brings a cloud session to this repository (apps/cli/src/lib.rs:917-925); '--resume <id>' flag (lib.rs:296-298).
- VS Code: command 'agi-workforce.continueInTerminal' (apps/extension-vscode/src/core/commandSetup.ts:1494-1496).

**Before you start**

- Share: a cloud session you own; in a workspace the role must hold the content.share permission (cloud-code-session-sharing.ts:25,55-59).
- Viewer: signed in; for a team share with a repository, GitHub access to that repository (cloud-code-session-sharing.ts:100-125).
- Remote Control: a paid plan (remote_control capability in the paid tiers, packages/contracts/types/src/billing-catalog.ts:352) and allowing the phone at the desktop (dispatcher.ts:1112 text).

**Screens and controls**

- Share dialog: radio 'Private', 'Team' or 'Public' by context, link field with copy, snapshot note, repository note, warning that it can contain private code and credentials.
- Stopping a share asks to confirm: 'Stop sharing' dialog (CodeShareDialog.tsx:82-92).
- Shared page states: 'Opening the shared session', 'This shared session is not available.', badges 'Shared with your team' and 'Shared by link' (code-surface.ts:380-383).
- Local handoff panel with the command text, a copy button and a 'Continue in VS Code' link when a branch and repository exist.

**Journey**

1. Share: 1. Open a cloud session. 2. Menu, Share. 3. Pick the audience. 4. Copy the link. 5. A teammate opens it and reads the session. 6. Stop sharing by choosing Private and confirming.
2. Continue: 1. Open a local session. 2. Menu, 'Continue in VS Code or the terminal'. 3. Copy the command and run it in the same folder, or use the VS Code link. 4. The CLI resumes the thread by id.
3. Phone: 1. Pair the phone from Remote Control. 2. Open the desktop's session list on the phone. 3. Open a session; the phone attaches. 4. Steer, interrupt or answer approvals. 5. Leaving the screen detaches.

**What the person sees and gets**

- 'Could not change who can open this session.' on failure (code-surface.ts:373).
- 'Your role in this workspace does not allow sharing with the team.' (cloud-code-session-sharing.ts:30).
- 'This session works on <repo>. Connect a GitHub account that can open <repo> to view it.' (cloud-code-session-sharing.ts:38-40).
- 'This shared session is not available. Its owner may have stopped sharing it.' (api route, shared/[token]/route.ts:27-29).

**Settings**

- Pairing and Remote Control in Settings; the share audience per session; none found for continuing in the terminal.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Share: PATCH /api/code/sessions/{sessionId} with shareVisibility sets visibility and a random token; rule: personal sessions share by public link, workspace sessions by team; team needs content.share (apps/web/lib/services/cloud-code-session-sharing.ts:51-96; apps/web/app/api/code/sessions/[sessionId]/route.ts:78-115).
- Viewer: GET /api/code/shared/{token} returns a snapshot of the session (title, repository, branch, turns, terminal entries), checks workspace lockdown and the repository access, rate limited (apps/web/app/api/code/shared/[token]/route.ts; cloud-code-session-sharing.ts:127-175).
- Local session continue in terminal and VS Code (LocalSessionPanel.tsx:543,1617-1640; apps/web/features/code/local-code.ts:592-594).
- CLI resume by id and from the account, and a cloud session brought into a repository (apps/cli/src/lib.rs:917-925).
- Phone attach, detach, steer, interrupt, approval responses over the remote link (apps/mobile/src/features/companion/remote-code/service.ts:34-100; packages/platform/utils/src/remoteControl/codeRemoteController.ts:1084-1118).
- Cloud handoff: POST /api/code/sessions/handoff opens a cloud session from a local handoff record (apps/web/app/api/code/sessions/handoff/route.ts:158).

**Incomplete**

- The brief says continuing from web is missing; the desktop-hosted page offers the resume command and VS Code link for local sessions, and the cloud changes panel offers VS Code.
- The draft said a teammate sees the session read-only; the page and route only read, but no write control was searched for; treat as read-only by design [inferred].
- The shared view is a snapshot taken when the link is opened: 'People who open the link see your name and the session as it is when they open it.' (code-surface.ts:369-370).
- Mobile attach happens when the view mounts; there is no explicit attach button (CodeSessionView.tsx:134-139).

**Present but disconnected or switched off**

- The mobile review build hides Remote Control in v1 per a project memory note (doc: owner product decisions in memory); the code gate for that was not located.

**Not available**

- Sharing a local session: unshareable by decision (docs/decisions/2026-09-27-founder-decisions.md:334-341).
- Sharing from mobile and VS Code: no code found.
- Chrome: not applicable.
- A cloud session cannot be pulled into a repository by the desktop app itself; it hands it to VS Code or the terminal by decision (docs/decisions/2026-09-27-founder-decisions.md:343-351).

## 4. Required behaviour

**Established requirements**

- The user shares a coding session with someone else, who can open it. (source: S66.40 Should)
- The user moves an ongoing coding session to another client and continues it there. (source: S66.41 Should)
- Only cloud coding sessions are shared; local sessions stay unshareable. (source: docs/decisions/2026-09-27-founder-decisions.md:334-341)
- A cloud session's result comes local through the CLI and VS Code; the desktop hands a cloud session to VS Code or the terminal. (source: docs/decisions/2026-09-27-founder-decisions.md:343-351)
- Sharing with the team needs the role permission; otherwise the refusal text is shown. (source: apps/web/lib/services/cloud-code-session-sharing.ts:30,55-59)
- An action a user cannot undo asks first and names the consequence; stopping a share asks first. (source: doc: AGENTS.md section 9; CodeShareDialog.tsx:82-92)

**Acceptance criteria**

1. A personal cloud session offers Private and Public; a workspace session offers Private and Team.
2. Choosing Team without content.share fails with the role message and nothing is shared.
3. The link opens the snapshot for a signed-in viewer; after Private, the link shows the 'not available' message.
4. A team viewer without access to the repository sees the connect-GitHub message.
5. Stopping a share requires a confirmation dialog.
6. The local session's resume command contains the thread id and runs in the CLI.
7. Phone attach shows the desktop session's snapshot; detach on leaving the screen.
8. A turn that a phone starts cannot select Bypass.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A viewer's page is read-only because only GET routes serve it [inferred from shared/[token]/route.ts exporting only GET].
- Phone and desktop driving at once is guarded by the thread writer lease for other programs; phone behaviour is not shown [inferred, unverified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a 'Send to phone' prompt on the desktop.
- [proposed] Offer sharing from mobile and VS Code.
- [proposed] Let a cloud session continue in web after a local start.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeShareDialog | `apps/web/features/code/components/CodeShareDialog.tsx` | Share dialog with audience and link. |
| component | CodeSessionMenu | `apps/web/features/code/components/CodeSessionMenu.tsx` | Share menu item (line 129). |
| component | SharedCodeSessionPage | `apps/web/features/code/SharedCodeSessionPage.tsx` | Viewer page; reloads when auth changes. |
| screen | /code/shared/[token] | `apps/web/app/code/shared/[token]/page.tsx` | Route for the shared page. |
| endpoint | GET /api/code/shared/{token} | `apps/web/app/api/code/shared/[token]/route.ts` | Returns the shared snapshot; rate limit 'share-view'. |
| endpoint | PATCH /api/code/sessions/{sessionId} | `apps/web/app/api/code/sessions/[sessionId]/route.ts` | Rename, archive or set shareVisibility. |
| service | cloud-code-session-sharing | `apps/web/lib/services/cloud-code-session-sharing.ts` | Set sharing, open shared session. |
| table | cloud_code_sessions | `apps/web/lib/services/cloud-code-session-sharing.ts` | Columns share_visibility and share_token updated at lines 83-95. |
| other | app_shared_cloud_code_session and app_has_org_permission | `apps/web/lib/services/cloud-code-session-sharing.ts` | Database functions used to look up a grant and check the content.share permission. |
| endpoint | POST /api/code/sessions/handoff | `apps/web/app/api/code/sessions/handoff/route.ts` | Opens a cloud session from a handoff record. |
| component | LocalSessionPanel handoff | `apps/web/features/code/components/LocalSessionPanel.tsx` | Continue in VS Code or the terminal block. |
| service | localSessionResumeCommand | `apps/web/features/code/local-code.ts` | Builds '<program> --resume <id>' (line 592). |
| component | RemoteControlSection | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` | Pairing and plan check for remote control. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Desktop side of attach, detach, steer, approvals (line 1084). |
| service | mobile remote-code service | `apps/mobile/src/features/companion/remote-code/service.ts` | Phone-side requests. |
| component | CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Phone view; attach on mount (line 134). |
| command | agi resume | `apps/cli/src/lib.rs` | Resume subcommand (line 917). |
| command | agi-workforce.continueInTerminal | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code continue in terminal (line 1494). |
| config | share and continue strings | `apps/web/features/code/code-surface.ts` | Labels (lines 359-383, 431-436). |
| test | SharedCodeSessionPage test | `apps/web/features/code/SharedCodeSessionPage.test.tsx` | Viewer page. |
| test | sharing lockdown test | `apps/web/lib/services/__tests__/cloud-code-session-sharing.lockdown.test.ts` | Lockdown and transcript window. |
| test | codeRemoteController test | `apps/desktop/electron/__tests__/codeRemoteController.test.ts` | Desktop remote code controller. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The owner picks an audience; the page sends shareVisibility to the session route. | device and our servers | CodeShareDialog.tsx:62-83; apps/web/app/api/code/sessions/[sessionId]/route.ts:101-102 |
| The server checks the audience matches the context, checks the content.share permission for team shares, and stores visibility and a random link token. | our servers | cloud-code-session-sharing.ts:51-96 |
| A viewer opens the link; the server looks up the grant, checks lockdown and, for team shares, the viewer's access to the repository, then reads the owner's session and returns the snapshot. | our servers | cloud-code-session-sharing.ts:127-175; shared/[token]/route.ts:17-35 |
| Continue in terminal: the page shows a command that the CLI resumes by thread id. | device | local-code.ts:592-594; LocalSessionPanel.tsx:543 |
| Phone attach: the phone sends code.session.attach over the remote link; the desktop marks the thread attached and publishes a snapshot. | device and our servers | service.ts:34-36; codeRemoteController.ts:1084-1095 |
| The phone sends steer, interrupt or approval answers; the desktop acts on them. | device and our servers | codeRemoteController.ts:1097-1118 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Share visibility and token | table cloud_code_sessions columns share_visibility and share_token | Server | Token is cleared when set back to private (cloud-code-session-sharing.ts:84-85) |
| Shared snapshot | read live from the owner's session on each open | Server | Follows the session |
| Resume thread | CLI session files on the computer | Account resume exists via 'resume --cloud' (lib.rs:917-925) | unknown |
| Attach state | desktop controller memory | Remote link | Reset on detach |

**Models and providers.** Sharing and attach involve no model. A continued session keeps its own model choice; continuing in another client re-selects it there [unknown]. Security: a phone cannot start a Bypass turn (developer-session.ts:46-52).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Share and view need a signed-in account; viewer page re-reads when the sign-in changes (SharedCodeSessionPage.tsx:36-39). |
| Permissions | Team share needs content.share in the workspace; the viewer needs repository access for team shares; a locked-down workspace refuses (cloud-code-session-sharing.ts:25,55-59,100-125). |
| Subscription | Remote Control is limited to paid tiers by capability remote_control (billing-catalog.ts:352); the page shows an upgrade state (RemoteControlSection.tsx:76-80). Sharing has no plan check in the code read beyond cloud Code availability. |
| Limits and metering | Viewer route is rate limited under 'share-view' per user (shared/[token]/route.ts:20-21). Transcript snapshot is windowed to the newest turns and says so (SharedCodeSessionPage.test.tsx:127-143). |
| Feature flags | Cloud sessions depend on the managed Code switch (see F066-07). |
| Model compatibility | none found in the code. |
| Provider restrictions | Team share repository check uses GitHub installations only (cloud-code-session-sharing.ts:100-108). |
| Local mode | Local sessions are not shareable. Continuing in the CLI is on the device. Phone attach needs the desktop, the phone and our relay, so it is not device-only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Saving share | Spinner 'Saving who can open this session'. | CodeShareDialog.tsx:128 |
| Share fails | Alert with the message. | CodeShareDialog.tsx:70-74,129-133 |
| Copy link fails | Copy state 'failed'. | CodeShareDialog.tsx:96-103 |
| Shared link invalid or stopped | Not found message. | shared/[token]/route.ts:26-30 |
| Workspace lockdown | Refused before reading the transcript. | cloud-code-session-sharing.lockdown.test.ts:63 |
| Transcript too long | Notice that earlier turns are missing. | SharedCodeSessionPage.test.tsx:127-143 |
| Thread held by another program | The desktop reports DeveloperThreadHeldError. | apps/desktop/electron/runtime/developerSessionService.ts:813-815 |
| Attach refused | Controller resets attached if the snapshot publish is refused. | codeRemoteController.ts:1088-1093 |
| Offline or reconnect for phone | not handled in the code paths read; not read in this write-up. | codeRemoteController.ts:1084-1118 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/SharedCodeSessionPage.test.tsx`: Clears a share when the signed-in session changes; notice for truncated and complete transcripts.
- `apps/web/lib/services/__tests__/cloud-code-session-sharing.lockdown.test.ts`: Lockdown refusal, open when not locked, truncated transcript flag, personal public share.
- `apps/web/app/api/code/shared/[token]/__tests__/route.test.ts`: Shared route.
- `apps/web/app/api/code/sessions/handoff/route.test.ts`: Handoff route.
- `apps/desktop/electron/__tests__/codeRemoteController.test.ts`: Desktop remote code controller.
- `apps/mobile/src/features/companion/remote-code/__tests__/service.test.ts`: Mobile approval answer, attach and steer requests.
- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: VS Code continue in cloud (name only; not read).

**Test scenarios**

- **Share personal session**
  1. Open a cloud session.
  2. Menu, Share, choose Public.
  3. Copy the link and open it in a second signed-in account.
  - Expected: Second account sees the session snapshot.
- **Role refusal**
  1. In a workspace as a member without content.share choose Team.
  - Expected: Message 'Your role in this workspace does not allow sharing with the team.'
- **Stop sharing**
  1. Choose Private and confirm.
  2. Reload the old link.
  - Expected: Not-available message.
- **Resume in terminal**
  1. Open a local session.
  2. Copy the resume command and run it in the folder.
  - Expected: The CLI opens that thread with history.
- **Phone attach**
  1. Pair a phone.
  2. Open a desktop session on the phone.
  3. Send a steer message.
  - Expected: Desktop receives it; leaving the screen detaches.

**Where to look when it fails**

- Error names CloudCodeSharingForbiddenError, CloudCodeSharedRepositoryError, DeveloperThreadHeldError.
- Table cloud_code_sessions.
- Remote request names code.session.attach and code.session.detach.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **The brief says continuing from web is missing; the desktop-hosted page and cloud changes panel offer it.** Affects: Brief accuracy. Evidence: LocalSessionPanel.tsx:1201-1204; CodeChangesPanel.tsx:513. Work needed: Update the brief.
- **Sharing from mobile and VS Code is missing.** Affects: surface:mobile, surface:vscode. Evidence: No code found; brief. Work needed: Decide; the leaders' share is from the web session list.
- **Whether phone and desktop can both drive a session is not verified.** Affects: surface:mobile, surface:desktop. Evidence: Only the writer-conflict error was found (developerSessionService.ts:813). Work needed: Live test with a phone and the desktop typing at once.
- **Brief line numbers for continue (dispatcher.ts:874, lib.rs:829, tui_app.rs:2708) point at unrelated code.** Affects: Brief readers. Evidence: Files opened. Work needed: Refresh references.
- **Remote Control is hidden in the mobile review build per project notes; the gate was not located.** Affects: surface:mobile v1. Evidence: memory note only. Work needed: Locate and document the flag.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- SYS-sync-and-continuity
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- table:cloud_code_sessions
- mode:cloud
- mode:local

## Unknown

- Whether a viewer can do anything other than read on the shared page (only the GET route was read).
- Phone behaviour when the desktop is also typing.
- How the CLI 'resume --cloud' finds and checks out a cloud session (only the subcommand definition was read).
- Where the mobile build hides Remote Control.
- What the VS Code continue-in-cloud command does (test file name only).
