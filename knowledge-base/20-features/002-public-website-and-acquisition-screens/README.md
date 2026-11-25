---
id: "AREA-002"
type: "area"
title: "Public website and acquisition screens"
features: ["F002-01", "F002-02", "F002-03", "F002-04", "F002-05", "F002-06", "F002-07", "F002-08", "F002-09", "F002-10", "F002-11", "F002-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 2. Public website and acquisition screens

The public website is where a stranger first learns what AGI Workforce does, sees the apps and prices, and decides to sign up, download, or ask for a sales conversation. It also holds the public directories (integrations, plugins, skills, templates), the status page, help and legal pages, and shared-content previews. Signed-in visitors who open a product page are sent into the product instead of the sales page.

**Who uses it.** Every visitor, signed in or not. Signed-out visitors see marketing pages and directories. Signed-in visitors hitting a product route are rewritten into the product (apps/web/proxy.ts:124-134). Prospects use the Enterprise and partner forms. Operators read stored waitlist rows (apps/web/features/admin/services/operator-waitlist.ts:13). Paid-plan purchase is gated, so buyers depend on checkout being enabled.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F002-01](F002-01-product-entry-and-sign-in-redirect.md) | Product entry and sign-in redirect | built | n/a | n/a | n/a | n/a | n/a |
| [F002-02](F002-02-product-pages-for-the-chat-research-images-video-a.md) | Product pages for the chat, research, images, video and voice | partly | n/a | n/a | n/a | n/a | n/a |
| [F002-03](F002-03-apps-and-install-pages-desktop-mobile-cli-ide-brow.md) | Apps and install pages (desktop, mobile, CLI, IDE, browser) | partly | n/a | n/a | n/a | n/a | n/a |
| [F002-04](F002-04-download-center.md) | Download center | built | n/a | n/a | n/a | n/a | n/a |
| [F002-05](F002-05-integration-and-plugin-directories.md) | Integration and plugin directories | partly | n/a | n/a | n/a | n/a | n/a |
| [F002-06](F002-06-skill-template-and-assistant-directories.md) | Skill, template and assistant directories | partly | n/a | n/a | n/a | n/a | n/a |
| [F002-07](F002-07-pricing-plans-and-usage-explanations.md) | Pricing, plans and usage explanations | built | n/a | n/a | n/a | n/a | n/a |
| [F002-08](F002-08-enterprise-and-sales-contact.md) | Enterprise and sales contact | partly | n/a | no | no | n/a | n/a |
| [F002-09](F002-09-release-notes-and-changelog.md) | Release notes and changelog | built | n/a | n/a | built | n/a | n/a |
| [F002-10](F002-10-docs-help-and-service-status.md) | Docs, help and service status | built | n/a | n/a | n/a | n/a | n/a |
| [F002-11](F002-11-company-legal-and-cookies.md) | Company, legal and cookies | built | n/a | built | n/a | n/a | n/a |
| [F002-12](F002-12-shared-content-previews.md) | Shared content previews | built | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/002-public-website-and-acquisition-screens.md](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md).

## How this area works in the code

