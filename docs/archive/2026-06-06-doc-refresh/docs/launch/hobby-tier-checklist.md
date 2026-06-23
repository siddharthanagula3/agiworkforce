# Hobby tier launch checklist

> The Hobby tier code is **already shipped**. This file is the operator's
> checklist for flipping it on — Stripe dashboard config + env vars.

## Code state — already done (no changes needed)

| Surface                  | Path                                                 | Notes                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tier normalizer          | `apps/web/lib/model-tiers.ts:17`                     | `'hobby'` is a recognized tier                                                                                                                               |
| Plan-gate middleware     | `services/api-gateway/src/middleware/planGate.ts:21` | `ALLOWED_TIERS` includes `'hobby'`                                                                                                                           |
| Hobby model allowlist    | `services/api-gateway/src/routes/llm.ts:38–47`       | Currently: `claude-haiku-4-5`, `gpt-4o-mini`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-flash`. Update with the post-S9 model ids when ready. |
| Stripe webhook handler   | `apps/web/app/api/stripe-webhook/`                   | Existing route handles `customer.subscription.created`, `.updated`, `.deleted`                                                                               |
| Checkout session creator | `apps/web/app/api/checkout/`                         | Generic — accepts a price id from request                                                                                                                    |
| Credit deduction         | `apps/web/app/api/llm/completion/route.ts`           | Calls `LLMCostCalculator` per request                                                                                                                        |
| Pricing page             | `apps/web/app/pricing/page.tsx`                      | Verify Hobby is rendered with $5/mo                                                                                                                          |
| Subscription tier check  | `apps/web/lib/services/subscription-service.ts`      | Reads `subscription_tier` from Supabase users table                                                                                                          |

## Operator steps — what you need to do

### 1. Stripe dashboard (live mode)

1. Open https://dashboard.stripe.com/products in **live mode** (not test).
2. **Create product**: name `AGI Workforce Hobby`, description "Hobby tier — managed cloud, limited credits, basic models."
3. **Add a recurring price**: $5/month USD, billing cycle Monthly, no free trial (or 7-day if you want — your call).
4. Copy the **price id** (starts with `price_`). Save for env step.
5. Repeat for **annual** if you want a discounted yearly: $48/yr (20% off) → another `price_...`.

### 2. Update Supabase user table (if subscription_tier column doesn't allow `'hobby'`)

```sql
-- Verify the existing constraint allows 'hobby'. If not:
alter table users
  drop constraint if exists users_subscription_tier_check;

alter table users
  add constraint users_subscription_tier_check
  check (subscription_tier in ('free','hobby','pro','max','enterprise'));
```

### 3. Env vars (Vercel + Fly.io)

**Vercel (web):**

```
STRIPE_SECRET_KEY=sk_live_...                      # already set for Pro
STRIPE_WEBHOOK_SECRET=whsec_...                    # already set
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...     # already set
STRIPE_PRICE_HOBBY_MONTHLY=price_...               # NEW — from step 1
STRIPE_PRICE_HOBBY_ANNUAL=price_...                # NEW — from step 1 (optional)
```

**Fly.io (api-gateway):**

```
ANTHROPIC_API_KEY=sk-ant-...                       # for hobby cloud routing
OPENAI_API_KEY=sk-...                              # for hobby cloud routing
GOOGLE_API_KEY=AIza...                             # for hobby cloud routing
HOBBY_MONTHLY_CREDIT_USD=5                         # current balance every month
```

### 4. Pricing page UI

`apps/web/app/pricing/page.tsx` — verify the Hobby card renders. If not, add it (the existing pricing page likely has a TODO):

```tsx
// expected card structure
<PricingCard
  tier="hobby"
  price="$5"
  period="/mo"
  description="Managed cloud, limited credits, basic models."
  features={[
    'Hobby model allowlist (Haiku, GPT-4o-mini, Gemini Flash)',
    '$5 of credits / month',
    'No commitment, cancel anytime',
  ]}
  ctaLabel="Subscribe"
  ctaHref={`/api/checkout?price=${process.env.NEXT_PUBLIC_STRIPE_PRICE_HOBBY_MONTHLY}`}
/>
```

### 5. Smoke test (test mode first)

```bash
# 1. Switch Stripe dashboard to test mode, repeat step 1 with test price ids.
# 2. Set env vars on Vercel preview env to use the test keys.
# 3. End-to-end:
#    - sign up with a fresh email
#    - hit /pricing → click Hobby → complete Stripe checkout (use 4242...)
#    - confirm webhook fires (check `apps/web/app/api/stripe-webhook` logs in Vercel)
#    - confirm Supabase users row has subscription_tier='hobby' and customer_id set
#    - run a chat against /api/llm/completion → confirm hobby model gate (try a non-allowed model, expect 403)
#    - confirm credit deduction in `users.credits_remaining`
# 4. If green, flip env vars to live keys.
```

### 6. Marketing announcement

After the live flip, run the launch posts:

- `docs/launch/show-hn.md` — Show HN: AGI Workforce Hobby tier ($5/mo for multi-provider AI)
- `docs/launch/twitter.md` — Twitter thread
- `docs/launch/r-localllama.md` — r/LocalLLaMA post (lead with Ollama support)

## What I (as an AI agent) cannot do for you

- Create Stripe products / prices in the dashboard (requires login + 2FA)
- Set env vars on Vercel / Fly.io (requires deploy access)
- Run live billing tests with a real card (requires manual UI flow)
- Sign up for the Stripe live mode (requires KYC + bank verification)

## What I can do for you (next session)

- Wire the pricing page Hobby card if it's missing
- Add a `subscription_tier_change` Supabase migration if needed
- Draft the launch posts (Show HN / Twitter / Reddit)
- Write a Hobby tier acceptance test that asserts model gate + credit deduction
