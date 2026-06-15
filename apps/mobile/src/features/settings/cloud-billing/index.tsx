/**
 * Cloud Billing Settings Screen
 *
 * Native RN equivalent of the web BillingSection. Shows the user's current
 * plan tier, credit balance, and an upgrade / manage path via the Stripe
 * portal (or the pricing page for free users).
 *
 * BILLING feature flag: the Stripe portal fetch is gated behind
 * FEATURES.billing. When the flag is false (v1 default) the screen renders
 * a plan card with an "Upgrade" CTA that opens agiworkforce.com/pricing.
 * No stub / fake data is shown — the screen is always honest about state.
 *
 * Cloud-only surface.
 */

import { useCallback, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { CreditCard, ExternalLink, Zap, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useTierStore } from '@/src/features/billing/store';
import { fetchPortalSessionUrl } from '@/src/features/billing/service';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';

// Plan display names
const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro Max',
  max: 'Max',
};

// Free-tier feature bullets — mirrors web BillingSection
const FREE_FEATURES = [
  'Chat on web, iOS, Android, and desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Search the web',
];

function PlanBadge({ tier }: { tier: string }) {
  const colors = useThemeColors();
  const isPaid = tier !== 'free';
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isPaid ? colors.teal : colors.neutralSurface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Zap size={20} color={isPaid ? colors.white : colors.textMuted} />
    </View>
  );
}

export default function CloudBillingScreen() {
  const colors = useThemeColors();
  const tier = useTierStore((s) => s.tier);
  const isRefreshing = useTierStore((s) => s.isRefreshing);

  const [portalLoading, setPortalLoading] = useState(false);

  const tierLabel = TIER_LABELS[tier] ?? 'Free';
  const isFreeTier = tier === 'free';

  const handleUpgrade = useCallback(() => {
    void openExternalUrl('https://agiworkforce.com/pricing');
  }, []);

  const handleManageBilling = useCallback(async () => {
    if (!FEATURES.billing) {
      // Billing portal not yet active — open pricing page instead
      void openExternalUrl('https://agiworkforce.com/pricing');
      return;
    }
    setPortalLoading(true);
    try {
      const url = await fetchPortalSessionUrl();
      await openExternalUrl(url);
    } catch {
      Alert.alert('Billing portal unavailable', 'Please visit agiworkforce.com/billing.');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  return (
    <SettingsScreenShell title="Billing">
      <SettingsInfo
        title="Your plan, usage, and payment details"
        body={
          isFreeTier
            ? 'You are on the Free plan. Upgrade to unlock higher limits and cloud features.'
            : `You are on the ${tierLabel} plan.`
        }
        icon={CreditCard}
      />

      {/* Current plan card */}
      <View
        style={{
          borderRadius: 14,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: 18,
        }}
      >
        {/* Plan header */}
        <View
          style={{
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 11,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Current Plan
          </Text>
        </View>

        {/* Plan identity */}
        <View
          style={{
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <PlanBadge tier={tier} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
              {isFreeTier ? 'Free plan' : `${tierLabel} plan`}
            </Text>
            {isFreeTier && (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                Try AGI Cloud
              </Text>
            )}
          </View>
        </View>

        {/* Free plan feature list */}
        {isFreeTier && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
            {FREE_FEATURES.map((feat) => (
              <View key={feat} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Check size={14} color={colors.teal} style={{ marginTop: 2 }} />
                <Text
                  style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}
                >
                  {feat}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Action row */}
        <View
          style={{
            padding: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <SettingsRow
            label={isFreeTier ? 'Upgrade plan' : 'Adjust plan'}
            icon={ExternalLink}
            onPress={handleUpgrade}
            isLast={isFreeTier}
          />
          {!isFreeTier && (
            <SettingsRow
              label={portalLoading ? 'Opening portal…' : 'Manage billing'}
              icon={CreditCard}
              onPress={portalLoading ? undefined : () => void handleManageBilling()}
              isLast
            />
          )}
        </View>
      </View>

      {/* Invoices */}
      <SettingsGroup>
        <SettingsRow
          label={isFreeTier ? 'No invoices yet' : 'View invoices'}
          icon={ExternalLink}
          onPress={
            isFreeTier ? undefined : () => void openExternalUrl('https://agiworkforce.com/billing')
          }
          isLast
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
