---
id: "F002-11"
type: "feature"
title: "Company, legal and cookies"
aliases: ["About page", "/about", "Privacy policy", "/privacy", "Terms of service", "/terms", "Cookie policy", "/cookies", "Accessibility statement", "/accessibility", "Legal footer", "Mobile About", "S2.34", "S2.38", "S2.39"]
area: "2 Public website and acquisition screens"
available_on: ["web", "mobile"]
implementation: {web: "built", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen failing", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.34", "S2.38", "S2.39"]
depends_on: ["surface:web", "surface:mobile", "file:apps/web/lib/legal-constants.ts", "file:apps/web/features/marketing/components/system/nav.ts", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-observability-and-operations", "F002-09", "F002-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-11 Company, legal and cookies

Public web pages that say who built AGI and publish the privacy policy, terms of service, cookie policy and accessibility statement, linked from the footer. The phone app has an About screen with build info and links to the same web legal pages. Language and region selectors are not on the public site.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.34](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s234), [S2.38](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s238), [S2.39](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s239).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | seen failing |
| Desktop | does not apply | does not apply | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** /about gives company and product facts and principles; the four legal pages state the rules and the retention, cookie and accessibility positions the product actually enforces (apps/web/app/about/page.tsx:78; apps/web/app/privacy/page.tsx:1037; apps/web/app/terms/page.tsx:255; apps/web/app/cookies/page.tsx:314; apps/web/app/accessibility/page.tsx:71).

**Why it exists.** Legal duty and trust: visitors and app stores need policies, and the pages state gaps plainly (accessibility GAPS list, privacy survivors table).

**Who uses it.** Visitors, customers, reviewers, app-store reviewers, regulators.

**Problems it solves**

- Where is the company and what is its status
- What data is collected in Local, own key and Cloud
- Which cookies are set and how consent works
- How accessible is the site

**Use cases**

- A reviewer opens /privacy from the footer to check retention.
- A user taps Privacy Policy in mobile About and the web page opens (about.tsx:233).
- A visitor opens /cookies to see the cookie list and the consent choice.
- A reader opens /accessibility to see what is claimed and what is not.

## 2. User experience

**Where to find it**

- Web footer legal row: Privacy choices, Legal, Privacy, Terms, Acceptable use, Cookies, Security, Trust centre, Accessibility, Sitemap (apps/web/features/marketing/components/system/nav.ts:228-239); About in Company column and Resources menu (nav.ts:143, 217).
- Mobile: Settings > About screen: Build Info, legal links Privacy Policy, Terms of Service, Acceptable Use Policy, Open Source Licenses, EU AI Act Transparency, and footer 'AGI Automation LLC · USA' (apps/mobile/app/(app)/about.tsx:217-333); the Settings entry is at apps/mobile/src/features/settings/index.tsx (brief line 623, not opened).
- Language and region selectors: none on the public marketing pages found; a LanguageSelector exists in web settings (apps/web/features/settings/components/LanguageSelector.tsx).
- Desktop, CLI, VS Code, Chrome: none found for this feature.

**Before you start**

- None for web pages. Mobile About opens web pages through an in-app browser helper and needs a network (about.tsx:122-130).

**Screens and controls**

- /about: hero 'Multi-provider, by design.', principles list, founder quote, dated progress timeline from the newest five releases, colophon table (about/page.tsx:78-200).
- Privacy page: 17 contents entries from Definitions to Contact (privacy/page.tsx:50-68) with sticky contents.
- Terms, cookies (five sections: cookies we set, what else is on your device, misconceptions, Do Not Track and Global Privacy Control, your choices) and accessibility pages (cookies/page.tsx:36-42).
- Cookie consent banner component (apps/web/shared/components/CookieConsent.tsx:40) storing choice outside a cookie (cookies/page.tsx text 'Your consent choice is not stored in a cookie').

**Journey**

1. Open a legal page from the footer.
2. Use the sticky contents to jump between sections.
3. Follow links to versions history or privacy requests (/privacy/requests).
4. Mobile: Settings > About > tap a legal link; the web page opens.

**What the person sees and gets**

- Pages show 'Last updated' dates from one table of policy dates (apps/web/lib/legal-constants.ts:73-87).
- Mobile shows an alert 'Could not open the link. Please try again.' on failure (about.tsx:124-128).

**Settings**

