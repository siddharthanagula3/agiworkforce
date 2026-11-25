---
id: "GAPS-AREA-002"
type: "gap-list"
title: "Gaps: Public website and acquisition screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 2. Public website and acquisition screens

58 open gaps that touch this area. Area page: [20-features/002-public-website-and-acquisition-screens](../../20-features/002-public-website-and-acquisition-screens/README.md).

## GAP-AREA002-LW03

**The Enterprise dialog says a person will contact the visitor, but the request is stored in the cloud managed waitlist table with the waitlist sources. No Enterprise-specific store was seen.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-002
- Detail: Area 2. Public website and acquisition screens
- Evidence: apps/web/features/marketing/components/WaitlistDialog.tsx:102-121; apps/web/app/api/waitlist/public/route.ts:182; apps/web/lib/consent-purposes.ts:62-67

## GAP-AREA002-LW04

**Paid checkout needs two flags to agree (browser and server) and a payment key. If they diverge, the button and the API disagree, as the code's own comment warns.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-002
- Detail: Area 2. Public website and acquisition screens
- Evidence: apps/web/features/billing/lib/localized-pricing.ts:20-27; apps/web/app/api/checkout/route.ts:59, 180

## GAP-F002-01-01

**Behaviour for a present but invalid session cookie is not tested or documented**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-01](../../20-features/002-public-website-and-acquisition-screens/F002-01-product-entry-and-sign-in-redirect.md)
- Detail: Affects: Returning users on Web. Work needed: Run the scenario, then add a test and a recovery rule
- Evidence: apps/web/proxy.ts:105-122 decides on presence only

## GAP-F002-01-02

**Header shows signed-out buttons until the cookie is read after mount**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-01](../../20-features/002-public-website-and-acquisition-screens/F002-01-product-entry-and-sign-in-redirect.md)
- Detail: Affects: Signed-in visitors on every public page. Work needed: Decide whether to accept it or pass signed-in state from the server
- Evidence: apps/web/shared/components/layout/Header.tsx:12-19

## GAP-F002-01-03

**No end-to-end test drives the real sign-in and rewrite; only unit tests with a mocked identity layer are found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-01](../../20-features/002-public-website-and-acquisition-screens/F002-01-product-entry-and-sign-in-redirect.md)
- Detail: Affects: Release confidence. Work needed: Human-style run with a seeded account
- Evidence: apps/web/__tests__/proxy-public-route.test.ts uses a mocked clerk state

## GAP-F002-02-01

**Brief marks S2.06-S2.08 missing though the pages exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-02](../../20-features/002-public-website-and-acquisition-screens/F002-02-product-pages-for-the-chat-research-images-video-a.md)
- Detail: Affects: Planning and status reports. Work needed: Update the brief and record a human check
- Evidence: apps/web/app/features/images/page.tsx; video/page.tsx; voice/page.tsx

## GAP-F002-02-02

**Pages have no recorded human review of look and accuracy against the running product**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-02](../../20-features/002-public-website-and-acquisition-screens/F002-02-product-pages-for-the-chat-research-images-video-a.md)
- Detail: Affects: Web visitors. Work needed: Drive the pages and the real chat rows side by side
- Evidence: No file records a run

## GAP-F002-02-03

**Feature pages are not listed in the main nav; reached via /features and the site map page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-02](../../20-features/002-public-website-and-acquisition-screens/F002-02-product-pages-for-the-chat-research-images-video-a.md)
- Detail: Affects: Web visitors. Work needed: Decide whether a nav entry is wanted
- Evidence: grep of apps/web/features/marketing/components/system/nav.ts found no /features/images item

## GAP-F002-02-NOTBUILT

**Product pages for the chat, research, images, video and voice: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F002-02](../../20-features/002-public-website-and-acquisition-screens/F002-02-product-pages-for-the-chat-research-images-video-a.md)
- Requirement items: S2.06, S2.07, S2.08
- Detail: Web: S2.06, S2.07, S2.08

## GAP-F002-03-01

**The working install has no recorded end-to-end run; the brief marks it unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-03](../../20-features/002-public-website-and-acquisition-screens/F002-03-apps-and-install-pages-desktop-mobile-cli-ide-brow.md)
- Detail: Affects: CLI users on Web. Work needed: Run and record an install on macOS and Linux
- Evidence: No file records a run of install.sh against a release

