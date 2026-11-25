# Area 2. Public website and acquisition screens

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S2.01 Product homepage.
- Should: A visitor to / sees a product homepage with sign-in / try / download CTAs; a signed-in visitor lands in the product without error.
- Status: web done
- Code: apps/web/app/BrowserIdentityBoundary.tsx:8; apps/web/lib/identity/browser-provider-routes.ts:30

## S2.02 General assistant product page.
- Should: A public page presents the general chat assistant (AGI Web / AI chat) with what it does and a way to start.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:26; apps/web/app/web/page.tsx:39; apps/web/app/features/ai-chat/page.tsx:60

## S2.03 Research product page.
- Should: A public page presents deep research (cited reports) and how to use it.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:70; apps/web/app/features/deep-research/page.tsx:42

## S2.04 Agentic work product page.
- Should: A public page presents agentic work (AGI Work) and a way to start; signed-in visitors reach the product without error.
- Status: web done
- Code: apps/web/app/BrowserIdentityBoundary.tsx:12; apps/web/lib/identity/browser-provider-routes.ts:40; apps/web/app/chat/page.tsx:8; apps/web/proxy.ts:110

## S2.05 Coding-agent product page.
- Should: A public page presents the coding agent (AGI Code: CLI + VS Code) and how to get it.
- Status: web done
- Code: apps/web/app/BrowserIdentityBoundary.tsx:12; apps/web/lib/identity/browser-provider-routes.ts:40; apps/web/proxy.ts:114

## S2.06 Image-generation product page.
- Should: A dedicated public page presents image generation.
- Status: web missing

## S2.07 Video-generation product page.
- Should: A dedicated public page presents video generation.
- Status: web missing

## S2.08 Voice product page.
- Should: A dedicated public page presents voice (voice mode / dictation / realtime).
- Status: web missing

## S2.09 Desktop application page.
- Should: A public page describes the desktop app truthfully (what it does, availability, download).
- Status: web done
- Code: apps/web/app/desktop/page.tsx:64; apps/web/app/desktop/page.tsx:148; apps/web/features/marketing/components/system/nav.ts:34

## S2.10 Mobile application page.
- Should: A public page describes the mobile app and its availability.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:47; apps/web/app/mobile/page.tsx:81

## S2.11 CLI installation page.
- Should: A public page tells a visitor how to install the CLI and offers a working install.
- Status: web unverified

## S2.12 IDE extension page.
- Should: A public page describes the IDE extension and its availability.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:42; apps/web/app/vscode-extension/page.tsx:26

## S2.13 Browser extension page.
- Should: A public page describes the browser extension and its availability.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:37; apps/web/app/chrome-extension/page.tsx:111

## S2.14 Integration directory.
- Should: A logged-out visitor can browse and search a directory of available integrations.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:132; apps/web/app/connectors/mcp-directory/page.tsx:72

## S2.15 Plugin marketplace.
- Should: A logged-out visitor can browse the plugin catalogue read from the live registry, with a path to install.
- Status: web done
- Code: apps/web/app/sitemap-page/page.tsx:32; apps/web/app/plugins/page.tsx:42; apps/web/features/plugins/server/registry-source.ts:33

## S2.16 Skill directory.
- Should: A logged-out visitor can browse a public directory of skills.
- Status: web done
- Code: apps/web/app/skills/page.tsx:19; apps/web/app/skills/SignedOutSkills.tsx:32

## S2.17 Template gallery.
- Should: A public gallery offers curated starting templates a visitor can preview and launch into chat.
- Status: web done
- Code: apps/web/app/sitemap-page/page.tsx:35; apps/web/app/gallery/GalleryClient.tsx:31; apps/web/app/gallery/GalleryClient.tsx:1245

## S2.18 Custom-assistant directory.
- Should: A public directory lists custom assistants / agents a visitor can browse.
- Status: web missing

## S2.19 Individual integration detail pages.
- Should: Each integration has its own public detail page.
- Status: web missing

## S2.20 Individual plugin detail pages.
- Should: Each plugin has a public detail page with description, permissions, install info and release history.
- Status: web done
- Code: apps/web/app/plugins/page.tsx:150; apps/web/app/plugins/[id]/page.tsx:77; apps/web/lib/services/plugin-lifecycle.ts:100; apps/web/features/plugins/server/registry-source.ts:110

## S2.21 Individual template preview pages.
- Should: Each template has its own previewable page (addressable URL).
- Status: web done
- Code: apps/web/app/gallery/[templateId]/page.tsx:60; apps/web/app/gallery/[templateId]/page.tsx:55; apps/web/app/gallery/GalleryClient.tsx:829

## S2.22 Consumer pricing page.
- Should: A public pricing page lists individual plans with prices and lets a visitor buy one; its plan copy matches enforcement.
- Status: web done
- Code: apps/web/app/pricing/page.tsx:141; packages/contracts/types/src/billing-catalog.ts:249; apps/web/app/pricing/page.tsx:882; apps/web/app/api/checkout/route.ts:204

