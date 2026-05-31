# Batch 21: Downloads and Upgrade Plans Audit

**Auditor:** Claude Opus 4.7 (1M context)
**Date:** 2026-05-24
**Branch:** audit/preexisting-remediation-2026-05-23
**Reference baseline:** Claude desktop (Max 20x + Free tiers, 2026-03-28 and 2026-05-15)

---

## IMG: 145_claude-max20x_downloads_apps_top.png

- **Feature:** Downloads/integrations hub -- "Do more with Claude, everywhere you work" hero page showing Microsoft Office integration cards (Excel, PowerPoint, Word with Install buttons), Desktop app card (Open button), Claude Code integration cards (Terminal Install, VS Code Install, Desktop app Open, JetBrains Install).
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/145_claude-max20x_downloads_apps_top.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/download/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/DirectDownloadButtons.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/DownloadSection.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/integrations/page.tsx`
- **API endpoints:**
  - `GET /api/download?platform={mac|windows|linux}`
  - `GET /api/download-beta?platform={mac|windows|linux}`
- **Data flow:**
  1. User navigates to `/download` page
  2. Static page renders CLI install line, Homebrew/cargo/npm paths, and artifact table
  3. `DirectDownloadButtons` or `DownloadSection` components trigger `triggerDownload(platform)` from `services/download.ts`
  4. Browser redirects to `/api/download?platform=mac` which fetches latest GitHub release asset
  5. API streams the binary back with `Content-Disposition: attachment` header
  6. Fallback to static `/downloads/agiworkforce.dmg` if GitHub API fails
- **Flaws:**
  - [critical] AGI download page has no integration hub concept at all -- no Microsoft Office cards, no Cowork section, no Claude Code section with Terminal/VS Code/JetBrains/Desktop app install links. The page is a bare text-only CLI installer page with a table. @ `apps/web/app/download/page.tsx`:24-145
  - [major] No "Install" external link buttons for third-party integrations (Excel, PowerPoint, Word, VS Code, JetBrains, Terminal). Claude shows rich cards with Install/Open action buttons per integration. AGI has no equivalent component. @ `apps/web/app/download/page.tsx`:52-104
  - [major] No hero tagline equivalent. Claude uses "Do more with Claude, everywhere you work" with dark card grid layout. AGI uses "Install AGI." with CLI-focused text blocks. @ `apps/web/app/download/page.tsx`:29-35
  - [major] No integration screenshots/previews. Claude embeds a preview image inside the Microsoft Office card showing a spreadsheet with Claude searching. AGI has no visual demos. @ `apps/web/app/download/page.tsx` (missing entirely)
  - [minor] `DownloadSection` component exists but is unused on the download page -- it is a standalone OS-detect card grid, not integrated into the page layout. @ `apps/web/components/DownloadSection.tsx`:1-126
  - [minor] `DirectDownloadButtons` also appears unused on the main download page. @ `apps/web/components/DirectDownloadButtons.tsx`:1-34
- **Visual gaps:**
  - Claude shows dark rounded cards arranged in a grid for each integration category. AGI has a flat text-only page with a plain HTML table.
  - No "New" badges on integration items (Claude marks Word as "New").
  - No card-based layout for Desktop vs Claude Code vs MS Office categories.
  - No embedded demo screenshots within cards.
  - No "Open" vs "Install" distinction in action buttons.

---

## IMG: 146_claude-max20x_downloads_mobile-chrome.png

- **Feature:** Downloads page continuation -- Mobile section (iOS Download, Android Download), Chrome extension section (Install link), with embedded preview screenshots showing health data and e-commerce return flows.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/146_claude-max20x_downloads_mobile-chrome.png
- **Implementation status:** missing
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/download/page.tsx`
- **API endpoints:** N/A
- **Data flow:**
  1. N/A -- no mobile download section or Chrome extension install section exists
