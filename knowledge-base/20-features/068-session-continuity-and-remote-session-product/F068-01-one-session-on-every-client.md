---
id: "F068-01"
type: "feature"
title: "One session on every client"
aliases: ["One session on every client", "Shared session identifier", "Cloud Code session", "AGI Code session (phone screen label 'AGI Code')", "Managed Code session", "Code session page /code/<session id>", "developer session / thread (the local kind)"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.01", "S68.02", "S68.03", "S68.04", "S68.05", "S68.06", "S68.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-execution-boundaries", "table:cloud_code_sessions", "api:GET /api/code/sessions", "file:apps/web/lib/e2b/gate.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-01 One session on every client

A coding session keeps one id. Cloud Code sessions open by that id on web, desktop (the hosted web app), phone, command line and VS Code, with the same history, repository and branch. Model is chosen per turn by each client, and plan, checkpoints and worktree are shared only on local CLI and VS Code sessions.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.01](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6801), [S68.02](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6802), [S68.03](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6803), [S68.04](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6804), [S68.05](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6805), [S68.06](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6806), [S68.07](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6807).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person start a coding session on one app and open the same session, by the same id, on another. There are two kinds. Cloud Code sessions live in AGI's servers and are reached through /api/code/sessions. Local developer sessions live on the person's machine in the CLI-hosted store and are shared by CLI, VS Code and Desktop Code (doc: docs/product/definition.md:118-120).

**Why it exists.** The product requirement is one account and one effective session per piece of work, so a person can start at a desk, check from a phone and finish in the editor without copy and paste (doc: docs/product/definition.md:118-120).

**Who uses it.** Developers who run coding tasks in a cloud sandbox or in a local terminal, and testers who check that clients agree.

**Problems it solves**

- No more re-describing a task on each device.
- The same repository and branch are visible everywhere, so nobody works on the wrong branch.
- A deleted or unreachable session gives a clear message instead of a crash.

**Use cases**

- Start a cloud session on the web, then follow it from the phone.
- Run agi code list in a terminal to find a session id, then open it on the web.
- Open the same cloud session from the VS Code Sessions sheet and continue the chat there.
- Open a local CLI session in the desktop app's Code view (same host store).

## 2. User experience

**Where to find it**

- Web: page /code and /code/<session id> (apps/web/app/code/[sessionId]/page.tsx:11-15); the session rail lists sessions (apps/web/features/code/components/CodeRail.tsx).
- Desktop: the Electron window shows the hosted web app, so it is the same /code page (doc: AGENTS.md section 5); local sessions appear in the web Code view only when it runs inside the desktop host (apps/web/features/code/hooks/use-local-sessions.ts:17-20,120).
- Phone: route cloud-code and cloud-code/<session id> (apps/mobile/app/(app)/cloud-code/[sessionId].tsx:4-6); the screen title is 'AGI Code' (packages/contracts/types/src/pairing.ts:30).
- CLI: agi code list, agi code show <id>, agi code open <id> (apps/cli/src/lib.rs:1092-1097,1203-1214).
- VS Code: command 'Code: Open AGI Code Session' (apps/extension-vscode/package.json:596-599) and the cloud tasks tree that refreshes every 15 seconds (apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:10).

**Before you start**

- Cloud Code sessions: signed in to AGI, and the cloud Code service must be switched on for the deployment and the plan must include it (apps/web/app/api/code/sessions/route.ts:57-65).
- Phone: Cloud mode and an unlocked cloud account (apps/mobile/src/features/cloud-code/useCloudCodeAccess.ts:36-41).
- CLI: Cloud (managed) mode and a signed-in account; other modes are refused (apps/cli/src/cloud/client.rs:361-373).
- VS Code: signed in to the AGI account (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:49-55).

**Screens and controls**

- Web: session rail, status filters, sort (activity, created, title), search (apps/web/features/code/code-surface.ts:495-505); archived banner and Unarchive on the phone (packages/contracts/types/src/cloud-code.ts:241-253).
- Phone: session list with search, sort and sections per repository (apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:90-104; apps/mobile/__tests__/CloudCodeSessionViews.test.ts).
- CLI list filters: open, closed, archived, all (apps/cli/src/cloud/code_sessions.rs:7).
- VS Code quick pick title is the session title; placeholder shows state, repository and branch (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:62-77,284-290).