- Cookie and analytics consent choice (apps/web/shared/lib/cookie-consent.ts).
- Language is set in web Settings, not here.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- About, privacy, terms, cookies and accessibility pages exist with metadata and content (paths above).
- All four legal pages show their last-updated date from POLICY_LAST_UPDATED (legal-constants.ts:73-87; terms/page.tsx:271; cookies/page.tsx:328).
- The About page states no certifications are held (about/page.tsx:54-55) and pulls surfaces, catalog and release data from shared constants (about/page.tsx:40-62).
- Legal pages are linked in the footer on every marketing page (nav.ts:228-239).
- Mobile About links to privacy, terms, acceptable use (web), opens Open Source Licenses in-app, and a test requires that each web link resolves to a real page and is on the external allowlist (apps/mobile/__tests__/about-links.test.ts).
- Accessibility page lists what is done and the gaps, and says WCAG 2.1 AA is the aim, with no VPAT (accessibility/page.tsx:12-56, 82).

**Incomplete**

- Accessibility claims rest on automated scans of listed routes, not full audits (accessibility/page.tsx:20-24).
- Whether the privacy page text matches each surface's data handling is not verified here.

**Present but disconnected or switched off**

- Region and language selectors are absent from the public pages; the brief marks S2.39 not applicable anywhere. The app does have i18n pricing translations and a settings language selector (apps/web/app/pricing/pricingCorpusCoverage.test.ts:1-20; LanguageSelector.tsx).

**Not available**

- Desktop, CLI, VS Code and Chrome have no About or legal screen found for this feature.

## 4. Required behaviour

**Established requirements**

- An About view gives product and company information. (source: brief S2.34)
- Public privacy, terms, cookies and accessibility pages exist and are linked site-wide. (source: brief S2.38)
- A visitor can choose language and region on the public site: marked not applicable anywhere. (source: brief S2.39)
- Policy dates and version history are public and the legal route set is fixed (canonical routes, aliases redirected). (source: apps/web/app/__tests__/legal-policy-set.test.ts)
- Mobile About must open only real web pages on the external allowlist. (source: apps/mobile/__tests__/about-links.test.ts)

**Acceptance criteria**

