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
 * native App Store / Play purchase path when a signed catalog is available,
 * and otherwise fails closed with an unavailable-state explanation.
 * No stub / fake data is shown — the screen is always honest about state.
 *
 * Cloud-only surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CreditCard,
  ExternalLink,
  FileText,
  Check,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react-native';
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
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_UNITS_PER_USD,
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  getNextUpgradeTier,
  isEntitledSubscriptionStatus,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { useTierStore } from '@/src/features/billing/store';
import { fetchPortalSessionUrl } from '@/src/features/billing/service';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { getSubscriptionOwnerGuard } from '@/src/features/billing/subscriptionSource';
import { useMobileIap } from '@/src/features/billing/useMobileIap';

// Free-tier feature bullets — mirrors web BillingSection
const FREE_FEATURES = [
  'Chat on web, iOS, Android, and desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Search the web',
];

function requireTopUpUnits(amountUsd: number): number {
  const units = topUpUnitsForUsd(amountUsd);
  if (units === null) {
    throw new Error('The canonical minimum top-up amount must resolve to a valid unit grant.');
  }
  return units;
}

const MINIMUM_TOP_UP_UNITS = requireTopUpUnits(MIN_TOP_UP_AMOUNT_USD);

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
  const billingPeriodEnd = useTierStore((s) => s.billingPeriodEnd);
  const billingCancelsAtPeriodEnd = useTierStore((s) => s.billingCancelsAtPeriodEnd);
  const refreshTier = useTierStore((s) => s.refreshTier);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';
  const nativeIap = useMobileIap({
    enabled: isClerkLoaded && isClerkSignedIn && isCloudModeActive,
  });

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
  const periodEndLabel =
    billingPeriodEnd === null
      ? null
      : new Date(billingPeriodEnd * 1000).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
  const isWorkspacePlan = canUseBillingPlanCapability(tier, 'team_admin');
  const nextUpgradeTier = getNextUpgradeTier(tier);
  const subscriptionGuard = getSubscriptionOwnerGuard(billingSource, billingStatus);
  const isActiveStripePlan = billingSource === 'stripe' && !isFreeTier && isEntitled;
  const nativeSubscriptionSource =
    nativeIap.catalog?.platform === 'ios'
      ? 'apple'
      : nativeIap.catalog?.platform === 'android'
        ? 'google'
        : null;
  const canBuyNativeSubscription =
    nativeIap.catalog?.enabled === true &&
    !isWorkspacePlan &&
    (!subscriptionGuard.blocked || billingSource === nativeSubscriptionSource);
  const canBuyNativeTopUp =
    nativeIap.catalog?.enabled === true && !isFreeTier && isEntitled && !isWorkspacePlan;
  const paywallRecoveryAction = isFreeTier
    ? 'subscribe'
    : isEntitled
      ? 'upgrade'
      : 'manage_billing';
  const paywallUnavailableMessage =
    paywallRecoveryAction === 'manage_billing'
      ? "Billing management isn't available in the app yet. Please try again later."
      : "Plan changes aren't available in the app yet. Check back soon.";

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

  const handleUpgrade = useCallback(() => {
    if (canBuyNativeSubscription) {
      Alert.alert(
        'Choose a plan below',
        'The App Store or Google Play confirmation will show the exact amount before you approve it.',
      );
      return;
    }
    if (subscriptionGuard.blocked) {
      showSubscriptionOwnerGuard();
      return;
    }
    paywallSheetRef.current?.expand();
  }, [canBuyNativeSubscription, showSubscriptionOwnerGuard, subscriptionGuard.blocked]);

  const handleManageBilling = useCallback(async () => {
    // Preserve the subscription-owner boundary for recovery as well as plan
    // changes. An inactive App Store / Play Store subscription cannot be
    // repaired in AGI's Stripe portal, and sending it there risks a duplicate
    // purchase while the recorded store subscription still exists.
    // Stripe is AGI's own recorded Web billing owner, so its authenticated
    // portal is the correct recovery. Every other recorded owner must remain
    // at its own management surface (or fail closed when no verified listing
    // URL exists).
    if (subscriptionGuard.blocked && billingSource !== 'stripe') {
      showSubscriptionOwnerGuard();
      return;
    }
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
  }, [billingSource, showSubscriptionOwnerGuard, subscriptionGuard.blocked]);

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
            {!isFreeTier && isEntitled && periodEndLabel ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                {billingCancelsAtPeriodEnd ? 'Cancels' : 'Renews'} {periodEndLabel}
              </Text>
            ) : null}
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

      {isActiveStripePlan && (
        <>
          <SettingsInfo
            title="How plan upgrades are charged"
            body="For this Web-billed plan, a same-cadence upgrade shows the exact prorated charge for the rest of your current billing period before you confirm. Your renewal date stays the same, and your existing usage does not reset."
            icon={CreditCard}
          />
          <SettingsInfo
            title="Usage top-ups"
            body={`${TOP_UP_UNITS_PER_USD} units for every $1 of configured product value. The minimum top-up is $${MIN_TOP_UP_AMOUNT_USD} (${MINIMUM_TOP_UP_UNITS.toLocaleString('en-US')} units), and the ordinary self-serve maximum is $${MAX_TOP_UP_AMOUNT_USD}. The native store shows the actual localized price and applicable tax before approval. Top-ups do not change your plan or renewal date, and unused purchased balance carries across renewals for up to 12 months.`}
            icon={CreditCard}
          />
        </>
      )}

      {nativeIap.loading ? (
        <SettingsInfo
          title="Loading native purchases"
          body="Connecting securely to the App Store or Google Play."
          icon={ShoppingBag}
        />
      ) : nativeIap.catalog?.enabled ? (
        <>
          <SettingsInfo
            title="App Store and Google Play billing"
            body="The native store confirmation shows the localized price and the exact charge before you approve. Subscription upgrades use the store's plan-change and proration rules; AGI grants access only after the signed store transaction is verified."
            icon={ShoppingBag}
          />

          {canBuyNativeSubscription ? (
            <SettingsGroup>
              {nativeIap.catalog.products
                .filter((product) => product.kind === 'subscription')
                .map((product, index, products) => {
                  const storeProduct = nativeIap.storeProducts.get(product.productId);
                  const pricing = getBillingPlanPricing(product.planTier);
                  const busy = nativeIap.purchasingKey === product.key;
                  return (
                    <SettingsRow
                      key={product.key}
                      label={`${pricing.label} · ${product.interval}`}
                      value={
                        busy ? 'Opening store…' : (storeProduct?.displayPrice ?? 'Unavailable')
                      }
                      icon={CreditCard}
                      onPress={
                        storeProduct && !nativeIap.purchasingKey && !nativeIap.restoring
                          ? () => void nativeIap.purchase(product.key)
                          : undefined
                      }
                      isLast={index === products.length - 1}
                    />
                  );
                })}
            </SettingsGroup>
          ) : subscriptionGuard.blocked && billingSource !== nativeSubscriptionSource ? (
            <SettingsInfo
              title="Subscription managed elsewhere"
              body={`Your plan is managed through ${subscriptionGuard.sourceLabel}. Native subscription choices stay disabled to prevent a second recurring charge. Top-ups remain available below when eligible.`}
              icon={CreditCard}
            />
          ) : null}

          {canBuyNativeTopUp ? (
            <>
              <SettingsInfo
                title="Native usage top-ups"
                body={`${TOP_UP_UNITS_PER_USD} units per $1 of configured product value, with a $${MIN_TOP_UP_AMOUNT_USD} minimum. The store shows the actual localized price before purchase. Top-ups are consumable, do not change your renewal date, and are granted only once after server verification.`}
                icon={ShoppingBag}
              />
              <SettingsGroup>
                {nativeIap.catalog.products
                  .filter((product) => product.kind === 'top_up')
                  .map((product, index, products) => {
                    const storeProduct = nativeIap.storeProducts.get(product.productId);
                    const busy = nativeIap.purchasingKey === product.key;
                    return (
                      <SettingsRow
                        key={product.key}
                        label={`${product.units.toLocaleString('en-US')} units`}
                        value={
                          busy ? 'Opening store…' : (storeProduct?.displayPrice ?? 'Unavailable')
                        }
                        icon={ShoppingBag}
                        onPress={
                          storeProduct && !nativeIap.purchasingKey && !nativeIap.restoring
                            ? () => void nativeIap.purchase(product.key)
                            : undefined
                        }
                        isLast={index === products.length - 1}
                      />
                    );
                  })}
              </SettingsGroup>
            </>
          ) : null}

          <SettingsGroup>
            <SettingsRow
              label={nativeIap.restoring ? 'Restoring purchases…' : 'Restore purchases'}
              value="Subscriptions and unfinished purchases"
              icon={RefreshCw}
              onPress={
                nativeIap.connected && !nativeIap.restoring && !nativeIap.purchasingKey
                  ? () => void nativeIap.restore()
                  : undefined
              }
              isLast
            />
          </SettingsGroup>

          {nativeIap.error ? (
            <SettingsInfo
              title="Native purchase needs attention"
              body={nativeIap.error}
              icon={CreditCard}
            />
          ) : nativeIap.lastResult ? (
            <SettingsInfo
              title="Purchase verified"
              body={
                nativeIap.lastResult.kind === 'top_up'
                  ? `${(nativeIap.lastResult.unitsGranted ?? 0).toLocaleString('en-US')} units were added to your account.`
                  : 'Your subscription was verified and your plan has been refreshed.'
              }
              icon={Check}
            />
          ) : null}
        </>
      ) : (
        <SettingsInfo
          title="Native purchases are not configured"
          body={
            nativeIap.error ??
            nativeIap.catalog?.unavailableReason ??
            'Register the App Store and Google Play products for this build before purchases can be offered.'
          }
          icon={ShoppingBag}
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
          recoveryAction={paywallRecoveryAction}
          onPrimaryAction={
            paywallRecoveryAction === 'manage_billing' && FEATURES.billing
              ? handleManageBilling
              : undefined
          }
          primaryActionUnavailableMessage={paywallUnavailableMessage}
          onDismiss={() => paywallSheetRef.current?.close()}
        />
      ) : null}
    </SettingsScreenShell>
  );
}
