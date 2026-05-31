# Batch 08 — Connectors Directory Modal (Paginated)

Audit date: 2026-05-24
Reference: Claude Desktop connectors directory modal (19 paginated screenshots)
Source: `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/`
Web app root: `/Users/siddhartha/Desktop/agiworkforce/apps/web`

---

## Executive Summary

Claude's connector directory is a paginated modal displaying **190+ connectors** across 19 pages with search, sort, type filters, and categories. The AGI web app implements a **full-page connectors view** (not a modal) with only **32 hardcoded connectors** and **32 entries in connector-logos.ts**. The vast majority of connectors visible in the reference screenshots have no corresponding entry in the AGI codebase. The architecture differs fundamentally: Claude uses a dynamic server-backed directory with pagination; AGI uses a static client-side array with no pagination.

**Critical gaps:**
- ~160 connectors shown in Claude reference are completely absent from the AGI connector registry
- No pagination system exists
- No Sort/Type/Categories dropdown filters matching Claude's modal UI
- Implementation is a full page, not a modal overlay
- No connector detail/config view
- No "Trending"/"New"/"Interactive" badges

---

## IMG: 01_directory_modal-page-01-gmail-canva-google-calendar-notion-slack.png

- **Feature:** Connectors directory modal page 1 showing Gmail, Canva, Google Calendar, Notion, Slack, Figma, Atlassian Rovo, HubSpot, Linear, monday.com, Intercom, Box, Gamma, Miro. Modal title "Connectors" with subtitle. Search bar, Sort, Type, Categories filters.
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/01_directory_modal-page-01-gmail-canva-google-calendar-notion-slack.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
  - `apps/web/app/connectors/page.tsx`
- **API endpoints:** `GET/POST/DELETE /api/connectors`
- **Data flow:**
  - Claude: sidebar click "Connectors" -> opens modal overlay -> server-paginated directory with real-time search
  - AGI: navigates to `/connectors` route -> renders full page ConnectorsPage -> fetches connected IDs from `/api/connectors` -> renders static CONNECTORS array
  - AGI has Gmail, Notion, Slack, Linear, HubSpot, Intercom from this page
  - AGI is missing: Canva, Google Calendar (separate from Gmail&Calendar), Figma, Atlassian Rovo, monday.com, Box, Gamma, Miro
- **Flaws:**
  - [critical] Missing connectors: Canva, Google Calendar (standalone), Figma, Atlassian Rovo, monday.com, Box, Gamma, Miro are not in CONNECTORS array @ `ConnectorsPage.tsx:60-465`
  - [critical] UI is a full page not a modal overlay as shown in Claude reference @ `ConnectorsPage.tsx:988-1213`
  - [major] No Sort dropdown filter @ `ConnectorsPage.tsx:1020-1050`
  - [major] No Type dropdown filter (Claude shows "Type" filter for connector/interactive distinction) @ `ConnectorsPage.tsx`
  - [major] No Categories dropdown (Claude uses dropdown; AGI uses horizontal tab chips) @ `ConnectorsPage.tsx:1052-1069`
  - [minor] Claude shows each connector with name, type badge (e.g. "connector", "interactive"), short description, and + button; AGI shows emoji icon, name, action count, long description, Connect/Enable button
- **Visual gaps:**
  - Claude modal has X close button top-right; AGI has no close/dismiss
  - Claude connector cards are two-column grid in a scrollable modal; AGI is responsive 1-4 column grid
  - Claude connector cards show official brand logos in rounded squares; AGI uses emoji fallback for many
  - Claude shows type badges ("connector", "interactive") per card; AGI shows phase badges

---

## IMG: 02_directory_modal-page-02-vercel-granola-sentry-asana-stripe.png