1. Footer shows Privacy, Terms, Cookies and Accessibility on every marketing page.
2. Each page shows a last-updated date equal to the policy date table.
3. No page claims a certification the company does not hold.
4. The cookie list covers every storage key the app writes.
5. Mobile About legal links open and do not open a plan-selling homepage.
6. Alias legal routes redirect permanently to canonical routes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Policy text must match code behaviour; tests pin some claims to source (privacy page comment 'Source tests pin these claims to the code') [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the About screen's links to the other apps if store policy needs them.
- [proposed] Show the language setting on the public footer if a localized public site is planned.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AboutPage | `apps/web/app/about/page.tsx` | Company and product facts. |
| screen | PrivacyPage | `apps/web/app/privacy/page.tsx` | Privacy policy. |
| screen | TermsPage | `apps/web/app/terms/page.tsx` | Terms of service. |
| screen | CookiesPage | `apps/web/app/cookies/page.tsx` | Cookie and device storage table. |
| screen | AccessibilityPage | `apps/web/app/accessibility/page.tsx` | Accessibility statement. |
| config | POLICY_LAST_UPDATED and contact constants | `apps/web/lib/legal-constants.ts` | Dates and contact address. |
| config | FOOTER_LEGAL and FOOTER_COLUMNS | `apps/web/features/marketing/components/system/nav.ts` | Footer links. |
| service | policy-archive | `apps/web/lib/legal/policy-archive.ts` | Policy version history used on the changelog and policy pages (imported by ReleaseNotesPage.tsx:5). |
| component | CookieConsent | `apps/web/shared/components/CookieConsent.tsx` | Consent banner. |
| service | cookie-consent | `apps/web/shared/lib/cookie-consent.ts` | Consent storage helper. |
| screen | Mobile AboutScreen | `apps/mobile/app/(app)/about.tsx` | Build info, legal links, support links. |
| test | legal-policy-set test | `apps/web/app/__tests__/legal-policy-set.test.ts` | Canonical routes, aliases, sitemap. |
| test | legal-surface-claims test | `apps/web/app/__tests__/legal-surface-claims.test.ts` | Retention claims tied to scheduled sweeps. |
| test | device-storage-table test | `apps/web/app/cookies/device-storage-table.test.ts` | Cookie page lists every key written. |
| test | mobile about-links test | `apps/mobile/__tests__/about-links.test.ts` | Links resolve and are allowed. |
| component | LanguageSelector | `apps/web/features/settings/components/LanguageSelector.tsx` | Language choice lives in web settings, not the public site. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests a legal or about page; the server returns static React content built from constants. | our servers | apps/web/app/cookies/page.tsx:314; apps/web/lib/legal-constants.ts:73 |
| Visitor's consent choice is read and written in the browser by the consent component. | device | apps/web/shared/components/CookieConsent.tsx:40; apps/web/shared/lib/cookie-consent.ts |
| Mobile About opens a web URL in the in-app web content view. | device | apps/mobile/app/(app)/about.tsx:122-130 |
| The opened page is served from our web servers. | our servers | about.tsx:233-246 URLs on agiworkforce.com |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cookie consent choice | browser storage (not a cookie, per the cookie page) | not documented in the pages opened | stays until the visitor clears it; exact key in shared/lib/cookie-consent.ts, not opened |
| Policy text and dates | source code | deployed with the web app | git history; version archive via policy-archive |

**Models and providers.** No AI model or provider takes part. The privacy page describes how Local, own key and Cloud differ (privacy/page.tsx section '00 · The mode decides the answer').

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None. |
| Permissions | Public. |
| Subscription | None; free to read. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code for these pages. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable to the pages. Mobile About works in Local mode for the legal links; they need a network to open (about.tsx:122-130). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Link cannot open on mobile | Alert 'Could not open the link. Please try again.' | apps/mobile/app/(app)/about.tsx:124-128 |
| No mail app on mobile | A no-mail-app alert hook is used for Email Support. | about.tsx:132-133 |
| Consent cannot be read | Analytics stays off (fails closed). | apps/web/app/cookies/page.tsx:325-327 |
| Alias legal route | Permanent redirect to the canonical route. | apps/web/app/__tests__/legal-policy-set.test.ts |
| Accessibility | Skip link on every page and a known list of gaps. | apps/web/app/accessibility/page.tsx:12-20 |
| Offline | not handled in the code on the web pages. | apps/web/app/privacy/page.tsx, apps/web/app/cookies/page.tsx (searched; no offline handling found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/__tests__/legal-policy-set.test.ts`: Page per canonical policy route, no page for aliases, permanent redirects, sitemap.
- `apps/web/app/__tests__/legal-surface-claims.test.ts`: Retention sweep disclosed and scheduled.
- `apps/web/app/cookies/device-storage-table.test.ts`: Cookie page names every key the app writes.
- `apps/web/app/accessibility/page.test.tsx`: States last-updated date.
- `apps/web/__tests__/privacy-claims.spec.ts`: Privacy claims; contents not opened.
- `apps/mobile/__tests__/about-links.test.ts`: Hardcoded web URLs resolve to real pages and are on the allowlist; licenses open in-app.
- `apps/mobile/__tests__/AboutServiceStatus.test.tsx`: Brand symbol, opens status page and acceptable use policy.
- `apps/web/e2e/legal-open-source.spec.ts`: Open-source legal page; contents not opened.

**Test scenarios**

- **Footer links**
  1. Open any marketing page and read the footer.
  - Expected: Privacy, Terms, Cookies and Accessibility links open the matching pages.
- **Dates match**
  1. Compare each page's 'Last updated' with POLICY_LAST_UPDATED.
  - Expected: Dates are equal.
- **Cookie list completeness**
  1. Run the device-storage test; add a new storage key without listing it.
  - Expected: Test fails.
- **Mobile legal links**
  1. Open Settings > About; tap each legal link.
  - Expected: Each opens its web page or the in-app licenses screen.
- **No selector**
  1. Search the public header and footer for a language or region control.
  - Expected: None found, as the brief states.

**Where to look when it fails**

- Mobile test names in about-links.test.ts show which URL failed.
- Guard tests listed above fail when a claim and its source drift.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)
- Mobile: [70-qa/test-plans/mobile/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/mobile/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Brief says language and region selectors are not applicable anywhere, but language selection exists in web settings and the pricing page is translated; the public site has no selector.** Affects: Non-English visitors (web). Evidence: apps/web/features/settings/components/LanguageSelector.tsx; apps/web/app/pricing/pricingCorpusCoverage.test.ts:1-20. Work needed: Confirm product decision for public-site language choice.
- **Accessibility is a stated aim; keyboard and screen reader audits across the six surfaces are not complete.** Affects: Users with disabilities. Evidence: apps/web/app/accessibility/page.tsx:12-24. Work needed: Complete the audits and publish results.
- **The brief and draft lines for the pages differ by a few lines from current code (terms 255, cookies 314, accessibility 71, privacy 1037, about 78).** Affects: Brief readers. Evidence: grep results above. Work needed: Refresh references.
- **Mobile About has no link to the cookie policy or accessibility statement.** Affects: Mobile users. Evidence: apps/mobile/app/(app)/about.tsx:233-262 lists only privacy, terms, acceptable use, licenses and EU AI Act transparency. Work needed: Decide if needed for app stores.

**Depends on**

- surface:web
- surface:mobile
- file:apps/web/lib/legal-constants.ts
- file:apps/web/features/marketing/components/system/nav.ts
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-observability-and-operations
- F002-09
- F002-10

## Unknown

- What privacy, terms and accessibility sections contain beyond headings and a few quoted rows (long pages, not read in full).
- The cookie consent storage key and sync behaviour.
- What apps/mobile/src/features/settings/index.tsx:623 does (cited by brief, not opened).
- Whether Desktop shows any legal page natively.
