---
id: "F037-12"
type: "feature"
title: "Notebook allowance, storage and export"
aliases: ["Storage meter", "Knowledge storage", "File storage used", "Notebook allowance", "Notebook export", "S37.35", "S37.39"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.35", "S37.39"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "table:project_knowledge_files", "table:media_assets", "F037-07", "F037-09"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-12 Notebook allowance, storage and export

Web and Desktop show how many files a notebook holds and, when known, the account's file storage used against its plan limit, in the project settings file list. The meter covers the whole account, not one notebook. No per-notebook generation allowance and no notebook export exist.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.35](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3735), [S37.39](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3739).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows the file count against the 40-file cap and the account's used and total file storage on the project's knowledge file panel; the server uses the same numbers to refuse uploads over the plan limit.

**Why it exists.** People need to know why an upload is refused. The brief also asks for a notebook's own generation allowance and a notebook export (S37.39, S37.35); neither was built.

**Who uses it.** Anyone adding files to a notebook on Web or Desktop.

**Problems it solves**

- Uploads failing without warning.
- Not knowing how much of the plan's storage is used.

**Use cases**

- Check storage before adding large PDFs.
- See that a notebook is full at 40 files.
- Understand the message when an upload is refused for being over the plan's storage.

## 2. User experience

**Where to find it**

- Web and Desktop: project settings dialog, file list header: '<n> of <max> files · <size> KB · <used> of <limit> storage used' (apps/web/features/projects/components/KnowledgeFilesPanel.tsx:225-250; mounted at ProjectSettingsDialog.tsx:414).
- Not shown on the Sources tab list (SourcesPanel.tsx has no storage text).
- Mobile, CLI, VS Code, Chrome: no meter found.
- Allowance and export: no screen.

**Before you start**

- Signed in with access to the project; both numbers must be known for the storage text to show.

**Screens and controls**

- Header line in the file list; the storage figure turns primary-coloured at 90 percent or more.

**Journey**

1. Open project settings.
2. Read the header line of the file list.
3. Upload; if over the limit an error message states the plan's limit.

**What the person sees and gets**

- Header text, a full-project message at the cap (KnowledgeCapacityVisible.test.tsx:57), and the server's limit error: for a plan over its limit '<Plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' (free-plan-entitlements.ts:43-46); the 'Your current subscription does not include file storage. Choose an eligible plan and try again.' text appears only when planLabel() is empty, i.e. the tier lacks the managed_chat capability, yet still has a numeric limit (free-plan-entitlements.ts:38-46,48-52).

**Settings**

- The plan decides the limit; per-plan values are in the billing catalog (packages/contracts/types/src/billing-catalog.ts:527,617-715).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: list route returns files and the meter in one response (apps/web/app/api/projects/[id]/knowledge-files/route.ts:52,60-65).
- Meter sums all of the user's media_assets in the workspace (including large chat attachments, excluding small temporary-chat files) plus live project knowledge files (not deleted, not superseded, project not deleted), and reads the plan limit (apps/web/lib/server/file-storage.ts:31-51,53-60,77-91).
- Upload checks the same limit (file-storage.ts:63-75). The same assertFileStorageAvailable limit also gates chat attachments and chat file intake, not just project knowledge uploads; the storage figure is a shared quota across chat files, Library and projects [chat-attachment-completion.ts:388, chat-file-intake/seal.ts:342].
- The meter counts chat attachments and library media, not only project files; temporary-chat attachments larger than MAX_CHAT_ATTACHMENT_BYTES count [file-storage.ts:31-40].
- Free has a 500 MiB storage cap, so Free shows the meter and gets the plan message [billing-catalog.ts:619; free-plan-entitlements.ts:38-46].
- A failed meter read does not break the file list (storage-meter-matches-cap.test.ts:55).
- The cap of 40 files is shown (suite-contracts.ts:502; KnowledgeCapacityVisible.test.tsx).

**Incomplete**

- The meter is account-wide, not per notebook (file-storage.ts:30-51 sums all projects of the user and workspace).
- Shown only in the settings dialog, not on the Sources tab.

**Present but disconnected or switched off**

- none found.

**Not available**

- Per-notebook generation or compute allowance: no code found on any app.
- Notebook export: no code found; the founder list says the leaders have no notebook export (docs/decisions/2026-09-27-founder-decisions.md:102-105).

## 4. Required behaviour

**Established requirements**

- Notebooks have their own generation or compute allowance shown to the user. (source: brief S37.39 (status missing on all apps))
- The user can export a notebook (sources, notes, chats) as a file. Marked not applicable. (source: brief S37.35)
- No notes, saved answers or notebook export, as the leaders do not offer them. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:102-105)
- Aggregate storage quota across all of a user's projects, enforced in the upload path. (source: doc: docs/decisions/wire-or-cut.md:375-379 (numbers there are older; the catalog is current))
- Free usage screens show only Upgrade, never meters. (source: owner memory entry 'Free usage = Upgrade only'; not a repository document; its relation to this storage meter is unknown)

