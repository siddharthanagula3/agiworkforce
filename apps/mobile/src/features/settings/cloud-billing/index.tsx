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
 * in-app PaywallBottomSheet used by the chat paywall, which itself falls
 * back to native StoreKit/Play IAP (FEATURES.iap) or an honest "not
 * available yet" message when neither is ready.
 * No stub / fake data is shown — the screen is always honest about state.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, Platform } from 'react-native';
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
import { useIapPurchaseFlow } from '@/src/features/billing/useIapPurchaseFlow';
import { useIapStore } from '@/src/features/billing/iapStore';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import type { IapRestoreOutcome } from '@/src/features/billing/useIapPurchaseFlow';
import { getIapSubscriptionGuard } from '@/src/features/billing/subscriptionSource';

// Free-tier feature bullets — mirrors web BillingSection
const FREE_FEATURES = [
  'Chat on web, iOS, Android, and desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Search the web',
];

// ---------------------------------------------------------------------------
// IAP subscription management — StoreKit 2 / Play Billing only. No in-app
// web/Stripe checkout: Apple/Google require native IAP for a subscription
// purchased or managed from inside the app. Mirrors Claude's iOS Billing
// screen (plan name + "Manage subscription" + "Restore purchases", no
// checkout UI in-app). Only mounted when FEATURES.iap is true, so useIAP()'s
// native store connection never initializes while the flag is off.
// ---------------------------------------------------------------------------

function IapManagementSection({ onBlockedManage }: { onBlockedManage?: () => void }) {
  const colors = useThemeColors();
  const { manageSubscription, restore } = useIapPurchaseFlow();
  const status = useIapStore((s) => s.status);
  const errorMessage = useIapStore((s) => s.errorMessage);
  const isBusy = status === 'purchasing' || status === 'verifying' || status === 'restoring';
  const handleRestore = useCallback(async () => {
    async function run(): Promise<void> {
      const outcome: IapRestoreOutcome | null = await restore();
      if (!outcome) return;
      if (outcome.kind === 'restored') {
        const planNames = outcome.tiers.map((tier) => getBillingPlanPricing(tier).label);
        Alert.alert(
          'Purchases restored',
          planNames.length > 0
            ? `Restored ${planNames.join(', ')} for this AGI Cloud account.`
            : 'Your store purchases were restored for this AGI Cloud account.',
        );
        return;
      }
      if (outcome.kind === 'none') {
        Alert.alert(
          'No purchases found',
          Platform.OS === 'ios'
            ? 'No AGI subscription purchases were found for this Apple ID.'
            : 'No AGI subscription purchases were found for this Google Play account.',
        );
        return;
      }
      Alert.alert('Restore purchases failed', outcome.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Try again', onPress: () => void run() },
      ]);
    }
    await run();
  }, [restore]);

  return (
    <SettingsGroup>
      <SettingsRow
        label="Manage subscription"
        icon={CreditCard}
        onPress={
          isBusy ? undefined : onBlockedManage ? onBlockedManage : () => void manageSubscription()
        }
      />
      <SettingsRow
        label={status === 'restoring' ? 'Restoring…' : 'Restore purchases'}
        icon={ExternalLink}
        onPress={isBusy ? undefined : () => void handleRestore()}
        isLast={!(status === 'error' && errorMessage)}
      />
      {status === 'error' && errorMessage && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <Text style={{ color: colors.agentError, fontSize: 12 }}>{errorMessage}</Text>
        </View>
      )}
    </SettingsGroup>
  );
}

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
  // screen's label in lock-step with account.tsx / web (no "Pro+" vs "Pro Max" drift).
  const tierLabel = getBillingPlanPricing(billingTier).label;
  const isFreeTier = billingTier === 'free';
  const isEntitled = isEntitledSubscriptionStatus(billingStatus);
  const statusLabel = billingStatus.replaceAll('_', ' ');
  const isWorkspacePlan = canUseBillingPlanCapability(tier, 'team_admin');
  const nextUpgradeTier = getNextUpgradeTier(tier);
  const subscriptionGuard = getIapSubscriptionGuard(
    billingSource,
    billingStatus,
    Platform.OS === 'ios' ? 'ios' : 'android',
  );

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

  // Upgrading/adjusting a plan never opens an external checkout URL — Apple
  // Guideline 3.1.1 requires in-app subscription purchases go through native
  // IAP. This opens the same PaywallBottomSheet the chat paywall uses, which
  // itself handles the FEATURES.iap-on (native purchase) vs -off (honest
  // "not available yet" message) branches.
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
    // No Stripe portal yet — fall back to the in-app paywall/IAP management
    // sheet rather than an external web page.
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

      {FEATURES.iap && (
        <IapManagementSection
          onBlockedManage={subscriptionGuard.blocked ? showSubscriptionOwnerGuard : undefined}
        />
      )}

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
