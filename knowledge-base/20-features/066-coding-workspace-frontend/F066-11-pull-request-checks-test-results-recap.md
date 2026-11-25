---
id: "F066-11"
type: "feature"
title: "Pull request, checks, test results, recap"
aliases: ["Pull-request panel (S66.36)", "CI-status panel (S66.37)", "Test-results panel (S66.38)", "Session recap (S66.39)", "LocalPullRequest", "PullRequestChecks", "Run tests", "/recap", "Think Back recap"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S66.36", "S66.37", "S66.38", "S66.39"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-execution-boundaries", "mode:local", "mode:cloud", "api:GET /api/code/local-pull-requests", "api:POST /api/code/local-pull-requests"]
basis: "code inspection"
second_reader: "8 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-11 Pull request, checks, test results, recap

Shows a coding session's pull request (number, link, state, check status) and lets the person push and open one. A tests button runs the folder's test command and shows pass or fail with output. In the CLI, /recap asks the model to summarise the session. Check status shows on web local, web cloud and mobile cloud sessions.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.36](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6636), [S66.37](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6637), [S66.38](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6638), [S66.39](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6639).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** For local sessions on the desktop it reads the branch's pull request from GitHub through our servers, shows 'Pull request #N · state · checks ...' as a link, and can push and open a pull request. For cloud sessions on web and mobile it shows checks with failed check names. The tests button runs the detected test command on the computer. In the CLI, /recap turns the session into a written summary.

**Why it exists.** Finishing a coding session means a reviewed, tested change. People need the pull request and results where they work (S66.36-S66.39).

**Who uses it.** Developers finishing agent work.

**Problems it solves**

- Leaving the app to find the pull request.
- Not knowing whether CI passed.
- Forgetting what a long session did.

**Use cases**

- After a local session press 'Push and open a pull request'.
- Watch 'checks running' turn to 'checks passing'.
- Press 'Run tests' and read the failing output.
- Run /recap in the terminal interface before closing.

## 2. User experience

**Where to find it**

- Desktop-hosted web local session: changes side panel shows the pull request block (apps/web/features/code/components/LocalChangesPanel.tsx:383) and an icon-only header button (ListChecks icon) whose label 'Run tests' / 'Stop tests' is its aria-label and title (LocalSessionPanel.tsx:1129-1141; labels in local-code.ts). The button is not rendered in remote SSH sessions (renders only when !remoteSsh) [LocalSessionPanel.tsx:1129-1141].
- Web cloud sessions: changes panel with PullRequestChecks (apps/web/features/code/components/CodeChangesPanel.tsx:142-210).
- Mobile cloud code session: 'Create pull request' action, a pull request link and checks line with refresh (apps/mobile/src/features/cloud-code/useCloudCodeChanges.ts:128-152; CloudCodeChangesSheet.tsx:231-293; CloudCodeSessionScreen.tsx:364-502).
- CLI: slash command /recap (apps/cli/src/claude_parity.rs:300,1946).
- Mobile remote (companion) code sessions and VS Code: no pull request or test panel found.

**Before you start**

- GitHub connected through the AGI GitHub App for lookups and opening (apps/web/app/api/code/local-pull-requests/route.ts:21-27).
- Local: a git remote and a current branch; the base branch must be known.
- Tests: a test command that detectTestCommand can find.

**Screens and controls**

- Pull request chip: 'Pull request #N · open · checks passing' (local-code.ts:384-411).
- 'Push and open a pull request', 'Create branch and open pull request', 'Open a pull request on GitHub' (compare link when GitHub is not connected), and a reauthorize link after a failed open.
- Cloud/mobile check wording: 'Checks passing', 'Checks failing', 'Checks running', 'No checks reported', 'Check status is unavailable', 'Refresh the checks' (apps/mobile/src/features/cloud-code/presentation.ts:326-331).
- Test notice with output (LocalSessionPanel.tsx:1700-1715).

**Journey**

