---
id: "F033-09"
type: "feature"
title: "Report and moderation"
aliases: ["Report infringement or impersonation", "Report content link", "Copyright notice", "Takedown", "Operator takedown", "Content moderation on publish", "S33.28 Abuse reporting", "S33.29 Content moderation"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S33.28", "S33.29"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "F033-01", "F033-02", "F033-05", "table:copyright_notices", "table:published_artifacts", "api:POST /api/copyright-notice", "api:POST /api/admin/takedown"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-09 Report and moderation

A visitor on a shared page can follow 'Report infringement or impersonation' and file a notice that is recorded and emailed to operators. Only a platform operator can remove the page, through an audited takedown API. Publishing and restoring a version also check the title and content against the usage policy.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.28](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3328), [S33.29](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3329).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives people a way to report a public shared page, keeps a numbered record of each notice, and gives operators a separate, audited way to unpublish. It also stops content that fails the usage policy or the sharing gate from being published (published-artifact-publication-policy.ts:55-72).

**Why it exists.** Public links can host infringing or impersonating material. An anonymous allegation must not be able to take down a stranger's page, so intake and removal are separate (takedown/route.ts:19-26).

**Who uses it.** Visitors and rights holders (reporting), platform operators (takedown and dispositions), and publishers (affected by the policy check).

**Problems it solves**

- No way for a rights holder without an account to report content.
- Abuse of reporting to remove other people's pages.
- Publishing content that breaks the usage policy.
- Operators lacking an audit trail of removals.

**Use cases**

- A designer finds their logo used on a shared page and files a copyright notice.
- A person finds a page impersonating their company and files an impersonation report.
- An operator looks up a token, reads the notice, and unpublishes the page with a reason.
- A publisher tries to publish text that the policy filter blocks and is told why.

## 2. User experience

**Where to find it**

- Web published page footer: link 'Report infringement or impersonation' (ReportContentLink.tsx:20-22), rendered by the shared-artifact page (page.tsx:95).
- Report form page: /copyright/report, titled 'Report infringing or impersonating content.' (report/page.tsx:12-24).
- Policy page: /copyright (apps/web/app/copyright/page.tsx).
- Operators: API only: GET and POST /api/admin/takedown and /api/admin/copyright-notices; no screen found.
- Desktop: the hosted web page inside Electron shows the same footer (doc: AGENTS.md section 5) [inferred].
- Mobile, CLI, VS Code, Chrome: not applicable per the brief.

**Before you start**

- Reporter: none, no account needed (copyright-notice/route.ts:27-31).
- Operator: a platform admin from the operator allowlist (takedown/route.ts:46, 67).
- Publisher: the sharing gate for external sharing must allow publishing.

**Screens and controls**

- Footer link carries the page path into the form as ?url= (ReportContentLink.tsx:3-5).
- The form asks notice type (copyright, trademark, impersonation), reporter name and email, phone and address for copyright and trademark, rights holder, a description, a signature and three affirmations (copyright-notice/route.ts:43-66).
- Only /share/ and /shared-artifact/ URLs are accepted as the reported URL (report/page.tsx:16-27).

**Journey**

1. A visitor opens a shared page and scrolls to the footer.
2. They choose 'Report infringement or impersonation'.
3. The form opens with the page address filled in.
4. They complete it and submit; the server finds the page by token, records the notice, writes a security-audit event, and emails the operators.
5. The screen shows 'Notice recorded, reference <IP-...>' or 'Report recorded' for impersonation, and says whether the operator was notified (CopyrightNoticeForm.tsx:213-229).
6. An operator opens the email, looks up the token with GET /api/admin/takedown, and, if justified, POSTs the takedown with a reason.
7. An operator can set a notice's disposition (actioned, rejected, counter_notified) through POST /api/admin/copyright-notices.

**What the person sees and gets**

- Reporter: a reference such as IP-XXXXXXXXXX and a flag operatorNotified (copyright-notice/route.ts:259-264).
- Operator: takedown response { success, kind, token, ownerId, title } (takedown/route.ts:115-121).
- Publisher refused by policy: message 'This artifact cannot be published because it violates the AGI Workforce usage policy.' (publication-policy.ts:12-18).
- Audit: security events content_notice and admin_action (high severity).

**Settings**

