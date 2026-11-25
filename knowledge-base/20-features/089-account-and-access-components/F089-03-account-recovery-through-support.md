---
id: "F089-03"
type: "feature"
title: "Account recovery through support"
aliases: ["Recovery service", "Account recovery request", "Recover your account page", "Restore access", "Support recovery ticket (S89.06)"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.06"]
depends_on: ["SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-observability-and-operations", "surface:web", "mode:cloud", "api:POST /api/support/recovery", "api:POST /api/support/staff/tickets/{ticketId}/recovery", "table:profiles", "F089-01", "F089-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-03 Account recovery through support

A locked-out person submits a recovery request on a public page. The server answers the same way for every email. A support person with platform-admin rights then removes the second factor or sets a new sign-in email, and every session is signed out. Accounts with Advanced Account Security are excluded.

Area: [89. Account and access components](README.md). Requirement items: [S89.06](../../10-requirements/capabilities/089-account-and-access-components.md#s8906).

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

**What it does.** Takes a recovery request (lost password, email or second factor), opens a support ticket for a real account, and lets staff complete the recovery with one of two actions: remove_second_factor or replace_email.

**Why it exists.** Some people lose every way in. A person must verify the account is theirs before access returns, and the public form must not reveal which emails have accounts.

**Who uses it.** Locked-out people; support staff with platform-admin access.

**Problems it solves**

- Account enumeration through the form is closed: always 202 received (apps/web/app/api/support/recovery/route.ts:20-37).
- Support cannot bypass Advanced Account Security (apps/web/lib/support/tickets/recovery.ts:116-121).
- After recovery every old session is ended so a thief is not left signed in (recovery.ts:132-135).

**Use cases**

- A person lost their phone and backup codes and asks for the second factor to be removed.
- A person lost access to their email and gives a new address staff can reach.
- A person whose password reset failed explains what happened.
- A staff member works the ticket queue and restores access.

## 2. User experience

**Where to find it**

- Web: public page /recover titled 'Recover your account' (apps/web/app/recover/page.tsx).
- Staff: web admin Support ticket queue, section 'Restore access' (apps/web/features/admin/components/SupportTicketQueuePanel.tsx:38).

**Before you start**

- Requester: none; must pass a bot challenge, CSRF check and rate limit.
- Staff: platform admin (requirePlatformAdmin) with CSRF (staff route).

**Screens and controls**

- Form radio options: 'My password, and the reset email did not help', 'Access to the email address on the account', 'My two-factor device and backup codes' (apps/web/features/auth/AccountRecoveryForm.tsx:20-23).
- Fields: account email, reply address ('An email address we can reach you at' when email was lost, else 'Reply to (optional)'), details.
- Staff: 'Remove two-factor' (confirm title 'Remove two-factor authentication?', confirm label 'Remove two-factor') and a 'New sign-in email' field (SupportTicketQueuePanel.tsx:50-63).

**Journey**

1. Person opens /recover and picks what was lost.
2. Fills account email, reply address and details; submits.
3. Sees a generic received message; if an account exists a ticket opens in the background and a receipt email is sent.
4. Staff opens the ticket and picks an action.
5. Server removes the second factor or adds and sets the new primary email, signs out every session, and logs the action.
6. Person signs in again.

**What the person sees and gets**

- Requester: 202 {received:true} for any input that passes validation.
- Form errors: 'Fill in every field so a person can verify the account is yours.', 'Too many requests from this network. Wait a while and try again.', 'Your request was not sent. Check the email addresses and try again.' (AccountRecoveryForm.tsx:57-85).
- Receipt email: 'We received your account recovery request. A person checks that the account is yours before restoring access, and replies to this address.' (recovery.ts:88-92).
- Staff: {sessionsEnded} on success; validation messages such as 'This recovery request is closed.' or 'Enter the new sign-in email address.'; 404 'No such ticket'.

**Settings**

- None for the person. The ticket subject constant RECOVERY_TICKET_SUBJECT and follow path /recover are fixed in code (packages/contracts/cloud-contracts/src/support.ts:385-386).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Public intake with CSRF, rate limit 'support-handoff-create', bot challenge, schema validation, deferred filing via after() (apps/web/app/api/support/recovery/route.ts:20-37).
- Unknown email and deleted accounts return silently (recovery.ts:39-49).
- Accounts with Advanced Account Security enrolled get a recovery_requested security event, no ticket (recovery.ts:51-59).
- Otherwise ticket plus recovery_requested event plus receipt email; a failed email is logged (recovery.ts:61-100).
- Staff completion checks ticket subject, open status and no Advanced Account Security, then acts, ends all sessions and Ask-from-Siri tokens, and writes a critical audit event account_recovery_completed (recovery.ts:108-170).
- Adding a new email emits email_changed and updates profiles.email (recovery.ts:139-160).

**Incomplete**

- If the session sweep is incomplete, access was already restored but staff gets 'Complete the recovery again to finish.' (recovery.ts:171-176).
- Identity verification is a human step; the code has no check that the requester controls the reply address beyond the receipt email [inferred].

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Recovery request screens in Desktop, Mobile, CLI, VS Code and Chrome: none found; the search for the recovery path found only web files.
- Self-service recovery key flow for Advanced Account Security is under app/api/account-security/recovery-keys (directory exists; not read).

## 4. Required behaviour

**Established requirements**

- A recovery service lets a locked-out user regain access when password, email or second factor is lost, with verification and audit. (source: brief S89.06)
- A request for an unknown email, or a deleted account, does nothing visible. (source: apps/web/lib/support/tickets/recovery.ts:39-49)
- Staff may only act on an open recovery ticket and never on an Advanced Account Security account. (source: apps/web/lib/support/tickets/recovery.ts:116-121)

**Acceptance criteria**

1. POST /api/support/recovery returns 202 {received:true} for a known and an unknown email with the same body.
2. A known account without Advanced Account Security gets one ticket with subject 'Account recovery request' and a receipt email.
3. A known account with Advanced Account Security gets no ticket and one recovery_requested event.
4. Staff action on a closed ticket is refused with 'This recovery request is closed.'.
5. Staff action on an Advanced Account Security account is refused with the recovery-key message.
6. After a successful action every session of the account is ended and an account_recovery_completed audit row exists.
7. replace_email without an email is refused with 'Enter the new sign-in email address.'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Timing differences between known and unknown emails are hidden because filing runs after the response [inferred from after() use].
- The staff route is the only way to complete a recovery [inferred from the files read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a requester status page under /recover that shows ticket progress without revealing account existence.
- [proposed] Link to /recover from sign-in denial notices on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/support/recovery | `apps/web/app/api/support/recovery/route.ts` | Public intake. |
| endpoint | POST /api/support/staff/tickets/{ticketId}/recovery | `apps/web/app/api/support/staff/tickets/[ticketId]/recovery/route.ts` | Staff completion. |
| service | submitAccountRecoveryRequest | `apps/web/lib/support/tickets/recovery.ts` | Lookup, ticket, event, receipt email (line 32). |
| service | completeAccountRecovery | `apps/web/lib/support/tickets/recovery.ts` | Staff action, session sweep, audit (line 108). |
| service | RecoveryTicketError | `apps/web/lib/support/tickets/recovery.ts` | Error shown to staff as validation. |
| service | ticket service | `apps/web/lib/support/tickets/service.ts` | openTicket and readTicketForStaff. |
| schema | SupportRecoveryRequestSchema, RECOVERY_LOSSES, RECOVERY_ACTIONS | `packages/contracts/cloud-contracts/src/support.ts` | Request schemas and constants (lines 812-818, 905-932). |
| component | AccountRecoveryForm | `apps/web/features/auth/AccountRecoveryForm.tsx` | Public form. |
| screen | Recover page | `apps/web/app/recover/page.tsx` | Hosts the form at /recover. |
| component | SupportTicketQueuePanel RecoveryActions | `apps/web/features/admin/components/SupportTicketQueuePanel.tsx` | Staff buttons. |
| config | bot-challenge route list | `apps/web/lib/security/bot-challenge-routes.ts` | Marks the recovery endpoint as challenged. |
| service | revokeEveryOtherSession | `apps/web/lib/server/session-revocation.ts` | Ends all sessions after recovery. |
| service | readEnrolledAt | `apps/web/lib/server/account-security/store.ts` | Detects Advanced Account Security enrolment. |
| table | public.profiles | `apps/web/lib/support/tickets/recovery.ts` | Looked up by lower(email); email updated on replace. |
| event | recovery_requested, email_changed, account_recovery_completed | `apps/web/lib/support/tickets/recovery.ts` | Security and audit events. |
| test | staff route test | `apps/web/app/api/support/staff/tickets/[ticketId]/recovery/__tests__/route.test.ts` | Covers the staff route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser posts the form; the server checks CSRF, rate limit, bot challenge and schema, answers 202. | our servers | apps/web/app/api/support/recovery/route.ts:20-37 |
| After the response the server finds the profile by lower(email), skips unknown and deleted, branches on Advanced Account Security. | our servers | apps/web/lib/support/tickets/recovery.ts:32-59 |
| Opens the ticket, emits recovery_requested, emails a receipt to the reply address. | our servers | recovery.ts:61-100 |
| Staff posts an action; the server verifies ticket and enrolment, then calls the identity provider to remove the second factor or add and set the primary email. | outside service | recovery.ts:122-157 |
| The server updates profiles.email for a new address, ends all sessions, writes a critical audit event. | our servers | recovery.ts:155-170 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recovery ticket with requester text, account email and reply address | support ticket store (lib/support/tickets/store.ts; table name not read) | Server only | Unknown retention; not read. |
| Security events and audit rows | audit and identity-event tables (names not read) | Server only | Unknown. |
| New sign-in email | Identity provider and profiles.email | Server | Kept. |

**Models and providers.** No AI model. The identity provider is called to remove a second factor or set an email; the email provider sends the receipt (apps/web/lib/support/handoff/escalation-email.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Requester needs no account session. Staff need platform-admin. |
| Permissions | Staff route uses requirePlatformAdmin (staff route line 22). Not workspace roles. |
| Subscription | none found in the code |
| Limits and metering | Rate limits 'support-handoff-create' (public) and 'admin-security' (staff); values unknown. |
| Feature flags | none found in the code |
| Model compatibility | Not model-dependent. |
| Provider restrictions | Uses the single identity provider's second-factor and email operations. |
| Local mode | Needs our servers; not available without a connection. Local inference is unaffected. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Validation error | Public: 'Invalid recovery request' validation error; form shows its own messages. | route.ts:30-33 |
| Rate limited | Form shows 'Too many requests from this network...'. | AccountRecoveryForm.tsx:78 |
| Filing failure | Logged as '[support-recovery] a recovery request could not be filed'; the person still saw success. | route.ts:34-36 |
| Receipt email failed | Logged; ticket stays open. | recovery.ts:93-99 |
| Closed ticket / wrong subject | Staff gets a validation message. | recovery.ts:112-115 |
| Ticket missing | 404 'No such ticket'. | staff route lines 41-52 |
| Session sweep incomplete | Error telling staff to complete again; access already restored. | recovery.ts:171-176 |
| Offline | Form shows 'Your request was not sent. Check your connection and try again.' | AccountRecoveryForm.tsx:85 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/support/staff/tickets/[ticketId]/recovery/__tests__/route.test.ts`: Staff recovery route.
- `apps/web/__tests__/security/account-enumeration.test.ts`: Recovery filing and answers do not reveal account existence.
- `apps/web/lib/support/tickets/__tests__/service.test.ts`: Ticket service.
- `apps/web/lib/support/tickets/__tests__/staff-path.test.ts`: Staff ticket path.

**Test scenarios**

- **Same answer for any email**
  1. POST /api/support/recovery with a known email
  2. POST again with an unknown email
  - Expected: Both return 202 {received:true}.
- **Advanced Account Security excluded**
  1. Enrol a test account
  2. Submit a recovery request
  3. Open the staff queue
  - Expected: No ticket; a recovery_requested event exists.
- **Remove second factor**
  1. Open a ticket for an account with a second factor
  2. As platform admin choose Remove two-factor
  - Expected: Second factor removed; sessionsEnded returned; audit row written.
- **Replace email**
  1. Choose replace_email with a new address
  - Expected: New primary email set, profiles.email updated, email_changed event, all sessions ended.
- **Closed ticket**
  1. Close a recovery ticket
  2. Try to restore
  - Expected: 'This recovery request is closed.'.

**Where to look when it fails**

- Logs '[support-recovery] a recovery request could not be filed' and '[support-recovery] requester was not emailed a receipt'.
- Audit event account_recovery_completed; identity event recovery_requested.
- Support tickets store; profiles table.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No recovery entry from Desktop, Mobile, CLI, VS Code or Chrome apps found.** Affects: Non-web apps. Evidence: search for support/recovery found only web and contract files. Work needed: Link those apps to /recover on a locked or sign-in failure.
- **Verification steps staff must follow are not encoded in code.** Affects: Support operations. Evidence: completeAccountRecovery has no identity-verification field. Work needed: Point to a runbook under docs/runbooks or add a checklist field [proposed].

**Depends on**

- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-observability-and-operations
- surface:web
- mode:cloud
- api:POST /api/support/recovery
- api:POST /api/support/staff/tickets/{ticketId}/recovery
- table:profiles
- F089-01
- F089-02

## Unknown

- Ticket and event table names and retention.
- The runbook staff follow to verify identity.
- Behaviour of apps/web/app/api/account-security/recovery directories.
- Whether Desktop or Mobile link to /recover.
