---
id: "F002-08"
type: "feature"
title: "Enterprise and sales contact"
aliases: ["Enterprise page", "/enterprise", "Contact sales", "Talk to sales", "/contact-sales", "Discuss Enterprise access", "Request a follow-up", "Enterprise waitlist", "Partners page", "Partner application", "/partners", "/contact", "/support", "Contact and support", "S2.24", "S2.35", "S2.36", "S2.37"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (2 of 3)", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.24", "S2.35", "S2.36", "S2.37"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "api:GET /api/waitlist/public", "api:POST /api/waitlist/public", "api:POST /api/partners/apply", "table:cloud_managed_waitlist", "table:consent_records", "plan:enterprise", "plan:team", "file:apps/web/features/marketing/components/WaitlistDialog.tsx", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-observability-and-operations", "F002-07", "F002-10"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-08 Enterprise and sales contact

Web pages that let a company reach the team: /enterprise describes the Enterprise offer and sends visitors to /contact-sales (an email page); /contact drafts an email; /support lists channels; a dialog stores an Enterprise follow-up email; /partners emails partner applications. Mobile About has support links. The CLI has no contact entry found.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.24](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s224), [S2.35](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s235), [S2.36](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s236), [S2.37](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s237).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (2 of 3) |
| Desktop | does not apply | does not apply | n/a |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Presents the Enterprise offering and gives several ways to start a conversation: an email address, a mail-draft composer, a stored email request with consent, and a partner application form that emails the team (apps/web/app/enterprise/page.tsx:64-299; apps/web/app/contact-sales/page.tsx; apps/web/app/partners/PartnerApplicationForm.tsx).

**Why it exists.** Enterprise is contract-priced and not self-serve (packages/contracts/types/src/billing-catalog.ts:219-224), and the company states there is no partner program yet but wants to hear from integrators (apps/web/app/partners/page.tsx:68).

**Who uses it.** Company buyers, security reviewers, integration builders, consultancies, and any visitor needing support.

**Problems it solves**

- Buyer needs a sales route for SSO, retention and governance
- Partner or plugin builder needs a way to apply
- Visitor needs honest support channels and response commitments per plan (apps/web/features/marketing/components/pages/company/support-content.ts:13-36)
- Consent for storing an email must be recorded (apps/web/app/api/waitlist/public/route.ts:166)

**Use cases**

- A security lead reads /enterprise, clicks Contact sales and emails the sales inbox with team size and review needs (apps/web/app/contact-sales/page.tsx:43-60).
- A visitor on /desktop clicks 'Discuss Enterprise access', enters an email, ticks consent and presses 'Request a follow-up' (apps/web/app/desktop/page.tsx:53-56; WaitlistDialog.tsx:116, 172).
- A plugin builder fills the partner form and gets a reference like PA-XXXXXXXXXX (apps/web/app/api/partners/apply/route.ts:21-24).
- A logged-in user raises a ticket from Settings > Help rather than email (apps/web/app/support/page.tsx:111).

## 2. User experience

**Where to find it**

- Web: footer Product > Enterprise, Company > Partners, Company > Contact, Resources > Support (apps/web/features/marketing/components/system/nav.ts:165-225).
- Web: 'Contact sales' on /enterprise and on the Team band of /pricing (enterprise/page.tsx:77, 289; pricing/page.tsx:1206).
- Web: 'Discuss Enterprise access' button on /desktop and /mobile hero (desktop/page.tsx:54; mobile/page.tsx:102).
- Web: Apply to partner at /partners#apply (partners/page.tsx:126-137).
- Mobile: About screen > Support section: Help Center, Service Status, Send Feedback, Contact Support (only when signed in and in Cloud mode), Email Support (apps/mobile/app/(app)/about.tsx:115, 275-331).
- CLI: /feedback and /bug commands send feedback to the team (apps/cli/src/claude_parity.rs:194-199; apps/cli/src/cloud/feedback.rs:5); one error message points to agiworkforce.com/support (apps/cli/src/errors.rs:1582). No sales or contact page entry found. The brief cites tui_app.rs:3531, which is status-footer code, not a contact entry.
- Desktop, VS Code, Chrome: none found.