- **Flaws:**
  - [critical] No mobile download section with iOS/Android download buttons. Claude shows a "Mobile" card with iOS Download and Android Download buttons. AGI has no mobile download links on the download page. @ `apps/web/app/download/page.tsx` (missing entirely)
  - [critical] No Chrome extension install card. Claude shows a "Chrome" card with description and Install link. AGI mentions the Chrome extension in `/integrations` only as a table row, not as a downloadable/installable card. @ `apps/web/app/download/page.tsx` (missing entirely)
  - [major] No embedded preview screenshots. Claude shows health data tracking preview in the Mobile card and an e-commerce returns flow in the Chrome card. AGI has no visual demos anywhere. @ `apps/web/app/download/page.tsx` (missing entirely)
  - [major] No Slack integration card. Image shows partial Slack card at top right with Install link. AGI has no Slack integration entry point. @ `apps/web/app/download/page.tsx` (missing entirely)
- **Visual gaps:**
  - Claude uses dark rounded cards with category icons, description text, and action buttons in a grid layout. AGI has no equivalent cards.
  - No app store buttons (iOS/Android style Download buttons).
  - No embedded preview images showing the product in use.
  - No Chat demo snippet showing "My downloads folder is a mess! Can you clean it up?"

---

## IMG: 147_claude-max20x_upgrade-plans_individual.png

