/**
 * Billing React Query Hooks
 * Server state management for billing data using React Query
 *
 * @module features/billing/hooks/use-billing-queries
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@shared/stores/query-client';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { useAuthStore } from '@shared/stores/authentication-store';
import { logger } from '@shared/lib/logger';
import { PaymentAPI } from '@shared/lib/stripe';
import { getPlanPriceUsd, getPlanUsageBudgetCents } from '@agiworkforce/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Billing plan types
 */
// pro_plus removed: locked tiers are free, hobby, pro, max, team, enterprise.
export type BillingPlan = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';

/**
 * Subscription status types
 */
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'unpaid';

/**
 * Time range options for analytics
 */
export type AnalyticsTimeRange = '7d' | '30d' | '90d' | 'all';

/**
 * LLM provider usage statistics
 */
export interface LLMUsage {
  provider: string;
  tokens: number;
  cost: number;
  limit: number;
}

/**
 * Complete billing information for a user
 */
export interface BillingInfo {
  plan: BillingPlan;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  price: number;
  currency: string;
  features: string[];
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usage: BillingUsage;
}

/**
 * Token and cost usage breakdown
 */
export interface BillingUsage {
  totalTokens: number;
  totalLimit: number;
  totalCost: number;
  currentBalance: number;
  llmUsage: LLMUsage[];
}

/**
 * User's token balance
 */
export interface TokenBalance {
  currentBalance: number;
  totalGranted: number;
  totalUsed: number;
}

/**
 * Processed session data for analytics
 */
export interface AnalyticsSession {
  sessionId: string;
  sessionTitle: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  provider: string;
  createdAt: Date;
}

/**
 * Daily usage data point for charts
 */
export interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
}

/**
 * Aggregated analytics statistics
 */
export interface AnalyticsStats {
  totalTokens: number;
  totalCost: number;
  avgTokensPerSession: number;
  sessionsCount: number;
  todayTokens: number;
  todayCost: number;
  weekTokens: number;
  weekCost: number;
  monthTokens: number;
  monthCost: number;
}

/**
 * Complete analytics data response
 */
export interface TokenAnalyticsData {
  sessions: AnalyticsSession[];
  stats: AnalyticsStats | null;
  dailyUsage: DailyUsage[];
}

/**
 * User plan information from database
 */
