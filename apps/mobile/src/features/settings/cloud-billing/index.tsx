import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CreditCard,
  ExternalLink,
  RefreshCw,
  ShoppingBag,
  CircleHelp,
  Check,
  Clock,
  Coins,
  ListChecks,
} from 'lucide-react-native';
import { AgiMark } from '@/components/ui/AgiMark';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import {
  MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES,
  canUseBillingPlanCapability,
  formatCredits,
  getBillingPlanPricing,
  getMobileIapProductDefinition,
  getNextUpgradeTier,
  isEntitledSubscriptionStatus,
  isSelfServeIndividualPlanTier,
  mobileIapPlanChangeDirection,
  type MobileIapCatalogProduct,
  type MobileIapProductKey,
} from '@agiworkforce/types';
import { useTierStore } from '@/src/features/billing/store';
import { fetchPortalSessionUrl } from '@/src/features/billing/service';
import { API_URL } from '@/lib/constants';
import { openExternalUrl } from '@/lib/safeOpenURL';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  billingManagementTarget,
  getSubscriptionOwnerGuard,
} from '@/src/features/billing/subscriptionSource';
import { useMobileIap, type MobileIapRestoreOutcome } from '@/src/features/billing/useMobileIap';
import { useWebBillingLinksAllowed } from '@/src/features/billing/webBillingLinks';
import { storeDisplayName } from '@/src/features/release-state';
import { ApiHttpError } from '@/services/apiErrors';
import { billingRequestMessage } from '@/src/features/billing/mobileIapService';

const PURCHASE_HELP_URL = 'https://agiworkforce.com/help?q=purchase+billing+credits+refund';

const AUTO_RENEWAL_TERMS: Readonly<Record<'apple' | 'google', string>> = {
  apple:
    'Renews automatically until canceled. Cancel at least 24 hours before renewal in your Apple Account settings.',
  google: 'Renews automatically until canceled. Cancel any time in Google Play subscriptions.',
};

function portalErrorTitle(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'waitlist_access_required') return 'Upgrade access needed';
    if (error.status === 409) return 'Billing managed elsewhere';
  }
  return 'Billing portal unavailable';
}

type StoreSubscriptionProduct = Extract<MobileIapCatalogProduct, { kind: 'subscription' }>;
type StoreTopUpProduct = Extract<MobileIapCatalogProduct, { kind: 'top_up' }>;

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

