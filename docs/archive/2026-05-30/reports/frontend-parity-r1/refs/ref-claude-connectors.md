# Claude Connectors & Enterprise Admin Reference

**Image set covered**:

- `/Users/siddhartha/Desktop/reference/ui/claude/claude-connectors-directory/` — 19 pages (01–19)
- `/Users/siddhartha/Desktop/reference/ui/claude/claude-desktop/14_settings-connectors-web-integrations.png`
- `/Users/siddhartha/Desktop/reference/ui/claude/claude-desktop/36_plans-pricing_team-enterprise-plans.png`

**Total images read**: 21 images

---

## Mislabel report

None found. Filenames accurately reflect content (directory pages numbered sequentially, settings integrations labeled, pricing/plans labeled).

---

## Per-competitor pattern inventory

### Claude Desktop / Claude.ai Connectors Directory

#### 8. CONNECTORS / TOOLS / SKILLS

**Directory/Gallery Grid**

- Modal dialog spanning ~60% of viewport width, dark theme background
- Header: "Connectors" title with subtitle "Connect Claude to your apps, files, and services. Connectors are built by third parties and reviewed by Anthropic for safety. You can also add a custom connector."
- Top controls: Search input + Sort dropdown ("A-Z" default) + Type filter (dropdown) + Categories filter (multi-select chips)
- Grid layout: 2 columns, each card shows small icon + integration name + 1-2 line description + action button (either "+" for connect/install or "Configure" for already-connected)
- Card styling: dark backgrounds with icon in top-left, text on right, button on far right
- Categories visible: Research/Insight, Communication, File/Data Management, Business Tools, Developer Tools, local file system, PDF, Figma, data analytics (Tableau, Snowflake, etc.)
- Pagination: pages show ~16–20 integrations per page, sequential navigation implied (19 pages total)

**Integration Categories Observed** (across all 19 pages):

- **Communication**: Gmail, Slack, Notion, Airtable, HubSpot, Intercom, Customer.io
- **File/Cloud Storage**: Google Drive, Figma, Apple Notes, local filesystem, PDF tools
- **Data/Analytics**: Tableau, Snowflake, Databricks, PostHog, Amplitude, Google Cloud BigQuery, Metabase
- **Task/Project Management**: Asana, Zapier, Make, Notion, Trello
- **Business/Finance**: Stripe, QuickBooks, Paypal, Zoom, Calendly, HubSpot
- **Research/Knowledge**: Ahrefs, Hugging Face, Clay, Scholar, Perplexity, Metaphor
- **Dev Tools**: Vercel, Sentry, GitHub, GitLab, Supabase, PlanetScale, Railway
- **AI/ML Tools**: Hugging Face, Elevenlabs, Claude API, OpenAI integrations
- **Monitoring/Ops**: PagerDuty, Grafana, Datadog, Sentry, Honeycomb
- **Specialized**: Biorender (scientific), Clinical Trials databases, Yardi (real estate), Zoho suite (CRM, analytics, mail, etc.)
- **Content/Media**: Spotify, Apple Music, Canva, Cloudinary, Figma, Lunarcrush (social/media analytics)

**Detail View Patterns**:

- No dedicated detail/configuration screens visible in image set; detail is inferred from cards showing "Configure" vs "+" buttons
- Connected integrations show "Configure" or three-dot menu, implying per-integration permission toggles exist downstream (not shown)

**OAuth/Permission Flow Signals**:

- Connected state indicated by "Connected" label or "Configure" button
- Tooltip/inline help visible: "You can also add a custom connector" — implies user can extend beyond the directory
- No OAuth modal visible in connectors-directory images; inferred from "Connected" state badge

#### 9. SETTINGS

**Connectors Subsection**:

- Located in left-nav under "Settings" > "Connectors"
- Main panel shows header "Connectors have moved to Customize. Head to the new Customize page to manage your skills and connectors." with CTA "Go to Customize"
- Fallback table: list of connected integrations (Google Drive, GitHub Integration, Airtable, Gmail, Vercel, Google Calendar, Notion, Apty)
- Per-row action: "Connected" status badge + three-dot menu (for disconnect/options)
- Per-row action alternative: "Configure" button for unconfigured services
- "Browse connectors" CTA links to the Connectors directory modal

#### 13. ADMIN / ENTERPRISE

**Team & Enterprise Plans**:

- Modal title: "Plans that grow with you"
- Tabs: "Individual" (selected) | "Team and Enterprise"
- **Team Plan** (5–100 users):
  - "Standard seat": $20/mo — "All Claude features, plus more usage than Pro" + "$42/mo when billed monthly" (yearly discount implied)
  - "Premium seat": $100/mo — "Includes unlimited requests" + "$150/mo when billed monthly"
  - Feature bullets: 300K context window, Extra usage available at API rates, Claude Code, Centralized billing and administration, Single sign-on (SSO) and domain capture, SCIM provisioning for user management, Custom contract terms, Enterprise deployment for the Claude desktop app, Enterprise search across your organization, Connect Microsoft 365, Slack, and more, No model training on your content by default
- **Enterprise Plan** (20+ users):
  - "Flexible pooled usage"
  - Feature bullets: All Team features plus: Pay-as-you-go pricing across your organization, Set user and org spend limits, OIDC federated identity management (IdM), Role-based access with fine-grained permissions, System for Cross-Domain Identity Management (SCIM), Compliance API for observability and monitoring, Network-level access controls, Custom data retention controls, IP allowlisting, Google Docs cataloging
  - CTA: "Get Enterprise plan" with text "A work email address is required to create an enterprise account"