- **Feature:** Page 2 showing Vercel, Excalidraw, Granola, Asana, Sentry, Indeed, Supabase, PubMed, n8n, ClickUp, Microsoft Learn, Context7, Mermaid Chart, Stripe
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/02_directory_modal-page-02-vercel-granola-sentry-asana-stripe.png`
- **Implementation status:** partial
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - AGI has Asana, Stripe from this page
  - Missing: Vercel, Excalidraw, Granola, Sentry, Indeed, Supabase, PubMed, n8n, ClickUp, Microsoft Learn, Context7, Mermaid Chart
- **Flaws:**
  - [critical] 12 of 14 connectors on this page are missing from AGI registry @ `ConnectorsPage.tsx:60-465`
  - [minor] Vercel is shown with checkmark (connected state) in Claude; AGI has a connected state but Vercel connector doesn't exist
- **Visual gaps:**
  - Vercel shows green checkmark for connected state; AGI uses green dot + "Connected" text

---

## IMG: 03_directory_modal-page-03-hugging-face-clay-ahrefs-pitchbook.png

- **Feature:** Page 3 showing Hugging Face, Fireflies, Clay, S&P Global, Ahrefs, NetSuite, Apollo.io, Webflow, ZoomInfo, Cloudflare Developer Platform, WordPress.com, PitchBook Premium, Airtable, Smartsheet
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/03_directory_modal-page-03-hugging-face-clay-ahrefs-pitchbook.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI's CONNECTORS array
  - "Airtable" is mentioned in the roadmap callout badges but has no connector entry
- **Flaws:**
  - [critical] All 14 connectors on this page are missing from AGI @ `ConnectorsPage.tsx:60-465`
  - [minor] Airtable is listed as a planned badge in roadmap callout but has no connector definition @ `ConnectorsPage.tsx:1179`
- **Visual gaps:**
  - Claude shows "connector" type badges on each; AGI has no type classification

---

## IMG: 04_directory_modal-page-04-scholar-make-snowflake-zapier.png

- **Feature:** Page 4 showing Scholar Gateway, Ramp, Make, Netlify, Snowflake, Docusign, Glean, Google Drive (connected checkmark), PDF Viewer, Google Cloud BigQuery, FactSet AI-Ready Data, GoDaddy, Morningstar, Zapier (trending)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/04_directory_modal-page-04-scholar-make-snowflake-zapier.png`
- **Implementation status:** partial
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - AGI has Google Drive from this page (shown connected in Claude)
  - Missing: Scholar Gateway, Ramp, Make, Netlify, Snowflake, Docusign, Glean, PDF Viewer, Google Cloud BigQuery, FactSet AI-Ready Data, GoDaddy, Morningstar, Zapier
- **Flaws:**
  - [critical] 13 of 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] Claude shows "Trending" badge on Zapier; AGI has no trending/popularity metadata
- **Visual gaps:**
  - Google Drive shows checkmark indicating connected in Claude; AGI shows different connected state

---

## IMG: 05_directory_modal-page-05-posthog-databricks-klaviyo-pendo.png

- **Feature:** Page 5 showing PostHog, Hex, Play Sheet Music (interactive), Vibe Prospecting, Wix, Daloopa, Databricks, Harvey, Kiwi.com, Postman, Klaviyo, Windsurf.ai, Pendo, AWS Marketplace
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/05_directory_modal-page-05-posthog-databricks-klaviyo-pendo.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
  - Claude distinguishes "connector" vs "interactive" type; AGI has no such distinction
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [major] "interactive" connector type (e.g., Play Sheet Music) not supported in AGI's type system @ `ConnectorsPage.tsx:43` (AuthType only has oauth/api_key/connection_string/pat)
- **Visual gaps:**
  - "Interactive" badge in blue on some connectors; AGI has no interactive type

---

## IMG: 06_directory_modal-page-06-similarweb-paypal-crypto-biorender.png

- **Feature:** Page 6 showing SimilarWeb, Open Targets, PayPal, Mixpanel, Crypto.com, Consensus, Three.js 3D Viewer, BioRender, Attio, Trivago, Guru, Moody's, Udemy Business, tldraw (trending)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/06_directory_modal-page-06-similarweb-paypal-crypto-biorender.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] tldraw shown with "Trending" badge; no trending metadata in AGI
- **Visual gaps:**
  - Claude shows "New" badge on some connectors (e.g., Mixpanel); AGI has no new/trending/hot badges

---

