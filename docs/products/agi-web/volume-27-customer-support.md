# AGI Web — Volume 27 — Customer Support

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-04

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/web/app/{faq,help,support,refund-policy,contact,terms}/page.tsx`, `apps/web/components/marketing/{MarketingFooter,PublicWaitlistForm}.tsx`, `apps/web/app/api/waitlist/public/route.ts`.

## Overview & stance

This volume specifies AGI's customer-support surface for a solo-founder team: the self-serve pages (FAQ, Help index, Support, Refund policy, Contact, Terms) that exist today, plus the AI support-chat widget planned to reduce direct email load as usage grows. The guiding rule is the same one that governs the rest of this product: **do not publish a support promise the team can't keep.** Response-time SLAs, tier-specific support channels, and AI-resolution claims must reflect what is actually staffed and wired today, not aspirational copy.

Support is web-only (`apps/web`) — there is no in-app support surface on mobile/desktop/CLI/extensions beyond linking out to these web pages. This volume does not duplicate the web engineer's marketing-copy conventions (`docs/engineering/naming-conventions.md`) — it specifies the support-domain content and the AI-chat integration only.

## FAQ — ✅ Built

`apps/web/app/faq/page.tsx`. Nine direct Q&A pairs covering providers, BYOK, Local mode, Managed Cloud, and security, plus a "browse more" section linking into deeper docs. Static content, no CMS. Requirement: FAQ answers must be re-verified whenever a locked product fact changes (pricing, tier names, trust-boundary rules) — this page is a common place for stale claims to survive a cutover (see the stale-tier gap flagged below for a live example of this exact failure mode).

## Help Index — ✅ Built

`apps/web/app/help/page.tsx`. Six top-linked topics into the product, framed as "get unstuck fast," plus a fallback to email support. Uses `CapabilityGrid` from the shared marketing components. Requirement: the six topics should track whatever the product's own support-ticket/email themes actually are over time (this is not instrumented today — see Anti-patterns).

## Support — 🟡 Partial (stale content found this session)

`apps/web/app/support/page.tsx`. States email (`contact@agiworkforce.com`) is the canonical channel for everyone today, with no published response-time SLA (correct — SLAs aren't staffed yet for a solo founder). **Confirmed stale as of 2026-07-04**: the tier-status table (`SUPPORT_ROWS`) still reads `Hobby · Pro · Max: Waitlist, not yet sold`, which contradicts this session's founder decision to open Stripe checkout for all tiers (Basic/Pro/Max, superseding the old Pro/Max-waitlist rule — see `.claude/agents/web-engineer.md`'s locked-fact update and commit `80567f06b`). **Action required**: update `SUPPORT_ROWS` to reflect that all self-serve tiers are purchasable today, not waitlisted. This is exactly the "confusing gate" bug class CLAUDE.md requires fixing immediately when reproducible, not filed away.

## Refund Policy — ✅ Built

`apps/web/app/refund-policy/page.tsx`. Clear, generous stance: any charge that doesn't match expectations gets refunded within 30 days on request, no multi-step process. Requirement: this promise must stay operationally true — if a future support-chat vendor or refund-automation flow is added, it must not introduce friction that contradicts "no multi-step process" (e.g. a bot that stalls or requires multiple back-and-forth turns to approve an obvious refund request).

## Contact — ✅ Built

`apps/web/app/contact/page.tsx` (+ dedicated `layout.tsx`/`error.tsx`/`loading.tsx`). Direct contact surface for AGI Automation LLC. Requirement: keep the physical/business details here as the single source of truth other pages (footer, terms) should link back to rather than duplicate.

## Terms — ✅ Built

`apps/web/app/terms/page.tsx`. Standalone legal terms page, out of scope for support-content changes beyond linking.

## AI Support Chat Widget — 🔭 Planned

Founder decision (2026-07-04): add an AI-powered chat widget to the support/help surface to handle FAQ, refund, and policy questions without a human in the loop for every ticket, given the team is a solo founder. Vendor not yet chosen — decision deferred pending further research (see `docs/agent-context/known-flaws.md` or the live task tracker for status).

Options evaluated (verified via live web search, 2026-07-04 — re-verify pricing/terms before committing, they move fast):

- **Intercom Fin** — best-in-class resolution quality; **check Early Stage Program eligibility first** (93% off Intercom + a free year of Fin for qualifying startups) before evaluating standalone per-resolution pricing ($0.99/resolution, 50-outcome monthly minimum), which is otherwise hard to predict at low-founder scale.
- **Crisp** (`Hugo` AI) — recommended fallback if Fin's Early Stage Program doesn't apply or isn't wanted: per-workspace (not per-seat) pricing, free tier to start, Hugo AI bundled into every paid tier with no separate copilot fee, $45–95/mo once past free.
- **Avoid**: Chatbase (2.1/5 Trustpilot, "confidently wrong answers" and billing complaints reported); Decagon (enterprise-only, ~$95K/year, ~6-week onboarding — wrong tier for a solo founder).

Requirements once a vendor is chosen and wired in:

- The widget must be trained/scoped on this product's actual current policies (refund policy above, actual tier names/pricing, actual trust-boundary rules) — never let a vendor's default/generic training data answer AGI-specific questions with invented facts. This is the same "do not invent facts" rule this whole codebase follows, just applied to a third-party AI surface the team doesn't fully control.
- Must escalate to the human email channel (`contact@agiworkforce.com`) cleanly when it can't resolve something — no dead end, no infinite bot loop.
- Must not contradict the Refund Policy's "no multi-step process" promise (see above).
- Should sit on the Support and/or Help pages, not gate them (email must remain reachable even if the widget fails to load).

## Repository map

- `apps/web/app/{faq,help,support,refund-policy,contact,terms}/` — the built pages above, each with its own `layout.tsx` for page-specific metadata.
- `apps/web/components/marketing/MarketingFooter.tsx` — cross-links into these pages sitewide.
- `apps/web/components/marketing/PublicWaitlistForm.tsx` + `apps/web/app/api/waitlist/public/route.ts` — the existing email-capture stack (reused this session for launch-notification signup on the homepage); could plausibly host a future "notify me" or lead-capture flow adjacent to support content, but is a separate concern from the AI chat widget.

## Competitor notes

ChatGPT/Claude-scale companies staff dedicated support teams with tiered SLAs from day one; AGI does not have that luxury as a solo-founder product. The deliberate divergence here is **radical honesty over SLA theater**: no published response-time promise until one is actually staffed (Support page's own stance), and a generous, friction-free refund policy that a competitor's finance team might resist. The AI chat widget, once chosen, should extend that honesty rather than undercut it — no fake "instant resolution guaranteed" framing if the underlying AI can't actually guarantee it.

## Acceptance / Definition of Done

Production-ready when: the Support page's tier-status table matches the real, current checkout state (all tiers purchasable, per the 2026-07-04 decision); the AI chat widget (once chosen) is live, scoped to real product facts, and cleanly escalates to email; and no support-surface page makes a claim (SLA, resolution time, tier availability) that isn't operationally true today.

- [ ] Fix: `apps/web/app/support/page.tsx`'s `SUPPORT_ROWS` — remove the stale "Hobby · Pro · Max: Waitlist, not yet sold" row, replace with the real current checkout-open state.
- [ ] Decide: AI chat widget vendor (Fin via Early Stage Program vs. Crisp) and integrate.
- [ ] Verify: FAQ/Help/Support copy re-audited after every locked-fact change (pricing, tier names, trust rules), not just at initial write time.

## Anti-patterns

- Publishing a response-time SLA that isn't actually staffed (matches the Support page's own current, correct restraint — don't regress this).
- Letting a third-party AI chat vendor answer with its own generic/default knowledge instead of this product's real, current policies — this is the same "never invent facts" rule applied to a vendor surface, and vendors will do exactly this by default if not explicitly scoped/trained on real content.
- Leaving a stale tier-availability or pricing claim on any support page after a pricing/tier decision changes elsewhere in the product (the exact bug found and flagged in this volume).
- Adding a chat widget that gates or gets in the way of the existing, working `contact@agiworkforce.com` email channel — the widget is additive, not a replacement, until it's proven reliable.
