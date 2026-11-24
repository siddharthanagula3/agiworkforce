# Architecture edge-case conformance

Status: Current execution queue; incomplete
Owner: Platform + application maintainers
Last updated: 2026-11-02
Baseline: `c5d073487defa4c5bdc0e0acb0ca5026d15cfe49`; corrections are unreleased

This queue tests the existing architecture by user job and lifecycle, across six
public surfaces. It does not turn missing test coverage into product defects or
duplicate the feature statuses in `audit/ledger/ecosystem-capability-ledger.jsonl`.
Ledger sections 19–22, 53–60, 63–68, 70–74, 76–82, 90 and 96–103 own the
corresponding capabilities. Electron hosts Web; retained Tauri code is not proof
of a feature in the public Desktop. Optional source release applies to selected
parts such as the CLI and its dependencies, with no license change authorized.

## Evidence rules

**Automated** means deterministic tests against the actual owner with mocked
dependencies where stated. **Local live** means a real disposable dependency.
**Native** means the actual installed application runtime. **Inspected** means
source and existing coverage were traced, without executing that scenario in
this pass. None of these labels establishes deployed behavior by itself.

For every pending check, preserve an unchanged positive control, record what
actually executed, and check state before and after completion. Fresh accounts,
conversations or private test profiles prevent cross-case contamination. Use
fixtures before paid inference. Do not reset a person's Keychain, change billing,
relax approvals or silently cross Local/BYOK/Managed boundaries to test a flow.

## Confirmed corrections and instrument findings

1. **Quiet-hours DST boundary:** wall-clock remaining minutes were added to a
   UTC instant by `quiet-hours-service.ts`. Across Chicago's spring transition,
   a 22:00–08:00 window released at 09:00 instead of 08:00. Fall could wake the
   worker at 07:00, which the email handler rechecked and deferred; early delivery
   was not established. The canonical `quietHoursEndAt` now finds the first
   eligible UTC minute using the same zoned predicate. Seconds and milliseconds
   no longer carry beyond the boundary. Boolean push eligibility avoids that
   bounded search. Four baseline failures and five positive controls were
   reproduced; 54 shared clock cases and nine service cases pass after repair.
   Historical sub-minute timezone offsets and real notification delivery remain
   outside this finite suite.
2. **Stale inline edit:** `runInlineCommand.ts` read selection text before
   generation, then `applyEdit.ts` wrote a late `WorkspaceEdit` without the
   original document version. Two original-code cases overwrote intervening
   edits; an unchanged-buffer positive control passed. The original URI,
   selection and version now travel with the proposal. Trust, closed state,
   cancellation and ownership are checked before a versioned `TextEditor.edit`.
   Fourteen unit cases cover delayed responses, delayed review, editor switches,
   close/reopen, trust loss, cancellation and commit receipts. Native tests also
   cover accepted edits, preserved human edits and competing versioned writes.
3. **Repeated Code Key prompt:** isolated native tests launched VS Code with a
   temporary home/profile while using its persistent secret-storage backend.
   The owner observed macOS's missing-Keychain dialog in that test host. Every
   test-host/CLI launch now passes VS Code's memory-only secret-storage option.
   A native synthetic secret write/read/delete succeeded. The real login
   Keychain was not reset or modified; this does not verify real credential
   persistence. Private test profiles are removed on exit.
4. **False-positive native coverage:** the packaged test runner copied an
   explicit file list that omitted the new inline suite. One registration test
   passing did not establish edit safety. The allowlist now includes that suite,
   and Mocha rejects an empty selection. The final native run executed four
   named cases in VS Code 1.143.1, using the built VSIX and cleared credentials.
5. **Dormant SQL conformance:** both driver legs existed but required an opt-in
   URL and WebSocket proxy absent from the normal test invocation. CI now runs
   them after test migrations and rejects empty, skipped or failed results.
   Both adapters passed 32 cases against disposable PostgreSQL 17.11, including
   real forced RLS, denied cross-tenant writes, physical pool reuse and rollback.
   The exact CI shell step passed locally. This tests driver primitives with a
   scratch policy, not all production policies or ledger concurrency.
6. **Unicode coverage:** the existing arbitrary-byte stream fixture was ASCII.
   Additional tests split valid multilingual text and tool arguments at every
   byte boundary, one byte at a time and in 64 seeded partitions. Seven Google
   stream-framing cases pass. This closes a coverage gap; no parser defect was
   demonstrated by those valid fixtures.

### Signed-in Electron Local Code smoke test, November 24

A fresh Electron profile used the local Next.js server, a Clerk development
account and the current Apple Silicon CLI build. The native sign-in screen
opened the browser handoff. The web grant and Electron redemption returned 200,
and Code loaded without repeating age confirmation for the same account. The
account footer appeared, and opening the right tools pane kept the left
session list collapsed. The test reopened the session list, chose a disposable
folder, approved command access and submitted a task. A loopback model served
one request and the complete streamed reply appeared in the Code transcript.
The Playwright run passed in 51 seconds.

The browser launch and macOS callback delivery used the owned fixture. The
grant, redemption and application requests used the actual routes. The first
runs stalled before thread creation when the test server lacked a device-token
signing key. An ephemeral signing key allowed the server to issue tokens. The
native logs still recorded CLI account-sync failures in the isolated profile,
so this run verifies the Local workflow and leaves credential persistence and
the managed route open. Packaged OS handoff and production remain outside this
run.

A repeat read the runtime status through the Electron bridge and identified a
macOS Keychain write refusal in the isolated profile. The Desktop child strips
the standalone CLI's headless storage override. A separate account-only CLI
run used that supported override with a private home. Browser approval wrote a
credential file with mode `0600`, a new process read the signed-in state, and
another process confirmed sign-out after `account/logout`. This covers
headless persistence. The signed Desktop build's Keychain path still needs
acceptance.

