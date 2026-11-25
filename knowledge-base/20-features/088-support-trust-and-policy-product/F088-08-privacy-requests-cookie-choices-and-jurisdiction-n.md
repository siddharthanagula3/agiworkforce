---
id: "F088-08"
type: "feature"
title: "Privacy requests, cookie choices and jurisdiction notices"
aliases: ["Data rights and consent", "/privacy/requests", "Your rights requests", "DPDP rights request", "Cookie preferences", "Cookie banner", "Cookies on this site", "CookieConsent", "India DPDP notice", "EU representative", "Region unavailable (451)", "Privacy-rights request portal (S88.16)", "Cookie preference center (S88.17)", "Jurisdiction notices (S88.27)"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.16", "S88.17", "S88.27"]
depends_on: ["SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "table:data_rights_requests"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-08 Privacy requests, cookie choices and jurisdiction notices

A web page where anyone, signed in or not, files a data request (access, correction, erasure, withdrawal, nomination, grievance) and gets a reference. A cookie banner and preferences dialog control analytics, and the choice is remembered. Static notices cover India and the EU, and a region block refuses unserved places.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.16](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8816), [S88.17](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8817), [S88.27](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8827).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Records data-rights requests in a queue and tells the operator, shows signed-in users their past requests, lets visitors change cookie choices at any time, and publishes notices for India and the EU. (apps/web/app/privacy/requests/page.tsx:67-133; apps/web/app/api/privacy/requests/route.ts:81-165)

**Why it exists.** Data protection law gives people rights over their data that must not depend on having an account, and consent must be as easy to withdraw as to give. The page itself states this. (apps/web/app/privacy/requests/page.tsx:96-101; apps/web/app/privacy/requests/page.tsx:120-127)

**Who uses it.** Any visitor or user; people in India under the DPDP notice; people in the EU; operators who work the queue. (apps/web/app/privacy/requests/page.tsx:60-66; apps/web/app/api/admin/privacy/requests)

**Problems it solves**

- People with no account could not exercise rights.
- Analytics had no consent gate.
- Cookie choices could not be changed later.
- Where we do not serve, people met a bare error.

**Use cases**

- Sign out, open /privacy/requests, choose Erasure, enter email, submit, note the reference. (apps/web/app/privacy/requests/RightsRequestForm.tsx:10-35)
- Click "Change your cookie preferences" on /cookies to turn analytics off. (apps/web/app/cookies/CookiePreferencesButton.tsx:5-9)
- Read /privacy/india for the DPDP notice and grievance contact. (apps/web/app/privacy/india/page.tsx:248)
- Phone: Settings, privacy, "Data rights requests" opens the web page. (apps/mobile/src/features/settings/cloud-privacy/index.tsx:147-151)

## 2. User experience

**Where to find it**

- Web: /privacy/requests, page title "Data rights and consent". (apps/web/app/privacy/requests/page.tsx:33-37)
- Web: cookie banner titled "Cookies on this site", buttons "Necessary only", "Allow analytics", "Customise"; dialog button "Save preferences". (apps/web/shared/components/CookieConsent.tsx:191-308)
- Web: footer button labelled with COOKIE_PREFERENCES_LABEL ("Cookie preferences") and /cookies page button "Change your cookie preferences". (apps/web/shared/lib/cookie-consent.ts:15; apps/web/features/marketing/components/system/MarketingFooter.tsx:71; apps/web/app/cookies/CookiePreferencesButton.tsx:7)
- Web: /privacy/india (title "India: DPDP notice"), /legal/eu-representative (title "EU representative"), /legal index, /supported-countries. (apps/web/app/privacy/india/page.tsx:33; apps/web/app/legal/eu-representative/page.tsx:17-21; apps/web/app/legal/page.tsx:105)
- Desktop: shows the hosted web app; the cookie banner is not shown in the desktop host but the preferences dialog can still open. (apps/web/shared/components/CookieConsent.tsx:70; apps/web/shared/components/__tests__/CookieConsent.test.tsx:138-170)
- Mobile: row "Data rights requests" under helpful resources in cloud privacy; opens the web page in the in-app browser. (apps/mobile/src/features/settings/cloud-privacy/index.tsx:147-151)
- CLI: not available. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)

**Before you start**

- Requests: none; an account is optional. (apps/web/app/api/privacy/requests/route.ts:92)
- Seeing past requests: signed in. (apps/web/app/privacy/requests/YourRightsRequests.tsx:60-64)
- Cookie dialog: none.

