'use client';

import { useCallback, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BILLING_PLAN_PRICING,
  getNextUpgradeTier,
  isBillingPlanTier,
  isEnterprisePlanTier,
  isFreeBillingPlanTier,
  isFreeOfChargePlanTier,
  isPlanSelectableOnSurface,
  isTeamPlanTier,
  subscriptionPlanTierOf,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Badge,
  Button,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { ServiceNotices } from '@shared/components/ServiceNotices';
import { useUpgradeWaitlistStatus } from '@features/billing/hooks/use-upgrade-waitlist';
import { upgradeNeedsWaitlist } from '@features/billing/services/upgrade-waitlist';
import type { SelectablePaidPlan } from '@features/billing/lib/plan-display';
import { useLocalizedPricing } from '@features/billing/hooks/use-localized-pricing';
import { useFreeMediaOffer } from '@features/billing/hooks/use-free-media-offer';
import {
  CHECKOUT_AVAILABILITY_ERROR_NOTICE,
  CHECKOUT_AVAILABILITY_LOADING_NOTICE,
  CHECKOUT_DISABLED_NOTICE,
  CHECKOUT_ENABLED,
  checkoutUnavailableInRegionNotice,
  localizedFreePrice,
  localizedIncludedTax,
  localizedPricePerMonth,
  planCheckoutReady,
  teamBillingInterval,
  type LocalizedPlanPrices,
  type LocalizedPricingStatus,
} from '@features/billing/lib/localized-pricing';
import {
  BUSINESS_PLAN_CARDS,
  INDIVIDUAL_PLAN_CARDS,
  enterprisePlanFeatures,
  individualPlanFeatures,
  planCtaLabel,
  planFeatureLead,
  planTierBody,
  pricingUsageExplainer,
  teamPlanFeatures,
  teamSeatRows,
  withIncludedTax,
  type BusinessPlanCard,
  type PlanCard,
  type PricingT,
  type TeamSeatRow,
} from '@features/billing/lib/plan-card-copy';
import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';

export type UpgradeTarget = SelectablePaidPlan;
export type UpgradeAction = 'checkout' | 'join-waitlist' | 'open-waitlist';
type UpgradeAccess = 'checking' | 'checkout' | 'waitlist';

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier?: string;
  targetTier?: UpgradeTarget | null;
  waitlistApplies?: boolean;
  onUpgrade: (plan: UpgradeTarget, action: UpgradeAction) => void;
}

type Audience = 'individual' | 'business';
type Relationship = 'current' | 'upgrade' | 'included' | 'none';

interface PlanCardModel {
  id: PlanCard;
  name: string;
  price: string | null;
  priceSub: string;
  billing: string | null;
  seats: TeamSeatRow[];
  body: string;
  lead: string | null;
  features: string[];
}

const PLAN_ORDER: readonly PlanCard[] = [...INDIVIDUAL_PLAN_CARDS, ...BUSINESS_PLAN_CARDS].filter(
  (plan) => isPlanSelectableOnSurface(plan, 'web'),
);

const PAID_INDIVIDUAL_PLANS = PLAN_ORDER.filter(
  (plan): plan is SelfServeIndividualPlanTier =>
    !isFreeBillingPlanTier(plan) && !isBusinessPlan(plan),
);

const CARD_LINK_CLASS =
  'flex h-9 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground';

function isBusinessPlan(plan: string): plan is BusinessPlanCard {
  return (BUSINESS_PLAN_CARDS as readonly string[]).includes(plan);
}

function planRelationship(current: string | undefined, plan: PlanCard): Relationship {
  const currentIndex = current ? PLAN_ORDER.indexOf(current as PlanCard) : -1;
  if (currentIndex < 0) return isFreeBillingPlanTier(plan) ? 'none' : 'upgrade';
  if (plan === current) return 'current';
  if (isBusinessPlan(current as PlanCard) && !isBusinessPlan(plan)) return 'none';
  if (PLAN_ORDER.indexOf(plan) > currentIndex) return 'upgrade';
  return isBusinessPlan(plan) ? 'none' : 'included';
}

