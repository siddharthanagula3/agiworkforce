# Batch 24 — Web Public Pricing and Auth Pages

Audited: 2026-05-24
Branch: `audit/preexisting-remediation-2026-05-23`
Image base: `/Users/siddhartha/Desktop/reference/ui/web`
Reference: Claude (claude.com) public pricing and authentication pages

---

## Context

The reference images show Anthropic's Claude pricing page (`claude.com/pricing`) and authentication pages (`claude.ai/login`). AGI is a different product with different pricing tiers (Local free, BYOK free, managed cloud waitlisted per `locks/v1-local-only-cloud-waitlist-2026-05-18.md`). Where differences are by design (product policy), this is noted. Where differences represent implementation flaws, missing parity, or code hygiene issues, they are flagged with severity.

---

## IMG: 010_claude-public_pricing_top.png

- Feature: Claude pricing page top section showing Individual tab with Free ($0), Pro ($17/mo), and Max (From $100) plan cards, pill-icon illustrations, and tabbed navigation (Individual / Team & Enterprise / API)
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/010_claude-public_pricing_top.png`
- Implementation status: present (structurally equivalent; content differs by design)
- Primary files:
  - `apps/web/app/pricing/page.tsx`
  - `apps/web/app/pricing/layout.tsx`
  - `apps/web/lib/marketing-constants.ts`
  - `apps/web/app/i18n/locales/en/pricing.json`
  - `packages/types/src/billing-catalog.ts`
- API endpoints: none (static page)
- Data flow:
  - `PricingPage` renders three tabs: `individual`, `team`, `api`
  - Tab IDs and structure defined in `PRICING_TABS` array (page.tsx:33-37)
  - Individual tab renders three tier cards: Local, BYOK, Hobby (waitlisted)
  - Prices read from `BILLING_PLAN_PRICING` in `packages/types/src/billing-catalog.ts`
  - Privacy mode labels from `formatPrivacyModeLabel()` in suite-contracts.ts
  - i18n strings from `apps/web/app/i18n/locales/en/pricing.json`
- Flaws:
  - [major] Header component (`components/layout/Header.tsx:28-43`) uses `getSupabaseClient().auth.getSession()` for user detection, but auth has migrated to Clerk (`proxy.ts` uses `clerkMiddleware`, login/signup use `<SignIn/>/<SignUp/>`). Clerk-authenticated users will never show as logged in in the header, rendering the Sign In / Sign Out / Chat nav toggle broken. @ `apps/web/components/layout/Header.tsx:31-34`
  - [major] Header sign-out (`Header.tsx:46-47`) calls `supabase.auth.signOut()` which will not clear Clerk sessions. @ `apps/web/components/layout/Header.tsx:46-47`
  - [minor] Pricing tabs use `team` and `api` labels, while Claude reference uses "Team & Enterprise" and "API". The AGI `team` tab renders waitlisted paid tiers; `api` tab renders a single enterprise contact card. This maps adequately but the tab label "Team" does not communicate that Enterprise is folded in. @ `apps/web/app/pricing/page.tsx:35-36`
  - [cosmetic] No plan-icon illustrations (Claude uses stylized tree/flower SVGs). AGI tier cards are text-only.
- Visual gaps:
  - Claude has a secondary breadcrumb ("Pricing" + "Explore here" chevron at top); AGI has no breadcrumb or contextual subnav
  - Claude cards have black CTA buttons with "Try Claude" text; AGI uses ghost-style "Install" or solid "Join waitlist"
  - No "Pricing" page hero uses the serif/display font that Claude uses for "Pricing" heading

---

## IMG: 010b_claude-public_pricing_top_maximized.png

- Feature: Same as 010 but in a maximized browser window, showing the full-width layout with three plan cards side by side
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/010b_claude-public_pricing_top_maximized.png`
- Implementation status: present
- Primary files: same as IMG 010
- API endpoints: none
- Data flow: same as IMG 010
- Flaws:
  - [minor] AGI pricing page uses `agi-tier-grid` CSS class for card layout. No explicit `max-width` constraint visible in the page component — at very wide viewports the layout depends entirely on CSS classes defined in `globals.css`. Claude constrains cards within a defined max-width container. @ `apps/web/app/pricing/page.tsx:145`
  - [cosmetic] AGI heading uses `agi-page-h1` class with i18n key `pageTitle` ("Simple pricing.") vs Claude's centered serif "Pricing"
