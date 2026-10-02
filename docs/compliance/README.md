# docs/compliance

Status: Current
Owner: Legal/compliance
Last updated: 2026-10-02

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
| Referral program terms    | `/referral-terms`           | `apps/web/app/referral-terms/page.tsx`           |
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
   pages, duplicate legal text that drifts is a liability, not a convenience.
2. **Every factual claim must be provable from this repository.** If the code
   does not prove it, cut the sentence or mark it as an absence.
3. **Do not promise emailed notice.** Not because there is no mail provider.
   `apps/web/lib/support/handoff/resend-client.ts` calls the Resend HTTP API over
   plain `fetch`, which is why a dependency grep never found it. The claim fails
   for the narrower true reason: no mailing path here can reach an arbitrary
   list of customers. Notice is the policy page plus `/changelog`. The original
   wording was corrected on 2026-08-14 and is banned from every published page
   by `apps/web/app/__tests__/legal-policy-set.test.ts`.
4. **Do not claim a certification.** There is no SOC 2 report, ISO 27001
   certificate or HIPAA position. `/trust` carries the dated status.
5. **Respect the trust boundaries.** Local, BYOK and Managed Cloud are separate,
   and the controller/processor split differs between them, see `/dpa` §03. A
   flat "we are the processor" clause is wrong for two of the three.
6. **Managed Cloud is in public alpha** and open by default since 2026-06-27
   (`apps/web/lib/managed-compute-gate.ts`). Say so where it bears on a
   commitment.
7. Version the published text in `policy-versions.json` in the same change.
   Update its `POLICY_LAST_UPDATED` date when the policy is revised. The
   `/security` page labels its date as the last full-page review; a targeted
   factual correction that does not re-review every row keeps that date and
   records why in a same-date version entry. Do not present a targeted check as
   a fresh review of the whole page.
8. Keep the replaced version readable. When a date moves, give the first entry
   of the new date a public `summary` of what changed, then run
   `node scripts/archive-policy-versions.mjs`. It renders the text the page
   last published under the old date, taken from the newest commit whose text
   matches the last version recorded under that date, preferring one
   `origin/main` already holds, and adds it to `/legal/archive`, where every
   policy's version history lives. The commit an archive names must stay on
   the main line: CI fetches only branches and tags, so it cannot read a
   commit left behind on a deleted, squashed or rewritten branch. When the
   archiver warns that `origin/main` does not hold the commit yet, bring the
   branch into main with a merge commit. A version whose text no commit holds gets
   `"archive": "not-retained"` on its first entry and is listed as not kept. A
   new policy whose first version is dated after the registry's
   `recordedSince`, the day these histories began, gets a `summary` on that
   first version too, and `/changelog` lists it as introduced.
   `scripts/check-policy-versions.mjs` fails until all of this is done, when an
   archived text is not the last version recorded under its date, and when the
   commit an archive names is not on the history of the branch it checks.
9. Announce every change to the subprocessor list. `/changelog` lists only the
   first entry of each date, so a row added to, removed from or renamed on
   `/subprocessors`, and a provider added to or removed from a row's
   `registryProviderIds`, such as a new model provider in the Managed Cloud
   row, moves its date. The entry that moves it records the page's names in
   `subprocessorNames` and its provider ids, without the `_anthropic` dialect
   suffix, in `subprocessorProviders`, and names each change in its `summary`;
   a provider counts as named when the summary spells its id, ignoring case,
   spaces and punctuation, so OpenRouter names `open_router`.
   `scripts/check-policy-versions.mjs` fails when the page's names or providers
   differ from the newest recorded ones, or when they change under an entry
   whose date did not move.

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
