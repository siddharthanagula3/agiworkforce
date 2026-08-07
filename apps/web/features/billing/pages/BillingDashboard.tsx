// Updated: Jan 15th 2026 - Removed all console statements for security (data exposure)
// Updated: Jan 15th 2026 - Added error boundary
// Updated: Jan 18th 2026 - Migrated to React Query for server state management
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@agiworkforce/ui';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
  contactEnterpriseSales,
  openBillingPortal,
  isStripeConfigured,
} from '@features/billing/services/stripe-payments';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import { toast } from 'sonner';
import {
  useBillingData,
  useInvalidateBillingQueries,
  useInvoices,
  usePaymentMethods,
} from '@features/billing/hooks/use-billing-queries';
import { Loader2, RefreshCw, Crown, Settings, ExternalLink } from 'lucide-react';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import {
  normalizePlan,
  BillingInfo,
  formatCurrency,
  formatDate,
} from '@features/billing/components/Billing/types';
import {
  getBillingPlanPricing,
  isPlanSelectableOnSurface,
  type SelfServePaidPlanTier,
} from '@agiworkforce/types';
import { Subscription } from '@features/billing/components/Billing/Subscription';
import { Usage } from '@features/billing/components/Billing/Usage';

// Paid-plan checkout (2026-07-04): open by default, matching the
// managed-compute public-alpha decision (2026-06-27, lib/managed-compute-gate.ts).
// The env var is retained ONLY as an incident-response kill-switch: set
// NEXT_PUBLIC_CHECKOUT_ENABLED=0 (or 'false'/'off') to re-gate.
//
// NEXT_PUBLIC_CHECKOUT_ENABLED MUST be kept equal to the server-side
// STRIPE_CHECKOUT_ENABLED flag (app/api/checkout/route.ts) and to the same
// client flag in app/pricing/page.tsx — see the comment block in
// apps/web/.env.example. If they diverge, the CTA and the API will disagree
// about whether checkout is actually available.
const CHECKOUT_ENABLED_RAW = process.env['NEXT_PUBLIC_CHECKOUT_ENABLED']?.trim().toLowerCase();
const CHECKOUT_ENABLED =
  CHECKOUT_ENABLED_RAW !== '0' &&
  CHECKOUT_ENABLED_RAW !== 'false' &&
  CHECKOUT_ENABLED_RAW !== 'off';

