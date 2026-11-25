---
id: "F023-09"
type: "feature"
title: "Project activity history"
aliases: ["Project activity history", "Project history", "Activity log", "Change log", "S23.35 in the area brief"]
area: "23 Project workspace"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S23.35"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "F023-07", "F023-08", "table:security_audit_logs", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-09 Project activity history

A planned log on each project of what changed and who changed it: files added or removed, setting and instruction edits, sharing changes and chats, with who and when. It is not built on any app. Only server audit events for sharing, export and legal-hold refusals exist, and no screen or route reads them for a project.

Area: [23. Project workspace](README.md). Requirement items: [S23.35](../../10-requirements/capabilities/023-project-workspace.md#s2335).

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

**What it does.** Would show a per-project timeline of changes with the person and time. Today nothing shows it. (doc: knowledge-base/data/area-briefs/023-project-workspace.md)

**Why it exists.** On a shared project several people can change instructions, files and access, so people need to see who changed what. (doc: knowledge-base/data/area-briefs/023-project-workspace.md) [inferred]

**Who uses it.** Owners, editors and organisation admins of shared projects (intended). No one can use it yet.

**Problems it solves**

- Not knowing who changed the instructions of a shared project.
- Not seeing when sharing was widened.
- Finding out when a file was added or removed.

**Use cases**

- An owner checks who edited the instructions after answers changed.
- An admin checks when a project was shared with the whole workspace.
- A member sees that a colleague added a file yesterday.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available. No screen, command or route for project activity was found. (doc: knowledge-base/data/area-briefs/023-project-workspace.md)
- The project page has tabs and panels for chats, files, artifacts, work and routines but no activity tab. (apps/web/app/chat/projects/[id]/page.tsx:1134) (apps/web/app/chat/projects/[id]/page.tsx:1238)

**Before you start**

- Not applicable until built.

**Screens and controls**

- None exist.

**Journey**

1. Not available. A person who wants this today must ask an administrator to read the security audit log; no project screen shows it. [inferred]

**What the person sees and gets**

- None for the person. The server writes audit rows for share, unshare, access change, export and held deletion. (apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:89) (apps/web/app/api/projects/[id]/export/route.ts:77) (apps/web/lib/services/legal-hold-gate.ts:575)

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server audit events are recorded for project_shared, project_unshared, project_member_access_changed, data_exported and deletion_blocked_by_legal_hold into security_audit_logs. (apps/web/lib/security-audit.ts:95) (apps/web/lib/security-audit.ts:270)
- Project rows carry created_at and updated_at; files carry added_at and added_by_user_id. These are data for a future history but not a log. (apps/web/app/api/projects/[id]/duplicate/route.ts:119) (apps/web/app/api/projects/[id]/export/route.ts:38)

**Incomplete**

- Audit events cover only sharing, export and held deletion; instruction and setting edits, file add and remove, and chats are not recorded as audit events in the routes read. [inferred] (apps/web/app/api/projects/[id]/route.ts:196)
- Update of a project records only updated_at, not who or what changed. (apps/web/app/api/projects/[id]/route.ts:129)

**Present but disconnected or switched off**

- Audit rows exist but no project-scoped reader or screen uses them. No project activity code found. (search of apps and packages for project_activity or projectActivity returned nothing)

**Not available**

- Project activity history on all six apps. (doc: knowledge-base/data/area-briefs/023-project-workspace.md)

## 4. Required behaviour

**Established requirements**

- A project shows a history of what changed (files added or removed, settings and instruction edits, sharing changes, chats) with who and when. (S23.35) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.35)

**Acceptance criteria**

