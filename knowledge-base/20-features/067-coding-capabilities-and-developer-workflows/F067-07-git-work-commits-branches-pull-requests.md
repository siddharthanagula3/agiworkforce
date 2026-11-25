---
id: "F067-07"
type: "feature"
title: "Git work: commits, branches, pull requests"
aliases: ["Create commits (S67.29)", "Create branches (S67.30)", "Create pull requests (S67.31)", "Push and open a pull request", "Create branch and open pull request", "Commit and push", "Code: Create Pull Request", "git_commit / git_branch_create / git_push agent tools"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "missing", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.29", "S67.30", "S67.31"]
depends_on: ["surface:desktop", "surface:web", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "file:apps/cli/src/platform/runtime/git_tools.rs", "api:POST /api/code/local-pull-requests", "api:POST /api/code/sessions/{sessionId}/commit", "table:cloud_code_sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-07 Git work: commits, branches, pull requests

Lets the coding agent, or the person, commit a session's changes, create a branch and open a GitHub pull request. Four separate paths exist: the Desktop and local-folder panel, the Cloud sandbox panel on Web, the CLI agent's git tools and its app-server pull request call, and a VS Code command. Mobile has no control of its own.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.29](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6729), [S67.30](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6730), [S67.31](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6731).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns the edits an agent made into a commit, a branch and a GitHub pull request. The Desktop local panel pushes the checked-out branch from the person's own computer and then asks the AGI web service to open the pull request through the AGI GitHub App (apps/web/features/code/components/LocalPullRequest.tsx:70-87). The Web Cloud panel commits and pushes from the managed sandbox and opens the pull request (apps/web/lib/services/cloud-code-session-service.ts:2114, 2758). The CLI agent has typed git tools (apps/cli/src/platform/runtime/git_tools.rs:135-168) and an app-server pull request call that uses the gh program (apps/cli/src/app_server/pull_request.rs:188-290).

**Why it exists.** A coding task is not finished until the change is saved in git and offered for review. The brief says: 'The agent (or user from the coding surface) commits the session's changes with a message', 'The agent creates a git branch for its work', and 'The agent opens a pull request for its branch on the code host' (brief S67.29, S67.30, S67.31).

**Who uses it.** Developers using AGI Workforce Code on Desktop, Web (Cloud sessions), the CLI and the VS Code extension.

**Problems it solves**

- The person does not have to leave the app to commit and open a pull request.
- Risky git actions are gated: hooks always run for CLI commits, a push is always approved by a person, a submodule pointer cannot be staged (apps/cli/src/platform/runtime/git_tools.rs:439-450).
- Pull request state and check status are shown next to the changes (apps/web/features/code/components/LocalPullRequest.tsx:49-52, 98-107).

**Use cases**

- On Desktop, finish a session on a feature branch and press 'Push and open a pull request'.
- On Desktop, with no branch checked out, press 'Create branch and open pull request' to put the changes on a new branch.
- On Web, in a managed Cloud session, type a commit message, press 'Commit and push', then 'Create pull request'.
- In VS Code, run 'Code: Create Pull Request' and confirm the push.

## 2. User experience

**Where to find it**

- Desktop (Electron shell showing the hosted web app): the Changes panel of a local coding session shows the pull request block (apps/web/features/code/components/LocalChangesPanel.tsx:383). It only renders in a shell that has Local mode (apps/web/features/desktop-host/lib/host.ts:45-47).
- Web (Cloud sessions): the changes panel has a 'Commit message' field, a 'Commit and push' button and a 'Create pull request' button (apps/web/features/code/code-surface.ts:182-183, 416; apps/web/features/code/components/CodeChangesPanel.tsx:444-499).
- CLI: the agent calls git_stage, git_commit, git_branch_create and git_push as tools (apps/cli/src/platform/runtime/git_tools.rs:135, 157, 168, 325). Pull request creation is an app-server method (git/pullRequest), not a visible CLI command in the code read (apps/cli/src/app_server/developer_host.rs:5836-5842).
- VS Code: command palette entry 'Code: Create Pull Request' (apps/extension-vscode/package.json:262-264).
- Mobile: no commit, branch or pull request control found. The brief marks it done (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.29-S67.31) but the mobile code read only starts, steers and views a remote session (apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57-70).

**Before you start**

- Desktop: a folder approved for the app, a git repository with an origin remote that uses https or ssh, and a GitHub remote for the pull request (apps/desktop/electron/runtime/gitService.ts:780-790, 913-935; apps/web/lib/services/cloud-code-local-pull-request.ts:14).
- Desktop: the person is signed in to the web app and has connected the AGI GitHub App for the repository; otherwise the panel offers a GitHub compare page instead (apps/web/features/code/components/LocalPullRequest.tsx:152-165).
- Web Cloud: the deployment has Managed Code and managed compute switched on, and a plan that reaches managed compute (apps/web/app/api/code/sessions/[sessionId]/commit/route.ts:48-70).
- CLI and VS Code pull request: the gh program installed and signed in, else the call falls back to a GitHub compare link (apps/cli/src/app_server/pull_request.rs:261-318).

**Screens and controls**

- Desktop pull request block: button 'Push and open a pull request' (apps/web/features/code/local-code.ts:194), button 'Create branch and open pull request' when no branch is checked out (local-code.ts:227), a link chip 'Pull request #N, state, checks' (local-code.ts:398-410), link 'Open a pull request on GitHub' when the GitHub App is not installed (local-code.ts:223).
- Web Cloud panel: 'Commit message' field, 'Include in the commit:' file checkboxes, 'Commit and push', 'Create pull request' (code-surface.ts:182-189, 416).
- VS Code: an input box for the title, an input box for the base branch, a modal that lists up to 10 commits and asks to confirm the push (apps/extension-vscode/src/features/surfaces/pullRequest.ts:44-66).

**Journey**

1. Desktop: the agent changes files in the approved folder.
2. The person opens the Changes panel and reviews the files.
3. The person presses 'Push and open a pull request'. The desktop app asks for the git.write grant if not yet given (apps/desktop/electron/runtime/dispatcher.ts:922-925).
4. The desktop pushes the branch to origin and reports the default branch (apps/desktop/electron/runtime/gitService.ts:913-950).
5. The web app opens the pull request through the AGI GitHub App and shows a link chip (apps/web/features/code/components/LocalPullRequest.tsx:70-87).
6. The panel re-reads checks every 30 seconds while they are running (LocalPullRequest.tsx:15, 98-107).
7. VS Code: run the command, enter title and base, review the commit list, confirm, then choose 'View' on the result message (pullRequest.ts:68-100).

**What the person sees and gets**

- A pull request chip showing number, state (open, draft, merged, closed) and check state (apps/web/features/code/local-code.ts:385-410).
- Error text under the button with role=alert; when GitHub access is lost a reconnect action appears (LocalPullRequest.tsx:88-89, 189-198).
- Missing default branch shows 'The remote has no default branch to open a pull request against.' (local-code.ts:230).
- On a base branch the button is disabled and the hint 'Switch to a branch other than the default branch to open a pull request.' shows (local-code.ts:226; LocalPullRequest.tsx:175-186).
- VS Code shows a created message or a 'finish on GitHub' warning with a View button (pullRequest.ts:46-55).

**Settings**

- Desktop preference worktreeBranchPrefix is used as the prefix of a new branch (apps/desktop/electron/runtime/dispatcher.ts:3070-3076).
- Session agent mode (plan, ask, auto, bypass) decides what the agent asks before running git tools (apps/web/features/code/local-code.ts, LOCAL_AGENT_MODE_HINTS).
- Repository policy default branch is read by the CLI pull request call (apps/cli/src/app_server/pull_request.rs:62-65).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI agent git tools: git_stage, git_unstage, git_commit, git_branch_create, git_push and more, each with a permission class (apps/cli/src/platform/runtime/git_tools.rs:68-340).
- CLI git_commit commits only what is staged, runs hooks, and asks first when any hook would run (git_tools.rs:157-158).
- CLI git_stage refuses a submodule pointer (git_tools.rs:135-137, 439-450).
- CLI git_push is always asked for, whatever the approval mode (git_tools.rs:20-45, 325-327).
- CLI app-server pull request plan and create: validates title (256 chars) and body (65,536), checks the push plan, requires the reviewed branch to be unchanged, pushes with approval, runs gh pr create, falls back to a compare link (apps/cli/src/app_server/pull_request.rs:61-84, 188-318).
- VS Code command 'Code: Create Pull Request' calls that app-server method (apps/extension-vscode/src/features/surfaces/pullRequest.ts:68-100; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1731-1745).
- Desktop host push: refuses non-https/ssh remotes, multiple push addresses and local-path remotes, uses an empty hooks directory, and creates a slug-named branch when none is checked out (apps/desktop/electron/runtime/gitService.ts:743-760, 780-790, 913-950).
- Desktop and Local-mode web panel: opens the pull request through POST /api/code/local-pull-requests, with CSRF, rate limit and an audit event (apps/web/app/api/code/local-pull-requests/route.ts:59-92).
- Web Cloud: POST commit and pull-request session routes with CSRF and managed-compute gates (apps/web/app/api/code/sessions/[sessionId]/commit/route.ts:36-90; apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts).

**Incomplete**

- Web Cloud commit and pull request work only when AGI_E2B_EXECUTION=1, E2B_API_KEY and a priceable sandbox rate are set; the brief records that the live check is pending (doc: brief S67.29 'Unfinished'; apps/web/lib/e2b/gate.ts:19-30).
- Desktop: no person-facing 'commit' button was found; commits are made by the agent in the folder. The brief's 'user from the coding surface' commit is therefore unmet on Desktop [inferred from searching dispatcher.ts for commit commands, which found only staging at apps/desktop/electron/runtime/dispatcher.ts:795-798].
- The Cloud commit stages every change when no files are chosen (apps/web/lib/services/cloud-code-session-service.ts:2157-2162), so 'only what is staged' does not hold there.

**Present but disconnected or switched off**

- Cloud commit and pull request are off until the managed Code switches are on (apps/web/app/api/code/sessions/[sessionId]/commit/route.ts:48-55).
- The desktop pull request route returns 'capability unavailable' when the deployment has no GitHub App (apps/web/app/api/code/local-pull-requests/route.ts:21-27).

**Not available**

- Mobile: no commit, branch or pull request control in the code read (apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57-70).
- Chrome: not applicable (brief lists no status).
- Hosts other than GitHub: the desktop and CLI paths accept only GitHub remotes (apps/web/lib/services/cloud-code-local-pull-request.ts:14; apps/cli/src/app_server/pull_request.rs:155-168).

## 4. Required behaviour

**Established requirements**

- The agent or user commits the session's changes with a message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.29)
- The agent creates a git branch for its work. (source: brief S67.30)
- The agent opens a pull request for its branch on the code host. (source: brief S67.31)
- Commit takes only staged changes, never skips hooks, asks the user first when any hook would run, and does not run when nobody can be asked. (source: apps/cli/src/platform/runtime/git_tools.rs:158)
- A submodule pointer cannot be staged. (source: apps/cli/src/platform/runtime/git_tools.rs:136)
- A push needs a person's consent whatever the mode. (source: apps/cli/src/platform/runtime/git_tools.rs:20-45)
- Git is absent from Web and Mobile in the surface matrix; Web reads pull requests through the GitHub App. (source: (doc: docs/product/surface-feature-matrix.md Git section))
- Auto-created pull requests and 'Autofix pull request' are working notes, not source of truth. (source: (doc: docs/product/requirements.md list near line 1384))

**Acceptance criteria**

1. With one staged and one unstaged file, CLI git_commit records only the staged one.
2. In a repository with a pre-commit hook, git_commit asks before running, and with no one to ask it does not commit.
3. git_stage on a submodule path is refused.
4. On Desktop, pressing 'Push and open a pull request' on a feature branch with the GitHub App installed shows a pull request chip, and one audit event 'pull_request_opened' is recorded.
5. With no branch checked out, 'Create branch and open pull request' creates a branch named from the session title, pushes it and opens the pull request.
6. On the default branch the button is disabled and the hint is shown.
7. When the remote has no default branch, the message 'The remote has no default branch to open a pull request against.' shows and no pull request is opened.
8. In VS Code, declining the modal pushes nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The desktop open() pushes before it checks for a base branch (LocalPullRequest.tsx:76-77), so a push can succeed and the pull request still fail; the person should be told the branch was pushed.
- [inferred] Local-mode work should never push without an explicit approval; the desktop grant git.write is that approval (dispatcher.ts:922-925).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visible 'Commit' action to the Desktop Changes panel for the person, with staged-only semantics matching the CLI tool.
- [proposed] Show on Mobile the session's branch and pull request link, read only.
- [proposed] Make Cloud commit stage only chosen files by default, or say so in the button hint.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | git_tool_specs (git_stage, git_commit, git_branch_create, git_push) | `apps/cli/src/platform/runtime/git_tools.rs` | Defines the agent's git tools, their permission class and descriptions. |
| service | GitApi / GitOperation | `apps/cli/src/platform/runtime/git.rs` | Builds the argv and the hook list for each git operation and plans a push. |
| service | pull_request plan and create | `apps/cli/src/app_server/pull_request.rs` | CLI app-server pull request: plan, consent-bound push, gh pr create, compare-link fallback. |
| endpoint | git/pullRequest/plan and git/pullRequest | `crates/agiworkforce-protocol/src/developer_session.rs` | Protocol method names for the pull request calls. |
| command | agi-workforce.createPullRequest | `apps/extension-vscode/src/features/surfaces/pullRequest.ts` | VS Code command that asks title, base, confirms, calls the CLI. |
| service | pushLocalBranch, createBranchAtHead, listLocalBranches | `apps/desktop/electron/runtime/gitService.ts` | Desktop host git: push the branch and create a new one. |
| config | developer_branch_push capability (git.write) | `apps/desktop/electron/runtime/dispatcher.ts` | Desktop permission and reason text for the push; handler at line 3070. |
| component | LocalPullRequest | `apps/web/features/code/components/LocalPullRequest.tsx` | Desktop pull request block and its buttons. |
| service | local-pull-request-api | `apps/web/features/code/services/local-pull-request-api.ts` | Browser client for the local pull request endpoint. |
| endpoint | GET and POST /api/code/local-pull-requests | `apps/web/app/api/code/local-pull-requests/route.ts` | Reads and opens the pull request through the GitHub App; audits the open. |
| service | cloud-code-local-pull-request | `apps/web/lib/services/cloud-code-local-pull-request.ts` | GitHub work: find, create, status; write-access check. |
| component | CodeChangesPanel | `apps/web/features/code/components/CodeChangesPanel.tsx` | Web Cloud commit and pull request controls. |
| endpoint | POST /api/code/sessions/{sessionId}/commit | `apps/web/app/api/code/sessions/[sessionId]/commit/route.ts` | Cloud commit and push route with gates. |
| endpoint | POST /api/code/sessions/{sessionId}/pull-request | `apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts` | Cloud pull request route. |
| service | commitAndPushCloudCodeSession, openCloudCodeSessionPullRequest | `apps/web/lib/services/cloud-code-session-service.ts` | Stages, commits, pushes and opens the pull request in the managed sandbox. |
| config | e2bProvisioningReady / AGI_E2B_EXECUTION / E2B_API_KEY | `apps/web/lib/e2b/gate.ts` | Switch that turns Cloud code on. |
| table | cloud_code_sessions | `apps/web/lib/services/cloud-code-session-service.ts` | Holds session branch, pull request number and url. |
| table | security_audit_logs | `apps/web/lib/security-audit.ts` | Receives the pull_request_opened audit event. |
| hook | useLocalModeHost | `apps/web/features/desktop-host/lib/host.ts` | Keeps the Local panels to a shell that has Local mode. |
| test | gitService and push race tests | `apps/desktop/electron/__tests__/gitService.test.ts` | Tests desktop git helpers; also gitServicePushRace.test.ts. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Desktop: the person presses the button; the web app calls the desktop host to push the branch (new branch created first when none is checked out). | device | apps/web/features/code/components/LocalPullRequest.tsx:70-77; apps/desktop/electron/runtime/gitService.ts:913-950 |
| The desktop host runs git push to origin over https or ssh with local-path and helper transports refused. | outside service | apps/desktop/electron/runtime/gitService.ts:780-790, 936-944 (the remote is GitHub or another git host the person chose) |
| The web app sends remoteUrl, head, base and title to the AGI web service, which opens the pull request with the GitHub App installation token and writes an audit event. | our servers | apps/web/app/api/code/local-pull-requests/route.ts:59-92 |
| GitHub creates the pull request and reports check state. | outside service | apps/web/lib/services/cloud-code-local-pull-request.ts:1-12 |
| CLI: the agent calls git_commit; the CLI runs git on the device with hooks, after asking when any hook would run. | device | apps/cli/src/platform/runtime/git_tools.rs:157-158; apps/cli/src/platform/runtime/git.rs:733-745 |
| CLI or VS Code pull request: the CLI plans the push, a person confirms, the CLI pushes, then runs gh pr create, which talks to GitHub directly. | device | apps/cli/src/app_server/pull_request.rs:188-290; no AGI server call was read in this file |
| Web Cloud: the commit route claims the session, stages, commits and pushes inside the managed sandbox with a push credential, then the pull request route opens the pull request. | our servers | apps/web/lib/services/cloud-code-session-service.ts:2114-2180, 2758-2775 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Git commits and branches | The person's repository on the device (Desktop, CLI, VS Code) or the managed sandbox workspace (Web Cloud) | Pushed to the git remote only on an approved push | Kept by git; a closed Cloud session destroys the sandbox and uncommitted work (apps/web/features/code/code-surface.ts:180) |
| Pull request number and url for a Cloud session | table:cloud_code_sessions | Server only | Retention not established (unknown) |
| Audit event pull_request_opened (resource url, provider github) | table:security_audit_logs | Server only | Retention not established (unknown) |

**Models and providers.** Commit, branch and pull request steps do not call a model. The agent that decides when to commit uses whatever model the session uses (see SYS-chat-turn-pipeline). Only the commit message and pull request title may be written by the model. GitHub is the only code host.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop pull request needs a signed-in web session (user-scoped db and CSRF, apps/web/app/api/code/local-pull-requests/route.ts:57-61). CLI local git needs no account in the code read. Web Cloud needs a signed-in account. |
| Permissions | Desktop needs the git.write grant for the folder to push (apps/desktop/electron/runtime/dispatcher.ts:922-925). CLI uses permission classes Read, Mutating, Destructive, Push (git_tools.rs:20-45). Repository write access is checked for the pull request (apps/web/lib/services/cloud-code-local-pull-request.ts:11). |
| Subscription | Desktop local pull request: no plan check found in the route. Web Cloud commit and pull request: managed-compute access decision for surface 'code' (apps/web/app/api/code/sessions/[sessionId]/commit/route.ts:62-70). Which plans pass is decided by planIncludesAgiCode (packages/contracts/types/src/billing-catalog.ts:839-841): a plan needs sandboxes and a code harness ceiling above zero. |
| Limits and metering | Local pull request open uses rate-limit bucket 'chat-conversation' per user (route.ts:58-60). Cloud commit uses the same bucket. Sandbox compute is metered (doc: brief unfinished text citing compute-metering.ts:73). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY (apps/web/lib/e2b/gate.ts:10-30); managed compute private beta gate (apps/web/lib/managed-compute-gate.ts, on when unset per brief). |
| Model compatibility | No model dependency in git steps. none found in the code. |
| Provider restrictions | GitHub only for pull requests (apps/web/lib/services/cloud-code-local-pull-request.ts:14). Model providers: none found in the code. |
| Local mode | Local git work (CLI tools, desktop host git) runs on the device and needs no payment. Opening the pull request from Desktop still calls AGI web servers and needs sign-in and the GitHub App; that crosses out of Local on purpose and is visible as a GitHub action. Whether a Local-mode session is stopped from calling the pull request route was not established (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Button shows a spinner and 'Opening the pull request' while busy (LocalPullRequest.tsx:120-122, 180-182). | apps/web/features/code/components/LocalPullRequest.tsx:120-122 |
| Empty / no branch | Shows 'Create branch and open pull request' with the detached hint. | LocalPullRequest.tsx:112-132 |
| On the default branch | Button disabled with a hint. | LocalPullRequest.tsx:175-186 |
| GitHub App not installed | A link to the GitHub compare page and a not-connected note. | LocalPullRequest.tsx:152-165 |
| GitHub access lost | Error plus a reconnect link. | LocalPullRequest.tsx:88-89, 194-198 |
| Checks running | Re-read every 30 seconds; stops when finished or merged. | LocalPullRequest.tsx:15, 98-107 (test: LocalPullRequest.test.tsx 'reads the checks again while they are running') |
| Race of two loads | A load sequence counter drops the older result. | LocalPullRequest.tsx:38-61 |
| Remote refused | Local path, remote helper, file:// and several push addresses are refused with a message and nothing is pushed. | apps/desktop/electron/runtime/gitService.ts:880-910 |
| Branch changed after review (CLI) | Conflict: 'The branch changed after you reviewed it; review the push again'. | apps/cli/src/app_server/pull_request.rs:228-236 |
| gh missing or fails | Compare link returned with a note; created=false. | apps/cli/src/app_server/pull_request.rs:261-318 |
| Timeout | gh is stopped after 90 seconds. | apps/cli/src/app_server/pull_request.rs:18, 106-110 |
| No one to answer a hook prompt | The commit does not run. | apps/cli/src/platform/runtime/git_tools.rs:158 |
| Offline / reconnect | not handled in the code beyond the push and request errors shown as text. | searched apps/web/features/code/components/LocalPullRequest.tsx; no offline branch |
| Accessibility | Errors use role=alert; spinner marked aria-hidden; chip is a link. | LocalPullRequest.tsx:118-130, 190-193 |
| Mobile | not handled in the code: no commit or pull request control. | apps/mobile/src/features/companion/components/CodeSessionsCard.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalPullRequest.test.tsx`: Checks polling, no polling after merge, newer lookup wins, reconnect action shown or not.
- `apps/web/app/api/code/local-pull-requests/__tests__/route.test.ts`: 401 signed out, 503 without GitHub App, 400 validation, CSRF refusal, reconnect reason, opens and audits.
- `apps/web/lib/services/__tests__/cloud-code-local-pull-request.test.ts`: The GitHub service for local pull requests.
- `apps/web/app/api/code/sessions/[sessionId]/commit/route.test.ts`: Push result, validation proof, gates (switch, plan), CSRF, archived, closed, 404, no repository, bad body.
- `apps/web/app/api/code/sessions/[sessionId]/pull-request/route.test.ts`: Opens, repeat call, CSRF, archived, missing branch, managed Code off.
- `apps/desktop/electron/__tests__/gitService.test.ts`: Desktop git helpers; push race in gitServicePushRace.test.ts.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher command handling including developer commands.
- `apps/cli/src/platform/runtime/git_tools.rs`: In-file tests: every operation is a tool or named exception, class never milder than the operation, bypass hooks explicit, commit needs a message.
- `apps/cli/src/app_server/pull_request.rs`: In-file tests: consent covers only the reviewed push, compare page only for GitHub remotes, option-like base refused.

**Test scenarios**

- **CLI commit staged only**
  1. In a scratch repository stage file A, edit file B without staging.
  2. Ask the agent to commit with a message.
  3. Run git show --stat.
  - Expected: Only A is in the commit; B stays modified.
- **Hook prompt**
  1. Add a pre-commit hook.
  2. Run the agent in a mode with no way to answer (non-interactive).
  3. Ask for a commit.
  - Expected: The commit is not made and the reason names the hook.
- **Desktop pull request**
  1. Approve a folder whose origin is a test GitHub repository with the AGI GitHub App installed.
  2. Check out a feature branch with a commit.
  3. Press 'Push and open a pull request'.
  - Expected: Branch is pushed, a chip 'Pull request #N' appears, an audit event is written.
- **Detached head**
  1. Detach HEAD with changes committed.
  2. Press 'Create branch and open pull request'.
  - Expected: A new branch with the configured prefix is created and the pull request opens.
- **No GitHub App**
  1. Use a repository without the App.
  2. Open the Changes panel.
  - Expected: 'Open a pull request on GitHub' link and the not-connected note.
- **VS Code decline**
  1. Run 'Code: Create Pull Request'.
  2. Choose cancel on the modal.
  - Expected: No push, no pull request.

**Where to look when it fails**

- Web logs for the local pull request route and table:security_audit_logs rows with status pull_request_opened.
- Desktop console line '[git] git details for ... are unavailable' (apps/desktop/electron/runtime/gitService.ts:483-485).
- CLI errors: 'No pull request was opened:', 'The push was not approved and nothing left this machine'.
- Cloud: table:cloud_code_sessions pull request columns; error 'Managed Code is not enabled for this deployment'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **No person-facing Commit action on Desktop** Affects: Desktop users who want to commit themselves. Evidence: Only the agent commits; no commit command found in apps/desktop/electron/runtime/dispatcher.ts. Work needed: Add a Commit control and a dispatcher command with the shell or git.write grant.
- **Mobile has no commit, branch or pull request control although the brief marks it done** Affects: Mobile. Evidence: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57-70; brief S67.29-31. Work needed: Either show status read-only or correct the brief.
- **Cloud commit stages everything unless files are chosen** Affects: Web Cloud. Evidence: apps/web/lib/services/cloud-code-session-service.ts:2157-2162. Work needed: Document or change the default.
- **Cloud path is switched off until E2B settings are set and live-checked** Affects: Web. Evidence: apps/web/lib/e2b/gate.ts:19-30; brief S67.29 Unfinished. Work needed: Set switches and run a live check.
- **Audit event for the Cloud and CLI pull request paths not found** Affects: Web Cloud, CLI, VS Code. Evidence: Audit call found only in apps/web/app/api/code/local-pull-requests/route.ts:80. Work needed: Confirm or add audit parity.
- **Desktop push happens before the base-branch check** Affects: Desktop. Evidence: LocalPullRequest.tsx:76-77. Work needed: Check base first or tell the person the branch was pushed.
- **The brief's code references are wrong for commit and branch** Affects: Documentation. Evidence: git_stage is at git_tools.rs:135, git_commit at 157, git_branch_create at 168; gitService.ts:241 is inside hostGitInvocation, not a pull request function. Work needed: Correct the brief.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- surface:web
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- file:apps/cli/src/platform/runtime/git_tools.rs
- api:POST /api/code/local-pull-requests
- api:POST /api/code/sessions/{sessionId}/commit
- table:cloud_code_sessions

## Unknown

- Whether Mobile shows any commit, branch or pull request information (only session start and steer were read).
- Retention period of audit rows and Cloud session rows.
- Whether a Local-mode session is blocked from calling the AGI pull request route.
- Whether the CLI standalone terminal exposes pull request creation outside the app server (only the app-server method was found).
- Which plans satisfy planIncludesAgiCode (not computed here).
- Where the commit message is written (the model or the person) in the Desktop path.
