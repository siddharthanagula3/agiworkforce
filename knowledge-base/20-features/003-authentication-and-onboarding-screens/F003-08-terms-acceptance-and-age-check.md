---
id: "F003-08"
type: "feature"
title: "Terms acceptance and age check"
aliases: ["Terms gate", "Terms acceptance", "Finish signing in (Terms page)", "Terms of Service acceptance", "Age gate", "Age confirmation", "Adult eligibility", "18 and over check", "AGE_GATE_PATH", "mobile-auth terms surface"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S3.19", "S3.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "table:profiles", "store:mmkv", "api:POST /api/terms/accept", "api:POST /api/eligibility", "F003-01", "F003-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-08 Terms acceptance and age check

Before using Cloud features a person must accept the current versioned Terms and confirm they are an adult (18 or over). Web, desktop and mobile record acceptance with version and surface; mobile also asks age before anything else, even for Local use. CLI and VS Code tell the person to finish on the web.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.19](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s319), [S3.20](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s320).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Records, per account, which Terms version was accepted, when, and on which surface; refuses accounts that never accepted; notices (and later requires) newer versions. Separately records an adult-eligibility decision (outcome and minimum age, never the age itself) and refuses under-age accounts. [inferred from terms.ts and adult-eligibility.ts]

**Why it exists.** The service is for adults and runs under versioned Terms. The product needs proof of agreement and a decision that stands in a record, without keeping a birth date (apps/web/lib/server/adult-eligibility.ts comments; packages/contracts/types/src/account-eligibility.ts:41-45).

**Who uses it.** Every new account on web, desktop and mobile; every returning account when a binding Terms revision takes effect; people who sign in from CLI, VS Code and Chrome through the device-approval page.

**Problems it solves**

- No account is used without recorded agreement.
- A Terms change does not lock out users instantly: older valid versions keep working until a binding date.
- Under-age accounts are refused and cannot reopen the question by typing another number (mobile keeps the refusal; server keeps the first decision).
- Old builds and API callers are told what to do through a clear refusal code.

**Use cases**

- New web user signs up, ticks the agreement and continues to chat.
- Returning user on desktop is shown 'Finish signing in' because they never accepted on record.
- Mobile user opens the app for the first time, types their age on the age screen, then continues in Local mode without any account.
- CLI user runs 'agi login'; the terminal prints the Terms link and keeps waiting until they accept on the web.

## 2. User experience

**Where to find it**

- Web and Desktop: /login/complete page, heading 'Finish signing in', detail 'Review the details below to continue.' (apps/web/app/login/complete/page.tsx:124-130). Sign-up also has a terms checkbox on /signup (apps/web/app/signup/TermsGate.tsx).
- Web age step: AgeConfirmationStep on the same page, field label 'Your age' (account-eligibility.ts:6); refusal page AgeIneligibleNotice.
- Mobile age: screen age-gate (apps/mobile/app/(public)/age-gate.tsx), placeholder 'Enter your age', button 'Continue'; shown before onboarding and before Local mode (rootRouting.ts:36-43).
- Mobile Terms: on the Cloud sign-in screen (apps/mobile/app/(auth)/login.tsx:188-250), checkbox text 'I agree to the Terms of Service, including the arbitration clause and class-action waiver, and acknowledge the Privacy Policy.' with links 'Read Terms' and 'Read Privacy Policy'.
- CLI: terminal line 'Accept the updated terms to finish signing in:' with a link (apps/cli/src/oauth.rs:522-532). VS Code: warning message with the Terms or age link (packages/client/client-runtime/src/deviceAuthorization.ts:120-127).
- Chrome: message 'Accept the updated AGI Workforce Terms of Service on agiworkforce.com to keep using AGI Cloud chat.' (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:198-200).

**Before you start**

- Web: a verified primary email comes first (ConfirmEmailStep), then age, then Terms (login/complete/page.tsx:63-117).
- Mobile: nothing for the age screen; Terms need a Cloud sign-in.

**Screens and controls**