- Visual gaps:
  - Claude's maximized view shows balanced whitespace with generous vertical padding between header and content. AGI's layout behavior at max width is untested in this audit.

---

## IMG: 011_claude-support_choose-plan_table.png

- Feature: Claude Support help center article "Choosing a Claude plan" — a comparison table with columns Plan, Price, Billing Interval, Usage Capacity, Best For, showing Free, Pro, Max 5x, Max 20x rows
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/011_claude-support_choose-plan_table.png`
- Implementation status: partial (AGI has an inline comparison table, not a separate support article)
- Primary files:
  - `apps/web/app/pricing/page.tsx` (lines 329-458 — comparison table section)
  - `apps/web/lib/marketing-constants.ts` (MARKETING_FEATURE_MATRIX)
- API endpoints: none
- Data flow:
  - Comparison table rendered inline on pricing page below tier cards
  - Rows sourced from `MARKETING_FEATURE_MATRIX[activeTab]` which varies by active tab
  - Columns: Plan, Price, Billing Interval, Usage Capacity, Best For (matching Claude's column structure)
  - Individual tab shows: Local (Free), BYOK (Free), Hobby (Waitlist)
  - Team tab shows: Pro ($29.99/mo), Pro+ ($49.99/mo), Max ($299.99/mo)
- Flaws:
  - [minor] AGI comparison table is tab-scoped — team plan rows only show when team tab is active. Claude shows all plans in one table. This may confuse users who expect to compare across categories. @ `apps/web/app/pricing/page.tsx:379`
  - [cosmetic] Claude table has linked "Usage Capacity" values (e.g., "5x Pro capacity per session" as a hyperlink). AGI table values are plain text.
- Visual gaps:
  - Claude's support article format has breadcrumb navigation (All Collections > Claude > Get started > Choosing a Claude plan), search bar, and a distinct help-center header. AGI has no equivalent support content system.
  - Claude table has clean borders and larger row padding

---

## IMG: 012_claude-support_pro-plan_benefits.png

- Feature: Claude Support article for Pro plan benefits — lists 5x usage, priority access, early features, model selector, projects/knowledge bases, Claude Code, Cowork. Also covers Pro plan pricing ($20/mo with annual discount) and a note about API being separate.
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/012_claude-support_pro-plan_benefits.png`
- Implementation status: N/A (external help-center content; no AGI equivalent expected)
- Primary files: none — AGI has no support/help-center article system for plan benefit details
- API endpoints: none
- Data flow: N/A
- Flaws:
  - [minor] AGI has no plan benefit detail pages or help articles. The pricing page tier cards (`apps/web/app/pricing/page.tsx:153-169`) list 4 bullet features per tier but provide no "learn more" links to detailed benefit breakdowns. For a v1 product this is acceptable, but it is a gap relative to Claude's user education surface.
- Visual gaps:
  - Claude has a full help-center with sidebar TOC, article dates, linked cross-references (model selector, projects, Claude Code, Cowork). AGI has none of this infrastructure.

---

## IMG: 013_claude-support_max-plan_benefits.png

- Feature: Claude Support article for Max plan — More usage capacity (5x/20x Pro), no interruptions, scale as needed, priority access, Claude Code access, Cowork access. Pricing tiers: Max 5x ($100/mo), Max 20x ($200/mo). Note about web vs mobile pricing.
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/013_claude-support_max-plan_benefits.png`
- Implementation status: N/A (external help-center content; no AGI equivalent expected)
- Primary files: none
- API endpoints: none
- Data flow: N/A
- Flaws:
  - [info] AGI does not have Max sub-tiers (5x/20x). AGI's Max plan is a single tier at $299.99/mo (waitlisted). This is a product decision, not a bug. @ `packages/types/src/billing-catalog.ts:57-60`
- Visual gaps:
  - Same as IMG 012 — no help-center article system

---

## IMG: 014_claude-public_pricing_team-enterprise_top.png

- Feature: Claude pricing page "Team & Enterprise" tab showing two cards — Team (5 to 150 users, "Get Team plan" CTA) and Enterprise (large businesses, "Get Enterprise plan" CTA), plus a "Quiz: Which plan is right for you? Let's find out" CTA
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/014_claude-public_pricing_team-enterprise_top.png`
- Implementation status: partial
- Primary files:
  - `apps/web/app/pricing/page.tsx` (lines 241-326)
  - `apps/web/lib/marketing-constants.ts`
