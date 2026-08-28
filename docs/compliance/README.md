# docs/compliance

Status: Current
Owner: Legal/compliance
Last updated: 2026-08-28

Verified platform and legal obligations: Apple, Google Play, Microsoft, Chrome
Web Store, VS Code Marketplace, privacy regimes, and regional requirements.
Every claim carries the date it was verified and a link to the authoritative
source. An undated policy claim is not usable.

## Where The Published Policies Live

The customer-facing legal set is **code, not markdown**. Every policy is a
Next.js app-router page under `apps/web/app/`, and `/legal` is the index a
procurement or security reviewer starts from.

| Document                  | Route                       | Source                                           |
| ------------------------- | --------------------------- | ------------------------------------------------ |
| Terms of service          | `/terms`                    | `apps/web/app/terms/page.tsx`                    |
| Acceptable use policy     | `/acceptable-use`           | `apps/web/app/acceptable-use/page.tsx`           |
| Privacy policy            | `/privacy`                  | `apps/web/app/privacy/page.tsx`                  |
| Data processing addendum  | `/dpa`                      | `apps/web/app/dpa/page.tsx`                      |
| Subprocessors (Annex III) | `/subprocessors`            | `apps/web/app/subprocessors/page.tsx`            |
| Cookie policy             | `/cookies`                  | `apps/web/app/cookies/page.tsx`                  |
| Security + disclosure     | `/security`                 | `apps/web/app/security/page.tsx`                 |
| `security.txt`            | `/.well-known/security.txt` | `apps/web/app/.well-known/security.txt/route.ts` |
| SLA                       | `/sla`                      | `apps/web/app/sla/page.tsx`                      |
| Refunds                   | `/refund-policy`            | `apps/web/app/refund-policy/page.tsx`            |
| Accessibility             | `/accessibility`            | `apps/web/app/accessibility/page.tsx`            |
| EU representative         | `/legal/eu-representative`  | `apps/web/app/legal/eu-representative/page.tsx`  |
| Mobile surface terms      | `/mobile/legal`             | `apps/web/app/mobile/legal/page.tsx`             |

Entity facts (legal name, notice address, governing law, venue, contact mailbox,
per-document revision dates, canonical routes and their aliases) come from
`apps/web/lib/legal-constants.ts`. Do not hardcode them in a page.

## Rules For Editing A Policy

1. **One canonical page per policy.** `/terms-of-service`, `/privacy-policy`,
   `/cookie-policy`, `/aup` and `/acceptable-use-policy` are permanent (308)
   redirects declared in `apps/web/next.config.ts`. Never recreate them as
   pages — duplicate legal text that drifts is a liability, not a convenience.
2. **Every factual claim must be provable from this repository.** If the code
   does not prove it, cut the sentence or mark it as an absence.
3. **Do not promise emailed notice.** Not because there is no mail provider —
   `apps/web/lib/support/handoff/resend-client.ts` calls the Resend HTTP API over
   plain `fetch`, which is why a dependency grep never found it. The claim fails
   for the narrower true reason: no mailing path here can reach an arbitrary
   list of customers. Notice is the policy page plus `/changelog`. The original
   wording was corrected on 2026-08-14 and is banned from every published page
   by `apps/web/app/__tests__/legal-policy-set.test.ts`.
4. **Do not claim a certification.** There is no SOC 2 report, ISO 27001
   certificate or HIPAA position. `/trust` carries the dated status.
5. **Respect the trust boundaries.** Local, BYOK and Managed Cloud are separate,
   and the controller/processor split differs between them — see `/dpa` §03. A
   flat "we are the processor" clause is wrong for two of the three.
6. **Managed Cloud is in public alpha** and open by default since 2026-06-27
   (`apps/web/lib/managed-compute-gate.ts`). Say so where it bears on a
   commitment.
7. Update the document's date in `POLICY_LAST_UPDATED` in the same change.

`apps/web/app/__tests__/legal-policy-set.test.ts` enforces 1, parts of 2, 4 and 7
mechanically, including a prohibited-claim guard that fails if a removed claim
reappears.

## What Belongs Here

- Policy drafts and review notes that are not yet published as pages.
- Compliance posture and regulatory notes.
- License review notes for copied or adapted open-source code.
- Trademark risk notes and naming decisions.

## What Does Not Belong Here

- Secrets, signed contracts, private customer data, or privileged legal communications.
- Third-party source code; license obligations belong in `THIRD_PARTY_LICENSES.md` and package-level notices.
