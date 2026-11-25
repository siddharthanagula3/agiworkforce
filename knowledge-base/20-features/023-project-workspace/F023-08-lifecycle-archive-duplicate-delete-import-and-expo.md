---
id: "F023-08"
type: "feature"
title: "Lifecycle: archive, duplicate, delete, import and export"
aliases: ["Project lifecycle", "Archive and Unarchive", "Restore", "Duplicate project", "Export project", "Delete project", "Import project", "S23.28 to S23.32 in the area brief"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S23.28", "S23.29", "S23.30", "S23.31", "S23.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "table:user_projects", "table:project_knowledge_files", "api:POST /api/projects/[id]/duplicate", "api:GET /api/projects/[id]/export", "api:DELETE /api/projects/[id]", "F023-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-08 Lifecycle: archive, duplicate, delete, import and export

Lets an owner archive a project out of the active list and bring it back, duplicate it with settings and files, export it as a JSON file, and delete it (soft delete, chats kept unfiled, blocked by a legal hold). Import from another assistant is not built; only an import-source field exists. Duplicate and Export are Web and Desktop only.

Area: [23. Project workspace](README.md). Requirement items: [S23.28](../../10-requirements/capabilities/023-project-workspace.md#s2328), [S23.29](../../10-requirements/capabilities/023-project-workspace.md#s2329), [S23.30](../../10-requirements/capabilities/023-project-workspace.md#s2330), [S23.31](../../10-requirements/capabilities/023-project-workspace.md#s2331), [S23.32](../../10-requirements/capabilities/023-project-workspace.md#s2332).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Manages the life of a project: Archive or Unarchive, Duplicate (copy with settings and files, not chats), Export (download a JSON snapshot), Delete (mark deleted, remove files from the project, unfile chats). (apps/web/app/api/projects/[id]/route.ts:33) (apps/web/app/api/projects/[id]/duplicate/route.ts:23) (apps/web/app/api/projects/[id]/export/route.ts:14) (apps/web/lib/server/project-deletion.ts:133)

**Why it exists.** People need to tidy the project list without losing work, reuse a project as a template, take their data out, and remove projects they no longer want, with a safeguard for legal holds. (doc: knowledge-base/data/area-briefs/023-project-workspace.md)

**Who uses it.** Project owners on Web, Desktop, Mobile, CLI and VS Code (delete); editors and members cannot archive, delete, duplicate or export. (apps/web/app/api/projects/[id]/route.ts:261)

**Problems it solves**

- Cluttered project lists (archive hides without deleting).
- Rebuilding a project setup from scratch (duplicate).
- Locking data in (export file).
- Removing unwanted projects while keeping chat history (unfiled).
- Deleting data that a legal hold must preserve (refused).

**Use cases**

- Archive a finished project and restore it next quarter.
- Duplicate a client template project with its files before starting a new client.
- Export a project's settings and file text before leaving the service.
- Delete a test project from the CLI with --yes in a script.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Projects list, project card menu, items 'Archive' / 'Unarchive' and 'Delete'; button 'Archived ({count})' toggles the archived view, label 'Active projects' returns. (packages/ui/unified-chat/src/components/ProjectCard.tsx:307) (apps/web/app/chat/projects/page.tsx:274)
- Web and Desktop: project page menu, 'Project settings', bottom buttons 'Delete project', 'Duplicate', 'Export', 'Save'. (apps/web/features/projects/components/ProjectSettingsDialog.tsx:432)
- Mobile: project action menu items 'Archive', 'Restore', 'Delete' (archive only in Cloud mode); Projects tab shows 'No archived projects' text. (apps/mobile/src/features/projects/useProjectActions.ts:118) (apps/mobile/app/(app)/(tabs)/projects.tsx:421)
- CLI: 'agi projects delete <project> [--yes] [--json]' and 'agi projects archive <project> [--undo] [--json]'. (apps/cli/src/lib.rs:1336)
- VS Code: command 'Delete project' (agi-workforce.deleteProject) and the project actions menu item '$(trash) Delete project'. (apps/extension-vscode/src/features/projects/projectActions.ts:34) (apps/extension-vscode/src/features/projects/projectActions.ts:168)
- Chrome: no lifecycle action; the project list hides archived projects. (apps/extension/src/features/cloud-bridge/projectsClient.ts:164)

**Before you start**

- Signed in Cloud account and the project owned by the person (owner-only routes).
- Delete is refused while an active legal hold covers the project or one of its files.
- Duplicate needs room in the plan's project limit and cannot copy the Health space.

**Screens and controls**

- Delete confirmation on Web settings dialog: title 'Delete project?' naming the project, files and that chats move to 'All Chats'. (apps/web/features/projects/components/ProjectSettingsDialog.tsx:226)
- Project card Delete confirmation 'Delete "{name}"?' with 'This cannot be undone.' (packages/ui/unified-chat/src/components/ProjectCard.tsx:292)
- Mobile Alert 'Delete project?' (Cloud: deleted from all devices, chats stay in the chat list; Local: deleted from this device). (apps/mobile/src/features/projects/useProjectActions.ts:145)
- CLI prompt names the consequence and skips with --yes. (apps/cli/src/lib.rs:3591)
- VS Code modal 'Delete "{title}"?' with a consequence detail and a 'Delete project' button. (apps/extension-vscode/src/features/projects/projectActions.ts:485)
- Export is a link with the download attribute to /api/projects/{id}/export. (apps/web/features/projects/components/ProjectSettingsDialog.tsx:464)

**Journey**

1. Archive: open the card menu and press Archive; the project leaves the active list at once and the server is updated; on failure it comes back with the toast 'Failed to archive project'.
2. Restore: press 'Archived ({count})', open the card menu and press Unarchive.
3. Duplicate: open Project settings and press Duplicate; the button reads 'Duplicating…'; a toast says 'Project duplicated with {count} files.' and the list refreshes.
4. Export: press Export; the browser downloads a file named like 'project-name-export.json'.
5. Delete: press Delete project, read the consequence, confirm; the project and its files go, chats stay unfiled, toast 'Project deleted'.
6. Import: not possible.

**What the person sees and gets**

- Toasts: 'Project duplicated.', 'Project duplicated with {count} file(s).', 'Could not duplicate the project.', 'Project deleted', 'Failed to delete project', 'Failed to archive project'. (apps/web/features/projects/components/ProjectSettingsDialog.tsx:152) (apps/web/app/chat/projects/page.tsx:107)
- Mobile toast 'Project archived' with Undo, 'Project restored'. (apps/mobile/src/features/projects/useProjectActions.ts:120)
- CLI prints 'Deleted project ...' or 'Archived ...' or 'Unarchived ...', or 'Left the project in place.' (apps/cli/src/lib.rs:3598)
- Export output: JSON with version, exportedAt, project and knowledgeFiles (name, type, size, checksum, summary, source, added time, version, extracted text); not the chats and not the file bytes. (apps/web/app/api/projects/[id]/export/route.ts:56)
- Legal hold refusal: forbidden error with a hold message. (apps/web/lib/services/legal-hold-gate.ts:592)

**Settings**

- Project archived flag (isArchived) and imported source field importedFrom (claude, openai, manual) exist on the project; no screen sets importedFrom. (packages/contracts/cloud-contracts/src/projects.ts:12) (apps/web/app/api/projects/[id]/route.ts:33)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Archive and unarchive through the project update (isArchived), owner only, on Web, Mobile (Cloud mode) and CLI. (apps/web/app/chat/projects/page.tsx:98) (apps/mobile/src/features/projects/store.ts:510) (apps/cli/src/cloud/mod.rs:562)
- Delete is a soft delete: sets deleted_at on the project, marks its knowledge files deleted, and unfiles its chats, all in one transaction. (apps/web/lib/server/project-deletion.ts:142) (apps/web/lib/server/project-deletion.ts:102) (apps/web/lib/server/project-deletion.ts:116)
- A legal hold refuses delete and records a deletion_blocked_by_legal_hold audit event. (apps/web/lib/server/project-deletion.ts:33) (apps/web/lib/services/legal-hold-gate.ts:575)
- Duplicate copies name (with '(copy)' suffix), description, instructions, colour and carried columns including the global-memory flag, plus non-deleted knowledge files, inside one transaction guarded by the plan's project limit; Health cannot be duplicated. (apps/web/app/api/projects/[id]/duplicate/route.ts:23) (apps/web/app/api/projects/[id]/duplicate/route.ts:68) (apps/web/app/api/projects/[id]/duplicate/route.ts:119)
- Export route returns an attachment with Content-Disposition and no-store, and records data_exported on the audit trail. (apps/web/app/api/projects/[id]/export/route.ts:77) (apps/web/app/api/projects/[id]/export/route.ts:87)
- Delete on CLI, Mobile, VS Code, Web with a confirmation that names the consequence. (apps/cli/src/lib.rs:3580) (apps/mobile/src/features/projects/useProjectActions.ts:141) (apps/extension-vscode/src/features/projects/projectActions.ts:479)
- Mobile cloud delete is a tombstone pushed through projects sync, which also releases contents and checks legal hold. (apps/mobile/src/features/projects/store.ts:468) (apps/web/app/api/projects/sync/route.ts:212)

**Incomplete**

- The brief marks Export as not applicable, but the route, button and a test exist; the brief is behind the code. (apps/web/app/api/projects/[id]/export/route.ts:14)
- Export omits conversations and file bytes, which the brief's Should for S23.31 asks to include. (apps/web/app/api/projects/[id]/export/route.ts:56)
- The brief marks Archive on Mobile as missing, but the Mobile menu has Archive and Restore for Cloud projects. (apps/mobile/src/features/projects/useProjectActions.ts:118)
- Delete wording says 'permanently deleted' and 'cannot be undone' while the code only sets deleted_at; restore is not offered anywhere in the apps. Mobile says 'It cannot be restored from the app.' (apps/web/features/projects/components/ProjectSettingsDialog.tsx:231) (apps/mobile/src/features/projects/useProjectActions.ts:146)
- Web archive buttons do not use a confirm step; archive is reversible so this may be intended. [inferred] (apps/web/app/chat/projects/page.tsx:98)
- VS Code has no Archive or Restore; Chrome has none of the actions. (apps/extension-vscode/src/features/projects/projectActions.ts:168)
- Removing a file from an archived project is blocked by the query (is_archived=false), so restore first. (apps/web/lib/server/project-deletion.ts:53)

**Present but disconnected or switched off**

- importedFrom is accepted and carried by duplicate and PUT (owner only), but nothing in the apps sets it from an import. (apps/web/app/api/projects/[id]/duplicate/route.ts:31)

**Not available**

- Import route or screen on every app (brief missing; no code found). (doc: knowledge-base/data/area-briefs/023-project-workspace.md)
- Duplicate on Mobile, CLI, VS Code, Chrome.
- Export on Mobile, CLI, VS Code, Chrome.
- Archive on VS Code and Chrome.
- A user-facing way to restore a deleted project (Recently deleted): not found. AGENTS.md section 9 expects chats and sessions to be archived or moved to Recently deleted. (doc: AGENTS.md)

## 4. Required behaviour

**Established requirements**

- Import: a user can import an existing project (from another assistant or an export file) and get its name, instructions and files. (S23.28) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.28)
- Duplicate: an owner gets a copy with settings, instructions and files. (S23.29) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.29)
- Archive and restore: archived out of the active list and restored later with contents intact. (S23.30) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.30)
- Export: an owner can export settings, instructions, files and conversations as a downloadable file. (S23.31) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.31)
- Delete: after confirming, files are removed and chats are kept unfiled. (S23.32) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.32)
- An action a user cannot undo asks first and names the consequence; agents never destroy user data on their own; permanent removal only from an explicit user action naming what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Archive removes the project from the active list and Unarchive returns it with files and settings unchanged; an editor's archive request is refused.
2. Duplicate creates a project named 'X (copy)', copies non-deleted files, keeps the global-memory flag, copies no chats, and fails with the plan limit message when the limit is reached.
3. Duplicate of the Health space is refused.
4. Export downloads a JSON attachment for an owned project and is refused with not found for a project the caller does not own.
5. Delete asks for confirmation naming the files and chats; afterwards the project is gone from every list, its chats appear unfiled, and a held project returns the legal-hold refusal.
6. CLI delete without --yes asks before deleting; with --yes it deletes; archive --undo restores.
7. Import offers a way to upload another assistant's export and creates a project with name, instructions and files (once built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A deleted project should be recoverable for a period, since deleted_at is kept and AGENTS.md asks for Recently deleted. [inferred]
- Export should include conversations to meet the brief's Should. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build import for claude and openai exports using the existing importedFrom values.
- [proposed] Add Duplicate, Export and Archive to Mobile, CLI and VS Code where the product wants parity.
- [proposed] Offer a Recently deleted view for projects and reword the delete text to match what the code does.
- [proposed] Hide Duplicate, Export and Delete from editors on shared projects.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:PUT /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Update including isArchived (owner only). |
| endpoint | api:DELETE /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Soft delete through retireOwnedProject; legal hold refusal. |
| endpoint | api:POST /api/projects/[id]/duplicate | `apps/web/app/api/projects/[id]/duplicate/route.ts` | Copy project and files with limit guard. |
| endpoint | api:GET /api/projects/[id]/export | `apps/web/app/api/projects/[id]/export/route.ts` | JSON attachment with audit event. |
| endpoint | api:POST /api/projects/sync | `apps/web/app/api/projects/sync/route.ts` | Mobile sync batch including archive and tombstone delete. |
| service | project-deletion | `apps/web/lib/server/project-deletion.ts` | Soft delete, release files, unfile chats, legal hold checks. |
| service | legal-hold-gate | `apps/web/lib/services/legal-hold-gate.ts` | Refuses held deletions and audits it. |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Delete project, Duplicate, Export buttons and confirmations. |
| screen | Projects list page | `apps/web/app/chat/projects/page.tsx` | Archive, Unarchive, Delete handlers and the archived toggle. |
| component | ProjectCard | `packages/ui/unified-chat/src/components/ProjectCard.tsx` | Shared card menu with Archive, Unarchive, Delete. |
| component | ProjectGallery | `packages/ui/unified-chat/src/components/ProjectGallery.tsx` | Shared gallery passing archive and delete callbacks. |
| service | managed-cloud-projects (web) | `apps/web/features/projects/services/managed-cloud-projects.ts` | Client calls for update and delete. |
| schema | ManagedCloudProject contract | `packages/contracts/cloud-contracts/src/projects.ts` | isArchived, importedFrom (claude, openai, manual), duplicate response. |
| schema | Migration 0053 projects contract | `apps/web/db/neon/0053_projects_managed_cloud_contract.sql` | imported_from column with check on claude, openai, manual. |
| table | table:user_projects | `apps/web/lib/projects.ts` | Project row with is_archived, deleted_at, imported_from. |
| table | table:project_knowledge_files | `apps/web/lib/server/project-deletion.ts` | Files soft deleted with the project; copied on duplicate. |
| hook | mobile useProjectActions | `apps/mobile/src/features/projects/useProjectActions.ts` | Mobile menu: Archive, Restore, Delete with alert. |
| store | mobile project store | `apps/mobile/src/features/projects/store.ts` | setProjectArchived and deleteProject; Cloud uses tombstone sync, Local removes on device. |
| command | agi projects delete and archive | `apps/cli/src/lib.rs` | CLI subcommands with --yes and --undo. |
| service | CLI cloud project calls | `apps/cli/src/cloud/mod.rs` | delete_project and set_project_archived with local cache update. |
| command | VS Code deleteProject | `apps/extension-vscode/src/features/projects/projectActions.ts` | Modal confirm, progress, retry on recoverable failure. |
| service | VS Code delete consequence text | `apps/extension-vscode/src/features/projects/projectPresentation.ts` | Names knowledge files and chats affected. |
| service | Chrome projects client | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Lists projects, hides archived ones; no lifecycle actions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web archive: optimistic local update, then PUT with isArchived; reverted with a toast on failure. | device and our servers | apps/web/app/chat/projects/page.tsx:98 |
| Server tries the owner update (user must equal owner); a miss for a non-owner leads to editor resolution and the owner-only refusal. | our servers | apps/web/app/api/projects/[id]/route.ts:256 |
| Duplicate: server loads the owned source, refuses Health, checks the plan project limit, inserts the copy and its files in one transaction. | our servers | apps/web/app/api/projects/[id]/duplicate/route.ts:55 |
| Export: server reads the owned project and its files and returns the JSON attachment; browser saves it. | device and our servers | apps/web/app/api/projects/[id]/export/route.ts:21 |
| Delete: server opens a transaction, serialises with legal holds, sets deleted_at, marks files deleted, unfiles chats; a hold aborts with forbidden. | our servers | apps/web/lib/server/project-deletion.ts:133 |
| CLI archive and delete call the same project routes and update the local project cache file. | device and our servers | apps/cli/src/cloud/mod.rs:511 |
| Mobile Cloud delete or archive edits the local cloud project store and marks it for sync; the sync route applies it with a version check. | device and our servers | apps/mobile/src/features/projects/store.ts:468 |
| Mobile Local project delete removes the project from the device store only. | device | apps/mobile/src/features/projects/store.ts:484 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Archived flag and deleted_at on the project | table:user_projects | Yes, read by all signed-in apps | Row kept with deleted_at; no purge job found in the code read. |
| Knowledge file rows | table:project_knowledge_files | Through the API | Marked deleted on project delete; storage object cleanup goes through a transaction and outbox (per test names), not verified here. |
| Exported JSON | The user's download folder | No | Kept by the user. |
| CLI project cache | CLI config directory | Refreshed from the account | Entry removed on delete. |
| Audit events data_exported and deletion_blocked_by_legal_hold | security_audit_logs | Server only | unknown |

