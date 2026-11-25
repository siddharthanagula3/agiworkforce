---
id: "F003-03"
type: "feature"
title: "Email sign-in by magic link"
aliases: ["Magic link", "Email sign-in link", "Magic-link confirmation", "S3.05"]
area: "3 Authentication and onboarding screens"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S3.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-authentication-and-identity", "F003-01", "F003-02", "file:apps/web/features/auth/IdentityAuthAdapter.tsx", "file:packages/client/client-runtime/src/authErrorTaxonomy.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-03 Email sign-in by magic link

Signing in by clicking an emailed link is not built on any app. People sign in with a typed emailed code, a password, a passkey or a provider instead. Only unused error kinds and copy for expired or spent links exist in the shared error taxonomy.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.05](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s305).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person click a link in an email to sign in with no typing, and see a confirmation. Today it does nothing; no link flow exists.

**Why it exists.** The area brief asks for it as a convenience beside codes and passwords (doc: knowledge-base/data/area-briefs/003-authentication-and-onboarding-screens.md S3.05).

**Who uses it.** No one yet. Intended for anyone who wants password-free sign-in.

**Problems it solves**

- Not applicable today. Intended: avoid typing a code, avoid passwords.

**Use cases**

- Intended: a person types an email, taps the link in the inbox on the same phone and lands signed in.
- Intended: a person on a shared device approves a link sent to their own inbox.

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile, CLI, VS Code or Chrome (doc: area brief S3.05 statuses).

**Before you start**

- Not applicable.

**Screens and controls**

- None. The email step offers a typed emailed code instead (Check your inbox, apps/web/features/auth/AuthCodeStep.tsx:32-35) and Email me a code (apps/web/features/auth/AuthMethodPicker.tsx:17).

**Journey**

1. Today: type email, Continue, type the emailed code (apps/web/features/auth/IdentityAuthAdapter.tsx:326-339).
2. Required by the brief: type email, receive a link, click it, see a confirmation (not built).

**What the person sees and gets**

- Today the person sees the code step. No link confirmation screen exists.

**Settings**

- None found. A search of apps/web, apps/mobile, apps/cli and packages/client found no email_link or emailLink symbol.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The emailed-code first factor works as a substitute on Web and Mobile (apps/web/features/auth/IdentityAuthAdapter.tsx:326-339, 402; apps/mobile/src/features/auth/components/MobileSignIn.tsx:233-251).

**Incomplete**

- Error kinds link_expired and link_already_used and their copy exist in the shared taxonomy but are reached only through vendor codes for codes or state (packages/client/client-runtime/src/authErrorTaxonomy.ts:4-5, 65-66; apps/web/lib/auth/error-taxonomy.copy.ts:33-40).

**Present but disconnected or switched off**

- The link-themed copy (Sign-in links are single use and short lived) is defined but no screen reads it for a link flow [inferred from the absence of any link flow].

**Not available**

- Magic-link sign-in on Web, Desktop, Mobile, CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- The user can sign in by clicking an emailed link and sees a confirmation that the link signed them in. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S3.05)

**Acceptance criteria**

1. Today: confirm that no screen offers a link sign-in on any app.
2. If built: an emailed link signs the person in on the device that opens it, after the same account, Terms and age checks as other sign-in routes.
3. If built: an expired or used link shows the matching message with a Start again action.
4. If built: the Desktop, CLI, VS Code and Chrome apps get the session through their existing handoff.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A link flow would need to pass through /login/complete so account, age and Terms gates still run [inferred from apps/web/app/login/complete/page.tsx:69-119].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide first whether a link adds value over the emailed code; the code step already supports autofill and avoids cross-device link problems.
- [proposed] If built, reuse link_expired and link_already_used copy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | error taxonomy (link kinds) | `packages/client/client-runtime/src/authErrorTaxonomy.ts` | Defines unused link_expired and link_already_used kinds. |
| config | error copy | `apps/web/lib/auth/error-taxonomy.copy.ts` | Message text for link kinds in English and Spanish. |
| hook | sendSignInEmailCode | `apps/web/features/auth/IdentityAuthAdapter.tsx` | Current emailed-code substitute. |
| component | AuthCodeStep | `apps/web/features/auth/AuthCodeStep.tsx` | Code entry screen that stands in for a link. |
| component | AuthMethodPicker | `apps/web/features/auth/AuthMethodPicker.tsx` | Offers Use your password, Email me a code, Use a passkey or security key; no link choice. |
| screen | Mobile code step | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Mobile emailed-code sign-in. |
| test | error taxonomy test | `apps/web/lib/auth/__tests__/error-taxonomy.test.ts` | Tests the link kinds mapping (lines 49-52). |
| config | AuthPhase and AuthStep types | `apps/web/features/auth/authContract.ts` | Step kinds contain no link step. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No link flow exists, so there is no execution path. The nearest path is the emailed code: the page asks the identity service to send a code and verifies it. | outside service | apps/web/features/auth/IdentityAuthAdapter.tsx:326-339, 533-537 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| None created for a link flow. | Not applicable | Not applicable | Not applicable |

**Models and providers.** No model or provider. Not applicable.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable; feature absent. |
| Permissions | Not applicable. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Not applicable; the feature is absent on every app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person expects a link | They get a six-digit code message; no link is offered. | apps/web/features/auth/AuthCodeStep.tsx:32-35; apps/web/features/auth/authContract.ts:95 |
| Vendor reports client_state_invalid | Shown as link_expired copy though no link was involved. | packages/client/client-runtime/src/authErrorTaxonomy.ts:66 |
| Vendor reports verification_already_verified | Shown as link_already_used copy. | packages/client/client-runtime/src/authErrorTaxonomy.ts:65 |
| Offline, retry, cancel | Not handled in the code, because the feature does not exist. | Search for email_link and emailLink across apps/web, apps/mobile, apps/cli and packages/client returned nothing |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/auth/__tests__/error-taxonomy.test.ts`: Only the mapping of vendor codes to the link-named kinds (lines 49-52).

**Test scenarios**

- **Confirm absence on Web**
  1. Open /login.
  2. Type an email with a password-less account.
  3. Look for any link option.
  - Expected: A code step appears; no link option or link confirmation exists.
- **Confirm absence on Mobile**
  1. Open Mobile Cloud sign-in.
  2. Choose Use an email code instead.
  - Expected: A code field appears; no link option.
- **Search the code**
  1. Search apps and packages for email_link, emailLink, magic.
  - Expected: No sign-in link flow found (a repeat of the search done for this page).

**Where to look when it fails**

- Not applicable. If someone reports a link email, check the identity vendor's dashboard settings: unknown.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Magic-link sign-in and its confirmation are not built on any app.** Affects: All six apps. Evidence: Area brief S3.05 statuses; search of code found no link strategy. Work needed: Decide whether to build; if yes, add the strategy to the adapter, a confirmation page, and tests.
- **Link-themed error copy exists with no flow.** Affects: Web, Mobile. Evidence: apps/web/lib/auth/error-taxonomy.copy.ts:33-40. Work needed: Keep for a future flow or relabel for code expiry.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-authentication-and-identity
- F003-01
- F003-02
- file:apps/web/features/auth/IdentityAuthAdapter.tsx
- file:packages/client/client-runtime/src/authErrorTaxonomy.ts

## Unknown

- Whether the identity vendor instance has link sign-in enabled.
- Whether the owner intends to build it (no document read says so beyond the brief row).
- Product decision documents on this item: none found in docs/product or docs/decisions by search.
