---
id: "F105-11"
type: "feature"
title: "Plugin testing and publishing"
aliases: ["Plugin upload", "Upload plugin", "Custom app/Plugin testing (S105.29)", "Publishing workflow (S105.30)", "Submit to the directory", "Community submissions", "Plugin moderation"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.29", "S105.30"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "table:plugin_submissions", "table:plugin_submission_files", "api:POST /api/plugins/uploads", "api:POST /api/plugins/submissions", "api:POST /api/admin/plugin-submissions/{id}", "F105-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-11 Plugin testing and publishing

On the web, a developer uploads a plugin zip into their own account to try it, then submits a version for review. A platform operator approves, rejects or suspends it in the admin Plugins page; approved plugins appear in the community directory. The CLI installs plugins from a local folder or git onto the device only.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.29](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10529), [S105.30](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10530).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Upload plugin stores a zip as an account-owned plugin source, installs it for that account only and registers its connectors (apps/web/app/api/plugins/uploads/route.ts:51-94). Submit to the directory scans the stored files and queues a submission with status pending (apps/web/lib/services/plugin-submission-service.ts:198-262). An operator decides it (apps/web/app/api/admin/plugin-submissions/[id]/route.ts:60-105). Only approved submissions are listed to others (plugin-submission-service.ts:420-432).

**Why it exists.** Migration 0328 says only platform administrators could publish, so a developer could install their own plugin privately but never list it; the leaders take a submission, review it and publish it (apps/web/db/neon/0328_plugin_submissions.sql:3-8).

**Who uses it.** A signed-in plugin developer, a platform operator who reviews, and users who install approved plugins.

**Problems it solves**

- Trying an unpublished plugin before release.
- Getting a reviewed, scanned listing.
- Shipping an update that moves existing installs to the new version (0328 migration comment).

**Use cases**

- Upload a zip with a skills folder, test it in chat.
- Submit the tested version for review.
- Operator approves; users find it in the directory.
- Developer withdraws it; everyone who installed it loses it.

## 2. User experience

**Where to find it**

- Web and desktop (hosted web app): Directory panel, Plugins section, button 'Upload plugin' (packages/ui/ui/src/directory/DirectoryPanel.tsx:463-468; packages/ui/ui/src/directory/constants.ts:402). Desktop shows the hosted web app (doc: AGENTS.md section 5).
- Plugin detail view: 'Submit to the directory' or 'Submit this version', and 'Withdraw' (constants.ts:460-471; DirectoryPanel.tsx:686-710).
- Admin: /admin/plugins, section 'Community submissions' (apps/web/app/admin/plugins/page.tsx:24; apps/web/features/admin/pages/PluginModerationPage.tsx:836-838).
- CLI: agi plugin install <source> from a local folder or git URL, plus list, info, enable, disable, update, remove, digest, sign (apps/cli/src/lib.rs:2017-2077, :6766-7064).
- Mobile (not in the brief): a Plugin sources screen lists submissions (apps/mobile/src/features/plugins/sourcesService.ts:98).

**Before you start**

- Signed in, plugins enabled for the workspace and plugin policy allowing the plugin key (apps/web/features/plugins/server/directory/install-gate.ts:21-50).
- Uploading authors skills, which can be turned off by the deployment switch AGI_USER_SKILL_AUTHORING=0 (apps/web/lib/services/user-skill-authoring.ts:6-17).
- Submitting: a verified email address and the workspace external-sharing rule must allow it (apps/web/app/api/plugins/submissions/route.ts:48-55).
- Reviewing: platform operator (requirePlatformAdmin, admin route [id]/route.ts:66).

**Screens and controls**

- Upload dialog: 'Choose a zip of your plugin. It needs a skills folder, and may carry a plugin manifest folder.' accepting .zip (constants.ts:403-405).
- Submit confirmation: 'Every submission is reviewed before it is listed...' with 'Submit for review' (constants.ts:464-466).
- Withdraw confirmation: 'If it is listed, it leaves the directory and everyone who installed it loses it. You can submit it again later.' with 'Withdraw it' (constants.ts:468-471).
- Moderation list: filter 'Show' with Waiting for review, Listed, Not approved, Withdrawn, Suspended (PluginModerationPage.tsx:584-592); a reviewer note label 'Reviewer note' (constants.ts:472).

