# Required Vercel Environment Variables

This document lists all required environment variables for the web project to function correctly, especially for billing functionality.

## Required for Billing (Stripe)

These environment variables **MUST** be set in Vercel for billing to work:

### Critical (Required)

- `STRIPE_SECRET_KEY` - Your Stripe secret key (starts with `sk_`)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (starts with `whsec_`)

### Price IDs (Optional - have defaults but should be set)

- `STRIPE_PRICE_HOBBY_MONTHLY` - Default: `price_1Sgwx10zEfO6BZMh7thtFU77`
- `STRIPE_PRICE_HOBBY_YEARLY` - Default: `price_1Sgwx20zEfO6BZMhbgpxL8TI`
- `STRIPE_PRICE_PRO_MONTHLY` - Default: `price_1Sgwx20zEfO6BZMh3ix7hivi`
- `STRIPE_PRICE_PRO_YEARLY` - Default: `price_1Sgwx30zEfO6BZMhJXsduOyl`
- `STRIPE_PRICE_MAX_MONTHLY` - Default: `price_1Sgwx30zEfO6BZMhJqItFYKF`
- `STRIPE_PRICE_MAX_YEARLY` - Default: `price_1Sgwx40zEfO6BZMhYS63EnfW`

## Required for Supabase

### Public (Client-side)

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous/public key

### Server-side (Required for webhooks and admin operations)

- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (keep secret!)
  - **Required for**: Production and Preview environments only
  - **Not required for**: Development (webhooks don't fire to dev environments)
  - The code handles missing key gracefully in Development
- `SUPABASE_URL` - Alternative to NEXT_PUBLIC_SUPABASE_URL (fallback)

## Required for LLM API (Cloud Credits)

These environment variables are needed for the LLM API endpoint that handles cloud credits:

### LLM Provider API Keys (Optional - for cloud credits)

- `OPENAI_API_KEY` - OpenAI API key for cloud credits (optional, can use user's own keys)
- `ANTHROPIC_API_KEY` - Anthropic API key for cloud credits (optional)
- `GOOGLE_API_KEY` - Google API key for cloud credits (optional)
- `XAI_API_KEY` - XAI API key for cloud credits (optional)
- `QWEN_API_KEY` - Qwen API key for cloud credits (optional)
- `MISTRAL_API_KEY` - Mistral API key for cloud credits (optional)
- `MOONSHOT_API_KEY` - Moonshot API key for cloud credits (optional)
- `DEEPSEEK_API_KEY` - DeepSeek API key for cloud credits (optional)

**Note**: These are only needed if you want to provide cloud credits. Users can also use their own API keys.

### Cron Job Security

- `CRON_SECRET` - Secret token for protecting cron endpoints (recommended for production)

## Required for Rate Limiting (Optional)

- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL (optional, falls back to in-memory)
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis REST token (optional)

## How to Set in Vercel

1. Go to: https://vercel.com/siddharthanagula4/web/settings/environment-variables
2. Add each variable for the appropriate environments:
   - **All environments** (Production, Preview, Development): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, all Stripe variables
   - **Production and Preview only**: `SUPABASE_SERVICE_ROLE_KEY` (sensitive - not needed in Development)
   - **Production only**: `CRON_SECRET` (for cron job security)
   - **Optional**: LLM provider API keys if providing cloud credits
3. For sensitive keys (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, LLM provider keys), ensure they're marked as sensitive

## Verification

After setting variables, verify billing works by:

1. Testing checkout flow: `/pricing` → Select plan → Checkout
2. Testing billing portal: `/dashboard/billing` → Manage billing
3. Checking webhook logs in Vercel function logs for Stripe events

## Notes

- All `NEXT_PUBLIC_*` variables are exposed to the browser
- Never commit secrets to git
- Use Vercel's environment variable management for all secrets
- Webhook endpoint: `https://your-domain.com/api/stripe-webhook`
