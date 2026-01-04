# Stripe Integration Troubleshooting Guide

## Current Issue: Subscriptions Not Updating After Purchase

If you're experiencing:

- 500 server errors after purchasing
- Subscriptions not appearing in Supabase after payment
- Users still seeing "Subscribe" button after purchase

**This is likely because Stripe price IDs are not configured in Vercel environment variables.**

---

## Required Stripe Environment Variables

You must set these in your Vercel project for the Stripe integration to work:

### 1. **Stripe API Keys** (Essential)

```env
STRIPE_SECRET_KEY=sk_live_...              # Your Stripe Secret Key
STRIPE_WEBHOOK_SECRET=whsec_...            # Webhook signing secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...  # Public key
```

### 2. **Stripe Price IDs** (CRITICAL - This is likely missing!)

These are the IDs of your pricing tiers in Stripe. **You must create these in your Stripe dashboard first**, then add them here:

```env
# Hobby Tier
STRIPE_PRICE_HOBBY_MONTHLY=price_...      # Monthly hobby price
STRIPE_PRICE_HOBBY_YEARLY=price_...       # Yearly hobby price

# Pro Tier
STRIPE_PRICE_PRO_MONTHLY=price_...        # Monthly pro price
STRIPE_PRICE_PRO_YEARLY=price_...         # Yearly pro price

# Max Tier
STRIPE_PRICE_MAX_MONTHLY=price_...        # Monthly max price
STRIPE_PRICE_MAX_YEARLY=price_...         # Yearly max price

# Enterprise Tier (Optional - only if you offer this tier)
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...
```

---

## Step-by-Step Setup

### Step 1: Get Your Stripe Price IDs

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. For each product (Hobby, Pro, Max, etc.):
   - Click the product name
   - Under "Pricing" section, find your price IDs
   - Copy the price IDs that look like: `price_1ABC123XYZ`

Example:

```
Hobby:
  - Monthly: price_1MzPj4ABCDefGhijk
  - Yearly:  price_1MzPj4ABCDefGhijl

Pro:
  - Monthly: price_1MzPk5ABCDefGhijm
  - Yearly:  price_1MzPk5ABCDefGhijn
```

### Step 2: Add to Vercel Environment Variables

