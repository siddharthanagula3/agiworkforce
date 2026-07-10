# AGI Workforce Web — Public Pages Mock-Data + Redesign Inventory

READ-ONLY inventory. No files changed. Repo: /Users/siddhartha/Desktop/agiworkforce
Date: 2026-07-10. Scope: 105 public/marketing `apps/web/app/**/page.tsx` (excludes `(app)`, /chat, /settings, /projects, /admin, /api, /dev/\*).

## Headline verdict

The site is **unusually honest** for a pre-launch product. There are **no fake testimonials, no fabricated customer names/logos, no "trusted by" rows, no invented press mentions, no fake team bios, no fake job listings, no Lorem placeholder text, and no fabricated user/revenue stats** on any marketing page. Multiple pages are actively anti-fake (customers, careers, download, trust, status, resources explicitly refuse placeholders). The real problems are a different class:

1. **Availability contradictions** — "Coming soon" surfaces simultaneously pitched as usable "today"; managed Cloud described as both pre-launch and live public-alpha depending on the page.
2. **Stale gating copy** contradicting the public-alpha-open decision (auth/device Pro/Max wall; api-docs "API waitlist").
3. **A few staged/placeholder data blocks** — invented plugin catalog with latent fake download counts, an MCP "directory" of 6 rows all linking one repo, a publicly-reachable QA harness full of fabricated chat content.
4. **buildathon/page.tsx** — the one page with hard, self-graded, internally-contradictory metrics.
5. **Legal hygiene** — company address differs across legal docs; SLA promises contractual uptime/credits for an unlaunched service.

All "10+ providers / 50+ models" numbers trace to `apps/web/lib/marketing-constants.ts` with documented derivations — defensible, not fabricated. No pages are obviously mobile-broken; the shared `agi-*` design system uses `clamp()` fluid spacing and responsive grids throughout.

---

## Category wave plan (counts + worst offender per category)

| #   | Category                                                                                                                           | ~Count | Worst mock/honesty offender                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| a   | Core product (home / surfaces / features hub / plugins / gallery)                                                                  | 25     | `cli/page.tsx` "ships … today" vs "isn't distributed yet"; `features/plugins/data/plugins.ts` fake downloadCounts               |
| b   | Company (about/careers/blog/customers/contact/press/changelog/buildathon/community) + solutions/teams/business/enterprise/partners | 26     | `buildathon/page.tsx` conflicting self-graded metrics                                                                           |
| c   | Legal / policy / trust                                                                                                             | 17     | Company address conflict (Austin TX vs Sheridan WY); SLA contractual commitments pre-launch                                     |
| d   | Docs / reference / auth / connectors / misc                                                                                        | 33     | `qa-artifacts/page.tsx` public fake-chat harness; `auth/device` stale Pro/Max wall; `connectors/mcp-directory` placeholder rows |
| e   | Use-cases (programmatic SEO)                                                                                                       | 6      | Clean — all capability copy, zero fabricated outcomes                                                                           |
| f   | Feature detail pages                                                                                                               | (in a) | Clean                                                                                                                           |

Feature-detail pages counted under (a). Redirect-only aliases counted in their category.

---

## Top 15 worst mock-data / credibility offenders (pre-launch risk-ranked)

1. **`app/qa-artifacts/page.tsx:1-99`** — DEV-ONLY QA harness, **publicly routable with no auth**, renders fully fabricated assistant reasoning, a fake tool timeline ("Web search", "execute_code", "write_file" with fake durations, lines 46-79), and fake web-search source cards (developer.mozilla.org, web.dev, lines 80-99) inside the real chat UI. Header says "Delete after QA" (line 7) — never done. Fabricated agent output in the production shell.

2. **`app/buildathon/page.tsx:22-42`** — Founder profile with hard, unverifiable, **internally contradictory** metrics: `CURRENT_PROOF` says "4,764 contributions" / "594 problems solved, including 252 hard" (lines 22-23); `RAW_ANALYSIS` says "4,766 commits/year" / "563 LeetCode problems solved" / "240 LeetCode hard" (lines 32, 39-40) — same facts, different numbers. Plus fabrication-flavored "100/100 GitHub ownership authenticity" (line 38) and "No fraud flags detected" (line 42).