## GAP-F002-03-02

**All app pages say Coming soon; no store links**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-03](../../20-features/002-public-website-and-acquisition-screens/F002-03-apps-and-install-pages-desktop-mobile-cli-ide-brow.md)
- Detail: Affects: Mobile, VS Code and Chrome visitors. Work needed: Add links when each is published
- Evidence: apps/web/lib/surface-status.ts:6-13

## GAP-F002-03-03

**Brief status for S2.09-S2.13 is 'done' but the web pages only describe unpublished apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-03](../../20-features/002-public-website-and-acquisition-screens/F002-03-apps-and-install-pages-desktop-mobile-cli-ide-brow.md)
- Detail: Affects: Status reporting. Work needed: Clarify done means page exists, not app available
- Evidence: apps/web/lib/surface-status.ts:6-13

## GAP-F002-03-PARTLY

**Apps and install pages (desktop, mobile, CLI, IDE, browser): partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F002-03](../../20-features/002-public-website-and-acquisition-screens/F002-03-apps-and-install-pages-desktop-mobile-cli-ide-brow.md)
- Requirement items: S2.11

## GAP-F002-04-01

**No recorded real-download test of an installer through /api/download**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-04](../../20-features/002-public-website-and-acquisition-screens/F002-04-download-center.md)
- Detail: Affects: Mac visitors. Work needed: Human-style run on both Mac types with a published build
- Evidence: Tests mock the release lookup

## GAP-F002-04-02

**System requirements, file size and release date not shown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-04](../../20-features/002-public-website-and-acquisition-screens/F002-04-download-center.md)
- Detail: Affects: Mac visitors. Work needed: Add from the release manifest (publishedAt is already returned)
- Evidence: Not in DownloadSurfaces.tsx or DesktopDownloadAvailability.tsx

## GAP-F002-04-03

**A paused update looks like a generic verification error to the visitor**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-04](../../20-features/002-public-website-and-acquisition-screens/F002-04-download-center.md)
- Detail: Affects: Mac visitors during a hold. Work needed: Show the hold message
- Evidence: apps/web/app/download/use-desktop-release.ts:107-125

## GAP-F002-05-01

**S2.19: /integrations has no per-integration pages; connector detail pages exist elsewhere**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-05](../../20-features/002-public-website-and-acquisition-screens/F002-05-integration-and-plugin-directories.md)
- Detail: Affects: Visitors looking for an integration by name. Work needed: Decide the canonical route and align the brief; link /integrations to the directory (already linked)
- Evidence: apps/web/app/integrations contains only page.tsx; apps/web/app/connectors/mcp-directory/[...id]/page.tsx exists

## GAP-F002-05-02

**No search or filter on /plugins**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-05](../../20-features/002-public-website-and-acquisition-screens/F002-05-integration-and-plugin-directories.md)
- Detail: Affects: Visitors browsing plugins. Work needed: Add query and category filters
- Evidence: apps/web/app/plugins/page.tsx has no search input

## GAP-F002-05-03

**Detail pages missing from the sitemap**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-05](../../20-features/002-public-website-and-acquisition-screens/F002-05-integration-and-plugin-directories.md)
- Detail: Affects: Search discovery. Work needed: Add indexable records and packs
- Evidence: apps/web/app/sitemap.ts:59-64

## GAP-F002-05-04

**Connect is switched off for all connectors**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-05](../../20-features/002-public-website-and-acquisition-screens/F002-05-integration-and-plugin-directories.md)
- Detail: Affects: All visitors on Web. Work needed: Release decision and verification, owned by SYS-connectors-plugins-and-skills
- Evidence: packages/contracts/types/src/connector-release.ts:13

## GAP-F002-05-NOTBUILT

**Integration and plugin directories: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F002-05](../../20-features/002-public-website-and-acquisition-screens/F002-05-integration-and-plugin-directories.md)
- Requirement items: S2.19
- Detail: Web: S2.19

## GAP-F002-06-01

**S2.18 custom-assistant directory has no route or product concept in the web code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-06](../../20-features/002-public-website-and-acquisition-screens/F002-06-skill-template-and-assistant-directories.md)
- Detail: Affects: Web visitors. Work needed: Product decision, then a public route if the concept exists
- Evidence: No matches for custom assistant terms in apps/web app, features, lib, shared; apps/web/app/features/agents/page.tsx is CLI marketing