- Operator allowlist for platform admins: requirePlatformAdmin; with none configured everyone is refused (takedown route.test.ts:187-195).
- Alert address: the support handoff fallback email (copyright-notice/route.ts:179).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The shared artifact page renders the report footer (page.tsx:95; ReportEntryPoints.test.tsx:70-79).
- Public intake validates, resolves the token, records the notice in copyright_notices, logs a security event and emails operators; it never unpublishes (copyright-notice/route.ts:207-262).
- Takedown deletes the published_artifacts row (or the shared_sessions row), after a required audit write, and only for a platform operator (takedown/route.ts:61-121).
- Operators can list and set dispositions through /api/admin/copyright-notices (route.ts:53-109).
- Publish and version-restore call preparePublishedArtifactPublication: external-sharing gate, usage-policy moderation on title and content, and outbound content inspection (publish/route.ts:63; versions/[version]/route.ts:69).
- Runtime AI prompts are moderated too (artifact-completion.ts:170-181).

**Incomplete**

- Removal is a hard delete of the published row with no owner notice found in the code read (takedown/route.ts:99-108).
- Moderation is a text filter of five categories and does not read images; the acceptable-use test states what it screens (published-safety-claims.test.ts:48-56, 127).
- Visibility changes after publish (audience patch) were not seen to call the content policy; only publish and restore were found (grep of preparePublishedArtifactPublication callers).

**Present but disconnected or switched off**

- No screen for operators; takedown and dispositions are API calls only.

**Not available**

- Mobile, CLI, VS Code and Chrome have no report control (brief marks them n/a).
- In-product report button inside the app for a signed-in viewer: none found; only the footer link.
- Automatic takedown from a report: deliberately absent (copyright-notice/route.ts:20-26).

## 4. Required behaviour

**Established requirements**

- S33.28: a visitor can report an abusive published site. Brief status: web done, desktop done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.28)
- S33.29: published sites are subject to content moderation (review and takedown). Brief status: web done, desktop done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.29)
- Owner delete stays owner-only; takedown is a separate platform-operator-gated, audited path; public intake never removes content. (source: apps/web/app/api/admin/takedown/route.ts:19-26)
- A takedown records actor, owner and reason in the security audit log. (source: apps/web/app/api/admin/takedown/__tests__/route.test.ts:159-175)
- A notice's record outlives the accused account's erasure. (source: apps/web/db/neon/0122_copyright_notices.sql:20-27)
- Legal and policy text is written by Opus only; the repository copies the leaders' policy, stricter wins. (source: doc: CLAUDE.md (Delegation) and memory index)

**Acceptance criteria**

