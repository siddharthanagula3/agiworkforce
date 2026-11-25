---
id: "F068-04"
type: "feature"
title: "Who owns execution and handing control"
aliases: ["Who owns execution and handing control", "Execution-owner indicator", "Transfer control between clients", "Writer lease", "Take over", "Held by another program", "Continue in VS Code", "Desktop app (Open in menu)"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.12", "S68.13"]
depends_on: ["surface:cli", "surface:vscode", "surface:desktop", "surface:web", "mode:local", "SYS-sync-and-continuity", "SYS-local-inference", "SYS-execution-boundaries", "SYS-security-and-privacy", "file:apps/cli/src/platform/runtime/writer_lease.rs", "api:GET /api/settings/devices", "F068-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-04 Who owns execution and handing control

For local sessions, one program at a time holds a writer lease on the session file. The terminal warns about a second writer; the app server, VS Code and the desktop Code view refuse, name the holder and offer Take over. Control also moves with 'Continue in VS Code'. A standing owner label exists only in the CLI.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.12](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6812), [S68.13](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells which program is writing a local coding session and lets the person move control to another client on purpose.

**Why it exists.** Two programs appending to one session file lose each other's turns. A lease stops the clash and names the writer.

**Who uses it.** Developers who use the same local session from the terminal, VS Code and the desktop app.

**Problems it solves**

- Two clients writing at once and leaving duplicate copies.
- Not knowing which program has the session.
- A crashed program that never released the session.

**Use cases**

- Open a terminal session in VS Code and take it over.
- See 'Writing: ...' in the terminal status.
- Move a web Code session to VS Code with Continue in VS Code.
- Hand the session back before running it in the terminal.

## 2. User experience

**Where to find it**

- CLI: the session status lines include 'Writing: <holder>' and Worktree and Branch (apps/cli/src/agent/mod.rs:2223-2262 [status function]).
- VS Code: modal 'X is using this session.' with button 'Take over and send' (packages/ui/i18n/locales/en/vscode.json:307-311; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6434-6445,6491-6512).
- Web inside the desktop host: a notice with 'Take over' (apps/web/features/code/components/LocalSessionPanel.tsx:1527-1553).
- Web: 'Continue in VS Code' on a local session failure notice and on a cloud session's changes panel (LocalSessionPanel.tsx:1625-1637; apps/web/features/code/components/CodeChangesPanel.tsx:509-516).
- Web: Open in > Desktop app, and 'Desktop app' in the rail's more menu (apps/web/features/code/components/CodeSessionMenu.tsx:95-100; CodeRail.tsx:169-173).

**Before you start**

- A saved local session (the terminal says unsaved sessions cannot be opened by other clients) (agent/mod.rs:2231-2234).
- The CLI build must advertise writerLease for take over to appear (apps/desktop/electron/runtime/developerSessionService.ts:303,506; LocalSessionPanel.tsx:443).
- For Continue in VS Code, a vscode link must be openable and the editor extension installed.

**Screens and controls**

- Web copy: 'Take over', 'Take over this session?', 'Another program is writing this session.' (apps/web/features/code/local-code.ts:344-348).
- Web consequence text names who loses the session and that a running turn still finishes (local-code.ts:1763-1765).
- Desktop app menu item shows presence 'is online', 'is asleep and wakes when Desktop opens', or 'is offline; open Desktop on it first' (apps/web/features/desktop-host/hooks/use-paired-desktop.ts:14-18).

**Journey**

1. 1. Client A holds the lease while it works.
2. 2. Client B tries to send a turn.
3. 3. B is refused with the holder's label, or sees the held notice.
4. 4. The person chooses Take over (confirm shows the consequence).
5. 5. B takes the lease; A's next turn is refused until it takes it back.
6. 6. Or the person releases the thread from A before switching.

**What the person sees and gets**

- CLI status: 'Writing: this terminal (...), since HH:MM', or 'no client right now; the next message sent from any client takes it' (apps/cli/src/platform/runtime/writer_lease.rs:114-137).
- CLI warning: '<holder> is also writing this session. Neither process sees the other's turns.' (apps/cli/src/agent/mod.rs:2189-2196).
- App server error: '<holder> is writing this thread; take it over or wait until it hands the thread back' (apps/cli/src/app_server/developer_host.rs:1878-1888).

**Settings**

- Lease time to live 120 seconds and renewal every 30 seconds are constants (writer_lease.rs:12-13).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- A lease file per session records holder id, label, process id, times; stale when expired or the process is gone (apps/cli/src/platform/runtime/writer_lease.rs:19-41).
- Terminal claims or renews the lease and only warns on a live second writer (apps/cli/src/agent/mod.rs:2173-2221).
- The app server refuses a turn while another live process holds the lease, takes over on request, releases on request but not while a turn runs, and emits writer change notifications (apps/cli/src/app_server/developer_host.rs:1838-1890,4011-4063).
- A clean exit releases leases (apps/cli/src/lib.rs:8556; writer_lease.rs:85-89).
- VS Code prepares to write by re-reading the thread and offers Take over and send (ChatStateManager.ts:6434-6445,6491-6512).
- Desktop maps a held refusal to DeveloperThreadHeldError and exposes take over (apps/desktop/electron/runtime/developerSessionService.ts:186-197,3204-3211; apps/desktop/electron/runtime/dispatcher.ts:2909,3183).
- Web Code view inside desktop shows the held notice and Take over with a confirm (LocalSessionPanel.tsx:443,1527-1553).
- Continue in VS Code builds a vscode link; VS Code opens the folder if needed and continues the same thread (apps/web/features/code/code-surface.ts:523-529; apps/extension-vscode/src/features/context-handoff/developerSessionLink.ts:29-47; index.ts:289-302).

**Incomplete**

- No always-visible owner indicator on web, desktop, phone or VS Code; they show the holder only on conflict (doc: brief S68.12; code above).
- The brief's CLI lease citation agent/mod.rs:1741-1784 is privacy hand-off code, not the lease; the lease code is at lines 2173-2245 and in writer_lease.rs.
- The 'Desktop app' menu link takes no session id from any caller, so it opens Code home on the desktop, not the same session (apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:15,45-50; callers CodeSessionMenu.tsx:95-100, CodeRail.tsx:169-173, CloudCodePage.tsx:2753-2758 pass none; use-paired-desktop.ts:80).

**Present but disconnected or switched off**

- Phone: no owner indicator and no hand-off control (doc: brief S68.12; S68.13 not listed).

**Not available**

- Cloud sessions have a run lease column family (apps/web/db/neon/0149_cloud_code_session_run_lease.sql exists) but no owner display was found in any client; its use is unknown.
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Every client shows which client currently owns execution of the session. (source: brief S68.12)
- The user hands control of a session from one client to another explicitly. (source: brief S68.13)
- Desktop Code, CLI and VS Code share session ids; resuming appends to the same id. (source: docs/product/definition.md:119)
- An action a user cannot undo names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Two terminals on one session: the second prints a warning naming the first holder.
2. The app server refuses a second writer's turn with a writer conflict and the holder's label.
3. VS Code shows 'is using this session' with 'Take over and send' and, after confirm, sends from VS Code.
4. After take over, the previous holder's next turn is refused.
5. Release is refused while a turn is running.
6. A lease of a dead process is reported stale and taken over without a refusal.
7. Continue in VS Code opens the same thread id.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A persistent owner label on every client is the intended meaning of S68.12 [inferred from the brief text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show 'Writing: <client>' in the VS Code and desktop session header.
- [proposed] Pass the session id into ContinueOnDesktop so it opens the same session.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | writer_lease | `apps/cli/src/platform/runtime/writer_lease.rs` | Lease file, claim, take over, release, holder summary |
| service | Agent claim_writer_lease and session_status_lines | `apps/cli/src/agent/mod.rs` | Terminal warning and Writing status line |
| service | developer host writer logic | `apps/cli/src/app_server/developer_host.rs` | claim_writer_for_turn, take_over_thread_writer, release_thread_writer, writer_changed notice |
| service | session_control store | `apps/cli/src/platform/runtime/session_control.rs` | Takes the lease arbiter when saving sessions |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Desktop held error and takeOverDeveloperThread |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Desktop IPC route for take over and held error mapping |
| component | LocalSessionPanel held notice | `apps/web/features/code/components/LocalSessionPanel.tsx` | Take over button, Continue in VS Code |
| config | LOCAL_CODE_COPY and localTakeOverConsequence | `apps/web/features/code/local-code.ts` | Take over and held copy |
| service | ChatStateManager take over | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code modal and take over call |
| service | LocalRuntimeClient.takeOverWriter | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Calls thread/writer/takeover |
| config | vscode strings | `packages/ui/i18n/locales/en/vscode.json` | sessionSync.* text |
| service | developerSessionLink | `apps/extension-vscode/src/features/context-handoff/developerSessionLink.ts` | Opens a session link and continues the thread |
| service | context-handoff URI handler | `apps/extension-vscode/src/features/context-handoff/index.ts` | Routes vscode links to session or cloud task |
| component | ContinueOnDesktop | `apps/web/features/desktop-host/components/ContinueOnDesktop.tsx` | Link to the paired desktop app |
| hook | usePairedDesktop | `apps/web/features/desktop-host/hooks/use-paired-desktop.ts` | Finds the paired desktop and its presence |
| config | codeDeepLink | `apps/web/features/desktop-host/lib/deep-links.ts` | Builds the agiworkforce-cloud link; code home when no id |
| service | continueLocalSessionInVsCodeHref | `apps/web/features/code/code-surface.ts` | Builds the VS Code link for a local session |
| service | sessionWorktrees | `apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts` | Worktree sessions in VS Code |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices` | Device list used to find the desktop (folder not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A program claims the lease by writing a lease file beside the session file. | device | apps/cli/src/platform/runtime/writer_lease.rs:140-200 |
| Another client sends a turn; the app server reads the lease and refuses with the holder's label. | device | apps/cli/src/app_server/developer_host.rs:985-1010,1838-1890 |
| Person confirms Take over; the server takes the lease and announces a change. | device | developer_host.rs:4031-4062 |
| For Continue in VS Code, the web page makes a vscode link with thread id and folder; VS Code resolves it. | device | apps/web/features/code/code-surface.ts:523-529; developerSessionLink.ts:29-47 |
| For Desktop app, the web page asks our servers for the device list to find a paired desktop. | device and our servers | apps/web/features/desktop-host/hooks/use-paired-desktop.ts:8,61-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Lease file (holder id, label, pid, acquired, renewed, expires) | beside the managed session file on the device | Not synced | Released on clean exit; a crashed holder's lease is reported as abandoned (writer_lease.rs:80-90) |
| Device list entry for the paired desktop | our servers (endpoint /api/settings/devices) | Yes, per account | unknown |

**Models and providers.** No model is involved in leases or links.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local leases need no account. Finding a paired desktop needs a signed-in web session (use-paired-desktop.ts:61-70). |
| Permissions | Take over needs the confirm step on web (LocalSessionPanel.tsx:1541-1547) and modal confirm in VS Code (ChatStateManager.ts:6493-6498). A writer lease text is length-checked and a tampered lease never locks a writer out (writer_lease.rs tests). |
| Subscription | none found in the code for leases or the editor link. The Desktop app link depends only on a paired device being listed. |
| Limits and metering | none found in the code. |
| Feature flags | Capability 'writerLease' advertised by the CLI app server (desktop developerSessionService.ts:303,1366; VS Code localRuntimeClient.ts:228,1874). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | This feature is mostly Local mode: it works on the device with no AGI account and no subscription. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Holder stale or process gone | Next writer takes over without a refusal and the terminal says the holder stopped. | apps/cli/src/platform/runtime/writer_lease.rs:36-38,125-130; agent/mod.rs:2197-2203 |
| Turn running | Release is refused until the turn is interrupted. | apps/cli/src/app_server/developer_host.rs:4011-4029 |
| Take over declined in VS Code | Shows 'Not sent: <holder> is using this session. Send again to take it over from here.' | ChatStateManager.ts:6499-6502; packages/ui/i18n/locales/en/vscode.json:310 |
| Take over fails | VS Code and web show a failure message and retry text. | vscode.json:311; local-code.ts:347 |
| Old CLI without writerLease | Web says to wait or update; no Take over button. | apps/web/features/code/components/LocalSessionPanel.tsx:1530-1532; local-code.ts:351-352 |
| Folder not open in VS Code | Offers Open folder, stores a pending link, resumes when the folder opens within a time window. | apps/extension-vscode/src/features/context-handoff/developerSessionLink.ts:29-60 |
| No paired desktop | Shows a download link instead; inside the desktop shell the item is hidden. | apps/web/features/desktop-host/components/ContinueOnDesktop.tsx:37-47 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/platform/runtime/writer_lease.rs`: Unit tests: second writer refused, expiry and takeover, dead process stale, explicit takeover and release, clean exit releases, tampered lease, concurrent claim, whole publish
- `apps/cli/src/app_server/developer_host.rs`: Host tests that emit thread/writer_changed on take over and release (lines 12788-12833)
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Desktop local session service (take over cases not opened)
- `apps/extension-vscode/src/__tests__/developerSessionHandoff.test.ts`: Resuming the same thread, refusal of expired, repeated, foreign-account, cloud-addressed records
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: Session hand-off commands (cases not opened)
- `apps/web/features/code/components/LocalSessionPanel.test.tsx`: Local session panel (take over cases not opened)

**Test scenarios**

- **Second terminal**
  1. Open the same session in two terminals.
  2. Send a message in the second.
  - Expected: Warning naming the first holder.
- **VS Code take over**
  1. Hold a session in the terminal.
  2. Send from VS Code.
  3. Choose 'Take over and send'.
  - Expected: Message sent from VS Code; terminal's next turn is refused.
- **Release while running**
  1. Start a turn.
  2. Ask to release the thread.
  - Expected: Refused until the turn is interrupted.
- **Desktop app link**
  1. Open a cloud session on web with a paired desktop.
  2. Open Open in > Desktop app.
  - Expected: Desktop opens; per code it opens Code home, not the session. Confirm by running.
- **Crashed holder**
  1. Kill the holder process.
  2. Send from another client.
  - Expected: Takeover as stale; no refusal.

**Where to look when it fails**

- Lease file next to the session file (extension writer-lease).
- Notification thread/writer_changed.
- Error text '... is writing this thread' (developer_host.rs:1884).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **No standing owner indicator outside the CLI.** Affects: Web, desktop, phone, VS Code. Evidence: doc: brief S68.12; ChatStateManager.ts:6491-6512 shows holder only on conflict. Work needed: Add an owner label to each client.
- **Terminal only warns; the app server refuses. Behaviour differs by path.** Affects: CLI users. Evidence: apps/cli/src/agent/mod.rs:2173-2221 vs developer_host.rs:1838-1890. Work needed: Decide the intended rule and document it.
- **'Desktop app' link opens Code home, not the session.** Affects: Web users with a paired desktop. Evidence: apps/web/features/desktop-host/hooks/use-paired-desktop.ts:80; callers pass no sessionId. Work needed: Pass session id (the component already accepts it).
- **Phone has no owner indicator or hand-off.** Affects: Phone. Evidence: doc: brief S68.12. Work needed: Not defined.
- **Stale brief citations for the lease.** Affects: Docs. Evidence: apps/cli/src/agent/mod.rs:1741-1784. Work needed: Update brief.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- surface:desktop
- surface:web
- mode:local
- SYS-sync-and-continuity
- SYS-local-inference
- SYS-execution-boundaries
- SYS-security-and-privacy
- file:apps/cli/src/platform/runtime/writer_lease.rs
- api:GET /api/settings/devices
- F068-01

## Unknown

- Whether the cloud session run lease (migration 0149) is shown anywhere or used for ownership.
- What the VS Code and web UI show for owner in the desktop sessions list beyond conflict notices (UI components not fully read).
- tui_app.rs and webviewContent.ts brief citations were not opened.
- Whether Desktop app link is meant to open the session (session id prop exists but is unused).
