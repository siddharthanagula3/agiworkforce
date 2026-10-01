'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@agiworkforce/ui';
import {
  DAILY_TOP_UP_LIMIT_USD,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  TOP_UP_PRESET_AMOUNTS_USD,
  formatCredits,
  getBillingPlanPricing,
  getPlanCreditAllowance,
  getPlanPriceUsd,
  isBasicPlanTier,
  isFreeBillingPlanTier,
  isProPlanTier,
  quoteTopUp,
  type SelfServeIndividualPlanTier,
  type TopUpQuote,
} from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import { formatBillingMoney, formatRatio, formatUsdAmount } from '../lib/billing-format';
import { startTopUpCheckout } from '../services/stripe-payments';

type PackChoice = number | 'other';

interface BetterValuePlan {
  plan: SelfServeIndividualPlanTier;
  ratio: number;
}

function formatPrice(quote: TopUpQuote): string {
  return formatBillingMoney(quote.priceCents, 'usd', { trimWholeUnits: true });
}

function planCreditsPerDollar(plan: SelfServeIndividualPlanTier): number | null {
  const priceUsd = getPlanPriceUsd(plan, 'monthly');
  const allowance = getPlanCreditAllowance(plan);
  if (!priceUsd || priceUsd <= 0 || allowance.unlimited || allowance.monthly <= 0) return null;
  return allowance.monthly / priceUsd;
}

function betterValuePlan(tier: string, quote: TopUpQuote): BetterValuePlan | null {
  if (!isFreeBillingPlanTier(tier) && !isBasicPlanTier(tier) && !isProPlanTier(tier)) return null;
  const ladder: readonly string[] = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER;
  let best: { plan: SelfServeIndividualPlanTier; rate: number } | null = null;
  for (const plan of SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.slice(ladder.indexOf(tier) + 1)) {
    const rate = planCreditsPerDollar(plan);
    if (rate !== null && (!best || rate > best.rate)) best = { plan, rate };
  }
  if (!best || quote.priceCents <= 0) return null;
  const ratio = best.rate / (quote.credits / (quote.priceCents / 100));
  return ratio > 1 ? { plan: best.plan, ratio } : null;
}

function UpgradePrompt({ tier, quote }: { tier: string; quote: TopUpQuote | null }) {
  const offer = quote ? betterValuePlan(tier, quote) : null;
  if (!offer) return null;
  const label = getBillingPlanPricing(offer.plan).label;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-border px-3 py-2.5 text-[13px]">
      <span>
        {label} gives you {formatRatio(offer.ratio)}x more credits per dollar
        {isFreeBillingPlanTier(tier) ? ' than a credit pack.' : ' than this pack.'}
      </span>
      <Link
        href={isFreeBillingPlanTier(tier) ? '/pricing' : `/upgrade/${offer.plan}`}
        className="font-medium underline underline-offset-2"
      >
        {isFreeBillingPlanTier(tier) ? 'Compare plans' : `See ${label}`}
      </Link>
    </p>
  );
}