The earlier CLI build could save workspace consent against the hostname, then
refuse the same workspace after registration wrote the persistent device ID.
Workspace consent and device registration now use the same ID creation path.
The regression checked that `agi init` writes the device ID before recording
the grant. The rebuilt CLI kept that same ID across browser approval, opened
the workspace app-server, and preserved the expected restart and logout
behavior. Hostname-bound grants from older versions still use the existing
trust check and may require renewed consent after the device ID is created.
The CLI's native stdio consent path also initialized the ID. A second process
without native consent remained restricted, which confirms that the temporary
approval did not become a saved workspace grant.

The packaged acceptance harness now gives macOS a temporary home for app data.
The application's startup helper sets `userData` from `appData`, which replaces
the old harness's `--user-data-dir` choice. An Electron probe ran the production
startup helper and confirmed that it resolved to the temporary home. The
packaged consent check can also require the new stable identity behavior. The
older signed bundle failed that check because consent left no device ID.

The rebuilt Apple Silicon ZIP passed strict code-signature verification after
extraction. Its embedded icon matches the current blue ribbon resource. Its
bundled binary answered developer-session protocol 8, refused an unapproved
workspace, accepted native consent, and reused the device ID on the next
consented launch. A later launch still required consent. ZIP SHA-256
`766635fa9cc128c8dc3f80a7921df8131de3dedbdecb658ea3c9e0f3245ab75d`.
This was a local signed build. The notarized application launch, Keychain
flow and release distribution still need acceptance.

### CLI interrupted turn recovery, November 24

In an isolated terminal with a loopback model, Ctrl-C stopped a held reply
and returned a queued message to the composer. The prior build had only
saved the partial reply and stop marker after a clean exit. The rebuilt CLI
saved both before showing Stopped. The test confirmed the saved bytes while
the terminal was still open, forcibly closed that disposable process, then
reopened the session in a fresh terminal and completed one new Local turn.
The queued message stayed unsent and the interrupted request never sent its
second delta. The 177 TUI tests and four cancelled-turn tests passed.

A second macOS terminal run used a loopback model that requested a shell
command in a disposable workspace. Ctrl-C dismissed the first approval and
the script never started. On a second request, the test approved one run and
confirmed both the shell and its child were alive before pressing Ctrl-C.
The terminal showed the stopped tool, both processes exited, and the script's
delayed write was absent. Both tool results were present in the transcript
sent to the model on the next successful turn. The developer-host interrupt
test and ten process-tree tests also passed. The native run used a foreground
command and a fixture model on macOS.

Clearing the CLI composer previously recorded unsent text in shared prompt
history. An isolated macOS terminal reproduced the draft appearing after
switching to a different saved session. The rebuilt CLI keeps the cleared
draft in memory for its session and routing boundary. In the same terminal,
Up recovered it in the original session after both Escape and Ctrl-C.
The other session and the history file stayed free of the draft. The fixture
received only the two setup turns, and all 179 focused TUI tests passed.

### VS Code session history during runtime restart, November 24

The earlier installed VSIX passed a Local turn after restart, but a concurrent
history read returned a restart error. The sidebar treated it as an empty list.
A regression reproduced the history error while a real runtime pool waited for
a deferred restart. Active and archived history and session search now wait
before reading the current workspaces. A genuine failure still produces the
existing per-workspace error.

The rebuilt VSIX passed all 15 installed extension-host cases in VS Code
1.131.0 with the rebuilt CLI. The run loaded the sidebar composer and usage
view, opened parallel editor chats, restarted the runtime and streamed a Local
reply through `@agi` with a loopback model. The test profile used memory-only
secret storage and its own extensions directory. This verifies the local
archive, and Marketplace publication remains open.

The pagination follow-up kept previously read session rows when a later
page failed or repeated a continuation cursor. The Local Sessions sheet
shows the partial list and a Retry action. Archived sessions already read
can be restored individually while Restore All is hidden. Automatic
archiving still requires a complete read of each affected workspace.

Provider and rendered webview tests reproduced the partial failure and
checked that Retry requests Local sessions again. The rebuilt VSIX also
passed all 15 tests in the installed extension host with the real CLI and
loopback model fixture. The failure itself was injected by the focused
regression tests.

The installed extension also recovered an interrupted native `@agi` turn.
The loopback model held its second delta while **Restart Local Runtime**
restarted the actual CLI. The response connection closed and the session
saved the first delta with its `[stopped]` marker. A follow-up in the same
VS Code chat reused the session ID and saved its completed answer alongside
the partial reply. A fresh worktree build passed all 17 installed VSIX tests
in VS Code 1.131.0, and 55 focused extension tests passed. This exercised a
commanded runtime restart with an isolated profile and fixture model.

### AGI Code runtime crash recovery

On November 24, a macOS stdio app-server using a loopback model received
its first reply delta and was killed before the second. A fresh app-server
reported Idle on both session list and read in the baseline. The rebuilt
runtime persisted the active turn's writer in the session and reported
Failed after that writer died. The saved prompt survived. A follow-up
recorded the stopped response, completed in the same thread, and left it
Idle after another restart. The installed VS Code test also passed with
the rebuilt CLI for a controlled restart during streaming. Crash recovery
uses the durable transcript, so reply text that was only in memory can be
lost when the process dies.

The desktop Local Code renderer now explains a stopped previous turn in the
reopened conversation. It uses the status returned with the transcript, so a
stale sidebar row cannot report a failure for a healthy session. Chromium
rendered the notice and the saved prompt at 1,440, 1,024, 390, and 320 px with
a controlled desktop bridge. At each width a follow-up reached the same
session through the composer, and the notice cleared once the bridge
accepted it. The three focused renderer suites passed 153 tests.

The VS Code editor and sidebar now show the same stopped-turn notice when
opening the session. In each native view, the development extension reopened
a session after its CLI process was killed during a loopback reply.
The saved prompt was visible, and a follow-up completed in the original
session and cleared the notice. Tests also covered a status-only refresh
where the saved messages and timestamp stayed the same. The 268 focused
extension tests, typecheck, and locale parity passed.

### Parallel VS Code editor tasks