1. A published artifact page contains a link labelled 'Report infringement or impersonation' that opens /copyright/report?url=%2Fshared-artifact%2F<token>.
2. Submitting a valid notice for a live token returns a reference starting IP- and writes one copyright_notices row and one content_notice security event.
3. Submitting a notice for a token with no public content returns 404 and records nothing.
4. A notice never unpublishes the page.
5. POST /api/admin/takedown by a non-operator returns a refusal and leaves the page published.
6. POST /api/admin/takedown by an operator with a reason removes the page; the link then shows the unavailable page.
7. Publishing content that fails the usage policy is refused with the policy message.
8. A takedown request without a reason is rejected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The publisher should be told when their page is taken down [inferred; no notice found].
- Taken-down content should be recoverable by the operator for appeals [inferred from the counter_notified status; the delete is permanent in code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] An operator console for notices and takedowns.
- [proposed] Archive the row before delete and notify the publisher.
- [proposed] A report control inside the signed-in viewer for non-rights-holder abuse (spam, harm).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Footer link and reportHref builder. |
| screen | Report form page | `apps/web/app/copyright/report/page.tsx` | Page at /copyright/report; accepts only /share/ and /shared-artifact/ URLs. |
| component | CopyrightNoticeForm | `apps/web/app/copyright/report/CopyrightNoticeForm.tsx` | The form, submit state and result text. |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Renders ReportContentLink at line 95. |
| endpoint | POST /api/copyright-notice | `apps/web/app/api/copyright-notice/route.ts` | Public intake: validate, record, audit, email. |
| endpoint | GET and POST /api/admin/takedown | `apps/web/app/api/admin/takedown/route.ts` | Lookup and operator takedown. |
| service | findPublicTarget | `apps/web/app/api/admin/takedown/lib/public-target.ts` | Resolves a token to a share or published artifact. |
| endpoint | GET and POST /api/admin/copyright-notices | `apps/web/app/api/admin/copyright-notices/route.ts` | Operator list and disposition. |
| service | copyright-notices | `apps/web/lib/server/copyright-notices.ts` | recordCopyrightNotice, listCopyrightNotices, setCopyrightNoticeDisposition. |
| table | copyright_notices | `apps/web/db/neon/0122_copyright_notices.sql` | Stores notices; status received, actioned, rejected, counter_notified. |
| service | Publication policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | Sharing gate, moderation, outbound inspection on publish. |
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Calls the policy before saving (line 63). |
| endpoint | Version restore route | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Calls the policy on restore (line 69). |
| service | moderateManagedPrompt | `apps/web/lib/moderation` | Text filter used with surface 'published-artifact' (imported at publication-policy.ts:9). Exact file not opened. |
| service | logSecurityEvent | apps/web/lib/security-audit (not found) (not found) | Writes content_notice and admin_action events. |
| service | sendSupportEmail | apps/web/lib/support/handoff/resend-client (not found) (not found) | Emails the operator alert. |
| table | published_artifacts | `apps/web/db/neon` | Row deleted by takedown (takedown/route.ts:101-107). |
| test | Takedown tests | `apps/web/app/api/admin/takedown/__tests__/route.test.ts` | Operator-only removal and audit. |
| test | Notice intake tests | `apps/web/app/api/copyright-notice/__tests__/route.test.ts` | Intake rules. |
| test | Report entry point tests | `apps/web/app/copyright/report/__tests__/ReportEntryPoints.test.tsx` | Footer link on shared pages. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The visitor's browser loads the shared page and the footer link, then the report form with the page path. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:95; report/page.tsx:30-60 |
| Form submit posts to the intake endpoint with CSRF and the 'waitlist' rate limit bucket. | our servers | apps/web/app/api/copyright-notice/route.ts:208-213 |
| The server normalizes the token, looks it up in shared_sessions and published_artifacts, records the notice and writes the audit event. | our servers | copyright-notice/route.ts:222-258; takedown/lib/public-target.ts:24-72 |
| An email goes to the support fallback address through the email service, with the next-step takedown instruction. | outside service | copyright-notice/route.ts:106-160, 177-185 |
| An operator POSTs the takedown; the server writes a required audit event and deletes the row. | our servers | apps/web/app/api/admin/takedown/route.ts:72-108 |
| At publish and restore, title and content go through the sharing gate, the text filter and outbound inspection before saving. | our servers | apps/web/lib/services/published-artifact-publication-policy.ts:55-80 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notice: reference, type, reporter name and email, organization, target kind and token, owner id, description, signature, status, disposition note. | table copyright_notices. | Server only. | Kept on purpose when the accused account is erased (0122 lines 20-27). |
| Security events content_notice and admin_action with token, owner and reason. | the security audit log. | Server only. | Retention unknown here. |
| The taken-down published row and its saved app data. | published_artifacts; published_artifact_storage cascades. | n/a | Deleted permanently by takedown; no archive step found. |

