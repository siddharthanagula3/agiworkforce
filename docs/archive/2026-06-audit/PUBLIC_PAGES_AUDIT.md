# PUBLIC_PAGES_AUDIT.md

Status: Generated 2026-06-13 by the public-pages-audit workflow (20 agents, 120 pages, ~1.5M tokens).
Owner: VC-demo production push. Method: each agent read the page.tsx + followed first-level content imports, checked against the real route set.

## Verdict summary
- clean: 81  ·  minor: 35  ·  major: 4  ·  blocker: 0
- Issues by type: broken-link: 29 · placeholder-copy: 6 · missing-state: 2 · fake-data: 3 · hardcoded-color: 28 · dead-control: 2

## P1 — Broken internal links (29) — almost all the missing /compare tree
The `/compare` route tree is linked from the global footer/nav + ~22 pages but does not exist → every Compare link 404s.

Affected routes:
- /agi-code  (2 link(s))
- /dpa  (1 link(s))
- /enterprise  (1 link(s))
- /faq  (1 link(s))
- /features/agents  (1 link(s))
- /features/plugins  (1 link(s))
- /features/projects  (1 link(s))
- /features/tools  (1 link(s))
- /forgot-password  (1 link(s))
- /gallery  (1 link(s))
- /get-started  (1 link(s))
- /payment-failure  (1 link(s))
- /press  (1 link(s))
- /pricing  (1 link(s))
- /resources  (1 link(s))
- /sitemap-page  (7 link(s))
- /solutions  (1 link(s))
- /subprocessors  (1 link(s))
- /support  (1 link(s))
- /teams  (1 link(s))
- /terms  (1 link(s))
- /trust  (1 link(s))

Broken targets: `/compare`, `/compare/chatgpt`, `/compare/claude`, `/compare/claude-code`, `/compare/codex`, `/compare/gemini`, `/compare/perplexity`.

## P1 — Major pages (4)
- **/agi-code** — Strong developer-stack marketing page, but the RouteMap section links to two internal routes (/compare/codex and /compare/claude-code) that do not exist in the app router, producing 404s on click.
- **/partner-perks** — Lists named third-party perks (AWS, Linear, Vercel, Notion, Retool) with specific dollar/duration offers presented as 'Active perks' though no real partnership is evidenced; CTAs are placeholder mailto links.
- **/resources** — One index card links to /compare, which is not a real route, directly contradicting the page's own 'nothing here is a placeholder' claim.
- **/sitemap-page** — Static sitemap with real copy, but the entire 'Compare' section links to a /compare route tree that does not exist in apps/web/app.

## P2 — Fake / unverified data (3)
- [low] apps/web/app/buildathon/page.tsx:22-42
  - CURRENT_PROOF: 'LeetCode profile currently shows 594 problems solved, including 252 hard.' vs RAW_ANALYSIS: '563 LeetCode problems solved' and '240 LeetCode hard problems solved' (and '4,764 contributions' vs '4,766 commits/year') — the same person's metrics conflict on the same page.
- [high] apps/web/lib/perks.ts:11-57 (PERKS, rendered in partner-perks/page.tsx:38-47)
  - 'Active perks' grid presents real brands with concrete offers: '$5,000 in AWS credits', '3 months of Linear free', 'Vercel Pro for 90 days', 'Notion Team plan, 6 months', 'Retool Starter, first year free' — named real companies and invented credit amounts on a public/investor-visible page with no proof these partnerships exist
- [low] apps/web/app/settings/account/page.tsx:52-77
  - Active sessions table is built from a single synthetic row with location: 'Unknown' and updated: 'Now' rather than real session data; it presents as a live session list but is derived only from the current user object.

## P2 — Dead controls (2)
- apps/web/components/marketing/MobileHeroVisual.tsx:47-61 (MobileHeroVisual, used by app/page.tsx:75)
  - <a className="agi-store-btn" aria-label="Download on the App Store" tabIndex={-1}> ... <a className="agi-store-btn" aria-label="Get it on Google Play" tabIndex={-1}> — both anchors have no href and tabIndex={-1}, rendered under a 'Coming Soon' label in the homepage hero
