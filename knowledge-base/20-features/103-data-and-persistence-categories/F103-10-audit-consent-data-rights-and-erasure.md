---
id: "F103-10"
type: "feature"
title: "Audit, consent, data rights and erasure"
aliases: ["Audit, consent, data rights and erasure", "Audit events", "security_audit_logs", "Consent and policy acceptance", "consent_records", "Data-rights requests", "DPDP request", "Legal hold", "Retention sweep", "Retention and deletion records", "Privacy requests"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.34", "S103.36", "S103.37"]
depends_on: ["SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-observability-and-operations", "SYS-api-and-contracts", "surface:web", "mode:cloud", "table:security_audit_logs", "table:consent_records", "table:data_rights_requests", "table:legal_holds"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-10 Audit, consent, data rights and erasure

Server records that prove and enforce privacy duties: an append-only security audit trail, consent rows carrying the notice version and surface, data-rights requests with a DPDP reference, legal holds that suspend deletion, retention sweeps recorded per workspace, and a retention matrix describing what each store erases.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.34](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10334), [S103.36](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10336), [S103.37](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10337).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Writes security events to security_audit_logs (and enterprise events for workspaces), records each consent decision as a new row, queues access, correction, erasure, withdrawal, nomination and grievance requests with a DPDP reference, lets workspace admins place legal holds, and runs retention sweeps that record what they deleted or held back (apps/web/lib/security-audit.ts:78-110; apps/web/lib/server/consent-records.ts:83-110; apps/web/lib/server/data-rights-requests.ts:12-20; apps/web/lib/services/retention-service.ts:90-205).

**Why it exists.** To evidence privacy law duties (consent with notice version, rights requests with a clock) and to keep deletion safe: a hold must beat every sweep (docs/compliance/legal-hold-and-ediscovery.md).

**Who uses it.** Any visitor or signed-in person (consent, rights requests); workspace owners and admins (legal holds, retention); operators and auditors (audit, queue).

**Problems it solves**

- Audit history cannot be edited by the app role; a trigger blocks update and delete (apps/web/db/neon/0123_audit_log_immutability_trigger.sql:65).
- Withdrawal is a new row, never an update, so history shows what the person agreed to and when (apps/web/db/neon/0113_dpdp_consent_records.sql comments).
- A held subject is never partly erased: account erasure aborts under a hold (apps/web/lib/server/account-erasure.ts:893-970).
- The sweep fails closed if holds cannot be read (apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql header).

**Use cases**

- Submit an erasure request and receive a DPDP-style reference.
- Withdraw product analytics consent.
- Admin places a hold on a member during a dispute; the nightly sweep skips that data.
- Auditor reads which sweeps deleted or held rows.

## 2. User experience

**Where to find it**

- Web: page /privacy/requests with a rights form and a Consent Centre (apps/web/app/privacy/requests/RightsRequestForm.tsx; ConsentCentre.tsx; YourRightsRequests.tsx).
- Rights request types in the form: Access, Correction, Erasure, Withdraw consent, Nomination, Grievance (apps/web/app/privacy/requests/RightsRequestForm.tsx:10-35).
- Legal holds: workspace settings, API apps/web/app/api/settings/organization/legal-holds/route.ts; screen component not located.
- Mobile: consent surface value 'mobile-settings' exists (apps/web/lib/consent-purposes.ts:112-120); screen not traced.
- Audit trail: no end-user screen located; workspace audit read is by role audit.read (docs and routes, not opened).

**Before you start**

- Rights requests and consent: sign-in optional (apps/web/app/api/privacy/requests/route.ts:104-110).
- Legal holds: workspace owner or admin (apps/web/app/api/settings/organization/legal-holds/route.ts requireAdmin, line 50ff).

**Screens and controls**

- Rights form: request type select ('Choose one…'), contact email, details (max 4000 characters).
- Consent Centre: purposes 'Allow product analytics.', 'Email me product news, tips and offers.', 'Also email me product updates and launch news.' and waitlist purposes (apps/web/lib/consent-purposes.ts:12-45).

**Journey**

1. Open /privacy/requests.
2. Pick a request type, give an email and details, submit.
3. Server stores the request, emails the operator inbox, writes an audit event and returns reference, status 'received' and operatorNotified.
4. Person can list their requests (up to 100).
5. Consent: toggle a purpose; server appends a row with granted true or false, the notice version and the surface.

**What the person sees and gets**

- Response fields reference, requestType, status, createdAt, operatorNotified (apps/web/app/api/privacy/requests/route.ts:143-150).
- Reused submission token returns the same reference (apps/web/lib/server/data-rights-requests.ts:122-150).
- 409 message if the token was used for different details.

**Settings**

- Consent purposes list; marketing email setting (ConsentCentre.marketing-email test).
- Workspace retention window and enforce switch (organization_admin_policies.retention_days, retention_enforced, default off).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- recordAuditEvent and logSecurityEvent insert into security_audit_logs; enterprise events also written when a workspace is known; write failure is logged and, unless required, swallowed (apps/web/lib/security-audit.ts:78-110,610-720).
- Append-only trigger plus REVOKE of update and delete from app_rls; only the table owner passes the trigger; cleanup_old_security_logs() and delete_user_data() are SECURITY DEFINER (apps/web/db/neon/0123_audit_log_immutability_trigger.sql; 0043_audit_log_immutability.sql:38).
- Daily purge keeps 90 days and records a retention_purge event (apps/web/lib/server/security-log-retention.ts:6,32-70; vercel.json 07 02 daily).
- Consent: insert-only rows with purpose, granted, notice_version, surface; five purposes and a surface list; email-keyed rows hashed (apps/web/lib/server/consent-records.ts; apps/web/lib/consent-purposes.ts).
- Data-rights: six request types, DPDP- reference of 10 characters, replay-safe submission token, deadline calculation, operator queue ordered by deadline (apps/web/lib/server/data-rights-requests.ts; apps/web/lib/compliance/data-rights-deadlines.ts).
- Legal holds: scopes organization, member, custodian, optional resource types; create and release routes with audit events at create and release; release is an update, not a delete (apps/web/lib/services/retention-service.ts:90-180; apps/web/app/api/settings/organization/legal-holds/route.ts:161,208).
- Retention sweep per workspace, opt-in, records outcome deleted, nothing_due, held, aborted or failed in organization_retention_sweeps (apps/web/lib/services/retention-service.ts:182-204); domain sweeps for projects, work, files, artifacts, connector data, notifications and more (apps/web/lib/services/domain-retention-service.ts).
- Deletion manifest: RETENTION_MATRIX built from the erasure lists, retained-table reasons and financial rules (apps/web/lib/services/deletion-manifest.ts:395-518).

**Incomplete**

- No application code was found that moves a data_rights_requests row from received to in_progress, resolved or rejected; the admin route only reads (apps/web/app/api/admin/privacy/requests/route.ts:49; grep for updates found none).
- An erasure-type rights request only queues and emails; erasure itself runs through account deletion code, not through the request (apps/web/app/api/privacy/requests/route.ts:81-150) [inferred].

**Present but disconnected or switched off**

- Workspace retention does nothing until an owner sets a window and turns enforcement on (apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql header; apps/web/lib/server/retention/enforcement.ts:21-24).
- Migration 0205 header: NOT YET APPLIED; production state unknown.

**Not available**

- Editing a live hold: not available; release and re-place (docs/compliance/legal-hold-and-ediscovery.md).
- Holds do not cover connector documents or stores outside the seven held resources (same document).

## 4. Required behaviour

**Established requirements**

- Audit events are durably and append-only recorded and classified as audit trail. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.34)
- Retention sweeps, deletion requests, holds and erasure records are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.36)
- Consent and policy acceptance, with version, are durably recorded and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.37)
- Audit rows cannot be updated or deleted by the app role; only the owner purges for retention. (source: apps/web/db/neon/0123_audit_log_immutability_trigger.sql)
- A withdrawal is a new row; the newest row per subject and purpose is the live state. (source: apps/web/db/neon/0113_dpdp_consent_records.sql comments)
- Retention never beats a hold; a hold suspends the sweep for the held data; a refused deletion is itself audited as deletion_blocked_by_legal_hold. (source: docs/compliance/legal-hold-and-ediscovery.md)
- An action a user cannot undo asks first and the question names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. An UPDATE or DELETE on security_audit_logs by the app role fails with insufficient_privilege.
2. Granting then withdrawing a purpose gives two rows and hasConsent returns false.
3. Each consent row stores the current notice version for its purpose and a known surface.
4. A rights request returns a DPDP-prefixed reference and an audit event privacy_request_submitted.
5. Posting the same submission token twice returns the same reference with no second row.
6. With an active hold on a member, the workspace sweep deletes none of that member's held conversations and records outcome held.
7. Account erasure of a held subject is abandoned and nothing is deleted.
8. Releasing a hold sets released_at and released_by_user_id and writes legal_hold_released.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Audit coverage of rights actions is expected on every surface; only web routes were examined [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a route or job that moves rights requests through statuses and records the resolution note.
- [proposed] Decide whether consent rows should survive account erasure as evidence; today they are erased with the account (apps/web/lib/server/account-erasure.ts:152).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | security-audit | `apps/web/lib/security-audit.ts` | logSecurityEvent and recordAuditEvent writers. |
| table | security_audit_logs | `apps/web/db/neon/0014_security.sql` | Audit table. |
| schema | audit immutability | `apps/web/db/neon/0123_audit_log_immutability_trigger.sql` | Append-only trigger; owner exempt. |
| service | security-log-retention | `apps/web/lib/server/security-log-retention.ts` | 90 day purge through the privileged function. |
| job | purge-security-audit-logs cron | `apps/web/app/api/cron/purge-security-audit-logs/route.ts` | Daily purge. |
| service | consent-records | `apps/web/lib/server/consent-records.ts` | Record and read consent. |
| config | consent-purposes | `apps/web/lib/consent-purposes.ts` | Purpose ids, labels and surfaces. |
| table | consent_records | `apps/web/db/neon/0113_dpdp_consent_records.sql` | Insert-only consent ledger. |
| endpoint | Consent | `apps/web/app/api/consent/route.ts` | GET and POST consent. |
| service | data-rights-requests | `apps/web/lib/server/data-rights-requests.ts` | Create, list, read open queue. |
| table | data_rights_requests | `apps/web/db/neon/0114_data_rights_requests.sql` | Request store with status and resolution_note columns. |
| endpoint | Privacy requests | `apps/web/app/api/privacy/requests/route.ts` | POST submit, GET own requests. |
| endpoint | Admin privacy queue | `apps/web/app/api/admin/privacy/requests/route.ts` | GET open queue. |
| service | data-rights-deadlines | `apps/web/lib/compliance/data-rights-deadlines.ts` | Statutory due date and ordering. |
| service | retention-service | `apps/web/lib/services/retention-service.ts` | Legal holds, workspace sweep, sweep records. |
| service | domain-retention-service | `apps/web/lib/services/domain-retention-service.ts` | Per-domain sweeps that exclude held rows. |
| table | legal_holds and organization_retention_sweeps | `apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql` | Holds and sweep evidence. |
| schema | custodians and resource scope | `apps/web/db/neon/0261_legal_hold_custodians_and_resource_scope.sql` | Custodian scope, resource types. |
| endpoint | Legal holds | `apps/web/app/api/settings/organization/legal-holds/route.ts` | GET list, POST create, DELETE release. |
| job | retention crons | `apps/web/app/api/cron/enforce-workspace-retention/route.ts` | Nightly workspace sweep; enforce-domain-retention does domains. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Describes per store erasure, age and retained reason. |
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | User scoped erasure lists, hold check that aborts, retained table reasons. |
| service | organization-erasure | `apps/web/lib/server/organization-erasure.ts` | Workspace erasure lists. |
| component | RightsRequestForm and ConsentCentre | `apps/web/app/privacy/requests/RightsRequestForm.tsx` | Web screens for requests and consent. |
| other | legal hold document | `docs/compliance/legal-hold-and-ediscovery.md` | Describes hold behaviour and limits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person submits a rights request from the web form. | device and our servers | apps/web/app/privacy/requests/RightsRequestForm.tsx; apps/web/app/api/privacy/requests/route.ts:81 |
| Server checks CSRF and rate limit, validates, inserts the request, then emails the operator inbox through the support email sender. | our servers | apps/web/app/api/privacy/requests/route.ts:81-125,38-76 |
| Email delivery runs at an outside mail service. | outside service | apps/web/app/api/privacy/requests/route.ts:58 (sendSupportEmail) |
| Consent decision inserts a new row with notice version and surface. | our servers | apps/web/lib/server/consent-records.ts:83-110 |
| Admin places a hold; sweeps render the hold exclusion inside their delete statements. | our servers | apps/web/lib/services/retention-service.ts:90-140; docs/compliance/legal-hold-and-ediscovery.md |
| Nightly crons run sweeps and log each outcome. | our servers | apps/web/app/api/cron/enforce-workspace-retention/route.ts; vercel.json 5 4 * * * |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Audit events | security_audit_logs (and enterprise audit events for workspaces) | Server only; may stream to audit destinations (drain-audit-streams cron exists) | 90 days; privileged purge only; erased for a subject by delete_user_data() |
| Consent rows | consent_records (user id or hashed email) | Server only | Erased with the account (user id rows); anonymous rows by email erasure (apps/web/lib/server/anonymous-erasure.ts:17) |
| Rights requests including plaintext contact email | data_rights_requests | Server only | Account-bound rows erased with the account; anonymous by email |
| Holds and sweep records | legal_holds, legal_hold_custodians, organization_retention_sweeps, organization_domain_retention_sweeps | Server only | Holds are released, not deleted; sweep records are audit-trail class |

**Models and providers.** No model or inference provider is involved. The mail provider carries the operator alert. Provider retention claims are a separate feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rights requests, consent and the privacy page work without an account; own-request listing needs sign-in. |
| Permissions | Legal holds need workspace owner or admin; sweep and holds are workspace scoped; audit write has no user permission; admin queue is an admin route. |
| Subscription | Workspace retention commitments depend on plan through canUseBillingPlanCapability (apps/web/lib/server/retention/enforcement.ts:4); exact tiers not read. |
| Limits and metering | Request details 4000 characters; list of own requests 100; admin queue limit 1-500; sweep batches 200 per run, 10 batches (apps/web/lib/services/domain-retention-service.ts:79-80); audit retention 90 days; rate bucket 'waitlist' on rights requests. |
| Feature flags | Workspace retention_enforced default false; production phase flags for sweeps: isRetentionSweepEnabled. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | These records are server-side. Local mode on device keeps data on the device and writes none of them; whether device-side consent records exist is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Audit write fails | Logged and swallowed unless required is set. | apps/web/lib/security-audit.ts:102-108 |
| Hold set unreadable | Erasure treated as held and abandoned; sweep fails closed. | apps/web/lib/server/account-erasure.ts:893-930 |
| Operator email undeliverable | Request is kept; response operatorNotified false; error logged. | apps/web/app/api/privacy/requests/route.ts:62-75 |
| Request reference collision | One retry with a new reference. | apps/web/lib/server/data-rights-requests.ts:172-188 |
| Same token, different details | Conflict error. | apps/web/lib/server/data-rights-requests.ts:105-118 |
| Release of unknown or foreign hold | Same null answer, hiding existence. | apps/web/lib/services/retention-service.ts:150-153 |
| Unknown consent purpose or surface | Throws. | apps/web/lib/server/consent-records.ts:84-89 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/security-audit.test.ts`: Audit writers.
- `apps/web/db/neon/audit-log-immutability-migration.test.ts`: Append-only migration.
- `apps/web/__tests__/security/security-log-retention.test.ts`: Audit purge.
- `apps/web/__tests__/audit-log-immutability-disclosure.test.ts`: Published claim matches the control.
- `apps/web/lib/server/consent-records.test.ts`: Consent writer and readers.
- `apps/web/lib/consent-purposes.test.ts`: Purpose list.
- `apps/web/db/neon/dpdp-consent-migration.test.ts`: Consent table migration.
- `apps/web/lib/server/data-rights-requests.test.ts`: Request creation and replay.
- `apps/web/lib/compliance/data-rights-deadlines.test.ts`: Due dates.
- `apps/web/lib/services/__tests__/retention-service.test.ts`: Workspace sweep and holds.
- `apps/web/lib/services/__tests__/legal-hold-gate.test.ts`: Hold predicate.
- `apps/web/lib/services/__tests__/legal-hold-deletion-paths.test.ts`: Every deletion path honours holds.
- `apps/web/lib/services/__tests__/domain-retention-service.test.ts`: Domain sweeps.
- `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: Retention matrix.
- `apps/web/lib/server/account-erasure.test.ts`: Account erasure.
- `apps/web/app/privacy/__tests__/retention-claims-match-crons.test.ts`: Published retention claims match crons.

**Test scenarios**

- **Audit rows immutable**
  1. As the app role run UPDATE and DELETE on security_audit_logs in a test database.
  - Expected: Both fail with insufficient_privilege.
- **Consent history**
  1. POST consent granted for a purpose.
  2. POST withdrawn for the same purpose.
  3. Read consent_records and readUserConsents.
  - Expected: Two rows; latest granted false; notice_version and surface present.
- **Rights request**
  1. Submit an erasure request on /privacy/requests.
  2. Read data_rights_requests and the audit table.
  - Expected: Row with DPDP reference, status received; audit event privacy_request_submitted.
- **Hold beats sweep**
  1. Set retention 1 day and enforce on for a test workspace with old conversations.
  2. Place a member hold.
  3. Run the workspace retention cron.
  - Expected: Held conversations remain; sweep record outcome held or deleted counts exclude them.
- **Held erasure**
  1. Place a hold covering a test user.
  2. Run account erasure.
  - Expected: Nothing is deleted; reason names the active hold.
- **Hold release**
  1. Release the hold through DELETE.
  - Expected: released_at set; legal_hold_released audit event.

**Where to look when it fails**

- Log events data_rights_request_alert_undeliverable and data_rights_request_alert_failed.
- Audit event types legal_hold_created, legal_hold_released, privacy_request_submitted, retention_purge, deletion_blocked_by_legal_hold.
- Tables organization_retention_sweeps (outcome, error), legal_holds, consent_records, data_rights_requests.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No code moves a rights request out of 'received'; resolution and resolution_note have no writer found.** Affects: Requesters and operators; the statutory clock has no closing step in code.. Evidence: apps/web/app/api/admin/privacy/requests/route.ts exposes only GET; no update statement found in apps/web app or lib.. Work needed: Add an operator action to change status with a note and an audit event, or document the manual process.
- **The table comment says writing a row notifies nobody, but the route now emails operators.** Affects: Engineers.. Evidence: apps/web/db/neon/0114_data_rights_requests.sql comment vs apps/web/app/api/privacy/requests/route.ts:58. Work needed: Correct the comment in a new migration only if the chain allows; otherwise record in docs.
- **The brief says erasure is driven by the deletion manifest; in code the manifest is derived from the erasure lists, which drive deletion.** Affects: Engineers.. Evidence: apps/web/lib/services/deletion-manifest.ts:1-22,395-440. Work needed: Correct the brief.
- **Consent and rights records are erased with the account, so they do not remain as evidence of what was agreed.** Affects: Compliance.. Evidence: apps/web/lib/server/account-erasure.ts:152-153. Work needed: Decide whether a minimal tombstone should be kept.
- **Audit write failures are swallowed by default.** Affects: Auditors.. Evidence: apps/web/lib/security-audit.ts:102-108. Work needed: List actions that must use required mode.
- **Only web routes were examined; consent surfaces for desktop, CLI, VS Code and Chrome are not in the surface list.** Affects: Those apps.. Evidence: apps/web/lib/consent-purposes.ts:112-120. Work needed: Check how each app records consent.

**Depends on**

- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-observability-and-operations
- SYS-api-and-contracts
- surface:web
- mode:cloud
- table:security_audit_logs
- table:consent_records
- table:data_rights_requests
- table:legal_holds

## Unknown

- Whether migration 0205 (domain retention) is applied in production.
- How rights requests are resolved in practice after they are queued.
- The legal hold management screen on web and any admin screen for the audit trail.
- How desktop, mobile, CLI, VS Code and Chrome record consent.
- Plan tiers that commit a workspace to retention enforcement (enforcement.ts not fully read).
