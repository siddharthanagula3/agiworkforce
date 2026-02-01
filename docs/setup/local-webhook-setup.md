# Local Development Webhook Setup (Without Docker)

## Overview

You want to test webhooks locally without running Supabase in Docker. This guide shows how to:

1. Expose your local dev server publicly with **ngrok**
2. Configure Supabase webhooks to point to your local URL
3. Test Stripe webhooks locally

---

## Setup Steps

### 1. Install ngrok

```bash
# macOS (Homebrew)
brew install ngrok

# Or download: https://ngrok.com/download
```

### 2. Install Stripe CLI (Optional but Recommended)

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

### 3. Update `.env.local`

Create `apps/web/.env.local` with your **production** Supabase URL:

```env
# Use production Supabase (not local)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Service role key (from Vercel or Supabase dashboard)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...  # Will update this after ngrok
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (same test prices)
STRIPE_PRICE_HOBBY_MONTHLY=price_...
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...

# App URL (will be ngrok URL)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Or https://xxxxx.ngrok.io
```

### 4. Start Your App

```bash
cd apps/web
pnpm dev
```

Runs at: `http://localhost:3000`

### 5. Expose with ngrok

In a new terminal:

```bash
ngrok http 3000
```

Output:

```
Forwarding                    https://abc123def456.ngrok.io -> http://localhost:3000
```

**Your webhook URL is now**: `https://abc123def456.ngrok.io/api/stripe-webhook`

---

## Option A: Use Stripe CLI (Easier)

### Step 1: Forward Stripe Webhooks

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

Output:

```
Ready! Your webhook signing secret is: whsec_test_XXXXXXXXXXXXX
```

### Step 2: Update `.env.local`

```env
STRIPE_WEBHOOK_SECRET=whsec_test_XXXXXXXXXXXXX
```

### Step 3: Trigger Test Events

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger subscription.deleted
```

**Advantages**:

- ✅ No ngrok URL needed
- ✅ Easy to test locally
- ✅ Matches production flow
- ✅ Can trigger multiple events

---

## Option B: Configure Stripe Dashboard Webhook

If you want to test with ngrok URL:

### Step 1: Get ngrok URL

```bash
ngrok http 3000
# Output: https://abc123def456.ngrok.io
```

### Step 2: Configure Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add an endpoint"**
3. Enter: `https://abc123def456.ngrok.io/api/stripe-webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy signing secret
6. Update `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_test_XXXXXXXXXXXXX
   ```

### Step 3: Test

- Complete a test checkout at `http://localhost:3000/pricing`
- Watch ngrok dashboard for webhook activity
- Check your app logs for webhook processing

---

## Database Webhooks (If Using Supabase)

If you have Supabase database webhooks, you can also expose them:

### Configure in Supabase Dashboard

1. Go to [Supabase Dashboard → Database → Webhooks](https://supabase.com/dashboard/project/_/integrations/webhooks)
2. Update webhook URL:
   ```
   https://abc123def456.ngrok.io/api/webhooks/supabase
   ```
3. Update table/event triggers as needed

---

## Testing Checklist

### With Stripe CLI (Recommended)

```bash
# Terminal 1: Start your app
cd apps/web && pnpm dev

# Terminal 2: Listen for webhooks
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Terminal 3: Trigger test events
stripe trigger checkout.session.completed

# Expected result:
# ✅ Webhook received in Terminal 1 logs
# ✅ Subscription created in Supabase
# ✅ No 500 errors
```

### With ngrok

```bash
# Terminal 1: Start your app
cd apps/web && pnpm dev

# Terminal 2: Expose with ngrok
ngrok http 3000

# Terminal 3: Add webhook in Stripe (once), then test
stripe trigger checkout.session.completed

# Expected result:
# ✅ Webhook shown in ngrok web interface (http://localhost:4040)
# ✅ Received in your app logs
# ✅ Subscription in Supabase
```

---

## Monitoring Webhooks

### 1. Stripe CLI Monitor

```bash
stripe logs tail
```

Shows all Stripe API calls and webhook deliveries.

### 2. ngrok Dashboard

Visit `http://localhost:4040` in browser while ngrok is running.

Shows:

- All HTTP requests to your ngrok URL
- Request/response headers
- Request body
- Status codes

### 3. Your App Logs

Check Next.js dev server logs:

```
[GET] /api/stripe-webhook
[200] Successfully processed webhook
```

### 4. Supabase Logs

```bash
# Check if webhook event was created
# In Supabase dashboard → SQL Editor:
SELECT * FROM processed_stripe_events ORDER BY created_at DESC;
SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';
```

---

## Environment Variables Summary

### Required for Local Testing

```env
# Supabase (Production)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...  # From stripe listen
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Price IDs (Test)
STRIPE_PRICE_HOBBY_MONTHLY=price_...
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...

# Local App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Quick Start

**Fastest way to test locally:**

```bash
# Terminal 1
cd apps/web && pnpm dev

# Terminal 2
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Terminal 3 (after seeing "Ready! Your webhook signing secret is...")
stripe trigger checkout.session.completed

# Watch Terminal 1 for webhook logs
```

That's it! No Docker, no ngrok setup needed.

---

## Troubleshooting

### Webhook not received

1. Check `.env.local` has correct `STRIPE_WEBHOOK_SECRET`
2. Make sure `stripe listen` is running with `--forward-to localhost:3000/...`
3. Check Next.js app logs for errors
4. Verify webhook endpoint exists: `GET /api/stripe-webhook` should work

### 500 error on webhook

Check app logs for the actual error message. Most likely:

- Missing `STRIPE_PRICE_*` env vars
- Database connection issue
- Webhook handler code error

### ngrok URL keeps changing

Add ngrok config to prevent URL changes:

```bash
# Get auth token: https://dashboard.ngrok.com/
ngrok config add-authtoken YOUR_TOKEN

# Upgrade to static URL (paid feature)
ngrok http 3000 --domain=your-static-domain.ngrok.io
```

---

## Next Steps

1. **Set up Stripe CLI**: `stripe login && stripe listen`
2. **Update `.env.local`** with webhook secret from Stripe CLI
3. **Test**: `stripe trigger checkout.session.completed`
4. **Verify**: Check Supabase for new subscription record
5. **Deploy**: Once tested locally, deploy to production

---

## Production Deployment

When you deploy to production:

1. Webhook URL automatically updates to your Vercel domain
2. Use **live mode** Stripe keys (not test)
3. Update `STRIPE_WEBHOOK_SECRET` in Vercel to production secret
4. Test with real test card in Stripe Dashboard

See `STRIPE_FIXES_SUMMARY.md` for production checklist.
