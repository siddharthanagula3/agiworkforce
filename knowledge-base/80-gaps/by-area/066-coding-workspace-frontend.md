---
id: "GAPS-AREA-066"
type: "gap-list"
title: "Gaps: Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 66. Coding-workspace frontend

101 open gaps that touch this area. Area page: [20-features/066-coding-workspace-frontend](../../20-features/066-coding-workspace-frontend/README.md).

## CMP-C48

**Rewind menu: summarize from here or up to here**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: The picker offers restore code and conversation, conversation only, or code only.
- Evidence: apps/cli/src/tui/widgets/checkpoint_picker.rs:46-58

## CMP-C49

**Slash command /checkpoint (alias of /rewind)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: /rewind exists with no /checkpoint alias; typing /checkpoint is an unknown command.
- Evidence: apps/cli/src/tui/tui_app.rs:5986; crates/agiworkforce-command-registry/src/lib.rs:154-990 (106 built-in commands, none by this name)

## CMP-CP149

**Rewind by pressing Esc twice, and /undo**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no /undo alias Esc twice on an empty prompt opens rewind; there is no /undo alias.
- Evidence: apps/cli/src/tui/tui_app.rs:3927

## CMP-W186

**Create a draft pull request from the session**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: The Create pull request button always opens a normal pull request; the session route takes no draft option.
- Evidence: apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:29-44; searched: draft in apps/web/features/code

## CMP-W188

**GitLab or Bitbucket repositories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: GitHub only.
- Evidence: searched: gitlab, bitbucket in apps/web features/code, lib/services, app/api/code

## CMP-W192

**Pick more than one repository in a single session**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: A session attaches one repository and branch.
- Evidence: apps/web/features/code/code-surface.ts:55-65 (single repositoryUrl, repositoryBranch); searched: multi repo in apps/web/features/code

## CMP-WP144

**Auto-fix pull requests when CI fails or reviewers comment**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: It does not run by itself Mentioning @agi-workforce on a GitHub issue or PR starts a task that reads failed checks; it does not run by itself.
- Evidence: apps/web/lib/services/cloud-code-github-task.ts:44; apps/web/lib/services/cloud-code-github-task.ts:18

## CMP-WP148

**Move a session between cloud, terminal and editor (teleport, Open in Cloud)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: The CLI and VS Code are not yet released A handoff route and VS Code handoff link exist, and the CLI signs in with agi login; the CLI and VS Code are not yet released.
- Evidence: apps/web/features/code/code-surface.ts:3; apps/web/lib/surface-status.ts:9

## CMP-WP155

**Cloud session permission modes (Manual, Accept edits, Auto classifier, Plan)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: There is no classifier-based Auto mode A mode menu offers ask every time, auto-approve reads, autonomous and Plan, saved as your default; there is no classifier-based Auto mode.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1363-1440; apps/web/lib/services/cloud-code-agent-tools.ts:378-394

## GAP-AREA066-LW05

**Status words 'idle' and 'closed' have no marker in code; the only markers are running, needs-approval, needs-input and failed, and archived is the only closed-like label**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-066
- Detail: Area 66. Coding-workspace frontend
- Evidence: apps/web/features/code/local-code.ts:467-473, 380-382

## GAP-AREA066-LW06

**Two gate helpers disagree: the execution check is true when the key alone is set, but provisioning also needs the flag and price; the sandbox runtime uses the looser check**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-066
- Detail: Area 66. Coding-workspace frontend
- Evidence: apps/web/lib/e2b/gate.ts:9-14 and 20-28; apps/web/lib/e2b/runtime.ts:796

## GAP-CAP-coding-workflows-06

