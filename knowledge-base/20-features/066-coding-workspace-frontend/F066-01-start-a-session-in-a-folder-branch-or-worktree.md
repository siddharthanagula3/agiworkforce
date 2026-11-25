---
id: "F066-01"
type: "feature"
title: "Start a session in a folder, branch or worktree"
aliases: ["Repository picker", "Branch picker", "Worktree picker", "Local/cloud execution selector", "Environment chip", "Run the session in", "New session in a worktree", "Where it runs", "--worktree", "S66.01", "S66.02", "S66.03", "S66.04"]
area: "66 Coding-workspace frontend"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S66.01", "S66.02", "S66.03", "S66.04"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "mode:local", "mode:cloud", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "file:apps/web/features/code/components/CodeComposer.tsx", "file:apps/web/lib/e2b/gate.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F066-01 Start a session in a folder, branch or worktree

Before a coding session starts, the person chooses where it runs: a local folder on the computer, a git worktree (a separate checkout so parallel sessions never touch the same files), or a managed cloud sandbox with a GitHub repository and branch. Each app offers a different part of this choice.

Area: [66. Coding-workspace frontend](README.md). Requirement items: [S66.01](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6601), [S66.02](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6602), [S66.03](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6603), [S66.04](../../10-requirements/capabilities/066-coding-workspace-frontend.md#s6604).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person pick the folder or GitHub repository, the branch, the isolation (this folder or a new worktree) and the place (local or cloud) for a coding session before it starts.

**Why it exists.** An agent edits real files. The person must see which files it will touch, and parallel sessions must not overwrite each other. The brief states this as S66.01 to S66.04 (doc: knowledge-base/data/area-briefs/066-coding-workspace-frontend.md). The product contract lists workspace, repository and worktree selection as a developer-screen duty (doc: docs/product/experience-contract.md:262-266).

**Who uses it.** Developers using the Desktop app, web /code, the CLI, VS Code, and (behind a switched-off flag) the phone.

**Problems it solves**

- Agent edits land in the wrong folder or branch.
- Two sessions edit the same working copy.
- A person cannot tell whether work runs on their machine or on our servers.

**Use cases**

- On Desktop, choose a repo folder and start a session in 'New worktree' so the working copy stays untouched.
- On web /code, pick a GitHub repository and branch and run the task in a cloud sandbox.
- In a terminal, run 'agi -w feature-x' to work on a separate branch checkout.
- In VS Code, with several folders open, answer the quick-pick to say which folder the operation uses.

## 2. User experience

**Where to find it**

- Web /code and Desktop (the Desktop window shows the hosted web app, AGENTS.md section 5): composer footer chips. 'Local' or 'Cloud' environment chip (EnvironmentChip, apps/web/features/code/components/CodeComposer.tsx:510-619), folder chip with aria-label 'Change the folder' (CodeComposer.tsx:473-508, code-surface.ts:262), branch chip 'Change the branch' (CodeComposer.tsx:1182-1303), 'Select repository' chip for cloud (CodeComposer.tsx:1329-1333, code-surface.ts:143).
- Web/Desktop worktree choice: 'Run the session in' radio group with 'This folder', 'New worktree', 'New worktree with my changes' (local-code.ts:1493-1511), shown only when the host reports worktrees (CodeComposer.tsx:555-580).
- CLI: flags --worktree/-w [NAME] and --repo/-C PATH (apps/cli/src/lib.rs:413-424); slash command /worktree list|create|remove (apps/cli/src/repl/registry.rs:1859-1904).
- VS Code: command palette 'Code: New Session in a Worktree' and 'Code: Session Worktrees' (apps/extension-vscode/package.json commands); folder quick-pick 'Select a workspace folder for this operation' (src/platform/workspaceFolders.ts:4-24).
- Mobile: 'New session on this computer' folder list (apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:19-100) and the 'Where it runs' choice 'New cloud session' sheet (apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx:34,520-540). Both sit behind FEATURES.companion = false for the computer path (apps/mobile/lib/v1FeatureFlags.ts:16).

**Before you start**

- Web cloud path: signed in, the deployment has the sandbox switched on (AGI_E2B_EXECUTION=1, E2B_API_KEY set, sandbox rate card priceable) (apps/web/lib/e2b/gate.ts:20-30), and a plan that includes managed Code (apps/web/app/api/code/sessions/route.ts:55-65).
- Cloud repository list needs the GitHub app connected; otherwise the chip shows 'Connect GitHub' steps (code-surface.ts:313-320).
- Desktop local path: the window must be the Electron shell (CloudCodePage.tsx:1949), and the CLI must have answered its handshake, because no coding capability is offered before that (apps/desktop/electron/runtime/developerSessionService.ts:482-526).
- The folder must be approved and have command access ('Allow running commands') (local-code.ts:70-72).

**Screens and controls**

- Environment chip menu: Local folders (radio), 'Add a folder', 'Make primary', placement radios, Cloud network-access radios, 'Edit environment' dialog (CodeComposer.tsx:544-619).
- Cloud repository popover: search box, repository rows with 'Private' mark, 'Use a repository URL instead', URL field, branch field, 'Use this repository', 'Clear repository' (CodeComposer.tsx:802-1000).
- Branch popover: search or type a branch name, 'Use branch', 'Protected' mark (CodeComposer.tsx:1004-1180). Local branch popover: lists local branches and checks one out (CodeComposer.tsx:1200-1233).
- CLI: plain flags. VS Code: quick-picks and modal confirmation when removing a worktree (sessionWorktrees.ts:25-45).

**Journey**

1. 1. Open web /code or the Desktop Code screen.
2. 2. Choose Local or Cloud in the environment chip.
3. 3. Local: pick a folder (or 'Add a folder' to open the OS folder picker), then pick the placement radio.
4. 4. Cloud: pick a repository from GitHub or paste a public HTTPS GitHub URL, then pick or type a branch.
5. 5. Type the task and send.
6. 6. The app starts the session and opens it; a failure shows an inline message under the composer.

**What the person sees and gets**

- Chip text shows the chosen folder, branch or repository.
- Unusable folders show the secondary line 'Cannot run here' (code-surface.ts:261).
- Start failures: 'That session could not be started.' or the command-access refusal text (local-code.ts:107-109,use-local-sessions.ts:398-405).
- Cloud: 'Managed environments are not enabled' style notices when the deployment or plan lacks the feature (CloudCodePage.tsx:2068-2074).
- CLI prints 'Working in the new worktree <path>' and, at exit, either removes an untouched generated worktree or says how to return (lib.rs:5994-6035).

**Settings**

- Worktree branch prefix and location preferences (LocalWorktreePreferences.tsx, dispatcher getPreferences().worktreeBranchPrefix at dispatcher.ts:3071-3075).
- Cloud network access and runtime image in 'Edit environment' (CodeComposer.tsx:231-414).
- AGI_E2B_EXECUTION, E2B_API_KEY and AGI_MANAGED_COMPUTE_PRIVATE_BETA deployment settings (gate.ts:6-30; doc: brief S66.01 unfinished).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop (Electron shell showing the web app): folder chip, add folder, make primary, placement radio, local branch switch, session start in a folder or a worktree (CodeComposer.tsx:416-619,1182-1303; use-local-sessions.ts:369-409; dispatcher.ts:2726-2750). The brief marks Desktop worktree picker 'missing'; the code has it, so the brief is stale.
- Desktop host commands: pick folder (dispatcher.ts:2312), list branches and switch branch (dispatcher.ts:3066-3069), start session with environment 'local' or 'worktree' and worktreeStart 'head' or 'working_tree' (dispatcher.ts:2726-2750).
- CLI: --worktree creates .agiworkforce/worktrees/NAME on branch worktree-NAME (lib.rs:413-417; apps/cli/src/platform/runtime/worktree.rs:209-235); /worktree create <branch> [base-ref] (registry.rs:1880-1899); --repo selects the repository (lib.rs:419-424).
- VS Code: active-editor folder, single-folder shortcut and quick-pick (workspaceFolders.ts:4-24); 'New Session in a Worktree' opens the worktree in a new window (sessionWorktrees.ts:15-23). The brief marks VS Code worktree 'missing'; the code has it.
- Web cloud: repository search list, URL mode, branch list and quota check exist in code (CodeComposer.tsx:672-1180; apps/web/lib/services/cloud-code-session-service.ts:1243-1256).

**Incomplete**

- Cloud start on web works only when the deployment flag, key and priceable rate card are all set; a live check in /code is listed as undone by the brief (brief S66.01 'Unfinished').
- CLI has no branch picker: a branch is only named through /worktree create (registry.rs:1880-1899) (brief S66.02 'cli missing', matches).
- VS Code has no branch picker; the conversation tree only shows a session's branch in a tooltip (apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:26-31).
- Mobile has no local branch or worktree choice.

**Present but disconnected or switched off**

- Mobile 'New session on this computer' and the whole remote code view are disabled: FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:16; apps/mobile/app/(app)/companion/code/[threadId].tsx:81 returns FeatureUnavailable; useComputerCodeSessions.ts:27 needs FEATURES.companion).
- Cloud environment options on web are refused server-side unless e2bProvisioningReady() is true (apps/web/app/api/code/repositories/branches/route.ts:55-59; app/api/code/sessions/[sessionId]/commands/route.ts:45-50).
- The worktree radio is hidden when the CLI does not report 'worktrees' (use-local-sessions.ts:125; CodeComposer.tsx:555).