function buildPlanCard(
  plan: PlanCard,
  t: PricingT,
  plans: LocalizedPlanPrices | undefined,
  freeMediaOffer: FreeQuotaMediaOffer,
): PlanCardModel {
  const name = BILLING_PLAN_PRICING[plan].label;
  if (isEnterprisePlanTier(plan)) {
    return {
      id: plan,
      name,
      price: t('custom'),
      priceSub: t('customPricingSub'),
      billing: null,
      seats: [],
      body: planTierBody(plan, t),
      lead: null,
      features: enterprisePlanFeatures(t),
    };
  }
  if (isTeamPlanTier(plan)) {
    const interval = teamBillingInterval(plans, true);
    return {
      id: plan,
      name,
      price: null,
      priceSub: withIncludedTax(
        t('perSeatPricingSub'),
        localizedIncludedTax(plans, plan, interval),
        t,
      ),
      billing: interval === 'yearly' ? t('billedYearly') : t('billedMonthly'),
      seats: teamSeatRows(t, plans, interval, undefined),
      body: planTierBody(plan, t),
      lead: null,
      features: teamPlanFeatures(t),
    };
  }
  return {
    id: plan,
    name,
    price: isFreeBillingPlanTier(plan)
      ? localizedFreePrice(plans, undefined)
      : localizedPricePerMonth(plans, plan, 'monthly', undefined),
    priceSub: isFreeBillingPlanTier(plan)
      ? t('perMonth')
      : withIncludedTax(t('perMonth'), localizedIncludedTax(plans, plan, 'monthly'), t),
    billing: null,
    seats: [],
    body: planTierBody(plan, t),
    lead: planFeatureLead(plan, t),
    features: individualPlanFeatures(plan, t, freeMediaOffer),
  };
}

function checkoutNotices(
  hasPaidPlan: boolean,
  pricingStatus: LocalizedPricingStatus,
  plans: LocalizedPlanPrices | undefined,
): string[] {
  if (!CHECKOUT_ENABLED) return [CHECKOUT_DISABLED_NOTICE];
  if (hasPaidPlan) return [];
  if (pricingStatus === 'loading') return [CHECKOUT_AVAILABILITY_LOADING_NOTICE];
  if (pricingStatus === 'error') return [CHECKOUT_AVAILABILITY_ERROR_NOTICE];
  return PAID_INDIVIDUAL_PLANS.filter((plan) => !planCheckoutReady(plans, plan, 'monthly')).map(
    checkoutUnavailableInRegionNotice,
  );
}

function FeatureRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}

interface PlanCardViewProps {
  plan: PlanCardModel;
  relationship: Relationship;
  recommended: boolean;
  checkoutBlocked: boolean;
  upgradeAccess: UpgradeAccess;
  waitlisted: boolean;
  t: PricingT;
  onUpgrade: (plan: UpgradeTarget, action: UpgradeAction) => void;
}

function PlanCardAction({
  plan,
  relationship,
  checkoutBlocked,
  upgradeAccess,
  waitlisted,
  t,
  onUpgrade,
}: PlanCardViewProps) {
  if (isTeamPlanTier(plan.id) && (relationship === 'current' || relationship === 'upgrade')) {
    return (
      <a
        className={CARD_LINK_CLASS}
        href="/pricing#pricing-team-title"
        target="_blank"
        rel="noopener noreferrer"
      >
        {relationship === 'current' ? t('changeSeatsCta') : planCtaLabel('team', t)}
      </a>
    );
  }
  if (relationship === 'current') {
    return (
      <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
        Your current plan
      </Button>
    );
  }
  if (isEnterprisePlanTier(plan.id) && relationship === 'upgrade') {
    return (
      <a
        className={CARD_LINK_CLASS}
        href="/contact-sales"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('contactSalesCta')}
      </a>
    );
  }
  if (relationship === 'upgrade' && !isFreeBillingPlanTier(plan.id) && !isBusinessPlan(plan.id)) {
    const target = plan.id;
    if (upgradeAccess === 'checking') {
      return (
        <Button
          className="h-9 w-full rounded-xl text-sm"
          disabled
          aria-label={`Checking upgrade access for ${plan.name}`}
        >
          Checking access
        </Button>
      );
    }
    if (upgradeAccess === 'waitlist') {
      return (
        <div className="flex flex-col gap-2">
          {waitlisted ? (
            <p className="text-center text-sm text-foreground">{t('onPlanWaitlistNote')}</p>
          ) : null}
          <Button
            className="h-9 w-full rounded-xl text-sm"
            variant={waitlisted ? 'outline' : 'default'}
            aria-label={waitlisted ? t('enterAccessCodeForPlan', { plan: plan.name }) : undefined}
            onClick={() => onUpgrade(target, waitlisted ? 'open-waitlist' : 'join-waitlist')}
          >
            {waitlisted ? t('enterAccessCodeCta') : t('joinPlanWaitlistCta', { plan: plan.name })}
          </Button>
        </div>
      );
    }
    return (
      <Button
        className="h-9 w-full rounded-xl text-sm"
        disabled={checkoutBlocked}
        onClick={() => onUpgrade(target, 'checkout')}
      >
        {planCtaLabel(target, t)}
      </Button>
    );
  }
  if (relationship === 'included') {
    return (
      <Button className="h-9 w-full rounded-xl text-sm" variant="outline" disabled>
        Included
      </Button>
    );
  }
  return null;
}