3. **`app/auth/device/page.tsx:185-186`** — "Running models on AGI Cloud requires a **Pro or Max plan**. Upgrade to Pro or Max →" — directly contradicts the public-alpha-open reality asserted on faq, help, login, signup, status, waitlist. Stale gating copy that would mislead a user at the device-approval step.

4. **`app/connectors/mcp-directory/page.tsx:14-51`** — `FEATURED_MCPS` is a hardcoded 6-entry "directory" (Filesystem, GitHub, Postgres, Brave Search, Slack, Puppeteer) all tagged `'official'`, where **every `url` is the same generic repo** `github.com/modelcontextprotocol/servers` (lines 20,25,30,35,40,45). Presented as a browsable directory; it is a static placeholder.

5. **`features/plugins/data/plugins.ts:17,30,43,56`** — Fabricated `downloadCount` metrics (4820 / 7310 / 3150 / 2670) on 4 entirely invented marketplace plugins (GitHub Automation, Calendar Assistant, Research Pack, CRM Sync). Not currently rendered, but staged fake install-counts one edit from display; the invented plugins ARE rendered by `app/plugins/page.tsx` and `plugins/[id]/page.tsx`.

6. **`app/cli/page.tsx:137` + `:96` vs `:214`** — "Everything below ships in the agi binary **today**" and present-tense "The agi binary is a Rust developer agent" contradict "The agi binary **isn't distributed yet**" (line 214) and the page's own "coming soon" eyebrow (line 87). Pre-launch page claiming it ships today.

7. **Systemic "Coming soon" vs "use it now" contradiction** — `marketing-constants.ts:34-48` marks all six surfaces "Coming soon" and `LAUNCH.date = July 12, 2026`, yet `page.tsx:67,318` ("Try AGI Web" → live `/chat`; "AGI Mobile runs today"), `get-started/page.tsx:33,73` ("Try AGI Web … today"), `status/page.tsx:155-159`, and `privacy/page.tsx:84-86` describe Web/Cloud as live now. Reconcilable via managed-cloud alpha, but the Web card's "Coming soon" badge reads as false.

8. **Cross-page MCP-transport inconsistency** — `integrations/page.tsx:94` says SSE + streamable HTTP are "planned," while `cli/page.tsx:58` and `desktop/page.tsx:189` present all three transports as already shipped. Contradictory availability for the same feature.

9. **Company legal address conflict** — `privacy/page.tsx:224` and `terms/page.tsx:162` say "AGI Automation LLC, Austin, Texas, USA"; `mobile/legal/page.tsx:281-282` says "1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801" (a registered-agent/virtual-office address). Same entity, two principal addresses across legal docs.

10. **`app/sla/page.tsx:40-104`** — Publishes 99.9% monthly uptime targets, a service-credit schedule, and tiered response times (48h/24h/12h/8h/4h) — enforceable contractual commitments for a service the constants mark pre-launch. Not fake uptime history, but promises SLAs before the service is live.

11. **`app/shared/[id]/page.tsx` vs `app/share/[token]/page.tsx`** — Two parallel, divergent share systems (UUID-v4 via `/api/shared` vs 24-char token via `shared_sessions` Neon table, different renderers). Redundant; unclear canonical. Redesign should collapse to one.

12. **`app/api-docs/page.tsx:47-54`** — Hardcoded "open with the July 12 release" (stale in 2 days) and CTA "Join API waitlist →" pointing at `/waitlist`, which is now scoped to Team/Enterprise only — mismatched CTA.

13. **`app/subprocessors/page.tsx:15`** — First subprocessor row is an anonymized placeholder-style name "Managed database and auth platform" while every other row names the real vendor (Vercel, Fly.io, Stripe, Resend, Cloudflare). Vague for a legal disclosure Enterprise DPAs reference.

14. **`app/gallery/layout.tsx:6`** — Metadata "Real examples … from real users" while the gallery's `INSPIRATION` items (`GalleryClient.tsx:23-170`) are hardcoded demo artifacts, not user-generated. Mild overclaim; in-page UI honestly labels them "Inspiration."

15. **`app/faq/page.tsx:17` provider-count enumeration** — "eleven providers … nine first-party cloud APIs … two local runtimes," but `BYOK_PROVIDERS` lists 12 entries (adds Mistral/Groq/OpenRouter). Curated subset, not the full wired set — minor inconsistency vs the source list and `marketing-constants.ts:156` (`providers.count = 10`).

---

## Per-page detail