- API endpoints: none
- Data flow:
  - AGI's `team` tab renders Pro/Pro+/Max waitlisted cards, not a Team+Enterprise split
  - AGI's `api` tab renders the enterprise contact card
  - No quiz or plan-recommendation flow exists
- Flaws:
  - [minor] AGI has no plan quiz or recommendation tool ("Which plan is right for you?"). For a waitlisted product this is low-priority but notable. @ `apps/web/app/pricing/page.tsx`
  - [cosmetic] Claude shows distinct building icons for Team (storefront) and Enterprise (office building). AGI API/enterprise section is plain text with no iconography. @ `apps/web/app/pricing/page.tsx:277-325`
- Visual gaps:
  - Claude's Team & Enterprise tab has a 2-column card layout with black CTA buttons. AGI splits these across two tabs instead.
  - Claude has team size badges ("5-150 users", "20+ users") on cards. AGI has no team size indicators.

---

## IMG: 015_claude-public_pricing_api_latest-models.png

- Feature: Claude pricing page API tab showing "Latest models" section with three model cards — Opus 4.7 ($5/MTok input), Sonnet 4.6 ($3/MTok input), Haiku 4.5 ($1/MTok input) — plus "Contact sales" and "Start building" CTAs
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/015_claude-public_pricing_api_latest-models.png`
- Implementation status: missing
- Primary files:
  - `apps/web/app/pricing/page.tsx` (lines 276-326 — current API tab)
  - `apps/web/lib/marketing-constants.ts` (MARKETING_FEATURE_MATRIX.api)
- API endpoints: none
- Data flow:
  - AGI's `api` tab renders only an enterprise contact section (eyebrow, heading, body, CTA)
  - No model cards with per-token pricing are rendered
  - `MARKETING_FEATURE_MATRIX.api` has a single enterprise row
- Flaws:
  - [major] `MARKETING_MODEL_PILLS` in `apps/web/lib/marketing-constants.ts:20-25` hardcodes model IDs (`'gpt-5.5'`, `'claude-opus-4-7'`, `'gemini-3.1-pro-preview'`, `'llama-3.3-70b'`). This violates the locked rule "never hardcode model IDs — read from `packages/types/src/models.json`" (CLAUDE.md, MEMORY locks/rule-models-json-canonical.md). The file comment self-justifies them as "display values" but the rule has no display-only exception. @ `apps/web/lib/marketing-constants.ts:20-25`
  - [minor] AGI API tab has no model cards or per-token pricing. For an aggregator product this could eventually show per-provider pricing, but since cloud is waitlisted this is acceptable for v1.
- Visual gaps:
  - Claude shows elegant model cards with model names, taglines, and $/MTok pricing. AGI shows none of this.
  - Claude has both "Contact sales" (outline) and "Start building" (solid black) CTAs side by side. AGI has only a single "Contact sales" CTA.

---

## IMG: 016_claude-support_team-plan_benefits.png

- Feature: Claude Support article "What is the Team plan?" — describes increased usage, extra usage purchase, admin tools, SSO, domain capture, supported locations
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/016_claude-support_team-plan_benefits.png`
- Implementation status: N/A (external help-center content; no AGI equivalent expected)
- Primary files: none
- API endpoints: none
- Data flow: N/A
- Flaws: none applicable — support article content, not an in-app feature
- Visual gaps:
  - AGI has no help-center or support article infrastructure

---

## IMG: 017_claude-support_enterprise-plan_benefits.png

- Feature: Claude Support article "What is the Enterprise plan?" — describes advanced security, compliance, seat-based pricing at API rates, self-serve and sales-assisted purchase, Chat + Claude Code seats
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/017_claude-support_enterprise-plan_benefits.png`
- Implementation status: N/A (external help-center content; no AGI equivalent expected)
- Primary files: none
- API endpoints: none
- Data flow: N/A
- Flaws: none applicable
- Visual gaps:
  - Same as IMG 016

---

## IMG: 018_claude-support_extra-usage_paid-plans.png

- Feature: Claude Support article "Manage extra usage for paid Claude plans" — explains pay-as-you-go continuation after hitting session limits, spending controls, API-rate pricing, mobile vs web differences
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/018_claude-support_extra-usage_paid-plans.png`
- Implementation status: N/A (external help-center content; no AGI equivalent expected — cloud waitlisted)
- Primary files: none
- API endpoints: none
- Data flow: N/A
- Flaws:
  - [info] AGI i18n strings reference waitlisted status ("No public credits or top-ups in MVP"), which is consistent with the lock. Extra usage / spending controls are not implemented. This is tracked as a future requirement per `locks/v1-local-only-cloud-waitlist-2026-05-18.md`.
