import { Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PLAN_LABEL,
  PLAN_DESCRIPTION,
  getPublishedPlanPriceUsd,
  isFreePlan,
  type UIPlanTier,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Per-tier static content
// ---------------------------------------------------------------------------

interface TierContent {
  price: string;
  priceNote?: string;
  bullets: string[];
  ctaLabel: string;
  ctaVariant: 'primary' | 'current';
}

// Partial: only the tiers actually shown as desktop plan cards need static
// content here. Enterprise and Team stay sales/admin-led.
const TIER_CONTENT: Partial<Record<UIPlanTier, TierContent>> = {
  local: {
    price: 'Free forever',
    bullets: [
      'Ollama, LM Studio, and llama.cpp local models',
      'Fully offline — zero data leaves your device',
      'No account required',
      'Unlimited local conversations',
    ],
    ctaLabel: 'Current plan',
    ctaVariant: 'current',
  },
  free: {
    price: '$0 / mo',
    bullets: [
      'Managed Cloud starter usage',
      'Cross-device chat sync',
      'One Cloud project',
      'Upgrade only when you need more capacity',
    ],
    ctaLabel: 'Included',
    ctaVariant: 'current',
  },
  byok: {
    price: 'Free forever',
    bullets: [
      'Bring your own API keys',
      '10+ provider support (GPT, Claude, Gemini…)',
      'Explicit managed-cloud handoff when enabled',
      'No monthly fees',
    ],
    ctaLabel: 'Current plan',
    ctaVariant: 'current',
  },
  // Basic ($7/mo, ₹399) is cross-surface (PLAN_SURFACE_VISIBILITY.basic =
  // ['web','desktop','mobile']) — it renders in the desktop plan list.
  basic: {
    price: `$${getPublishedPlanPriceUsd('basic', 'monthly')} / mo`,
    bullets: [
      'Managed cloud entry tier',
      'Speed-optimized managed models',
      'Cross-device sync (desktop + mobile + web)',
      'Priority bug reports',
    ],
    ctaLabel: 'Upgrade to Basic',
    ctaVariant: 'primary',
  },
  pro: {
    price: `$${getPublishedPlanPriceUsd('pro', 'monthly')} / mo`,
    priceNote: `$${getPublishedPlanPriceUsd('pro', 'yearly')} / yr on annual billing`,
    bullets: [
      'Higher token quota',
      'AGI Work and developer surfaces',
      'Image generation',
      'Advanced agent features',
    ],
    ctaLabel: 'Upgrade to Pro',
    ctaVariant: 'primary',
  },
  max: {
    price: `$${getPublishedPlanPriceUsd('max', 'monthly')} / mo`,
    bullets: [
      '5x managed usage capacity',
      'Every flagship model included',
      'Advanced agents and research',
      'Priority support',
    ],
    ctaLabel: 'Upgrade to Max',
    ctaVariant: 'primary',
  },
  max_15x: {
    price: `$${getPublishedPlanPriceUsd('max_15x', 'monthly')} / mo`,
    bullets: [
      '15x managed usage capacity',
      'Highest individual usage limits',
      'Every flagship model included',
      'Video generation access',
    ],
    ctaLabel: 'Upgrade to Max 15x',
    ctaVariant: 'primary',
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlanCardProps {
  tier: UIPlanTier;
  /** Whether this is the user's currently active plan. */
  isCurrentPlan: boolean;
  /** A paid tier below the active tier is changed through Stripe Billing. */
  isLowerPaidTier?: boolean;
  /** Called when the user clicks the CTA. */
  onCtaClick: (tier: UIPlanTier) => void;
}

// ---------------------------------------------------------------------------
// PlanCard
// ---------------------------------------------------------------------------

export function PlanCard({
  tier,
  isCurrentPlan,
  isLowerPaidTier = false,
  onCtaClick,
}: PlanCardProps) {
  const content = TIER_CONTENT[tier];
  // Tiers without desktop card content are filtered out of VISIBLE_TIERS upstream; guard
  // anyway so an unexpected tier renders nothing instead of crashing on content.price.
  if (!content) return null;
  const label = PLAN_LABEL[tier];
  const description = PLAN_DESCRIPTION[tier];
  const isFree = isFreePlan(tier);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-5 gap-4',
        'transition-shadow duration-150',
        isCurrentPlan
          ? 'border-blue-500/50 bg-blue-500/5 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]'
          : 'border-border bg-card hover:border-border/80 hover:shadow-sm',
      )}
    >
      {/* Badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCurrentPlan && (
            <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
              Current plan
            </span>
          )}
          {isFree && (
            <span className="inline-flex items-center rounded-full bg-green-500/12 px-2 py-0.5 text-[10px] font-semibold text-green-400">
              Always free
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div>
        <p className="text-xl font-bold text-foreground tabular-nums">{content.price}</p>
        {content.priceNote && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{content.priceNote}</p>
        )}
      </div>

      {/* Feature bullets */}
      <ul className="flex-1 space-y-1.5">
        {content.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check size={12} className="mt-0.5 shrink-0 text-green-500" aria-hidden="true" />
            {bullet}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <PlanCardCta
        tier={tier}
        variant={isCurrentPlan ? 'current' : content.ctaVariant}
        label={
          isCurrentPlan
            ? 'Current plan'
            : isLowerPaidTier
              ? 'Manage plan'
              : isFree
                ? 'Included'
                : content.ctaLabel
        }
        isLowerPaidTier={isLowerPaidTier}
        onCtaClick={onCtaClick}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA button sub-component
// ---------------------------------------------------------------------------

interface PlanCardCtaProps {
  tier: UIPlanTier;
  variant: TierContent['ctaVariant'];
  label: string;
  isLowerPaidTier: boolean;
  onCtaClick: (tier: UIPlanTier) => void;
}

function PlanCardCta({ tier, variant, label, isLowerPaidTier, onCtaClick }: PlanCardCtaProps) {
  const base =
    'flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (variant === 'current') {
    return (
      <button disabled className={cn(base, 'cursor-default bg-muted text-muted-foreground')}>
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onCtaClick(tier)}
      className={cn(
        base,
        isLowerPaidTier
          ? 'border border-border bg-card text-foreground hover:bg-muted'
          : 'bg-blue-600 text-white hover:bg-blue-700',
      )}
    >
      {!isLowerPaidTier ? <Zap size={12} aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