**Models and providers.** The moderation filter is a local text-rule function, not a model call as far as the code read shows (moderateManagedPrompt usage in publication-policy.ts:12-18). No provider is involved in reporting or takedown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reporting: none required; a signed-in reporter's id is recorded when present. Takedown: operator account. |
| Permissions | Takedown and disposition need requirePlatformAdmin, so an organization admin is refused (takedown route.test.ts:176-195). Owner removal stays on the owner-only route. |
| Subscription | None found in the code for reporting or takedown. The external sharing gate is a workspace policy, not a plan gate. |
| Limits and metering | Intake uses the 'waitlist' rate limit bucket; takedown uses 'admin-security'. Field limits in the schema (copyright-notice/route.ts:43-66). |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Email goes through the support handoff email provider; no AI provider. |
| Local mode | Not applicable: reporting and moderation concern cloud-hosted public pages only. Local mode creates no public page. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Token not found or page already removed | Intake answers 404 'Nothing is published at that URL any more'. | copyright-notice/route.ts:229-232; route.test.ts:178-185 |
| URL is not a shared page | 400 'That is not a shared conversation or published artifact URL from this site'. | copyright-notice/route.ts:222-227; route.test.ts:187-194 |
| Unaffirmed statements | Validation refusal. | route.test.ts:196-201 |
| Operator email cannot be sent | Notice still recorded, reference returned with operatorNotified false, error logged. | copyright-notice/route.ts:177-199; route.test.ts:203 |
| Non-operator calls takedown | Refused; content stays. | takedown route.test.ts:176-195 |
| Takedown without reason | Bad request. | takedown route.test.ts:197-202 |
| Audit write fails | Takedown does not run because the audit event is required. | takedown/route.ts:84-98 |
| Publish content fails the filter | Validation error with the policy message; nothing is published. | publication-policy.ts:12-18 |
| Form submitting | Ignores repeat submits while in 'submitting' state. | CopyrightNoticeForm.tsx:84, 143 |
| Offline or timeout for the form | Not handled in the code read beyond the error state. | CopyrightNoticeForm.tsx:84 |
| Accessibility | Footer link is a plain link with underline; form has labelled fields; screen-reader testing: not handled in the code read. | ReportContentLink.tsx:19-23 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/admin/takedown/__tests__/route.test.ts`: Operator-only unpublish of share and artifact, audit record, reason required, 404, lookup.
- `apps/web/app/api/copyright-notice/__tests__/route.test.ts`: Anonymous notice, audit entry, artifact URL, never unpublishes, rejects bad URLs, undelivered alert.
- `apps/web/app/copyright/report/__tests__/ReportEntryPoints.test.tsx`: Report link on shared conversation and published artifact pages and its encoded URL.
- `apps/web/app/api/admin/copyright-notices/__tests__/route.test.ts`: Operator notice list and disposition (file present; contents not read).
- `apps/web/db/neon/copyright-notices-migration.test.ts`: The notices migration (file present; contents not read).
- `apps/web/lib/services/published-artifact-publication-policy.restore.test.ts`: Policy on version restore.
- `apps/web/app/__tests__/published-safety-claims.test.ts`: What the usage-policy filter screens, and that it runs at publish (line 71).
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route (moderation case not located by search).

**Test scenarios**

- **File a report**
  1. Open a shared artifact link.
  2. Click 'Report infringement or impersonation'.
  3. Fill and submit the form.
  - Expected: A reference IP-... is shown; one copyright_notices row exists; the page is still public.
- **Report a dead link**
  1. Unpublish the artifact.
  2. Open /copyright/report?url=/shared-artifact/<token> and submit.
  - Expected: 404 'Nothing is published at that URL any more'.
- **Operator takedown**
  1. As an operator, GET /api/admin/takedown?token=<token>.
  2. POST the token with a reason.
  - Expected: Success body with owner and title; opening the link shows the unavailable page; an admin_action event is logged.
- **Non-operator takedown**
  1. As an organization admin who is not an operator, POST the same request.
  - Expected: Refusal; page remains.
- **Policy refusal on publish**
  1. Try to publish content in a blocked category.
  - Expected: Validation error 'This artifact cannot be published because it violates the AGI Workforce usage policy.'

**Where to look when it fails**

- Table copyright_notices (status column).
- Security audit events content_notice and admin_action.
- Log event copyright_notice_alert_undeliverable and copyright_notice_alert_failed.
- Log 'Admin takedown failed'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No operator screen; removal and notice handling are API only.** Affects: Operators.. Evidence: No page under apps/web for takedown found; routes under api/admin only.. Work needed: Build an operator console or document the runbook.
- **Takedown is a permanent delete with no publisher notice or archive found.** Affects: Publishers, appeals.. Evidence: takedown/route.ts:99-108.. Work needed: Archive then delete, and notify the publisher.
- **Moderation covers publish and restore, and was not seen on audience changes.** Affects: Owners changing visibility of already published pages.. Evidence: Only two callers of preparePublishedArtifactPublication.. Work needed: Confirm and, if needed, re-check on visibility change.
- **Report options are rights-holder oriented; no general abuse type such as spam or harm.** Affects: Visitors.. Evidence: CONTENT_NOTICE_TYPES copyright, trademark, impersonation (copyright-notices.ts:7).. Work needed: Decide whether to add abuse categories.
- **Brief says the link placement was unconfirmed; code confirms it, but no end-to-end check on desktop.** Affects: Desktop.. Evidence: page.tsx:95.. Work needed: Drive the Electron app and confirm the footer.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- F033-01
- F033-02
- F033-05
- table:copyright_notices
- table:published_artifacts
- api:POST /api/copyright-notice
- api:POST /api/admin/takedown

## Unknown

- Whether the publisher is told when a page is taken down.
- How operators actually receive and work notices beyond the email (runbook not read).
- Whether moderation is re-run when an owner changes the audience of a published page.
- Contents of the admin copyright-notices route tests and the migration test (present, not read).
- Whether the Electron desktop window renders the footer (assumed from the hosted web app).
- Retention of security audit events.
- Whether any listed test has passed; no result file was read.
