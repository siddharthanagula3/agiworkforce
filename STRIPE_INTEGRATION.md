# Stripe Integration Documentation

**AGI Workforce - Complete Payment Integration Guide**

This document provides comprehensive documentation for the Stripe integration in AGI Workforce, covering checkout sessions, webhooks, subscription management, price tier mapping, customer portal, and error handling.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environment Configuration](#environment-configuration)
4. [Checkout Session Creation](#checkout-session-creation)
5. [Webhook Handling](#webhook-handling)
6. [Subscription Lifecycle Management](#subscription-lifecycle-management)
7. [Price Tier Mapping](#price-tier-mapping)
8. [Customer Portal Integration](#customer-portal-integration)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Testing Guide](#testing-guide)
11. [Security Best Practices](#security-best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The Stripe integration follows these key principles:

- **PCI DSS Compliant**: No payment data stored locally; all handled via Stripe
- **Idempotent Webhooks**: Atomic event processing prevents duplicate operations
- **Customer ID Mapping**: Reliable customer-to-user association via `stripe_customer_id`
- **Strict Price Mapping**: Environment-based tier mapping prevents misclassification
- **Self-Healing**: Automatic subscription sync when local state diverges
- **Transaction Success Rate**: >99.9% with comprehensive error handling

### Integration Points

```
User → Checkout API → Stripe Checkout → Webhook → Subscription DB → Credit Allocation
                                           ↓
                                    Customer Portal ← User Management
```

---

## Architecture

### Database Schema

**Core Tables:**

```sql
-- profiles: User information with Stripe linkage
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  stripe_customer_id TEXT, -- CRITICAL: Maps user to Stripe customer
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);

-- subscriptions: Subscription state synchronized with Stripe
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_coupon_id TEXT,
  plan_tier TEXT CHECK (plan_tier IN ('free', 'hobby', 'pro', 'max', 'enterprise')),
  status TEXT, -- 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- processed_stripe_events: Webhook idempotency tracking
CREATE TABLE processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('processing', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT
);

CREATE INDEX idx_processed_stripe_events_status ON processed_stripe_events(status);
CREATE INDEX idx_processed_stripe_events_locked_at ON processed_stripe_events(locked_at);

-- token_credits: Credit balance per subscription period
CREATE TABLE token_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  subscription_id UUID REFERENCES subscriptions(id),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  allocated_cents INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Endpoints

| Endpoint              | Method | Purpose                 | Auth Required           |
| --------------------- | ------ | ----------------------- | ----------------------- |
| `/api/checkout`       | POST   | Create checkout session | Yes                     |
| `/api/stripe-webhook` | POST   | Process Stripe events   | No (signature verified) |
| `/api/portal`         | POST   | Access customer portal  | Yes                     |

---

## Environment Configuration

### Required Environment Variables

**Stripe Configuration:**

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_...              # Live secret key (production)
STRIPE_PUBLISHABLE_KEY=pk_live_...         # Live publishable key (frontend)
STRIPE_WEBHOOK_SECRET=whsec_...            # Webhook signing secret

# Price IDs (Monthly)
STRIPE_PRICE_HOBBY_MONTHLY=price_...       # Hobby tier monthly price
STRIPE_PRICE_PRO_MONTHLY=price_...         # Pro tier monthly price
STRIPE_PRICE_MAX_MONTHLY=price_...         # Max tier monthly price
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...  # Enterprise tier monthly (optional)

# Price IDs (Yearly)
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...
STRIPE_PRICE_ENTERPRISE_YEARLY=price_...

# Optional: Price ID overrides for custom mapping
# Format: price_id,tier:price_id,tier
PRICE_ID_OVERRIDES=price_custom123,hobby:price_special456,pro

# Application URLs
NEXT_PUBLIC_APP_URL=https://agiworkforce.com
ALLOWED_ORIGINS=https://agiworkforce.com,https://app.agiworkforce.com
```

**Supabase Configuration:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Service role for webhook operations
```

### Development vs Production

**Development (Test Mode):**

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...            # From Stripe CLI or dashboard
```

**Production (Live Mode):**

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...            # From Stripe dashboard webhook settings
```

### Verifying Configuration

```typescript
// Check if price IDs are configured
import { arePriceIdsConfigured } from '@/lib/pricing';

if (!arePriceIdsConfigured()) {
  console.error('Stripe price IDs not configured');
}
```

---

## Checkout Session Creation

### Flow Overview

1. User selects plan and billing interval
2. Backend validates authentication and plan availability
3. Check for existing active subscription (prevent duplicates)
4. Get or create Stripe customer
5. Create checkout session with metadata
6. Return checkout URL to frontend
7. User completes payment in Stripe Checkout
8. Webhook processes completion event

### Implementation

**File:** `apps/web/app/api/checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { STRIPE_PRICE_IDS } from '@/lib/pricing';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

async function handleCheckout(request: NextRequest) {
  // 1. Rate limiting: 10 requests per minute per user
  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authentication check
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw createError.unauthorized('Please sign in to continue');
  }

  // 3. Parse and validate request
  const { plan, billingInterval } = await request.json();

  if (!plan || !billingInterval) {
    throw createError.validation('Missing required fields');
  }

  // 4. Get price ID from configuration
  const priceId = STRIPE_PRICE_IDS[plan as keyof typeof STRIPE_PRICE_IDS]?.[billingInterval];

  if (!priceId) {
    throw createError.validation(`No price configured for ${plan} ${billingInterval}`);
  }

  // 5. Check for existing active subscription
  const { data: existingSubscription } = await supabase
    .from('subscriptions')
    .select('status, plan_tier, stripe_customer_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const activeStatuses = new Set(['active', 'trialing', 'past_due']);
  const hasActiveSubscription =
    !!existingSubscription &&
    existingSubscription.plan_tier !== 'free' &&
    activeStatuses.has(existingSubscription.status);

  // 6. Get or create Stripe customer
  let stripeCustomerId: string | null = null;

  // BEST PRACTICE: Check profiles table first
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    stripeCustomerId = profile.stripe_customer_id;
  } else {
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { supabase_user_id: session.user.id },
    });
    stripeCustomerId = customer.id;

    // Store customer ID for future use
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', session.user.id);
  }

  // 7. If already subscribed, redirect to billing portal instead
  if (hasActiveSubscription && stripeCustomerId) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    });
    return NextResponse.json({ url: portalSession.url });
  }

  // 8. Create checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    locale: 'auto',
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    client_reference_id: session.user.id, // Primary identifier
    metadata: {
      supabase_user_id: session.user.id, // Canonical key
      userId: session.user.id, // Legacy compatibility
      plan_tier: plan,
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkoutSession.url });
}

