'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '@shared/stores/web-auth-store';
import {
  UpgradePlanDialog,
  type UpgradeAction,
  type UpgradeTarget,
} from '@/features/chat/components/dialogs/UpgradePlanDialog';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import {
  UpgradeAccessRequiredError,
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
} from '@features/billing/services/stripe-payments';
import { billingOwnerPlanChangeMessage } from '@features/billing/lib/subscription-owner-presentation';
import { toUserMessage } from '@/lib/user-error-message';
import { UpgradeWaitlistDialog } from '@features/billing/components/UpgradeWaitlistDialog';
import type { UpgradeWaitlistRequest } from '@features/billing/services/upgrade-waitlist';
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
  const [waitlist, setWaitlist] = useState<{
    request: UpgradeWaitlistRequest;
    join: boolean;
  } | null>(null);
  const hasActivePaidPlan =
    subscription != null &&
    !['free', 'local-only', 'byok'].includes(subscription.tier) &&
    ['active', 'trialing'].includes(subscription.status);

  const openUpgradeDialog = useCallback((targetTier: UpgradeTarget | null = null) => {
    setUpgradePlanTarget(targetTier);
    setUpgradePlanOpen(true);
  }, []);

  const startCheckout = useCallback(
    async (request: UpgradeWaitlistRequest) => {
      if (!user) throw new Error('Please sign in to upgrade.');
      const toastId = toast.loading('Redirecting to checkout...');
      try {
        if (isBasicPlanTier(request.plan)) {
          await upgradeToBasicPlan();
        } else if (isProPlanTier(request.plan)) {
          await upgradeToProPlan();
        } else if (isMaxPlanTier(request.plan)) {
          await upgradeToMaxPlan();
        } else if (isMax15xPlanTier(request.plan)) {
          await upgradeToMax15xPlan();
        }
        toast.dismiss(toastId);
      } catch (error) {
        toast.dismiss(toastId);
        throw error;
      }
    },
    [user],
  );

  const handleUpgradePlan = useCallback(
    async (plan: UpgradeTarget, action: UpgradeAction) => {
      if (!user) {
        toast.error('Please sign in to upgrade.');
        return;
      }
      setUpgradePlanOpen(false);
      setUpgradePlanTarget(null);
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
        setUpgradeConfirm({ plan, billingInterval: 'monthly' });
        return;
      }
      const request: UpgradeWaitlistRequest = { plan, billingInterval: 'monthly' };
      if (action !== 'checkout') {
        setWaitlist({ request, join: action === 'join-waitlist' });
        return;
      }
      try {
        await startCheckout(request);
      } catch (error) {
        if (error instanceof UpgradeAccessRequiredError) {
          setWaitlist({ request, join: false });
          return;
        }
        toast.error(toUserMessage(error, 'Failed to start checkout.'));
      }
    },
    [billingPolicyReady, hasActivePaidPlan, openSettings, startCheckout, subscription, user],
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
        waitlistApplies={!hasActivePaidPlan}
        onUpgrade={(plan, action) => void handleUpgradePlan(plan, action)}
      />
      <UpgradeConfirmDialog
        request={upgradeConfirm}
        onCancel={() => setUpgradeConfirm(null)}
        onConfirmed={() => {
          setUpgradeConfirm(null);
          toast.success('Your plan has been upgraded.');
        }}
      />
      <UpgradeWaitlistDialog
        request={waitlist?.request ?? null}
        joinOnOpen={waitlist?.join ?? false}
        onClose={() => setWaitlist(null)}
        onAccessGranted={async (request) => {
          try {
            await startCheckout(request);
          } catch (error) {
            toast.error(toUserMessage(error, 'Failed to start checkout.'));
            throw error;
          }
        }}
      />
    </>
  );

  return { openUpgradeDialog, upgradeDialogs };
}
