// Updated: Jan 15th 2026 - Removed all console statements for security (data exposure)
// Updated: Jan 15th 2026 - Added error boundary
// Updated: Jan 18th 2026 - Migrated to React Query for server state management
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Progress } from '@shared/ui/progress';
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
  DollarSign,
  Download,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Crown,
  Building,
  Star,
  ArrowRight,
  FileText,
  Brain,
  Code,
  Search,
  Sparkles,
  Settings,
  ExternalLink,
  RefreshCw,
  X,
  CreditCard,
  XCircle,
  Clock,
} from 'lucide-react';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import { cn } from '@shared/lib/utils';

// Known valid plan tiers — used to validate API responses before rendering
const VALID_PLANS = ['free', 'hobby', 'pro', 'max', 'enterprise'] as const;
type PlanTier = (typeof VALID_PLANS)[number];

const VALID_STATUSES = ['active', 'cancelled', 'past_due', 'unpaid'] as const;
type BillingStatus = (typeof VALID_STATUSES)[number];

function isValidPlan(plan: unknown): plan is PlanTier {
  return typeof plan === 'string' && VALID_PLANS.includes(plan as PlanTier);
}

function isValidStatus(status: unknown): status is BillingStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as BillingStatus);
}

/** Safely normalize a plan value, defaulting to 'free' for unknown values */
function normalizePlan(plan: unknown): PlanTier {
  return isValidPlan(plan) ? plan : 'free';
}

/** Safely normalize a status value, defaulting to 'active' for unknown values */
function normalizeStatus(status: unknown): BillingStatus {
  return isValidStatus(status) ? status : 'active';
}

interface LLMUsage {
  provider: string;
  tokens: number;
  cost: number;
  limit: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

interface BillingInfo {
  plan: 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid';
  current_period_start: string;
  current_period_end: string;
  price: number;
  currency: string;
  features: string[];
  usage: {
    totalTokens: number;
    totalLimit: number;
    totalCost: number;
    llmUsage: LLMUsage[];
  };
  invoices: {
    id: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
    download_url: string;
  }[];
}

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  savings?: string;
}

const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_500',
    name: 'Starter Pack',
    credits: 500,
    price: 5,
  },
  {
    id: 'pack_1500',
    name: 'Popular Pack',
    credits: 1500,
    price: 12,
    popular: true,
    savings: 'Save 20%',
  },
  {
    id: 'pack_5000',
    name: 'Power Pack',
    credits: 5000,
    price: 35,
    savings: 'Save 30%',
  },
  {
    id: 'pack_15000',
    name: 'Enterprise Pack',
    credits: 15000,
    price: 90,
    savings: 'Save 40%',
  },
];