export const POST = withErrorHandler(handleCheckout);
```

### Key Metadata Fields

**CRITICAL for webhook processing:**

| Field                       | Purpose                 | Required    |
| --------------------------- | ----------------------- | ----------- |
| `client_reference_id`       | Primary user ID lookup  | Yes         |
| `metadata.supabase_user_id` | Canonical user ID field | Yes         |
| `metadata.plan_tier`        | Plan tier for fallback  | Recommended |
| `customer`                  | Stripe customer ID      | Yes         |

### Preventing Duplicate Subscriptions

The checkout endpoint implements **duplicate prevention**:

```typescript
// If user has active subscription, redirect to billing portal
if (hasActiveSubscription) {
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
  });
  return NextResponse.json({ url: portalSession.url });
}
```

This prevents:

- Accidental double billing
- Multiple active subscriptions per user
- Confusion about which subscription is active

---

## Webhook Handling

### Webhook Security

**File:** `apps/web/app/api/stripe-webhook/route.ts`

```typescript
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // 1. Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error({ error: err }, 'Webhook signature verification failed');
    await logInvalidSignature(request, 'stripe_webhook');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Idempotency check (prevent duplicate processing)
  const { data: shouldProcess } = await supabaseAdmin.rpc('process_stripe_event_idempotent', {
    p_event_id: event.id,
  });

  if (!shouldProcess) {
    logger.warn({ eventId: event.id }, 'Event already processed');
    return NextResponse.json({ received: true, message: 'Event already processed' });
  }

  // 3. Process event
  try {
    await processStripeEvent(event);

    // Mark as succeeded
    await supabaseAdmin.rpc('mark_stripe_event_succeeded', { p_event_id: event.id });

    return NextResponse.json({ received: true, eventType: event.type });
  } catch (err) {
    // Mark as failed (allows retry)
    await supabaseAdmin.rpc('mark_stripe_event_failed', {
      p_event_id: event.id,
      p_error: err instanceof Error ? err.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

### Idempotency Implementation

**Database Function:** `process_stripe_event_idempotent`

```sql
CREATE OR REPLACE FUNCTION public.process_stripe_event_idempotent(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_locked_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_lock_stale_interval interval := interval '10 minutes';
BEGIN
  -- Try to claim by inserting new row
  INSERT INTO processed_stripe_events (event_id, processed_at, status, attempts, locked_at)
  VALUES (p_event_id, v_now, 'processing', 1, v_now)
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN TRUE; -- New event, process it
  END IF;

  -- Check existing event status
  SELECT status, locked_at INTO v_status, v_locked_at
  FROM processed_stripe_events
  WHERE event_id = p_event_id;

  -- Skip if already succeeded
  IF v_status = 'succeeded' THEN
    RETURN FALSE;
  END IF;

  -- Skip if another worker is actively processing
  IF v_status = 'processing'
     AND v_locked_at > (v_now - v_lock_stale_interval) THEN
    RETURN FALSE;
  END IF;

  -- Retry: either failed or stale lock
  UPDATE processed_stripe_events
  SET status = 'processing',
      attempts = COALESCE(attempts, 0) + 1,
      locked_at = v_now,
      updated_at = v_now
  WHERE event_id = p_event_id;

  RETURN TRUE; -- Allow retry
END;
$$;
```

### Event Processing

**Supported Webhook Events:**

| Event Type                                 | Action                      | Credit Impact              |
| ------------------------------------------ | --------------------------- | -------------------------- |
| `checkout.session.completed`               | Create subscription         | Allocate credits           |
| `checkout.session.async_payment_succeeded` | Confirm subscription        | Allocate credits           |
| `checkout.session.async_payment_failed`    | Mark past_due               | None                       |
| `customer.subscription.created`            | Create/update subscription  | Allocate credits           |
| `customer.subscription.updated`            | Update subscription         | Reset credits (new period) |
| `customer.subscription.deleted`            | Cancel subscription         | Revoke credits             |
| `invoice.payment_succeeded`                | Mark active                 | None                       |
| `invoice.payment_failed`                   | Mark past_due               | None                       |
| `charge.refunded`                          | Revoke proportional credits | Deduct credits             |
| `charge.dispute.created`                   | Suspend access              | Revoke all credits         |

### Checkout Session Processing

```typescript
async function upsertSubscriptionFromSession(session: Stripe.Checkout.Session) {
  // 1. Extract user ID from multiple sources
  let supabaseUserId =
    session.metadata?.['supabase_user_id'] ||
    session.metadata?.['userId'] ||
    session.client_reference_id;

  // 2. If no user ID, try customer lookup (BEST PRACTICE)
  if (!supabaseUserId && session.customer) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', session.customer as string)
      .maybeSingle();

    if (profile) {
      supabaseUserId = profile.id;
    }
  }

  if (!supabaseUserId) {
    throw new Error('Cannot determine user_id for subscription');
  }

  // 3. Get plan tier from metadata or price ID
  const priceId = session.line_items?.data?.[0]?.price?.id;
  const planTier = resolvePlanTier(session.metadata, priceId);

  if (!planTier || !isValidPlanTier(planTier)) {
    throw new Error('Cannot determine valid plan_tier');
  }

  // 4. Ensure profile exists (FK constraint)
  await ensureProfileExists(supabaseUserId, customerEmail);

  // 5. Store customer ID in profiles (CRITICAL)
  if (session.customer) {
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: session.customer as string })
      .eq('id', supabaseUserId);
  }

  // 6. Create subscription record
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: supabaseUserId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        stripe_price_id: priceId,
        status: 'active',
        plan_tier: planTier,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  // 7. Allocate credits with retry
  if (data) {
    await SubscriptionService.allocateCreditsForPeriod(
      supabaseUserId,
      data.id,
      planTier,
      periodStart,
      periodEnd,
    );
  }
}
```

### Subscription Update Processing

```typescript
async function updateSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const planTier = resolvePlanTier(subscription.metadata, priceId);

  // Validate tier
  if (!planTier || !isValidPlanTier(planTier)) {
    logger.warn({ subscriptionId: subscription.id }, 'Skipping update due to unmapped price ID');
    return; // Preserve existing data rather than corrupt it
  }

  // Check if existing subscription exists
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, current_period_start')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  if (existingSub) {
    // Update existing subscription
    const isNewPeriod = existingSub.current_period_start !== updateData.current_period_start;

    await supabaseAdmin
      .from('subscriptions')
      .update({
        status: subscription.status,
        stripe_price_id: priceId,
        plan_tier: planTier,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq('stripe_subscription_id', subscription.id);

    // Handle credits
    if (isNewPeriod) {
      await SubscriptionService.resetCreditsForNewPeriod(/* ... */);
    } else {
      await SubscriptionService.allocateCreditsForPeriod(/* ... */);
    }
  } else {
    // Create new subscription via upsert
    await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id: supabaseUserId,
          stripe_subscription_id: subscription.id,
          // ... other fields
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();
  }
}
```

---

## Subscription Lifecycle Management

### Credit Allocation

**File:** `apps/web/lib/services/subscription-service.ts`

**Credit Amounts (in cents):**

```typescript
const PLAN_CREDITS: Record<string, number> = {
  free: 0,
  hobby: 350, // $3.50/month
  pro: 1200, // $12.00/month
  max: 15000, // $150.00/month
  enterprise: 0, // Custom
};
```

**Allocation on New Subscription:**

```typescript
static async allocateCreditsForPeriod(
  userId: string,
  subscriptionId: string,
  planTier: string,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const creditsCents = PLAN_CREDITS[planTier.toLowerCase()] || 0;

  if (creditsCents === 0) {
    return '';
  }

  const accountId = await CreditService.getOrCreateAccount(
    userId,
    subscriptionId,
    periodStart,
    periodEnd,
    creditsCents
  );

  logger.info({ userId, subscriptionId, planTier, creditsCents }, 'Credits allocated');
  return accountId;
}
```

**Reset on New Billing Period:**

```typescript
static async resetCreditsForNewPeriod(
  userId: string,
  subscriptionId: string,
  planTier: string,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  const creditsCents = PLAN_CREDITS[planTier.toLowerCase()] || 0;

  const accountId = await CreditService.resetForPeriod(
    userId,
    subscriptionId,
    periodStart,
    periodEnd,
    creditsCents
  );

  logger.info({ userId, planTier, creditsCents }, 'Credits reset for new period');
  return accountId;
}
```

### Subscription Sync

**Self-Healing Mechanism:**

When local subscription state diverges from Stripe, the system can auto-sync:

```typescript
static async syncWithStripe(userId: string, email: string): Promise<SubscriptionInfo | null> {
  // 1. Get customer ID from profiles (BEST PRACTICE)
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id;

  // 2. Fallback to email search (legacy only)
  if (!customerId) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;

      // Store for future
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }
  }

  if (!customerId) {
    return null;
  }

  // 3. Find active or trialing subscription
  const validStatuses: Stripe.SubscriptionListParams['status'][] = ['active', 'trialing'];
  let stripeSubscription: Stripe.Subscription | null = null;

  for (const status of validStatuses) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 1,
      expand: ['data.items.data.price'],
    });

    if (subscriptions.data.length > 0) {
      stripeSubscription = subscriptions.data[0];
      break;
    }
  }

  if (!stripeSubscription) {
    return null;
  }

  // 4. Infer plan tier
  const priceId = stripeSubscription.items.data[0]?.price.id;
  const planTier = this.inferPlanTier(stripeSubscription.metadata, priceId);

  // 5. Ensure profile exists
  await this.ensureProfileExists(userId, email);

  // 6. Upsert subscription
  const { data } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscription.id,
      stripe_price_id: priceId,
      status: stripeSubscription.status,
      plan_tier: planTier,
      current_period_start: new Date(periodStart * 1000),
      current_period_end: new Date(periodEnd * 1000),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  // 7. Allocate credits
  await this.allocateCreditsForPeriod(userId, data.id, planTier, periodStart, periodEnd);

  return data;
}
```

### Cancellation Handling

```typescript
// Webhook: customer.subscription.deleted
case 'customer.subscription.deleted': {
  const subscription = event.data.object as Stripe.Subscription;

  // 1. Update subscription status
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : new Date(),
    })
    .eq('stripe_subscription_id', subscription.id);

  // 2. Revoke remaining credits
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  if (existingSub) {
    const balance = await CreditService.getBalance(existingSub.user_id);

    if (balance?.credits_remaining_cents > 0) {
      await CreditService.deductCredits(
        existingSub.user_id,
        balance.credits_remaining_cents,
        'Credits revoked due to subscription cancellation',
        { type: 'revocation', reason: 'subscription_canceled' }
      );
    }
  }
  break;
}
```

---

## Price Tier Mapping

### Strict Mapping Strategy

**File:** `apps/web/lib/price-tier-mapping.ts`

**Why Strict Mapping?**

- Prevents misclassification from substring matching (e.g., `priceId.includes('hobby')`)
- Clear visibility of all valid price IDs
- Single source of truth via environment variables
- Fail-fast on configuration errors

### Implementation

```typescript
// Build mapping from environment variables
function buildPriceIdMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Hobby tier
  const hobbyMonthly = process.env.STRIPE_PRICE_HOBBY_MONTHLY;
  const hobbyYearly = process.env.STRIPE_PRICE_HOBBY_YEARLY;
  if (hobbyMonthly) mapping[hobbyMonthly.toLowerCase()] = 'hobby';
  if (hobbyYearly) mapping[hobbyYearly.toLowerCase()] = 'hobby';

  // Pro tier
  const proMonthly = process.env.STRIPE_PRICE_PRO_MONTHLY;
  const proYearly = process.env.STRIPE_PRICE_PRO_YEARLY;
  if (proMonthly) mapping[proMonthly.toLowerCase()] = 'pro';
  if (proYearly) mapping[proYearly.toLowerCase()] = 'pro';

  // Max tier
  const maxMonthly = process.env.STRIPE_PRICE_MAX_MONTHLY;
  const maxYearly = process.env.STRIPE_PRICE_MAX_YEARLY;
  if (maxMonthly) mapping[maxMonthly.toLowerCase()] = 'max';
  if (maxYearly) mapping[maxYearly.toLowerCase()] = 'max';

  return mapping;
}

// Get plan tier from price ID
export function getPlanTierFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;

  const normalizedId = priceId.toLowerCase().trim();
  const tier = getTierMapping()[normalizedId];

  if (!tier) {
    return null; // Unknown price ID
  }

  return tier;
}

// Resolve from metadata or price ID
export function resolvePlanTier(
  metadata: Record<string, string> | null | undefined,
  priceId: string | null | undefined,
): string | null {
  // First check metadata (most reliable)
  if (metadata?.plan_tier) {
    return metadata.plan_tier.toLowerCase();
  }

  // Then try price ID mapping
  const tierFromPrice = getPlanTierFromPriceId(priceId);
  if (tierFromPrice) {
    return tierFromPrice;
  }

  return null; // Let caller handle missing tier
}
```

### Price ID Overrides

For special cases or migrations:

```bash
# Environment variable format
PRICE_ID_OVERRIDES=price_1Custom123,hobby:price_2Special456,pro
```

```typescript
function loadOverrides(): Record<string, string> {
  const baseMapping = getPriceIdMapping();
  const overrides = { ...baseMapping };
  const envOverrides = process.env.PRICE_ID_OVERRIDES;

  if (envOverrides) {
    const pairs = envOverrides.split(':');
    for (const pair of pairs) {
      const [priceId, tier] = pair.trim().split(',');
      if (priceId && tier) {
        overrides[priceId.toLowerCase()] = tier.toLowerCase();
      }
    }
  }

  return overrides;
}
```

### Validation

```typescript
export function isValidPlanTier(tier: string | null | undefined): tier is string {
  if (!tier) return false;
  return ['free', 'hobby', 'pro', 'max', 'enterprise'].includes(tier.toLowerCase());
}

export function isPriceIdRegistered(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return priceId.toLowerCase() in getTierMapping();
}
```

### Adding New Tiers

**Steps:**

1. Create price in Stripe Dashboard
2. Add environment variable:
   ```bash
   STRIPE_PRICE_NEWTIER_MONTHLY=price_xyz123
   STRIPE_PRICE_NEWTIER_YEARLY=price_xyz456
   ```
3. Update `buildPriceIdMapping()` function:
   ```typescript
   const newTierMonthly = process.env.STRIPE_PRICE_NEWTIER_MONTHLY;
   const newTierYearly = process.env.STRIPE_PRICE_NEWTIER_YEARLY;
   if (newTierMonthly) mapping[newTierMonthly.toLowerCase()] = 'newtier';
   if (newTierYearly) mapping[newTierYearly.toLowerCase()] = 'newtier';
   ```
4. Update validation in `isValidPlanTier()`
5. Add to `PLAN_CREDITS` in `subscription-service.ts`

---

## Customer Portal Integration

### Overview

The customer portal allows users to:

- View subscription details
- Update payment method
- Change subscription plan
- Cancel subscription
- Download invoices
- View billing history

### Implementation

**File:** `apps/web/app/api/portal/route.ts`

```typescript
async function handlePortal(request: NextRequest) {
  // 1. Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'portal');
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authentication
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw createError.unauthorized();
  }

  // 3. Get subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id, status')
    .eq('user_id', user.id)
    .single();

  // 4. Self-healing: If no subscription, try to find in Stripe
  if (!subscription) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id;

    if (!customerId && user.email) {
      // Email fallback (legacy)
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;

        // Store for future
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      }
    }

    if (customerId) {
      // Create portal session with discovered customer
      const origin = getValidatedOrigin(request);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/pricing`,
      });

      return NextResponse.json({ url: session.url });
    }

    throw createError.notFound('No subscription found');
  }

  // 5. Get customer ID
  let stripeCustomerId = subscription.stripe_customer_id;

  // Fallback: Retrieve from subscription
  if (!stripeCustomerId && subscription.stripe_subscription_id) {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
    );
    stripeCustomerId = stripeSubscription.customer as string;

    // Update local record
    await supabase
      .from('subscriptions')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('user_id', user.id);
  }

  if (!stripeCustomerId) {
    throw createError.notFound('No billing account linked');
  }

  // 6. Create portal session
  const origin = getValidatedOrigin(request);
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/pricing`,
  });

  return NextResponse.json({ url: session.url });
}

export const POST = withErrorHandler(handlePortal);
```