- Web Terms gate: checkbox 'I agree to the ...' with links to Terms and Privacy, button labelled 'Continue', link to sign out (TermsReviewSignOut), and, only at first acceptance for an account with no marketing-email decision, an optional marketing email box (page.tsx:119-122).
- Web age step: one numeric field and a submit button; under-18 answers show a notice and block continuing.
- Mobile age screen: numeric field (max 3 digits, accessibility label 'Enter your age in years'), 'Continue' disabled until something is typed.
- Mobile Terms: checkbox (role checkbox) and a button that calls accept; error state offers retry.

**Journey**

1. Web or Desktop: sign in; the server checks account status, then email confirmation.
2. If no age decision is on record the age step appears; answer it.
3. If the account has never accepted (or a binding revision has passed its date) the Terms gate appears; tick and continue; acceptance is recorded with surface web-login or web-signup.
4. If the account is on an older valid version it continues straight in with a notice header, and can accept early through ?review=terms.
5. Mobile: first launch shows the age screen; then onboarding or Local chat; when signing in to Cloud, accept the Terms and (if asked) answer the account age check.
6. CLI and VS Code: start sign-in, open the web approval page, accept there; the terminal keeps polling (CLI) or shows an error and asks to sign in again (VS Code).

**What the person sees and gets**

- Under 18: 'You must be at least 18 years old to continue.' (account-eligibility.ts:11).
- Notice on every age screen: 'This service is for adults. You must be at least 18 years old to use it.'
- Terms changed mid-page: API answers TERMS_VERSION_OUTDATED (409) and the mobile store shows 'The Terms changed. Review the current version before continuing.'
- Mobile store error: 'Could not record your agreement. Retry and review the current Terms.'
- API refusals for clients: terms_acceptance_required with a link (auth-gate.ts:86-107).

**Settings**

- None for the person. Operators: MIN_REQUIRED_TERMS_VERSION and MIN_REQUIRED_TERMS_EFFECTIVE_AT (both null today) and MATERIAL_TERMS_GRACE_DAYS (30) in apps/web/lib/server/terms.ts:20-22; the published Terms version comes from POLICY_LAST_UPDATED.terms.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web terms record: recordTermsAcceptance writes terms_version, terms_accepted_at and terms_accepted_surface on public.profiles; surfaces are web-signup, web-login, mobile-auth (apps/web/lib/server/terms.ts:24,186-212).
- Standing logic: no record means 'required'; older version means 'notice' unless a binding revision's date has passed (terms.ts:93-113).
- POST /api/terms/accept checks CSRF, version match (409 otherwise), confirmed email, new-account rule for sign-up, adult eligibility, then records, optionally records marketing consent and referral attribution (apps/web/app/api/terms/accept/route.ts:100-195).
- GET /api/terms/accept returns currentVersion and accepted = standing is not required (route.ts:198-203). This already reports the standing, so the brief's pending patch note looks superseded.
- Adult eligibility: server decision from declared age or OS age signal, stored as outcome plus minimum age; refusal is sticky (apps/web/lib/server/adult-eligibility.ts:70-143).
- Web: /login/complete shows the age step and the Terms gate; chat layout, /welcome and the LLM gateway re-check Terms and age (apps/web/app/chat/layout.tsx:62-65; apps/web/app/welcome/page.tsx:18-20; app/api/llm/v1/chat/completions/lib/auth-gate.ts:120-137,279-282).
- Device sign-in (CLI, VS Code, Chrome, Desktop browser sign-in): approve and token routes refuse until Terms and age are done (app/api/auth/device/approve/route.ts:164-190; token/route.ts:171-190).
- Mobile: age gate before everything (rootRouting.ts), device record in MMKV key age-gate:v1, region rule from device time zone with Brazil and India rules (ageGate.ts:25-66); Terms store verifies, accepts, handles 409 (apps/mobile/src/features/auth/store/termsAcceptanceStore.ts).

**Incomplete**