const BillingPage: React.FC = () => {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    'yearly', // Default to yearly
  );
  const [isManagingBilling, setIsManagingBilling] = useState(false);
  const [showBuyTokens, setShowBuyTokens] = useState(false);

  // Use React Query for billing data
  const {
    data: billingData,
    isLoading,
    error: queryError,
    refetch: refetchBilling,
  } = useBillingData();
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices();
  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = usePaymentMethods();
  const invalidateBillingQueries = useInvalidateBillingQueries();

  // Transform billing data to include UI-specific properties
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
          amount: inv.amount / 100, // convert cents to dollars
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

  // Track if we have shown the payment success toast
  const hasShownSuccessToast = useRef(false);

  // Check for successful payment and refresh billing data
  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const action = searchParams.get('action');
    const tokensParam = searchParams.get('tokens');

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    // Show buy tokens section if action=buy-tokens
    if (action === 'buy-tokens') {
      setShowBuyTokens(true);
      // Scroll to buy tokens section
      const scrollTimeoutId = setTimeout(() => {
        const element = document.getElementById('buy-tokens-section');
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      timeoutIds.push(scrollTimeoutId);
    }

    // Retry billing data refresh with backoff — Stripe webhooks may take a few seconds
    const scheduleRetryRefresh = () => {
      const delays = [1000, 3000, 8000]; // 1s, 3s, 8s
      delays.forEach((delay) => {
        const id = setTimeout(() => {
          invalidateBillingQueries();
        }, delay);
        timeoutIds.push(id);
      });
    };

    // Handle successful credit purchase (only show once)
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

      // Refresh billing data with retry backoff for webhook propagation
      scheduleRetryRefresh();
    }
    // Handle successful subscription upgrade (only show once)
    else if (success === 'true' && sessionId && user && !hasShownSuccessToast.current) {
      toast.success('Payment successful! Your subscription has been upgraded.');
      hasShownSuccessToast.current = true;

      // Refresh billing data with retry backoff for webhook propagation
      scheduleRetryRefresh();
    }

    // Cleanup timeouts on unmount or dependency change
    return () => {
      timeoutIds.forEach((id) => clearTimeout(id));
    };
  }, [searchParams, user, invalidateBillingQueries]);

  const handleUpgrade = async (
    plan: 'hobby' | 'pro' | 'max' | 'enterprise',
    billingPeriod: 'monthly' | 'yearly' = 'monthly',
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
          billingPeriod,
        });
      } else if (plan === 'pro') {
        toast.loading('Redirecting to checkout...');
        await upgradeToProPlan({
          userId: user.id,
          userEmail: user.email || '',
          billingPeriod,
        });
      } else if (plan === 'max') {
        toast.loading('Redirecting to checkout...');
        await upgradeToMaxPlan({
          userId: user.id,
          userEmail: user.email || '',
          billingPeriod,
        });
      } else if (plan === 'enterprise') {
        await contactEnterpriseSales({
          userId: user.id,
          userEmail: user.email || '',
          userName: (user.user_metadata?.['full_name'] as string) || user.email || '',
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process upgrade');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
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

      // User will be redirected to Stripe checkout
      // On success, they'll return to /billing?success=true&tokens=X
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to start checkout. Please try again.',
      );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const VALID_CURRENCY_RE = /^[A-Z]{3}$/;

  const formatCurrency = (amount: number, currency: string) => {
    const safeCurrency = VALID_CURRENCY_RE.test(currency) ? currency : 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
    }).format(amount);
  };

  const getPlanIcon = (plan: string) => {
    const normalized = normalizePlan(plan);
    switch (normalized) {
      case 'free':
        return <Zap className="h-5 w-5" />;
      case 'hobby':
        return <Star className="h-5 w-5" />;
      case 'pro':
        return <Crown className="h-5 w-5" />;
      case 'max':
        return <Crown className="h-5 w-5 text-amber-500" />;
      case 'enterprise':
        return <Building className="h-5 w-5" />;
    }
  };

  const getStatusDisplay = (status: string | undefined) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'active':
        return {
          icon: <CheckCircle className="h-4 w-4 text-success" />,
          label: 'Active',
        };
      case 'cancelled':
        return {
          icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
          label: 'Cancelled',
        };
      case 'past_due':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
          label: 'Past Due',
        };
      case 'unpaid':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
          label: 'Unpaid',
        };
    }
  };

  /** Safely compute percentage, guarding against division by zero */
  const safePercentage = (used: number, limit: number): number => {
    if (limit <= 0 || used < 0) return 0;
    return Math.min((used / limit) * 100, 100);
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
                    const next = current === 'free' ? 'hobby' : current === 'hobby' ? 'pro' : 'max';
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

        {/* Current Plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  {getPlanIcon(billing?.plan || 'free')}
                  <span>Current Plan</span>
                </CardTitle>
                <CardDescription>Your current subscription details</CardDescription>
              </div>
              <Badge>{normalizePlan(billing?.plan).toUpperCase()}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Plan Price</p>
                <p className="text-2xl font-bold">
                  {billing?.price === 0
                    ? 'Free'
                    : formatCurrency(billing?.price || 0, billing?.currency || 'USD')}
                  {(billing?.price ?? 0) > 0 && (
                    <span className="text-sm text-muted-foreground">/month</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="flex items-center space-x-2">
                  {getStatusDisplay(billing?.status).icon}
                  <span className="text-sm font-medium">
                    {getStatusDisplay(billing?.status).label}
                  </span>
                </div>
                {normalizeStatus(billing?.status) === 'past_due' && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                    Please update your payment method to avoid service interruption.
                  </p>
                )}
                {normalizeStatus(billing?.status) === 'unpaid' && (
                  <p className="mt-1 text-xs text-destructive">
                    Your account has an unpaid balance. Please update your payment method.
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Next Billing Date</p>
                <p className="text-sm font-medium">
                  {billing?.current_period_end ? formatDate(billing.current_period_end) : '--'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billing Period</p>
                <p className="text-sm font-medium">
                  {billing?.plan === 'free' ? 'N/A' : 'Monthly'}
                </p>
              </div>
            </div>

            {billing?.plan !== 'free' && (
              <div className="mt-6 rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Subscription Management</h4>
                    <p className="text-sm text-muted-foreground">
                      Update payment methods, view invoices, and manage your subscription
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleManageBilling}
                    disabled={isManagingBilling || !stripeCustomerId}
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    {isManagingBilling ? 'Opening...' : 'Manage'}
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Usage Overview */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Credit Usage</span>
              </CardTitle>
              <CardDescription>Combined credit usage across all LLM providers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Used</span>
                  <span className="text-2xl font-bold">
                    {(Number.isFinite(billing?.usage?.totalTokens)
                      ? billing!.usage.totalTokens
                      : 0
                    ).toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={safePercentage(
                    billing?.usage?.totalTokens ?? 0,
                    billing?.usage?.totalLimit || 1,
                  )}
                  className="h-3"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {billing?.plan === 'free' ? 'Monthly Limit' : 'Credit Allocation'}
                  </span>
                  <span className="font-medium">
                    {(billing?.usage?.totalLimit ?? 0).toLocaleString()} credits
                  </span>
                </div>
                {(billing?.usage?.totalTokens ?? 0) > 0 &&
                  (billing?.usage?.totalLimit ?? 0) > 0 &&
                  (billing?.usage?.totalTokens ?? 0) >= (billing?.usage?.totalLimit ?? 0) * 0.8 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        Approaching limit -{' '}
                        {(
                          (((billing?.usage?.totalLimit || 1) -
                            (billing?.usage?.totalTokens ?? 0)) /
                            (billing?.usage?.totalLimit || 1)) *
                          100
                        ).toFixed(0)}
                        % remaining
                      </span>
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5" />
                <span>Total Cost</span>
              </CardTitle>
              <CardDescription>Estimated cost (currently free)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Would be</span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(billing?.usage?.totalCost ?? 0, billing?.currency || 'USD')}
                  </span>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">
                      {normalizePlan(billing?.plan) === 'free' && 'Free Tier Active'}
                      {normalizePlan(billing?.plan) === 'hobby' && 'Hobby Plan Active'}
                      {normalizePlan(billing?.plan) === 'pro' && 'Pro Plan Active'}
                      {normalizePlan(billing?.plan) === 'max' && 'Max Plan Active'}
                      {normalizePlan(billing?.plan) === 'enterprise' && 'Enterprise Plan Active'}
                    </span>
                  </div>
                  {normalizePlan(billing?.plan) === 'free' && (
                    <p className="mt-1 text-sm text-green-600 dark:text-green-500">
                      You&apos;re saving {formatCurrency(billing?.usage?.totalCost ?? 0, 'USD')}{' '}
                      with the free plan!
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Features */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Features</CardTitle>
            <CardDescription>Features included in your current plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {billing?.features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Buy More Credits Section */}
        {(showBuyTokens ||
          ((billing?.usage?.totalTokens ?? 0) > 0 &&
            (billing?.usage?.totalLimit ?? 0) > 0 &&
            (billing?.usage?.totalTokens ?? 0) >= (billing?.usage?.totalLimit ?? 0) * 0.85)) && (
          <Card id="buy-tokens-section" className="border-2 border-primary/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-6 w-6 text-primary" />
                    Buy More Credits
                  </CardTitle>
                  <CardDescription>
                    Purchase additional credits to keep your AI employees working without
                    interruption
                  </CardDescription>
                </div>
                {showBuyTokens && (
                  <Button variant="ghost" size="sm" onClick={() => setShowBuyTokens(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Warning if near limit */}
              {(billing?.usage?.totalTokens ?? 0) > 0 &&
                (billing?.usage?.totalLimit ?? 0) > 0 &&
                (billing?.usage?.totalTokens ?? 0) >= (billing?.usage?.totalLimit ?? 0) * 0.85 && (
                  <div
                    className={`mb-6 rounded-lg border p-4 ${
                      (billing?.usage?.totalTokens ?? 0) >= (billing?.usage?.totalLimit || 1) * 0.95
                        ? 'border-red-500/50 bg-red-500/10'
                        : 'border-yellow-500/50 bg-yellow-500/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className={`mt-0.5 h-5 w-5 ${
                          (billing?.usage?.totalTokens ?? 0) >=
                          (billing?.usage?.totalLimit || 1) * 0.95
                            ? 'text-red-500'
                            : 'text-yellow-500'
                        }`}
                      />
                      <div className="flex-1">
                        <h4 className="mb-1 font-semibold">
                          {(billing?.usage?.totalTokens ?? 0) >=
                          (billing?.usage?.totalLimit || 1) * 0.95
                            ? '🚨 Critical: 95% Usage Reached'
                            : '⚠️ Warning: 85% Usage Reached'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          You&apos;ve used{' '}
                          {(
                            ((billing?.usage?.totalTokens ?? 0) /
                              (billing?.usage?.totalLimit || 1)) *
                            100
                          ).toFixed(1)}
                          % of your {(billing?.usage?.totalLimit ?? 0).toLocaleString()} credit
                          limit. Buy more credits now to avoid service interruption.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              {/* Credit Packs Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {CREDIT_PACKS.map((pack) => (
                  <Card
                    key={pack.id}
                    className={cn(
                      'relative transition-all hover:shadow-lg',
                      pack.popular && 'border-2 border-primary',
                    )}
                  >
                    {pack.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-primary to-accent text-white">
                          <Star className="mr-1 h-3 w-3" />
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">{pack.name}</CardTitle>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          {formatCurrency(pack.price, 'USD')}
                        </span>
                        <span className="text-sm text-muted-foreground">one-time</span>
                      </div>
                      {pack.savings && (
                        <Badge variant="secondary" className="mt-2 w-fit">
                          {pack.savings}
                        </Badge>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Credits</span>
                          <span className="font-bold">{pack.credits.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Cost per credit</span>
                          <span className="font-medium">
                            {formatCurrency(pack.price / pack.credits, 'USD')}
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleBuyTokenPack(pack)}
                        className={cn(
                          'w-full',
                          pack.popular && 'bg-gradient-to-r from-primary to-accent',
                        )}
                        variant={pack.popular ? 'default' : 'outline'}
                      >
                        Buy {pack.name}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Credit Pack Benefits */}
              <div className="mt-6 rounded-lg border border-dashed bg-muted/50 p-4">
                <h4 className="mb-3 font-medium">✨ Credit Pack Benefits</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <span className="font-medium">Instant Activation</span>
                      <p className="text-muted-foreground">
                        Credits available immediately after purchase
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <span className="font-medium">No Expiration</span>
                      <p className="text-muted-foreground">
                        Use your credits whenever you need them
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <span className="font-medium">Zero Markup</span>
                      <p className="text-muted-foreground">
                        Same input/output token prices as the LLM providers — no extra charge
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-success" />
                    <div>
                      <span className="font-medium">All Providers</span>
                      <p className="text-muted-foreground">
                        Works with OpenAI, Claude, Gemini, Perplexity
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alternative: Upgrade to Pro */}
              {billing?.plan === 'free' && (
                <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <Crown className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold">💡 Better Value: Upgrade to Pro</h4>
                      <p className="mb-3 text-sm text-muted-foreground">
                        Get 1,200 credits/month for $29.99/month — better value than buying credit
                        packs if you use AI regularly
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpgrade('pro', 'monthly')}
                      >
                        View Pro Plan
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upgrade Options */}
        {normalizePlan(billing?.plan) !== 'max' &&
          normalizePlan(billing?.plan) !== 'enterprise' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Upgrade Your Plan</CardTitle>
                    <CardDescription>Choose a plan that fits your needs</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Billing:</span>
                    <div className="flex items-center rounded-lg bg-muted p-1">
                      <button
                        onClick={() => setBillingPeriod('monthly')}
                        className={`rounded-md px-3 py-1 text-sm transition-colors ${
                          billingPeriod === 'monthly'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        onClick={() => setBillingPeriod('yearly')}
                        className={`rounded-md px-3 py-1 text-sm transition-colors ${
                          billingPeriod === 'yearly'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Yearly
                        <Badge variant="secondary" className="ml-1 text-xs">
                          Save 14%
                        </Badge>
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {/* Hobby Plan */}
                  {normalizePlan(billing?.plan) === 'free' && (
                    <Card className="border-2 border-muted-foreground/30">
                      <CardHeader>
                        <div className="flex items-center space-x-2">
                          <Zap className="h-5 w-5 text-primary" />
                          <CardTitle>Hobby</CardTitle>
                        </div>
                        <div className="text-2xl font-bold">
                          {billingPeriod === 'yearly' ? (
                            <>
                              <div className="text-3xl font-bold">
                                $4.99
                                <span className="text-lg text-muted-foreground">/month</span>
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                Billed yearly as $59.88
                              </div>
                            </>
                          ) : (
                            <>
                              $10
                              <span className="text-sm text-muted-foreground">/month</span>
                            </>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>350 credits/month ($3.50 in AI usage)</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Speed-optimized AI models</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Vision &amp; image analysis</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Basic computer use</span>
                          </li>
                        </ul>
                        <Button
                          className="mt-4 w-full"
                          variant="outline"
                          onClick={() => handleUpgrade('hobby', billingPeriod)}
                        >
                          Get Hobby
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pro Plan */}
                  {(normalizePlan(billing?.plan) === 'free' ||
                    normalizePlan(billing?.plan) === 'hobby') && (
                    <Card className="border-2 border-primary">
                      <CardHeader>
                        <div className="flex items-center space-x-2">
                          <Crown className="h-5 w-5 text-primary" />
                          <CardTitle>Pro</CardTitle>
                          <Badge className="bg-primary text-primary-foreground">Popular</Badge>
                        </div>
                        <div className="text-2xl font-bold">
                          {billingPeriod === 'yearly' ? (
                            <>
                              <div className="text-3xl font-bold">
                                $24.99
                                <span className="text-lg text-muted-foreground">/month</span>
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                Billed yearly as $299.88
                              </div>
                            </>
                          ) : (
                            <>
                              $29.99
                              <span className="text-sm text-muted-foreground">/month</span>
                            </>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>1,200 credits/month ($12 in AI usage)</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Same price as direct provider rates</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Full computer use &amp; browser automation</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Image generation &amp; analysis</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-success" />
                            <span>Email support</span>
                          </li>
                        </ul>
                        <Button
                          className="gradient-primary mt-4 w-full"
                          onClick={() => handleUpgrade('pro', billingPeriod)}
                        >
                          Upgrade to Pro
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Max Plan */}
                  <Card className="border-2 border-secondary">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <Star className="h-5 w-5 text-primary" />
                        <CardTitle>Max</CardTitle>
                      </div>
                      <div className="text-2xl font-bold">
                        {billingPeriod === 'yearly' ? (
                          <>
                            <div className="text-3xl font-bold">
                              $249.99
                              <span className="text-lg text-muted-foreground">/month</span>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Billed yearly as $2,999.88
                            </div>
                          </>
                        ) : (
                          <>
                            $299.99
                            <span className="text-sm text-muted-foreground">/month</span>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>15,000 credits/month ($150 in AI usage)</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Deep reasoning &amp; thinking models</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Advanced agentic coding models</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Video generation &amp; analysis</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Priority support</span>
                        </li>
                      </ul>
                      <Button
                        className="mt-4 w-full"
                        variant="outline"
                        onClick={() => handleUpgrade('max', billingPeriod)}
                      >
                        Upgrade to Max
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Enterprise Plan */}
                  <Card className="border-2 border-muted-foreground/30">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <Building className="h-5 w-5 text-primary" />
                        <CardTitle>Enterprise</CardTitle>
                      </div>
                      <div className="text-2xl font-bold">
                        Custom
                        <span className="text-sm text-muted-foreground"> pricing</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Everything in Max</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Custom credit allocation</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>White-label option</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>Dedicated account manager</span>
                        </li>
                        <li className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span>SLA guarantee</span>
                        </li>
                      </ul>
                      <Button
                        className="mt-4 w-full"
                        variant="outline"
                        onClick={() => handleUpgrade('enterprise', 'monthly')}
                      >
                        Contact Sales
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}

        {/* Payment Methods */}
        {billing?.plan !== 'free' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CreditCard className="h-5 w-5" />
                <span>Payment Methods</span>
              </CardTitle>
              <CardDescription>Your saved payment methods</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentMethodsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (paymentMethodsData ?? []).length === 0 ? (
                <div className="py-8 text-center">
                  <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium">No payment methods on file</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a payment method through the billing portal
                  </p>
                  {stripeCustomerId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={handleManageBilling}
                      disabled={isManagingBilling}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage in Portal
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {(paymentMethodsData ?? []).map((pm) => {
                    const isExpired =
                      pm.card && new Date(pm.card.expYear, pm.card.expMonth - 1) < new Date();
                    return (
                      <div
                        key={pm.id}
                        className={cn(
                          'flex items-center justify-between rounded-lg border p-4',
                          isExpired && 'border-destructive/30 bg-destructive/5',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium capitalize">
                                {pm.card?.brand ?? pm.type} ending in {pm.card?.last4 ?? '••••'}
                              </p>
                              {pm.isDefault && (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                              {isExpired && (
                                <Badge variant="destructive" className="text-xs">
                                  Expired
                                </Badge>
                              )}
                            </div>
                            {pm.card && (
                              <p className="text-sm text-muted-foreground">
                                Expires {String(pm.card.expMonth).padStart(2, '0')}/
                                {pm.card.expYear}
                                {isExpired && (
                                  <span className="ml-2 text-destructive">
                                    — Please update your card
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        {stripeCustomerId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleManageBilling}
                            disabled={isManagingBilling}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {stripeCustomerId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleManageBilling}
                      disabled={isManagingBilling}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage Payment Methods
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Invoice History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Invoice History</span>
            </CardTitle>
            <CardDescription>Your recent invoices and payments</CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : billing?.invoices.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">No Invoices Yet</h3>
                <p className="text-muted-foreground">
                  Your invoice history will appear here once you start using paid features.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {billing?.invoices.map((invoice) => {
                  const statusConfig = {
                    paid: {
                      icon: <CheckCircle className="h-4 w-4 text-success" />,
                      variant: 'default' as const,
                      label: 'Paid',
                    },
                    pending: {
                      icon: <Clock className="h-4 w-4 text-amber-500" />,
                      variant: 'secondary' as const,
                      label: 'Pending',
                    },
                    failed: {
                      icon: <XCircle className="h-4 w-4 text-destructive" />,
                      variant: 'destructive' as const,
                      label: 'Failed',
                    },
                  };
                  const config = statusConfig[invoice.status] ?? statusConfig.pending;
                  return (
                    <div
                      key={invoice.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg border p-4',
                        invoice.status === 'failed' && 'border-destructive/30 bg-destructive/5',
                        invoice.status === 'pending' && 'border-amber-500/30 bg-amber-500/5',
                      )}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            Invoice #{invoice.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(invoice.date)}
                          </p>
                          {invoice.status === 'failed' && (
                            <p className="mt-0.5 text-xs text-destructive">
                              Payment failed — please update your payment method
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="font-medium">
                            {formatCurrency(invoice.amount, billing?.currency || 'USD')}
                          </p>
                          <Badge variant={config.variant} className="flex items-center gap-1">
                            {config.icon}
                            {config.label}
                          </Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice.id)}
                          title="Download invoice"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  );
};

export default BillingPage;