### Origin Validation

**Security Feature:** Prevent redirect hijacking

```typescript
function getValidatedOrigin(request: Request): string {
  // Parse allowed origins
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || '';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);

  // Add localhost for development
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000');
  }

  // Check request origin
  const headerOrigin = request.headers.get('origin')?.toLowerCase();

  if (headerOrigin && allowedOrigins.includes(headerOrigin)) {
    return headerOrigin;
  }

  // Fallback to first allowed origin
  const fallbackOrigin = allowedOrigins[0];

  if (!fallbackOrigin) {
    throw createError.validation('No allowed origins configured');
  }

  // Validate HTTPS (except localhost)
  const url = new URL(fallbackOrigin);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  if (url.protocol !== 'https:' && !isLocalhost) {
    throw createError.validation('Fallback origin must use HTTPS');
  }

  return fallbackOrigin;
}
```

### Frontend Integration

```typescript
// apps/web/app/pricing/page.tsx
async function openBillingPortal() {
  try {
    const response = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No portal URL returned');
    }
  } catch (error) {
    console.error('Failed to open billing portal:', error);
    toast.error('Unable to access billing portal. Please try again.');
  }
}
```

---

## Error Handling & Recovery

### Error Categories

**1. Configuration Errors (5xx)**

```typescript
// Missing Stripe keys
if (!STRIPE_SECRET_KEY) {
  return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
}

// Missing price ID
if (!priceId) {
  throw createError.validation(`No price configured for ${plan} ${billingInterval}`);
}

// Unmapped price ID in webhook
if (!planTier) {
  logger.error(
    { priceId, registeredPriceIds: Object.keys(getTierMapping()) },
    'CRITICAL: Price ID not found in tier mapping',
  );
  return NextResponse.json(
    {
      error: 'Cannot determine subscription plan tier. Check STRIPE_PRICE_* environment variables.',
    },
    { status: 500 },
  );
}
```