interface UserPlanData {
  plan: BillingPlan;
  subscriptionEndDate: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

// Per-tier billing metadata — prices and usage budgets come from the shared billing catalog.
const TIER_CONFIG: Record<
  BillingPlan,
  { creditLimitCents: number; price: number; name: string; features: string[] }
> = {
  free: {
    creditLimitCents: getPlanUsageBudgetCents('free'),
    price: getPlanPriceUsd('free'),
    name: 'Free',
    features: ['Local LLMs only (Ollama, LM Studio)', 'Basic automations', 'Community support'],
  },
  hobby: {
    creditLimitCents: getPlanUsageBudgetCents('hobby'),
    price: getPlanPriceUsd('hobby'),
    name: 'Hobby',
    features: [
      `${getPlanUsageBudgetCents('hobby').toLocaleString()} credits per billing cycle`,
      'Speed-optimized AI models',
      'Vision & image analysis',
      'Basic computer use',
      'Community support',
    ],
  },
  pro: {
    creditLimitCents: getPlanUsageBudgetCents('pro'),
    price: getPlanPriceUsd('pro'),
    name: 'Pro',
    features: [
      `${getPlanUsageBudgetCents('pro').toLocaleString()} credits per billing cycle`,
      'Balanced AI models (chat, tool use, vision)',
      'Full computer use & browser automation',
      'Image generation & analysis',
      'Email support',
    ],
  },
  max: {
    creditLimitCents: getPlanUsageBudgetCents('max'),
    price: getPlanPriceUsd('max'),
    name: 'Max',
    features: [
      `${getPlanUsageBudgetCents('max').toLocaleString()} credits per billing cycle`,
      'Deep reasoning & thinking models',
      'Advanced agentic coding models',
      'Video generation & analysis',
      'Priority support',
    ],
  },
  enterprise: {
    creditLimitCents: getPlanUsageBudgetCents('enterprise'),
    price: getPlanPriceUsd('enterprise'),
    name: 'Enterprise',
    features: [
      'Custom credit allocation',
      'All AI providers',
      'Custom analytics',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
};

interface UsageApiResponse {
  plan_tier: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  usage_percentage: number;
  period_start: string | null;
  period_end: string | null;
  subscription_status: string;
}

/**
 * Fetch credit balance via /api/usage.
 * Balance is returned in cents (e.g., 2900 = $29.00).
 * NOTE: currentBalance/totalGranted/totalUsed are in CENTS, not token counts.
 */
async function fetchTokenBalance(_userId: string): Promise<TokenBalance> {
  const token = await getAuthToken();
  if (!token) {
    return { currentBalance: 0, totalGranted: 0, totalUsed: 0 };
  }

  try {
    const res = await fetch('/api/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      logger.warn('[BillingQuery] /api/usage returned', res.status);
      return { currentBalance: 0, totalGranted: 0, totalUsed: 0 };
    }
    const data = (await res.json()) as UsageApiResponse;
    const remaining = Math.max(data.credits_remaining_cents ?? 0, 0);
    const allocated = Math.max(data.credits_allocated_cents ?? 0, 0);
    return {
      currentBalance: remaining,
      totalGranted: allocated,
      totalUsed: Math.max(allocated - remaining, 0),
    };
  } catch (err) {
    logger.error('[BillingQuery] fetchTokenBalance error:', err);
    return { currentBalance: 0, totalGranted: 0, totalUsed: 0 };
  }
}

/**
 * Fetch token usage by provider
 * TODO: Add /api/usage/providers endpoint for per-provider breakdown.
 * Returns default zero values until a dedicated route is available.
 */
async function fetchTokenUsage(_userId: string): Promise<LLMUsage[]> {
  return [
    { provider: 'OpenAI', tokens: 0, cost: 0, limit: 0 },
    { provider: 'Anthropic', tokens: 0, cost: 0, limit: 0 },
    { provider: 'Google', tokens: 0, cost: 0, limit: 0 },
    { provider: 'Perplexity', tokens: 0, cost: 0, limit: 0 },
  ];
}

/**
 * Fetch user plan via /api/usage
 */
async function fetchUserPlan(_userId: string): Promise<UserPlanData> {
  const token = await getAuthToken();
  if (!token) {
    return {
      plan: 'free',
      subscriptionEndDate: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  }

  try {
    const res = await fetch('/api/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return {
        plan: 'free',
        subscriptionEndDate: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
    }
    const data = (await res.json()) as UsageApiResponse;
    // Map plan_tier to BillingPlan — hobby is a valid paid tier
    const planTier = (data.plan_tier ?? 'free').toLowerCase();
    // pro_plus is a legacy value; map it to max as the closest valid tier.
    const normalizedTier = planTier === 'pro_plus' ? 'max' : planTier;
    const plan: BillingPlan =
      normalizedTier === 'hobby' ||
      normalizedTier === 'pro' ||
      normalizedTier === 'max' ||
      normalizedTier === 'enterprise'
        ? (normalizedTier as BillingPlan)
        : 'free';
    return {
      plan,
      subscriptionEndDate: data.period_end ?? null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  } catch (err) {
    logger.error('[BillingQuery] fetchUserPlan error:', err);
    return {
      plan: 'free',
      subscriptionEndDate: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
  }
}

/**
 * Main billing data query hook
 * Fetches complete billing information including plan, usage, and token balance
 *
 * @returns UseQueryResult with BillingInfo data or null
 */
export function useBillingData(): UseQueryResult<BillingInfo | null, Error> {
  const { user } = useAuthStore();

  return useQuery<BillingInfo | null, Error>({
    queryKey: queryKeys.billing.plan(user?.id ?? ''),
    queryFn: async (): Promise<BillingInfo | null> => {
      if (!user?.id) return null;

      // Fetch all data in parallel
      const [tokenBalance, llmUsage, userPlan] = await Promise.all([
        fetchTokenBalance(user.id),
        fetchTokenUsage(user.id),
        fetchUserPlan(user.id),
      ]);

      const tierConfig = TIER_CONFIG[userPlan.plan] ?? TIER_CONFIG.free;
      const creditLimitCents = tierConfig.creditLimitCents;

      const totalCost = llmUsage.reduce((sum, llm) => sum + llm.cost, 0);
      const balance = Number.isFinite(tokenBalance.currentBalance)
        ? tokenBalance.currentBalance
        : 0;
      // Both creditLimitCents and balance are in cents — units match
      const totalUsed = Math.max(creditLimitCents - balance, 0);

      // Calculate billing period dates
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      return {
        plan: userPlan.plan,
        status: 'active',
        current_period_start: userPlan.subscriptionEndDate
          ? new Date(
              new Date(userPlan.subscriptionEndDate).getTime() - 30 * 24 * 60 * 60 * 1000,
            ).toISOString()
          : currentMonthStart.toISOString(),
        current_period_end: userPlan.subscriptionEndDate || nextMonthStart.toISOString(),
        price: tierConfig.price,
        currency: 'USD',
        features: tierConfig.features,
        stripeCustomerId: userPlan.stripeCustomerId,
        stripeSubscriptionId: userPlan.stripeSubscriptionId,
        usage: {
          totalTokens: totalUsed,
          totalLimit: creditLimitCents,
          totalCost,
          currentBalance: tokenBalance.currentBalance,
          llmUsage,
        },
      };
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes - billing data changes infrequently
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    meta: {
      errorMessage: 'Failed to load billing information',
    },
  });
}

/**
 * Token balance query hook
 * Fetches current token balance, total granted, and usage
 *
 * @returns UseQueryResult with TokenBalance data
 */
export function useTokenBalance(): UseQueryResult<TokenBalance, Error> {
  const { user } = useAuthStore();

  return useQuery<TokenBalance, Error>({
    queryKey: queryKeys.billing.tokenBalance(user?.id ?? ''),
    queryFn: (): Promise<TokenBalance> => fetchTokenBalance(user!.id),
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    meta: {
      errorMessage: 'Failed to load token balance',
    },
  });
}

/**
 * Token usage by provider query hook
 * Fetches token usage breakdown by LLM provider
 *
 * @returns UseQueryResult with array of LLMUsage
 */
export function useTokenUsageByProvider(): UseQueryResult<LLMUsage[], Error> {
  const { user } = useAuthStore();

  return useQuery<LLMUsage[], Error>({
    queryKey: queryKeys.billing.tokenUsage(user?.id ?? ''),
    queryFn: (): Promise<LLMUsage[]> => fetchTokenUsage(user!.id),
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    meta: {
      errorMessage: 'Failed to load token usage data',
    },
  });
}

/**
 * Token analytics query hook with time range support
 * Fetches detailed usage analytics with session breakdown and daily trends
 *
 * @param timeRange - Time range for analytics: '7d', '30d', '90d', or 'all'
 * @returns UseQueryResult with TokenAnalyticsData or null
 */
export function useTokenAnalytics(
  timeRange: AnalyticsTimeRange = '30d',
): UseQueryResult<TokenAnalyticsData | null, Error> {
  const { user } = useAuthStore();

  return useQuery<TokenAnalyticsData | null, Error>({
    queryKey: queryKeys.billing.analytics(user?.id ?? '', timeRange),
    // TODO: Add /api/usage/analytics endpoint for per-session token analytics with time range.
    queryFn: async (): Promise<TokenAnalyticsData | null> => {
      if (!user?.id) return null;
      // No analytics API route available yet — return empty structure.
      return {
        sessions: [],
        stats: {
          totalTokens: 0,
          totalCost: 0,
          avgTokensPerSession: 0,
          sessionsCount: 0,
          todayTokens: 0,
          todayCost: 0,
          weekTokens: 0,
          weekCost: 0,
          monthTokens: 0,
          monthCost: 0,
        },
        dailyUsage: [],
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    meta: {
      errorMessage: 'Failed to load token analytics',
    },
  });
}

/**
 * Invalidate all billing queries - useful after purchases
 * Returns a callback function to trigger invalidation
 *
 * @returns Callback function to invalidate all billing queries
 */
export function useInvalidateBillingQueries(): () => void {
  const queryClient: QueryClient = useQueryClient();
  const { user } = useAuthStore();

  return (): void => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all() });
    }
  };
}

// ============================================================================
// SUBSCRIPTION HOOKS
// ============================================================================

/**
 * Subscription data structure
 */
export interface Subscription {
  id: string;
  userId: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  priceId: string | null;
  quantity: number;
  metadata: Record<string, unknown>;
}

/**
 * Fetch subscription details
 *
 * @returns UseQueryResult with Subscription data or null
 */
export function useSubscription(): UseQueryResult<Subscription | null, Error> {
  const { user } = useAuthStore();

  return useQuery<Subscription | null, Error>({
    queryKey: queryKeys.billing.subscription(),
    queryFn: async (): Promise<Subscription | null> => {
      if (!user?.id) return null;

      const token = await getAuthToken();
      if (!token) return null;

      try {
        const res = await fetch('/api/usage', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          logger.warn('[useSubscription] /api/usage returned', res.status);
          return null;
        }
        const data = (await res.json()) as UsageApiResponse;
        const now = new Date();
        const periodEnd = data.period_end
          ? new Date(data.period_end)
          : new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const periodStart = new Date(periodEnd);
        periodStart.setMonth(periodStart.getMonth() - 1);
        const planTier = (data.plan_tier ?? 'free').toLowerCase();
        const normalizedTier = planTier === 'pro_plus' ? 'max' : planTier;
        const plan: BillingPlan =
          normalizedTier === 'hobby' ||
          normalizedTier === 'pro' ||
          normalizedTier === 'max' ||
          normalizedTier === 'enterprise'
            ? (normalizedTier as BillingPlan)
            : 'free';
        return {
          id: user.id,
          userId: user.id,
          plan,
          status: (data.subscription_status as SubscriptionStatus) || 'active',
          currentPeriodStart: periodStart.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialStart: null,
          trialEnd: null,
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          priceId: null,
          quantity: 1,
          metadata: {},
        };
      } catch (err) {
        logger.error('[useSubscription] error:', err);
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    meta: {
      errorMessage: 'Failed to load subscription details',
    },
  });
}

// ============================================================================
// INVOICE HOOKS
// ============================================================================

/**
 * Invoice data structure
 */
export interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
  dueDate: string | null;
  paidAt: string | null;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  lineItems: InvoiceLineItem[];
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  id: string;
  description: string;
  amount: number;
  quantity: number;
  period: {
    start: string;
    end: string;
  };
}

/**
 * Fetch user invoices
 *
 * @returns UseQueryResult with array of Invoice
 */
export function useInvoices(): UseQueryResult<Invoice[], Error> {
  const { user } = useAuthStore();

  return useQuery<Invoice[], Error>({
    queryKey: queryKeys.billing.invoices(),
    // TODO: Add /api/billing/invoices endpoint for invoice history.
    queryFn: async (): Promise<Invoice[]> => {
      if (!user?.id) return [];
      return [];
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load invoices',
    },
  });
}

// ============================================================================
// PAYMENT METHOD HOOKS
// ============================================================================

/**
 * Payment method data structure
 */
export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'paypal';
  isDefault: boolean;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingDetails: {
    name: string | null;
    email: string | null;
    address: {
      city: string | null;
      country: string | null;
      line1: string | null;
      line2: string | null;
      postalCode: string | null;
      state: string | null;
    };
  };
  createdAt: string;
}

/**
 * Fetch user payment methods
 *
 * @returns UseQueryResult with array of PaymentMethod
 */
export function usePaymentMethods(): UseQueryResult<PaymentMethod[], Error> {
  const { user } = useAuthStore();

  return useQuery<PaymentMethod[], Error>({
    queryKey: queryKeys.billing.paymentMethods(),
    // TODO: Add /api/billing/payment-methods endpoint for payment method management.
    queryFn: async (): Promise<PaymentMethod[]> => {
      if (!user?.id) return [];
      return [];
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load payment methods',
    },
  });
}

// ============================================================================
// TOKEN USAGE HISTORY HOOKS
// ============================================================================

/**
 * Token usage history record
 */
export interface TokenUsageHistoryRecord {
  id: string;
  userId: string;
  sessionId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  createdAt: string;
  metadata?: {
    sessionTitle?: string;
    messageId?: string;
    employeeId?: string;
  };
}

/**
 * Token usage history options
 */
export interface TokenUsageHistoryOptions {
  limit?: number;
  offset?: number;
  provider?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Fetch token usage history with pagination
 *
 * @param options - Query options for filtering and pagination
 * @returns UseQueryResult with array of TokenUsageHistoryRecord
 */
export function useTokenUsageHistory(
  options?: TokenUsageHistoryOptions,
): UseQueryResult<TokenUsageHistoryRecord[], Error> {
  const { user } = useAuthStore();
  const { limit = 50, offset = 0, provider, startDate, endDate } = options || {};
  // Query key includes filter params so React Query re-fetches when filters change.
  void limit;
  void offset;
  void provider;
  void startDate;
  void endDate;

  return useQuery<TokenUsageHistoryRecord[], Error>({
    queryKey: [
      ...queryKeys.billing.tokenUsage(user?.id ?? ''),
      'history',
      {
        limit,
        offset,
        provider,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      },
    ],
    // TODO: Add /api/usage/history endpoint for paginated token usage history.
    queryFn: async (): Promise<TokenUsageHistoryRecord[]> => {
      if (!user?.id) return [];
      return [];
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    meta: {
      errorMessage: 'Failed to load token usage history',
    },
  });
}

// ============================================================================
// BILLING ANALYTICS HOOKS
// ============================================================================

/**
 * Enhanced billing analytics data
 */
export interface BillingAnalyticsData {
  overview: {
    totalSpent: number;
    totalTokensUsed: number;
    avgCostPerDay: number;
    avgTokensPerDay: number;
    projectedMonthlySpend: number;
    savingsFromPlan: number;
  };
  trends: {
    date: string;
    tokens: number;
    cost: number;
    sessions: number;
  }[];
  providerBreakdown: {
    provider: string;
    tokens: number;
    cost: number;
    percentage: number;
    sessions: number;
  }[];
  topSessions: {
    sessionId: string;
    title: string;
    tokens: number;
    cost: number;
    provider: string;
    date: string;
  }[];
  periodComparison: {
    currentPeriod: {
      tokens: number;
      cost: number;
      sessions: number;
    };
    previousPeriod: {
      tokens: number;
      cost: number;
      sessions: number;
    };
    percentChange: {
      tokens: number;
      cost: number;
      sessions: number;
    };
  };
}

/**
 * Fetch enhanced billing analytics
 *
 * @param timeRange - Time range for analytics
 * @returns UseQueryResult with BillingAnalyticsData
 */
export function useBillingAnalytics(
  timeRange: AnalyticsTimeRange = '30d',
): UseQueryResult<BillingAnalyticsData | null, Error> {
  const { user } = useAuthStore();

  return useQuery<BillingAnalyticsData | null, Error>({
    queryKey: [...queryKeys.billing.analytics(user?.id ?? '', timeRange), 'enhanced'],
    // TODO: Add /api/usage/analytics endpoint for enhanced billing analytics.
    queryFn: async (): Promise<BillingAnalyticsData | null> => {
      if (!user?.id) return null;
      return null;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load billing analytics',
    },
  });
}

// ============================================================================
// SUBSCRIPTION MUTATION HOOKS
// ============================================================================

/**
 * Cancel subscription mutation
 *
 * @returns UseMutationResult for cancelling subscription
 */
export function useCancelSubscription(): UseMutationResult<void, Error, { atPeriodEnd?: boolean }> {
  const queryClient: QueryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation<void, Error, { atPeriodEnd?: boolean }>({
    mutationFn: async ({ atPeriodEnd = true }) => {
      if (!user?.id) {
        throw new Error('You must be logged in');
      }

      await PaymentAPI.cancelSubscription({
        cancel_at_period_end: atPeriodEnd,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription() });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.all() });
      toast.success('Subscription cancelled successfully');
    },
    onError: (error: Error) => {
      logger.error('Failed to cancel subscription:', error);
      toast.error(error.message || 'Failed to cancel subscription');
    },
  });
}

/**
 * Update payment method mutation
 *
 * @returns UseMutationResult for updating payment method
 */
export function useUpdatePaymentMethod(): UseMutationResult<
  void,
  Error,
  { paymentMethodId: string }
> {
  const queryClient: QueryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation<void, Error, { paymentMethodId: string }>({
    mutationFn: async ({ paymentMethodId }) => {
      if (!user?.id) {
        throw new Error('You must be logged in');
      }

      await PaymentAPI.setDefaultPaymentMethod(paymentMethodId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods() });
      toast.success('Payment method updated successfully');
    },
    onError: (error: Error) => {
      logger.error('Failed to update payment method:', error);
      toast.error(error.message || 'Failed to update payment method');
    },
  });
}
