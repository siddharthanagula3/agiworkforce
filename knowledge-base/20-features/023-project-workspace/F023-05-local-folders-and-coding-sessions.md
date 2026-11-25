---
id: "F023-05"
type: "feature"
title: "Local folders and coding sessions"
aliases: ["Local folder association", "agi projects link", "Recent project folders", "Folder trust", "Project registry", "Active project (VS Code)", "Coding sessions in a project"]
area: "23 Project workspace"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S23.13", "S23.18", "S23.19"]
depends_on: ["surface:cli", "surface:vscode", "mode:cloud", "mode:own-key", "mode:local", "store:projects.json", "store:workspaceState", "F023-01", "F023-04", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-05 Local folders and coding sessions

On the CLI, a folder can be linked to an account project and trusted per repository so managed turns there use the project's instructions and conversations are filed under it. VS Code stores an active project per workspace. Coding sessions of a project are listed only in the CLI. Repository association is not applicable.

Area: [23. Project workspace](README.md). Requirement items: [S23.13](../../10-requirements/capabilities/023-project-workspace.md#s2313), [S23.18](../../10-requirements/capabilities/023-project-workspace.md#s2318), [S23.19](../../10-requirements/capabilities/023-project-workspace.md#s2319).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Links a working folder to a project (apps/cli/src/project_registry.rs:276-300), records trust decisions per path and repository identity (project_registry.rs:167-216), and lets the CLI list a project's filed conversations (apps/cli/src/lib.rs:2876-2904).

**Why it exists.** Brief items S23.13 and S23.18 want local work to use the project (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Developers on CLI and VS Code.

**Problems it solves**

- Terminal sessions that forget the project
- Running untrusted repository content
- Finding the chats of a project from the terminal

**Use cases**

- Link a repo folder to project 'Payments' with agi projects link.
- List recent folders with agi projects recent and start one with agi -C.
- In VS Code choose 'Use in this chat' to apply a project to this workspace.
- List a project's conversations with agi history --project.

## 2. User experience

**Where to find it**

- CLI: agi projects link, agi projects recent, agi history --project (apps/cli/src/lib.rs:1323, 1291, 7192).
- VS Code: command 'Code: Use Project in This Chat' and 'Code: Stop Using a Project in This Chat' (apps/extension-vscode/package.json:679, 684).
- Web, Desktop, Mobile: not available for folders or coding sessions.

**Before you start**

- CLI: signed in, run inside the folder; trust asked for developer commands (lib.rs:1828, 6156).
- VS Code: signed in; a workspace folder.

**Screens and controls**

- CLI output line: '<folder> is linked to the account project <name>. Managed turns here use its instructions and knowledge files, and their conversations are filed under it.' (lib.rs:3839-3846).
- CLI recent list: 'Recent project folders' with 'Start a session in one with: agi -C <folder>' (lib.rs:3651-3668).
- VS Code notices 'turns in this workspace now apply <name> and its instructions.' (projectActions.ts:405-410).

**Journey**

1. CLI: cd into the folder.
2. Run agi projects link <project>.
3. Start agi; accept or deny folder trust when asked.
4. Managed turns include the linked project's instructions.
5. Run agi history --project <name> for its conversations; resume with agi resume --cloud <id>.

**What the person sees and gets**

- Link confirmation line (lib.rs:3821-3837).
- History listing with id, title, message count (lib.rs:2906-2925).
- VS Code information messages and tree refresh.

**Settings**

- Trust level values trusted, untrusted, ask (project_registry.rs:8).
- Registry file projects.json under the config directory (project_registry.rs:36-44).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The registry maps absolute directory to id, last_seen, trust level, optional cloud_project_id, identity, trusted_by, trusted_on, trusted_at, revoked_at (project_registry.rs:12-34).
- Writes take an interprocess lock and an atomic temp-file replace (project_registry.rs:73-124).
- link_cloud_project and cloud_project_for connect a folder to an account project (project_registry.rs:276-300); the agent reads it with linked_cloud_project (apps/cli/src/agent/mod.rs:3062-3068).
- Managed turns add the linked project's instructions (agent/mod.rs:238-246).
- agi history --project lists non-archived conversations filed under the project (lib.rs:2876-2904).
- VS Code stores the active project (id, name, instructions) in workspace state and uses it as a prelude (activeProject.ts:5-63).

**Incomplete**

- VS Code stores a project per workspace but does not store a folder path; the brief calls it local folder association [inferred from activeProject.ts:5-12].
- The history listing shows hosted conversations filed under the project, not distinctly marked coding sessions (lib.rs:2884-2895).
- VS Code turns do not attach project knowledge files (activeProject.ts:46-49).

**Present but disconnected or switched off**

- None found.

**Not available**

- Folder link or coding session list on Web, Desktop, Mobile (brief: missing).
- Repository association (S23.19): not applicable.
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- A project can be associated with a local folder so work in that folder uses the project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.18)
- Coding sessions can belong to a project and be listed and reopened from it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.13)
- Repository association is not applicable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.19)
- A directory is never published to the account by being visited; the link is explicit. (source: apps/cli/src/project_registry.rs:20-23)
- Developer extension discovery is folder-aware and trust is required before loading project config. (source: doc: docs/product/definition.md:122)