**Acceptance criteria**

1. The header shows the file count against 40.
2. With a known plan limit the header shows used and total storage.
3. At 90 percent or more the storage text changes colour.
4. An upload that would exceed the limit is refused with the plan message.
5. A failed meter read still shows the file list without storage text.
6. With no storage cap the storage text is not shown.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because the meter is account-wide it will not match what a person sees in one notebook; labelling matters.
- [inferred] Showing the meter on a Free plan may conflict with the Free-usage rule in the owner's notes; to be confirmed.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether notebook allowance is wanted at all, since plan usage is already metered per account.
- [proposed] Show the meter on the Sources tab where people add files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Header with count and storage text |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Hosts the panel (line 414) |
| endpoint | knowledge-files list | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Returns files plus storage meter |
| service | file-storage | `apps/web/lib/server/file-storage.ts` | Sum of bytes, plan allowance, meter, upload check (assertFileStorageAvailable, also called by chat-attachment-completion.ts:388 and chat-file-intake/seal.ts:342) |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | Plan limit lookup and limit messages |
| config | billing-catalog | `packages/contracts/types/src/billing-catalog.ts` | knowledgeStorageBytes per plan (527, 617-715) |
| config | MAX_PROJECT_KNOWLEDGE_FILES | `packages/contracts/types/src/suite-contracts.ts` | File cap of 40 shared by server and UI |
| service | entitlement-resolution | `apps/web/lib/services/entitlement-resolution.ts` | Resolves the entitled plan tier for the meter (imported by file-storage.ts) |
| table | project_knowledge_files | `apps/web/lib/server/file-storage.ts` | byte_count summed (lines 41-50) |
| table | media_assets | `apps/web/lib/server/file-storage.ts` | All non-deleted media assets of the user and org summed into the same total, including large chat attachments (lines 31-40) |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Registration path that checks the allowance |
| test | KnowledgeCapacityVisible.test.tsx | `apps/web/features/projects/components/__tests__/KnowledgeCapacityVisible.test.tsx` | Cap and storage text |
| test | storage-meter-matches-cap.test.ts | `apps/web/app/api/projects/[id]/knowledge-files/__tests__/storage-meter-matches-cap.test.ts` | Meter and cap use one module and scope |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Open settings; the panel requests the file list. | device and our servers | KnowledgeFilesPanel.tsx:~90-100; route.ts:23-66 |
| Server resolves the person's plan tier and its storage limit, then sums bytes of all the user's media assets (library files and chat attachments) and live project sources. | our servers | file-storage.ts:53-60,31-51,77-91 |
| The response carries files and {usedBytes, limitBytes}; the panel shows the text only if both are non-null. | device | route.ts:60-65; KnowledgeFilesPanel.tsx:236 |
| On upload the server rechecks used plus incoming against the limit and rejects with the plan message; the same check also gates chat attachments and chat file intake. | our servers | file-storage.ts:63-75; chat-attachment-completion.ts:388; chat-file-intake/seal.ts:342 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Byte counts of files | table project_knowledge_files (byte_count) and media_assets (byte_size; includes library media and chat attachments, with temporary-chat attachments counted only above MAX_CHAT_ATTACHMENT_BYTES) | Server-side | Deleted or superseded rows are excluded from the sum (file-storage.ts:47-49) |
| Plan limit | billing catalog in code; entitled tier from entitlement data | Server-side | n/a |

**Models and providers.** No model involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user-scoped database. |
| Permissions | Anyone who can read the project sees the list; the meter is computed for the caller (route.ts:27,52). |
| Subscription | Limit per plan from the one subscription system (resolveEntitledPlanTier). Free has a 500 MiB cap (billing-catalog.ts:619). Some plans are unlimited or negotiated (billing-catalog.ts:585,602,715). |
| Limits and metering | Used bytes summed live, not cached; 40 files per project. The storage figure is one quota shared across chat files, Library and projects. |
| Feature flags | none found. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Local-only and own-key use are shown uncapped in the catalog because nothing is stored on the platform (billing-catalog.ts:585-602, with doc: docs/decisions/wire-or-cut.md:379); a notebook itself is not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan read fails | limitBytes null, storage text hidden | file-storage.ts:79-83 |
| Usage read fails | usedBytes null, text hidden, file list still returned | file-storage.ts:84-89 |
| At 90 percent | Storage text coloured | KnowledgeFilesPanel.tsx:~240 |
| At file cap | Panel says the project is full and how to make room | KnowledgeCapacityVisible.test.tsx:57 |
| No storage cap | Nothing shown | KnowledgeCapacityVisible.test.tsx:93 |
| Over the plan's storage limit | Upload refused with '<Plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.'; the error is thrown only when limitBytes is non-null | free-plan-entitlements.ts:38-52 |
| Tier with no managed-chat plan label but a numeric limit | Upload refused with the 'does not include file storage' message (planLabel() empty); no catalog plan has a limit of 0 | free-plan-entitlements.ts:38-46; billing-catalog.ts:619 |
| Offline | not handled in the code read | KnowledgeFilesPanel.tsx fetch path has only an error load state |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/KnowledgeCapacityVisible.test.tsx`: File cap text, full state, shared cap constant, storage text, hidden when uncapped
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/storage-meter-matches-cap.test.ts`: One module for meter and cap, live rows of active workspace, same plan sizing, meter failure isolation