**Before you start**

- None for web pages and the dialog.
- Mobile Contact Support needs sign-in and Cloud mode (about.tsx:115).
- CLI feedback needs the CLI cloud feedback endpoint (apps/cli/src/cloud/feedback.rs:5); sign-in rules not opened.

**Screens and controls**

- /enterprise: hero with 'Contact sales', sections on identity, policy, audit, retention and compliance, an audit-export sample, closing 'Contact sales' (enterprise/page.tsx:64-299).
- /contact-sales: title 'Talk to sales.', 'Email <address>' and 'See what Enterprise includes' buttons, a 'Which door you need' table (contact-sales/page.tsx:43-65).
- /contact: Name, Email, Subject, Message fields; the button opens a prefilled draft in the visitor's mail app (contact/page.tsx:17-40, 79).
- /support: channels, support-by-tier table, buttons 'Email a bug report', 'Raise a ticket', 'Check service status', 'Open the contact page' (support/page.tsx:99-120).
- Enterprise dialog: eyebrow 'Enterprise · contract access', title 'Discuss Enterprise access', Email address, consent checkboxes, submit 'Request a follow-up', close button (WaitlistDialog.tsx:112-176).
- /partners: fields Your name, Work email, Company, Website (optional), 'What do you want to build with us?' select, 'Tell us about it', 'Send application' (PartnerApplicationForm.tsx:99-199).

**Journey**

1. Open /enterprise (or /pricing Enterprise card) and read what is implemented.
2. Press Contact sales; /contact-sales opens with an email link.
3. Email the address with team size, surfaces, review needs and timeline.
4. Or on /desktop or /mobile press 'Discuss Enterprise access', fill email, tick the required consent, press 'Request a follow-up'; the dialog says a person will contact you (WaitlistDialog.tsx:100-110).
5. Or on /partners press 'Apply to partner', fill the form and send; the page shows 'Application sent.' with the reference (PartnerApplicationForm.tsx:82-86).

**What the person sees and gets**

- Dialog success: 'You're on the list.' with a withdrawal link to /privacy/requests (WaitlistDialog.tsx:95-110).
- Dialog errors: 'Enter a valid email address.' or 'Tick the box agreeing to your email being stored before joining.' (WaitlistDialog.tsx:51-60).
- Partner success: reference starting PA- (route.ts:21-24); errors 'Your application was not sent, so nothing reached us. Try again.' and a rate-limit message (PartnerApplicationForm.tsx:16, 67).
- /contact: 'Email draft opened.' status, nothing stored (contact/page.tsx:76-80, 110-120).

**Settings**

- Withdrawal of a stored address: /privacy/requests, no account needed (WaitlistDialog.tsx:105-110).
- Operator: AGI_SUPPORT_FALLBACK_EMAIL, RESEND_API_KEY and AGI_SUPPORT_FROM_EMAIL decide where partner mail goes and whether it can be sent (apps/web/lib/support/handoff/resend-client.ts:324-334; config.ts:87).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- /enterprise exists and its Contact sales buttons go to /contact-sales (enterprise/page.tsx:77, 289).
- /contact-sales is an email-only page (contact-sales/page.tsx:43-100).
- /contact is a mail-draft composer; nothing is sent or stored by the site (contact/page.tsx:30, 79).
- The Enterprise dialog validates the email, requires the Enterprise consent, posts through joinPublicWaitlist with consent surface web-waitlist-modal (WaitlistDialog.tsx:51-71) to /api/waitlist/public, which checks CSRF bound to an anonymous session, a rate limit, consent decisions, honours Global Privacy Control, writes the consent ledger and upserts cloud_managed_waitlist on (email, source) (apps/web/app/api/waitlist/public/route.ts:95-198).
- The partner form exists, posts to /api/partners/apply and the route checks CSRF, rate limit and schema, then emails the team inbox with a reply-to and returns a reference; it stores nothing in the database (apps/web/app/api/partners/apply/route.ts:27-81). The brief's 'web missing' for S2.37 is out of date.
- Partner page states honestly that no partner program exists yet (partners/page.tsx:68).
- Mobile About shows Email Support always and Contact Support when signed in on Cloud (about.tsx:115, 313-331).