## IMG: 07_directory_modal-page-07-outreach-fellow-bitly-calendly.png

- **Feature:** Page 7 showing Outreach, Jam, Fellow.ai, Crossbeam, lastminute.com, Synapse.org, Bitly, Calendly (interactive), Base44, CData Connect AI, Circleback, Jotform, Omni Analytics, Egnyte
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/07_directory_modal-page-07-outreach-fellow-bitly-calendly.png`
- **Implementation status:** partial
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - AGI has Calendly from this page
  - Missing: Outreach, Jam, Fellow.ai, Crossbeam, lastminute.com, Synapse.org, Bitly, Base44, CData Connect AI, Circleback, Jotform, Omni Analytics, Egnyte
- **Flaws:**
  - [critical] 13 of 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [major] Calendly shown as "interactive" type in Claude; AGI has it as standard oauth CRM connector @ `ConnectorsPage.tsx:259-269`
- **Visual gaps:**
  - Calendly has "Interactive" badge in Claude; AGI shows phase badge

---

## IMG: 08_directory_modal-page-08-mt-newswires-lseg-customer-io.png

- **Feature:** Page 8 showing MT Newswires, Square, LSEG, Pylon, Bigdata.com, Mercury, Supermetrics, Honeycomb, Common Room, Customer.io, Gusto (interactive), Dice, Coupler.io, Plaid Developer Tools
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/08_directory_modal-page-08-mt-newswires-lseg-customer-io.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
- **Visual gaps:**
  - Light theme shown in this screenshot vs dark theme in others; AGI only has dark connectors page

---

## IMG: 09_directory_modal-page-09-airops-cloudinary-lunarcrush-pagerduty.png

- **Feature:** Page 9 showing AirOps, DevRev, Pigment, Learning Commons Knowledge..., Cloudinary, Workato, LunarCrush, Midpage Legal Research, Brex (trending), LegalZoom, MailerLite, Tavily (trending), Close, PagerDuty
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/09_directory_modal-page-09-airops-cloudinary-lunarcrush-pagerduty.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
- **Visual gaps:**
  - "Trending" badges on Brex and Tavily; AGI has no trending system

---

## IMG: 10_directory_modal-page-10-craft-motherduck-mem-metaview.png

- **Feature:** Page 10 showing Craft (New, Trending), Candid, Magic Patterns, Harmonic, MotherDuck, Chronograph, ActiveCampaign, Aiera, Sanity, Mem, Day AI, Metaview, Krisp (New), DirectBooker
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/10_directory_modal-page-10-craft-motherduck-mem-metaview.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
- **Visual gaps:**
  - Light theme modal in this screenshot; "New" and "Trending" badges visible
  - Claude modal has consistent rounded card design; AGI has different card layout

---

## IMG: 11_directory_modal-page-11-owkin-yardi-google-compute-clarify.png

- **Feature:** Page 11 showing Owkin, Medidata, Yardi Virtuoso, Intuit TurboTax (trending), Blockscout, PlayMCP, Aura, Melon, Clerk, Campfire, Google Compute Engine, Razorpay, Clarify, Local Falcon
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/11_directory_modal-page-11-owkin-yardi-google-compute-clarify.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
  - Note: Clerk is shown as a connector here; AGI uses Clerk for auth but not as a connector
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] Google Compute Engine shown as MCP connector in Claude; AGI has no cloud infra connectors
- **Visual gaps:**
  - Light theme modal; "Trending" badge on Intuit TurboTax

---

## IMG: 12_directory_modal-page-12-benevity-port-io-quartr-planetscale.png

- **Feature:** Page 12 showing Benevity, MSCI, Stytch, Ticket Tailor, Port.IO, PlanetScale, Lumin, Quartr (trending), Wyndham Hotels and Resorts, Sprouts Data Intelligence, SignNow, GraphOS MCP Tools, LILT, Granted (New, trending)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/12_directory_modal-page-12-benevity-port-io-quartr-planetscale.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
- **Visual gaps:**
  - PlanetScale has database-specific description; AGI has no database connector category

---

## IMG: 13_directory_modal-page-13-q2-clarity-ai-quickbooks-amplitude.png

- **Feature:** Page 13 showing Q2 (new), Airwallex Developer, Clarity AI, Benchling, Process Street, Gainsight (Staircase AI) (new), DocuSeal (new), Fever Event Discovery (trending), Intuit QuickBooks (interactive), Tango, Dremio Cloud, Jantic, pg-miguide (new), Intrapp Celeste
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/13_directory_modal-page-13-q2-clarity-ai-quickbooks-amplitude.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
  - QuickBooks is mentioned in the roadmap callout badges but has no connector definition
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] QuickBooks listed as planned badge in roadmap but no actual connector @ `ConnectorsPage.tsx:1187`
- **Visual gaps:**
  - "New" badges (green) on Q2, DocuSeal, pg-miguide; AGI has no new badge system

---

## IMG: 14_directory_modal-page-14-alayyn-cb-insights-clinical-trials.png

- **Feature:** Page 14 showing Alayyn Tax (new), DataGrail, CB Insights (new), Starburst, Vider, Amplitude (interactive), bioRxiv, ChEMBL, Clinical Trials, CMS Coverage, ICD-10 Codes, NPI Registry, Zoho Books (new), Zoho CRM (new)
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/14_directory_modal-page-14-alayyn-cb-insights-clinical-trials.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [major] Healthcare/medical connectors (Clinical Trials, CMS Coverage, ICD-10, NPI Registry, bioRxiv, ChEMBL) represent an entire vertical absent from AGI
- **Visual gaps:**
  - Amplitude has "interactive" badge; Zoho Books/CRM have "new" badges

---

## IMG: 15_directory_modal-page-15-zoho-filesystem-pdf-figma-tableau.png

- **Feature:** Page 15 showing Zoho Desk (new), Zoho Projects (new), Filesystem (MCP server), Windows-MCP, pdf-viewer (MCP server), Apify (MCP server), PowerPoint (By Anthropic), Word (By Anthropic), Desktop Commander, Control Chrome, PDF Tools - Fill, Analyze, Extract, View, Read and Send iMessages, Figma, Tableau
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/15_directory_modal-page-15-zoho-filesystem-pdf-figma-tableau.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - AGI has "local-filesystem" (similar to Claude's Filesystem MCP server)
  - AGI has Figma listed in roadmap badges but not as an actual connector
  - Missing: Zoho Desk, Zoho Projects, Windows-MCP, pdf-viewer, Apify, PowerPoint, Word, Desktop Commander, Control Chrome, PDF Tools, Read and Send iMessages, Tableau
- **Flaws:**
  - [critical] 12+ connectors missing @ `ConnectorsPage.tsx:60-465`
  - [major] Claude shows "By Anthropic" badge on PowerPoint and Word connectors, indicating first-party MCP servers; AGI has no first-party MCP server concept @ `ConnectorsPage.tsx`
  - [major] Claude's Filesystem is an MCP server type; AGI's "local-filesystem" is an "Exclusive" type with PAT auth, conceptually different @ `ConnectorsPage.tsx:400-412`
  - [minor] Figma listed as planned in roadmap badges but absent from connectors @ `ConnectorsPage.tsx:1188`
- **Visual gaps:**
  - "MCP server" type labels on Filesystem, pdf-viewer, Apify; AGI has no MCP server type distinction
  - "By Anthropic" labels; AGI has no publisher/author labels

---

## IMG: 16_directory_modal-page-16-apple-notes-control-mac-spotify.png

- **Feature:** Page 16 showing Read and Write Apple Notes, Coupler.io, Control your Mac, Spotify (AppleScript), Massive Market Data, Kubernetes MCP Server, Socket, Kapture Browser Automation, Postman MCP Server (Minimal), Drafts, Vibe Prospecting, AWS API MCP Server, Evilos MCP Server, Metabase
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/16_directory_modal-page-16-apple-notes-control-mac-spotify.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
  - AGI has "browser-automation" as Exclusive but Claude's Kapture Browser Automation is a different product
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [major] Apple-ecosystem connectors (Apple Notes, Control Mac, Spotify AppleScript) are especially relevant for AGI's mobile-first strategy but completely absent
- **Visual gaps:**
  - MCP server type labels; AGI has no such labels

---

## IMG: 17_directory_modal-page-17-b12-elevenlabs-shadcn-grafana.png

- **Feature:** Page 17 showing B12 Website Generator, Mailtrap, Zscaler MCP Server, Cloudglue, ElevenLabs Player, Microsoft Clarity, Cloudinary Asset Management, Shadcn UI, ElevenLabs Agents MCP App, Grafana MCP Server, Growtbook, Docling MCP, ToolUniverse, SAP Fiori MCP Server
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/17_directory_modal-page-17-b12-elevenlabs-shadcn-grafana.png`
- **Implementation status:** partial
- **Primary files:**
  - `apps/web/features/connectors/pages/ConnectorsPage.tsx`
  - `apps/web/features/connectors/config/connector-logos.ts`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - AGI has "elevenlabs" as a single connector; Claude shows two separate ElevenLabs entries (Player and Agents MCP App)
  - Missing: B12, Mailtrap, Zscaler, Cloudglue, Microsoft Clarity, Cloudinary Asset Management, Shadcn UI, Grafana, Growtbook, Docling, ToolUniverse, SAP Fiori