1. 1. Finish work on a branch.
2. 2. Open the changes panel; the pull request block loads the branch state.
3. 3. If none exists press 'Push and open a pull request'; the app pushes, then opens it.
4. 4. The chip shows number, state and checks; checks poll every 30 seconds while running.
5. 5. Press 'Run tests' to run the project's test command; read the message and output.
6. 6. In the CLI run /recap for a summary.

**What the person sees and gets**

- Not connected: 'Open a pull request on GitHub' link and a text asking to connect (local-code.ts:223-225).
- Read failure: 'The pull request for this branch could not be read.'; open failure: 'The pull request could not be opened.' (local-code.ts:231-232).
- Tests: '<command> passed.', '<command> failed ...', '<command> ran past its time limit and was stopped.', 'The tests could not be started.' (local-code.ts:57-63).
- Recap: a model-written answer in the chat.

**Settings**

- The branch name base used when a pull request needs a new branch is a preference in Local worktree settings (local-code.ts:1886 area; LocalWorktreeSettings.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local pull request lookup and open through GET and POST /api/code/local-pull-requests, including audit event and CSRF check on open (apps/web/app/api/code/local-pull-requests/route.ts:30-95).
- Local pull request component with push, open, compare link, checks polling every 30000 ms while pending, reauthorize link (apps/web/features/code/components/LocalPullRequest.tsx).
- Check status states passing, failing, pending, none are computed from GitHub check runs (apps/web/lib/github-app.ts:1384-1392).
- Cloud session pull request creation POST and status GET (apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:49; .../status/route.ts:33), shown on web and on mobile.
- Test run hook with detection, timeout, stop, and a validation summary record (apps/web/features/code/hooks/use-local-tests.ts).
- CLI /recap sends a summary prompt to the model (apps/cli/src/claude_parity.rs:1946-1955).

**Incomplete**

- Test results on web are a notice with output, not a structured pass and fail count panel (LocalSessionPanel.tsx:1700-1715).
- CLI recap is a prompt to the model, not a stored recap; the brief's 'goal, decisions, files, checks, next steps' is not the prompt's wording. The prompt asks for the current objective, decisions made, files or commands touched, verification already run, open risks and the next concrete actions (claude_parity.rs:300,1946-1955).
- VS Code: no pull request, CI or test panel; the founder decision cuts a test or task panel there (docs/decisions/2026-09-27-founder-decisions.md:103-107).

**Present but disconnected or switched off**

- Only creating a cloud pull request (POST) is gated: the route checks e2bProvisioningReady() (needs AGI_E2B_EXECUTION=1, a non-empty E2B_API_KEY and sandboxComputeIsPriceable) and isManagedComputePrivateBetaEnabled(), which is on unless the env var is 0, false or off, so it works as a kill switch (apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:22-33; apps/web/lib/e2b/gate.ts:20-28; apps/web/lib/managed-compute-gate.ts:55-58).
- Reading cloud pull request checks status (GET) has neither gate; it is signed-in with the 'chat-conversation' per-user rate limit only (apps/web/app/api/code/sessions/[sessionId]/pull-request/status/route.ts:14-31).

**Not available**

- Mobile companion (remote desktop) sessions: no pull request or test panel found.
- CLI: no test results panel or pull request panel found.
- Chrome: not applicable.
- Brief says CI status is missing in every app; code shows check state on web local, web cloud and mobile cloud.

## 4. Required behaviour

**Established requirements**

- The workspace shows the session's pull request (open one, see number, link and state). (source: S66.36 Should)
- The workspace shows CI check status for the session's branch or pull request. (source: S66.37 Should)
- The workspace shows test results: pass or fail, counts and failing output. (source: S66.38 Should)
- The user gets a recap: goal, decisions, files touched, checks run, next steps. (source: S66.39 Should)
- The pull request lookup reports whether GitHub is connected; if not, the person is told to connect. (source: apps/web/features/code/services/local-pull-request-api.ts:9-20; apps/web/lib/services/cloud-code-local-pull-request.ts:152-170)
- A failed lookup shows a message, not an empty state. (source: apps/web/features/code/components/LocalPullRequest.tsx:46-62,150-160)
- No second test or task panel in VS Code. (source: docs/decisions/2026-09-27-founder-decisions.md:103-107)

**Acceptance criteria**

1. Not connected: lookup returns connected false and the page shows the compare link and the connect text.
2. Connected, no pull request: the button 'Push and open a pull request' is enabled except on the base branch.
3. After opening, the chip shows the number and state and links to GitHub in a new tab.
4. Pending checks re-read after about 30 seconds until they settle.
5. A GitHub token problem on open shows an error and the reauthorize link.
6. Tests: a passing run says '<command> passed.'; a non-zero exit says failed with the exit code; a timeout is never a pass.
7. /recap in the CLI sends the recap prompt for 'this session' or the given focus.
8. Stop tests ends a running test.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because test outcome 'unknown' is recorded for timeouts, validation summaries never claim a pass over a timeout [inferred from use-local-tests.ts:44-52].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show test counts and failing test names as a panel.
- [proposed] Keep a saved recap with the session instead of a one-off answer.
- [proposed] Show check status in the mobile companion and VS Code via the same API.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalPullRequest | `apps/web/features/code/components/LocalPullRequest.tsx` | Pull request block with push, open, checks polling. |
| service | local-pull-request-api | `apps/web/features/code/services/local-pull-request-api.ts` | Client for the local pull request route; error with reconnect flag. |
| endpoint | GET and POST /api/code/local-pull-requests | `apps/web/app/api/code/local-pull-requests/route.ts` | Lookup and open; rate limit, CSRF, audit. |
| service | cloud-code-local-pull-request | `apps/web/lib/services/cloud-code-local-pull-request.ts` | Reads or opens a pull request through the GitHub App; repositoryAccess asks for pull_requests:read on lookup and contents:read plus pull_requests:write (with assertRepositoryIsWritable) on open (lines 20-23,81-98). |
| service | github-app | `apps/web/lib/github-app.ts` | Check-run reading and checks state (lines 1299, 1376-1392). |
| endpoint | POST /api/code/sessions/{sessionId}/pull-request | `apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts` | Opens a cloud session's pull request; gated by e2bProvisioningReady and the managed-compute switch (lines 22-33). |
| endpoint | GET /api/code/sessions/{sessionId}/pull-request/status | `apps/web/app/api/code/sessions/[sessionId]/pull-request/status/route.ts` | Pull request and checks status for a cloud session; no E2B or managed-compute gate, only sign-in and the chat-conversation rate limit (lines 14-31). |
| component | PullRequestChecks (web) | `apps/web/features/code/components/CodeChangesPanel.tsx` | Checks line for cloud sessions (lines 142-210). |
| component | PullRequestChecks (mobile) | `apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx` | Checks line with refresh. |
| hook | useCloudCodeChanges | `apps/mobile/src/features/cloud-code/useCloudCodeChanges.ts` | Create pull request and load status on mobile. |
| hook | useLocalTests | `apps/web/features/code/hooks/use-local-tests.ts` | Detect and run tests through the desktop shell. |
| service | cloud-code-result | `apps/web/lib/services/cloud-code-result.ts` | Validation summary from check results. |
| config | local-code strings | `apps/web/features/code/local-code.ts` | Pull request and tests wording, localPullRequestLabel. |
| service | runtime-client branches and push | `apps/web/features/desktop-host/lib/runtime-client.ts` | listLocalBranches and pushLocalBranch via the desktop host. |
| command | /recap | `apps/cli/src/claude_parity.rs` | recap_prompt (line 1946) and dispatch (line 300). |
| test | LocalPullRequest test | `apps/web/features/code/components/LocalPullRequest.test.tsx` | Pull request component. |
| test | local pull request service test | `apps/web/lib/services/__tests__/cloud-code-local-pull-request.test.ts` | Service. |
| test | use-local-tests test | `apps/web/features/code/hooks/use-local-tests.test.ts` | Test run hook. |
| test | pull request status route test | `apps/web/app/api/code/sessions/[sessionId]/pull-request/status/__tests__/route.test.ts` | Status route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page asks the desktop host for the branch list and remote URL. | device | LocalPullRequest.tsx:46-53; runtime-client.ts (listLocalBranches) |
| The page sends remote URL, head and base to our server. | device and our servers | local-pull-request-api.ts:68-80 |
| Our server checks the GitHub App is available and reads the pull request with the user's connection; if not connected it returns a compare link. | our servers | route.ts:21-52; cloud-code-local-pull-request.ts:152-175 |
| GitHub is asked for the pull request and its check runs. | outside service | apps/web/lib/github-app.ts:1299,1376-1392 |
| Open: the host pushes the branch, then the server opens the pull request through GitHub and writes an audit event. | device and our servers | LocalPullRequest.tsx:64-84; route.ts:55-92 |
| Tests: the page detects the command and runs it in the folder through the desktop shell, which asks and sandboxes it. | device | use-local-tests.ts:55-100 |
| CLI /recap sends a prompt to the session's model and prints the answer. | outside service | claude_parity.rs:300,1946-1955 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pull request on GitHub | GitHub | By GitHub | Under GitHub's rules |
| Audit event of an opened pull request | security audit log via recordAuditEvent | Server | unknown |
| Test output | page state and CLI shell output | No | Cleared on a new run or folder change (use-local-tests.ts:65-72) |

**Models and providers.** Pull request and checks use no model. Pull request creation for cloud sessions may include a model-written description [unknown]. /recap uses the session's model like any prompt (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account and a GitHub connection through the AGI GitHub App. If not connected the person gets a compare link (route.ts; cloud-code-local-pull-request.ts:168). |
| Permissions | GitHub installation access; a 'reconnect required' reason is passed to the page (local-pull-request-api.ts:13,50-52). Opening a local pull request needs write access to the repository: repositoryAccess calls assertRepositoryIsWritable for 'open' and requests a token with contents:read and pull_requests:write, while lookup only asks for pull_requests:read (apps/web/lib/services/cloud-code-local-pull-request.ts:20-23,81-98). |
| Subscription | none found in the code for the local pull request route. Creating a cloud session pull request needs the managed Code gates (pull-request/route.ts:22-33); reading its checks status does not (status/route.ts:14-31). |
| Limits and metering | Lookups use the 'default' rate limit and opens use 'chat-conversation' per user (route.ts:38-41,60-62). The cloud pull request status route uses the per-user 'chat-conversation' rate limit only (status/route.ts:14-31). |
| Feature flags | Cloud pull request creation only: AGI_E2B_EXECUTION=1, a non-empty E2B_API_KEY and sandboxComputeIsPriceable (e2bProvisioningReady, apps/web/lib/e2b/gate.ts:20-28), and the managed-compute switch, which is a kill switch that is on by default and turns off only when set to 0, false or off (apps/web/lib/managed-compute-gate.ts:55-58; pull-request/route.ts:22-33). The cloud status route has no such gate. The local route also needs the GitHub App configured (route.ts:21-27). |
| Model compatibility | none found in the code, except /recap which works with any model. |
| Provider restrictions | Pull requests are GitHub only (GitHub remote patterns in apps/web/app/api/code/sessions/handoff/route.ts:27-31 show the same assumption). |
| Local mode | Tests run fully on the device. The pull request lookup and opening still call our servers and GitHub, so they need the network and a signed-in account; this is not local-only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| GitHub not connected | compare link and connect text | LocalPullRequest.tsx:165-180 |
| Read failure | error text shown with role alert | LocalPullRequest.tsx:58-62,150-160 |
| Open failure with reconnect | Error plus reauthorize link | LocalPullRequest.tsx:87-93,208-212 |
| On the base branch | Open button disabled with a hint | LocalPullRequest.tsx:182-196 |
| Detached head (no branch) | 'Create branch and open pull request' | LocalPullRequest.tsx:130-160 |
| Checks pending | Re-read every 30 seconds | LocalPullRequest.tsx:17,105-118 |
| Tests not found | Status unavailable with 'testsNotFound' message | use-local-tests.ts:97-101 |
| Tests timeout | Message says it ran past its limit; outcome unknown not pass | use-local-tests.ts:44-52 |
| Remote SSH session | The icon-only Run tests / Stop tests header button is not rendered (shown only when !remoteSsh) | LocalSessionPanel.tsx:1129-1141 |
| Cloud checks unavailable | 'Check status is unavailable' | CodeChangesPanel.tsx:203; presentation.ts:330 |
| Offline | not handled in the code beyond generic error text. | LocalPullRequest.tsx:58-62 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalPullRequest.test.tsx`: Local pull request block (case list not read).
- `apps/web/lib/services/__tests__/cloud-code-local-pull-request.test.ts`: Server lookup and open.
- `apps/web/app/api/code/local-pull-requests/__tests__`: Route tests (folder exists; files not read).
- `apps/web/app/api/code/sessions/[sessionId]/pull-request/route.test.ts`: Cloud pull request open route.
- `apps/web/app/api/code/sessions/[sessionId]/pull-request/status/__tests__/route.test.ts`: Status route.
- `apps/web/lib/github-app.issues.test.ts`: Checks state from check runs (lines 147-199).
- `apps/web/features/code/hooks/use-local-tests.test.ts`: Test run hook.
- `apps/web/lib/services/__tests__/cloud-code-changes-and-pull-request.test.ts`: Cloud changes and pull request service.
- `apps/mobile/__tests__/CloudCodeSessionScreenChanges.test.tsx`: Mobile changes card and sheet.
- `apps/cli/src/claude_parity.rs`: In-file test shared_recap_command_returns_prompt (line 4059).

**Test scenarios**

- **Open a pull request**
  1. Connect GitHub.
  2. Finish work on a feature branch in a local session.
  3. Press 'Push and open a pull request'.
  - Expected: A chip 'Pull request #N · open' linking to GitHub.
- **Not connected**
  1. Use an account without GitHub connected.
  2. Open the pull request block.
  - Expected: Compare link and connect text; no error.
- **Checks settle**
  1. Open a pull request with running checks.
  2. Wait over 30 seconds.
  - Expected: Label changes from 'checks running' to passing or failing.
- **Failing tests**
  1. Break a test.
  2. Press 'Run tests'.
  - Expected: Alert with '<command> failed' and the output.
- **Recap**
  1. In the CLI after some work run /recap.
  - Expected: A summary answer covering the current objective, decisions made, files or commands touched, verification already run, open risks and next concrete actions.

**Where to look when it fails**

- Error name LocalPullRequestRequestError.
- Reason constant GITHUB_RECONNECT_REQUIRED_REASON.
- Audit event type 'tool_executed' with status pull_request_opened (route.ts:76-86).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- Mobile: [70-qa/test-plans/mobile/066-coding-workspace-frontend.md](../../70-qa/test-plans/mobile/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **Brief says CI status is missing in every app; code shows check status in three places.** Affects: Brief accuracy. Evidence: LocalPullRequest.tsx; CodeChangesPanel.tsx:142-210; CloudCodeChangesSheet.tsx:231-293. Work needed: Update the brief; live-verify.
- **Brief says mobile has test results and no pull request; the files cited are unrelated, and mobile cloud sessions do have pull request and checks while test results were not found.** Affects: surface:mobile. Evidence: CodeSessionView.tsx:272 holds unrelated code; useCloudCodeChanges.ts:128. Work needed: Correct the brief.
- **No structured test counts or failing test list.** Affects: web and desktop. Evidence: LocalSessionPanel.tsx:1700-1715. Work needed: Parse results into a panel.
- **CLI has no pull request or test panel; recap is not stored.** Affects: surface:cli. Evidence: claude_parity.rs:1946. Work needed: Decide whether to add.
- **Mobile companion sessions and VS Code have no pull request view.** Affects: surface:mobile, surface:vscode. Evidence: No code found. Work needed: VS Code is cut by decision for test and task panels; pull request view needs a decision.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-execution-boundaries
- mode:local
- mode:cloud
- api:GET /api/code/local-pull-requests
- api:POST /api/code/local-pull-requests

## Unknown

- Whether a cloud session's pull request body uses a model.
- Case list of LocalPullRequest.test.tsx and the local-pull-requests route tests.
- Whether recap output is saved anywhere.
- How the desktop app (Tauri build) handles pull requests; only the hosted web path was read.

## Second reader's check

A second reader checked 11 statements of this page against the code: 8 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "CLI /recap sends a summary prompt to the model; the 'goal, decisions, files, checks, next steps' brief is the prompt's wording (claude_parity.rs:1949-1955)" The code shows: Dispatch and prompt exist, but the prompt wording is 'current objective, decisions made, files or commands touched, verification already run, open risks, and the next concrete actions'. It adds open risks. It does not say 'goal' or 'checks'. (apps/cli/src/claude_parity.rs:300,1946-1955). **Corrected:** The brief's items are not the prompt's wording. The prompt asks for objective, decisions, files or commands touched, verification run, open risks and next actions.
- **Partly wrong (section 3):** "Cloud pull requests need the managed Code switch and compute gate: both checked in the route (pull-request/route.ts:22-33)" The code shows: The open (POST) route checks e2bProvisioningReady() (needs AGI_E2B_EXECUTION=1, a non-empty E2B_API_KEY and sandboxComputeIsPriceable) and isManagedComputePrivateBetaEnabled(). That second check is on unless the env var is 0, false or off, so it works as a kill switch. The status GET route has neither gate, only the chat-conversation rate limit. (apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:22-33; apps/web/lib/e2b/gate.ts:20-28; apps/web/lib/managed-compute-gate.ts:55-58; .../pull-request/status/route.ts:14-31). **Corrected:** Only creating a cloud pull request is gated. It needs the E2B cutover flag, the E2B key, a priceable compute rate and the managed-compute switch, which is on unless set to 0, false or off. Reading checks status is not gated. The page's 'AGI_E2B_EXECUTION and E2B_API_KEY' list omits the priceable-compute condition.
- **Partly wrong (section 2/8):** "Run tests control is a header button 'Run tests' / 'Stop tests' (LocalSessionPanel.tsx:1129-1141)" The code shows: The button renders only when !remoteSsh. A session over SSH has no Run tests button. The button is icon-only (ListChecks), and the label is its aria-label and title. (apps/web/features/code/components/LocalSessionPanel.tsx:1129-1141). **Corrected:** The icon-only Run tests / Stop tests header button is hidden in remote SSH sessions. The page's edge-case table omits this state.

**Facts the page missed**

- The managed-compute switch is a kill switch that is on by default. It turns off only when set to 0, false or off (apps/web/lib/managed-compute-gate.ts:55-58). The page calls it a 'private-beta switch' without saying that, and without saying that e2bProvisioningReady also needs sandboxComputeIsPriceable (apps/web/lib/e2b/gate.ts:20-28).
- The cloud pull-request status route (the one behind web and mobile checks) has no E2B or managed-compute gate. It is signed-in, per-user 'chat-conversation' rate limit only (apps/web/app/api/code/sessions/[sessionId]/pull-request/status/route.ts:14-31). Section 7 lumps it under the cloud gates.
- Opening a local pull request needs write access to the repository. repositoryAccess calls assertRepositoryIsWritable for 'open' and requests a token with contents:read and pull_requests:write, while lookup only asks for pull_requests:read (apps/web/lib/services/cloud-code-local-pull-request.ts:20-23,81-98). The page's Permissions row mentions only 'reconnect required'.
