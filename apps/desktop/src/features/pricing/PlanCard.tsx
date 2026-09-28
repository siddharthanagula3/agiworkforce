import { Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PLAN_LABEL,
  PLAN_DESCRIPTION,
  formatUsdAmount,
  getPublishedMonthlyPriceUsd,
  getPublishedPlanPricePerMonthUsd,
  isFreePlan,
  managedUsageComparisonLines,
  type UIPlanTier,
} from '@agiworkforce/types';

interface TierContent {
  price: string;
  priceNote?: string;
  bullets: string[];
  ctaLabel: string;
  ctaVariant: 'primary' | 'current';
}

const TIER_CONTENT: Partial<Record<UIPlanTier, TierContent>> = {
  local: {
    price: 'Free forever',
    bullets: [
      'Ollama, LM Studio, and llama.cpp local models',
      'Fully offline, zero data leaves your device',
      'No account required',
      'Unlimited local conversations',
    ],
    ctaLabel: 'Current plan',
    ctaVariant: 'current',
  },
  free: {
    price: `${formatUsdAmount(0)} / mo`,
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
  basic: {
    price: `${formatUsdAmount(getPublishedMonthlyPriceUsd('basic'))} / mo`,
    bullets: [
      'Managed cloud entry tier',
      'Speed-optimized managed models',
      'Cross-device sync (desktop + mobile + web)',
      'Priority bug reports',
    ],
    ctaLabel: `Upgrade to ${PLAN_LABEL.basic}`,
    ctaVariant: 'primary',
  },
  pro: {
    price: `${formatUsdAmount(getPublishedMonthlyPriceUsd('pro'))} / mo`,
    bullets: ['AGI Work and developer surfaces', 'Image generation', 'Advanced agent features'],
    ctaLabel: `Upgrade to ${PLAN_LABEL.pro}`,
    ctaVariant: 'primary',
  },
  max: {
    price: `${formatUsdAmount(getPublishedMonthlyPriceUsd('max'))} / mo`,
    bullets: ['Every flagship model included', 'Advanced agents and research', 'Priority support'],
    ctaLabel: `Upgrade to ${PLAN_LABEL.max}`,
    ctaVariant: 'primary',
  },
  max_15x: {
    price: `${formatUsdAmount(getPublishedMonthlyPriceUsd('max_15x'))} / mo`,
    bullets: [
      'Highest individual usage limits',
      'Every flagship model included',
      'Video generation access',
    ],
    ctaLabel: `Upgrade to ${PLAN_LABEL.max_15x}`,
    ctaVariant: 'primary',
  },
  team: {
    price: `${formatUsdAmount(getPublishedPlanPricePerMonthUsd('team', 'yearly') ?? getPublishedMonthlyPriceUsd('team'))} / seat / mo`,
    priceNote: `Billed yearly, or ${formatUsdAmount(getPublishedMonthlyPriceUsd('team'))} per seat billed monthly`,
    bullets: [
      'Shared workspaces and organization administration',
      'Owner and admin roles with member management',
      'One organization invoice, billed per seat',
    ],
    ctaLabel: 'Choose seats',
    ctaVariant: 'primary',
  },
};

function planUsageBullets(tier: UIPlanTier): string[] {
  return tier === 'local' ? [] : managedUsageComparisonLines(tier);
}

export interface PlanCardProps {
  tier: UIPlanTier;
  isCurrentPlan: boolean;
  isLowerPaidTier?: boolean;
  onCtaClick: (tier: UIPlanTier) => void;
  actionDisabled?: boolean;
  actionDisabledReason?: string;
}

export function PlanCard({
  tier,
  isCurrentPlan,
  isLowerPaidTier = false,
  onCtaClick,
  actionDisabled = false,
  actionDisabledReason,
}: PlanCardProps) {
  const content = TIER_CONTENT[tier];
  if (!content) return null;
  const label = PLAN_LABEL[tier];
  const description = PLAN_DESCRIPTION[tier];
  const isFree = isFreePlan(tier);
  const bullets = [...planUsageBullets(tier), ...content.bullets];

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-5 gap-4',
        'transition-shadow duration-150',
        isCurrentPlan
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
          : 'border-border bg-card hover:border-border/80 hover:shadow-e1',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCurrentPlan && (
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Current plan
            </span>
          )}
          {isFree && (
            <span className="inline-flex items-center rounded-full bg-success-fill/10 px-2 py-0.5 text-[10px] font-semibold text-success-text">
              Always free
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-xl font-bold text-foreground tabular-nums">{content.price}</p>
        {content.priceNote ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{content.priceNote}</p>
        ) : null}
      </div>

      <ul className="flex-1 space-y-1.5">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check size={12} className="mt-0.5 shrink-0 text-success-text" aria-hidden="true" />
            {bullet}
          </li>
        ))}
      </ul>

      <PlanCardCta
        tier={tier}
        variant={isCurrentPlan ? 'current' : content.ctaVariant}
        label={
          isCurrentPlan
            ? 'Current plan'
            : actionDisabled
              ? 'Managed elsewhere'
              : isLowerPaidTier
                ? 'Manage plan'
                : isFree
                  ? 'Included'
                  : content.ctaLabel
        }
        isLowerPaidTier={isLowerPaidTier}
        onCtaClick={onCtaClick}
        disabled={actionDisabled}
        {...(actionDisabledReason ? { disabledReason: actionDisabledReason } : {})}
      />
    </div>
  );
}

interface PlanCardCtaProps {
  tier: UIPlanTier;
  variant: TierContent['ctaVariant'];
  label: string;
  isLowerPaidTier: boolean;
  onCtaClick: (tier: UIPlanTier) => void;
  disabled: boolean;
  disabledReason?: string;
}

function PlanCardCta({
  tier,
  variant,
  label,
  isLowerPaidTier,
  onCtaClick,
  disabled,
  disabledReason,
}: PlanCardCtaProps) {
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
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() => onCtaClick(tier)}
      className={cn(
        base,
        disabled && 'cursor-not-allowed opacity-55',
        isLowerPaidTier
          ? 'border border-border bg-card text-foreground hover:bg-muted'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
    >
      {!isLowerPaidTier && !disabled ? <Zap size={12} aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