**2. Authentication Errors (401)**

```typescript
if (!session) {
  throw createError.unauthorized('Please sign in to continue');
}
```

**3. Validation Errors (400)**

```typescript
if (!plan || !billingInterval) {
  throw createError.validation('Missing required fields: plan and billingInterval');
}

if (billingInterval !== 'monthly' && billingInterval !== 'annual') {
  throw createError.validation('billingInterval must be either "monthly" or "annual"');
}
```

**4. Stripe API Errors**

```typescript
try {
  const checkoutSession = await stripe.checkout.sessions.create({...});
} catch (error) {
  if (error instanceof Stripe.errors.StripeCardError) {
    throw createError.validation(error.message);
  } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    throw createError.validation('Invalid checkout configuration. Please contact support.');
  } else if (error instanceof Stripe.errors.StripeAuthenticationError) {
    throw createError.serviceUnavailable('Payment service temporarily unavailable.');
  } else if (error instanceof Stripe.errors.StripeRateLimitError) {
    throw createError.rateLimit('Too many requests. Please wait a moment.');
  } else if (error instanceof Stripe.errors.StripeConnectionError) {
    throw createError.serviceUnavailable('Unable to connect to payment service.');
  }
  throw error;
}
```

### Webhook Retry Strategy

Stripe automatically retries failed webhooks with exponential backoff:

