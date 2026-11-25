---
id: "F088-10"
type: "feature"
title: "Security, accessibility and policy pages"
aliases: ["Security page", "security.txt", "Coordinated vulnerability disclosure", "Accessibility statement", "Report an accessibility barrier", "Policy archive", "Version history", "Subprocessors", "Trust and compliance status", "Trust portal", "Security vulnerability reporting (S88.22)", "Accessibility feedback (S88.23)", "Policy-version history (S88.24)", "Subprocessor information (S88.25)", "Security and compliance evidence portal (S88.26)"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "partly seen (2 of 5)", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.22", "S88.23", "S88.24", "S88.25", "S88.26"]
depends_on: ["SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "table:support_tickets", "F088-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-10 Security, accessibility and policy pages

Five public web pages: how to report a vulnerability, how to report an accessibility barrier, older policy versions, who processes customer data, and an honest trust page. The trust page says SOC 2, ISO 27001 and a penetration test do not exist. Accessibility feedback in the product is a ticket from Settings, Help.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.22](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8822), [S88.23](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8823), [S88.24](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8824), [S88.25](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8825), [S88.26](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (2 of 5) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Publishes a security disclosure policy and a machine-readable security.txt, an accessibility statement with a ticket path, dated policy versions, a subprocessor list with corrections, and a dated trust page. (apps/web/app/security/page.tsx:48; apps/web/app/.well-known/security.txt/route.ts:6-24; apps/web/app/accessibility/page.tsx:113-121; apps/web/app/trust/page.tsx:36)

**Why it exists.** Researchers need a published route, customers need evidence and honest limits, and people need to see what terms applied to them earlier. The pages say they prefer an admission to a claim. (apps/web/app/security/page.tsx:49; apps/web/app/trust/page.tsx:25-27)

**Who uses it.** Security researchers, enterprise buyers and their reviewers, people using assistive technology, privacy officers. (apps/web/app/subprocessors/page.tsx:260-270)

**Problems it solves**

- No published disclosure route.
- No place to report accessibility barriers.
- Terms changed without a visible history.
- Unclear where data goes.
- Overclaiming compliance.

**Use cases**

- Email the address in security.txt with the security subject. (apps/web/app/.well-known/security.txt/route.ts:16)
- Signed in, open Settings, Help, click "Report an accessibility barrier". (apps/web/features/support/components/SupportTicketsPanel.tsx:585)
- Open /legal/archive/<policy>/<date> to read an older version. (apps/web/app/legal/archive/[policy]/[date]/page.tsx:22)
- Check /subprocessors before signing a data processing addendum.

## 2. User experience

**Where to find it**

- Web and Desktop window: /security (section "Reporting a vulnerability." with id report). (apps/web/app/security/page.tsx:48)
- Web: /.well-known/security.txt. (apps/web/app/.well-known/security.txt/route.ts:12)
- Web: /accessibility (section "Report a barrier."). (apps/web/app/accessibility/page.tsx:113)
- Web: Settings, Help, ticket panel, button "Report an accessibility barrier". (apps/web/features/settings/sections/HelpSection.tsx:14)
- Web: "Previous versions" link on a policy page (only when two or more versions exist); history at /legal/archive/<policy>; archived text at /legal/archive/<policy>/<date>. (apps/web/shared/components/legal/PolicyVersionsLink.tsx:8-11; apps/web/app/legal/archive/[policy]/page.tsx:79)
- Web: /subprocessors, /trust, /legal index. (apps/web/app/subprocessors/page.tsx:34; apps/web/app/trust/page.tsx:36)
- Desktop: shows the hosted web pages; Mobile accessibility feedback, CLI, VS Code and Chrome: missing per brief. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)

**Before you start**

- Pages: none, public.
- In-product accessibility ticket: a signed-in account, since tickets belong to a user. (apps/web/lib/support/tickets/service.ts:158-166)

**Screens and controls**

- Security report ledger rows: Include, In scope, Out of scope, Safe harbour, Response, Reward. (apps/web/app/security/page.tsx:626-663)
- Accessibility buttons: "Report from Settings, Help", "Email <contact>", "Security posture". (apps/web/app/accessibility/page.tsx:121-126)
- Policy archived page shows standing text, "Read the current version", "Previous version, dated <date>". (apps/web/app/legal/archive/[policy]/[date]/page.tsx:60-87)
- Trust page sections: What we hold and what we do not, Control by control dated, Checks you can run yourself, The documents behind the rows, When this page last moved, Go deeper on any of it. (apps/web/app/trust/page.tsx:38-45)

**Journey**

1. Researcher reads /security, emails with security in the subject, may credit by name.
2. User opens Settings, Help, chooses Report an accessibility barrier (subject prefilled as "Accessibility barrier"), sends, follows replies there. (apps/web/features/support/components/SupportTicketsPanel.tsx:65; apps/web/features/support/components/SupportTicketsPanel.tsx:583)
3. Reader opens a policy, clicks Previous versions, picks a date, reads the archived text and the standing sentence.

**What the person sees and gets**

- security.txt fields Contact, Expires, Preferred-Languages, Canonical, Policy, Acknowledgments. (apps/web/app/.well-known/security.txt/route.ts:16-22)
- Archived page standing text such as "This version applied until the version dated <date> replaced it on this site." (apps/web/lib/legal/policy-archive.ts:140-153)
- Trust rows state "Not held" and "As of <date>". (apps/web/app/trust/page.tsx:93-112)

**Settings**

- none found in the code for user settings.
- Page last-updated dates come from POLICY_LAST_UPDATED in legal constants. (apps/web/app/subprocessors/page.tsx:14)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- security.txt is generated per request with Expires 90 days ahead and a Policy link to /security#report. (apps/web/app/.well-known/security.txt/route.ts:6-24)
- Security page documents scope, safe harbour, no paid bounty and what has not been done. (apps/web/app/security/page.tsx:626-665)
- Accessibility page has a report section with a ticket route and an email route. (apps/web/app/accessibility/page.tsx:113-126)
- Settings, Help ticket panel has an accessibility button that prefills the subject. (apps/web/features/support/components/SupportTicketsPanel.tsx:583-585)
- Policy archive pages are static, one per archived version; unknown dates 404. (apps/web/app/legal/archive/[policy]/[date]/page.tsx:22-34)
- Archive build and check scripts exist. (scripts/archive-policy-versions.mjs; scripts/check-policy-versions.mjs)
- Subprocessor page lists recipients, a corrections list, the 30-day objection route and says no emailed notice is promised. (apps/web/app/subprocessors/page.tsx:34; apps/web/app/subprocessors/page.tsx:225; apps/web/app/subprocessors/page.tsx:305)
- A guard reads the model registry so a provider admitted for Cloud traffic must be on the page. (scripts/check-subprocessor-coverage.mjs:14; apps/web/app/trust/page.tsx:118)
- Trust page rows with dates, evidence documents, and a machine-checked next-review date. (apps/web/app/trust/page.tsx:36; apps/web/app/trust/trust-claims-index.test.ts:10)

**Incomplete**

- Trust portal is a static page of statements; it holds no downloadable reports. (apps/web/app/trust/page.tsx:53-91)
- SOC 2, ISO 27001 and a third-party penetration test are not held; owner task. (apps/web/app/trust/page.tsx:93-112; doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- The subprocessor list is a hard-coded array plus prose corrections, not a structured dated change log. (apps/web/app/subprocessors/page.tsx:34; apps/web/app/subprocessors/page.tsx:225)

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Accessibility feedback in mobile, CLI, VS Code and Chrome. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- Downloadable audit evidence: the trust page says none exists. (apps/web/app/trust/page.tsx:85-89)
- Emailed notice of subprocessor changes: explicitly not promised. (apps/web/app/subprocessors/page.tsx:305)

## 4. Required behaviour

**Established requirements**

- Researchers find a published way to report vulnerabilities (policy page and security.txt). (source: S88.22 brief Should line)
- Users can report accessibility barriers through a dedicated accessible channel from the product. (source: S88.23 brief Should line)
- Users can see earlier versions of terms and policies and what changed. (source: S88.24 brief Should line)
- A current list of subprocessors, with a change log, is published. (source: S88.25 brief Should line)
- Customers can review security and compliance evidence in a trust portal; SOC 2, ISO 27001 and a penetration test are an owner task. (source: S88.26 brief Should and Unfinished lines)
- Do not claim what is not held; dated, checkable claims only. (source: apps/web/app/trust/page.tsx:25-27)

**Acceptance criteria**

1. GET /.well-known/security.txt returns text with Contact, an Expires about 90 days ahead and Policy.
2. /security#report lists scope, safe harbour and the no-bounty statement.
3. Settings, Help shows "Report an accessibility barrier" and it opens a form with subject Accessibility barrier.
4. A policy with two or more versions shows Previous versions; an archived date not in the list returns 404.
5. An archived version states whether it applied and links to the current text.
6. /subprocessors names every Cloud-admitted provider (guard passes).
7. /trust has no row claiming SOC 2 or ISO 27001 held.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile and CLI users should have an equivalent accessibility channel. [inferred]
- A trust portal should hold evidence once reports exist. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mobile Help row that opens the barrier ticket.
- [proposed] CLI command linking to the accessibility contact.
- [proposed] Structured dated subprocessor change entries.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Security page | `apps/web/app/security/page.tsx` | Boundaries, controls, reporting policy, gaps. |
| endpoint | security.txt | `apps/web/app/.well-known/security.txt/route.ts` | Generates the file. |
| screen | Accessibility page | `apps/web/app/accessibility/page.tsx` | Statement, gaps and report route. |
| component | SupportTicketsPanel | `apps/web/features/support/components/SupportTicketsPanel.tsx` | Raise a ticket and accessibility ticket buttons. |
| component | HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | Settings, Help host for the panel. |
| service | policy-archive | `apps/web/lib/legal/policy-archive.ts` | Histories, standing text, hrefs. |
| screen | Archive history page | `apps/web/app/legal/archive/[policy]/page.tsx` | Version list. |
| screen | Archive version page | `apps/web/app/legal/archive/[policy]/[date]/page.tsx` | Archived text. |
| component | PolicyVersionsLink | `apps/web/shared/components/legal/PolicyVersionsLink.tsx` | Previous versions link. |
| job | archive-policy-versions | `scripts/archive-policy-versions.mjs` | Builds archived policy text from history. |
| test | check-policy-versions | `scripts/check-policy-versions.mjs` | Guard on policy version records. |
| screen | Subprocessors page | `apps/web/app/subprocessors/page.tsx` | Recipient list and corrections. |
| job | check-subprocessor-coverage | `scripts/check-subprocessor-coverage.mjs` | Guard against missing recipients. |
| screen | Trust page | `apps/web/app/trust/page.tsx` | Compliance rows and evidence. |
| config | legal constants | `apps/web/lib/legal-constants.ts` | Contact, dates, canonical routes. |
| screen | Legal index | `apps/web/app/legal/page.tsx` | Links to all legal pages. |
| config | enterprise security help article | `apps/web/content/support/enterprise-security.md` | Help text on enterprise security. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Visitor opens a static page; the server renders it from constants and bundled text. | our servers | apps/web/app/trust/page.tsx:36-91 |
| security.txt is built on each request with a new expiry date. | our servers | apps/web/app/.well-known/security.txt/route.ts:4-14 |
| Archived policy pages are generated at build for archived versions. | our servers | apps/web/app/legal/archive/[policy]/[date]/page.tsx:24-34 |
| A signed-in user composes the accessibility ticket in Settings, Help; the ticket is stored and staff are emailed. | our servers | apps/web/lib/support/tickets/service.ts:158-178 |
| Staff notification goes through the email provider. | outside service | apps/web/lib/support/tickets/service.ts:109-127 |
| A researcher emails the contact address; no code handles it. | outside service | apps/web/app/.well-known/security.txt/route.ts:16 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Accessibility ticket with subject Accessibility barrier | Table support_tickets (apps/web/features/support/components/SupportTicketsPanel.tsx:65) | Server; user follows replies in Settings, Help | Retention unknown |
| Archived policy text | Repository, built into the web app (apps/web/lib/legal/policy-archive.ts:113) | Part of each deploy | Kept in git; archive is append-only by guard (scripts/check-policy-versions.mjs) |

**Models and providers.** No model is involved. The subprocessor guard reads the model registry so every provider admitted for Cloud traffic appears on the page. (scripts/check-subprocessor-coverage.mjs:14)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for the public pages; signed in for the in-product ticket. (apps/web/features/support/components/SupportTicketsPanel.tsx:65) |
| Permissions | Ticket owner reads own tickets. (apps/web/lib/support/tickets/service.ts) |
| Subscription | none found in the code. |
| Limits and metering | Ticket rate limits support-tickets-write and read exist in the ticket routes (apps/web/app/api/support/tickets/route.ts:43); security.txt cached for one hour. (apps/web/app/.well-known/security.txt/route.ts:35) |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Pages need the web service. Desktop and mobile Local mode: no rule found; the pages are web pages. (apps/web/app/legal/page.tsx:103-130) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown policy date | 404 via notFound and no dynamic params. | apps/web/app/legal/archive/[policy]/[date]/page.tsx:22; apps/web/app/legal/archive/[policy]/[date]/page.tsx:56 |
| Policy with one version | No Previous versions link. | apps/web/shared/components/legal/PolicyVersionsLink.tsx:8 |
| Version never published here | Standing text says it was replaced before publication. | apps/web/lib/legal/policy-archive.ts:147-149 |
| Embedded in the app | Previous versions link is omitted when the page is embedded. | apps/web/shared/components/legal/PolicyVersionsLink.tsx:12 |
| Trust review overdue | The next review date is machine-checked so a test can fail the build. | apps/web/app/trust/page.tsx:34-36 |
| Ticket form errors, retry, offline | Covered by the shared ticket panel, whose details were not read here. unknown | apps/web/features/support/components/SupportTicketsPanel.tsx:60-80 |
| Accessibility | The accessibility statement lists known gaps in a Known gaps section. | apps/web/app/accessibility/page.tsx:100-107 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/accessibility/page.test.tsx`: Last-updated statement on the accessibility page.
- `apps/web/app/subprocessors/page.test.tsx`: Every declared recipient renders, gateway conditions, corrections.
- `apps/web/lib/legal/__tests__/policy-archive.test.ts`: Policy archive logic.
- `apps/web/lib/legal/__tests__/policy-archive-integrity.test.ts`: Archive integrity.
- `apps/web/lib/legal/__tests__/policy-archive-extract.test.ts`: Extraction of archived text.
- `scripts/check-policy-versions.test.mjs`: Policy version guard.
- `scripts/check-subprocessor-coverage.test.mjs`: Subprocessor coverage guard.
- `apps/web/app/trust/trust-claims-index.test.ts`: No row changed after its review date.
- `apps/web/app/trust/posture-claims.test.ts`: Trust rows match code and workflows.
- `apps/web/app/security/__tests__/trust-surface-claims.test.ts`: Security and trust claims.
- `apps/web/app/__tests__/legal-policy-set.test.ts`: Legal policy set, mentions security.txt.
- `apps/web/features/support/components/__tests__/SupportTicketsPanel.test.tsx`: Ticket panel.

**Test scenarios**

- **security.txt**
  1. GET /.well-known/security.txt
  - Expected: 200 text with Contact, Expires about 90 days ahead, Policy.
- **Accessibility ticket**
  1. Sign in
  2. Settings, Help
  3. Click Report an accessibility barrier
  4. Send
  - Expected: Ticket with subject Accessibility barrier appears in the list.
- **Archived policy**
  1. Open a policy with history
  2. Click Previous versions
  3. Open an older date
  - Expected: Archived text, standing sentence, link to current.
- **Unknown archive date**
  1. Open /legal/archive/terms/1999-01-01
  - Expected: 404.
- **Subprocessor coverage**
  1. Run the subprocessor coverage guard
  - Expected: Passes only when every Cloud-admitted provider is on the page.
- **Trust honesty**
  1. Read /trust rows for SOC 2, ISO 27001, penetration test
  - Expected: Each says not held or not performed with a date.

**Where to look when it fails**

- Guard output from scripts/check-subprocessor-coverage.mjs and scripts/check-policy-versions.mjs.
- Trust claims index test failure names the row whose text moved.
- Table support_tickets for accessibility tickets.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **No SOC 2, ISO 27001 or third-party penetration test report; the trust page cannot hold evidence.** Affects: Enterprise buyers on web and Desktop window. Evidence: apps/web/app/trust/page.tsx:93-112. Work needed: Owner commissions the audits, then publishes reports.
- **Subprocessor change log is prose and corrections, not dated structured entries.** Affects: Customers watching changes. Evidence: apps/web/app/subprocessors/page.tsx:225-295. Work needed: Add dated structured entries.
- **No accessibility feedback on mobile, CLI, VS Code, Chrome.** Affects: Those apps. Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md. Work needed: Add an entry point or link out.
- **Accessibility reporting in product needs sign-in.** Affects: Signed-out users. Evidence: apps/web/app/accessibility/page.tsx:115-117. Work needed: Email route exists; consider a signed-out form.
- **No SLA on security reports.** Affects: Researchers. Evidence: apps/web/app/security/page.tsx:645-648. Work needed: Owner decision.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- table:support_tickets
- F088-11

## Unknown

- Whether the policy archive includes every policy that has history (the registry was not fully read).
- Mobile, CLI, VS Code and Chrome accessibility feedback: taken from the brief, not searched.
- How Desktop shows the Previous versions link when embedded.
- Ticket panel behaviour on errors and offline.
- Retention of accessibility tickets.
