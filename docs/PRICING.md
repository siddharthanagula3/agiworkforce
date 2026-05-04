# Pricing — AGI Workforce

> Decided 2026-05-03. This is the locked model for MVP.

## Tiers

| Tier           | Price              | Available at MVP?           | What you get                                                                                                                                                                                                                                          |
| -------------- | ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-only** | Free forever       | ✅ YES                      | Run Ollama / LMStudio on your own laptop. No Supabase. No cloud. Desktop only. Full feature set, just on your hardware.                                                                                                                               |
| **BYOK**       | Free forever       | ✅ YES                      | Bring your own API keys (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, Perplexity, Azure, Bedrock, OpenRouter, AI21, SambaNova, Cohere — **10+ Providers**). Optional Supabase if Cloud mode (for cross-device sync). |
| **Hobby**      | TBD ($5/mo target) | ✅ YES (only paid MVP tier) | Managed cloud — limited credits per month, basic models (Haiku 4.5, GPT-5.4-mini equivalent). The simple option for users who don't want to manage API keys. **Required for Cloud mode** on Web/Mobile.                                               |
| **Pro**        | TBD                | ❌ Waitlist                 | Released after security audit clears. Full models, higher credit cap, priority support. Mirrors Claude Cowork Pro tier.                                                                                                                               |
| **Max**        | TBD                | ❌ Waitlist                 | Released after security audit clears. Highest credit cap, computer use, advanced agent features. Mirrors Claude Cowork Max tier.                                                                                                                      |
| **Enterprise** | Contact sales      | ✅ Contact sales            | SSO (SAML / OIDC), SCIM provisioning, custom retention windows, audit log export, dedicated support, custom MSA. Reach out at https://agiworkforce.com/contact.                                                                                       |

## Modes (Local vs Cloud)

AGI Workforce ships in **2 modes**. The mode you pick determines which tiers are available and what data crosses the network.

| Mode      | Where it runs          | Storage                | Auth           | Sync                  | Tiers required                                                  |
| --------- | ---------------------- | ---------------------- | -------------- | --------------------- | --------------------------------------------------------------- |
| **Local** | Desktop only           | SQLite on your machine | None           | None                  | Local-only or BYOK (free forever; no account needed)            |
| **Cloud** | Desktop + Web + Mobile | Supabase (us-east-2)   | Supabase OAuth | Realtime cross-device | Hobby+ (Hobby, Pro, Max, or Enterprise) — Cloud requires Hobby+ |

- **Mode picker**: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`
- **Runtime detection**: `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`)

### Local ↔ Cloud chat transfer

If a Local user upgrades to Hobby+ (Cloud mode) — or downgrades back to Local — chats can be migrated in either direction:

- **Local → Cloud**: existing SQLite conversations are uploaded into the user's Supabase row on first Cloud sign-in. Everything older than the migration cutoff is uploaded once and then continues syncing in real time.
- **Cloud → Local**: the user's Supabase conversations are mirrored into a fresh local SQLite store on first Local sign-in. Existing local data is preserved (the migration writes into the same store, dedupe-by-id).
- The migration is one-shot per device per direction; subsequent edits use the active mode's storage as the source of truth.

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

## Enterprise (contact-sales)

- Single sign-on (SAML / OIDC) with org-managed identity
- SCIM user provisioning + group sync
- Custom data retention windows + audit log export
- Dedicated support channel + SLA
- Custom MSA, DPA, and (where applicable) BAA
- Reach out at https://agiworkforce.com/contact for pricing.

## What's explicitly NOT in this pricing model

- No "free trial" of Pro/Max — keeps incentive to use Local/BYOK/Hobby
- No usage-based BYOK markup — users pay providers directly, we add zero markup
- No ads, no affiliate commissions

## How to launch a new tier

1. Add Stripe price (use `scripts/create-account.js` pattern)
2. Update `apps/web/app/pricing/page.tsx` to surface tier
3. Update `services/api-gateway/src/routes/credits.ts` tier mapping
4. Add tier guard to `apps/web/app/api/llm/v1/chat/completions/route.ts` (model gate)
5. Update [docs/PRICING.md](PRICING.md) (this file) — move tier from "waitlist" to "available"
6. Update [AGI_WORKFORCE.md](../AGI_WORKFORCE.md) pricing section
