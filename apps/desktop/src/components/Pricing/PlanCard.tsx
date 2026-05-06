import { Check, Clock, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PLAN_LABEL, PLAN_DESCRIPTION, isFreePlan, type UIPlanTier } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Per-tier static content
// ---------------------------------------------------------------------------

interface TierContent {
  price: string;
  priceNote?: string;
  bullets: string[];
  ctaLabel: string;
  ctaVariant: 'primary' | 'outline' | 'waitlist' | 'stripe' | 'current';
}

const TIER_CONTENT: Record<UIPlanTier, TierContent> = {
  local: {
    price: 'Free forever',
    bullets: [
      'Ollama + LMStudio local models',
      'Fully offline — zero data leaves your device',
      'No account required',
      'Unlimited local conversations',
    ],
    ctaLabel: 'Current plan',
    ctaVariant: 'current',
  },
  byok: {
    price: 'Free forever',
    bullets: [
      'Bring your own API keys',
      '10+ provider support (GPT, Claude, Gemini…)',
      'Optional Supabase cloud sync',
      'No monthly fees',
    ],
    ctaLabel: 'Current plan',
    ctaVariant: 'current',
  },
  hobby: {
    price: '$5 / mo',
    priceNote: 'target — final price TBD',
    bullets: [
      '50k managed cloud tokens / month',
      'Access to flagship models',
      'Cross-device sync (desktop + mobile + web)',
      'Priority bug reports',
    ],
    ctaLabel: 'Upgrade to Hobby',
    ctaVariant: 'primary',
  },
  pro: {
    price: 'Coming soon',
    bullets: [
      'Higher token quota',
      'Advanced agent features',
      'Priority support',
      'Early access to new providers',
    ],
    ctaLabel: 'Join waitlist',
    ctaVariant: 'waitlist',
  },
  max: {
    price: 'Coming soon',
    bullets: [
      'Unlimited managed tokens',
      'All Pro features',
      'Enterprise-grade audit logging',
      'Dedicated Slack channel',
    ],
    ctaLabel: 'Join waitlist',
    ctaVariant: 'waitlist',
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlanCardProps {
  tier: UIPlanTier;
  /** Whether this is the user's currently active plan. */
  isCurrentPlan: boolean;
  /** Called when the user clicks the CTA. */
  onCtaClick: (tier: UIPlanTier) => void;
}

// ---------------------------------------------------------------------------
// PlanCard
// ---------------------------------------------------------------------------

export function PlanCard({ tier, isCurrentPlan, onCtaClick }: PlanCardProps) {
  const content = TIER_CONTENT[tier];
  const label = PLAN_LABEL[tier];
  const description = PLAN_DESCRIPTION[tier];
  const isFree = isFreePlan(tier);
  const isComingSoon = tier === 'pro' || tier === 'max';

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
          {isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/12 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
              <Clock size={9} />
              Coming soon
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
        label={isCurrentPlan ? 'Current plan' : content.ctaLabel}
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
  onCtaClick: (tier: UIPlanTier) => void;
}

function PlanCardCta({ tier, variant, label, onCtaClick }: PlanCardCtaProps) {
  const base =
    'flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (variant === 'current') {
    return (
      <button disabled className={cn(base, 'cursor-default bg-muted text-muted-foreground')}>
        {label}
      </button>
    );
  }

  if (variant === 'waitlist') {
    return (
      <button
        type="button"
        onClick={() => onCtaClick(tier)}
        className={cn(
          base,
          'border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        {label}
      </button>
    );
  }

  if (variant === 'stripe') {
    return (
      <button
        type="button"
        onClick={() => onCtaClick(tier)}
        className={cn(base, 'border border-border bg-background text-foreground hover:bg-accent')}
      >
        Manage in Stripe portal
      </button>
    );
  }

  // primary (Upgrade to Hobby)
  return (
    <button
      type="button"
      onClick={() => onCtaClick(tier)}
      className={cn(base, 'bg-blue-600 text-white hover:bg-blue-700')}
    >
      <Zap size={12} aria-hidden="true" />
      {label}
    </button>
  );
}