**Journey**

1. Open the Directory, Plugins and press 'Upload plugin'; choose a zip.
2. If the scan raises a caution, acknowledge it; the plugin installs for this account only.
3. Read the result lines: plugin names, skill count, omitted files, dependencies and connectors.
4. Open the plugin and press 'Submit to the directory', then 'Submit for review'.
5. An operator opens /admin/plugins and approves, rejects with a note, or suspends.
6. The submitter gets a notification ('Your plugin was approved. Anyone can now find and install it.').
7. Optionally withdraw.

**What the person sees and gets**

- Upload result lines include an omitted-files line (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1586-1612).
- Submission statuses: Waiting for review, Listed, Not approved, Withdrawn, Suspended (PluginModerationPage.tsx:584-588).
- Errors: 'Verify your email address before you submit a plugin to the directory.', 'That plugin is not one you uploaded or created.', 'This plugin has no files stored with it, so it cannot be reviewed.' (submissions/route.ts:50, :64; service:187-189 range).
- CLI: 'Installed to <path> ...' with signature label (lib.rs:6866-6881).

**Settings**

- Plugin on or off and per-skill choices after install (adapter.setPluginEnabled, DirectoryPanel.tsx:733-745).
- Deployment switch AGI_USER_SKILL_AUTHORING (name only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Upload route: CSRF, user scope, rate limit, archive read, policy gate, dependency plan, store as owned source of kind upload, register connectors, audit event, 201 (apps/web/app/api/plugins/uploads/route.ts:32-121).
- omittedFiles is returned and shown (uploads/route.ts:95-100; useDirectoryAdapter.ts:1606-1608).
- Submission create, list, withdraw (apps/web/app/api/plugins/submissions/route.ts:28-84; apps/web/app/api/plugins/submissions/[id]/route.ts:41-47).
- Scan before submit: a blocking verdict refuses; a review verdict is recorded for the reviewer (plugin-submission-service.ts:198-262).
- Admin list, read and decide with audit and a notification to the submitter (apps/web/app/api/admin/plugin-submissions/[id]/route.ts:41-105).
- Only status approved is listed to users (plugin-submission-service.ts:431).
- CLI local install, with integrity and signature policy (apps/cli/src/lib.rs:2017-2077, :6833-6930; apps/cli/src/features/plugins/plugins.rs:1155-1230).

**Incomplete**

- Moderation page also has a separate plugin registry version section with Draft, In review, Published, Deprecated, Suspended; its link to submissions was not traced (PluginModerationPage.tsx:54-100).
- Mobile lists submissions although the brief marks mobile n/a (sourcesService.ts:98).

**Present but disconnected or switched off**

- Authoring and upload return 'Skill authoring is not available.' when AGI_USER_SKILL_AUTHORING is 0 (user-skill-authoring.ts:7-17).

**Not available**

- The CLI does not upload to the account or submit for review: no call to /api/plugins/uploads or /api/plugins/submissions in apps/cli/src (grep). The brief's lib.rs:1296 and 3613 are project commands, not plugin upload.
- VS Code and Chrome: n/a per brief; no code found.

## 4. Required behaviour

**Established requirements**

- A developer can load an unpublished custom plugin into their own account to try it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.29)
- A developer can submit a plugin or app for review and publish versions to users. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.30)
- At most one version of a plugin is in review and one approved; approving a new version withdraws the one it replaces and moves its installs onto it. (source: apps/web/db/neon/0328_plugin_submissions.sql:12-16)
- A submission snapshot of its files is what review and installs see. (source: apps/web/db/neon/0328_plugin_submissions.sql:15-17)
- Only an approved plugin can be suspended; only a pending one can be approved or rejected. (source: apps/web/lib/services/plugin-submission-service.ts:344-353)
- A rejection carries a note. (source: apps/web/app/api/admin/plugin-submissions/[id]/__tests__/route.test.ts:215)
- Files the server omits are listed back to the uploader. (source: apps/web/app/api/plugins/uploads/route.ts:95-100)

**Acceptance criteria**