**Incomplete**

- The stored Enterprise request is not on the Enterprise sales path: /enterprise and /pricing go to the email page, while the dialog is opened from /desktop and /mobile (apps/web/app/desktop/page.tsx:53; apps/web/app/mobile/page.tsx:101). Whether other pages mount it is unknown beyond SurfaceSections (features/marketing/components/SurfaceSections.tsx:16).
- Partner applications are emailed only; there is no record, status or admin view in the database [inferred from route.ts:27-81].
- Developer 'listing' submissions go through the plugin directory, not the partner form (partners/page.tsx text 'List a plugin in the directory'); not opened further.

**Present but disconnected or switched off**

- If the email provider is not configured the partner route answers that the application could not be sent (route.ts:68-79; resend-client.ts:327-334).

**Not available**

- CLI: no sales, contact or partner page entry found in apps/cli/src.
- Desktop, VS Code, Chrome: nothing found.
- Mobile: no sales or partner form.

## 4. Required behaviour

**Established requirements**

- A public page presents the Enterprise offering with a sales path. (source: brief S2.24)
- A contact or support page lets a visitor reach the company. (source: brief S2.35)
- A form lets a prospect request an Enterprise conversation and the request is stored. (source: brief S2.36)
- Partners and developers can submit a listing or partnership application through a form. (source: brief S2.37)
- Enterprise dialog says a person will contact the visitor about contract-scoped access; consent is required before submit; submit goes through the waitlist client with surface web-waitlist-modal. (source: brief S2.36; apps/web/features/marketing/components/WaitlistDialog.tsx:51-71, 100-110)
- Enterprise capabilities are contract scoped and reached through sales; there is no dedicated capacity. (source: apps/web/app/contact-sales/page.tsx:80-98)

**Acceptance criteria**