function PlanCardView(props: PlanCardViewProps) {
  const { plan, recommended } = props;
  return (
    <div
      data-testid={`plan-card-${plan.id}`}
      data-recommended={recommended || undefined}
      className={cn(
        'relative flex flex-col rounded-2xl border bg-background p-5',
        recommended ? 'border-primary/40' : 'border-border/60',
      )}
    >
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-h4 text-foreground">{plan.name}</h3>
          {recommended ? (
            <Badge variant="secondary" className="shrink-0 text-sm uppercase tracking-wide">
              Recommended
            </Badge>
          ) : null}
        </div>
        {plan.price === null ? null : (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
            <span className="text-2xl font-bold text-foreground">{plan.price}</span>
            <span className="text-xs text-muted-foreground">{plan.priceSub}</span>
          </div>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.body}</p>
      </div>

      {plan.seats.length > 0 ? (
        <div className="mb-4">
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {plan.seats.map((seat) => (
              <li key={seat.type} className="space-y-0.5 py-3">
                <h4 className="text-sm font-medium text-foreground">{seat.name}</h4>
                <p className="flex flex-wrap items-baseline gap-x-1">
                  <span className="text-xl font-bold text-foreground">{seat.price}</span>
                  <span className="text-xs text-muted-foreground">{plan.priceSub}</span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">{seat.description}</p>
                {seat.alternate ? (
                  <p className="text-xs leading-5 text-muted-foreground">{seat.alternate}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {plan.billing ? (
            <p className="mt-2 text-xs text-muted-foreground">{plan.billing}</p>
          ) : null}
        </div>
      ) : null}

      <ul className="mb-5 space-y-2">
        {plan.lead ? <li className="text-sm font-medium text-foreground">{plan.lead}</li> : null}
        {plan.features.map((feature) => (
          <FeatureRow key={feature} label={feature} />
        ))}
      </ul>

      <div className="mt-auto">
        <PlanCardAction {...props} />
      </div>
    </div>
  );
}

export function UpgradePlanDialog({
  open,
  onOpenChange,
  // Not defaulted to 'free': `undefined` means the plan is not known yet
  // (`/api/me` is refreshing or answered 401), which must stay distinct from
  // "the user is on Free", or a paid subscriber is shown Free as their plan.
  currentTier: reportedTier,
  targetTier = null,
  waitlistApplies = false,
  onUpgrade,
}: UpgradePlanDialogProps) {
  const { t } = useTranslation('pricing');
  const [expanded, setExpanded] = useState(false);
  const [audienceChoice, setAudienceChoice] = useState<Audience | null>(null);
  const { localizedPricing, pricingStatus } = useLocalizedPricing(open);
  const freeMediaOffer = useFreeMediaOffer(open);
  const plans = localizedPricing?.plans;

  const currentTier = isFreeOfChargePlanTier(reportedTier)
    ? 'free'
    : isBillingPlanTier(reportedTier)
      ? subscriptionPlanTierOf(reportedTier)
      : reportedTier;
  const tierKnown = typeof currentTier === 'string' && currentTier.length > 0;
  const hasPaidPlan = tierKnown && !isFreeOfChargePlanTier(currentTier);
  const { status: waitlistStatus, checking: checkingAccess } = useUpgradeWaitlistStatus({
    enabled: open && waitlistApplies,
  });
  const upgradeAccess: UpgradeAccess = !waitlistApplies
    ? 'checkout'
    : !waitlistStatus && checkingAccess
      ? 'checking'
      : upgradeNeedsWaitlist(waitlistStatus)
        ? 'waitlist'
        : 'checkout';
  const waitlistedPlans = waitlistStatus?.joinedPlans ?? [];

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        window.setTimeout(() => {
          setExpanded(false);
          setAudienceChoice(null);
        }, 200);
      }
    },
    [onOpenChange],
  );

  const cards = PLAN_ORDER.map((plan) => buildPlanCard(plan, t, plans, freeMediaOffer));
  const currentIdx = tierKnown ? PLAN_ORDER.indexOf(currentTier as PlanCard) : -1;
  const currentPlan = currentIdx >= 0 ? cards[currentIdx] : cards[0];
  const focusedPlan = targetTier
    ? cards.find((plan) => plan.id === targetTier)
    : cards[Math.min(Math.max(currentIdx, 0) + 1, cards.length - 1)];

  const showAll = expanded || !tierKnown;
  const defaultAudience: Audience =
    (tierKnown && isBusinessPlan(currentTier)) || (targetTier && isBusinessPlan(targetTier))
      ? 'business'
      : 'individual';
  const audience = audienceChoice ?? defaultAudience;
  const visibleCards = showAll
    ? cards.filter((plan) => isBusinessPlan(plan.id) === (audience === 'business'))
    : [currentPlan, focusedPlan].filter(
        (plan, index, list): plan is PlanCardModel =>
          plan !== undefined && list.findIndex((candidate) => candidate?.id === plan.id) === index,
      );

  const recommendedTier: string | null =
    targetTier ?? (tierKnown ? getNextUpgradeTier(currentTier) : null);

  const checkoutBlocked = (plan: PlanCard) =>
    !CHECKOUT_ENABLED ||
    (!hasPaidPlan &&
      (pricingStatus !== 'ready' ||
        !PAID_INDIVIDUAL_PLANS.some(
          (paidPlan) => paidPlan === plan && planCheckoutReady(plans, paidPlan, 'monthly'),
        )));
  const notices =
    upgradeAccess === 'checkout' ? checkoutNotices(hasPaidPlan, pricingStatus, plans) : [];
  const focusedPlanLabel = targetTier ? BILLING_PLAN_PRICING[targetTier].label : null;
  const title = focusedPlanLabel ? `Upgrade to ${focusedPlanLabel}` : 'Upgrade your plan';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          // Cap the height so the expanded multi-tier view never grows past the
          // viewport (which pushed the title off-screen); scroll inside instead.
          'max-h-[90vh] overflow-hidden border-border/70 bg-background p-0 sm:rounded-2xl',
          showAll ? 'w-[min(98vw,56rem)]' : 'w-[min(94vw,38rem)]',
        )}
        closeLabel="Close upgrade plan dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('compareHeading')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[90vh] overflow-y-auto p-6 pb-4">
          {/* pe-10: DialogContent paints its own close control absolutely at
              end-4 with an h-8 w-8 hit area, so it covers the first 3rem of
              this row. Without the reserved gutter the × lands on top of the
              heading. Same reservation DialogHeader makes. */}
          <div className="mb-6 flex items-start justify-between pe-10">
            <h2 className="text-h2 text-foreground">{title}</h2>
          </div>

          {showAll ? (
            <div
              className="mb-5 inline-flex rounded-full border border-border/60 p-1"
              role="group"
              aria-label={t('audienceLabel')}
            >
              {(['individual', 'business'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={audience === option}
                  onClick={() => setAudienceChoice(option)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-medium',
                    audience === option
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option === 'individual' ? t('audienceIndividual') : t('audienceBusiness')}
                </button>
              ))}
            </div>
          ) : null}

          {upgradeAccess === 'waitlist' ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Paid upgrades are opening in stages: join a plan’s waitlist, or use an access code if
              you have one.
            </p>
          ) : null}
          {upgradeAccess === 'checkout' ? (
            <div className="mb-6 flex flex-col gap-2 empty:hidden">
              <ServiceNotices scope="billing" />
            </div>
          ) : null}
          {notices.map((notice) => (
            <p key={notice} role="status" className="mb-3 text-sm text-muted-foreground">
              {notice}
            </p>
          ))}

          <div
            className={cn(
              'grid gap-4',
              showAll && audience === 'individual'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                : visibleCards.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 sm:grid-cols-2',
            )}
          >
            {visibleCards.map((plan) => {
              const relationship = planRelationship(tierKnown ? currentTier : undefined, plan.id);
              return (
                <PlanCardView
                  key={plan.id}
                  plan={plan}
                  relationship={relationship}
                  recommended={plan.id === recommendedTier && relationship === 'upgrade'}
                  checkoutBlocked={checkoutBlocked(plan.id)}
                  upgradeAccess={upgradeAccess}
                  waitlisted={waitlistedPlans.some((joined) => joined === plan.id)}
                  t={t}
                  onUpgrade={onUpgrade}
                />
              );
            })}
          </div>

          {tierKnown ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {expanded ? 'Show fewer plans' : 'See all plans'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1 border-t border-border/60 px-6 py-4 text-center text-caption text-muted-foreground">
          <p>{pricingUsageExplainer(t)}</p>
          <p>
            {t('pricingFootnote')}{' '}
            <a
              className="underline underline-offset-4"
              href="/refund-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('refundPolicyLink')}
            </a>
          </p>
          <p>
            <a
              className="underline underline-offset-4"
              href="/pricing"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('compareHeading')}
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