1. A valid zip uploads and the plugin appears installed for that account only.
2. A zip the policy forbids stores nothing and returns a refusal.
3. The result lists omitted files when the server skipped any.
4. Submitting needs a verified email; without one the request is refused.
5. Submitting a plugin the user did not upload or create returns 'not one you uploaded or created'.
6. A second submission of the same plugin withdraws the earlier pending one.
7. Only an operator can approve; a non-operator gets 404.
8. After approval the plugin is listed to other signed-in users; after withdrawal it is not.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Publish versions' is met by submitting each new version; there is no separate publish action (service lines 198-262).
- [inferred] The moderation page needs platform operator status, not workspace admin, since the route calls requirePlatformAdmin.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the scan findings to the developer before they submit.
- [proposed] Add a CLI command that uploads a folder to the account.
- [proposed] Link approved submissions to the registry version section.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Upload, create, submit, withdraw controls (lines 463-476, 686-724, 1020-1033) |
| config | directory constants | `packages/ui/ui/src/directory/constants.ts` | Labels and confirm copy (lines 399-472) |
| hook | useDirectoryAdapter | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | uploadPluginArchive (1618), submitPlugin (1709), upload result lines (1586-1612) |
| service | plugins-directory client | `apps/web/features/directory/services/plugins-directory.ts` | submitPluginForReview (line 567) and related calls |
| endpoint | POST /api/plugins/uploads | `apps/web/app/api/plugins/uploads/route.ts` | Upload and install for the account |
| service | archive upload reader | `apps/web/features/plugins/server/directory/archive-upload.ts` | Reads and validates the zip |
| service | install gate | `apps/web/features/plugins/server/directory/install-gate.ts` | Workspace feature and plugin policy checks |
| service | owned source store | `apps/web/lib/services/plugin-owned-source-service.ts` | storeOwnedPluginSource |
| service | plugin connectors | `apps/web/lib/connectors/plugin-connectors.ts` | registerPluginConnectors for MCP servers |
| endpoint | GET/POST /api/plugins/submissions | `apps/web/app/api/plugins/submissions/route.ts` | List own and create submission |
| endpoint | DELETE /api/plugins/submissions/{id} | `apps/web/app/api/plugins/submissions/[id]/route.ts` | Withdraw, 204 |
| service | plugin-submission-service | `apps/web/lib/services/plugin-submission-service.ts` | createSubmission (198), withdrawSubmission (268), decideSubmission (329), listCommunityPlugins (420) |
| endpoint | GET/POST /api/admin/plugin-submissions | `apps/web/app/api/admin/plugin-submissions/route.ts` | Operator list |
| endpoint | GET/POST /api/admin/plugin-submissions/{id} | `apps/web/app/api/admin/plugin-submissions/[id]/route.ts` | Read and decide approve, reject, suspend; notify submitter |
| screen | PluginModerationPage | `apps/web/features/admin/pages/PluginModerationPage.tsx` | Operator UI, Community submissions section (836-838) |
| screen | /admin/plugins | `apps/web/app/admin/plugins/page.tsx` | Route that mounts the page |
| table | plugin_submissions | `apps/web/db/neon/0328_plugin_submissions.sql` | One submitted version with scan result and status |
| table | plugin_submission_files | `apps/web/lib/services/plugin-submission-service.ts` | Snapshot of submitted files (insert at lines 247-257) |
| table | plugin_marketplace_entries and sources | `apps/web/lib/services/plugin-submission-service.ts` | Owned entries read by createSubmission (lines 163-176 range) |
| config | plugin-installation-write rate limit | `apps/web/lib/rate-limit.ts` | 20 per minute, fail-closed (lines 519-523) |
| command | agi plugin | `apps/cli/src/lib.rs` | PluginSubcommand (2017) and handler (6766-7064) |
| service | CLI plugin manager | `apps/cli/src/features/plugins/plugins.rs` | install from local path or git, signature and integrity (line 1155) |
| service | mobile plugin sources | `apps/mobile/src/features/plugins/sourcesService.ts` | Lists submissions (line 98) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a zip; the browser posts it with a CSRF token. | device | DirectoryPanel.tsx:1020-1033; useDirectoryAdapter.ts:1618 |
| The server rate-limits, reads the archive, applies workspace feature and plugin policy, plans dependencies, stores the plugin as an owned upload and registers connectors. | our servers | uploads/route.ts:32-94 |
| The person presses Submit; the server finds the owned entry, scans its files and writes a pending submission with a file snapshot, withdrawing any earlier pending one. | our servers | submissions/route.ts:36-65; plugin-submission-service.ts:198-262 |
| An operator decides; the status, reviewer and time are written, an audit event is recorded and the submitter is notified. | our servers | admin plugin-submissions/[id]/route.ts:73-105; plugin-submission-service.ts:329-380 range |
| Approved submissions are returned by the community listing and can be installed by others. | our servers | plugin-submission-service.ts:420-432 |
| CLI: agi plugin install copies a local folder or clones a git URL into the device plugin folder, verifying integrity and signature. | device | apps/cli/src/features/plugins/plugins.rs:1155-1210; lib.rs:6833-6930 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded plugin files and manifest | Owned source and entry tables plus files table (names in apps/web/lib/services/plugin-submission-service.ts:163-176) | Server only | unknown |
| Submission row, scan findings, review note, reviewer | Table plugin_submissions | Server only | Withdraw sets status withdrawn; rows are kept |
| Submitted file snapshot | Table plugin_submission_files | Server only | unknown |
| CLI-installed plugin | Plugin folder on the device | no | agi plugin remove |

