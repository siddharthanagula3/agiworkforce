import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, TextInput } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import {
  CreditCard,
  ExternalLink,
  FileText,
  RefreshCw,
  ShoppingBag,
  CircleHelp,
  Check,
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
  canUseBillingPlanCapability,
  formatCredits,
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
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import {
  billingManagementTarget,
  getSubscriptionOwnerGuard,
} from '@/src/features/billing/subscriptionSource';
import { useMobileIap } from '@/src/features/billing/useMobileIap';
import { ApiHttpError } from '@/services/apiErrors';
import {
  billingRequestMessage,
  joinBillingUpgradeWaitlist,
  redeemBillingUpgradeCode,
} from '@/src/features/billing/mobileIapService';

const PURCHASE_HELP_URL = 'https://agiworkforce.com/help?q=purchase+billing+credits+refund';

function portalErrorTitle(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.code === 'waitlist_access_required') return 'Upgrade access needed';
    if (error.status === 409) return 'Billing managed elsewhere';
  }
  return 'Billing portal unavailable';
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
  const billingPeriodEnd = useTierStore((s) => s.billingPeriodEnd);
  const billingCancelsAtPeriodEnd = useTierStore((s) => s.billingCancelsAtPeriodEnd);
  const refreshTier = useTierStore((s) => s.refreshTier);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';
  const nativeIap = useMobileIap({
    enabled: isClerkLoaded && isClerkSignedIn && isCloudModeActive,
  });

  useEffect(() => {
    if (isClerkSignedIn && isCloudModeActive) void refreshTier();
  }, [isClerkSignedIn, isCloudModeActive, refreshTier]);

  const [portalLoading, setPortalLoading] = useState(false);
  const [upgradeCode, setUpgradeCode] = useState('');
  const [upgradeGateBusy, setUpgradeGateBusy] = useState(false);
  const [upgradeGateJoined, setUpgradeGateJoined] = useState(false);
  const [upgradeGateError, setUpgradeGateError] = useState<string | null>(null);
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
  const upgradeGateVisible = nativeIap.catalog?.unavailableCode === 'waitlist_access_required';
  const subscriptionGuard = getSubscriptionOwnerGuard(billingSource, billingStatus);
  const managementTarget = billingManagementTarget({
    source: billingSource,
    portalEnabled: FEATURES.billing,
  });
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
  const canBuyNativeSubscription =
    nativeIap.catalog?.enabled === true &&
    !isWorkspacePlan &&
    (!subscriptionGuard.blocked || billingSource === nativeSubscriptionSource);
  const paywallRecoveryAction = isFreeTier
    ? 'subscribe'
    : isEntitled
      ? 'upgrade'
      : 'manage_billing';
  const paywallUnavailableMessage =
    paywallRecoveryAction === 'manage_billing'
      ? "Billing management isn't available in the app yet. Please try again later."
      : "Plan changes aren't available in the app yet. Check back soon.";
  // Checklist rule 55: a plan change is either possible or it says so before the
  // tap. A row that opens a sheet whose only content is an apology is the
  // failure-after-effort this forbids (MOBILE-037).
  const canChangePlanInApp =
    canBuyNativeSubscription || subscriptionGuard.blocked || FEATURES.billing;

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

  const handleRedeemUpgradeCode = useCallback(async () => {
    setUpgradeGateBusy(true);
    setUpgradeGateError(null);
    try {
      await redeemBillingUpgradeCode(upgradeCode);
      setUpgradeCode('');
      await nativeIap.reload();
    } catch (error) {
      setUpgradeGateError(
        billingRequestMessage(error, 'Could not redeem this code. Check it and try again.'),
      );
    } finally {
      setUpgradeGateBusy(false);
    }
  }, [nativeIap, upgradeCode]);

  const handleJoinUpgradeWaitlist = useCallback(async () => {
    if (!nextUpgradeTier) return;
    setUpgradeGateBusy(true);
    setUpgradeGateError(null);
    try {
      await joinBillingUpgradeWaitlist(nextUpgradeTier);
      setUpgradeGateJoined(true);
    } catch (error) {
      setUpgradeGateError(billingRequestMessage(error, 'Could not join the waitlist. Try again.'));
    } finally {
      setUpgradeGateBusy(false);
    }
  }, [nextUpgradeTier]);

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

      {nextUpgradeTier && !isWorkspacePlan && !canChangePlanInApp && !upgradeGateVisible ? (
        <SettingsInfo
          title="Plan changes are not in this app yet"
          body="Your plan, invoices, and payment method are managed on agiworkforce.com. Everything you already pay for keeps working here."
          icon={ShoppingBag}
        />
      ) : null}

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
              label={
                upgradeGateVisible
                  ? 'Join upgrade waitlist'
                  : isFreeTier
                    ? 'Upgrade plan'
                    : isEntitled
                      ? 'Adjust plan'
                      : 'Choose plan'
              }
              icon={upgradeGateVisible ? ShoppingBag : ExternalLink}
              value={
                upgradeGateVisible
                  ? upgradeGateJoined
                    ? 'You’re on the waitlist'
                    : 'Or enter an access code below'
                  : canChangePlanInApp
                    ? undefined
                    : 'Unavailable in the app'
              }
              onPress={
                upgradeGateVisible
                  ? upgradeGateBusy || upgradeGateJoined
                    ? undefined
                    : () => void handleJoinUpgradeWaitlist()
                  : canChangePlanInApp
                    ? handleUpgrade
                    : undefined
              }
            />
          ) : null}
          {!isWorkspacePlan ? (
            <SettingsRow
              label="Compare plans"
              icon={ListChecks}
              onPress={() =>
                router.push('/(app)/settings/plans' as Parameters<typeof router.push>[0])
              }
              isLast={isFreeTier || !managementTarget}
            />
          ) : null}
          {isWorkspacePlan ? (
            <SettingsRow
              label="Workspace administration"
              icon={ExternalLink}
              onPress={() => void openExternalUrl('https://agiworkforce.com/settings/team')}
              isLast={isFreeTier || !managementTarget}
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

      {isActiveStripePlan && (
        <>
          <SettingsInfo
            title="How plan upgrades are charged"
            body="For this Web-billed plan, an upgrade shows the exact charge before you confirm: the new plan's price, minus a credit for the unused time on your current plan. It starts a new billing period that day, and your existing usage does not reset."
            icon={CreditCard}
          />
          <SettingsInfo
            title="Usage top-ups"
            body="Credits are bought on the web, in Settings, Billing. Top-ups do not change your plan or renewal date, and purchased credits don't expire unless the law where you bought them sets a limit."
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
                        busy
                          ? 'Opening store…'
                          : (nativeIap.priceFor(product.key).label ?? 'Unavailable')
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
              body={`Your plan is managed through ${subscriptionGuard.sourceLabel}. Native subscription choices stay disabled to prevent a second recurring charge.`}
              icon={CreditCard}
            />
          ) : null}
        </>
      ) : (
        <>
          <SettingsInfo
            title={
              upgradeGateVisible
                ? 'Paid upgrades are opening in stages'
                : 'Native purchases are not configured'
            }
            body={
              nativeIap.error ??
              nativeIap.catalog?.unavailableReason ??
              'Register the App Store and Google Play products for this build before purchases can be offered.'
            }
            icon={ShoppingBag}
          />
          {upgradeGateVisible ? (
            <View
              style={{
                borderRadius: 16,
                backgroundColor: colors.surfaceElevated,
                padding: 16,
                gap: 12,
                marginBottom: 24,
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '700' }}
              >
                Have an upgrade access code?
              </Text>
              <TextInput
                accessibilityLabel="Upgrade access code"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={50}
                value={upgradeCode}
                onChangeText={setUpgradeCode}
                placeholder="Enter access code"
                placeholderTextColor={colors.textMuted}
                style={{
                  color: colors.textPrimary,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  minHeight: 44,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unlock upgrades"
                disabled={upgradeGateBusy || upgradeCode.trim().length === 0}
                onPress={() => void handleRedeemUpgradeCode()}
                style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={{ color: colors.teal, fontWeight: '700' }}>
                  {upgradeGateBusy ? 'Checking…' : 'Unlock upgrades'}
                </Text>
              </Pressable>
              {upgradeGateError ? (
                <Text accessibilityRole="alert" style={{ color: colors.textPrimary }}>
                  {upgradeGateError}
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}

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
              ? `${formatCredits(nativeIap.lastResult.unitsGranted ?? 0)} were added to your account.`
              : 'Your subscription was verified and your plan has been refreshed.'
          }
          icon={Check}
        />
      ) : null}

      {/* Invoices */}
      <SettingsGroup>
        <SettingsRow
          label={isFreeTier ? 'No invoices yet' : 'View invoices'}
          icon={isFreeTier ? FileText : ExternalLink}
          onPress={
            isFreeTier ? undefined : () => void openExternalUrl('https://agiworkforce.com/billing')
          }
        />
        <SettingsRow
          label="Help with a purchase"
          value="Charged twice, missing credits, refunds"
          icon={CircleHelp}
          onPress={() => void openExternalUrl(PURCHASE_HELP_URL)}
          isLast
        />
      </SettingsGroup>

      <SettingsInfo
        title="A purchase that did not arrive"
        body="A store purchase is granted only after the receipt is verified with Apple or Google, so a charge can land before the credits do. Restore purchases re-sends the receipt and is safe to run more than once: it never charges you again. Refunds are handled by the store that took the payment, not in this app."
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