On November 24, an isolated VS Code 1.131.0 profile installed the current
VSIX and opened two AGI Chat editor tabs in the same workspace. The first
Local task streamed while the second tab opened. Both requests reached the
loopback model while their replies were held. After release, each tab
showed its own prompt and completed reply. Two distinct persisted session
transcripts matched the tabs. The fixture's release control now wakes
every held stream, with a focused regression test for two concurrent
requests. The installed archive SHA-256 was
`c6c10b4ff3bb66b439bb2860ab62cae24f2afc9545e89ddbe84f884e7ae3d45c`.
The run used a local VSIX and a controlled model, without Marketplace
distribution or real provider inference.

### Code header and composer at narrow widths

The signed-in Electron run opened the account menu and verified Search,
Artifacts, Plugins, and the Scheduled and Edit sidebar items under More. The
left rail collapsed independently of the right panel, whose launcher showed
Browser, iOS Simulator and Terminal. At phone width the desktop draft tools
now sit in the app header, avoiding a second Code title. The rendered composer
kept its controls in bounds at widths of 1,440, 1,024, 390 and 320 pixels in
both themes. Send remained beside the microphone with a draft present.
Closing the narrow drawer returned focus to its trigger, and the same draft
completed a Local task after the window widened. The Web typecheck and 216
focused tests passed. The renderer used the development server.

### Product notices in narrow windows

In signed-in development Electron at 320 px, the service notice gave its
message 109 px beside the controls and used 166 px of vertical space. The
shared notice card now wraps the controls below the message as space runs
out. At 320 px the same message had 226 px of width and the card was 150 px
tall. The notice was also checked at 390, 1,024 and 1,440 px in light and dark
mode. Dismiss preserved the Code draft. A Chromium touch test on Web chat
confirmed the Status destination, 44 px control height, and tap dismissal.
Both runs used a fixture incident.

### Code composer placeholder and multiline draft