- No Terms revision is binding yet: MIN_REQUIRED_TERMS_VERSION and its date are null, so a new Terms version only produces a notice header and an early-accept link; nobody is re-prompted (terms.ts:20-21,108-113).
- Region age rules do not change the threshold: getAgeThreshold uses the larger of the region rule and 18, and Brazil and India are also 18 (ageGate.ts:25-26,69-71).
- CLI and VS Code do not show age or Terms screens; they point to the web. CLI keeps polling after printing the link; VS Code stops with an error (oauth.rs:522-532; deviceAuthorization.ts:120-127; deviceAuth.ts:253-256).
- Chrome has only a refusal message in the cloud client; acceptance happens on the web.

**Present but disconnected or switched off**

- Terms read failures fail open: if acceptance cannot be read the account is let through, logged and counted (terms.ts:148-160). This is deliberate (notice requirement) but means a database outage skips the gate.

**Not available**

- The brief says web and desktop have no age check; the code has one (login/complete/page.tsx:91-104). The brief's age 'missing' status for web and desktop is out of date.
- Guest web chat has its own age step (apps/web/features/chat/guest/GuestAgeStep.tsx); see F003-12.

## 4. Required behaviour

**Established requirements**

- Before first use the user reviews and accepts the current Terms (versioned); acceptance is recorded; a Terms change re-prompts. (source: Brief S3.19)
- Where age limits apply the user must confirm age or eligibility before use; under-age users are blocked or restricted. (source: Brief S3.20)
- An account on an older version keeps working until a material revision's effective date, at least MATERIAL_TERMS_GRACE_DAYS (30) after publication. (source: apps/web/lib/server/terms.ts:12-22)
- Accounts that never accepted are refused until they accept. (source: apps/web/lib/server/terms.ts:90-95)
- Acceptance is stored with its version and surface. (source: apps/web/lib/server/terms.ts:186-205)
- The decision keeps that the person met the minimum, never the age or birth date. (source: packages/contracts/types/src/account-eligibility.ts:41-45)

**Acceptance criteria**

