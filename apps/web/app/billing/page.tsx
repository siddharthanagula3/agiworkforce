import { redirect } from 'next/navigation';
import { isSelfServePaidPlanTier } from '@agiworkforce/types';
import { isStripeCheckoutSessionId } from '@/lib/server/stripe-resource-ids';
import { stripePaymentProvider } from '@/lib/server/payments';
import type { NormalizedPurchase } from '@/lib/server/payments';
import { UpgradeWelcome } from './UpgradeWelcome';
import { getRequestIdentity } from '@/lib/server/identity';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';

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
    return redirect(sessionExpiredRedirect('/settings/billing'));
  }

  let purchase: NormalizedPurchase;
  try {
    purchase = await stripePaymentProvider.verifyPurchase({
      reference: params.session_id,
      ownerReference: userId,
    });
  } catch {
    return redirect('/settings/billing');
  }

  if (purchase.ownerReference !== userId) {
    return redirect('/settings/billing');
  }

  if (!isSelfServePaidPlanTier(purchase.planTier)) {
    return redirect('/settings/billing');
  }

  const checkoutState =
    purchase.state === 'paid'
      ? 'paid'
      : purchase.state === 'confirmed'
        ? 'confirmed'
        : 'processing';
  return <UpgradeWelcome checkoutState={checkoutState} expectedPlan={purchase.planTier} />;
}
