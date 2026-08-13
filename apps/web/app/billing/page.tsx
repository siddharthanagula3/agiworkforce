/**
 * `/billing` — post-checkout splash, or a redirect into Settings.
 *
 * This used to render a second, older billing dashboard alongside the wired
 * one at `/settings/billing`. Two screens for one thing meant the stale copy
 * kept its own idea of the plan: it showed "Payment successful!" above
 * "Current Plan: FREE / No subscription", and offered "Upgrade to Basic" to an
 * account that had just paid for Max 15x.
 *
 * The route survives rather than being deleted because Stripe's `success_url`
 * points at it, and changing that alone would strand checkout sessions already
 * in flight with the old URL. So it keeps the one job only it can do — greeting
 * someone who just paid — and hands every other visit to the real billing UI.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { isSelfServePaidPlanTier } from '@agiworkforce/types';
import { requireEnv } from '@shared/utils/env';
import { STRIPE_API_VERSION } from '@/lib/stripe-config';
import { isStripeCheckoutSessionId } from '@/lib/server/stripe-resource-ids';
import { UpgradeWelcome } from './UpgradeWelcome';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: STRIPE_API_VERSION });
  }
  return stripeClient;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  if (params.success !== 'true' || !isStripeCheckoutSessionId(params.session_id)) {
    return redirect('/settings/billing');
  }

  const { userId } = await auth();
  if (!userId) {
    return redirect(`/login?redirectTo=${encodeURIComponent('/settings/billing')}`);
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(params.session_id);
  } catch {
    return redirect('/settings/billing');
  }

  // Current checkout always writes client_reference_id. Metadata is retained as
  // a fallback for older sessions that predate it, but a contradictory metadata
  // value must not let a second account claim a session with an explicit owner.
  const sessionOwner = session.client_reference_id ?? session.metadata?.['user_id'];
  if (sessionOwner !== userId) {
    return redirect('/settings/billing');
  }

  // A verified Stripe session proves that this account returned from Checkout,
  // but the existing subscription in `/api/me` may still be the PREVIOUS paid
  // tier until the webhook commits the upgrade. Carry the authenticated target
  // from the session so the welcome screen waits for that exact plan instead
  // of treating any paid tier as proof that this checkout activated.
  const expectedPlan = session.metadata?.['plan_tier'];
  if (!isSelfServePaidPlanTier(expectedPlan)) {
    return redirect('/settings/billing');
  }

  const checkoutState =
    session.payment_status === 'paid'
      ? 'paid'
      : session.status === 'complete'
        ? 'confirmed'
        : 'processing';
  return <UpgradeWelcome checkoutState={checkoutState} expectedPlan={expectedPlan} />;
}
