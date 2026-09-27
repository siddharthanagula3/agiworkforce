import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  CENTS_PER_USD,
  DAILY_TOP_UP_LIMIT_USD,
  MANAGED_USAGE_LIMITS,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  PLAN_LABEL,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  formatCredits,
  getNextUpgradeTier,
  getPlanPriceUsd,
  isBasicPlanTier,
  isFreeBillingPlanTier,
  isProPlanTier,
  normalizeBillingPlanTier,
  quoteTopUp,
} from '@agiworkforce/types';
import { Button } from '@/ui/Button';
import { WEB_APP_URL } from '../../api/config';
import { cn } from '../../lib/utils';
import { openTopUpCheckout } from '../../lib/stripeCheckout';
import { selectPlan, useAuthStore } from '../../stores/auth';
import { openExternalUrl } from '../../utils/navigation';

type TopUpSelection = { kind: 'pack'; amountUsd: number } | { kind: 'other' };

function formatTopUpPrice(priceCents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: priceCents % CENTS_PER_USD === 0 ? 0 : 2,
  }).format(priceCents / CENTS_PER_USD);
}

function upgradeCreditsPerDollarPrompt(plan: string | null | undefined): string | null {
  const current = normalizeBillingPlanTier(plan);
  if (!isFreeBillingPlanTier(current) && !isBasicPlanTier(current) && !isProPlanTier(current)) {
    return null;
  }
  const next = getNextUpgradeTier(current);
  const price = next ? getPlanPriceUsd(next, 'monthly') : null;
  if (!next || !price) return null;
  const ratio = MANAGED_USAGE_LIMITS[next].monthlyCredits / price / TOP_UP_UNITS_PER_USD;
  if (!Number.isFinite(ratio) || ratio <= 1) return null;
  return `${PLAN_LABEL[next]} gives you ${ratio.toLocaleString(undefined, { maximumFractionDigits: 1 })}x more credits per dollar.`;
}

export function CreditTopUp({ onComparePlans }: { onComparePlans?: () => void }) {
  const { subscriptionSource, subscriptionStatus, plan } = useAuthStore(
    useShallow((s) => ({
      subscriptionSource: s.subscriptionSource,
      subscriptionStatus: s.subscriptionStatus,
      plan: selectPlan(s),
    })),
  );
  const [selection, setSelection] = useState<TopUpSelection>({
    kind: 'pack',
    amountUsd: TOP_UP_PRESET_AMOUNTS_USD[0],
  });
  const [otherAmount, setOtherAmount] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible =
    subscriptionSource === 'stripe' &&
    (subscriptionStatus === 'active' || subscriptionStatus === 'trialing');
  if (!eligible) return null;

  const quote = quoteTopUp(selection.kind === 'pack' ? selection.amountUsd : Number(otherAmount));
  const upgradePrompt = upgradeCreditsPerDollarPrompt(plan);

  const buy = async () => {
    if (opening || !quote) return;
    setOpening(true);
    setError(null);
    const failure = await openTopUpCheckout(quote.amountUsd);
    if (failure) setError(failure);
    setOpening(false);
  };

  return (
    <section
      aria-labelledby="credit-top-up-heading"
      className="space-y-4 rounded-lg border border-border bg-card/60 p-4"
    >
      <div>
        <h3 id="credit-top-up-heading" className="text-sm font-semibold text-foreground">
          Buy credits
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Credits you buy are added to your balance and don&rsquo;t change your plan or renewal
          date. They don&rsquo;t expire, except where local law requires it, such as in Japan.
          Purchases are non-refundable except where our{' '}
          <button
            type="button"
            onClick={() => void openExternalUrl(`${WEB_APP_URL}/refund-policy`)}
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            refund policy
          </button>{' '}
          or the law says otherwise. Up to{' '}
          {formatTopUpPrice(DAILY_TOP_UP_LIMIT_USD * CENTS_PER_USD)} a day.
        </p>
      </div>

      {upgradePrompt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm text-foreground">{upgradePrompt}</p>
          {onComparePlans ? (
            <Button variant="outline" size="sm" onClick={onComparePlans}>
              Compare plans
            </Button>
          ) : null}
        </div>
      ) : null}

      <div role="group" aria-label="Credit packs" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => {
          const pack = quoteTopUp(amountUsd);
          if (!pack) return null;
          const selected = selection.kind === 'pack' && selection.amountUsd === amountUsd;
          return (
            <button
              key={amountUsd}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelection({ kind: 'pack', amountUsd })}
              className={cn(
                'flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
              )}
            >
              <span className="text-sm font-medium tabular-nums text-foreground">
                {formatCredits(pack.credits)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTopUpPrice(pack.priceCents)}
                {pack.discountPercent > 0 ? ` · ${pack.discountPercent}% off` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Other amount in whole dollars
        <input
          type="number"
          inputMode="numeric"
          min={MIN_TOP_UP_AMOUNT_USD}
          max={MAX_TOP_UP_AMOUNT_USD}
          step={1}
          value={otherAmount}
          placeholder={`${MIN_TOP_UP_AMOUNT_USD.toLocaleString()} to ${MAX_TOP_UP_AMOUNT_USD.toLocaleString()}`}
          onFocus={() => setSelection({ kind: 'other' })}
          onChange={(event) => {
            setOtherAmount(event.target.value);
            setSelection({ kind: 'other' });
          }}
          className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
      </label>

      <p className="text-xs text-muted-foreground">Tax calculated at checkout.</p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button onClick={() => void buy()} disabled={opening || !quote}>
        {opening
          ? 'Opening checkout…'
          : quote
            ? `Buy ${formatCredits(quote.credits)} for ${formatTopUpPrice(quote.priceCents)}`
            : `Enter a whole-dollar amount from ${formatTopUpPrice(MIN_TOP_UP_AMOUNT_USD * CENTS_PER_USD)} to ${formatTopUpPrice(MAX_TOP_UP_AMOUNT_USD * CENTS_PER_USD)}`}
      </Button>
    </section>
  );
}
