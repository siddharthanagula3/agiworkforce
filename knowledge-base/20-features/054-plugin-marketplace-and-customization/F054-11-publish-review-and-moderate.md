---
id: "F054-11"
type: "feature"
title: "Publish, review and moderate"
aliases: ["Submit to the directory", "Submit this version", "Withdraw", "Plugin moderation", "/admin/plugins", "Waiting for review", "Listed", "Not approved", "plugin submissions", "version lifecycle", "S54.36 Submission and review workflow", "S54.37 Listing moderation", "S54.38 Report plugin", "S54.39 Publisher analytics", "S54.40 Commercial procurement"]
area: "54 Plugin marketplace and customization"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S54.36", "S54.37", "S54.38", "S54.39", "S54.40"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "api:POST /api/plugins/submissions", "api:DELETE /api/plugins/submissions/[id]", "api:GET /api/admin/plugin-submissions", "api:POST /api/admin/plugin-submissions/[id]", "api:POST /api/plugins/[id]/lifecycle", "table:plugin_submissions", "table:plugin_submission_files", "table:plugin_submission_installs", "table:plugin_registry_versions", "table:plugin_registry_lifecycle_events", "table:plugin_package_scans", "F054-07", "F054-09", "F054-10", "SYS-authorization-and-workspaces", "SYS-observability-and-operations", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F054-11 Publish, review and moderate

A signed-in publisher with a verified email submits their own uploaded or authored plugin for review, sees its status and can withdraw it. Platform admins approve, reject or suspend submissions and publish, deprecate, suspend or roll back registry plugin versions on /admin/plugins. Reporting, analytics and paid procurement do not exist.

