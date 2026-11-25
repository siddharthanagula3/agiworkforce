---
id: "F107-11"
type: "feature"
title: "Publisher and partner programs"
aliases: ["Plugin submission", "Submit plugin", "Community directory", "Reviewed community directory", "Marketplace source", "agi marketplace add", "Partner application", "Partners page"]
area: "107 Discovery, social, and public-content products"
available_on: ["web", "desktop", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.20", "S107.22"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "table:plugin_submissions", "api:POST /api/plugins/submissions", "api:POST /api/plugins/marketplaces", "api:POST /api/partners/apply", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-security-and-privacy", "F107-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-11 Publisher and partner programs

Developers can submit plugins for review and listing in the community directory, and users can add a publisher's marketplace by repository link. The partners page says there is no partner program and offers a short application form. A merchant program does not exist.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.20](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10720), [S107.22](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10722).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives outside publishers two paths: submit a plugin you uploaded or created, which is scanned and reviewed before listing; or add a marketplace source (a public GitHub repository with a manifest) to your account (packages/ui/ui/src/directory/PluginDetailView.tsx:941-972; apps/cli/src/lib.rs:2340-2350). A partners page lists opportunities and takes an application (apps/web/app/partners/page.tsx:34-124).

**Why it exists.** Brief S107.20 says third-party publishers can get plugins or content in front of users with the publisher named; S107.22 says merchants or partners can join a program, which is missing.

**Who uses it.** Plugin developers, publishers with a marketplace repository, consultancies or runtime makers who want to talk to us; platform reviewers handle the other side.

**Problems it solves**

- Outsiders can reach users through reviewed plugins.
- Users can add trusted outside sources.
- The partners page states honestly what is and is not offered.

**Use cases**

- A developer uploads a plugin and submits it from its detail page.
- A user runs 'agi marketplace add owner/repo'.
- A consultancy fills the partner form for delivery work.
- A reviewer approves or rejects a pending submission.

## 2. User experience

**Where to find it**

- Web and desktop: plugin directory, plugin detail view: button 'Submit' labels from SUBMIT_PLUGIN_LABEL and SUBMIT_PLUGIN_UPDATE_LABEL, 'Withdraw' for a pending one (PluginDetailView.tsx:941-972). Exact label strings are constants not opened (unknown).
- Web: /partners page, section 'Apply', 'Email partnerships' and 'Contact sales' buttons (apps/web/app/partners/page.tsx:127-160).
- Web: /plugins public catalogue page (apps/web/app/plugins/page.tsx per brief).
- CLI: 'agi marketplace add <repository> [--ref] [--name]', 'sources', 'remove <id>', 'browse', 'get plugin@marketplace' (apps/cli/src/lib.rs:2340-2365).
- Mobile: nothing found.

**Before you start**

- Submitting needs a signed-in account with a verified email address (apps/web/app/api/plugins/submissions/route.ts:48-52).
- The plugin must be one you uploaded or created (route.ts:65-67).
- CLI marketplace needs a connected account (cloud client connect) (apps/cli/src/lib.rs:2756-2757).

**Screens and controls**

- Confirm dialog before submit; withdraw button; review note shown to the publisher (PluginDetailView.tsx:941-972; DirectoryPanel.tsx:686-705).
- Partner form fields: name, email, company, website, kind, message (20 to 3,000 characters) (packages/contracts/cloud-contracts/src/partner-applications.ts:20-27).

**Journey**

1. Upload or create a plugin in AGI.
2. Open its detail page and press Submit; confirm.
3. Status appears; reviewers decide; approved plugins are listed.
4. Ship an update by submitting the next version (partners page copy).
5. CLI: run the add command; the CLI prints 'Added <name> to your account (<n> plugins).'

**What the person sees and gets**

- Submission status label and review note on the plugin page (PluginDetailView.tsx:941-962).
- Partner form returns a reference starting 'PA-' (apps/web/app/api/partners/apply/route.ts:21-26).
- CLI success line (apps/cli/src/lib.rs:2771-2775).

**Settings**

- Publisher name defaults to full name, username or 'Independent developer' (submissions/route.ts:58-62).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Submission create and list API with email-verified check, external-sharing gate, scan, audit event (apps/web/app/api/plugins/submissions/route.ts:42-83; apps/web/lib/services/plugin-submission-service.ts:169-260).
- Scan verdict block refuses the submission; verdict review is recorded for the reviewer (plugin-submission-service.ts:198-231).
- Statuses pending, approved, rejected, withdrawn, suspended (packages/contracts/cloud-contracts/src/plugin-packages.ts:127-133).
- Operator list of submissions and plugin moderation page at /admin/plugins (apps/web/app/api/admin/plugin-submissions/route.ts; apps/web/app/admin/plugins/page.tsx).
- Approving a new version marks the earlier approved one withdrawn (plugin-submission-service.ts:355-365).
- CLI marketplace add, list, remove via /api/plugins/marketplaces (apps/cli/src/cloud/marketplaces.rs:44-65).
- Partner application: stored by email to a support address, reference returned (apps/web/app/api/partners/apply/route.ts:30-60).

**Incomplete**

- The draft says the partners page has no join form; it does have a form 'PartnerApplicationForm' (apps/web/app/partners/page.tsx:20, 140). The application goes to email, with no database record found (route.ts:30-60).
- Brief marks web and desktop 'done' but the task marks 'partial'; the directory UI is shared, but whether desktop (Tauri or hosted) wires submitPlugin was not opened (unknown).

**Present but disconnected or switched off**

- Whether the adapter for submitPlugin is supplied on every surface is unverified.

**Not available**

- Merchant or partner program to list products or integrations: no code (brief S107.22; partners page says no program).
- Mobile: no directory submission or marketplace add found.
- VS Code and Chrome: not applicable per the brief.

## 4. Required behaviour

**Established requirements**

- Third-party publishers can get plugins or content in front of users via a submission path or a user-added publisher source, with the publisher named. (source: brief S107.20)
- Merchants or partners can join a program to list products, services or integrations (missing on every app). (source: brief S107.22)
- Every submission is scanned and reviewed before it is listed. (source: apps/web/app/partners/page.tsx:46-49; plugin-submission-service.ts:198-231)
- A marketplace source is registered through the cloud API. (source: apps/cli/src/cloud/marketplaces.rs:6, 44-65)

**Acceptance criteria**

1. A user without a verified email cannot submit and sees the verification message.
2. A submission whose scan verdict is block is refused.
3. A pending submission can be withdrawn by its owner.
4. An approved submission appears in the directory with the publisher name.
5. 'agi marketplace add owner/repo' creates a source visible in 'agi marketplace sources'.
6. The partner form refuses a message under 20 characters and returns a PA- reference on success.
7. Only an admin can list or decide submissions.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The directory publisher filter shows the publisher name from the submission (DirectoryPanel.tsx:608-616) [inferred].

**Proposed improvements** (suggestions, not requirements)

- Store partner applications in a table instead of email only [proposed].
- Offer a marketplace add on mobile if plugins matter there [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PluginDetailView | `packages/ui/ui/src/directory/PluginDetailView.tsx` | Submit, update, withdraw controls and status. |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Directory host; submit confirm; publisher filter. |
| component | AddMarketplaceDialog | `packages/ui/ui/src/directory/AddMarketplaceDialog.tsx` | UI for adding a marketplace source (contents not opened). |
| endpoint | POST/GET /api/plugins/submissions | `apps/web/app/api/plugins/submissions/route.ts` | Create and list the caller's submissions. |
| endpoint | /api/plugins/submissions/[id] | `apps/web/app/api/plugins/submissions/[id]/route.ts` | Per-submission route, probably withdraw (not opened). |
| service | plugin-submission-service | `apps/web/lib/services/plugin-submission-service.ts` | Create with scan, review list, decide, community plugin reads. |
| endpoint | GET /api/admin/plugin-submissions | `apps/web/app/api/admin/plugin-submissions/route.ts` | Admin review list. |
| endpoint | /api/admin/plugin-submissions/[id] | `apps/web/app/api/admin/plugin-submissions/[id]/route.ts` | Admin decision (not opened). |
| screen | Plugin moderation page | `apps/web/app/admin/plugins/page.tsx` | Admin screen for plugin review. |
| endpoint | /api/plugins/marketplaces | `apps/web/app/api/plugins/marketplaces/route.ts` | Marketplace source register, list, remove. |
| service | CLI marketplaces | `apps/cli/src/cloud/marketplaces.rs` | CLI client for marketplace sources. |
| command | agi marketplace | `apps/cli/src/lib.rs` | Subcommands Add, Sources, Remove, Browse, Get (lines 2340-2365, 7495-7530). |
| screen | Partners page | `apps/web/app/partners/page.tsx` | Opportunities and what is not offered. |
| component | PartnerApplicationForm | `apps/web/app/partners/PartnerApplicationForm.tsx` | Form posting to /api/partners/apply. |
| endpoint | POST /api/partners/apply | `apps/web/app/api/partners/apply/route.ts` | Validates and emails the application. |
| schema | partner application contract | `packages/contracts/cloud-contracts/src/partner-applications.ts` | Kinds, limits, path. |
| schema | plugin submission contract | `packages/contracts/cloud-contracts/src/plugin-packages.ts` | Statuses and schemas. |
| table | plugin_submissions | `apps/web/lib/services/plugin-submission-service.ts` | Table used by the service (migration file not located). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Publisher presses Submit; the directory adapter posts entry id and optional category and publisher name. | device and our servers | DirectoryPanel.tsx:686-697; submissions/route.ts:42-70 |
| Server checks CSRF, rate limit, verified email, external-sharing gate. | our servers | submissions/route.ts:43-62 |
| Server scans the package files; block refuses; otherwise inserts a pending submission and writes an audit event. | our servers | plugin-submission-service.ts:198-231; submissions/route.ts:68-83 |
| Platform admin lists and decides; approval replaces the previous approved version. | our servers | plugin-submission-service.ts:329-365 |
| CLI add: posts repository url to the marketplaces route; server syncs the source. | device and our servers | apps/cli/src/cloud/marketplaces.rs:44-65 |
| Partner form posts to /api/partners/apply; server sends an email through its mail provider to a support address. | our servers | apps/web/app/api/partners/apply/route.ts:30-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plugin submission, scan verdict and findings, review note | table plugin_submissions | Server only | Withdraw changes status; deletion rules unknown |
| Marketplace source (repository url, ref, status, entry count) | our servers via /api/plugins/marketplaces (table name unknown) | Per account, shown on every surface (apps/cli/src/lib.rs:2342-2343) | Removed by 'remove' |
| Partner application text, email, account id | sent by email; no table found | No | unknown |

**Models and providers.** No model is called. The scan is a package scan (scanAndRecordPluginPackage); whether it uses a model was not opened (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Submission requires sign-in and verified email. Partner form works signed out (getOptionalAuthUser, apply/route.ts:36). CLI needs an account. |
| Permissions | Review actions need platform admin (admin route requirePlatformAdmin). |
| Subscription | No plan check found on submit except the external-sharing gate, whose rules were not opened (unknown). |
| Limits and metering | Submit uses the plugin-installation-write rate limit; partner form uses the waitlist rate limit; message 20 to 3,000 characters (submissions/route.ts:45; apply/route.ts:34). |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Submission, review and marketplace registration all need our servers; they are not available in Local mode. The CLI marketplace commands call the cloud client (apps/cli/src/lib.rs:7511-7516). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Scan blocked | Submission refused with the scan description. | plugin-submission-service.ts:199-205 |
| Unverified email | Forbidden with a user-safe message. | submissions/route.ts:48-52 |
| Not your plugin | Not found, user-safe message. | submissions/route.ts:65-67 |
| Decision conflict | Only pending can be approved or rejected; only approved can be suspended. | plugin-submission-service.ts:339-349 |
| Partner form errors | Validation error 'Check the form and try again.' | apply/route.ts:40-42 |
| Offline, timeout, cancel | not handled in the code beyond generic errors | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/admin/plugin-submissions/__tests__`: Admin submission list (directory exists).
- `apps/web/app/api/admin/plugin-submissions/[id]/__tests__`: Admin decision route (directory exists).
- `apps/web/app/api/partners/apply/__tests__`: Partner application route (directory exists).
- `apps/web/app/api/plugins/marketplaces/__tests__`: Marketplace routes (directory exists).
- `packages/ui/ui/src/directory/__tests__`: Directory UI tests (directory exists; files not listed).
- `apps/cli/src/cloud/marketplaces.rs`: CLI source file, may hold unit tests (not opened).

**Test scenarios**

- **Submit a plugin**
  1. Create a plugin as a verified user.
  2. Press Submit and confirm.
  - Expected: Status shows pending; an audit event is written.
- **Unverified user**
  1. Submit as a user with an unverified email.
  - Expected: Refused with verification message.
- **Admin approve**
  1. Open /admin/plugins as admin; approve a pending item.
  - Expected: Status approved; earlier approved version becomes withdrawn.
- **CLI add**
  1. Run agi marketplace add owner/repo.
  2. Run agi marketplace sources.
  - Expected: Source listed with entry count.
- **Partner form**
  1. Submit a valid application.
  - Expected: Reference PA-XXXXXXXXXX shown; support inbox gets an email.

**Where to look when it fails**

- Audit event plugin_marketplace_changed.
- Table plugin_submissions, scan_verdict and status.
- Email provider logs for partner applications.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/web/107-discovery-social-and-public-content-products.md)
- Desktop: [70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md)
- CLI: [70-qa/test-plans/cli/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/cli/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **No merchant or partner program.** Affects: All apps. Evidence: brief S107.22; partners page. Work needed: Product decision.
- **Mobile has no submission or marketplace add.** Affects: Mobile. Evidence: brief S107.20. Work needed: Decide scope.
- **Partner applications are email only.** Affects: Operators. Evidence: apply/route.ts. Work needed: Store and track applications.
- **Publisher attribution on the directory not verified end to end.** Affects: Web, desktop. Evidence: DirectoryPanel.tsx:608-616 shows a publisher filter. Work needed: Verify in the running app.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- table:plugin_submissions
- api:POST /api/plugins/submissions
- api:POST /api/plugins/marketplaces
- api:POST /api/partners/apply
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-security-and-privacy
- F107-12

## Unknown

- Exact submit and withdraw label strings (constants not opened).
- Where the marketplaces table and route handler store sources.
- Whether desktop supplies submitPlugin to the directory adapter.
- Whether the scan uses a model.
- Retention of partner emails.
- Contents of /plugins page (read only via the brief).
