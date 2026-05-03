# Pricing — AGI Workforce

> Decided 2026-05-03. This is the locked model for MVP.

## Tiers

| Tier           | Price              | Available at MVP?           | What you get                                                                                                                                                                                                                                     |
| -------------- | ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local-only** | Free forever       | ✅ YES                      | Run Ollama / LMStudio on your own laptop. No Supabase. No cloud. Desktop only. Full feature set, just on your hardware.                                                                                                                          |
| **BYOK**       | Free forever       | ✅ YES                      | Bring your own API keys (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, Perplexity, Azure, Bedrock, OpenRouter, AI21, SambaNova, Cohere — 24 providers). Optional Supabase if Cloud mode (for cross-device sync). |
| **Hobby**      | TBD ($5/mo target) | ✅ YES (only paid MVP tier) | Managed cloud — limited credits per month, basic models (Haiku 4.5, GPT-5.4-mini equivalent). The simple option for users who don't want to manage API keys.                                                                                     |
| **Pro**        | TBD                | ❌ Waitlist                 | Released after security audit clears. Full models, higher credit cap, priority support. Mirrors Claude Cowork Pro tier.                                                                                                                          |
| **Max**        | TBD                | ❌ Waitlist                 | Released after security audit clears. Highest credit cap, computer use, advanced agent features. Mirrors Claude Cowork Max tier.                                                                                                                 |

## Why this structure

- **Local-only and BYOK are free forever** because we don't pay infrastructure costs for them. The user is using their own keys or hardware. We monetize via Hobby/Pro/Max only.
- **Hobby is the only paid MVP tier** because we want public feedback before scaling managed cloud infrastructure.
- **Pro/Max are waitlist** because they require:
  1. Security audit clearance (currently P0 13/14, P1 20/25 — see [docs/audit/AUDIT_2026-05-03.md](audit/AUDIT_2026-05-03.md))
  2. Higher SLAs / observability we don't yet have
  3. Pro/Max users will run more agentic workloads — needs more rigorous guardrails

## Who is the target user for each tier

- **Local-only**: privacy-conscious, devs with strong machines (32GB+ RAM, Apple Silicon or NVIDIA GPU), security/compliance-restricted users
- **BYOK**: developers who already have API accounts, power users who want to control costs, technical users
- **Hobby**: non-technical users who want one app for multi-LLM access, students, hobbyists
- **Pro**: professionals using AI as part of daily work, small teams
- **Max**: power users running long agent workflows, computer use, browser automation

## Stripe integration

The codebase already has Stripe wiring (`apps/web/app/api/stripe-webhook/`, `apps/web/app/api/sync-subscription/`, `services/api-gateway/src/routes/credits.ts`, `scripts/create-account.js`, `scripts/create-hobby-price.js`, `scripts/test-hobby-plan.js`). Hobby tier launch needs:

1. Create Stripe price for Hobby ($5/mo verified live)
2. Wire `/billing` page UI to the existing API
3. End-to-end test: signup → upgrade → first credit charge
4. Refund + cancellation flows
5. Auto-renewal disclosure (US compliance)

See `docs/audit/FIX_QUEUE.md` FIX-035 for ToS rewrite (auto-renewal disclosure required).

## Pro/Max waitlist (MVP)

- Sign-up form on agiworkforce.com lands on a waitlist page (similar to how many AI products show "Pro/Max coming soon")
- Email capture + use-case description
- Notify when audit clears + tier launches

## What's explicitly NOT in this pricing model

- No "free trial" of Pro/Max — keeps incentive to use Local/BYOK/Hobby
- No team/enterprise tier at MVP — that's Wave 4+ (post-MVP)
- No usage-based BYOK markup — users pay providers directly, we add zero markup
- No ads, no affiliate commissions

## How to launch a new tier

1. Add Stripe price (use `scripts/create-account.js` pattern)
2. Update `apps/web/app/pricing/page.tsx` to surface tier
3. Update `services/api-gateway/src/routes/credits.ts` tier mapping
4. Add tier guard to `apps/web/app/api/llm/v1/chat/completions/route.ts` (model gate)
5. Update [docs/PRICING.md](PRICING.md) (this file) — move tier from "waitlist" to "available"
6. Update [AGI_WORKFORCE.md](../AGI_WORKFORCE.md) pricing section