1. Go to [Vercel Dashboard → Settings → Environment Variables](https://vercel.com/dashboard/projects)
2. Select your project
3. Click "Settings" → "Environment Variables"
4. Add all 6-8 price ID variables (depending on which tiers you offer)
5. Make sure they apply to **Production** environment
6. **Important**: You may need to redeploy after adding env vars

Example:

```
STRIPE_PRICE_HOBBY_MONTHLY   = price_1MzPj4ABCDefGhijk
STRIPE_PRICE_HOBBY_YEARLY    = price_1MzPj4ABCDefGhijl
STRIPE_PRICE_PRO_MONTHLY     = price_1MzPk5ABCDefGhijm
STRIPE_PRICE_PRO_YEARLY      = price_1MzPk5ABCDefGhijn
STRIPE_PRICE_MAX_MONTHLY     = price_1MzPk6ABCDefGhijo
STRIPE_PRICE_MAX_YEARLY      = price_1MzPk6ABCDefGhijp
```

### Step 3: Redeploy Your App

After adding environment variables:

```bash
# Option 1: Trigger redeploy from Vercel UI
# - Go to your project
# - Click "Deployments"
# - Click the three dots on latest deployment
# - Select "Redeploy"

# Option 2: Push a commit to trigger auto-deploy
git add -A
git commit -m "chore: redeploy with Stripe configuration"
git push origin main
```

### Step 4: Verify Configuration

Once deployed, you can verify the configuration is working:

1. Go to your pricing page: `https://yourdomain.com/pricing`
2. Open browser DevTools → Console
3. Try to complete a test purchase
4. Check Vercel logs for errors about missing price IDs

---

## How the Stripe Integration Works

### Purchase Flow:

```
1. User clicks "Subscribe" on pricing page
2. → Checkout endpoint creates Stripe checkout session
      (includes plan_tier metadata: 'hobby', 'pro', or 'max')
3. → User completes payment in Stripe
4. → Stripe sends webhook to your app
5. → Webhook resolves plan_tier from:
      a) Metadata (preferred)
      b) Price ID mapping using STRIPE_PRICE_* env vars
6. → Creates subscription record in Supabase
7. → Allocates credits for the subscription period
8. → User sees "Current Plan" / "Manage Subscription" on pricing page
```

### If Something Goes Wrong:

**Scenario 1: 500 Error After Purchase**

- Webhook webhook threw an error because it couldn't determine plan_tier
- **Check**: Are all `STRIPE_PRICE_*` env vars set in Vercel?
- **Fix**: Add missing env vars and redeploy

**Scenario 2: Subscription Not Created**

- Webhook received event but couldn't find user
- **Check**: Is user logged in during checkout?
- **Fix**: Ensure user has a Supabase auth session
- **Check**: Look at Vercel logs for webhook errors

**Scenario 3: User Still Sees "Subscribe" After Purchase**

- Supabase query didn't find subscription
- **Check**: Does subscription exist in Supabase?
  ```sql
  -- Connect to Supabase and run:
  SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';
  ```
- **Fix**: If empty, webhook failed to create it (see Scenario 2)

---

## Debugging

### Check Webhook Logs

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Find your webhook endpoint
3. Click "Events" to see recent webhook deliveries
4. Click on any event to see request/response details
5. Look for error messages about missing price IDs

### Check Vercel Logs

```bash
# View live logs (requires Vercel CLI)
vercel logs --prod

# Or go to Vercel dashboard:
# Projects → Select your project → Deployments → Latest → Logs
```

### Check Supabase

```sql
-- Check if subscription was created
SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';

-- Check if stripe_customer_id was stored
SELECT id, email, stripe_customer_id FROM profiles WHERE id = 'YOUR_USER_ID';

-- Check for webhook events
SELECT * FROM processed_stripe_events ORDER BY created_at DESC LIMIT 10;
```

---

## Common Issues

### Issue: "Cannot determine valid plan_tier for subscription"

**Cause**: One or more `STRIPE_PRICE_*` environment variables are missing or incorrect

**Solution**:

1. Verify all 6 price IDs are correct in Vercel
2. Make sure they match actual Stripe price IDs (starts with `price_`)
3. Redeploy after fixing
4. Test checkout again

### Issue: "No Stripe customer found"

**Cause**: Stripe API call failed or customer deleted

**Solution**:

1. Check `STRIPE_SECRET_KEY` is correct
2. Verify webhook secret is correct
3. Ensure Stripe account has active subscription products

### Issue: Database FK constraint error

**Cause**: Profile doesn't exist when webhook tries to create subscription

**Solution**:

1. Check Supabase migrations are applied
2. Verify profile is created when user signs up
3. Check RLS policies aren't blocking service role

---

## Recent Fixes (2026-01-03)

The following issues were identified and fixed:

1. **Deleted Endpoint**: Removed call to `/api/sync-subscription` which was deleted
   - Pricing page no longer tries to self-heal failed syncs
   - Simpler, more reliable flow

2. **Webhook Error Handling**: Webhook now returns 400 (not 500) when price IDs aren't configured
   - Better error messages indicating missing env vars
   - Shows which price IDs are currently registered
   - Helps with debugging configuration issues

3. **Graceful Degradation**: Subscription updates no longer fail on missing price IDs
   - Existing subscription data is preserved
   - Can be recovered when env vars are fixed

---

## Quick Checklist

- [ ] Stripe account created and products configured
- [ ] 6 price IDs created in Stripe Dashboard
- [ ] All `STRIPE_PRICE_*` vars added to Vercel environment
- [ ] Vercel app redeployed
- [ ] Test checkout completes without 500 error
- [ ] Subscription appears in Supabase
- [ ] User sees "Current Plan" / "Manage Subscription" on pricing page

---

## Support

If you're still having issues after following this guide:

1. **Check Vercel logs** for detailed error messages
2. **Check Stripe webhook logs** for delivery details
3. **Check Supabase** for subscription records
4. **Verify env vars** are spelled exactly as shown above
5. **Ensure app is redeployed** after adding env vars

The most common issue is **missing or incorrect STRIPE*PRICE*\* environment variables**.
