import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { isSelfServePaidPlanTier } from '@agiworkforce/types';
import { requireEnv } from '@shared/utils/env';
import { STRIPE_CLIENT_OPTIONS } from '@/lib/stripe-config';
import { isStripeCheckoutSessionId } from '@/lib/server/stripe-resource-ids';
import { UpgradeWelcome } from './UpgradeWelcome';
import { getRequestIdentity } from '@/lib/server/identity';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), STRIPE_CLIENT_OPTIONS);
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

  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    return redirect(`/login?redirectTo=${encodeURIComponent('/settings/billing')}`);
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(params.session_id);
  } catch {
    return redirect('/settings/billing');
  }

  const sessionOwner = session.client_reference_id ?? session.metadata?.['user_id'];
  if (sessionOwner !== userId) {
    return redirect('/settings/billing');
  }

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
