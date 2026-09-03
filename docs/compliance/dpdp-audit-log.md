# DPDP Act (India) compliance, audit and remediation log

Status: In progress, **no legal copy on this branch has been reviewed by counsel**
Branch: `compliance/dpdp`, committed and being merged to `main` (2026-08-22); the
work described below is no longer uncommitted working-tree state. Migrations
0113-0116 ARE applied to production, see §7.1.
Last updated: 2026-08-22
Scope: Digital Personal Data Protection Act, 2023 and the DPDP Rules

This file is the decision log for the DPDP work. It records what was built, what
was deliberately **not** built and why, what a lawyer has to decide before any of
it can be relied on, and what is still open. Findings are cited by `file:line` so
the next person can check the claim rather than trust it.

**Rule this file is held to**, the same one the rest of the policy set follows:
every claim must be checkable in this repository. If you cannot point at the
code, cut the sentence.

---

## 0. Does DPDP even apply?, yes, and here is the evidence

The Act reaches a foreign entity that processes digital personal data **in
connection with offering goods or services to Data Principals within India**
(s.3(b)). AGI Automation LLC is a US entity with no Indian establishment, so this
is the threshold question, and it is not a close one:

- `apps/web/lib/pricing.ts:44`, India-specific Stripe prices exist (`₹399/mo`),
  separate from rest-of-world USD pricing.
- `apps/web/lib/__tests__/pricing.test.ts:202`, `getConfiguredPriceId('team', 'monthly', 'INR')`
  resolves to a real configured price id.
- `apps/web/lib/__tests__/regional-pricing.test.ts:55`, prices are formatted in
  `en-IN` with `₹`.
- `apps/web/app/api/pricing/localized/route.ts`, an unauthenticated route
  selects currency from IP-derived country.

A product that prices in rupees for Indian buyers is offering services to data
principals in India. **Counsel should confirm the conclusion, not the facts.**

The product also already publishes an _unqualified DPDP compliance claim_ in the
mobile store listings (`apps/mobile/store-listing/LISTING-METADATA-ANDROID.json:20`)
and on `apps/web/app/mobile/legal/page.tsx:185`, while the web privacy policy did
not contain the word "India". That gap between claim and implementation was the
single most exposed thing found in this audit.

---

## 1. How the audit was run

A seven-domain parallel audit over the monorepo, followed by an adversarial
verification pass on the highest-severity findings in each domain (verifiers were
prompted to **refute**, and defaulted to refuted when they could not confirm from
source).

- 49 agents, ~229 raw findings, 42 findings put through adversarial verification.
- Domains: collection points · trackers/cookies · storage & retention · existing
  legal copy · security safeguards · non-web surfaces · third-party recipients.
- Six verified findings were **refuted** and are not carried forward. Two of
  those were refuted because the fix had already landed on this branch while the
  audit was running (the waitlist consent findings), the verifier read the
  patched file, which is the loop working as intended.

Verification changed conclusions, so it earned its cost. Three examples:

| Raw finding                                                                              | Verdict                 | Corrected position                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No CAPTCHA anywhere; the CSP is pre-widened for a Turnstile that was never implemented" | **Refuted**             | The `challenges.cloudflare.com` CSP entries are the standard allowlist Clerk requires for its own Turnstile-backed bot protection on `<SignUp>`. Whether that protection is _enabled_ lives in the Clerk dashboard, and `scripts/check-clerk-bot-protection.mjs` now reads it back from the instance and fails when it is off. The correct finding is narrower, see §6. |
| "GA4 has no Consent Mode, no IP anonymisation"                                           | **Refuted at severity** | Literally true of `GoogleAnalytics.tsx:50-61`, but GA4 never loads without consent (`AnalyticsConsentGate` fails closed), so the DPDP substance does not hold.                                                                                                                                                                                                          |
| "Desktop clipboard monitor writes plaintext clipboard to unencrypted SQLite"             | **Refuted**             | Every code fact checked out, but the path is unreachable dead code that never processes real clipboard data at runtime.                                                                                                                                                                                                                                                 |

---

## 2. What was built on this branch

Everything below is wired end to end, UI state → request body → server handler →
database, and verified by running the guards in §7, not by a passing typecheck.

### 2.1 Durable per-purpose consent (DPDP s.6)