export function TopUpPanel({ tier, canBuy }: { tier: string; canBuy: boolean }) {
  const [choice, setChoice] = useState<PackChoice>(TOP_UP_PRESET_AMOUNTS_USD[0]);
  const [otherInput, setOtherInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseQuote = quoteTopUp(MIN_TOP_UP_AMOUNT_USD);
  const otherAmount = otherInput.trim() === '' ? null : Number(otherInput);
  const quote = choice === 'other' ? quoteTopUp(otherAmount) : quoteTopUp(choice);

  if (!canBuy) {
    return (
      <section aria-labelledby="top-up-title" className="flex flex-col gap-2">
        <h2 id="top-up-title" className="text-[13px] font-semibold text-[color:var(--text-2)]">
          Buy credits
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Credit packs are available on paid plans.
        </p>
        <UpgradePrompt tier={tier} quote={baseQuote} />
      </section>
    );
  }

  async function buy() {
    if (!quote || pending) return;
    setPending(true);
    setError(null);
    try {
      await startTopUpCheckout(quote.amountUsd);
    } catch (cause) {
      setError(toUserMessage(cause, 'Could not start checkout for these credits.'));
      setPending(false);
    }
  }

  return (
    <section id="top-up" aria-labelledby="top-up-title" className="flex flex-col gap-3">
      <div>
        <h2 id="top-up-title" className="text-[13px] font-semibold text-[color:var(--text-2)]">
          Buy credits
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Credits you buy are added to your balance and don&rsquo;t change your plan or renewal
          date. They don&rsquo;t expire, except where local law requires it, such as in Japan.
          Purchases are non-refundable except where our{' '}
          <Link href="/refund-policy" className="underline underline-offset-2">
            refund policy
          </Link>{' '}
          or the law says otherwise. Up to {formatUsdAmount(DAILY_TOP_UP_LIMIT_USD)} a day.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Credit pack</legend>
        {TOP_UP_PRESET_AMOUNTS_USD.map((amountUsd) => {
          const pack = quoteTopUp(amountUsd);
          if (!pack) return null;
          return (
            <label
              key={amountUsd}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-[var(--chat-accent-primary)]"
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="top-up-pack"
                  checked={choice === amountUsd}
                  onChange={() => setChoice(amountUsd)}
                  className="h-4 w-4 accent-[var(--chat-accent-primary)]"
                />
                <span className="font-medium">{formatCredits(pack.credits)}</span>
              </span>{' '}
              <span className="flex items-center gap-2 tabular-nums">
                {pack.discountPercent > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Save {pack.discountPercent}%
                  </span>
                ) : null}{' '}
                <span>{formatPrice(pack)}</span>
              </span>
            </label>
          );
        })}
        <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-[var(--chat-accent-primary)]">
          <label className="flex min-h-7 cursor-pointer items-center gap-2.5 pointer-coarse:min-h-11">
            <input
              type="radio"
              name="top-up-pack"
              checked={choice === 'other'}
              onChange={() => setChoice('other')}
              className="h-4 w-4 accent-[var(--chat-accent-primary)]"
            />
            <span className="font-medium">Other amount</span>
          </label>
          {choice === 'other' ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-6">
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground" aria-hidden="true">
                  $
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_TOP_UP_AMOUNT_USD}
                  max={MAX_TOP_UP_AMOUNT_USD}
                  step={1}
                  value={otherInput}
                  onChange={(event) => setOtherInput(event.target.value)}
                  aria-label="Amount in US dollars"
                  aria-describedby="top-up-other-hint"
                  className="h-9 w-28 rounded-md border border-border bg-background px-2 tabular-nums pointer-coarse:h-11"
                />
              </label>
              <span id="top-up-other-hint" aria-live="polite" className="text-[13px] tabular-nums">
                {quote ? (
                  <>
                    {formatCredits(quote.credits)} for {formatPrice(quote)}
                    {quote.discountPercent > 0 ? `, save ${quote.discountPercent}%` : ''}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Whole dollars from {formatUsdAmount(MIN_TOP_UP_AMOUNT_USD)} to{' '}
                    {formatUsdAmount(MAX_TOP_UP_AMOUNT_USD)}
                  </span>
                )}
              </span>
            </div>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] tabular-nums" aria-live="polite">
          {quote ? (
            <>
              <span className="font-medium">{formatPrice(quote)}</span>
              <span className="text-muted-foreground"> · Tax calculated at checkout</span>
            </>
          ) : (
            <span className="text-muted-foreground">Choose a pack or enter an amount</span>
          )}
        </p>
        <Button
          size="sm"
          className="pointer-coarse:h-11"
          onClick={() => void buy()}
          disabled={!quote || pending}
          isLoading={pending}
        >
          {quote ? `Buy ${formatCredits(quote.credits)}` : 'Buy credits'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-destructive-text">
          {error}
        </p>
      ) : null}

      <UpgradePrompt tier={tier} quote={quote ?? baseQuote} />
    </section>
  );
}