**Models and providers.** No model or provider takes part in upload or review. The scan is code run by our servers (describePluginScan from client-runtime plugins). Installed plugins may later contribute skills and MCP connectors that run in chats with whatever model the chat uses.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for upload and submit; platform operator for review; none for CLI local install (the CLI plugin command does not call the account). |
| Permissions | Upload and submit act on the caller's own sources only (submission query joins sources.user_id, plugin-submission-service.ts:163-176). Review requires platform operator and the admin-operator rate limit (admin route [id]/route.ts:41-67). Workspace plugin policy can forbid a plugin key (install-gate.ts:39-47). |
| Subscription | Upload and submit: none found in the code beyond the workspace feature gate for plugins and skills (install-gate.ts:13-14, :29-37). The 'skills' and 'connectors' plan capabilities exist in billing-catalog.ts:350-356 but a direct check in these routes was not found. |
| Limits and metering | Rate limit plugin-installation-write 20 per minute, fail-closed (rate-limit.ts:519-523). Upload body ceiling exists (uploads route test titles 188-198) but the value was not read. |
| Feature flags | AGI_USER_SKILL_AUTHORING (0 turns authoring off, user-skill-authoring.ts:6-17). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Account upload, submission and moderation are Cloud actions and need our servers. CLI plugin install is fully on the device and works without an account [inferred from plugins.rs install code having no cloud call]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bad archive | 422 with the reason, nothing written. | apps/web/app/api/plugins/uploads/__tests__/route.test.ts:213 |
| Oversize body | Refused as too large before reading. | uploads route.test.ts:188-198 |
| No file field | Refused. | uploads route.test.ts:179 |
| Policy forbids | Refusal and nothing stored. | uploads route.test.ts:254 |
| Scan caution | Caution raised in the dialog; acknowledged scans are passed back. | uploads/route.ts:66; useDirectoryAdapter.ts:1594-1600 |
| Scan blocks submit | PluginPackageRefusedError scan_blocked. | plugin-submission-service.ts:198-203 |
| Email not verified | 403 with a user-safe message. | submissions/route.ts:49-53 |
| Rejection without note | Rejected by validation. | admin [id]/__tests__/route.test.ts:215 |
| Wrong state decision | Only pending can be approved or rejected; only approved can be suspended. | plugin-submission-service.ts:344-353 |
| Cancel | Confirmation dialogs have cancel buttons; an in-flight upload cannot be cancelled: not handled in the code. | DirectoryPanel.tsx:686-710 |
| Offline/retry | not handled in the code beyond the generic failure copy 'The plugin could not be uploaded.' | constants.ts:406 |
| Accessibility | not opened for the dialogs. | UploadFileDialog.test.tsx exists by name |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/plugins/uploads/__tests__/route.test.ts`: CSRF first, rate limit and bucket, missing file, oversize bodies, rejected archive 422, stores upload against caller scope, policy refusal, name preference, store failure as server error
- `apps/web/lib/services/__tests__/plugin-submission-service.test.ts`: Reads entry and files in one statement, scans the recorded revision, JSON-string files, refuses an entry with no files, nothing for another user's entry
- `apps/web/app/api/admin/plugin-submissions/[id]/__tests__/route.test.ts`: 401, 404 for non-operators and bad ids, read without caching, CSRF before auth, rejection needs a note, approve audits and notifies
- `apps/web/app/api/admin/plugin-submissions/__tests__/route.test.ts`: name only; not opened
- `packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx`: name only; not opened
- `packages/ui/ui/src/directory/__tests__/UploadFileDialog.test.tsx`: name only; not opened
- `apps/mobile/src/features/plugins/__tests__/PluginSources.test.tsx`: Mobile sources screen with a mocked submissions list and a submit call (lines 139, 220)
- `apps/cli/src/features/plugins/plugins.rs`: Inline tests from line 1934: name derivation, traversal refusal, git argument refusal, signature and integrity behaviour

**Test scenarios**

- **Upload and try**
  1. Zip a folder with a skills directory and a SKILL.md.
  2. Upload it from Directory, Plugins.
  3. Start a chat and use the skill.
  - Expected: Plugin shows installed for this account; another account does not see it.
- **Omitted files**
  1. Upload a zip containing a file type the server skips.
  - Expected: Result lines list the omitted file names.
- **Submit and approve**
  1. Submit the plugin with a verified email.
  2. As operator open /admin/plugins, filter 'Waiting for review', approve.
  3. As another user open the directory.
  - Expected: Status Listed; the plugin appears for the other user; the submitter is notified.
- **Reject**
  1. Reject a pending submission with a note.
  - Expected: Status 'Not approved'; the note appears as 'Reviewer note'.
- **Withdraw**
  1. Withdraw an approved submission.
  - Expected: It leaves the directory.
- **CLI local install**
  1. Run agi plugin install ./my-plugin --integrity sha256:<digest from agi plugin digest>.
  - Expected: Installed to the device plugin folder with a signature label; no network call to the account.

**Where to look when it fails**

- Audit events plugin_marketplace_changed with status uploaded, submitted, or the decision (uploads/route.ts:113-119; submissions/route.ts:66-78; admin route).
- plugin_submissions.status and review_note.
- 422 reasons from the archive reader.
- Notification dedupe key plugin-submission:<id>:<status>.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No CLI path to upload or submit to the account.** Affects: CLI developers. Evidence: No plugins/uploads or plugins/submissions in apps/cli/src; lib.rs:2017-2077 has only local install. Work needed: Decide whether the CLI needs account upload; otherwise correct the brief.
- **Brief cites project commands for CLI plugin support.** Affects: Planning. Evidence: lib.rs:1296 and 3613 are projects commands. Work needed: Fix the brief references.
- **Plan requirement for upload and submit was not established.** Affects: Pricing and tests. Evidence: No plan check in the routes read. Work needed: Confirm and document.
- **Retention of uploaded files and snapshots is unknown.** Affects: Privacy review. Evidence: Not found. Work needed: Establish and state it.
- **Mobile has a Plugin sources screen although the brief says n/a.** Affects: Brief accuracy. Evidence: sourcesService.ts:98. Work needed: Update the brief for mobile.
- **Desktop was not run; its status rests on the hosted web app.** Affects: Desktop users. Evidence: doc: AGENTS.md section 5. Work needed: Run the upload in the desktop app.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- table:plugin_submissions
- table:plugin_submission_files
- api:POST /api/plugins/uploads
- api:POST /api/plugins/submissions
- api:POST /api/admin/plugin-submissions/{id}
- F105-10

## Unknown

- Whether any plan is required to upload or submit.
- Size ceilings for the zip.
- Retention of uploaded files, scan results and snapshots.
- How the registry version section of the moderation page relates to community submissions.
- Whether the mobile screen can submit or only list.
- What the DirectoryPanel and UploadFileDialog tests assert.
- Whether the CLI plugin install works in every privacy mode (no check read).