const RESTORE_OUTCOME_COPY: Record<MobileIapRestoreOutcome, { title: string; body: string }> = {
  'nothing-to-restore': {
    title: 'No purchases to restore',
    body: 'The store has no active subscriptions or unfinished purchases for this account.',
  },
  'already-restored': {
    title: 'Purchases already restored',
    body: 'Everything the store returned is already on your account.',
  },
  'store-unavailable': {
    title: 'Restore purchases needs the store',
    body: 'Sign in to AGI Cloud and connect to the store before restoring purchases.',
  },
};

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
  const webBillingLinksAllowed = useWebBillingLinksAllowed();

  useEffect(() => {
    if (isClerkSignedIn && isCloudModeActive) void refreshTier();
  }, [isClerkSignedIn, isCloudModeActive, refreshTier]);

  const [portalLoading, setPortalLoading] = useState(false);
  const paywallSheetRef = useRef<BottomSheet>(null);

  const tierLabel = getBillingPlanPricing(billingTier).label;
  const isFreeTier = billingTier === 'free';
  const isEntitled = isEntitledSubscriptionStatus(billingStatus);
  const isTrialing = billingStatus === 'trialing';
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
  const subscriptionGuard = getSubscriptionOwnerGuard(
    billingSource,
    billingStatus,
    webBillingLinksAllowed,
  );
  const managementTarget = billingManagementTarget({
    source: billingSource,
    portalEnabled: FEATURES.billing,
    webBillingLinksAllowed,
  });
  const billingManagedOnWeb =
    !webBillingLinksAllowed &&
    !isFreeTier &&
    (billingSource === 'stripe' || billingSource === 'manual');
  // The row needs somewhere real to go. Recovery from the paywall may instead
  // name the platform that owns the subscription, which is an answer even when
  // this app cannot act on it.
  const canRecoverBilling = managementTarget !== null || subscriptionGuard.blocked;
  const isActiveStripePlan = billingSource === 'stripe' && !isFreeTier && isEntitled;
  const renewsThroughStore =
    (billingSource === 'apple' || billingSource === 'google') &&
    !isFreeTier &&
    isEntitled &&
    !billingCancelsAtPeriodEnd;
  const nativeSubscriptionSource =
    nativeIap.catalog?.platform === 'ios'
      ? 'apple'
      : nativeIap.catalog?.platform === 'android'
        ? 'google'
        : null;
  const managedElsewhere = subscriptionGuard.blocked && billingSource !== nativeSubscriptionSource;
  const plansWithheldReason = nativeIap.catalog?.subscriptionsUnavailableReason ?? null;
  const canBuyNativeSubscription =
    nativeIap.catalog?.enabled === true &&
    !isWorkspacePlan &&
    plansWithheldReason === null &&
    !managedElsewhere;
  const storeProducts = nativeIap.catalog?.enabled ? nativeIap.catalog.products : [];
  const subscriptionProducts = storeProducts.filter(
    (product): product is StoreSubscriptionProduct => product.kind === 'subscription',
  );
  const topUpProducts = storeProducts.filter(
    (product): product is StoreTopUpProduct => product.kind === 'top_up',
  );
  const storeName =
    (nativeSubscriptionSource ? storeDisplayName(nativeSubscriptionSource) : null) ?? 'the store';
  const holdsStorePlan =
    billingSource === nativeSubscriptionSource &&
    !isFreeTier &&
    isEntitled &&
    isSelfServeIndividualPlanTier(billingTier);
  const downgradeWaitsForRenewal =
    nativeIap.catalog?.platform !== 'android' ||
    (nativeIap.catalog.androidReplacementModes ?? MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES)
      .downgrade === 'deferred';
  const scheduledDefinition = nativeIap.scheduledProductKey
    ? getMobileIapProductDefinition(nativeIap.scheduledProductKey)
    : null;
  const scheduledTier =
    nativeIap.lastResult?.scheduledPlanTier ??
    (scheduledDefinition?.kind === 'subscription' ? scheduledDefinition.planTier : null);
  const scheduledTierLabel = scheduledTier ? getBillingPlanPricing(scheduledTier).label : null;
  const isAwaitingApproval = nativeIap.awaitingApproval.size > 0;
  const paywallRecoveryAction = isFreeTier
    ? 'subscribe'
    : isEntitled
      ? 'upgrade'
      : 'manage_billing';
  const paywallUnavailableMessage =
    paywallRecoveryAction === 'manage_billing'
      ? "Billing management isn't available in this app right now. Try again later."
      : "Plan changes aren't available in this app right now.";
  // A plan change is either possible or says so before the tap, never as a sheet
  // whose only content is an apology.
  const canChangePlanInApp = canBuyNativeSubscription || subscriptionGuard.blocked;

  const purchaseFromStore = useCallback(
    (key: MobileIapProductKey) => {
      if (!nativeIap.awaitingApproval.has(key)) {
        void nativeIap.purchase(key);
        return;
      }
      Alert.alert(
        'This purchase is already waiting',
        `${storeName.charAt(0).toUpperCase()}${storeName.slice(1)} hasn’t confirmed your first request yet, and asking again could charge you twice.`,
        [
          { text: 'Keep waiting', style: 'cancel' },
          { text: 'Ask again', onPress: () => void nativeIap.purchase(key) },
        ],
      );
    },
    [nativeIap, storeName],
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
      `This subscription is billed through ${subscriptionGuard.sourceLabel}; manage it there to avoid paying twice.`,
      buttons,
    );
  }, [subscriptionGuard]);

  const handleUpgrade = useCallback(() => {
    if (canBuyNativeSubscription) {
      Alert.alert('Choose a plan below', 'The store shows the exact price before you pay.');
      return;
    }
    if (subscriptionGuard.blocked) {
      showSubscriptionOwnerGuard();
      return;
    }
    paywallSheetRef.current?.expand();
  }, [canBuyNativeSubscription, showSubscriptionOwnerGuard, subscriptionGuard.blocked]);

  const handleManageBilling = useCallback(async () => {
    if (!managementTarget) {
      showSubscriptionOwnerGuard();
      return;
    }
    if (managementTarget.kind === 'external') {
      await openExternalUrl(managementTarget.url);
      return;
    }
    setPortalLoading(true);
    try {
      const url = await fetchPortalSessionUrl();
      await openExternalUrl(url);
    } catch (error) {
      Alert.alert(portalErrorTitle(error), billingRequestMessage(error, 'Please try again later.'));
    } finally {
      setPortalLoading(false);
    }
  }, [managementTarget, showSubscriptionOwnerGuard]);

  const handleSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-billing'));
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
            ? 'You are on the Free plan.'
            : isEntitled
              ? `You are on the ${tierLabel} plan.`
              : `Your ${tierLabel} subscription is ${statusLabel}. Paid capabilities are unavailable.`
        }
        icon={CreditCard}
      />

      {nextUpgradeTier && !isWorkspacePlan && !canChangePlanInApp && !nativeIap.loading ? (
        <SettingsInfo
          title={
            isFreeTier
              ? 'In-app purchases are not available yet'
              : 'Plan changes are not available right now'
          }
          body={
            isFreeTier
              ? 'Your Free plan keeps working. Compare plans to see what each one adds.'
              : 'Everything you already pay for keeps working here.'
          }
          icon={ShoppingBag}
        />
      ) : null}

      {!isCloudModeActive && <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />}

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
        <View
          style={{
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textMuted,
              fontSize: typeScale.caption,
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Current Plan
          </Text>
        </View>

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
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '700' }}
            >
              {isFreeTier ? 'Free plan' : `${tierLabel} plan`}
            </Text>
            {isFreeTier && (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginTop: 2 }}>
                Try AGI Cloud
              </Text>
            )}
            {!isFreeTier && !isEntitled && (
              <Text
                style={{
                  color: colors.agentWarning,
                  fontSize: typeScale.footnote,
                  marginTop: 2,
                  textTransform: 'capitalize',
                }}
              >
                {statusLabel}
              </Text>
            )}
            {!isFreeTier && isEntitled && periodEndLabel ? (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginTop: 2 }}>
                {billingCancelsAtPeriodEnd
                  ? `Access ends ${periodEndLabel}. You keep ${tierLabel} until then.`
                  : isTrialing
                    ? `Free trial ends ${periodEndLabel}, then renews unless you cancel.`
                    : `Renews ${periodEndLabel}`}
              </Text>
            ) : null}
          </View>
        </View>

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
              icon={ShoppingBag}
              value={canChangePlanInApp ? undefined : 'Unavailable in the app'}
              onPress={canChangePlanInApp ? handleUpgrade : undefined}
            />
          ) : null}
          {!isWorkspacePlan ? (
            <SettingsRow
              label="Compare plans"
              icon={ListChecks}
              onPress={() =>
                router.push('/(app)/settings/plans' as Parameters<typeof router.push>[0])
              }
              isLast={isFreeTier || (!managementTarget && !billingManagedOnWeb)}
            />
          ) : null}
          {isWorkspacePlan ? (
            <SettingsRow
              label="Workspace administration"
              icon={webBillingLinksAllowed ? ExternalLink : CreditCard}
              value={webBillingLinksAllowed ? undefined : 'Managed on the web'}
              onPress={
                webBillingLinksAllowed
                  ? () => void openExternalUrl('https://agiworkforce.com/settings/team')
                  : undefined
              }
              isLast={isFreeTier || (!managementTarget && !billingManagedOnWeb)}
            />
          ) : null}
          {!isFreeTier && managementTarget ? (
            <SettingsRow
              label={
                managementTarget.kind === 'external'
                  ? managementTarget.label
                  : portalLoading
                    ? 'Opening portal…'
                    : 'Manage billing'
              }
              icon={managementTarget.kind === 'external' ? ExternalLink : CreditCard}
              onPress={portalLoading ? undefined : () => void handleManageBilling()}
              isLast
            />
          ) : null}
          {billingManagedOnWeb ? (
            <SettingsRow
              label="Billing"
              icon={CreditCard}
              value={billingSource === 'manual' ? 'By your organization' : 'Managed on the web'}
              isLast
            />
          ) : null}
        </View>
      </View>

      {renewsThroughStore ? (
        <SettingsInfo
          title="Deleting this app does not cancel your plan"
          body={
            managementTarget?.kind === 'external'
              ? `Your plan renews through ${subscriptionGuard.sourceLabel} until you cancel it there. To cancel, tap ${managementTarget.label} above.`
              : "Your plan renews through the store you bought it from until you cancel it in that store's subscription settings."
          }
          icon={ShoppingBag}
        />
      ) : null}

      {isActiveStripePlan && webBillingLinksAllowed ? (
        <SettingsInfo
          title="This plan is billed outside the app"
          body={`Change or cancel ${tierLabel} with the manage option above.`}
          icon={CreditCard}
        />
      ) : null}

      {isAwaitingApproval ? (
        <SettingsInfo
          title="Waiting for the store"
          body={`It’s added to your account once ${storeName} confirms it, even if the app is closed.`}
          icon={Clock}
        />
      ) : null}

      {scheduledTierLabel ? (
        <SettingsInfo
          title={`Changing to ${scheduledTierLabel} at renewal`}
          body={
            periodEndLabel
              ? `You keep ${tierLabel} until ${periodEndLabel}. ${scheduledTierLabel} starts then.`
              : `You keep ${tierLabel} until your current period ends. ${scheduledTierLabel} starts then.`
          }
          icon={Clock}
        />
      ) : null}

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
            body="The store shows the exact charge before you approve."
            icon={ShoppingBag}
          />

          {canBuyNativeSubscription && holdsStorePlan ? (
            <SettingsInfo
              title="Changing your plan"
              body={
                downgradeWaitsForRenewal
                  ? `Upgrades start right away; downgrades start at renewal, and you keep ${tierLabel} until then.`
                  : `A plan change starts right away, and ${storeName} shows the exact charge before you confirm.`
              }
              icon={CreditCard}
            />
          ) : null}

          {canBuyNativeSubscription ? (
            <>
              <SettingsGroup>
                {subscriptionProducts.map((product, index, products) => {
                  const storeProduct = nativeIap.storeProducts.get(product.productId);
                  const pricing = getBillingPlanPricing(product.planTier);
                  const busy = nativeIap.purchasingKey === product.key;
                  const waiting = nativeIap.awaitingApproval.has(product.key);
                  const direction =
                    holdsStorePlan && isSelfServeIndividualPlanTier(billingTier)
                      ? mobileIapPlanChangeDirection(billingTier, product.planTier)
                      : null;
                  const isCurrentPlan = holdsStorePlan && billingTier === product.planTier;
                  const priceLabel = nativeIap.priceFor(product.key).label;
                  return (
                    <SettingsRow
                      key={product.key}
                      label={`${pricing.label} · ${product.interval}`}
                      value={
                        busy
                          ? 'Opening store…'
                          : isCurrentPlan
                            ? 'Current plan'
                            : waiting
                              ? 'Waiting for approval'
                              : !priceLabel
                                ? 'Unavailable'
                                : direction === 'upgrade'
                                  ? `Upgrade · ${priceLabel}`
                                  : direction === 'downgrade'
                                    ? `Downgrade · ${priceLabel}`
                                    : priceLabel
                      }
                      icon={CreditCard}
                      onPress={
                        storeProduct &&
                        priceLabel &&
                        !isCurrentPlan &&
                        !nativeIap.purchasingKey &&
                        !nativeIap.restoring
                          ? () => purchaseFromStore(product.key)
                          : undefined
                      }
                      isLast={index === products.length - 1}
                    />
                  );
                })}
              </SettingsGroup>
              {nativeSubscriptionSource ? (
                <SettingsInfo
                  title="Auto-renews"
                  body={AUTO_RENEWAL_TERMS[nativeSubscriptionSource]}
                  icon={RefreshCw}
                />
              ) : null}
              <SettingsGroup>
                <SettingsRow
                  label="Terms of Use"
                  icon={ExternalLink}
                  onPress={() => void openExternalUrl(new URL('/terms', API_URL).toString())}
                />
                <SettingsRow
                  label="Privacy Policy"
                  icon={ExternalLink}
                  onPress={() => void openExternalUrl(new URL('/privacy', API_URL).toString())}
                  isLast
                />
              </SettingsGroup>
            </>
          ) : managedElsewhere || plansWithheldReason ? (
            <SettingsInfo
              title="Subscription managed elsewhere"
              body={
                managedElsewhere
                  ? `Your plan is managed through ${subscriptionGuard.sourceLabel}, so in-app plans are off.`
                  : (plansWithheldReason ?? '')
              }
              icon={CreditCard}
            />
          ) : null}

          {topUpProducts.length > 0 ? (
            <>
              <SettingsInfo
                title="Usage top-ups"
                body="Credits add to your plan and don't expire."
                icon={Coins}
              />
              <SettingsGroup>
                {topUpProducts.map((product, index, products) => {
                  const storeProduct = nativeIap.storeProducts.get(product.productId);
                  const busy = nativeIap.purchasingKey === product.key;
                  const priceLabel = nativeIap.priceFor(product.key).label;
                  return (
                    <SettingsRow
                      key={product.key}
                      label={formatCredits(product.units)}
                      value={
                        busy
                          ? 'Opening store…'
                          : nativeIap.awaitingApproval.has(product.key)
                            ? 'Waiting for approval'
                            : (priceLabel ?? 'Unavailable')
                      }
                      icon={Coins}
                      onPress={
                        storeProduct &&
                        priceLabel &&
                        !nativeIap.purchasingKey &&
                        !nativeIap.restoring
                          ? () => purchaseFromStore(product.key)
                          : undefined
                      }
                      isLast={index === products.length - 1}
                    />
                  );
                })}
              </SettingsGroup>
            </>
          ) : null}
        </>
      ) : (
        <SettingsInfo
          title="Purchases are not available right now"
          body={
            nativeIap.error ??
            nativeIap.catalog?.unavailableReason ??
            'Plans and credits cannot be bought in the app at the moment. Nothing was charged.'
          }
          icon={ShoppingBag}
        />
      )}

      <SettingsGroup>
        <SettingsRow
          label={nativeIap.restoring ? 'Restoring purchases…' : 'Restore purchases'}
          value="Subscriptions and unfinished purchases"
          icon={RefreshCw}
          onPress={
            !nativeIap.restoring && !nativeIap.purchasingKey
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
              ? `${formatCredits(nativeIap.lastResult.unitsGranted ?? 0)} were added to your account.`
              : nativeIap.lastResult.scheduledPlanTier
                ? `Your change to ${getBillingPlanPricing(nativeIap.lastResult.scheduledPlanTier).label} is confirmed and starts at your next renewal.`
                : 'Your subscription was verified and your plan has been refreshed.'
          }
          icon={Check}
        />
      ) : nativeIap.restoreOutcome ? (
        <SettingsInfo
          title={RESTORE_OUTCOME_COPY[nativeIap.restoreOutcome].title}
          body={RESTORE_OUTCOME_COPY[nativeIap.restoreOutcome].body}
          icon={nativeIap.restoreOutcome === 'store-unavailable' ? CreditCard : ShoppingBag}
        />
      ) : null}

      <SettingsGroup>
        {billingSource === 'stripe' && !isFreeTier ? (
          <SettingsRow
            label={webBillingLinksAllowed ? 'View invoices' : 'Invoices'}
            icon={webBillingLinksAllowed ? ExternalLink : CreditCard}
            value={webBillingLinksAllowed ? undefined : 'On the web'}
            onPress={
              webBillingLinksAllowed
                ? () => void openExternalUrl('https://agiworkforce.com/billing')
                : undefined
            }
          />
        ) : null}
        <SettingsRow
          label="Help with a purchase"
          value="Charged twice, missing credits, refunds"
          icon={CircleHelp}
          onPress={
            webBillingLinksAllowed
              ? () => void openExternalUrl(PURCHASE_HELP_URL)
              : () => router.push('/(app)/support' as Parameters<typeof router.push>[0])
          }
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="A purchase that did not arrive"
        body="Restore purchases re-checks it with the store and never charges you again."
        icon={ShoppingBag}
      />

      {nextUpgradeTier ? (
        <PaywallBottomSheet
          ref={paywallSheetRef}
          feature="general_upgrade"
          requiredTier={nextUpgradeTier}
          recoveryAction={paywallRecoveryAction}
          onPrimaryAction={
            paywallRecoveryAction === 'manage_billing' && canRecoverBilling
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
