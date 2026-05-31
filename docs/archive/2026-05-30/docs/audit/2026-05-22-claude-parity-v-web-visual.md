# R26-PARITY-VISUAL-WEB — Pixel-Level Visual Parity Audit (agiworkforce.com vs claude.ai)

**Date:** 2026-05-22
**Lane:** V-WEB-VISUAL
**Auditor:** team-lead (V-WEB-VISUAL)
**Scope:** Layer-1 visual fidelity — what the user **sees** on each public/auth-walled-but-redirected route on agiworkforce.com vs the equivalent route on claude.ai/claude.com.
**Method:** Playwright fresh-browser captures at 1440x900 (plus a 1920x1080 pass for the maximized variant). For every Claude reference PNG, the live claude.ai screen and the live agi screen were captured and visually compared.
**Distinct from:** `2026-05-22-claude-parity-r-web.md` (runtime, text-only, no visual layer). This lane closes the visual gap.
**Repo locks consulted:** `v1-local-only-cloud-waitlist-2026-05-18.md`, `rule-models-json-canonical.md`, `frontend-decisions-2026-05-15.md`, `subscription-tiers-2026-05-15.md`, `design-prompt-v1-2026-05-16.md`.

---

## 0. Method & confidence

- **Tooling.** Playwright MCP (`mcp__plugin_playwright_playwright__*`), fresh browser, no extension dependency. Two viewport passes: 1440x900 (default Claude marketing target) and 1920x1080 (Claude `010b_..._maximized` ref). `fullPage: true` used on `/pricing` and `/enterprise` for vertical density.
- **Evidence.** Every claim in the scorecard cites three paths: the Claude reference PNG, the live claude.ai capture, and the live agiworkforce.com capture. If only two paths appear, the third has been explicitly noted as not captured.
- **Bot/CAPTCHA risk.** claude.ai/login redirected once to itself but rendered the marketing layout without challenge; claude.com/pricing rendered fully. No bypass attempted.
- **Cloud-first verification.** No local `pnpm dev` / `pnpm build`. Production agiworkforce.com only.
- **Confidence shorthand.** **H** = both screenshots loaded, full visual comparison made. **M** = one route partially loaded but still readable. **L** = a route gated or scoped out.
- **Claude reference set.** 14 PNGs at `/Users/siddhartha/Desktop/reference/ui/web/claude-{auth,public}/2026-05-15/`. 4 of them are claude-support docs (`011`, `012`, `013`, `016`, `017`, `018`) — those are not equivalent to a live Claude marketing screen. The live equivalents are subsumed in the `/pricing` Individual / Team & Enterprise / API tab captures plus the feature-comparison matrix that lives at the bottom of `/pricing` on claude.com.

---

## 1. Inventory

Legend: ✅ visually at parity · 🟡 visually partial · ❌ visually missing · 🔄 different by design (lock-backed)

All paths absolute.