- **Feature:** Upgrade/plans page -- "Plans that grow with you" heading, Individual/Team and Enterprise tab toggle, Monthly/Yearly billing toggle (Yearly selected, "Save 17%"), Pro plan card ($17/mo billed annually with "Downgrade to Pro" button), Max plan card (From $100/mo billed monthly with "Adjust usage" button), feature checklists for each, usage limits footnote.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/147_claude-max20x_upgrade-plans_individual.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/pricing/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/marketing-constants.ts`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/i18n/locales/en/pricing.json`
- **API endpoints:** N/A (static marketing page)
- **Data flow:**
  1. User navigates to `/pricing`
  2. `PricingPage` component renders with `Individual | Team | API` tabs (3 tabs vs Claude's 2 tabs)
  3. Individual tab shows Local (Free), BYOK (Free), and Hobby (Waitlist) tier cards
  4. Team tab shows Pro, Pro+, Max with monthly/yearly toggle
  5. Plan comparison table rendered from `MARKETING_FEATURE_MATRIX`
  6. i18n translations loaded from `en/pricing.json`
- **Flaws:**
  - [critical] AGI pricing page tabs are `Individual | Team | API` (3 tabs) vs Claude's `Individual | Team and Enterprise` (2 tabs). The tab model and plan tier mapping do not match the Claude reference. @ `apps/web/app/pricing/page.tsx`:33-37
  - [critical] Individual tab shows Local/BYOK/Hobby -- three very different tiers from Claude's Free/Pro/Max individual plans. No concept of "Downgrade to Pro" or "Adjust usage" action buttons. @ `apps/web/app/pricing/page.tsx`:144-239
  - [major] No Monthly/Yearly billing toggle on the Individual tab. Claude shows this toggle prominently. AGI only shows it on the Team tab. @ `apps/web/app/pricing/page.tsx`:112-141
  - [major] No plan icon/illustration above plan name. Claude uses abstract tree/graph icons for Pro and Max. AGI has no plan icons. @ `apps/web/app/pricing/page.tsx`:146-238
  - [major] Feature lists under each plan differ substantially. Claude Pro features: "Claude Code directly in your codebase", "Power through tasks with Cowork", "Higher usage limits", "Deep research and analysis", "Memory that carries across conversations". AGI Local features: "Local LLMs only", "SQLite storage on disk", "No telemetry, no auth", "Desktop app only". @ `apps/web/app/pricing/page.tsx`:153-169
  - [minor] No "Usage limits apply" footnote with link. Claude has "*Usage limits apply. Prices shown don't include applicable tax." at page bottom. AGI pricing page has no equivalent disclaimer. @ `apps/web/app/pricing/page.tsx` (missing)
  - [minor] Price display format differs. Claude shows "$17 USD/month billed annually" in a specific typography hierarchy. AGI shows "Free forever" or "Waitlist private beta" with different formatting. @ `apps/web/app/pricing/page.tsx`:148-152
- **Visual gaps:**
  - Claude uses large rounded cards with subtle border, plan icons, price prominence, and centered layout. AGI uses custom CSS classes (`agi-tier`, `agi-tier-grid`) with a different visual language.
  - No "Save 17%" badge on the yearly toggle.
  - No "No commitment - Cancel anytime" text under Max plan CTA.
  - Card layout is 3-column vs Claude's 2-column on Individual tab.

---

## IMG: 148_claude-max20x_upgrade-plans_team-enterprise.png

- **Feature:** Team and Enterprise plans -- Team card (5-150 users) with Standard seat $20/mo and Premium seat $100/mo, feature checklist (200K context window, SSO, admin controls, etc.). Enterprise card (20+ users) with "Seat price + usage at API rates" $20/seat, extensive feature list (SCIM, audit logs, compliance API, IP allowlisting, Google Docs cataloging), "Get Team plan" and "Get Enterprise plan" CTAs.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/148_claude-max20x_upgrade-plans_team-enterprise.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/pricing/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/marketing-constants.ts`
- **API endpoints:** N/A
- **Data flow:**
  1. User selects "Team" tab on pricing page
  2. Three plan cards render (Pro, Pro+, Max) from `BILLING_PLAN_PRICING`
  3. Monthly/yearly toggle changes displayed prices
  4. All Team plans show "Join waitlist" CTA linking to `/pricing#waitlist`
- **Flaws:**
  - [critical] AGI Team tab shows Pro/Pro+/Max tiers -- all waitlisted. Claude shows Team (Standard $20/mo + Premium $100/mo seats) and Enterprise ($20/seat + API usage) with real pricing and "Get plan" CTAs. Completely different plan architecture. @ `apps/web/app/pricing/page.tsx`:242-273
  - [critical] No Team plan with seat-based pricing (Standard/Premium seats). AGI has individual usage-based tiers (Pro $29.99/mo, Pro+ $49.99/mo, Max $299.99/mo) instead of per-seat pricing. @ `apps/web/lib/marketing-constants.ts`:78-111
  - [critical] No Enterprise plan with usage-at-API-rates model. Claude Enterprise shows $20/seat + API-rate usage scaling. AGI Enterprise is behind "API" tab with "Contact sales" CTA only. @ `apps/web/app/pricing/page.tsx`:276-326
  - [major] Missing enterprise features: 500K context window, SCIM, audit logs, compliance API, network-level access control, custom data retention, IP allowlisting, Google Docs cataloging. AGI Enterprise features list: "Custom credit allocation", "White-label option", "Dedicated account manager", "SLA guarantee". @ `apps/web/features/billing/components/Billing/Subscription.tsx`:451-472
  - [major] Missing Team features: 200K context window, extra usage at API rates, Claude Code, Cowork, central billing and administration, SSO and domain capture, admin controls, enterprise deployment, enterprise search, Microsoft 365/Slack. AGI Team tiers have: credits per billing cycle, AI model access, email support. @ `apps/web/features/billing/hooks/use-billing-queries.ts`:168-230
  - [minor] No user count badge (e.g., "5-150 users", "20+ users") on plan cards. @ `apps/web/app/pricing/page.tsx`:242-273
  - [minor] No "A work email address is required" notice under Enterprise CTA. @ `apps/web/app/pricing/page.tsx`:276-326
- **Visual gaps:**
  - Claude shows two large cards side by side (Team + Enterprise) with seat pricing breakdown inside cards. AGI shows three smaller cards all with "Join waitlist".
  - No nested pricing rows within cards (Standard seat row + Premium seat row in Team card).
  - No plan icons (grid icon for Team, stacked-blocks icon for Enterprise).
  - No green checkmark feature lists -- AGI uses custom check SVGs.

---

## IMG: 049_claude-free_upgrade-plans.png

- **Feature:** Claude Free user's upgrade page at `claude.ai/upgrade` -- "Plans that grow with you" heading, Individual/Team and Enterprise tabs, three plan cards side-by-side: Free ($0, "Use Claude for free"), Pro ($17/mo billed annually, "Get Pro plan"), Max (From $100/mo, "Get Max plan"). Feature checklists under each. Monthly/Yearly toggle with "Save 17%" badge. Usage limits disclaimer at bottom. Light theme.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/049_claude-free_upgrade-plans.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/pricing/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/billing/components/Billing/Subscription.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/features/billing/pages/BillingDashboard.tsx`
- **API endpoints:** N/A
- **Data flow:**
  1. Free user navigates to `/pricing` or `/billing`
  2. Pricing page shows Local/BYOK/Hobby individual tiers
  3. Billing dashboard (`/billing`) shows upgrade cards (Hobby, Pro, Max, Enterprise) within `Subscription` component
  4. Upgrade action calls `upgradeToHobbyPlan/upgradeToProPlan/upgradeToMaxPlan` which POST to `/api/checkout`
  5. Server creates Stripe checkout session and returns URL
  6. Browser redirects to Stripe hosted checkout
- **Flaws:**
  - [critical] AGI has no Free plan card equivalent. Claude shows Free ($0) alongside Pro and Max. AGI's Individual tab shows Local (Free) and BYOK (Free) -- conceptually different from Claude's unified Free tier that works on "web, iOS, Android, and desktop". @ `apps/web/app/pricing/page.tsx`:144-175
  - [major] No "Get Pro plan" / "Get Max plan" styled CTAs on pricing page. AGI pricing page shows "Install" for Local/BYOK and "Join waitlist" for Hobby. Only the billing dashboard has upgrade buttons, but those are behind auth. @ `apps/web/app/pricing/page.tsx`:171-236
  - [major] Feature lists diverge from Claude. Claude Free: "Chat on web, iOS, Android, and desktop", "Generate code and visualize data", "Connect Slack and Google Workspace", "Extended thinking for complex work", "Built-in web search". AGI Local: "Local LLMs only - fully offline", "SQLite storage on disk", "No telemetry, no auth", "Desktop app only". @ `apps/web/app/pricing/page.tsx`:153-169
  - [major] No "No commitment - Cancel anytime" text under Max CTA. @ `apps/web/app/pricing/page.tsx` (missing)
  - [minor] Light theme rendering differs. Claude Free upgrade page is light-themed (white background, dark cards). AGI pricing page appears to be dark-themed (based on `data-design="agi"` and CSS variable usage). @ `apps/web/app/pricing/page.tsx`:55
- **Visual gaps:**
  - Claude shows 3 plans horizontally with clear price prominence. AGI shows 3 different plans (Local/BYOK/Hobby) with "Free" and "Waitlist" instead of real prices.
  - No Monthly/Yearly toggle on Individual tab.
  - Missing "*Usage limits apply" footer disclaimer.
  - Card sizing and spacing differ.

---

## IMG: 35_plans-pricing_individual-plans.png

- **Feature:** Plans pricing page (March 2026 version, desktop app) -- dark theme, "Plans that grow with you" heading, Individual/Team and Enterprise tabs, 3-column card layout: Max ($100/mo, "Get Max plan", features), Pro ($17/mo billed annually, "Get Pro plan"), Free ($0, "Use Claude for free"). Monthly/Yearly toggle with "Save 17%". Feature checklists under each plan. Different card ordering from May 2026 version (Max first).
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/35_plans-pricing_individual-plans.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/pricing/page.tsx`
- **API endpoints:** N/A
- **Data flow:**
  1. Same as image 049 -- pricing page renders tier cards from marketing constants
  2. Feature matrix displayed from `MARKETING_FEATURE_MATRIX` lookup by `activeTab`
  3. i18n translations loaded for all labels
- **Flaws:**
  - [major] Card ordering differs. Claude March 2026 orders Max-Pro-Free (left to right, highest tier first). AGI orders Local-BYOK-Hobby. Even ignoring tier name differences, the visual hierarchy puts premium first in Claude vs free-first in AGI. @ `apps/web/app/pricing/page.tsx`:146-238
  - [major] Claude Pro feature "Claude in PowerPoint" appears as a differentiator in the Max card. AGI has no equivalent feature tiering by specific integrations. @ `apps/web/app/pricing/page.tsx` (missing)
  - [minor] Same tab/toggle/pricing/feature gaps described in images 147 and 049 above apply here.
- **Visual gaps:**
  - Dark card backgrounds with subtle borders match Claude March 2026 version. AGI uses `agi-tier` CSS classes with different visual treatment.
  - Plan icons above plan names in Claude (abstract tree diagrams). Missing in AGI.
  - "Get Max plan" / "Get Pro plan" / "Use Claude for free" button label pattern not replicated.

---

## IMG: 36_plans-pricing_team-enterprise-plans.png

- **Feature:** Team and Enterprise plans (March 2026, desktop app) -- dark theme, 2-column layout: Team (Predictable usage per seat, 5-150 users, Standard $20/mo, Premium $100/mo, feature list including 200K context, SSO, Claude Code, Cowork, enterprise search), Enterprise (Flexible pooled usage, 20+ users, seat price + usage at API rates, $20/seat, feature list including SCIM, audit logs, compliance API, network access control, IP allowlisting, Google Docs cataloging). "Get Team plan" and "Get Enterprise plan" CTAs.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/36_plans-pricing_team-enterprise-plans.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/pricing/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/marketing-constants.ts`
- **API endpoints:** N/A
- **Data flow:**
  1. Same as image 148 -- Team tab renders from `BILLING_PLAN_PRICING` and `MARKETING_FEATURE_MATRIX`
- **Flaws:**
  - [critical] Same fundamental architecture mismatch as image 148. AGI Team tab shows Pro/Pro+/Max usage-based tiers with "Join waitlist". Claude shows seat-based Team ($20-$100/seat) and Enterprise ($20/seat + API usage) with real CTAs. @ `apps/web/app/pricing/page.tsx`:242-273
  - [major] No seat-based pricing model. Claude Team has Standard ($20/mo, $25 monthly) and Premium ($100/mo, $125 monthly) seat types. AGI has no concept of seat types. @ `apps/web/lib/marketing-constants.ts`:78-111
  - [major] Missing 14 Team features: 200K context window, extra usage at API rates, Claude Code, Cowork, central billing/admin, SSO/domain capture, admin controls for remote and local connectors, enterprise deployment for desktop, enterprise search, Microsoft 365/Slack, no model training by default. @ `apps/web/features/billing/hooks/use-billing-queries.ts`:168-230
  - [major] Missing 12 Enterprise features: pay-as-you-go pooled usage, user/org spend limits, 500K context window, role-based fine-grained permissioning, SCIM, audit logs, compliance API for observability, network-level access control, custom data retention, IP allowlisting, Google Docs cataloging. @ `apps/web/features/billing/hooks/use-billing-queries.ts`:216-230
  - [minor] "A work email address is required to create an Enterprise account" notice missing. @ `apps/web/app/pricing/page.tsx` (missing)
- **Visual gaps:**
  - 2-column dark card layout with nested seat pricing rows in Team card. AGI has 3-column waitlisted cards.
  - Plan icons (grid for Team, stacked blocks for Enterprise) missing.
  - User count badges ("5-150 users", "20+ users") missing.
  - Green checkmark feature lists vs AGI's custom SVG checks.

---

## IMG: 37_feature-showcase_integrations-top.png

- **Feature:** Downloads/integrations page -- "Do more with Claude, everywhere you work" hero, Microsoft Office card (with "New" badge, "Upgrade" button, Excel and PowerPoint items with external links), Cowork card ("Hand off complex tasks", "Only on desktop", "Upgrade" button), Claude Code card ("Build, debug, and ship", "Upgrade" button, Terminal/VS Code/Desktop app/JetBrains items with external links). Light-on-dark theme.
- **Image path:** /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-03-28/37_feature-showcase_integrations-top.png
- **Implementation status:** partial
- **Primary files:**
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/download/page.tsx`
  - `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/integrations/page.tsx`
- **API endpoints:** N/A
- **Data flow:**
  1. User navigates to `/download` or `/integrations`
  2. Download page shows CLI install instructions and artifact table
  3. Integrations page shows text-only descriptions of MCP plugins, native messaging bridge, and provider BYOK
  4. No combined card-grid hub page exists
- **Flaws:**
  - [critical] No combined integration hub page with rich cards. Claude shows a single page with Microsoft Office, Cowork, Claude Code, Mobile, Chrome, Slack as dark rounded cards with icons, descriptions, and action buttons. AGI splits this across `/download` (CLI-only) and `/integrations` (text-only table). Neither matches the Claude card grid. @ `apps/web/app/download/page.tsx`:24-145 and `apps/web/app/integrations/page.tsx`:13-93
  - [major] No "Upgrade" gating buttons on integration cards. Claude shows "Upgrade" for Microsoft Office, Cowork, and Claude Code -- indicating plan-gated features. AGI has no plan-gated integration access UI. @ `apps/web/app/download/page.tsx` (missing)
  - [major] No Cowork card. Claude shows "Cowork: Hand off complex tasks so you can focus on other work. Only on desktop." AGI has no Cowork concept in download or integrations pages. @ `apps/web/app/download/page.tsx` (missing)
  - [major] No Microsoft Office integration at all. Claude shows Excel and PowerPoint items with external links. AGI has no Office integration references. @ `apps/web/app/download/page.tsx` (missing)
  - [minor] "New" badge on Microsoft Office card not present since the entire card category is missing. @ `apps/web/app/download/page.tsx` (missing)
  - [minor] External link arrows (up-right arrow icons) on integration items (Terminal, VS Code, Desktop app, JetBrains) missing since no card grid exists. @ `apps/web/app/download/page.tsx` (missing)
- **Visual gaps:**
  - Claude uses a dark-themed card grid with rounded corners, integration logos (Apple, Slack, JetBrains icons), preview screenshots, and action buttons. AGI has plain HTML tables and text lists.
  - No "Do more with Claude, everywhere you work" hero equivalent.
  - No demo screenshots embedded in cards (Claude shows spreadsheet with AI search, terminal with code).
  - No chat bubble demo ("My downloads folder is a mess! Can you clean it up?").

---

## Summary of Cross-Cutting Issues

### Architecture Mismatches

| Area | Claude Reference | AGI Implementation | Severity |
|------|-----------------|-------------------|----------|
| Downloads page | Rich card grid hub with integrations, mobile, Chrome, Office | Text-only CLI installer page with HTML table | critical |
| Individual plans | Free / Pro / Max with real pricing | Local / BYOK / Hobby with free/waitlist | critical |
| Team plans | Seat-based (Standard $20 + Premium $100) | Usage-based (Pro $29.99, Pro+ $49.99, Max $299.99) | critical |
| Enterprise | $20/seat + API-rate usage | "Contact sales" placeholder | critical |
| Billing toggle | Monthly/Yearly on Individual tab | Only on Team tab | major |
| Integration hub | Combined card grid with install/upgrade buttons | Split across /download and /integrations, both text-only | critical |
| Plan features | Claude-specific features (Cowork, Memory, Deep research) | AGI-specific features (Local LLMs, SQLite, BYOK) | major (by design) |

### Files Requiring Attention

1. **`apps/web/app/download/page.tsx`** -- Needs full redesign as integration hub with card grid, mobile downloads, Chrome extension, Office integrations, and preview screenshots.
2. **`apps/web/app/pricing/page.tsx`** -- Tab structure, tier names, pricing models, feature lists, and CTA patterns all diverge from Claude reference. The v1-local-only-cloud-waitlist product strategy explains some divergence (Local/BYOK focus is intentional), but the UI presentation quality gap is significant.
3. **`apps/web/components/DirectDownloadButtons.tsx`** and **`apps/web/components/DownloadSection.tsx`** -- Exist but are unused on the download page. Orphaned components.
4. **`apps/web/features/billing/components/Billing/Subscription.tsx`** -- Upgrade cards are behind auth in the billing dashboard, not exposed on the public pricing page. Feature lists and plan names diverge from Claude.
5. **`apps/web/lib/marketing-constants.ts`** -- `MARKETING_FEATURE_MATRIX` has different plan IDs and feature descriptions than Claude reference.

### Notes on Intentional Divergence

Several gaps are by design per project policy:
- v1 is LOCAL ONLY with cloud waitlisted (locks/v1-local-only-cloud-waitlist-2026-05-18.md)
- Plan tiers (Local/BYOK/Hobby vs Free/Pro/Max) reflect a different product model
- BYOK-first launch means no managed compute pricing is public yet

However, the **visual quality, page layout, and UX patterns** (card grids, billing toggles, integration hubs, preview screenshots, action buttons, plan icons) are independent of the pricing model and represent real quality gaps against the Claude reference baseline.