## GAP-F002-06-02

**Gallery 'templates' are sample artifacts, not starter templates; the page title says 'Artifacts built with AGI'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-06](../../20-features/002-public-website-and-acquisition-screens/F002-06-skill-template-and-assistant-directories.md)
- Detail: Affects: Visitors expecting templates. Work needed: Align requirement wording or build real templates
- Evidence: apps/web/app/gallery/page.tsx:7-11; apps/web/app/gallery/inspiration.ts:1-10

## GAP-F002-06-03

**Skill directory has no search or detail pages**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-06](../../20-features/002-public-website-and-acquisition-screens/F002-06-skill-template-and-assistant-directories.md)
- Detail: Affects: Visitors browsing skills. Work needed: Add only if a use case needs it
- Evidence: apps/web/app/skills/SignedOutSkills.tsx renders a plain ledger

## GAP-F002-06-04

**No evidence that a signed-out visitor can send the prefilled prompt**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-06](../../20-features/002-public-website-and-acquisition-screens/F002-06-skill-template-and-assistant-directories.md)
- Detail: Affects: Signed-out visitors using Build one like it. Work needed: Run the scenario signed out
- Evidence: /chat is exempt from the signed-out redirect (apps/web/proxy.ts:323-328) but sending rules were not reviewed

## GAP-F002-06-NOTBUILT

**Skill, template and assistant directories: not built on Web**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web
- Features: [F002-06](../../20-features/002-public-website-and-acquisition-screens/F002-06-skill-template-and-assistant-directories.md)
- Requirement items: S2.18
- Detail: Web: S2.18

## GAP-F002-07-01

**Brief and draft cite pricing/page.tsx:1355 for usage copy, but the file has 1328 lines; the copy is built at page.tsx:1242 and plan-card-copy.ts:366.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Engineers and testers following the brief (web). Work needed: Update the brief's code references.
- Evidence: apps/web/app/pricing/page.tsx:1242; apps/web/features/billing/lib/plan-card-copy.ts:366

## GAP-F002-07-02

**The first draft said monthly and yearly switching applies to the page; in code only Team has the Annual choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Testers (web). Work needed: Correct the use text and test plans.
- Evidence: apps/web/app/pricing/page.tsx:1051; apps/web/lib/validations/checkout.ts:30-36

## GAP-F002-07-03

**Test title says 'keeps Team sales-assisted until seat and organization provisioning is wired', yet the route and page support per-seat Team checkout. The test posts no seats, so it fails on the seat-required rule, not on a sales hand-off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Test readers (web). Work needed: Rename the test and add a Team case with seats.
- Evidence: apps/web/__tests__/api/checkout.test.ts:180-191; apps/web/lib/validations/checkout.ts:40-46

## GAP-F002-07-04

**Plan copy versus enforcement is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Buyers on all plans (web). Work needed: Trace each table row to its server enforcement call and add an automated comparison.
- Evidence: brief S2.22 and S2.25 'not checked'; cells derive from catalog functions at page.tsx:745-868

## GAP-F002-07-05

**Release-note copy names old plan labels (Pro, Max 5x, Max 20x) while the catalog labels are Premium, Max and Ultra.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Visitors reading /release-notes (web). Work needed: Decide whether history keeps old names, and note the rename.
- Evidence: apps/web/lib/changelog-entries.ts:14; packages/contracts/types/src/billing-catalog.ts:193-205

## GAP-F002-07-06

**Two checkout flags are set by hand and can diverge.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Operators (web). Work needed: Use one source or add a deploy check.
- Evidence: apps/web/features/billing/lib/localized-pricing.ts:20-25

## GAP-F002-07-07

**No paid acquisition for new buyers until the operator opens upgrades; for most visitors the page ends at a waitlist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-07](../../20-features/002-public-website-and-acquisition-screens/F002-07-pricing-plans-and-usage-explanations.md)
- Detail: Affects: Prospective buyers (web). Work needed: Operator decision; no code change.
- Evidence: apps/web/lib/server/billing-waitlist-access.ts:42-54; doc: docs/product/commercial.md

## GAP-F002-08-01

