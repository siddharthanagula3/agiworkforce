---
id: "F009-04"
type: "feature"
title: "Repository and branch pickers (Code)"
aliases: ["Repository picker", "Branch picker", "Select repository", "Change the branch", "Project or folder (Code)", "Local folder chip", "S9.07", "S9.08"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S9.07", "S9.08"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "api:GET /api/github/repositories", "api:GET /api/code/repositories/branches"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-04 Repository and branch pickers (Code)

Chooses the repository and branch a coding session works on. On Web Code it is a searchable list of reachable GitHub repositories or a public URL plus branch; on Desktop it is a local folder with a branch list from git; Mobile new-session sheet has both too; CLI uses the current folder or -C; VS Code uses the open folder.

Area: [9. Compound interface components](README.md). Requirement items: [S9.07](../../10-requirements/capabilities/009-compound-interface-components.md#s907), [S9.08](../../10-requirements/capabilities/009-compound-interface-components.md#s908).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Web Code: a 'Select repository' chip opens a search list, a first-run panel when no source-control app is installed, or URL and branch fields; a branch chip lists the repository's branches or accepts a typed name. Desktop: a folder chip and a branch chip that lists and switches local git branches.

**Why it exists.** A coding session must know which code it may read and change, and from which branch (brief S9.07, S9.08).

**Who uses it.** Developers using Code on Web, Desktop, Mobile, CLI and VS Code.

**Problems it solves**

- Starting a cloud sandbox in the wrong repository.
- Typing branch names by hand.
- Not knowing why no repositories are listed.

**Use cases**

- Web: click 'Select repository', search, pick a repository; its default branch fills in.
- Web: choose 'Use a repository URL instead' and enter a public GitHub URL and a branch.
- Desktop: use the branch chip to switch the open folder to another branch.
- CLI: run agi -C ~/work/app to run in that repository.

## 2. User experience

**Where to find it**

- Web Code composer chip row: chip with the repository name and a button 'Change the repository' (apps/web/features/code/components/CodeComposer.tsx:1340-1362; copy in apps/web/features/code/code-surface.ts:143).
- Desktop (shown through the web Code page when environment is local): folder chip and branch chip 'Change the branch' (CodeComposer.tsx:2073-2090, :1182-1260).
- Mobile: 'New session' sheet with repository search, 'Use a public repository URL', and a 'Branch' section (apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:53-66, :692).
- CLI: global option -C or --repo (apps/cli/src/lib.rs:421).
- VS Code: a quick pick 'Select a workspace folder for this operation' when several folders are open (apps/extension-vscode/src/platform/workspaceFolders.ts:15-21).

**Before you start**

- Web cloud environment: server switch on, see current implementation (apps/web/lib/e2b/gate.ts:16-30).
- Repository list: a GitHub app installation reachable by the account.
- Desktop branch list: the folder is a git repository (apps/desktop/electron/runtime/gitService.ts:681-684).

**Screens and controls**

- Repository popover: 'Search repositories' field, rows with a 'Private' mark, 'Loading repositories', link to manage access on GitHub, 'Use a repository URL instead' toggle, URL field with placeholder 'https://github.com/owner/repository', branch field, Apply and Clear buttons (code-surface.ts:280-293; CodeComposer.tsx:802-1000).
- Branch popover: search field, 'Protected' lock on protected branches, a row to use the typed name, 'Try again' on error (CodeComposer.tsx:1004-1140).
- Desktop branch popover lists up to 500 local branches, newest first (gitService.ts:28, :681-697).

**Journey**

1. Web: open the repository chip; the list loads and filters 250 ms after typing; click a repository; the draft stores the installation and full name and sets the default branch; the popover closes.
2. Web: or enter a URL and branch and Apply; a bad URL or branch shows an error and nothing is saved.
3. Web: open the branch chip, pick or type a branch.
4. Desktop: open the branch chip, pick a branch; the app runs git switch and reports success or an error.
5. Start the session; the sandbox only starts when the server switch is on.

**What the person sees and gets**

- 'Two steps to work in your repository' first-run checklist when there is no installation (code-surface.ts:313; CodeComposer.tsx:643-668).
- 'No repositories match that search.' or 'The installed app can reach no repositories yet. Give it access to one on GitHub.' (code-surface.ts:282-284).
- 'More repositories exist. Search to narrow the list.' and 'These installations could not be read: <names>' (code-surface.ts:286-287; CodeComposer.tsx:733-740).
- 'Only public HTTPS GitHub repository URLs in owner/repository form are supported.' and 'Branch must be a plain git ref ...' (code-surface.ts:289-292).
- 'Some branches are not listed. Type the full name to use one.' (code-surface.ts:274).

**Settings**

- Network access level can be raised automatically when a repository is chosen (CodeComposer.tsx:841-843 area, promote).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web repository popover with search, installation states, URL mode and validation (apps/web/features/code/components/CodeComposer.tsx:802-1000; apps/web/features/code/hooks/use-code-repositories.ts:12-93).
- Web branch chip with search, protected marks, typed name and truncation notice (CodeComposer.tsx:1004-1140).
- Desktop local branch list and switch through git service (apps/desktop/electron/runtime/gitService.ts:681-730; dispatcher entries developer_branches_list and developer_branch_switch, apps/desktop/electron/runtime/dispatcher.ts:914-921).
- Mobile repository and branch pickers in the new-session sheet (NewCloudCodeSessionSheet.tsx:254-300, :692-720), although the brief lists them as missing.
- CLI -C resolves and enters the repository directory before config and trust load (apps/cli/src/lib.rs:5872-5898).
- VS Code folder quick pick (workspaceFolders.ts:5-22).

**Incomplete**

- CLI has a --worktree option that creates its own branch but no branch picker (apps/cli/src/lib.rs:412-415).

**Present but disconnected or switched off**

- Web cloud sandbox is off until AGI_E2B_EXECUTION=1 and E2B_API_KEY are set and the compute is priceable; opening a session otherwise raises 'Managed Code is not enabled for this deployment. Use the desktop app for local code.' (apps/web/lib/e2b/gate.ts:16-30; apps/web/lib/services/cloud-code-session-open.ts:44-48).

**Not available**

- Branch picker on CLI (brief S9.08).
- Branch picker for VS Code and Chrome (brief gives none; Chrome is n/a).
- Local repository picker on Web: the 'Choose a different folder' control is hidden on web and meant for desktop (ChatComposerNew.tsx:7200-7203).

## 4. Required behaviour

**Established requirements**

- The user can choose which code repository a coding session works in, from a list or by URL/path. (source: brief S9.07)
- The user can pick the branch a coding session starts from or works on from a list of the repository's branches. (source: brief S9.08)
- Web repository and branch pickers are partial because the switch is off: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in production and redeploy, then live-check /code; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset and must not be set to 0. (source: brief S9.07, S9.08 (Unfinished); audit/partial/009-compound-interface-components.md)
- A bad URL or branch shows an error and is not saved (first-draft requirement, confirmed). (source: apps/web/features/code/components/CodeComposer.tsx:844-856)

**Acceptance criteria**

1. With no GitHub installation the first-run panel with two steps is shown.
2. Search narrows the repository list after about 250 ms and an unfinished earlier request is cancelled.
3. When more exist, the truncation text shows; when an installation cannot be read its name is listed.
4. A URL that is not a public https GitHub owner/repository shows the error and keeps the old selection.
5. A branch name with illegal characters shows the branch error.
6. Picking a repository fills its default branch.
7. On Desktop, picking another branch switches the folder to it, or shows 'branch is not in this repository'.
8. With the server switch off, starting a Web session shows a capability-unavailable message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Web chip list should say why repository choices are unavailable when the switch is off, instead of failing at session start [inferred from cloud-code-session-open.ts:44].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a branch picker to the CLI for the current repository.
- [proposed] Correct the brief: Mobile has repository and branch pickers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RepositoryPicker | `apps/web/features/code/components/CodeComposer.tsx` | Repository popover with list, URL fields and validation. |
| component | BranchChip | `apps/web/features/code/components/CodeComposer.tsx` | Cloud branch list and typed branch. |
| component | LocalBranchChip | `apps/web/features/code/components/CodeComposer.tsx` | Desktop branch list and switch. |
| component | RepositoryFirstRun | `apps/web/features/code/components/CodeComposer.tsx` | First-run checklist when no installation exists. |
| hook | useCodeRepositories | `apps/web/features/code/hooks/use-code-repositories.ts` | Debounced search, aborting fetch, connection states. |
| config | CODE_COPY / CODE_TIMING | `apps/web/features/code/code-surface.ts` | All visible repository and branch copy and the 250 ms debounce. |
| service | cloud-code-api | `apps/web/features/code/services/cloud-code-api.ts` | listRepositories and listBranches client. |
| endpoint | GET /api/github/repositories | `packages/contracts/cloud-contracts/src/cloud-code-sessions.ts` | Repository list path constant. |
| endpoint | GET /api/code/repositories/branches | `packages/contracts/cloud-contracts/src/cloud-code-sessions.ts` | Branch list path constant. |
| config | e2bProvisioningReady | `apps/web/lib/e2b/gate.ts` | Gate: AGI_E2B_EXECUTION, E2B_API_KEY and priceable compute. |
| service | openCloudCodeSession | `apps/web/lib/services/cloud-code-session-open.ts` | Refuses a session when the gate or managed compute beta is off. |
| service | listLocalBranches / switchLocalBranch | `apps/desktop/electron/runtime/gitService.ts` | Local git branch list (500 max) and switch. |
| service | dispatcher branch operations | `apps/desktop/electron/runtime/dispatcher.ts` | developer_branches_list, developer_branch_switch with permission reasons. |
| service | desktop-host runtime client | `apps/web/features/desktop-host/lib/runtime-client.ts` | Web page side bridge to the desktop runtime. |
| component | NewCloudCodeSessionSheet | `apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx` | Mobile repository search, URL mode and branch section. |
| command | --repo / -C | `apps/cli/src/lib.rs` | Moves the CLI into a chosen repository directory. |
| service | getActiveWorkspaceFolder | `apps/extension-vscode/src/platform/workspaceFolders.ts` | Chooses the open folder; asks when several. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Opening the repository popover requests the repository list for the search text, 250 ms after typing, cancelling the previous call. | our servers | apps/web/features/code/hooks/use-code-repositories.ts:51-93; code-surface.ts:89 |
| The server reads the repositories reachable through the person's GitHub installations; unreachable installations are reported. | outside service | CodeComposer.tsx:733-740 shows the unreachable list; the server route was not opened. |
| Choosing a repository writes installationId, fullName and default branch into the draft. | device | CodeComposer.tsx:872-883 |
| Starting the session opens a managed sandbox if the gate allows. | our servers | apps/web/lib/services/cloud-code-session-open.ts:44-60 |
| Desktop branch list and switch run git on the person's machine through the runtime. | device | apps/desktop/electron/runtime/gitService.ts:681-730 |
| CLI changes directory before reading config and trust. | device | apps/cli/src/lib.rs:5872-5898 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Repository, URL and branch draft | Code composer draft in the browser (CodeDraft) and the last typed entry | Sent with the new session | Cleared with Clear (CodeComposer.tsx:886-893) |
| Local branch | The person's git repository on disk | no | Kept by git |
| Cloud code session and sandbox | Server database and managed sandbox (tables not opened) | Yes | unknown |

**Models and providers.** No model is picked here. Repository access uses the source-control provider's app installation. Sandbox compute is a managed compute provider selected by the E2B settings (apps/web/lib/e2b/gate.ts). Which model runs inside the session is chosen by the Code session options, not by this picker.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Mobile repository lists need a signed-in account and a GitHub installation. Desktop and CLI local branches need no account. |
| Permissions | Local branch operations ask the desktop runtime for git.read and git.write capability (apps/desktop/electron/runtime/dispatcher.ts:914-921). Public URL mode accepts only public GitHub repositories. |
| Subscription | Web cloud code uses managed compute that is metered; the sandbox rate card is priceable (brief S9.07 Unfinished). Plan gating of managed Code was not traced. |
| Limits and metering | Branch list up to 500 on Desktop (gitService.ts:28). Repository list is truncated with a notice. Managed compute usage is metered in compute-metering (brief). |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY (configuration names only) decide whether the sandbox can start; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset (apps/web/lib/e2b/gate.ts:8-30; brief S9.07). |
| Model compatibility | not applicable. |
| Provider restrictions | Repository list and URL mode are GitHub only (code-surface.ts:289). |
| Local mode | Desktop local environment does not need the server switch: it lists local folders and branches on the device. Web without the switch tells the person to use the desktop app for local code (cloud-code-session-open.ts:46-47). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading repositories' and 'Loading branches'. | CodeComposer.tsx:690, :1068 |
| Empty | No match text versus none reachable text. | CodeComposer.tsx:700-715; code-surface.ts:282-284 |
| Error | 'Repositories could not be loaded.' with 'Try again'; URL fields shown as the fallback. | CodeComposer.tsx:906-914; code-surface.ts:285 |
| Unconfigured | State 'GitHub is not configured' with URL fields only. | code-surface.ts:294; CodeComposer.tsx:827-830 |
| Reauthorization or pending | Connection states authorization-pending and reauthorization-required are modelled. | use-code-repositories.ts:35-36 |
| Truncated list | Notice shown for repositories and branches. | CodeComposer.tsx:733-735, :1121-1123 |
| Local branch switch failure | Error text 'branchSwitchFailed' copy stays in the popover. | CodeComposer.tsx:1223-1231 |
| Cancel | Effect cleanup aborts the request. | use-code-repositories.ts:91 |
| Offline | not handled in the code beyond the generic error. | not handled in the code |
| Accessibility | Lists labelled, search inputs labelled, protected and private marks have aria-labels. | CodeComposer.tsx:687, :726, :751, :1101 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/CloudCodePage.test.tsx`: Cloud code page including the composer (cases not itemised).
- `apps/desktop/electron/__tests__/gitService.test.ts`: Local git service (branch list and switch are among its subjects; cases not itemised).
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Desktop runtime dispatcher (not itemised).
- `apps/extension-vscode/src/__tests__/workspaceFolders.test.ts`: VS Code workspace folder choice.
- `apps/mobile/__tests__/NewCloudCodeSession.test.tsx`: Mobile new cloud code session sheet (not itemised).
- `apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.test.ts`: Mocks the sandbox gate (e2bProvisioningReady) when testing a sandbox route; no test of cloud-code-session-open itself was found.

**Test scenarios**

- **First run**
  1. Use an account with no GitHub app installed.
  2. Open the repository chip on Web.
  - Expected: Two-step first-run panel with an install button.
- **Search and pick**
  1. Type part of a repository name.
  2. Click a result.
  - Expected: Chip shows the name; branch chip shows the default branch.
- **Bad URL**
  1. Choose 'Use a repository URL instead'.
  2. Enter a non-GitHub URL and Apply.
  - Expected: URL error shown and nothing saved.
- **Switch off**
  1. With the server switch off, start a Web cloud session.
  - Expected: Message 'Managed Code is not enabled for this deployment.'
- **Desktop branch switch**
  1. Open a local folder on Desktop.
  2. Pick another branch.
  - Expected: Folder is on the new branch; unknown names are refused.
- **CLI repo flag**
  1. Run agi -C <path> with a valid and an invalid path.
  - Expected: Valid path enters it; invalid prints '--repo <path>: ...'.

**Where to look when it fails**

- Network: /api/github/repositories and /api/code/repositories/branches responses.
- Server error 'capability unavailable' text from openCloudCodeSession.
- CLI error prefix '--repo'.
- Desktop runtime errors from git switch ('is not a branch in this repository').

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Web cloud repository and branch features are switched off in production until the sandbox keys and flag are set.** Affects: Web users of Code. Evidence: brief S9.07 and S9.08 Unfinished; apps/web/lib/e2b/gate.ts:16-30. Work needed: Owner sets the switch in production, redeploys, then a live check in /code (not done by this page).
- **Mobile pickers exist but the brief says missing.** Affects: Documentation and audit accuracy. Evidence: apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:254, :291. Work needed: Update the audit ledger after verification.
- **CLI has no branch picker.** Affects: CLI users. Evidence: brief S9.08. Work needed: Decide: add a picker or rely on git.
- **Brief code references for CLI (lib.rs:416, :2965) and Desktop dispatcher (:704) no longer point at the repository code.** Affects: Engineers following the brief. Evidence: apps/cli/src/lib.rs:421; apps/desktop/electron/runtime/dispatcher.ts:914. Work needed: Refresh the brief references.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- api:GET /api/github/repositories
- api:GET /api/code/repositories/branches

## Unknown

- The server code behind /api/github/repositories and /api/code/repositories/branches (not opened).
- Whether the Web repository picker is hidden or shown in the production deployment today.
- Which plan gates managed Code.
- What each test file listed covers beyond the grep match.
- Whether the CLI TUI has any repository or branch chooser besides -C and --worktree.