**Acceptance criteria**

1. agi projects link in a folder makes later managed turns include the project's instructions.
2. Visiting a folder without linking leaves cloud_project_id empty.
3. Revoking trust clears every checkout of the same repository identity.
4. A fresh clone of a trusted repository resolves by identity.
5. agi history --project lists only that project's non-archived conversations.
6. VS Code 'Use in this chat' then 'Stop Using a Project' toggles the project off.
7. Unknown project name gives a clear error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Folder link should be per account owner; the registry stores only the project id so a sign-out leaves the id in place [inferred from ProjectEntry fields].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a folder link on desktop and VS Code that stores the folder path.
- [proposed] Mark coding sessions distinctly in agi history --project.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | ProjectRegistry | `apps/cli/src/project_registry.rs` | Folder registry, trust, link. |
| command | agi projects link | `apps/cli/src/lib.rs` | Links cwd to a project (handler 3821). |
| command | agi projects recent | `apps/cli/src/lib.rs` | Lists recent folders (handler 3634). |
| command | agi history --project | `apps/cli/src/lib.rs` | print_project_history (2876). |
| service | linked_cloud_project | `apps/cli/src/agent/mod.rs` | Reads link for cwd (line 3062). |
| service | project_instructions_context | `apps/cli/src/cloud/mod.rs` | Instruction block (line 963). |
| service | trust gate | `apps/cli/src/lib.rs` | invocation_requires_project_trust (line 1828). |
| service | project cache | `apps/cli/src/cloud/projects.rs` | CachedProject list the link resolves against. |
| component | activeProject | `apps/extension-vscode/src/features/projects/activeProject.ts` | Per-workspace active project. |
| command | useProjectInChat and clearActiveProject | `apps/extension-vscode/src/core/commandSetup.ts` | Command registration (lines 2615-2640). |
| component | customInstructions | `apps/extension-vscode/src/features/instructions/customInstructions.ts` | Adds the prelude (line 104). |
| store | desktop projectStore currentFolder | `apps/desktop/src/stores/projectStore.ts` | Internal Tauri folder concept, not the public Electron app. |
| component | ProjectGitTrustSection | `apps/desktop/src/features/chat/ProjectGitTrustSection.tsx` | Internal Tauri git trust control. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The CLI refreshes the account project list and finds the project by id or name. | device and our servers | apps/cli/src/lib.rs:3821-3828; cloud/mod.rs:417 |
| The CLI writes the project id into projects.json for the current directory under a lock. | device | apps/cli/src/lib.rs:3829-3834; project_registry.rs:73-80 |
| On each managed turn the agent reads the link, loads the cached project and adds its instructions to the memory context. | device | apps/cli/src/agent/mod.rs:238-260 |
| The turn goes to the managed model route and is filed under the project. | our servers | apps/cli/src/agent/mod.rs:2726 (project_id passed on sync) [inferred] |
| History lists hosted conversations and filters by project id on the device. | device and our servers | apps/cli/src/lib.rs:2884-2895 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Folder entries with trust and link | projects.json in the CLI config directory | No | Trust revoked sets revoked_at (project_registry.rs:190); entries persist |
| Active VS Code project | workspaceState | No | Cleared on stop or project delete |
| Conversation to project filing | Account conversations with project_id | Yes | Per account |

