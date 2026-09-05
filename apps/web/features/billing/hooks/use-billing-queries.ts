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
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  normalizeUsagePercentage,
  normalizeBillingPlanTier,
  isFreeBillingPlanTier,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { getBillingPlanDisplay } from '@features/billing/lib/plan-display';
import { isValidPlan, type PlanTier } from '@features/billing/components/Billing/types';

export type BillingPlan = PlanTier;

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'none';

export interface BillingInfo {
  plan: BillingPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  price: number | null;
  currency: string | null;
  features: string[];
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usage: BillingUsage;
}

export interface BillingUsage {
  usedPercent: number;
}

type UsageApiResponse = ManagedUsageSummaryResponse;

const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'canceled',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
  'none',
]);

function normalizeManagedBillingPlan(plan: string): BillingPlan {
  const legacyNormalized = plan === 'pro_plus' ? 'max' : plan === 'hobby' ? 'basic' : plan;
  const normalized = normalizeBillingPlanTier(legacyNormalized);
  return isValidPlan(normalized) ? normalized : 'free';
}

function normalizeSubscriptionStatus(status: string): SubscriptionStatus {
  const normalized = status.toLowerCase() === 'cancelled' ? 'canceled' : status.toLowerCase();
  return SUBSCRIPTION_STATUSES.has(normalized as SubscriptionStatus)
    ? (normalized as SubscriptionStatus)
    : 'none';
}

export function buildBillingInfoFromUsage(data: UsageApiResponse): BillingInfo {
  const plan = normalizeManagedBillingPlan(data.plan_tier);
  const usedPercent = normalizeUsagePercentage(data.usage_percentage);
  return {
    plan,
    status: normalizeSubscriptionStatus(data.subscription_status),
    current_period_start: data.period_start,
    current_period_end: data.period_end,
    price: isFreeBillingPlanTier(plan) ? 0 : null,
    currency: null,
    features: getBillingPlanDisplay(plan).features,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    usage: {
      usedPercent,
    },
  };
}

async function fetchUsageSummary(): Promise<UsageApiResponse | null> {
  const token = await getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/usage', {
      headers: { Authorization: `Bearer ${token}` },
      // The upgrade flow polls this within seconds of the previous read, waiting
      // for a webhook to move plan_tier. A cache hit there returns the plan the
      // user just paid to leave.
      cache: 'no-store',
    });
    if (!res.ok) {
      logger.warn('[BillingQuery] /api/usage returned', res.status);
      return null;
    }
    return (await res.json()) as UsageApiResponse;
  } catch (err) {
    logger.error('[BillingQuery] fetchUsageSummary error:', err);
    return null;
  }
}

/**
 * Main billing data query hook
 * Fetches complete billing information including plan and managed-usage status.
 *
 * @returns UseQueryResult with BillingInfo data or null
 */