const BillingPage: React.FC = () => {
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);

  const {
    data: billingData,
    isLoading,
    error: queryError,
    refetch: refetchBilling,
  } = useBillingData();
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices();
  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = usePaymentMethods();
  const invalidateBillingQueries = useInvalidateBillingQueries();

  const billing: BillingInfo | null = billingData
    ? {
        ...billingData,
        invoices: (invoicesData ?? []).map((inv) => ({
          id: inv.id,
          date: inv.createdAt,
          amount: inv.amount / 100,
          status:
            inv.status === 'paid'
              ? ('paid' as const)
              : inv.status === 'open'
                ? ('pending' as const)
                : ('failed' as const),
          download_url: inv.invoicePdf ?? inv.hostedInvoiceUrl ?? '',
        })),
      }
    : null;

  const error = queryError ? 'Failed to load billing information. Please try again.' : null;

  const hasShownSuccessToast = useRef(false);

  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const scheduleRetryRefresh = () => {
      const delays = [1000, 3000, 8000];
      delays.forEach((delay) => {
        const id = setTimeout(() => {
          invalidateBillingQueries();
        }, delay);
        timeoutIds.push(id);
      });
    };

    if (success === 'true' && sessionId && user && !hasShownSuccessToast.current) {
      toast.success('Payment successful! Your subscription has been upgraded.');
      hasShownSuccessToast.current = true;
      scheduleRetryRefresh();
    }

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [searchParams, user, invalidateBillingQueries]);

  const currentPlan = normalizePlan(billing?.plan);
  const hasActivePaidPlan =
    !!billing && currentPlan !== 'free' && ['active', 'trialing'].includes(billing.status ?? '');

  const handleUpgrade = async (
    plan: SelfServePaidPlanTier | 'enterprise',
    period: 'monthly' | 'yearly' = 'monthly',
  ) => {
    if (!user) {
      toast.error('Please log in to upgrade your plan');
      return;
    }

    // The public flag is an incident-response checkout kill switch, not a
    // managed-cloud waitlist. Keep the user's billing context intact.
    if (!CHECKOUT_ENABLED && plan !== 'enterprise') {
      toast.error('Checkout is temporarily unavailable. Please try again later.');
      return;
    }

    try {
      if (plan === 'enterprise') {
        router.push(
          contactEnterpriseSales({
            userId: user.id,
            userEmail: user.email || '',
            userName: (user.user_metadata?.['full_name'] as string) || user.email || '',
          }),
        );
        return;
      }

      // A mid-cycle upgrade charges the saved card immediately with no Stripe
      // screen — confirm the exact prorated amount first via UpgradeConfirmDialog
      // instead of charging silently. The dialog owns the preview + the charge.
      if (hasActivePaidPlan) {
        setUpgradeConfirm({ plan, billingInterval: period });
        return;
      }

      // New subscriber: route through Stripe Checkout.
      if (plan === 'basic') {
        toast.loading('Redirecting to checkout...');
        await upgradeToBasicPlan({
          userId: user.id,
          userEmail: user.email || '',
        });
      } else if (plan === 'pro') {
        toast.loading('Redirecting to checkout...');
        await upgradeToProPlan({
          userId: user.id,
          userEmail: user.email || '',
          billingPeriod: period,
        });
      } else if (plan === 'max') {
        toast.loading('Redirecting to checkout...');
        await upgradeToMaxPlan({
          userId: user.id,
          userEmail: user.email || '',
          billingPeriod: period,
        });
      } else if (plan === 'max_15x') {
        toast.loading('Redirecting to checkout...');
        await upgradeToMax15xPlan({
          userId: user.id,
          userEmail: user.email || '',
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process upgrade');
    }
  };

  const handleManageBilling = async () => {
    if (!isStripeConfigured()) {
      toast.error('Billing system is not configured. Please contact support.');
      return;
    }

    try {
      setIsManagingBilling(true);
      toast.loading('Opening billing portal...');
      await openBillingPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setIsManagingBilling(false);
    }
  };

  const handleRefreshBilling = async () => {
    try {
      await refetchBilling();
      toast.success('Billing information refreshed');
    } catch (_err) {
      toast.error('Failed to refresh billing information. Please try again.');
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    const invoice = invoicesData?.find((inv) => inv.id === invoiceId);
    const url = invoice?.invoicePdf ?? invoice?.hostedInvoiceUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      toast.info('Invoice download is not available for this invoice. Please contact support.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading billing information...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => refetchBilling()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">Billing dashboard error</h2>
            <p className="mt-2 text-muted-foreground">
              Unable to load billing information. Please refresh the page.
            </p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-4 md:space-y-8 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Billing</h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Manage your subscription and billing information.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshBilling}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {billing?.plan !== 'free' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleManageBilling}
                disabled={isManagingBilling}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {isManagingBilling ? 'Opening...' : 'Manage Billing'}
                </span>
                <span className="sm:hidden">Manage</span>
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {normalizePlan(billing?.plan) !== 'max_15x' &&
              normalizePlan(billing?.plan) !== 'team' &&
              normalizePlan(billing?.plan) !== 'enterprise' &&
              (() => {
                const current = normalizePlan(billing?.plan);
                const nextTier: 'basic' | 'pro' | 'max' | 'max_15x' =
                  current === 'free'
                    ? isPlanSelectableOnSurface('basic', 'web')
                      ? 'basic'
                      : 'pro'
                    : current === 'basic'
                      ? 'pro'
                      : current === 'pro'
                        ? 'max'
                        : 'max_15x';
                return (
                  <Button
                    onClick={() => handleUpgrade(nextTier)}
                    size="sm"
                    className="gradient-primary"
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">
                      Upgrade to {getBillingPlanPricing(nextTier).label}
                    </span>
                    <span className="sm:hidden">Upgrade</span>
                  </Button>
                );
              })()}
          </div>
        </div>

        <Subscription
          billing={billing}
          isManagingBilling={isManagingBilling}
          billingPeriod={billingPeriod}
          onBillingPeriodChange={setBillingPeriod}
          onManageBilling={handleManageBilling}
          onUpgrade={handleUpgrade}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />

        <Usage
          billing={billing}
          isManagingBilling={isManagingBilling}
          invoicesLoading={invoicesLoading}
          paymentMethodsLoading={paymentMethodsLoading}
          paymentMethodsData={paymentMethodsData}
          onManageBilling={handleManageBilling}
          onDownloadInvoice={handleDownloadInvoice}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
        <UpgradeConfirmDialog
          request={upgradeConfirm}
          onCancel={() => setUpgradeConfirm(null)}
          onConfirmed={() => {
            setUpgradeConfirm(null);
            toast.success('Your plan has been upgraded.');
            invalidateBillingQueries();
            [1000, 3000, 8000].forEach((delay) => {
              window.setTimeout(() => invalidateBillingQueries(), delay);
            });
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export default BillingPage;