1. A new web account cannot reach /chat or /welcome until age and Terms are done.
2. Accepting with a stale version returns 409 TERMS_VERSION_OUTDATED and the page reloads the current version.
3. An under-18 answer shows the refusal and the account stays refused when a higher age is typed later.
4. After acceptance profiles has the version, time and surface (web-signup, web-login or mobile-auth).
5. On mobile, the age screen appears before onboarding and before Local chat on a fresh install.
6. A CLI sign-in for an account that has not accepted prints the Terms link and finishes after acceptance on the web.
7. A VS Code sign-in in the same state shows a message with the link and does not sign in.
8. When a binding revision's effective date passes, an account on the old version is refused until it accepts (set the two constants in a test).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop gets Terms and age because browser sign-in goes through /login then /login/complete [inferred from apps/desktop/electron/browserSignIn.ts and apps/web/app/auth/desktop/DesktopSignInHandoff.tsx:53].
- Local mode on mobile needs an age confirmation but no Terms, since Terms are tied to the Cloud account [inferred from rootRouting.ts and the login screen].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make VS Code keep polling like the CLI so acceptance on the web finishes the sign-in without restarting.
- [proposed] Remove the stale 'unfinished' note from brief S3.19 and update the brief's web and desktop age status.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | terms.ts | `apps/web/lib/server/terms.ts` | Current version, standing, cache, record acceptance, notice headers. |
| endpoint | POST and GET /api/terms/accept | `apps/web/app/api/terms/accept/route.ts` | Records acceptance after age check; reports standing. |
| screen | Login complete page | `apps/web/app/login/complete/page.tsx` | Orders email, age and Terms steps after sign-in. |
| component | TermsGate | `apps/web/app/signup/TermsGate.tsx` | Agreement checkbox and continue button. |
| component | RecordTermsAcceptance | `apps/web/app/signup/complete/RecordTermsAcceptance.tsx` | Posts acceptance and redirects. |
| component | AgeConfirmationStep | `apps/web/features/auth/AgeConfirmationStep.tsx` | Asks the signed-in account its age and posts evidence. |
| endpoint | /api/eligibility | `apps/web/app/api/eligibility/route.ts` | GET state and POST evidence for adult eligibility. |
| service | adult-eligibility.ts | `apps/web/lib/server/adult-eligibility.ts` | Reads and writes the decision on profiles; cache. |
| hook | requireAdultEligibility / requireCurrentTermsAcceptance | `apps/web/lib/server/require-adult-eligibility.ts` | Page gates that redirect to the review pages. |
| service | decideAdultEligibility | `packages/contracts/types/src/account-eligibility.ts` | Single rule that turns evidence into a verdict on every surface. |
| service | LLM gateway auth gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Refuses chat calls with terms_acceptance_required or the age refusal. |
| endpoint | Device approve and token routes | `apps/web/app/api/auth/device/approve/route.ts` | Block device sign-in until Terms and age are done (token/route.ts too). |
| table | profiles (terms and eligibility columns) | `apps/web/lib/server/terms.ts` | terms_version, terms_accepted_at, terms_accepted_surface, adult_eligibility_* columns. |
| screen | Mobile age gate | `apps/mobile/app/(public)/age-gate.tsx` | First-run age screen. |
| service | Mobile ageGate service | `apps/mobile/src/features/auth/services/ageGate.ts` | Device record, region rule, OS age signal, refusal stickiness. |
| service | Mobile root routing | `apps/mobile/src/features/auth/services/rootRouting.ts` | Sends every route through the age gate first. |
| store | termsAcceptanceStore | `apps/mobile/src/features/auth/store/termsAcceptanceStore.ts` | Verify, recheck, accept Terms with surface mobile-auth. |
| screen | Mobile Cloud sign-in screen | `apps/mobile/app/(auth)/login.tsx` | Terms checkbox, read links, account age check. |
| service | CLI device sign-in | `apps/cli/src/oauth.rs` | Maps terms_acceptance_required to a printed link and keeps polling. |
| service | Shared device authorization client | `packages/client/client-runtime/src/deviceAuthorization.ts` | Turns terms or age refusals into a message for VS Code. |
| service | Chrome cloud client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Maps TERMS_ACCEPTANCE_REQUIRED to a message. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After sign-in the web page checks account access, email confirmation, then reads the adult-eligibility decision from profiles. | our servers | apps/web/app/login/complete/page.tsx:63-104 |
| If undecided, the age step posts declared_age evidence to /api/eligibility; the server judges it with decideAdultEligibility and stores only outcome and minimum age. | our servers | AgeConfirmationStep.tsx:52-70; adult-eligibility.ts:98-143 |
| The Terms gate shows; on submit the page posts surface and version to /api/terms/accept. | device and our servers | apps/web/app/api/terms/accept/route.ts:100-195 |
| Server writes the acceptance and clears its cached standing. | our servers | terms.ts:186-205 |
| Every chat turn and device sign-in later re-reads the standing (cached 5 minutes, refusals never cached). | our servers | terms.ts:115-146; auth-gate.ts:120-137 |
| Mobile checks the typed age against the device rule and stores the verdict locally; it reports evidence to the server when the person signs in to Cloud. | device and our servers | ageGate.ts:99-170; termsAcceptanceStore.ts:87-125 |
| CLI and VS Code poll the device token endpoint; the server answers terms_acceptance_required with a link until accepted on the web. | our servers | apps/web/app/api/auth/device/token/route.ts:171-190; oauth.rs:192-194 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Terms version, acceptance time, surface | public.profiles columns terms_version, terms_accepted_at, terms_accepted_surface | Server is the record; mobile keeps only an in-memory standing | Overwritten on each new acceptance; retention beyond the profile not read. |
| Adult eligibility outcome, minimum age, method, surface, time | public.profiles adult_eligibility_* columns | Server record; web guest check keeps a minimum age in browser local storage under agi.guest-age-checked-minimum | Refusal stands until support reviews it (adult-eligibility.ts:98-103). |
| Device age record {confirmed,isMinor,confirmedAt,regionCode,threshold} | store:mmkv key age-gate:v1 on the phone | Not synced; the typed age is not kept, only the verdict | Removed only by clearAgeGate (ageGate.ts:172). |
| Marketing-email consent (optional, first acceptance only) | Consent ledger (recordConsent) | Server | Ledger; withdrawal respected (route.ts:96-100). |