**Models and providers.** No model or provider takes part in archive, duplicate, export or delete. Extracted text in an export comes from file indexing done earlier. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud: signed-in account for all server actions. Mobile Local projects need no account and are deleted on the device. |
| Permissions | Owner only for duplicate, export, delete and archive; editors and members get not found or a refusal. The role does not matter for the owner. (apps/web/app/api/projects/[id]/duplicate/route.ts:55) (apps/web/app/api/projects/[id]/export/route.ts:21) |
| Subscription | Duplicate is limited by the plan's project limit; zero blocks it. Archive, export and delete have no plan rule found. (apps/web/app/api/projects/[id]/duplicate/route.ts:74) |
| Limits and metering | Project count guarded in the database by assert_user_resource_limit on duplicate. Rate limit class chat-conversation on these routes. (apps/web/app/api/projects/[id]/duplicate/route.ts:100) (apps/web/lib/rate-limit.ts:282) |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local projects can be deleted on the device; archive is Cloud only (returns early outside Cloud). Duplicate, export and import do not exist for Local. CLI project commands use the account. (apps/mobile/src/features/projects/store.ts:511) (apps/cli/src/cloud/mod.rs:511) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Archive failure | Web reverts the item and toasts 'Failed to archive project'. | apps/web/app/chat/projects/page.tsx:106 |
| Empty archived view | Shows 'No archived projects.' | apps/web/app/chat/projects/page.tsx:403 |
| Duplicate in progress | Button disabled and reads 'Duplicating…'. | apps/web/features/projects/components/ProjectSettingsDialog.tsx:447 |
| Duplicate limit reached | Validation error with the project limit message. | apps/web/app/api/projects/[id]/duplicate/route.ts:74 |
| Health space | Duplicate refused with a conflict message; Duplicate button hidden; delete text differs. | apps/web/app/api/projects/[id]/duplicate/route.ts:68 |
| Legal hold | Delete refused and audited; file removal on a held file throws a hold error. | apps/web/lib/server/project-deletion.ts:33 |
| Delete failure | Web toasts 'Failed to delete project' and does not remove it; VS Code offers Retry on recoverable failures. | apps/web/features/projects/components/ProjectSettingsDialog.tsx:218; apps/extension-vscode/src/features/projects/projectActions.ts:502 |
| Already deleted | A second delete succeeds quietly if the project was already deleted by the same owner; unknown project returns not found. | apps/web/lib/server/project-deletion.ts:152 |
| Concurrent change | Mobile sync conflicts return the current row; web update uses If-Match versions. | apps/web/app/api/projects/sync/route.ts:224; apps/web/app/api/projects/[id]/route.ts:306 |
| Offline | Mobile edits stay in the store until sync (marked for sync). Web and CLI have no offline queue found. | apps/mobile/src/features/projects/store.ts:476 |
| Cancel | Cancelling the confirmation leaves the project; CLI prints 'Left the project in place.' | apps/cli/src/lib.rs:3598 |
| Accessibility | Export is a real link; narrow layout keeps all actions reachable (tested); screen-reader coverage of archive menu not established. | apps/web/features/projects/components/ProjectSettingsDialog.tsx:464 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/duplicate/route.test.ts`: Copy of settings and files, name suffix, global-memory kept, owner only, plan limit, no chats copied.
- `apps/web/app/api/projects/[id]/export/route.test.ts`: Download, owner only, file-read failure, safe file name, audit record.
- `apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts`: Soft delete of files, legal hold refusal, failure paths.
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.delete.test.tsx`: Delete warning, DELETE call, failure keeps project, export link, narrow layout.
- `apps/web/app/api/projects/__tests__/route.shared-editor.test.ts`: Editor cannot archive.
- `apps/web/app/api/projects/sync/__tests__/route.contract.test.ts`: Projects sync contract.
- `apps/mobile/src/features/projects/__tests__/ProjectDetailMenu.test.tsx`: Mobile Archive, Restore, Delete with consequence and cancel.
- `apps/cli/src/lib.rs`: A parse test for 'agi projects delete ... --yes' (test near line 10113).