**Start a cloud coding session: Local/cloud selector is partial on web and desktop, missing on mobile, CLI and VS Code (S66.04). The sandbox switch is off in the test deployment.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md), [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.01, S66.04, S66.05, S99.30
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-07

**Repository, branch and multi-repository choice: No multi-repo (W192), no GitLab or Bitbucket (W188), branch picker missing in CLI and mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Requirement items: S66.01, S66.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-09

**Review the diff and comment on lines: Inline review comments (S66.20) missing everywhere; hunk acceptance missing on web, desktop and mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Requirement items: S66.18, S66.19, S66.20, S66.21
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-10

**Commit and open a pull request or draft pull request: No draft pull request on web (W186). No session link in commits (W202). Pull-request panel missing on mobile and CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Requirement items: S66.36, S67.29, S67.30, S67.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-11

**Auto-fix a pull request after CI or review comments: No CI-status panel anywhere (S66.37); respond to review feedback missing on web, desktop, mobile and VS Code (S67.32).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.37, S67.32, S67.33, S99.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-coding-workflows-20

**Move a session between cloud, terminal, editor and phone: Web move is partial (WP148; S66.41 web missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.41, S99.28, S99.30
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-coding-workflows-21

**Permission modes in coding sessions: Web partial and plan mode missing on web; mobile missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Requirement items: S66.24, S66.25, S66.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-23

**Parallel sessions and worktrees: No worktree picker on web, desktop, mobile or VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.03, S99.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-27

**Shared limits and billing between chat and coding tools: A person saw a usage meter on the Free Upgrade page, against the Free-usage rule (W-18 minor defect). The Basic card omits Code while Code says it is included from Basic.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Requirement items: S66.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-16

**Rewind conversation and code to an earlier point: No rewind on the web or desktop Code views. CLI lacks a summarize-from-here option and retention settings.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md), [F092-07](../../20-features/092-tool-calling-and-agent-loop-components/F092-07-durable-runs-and-recovery.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.22, S66.23, S92.25, S99.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F066-01-01

**The brief says Desktop worktree picker and VS Code worktree are missing, but the code has both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: Desktop, VS Code; planners and testers. Work needed: Update the brief and inventory statuses after a live check.
- Evidence: CodeComposer.tsx:555-580; sessionWorktrees.ts:15; brief S66.03

## GAP-F066-01-02

**The brief's line references point at moved code (for example dispatcher.ts:704 is now shell_start).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: Anyone following the brief. Work needed: Regenerate the brief code references.
- Evidence: dispatcher.ts:704-708

## GAP-F066-01-03

**No branch picker in CLI or VS Code, and none for local branches on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: CLI, VS Code, mobile. Work needed: Design a branch choice using the host's branch list.
- Evidence: registry.rs:1880-1899; conversationTreeProvider.ts:26-31

## GAP-F066-01-04

**Mobile local start is behind FEATURES.companion = false, so the brief's 'missing' is accurate in effect but the code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: Mobile. Work needed: Decide whether to ship Remote Control; otherwise remove or hide the dead entry.
- Evidence: v1FeatureFlags.ts:16; companion/code/[threadId].tsx:81

## GAP-F066-01-05

**Cloud start has not been live-checked and needs deployment settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: Web. Work needed: Set the flag and key, redeploy, run the checks.
- Evidence: brief S66.01 'Unfinished'

## GAP-F066-01-06

**No confirmation was found before a local branch switch changes the working files beyond the permission prompt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Detail: Affects: Desktop. Work needed: Verify live; add a named-consequence confirmation if absent (AGENTS.md section 9).
- Evidence: CodeComposer.tsx:1217-1233; dispatcher.ts:918-921

## GAP-F066-01-NOTBUILT

**Start a session in a folder, branch or worktree: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Requirement items: S66.01, S66.02, S66.03, S66.04
- Detail: Web: S66.03; Desktop: S66.03; Mobile: S66.01, S66.02, S66.03, S66.04; CLI: S66.02, S66.04; VS Code: S66.03, S66.04

## GAP-F066-01-PARTLY

**Start a session in a folder, branch or worktree: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F066-01](../../20-features/066-coding-workspace-frontend/F066-01-start-a-session-in-a-folder-branch-or-worktree.md)
- Requirement items: S66.01, S66.02, S66.04
- Detail: Web S66.01: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.02: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.04: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F066-02-01

**No closed status marker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Detail: Affects: Web, Desktop. Work needed: Define when a session is closed and show it.
- Evidence: local-code.ts:477-488 lists only running, needs-approval, needs-input, failed

## GAP-F066-02-02

**No Retry on a failed list read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Detail: Affects: Web, Desktop. Work needed: Add a retry that calls refresh.
- Evidence: LocalSessionsSection.tsx:318-322

## GAP-F066-02-03

**Mobile list is switched off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Detail: Affects: Mobile. Work needed: Enable when Remote Control ships, then live check.
- Evidence: v1FeatureFlags.ts:16

## GAP-F066-02-04

**VS Code rename not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Detail: Affects: VS Code. Work needed: Confirm and add or document.
- Evidence: package.json has no rename command

## GAP-F066-02-05

**The brief rates Desktop and mobile 'done' while the Desktop UI is shared web code and mobile is flagged off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Detail: Affects: Planning accuracy. Work needed: Correct the inventory.
- Evidence: CloudCodePage.tsx:1949; v1FeatureFlags.ts:16

## GAP-F066-02-PARTLY

**Session list, titles and status: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-02](../../20-features/066-coding-workspace-frontend/F066-02-session-list-titles-and-status.md)
- Requirement items: S66.05, S66.06, S66.07
- Detail: Web S66.05: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.06: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.07: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F066-03-01

