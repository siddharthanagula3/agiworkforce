import { notFound, redirect } from 'next/navigation';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isPerSeatBillingPlan,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';

import { UpgradeOrderScreen } from './UpgradeOrderScreen';
import { getRequestIdentity } from '@/lib/server/identity';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';

export default async function UpgradePlanPage({ params }: { params: Promise<{ plan: string }> }) {
  const { plan } = await params;
  // Seat count and interval for per-seat plans are only chosen on /pricing.
  if (isPerSeatBillingPlan(plan)) redirect('/pricing#pricing-team-title');
  if (!(SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).includes(plan)) notFound();

  const { subject: userId } = await getRequestIdentity();
  if (!userId) redirect(sessionExpiredRedirect(`/upgrade/${plan}`));

  return (
    <main id="main-content" className="min-h-screen">
      <UpgradeOrderScreen plan={plan as SelfServeIndividualPlanTier} />
    </main>
  );
}