**Not available**

- Chrome extension: not applicable.
- Web in a plain browser tab: no local folders, because useLocalSessions is supported only with a desktop host bridge (use-local-sessions.ts:121; host.ts:30-36).
- Mobile: no repository-folder picker for local sessions outside the disabled companion path.
- VS Code and CLI: no local/cloud selector; VS Code has 'Continue in the Cloud' as a separate command (package.json) (not read).

## 4. Required behaviour

**Established requirements**

- The user chooses which repository or folder a coding session works on before it starts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S66.01)
- The user chooses the git branch a session starts from or works on. (source: S66.02 (same brief))
- The user picks or creates a worktree so parallel work stays isolated. (source: S66.03 (same brief))
- Before starting, the user chooses whether the session runs locally or in a cloud sandbox. (source: S66.04 (same brief))
- Workspace, repository and worktree selection is a required developer-screen function. (source: doc: docs/product/experience-contract.md:262-266)
- A worktree flag in the app-server stays false until the Rust owner implements and verifies it; the host now reports checkpoints and worktrees true. (source: doc: docs/product/definition.md:487-491; code apps/cli/src/app_server/developer_host.rs:1058,1065)
- Managed Code sessions are capped by the plan's maximum active sandboxes and need a plan that includes AGI Code. (source: apps/web/lib/services/cloud-code-session-service.ts:1243-1256; packages/contracts/types/src/billing-catalog.ts:839-841)