**Brief says web file tree, search, editor and tabs are missing; Desktop tree and search missing. The code has all of them in the Electron web app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: Web, Desktop planning. Work needed: Update the brief; live-verify.
- Evidence: LocalFilesPanel.tsx; brief S66.08, S66.09, S66.12

## GAP-F066-03-02

**No selected-code context on web or Desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: Web, Desktop. Work needed: Add a send-selection action with a range reference.
- Evidence: No selection code in LocalFileEditor.tsx

## GAP-F066-03-03

**No diagnostics list or code-action surface; only Explain Error per line in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: All apps. Work needed: Design a diagnostics panel per app.
- Evidence: editorUtilities.ts:75

## GAP-F066-03-04

**File delete may not use the Trash as AGENTS.md section 9 requires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: Desktop. Work needed: Read host implementation and route through Trash.
- Evidence: LocalFilesPanel.tsx:147-160; deleteRegularFile not read

## GAP-F066-03-05

**No symbol search outside VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: Web, Desktop, CLI. Work needed: Decide scope.
- Evidence: mentionSearch.ts:102 only

## GAP-F066-03-06

**The Files tool lives under the terminal gate, so a folder without terminal access also loses files.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Detail: Affects: Desktop. Work needed: Check whether intentional.
- Evidence: LocalSessionPanel.tsx:662,705-725

## GAP-F066-03-NOTBUILT

**Files, search, editor, diagnostics and selected-code context: not built on Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI
- Features: [F066-03](../../20-features/066-coding-workspace-frontend/F066-03-files-search-editor-diagnostics-and-selected-code.md)
- Requirement items: S66.08, S66.09, S66.10, S66.11, S66.12, S66.13, S66.14
- Detail: Desktop: S66.08, S66.09, S66.10, S66.12, S66.13, S66.14; Mobile: S66.08, S66.09, S66.10, S66.11, S66.12, S66.13, S66.14; CLI: S66.08, S66.11, S66.12

## GAP-F066-04-01

**Brief says terminal tabs missing on web and Desktop; the code has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: Web, Desktop. Work needed: Update brief.
- Evidence: LocalTerminal.tsx:355-450

## GAP-F066-04-02

**No persisted command history; local history lives in page state only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: Web, Desktop. Work needed: Decide on storage and retention.
- Evidence: LocalTerminal.tsx:62-64

## GAP-F066-04-03

**Mobile terminal and history are flag-off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: Mobile. Work needed: Enable or remove.
- Evidence: v1FeatureFlags.ts:16

## GAP-F066-04-04

**Command mode merges stderr into stdout.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: Web and Desktop on non-Unix systems. Work needed: Separate streams if the host provides them.
- Evidence: LocalTerminal.tsx:100-108

## GAP-F066-04-05

**No terminal tabs in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: CLI. Work needed: Decide whether needed.
- Evidence: terminals.rs and tui_app.rs show no tab concept

## GAP-F066-04-06

**Cloud terminal depends on undone switch-on and live check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Detail: Affects: Web. Work needed: Set settings, run live checks.
- Evidence: brief S66.15 'Unfinished'

## GAP-F066-04-NOTBUILT

**Terminal and command history: not built on Web, Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Requirement items: S66.15, S66.16
- Detail: Web: S66.16; Desktop: S66.16; Mobile: S66.15, S66.16; CLI: S66.16

## GAP-F066-04-PARTLY

**Terminal and command history: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-04](../../20-features/066-coding-workspace-frontend/F066-04-terminal-and-command-history.md)
- Requirement items: S66.15, S66.17
- Detail: Web S66.15: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.17: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F066-05-01