**Journey**

1. 1. Create or find a session (web /code, phone AGI Code list, or agi code list).
2. 2. Copy or tap the session; its id is in the address /code/<id>, the phone route, or the CLI list.
3. 3. Open it on another client: web address, phone list row, agi code show <id> or VS Code Open AGI Code Session.
4. 4. The client reads the session and its turns (history), repository and branch and shows them.
5. 5. Send the next task from any client; the others see it on their next read.

**What the person sees and gets**

- Phone: 'That session is not available. It may have been deleted.' for a missing session, with a button back to the list (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:79,394-418).
- Phone: 'This session could not be opened' with Try again when loading fails first time; the last good view stays if a later reload fails (apps/mobile/src/features/cloud-code/service.ts:11; useCloudCodeSession.ts:136-141).
- Web: 'That session is not available. It may have been deleted.' and a redirect to Code home (apps/web/features/code/code-surface.ts:219; CloudCodePage.tsx:735-747).
- CLI: a text list and show output with the page address (apps/cli/src/cloud/code_sessions.rs:224-300).

**Settings**

- Transcript view Normal or Verbose on web (apps/web/features/code/components/CodeSessionMenu.tsx:100-120).
- Phone model picker feeds the model sent with each turn (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:243-247).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The same session id opens the same cloud session on web (apps/web/app/code/[sessionId]/page.tsx:11-15), phone (apps/mobile/app/(app)/cloud-code/[sessionId].tsx:4-6), CLI show/open (apps/cli/src/lib.rs:3146-3160) and VS Code (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:272-300).
- The session record carries repository address, base branch, working branch, state and timestamps, so every client that reads it shows the same repository and branch (packages/contracts/types/src/cloud-code.ts:99-135).
- History is rebuilt from stored turns and their steps on every read, on web and phone (apps/web/features/code/CloudCodePage.tsx:712-733; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:121-133,193-200).
- Instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md, at most two) are read on the server from the cloned workspace, so every client gets the same ones (packages/contracts/types/src/project-instructions.ts:1-9; apps/web/lib/services/cloud-code-project-instructions.ts:27-47).
- Local developer sessions: CLI prints worktree and branch in its session status lines (apps/cli/src/agent/mod.rs:2223-2262 [status function]); VS Code lists, creates and removes session worktrees (apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts:14-60).
- The app server advertises checkpoints, so CLI-hosted clients (VS Code, Desktop Code) can list them (apps/cli/src/app_server/developer_host.rs:1058,3661).

**Incomplete**

- Model: the session record has no model field; each client sends its own model with every turn (phone: useCloudCodeSession.ts:229-233; VS Code: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:116-125; packages/contracts/types/src/cloud-code.ts:99-135). So two clients can run the same session with different models [inferred]. The brief marks S68.06 partial on web and desktop pending the cloud switch (doc: audit/partial/068-session-continuity-and-remote-session-product.md).
- Web and desktop cloud Code is partial because the deployment switch needs AGI_E2B_EXECUTION=1 and E2B_API_KEY (apps/web/lib/e2b/gate.ts:20-28; doc: audit/partial/068-session-continuity-and-remote-session-product.md). Whether production has them set is unknown.
- VS Code, CLI show and list read a snapshot; they do not stream (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:280).

**Present but disconnected or switched off**

- Phone Remote Control to a desktop's local sessions is hidden: FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:16).

**Not available**

- Worktree association (S68.05) and task plan and checkpoints (S68.07) for cloud sessions on web, desktop and phone: the cloud session record has no such fields (packages/contracts/types/src/cloud-code.ts:99-135; doc: brief S68.05, S68.07).
- Chrome extension: not applicable (status n/a).

## 4. Required behaviour

**Established requirements**