**Acceptance criteria**

1. On Desktop with a folder approved, the composer shows the folder name and branch, and the 'Run the session in' radio lists exactly 'This folder', 'New worktree', 'New worktree with my changes' when the CLI reports worktrees.
2. Starting a session with 'New worktree' leaves the original folder's files unchanged while the agent edits the worktree.
3. In a browser tab (no desktop host) no Local folders appear and the Cloud choice shows a not-enabled or plan notice when the deployment or plan does not allow it.
4. A cloud start over the plan's active-session limit is refused with a message that names the limit.
5. 'agi -w' without a name creates a worktree with a made-up name and, if nothing changed, removes it at exit.
6. In VS Code with two folders open and no active editor, the quick-pick appears; with one folder it does not.
7. If a start fails, the composer shows a message and the folder's session list gains no new row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A failed start leaves no half-started session in the UI, because startSession returns null and only refreshes the list on success (use-local-sessions.ts:395-415); whether the CLI removes a half-made worktree is unknown (a cleanupFailures list exists, use-local-sessions.ts:396-399).
- [inferred] The 'Local' mode on Desktop is independent of payment: a folder session can run on a local model, while account models need the developer-surfaces plan capability (local-code.ts:700-760).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a branch picker and a worktree picker to the CLI and VS Code that mirror the Desktop radio and local branch popover.
- [proposed] Show on mobile a read-only note that starting a local session needs the Desktop, instead of a hidden screen.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeComposer (EnvironmentChip, LocalFolderItems, RepositoryPicker, BranchChip, LocalBranchChip) | `apps/web/features/code/components/CodeComposer.tsx` | Composer footer with environment, folder, repository, branch and placement controls. |
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Holds draft state, startLocalSession, composerLocal wiring and the Electron-only gating (lines 1231-1307,1949,2045-2074). |
| hook | useLocalSessions | `apps/web/features/code/hooks/use-local-sessions.ts` | Reads folders and sessions from the desktop host, starts sessions with a placement (line 369). |
| config | LOCAL_PLACEMENTS and copy | `apps/web/features/code/local-code.ts` | Placement labels, hints and the request mapping (lines 1488-1516); LOCAL_CODE_COPY strings (line 47). |
| config | CODE_COPY and CODE_LIMITS | `apps/web/features/code/code-surface.ts` | Visible labels for repository, branch and environment controls (lines 69-95,259-320). |
| hook | useCodeRepositories / useCodeBranches | `apps/web/features/code/hooks/use-code-branches.ts` | Load GitHub branches for the cloud picker. |
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Reads AGI_E2B_EXECUTION and E2B_API_KEY to decide whether cloud provisioning is ready. |
| endpoint | GET/POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Lists sessions with availability (deploymentEnabled, planEntitled, maxSessions) and creates a cloud session. |
| service | cloud-code-session-service | `apps/web/lib/services/cloud-code-session-service.ts` | Create with advisory lock, idempotent requestId, plan and active-session limits (lines 1225-1275). |
| endpoint | GET /api/code/repositories/branches | `apps/web/app/api/code/repositories/branches/route.ts` | Lists branches of a verified GitHub repository, gated by e2bProvisioningReady and plan. |
| table | cloud_code_sessions | `apps/web/lib/services/cloud-code-session-service.ts` | Row per cloud session: repository_url, repository_branch, state, network_access (insert at line 1270). |
| service | Desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Commands workspace_pick_root, developer_session_start, developer_branches_list, developer_branch_switch with permission reasons (lines 699-925, 2312, 2726, 3066). |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Starts the CLI agent session and maps CLI handshake flags to page capabilities (lines 482-526). |
| service | gitService | `apps/desktop/electron/runtime/gitService.ts` | Reads git branches and state for the desktop host. |
| command | CLI --worktree, --repo and /worktree | `apps/cli/src/lib.rs` | Flags (lines 413-424), enter_session_worktree and settle_session_worktree (5982-6035). |
| service | CLI worktree runtime | `apps/cli/src/platform/runtime/worktree.rs` | open_session_worktree creates .agiworkforce/worktrees/NAME and rejects symbolic links (line 209). |
| command | CLI /worktree handler | `apps/cli/src/repl/registry.rs` | list, create, remove subcommands (lines 1859-1904). |
| service | App-server capabilities | `apps/cli/src/app_server/developer_host.rs` | Reports worktrees: true and checkpoints: true (lines 1058,1065). |
| service | VS Code workspaceFolders | `apps/extension-vscode/src/platform/workspaceFolders.ts` | Folder choice from active editor, single folder or quick-pick. |
| command | VS Code sessionWorktrees | `apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts` | newSessionInWorktree and manageSessionWorktrees quick-picks. |
| component | NewCodeSession | `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx` | Mobile folder radio list and Start session button for a paired computer. |
| component | NewCloudCodeSessionSheet | `apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx` | Mobile cloud session sheet with GitHub repository, branch and 'Where it runs' choice. |
| config | mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | companion: false switches off the computer-session path. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks folder and placement in the composer; state lives in the page draft. | device | CloudCodePage.tsx:339,2045-2066 |
| The web app (inside the Electron window) asks the desktop host for folders and branches over the host bridge. | device | use-local-sessions.ts:152-176; dispatcher.ts:2312-2318,3066-3069 |
| On send, startSession picks a starting model by plan, then calls developer_session_start with environment local or worktree. | device | use-local-sessions.ts:369-409; dispatcher.ts:2726-2750 |
| The Electron main process starts the AGI CLI agent in the folder or a new worktree; the CLI creates the git worktree. | device | developerSessionService.ts; apps/cli/src/platform/runtime/worktree.rs:209-260 |
| Cloud path: the page lists GitHub repositories and branches through our API, using the user's GitHub app installation. | our servers | apps/web/app/api/code/repositories/branches/route.ts:55-100 |
| Cloud path: POST /api/code/sessions checks plan, active-session count and idempotency, then inserts a cloud_code_sessions row in state provisioning and the sandbox is provisioned. | our servers | cloud-code-session-service.ts:1225-1275; sandbox vendor call not read (unknown) |
| Sandbox compute for cloud sessions runs at an outside sandbox vendor (E2B). | outside service | apps/web/lib/e2b/gate.ts:1-30 (E2B_API_KEY) |
| CLI/VS Code: the flag or command runs git worktree commands locally. | device | lib.rs:5982-6015; sessionWorktrees.ts:15-23 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen folder roots (approved workspace roots) | Electron main process roots store; exact file unknown | not synced (no sync code found) | revoke via workspace_revoke_root (dispatcher.ts:2319-2324); stored location unknown |
| Git worktree folders | <repo>/.agiworkforce/worktrees/<name> on the device (CLI), or the desktop's worktree location | no | CLI removes an untouched generated worktree at exit, keeps others (lib.rs:6018-6035); desktop has delete, pin and keep commands (dispatcher.ts:2762-2770) |
| Cloud session row (repository URL, branch, state, network access) | table:cloud_code_sessions | server is source of truth; web and mobile read it | archive and rename through PATCH /api/code/sessions/[sessionId] (route.ts:76-100) |