**Screens and controls**

- Request form: type dropdown starting "Choose one…" with Access, Correction, Erasure, Withdraw consent, Nomination, Grievance; contact email; details. (apps/web/app/privacy/requests/RightsRequestForm.tsx:10-35; apps/web/app/privacy/requests/RightsRequestForm.tsx:167)
- Page sections: 01 consent recorded against your account, 02 what is already self-serve, 03 make a request, 04 grievance contact. (apps/web/app/privacy/requests/page.tsx:96-141)
- "Your requests" list: reference, type, status (Received, In progress, Resolved, Declined), dates. (apps/web/app/privacy/requests/YourRightsRequests.tsx:14-31)
- Cookie dialog: Necessary switch (always on), Analytics cookies switch, Save preferences. (apps/web/shared/components/CookieConsent.tsx:270-308)

**Journey**

1. Open /privacy/requests.
2. Optionally change consent in section 01.
3. Choose a request type, give an email and details, submit. (apps/web/app/privacy/requests/RightsRequestForm.tsx:149-210)
4. Read the heading "Request recorded, reference <ref>". (apps/web/app/privacy/requests/RightsRequestForm.tsx:125)
5. If signed in, the list refreshes and shows the new request. (apps/web/app/privacy/requests/RightsRequestsPortal.tsx:8-14)
6. Replies for signed-out requests come by email. (apps/web/app/privacy/requests/YourRightsRequests.tsx:108-110)

**What the person sees and gets**

- Reference id and an operatorNotified flag in the response. (apps/web/app/api/privacy/requests/route.ts:144-150)
- If saving the cookie choice fails: "Your cookie choice applies to this page but could not be saved on this device." with "Retry saving". (apps/web/shared/components/CookieConsent.tsx:157-163)
- Region block: a 451 page or JSON with code REGION_UNAVAILABLE. (apps/web/proxy.ts:269-314; apps/web/lib/region-access.ts:11-14)

**Settings**

- Cookie record key cookie-consent in browser storage; notice version derived from the cookie policy date. (apps/web/shared/lib/cookie-consent.ts:9; apps/web/shared/lib/cookie-consent.ts:20)
- Global Privacy Control signal from the browser forces necessary-only. (apps/web/shared/lib/cookie-consent.ts:102-110)
- Mobile: product-analytics consent group in cloud privacy settings. (apps/mobile/src/features/settings/cloud-privacy/ProductAnalyticsConsentGroup.tsx)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/privacy/requests: CSRF check, rate limit, input validation, optional sign-in, row in the queue, operator email, audit event, reference returned. (apps/web/app/api/privacy/requests/route.ts:81-150)
- GET /api/privacy/requests returns the signed-in user's own requests. (apps/web/app/api/privacy/requests/route.ts:155-163)
- Retry with the same submission token does not double-record or double-audit. (apps/web/app/api/privacy/requests/route.ts:131-134; apps/web/app/api/privacy/requests/route.test.ts:125)
- Cookie record holds analytics, notice version and decision time; a record from an older notice reads as undecided and the banner asks again. (apps/web/shared/lib/cookie-consent.ts:78-80; apps/web/shared/lib/cookie-consent.ts:113-119)
- Analytics only runs with explicit consent. (apps/web/shared/lib/cookie-consent.ts:7; apps/web/shared/lib/cookie-consent.ts:248-251)
- Choice is also posted to the consent ledger and a signed-in visitor's earlier decision is reused. (apps/web/shared/lib/cookie-consent.ts:132-150; apps/web/shared/lib/cookie-consent.ts:217-246)
- The consent API rejects a stale notice version with NOTICE_VERSION_OUTDATED. (apps/web/app/api/consent/route.ts:62-75)
- India DPDP and EU representative pages exist and are linked from the legal index. (apps/web/app/privacy/india/page.tsx:33; apps/web/app/legal/page.tsx:105)
- Region block returns status 451 for unserved places, and policy pages stay reachable. (apps/web/proxy.ts:269-314; apps/web/lib/region-access.ts:17-20)
- Mobile row opens the web page. (apps/mobile/src/features/settings/cloud-privacy/index.tsx:147-151)

**Incomplete**