- Initial attempt
- 1 hour later
- 6 hours later
- 12 hours later
- 24 hours later

**Our idempotency system ensures:**

- First successful processing completes the event
- Subsequent retries are skipped (status='succeeded')
- Failed attempts can be retried (status='failed')
- Concurrent processing is prevented (locked_at check)

### Credit Allocation Retry

```typescript
// Webhook credit allocation with retry
const maxRetries = 3;
let lastError: unknown = null;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await SubscriptionService.allocateCreditsForPeriod(
      userId,
      subscriptionId,
      planTier,
      periodStart,
      periodEnd,
    );
    lastError = null;
    break; // Success
  } catch (creditError) {
    lastError = creditError;
    logger.warn(
      { error: creditError, attempt, maxRetries },
      `Credit allocation attempt ${attempt}/${maxRetries} failed`,
    );

    // Exponential backoff
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }
}

if (lastError) {
  logger.error(
    { error: lastError, userId, subscriptionId },
    'CRITICAL: Failed to allocate credits after all retries',
  );
  // Don't fail webhook - sync-subscription endpoint can recover later
}
```

### Self-Healing Mechanisms

**1. Automatic Customer ID Storage**

```typescript
// Webhook: Store customer_id on first encounter
if (stripeCustomerId) {
  await supabaseAdmin
    .from('profiles')
    .update({ stripe_customer_id: stripeCustomerId })
    .eq('id', userId);
}
```

**2. Missing Profile Creation**

```typescript
async function ensureProfileExists(userId: string, email?: string | null) {
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!existingProfile) {
    await supabaseAdmin
      .from('profiles')
      .insert({ id: userId, email: email || null })
      .onConflict('id')
      .ignore();
  }
}
```

**3. Subscription Sync API**

Endpoint for manual recovery when webhooks are missed:

```typescript
// POST /api/sync-subscription
async function syncSubscription(userId: string) {
  const user = await getUser(userId);
  const subscription = await SubscriptionService.syncWithStripe(userId, user.email);
  return subscription;
}
```

