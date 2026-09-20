# Enterprise commercial terms, and the code that enforces each one

Status: Current
Owner: Legal/compliance
Last updated: 2026-09-20

What an enterprise contract may say, what each term does once it is signed, and
the function that makes it true. `enterprise-procurement-standard.md` is the
process around a deal; this file is the term sheet the process fills in. Nothing
here is a commitment to a customer, and no number below is a price: every rate
is negotiated per deal and stored on the agreement, never inherited from the
self-serve catalogue.

## 1. The shapes a contract may take

A set of terms expresses exactly one commercial model, resolved by
`resolveCommercialModel` in `packages/contracts/types/src/enterprise/commitments.ts`.
Terms that commit to nothing resolve to none, and no period can be billed from
them.

| Model                 | What the customer committed to                   | Terms that produce it                            |
| --------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `seat_only`           | A number of seats for the term                   | committed seats, no usage terms                  |
| `seat_plus_usage`     | Seats, plus metered usage above what is included | committed seats and a metered overage            |
| `prepaid_consumption` | A block of consumption paid up front             | a committed usage block, no seats                |
| `postpaid_usage`      | Metered usage billed in arrears                  | a metered overage only                           |
| `committed_spend`     | A minimum the term will be billed                | a minimum annual spend, no seats                 |
| `hybrid`              | Any combination of the above                     | seats together with a prepaid block or a minimum |

## 2. Term, renewal and what a contract grants

The term runs from `contract_term_start` through `contract_term_end`
inclusive, plus `expiry_grace_days`, which is zero unless it was negotiated.
`resolveContractForce` answers whether the agreement grants anything on a given
day, and it is computed rather than swept: an agreement stops granting the day
after its grace ends with nothing having to run.

- An agreement grants only while it is executed and inside that window.
- Termination is a date and a stated reason on the live version
  (`terminateCommercialAgreement`). It stops the grant from that moment, inside
  the term, and never rewrites what was agreed.
- An amendment and a renewal each author version n+1 and mark the version they
  replace superseded with its terms and signature intact
  (`authorCommercialAgreementVersion`). Which of the two it was is stored as
  `change_kind`, and the version it replaced as `supersedes_version`.
- Every version, every ending and every amendment writes an audit event
  carrying the actor and the contract version.

The full set of legal moves is the transition table in
`packages/contracts/types/src/enterprise/contract-lifecycle.ts`. A move it does
not permit is refused with a reason, including the second delivery of a
signature that has already been recorded.

## 3. Commitment arithmetic

All money is whole minor units. A fraction of a cent, a fraction of a day or a
period with no days in it raises rather than rounds.

- **Seat true-up**: seats assigned above the commitment are charged for the
  days that remain in the term. A seat removed mid term returns nothing: the
  commitment is the floor the customer signed for (`seatTrueUp`).
- **Prepaid drawdown**: usage consumes the committed block first, the block
  never goes below zero, and what it cannot cover is invoiced
  (`drawdownPrepaidCents`).
- **Postpaid usage**: charged only above what the period includes
  (`postpaidUsageDueCents`).
- **Minimum commitment**: the shortfall at the end of the term is its own
  invoice line, never folded into a total
  (`minimumCommitmentShortfallCents`, `periodCommitmentLines`).
- **Mid-term amendment**: the new terms are charged for the remaining days and
  the unused part of what the superseded terms already billed is returned
  (`amendmentProration`).
- Contract money converts to the unit the usage ledger settles in through
  `contractCentsToMicroUsd`, at the rate the ledger already uses.

## 4. Payment terms

Due on receipt, NET 15, NET 30, NET 45 and NET 60 are the standard terms;
anything else up to 180 days is a custom term and is stored as a number of
days, not as a label. The due date of an invoice finalised on a day is that day
plus the term (`invoiceDueDate`), and the label a surface prints comes from
`paymentTermLabel` rather than from a string typed into a page.

## 5. What stops an invoice being issued

`invoiceIssuanceRefusals` refuses an enterprise invoice, rather than issuing an
incomplete one, when any of these is true:

- the contract is not in force on the day of issue;
- the customer requires a purchase order number and none is on the agreement;
- the agreement names no invoice recipient;
- no rate was negotiated;
- the invoice currency is not the currency the contract agreed;
- the collection method or an instrument is one the payment policy excludes.

Invoice recipients are a property of the agreement, not of the workspace owner
account, so accounts payable receives the invoice without being made a product
administrator.

## 6. Payment methods and bank transfers

The payment method policy on the agreement decides which rails may collect:
invoice with ACH and wire, the same plus card, or card only. A card charge
against an invoiced agreement is refused at issuance and audited if a provider
event shows one.

A bank transfer is settled in two steps, because a screenshot is not a payment:

1. The workspace reports the remittance it sent. The report is audited and
   idempotent on the bank reference, so the same transfer reported twice is
   recorded once, and it settles nothing.
2. Finance reconciles the report against the bank. Only a reconciled record
   counts against the invoice, and the insert policy on
   `enterprise_offline_payment_records` forbids the workspace from writing the
   reconciliation columns at all.

Nothing rewrites an invoice. A finalised invoice is corrected by a void, a
credit note or a write-off (`allowedInvoiceCorrections`), never by editing the
amount it states.

## 7. Tax

`tax_exempt_status` is one of none, exempt or reverse charge, is stored on the
agreement, and is copied to the billing contract row from the signed agreement
rather than read back from the provider customer record. A reverse-charge
customer is one whose Order Form says so.