**Test scenarios**

- **Meter shown**
  1. Sign in on a plan with a storage cap.
  2. Open project settings.
  - Expected: Header shows 'used of limit storage used'.
- **Over the limit**
  1. Upload files until used plus a new file exceeds the limit.
  - Expected: Upload refused with the plan's limit message ('<Plan> accounts include X of file storage, shared by your Library and project sources...').
- **Account-wide**
  1. Add a file in notebook A.
  2. Open settings of notebook B.
  - Expected: Used storage includes notebook A's file, and also library media and chat attachments (temporary-chat attachments only above MAX_CHAT_ATTACHMENT_BYTES) [file-storage.ts:31-40].
- **File cap**
  1. Add 40 files.
  - Expected: Panel says the project is full; a 41st is refused.
- **Absence checks**
  1. Look for a per-notebook allowance and an export control.
  - Expected: None present.

**Where to look when it fails**

- Log 'File storage meter: plan read failed' and 'usage read failed' (file-storage.ts:82,87).
- API response field storage on the list route.
- Tables project_knowledge_files, media_assets.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No per-notebook generation allowance** Affects: All apps. Evidence: no code found; brief S37.39. Work needed: Decide if wanted; define against the one subscription system.
- **No notebook export** Affects: All apps. Evidence: no code found; brief S37.35. Work needed: Only if the owner reverses the founder decision.
- **Meter hidden on the Sources tab and on other apps** Affects: Web Sources tab, Mobile, CLI. Evidence: SourcesPanel.tsx has no storage text. Work needed: Add where people upload.
- **Meter is account-wide but sits in a notebook screen** Affects: Web, Desktop. Evidence: file-storage.ts:30-51. Work needed: Label as account storage.
- **Possible conflict with the Free-usage rule** Affects: Free plan on Web. Evidence: owner memory note, relation unknown; Free has a 500 MiB cap so the meter shows on Free (billing-catalog.ts:619). Work needed: Owner confirms.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- table:project_knowledge_files
- table:media_assets
- F037-07
- F037-09

## Unknown

- Exact number format and line of the 90 percent rule beyond what was seen.
- Whether the storage text is allowed on the Free plan under the owner's Free-usage rule.
- Whether Mobile or CLI show storage anywhere.
- Any plan for notebook allowance beyond the brief.

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Meter sums library media and project sources over the active workspace (file-storage.ts:30-60)" The code shows: The media_assets part is not just library files. It sums every non-deleted media asset of the user and org, and for temporary chats it counts only chat attachments larger than MAX_CHAT_ATTACHMENT_BYTES. So chat attachments count toward the limit. Project sources count only if the project and the file are not deleted and the file is not superseded. (apps/web/lib/server/file-storage.ts:31-51). **Corrected:** The meter sums all of the user's media_assets in the workspace (including large chat attachments, excluding small temporary-chat files) plus live project knowledge files.
- **Wrong (section 2/8):** "Plan with no storage: upload refused with 'does not include file storage' message (free-plan-entitlements.ts:43)" The code shows: That message is returned only when planLabel() is empty, i.e. the tier lacks the managed_chat capability. The error is thrown only when limitBytes is non-null. A normal plan over its limit gets '<Plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' No catalog plan has a storage limit of 0 (Free is 500 MiB). (free-plan-entitlements.ts:38-46,48-52; billing-catalog.ts:619). **Corrected:** Over-limit uploads on a paid or Free plan are refused with the message '<Plan> accounts include X of file storage, shared by your Library and project sources...'. The 'does not include file storage' text appears only for a tier with no managed-chat plan label that still has a numeric limit. Free has a 500 MiB cap, so Free shows the meter and gets the plan message.

**Facts the page missed**

- The same assertFileStorageAvailable limit also gates chat attachments and chat file intake, not just project knowledge uploads. The storage figure is a shared quota across chat files, Library and projects: chat-attachment-completion.ts:388, chat-file-intake/seal.ts:342.
- The meter counts chat attachments and library media, not only project files: file-storage.ts:31-40 (temporary-chat attachments larger than MAX_CHAT_ATTACHMENT_BYTES count). The page's 'library media' wording and its test scenario 'Account-wide' miss this.
- The over-limit error text for ordinary plans is '<Plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' (free-plan-entitlements.ts:43-46). The page lists only the no-plan message, and it describes that one wrongly.