- Visual gaps:
  - No help-center articles, no extra usage management UI

---

## IMG: 030_claude-auth_logged-out_signin-entry.png

- Feature: Claude sign-in page at `claude.ai/login` — split layout with left panel ("Think fast, build faster" headline, "Brainstorm in chat, build in Cowork" subtitle, Google OAuth button, email input + "Continue with email" CTA, privacy policy disclaimer, "Download desktop app" link) and right panel (chat UI preview with suggestion cards like "Create a file", "Crunch data", "Make a prototype", sample prompt bar with "Q2 UX Research" project reference)
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png`
- Implementation status: present (structurally equivalent via AuthStage + Clerk widget)
- Primary files:
  - `apps/web/app/login/page.tsx`
  - `apps/web/app/login/layout.tsx`
  - `apps/web/components/auth/AuthStage.tsx`
  - `apps/web/proxy.ts` (Clerk middleware)
- API endpoints:
  - Clerk-managed OAuth flows (no AGI-owned callback for Clerk)
  - `apps/web/app/auth/callback/route.ts` (stale Supabase callback — see flaws)
- Data flow:
  - `LoginPage` is a server component that resolves `searchParams` for redirect target
  - `getSafeRedirectUrl()` validates redirect against allowed hosts
  - `AuthStage` wraps Clerk `<SignIn/>` with brand-specific headline and preview mockup
  - `<SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl={redirectTo}/>` renders Clerk's managed sign-in UI including OAuth buttons and email input
  - Clerk middleware in `proxy.ts` handles session management via `clerkMiddleware()`
- Flaws:
  - [critical] `apps/web/app/auth/callback/route.ts` is a stale Supabase OAuth callback that calls `supabase.auth.exchangeCodeForSession(code)`. Since auth has migrated to Clerk (latest commit `a78b743f8`), this route is orphaned. It could silently accept OAuth redirects and exchange codes against a Supabase instance that is no longer the auth source of truth, creating a confused-deputy scenario. @ `apps/web/app/auth/callback/route.ts:59-69`
  - [major] `components/auth/OAuthProviderButtons.tsx` is dead code — it is imported nowhere in production. Clerk's `<SignIn/>` widget renders its own OAuth buttons. The component references env vars `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` and `NEXT_PUBLIC_AUTH_GITHUB_ENABLED` that are Supabase-era configuration. @ `apps/web/components/auth/OAuthProviderButtons.tsx:8-11`
  - [major] Login page hardcodes `style={{ background: '#faf9f6', color: '#1a1a1a' }}` with hex literals instead of design tokens/CSS variables. Violates `feedback_no_hardcoded_colors.md` rule. @ `apps/web/app/login/page.tsx:21`
  - [minor] `AuthStage.tsx` subtitle says "Chat with any AI, build with all of them" for login. Claude says "Brainstorm in chat, build in Cowork". The AGI version is acceptable product copy but less feature-specific. @ `apps/web/components/auth/AuthStage.tsx:39-40`
  - [minor] "Download desktop app" is rendered as plain text with an SVG icon but is not a clickable link. Claude's version is a pill-shaped button linking to the desktop download. @ `apps/web/components/auth/AuthStage.tsx:46-59`
  - [cosmetic] AuthStage `<h1>` uses `fontStyle: 'italic'` for the display heading. The italic serif matches Claude's style, but the font-family is set to `var(--font-display)` which may not resolve to a serif font depending on theme configuration.
- Visual gaps:
  - Claude shows only Google OAuth + email. AGI's Clerk widget may show additional providers depending on Clerk dashboard config.
  - Claude has a "By continuing, you acknowledge Anthropic's Privacy Policy" disclaimer below the email CTA. Clerk may or may not render equivalent text depending on configuration.
  - Claude's right panel shows a polished chat preview with file icons and a coral "Let's go" CTA button. AGI's mockup (`AuthStage.tsx:62-123`) uses Lucide icons for the suggestion cards — visually adequate but less polished.

---

## IMG: 031_claude-auth_logged-out_plan-cards.png

- Feature: Claude login page at `claude.ai/login` — scrolled-down view showing "Explore plans" section with Individual / Team and Enterprise tabs, three plan cards (Free $0, Pro $17, Max From $100) with feature lists and CTAs
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/031_claude-auth_logged-out_plan-cards.png`
- Implementation status: missing (no plan cards on AGI login page)
- Primary files:
  - `apps/web/app/login/page.tsx`
  - `apps/web/components/auth/AuthStage.tsx`