- One session identifier names the same coding session on every supported client. (source: brief S68.01)
- Opening the session on any client shows the same conversation history, active branch and repository. (source: brief S68.02, S68.03, S68.04)
- Every client associates the session with the same worktree. (source: brief S68.05)
- Every client runs the session with the same model and the same instruction files. (source: brief S68.06)
- Every client shows the same task plan and checkpoints. (source: brief S68.07)
- Desktop Code, CLI and VS Code use the same session ids and transcripts; resuming appends to the same id and forking creates a new id. (source: docs/product/definition.md:119)
- Web, phone, desktop cloud and Chrome share one signed-in Cloud continuity domain; a change on one must converge on the others. (source: docs/product/definition.md:118)

**Acceptance criteria**

1. A cloud session created on web opens by the same id on phone, CLI (agi code show) and VS Code, with the same title, repository and working branch.
2. The transcript on each client lists the same turns in the same order after a reload.
3. A deleted session id shows the 'not available' note on web and phone, not an error screen.
4. A failed reload after a good load keeps the last good view on phone and shows an error line.
5. With the cloud switch off, web and desktop show the unavailable notice and create nothing.
6. Opening a local CLI session in VS Code shows the same transcript and branch.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model should be stored on the session or shown per turn so clients agree [inferred from S68.06 and the missing field].
- Instruction files agree across clients only because the server reads them; a local client reading its own copy may differ [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the model used on each turn record and show it in every client.
- [proposed] Show the worktree path and plan on cloud sessions by adding them to the session record.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | CodeSessionRoute | `apps/web/app/code/[sessionId]/page.tsx` | Web route that opens a cloud session by id |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Web Code page: list, transcript, polling, missing-session handling |
| endpoint | GET/POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Lists sessions with availability; creates a session |
| endpoint | GET /api/code/sessions/[sessionId] | `apps/web/app/api/code/sessions/[sessionId]/route.ts` | Reads one session with turns and terminal entries (file exists; body not opened) |
| service | openCloudCodeSession | `apps/web/lib/services/cloud-code-session-open.ts` | Gates and creates a cloud session |
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Reads AGI_E2B_EXECUTION and E2B_API_KEY to say if cloud Code is ready |
| table | cloud_code_sessions | `apps/web/db/neon/0075_cloud_code_sessions.sql` | Stores the session row |
| schema | CloudCodeSession type | `packages/contracts/types/src/cloud-code.ts` | Shared session shape: repository, branches, state, archive |
| config | PROJECT_INSTRUCTION_FILES | `packages/contracts/types/src/project-instructions.ts` | Names the instruction files read for a session |
| service | readCloudCodeProjectInstructions | `apps/web/lib/services/cloud-code-project-instructions.ts` | Reads instruction files from the sandbox clone |
| hook | useCloudCodeSession | `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts` | Phone: loads, polls, missing and error states |
| screen | CloudCodeSessionScreen | `apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx` | Phone session screen and missing/error view |
| screen | CloudCodeSessionsScreen | `apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx` | Phone session list |
| command | agi code list/show/open | `apps/cli/src/lib.rs` | CLI commands that read cloud sessions by id |
| service | code_sessions | `apps/cli/src/cloud/code_sessions.rs` | CLI client for /api/code/sessions and list/detail rendering |
| service | cloudCodeSessions | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | VS Code session quick pick and web link |
| component | CloudTasksTree | `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts` | VS Code tree, refreshed every 15 seconds |
| service | sessionWorktrees | `apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts` | VS Code worktree create, list, remove |
| service | developer session host | `apps/cli/src/app_server/developer_host.rs` | Local session store host shared by CLI, VS Code and Desktop Code |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Desktop bridge to the CLI-hosted local session store |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends an authenticated read for the session id. | device | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:121-133 |
| Server checks the person owns the session and returns the session, terminal entries and turns. | our servers | apps/web/app/api/code/sessions/[sessionId]/route.ts (exists; body not opened) and apps/web/features/code/CloudCodePage.tsx:712-733 [inferred] |
| Client rebuilds the transcript from terminal entries and turns. | device | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:193-200 |
| Instruction files and repository clone live in the cloud sandbox, which is an outside service, and the server reads them there. | outside service | apps/web/lib/services/cloud-code-project-instructions.ts:27-47; apps/web/lib/e2b/gate.ts:20-28 |
| For local sessions, a client talks to the CLI-hosted app server on the same machine, which reads the session store on disk. | device | apps/cli/src/app_server/developer_host.rs:1550-1580 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud session row (title, repository, branches, state, archive, share) | table cloud_code_sessions on our servers | Read by every client of the account; no local copy beyond caches | unknown |
| Turns, steps, approvals | tables cloud_code_agent_turns, cloud_code_agent_steps, cloud_code_agent_approvals | Read by every client | Approvals expire after 30 minutes (apps/web/lib/services/cloud-code-agent-service.ts:957-966); others unknown |
| Local session file and writer lease | CLI managed session store on the person's disk | Not synced to our servers by this feature | unknown |

**Models and providers.** The model is sent with each turn by the client (apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:229-233). Which models the cloud route accepts is decided by resolveHarnessModel (apps/web/lib/services/cloud-code-agent-service.ts:41); the allowed list is unknown. Reading a session needs no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in to AGI on every client for cloud sessions (apps/web/app/api/code/sessions/route.ts:40-44; apps/cli/src/cloud/client.rs:375-379). Local CLI sessions need no account [inferred]. |
| Permissions | Rate limit on list and create (apps/web/app/api/code/sessions/route.ts:42-43); create needs a CSRF token (route.ts:70-72); organization id is part of the owner scope (route.ts:41). |
| Subscription | Availability is true only when the plan includes AGI Code, meaning a sandbox allowance above zero and a daily code ceiling above zero (packages/contracts/types/src/billing-catalog.ts:839-841; apps/web/app/api/code/sessions/route.ts:57-65). Creation also runs the managed compute access check (apps/web/lib/services/cloud-code-session-open.ts:138-147). Plan names: unknown. |
| Limits and metering | Per-plan session cap maxSessions is returned (apps/web/app/api/code/sessions/route.ts:45-46,62-65). Turn cost is settled from provider usage (apps/web/lib/services/cloud-code-agent-service.ts:302-312). Listing and reading are not metered as far as read. |
| Feature flags | AGI_E2B_EXECUTION=1 and E2B_API_KEY (apps/web/lib/e2b/gate.ts:7-28); AGI_MANAGED_COMPUTE_PRIVATE_BETA, which is on unless set to 0, false or off (apps/web/lib/managed-compute-gate.ts:40,55-58); phone FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:16). |
| Model compatibility | Phone resolves the agent model from the picked model and tier (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:243-246); VS Code does the same (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:116-125). A flagship check exists (apps/web/lib/services/cloud-code-agent-service.ts:318-319). Full compatibility list: unknown. |
| Provider restrictions | Cloud turns use a managed route; a provider-proxy endpoint exists under the session (apps/web/app/api/code/sessions/[sessionId]/provider-proxy). Which providers it permits: unknown. |
| Local mode | Cloud sessions are not reachable in Local or own-key mode: the CLI refuses with 'nothing is sent to your AGI cloud account in this mode' (apps/cli/src/cloud/client.rs:49-54,368-373), and the phone needs Cloud mode (apps/mobile/src/features/cloud-code/useCloudCodeAccess.ts:36-41). Local developer sessions work on the device without cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Phone starts in 'loading'; web shows detail loading. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:95; apps/web/features/code/CloudCodePage.tsx:700-702 |
| Missing session (400, 403, 404) | Phone sets status 'missing' and shows the note; web clears selection and redirects. | apps/mobile/src/features/cloud-code/service.ts:15,32-34; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:136-138; apps/web/features/code/CloudCodePage.tsx:735-747 |
| Load error | Phone keeps last good view if already ready, else shows error and Try again. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:139-142; CloudCodeSessionScreen.tsx:394-418 |
| Archived or closed | Phone shows archived banner with Unarchive, or a closed note, and hides the composer. | apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:552-570 |
| Cloud switch off or plan not entitled | Web shows an unavailable notice; creation throws 'Managed Code is not enabled for this deployment'. | apps/web/features/code/CloudCodePage.tsx:2068-2075; apps/web/lib/services/cloud-code-session-open.ts:44-48 |
| Offline or reconnect | Phone reloads on return to foreground; no offline cache found. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:159-163; offline cache not handled in the code |
| Accessibility | Phone controls carry accessibility labels such as 'Go back' and 'Dismiss'; the error line is an alert role. | apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:107,202; CloudCodeSessionsScreen.tsx:217-229 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CloudCodeSessionViews.test.ts`: Phone list: state filters, ordering by update time, search over title, repository and branch, grouping by repository, pinned computer sessions
- `apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx`: Phone polling waits for a slow poll, stops when the screen closes, keeps pending tasks, retires on account change
- `apps/web/features/code/CloudCodePage.test.tsx`: Web Code page behaviour including the 'Managed Code is not configured' notice (file exists; other cases not listed)
- `apps/web/features/code/code-surface.test.ts`: Web code surface helpers (file exists; cases not opened)
- `apps/extension-vscode/src/__tests__/cloudSessionsSheet.test.ts`: VS Code cloud sheet keeps cloud chats when AGI Code listing fails; names workspace trust in Restricted Mode
- `apps/web/app/api/code/sessions/route.test.ts`: Sessions list and create route (file exists; cases not opened)

**Test scenarios**

- **Same session on web and phone**
  1. Create a session on web.
  2. Open AGI Code on the phone in Cloud mode.
  3. Open the same row.
  - Expected: Title, repository, working branch and turns match.
- **Deleted session**
  1. Open /code/<id> of a deleted session on web.
  2. Open the same id on phone.
  - Expected: Both show 'That session is not available. It may have been deleted.'
- **CLI and VS Code read**
  1. Run agi code list --status all.
  2. Run agi code show <id>.
  3. Open the same id in VS Code.
  - Expected: Id, repository and branch agree.
- **Switch off**
  1. Run with AGI_E2B_EXECUTION unset.
  2. Open /code.
  - Expected: Unavailable notice; creating a session fails with the capability message.
- **Model per turn**
  1. Send a turn from phone with one model, then from VS Code with another.
  2. Read both turns.
  - Expected: Result unknown: no model is recorded on the session; check what the turn record shows.

**Where to look when it fails**

- Server error text 'Managed Code is not enabled for this deployment' (apps/web/lib/services/cloud-code-session-open.ts:45-47).
- Phone strings 'This session could not be opened' (apps/mobile/src/features/cloud-code/service.ts:11).
- Tables cloud_code_sessions and cloud_code_agent_turns; audit event code_session_lifecycle_changed (apps/web/app/api/code/sessions/route.ts:74-82).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Desktop: [70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/desktop/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Model is not part of the session; clients can disagree.** Affects: Web, desktop, phone, CLI, VS Code users of cloud sessions. Evidence: packages/contracts/types/src/cloud-code.ts:99-135. Work needed: Record the model per turn and show it on every client.
- **No worktree, plan or checkpoint for cloud sessions on web, desktop, phone.** Affects: Web, desktop, phone. Evidence: doc: brief S68.05, S68.07. Work needed: Add fields to the cloud session and render them.
- **Cloud switch needs two environment values; production state unknown.** Affects: Web and desktop. Evidence: apps/web/lib/e2b/gate.ts:20-28; doc: audit/partial/068-session-continuity-and-remote-session-product.md. Work needed: Owner sets AGI_E2B_EXECUTION and E2B_API_KEY, redeploys, then live-checks /code.
- **Brief line citations for CLI worktree and plan are stale (agent/mod.rs:1590 and 1774 are not about them).** Affects: Documentation. Evidence: apps/cli/src/agent/mod.rs:1741-1784. Work needed: Refresh the brief's code references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-execution-boundaries
- table:cloud_code_sessions
- api:GET /api/code/sessions
- file:apps/web/lib/e2b/gate.ts

## Unknown

- Whether production has AGI_E2B_EXECUTION and E2B_API_KEY set.
- Which models and providers a cloud turn accepts.
- How long cloud sessions, turns and steps are kept.
- Contents of apps/web/app/api/code/sessions/[sessionId]/route.ts and the session service permission checks (not opened).
- Plan names that include AGI Code (billing catalog not read in detail).
