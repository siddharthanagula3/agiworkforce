---
id: "F062-05"
type: "feature"
title: "Workspace sharing indicator"
aliases: ["Shared vs isolated workspace indicator", "S62.13"]
area: "62 Multi-agent and multi-model interfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.13"]
depends_on: ["surface:cli", "surface:vscode", "surface:web", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "F062-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-05 Workspace sharing indicator

Would label whether agents share one workspace folder or each work in an isolated copy. No app has this label or control. The CLI passes the parent's file authority to children, so children likely share the parent's folder, but nothing tells the person.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.13](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6213).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. The intended behaviour is a label on a task or agent view saying 'shared workspace' or 'isolated workspace'.

**Why it exists.** When several agents edit files, the person needs to know whether they can collide or are fenced apart. [inferred from brief S62.13]

**Who uses it.** Developers running several child agents or cloud sessions on the same repository.

**Problems it solves**

- Surprise file conflicts between agents.
- Not knowing whether a child's edits touch the main folder.

**Use cases**

- See that three CLI children edit the same checkout.
- See that a cloud code session works on its own cloned branch.

## 2. User experience

**Where to find it**

- No app has it. Searched the CLI task list, VS Code Subagents group, web LocalSessionPanel group, Cloud tasks pages and the Chrome sheet; none renders a workspace label.

**Before you start**

- not applicable

**Screens and controls**

- none found

**Journey**

1. not applicable: nothing to follow.

**What the person sees and gets**

- none

**Settings**

- none found. Related but different: a coding session's worktree and branch are shown on the web Code page group (apps/web/features/code/components/LocalSessionPanel.tsx:'worktree' in the group props) and VS Code has session worktrees (apps/extension-vscode/src/__tests__/sessionWorktrees.test.ts). These are per-session, not per-agent labels. Not read in detail.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI children receive the parent's workspace file authority, so they act in the same workspace as the parent (apps/cli/src/subagent.rs:535-546, :680 workspace_authority; apps/cli/src/agent/chat.rs:3012-3013). [inferred] shared workspace.

**Incomplete**

- No indicator of any kind.

**Present but disconnected or switched off**

- none found

**Not available**

- All six apps: no shared or isolated workspace label (brief S62.13 lists missing everywhere; no code found).

## 4. Required behaviour

**Established requirements**

- The view shows whether agents share one workspace or work in isolated ones. (source: brief S62.13)
- Trust is visible: host device, project and scope are visible when they affect behaviour. (source: docs/product/experience-contract.md rule 5)

**Acceptance criteria**

1. A task or agent view names the workspace mode of each agent.
2. The label matches how the code actually runs the children (verify against the file authority).
3. The label is available to screen readers.
4. CLI /tasks list or show includes the mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The first useful label is 'shared' for CLI children, since they share the parent's file authority.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a workspace field to DeveloperChildTask and render it in VS Code and web.
- [proposed] If an isolated mode (worktree per child) is ever added, show it per row.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | workspace authority hand-off to children | `apps/cli/src/agent/chat.rs` | Passes checkpoint_file_authority to the manager (3012-3033). |
| service | SubagentManager.set_workspace_authority | `apps/cli/src/subagent.rs` | Stores and gives each child the authority (run_subagent installs it at ~1085). |
| schema | DeveloperChildTask | `crates/agiworkforce-protocol/bindings/DeveloperChildTask.ts` | Wire type with no workspace field, where a label would need to be added. |
| command | /tasks list | `apps/cli/src/repl/registry.rs` | Where a mode could be printed. |
| component | Subagents panel (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Possible place for a label. |
| component | LocalSubagents | `apps/web/features/code/components/LocalSessionPanel.tsx` | Possible place for a label. |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Cloud run context section, no workspace label. |
| test | session worktree tests | `apps/extension-vscode/src/__tests__/sessionWorktrees.test.ts` | Per-session worktrees, a neighbouring concept. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing displays a workspace mode. The CLI hands the parent's file authority to each child at spawn. | device | apps/cli/src/agent/chat.rs:3012-3033 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No workspace-mode data exists in the child task record | not applicable | not applicable | not applicable |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code for the label; children inherit the parent's permission mode (subagent.rs:668-683). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | No behaviour; if added, it should work fully on the device in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code: the feature does not exist. | searches of apps/cli, apps/extension-vscode, apps/web/features/code, apps/mobile, apps/extension |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/sessionWorktrees.test.ts`: Per-session worktrees only; not an agent workspace label.

**Test scenarios**

- **Absence check**
  1. Spawn two CLI children and run /tasks list and /tasks show.
  - Expected: No workspace mode appears (documents the gap).
- **Future label**
  1. After implementation, spawn children in shared and isolated modes.
  - Expected: Each row names its mode.
- **Boundary check**
  1. Have a child write a file; inspect the parent folder.
  - Expected: Confirms shared workspace before a 'shared' label ships.

**Where to look when it fails**

- none: no log lines or tables exist for this feature.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No shared or isolated workspace label on any app.** Affects: All six apps. Evidence: brief S62.13; no code found. Work needed: Define modes, carry the field through the protocol type, render it per app.
- **The CLI has no isolated child mode.** Affects: CLI. Evidence: No isolation or worktree option found in apps/cli/src/subagent.rs. Work needed: Product decision before labelling.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- surface:web
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- F062-01

## Unknown

- Whether named agent definitions can request isolation (agents.rs not read in full).
- Whether cloud code sessions imply an isolated clone label elsewhere in apps/web/features/code.
- How per-session worktree data could feed a per-agent label.
