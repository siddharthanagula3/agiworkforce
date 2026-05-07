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
 *   - bundle-dynamic-imports: Stripe Checkout link generator marked with a
 *     TODO for week 2-3 dynamic import.
 *   - bundle-analyzable-paths: lucide-react imports use named exports directly,
 *     not a barrel re-export.
 *   - rendering-conditional-render: all conditionals use ternary (? :), not &&.
 *   - server-serialization: only accepts the minimal props needed (currentTier,
 *     requiredTier, feature, reason) — no currentUser object.
 *   - rerender-derived-state-no-effect: upgradeLinkHref is computed during
 *     render from props, not in a useEffect.
 *   - bundle-conditional: Stripe SDK is NOT imported at module load. Only the
 *     /pricing route is used in the stub; real Stripe import deferred to week 2.
 *   - rendering-resource-hints: upgrade button prefetches /pricing on hover
 *     via next/link prefetch behaviour and prefetchDNS for stripe.com on hover.
 */

import { memo, useCallback } from 'react';
import Link from 'next/link';
import { prefetchDNS } from 'react-dom';
import { Video, Brain, Zap, Monitor, Search, Image, Database, Server, Globe } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/components/ui/button';
import { Badge } from '@shared/components/ui/badge';
import { cn } from '@shared/lib/utils';

// TODO dynamic-import-stripe: when wiring real Stripe Checkout in week 2-3,
// replace the /pricing redirect with:
//   const loadStripe = dynamic(() => import('@stripe/stripe-js').then(m => m.loadStripe))
// and call it only inside the onUpgrade handler, not at module load.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaywallFeature =
  | 'video_generation'
  | 'opus_4_7'
  | 'gpt_5_5'
  | 'computer_use'
  | 'deep_research'
  | 'image_quota'
  | 'token_cap'
  | 'mcp'
  | 'web_search';

export type UserTier = 'free' | 'hobby' | 'pro' | 'pro_plus' | 'max';
export type RequiredTier = 'hobby' | 'pro' | 'pro_plus' | 'max';

export interface InlinePaywallCardProps {
  feature: PaywallFeature;
  currentTier: UserTier;
  requiredTier: RequiredTier;
  /** e.g. "10/10 images used this month" */
  reason?: string;
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

const TIER_LABELS: Record<RequiredTier, string> = {
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
};

const FEATURE_LABELS: Record<PaywallFeature, string> = {
  video_generation: 'video generation',
  opus_4_7: 'Opus 4.7 access',
  gpt_5_5: 'GPT-5.5 access',
  computer_use: 'computer use',
  deep_research: 'deep research',
  image_quota: 'more image generation',
  token_cap: 'higher token limits',
  mcp: 'MCP server support',
  web_search: 'web search',
};

// ---------------------------------------------------------------------------
// Sub-components — top-level to satisfy rerender-no-inline-components
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

  // Use explicit ternary chain — rendering-conditional-render
  return feature === 'video_generation' ? (
    <Video className={iconClass} aria-hidden="true" />
  ) : feature === 'opus_4_7' ? (
    <Brain className={iconClass} aria-hidden="true" />
  ) : feature === 'gpt_5_5' ? (
    <Zap className={iconClass} aria-hidden="true" />
  ) : feature === 'computer_use' ? (
    <Monitor className={iconClass} aria-hidden="true" />
  ) : feature === 'deep_research' ? (
    <Search className={iconClass} aria-hidden="true" />
  ) : feature === 'image_quota' ? (
    <Image className={iconClass} aria-hidden="true" />
  ) : feature === 'token_cap' ? (
    <Database className={iconClass} aria-hidden="true" />
  ) : feature === 'mcp' ? (
    <Server className={iconClass} aria-hidden="true" />
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
      {TIER_LABELS[tier]}
    </Badge>
  );
});
TierBadge.displayName = 'TierBadge';

interface CtaButtonsProps {
  upgradeLinkHref: string;
  requiredTier: RequiredTier;
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Upgrade and dismiss CTAs.
 *
 * rendering-resource-hints: prefetchDNS for stripe.com on hover so that if
 * the real Stripe flow is wired later, the DNS lookup is already done.
 * next/link handles /pricing prefetch automatically when the link enters the
 * viewport or on hover.
 */
const CtaButtons = memo(function CtaButtons({
  upgradeLinkHref,
  requiredTier,
  onUpgrade,
  onDismiss,
}: CtaButtonsProps) {
  const handleUpgradeMouseEnter = useCallback(() => {
    // rendering-resource-hints: warm Stripe DNS when user hovers upgrade CTA.
    prefetchDNS('https://js.stripe.com');
    prefetchDNS('https://checkout.stripe.com');
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Primary CTA — next/link prefetches /pricing route automatically */}
      <Button
        asChild
        size="sm"
        className="font-semibold"
        onMouseEnter={handleUpgradeMouseEnter}
        onFocus={handleUpgradeMouseEnter}
      >
        <Link href={upgradeLinkHref} prefetch onClick={onUpgrade}>
          Upgrade to {TIER_LABELS[requiredTier]}
        </Link>
      </Button>

      {/* Secondary CTA */}
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
  onUpgrade,
  onDismiss,
}: InlinePaywallCardProps) {
  // rerender-derived-state-no-effect: compute href during render, not in useEffect
  const upgradeLinkHref = `/pricing?from=paywall&tier=${requiredTier}&feature=${feature}`;

  const headline = `Upgrade to ${TIER_LABELS[requiredTier]} for ${FEATURE_LABELS[feature]}`;

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
            <TierBadge tier={requiredTier} />
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pb-0">
        {/* rendering-conditional-render: ternary, not && */}
        {reason !== EMPTY_REASON ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
      </CardContent>

      <CardFooter className="pt-4">
        <CtaButtons
          upgradeLinkHref={upgradeLinkHref}
          requiredTier={requiredTier}
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