- API endpoints: none
- Data flow:
  - AGI login page renders only: Header, AuthStage (headline + Clerk widget + preview mockup), MarketingFooter
  - No plan exploration or comparison section exists on the login page
  - Plan information is only on the dedicated `/pricing` page
- Flaws:
  - [minor] No plan cards on the auth pages. Claude uses the login page as a secondary marketing surface to show plan value. AGI keeps auth pages minimal. For a waitlisted product this is acceptable but represents a missed upsell surface.
- Visual gaps:
  - Claude login page includes a full pricing section with header nav (Meet Claude, Platform, Solutions, Pricing, Resources) plus plan cards. AGI login page has no pricing content below the fold.

---

## IMG: 032_claude-auth_logged-out_team-enterprise-cards.png

- Feature: Claude login page — Team and Enterprise tab of "Explore plans" section showing Team (Standard seat $20/mo, Premium seat $100/mo, features: 200K context, extra usage, Claude Code, Cowork, SSO) and Enterprise (Seat price + usage at API rates, $20/seat, 500K context, SCIM, audit logs, compliance API, network access control)
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/032_claude-auth_logged-out_team-enterprise-cards.png`
- Implementation status: missing (no team/enterprise cards on AGI login page)
- Primary files:
  - `apps/web/app/login/page.tsx`
- API endpoints: none
- Data flow: same as IMG 031 — no plan cards on auth pages
- Flaws:
  - [info] Same gap as IMG 031. AGI has no Team or Enterprise plan cards on auth pages. Team/Enterprise tiers are waitlisted. No action needed for v1.
- Visual gaps:
  - Claude shows detailed seat pricing, feature lists (200K/500K context window, SSO, SCIM, audit logs). AGI auth pages show none of this.

---

## IMG: 080_claude-auth_after-free-logout_signin.png

- Feature: Claude sign-in page after logging out from a free account — same layout as IMG 030 but the right panel shows a different Cowork preview (UXR Summary .PPTX document preview with "What We Learned in Q2" slide and metrics cards showing "38 User interviews", "4 Key themes identified", "40% Churn rate reduction")
- Image path: `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/080_claude-auth_after-free-logout_signin.png`
- Implementation status: partial (same AuthStage renders, but preview is static not dynamic)
- Primary files:
  - `apps/web/app/login/page.tsx`
  - `apps/web/components/auth/AuthStage.tsx`
- API endpoints: none
- Data flow:
  - AGI's AuthStage always renders the same static preview (suggestion cards + sample prompt)
  - No per-session or post-logout variation in the preview content
  - Claude appears to rotate or randomize the right-panel preview content between sessions
- Flaws:
  - [cosmetic] AGI preview panel is static across all sessions. Claude rotates preview content (task cards in IMG 030, Cowork document preview in IMG 080). For v1 this is acceptable.
- Visual gaps:
  - Claude's post-logout preview shows a rich document artifact (PowerPoint slide with statistics). AGI's preview is always the generic task-suggestion grid.
  - Claude's "Download desktop app" link is an Apple-branded pill button. AGI renders an unlinked text element.

---

## Cross-Cutting Flaws

### Critical

1. **Stale Supabase OAuth callback route** — `apps/web/app/auth/callback/route.ts` performs `supabase.auth.exchangeCodeForSession(code)` and state cookie validation against a Supabase instance. Auth has migrated to Clerk. This route should be removed or replaced with a redirect to prevent confused-deputy attacks. @ `apps/web/app/auth/callback/route.ts:1-98`

### Major

2. **Header uses Supabase auth, not Clerk** — `components/layout/Header.tsx:28-47` calls `getSupabaseClient().auth.getSession()` for user detection and `supabase.auth.signOut()` for logout. Clerk-authenticated users are invisible to this header, meaning the nav will permanently show "Sign In" even when logged in, and the sign-out button (if reached) will only clear the dead Supabase session. @ `apps/web/components/layout/Header.tsx:28-47`

3. **Dead code: OAuthProviderButtons** — `components/auth/OAuthProviderButtons.tsx` is exported but imported by zero production files. Clerk's managed `<SignIn/>` widget handles OAuth natively. This component references Supabase-era env vars. @ `apps/web/components/auth/OAuthProviderButtons.tsx:1-92`

4. **Dead code: services/auth.ts** — `services/auth.ts` exports `signOut()` and `getUser()` using Supabase client. No production file imports from it. @ `apps/web/services/auth.ts:1-16`

5. **Dead code: supabaseAuth facade** — `services/supabaseAuth.ts` exports a `SupabaseAuthCompat` facade. No production file imports it (only the file itself and stubs). @ `apps/web/services/supabaseAuth.ts:1-47`

6. **Dead code: PublicHeader** — `shared/components/layout/PublicHeader.tsx` defines a completely separate header with different navigation, icons, and auth wiring (uses `useAuthStore`). It is imported by zero files. @ `apps/web/shared/components/layout/PublicHeader.tsx:1-380`

7. **Hardcoded model IDs in marketing constants** — `MARKETING_MODEL_PILLS` hardcodes `'gpt-5.5'`, `'claude-opus-4-7'`, `'gemini-3.1-pro-preview'`, `'llama-3.3-70b'`. Violates locked rule: "Never hardcode model IDs — read from `packages/types/src/models.json`". @ `apps/web/lib/marketing-constants.ts:20-25`

8. **Hardcoded colors on auth pages** — `login/page.tsx:21` and `signup/page.tsx:21` both use `style={{ background: '#faf9f6', color: '#1a1a1a' }}`. Violates `feedback_no_hardcoded_colors.md`. @ `apps/web/app/login/page.tsx:21`, `apps/web/app/signup/page.tsx:21`

### Minor

9. **Duplicate i18n key** — `apps/web/app/i18n/locales/en/pricing.json` has `"monthly"` at line 7 and again at line 67. JSON parsers silently keep the last occurrence. The first value is `"Monthly"` (the label) and the second is also `"Monthly"`. While the values happen to match, the duplicate is a maintenance hazard. @ `apps/web/app/i18n/locales/en/pricing.json:7,67`

10. **Pricing error page uses hardcoded dark-theme colors** — `apps/web/app/pricing/error.tsx` uses `text-white`, `bg-red-500`, `bg-zinc-900`, `border-zinc-700`, `text-blue-600`, etc. — Tailwind utility classes rather than design tokens. The same applies to `pricing/loading.tsx` with `bg-black`, `border-zinc-700`, `border-t-blue-500`. These will clash with the AGI design system's light theme and `data-design="agi"` token system. @ `apps/web/app/pricing/error.tsx:28-55`, `apps/web/app/pricing/loading.tsx:3-8`

11. **"Download desktop app" on AuthStage is not a link** — The download CTA at `AuthStage.tsx:46-59` renders as a `<div>` with text and an SVG icon, not an `<a>` or `<Link>`. Users cannot click it to navigate to `/download`. @ `apps/web/components/auth/AuthStage.tsx:46-59`

12. **AuthStage hardcodes color literals** — Multiple inline style properties use raw hex colors (`#4a4a4a`, `#6b6b6b`, `#1a1a1a`, `#999`, `#da7756`, `rgba(0,0,0,0.08)`, `rgba(255,255,255,0.6)`) instead of CSS variables. @ `apps/web/components/auth/AuthStage.tsx:38,46,80-82,84,97,103,115`

