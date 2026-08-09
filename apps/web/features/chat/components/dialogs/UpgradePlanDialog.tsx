'use client';

import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { isPlanSelectableOnSurface } from '@agiworkforce/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  formatCatalogPrice,
  getBillingPlanDisplay,
  type SelectablePaidPlan,
} from '@features/billing/lib/plan-display';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Paid tiers a user can purchase from this dialog (free is never a target). */
export type UpgradeTarget = SelectablePaidPlan;

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier?: string;
  /**
   * Called when the user picks a paid tier. Wires to the real Stripe checkout
   * flow on the parent. Managed cloud itself is public-alpha-open; this upgrade
   * only buys higher hosted capacity, it is not an access gate.
   */
  onUpgrade: (plan: UpgradeTarget, annual: boolean) => void;
}

// ---------------------------------------------------------------------------
// Plan definitions (sourced from BILLING_PLAN_PRICING canonical catalog)
// ---------------------------------------------------------------------------

type PlanCardId = 'free' | SelectablePaidPlan | 'team';

interface PlanCard {
  id: PlanCardId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  annualAvailable: boolean;
  /**
   * True when `monthlyPrice`/`yearlyPrice` are PER SEAT rather than per
   * account (`BillingPlanPricing.perSeat`). The catalog requires every
   * price-rendering surface to say "/seat"; a bare amount would read as the
   * whole organization's bill.
   */
  perSeat: boolean;
  tagline: string;
  features: string[];
  popular?: boolean;
}

const PLAN_TAGLINES: Record<PlanCardId, string> = {
  free: 'Core managed chat with a private, adaptive usage limit.',
  basic: 'The starting paid plan for light work across customer apps.',
  pro: 'Higher capacity plus managed developer surfaces.',
  max: 'High capacity for intensive multi-step work.',
  max_15x: 'The highest-capacity individual plan, including video generation.',
  team: 'Pro-level capacity for every seat, plus shared organization administration.',
};

const PLAN_CARD_IDS: readonly PlanCardId[] = ['free', 'basic', 'pro', 'max', 'max_15x', 'team'];

