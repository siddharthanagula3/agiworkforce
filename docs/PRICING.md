# Pricing — AGI Workforce

> Decided 2026-05-03. Reconciled 2026-05-15 against `packages/types/src/billing-catalog.ts` (the SSOT) and `tasks/auto-routing-spec.md` §1 + §6. All prices wired in code with Stripe price IDs (`STRIPE_PRICE_{HOBBY,PRO,PRO_PLUS,MAX,ENTERPRISE}_{MONTHLY,YEARLY}`).

## Tiers

| Tier           | Monthly     | Yearly                   | Available at MVP? | What you get                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ----------- | ------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-only** | Free        | Free                     | ✅ YES            | Run Ollama / LMStudio on your own laptop. No Supabase. No cloud. Desktop only. Full feature set, just on your hardware.                                                                                                                                                                                                                                                                |
| **BYOK**       | Free        | Free                     | ✅ YES            | Bring your own API keys (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, Perplexity, Azure, Bedrock, OpenRouter, AI21, SambaNova, Cohere — **10+ Providers**). Optional Supabase if Cloud mode (for cross-device sync).                                                                                                                                  |
| **Free**       | $0          | $0                       | ✅ YES            | 100K tokens/mo + 5 messages/day cap. Pool B workhorse only (Gemini 3.1 Flash-Lite). No tool use, no MCP, no manual model picker, no voice, no media generation. Funnel-seeding tier.                                                                                                                                                                                                   |
| **Hobby**      | **$10**     | **$59.88** (≈50% off)    | ✅ YES            | 2M tokens/mo. Pool B auto-routed: workhorse + escalation_coding + reasoning_premium + image_generation. 10 images/mo (Imagen-4 Fast, 50K synthetic tokens each). **Voice 60 min/mo** (Wispr-Flow STT via Whisper-1 + AI rewrite via Gemini Flash-Lite). Web search + basic MCP with burn warnings. No video, no computer use, no manual picker. Required for Cloud mode on Web/Mobile. |
| **Pro**        | **$29.99**  | **$299.88** (~17% off)   | ✅ YES            | 10M tokens/mo. `*_pro` slots: Sonnet 4.6 (general + coding) + Gemini 3.1 Pro (multimodal + long context) + Kimi K2.6 (reasoning) + GPT-5.4 mini. Unlimited images (debit token bucket at 50K each). **Voice 300 min/mo.** Artifacts + browser DOM + light computer use + Sonar search + Sonar Deep Research. Manual picker via Advanced toggle. No video, no Opus 4.7, no GPT-5.5.     |
| **Pro+**       | **$49.99**  | **$499.88** (~17% off)   | ✅ YES            | Pro pool + **Opus 4.7 (15K tokens/day)** + **GPT-5.5 (15K tokens/day)** + **60 sec/mo Runway Gen-4 video (720p)** + **voice 1500 min/mo** + advanced computer use + US-only routing toggle (skip Chinese vendors).                                                                                                                                                                     |
| **Max**        | **$299.99** | **$2,999.88** (~17% off) | ✅ YES            | Pro+ pool + Opus 4.7 **1M tokens/mo** + GPT-5.5 **1M tokens/mo** + **5 min/mo Runway video (720p or 1024p)** + computer use **1K soft / 2.5K hard actions/mo** + Deep Research workflow + **voice unlimited** + local provider surface unlocked (BYOK + Local + managed).                                                                                                              |
| **Enterprise** | Contact     | Contact                  | ✅ Contact sales  | SSO (SAML / OIDC), SCIM provisioning, custom retention windows, audit log export, dedicated support, custom MSA. Reach out at https://agiworkforce.com/contact.                                                                                                                                                                                                                        |

## Provider / API map per slot (which APIs we route to)

Canonical from `packages/types/src/model-catalog.ts` `SLOT_REGISTRY`:

| Slot                        | Model ID                 | Provider     | Pricing $/M (in/out) | Tier exposure                                |
| --------------------------- | ------------------------ | ------------ | -------------------- | -------------------------------------------- |
| `workhorse_general`         | `gemini-3.1-flash-lite`  | Google       | 0.25 / 1.50          | All paid tiers (downgrade fallback)          |
| `escalation_coding`         | `glm-4.7`                | Zhipu (Z.AI) | 0.30 / 1.20          | Hobby                                        |
| `reasoning_premium`         | `deepseek-v4-flash`      | DeepSeek     | 0.14 / 0.28          | Hobby                                        |
| `general_balanced_pro`      | `claude-sonnet-4.6`      | Anthropic    | (per Anthropic)      | Pro+                                         |
| `coding_premium_pro`        | `claude-sonnet-4.6`      | Anthropic    | (per Anthropic)      | Pro+                                         |
| `reasoning_premium_pro`     | `kimi-k2.6`              | Moonshot     | 0.95 / 4.00          | Pro+ (replaces DeepSeek V4-Pro post-promo)   |
| `multimodal_pro`            | `gemini-3.1-pro-preview` | Google       | (per Google)         | Pro+                                         |
| `long_context_pro`          | `gemini-3.1-pro-preview` | Google       | (per Google)         | Pro+                                         |
| `flagship_coding_pro_plus`  | `claude-opus-4.7`        | Anthropic    | (per Anthropic)      | **Pro+** (15K/day) / Max (1M/mo)             |
| `flagship_general_pro_plus` | `gpt-5.5`                | OpenAI       | (per OpenAI)         | **Pro+** (15K/day) / Max (1M/mo)             |
| `image_generation`          | `imagen-4-fast`          | Google       | $0.02/image @ 1024²  | Hobby+ (10/mo cap on Hobby)                  |
| `video_generation`          | `veo-3`                  | Google       | (per Google)         | Max                                          |
| `video_generation_pro_plus` | `runway-gen-4`           | Runway       | (per Runway)         | Pro+ (60s/mo) / Max (300s/mo)                |
| `search_fast`               | `sonar`                  | Perplexity   | (per Perplexity)     | Pro+                                         |
| `search_premium`            | `sonar-deep-research`    | Perplexity   | (per Perplexity)     | Max (Deep Research)                          |
| `voice_transcription`       | `whisper-1`              | OpenAI       | $0.006/min           | **Hobby+** (60/300/1500/unlimited)           |
| `voice_rewrite`             | `gemini-3.1-flash-lite`  | Google       | 0.25 / 1.50          | **Hobby+** (paired with voice_transcription) |

## Modes (Local vs Cloud)

AGI Workforce ships in **2 modes**. The mode you pick determines which tiers are available and what data crosses the network.

| Mode      | Where it runs          | Storage                | Auth           | Sync                  | Tiers required                                                  |
| --------- | ---------------------- | ---------------------- | -------------- | --------------------- | --------------------------------------------------------------- |
| **Local** | Desktop only           | SQLite on your machine | None           | None                  | Local-only or BYOK (free forever; no account needed)            |
| **Cloud** | Desktop + Web + Mobile | Supabase (us-east-2)   | Supabase OAuth | Realtime cross-device | Hobby+ (Hobby, Pro, Max, or Enterprise) — Cloud requires Hobby+ |

- **Mode picker**: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` (consolidated; `ModeSelectionDialog` deleted)
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