**Pricing Tier Strategy**:

- Individual: implied cheaper than Team
- Team Standard: $20/mo per seat + fixed overage rates
- Team Premium: $100/mo per seat for unlimited
- Enterprise: custom pricing, OIDC/SCIM/API/audit emphasis (compliance + control play)
- Year = ~17% discount vs monthly (per MEMORY)

---

## Standout patterns worth copying

1. **Dual-list + directory pattern** — Settings page shows connected integrations in a simple list (name + status + menu), while a "Browse connectors" CTA gates access to the full modal gallery. This avoids clutter: settings = "what I have", connectors directory = "what I can add". (`14_settings-connectors-web-integrations.png`)

2. **2-column grid in connectors modal** — Compact 2-col layout fits ~16–20 integrations per page without overwhelming; pagination is lightweight (sequential pages). Icon + name + description fit in one card; action button (+ or Configure) is clear and right-aligned. (`01–19_directory_modal-page-*.png`)

3. **Search + Sort + Type + Categories multi-filter** — Single search input (for name-based lookup) + Sort dropdown (A-Z or relevance) + Type filter + Categories chips allow discoverability without drowning in 100+ integrations. Multi-select Categories is particularly elegant: user can filter by "Communication" or "Analytics" to narrow the field. (`01_directory_modal-page-01...png`)

4. **Connected state badges + Configure button** — "Connected" label on card or status text signals which integrations are already active. "Configure" button implies per-integration permission management, but doesn't force a detail modal: users can drill in only if they need to adjust. (`14_settings-connectors-web-integrations.png`)

5. **Feature matrix in Team/Enterprise pricing** — Checkmarks and feature descriptions (not just pricing tables) show what each tier unlocks: Standard seat = base features, Premium = unlimited, Enterprise = compliance/SCIM/audit. This reduces sales-eng friction and sets clear expectations. (`36_plans-pricing_team-enterprise-plans.png`)

6. **Custom connector mention in UI** — "You can also add a custom connector" in the modal subtitle signals extensibility without requiring a separate "Build your own" section. Lowers friction to user-driven integrations. (`01_directory_modal-page-01...png`)

7. **Recognize that admin/enterprise is NOT a separate app** — Team & Enterprise plans are presented as modal upgrades in the billing/pricing section, not as a separate admin dashboard. This keeps the surface count low and frames enterprise as an "upsell tier" rather than a parallel product. (`36_plans-pricing_team-enterprise-plans.png`)

8. **No explicit "permission toggles" UI in the screenshots** — Permissions are implied to live in per-integration config views (accessible via "Configure" button). This keeps the main directory uncluttered; advanced users drill down, casual users see only what they need. (Inverse pattern: don't jam 20 toggles into the card itself.)

---

## Anti-patterns or design choices to avoid

1. **Mixing "Browse" and "Manage" tabs** — Claude uses two separate affordances (Connectors directory modal + Settings > Connectors list) rather than tabbing between "Installed" and "Browse." This is good (clear separation). Avoid putting them in one tab-pair where users flip back and forth. (`14_settings-connectors-web-integrations.png` vs `01–19_directory_modal-page-*.png`)

2. **Overloading the connectors modal with per-connector toggles** — Claude shows simple "+ / Configure" buttons, not inline toggles for scopes/permissions. Avoid a 100-row list of "Gmail: [read] [write] [calendar access]" toggles—that's overwhelming. Drill-down detail views are cleaner. (`01–19_directory_modal-page-*.png`)

3. **Enterprise as a separate UI shell** — Claude doesn't have a separate "Team Admin Dashboard." Team/Enterprise is presented as a pricing tier in the main billing modal. Avoid creating a parallel `admin.claude.ai` — keep it inside the product. (`36_plans-pricing_team-enterprise-plans.png`)

4. **Pagination abuse** — 19 pages of connectors is on the edge of "too many to browse." Claude mitigates this with strong search + type + categories filters. If building an integrations directory, budget for search parity from day 1 (not "we'll add search later"). (`01–19_directory_modal-page-*.png`)

5. **No per-organization settings visible** — The Enterprise plan describes "organization-wide model availability" and SCIM, but no org-settings UI is shown. Avoid shipping Team features without org-scoped configuration UI; otherwise, policies aren't enforceable. (Not shown in images; deduced gap.)

---

## Summary for surface engineers

**What to implement on AGI Workforce (all surfaces that support integrations)**:

- **Connectors directory** (modal or drawer): 2-col grid, search + sort + type + category filters, ~50–100 integrations initially
- **Settings > Connectors** (or "Integrations"): simple list of connected services, "Browse" CTA, per-integration status + menu
- **Detail/Configure view**: OAuth flow, permission toggles, API key entry (for BYOK integrations), disconnect CTA
- **Team/Enterprise pricing page**: feature matrix in modal form (don't require separate admin dashboard)
- **Custom connector mention**: Inline text in the directory header ("You can also add a custom connector")

**Out of scope for Mobile / CLI / Extension** (likely):

- Admin/enterprise is Desktop + Web + possibly Mobile (if team accounts ship on mobile)
- CLI doesn't show pricing/billing UI
- Chrome extension probably shows simplified integrations (e.g., "Which integrations can I use in Gmail?")