**Test scenarios**

- **Archive and restore**
  1. Archive a project from the card menu.
  2. Open 'Archived (1)'.
  3. Unarchive it.
  - Expected: It leaves, then returns to the active list with files and settings intact.
- **Duplicate**
  1. Open Project settings and press Duplicate on a project with two files.
  - Expected: A project 'X (copy)' with two files appears; chats are not copied.
- **Export**
  1. Press Export.
  - Expected: A JSON file downloads with project and knowledgeFiles.
- **Delete keeps chats**
  1. Delete a project that has chats.
  - Expected: Project is gone; chats appear unfiled.
- **Legal hold**
  1. Place a hold on a project file, then delete the project.
  - Expected: Delete is refused and audit shows deletion_blocked_by_legal_hold.
- **CLI**
  1. Run 'agi projects archive NAME', then with --undo, then 'agi projects delete NAME' without --yes.
  - Expected: Archived flag changes; delete asks first.

**Where to look when it fails**

- Audit event types data_exported and deletion_blocked_by_legal_hold in security_audit_logs.
- Logger line 'Failed to delete project' and error 'Failed to duplicate the project'.
- Error ProjectContentHeldError and the text 'Project sources changed while their removal was being committed.'
- Rows in user_projects with deleted_at set.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)

## 10. Gaps and dependencies

