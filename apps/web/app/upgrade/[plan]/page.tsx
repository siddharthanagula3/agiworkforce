import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isPerSeatBillingPlan,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';

import { UpgradeOrderScreen } from './UpgradeOrderScreen';

export default async function UpgradePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ plan: string }>;
  searchParams: Promise<{ interval?: string }>;
}) {
  const { plan } = await params;
  const { interval } = await searchParams;
  // Team is self-serve but priced per seat, and the seat count and interval are
  // chosen on /pricing. Accepting it here would render an order screen that
  // silently bills one seat, monthly.
  if (isPerSeatBillingPlan(plan)) redirect('/pricing');
  if (!(SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]).includes(plan)) notFound();

  const { userId } = await auth();
  if (!userId) redirect(`/login?redirectTo=${encodeURIComponent(`/upgrade/${plan}`)}`);

  return (
    <main className="min-h-screen">
      <UpgradeOrderScreen
        plan={plan as SelfServeIndividualPlanTier}
        billingInterval={interval === 'yearly' ? 'yearly' : 'monthly'}
      />
    </main>
  );
}
