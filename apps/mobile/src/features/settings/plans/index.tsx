import { View } from 'react-native';
import {
  BILLING_PLAN_CAPABILITY_LABELS,
  PLAN_CREDIT_ALLOWANCES,
  SELF_SERVE_PAID_PLAN_TIERS,
  billingPlanCapabilities,
  billingPlanCapabilitiesAddedOver,
  getBillingPlanPricing,
  getPlanContextWindowTokens,
  isFreeBillingPlanTier,
  managedUsageComparisonLines,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors, cardRadius } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useTierStore } from '@/src/features/billing/store';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';

const COMPARED_PLANS: readonly BillingPlanTier[] = [
  'free',
  ...SELF_SERVE_PAID_PLAN_TIERS,
  'enterprise',
];

const CONTEXT_WINDOW_FORMAT = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 2,
});

function usageLine(plan: BillingPlanTier): string {
  if (PLAN_CREDIT_ALLOWANCES[plan].unlimited) return 'Usage set by your contract';
  if (isFreeBillingPlanTier(plan)) return 'A small allowance, free models only';
  return managedUsageComparisonLines(plan).join(', ');
}

function contextLine(plan: BillingPlanTier): string {
  const tokens = getPlanContextWindowTokens(plan);
  return tokens === null
    ? 'Context window depends on the model'
    : `Context window up to ${CONTEXT_WINDOW_FORMAT.format(tokens)} tokens`;
}

function featureLines(
  plan: BillingPlanTier,
  current: BillingPlanTier | null,
): { heading: string; items: string[] } {
  const label = (capability: BillingPlanCapability) => BILLING_PLAN_CAPABILITY_LABELS[capability];
  if (current === null || plan === current) {
    return { heading: 'Includes', items: billingPlanCapabilities(plan).map(label) };
  }
  const added = billingPlanCapabilitiesAddedOver(plan, current);
  const currentLabel = getBillingPlanPricing(current).label;
  return added.length === 0
    ? { heading: `No features beyond ${currentLabel}`, items: [] }
    : { heading: `Adds over ${currentLabel}`, items: added.map(label) };
}

export default function PlansScreen() {
  const colors = useThemeColors();
  const tier = useTierStore((s) => s.tier);
  const current = COMPARED_PLANS.includes(tier) ? tier : null;

  return (
    <SettingsScreenShell title="Compare plans" backHref="/(app)/settings/cloud-billing">
      <SettingsInfo
        title="What each plan includes"
        body="Usage resets over a rolling 5-hour session, a week and a month. How far it goes depends on the model and the task, so there is no fixed message count."
      />
      {COMPARED_PLANS.map((plan) => {
        const isCurrent = plan === current;
        const features = featureLines(plan, current);
        const label = getBillingPlanPricing(plan).label;
        return (
          <View
            key={plan}
            accessible
            accessibilityLabel={[
              isCurrent ? `${label}, your plan` : label,
              usageLine(plan),
              contextLine(plan),
              features.items.length > 0
                ? `${features.heading}: ${features.items.join(', ')}`
                : features.heading,
            ].join('. ')}
            style={{
              borderRadius: cardRadius,
              backgroundColor: colors.surfaceElevated,
              borderWidth: isCurrent ? 1 : 0,
              borderColor: colors.textSecondary,
              padding: 14,
              marginBottom: 12,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.callout,
                  fontWeight: '700',
                }}
              >
                {label}
              </Text>
              {isCurrent ? (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  Your plan
                </Text>
              ) : null}
            </View>
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 20 }}
            >
              {usageLine(plan)}
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 20 }}
            >
              {contextLine(plan)}
            </Text>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: typeScale.subhead,
                fontWeight: '600',
                marginTop: 4,
              }}
            >
              {features.heading}
            </Text>
            {features.items.map((item) => (
              <Text
                key={item}
                style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 20 }}
              >
                {`• ${item}`}
              </Text>
            ))}
          </View>
        );
      })}
    </SettingsScreenShell>
  );
}
