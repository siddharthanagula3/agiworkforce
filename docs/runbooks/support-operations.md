# Support operations

Status: Current
Owner: Platform lead
Last updated: 2026-09-22

How a support request reaches a person, how it is prioritised, escalated and
answered, and what support may say. Written for whoever answers support, and
for the reviewer who asks how support works. Every row names the code that
makes it true; where a process exists only as a human one, the row says so.

**The authority rule.** A prepared answer in section 7 is a convenience, never
a specification. Each one names the help article or public page it repeats.
When the two disagree, the article or page is right, the answer is rewritten,
and if the article is wrong too, the code decides and the article is fixed
first. A support answer never states a price, a limit, a date or a plan
entitlement from memory: it links the page that carries it.

## 1. Channels, and whether a person reads them

| Channel                           | Who can use it              | Who reads it                                             | State today                                                                              |
| --------------------------------- | --------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Help centre and its search        | Anyone                      | Nobody; it answers from the published articles           | Always on; keyword retrieval with no model call                                          |
| Email, `contact@agiworkforce.com` | Anyone                      | An owner-designated person, once monitoring is confirmed | The Web v1 published channel; monitoring is an external launch gate                      |
| Support assistant                 | Anyone, signed in or not    | Nobody; it answers from the help corpus with citations   | Not in Web v1 launch scope; off unless a later verified release enables the feature flag |
| Live handoff to a person          | Anyone the assistant serves | A platform operator who is online                        | Off unless `AGI_SUPPORT_LIVE_HANDOFF_ENABLED` is truthy; otherwise an email fallback     |
| Ticket, in Settings, Help         | Signed-in accounts          | A platform operator, in /operator#support                | Stored; the support inbox is emailed when one is raised; replies show in Settings, Help  |

Sources: `apps/web/app/support/page.tsx`,
`apps/web/features/support/components/SupportWidgetMount.tsx`,
`apps/web/lib/support/handoff/config.ts`,
`apps/web/lib/support/handoff/presence-service.ts`,
`apps/web/features/settings/sections/HelpSection.tsx`.

**How a ticket reaches a person.** Raising a ticket stores it and emails the
support inbox with the ticket id, subject, priority, severity, the account id,
the message with secrets redacted, and a link to /operator#support
(`apps/web/lib/support/tickets/service.ts`). A platform operator lists open
tickets there and replies; the reply is stored against the ticket and the
customer reads it in Settings, Help. It is not emailed to the customer. If the
notification email fails, the ticket is still stored and the customer is told
the team was not emailed and given the contact address, so no one is told a
ticket is waiting when nobody knows about it.

**The fallback mailbox is not the published one.** When live handoff is on and
no operator is available, the escalation is mailed to
`AGI_SUPPORT_FALLBACK_EMAIL`, which defaults to `support@agiworkforce.com`, while
every public page publishes `contact@agiworkforce.com`. Either set the variable
to the published address or make sure the default mailbox is read. Without
`RESEND_API_KEY` the fallback reports itself unconfigured to the visitor rather
than claiming a mail was sent.

**Live handoff needs four things at once:** the switch on, a roster, an operator
whose heartbeat is fresh, and one with capacity. Missing any one of them, the
visitor is told nobody is available and is offered the email fallback with a
reference id; the product never says a person is connecting when one is not
(`presence-service.test.ts`).

## 2. What each plan is promised

The only response commitments are the ones `/support` publishes, from
`apps/web/features/marketing/components/pages/company/support-content.ts`:

| Plan                               | Channel and commitment                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Local, BYOK, Free, Basic, Pro, Max | Help centre and email. No response-time commitment                                                          |
| Team                               | Email. First response within 1 business day, Central Time                                                   |
| Enterprise                         | A named contact. First response within 4 business hours for a service-down report, 1 business day otherwise |
| Premium support                    | Only as a negotiated line on an Enterprise order form                                                       |

There is no 24/7 coverage and no page may imply it. The live handoff's own
reply promise is `AGI_SUPPORT_EXPECTED_REPLY_COPY`, "within one business day"
unless a deployment sets it.

## 3. Priority and severity

A request's priority is read from the support tier on the customer's signed
agreement, not from anything the customer types
(`priorityForSupportTier` in `apps/web/lib/support/handoff/priority.ts`):

| Contracted tier                              | Priority | Severity when escalated | What escalation does                          |
| -------------------------------------------- | -------- | ----------------------- | --------------------------------------------- |
| `platinum`, `premier`                        | urgent   | `p0`                    | Pages on-call at critical                     |
| `enterprise`, `gold`, `priority`, `business` | high     | `p1`                    | Pages on-call at warning                      |
| `standard`, `silver`, none, or unrecognised  | normal   | `p2`                    | Filed to support engineering, nobody is woken |
| `basic`                                      | low      | `p3`                    | Filed to support engineering, nobody is woken |

An unrecognised tier resolves to normal rather than to the top, and a failed
lookup resolves to normal rather than blocking the request. The severity comes
from the ticket's priority (`severityForPriority` in
`apps/web/lib/support/tickets/types.ts`), so it cannot be raised by retyping it
in the escalation form. This scale is about one customer's request. The
platform's own health has a separate severity ladder in
`docs/runbooks/incident-response.md`, and the two meet only where a `p0` or
`p1` escalation pages through the same dispatcher an incident uses.

## 4. Escalation tree

1. **Customer to support.** Email, a ticket, or a handoff (section 1).
2. **Support to engineering.** A platform operator escalates the ticket with a
   summary a responder can act on: `POST /api/support/tickets/{id}/escalate`,
   operator only, CSRF-checked. A closed ticket or an empty summary is refused.
   The escalation gets its own reference id, and an open ticket moves to in
   progress so it leaves the unattended queue.