const PLAN_CARDS: PlanCard[] = PLAN_CARD_IDS.filter((id) =>
  isPlanSelectableOnSurface(id, 'web'),
).map((id) => {
  const display = getBillingPlanDisplay(id);
  return {
    id,
    name: display.pricing.label,
    monthlyPrice: display.pricing.monthlyPriceUsd,
    yearlyPrice: display.pricing.yearlyPriceUsd,
    annualAvailable: display.annualAvailable,
    perSeat: display.pricing.perSeat === true,
    tagline: PLAN_TAGLINES[id],
    features: display.features,
    popular: id === 'pro',
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(usd: number): string {
  if (usd === 0) return 'Free';
  return formatCatalogPrice(usd);
}

function annualPerMonth(yearlyUsd: number): string {
  return formatCatalogPrice(yearlyUsd / 12);
}

function annualSavingsPct(monthly: number, yearly: number): number {
  if (monthly <= 0) return 0;
  return Math.round((1 - yearly / 12 / monthly) * 100);
}

function isTierUpgrade(current: string, target: PlanCardId): boolean {
  if (target === 'team') return ['free', 'basic', 'pro'].includes(current);
  const order: PlanCardId[] = ['free', 'basic', 'pro', 'max', 'max_15x'];
  return order.indexOf(target) > order.indexOf(current as PlanCardId);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}

interface PlanCardProps {
  plan: PlanCard;
  annual: boolean;
  isCurrent: boolean;
  isUpgrade: boolean;
  onUpgrade: (plan: UpgradeTarget, annual: boolean) => void;
}

function PlanCardView({ plan, annual, isCurrent, isUpgrade, onUpgrade }: PlanCardProps) {
  const usesAnnual = annual && plan.annualAvailable;
  // Team is a published per-seat price ($25/seat/mo, $240/seat/yr), not a
  // negotiated one — rendering "Custom" here contradicted both the catalog and
  // the pricing page, which sells it self-serve.
  const displayPrice =
    usesAnnual && plan.monthlyPrice > 0
      ? annualPerMonth(plan.yearlyPrice)
      : formatPrice(plan.monthlyPrice);
  const savingsPct = annualSavingsPct(plan.monthlyPrice, plan.yearlyPrice);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border p-5 transition-shadow',
        plan.popular
          ? 'border-primary/50 bg-primary/[0.04] shadow-sm'
          : 'border-border/60 bg-background',
        isCurrent && 'opacity-75',
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
          Popular
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">{displayPrice}</span>
          {plan.monthlyPrice > 0 && (
            <span className="text-xs text-muted-foreground">
              {plan.perSeat ? 'USD / seat / month' : 'USD / month'}
            </span>
          )}
        </div>
        {usesAnnual && savingsPct > 0 && (
          <span className="mt-0.5 inline-block text-[11px] font-medium text-primary">
            save {String(savingsPct)}% annually
          </span>
        )}
        {annual && plan.monthlyPrice > 0 && !plan.annualAvailable ? (
          <span className="mt-0.5 inline-block text-[11px] text-muted-foreground">
            Monthly only
          </span>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.tagline}</p>
      </div>

      <ul className="mb-5 space-y-2">
        {plan.features.map((f) => (
          <FeatureRow key={f} label={f} />
        ))}
      </ul>

      <div className="mt-auto">
        {plan.perSeat ? (
          // Per-seat checkout needs a seat quantity, and this dialog has no
          // seat control — `onUpgrade` would send a one-seat organization.
          // Hand off to the pricing page's Team card, which owns the seat
          // input and the real checkout call, instead of a sales dead end.
          <a
            className="flex h-9 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            href="/pricing#pricing-team-title"
          >
            Choose seats
          </a>
        ) : isCurrent ? (
          <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
            Your current plan
          </Button>
        ) : isUpgrade ? (
          <Button
            className="h-9 w-full rounded-xl text-sm"
            onClick={() => onUpgrade(plan.id as UpgradeTarget, usesAnnual)}
          >
            Upgrade to {plan.name}
          </Button>
        ) : (
          <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
            Included
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UpgradePlanDialog({
  open,
  onOpenChange,
  currentTier = 'free',
  onUpgrade,
}: UpgradePlanDialogProps) {
  const [annual, setAnnual] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        // Reset state after close
        window.setTimeout(() => {
          setExpanded(false);
          setAnnual(false);
        }, 200);
      }
    },
    [onOpenChange],
  );

  // Default view: show the current plan card + the next recommended tier.
  // Expanded: show all tiers.
  const tierOrder: PlanCardId[] = ['free', 'basic', 'pro', 'max', 'max_15x', 'team'];
  const currentIdx = tierOrder.indexOf(currentTier as PlanCardId);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;

  const compactPlans: PlanCard[] = expanded
    ? PLAN_CARDS
    : [
        PLAN_CARDS[safeIdx] ?? PLAN_CARDS[0]!,
        // Recommend next tier, or the last one if already at max
        PLAN_CARDS[Math.min(safeIdx + 1, PLAN_CARDS.length - 1)]!,
      ].filter((p, idx, arr): p is PlanCard => p !== undefined && arr.indexOf(p) === idx);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          // Cap the height so the expanded multi-tier view never grows past the
          // viewport (which pushed the title off-screen); scroll inside instead.
          'max-h-[90vh] overflow-hidden border-border/70 bg-background p-0 sm:rounded-2xl',
          expanded ? 'w-[min(98vw,56rem)]' : 'w-[min(94vw,38rem)]',
        )}
        closeLabel="Close upgrade plan dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>
            Compare AGI plans and upgrade for higher managed-cloud capacity.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[90vh] overflow-y-auto p-6 pb-4">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Upgrade your plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Managed cloud is open in public alpha; sign in and start now. Upgrade for higher
                hosted capacity. Local and BYOK stay free on Desktop and CLI.
              </p>
            </div>
            {/* Billing toggle (only meaningful for paid plans) */}
            <div className="ml-4 flex shrink-0 items-center rounded-full border border-border/60 bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                className={cn(
                  'rounded-full px-3 py-1 transition-colors',
                  !annual
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                className={cn(
                  'rounded-full px-3 py-1 transition-colors',
                  annual
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Annual
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div
            className={cn(
              'grid gap-4',
              expanded
                ? 'grid-cols-1 sm:grid-cols-3'
                : compactPlans.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 sm:grid-cols-2',
            )}
          >
            {compactPlans.map((plan) => (
              <PlanCardView
                key={plan.id}
                plan={plan}
                annual={annual}
                isCurrent={plan.id === (currentTier as PlanCardId)}
                isUpgrade={isTierUpgrade(currentTier, plan.id)}
                onUpgrade={onUpgrade}
              />
            ))}
          </div>

          {/* See all plans / collapse toggle */}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {expanded ? 'Show fewer plans' : 'See all plans'}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <div className="border-t border-border/60 px-6 py-4">
          <p className="text-center text-[11px] text-muted-foreground">
            Managed cloud is in public alpha and open by default. Paid tiers add higher hosted
            capacity. Local and BYOK always remain free on Desktop and CLI.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