- **Flaws:**
  - [critical] 12 of 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] ElevenLabs exists as single connector in AGI but Claude has two separate entries (Player + Agents MCP) @ `ConnectorsPage.tsx:386-397`
- **Visual gaps:**
  - Claude shows individual product-line connectors per vendor; AGI bundles into single vendor entry

---

## IMG: 18_directory_modal-page-18-sapus-tomtom-fantastical-vendr.png

- **Feature:** Page 18 showing SAPUI5 MCP Server, Android-MCP, PopHIVE Public Health Data, Fantastical, MeetGeek, MCP Instana Server, Lumin, 10x Genomics Cloud, Braze MCP Server, Vendr Software Pricing Tools, TomTom Maps MCP, Tomba MCP Server, Minutes - Meeting Memory for AI, PanOS MCP
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/18_directory_modal-page-18-sapus-tomtom-fantastical-vendr.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 14 connectors exist in AGI
- **Flaws:**
  - [critical] All 14 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] Android-MCP would be relevant for AGI's mobile surface but is absent
- **Visual gaps:**
  - Consistent connector card design with icon + name + description + action button

---

## IMG: 19_directory_modal-page-19-meeting-memory-pathmode-jaz-comviso.png

- **Feature:** Page 19 (final page) showing Minutes - Meeting Memory for AI, PanOS MCP, SAP CAP MCP Server, KARP Inspector Lite, Pathmode, SAP MDK MCP Server, SignWell, Vybit Notifications, Defense.com Threat Analysis, Jaz Accounting, Dynatrace MCP Server, Conviso MCP Server, Miggo Public API MCP Server
- **Image path:** `/Users/siddhartha/Desktop/reference/ui/desktop/claude-connectors/19_directory_modal-page-19-meeting-memory-pathmode-jaz-comviso.png`
- **Implementation status:** missing
- **Primary files:** `apps/web/features/connectors/pages/ConnectorsPage.tsx`
- **API endpoints:** `/api/connectors`
- **Data flow:**
  - None of these 13 connectors exist in AGI
  - This is the last page of Claude's paginated directory
