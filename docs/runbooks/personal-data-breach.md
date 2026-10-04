# Personal data breach runbook

Status: Draft, **not reviewed by counsel**
Legal review: pending-counsel
Owner: Founder (no incident commander is designated; see [Open gaps](#open-gaps))
Last updated: 2026-10-03
Applies to: AGI Automation LLC, all surfaces (web, desktop, mobile, extensions, CLI, signaling server)

This runbook exists because India's Digital Personal Data Protection Act, 2023
requires a Data Fiduciary to notify **both** the Data Protection Board and
**every affected Data Principal** when personal data is breached, and because
the notification clock starts before anyone has finished understanding what
happened. A runbook written during an incident is written too late.

It is written against what this repository can actually do on the day. Where a
step depends on something that does not exist yet, it says so instead of
describing a capability we do not have. Read [Open gaps](#open-gaps) before you
rely on any of it.

`Legal review:` in the header is the one field that says whether the notification
templates in §4 and §5 are settled wording. While it reads `pending-counsel`,
both templates carry a pre-send notice saying so. It becomes `counsel-approved`
only alongside an `Approved by:` line naming the reviewer and the date they
signed off, and the pre-send notices come out in the same change. There is no
third state, and no state in which the templates silently look approved.

---

## 0. What counts as a breach

Under the Act, a personal data breach is **any unauthorised processing, or
accidental disclosure, acquisition, sharing, use, alteration, destruction, or
loss of access, that compromises the confidentiality, integrity or availability
of personal data.**

Three consequences of that definition that people get wrong:

- **Loss of availability counts.** A destructive migration, a dropped table, or
  an object-storage lifecycle rule that deletes user files is a breach even
  though nothing leaked.
- **There is no materiality threshold in the Act.** It does not say "significant
  breach". A single user's data exposed to a single wrong recipient is in scope.
- **Internal misuse counts.** An engineer querying production for personal data
  outside an authorised task is unauthorised processing.

If you are unsure whether something qualifies, **declare it and stand it down
later**. Standing down a declared incident costs an hour. Discovering four weeks
late that a notification clock started is not recoverable.

---

## 1. Clock

Start the clock at **the moment any employee or contractor first becomes aware
of facts suggesting a breach**, not when it is confirmed, not when the root
cause is known.

| Time from awareness              | What must have happened                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Immediately                      | Incident declared, an owner named, evidence preserved (§2)                                                       |
| Without delay                    | Intimation to the **Data Protection Board** with what is known so far                                            |
| Without delay                    | Intimation to **each affected Data Principal** (§5), this is not gated on finishing the investigation            |
| Within **72 hours** of awareness | Detailed report to the Board (§4). An extension must be requested from the Board in writing; it is not automatic |
| Ongoing                          | Updates to the Board and to affected principals as facts change                                                  |

Two notes that matter operationally:

- **The Data Principal notification is not sequenced after the Board
  notification.** Both are "without delay". Do not hold the user notice while
  drafting the regulator one.
- Other regimes run their own clocks off the same event: **GDPR** is 72 hours to
  the supervisory authority where it applies, and contractual notice periods to
  enterprise customers live in the [DPA](apps/web/app/dpa/page.tsx). Check the
  DPA before assuming this runbook is the only obligation.

---

## 2. First 60 minutes

Do these in order. Do not start the investigation before step 3, the most
common way to lose an incident is to fix it and destroy the evidence of what it
was.

1. **Declare.** Say the word "incident" in writing, with a timestamp, in a
   channel that persists. That timestamp is the start of the clock and you will
   be asked for it.
2. **Name one owner.** One person decides; everyone else assists. If nobody has
   been designated, the founder owns it by default (see
   [Open gaps](#open-gaps)).
3. **Preserve evidence before remediating.**
   - Do **not** rotate credentials, delete rows, or redeploy until logs are
     captured, remediation destroys the timeline.
   - Capture Vercel runtime logs for the affected window. They are
     vendor-retained on the vendor's own schedule, which we do not set, so treat
     them as expiring.
   - Snapshot the security audit log:
     `select * from public.security_audit_logs where created_at >= $since order by created_at;`
     This table is purged at 90 days by the daily
     `/api/cron/purge-security-audit-logs` schedule (`vercel.json`), so an
     incident older than 90 days has no audit trail. Each purge appends its own
     `retention_purge` event carrying the rows deleted and the age of the oldest
     surviving row, so what retention was actually applied is readable from the
     same table:
     `select created_at, details from public.security_audit_logs where event_type = 'retention_purge' order by created_at desc;`
   - Snapshot the relevant Neon tables (`pg_dump` of the affected tables, or a
     point-in-time branch) before any corrective UPDATE or DELETE.
   - Note the deployment SHA and the migration head (`apps/web/db/neon/`).
4. **Contain**, once evidence is captured. Revoke sessions and API keys, disable
   the affected route or feature flag, or take the surface down. Containment
   beats uptime here.
5. **Start the incident record.** One document, appended to, never rewritten:
   what was seen, when, by whom, what was done, and what is still unknown. The
   Board report in §4 is assembled from this.

---

## 3. Scoping, the questions the Board will ask

You cannot notify accurately without answers to these. Get approximate answers
fast rather than exact answers slowly; both notifications say what is known so
far and are updated.

| Question                                | Where to look in this repository                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What categories of personal data?       | The processing table in `apps/web/app/privacy/india/page.tsx` §02, and the schema under `apps/web/db/neon/`                                                                                                                                                                                                                                                                                                        |
| Whose? Identify the affected principals | Query the affected tables by `user_id`; for anonymous rows, by `email` in `cloud_managed_waitlist` or `subject_email_sha256` in `consent_records`                                                                                                                                                                                                                                                                  |
| How many?                               | `select count(distinct user_id) …` over the affected scope. Report a range if that is all you have                                                                                                                                                                                                                                                                                                                 |
| Which surface / trust boundary?         | Local, BYOK and Managed Cloud are separate. **Local-mode data never reaches us**, so a server-side breach cannot expose it, say so explicitly, because it materially narrows scope                                                                                                                                                                                                                                 |
| Was it encrypted or pseudonymised?      | Object storage split: new uploads (generated media, chat attachments, knowledge files) are in the private bucket; the public bucket holds profile pictures and objects stored before uploads moved to the private bucket (`lib/server/object-storage.ts`, `lib/server/media-storage.ts`). BYOK keys are encrypted on-device. `waitlist.email` is a SHA-256 digest; `cloud_managed_waitlist.email` is **plaintext** |
| Third parties involved?                 | `apps/web/app/subprocessors/page.tsx`, **but that page is currently incomplete**, see [Open gaps](#open-gaps). Cross-check `resend-client.ts`, the video and geocoding providers, and the model providers in `lib/server/provider-endpoints.ts`                                                                                                                                                                    |
| Did any of it leave India?              | All hosting is in the United States. For an Indian data principal, that is already a cross-border transfer under the Act and should be stated in the notice                                                                                                                                                                                                                                                        |
| Root cause and remediation              | The incident record from §2                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 4. Board notification template

**Legal review: pending-counsel, this template has not been reviewed by a
lawyer.** It was drafted from the statute text by an engineer. Counsel must
review it and the approval must be recorded in the header field at the top of
this file before this wording is treated as settled.

**This is not a hold on sending.** The statutory clock does not pause for legal
review. If an incident is live and no approval exists yet, send this as drafted
and put counsel on the wording in parallel, a late intimation breaches the Act,
an imperfectly worded one does not.

Send by the means the Board prescribes at the time. Fill every field; write
"not yet established" where it is not known rather than omitting the line, an
omitted field reads as a fact withheld.

> **Subject:** Personal data breach intimation, AGI Automation LLC, [initial | detailed] report
>
> **1. Reporting entity**
> AGI Automation LLC, c/o registered agent, 5900 Balcones Drive STE 100, Austin, TX 78731, USA.
> Grievance contact: contact@agiworkforce.com (subject line "DPDP grievance").
> Report prepared by: [name, role, contact].
>
> **2. Nature of the breach**
> [Unauthorised access / accidental disclosure / loss of availability / alteration / other.]
> [What happened, in plain terms, in no more than five sentences.]
>
> **3. Timeline (all times IST, with UTC offset stated)**
>
> - Breach occurred / began: [timestamp, or estimated window]
> - First became aware: [timestamp, this is the start of the clock]
> - Contained: [timestamp, or "ongoing"]
> - This report: [timestamp]
>
> **4. Personal data affected**
> Categories: [e.g. email addresses, account identifiers, conversation content, uploaded files]
> Volume: [number of data principals, or a stated range]
> Data principals in India: [number, or "not yet established"]
> Sensitive or special categories: [state explicitly, including whether any child's data is involved]
> State of the data: [plaintext / hashed / encrypted at rest / pseudonymised]
>
> **5. Likely consequences for affected data principals**
> [Be concrete: credential exposure, identity linkage, exposure of conversation content, loss of access to their own data. Do not minimise.]
>
> **6. Circumstances and cause**
> [Root cause if established; the current hypothesis and what is being done to confirm it if not.]
>
> **7. Measures taken and proposed**
> Containment: [what was done and when]
> Remediation: [what has been fixed]
> Prevention: [what changes so it cannot recur, with owners and dates]
>
> **8. Intimation to data principals**
> Method: [in-product notice / published notice at a public URL / email where a path exists]
> Sent / scheduled: [timestamp]
> Number notified: [n]
> Any affected principal not yet reachable, and why: [state it]
>
> **9. Contact for follow-up**
> [Name, role, email, phone.]

---

## 5. Data Principal notification template

**Legal review: pending-counsel, this template has not been reviewed by a
lawyer.** It was drafted from the statute text by an engineer. Counsel must
review it and the approval must be recorded in the header field at the top of
this file before this wording is treated as settled. Counsel's attention is
worth most on the "what data of yours was NOT involved" block: every line there
is a factual claim about this system, and a wrong one is a second incident.

**This is not a hold on sending.** The statutory clock does not pause for legal
review. If an incident is live and no approval exists yet, send this as drafted
and put counsel on the wording in parallel, a late intimation breaches the Act,
an imperfectly worded one does not.

Send to **every** affected principal. The Act does not provide a
"low-risk" exception, and it does not permit substituting a public notice for
individual intimation where individuals are identifiable.

**Delivery, honestly:** mail to one account at a time exists, and mail to a set
of affected people has no operator entry point.

- Account-level mail that exists, including: identity security alerts to the
  profile address (`apps/web/lib/services/account-activity-notifications.ts`),
  account security codes, data-export-ready mail, billing and trial notices,
  spend alerts, team invitations, scheduled-task completion mail
  (`sendScheduleCompletionEmail`) and support ticket mail to the customer
  (`sendCustomerTicketEmail`, `apps/web/lib/support/handoff/escalation-email.ts`),
  sent through the Resend wrappers in
  `apps/web/lib/services/notification-email-service.ts` and
  `apps/web/lib/support/handoff/resend-client.ts`. These are examples, not the
  inventory: the Resend row of `apps/web/app/subprocessors/page.tsx` is the
  canonical list, and a new sender is added there. Deleting an account sends no
  confirmation.
- `sendBulkTransactionalEmail` (`apps/web/lib/support/handoff/resend-client.ts`)
  mails an arbitrary recipient list, throttled, with per-recipient idempotency
  keys derived from a campaign id and a per-recipient outcome report. It is a
  tested primitive (`apps/web/lib/support/handoff/__tests__/resend-bulk.test.ts`)
  with no production caller: no admin route or script takes a list of affected
  users, it has never been used in an incident, and it has not been drilled.
- Nothing writes an in-product notice to a set of users, and no route serves a
  dated public notice. Both would be built during the incident.

In practice that means:

1. An in-product notice, built on the day because nothing writes one to a set
   of users today, and
2. A dated public notice at a stable URL, built by hand on the day, and
3. Direct email through a one-off script an engineer writes around
   `sendBulkTransactionalEmail`, or by hand where only a few addresses are
   affected.

That is a real limitation. It is disclosed to every reader, not only to Indian
principals: the "Security incidents" section of `apps/web/app/privacy/page.tsx`
and §10 of `apps/web/app/privacy/india/page.tsx` describe how a notice would
reach a person. Keep this runbook and those sections saying the same thing.
Closing the gap is an open item; until it is closed, do not promise an affected
person an email. [Breach-notice drill](#7-breach-notice-drill) is how the manual
route gets exercised before it is needed.

> **Subject:** Important: a security incident affected your AGI account
>
> We are writing to tell you about a security incident that affected personal
> data we hold about you. We are telling you directly because you are affected,
> not as a general announcement.
>
> **What happened.** [Plain description. No euphemism, "unauthorised access",
>
> > not "an issue". No blaming a vendor unless it is the literal cause, and name
> > them if it is.]
>
> **When.** It happened on/around [date], and we became aware of it on [date].
>
> **What data of yours was involved.** [Specific to this person's data, not the
>
> > full category list. If conversation content was involved, say so, it is the
> > most sensitive thing this product holds.]
>
> **What data of yours was NOT involved.** [State this where true. Examples that
>
> > matter to our users: card details never reach us, Stripe holds them; Local
> > mode data never leaves your device; BYOK provider traffic does not pass
> > through us; your password is held by our identity provider and we never store
> > it.]
>
> **What we have done.** [Containment and remediation, concrete and dated.]
>
> **What you should do.** [Only actions that are actually useful for the data
>
> > involved. If there is nothing useful, say so rather than padding with generic
> > advice.]
>
> - [e.g. Change your password at … / Revoke and reissue API keys at … / Review
>   > recent activity at …]
>
> **Your rights.** You can ask what we hold about you, have it corrected or
> erased, and withdraw consent, at https://agiworkforce.com/privacy/requests.
> If you are in India, the notice at https://agiworkforce.com/privacy/india sets
> out your rights under the Digital Personal Data Protection Act, 2023.
>
> **Questions or a complaint.** Email contact@agiworkforce.com with the subject
> line "DPDP grievance". If our response does not resolve it, data principals in
> India may complain to the Data Protection Board of India.
>
> We are sorry. [Only if true, and it is.]
>
> , AGI Automation LLC

---

## 6. After

- **Post-incident review within 5 working days.** Written, blameless, with dated
  owners on every action. An incident that produces no change to the system
  produces the same incident again.
- **Record durable defects** in `audit/registers/known-flaws.md`, not only in
  the incident document.
- **Update this runbook** with what it failed to tell you at 2am.
- **Retain the incident record.** The Board may ask later, and an incident you
  cannot evidence is indistinguishable from one you concealed.

---

## 7. Breach-notice drill

A notice path that has never been exercised is a guess. Run this drill before
relying on the manual route in §5, after any change to the mail code, and at
least once a year. It tests delivery and the team's ability to execute; it does
not test the legal wording.

**Two obligations, drilled separately.**

- **Customer notice under the DPA.** A processor-side commitment to tell the
  customer's account contact without undue delay and within 72 hours
  (section 10 of `apps/web/app/dpa/page.tsx`). The recipients are the account contacts on
  file for customers, and the notice goes to a handful of people.
- **Individual notice under the Act.** A fiduciary-side duty to tell every
  affected Data Principal. The recipients are an arbitrary list of
  end-user addresses.

Each has its own recipient list, message and evidence. A drill that proves one
says nothing about the other.

**Recipients.** Team-owned mailboxes and synthetic accounts only. Never a real
customer or user. Include at least one address on each major mailbox provider
the user base uses, and one address that is known to bounce, so the failure path
is exercised too.

**Steps.**

1. **Verify recipients.** Confirm each test address is reachable and note who
   reads it. Record the list and the sending domain's verification state.
2. **Use an approved message.** The individual-notice drill uses the §5
   template with `[DRILL]` at the start of the subject and a first line saying
   it is a drill. This runbook has no template for the DPA customer notice, so
   that drill drafts one from the contents the DPA promises in section 10,
   "Personal data breach", of `apps/web/app/dpa/page.tsx`, and records that no
   approved customer-notice template exists. While `Legal review:` reads
   `pending-counsel`, say so in the drill record.
3. **Send.** Through `sendBulkTransactionalEmail` with a campaign id that names
   the drill. Do not touch production recipients or production rows.
4. **Collect delivery evidence.** The `SendBulkEmailResult` outcomes
   (attempted, delivered, failed and each failure's reason), the Resend delivery
   events for each delivered outcome, looked up by its `providerMessageId`, and
   a screenshot or header dump from a received copy. Resend does not know the
   campaign: the campaign id only seeds the per-recipient idempotency keys.
5. **Exercise escalation.** Decide who is called when the bounce comes back or
   the provider is down, using the paths in
   `docs/runbooks/incident-communication.md`, and say how long that took.
6. **Record the result** in the log below, with what failed and what changed.

| Date | Obligation | Recipients | Delivered / attempted | Evidence | Operator | What changed |
| ---- | ---------- | ---------- | --------------------- | -------- | -------- | ------------ |

No drill has been run. The first row is written when one is.

---

## Open gaps

The capabilities this runbook describes but does not have yet are tracked in
`audit/blockers/37-personal-data-breach-open-gaps.md`; among them, this runbook
has not been reviewed by counsel, a founder action in
`audit/decisions/founder-actions.md`.