Area: [54. Plugin marketplace and customization](README.md). Requirement items: [S54.36](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5436), [S54.37](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5437), [S54.38](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5438), [S54.39](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5439), [S54.40](../../10-requirements/capabilities/054-plugin-marketplace-and-customization.md#s5440).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs two linked processes: (1) community submissions with statuses pending, approved, rejected, withdrawn, suspended; (2) registry version lifecycle with statuses draft, in_review, published, deprecated, suspended and actions publish, deprecate, suspend, rollback. Both are done by platform admins on one admin page.

**Why it exists.** The directory needs human review before community plugins reach everyone, and a way to stop a bad version fast (brief: S54.36, S54.37; doc: docs/product/competitive-guidance.md:462 plugin review and emergency controls; doc: docs/decisions/2026-09-27-founder-decisions.md:105-108 publisher identity checked in the owner's review).

**Who uses it.** Publishers (any signed-in user with a verified email who has an uploaded or authored plugin) and platform staff listed in the platform-admin setting.

**Problems it solves**

- Unreviewed community code reaching all users.
- A bad version staying installable.
- No way for a publisher to see why a plugin was refused.
- Installations pinned to a withdrawn version.

**Use cases**

- Publisher presses 'Submit to the directory' and later sees 'Listed'.
- Admin rejects a submission with a reviewer note the publisher reads on the plugin page.
- Admin suspends a bad version and every installation running it is switched off.
- Admin rolls a plugin back to its previous published version.

## 2. User experience

**Where to find it**

- Publisher, web: Settings > Customize > Plugins > your uploaded or authored plugin > button 'Submit to the directory' (or 'Submit this version'), status text and 'Withdraw' (packages/ui/ui/src/directory/PluginDetailView.tsx:941-990; constants.ts:460-472).
- Publisher, desktop (public Electron app): the same hosted page; Tauri build only opens the web page (apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx:7).
- Staff, web: /admin/plugins, page title 'Plugin moderation' (apps/web/app/admin/plugins/page.tsx:15-23; apps/web/features/admin/pages/PluginModerationPage.tsx:986). Non-admins get a not-found page (page.tsx:21).
- Mobile, CLI, VS Code, Chrome: not available (no submission or moderation code found under apps/mobile/src/features/plugins, apps/cli, apps/extension-vscode or apps/extension).

**Before you start**

- Publisher: signed in, verified email, a plugin from an upload or authored source you own, and external-sharing allowed by workspace policy (apps/web/app/api/plugins/submissions/route.ts:47-56).
- Staff: user id listed in AGI_PLATFORM_ADMIN_USER_IDS (apps/web/features/admin/lib/platform-admin-access.ts:6) and requirePlatformAdmin passes on the API (lifecycle/route.ts:108,130).

**Screens and controls**

- Publisher: 'Submit to the directory' with hint 'Once it is approved, anyone can find and install it.'; confirm 'Submit for review'; 'Withdraw' with confirm 'Withdraw it'; 'Reviewer note' line (constants.ts:460-472; DirectoryPanel.tsx:687-715).
- Admin submission queue with filters 'Waiting for review', 'Listed', 'Suspended', 'Not approved'; panel buttons 'Approve', 'Reject', 'Suspend' with a required note (PluginModerationPage.tsx:583-600,804-830, buttons near 770-800).
- Admin registry section 'Registry plugins' with search 'Name, plugin id or publisher', version rows with 'Publish', 'Deprecate', 'Suspend' (reason required) and 'Roll back to <v>' (PluginModerationPage.tsx:300-340,460-490,1000-1010).

**Journey**

1. Publisher: upload or create a plugin, scan runs on submit, press 'Submit to the directory', confirm.
2. The server scans the files again; a 'block' verdict refuses; otherwise a pending submission is stored and any earlier pending submission of the same key is withdrawn.
3. Admin opens /admin/plugins, filters 'Waiting for review', opens a submission, reads files and scan result, then Approve, or Reject with a note.
4. The publisher gets a notification and sees 'Listed' or 'Not approved' with the reviewer note.
5. Publisher can 'Withdraw' a pending or listed submission.
6. Admin can Suspend a listed submission with a note, or act on registry versions.

**What the person sees and gets**

- Publisher notice (PLUGIN_SUBMITTED_NOTICE) and 'Withdrawn from the directory.' (apps/web/features/directory/constants.ts:131-133).
- Notification titles '<name> is in the plugin directory', '<name> was not approved', '<name> was taken out of the directory' (apps/web/app/api/admin/plugin-submissions/[id]/route.ts:45-60,102-115).
- Admin messages such as 'Published <v>. New installs get this version.' and 'Suspended <v>. <n> installations stopped running it.' (PluginModerationPage.tsx:256,315).
- Audit events plugin_marketplace_changed and admin_policy_changed.

**Settings**

- AGI_PLATFORM_ADMIN_USER_IDS: list of staff user ids (name only).
- None for publishers.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Submit: POST /api/plugins/submissions needs verified email and the external-sharing gate, then createSubmission scans the stored files, refuses 'block', withdraws earlier pending rows, inserts a pending row and copies the files (apps/web/app/api/plugins/submissions/route.ts:36-88; apps/web/lib/services/plugin-submission-service.ts:169-250).
- List own submissions: GET /api/plugins/submissions (route.ts:26-34; plugin-submission-service.ts:128).
- Withdraw: DELETE /api/plugins/submissions/[id] only for pending or approved rows owned by the caller (plugin-submission-service.ts:268-282; apps/web/app/api/plugins/submissions/[id]/route.ts:22-47).
- Review: GET /api/admin/plugin-submissions lists by status (limit 200); GET and POST /api/admin/plugin-submissions/[id] read files and decide approve, reject or suspend; approve withdraws a previously approved row of the same key and moves installs to the new row; suspend needs an approved row; approve and reject need a pending row (apps/web/lib/services/plugin-submission-service.ts:290-415).
- Decision writes an audit event and a notification for the publisher (apps/web/app/api/admin/plugin-submissions/[id]/route.ts:78-115).
- Approved submissions appear as community plugins others can install (apps/web/lib/services/plugin-submission-service.ts:420-455).
- Registry version lifecycle: statuses draft, in_review, published, deprecated, suspended with allowed moves draft->in_review|published, in_review->draft|published, published->deprecated|suspended, deprecated->published|suspended, suspended->published (apps/web/lib/services/plugin-lifecycle.ts:18-58).
- POST /api/plugins/[id]/lifecycle (platform admin only) accepts submit, publish, deprecate, suspend, rollback; suspend turns off installations on that version; rollback moves installs to the target (apps/web/app/api/plugins/[id]/lifecycle/route.ts:31-64,126-234; plugin-lifecycle.ts:428-575).
- Admin page shows both queues: submissions and registry plugins with version history and events (apps/web/features/admin/pages/PluginModerationPage.tsx:804-830,986-1010).

**Incomplete**

- The two status systems are separate and the brief mixes them; deprecate exists only for registry versions, not for community submissions (apps/web/lib/services/plugin-lifecycle.ts:81-95; PluginSubmissionDecisionSchema at packages/contracts/cloud-contracts/src/plugin-packages.ts:196-200).
- The admin page offers Publish, Deprecate, Suspend, Roll back for versions; the 'submit' action exists on the API but no button was seen (PluginModerationPage.tsx:76-80,462,471,483,391).
- Submitting is a button plus confirm on an owned plugin, not a form (DirectoryPanel.tsx:687-699).

**Present but disconnected or switched off**

- Lifecycle action 'restore' is declared and has no route case (plugin-lifecycle.ts:33; lifecycle/route.ts:31-64).

**Not available**

- Report a plugin (S54.38): none found; the plugin detail view has no report control (grep of PluginDetailView.tsx).
- Publisher analytics (S54.39): none found.
- Commercial procurement and paid plugins (S54.40): none found.
- Mobile, CLI, VS Code, Chrome: no submission or moderation.
- The installation approval request (S54.31) is also missing (brief), which affects blocked plugins but is outside this feature.

## 4. Required behaviour

**Established requirements**

- A publisher can submit a plugin for review and track the review (S54.36). (source: brief: S54.36 Should)
- Platform staff can moderate listings: suspend, deprecate (S54.37). (source: brief: S54.37 Should)
- A user can report a plugin (S54.38); a publisher sees analytics (S54.39); paid plugins can be bought through commercial procurement where offered (S54.40). All three are missing on every app. (source: brief: S54.38, S54.39, S54.40)
- Publisher identity is checked in the owner's review of each submission. (source: doc: docs/decisions/2026-09-27-founder-decisions.md lines 105-108)
- Plugin review, incident response and emergency controls belong to security operations. (source: doc: docs/product/competitive-guidance.md item 167)
- Version changes follow fixed steps; pending or approved submissions can be withdrawn. (source: code: plugin-lifecycle.ts:51-58; plugin-submission-service.ts:268-282)

**Acceptance criteria**

1. A user without a verified email gets 403 when submitting.
2. Submitting a plugin whose scan verdict is 'block' is refused with the findings.
3. A second submission of the same plugin key withdraws the earlier pending one.
4. Only a pending submission can be approved or rejected; only an approved one can be suspended; other combinations return 409.
5. Rejecting or suspending needs a note; the publisher sees it as 'Reviewer note'.
6. Suspending a registry version switches off every installation on it and the response says how many.
7. A non-admin calling /api/plugins/[id]/lifecycle or the admin submission routes is refused, and /admin/plugins returns not found.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A listing report is needed before public launch because anyone can install an approved community plugin.
- [inferred] Publishers need a way to see why a scan blocked or flagged a plugin before submitting.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Report' control to the plugin detail view feeding the moderation queue.
- [proposed] Add per-plugin install counts for publishers.
- [proposed] Show the lifecycle 'submit' action in the admin page, or remove it from the API.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET and POST /api/plugins/submissions | `apps/web/app/api/plugins/submissions/route.ts` | List own and create a submission (26, 36). |
| endpoint | DELETE /api/plugins/submissions/[id] | `apps/web/app/api/plugins/submissions/[id]/route.ts` | Withdraw. |
| service | plugin-submission-service | `apps/web/lib/services/plugin-submission-service.ts` | createSubmission (169), withdrawSubmission (268), decideSubmission (329), community lists (420+). |
| endpoint | GET /api/admin/plugin-submissions | `apps/web/app/api/admin/plugin-submissions/route.ts` | Review queue by status. |
| endpoint | GET and POST /api/admin/plugin-submissions/[id] | `apps/web/app/api/admin/plugin-submissions/[id]/route.ts` | Read files and decide (66). |
| endpoint | GET and POST /api/plugins/[id]/lifecycle | `apps/web/app/api/plugins/[id]/lifecycle/route.ts` | Registry version actions, platform admin only (108, 130). |
| service | plugin-lifecycle | `apps/web/lib/services/plugin-lifecycle.ts` | Statuses and transitions (18-58), publish (347), submit (404), suspend (428), rollback (518). |
| screen | PluginModerationPage | `apps/web/features/admin/pages/PluginModerationPage.tsx` | Admin UI: SubmissionQueue (804), SubmissionReviewPanel (604), registry versions. |
| screen | /admin/plugins page | `apps/web/app/admin/plugins/page.tsx` | Admin gate by AGI_PLATFORM_ADMIN_USER_IDS. |
| service | platform-admin-access | `apps/web/features/admin/lib/platform-admin-access.ts` | PLATFORM_ADMIN_ENV_VAR and isPlatformAdmin. |
| component | PluginDetailView submission block | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Submit, status text, Withdraw, reviewer note (941-990). |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | submitPlugin (1709), withdrawPluginSubmission (1725). |
| service | plugins-directory service | `apps/web/features/directory/services/plugins-directory.ts` | Submission status labels and withdrawable flag (602-604); submittable flag (1036). |
| schema | PluginSubmissionDecisionSchema | `packages/contracts/cloud-contracts/src/plugin-packages.ts` | approve, reject (note), suspend (note) (196). |
| table | plugin_submissions, plugin_submission_files, plugin_submission_installs | `apps/web/db/neon/0328_plugin_submissions.sql` | Submission rows, copied files and installs of approved submissions. |
| table | plugin_registry_versions and plugin_registry_lifecycle_events | `apps/web/db/neon/0259_extension_versions_and_lifecycle.sql` | Version statuses and history. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | recordNotification to the publisher (used at admin route line 102). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Publisher presses Submit; browser posts the entry id and optional category and publisher name. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1709-1723 |
| Server checks CSRF, rate limit, verified email and the external-sharing gate. | our servers | apps/web/app/api/plugins/submissions/route.ts:36-56 |
| Server reads the owned entry and files, runs the rule-based scan, refuses 'block', and in one transaction withdraws earlier pending rows and stores the submission and its files. | our servers | apps/web/lib/services/plugin-submission-service.ts:169-250 |
| Admin opens /admin/plugins; the page loads the queue and files through admin routes. | device and our servers | apps/web/features/admin/pages/PluginModerationPage.tsx:604-640,804-830 |
| Admin decides; server locks the row, checks the expected status, updates it, and for approve replaces the earlier approved row and moves its installs. | our servers | apps/web/lib/services/plugin-submission-service.ts:329-415 |
| Server writes an audit event and sends a notification to the publisher. | our servers | apps/web/app/api/admin/plugin-submissions/[id]/route.ts:78-115 |
| For registry versions, admin actions move the status in plugin_registry_versions, repoint the entry, record a lifecycle event and an audit event; suspend disables installations on that version. | our servers | apps/web/lib/services/plugin-lifecycle.ts:347-575; apps/web/app/api/plugins/[id]/lifecycle/route.ts:147-233 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Submission row with status, scan verdict and findings, reviewer note, reviewer id | table plugin_submissions | Server side | Rows are kept; withdrawn and rejected stay as history (no delete found) |
| Copy of submitted files | table plugin_submission_files | Server side | Kept; deletion not traced |
| Version records and lifecycle events with actor and reason | tables plugin_registry_versions, plugin_registry_lifecycle_events | Server side | Never deleted by design (plugin-lifecycle.ts:46-50) |
| Publisher notification | notification store via recordNotification | Server side, shown on the user's surfaces | Deduped by key plugin-submission:<id>:<status> |
| Audit events plugin_marketplace_changed, admin_policy_changed | security audit log | Server side | Retention not examined |

**Models and providers.** No model or provider takes part. The scan is rule based (packages/client/client-runtime/src/plugins/packageScan.ts). Review is by a human.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; submission also needs a verified primary email (apps/web/app/api/plugins/submissions/route.ts:49-54). Admin routes need a platform admin. |
| Permissions | Publisher can only submit and withdraw plugins they own (createSubmission query filters by user and source kind; withdraw filters by user_id). Admin actions need requirePlatformAdmin and the admin-operator rate limit (admin route.ts:66-76; lifecycle/route.ts:108,130). |
| Subscription | none found in the code. No plan, entitlement or credit check in the submission or moderation routes. |
| Limits and metering | Submit and withdraw use plugin-installation-write 20 per minute (apps/web/lib/rate-limit.ts:519). Admin routes use the admin-operator limiter. The admin queue lists at most 200 rows (plugin-submission-service.ts:292-303). No metering. |
| Feature flags | AGI_PLATFORM_ADMIN_USER_IDS (staff list). External-sharing workspace gate (submissions/route.ts:55-56). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Submission and moderation need our servers and a signed-in account; there is no Local-mode path. The CLI has no submission code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Email not verified | 403 'Verify your email address before you submit a plugin to the directory.' | submissions/route.ts:49-54 |
| Scan blocked | Submission refused with findings. | plugin-submission-service.ts:196-201 |
| No files stored | Validation error 'no files stored with it, so it cannot be reviewed'. | plugin-submission-service.ts:190-194 |
| Not owned | 404 'That plugin is not one you uploaded or created.' | submissions/route.ts:62-64 |
| Withdraw not allowed | 404 'not yours, or it is no longer in review or listed.' | submissions/[id]/route.ts:27-33 |
| Decision on wrong status | 409 'Only a submission waiting for review can be approved or rejected.' or 'Only an approved plugin can be suspended.' | plugin-submission-service.ts:344-353 |
| Invalid version move | 409 'A <from> plugin version cannot become <to>. Allowed from <from>: ...' | plugin-lifecycle.ts:263-270 |
| Rollback race | 409 if the entry moved since the admin opened the confirm. | plugin-lifecycle.ts:535-541 |
| Loading, error and stale requests | Queue ignores stale responses and shows 'The submissions could not be loaded.' | PluginModerationPage.tsx:804-830 |
| Destructive actions | Suspend and rollback use a confirm dialog naming the consequence. | PluginModerationPage.tsx:305-335 |
| Offline or timeout | not handled in the code beyond error text. | none found |
| Accessibility | Admin sections have aria-labelledby headings and the search form has role search (PluginModerationPage.tsx:990-1005). | as cited |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/plugin-submission-service.test.ts`: Submission service; contents not opened.
- `apps/web/app/api/admin/plugin-submissions/__tests__/route.test.ts`: Admin queue route; contents not opened.
- `apps/web/app/api/admin/plugin-submissions/[id]/__tests__/route.test.ts`: Admin decision route; contents not opened.
- `apps/web/app/api/plugins/[id]/lifecycle/__tests__/route.test.ts`: Lifecycle route; contents not opened.
- `apps/web/lib/services/plugin-lifecycle.test.ts`: Version moves and republish behaviour (describe blocks at lines 213 and 321).
- `apps/web/app/plugins/__tests__/plugin-lifecycle.test.ts`: Plugin lifecycle on the plugins page; contents not opened.
- `apps/web/app/api/admin/plugins/__tests__/route.test.ts`: Admin plugins route; contents not opened.

**Test scenarios**

- **Publisher submits**
  1. Verify the email on a test account.
  2. Upload a plugin, open it, press 'Submit to the directory', confirm.
  - Expected: Status text reads 'Waiting for review' and a pending row exists; 'Withdraw' is shown.
- **Unverified email**
  1. Use an account with no verified email and submit.
  - Expected: 403 with the verify-email message.
- **Admin approves**
  1. List the account in AGI_PLATFORM_ADMIN_USER_IDS.
  2. Open /admin/plugins, filter 'Waiting for review', open the row, press Approve.
  - Expected: Row shows 'Listed'; the publisher gets a notification; the plugin appears for other users.
- **Admin rejects with note**
  1. Press Reject, enter a note, confirm.
  - Expected: Publisher sees 'Not approved' and 'Reviewer note: <note>'.
- **Suspend a registry version**
  1. On a registry plugin with an installed version, press Suspend with a reason.
  - Expected: Message shows how many installations stopped; those installations are off; a lifecycle event is listed.
- **Non-admin**
  1. As a normal user open /admin/plugins and call POST /api/plugins/<id>/lifecycle.
  - Expected: Not found page and an authorisation refusal.

**Where to look when it fails**

- Error name PluginLifecycleError (409) and codes INVALID_LIFECYCLE_ACTION.
- Tables plugin_submissions, plugin_submission_files, plugin_registry_lifecycle_events; audit events plugin_marketplace_changed, admin_policy_changed.
- Notification dedupe key plugin-submission:<id>:<status>.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/web/054-plugin-marketplace-and-customization.md)
- Desktop: [70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md](../../70-qa/test-plans/desktop/054-plugin-marketplace-and-customization.md)

## 10. Gaps and dependencies

- **Reporting a plugin is missing on every app.** Affects: All users; moderation has no user signal. Evidence: brief S54.38; no report control in PluginDetailView.tsx. Work needed: Design and build a report action and queue.
- **Publisher analytics are missing.** Affects: Publishers. Evidence: brief S54.39; no analytics route found under apps/web/app/api/plugins. Work needed: Define metrics and a publisher view.
- **Commercial procurement and paid plugins are missing.** Affects: Publishers and buyers. Evidence: brief S54.40; no plugin route references plans or payment. Work needed: Product decision on paid plugins and procurement.
- **Brief mixes two status systems and says deprecate applies to listings; community submissions cannot be deprecated.** Affects: Brief accuracy and admins. Evidence: plugin-packages.ts:196-200; plugin-lifecycle.ts:81-95. Work needed: Split the brief item; decide if submissions need deprecate.
- **Lifecycle API 'submit' has no admin button, and 'restore' has no route case.** Affects: Admins. Evidence: plugin-lifecycle.ts:33; lifecycle/route.ts:31-64; PluginModerationPage.tsx:76-80. Work needed: Wire or remove.
- **Registry plugins have no publisher-facing submit path; only platform admins call the lifecycle API.** Affects: Third-party publishers of registry packs. Evidence: lifecycle/route.ts:108,130 use requirePlatformAdmin. Work needed: Product decision.
- **No installation approval request (S54.31) for plugins blocked by policy.** Affects: Members of restrictive orgs. Evidence: brief S54.31. Work needed: Out of this feature; tracked separately.
- **Moderation exists only on web; desktop depends on the hosted page.** Affects: Staff using other apps. Evidence: no moderation code in apps/mobile, apps/cli, apps/extension-vscode, apps/extension. Work needed: Likely acceptable; record the decision.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- api:POST /api/plugins/submissions
- api:DELETE /api/plugins/submissions/[id]
- api:GET /api/admin/plugin-submissions
- api:POST /api/admin/plugin-submissions/[id]
- api:POST /api/plugins/[id]/lifecycle
- table:plugin_submissions
- table:plugin_submission_files
- table:plugin_submission_installs
- table:plugin_registry_versions
- table:plugin_registry_lifecycle_events
- table:plugin_package_scans
- F054-07
- F054-09
- F054-10
- SYS-authorization-and-workspaces
- SYS-observability-and-operations
- SYS-security-and-privacy

## Unknown

- Whether the admin page is reachable from any in-product link or only by URL.
- What the existing submission and admin tests assert beyond file names.
- Whether the lifecycle 'submit' action is used by any script or tool.
- How rejected, withdrawn and suspended submission files are deleted or retained.
- Whether approved community plugins are re-scanned after approval.
- How publisher identity is checked in review beyond the review itself (the decision doc names it; code for it was not found).