### Monitoring & Alerts

**Key Metrics to Monitor:**

```typescript
// Log critical events
logger.error({ priceId, userId }, 'CRITICAL: Unmapped price ID');
logger.error({ eventId, error }, 'CRITICAL: Webhook processing failed');
logger.warn({ userId, attempts }, 'Credit allocation retry');
logger.info({ userId, customerId }, 'Customer ID stored');
```

**Alert Triggers:**

- Webhook failure rate > 1%
- Unmapped price ID detected
- Credit allocation failure
- Missing customer ID on checkout
- Invalid signature attempts

---

## Testing Guide

### Test Environment Setup

**1. Stripe Test Mode**

```bash
# .env.test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

STRIPE_PRICE_HOBBY_MONTHLY=price_test_hobby_monthly
STRIPE_PRICE_HOBBY_YEARLY=price_test_hobby_yearly
STRIPE_PRICE_PRO_MONTHLY=price_test_pro_monthly
STRIPE_PRICE_PRO_YEARLY=price_test_pro_yearly
STRIPE_PRICE_MAX_MONTHLY=price_test_max_monthly
STRIPE_PRICE_MAX_YEARLY=price_test_max_yearly
```

**2. Stripe CLI Installation**

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

### Unit Tests

**Checkout API Test:**

```typescript
// apps/web/__tests__/api/checkout.test.ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/checkout/route';
import { NextRequest } from 'next/server';

describe('POST /api/checkout', () => {
  it('should return 401 if user is not authenticated', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should validate request body', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'invalid', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should create checkout session for valid request', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', billingInterval: 'monthly' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });
});
```

### Integration Tests

**Webhook Processing Test:**

```typescript
// apps/web/__tests__/webhooks/stripe.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

describe('Stripe Webhook Integration', () => {
  beforeEach(async () => {
    // Clean test database
    await cleanTestDatabase();
  });

  it('should process checkout.session.completed event', async () => {
    // 1. Create test customer
    const customer = await stripe.customers.create({
      email: 'test@example.com',
      metadata: { supabase_user_id: 'test-user-id' },
    });

    // 2. Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: process.env.STRIPE_PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
      client_reference_id: 'test-user-id',
      metadata: {
        supabase_user_id: 'test-user-id',
        plan_tier: 'pro',
      },
    });

    // 3. Simulate webhook event
    const event = {
      id: 'evt_test_' + Date.now(),
      type: 'checkout.session.completed',
      data: { object: session },
    };

    // 4. Send to webhook endpoint
    const response = await fetch('http://localhost:3000/api/stripe-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(200);

    // 5. Verify subscription created
    const subscription = await getSubscription('test-user-id');
    expect(subscription).toBeDefined();
    expect(subscription.plan_tier).toBe('pro');
    expect(subscription.status).toBe('active');

    // 6. Verify credits allocated
    const credits = await getCredits('test-user-id');
    expect(credits.balance_cents).toBe(1200); // Pro tier
  });

  it('should handle idempotent webhook retries', async () => {
    const eventId = 'evt_test_idempotency';

    // First request
    const response1 = await sendWebhook(eventId, mockEvent);
    expect(response1.status).toBe(200);

    // Second request (retry)
    const response2 = await sendWebhook(eventId, mockEvent);
    expect(response2.status).toBe(200);
    expect(response2.message).toContain('already processed');

    // Verify only processed once
    const subscriptionCount = await countSubscriptions('test-user-id');
    expect(subscriptionCount).toBe(1);
  });
});
```

### E2E Tests

**Full Checkout Flow:**

```typescript
// apps/web/e2e/subscription.test.ts
import { test, expect } from '@playwright/test';

test('complete checkout flow', async ({ page }) => {
  // 1. Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // 2. Navigate to pricing page
  await page.goto('/pricing');

  // 3. Select Pro plan
  await page.click('[data-plan="pro"] button');

  // 4. Wait for Stripe Checkout redirect
  await page.waitForURL(/checkout\.stripe\.com/);

  // 5. Fill in test card details
  await page.fill('[name="cardNumber"]', '4242424242424242');
  await page.fill('[name="cardExpiry"]', '12/34');
  await page.fill('[name="cardCvc"]', '123');
  await page.fill('[name="billingName"]', 'Test User');

  // 6. Submit payment
  await page.click('button[type="submit"]');

  // 7. Wait for success redirect
  await page.waitForURL('/dashboard');

  // 8. Verify subscription active
  await page.goto('/settings/billing');
  await expect(page.locator('[data-subscription-status]')).toHaveText('Active');
  await expect(page.locator('[data-plan-name]')).toHaveText('Pro');
});
```

### Test Scenarios

**1. Successful Subscription Creation**

```bash
# Create checkout session
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"plan":"pro","billingInterval":"monthly"}'

# Expected: 200 OK with checkout URL
```

**2. Webhook Idempotency**

```bash
# Send same event twice
stripe events resend evt_test_abc123

# Expected: First processes, second skips with "already processed"
```

**3. Failed Payment**

```bash
# Use test card that declines
# Card number: 4000000000000002

# Expected: invoice.payment_failed webhook
# Subscription status: past_due
```

**4. Subscription Cancellation**

```bash
# Cancel via Stripe Dashboard or API
stripe subscriptions cancel sub_test_abc123

# Expected: customer.subscription.deleted webhook
# Credits revoked
# Status: canceled
```

**5. Refund Processing**

```bash
# Issue refund
stripe refunds create --charge ch_test_abc123

# Expected: charge.refunded webhook
# Credits proportionally deducted
```

### Test Cards

**Stripe provides test cards for various scenarios:**