**Models and providers.** Choosing a place does not choose a model. A Desktop local session starts with a model chosen from the folder's model list and the plan: models installed on the machine are listed as ready; the account's models need the plan capability developer_surfaces (local-code.ts:700-760; use-local-sessions.ts:376-390). Cloud sessions choose a coding harness or image in 'Edit environment' (CodeComposer.tsx:321-376). No provider name is hardcoded in the picker.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sessions and branch listing require a signed-in account (getUserScopedDb in apps/web/app/api/code/sessions/route.ts:42,69). Whether Desktop local sessions need sign-in is unknown; the host reports managedSignedIn per folder (packages/contracts/local-runtime/src/developer-sessions.ts:355). |
| Permissions | Desktop asks per folder for shell and git permissions: shell.execute for session start, git.read to list branches, git.write to switch branch (dispatcher.ts:699-925). VS Code worktree removal needs a modal confirmation (sessionWorktrees.ts:25-45). The CLI refuses a worktree through a symbolic link (worktree.rs:226-237). |
| Subscription | Cloud sessions need a plan with sandboxes and a daily coding budget (planIncludesAgiCode, billing-catalog.ts:839-841). The plan ladder in code is basic, pro, max, max_15x (billing-catalog.ts:32-37); team is a self-serve paid tier. Which plan first includes AGI Code is computed by agiCodeMinimumPlan (billing-catalog.ts:843-845); exact values not listed here. Local sessions on account models need the 'developer_surfaces' capability. |
| Limits and metering | Active cloud sessions are capped by getPlanMaxSandboxes (billing-catalog.ts:801-806) and counted in states provisioning, ready, running (cloud-code-session-service.ts:1250-1256). Metering of sandbox compute exists (compute-metering.ts is cited by the brief; not read). Local worktrees: none found in the code. |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY (gate.ts:6-30); AGI_MANAGED_COMPUTE_PRIVATE_BETA (isManagedComputePrivateBetaEnabled, apps/web/lib/managed-compute-gate; read by commands and changes routes); FEATURES.companion on mobile (v1FeatureFlags.ts:16). |
| Model compatibility | No model restriction in the pickers. Models appear in the separate model chip (LocalModelChip.tsx). |
| Provider restrictions | Cloud repositories come only from GitHub (public HTTPS GitHub URLs only, code-surface.ts:277-282). Sandbox vendor is E2B. |
| Local mode | Mode:local on Desktop runs the CLI agent on the device in the chosen folder or worktree; no payment is needed for the picker. Account models inside a local session are plan-gated; locally installed models are not (local-code.ts:700-760). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading repositories or branches | Spinner with aria-label 'Loading repositories' or 'Loading branches'. | CodeComposer.tsx:688-692,1065-1071 |
| Repository list failed | Text 'Repositories could not be loaded.' The branch popover shows 'Branches could not be loaded.' A Retry button for branches exists through useCodeBranches.reload (use-code-branches.ts:20-24); the repository popover retry was not found. | CodeComposer.tsx:908; code-surface.ts:269 |
| No folder available on Desktop | needsLocalFolder is true and the list says 'No folder on this device is open to AGI yet.' with 'Add a folder'. | CloudCodePage.tsx:1957; local-code.ts:69 |
| Folder cannot run | Row shows 'Cannot run here'; start is blocked by localDraftBlocked. | CodeComposer.tsx:435; CloudCodePage.tsx:1958-1960 |
| Command access withheld or refused | Message 'Starting a task requires command access for this folder.' with allow or 'Open Capabilities' button. | CloudCodePage.tsx:2014-2043; local-code.ts:107-109 |
| Branch switch fails | Alert 'That branch could not be checked out.' | CodeComposer.tsx:1228-1229; code-surface.ts:271 |
| Cloud not enabled or plan lacks it | Notice from availability.deploymentEnabled / planEntitled; server returns capabilityUnavailable. | CloudCodePage.tsx:2068-2074; branches/route.ts:55-65 |
| Over session limit | CloudCodeLimitError 'Your plan allows N active Code session(s)'. | cloud-code-session-service.ts:1252-1256 |
| Duplicate request | Same requestId returns the existing row; different details return a conflict. | cloud-code-session-service.ts:1232-1239 |
| Offline / timeout / cancel | not handled in the code for the picker itself beyond the generic failure messages; cancel of the folder picker returns without a session (not read). | not handled in the code (searched CodeComposer.tsx) |
| Accessibility | Radio groups and aria-labels exist on chips and lists; the CLI has a plain mode for screen readers (--plain, lib.rs:436-441). | CodeComposer.tsx:490,687; lib.rs:436-441 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/CloudCodePage.test.tsx`: Page-level behaviour of the code screen including worktree root ids and replacement turns (names seen: 'keeps the replacement turn busy after an A-to-B-to-A old %s'); the placement radio itself was not found by name.
- `apps/web/features/code/hooks/use-local-sessions.test.ts`: Plan-based starting model, 'starts nothing, and says why, when the plan leaves no model ready', stale model reads and command-permission reload.
- `apps/web/features/code/components/LocalWorktreePreferences.test.tsx`: Worktree preference prefix validation and folder picker request.
- `apps/web/features/code/components/LocalSessionsSection.test.tsx`: Offers a new session in each folder, a folder to add, and a repository apart from a folder.
- `apps/web/app/api/code/repositories/branches/__tests__/route.test.ts`: Branch listing route (contents not read).
- `apps/extension-vscode/src/__tests__/workspaceFolders.test.ts`: No workspace, single folder, active-editor folder in multi-root, no active editor.
- `apps/extension-vscode/src/__tests__/sessionWorktrees.test.ts`: Create a named worktree from the picker, stop when no workspace resolves, remove from the listed repository.
- `apps/cli/src/lib.rs`: In-file test the_worktree_return_hint_is_a_command_that_parses_and_continues (line 10898).
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher commands; 39 lines mention worktree or checkpoint (specific cases not read).

**Test scenarios**

- **Worktree isolation on Desktop**
  1. Open Desktop, approve a git folder with uncommitted edits.
  2. Pick 'New worktree with my changes' and send a task that edits a file.
  3. Compare the original folder and the new worktree.
  - Expected: The original folder is unchanged; the worktree holds the base commit plus the uncommitted edits and the agent's edit.
- **Radio hidden without capability**
  1. Use a CLI build whose handshake reports no worktrees (or mock it).
  2. Open the environment chip.
  - Expected: The 'Run the session in' group is not shown and placement is 'local'.
- **Cloud switched off**
  1. Open web /code on a deployment without AGI_E2B_EXECUTION and E2B_API_KEY.
  2. Choose Cloud and try to list branches.
  - Expected: A not-enabled notice is shown and the branches API returns capabilityUnavailable.
- **Plan limit**
  1. With a plan whose active-session cap is reached, start another cloud session.
  - Expected: The server refuses with 'Your plan allows N active Code session(s)' and no new row appears.
- **CLI worktree cleanup**
  1. Run agi -w with no name in a git repo, change nothing, exit.
  - Expected: The CLI prints that it removed the worktree because nothing changed.
- **VS Code multi-root**
  1. Open a multi-root workspace with no active editor.
  2. Run a command that needs a folder.
  - Expected: A quick-pick titled 'Select a workspace folder for this operation' appears.

**Where to look when it fails**

- Errors: DesktopRuntimeError code 'permission-denied' maps to the command-access message (use-local-sessions.ts:398-405).
- Server: CloudCodeLimitError, CloudCodeConflictError, capabilityUnavailable from routes.
- Table cloud_code_sessions for session state; audit event code_session_lifecycle_changed on create (sessions/route.ts:80-88).
- CLI prints '--worktree: ...' errors (lib.rs:5996-6005).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/066-coding-workspace-frontend.md](../../70-qa/test-plans/web/066-coding-workspace-frontend.md)
- Desktop: [70-qa/test-plans/desktop/066-coding-workspace-frontend.md](../../70-qa/test-plans/desktop/066-coding-workspace-frontend.md)
- CLI: [70-qa/test-plans/cli/066-coding-workspace-frontend.md](../../70-qa/test-plans/cli/066-coding-workspace-frontend.md)
- VS Code: [70-qa/test-plans/vscode/066-coding-workspace-frontend.md](../../70-qa/test-plans/vscode/066-coding-workspace-frontend.md)

## 10. Gaps and dependencies

- **The brief says Desktop worktree picker and VS Code worktree are missing, but the code has both.** Affects: Desktop, VS Code; planners and testers. Evidence: CodeComposer.tsx:555-580; sessionWorktrees.ts:15; brief S66.03. Work needed: Update the brief and inventory statuses after a live check.
- **The brief's line references point at moved code (for example dispatcher.ts:704 is now shell_start).** Affects: Anyone following the brief. Evidence: dispatcher.ts:704-708. Work needed: Regenerate the brief code references.
- **No branch picker in CLI or VS Code, and none for local branches on mobile.** Affects: CLI, VS Code, mobile. Evidence: registry.rs:1880-1899; conversationTreeProvider.ts:26-31. Work needed: Design a branch choice using the host's branch list.
- **Mobile local start is behind FEATURES.companion = false, so the brief's 'missing' is accurate in effect but the code exists.** Affects: Mobile. Evidence: v1FeatureFlags.ts:16; companion/code/[threadId].tsx:81. Work needed: Decide whether to ship Remote Control; otherwise remove or hide the dead entry.
- **Cloud start has not been live-checked and needs deployment settings.** Affects: Web. Evidence: brief S66.01 'Unfinished'. Work needed: Set the flag and key, redeploy, run the checks.
- **No confirmation was found before a local branch switch changes the working files beyond the permission prompt.** Affects: Desktop. Evidence: CodeComposer.tsx:1217-1233; dispatcher.ts:918-921. Work needed: Verify live; add a named-consequence confirmation if absent (AGENTS.md section 9).
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- mode:local
- mode:cloud
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- file:apps/web/features/code/components/CodeComposer.tsx
- file:apps/web/lib/e2b/gate.ts

## Unknown

- Where the desktop stores approved workspace roots.
- Whether the CLI cleans a half-made worktree when a start fails.
- Whether Desktop local sessions require account sign-in when only local models are used.
- Exact plan values for maxSandboxes per plan (billing-catalog.ts:590-720 not itemised) and which plan first includes AGI Code.
- Where CLOUD_CODE_REPOSITORIES_PATH points and its route gating.
- Whether the folder picker cancel path is handled cleanly.