**Brief says inline comments and hunk accept or reject are missing on web and Desktop, and CLI/VS Code comments missing; the Desktop/web code has both. Still missing on CLI and VS Code for comments.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Detail: Affects: Planning accuracy; CLI, VS Code comments. Work needed: Update brief; decide CLI and VS Code comments.
- Evidence: LocalReviewPane.tsx:90-260; brief S66.20, S66.21

## GAP-F066-05-02

**Discard also drops the person's own uncommitted edits and cannot be undone.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Detail: Affects: Web, Desktop. Work needed: Consider checkpoint before discard (AGENTS.md section 9 'code gets a checkpoint').
- Evidence: code-surface.ts:192-193

## GAP-F066-05-03

**Cloud web sessions and mobile have no hunk accept or reject.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Detail: Affects: Web cloud, mobile. Work needed: Add or document.
- Evidence: CodeChangesPanel.tsx has file-level discard only

## GAP-F066-05-04

**Mobile computer-session diff view is flag-off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Detail: Affects: Mobile. Work needed: Enable with Remote Control.
- Evidence: v1FeatureFlags.ts:16

## GAP-F066-05-05

**Web status is 'partial' only for cloud gating, which the local Review does not depend on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Detail: Affects: Inventory. Work needed: Split local and cloud statuses.
- Evidence: brief S66.18

## GAP-F066-05-NOTBUILT

**Review the agent's changes: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Requirement items: S66.20, S66.21
- Detail: Web: S66.20, S66.21; Desktop: S66.20, S66.21; Mobile: S66.20, S66.21; CLI: S66.20; VS Code: S66.20

## GAP-F066-05-PARTLY

**Review the agent's changes: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-05](../../20-features/066-coding-workspace-frontend/F066-05-review-the-agent-s-changes.md)
- Requirement items: S66.18, S66.19
- Detail: Web S66.18: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.19: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F066-06-01

**Brief says Desktop missing; the code has checkpoint list, diff, revert, stage and rewind on Desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Detail: Affects: Desktop planning. Work needed: Update brief; live check.
- Evidence: dispatcher.ts:777-803; LocalRewindChooser.tsx

## GAP-F066-06-02

**doc: docs/decisions/wire-or-cut.md (2026-07-30) still says the VS Code checkpoint UI is cut, but showCheckpoints exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Detail: Affects: VS Code, docs. Work needed: Update the decision record.
- Evidence: ChatStateManager.ts:3692; commandSetup.ts:1381

## GAP-F066-06-03

**Typed /rewind <n> <mode> shows no confirmation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Detail: Affects: CLI. Work needed: Add a confirmation naming what is lost.
- Evidence: registry.rs:1136-1170

## GAP-F066-06-04

**Two checkpoint systems with different data and limits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Detail: Affects: All apps. Work needed: Document or unify ownership.
- Evidence: checkpoints.rs vs app_server/review.rs

## GAP-F066-06-05

**No checkpoints on web cloud sessions and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Detail: Affects: Web cloud, mobile. Work needed: Decide scope.
- Evidence: no code found

## GAP-F066-06-NOTBUILT

**Checkpoints and rewind: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F066-06](../../20-features/066-coding-workspace-frontend/F066-06-checkpoints-and-rewind.md)
- Requirement items: S66.22, S66.23
- Detail: Mobile: S66.22, S66.23

## GAP-F066-07-01

**Cloud Plan mode has no plan-approval step; edits stay refused until the person changes mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: Affects: Web and desktop cloud sessions. Work needed: Add an approve-plan action that switches the turn mode and starts editing.
- Evidence: cloud-code-agent-tools.ts:336-337; S66.24 Should

## GAP-F066-07-02

**Mobile has no Plan mode or per-session mode control in the code-session view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: Affects: surface:mobile. Work needed: Add mode display and selection to the remote code session.
- Evidence: Brief S66.24-26 mobile missing; CodeSessionView.tsx has no mode control

## GAP-F066-07-03

**The brief's cited line numbers for this item mostly point at unrelated code (for example dispatcher.ts:231 and :1055, chat.rs:1107 is the browser bridge).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: Affects: Anyone using the brief as a map. Work needed: Refresh the brief's code references.
- Evidence: Files opened during this write-up

## GAP-F066-07-04

**Cloud default is 'Skip approvals' when nothing is stored, which differs from the contract default of ask-every-time.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: Affects: New cloud accounts. Work needed: Confirm with the owner that this difference is intended and document it.
- Evidence: tool-approval-policy.ts:11,13; apps/web/shared/types/toolApprovalPolicy.ts

