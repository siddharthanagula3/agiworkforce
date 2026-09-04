# Enterprise Master Services Agreement, draft for counsel

Status: Draft. Not reviewed by counsel. Do not send to a customer.
Owner: Founder, pending counsel review
Last updated: 2026-09-04

This is an engineer-drafted Master Services Agreement ("MSA") for AGI
Enterprise, written to be consistent with the published
[Terms of Service](https://agiworkforce.com/terms),
[Data Processing Addendum](https://agiworkforce.com/dpa) ("DPA"), and
[Acceptable Use Policy](https://agiworkforce.com/acceptable-use), and with the
billing decisions in `docs/runbooks/enterprise-billing.md`. It exists so
counsel has a starting draft grounded in what the product actually does,
rather than starting from a generic template and having to reverse-engineer
the product's real trust boundaries, alpha status, and billing mechanics.
Every commitment below is a term AGI intends to be bound by once signed; it
is not yet in effect for any customer, and no clause here should be read as
already agreed to anyone. Items flagged "**Needs lawyer review**" are
drafting choices with legal consequences an engineer should not make alone;
see the table at the end.

This document, together with the Order Form template at
`docs/compliance/enterprise-order-form-template.md`, is meant to be executed
alongside the standard [Terms of Service](https://agiworkforce.com/terms) and
[DPA](https://agiworkforce.com/dpa), not to replace them wholesale: it
overrides specific clauses (payment terms, term and termination, liability
cap, dispute resolution) for the signing Customer and otherwise incorporates
the rest of those documents by reference.

---

## Parties

This Master Services Agreement is entered into between AGI Automation LLC, a
United States limited liability company ("AGI"), and the customer entity
named on the applicable Order Form ("Customer"), each a "Party."

## 1. Order of precedence

For the Customer that signs an Order Form referencing this MSA, documents
are read in this order, highest first, on any point of conflict: (a) the
signed Order Form, (b) this MSA, (c) the DPA on matters of data protection,
(d) the Terms of Service, (e) the Acceptable Use Policy. This mirrors the
precedence the Terms of Service and DPA already state for a signed
master agreement or order form.

## 2. Definitions

"**Services**" means AGI Managed Cloud, and, where the Customer's seats use
them, the Local and BYOK modes of the AGI product, each as described on
`/enterprise` and `/trust` as of the Order Form's effective date.
"**Managed Cloud**" means the AGI-hosted service where AGI processes
Customer content on AGI infrastructure. "**Local mode**" means the product
running entirely on Customer's own hardware, with no AGI infrastructure in
the request path. "**BYOK**" means Customer's own model-provider keys are
used from Desktop, CLI, or VS Code, so provider requests do not route
through AGI infrastructure. "**Order Form**" means a document referencing
this MSA that both Parties sign, stating the seat commitment, term, pricing,
and other deal-specific terms. "**Committed Seats**" means the seat count
stated on the Order Form. "**Included Usage**" means the managed-usage
allowance per contract period stated on the Order Form. "**Overage**" means
managed usage beyond Included Usage in a contract period, billed under
section 5. "**Confidential Information**" has the meaning in section 10.

## 3. Services and the alpha status of Managed Cloud

**Needs lawyer review.** AGI Managed Cloud is in public alpha as of the
effective date of this MSA: its features, capacity, and operational controls
change as the product develops. This does not reduce AGI's obligations as a
processor under the DPA or under Applicable Data Protection Law, which are
not conditioned on release stage. Section 8 below states what support and
response-time commitments do and do not exist today; nothing in this section
should be read to promise a stable feature set for the Contract Term.

## 4. Trust boundaries

Local mode and BYOK involve no AGI infrastructure in the request path for
the content processed that way; AGI is not a processor of that content and
no AGI subprocessor receives it. Managed Cloud is where AGI acts as
processor of Customer Personal Data, under the terms of the DPA. Customer
acknowledges these are separate trust boundaries and that a seat's mode of
use determines which applies, per seat, per request.

## 5. Fees and payment

1. **Structure.** Fees are Committed Seats at the per-seat price stated on
   the Order Form, plus metered usage in AGI's own provider-neutral pricing
   units beyond Included Usage ("Overage"), at the Overage rate stated on
   the Order Form. AGI never passes through a model provider's own cost;
   Overage is priced from AGI's published managed-usage catalog. Any
   negotiated Committed Usage Block or Minimum Annual Spend is stated on the
   Order Form and applies as written there.
2. **Cadence.** Billing is annual, in advance, unless the Order Form states
   a quarterly cadence as a negotiated exception.
3. **Collection.** AGI issues an invoice for each period; payment is due
   within 30 days of the invoice date ("Net 30"). AGI's preferred payment
   rails are ACH debit and bank transfer; card payment is available as a
   fallback. All amounts are in USD.
4. **Purchase orders.** Where Customer requires a purchase order number on
   invoices, Customer provides it at signature or before the first invoice
   is issued; AGI includes it as a line item on every invoice for the
   Contract Term and records it internally as the procurement reference for
   the account.
5. **Taxes.** Fees exclude taxes; Customer is responsible for applicable
   sales, use, VAT, GST, and similar taxes, excluding taxes on AGI's income.
6. **Late payment and the collection schedule.** If an invoice remains
   unpaid past its due date, AGI applies the following schedule, measured
   from the due date of the oldest open invoice. At no stage does AGI delete
   Customer data for non-payment.

   | Days past due | Consequence                                                                                                                                                                       |
   | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1 to 30       | Workspace owner sees a billing notice in-product; AGI's billing team is notified internally.                                                                                      |
   | 31 to 60      | Workspace admins see a stronger notice; internal escalation repeats.                                                                                                              |
   | 61 to 90      | The workspace remains operational, but seat expansion and new paid usage commitments are suspended until the account is current.                                                  |
   | 91 or more    | The workspace becomes read-only: Customer may read and export existing content, but new content-creating activity and managed compute are suspended until the account is current. |

   Reinstatement to full service is automatic on payment in full,
   effective on AGI's confirmation of receipt.

## 6. Term, renewal, and termination

1. **Initial term.** The Contract Term stated on the Order Form, beginning
   on the Order Form's effective date.
2. **Renewal.** **Needs lawyer review**, renewal terms (auto-renewal versus
   requiring a new signed Order Form, and the notice period for either
   party to decline renewal) are drafted on the Order Form template and
   should be confirmed here for consistency once that choice is made.
3. **Termination for cause.** Either Party may terminate this MSA and any
   Order Form under it on written notice if the other Party materially
   breaches and fails to cure within 30 days of notice, or upon the other
   Party's insolvency, dissolution, or assignment for the benefit of
   creditors.
4. **Termination for non-payment.** AGI may terminate an Order Form for
   non-payment that persists after the read-only stage in section 5.6,
   subject to the notice period stated on the Order Form. Termination for
   non-payment does not itself delete Customer data; deletion follows the
   same account-deletion mechanism described in the Terms of Service, and
   requires a separate, explicit deletion request.
5. **Effect of termination.** Sections that by their nature survive
   (confidentiality, accrued payment obligations, warranty disclaimers,
   limitation of liability, indemnification, governing law and disputes)
   survive termination or expiration of this MSA.

## 7. Data protection

AGI's processing of Customer Personal Data under Managed Cloud is governed
by the DPA, incorporated by reference. Local mode and BYOK activity is
outside the DPA's processing scope because AGI does not process that content
at all, per section 4. Customer's data protection rights and AGI's
obligations (sub-processor list, international transfer mechanism, breach
notification, security measures and their stated limits) are as published at
`/dpa` and `/subprocessors` as of the Order Form's effective date, and as
updated from time to time consistent with the DPA's own change process.

## 8. Support and service levels

1. **Support tier.** The support tier stated on the Order Form determines
   the first-response time target that applies, per the schedule published
   at `/sla`. As of this draft, the Enterprise target is a 4-hour first
   response by priority email.
2. **What this is, and is not.** **Needs lawyer review.** As published on
   `/sla`, these are targets AGI is building toward, not automated,
   credit-bearing service level commitments: there is no automated
   measurement of response time and no automated service-credit process
   today. This MSA does not create a service-credit obligation. If Customer
   requires a binding, credit-bearing SLA, the Parties execute a separate
   SLA Exhibit attached to the Order Form stating the specific measured
   metric, the credit formula, and the claim process; until such an Exhibit
   is signed, section 8.1's target is AGI's stated intention and nothing
   more.
3. **Uptime.** AGI does not publish measured historical uptime and has no
   incident archive as of this draft; `/status` is a point-in-time signal
   over a small set of dependencies, not an availability record. Any uptime
   commitment likewise requires a signed SLA Exhibit.

## 9. Security and compliance representations

1. AGI does not hold a SOC 2 report, an ISO 27001 certificate, or a HIPAA
   business associate agreement as of this draft, and does not offer
   HIPAA-covered workflows. Do not represent otherwise in any Order Form or
   correspondence; `/trust` carries the current, dated posture and is the
   source both Parties should rely on at signature.
2. AGI hosts Managed Cloud in the United States only. AGI does not offer a
   regional or in-country hosting option, and does not commit to data
   residency outside the United States, as of this draft. If Customer
   requires data residency, that is a product gap to raise with AGI before
   signature, not a term this MSA can honestly grant.
3. Security measures and their stated limits are as published in DPA
   Annex II. Nothing in this MSA expands on those measures.

## 10. Confidentiality

Each Party will protect the other's Confidential Information with the same
degree of care it uses for its own confidential information of similar
importance, and not less than reasonable care, and will use it only to
perform under this MSA. Confidential Information excludes information that
is public through no fault of the receiving Party, was already known to the
receiving Party without confidentiality obligation, is independently
developed, or is rightfully received from a third party without restriction.
Either Party may disclose Confidential Information as required by law,
provided it gives the other Party notice where legally permitted.

## 11. Warranty disclaimer and limitation of liability

**Needs lawyer review**, this section is drafted to parallel the public
Terms of Service's substance while being appropriate for a negotiated
enterprise contract; confirm the cap and the carve-outs before use.

1. **Warranty disclaimer.** Except as expressly stated in this MSA, the
   Services are provided "as is" and "as available." AGI disclaims all
   implied warranties, including merchantability, fitness for a particular
   purpose, and non-infringement, to the maximum extent permitted by law.
   AGI does not warrant that the Services will be uninterrupted, secure, or
   error-free, or that output will be accurate.
2. **Limitation of liability.** Except for a Party's indemnification
   obligations under section 12, breach of section 10 (confidentiality), or
   either Party's gross negligence or willful misconduct, each Party's
   aggregate liability arising out of or relating to this MSA is limited to
   the fees Customer paid under the applicable Order Form in the 12 months
   preceding the claim. Neither Party is liable for indirect, incidental,
   special, consequential, or punitive damages, or for loss of profits,
   revenue, or goodwill, even if advised of the possibility. Nothing here
   excludes liability that cannot lawfully be excluded.

## 12. Indemnification

1. **By Customer.** Customer will indemnify, defend, and hold harmless AGI
   from claims arising from Customer's misuse of the Services, content
   Customer submits, Customer's breach of this MSA or applicable law, or
   Customer's infringement of a third party's rights.
2. **By AGI.** AGI will indemnify, defend, and hold harmless Customer from a
   third party's claim that the Services, as provided by AGI and used in
   accordance with this MSA, infringe that third party's United States
   intellectual property rights, except where the claim arises from
   Customer's modification of the Services, combination of the Services
   with something not provided by AGI, or Customer's continued use after
   AGI notifies Customer of the infringing element and offers a
   non-infringing alternative.
3. The indemnified Party will give the indemnifying Party prompt notice of
   the claim and reasonable cooperation; the indemnifying Party controls the
   defense and any settlement that does not admit liability on the
   indemnified Party's part without its consent.

## 13. Export control and sanctions

Both Parties will comply with applicable United States export control and
economic sanctions laws. Customer represents it is not located in an
embargoed territory and is not a person on a restricted-party list.

## 14. Governing law and dispute resolution

**Needs lawyer review.** This MSA is governed by the laws of the State of
Texas, USA, without regard to conflict-of-laws principles, except that the
DPA may select a different governing law for cross-border transfer
obligations, which prevails for those obligations. Unlike the individual
arbitration clause in the public Terms of Service, this draft resolves
disputes in the state or federal courts located in Travis County, Texas, and
both Parties consent to that jurisdiction. Confirm with counsel whether an
enterprise MSA should retain mandatory arbitration or, as drafted, move to
court jurisdiction; enterprise counterparties commonly negotiate out of
consumer-style arbitration clauses, but that is a decision for counsel, not
this draft.

## 15. General

1. **Assignment.** Neither Party may assign this MSA without the other's
   consent, except to a successor in a merger, acquisition, or sale of
   substantially all assets, on notice.
2. **Force majeure.** Neither Party is liable for delay or failure to
   perform caused by circumstances beyond its reasonable control.
3. **Notices.** Notices to AGI must be sent to AGI Automation LLC, c/o
   registered agent, 5900 Balcones Drive STE 100, Austin, TX 78731, USA, and
   to contact@agiworkforce.com; confirm this address against
   `apps/web/lib/legal-constants.ts` at signature, since it is the single
   source of truth and this draft could go stale. Notices to Customer are
   sent to the contact stated on the Order Form.
4. **Entire agreement.** This MSA, the applicable Order Form, the DPA, the
   Terms of Service, and the Acceptable Use Policy are the entire agreement
   between the Parties regarding the Services and supersede prior
   discussions on the subject.
5. **Amendment.** This MSA may be amended only by a written instrument
   signed by both Parties, or by a subsequent Order Form that expressly
   states it amends specific sections.
6. **Counterparts.** This MSA may be signed in counterparts, including by
   electronic signature, each of which is an original.

## Signature

| AGI Automation LLC | Customer |
| ------------------ | -------- |
| Name:              | Name:    |
| Title:             | Title:   |
| Date:              | Date:    |

---

## Needs lawyer review, summarized

| #   | Question                                                                                                                                                                                                                                      | Where        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| M-1 | Confirm the alpha-status framing in section 3 is sufficient disclosure, or whether it needs to move into a more prominent position.                                                                                                           | Section 3    |
| M-2 | Set renewal mechanics (auto-renew versus new Order Form, notice period) once decided; this draft leaves it to the Order Form template.                                                                                                        | Section 6.2  |
| M-3 | Confirm the liability cap (fees paid in the preceding 12 months) and the carve-outs are the right shape for a negotiated enterprise deal, not just a restatement of the consumer Terms of Service cap.                                        | Section 11.2 |
| M-4 | Confirm the IP indemnification scope and exclusions in section 12.2 match AGI's actual risk tolerance.                                                                                                                                        | Section 12   |
| M-5 | Decide arbitration versus court jurisdiction for enterprise counterparties.                                                                                                                                                                   | Section 14   |
| M-6 | Confirm whether a customer requiring data residency outside the United States should be a hard no (as drafted) or whether any accommodation exists; if the latter, this MSA needs a section 9.2 rewrite before it is used with that customer. | Section 9.2  |
| M-7 | If an Indian counterparty is expected, confirm whether this MSA needs a DPDP-specific annex analogous to the one flagged for the DPA in `docs/compliance/dpdp-audit-log.md` §5, item L-10.                                                    | Section 7    |

This draft has not been sent to any customer and creates no obligation until
signed.
