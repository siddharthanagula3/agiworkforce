// Updated: Jan 15th 2026 - Removed all console statements for security (data exposure)
// Updated: Jan 15th 2026 - Added error boundary
// Updated: Jan 18th 2026 - Migrated to React Query for server state management
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useSearchParams } from 'next/navigation';
import { Button } from '@shared/ui/button';
import {
  upgradeToHobbyPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  contactEnterpriseSales,
  openBillingPortal,
  isStripeConfigured,
} from '@features/billing/services/stripe-payments';
import { buyTokenPack } from '@features/billing/services/token-pack-purchase';
import { toast } from 'sonner';
import {
  useBillingData,
  useInvalidateBillingQueries,
  useInvoices,
  usePaymentMethods,
} from '@features/billing/hooks/use-billing-queries';
import {
  Loader2,
  RefreshCw,
  Crown,
  Settings,
  ExternalLink,
  Brain,
  Code,
  Search,
  Sparkles,
} from 'lucide-react';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import {
  normalizePlan,
  BillingInfo,
  CreditPack,
  formatCurrency,
  formatDate,
} from '@features/billing/components/Billing/types';
import { Subscription } from '@features/billing/components/Billing/Subscription';
import { Usage } from '@features/billing/components/Billing/Usage';
import { Topup } from '@features/billing/components/Billing/Topup';

const BillingPage: React.FC = () => {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const [showBuyTokens, setShowBuyTokens] = useState(false);

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
        usage: {
          ...billingData.usage,
          llmUsage: billingData.usage.llmUsage.map((llm, index) => ({
            ...llm,
            icon:
              index === 0 ? (
                <Brain className="h-5 w-5" />
              ) : index === 1 ? (
                <Code className="h-5 w-5" />
              ) : index === 2 ? (
                <Search className="h-5 w-5" />
              ) : (
                <Sparkles className="h-5 w-5" />
              ),
            color:
              index === 0
                ? 'text-green-600'
                : index === 1
                  ? 'text-blue-600'
                  : index === 2
                    ? 'text-purple-600'
                    : 'text-orange-600',
            bgColor:
              index === 0
                ? 'bg-green-50 dark:bg-green-950/30'
                : index === 1
                  ? 'bg-blue-50 dark:bg-blue-950/30'
                  : index === 2
                    ? 'bg-purple-50 dark:bg-purple-950/30'
                    : 'bg-orange-50 dark:bg-orange-950/30',
          })),
        },
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

  const stripeCustomerId = billingData?.stripeCustomerId ?? null;
  const error = queryError ? 'Failed to load billing information. Please try again.' : null;

  const hasShownSuccessToast = useRef(false);

  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const action = searchParams.get('action');
    const tokensParam = searchParams.get('tokens');

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    if (action === 'buy-tokens') {
      setShowBuyTokens(true);
      const scrollTimeoutId = setTimeout(() => {
        const element = document.getElementById('buy-tokens-section');
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      timeoutIds.push(scrollTimeoutId);
    }

    const scheduleRetryRefresh = () => {
      const delays = [1000, 3000, 8000];
      delays.forEach((delay) => {
        const id = setTimeout(() => {
          invalidateBillingQueries();
        }, delay);
        timeoutIds.push(id);
      });
    };

    if (success === 'true' && tokensParam && user && !hasShownSuccessToast.current) {
      const tokens = parseInt(tokensParam, 10);
      if (!Number.isNaN(tokens) && tokens > 0) {
        toast.success(`Success! ${tokens.toLocaleString()} credits added to your account.`, {
          duration: 5000,
        });
      } else {
        toast.success('Credit purchase successful!', { duration: 5000 });
      }
      hasShownSuccessToast.current = true;
      scheduleRetryRefresh();
    } else if (success === 'true' && sessionId && user && !hasShownSuccessToast.current) {
      toast.success('Payment successful! Your subscription has been upgraded.');
      hasShownSuccessToast.current = true;
      scheduleRetryRefresh();
    }

    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [searchParams, user, invalidateBillingQueries]);

  const handleUpgrade = async (
    plan: 'hobby' | 'pro' | 'pro_plus' | 'max' | 'enterprise',
    period: 'monthly' | 'yearly' = 'monthly',
  ) => {
    if (!user) {
      toast.error('Please log in to upgrade your plan');
      return;
    }

    try {
      if (plan === 'hobby') {
        toast.loading('Redirecting to checkout...');
        await upgradeToHobbyPlan({
          userId: user.id,
          userEmail: user.email || '',
          billingPeriod: period,
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
      } else if (plan === 'enterprise') {
        await contactEnterpriseSales({
          userId: user.id,
          userEmail: user.email || '',
          userName: (user.user_metadata?.['full_name'] as string) || user.email || '',
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process upgrade');
    }
  };

  const handleManageBilling = async () => {
    if (!stripeCustomerId) {
      toast.error('No billing information found. Please contact support.');
      return;
    }

    if (!isStripeConfigured()) {
      toast.error('Billing system is not configured. Please contact support.');
      return;
    }

    try {
      setIsManagingBilling(true);
      toast.loading('Opening billing portal...');
      await openBillingPortal(stripeCustomerId);
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

  const handleBuyTokenPack = async (pack: CreditPack) => {
    if (!user) {
      toast.error('Please log in to purchase credits');
      return;
    }

    try {
      toast.loading(`Redirecting to checkout for ${pack.name}...`);
      await buyTokenPack({
        userId: user.id,
        userEmail: user.email || '',
        packId: pack.id,
        tokens: pack.credits,
        price: pack.price,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to start checkout. Please try again.',
      );
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
            {billing?.plan !== 'free' && stripeCustomerId && (
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
            {normalizePlan(billing?.plan) !== 'max' &&
              normalizePlan(billing?.plan) !== 'enterprise' && (
                <Button
                  onClick={() => {
                    const current = normalizePlan(billing?.plan);
                    const next =
                      current === 'free'
                        ? 'hobby'
                        : current === 'hobby'
                          ? 'pro'
                          : current === 'pro'
                            ? 'pro_plus'
                            : 'max';
                    handleUpgrade(next);
                  }}
                  size="sm"
                  className="gradient-primary"
                >
                  <Crown className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">
                    Upgrade to{' '}
                    {normalizePlan(billing?.plan) === 'free'
                      ? 'Hobby'
                      : normalizePlan(billing?.plan) === 'hobby'
                        ? 'Pro'
                        : 'Max'}
                  </span>
                  <span className="sm:hidden">Upgrade</span>
                </Button>
              )}
          </div>
        </div>

        <Subscription
          billing={billing}
          stripeCustomerId={stripeCustomerId}
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
          stripeCustomerId={stripeCustomerId}
          isManagingBilling={isManagingBilling}
          invoicesLoading={invoicesLoading}
          paymentMethodsLoading={paymentMethodsLoading}
          paymentMethodsData={paymentMethodsData}
          onManageBilling={handleManageBilling}
          onDownloadInvoice={handleDownloadInvoice}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />

        <Topup
          billing={billing}
          showBuyTokens={showBuyTokens}
          onClose={() => setShowBuyTokens(false)}
          onBuyTokenPack={handleBuyTokenPack}
          onUpgradePro={() => handleUpgrade('pro', 'monthly')}
        />
      </div>
    </ErrorBoundary>
  );
};

export default BillingPage;