- apps/web/app/settings/privacy/page.tsx:452-464
  - Shared chats 'Manage' link href="#shared-chats" only scrolls to the Export data row (id="shared-chats"); there is no actual shared-chats management UI behind it

## P2 — Missing/silent states (2)
- features/chat/components/tokens/TokenBalanceDisplay.tsx:49-61
  - loadBalance() catch block only calls console.error('Failed to fetch usage data:', error) and the non-OK branch only logs and returns; the component then renders a $0.00 / free-plan balance instead of surfacing any error state to the user.
- apps/web/app/settings/byok/EnvKeyStatusList.tsx:99-104
  - In EnvKeyStatusList.fetchStatus the catch block silently fails ('// Silently fail · statuses remain unknown'); on a failed /api/byok/env-key-status fetch every provider falls back to 'Not set' with no error indicator, so a fetch failure looks identical to genuinely unset keys.

## P3 — Placeholder copy (6, mostly honest dated roadmap)
- apps/web/app/api-docs/page.tsx:46-48: The public OpenAPI bundle, Postman collection, and SDK examples open with the July 12 release. For now, use the quick-start route and BYOK s
- apps/web/app/changelog/page.tsx:74-75: { item: 'Pro tier', detail: 'Opens after security audit closes.', quarter: 'TBD' } and { item: 'Max tier', detail: 'Opens after Pro stabiliz
- apps/web/components/marketing/MobileHeroVisual.tsx:47 (MobileHeroVisual): <span className="agi-store-soon">Coming Soon</span> shown beside the homepage hero store buttons
- apps/web/lib/perks.ts:18,27,36,45,54 (PERKS ctaUrl): Every perk 'Claim credits'/'Get access'/'Activate'/'Unlock'/'Apply' CTA points only to a mailto link (e.g. ctaUrl: 'mailto:partnerships@agiw
- apps/web/app/byok/WaitlistForm.tsx:118: placeholder="you@example.com…" in the hosted-vault waitlist email field
- apps/web/app/status/page.tsx:98-99: It is the same check we run ourselves Not a hand-edited badge.

## P3 — Hardcoded colors (token-rule violations)
- /connectors: apps/web/features/connectors/pages/ConnectorsPage.tsx:160 (InspectMcpServerDialog) — className="border-white/[0.08] bg-[#0f0e0d] sm:max-w-md"
- /gallery: apps/web/app/gallery/GalleryClient.tsx:496 — background: 'rgba(0,0,0,0.55)' on the CategoryPicker modal backdrop (JSX inline style; project rule requires design toke
- /settings/account: apps/web/app/settings/account/page.tsx:402 — background: 'rgba(33,128,141,0.12)'
- /settings/billing: apps/web/app/settings/billing/page.tsx:207-209 — background: 'rgba(200,137,42,0.12)' and border: '1px solid rgba(200,137,42,0.25)'
- /settings/byok: apps/web/app/settings/byok/page.tsx:35 — color: 'var(--amber, #c8892a)' on the 'How to set env keys' link
- /settings/capabilities: apps/web/app/settings/capabilities/page.tsx:137 — className="text-xs text-[var(--chat-accent-primary)] hover:underline" (arbitrary text-[...] class on 'View and manage me
- /settings/general: apps/web/app/settings/general/page.tsx:309-310 — background: 'linear-gradient(135deg, var(--chat-accent-primary, #c8892a) 0%, var(--chat-accent-secondary, #21808d) 100%)
- /settings/privacy: apps/web/app/settings/privacy/page.tsx:434 — color: 'var(--chat-accent-primary, #c8892a)'
- /settings/usage: apps/web/app/settings/usage/page.tsx:157 — background: 'var(--bg-hover, rgba(255,255,255,0.05))'
- /settings/voice: apps/web/app/settings/voice/page.tsx:73 — color: '#fff' (on the 'Upgrade to Hobby' Link)
- /skills: apps/web/app/skills/page.tsx:71,96,99,205,etc — className="...rounded-xl border border-white/[0.06] bg-white/[0.02] p-4..." (repeated white/[opacity] literals throughou
