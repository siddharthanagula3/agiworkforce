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

import { redirect } from 'next/navigation';
import { UpgradeWelcome } from './UpgradeWelcome';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const params = await searchParams;
  if (params.success !== 'true') redirect('/settings/billing');
  return <UpgradeWelcome />;
}