export function useBillingData(): UseQueryResult<BillingInfo | null, Error> {
  const { user } = useAuthStore();

  return useQuery<BillingInfo | null, Error>({
    queryKey: queryKeys.billing.plan(user?.id ?? ''),
    queryFn: async (): Promise<BillingInfo | null> => {
      if (!user?.id) return null;

      const usage = await fetchUsageSummary();
      return usage ? buildBillingInfoFromUsage(usage) : null;
    },
    enabled: !!user?.id,
    // Zero, not "billing changes infrequently". Every upgrade path that leaves
    // the app, 3DS authentication, the Stripe portal, Checkout, returns within
    // seconds, and refetchOnWindowFocus does nothing while the data is still
    // fresh. A stale window here renders the plan the user just paid to leave.
    // gcTime is kept so the cached plan still paints instantly while it
    // revalidates.
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    meta: {
      errorMessage: 'Failed to load billing information',
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

export interface Subscription {
  id: string;
  userId: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
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
        const plan = normalizeManagedBillingPlan(data.plan_tier);
        return {
          id: user.id,
          userId: user.id,
          plan,
          status: normalizeSubscriptionStatus(data.subscription_status),
          currentPeriodStart: data.period_start,
          currentPeriodEnd: data.period_end,
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

interface InvoiceApiResponse {
  invoices?: Array<{
    id: string;
    number: string;
    status: string;
    amount: number;
    currency: string;
    description: string;
    created_at: string;
    due_date: string | null;
    paid_at: string | null;
    invoice_pdf: string | null;
    hosted_invoice_url: string | null;
    line_items: Array<{
      id: string;
      description: string;
      amount: number;
      quantity: number;
      period: { start: string; end: string };
    }>;
  }>;
}

/**
 * Fetch user invoices via /api/billing/invoices (the same real, Stripe-backed
 * route BillingSection.tsx already uses, this hook previously returned a
 * hardcoded [], which desynced the standalone /billing page from Settings →
 * Billing's real invoice history).
 *
 * @returns UseQueryResult with array of Invoice
 */
export function useInvoices(): UseQueryResult<Invoice[], Error> {
  const { user } = useAuthStore();

  return useQuery<Invoice[], Error>({
    queryKey: queryKeys.billing.invoices(),
    queryFn: async (): Promise<Invoice[]> => {
      if (!user?.id) return [];
      try {
        const res = await fetch('/api/billing/invoices', { credentials: 'include' });
        if (!res.ok) {
          logger.warn('[BillingQuery] /api/billing/invoices returned', res.status);
          return [];
        }
        const json = (await res.json()) as InvoiceApiResponse;
        return (json.invoices ?? []).map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status as Invoice['status'],
          amount: inv.amount,
          currency: inv.currency,
          description: inv.description,
          createdAt: inv.created_at,
          dueDate: inv.due_date,
          paidAt: inv.paid_at,
          invoicePdf: inv.invoice_pdf,
          hostedInvoiceUrl: inv.hosted_invoice_url,
          lineItems: inv.line_items ?? [],
        }));
      } catch (err) {
        logger.error('[BillingQuery] fetchInvoices error:', err);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load invoices',
    },
  });
}

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

interface PaymentMethodApiResponse {
  payment_methods?: Array<{
    id: string;
    type: string;
    is_default: boolean;
    card?: { brand: string; last4: string; exp_month: number; exp_year: number };
    billing_details: {
      name: string | null;
      email: string | null;
      address: {
        city: string | null;
        country: string | null;
        line1: string | null;
        line2: string | null;
        postal_code: string | null;
        state: string | null;
      };
    };
    created_at: string;
  }>;
}

/**
 * Fetch user payment methods via /api/billing/payment-methods (the same
 * real, Stripe-backed route BillingSection.tsx already uses, this hook
 * previously returned a hardcoded [], which desynced the standalone /billing
 * page from Settings → Billing's real payment-method list).
 *
 * @returns UseQueryResult with array of PaymentMethod
 */
export function usePaymentMethods(): UseQueryResult<PaymentMethod[], Error> {
  const { user } = useAuthStore();

  return useQuery<PaymentMethod[], Error>({
    queryKey: queryKeys.billing.paymentMethods(),
    queryFn: async (): Promise<PaymentMethod[]> => {
      if (!user?.id) return [];
      try {
        const res = await fetch('/api/billing/payment-methods', { credentials: 'include' });
        if (!res.ok) {
          logger.warn('[BillingQuery] /api/billing/payment-methods returned', res.status);
          return [];
        }
        const json = (await res.json()) as PaymentMethodApiResponse;
        return (json.payment_methods ?? []).map((pm) => ({
          id: pm.id,
          type: pm.type as PaymentMethod['type'],
          isDefault: pm.is_default,
          card: pm.card
            ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                expMonth: pm.card.exp_month,
                expYear: pm.card.exp_year,
              }
            : undefined,
          billingDetails: {
            name: pm.billing_details.name,
            email: pm.billing_details.email,
            address: {
              city: pm.billing_details.address.city,
              country: pm.billing_details.address.country,
              line1: pm.billing_details.address.line1,
              line2: pm.billing_details.address.line2,
              postalCode: pm.billing_details.address.postal_code,
              state: pm.billing_details.address.state,
            },
          },
          createdAt: pm.created_at,
        }));
      } catch (err) {
        logger.error('[BillingQuery] fetchPaymentMethods error:', err);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    meta: {
      errorMessage: 'Failed to load payment methods',
    },
  });
}
export function useUpdatePaymentMethod(): UseMutationResult<
  void,
  Error,
  { paymentMethodId: string }
> {
  const { user } = useAuthStore();

  return useMutation<void, Error, { paymentMethodId: string }>({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error('You must be logged in');
      }

      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/portal', {
        method: 'POST',
        headers: await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to open billing portal');
      }

      const { url } = (await response.json()) as { url: string };
      window.location.href = url;
    },
    onError: (error: Error) => {
      logger.error('Failed to open billing portal for payment method update:', error);
      toast.error(error.message || 'Failed to open billing portal');
    },
  });
}