### Cosmetic

13. **Signup layout OG description references "Hobby plan available"** — `app/signup/layout.tsx:9` says "Sign up for free and start automating with AI agents. Hobby plan available." The Hobby plan is waitlisted, not available. @ `apps/web/app/signup/layout.tsx:9`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| Major    | 7     |
| Minor    | 4     |
| Cosmetic | 1     |

The most significant finding is the **incomplete Clerk migration**: the Header component, the OAuth callback route, OAuthProviderButtons, supabaseAuth facade, and services/auth.ts all remain wired to Supabase despite the auth layer having moved to Clerk. This creates dead code, broken user-detection in the nav bar, and a stale OAuth callback route that could accept tokens against the wrong auth backend.

The pricing page is structurally sound and appropriately reflects AGI's product positioning (Local/BYOK free, managed cloud waitlisted). The main pricing gaps are by design (no retail Pro/Max plan, no support article system, no API model cards). However, hardcoded model IDs in marketing constants violate a locked project rule and should be remediated.

Auth pages successfully use Clerk's managed `<SignIn/>`/`<SignUp/>` widgets inside the branded `AuthStage` wrapper, providing the split-panel layout from the Claude reference. Visual polish (rotating preview content, plan cards on auth pages) are v2 enhancements, not v1 blockers.
