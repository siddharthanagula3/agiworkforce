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

import { memo } from 'react';
import {
  Video,
  Brain,
  Zap,
  Monitor,
  Search,
  Image as ImageIcon,
  Database,
  Server,
  Globe,
  Timer,
  Gauge,
} from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@agiworkforce/ui';
import {
  getBillingPlanPricing,
  isBillingPlanTier,
  normalizePaywallFeature,
  paywallLimitHeadline,
  paywallUpgradeLabel,
  type BillingPlanTier,
  type PaywallFeature,
} from '@agiworkforce/types';

export { normalizePaywallFeature };
import { Button } from '@shared/components/ui/button';
import { Badge } from '@shared/components/ui/badge';
import { cn } from '@shared/lib/utils';

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

export interface InlinePaywallCardProps {
  feature: PaywallFeature;
  currentTier: UserTier;
  requiredTier: RequiredTier;
  /** e.g. "10/10 images used this month" */
  reason?: string;
  /**
   * GOV-20 — hide the upgrade CTA for a refusal upgrading cannot fix (a plain
   * rate limit). Defaults to true so every existing call site is unchanged.
   */
  showUpgradeCta?: boolean;
  /** GOV-20 — the ceiling also clears by picking a non-flagship model. */
  suggestStandardModel?: boolean;
  /**
   * GOV-20 — already-formatted "when this clears" copy. Only passed when the
   * classification says to show it AND the server actually sent an instant;
   * never synthesised, so the card cannot invent a reset time.
   */
  resetLabel?: string;
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
  ) : feature === 'gpt_5_5' ? (
    <Zap className={iconClass} aria-hidden="true" />
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
  /** GOV-20 — false renders dismiss only. */
  showUpgradeCta: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Upgrade and dismiss CTAs. The upgrade action opens the page-level Cloud
 * waitlist modal instead of navigating away from the chat.
 */
const CtaButtons = memo(function CtaButtons({
  requiredTier,
  showUpgradeCta,
  onUpgrade,
  onDismiss,
}: CtaButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {showUpgradeCta ? (
        <Button type="button" size="sm" className="font-semibold" onClick={onUpgrade}>
          Upgrade to {getBillingPlanPricing(requiredTier).label}
        </Button>
      ) : null}

      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Try later
      </Button>
    </div>
  );
});
CtaButtons.displayName = 'CtaButtons';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const InlinePaywallCardComponent = function InlinePaywallCard({
  feature,
  currentTier: _currentTier,
  requiredTier,
  reason = EMPTY_REASON,
  showUpgradeCta = true,
  suggestStandardModel = false,
  resetLabel = EMPTY_REASON,
  onUpgrade,
  onDismiss,
}: InlinePaywallCardProps) {
  // GOV-20: a refusal upgrading cannot fix must not be headlined "Upgrade to…".
  const headline = showUpgradeCta
    ? `Upgrade to ${getBillingPlanPricing(requiredTier).label} for ${paywallUpgradeLabel(feature)}`
    : paywallLimitHeadline(feature);

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
            {/* GOV-20: no upgrade offered means no upgrade tier to advertise. */}
            {showUpgradeCta ? <TierBadge tier={requiredTier} /> : null}
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
        <CtaButtons
          requiredTier={requiredTier}
          showUpgradeCta={showUpgradeCta}
          onUpgrade={onUpgrade}
          onDismiss={onDismiss}
        />
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