1. Every Contact sales button on /enterprise and /pricing opens /contact-sales with a working mailto link.
2. The dialog refuses an invalid email and refuses submit without the required consent, and sends nothing in either case.
3. A valid dialog submit creates one cloud_managed_waitlist row (idempotent per email and source) and a consent record.
4. Partner form with fewer than 20 message characters is refused before any request.
5. A valid partner application returns a PA- reference and an email arrives at the team inbox with reply-to set.
6. /contact never stores the visitor's text.
7. Mobile Contact Support is hidden when signed out or in Local mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The stored Enterprise request should be reachable from the Enterprise page to meet 'the request is stored' for S2.36 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Open the Enterprise dialog from /enterprise and /pricing, or state that email is the only route.
- [proposed] Store partner applications with a status so none is lost if mail fails.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | EnterprisePage | `apps/web/app/enterprise/page.tsx` | Enterprise offer page with Contact sales links. |
| screen | ContactSalesPage | `apps/web/app/contact-sales/page.tsx` | Email-only sales page. |
| screen | ContactPage | `apps/web/app/contact/page.tsx` | Mail-draft composer. |
| screen | SupportPage | `apps/web/app/support/page.tsx` | Channels, support by tier, bug-report guidance. |
| config | SUPPORT_ROWS | `apps/web/features/marketing/components/pages/company/support-content.ts` | Per-plan support commitments table. |
| component | WaitlistDialog | `apps/web/features/marketing/components/WaitlistDialog.tsx` | Enterprise follow-up dialog. |
| component | WaitlistModalProvider and WaitlistTrigger | `apps/web/features/marketing/components/WaitlistModal.tsx` | Opens the dialog lazily; mounted in Providers (apps/web/app/Providers.tsx:24). |
| service | joinPublicWaitlist | `apps/web/lib/services/waitlistServiceClient.ts` | Fetches a token then POSTs with 10 s and 15 s deadlines. |
| endpoint | GET and POST /api/waitlist/public | `apps/web/app/api/waitlist/public/route.ts` | Token mint, consent, store. |
| config | Consent purposes | `apps/web/lib/consent-purposes.ts` | enterprise_waitlist (required) and product_updates (optional) wording. |
| table | cloud_managed_waitlist | `apps/web/db/neon/0011_waitlist.sql` | Stores email, source, optional user id. |
| table | consent_records | `apps/web/db/neon/0113_dpdp_consent_records.sql` | Append-only consent ledger. |
| screen | PartnersPage and PartnerApplicationForm | `apps/web/app/partners/PartnerApplicationForm.tsx` | Partner form and its page (apps/web/app/partners/page.tsx). |
| endpoint | POST /api/partners/apply | `apps/web/app/api/partners/apply/route.ts` | Validates and emails the application. |
| schema | PartnerApplicationRequestSchema | `packages/contracts/cloud-contracts/src/partner-applications.ts` | Fields, kinds (integration, delivery, runtime, other), limits. |
| service | sendSupportEmail | `apps/web/lib/support/handoff/resend-client.ts` | Email delivery used by the partner route. |
| screen | Mobile AboutScreen | `apps/mobile/app/(app)/about.tsx` | Support links and legal links on the phone. |
| command | /feedback and /bug | `apps/cli/src/claude_parity.rs` | CLI feedback command (lines 194-199) posting to /api/feedback (apps/cli/src/cloud/feedback.rs:5). |
| test | Partner and waitlist tests | `apps/web/app/partners/PartnerApplicationForm.test.tsx` | Form behaviour tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Visitor opens a page; Contact sales is an email link; the composer builds a mailto link in the browser. | device | apps/web/app/contact/page.tsx:30; apps/web/app/contact-sales/page.tsx:43-60 |
| Dialog validates email and consent locally. | device | apps/web/features/marketing/components/WaitlistDialog.tsx:51-60 |
| Client fetches an anonymous-session CSRF token, then POSTs email, source and consent. | device and our servers | apps/web/lib/services/waitlistServiceClient.ts:28-60; route.ts:80-93 |
| Server checks CSRF and rate limit, validates consent, records the consent ledger and upserts the waitlist row. | our servers | apps/web/app/api/waitlist/public/route.ts:95-198 |
| Partner form POSTs to /api/partners/apply; server validates and sends an email through the email provider, with idempotencyKey partner-application:<reference> and the signed-in account id (if any) in the email body [apps/web/app/api/partners/apply/route.ts:~58,~96]. | our servers | apps/web/app/api/partners/apply/route.ts:27-66 |
| The email provider delivers the message to the team inbox. | outside service | apps/web/lib/support/handoff/resend-client.ts:324 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Waitlist email, source, optional user id, timestamps | table cloud_managed_waitlist | server only | Not removed by account deletion if given without an account; a person removes it after a /privacy/requests withdrawal (apps/web/app/privacy/page.tsx survivors table; WaitlistDialog.tsx:166-172) |
| Consent decisions (hashed email if anonymous) | table consent_records | server only | Append-only; a withdrawal adds a row (db/neon/0113_dpdp_consent_records.sql:1-20) |
| Partner application text and contact details | Team email inbox (not our database); reference logged | not applicable | unknown (mail retention not in the repository) |
| Mail-composer text | nowhere on the site; the visitor's mail app | no | not stored (contact/page.tsx:79) |