**The Enterprise page and pricing Enterprise card do not open the dialog that stores a request; they point to an email page. The first draft said /enterprise has a 'Talk to sales' button that opens the dialog; code shows 'Contact sales' to /contact-sales.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: Enterprise prospects (web). Work needed: Decide the canonical sales intake and connect it, or update the brief's 'request is stored'.
- Evidence: apps/web/app/enterprise/page.tsx:77; apps/web/app/pricing/page.tsx:1224; apps/web/app/desktop/page.tsx:53

## GAP-F002-08-02

**Brief S2.37 says 'web missing' but the partner form and endpoint exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: Brief readers. Work needed: Update the brief status.
- Evidence: apps/web/app/partners/PartnerApplicationForm.tsx:50; apps/web/app/api/partners/apply/route.ts:82

## GAP-F002-08-03

**Partner applications exist only as email; no record or status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: Partners, operators (web). Work needed: Optional table with status, or keep email as the stated design.
- Evidence: apps/web/app/api/partners/apply/route.ts:27-81

## GAP-F002-08-04

**CLI contact entry is unverified: only /feedback and an error-message link exist; the brief's cited line is status-footer code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: CLI users. Work needed: Decide whether the CLI needs a support link in /help and add it.
- Evidence: apps/cli/src/claude_parity.rs:194; apps/cli/src/tui/tui_app.rs:3531

## GAP-F002-08-05

**The first draft said the dialog button is 'Join'; code says 'Request a follow-up'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: Testers. Work needed: Use the current label in test plans.
- Evidence: apps/web/features/marketing/components/PublicWaitlistForm.tsx:19

## GAP-F002-08-06

**No contact or sales entry on Desktop, VS Code or Chrome apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Detail: Affects: Users of those apps. Work needed: Decide scope; the brief marks them n/a.
- Evidence: none found in the code

## GAP-F002-08-NOTBUILT

**Enterprise and sales contact: not built on Web, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Requirement items: S2.24, S2.35, S2.36, S2.37
- Detail: Web: S2.37; Mobile: S2.24, S2.35, S2.36, S2.37; CLI: S2.24, S2.35, S2.36, S2.37

## GAP-F002-08-PARTLY

**Enterprise and sales contact: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F002-08](../../20-features/002-public-website-and-acquisition-screens/F002-08-enterprise-and-sales-contact.md)
- Requirement items: S2.35

## GAP-F002-09-01

**Release text names old plan labels (Pro, Max 5x, Max 20x) not matching the catalog (Premium, Max, Ultra).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-09](../../20-features/002-public-website-and-acquisition-screens/F002-09-release-notes-and-changelog.md)
- Detail: Affects: Web visitors. Work needed: Editorial decision and correction.
- Evidence: apps/web/lib/changelog-entries.ts:14; packages/contracts/types/src/billing-catalog.ts:193-205

## GAP-F002-09-02

**Web changelog and CLI release feed are separate and hand-synced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-09](../../20-features/002-public-website-and-acquisition-screens/F002-09-release-notes-and-changelog.md)
- Detail: Affects: Maintainers (web, CLI). Work needed: Link or generate one from the other.
- Evidence: apps/web/lib/changelog-entries.ts:8; apps/web/lib/releases/github-cli-releases.ts:153

## GAP-F002-09-03

**The brief cites claude_parity.rs:1481 (tool-run code); the release-notes text is at 1893-1915.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-09](../../20-features/002-public-website-and-acquisition-screens/F002-09-release-notes-and-changelog.md)
- Detail: Affects: Brief readers. Work needed: Fix the reference.
- Evidence: apps/cli/src/claude_parity.rs:1893

## GAP-F002-09-04

**/changelog has no navigation entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-09](../../20-features/002-public-website-and-acquisition-screens/F002-09-release-notes-and-changelog.md)
- Detail: Affects: Visitors (web). Work needed: Optional link or redirect.
- Evidence: apps/web/features/marketing/components/system/nav.ts:141

## GAP-F002-09-05

**No release feed on Desktop, mobile or extensions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-09](../../20-features/002-public-website-and-acquisition-screens/F002-09-release-notes-and-changelog.md)
- Detail: Affects: Users of those apps. Work needed: Decide whether needed.
- Evidence: none found in the code

## GAP-F002-10-01

