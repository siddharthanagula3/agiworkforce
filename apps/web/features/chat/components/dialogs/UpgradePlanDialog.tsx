'use client';

import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Paid tiers a user can purchase from this dialog (free is never a target). */
type UpgradeTarget = 'pro' | 'max';

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

type PlanCardId = 'free' | 'pro' | 'max';

interface PlanCard {
  id: PlanCardId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  {
    id: 'free',
    name: BILLING_PLAN_PRICING.free.label,
    monthlyPrice: BILLING_PLAN_PRICING.free.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.free.yearlyPriceUsd,
    tagline: 'Core chat capabilities with a private, adaptive usage limit.',
    features: [
      'Auto Economy model routing',
      'Web search, code execution, files, skills, and voice',
      'Up to 5 Projects and 1 custom remote MCP',
      'Chat on Web, Mobile, and Desktop',
      'No credit card required',
    ],
  },
  {
    id: 'pro',
    name: BILLING_PLAN_PRICING.pro.label,
    monthlyPrice: BILLING_PLAN_PRICING.pro.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.pro.yearlyPriceUsd,
    tagline: 'Higher capacity and advanced routing for professionals.',
    popular: true,
    features: [
      'Everything in Free',
      'Higher hosted capacity',
      'Unlimited Projects',
      'Cowork and developer agent features',
      'Chrome and IDE extensions',
      'Advanced model routing controls',
      'Conversation branching',
    ],
  },
  {
    id: 'max',
    name: BILLING_PLAN_PRICING.max.label,
    monthlyPrice: BILLING_PLAN_PRICING.max.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.max.monthlyPriceUsd, // monthly-only
    tagline: 'Highest capacity for intensive multi-agent workloads.',
    features: [
      'Everything in Pro',
      'Highest hosted capacity',
      'Multi-agent orchestration',
      'Extended context windows',
      'Custom system prompts per project',
      'Priority support',
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(usd: number): string {
  if (usd === 0) return 'Free';
  return `$${usd.toFixed(2)}`;
}

function annualPerMonth(yearlyUsd: number): string {
  return `$${(yearlyUsd / 12).toFixed(2)}`;
}

function annualSavingsPct(monthly: number, yearly: number): number {
  if (monthly <= 0) return 0;
  return Math.round((1 - yearly / 12 / monthly) * 100);
}

function isTierUpgrade(current: string, target: PlanCardId): boolean {
  const order: PlanCardId[] = ['free', 'pro', 'max'];
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
  const displayPrice =
    annual && plan.monthlyPrice > 0
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
            <span className="text-xs text-muted-foreground">USD / month</span>
          )}
        </div>
        {annual && savingsPct > 0 && (
          <span className="mt-0.5 inline-block text-[11px] font-medium text-primary">
            save {String(savingsPct)}% annually
          </span>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.tagline}</p>
      </div>

      <ul className="mb-5 space-y-2">
        {plan.features.map((f) => (
          <FeatureRow key={f} label={f} />
        ))}
      </ul>

      <div className="mt-auto">
        {isCurrent ? (
          <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
            Your current plan
          </Button>
        ) : isUpgrade ? (
          <Button
            className="h-9 w-full rounded-xl text-sm"
            onClick={() => onUpgrade(plan.id as UpgradeTarget, annual)}
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
  const tierOrder: PlanCardId[] = ['free', 'pro', 'max'];
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
