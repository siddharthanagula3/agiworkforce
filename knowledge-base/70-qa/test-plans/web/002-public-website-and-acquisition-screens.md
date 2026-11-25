---
id: "PLAN-web-002"
type: "test-plan"
title: "Web · 2. Public website and acquisition screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "2"
---
# Web · 2. Public website and acquisition screens

33 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S2.01 Product homepage.

- **Expected:** A visitor to / sees a product homepage with sign-in / try / download CTAs; a signed-in visitor lands in the product without error.
- **Code:** done. Evidence present: apps/web/app/BrowserIdentityBoundary.tsx:12; apps/web/lib/identity/browser-provider-routes.ts:44
- **Earlier check in the running app:** FAIL: E085 [FAIL; direct navigation]: Navigating / while signed in renders Something Went Wrong. Console reports Clerk useAuth outside ClerkProvider in TelemetryConsentSync. /chat works separately. Logged-out homepage not tested.
- **Where to find it:** Site address / (signed out, private window) (labels found in the code)
- **Needs:** none for the signed-out check; a Free account for the signed-in check
- **Steps:**
  1. Open the site root address in a private browser window, signed out.
  2. Look at the first screen for the 'Try chat' button and the Desktop call to action beside it.
  3. Compare with Expected: sign-in, try and download calls to action are visible on the homepage.

## S2.02 General assistant product page.