1. **Visitor reaches a route.** The request first passes the web proxy. For a marketing route that has a product behind it, a signed-in visitor (session cookie present) gets a rewrite to the product page. A signed-out visitor keeps the marketing page. (`apps/web/proxy.ts:96-122`, `apps/web/proxy.ts:124-134`)
2. **Identity provider mounted only where needed.** The client boundary checks the path. Only product, auth, and a fixed list of public prefixes (pricing, plugins, skills, gallery, connectors) load the browser identity provider. (`apps/web/app/BrowserIdentityBoundary.tsx:9-18`, `apps/web/lib/identity/browser-provider-routes.ts:3-14`, `apps/web/lib/identity/browser-provider-routes.ts:26-46`)
3. **Public page renders.** Each page is a server component that builds its own metadata and content. Navigation items come from one shared nav file. (`apps/web/features/marketing/components/system/nav.ts:26`, `apps/web/app/features/images/page.tsx:24`, `apps/web/app/features/video/page.tsx:33`)
4. **Pricing and checkout.** The pricing page reads the shared billing catalog. Checkout is a POST that first checks the checkout flag and the payment key, then rate limits, then checks the plan-change rule, then picks the price. (`packages/contracts/types/src/billing-catalog.ts:249`, `apps/web/app/api/checkout/route.ts:59`, `apps/web/app/api/checkout/route.ts:180`, `apps/web/app/api/checkout/route.ts:231`)
5. **Waitlist and Enterprise request.** The dialog checks the required consent boxes, then calls the public waitlist client. The server records consent first, then inserts or updates one row keyed by email and source. A consent failure stores nothing. (`apps/web/features/marketing/components/WaitlistDialog.tsx:55-71`, `apps/web/app/api/waitlist/public/route.ts:119`, `apps/web/app/api/waitlist/public/route.ts:167-188`)
6. **Download and CLI install.** The download page asks the release API which Mac builds exist and shows only those. The CLI install command points at the public install script, and the CLI update check reads the same install URL. (`apps/web/app/download/DesktopDownloadAvailability.tsx:52`, `apps/web/app/cli/CliInstallCommand.tsx:17`, `apps/cli/src/update_check.rs:27-28`)
7. **Live status and plugin catalogue.** The status page runs checks on every request and shows the result. The plugin catalogue is read once per request from the published registry and cached. (`apps/web/app/status/page.tsx:45`, `apps/web/app/status/page.tsx:96`, `apps/web/features/plugins/server/registry-source.ts:97-104`)
8. **Shared-content preview.** The share page checks the token format, then reads the shared session. It returns not found for a bad token and hides expired shares. (`apps/web/app/share/[token]/page.tsx:31`, `apps/web/app/share/[token]/page.tsx:83-84`, `apps/web/app/share/[token]/page.tsx:79`)

## Files to know

| File | Role |
|---|---|
| `apps/web/proxy.ts` | Routes signed-in visitors from marketing paths into the product and sets security headers. |
| `apps/web/lib/identity/browser-provider-routes.ts` | List of routes that need the browser identity provider. |
| `apps/web/features/marketing/components/system/nav.ts` | Single source of the public site navigation links. |
| `apps/web/app/pricing/page.tsx` | Public pricing page, team seats and usage copy. |
| `apps/web/app/api/checkout/route.ts` | Starts a paid-plan checkout, with the flag and payment-key gates. |
| `apps/web/features/marketing/components/WaitlistDialog.tsx` | Enterprise and waitlist dialog with consent and submit. |
| `apps/web/app/api/waitlist/public/route.ts` | Stores waitlist and Enterprise requests after recording consent. |
| `apps/web/app/download/DesktopDownloadAvailability.tsx` | Shows only the desktop installers the release API confirms. |
| `apps/web/app/cli/CliInstallCommand.tsx` | Shows the CLI install command or says no release is published. |
| `apps/web/app/status/page.tsx` | Live service health page. |
| `apps/web/features/plugins/server/registry-source.ts` | Reads the plugin catalogue and release history from the published registry. |
| `apps/web/app/share/[token]/page.tsx` | Shows a shared chat or artifact to a logged-out reader. |
| `packages/contracts/types/src/billing-catalog.ts` | Shared plan and price catalogue used by pricing and enforcement. |

## What is stored

- Waitlist and Enterprise requests: user id (if signed in), email, source, join and update times: Database table cloud_managed_waitlist (apps/web/app/api/waitlist/public/route.ts:182)
- Consent decisions for waitlist requests: A consent ledger, written before the waitlist row (apps/web/app/api/waitlist/public/route.ts:119); the store itself was not opened
- Shared chat or artifact content shown to readers: Shared-session storage read by token (apps/web/app/share/[token]/page.tsx:31, 39); storage not opened
- Plugin catalogue and release history: Read from the published plugin registry (registry-source.ts:97-114); registry location not opened
- Desktop release availability: Release API response (DesktopDownloadAvailability.tsx:74-75); not opened

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_CHECKOUT_ENABLED**: Set to 0, false or off to hide and disable checkout in the browser. Must match the server flag per the comment. (apps/web/features/billing/lib/localized-pricing.ts:20-27)
- **STRIPE_CHECKOUT_ENABLED**: Server-side checkout kill switch. Same off values as the browser flag. (apps/web/app/api/checkout/route.ts:59)
- **Payment provider secret key**: If missing, checkout is refused with a not-available message. (apps/web/app/api/checkout/route.ts:180)
- **Plan-change rule**: Blocks a checkout when the account may not change plan. (apps/web/app/api/checkout/route.ts (assertPlanChangeAllowed call, after the rate limit))
- **Signed-in session cookie**: Decides whether a marketing route is rewritten into the product. (apps/web/proxy.ts:92-94, 115-119)
- **Public site chrome (nav, sitemap)**: Adds or removes links to pages. (apps/web/features/marketing/components/system/nav.ts; apps/web/app/sitemap-page/page.tsx)

