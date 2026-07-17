# SEO / GEO / AEO Plan

Status: Current
Owner: Web + growth
Last updated: 2026-07-08

This plan covers three overlapping disciplines for the AGI marketing site (`apps/web`):

- **SEO** — traditional search indexation and ranking (Google, Bing).
- **GEO** — generative-engine optimization: being cited by AI answer engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, Apple Intelligence, Meta AI).
- **AEO** — answer-engine optimization: structuring pages so a machine can lift a correct, self-contained answer.

It is grounded in three skills, cited where their guidance is applied:

- `.agents/skills/seo-geo` — combined technical SEO + AI-visibility workflow.
- `.agents/skills/ai-seo` — structure/authority/presence for AI answer engines.
- `.agents/skills/programmatic-seo` — scaled page systems with uniqueness gates.

Non-negotiable: every claim on a public page must be honest and match the product's live availability (source: `docs/current/source-of-truth.md`). Local and BYOK are free; managed cloud is **public alpha, open by default** (not invite/waitlist); Team and Enterprise are the only early-access tiers. Do not assert compliance, availability, or pricing the repo cannot prove.

---

## 1. What shipped in this pass (applied)

Per `seo-geo` step 3 (separate technical findings from AI-visibility findings), the technical foundation was rebuilt first.

### Shared metadata helper