- **Import is not built; only the importedFrom value exists.** Affects: People moving from other assistants, all apps. Evidence: apps/web/db/neon/0053_projects_managed_cloud_contract.sql:91. Work needed: Parse exports, create project with name, instructions and files, set importedFrom, add UI and tests.
- **Export lacks conversations and file contents beyond extracted text.** Affects: Web and Desktop owners. Evidence: apps/web/app/api/projects/[id]/export/route.ts:56. Work needed: Decide scope, add chats, test size limits.
- **No recovery path for deleted projects and the wording says permanent.** Affects: All apps. Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:231; apps/web/lib/server/project-deletion.ts:142. Work needed: Recently deleted view or accurate wording.
- **Duplicate and Export are missing on Mobile, CLI, VS Code and Chrome; Archive is missing on VS Code and Chrome.** Affects: those apps. Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md. Work needed: Product decision then clients.
- **Brief is behind the code on Export (Web) and on Mobile Archive.** Affects: Planning accuracy. Evidence: apps/mobile/src/features/projects/useProjectActions.ts:118. Work needed: Update the brief.
- **Editors are shown owner-only buttons on Web.** Affects: Editors. Evidence: apps/web/features/projects/components/ProjectSettingsDialog.tsx:34. Work needed: Gate by owner flag.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- table:user_projects
- table:project_knowledge_files
- api:POST /api/projects/[id]/duplicate
- api:GET /api/projects/[id]/export
- api:DELETE /api/projects/[id]
- F023-07

## Unknown

- Whether a job later purges soft-deleted projects or storage objects.
- Whether Desktop (Tauri) has its own lifecycle UI.
- What CLI project commands do in Local-only privacy mode.
- How long audit rows and soft-deleted rows are kept.
- Whether the Chrome extension should offer any lifecycle action (brief says unverified).
- Whether Web archive should ask for confirmation.