## GAP-F066-07-05

**Cloud web save failure shows no message, only a label rollback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Detail: Affects: surface:web. Work needed: Show an error like mobile's 'Not synced'.
- Evidence: CodeComposer.tsx:1398-1412

## GAP-F066-07-NOTBUILT

**Plan mode, edit mode and permission control: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Requirement items: S66.24
- Detail: Web: S66.24

## GAP-F066-07-PARTLY

**Plan mode, edit mode and permission control: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-07](../../20-features/066-coding-workspace-frontend/F066-07-plan-mode-edit-mode-and-permission-control.md)
- Requirement items: S66.25, S66.26
- Detail: Web S66.25: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S66.26: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F066-08-01

**Web ring arc ignores context fill.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Detail: Affects: surface:web and surface:desktop. Work needed: Decide if the arc should show context; update the brief or code.
- Evidence: CodeComposer.tsx:1521-1590

## GAP-F066-08-02

**Mobile remote code sessions have no context or cost indicator.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Detail: Affects: surface:mobile. Work needed: Add context and spend to the companion code session.
- Evidence: CodeSessionView.tsx:296-298 only links to usage

## GAP-F066-08-03

**No money amount on the web or mobile for the coding surface; only percentages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Detail: Affects: S66.28 'money' part. Work needed: Add a credit or money line where the plan allows.
- Evidence: CodeComposer.tsx:1594-1650

## GAP-F066-08-04

**VS Code cost uses a rate table imported from modelConstants.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Detail: Affects: surface:vscode. Work needed: Source rates from the model catalog or billed credits only.
- Evidence: tokenCounter.ts:3,115

## GAP-F066-08-05

**Brief line references are stale (for example CodeSessionView.tsx:108 and :272 show no usage code).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: Files opened

## GAP-F066-08-NOTBUILT

**Usage and context-window indicator: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Requirement items: S66.27
- Detail: Mobile: S66.27

## GAP-F066-08-PARTLY

**Usage and context-window indicator: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-08](../../20-features/066-coding-workspace-frontend/F066-08-usage-and-context-window-indicator.md)
- Requirement items: S66.27
- Detail: Web S66.27: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F066-09-01

**Brief says web and desktop have no subagent or running-command list, but the desktop-hosted web page has both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Detail: Affects: Brief accuracy for surface:web and surface:desktop. Work needed: Update the brief; live-verify on the desktop app.
- Evidence: LocalSessionPanel.tsx:174-203; LocalRunningCommands.tsx

## GAP-F066-09-02

**Brief says VS Code subagents are missing, but code and a test exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Detail: Affects: surface:vscode. Work needed: Update the brief; the founder decision still cuts a task panel in VS Code (docs/decisions/2026-09-27-founder-decisions.md:103).
- Evidence: ChatStateManager.ts:1673-1679; subagents.webview.test.ts

## GAP-F066-09-03

**Empty-state copy is defined but never shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Detail: Affects: surface:desktop. Work needed: Show it or remove it.
- Evidence: local-code.ts:149; LocalRunningCommands.tsx:131

## GAP-F066-09-04

**No stop control for a subagent on the web panel; no confirmation before stopping a command.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Detail: Affects: surface:desktop. Work needed: Add per-task stop and decide whether stop needs confirmation.
- Evidence: LocalSessionPanel.tsx:185-201; LocalRunningCommands.tsx:94

## GAP-F066-09-05

**Mobile has no view of subagents or running commands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Detail: Affects: surface:mobile. Work needed: Add if wanted; not in the brief's required list for mobile beyond S66.29-30 missing.
- Evidence: No code found in apps/mobile/src/features/companion

## GAP-F066-09-NOTBUILT

**Background tasks, subagents and running servers: not built on Web, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI
- Features: [F066-09](../../20-features/066-coding-workspace-frontend/F066-09-background-tasks-subagents-and-running-servers.md)
- Requirement items: S66.29, S66.30, S66.33
- Detail: Web: S66.29, S66.30, S66.33; Mobile: S66.29, S66.30, S66.33; CLI: S66.33

## GAP-F066-10-01

**The brief marks browser preview, port URL and simulator missing everywhere; code exists on the desktop-hosted page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-10](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief; live-verify.
- Evidence: LocalSessionPanel.tsx:1922-1940

## GAP-F066-10-02

**No console log panel; errors only, sent to the agent on request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-10](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)
- Detail: Affects: S66.32 on desktop. Work needed: Add a log view if required.
- Evidence: previewWindow.ts:46-53