| #   | Claude reference path                                                                                                    | claude.ai / claude.com live screenshot                                                                                                                                                                                                                                                                         | agiworkforce.com live screenshot                                                                                                                                                                                                                          | Route on AGI                               | Conf |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| 1   | `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png`          | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030_claude-live_login.png`                                                                                                                                                                                                     | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030_agi_login.png`                                                                                                                                                        | `/login`                                   | H    |
| 2   | `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/031_claude-auth_logged-out_plan-cards.png`            | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_claude-live_pricing_individual.png` (closest live equivalent — the plan-cards inside auth flow no longer render at this URL on a fresh browser)                                                                            | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_agi_pricing.png`                                                                                                                                                      | `/pricing` (NOT embedded in auth, by lock) | H    |
| 3   | `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/032_claude-auth_logged-out_team-enterprise-cards.png` | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise.png`                                                                                                                                                                                   | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/032_agi_enterprise.png`                                                                                                                                                   | `/enterprise`                              | H    |
| 4   | `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/080_claude-auth_after-free-logout_signin.png`         | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030_claude-live_login.png` (same surface — claude.ai treats post-logout the same as initial logged-out)                                                                                                                        | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030_agi_login.png`                                                                                                                                                        | `/login`                                   | H    |
| 5   | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/010_claude-public_pricing_top.png`                  | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_claude-live_pricing_individual.png`                                                                                                                                                                                        | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_agi_pricing.png`                                                                                                                                                      | `/pricing`                                 | H    |
| 6   | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/010b_claude-public_pricing_top_maximized.png`       | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010b_claude-live_pricing_maximized_1920.png`                                                                                                                                                                                   | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010b_agi_pricing_maximized_1920.png`                                                                                                                                      | `/pricing` (1920)                          | H    |
| 7   | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/011_claude-support_choose-plan_table.png`           | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise_full.png` (live claude.com has a full feature-comparison matrix at the bottom of `/pricing`, which is the production-grade equivalent of the support-doc table the reference captured) | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_agi_pricing_full.png`                                                                                                                                                 | `/pricing`                                 | H    |
| 8   | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/012_claude-support_pro-plan_benefits.png`           | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_claude-live_pricing_individual_full.png` (Pro plan benefits rendered inline on `/pricing` Individual tab)                                                                                                                  | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_agi_pricing_full.png` (Pro is waitlist-gated, not a card)                                                                                                             | `/pricing` (Pro footer line)               | H    |
| 9   | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/013_claude-support_max-plan_benefits.png`           | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_claude-live_pricing_individual_full.png` (Max plan card rendered inline on `/pricing` Individual tab)                                                                                                                      | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/010_agi_pricing_full.png` (Max is waitlist-gated, not a card)                                                                                                             | `/pricing` (Max footer line)               | H    |
| 10  | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/014_claude-public_pricing_team-enterprise_top.png`  | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise.png`                                                                                                                                                                                   | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/032_agi_enterprise.png` (separate page, not a pricing tab)                                                                                                                | `/enterprise`                              | H    |
| 11  | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/015_claude-public_pricing_api_latest-models.png`    | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/015_claude-live_pricing_api.png`                                                                                                                                                                                               | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/015_agi_providers.png` (closest surface — but ours lacks $/MTok and model-card layout)                                                                                    | `/providers`                               | H    |
| 12  | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/016_claude-support_team-plan_benefits.png`          | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise_full.png` (rendered inline on `/pricing` Team & Enterprise tab)                                                                                                                        | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/032_agi_enterprise_full.png`                                                                                                                                              | `/enterprise`                              | H    |
| 13  | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/017_claude-support_enterprise-plan_benefits.png`    | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise_full.png`                                                                                                                                                                              | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/032_agi_enterprise_full.png`                                                                                                                                              | `/enterprise`                              | H    |
| 14  | `/Users/siddhartha/Desktop/reference/ui/web/claude-public/2026-05-15/018_claude-support_extra-usage_paid-plans.png`      | `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/015_claude-live_pricing_api_full.png` (PAYG/extra-usage exposed via the API tab feature-comparison)                                                                                                                            | not visually captured — `/billing` is auth-walled and `/chat` redirected logged-out users straight to `/login?redirectTo=%2Fchat` (`/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030b_agi_chat_redirects_to_login.png`) | `/billing` (auth-walled)                   | L    |

**Out-of-set additional captures** (for "where we're ahead" + future lanes):

- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/000_agi_home.png` + `_full.png` — AGI homepage (no Claude equivalent screenshot in the reference set).
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/projects_agi.png` — `/projects` AGI page (renders dark on a light site).
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030b_agi_chat_redirects_to_login.png` — proof that `/chat` enforces server-side auth redirect (a delta from the R-WEB audit's "no middleware.ts" reading, see Section 4).

---

## 2. Visual parity scorecard (Layer 1 — does it LOOK like Claude)

Six axes per pair: layout, color palette, typography, icons + style, spacing + density, empty/loading/error states. Lock-aware: where we deliberately chose different by lock, the verdict is 🔄 rather than ❌.

### Pair 1 — `/login` (Claude ref 030) vs AGI `/login`

Claude ref: `claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png`
Claude live: `r26-parity-v-web-screenshots/030_claude-live_login.png`
AGI live: `r26-parity-v-web-screenshots/030_agi_login.png`

| Axis                           | Claude                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | AGI                                                                                                                                                                                                                                                                         | Verdict                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Layout structure               | Split-pane: left auth card + right chat-preview / artifact pane bounded by a rounded panel                                                                                                                                                                                                                                                                                                                                                                                           | Single centered column, no right pane, no marketing hero                                                                                                                                                                                                                    | ❌                                                                                          |
| Color palette                  | Warm cream/parchment background, black text, orange Claude asterisk, black primary CTA, off-white card                                                                                                                                                                                                                                                                                                                                                                               | Warm cream/parchment background (renders close to our `--color-cream-100` / `--color-chat-bg-light`), black text, no brand-accent surfaced (we have `--color-terra-cotta` / `--color-rule` tokens but neither is applied to this page), black primary CTA, off-white inputs | 🟡 (background token family matches; brand-accent token unused on this page)                |
| Typography                     | Serif H1 ("Tiempos Headline" or similar) at ~64px for "Think fast, build faster"; sans body                                                                                                                                                                                                                                                                                                                                                                                          | Sans-serif H1 (looks like Inter/Geist) at ~80px for "Welcome back."; no serif anywhere                                                                                                                                                                                      | ❌                                                                                          |
| Icons + style                  | Google icon (color G logo), Apple icon on the "Download desktop app" CTA, orange Claude asterisk in top-left                                                                                                                                                                                                                                                                                                                                                                         | Spinning AGI mark (mono, multi-ray), no Google/GitHub vendor icons next to the OAuth buttons, no Apple icon                                                                                                                                                                 | 🟡 (own mark is fine; vendor icons missing)                                                 |
| Spacing + info density         | Two-pane layout uses the full 1440 width; left pane is ~33%, right pane is ~50%, big breathing room between H1 and card; "Download desktop app" CTA sits below the card                                                                                                                                                                                                                                                                                                              | Single column at ~40% width centered; no right pane content; lots of empty horizontal space; no Install/Download CTA below the form                                                                                                                                         | ❌                                                                                          |
| Empty / loading / error states | Right pane shows the six quick-chips ("Create a file", "Crunch data", "Make a prototype", "Prep for the day", "Organize files", "Send a message") on the live page — BUT the chat-input area + "Summarize this research..." teaser + "Q2 UX Research" pill + orange "Let's go" CTA that appeared in the reference (2026-05-15) are NO LONGER PRESENT on the live capture (2026-05-22). Claude appears to have removed the populated chat-input teaser between the reference and now. | No empty-state preview, no chat teaser, no quick-chips                                                                                                                                                                                                                      | ❌ (live Claude is partially regressed from the reference; AGI is still behind both states) |

**Overall verdict for Pair 1: ❌ — the largest single visual gap, with a caveat.** AGI's `/login` is a generic auth form on the right palette; Claude's is a marketing surface that doubles as auth. The Claude live capture **differs from the reference**: it kept the split-pane chrome and the six quick-chips, but dropped the chat-input teaser content. This means live Claude has partially regressed on `/login` between 2026-05-15 and 2026-05-22 (or the teaser is lazy-loaded behind a delay our 2-second wait didn't catch). The structural gap on our side is unchanged either way — we need the split-pane and at minimum the quick-chip strip to begin matching Claude's structural intent.

### Pair 2 — Claude's in-auth "Explore plans" (ref 031) vs AGI `/pricing`

Claude ref: `claude-auth/2026-05-15/031_claude-auth_logged-out_plan-cards.png`
Closest claude.ai/com live equivalent: `r26-parity-v-web-screenshots/010_claude-live_pricing_individual.png` (the auth-embedded "Explore plans" surface in ref 031 has been folded into claude.com/pricing; clicking Login on claude.com brings up a modal, not a pricing surface)
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing.png`

| Axis                           | Claude                                                                                                                                                                                                 | AGI                                                                                                                             | Verdict                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Layout structure               | Three plan cards (Free / Pro / Max) with embedded tabs `Individual` / `Team and Enterprise`                                                                                                            | Three plan cards (Local / BYOK / Hobby) with a monthly/annual toggle                                                            | 🔄 (the cards are 3:3, but AGI's three are the FREE plans + Hobby; Claude's three are Free + paid Pro + paid Max) |
| Color palette                  | Same cream background, black/white cards, black CTAs                                                                                                                                                   | Same cream background, white cards, black CTAs (the Hobby card has a slightly different shadow weight)                          | ✅                                                                                                                |
| Typography                     | Serif card titles ("Free", "Pro", "Max") at ~32px                                                                                                                                                      | Sans-serif card eyebrows ("LOCAL", "BYOK", "HOBBY") at ~14px tracked-uppercase; sans-serif card values ("Free", "$10") at ~64px | ❌ (different typographic register entirely)                                                                      |
| Icons + style                  | Each card has a hand-drawn plant illustration above the title — recognizable as Claude's brand motif. Free = sapling, Pro = sapling with petals, Max = blooming flower. Black/orange ink-pen line art. | No plan icons. Each card is a clean white panel with no decorative art.                                                         | ❌                                                                                                                |
| Spacing + info density         | Each card is generously padded, cards span ~30% width each, ~24px gap                                                                                                                                  | Cards are similarly padded but feature-checkmark list is denser and starts immediately under the price                          | 🟡 (close, but Claude's card breathes more)                                                                       |
| Empty / loading / error states | N/A — pricing                                                                                                                                                                                          | N/A — pricing                                                                                                                   | n/a                                                                                                               |

**Overall verdict for Pair 2: 🔄 (different by design, per `v1-local-only-cloud-waitlist-2026-05-18.md`) + 🟡 on visual treatment.** We chose not to embed plan cards in `/login` (and we chose to gate paid tiers behind waitlist), so the structural difference is lock-backed. But within `/pricing`, we are visually less expressive than Claude — see also Pair 5.

### Pair 3 — Claude `/pricing` Team & Enterprise tab (ref 032) vs AGI `/enterprise`

Claude ref: `claude-auth/2026-05-15/032_claude-auth_logged-out_team-enterprise-cards.png`
Claude live: `r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise.png`
AGI live: `r26-parity-v-web-screenshots/032_agi_enterprise.png`

| Axis                           | Claude                                                                                                                                                                | AGI                                                                                                                                                  | Verdict                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Layout structure               | Two side-by-side plan cards ("Team" 5-150 users / "Enterprise" 20+ users), each with sub-cards for Standard seat ($20) / Premium seat ($100), feature checklist below | Single-column page, big H1 "The same product. With the controls your security team needs.", paragraph copy, then a `What's included` definition list | ❌ (Claude is a card-based comparison, AGI is a marketing essay)                                                        |
| Color palette                  | Cream background, white card panels, black/grey text                                                                                                                  | Cream background, no card panels, black/grey text on background                                                                                      | 🟡 (palette matches, but elevation/depth differs)                                                                       |
| Typography                     | Serif card titles "Team" / "Enterprise" at ~36px                                                                                                                      | Sans-serif H1 at ~64px ("The same product...")                                                                                                       | ❌                                                                                                                      |
| Icons + style                  | Each card has a hand-drawn storefront / building illustration (Team = shop, Enterprise = office building); orange-and-black ink line art                              | No illustrations at all; just black text on cream                                                                                                    | ❌                                                                                                                      |
| Spacing + info density         | Wide layout (~80% of 1440 viewport), two cards each ~40%, generous gaps; user-count pill "5-150 users" / "20+ users" floats in top-right of each card                 | Narrower content column (~60%), all content stacks vertically, definition list with light grey row dividers                                          | ❌ (Claude is comparison-shop UX, AGI is sales-page UX)                                                                 |
| Empty / loading / error states | "Get Team plan" + "Get Enterprise plan" CTAs visible on the cards                                                                                                     | Single "Contact sales" CTA much further down the page                                                                                                | 🔄 (lock: we don't have a self-serve Team tier; per `v1-local-only-cloud-waitlist-2026-05-18.md` Team is post-waitlist) |

**Overall verdict for Pair 3: ❌ + 🔄.** The lock removes the Team-tier card, but the Enterprise card itself is also missing — Claude leads with `Enterprise / Flexible pooled usage / Seat price + usage at API rates / $20/seat`. We lead with prose. A reader scanning for "what does Enterprise cost?" finds a number on Claude and a paragraph on us.

### Pair 4 — Claude post-logout sign-in with artifact (ref 080) vs AGI `/login`

Same paths as Pair 1; same verdict — the post-logout state on claude.ai does not differ visually from the initial logged-out state. AGI also does not differentiate, so structurally we match. But because AGI has no right-pane preview at all, we are equally behind on both refs.

### Pair 5 — Claude `/pricing` top (ref 010) vs AGI `/pricing`

Claude ref: `claude-public/2026-05-15/010_claude-public_pricing_top.png`
Claude live: `r26-parity-v-web-screenshots/010_claude-live_pricing_individual.png`
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing.png`

| Axis                           | Claude                                                                                                                                               | AGI                                                                                                                                                                                                                                  | Verdict                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Layout structure               | Center-aligned hero "Pricing" H1; three-segment pill tab (Individual / Team & Enterprise / API) directly below; three plan cards centered below tabs | Left-aligned page header "Simple pricing." H1 followed by left-aligned paragraph; monthly/annual toggle pill above three plan cards; cards centered                                                                                  | ❌                                                  |
| Color palette                  | Cream background, off-white card surfaces, black text, subtle grey separators, white pill on the active tab segment                                  | Cream background (close to our `--color-cream-100`), white card surfaces (close to `--color-cream-50`), black text, warm-toned checkmarks in feature lists (likely an instance of `--color-terra-cotta` or `--color-warm-peach-500`) | 🟡 (very close; AGI's checkmarks are subtly warmer) |
| Typography                     | Serif page H1 ("Pricing", ~80px); serif card titles; sans body                                                                                       | Sans-serif page H1 ("Simple pricing.", ~80px); sans card eyebrow + sans card price; sans throughout                                                                                                                                  | ❌                                                  |
| Icons + style                  | Pill tabs + plant illustrations on each card + a top breadcrumb ("Pricing" + "Explore here" right-aligned chevron)                                   | No tabs (we have six tiers stacked, not three segmented), no plant icons, no breadcrumb                                                                                                                                              | ❌                                                  |
| Spacing + info density         | Card width ~33% each, ~32px gap, generous vertical padding inside cards                                                                              | Card width ~33% each, ~24px gap, similar vertical padding, but no illustration eats up less vertical space so the card looks shorter                                                                                                 | 🟡                                                  |
| Empty / loading / error states | n/a                                                                                                                                                  | n/a                                                                                                                                                                                                                                  | n/a                                                 |

**Overall verdict for Pair 5: ❌ on typography and decorative iconography; 🟡 on palette and card geometry.** This is the second-largest visual gap and probably the highest-leverage one — `/pricing` is the conversion page.

### Pair 6 — Claude `/pricing` maximized 1920 (ref 010b) vs AGI `/pricing` at 1920

Claude ref: `claude-public/2026-05-15/010b_claude-public_pricing_top_maximized.png`
Claude live: `r26-parity-v-web-screenshots/010b_claude-live_pricing_maximized_1920.png`
AGI live: `r26-parity-v-web-screenshots/010b_agi_pricing_maximized_1920.png`

| Axis                           | Claude                                                                                                                          | AGI                                                                                                                                                                                                                              | Verdict                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Layout structure               | Top breadcrumb "Pricing" + "Explore here" anchor; centered "Pricing" hero; three-tab pill; three cards                          | No breadcrumb, no "Explore here" anchor; left-aligned hero; monthly/annual toggle; three cards + a single-line footer "Pro $29.99/mo · Pro+ $49.99/mo · Max $299.99/mo - all on the waitlist..." + Enterprise contact-sales link | ❌ on breadcrumb / 🔄 on the waitlist footer (lock-backed) |
| Color palette                  | Same as 1440                                                                                                                    | Same as 1440                                                                                                                                                                                                                     | ✅                                                         |
| Typography                     | Same as 1440                                                                                                                    | Same as 1440                                                                                                                                                                                                                     | ❌                                                         |
| Icons + style                  | Hand-drawn plant illustrations carry through at 1920                                                                            | No icons                                                                                                                                                                                                                         | ❌                                                         |
| Spacing + info density         | At 1920 the breadcrumb anchors flank the cream banner — heavy use of horizontal whitespace; cards sit at center 50% of viewport | At 1920 the cards expand to fill more of the viewport (~70% of width), the waitlist footer line spans the full content row                                                                                                       | 🟡 (different but valid choices)                           |
| Empty / loading / error states | n/a                                                                                                                             | n/a                                                                                                                                                                                                                              | n/a                                                        |

**Overall verdict for Pair 6: ❌** on breadcrumb + decorative art, **🔄** on the waitlist footer, **🟡** on density.

### Pair 7 — Claude support `/articles/choose-plan` table (ref 011) vs AGI `/pricing` full

Claude ref: `claude-public/2026-05-15/011_claude-support_choose-plan_table.png`
Claude live equivalent: `r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise_full.png` — this full-page capture shows the giant feature-comparison matrix that Claude ships at the bottom of `/pricing` (see screenshot — multiple "Features and capabilities", "Security and administration", "Payment options", "Partnership", "Health and usage" row groups × four columns of plans). The reference's support-doc table is a slimmer 5-column version of this.
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing_full.png`

| Axis                           | Claude                                                                                            | AGI                                                                | Verdict |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------- |
| Layout structure               | Bottom-of-page feature-comparison MATRIX with ~50+ rows × 4 columns of plans, grouped by category | No matrix; just three plan cards + a one-line waitlist + footer    | ❌      |
| Color palette                  | Same cream + white row alternation, check/dash glyphs                                             | n/a (matrix absent)                                                | ❌      |
| Typography                     | Sans-serif tabular labels, light row dividers                                                     | n/a                                                                | ❌      |
| Icons + style                  | Black checkmarks in cells, em-dash or empty cells for "not included"                              | n/a                                                                | ❌      |
| Spacing + info density         | Very high — this is the densest page on the entire claude.com site                                | Very low — no equivalent comparison density anywhere on `/pricing` | ❌      |
| Empty / loading / error states | n/a                                                                                               | n/a                                                                | n/a     |

**Overall verdict for Pair 7: ❌ — single biggest "content-mass" delta.** Even ignoring typography and icons, claude.com's /pricing is ~3-4× as tall as agi's once you scroll, because of the matrix. This is a high-trust conversion artifact: enterprises scan it before talking to sales.

### Pair 8 — Claude Pro plan benefits doc (ref 012) vs AGI `/pricing` Pro mention

Claude ref: `claude-public/2026-05-15/012_claude-support_pro-plan_benefits.png`
Claude live equivalent: `r26-parity-v-web-screenshots/010_claude-live_pricing_individual_full.png` (Pro plan card renders inline)
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing_full.png` (Pro is the `Pro $29.99/mo - all on the waitlist` line)

**Overall verdict for Pair 8: 🔄 (lock-backed).** Per `v1-local-only-cloud-waitlist-2026-05-18.md`, Pro is waitlist-gated until security audit closes. We deliberately do NOT surface a Pro benefits doc; instead we surface the price + waitlist gate. Visual delta is intentional. Once the lock is released, this becomes ❌ until we ship a Pro details page.

### Pair 9 — Claude Max plan benefits doc (ref 013) vs AGI `/pricing` Max mention

Same as Pair 8, but for Max ($299.99/mo). Verdict 🔄.

### Pair 10 — Claude `/pricing` Team & Enterprise tab (ref 014) vs AGI `/pricing` (no equivalent tab) + `/enterprise`

Claude ref: `claude-public/2026-05-15/014_claude-public_pricing_team-enterprise_top.png`
Claude live: `r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise.png`
AGI live (closest): `r26-parity-v-web-screenshots/032_agi_enterprise.png`

| Axis                           | Claude                                                                                                                                                                            | AGI                                                                                                                   | Verdict |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| Layout structure               | Three-tab pill at top with Team & Enterprise selected; "Which plan is right for you?" QUIZ card with curved arrow pointing into it; below that, two large Team + Enterprise cards | No equivalent tab on `/pricing` at all; `/enterprise` is a separate marketing page with a left-aligned long-form hero | ❌      |
| Color palette                  | Same cream + white panels                                                                                                                                                         | Same cream, no panels                                                                                                 | 🟡      |
| Typography                     | Serif card titles                                                                                                                                                                 | Sans-serif H1                                                                                                         | ❌      |
| Icons + style                  | Curved arrow illustration pointing to the QUIZ card, question-mark icon, building/store illustrations                                                                             | No QUIZ widget, no decorative illustrations                                                                           | ❌      |
| Spacing + info density         | Medium — hero + quiz + 2 cards                                                                                                                                                    | Higher prose density, but no card-based comparison                                                                    | ❌      |
| Empty / loading / error states | n/a                                                                                                                                                                               | n/a                                                                                                                   | n/a     |

**Overall verdict for Pair 10: ❌ across all axes**, with no lock backing the gap. Worth fixing — adding either a Team & Enterprise tab to `/pricing` (mirroring Claude's IA) or surfacing the Enterprise card on `/pricing`.

### Pair 11 — Claude `/pricing` API tab (ref 015) vs AGI `/providers`

Claude ref: `claude-public/2026-05-15/015_claude-public_pricing_api_latest-models.png`
Claude live: `r26-parity-v-web-screenshots/015_claude-live_pricing_api.png`
AGI live: `r26-parity-v-web-screenshots/015_agi_providers.png`

| Axis                           | Claude                                                                                                                                                                                                                                                                       | AGI                                                                                                                                                                                                                                                                                                                                            | Verdict                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Layout structure               | Centered "Pricing" hero + API tab selected; horizontal divider then "Latest models" left-aligned heading + Contact sales / Start building right-aligned CTAs; three model cards (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) with Input / Output / Prompt caching rows showing $/MTok | Left-aligned "Twelve brains. One thread." hero + paragraph; "The roster" eyebrow + a 4-column × 3-row grid of provider chips (Anthropic Claude family, OpenAI GPT family, Google Gemini family, xAI Grok family, DeepSeek V&R, Perplexity Sonar, Qwen, Moonshot Kimi, Zhipu GLM, Ollama, LM Studio, Custom BYO) with BYOK / OAUTH / LOCAL tags | ❌                                                                                  |
| Color palette                  | Cream + white cards + black text                                                                                                                                                                                                                                             | Cream + grid cells without strong card chrome + black text + tiny grey eyebrows                                                                                                                                                                                                                                                                | 🟡                                                                                  |
| Typography                     | Serif page H1 + serif model card titles ("Opus 4.7", "Sonnet 4.6", "Haiku 4.5") + sans tabular pricing rows                                                                                                                                                                  | Sans-serif page H1 + sans provider names + sans family names + tiny tracked-uppercase BYOK/OAUTH/LOCAL chips                                                                                                                                                                                                                                   | ❌                                                                                  |
| Icons + style                  | No model logos; pure typographic cards with horizontal dividers                                                                                                                                                                                                              | No vendor logos; pure typographic grid; tag chips render as small text labels, no border/box                                                                                                                                                                                                                                                   | ❌                                                                                  |
| Spacing + info density         | Generous; 3 cards span full content width                                                                                                                                                                                                                                    | Higher density (12 providers in 4 cols × 3 rows)                                                                                                                                                                                                                                                                                               | 🟡 (intentionally denser because AGI ships more providers; trade-off is reasonable) |
| Empty / loading / error states | n/a                                                                                                                                                                                                                                                                          | n/a                                                                                                                                                                                                                                                                                                                                            | n/a                                                                                 |

**Overall verdict for Pair 11: ❌ on the $/MTok display, but 🔄/🟡 on the IA divergence** — Claude leads with their three models because they only have one provider; AGI leads with 12 providers because that's our actual breadth advantage. The visual divergence is in service of opposite value props. The hard miss is that AGI's `/providers` does not surface $/MTok pricing anywhere, even though `packages/types/src/models.json` carries the data (this is the R-WEB recommendation R26-PARITY-RUNTIME-WEB-03 — visual layer confirms it).

### Pair 12-14 — Claude support docs for Team / Enterprise / Extra-usage (refs 016, 017, 018)

These three Claude refs are help-center articles (support.claude.com). The production-grade equivalents on claude.com live inline on `/pricing` (the long feature-comparison matrix, and individual plan benefit blocks). AGI's equivalent surface for Team/Enterprise is `/enterprise` (see Pair 3) and for extra-usage is `/billing` (auth-walled, not captured). The same verdicts apply: 🔄 on Team (we don't sell Team self-serve), ✅ on Enterprise content (we cover SSO/SCIM/audit/residency in our text, per R-WEB), ❌ on extra-usage discoverability from `/pricing`.

---

## 3. Specific visual gaps

Each gap cites the Claude ref + the agi live screenshot.

**G1. Login lacks a marketing right-pane.**
Claude ref: `/Users/siddhartha/Desktop/reference/ui/web/claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png` (split layout with serif hero + chat preview right-pane + plant motif).
AGI live: `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/030_agi_login.png` (centered form, no marketing).
Severity: P0. First-impression page for any visitor whose first link is `/login`.

**G2. Login uses sans-serif H1 where Claude uses serif.**
Same pair as G1. Claude's serif "Think fast, build faster" sets the brand tone; AGI's sans "Welcome back." is generic.
Severity: P1. Tied to wider brand-typography decision — see G7.

**G3. `/pricing` lacks the three-segment IA tab (Individual / Team & Enterprise / API).**
Claude refs: `010_claude-public_pricing_top.png`, `014_claude-public_pricing_team-enterprise_top.png`, `015_claude-public_pricing_api_latest-models.png`.
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing.png`.
Severity: P1. Claude's IA scales to API + Team without overloading the page; ours has a six-tier stack that doesn't.

**G4. `/pricing` lacks the bottom feature-comparison matrix.**
Claude live: `r26-parity-v-web-screenshots/014_claude-live_pricing_team-enterprise_full.png` (matrix visible bottom half).
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing_full.png` (no matrix).
Severity: P0. Enterprise scan-shoppers expect this; we cannot match Claude on serious-buyer trust without it.

**G5. `/pricing` lacks decorative plant illustrations.**
Claude refs: 010, 010b, 014, 031.
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing.png`, `r26-parity-v-web-screenshots/010b_agi_pricing_maximized_1920.png`.
Severity: P2. Pure brand-personality decoration; not load-bearing but affects warmth perception.

**G6. `/pricing` lacks the breadcrumb + "Explore here" anchor at 1920.**
Claude ref: `010b_claude-public_pricing_top_maximized.png`.
AGI live: `r26-parity-v-web-screenshots/010b_agi_pricing_maximized_1920.png`.
Severity: P2. Improves discoverability once the page is long; pairs with G4.

**G7. Brand typography renders sans-serif on AGI even though a serif token is registered.**
Claude refs: 010, 014, 015, 030, 031, 032 — every H1 across the marketing site is a Tiempos-class serif.
AGI live: `r26-parity-v-web-screenshots/000_agi_home.png` (H1 "Beyond one model. Beyond one surface. AGI in your hands." — sans), `r26-parity-v-web-screenshots/010_agi_pricing.png` (H1 "Simple pricing." — sans), `r26-parity-v-web-screenshots/032_agi_enterprise.png` (H1 "The same product. With the controls your security team needs." — sans).
Token evidence: `apps/web/app/globals.css` already registers `--font-heading: var(--font-newsreader), Georgia, 'Times New Roman', serif` plus `--font-display`, `--font-body`, and `--font-sans` all pointing at `var(--font-newsreader)` (per the "Operator-Broadsheet redesign 2026-05-05" comment). The token system is right — every marketing H1 should be Newsreader serif. The captured H1s rendering as sans means either Newsreader is not actually loading (no `@font-face` injection succeeded), or the H1 elements apply a per-element class that overrides the heading family (e.g. a Tailwind `font-sans` utility, or a literal `font-family: ...` override).
Severity: P1. Hits every page. This is a wire-up bug, not a design choice — the design system was already updated to "Operator-Broadsheet" on 2026-05-05 and never reached the rendered DOM.

**G8. `/enterprise` is a long-form essay; Claude's enterprise is card-comparison.**
Claude ref: `032_claude-auth_logged-out_team-enterprise-cards.png`, live `014_claude-live_pricing_team-enterprise.png`.
AGI live: `r26-parity-v-web-screenshots/032_agi_enterprise.png`.
Severity: P1. We have the content (per R-WEB the text is ahead) but it's harder to scan.

**G9. `/providers` does not surface $/MTok pricing visually.**
Claude ref: `015_claude-public_pricing_api_latest-models.png` ($5/$3/$1 input prices visible on each model card).
AGI live: `r26-parity-v-web-screenshots/015_agi_providers.png` (provider chips only, no $/MTok).
Severity: P0. The data is in `packages/types/src/models.json`; the visual layer never renders it. BYOK is our primary v1 monetisation pitch — visitors deserve to see what they'd pay providers.

**G10. Vendor OAuth icons missing on `/login` ("Continue with Google" + "Continue with GitHub" are text-only).**
Claude ref: `030_claude-auth_logged-out_signin-entry.png` has the multicolor Google G next to "Continue with Google".
AGI live: `r26-parity-v-web-screenshots/030_agi_login.png` — no Google G, no GitHub mark.
Severity: P1. Tiny visual polish that signals trust.

**G11. `/projects` renders DARK on an otherwise LIGHT site.**
Claude does not gate this surface logged-out, so no claude.ai equivalent screenshot. But our cream-light treatment is consistent everywhere else on agiworkforce.com — except `/projects`.
AGI live: `r26-parity-v-web-screenshots/projects_agi.png` (dark theme: the background reads near-`--color-paper` / `--color-surface-base`, the text reads near-`--color-ink`).
Token evidence: the dark surface tokens (`--color-paper`, `--color-graphite`, `--color-surface-base`, `--color-chat-bg-dark`) exist for the chat / app shell. `/projects` is likely importing the chat-app surface token group instead of the marketing-page light tokens (`--color-cream-100`, `--color-chat-bg-light`). Either rebind the route to the marketing surface tokens or move the route into the chat app shell.
Severity: P0. Theme inconsistency hurts trust. The fix is a token-surface decision, not a literal-color decision.

**G12. AGI brand mark vs Claude brand mark.**
Claude's orange asterisk-star is on every page top-left.
AGI's mark is a mono spinning ray + the wordmark `agi.workforce` — `r26-parity-v-web-screenshots/000_agi_home.png` shows it. The mark is less distinctive at a glance and the wordmark `agi.workforce` exposes our internal slug while public-brand lock says we are `AGI` (per `locks/brand-agi-2026-05-15.md`).
Severity: P1. Brand consistency. The runtime audit didn't catch this because it never looked at the logo pixels.

**G13. Top nav exposes `Sign in` text-link only; Claude exposes Login + Try Claude (primary CTA) + Contact sales (secondary CTA).**
Claude refs: 014, 015, 032 all show the right side of the nav as `Login` (text) + `Contact sales` (outline pill) + `Try Claude` (black filled pill).
AGI live: `r26-parity-v-web-screenshots/000_agi_home.png` — right side is text links `Providers / Pricing / Compare / About / Sign in` + a single black `Install` button.
Severity: P1. Enterprise traffic landing on the home or `/pricing` has no top-nav path to Sales. Already R-WEB-RUNTIME-05; visual layer confirms.

**G14. Footer trust signal asymmetry.**
Claude footer (in 014/032 full captures, visible as the dark-background block at the bottom): brand wordmark + nav columns + © Anthropic line.
AGI live: `r26-parity-v-web-screenshots/010_agi_pricing_full.png` shows the AGI footer — brand wordmark + nav columns + `© 2026 AGI Automation LLC · Austin, Texas` AND `We do not train on your data.` right-aligned on the bottom row.
Severity: AGI advantage (no fix).

---

## 4. Where AGI is visually AHEAD of Claude

These are surfaces where our visual treatment is better, more honest, or more functional than Claude's.

**A1. `/pricing` is faster to scan if you already know which plan you want.**
Claude has six tiers (Free, Pro, Max 5x, Max 20x, Team, Enterprise) spread across three tabs. AGI has three visible cards (Local, BYOK, Hobby) + one-line waitlist for Pro/Pro+/Max + Enterprise contact-sales link. A returning visitor on AGI sees their entire decision tree in a single viewport at 1440. Evidence: `r26-parity-v-web-screenshots/010_agi_pricing.png` vs `r26-parity-v-web-screenshots/010_claude-live_pricing_individual.png` — AGI shows three cards + price; Claude shows three cards + the user must tab to see API, Team, Enterprise.

**A2. Footer trust signal "We do not train on your data."**
Visible in `r26-parity-v-web-screenshots/010_agi_pricing_full.png` bottom-right corner. Claude has nothing equivalent — privacy posture is buried in their policy page rather than surfaced as a footer headline.

**A3. Provider breadth visible on `/providers`.**
12 providers visible at once on `r26-parity-v-web-screenshots/015_agi_providers.png` (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, Custom BYO) with explicit BYOK / OAUTH / LOCAL tags. Claude shows only Claude (`015_claude-live_pricing_api.png`). Our breadth is the entire point; we show it.

**A4. Honest enterprise candor.**
`r26-parity-v-web-screenshots/032_agi_enterprise.png` — H1 reads `The same product. With the controls your security team needs.` plus `One CTA at the bottom of the page. We are not going to chase you with three.` Claude's enterprise page does not include this kind of self-aware copy. It's a tonal advantage that the visual layer reinforces (single bold CTA, no marketing splash).

**A5. Magic-link sign-in + GitHub OAuth on `/login`.**
`r26-parity-v-web-screenshots/030_agi_login.png` shows `Email me a sign-in link →` and `Continue with GitHub`. Claude offers Google + email-password only on `r26-parity-v-web-screenshots/030_claude-live_login.png`. Developer-onboarding ergonomics are better on AGI — visible at a glance once the form is loaded.

**A6. Server-side auth redirect on `/chat` (verified via network capture).**
`r26-parity-v-web-screenshots/030b_agi_chat_redirects_to_login.png` shows the post-redirect state. The network capture for the document request to `https://agiworkforce.com/chat` returned a **`307` Temporary Redirect** to `https://agiworkforce.com/login?redirectTo=%2Fchat`. A `307` on the doc request means the auth wall is enforced server-side (middleware, a Next.js `redirect()` in the route, or a host-level rewrite) — not by client-side `router.replace`. The R-WEB runtime audit flagged "no `middleware.ts`" in `apps/web/` and concluded SSR HTML was empty for `/chat`. That filesystem fact may still be true, but the runtime conclusion ("logged-out direct-link visitors see empty SSR" / "no middleware redirect") is **stale or incomplete** — there is _some_ server-side redirect mechanism (route handler, page-level `redirect()`, or platform rewrite). SEO crawlers requesting `/chat` see a 307 to `/login`, not empty HTML.

**A7. AGI shows three currently-shipping product CTAs upfront.**
On `r26-parity-v-web-screenshots/000_agi_home.png` the visible above-the-fold value prop is `Install` (primary) + `Try the demo →` (secondary) + the `10+ providers in one thread` lede with `One platform. Every model. Your choice.` Claude's home page (claude.com) is more institutional. We win on "what do I do next" clarity from the homepage.

**A8. Marketing surface coverage.**
Top-nav exposes Providers / Pricing / Compare / About as distinct first-class surfaces (`r26-parity-v-web-screenshots/000_agi_home.png`). Claude's nav clusters everything under dropdowns. This is a discoverability advantage.

---

## 5. Recommendations — R26-PARITY-VISUAL-WEB-N

Each item references the gap (`G#`) and where the visual evidence sits.

**Design-token directive (LOCKED for this audit).** No recommendation may cite a hardcoded color literal (`#hex`, `rgb()`, `hsl()`, or a CSS named color). Every color reference must name an existing token from `apps/web/app/globals.css` (e.g. `--color-cream-100`, `--color-paper`, `--color-terra-cotta`, `--color-rule`, `--color-chat-bg-light`, `--color-surface-base`) or recommend adding a NEW named token. Token inventory inspected at audit time: cream surface tokens (`--color-cream-50/100/200`, `--color-chat-bg-light`, `--color-chat-sidebar-light`), dark surface tokens (`--color-paper`, `--color-graphite`, `--color-charcoal-900/800/700`, `--color-surface-base/elevated/overlay/hover`, `--color-chat-bg-dark`), brand-accent tokens (`--color-rule` phosphor mint, `--color-terra-cotta-*`, `--color-warm-peach-*`), serif font token (`--font-newsreader` → `--font-heading` / `--font-display` / `--font-body` / `--font-sans`), and the shadcn semantic family (`--color-primary`, `--color-accent`, `--color-muted`, etc.).

### P0 — Visible on first glance; hurts trust/conversion

**R26-PARITY-VISUAL-WEB-01 — Add a right-pane marketing preview to `/login`.**
Gap: G1, G2.
Evidence: `030_claude-live_login.png` (Claude does this) vs `030_agi_login.png` (we don't).
File: `apps/web/app/login/page.tsx` + a new `LoginPreview.tsx` (could reuse `AgiChatDemo` from the homepage).
Visual targets: serif H1 left, chat-preview / quick-chip card right pane, "Install desktop" CTA below auth card.
Effort: 6-8 h.

**R26-PARITY-VISUAL-WEB-02 — Ship the `/pricing` feature-comparison matrix.**
Gap: G4.
Evidence: `014_claude-live_pricing_team-enterprise_full.png` shows Claude's matrix; `010_agi_pricing_full.png` shows ours has nothing equivalent.
File: `apps/web/app/pricing/page.tsx`. Drive rows from `BILLING_PLAN_PRICING` and a new `MARKETING_FEATURE_MATRIX` constant; columns = Local / BYOK / Hobby / Pro / Pro+ / Max / Enterprise. Never hardcode plan IDs (lock).
Effort: 6-8 h.

**R26-PARITY-VISUAL-WEB-03 — Surface $/MTok pricing visually on `/providers`.**
Gap: G9.
Evidence: `015_claude-live_pricing_api.png` ships $5/$3/$1 input prices per model card; `015_agi_providers.png` ships nothing per provider beyond `BYOK` tags.
File: `apps/web/app/providers/page.tsx`. Pull `defaultPricing.inputPerMillion` / `outputPerMillion` from `packages/types/src/models.json` at build. Render either: (a) inline `$3 in / $15 out` chips on each provider card, or (b) an expandable details row.
Effort: 3-4 h.

**R26-PARITY-VISUAL-WEB-04 — Fix the dark-theme `/projects` page on a light-theme site.**
Gap: G11.
Evidence: `projects_agi.png` (dark) vs every other page (cream). No Claude ref because Claude gates this surface.
File: `apps/web/app/projects/page.tsx` + whichever component is overriding the theme. The page is reading the chat-shell surface tokens (`--color-paper`, `--color-surface-base`, `--color-chat-bg-dark`); rebind the route's background utility to the marketing-page surface tokens (`bg-cream-100` / `bg-chat-bg-light` via `var(--color-cream-100)` / `var(--color-chat-bg-light)`), OR move the route under the chat-app shell so the dark treatment is intentional and consistent with every other authenticated surface. No literal color values; the tokens already exist on both sides — pick the right one.
Effort: 1-2 h.

### P1 — Visible after attention; meaningful brand/conversion impact

**R26-PARITY-VISUAL-WEB-05 — Diagnose why `--font-newsreader` doesn't reach marketing H1s.**
Gap: G2, G7.
Evidence: every Claude reference H1 (010, 014, 015, 030, 031, 032) is serif; every agi capture H1 (000_agi_home, 010_agi_pricing, 030_agi_login, 032_agi_enterprise) is sans.
Tokens involved: `--font-heading`, `--font-display`, `--font-body`, `--font-sans` (all four already point at `var(--font-newsreader), Georgia, 'Times New Roman', serif` in `apps/web/app/globals.css`).
Diagnosis steps (in order): (a) inspect `apps/web/app/layout.tsx` for the `next/font` `Newsreader` registration — is `--font-newsreader` being assigned to a `<html className=>` or `<body>` className? (b) inspect each H1 component for an explicit `font-sans` or `style={{ fontFamily }}` override that beats the token; (c) verify the produced CSS variable `--font-newsreader` is actually present in the inspector. Then either fix the font registration or remove the per-element override. Do NOT add a new font literal; the token chain is correct, the wire is broken.
Effort: 2-4 h.

**R26-PARITY-VISUAL-WEB-06 — Add IA tabs to `/pricing` (Individual / Team & Enterprise / API).**
Gap: G3.
Evidence: `010_claude-live_pricing_individual.png` + `014_claude-live_pricing_team-enterprise.png` + `015_claude-live_pricing_api.png` all share the same three-segment pill.
File: `apps/web/app/pricing/page.tsx`. Keep the six-tier model under "Individual" tab; move Enterprise card under "Team & Enterprise"; expose `/providers` $/MTok content under "API".
Effort: 4-6 h.

**R26-PARITY-VISUAL-WEB-07 — Refactor `/enterprise` to a card-led layout.**
Gap: G8.
Evidence: `014_claude-live_pricing_team-enterprise.png` (Claude card layout) vs `032_agi_enterprise.png` (essay layout).
File: `apps/web/app/enterprise/page.tsx`. Lead with a single Enterprise card (price floor + per-seat / per-API-rate copy + bold CTA), keep the SSO/SCIM/audit/residency table below as "What's included", drop the long prose intro.
Effort: 4-6 h.

**R26-PARITY-VISUAL-WEB-08 — Add vendor OAuth icons to `/login`.**
Gap: G10.
Evidence: `030_claude-live_login.png` shows Google G next to button text; `030_agi_login.png` shows text-only.
File: `apps/web/app/login/page.tsx` or `apps/web/features/auth/components/OAuthButtons.tsx`. Use shared `lucide-react` icons or the existing brand glyph set.
Effort: 0.5 h.

**R26-PARITY-VISUAL-WEB-09 — Rationalize brand wordmark.**
Gap: G12.
Evidence: `000_agi_home.png` shows `agi.workforce` wordmark; `locks/brand-agi-2026-05-15.md` says public brand is `AGI`.
File: `apps/web/components/layout/Header.tsx` + the SVG mark in `apps/web/public/`. Either drop `.workforce` from the wordmark or replace with a single `AGI` lockup matching the lock.
Effort: 1-2 h (mostly design).

**R26-PARITY-VISUAL-WEB-10 — Add `Contact sales` to top nav.**
Gap: G13.
Evidence: `000_agi_home.png` lacks it; every claude ref nav has it.
File: `apps/web/components/layout/Header.tsx`. Outline-style pill right of `Sign in`.
Effort: 0.5 h.

### P2 — Polish, brand warmth, density

**R26-PARITY-VISUAL-WEB-11 — Ship decorative plan illustrations on `/pricing`.**
Gap: G5.
Evidence: every Claude pricing ref (010, 010b, 014, 031) has hand-drawn plant illustrations on the cards; agi has none.
File: New SVG assets in `apps/web/public/illustrations/` referenced from `apps/web/app/pricing/page.tsx`. Could commission or use an open-source botanical set; aim for ink-pen line art consistent with our typography.
Effort: 3-6 h (mostly art direction).

**R26-PARITY-VISUAL-WEB-12 — Add breadcrumb + "Explore here" anchor on `/pricing`.**
Gap: G6.
Evidence: `010b_claude-live_pricing_maximized_1920.png` shows the breadcrumb row above the hero; `010b_agi_pricing_maximized_1920.png` does not.
File: `apps/web/app/pricing/page.tsx`. Sticky secondary nav with anchor links into the matrix sections once R26-PARITY-VISUAL-WEB-02 lands. Effort: 2 h.

**R26-PARITY-VISUAL-WEB-13 — Identify the mechanism behind the `/chat` 307 and reconcile with R-WEB.**
Evidence: `030b_agi_chat_redirects_to_login.png` + network capture showing `[GET] https://agiworkforce.com/chat => 307`. R-WEB Section 4 row 1 says "no middleware.ts" and concludes SSR HTML is empty for `/chat`. The 307 disproves the "empty SSR" conclusion (crawlers see a redirect, not blank HTML), but R-WEB's filesystem read may still be correct — the redirect could come from a page-level `redirect()`, a route handler, or a platform rewrite rather than `middleware.ts`.
Action: identify which mechanism is doing the redirect (grep `apps/web/app/chat/**` for `redirect(`, check `vercel.json` rewrites, check `apps/web/middleware.ts` again). Then edit `docs/audit/2026-05-22-claude-parity-r-web.md` Section 4 row 1 to reflect the actual finding.
Effort: 0.5 h.

---

## 6. Lock-aware verdict tally

Six refs verdict ❌ (P0/P1 visible fixes): 030, 010 top, 011 matrix, 014 team-enterprise IA, 015 API $/MTok, projects dark theme.
Three refs verdict 🔄 (lock-backed intentional difference): 031 (no auth-embedded plan cards per v1-local-only), 012 Pro details (waitlist-gated), 013 Max details (waitlist-gated).
Three refs verdict 🟡 (partial — palette matches but typography/decoration differ): 010b at 1920, 014 team-enterprise full, 015 API tab IA divergence.
Two refs verdict ✅ (parity achieved) or "AGI ahead": 017 enterprise content text, 018 PAYG (content captured, visual at /billing not assessed because auth-walled).

---

## 7. Notes for next lane

- **Chrome-MCP not needed for this lane.** Playwright fresh-browser worked fine; the bot-challenge risk on claude.ai/login never materialized. Recommend playwright as default for any future "screenshot a third party site" lane.
- **The R-WEB audit's "no middleware" conclusion needs correcting.** See A6 + R26-PARITY-VISUAL-WEB-13.
- **The `/projects` dark-theme inconsistency is the most surprising finding** — it would have been invisible to a text-only audit and is invisible to anyone unless they happen to navigate there logged-out. P0 fix candidate.
- **Screenshot output dir:** `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/` (22 PNGs, ~3.6 MB).
- **Locks honored:** `v1-local-only-cloud-waitlist-2026-05-18.md` (waitlist gating cited 6×), `brand-agi-2026-05-15.md` (wordmark rationalisation flagged), `rule-models-json-canonical.md` (pricing must drive from `models.json`, not hardcoded).

---

_All visual claims grounded in two-image comparisons captured 2026-05-22 via playwright fresh-browser. No image manipulation; PNGs saved as captured. No `pnpm dev` or `pnpm build` run locally (cloud-first verification)._
