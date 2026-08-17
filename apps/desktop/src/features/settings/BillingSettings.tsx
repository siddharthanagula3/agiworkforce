import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { Button } from '@/ui/Button';
import { selectHasCloudAccountSession, useAuthStore } from '../../stores/auth';
import { openBillingPortal, openTopUpCheckout } from '../../lib/stripeCheckout';
import { getDesktopSubscriptionOwnerPolicy } from '../../lib/subscriptionOwnership';
import { isElectronHost } from '../../lib/runtimeEnvironment';

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  unpaid: 'Unpaid',
  none: 'None',
};

export function BillingSettings() {
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);
  const {
    subscriptionStatus,
    subscriptionFetchStatus,
    currentPeriodEnd,
    planDisplayName,
    cancellationScheduled,
    subscriptionSource,
  } = useAuthStore(
    useShallow((s) => ({
      subscriptionStatus: s.subscriptionStatus,
      subscriptionFetchStatus: s.subscriptionFetchStatus,
      currentPeriodEnd: s.currentPeriodEnd,
      planDisplayName: s.planDisplayName,
      cancellationScheduled: s.subscriptionCancelAtPeriodEnd,
      subscriptionSource: s.subscriptionSource,
    })),
  );
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUpAmountUsd, setTopUpAmountUsd] = useState<number>(MIN_TOP_UP_AMOUNT_USD);
  const [topUpOpening, setTopUpOpening] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const ownerPolicy = getDesktopSubscriptionOwnerPolicy(
    subscriptionSource,
    subscriptionStatus,
    subscriptionFetchStatus === 'succeeded',
  );
  const hasSubscription = subscriptionStatus !== 'none';
  const subscriptionLabel =
    SUBSCRIPTION_STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus.replaceAll('_', ' ');

  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleManageBilling = async () => {
    if (!ownerPolicy.canOpenStripePortal) return;
    setOpening(true);
    setError(null);
    const err = await openBillingPortal();
    if (err) setError(err);
    setOpening(false);
  };

  const canBuyTopUps =
    subscriptionSource === 'stripe' &&
    (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');
  const selectedTopUpUnits = topUpUnitsForUsd(topUpAmountUsd);

  const handleBuyTopUp = async () => {
    if (topUpOpening || selectedTopUpUnits === null) return;
    setTopUpOpening(true);
    setTopUpError(null);
    const err = await openTopUpCheckout(topUpAmountUsd);
    if (err) setTopUpError(err);
    setTopUpOpening(false);
  };

  const openPlans = () => {
    window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          Billing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isElectronHost
            ? 'Your AGI Cloud plan, subscription, and metered usage.'
            : 'Your plan and subscription. Local and BYOK are free; managed cloud is metered usage.'}
        </p>
      </div>

      {/* Billing lives on the Cloud account. With no Cloud session there is no
          plan and no Stripe customer, so do not render a plan the user cannot act on. */}
      {!hasCloudAccountSession && (
        <p className="text-sm text-muted-foreground">
          Connect this Desktop to AGI Cloud to see your plan and manage your subscription.
        </p>
      )}

      {hasCloudAccountSession && (
        <>
          <dl className="rounded-lg border border-border bg-card/60 divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-muted-foreground">Plan</dt>
              <dd className="text-sm font-medium text-foreground">{planDisplayName ?? 'Free'}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-muted-foreground">Subscription</dt>
              <dd className="text-sm font-medium text-foreground">
                {hasSubscription
                  ? cancellationScheduled
                    ? `${subscriptionLabel} · cancellation scheduled`
                    : subscriptionLabel
                  : 'None'}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-muted-foreground">Billing owner</dt>
              <dd className="text-sm font-medium text-foreground">{ownerPolicy.sourceLabel}</dd>
            </div>
            {periodEndLabel && (
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-sm text-muted-foreground">
                  {cancellationScheduled
                    ? 'Access ends'
                    : subscriptionStatus === 'canceled'
                      ? 'Ended'
                      : 'Renews'}
                </dt>
                <dd className="text-sm font-medium text-foreground">{periodEndLabel}</dd>
              </div>
            )}
          </dl>

          <p className="text-sm text-muted-foreground">{ownerPolicy.description}</p>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {ownerPolicy.canOpenStripePortal ? (
            <Button onClick={() => void handleManageBilling()} disabled={opening}>
              {opening ? 'Opening…' : 'Manage billing'}
            </Button>
          ) : ownerPolicy.canStartStripePlanChange ? (
            <Button onClick={openPlans}>Compare plans</Button>
          ) : null}

          {canBuyTopUps && (
            <section className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Usage top-up</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {TOP_UP_UNITS_PER_USD} units for every $1. Minimum ${MIN_TOP_UP_AMOUNT_USD},
                  self-serve maximum ${MAX_TOP_UP_AMOUNT_USD}. A top-up adds managed-usage balance
                  and does not change your plan or renewal date.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {TOP_UP_PRESET_AMOUNTS_USD.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    aria-pressed={topUpAmountUsd === amount}
                    onClick={() => setTopUpAmountUsd(amount)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      topUpAmountUsd === amount
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Custom amount ($)
                <input
                  aria-label="Custom top-up amount in dollars"
                  type="number"
                  min={MIN_TOP_UP_AMOUNT_USD}
                  max={MAX_TOP_UP_AMOUNT_USD}
                  step={1}
                  value={topUpAmountUsd}
                  onChange={(e) => setTopUpAmountUsd(Number(e.target.value))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                />
              </label>

              {topUpError && <p className="text-sm text-rose-400">{topUpError}</p>}

              <Button
                onClick={() => void handleBuyTopUp()}
                disabled={topUpOpening || selectedTopUpUnits === null}
              >
                {topUpOpening
                  ? 'Opening checkout…'
                  : selectedTopUpUnits === null
                    ? `Enter $${MIN_TOP_UP_AMOUNT_USD}–$${MAX_TOP_UP_AMOUNT_USD} in whole dollars`
                    : `Buy ${selectedTopUpUnits.toLocaleString('en-US')} units · $${topUpAmountUsd}`}
              </Button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
