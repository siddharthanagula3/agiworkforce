# Price ID Verification Report

## Stripe Prices (Live)

- **Hobby Monthly**: `price_1Sgwx10zEfO6BZMh7thtFU77` - $10.00/month
- **Hobby Yearly**: `price_1Sgwx20zEfO6BZMhbgpxL8TI` - $59.88/year
- **Pro Monthly**: `price_1Sgwx20zEfO6BZMh3ix7hivi` - $29.99/month
- **Pro Yearly**: `price_1Sgwx30zEfO6BZMhJXsduOyl` - $299.99/year
- **Max Monthly**: `price_1Sgwx30zEfO6BZMhJqItFYKF` - $299.99/month
- **Max Yearly**: `price_1Sgwx40zEfO6BZMhYS63EnfW` - $2999.88/year

## Code Defaults (apps/web/app/api/checkout/route.ts & stripe-webhook/route.ts)

- **Hobby Monthly**: `price_1Sgwx10zEfO6BZMh7thtFU77` ✅ MATCHES
- **Hobby Yearly**: `price_1Sgwx20zEfO6BZMhbgpxL8TI` ✅ MATCHES
- **Pro Monthly**: `price_1Sgwx20zEfO6BZMh3ix7hivi` ✅ MATCHES
- **Pro Yearly**: `price_1Sgwx30zEfO6BZMhJXsduOyl` ✅ MATCHES
- **Max Monthly**: `price_1Sgwx30zEfO6BZMhJqItFYKF` ✅ MATCHES
- **Max Yearly**: `price_1Sgwx40zEfO6BZMhYS63EnfW` ✅ MATCHES

## Supabase pricing_plans Table

- **Hobby Monthly**: `price_1Sgwx10zEfO6BZMh7thtFU77` ✅ MATCHES ($10.00/month)
- **Hobby Yearly**: `price_1Sgwx20zEfO6BZMhbgpxL8TI` ✅ MATCHES ($59.88/year)
- **Pro Monthly**: `price_1Sgwx20zEfO6BZMh3ix7hivi` ✅ MATCHES ($29.99/month)
- **Pro Yearly**: `price_1Sgwx30zEfO6BZMhJXsduOyl` ✅ MATCHES ($299.99/year)
- **Max Monthly**: `price_1Sgwx30zEfO6BZMhJqItFYKF` ✅ MATCHES ($299.99/month)
- **Max Yearly**: `price_1Sgwx40zEfO6BZMhYS63EnfW` ✅ MATCHES ($2999.88/year)

## Issues Found

✅ **All price IDs match correctly across Stripe, Code, and Supabase!**

## Webhook Configuration

- Webhook endpoint: `https://agiworkforce.com/api/stripe-webhook` (or your Vercel domain)
- Webhook secret: Set via `STRIPE_WEBHOOK_SECRET` env var in Vercel
- **Action Required**: Verify webhook endpoint is configured in Stripe Dashboard:
  1. Go to https://dashboard.stripe.com/workbench/webhooks
  2. Check if endpoint exists with URL: `https://your-domain.com/api/stripe-webhook`
  3. Verify events are subscribed:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
  4. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET` in Vercel

## Environment Variables Required

### Vercel Environment Variables

All variables should be set in Vercel project settings: https://vercel.com/siddharthanagula4/web/settings/environment-variables

**Critical (Required):**

- `STRIPE_SECRET_KEY` - Stripe secret key (starts with `sk_`)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (starts with `whsec_`)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for webhooks)

**Optional (Have defaults in code):**

- `STRIPE_PRICE_HOBBY_MONTHLY` - Default: `price_1Sgwx10zEfO6BZMh7thtFU77`
- `STRIPE_PRICE_HOBBY_YEARLY` - Default: `price_1Sgwx20zEfO6BZMhbgpxL8TI`
- `STRIPE_PRICE_PRO_MONTHLY` - Default: `price_1Sgwx20zEfO6BZMh3ix7hivi`
- `STRIPE_PRICE_PRO_YEARLY` - Default: `price_1Sgwx30zEfO6BZMhJXsduOyl`
- `STRIPE_PRICE_MAX_MONTHLY` - Default: `price_1Sgwx30zEfO6BZMhJqItFYKF`
- `STRIPE_PRICE_MAX_YEARLY` - Default: `price_1Sgwx40zEfO6BZMhYS63EnfW`

## Vercel Deployment Status

- Latest deployment: CANCELED (commit bb8246c)
- Last successful deployment: READY (commit 6dbca21)
- **Action Required**: Check why latest deployments are being canceled. May need to trigger manual deployment.

## Summary

✅ **All price IDs match correctly across all systems**
⚠️ **Verify webhook endpoint configuration in Stripe Dashboard**
⚠️ **Check Vercel environment variables are set correctly**
⚠️ **Investigate why Vercel deployments are being canceled**