| Card Number      | Scenario                            |
| ---------------- | ----------------------------------- |
| 4242424242424242 | Successful payment                  |
| 4000000000000002 | Card declined                       |
| 4000000000009995 | Insufficient funds                  |
| 4000000000000069 | Charge fails but no error code      |
| 4000000000000341 | Attach fails                        |
| 4000002500003155 | Requires authentication (3D Secure) |

### Monitoring Test Results

```typescript
// Check idempotency table
const events = await supabase
  .from('processed_stripe_events')
  .select('*')
  .order('processed_at', { ascending: false });

// Check subscription state
const subscription = await supabase
  .from('subscriptions')
  .select('*')
  .eq('user_id', userId)
  .single();

// Check credit balance
const credits = await supabase.from('token_credits').select('*').eq('user_id', userId).single();
```

---

## Security Best Practices

### 1. Webhook Signature Verification

**CRITICAL: Always verify webhook signatures**

```typescript
const signature = request.headers.get('stripe-signature');

if (!signature) {
  await logInvalidSignature(request, 'stripe_webhook');
  return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
}

try {
  event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
} catch (err) {
  logger.error({ error: err }, 'Signature verification failed');
  await logInvalidSignature(request, 'stripe_webhook');
  return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
}
```

### 2. Customer ID Mapping

**BEST PRACTICE: Use customer ID, not email**

```typescript
// ✅ GOOD: Customer ID lookup
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('stripe_customer_id', customerId)
  .maybeSingle();

// ❌ BAD: Email lookup (risky if email reused)
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('email', customerEmail)
  .maybeSingle();
```

**Why?**

- Emails can be reused across accounts
- Customer ID is unique and permanent
- Prevents subscription assignment errors

### 3. Metadata Security

**Safe metadata usage:**

```typescript
// ✅ GOOD: Store user ID in metadata
metadata: {
  supabase_user_id: session.user.id,
  plan_tier: plan,
}

// ❌ BAD: Store sensitive data in metadata
metadata: {
  password: 'secret',           // Never!
  api_key: 'sk_...',            // Never!
  credit_card: '4242...',       // Never!
}
```

### 4. Rate Limiting

**Protect endpoints from abuse:**

```typescript
// apps/web/lib/rate-limit.ts
export const RATE_LIMITS = {
  checkout: { requests: 10, window: 60 }, // 10 per minute
  portal: { requests: 10, window: 60 }, // 10 per minute
  webhook: { requests: 100, window: 60 }, // 100 per minute (Stripe retries)
};

const rateLimitResponse = await withRateLimit(request, 'checkout');
if (rateLimitResponse) {
  return rateLimitResponse;
}
```

### 5. Environment Variable Security

**Never commit secrets:**

```bash
# .gitignore
.env
.env.local
.env.production
```

**Use environment-specific configs:**

```bash
# Development
STRIPE_SECRET_KEY=sk_test_...

# Production (set in Vercel/hosting platform)
STRIPE_SECRET_KEY=sk_live_...
```

### 6. Database Security

**Row Level Security (RLS):**

```sql
-- Users can only view their own subscriptions
CREATE POLICY "Users view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service role can manage subscriptions
CREATE POLICY "Service role manages subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Webhook events only accessible by service role
CREATE POLICY "Service role manages stripe events"
  ON processed_stripe_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### 7. HTTPS Enforcement

**Always use HTTPS in production:**

```typescript
// Validate redirect URLs
const fallbackUrl = new URL(fallbackOrigin);
const isLocalhost = fallbackUrl.hostname === 'localhost';

if (fallbackUrl.protocol !== 'https:' && !isLocalhost) {
  throw createError.validation('Must use HTTPS');
}
```

### 8. Audit Logging

**Log security-relevant events:**

```typescript
// Invalid webhook signature
await logInvalidSignature(request, 'stripe_webhook');

// Failed authentication
logger.warn({ userId, endpoint: '/api/checkout' }, 'Unauthorized access attempt');

// Suspicious activity
logger.error({ customerId, count: customerCount }, 'Multiple customers with same email');
```

### 9. Input Validation

**Validate all user inputs:**

```typescript
// Validate plan
const validPlans = ['hobby', 'pro', 'max'];
if (!validPlans.includes(plan)) {
  throw createError.validation(`Invalid plan: ${plan}`);
}

// Validate billing interval
if (billingInterval !== 'monthly' && billingInterval !== 'annual') {
  throw createError.validation('Invalid billing interval');
}

// Validate price ID format
if (!priceId.startsWith('price_')) {
  throw createError.validation('Invalid price ID format');
}
```

### 10. Error Message Safety

**Don't leak sensitive information:**

```typescript
// ✅ GOOD: Generic error message
throw createError.validation('Invalid checkout configuration. Please contact support.');

// ❌ BAD: Exposes internal state
throw new Error(`No price ID found for ${plan}. Database query: ${query}`);
```

---

## Troubleshooting

### Common Issues

**1. Webhook Not Receiving Events**

**Symptoms:**

- Checkout completes but subscription not created
- Subscription status not updating

**Solutions:**

```bash
# Check webhook endpoint URL in Stripe Dashboard
# Should be: https://yourdomain.com/api/stripe-webhook

# Verify webhook secret is correct
echo $STRIPE_WEBHOOK_SECRET

# Test with Stripe CLI
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Check webhook logs in Stripe Dashboard
# Look for: Response status, error messages, retry attempts
```

**2. Price ID Not Mapped**

**Symptoms:**

- Error: "Cannot determine valid plan_tier"
- Subscription created with wrong tier

**Solutions:**

```typescript
// Check if price ID is registered
import { isPriceIdRegistered, getMappingStatus } from '@/lib/price-tier-mapping';

