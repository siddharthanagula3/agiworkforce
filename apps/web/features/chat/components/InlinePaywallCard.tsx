'use client';

/**
 * InlinePaywallCard
 *
 * Replaces the assistant message slot when the API returns a 402 paywall
 * response ({ kind: 'paywall', feature, requiredTier, reason }).
 *
 * Vercel React Best Practices applied:
 *   - rerender-no-inline-components: FeatureIcon, TierBadge, CtaButtons are
 *     top-level components, not defined inside InlinePaywallCard.
 *   - rerender-memo-with-default-value: EMPTY_REASON default hoisted as a
 *     module-level constant so the string reference is stable.
 *   - bundle-analyzable-paths: lucide-react imports use named exports directly,
 *     not a barrel re-export.
 *   - rendering-conditional-render: all conditionals use ternary (? :), not &&.
 *   - server-serialization: only accepts the minimal props needed (currentTier,
 *     requiredTier, feature, reason) · no currentUser object.
 */

import { memo, useEffect, useState } from 'react';
import {
  Video,
  Brain,
  Monitor,
  Search,
  Image as ImageIcon,
  Database,
  Server,
  Globe,
  Timer,
  Gauge,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@agiworkforce/ui';
import {
  getBillingPlanPricing,
  getPlanPriceUsd,
  isBillingPlanTier,
  normalizePaywallFeature,
  normalizeUIPlanTier,
  paywallLimitHeadline,
  paywallUpgradeLabel,
  tierAtLeast,
  type BillingPlanTier,
  type PaywallFeature,
} from '@agiworkforce/types';

export { normalizePaywallFeature };
import { cn } from '@shared/lib/utils';
import { formatCatalogPrice } from '@features/billing/lib/plan-display';
import {
  formatFreeCapacityCountdown,
  freeCapacityRetryRemainingMs,
} from '@features/chat/lib/freeCapacityRecovery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Re-exported from the shared paywall vocabulary so this module stays the one
 * import site for its existing consumers. The COPY now lives in
 * @agiworkforce/types, because Desktop Cloud renders the same server refusal
 * and was describing it with a smaller table.
 */
export type { PaywallFeature };

export type UserTier = BillingPlanTier;
export type RequiredTier = Exclude<BillingPlanTier, 'local-only' | 'byok' | 'free'>;
export type PaywallRecoveryAction =
  | 'upgrade'
  | 'subscribe'
  | 'manage_billing'
  | 'view_usage'
  | 'top_up';

/**
 * The free lane ran out of shared capacity, which is not a plan limit.
 *
 * Three ways out instead of the usual one, because none of them is the obvious
 * answer: wait for the pool, pay to leave it, or bring a key and stop depending
 * on it. `retryAt` absent means the server could not name an instant, and the
 * card must not invent one, it offers the retry immediately instead.
 */
export interface FreeCapacityRecovery {
  retryAt?: string;
  byokHref?: string;
  onRetry: () => void;
}

export interface InlinePaywallCardProps {
  feature: PaywallFeature;
  currentTier: UserTier;
  requiredTier: RequiredTier;
  /** e.g. "10/10 images used this month" */
  reason?: string;
  /**
   * GOV-20: hide the upgrade CTA for a refusal upgrading cannot fix (a plain
   * rate limit). Defaults to true so every existing call site is unchanged.
   */
  showUpgradeCta?: boolean;
  /** GOV-20, the ceiling also clears by picking a non-flagship model. */
  suggestStandardModel?: boolean;
  /**
   * GOV-20: already-formatted "when this clears" copy. Only passed when the
   * classification says to show it AND the server actually sent an instant;
   * never synthesised, so the card cannot invent a reset time.
   */
  resetLabel?: string;
  /** Server refusal recovery: upgrade, subscribe, repair billing, or inspect usage/reset. */
  recoveryAction?: PaywallRecoveryAction;
  /** Present only for the free lane's capacity refusal; selects that variant. */
  freeCapacity?: FreeCapacityRecovery;
  onUpgrade: () => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Module-level constants (rerender-memo-with-default-value)
// ---------------------------------------------------------------------------

/** Stable empty-string default for the optional `reason` prop. */
const EMPTY_REASON = '';

// ---------------------------------------------------------------------------
// Static lookup tables (rendered during module load, never recreated)
// ---------------------------------------------------------------------------

export function normalizeRequiredTier(value: string): RequiredTier {
  if (value === 'hobby') return 'basic';
  if (!isBillingPlanTier(value) || value === 'local-only' || value === 'byok' || value === 'free') {
    return 'basic';
  }
  return value;
}

/**
 * G11: every CTA below used to build its string from `.label` alone
 * ("Upgrade to Pro"), even though `getBillingPlanPricing` already returns
 * `monthlyPriceUsd`. Gemini's benchmark upsell discloses the exact price
 * ("Get 5x more usage with AI Ultra, $99.99/month"); this is that price,
 * read from the same catalog call every caller here already makes.
 *
 * Returns '' for a tier with no published amount (Enterprise is
 * contract-priced, `getPlanPriceUsd` returns null on purpose, and printing
 * a number for it would be exactly the "$0" bug `monthlyPriceUsd` being
 * optional was introduced to prevent). Team is per-seat, so its suffix says
 * "/seat/mo" per the catalog's own rendering rule.
 */
function tierPriceSuffix(tier: RequiredTier): string {
  const monthlyUsd = getPlanPriceUsd(tier, 'monthly');
  if (monthlyUsd === null) return '';
  const amount = formatCatalogPrice(monthlyUsd);
  return getBillingPlanPricing(tier).perSeat === true ? `, ${amount}/seat/mo` : `, ${amount}/mo`;
}

// ---------------------------------------------------------------------------
// Sub-components · top-level to satisfy rerender-no-inline-components
// ---------------------------------------------------------------------------

interface FeatureIconProps {
  feature: PaywallFeature;
  className?: string;
}

/**
 * Returns the correct icon for the gated feature.
 * Named lucide exports imported directly (bundle-analyzable-paths).
 */
const FeatureIcon = memo(function FeatureIcon({ feature, className }: FeatureIconProps) {
  const iconClass = cn('h-5 w-5', className);

  // Use explicit ternary chain · rendering-conditional-render
  return feature === 'video_generation' ? (
    <Video className={iconClass} aria-hidden="true" />
  ) : feature === 'opus_5' ? (
    <Brain className={iconClass} aria-hidden="true" />
  ) : feature === 'computer_use' ? (
    <Monitor className={iconClass} aria-hidden="true" />
  ) : feature === 'deep_research' ? (
    <Search className={iconClass} aria-hidden="true" />
  ) : feature === 'image_quota' ? (
    <ImageIcon className={iconClass} aria-hidden="true" />
  ) : feature === 'token_cap' ? (
    <Database className={iconClass} aria-hidden="true" />
  ) : feature === 'mcp' ? (
    <Server className={iconClass} aria-hidden="true" />
  ) : feature === 'rolling_capacity' ? (
    <Timer className={iconClass} aria-hidden="true" />
  ) : feature === 'request_rate' ? (
    <Gauge className={iconClass} aria-hidden="true" />
  ) : (
    // web_search
    <Globe className={iconClass} aria-hidden="true" />
  );
});
FeatureIcon.displayName = 'FeatureIcon';

interface TierBadgeProps {
  tier: RequiredTier;
}

const TierBadge = memo(function TierBadge({ tier }: TierBadgeProps) {
  return (
    <Badge variant="secondary" className="ml-2 text-xs font-semibold tracking-wide uppercase">
      {getBillingPlanPricing(tier).label}
    </Badge>
  );
});
TierBadge.displayName = 'TierBadge';

interface CtaButtonsProps {
  requiredTier: RequiredTier;
  /** GOV-20, false renders dismiss only. */
  showUpgradeCta: boolean;
  recoveryAction: PaywallRecoveryAction;
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Recovery and dismiss CTAs. The page owns the exact checkout/Settings
 * destination so the card remains a pure transcript renderer.
 */
const CtaButtons = memo(function CtaButtons({
  requiredTier,
  showUpgradeCta,
  recoveryAction,
  onUpgrade,
  onDismiss,
}: CtaButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {showUpgradeCta ? (
        <Button type="button" size="sm" className="font-semibold" onClick={onUpgrade}>
          {recoveryAction === 'manage_billing'
            ? 'Manage billing'
            : recoveryAction === 'view_usage'
              ? 'View usage'
              : recoveryAction === 'top_up'
                ? 'Buy credits'
                : recoveryAction === 'subscribe'
                  ? `Subscribe to ${getBillingPlanPricing(requiredTier).label}${tierPriceSuffix(requiredTier)}`
                  : `Upgrade to ${getBillingPlanPricing(requiredTier).label}${tierPriceSuffix(requiredTier)}`}
        </Button>
      ) : null}

      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Try later
      </Button>
    </div>
  );
});
CtaButtons.displayName = 'CtaButtons';

const COUNTDOWN_TICK_MS = 1_000;
const FREE_CAPACITY_HEADLINE = 'No free capacity right now';
const FREE_CAPACITY_BYOK_LABEL = 'Use your own key';
const FREE_CAPACITY_RETRY_LABEL = 'Try again';

/**
 * Milliseconds left on the pool's own clock, re-read once a second.
 *
 * Driven off the wall clock rather than a decrementing counter so a backgrounded
 * tab, a throttled timer or a machine that slept all resolve to the truth on the
 * next tick instead of accumulating drift. Stops ticking the moment it reaches
 * zero, so a card left on screen is not a permanent interval.
 */
function useFreeCapacityCountdown(retryAt: string | undefined): number | null {
  const [remainingMs, setRemainingMs] = useState(() =>
    freeCapacityRetryRemainingMs(retryAt, Date.now()),
  );

  useEffect(() => {
    const read = () => freeCapacityRetryRemainingMs(retryAt, Date.now());
    const initial = read();
    setRemainingMs(initial);
    if (initial === null || initial <= 0) return;

    const timer = setInterval(() => {
      const next = read();
      setRemainingMs(next);
      if (next === null || next <= 0) clearInterval(timer);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [retryAt]);

  return remainingMs;
}

interface FreeCapacityActionsProps {
  freeCapacity: FreeCapacityRecovery;
  showUpgradeCta: boolean;
  requiredTier: RequiredTier;
  onUpgrade: () => void;
  onDismiss: () => void;
}

const FreeCapacityActions = memo(function FreeCapacityActions({
  freeCapacity,
  showUpgradeCta,
  requiredTier,
  onUpgrade,
  onDismiss,
}: FreeCapacityActionsProps) {
  const remainingMs = useFreeCapacityCountdown(freeCapacity.retryAt);
  const waiting = remainingMs !== null && remainingMs > 0;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        className="font-semibold"
        disabled={waiting}
        onClick={freeCapacity.onRetry}
      >
        {waiting
          ? `${FREE_CAPACITY_RETRY_LABEL} in ${formatFreeCapacityCountdown(remainingMs)}`
          : FREE_CAPACITY_RETRY_LABEL}
      </Button>

      {showUpgradeCta ? (
        <Button type="button" variant="outline" size="sm" onClick={onUpgrade}>
          {`Upgrade to ${getBillingPlanPricing(requiredTier).label}${tierPriceSuffix(requiredTier)}`}
        </Button>
      ) : null}

      {freeCapacity.byokHref ? (
        <Button asChild variant="outline" size="sm">
          <a href={freeCapacity.byokHref}>{FREE_CAPACITY_BYOK_LABEL}</a>
        </Button>
      ) : null}

      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Try later
      </Button>
    </div>
  );
});
FreeCapacityActions.displayName = 'FreeCapacityActions';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const InlinePaywallCardComponent = function InlinePaywallCard({
  feature,
  currentTier,
  requiredTier,
  reason = EMPTY_REASON,
  showUpgradeCta = true,
  suggestStandardModel = false,
  resetLabel = EMPTY_REASON,
  recoveryAction = 'upgrade',
  freeCapacity,
  onUpgrade,
  onDismiss,
}: InlinePaywallCardProps) {
  const alreadyEntitled = tierAtLeast(
    normalizeUIPlanTier(currentTier, 'free'),
    normalizeUIPlanTier(requiredTier, 'basic'),
  );
  const effectiveAction: PaywallRecoveryAction =
    alreadyEntitled && (recoveryAction === 'upgrade' || recoveryAction === 'subscribe')
      ? 'view_usage'
      : recoveryAction;

  // GOV-20: a refusal upgrading cannot fix must not be headlined "Upgrade to…".
  //
  // The free lane's refusal is not a limit the reader reached, so it borrows
  // none of that copy: every `paywallLimitHeadline` says "you have reached
  // your…", which would blame a user whose only mistake was arriving while a
  // shared pool was busy.
  const headline = freeCapacity
    ? FREE_CAPACITY_HEADLINE
    : !showUpgradeCta
      ? paywallLimitHeadline(feature)
      : effectiveAction === 'manage_billing'
        ? `Update billing to continue ${paywallUpgradeLabel(feature)}`
        : effectiveAction === 'view_usage'
          ? paywallLimitHeadline(feature)
          : effectiveAction === 'subscribe'
            ? `Subscribe to ${getBillingPlanPricing(requiredTier).label}${tierPriceSuffix(requiredTier)} for ${paywallUpgradeLabel(feature)}`
            : `Upgrade to ${getBillingPlanPricing(requiredTier).label}${tierPriceSuffix(requiredTier)} for ${paywallUpgradeLabel(feature)}`;

  return (
    <Card
      as="section"
      aria-labelledby="paywall-card-title"
      className="my-2 border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <FeatureIcon feature={feature} />
          </span>
          <CardTitle
            id="paywall-card-title"
            as="h3"
            className="ml-3 text-base font-semibold leading-snug"
          >
            {headline}
            {/* Non-plan recovery must not advertise a tier badge. */}
            {showUpgradeCta &&
            !freeCapacity &&
            recoveryAction !== 'manage_billing' &&
            recoveryAction !== 'view_usage' ? (
              <TierBadge tier={requiredTier} />
            ) : null}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pb-0">
        {/* rendering-conditional-render: ternary, not && */}
        {reason !== EMPTY_REASON ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
        {/* GOV-20: the two other ways out, shown only when they actually apply. */}
        {suggestStandardModel ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Switching to a standard (non-flagship) model clears this now.
          </p>
        ) : null}
        {resetLabel !== EMPTY_REASON ? (
          <p className="mt-2 text-sm text-muted-foreground">{resetLabel}</p>
        ) : null}
      </CardContent>

      <CardFooter className="pt-4">
        {freeCapacity ? (
          <FreeCapacityActions
            freeCapacity={freeCapacity}
            showUpgradeCta={showUpgradeCta}
            requiredTier={requiredTier}
            onUpgrade={onUpgrade}
            onDismiss={onDismiss}
          />
        ) : (
          <CtaButtons
            requiredTier={requiredTier}
            showUpgradeCta={showUpgradeCta}
            recoveryAction={effectiveAction}
            onUpgrade={onUpgrade}
            onDismiss={onDismiss}
          />
        )}
      </CardFooter>
    </Card>
  );
};

/**
 * Memoized export.
 *
 * onUpgrade and onDismiss must be stable references from the parent
 * (useCallback-wrapped) to preserve memoization.
 */
export const InlinePaywallCard = memo(InlinePaywallCardComponent);
InlinePaywallCard.displayName = 'InlinePaywallCard';