**Models and providers.** No AI model takes part. Email delivery uses the email provider behind sendSupportEmail; its name is not recorded here beyond the RESEND_API_KEY setting name.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None required for any web form. Partner route reads an optional signed-in user id (route.ts:36) and puts the signed-in account id in the email body (apps/web/app/api/partners/apply/route.ts:~96). Mobile Contact Support needs a Clerk sign-in and Cloud mode (about.tsx:115). |
| Permissions | Anonymous access; CSRF token bound to an anonymous session cookie (waitlist route.ts:80-97). |
| Subscription | No entitlement is needed. Enterprise itself is contract-priced (billing-catalog.ts:219-224). Support commitments differ by plan: Team first response within 1 business day, Enterprise a named contact (support-content.ts:22-30); Enterprise also has a 4-business-hour service-down response commitment (support-content.ts:~25-28). |
| Limits and metering | Rate limit bucket 'waitlist' covers the waitlist POST and the partner POST (waitlist route.ts:98; partners route.ts:31); the waitlist token GET uses the 'default' bucket (waitlist route.ts:82). Email max 254 characters; partner message 20 to 3000 characters (partner-applications.ts). |
| Feature flags | Email provider configuration (RESEND_API_KEY, AGI_SUPPORT_FROM_EMAIL, AGI_SUPPORT_FALLBACK_EMAIL). No feature flag found for the dialog. |
| Model compatibility | none found in the code |
| Provider restrictions | Email provider required for partner applications; Global Privacy Control turns optional grants off (waitlist route.ts:119-124). |
| Local mode | Not applicable: these are web pages. Mobile Local mode hides Contact Support but Email Support still shows (about.tsx:313-331). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Dialog submitting | Fields disabled, button reads 'Sending…'; a second submit is ignored. | WaitlistDialog.tsx:45-47, 160-172 |
| Dialog error | Error text in a role=alert region; editing clears it. | WaitlistDialog.tsx:178-188 |
| Dialog timeout or failure | Client returns 'Failed to join waitlist. Please try again.'; deadlines 10 s for the token and 15 s for the post. | waitlistServiceClient.ts:20-24, 76-80 |
| Consent refused | Refusing the required purpose returns CONSENT_REQUIRED (400); omitting the decision returns a validation error listing the purpose. Neither stores anything, since both happen before the ledger or table write. | waitlist route.ts:130-158 |
| Consent ledger or database down | Request refused with an error; nothing stored. | waitlist route.ts:166-197 |
| Partner rate limit | Message about too many applications from this network. | PartnerApplicationForm.tsx:67 |
| Partner mail cannot be delivered | 503 style user-safe message 'Your application could not be sent right now...'; error logged as partner_application_undeliverable. | partners/apply/route.ts:68-79 |
| No mail app on /contact | Error text pointing to the address; whether browsers without a handler show it is not handled in the code. | contact/page.tsx:33-36 |
| Accessibility | Labelled inputs, alert roles and a close label on the dialog. | WaitlistDialog.tsx:14, 129-140; PartnerApplicationForm.tsx |
| Phone view of /support | A phone marker hides plan and tier content. | apps/web/app/support/page.tsx:50-60; apps/web/app/support/__tests__/SupportFromPhone.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/partners/PartnerApplicationForm.test.tsx`: Sends the application and shows the reference; asks for missing fields; keeps the form and explains when not sent.
- `apps/web/app/api/partners/apply/__tests__/route.test.ts`: Sends to the team inbox with reply-to and returns a reference; reports undeliverable; refuses incomplete input.
- `apps/web/features/marketing/components/WaitlistModal.test.tsx`: No automatic modal, opens from a trigger, anonymous signup, close, local email validation, service error.
- `apps/web/__tests__/api/waitlist-public.security.test.ts`: CSRF enforcement, rate limit, anonymous capture.
- `apps/web/__tests__/api/waitlist-public.token-binding.test.ts`: Token bound to the anonymous session for signed-in and signed-out visitors; no caching.
- `apps/web/app/contact-sales/page.test.tsx`: Email links use the canonical mailto; no mail client opened automatically.
- `apps/web/app/support/__tests__/SupportFromPhone.test.tsx`: Phone view shows channels only.

**Test scenarios**

- **Dialog consent gate**
  1. Open /desktop and press 'Discuss Enterprise access'.
  2. Enter a valid email, leave the consent box unticked, press 'Request a follow-up'.
  - Expected: Message 'Tick the box agreeing...', no network post.
- **Dialog stores once**
  1. Submit the same email twice from the same page with consent.
  - Expected: One cloud_managed_waitlist row for that email and source; two consent entries; success message each time.
- **Partner application**
  1. Open /partners#apply, fill all required fields with a message over 20 characters, send.
  - Expected: Reference PA-... shown; mail arrives at the inbox with reply-to equal to the visitor's address.
- **Mail not configured**
  1. Run with RESEND_API_KEY unset and submit the partner form.
  - Expected: User-safe 'could not be sent' message, nothing delivered.
- **Mobile support links**
  1. Open Settings > About on mobile signed out, then signed in on Cloud.
  - Expected: Email Support always; Contact Support only when signed in on Cloud.

**Where to look when it fails**

- Log events partner_application_sent and partner_application_undeliverable (partners/apply/route.ts:71-80).
- Log lines '[waitlist/public] Consent ledger unavailable; refusing signup' and 'DB unreachable; refusing signup' (waitlist/public/route.ts).
- Tables cloud_managed_waitlist and consent_records.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **The Enterprise page and pricing Enterprise card do not open the dialog that stores a request; they point to an email page. The first draft said /enterprise has a 'Talk to sales' button that opens the dialog; code shows 'Contact sales' to /contact-sales.** Affects: Enterprise prospects (web). Evidence: apps/web/app/enterprise/page.tsx:77; apps/web/app/pricing/page.tsx:1224; apps/web/app/desktop/page.tsx:53. Work needed: Decide the canonical sales intake and connect it, or update the brief's 'request is stored'.
- **Brief S2.37 says 'web missing' but the partner form and endpoint exist.** Affects: Brief readers. Evidence: apps/web/app/partners/PartnerApplicationForm.tsx:50; apps/web/app/api/partners/apply/route.ts:82. Work needed: Update the brief status.
- **Partner applications exist only as email; no record or status.** Affects: Partners, operators (web). Evidence: apps/web/app/api/partners/apply/route.ts:27-81. Work needed: Optional table with status, or keep email as the stated design.
- **CLI contact entry is unverified: only /feedback and an error-message link exist; the brief's cited line is status-footer code.** Affects: CLI users. Evidence: apps/cli/src/claude_parity.rs:194; apps/cli/src/tui/tui_app.rs:3531. Work needed: Decide whether the CLI needs a support link in /help and add it.
- **The first draft said the dialog button is 'Join'; code says 'Request a follow-up'.** Affects: Testers. Evidence: apps/web/features/marketing/components/PublicWaitlistForm.tsx:19. Work needed: Use the current label in test plans.
- **No contact or sales entry on Desktop, VS Code or Chrome apps.** Affects: Users of those apps. Evidence: none found in the code. Work needed: Decide scope; the brief marks them n/a.
- Not built on: Mobile, CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- api:GET /api/waitlist/public
- api:POST /api/waitlist/public
- api:POST /api/partners/apply
- table:cloud_managed_waitlist
- table:consent_records
- plan:enterprise
- plan:team
- file:apps/web/features/marketing/components/WaitlistDialog.tsx
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-observability-and-operations
- F002-07
- F002-10

## Unknown

- Which other pages mount the Enterprise dialog.
- How the team reads or follows up the waitlist table (no admin view opened).
- Retention of partner emails.
- Whether the CLI TUI offers any support link besides /feedback.
- What the Desktop app shows for these pages.

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Rate limit bucket 'waitlist' for both waitlist and partner routes (waitlist route.ts:98; partners route.ts:31)" The code shows: POST waitlist and partner apply use 'waitlist', but the waitlist GET token mint uses the 'default' bucket. (apps/web/app/api/waitlist/public/route.ts:82 ('default') vs :98 ('waitlist'); partners/apply/route.ts:31). **Corrected:** The 'waitlist' bucket covers the waitlist POST and the partner POST; the waitlist token GET uses 'default'.
- **Partly wrong (section 8):** "Consent refused: server returns CONSENT_REQUIRED and stores nothing" The code shows: CONSENT_REQUIRED (400) is returned when a decided purpose is refused. A missing decision gives a validation error instead. Both happen before the ledger or table write, so nothing is stored. (apps/web/app/api/waitlist/public/route.ts:130-158). **Corrected:** Refusing the required purpose returns CONSENT_REQUIRED; omitting the decision returns a validation error listing the purpose. Neither stores anything.

**Facts the page missed**

- The waitlist GET token mint uses rate-limit bucket 'default', not 'waitlist' (apps/web/app/api/waitlist/public/route.ts:82).
- Enterprise support has a 4-business-hour service-down response commitment, which section 7 leaves out (apps/web/features/marketing/components/pages/company/support-content.ts:~25-28).
- The partner route sends with idempotencyKey partner-application:<reference> and puts the signed-in account id in the email body (apps/web/app/api/partners/apply/route.ts:~58,~96); section 7 mentions only the optional user id.