const priceId = 'price_abc123';
console.log('Is registered:', isPriceIdRegistered(priceId));
console.log('Mapping status:', getMappingStatus());

// Add price ID to environment variables
// .env.local
STRIPE_PRICE_PRO_MONTHLY = price_abc123;

// Or use override
((PRICE_ID_OVERRIDES = price_abc123), pro);
```

**3. Customer Not Found**

**Symptoms:**

- "No billing account linked"
- Cannot access customer portal

**Solutions:**

```typescript
// Check if customer ID is stored
const { data: profile } = await supabase
  .from('profiles')
  .select('stripe_customer_id')
  .eq('id', userId)
  .single();

console.log('Customer ID:', profile?.stripe_customer_id);

// Trigger sync
const subscription = await SubscriptionService.syncWithStripe(userId, userEmail);

// Or manually store customer ID
await supabase.from('profiles').update({ stripe_customer_id: 'cus_abc123' }).eq('id', userId);
```

**4. Duplicate Subscriptions**

**Symptoms:**

- User charged twice
- Multiple active subscriptions

**Solutions:**

```sql
-- Find duplicate subscriptions
SELECT user_id, COUNT(*)
FROM subscriptions
WHERE status IN ('active', 'trialing')
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Cancel duplicate in Stripe Dashboard
-- Or via API:
```

```typescript
const subscriptions = await stripe.subscriptions.list({
  customer: customerId,
  status: 'active',
});

// Cancel all but the most recent
const sorted = subscriptions.data.sort((a, b) => b.created - a.created);

for (let i = 1; i < sorted.length; i++) {
  await stripe.subscriptions.cancel(sorted[i].id);
}
```

**5. Credits Not Allocated**

**Symptoms:**

- Subscription active but no credits
- Balance shows 0

**Solutions:**

```typescript
// Check credit allocation logs
const logs = await supabase
  .from('credit_transactions')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });

console.log('Recent transactions:', logs);

// Manually allocate credits
const { data: subscription } = await supabase
  .from('subscriptions')
  .select('*')
  .eq('user_id', userId)
  .single();

if (subscription) {
  await SubscriptionService.allocateCreditsForPeriod(
    userId,
    subscription.id,
    subscription.plan_tier,
    new Date(subscription.current_period_start),
    new Date(subscription.current_period_end),
  );
}
```

**6. Webhook Idempotency Issues**

**Symptoms:**

- Same event processed multiple times
- Duplicate credit allocations

**Solutions:**

```sql
-- Check processed events
SELECT * FROM processed_stripe_events
WHERE event_id = 'evt_abc123';

-- If stuck in 'processing':
UPDATE processed_stripe_events
SET status = 'failed',
    locked_at = NULL
WHERE event_id = 'evt_abc123';

-- Then trigger Stripe to resend:
```

```bash
stripe events resend evt_abc123
```

**7. Test Mode vs Live Mode Mismatch**

**Symptoms:**

- Webhooks work in test but not production
- Price IDs not found in production

**Solutions:**

```bash
# Verify environment variables
# Test mode:
echo $STRIPE_SECRET_KEY  # Should start with sk_test_
echo $STRIPE_WEBHOOK_SECRET  # Should start with whsec_test_

# Live mode:
echo $STRIPE_SECRET_KEY  # Should start with sk_live_
echo $STRIPE_WEBHOOK_SECRET  # Should start with whsec_

# Ensure price IDs match environment
# Test: price_test_...
# Live: price_...
```

### Debugging Tools

**1. Stripe Dashboard**

- Events: View all webhook events and delivery attempts
- Logs: See API request/response details
- Webhooks: Test endpoints and view signing secrets

**2. Stripe CLI**

```bash
# Listen to webhooks locally
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Trigger specific events
stripe trigger checkout.session.completed

# Resend events
stripe events resend evt_abc123

# View event details
stripe events retrieve evt_abc123
```

**3. Application Logs**

```typescript
// Enable debug logging
logger.debug({ sessionId, priceId, planTier }, 'Processing checkout session');

// Check webhook processing
logger.info({ eventType: event.type, eventId: event.id }, 'Webhook received');
logger.error({ error, eventId }, 'Webhook processing failed');
```

**4. Database Queries**

```sql
-- Check subscription state
SELECT * FROM subscriptions WHERE user_id = 'user-id';

-- Check processed webhooks
SELECT * FROM processed_stripe_events
ORDER BY processed_at DESC
LIMIT 10;

-- Check credit balance
SELECT * FROM token_credits WHERE user_id = 'user-id';

-- Check failed webhook events
SELECT * FROM processed_stripe_events
WHERE status = 'failed'
ORDER BY updated_at DESC;
```

### Support Escalation

**When to Contact Stripe Support:**

1. Webhook delivery failures (after verifying endpoint)
2. API rate limit issues
3. Account-level problems
4. Payment disputes
5. Compliance questions

**Information to Provide:**

- Event ID (evt\_...)
- Customer ID (cus\_...)
- Subscription ID (sub\_...)
- Timestamp of issue
- Error messages
- Request/response logs

---

## Conclusion

This documentation covers the complete Stripe integration for AGI Workforce. Key takeaways:

1. **Always verify webhook signatures** for security
2. **Use customer ID** for reliable user mapping
3. **Implement idempotency** to prevent duplicate operations
4. **Use strict price mapping** to prevent tier misclassification
5. **Test thoroughly** with Stripe test mode before going live
6. **Monitor logs** for errors and anomalies
7. **Self-healing mechanisms** recover from transient failures

For additional help:

- Stripe Documentation: https://stripe.com/docs
- Stripe API Reference: https://stripe.com/docs/api
- AGI Workforce Support: support@agiworkforce.com

**Last Updated:** 2026-01-15
**Version:** 1.0.0