### (a) Core product / surfaces / features hub (25)

- **`page.tsx`** (home) — Mock: clean. Honesty: Web surface badged "Coming soon" (line 121) but hero "Try AGI Web" (line 67) → live `/login?redirectTo=/chat`; "AGI Mobile runs today" (line 318). See offender #7.
- **`agi-code/page.tsx`** — Dev CLI+VSCode overview. Clean. Honesty consistent ("developer preview").
- **`agi-work/page.tsx`** — Desktop scheduled-work mode. Clean.
- **`ai-skills/page.tsx`** — redirect → `/skills?tab=agents`. No content.
- **`apps/page.tsx`** — auth-gated redirect. No marketing content.
- **`byok/page.tsx`** — BYOK. Clean; `BYOK_PROVIDERS` real. Managed cloud correctly "public alpha, open by default" (line 173).
- **`local/page.tsx`** — Local mode. Clean; `<your-model>` placeholders honest.
- **`download/page.tsx`** — Coming-soon hub. **Strongest page** — every surface "Coming soon"; explicitly "No placeholder download links, no fake availability badges" (line 196). Minor: Web card routes to live `/chat` (line 93).
- **`downloads/page.tsx`** — redirect → `/download`.
- **`get-started/page.tsx`** — Onboarding. Clean. "Try AGI Web … today" (line 33) reinforces web live-vs-coming-soon tension.
- **`customize/page.tsx`** — redirect → `/chat`.
- **`gallery/page.tsx` / `GalleryClient.tsx`** — Artifact gallery. `INSPIRATION` (lines 23-170) are curated demos, honestly labeled in UI; but `layout.tsx:6` metadata "from real users" is a mild overclaim (offender #14).
- **`marketplace/page.tsx`** — redirect → `/apps`.
- **`plugins/page.tsx`** — Plugin marketplace preview. Renders invented `PLUGIN_CATALOG` (4 plugins, author "AGI") framed as "Preview." Source `features/plugins/data/plugins.ts` carries fake `downloadCount` (offender #5).
- **`plugins/[id]/page.tsx`** — Plugin detail; same invented plugins; downloadCount not rendered; connector status is real.
- **`skills/page.tsx`** — auth-gated redirect.
- **`skills/[name]/page.tsx`** — fetches live `/api/skills`. Real data.
- **`providers/page.tsx`** — Provider roster; pricing read live from `modelsCatalogJson`. `AgiChatDemo` disclosed "scripted … not a live model call" (line 202). Clean.
- **`integrations/page.tsx`** — "The honest inventory" ledger. Clean; SSE/HTTP "planned" (line 94) conflicts w/ cli/desktop (offender #8).
- **`cli/page.tsx`** — Offender #6 (ships-today contradiction) + #8.
- **`desktop/page.tsx`** — Clean; installers "Coming soon." Line 189 lists SSE/HTTP as shipped (offender #8).
- **`mobile/page.tsx`** — Clean; Cloud "public alpha — opt-in"; disclosures "in progress" honestly hedged.
- **`chrome-extension/page.tsx`** — Clean; concrete architecture claims; "coming soon."
- **`vscode-extension/page.tsx`** — Clean; "coming soon"/"developer preview"/VSIX; waitlist-gated.
- **`features/page.tsx`** — Features hub. Clean, qualitative.

### Feature detail pages (9, clean)

- **`features/{agents,ai-chat,ai-skills,artifacts,deep-research,memory,plugins,projects,tools}/page.tsx`** — All clean. No testimonials/logos/stats. Only numeric claims are `MARKETING.models.display` "50+" / `providers.display` "10+" (sourced). Multiple pages carry explicit "Honest boundaries" sections and "managed compute is public alpha" labels. `features/ai-skills` is a redirect to `/skills`.

### (b) Company + solutions (17)

- **`about/page.tsx`** — Clean. Colophon "SOC 2 planned · GDPR/CCPA in progress" honestly labeled. Trivial: metadata "Austin, Texas" vs press "USA."
- **`careers/page.tsx`** — Clean. "We do not have open roles right now … no ghost listings" (line 30).
- **`blog/page.tsx`** — Clean empty-state; "Posts will appear here when they exist."
- **`blog/[slug]/page.tsx`** — always `notFound()`. No posts.
- **`customers/page.tsx`** — **Explicitly honest.** "Case studies will appear here once we have written permission … We don't list logos we haven't cleared" (lines 32-35). No named customers.
- **`contact/page.tsx`** — mailto-only; "Nothing you type here is sent or stored by this site."
- **`contact-sales/page.tsx`** — Clean; email + what-to-include.
- **`press/page.tsx`** — Clean; `QUICK_FACTS` real self-descriptions. (Note: `content/press/*.md` GTM drafts exist but are NOT rendered by any page.)
- **`changelog/page.tsx`** — Clean; "We do not backdate, we do not pre-announce"; forthcoming items "TBD."
- **`buildathon/page.tsx`** — Offender #2.
- **`community/page.tsx`** — **Honest.** "We don't run a Discord, a forum, or a Slack workspace yet" (line 29). No fake member counts.
- **`enterprise/page.tsx`** — **Model honesty.** Compliance ledger: SOC 2 "Planned. No audit report claimed," HIPAA "Not available," ISO 27001 "On the roadmap." No fake certs/logos.
- **`solutions/page.tsx`** — Clean router; "public alpha" labels.
- **`teams/page.tsx`** — Clean; org policy/audit "scoped on enterprise contracts"; no claimed deployments.
- **`business/page.tsx`** — Clean; managed cloud "public alpha"; admin controls "scoped on enterprise contracts."
- **`partners/page.tsx`** — Clean; "We help publish to our directory once it ships." Minor: "Volume pricing on Enterprise contracts" implies operating reseller program (framed as intake, low risk).

### (e) Use-cases — programmatic SEO (6, all clean)

- **`use-cases/page.tsx`** — hub; capability cards, no customer names/quotes/metrics.
- **`use-cases/consulting/page.tsx`** — capability/posture only. Clean.
- **`use-cases/consulting-businesses/page.tsx`** — redirect → `/use-cases/consulting`.
- **`use-cases/it-providers/page.tsx`** — capability copy. Clean.
- **`use-cases/it-service-providers/page.tsx`** — redirect → `/use-cases/it-providers`.
- **`use-cases/sales-teams/page.tsx`** — capability copy. Clean.
- **`use-cases/startups/page.tsx`** — pricing from `MARKETING_FEATURE_MATRIX` (real). Clean. This is the well-behaved SEO-template pattern — zero fabricated outcomes.

### (c) Legal / policy / trust (17)

- **`privacy/page.tsx`** — Names live telemetry vendors (Sentry, GA/GTM, line 69-71) + provider gateway fleet (line 84-86) as operational; address "Austin, Texas" (line 224). Ties into offenders #7, #9.
- **`privacy-policy/page.tsx`** — `redirect('/privacy')`. Clean.
- **`terms/page.tsx`** — Full ToS, real clauses, Austin TX (line 162). Clean.
- **`terms-of-service/page.tsx`** — `redirect('/terms')`.
- **`dpa/page.tsx`** — email-to-request DPA. Clean.
- **`cookies/page.tsx`** — "No third-party advertising cookies," analytics opt-in. Clean.
- **`cookie-policy/page.tsx`** — `redirect('/cookies')`.
- **`legal/page.tsx`** — index; links resolve. Clean.
- **`legal/eu-representative/page.tsx`** — honest placeholder: "Representative details pending appointment … so public legal links do not dead-end."
- **`subprocessors/page.tsx`** — Offender #13 (one anonymized placeholder row).
- **`refund-policy/page.tsx`** — concrete 30-day pro-rated terms. Clean.
- **`sla/page.tsx`** — Offender #10.
- **`trust/page.tsx`** — **Best-in-class.** SOC 2 "Planned … No audit report claimed," HIPAA "Not available," ISO 27001 "On the roadmap." No fake badges.
- **`security/page.tsx`** — Clean, hedged; broad Cloud "remains gated until audits are complete" (line 45). No fabricated pentest/audit claims.
- **`accessibility/page.tsx`** — "aim for WCAG 2.1 AA" (aspirational); openly lists known gaps. Clean.
- **`status/page.tsx`** — Real in-process `runHealthChecks`; "No wall of evergreen badges"; no fabricated incident history. Clean. States Cloud "signed-in users can use it now" (line 155-159) — offender #7.
- **`mobile/legal/page.tsx`** — Sheridan WY address (offender #9); `EFFECTIVE_DATE = 2026-07-12` (future-dated). Otherwise substantive, no lorem/TODO.

Duplicate legal pairs (privacy/terms/cookies) are all clean one-line redirects — good hygiene.

### (d) Docs / reference / auth / connectors / misc (33)

- **`docs/page.tsx`** — canonical docs hub; `COMING_SOON_LABEL` on Mobile/Chrome/VSCode. Clean.
- **`docs/byok-env/page.tsx`** — env-var guide; truncated placeholder keys. Clean. Links `/waitlist` as Team/Enterprise early access.
- **`documentation/page.tsx`** — `redirect('/docs')`.
- **`api-docs/page.tsx`** — Offender #12 (stale "July 12 release" + wrong waitlist CTA). Otherwise clean; `$YOUR_KEY` placeholder.
- **`api-reference/page.tsx`** — `redirect('/api-docs')`.
- **`help/page.tsx`** — Clean; "Managed cloud is public alpha, open by default (metered)."
- **`faq/page.tsx`** — Clean; cloud "open by default — no waitlist." Offender #15 (provider-count subset).
- **`support/page.tsx`** — Clean; "no published response-time SLA yet."
- **`resources/page.tsx`** — Clean; "Everything below is a real page … Nothing here is a placeholder."
- **`sitemap-page/page.tsx`** — Clean; `/download` labeled coming-soon.
- **`connectors/page.tsx`** — auth-gated wrapper → settings modal or public `ConnectorsPage`. Page-level clean.
- **`connectors/mcp-directory/page.tsx`** — Offender #4.
- **`connectors/new/page.tsx`** — `redirect('/connectors')`.
- **`connectors/permissions/page.tsx`** — `redirect('/settings/capabilities')`.
- **`auth/device/page.tsx`** — Offender #3.
- **`auth/error/page.tsx`** — OAuth error display. Clean.
- **`auth/login/page.tsx`** — `redirect('/login')`.
- **`auth/update-password/page.tsx`** — redirect → `/login` (Supabase→Clerk). Clean.
- **`login/page.tsx`** — Clerk `<SignIn>`, canonical. "cloud open in public alpha." Clean.
- **`register/page.tsx`** — `redirect('/signup')`.
- **`sign-in/page.tsx`** — redirect → `/login`.
- **`sign-up/page.tsx`** — redirect → `/signup`.
- **`signup/page.tsx`** — Clerk `<SignUp>`, canonical. Clean.
- **`forgot-password/page.tsx`** — redirect → `/login`.
- **`verify/page.tsx`** — email-verify/device-approval. Clean.
- **`waitlist/page.tsx`** — **Already reframed** to "public alpha, open by default — no waitlist," scoped to Team/Enterprise. Clean (but note api-docs still points an "API waitlist" CTA here).
- **`device-auth/page.tsx`** — `redirect('/auth/device')`.
- **`billing/page.tsx`** — mounts real `BillingDashboard`/token components. No hardcoded fake data at page level.
- **`payment-failure/page.tsx`** — static generic copy. Clean.
- **`user/page.tsx`** — `redirect('/settings')`.
- **`qa-artifacts/page.tsx`** — Offender #1.
- **`share/[token]/page.tsx`** — real Neon `shared_sessions` viewer. Clean. (Redundant with shared/[id] — offender #11.)
- **`shared/[id]/page.tsx`** — real `/api/shared` viewer. Clean. Offender #11.

---

## Responsive state

No page is obviously mobile-broken. The shared `agi-*` / `agi-fl-*` / `agi-shell` / `agi-ledger` design system uses `clamp()` fluid spacing, `auto-fill minmax` grids, Tailwind `sm:/md:/lg:` classes, and `vw`-based modal widths. Inline styles are minor (form max-widths ~560px, table column %s). ConnectorsPage has an explicit mobile master-detail drill-down. No fixed-desktop-width layouts flagged. Responsive is NOT a wave-1 concern; mock-data/honesty cleanup is.

## Redesign notes (non-mock, worth folding into the wave plan)

- Collapse the two share systems (`share/[token]` + `shared/[id]`) into one.
- Reconcile MCP-transport claims (cli/desktop/integrations) to a single source of truth.
- Reconcile the Web "Coming soon" badge with the live `/chat` route (either badge it "Public alpha" or gate the CTA).
- Sweep stale gating copy: `auth/device` Pro/Max wall, `api-docs` API-waitlist CTA.
- Single authoritative company address across all legal pages.
