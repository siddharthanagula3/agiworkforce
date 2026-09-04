import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/Dialog';
import { PlanCard } from './PlanCard';
import {
  isFreePlan,
  isPlanSelectableOnSurface,
  isSelfServePaidPlanTier,
  normalizeUIPlanTier,
  tierAtLeast,
  type UIPlanTier,
} from '@agiworkforce/types';
import { selectPlan, useAuthStore } from '../../stores/auth';
import { WEB_APP_URL } from '../../api/config';
import { openExternalUrl } from '../../utils/navigation';
import {
  DesktopUpgradeConfirmDialog,
  type DesktopUpgradeRequest,
} from './DesktopUpgradeConfirmDialog';
import { useState } from 'react';
import { openBillingPortal } from '../../lib/stripeCheckout';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { getDesktopSubscriptionOwnerPolicy } from '../../lib/subscriptionOwnership';

export interface PlansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIER_ORDER: UIPlanTier[] = ['local', 'byok', 'free', 'basic', 'pro', 'max', 'max_15x'];

const VISIBLE_TIERS = TIER_ORDER.filter((tier) =>
  isPlanSelectableOnSurface(tier === 'local' ? 'local-only' : tier, 'desktop'),
);

function legacyToUIPlanTier(raw: string | null | undefined): UIPlanTier | null {
  return raw ? normalizeUIPlanTier(raw, 'byok') : null;
}

export function PlansModal({ open, onOpenChange }: PlansModalProps) {
  const rawPlan = useAuthStore(selectPlan);
  const subscriptionSource = useAuthStore((state) => state.subscriptionSource);
  const subscriptionStatus = useAuthStore((state) => state.subscriptionStatus);
  const subscriptionFetchStatus = useAuthStore((state) => state.subscriptionFetchStatus);
  const currentTier = legacyToUIPlanTier(rawPlan);
  const ownerPolicy = getDesktopSubscriptionOwnerPolicy(
    subscriptionSource,
    subscriptionStatus,
    subscriptionFetchStatus === 'succeeded',
  );
  const [upgradeRequest, setUpgradeRequest] = useState<DesktopUpgradeRequest | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  async function handleCtaClick(tier: UIPlanTier) {
    if (billingBusy) return;
    setBillingError(null);
    if (!currentTier) {
      setBillingError(
        'Your current Cloud plan is still loading. Retry when account sync finishes.',
      );
      return;
    }
    if (isFreePlan(tier)) {
      return;
    }

    if (isSelfServePaidPlanTier(tier)) {
      if (!ownerPolicy.canStartStripePlanChange) {
        setBillingError(
          ownerPolicy.stripeActionBlockedReason ??
            'This subscription cannot be changed through Stripe.',
        );
        return;
      }
      if (
        ownerPolicy.canOpenStripePortal &&
        !isFreePlan(currentTier) &&
        (!isSelfServePaidPlanTier(currentTier) || tierAtLeast(currentTier, tier))
      ) {
        setBillingBusy(true);
        try {
          const error = await openBillingPortal(async () => {
            await cloudAccountAuth.refreshUserData();
          });
          if (error) setBillingError(error);
        } catch (error) {
          setBillingError(error instanceof Error ? error.message : 'Could not open billing.');
        } finally {
          setBillingBusy(false);
        }
        return;
      }
      setUpgradeRequest({
        tier,
        interval: 'monthly',
      });
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setUpgradeRequest(null);
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="sm:max-w-4xl w-full p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  Plans &amp; Pricing
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  AGI Workforce, Beyond one model. Beyond one surface.{' '}
                  <span className="font-medium">Local and BYOK are always free.</span>
                </DialogDescription>
              </div>
              {/* Radix provides a built-in close button; we also add an explicit one for clarity */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="ml-4 shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Close plans modal"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </DialogHeader>

          {/* Tier grid */}
          <div className="p-6 overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {VISIBLE_TIERS.map((tier) => (
                <PlanCard
                  key={tier}
                  tier={tier}
                  isCurrentPlan={tier === currentTier}
                  isLowerPaidTier={
                    currentTier !== null &&
                    isSelfServePaidPlanTier(tier) &&
                    tier !== currentTier &&
                    !isFreePlan(currentTier) &&
                    (!isSelfServePaidPlanTier(currentTier) || tierAtLeast(currentTier, tier))
                  }
                  actionDisabled={
                    isSelfServePaidPlanTier(tier) && !ownerPolicy.canStartStripePlanChange
                  }
                  {...(ownerPolicy.stripeActionBlockedReason
                    ? { actionDisabledReason: ownerPolicy.stripeActionBlockedReason }
                    : {})}
                  onCtaClick={(selectedTier) => void handleCtaClick(selectedTier)}
                />
              ))}
            </div>

            {billingError ? (
              <p className="mt-4 text-center text-xs text-red-500">{billingError}</p>
            ) : null}
            {!currentTier ? (
              <p role="status" className="mt-4 text-center text-xs text-muted-foreground">
                Checking your current Cloud plan…
              </p>
            ) : null}
            {currentTier && subscriptionStatus !== 'none' ? (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
                <p className="text-xs font-medium text-foreground">
                  Billing owner: {ownerPolicy.sourceLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{ownerPolicy.description}</p>
              </div>
            ) : null}

            {/* Footer note */}
            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              AGI Cloud is in public alpha, no invite needed, available on desktop, web, and mobile.
              Local and BYOK also work on desktop and stay on your device. Paid upgrades show the
              exact charge before confirmation.{' '}
              <button
                type="button"
                onClick={() => void openExternalUrl(`${WEB_APP_URL}/contact-sales`)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Enterprise? Contact sales
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <DesktopUpgradeConfirmDialog
        request={upgradeRequest}
        onCancel={() => setUpgradeRequest(null)}
        onComplete={() => {
          setUpgradeRequest(null);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export function openPlansModal() {
  window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }));
}