**Draft says status 'runs live checks' on every request; code reuses a result for 60 seconds.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-10](../../20-features/002-public-website-and-acquisition-screens/F002-10-docs-help-and-service-status.md)
- Detail: Affects: Testers and readers (web). Work needed: Describe it as near-live.
- Evidence: apps/web/lib/server/render-cache.ts:35-37; apps/web/lib/server/health-check.ts:525

## GAP-F002-10-02

**Status does not test a model answer or a chat turn.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-10](../../20-features/002-public-website-and-acquisition-screens/F002-10-docs-help-and-service-status.md)
- Detail: Affects: Users judging availability. Work needed: Optional synthetic turn probe.
- Evidence: apps/web/app/status/page.tsx:56-57

## GAP-F002-10-03

**Brief code line for trust (page.tsx:277) and status (:65) are close to but not equal to current lines (TrustPage at 280, status dynamic at 45).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-10](../../20-features/002-public-website-and-acquisition-screens/F002-10-docs-help-and-service-status.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: apps/web/app/trust/page.tsx:280

## GAP-F002-10-04

**No help or docs entry in Desktop, VS Code or Chrome apps found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-10](../../20-features/002-public-website-and-acquisition-screens/F002-10-docs-help-and-service-status.md)
- Detail: Affects: Users of those apps. Work needed: Decide scope.
- Evidence: none found in the code

## GAP-F002-11-01

**Brief says language and region selectors are not applicable anywhere, but language selection exists in web settings and the pricing page is translated; the public site has no selector.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-11](../../20-features/002-public-website-and-acquisition-screens/F002-11-company-legal-and-cookies.md)
- Detail: Affects: Non-English visitors (web). Work needed: Confirm product decision for public-site language choice.
- Evidence: apps/web/features/settings/components/LanguageSelector.tsx; apps/web/app/pricing/pricingCorpusCoverage.test.ts:1-20

## GAP-F002-11-02

**Accessibility is a stated aim; keyboard and screen reader audits across the six surfaces are not complete.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-11](../../20-features/002-public-website-and-acquisition-screens/F002-11-company-legal-and-cookies.md)
- Detail: Affects: Users with disabilities. Work needed: Complete the audits and publish results.
- Evidence: apps/web/app/accessibility/page.tsx:12-24

## GAP-F002-11-03

**The brief and draft lines for the pages differ by a few lines from current code (terms 255, cookies 314, accessibility 71, privacy 1037, about 78).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-11](../../20-features/002-public-website-and-acquisition-screens/F002-11-company-legal-and-cookies.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: grep results above

## GAP-F002-11-04

**Mobile About has no link to the cookie policy or accessibility statement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-11](../../20-features/002-public-website-and-acquisition-screens/F002-11-company-legal-and-cookies.md)
- Detail: Affects: Mobile users. Work needed: Decide if needed for app stores.
- Evidence: apps/mobile/app/(app)/about.tsx:233-262 lists only privacy, terms, acceptable use, licenses and EU AI Act transparency

## GAP-F002-12-01

**The brief and draft say chat 'or artifact' links; the page serves chat sessions only, and artifact sharing is not shown by this route.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-12](../../20-features/002-public-website-and-acquisition-screens/F002-12-shared-content-previews.md)
- Detail: Affects: Recipients of artifact links (web). Work needed: Trace the artifact public link path and document or connect it.
- Evidence: apps/web/app/share/[token]/page.tsx:28-50 reads shared_sessions only; apps/web/app/api/artifacts/publish exists

## GAP-F002-12-02

**All failures (bad token, expired, revoked, workspace-only, database error) look the same to the visitor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-12](../../20-features/002-public-website-and-acquisition-screens/F002-12-shared-content-previews.md)
- Detail: Affects: Recipients. Work needed: Decide if a database error should differ from not found.
- Evidence: page.tsx:31, 43, 100-107

## GAP-F002-12-03

**Brief cites page.tsx:32 and 91; current lines are 28-50 and 100-122.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-12](../../20-features/002-public-website-and-acquisition-screens/F002-12-shared-content-previews.md)
- Detail: Affects: Brief readers. Work needed: Refresh references.
- Evidence: apps/web/app/share/[token]/page.tsx

## GAP-F002-12-04

**No native mobile or desktop rendering of shared pages found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F002-12](../../20-features/002-public-website-and-acquisition-screens/F002-12-shared-content-previews.md)
- Detail: Affects: Phone and desktop recipients. Work needed: Decide scope.
- Evidence: none found in the code
