/**
 * Cloud Billing Settings Screen
 *
 * Native RN equivalent of the web BillingSection. Shows the user's current
 * plan tier, credit balance, and an upgrade / manage path via the Stripe
 * portal (or the pricing page for free users).
 *
 * BILLING feature flag: the Stripe portal fetch is gated behind
 * FEATURES.billing. Upgrading/adjusting a subscription NEVER opens an
 * external checkout URL (Apple Guideline 3.1.1) — it opens the same
 * in-app PaywallBottomSheet used by the chat paywall, which presents an honest
 * "not available yet" message while no native store products exist.
 * No stub / fake data is shown — the screen is always honest about state.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard, ExternalLink, FileText, Check } from 'lucide-react-native';
import { AgiMark } from '@/components/ui/AgiMark';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import {
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  getNextUpgradeTier,
  isEntitledSubscriptionStatus,
} from '@agiworkforce/types';
import { useTierStore } from '@/src/features/billing/store';
import { fetchPortalSessionUrl } from '@/src/features/billing/service';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { getSubscriptionOwnerGuard } from '@/src/features/billing/subscriptionSource';

// Free-tier feature bullets — mirrors web BillingSection
const FREE_FEATURES = [
  'Chat on web, iOS, Android, and desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Search the web',
];

function PlanBadge() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.neutralSurface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AgiMark size={22} mono />
    </View>
  );
}

export default function CloudBillingScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const tier = useTierStore((s) => s.tier);
  const billingTier = useTierStore((s) => s.billingTier);
  const billingStatus = useTierStore((s) => s.billingStatus);
  const billingSource = useTierStore((s) => s.billingSource);
  const refreshTier = useTierStore((s) => s.refreshTier);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';

  // guardedFetch blocks every our-cloud call (including this screen's own
  // tier refresh) while chat is set to Local — see CloudSyncBlockedBanner's
  // doc comment. Re-fetch as soon as the user switches modes so the banner
  // disappearing and real data appearing happen together, not on a delay.
  useEffect(() => {
    if (isClerkSignedIn && isCloudModeActive) void refreshTier();
  }, [isClerkSignedIn, isCloudModeActive, refreshTier]);

  const [portalLoading, setPortalLoading] = useState(false);
  const paywallSheetRef = useRef<BottomSheet>(null);

  // Single source of truth for plan labels (@agiworkforce/types) — keeps this
  // screen's label in lock-step with account.tsx / web, so no surface invents
  // its own plan name (the failure this guards against: a hand-written label
  // for a tier that does not exist in BILLING_PLAN_PRICING).
  const tierLabel = getBillingPlanPricing(billingTier).label;
  const isFreeTier = billingTier === 'free';
  const isEntitled = isEntitledSubscriptionStatus(billingStatus);
  const statusLabel = billingStatus.replaceAll('_', ' ');
  const isWorkspacePlan = canUseBillingPlanCapability(tier, 'team_admin');
  const nextUpgradeTier = getNextUpgradeTier(tier);
  const subscriptionGuard = getSubscriptionOwnerGuard(billingSource, billingStatus);

  const showSubscriptionOwnerGuard = useCallback(() => {
    const buttons: Array<{
      text: string;
      style?: 'cancel';
      onPress?: () => void;
    }> = [{ text: 'OK', style: 'cancel' }];
    const managementUrl = subscriptionGuard.managementUrl;
    if (managementUrl) {
      buttons.push({
        text: subscriptionGuard.managementActionLabel,
        onPress: () => void openExternalUrl(managementUrl),
      });
    }
    Alert.alert(
      'Subscription managed elsewhere',
      `You purchased this subscription through ${subscriptionGuard.sourceLabel}. To avoid being charged twice, manage it there before changing plans in this app.`,
      buttons,
    );
  }, [subscriptionGuard]);

  // Mobile has no store purchase path. Existing entitled subscriptions are
  // managed at their recorded owner; free/inactive accounts get the same honest
  // informational paywall used by chat.
  const handleUpgrade = useCallback(() => {
    if (subscriptionGuard.blocked) {
      showSubscriptionOwnerGuard();
      return;
    }
    paywallSheetRef.current?.expand();
  }, [showSubscriptionOwnerGuard, subscriptionGuard.blocked]);

  const handleManageBilling = useCallback(async () => {
    if (FEATURES.billing) {
      setPortalLoading(true);
      try {
        const url = await fetchPortalSessionUrl();
        await openExternalUrl(url);
      } catch {
        Alert.alert('Billing portal unavailable', 'Please try again later.');
      } finally {
        setPortalLoading(false);
      }
      return;
    }
    // No mobile billing-management path yet; keep the user inside the honest
    // informational sheet.
    paywallSheetRef.current?.expand();
  }, []);

  const handleSignIn = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Billing">
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={handleSignIn} />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title="Billing">
      <SettingsInfo
        title="Your plan, usage, and payment details"
        body={
          isFreeTier
            ? 'You are on the Free plan. Upgrade to unlock higher limits and cloud features.'
            : isEntitled
              ? `You are on the ${tierLabel} plan.`
              : `Your ${tierLabel} subscription is ${statusLabel}. Paid capabilities are unavailable.`
        }
        icon={CreditCard}
      />

      {!isCloudModeActive && <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />}

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
          <PlanBadge />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
              {isFreeTier ? 'Free plan' : `${tierLabel} plan`}
            </Text>
            {isFreeTier && (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                Try AGI Cloud
              </Text>
            )}
            {!isFreeTier && !isEntitled && (
              <Text
                style={{
                  color: colors.agentWarning,
                  fontSize: 13,
                  marginTop: 2,
                  textTransform: 'capitalize',
                }}
              >
                {statusLabel}
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
          {nextUpgradeTier && !isWorkspacePlan ? (
            <SettingsRow
              label={isFreeTier ? 'Upgrade plan' : isEntitled ? 'Adjust plan' : 'Choose plan'}
              icon={ExternalLink}
              onPress={handleUpgrade}
              isLast={isFreeTier}
            />
          ) : null}
          {isWorkspacePlan ? (
            <SettingsRow
              label="Workspace administration"
              icon={ExternalLink}
              onPress={() => void openExternalUrl('https://agiworkforce.com/settings/team')}
              isLast={!FEATURES.billing}
            />
          ) : null}
          {!isFreeTier && FEATURES.billing && (
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
          // FileText (not ExternalLink) for the free-tier disabled state — an
          // "opens externally" icon on an inert, unpressable row wrongly
          // implies there's an action to take.
          icon={isFreeTier ? FileText : ExternalLink}
          onPress={
            isFreeTier ? undefined : () => void openExternalUrl('https://agiworkforce.com/billing')
          }
          isLast
        />
      </SettingsGroup>

      {nextUpgradeTier ? (
        <PaywallBottomSheet
          ref={paywallSheetRef}
          feature="general_upgrade"
          requiredTier={nextUpgradeTier}
          onDismiss={() => paywallSheetRef.current?.close()}
        />
      ) : null}
    </SettingsScreenShell>
  );
}