| File                                                                            | What it is                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/db/neon/0113_dpdp_consent_records.sql`                                | Append-only `consent_records` ledger. `user_id` nullable so a visitor with no account can consent; anonymous subjects keyed by `subject_email_sha256`. RLS forced. Its `grant select, insert` did **not** by itself make the table append-only, see §7.1 and `0116`. |
| `apps/web/db/neon/0116_consent_ledger_append_only.sql`                          | What actually makes it append-only: `REVOKE update, delete` from `app_rls` on both tables, plus a `BEFORE UPDATE OR DELETE` trigger on `consent_records` that refuses any non-owner role so a future blanket re-grant cannot undo it. Proven behaviourally, §7.1.    |
| `scripts/verify-dpdp-schema.mjs`                                                | Behavioural proof against a live database: RLS forced, grants, the trigger in both directions (including after a deliberate adversarial re-grant), the owner erasure path, every constraint, and the exact reads the app performs. 26 checks.                        |
| `apps/web/lib/consent-purposes.ts`                                              | The purpose catalogue. Isomorphic, so the checkbox label a person reads and the key stored in the database come from one object and cannot drift.                                                                                                                    |
| `apps/web/lib/server/consent-records.ts`                                        | `recordConsent` (INSERT only), `recordConsentBatch`, `readUserConsents`, `readUserConsentHistory`, `hasConsent` (fails closed).                                                                                                                                      |
| `apps/web/app/api/consent/route.ts`                                             | `GET` live state + catalogue; `POST` records grants **and withdrawals** by the same path at the same cost. 409s when the notice revision changed under a stale tab.                                                                                                  |
| `apps/web/features/marketing/components/ConsentCheckboxes.tsx`                  | Per-purpose checkboxes, rendered unticked, with the notice link inside the same block. Exports `toConsentDecisions` (sends every purpose shown, ticked or not) and `missingRequiredConsents`.                                                                        |
| `apps/web/app/api/waitlist/public/route.ts`                                     | **Refuses to store an address** without an explicit decision for the purpose that makes storing it lawful. Writes consent _before_ the address.                                                                                                                      |
| `apps/web/features/marketing/components/{PublicWaitlistForm,WaitlistModal}.tsx` | Both intakes now carry the checkboxes; the modal clears its ticks on close so reopening re-asks.                                                                                                                                                                     |
| `apps/web/lib/services/waitlistServiceClient.ts`                                | Carries `consent` + `consentSurface`; surfaces the server's `CONSENT_REQUIRED` message verbatim (telling someone to "try again" is wrong advice when the fix is to tick a box).                                                                                      |

### 2.2 Notice, rights, and grievance redressal (ss.5, 11–14)

| File                                                         | What it is                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/privacy/india/page.tsx`                        | The itemised India notice: fiduciary identity, per-purpose processing table, consent catalogue, recipients, retention, cross-border position, all six rights with **what the product actually does for each**, grievance contact, children, breach, language.                     |
| `apps/web/app/privacy/requests/page.tsx`                     | Rights page: consent centre, what is already self-serve, the request form, grievance contact.                                                                                                                                                                                     |
| `apps/web/app/privacy/requests/ConsentCentre.tsx`            | Live consent state with one-click withdrawal. Distinguishes _granted_ / _withdrawn_ / **never asked**, the third is not rendered as a refusal, because it is not one.                                                                                                             |
| `apps/web/app/privacy/requests/RightsRequestForm.tsx`        | Access / correction / erasure / withdrawal / nomination / grievance. Open to people with no account.                                                                                                                                                                              |
| `apps/web/db/neon/0114_data_rights_requests.sql`             | Durable request queue with a quotable reference. RLS forced, `select, insert` only.                                                                                                                                                                                               |
| `apps/web/lib/server/data-rights-requests.ts`                | Create + read own + read open queue.                                                                                                                                                                                                                                              |
| `apps/web/app/api/privacy/requests/route.ts`                 | `POST` (anonymous allowed, `waitlist` rate limit) and `GET` (own history).                                                                                                                                                                                                        |
| `apps/web/app/api/admin/privacy/requests/route.ts`           | Admin-gated open queue, so the queue has a **reader**.                                                                                                                                                                                                                            |
| `apps/web/lib/server/anonymous-erasure.ts`                   | `eraseAnonymousSubjectByEmail()`, the only path that reaches NULL-`user_id` rows in `cloud_managed_waitlist`, `consent_records` and `data_rights_requests`. Owner connection, so the append-only consent trigger admits it.                                                       |
| `apps/web/app/api/admin/privacy/erasures/route.ts`           | Admin-gated `POST` that discharges an erasure request from someone who never held an account. Audits the SHA-256 of the address, never the address.                                                                                                                               |
| `apps/web/features/marketing/components/MarketingFooter.tsx` | Grievance officer + mailbox + subject line in the footer strip, plus `/privacy/india` and `/privacy/requests` links.                                                                                                                                                              |
| `apps/web/app/terms/page.tsx`                                | New **§19 Data protection**: privacy policy incorporated, India notice prevails for Indian data principals, consent/withdrawal, warranty on third-party data you upload, security & breach, processing location, and a complaints route **carved out of the arbitration clause**. |
| `apps/web/lib/legal-constants.ts`                            | `GRIEVANCE_OFFICER_NAME`, `GRIEVANCE_RESPONSE_TARGET_DAYS`, `dpdpGrievance`/`dpdpRequest` subjects, new routes and revision dates.                                                                                                                                                |
| `docs/runbooks/personal-data-breach.md`                      | 72-hour Board notification + Data Principal notification templates, evidence-preservation-before-remediation ordering, scoping queries against this schema, and an explicit open-gaps table.                                                                                      |

### 2.3 Tracker gating

- `apps/web/app/layout.tsx`, **Clerk's product telemetry is now disabled**
  (`telemetry={{ disabled: true }}`). It was an opt-out collector posting to
  `clerk-telemetry.com` on mount, for every visitor, before any consent
  interaction, with no switch a visitor could reach. Verified against
  `@clerk/shared` `TelemetryCollector`, which treats `disabled: true` as final;
  verified to typecheck.
- GA4 was **already** correctly gated and fails closed
  (`shared/lib/cookie-consent.ts`, `AnalyticsConsentGate.tsx`). No change needed,
  and the audit's claim to the contrary was refuted.

### 2.4 Tests written

- `apps/web/__tests__/api/waitlist-public.security.test.ts`, 9 new consent-gate
  tests: declined required purpose stores nothing; a _missing_ purpose is refused
  rather than read as a refusal; contradictory decisions rejected; both ticked
  **and unticked** purposes recorded; consent written before the address so a
  ledger failure stores nothing; anonymous consent recorded against a SHA-256
  and never the plaintext address; an invented purpose is dropped, not stored.
- `apps/web/db/neon/dpdp-consent-migration.test.ts`, 11 schema guards, including
  the one the whole design rests on: **no UPDATE grant on `consent_records`**.

---

## 3. Decisions, and why

**Consent is per-purpose and unbundled, not one "I agree".**
s.6(1) requires consent to be specific and limited to the data the named purpose
needs. `WAITLIST_CONSENT_PURPOSES` deliberately excludes `product_analytics`:
asking for analytics consent inside an unrelated email form is exactly the
bundling the section prohibits. Analytics consent belongs to the cookie banner,
where it is acted on.

**A withdrawal is a new row, never an UPDATE.**
Overwriting a grant destroys the evidence that consent was ever held, which is
the record s.6 exists to produce. The database enforces this: `app_rls` has no
UPDATE grant on the table.

**Unticked boxes are recorded.**
"Declined marketing on 3 March" and "was never asked" are different facts and
only the first is defensible later. Both intakes send a decision for every
purpose shown, and the consent centre renders the absence of a row as
_never asked_ rather than as a refusal.

**Consent is written before the personal data.**
If the address were stored first and the ledger write then failed, the product
would hold personal data it could not show consent for, the exact position the
Act penalises. The reverse failure is harmless. This ordering is asserted by a
test, not just a comment.

**The consent ledger stores an email _hash_, not the address.**
The address already lives in `cloud_managed_waitlist`. A digest is enough to link
a consent to a waitlist row and enough to answer a data principal who supplies
their address, which is the only way an anonymous subject can identify
themselves anyway.

**`data_rights_requests.contact_email` _is_ plaintext.**
Every other email in this schema that can be hashed, is. This one cannot: the row
exists to be replied to, and a digest cannot receive a reply. The mitigation is
retention, not hashing.

**Both new tables are DELETED on account erasure, not retained as evidence.**
Registered in `USER_SCOPED_TABLES` (`lib/server/account-erasure.ts`). The
argument for retention is that a consent ledger proves processing was lawful. The
argument that wins: once the account and its content are gone there is no
processing left to justify, and both rows still name the person. Retaining
personal data to prove we were allowed to hold personal data we no longer hold is
the wrong trade.

**The rights request form writes to a table instead of opening a mail draft.**
`/contact` is deliberately a mailto composer and that is right for general
correspondence. A rights request is different: the Act gives the principal a
right to a response and makes exhausting our grievance route a precondition for
approaching the Board, so both sides need evidence the request was made. The
success copy states plainly that the row notifies nobody.