- **Expected:** A public page presents the general chat assistant (AGI Web / AI chat) with what it does and a way to start.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:48; apps/web/app/web/page.tsx:76; apps/web/app/features/ai-chat/page.tsx:73
- **Earlier check in the running app:** PASS: E079 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > Chat (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Chat.
  3. Read the page headline and the paragraph about chatting with eligible models.
  4. Compare with Expected: the page explains the chat assistant and has a 'Try chat' button to start.

## S2.03 Research product page.

- **Expected:** A public page presents deep research (cited reports) and how to use it.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:198; apps/web/app/features/deep-research/page.tsx:43
- **Earlier check in the running app:** PASS: E086 [PASS; public page render only]: Public page rendered; forms not submitted and advertised runtime capabilities not inferred.
- **Where to find it:** Footer > Capabilities > Deep research (labels found in the code)
- **Steps:**
  1. Scroll to the footer and find the Capabilities column.
  2. Click Deep research.
  3. Look for the section 'Review and edit before you start' and the cited-report explanation.
  4. Compare with Expected: the page explains deep research with cited reports and how to use it.

## S2.04 Agentic work product page.

- **Expected:** A public page presents agentic work (AGI Work) and a way to start; signed-in visitors reach the product without error.
- **Code:** done. Evidence present: apps/web/app/BrowserIdentityBoundary.tsx:12; apps/web/lib/identity/browser-provider-routes.ts:44; apps/web/app/chat/page.tsx:11; apps/web/proxy.ts:128
- **Earlier check in the running app:** PASS: E087 [PASS; public page render only]: Public page rendered; forms not submitted and advertised runtime capabilities not inferred.
- **Where to find it:** Products > Work (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Work.
  3. Read the menu description 'A goal in, a plan first, approvals on sensitive steps' and the page that opens.
  4. Compare with Expected: the page presents agentic work and has a way to start.

## S2.05 Coding-agent product page.

- **Expected:** A public page presents the coding agent (AGI Code: CLI + VS Code) and how to get it.
- **Code:** done. Evidence present: apps/web/app/BrowserIdentityBoundary.tsx:12; apps/web/lib/identity/browser-provider-routes.ts:44; apps/web/proxy.ts:132
- **Where to find it:** Products > Code (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Code.
  3. Read the menu description 'One coding agent across the CLI and VS Code' and the page that opens.
  4. Compare with Expected: the page presents the coding agent and how to get it.

## S2.09 Desktop application page.

- **Expected:** A public page describes the desktop app truthfully (what it does, availability, download).
- **Code:** done. Evidence moved: apps/web/app/desktop/page.tsx:64 (quoted code not found in the file now); apps/web/app/desktop/page.tsx:141; apps/web/features/marketing/components/system/nav.ts:55
- **Earlier check in the running app:** PASS: E080 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > Desktop (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Desktop.
  3. Read the page on what the desktop app does and which platforms it covers.
  4. Compare with Expected: the page describes the desktop app truthfully, including availability and download.

## S2.10 Mobile application page.

- **Expected:** A public page describes the mobile app and its availability.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:73; apps/web/app/mobile/page.tsx:82
- **Earlier check in the running app:** PASS: E081 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > Mobile (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Mobile.
  3. Read the page on the mobile app and its availability.
  4. Compare with Expected: the page describes the mobile app and its availability.

## S2.11 CLI installation page.

- **Expected:** A public page tells a visitor how to install the CLI and offers a working install.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Earlier check in the running app:** PASS: E082 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > CLI (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click CLI.
  3. Find the install section and the install command, if the page shows one.
  4. Compare with Expected: the page tells a visitor how to install the CLI and offers a working install.

## S2.12 IDE extension page.

- **Expected:** A public page describes the IDE extension and its availability.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:68; apps/web/app/vscode-extension/page.tsx:25
- **Earlier check in the running app:** PASS: E083 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > Code for VS Code (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Code for VS Code.
  3. Read the page describing the extension and its availability.
  4. Compare with Expected: the page describes the IDE extension and where it is available.

## S2.13 Browser extension page.

- **Expected:** A public page describes the browser extension and its availability.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:63; apps/web/app/chrome-extension/page.tsx:115
- **Earlier check in the running app:** PASS: E084 [PASS; public product page only]: Public page renders; this does not verify native app availability or execution.
- **Where to find it:** Products > Extension (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Extension.
  3. Read the page describing the browser extension and its availability.
  4. Compare with Expected: the page describes the browser extension and its availability.

## S2.14 Integration directory.

- **Expected:** A logged-out visitor can browse and search a directory of available integrations.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:137; apps/web/app/connectors/mcp-directory/page.tsx:119
- **Where to find it:** Resources > MCP directory (labels found in the code)
- **Steps:**
  1. Click the Resources menu in the header.
  2. Click MCP directory.
  3. Type a server name in the search box and read the results.
  4. Open one listing and read its publisher and listed tools.
  5. Compare with Expected: the logged-out visitor can browse and search the integration directory.

## S2.15 Plugin marketplace.

- **Expected:** A logged-out visitor can browse the plugin catalogue read from the live registry, with a path to install.
- **Code:** done. Evidence present: apps/web/app/sitemap-page/page.tsx:37; apps/web/app/plugins/page.tsx:39; apps/web/features/plugins/server/registry-source.ts:35
- **Where to find it:** Sitemap > Product > Plugins (labels found in the code)
- **Steps:**
  1. Scroll to the bottom of the page and click Sitemap.
  2. Under Product, click Plugins.
  3. Browse the plugin catalogue and click one plugin name.
  4. Compare with Expected: a logged-out visitor can browse the catalogue with a path to install.

## S2.16 Skill directory.

- **Expected:** A logged-out visitor can browse a public directory of skills.
- **Code:** done. Evidence present: apps/web/app/skills/page.tsx:31; apps/web/app/skills/SignedOutSkills.tsx:43
- **Earlier check in the running app:** PARTIAL: E088 [PARTIAL; signed-in redirect]: /skills opens chat Settings > Skills for signed-in user. Public logged-out directory not tested.
- **Where to find it:** Resources > Skills (labels found in the code)
- **Steps:**
  1. Click the Resources menu in the header or scroll to the footer Resources column.
  2. Click Skills.
  3. Look for the heading 'Skills live in your workspace' and the skill list.
  4. Compare with Expected: a logged-out visitor sees a public skill directory.

## S2.17 Template gallery.

- **Expected:** A public gallery offers curated starting templates a visitor can preview and launch into chat.
- **Code:** done. Evidence moved: apps/web/app/sitemap-page/page.tsx:40; apps/web/app/gallery/GalleryClient.tsx:31 (quoted code not found in the file now); apps/web/app/gallery/GalleryClient.tsx:1245 (quoted code not found in the file now)
- **Where to find it:** Sitemap > Product > Gallery (labels found in the code)
- **Steps:**
  1. Scroll to the bottom of the page and click Sitemap.
  2. Under Product, click Gallery.
  3. Look at the template cards and the 'Start from scratch' option.
  4. Compare with Expected: the gallery offers curated templates that can be previewed and launched into chat.

## S2.20 Individual plugin detail pages.

- **Expected:** Each plugin has a public detail page with description, permissions, install info and release history.
- **Code:** done. Evidence present: apps/web/app/plugins/page.tsx:147; apps/web/app/plugins/[id]/page.tsx:75; apps/web/lib/services/plugin-lifecycle.ts:102; apps/web/features/plugins/server/registry-source.ts:119
- **Where to find it:** Sitemap > Product > Plugins, then click a plugin name (labels found in the code)
- **Steps:**
  1. Scroll to the bottom of the page and click Sitemap.
  2. Under Product, click Plugins, then click any plugin name.
  3. On its page read the Version line, the Install section and the Releases section.
  4. Compare with Expected: description, install info and release history are shown.

## S2.21 Individual template preview pages.

- **Expected:** Each template has its own previewable page (addressable URL).
- **Code:** done. Evidence present: apps/web/app/gallery/[templateId]/page.tsx:60; apps/web/app/gallery/[templateId]/page.tsx:55; apps/web/app/gallery/GalleryClient.tsx:919
- **Where to find it:** Sitemap > Product > Gallery, then click a template (labels found in the code)
- **Steps:**
  1. Scroll to the bottom of the page and click Sitemap.
  2. Under Product, click Gallery, then click any template card.
  3. Check that the page address shows /gallery/ followed by the template name.
  4. Compare with Expected: each template has its own previewable page at its own address.

## S2.22 Consumer pricing page.

- **Expected:** A public pricing page lists individual plans with prices and lets a visitor buy one; its plan copy matches enforcement.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:141 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:249 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:882 (quoted code not found in the file now); apps/web/app/api/checkout/route.ts:300
- **Earlier check in the running app:** PASS: E068 [PASS; destination render]: Linked public page rendered. No purchases, software installs, or support messages submitted.
- **Where to find it:** Footer > Product > Pricing (labels found in the code)
- **Needs:** none to view; a Free account to reach the checkout step
- **Steps:**
  1. Scroll to the footer and find the Product column.
  2. Click Pricing.
  3. Read the individual plan cards, their prices and the plan names.
  4. Click a paid plan's button and stop at the checkout or sign-in step. Do not complete a purchase.
  5. Compare with Expected: individual plans and prices are listed, and a plan can be chosen.

## S2.23 Team pricing page.

- **Expected:** A public page shows Team per-seat pricing and lets a buyer choose seats and purchase.
- **Code:** done. Evidence present: apps/web/app/pricing/page.tsx:1119; apps/web/app/pricing/page.tsx:1177; apps/web/app/pricing/page.tsx:688
- **Earlier check in the running app:** PARTIAL: E089 [PARTIAL; Teams landing page opens; full team pricing flow not verified]: Page rendered, forms not submitted.
- **Where to find it:** Solutions > Teams (labels found in the code)
- **Needs:** none to view; a Free account to reach the checkout step
- **Steps:**
  1. Click the Solutions menu in the header.
  2. Click Teams.
  3. Click the button that starts at the minimum seat count, which opens the Team pricing section.
  4. Choose a seat count and read the per-seat price.
  5. Compare with Expected: per-seat pricing is shown, and the buyer can choose seats. Stop before paying.

## S2.24 Enterprise product page.

- **Expected:** A public page presents the Enterprise offering with a sales path.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:101; apps/web/app/enterprise/page.tsx:64
- **Earlier check in the running app:** PASS: E090 [PASS; public page render only]: Page rendered, forms not submitted.
- **Where to find it:** Solutions > Enterprise (labels found in the code)
- **Steps:**
  1. Click the Solutions menu in the header.
  2. Click Enterprise.
  3. Look for the 'Start the evaluation' section and its contact or sales button.
  4. Compare with Expected: the Enterprise offering is presented with a sales path. Do not submit the form.

## S2.25 Plan-comparison table.

- **Expected:** A plan-comparison table lists plans against features, and each cell matches enforcement.
- **Code:** done. Evidence moved: packages/contracts/types/src/billing-catalog.ts:249 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:259 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:141 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:149 (quoted code not found in the file now)
- **Where to find it:** Footer > Product > Pricing, then scroll to Compare plans (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Pricing under Product.
  2. Scroll to the 'Compare plans' section.
  3. Read the rows and the plan columns.
  4. Compare each cell with Expected: the cell should match what the plan allows.

## S2.26 Usage and credit explanations.

- **Expected:** Public pages explain how managed usage, allowances and credits work.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1242; packages/ui/i18n/locales/en/pricing.json:205 (quoted code not found in the file now); apps/web/content/support/usage-and-credits.md:2; apps/web/app/help/[slug]/page.tsx:38 (quoted code not found in the file now)
- **Where to find it:** Footer > Resources > Help, then open 'Usage limits, credits and top-ups' (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Help under Resources.
  2. Open the article 'Usage limits, credits and top-ups'.
  3. Read how usage is measured and what happens when an allowance runs out.
  4. Also open Pricing and read the sentence 'Weekly and monthly usage allowances apply.'
  5. Compare with Expected: public pages explain managed usage, allowances and credits.

## S2.27 Download center with platform selection.

- **Expected:** A download page offers installers per platform/architecture, reporting what is actually published.
- **Code:** done. Evidence moved: apps/web/features/marketing/components/system/nav.ts:49 (quoted code not found in the file now); apps/web/app/download/DesktopDownloadAvailability.tsx:57; apps/web/app/download/DesktopDownloadAvailability.tsx:138 (quoted code not found in the file now); apps/web/app/download/page.tsx:119 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E069 [PASS; destination render]: Linked public page rendered. No purchases, software installs, or support messages submitted.
- **Where to find it:** Products > Downloads (labels found in the code)
- **Steps:**
  1. Click the Products menu in the header.
  2. Click Downloads.
  3. Read the Mac download buttons and the platform notes.
  4. Compare with Expected: installers are offered per platform and architecture, and only what is published is shown.

## S2.28 Changelog and release notes.

- **Expected:** A public changelog lists dated releases.
- **Code:** done. Evidence moved: apps/web/features/marketing/components/system/nav.ts:137 (quoted code not found in the file now); apps/web/app/changelog/page.tsx:7; apps/web/app/release-notes/ReleaseNotesPage.tsx:6 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E075 [PASS; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Resources > Release notes (labels found in the code)
- **Steps:**
  1. Click the Resources menu in the header.
  2. Click Release notes.
  3. Look for the heading 'Releases, newest first.' and the dated release rows.
  4. Compare with Expected: a public changelog lists dated releases.

## S2.29 Product announcement pages.

- **Expected:** Individual product announcements have their own public pages.
- **Code:** done. Evidence moved: apps/web/app/release-notes/[slug]/page.tsx:57; apps/web/app/release-notes/ReleaseNotesPage.tsx:52 (quoted code not found in the file now)
- **Where to find it:** Resources > Release notes, then click a release (labels found in the code)
- **Steps:**
  1. Click the Resources menu in the header, then Release notes.
  2. Click the title of any release.
  3. Check that the page shows that release and a button named 'All release notes'.
  4. Compare with Expected: each announcement has its own public page.

## S2.30 Documentation portal.

- **Expected:** A public documentation portal indexes guides and API docs.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:129; apps/web/app/docs/page.tsx:148
- **Earlier check in the running app:** PASS: E074 [PASS; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Resources > Documentation (labels found in the code)
- **Steps:**
  1. Click the Resources menu in the header.
  2. Click Documentation.
  3. Read the guide index and look for the API docs link.
  4. Compare with Expected: the documentation portal indexes guides and API docs.

## S2.31 Help center.

- **Expected:** A public help centre offers searchable articles.
- **Code:** done. Evidence moved: apps/web/features/marketing/components/system/nav.ts:206; apps/web/app/help/page.tsx:63; apps/web/app/help/[slug]/page.tsx:36 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E071 [PASS; destination render]: Linked public page rendered. No purchases, software installs, or support messages submitted. | E073 [PASS; search result navigation]: Temporary chats help article rendered at result URL; initial click snapshot was premature and replaced with settled evidence.
- **Where to find it:** Footer > Resources > Help, then type in "Search help articles" (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click "Help" under Resources (logged out or signed in).
  2. Click the box labelled "Search help articles" and type a word such as "temporary".
  3. Wait for the results list and click one result.
  4. Check that the article opens at its own address and shows readable article text, compared with Expected (searchable articles).

## S2.32 Service-status page.

- **Expected:** A public service-status page shows current health from live checks.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:142; apps/web/app/status/page.tsx:92
- **Earlier check in the running app:** PASS: E070 [PASS; destination render]: Linked public page rendered. No purchases, software installs, or support messages submitted.
- **Where to find it:** Resources > Status (header menu) or Footer > Resources > Status (labels found in the code)
- **Steps:**
  1. Open the "Resources" menu in the header, or scroll to the footer.
  2. Click "Status".
  3. Read the status heading and the list of checks, with the time each check ran.
  4. Compare with Expected (current health from live checks). The page says model inference and a chat turn are not tested.

## S2.33 Trust and security center.

- **Expected:** A public trust and security centre explains security posture and data handling.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:150; apps/web/app/trust/page.tsx:280
- **Earlier check in the running app:** PASS: E063 [PASS; page and content render only]: Linked page opens with readable content; backend enforcement or form submission not tested.
- **Where to find it:** Resources > Trust centre (header menu) or Footer > Legal > Trust centre (labels found in the code)
- **Steps:**
  1. Open the "Resources" menu in the header and click "Trust centre".
  2. Read the page heading "Claims with dates, and the ones we cannot make."
  3. Scroll to the rows and the "Check the live health signal" item, which links to /status.
  4. Compare with Expected (security posture and data handling are explained).

## S2.34 About and company information.

- **Expected:** An About view gives product and company information.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:143; apps/web/app/about/page.tsx:78
- **Earlier check in the running app:** PASS: E078 [PASS; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Resources > About (header menu) or Footer > Company > About (labels found in the code)
- **Steps:**
  1. Open the "Resources" menu in the header and click "About".
  2. Read the heading "Multi-provider, by design."
  3. Scroll to the company description that starts "AGI is built by".
  4. Compare with Expected (product and company information is shown).

## S2.35 Contact and support page.

- **Expected:** A contact / support page lets a visitor reach the company.
- **Code:** done. Evidence moved: apps/web/features/marketing/components/system/nav.ts:152; apps/web/app/contact/page.tsx:17 (quoted code not found in the file now); apps/web/app/support/page.tsx:30 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E077 [PASS; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Resources > Contact (header menu) or Footer > Company > Contact (labels found in the code)
- **Steps:**
  1. Open the "Resources" menu in the header and click "Contact".
  2. Read the heading "One inbox, one human." and the email address shown on the page.
  3. Scroll to "Draft it here, send it from your mail app." and check the composer fields are present.
  4. Compare with Expected (a visitor can reach the company). Do not press the send button: it opens the mail app.

## S2.36 Enterprise contact form.

- **Expected:** A form lets a prospect request an Enterprise conversation and the request is stored.
- **Code:** done. Evidence present: apps/web/features/marketing/components/WaitlistDialog.tsx:116; apps/web/features/marketing/components/WaitlistDialog.tsx:67; apps/web/app/api/waitlist/public/route.ts:182
- **Earlier check in the running app:** UI_ONLY: E091 [UI_ONLY; public page render only]: Page rendered, forms not submitted.
- **Where to find it:** Products > Desktop (footer Surfaces > Desktop) > "Discuss Enterprise access" (labels found in the code)
- **Steps:**
  1. Open the Desktop page from the footer under Surfaces, labelled "Desktop".
  2. Click the button labelled "Discuss Enterprise access".
  3. In the dialog titled "Discuss Enterprise access", check the email field and the wording about contract-scoped Enterprise access.
  4. Compare with Expected (a prospect can request an Enterprise conversation). Do not submit unless testing storage is allowed; the success text is "You're on the list."

## S2.38 Privacy, terms, cookies, and accessibility pages.

- **Expected:** Public privacy, terms, cookies and accessibility pages exist and are linked site-wide.
- **Code:** done. Evidence present: apps/web/features/marketing/components/system/nav.ts:237; apps/web/app/privacy/page.tsx:1037; apps/web/app/terms/page.tsx:255; apps/web/app/cookies/page.tsx:314; apps/web/app/accessibility/page.tsx:71
- **Earlier check in the running app:** PARTIAL: Terms, Privacy, Acceptable Use, Data Use, Cookies and legal index render. Accessibility page was not visited. | E058 [PASS; legal index navigation]: Terms & policies opens legal index in new tab, with Terms, Privacy, Acceptable use, Data use, Cookies and other policy links. This is visibility/navigation proof, not legal compliance certification. | E059 [PASS; page render]: Policy body rendered at linked localhost URL; no consent submitted. | E060 [PASS; page render]: Policy body rendered at linked localhost URL; no consent submitted. | E061 [PASS; page render]: Policy body rendered at linked localhost URL; no consent submitted. | E062 [PASS; page render]: Policy body rendered at linked localhost URL; no consent submitted. | E066 [PASS; page and content render only]: Linked page opens with readable content; backend enforcement or form submission not tested.
- **Where to find it:** Footer > bottom legal row: "Privacy", "Terms", "Cookies", "Accessibility" (labels found in the code)
- **Steps:**
  1. Scroll to the bottom of any public page to the legal row of the footer.
  2. Click "Terms", then go back and click "Privacy", then "Cookies", then "Accessibility".
  3. Check each page opens with a heading and readable body text.
  4. Compare with Expected (all four pages exist and are linked site-wide).

## S2.40 Logged-out previews of shareable content.

- **Expected:** A logged-out visitor opening a public share link sees the shared content.
- **Code:** done. Evidence moved: apps/web/app/share/[token]/page.tsx:31; apps/web/app/share/[token]/page.tsx:91 (quoted code not found in the file now)
- **Where to find it:** Signed-in chat > open a conversation > conversation title menu > "Share…" > "Share conversation"; then open the link in a signed-out private window (labels found in the code)
- **Needs:** a signed-in account with a conversation, and a private browser window
- **Steps:**
  1. Sign in, open a conversation in chat, and open its title menu.
  2. Click "Share…", then choose a public link and create it (the dialog title reads "Share conversation" until a link exists).
  3. Copy the link, then open it in a private window while signed out.
  4. Check that the shared conversation appears read-only with its messages, compared with Expected (a logged-out visitor sees shared content).