- **Flaws:**
  - [critical] All 13 connectors missing @ `ConnectorsPage.tsx:60-465`
  - [minor] Security/DevOps connectors (Defense.com, Dynatrace, Conviso, PanOS) represent enterprise vertical absent from AGI
- **Visual gaps:**
  - Final page has fewer items (not full grid); AGI has no pagination to show partial pages

---

## Cross-Image Architectural Analysis

### Connector Coverage Gap

| Source | Count |
|--------|-------|
| Claude reference (all 19 pages) | ~190 connectors |
| AGI CONNECTORS array | 32 connectors |
| AGI connector-logos.ts | 32 entries |
| AGI VALID_CONNECTOR_IDS (API allowlist) | 32 entries |
| Overlap (connectors present in both) | ~12 connectors |

**Connectors present in both AGI and Claude reference:**
Gmail, Notion, Slack, Google Drive, Linear, HubSpot, Intercom, Asana, Stripe, Calendly, ElevenLabs, Filesystem (different implementations)

**Connectors in AGI but NOT in Claude reference:**
GitHub, Google Sheets, Outlook, OneDrive, Jira, Teams, Confluence, Zoom, Salesforce, Mailchimp, Shopify, LinkedIn, Twitter/X, Discord, OpenAI, Terminal/Shell, Browser Automation, Screen Vision, Ollama, Google Analytics