## GAP-F066-10-03

**No browser preview for cloud sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-10](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)
- Detail: Affects: surface:web cloud sessions. Work needed: Design a preview of the cloud sandbox's port.
- Evidence: No code found

## GAP-F066-10-04

**No simulator or emulator outside macOS and none for Android.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-10](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)
- Detail: Affects: Non-Mac desktop users. Work needed: Decide scope.
- Evidence: simulatorService.ts:211-213

## GAP-F066-10-NOTBUILT

**Live browser preview and simulator: not built on Web, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI, VS Code
- Features: [F066-10](../../20-features/066-coding-workspace-frontend/F066-10-live-browser-preview-and-simulator.md)
- Requirement items: S66.31, S66.32, S66.34, S66.35
- Detail: Web: S66.31, S66.32, S66.34, S66.35; Mobile: S66.31, S66.32, S66.34, S66.35; CLI: S66.31, S66.32, S66.34, S66.35; VS Code: S66.31, S66.32, S66.34, S66.35

## GAP-F066-11-01

**Brief says CI status is missing in every app; code shows check status in three places.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief; live-verify.
- Evidence: LocalPullRequest.tsx; CodeChangesPanel.tsx:142-210; CloudCodeChangesSheet.tsx:231-293

## GAP-F066-11-02

**Brief says mobile has test results and no pull request; the files cited are unrelated, and mobile cloud sessions do have pull request and checks while test results were not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Detail: Affects: surface:mobile. Work needed: Correct the brief.
- Evidence: CodeSessionView.tsx:272 holds unrelated code; useCloudCodeChanges.ts:128

## GAP-F066-11-03

**No structured test counts or failing test list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Detail: Affects: web and desktop. Work needed: Parse results into a panel.
- Evidence: LocalSessionPanel.tsx:1700-1715

## GAP-F066-11-04

**CLI has no pull request or test panel; recap is not stored.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Detail: Affects: surface:cli. Work needed: Decide whether to add.
- Evidence: claude_parity.rs:1946

## GAP-F066-11-05

**Mobile companion sessions and VS Code have no pull request view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Detail: Affects: surface:mobile, surface:vscode. Work needed: VS Code is cut by decision for test and task panels; pull request view needs a decision.
- Evidence: No code found

## GAP-F066-11-NOTBUILT

**Pull request, checks, test results, recap: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Requirement items: S66.36, S66.37, S66.38, S66.39
- Detail: Web: S66.37, S66.38, S66.39; Desktop: S66.37, S66.39; Mobile: S66.36, S66.37, S66.39; CLI: S66.36, S66.37, S66.38; VS Code: S66.36, S66.37, S66.39

## GAP-F066-11-PARTLY

**Pull request, checks, test results, recap: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md)
- Requirement items: S66.36
- Detail: Web S66.36: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F066-12-01

**The brief says continuing from web is missing; the desktop-hosted page and cloud changes panel offer it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief.
- Evidence: LocalSessionPanel.tsx:1201-1204; CodeChangesPanel.tsx:513

## GAP-F066-12-02

**Sharing from mobile and VS Code is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Detail: Affects: surface:mobile, surface:vscode. Work needed: Decide; the leaders' share is from the web session list.
- Evidence: No code found; brief

## GAP-F066-12-03

**Whether phone and desktop can both drive a session is not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Detail: Affects: surface:mobile, surface:desktop. Work needed: Live test with a phone and the desktop typing at once.
- Evidence: Only the writer-conflict error was found (developerSessionService.ts:813)

## GAP-F066-12-04

**Brief line numbers for continue (dispatcher.ts:874, lib.rs:829, tui_app.rs:2708) point at unrelated code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: Files opened

## GAP-F066-12-05

**Remote Control is hidden in the mobile review build per project notes; the gate was not located.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Detail: Affects: surface:mobile v1. Work needed: Locate and document the flag.
- Evidence: memory note only

## GAP-F066-12-NOTBUILT

**Continue, share and move sessions: not built on Web, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, VS Code
- Features: [F066-12](../../20-features/066-coding-workspace-frontend/F066-12-continue-share-and-move-sessions.md)
- Requirement items: S66.40, S66.41
- Detail: Web: S66.41; Mobile: S66.40; VS Code: S66.40