**Models and providers.** The linked project does not choose a model in the CLI. Instructions are used only in Managed privacy mode, so own-key and Local runs ignore them (apps/cli/src/cloud/mod.rs:968-970).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Linking and listing need sign-in; the folder registry itself is local. |
| Permissions | Developer commands require folder trust (lib.rs:1828-1858). Trust records who granted it and on which machine (project_registry.rs:24-30). |
| Subscription | Account projects follow the projects capability. None found specific to linking. |
| Limits and metering | Recent list default limit 10 (lib.rs:1291-1294). |
| Feature flags | None found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | Instructions only in Managed mode (cloud/mod.rs:968). |
| Local mode | The folder registry and trust work offline. Account project instructions do not apply in non-Managed modes (cloud/mod.rs:968). VS Code needs the account for projects. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown project | Error "No project '<x>' in your AGI account". | apps/cli/src/lib.rs:3825 |
| No recent folders | Message 'No recent project folders yet. Run agi inside a project to add it here.' | lib.rs:3647 |
| Moved checkout | Trust keyed by repository identity so moves do not drop it. | project_registry.rs:15-18 |
| Concurrent writers | Lock and unique temp file. | project_registry.rs:81-124 |
| No conversations | 'No conversations are filed under <name> yet.' | lib.rs:2906-2911 |
| Offline | History and link need the account; error is returned. Not handled further in the code looked at. | lib.rs:2876-2884 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/project_registry.rs`: Inline tests: roundtrip, trust, revocation, identity, links, concurrency (lines 370-860).
- `apps/cli/src/lib.rs`: Inline tests include trust before context (around line 10409).
- `apps/extension-vscode/src/__tests__/projectsView.test.ts`: VS Code projects view (by name).

**Test scenarios**

- **Link a folder**
  1. cd to a folder
  2. agi projects link Demo
  3. agi projects recent
  - Expected: Linked line printed; recent shows 'linked to Demo'.
- **Instructions in linked folder**
  1. Set instructions on the project
  2. Run a managed turn in the folder
  - Expected: Turn follows instructions.
- **Trust revoke**
  1. Trust a repo
  2. Revoke
  3. Run a developer command
  - Expected: Trust asked again.
- **History by project**
  1. agi history --project Demo
  - Expected: Filed conversations listed.
- **VS Code toggle**
  1. Use Project in This Chat
  2. Stop Using a Project
  - Expected: Notices both ways.

**Where to look when it fails**

- projects.json and projects.lock in the config directory.
- Warning 'could not cache the project list' (cloud/mod.rs:473).
- VS Code message 'turns in this workspace no longer use ...'.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)

## 10. Gaps and dependencies

- **No folder link or session list on Web, Desktop, Mobile.** Affects: Those apps. Evidence: Brief S23.13, S23.18. Work needed: Decide scope; public desktop is a hosted app.
- **VS Code keeps no folder path link and omits files.** Affects: VS Code. Evidence: activeProject.ts:46-49. Work needed: Clarify requirement.
- **History does not mark coding sessions.** Affects: CLI. Evidence: lib.rs:2884-2895. Work needed: Filter or label.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- mode:cloud
- mode:own-key
- mode:local
- store:projects.json
- store:workspaceState
- F023-01
- F023-04
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-sync-and-continuity

## Unknown

- Which CLI conversations count as coding sessions versus chats.
- Whether desktop Tauri folder features reach any shipped build.
- Test coverage of agi projects link command (only registry tests seen).