**Grievance Officer is published as a ROLE, not a name.**
No individual's name exists anywhere in this repository for this function, and
inventing one publishes a false statement about a real company. `contact@` with
subject-line routing is used because it is the only mailbox proven to receive
mail, the same convention `/security` already uses. **A named officer is a
founder decision** (§5).

**The Terms version was deliberately NOT bumped.** ← _founder decision needed_
`POLICY_LAST_UPDATED.terms` feeds `CURRENT_TERMS_VERSION`, and bumping it does
more than force a re-acceptance click: `app/api/auth/device/token/route.ts:98`
and `app/api/auth/device/refresh/route.ts:120` **reject device tokens whose owner
has not accepted the current version**. Bumping it would break every existing
desktop, CLI and mobile device session until the user re-accepts on web. Adding
§19 is a material change and the version _should_ move, but that is a
production-disrupting decision, not an engineering one. The change is one line;
see §5.

**Existing false copy on `/privacy` and `/subprocessors` was NOT rewritten.**
See §4, this is the most serious finding in the audit, and it is deliberately
left as a flagged item rather than quietly patched, because those pages are
guarded by tests written on the false premise and rewriting them is its own
reviewed change.

**`WebAppShell.tsx` was not edited.** The signed-in app shell renders no legal
footer (`apps/web/shared/components/layout/WebAppShell.tsx:301`), so the
grievance contact is reachable from marketing pages but not from inside the app.
That file has uncommitted changes from other work in the tree; mixing this into
it would entangle two changes. Recorded as an open item instead.

---

## 4. ⚠️ The most serious finding: published policy contradicts the code

**`/subprocessors` delists a transactional email provider that is live and
receiving personal data, and `/privacy`, `/terms` and `/subprocessors` all rely
on "there is no transactional email system" to justify not notifying users.**

Confirmed by adversarial verification and independently re-verified by hand:

| Evidence                                                                              | Location                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The delisting comment ("REMOVED 2026-08-05, Resend…")                                 | `apps/web/app/subprocessors/page.tsx:14-29`                |
| The page repeats "there is no transactional email system"                             | `apps/web/app/subprocessors/page.tsx:172-177`              |
| A live Resend client, calling `https://api.resend.com/emails`                         | `apps/web/lib/support/handoff/resend-client.ts:33`         |
| User email + scheduled-task names sent to Resend                                      | `apps/web/lib/services/notification-email-service.ts:89`   |
| **Full support chat transcripts, including the user's contact email**, sent to Resend | `apps/web/lib/support/handoff/escalation-email.ts:107,159` |
| Operational alert emails with user-linked job ids                                     | `apps/web/lib/services/video-incident-alert-service.ts:71` |

Why every previous audit missed it: the client is a raw `fetch`, not an npm
dependency, so `grep resend package.json` finds nothing. The file's own header
even says "VERIFIED BEFORE WRITING THIS: there is no `resend` dependency anywhere
in this repo", true, and the reason the policy page went stale around it.

**Under DPDP this is an undisclosed recipient of personal data, and the notice is
inaccurate about it.** Other confirmed recipients missing from `/subprocessors`:

- **Runway ML** receives user prompt text for video generation, `apps/web/app/api/media/video/generate/route.ts:497-513`
- **OpenStreetMap Nominatim** receives user location queries, `apps/web/lib/services/map-geocoding-service.ts:29`
- **Apple App Store Server / Google Play Android Publisher** receive purchase and subscription identifiers, `apps/web/lib/server/mobile-iap-store-verification.ts:254`
- **OpenRouter** is a failover route for _every_ catalogued chat model, not only the three disclosed, `apps/web/lib/services/aggregator-routing.ts:40`
- **Perplexity** receives user search queries as the web-search backend, `apps/web/lib/web-search/web-search-tool.ts:39`
- **GitHub** receives user repository data via the first-party connector, `apps/web/lib/github-app.ts:23`

The new `/privacy/india` page **does not repeat the false claim** and states in
§04 that the published subprocessor list is currently incomplete, naming the
categories. That is a stopgap. Correcting `/subprocessors`, `/privacy` and
`/terms` is item **O-1** below.

---

## 5. Needs lawyer review

Nothing in `apps/web/app/privacy/india/` or Terms §19 has been seen by an Indian
data-protection practitioner. Both new pages carry `data-legal-review="pending-counsel"`
on the page root and a `LEGAL REVIEW REQUIRED` header comment in source.