**Models and providers.** No model or provider is used. The gate decides whether Cloud chat calls are allowed; it does not choose models.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account with a confirmed email for web Terms; mobile age screen needs no account. |
| Permissions | Self-service only: a person accepts for their own account. Support review lifts a refusal (not found in this feature's code). |
| Subscription | none found in the code. Terms and age are required on every plan including Free. |
| Limits and metering | Standing cache 5 minutes and 10,000 entries per server instance (terms.ts:115-116). No usage metering. |
| Feature flags | None for the gate. MIN_REQUIRED_TERMS_VERSION/EFFECTIVE_AT constants decide binding revisions. |
| Model compatibility | Not applicable. |
| Provider restrictions | None for the gate. |
| Local mode | Mobile Local mode needs the age confirmation but no account, no Terms and no payment (rootRouting.ts:36-43; test apps/mobile/__tests__/age-gate-guards-cloud-not-local.test.ts). Desktop Local use outside the hosted app: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Never accepted | Standing 'required: never_accepted'; page shows the Terms gate; API refuses. | terms.ts:93-95 |
| Older version, no binding revision | Standing 'notice'; account continues; notice headers X-AGI-Terms-Notice sent. | terms.ts:108-113,168-176 |
| Binding date passed | Standing 'required: superseded'. | terms.ts:100-108 |
| Terms changed while page open | 409 TERMS_VERSION_OUTDATED with currentVersion. | route.ts:121-132 |
| Sign-up agreement for an old account | Refusal SIGN_UP_AGREEMENT_NOT_APPLICABLE asks the person to review the Terms. | route.ts:152-161 |
| Unconfirmed email | Terms refused with the email-confirmation message. | route.ts:146-150 |
| Age under minimum | 403 with the ineligible code and message; page shows AgeIneligibleNotice. | route.ts:68-85; login/complete/page.tsx:92-97 |
| Terms store cannot reach server | Mobile status 'error' with retry text; recheck keeps the current standing on failure. | termsAcceptanceStore.ts:60-70,113-123 |
| Acceptance unreadable on server | Account let through, logged and counted. | terms.ts:148-160 |
| Offline, cancel, timeout | Web age submit times out after 20 seconds and shows a retry state; other offline handling not handled in the code found. | AgeConfirmationStep.tsx:25,64-72 |
| Refused on mobile | Refusal record is kept on device; a higher typed age does not lift it. | ageGate.ts:130-146 |
| Accessibility | Mobile terms checkbox has role checkbox and state; age input has an accessibility label; web checkbox is a real labelled input. | login.tsx:204-210; age-gate.tsx:209; TermsGate.tsx:66-97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/terms-standing.test.ts`: Standing logic (current, notice, required).
- `apps/web/lib/server/terms-acceptance.test.ts`: Recording acceptance.
- `apps/web/lib/server/require-current-terms.test.ts`: Page gate for current Terms.
- `apps/web/app/api/terms/accept/route.test.ts`: Accept route.
- `apps/web/app/signup/TermsGate.test.tsx`: Terms gate component.
- `apps/web/app/signup/TermsAcceptanceGate.test.tsx`: Gate behaviour at sign-up.
- `apps/web/app/login/complete/page.test.tsx`: Order of steps on the completion page.
- `apps/web/lib/server/adult-eligibility.test.ts`: Eligibility decisions.
- `apps/web/app/api/eligibility/route.test.ts`: Eligibility route.
- `apps/web/__tests__/adult-eligibility-page-gates.test.ts`: Pages that require adult eligibility.
- `apps/web/features/auth/__tests__/AgeConfirmationStep.test.tsx`: Age step.
- `apps/web/db/neon/terms-acceptance-migration.test.ts`: Terms columns migration.
- `apps/mobile/__tests__/age-gate.test.ts`: Mobile age rules.
- `apps/mobile/__tests__/AgeGateContract.test.tsx`: Age gate screen contract.
- `apps/mobile/__tests__/age-gate-guards-cloud-not-local.test.ts`: Age gate sits before onboarding and app, Local included.
- `apps/mobile/__tests__/terms-acceptance-store.test.ts`: Mobile Terms store.
- `apps/mobile/__tests__/terms-notice.test.ts`: Terms notice handling on mobile.

**Test scenarios**

- **New web account**
  1. Sign up with a new email and confirm it.
  2. Answer age 25 and tick the Terms.
  - Expected: profiles has the version and surface; /chat opens.
- **Under-age**
  1. Sign in a new account.
  2. Enter age 16.
  - Expected: Refusal notice; entering 30 afterwards does not unlock it.
- **Terms revision**
  1. In a test build set MIN_REQUIRED_TERMS_VERSION and an effective date in the past.
  2. Sign in with an account on the previous version.
  - Expected: Terms gate appears; with a future date the account continues with the notice header.
- **Mobile first launch**
  1. Install fresh, open the app.
  - Expected: Age screen first; after Continue, onboarding or Local chat with no sign-in.
- **CLI sign-in without acceptance**
  1. Run agi login for an account that never accepted.
  - Expected: Terminal prints 'Accept the updated terms to finish signing in:' and the link, then finishes after acceptance.
- **VS Code sign-in without acceptance**
  1. Start 'Signing in to AGI Cloud' with the same account.
  - Expected: Error message with the Terms link; no token saved.

**Where to look when it fails**

- Log '[terms] acceptance unreadable; letting the account through' and failure metric terms_acceptance_unreadable.
- Log 'Failed to record terms acceptance'.
- API codes TERMS_VERSION_OUTDATED, terms_acceptance_required, TERMS_ACCEPTANCE_REQUIRED, NOTICE_VERSION_OUTDATED.
- public.profiles terms_* and adult_eligibility_* columns.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Desktop: [70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/desktop/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- Chrome: [70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/chrome/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **No binding Terms revision exists, so the re-prompt path is unexercised in production.** Affects: All apps.. Evidence: apps/web/lib/server/terms.ts:20-21 (both null).. Work needed: Set the constants when a material revision is published; test the date flip.
- **Brief says web and desktop have no age check, but the code has one; brief and code disagree.** Affects: Brief accuracy (web, desktop).. Evidence: apps/web/app/login/complete/page.tsx:91-104.. Work needed: Correct the brief status after confirming in a running app.
- **Brief Unfinished note (patch, TERMS_GATE_EXEMPT_SURFACES) no longer matches code: no such symbol found and GET reports the standing.** Affects: Mobile, API.. Evidence: apps/web/app/api/terms/accept/route.ts:198-203; search for TERMS_GATE_EXEMPT_SURFACES found nothing in apps/web.. Work needed: Confirm the patch file is gone or applied and remove the note.
- **VS Code stops sign-in on a Terms refusal instead of waiting like the CLI.** Affects: VS Code.. Evidence: deviceAuthorization.ts:120-127; deviceAuth.ts:253-256.. Work needed: Decide the desired behaviour and align.
- **Region age rules are inert (all 18).** Affects: Mobile.. Evidence: ageGate.ts:25-26,69-71.. Work needed: None unless a lower regional limit is wanted; then the account minimum must change too.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- table:profiles
- store:mmkv
- api:POST /api/terms/accept
- api:POST /api/eligibility
- F003-01
- F003-12

## Unknown

- How a support review lifts an age refusal (route or tool not found).
- Whether Desktop Local use outside the hosted app has any age or Terms step.
- Whether the brief's pending patch file exists in the repo.
- Retention of terms and eligibility rows beyond the profile.
- Whether the web sign-up screen's own age field (useSignupAgeGate) writes the same decision as the post-sign-in step (not opened).
