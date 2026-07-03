/**
 * BillingSettings — the Billing settings section (source-of-truth IA · DESK-1).
 *
 * A focused view of the user's plan, subscription status, current period, and a
 * real "Manage billing" action that opens the Stripe customer portal. Reads the
 * SAME real stores/actions the Account section uses (`useAuthStore` +
 * `openBillingPortal`) — no fabricated data. Plan/cancellation flows continue to
 * live in the Account section; this section is the at-a-glance billing surface
 * the locked IA requires.
 */
import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '../../stores/auth';
import { openBillingPortal } from '../../lib/stripeCheckout';

export function BillingSettings() {
  const { subscriptionStatus, currentPeriodEnd, planDisplayName } = useAuthStore(
    useShallow((s) => ({
      subscriptionStatus: s.subscriptionStatus,
      currentPeriodEnd: s.currentPeriodEnd,
      planDisplayName: s.planDisplayName,
    })),
  );
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActiveSubscription =
    subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleManageBilling = async () => {
    setOpening(true);
    setError(null);
    const err = await openBillingPortal();
    if (err) setError(err);
    setOpening(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          Billing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your plan and subscription. Local and BYOK are free; managed cloud is metered usage.
        </p>
      </div>

      <dl className="rounded-lg border border-border bg-card/60 divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm text-muted-foreground">Plan</dt>
          <dd className="text-sm font-medium text-foreground">{planDisplayName ?? 'Free'}</dd>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <dt className="text-sm text-muted-foreground">Subscription</dt>
          <dd className="text-sm font-medium text-foreground">
            {hasActiveSubscription ? (subscriptionStatus ?? 'active') : 'None'}
          </dd>
        </div>
        {periodEndLabel && (
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-sm text-muted-foreground">Renews / ends</dt>
            <dd className="text-sm font-medium text-foreground">{periodEndLabel}</dd>
          </div>
        )}
      </dl>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <Button onClick={() => void handleManageBilling()} disabled={opening}>
        {opening ? 'Opening…' : 'Manage billing'}
      </Button>
    </div>
  );
}