| #    | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why an engineer cannot answer it                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-1  | Confirm DPDP applicability under s.3(b) and the resulting obligations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §0 establishes the facts; the legal conclusion is counsel's.                                                                                                                                                                                                                                                                                                                                                                                    |
| L-2  | Does any processing here qualify as a **"legitimate use"** under s.7 rather than requiring consent?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The new pages claim none, the conservative reading. Counsel may narrow the consent surface, which would simplify the product.                                                                                                                                                                                                                                                                                                                   |
| L-3  | **Significant Data Fiduciary** status (s.10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | It is a Central Government notification, not a self-assessment. If notified, a named **India-based DPO**, a DPIA and an independent audit become mandatory. None exist.                                                                                                                                                                                                                                                                         |
| L-4  | **s.9 children.** A child is anyone **under 18**; verifiable parental consent is mandatory; tracking and behavioural advertising directed at children are prohibited outright.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The product's position (18+, 13–17 supervised) does **not** implement verifiable parental consent, and mobile's age gate admits self-declared minors (`apps/mobile/app/(public)/age-gate.tsx:17`) with a minor-safe mode the child can clear themselves (`apps/mobile/src/features/settings/parental-controls/index.tsx:36`). Stated as a gap on the notice page rather than papered over. **This is the highest legal exposure in the audit.** |
| L-5  | **s.16 cross-border.** Transfers are permitted except to territories restricted by Government notification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Whether any notification affects US hosting depends on the live list on the date of reading. The page deliberately asserts no answer.                                                                                                                                                                                                                                                                                                           |
| L-6  | **s.6(4) languages.** The notice must be available in English **and every Eighth Schedule language**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Only English exists. This is a translation commissioning decision. The product already ships a Hindi locale (`app/i18n/`), while every legal page is hardcoded English JSX, so the mismatch is visible to users today.                                                                                                                                                                                                                          |
| L-7  | Is a **role** (not a named individual) an acceptable published grievance contact?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Drives whether the founder must designate someone by name.                                                                                                                                                                                                                                                                                                                                                                                      |
| L-8  | Is `GRIEVANCE_RESPONSE_TARGET_DAYS = 30` appropriate, and must it be described as a commitment rather than a statutory period?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Published as a commitment today, deliberately.                                                                                                                                                                                                                                                                                                                                                                                                  |
| L-9  | Review the two **docs/runbooks/personal-data-breach.md** templates before either is ever sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Drafted from the statute by an engineer.                                                                                                                                                                                                                                                                                                                                                                                                        |
| L-10 | Does the **DPA** need a DPDP annex? Its "Applicable Data Protection Law" definition excludes DPDP and uses controller/processor framing that the Act does not share (`apps/web/app/dpa/page.tsx:209`), and its breach obligation runs only to the enterprise Customer, with no commitment to notify data principals (`:513`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Contract drafting.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| L-12 | **EU AI Act Art. 50(1), the composer disclosure was removed on 14 August (founder decision).** The sentence "You are interacting with an AI system." no longer renders on the web chat surface. The position relied on is Art. 50(1)'s own carve-out: the duty does not apply where interacting with an AI is obvious to a reasonably well-informed, observant and circumspect person given the context of use. A product presented end-to-end as an AI assistant, entered through a model picker and a mode selector naming the inference route, is argued to fall inside it, the position ChatGPT and Claude visibly take. **Counsel should confirm the carve-out applies before this ships to EU users**, since the product has served them since 2026-06-27 and the Act has applied since 2026-08-02. Two things counsel should NOT be told: that signup terms acceptance discharges this (it does not, that is contract consent, 50(1) is transparency at the point of interaction), and that the comparators show nothing (both show an accuracy caveat, which is why ours was kept). Reasoning is in `apps/web/lib/compliance/ai-act.ts`; mobile is unaffected and still carries its own disclosure. |
| L-11 | Terms §19 carves the data-protection complaints route **out of the arbitration clause**. Confirm that is both intended and effective.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Drafting choice with litigation consequences.                                                                                                                                                                                                                                                                                                                                                                                                   |

### Founder decisions (not legal, but not mine)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | Designate a **named** Grievance Officer, or confirm the role account stands (`GRIEVANCE_OFFICER_NAME` in `lib/legal-constants.ts`).                                                                                                                                                                                                                                                                                                                  |
| F-2 | Confirm `NOTICE_ADDRESS`. It is already flagged founder-unconfirmed in `legal-constants.ts` and is now printed on two more pages.                                                                                                                                                                                                                                                                                                                    |
| F-3 | **Bump `POLICY_LAST_UPDATED.terms`?** One line. Consequence: every existing desktop/CLI/mobile device session is rejected until the user re-accepts on web (§3). Deliberately not done.                                                                                                                                                                                                                                                              |
| F-4 | Provision a real `privacy@` / `grievance@` mailbox, or keep subject-line routing on `contact@`.                                                                                                                                                                                                                                                                                                                                                      |
| F-5 | Commission Eighth Schedule translations (L-6).                                                                                                                                                                                                                                                                                                                                                                                                       |
| F-6 | Decide whether the **mobile store listings' unqualified DPDP compliance claim** stands (`apps/mobile/store-listing/LISTING-METADATA-ANDROID.json:20`). It currently overstates the position.                                                                                                                                                                                                                                                         |
| F-7 | **`proFeature2` "Priority routing across providers"** (`packages/ui/i18n/locales/*/pricing.json`) has no implementation, a grep for priority/tier routing across `apps/web/lib`, `apps/web/app/api` and `packages/ai` returns nothing. It is a product-capability claim, so it should be built or cut. NOT edited here: the string exists in ten locale bundles and rewriting marketing copy in ten languages unreviewed is not an engineering call. |
| F-8 | `enterpriseFeature2` ("Custom capacity and dedicated support") and `enterpriseFeature4` ("Annual contract with a dedicated account manager") are also unbacked in code, but they are **staffing commitments, not product features**, and software cannot evidence a human. Left alone deliberately; confirm you intend to staff them.                                                                                                                |

---

## 6. Security gaps flagged (DPDP s.8(5))

s.8(5) requires reasonable security safeguards to _prevent_ a breach, and failure
is directly penalisable regardless of whether a breach occurs. These were
confirmed in source. **None were fixed on this branch**, each is its own change
with its own blast radius, and shipping half of one is worse than filing it.

### Requested specifically

**"Unverified captcha"**, the accurate finding, after refutation of the broader
claim: there is **no first-party CAPTCHA and no `siteverify` call anywhere in the
repository**. `challenges.cloudflare.com` in `apps/web/proxy.ts:87,93` is the
standard allowlist for Clerk's own Turnstile-backed bot protection on `<SignUp>`,
which is configured in the **Clerk dashboard**. That toggle is no longer opaque
to the repository: `scripts/check-clerk-bot-protection.mjs` decodes the frontend
API host from the publishable key, reads `user_settings.sign_up.captcha_enabled`
and the `display_config` captcha site key from the instance's public
`/v1/environment` document, and exits non-zero when sign-up bot protection is off
or has no site key to render. `.github/workflows/clerk-bot-protection.yml` runs it
daily against the production instance, so the answer is recorded on every run and
a disabled toggle turns the job red instead of going unnoticed. Unauthenticated
PII intakes (`/api/waitlist/public`, `/api/mobile/feedback`,
`/api/mobile/content-report`) are protected by CSRF **and** rate limiting, the
"protected only by an IP rate limit" version of this finding is false, but by no
first-party bot verification.

**Fail-open behaviour**: four instances, in descending severity:

| Gap                                                                          | Location                                                 | Effect                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account-status kill switch has a fail-**OPEN** env escape hatch              | `apps/web/lib/api-auth.ts:81-90`                         | With `ACCOUNT_STATUS_FAIL_OPEN` set, suspended and banned accounts are admitted. It appears in **neither** `validate-env.ts` nor `env-doctor.mjs`, so a deploy left with it on gives no boot-time signal.                       |
| api-gateway rate limiting degrades silently to in-memory                     | `services/api-gateway/src/middleware/rateLimit.ts:60-99` | Warns and continues when Redis is absent. The web app throws at cold start in production (`apps/web/lib/rate-limit.ts:43-52`); the gateway does not, so limits divide by instance count.                                        |
| Every encryption/CSRF/cron secret is a boot **warning** only                 | `apps/web/lib/validate-env.ts:29-89`                     | `CSRF_SECRET`, `CRON_SECRET`, `TOTP_ENCRYPTION_KEY`, `DEVICE_TOKEN_ENCRYPTION_KEY`, `LOG_SALT` are all "important", not critical; `ENCRYPTION_KEY` is in neither list. A production deploy missing all of them **boots green**. |
| Unauthenticated PII intakes fail open on rate limiting during a Redis outage | `apps/web/lib/rate-limit.ts:94`                          |                                                                                                                                                                                                                                 |

**Encryption weaknesses**

| Gap                                                                                                                                                                                                    | Location                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Legacy **plaintext TOTP secrets** are read and returned as-is (`/^[A-Z2-7]+$/` → "return as-is"), with no migration job. `envelope.ts:29` states `user_two_factor.totp_secret_enc` is **not wired**.   | `apps/web/features/settings/services/user-preferences.ts:131-138`                                              |
| TOTP AES-256 key is the **raw first 32 UTF-8 chars** of an env var, no KDF, no entropy check, while the sibling route on the **same variable** applies `scryptSync(N=2^15)` plus an entropy assertion. | `apps/web/features/settings/services/user-preferences.ts:67-75` vs `app/api/auth/desktop-token/route.ts:68-84` |
| A deprecated but still-exported **XOR stream cipher with a deterministic key** on the shared `securityManager` singleton; key derivation is hand-rolled XOR/rotate, not a KDF.                         | `apps/web/shared/lib/security.ts:141-215`                                                                      |
| Desktop DB / API-key / MCP-credential keys derive from a machine id via PBKDF2 with no user secret.                                                                                                    | `apps/desktop/src-tauri/src/sys/security/machine_key.rs:219-237`                                               |

**HTTPS / transport**

| Gap                                                                                                                                                                                                                                       | Location                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| api-gateway CORS defaults to `http://localhost:3000/3001` **with `credentials: true` and no `NODE_ENV` guard** when `ALLOWED_ORIGINS` is unset. `apps/web/lib/cors.ts:20-34` gates the same entries on development; the gateway does not. | `services/api-gateway/src/app.ts:49-90`                                          |
| No `sslmode=require` enforcement in code for direct Postgres pools, TLS depends entirely on the operator's connection string. It appears only in doc comments.                                                                            | `services/api-gateway/src/lib/neonClients.ts:562-569`                            |
| Clerk JWT verification omits `authorizedParties`; `CLERK_AUTHORIZED_PARTIES` silently no-ops when unset.                                                                                                                                  | `services/api-gateway/src/middleware/auth.ts:68`, `apps/web/lib/api-auth.ts:110` |
| Cron bearer secret compared with non-constant-time string equality.                                                                                                                                                                       | `apps/web/lib/server/cron-auth.ts:13`                                            |

**Logging / leakage**

| Gap                                                                                                                                                          | Location                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Pino has **no redaction configured** and application code logs email addresses verbatim.                                                                     | `apps/web/lib/logger.ts:17`                                                                        |
| **Share capability tokens written into error logs**, exposing every shared conversation reachable by that token.                                             | `apps/web/app/api/shared/route.ts:106`                                                             |
| Sentry `beforeSend` scrub never touches exception messages or `event.message`.                                                                               | `apps/web/lib/sentry-shared.ts:87`                                                                 |
| Bearer credentials persisted to plaintext `localStorage` and used indefinitely.                                                                              | `apps/web/shared/lib/api.ts:92-115`                                                                |
| Browser extension stores a full identity/employment profile (name, email, phone, location, salary) in plaintext `chrome.storage.local` with no erasure path. | `apps/extension/src/features/content/autofill/filler.ts:826`, `apps/extension/src/options.ts:1357` |

---

## 7. Verification run

| Check                                                       | Result                                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p apps/web/tsconfig.json`                | **clean** (this is also how the Clerk `telemetry` prop was verified as typed)                                                           |
| `node scripts/check-db-isolation.mjs`                       | **passed**, 98 tenant-scoped tables across 117 live tables, each with an explicit isolation decision (both new tables carry forced RLS) |
| `vitest run lib/server/account-erasure.test.ts`             | **passed**, the schema-derived guard accepts both new tables' erasure classification                                                    |
| `vitest run app/__tests__/legal-policy-set.test.ts`         | **passed**, both new routes satisfy the four-point registration contract (page exists, in sitemap, on `/legal`, no alias)               |
| `vitest run __tests__/api/waitlist-public.security.test.ts` | **passed, 34 tests**, 9 of them new consent-gate tests                                                                                  |
| `vitest run db/neon/dpdp-consent-migration.test.ts`         | **passed, 11 tests**                                                                                                                    |

**Not run:** the full monorepo suite, and lint across all packages.

### 7.1 Applied to the database, and the defect that only a database found

`0113`–`0116` are **applied to production** (Neon project `wispy-star-10666975`,
branch `production`): **116 applied, 0 pending, 0 drift**. Sequence followed:

1. Backup branch `backup-pre-0113-20260814` cut from production (repo convention).
2. Throwaway branch `dpdp-migration-test-20260814` cut from production; all
   pending migrations applied there and verified; branch since deleted.
3. Production applied with `--target production --confirm-production`.
4. `node scripts/verify-dpdp-schema.mjs` re-run **against production**: 26/26.
5. Final production grants confirmed `{consent_records: [INSERT, SELECT],
data_rights_requests: [INSERT, SELECT]}`, trigger present, zero test residue.

Production was at 110 with **six** pending, not two: `0111_credit_top_up_carry`,
`0112_mobile_native_iap` and `0115_mcp_oauth_discovery` (all from commit
`310ca5667`, authored elsewhere) were also unapplied. The runner is ordinal and
cannot skip, so shipping the DPDP migrations meant shipping those three. That was
raised and **explicitly authorised** before production was touched.

> **The append-only ledger was not append-only.** `0113` grants
> `select, insert ... to app_rls` and was documented as append-only in the
> migration, its down script, the migration test, this file, and the commit
> message. That grant is **additive and prevents nothing**: `0037:83` sets
> `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
TO app_rls`, so both tables were born mutable. Measured on a real branch,
> `app_rls` held `INSERT,SELECT,UPDATE,DELETE` on both.
>
> The text-matching migration test could not see this, it read the `.sql` file
> and found the words, which were there. **`0116_consent_ledger_append_only.sql`
> is the repair**: a `REVOKE` (the pattern `0043_audit_log_immutability.sql`
> already used for `security_audit_logs`) plus a `BEFORE UPDATE OR DELETE`
> trigger that refuses any non-owner role, because `0043` documents that a
> REVOKE alone is **not** re-grant-proof, and the consent ledger's entire legal
> value is that a withdrawal cannot overwrite the grant it withdraws.
>
> `scripts/verify-dpdp-schema.mjs` now proves it behaviourally, including the
> adversarial case: it deliberately re-issues `grant update, delete` and shows
> the trigger still refuses, while the owner path still deletes so account
> erasure keeps working.

**Lesson worth keeping:** a migration test that asserts the text of a `.sql` file
proves the spelling, not the schema. Anything load-bearing needs a connection.

---

## 7.2 Second pass, competitor-benchmarked page audit (14 August)

A five-domain audit compared `/privacy`, `/terms`, `/security`+`/trust`, the
marketing surface and `/legal`+`/cookies`+`/subprocessors` against reference
captures of the OpenAI, Anthropic and t3.chat policy sets, then put every
proposed change through a verifier told to refute it. **57 proposed items were
cut**, which is the number that matters: 21 were already fixed by the first
pass, and the rest were wrong.

Three cuts worth keeping on the record, because each would have shipped a
falsehood:

| Proposed                                                                                        | Verdict                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List Apple App Store Server as a recipient of purchase identifiers                              | **Cut.** `mobile-iap-store-verification.ts` verifies Apple's signed notifications locally with `SignedDataVerifier` against bundled root certificates. Apple sends to us; nothing goes back. Only Google's path is an outbound POST. |
| Publish a corrected API route-coverage figure on `/trust`                                       | **Cut.** `trust-surface-claims.test.ts:125` asserts that no `N of M hosted API route files` figure appears, a deliberate guard against a number that cannot be kept true.                                                            |
| Adopt "your data will be transferred to and processed in the United States" as a flat statement | **Cut.** False as an absolute: Nominatim is in the EU and three model providers are outside the US.                                                                                                                                  |

**A claim this branch itself published, and then corrected.** The first pass
added a `/privacy` row saying download records hold "a hashed IP … pseudonymous
rather than anonymous". Half true and flattering: the `release_downloads` hash
uses a **fixed salt** (`0020_functions.sql:1783`), and `/api/download` separately
writes the **raw** IP to application logs (`route.ts:109-129`). The row now says
both. Writing a compliance page is not exempt from the rule the page enforces.

### What the second pass fixed

| Was published                                                                                   | Actually true                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/security`: "CI blocks on Semgrep's security-audit ruleset"                                    | Semgrep runs and does **not** block; its own step comment says `--error` flips it once findings reach zero, and they have not.                                                                                                                                                            |
| `/security`: "CodeQL runs on push and weekly on Mondays at 04:17 UTC"                           | **There is no CodeQL in this repository.** `.github/workflows/codeql.yml` is named `Rust Security` and runs cargo audit + clippy on that schedule. The filename is the only CodeQL thing about it.                                                                                        |
| `/security`: "GitHub Actions are pinned by commit digest"                                       | `check-action-pins.sh` enforces SHA pinning for **third-party** actions and exempts the first-party `actions/` namespace.                                                                                                                                                                 |
| `/security` + `/trust`: erasure covers "34 user-scoped tables"                                  | **66.** Nothing guarded the figure, so it drifted with every migration that added a table. Now derived from `USER_SCOPED_TABLES.length` by a test, so it cannot drift again.                                                                                                              |
| `/security`: artifact sandbox sets `frame-src 'none'`                                           | The deployed policy sets `frame-src 'self'`. Quoting a directive stricter than the one served is the worst error available on a security page, a reviewer checks the quote, not the header.                                                                                               |
| `/subprocessors`: "We do not process your prompts; the request flows directly from your client" | True of desktop, CLI and VS Code. **The web app is cloud-only and has no user-supplied-key path at all** (`lib/byok-providers.ts:9-14`), so everything done in a browser is Managed Cloud. The surface is now named on both `/subprocessors` and `/privacy`.                              |
| `/dpa`: two more instances of "there is no transactional email system"                          | Fixed. The guard's first version omitted `/dpa`, and the claim survived there a day longer than everywhere else, a guard is only as wide as its file list. It now covers `/dpa`, `/security` and `/trust` too.                                                                            |
| Home page: "we will tell you the day it lands" / "We'll email you the day AGI Mobile lands"     | Nothing reads `cloud_managed_waitlist` to send mail. An unperformable promise, and under the consent model, worse: an address collected for a purpose we cannot carry out. Rewritten to what actually happens. The same tightening was applied to this branch's own consent-purpose copy. |

---

## 7.3 Third pass, the rest of the policy surface (14 August)

Six domains audited: FAQ + help, AUP + agent-permissions, SLA + refunds +
accessibility, mobile legal + store listings, DPA + /legal index, and
cross-cutting structure.

**Read this before using the findings below.** The audit agents completed; the
**verifier agents failed on API 529s on both the first run and the resume**. Two
earlier passes showed verification cuts roughly half of all proposals as stale or
simply wrong, so an unverified finding here is a QUESTION, not a defect. Every
item acted on in this pass was verified BY HAND against source. Everything else is
left in the queue below, unverified, deliberately.

### Verified by hand and fixed

| Was published                                                                                              | What the code says                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/mobile/legal`: a row declaring **HealthKit** collection, step count, sleep, activity summary             | HealthKit was removed from the app in `93ca123df`, and `apps/mobile/__tests__/ios-store-submission-config.test.ts:60-63` asserts the iOS privacy manifest carries **no** HealthKit claim. The page declared collection of health data the app cannot collect and holds no entitlement for, the worst direction to be wrong in on a sensitive category, and contradicted by the app's own test.         |
| `/mobile/legal`: rows naming a **crash-monitoring provider** and an **analytics provider**                 | `apps/mobile/package.json` declares neither. A telemetry queue exists at `apps/mobile/storage/telemetry.ts`, but nothing calls `enqueueTelemetryEvent` and nothing sends it, so no event is produced and none leaves the device. These are app-store declarations, which the stores enforce.                                                                                                           |
| FAQ: `custom OpenAI-compatible endpoints` listed as a provider capability                                  | `apps/web/app/partners/page.tsx:60-64` records the exact decision this violates, in terms: there is no generic provider variant and no setting that points AGI at an arbitrary endpoint. The one real path is CLI-only, from its own config file, https-or-loopback.                                                                                                                                   |
| FAQ training answer: stopped at "does not train AGI-owned models" and appended `POSITIONING.trustBoundary` | `legal-policy-set.test.ts:204-214` requires `/privacy` and `/terms` to carry all four of "AGI-owned models", "applicable terms and data-use policies", "not a promise" and "OpenRouter", precisely so a no-training sentence is never read as covering the third parties that receive the content. The FAQ carried one. What it appended is a plan-capacity blurb that answers nothing about training. |
| `/help` BYOK card: "Desktop, CLI, and VS Code", hardcoded                                                  | Dropped `BYOK_SURFACES.exclusion`, which `/byok` and `/faq` both carry, so a reader on the **web** app, which cannot accept a provider key at all, was told to "add your API key" with nothing saying this surface is excluded. Also named VS Code without saying `SURFACE_STATUS.vscode` is coming-soon with zero published release tags.                                                             |
| FAQ: EU/UK residency "on the roadmap"; Enterprise "SSO… planned"                                           | Nothing backs a roadmap. And "planned" _understated_ two of three: SSO and SCIM directory provisioning are genuinely built (migrations 0083/0084/0092, `lib/server/scim`, admin routes). Audit-log export and per-org retention really are absent.                                                                                                                                                     |

**One finding the evidence refuted.** The audit called the `/accessibility`
contrast, focus and screen-reader rows unsupported. `apps/web/reports/a11y-report.json`
reports **zero violations** against `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
the claims are backed. What was actually wrong is their _breadth_: the scan covers
five routes in two colour schemes and the rows read site-wide, while the Keyboard
row on the same page already modelled the honest version. The rows are now scoped
and the evidence and its limits are published. Cutting them would have been the
wrong fix.

### Verified against code and locked by a regression test (17 August)

Q-1, Q-2, Q-3 and Q-6 were traced to their enforcing code path and all four
published claims survived. `apps/web/app/__tests__/aup-enforcement-claims.test.ts`
now binds each sentence to the code that makes it true, so a change to either
side breaks the build rather than the copy.

| #    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1  | **Claim holds.** `classifyToolLoopInputs` forces `approvalMode: 'manual'` for the whole turn as soon as one MCP tool is present, and the account default `DEFAULT_TOOL_APPROVAL_POLICY` is `ask_every_time`, under which `policyAutoApprovesTool` returns false for every tool. Auto-approval of read-only tools exists but is opt-in. The named built-in exemption is real: a turn carrying only web search / URL fetch / sandbox tools classifies as `auto`. |
| Q-2  | **Claim holds, including the "does not hide it" caveat.** `resolveToolCallGate` tests `saved === 'deny'` first and returns before any allow path, and the resume path re-checks it (`connectorPermissions.isDenied` in `approve/route.ts`). The tool list handed to the model is built from `mcpTools` with no permission filter, so a blocked tool is still offered and then refused.                                                                         |
| Q-3  | **Claim holds.** `saved === 'ask'` is decided above the `approvalMode === 'manual'` branch, so a saved "ask" verdict is reached in automatic mode too.                                                                                                                                                                                                                                                                                                         |
| Q-6  | **All three published numbers hold.** `llm-completion` is 30/min fail-closed, `llm-completion-ip` is 1,500/min fail-closed, `chat-conversation` is 60/min.                                                                                                                                                                                                                                                                                                     |
| Q-7  | **Claim holds.** `runtime.ts` provisions all three published network policies (`allowInternetAccess: true` for full, `allowOut: [...TRUSTED_CODE_HOSTS]` + `denyOut: [ALL_OUTBOUND_TRAFFIC]` for trusted, `allowInternetAccess: false` for none) and refuses fail-closed when the plan grants no sandbox lifetime, so the bounded-lifetime and per-plan-allowance sentence is backed.                                                                          |
| Q-8  | **Claim corrected.** The `debugger` permission and `chrome.debugger.attach` are real, but a run needs TWO grants: the site allowlist AND a per-origin browser-control consent (`hasBrowserControlConsent` in `background.ts`). The AUP sentence implied the allowlist alone was the grant and now names both.                                                                                                                                                  |
| Q-10 | **Claim holds.** `customer.subscription.updated` mirrors `cancel_at_period_end` without changing status or plan, so a pending cancellation keeps entitlement; only `customer.subscription.deleted` at term end sets `status = 'canceled', plan_tier = 'free'`.                                                                                                                                                                                                 |

### Queue: audited, NOT verified, do not act on without checking

Each needs the same treatment: open the cited file, open the code that would have
to back it, and decide. Highest value first.

| #    | Question to answer                                                                                                                           | Cited at                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Q-4  | Can per-tool permissions really be set from the conversation approval card on web today?                                                     | `agent-permissions/page.tsx:463`               |
| Q-5  | Is the Desktop OAuth scope table complete (it lists only Gmail, Google Calendar, Outlook Calendar)?                                          | `agent-permissions/page.tsx:408`               |
| Q-9  | Do the SLA first-response targets (Free 48h … Enterprise) have any mechanism behind them, and does `/refund-policy` correctly point at them? | `sla/page.tsx:48`, `refund-policy/page.tsx:96` |
| Q-11 | Does `/mobile/legal` correctly describe local conversation deletion on uninstall, the Art. 50(1) in-app disclosure, and the export marker?   | `mobile/legal/page.tsx:238,241,258`            |
| Q-12 | Does the mobile children's statement survive contact with the self-declared age gate?                                                        | `mobile/legal/page.tsx:275`                    |
| Q-13 | Does the DPA need a DPDP annex, and should "Applicable Data Protection Law" name the DPDP Act?                                               | `dpa/page.tsx:209`                             |

**Re-running the verifiers is the cheap way to clear this queue**, the audit
agents replay from cache, so only the six verify calls re-run:
`Workflow({scriptPath: '…/legal-surface-to-global-standard-wf_964d1caf-983.js', resumeFromRunId: 'wf_964d1caf-983'})`.

---

## 8. Open items

Ordered by exposure, not by effort.

| #        | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **O-1**  | **Correct `/subprocessors`, `/privacy` and `/terms`.** Relist the email provider, add Runway, Nominatim, Apple/Google store APIs, GitHub, Perplexity, and the true OpenRouter failover scope; delete the "no transactional email system" justification from all three. The `legal-policy-set` test currently **bans** relisting Resend (`BANNED` entry `name: 'Resend'`), that guard was written on the false premise and must be inverted in the same change.                                                                                                                                                                                                                                                                               | §4                                                                                                                                                                                               |
| **O-2**  | **Verifiable parental consent (s.9).** Web has no age gate at all; mobile's is self-declared and its minor-safe mode is child-clearable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | L-4                                                                                                                                                                                              |
| **O-3**  | **Desktop "delete my account" deletes nothing.** Every DELETE targets a column or table that does not exist; "Clear all local data" clears 8 of ~100 tables; the desktop GDPR export omits nearly everything while the UI claims completeness; a second export command hard-fails on a non-existent table. Local SQLite retains emails, contacts, screenshots and OCR text no erasure path reaches.                                                                                                                                                                                                                                                                                                                                          | `apps/desktop/src-tauri/src/sys/commands/privacy.rs:244`, `.../chat/maintenance.rs:17`, `.../onboarding.rs:136`, `.../privacy.rs:176`, `src-tauri/src/data/db/migrations.rs:1676`, all CONFIRMED |
| **O-4**  | **Desktop telemetry is constructed `enabled: true, privacy_mode: None`**, two Tauri commands emit user-identified telemetry bypassing the consent gate, "Delete All Data" never deletes the persisted telemetry file, and the settings UI claims analytics are "anonymous" and collect no PII while a persistent pseudonymous id is minted before any consent.                                                                                                                                                                                                                                                                                                                                                                               | `apps/desktop/src-tauri/src/lib.rs:508`, `.../commands/analytics.rs:535`, `.../telemetry/collector.rs:289`, `apps/desktop/src/features/settings/AnalyticsSettings.tsx:92`, all CONFIRMED         |
| **O-5**  | **CLOSED, anonymous rows now have an erasure path.** `eraseAnonymousSubjectByEmail()` deletes NULL-`user_id` rows from `cloud_managed_waitlist`, `consent_records` (by `subject_email_sha256`) and `data_rights_requests` (by `contact_email`), and `POST /api/admin/privacy/erasures` is the documented mechanism for an erasure request from someone who never held an account: admin-gated, CSRF-guarded, `admin-security` rate limit, audited by SHA-256 of the address rather than the address. It refuses to touch account-bound rows and reports their count so the operator routes those to the account path instead. Remaining: no operator UI, the queue at `GET /api/admin/privacy/requests` and this endpoint are both API-only. | `apps/web/lib/server/anonymous-erasure.ts`, `apps/web/app/api/admin/privacy/erasures/route.ts`, `apps/web/lib/server/anonymous-erasure.test.ts`                                                  |
| **O-6**  | **"Unsubscribe anytime" is promised and no unsubscribe path exists.** `unsubscribe_token`/`unsubscribed_at` columns exist in `0016_misc.sql:68-69` and are read only by the export route; no route consumes them, and `cloud_managed_waitlist` has no withdrawal column at all. The new consent ledger records a withdrawal but **nothing reads it before sending**. Wire `hasConsent(userId, 'product_updates')` into the notification path.                                                                                                                                                                                                                                                                                                | `WaitlistModal.tsx:203`, `apps/web/app/waitlist/page.tsx:63-65`                                                                                                                                  |
| **O-7**  | **Nobody is notified when a rights request arrives**, and nothing polls the queue. `GET /api/admin/privacy/requests` exists so it _can_ be read; working it is a human routine that does not exist yet. Consider wiring the existing email client to the queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §2.2                                                                                                                                                                                             |
| **O-8**  | **Server/edge Sentry initialises for every request with no consent check** and retains a stable user id. Arguably a security legitimate-use rather than a tracker, but decide it deliberately and write the answer down.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `apps/web/instrumentation.ts:65-70`, CONFIRMED                                                                                                                                                   |
| **O-9**  | **Signed-in app shell has no legal footer**, so the grievance contact is unreachable from inside the product.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/web/shared/components/layout/WebAppShell.tsx:301`                                                                                                                                          |
| **O-10** | **Cookie consent has no server-side record, no timestamp and no policy version**, and never expires when the notice changes. The new ledger has a `product_analytics` purpose ready for it; wire the banner to `POST /api/consent` for signed-in users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `apps/web/shared/lib/cookie-consent.ts:34,83`, CONFIRMED                                                                                                                                         |
| **O-11** | **The privacy policy's "what we collect" table omits ~10 proven categories**: waitlist emails, feedback blobs, content reports (incl. a 500-char conversation excerpt), support-handoff transcripts, search history, memories, phone number, download IP hash + user-agent + referrer, SCIM directory identities, mobile push tokens.                                                                                                                                                                                                                                                                                                                                                                                                        | `apps/web/app/privacy/page.tsx:153`, CONFIRMED                                                                                                                                                   |
| **O-12** | **No nomination field (s.14)**, handled manually via the request form. Disclosed as unfinished on the notice page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §2.2                                                                                                                                                                                             |
| **O-13** | **PARTLY CLOSED (2026-08-22).** The registration half is fixed and locked: every cron route under `apps/web/app/api/cron/` now appears in `vercel.json` (12 schedules, verified by set comparison), including `enforce-billing-retention`, `purge-security-audit-logs`, `purge-deleted-accounts` and `expire-support-handoffs`, and `app/privacy/__tests__/retention-claims-match-crons.test.ts` now fails if the policy promises a retention limit no registered schedule enforces. **Still open:** `cloud_managed_waitlist` and `data_rights_requests` have no maximum age, no cron route references either table.                                                                                                                         | `vercel.json` crons array, `apps/web/app/privacy/__tests__/retention-claims-match-crons.test.ts`, `apps/web/db/neon/0011_waitlist.sql:50`                                                        |
| **O-14** | ~~Apply `0113`/`0114` to a branch database and verify the RLS policies behave.~~ **DONE**, applied through production, 26/26 behavioural checks, and the verification found a real defect (see §7.1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §7.1                                                                                                                                                                                             |
| **O-15** | **Legal pages are hardcoded English JSX with no i18n**, while the product ships other locales. Blocks L-6 mechanically, not just commercially.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `apps/web/app/privacy/page.tsx:77`                                                                                                                                                               |
| **O-16** | **Chrome extension**: injects a content script into every http/https page, requests `debugger` and `cookies` permissions, mirrors chat transcripts to the cloud with no opt-out, and exposes **no privacy notice anywhere in its UI**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `apps/extension/manifest.json:22,37`, `.../cloud-bridge/conversationSync.ts:15`, `apps/extension/src/options.html:1`                                                                             |
| **O-17** | **Mobile presents no privacy notice before or during onboarding**, its iOS privacy manifest declares only Email and Name (omitting user content and device identifiers), and it requests **Contacts** permission that no code reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/mobile/app/(public)/onboarding.tsx:1`, `apps/mobile/app.config.js:162`, `.../deviceIntegrations.ts:104`                                                                                    |
| **O-18** | **`/trust` has GDPR and CCPA rows but no DPDP row**; `/security`'s "what we have not done" lists the EU Art. 27 gap but no Indian obligation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/web/app/trust/page.tsx:33`, `apps/web/app/security/page.tsx:372`                                                                                                                           |
| **O-19** | Security gaps in §6, each needs its own change. **O-19a** (`ACCOUNT_STATUS_FAIL_OPEN` invisible to env validation) and **O-19b** (plaintext TOTP seeds) are the two worth doing first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §6                                                                                                                                                                                               |

---

## 9. What this branch does **not** claim

- It does not make AGI DPDP-compliant. It closes the consent, notice, rights and
  grievance gaps on the **web** surface and documents the rest.
- No legal copy here has been reviewed by counsel.
- Desktop, mobile and the browser extension are **audited but unremediated**
  (O-3, O-4, O-16, O-17). Desktop account deletion deleting nothing is a
  confirmed critical defect that this branch does not touch.
- The migrations ARE now applied through production (§7.1), but `0111`, `0112`
  and `0115` rode along with them, those are other people's schema changes and
  this branch did not review their contents beyond confirming they apply cleanly.
- Nothing here has been pushed, per instruction.
