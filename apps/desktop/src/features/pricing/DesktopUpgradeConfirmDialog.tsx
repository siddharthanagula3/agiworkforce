import { useEffect, useState } from 'react';
import type { BillingInterval, SelfServePaidPlanTier } from '@agiworkforce/types';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import {
  applyPlanUpgrade,
  openCheckout,
  openUpgradePayment,
  previewPlanUpgrade,
  waitForPlanActivation,
  type UpgradePreview,
} from '../../lib/stripeCheckout';
import { toast } from 'sonner';

export interface DesktopUpgradeRequest {
  tier: SelfServePaidPlanTier;
  interval: BillingInterval;
}

export interface DesktopUpgradeConfirmDialogProps {
  request: DesktopUpgradeRequest | null;
  onCancel: () => void;
  onComplete: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function DesktopUpgradeConfirmDialog({
  request,
  onCancel,
  onComplete,
}: DesktopUpgradeConfirmDialogProps) {
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);

  useEffect(() => {
    if (!request) {
      setPreview(null);
      setPreviewing(false);
      setConfirming(false);
      setError(null);
      setSyncPending(false);
      return;
    }
    let cancelled = false;
    setPreview(null);
    setError(null);
    setSyncPending(false);
    setPreviewing(true);
    void previewPlanUpgrade(request.tier, request.interval)
      .then((value) => {
        if (!cancelled) setPreview(value);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not calculate the upgrade.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  if (!request) return null;

  const pricing = BILLING_PLAN_PRICING[request.tier];
  const recurringInterval = request.interval === 'yearly' ? 'year' : 'month';

  const confirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      if (preview.kind === 'checkout-required') {
        const checkoutError = await openCheckout(request.tier, request.interval, async () => {
          const activated = await waitForPlanActivation(request.tier);
          if (activated) {
            toast.success(`${pricing.label} is now active`);
          } else {
            toast.info('Billing closed without an activated plan change.');
          }
        });
        if (checkoutError) throw new Error(checkoutError);
      } else {
        const result = await applyPlanUpgrade(request.tier, preview.previewToken, request.interval);
        if (result.kind === 'payment-action-required') {
          await openUpgradePayment(result.paymentUrl, async () => {
            const activated = await waitForPlanActivation(request.tier);
            if (activated) {
              toast.success(`${pricing.label} is now active`);
            } else {
              toast.info('Payment closed before the plan activation was confirmed.');
            }
          });
          onComplete();
          return;
        }
        const activated = await waitForPlanActivation(request.tier);
        if (!activated) {
          setSyncPending(true);
          setConfirming(false);
          return;
        }
      }
      onComplete();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The upgrade failed. Your current plan is unchanged.',
      );
      setConfirming(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !confirming) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to {pricing.label}</DialogTitle>
          <DialogDescription>
            {previewing
              ? 'Calculating your exact charge…'
              : preview?.kind === 'prorated'
                ? `You’ll be charged ${formatMoney(preview.amountDueNowCents, preview.currency)} today. Stripe applies credit for unused time on your current plan. Your new billing cycle then renews at ${formatMoney(preview.recurringAmountCents, preview.currency)}/${recurringInterval}.`
                : preview?.kind === 'checkout-required'
                  ? `No paid Stripe subscription is available to credit. Starting ${pricing.label} costs ${formatMoney(preview.amountDueNowCents, preview.currency)} today.`
                  : 'Review the exact amount before any charge is made.'}
          </DialogDescription>
        </DialogHeader>

        {preview?.kind === 'prorated' ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Due today</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {formatMoney(preview.amountDueNowCents, preview.currency)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Includes the unused-time credit from your current plan. After payment succeeds, your
              existing usage and top-ups carry into the replacement period and the additional plan
              allowance is applied by the canonical billing webhook.
            </p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {syncPending ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-300">
            Stripe accepted the upgrade, but AGI Cloud is still waiting for the billing webhook.
            Your current plan remains visible until server activation is confirmed. You can close
            this dialog and check Billing again shortly.
          </p>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={previewing || confirming || !preview}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {confirming
              ? 'Processing…'
              : preview
                ? `${preview.kind === 'checkout-required' ? 'Continue' : 'Confirm'} · ${formatMoney(preview.amountDueNowCents, preview.currency)}`
                : 'Confirm'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
