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
} from '@shared/ui/dialog';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';
import { FREE_TRIAL_PROMPT_LIMIT } from '@/lib/free-trial-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier?: string;
  /** Called to open the waitlist flow (the existing CloudUpgradeWaitlistDialog). */
  onOpenWaitlist: () => void;
}

// ---------------------------------------------------------------------------
// Plan definitions (sourced from BILLING_PLAN_PRICING canonical catalog)
// ---------------------------------------------------------------------------

type PlanCardId = 'free' | 'hobby' | 'pro' | 'max';

interface PlanCard {
  id: PlanCardId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  features: string[];
  popular?: boolean;
  /** Tiers that use the waitlist CTA rather than a checkout. */
  waitlist: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  {
    id: 'free',
    name: BILLING_PLAN_PRICING.free.label,
    monthlyPrice: BILLING_PLAN_PRICING.free.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.free.yearlyPriceUsd,
    tagline: `${FREE_TRIAL_PROMPT_LIMIT} free prompts to try AGI in your browser.`,
    waitlist: false,
    features: [
      'Auto Economy model routing',
      `${FREE_TRIAL_PROMPT_LIMIT} hosted prompts (free cap)`,
      'Web chat surface',
      'No credit card required',
    ],
  },
  {
    id: 'hobby',
    name: BILLING_PLAN_PRICING.hobby.label,
    monthlyPrice: BILLING_PLAN_PRICING.hobby.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.hobby.yearlyPriceUsd,
    tagline: 'Hosted compute for everyday use, web search, and file uploads.',
    popular: true,
    waitlist: true,
    features: [
      'Everything in Free',
      'Higher hosted prompt cap',
      'Web search (lower token cap)',
      'File uploads and analysis',
      '10+ provider routing',
      'Priority queue on Auto Economy',
    ],
  },
  {
    id: 'pro',
    name: BILLING_PLAN_PRICING.pro.label,
    monthlyPrice: BILLING_PLAN_PRICING.pro.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.pro.yearlyPriceUsd,
    tagline: 'Higher capacity and advanced routing for professionals.',
    waitlist: true,
    features: [
      'Everything in Hobby',
      'Larger hosted capacity per month',
      'Full web search token cap',
      'Computer-use tasks',
      'Advanced model routing controls',
      'Conversation branching',
    ],
  },
  {
    id: 'max',
    name: BILLING_PLAN_PRICING.max.label,
    monthlyPrice: BILLING_PLAN_PRICING.max.monthlyPriceUsd,
    yearlyPrice: BILLING_PLAN_PRICING.max.yearlyPriceUsd,
    tagline: 'Highest capacity for intensive multi-agent workloads.',
    waitlist: true,
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
  const order: PlanCardId[] = ['free', 'hobby', 'pro', 'max'];
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
  onJoinWaitlist: () => void;
}

function PlanCardView({ plan, annual, isCurrent, onJoinWaitlist }: PlanCardProps) {
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
        ) : plan.waitlist ? (
          <Button className="h-9 w-full rounded-xl text-sm" onClick={onJoinWaitlist}>
            Join waitlist
          </Button>
        ) : (
          <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
            Current plan
          </Button>
        )}
        {plan.waitlist && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Cloud plans are invite-only while metering and fraud controls are being proven.
          </p>
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
  onOpenWaitlist,
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

  const handleJoinWaitlist = useCallback(() => {
    onOpenChange(false);
    // Small delay so the close animation finishes before the next modal opens
    window.setTimeout(() => {
      onOpenWaitlist();
    }, 150);
  }, [onOpenChange, onOpenWaitlist]);

  // Default view: show the current plan card + the next recommended tier.
  // Expanded: show all 4 tiers.
  const tierOrder: PlanCardId[] = ['free', 'hobby', 'pro', 'max'];
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
          'overflow-hidden border-border/70 bg-background p-0 sm:rounded-2xl',
          expanded ? 'w-[min(98vw,56rem)]' : 'w-[min(94vw,38rem)]',
        )}
        closeButtonLabel="Close upgrade plan dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>
            Compare AGI plans and join the waitlist for hosted cloud access.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pb-4">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Upgrade your plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Local and BYOK are always free. Cloud plans open by waitlist invite.
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
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
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
                isCurrent={
                  plan.id === (currentTier as PlanCardId) ||
                  (!isTierUpgrade(currentTier, plan.id) && currentTier === plan.id)
                }
                onJoinWaitlist={handleJoinWaitlist}
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
            Hosted compute is account-gated while usage metering, refunds, and provider terms are
            proven. Local and BYOK always remain free on Desktop and CLI.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