1. After an owner edits instructions, the project history shows an entry with the editor's name and time.
2. Adding and removing a file each create an entry naming the file.
3. Sharing, audience change, a person's access change and stop sharing each create an entry.
4. A member who cannot access the project cannot read its history.
5. History is available on each app that shows the project page, or the brief records where it is not offered.
6. History survives project archive and is removed or kept according to the project's deletion rules.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Entries should be written on the server in the same transaction as the change so they cannot be skipped. [inferred]
- The reader should apply the same sharing visibility as the project. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a project_activity table with project id, actor, kind, summary and time, written by the project, file and sharing routes.
- [proposed] Reuse the existing audit event writer for sharing entries and add a project-scoped read route.
- [proposed] Add an Activity tab on the Web project page, then Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | recordAuditEvent and event types | `apps/web/lib/security-audit.ts` | Writes security audit rows; defines project_shared, project_unshared, project_member_access_changed, data_exported. |
| table | table:security_audit_logs | `apps/web/lib/security-audit.ts` | Stores audit rows; no project-scoped reader found. |
| endpoint | api:PUT /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts` | Source of sharing audit events. |
| endpoint | api:GET /api/projects/[id]/export | `apps/web/app/api/projects/[id]/export/route.ts` | Source of data_exported event. |
| service | legal-hold-gate refuseHeldDeletion | `apps/web/lib/services/legal-hold-gate.ts` | Source of deletion_blocked_by_legal_hold event. |
| endpoint | api:PUT /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Where instruction and setting edits happen; no audit call found. |
| endpoint | api:POST /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | File add; history write not established. |
| screen | Project detail page | `apps/web/app/chat/projects/[id]/page.tsx` | Where an Activity tab would sit; none exists. |
| screen | Mobile project page | `apps/mobile/app/(app)/projects/[id].tsx` | Where an Activity tab would sit on Mobile; none exists. |
| table | table:project_knowledge_files | `apps/web/app/api/projects/[id]/export/route.ts` | Holds added_at and version per file, partial raw material. |
| table | table:user_projects | `apps/web/lib/projects.ts` | Holds created_at and updated_at only. |
| config | Audit coverage registry | `apps/web/lib/services/audit-coverage/registry.ts` | Lists routes and reasons for audit coverage; project routes appear as own_content. |
| service | CLI project commands | `apps/cli/src/lib.rs` | No history command exists. |
| service | VS Code project actions | `apps/extension-vscode/src/features/projects/projectActions.ts` | No history action exists. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing reads or shows project history. Sharing, export and held-deletion routes write audit events on the server. | our servers | apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:86 |
| The audit writer inserts a row into security_audit_logs. | our servers | apps/web/lib/security-audit.ts:95 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audit rows for sharing, export and held deletion | security_audit_logs | Server only; not shown to apps | unknown |
| Project history entries (intended) | not built | not built | not built |

**Models and providers.** No model or provider takes part; a future history may summarise chats, which would need a decision. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable until built; would need a Cloud account because history is server data. [inferred] |
| Permissions | none found in the code for project history. Audit viewing rules for the security log were not read. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Not available; no history exists in Local or Cloud. A Local project would need a device store, which is not built. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, offline) | not handled in the code; there is no screen. | apps/web/app/chat/projects/[id]/page.tsx:1134 |
| Access to the page of a project history by a non-member | not handled in the code; the project route itself answers 404 for a project the user cannot see, which a future reader would need to follow. | apps/web/app/api/projects/[id]/route.ts:116 |
| Deleted project | not handled in the code; audit rows would remain but have no reader. [inferred] | apps/web/lib/server/project-deletion.ts:142 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/organization/shared/projects/[projectId]/__tests__/route.audit.test.ts`: The sharing audit events that a future history could reuse.
- `apps/web/app/api/projects/[id]/export/route.test.ts`: The data_exported audit record.

**Test scenarios**

- **Confirm the feature is absent**
  1. Open a project on each app and look for an Activity or History control.
  - Expected: None is found.
- **Sharing audit rows exist**
  1. Share a project and change a person's access.
  2. Read the audit log rows for the project id as an administrator.
  - Expected: Rows project_shared and project_member_access_changed exist.
- **Edit leaves no event**
  1. Edit the instructions of a project.
  2. Read the audit log for the project id.
  - Expected: No project edit event is found today (confirms the gap).
- **Future: instruction edit entry**
  1. After building, edit instructions as an editor.
  - Expected: An entry shows the editor and time.

**Where to look when it fails**

- security_audit_logs rows with event types project_shared, project_unshared, project_member_access_changed, data_exported.
- No project activity table exists; a search found none.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No project activity history on any app.** Affects: Owners, editors and admins on all six apps. Evidence: doc: knowledge-base/data/area-briefs/023-project-workspace.md (S23.35). Work needed: Define events, store, write them in the project, file and sharing routes, add a read route with the same visibility as the project, and a screen.
- **Edits, file changes and chats leave no event record.** Affects: Shared projects. Evidence: apps/web/app/api/projects/[id]/route.ts:129. Work needed: Write entries in the same transaction as each change.
- **Existing audit rows have no project-scoped reader and are server only.** Affects: Admins. Evidence: apps/web/lib/security-audit.ts:95. Work needed: Decide whether to reuse the audit table or add a table.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- F023-07
- F023-08
- table:security_audit_logs
- table:project_knowledge_files

## Unknown

- Retention and read access rules for security_audit_logs.
- Whether file add and remove routes write any audit event (not read).
- Whether chats should appear in the history, and whether history is visible to members or owners only.
- Whether the Desktop Tauri build has any history view (none found).