## Shared between apps

[{"thing": "Billing plan and price catalogue", "shared_by": "Pricing page and checkout route (packages/contracts/types/src/billing-catalog.ts)"}, {"thing": "Marketing navigation file", "shared_by": "All public marketing pages in apps/web (nav.ts)"}, {"thing": "Consent purposes for waitlist sources", "shared_by": "Waitlist route and admin waitlist service (apps/web/lib/consent-purposes.ts:62-67)"}, {"thing": "Plugin registry loader", "shared_by": "Plugin directory and plugin detail pages (registry-source.ts)"}, {"thing": "Public install script", "shared_by": "Web (apps/web/public/install.sh) and CLI, which embeds it (apps/cli/src/update_check.rs:28)"}, {"thing": "Mobile About screen and CLI contact entries", "shared_by": "Separate per app (apps/mobile/app/(app)/about.tsx; apps/cli/src/tui/tui_app.rs:3531)"}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says image, video and voice product pages are missing; the pages exist with metadata and sitemap entries. Brief status is stale. (apps/web/app/features/images/page.tsx:24; apps/web/app/features/video/page.tsx:33; apps/web/app/features/voice/page.tsx:33; apps/web/app/sitemap-page/page.tsx:99-101)
- Brief says the partner form is missing; the page and form exist. (apps/web/app/partners/page.tsx:25; apps/web/app/partners/PartnerApplicationForm.tsx:50)
- The Enterprise dialog says a person will contact the visitor, but the request is stored in the cloud managed waitlist table with the waitlist sources. No Enterprise-specific store was seen. (apps/web/features/marketing/components/WaitlistDialog.tsx:102-121; apps/web/app/api/waitlist/public/route.ts:182; apps/web/lib/consent-purposes.ts:62-67)
- Paid checkout needs two flags to agree (browser and server) and a payment key. If they diverge, the button and the API disagree, as the code's own comment warns. (apps/web/features/billing/lib/localized-pricing.ts:20-27; apps/web/app/api/checkout/route.ts:59, 180)
- CLI page hides the install command until a signed release exists, so there is no working install command to offer today. Brief item S2.11 needs a live check. (apps/web/app/cli/CliInstallCommand.tsx:17, 111)
- Brief says the Desktop Download and CLI pages are done, but the desktop download is macOS-only in code: Windows and Linux are not published. (apps/web/app/download/DesktopDownloadAvailability.tsx:19, 23)

## Not established

- No tests, builds, servers or browser checks were run (read-only review, per the request). Everything here is from reading code.
- Whether the pricing page copy matches enforcement (S2.22, S2.25) was not checked against the plan limits code.
- The payment checkout body after the plan-change check, and the price selection, were not read in full.
- The partner submission endpoint (apps/web/app/api/partners/apply) was listed but not opened; storage for partner applications is unknown.
- The consent ledger store, the shared-session store, the plugin registry location, and the release API were not opened, so the storage of those items is unknown.
- Integration directory page (apps/web/app/integrations/page.tsx) and its search behaviour were not read.
- Gallery page behaviour (launch into chat) was not read in detail (apps/web/app/gallery/GalleryClient.tsx:31, 829, 1245 cited by brief only).
- Whether the CLI contact entry (apps/cli/src/tui/tui_app.rs:3531) and mobile About entries match the brief was not opened.
- Whether the Mac-only download matches the release pipeline was not checked beyond the component text.
- Whether Image, video and voice pages have a working start path was only partly read (images page button at line 52).
- Design language and shared UI package (packages/ui) use on these pages was not verified.