- `apps/web/lib/seo/site.ts` — single source of truth for origin, brand, social profiles, and the Open Graph image (`/app-preview.png`, **1024×665** — the file's real size; the old `1200×630` assertion described an image that does not exist).
- `apps/web/lib/seo/metadata.ts` — `buildMetadata({ title, description, path, ... })`. Emits a **complete** per-page `openGraph` + `twitter` block plus a page-specific canonical.
  - Root-cause fix: Next.js does not derive `og:title` from `title`, and does not deep-merge a child page's `openGraph` into the layout's. Public pages that set only `title` + `alternates.canonical` therefore inherited the layout's entire Open Graph object — the **home share card** — so they unfurled as the homepage on social and in AI answer engines.
- Migrated **63** uniform public pages (`about`, `byok`, `local`, `providers`, `features/*`, `use-cases/*`, `docs`, legal/company pages, …) from bare `title/description/canonical` to `buildMetadata`.
- Corrected the share-image dimensions in the **root layout** and **14** co-located marketing `layout.tsx` files (which already carried curated per-page OG copy but asserted the wrong `1200×630`).

### Crawl + indexation

- `apps/web/app/sitemap.ts` — all indexable public routes (~73), including `/faq`, `/features/*`, `/apps`, `/skills`, `/get-started`, `/connectors`, `/plugins`, company/legal. Excludes auth, authenticated app, redirect, and noindex routes.
- `apps/web/app/robots.ts` — disallows authenticated app routes (`/chat`, `/settings`, `/billing`, `/projects`, `/user`, `/customize`, plus `/api`, `/admin`, `/auth`). Kept in lockstep with the sitemap (nothing disallowed is listed).

### AI answer-engine access (`ai-seo` step 4: are crawlers intentionally allowed/blocked?)

`robots.ts` explicitly **allows** the answer-engine and training crawlers we want AGI cited by: `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `Perplexity-User`, `Google-Extended`, `Applebot-Extended`, `Meta-ExternalAgent`. `CCBot` (Common Crawl) stays **blocked** to avoid a blanket opt-in to third-party training sets.

### Machine-readable product brief

- `apps/web/public/llms.txt` and `apps/web/public/llms-full.txt` — honest product description mirroring the live pages: three trust modes, 10+ providers, six surfaces, public-alpha managed cloud, July 12 2026 launch target.

### Structured data (`ai-seo` step 3: definitions, comparison tables, citations)

- `apps/web/lib/seo/structured-data.ts` + `apps/web/components/seo/JsonLd.tsx` (CSP-nonce-aware via `x-nonce`):
  - **Organization**, **WebSite** (deliberately **no `SearchAction`** — the only search is authenticated in-app, not a public endpoint), **SoftwareApplication** — site-wide in the root layout.
  - **FAQPage** on `/faq` (built from the page's own Q/A array).
  - **BreadcrumbList** on `/faq`, `/blog`, every `/features/*` and `/use-cases/*` detail page.
  - **CollectionPage** on `/blog`.
  - **Article** builder exists for `/blog/[slug]`. NOTE: `/blog/[slug]` currently `notFound()`s (no posts published), so the builder is intentionally unwired until the first post ships.

### Verification

`apps/web/app/__tests__/seo.test.ts` asserts the discriminating facts: per-page `og:title` ≠ home, `1024×665` image, correct canonical, each AI bot allowed, `CCBot` blocked, app routes disallowed, sitemap includes/excludes the right routes, and WebSite carries no `SearchAction`.

---

## 2. Keyword & entity map

Primary entity: **AGI** (brand) / **AGI Workforce** (platform), by **AGI Automation LLC**. Supporting entities and the pages that own them:

| Entity / concept             | Owner page                                                              | Primary query intent                                                        |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Multi-provider AI workspace  | `/`, `/providers`                                                       | "AI workspace multiple models", "switch AI models mid-conversation"         |
| BYOK (bring your own key)    | `/byok`                                                                 | "bring your own API key AI", "AI no markup provider keys"                   |
| Local / on-device AI         | `/local`                                                                | "run AI locally", "offline AI Ollama LM Studio"                             |
| Managed cloud (public alpha) | `/pricing`, `/waitlist`                                                 | "AGI cloud pricing", "hosted AI managed"                                    |
| Surfaces                     | `/desktop`, `/mobile`, `/cli`, `/chrome-extension`, `/vscode-extension` | "AI desktop app", "AI CLI agent", "AI VS Code extension"                    |
| Workspace features           | `/features` + `/features/*`                                             | "AI artifacts", "AI deep research citations", "AI memory", "MCP connectors" |
| Trust / privacy              | `/security`, `/trust`, `/privacy`                                       | "private AI", "AI that doesn't train on my data"                            |
| Use cases                    | `/use-cases/*`                                                          | "AI for consulting/startups/sales/IT"                                       |
| FAQ / definitions            | `/faq`                                                                  | "does AGI train on my data", "can I run AGI offline"                        |

Entity reinforcement (`ai-seo` "authority"): Organization + SoftwareApplication JSON-LD, consistent `sameAs` profiles, and one canonical per concept (no duplicate `privacy` / `privacy-policy` both indexed — the latter redirects).

---

## 3. Programmatic-SEO systems (`programmatic-seo`)

Five scaled page systems. Per the skill's boundary, **none should be bulk-published until its uniqueness gate and indexation plan are met**. Each system below names its URL pattern, hub, required unique value, source data, and the uniqueness gate that blocks thin/duplicate pages.

### 3.1 Comparison pages — `AGI vs <competitor>`

- **URL**: `/compare/agi-vs-<slug>` · **Hub**: `/compare`
- **Unique value**: an honest, side-by-side capability table (trust modes, provider choice, BYOK markup, local support, surfaces) plus a "when to pick which" paragraph. Not a takedown.
- **Source data**: verified competitor facts (re-verify before publish — competitor pricing/features move); AGI facts from `source-of-truth.md`.
- **Uniqueness gate**: ≥1 comparison table with ≥6 rows of _substantive difference_ and ≥120 words of original prose per page; reject if the table is >70% identical to another comparison.

### 3.2 Glossary pages — AI/agent terms

- **URL**: `/glossary/<term>` · **Hub**: `/glossary`
- **Unique value**: a direct one-sentence definition (AEO-ready), then how the term works _in AGI_, with a short example. Feeds FAQPage/DefinedTerm structured data.
- **Source data**: canonical definitions; AGI implementation from the feature pages.
- **Uniqueness gate**: definition + product-specific section + example, each non-empty; reject stub pages that only define the term with no AGI-specific content.

### 3.3 Provider pages — one per model provider

- **URL**: `/providers/<provider>` · **Hub**: `/providers`
- **Unique value**: what using this provider through AGI looks like (BYOK vs managed, which surfaces, local vs cloud), models available (IDs from the canonical catalog, never invented), and provider-specific setup.
- **Source data**: `packages/contracts/types/src/models.json` + provider capability metadata + `docs/current/byok-open-model-provider-strategy.md`.
- **Uniqueness gate**: model list must resolve from the catalog at build time; reject if a provider has no catalog entry (prevents fabricated availability).

### 3.4 Connector / integration pages — one per MCP server / OAuth app

- **URL**: `/connectors/<connector>` · **Hub**: `/connectors`, `/connectors/mcp-directory`
- **Unique value**: what the connector does, which tools it exposes, the permission model (every call reviewed), and a concrete task example.
- **Source data**: the connector registry; do not list connectors that are not actually wired.
- **Uniqueness gate**: real tool list + permission scopes per page; reject placeholder "coming soon" entries from the indexed set (they may live on the hub, `noindex`).

### 3.5 Persona / use-case pages — role × workflow

- **URL**: `/use-cases/<persona>` · **Hub**: `/use-cases`
- **Unique value**: the persona's actual workflow (research → draft → review), which AGI features and trust mode fit, and a realistic before/after. Extends the four use-case pages already shipped.
- **Source data**: real workflows; customer proof once permission exists (`/customers` is currently honest-empty).
- **Uniqueness gate**: distinct workflow steps + feature mapping per persona; reject pages that only swap the persona noun.

Cross-cutting indexation plan: every system gets a hub page, hub↔leaf internal links, sitemap inclusion, and a canonical per leaf. Redirect-only slug variants stay out of the sitemap.

---

## 4. AI-visibility checklist (`ai-seo` structure / authority / presence)

**Structure**

- [x] Pages answer their target question directly with clear headings.
- [x] FAQ uses Q-as-heading + concise answer; FAQPage JSON-LD emitted.
- [x] Definitions and comparison tables are machine-liftable (glossary/compare systems specced).
- [x] Canonical per concept; no duplicate-content twins indexed.

**Authority**

- [x] Organization + SoftwareApplication JSON-LD with consistent `sameAs`.
- [x] Honest, dated claims (no fabricated availability/compliance badges).
- [ ] Third-party citations / backlinks (growth workstream, not code).

**Presence**

- [x] AI crawlers explicitly allowed in `robots.ts`; `CCBot` blocked.
- [x] `llms.txt` + `llms-full.txt` published with honest product brief.
- [x] Sitemap complete and lockstep with robots.
- [ ] Post-deploy: validate rich results (Google Rich Results Test), re-check OG unfurls (Slack/X/LinkedIn), and confirm the pages are being fetched by GPTBot/ClaudeBot/PerplexityBot in logs.

Do not invent platform citation rates or crawler behavior (`ai-seo` boundary): the checklist tracks what we control, not promised outcomes.

---

## 5. Applied vs. next

**Applied (this pass)**: shared metadata helper + 63-page migration; OG image dimensions corrected site-wide; complete sitemap; robots with AI-crawler allowlist + app-route disallow; `llms.txt` / `llms-full.txt`; Organization / WebSite / SoftwareApplication / FAQPage / BreadcrumbList / CollectionPage JSON-LD; `Article` builder ready for the first blog post; `seo.test.ts`.

**Next (not in this pass)**:

1. Build the five programmatic systems behind their uniqueness gates (comparison, glossary, provider, connector, persona), hubs first.
2. Publish blog posts and wire the `Article` builder into `/blog/[slug]` (currently 404).
3. Add `DefinedTerm` / `HowTo` structured data where glossary and setup pages warrant it.
4. Post-deploy validation loop (rich results, OG unfurls, crawler-fetch confirmation in logs).
5. Off-site authority: citations and backlinks (growth, not code).