- Nomination is offered in the request form and queue but the India page says there is no nomination field and it is handled manually. (apps/web/app/privacy/requests/RightsRequestForm.tsx:30-31; apps/web/app/privacy/india/page.tsx:248)
- The pages carry data-legal-review="pending-counsel"; India notice is described as not reviewed by Indian counsel. (apps/web/app/privacy/requests/page.tsx:73; apps/web/app/trust/page.tsx:131)
- Regional notices are static pages; the only region-conditional code found is the 451 block. (apps/web/proxy.ts:269-275)

**Present but disconnected or switched off**

- Desktop host hides the banner and records no consent decision, so analytics stays off there. (apps/web/shared/components/CookieConsent.tsx:70; apps/web/shared/components/__tests__/CookieConsent.test.tsx:151-156)

**Not available**

- CLI privacy requests (brief). (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- VS Code and Chrome: n/a per brief.
- A page showing the request status to a signed-out requester: none; they are answered by email. (apps/web/app/privacy/requests/YourRightsRequests.tsx:108-110)
- In-app mobile form: the mobile row links to the web page only. (apps/mobile/src/features/settings/cloud-privacy/index.tsx:147-151)

## 4. Required behaviour

**Established requirements**

- A user can submit access, correction or erasure requests and see their status in a privacy portal. (source: S88.16 brief Should line)
- Users can review and change cookie categories at any time and the choice is honoured. (source: S88.17 brief Should line)
- Where required, users in a jurisdiction see the notices that apply to them (India DPDP, EU representative, region blocks). (source: S88.27 brief Should line)
- Privacy and cookie policy revision dates drive the consent notice version, so a change re-asks once. (source: doc: docs/decisions/2026-09-15-founder-decisions.md (D-2026-09-15-25, lines 266-276))
- Cookie choices are stored under cookie-consent and analytics needs consent. (source: apps/web/shared/lib/cookie-consent.ts:7-9)

**Acceptance criteria**

1. Signed out, submitting an access request returns a reference and a queue row exists with no user id.
2. Signed in, the new request appears in Your requests with status Received.
3. Replaying the same submission token creates no second row.
4. Choosing Necessary only stores analytics false and loads no analytics script.
5. Changing the cookie notice date makes the banner appear again for a returning visitor.
6. A browser sending Global Privacy Control keeps analytics off whatever is stored.
7. A request from an unserved region receives status 451 except on policy pages.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and CLI should reach the same request flow with no new account step. [inferred]
- The nomination wording should agree between form and India page. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a native mobile request form.
- [proposed] Add a CLI command that opens or files a request.
- [proposed] Settle the nomination wording once counsel reviews.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Data rights page | `apps/web/app/privacy/requests/page.tsx` | Page with consent centre, self-serve ledger, request portal and grievance contact. |
| component | RightsRequestForm | `apps/web/app/privacy/requests/RightsRequestForm.tsx` | Request form with type list and retry token. |
| component | YourRightsRequests | `apps/web/app/privacy/requests/YourRightsRequests.tsx` | Signed-in list of own requests. |
| component | ConsentCentre | `apps/web/app/privacy/requests/ConsentCentre.tsx` | Per-purpose consent withdraw and give. |
| endpoint | POST and GET /api/privacy/requests | `apps/web/app/api/privacy/requests/route.ts` | Create and read rights requests. |
| service | data-rights-requests | `apps/web/lib/server/data-rights-requests.ts` | Types, labels, create and read functions. |
| table | data_rights_requests | `apps/web/db/neon/0114_data_rights_requests.sql` | Queue table with status and resolution fields. |
| endpoint | admin privacy requests | `apps/web/app/api/admin/privacy/requests` | Operator listing of the queue. |
| component | CookieConsent | `apps/web/shared/components/CookieConsent.tsx` | Banner and settings dialog. |
| service | cookie-consent library | `apps/web/shared/lib/cookie-consent.ts` | Record, versioning, storage, server ledger post, GPC lock. |
| component | CookiePreferencesTrigger and Button | `apps/web/shared/components/CookiePreferencesTrigger.tsx` | Fires the open event from footer and /cookies. |
| endpoint | /api/consent | `apps/web/app/api/consent/route.ts` | Reads and appends consent ledger rows. |
| screen | India DPDP notice | `apps/web/app/privacy/india/page.tsx` | Itemised notice and rights. |
| screen | EU representative | `apps/web/app/legal/eu-representative/page.tsx` | States no representative is appointed. |
| service | region access | `apps/web/lib/region-access.ts` | Decides block and exempt pages. |
| config | proxy region block | `apps/web/proxy.ts` | Returns 451 page or JSON. |
| screen | mobile cloud privacy | `apps/mobile/src/features/settings/cloud-privacy/index.tsx` | Row that opens the web page. |
| service | account erasure | `apps/web/lib/server/account-erasure.ts` | Erasure carried out on a schedule. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser posts the request with a CSRF token and a submission token. | device | apps/web/app/privacy/requests/RightsRequestForm.test.tsx:42 |
| Server checks CSRF and rate limit, validates the payload, reads the optional signed-in user, writes the row. | our servers | apps/web/app/api/privacy/requests/route.ts:81-110 |
| Server emails operators and appends an audit event; a failed email is logged but the request stays recorded. | our servers | apps/web/app/api/privacy/requests/route.ts:34-79; apps/web/app/api/privacy/requests/route.ts:112-142 |
| The operator email goes through the email provider. | outside service | apps/web/app/api/privacy/requests/route.ts:21-22 (sendSupportEmail) |
| Cookie choice is written to browser storage, then posted to the consent ledger; a failed post leaves the stored record in force. | device and our servers | apps/web/shared/lib/cookie-consent.ts:132-150; apps/web/shared/lib/cookie-consent.ts:204-210 |
| Every page request passes the region check; blocked places get 451. | our servers | apps/web/proxy.ts:316-318 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rights request: reference, type, contact email, details, status, optional user id | Table data_rights_requests (apps/web/db/neon/0114_data_rights_requests.sql:36-60) | Server only | Retention rule unknown; user id column cascades when the profile is deleted (apps/web/db/neon/0114_data_rights_requests.sql:43) |
| Cookie consent record | Browser localStorage key cookie-consent (apps/web/shared/lib/cookie-consent.ts:9) | Decision also appended to the account consent ledger when signed in | Browser: until cleared; ledger: append-only (apps/web/app/privacy/requests/page.tsx:100-102) |
| Audit event privacy_request_submitted | Security audit log (apps/web/app/api/privacy/requests/route.ts:134-142) | Server only | unknown |

**Models and providers.** No model or provider takes part. The email provider only delivers the operator alert. (apps/web/app/api/privacy/requests/route.ts:21-22)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required to file; required to list past requests. (apps/web/app/api/privacy/requests/route.ts:92; apps/web/app/api/privacy/requests/route.ts:155-163) |
| Permissions | A user reads only their own requests; the operator list is an admin route. (apps/web/lib/server/data-rights-requests.ts:63-70; apps/web/app/api/admin/privacy/requests) |
| Subscription | none found in the code. |
| Limits and metering | POST uses the waitlist rate limit bucket; GET uses the default bucket; details capped at MAX_REQUEST_DETAILS_LENGTH (4000). (apps/web/app/api/privacy/requests/route.ts:85; apps/web/lib/server/data-rights-requests.ts:38) |
| Feature flags | Region block is driven by environment configuration read by decideRegionAccess. (apps/web/proxy.ts:271) |
| Model compatibility | not applicable; no model is used. |
| Provider restrictions | none found in the code. |
| Local mode | Web and Desktop cookie and request pages work against our servers only. Mobile row needs the network to open the web page [inferred]. No Local-mode behaviour is defined in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | "Loading your requests" with a spinner. | apps/web/app/privacy/requests/YourRightsRequests.tsx:71-78 |
| Signed out | The list is hidden (401 or 403 maps to signed-out). | apps/web/app/privacy/requests/YourRightsRequests.tsx:60-64 |
| List error | "Your requests could not be loaded. Reload the page to try again." | apps/web/app/privacy/requests/YourRightsRequests.tsx:84-88 |
| Empty list | "You have not made a request from this account." | apps/web/app/privacy/requests/YourRightsRequests.tsx:89-92 |
| Response lost after submit | Form does not claim nothing was stored and retries with the same token. | apps/web/app/privacy/requests/RightsRequestForm.test.tsx:42 |
| Same token, different details | 409 conflict asking the user to reload and submit again. | apps/web/app/api/privacy/requests/route.ts:112-118 |
| Email alert fails | Request stays recorded; operatorNotified is false and an error is logged. | apps/web/app/api/privacy/requests/route.ts:63-78 |
| Storage refused | Choice applies to the page only and a retry control shows. | apps/web/shared/lib/cookie-consent.ts:182-198; apps/web/shared/components/CookieConsent.tsx:157-163 |
| Other tab answers | Banner closes in the undecided tab. | apps/web/shared/components/__tests__/CookieConsent.test.tsx:475 |
| Reduced motion | Banner animation is skipped. | apps/web/shared/components/CookieConsent.tsx:196-198 |
| Offline | Ledger post failure is swallowed and the local record governs; request submission offline: not handled in the code beyond the generic error. | apps/web/shared/lib/cookie-consent.ts:145-149 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/privacy/requests/route.test.ts`: Operator alert, undeliverable alert, throwing alert, no alert when nothing recorded, submission token replay, bad token.
- `apps/web/app/privacy/requests/RightsRequestForm.test.tsx`: Email length boundary, lost response retry.
- `apps/web/lib/server/data-rights-requests.test.ts`: Server request functions.
- `apps/web/shared/components/__tests__/CookieConsent.test.tsx`: Default opt-in, malformed storage, script loading, desktop host, three actions, re-prompt on notice change, cross-tab.
- `apps/web/app/api/consent/__tests__/route.gpc.test.ts`: Global Privacy Control in the consent route.
- `apps/web/app/privacy/requests/ConsentCentre.marketing-email.test.tsx`: Marketing email consent in the centre.
- `apps/web/app/cookies/device-storage-table.test.ts`: Device storage table on /cookies.
- `apps/web/__tests__/proxy-region-block.test.ts`: Region block behaviour.
- `apps/mobile/src/features/settings/__tests__/PrivacyCenter.test.tsx`: Mobile row opens the requests page.

**Test scenarios**

- **Signed-out request**
  1. Sign out
  2. Open /privacy/requests
  3. Choose Access, enter an email
  4. Submit
  - Expected: Reference shown; row without user id; operator email attempted.
- **Signed-in list**
  1. Sign in
  2. Submit a request
  3. Read Your requests
  - Expected: New row with status Received.
- **Cookie withdraw**
  1. Allow analytics
  2. Open Cookie preferences
  3. Switch Analytics cookies off
  4. Save preferences
  - Expected: Stored analytics false; analytics script removed without reload.
- **Notice change**
  1. Decide on the banner
  2. Change the cookie policy date in a test build
  3. Reload
  - Expected: Banner appears again.
- **Mobile entry**
  1. Open mobile Settings, privacy
  2. Tap Data rights requests
  - Expected: In-app browser opens /privacy/requests.
- **Region block**
  1. Send a request with a blocked country header
  2. Request /privacy
  - Expected: 451 on app pages; policy page stays reachable.

**Where to look when it fails**

- Log event data_rights_request_alert_undeliverable and data_rights_request_alert_failed. (apps/web/app/api/privacy/requests/route.ts:63-78)
- Error text "Your request could not be recorded, so nothing was stored". (apps/web/app/api/privacy/requests/route.ts:122-124)
- Response header x-agi-region-block. (apps/web/proxy.ts:291)
- Table data_rights_requests status column.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Nomination is selectable but India page says it is manual and has no field.** Affects: Web, Desktop window, India users. Evidence: apps/web/app/privacy/requests/RightsRequestForm.tsx:30-31; apps/web/app/privacy/india/page.tsx:248. Work needed: Align the page or the form.
- **No CLI route to file a request.** Affects: CLI users. Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md. Work needed: Add a command or documented link.
- **Regional notices are not shown by rule; they are static pages and a block.** Affects: All web users. Evidence: apps/web/proxy.ts:269-275; apps/web/app/legal/page.tsx:105. Work needed: Decide if a conditional notice is needed beyond the block.
- **EU representative is not appointed; the page says the obligation is live and unmet.** Affects: EU users, compliance. Evidence: apps/web/app/legal/eu-representative/page.tsx:53. Work needed: Owner decision to appoint.
- **Legal pages pending counsel review.** Affects: India users. Evidence: apps/web/app/privacy/requests/page.tsx:73. Work needed: Counsel review.
- **Mobile has no native form and Desktop shows no banner, so cookie choices there rely on host handling.** Affects: Mobile, Desktop. Evidence: apps/web/shared/components/CookieConsent.tsx:70. Work needed: Confirm Desktop's own analytics consent path.
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- table:data_rights_requests

## Unknown

- Retention of data_rights_requests rows and audit events.
- Which consent ledger table stores cookie decisions (not opened).
- How Desktop collects analytics consent, since the web banner is suppressed there.
- Whether Mobile has any in-app request status.
- Who works the queue and the response deadlines (the code has a deadlines module that was not read).