**Connectors in Claude reference but NOT in AGI (sampling, ~160+ total):**
Canva, Figma, Vercel, Sentry, Granola, monday.com, Box, Miro, Gamma, Excalidraw, Indeed, Supabase, PubMed, n8n, ClickUp, Context7, Mermaid Chart, Hugging Face, Fireflies, Clay, S&P Global, Ahrefs, NetSuite, Apollo.io, Webflow, ZoomInfo, Cloudflare, WordPress, PitchBook, Airtable, Smartsheet, Snowflake, Docusign, BigQuery, Make, Zapier, PostHog, Databricks, Pendo, AWS Marketplace, PayPal, Mixpanel, Attio, Moody's, PagerDuty, Sanity, Brex, QuickBooks, Amplitude, PlanetScale, Tableau, Apple Notes, Kubernetes, Grafana, Shadcn UI, Metabase, TomTom, Dynatrace, and 100+ more

### UI/UX Architecture Differences

| Feature | Claude Reference | AGI Implementation |
|---------|-----------------|-------------------|
| Container | Modal overlay on sidebar | Full page at /connectors |
| Layout | 2-column grid in scrollable modal | Responsive 1-4 column grid |
| Pagination | 19+ server-paginated pages | No pagination (flat list) |
| Search | Integrated search bar | Integrated search bar |
| Sort | Dropdown (Sort button) | Not implemented |
| Type filter | Dropdown (Type button: connector/interactive) | Not implemented |
| Categories filter | Dropdown (Categories button) | Horizontal chip tabs |
| Status filter | Not visible (just checkmarks) | Tri-state (All/Connected/Available) |
| Connector types | connector, interactive, MCP server | oauth, api_key, connection_string, pat |
| Badges | New, Trending, Interactive, By Anthropic | Phase N, EXCLUSIVE |
| Connected state | Green checkmark on card | Separate "Connected" section with green dot |
| Add custom | Not shown in directory | "Add custom connector" button + MCP dialog |
| Card design | Icon + Name + Type badge + Description + Action | Emoji/Logo + Name + Actions count + Description + Button |
| Roadmap callout | Not present | "105+ Connectors Planned" callout |

### Data Flow Comparison

**Claude's flow:**
1. User clicks "Connectors" in settings sidebar
2. Modal overlay opens with paginated connector directory
3. Server returns page of connectors with metadata (type, badges, connected state)
4. User can search, filter by sort/type/categories
5. User clicks + to connect; clicks checkmark to manage connected ones

**AGI's flow:**
1. User navigates to `/connectors` route
2. `ConnectorsPage` renders with static CONNECTORS array (32 items)
3. `useEffect` fetches `/api/connectors` for connected state from Supabase `user_connectors` table
4. User can search text, filter by category tabs, filter by status
5. Connect button calls POST `/api/connectors` (with CSRF token); optimistic UI update
6. Disconnect via DELETE `/api/connectors?connectorId=X`

### connector-logos.ts Coverage

Entries in `connector-logos.ts` that have matching CONNECTORS entries: **All 32** (gmail, google-drive, notion, slack, github, google-sheets, outlook, onedrive, linear, jira, teams, confluence, asana, zoom, hubspot, salesforce, calendly, intercom, google-analytics, mailchimp, stripe, shopify, linkedin, twitter, discord, openai, elevenlabs, local-filesystem, terminal, browser-automation, screen-vision, ollama)