On November 24, the new-task field at 320 px measured 28 px high while its
placeholder needed 50 px. The shared Code textarea now sizes to its content
within the existing 220 px limit. The full placeholder fit at 320 px and
stayed on one line at 390, 1,024 and 1,440 px. Three lines of draft displayed
without scrolling. A longer draft scrolled within the cap, and clearing it
restored the original height. The native check used development Electron and
a loopback model. After a task completed, the field grew to show three lines
of follow-up draft in the saved Local session at 320 × 568. Chromium also
passed the short-screen Code home checks at 320 × 568 and 390 × 664, and 282
Code page and Local session tests passed. The stylesheet reserves two
placeholder lines on narrow screens
when the browser lacks content sizing. That fallback was inspected in source.
[Chrome field-sizing documentation](https://developer.chrome.com/docs/css-ui/css-field-sizing)
[WebKit implementation notes](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)

### Desktop Local Code send options

On November 24, signed-in Electron submitted a new Local task through
**Send and stay here** and, in a second profile, through Command–Enter.
Each turn completed with one loopback model request while Code stayed on the
new-task composer. Selecting the session in the sidebar reopened its saved
reply. The menu fit at widths of 1,440, 390 and 320 pixels. Focus returned to
the composer after sending in the background. Focused tests cover draft
recovery after a failed start. The new action uses the Local runtime's normal
approval mode.
The Cloud equivalent and the hosted rollout were outside this check.

The keyboard follow-up found that Escape moved focus from Send options back
to the draft field, so the next Tab revisited the same control. Escape now
returns focus to Send options. Selecting Send and stay here focuses the draft
field for the next task. The field exposes its available shortcuts to assistive
technology. In a signed-in development Electron profile, keyboard navigation
through the menu worked at 1,440, 390 and 320 pixels. The background task
completed while Code stayed on the new-task page and reopened through the
narrow sidebar. The ordinary send action opened its own task. The loopback
provider received exactly one request per action. All 208 Code page tests and
the Web typecheck passed.

### Desktop Cloud Code send options

On November 24, signed-in Electron submitted a new Cloud task from
**Send and stay here** and kept the composer editable. A held Cloud API
fixture received exactly one authenticated turn request. Opening the session
while the request was held exposed Stop, and the request survived that
navigation. Releasing it made the saved reply appear in the opened session.
Focused tests also cover a later approval, stop routing, and restoring the
unchanged draft when the session has no recorded turn after a failed request.
The development run used Cloud session and turn fixtures. Production managed
execution and durability after leaving the application remain unverified.

### Desktop Cloud Code drafts across routes

Changing the Code route previously lost unsent text in Electron. An
in-place switch could also show the preceding session's text. New session
and each Cloud session now have their own draft in the active account's
Code layout. The draft lives in the open renderer.

In signed-in development Electron, two fixture sessions and New session
each recovered their own draft across route changes. Starting one session's
task sent its draft once and cleared that draft. The two other drafts stayed
available. A focused account-switch test verified that a different signed-in
account receives a fresh composer. A separate desktop run confirmed that
Send and stay here cleared its submitted draft and the same turn completed
after opening its session. Both desktop runs used loopback API fixtures.

### Desktop Cloud Code cancellation after reopening

Signed-in Electron reproduced an existing Cloud turn reopening with its
transcript visible and no Stop control. Code now follows the persisted turn
and sends Stop with that turn's ID. A pending cancellation stays disabled
after a reload. The authenticated loopback fixture received one cancellation
request and no duplicate submissions when Enter was pressed with a newer
draft. Code polled until the transcript displayed **Cancelled** without
moving the reader away from earlier history. All 209 Code page tests passed.
The run used a development account and a loopback Cloud Code fixture.

### Desktop Code tools

In a fresh signed-in Electron profile, Browser opened a loopback page that
received no account cookie or authorization header. Terminal ran `pwd` in the
selected disposable folder and left the Code draft intact. The simulator
picker started the named QA device and the pane received a native screen
frame. A second run showed the running iPhone app in the pane and saved a
screenshot in the isolated Electron profile. The tests used the development
renderer and owned macOS resources.

The new-session Side panel now reopens the previous tool after collapse.
Closing Browser explicitly still returns to the tool launcher. The Browser
address field keeps text being edited when the current page finishes loading.
In signed-in Electron at 1,440, 390 and 320 px, collapsing and reopening
Browser kept the loaded page and Back history without reloading the page.
Both loopback requests arrived without account cookies or authorization
headers. Closing and reopening the Terminal dock kept the same shell and its
test environment variable. The Code draft survived both interactions.

A new Local Code draft previously opened Terminal from the tool launcher,
while Control–backtick did nothing. The shortcut and View menu now use the
same dock once a folder has command access. Signed-in development Electron
verified that the menu was disabled before folder selection, the shortcut
opened and hid the dock, and invoking **View → Show Terminal** reopened the
same shell. The test retained a shell variable and the unsent Code draft.
The fixture supplied the focused Code window to the native menu harness. All
370 focused tests, the web typecheck, and lint for the changed files passed.

In a new desktop Code draft, Browser and the docked iOS Simulator now show
the available tools above their own controls. Terminal opens its dock while
the preview stays open. Signed-in development Electron switched Browser →
iOS Simulator → Browser at 1,440, 390 and 320 px. The loaded URL and Back
history survived, and the loopback page received no duplicate visits.
Terminal ran in the selected disposable folder alongside Browser, and the
Code draft was unchanged. The simulator check opened the pane without
starting a device. The focused Code and tool suites passed 259 tests.

In an open Local session, collapsing the side panel now hides Browser or
the docked iOS Simulator while keeping it ready to reopen. Signed-in
development Electron retained Browser history, the address being edited,
and the session draft at 1,440, 800, 390, and 320 pixels. Browser stayed
inside the viewport after the Local header controls were wrapped at narrow
widths. The loopback page received two loads with no account cookies or
authorization headers. The simulator pane stayed mounted during collapse.
The renderer tests verified that frame reads pause while hidden. A native
host test confirmed that a late site approval keeps a collapsed browser
hidden. All 330 focused renderer tests and 10 browser host tests passed.

The Local terminal dock now belongs to the approved workspace instead of
the selected conversation. Signed-in development Electron opened two Local
sessions in one disposable folder and read back an environment variable
set in the original shell. Renderer tests switched between two folders,
kept each dock's tabs attached and visible only in its own folder, and
verified removal after command access was withdrawn. A transient session
list failure hid its dock and restored the same tabs on recovery. The
five focused renderer suites passed 322 tests.

### Desktop Local Code search

On November 24, a signed-in Electron profile completed a Local Code task in a
disposable folder. Workspace Search returned zero results for its title because it
queried the cloud index. With **Search → Local Code**, the development renderer
found the title through the desktop session list and reopened the saved reply
from a new session. The run used a loopback model fixture. There was no cloud
search request for the Local query, and the scope-switch test verifies that the
query is cleared before returning to cloud search. The results fit at widths of
1,440, 1,024, 390 and 320 pixels in both themes. The Local scope searches session
titles. The hosted release remains unverified.

The sidebar's **Search sessions** field also filters the Local session list.
A second signed-in Electron run completed a Local task with the loopback
fixture, confirmed an unmatched query hid it, then found it by title and
reopened the saved reply from the sidebar. The web typecheck and 209 focused
Code tests passed.

The next signed-in Electron run added 52 newer sessions to the disposable
workspace and confirmed that the target was absent from the recent list.
Both sidebar **Search sessions** and **Search → Local Code** found the
older title and reopened its saved reply. The search text stayed out of
Cloud search requests. The loopback provider saw only the setup turn.
CLI and desktop tests cover filtering titles before pagination, the
archive filter, and paging through older CLI versions.

### Renaming a Local Code session

The title editor stays in place while the native save is pending. A refused
save keeps the proposed name in the field beside the error. Enter retries,
and completing an edit with keyboard focus returns focus to its original
control. Escape discards the edit.

At 390 pixels in signed-in development Electron, a controlled first refusal
kept the draft name and focus in the sidebar. Retrying through the normal
native handler saved the title. Escape cancelled a later edit and returned
focus to the renamed row's action button. A reload reopened the Local
session with the saved title. The run sent one setup turn to a loopback
model fixture.

### Archive and restore from the Local Code sidebar

Archiving through the sidebar now asks for confirmation, closes the
selected session after the host acknowledges the archive, and puts focus
on **Show archived** when the row leaves the list. Cancelling returns
focus to the original row action. Archived sessions show the saved
transcript and explain that Restore is required before sending. The
renderer uses the native CLI's archived status as well as any archive
timestamp.

Signed-in development Electron at 390 pixels verified Cancel, Archive,
transcript review, Restore, and reload with the composer available
again. The fixture received one setup model request. Focused renderer
tests also verified that restoring returns the session's unsent draft.

### Pinning a Local Code session

On November 24, signed-in development Electron at 390 pixels started two
Local Code sessions using a loopback provider. Pin moved the older session
above the newer one and showed a **Pinned** label. The older session kept
its pin and position after a full Electron restart and command-access
approval. Unpin restored chronological order. Pin and Unpin used the real
CLI app server and caused no additional model requests.

CLI tests verified that the pin survives a metadata write, leaves the
transcript and activity timestamp intact, keeps the session on the first
page, and prevents automatic archiving until Unpin. The VS Code cleanup
test also verified that it skips pinned Local sessions. Installed release
builds remain unverified.

The VS Code follow-up uses the same CLI pin. The Sessions sheet and
history picker show pinned Local sessions first. The sheet offers Pin
and Unpin when the CLI advertises support. Focused tests cover the row
ordering, the keyboard focus after Pin, and rejection of a pin action
for an unlisted session. All 16 installed extension-host tests passed,
including a real CLI restart with a pinned Local session followed by
Unpin. Marketplace publication remains open.

In a disposable macOS terminal profile, `agi session pin` moved an older
session above the newer one in `agi session list --limit 1` and the
interactive `/resume` picker. `--resume latest` still opened the newer
session. `agi session unpin` restored the usual order in both lists.
The loopback fixture served only the two setup turns. Focused tests also
checked that an archived session stays out of the picker and retains its
pin when restored.

The paired-computer session list now carries pin status from Desktop, VS Code,
and CLI for sessions shared with Companion. Mobile Code shows the pin and
prioritizes those sessions in both list views. Host, parser, and rendered
mobile tests covered the list limit, compatibility with older hosts, and the
visible label. Live pairing is pending a mobile build with Companion enabled.

### Reopening a linked Local Code session

On November 24, signed-in development Electron opened a saved Local Code
link after a full restart. The link notice offered command access for the
session's folder at 1,440, 1,024, 390 and 320 pixels. Keyboard approval
opened the saved transcript with the same URL and made the composer
available. The loopback provider saw only the setup turn. Renderer tests
also exercised a different draft folder, a worktree whose parent needs
approval, and a refusal that routes to Capabilities.

The follow-up populated the disposable workspace with 52 newer sessions
and confirmed the CLI omitted the linked session from its first 50 entries.
After restarting Electron, approving the named folder opened the older
transcript at the same URL without another model request. The native lookup
tests also cover an archived match, a stopped pagination cursor, and a
folder that has yet to grant command access. The renderer keeps the link
and offers Retry when the lookup cannot finish.

### Desktop scheduled Local Code

On November 24, signed-in Electron reached Scheduled from the Code sidebar.
The Local routine editor opened while the real billing request was held in
Playwright, and the draft survived when the request finished. A one-time
routine used an approved disposable folder and the loopback model fixture.
The native scheduler recorded one completed execution and disabled the
one-time schedule. Before the routing correction, Open run showed Code home
even though the completed task was in the sidebar. After the correction, the
same workflow opened the correct task and its saved reply. The OS folder
picker and native confirmation used scoped test responses. This evidence
covers the development renderer and a one-time Local routine.

A one-time Local routine previously read the wall-clock input in the
computer's time zone. The form now uses the chosen zone, and Scheduled
shows that zone next to the time. Signed-in development Electron saved a
one-time routine in Asia/Kolkata at the intended instant. A recurring
routine in the same zone dispatched through the native scheduler and
loopback model, advanced its next run, and reopened the saved reply via
**Open run**. The test paused it before the second occurrence. Form tests
rejected both a missing and a repeated daylight-saving time, and the native
engine tests covered missed-run policies.

The Local routine form now offers **Daily**, **Weekly**, and **Monthly**
with a time picker. Weekly asks for the days of the week, and Monthly shows
when shorter months will be skipped. All three use the existing cron engine.
Signed-in development Electron created a Daily routine from the time picker
in Asia/Kolkata. The native scheduler dispatched it once through the loopback
model, advanced to the same time tomorrow, and opened its saved reply via
**Open run**. The test paused the routine afterward. Focused form and schedule
tests passed for all three presets.

After a recurring routine completes, pausing it now shows **Paused** and
keeps the last run result and **Open run** visible. Signed-in development
Electron verified that Pause hid the next occurrence, Resume restored the
same occurrence without triggering an extra run, and a second pause survived
a reload with the saved reply still accessible.

### Desktop Code artifacts

On November 24, signed-in Electron opened the Artifacts tab from Code. The
authenticated Library endpoint saved a Markdown fixture in the development
database and a loopback object-store fixture. Library search excluded the
file for a different query, found it by name, and reopened its preview. The
authenticated download matched the original bytes. A link to that artifact
while the Images tab was active previously left the old filter selected.
After the correction the link selected Artifacts and showed the preview.
The selected tab and the page fit at 1,440, 390 and 320 pixels. This did not
exercise model generation or production object storage.

### Desktop Code Plugins and sidebar

On November 24, a signed-in Electron profile opened Plugins from Code and
searched the development catalog without changing any plugin grants. The
active Settings section stayed visible when the window changed between
1,440, 390 and 320 pixels in both themes. Closing Settings after a resize
returned focus to the replacement Plugins button. Unpinning Plugins moved it
to More and survived a reload. Closing Plugins or Edit sidebar after opening
them from More returned focus to More. The Code draft survived opening and
closing the dialogs. Plugin installation and external connector grants were
outside this run.

### Mobile Remote Code approval previews

The mobile Remote Code session keeps approval metadata from both snapshots
and live events. An incomplete preview shows the warning and offers Deny;
full previews still offer Approve and Deny. Rendered React Native tests
exercised both message paths and checked the exact denial request. The CLI
host now clips previews using the phone's UTF-16 limit. Host tests covered
a Unicode command that previously exceeded that limit and confirmed the
host still refuses approval and accepts denial for incomplete previews.
The mobile build keeps Companion disabled, so live paired-device
acceptance is pending an enabled build.

Mobile Code now explains a stopped previous turn when a paired computer
reopens the saved session. A host error takes precedence when the computer
reports one. Rendered mobile tests verified that the saved prompt stays
visible, that submitting a follow-up leaves the notice visible while it
travels to the computer, and that a new turn clears it. Desktop and CLI
host tests verified the failed snapshot and accepted follow-up for the same
session. Live paired-device acceptance remains pending.

The Desktop and CLI hosts also return a rejected follow-up to the phone
when starting it fails or the queue is full. Mobile Code shows the unsent
text and offers to restore it when the composer is empty. A refresh keeps
the rejected text, and a newer draft stays in the composer. The host tests
verified that a refusal preserves its own text and leaves a later follow-up
eligible to run. The focused mobile, Desktop, CLI, and contract suites
passed 163 tests. A live paired-device test still needs an enabled build.

Mobile Code drafts now stay in memory for each session within the current
pairing. Renderer tests reopened the screen both before a send and while
transport was pending. The send remained in flight and its completion
preserved a newer edit. Connection tests preserved the draft on reconnecting
with the same pairing secret, cleared it when the secret changed, and
verified that a late completion from the old pairing could not alter the
replacement draft. All 91 focused mobile tests and the typecheck passed.

The phone now keeps a follow-up draft while it waits for an application
result. Desktop and CLI return the original request IDs when they queue,
start, or refuse guidance. A transport receipt or an unrelated result
leaves the draft in place. After 30 seconds without a matching result the
phone reports unconfirmed delivery and keeps the text available. Tests
covered matching and unrelated results, a lost result, and restoring a
refused message alongside a newer draft. The 180 focused tests and the
Mobile and shared-package typechecks passed.

Within the same pairing, reopening Mobile Code can now recover a missed
confirmation from the Desktop or CLI session snapshot. The snapshot carries
request IDs for queued and recently started follow-ups. A matching ID clears
the unconfirmed draft, while unrelated results and newer edits keep their
text. Tests verified a confirmation missed while detached, recovery without
starting a duplicate turn, and exclusion of confirmations from a forgotten
pairing. The 163 focused tests, typechecks, and lint passed.

Reopened Mobile Code also recovers recent refusals missed while detached.
Desktop and CLI include a bounded set of refused follow-ups in the paired
session snapshot. The phone shows the original text with Restore draft and
deduplicates live and snapshot results by request ID. The renderer test
restored the text once and replayed both the old snapshot and the live event.
Neither brought the refusal back or sent another follow-up. The Desktop
host test also confirmed that forgetting the pairing drops its refusals.

### Mobile chat action sheets

On November 24, the iPhone simulator showed a strip of scrim under Export
Conversation. The export sheet and the message actions sheet now paint
through the bottom safe area while keeping their controls inset. In the same
saved Local chat on the rebuilt simulator app, the export panel reached the
bottom edge, message actions opened and dismissed, and Export as Text
generated a file and presented the native share sheet. The focused React
Native tests also checked the bottom inset and width of both panels.

The iPhone export also reproduced a doubled dot before `.txt` when the chat
title ended with a period. Mobile, web, and Chrome downloads now use the
shared filename rule when they append an extension. The rebuilt simulator
app produced a single-dot name, retained the conversation text, and opened
the native share sheet. Chromium downloaded a fixture through the web
artifact download function with the expected `.csv` name and bytes. ZIP
tests verified that colliding names retain both entries.

The iPhone simulator reproduced an undimmed status bar when Add to Chat
opened inside a saved conversation. Its host now sits outside the
keyboard-adjusted conversation, as on New chat. In the rebuilt app, the
scrim dimmed the status bar and header evenly, and Choose style opened the
style picker from Add to Chat. The model picker dimmed the full screen
before and after the change. Closing it returned to the saved conversation.
The six focused mobile suites passed 231 tests.

### Android text size during an open conversation

An Android 14 emulator reproduced a saved Local conversation returning to
New chat when the system text size changed from 100% to 130%. Expo now
generates the activity's font-scale configuration handler. In a rebuilt
development APK, the conversation and unsent draft stayed open when returning
from Settings. The text grew at 130% and returned to its original size at
100%. The generated manifest, packaged activity, and 68 focused tests passed.

### Personalization at the largest iPhone text size

On November 24, the simulator reproduced the small heading and fixed-height
editors at its largest accessibility text setting. The updated bundle puts
the title below the navigation actions, fits the word on one line, and
increases the input height with the text. Long placeholder examples appear
as wrapping guidance. In Local mode, a multiline edit saved and reopened
with the same value at the largest size.

Focused tests verify the multiline cap against a measured keyboard
viewport and its expansion after the keyboard closes. The simulator run
did not show a software keyboard, so the live keyboard fit remains open.

The Android follow-up opened the actual software keyboard at 200% text
size in a 320 × 640 dp window. Custom Instructions grew while typing.
The edited field ended at pixel 906 and the keyboard began at pixel 937,
leaving its last line and caret visible. Save and reopen restored the
entire edit. The iPhone software-keyboard check remains open.

## Lifecycle execution matrix

The owners below are current implementation entry points. The final column is
the remaining acceptance boundary, even when a narrower test passed. Forty-three
scenarios are a finite working matrix, not an exhaustive architecture guarantee.

### Cloud, schedules and data

| ID  | Case and canonical owner                                                                                                    | Evidence this pass; remaining check                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Simultaneous turns and duplicate request IDs: `apps/web/app/api/llm/v1/chat/completions/lib/conversation-turn-admission.ts` | Inspected admission/lock tests. Run competing real SQL admissions and verify one owner/reservation.                                                                                     |
| C02 | Delayed/replayed events: `apps/web/lib/services/cloud-agent-run-service.ts`                                                 | Inspected event cursor and state guards. Replay persisted events through a fresh client and prove no terminal-state regression.                                                         |
| C03 | Browser stops reading: `apps/web/lib/workflows/durable-stream-write.ts`                                                     | Inspected bounded writer and unread-stream tests. Run the real workflow through disconnect/reopen and settlement.                                                                       |
| C04 | Cancel, orphan reaping and late executor events: `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts`           | Inspected terminal-state/reaper handling. Verify actual executor abort and any already-started external effect separately.                                                              |
| C05 | Competing approval, expired checkpoint and stale lease: `apps/web/lib/services/cloud-agent-run-service.ts`                  | Inspected guards. Race real SQL claims with distinct owners; refusal must not execute the tool.                                                                                         |
| C06 | Pooled tenant scope and captured workspace: `packages/platform/data-layer/src/adapters/sql-session.ts`                      | Local live: both drivers isolate actual RLS rows, reuse the same backend and restore scope. Job workspace/org membership and production policies still need their own checks.           |
| C07 | Duplicate usage finalization and reservation recovery: `apps/web/lib/services/managed-usage-request-service.ts`             | Inspected invariant tests. Verify ledger conservation under real SQL contention and late completions without spending credits.                                                          |
| C08 | Concurrent schedule sweeps and revoked membership: `apps/web/lib/services/schedule-service.ts`                              | Inspected occurrence/lease/membership tests. Race two workers against a disposable database.                                                                                            |
| C09 | Ignored abort, retries and missed-run grace: `apps/web/lib/services/schedule-service.ts`                                    | Inspected timeout/retry/grace tests. A terminal row alone cannot prove a remote operation stopped.                                                                                      |
| C10 | Recurrence gap/fold and missed occurrence coalescing: `packages/platform/utils/src/scheduling/schedule-time.ts`             | Native Local recurrence dispatched, advanced and reopened its saved task. Form tests rejected ambiguous or missing one-time inputs. Engine tests covered missed-run coalescing.         |
| C11 | Quiet-hours gap/fold, midnight and date jump: `packages/contracts/types/src/time-focus.ts`                                  | Automated: 54 shared cases, including 1,440 starting-minute checks; nine service cases. Real queued delivery, browser/OS permission and urgent exceptions require transport acceptance. |
| C12 | Hidden/idle sessions and optional polling: `apps/web/lib/hooks/useManagedUsageSummary.ts`                                   | Activity gates inspected. Representative production transfer measurement remains `NEON-FREE-TRANSFER-BUDGET-01`; source gates do not prove Free-plan readiness.                         |

### Rendering and extensibility

| ID  | Case and canonical owner                                                                                                                    | Evidence this pass; remaining check                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Functional output versus image intent: `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`                                          | Automated output-intent cases reject inappropriate image calls and preserve explicit image requests with stubs. Current provider tool choice still needs minimal authorized live acceptance. |
| R02 | UTF-8/SSE/tool-argument byte splits: `packages/ai/providers/google/src/__tests__/stream-crlf-framing.test.ts`                               | Automated: seven framing cases with multilingual partitions. Verify source identity through persistence, reopen and copy.                                                                    |
| R03 | Incomplete math/code/diagram streaming and cancellation: `packages/ui/unified-chat/src/components/markdown/StreamingMarkdownContent.tsx`    | Parsing/stream ownership inspected. Verify cancel → persisted partial output → fresh session in both themes.                                                                                 |
| R04 | Edit the second identical block; conflicting revisions: `packages/ui/unified-chat/src/components/markdown/assistantFenceEdits.ts`           | Automated functional/copy fixtures passed. Remounts do not establish fresh server-backed reopening or concurrent SQL edits.                                                                  |
| R05 | Separate diagrams, charts and artifact order: `apps/web/features/chat/components/messages/MessageBubble.tsx`                                | Functional fixtures passed with renderer mocks. Run actual Mermaid compilation and inspect controls/geometry in the browser.                                                                 |
| R06 | Four independent images, partial failure and retry: `apps/web/features/chat/components/messages/MessageBubble.tsx`                          | Deterministic gallery/tool-loop fixtures passed. The environment-gated gallery-envelope case was skipped; actual wire-envelope acceptance remains open.                                      |
| R07 | Hostile HTML/SVG and sandbox message spoofing: `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx`                       | Automated Markdown XSS cases passed. Deployed CSP, iframe isolation and parent-message enforcement need browser/runtime evidence.                                                            |
| R08 | Account/workspace switch during artifact completion: `apps/web/features/chat/stores/artifacts-store.ts`                                     | Scope invalidation inspected. Inject a late old-account result through real stores; the cache-scope mock alone is insufficient.                                                              |
| R09 | Skill metadata, warm cache and header-only updates: `apps/web/features/plugins/server/directory/installed-skills.ts`                        | Metadata repair already committed at the baseline with prior regression evidence. Running-UI import/refresh and distributed cache acceptance remain open.                                    |
| R10 | Plugin disable/re-enable/removal versus connector lifetime: `apps/web/lib/connectors/plugin-connectors.ts`                                  | Implementation and prior tests inspected. Claude's documented retained-connector behavior is a comparison point, not authorization to change AGI account grants.                             |
| R11 | Connector discovery followed by 401/403/revocation: `apps/web/lib/user-connector-tools.ts`                                                  | OAuth fixtures passed. Real provider revocation/in-flight expiry remains unverified; do not grant a new service merely to test it.                                                           |
| R12 | Session approval, risk, explicit block and temporary chats: `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Session-grant fixtures passed, including unavailable storage. Real concurrent grants and scope restoration remain open.                                                                      |

### Developer and native surfaces

| ID  | Case and canonical owner                                                                                                           | Evidence this pass; remaining check                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Deferred inline edit versus human changes: `apps/extension-vscode/src/core/runInlineCommand.ts`                                    | Fourteen safety unit cases and native editor checks passed. Preserve original-code negative controls; do not silently rebase a stale proposal.                                                                      |
| D02 | Native edit races, cancellation and outcome receipt: `apps/extension-vscode/src/platform/applyEdit.ts`                             | Native competing writes accept one winner; unit tests preserve the receipt if cancellation follows a committed edit. Do not infer network/backend cancellation from this result.                                    |
| D03 | Workspace trust and outbound sensitive content: `apps/extension-vscode/src/core/outboundContentGuard.ts`                           | Full extension unit suite includes trust/refusal coverage. Run permission changes during actual runtime tool requests with no sensitive payloads.                                                                   |
| D04 | Multi-root workspace identity and execution target: `apps/extension-vscode/src/integrations/localRuntimeClient.ts`                 | Inspected Host Developer boundary. Verify two folders and target switches against the real stdio runtime.                                                                                                           |
| D05 | Argument/workspace-bound approvals and reconnect: `apps/cli/src/app_server/developer_host.rs`                                      | Inspected typed host boundary. Run CLI/IDE reconnection, revoked approval and stale request IDs; Rust suites were not run in this pass.                                                                             |
| D06 | Paths, symlinks and credential attachments: `apps/desktop/electron` and VS Code outbound guards                                    | Inspected native guard ownership. Exercise filesystem races and permission withdrawal on each public host; retained Tauri tests are not Electron evidence.                                                          |
| D07 | Electron bridge origin and native grant withdrawal: `apps/desktop/electron/main.ts`                                                | Inspected hosted-Web and device boundary. Verify invalid origins, permission withdrawal and renderer restart in the public host.                                                                                    |
| D08 | CLI interrupt, partial transcript and session recovery: `apps/cli/src/tui/tui_app.rs`, `apps/cli/src/app_server/developer_host.rs` | Native macOS TUI reopened a stopped stream after forced close, cancelled a pending approval, and stopped an approved foreground command and its child. Developer-host process reaping also passed its focused test. |
| D09 | Command working directory, stop and output limits: `apps/extension-vscode/src`                                                     | Existing extension unit coverage executed. Verify the actual terminal/runtime path; a text output channel is not a structured test-results interface.                                                               |
| D10 | Device authentication and native secret lifetime: `apps/extension-vscode/src/test/runTests.ts`                                     | Native synthetic secret round trip passed with memory-only storage; real OS-backed secure persistence and account switching remain unverified.                                                                      |
| D11 | Browser tab/frame provenance and navigation: `apps/extension/src`                                                                  | Inspected ownership boundaries from the architecture atlas. Run stale-tab/navigation/frame changes in the actual extension.                                                                                         |
| D12 | Local/BYOK versus eligible Cloud sync: `apps/extension/src/features/cloud-bridge/conversationSync.ts`                              | Inspected provenance gating. Verify explicit handoff and refusal across real surfaces without sending Local data to Cloud.                                                                                          |
| D13 | Installed VSIX identity, copied tests and zero cases: `apps/extension-vscode/src/test/vsixInstallation.ts`                         | Local/native package hash, installed bytes and four named cases verified; empty selections now fail. Other store distributions are not covered by this artifact.                                                    |
| D14 | Selected CLI source-release closure: `apps/cli/Cargo.toml`                                                                         | CLI + 12 internal Rust crate dependencies and shared build inputs inspected. A clean isolated export build and license decision remain open; the whole repository is not being relicensed.                          |

### Media, files, effective settings and scale

| ID  | Case and canonical owner                                                                                        | Evidence this pass; remaining check                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X01 | Image-job cancel/retry, partial assets and settlement: `apps/web/app/api/media/image/lib/image-job-executor.ts` | Source-traced in the atlas. Use provider stubs and real persistence before authorized live output quality checks. No image credits used here.                      |
| X02 | Voice permission, reconnect, interruption and settlement: `apps/web/features/chat/lib/live-voice-session.ts`    | Source-traced separate transport/usage lifetime. Device audio, real disconnection and late tool events remain open.                                                |
| X03 | Upload/archive validation and document round trips: file/artifact owners in the atlas                           | Source inventory only. Validate malformed archives, boundary sizes, binary preservation and native document export/reopen with fixture files.                      |
| X04 | Global/conversation/model reasoning and status: request routing and provider adapters                           | Source inventory only this pass. Compare actual effective payload with displayed setting on model switch; a “Thinking” label does not prove reasoning was enabled. |
| X05 | Backpressure, resource bounds and horizontal scale: Cloud run, stream and data owners above                     | Bounded paths inspected; no production load or 100,000-user run performed. Define measurable resource/latency budgets before claiming scale.                       |

## Current primary comparison evidence

Checked on 2026-11-02. These are documented behaviors, not live comparative UI
sessions or evidence that AGI has parity. Unknown plan, region or platform limits
remain unknown. No decompiled vendor code was imported.

| Reference                                                                                                                                                                                                                                                             | Bounded comparison and availability                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ChatGPT capabilities](https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview)                                                                                                                                                                     | Tools depend on settings/subscription. Existing supplied ChatGPT examples remain dated observed references; this page does not prove current visual geometry.                                                                                                                                                  |
| [Claude unified Plugins page](https://support.claude.com/en/articles/17740565-manage-plugins-skills-and-connectors-from-one-plugins-page) and [connector permissions](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) | Primary extensibility reference. Unified page rollout began October 29; documented general availability November 9 and Enterprise November 30 are future dates at this check. Plugin removal and connector grants have distinct lifetimes. Mobile connector beta and organization controls limit availability. |
| [Perplexity Computer setup](https://www.perplexity.ai/personal-computer-setup)                                                                                                                                                                                        | Mac/device setup distinguishes folders, apps, browser and sensitive-action permissions. No inference about vendor DST scheduling semantics or all-platform availability.                                                                                                                                       |
| [Gemini Canvas](https://support.google.com/gemini/answer/16047321?hl=en)                                                                                                                                                                                              | Computer/web editing, saves and app preview guide the relevant artifact job. Direct fetch succeeded in this refresh; an earlier fetch timeout was not missing-feature evidence.                                                                                                                                |
| [Cursor Agent](https://cursor.com/docs/agent/overview) and [security](https://cursor.com/docs/agent/security)                                                                                                                                                         | Developer reference separates models, tools and instructions; checkpoints concern files rather than message history. MCP connection and tool approval are distinct. We do not copy weaker workspace-trust defaults.                                                                                            |
| [Antigravity permissions](https://antigravity.google/docs/permissions) and [agent settings](https://antigravity.google/docs/agent-settings)                                                                                                                           | Developer reference distinguishes permission precedence, project/global settings and sandbox/code access. Platform/preset differences and preview availability prevent assuming every account uses one behavior.                                                                                               |

## Verification and completion boundary

The focused Web run passed 125 tests and skipped one environment-gated gallery
case. The shared types package passed 2,281 tests, and all 1,507 extension unit
tests passed. Both live SQL legs passed 32
cases. Four packaged native VS Code cases passed with no provider credentials;
seven multilingual stream-framing tests passed. Package typechecks passed for
Web, shared types, the data layer, the Google adapter and VS Code, including its
native test build. Logs and report receipts are local review artifacts, not
production telemetry. Repository-guard receipts must accompany the commit;
no remote CI result is claimed here.

No production deployment, database migration, provider grant, billing change or
Fly restart is part of this pass. Mobile devices, actual OS credential storage,
fresh server-backed rendering reopening, deployed sandbox behavior and real
provider revocation remain unverified. Close rows only with their stated
acceptance evidence or an explicit decision recorded in the existing owner.