3. **Engineering to on-call.** A `p0` or `p1` escalation pages through
   `notifyIncident`. The rotation is `AGI_ONCALL_ROTATION`; a page climbs from
   `primary` to `secondary` to `everyone` after the escalation interval, 15
   minutes unless configured (`apps/web/lib/server/incident/on-call.ts`). With
   the rotation unset there is no responder. The escalation records whether the
   page was delivered, unconfigured or failed, and never claims a page the
   dispatcher could not deliver.
4. **On-call to incident.** When the cause is the platform rather than the
   customer's account, `docs/runbooks/incident-response.md` takes over, including
   the customer notice and its template.
5. **Anything touching personal data.** `docs/runbooks/personal-data-breach.md`
   owns the clock and the notices. Support does not improvise a parallel one.

For an Enterprise customer the people on the customer side are the billing and
procurement contacts on the signed agreement; there is no account-manager model
in the product.

## 5. Knowing who is asking

- **Signed in.** A ticket or handoff takes the account from the session, never
  from the request body, and ignores a contact address a signed-in caller
  supplies (`apps/web/app/api/support/handoff/__tests__/create-route.test.ts`).
- **Signed out.** A handoff needs a contact address and passes a challenge
  before anything is stored or mailed.
- **Email.** Nothing in the product verifies who sent an email. Ask for the
  **User ID**, and the **Organization ID** for a workspace question, from
  Settings, Account; they locate the account and grant nothing.
- **Changing an account.** There is no screen from which support changes an
  account on someone's behalf. The support assistant's actions run only for the
  signed-in holder after they confirm, with a single-use token
  (`apps/web/lib/support/actions/`). So the answer to "change my email, plan,
  owner or password" is the signed-in path, not a favour.
- **Reading an account.** An operator reads customer content only under a
  break-glass grant: requested with a reason, approved by a second operator,
  expiring, and written to a hash-chained trail
  (`docs/runbooks/break-glass-production-access.md`).
- **Lost every sign-in factor.** Someone who has lost both the authenticator
  and every backup code has no self-serve route and there is no operator screen
  that removes a second factor. What evidence proves such a person is the
  account holder has not been decided; until it is, do not restore access by
  hand.

## 6. Diagnostics

Every surface can produce the same support diagnostics bundle: web, desktop,
mobile, the CLI, and both extensions
(`apps/web/lib/support/diagnostics/__tests__/surface-contract.test.ts`).
`POST /api/support/diagnostics` is signed-in only, redacts secrets a surface
left in a recent event, overwrites the build facts a client cannot know, strips
query strings, and refuses a bundle that does not validate. A ticket that
carries one has it validated rather than passed through. Besides device and
build facts, a bundle carries the open conversation's id and a short list of
recent events whose messages are redacted and cut to a fixed length
(`apps/web/lib/support/diagnostics/schema.ts`).

## 7. Prepared answers

Each answer names its authority. Change the authority first, then the answer.

**Billing: "I can't upgrade."** Authority: `apps/web/content/support/billing-and-plans.md`.

> Paid upgrades are opening in stages. On the Free plan, choosing a plan opens
> the upgrade waitlist: you can join it, or continue to checkout with an access
> code if you have one. Nothing is wrong with your account.

**Billing: "Cancel my subscription."** Authority: the same article.

> If you pay on the web, Settings, Billing, **Cancel plan** opens the billing
> portal at cancellation, and access continues to the end of the period you
> paid for. If you subscribed through Apple or Google, cancel with them; we
> cannot change a store subscription.

**Billing: "Where is my invoice?"** Authority: the same article.

> Invoices are in Settings, Billing once you have been billed on a paid plan. If
> your workspace pays for your plan, your organization provides the invoices
> and they are not shown in your own settings.

**Security: a vulnerability report.** Authority: `apps/web/app/security/page.tsx`, "Reporting a vulnerability".

> Thank you for the report. We review reports on a best-effort basis during
> working hours and do not publish a fixed acknowledgement or remediation time.
> We do not run a paid bounty programme; if you would like credit, we will name
> you in the changelog. Good-faith research within the published scope is
> covered by the safe-harbour statement on our security page.

**Security: "Do you have SOC 2, ISO 27001 or a penetration test?"** Authority:
`/security` and `/trust`.

> No. We hold no SOC 2 report, no ISO 27001 certificate and no third-party
> penetration test report, and no audit is underway. Our security and trust
> pages list what we do and what we have not done, with dates.

**Security: "I think someone is in my account."** Authority:
`apps/web/content/support/account-security.md`.

> In Settings, Account, review the session list and revoke any you do not
> recognise, or use **Log out of all devices**. Change your password from
> Settings, Security, and regenerate any API key you use. If two-factor
> authentication is off, turn it on there.

**Privacy: "Delete or export my data."** Authority:
`apps/web/content/support/delete-your-account.md`,
`apps/web/content/support/export-your-data.md` and `/privacy`.

> Export is in Settings, Account. Deleting your account is also in Settings,
> Account and runs 24 hours after you confirm, with a cancellation window until
> then. For anything given without an account, or a request the settings do not
> cover, use the form at `/privacy/requests`.

## 8. What support does not have

Stated so nobody promises it:

- An automated email from support to the customer: no ticket receipt, no
  handoff confirmation, no follow-up. The handoff fallback and the privacy
  request form mail the support mailbox, not the requester, so every mail a
  customer receives from support is written by a person.
- A per-customer status feed or incident subscription. `/status` is the same
  page for everyone.
- A published list of known issues. Current defects are tracked for engineers in
  `docs/agent-context/known-flaws.md`, which is not written for customers and is
  not to be quoted to them.
- An evidence standard for restoring access to an account that has lost every
  sign-in factor (section 5).