Logos using external CDN URLs (may break): gmail, google-drive, notion, slack, github, google-sheets, outlook, onedrive, linear, jira, teams, confluence, asana, zoom, hubspot, salesforce, calendly, intercom, google-analytics, mailchimp, stripe, shopify, linkedin, twitter, discord, openai, elevenlabs (27 entries)

Logos using local `/icons/` paths: local-filesystem, terminal, browser-automation, screen-vision, ollama (5 entries, all verified to exist in `apps/web/public/icons/`)

### API Allowlist Sync

`VALID_CONNECTOR_IDS` in `route.ts` matches exactly the 32 IDs in the `CONNECTORS` array in `ConnectorsPage.tsx`. No drift detected.

---

## Consolidated Flaw Summary

### Critical (5)

1. **~160 connectors missing from registry** - Claude shows ~190 connectors; AGI has 32. The vast majority of real-world integrations (Vercel, Sentry, Figma, Zapier, Make, Snowflake, etc.) are absent. @ `ConnectorsPage.tsx:60-465`
2. **No pagination system** - Claude paginates across 19 pages; AGI renders all 32 as a flat list. Cannot scale to 190+ without pagination. @ `ConnectorsPage.tsx:903-916`
3. **UI is full page, not modal** - Claude opens the directory as a modal overlay from the sidebar; AGI has a full-page route. @ `apps/web/app/connectors/page.tsx`
4. **No dynamic connector registry** - All connectors are hardcoded in a client-side array. No server-side connector registry, no API to list available connectors. @ `ConnectorsPage.tsx:60-465`
5. **No connector type system** - Claude has "connector", "interactive", "MCP server" types with visual badges. AGI has only auth types. @ `ConnectorsPage.tsx:43`

### Major (5)

1. **No Sort filter** - Claude has Sort dropdown; AGI has none. @ `ConnectorsPage.tsx:1020-1050`
2. **No Type filter** - Claude has Type dropdown (connector/interactive); AGI has none. @ `ConnectorsPage.tsx`
3. **No Categories dropdown** - Claude uses dropdown for categories; AGI uses chip tabs (less scalable for many categories). @ `ConnectorsPage.tsx:1052-1069`
4. **No "By Anthropic"/publisher labels** - Claude marks first-party connectors; AGI has no publisher metadata. @ `ConnectorsPage.tsx:46-58`
5. **Healthcare/enterprise verticals absent** - Clinical Trials, CMS Coverage, ICD-10, SAP, Dynatrace, etc. represent entire missing verticals. @ `ConnectorsPage.tsx:60-465`

### Minor (7)

1. **No Trending/New badges** - Claude shows "Trending" and "New" badges on connectors; AGI has none. @ `ConnectorsPage.tsx:46-58`
2. **External CDN logo URLs may break** - 27 of 32 logos use external URLs (Wikipedia, Google, etc.) that could change. @ `connector-logos.ts:18-161`
3. **ElevenLabs single vs dual entries** - Claude has ElevenLabs Player and ElevenLabs Agents MCP App; AGI has one. @ `ConnectorsPage.tsx:386-397`
4. **Airtable/QuickBooks/Figma in roadmap badges but no connectors** - Listed as planned but no entry exists. @ `ConnectorsPage.tsx:1177-1201`
5. **Connected state visual differs** - Claude uses checkmark on card; AGI uses separate section with green dot. @ `ConnectorsPage.tsx:764-772`
6. **No MCP server type distinction** - Claude shows many MCP server connectors; AGI's MCP directory page is minimal (6 entries). @ `apps/web/app/connectors/mcp-directory/page.tsx:12-49`
7. **Test coverage limited** - 15 tests cover basic rendering/filtering but no pagination, sort, type filter, or connector registry tests. @ `ConnectorsPage.test.tsx`

### Cosmetic (2)

1. **Card layout differs** - Claude's compact two-column modal cards vs AGI's larger responsive grid cards. @ `ConnectorsPage.tsx:698-834`
2. **Light/dark theme inconsistency** - Some Claude reference screenshots show light theme modal; AGI connectors page is dark-only. @ `ConnectorsPage.tsx:990`