## S2.23 Team pricing page.
- Should: A public page shows Team per-seat pricing and lets a buyer choose seats and purchase.
- Status: web done
- Code: apps/web/app/pricing/page.tsx:1104; apps/web/app/pricing/page.tsx:1140; apps/web/app/pricing/page.tsx:726

## S2.24 Enterprise product page.
- Should: A public page presents the Enterprise offering with a sales path.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:101; apps/web/app/enterprise/page.tsx:69

## S2.25 Plan-comparison table.
- Should: A plan-comparison table lists plans against features, and each cell matches enforcement.
- Status: web done
- Code: packages/contracts/types/src/billing-catalog.ts:249; packages/contracts/types/src/billing-catalog.ts:259; apps/web/app/pricing/page.tsx:141; apps/web/app/pricing/page.tsx:149

## S2.26 Usage and credit explanations.
- Should: Public pages explain how managed usage, allowances and credits work.
- Status: web done
- Code: apps/web/app/pricing/page.tsx:1355; packages/ui/i18n/locales/en/pricing.json:205; apps/web/content/support/usage-and-credits.md:2; apps/web/app/help/[slug]/page.tsx:38

## S2.27 Download center with platform selection.
- Should: A download page offers installers per platform/architecture, reporting what is actually published.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:49; apps/web/app/download/DesktopDownloadAvailability.tsx:113; apps/web/app/download/DesktopDownloadAvailability.tsx:138; apps/web/app/download/page.tsx:119

## S2.28 Changelog and release notes.
- Should: A public changelog lists dated releases.
- Status: web done, cli done
- Code: apps/web/features/marketing/components/system/nav.ts:137; apps/web/app/changelog/page.tsx:17; apps/web/app/release-notes/ReleaseNotesPage.tsx:6; apps/cli/src/update_check.rs:65; apps/cli/src/update_check.rs:144; apps/cli/src/claude_parity.rs:1481

## S2.29 Product announcement pages.
- Should: Individual product announcements have their own public pages.
- Status: web done
- Code: apps/web/app/release-notes/[slug]/page.tsx:52; apps/web/app/release-notes/ReleaseNotesPage.tsx:52

## S2.30 Documentation portal.
- Should: A public documentation portal indexes guides and API docs.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:125; apps/web/app/docs/page.tsx:119

## S2.31 Help center.
- Should: A public help centre offers searchable articles.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:196; apps/web/app/help/page.tsx:60; apps/web/app/help/[slug]/page.tsx:36

## S2.32 Service-status page.
- Should: A public service-status page shows current health from live checks.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:138; apps/web/app/status/page.tsx:65

## S2.33 Trust and security center.
- Should: A public trust and security centre explains security posture and data handling.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:147; apps/web/app/trust/page.tsx:277

## S2.34 About and company information.
- Should: An About view gives product and company information.
- Status: web done, mobile done
- Code: apps/web/features/marketing/components/system/nav.ts:144; apps/web/app/about/page.tsx:61; apps/mobile/app/(app)/about.tsx:290; apps/mobile/src/features/settings/index.tsx:623

## S2.35 Contact and support page.
- Should: A contact / support page lets a visitor reach the company.
- Status: web done, mobile done, cli unverified
- Code: apps/web/features/marketing/components/system/nav.ts:149; apps/web/app/contact/page.tsx:17; apps/web/app/support/page.tsx:30; apps/mobile/app/(app)/about.tsx:283; apps/mobile/app/(app)/about.tsx:112; apps/cli/src/tui/tui_app.rs:3531

## S2.36 Enterprise contact form.
- Should: A form lets a prospect request an Enterprise conversation and the request is stored.
- Status: web done
- Code: apps/web/features/marketing/components/WaitlistDialog.tsx:109; apps/web/features/marketing/components/WaitlistDialog.tsx:62; apps/web/app/api/waitlist/public/route.ts:158

## S2.37 Partner and developer submission forms.
- Should: Partners and developers can submit a listing or partnership application through a form.
- Status: web missing

## S2.38 Privacy, terms, cookies, and accessibility pages.
- Should: Public privacy, terms, cookies and accessibility pages exist and are linked site-wide.
- Status: web done
- Code: apps/web/features/marketing/components/system/nav.ts:207; apps/web/app/privacy/page.tsx:860; apps/web/app/terms/page.tsx:247; apps/web/app/cookies/page.tsx:315; apps/web/app/accessibility/page.tsx:70

## S2.39 Regional and language selectors.
- Should: A visitor can choose language and region on the public site.
- Status: not applicable anywhere

## S2.40 Logged-out previews of shareable content.
- Should: A logged-out visitor opening a public share link sees the shared content.
- Status: web done
- Code: apps/web/app/share/[token]/page.tsx:32; apps/web/app/share/[token]/page.tsx:91
