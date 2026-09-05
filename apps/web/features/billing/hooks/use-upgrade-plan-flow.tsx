'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '@shared/stores/web-auth-store';
import {
  UpgradePlanDialog,
  type UpgradeTarget,
} from '@/features/chat/components/dialogs/UpgradePlanDialog';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
} from '@features/billing/services/stripe-payments';
import { billingOwnerPlanChangeMessage } from '@features/billing/lib/subscription-owner-presentation';
import { toUserMessage } from '@/lib/user-error-message';
import {
  isBasicPlanTier,
  isProPlanTier,
  isMaxPlanTier,
  isMax15xPlanTier,
} from '@agiworkforce/types';

export type { UpgradeTarget };

interface UseUpgradePlanFlowOptions {
  user: { id: string; email?: string | null } | null | undefined;
  subscription: SubscriptionPlan | null | undefined;
  currentTier?: string;
  billingPolicyReady: boolean;
  openSettings: (tab: string) => void;
}

/**
 * Shared between WebChatPage's and WebAppShell's account menus so the
 * upgrade flow, dialog, mid-cycle confirm, and the real Stripe checkout call
 *, cannot drift between the two surfaces.
 */
export function useUpgradePlanFlow({
  user,
  subscription,
  currentTier,
  billingPolicyReady,
  openSettings,
}: UseUpgradePlanFlowOptions) {
  const [upgradePlanOpen, setUpgradePlanOpen] = useState(false);
  const [upgradePlanTarget, setUpgradePlanTarget] = useState<UpgradeTarget | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);

  // Managed cloud is open by default: a signed-in user already reaches it.
  // The upgrade dialog only sells higher hosted capacity, it is not an access
  // gate, so opening it simply shows the plan comparison (no waitlist).
  const openUpgradeDialog = useCallback((targetTier: UpgradeTarget | null = null) => {
    setUpgradePlanTarget(targetTier);
    setUpgradePlanOpen(true);
  }, []);

  // Route the upgrade CTA to the real Stripe checkout flow (same service the
  // billing dashboard uses). No waitlist email capture.
  const handleUpgradePlan = useCallback(
    async (plan: UpgradeTarget, annual: boolean) => {
      if (!user) {
        toast.error('Please sign in to upgrade.');
        return;
      }
      setUpgradePlanOpen(false);
      setUpgradePlanTarget(null);
      const billingPeriod = annual ? 'yearly' : 'monthly';
      const hasActivePaidPlan =
        subscription != null &&
        !['free', 'local-only', 'byok'].includes(subscription.tier) &&
        ['active', 'trialing'].includes(subscription.status);
      // A mid-cycle upgrade charges the saved card immediately with no Stripe
      // screen, so confirm the exact prorated amount first instead of charging
      // silently. UpgradeConfirmDialog owns the preview + the actual charge.
      if (hasActivePaidPlan) {
        if (!billingPolicyReady) {
          toast.error('Billing details are still loading. Please try again in a moment.');
          return;
        }
        if (subscription?.subscription_source !== 'stripe') {
          toast.error(billingOwnerPlanChangeMessage(subscription?.subscription_source));
          openSettings('billing');
          return;
        }
        setUpgradeConfirm({ plan, billingInterval: billingPeriod });
        return;
      }
      const toastId = toast.loading('Redirecting to checkout...');
      try {
        if (isBasicPlanTier(plan)) {
          await upgradeToBasicPlan({ userId: user.id, userEmail: user.email || '' });
        } else if (isProPlanTier(plan)) {
          await upgradeToProPlan({
            userId: user.id,
            userEmail: user.email || '',
            billingPeriod,
          });
        } else if (isMaxPlanTier(plan)) {
          await upgradeToMaxPlan({
            userId: user.id,
            userEmail: user.email || '',
            billingPeriod: 'monthly',
          });
        } else if (isMax15xPlanTier(plan)) {
          await upgradeToMax15xPlan({ userId: user.id, userEmail: user.email || '' });
        }
        // On success the service redirects to Stripe; the dismiss below only
        // runs if navigation has not yet replaced the page.
        toast.dismiss(toastId);
      } catch (err) {
        toast.dismiss(toastId);
        toast.error(toUserMessage(err, 'Failed to start checkout.'));
      }
    },
    [billingPolicyReady, openSettings, subscription, user],
  );

  const upgradeDialogs = (
    <>
      <UpgradePlanDialog
        open={upgradePlanOpen}
        onOpenChange={(open) => {
          setUpgradePlanOpen(open);
          if (!open) setUpgradePlanTarget(null);
        }}
        currentTier={currentTier}
        targetTier={upgradePlanTarget}
        onUpgrade={(plan, annual) => void handleUpgradePlan(plan, annual)}
      />
      <UpgradeConfirmDialog
        request={upgradeConfirm}
        onCancel={() => setUpgradeConfirm(null)}
        onConfirmed={() => {
          setUpgradeConfirm(null);
          toast.success('Your plan has been upgraded.');
        }}
      />
    </>
  );

  return { openUpgradeDialog, upgradeDialogs };
}
